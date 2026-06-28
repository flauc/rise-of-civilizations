import { describe, it, expect } from "vitest";
import { getTile, offsetToAxial, axialNeighbor, axialToOffset } from "@roc/shared";
import { createGame } from "./setup";
import { beginTurn, applyCommand } from "./commands";
import { getCityYields } from "./economy";
import {
  establishTradeRoute,
  cancelTradeRoute,
  tradeRouteYield,
  cityTradeYields,
  pruneTradeRoutes,
  tradeRouteDestinations,
} from "./trade";
import { citiesOf, makeUnit, unitsOf, type City } from "./state";
import { viewForPlayer } from "./serialize";

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
    isCapital: false, foundedAsCapital: false, hp: 100, lastAttackedTurn: 0, rangedAttackUsed: false, training: {}, trainingQueue: [], modifiers: [],
  };
  s.cities.set(id, second);
  return { s, from: first, to: second };
}

/** Hex direction (0..5) from tile a to its neighbour b, or -1 if not adjacent. */
function dirBetween(a: [number, number], b: [number, number]): number {
  const ax = offsetToAxial({ col: a[0], row: a[1] });
  for (let d = 0; d < 6; d++) {
    const n = axialToOffset(axialNeighbor(ax, d));
    if (n.col === b[0] && n.row === b[1]) return d;
  }
  return -1;
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

  it("cancels a route without refunding the trader; rejects bad ids and other owners", () => {
    const { s, from, to } = gameWithTwoCities();
    const tid = s.nextEntityId++;
    s.units.set(tid, makeUnit(tid, 0, "trader", from.col, from.row));
    expect(establishTradeRoute(s, tid, to.id, 0).ok).toBe(true);
    const route = s.tradeRoutes[0]!;

    // A different player can't cancel someone else's route.
    expect(cancelTradeRoute(s, route.id, 1).ok).toBe(false);
    // A non-existent route id is rejected.
    expect(cancelTradeRoute(s, 999999, 0).ok).toBe(false);

    const unitsBefore = unitsOf(s, 0).length;
    expect(cancelTradeRoute(s, route.id, 0).ok).toBe(true);
    expect(s.tradeRoutes).toHaveLength(0);
    // The trader stays gone — cancelling never returns a unit.
    expect(unitsOf(s, 0).length).toBe(unitsBefore);
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

  it("treats rivers as top-grade roads for the bonus once Sailing is researched", () => {
    const { s, from, to } = gameWithTwoCities();
    const tid = s.nextEntityId++;
    s.units.set(tid, makeUnit(tid, 0, "trader", from.col, from.row));
    establishTradeRoute(s, tid, to.id, 0);
    const route = s.tradeRoutes[0]!;
    const baseYield = tradeRouteYield(s, route).gold;

    // Thread a river along the whole intermediate path (no roads).
    for (let i = 1; i < route.path.length - 1; i++) {
      const [col, row] = route.path[i]!.split(",").map(Number) as [number, number];
      const tile = getTile(s.map, col, row);
      if (tile) tile.river = 0b001001;
    }
    // Without Sailing a river grants nothing.
    expect(tradeRouteYield(s, route).gold).toBe(baseYield);
    // With Sailing the river route earns the best-grade (tier 3) connection bonus.
    s.players[0]!.researched.add("sailing");
    expect(tradeRouteYield(s, route).gold).toBe(baseYield + 6);
  });

  it("a river severs the road connection unless a bridge spans it", () => {
    const { s, from, to } = gameWithTwoCities();
    const tid = s.nextEntityId++;
    s.units.set(tid, makeUnit(tid, 0, "trader", from.col, from.row));
    establishTradeRoute(s, tid, to.id, 0);
    const route = s.tradeRoutes[0]!;
    const baseYield = tradeRouteYield(s, route).gold;

    // Fully pave the intermediate path with imperial roads.
    for (let i = 1; i < route.path.length - 1; i++) {
      const [col, row] = route.path[i]!.split(",").map(Number) as [number, number];
      const tile = getTile(s.map, col, row);
      if (tile) {
        tile.road = true;
        tile.roadLevel = 3;
      }
    }
    expect(tradeRouteYield(s, route).gold).toBe(baseYield + 6);

    // Run a river along the edge between the first two intermediate road tiles.
    const a = route.path[1]!.split(",").map(Number) as [number, number];
    const b = route.path[2]!.split(",").map(Number) as [number, number];
    const dir = dirBetween(a, b);
    expect(dir).toBeGreaterThanOrEqual(0);
    getTile(s.map, a[0], a[1])!.river = 1 << dir;
    // The unbridged river breaks the road connection, so the bonus is lost.
    expect(tradeRouteYield(s, route).gold).toBe(baseYield);

    // Research Bridge Building and bring both crossing tiles into owned territory: a
    // bridge now carries the road over the river and the connection (bonus) returns.
    s.players[0]!.researched.add("bridge_building");
    getTile(s.map, a[0], a[1])!.ownerCityId = from.id;
    getTile(s.map, b[0], b[1])!.ownerCityId = from.id;
    expect(tradeRouteYield(s, route).gold).toBe(baseYield + 6);
  });

  it("serializes a bridge flag for a roaded river crossing only once the tech is researched", () => {
    const { s, from } = gameWithTwoCities();
    // Two owned, adjacent road tiles east of the city with a river on their shared edge.
    const a: [number, number] = [from.col + 2, from.row];
    const bAx = axialNeighbor(offsetToAxial({ col: a[0], row: a[1] }), 0); // E neighbour
    const bOff = axialToOffset(bAx);
    const b: [number, number] = [bOff.col, bOff.row];
    const d = dirBetween(a, b);
    for (const [col, row] of [a, b]) {
      const tile = getTile(s.map, col, row)!;
      tile.road = true;
      tile.roadLevel = 1;
      tile.ownerCityId = from.id;
      s.players[0]!.explored.add(`${col},${row}`);
    }
    getTile(s.map, a[0], a[1])!.river = 1 << d;
    getTile(s.map, b[0], b[1])!.river = 1 << ((d + 3) % 6);

    const bridgeFlag = () => {
      const view = viewForPlayer(s, 0);
      const ta = view.tiles.find((t) => t.col === a[0] && t.row === a[1]);
      return ta?.bridge ?? false;
    };

    // No tech → the river is unbridged, so no bridge reaches the client.
    expect(bridgeFlag()).toBe(false);
    // Research Bridge Building → the crossing now serializes a bridge for rendering.
    s.players[0]!.researched.add("bridge_building");
    expect(bridgeFlag()).toBe(true);
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

import { ensureContact, relationBetween, declareWar } from "./diplomacy";

describe("international trade routes", () => {
  function twoCivsWithCities() {
    const s = createGame({ seed: "trade-intl", cols: 40, rows: 28, barbarians: false, humanSlots: 2, playerCount: 2 });
    beginTurn(s);
    const set0 = unitsOf(s, 0).find((u) => u.type === "settler")!;
    applyCommand(s, { type: "foundCity", unitId: set0.id }, 0);
    const c0 = citiesOf(s, 0)[0]!;
    const id = s.nextEntityId++;
    const c1: City = {
      id, ownerId: 1, name: "Foreign", col: c0.col + 5, row: c0.row, population: 1,
      foodStored: 0, productionStored: 0, production: null, buildings: [], specialists: [], wonders: [], workedTiles: [],
      isCapital: false, foundedAsCapital: false, hp: 100, lastAttackedTurn: 0, rangedAttackUsed: false, training: {}, trainingQueue: [], modifiers: [],
    };
    s.cities.set(id, c1);
    ensureContact(s, 0, 1);
    return { s, c0, c1 };
  }

  it("a foreign city is only a destination with open borders or an alliance", () => {
    const { s, c0, c1 } = twoCivsWithCities();
    const tid = s.nextEntityId++;
    s.units.set(tid, makeUnit(tid, 0, "trader", c0.col, c0.row));
    expect(tradeRouteDestinations(s, s.units.get(tid)!).map((c) => c.id)).not.toContain(c1.id);
    expect(establishTradeRoute(s, tid, c1.id, 0).ok).toBe(false);

    relationBetween(s, 0, 1)!.openBorders = true;
    expect(tradeRouteDestinations(s, s.units.get(tid)!).map((c) => c.id)).toContain(c1.id);
    expect(establishTradeRoute(s, tid, c1.id, 0).ok).toBe(true);
    const route = s.tradeRoutes.find((r) => r.toCityId === c1.id)!;
    expect(route.international).toBe(true);
    expect(route.toOwnerId).toBe(1);
    expect(tradeRouteYield(s, route).gold).toBeGreaterThan(0);
    expect(tradeRouteYield(s, route).culture).toBeGreaterThanOrEqual(1); // intl exchanges culture
  });

  it("an international route is severed when war breaks out", () => {
    const { s, c0, c1 } = twoCivsWithCities();
    relationBetween(s, 0, 1)!.openBorders = true;
    const tid = s.nextEntityId++;
    s.units.set(tid, makeUnit(tid, 0, "trader", c0.col, c0.row));
    establishTradeRoute(s, tid, c1.id, 0);
    expect(s.tradeRoutes).toHaveLength(1);
    declareWar(s, 0, 1);
    pruneTradeRoutes(s);
    expect(s.tradeRoutes).toHaveLength(0);
  });
});
