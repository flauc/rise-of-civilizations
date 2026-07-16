// Pre-attack combat estimate for the client: likely damage and a readable list of
// modifiers on both sides (approximates resolveAttack math).

import { getTile, axialDistance, offsetToAxial, type TerrainType } from "@roc/shared";
import type { City, GameState, Unit } from "./state";
import { cityAt, unitAt } from "./state";
import { UNIT_DEFS, isRanged, type PromotionId } from "./content";
import { isRough, terrainDefense, TERRAIN_NAMES, isForestTerrain } from "./terrain";
import { structureDefense } from "./fortifications";
import {
  civCombatBonus,
  playerEffects,
  uniqueUnitForUnit,
  unitDisplayName,
} from "./civs";
import { tileOwnerId } from "./territory";
import { legendCombatBonus } from "./legends";
import { religionUnitCombatBonus } from "./religion-units";
import { playerReligionId } from "./religion";
import { isForestTile, riverBetween } from "./movement";
import { moraleAttackMultiplier, moraleDefenseMultiplier } from "./morale";
import {
  combatPreview,
  unitMaxHp,
  cityDefenseStrength,
  cityMaxHp,
  type CombatPreview,
} from "./combat";

export interface CombatModifier {
  side: "attacker" | "defender";
  label: string;
  effect: string;
}

export interface CombatPreviewDetail {
  preview: CombatPreview;
  attackerName: string;
  defenderName: string;
  /** Sprite id under public/units/ (legend id, unique id, or base type). */
  attackerTokenId: string;
  /** Defender unit sprite id; null when the target is a city. */
  defenderTokenId: string | null;
  /** City building sprite tier when the target is a city. */
  defenderCityTier: number | null;
  attackerHp: number;
  attackerMaxHp: number;
  defenderHp: number;
  defenderMaxHp: number;
  /** Estimated HP after this strike (attacker). */
  attackerHpAfter: number;
  /** Estimated HP after this strike (defender). */
  defenderHpAfter: number;
  /** Estimated damage the attacker deals this strike. */
  attackerDamage: number;
  /** Estimated damage the defender deals back (0 for ranged). */
  defenderDamage: number;
  ranged: boolean;
  attackerMods: CombatModifier[];
  defenderMods: CombatModifier[];
}

function unitTokenId(state: GameState, unit: Unit): string {
  if (unit.legendId) return unit.legendId;
  return uniqueUnitForUnit(state, unit)?.id ?? unit.type;
}

/** Matches client city-assets tier indexing for building sprites. */
function cityTokenTier(population: number): number {
  return Math.max(0, Math.min(10, population) - 1);
}

function has(unit: Unit, p: PromotionId): boolean {
  return unit.promotions.includes(p);
}

function levelLabel(unit: Unit): string | null {
  if (unit.level <= 1) return null;
  return `+${Math.round((unit.level - 1) * 5)}% from level ${unit.level}`;
}

function woundLabel(unit: Unit): string | null {
  const max = unitMaxHp(unit);
  const f = 0.5 + (0.5 * Math.max(0, unit.hp)) / max;
  if (f >= 0.99) return null;
  return `×${f.toFixed(2)} (${unit.hp}/${max} HP)`;
}

function moraleLabel(unit: Unit, side: "attacker" | "defender"): string | null {
  const m = side === "attacker" ? moraleAttackMultiplier(unit) : moraleDefenseMultiplier(unit);
  if (Math.abs(m - 1) < 0.02) return null;
  return `×${m.toFixed(2)}`;
}

function conditionalCombatLabels(
  state: GameState,
  unit: Unit,
  opponent: Unit,
  side: "attacker" | "defender",
): CombatModifier[] {
  const out: CombatModifier[] = [];
  const eff = playerEffects(state, unit.ownerId);
  if (eff.allUnitCombat) out.push({ side, label: "Empire-wide combat", effect: `+${eff.allUnitCombat}` });
  const atHome = tileOwnerId(state, unit.col, unit.row) === unit.ownerId;
  if (atHome && eff.homeCombat) out.push({ side, label: "Fighting at home", effect: `+${eff.homeCombat}` });
  if (!atHome && eff.foreignCombat) out.push({ side, label: "Fighting abroad", effect: `+${eff.foreignCombat}` });
  if (eff.combatVsOtherReligion) {
    const mine = playerReligionId(state, unit.ownerId);
    if (mine && playerReligionId(state, opponent.ownerId) !== mine) {
      out.push({ side, label: "Vs other faith", effect: `+${eff.combatVsOtherReligion}` });
    }
  }
  if (eff.combatVsUniqueUnit && uniqueUnitForUnit(state, opponent)) {
    out.push({ side, label: "Vs unique unit", effect: `+${eff.combatVsUniqueUnit}` });
  }
  return out;
}

