// Player-triggered active abilities (see docs/UNIT-ABILITIES.md).
//
// These sit on top of the passive combat model in combat.ts: using one is a
// deliberate action that spends the unit's turn. Targeted abilities reuse
// `resolveAttack` for the actual strike (so war checks, XP, terrain, etc. all
// apply), then layer on the movement/area effects that make each ability unique.

import { axialDistance, axialToOffset, getTile, offsetToAxial, type Axial } from "@roc/shared";
import type { GameState, Player, Unit } from "./state";
import { areEnemies, cityAt, log, playerById, unitAt, unitsOf } from "./state";
import { isPassableLand, isRough } from "./terrain";
import { enemyStructureBlocks, unitSight } from "./movement";
import { resolveAttack, applyDirectDamage, secondaryRangedDamage, unitMaxHp } from "./combat";
import { updateExplored } from "./visibility";
import { effectiveAbilities } from "./civs";
import { canHideHere, breakCover, revealHiddenInSight } from "./stealth";
import {
  ACTIVE_ABILITY_DEFS,
  UNIT_DEFS,
  isRanged,
  type ActiveAbilityId,
  type StanceId,
} from "./content";

export interface AbilityResult {
  ok: boolean;
  error?: string;
}
const ok: AbilityResult = { ok: true };
const fail = (error: string): AbilityResult => ({ ok: false, error });

const STANCE_ABILITIES = new Set<ActiveAbilityId>(["brace", "shield_wall", "testudo", "emplace", "othismos", "last_stand", "pavise"]);

function dist(a: { col: number; row: number }, b: { col: number; row: number }): number {
  return axialDistance(offsetToAxial(a), offsetToAxial(b));
}

/** True if a unit may step onto (col,row): in-bounds passable land, unoccupied,
 *  not an enemy city/structure. */
function tileFree(state: GameState, unit: Unit, col: number, row: number): boolean {
  const tile = getTile(state.map, col, row);
  if (!tile || !isPassableLand(tile.terrain)) return false;
  if (unitAt(state, col, row)) return false;
  const c = cityAt(state, col, row);
  if (c && c.ownerId !== unit.ownerId) return false;
  if (enemyStructureBlocks(state, col, row, unit.ownerId)) return false;
  return true;
}

/** The tile on the far side of `mid` from `from` (one step further along the line). */
function tileBeyond(from: { col: number; row: number }, mid: { col: number; row: number }): { col: number; row: number } {
  const a = offsetToAxial(from);
  const m = offsetToAxial(mid);
  const beyond: Axial = { q: 2 * m.q - a.q, r: 2 * m.r - a.r };
  return axialToOffset(beyond);
}

/** Best tile to retreat to: the unit's neighbor that is furthest from `threat`. */
function retreatTile(state: GameState, unit: Unit, threat: { col: number; row: number }): { col: number; row: number } | null {
  // Step directly away first; fall back to whichever free neighbor gains distance.
  const straight = tileBeyond(threat, unit);
  if (tileFree(state, unit, straight.col, straight.row)) return straight;
  let best: { col: number; row: number } | null = null;
  let bestDist = dist(unit, threat);
  const ua = offsetToAxial(unit);
  for (const n of [
    { q: ua.q + 1, r: ua.r }, { q: ua.q - 1, r: ua.r },
    { q: ua.q, r: ua.r + 1 }, { q: ua.q, r: ua.r - 1 },
    { q: ua.q + 1, r: ua.r - 1 }, { q: ua.q - 1, r: ua.r + 1 },
  ]) {
    const o = axialToOffset(n);
    if (!tileFree(state, unit, o.col, o.row)) continue;
    const dd = dist(o, threat);
    if (dd > bestDist) { bestDist = dd; best = o; }
  }
  return best;
}

/** Deterministic 0..99 roll from turn + unit (for the elephant panic check). */
function panicRoll(state: GameState, unit: Unit): number {
  let h = (state.turn * 2654435761 + unit.id * 40503) >>> 0;
  h ^= h >>> 13; h = (h * 1274126177) >>> 0;
  return h % 100;
}

function hasAbility(state: GameState, unit: Unit, ability: ActiveAbilityId): boolean {
  return effectiveAbilities(state, unit).includes(ability);
}

