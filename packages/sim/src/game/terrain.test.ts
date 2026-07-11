import { describe, it, expect } from "vitest";
import { getTile, type Tile } from "@roc/shared";
import { tileYields, TERRAIN_YIELDS } from "./terrain";
import { createGame } from "./setup";
import { tileYieldReport } from "./economy";

const tile = (t: Partial<Tile>): Tile => ({ col: 0, row: 0, terrain: "hills", ...t });

describe("terrain yields", () => {
  it("a wooded hill adds +1 science over a bare hill (like a forest)", () => {
    const bare = tileYields(tile({ terrain: "hills" }));
    const wooded = tileYields(tile({ terrain: "hills", wooded: true }));
    expect(bare.science).toBe(0);
    expect(wooded.science).toBe(bare.science + 1);
    // A forest's science bonus is the same magnitude.
    expect(wooded.science).toBe(TERRAIN_YIELDS.forest.science);
    // The wooded flag adds nothing but science (still full hill production).
    expect(wooded.production).toBe(bare.production);
    expect(wooded.food).toBe(bare.food);
  });

  it("the wooded flag only matters on hills", () => {
    const woodedPlains = tileYields(tile({ terrain: "plains", wooded: true }));
    expect(woodedPlains).toEqual(tileYields(tile({ terrain: "plains" })));
  });

  it("a worked wooded hill yields the +1 science in the city economy path", () => {
    const state = createGame({ seed: "wooded-work", cols: 20, rows: 14, barbarians: false });
    const t = getTile(state.map, 5, 5)!;
    t.terrain = "hills";
    t.wooded = false;
    t.improvement = undefined;
    const bare = tileYieldReport(state, 5, 5, -1).yields.science;
    t.wooded = true;
    const wooded = tileYieldReport(state, 5, 5, -1).yields.science;
    expect(wooded).toBe(bare + 1);
  });
});
