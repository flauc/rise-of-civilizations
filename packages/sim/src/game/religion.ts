// Religion: faith founds a religion (with chosen beliefs) at a holy city, which
// then spreads to nearby cities via "pressure". Founder beliefs apply to the
// founder's empire (merged in civs.playerEffects).

import { axialDistance, offsetToAxial } from "@roc/shared";
import { RELIGION_NAMES, getBelief, BELIEFS } from "@roc/data";
import { RELIGION_REQUIRED_TECH, UNIT_DEFS, type UnitTypeId } from "./content";
import type { City, GameState, Religion, Unit } from "./state";
import { citiesOf, cityAt, log, makeUnit, playerById } from "./state";
import { tradeRouteYield } from "./trade";

export { BELIEFS, getBelief };
export type { BeliefDef } from "@roc/data";

export const FAITH_TO_FOUND = 100;
const SPREAD_RANGE = 5;
/** Pressure a holy city radiates per turn; follower cities radiate a fraction. */
const HOLY_PRESSURE = 6;
const FOLLOWER_PRESSURE = 2;
/** Pressure decays slightly each turn so frontiers must be actively held. */
const PRESSURE_DECAY = 0.9;
/** A missionary charge injects a decisive burst into a single city. */
const MISSIONARY_PRESSURE = 40;
/** Faith ↔ trade: a route carries this much pressure per point of its gold yield. */
const RELIGION_TRADE_FACTOR = 0.5;

/** The religion with the most pressure in a city (its dominant faith), or undefined. */
export function dominantReligion(city: City): string | undefined {
  const p = city.religionPressure;
  if (!p) return city.religion;
  let best: string | undefined;
  let bestP = 0;
  for (const [rel, amt] of Object.entries(p)) {
    if (amt > bestP) {
      bestP = amt;
      best = rel;
    }
  }
  return best;
}

function addPressure(city: City, relId: string, amount: number): void {
  if (!city.religionPressure) city.religionPressure = {};
  city.religionPressure[relId] = (city.religionPressure[relId] ?? 0) + amount;
}

/** Whether a unit type is a faith-purchased religious unit. */
export function isReligiousUnit(type: UnitTypeId): boolean {
  return !!UNIT_DEFS[type].religious;
}

export function religionById(state: GameState, id: string | undefined): Religion | undefined {
  return id ? state.religions.find((r) => r.id === id) : undefined;
}

/** How many religions may exist this game (one per non-barbarian civ). */
export function religionsCap(state: GameState): number {
  return state.players.filter((p) => !p.isBarbarian).length;
}

export function availableReligionNames(state: GameState): string[] {
  const used = new Set(state.religions.map((r) => r.name));
  return RELIGION_NAMES.filter((n) => !used.has(n));
}

/** Religion becomes available only after researching this technology. */
export function religionUnlocked(state: GameState, playerId: number): boolean {
  return playerById(state, playerId)?.researched.has(RELIGION_REQUIRED_TECH) ?? false;
}

export function canFoundReligion(state: GameState, playerId: number): boolean {
  const p = playerById(state, playerId);
  if (!p || p.isBarbarian || p.foundedReligionId) return false;
  return (
    religionUnlocked(state, playerId) &&
    p.faith >= FAITH_TO_FOUND &&
    citiesOf(state, playerId).length > 0 &&
    state.religions.length < religionsCap(state)
  );
}

export interface FoundResult {
  ok: boolean;
  error?: string;
}

export function foundReligion(
  state: GameState,
  playerId: number,
  cityId: number,
  name: string,
  beliefs: string[],
): FoundResult {
  if (!canFoundReligion(state, playerId)) return { ok: false, error: "cannot found a religion now" };
  const city = state.cities.get(cityId);
  if (!city || city.ownerId !== playerId) return { ok: false, error: "not your city" };
  const validBeliefs = beliefs.filter((b) => getBelief(b)).slice(0, 2);
  const names = availableReligionNames(state);
  const finalName = name && names.includes(name) ? name : names[0] ?? `Religion ${state.religions.length + 1}`;
  const id = `rel_${playerId}`;
  const religion: Religion = { id, name: finalName, founderId: playerId, holyCityId: cityId, beliefs: validBeliefs };
  state.religions.push(religion);
  const p = playerById(state, playerId)!;
  p.foundedReligionId = id;
  p.faith -= FAITH_TO_FOUND;
  addPressure(city, id, HOLY_PRESSURE * 4); // the holy city is firmly the faith's seat
  city.religion = id;
  log(state, `${p.name} founded ${finalName} in ${city.name}!`, {
    actorId: p.id,
    targetIds: [p.id],
    tile: { col: city.col, row: city.row },
  });
  return { ok: true };
}

/**
 * Advance religion one tick: every follower city radiates pressure to its
 * neighbours (holy cities most strongly), trade routes carry faith between their
 * endpoints in BOTH directions, accumulated pressure decays slightly, and each
 * city's dominant religion is recomputed. Conversions are therefore gradual and
 * contestable — a frontier must be actively pressed (or evangelised) to hold.
 */
