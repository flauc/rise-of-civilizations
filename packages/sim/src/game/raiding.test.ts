import { describe, it, expect } from "vitest";
import { createGame } from "./setup";
import { beginTurn, applyCommand } from "./commands";
import { makeUnit, citiesOf, unitsOf, type City, type GameState, type Unit } from "./state";
import { getTile } from "@roc/shared";
import { resolveAttack } from "./combat";
import { establishTradeRoute, tradeRouteYield } from "./trade";
import { pillageTile, plunderTradeRoute, sackCityCommand, pillageValue, sackValue } from "./raiding";
import { offsetNeighbors } from "./movement";

function warAll(state: GameState): void {
  for (const a of state.players) {
    for (const b of state.players) {
      if (a.id !== b.id && !a.atWar.includes(b.id)) a.atWar.push(b.id);
    }
  }
}

function bareGame(): GameState {
  const state = createGame({ seed: "raiding", cols: 30, rows: 20, barbarians: false });
  state.units.clear();
  warAll(state);
  return state;
}

function place(state: GameState, owner: number, type: Unit["type"], col: number, row: number): Unit {
  const id = state.nextEntityId++;
  const u = makeUnit(id, owner, type, col, row);
  u.movementLeft = 2;
  state.units.set(id, u);
  return u;
}

function placeCity(state: GameState, owner: number, name: string, col: number, row: number): City {
  const id = state.nextEntityId++;
  const city: City = {
    id, ownerId: owner, name, col, row, population: 1,
    foodStored: 0, productionStored: 0, production: null, buildings: [], specialists: [], wonders: [], workedTiles: [],
    isCapital: false, foundedAsCapital: false, hp: 100, lastAttackedTurn: 0, rangedAttackUsed: false,
  };
  state.cities.set(id, city);
  // Claim the city tile so pillaging/sacking can check enemy ownership.
  const tile = getTile(state.map, col, row);
  if (tile) tile.ownerCityId = id;
  return city;
}

