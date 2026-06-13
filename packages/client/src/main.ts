/// <reference types="vite/client" />
import {
  applyCommand,
  beginTurn,
  cityAt,
  computeAttackTargets,
  computeReachable,
  computeVisible,
  createGame,
  currentPlayer,
  unitAt,
  type GameState,
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

const canvas = document.getElementById("game") as HTMLCanvasElement;
const ctx = canvas.getContext("2d");
if (!ctx) throw new Error("2D canvas context unavailable");

const params = new URLSearchParams(location.search);
const seed = params.get("seed") ?? "rise-m2";
const cols = clampInt(params.get("cols"), 48, 16, 160);
const rows = clampInt(params.get("rows"), 32, 16, 160);

const state: GameState = createGame({ seed, cols, rows });
beginTurn(state); // start player 0's first turn

const camera = new Camera();
let dpr = 1;
let cssWidth = 0;
let cssHeight = 0;
let needsRedraw = true;

let selectedUnitId: number | null = null;
let selectedCityId: number | null = null;
let reachable = new Set<string>();
let attackTargets = new Set<string>();
let visible = computeVisible(state, currentPlayer(state).id);

function refreshVisible(): void {
  visible = computeVisible(state, currentPlayer(state).id);
}

function recomputeUnitOverlays(): void {
  const u = selectedUnitId != null ? state.units.get(selectedUnitId) : undefined;
  if (!u) {
    reachable = new Set();
    attackTargets = new Set();
    return;
  }
  reachable = new Set(computeReachable(state, u).keys());
  attackTargets = computeAttackTargets(state, u);
}

function selectUnit(id: number): void {
  selectedUnitId = id;
  selectedCityId = null;
  recomputeUnitOverlays();
}

function clearSelection(): void {
  selectedUnitId = null;
  selectedCityId = null;
  reachable = new Set();
  attackTargets = new Set();
}

const ui = createUI({
  onEndTurn: () => {
    applyCommand(state, { type: "endTurn" });
    clearSelection();
    refreshVisible();
    const p = currentPlayer(state);
    ui.banner(`${p.name} — Turn ${state.turn}`);
    requestRender();
  },
  onFoundCity: () => {
    if (selectedUnitId == null) return;
    const res = applyCommand(state, { type: "foundCity", unitId: selectedUnitId });
    if (res.ok) {
      clearSelection();
      refreshVisible();
    } else ui.banner(res.error ?? "cannot found city");
    requestRender();
  },
  onBuild: (kind) => {
    if (selectedUnitId == null) return;
    const res = applyCommand(state, { type: "build", unitId: selectedUnitId, improvement: kind });
    if (!res.ok) ui.banner(res.error ?? "cannot build");
    if (!state.units.has(selectedUnitId)) clearSelection();
    else recomputeUnitOverlays();
    refreshVisible();
    requestRender();
  },
  onPromote: (promotion) => {
    if (selectedUnitId == null) return;
    const res = applyCommand(state, { type: "promote", unitId: selectedUnitId, promotion });
    if (!res.ok) ui.banner(res.error ?? "cannot promote");
    requestRender();
  },
  onSetProduction: (item) => {
    if (selectedCityId == null) return;
    applyCommand(state, { type: "setProduction", cityId: selectedCityId, item });
    requestRender();
  },
  onSetResearch: (techId) => {
    applyCommand(state, { type: "setResearch", techId });
    requestRender();
  },
  onCloseCity: () => {
    selectedCityId = null;
    requestRender();
  },
});

function handleTap(sx: number, sy: number): void {
  const off = screenToTile(camera, state.map, sx, sy);
  if (!off) {
    clearSelection();
    requestRender();
    return;
  }
  const me = currentPlayer(state).id;
  const key = `${off.col},${off.row}`;
  const u = unitAt(state, off.col, off.row);

  if (u && u.ownerId === me) {
    selectUnit(u.id);
  } else if (selectedUnitId != null && attackTargets.has(key)) {
    const res = applyCommand(state, { type: "attack", attackerId: selectedUnitId, col: off.col, row: off.row });
    if (!res.ok) ui.banner(res.error ?? "cannot attack");
    if (!state.units.has(selectedUnitId)) clearSelection();
    else recomputeUnitOverlays();
    refreshVisible();
  } else if (selectedUnitId != null && reachable.has(key)) {
    applyCommand(state, { type: "move", unitId: selectedUnitId, col: off.col, row: off.row });
    recomputeUnitOverlays();
    refreshVisible();
  } else {
    const c = cityAt(state, off.col, off.row);
    if (c && c.ownerId === me) {
      selectedCityId = c.id;
      selectedUnitId = null;
      reachable = new Set();
      attackTargets = new Set();
    } else {
      clearSelection();
    }
  }
  requestRender();
}

attachInput(canvas, camera, {
  onChange: requestRender,
  onHover: () => {},
  onHoverEnd: () => {},
  onTap: handleTap,
});

window.addEventListener("resize", () => {
  resize();
  requestRender();
});

function requestRender(): void {
  needsRedraw = true;
}

function resize(): void {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  cssWidth = canvas.clientWidth;
  cssHeight = canvas.clientHeight;
  canvas.width = Math.round(cssWidth * dpr);
  canvas.height = Math.round(cssHeight * dpr);
  needsRedraw = true;
}

function frame(): void {
  if (needsRedraw) {
    needsRedraw = false;
    const me = currentPlayer(state);
    drawScene(ctx!, state.map, camera, {
      dpr,
      cssWidth,
      cssHeight,
      fog: { visible, explored: me.explored },
    });
    drawOverlay(ctx!, camera, state, {
      viewingPlayerId: me.id,
      visible,
      selectedUnitId,
      selectedCityId,
      reachable,
      attackTargets,
    });
    ui.render({
      state,
      selectedUnit: selectedUnitId != null ? state.units.get(selectedUnitId) ?? null : null,
      selectedCity: selectedCityId != null ? state.cities.get(selectedCityId) ?? null : null,
    });
  }
  requestAnimationFrame(frame);
}

resize();
camera.fitToView(computeWorldBounds(state.map), cssWidth, cssHeight, BASE_SIZE * 2);
ui.banner(`${currentPlayer(state).name} — Turn ${state.turn}`);
requestAnimationFrame(frame);

if (import.meta.env.DEV) {
  (window as unknown as { __roc: unknown }).__roc = {
    get state() {
      return state;
    },
    tapTile(col: number, row: number) {
      const c = tileCenterWorld(col, row);
      handleTap(camera.worldToScreenX(c.x), camera.worldToScreenY(c.y));
    },
  };
}

function clampInt(raw: string | null, fallback: number, min: number, max: number): number {
  const n = raw == null ? NaN : parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}
