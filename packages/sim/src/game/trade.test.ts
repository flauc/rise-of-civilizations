import { describe, it, expect } from "vitest";
import { getTile } from "@roc/shared";
import { createGame } from "./setup";
import { beginTurn, applyCommand } from "./commands";
import { getCityYields } from "./economy";
import {
  establishTradeRoute,
  tradeRouteYield,
  cityTradeYields,
  pruneTradeRoutes,
  tradeRouteDestinations,
} from "./trade";
import { citiesOf, makeUnit, unitsOf, type City } from "./state";

/** A game where player 0 owns two cities a few tiles apart. */
function gameWithTwoCities() {
  const s = createGame({ seed: "trade-test", cols: 40, rows: 28, barbarians: false, humanSlots: 2 });
  beginTurn(s);
  const settler = unitsOf(s, 0).find((u) => u.type === "settler")!;
  applyCommand(s, { type: "foundCity", unitId: settler.id });
  const first = citiesOf(s, 0)[0]!;
  // Plant a second owned city six tiles east.
  const id = s.nextEntityId++;
  const second: City = {
    id, ownerId: 0, name: "Trade Town", col: first.col + 6, row: first.row, population: 1,
    foodStored: 0, productionStored: 0, production: null, buildings: [], specialists: [], wonders: [], workedTiles: [],
    isCapital: false, foundedAsCapital: false, hp: 100, lastAttackedTurn: 0, rangedAttackUsed: false, modifiers: [],
  };
  s.cities.set(id, second);
  return { s, from: first, to: second };
}

describe("trade routes", () => {
  it("a trader in a city establishes a route, is consumed, and yields gold", () => {
    const { s, from, to } = gameWithTwoCities();
    const tid = s.nextEntityId++;
    s.units.set(tid, makeUnit(tid, 0, "trader", from.col, from.row));

    expect(tradeRouteDestinations(s, s.units.get(tid)!).map((c) => c.id)).toContain(to.id);

    const res = establishTradeRoute(s, tid, to.id, 0);
    expect(res.ok).toBe(true);
    expect(s.tradeRoutes).toHaveLength(1);
    expect(s.units.has(tid)).toBe(false); // trader consumed

    const route = s.tradeRoutes[0]!;
    expect(tradeRouteYield(s, route).gold).toBeGreaterThan(0);
    // Origin city's yields now include the trade gold.
    expect(getCityYields(s, from).gold).toBeGreaterThanOrEqual(tradeRouteYield(s, route).gold);
    // Destination city receives a small share.
    expect(cityTradeYields(s, to).gold).toBe(1);
  });

  it("rejects a duplicate route and a trader that isn't standing in a city", () => {
    const { s, from, to } = gameWithTwoCities();
    const tid = s.nextEntityId++;
    s.units.set(tid, makeUnit(tid, 0, "trader", from.col, from.row));
    expect(establishTradeRoute(s, tid, to.id, 0).ok).toBe(true);

    // A second trader on the same origin can't duplicate the route.
    const tid2 = s.nextEntityId++;
    s.units.set(tid2, makeUnit(tid2, 0, "trader", from.col, from.row));
    expect(establishTradeRoute(s, tid2, to.id, 0).ok).toBe(false);

    // A trader out in the wild (not in a city) can't establish anything.
    const tid3 = s.nextEntityId++;
    s.units.set(tid3, makeUnit(tid3, 0, "trader", from.col + 2, from.row + 2));
    expect(establishTradeRoute(s, tid3, to.id, 0).ok).toBe(false);
  });

  it("prunes routes whose endpoint city is lost", () => {
    const { s, from, to } = gameWithTwoCities();
    const tid = s.nextEntityId++;
    s.units.set(tid, makeUnit(tid, 0, "trader", from.col, from.row));
    establishTradeRoute(s, tid, to.id, 0);
    expect(s.tradeRoutes).toHaveLength(1);

    s.cities.delete(to.id); // destination razed
    pruneTradeRoutes(s);
    expect(s.tradeRoutes).toHaveLength(0);
  });

  it("gains a gold bonus when the route runs over a fully roaded path", () => {
    const { s, from, to } = gameWithTwoCities();
    const tid = s.nextEntityId++;
    s.units.set(tid, makeUnit(tid, 0, "trader", from.col, from.row));
    establishTradeRoute(s, tid, to.id, 0);
    const route = s.tradeRoutes[0]!;
    const baseYield = tradeRouteYield(s, route).gold;

    // Pave every intermediate tile with dirt roads.
    for (let i = 1; i < route.path.length - 1; i++) {
      const [col, row] = route.path[i]!.split(",").map(Number) as [number, number];
      const tile = getTile(s.map, col, row);
      if (tile) {
        tile.road = true;
        tile.roadLevel = 1;
      }
    }
    expect(tradeRouteYield(s, route).gold).toBe(baseYield + 2);

    // Upgrade to paved roads.
    for (let i = 1; i < route.path.length - 1; i++) {
      const [col, row] = route.path[i]!.split(",").map(Number) as [number, number];
      const tile = getTile(s.map, col, row);
      if (tile) tile.roadLevel = 2;
    }
    expect(tradeRouteYield(s, route).gold).toBe(baseYield + 4);

    // Upgrade to imperial roads.
    for (let i = 1; i < route.path.length - 1; i++) {
      const [col, row] = route.path[i]!.split(",").map(Number) as [number, number];
      const tile = getTile(s.map, col, row);
      if (tile) tile.roadLevel = 3;
    }
    expect(tradeRouteYield(s, route).gold).toBe(baseYield + 6);
  });

  it("gains no road bonus if any intermediate tile lacks a road", () => {
    const { s, from, to } = gameWithTwoCities();
    const tid = s.nextEntityId++;
    s.units.set(tid, makeUnit(tid, 0, "trader", from.col, from.row));
    establishTradeRoute(s, tid, to.id, 0);
    const route = s.tradeRoutes[0]!;
    const baseYield = tradeRouteYield(s, route).gold;

    // Pave all but the first intermediate tile.
    for (let i = 2; i < route.path.length - 1; i++) {
      const [col, row] = route.path[i]!.split(",").map(Number) as [number, number];
      const tile = getTile(s.map, col, row);
      if (tile) {
        tile.road = true;
        tile.roadLevel = 3;
      }
    }
    expect(tradeRouteYield(s, route).gold).toBe(baseYield);
  });

  it("uses the weakest road tier along the path", () => {
    const { s, from, to } = gameWithTwoCities();
    const tid = s.nextEntityId++;
    s.units.set(tid, makeUnit(tid, 0, "trader", from.col, from.row));
    establishTradeRoute(s, tid, to.id, 0);
    const route = s.tradeRoutes[0]!;
    const baseYield = tradeRouteYield(s, route).gold;

    for (let i = 1; i < route.path.length - 1; i++) {
      const [col, row] = route.path[i]!.split(",").map(Number) as [number, number];
      const tile = getTile(s.map, col, row);
      if (tile) {
        tile.road = true;
        tile.roadLevel = i === 1 ? 1 : 3; // one dirt road, the rest imperial
      }
    }
    expect(tradeRouteYield(s, route).gold).toBe(baseYield + 2);
  });
});