describe("raiding", () => {
  it("pillaging an improvement yields gold based on its cost and tier", () => {
    const state = bareGame();
    const city = placeCity(state, 1, "Target", 10, 8);
    const tile = getTile(state.map, 11, 8)!;
    tile.ownerCityId = city.id;
    tile.improvement = "mine";
    tile.improvementLevel = 2; // mine base 4 => 10*4*2 = 80

    const raider = place(state, 0, "warrior", 11, 8);
    const goldBefore = state.players[0]!.gold;

    const res = pillageTile(state, raider.id, 0);
    expect(res.ok).toBe(true);
    expect(res.gold).toBe(80);
    expect(state.players[0]!.gold).toBe(goldBefore + 80);
    expect(tile.improvement).toBeUndefined();
    expect(raider.movementLeft).toBe(0);
  });

  it("pillaging a tile with both improvement and road yields gold for both", () => {
    const state = bareGame();
    const city = placeCity(state, 1, "Target", 10, 8);
    const tile = getTile(state.map, 11, 8)!;
    tile.ownerCityId = city.id;
    tile.improvement = "farm";
    tile.improvementLevel = 1; // 10*3*1 = 30
    tile.road = true;
    tile.roadLevel = 2; // 10*2*2 = 40

    const raider = place(state, 0, "warrior", 11, 8);
    const res = pillageTile(state, raider.id, 0);
    expect(res.ok).toBe(true);
    expect(res.gold).toBe(70);
    expect(tile.improvement).toBeUndefined();
    expect(tile.road).toBeUndefined();
  });

  it("cannot pillage friendly or unowned tiles", () => {
    const state = bareGame();
    const friendlyCity = placeCity(state, 0, "Own", 10, 8);
    const tile = getTile(state.map, 11, 8)!;
    tile.ownerCityId = friendlyCity.id;
    tile.improvement = "farm";

    const raider = place(state, 0, "warrior", 11, 8);
    expect(pillageTile(state, raider.id, 0).ok).toBe(false);

    tile.ownerCityId = undefined;
    expect(pillageTile(state, raider.id, 0).ok).toBe(false);
  });

  it("Xiongnu raiding bonus increases pillage gold", () => {
    const state = bareGame();
    state.players[0]!.civId = "xiongnu";
    const city = placeCity(state, 1, "Target", 10, 8);
    const tile = getTile(state.map, 11, 8)!;
    tile.ownerCityId = city.id;
    tile.improvement = "farm";
    tile.improvementLevel = 1; // base 30, +25% => 37

    const raider = place(state, 0, "warrior", 11, 8);
    const res = pillageTile(state, raider.id, 0);
    expect(res.ok).toBe(true);
    expect(res.gold).toBe(37); // floor(30 * 1.25)
  });

  it("Norse coastal raiding bonus applies on water-adjacent tiles", () => {
    const state = bareGame();
    state.players[0]!.civId = "norse";

    // Find a land tile adjacent to water.
    let coastalCol = -1;
    let coastalRow = -1;
    for (const t of state.map.tiles) {
      if (t.terrain === "coast" || t.terrain === "ocean" || t.terrain === "lake") continue;
      const hasWaterNeighbor = offsetNeighbors(state.map, t.col, t.row).some((n) => {
        const nt = getTile(state.map, n.col, n.row);
        return nt && (nt.terrain === "coast" || nt.terrain === "ocean" || nt.terrain === "lake");
      });
      if (hasWaterNeighbor) {
        coastalCol = t.col;
        coastalRow = t.row;
        break;
      }
    }
    expect(coastalCol).toBeGreaterThanOrEqual(0);

    const city = placeCity(state, 1, "Target", coastalCol, coastalRow);
    const tile = getTile(state.map, coastalCol, coastalRow)!;
    tile.ownerCityId = city.id;
    tile.improvement = "farm";
    tile.improvementLevel = 1; // base 30, +15% raid +15% coastal => 39

    const raider = place(state, 0, "warrior", coastalCol, coastalRow);
    const res = pillageTile(state, raider.id, 0);
    expect(res.ok).toBe(true);
    expect(res.gold).toBe(Math.floor(30 * (1 + 0.15 + 0.15)));
  });

  it("raider promotion adds +10 gold from pillaging", () => {
    const state = bareGame();
    const city = placeCity(state, 1, "Target", 10, 8);
    const tile = getTile(state.map, 11, 8)!;
    tile.ownerCityId = city.id;
    tile.improvement = "farm";
    tile.improvementLevel = 1; // 30 + 10 = 40

    const raider = place(state, 0, "warrior", 11, 8);
    raider.promotions.push("raider");
    const res = pillageTile(state, raider.id, 0);
    expect(res.ok).toBe(true);
    expect(res.gold).toBe(40);
  });

  it("a trade route stores a path and can be plundered from it", () => {
    const state = createGame({ seed: "plunder", cols: 30, rows: 20, barbarians: false, humanSlots: 2 });
    beginTurn(state);
    state.units.clear();
    warAll(state);

    // Two owned cities for player 0.
    const from = placeCity(state, 0, "A", 5, 5);
    const to = placeCity(state, 0, "B", 10, 5);
    // Claim a corridor of tiles between them so BFS can find a path.
    for (let c = 5; c <= 10; c++) {
      const tile = getTile(state.map, c, 5);
      if (tile && tile.terrain !== "ocean" && tile.terrain !== "coast" && tile.terrain !== "lake") {
        tile.ownerCityId = from.id;
      }
    }

    const traderId = state.nextEntityId++;
    state.units.set(traderId, makeUnit(traderId, 0, "trader", from.col, from.row));
    const res = establishTradeRoute(state, traderId, to.id, 0);
    expect(res.ok).toBe(true);

    const route = state.tradeRoutes[0]!;
    expect(route.path.length).toBeGreaterThan(0);
    expect(route.path).toContain(`${from.col},${from.row}`);
    expect(route.path).toContain(`${to.col},${to.row}`);

    // Enemy unit stands on a middle tile of the path.
    const pathTile = route.path[Math.floor(route.path.length / 2)]!;
    const [pc, pr] = pathTile.split(",").map(Number) as [number, number];
    const looter = place(state, 1, "warrior", pc, pr);

    const expected = 20 + 10 * tradeRouteYield(state, route).gold;
    const goldBefore = state.players[1]!.gold;
    const plunderRes = plunderTradeRoute(state, looter.id, route.id, 1);
    expect(plunderRes.ok).toBe(true);
    expect(plunderRes.gold).toBe(expected);
    expect(state.players[1]!.gold).toBe(goldBefore + expected);
    expect(state.tradeRoutes).toHaveLength(0);
    expect(looter.movementLeft).toBe(0);
  });

  it("cannot plunder a trade route from a tile not on its path", () => {
    const state = createGame({ seed: "plunder-fail", cols: 30, rows: 20, barbarians: false, humanSlots: 2 });
    beginTurn(state);
    state.units.clear();
    warAll(state);

    const from = placeCity(state, 0, "A", 5, 5);
    const to = placeCity(state, 0, "B", 10, 5);
    for (let c = 5; c <= 10; c++) {
      const tile = getTile(state.map, c, 5);
      if (tile && tile.terrain !== "ocean" && tile.terrain !== "coast" && tile.terrain !== "lake") {
        tile.ownerCityId = from.id;
      }
    }

    const traderId = state.nextEntityId++;
    state.units.set(traderId, makeUnit(traderId, 0, "trader", from.col, from.row));
    establishTradeRoute(state, traderId, to.id, 0);
    const route = state.tradeRoutes[0]!;

    const looter = place(state, 1, "warrior", 20, 15); // far from path
    expect(plunderTradeRoute(state, looter.id, route.id, 1).ok).toBe(false);
  });

  it("sacking a 0-HP city destroys it and yields gold", () => {
    const state = bareGame();
    const target = placeCity(state, 1, "Sackville", 10, 8);
    target.hp = 0;

    const attacker = place(state, 0, "swordsman", 10, 8);
    const goldBefore = state.players[0]!.gold;
    const expected = sackValue(target);

    const res = sackCityCommand(state, attacker.id, 0);
    expect(res.ok).toBe(true);
    expect(res.gold).toBe(expected);
    expect(state.players[0]!.gold).toBe(goldBefore + expected);
    expect(state.cities.has(target.id)).toBe(false);
    expect(attacker.movementLeft).toBe(0);
  });

  it("Timurids gain science from sacking", () => {
    const state = bareGame();
    state.players[0]!.civId = "timurids";
    const target = placeCity(state, 1, "Sackville", 10, 8);
    target.hp = 0;

    const attacker = place(state, 0, "swordsman", 10, 8);
    const res = sackCityCommand(state, attacker.id, 0);
    expect(res.ok).toBe(true);
    expect(res.gold).toBe(Math.floor(sackValue(target) * 1.15));
    expect(res.science).toBe(Math.floor(res.gold! * 0.5));
    expect(state.players[0]!.scienceProgress).toBe(res.science);
  });

  it("cannot sack a healthy city", () => {
    const state = bareGame();
    const target = placeCity(state, 1, "Sackville", 10, 8);
    target.hp = 100;

    const attacker = place(state, 0, "swordsman", 10, 8);
    expect(sackCityCommand(state, attacker.id, 0).ok).toBe(false);
    expect(state.cities.has(target.id)).toBe(true);
  });

  it("existing melee auto-capture still works", () => {
    const state = bareGame();
    const target = placeCity(state, 1, "Target", 10, 8);
    target.hp = 0;

    const attacker = place(state, 0, "swordsman", 11, 8);
    const res = resolveAttack(state, attacker, 10, 8);
    expect(res.ok).toBe(true);
    expect(state.cities.has(target.id)).toBe(true);
    expect(state.cities.get(target.id)!.ownerId).toBe(0);
  });
});
