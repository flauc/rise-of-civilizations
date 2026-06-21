import { describe, it, expect } from "vitest";
import { foodToGrow, applyUnitUpkeep, unitUpkeep, processCity } from "./economy";
import { createGame } from "./setup";
import { applyCommand } from "./commands";
import { citiesOf, makeUnit, unitsOf, type Player } from "./state";
import { UNIT_DEFS } from "./content";
import {
  GLOBAL_MORALE_BASE,
  BANKRUPTCY_GLOBAL_MORALE_PENALTY,
  BANKRUPTCY_UNIT_MORALE_PENALTY,
  unitMorale,
} from "./morale";

function foundCapital(state: ReturnType<typeof createGame>) {
  const settler = unitsOf(state, 0).find((u) => u.type === "settler")!;
  applyCommand(state, { type: "foundCity", unitId: settler.id }, 0);
  return citiesOf(state, 0)[0]!;
}

describe("settler production pauses growth", () => {
  it("a city building a settler does not grow even with stored food at the cap", () => {
    const state = createGame({ seed: "grow-settler", cols: 30, rows: 20, barbarians: false });
    const player = state.players[0]!;
    const city = foundCapital(state);
    city.foodStored = foodToGrow(city.population); // already at the growth threshold
    city.production = { kind: "unit", id: "settler" };

    processCity(state, city, player);
    expect(city.population).toBe(1); // settler held growth back
  });

  it("the same city grows once it is no longer building a settler", () => {
    const state = createGame({ seed: "grow-settler", cols: 30, rows: 20, barbarians: false });
    const player = state.players[0]!;
    const city = foundCapital(state);
    city.foodStored = foodToGrow(city.population);
    city.production = { kind: "unit", id: "warrior" };

    processCity(state, city, player);
    expect(city.population).toBe(2); // non-settler production lets it grow
  });
});

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

  it("bankruptcy disbands units and craters army morale", () => {
    const state = createGame({ playerCount: 1, barbarians: false });
    const player = state.players[0]!;
    player.globalMorale = GLOBAL_MORALE_BASE; // 50
    player.gold = 1; // not enough to pay two warriors (upkeep 1 each)
    state.units.clear();
    const w1 = makeUnit(state.nextEntityId++, player.id, "warrior", 0, 0, 0, 120);
    const w2 = makeUnit(state.nextEntityId++, player.id, "warrior", 1, 1, 0, 120);
    state.units.set(w1.id, w1);
    state.units.set(w2.id, w2);

    applyUnitUpkeep(state, player);

    // One warrior is disbanded to regain solvency.
    const survivors = unitsOf(state, player.id);
    expect(survivors.length).toBe(1);
    expect(player.gold).toBe(0);
    // Global morale plunges by the bankruptcy penalty, dropping below base 50.
    expect(player.globalMorale).toBe(GLOBAL_MORALE_BASE - BANKRUPTCY_GLOBAL_MORALE_PENALTY);
    // The surviving unit loses heart too.
    expect(unitMorale(survivors[0]!)).toBe(120 - BANKRUPTCY_UNIT_MORALE_PENALTY);
  });

  it("a solvent player suffers no bankruptcy morale hit", () => {
    const state = createGame({ playerCount: 1, barbarians: false });
    const player = state.players[0]!;
    player.globalMorale = GLOBAL_MORALE_BASE;
    player.gold = 100;
    state.units.clear();
    const w = makeUnit(state.nextEntityId++, player.id, "warrior", 0, 0, 0, 120);
    state.units.set(w.id, w);

    applyUnitUpkeep(state, player);

    expect(unitsOf(state, player.id).length).toBe(1);
    expect(player.globalMorale).toBe(GLOBAL_MORALE_BASE); // unchanged
    expect(unitMorale(w)).toBe(120); // unchanged
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
