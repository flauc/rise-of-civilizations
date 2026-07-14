// Trade routes. A Trader unit (unlocked by The Wheel) is consumed in one of your
// cities to establish a permanent route to another city. Routes pay a flat base
// gold (distance does not change income), plus Markets/Banks, fully roaded paths,
// and cross-border or overseas premiums. Caravans chain through your port cities
// to reach distant shores in one action. The origin city takes the bulk; the
// destination a smaller share. Routes are pruned when either endpoint is lost or
// changes owner.

import { getTile } from "@roc/shared";
import type { City, GameState, TradeRoute, Unit } from "./state";
import { cityAt, log, playerById, unitAt } from "./state";
import { UNIT_DEFS, isMilitary, type UnitTypeId } from "./content";
import { isPassableLand, isWaterTerrain, moveCost, type TerrainType } from "./terrain";
import { offsetNeighbors, riverBetween, tileHasBridge, isCoastalLand } from "./movement";
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
/** Every route earns the same base gold; distance does not change income. Roads and
 *  buildings lift yields above this floor. */
const BASE_ROUTE_GOLD = 4;

/** Bonus gold for a route whose entire land path is connected by roads (or, with
 *  Sailing, rivers). The weakest road tier along the path determines the bonus, and
 *  upgrading the road — Dirt → Paved → Imperial — clearly lifts the route past the
 *  base cap. */
const ROAD_BONUS_BY_TIER: Record<number, number> = { 1: 2, 2: 4, 3: 6 };

/** Tiles queued on the player's agrimensore road routes — caravans prefer them even
 *  before paving finishes so trade lanes hug planned highways. */
function plannedRoadTileKeys(state: GameState, ownerId: number): Set<string> {
  const keys = new Set<string>();
  for (const rr of state.roadRoutes) {
    if (rr.ownerId !== ownerId) continue;
    for (const t of rr.queue) keys.add(`${t.col},${t.row}`);
  }
  return keys;
}

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
  /** Flat base income — identical for every route length. */
  base: number;
  /** Extra from Markets (both ends) and a Bank at the origin. */
  buildings: number;
  /** Road-/river-connection bonus (0 when the path isn't fully connected). */
  road: number;
  /** Connection tier driving the road bonus: 0 none, 1 Dirt, 2 Paved, 3 Imperial. */
  roadTier: number;
  /** Extra gold from the international ×1.25 premium (0 for a domestic route). */
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
  const base = BASE_ROUTE_GOLD;
  let buildings = 0;
  if (from.buildings.includes("market")) buildings += 2;
  if (to.buildings.includes("market")) buildings += 1;
  if (from.buildings.includes("bank")) buildings += 3;
  const roadTier = roadConnectionTier(state, route);
  const road = ROAD_BONUS_BY_TIER[roadTier] ?? 0;
  const isInternational = isInternationalRoute(route);
  // International routes earn a modest premium over domestic commerce.
  const preIntl = base + buildings + road;
  const international = isInternational ? Math.round(preIntl * 1.25) - preIntl : 0;
  // Overseas lanes (the Age of Exploration's spice routes) pay a small flat premium.
  const overseas = routeIsOverseas(state, route) ? 2 : 0;
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
  // Every yield rides on the route's overall value, so paving its roads, Markets/Banks
  // at the ends, or reaching a foreign partner lifts food, production, science and
  // culture too — not just gold.
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
      gold += r.international ? 2 : 1;
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

/** True when a city sits on coastal land (a harbour — not open ocean). */
export function isCoastalPortCity(state: GameState, city: City): boolean {
  return isCoastalLand(state, city.col, city.row);
}

/** Whether a computed path crosses any water tile. */
function pathUsesWater(state: GameState, path: string[]): boolean {
  for (const key of path) {
    const [col, row] = key.split(",").map(Number) as [number, number];
    const tile = getTile(state.map, col, row);
    if (tile && isWaterTerrain(tile.terrain)) return true;
  }
  return false;
}

