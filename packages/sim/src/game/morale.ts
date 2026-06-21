// Morale — an empire-wide ("global") morale and a per-unit morale. Global morale
// sets the floor new units start from and shifts with battlefield fortunes; unit
// morale buffs/debuffs combat and drives routing (a unit breaking and fleeing).
//
// All randomness flows through the seeded RNG so the server and clients agree on
// whether a unit routed (see docs note in shared/rng.ts).

import { axialDistance, axialNeighbors, axialToOffset, makeRng, offsetToAxial, getTile } from "@roc/shared";
import type { GameState, MoraleEvent, Player, Unit } from "./state";
import { areEnemies, cityAt, log, playerById, unitAt } from "./state";
import { UNIT_DEFS } from "./content";
import { isPassableLand, isWaterTerrain } from "./terrain";

// ---- bounds & pivots -----------------------------------------------------

export const GLOBAL_MORALE_BASE = 50;
export const GLOBAL_MORALE_MIN = 0;
export const GLOBAL_MORALE_MAX = 200;

/** Base floor added to half the global morale when a unit is created. */
export const UNIT_MORALE_BASE = 50;
export const UNIT_MORALE_MIN = 0;
export const UNIT_MORALE_MAX = 200;
/** Morale at which a unit is neither buffed nor debuffed. */
export const MORALE_NEUTRAL = 100;

// ---- combat scaling (relative to neutral) --------------------------------

/** At morale 0 a unit attacks this much weaker; scales linearly to +this at 200. */
const ATTACK_SWING_AT_ZERO = 0.2;
/** At morale 0 a unit defends this much weaker; scales linearly to +this at 200. */
const DEFENSE_SWING_AT_ZERO = 0.1;

// ---- morale swings -------------------------------------------------------

/** Morale gained by the unit that defeats an enemy. */
export const KILL_MORALE_SELF = 16;
/** Morale gained by friendlies adjacent to a unit that scored a kill. */
export const KILL_MORALE_ADJACENT = 6;
/** Morale lost by friendlies adjacent to one of our units that dies. */
export const DEATH_MORALE_ADJACENT = 12;
/** Morale gained by a freshly promoted unit. */
export const PROMOTE_MORALE_SELF = 12;
/** Morale gained by friendlies adjacent to a freshly promoted unit. */
export const PROMOTE_MORALE_ADJACENT = 5;
/** Bonus starting morale for units trained in a city with a Barracks. */
export const BARRACKS_MORALE_BONUS = 25;
/** Global morale moves by this fraction of the triggering unit-morale change. */
const GLOBAL_MORALE_SHARE = 0.1;
/** Morale from defeating a barbarian, as a fraction of defeating a major civ. */
export const BARBARIAN_KILL_FACTOR = 0.5;

// ---- decay ---------------------------------------------------------------

/** Turns of grace after the last morale gain before global morale starts to slip. */
const MORALE_DECAY_GRACE = 3;
/** Decay on the first decaying turn, as a % of current global morale. */
const MORALE_DECAY_START_PCT = 1;
/** Decay ramps up to this %/turn the longer morale goes unearned. */
const MORALE_DECAY_MAX_PCT = 10;

// ---- war declaration -----------------------------------------------------

/** Global morale shift when this player declares war (sign set by current morale). */
export const WAR_GLOBAL_SWING = 10;
/** Each of the declarer's units shifts morale by this when war is declared. */
export const WAR_UNIT_SWING = 8;

// ---- bankruptcy ----------------------------------------------------------

/** Global morale lost the turn the treasury cannot pay its troops' upkeep. */
export const BANKRUPTCY_GLOBAL_MORALE_PENALTY = 30;
/** Each of the player's units loses this much morale when its wages go unpaid. */
export const BANKRUPTCY_UNIT_MORALE_PENALTY = 25;

// ---- military pay (upkeep modifier) --------------------------------------

/** Bounds on the player's military-pay setting, as a percent of base upkeep. */
export const UPKEEP_MODIFIER_MIN = -100;
export const UPKEEP_MODIFIER_MAX = 200;
/** Pay above this percent stops decay entirely and begins to *raise* morale. */
export const UPKEEP_GAIN_THRESHOLD = 100;
/** Global morale gained per turn at the maximum pay setting. */
export const UPKEEP_MAX_MORALE_GAIN = 4;

