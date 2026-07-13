import { describe, it, expect } from "vitest";
import { getTile, offsetToAxial, axialNeighbor, axialToOffset, type GameMap } from "@roc/shared";
import { createGame } from "./setup";
import { beginTurn, applyCommand } from "./commands";
import { getCityYields } from "./economy";
import {
  establishTradeRoute,
  cancelTradeRoute,
  tradeRouteYield,
  tradeRouteGoldBreakdown,
  cityTradeYields,
  pruneTradeRoutes,
  tradeRouteDestinations,
  canConnectCities,
  isCoastalPortCity,
} from "./trade";
import { citiesOf, makeUnit, unitsOf, type City } from "./state";
import { viewForPlayer } from "./serialize";
import type { TerrainType } from "./terrain";

const makeMap = (cols: number, rows: number, terrain: (col: number, row: number) => TerrainType): GameMap => ({
  cols,
  rows,
  tiles: Array.from({ length: rows * cols }, (_, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    return { col, row, terrain: terrain(col, row) };
  }),
});

/** Two landmasses separated by a water channel (cols 4–5). */
const twoPortMap = makeMap(10, 4, (col) => (col >= 4 && col <= 5 ? "coast" : "plains"));

function gameOnMap(map: GameMap) {
  const s = createGame({ seed: "trade-map", cols: map.cols, rows: map.rows, barbarians: false, humanSlots: 2 });
  s.map = map;
  beginTurn(s);
  return s;
}

/** A game where player 0 owns two cities a few tiles apart. Runs on a flat
 *  all-plains map so routes depend only on the roads/rivers each test builds,
 *  not on whatever terrain the seed happens to roll. */