function promotionLabel(p: PromotionId): string {
  return p.replaceAll("_", " ");
}

function gatherUnitAttackModifiers(
  state: GameState,
  unit: Unit,
  defender: Unit | null,
  targetTerrain: TerrainType,
  ranged: boolean,
): CombatModifier[] {
  const mods: CombatModifier[] = [];
  const def = UNIT_DEFS[unit.type];
  const defenderCls = defender ? UNIT_DEFS[defender.type].cls : null;

  const lvl = levelLabel(unit);
  if (lvl) mods.push({ side: "attacker", label: "Experience", effect: lvl });

  const civ = civCombatBonus(state, unit);
  if (civ) mods.push({ side: "attacker", label: "Civilization", effect: `+${civ}` });
  if (defender) mods.push(...conditionalCombatLabels(state, unit, defender, "attacker"));

  const eff = playerEffects(state, unit.ownerId);
  if (eff.gunpowderCombatBonus && def.gunpowder) {
    mods.push({ side: "attacker", label: "Gunpowder corps", effect: `+${eff.gunpowderCombatBonus}` });
  }
  if (!ranged && eff.navalMeleeCombatBonus && def.cls === "naval_melee") {
    mods.push({ side: "attacker", label: "Naval melee", effect: `+${eff.navalMeleeCombatBonus}` });
  }

  const legend = legendCombatBonus(state, unit);
  if (legend) mods.push({ side: "attacker", label: "Legend nearby", effect: `+${legend}` });

  const rel = religionUnitCombatBonus(state, unit);
  if (rel) mods.push({ side: "attacker", label: "Faith & auras", effect: `+${rel}` });

  if (unit.cursedUntilTurn !== undefined && state.turn <= unit.cursedUntilTurn) {
    mods.push({ side: "attacker", label: "Cursed", effect: `${unit.cursedPenalty ?? 3} less` });
  }

  if (!ranged && has(unit, "shock") && !isRough(targetTerrain)) {
    mods.push({ side: "attacker", label: "Shock (open ground)", effect: "+3" });
  }
  if (!ranged && has(unit, "drill") && isRough(targetTerrain)) {
    mods.push({ side: "attacker", label: "Drill (rough ground)", effect: "+3" });
  }
  if (ranged && has(unit, "accuracy") && !isRough(targetTerrain)) {
    mods.push({ side: "attacker", label: "Accuracy (open ground)", effect: "+3" });
  }
  if (ranged && has(unit, "barrage") && isRough(targetTerrain)) {
    mods.push({ side: "attacker", label: "Barrage (rough ground)", effect: "+3" });
  }
  if (has(unit, "woodland_warrior") && isForestTerrain(targetTerrain)) {
    mods.push({ side: "attacker", label: "Woodland warrior", effect: "+3" });
  }
  if (has(unit, "guerrilla") && isRough(targetTerrain)) {
    mods.push({ side: "attacker", label: "Guerrilla", effect: "+3" });
  }

  if (unit.embarked && eff.embarkedCombatBonus) {
    mods.push({ side: "attacker", label: "Embarked", effect: `+${eff.embarkedCombatBonus}` });
  }
  if (isForestTile(state, unit.col, unit.row) && eff.forestTileCombatBonus) {
    mods.push({ side: "attacker", label: "Forest tile bonus", effect: `+${eff.forestTileCombatBonus}` });
  }

  if (!unit.attackedThisTurn) {
    if (has(unit, "charge") || has(unit, "cavalry_charge") || has(unit, "ambush")) {
      mods.push({ side: "attacker", label: "First strike this turn", effect: "+4" });
    }
  }

  if (def.abilities?.includes("bonus_vs_cavalry") && defenderCls === "cavalry") {
    mods.push({ side: "attacker", label: "Anti-cavalry", effect: "+5" });
  }
  if (defenderCls && has(unit, "harrier") && defenderCls === "ranged") mods.push({ side: "attacker", label: "Harrier", effect: "+3" });
  if (defenderCls && has(unit, "lancer") && defenderCls === "melee") mods.push({ side: "attacker", label: "Lancer", effect: "+3" });
  if (defenderCls && has(unit, "hunter") && defenderCls === "cavalry") mods.push({ side: "attacker", label: "Hunter", effect: "+3" });

  const flanks = Math.min(4, countFriendliesWithin(state, unit, 2));
  if (has(unit, "flanking") && flanks > 0) {
    mods.push({ side: "attacker", label: "Flanking support", effect: `+${2 * flanks}` });
  }
  if (has(unit, "discipline") && flanks > 0) {
    mods.push({ side: "attacker", label: "Discipline", effect: `+${2 * flanks}` });
  }

  if (defender && !ranged && riverBetween(state, unit.col, unit.row, defender.col, defender.row)) {
    mods.push({ side: "attacker", label: "River crossing", effect: "×0.75" });
  }

  if (unit.ambushReadyUntilTurn !== undefined && state.turn <= unit.ambushReadyUntilTurn) {
    mods.push({ side: "attacker", label: "Ambush", effect: `+${Math.round((unit.ambushBonus ?? 0.2) * 100)}%` });
  }
  if (unit.maimedUntilTurn !== undefined && state.turn <= unit.maimedUntilTurn) {
    mods.push({ side: "attacker", label: "Maimed", effect: "×0.75" });
  }

  const wound = woundLabel(unit);
  if (wound) mods.push({ side: "attacker", label: "Wounds", effect: wound });
  const morale = moraleLabel(unit, "attacker");
  if (morale) mods.push({ side: "attacker", label: "Morale", effect: morale });

  for (const p of unit.promotions) {
    if (["charge", "cavalry_charge", "ambush", "flanking", "discipline", "shock", "drill", "accuracy", "barrage"].includes(p)) {
      continue;
    }
    if (["toughness", "colonist", "medic", "swift_healer", "survivalist"].includes(p)) continue;
    mods.push({ side: "attacker", label: promotionLabel(p), effect: "active" });
  }

  return mods;
}