// ---- routing -------------------------------------------------------------

/** Route chance at morale 0 (before route resistance). */
const MAX_ROUTE_CHANCE = 0.4;
/** Morale at/above which a unit essentially never routes. */
const ROUTE_ZERO_AT = 150;

// ---- helpers -------------------------------------------------------------

export function clampGlobalMorale(v: number): number {
  return Math.max(GLOBAL_MORALE_MIN, Math.min(GLOBAL_MORALE_MAX, Math.round(v)));
}

export function clampUnitMorale(v: number): number {
  return Math.max(UNIT_MORALE_MIN, Math.min(UNIT_MORALE_MAX, Math.round(v)));
}

/** A unit's current morale; legacy units (no field) count as neutral. */
export function unitMorale(unit: Unit): number {
  return unit.morale ?? MORALE_NEUTRAL;
}

/** A player's global morale; defaults to base for legacy saves. */
export function globalMoraleOf(player: Player | undefined): number {
  return player?.globalMorale ?? GLOBAL_MORALE_BASE;
}

/** Starting morale for a new unit owned by `ownerId` (+ optional building bonus). */
export function startingUnitMorale(state: GameState, ownerId: number, bonus = 0): number {
  return clampUnitMorale(UNIT_MORALE_BASE + globalMoraleOf(playerById(state, ownerId)) / 2 + bonus);
}

/** Combat-attack multiplier from morale (1.0 at neutral). */
export function moraleAttackMultiplier(unit: Unit): number {
  return 1 + ((unitMorale(unit) - MORALE_NEUTRAL) / MORALE_NEUTRAL) * ATTACK_SWING_AT_ZERO;
}

/** Combat-defense multiplier from morale (1.0 at neutral). */
export function moraleDefenseMultiplier(unit: Unit): number {
  return 1 + ((unitMorale(unit) - MORALE_NEUTRAL) / MORALE_NEUTRAL) * DEFENSE_SWING_AT_ZERO;
}

function dist(a: { col: number; row: number }, b: { col: number; row: number }): number {
  return axialDistance(offsetToAxial(a), offsetToAxial(b));
}

/** In-bounds offset neighbours of a tile (local copy to avoid importing movement,
 *  which would create a diplomacy↔morale↔movement import cycle). */
function neighborTiles(state: GameState, col: number, row: number): { col: number; row: number }[] {
  const out: { col: number; row: number }[] = [];
  for (const a of axialNeighbors(offsetToAxial({ col, row }))) {
    const o = axialToOffset(a);
    if (getTile(state.map, o.col, o.row)) out.push(o);
  }
  return out;
}

function isNavalDomain(unit: Unit): boolean {
  const cls = UNIT_DEFS[unit.type].cls;
  return cls === "naval_melee" || cls === "naval_ranged" || !!unit.embarked;
}

function adjacentFriendlies(state: GameState, unit: Unit): Unit[] {
  const out: Unit[] = [];
  for (const u of state.units.values()) {
    if (u.ownerId === unit.ownerId && u.id !== unit.id && dist(u, unit) === 1) out.push(u);
  }
  return out;
}

export function adjustGlobalMorale(player: Player | undefined, delta: number): void {
  if (!player) return;
  player.globalMorale = clampGlobalMorale(globalMoraleOf(player) + delta);
}

/** Most recent morale changes kept per player for the morale dialog. */
export const MORALE_LOG_MAX = 20;

/** Record a global-morale change for the dialog. `before` is the player's global
 *  morale captured *before* the change was applied; the logged delta is the actual
 *  whole-point movement, so clamping at the 0/200 bounds is reflected faithfully. */
export function recordMoraleEvent(state: GameState, playerId: number, before: number, reason: string): void {
  const player = playerById(state, playerId);
  if (!player) return;
  const delta = globalMoraleOf(player) - before;
  if (delta === 0) return;
  const event: MoraleEvent = { turn: state.turn, delta, reason };
  (player.moraleLog ??= []).push(event);
  if (player.moraleLog.length > MORALE_LOG_MAX) {
    player.moraleLog.splice(0, player.moraleLog.length - MORALE_LOG_MAX);
  }
}

