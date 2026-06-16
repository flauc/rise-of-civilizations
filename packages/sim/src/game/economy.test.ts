import { describe, it, expect } from "vitest";
import { foodToGrow, applyUnitUpkeep, unitUpkeep } from "./economy";
import { createGame } from "./setup";
import { makeUnit, type Player } from "./state";
import { UNIT_DEFS } from "./content";

describe("foodToGrow", () => {
  it("uses a flatter curve so small cities grow faster", () => {
    expect(foodToGrow(1)).toBe(8);
    expect(foodToGrow(2)).toBe(11);
    expect(foodToGrow(3)).toBe(14);
    expect(foodToGrow(5)).toBe(20);
  });
});

describe("unit upkeep", () => {
  it("charges the sum of unit upkeep from the player's gold", () => {
    const state = createGame({ playerCount: 1, barbarians: false });
    const player = state.players[0]!;
    player.gold = 100;
    state.units.clear();
    // Place a warrior (1) and a scout (1).
    const warrior = makeUnit(state.nextEntityId++, player.id, "warrior", 0, 0);
    const scout = makeUnit(state.nextEntityId++, player.id, "scout", 1, 1);
    state.units.set(warrior.id, warrior);
    state.units.set(scout.id, scout);
    applyUnitUpkeep(state, player);
    expect(player.gold).toBe(98);
  });

  it("applies militaryMaintenanceCostMultiplier", () => {
    const state = createGame({ playerCount: 1, barbarians: false });
    const player = state.players[0]!;
    player.gold = 100;
    state.units.clear();
    player.modifiers.push({
      source: "test",
      effect: { militaryMaintenanceCostMultiplier: 1.5 },
      expiresOnTurn: Infinity,
    });
    const warrior = makeUnit(state.nextEntityId++, player.id, "warrior", 0, 0);
    state.units.set(warrior.id, warrior);
    applyUnitUpkeep(state, player);
    expect(unitUpkeep(state, warrior)).toBe(2); // round(1 * 1.5)
    expect(player.gold).toBe(98);
  });

  it("skips barbarian players", () => {
    const state = createGame({ playerCount: 1, barbarians: true });
    const barb = state.players.find((p) => p.isBarbarian)!;
    barb.gold = 0;
    applyUnitUpkeep(state, barb);
    expect(barb.gold).toBe(0);
  });
});

describe("starting gold presets", () => {
  it("gives the configured starting treasury", () => {
    const tight = createGame({ playerCount: 2, barbarians: false, startingGold: "tight" });
    const balanced = createGame({ playerCount: 2, barbarians: false, startingGold: "balanced" });
    const generous = createGame({ playerCount: 2, barbarians: false, startingGold: "generous" });
    expect(tight.players[0]!.gold).toBe(25);
    expect(balanced.players[0]!.gold).toBe(75);
    expect(generous.players[0]!.gold).toBe(150);
  });

  it("defaults to balanced when no preset is given", () => {
    const state = createGame({ playerCount: 2, barbarians: false });
    expect(state.players[0]!.gold).toBe(75);
  });
});
