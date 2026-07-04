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
  UNIQUE_UNITS,
  UNIQUE_UNIT_IDS,
  uniqueUnitForCiv,
  getUniqueUnit,
  UNIQUE_INFRA,
  UNIQUE_IMPROVEMENTS,
  uniqueInfraForCiv,
  uniqueBuildingForCiv,
  uniqueImprovementForCiv,
  getUniqueInfra,
  type CivDef,
  type CivEffects,
  type CivicDef,
  type GovernmentDef,
  type UniqueUnitDef,
  type UniqueInfraDef,
} from "@roc/data";
import { getLegend, getWonder } from "@roc/data";
import { UNIT_DEFS, CIVICS_REQUIRED_TECH, UNIQUE_ABILITY_OVERRIDES, LEGEND_ABILITY_OVERRIDES, type ActiveAbilityId } from "./content";
import { getReligionKit } from "@roc/data";
import { cityMajorityFaith, religionDefIdOf, religionTierForUnit, religionUnitKit } from "./religion-units";
import { legendEmpireEffects, legendGarrisonEffects } from "./legend-effects";
import type { GameState, Player, Unit, City } from "./state";
import { playerById, citiesOf } from "./state";

export { CIVILIZATIONS, getCiv, CIVICS, GOVERNMENTS, getCivic, getGovernment, getPolicy, nextCityNameForCiv };
export { UNIQUE_UNITS, UNIQUE_UNIT_IDS, uniqueUnitForCiv, getUniqueUnit };
export { UNIQUE_INFRA, UNIQUE_IMPROVEMENTS, uniqueInfraForCiv, uniqueBuildingForCiv, uniqueImprovementForCiv, getUniqueInfra };
export type { CivDef, CivEffects, CivicDef, GovernmentDef, UniqueUnitDef, UniqueInfraDef };

/** The unique unit a unit's owner fields in place of its base type, if any. */
export function uniqueUnitForUnit(state: GameState, unit: Unit): UniqueUnitDef | undefined {
  return uniqueUnitForCiv(playerById(state, unit.ownerId)?.civId, unit.type);
}

/** Display name for a unit: its legend name if it is a hero, else its civ's
 *  unique-unit name if it has one, else the base name. */
export function unitDisplayName(state: GameState, unit: Unit): string {
  const legend = getLegend(unit.legendId);
  if (legend) return legend.name;
  return uniqueUnitForUnit(state, unit)?.name ?? UNIT_DEFS[unit.type].name;
}

/**
 * The active abilities a unit instance actually has, honoring legend signature
 * kits (docs/UNIT-ABILITIES.md §9) and civ-unique overrides (§8). A legend
 * listed in LEGEND_ABILITY_OVERRIDES fields its hero kit; a unique unit listed
 * in UNIQUE_ABILITY_OVERRIDES replaces its base unit's ability list; everyone
 * else inherits the base unit's abilities.
 */
export function effectiveAbilities(state: GameState, unit: Unit): ActiveAbilityId[] {
  if (unit.legendId) {
    const heroKit = LEGEND_ABILITY_OVERRIDES[unit.legendId];
    if (heroKit) return heroKit;
  }
  const uu = uniqueUnitForUnit(state, unit);
  if (uu) {
    const override = UNIQUE_ABILITY_OVERRIDES[uu.id];
    if (override) return override;
  }
  const base = UNIT_DEFS[unit.type].activeAbilities ?? [];
  // A religion unique unit unlocks its second active once its faith hits tier 4.
  const kit = religionUnitKit(unit.type);
  if (kit?.tier4Active && religionTierForUnit(state, unit) >= 4) {
    return [...base, kit.tier4Active];
  }
  return base;
}

/** Whether a unit instance has a given active ability (civ-unique aware). */
export function unitHasActiveAbility(state: GameState, unit: Unit, ability: ActiveAbilityId): boolean {
  return effectiveAbilities(state, unit).includes(ability);
}

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
  if (e.rushWithFaith) acc.rushWithFaith = true;
  if (e.rushWithCulture) acc.rushWithCulture = true;
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
  if (e.faithOnKill) acc.faithOnKill = (acc.faithOnKill ?? 0) + e.faithOnKill;
  if (e.xpGainPercent) acc.xpGainPercent = (acc.xpGainPercent ?? 0) + e.xpGainPercent;
  if (e.trainTimePercent) acc.trainTimePercent = (acc.trainTimePercent ?? 0) + e.trainTimePercent;
  if (e.startMoraleBonus) acc.startMoraleBonus = (acc.startMoraleBonus ?? 0) + e.startMoraleBonus;
  if (e.startXpBonus) acc.startXpBonus = (acc.startXpBonus ?? 0) + e.startXpBonus;
  if (e.trainingSlotsBonus) acc.trainingSlotsBonus = (acc.trainingSlotsBonus ?? 0) + e.trainingSlotsBonus;
  if (e.freeTrainingFamilies) {
    acc.freeTrainingFamilies = [...new Set([...(acc.freeTrainingFamilies ?? []), ...e.freeTrainingFamilies])];
  }
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
  // Civ-unique buildings raised anywhere in the empire contribute their
  // empire-wide effects — once each, no matter how many cities built them.
  const seenInfra = new Set<string>();
  for (const c of citiesOf(state, playerId)) {
    for (const b of c.buildings) {
      if (seenInfra.has(b)) continue;
      seenInfra.add(b);
      const inf = getUniqueInfra(b);
      if (inf?.effects) mergeInto(acc, inf.effects);
    }
  }
  // The founder's religion applies to their empire: its historically-fitting
  // PRESET benefit (see @roc/data RELIGION_KITS) plus every perk it has picked.
  const religion = p.foundedReligionId ? state.religions.find((r) => r.id === p.foundedReligionId) : undefined;
  if (religion) {
    mergeInto(acc, getReligionKit(religionDefIdOf(religion))?.preset.effects);
    for (const b of religion.beliefs) mergeInto(acc, getBelief(b)?.effects);
  }
  // Timed leader-ability modifiers.
  for (const m of p.modifiers) {
    if (m.expiresOnTurn >= state.turn) mergeInto(acc, m.effect);
  }
  // Living legends' empire-wide presence effects (Pachacuti's roads, Zheng He's fleet).
  mergeInto(acc, legendEmpireEffects(state, playerId));
  // World wonders the player has raised grant their passive empire effects
  // (the Colossus's trade gold, the Oracle's faith-rushing, Tenochtitlán's causeways…).
  const ownedWonders = new Set<string>();
  for (const c of citiesOf(state, playerId)) for (const w of c.wonders) ownedWonders.add(w);
  for (const wid of ownedWonders) mergeInto(acc, getWonder(wid)?.effect.civEffects);
  return acc;
}