/** Whether a direct caravan path links two cities (no multi-hop through hubs). */
export function canConnectCitiesDirect(state: GameState, from: City, to: City): boolean {
  const path = computeTradeRoutePath(state, from, to);
  if (path.length < 2) return false;
  if (pathUsesWater(state, path) && !(isCoastalPortCity(state, from) && isCoastalPortCity(state, to))) {
    return false;
  }
  return true;
}

const MAX_TRADE_HUB_HOPS = 12;

/** Sum caravan traversal cost along a stored tile path. */
export function pathCaravanCost(state: GameState, path: string[], ownerId: number): number {
  if (path.length < 2) return Infinity;
  const riverConnects = riversConnectFor(state, ownerId);
  const plannedRoadKeys = plannedRoadTileKeys(state, ownerId);
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    const [col, row] = path[i]!.split(",").map(Number) as [number, number];
    const tile = getTile(state.map, col, row);
    if (!tile) return Infinity;
    total += caravanTileCost(state, tile, col, row, riverConnects, plannedRoadKeys);
  }
  return total;
}

function segmentCaravanCost(state: GameState, from: City, to: City): number {
  const path = computeTradeRoutePath(state, from, to);
  if (path.length < 2) return Infinity;
  if (pathUsesWater(state, path) && !(isCoastalPortCity(state, from) && isCoastalPortCity(state, to))) {
    return Infinity;
  }
  return pathCaravanCost(state, path, from.ownerId);
}

/** Cheapest chain of cities linking origin to destination, hopping through owned
 *  ports when a direct lane is blocked by open ocean. */
export function findTradeHubChain(state: GameState, from: City, to: City): City[] | null {
  if (from.id === to.id) return null;

  const ownerId = from.ownerId;
  const candidates = [...state.cities.values()].filter(
    (c) => !playerById(state, c.ownerId)?.isBarbarian && (c.ownerId === ownerId || c.id === to.id),
  );
  const byId = new Map(candidates.map((c) => [c.id, c]));
  if (!byId.has(from.id) || !byId.has(to.id)) return null;

  const dist = new Map<number, number>();
  const prev = new Map<number, number>();
  dist.set(from.id, 0);

  const settled = new Set<number>();
  while (settled.size < candidates.length) {
    let cur: number | null = null;
    let best = Infinity;
    for (const c of candidates) {
      if (settled.has(c.id)) continue;
      const d = dist.get(c.id);
      if (d === undefined || d >= best) continue;
      best = d;
      cur = c.id;
    }
    if (cur === null || best === Infinity) break;
    settled.add(cur);

    if (cur === to.id) {
      const chain: City[] = [];
      let walk: number | undefined = to.id;
      while (walk !== undefined) {
        chain.unshift(byId.get(walk)!);
        if (walk === from.id) break;
        walk = prev.get(walk);
      }
      return chain.length >= 2 && chain.length <= MAX_TRADE_HUB_HOPS ? chain : null;
    }

    const last = byId.get(cur)!;
    for (const cand of candidates) {
      if (cand.id === last.id || settled.has(cand.id)) continue;
      const seg = segmentCaravanCost(state, last, cand);
      if (!Number.isFinite(seg)) continue;
      const next = best + seg;
      if (next < (dist.get(cand.id) ?? Infinity)) {
        dist.set(cand.id, next);
        prev.set(cand.id, cur);
      }
    }
  }
  return null;
}

/** Intermediate hub city names on a route (empty when direct). */
export function tradeRouteViaNames(state: GameState, from: City, to: City): string[] {
  const chain = findTradeHubChain(state, from, to);
  if (!chain || chain.length <= 2) return [];
  return chain.slice(1, -1).map((c) => c.name);
}

/** Human-readable via line for UI — highlights the player's departure port on sea lanes. */
export function tradeRouteViaMessage(state: GameState, from: City, to: City): string | null {
  const chain = findTradeHubChain(state, from, to);
  if (!chain || chain.length <= 2) return null;
  const path = computeChainedTradePath(state, chain);
  const hubs = chain.slice(1, -1);
  if (hubs.length === 0) return null;
  const overseas = pathUsesWater(state, path);
  if (overseas && !isCoastalPortCity(state, from)) {
    const depart =
      hubs.find((c) => c.ownerId === from.ownerId && isCoastalPortCity(state, c)) ?? hubs[0]!;
    const rest = hubs.filter((c) => c.id !== depart.id).map((c) => c.name);
    if (rest.length === 0) return `your port ${depart.name}`;
    return `your port ${depart.name}, then ${rest.join(", ")}`;
  }
  return hubs.map((c) => c.name).join(", ");
}

