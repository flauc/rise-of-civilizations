// Legend (hero) passive PRESENCE effects — the pure, read-only helpers that
// combat/economy/movement consult while a hero lives (docs/UNIT-ABILITIES.md §9,
// docs/GREAT-PEOPLE.md §2). Kept as a leaf module (state + data only) so civs.ts
// and combat.ts can import it without cycles. The per-turn ticking passives
// (income, drilling, healing auras) live in legend-passives.ts.

import { axialDistance, getTile, offsetToAxial, type Axial } from "@roc/shared";
import type { CivEffects } from "@roc/data";
import type { City, GameState, Unit } from "./state";
import { areEnemies, playerById, unitAt, unitsOf } from "./state";

function ax(u: { col: number; row: number }): Axial {
  return offsetToAxial(u);
}

/** All living legend units a player fields. */
export function legendUnitsOf(state: GameState, playerId: number): Unit[] {
  return unitsOf(state, playerId).filter((u) => !!u.legendId);
}

/** True if `playerId` currently fields the given legend on the map. */
export function playerHasLegend(state: GameState, playerId: number, legendId: string): boolean {
  return unitsOf(state, playerId).some((u) => u.legendId === legendId);
}

/**
 * Empire-wide effects granted by a player's living legends, merged into
 * playerEffects (civs.ts) alongside civ/government/policy bonuses.
 * - Pachacuti — Qhapaq Ñan: the royal roads run everywhere; land units ignore
 *   rough-terrain movement penalties.
 * - Zheng He — Treasure Fleet: every ship sails +1 movement.
 */
export function legendEmpireEffects(state: GameState, playerId: number): Partial<CivEffects> {
  const eff: Partial<CivEffects> = {};
  for (const u of legendUnitsOf(state, playerId)) {
    if (u.legendId === "pachacuti") eff.ignoreRoughTerrain = true;
    if (u.legendId === "zheng_he_legend") eff.navalMovementBonus = (eff.navalMovementBonus ?? 0) + 1;
  }
  return eff;
}

/**
 * City effects granted by a legend standing IN the city (merged into
 * cityEffects, civs.ts):
 * - Ramesses II — Monument Builder: +25% production and +25% culture.
 * - Pachacuti — terraces: +25% food.
 */
export function legendGarrisonEffects(state: GameState, city: City): Partial<CivEffects> {
  const garrison = unitAt(state, city.col, city.row);
  if (!garrison || garrison.ownerId !== city.ownerId || !garrison.legendId) return {};
  if (garrison.legendId === "ramesses_ii") return { yieldPercent: { production: 25, culture: 25 } };
  if (garrison.legendId === "pachacuti") return { yieldPercent: { food: 25, production: 25 } };
  return {};
}

/**
 * Qin Shi Huang — the Great Wall: while the First Emperor lives, every one of
 * his empire's cities defends at +10 strength (added in cityDefenseStrength).
 */
export function legendCityDefenseBonus(state: GameState, city: City): number {
  return playerHasLegend(state, city.ownerId, "qin_shi_huang") ? 10 : 0;
}

/**
 * Situational combat-strength adjustments from legend passives, added into
 * legendCombatBonus (legends.ts) for both attack and defense:
 * - Belisarius — Against All Odds: +2 per adjacent enemy beyond the first (max +6).
 * - El Cid — Campeador: +4 on any tile outside his own borders.
 * - Cleopatra — Allure: enemy units adjacent to the queen fight at −3.
 */
export function legendSituationalCombatBonus(state: GameState, unit: Unit): number {
  let bonus = 0;
  const owner = playerById(state, unit.ownerId);

  if (unit.legendId === "belisarius" && owner) {
    let adjacentEnemies = 0;
    for (const other of state.units.values()) {
      const o = playerById(state, other.ownerId);
      if (o && areEnemies(owner, o) && axialDistance(ax(unit), ax(other)) === 1) adjacentEnemies++;
    }
    bonus += Math.min(6, 2 * Math.max(0, adjacentEnemies - 1));
  }

  if (unit.legendId === "el_cid") {
    const tile = getTile(state.map, unit.col, unit.row);
    const owningCity = tile?.ownerCityId !== undefined ? state.cities.get(tile.ownerCityId) : undefined;
    if (!owningCity || owningCity.ownerId !== unit.ownerId) bonus += 4;
  }

  // Allure: any unit fighting beside an enemy Cleopatra hesitates.
  if (owner) {
    for (const other of state.units.values()) {
      if (other.legendId !== "cleopatra") continue;
      const o = playerById(state, other.ownerId);
      if (o && areEnemies(owner, o) && axialDistance(ax(unit), ax(other)) === 1) {
        bonus -= 3;
        break;
      }
    }
  }

  return bonus;
}
