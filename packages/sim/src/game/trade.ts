// Trade routes. A Trader unit (unlocked by The Wheel) is consumed in one of your
// cities to establish a permanent route to another of your cities. The route
// yields gold (scaling with distance + Markets) plus a little food/production to
// the origin city, and a small share to the destination. Routes are pruned when
// either endpoint is lost or changes owner.

import { axialDistance, getTile, offsetToAxial } from "@roc/shared";
import type { City, GameState, TradeRoute, Unit } from "./state";
import { cityAt, log, playerById } from "./state";
import { UNIT_DEFS } from "./content";
import { isPassableLand, isWaterTerrain, moveCost, type TerrainType } from "./terrain";
import { offsetNeighbors } from "./movement";
import { emitTradeRouteEstablished } from "./turn-updates";

export interface TradeYield {
  gold: number;
  food: number;
  production: number;
  science: number;
}

const ZERO: TradeYield = { gold: 0, food: 0, production: 0, science: 0 };
const MAX_ROUTE_GOLD = 10;

/** Bonus gold for a route whose entire land path is paved with roads.
 *  The weakest road tier along the path determines the bonus. */
const ROAD_BONUS_BY_TIER: Record<number, number> = { 1: 2, 2: 4, 3: 6 };

const ax = (c: { col: number; row: number }) => offsetToAxial({ col: c.col, row: c.row });

/** Once Sailing is researched a player's rivers become navigable trade arteries,
 *  carrying caravans like a road and counting as a top-grade road for the route
 *  connection bonus. */
function riversConnectFor(state: GameState, ownerId: number): boolean {
  return !!playerById(state, ownerId)?.researched.has("sailing");
}

/** Extra gold when every intermediate tile of a route is paved with road — or,
 *  for a player with Sailing, threaded by a river (a top-grade artery). Returns
 *  the weakest tier bonus along the path, or 0 if any land tile is unconnected.
 *  Water tiles in the path naturally prevent the bonus. */
function roadConnectionBonus(state: GameState, route: TradeRoute): number {
  if (route.path.length < 3) return 0;
  const riverConnects = riversConnectFor(state, route.ownerId);
  let minTier = Number.MAX_SAFE_INTEGER;
  for (let i = 1; i < route.path.length - 1; i++) {
    const key = route.path[i];
    if (!key) return 0;
    const [col, row] = key.split(",").map(Number) as [number, number];
    const tile = getTile(state.map, col, row);
    if (!tile) return 0;
    // A river (with Sailing) counts as the best grade of road; otherwise the tile
    // must carry an actual road or the connection bonus is lost.
    const tier = tile.road ? tile.roadLevel ?? 1 : riverConnects && tile.river ? 3 : 0;
    if (tier === 0) return 0;
    if (tier < minTier) minTier = tier;
  }
  if (minTier === Number.MAX_SAFE_INTEGER) return 0;
  return ROAD_BONUS_BY_TIER[minTier] ?? 0;
}

/** Per-turn yields a single route generates (granted to the origin city). */
export function tradeRouteYield(state: GameState, route: TradeRoute): TradeYield {
  const from = state.cities.get(route.fromCityId);
  const to = state.cities.get(route.toCityId);
  if (!from || !to) return ZERO;
  const dist = axialDistance(ax(from), ax(to));
  let gold = Math.min(MAX_ROUTE_GOLD, 3 + Math.floor(dist / 2));
  if (from.buildings.includes("market")) gold += 2;
  if (to.buildings.includes("market")) gold += 1;
  gold += roadConnectionBonus(state, route);
  const science = to.buildings.includes("library") || to.buildings.includes("academy") ? 1 : 0;
  return { gold, food: 1, production: 1, science };
}

/** Total trade yields a city receives — full as an origin, a small share as a
 *  destination. Folded into getCityYields so routes show up in the city panel. */
export function cityTradeYields(state: GameState, city: City): TradeYield {
  let gold = 0;
  let food = 0;
  let production = 0;
  let science = 0;
  for (const r of state.tradeRoutes) {
    if (r.fromCityId === city.id) {
      const y = tradeRouteYield(state, r);
      gold += y.gold;
      food += y.food;
      production += y.production;
      science += y.science;
    } else if (r.toCityId === city.id) {
      gold += 1; // the receiving end gains a little commerce + knowledge
      science += 1;
    }
  }
  return { gold, food, production, science };
}

export function tradeRoutesOf(state: GameState, playerId: number): TradeRoute[] {
  return state.tradeRoutes.filter((r) => r.ownerId === playerId);
}

/** Routes that originate at a given city (for the city panel). */
export function tradeRoutesFrom(state: GameState, cityId: number): TradeRoute[] {
  return state.tradeRoutes.filter((r) => r.fromCityId === cityId);
}

/** Cities a trader (standing in one of its owner's cities) can connect to. */
export function tradeRouteDestinations(state: GameState, unit: Unit): City[] {
  if (!UNIT_DEFS[unit.type].trader) return [];
  const origin = cityAt(state, unit.col, unit.row);
  if (!origin || origin.ownerId !== unit.ownerId) return [];
  return [...state.cities.values()].filter(
    (c) =>
      c.ownerId === unit.ownerId &&
      c.id !== origin.id &&
      !state.tradeRoutes.some((r) => r.fromCityId === origin.id && r.toCityId === c.id),
  );
}

