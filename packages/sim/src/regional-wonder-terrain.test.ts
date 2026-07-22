import { describe, expect, it } from "vitest";
import { axialNeighbor, axialToOffset, getTile, offsetToAxial } from "@roc/shared";
import { createGame } from "./game/setup";
import { isInlandNaturalWonder, regionalInlandSeaOk } from "./regional-wonder-terrain";
import { getNaturalWonder } from "@roc/data";
import { naturalWonderTileGeoValid } from "./map-geo";

function bordersOceanOrCoast(map: ReturnType<typeof createGame>["map"], col: number, row: number): boolean {
  const here = offsetToAxial({ col, row });
  for (let d = 0; d < 6; d++) {
    const nb = axialToOffset(axialNeighbor(here, d));
    const t = getTile(map, nb.col, nb.row);
    if (t && (t.terrain === "ocean" || t.terrain === "coast")) return true;
  }
  return false;
}

describe("regional wonder terrain anchoring", () => {
  it("places iconic European wonders at their real-world sites on huge maps", () => {
    const state = createGame({
      seed: "europe-anchor-nw",
      cols: 84,
      rows: 56,
      mapType: "europe",
      naturalWonders: true,
      barbarians: false,
    });
    expect(state.naturalWonderIds.length).toBeGreaterThanOrEqual(5);
    for (const id of state.naturalWonderIds) {
      const tile = state.map.tiles.find((t) => t.naturalWonder === id)!;
      expect(naturalWonderTileGeoValid(state.map, id, tile.col, tile.row)).toBe(true);
    }
  });

  it("places most eligible European wonders on huge maps across seeds", () => {
    const counts: number[] = [];
    for (let i = 0; i < 10; i++) {
      const state = createGame({
        seed: `europe-auth-${i}`,
        cols: 84,
        rows: 56,
        mapType: "europe",
        naturalWonders: true,
        barbarians: false,
      });
      counts.push(state.naturalWonderIds.length);
    }
    expect(Math.min(...counts)).toBeGreaterThanOrEqual(4);
    expect(counts.reduce((a, b) => a + b, 0) / counts.length).toBeGreaterThanOrEqual(5);
  });

  it("keeps inland wonders off the shoreline on regional Europe maps", () => {
    let checked = 0;
    for (let i = 0; i < 12; i++) {
      const state = createGame({
        seed: `small-inland-${i}`,
        cols: 36,
        rows: 24,
        mapType: "europe",
        naturalWonders: true,
        barbarians: false,
      });
      for (const id of state.naturalWonderIds) {
        const def = getNaturalWonder(id)!;
        if (!isInlandNaturalWonder(def)) continue;
        const tile = state.map.tiles.find((t) => t.naturalWonder === id)!;
        expect(regionalInlandSeaOk(state.map, tile.col, tile.row), `${id} on seed ${i}`).toBe(true);
        expect(bordersOceanOrCoast(state.map, tile.col, tile.row), `${id} on seed ${i}`).toBe(false);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});
