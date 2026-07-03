// Trade routes. A Trader unit (unlocked by The Wheel) is consumed in one of your
// cities to establish a permanent route to another of your cities. The route yields
// gold (scaling with distance, Markets/Banks, roads and cross-border reach), and
// every other yield — food, production, science, culture — rides on that same value,
// so improving a route lifts all of them. The origin city takes the bulk; the
// destination a smaller share. Routes are pruned when either endpoint is lost or
// changes owner.

import { axialDistance, getTile, offsetToAxial } from "@roc/shared";
import type { City, GameState, TradeRoute, Unit } from "./state";
import { cityAt, log, playerById } from "./state";
import { UNIT_DEFS } from "./content";
import { isPassableLand, isWaterTerrain, moveCost, type TerrainType } from "./terrain";
import { offsetNeighbors, riverBetween, tileHasBridge } from "./movement";
import { relationBetween, atWar } from "./diplomacy";
import { emitTradeRouteEstablished } from "./turn-updates";

/** Whether two civs' commerce may flow freely — the gate for an international
 *  trade route: they've met, aren't at war, and have open borders or an alliance. */
export function canTradeInternational(state: GameState, fromOwner: number, toOwner: number): boolean {
  if (fromOwner === toOwner) return true;
  const a = playerById(state, fromOwner);
  const b = playerById(state, toOwner);
  if (!a || !b || a.isBarbarian || b.isBarbarian) return false;
  if (atWar(state, fromOwner, toOwner)) return false;
  const rel = relationBetween(state, fromOwner, toOwner);
  return !!rel && (rel.openBorders || rel.pact === "alliance");
}

export interface TradeYield {
  gold: number;
  food: number;
  production: number;
  science: number;
  culture: number;
}

const ZERO: TradeYield = { gold: 0, food: 0, production: 0, science: 0, culture: 0 };
/** The distance-based base gold is capped here; roads (and buildings) lift a route
 *  above this ceiling, so paving a route is the way to grow it past the early game. */
const MAX_ROUTE_GOLD = 10;

/** Bonus gold for a route whose entire land path is connected by roads (or, with
 *  Sailing, rivers). The weakest road tier along the path determines the bonus, and
 *  upgrading the road — Dirt → Paved → Imperial — clearly lifts the route past the
 *  base cap. */
const ROAD_BONUS_BY_TIER: Record<number, number> = { 1: 3, 2: 6, 3: 9 };

const ax = (c: { col: number; row: number }) => offsetToAxial({ col: c.col, row: c.row });

/** Once Sailing is researched a player's rivers become navigable trade arteries,
 *  carrying caravans like a road and counting as a top-grade road for the route
 *  connection bonus. */
function riversConnectFor(state: GameState, ownerId: number): boolean {
  return !!playerById(state, ownerId)?.researched.has("sailing");
}

/** The weakest road tier (1–3) along a route whose entire land path is connected —
 *  by road, a city hub, or (with Sailing) a river. Returns 0 when any intermediate
 *  land tile is unconnected, so the caller pays no bonus. Cities count as top-grade
 *  hubs: a route chained through other cities stays connected across them, and they
 *  never drag the bonus down. Water tiles in the path naturally prevent the bonus. */
function roadConnectionTier(state: GameState, route: TradeRoute): number {
  if (route.path.length < 3) return 0;
  const riverConnects = riversConnectFor(state, route.ownerId);
  const coords: [number, number][] = [];
  for (const key of route.path) {
    if (!key) return 0;
    coords.push(key.split(",").map(Number) as [number, number]);
  }
  let minTier = Number.MAX_SAFE_INTEGER;
  for (let i = 1; i < coords.length - 1; i++) {
    const [col, row] = coords[i]!;
    // A city is a trade hub: the caravan passes through it as if on a top-grade
    // road, so it keeps the chain intact but never lowers the connection tier.
    if (cityAt(state, col, row)) continue;
    const tile = getTile(state.map, col, row);
    if (!tile) return 0;
    // A river (with Sailing) counts as the best grade of road; otherwise the tile
    // must carry an actual road or the connection bonus is lost.
    const tier = tile.road ? tile.roadLevel ?? 1 : riverConnects && tile.river ? 3 : 0;
    if (tier === 0) return 0;
    if (tier < minTier) minTier = tier;
  }
  // A river crossing the path severs the road connection unless a bridge carries the
  // road over it — or the player has Sailing, which makes rivers navigable arteries.
  // A city on either side spans the crossing as well (its bridges are implicit).
  if (!riverConnects) {
    for (let i = 0; i < coords.length - 1; i++) {
      const [c1, r1] = coords[i]!;
      const [c2, r2] = coords[i + 1]!;
      if (
        riverBetween(state, c1, r1, c2, r2) &&
        !tileHasBridge(state, c1, r1) &&
        !tileHasBridge(state, c2, r2) &&
        !cityAt(state, c1, r1) &&
        !cityAt(state, c2, r2)
      ) {
        return 0;
      }
    }
  }
  if (minTier === Number.MAX_SAFE_INTEGER) return 0;
  return minTier;
}

