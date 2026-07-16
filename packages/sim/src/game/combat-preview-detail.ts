// Pre-attack combat estimate for the client. Every number and every label here is
// produced by the same combat math `resolveAttack` runs (see `combatPreview`), so
// the itemized breakdown can never contradict the totals shown beside it.

import type { GameState, Unit } from "./state";
import { cityAt, unitAt } from "./state";
import { UNIT_DEFS, isRanged, type ActiveAbilityId } from "./content";
import { uniqueUnitForUnit, unitDisplayName } from "./civs";
import {
  combatPreview,
  unitMaxHp,
  cityMaxHp,
  type CombatPreview,
  type CombatTraceEntry,
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
  /** City building sprite tier (1-10) when the target is a city. */
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

/** City sprite tier, 1-10. Names a `buildings/city_<tier>.png` file, not an array index. */
function cityTokenTier(population: number): number {
  return Math.max(1, Math.min(10, population));
}

function sided(side: "attacker" | "defender", entries: CombatTraceEntry[]): CombatModifier[] {
  return entries.map((e) => ({ side, label: e.label, effect: e.effect }));
}

/** Full pre-attack breakdown for the combat confirmation UI. */
export function combatPreviewDetail(
  state: GameState,
  attacker: Unit,
  col: number,
  row: number,
  ability?: ActiveAbilityId,
): CombatPreviewDetail | null {
  const traces = { attacker: [] as CombatTraceEntry[], defender: [] as CombatTraceEntry[] };
  const preview = combatPreview(state, attacker, col, row, ability, traces);
  if (!preview) return null;

  const ranged = isRanged(UNIT_DEFS[attacker.type]);
  const enemyCity = cityAt(state, col, row);
  const enemyUnit = unitAt(state, col, row);

  let defenderName: string;
  let defenderHp: number;
  let defenderMaxHp: number;
  let defenderTokenId: string | null = null;
  let defenderCityTier: number | null = null;

  if (enemyCity && enemyCity.ownerId !== attacker.ownerId) {
    defenderName = enemyCity.name;
    defenderHp = enemyCity.hp;
    defenderMaxHp = cityMaxHp(enemyCity);
    defenderCityTier = cityTokenTier(enemyCity.population);
  } else if (enemyUnit && enemyUnit.ownerId !== attacker.ownerId) {
    defenderName = unitDisplayName(state, enemyUnit);
    defenderHp = enemyUnit.hp;
    defenderMaxHp = unitMaxHp(enemyUnit);
    defenderTokenId = unitTokenId(state, enemyUnit);
  } else {
    return null;
  }

  const attackerMods = sided("attacker", traces.attacker);
  const defenderMods = sided("defender", traces.defender);
  if (preview.capture) {
    attackerMods.push({ side: "attacker", label: "Undefended city", effect: "Captured without a fight" });
  } else if (ranged) {
    defenderMods.push({ side: "defender", label: "Ranged attack", effect: "No retaliation" });
  }

  return {
    preview,
    attackerName: unitDisplayName(state, attacker),
    defenderName,
    attackerTokenId: unitTokenId(state, attacker),
    defenderTokenId,
    defenderCityTier,
    attackerHp: attacker.hp,
    attackerMaxHp: unitMaxHp(attacker),
    defenderHp,
    defenderMaxHp,
    attackerHpAfter: Math.max(0, attacker.hp - preview.toAttacker),
    defenderHpAfter: Math.max(0, defenderHp - preview.toDefender),
    attackerDamage: preview.toDefender,
    defenderDamage: preview.toAttacker,
    ranged,
    attackerMods,
    defenderMods,
  };
}
