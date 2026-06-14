import { describe, it, expect } from "vitest";
import { createGame } from "./setup";
import { beginTurn } from "./commands";
import { triggerVillage, spawnFromCamps } from "./features";
import { unitsOf, type GameState, type Unit } from "./state";
import { getTile } from "@roc/shared";

function firstUnit(state: GameState, ownerId: number): Unit {
  return unitsOf(state, ownerId)[0]!;
}

describe("map features", () => {
  it("places villages and barbarian camps on the map", () => {
    const state = createGame({ seed: "feat", cols: 44, rows: 30, barbarians: true });
    const villages = state.map.tiles.filter((t) => t.feature === "village").length;
    const camps = state.map.tiles.filter((t) => t.feature === "barb_camp").length;
    expect(villages).toBeGreaterThan(0);
    expect(camps).toBeGreaterThan(0);
  });

  it("a village grants a perk and is consumed on entry", () => {
    const state = createGame({ seed: "feat2", cols: 44, rows: 30, barbarians: true });
    beginTurn(state);
    const unit = firstUnit(state, 0);
    // Plant a village under the unit and trigger it.
    const tile = getTile(state.map, unit.col, unit.row)!;
    tile.feature = "village";
    const logBefore = state.log.length;
    const player = state.players[0]!;
    triggerVillage(state, unit, player);
    expect(state.log.length).toBeGreaterThan(logBefore); // some perk was logged
  });

  it("barbarian camps spawn raiders over time", () => {
    const state = createGame({ seed: "feat3", cols: 44, rows: 30, barbarians: true });
    const barbId = state.players.find((p) => p.isBarbarian)!.id;
    const before = unitsOf(state, barbId).length;
    // Advance enough turns that a camp's cadence (4–6) fires at least once.
    let spawnedMore = false;
    for (let t = 1; t <= 12 && !spawnedMore; t++) {
      state.turn = t;
      spawnFromCamps(state, barbId);
      if (unitsOf(state, barbId).length > before) spawnedMore = true;
    }
    expect(spawnedMore).toBe(true);
  });

  it("disabling barbarians removes barbarian players, units, and camps", () => {
    const state = createGame({ seed: "feat-none", cols: 44, rows: 30, barbarians: "none" });
    expect(state.barbarianActivity).toBe("none");
    expect(state.players.some((p) => p.isBarbarian)).toBe(false);
    expect(state.map.tiles.some((t) => t.feature === "barb_camp")).toBe(false);
    const barbUnits = [...state.units.values()].filter((u) =>
      state.players.find((p) => p.id === u.ownerId)?.isBarbarian,
    ).length;
    expect(barbUnits).toBe(0);
  });
});