/** Recompute every route's tile path when a faster lane opens (e.g. new roads). */
export function refreshTradeRoutePaths(state: GameState): number {
  let updated = 0;
  for (const route of state.tradeRoutes) {
    const from = state.cities.get(route.fromCityId);
    const to = state.cities.get(route.toCityId);
    if (!from || !to) continue;
    const draft = draftTradeRoute(state, from, to);
    if (!draft) continue;
    const oldCost = pathCaravanCost(state, route.path, route.ownerId);
    const newCost = pathCaravanCost(state, draft.path, route.ownerId);
    const pathChanged = draft.path.join("|") !== route.path.join("|");
    if (newCost < oldCost - 1e-6 || (pathChanged && newCost <= oldCost + 1e-6)) {
      route.path = draft.path;
      route.viaCityIds = draft.viaCityIds;
      updated++;
    }
  }
  return updated;
}

/** Stitch segment paths into one caravan track, dropping duplicate join tiles. */
function computeChainedTradePath(state: GameState, chain: City[]): string[] {
  const full: string[] = [];
  for (let i = 0; i < chain.length - 1; i++) {
    const seg = computeTradeRoutePath(state, chain[i]!, chain[i + 1]!);
    if (seg.length < 2) return [];
    if (full.length === 0) full.push(...seg);
    else full.push(...seg.slice(1));
  }
  return full;
}

/** Build a draft route (path + hub ids) for previews and establishment. */
export function draftTradeRoute(state: GameState, from: City, to: City): Omit<TradeRoute, "id"> | null {
  const chain = findTradeHubChain(state, from, to);
  if (!chain) return null;
  const path = computeChainedTradePath(state, chain);
  if (path.length < 2) return null;
  const international = to.ownerId !== from.ownerId;
  const viaCityIds = chain.length > 2 ? chain.slice(1, -1).map((c) => c.id) : undefined;
  return {
    ownerId: from.ownerId,
    fromCityId: from.id,
    toCityId: to.id,
    toOwnerId: to.ownerId,
    international,
    path,
    viaCityIds,
  };
}

/** Whether a caravan can link two cities, including multi-hop through owned hubs. */
export function canConnectCities(state: GameState, from: City, to: City): boolean {
  return findTradeHubChain(state, from, to) !== null;
}

