// Culture victory — "Influence". A civ projects tourism (renown) from its wonders,
// Great Works and cultural buildings. Accumulated influence over a rival must exceed
// that rival's lifetime culture; do it to EVERY living major and you win.
//
// Reads relationship/trade/religion state directly (no diplomacy/economy imports) so
// victory.ts can import this without a module cycle. See docs/VICTORY-CONDITIONS.md §5.

import type { GameState, Player } from "./state";
import { citiesOf, playerById } from "./state";

/** Renown radiated by a single wonder, and by each tier of cultural building. */
const TOURISM_PER_WONDER = 3;
const CULTURE_BUILDING_TOURISM: Record<string, number> = {
  monument: 1,
  amphitheater: 2,
  museum: 3,
  temple: 1,
};

/** Base tourism (renown) a civ projects, before per-rival relationship modifiers. */
export function baseTourism(state: GameState, playerId: number): number {
  let t = 0;
  for (const c of citiesOf(state, playerId)) {
    t += c.wonders.length * TOURISM_PER_WONDER;
    for (const b of c.buildings) t += CULTURE_BUILDING_TOURISM[b] ?? 0;
    t += (c.greatWorks?.length ?? 0) * 2; // forward-compat with explicit Great Works
  }
  return t;
}

/** A representative faith for a civ (its capital's, else any city's). */
function faithOf(state: GameState, playerId: number): string | undefined {
  const cities = citiesOf(state, playerId);
  const cap = cities.find((c) => c.isCapital) ?? cities[0];
  return cap?.religion;
}

/** Whether two civs share a dominant religion (boosts cultural exchange). */
function sharedFaith(state: GameState, a: number, b: number): boolean {
  const fa = faithOf(state, a);
  return !!fa && fa === faithOf(state, b);
}

/** Tourism multiplier from the from→to relationship: open borders, shared religion
 *  and an active trade route all spread culture; war stifles it. */
function relationMultiplier(state: GameState, fromId: number, toId: number): number {
  const lo = Math.min(fromId, toId);
  const hi = Math.max(fromId, toId);
  const rel = state.relations.find((r) => r.a === lo && r.b === hi);
  if (rel?.status === "war") return 0.5;
  let m = 1;
  if (rel?.openBorders) m += 0.25;
  if (sharedFaith(state, fromId, toId)) m += 0.25;
  const linked = state.tradeRoutes.some(
    (r) =>
      (r.ownerId === fromId && r.toOwnerId === toId) ||
      (r.ownerId === toId && r.toOwnerId === fromId),
  );
  if (linked) m += 0.25;
  return m;
}

/** Tourism `fromId` exerts on `toId` this turn. */
export function tourismToward(state: GameState, fromId: number, toId: number): number {
  return baseTourism(state, fromId) * relationMultiplier(state, fromId, toId);
}

function hasCities(state: GameState, playerId: number): boolean {
  return citiesOf(state, playerId).length > 0;
}

/** Accrue one turn of influence from `playerId` onto every living major rival. */
export function accrueInfluence(state: GameState, playerId: number): void {
  const me = playerById(state, playerId);
  if (!me || me.isBarbarian) return;
  if (!me.influenceOver) me.influenceOver = {};
  for (const other of state.players) {
    if (other.isBarbarian || other.id === playerId || !hasCities(state, other.id)) continue;
    me.influenceOver[other.id] = (me.influenceOver[other.id] ?? 0) + tourismToward(state, playerId, other.id);
  }
}

/** Whether `fromId` is culturally influential over `toId` (renown ≥ their culture). */
export function influentialOver(state: GameState, fromId: number, toId: number): boolean {
  const from = playerById(state, fromId);
  const to = playerById(state, toId);
  const inf = from?.influenceOver?.[toId] ?? 0;
  return inf > 0 && inf >= (to?.cultureLifetime ?? 0);
}

/** Rivals this civ still needs to win over, and those already influenced. */
export function influenceStanding(state: GameState, playerId: number): { influenced: number; total: number } {
  const rivals = state.players.filter(
    (p) => !p.isBarbarian && p.id !== playerId && hasCities(state, p.id),
  );
  const influenced = rivals.filter((r) => influentialOver(state, playerId, r.id)).length;
  return { influenced, total: rivals.length };
}

/** A culture victory: influential over every living major rival (≥ 1 rival). */
export function cultureVictoryAchieved(state: GameState, player: Player): boolean {
  const { influenced, total } = influenceStanding(state, player.id);
  return total >= 1 && influenced === total;
}
