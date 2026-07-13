// Legends (Heroes) — the core "Legends" feature. Powerful, limited unique units
// earned through military deeds (training and battle), not faith. Each reskins a
// base unit, carries its own combat bonus, heartens adjacent friendly units
// (aura), and has a lifespan after which it "passes into legend" (retires).
// Globally unique; rechargeable legends return to the pool when they retire.
// Toggleable per game (state.legendsEnabled). Every hero also carries a real
// signature power: active kits in content.ts (LEGEND_ABILITY_OVERRIDES), passives
// in legend-passives.ts / legend-effects.ts. See docs/GREAT-PEOPLE.md §2.

import { getTile } from "@roc/shared";
import { LEGENDS, getLegend, type LegendDef } from "@roc/data";
import type { City, GameState, Player, Unit } from "./state";
import { citiesOf, log, makeUnit, playerById, unitAt, unitsOf } from "./state";
import { UNIT_DEFS, isMilitary, type UnitTypeId } from "./content";
import { offsetNeighbors } from "./movement";
import { isWaterTerrain } from "./terrain";
import { startingUnitMorale } from "./morale";
import { eraUnlocked } from "./era";
import { legendSituationalCombatBonus } from "./legend-effects";
import { LEGEND_DEFAULT_LIFESPAN } from "./legend-lifespan";
import { grantLegendDeathFaith } from "./works";
import {
  LEGEND_TRACK_LABELS,
  LEGEND_TRACKS,
  canAffordLegendRecruit,
  legendRecruitCostFor,
  legendRecruitThreshold,
  legendTrackEarnedOf,
  legendTrackFor,
  legendTrackPointsOf,
  spendLegendTrackPoints,
  type LegendTrack,
} from "./legend-earning";

export type { LegendDef, LegendTrack };
export {
  LEGEND_TRACKS,
  LEGEND_TRACK_LABELS,
  legendRecruitThreshold,
  legendRecruitCostFor,
  legendTrackFor,
  legendTrackPointsOf,
  legendTrackEarnedOf,
  canAffordLegendRecruit,
} from "./legend-earning";

/** True if a unit is a Legend. */
export function isLegend(unit: Unit): boolean {
  return !!unit.legendId;
}

/** Legends not yet recruited by anyone this game (era-ordered). */
export function availableLegends(state: GameState): LegendDef[] {
  const taken = new Set(state.recruitedLegends ?? []);
  return LEGENDS.filter((l) => !taken.has(l.id));
}

/** Globally available legends the player has reached the right era to recruit. */
export function availableLegendsForPlayer(state: GameState, playerId: number): LegendDef[] {
  const player = playerById(state, playerId);
  if (!player) return [];
  return availableLegends(state).filter((l) => eraUnlocked(player, l.era));
}

export interface LegendResult {
  ok: boolean;
  error?: string;
}

/** Whether `playerId` may recruit `legendId` right now. */
export function canRecruitLegend(state: GameState, playerId: number, legendId: string): LegendResult {
  if (!state.legendsEnabled) return { ok: false, error: "Legends are disabled this game" };
  const player = playerById(state, playerId);
  if (!player || player.isBarbarian) return { ok: false, error: "no such player" };
  const def = getLegend(legendId);
  if (!def) return { ok: false, error: "unknown legend" };
  if ((state.recruitedLegends ?? []).includes(legendId)) return { ok: false, error: "already recruited" };
  if (!eraUnlocked(player, def.era)) return { ok: false, error: `${def.era} era not reached yet` };
  if (citiesOf(state, playerId).length === 0) return { ok: false, error: "you have no city" };
  if (!canAffordLegendRecruit(player, def)) {
    const track = legendTrackFor(def);
    const need = legendRecruitCostFor(def, player);
    const have = legendTrackPointsOf(player, track);
    return {
      ok: false,
      error: `need ${need} ${LEGEND_TRACK_LABELS[track]} glory (have ${have}) — train ${track} units and win battles`,
    };
  }
  return { ok: true };
}

/** Find a spawn tile for a legend at/near `city` (water for naval legends). */
function spawnTileFor(state: GameState, city: City, wantsWater: boolean): { col: number; row: number } | null {
  if (!wantsWater && !unitAt(state, city.col, city.row)) return { col: city.col, row: city.row };
  for (const n of offsetNeighbors(state.map, city.col, city.row)) {
    const tile = getTile(state.map, n.col, n.row);
    if (!tile || unitAt(state, n.col, n.row)) continue;
    if (wantsWater && isWaterTerrain(tile.terrain)) return { col: n.col, row: n.row };
    if (!wantsWater && tile.terrain !== "mountains" && !isWaterTerrain(tile.terrain)) return { col: n.col, row: n.row };
  }
  return null;
}

