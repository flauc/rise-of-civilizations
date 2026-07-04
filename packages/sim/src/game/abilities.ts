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
import { resolveAttack, applyDirectDamage, secondaryRangedDamage, sweepMeleeDamage, unitMaxHp, killUnit } from "./combat";
import { religionTierForUnit, scaledPassive } from "./religion-units";
import { changeUnitMorale, maybeRoute, startingUnitMorale } from "./morale";
import { updateExplored } from "./visibility";
import { effectiveAbilities, unitDisplayName } from "./civs";
import { canHideHere, revealHiddenInSight } from "./stealth";
import {
  ACTIVE_ABILITY_DEFS,
  UNIT_DEFS,
  type ActiveAbilityId,
  type StanceId,
} from "./content";

export interface AbilityResult {
  ok: boolean;
  error?: string;
}
const ok: AbilityResult = { ok: true };
const fail = (error: string): AbilityResult => ({ ok: false, error });

const STANCE_ABILITIES = new Set<ActiveAbilityId>(["brace", "shield_wall", "testudo", "emplace", "othismos", "last_stand", "pavise", "stone_bulwark", "zareba", "iron_wall", "wagenburg", "schiltron"]);

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
  // The blessing family targets FRIENDLY units, not enemies.
  const blessing = ability === "benediction" || ability === "darshan" || ability === "orisha_favor";
  for (const u of state.units.values()) {
    if (blessing) {
      if (u.ownerId === unit.ownerId && u.id !== unit.id && dist(unit, u) <= reach) {
        out.add(`${u.col},${u.row}`);
      }
      continue;
    }
    if (u.ownerId === unit.ownerId) continue;
    const o = playerById(state, u.ownerId);
    if (!o || !areEnemies(owner, o) || dist(unit, u) > reach) continue;
    // Uprising only rouses barbarian war-bands — the tribes, not a rival's army.
    if (ability === "uprising" && !o.isBarbarian) continue;
    out.add(`${u.col},${u.row}`);
  }
  return out;
}