export function changeUnitMorale(unit: Unit, delta: number): void {
  unit.morale = clampUnitMorale(unitMorale(unit) + delta);
}

// ---- battlefield morale events ------------------------------------------

/** Remember that `playerId` just earned morale (resets the decay grace timer). */
export function recordMoraleGain(state: GameState, playerId: number): void {
  const p = playerById(state, playerId);
  if (p) p.lastMoraleGainTurn = state.turn;
}

/** A unit defeated an enemy: it and nearby friendlies rally; global morale lifts.
 *  Beating a barbarian inspires less than beating a major civ's unit. */
export function onEnemyDefeated(state: GameState, killer: Unit, defeated: Unit): void {
  const factor = playerById(state, defeated.ownerId)?.isBarbarian ? BARBARIAN_KILL_FACTOR : 1;
  const self = Math.round(KILL_MORALE_SELF * factor);
  const adj = Math.round(KILL_MORALE_ADJACENT * factor);
  changeUnitMorale(killer, self);
  for (const f of adjacentFriendlies(state, killer)) changeUnitMorale(f, adj);
  const before = globalMoraleOf(playerById(state, killer.ownerId));
  adjustGlobalMorale(playerById(state, killer.ownerId), self * GLOBAL_MORALE_SHARE);
  recordMoraleEvent(state, killer.ownerId, before, factor < 1 ? "Defeated a barbarian band" : "Won a battle");
  recordMoraleGain(state, killer.ownerId);
  const victor = playerById(state, killer.ownerId);
  if (victor) victor.battlesWon = (victor.battlesWon ?? 0) + 1;
}

/** One of our units died: nearby friendlies waver; global morale drops. Call this
 *  while the dying unit is still on the map (before it is removed). */
export function onUnitLost(state: GameState, dead: Unit): void {
  for (const f of adjacentFriendlies(state, dead)) changeUnitMorale(f, -DEATH_MORALE_ADJACENT);
  const before = globalMoraleOf(playerById(state, dead.ownerId));
  adjustGlobalMorale(playerById(state, dead.ownerId), -DEATH_MORALE_ADJACENT * GLOBAL_MORALE_SHARE);
  recordMoraleEvent(state, dead.ownerId, before, "Lost a unit in battle");
}

/** A unit was promoted: it and nearby friendlies are inspired; global morale lifts. */
export function onUnitPromoted(state: GameState, unit: Unit): void {
  changeUnitMorale(unit, PROMOTE_MORALE_SELF);
  for (const f of adjacentFriendlies(state, unit)) changeUnitMorale(f, PROMOTE_MORALE_ADJACENT);
  const before = globalMoraleOf(playerById(state, unit.ownerId));
  adjustGlobalMorale(playerById(state, unit.ownerId), PROMOTE_MORALE_SELF * GLOBAL_MORALE_SHARE);
  recordMoraleEvent(state, unit.ownerId, before, "A unit was promoted");
  recordMoraleGain(state, unit.ownerId);
}

// ---- military pay helpers ------------------------------------------------

/** The player's military-pay setting (percent of base upkeep), clamped to range. */
export function upkeepModifierPct(player: Player | undefined): number {
  return Math.max(UPKEEP_MODIFIER_MIN, Math.min(UPKEEP_MODIFIER_MAX, player?.upkeepModifierPct ?? 0));
}

/** Gold-upkeep multiplier from the pay setting: 0× at −100%, 1× at 0, 3× at +200%. */
export function upkeepGoldMultiplier(player: Player | undefined): number {
  return 1 + upkeepModifierPct(player) / 100;
}

/** How the pay setting scales morale decay: 2× at −100% pay, 1× at 0%, and 0×
 *  (no decay at all) once pay reaches +100% or more. */
export function upkeepDecayMultiplier(pct: number): number {
  return Math.max(0, 1 - pct / UPKEEP_GAIN_THRESHOLD);
}

