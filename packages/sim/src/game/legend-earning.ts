// Legend recruitment progress — heroes are earned by military deeds, not bought
// with faith. Each legend belongs to a combat track (melee, cavalry, ranged,
// siege, naval) derived from its base unit type. Points accrue to that track from
// training matching units and from battle victories (more vs major civs, less vs
// barbarians and camps).

import type { LegendDef } from "@roc/data";
import type { GameState, Player, Unit } from "./state";
import { playerById } from "./state";
import { isMilitary, UNIT_DEFS, type UnitClass, type UnitTypeId } from "./content";

/** Combat doctrine tracks that gate which heroes a civ can summon. */
export const LEGEND_TRACKS = ["melee", "cavalry", "ranged", "siege", "naval"] as const;
export type LegendTrack = (typeof LEGEND_TRACKS)[number];

export const LEGEND_TRACK_LABELS: Record<LegendTrack, string> = {
  melee: "Melee",
  cavalry: "Cavalry",
  ranged: "Ranged",
  siege: "Siege",
  naval: "Naval",
};

const TRAIN_POINTS = 8;
const KILL_CIV_POINTS = 12;
const KILL_BARBARIAN_POINTS = 5;
const CAMP_CLEAR_POINTS = 6;

const THRESHOLD_BASE = 50;
const THRESHOLD_STEP = 35;

/** Map a unit class to the legend track it feeds (null for civilians). */
export function unitClassToLegendTrack(cls: UnitClass): LegendTrack | null {
  switch (cls) {
    case "melee":
    case "recon":
      return "melee";
    case "cavalry":
      return "cavalry";
    case "ranged":
      return "ranged";
    case "siege":
      return "siege";
    case "naval_melee":
    case "naval_ranged":
      return "naval";
    default:
      return null;
  }
}

export function legendTrackForUnitType(type: UnitTypeId): LegendTrack | null {
  return unitClassToLegendTrack(UNIT_DEFS[type].cls);
}

/** Which track a hero definition belongs to (from its base unit). */
export function legendTrackFor(def: LegendDef): LegendTrack {
  return legendTrackForUnitType(def.baseType as UnitTypeId) ?? "melee";
}

/** Point cost to recruit the player's next hero of a track (rises per track). */
export function legendRecruitThreshold(earnedOfTrack: number): number {
  return THRESHOLD_BASE + THRESHOLD_STEP * earnedOfTrack;
}

export function legendTrackPointsOf(player: Player, track: LegendTrack): number {
  return player.legendTrackPoints?.[track] ?? 0;
}

export function legendTrackEarnedOf(player: Player, track: LegendTrack): number {
  return player.legendTrackEarned?.[track] ?? 0;
}

/** Points needed to recruit this hero for `player` right now. */
export function legendRecruitCostFor(def: LegendDef, player: Player): number {
  return legendRecruitThreshold(legendTrackEarnedOf(player, legendTrackFor(def)));
}

export function canAffordLegendRecruit(player: Player, def: LegendDef): boolean {
  const track = legendTrackFor(def);
  return legendTrackPointsOf(player, track) >= legendRecruitCostFor(def, player);
}

function accrueLegendPoints(state: GameState, playerId: number, track: LegendTrack, amount: number): void {
  if (!state.legendsEnabled || amount <= 0) return;
  const player = playerById(state, playerId);
  if (!player || player.isBarbarian) return;
  const pool = (player.legendTrackPoints ??= {});
  pool[track] = (pool[track] ?? 0) + amount;
}

/** Spend track points when a hero is recruited. */
export function spendLegendTrackPoints(player: Player, def: LegendDef): void {
  const track = legendTrackFor(def);
  const cost = legendRecruitCostFor(def, player);
  const pool = (player.legendTrackPoints ??= {});
  pool[track] = Math.max(0, (pool[track] ?? 0) - cost);
  const earned = (player.legendTrackEarned ??= {});
  earned[track] = (earned[track] ?? 0) + 1;
}

/** A military unit finished training — feed its track. */
export function onLegendUnitTrained(state: GameState, playerId: number, unitType: UnitTypeId): void {
  if (!isMilitary(unitType)) return;
  const track = legendTrackForUnitType(unitType);
  if (track) accrueLegendPoints(state, playerId, track, TRAIN_POINTS);
}

/** An enemy unit was defeated in battle — feed the killer's track. */
export function onLegendBattleWon(state: GameState, killer: Unit, defeatedOwnerId: number): void {
  const track = legendTrackForUnitType(killer.type);
  if (!track) return;
  const defeated = playerById(state, defeatedOwnerId);
  const points = defeated?.isBarbarian ? KILL_BARBARIAN_POINTS : KILL_CIV_POINTS;
  accrueLegendPoints(state, killer.ownerId, track, points);
}

/** A barbarian camp was cleared — feed the clearing unit's track. */
export function onLegendCampCleared(state: GameState, unit: Unit): void {
  const track = legendTrackForUnitType(unit.type);
  if (track) accrueLegendPoints(state, unit.ownerId, track, CAMP_CLEAR_POINTS);
}
