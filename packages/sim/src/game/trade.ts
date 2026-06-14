// Trade routes. A Trader unit (unlocked by The Wheel) is consumed in one of your
// cities to establish a permanent route to another of your cities. The route
// yields gold (scaling with distance + Markets) plus a little food/production to
// the origin city, and a small share to the destination. Routes are pruned when
// either endpoint is lost or changes owner.

import { axialDistance, offsetToAxial } from "@roc/shared";
import type { City, GameState, TradeRoute, Unit } from "./state";
import { cityAt, playerById } from "./state";
import { UNIT_DEFS } from "./content";

export interface TradeYield {
  gold: number;
  food: number;
  production: number;
  science: number;
}

const ZERO: TradeYield = { gold: 0, food: 0, production: 0, science: 0 };
const MAX_ROUTE_GOLD = 10;

const ax = (c: { col: number; row: number }) => offsetToAxial({ col: c.col, row: c.row });

/** Per-turn yields a single route generates (granted to the origin city). */
export function tradeRouteYield(state: GameState, route: TradeRoute): TradeYield {
  const from = state.cities.get(route.fromCityId);
  const to = state.cities.get(route.toCityId);
  if (!from || !to) return ZERO;
  const dist = axialDistance(ax(from), ax(to));
  let gold = Math.min(MAX_ROUTE_GOLD, 3 + Math.floor(dist / 2));
  if (from.buildings.includes("market")) gold += 2;
  if (to.buildings.includes("market")) gold += 1;
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
  state.tradeRoutes.push({
    id: state.nextEntityId++,
    ownerId: unit.ownerId,
    fromCityId: origin.id,
    toCityId: dest.id,
  });
  state.units.delete(unit.id);
  const owner = playerById(state, unit.ownerId);
  state.log.push(`${owner?.name ?? "A trader"} opened a trade route ${origin.name} → ${dest.name}.`);
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
