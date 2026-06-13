/// <reference types="vite/client" />
import {
  cityAt,
  computeAttackTargets,
  computeReachable,
  unitAt,
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
import { createUI } from "./ui";
import { createLobby } from "./lobby-ui";
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
  let visible = new Set<string>();
  let gameOverShown = false;

  const st = () => session.getState();

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
  function clearSelection(): void {
    selectedUnitId = null;
    selectedCityId = null;
    reachable = new Set();
    attackTargets = new Set();
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
    onCloseCity: () => {
      selectedCityId = null;
      needsRedraw = true;
    },
  });

  function handleTap(sx: number, sy: number): void {
    const off = screenToTile(camera, st().map, sx, sy);
    if (!off) return clearSelection();
    const me = session.getViewerId();
    const key = `${off.col},${off.row}`;
    const u = unitAt(st(), off.col, off.row);

    if (u && u.ownerId === me) {
      selectUnit(u.id);
    } else if (selectedUnitId != null && attackTargets.has(key)) {
      session.order({ type: "attack", attackerId: selectedUnitId, col: off.col, row: off.row });
    } else if (selectedUnitId != null && reachable.has(key)) {
      session.order({ type: "move", unitId: selectedUnitId, col: off.col, row: off.row });
    } else {
      const c = cityAt(st(), off.col, off.row);
      if (c && c.ownerId === me) {
        selectedCityId = c.id;
        selectedUnitId = null;
        reachable = new Set();
        attackTargets = new Set();
        needsRedraw = true;
      } else clearSelection();
    }
  }

  attachInput(canvas, camera, {
    onChange: () => (needsRedraw = true),
    onHover: () => {},
    onHoverEnd: () => {},
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

  function frame(): void {
    if (needsRedraw && session.hasState()) {
      needsRedraw = false;
      const me = session.getViewerId();
      const explored = st().players.find((p) => p.id === me)?.explored ?? new Set<string>();
      drawScene(ctx!, st().map, camera, { dpr, cssWidth, cssHeight, fog: { visible, explored } });
      drawOverlay(ctx!, camera, st(), {
        viewingPlayerId: me,
        visible,
        explored,
        selectedUnitId,
        selectedCityId,
        reachable,
        attackTargets,
      });
      ui.render({
        state: st(),
        selectedUnit: selectedUnitId != null ? st().units.get(selectedUnitId) ?? null : null,
        selectedCity: selectedCityId != null ? st().cities.get(selectedCityId) ?? null : null,
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
    };
  }
}