function gatherUnitDefenseModifiers(
  state: GameState,
  unit: Unit,
  attacker: Unit,
  vsRanged: boolean,
): CombatModifier[] {
  const mods: CombatModifier[] = [];
  const def = UNIT_DEFS[unit.type];
  const attackerCls = UNIT_DEFS[attacker.type].cls;
  const tile = getTile(state.map, unit.col, unit.row);

  const lvl = levelLabel(unit);
  if (lvl) mods.push({ side: "defender", label: "Experience", effect: lvl });

  if (tile && !["ocean", "coast", "lake"].includes(tile.terrain)) {
    const td = terrainDefense(tile.terrain);
    if (td > 0) {
      mods.push({ side: "defender", label: `${TERRAIN_NAMES[tile.terrain]} terrain`, effect: `+${td}` });
    }
  }

  const eff = playerEffects(state, unit.ownerId);
  if (unit.embarked && eff.embarkedCombatBonus) {
    mods.push({ side: "defender", label: "Embarked", effect: `+${eff.embarkedCombatBonus}` });
  }
  if (isForestTile(state, unit.col, unit.row) && eff.forestTileCombatBonus) {
    mods.push({ side: "defender", label: "Forest tile bonus", effect: `+${eff.forestTileCombatBonus}` });
  }

  if (tile?.structure && tile.ownerCityId !== undefined) {
    const o = state.cities.get(tile.ownerCityId);
    if (o && o.ownerId === unit.ownerId) {
      const sd = structureDefense(tile.structure.tier);
      if (sd > 0) mods.push({ side: "defender", label: "Fortification", effect: `+${sd}` });
    }
  }

  if (vsRanged && has(unit, "cover")) mods.push({ side: "defender", label: "Cover vs ranged", effect: "+4" });
  if (def.abilities?.includes("bonus_vs_cavalry") && attackerCls === "cavalry") {
    mods.push({ side: "defender", label: "Anti-cavalry", effect: "+5" });
  }
  if (has(unit, "formation") && attackerCls === "cavalry") {
    mods.push({ side: "defender", label: "Formation", effect: "+4" });
  }
  if (has(unit, "camouflage") && tile && isRough(tile.terrain)) {
    mods.push({ side: "defender", label: "Camouflage", effect: "+3" });
  }
  if (has(unit, "stalwart")) mods.push({ side: "defender", label: "Stalwart", effect: "+3" });

  const civ = civCombatBonus(state, unit);
  if (civ) mods.push({ side: "defender", label: "Civilization", effect: `+${civ}` });
  mods.push(...conditionalCombatLabels(state, unit, attacker, "defender"));

  const legend = legendCombatBonus(state, unit);
  if (legend) mods.push({ side: "defender", label: "Legend nearby", effect: `+${legend}` });
  const rel = religionUnitCombatBonus(state, unit);
  if (rel) mods.push({ side: "defender", label: "Faith & auras", effect: `+${rel}` });

  if (unit.stance) {
    const stanceLabels: Record<string, string> = {
      brace: "Brace",
      shield_wall: "Shield wall",
      othismos: "Othismos",
      stone_bulwark: "Stone bulwark",
      zareba: "Zareba",
      iron_wall: "Iron wall",
      wagenburg: "Wagenburg",
      schiltron: "Schiltron",
      elephant_wall: "Elephant wall",
      turtle_shell: "Turtle shell",
      last_stand: "Last stand",
      testudo: vsRanged ? "Testudo vs ranged" : "Testudo (melee)",
      pavise: vsRanged ? "Pavise vs ranged" : "Pavise",
      emplace: "Emplaced",
    };
    const label = stanceLabels[unit.stance] ?? unit.stance.replaceAll("_", " ");
    mods.push({ side: "defender", label: `Stance: ${label}`, effect: "stronger defense" });
  }

  if (unit.sunderedUntilTurn !== undefined && state.turn <= unit.sunderedUntilTurn) {
    mods.push({ side: "defender", label: "Sundered", effect: "×0.75" });
  }

  const wound = woundLabel(unit);
  if (wound) mods.push({ side: "defender", label: "Wounds", effect: wound });
  const morale = moraleLabel(unit, "defender");
  if (morale) mods.push({ side: "defender", label: "Morale", effect: morale });

  return mods;
}