function gameWithTwoCities() {
  const s = createGame({ seed: "trade-test", cols: 40, rows: 28, barbarians: false, humanSlots: 2 });
  s.map = makeMap(40, 28, () => "plains");
  const settler = unitsOf(s, 0).find((u) => u.type === "settler")!;
  settler.col = 12;
  settler.row = 10;
  beginTurn(s);
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

  it("rejects ocean routes unless both cities are coastal ports", () => {
    const s = gameOnMap(twoPortMap);
    const inlandId = s.nextEntityId++;
    const inland: City = {
      id: inlandId, ownerId: 0, name: "Inland", col: 1, row: 1, population: 1,
      foodStored: 0, productionStored: 0, production: null, buildings: [], specialists: [], wonders: [], workedTiles: [],
      isCapital: false, foundedAsCapital: false, hp: 100, lastAttackedTurn: 0, rangedAttackUsed: false, training: {}, trainingQueue: [], modifiers: [],
    };
    s.cities.set(inlandId, inland);
    const portId = s.nextEntityId++;
    const port: City = {
      id: portId, ownerId: 0, name: "Harbour", col: 6, row: 1, population: 1,
      foodStored: 0, productionStored: 0, production: null, buildings: [], specialists: [], wonders: [], workedTiles: [],
      isCapital: false, foundedAsCapital: false, hp: 100, lastAttackedTurn: 0, rangedAttackUsed: false, training: {}, trainingQueue: [], modifiers: [],
    };
    s.cities.set(portId, port);
    expect(isCoastalPortCity(s, port)).toBe(true);
    expect(isCoastalPortCity(s, inland)).toBe(false);
    expect(canConnectCities(s, inland, port)).toBe(false);

    const tid = s.nextEntityId++;
    s.units.set(tid, makeUnit(tid, 0, "trader", inland.col, inland.row));
    expect(tradeRouteDestinations(s, s.units.get(tid)!).map((c) => c.id)).not.toContain(portId);
    expect(establishTradeRoute(s, tid, portId, 0).ok).toBe(false);
  });

  it("allows a sea lane only between two coastal port cities", () => {
    const s = gameOnMap(twoPortMap);
    const portAId = s.nextEntityId++;
    const portA: City = {
      id: portAId, ownerId: 0, name: "Port Alpha", col: 3, row: 1, population: 1,
      foodStored: 0, productionStored: 0, production: null, buildings: [], specialists: [], wonders: [], workedTiles: [],
      isCapital: false, foundedAsCapital: false, hp: 100, lastAttackedTurn: 0, rangedAttackUsed: false, training: {}, trainingQueue: [], modifiers: [],
    };
    s.cities.set(portAId, portA);
    const portBId = s.nextEntityId++;
    const portB: City = {
      id: portBId, ownerId: 0, name: "Port Beta", col: 6, row: 1, population: 1,
      foodStored: 0, productionStored: 0, production: null, buildings: [], specialists: [], wonders: [], workedTiles: [],
      isCapital: false, foundedAsCapital: false, hp: 100, lastAttackedTurn: 0, rangedAttackUsed: false, training: {}, trainingQueue: [], modifiers: [],
    };
    s.cities.set(portBId, portB);
    expect(canConnectCities(s, portA, portB)).toBe(true);

    const tid = s.nextEntityId++;
    s.units.set(tid, makeUnit(tid, 0, "trader", portA.col, portA.row));
    expect(establishTradeRoute(s, tid, portBId, 0).ok).toBe(true);
    const route = s.tradeRoutes[0]!;
    expect(route.path.some((key) => {
      const [col, row] = key.split(",").map(Number) as [number, number];
      const tile = getTile(s.map, col, row);
      return tile && (tile.terrain === "coast" || tile.terrain === "ocean");
    })).toBe(true);
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

  it("routes through a chain of roads even on a longer path, and keeps the bonus across a city hub", () => {
    const { s, from, to } = gameWithTwoCities();
    // Build an L-shaped Imperial road: straight east to the destination's column,
    // one row *south* of the direct line, then north into the destination. This road
    // is strictly longer than the straight shot, so a shortest-distance router would
    // ignore it — the caravan should still hug it because roads are near-free.
    const roadTiles: [number, number][] = [];
    for (let c = from.col; c <= to.col; c++) roadTiles.push([c, from.row + 1]);
    roadTiles.push([to.col, from.row]); // step back up into the destination row
    for (const [col, row] of roadTiles) {
      const tile = getTile(s.map, col, row);
      if (tile) {
        tile.road = true;
        tile.roadLevel = 3;
      }
    }

    const tid = s.nextEntityId++;
    s.units.set(tid, makeUnit(tid, 0, "trader", from.col, from.row));
    establishTradeRoute(s, tid, to.id, 0);
    const route = s.tradeRoutes[0]!;

    // The chosen path runs along the detoured road, not the straight line.
    expect(route.path).toContain(`${from.col + 3},${from.row + 1}`);
    // Every intermediate tile is roaded, so the imperial-road bonus applies.
    expect(tradeRouteGoldBreakdown(s, route).roadTier).toBe(3);
    expect(tradeRouteGoldBreakdown(s, route).road).toBe(6);
  });

  it("lifts every yield — not just gold — when a route is improved", () => {
    const { s, from, to } = gameWithTwoCities();
    const tid = s.nextEntityId++;
    s.units.set(tid, makeUnit(tid, 0, "trader", from.col, from.row));
    establishTradeRoute(s, tid, to.id, 0);
    const route = s.tradeRoutes[0]!;
    const before = tradeRouteYield(s, route);

    // Pave the whole path with imperial roads and add a Market + Bank at the origin.
    for (let i = 1; i < route.path.length - 1; i++) {
      const [col, row] = route.path[i]!.split(",").map(Number) as [number, number];
      const tile = getTile(s.map, col, row);
      if (tile) {
        tile.road = true;
        tile.roadLevel = 3;
      }
    }
    from.buildings.push("market", "bank");
    const after = tradeRouteYield(s, route);

    // Gold clearly grows, and so does every other yield the caravan carries.
    expect(after.gold).toBeGreaterThan(before.gold);
    expect(after.food).toBeGreaterThan(before.food);
    expect(after.production).toBeGreaterThan(before.production);
    expect(after.science).toBeGreaterThan(before.science);
    expect(after.culture).toBeGreaterThan(before.culture);
  });

  it("counts a city that sits along the route as a road hub", () => {
    const { s, from, to } = gameWithTwoCities();
    // Drop a third owned city on the direct line between the two endpoints.
    const midCol = from.col + 3;
    const midId = s.nextEntityId++;
    const mid: City = {
      id: midId, ownerId: 0, name: "Midtown", col: midCol, row: from.row, population: 1,
      foodStored: 0, productionStored: 0, production: null, buildings: [], specialists: [], wonders: [], workedTiles: [],
      isCapital: false, foundedAsCapital: false, hp: 100, lastAttackedTurn: 0, rangedAttackUsed: false, training: {}, trainingQueue: [], modifiers: [],
    };
    s.cities.set(midId, mid);

    const tid = s.nextEntityId++;
    s.units.set(tid, makeUnit(tid, 0, "trader", from.col, from.row));
    establishTradeRoute(s, tid, to.id, 0);
    const route = s.tradeRoutes[0]!;
    // Road every intermediate tile *except* the city tile (a city has no road flag).
    for (let i = 1; i < route.path.length - 1; i++) {
      const [col, row] = route.path[i]!.split(",").map(Number) as [number, number];
      if (col === midCol && row === from.row) continue; // the city hub
      const tile = getTile(s.map, col, row);
      if (tile) {
        tile.road = true;
        tile.roadLevel = 2;
      }
    }
    // The city bridges the road chain, so the paved-road bonus still applies.
    expect(tradeRouteGoldBreakdown(s, route).roadTier).toBe(2);
  });
});

import { ensureContact, relationBetween, declareWar } from "./diplomacy";

describe("international trade routes", () => {
  function twoCivsWithCities() {
    const { s, from } = gameWithTwoCities();
    const id = s.nextEntityId++;
    const c1: City = {
      id, ownerId: 1, name: "Foreign", col: from.col + 6, row: from.row, population: 1,
      foodStored: 0, productionStored: 0, production: null, buildings: [], specialists: [], wonders: [], workedTiles: [],
      isCapital: false, foundedAsCapital: false, hp: 100, lastAttackedTurn: 0, rangedAttackUsed: false, training: {}, trainingQueue: [], modifiers: [],
    };
    s.cities.set(id, c1);
    ensureContact(s, 0, 1);
    return { s, c0: from, c1 };
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
