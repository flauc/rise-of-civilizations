import { describe, expect, it } from "vitest";
import { LEGENDS, getLegend } from "@roc/data";
import { createGame } from "./setup";
import { serializeState, deserializeState } from "./serialize";
import { makeUnit, playerById, unitsOf, type City } from "./state";
import {
  availableLegends,
  canRecruitLegend,
  isLegend,
  legendCombatBonus,
  legendRecruitThreshold,
  recruitLegend,
  tickLegends,
} from "./legends";

const newGame = (legends = true) =>
  createGame({ cols: 14, rows: 14, seed: "legend-test", playerCount: 1, humanSlots: 1, barbarians: false, legends });

function addCity(state: ReturnType<typeof newGame>, ownerId: number, col: number, row: number): City {
  const id = state.nextEntityId++;
  const city: City = {
    id, ownerId, name: `City${id}`, col, row, population: 1,
    foodStored: 0, productionStored: 0, production: null, buildings: [],
    specialists: [], wonders: [], workedTiles: [], isCapital: true, foundedAsCapital: true,
    hp: 100, lastAttackedTurn: 0, rangedAttackUsed: false, training: {}, trainingQueue: [], modifiers: [],
  };
  state.cities.set(id, city);
  return city;
}

function fundMeleeGlory(state: ReturnType<typeof newGame>, playerId: number): void {
  const player = playerById(state, playerId)!;
  player.legendTrackPoints = { melee: legendRecruitThreshold(0) };
}

function bronzeMeleeLegend(state: ReturnType<typeof newGame>) {
  return availableLegends(state).find((l) => l.id === "gilgamesh")!;
}

describe("legends: availability", () => {
  it("excludes already-recruited legends", () => {
    const state = newGame();
    const id = LEGENDS[0]!.id;
    state.recruitedLegends.push(id);
    expect(availableLegends(state).some((l) => l.id === id)).toBe(false);
  });
});

describe("legends: recruitment", () => {
  it("spawns a hero unit, spends track glory, and is globally unique", () => {
    const state = newGame();
    const player = playerById(state, 0)!;
    addCity(state, 0, 3, 3);
    fundMeleeGlory(state, 0);
    const def = bronzeMeleeLegend(state);
    const res = recruitLegend(state, 0, def.id);
    expect(res.ok).toBe(true);
    expect(player.legendTrackPoints?.melee ?? 0).toBe(0);
    expect(player.legendsRecruited).toBe(1);
    expect(state.recruitedLegends).toContain(def.id);
    const hero = unitsOf(state, 0).find((u) => u.legendId === def.id)!;
    expect(hero).toBeTruthy();
    expect(isLegend(hero)).toBe(true);
    expect(hero.legendExpiresOnTurn).toBe(state.turn + 15);
    expect(hero.xp).toBe(0);
    expect(canRecruitLegend(state, 0, def.id).ok).toBe(false);
  });

  it("fails when Legends are disabled", () => {
    const state = newGame(false);
    addCity(state, 0, 3, 3);
    fundMeleeGlory(state, 0);
    expect(canRecruitLegend(state, 0, LEGENDS[0]!.id).ok).toBe(false);
  });

  it("fails without enough track glory", () => {
    const state = newGame();
    addCity(state, 0, 3, 3);
    expect(canRecruitLegend(state, 0, LEGENDS[0]!.id).ok).toBe(false);
  });
});

describe("legends: lifespan", () => {
  it("retires a hero whose lifespan has elapsed", () => {
    const state = newGame();
    addCity(state, 0, 3, 3);
    fundMeleeGlory(state, 0);
    const def = availableLegends(state).find((l) => !l.rechargeable)!;
    recruitLegend(state, 0, def.id);
    const hero = unitsOf(state, 0).find((u) => u.legendId === def.id)!;
    state.turn = hero.legendExpiresOnTurn! + 1;
    tickLegends(state, 0);
    expect(unitsOf(state, 0).some((u) => u.legendId === def.id)).toBe(false);
    expect(state.recruitedLegends).toContain(def.id);
  });

  it("a rechargeable legend returns to the pool when it retires", () => {
    const state = newGame();
    addCity(state, 0, 3, 3);
    fundMeleeGlory(state, 0);
    playerById(state, 0)!.researched.add("carburizing");
    const def = availableLegends(state).find((l) => l.rechargeable)!;
    recruitLegend(state, 0, def.id);
    const hero = unitsOf(state, 0).find((u) => u.legendId === def.id)!;
    state.turn = hero.legendExpiresOnTurn! + 1;
    tickLegends(state, 0);
    expect(state.recruitedLegends).not.toContain(def.id);
    expect(availableLegends(state).some((l) => l.id === def.id)).toBe(true);
  });
});

describe("legends: combat aura", () => {
  it("a legend buffs itself and adjacent friendly military", () => {
    const state = newGame();
    const def = getLegend("leonidas")!;
    const heroId = state.nextEntityId++;
    const hero = makeUnit(heroId, 0, def.baseType as never, 5, 5, 0, 120);
    hero.legendId = def.id;
    state.units.set(heroId, hero);
    expect(legendCombatBonus(state, hero)).toBeGreaterThanOrEqual(Math.max(0, def.combatBonus - 2));
    const allyId = state.nextEntityId++;
    const ally = makeUnit(allyId, 0, "warrior", 6, 5, 0, 100);
    state.units.set(allyId, ally);
    expect(legendCombatBonus(state, ally)).toBe(def.auraBonus);
    const foeId = state.nextEntityId++;
    const foe = makeUnit(foeId, 1, "warrior", 5, 6, 0, 100);
    state.units.set(foeId, foe);
    expect(legendCombatBonus(state, foe)).toBe(0);
  });
});

describe("legends: persistence", () => {
  it("survives a serialize round-trip", () => {
    const state = newGame();
    addCity(state, 0, 3, 3);
    fundMeleeGlory(state, 0);
    const def = bronzeMeleeLegend(state);
    recruitLegend(state, 0, def.id);

    const round = deserializeState(serializeState(state));
    expect(round.legendsEnabled).toBe(true);
    expect(round.recruitedLegends).toContain(def.id);
    expect(playerById(round, 0)!.legendsRecruited).toBe(1);
    const hero = unitsOf(round, 0).find((u) => u.legendId === def.id);
    expect(hero?.legendExpiresOnTurn).toBeDefined();
  });
});