export function canEstablishTradeRoute(state: GameState, unit: Unit): boolean {
  return tradeRouteDestinations(state, unit).length > 0;
}

/** Cost for a caravan to traverse a tile when routing. Roads are strongly
 *  preferred so a route hugs an existing road network when one is nearby;
 *  open land is cheap, rough terrain costs more, and water is a last resort. */
function caravanTileCost(tile: { terrain: TerrainType; road?: boolean; river?: number }, riverConnects: boolean): number {
  if (riverConnects && tile.river) return 0.45; // follow rivers in preference to roads
  if (tile.road) return 0.5; // hugging a road is cheapest of all
  if (isWaterTerrain(tile.terrain)) return 3; // detour over water only when unavoidable
  return moveCost(tile.terrain); // 1 for open land, 2 for rough (forest/jungle/hills/mesa)
}

/** Find the cheapest passable path between two cities, preferring roads, via a
 *  weighted Dijkstra over the hex grid. Untraversable terrain (mountains,
 *  volcanoes) is skipped. The resulting tile keys drive caravan rendering,
 *  plundering and the road-connection bonus. */
function computeTradeRoutePath(state: GameState, from: City, to: City): string[] {
  const start = `${from.col},${from.row}`;
  const goal = `${to.col},${to.row}`;
  if (start === goal) return [start];
  const riverConnects = riversConnectFor(state, from.ownerId);

  const dist = new Map<string, number>();
  const cameFrom = new Map<string, string>();
  dist.set(start, 0);
  cameFrom.set(start, "");

  // Linear-scan Dijkstra; routes are established rarely so this is plenty fast.
  const frontier: string[] = [start];
  while (frontier.length > 0) {
    let bi = 0;
    for (let i = 1; i < frontier.length; i++) {
      if (dist.get(frontier[i]!)! < dist.get(frontier[bi]!)!) bi = i;
    }
    const key = frontier.splice(bi, 1)[0]!;
    if (key === goal) break;
    const curCost = dist.get(key)!;
    const [col, row] = key.split(",").map(Number) as [number, number];
    for (const n of offsetNeighbors(state.map, col, row)) {
      const tile = getTile(state.map, n.col, n.row);
      if (!tile || (!isPassableLand(tile.terrain) && !isWaterTerrain(tile.terrain))) continue;
      const nk = `${n.col},${n.row}`;
      const next = curCost + caravanTileCost(tile, riverConnects);
      if (next < (dist.get(nk) ?? Infinity)) {
        dist.set(nk, next);
        cameFrom.set(nk, key);
        frontier.push(nk);
      }
    }
  }

  if (!cameFrom.has(goal)) {
    // No passable path found: fall back to a direct endpoint-only path.
    return [start, goal];
  }
  const path: string[] = [goal];
  let cur = goal;
  while (cameFrom.get(cur) !== "") {
    cur = cameFrom.get(cur)!;
    path.unshift(cur);
  }
  return path;
}

export interface TradeResult {
  ok: boolean;
  error?: string;
}

/** Consume the trader and create a route from its city to `destCityId`. */
export function establishTradeRoute(
  state: GameState,
  unitId: number,
  destCityId: number,
  actingPlayerId: number,
): TradeResult {
  const unit = state.units.get(unitId);
  if (!unit) return { ok: false, error: "no such unit" };
  if (unit.ownerId !== actingPlayerId) return { ok: false, error: "not your unit" };
  if (!UNIT_DEFS[unit.type].trader) return { ok: false, error: "not a trader" };
  const origin = cityAt(state, unit.col, unit.row);
  if (!origin || origin.ownerId !== unit.ownerId) {
    return { ok: false, error: "trader must be in one of your cities" };
  }
  const dest = state.cities.get(destCityId);
  if (!dest || dest.ownerId !== unit.ownerId) return { ok: false, error: "invalid destination" };
  if (dest.id === origin.id) return { ok: false, error: "choose a different city" };
  if (state.tradeRoutes.some((r) => r.fromCityId === origin.id && r.toCityId === dest.id)) {
    return { ok: false, error: "route already exists" };
  }
  const routeId = state.nextEntityId++;
  state.tradeRoutes.push({
    id: routeId,
    ownerId: unit.ownerId,
    fromCityId: origin.id,
    toCityId: dest.id,
    path: computeTradeRoutePath(state, origin, dest),
  });
  state.units.delete(unit.id);
  const owner = playerById(state, unit.ownerId);
  log(state, `${owner?.name ?? "A trader"} opened a trade route ${origin.name} → ${dest.name}.`, {
    actorId: unit.ownerId,
    targetIds: [unit.ownerId],
    tile: { col: origin.col, row: origin.row },
  });
  if (owner && !owner.isBarbarian) {
    emitTradeRouteEstablished(
      state,
      owner.id,
      routeId,
      origin.name,
      dest.name,
      origin.col,
      origin.row,
      dest.col,
      dest.row,
    );
  }
  return { ok: true };
}

/** Drop routes whose endpoints no longer exist or have changed owner. */
export function pruneTradeRoutes(state: GameState): void {
  state.tradeRoutes = state.tradeRoutes.filter((r) => {
    const from = state.cities.get(r.fromCityId);
    const to = state.cities.get(r.toCityId);
    return !!from && !!to && from.ownerId === r.ownerId && to.ownerId === r.ownerId;
  });
}
