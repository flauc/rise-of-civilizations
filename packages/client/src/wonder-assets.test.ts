import { describe, expect, it } from "vitest";
import { createGame } from "@roc/sim";
import { naturalWonderIdsOnMap } from "./natural-wonder-assets";
import { wonderIdsOnMap } from "./wonder-assets";

describe("map-aware wonder loading", () => {
  it("collects only natural wonders placed on the map", () => {
    const state = createGame({ seed: "nw-map", cols: 48, rows: 32, playerCount: 1, naturalWonders: true });
    const onMap = state.map.tiles.filter((t) => t.naturalWonder);
    const ids = naturalWonderIdsOnMap(state);
    // One sprite per wonder, not per tile: a multi-tile wonder stamps its id on
    // several tiles but only needs its single wide painting loaded once.
    expect(ids.length).toBe(new Set(onMap.map((t) => t.naturalWonder)).size);
    expect(ids.length).toBeGreaterThan(0);
    for (const t of onMap) {
      expect(ids).toContain(t.naturalWonder);
    }
  });

  it("starts with no player-built wonders on the map", () => {
    const state = createGame({ seed: "pw-map", cols: 40, rows: 28, playerCount: 1 });
    expect(wonderIdsOnMap(state)).toEqual([]);
  });
});