/** Whether `unit` could use `ability` right now (ignoring a specific target). */
export function canUseAbility(state: GameState, unit: Unit, ability: ActiveAbilityId): AbilityResult {
  if (!hasAbility(state, unit, ability)) return fail("unit lacks that ability");
  if (unit.attackedThisTurn) return fail("already acted this turn");
  if (unit.movementLeft <= 0) return fail("no movement left");
  const ready = unit.abilityCooldowns?.[ability] ?? 0;
  if (ready > state.turn) return fail("ability on cooldown");
  if (ability === "hide" && !canHideHere(state, unit)) return fail("no cover to hide in here");
  return ok;
}

/** Tiles a targeted ability could be used against right now (for the client). */
export function abilityTargets(state: GameState, unit: Unit, ability: ActiveAbilityId): Set<string> {
  const out = new Set<string>();
  if (!canUseAbility(state, unit, ability).ok) return out;
  const def = ACTIVE_ABILITY_DEFS[ability];
  if (def.kind !== "targeted") return out;
  const owner = playerById(state, unit.ownerId);
  if (!owner) return out;
  const reach = abilityRange(unit, ability);
  for (const u of state.units.values()) {
    if (u.ownerId === unit.ownerId) continue;
    const o = playerById(state, u.ownerId);
    if (o && areEnemies(owner, o) && dist(unit, u) <= reach) out.add(`${u.col},${u.row}`);
  }
  return out;
}

/** Range (in tiles) a targeted ability can reach from the unit. */
function abilityRange(unit: Unit, ability: ActiveAbilityId): number {
  const def = UNIT_DEFS[unit.type];
  if (ability === "fire_and_retreat" || ability === "skirmish" || ability === "parthian_shot") return def.range ?? 1;
  if (ability === "feigned_retreat") return Math.max(1, def.range ?? 1); // kite at range or charge adjacent
  if (ability === "repeating_fire") return def.range ?? 1;
  if (ability === "arrow_storm") return (def.range ?? 1) + 1;
  if (ability === "pierce") return Math.max(1, (def.range ?? 1) - 1);
  if (ability === "greek_fire" || ability === "coastal_bombardment") return def.range ?? 1;
  return 1; // melee/charge/trample/sunder/harry/ram/boarding_party strike adjacent
}

const cooldownAfter = (state: GameState, ability: ActiveAbilityId): number =>
  state.turn + 1 + ACTIVE_ABILITY_DEFS[ability].cooldown;

