// Bridges civilization + civics/government content (in @roc/data) into the sim.
// All gameplay bonuses (civ ability, government, active policies) are MERGED into
// a single effects object that economy/combat/movement read at the right points.

import {
  CIVILIZATIONS,
  CIVICS,
  GOVERNMENTS,
  getCiv,
  getCivic,
  getGovernment,
  getPolicy,
  getBelief,
  nextCityNameForCiv,
  type CivDef,
  type CivEffects,
  type CivicDef,
  type GovernmentDef,
} from "@roc/data";
import { UNIT_DEFS, CIVICS_REQUIRED_TECH } from "./content";
import type { GameState, Player, Unit } from "./state";
import { playerById } from "./state";

export { CIVILIZATIONS, getCiv, CIVICS, GOVERNMENTS, getCivic, getGovernment, getPolicy, nextCityNameForCiv };
export type { CivDef, CivEffects, CivicDef, GovernmentDef };

function mergeInto(acc: CivEffects, e: CivEffects | undefined): void {
  if (!e) return;
  if (e.yieldPercent) {
    acc.yieldPercent ??= {};
    for (const k of ["food", "production", "gold", "science"] as const) {
      if (e.yieldPercent[k]) acc.yieldPercent[k] = (acc.yieldPercent[k] ?? 0) + e.yieldPercent[k]!;
    }
  }
  if (e.cavalryMovementBonus) acc.cavalryMovementBonus = (acc.cavalryMovementBonus ?? 0) + e.cavalryMovementBonus;
  if (e.unitClassCombat) {
    acc.unitClassCombat ??= {};
    for (const [cls, v] of Object.entries(e.unitClassCombat)) {
      acc.unitClassCombat[cls] = (acc.unitClassCombat[cls] ?? 0) + v;
    }
  }
  if (e.goldPerWorkedDesert) acc.goldPerWorkedDesert = (acc.goldPerWorkedDesert ?? 0) + e.goldPerWorkedDesert;
  // Founding bonuses come from the civ only (not merged additively).
  if (e.newCityFreeBuilding && !acc.newCityFreeBuilding) acc.newCityFreeBuilding = e.newCityFreeBuilding;
  if (e.newCityExtraPopulation) acc.newCityExtraPopulation = (acc.newCityExtraPopulation ?? 0) + e.newCityExtraPopulation;
}

/** All active bonuses for a player: civ ability + government + policy cards. */
export function playerEffects(state: GameState, playerId: number): CivEffects {
  const p = playerById(state, playerId);
  const acc: CivEffects = {};
  if (!p) return acc;
  mergeInto(acc, getCiv(p.civId)?.effects);
  mergeInto(acc, getGovernment(p.government)?.effects);
  for (const policyId of p.policies) mergeInto(acc, getPolicy(policyId)?.effects);
  // Founder beliefs of the player's religion apply to their empire.
  const religion = p.foundedReligionId ? state.religions.find((r) => r.id === p.foundedReligionId) : undefined;
  if (religion) for (const b of religion.beliefs) mergeInto(acc, getBelief(b)?.effects);
  return acc;
}

/** Back-compat alias used by economy/founding (civ + gov + policies). */
export const civEffectsOf = playerEffects;

/** A unit's effective movement allowance including bonuses (e.g. Mongols/Maneuver). */
export function unitMovement(state: GameState, unit: Unit): number {
  const base = UNIT_DEFS[unit.type].movement;
  if (UNIT_DEFS[unit.type].cls === "cavalry") {
    return base + (playerEffects(state, unit.ownerId).cavalryMovementBonus ?? 0);
  }
  return base;
}

/** Combat-strength bonus for a unit's class (attacker or defender). */
export function civCombatBonus(state: GameState, unit: Unit): number {
  return playerEffects(state, unit.ownerId).unitClassCombat?.[UNIT_DEFS[unit.type].cls] ?? 0;
}

// ---- civics tree ---------------------------------------------------------

/** Civics become available only after researching this technology. */
export function civicsUnlocked(player: Player): boolean {
  return player.researched.has(CIVICS_REQUIRED_TECH);
}

export function civicUnlocked(researched: ReadonlySet<string>, civicId: string): boolean {
  return (getCivic(civicId)?.prereqs ?? []).every((p) => researched.has(p));
}

export function availableCivics(player: Player): string[] {
  if (!civicsUnlocked(player)) return [];
  return CIVICS.filter((c) => !player.civicsResearched.has(c.id) && civicUnlocked(player.civicsResearched, c.id)).map((c) => c.id);
}

/** Governments the player may currently adopt (their required civic is known). */
export function availableGovernments(player: Player): string[] {
  return GOVERNMENTS.filter((g) => !g.reqCivic || player.civicsResearched.has(g.reqCivic)).map((g) => g.id);
}

/** Policy cards the player has unlocked (via researched civics). */
export function unlockedPolicies(player: Player): string[] {
  const out: string[] = [];
  for (const id of player.civicsResearched) {
    const pol = getCivic(id)?.unlocksPolicy;
    if (pol) out.push(pol);
  }
  return out;
}
