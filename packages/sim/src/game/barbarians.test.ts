import { describe, it, expect } from "vitest";
import { getTile } from "@roc/shared";
import { createGame } from "./setup";
import { barbarianTurn } from "./barbarians";
import { makeUnit, type City, type GameState, type Player, type Unit } from "./state";
import { bribeKeyForUnit } from "./bribery";

function setup(): { state: GameState; barb: Player; civ: Player; city: City } {
  const state = createGame({ seed: "barb-raid", cols: 30, rows: 20 });
  // Controlled scenario: no wandering hordes, no camps spawning fresh raiders.
  for (const t of state.map.tiles) if (t.feature === "barb_camp") t.feature = undefined;
  state.units.clear();
  const barb = state.players.find((p) => p.isBarbarian)!;
  const civ = state.players.find((p) => !p.isBarbarian)!;
  // Give the civ a city in a far corner so its tiles can be claimed for raiding.
  const id = state.nextEntityId++;
  const city: City = {
    id, ownerId: civ.id, name: "Target", col: 25, row: 17, population: 1,
    foodStored: 0, productionStored: 0, production: null, buildings: [], specialists: [], wonders: [],
    workedTiles: [], isCapital: false, foundedAsCapital: false, hp: 100, lastAttackedTurn: 0,
    rangedAttackUsed: false, modifiers: [],
  };
  state.cities.set(id, city);
  const cityTile = getTile(state.map, 25, 17);
  if (cityTile) cityTile.ownerCityId = id;
  return { state, barb, civ, city };
}

/** Place a barbarian on a controlled land tile far from any city. */
function placeBarbAt(state: GameState, barbId: number, col: number, row: number): Unit {
  const tile = getTile(state.map, col, row)!;
  tile.terrain = "grassland";
  tile.feature = undefined;
  const id = state.nextEntityId++;
  const u = makeUnit(id, barbId, "warrior", col, row);
  u.movementLeft = 2;
  state.units.set(id, u);
  return u;
}

describe("barbarian raiding", () => {
  it("pillages an enemy improvement it is standing on", () => {
    const { state, barb, city } = setup();
    const tile = getTile(state.map, 2, 2)!;
    tile.terrain = "grassland";
    tile.ownerCityId = city.id;
    tile.improvement = "farm";
    tile.improvementLevel = 1;

    placeBarbAt(state, barb.id, 2, 2);
    barbarianTurn(state, barb.id);

    expect(tile.improvement).toBeUndefined(); // burned to the ground
  });

  it("plunders an enemy trade route running under it", () => {
    const { state, barb, civ, city } = setup();
    const here = "5,5";
    state.tradeRoutes.push({
      id: state.nextEntityId++,
      ownerId: civ.id,
      fromCityId: city.id,
      toCityId: city.id,
      path: ["4,5", here, "6,5"],
    });

    const u = placeBarbAt(state, barb.id, 5, 5);
    expect(state.tradeRoutes.length).toBe(1);
    barbarianTurn(state, barb.id);

    expect(state.tradeRoutes.length).toBe(0); // route severed
    expect(u.movementLeft).toBe(0); // raiding ended its turn
  });

  it("detours toward enemy improvements rather than only chasing units", () => {
    const { state, barb, city } = setup();
    // Carve a passable land corridor so terrain can't block the approach.
    for (let c = 5; c <= 10; c++) {
      const t = getTile(state.map, c, 5)!;
      t.terrain = "grassland";
      t.feature = undefined;
    }
    // An improvement a few tiles away, with nothing else to attack nearby.
    const target = getTile(state.map, 10, 5)!;
    target.ownerCityId = city.id;
    target.improvement = "mine";
    target.improvementLevel = 1;

    const u = placeBarbAt(state, barb.id, 5, 5);
    const startDist = Math.abs(u.col - 10) + Math.abs(u.row - 5);
    barbarianTurn(state, barb.id);
    const endDist = Math.abs(u.col - 10) + Math.abs(u.row - 5);

    expect(endDist).toBeLessThan(startDist); // moved toward the improvement
  });

  it("leaves a bribed civ's improvements alone", () => {
    const { state, barb, civ, city } = setup();
    const tile = getTile(state.map, 2, 2)!;
    tile.terrain = "grassland";
    tile.ownerCityId = city.id;
    tile.improvement = "farm";
    tile.improvementLevel = 1;

    const u = placeBarbAt(state, barb.id, 2, 2);
    // Pacify this war-band toward the civ for the rest of the game.
    state.barbarianBribes.push({
      playerId: civ.id,
      campKey: bribeKeyForUnit(u),
      untilTurn: state.turn + 50,
    });

    barbarianTurn(state, barb.id);
    expect(tile.improvement).toBe("farm"); // truce respected
  });
});