function countFriendliesWithin(state: GameState, unit: Unit, radius: number): number {
  const here = offsetToAxial({ col: unit.col, row: unit.row });
  let count = 0;
  for (const u of state.units.values()) {
    if (u.ownerId !== unit.ownerId || u.id === unit.id) continue;
    const there = offsetToAxial({ col: u.col, row: u.row });
    if (axialDistance(here, there) <= radius) count++;
  }
  return count;
}

function unitDisplay(state: GameState, unit: Unit): string {
  return unitDisplayName(state, unit);
}

/** Full pre-attack breakdown for the combat confirmation UI. */
export function combatPreviewDetail(
  state: GameState,
  attacker: Unit,
  col: number,
  row: number,
): CombatPreviewDetail | null {
  const preview = combatPreview(state, attacker, col, row);
  if (!preview) return null;

  const def = UNIT_DEFS[attacker.type];
  const ranged = isRanged(def);
  const targetTile = getTile(state.map, col, row);
  if (!targetTile) return null;

  const enemyCity = cityAt(state, col, row);
  const enemyUnit = unitAt(state, col, row);

  const attackerName = unitDisplay(state, attacker);
  const attackerHp = attacker.hp;
  const attackerMaxHp = unitMaxHp(attacker);

  let defenderName: string;
  let defenderHp: number;
  let defenderMaxHp: number;
  let defenderTokenId: string | null = null;
  let defenderCityTier: number | null = null;
  let attackerMods: CombatModifier[] = [];
  let defenderMods: CombatModifier[] = [];

  if (enemyCity && enemyCity.ownerId !== attacker.ownerId) {
    defenderName = enemyCity.name;
    defenderHp = enemyCity.hp;
    defenderMaxHp = cityMaxHp(enemyCity);
    defenderCityTier = cityTokenTier(enemyCity.population);
    attackerMods = gatherUnitAttackModifiers(state, attacker, enemyUnit ?? null, targetTile.terrain, ranged);
    const cityDef = cityDefenseStrength(state, enemyCity);
    defenderMods.push({ side: "defender", label: "City defenses", effect: `+${cityDef} effective` });
    if (ranged) defenderMods.push({ side: "defender", label: "Ranged attack", effect: "No retaliation" });
  } else if (enemyUnit && enemyUnit.ownerId !== attacker.ownerId) {
    defenderName = unitDisplay(state, enemyUnit);
    defenderHp = enemyUnit.hp;
    defenderMaxHp = unitMaxHp(enemyUnit);
    defenderTokenId = unitTokenId(state, enemyUnit);
    attackerMods = gatherUnitAttackModifiers(state, attacker, enemyUnit ?? null, targetTile.terrain, ranged);
    defenderMods = gatherUnitDefenseModifiers(state, enemyUnit, attacker, ranged);
    if (ranged) defenderMods.push({ side: "defender", label: "Ranged attack", effect: "No retaliation" });
    else if (has(attacker, "suppression")) {
      attackerMods.push({ side: "attacker", label: "Suppression", effect: "3 less retaliation" });
    }
  } else {
    return null;
  }

  return {
    preview,
    attackerName,
    defenderName,
    attackerTokenId: unitTokenId(state, attacker),
    defenderTokenId,
    defenderCityTier,
    attackerHp,
    attackerMaxHp,
    defenderHp,
    defenderMaxHp,
    attackerHpAfter: Math.max(0, attackerHp - preview.toAttacker),
    defenderHpAfter: Math.max(0, defenderHp - preview.toDefender),
    attackerDamage: preview.toDefender,
    defenderDamage: preview.toAttacker,
    ranged,
    attackerMods,
    defenderMods,
  };
}
