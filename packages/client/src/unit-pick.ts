import type { GameState, Unit } from "@roc/sim";
import { Camera } from "./camera";
import { BASE_SIZE, tileCenterWorld } from "./renderer";

/** Matches overlay unit draw scale (`isMobileScreen()` is always true there). */
const UNIT_SCALE = 1.35;

function pointInRect(sx: number, sy: number, left: number, top: number, width: number, height: number): boolean {
  return sx >= left && sx <= left + width && sy >= top && sy <= top + height;
}

/** Screen-space bounds for a unit sprite plus its name label (for hit-testing). */
export function unitScreenBounds(
  camera: Camera,
  col: number,
  row: number,
): { left: number; top: number; width: number; height: number; cx: number; cy: number } {
  const size = BASE_SIZE * camera.zoom;
  const half = size * 0.42 * UNIT_SCALE;
  const imgSize = half * 1.8;
  const c = tileCenterWorld(col, row);
  const cx = camera.worldToScreenX(c.x);
  const cy = camera.worldToScreenY(c.y);
  const fontSize = Math.max(8, Math.round(size * 0.32 * UNIT_SCALE));
  const pad = Math.max(2, size * 0.06);
  const dotR = Math.max(2, size * 0.08);
  const labelH = Math.max(fontSize + pad * 2, dotR * 2 + pad * 2);
  const imgY = cy - imgSize / 2;
  const top = imgY - labelH - pad;
  const left = cx - imgSize / 2;
  const bottomPad = size * 0.12;
  return { left, top, width: imgSize, height: cy + imgSize / 2 + bottomPad - top, cx, cy };
}

/** Pick the visible unit whose drawn sprite is under the cursor. */
export function pickUnitAtScreen(
  state: GameState,
  camera: Camera,
  sx: number,
  sy: number,
  visible: Set<string>,
  viewingPlayerId: number,
): Unit | undefined {
  let best: { unit: Unit; dist: number } | undefined;

  for (const unit of state.units.values()) {
    if (unit.aboardShipId !== undefined) continue;
    if (unit.escortingRouteId !== undefined) continue;
    const own = unit.ownerId === viewingPlayerId;
    if (!own && !visible.has(`${unit.col},${unit.row}`)) continue;

    const sprite = unitScreenBounds(camera, unit.col, unit.row);
    if (!pointInRect(sx, sy, sprite.left, sprite.top, sprite.width, sprite.height)) continue;

    const dist = Math.hypot(sx - sprite.cx, sy - sprite.cy);
    if (!best || dist < best.dist) best = { unit, dist };
  }

  return best?.unit;
}