/** Active bonuses for a specific city: empire effects + city-specific modifiers. */
export function cityEffects(state: GameState, city: City): CivEffects {
  const acc: CivEffects = {};
  for (const m of city.modifiers) {
    if (m.expiresOnTurn >= state.turn) mergeInto(acc, m.effect);
  }
  // A legend holding court in the city (Ramesses' monuments, Pachacuti's terraces).
  mergeInto(acc, legendGarrisonEffects(state, city));
  // A religion's holy city enjoys the faith's CAPITAL bonus while it keeps the faith.
  mergeInto(acc, holyCityBonus(state, city));
  return acc;
}

/** The capital bonus of the religion whose holy city this is, if the city still
 *  follows that faith (a converted-away holy city grants nothing). */
export function holyCityBonus(state: GameState, city: City): CivEffects | undefined {
  for (const r of state.religions) {
    if (r.holyCityId !== city.id) continue;
    if (cityMajorityFaith(city) !== r.id) continue;
    return getReligionKit(religionDefIdOf(r))?.capital.effects;
  }
  return undefined;
}

/** A named contributor to a player's effects, for attribution in the UI. */
export interface EffectSource {
  label: string;
  effects: CivEffects;
}

/**
 * The same effect contributors `playerEffects` merges, but kept separate and
 * labelled so the UI can attribute a bonus to the specific trait that grants it.
 * Walks the identical sources in the identical order — keep in sync with
 * `playerEffects`.
 */
export function effectSources(state: GameState, playerId: number): EffectSource[] {
  const p = playerById(state, playerId);
  const out: EffectSource[] = [];
  if (!p) return out;
  const push = (label: string | undefined, effects: CivEffects | undefined) => {
    if (label && effects) out.push({ label, effects });
  };
  const civ = getCiv(p.civId);
  push(civ?.abilityName ?? civ?.name, civ?.effects);
  const gov = getGovernment(p.government);
  push(gov?.name, gov?.effects);
  for (const policyId of p.policies) {
    const pol = getPolicy(policyId);
    push(pol?.name, pol?.effects);
  }
  const seenInfra = new Set<string>();
  for (const c of citiesOf(state, playerId)) {
    for (const b of c.buildings) {
      if (seenInfra.has(b)) continue;
      seenInfra.add(b);
      const inf = getUniqueInfra(b);
      push(inf?.name, inf?.effects);
    }
  }
  const religion = p.foundedReligionId ? state.religions.find((r) => r.id === p.foundedReligionId) : undefined;
  if (religion) {
    const kit = getReligionKit(religionDefIdOf(religion));
    push(kit?.preset.name, kit?.preset.effects);
    for (const b of religion.beliefs) {
      const belief = getBelief(b);
      push(belief?.name, belief?.effects);
    }
  }
  for (const m of p.modifiers) {
    if (m.expiresOnTurn >= state.turn) push(m.source, m.effect);
  }
  return out;
}

/** Named city-specific effect contributors (timed leader-ability modifiers). */
export function cityEffectSources(state: GameState, city: City): EffectSource[] {
  const out: EffectSource[] = [];
  for (const m of city.modifiers) {
    if (m.expiresOnTurn >= state.turn) out.push({ label: m.source, effects: m.effect });
  }
  return out;
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
  if (promotions.includes("mounted_archer")) base += 1;
  if (promotions.includes("breakthrough")) base += 1;
  if (promotions.includes("rapid_reload")) base += 1;
  return base;
}

/** Combat-strength bonus for a unit's class (attacker or defender). */
export function civCombatBonus(state: GameState, unit: Unit): number {
  let bonus = playerEffects(state, unit.ownerId).unitClassCombat?.[UNIT_DEFS[unit.type].cls] ?? 0;
  bonus += uniqueUnitForUnit(state, unit)?.bonus ?? 0;
  return bonus;
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