/** Range (in tiles) a targeted ability can reach from the unit. */
function abilityRange(unit: Unit, ability: ActiveAbilityId): number {
  const def = UNIT_DEFS[unit.type];
  if (ability === "fire_and_retreat" || ability === "skirmish" || ability === "parthian_shot" || ability === "zagros_shot") return def.range ?? 1;
  if (ability === "siege_volley") return def.range ?? 1;
  if (ability === "mountain_ambush" || ability === "winter_war") return def.range ?? 1;
  if (ability === "double_ballista") return 2;
  if (ability === "whistling_arrows" || ability === "steady_volley" || ability === "camel_panic" || ability === "naphtha_shot") return def.range ?? 1;
  if (ability === "bolas" || ability === "hornet_bomb" || ability === "stone_hail") return def.range ?? 1;
  if (ability === "feigned_retreat") return Math.max(1, def.range ?? 1); // kite at range or charge adjacent
  if (ability === "repeating_fire") return def.range ?? 1;
  if (ability === "arrow_storm") return (def.range ?? 1) + 1;
  if (ability === "fire_lance") return (def.range ?? 1) + 1; // a lance reaches a tile beyond a melee thrust
  if (ability === "basilica_bombard") return (def.range ?? 1) + 1; // the great bombard outranges every other engine
  if (ability === "pierce") return Math.max(1, (def.range ?? 1) - 1);
  if (ability === "aimed_shot" || ability === "poisoned_arrows") return def.range ?? 1;
  if (ability === "broadside") return def.range ?? 1;
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

  // ---- self ----
  if (def.kind === "self") {
    if (!unit.abilityCooldowns) unit.abilityCooldowns = {};
    unit.abilityCooldowns[ability] = cooldownAfter(state, ability);

    // War Drums: rally this unit and adjacent allies; dismay adjacent enemies. Ends the turn.
    if (ability === "war_drums") {
      const owner = playerById(state, unit.ownerId);
      changeUnitMorale(unit, 15);
      for (const u of unitsAround(state, unit)) {
        const o = playerById(state, u.ownerId);
        if (u.ownerId === unit.ownerId) changeUnitMorale(u, 15);
        else if (owner && o && areEnemies(owner, o)) changeUnitMorale(u, -10);
      }
      unit.movementLeft = 0;
      unit.attackedThisTurn = true;
      log(state, `${unitDisplayName(state, unit)} beat the war drums.`, { actorId: unit.ownerId, targetIds: [unit.ownerId] });
      return ok;
    }

    // Endless Ranks: the fallen are replaced from the reserve. Ends the turn.
    if (ability === "endless_ranks") {
      unit.hp = Math.min(unitMaxHp(unit), unit.hp + 30);
      unit.movementLeft = 0;
      unit.attackedThisTurn = true;
      log(state, `${unitDisplayName(state, unit)} closed its endless ranks.`, { actorId: unit.ownerId, targetIds: [unit.ownerId] });
      return ok;
    }

    // Fresh Mounts / Monsoon Run / Swift Oars: a burst of movement that does NOT end the turn.
    if (ability === "fresh_mounts") {
      unit.movementLeft = UNIT_DEFS[unit.type].movement;
      return ok;
    }
    if (ability === "monsoon_run" || ability === "swift_oars") {
      unit.movementLeft += 2;
      return ok;
    }

    // Haka: the war challenge — heartens the line, shakes the foe, and does NOT end the turn.
    if (ability === "haka") {
      const owner = playerById(state, unit.ownerId);
      changeUnitMorale(unit, 10);
      for (const u of unitsAround(state, unit)) {
        const o = playerById(state, u.ownerId);
        if (u.ownerId === unit.ownerId) changeUnitMorale(u, 10);
        else if (owner && o && areEnemies(owner, o)) changeUnitMorale(u, -10);
      }
      log(state, `${unitDisplayName(state, unit)} performed the haka.`, { actorId: unit.ownerId, targetIds: [unit.ownerId] });
      return ok;
    }

    // Desperta Ferro: the war-cry before the charge — does NOT end the turn.
    if (ability === "desperta_ferro") {
      const owner = playerById(state, unit.ownerId);
      changeUnitMorale(unit, 15);
      for (const u of unitsAround(state, unit)) {
        const o = playerById(state, u.ownerId);
        if (owner && o && areEnemies(owner, o)) changeUnitMorale(u, -10);
      }
      log(state, `${unitDisplayName(state, unit)} cried "Desperta ferro!"`, { actorId: unit.ownerId, targetIds: [unit.ownerId] });
      return ok;
    }

    // Sacred Banner: the standard of Orléans is raised — the hero and adjacent
    // allies heal and take heart. Ends the turn.
    if (ability === "sacred_banner") {
      unit.hp = Math.min(unitMaxHp(unit), unit.hp + 10);
      changeUnitMorale(unit, 15);
      for (const u of unitsAround(state, unit)) {
        if (u.ownerId !== unit.ownerId) continue;
        u.hp = Math.min(unitMaxHp(u), u.hp + 10);
        changeUnitMorale(u, 15);
      }
      unit.movementLeft = 0;
      unit.attackedThisTurn = true;
      log(state, `${unitDisplayName(state, unit)} raised the sacred banner!`, { actorId: unit.ownerId, targetIds: [unit.ownerId] });
      return ok;
    }

    // ---- religion unique-unit self abilities (magnitudes scale with faith tier) ----
    const relTier = religionTierForUnit(state, unit);

    // Purifying Flame / Storm Call: scour every adjacent enemy. Ends the turn.
    if (ability === "purifying_flame" || ability === "storm_call") {
      const owner = playerById(state, unit.ownerId);
      const dmg = scaledPassive(8, relTier);
      const moraleHit = scaledPassive(10, relTier);
      for (const u of unitsAround(state, unit)) {
        const o = playerById(state, u.ownerId);
        if (!owner || !o || !areEnemies(owner, o)) continue;
        changeUnitMorale(u, -moraleHit);
        applyDirectDamage(state, u, dmg);
      }
      unit.movementLeft = 0;
      unit.attackedThisTurn = true;
      log(state, `${unitDisplayName(state, unit)} unleashed ${ability === "storm_call" ? "the storm" : "purifying flame"}!`, { actorId: unit.ownerId, targetIds: [unit.ownerId] });
      return ok;
    }

    // Doom Prophecy family: curse enemies within 2 tiles. Ends the turn.
    if (ability === "doom_prophecy" || ability === "omen_of_ishtar" || ability === "eclipse_prophecy") {
      const owner = playerById(state, unit.ownerId);
      const penalty = scaledPassive(3, relTier);
      const moraleHit = scaledPassive(10, relTier);
      for (const u of state.units.values()) {
        if (u.id === unit.id || dist(unit, u) > 2) continue;
        const o = playerById(state, u.ownerId);
        if (!owner || !o || !areEnemies(owner, o)) continue;
        u.cursedUntilTurn = state.turn + 1;
        u.cursedPenalty = penalty;
        changeUnitMorale(u, -moraleHit);
      }
      unit.movementLeft = 0;
      unit.attackedThisTurn = true;
      log(state, `${unitDisplayName(state, unit)} spoke a doom over the enemy!`, { actorId: unit.ownerId, targetIds: [unit.ownerId] });
      return ok;
    }

    // Kagura / Mettā: restore friendly units within 2 tiles. Ends the turn.
    if (ability === "kagura" || ability === "metta") {
      const heal = scaledPassive(10, relTier);
      const lift = scaledPassive(15, relTier);
      for (const u of state.units.values()) {
        if (u.id === unit.id || u.ownerId !== unit.ownerId || dist(unit, u) > 2) continue;
        u.hp = Math.min(unitMaxHp(u), u.hp + heal);
        changeUnitMorale(u, lift);
      }
      unit.movementLeft = 0;
      unit.attackedThisTurn = true;
      log(state, `${unitDisplayName(state, unit)} restored the faithful around them.`, { actorId: unit.ownerId, targetIds: [unit.ownerId] });
      return ok;
    }

    // Takbīr: the battle-cry — hearten the line, dismay the foe. Ends the turn.
    if (ability === "takbir") {
      const owner = playerById(state, unit.ownerId);
      const lift = scaledPassive(15, relTier);
      changeUnitMorale(unit, lift);
      for (const u of state.units.values()) {
        if (u.id === unit.id) continue;
        const o = playerById(state, u.ownerId);
        if (u.ownerId === unit.ownerId && dist(unit, u) <= 2) changeUnitMorale(u, lift);
        else if (owner && o && areEnemies(owner, o) && dist(unit, u) === 1) changeUnitMorale(u, -10);
      }
      unit.movementLeft = 0;
      unit.attackedThisTurn = true;
      log(state, `${unitDisplayName(state, unit)} raised the takbīr!`, { actorId: unit.ownerId, targetIds: [unit.ownerId] });
      return ok;
    }

    // Chakkar: one whirling strike on every adjacent enemy, no retaliation. Ends the turn.
    if (ability === "chakkar") {
      const owner = playerById(state, unit.ownerId);
      let struck = 0;
      for (const u of [...state.units.values()]) {
        if (u.id === unit.id || dist(unit, u) !== 1) continue;
        const o = playerById(state, u.ownerId);
        if (!owner || !o || !areEnemies(owner, o)) continue;
        sweepMeleeDamage(state, unit, u, 0.6);
        struck++;
      }
      if (struck === 0) return fail("no adjacent enemies");
      unit.movementLeft = 0;
      unit.attackedThisTurn = true;
      log(state, `${unitDisplayName(state, unit)}'s chakram whirled through ${struck} ${struck === 1 ? "enemy" : "enemies"}!`, { actorId: unit.ownerId, targetIds: [unit.ownerId] });
      return ok;
    }

    // Reconnoiter: forfeit the turn for a vision pulse.
    unit.scouting = true;
    unit.movementLeft = 0;
    unit.attackedThisTurn = true;
    revealHiddenInSight(state, unit, unitSight(state, unit) + 2); // the pulse flushes out hidden units
    updateExplored(state, unit.ownerId); // reveal the wider radius now
    return ok;
  }

  // ---- targeted ----
  if (col === undefined || row === undefined) return fail("ability needs a target");

  // Blessing family (Benediction / Darshan / Orisha's Favor): targets a FRIENDLY
  // adjacent unit — heal and hearten it. Magnitudes scale with the faith's tier.
  if (ability === "benediction" || ability === "darshan" || ability === "orisha_favor") {
    const ally = unitAt(state, col, row);
    if (!ally || ally.ownerId !== unit.ownerId || ally.id === unit.id) return fail("no friendly unit there");
    if (dist(unit, ally) > 1) return fail("out of range");
    const tier = religionTierForUnit(state, unit);
    ally.hp = Math.min(unitMaxHp(ally), ally.hp + scaledPassive(15, tier));
    changeUnitMorale(ally, scaledPassive(10, tier));
    if (!unit.abilityCooldowns) unit.abilityCooldowns = {};
    unit.abilityCooldowns[ability] = cooldownAfter(state, ability);
    unit.movementLeft = 0;
    unit.attackedThisTurn = true;
    log(state, `${unitDisplayName(state, unit)} blessed ${unitDisplayName(state, ally)}.`, { actorId: unit.ownerId, targetIds: [unit.ownerId] });
    return ok;
  }

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
    case "deus_vult": {
      // The crusader's charge: a straight +5 strike (+8 vs cities in resolveAttack).
      const res = resolveAttack(state, unit, col, row, { ability });
      if (!res.ok) return res;
      setCd();
      return ok;
    }

    case "charge":
    case "hussar_charge":
    case "kadesh_charge": {
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
      if (rampage) log(state, `${unitDisplayName(state, unit)} rampaged!`, { actorId: unit.ownerId, targetIds: [unit.ownerId] });
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
    case "parthian_shot":
    case "zagros_shot": {
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
    case "siege_assault":
    case "fire_lance":
    case "aimed_shot":
    case "poisoned_arrows":
    case "drilled_charge":
    case "broadside":
    case "zweihander":
    case "king_of_battle":
    case "siege_volley":
    case "ride_down":
    case "halberd_hook":
    case "couched_lance":
    case "mountain_ambush":
    case "falx_reap":
    case "winter_war":
    case "shear_oars":
    case "howdah_volley":
    case "double_ballista":
    case "duel_of_kings":
    case "gate_breaker":
    case "highland_charge":
    case "qamargah":
    case "nerge":
    case "steady_volley":
    case "wolf_pack":
    case "bolas":
    case "stone_hail":
    case "beach_assault":
    case "obsidian_reap":
    case "basilica_bombard":
    case "leiomano": {
      const res = resolveAttack(state, unit, col, row, { ability });
      if (!res.ok) return res;
      setCd();
      return ok;
    }

    case "uprising": {
      // Boudica rouses a barbarian war-band to her cause — no blow is struck.
      if (!tOwner?.isBarbarian) return fail("only barbarian war-bands can be roused");
      target.ownerId = unit.ownerId;
      target.morale = startingUnitMorale(state, unit.ownerId);
      target.hidden = false;
      target.stance = null;
      target.movementLeft = 0;
      target.attackedThisTurn = true;
      unit.movementLeft = 0;
      unit.attackedThisTurn = true;
      updateExplored(state, unit.ownerId);
      log(state, `${unitDisplayName(state, unit)} roused the ${UNIT_DEFS[target.type].name} to join the uprising!`, { actorId: unit.ownerId, targetIds: [unit.ownerId], tile: { col, row } });
      setCd();
      return ok;
    }

    case "slay_the_beast": {
      const from = { col: unit.col, row: unit.row };
      const res = resolveAttack(state, unit, col, row, { ability: "slay_the_beast" });
      if (!res.ok) return res;
      if (state.units.has(unit.id) && !state.units.has(target.id)) {
        // The monster is slain — the hero and those who saw it take heart.
        // (The hero may have advanced onto the kill tile, so count allies
        // around where he stood as well as where he stands.)
        changeUnitMorale(unit, 10);
        for (const u of state.units.values()) {
          if (u.id === unit.id || u.ownerId !== unit.ownerId) continue;
          if (dist(u, unit) === 1 || dist(u, from) === 1) changeUnitMorale(u, 10);
        }
        log(state, `${unitDisplayName(state, unit)} slew the beast — the war-band takes heart!`, { actorId: unit.ownerId, targetIds: [unit.ownerId] });
      }
      setCd();
      return ok;
    }

    case "pyramid_of_skulls": {
      const res = resolveAttack(state, unit, col, row, { ability: "pyramid_of_skulls" });
      if (!res.ok) return res;
      if (!state.units.has(target.id)) {
        // The example is made: every enemy in sight of the kill loses its nerve.
        for (const u of [...state.units.values()]) {
          const o = playerById(state, u.ownerId);
          if (owner && o && areEnemies(owner, o) && dist({ col, row }, u) <= 2) {
            changeUnitMorale(u, -15);
          }
        }
        log(state, `${unitDisplayName(state, unit)} raised a pyramid of skulls — terror spreads!`, { actorId: unit.ownerId, targetIds: [unit.ownerId], tile: { col, row } });
      }
      setCd();
      return ok;
    }

    case "flower_war": {
      const res = resolveAttack(state, unit, col, row, { ability: "flower_war" });
      if (!res.ok) return res;
      if (owner && !state.units.has(target.id)) {
        owner.faith += 20; // captives for the altar
        log(state, `${unitDisplayName(state, unit)} took captives in the flower war (+20 faith).`, { actorId: unit.ownerId, targetIds: [unit.ownerId] });
      }
      setCd();
      return ok;
    }

    case "mourning_war": {
      const res = resolveAttack(state, unit, col, row, { ability: "mourning_war" });
      if (!res.ok) return res;
      if (state.units.has(unit.id) && !state.units.has(target.id)) {
        unit.hp = Math.min(unitMaxHp(unit), unit.hp + 20); // the fallen are replaced
        log(state, `${unitDisplayName(state, unit)} restored its ranks in the mourning war.`, { actorId: unit.ownerId, targetIds: [unit.ownerId] });
      }
      setCd();
      return ok;
    }

    case "hornet_bomb": {
      const res = resolveAttack(state, unit, col, row, { ability: "hornet_bomb" });
      if (!res.ok) return res;
      const survivor = unitAt(state, col, row);
      if (survivor && survivor.id === target.id) changeUnitMorale(survivor, -10); // nothing fights well inside a swarm
      setCd();
      return ok;
    }

    case "whistling_arrows": {
      const res = resolveAttack(state, unit, col, row, { ability: "whistling_arrows" });
      if (!res.ok) return res;
      const survivor = unitAt(state, col, row);
      if (survivor && survivor.id === target.id) {
        // The shriek of the arrowheads breaks nerves before it breaks bodies.
        changeUnitMorale(survivor, -12);
        if (maybeRoute(state, survivor)) {
          log(state, `${unitDisplayName(state, unit)}'s whistling arrows broke the enemy!`, { actorId: unit.ownerId, targetIds: [unit.ownerId] });
        }
      }
      setCd();
      return ok;
    }

    case "camel_panic": {
      const res = resolveAttack(state, unit, col, row, { ability: "camel_panic" });
      if (!res.ok) return res;
      const survivor = unitAt(state, col, row);
      if (survivor && survivor.id === target.id && UNIT_DEFS[survivor.type].cls === "cavalry") {
        changeUnitMorale(survivor, -10); // the horses shy and will not settle
      }
      setCd();
      return ok;
    }

    case "naphtha_shot": {
      // A burning pot bursts on the target; fire splashes everyone beside it.
      const res = resolveAttack(state, unit, col, row, { ability: "naphtha_shot" });
      if (!res.ok) return res;
      const splash = Math.round(10 * (1 + 0.05 * (unit.level - 1)));
      const owner2 = playerById(state, unit.ownerId);
      for (const u of [...state.units.values()]) {
        if (u.col === col && u.row === row) continue;
        const o = playerById(state, u.ownerId);
        if (owner2 && o && areEnemies(owner2, o) && dist({ col, row }, u) === 1) {
          applyDirectDamage(state, u, splash);
        }
      }
      setCd();
      return ok;
    }

    case "sparth_cleave": {
      // A full strike on the target; the sweeping arc catches a second enemy
      // standing beside the axeman.
      const owner2 = playerById(state, unit.ownerId);
      let secondVictim: Unit | undefined;
      for (const u of unitsAround(state, unit)) {
        if (u.id === target.id) continue;
        const o = playerById(state, u.ownerId);
        if (owner2 && o && areEnemies(owner2, o)) { secondVictim = u; break; }
      }
      const res = resolveAttack(state, unit, col, row, { ability: "sparth_cleave" });
      if (!res.ok) return res;
      const glance = Math.round(10 * (1 + 0.05 * (unit.level - 1)));
      if (secondVictim && state.units.has(secondVictim.id)) applyDirectDamage(state, secondVictim, glance);
      setCd();
      return ok;
    }

    case "pilum":
    case "mounted_volley":
    case "atlatl_volley": {
      // A softening ranged volley (no retaliation), then the full melee strike.
      const volley = Math.round(10 * (1 + 0.05 * (unit.level - 1)));
      applyDirectDamage(state, target, volley);
      if (!state.units.has(target.id)) {
        // The volley alone finished it — the strike is spent.
        unit.attackedThisTurn = true;
        unit.movementLeft = 0;
        setCd();
        return ok;
      }
      const res = resolveAttack(state, unit, col, row, { ability });
      if (!res.ok) return res;
      setCd();
      return ok;
    }

    case "strandhogg": {
      const spoils = UNIT_DEFS[target.type]?.cost ?? 15;
      const res = resolveAttack(state, unit, col, row, { ability: "strandhogg" });
      if (!res.ok) return res;
      if (owner && !state.units.has(target.id)) {
        const loot = Math.min(50, Math.round(spoils * 1.2));
        owner.gold += loot;
        log(state, `${unitDisplayName(state, unit)} carried off ${loot} gold in the strandhögg.`, { actorId: unit.ownerId, targetIds: [unit.ownerId] });
      }
      setCd();
      return ok;
    }

    case "hellburner": {
      // The powder ship goes in: heavy damage to the target, half to adjacent
      // enemy ships — and the vessel itself is consumed in the blast.
      const blast = Math.round(50 * (1 + 0.05 * (unit.level - 1)));
      applyDirectDamage(state, target, blast);
      const owner2 = playerById(state, unit.ownerId);
      for (const u of [...state.units.values()]) {
        if (u.id === unit.id) continue;
        if (u.col === col && u.row === row) continue;
        const o = playerById(state, u.ownerId);
        if (owner2 && o && areEnemies(owner2, o) && dist({ col, row }, u) === 1 &&
            (UNIT_DEFS[u.type].cls === "naval_melee" || UNIT_DEFS[u.type].cls === "naval_ranged")) {
          applyDirectDamage(state, u, Math.round(blast / 2));
        }
      }
      log(state, `${unitDisplayName(state, unit)} went up as a hellburner!`, { actorId: unit.ownerId, targetIds: [unit.ownerId], tile: { col, row } });
      killUnit(state, unit); // consumed in the blast
      return ok;
    }

    case "hammer_and_anvil": {
      // Requires the anvil: another friendly unit adjacent to the target.
      const hasAnvil = [...state.units.values()].some(
        (u) => u.id !== unit.id && u.ownerId === unit.ownerId && dist(u, target) === 1,
      );
      if (!hasAnvil) return fail("needs another of your units beside the target");
      const res = resolveAttack(state, unit, col, row, { ability: "hammer_and_anvil" });
      if (!res.ok) return res;
      setCd();
      return ok;
    }

    case "wedge_charge": {
      // The wedge punches through: half damage splashes onto one enemy beside the target.
      const owner2 = playerById(state, unit.ownerId);
      let splashVictim: Unit | undefined;
      for (const u of state.units.values()) {
        if (u.id === target.id || u.ownerId === unit.ownerId) continue;
        const o = playerById(state, u.ownerId);
        if (owner2 && o && areEnemies(owner2, o) && dist({ col, row }, u) === 1) { splashVictim = u; break; }
      }
      const res = resolveAttack(state, unit, col, row, { ability: "wedge_charge" });
      if (!res.ok) return res;
      const splash = Math.round(10 * (1 + 0.05 * (unit.level - 1)));
      if (splashVictim && state.units.has(splashVictim.id)) applyDirectDamage(state, splashVictim, splash);
      setCd();
      return ok;
    }

    case "heroic_challenge": {
      const res = resolveAttack(state, unit, col, row, { ability: "heroic_challenge" });
      if (!res.ok) return res;
      if (state.units.has(unit.id) && !state.units.has(target.id)) {
        // The champion's kill heartens every friend who saw it.
        for (const u of state.units.values()) {
          if (u.ownerId === unit.ownerId && dist(unit, u) <= 2) changeUnitMorale(u, 10);
        }
        log(state, `${unitDisplayName(state, unit)} felled the champion — the host takes heart!`, { actorId: unit.ownerId, targetIds: [unit.ownerId] });
      }
      setCd();
      return ok;
    }

    case "terrorize": {
      const res = resolveAttack(state, unit, col, row, { ability: "terrorize" });
      if (!res.ok) return res;
      const survivor = unitAt(state, col, row);
      if (survivor && survivor.id === target.id) {
        // The trumpeting beast shakes the survivor's nerve — it may break outright.
        changeUnitMorale(survivor, -15);
        if (maybeRoute(state, survivor)) {
          log(state, `${unitDisplayName(state, unit)} terrorized the foe into rout!`, { actorId: unit.ownerId, targetIds: [unit.ownerId] });
        }
      }
      setCd();
      return ok;
    }

    case "overrun": {
      const res = resolveAttack(state, unit, col, row, { ability: "overrun" });
      if (!res.ok) return res;
      if (state.units.has(unit.id) && !state.units.has(target.id)) {
        // The target fell — the rider surges on and may act again this turn.
        unit.attackedThisTurn = false;
        unit.movementLeft = Math.max(unit.movementLeft, 1);
        log(state, `${unitDisplayName(state, unit)} overran the enemy and rides on!`, { actorId: unit.ownerId, targetIds: [unit.ownerId] });
      }
      setCd();
      return ok;
    }

    case "plunder": {
      const spoils = UNIT_DEFS[target.type]?.cost ?? 15; // loot scales with what you destroy
      const res = resolveAttack(state, unit, col, row, { ability: "plunder" });
      if (!res.ok) return res;
      if (owner && !state.units.has(target.id)) {
        // Target slain — seize gold from the fallen.
        const loot = Math.min(50, Math.round(spoils * 1.2));
        owner.gold += loot;
        log(state, `${unitDisplayName(state, unit)} plundered ${loot} gold from the slain.`, { actorId: unit.ownerId, targetIds: [unit.ownerId] });
      }
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
    if (u.stance && u.stance !== "emplace" && u.stance !== "wagenburg") u.stance = null;
    u.scouting = false;
    if (u.pinnedUntilTurn !== undefined && state.turn <= u.pinnedUntilTurn) {
      u.movementLeft = 0;
    }
    // A routed unit forfeits all actions on the turn after it broke.
    if (u.routedUntilTurn !== undefined && state.turn <= u.routedUntilTurn) {
      u.movementLeft = 0;
    }
    // Poisoned units bleed at their turn start while the venom lasts.
    if (u.poisonedUntilTurn !== undefined && state.turn <= u.poisonedUntilTurn && state.units.has(u.id)) {
      applyDirectDamage(state, u, 8);
    }
  }
}

/** Active abilities available on a unit (for the client's action buttons),
 *  honoring civ-unique overrides. */
export function unitAbilities(state: GameState, unit: Unit): ActiveAbilityId[] {
  return effectiveAbilities(state, unit);
}

export { STANCE_ABILITIES };
