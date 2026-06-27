// Rushing: spend a stockpiled empire resource to instantly complete production.
// City items (units/buildings) and tile/defensive Works can both be rushed.
// Gold is always available; faith and culture each require a perk that sets the
// matching CivEffects flag (a religion belief / a civics policy — see @roc/data).
// "Instant" means the item/work is topped up to completion and finishes on the
// next turn-processing via the normal economy.ts / works.ts completion paths.

import type { City, Discipline, GameState, Player, TrainingOrder, Work } from "./state";
import { playerById } from "./state";
import { playerEffects } from "./civs";
import { getBuildingDef, trainingTier } from "./content";

export type RushCurrency = "gold" | "faith" | "culture";

export interface RushResult {
  ok: boolean;
  error?: string;
  /** Resource amount that was (or would be) spent. */
  cost?: number;
}

// Resource cost per remaining unit of production/labour, by currency. Faith and
// culture rush a little cheaper than gold so the unlocking perks feel worthwhile.
const PER_PROD: Record<RushCurrency, number> = { gold: 4, faith: 3, culture: 3 };
const PER_LABOUR: Record<RushCurrency, number> = { gold: 4, faith: 3, culture: 3 };
// Cost per remaining training turn (a unit's per-turn cost to rush its muster).
const PER_TRAIN_TURN: Record<RushCurrency, number> = { gold: 8, faith: 6, culture: 6 };

const CURRENCY_LABEL: Record<RushCurrency, string> = {
  gold: "gold",
  faith: "faith",
  culture: "culture",
};

/** The player pool a currency draws from. */
function poolOf(player: Player, currency: RushCurrency): number {
  switch (currency) {
    case "gold": return player.gold;
    case "faith": return player.faith;
    case "culture": return player.cultureProgress;
  }
}

function spendFromPool(player: Player, currency: RushCurrency, amount: number): void {
  switch (currency) {
    case "gold": player.gold -= amount; break;
    case "faith": player.faith -= amount; break;
    case "culture": player.cultureProgress -= amount; break;
  }
}

/** Currencies this player may rush with: gold always, faith/culture if a perk allows. */
export function rushCurrencies(state: GameState, playerId: number): RushCurrency[] {
  const out: RushCurrency[] = ["gold"];
  const eff = playerEffects(state, playerId);
  if (eff.rushWithFaith) out.push("faith");
  if (eff.rushWithCulture) out.push("culture");
  return out;
}

function currencyAllowed(state: GameState, playerId: number, currency: RushCurrency): boolean {
  return rushCurrencies(state, playerId).includes(currency);
}

/** Production cost of a city's current build, or null if it has no rushable item. */
function cityItemCost(city: City): number | null {
  const item = city.production;
  if (!item || item.kind === "project") return null; // projects never "complete"
  if (item.kind === "trainingBuilding") return trainingTier(item.family, item.tier).cost;
  return getBuildingDef(item.id)?.cost ?? null;
}

/** Resource cost to rush a city's current production with `currency`, or null if
 *  there is nothing rushable (no item, a project, or already fully stored). */
export function cityRushCost(city: City, currency: RushCurrency): number | null {
  const cost = cityItemCost(city);
  if (cost === null) return null;
  const remaining = cost - city.productionStored;
  if (remaining <= 0) return null;
  return Math.ceil(remaining * PER_PROD[currency]);
}

/** Total remaining labour across all disciplines of a work. */
function workRemainingLabour(work: Work): number {
  let rem = 0;
  for (const d of Object.keys(work.requirement) as Discipline[]) {
    rem += Math.max(0, (work.requirement[d] ?? 0) - (work.progress[d] ?? 0));
  }
  return rem;
}

/** Resource cost to rush a work with `currency`, or null if it is already done. */
export function workRushCost(work: Work, currency: RushCurrency): number | null {
  const remaining = workRemainingLabour(work);
  if (remaining <= 0) return null;
  return Math.ceil(remaining * PER_LABOUR[currency]);
}

/** Validate rushing a city's production without mutating. */
export function canRushCity(
  state: GameState,
  playerId: number,
  cityId: number,
  currency: RushCurrency,
): RushResult {
  const player = playerById(state, playerId);
  if (!player) return { ok: false, error: "no such player" };
  const city = state.cities.get(cityId);
  if (!city || city.ownerId !== playerId) return { ok: false, error: "not your city" };
  if (!currencyAllowed(state, playerId, currency)) {
    return { ok: false, error: `${CURRENCY_LABEL[currency]} rushing is not unlocked` };
  }
  const cost = cityRushCost(city, currency);
  if (cost === null) return { ok: false, error: "nothing to rush here" };
  if (poolOf(player, currency) < cost) return { ok: false, error: `not enough ${CURRENCY_LABEL[currency]}` };
  return { ok: true, cost };
}