/** Does any tile along the route's path lie on water? (an overseas trade lane). */
function routeIsOverseas(state: GameState, route: TradeRoute): boolean {
  for (const key of route.path) {
    const [col, row] = key.split(",").map(Number) as [number, number];
    const tile = getTile(state.map, col, row);
    if (tile && isWaterTerrain(tile.terrain)) return true;
  }
  return false;
}

/** A route's gold, itemised so the Trade overview can show players exactly where a
 *  route's income comes from — and how paving it (road tier) grows it past the base
 *  cap. `total` is the gold actually granted per turn. */
export interface TradeGoldBreakdown {
  /** Distance-based base income, capped at MAX_ROUTE_GOLD. */
  base: number;
  /** Extra from Markets (both ends) and a Bank at the origin. */
  buildings: number;
  /** Road-/river-connection bonus (0 when the path isn't fully connected). */
  road: number;
  /** Connection tier driving the road bonus: 0 none, 1 Dirt, 2 Paved, 3 Imperial. */
  roadTier: number;
  /** Extra gold from the international ×1.5 premium (0 for a domestic route). */
  international: number;
  /** Overseas (over-water) lane premium. */
  overseas: number;
  /** Whether this route crosses another civ's border (drives the intl premium). */
  isInternational: boolean;
  /** Gold actually paid to the origin each turn. */
  total: number;
}

function isInternationalRoute(route: TradeRoute): boolean {
  return !!route.international || (route.toOwnerId !== undefined && route.toOwnerId !== route.ownerId);
}

/** Itemised gold for a route (see TradeGoldBreakdown). Also drives tradeRouteYield. */
export function tradeRouteGoldBreakdown(state: GameState, route: TradeRoute): TradeGoldBreakdown {
  const empty: TradeGoldBreakdown = {
    base: 0, buildings: 0, road: 0, roadTier: 0, international: 0, overseas: 0, isInternational: false, total: 0,
  };
  const from = state.cities.get(route.fromCityId);
  const to = state.cities.get(route.toCityId);
  if (!from || !to) return empty;
  const dist = axialDistance(ax(from), ax(to));
  const base = Math.min(MAX_ROUTE_GOLD, 3 + Math.floor(dist / 2));
  let buildings = 0;
  if (from.buildings.includes("market")) buildings += 2;
  if (to.buildings.includes("market")) buildings += 1;
  if (from.buildings.includes("bank")) buildings += 3;
  const roadTier = roadConnectionTier(state, route);
  const road = ROAD_BONUS_BY_TIER[roadTier] ?? 0;
  const isInternational = isInternationalRoute(route);
  // International routes are far richer: the whole land yield is boosted ×1.5.
  const preIntl = base + buildings + road;
  const international = isInternational ? Math.round(preIntl * 1.5) - preIntl : 0;
  // Overseas lanes (the Age of Exploration's spice routes) pay a further flat premium.
  const overseas = routeIsOverseas(state, route) ? 4 : 0;
  const total = preIntl + international + overseas;
  return { base, buildings, road, roadTier, international, overseas, isInternational, total };
}

/** Per-turn yields a single route generates (granted to the origin city). */
export function tradeRouteYield(state: GameState, route: TradeRoute): TradeYield {
  const from = state.cities.get(route.fromCityId);
  const to = state.cities.get(route.toCityId);
  if (!from || !to) return ZERO;
  const b = tradeRouteGoldBreakdown(state, route);
  const g = b.total;
  // Every yield rides on the route's overall value, so anything that grows a route —
  // paving and upgrading its roads, Markets/Banks at the ends, reaching a foreign
  // partner or an overseas port, or simply spanning a longer distance — lifts its
  // food, production, science and culture too, not just its gold. Gold stays the
  // headline (full value); the others accrue at a gentler rate.
  const food = 1 + Math.floor(g / 8);
  const production = 1 + Math.floor(g / 8);
  let science = (to.buildings.includes("library") || to.buildings.includes("academy") ? 1 : 0) + Math.floor(g / 12);
  let culture = Math.floor(g / 12);
  // International routes exchange a little extra knowledge & culture on top.
  if (b.isInternational) {
    science += 1;
    culture += 1;
  }
  return { gold: g, food, production, science, culture };
}

/** Total trade yields a city receives — full as an origin, a small share as a
 *  destination. Folded into getCityYields so routes show up in the city panel. */
export function cityTradeYields(state: GameState, city: City): TradeYield {
  let gold = 0;
  let food = 0;
  let production = 0;
  let science = 0;
  let culture = 0;
  for (const r of state.tradeRoutes) {
    if (r.fromCityId === city.id) {
      const y = tradeRouteYield(state, r);
      gold += y.gold;
      food += y.food;
      production += y.production;
      science += y.science;
      culture += y.culture;
    } else if (r.toCityId === city.id) {
      // The receiving end gains a little commerce + knowledge — more from an
      // international partner (mutual gains from cross-border trade).
      gold += r.international ? 3 : 1;
      science += 1;
      if (r.international) culture += 1;
    }
  }
  return { gold, food, production, science, culture };
}

