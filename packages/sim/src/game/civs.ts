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
import type { GameState, Player, Unit, City } from "./state";
import { playerById } from "./state";

export { CIVILIZATIONS, getCiv, CIVICS, GOVERNMENTS, getCivic, getGovernment, getPolicy, nextCityNameForCiv };
export type { CivDef, CivEffects, CivicDef, GovernmentDef };

function mergeCityYield(acc: NonNullable<CivEffects["coastalCityYield"]>, src: NonNullable<CivEffects["coastalCityYield"]>): void {
  for (const k of ["food", "production", "gold", "science", "culture", "faith"] as const) {
    if (src[k]) acc[k] = (acc[k] ?? 0) + src[k]!;
  }
}

function mergeInto(acc: CivEffects, e: CivEffects | undefined): void {
  if (!e) return;
  if (e.yieldPercent) {
    acc.yieldPercent ??= {};
    for (const k of ["food", "production", "gold", "science", "culture", "faith"] as const) {
      if (e.yieldPercent[k]) acc.yieldPercent[k] = (acc.yieldPercent[k] ?? 0) + e.yieldPercent[k]!;
    }
  }
  if (e.cavalryMovementBonus) acc.cavalryMovementBonus = (acc.cavalryMovementBonus ?? 0) + e.cavalryMovementBonus;
  if (e.navalMovementBonus) acc.navalMovementBonus = (acc.navalMovementBonus ?? 0) + e.navalMovementBonus;
  if (e.landMovementBonus) acc.landMovementBonus = (acc.landMovementBonus ?? 0) + e.landMovementBonus;
  if (e.allUnitMovementBonus) acc.allUnitMovementBonus = (acc.allUnitMovementBonus ?? 0) + e.allUnitMovementBonus;
  if (e.mountedSightBonus) acc.mountedSightBonus = (acc.mountedSightBonus ?? 0) + e.mountedSightBonus;
  if (e.ignoreRoughTerrain) acc.ignoreRoughTerrain = true;
  if (e.ignoreMountainMovement) acc.ignoreMountainMovement = true;
  if (e.unitClassCombat) {
    acc.unitClassCombat ??= {};
    for (const [cls, v] of Object.entries(e.unitClassCombat)) {
      acc.unitClassCombat[cls] = (acc.unitClassCombat[cls] ?? 0) + v;
    }
  }
  if (e.embarkedCombatBonus) acc.embarkedCombatBonus = (acc.embarkedCombatBonus ?? 0) + e.embarkedCombatBonus;
  if (e.meleeVsCityBonus) acc.meleeVsCityBonus = (acc.meleeVsCityBonus ?? 0) + e.meleeVsCityBonus;
  if (e.siegeVsCityDefenseMultiplier) acc.siegeVsCityDefenseMultiplier = (acc.siegeVsCityDefenseMultiplier ?? 0) + e.siegeVsCityDefenseMultiplier;
  if (e.unitHealPerTurn) acc.unitHealPerTurn = (acc.unitHealPerTurn ?? 0) + e.unitHealPerTurn;
  if (e.mountedHealPerTurn) acc.mountedHealPerTurn = (acc.mountedHealPerTurn ?? 0) + e.mountedHealPerTurn;
  if (e.militaryMaintenanceCostMultiplier) acc.militaryMaintenanceCostMultiplier = (acc.militaryMaintenanceCostMultiplier ?? 0) + e.militaryMaintenanceCostMultiplier;
  if (e.tradeRouteGoldBonus) acc.tradeRouteGoldBonus = (acc.tradeRouteGoldBonus ?? 0) + e.tradeRouteGoldBonus;
  if (e.tradeRouteFaithBonus) acc.tradeRouteFaithBonus = (acc.tradeRouteFaithBonus ?? 0) + e.tradeRouteFaithBonus;
  if (e.tradeRouteCapacityBonus) acc.tradeRouteCapacityBonus = (acc.tradeRouteCapacityBonus ?? 0) + e.tradeRouteCapacityBonus;
  if (e.wonderProductionBonus) acc.wonderProductionBonus = (acc.wonderProductionBonus ?? 0) + e.wonderProductionBonus;
  if (e.defensiveBuildingProductionBonus) acc.defensiveBuildingProductionBonus = (acc.defensiveBuildingProductionBonus ?? 0) + e.defensiveBuildingProductionBonus;
  if (e.holySiteTempleProductionBonus) acc.holySiteTempleProductionBonus = (acc.holySiteTempleProductionBonus ?? 0) + e.holySiteTempleProductionBonus;
  if (e.coastalCityYield) { acc.coastalCityYield ??= {}; mergeCityYield(acc.coastalCityYield, e.coastalCityYield); }
  if (e.desertCityYield) { acc.desertCityYield ??= {}; mergeCityYield(acc.desertCityYield, e.desertCityYield); }
  if (e.islandCityYield) { acc.islandCityYield ??= {}; mergeCityYield(acc.islandCityYield, e.islandCityYield); }
  if (e.nonDesertCityFoodPercent) acc.nonDesertCityFoodPercent = (acc.nonDesertCityFoodPercent ?? 0) + e.nonDesertCityFoodPercent;
  if (e.mineTileProductionBonus) acc.mineTileProductionBonus = (acc.mineTileProductionBonus ?? 0) + e.mineTileProductionBonus;
  if (e.mineTileFoodPenalty) acc.mineTileFoodPenalty = (acc.mineTileFoodPenalty ?? 0) + e.mineTileFoodPenalty;
  if (e.pastureTileGoldBonus) acc.pastureTileGoldBonus = (acc.pastureTileGoldBonus ?? 0) + e.pastureTileGoldBonus;
  if (e.pastureTileFoodBonus) acc.pastureTileFoodBonus = (acc.pastureTileFoodBonus ?? 0) + e.pastureTileFoodBonus;
  if (e.farmTileFoodBonus) acc.farmTileFoodBonus = (acc.farmTileFoodBonus ?? 0) + e.farmTileFoodBonus;
  if (e.farmTileFaithBonus) acc.farmTileFaithBonus = (acc.farmTileFaithBonus ?? 0) + e.farmTileFaithBonus;
  if (e.forestTileFaithBonus) acc.forestTileFaithBonus = (acc.forestTileFaithBonus ?? 0) + e.forestTileFaithBonus;
  if (e.forestTileCombatBonus) acc.forestTileCombatBonus = (acc.forestTileCombatBonus ?? 0) + e.forestTileCombatBonus;
  if (e.hillTileProductionBonus) acc.hillTileProductionBonus = (acc.hillTileProductionBonus ?? 0) + e.hillTileProductionBonus;
  if (e.freshWaterTileFoodBonus) acc.freshWaterTileFoodBonus = (acc.freshWaterTileFoodBonus ?? 0) + e.freshWaterTileFoodBonus;
  if (e.freshWaterTileProductionBonus) acc.freshWaterTileProductionBonus = (acc.freshWaterTileProductionBonus ?? 0) + e.freshWaterTileProductionBonus;
  if (e.coastalTileGoldBonus) acc.coastalTileGoldBonus = (acc.coastalTileGoldBonus ?? 0) + e.coastalTileGoldBonus;
  if (e.goldPerWorkedDesert) acc.goldPerWorkedDesert = (acc.goldPerWorkedDesert ?? 0) + e.goldPerWorkedDesert;
  if (e.captureCityPopulationBonus) acc.captureCityPopulationBonus = (acc.captureCityPopulationBonus ?? 0) + e.captureCityPopulationBonus;
  if (e.raidGoldPercent) acc.raidGoldPercent = (acc.raidGoldPercent ?? 0) + e.raidGoldPercent;
  if (e.coastalRaidGoldPercent) acc.coastalRaidGoldPercent = (acc.coastalRaidGoldPercent ?? 0) + e.coastalRaidGoldPercent;
  if (e.raidSciencePercent) acc.raidSciencePercent = (acc.raidSciencePercent ?? 0) + e.raidSciencePercent;
  // Founding bonuses come from the civ only (not merged additively).
  if (e.newCityFreeBuilding && !acc.newCityFreeBuilding) acc.newCityFreeBuilding = e.newCityFreeBuilding;
  if (e.newCityExtraPopulation) acc.newCityExtraPopulation = (acc.newCityExtraPopulation ?? 0) + e.newCityExtraPopulation;
}