/** Spend the resource and top the city's production up to completion. The item
 *  finishes on the next processCity (this turn's end-of-turn processing). */
export function rushCity(
  state: GameState,
  playerId: number,
  cityId: number,
  currency: RushCurrency,
): RushResult {
  const can = canRushCity(state, playerId, cityId, currency);
  if (!can.ok) return can;
  const player = playerById(state, playerId)!;
  const city = state.cities.get(cityId)!;
  const fullCost = cityItemCost(city)!;
  spendFromPool(player, currency, can.cost!);
  city.productionStored = Math.max(city.productionStored, fullCost);
  return { ok: true, cost: can.cost };
}

/** Validate rushing a work without mutating. */
export function canRushWork(
  state: GameState,
  playerId: number,
  workId: number,
  currency: RushCurrency,
): RushResult {
  const player = playerById(state, playerId);
  if (!player) return { ok: false, error: "no such player" };
  const work = state.works.find((w) => w.id === workId && w.ownerId === playerId);
  if (!work) return { ok: false, error: "no such work" };
  if (!currencyAllowed(state, playerId, currency)) {
    return { ok: false, error: `${CURRENCY_LABEL[currency]} rushing is not unlocked` };
  }
  const cost = workRushCost(work, currency);
  if (cost === null) return { ok: false, error: "nothing to rush here" };
  if (poolOf(player, currency) < cost) return { ok: false, error: `not enough ${CURRENCY_LABEL[currency]}` };
  return { ok: true, cost };
}

/** Resource cost to rush a training order with `currency`, or null if it is about to
 *  finish anyway (≤1 turn left). */
export function trainingRushCost(order: TrainingOrder, currency: RushCurrency): number | null {
  if (order.turnsLeft <= 1) return null;
  return Math.ceil((order.turnsLeft - 1) * PER_TRAIN_TURN[currency]);
}

function findTrainingOrder(state: GameState, cityId: number, orderId: number): { city: City; order: TrainingOrder } | null {
  const city = state.cities.get(cityId);
  if (!city) return null;
  const order = city.trainingQueue.find((o) => o.id === orderId);
  return order ? { city, order } : null;
}

/** Validate rushing a training order without mutating. */
export function canRushTraining(
  state: GameState,
  playerId: number,
  cityId: number,
  orderId: number,
  currency: RushCurrency,
): RushResult {
  const player = playerById(state, playerId);
  if (!player) return { ok: false, error: "no such player" };
  const found = findTrainingOrder(state, cityId, orderId);
  if (!found || found.city.ownerId !== playerId) return { ok: false, error: "no such training order" };
  if (!currencyAllowed(state, playerId, currency)) {
    return { ok: false, error: `${CURRENCY_LABEL[currency]} rushing is not unlocked` };
  }
  const cost = trainingRushCost(found.order, currency);
  if (cost === null) return { ok: false, error: "nothing to rush here" };
  if (poolOf(player, currency) < cost) return { ok: false, error: `not enough ${CURRENCY_LABEL[currency]}` };
  return { ok: true, cost };
}

/** Spend the resource and finish a training order on the next turn-processing. */
export function rushTraining(
  state: GameState,
  playerId: number,
  cityId: number,
  orderId: number,
  currency: RushCurrency,
): RushResult {
  const can = canRushTraining(state, playerId, cityId, orderId, currency);
  if (!can.ok) return can;
  const player = playerById(state, playerId)!;
  const { order } = findTrainingOrder(state, cityId, orderId)!;
  spendFromPool(player, currency, can.cost!);
  order.turnsLeft = 1; // completes on this turn's advanceTraining
  return { ok: true, cost: can.cost };
}

/** Spend the resource and fill the work's progress to its requirement. It
 *  completes on the next advanceWorks (this turn's processing). */
export function rushWork(
  state: GameState,
  playerId: number,
  workId: number,
  currency: RushCurrency,
): RushResult {
  const can = canRushWork(state, playerId, workId, currency);
  if (!can.ok) return can;
  const player = playerById(state, playerId)!;
  const work = state.works.find((w) => w.id === workId && w.ownerId === playerId)!;
  spendFromPool(player, currency, can.cost!);
  for (const d of Object.keys(work.requirement) as Discipline[]) {
    work.progress[d] = work.requirement[d] ?? 0;
  }
  return { ok: true, cost: can.cost };
}
