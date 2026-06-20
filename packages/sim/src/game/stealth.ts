// Hide & ambush (concealment) layer — see docs/UNIT-ABILITIES.md and the brief.
//
// Foot infantry and scouts can Hide in forest cover; a curated set of unique
// units (skirmishers and light cavalry) can hide in more terrain and ambush
// harder. A hidden unit is invisible to enemies (fog enforced in serialize.ts)
// until it acts or is discovered. An enemy that steps onto a hidden unit is
// ambushed (combat.ts `resolveAmbush`); a unit that breaks cover within 2 tiles
// of an enemy gains an ambush attack bonus (combat.ts reads `ambushReadyUntilTurn`).

import { axialDistance, getTile, offsetToAxial, type TerrainType } from "@roc/shared";
import type { GameState, Unit } from "./state";
import { areEnemies, playerById } from "./state";
import { uniqueUnitForUnit, unitHasActiveAbility } from "./civs";

/** Default cover: ordinary infantry/scouts only conceal in dense forest. */
const DEFAULT_HIDE_TERRAINS: readonly TerrainType[] = ["forest"];
const DEFAULT_AMBUSH_BONUS = 0.2;

export interface HideProfile {
  terrains: readonly TerrainType[];
  /** Extra attack multiplier when this unit springs an ambush (e.g. 0.3 = +30%). */
  ambushBonus: number;
  /** A few guerrilla/scout uniques can creep while concealed (see stealthMovement). */
  stealthMove?: boolean;
}

/**
 * Unique units with enhanced concealment — broader terrain, a sharper ambush,
 * and (for the dedicated guerrillas/skirmishers) the ability to reposition while
 * staying hidden. Keyed by unique-unit id (see UNIQUE_UNITS in @roc/data). These
 * all also carry "hide" in UNIQUE_ABILITY_OVERRIDES.
 */
const SPECIAL_HIDE: Record<string, HideProfile> = {
  // Light cavalry that can melt into the open steppe/plains.
  numidia_numidian_cavalry: { terrains: ["forest", "plains", "grassland", "desert"], ambushBonus: 0.3, stealthMove: true },
  scythians_scythian_horse_archer: { terrains: ["forest", "plains", "grassland"], ambushBonus: 0.3 },
  sumer_war_cart: { terrains: ["forest", "plains"], ambushBonus: 0.2 },
  // Jungle/hill guerrillas with a deadlier ambush; masters of moving unseen.
  maya_holkan: { terrains: ["forest", "jungle"], ambushBonus: 0.3, stealthMove: true },
  lusitani_falcata_warrior: { terrains: ["forest", "hills", "plains"], ambushBonus: 0.3, stealthMove: true },
};

/** Concealment profile for a unit, or null if it cannot hide at all. */
export function hideProfile(state: GameState, unit: Unit): HideProfile | null {
  if (!unitHasActiveAbility(state, unit, "hide")) return null;
  const uu = uniqueUnitForUnit(state, unit);
  const special = uu ? SPECIAL_HIDE[uu.id] : undefined;
  if (special) return special;
  return { terrains: DEFAULT_HIDE_TERRAINS, ambushBonus: DEFAULT_AMBUSH_BONUS };
}

/** True if this unit may move while staying concealed (at a reduced pace). */
export function canStealthMove(state: GameState, unit: Unit): boolean {
  return hideProfile(state, unit)?.stealthMove === true;
}

/** Movement budget a concealed stealth-mover gets: one third its normal pace (min 1). */
export function stealthMovement(fullMovement: number): number {
  return Math.max(1, Math.floor(fullMovement / 3));
}

/** True if the unit could hide on its current tile right now. */
export function canHideHere(state: GameState, unit: Unit): boolean {
  if (unit.hidden) return false;
  if (unit.embarked) return false;
  const prof = hideProfile(state, unit);
  if (!prof) return false;
  const tile = getTile(state.map, unit.col, unit.row);
  return !!tile && prof.terrains.includes(tile.terrain);
}

function dist(a: { col: number; row: number }, b: { col: number; row: number }): number {
  return axialDistance(offsetToAxial(a), offsetToAxial(b));
}

/** True if any enemy unit is within `radius` tiles of `unit`. */
function enemyWithin(state: GameState, unit: Unit, radius: number): boolean {
  const owner = playerById(state, unit.ownerId);
  if (!owner) return false;
  for (const u of state.units.values()) {
    if (u.ownerId === unit.ownerId) continue;
    const o = playerById(state, u.ownerId);
    if (o && areEnemies(owner, o) && dist(unit, u) <= radius) return true;
  }
  return false;
}

/**
 * Reveal a hidden unit. If it breaks cover within 2 tiles of an enemy it earns
 * the ambush window — its attacks until the start of its next turn gain the
 * ambush bonus (read in combat.ts). No-op for a unit that isn't hidden.
 */
export function breakCover(state: GameState, unit: Unit): void {
  if (!unit.hidden) return;
  unit.hidden = false;
  const prof = hideProfile(state, unit);
  if (prof && enemyWithin(state, unit, 2)) {
    unit.ambushReadyUntilTurn = state.turn;
    unit.ambushBonus = prof.ambushBonus;
  }
}

/** Reveal every concealed non-friendly unit within `range` tiles of `scout`. */
export function revealHiddenInSight(state: GameState, scout: Unit, range: number): void {
  for (const u of state.units.values()) {
    if (u.ownerId === scout.ownerId || !u.hidden) continue;
    if (dist(scout, u) <= range) u.hidden = false;
  }
}
