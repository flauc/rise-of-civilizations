import { describe, expect, it } from "vitest";
import { createGame } from "@roc/sim";
import { Camera } from "./camera";
import { tileCenterWorld } from "./renderer";
import { MapLayerCache } from "./map-layer-cache";

/** Screen X for a world point when the terrain cache is blitted (must match units). */
function cachedTerrainScreenX(wx: number, originX: number, camera: Camera): number {
  const px = wx - originX;
  return camera.offsetX + originX * camera.zoom + px * camera.zoom;
}

describe("MapLayerCache", () => {
  it("caches small tutorial-sized maps at gameplay zoom", () => {
    const state = createGame({
      seed: "cache-test",
      cols: 36,
      rows: 24,
      playerCount: 1,
      humanSlots: 1,
      playerNames: ["Rome"],
    });
    const cache = new MapLayerCache();
    expect(cache.canUse(state)).toBe(true);
    expect(cache.buildZoomLevel).toBe(2);
  });

  it("bakes at higher resolution on HiDPI displays (still capped by canvas size)", () => {
    const state = createGame({
      seed: "cache-test",
      cols: 36,
      rows: 24,
      playerCount: 1,
      humanSlots: 1,
      playerNames: ["Rome"],
    });
    const cache = new MapLayerCache();
    expect(cache.canUse(state, 2)).toBe(true);
    expect(cache.buildZoomLevel).toBeGreaterThan(2);
    expect(cache.buildZoomLevel).toBeLessThanOrEqual(4);
  });

  it("blit aligns cache pixels with live world-to-screen", () => {
    const state = createGame({ seed: "align", cols: 24, rows: 16, playerCount: 1 });
    const tile = state.map.tiles[Math.floor(state.map.tiles.length / 2)]!;
    const originX = 12.5;
    const camera = new Camera();
    camera.zoom = 2.2;
    camera.offsetX = 400;
    camera.offsetY = 300;
    const wx = tileCenterWorld(tile.col, tile.row).x;
    expect(cachedTerrainScreenX(wx, originX, camera)).toBeCloseTo(camera.worldToScreenX(wx), 8);
  });

  it("starting units sit on passable land tiles", () => {
    const state = createGame({ seed: "spawn-land", cols: 48, rows: 32, playerCount: 2 });
    for (const u of state.units.values()) {
      const tile = state.map.tiles.find((t) => t.col === u.col && t.row === u.row);
      expect(tile).toBeDefined();
      expect(["ocean", "coast", "lake"]).not.toContain(tile!.terrain);
    }
  });
});