export function spreadReligion(state: GameState): void {
  if (state.religions.length === 0) return;
  const holyCityIds = new Set(state.religions.map((r) => r.holyCityId));
  const cities = [...state.cities.values()];
  const d = (a: City, b: City) => axialDistance(offsetToAxial(a), offsetToAxial(b));

  // 1. Decay existing pressure so old conversions fade without reinforcement.
  for (const c of cities) {
    if (!c.religionPressure) continue;
    for (const rel of Object.keys(c.religionPressure)) {
      const v = c.religionPressure[rel]! * PRESSURE_DECAY;
      if (v < 0.5) delete c.religionPressure[rel];
      else c.religionPressure[rel] = v;
    }
  }

  // 2. Ambient proximity spread from every follower city.
  for (const src of cities) {
    const rel = dominantReligion(src);
    if (!rel) continue;
    const emit = holyCityIds.has(src.id) ? HOLY_PRESSURE : FOLLOWER_PRESSURE;
    for (const target of cities) {
      const dist = d(target, src);
      if (dist > SPREAD_RANGE) continue;
      addPressure(target, rel, (emit * (SPREAD_RANGE - dist + 1)) / SPREAD_RANGE);
    }
  }

  // 3. Trade routes are conduits of faith — each carries its endpoints' dominant
  //    religion to the other end, scaled by the route's commercial strength.
  for (const route of state.tradeRoutes) {
    const from = state.cities.get(route.fromCityId);
    const to = state.cities.get(route.toCityId);
    if (!from || !to) continue;
    const strength = tradeRouteYield(state, route).gold * RELIGION_TRADE_FACTOR;
    const fromRel = dominantReligion(from);
    const toRel = dominantReligion(to);
    if (fromRel) addPressure(to, fromRel, strength);
    if (toRel) addPressure(from, toRel, strength);
  }

  // 4. Holy cities are unshakeably anchored to their own faith.
  for (const r of state.religions) {
    const c = state.cities.get(r.holyCityId);
    if (c) addPressure(c, r.id, HOLY_PRESSURE * 4);
  }

  // 5. Recompute each city's dominant religion from the new pressure.
  for (const c of cities) c.religion = dominantReligion(c);
}

// ---- faith-purchased religious units --------------------------------------

/** Faith price for a religious unit (flat base from its UnitDef). */
export function religiousUnitCost(type: UnitTypeId): number {
  return UNIT_DEFS[type].faithCost ?? 0;
}

export interface BuyResult {
  ok: boolean;
  error?: string;
  unitId?: number;
}

/** Buy a missionary/apostle/inquisitor with faith, spawning it in `cityId`. */
export function buyReligiousUnit(
  state: GameState,
  playerId: number,
  cityId: number,
  type: UnitTypeId,
): BuyResult {
  const p = playerById(state, playerId);
  if (!p || p.isBarbarian) return { ok: false, error: "no such player" };
  if (!UNIT_DEFS[type]?.religious) return { ok: false, error: "not a religious unit" };
  if (!p.foundedReligionId && !hasAnyReligion(state, playerId)) {
    return { ok: false, error: "your cities follow no religion" };
  }
  if (!religionUnlocked(state, playerId)) return { ok: false, error: "religion not unlocked" };
  const city = state.cities.get(cityId);
  if (!city || city.ownerId !== playerId) return { ok: false, error: "not your city" };
  const cost = religiousUnitCost(type);
  if (p.faith < cost) return { ok: false, error: "not enough faith" };
  p.faith -= cost;
  const id = state.nextEntityId++;
  const unit = makeUnit(id, playerId, type, city.col, city.row, 0, 100);
  unit.religiousCharges = UNIT_DEFS[type].religiousCharges ?? 1;
  state.units.set(id, unit);
  log(state, `${p.name} ordained a ${UNIT_DEFS[type].name} in ${city.name}.`, {
    actorId: playerId,
    targetIds: [playerId],
    tile: { col: city.col, row: city.row },
  });
  return { ok: true, unitId: id };
}

/** The religion a player's missionary/apostle spreads (founded, else their capital's). */
function spreadFaithOf(state: GameState, playerId: number): string | undefined {
  const founded = playerById(state, playerId)?.foundedReligionId;
  if (founded) return founded;
  // Fall back to whatever faith the player's cities predominantly follow.
  for (const c of citiesOf(state, playerId)) {
    const rel = dominantReligion(c);
    if (rel) return rel;
  }
  return undefined;
}

function hasAnyReligion(state: GameState, playerId: number): boolean {
  return citiesOf(state, playerId).some((c) => !!dominantReligion(c));
}

