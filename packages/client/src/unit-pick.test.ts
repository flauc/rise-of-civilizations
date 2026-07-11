import { describe, it, expect } from "vitest";
import { createGame, beginTurn, unitAt } from "@roc/sim";
import { Camera } from "./camera";
import { pointInTileHex, screenToTile, tileCenterWorld } from "./renderer";
import { pickUnitAtScreen, unitScreenBounds } from "./unit-pick";

describe("map picking", () => {
  it("maps clicks to the hex under the cursor", () => {
    const state = createGame({ seed: "pick-hex", cols: 20, rows: 14, humanSlots: 1, playerCount: 1, barbarians: false });
    beginTurn(state);
    const col = 8;
    const row = 6;
    const camera = new Camera();
    camera.zoom = 1.2;
    const c = tileCenterWorld(col, row);
    camera.offsetX = 240 - c.x * camera.zoom;
    camera.offsetY = 320 - c.y * camera.zoom;

    const cx = camera.worldToScreenX(c.x);
    const cy = camera.worldToScreenY(c.y);
    expect(pointInTileHex(camera, col, row, cx, cy)).toBe(true);
    const off = screenToTile(camera, state.map, cx, cy);
    expect(off).toEqual({ col, row });
  });

  it("selects a unit when tapping its sprite", () => {
    const state = createGame({ seed: "pick-unit-sprite", cols: 20, rows: 14, humanSlots: 1, playerCount: 1, barbarians: false });
    beginTurn(state);
    const viewerId = state.players[0]!.id;
    const unit = [...state.units.values()].find((u) => u.ownerId === viewerId && u.type !== "settler")!;
    const camera = new Camera();
    camera.zoom = 1.4;
    const c = tileCenterWorld(unit.col, unit.row);
    camera.offsetX = 220 - c.x * camera.zoom;
    camera.offsetY = 360 - c.y * camera.zoom;

    const sprite = unitScreenBounds(camera, unit.col, unit.row);
    const click = { x: sprite.cx, y: sprite.cy };
    const picked = pickUnitAtScreen(state, camera, click.x, click.y, new Set([`${unit.col},${unit.row}`]), viewerId);
    expect(picked?.id).toBe(unit.id);
    expect(unitAt(state, unit.col, unit.row)?.id).toBe(unit.id);
  });

  it("selects a unit on a hex tap even when the sprite is missed", () => {
    const state = createGame({ seed: "pick-unit-hex", cols: 20, rows: 14, humanSlots: 1, playerCount: 1, barbarians: false });
    beginTurn(state);
    const viewerId = state.players[0]!.id;
    const unit = [...state.units.values()].find((u) => u.ownerId === viewerId && u.type === "warrior")!;
    const camera = new Camera();
    camera.zoom = 1.2;
    const c = tileCenterWorld(unit.col, unit.row);
    camera.offsetX = 200 - c.x * camera.zoom;
    camera.offsetY = 300 - c.y * camera.zoom;
    const cx = camera.worldToScreenX(c.x);
    const cy = camera.worldToScreenY(c.y);
    const off = screenToTile(camera, state.map, cx, cy);
    expect(off).toEqual({ col: unit.col, row: unit.row });
    expect(unitAt(state, off!.col, off!.row)?.id).toBe(unit.id);
  });
});