/** All active bonuses for a player: civ ability + government + policy cards + leader-ability modifiers. */
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
  // Timed leader-ability modifiers.
  for (const m of p.modifiers) {
    if (m.expiresOnTurn >= state.turn) mergeInto(acc, m.effect);
  }
  return acc;
}

/** Active bonuses for a specific city: empire effects + city-specific modifiers. */
export function cityEffects(state: GameState, city: City): CivEffects {
  const acc: CivEffects = {};
  for (const m of city.modifiers) {
    if (m.expiresOnTurn >= state.turn) mergeInto(acc, m.effect);
  }
  return acc;
}

/** Back-compat alias used by economy/founding (civ + gov + policies). */
export const civEffectsOf = playerEffects;

/** A unit's effective movement allowance including promotions and civ bonuses. */
export function unitMovement(state: GameState, unit: Unit): number {
  const cls = UNIT_DEFS[unit.type].cls;
  let base = UNIT_DEFS[unit.type].movement;
  const eff = playerEffects(state, unit.ownerId);
  if (cls === "cavalry") {
    base += eff.cavalryMovementBonus ?? 0;
  }
  if (cls === "naval_melee" || cls === "naval_ranged") {
    base += eff.navalMovementBonus ?? 0;
  }
  if (cls !== "naval_melee" && cls !== "naval_ranged") {
    base += eff.landMovementBonus ?? 0;
  }
  base += eff.allUnitMovementBonus ?? 0;
  const promotions = unit.promotions;
  if (promotions.includes("mobility")) base += 1;
  if (promotions.includes("commando")) base += 1;
  if (promotions.includes("logistics")) base += 1;
  if (promotions.includes("rapid_deployment")) base += 1;
  if (promotions.includes("tracking")) base += 1;
  if (promotions.includes("pioneer")) base += 1;
  if (promotions.includes("engineer")) base += 1;
  if (promotions.includes("foreman")) base += 1;
  if (promotions.includes("mounted_archer")) base += 1;
  if (promotions.includes("breakthrough")) base += 1;
  if (promotions.includes("rapid_reload")) base += 1;
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