/** Spend a missionary/apostle charge to flood a city with its owner's religion. */
export function evangelize(state: GameState, unitId: number, cityId: number): BuyResult {
  const unit = state.units.get(unitId);
  if (!unit || !UNIT_DEFS[unit.type].religious) return { ok: false, error: "not a religious unit" };
  if ((unit.religiousCharges ?? 0) <= 0) return { ok: false, error: "no charges left" };
  const city = state.cities.get(cityId);
  if (!city) return { ok: false, error: "no such city" };
  if (axialDistance(offsetToAxial(unit), offsetToAxial(city)) > 1) {
    return { ok: false, error: "must be at or beside the city" };
  }
  const rel = spreadFaithOf(state, unit.ownerId);
  if (!rel) return { ok: false, error: "you have no religion to spread" };
  addPressure(city, rel, MISSIONARY_PRESSURE);
  city.religion = dominantReligion(city);
  spendCharge(state, unit);
  return { ok: true };
}

/** Spend an inquisitor charge to purge rival faiths from one of your own cities. */
export function purgeHeresy(state: GameState, unitId: number, cityId: number): BuyResult {
  const unit = state.units.get(unitId);
  if (!unit || unit.type !== "inquisitor") return { ok: false, error: "not an inquisitor" };
  if ((unit.religiousCharges ?? 0) <= 0) return { ok: false, error: "no charges left" };
  const city = state.cities.get(cityId);
  if (!city || city.ownerId !== unit.ownerId) return { ok: false, error: "must be your city" };
  if (axialDistance(offsetToAxial(unit), offsetToAxial(city)) > 1) {
    return { ok: false, error: "must be at or beside the city" };
  }
  const keep = spreadFaithOf(state, unit.ownerId);
  city.religionPressure = keep && city.religionPressure?.[keep]
    ? { [keep]: city.religionPressure[keep]! }
    : {};
  city.religion = dominantReligion(city);
  spendCharge(state, unit);
  return { ok: true };
}

/** Consume one charge; remove the unit when its last charge is spent. */
function spendCharge(state: GameState, unit: Unit): void {
  unit.religiousCharges = (unit.religiousCharges ?? 1) - 1;
  if ((unit.religiousCharges ?? 0) <= 0) state.units.delete(unit.id);
}

// ---- religious-unit fast-travel along trade routes ------------------------

/** Caravans move far faster than a missionary on foot. */
const BASE_TRANSIT_SPEED = 3;

/** Turns to ride a route: distance ÷ (base speed × strength), at least 1. */
export function transitTurns(state: GameState, route: { path: string[] } & { fromCityId: number; toCityId: number; id: number; ownerId: number }): number {
  const dist = Math.max(1, route.path.length - 1);
  const gold = tradeRouteYield(state, route as Parameters<typeof tradeRouteYield>[1]).gold;
  const strength = 1 + gold / 10;
  return Math.max(1, Math.ceil(dist / (BASE_TRANSIT_SPEED * strength)));
}

/** A religious unit standing in one endpoint city boards the route and emerges at
 *  the other endpoint after a few turns (see transitTurns). */
export function boardTradeRoute(state: GameState, unitId: number, routeId: number): BuyResult {
  const unit = state.units.get(unitId);
  if (!unit || !UNIT_DEFS[unit.type].religious) return { ok: false, error: "not a religious unit" };
  if (unit.inTransit) return { ok: false, error: "already travelling" };
  const route = state.tradeRoutes.find((r) => r.id === routeId);
  if (!route) return { ok: false, error: "no such route" };
  const here = cityAt(state, unit.col, unit.row);
  if (!here || (here.id !== route.fromCityId && here.id !== route.toCityId)) {
    return { ok: false, error: "must stand in an endpoint city of the route" };
  }
  // Only the route owner's units (or units of a civ the route connects to) may ride.
  if (route.ownerId !== unit.ownerId && here.ownerId !== unit.ownerId) {
    return { ok: false, error: "you may not use this route" };
  }
  const exitCityId = here.id === route.fromCityId ? route.toCityId : route.fromCityId;
  unit.inTransit = { routeId, exitCityId, arrivesOnTurn: state.turn + transitTurns(state, route) };
  unit.movementLeft = 0;
  return { ok: true };
}

/** Deliver any of a player's in-transit units whose journey has completed. If the
 *  route or exit city is gone, the unit is dropped at its last position. */
export function processTransit(state: GameState, playerId: number): void {
  for (const unit of state.units.values()) {
    if (unit.ownerId !== playerId || !unit.inTransit) continue;
    if (state.turn < unit.inTransit.arrivesOnTurn) continue;
    const exit = state.cities.get(unit.inTransit.exitCityId);
    if (exit) {
      unit.col = exit.col;
      unit.row = exit.row;
    }
    unit.inTransit = undefined;
  }
}

export function cityFollowerCount(state: GameState, religionId: string): number {
  let n = 0;
  for (const c of state.cities.values()) if (c.religion === religionId) n++;
  return n;
}