/** Apply an active ability. `col,row` are required for targeted abilities. */
export function useAbility(
  state: GameState,
  unit: Unit,
  ability: ActiveAbilityId,
  col?: number,
  row?: number,
): AbilityResult {
  const pre = canUseAbility(state, unit, ability);
  if (!pre.ok) return pre;
  const def = ACTIVE_ABILITY_DEFS[ability];

  // ---- hide (persists across turns; not a one-turn stance) ----
  if (ability === "hide") {
    unit.hidden = true;
    unit.movementLeft = 0; // forfeits remaining movement
    unit.attackedThisTurn = true; // ends the turn
    return ok;
  }

  // ---- stances ----
  if (def.kind === "stance") {
    unit.stance = ability as StanceId;
    unit.movementLeft = 0;
    if (!unit.abilityCooldowns) unit.abilityCooldowns = {};
    unit.abilityCooldowns[ability] = cooldownAfter(state, ability);
    return ok;
  }

  // ---- self (Reconnoiter) ----
  if (def.kind === "self") {
    unit.scouting = true;
    unit.movementLeft = 0;
    unit.attackedThisTurn = true;
    if (!unit.abilityCooldowns) unit.abilityCooldowns = {};
    unit.abilityCooldowns[ability] = cooldownAfter(state, ability);
    revealHiddenInSight(state, unit, unitSight(unit) + 2); // the pulse flushes out hidden units
    updateExplored(state, unit.ownerId); // reveal the wider radius now
    return ok;
  }

  // ---- targeted ----
  if (col === undefined || row === undefined) return fail("ability needs a target");
  const target = unitAt(state, col, row);
  if (!target || target.ownerId === unit.ownerId) return fail("no enemy there");
  const owner = playerById(state, unit.ownerId);
  const tOwner = playerById(state, target.ownerId);
  if (owner && tOwner && !areEnemies(owner, tOwner)) return fail("not at war");
  if (dist(unit, target) > abilityRange(unit, ability)) return fail("out of range");

  const setCd = (): void => {
    if (!unit.abilityCooldowns) unit.abilityCooldowns = {};
    unit.abilityCooldowns[ability] = cooldownAfter(state, ability);
  };

  switch (ability) {
    case "charge":
    case "hussar_charge": {
      const behind = tileBeyond(unit, target);
      const res = resolveAttack(state, unit, col, row, { ability });
      if (!res.ok) return res;
      if (state.units.has(unit.id) && tileFree(state, unit, behind.col, behind.row)) {
        unit.col = behind.col;
        unit.row = behind.row;
        updateExplored(state, unit.ownerId);
      }
      setCd();
      return ok;
    }

    case "war_cart_charge": {
      const behind = tileBeyond(unit, target);
      const res = resolveAttack(state, unit, col, row, { ability: "war_cart_charge" });
      if (!res.ok) return res;
      // The primitive battle-cart only rides through over open ground.
      const behindTile = getTile(state.map, behind.col, behind.row);
      const rough = !behindTile || isRough(behindTile.terrain);
      if (!rough && state.units.has(unit.id) && tileFree(state, unit, behind.col, behind.row)) {
        unit.col = behind.col;
        unit.row = behind.row;
        updateExplored(state, unit.ownerId);
      }
      setCd();
      return ok;
    }

    case "feigned_retreat": {
      if (dist(unit, target) <= 1) {
        // Close and ride through, like a Charge.
        const behind = tileBeyond(unit, target);
        const res = resolveAttack(state, unit, col, row, { ability: "charge" });
        if (!res.ok) return res;
        if (state.units.has(unit.id) && tileFree(state, unit, behind.col, behind.row)) {
          unit.col = behind.col;
          unit.row = behind.row;
          updateExplored(state, unit.ownerId);
        }
      } else {
        // Kite, like Fire & Retreat.
        const threat = { col, row };
        const res = resolveAttack(state, unit, col, row, { ability: "fire_and_retreat" });
        if (!res.ok) return res;
        if (state.units.has(unit.id)) {
          const back = retreatTile(state, unit, threat);
          if (back) {
            unit.col = back.col;
            unit.row = back.row;
            updateExplored(state, unit.ownerId);
          }
        }
      }
      setCd();
      return ok;
    }

    case "shock_charge": {
      const behind = tileBeyond(unit, target);
      const oldTargetPos = { col: target.col, row: target.row };
      const res = resolveAttack(state, unit, col, row, { ability: "shock_charge" });
      if (!res.ok) return res;
      // Knock the survivor back and take its tile.
      if (state.units.has(target.id) && state.units.has(unit.id) && tileFree(state, unit, behind.col, behind.row)) {
        target.col = behind.col;
        target.row = behind.row;
        unit.col = oldTargetPos.col;
        unit.row = oldTargetPos.row;
        updateExplored(state, unit.ownerId);
      }
      setCd();
      return ok;
    }

    case "trample": {
      const wounded = unit.hp < unitMaxHp(unit) / 2;
      const rampage = wounded && panicRoll(state, unit) < 40;
      const behind = tileBeyond(unit, target);
      // Splash targets: neighbors of the elephant (enemies only, unless rampaging).
      const splashVictims: Unit[] = [];
      for (const u of unitsAround(state, unit)) {
        if (u.id === target.id) continue;
        if (rampage) splashVictims.push(u);
        else {
          const o = playerById(state, u.ownerId);
          if (owner && o && areEnemies(owner, o)) splashVictims.push(u);
        }
      }
      const res = resolveAttack(state, unit, col, row, { ability: "trample" });
      if (!res.ok) return res;
      const splash = Math.round(10 * (1 + 0.05 * (unit.level - 1)));
      for (const v of splashVictims) if (state.units.has(v.id)) applyDirectDamage(state, v, splash);
      if (rampage) log(state, `${UNIT_DEFS[unit.type].name} rampaged!`, { actorId: unit.ownerId, targetIds: [unit.ownerId] });
      if (state.units.has(unit.id) && tileFree(state, unit, behind.col, behind.row)) {
        unit.col = behind.col;
        unit.row = behind.row;
        updateExplored(state, unit.ownerId);
      }
      setCd();
      return ok;
    }

    case "fire_and_retreat":
    case "skirmish":
    case "parthian_shot": {
      const threat = { col, row };
      const res = resolveAttack(state, unit, col, row, { ability });
      if (!res.ok) return res;
      if (state.units.has(unit.id)) {
        const back = retreatTile(state, unit, threat);
        if (back) {
          unit.col = back.col;
          unit.row = back.row;
          updateExplored(state, unit.ownerId);
        }
      }
      setCd();
      return ok;
    }

    case "repeating_fire": {
      const res = resolveAttack(state, unit, col, row, { ability: "repeating_fire" });
      if (!res.ok) return res;
      const second = unitAt(state, col, row); // a weaker follow-up bolt
      if (second && second.ownerId !== unit.ownerId) secondaryRangedDamage(state, unit, second, 0.6);
      setCd();
      return ok;
    }

    case "arrow_storm": {
      const res = resolveAttack(state, unit, col, row, { ability: "arrow_storm" });
      if (!res.ok) return res;
      // The volley also lightly wounds a second enemy beside the target.
      const owner2 = playerById(state, unit.ownerId);
      for (const u of state.units.values()) {
        if (u.ownerId === unit.ownerId) continue;
        if (u.col === col && u.row === row) continue;
        const o = playerById(state, u.ownerId);
        if (owner2 && o && areEnemies(owner2, o) && dist({ col, row }, u) === 1) {
          secondaryRangedDamage(state, unit, u, 0.5);
          break;
        }
      }
      setCd();
      return ok;
    }

    case "sunder":
    case "pierce":
    case "harry":
    case "siege_assault": {
      const res = resolveAttack(state, unit, col, row, { ability });
      if (!res.ok) return res;
      setCd();
      return ok;
    }

    case "furor": {
      const res = resolveAttack(state, unit, col, row, { ability: "furor" });
      if (!res.ok) return res;
      if (state.units.has(unit.id)) unit.exposedUntilTurn = state.turn + 1; // exposed after the wild charge
      setCd();
      return ok;
    }

    case "ram": {
      const res = resolveAttack(state, unit, col, row, { ability: "ram" });
      if (!res.ok) return res;
      setCd();
      return ok;
    }

    case "boarding_party": {
      const res = resolveAttack(state, unit, col, row, { ability: "boarding_party" });
      if (!res.ok) return res;
      if (state.units.has(unit.id)) {
        const target = unitAt(state, col, row);
        if (!target && unit.hp > 0) {
          // Successful boarding restores crew morale.
          unit.hp = Math.min(unitMaxHp(unit), unit.hp + 15);
        }
      }
      setCd();
      return ok;
    }

    case "greek_fire": {
      const res = resolveAttack(state, unit, col, row, { ability: "greek_fire" });
      if (!res.ok) return res;
      const splash = Math.round(10 * (1 + 0.05 * (unit.level - 1)));
      const owner2 = playerById(state, unit.ownerId);
      for (const u of unitsAround(state, unit)) {
        if (u.id === unit.id) continue;
        if (u.col === col && u.row === row) continue;
        const o = playerById(state, u.ownerId);
        if (owner2 && o && areEnemies(owner2, o) && (UNIT_DEFS[u.type].cls === "naval_melee" || UNIT_DEFS[u.type].cls === "naval_ranged")) {
          applyDirectDamage(state, u, splash);
        }
      }
      setCd();
      return ok;
    }

    case "coastal_bombardment": {
      const res = resolveAttack(state, unit, col, row, { ability: "coastal_bombardment" });
      if (!res.ok) return res;
      setCd();
      return ok;
    }
  }

  return fail("unknown ability");
}

function unitsAround(state: GameState, unit: Unit): Unit[] {
  const out: Unit[] = [];
  for (const u of state.units.values()) {
    if (u.id !== unit.id && dist(unit, u) === 1) out.push(u);
  }
  return out;
}

/**
 * Start-of-turn ability upkeep for a player's units: expire the one-turn
 * defensive stances and the Reconnoiter pulse, and enforce Harry pins.
 * Emplace persists until the unit moves (handled in the move command).
 */
export function tickAbilities(state: GameState, player: Player): void {
  for (const u of unitsOf(state, player.id)) {
    if (u.stance && u.stance !== "emplace") u.stance = null;
    u.scouting = false;
    if (u.pinnedUntilTurn !== undefined && state.turn <= u.pinnedUntilTurn) {
      u.movementLeft = 0;
    }
  }
}

/** Active abilities available on a unit (for the client's action buttons),
 *  honoring civ-unique overrides. */
export function unitAbilities(state: GameState, unit: Unit): ActiveAbilityId[] {
  return effectiveAbilities(state, unit);
}

export { STANCE_ABILITIES };
