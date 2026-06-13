// Bridges the civilization content (in @roc/data, dependency-free) into the sim.
// The sim reads a player's CivEffects at the relevant points (yields, movement,
// combat, city founding). Re-exports the civ list so clients can read it via
// @roc/sim without depending on @roc/data directly.

import { CIVILIZATIONS, getCiv, type CivDef, type CivEffects } from "@roc/data";
import { UNIT_DEFS } from "./content";
import type { GameState, Unit } from "./state";
import { playerById } from "./state";

export { CIVILIZATIONS, getCiv };
export type { CivDef, CivEffects };

const EMPTY: CivEffects = {};

export function civEffectsOf(state: GameState, playerId: number): CivEffects {
  return getCiv(playerById(state, playerId)?.civId)?.effects ?? EMPTY;
}

/** A unit's effective movement allowance including civ bonuses (e.g. Mongols). */
export function unitMovement(state: GameState, unit: Unit): number {
  const base = UNIT_DEFS[unit.type].movement;
  if (UNIT_DEFS[unit.type].cls === "cavalry") {
    return base + (civEffectsOf(state, unit.ownerId).cavalryMovementBonus ?? 0);
  }
  return base;
}

/** Civ combat-strength bonus for a unit's class (attacker or defender). */
export function civCombatBonus(state: GameState, unit: Unit): number {
  return civEffectsOf(state, unit.ownerId).unitClassCombat?.[UNIT_DEFS[unit.type].cls] ?? 0;
}
