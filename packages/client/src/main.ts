/// <reference types="vite/client" />
import {
  availableCivics,
  availableTechs,
  canFoundReligion,
  cityAt,
  citiesOf,
  combatPreview,
  computeAttackTargets,
  computeReachable,
  unitAt,
  unitsOf,
  workableTiles,
  UNIT_DEFS,
} from "@roc/sim";
import { Camera } from "./camera";
import {
  computeWorldBounds,
  drawScene,
  screenToTile,
  tileCenterWorld,
  BASE_SIZE,
} from "./renderer";
import { drawOverlay } from "./overlay";
import { attachInput } from "./input";
import { createUI, type CombatOdds } from "./ui";
import { createMinimap } from "./minimap";
import { createLobby } from "./lobby-ui";
import { loadTerrainAtlas } from "./terrain-assets";
import { loadUnitAtlas } from "./unit-assets";
import type { Session } from "./session";

const canvas = document.getElementById("game") as HTMLCanvasElement;
const ctx = canvas.getContext("2d");
if (!ctx) throw new Error("2D canvas context unavailable");

createLobby(startGame);

function startGame(session: Session): void {
  const camera = new Camera();
  let dpr = 1;
  let cssWidth = 0;
  let cssHeight = 0;
  let needsRedraw = true;
  let fitted = false;

  let selectedUnitId: number | null = null;
  let selectedCityId: number | null = null;
  let reachable = new Set<string>();
  let attackTargets = new Set<string>();
  let cityWorkable = new Set<string>();
  let visible = new Set<string>();
  let gameOverShown = false;
  let hoverOdds: CombatOdds | null = null;
  let idleCycle = 0;

  const st = () => session.getState();
  const minimap = createMinimap((col, row) => {
    const c = tileCenterWorld(col, row);
    camera.offsetX = cssWidth / 2 - c.x * camera.zoom;
    camera.offsetY = cssHeight / 2 - c.y * camera.zoom;
    needsRedraw = true;
  });

  function recomputeOverlays(): void {
    const u = selectedUnitId != null ? st().units.get(selectedUnitId) : undefined;
    if (!u) {
      reachable = new Set();
      attackTargets = new Set();
      return;
    }
    reachable = new Set(computeReachable(st(), u).keys());
    attackTargets = computeAttackTargets(st(), u);
  }

  function update(): void {
    if (!session.hasState()) return;
    visible = session.getVisible();
    // Drop selection if the unit no longer exists (died/consumed/captured).
    if (selectedUnitId != null && !st().units.has(selectedUnitId)) selectedUnitId = null;
    if (selectedCityId != null) {
      const city = st().cities.get(selectedCityId);
      cityWorkable = city ? new Set(workableTiles(st(), city).map((t) => `${t.col},${t.row}`)) : new Set();
    }
    recomputeOverlays();
    if (!fitted) {
      camera.fitToView(computeWorldBounds(st().map), cssWidth, cssHeight, BASE_SIZE * 2);
      fitted = true;
    }
    const over = st().gameOver;
    if (over && !gameOverShown) {
      gameOverShown = true;
      const winner = st().players.find((p) => p.id === over.winnerId);
      ui.banner(`🏆 ${winner?.name ?? "Someone"} wins by ${over.condition}!`);
    }
    needsRedraw = true;
  }
  session.onUpdate(update);

  function selectUnit(id: number): void {
    selectedUnitId = id;
    selectedCityId = null;
    recomputeOverlays();
    needsRedraw = true;
  }
  function selectCity(id: number): void {
    selectedCityId = id;
    selectedUnitId = null;
    reachable = new Set();
    attackTargets = new Set();
    const city = st().cities.get(id);
    cityWorkable = city ? new Set(workableTiles(st(), city).map((t) => `${t.col},${t.row}`)) : new Set();
    needsRedraw = true;
  }
  function clearSelection(): void {
    selectedUnitId = null;
    selectedCityId = null;
    reachable = new Set();
    attackTargets = new Set();
    cityWorkable = new Set();
    hoverOdds = null;
    needsRedraw = true;
  }

  const ui = createUI({
    onEndTurn: () => {
      session.endTurn();
      clearSelection();
      if (session.isOnline) ui.banner(`Turn submitted — waiting for opponents…`);
      else ui.banner(`${st().players[st().currentPlayerIndex]!.name} — Turn ${st().turn}`);
    },
    onFoundCity: () => {
      if (selectedUnitId != null) session.order({ type: "foundCity", unitId: selectedUnitId });
      clearSelection();
    },
    onBuild: (kind) => {
      if (selectedUnitId != null) session.order({ type: "build", unitId: selectedUnitId, improvement: kind });
    },
    onPromote: (promotion) => {
      if (selectedUnitId != null) session.order({ type: "promote", unitId: selectedUnitId, promotion });
    },
    onSetProduction: (item) => {
      if (selectedCityId != null) session.order({ type: "setProduction", cityId: selectedCityId, item });
    },
    onSetResearch: (techId) => session.order({ type: "setResearch", techId }),
    onSetCivic: (civicId) => session.order({ type: "setCivic", civicId }),
    onSetGovernment: (governmentId) => session.order({ type: "setGovernment", governmentId }),
    onTogglePolicy: (policyId) => session.order({ type: "togglePolicy", policyId }),
    onFoundReligion: (cityId, name, beliefs) => session.order({ type: "foundReligion", cityId, name, beliefs }),
    onCloseCity: () => {
      clearSelection();
    },
    onSuggestion: () => actOnSuggestion(),
  });

  type Suggestion = { kind: "units" | "research" | "civic" | "religion" | "production"; label: string } | null;
  function computeSuggestion(): Suggestion {
    const me = session.getViewerId();
    const idle = unitsOf(st(), me).filter((u) => u.movementLeft > 0);
    if (idle.length > 0) return { kind: "units", label: `⮕ Next Unit (${idle.length})` };
    const player = st().players.find((p) => p.id === me);
    if (player && player.researching == null && availableTechs(player).length > 0) {
      return { kind: "research", label: "🔬 Choose Research" };
    }
    if (player && player.researchingCivic == null && availableCivics(player).length > 0) {
      return { kind: "civic", label: "🎭 Choose Civic" };
    }
    if (canFoundReligion(st(), me)) {
      return { kind: "religion", label: "☮️ Found Religion" };
    }
    const noProd = citiesOf(st(), me).filter((c) => c.production == null);
    if (noProd.length > 0) return { kind: "production", label: `⚒️ Set Production (${noProd.length})` };
    return null;
  }
  function centerOn(col: number, row: number): void {
    const c = tileCenterWorld(col, row);
    camera.offsetX = cssWidth / 2 - c.x * camera.zoom;
    camera.offsetY = cssHeight / 2 - c.y * camera.zoom;
  }
  function actOnSuggestion(): void {
    const s = computeSuggestion();
    if (!s) return session.endTurn();
    const me = session.getViewerId();
    if (s.kind === "units") {
      const idle = unitsOf(st(), me).filter((u) => u.movementLeft > 0).sort((a, b) => a.id - b.id);
      if (idle.length === 0) return;
      const u = idle[idleCycle++ % idle.length]!;
      selectUnit(u.id);
      centerOn(u.col, u.row);
    } else if (s.kind === "research") {
      ui.openResearch();
    } else if (s.kind === "civic") {
      ui.openCivics();
    } else if (s.kind === "religion") {
      ui.openReligion();
    } else {
      const city = citiesOf(st(), me).find((c) => c.production == null);
      if (city) {
        selectCity(city.id);
        centerOn(city.col, city.row);
      }
    }
    needsRedraw = true;
  }

  function handleTap(sx: number, sy: number): void {
    const off = screenToTile(camera, st().map, sx, sy);
    if (!off) return clearSelection();
    const me = session.getViewerId();
    const key = `${off.col},${off.row}`;
    const u = unitAt(st(), off.col, off.row);
    const c = cityAt(st(), off.col, off.row);

    // Citizen assignment: with a city selected, tapping a workable tile toggles it.
    if (selectedCityId != null && cityWorkable.has(key)) {
      session.order({ type: "assignCitizen", cityId: selectedCityId, col: off.col, row: off.row });
      return;
    }

    if (u && u.ownerId === me) {
      // Tap an already-selected unit that shares a tile with our city -> select the city.
      if (selectedUnitId === u.id && c && c.ownerId === me) selectCity(c.id);
      else selectUnit(u.id);
    } else if (selectedUnitId != null && attackTargets.has(key)) {
      session.order({ type: "attack", attackerId: selectedUnitId, col: off.col, row: off.row });
    } else if (selectedUnitId != null && reachable.has(key)) {
      session.order({ type: "move", unitId: selectedUnitId, col: off.col, row: off.row });
    } else if (c && c.ownerId === me) {
      selectCity(c.id);
    } else {
      clearSelection();
    }
  }

  function onHover(sx: number, sy: number): void {
    let next: CombatOdds | null = null;
    if (selectedUnitId != null) {
      const off = screenToTile(camera, st().map, sx, sy);
      if (off && attackTargets.has(`${off.col},${off.row}`)) {
        const u = st().units.get(selectedUnitId);
        const prev = u ? combatPreview(st(), u, off.col, off.row) : null;
        if (prev) {
          const city = cityAt(st(), off.col, off.row);
          const enemy = unitAt(st(), off.col, off.row);
          next = {
            targetName: city ? city.name : enemy ? UNIT_DEFS[enemy.type].name : "target",
            toDefender: prev.toDefender,
            toAttacker: prev.toAttacker,
            vsCity: prev.vsCity,
          };
        }
      }
    }
    if (next?.targetName !== hoverOdds?.targetName || next?.toDefender !== hoverOdds?.toDefender) {
      hoverOdds = next;
      needsRedraw = true;
    }
  }

  attachInput(canvas, camera, {
    onChange: () => (needsRedraw = true),
    onHover,
    onHoverEnd: () => {
      if (hoverOdds) {
        hoverOdds = null;
        needsRedraw = true;
      }
    },
    onTap: handleTap,
  });

  function resize(): void {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    cssWidth = canvas.clientWidth;
    cssHeight = canvas.clientHeight;
    canvas.width = Math.round(cssWidth * dpr);
    canvas.height = Math.round(cssHeight * dpr);
    needsRedraw = true;
  }
  window.addEventListener("resize", () => {
    resize();
    needsRedraw = true;
  });

  const terrainAtlas = loadTerrainAtlas(() => {
    needsRedraw = true;
  });
  const unitAtlas = loadUnitAtlas(() => {
    needsRedraw = true;
  });

  function frame(): void {
    if (needsRedraw && session.hasState()) {
      needsRedraw = false;
      const me = session.getViewerId();
      const explored = st().players.find((p) => p.id === me)?.explored ?? new Set<string>();
      drawScene(ctx!, st().map, camera, {
        dpr,
        cssWidth,
        cssHeight,
        fog: { visible, explored },
        terrainAtlas,
      });
      const selCity = selectedCityId != null ? st().cities.get(selectedCityId) ?? null : null;
      drawOverlay(ctx!, camera, st(), {
        viewingPlayerId: me,
        visible,
        explored,
        selectedUnitId,
        selectedCityId,
        reachable,
        attackTargets,
        cityWorkable,
        cityWorked: selCity ? new Set(selCity.workedTiles) : new Set(),
        unitAtlas,
      });
      minimap.draw(st(), me, explored, visible, camera, cssWidth, cssHeight);
      ui.render({
        state: st(),
        selectedUnit: selectedUnitId != null ? st().units.get(selectedUnitId) ?? null : null,
        selectedCity: selCity,
        odds: hoverOdds,
        suggestion: computeSuggestion(),
      });
    }
    requestAnimationFrame(frame);
  }

  resize();
  update();
  if (session.hasState()) {
    ui.banner(`${st().players[st().currentPlayerIndex]?.name ?? "Player"} — Turn ${st().turn}`);
  }
  requestAnimationFrame(frame);

  if (import.meta.env.DEV) {
    (window as unknown as { __roc: unknown }).__roc = {
      get session() {
        return session;
      },
      get state() {
        return session.hasState() ? st() : null;
      },
      tapTile(col: number, row: number) {
        const c = tileCenterWorld(col, row);
        handleTap(camera.worldToScreenX(c.x), camera.worldToScreenY(c.y));
      },
      hoverTile(col: number, row: number) {
        const c = tileCenterWorld(col, row);
        onHover(camera.worldToScreenX(c.x), camera.worldToScreenY(c.y));
      },
    };
  }
}