/** Morale *gained* per turn from over-funding the army: 0 up to +100% pay, then
 *  ramping to UPKEEP_MAX_MORALE_GAIN at the +200% maximum. */
export function upkeepMoraleGain(pct: number): number {
  if (pct <= UPKEEP_GAIN_THRESHOLD) return 0;
  return ((pct - UPKEEP_GAIN_THRESHOLD) / (UPKEEP_MODIFIER_MAX - UPKEEP_GAIN_THRESHOLD)) * UPKEEP_MAX_MORALE_GAIN;
}

/**
 * Per-turn global-morale upkeep tick. Two coupled effects of the military-pay
 * setting (`upkeepModifierPct`):
 *  - **Decay** of morale above the base of 50 begins a few turns after the last
 *    gain, ramping from 1%/turn up to 10%/turn — but the pay setting scales it:
 *    starving the army (−100%) doubles decay, while paying +100% halts it.
 *  - **Gain**: paying past +100% actively *raises* morale each turn (up to the max
 *    at +200%), so a lavishly funded army's spirits climb even between battles.
 * Decay never drops morale below 50 — only losing battles can. Pay-driven gain is
 * not "earned glory", so it does not reset the decay grace timer. Once per round.
 */
export function decayGlobalMorale(state: GameState, player: Player): void {
  const pct = upkeepModifierPct(player);

  // Well-funded armies climb in morale each turn, regardless of the grace window.
  const gain = upkeepMoraleGain(pct);
  if (gain > 0) {
    const before = globalMoraleOf(player);
    adjustGlobalMorale(player, gain);
    recordMoraleEvent(state, player.id, before, "A well-paid army's spirits rise");
  }

  const last = player.lastMoraleGainTurn ?? -Infinity;
  const sinceGain = state.turn - last;
  if (sinceGain <= MORALE_DECAY_GRACE) return;
  const g = globalMoraleOf(player);
  if (g <= GLOBAL_MORALE_BASE) return; // decay never drops morale below the base
  const decayMult = upkeepDecayMultiplier(pct);
  if (decayMult <= 0) return; // pay is high enough to fully arrest decay
  const decayTurns = sinceGain - MORALE_DECAY_GRACE; // 1, 2, 3, …
  const ratePct = Math.min(MORALE_DECAY_MAX_PCT, decayTurns * MORALE_DECAY_START_PCT);
  const decayed = g - (g * ratePct * decayMult) / 100;
  player.globalMorale = Math.max(GLOBAL_MORALE_BASE, Math.round(decayed));
  recordMoraleEvent(
    state,
    player.id,
    g,
    pct < 0 ? "Morale slumped — the army is underpaid" : "Morale faded without recent victories",
  );
}

/**
 * Declaring war steels a confident army but unnerves a shaky one. If morale is high
 * (≥ neutral) it rises; if it is low (< neutral) it falls further. Applied both to
 * the declaring player's global morale and, individually, to each of their units.
 */
export function onWarDeclared(state: GameState, playerId: number): void {
  const player = playerById(state, playerId);
  if (!player) return;
  const globalHigh = globalMoraleOf(player) >= MORALE_NEUTRAL;
  const before = globalMoraleOf(player);
  adjustGlobalMorale(player, globalHigh ? WAR_GLOBAL_SWING : -WAR_GLOBAL_SWING);
  recordMoraleEvent(state, playerId, before, globalHigh ? "Declared war — army emboldened" : "Declared war — army unnerved");
  if (globalHigh) recordMoraleGain(state, playerId);
  for (const u of state.units.values()) {
    if (u.ownerId !== playerId) continue;
    changeUnitMorale(u, unitMorale(u) >= MORALE_NEUTRAL ? WAR_UNIT_SWING : -WAR_UNIT_SWING);
  }
}

/**
 * The treasury ran dry and the army's wages went unpaid: a catastrophe for morale.
 * The empire's global morale plunges and every one of its units loses heart sharply
 * (this can drag global morale below its base of 50). Call this once per turn that
 * upkeep cannot be met, after any forced disbanding.
 */
