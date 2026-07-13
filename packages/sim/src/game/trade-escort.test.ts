import { describe, it, expect } from "vitest";
import { getTile } from "@roc/shared";
import { createGame, beginTurn } from "./index";
import { makeUnit, type City, type GameState, type Unit } from "./state";
import { establishTradeRoute, assignTradeEscort, leaveTradeEscort, tradeRouteYield } from "./trade";
import { plunderTradeRoute, plunderValue } from "./raiding";

function placeCity(state: GameState, owner: number, name: string, col: number, row: number): City {
  const id = state.nextEntityId++;
  const city: City = {
    id, ownerId: owner, name, col, row, population: 1,
    foodStored: 0, productionStored: 0, production: null, buildings: [], specialists: [], wonders: [], workedTiles: [],
    isCapital: false, foundedAsCapital: false, hp: 100, lastAttackedTurn: 0, rangedAttackUsed: false, training: {}, trainingQueue: [], modifiers: [],
  };
  state.cities.set(id, city);
  const tile = getTile(state.map, col, row);
  if (tile) tile.ownerCityId = id;
  return city;
}

function place(state: GameState, owner: number, type: Unit["type"], col: number, row: number): Unit {
  const id = state.nextEntityId++;
  const u = makeUnit(id, owner, type, col, row);
  u.movementLeft = 2;
  state.units.set(id, u);
  return u;
}

function war(state: GameState) {
  state.players[0]!.atWar = [1];
  state.players[1]!.atWar = [0];
}

describe("trade route escorts", () => {
  it("assigning an escort hides the unit and marks the route", () => {
    const state = createGame({ seed: "escort-assign", cols: 30, rows: 20, barbarians: false, humanSlots: 1 });
    beginTurn(state);
    const from = placeCity(state, 0, "A", 5, 5);
    const to = placeCity(state, 0, "B", 10, 5);
    for (let c = 5; c <= 10; c++) {
      const tile = getTile(state.map, c, 5);
      if (tile) {
        tile.terrain = "plains";
        tile.ownerCityId = from.id;
      }
    }
    const trader = place(state, 0, "trader", 5, 5);
    establishTradeRoute(state, trader.id, to.id, 0);
    const route = state.tradeRoutes[0]!;
    const mid = route.path[Math.floor(route.path.length / 2)]!;
    const [pc, pr] = mid.split(",").map(Number) as [number, number];
    const guard = place(state, 0, "warrior", pc, pr);

    expect(assignTradeEscort(state, guard.id, route.id, 0).ok).toBe(true);
    expect(state.units.get(guard.id)?.escortingRouteId).toBe(route.id);
    expect(route.escortUnitId).toBe(guard.id);
    expect(route.escortType).toBe("warrior");
  });

  it("a guarded route repels plunder and can recall the escort", () => {
    const state = createGame({ seed: "escort-fight", cols: 30, rows: 20, barbarians: false, humanSlots: 2 });
    beginTurn(state);
    state.units.clear();
    war(state);
    const from = placeCity(state, 0, "A", 5, 5);
    const to = placeCity(state, 0, "B", 10, 5);
    for (let c = 5; c <= 10; c++) {
      const tile = getTile(state.map, c, 5);
      if (tile) {
        tile.terrain = "plains";
        tile.ownerCityId = from.id;
      }
    }
    const trader = place(state, 0, "trader", 5, 5);
    establishTradeRoute(state, trader.id, to.id, 0);
    const route = state.tradeRoutes[0]!;
    const mid = route.path[Math.floor(route.path.length / 2)]!;
    const [pc, pr] = mid.split(",").map(Number) as [number, number];
    const guard = place(state, 0, "warrior", pc, pr);
    assignTradeEscort(state, guard.id, route.id, 0);

    const looter = place(state, 1, "warrior", pc, pr);
    const plunder = plunderTradeRoute(state, looter.id, route.id, 1);
    expect(plunder.ok).toBe(false);
    expect(state.tradeRoutes).toHaveLength(1);
    expect(route.repelledRaidTile).toEqual({ col: pc, row: pr });

    expect(leaveTradeEscort(state, route.id, 0).ok).toBe(true);
    expect(route.escortUnitId).toBeUndefined();
    expect(state.units.get(guard.id)?.escortingRouteId).toBeUndefined();
    expect(state.units.get(guard.id)?.col).toBe(pc);
  });

  it("trade route yields are lower after the nerf", () => {
    const state = createGame({ seed: "escort-nerf", cols: 30, rows: 20, barbarians: false });
    beginTurn(state);
    const from = placeCity(state, 0, "A", 5, 5);
    const to = placeCity(state, 0, "B", 12, 5);
    for (let c = 5; c <= 12; c++) {
      const tile = getTile(state.map, c, 5);
      if (tile) {
        tile.terrain = "plains";
        tile.ownerCityId = from.id;
      }
    }
    const trader = place(state, 0, "trader", 5, 5);
    establishTradeRoute(state, trader.id, to.id, 0);
    const route = state.tradeRoutes[0]!;
    expect(tradeRouteYield(state, route).gold).toBeLessThanOrEqual(6);
    expect(plunderValue(state, route)).toBeLessThan(50);
  });
});