/**
 * Recruit a legend for `playerId`, spending track glory and spawning the hero
 * unit at (or beside) one of the player's cities. Globally unique.
 */
export function recruitLegend(
  state: GameState,
  playerId: number,
  legendId: string,
  cityId?: number,
): LegendResult {
  const check = canRecruitLegend(state, playerId, legendId);
  if (!check.ok) return check;
  const player = playerById(state, playerId)!;
  const def = getLegend(legendId)!;
  const cities = citiesOf(state, playerId);
  const city = (cityId != null ? cities.find((c) => c.id === cityId) : undefined) ?? cities.find((c) => c.isCapital) ?? cities[0]!;

  const wantsWater = def.type === "naval";
  const spawn = spawnTileFor(state, city, wantsWater);
  if (!spawn) {
    return { ok: false, error: wantsWater ? "no open coastal water beside the city" : "no open tile beside the city" };
  }

  spendLegendTrackPoints(player, def);
  player.legendsRecruited = (player.legendsRecruited ?? 0) + 1;
  (state.recruitedLegends ??= []).push(legendId);

  const id = state.nextEntityId++;
  const morale = Math.min(200, startingUnitMorale(state, playerId) + 50); // heroes are steadfast
  const unit = makeUnit(id, playerId, def.baseType as UnitTypeId, spawn.col, spawn.row, 0, morale);
  unit.legendId = def.id;
  unit.legendExpiresOnTurn = state.turn + (def.lifespan || LEGEND_DEFAULT_LIFESPAN);
  state.units.set(id, unit);

  log(state, `${player.name} recruited the Legend ${def.name}!`, {
    actorId: playerId,
    targetIds: [playerId],
    tile: { col: spawn.col, row: spawn.row },
  });
  return { ok: true };
}

/**
 * Retire any of `playerId`'s legends whose lifespan has elapsed. Rechargeable
 * legends are returned to the global pool so they can be recruited again. Called
 * at the start of the player's turn.
 */
export function tickLegends(state: GameState, playerId: number): void {
  for (const unit of unitsOf(state, playerId)) {
    if (!unit.legendId || unit.legendExpiresOnTurn === undefined) continue;
    if (state.turn <= unit.legendExpiresOnTurn) continue;
    const def = getLegend(unit.legendId);
    state.units.delete(unit.id);
    if (def?.rechargeable) {
      state.recruitedLegends = (state.recruitedLegends ?? []).filter((l) => l !== unit.legendId);
    }
    log(state, `${def?.name ?? "A hero"} has passed into legend.`, {
      actorId: playerId,
      targetIds: [playerId],
      tile: { col: unit.col, row: unit.row },
    });
    grantLegendDeathFaith(state, playerId, { col: unit.col, row: unit.row });
  }
}

/**
 * Combat-strength bonus from Legends for `unit`: its own hero bonus (if it is a
 * legend) plus the strongest aura from an adjacent friendly legend (auras don't
 * stack), plus the situational hero passives (Belisarius outnumbered, El Cid on
 * the frontier, an enemy Cleopatra's Allure — see legend-effects.ts). Added into
 * attack/defense strength alongside the civ combat bonus.
 */
export function legendCombatBonus(state: GameState, unit: Unit): number {
  let bonus = 0;
  if (unit.legendId) {
    bonus += Math.max(0, getLegend(unit.legendId)?.combatBonus ?? 0);
  }
  if (isMilitary(unit.type)) {
    let aura = 0;
    for (const n of offsetNeighbors(state.map, unit.col, unit.row)) {
      const other = unitAt(state, n.col, n.row);
      if (other && other.ownerId === unit.ownerId && other.legendId && other.id !== unit.id) {
        aura = Math.max(aura, getLegend(other.legendId)?.auraBonus ?? 0);
      }
    }
    bonus += aura;
  }
  bonus += legendSituationalCombatBonus(state, unit);
  return bonus;
}

/** The base unit display name a legend is built on (for the UI). */
export function legendBaseName(def: LegendDef): string {
  return UNIT_DEFS[def.baseType as UnitTypeId]?.name ?? def.baseType;
}

export { LEGENDS };