export function onBankruptcy(state: GameState, playerId: number): void {
  const player = playerById(state, playerId);
  if (!player) return;
  const before = globalMoraleOf(player);
  adjustGlobalMorale(player, -BANKRUPTCY_GLOBAL_MORALE_PENALTY);
  recordMoraleEvent(state, playerId, before, "Treasury bankrupt — troops unpaid");
  for (const u of state.units.values()) {
    if (u.ownerId !== playerId) continue;
    changeUnitMorale(u, -BANKRUPTCY_UNIT_MORALE_PENALTY);
  }
}

// ---- routing -------------------------------------------------------------

/** Probability (0–1) that this unit routs right now, given its morale and any
 *  innate route resistance. ~0 at morale ≥ 150. */
export function routeChance(unit: Unit): number {
  const m = unitMorale(unit);
  if (m >= ROUTE_ZERO_AT) return 0;
  const resist = UNIT_DEFS[unit.type].routeResistance ?? 0;
  const chance = ((ROUTE_ZERO_AT - m) / ROUTE_ZERO_AT) * MAX_ROUTE_CHANCE * (1 - resist);
  return Math.max(0, chance);
}

/** Distance from (col,row) to the nearest enemy of `unit`; +Infinity if none. */
function nearestEnemyDist(state: GameState, unit: Unit, col: number, row: number): number {
  const owner = playerById(state, unit.ownerId);
  let best = Infinity;
  for (const u of state.units.values()) {
    if (u.id === unit.id) continue;
    const o = playerById(state, u.ownerId);
    if (owner && o && areEnemies(owner, o)) best = Math.min(best, dist({ col, row }, u));
  }
  return best;
}

/** True if `unit` may flee onto (col,row): empty, passable for its domain, and
 *  not an enemy-held city tile. */
function canRetreatOnto(state: GameState, unit: Unit, col: number, row: number): boolean {
  const tile = getTile(state.map, col, row);
  if (!tile) return false;
  if (unitAt(state, col, row)) return false;
  const c = cityAt(state, col, row);
  if (c && c.ownerId !== unit.ownerId) return false;
  const water = isWaterTerrain(tile.terrain);
  if (isNavalDomain(unit)) return water;
  return isPassableLand(tile.terrain);
}

/** Flee one tile, choosing the open neighbour furthest from the nearest enemy.
 *  Returns false if the unit is hemmed in. */
function retreatOneStep(state: GameState, unit: Unit): boolean {
  let best: { col: number; row: number } | null = null;
  let bestScore = -Infinity;
  for (const n of neighborTiles(state, unit.col, unit.row)) {
    if (!canRetreatOnto(state, unit, n.col, n.row)) continue;
    const score = nearestEnemyDist(state, unit, n.col, n.row);
    if (score > bestScore) {
      bestScore = score;
      best = { col: n.col, row: n.row };
    }
  }
  if (!best) return false;
  unit.col = best.col;
  unit.row = best.row;
  return true;
}

/** Make `unit` rout: flee 1–2 tiles and forfeit its next turn's actions. */
function routeUnit(state: GameState, unit: Unit, steps: number): void {
  for (let i = 0; i < steps; i++) {
    if (!retreatOneStep(state, unit)) break;
  }
  unit.movementLeft = 0;
  unit.attackedThisTurn = true; // no further action this activation
  unit.stance = null;
  unit.routedUntilTurn = state.turn + 1; // forfeits next turn (see tickAbilities)
  const owner = playerById(state, unit.ownerId);
  log(state, `${UNIT_DEFS[unit.type].name} (${owner?.name ?? "?"}) broke and routed!`, {
    targetIds: owner ? [owner.id] : undefined,
    tile: { col: unit.col, row: unit.row },
  });
}

/** Roll a morale check for `unit` (which just survived combat); rout on failure.
 *  Returns true if it routed. Deterministic for a given unit/turn/state. */
export function maybeRoute(state: GameState, unit: Unit): boolean {
  if (!state.units.has(unit.id)) return false;
  const chance = routeChance(unit);
  if (chance <= 0) return false;
  const rng = makeRng(`route:${unit.id}:${state.turn}:${unit.hp}:${unit.col},${unit.row}`);
  if (rng.next() >= chance) return false;
  routeUnit(state, unit, rng.int(1, 2));
  return true;
}
