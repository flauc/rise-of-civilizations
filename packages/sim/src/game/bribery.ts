// Barbarian diplomacy: bribing and recruiting barbarian war-bands.
//
// Unlocked by the Parley tech (BARBARIAN_DIPLOMACY_TECH). Two options when one of
// your units stands next to a barbarian:
//   • BRIBE   — buy a 10-turn truce. Every barbarian sharing the same camp
//               (war-band) stops attacking YOU for the duration; future raiders
//               from that camp respect it too. Each bribe you pay doubles the
//               price of your next one.
//   • RECRUIT — pay a larger, unit-specific fee to take the unit into your army.
//               The price scales with the unit's type (its build cost) and level.

import { axialDistance, offsetToAxial } from "@roc/shared";
import type { GameState, Player, Unit } from "./state";
import { citiesOf, log, playerById, unitsOf } from "./state";
import { BARBARIAN_DIPLOMACY_TECH, UNIT_DEFS } from "./content";

export interface BriberyResult {
  ok: boolean;
  error?: string;
}

/** How many turns a bribe truce lasts. */
export const BRIBE_TURNS = 10;
/** Gold cost of a player's FIRST bribe; each subsequent bribe doubles it. */
export const BARBARIAN_BRIBE_BASE = 30;

/** Identifies the war-band a barbarian belongs to (its camp, else the lone unit). */
export function bribeKeyForUnit(unit: Unit): string {
  return unit.campKey ?? `unit:${unit.id}`;
}

/** Gold to bribe one more war-band — doubles with each bribe the player has paid. */
export function barbarianBribeCost(player: Player): number {
  return BARBARIAN_BRIBE_BASE * 2 ** player.bribesPaid;
}

/** Gold to recruit a barbarian unit: 5× its build cost, +40% per level above 1,
 *  rounded to the nearest 5 (e.g. Warrior L1 = 75, Slinger L1 = 60, Spearman L2 = 125). */
export function barbarianRecruitCost(unit: Unit): number {
  const base = UNIT_DEFS[unit.type].cost * 5 * (1 + 0.4 * (unit.level - 1));
  return Math.round(base / 5) * 5;
}

/** Is `unit` (a barbarian) currently under a bribed truce with `playerId`? */
export function isBarbarianPacified(state: GameState, unit: Unit, playerId: number): boolean {
  const key = bribeKeyForUnit(unit);
  return state.barbarianBribes.some(
    (b) => b.playerId === playerId && b.campKey === key && b.untilTurn >= state.turn,
  );
}

/** Drop truces that have run out (call once per round). */
export function pruneBarbarianBribes(state: GameState): void {
  state.barbarianBribes = state.barbarianBribes.filter((b) => b.untilTurn >= state.turn);
}

/** True if the player has a unit or city adjacent to the barbarian (to parley with). */
export function canParleyWith(state: GameState, unit: Unit, playerId: number): boolean {
  const here = offsetToAxial({ col: unit.col, row: unit.row });
  const adjacent = (col: number, row: number) =>
    axialDistance(here, offsetToAxial({ col, row })) === 1;
  for (const u of unitsOf(state, playerId)) if (adjacent(u.col, u.row)) return true;
  for (const c of citiesOf(state, playerId)) if (adjacent(c.col, c.row)) return true;
  return false;
}

/** Shared validation for both bribe and recruit. */
function validateParley(
  state: GameState,
  playerId: number,
  unitId: number,
): { ok: false; error: string } | { ok: true; player: Player; unit: Unit } {
  const player = playerById(state, playerId);
  if (!player) return { ok: false, error: "no such player" };
  if (!player.researched.has(BARBARIAN_DIPLOMACY_TECH)) return { ok: false, error: "research Parley first" };
  const unit = state.units.get(unitId);
  if (!unit) return { ok: false, error: "no such unit" };
  const owner = playerById(state, unit.ownerId);
  if (!owner?.isBarbarian) return { ok: false, error: "not a barbarian unit" };
  if (!canParleyWith(state, unit, playerId)) return { ok: false, error: "move a unit beside them to parley" };
  return { ok: true, player, unit };
}

/** Buy a 10-turn truce with the unit's whole war-band. */
export function bribeBarbarian(state: GameState, playerId: number, unitId: number): BriberyResult {
  const v = validateParley(state, playerId, unitId);
  if (!v.ok) return v;
  const { player, unit } = v;
  const cost = barbarianBribeCost(player);
  if (player.gold < cost) return { ok: false, error: "not enough gold" };

  player.gold -= cost;
  player.bribesPaid += 1;
  const key = bribeKeyForUnit(unit);
  const untilTurn = state.turn + BRIBE_TURNS;
  const existing = state.barbarianBribes.find((b) => b.playerId === playerId && b.campKey === key);
  if (existing) existing.untilTurn = Math.max(existing.untilTurn, untilTurn);
  else state.barbarianBribes.push({ campKey: key, playerId, untilTurn });

  log(state, `${player.name} bribed a barbarian war-band into a ${BRIBE_TURNS}-turn truce (−${cost} gold).`, {
    actorId: playerId,
    targetIds: [playerId],
    tile: { col: unit.col, row: unit.row },
  });
  return { ok: true };
}

/** Pay a fee to take a barbarian unit into your own army. */
export function recruitBarbarian(state: GameState, playerId: number, unitId: number): BriberyResult {
  const v = validateParley(state, playerId, unitId);
  if (!v.ok) return v;
  const { player, unit } = v;
  const cost = barbarianRecruitCost(unit);
  if (player.gold < cost) return { ok: false, error: "not enough gold" };

  player.gold -= cost;
  unit.ownerId = playerId;
  unit.campKey = undefined; // no longer answers to a barbarian camp
  unit.movementLeft = 0; // joins exhausted; acts next turn
  unit.attackedThisTurn = false;
  unit.attackedLastTurn = false;
  unit.sleeping = false;

  log(state, `${player.name} recruited a ${UNIT_DEFS[unit.type].name} from the barbarians (−${cost} gold).`, {
    actorId: playerId,
    targetIds: [playerId],
    tile: { col: unit.col, row: unit.row },
  });
  return { ok: true };
}