/** Cities a trader (standing in one of its owner's cities) can connect to. */
export function tradeRouteDestinations(state: GameState, unit: Unit): City[] {
  if (!UNIT_DEFS[unit.type].trader) return [];
  const origin = cityAt(state, unit.col, unit.row);
  if (!origin || origin.ownerId !== unit.ownerId) return [];
  return [...state.cities.values()].filter(
    (c) =>
      c.id !== origin.id &&
      (c.ownerId === unit.ownerId || canTradeInternational(state, unit.ownerId, c.ownerId)) &&
      !state.tradeRoutes.some((r) => r.fromCityId === origin.id && r.toCityId === c.id) &&
      canConnectCities(state, origin, c),
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
  plannedRoadKeys: Set<string>,
): number {
  const key = `${col},${row}`;
  if (cityAt(state, col, row)) return 0.08; // a city is a road hub — traverse it freely
  if (tile.road) {
    const tier = tile.roadLevel ?? 1;
    return tier >= 3 ? 0.06 : tier === 2 ? 0.08 : 0.1; // hug roads, prefer the better grade
  }
  if (plannedRoadKeys.has(key)) return 0.05; // snap to agrimensore road routes before paving
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
  const plannedRoadKeys = plannedRoadTileKeys(state, from.ownerId);
  const allowWater = isCoastalPortCity(state, from) && isCoastalPortCity(state, to);

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
      if (!tile) continue;
      if (isWaterTerrain(tile.terrain)) {
        if (!allowWater) continue;
      } else if (!isPassableLand(tile.terrain)) {
        continue;
      }
      const nk = `${n.col},${n.row}`;
      const next = curCost + caravanTileCost(state, tile, n.col, n.row, riverConnects, plannedRoadKeys);
      if (next < (dist.get(nk) ?? Infinity)) {
        dist.set(nk, next);
        cameFrom.set(nk, key);
        frontier.push(nk);
      }
    }
  }

  if (!cameFrom.has(goal)) return [];
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
  if (!canConnectCities(state, origin, dest)) {
    return {
      ok: false,
      error: "no caravan path between these cities — link inland settlements through your port cities",
    };
  }
  const draft = draftTradeRoute(state, origin, dest);
  if (!draft) return { ok: false, error: "no caravan path between these cities" };
  const path = draft.path;
  if (path.length < 2) return { ok: false, error: "no caravan path between these cities" };
  const routeId = state.nextEntityId++;
  state.tradeRoutes.push({
    id: routeId,
    ...draft,
  });
  state.units.delete(unit.id);
  const owner = playerById(state, unit.ownerId);
  const viaMsg = tradeRouteViaMessage(state, origin, dest);
  const viaText = viaMsg ? ` via ${viaMsg}` : "";
  log(state, `${owner?.name ?? "A trader"} opened a trade route ${origin.name} → ${dest.name}${viaText}.`, {
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
 *  established it is gone for good — there is no refund. Any escort reappears at
 *  the origin city. */
export function cancelTradeRoute(state: GameState, routeId: number, actingPlayerId: number): TradeResult {
  const route = state.tradeRoutes.find((r) => r.id === routeId);
  if (!route) return { ok: false, error: "no such route" };
  if (route.ownerId !== actingPlayerId) return { ok: false, error: "not your route" };
  const from = state.cities.get(route.fromCityId);
  releaseRouteEscort(state, route, from?.col, from?.row);
  state.tradeRoutes = state.tradeRoutes.filter((r) => r.id !== routeId);
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
  const kept: TradeRoute[] = [];
  for (const r of state.tradeRoutes) {
    const from = state.cities.get(r.fromCityId);
    const to = state.cities.get(r.toCityId);
    if (!from || !to || from.ownerId !== r.ownerId) {
      clearRouteEscort(state, r);
      continue;
    }
    if (r.international) {
      if (to.ownerId !== r.toOwnerId || !canTradeInternational(state, r.ownerId, to.ownerId)) {
        clearRouteEscort(state, r);
        continue;
      }
    } else if (to.ownerId !== r.ownerId) {
      clearRouteEscort(state, r);
      continue;
    }
    kept.push(r);
  }
  state.tradeRoutes = kept;
}

/** Routes whose path includes a tile (optionally filtered to one owner). */
export function tradeRoutesAtTile(state: GameState, col: number, row: number, ownerId?: number): TradeRoute[] {
  const key = `${col},${row}`;
  return state.tradeRoutes.filter(
    (r) => r.path.includes(key) && (ownerId === undefined || r.ownerId === ownerId),
  );
}

/** The unit guarding a route, if any. */
export function escortUnitOf(state: GameState, route: TradeRoute): Unit | undefined {
  if (route.escortUnitId === undefined) return undefined;
  return state.units.get(route.escortUnitId);
}

function clearRouteEscort(state: GameState, route: TradeRoute): void {
  const escort = escortUnitOf(state, route);
  if (escort) state.units.delete(escort.id);
  route.escortUnitId = undefined;
  route.escortType = undefined;
  route.repelledRaidTile = undefined;
}

/** Return an escort to the map at (col,row) and detach it from the route. */
function releaseRouteEscort(state: GameState, route: TradeRoute, col?: number, row?: number): void {
  const escort = escortUnitOf(state, route);
  if (!escort) {
    route.escortUnitId = undefined;
    route.escortType = undefined;
    route.repelledRaidTile = undefined;
    return;
  }
  if (col !== undefined && row !== undefined) {
    escort.col = col;
    escort.row = row;
  }
  escort.escortingRouteId = undefined;
  escort.movementLeft = 0;
  route.escortUnitId = undefined;
  route.escortType = undefined;
  route.repelledRaidTile = undefined;
}

/** Assign a military unit standing on this route's path to guard it off-map. */
export function assignTradeEscort(
  state: GameState,
  unitId: number,
  routeId: number,
  actingPlayerId: number,
): TradeResult {
  const unit = state.units.get(unitId);
  if (!unit) return { ok: false, error: "no such unit" };
  if (unit.ownerId !== actingPlayerId) return { ok: false, error: "not your unit" };
  if (!isMilitary(unit.type)) return { ok: false, error: "only military units can escort trade routes" };
  if (unit.escortingRouteId !== undefined) return { ok: false, error: "unit is already escorting a route" };
  if (unit.inTransit) return { ok: false, error: "unit is travelling a route" };
  if (unit.embarked) return { ok: false, error: "embarked units cannot escort" };
  const route = state.tradeRoutes.find((r) => r.id === routeId);
  if (!route) return { ok: false, error: "no such route" };
  if (route.ownerId !== actingPlayerId) return { ok: false, error: "not your route" };
  if (route.escortUnitId !== undefined) return { ok: false, error: "route already has an escort" };
  const key = `${unit.col},${unit.row}`;
  if (!route.path.includes(key)) return { ok: false, error: "unit must stand on the trade route" };

  route.escortUnitId = unit.id;
  route.escortType = unit.type;
  route.repelledRaidTile = undefined;
  unit.escortingRouteId = route.id;
  unit.movementLeft = 0;

  const from = state.cities.get(route.fromCityId);
  const to = state.cities.get(route.toCityId);
  const owner = playerById(state, actingPlayerId);
  log(
    state,
    `${owner?.name ?? "A caravan"} assigned a ${UNIT_DEFS[unit.type].name} to guard the route ${from?.name ?? "?"} → ${to?.name ?? "?"}.`,
    { actorId: actingPlayerId, targetIds: [actingPlayerId], tile: { col: unit.col, row: unit.row } },
  );
  return { ok: true };
}

/** After repelling a raid, order the escort off the route — it appears where the
 *  raid was attempted and the raider is pushed to a neighbouring tile. */
export function leaveTradeEscort(state: GameState, routeId: number, actingPlayerId: number): TradeResult {
  const route = state.tradeRoutes.find((r) => r.id === routeId);
  if (!route) return { ok: false, error: "no such route" };
  if (route.ownerId !== actingPlayerId) return { ok: false, error: "not your route" };
  const escort = escortUnitOf(state, route);
  if (!escort) return { ok: false, error: "route has no escort" };
  const tile = route.repelledRaidTile;
  if (!tile) return { ok: false, error: "no raid to disembark from" };

  escort.col = tile.col;
  escort.row = tile.row;
  escort.escortingRouteId = undefined;
  escort.movementLeft = 0;
  route.escortUnitId = undefined;
  route.escortType = undefined;
  route.repelledRaidTile = undefined;

  // Shove any enemy raider still on the ambush tile aside.
  for (const u of state.units.values()) {
    if (u.col === tile.col && u.row === tile.row && u.ownerId !== actingPlayerId) {
      pushUnitToNeighbor(state, u, tile.col, tile.row);
      break;
    }
  }

  const owner = playerById(state, actingPlayerId);
  log(state, `${owner?.name ?? "A caravan"} recalled its escort from a trade route.`, {
    actorId: actingPlayerId,
    targetIds: [actingPlayerId],
    tile,
  });
  return { ok: true };
}

/** Move a unit to any passable neighbouring tile that is not `avoid`. */
export function pushUnitToNeighbor(state: GameState, unit: Unit, avoidCol: number, avoidRow: number): boolean {
  for (const n of offsetNeighbors(state.map, unit.col, unit.row)) {
    if (n.col === avoidCol && n.row === avoidRow) continue;
    if (unitAt(state, n.col, n.row)) continue;
    const tile = getTile(state.map, n.col, n.row);
    if (!tile || !isPassableLand(tile.terrain)) continue;
    unit.col = n.col;
    unit.row = n.row;
    return true;
  }
  return false;
}
