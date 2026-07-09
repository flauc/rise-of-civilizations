import { describe, expect, it } from "vitest";
import { createGame } from "./setup";
import { makeUnit, playerById, unitsOf, type City } from "./state";
import { recruitLegend, tickLegends, legendRecruitThreshold } from "./legends";
import { LEGEND_DEFAULT_LIFESPAN, extendLegendsOnTrigger } from "./legend-lifespan";
import { onEnemyDefeated } from "./morale";

const newGame = () =>
  createGame({ cols: 14, rows: 14, seed: "legend-life", playerCount: 2, humanSlots: 1, barbarians: false, legends: true });

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

function fundTrack(state: ReturnType<typeof newGame>, playerId: number, track: "melee" | "cavalry", amount?: number): void {
  const player = playerById(state, playerId)!;
  player.legendTrackPoints = { [track]: amount ?? legendRecruitThreshold(0) };
}

describe("legend lifespan extensions", () => {
  it("heroes start with the default 15-turn tenure at 0 XP", () => {
    const state = newGame();
    addCity(state, 0, 3, 3);
    fundTrack(state, 0, "melee");
    recruitLegend(state, 0, "gilgamesh");
    const hero = unitsOf(state, 0).find((u) => u.legendId === "gilgamesh")!;
    expect(hero.legendExpiresOnTurn).toBe(state.turn + LEGEND_DEFAULT_LIFESPAN);
    expect(hero.xp).toBe(0);
  });

  it("Gilgamesh earns +1 turn per kill", () => {
    const state = newGame();
    addCity(state, 0, 3, 3);
    fundTrack(state, 0, "melee");
    recruitLegend(state, 0, "gilgamesh");
    const hero = unitsOf(state, 0).find((u) => u.legendId === "gilgamesh")!;
    const before = hero.legendExpiresOnTurn!;
    const foeId = state.nextEntityId++;
    const foe = makeUnit(foeId, 1, "warrior", 4, 3, 0, 100);
    state.units.set(foeId, foe);
    onEnemyDefeated(state, hero, foe);
    expect(hero.legendExpiresOnTurn).toBe(before + 1);
  });

  it("Cyrus earns +2 turns per captured city", () => {
    const state = newGame();
    addCity(state, 0, 3, 3);
    const player = playerById(state, 0)!;
    player.researched.add("bronze_alloying");
    fundTrack(state, 0, "cavalry");
    recruitLegend(state, 0, "cyrus");
    const hero = unitsOf(state, 0).find((u) => u.legendId === "cyrus")!;
    const before = hero.legendExpiresOnTurn!;
    extendLegendsOnTrigger(state, 0, "city_capture");
    expect(hero.legendExpiresOnTurn).toBe(before + 2);
  });

  it("retires after extended tenure elapses", () => {
    const state = newGame();
    addCity(state, 0, 3, 3);
    fundTrack(state, 0, "melee");
    recruitLegend(state, 0, "gilgamesh");
    const hero = unitsOf(state, 0).find((u) => u.legendId === "gilgamesh")!;
    state.turn = hero.legendExpiresOnTurn! + 1;
    tickLegends(state, 0);
    expect(unitsOf(state, 0).some((u) => u.legendId === "gilgamesh")).toBe(false);
  });
});