export function tradeRoutesOf(state: GameState, playerId: number): TradeRoute[] {
  return state.tradeRoutes.filter((r) => r.ownerId === playerId);
}

/** Routes that originate at a given city (for the city panel). */
export function tradeRoutesFrom(state: GameState, cityId: number): TradeRoute[] {
  return state.tradeRoutes.filter((r) => r.fromCityId === cityId);
}

/** Cities a trader (standing in one of its owner's cities) can connect to — its
 *  owner's own cities, plus the cities of any civ it may trade with internationally. */
export function tradeRouteDestinations(state: GameState, unit: Unit): City[] {
  if (!UNIT_DEFS[unit.type].trader) return [];
  const origin = cityAt(state, unit.col, unit.row);
  if (!origin || origin.ownerId !== unit.ownerId) return [];
  return [...state.cities.values()].filter(
    (c) =>
      c.id !== origin.id &&
      (c.ownerId === unit.ownerId || canTradeInternational(state, unit.ownerId, c.ownerId)) &&
      !state.tradeRoutes.some((r) => r.fromCityId === origin.id && r.toCityId === c.id),
  );
}

export function canEstablishTradeRoute(state: GameState, unit: Unit): boolean {
  return tradeRouteDestinations(state, unit).length > 0;
}

/** Cost for a caravan to traverse a tile when routing. Roads (and, with Sailing,
 *  rivers) are made drastically cheaper than open land — roughly an order of
 *  magnitude — so a route follows an existing road network even when that network
 *  wanders a much longer way round, chaining through the cities and roads that link
 *  two settlements rather than cutting cross-country. Better road tiers are slightly
 *  cheaper still, so the caravan favours the finest highway; cities are top-grade
 *  hubs; open land is cheap, rough terrain costs more, and water is a last resort. */
function caravanTileCost(
  state: GameState,
  tile: { terrain: TerrainType; road?: boolean; roadLevel?: number; river?: number },
  col: number,
  row: number,
  riverConnects: boolean,
): number {
  if (cityAt(state, col, row)) return 0.08; // a city is a road hub — traverse it freely
  if (tile.road) {
    const tier = tile.roadLevel ?? 1;
    return tier >= 3 ? 0.08 : tier === 2 ? 0.1 : 0.12; // hug roads, prefer the better grade
  }
  if (riverConnects && tile.river) return 0.1; // a navigable river carries the caravan like a road
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
      const next = curCost + caravanTileCost(state, tile, n.col, n.row, riverConnects);
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
  if (!dest) return { ok: false, error: "invalid destination" };
  const international = dest.ownerId !== unit.ownerId;
  if (international && !canTradeInternational(state, unit.ownerId, dest.ownerId)) {
    return { ok: false, error: "need open borders or an alliance to trade with them" };
  }
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
    toOwnerId: dest.ownerId,
    international,
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

/** Cancel an existing route, e.g. to stop it being raided. The trader that
 *  established it is gone for good — there is no refund. */
export function cancelTradeRoute(state: GameState, routeId: number, actingPlayerId: number): TradeResult {
  const route = state.tradeRoutes.find((r) => r.id === routeId);
  if (!route) return { ok: false, error: "no such route" };
  if (route.ownerId !== actingPlayerId) return { ok: false, error: "not your route" };
  state.tradeRoutes = state.tradeRoutes.filter((r) => r.id !== routeId);
  const from = state.cities.get(route.fromCityId);
  const to = state.cities.get(route.toCityId);
  const owner = playerById(state, actingPlayerId);
  log(state, `${owner?.name ?? "A trader"} closed the trade route ${from?.name ?? "?"} → ${to?.name ?? "?"}.`, {
    actorId: actingPlayerId,
    targetIds: [actingPlayerId],
    tile: from ? { col: from.col, row: from.row } : undefined,
  });
  return { ok: true };
}

/** Drop routes whose endpoints no longer exist or have changed owner. An
 *  international route is also severed if the civs fall out of trading terms
 *  (war declared, or open borders / alliance lapsed). */
export function pruneTradeRoutes(state: GameState): void {
  state.tradeRoutes = state.tradeRoutes.filter((r) => {
    const from = state.cities.get(r.fromCityId);
    const to = state.cities.get(r.toCityId);
    if (!from || !to || from.ownerId !== r.ownerId) return false;
    if (r.international) {
      // The destination must still belong to the partner we agreed to trade with.
      if (to.ownerId !== r.toOwnerId) return false;
      return canTradeInternational(state, r.ownerId, to.ownerId);
    }
    return to.ownerId === r.ownerId;
  });
}
