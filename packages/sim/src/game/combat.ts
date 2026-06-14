import { axialDistance, getTile, offsetToAxial, type TerrainType } from "@roc/shared";
import type { City, GameState, Player, Unit } from "./state";
import { cityAt, playerById, unitAt, areEnemies } from "./state";
import {
  UNIT_DEFS,
  UNIT_MAX_HP,
  isRanged,
  PROMOTION_DEFS,
  PROMOTION_POOL,
  type PromotionId,
} from "./content";
import { isRough, terrainDefense } from "./terrain";
import { civCombatBonus } from "./civs";
import { applyVictoryCheck } from "./victory";

/** Maximum HP for a unit, increasing by 5% per level above 1 plus promotion bonuses. */
export function unitMaxHp(unit: Unit): number {
  let bonus = 0;
  if (has(unit, "toughness")) bonus += 15;
  if (has(unit, "colonist")) bonus += 20;
  if (has(unit, "survival_training")) bonus += 15;
  return Math.floor(UNIT_MAX_HP * (1 + 0.05 * (unit.level - 1))) + bonus;
}

/** Combat-strength multiplier from experience level (+5% per level). */
function levelMultiplier(unit: Unit): number {
  return 1 + 0.05 * (unit.level - 1);
}

/** Wounded units fight weaker: 1.0 at full HP down to 0.5 at 0 HP. */
function woundFactor(hp: number, maxHp: number): number {
  return 0.5 + (0.5 * Math.max(0, hp)) / maxHp;
}

function isOpen(t: TerrainType): boolean {
  return !isRough(t);
}

function has(unit: Unit, p: PromotionId): boolean {
  return unit.promotions.includes(p);
}

/** Damage one combatant deals to another given effective strengths. */
export function damageFrom(attEff: number, defEff: number): number {
  const d = Math.round(30 * Math.pow(attEff / Math.max(1, defEff), 1.4));
  return Math.max(1, Math.min(75, d));
}

function adjacentFriendlies(state: GameState, unit: Unit): number {
  let count = 0;
  for (const u of state.units.values()) {
    if (u.ownerId === unit.ownerId && u.id !== unit.id && dist(unit, u) === 1) count++;
  }
  return count;
}

function isWounded(unit: Unit): boolean {
  return unit.hp < unitMaxHp(unit) / 2;
}

function attackStrength(state: GameState, unit: Unit, defender: Unit, targetTerrain: TerrainType, ranged: boolean): number {
  const def = UNIT_DEFS[unit.type];
  const defenderCls = UNIT_DEFS[defender.type].cls;
  let s = (ranged ? def.rangedStrength ?? 0 : def.strength) * levelMultiplier(unit);
  s += civCombatBonus(state, unit);

  // Terrain-based bonuses.
  if (!ranged && has(unit, "shock") && isOpen(targetTerrain)) s += 3;
  if (!ranged && has(unit, "drill") && isRough(targetTerrain)) s += 3;
  if (ranged && has(unit, "accuracy") && isOpen(targetTerrain)) s += 3;
  if (ranged && has(unit, "barrage") && isRough(targetTerrain)) s += 3;
  if (has(unit, "woodland_warrior") && (targetTerrain === "forest" || targetTerrain === "jungle")) s += 3;
  if (has(unit, "guerrilla") && isRough(targetTerrain)) s += 3;
  if (has(unit, "amphibious") && (targetTerrain === "coast" || targetTerrain === "lake")) s += 3;

  // First-attack bonuses.
  if (!unit.attackedThisTurn) {
    if (has(unit, "charge")) s += 4;
    if (has(unit, "cavalry_charge")) s += 4;
    if (has(unit, "ambush")) s += 4;
  }

  // Defender-state bonuses.
  if (has(unit, "trample") && isWounded(defender)) s += 4;
  if (has(unit, "pursuit") && defender.hp < unitMaxHp(defender)) s += 3;
  if (has(unit, "sniper") && isWounded(defender)) s += 4;

  // Defender-class bonuses.
  if (def.abilities?.includes("bonus_vs_cavalry") && defenderCls === "cavalry") s += 5;
  if (has(unit, "harrier") && defenderCls === "ranged") s += 3;
  if (has(unit, "lancer") && defenderCls === "melee") s += 3;
  if (has(unit, "hunter") && defenderCls === "cavalry") s += 3;
  if (has(unit, "sharpshooter") && defenderCls === "melee") s += 3;
  if (has(unit, "counter_battery") && (defenderCls === "ranged" || defenderCls === "siege")) s += 4;

  // Position / support bonuses.
  if (has(unit, "discipline") && adjacentFriendlies(state, unit) > 0) s += 2;
  if (has(unit, "flanking")) s += Math.min(6, adjacentFriendlies(state, unit) * 2);
  const tile = getTile(state.map, unit.col, unit.row);
  if (tile) {
    if (has(unit, "elevation") && tile.terrain === "hills") s += 2;
  }

  // Static strength bonuses.
  if (has(unit, "blitz")) s += 2;
  if (ranged && has(unit, "volley")) s += 2;
  if (ranged && has(unit, "heavy_caliber")) s += 3;
  if (ranged && has(unit, "mounted_archer") && def.cls === "cavalry") s += 2;
  if (has(unit, "ranger")) s += 2;
  if (has(unit, "intimidation")) s += 2;

  return s * woundFactor(unit.hp, unitMaxHp(unit));
}

function adjacentEnemies(state: GameState, unit: Unit): number {
  let count = 0;
  const owner = playerById(state, unit.ownerId);
  for (const u of state.units.values()) {
    if (u.id === unit.id) continue;
    const otherOwner = playerById(state, u.ownerId);
    if (owner && otherOwner && areEnemies(owner, otherOwner) && dist(unit, u) === 1) count++;
  }
  return count;
}

function defenseStrength(state: GameState, unit: Unit, attacker: Unit, vsRanged: boolean): number {
  const def = UNIT_DEFS[unit.type];
  const attackerCls = UNIT_DEFS[attacker.type].cls;
  let s = def.strength * levelMultiplier(unit);
  const tile = getTile(state.map, unit.col, unit.row);
  if (tile) s += terrainDefense(tile.terrain);
  if (tile?.road) s += 0; // roads don't add defense
  if (vsRanged && has(unit, "cover")) s += 4;
  // Anti-cavalry also helps the defender against mounted attackers.
  if (def.abilities?.includes("bonus_vs_cavalry") && attackerCls === "cavalry") s += 5;

  if (has(unit, "brawler")) s += 3;
  if (has(unit, "formation") && attackerCls === "cavalry") s += 4;
  if (has(unit, "camouflage") && tile && isRough(tile.terrain)) s += 3;
  if (has(unit, "skirmisher") && adjacentEnemies(state, unit) === 0) s += 3;
  if (has(unit, "besieger")) {
    const city = cityAt(state, unit.col, unit.row);
    // Bonus when standing next to an enemy city (including the city's own tile).
    if (city && city.ownerId !== unit.ownerId) s += 3;
  }
  if (has(unit, "entrenchment") && def.cls === "siege") s += 2;
  if (has(unit, "stalwart")) s += 3;

  s += civCombatBonus(state, unit);
  return Math.max(1, s) * woundFactor(unit.hp, unitMaxHp(unit));
}

// ---- cities --------------------------------------------------------------

export function cityHasWalls(city: City): boolean {
  return city.buildings.includes("walls");
}

export function cityMaxHp(city: City): number {
  return 80 + 8 * city.population + (cityHasWalls(city) ? 100 : 0);
}

export function cityDefenseStrength(state: GameState, city: City): number {
  const tile = getTile(state.map, city.col, city.row);
  let s = 6 + 1.5 * city.population;
  if (cityHasWalls(city)) s += 6;
  if (city.buildings.includes("barracks")) s += 3;
  if (tile) s += terrainDefense(tile.terrain);
  // Strongest garrison lends some strength.
  const garrison = unitAt(state, city.col, city.row);
  if (garrison && garrison.ownerId === city.ownerId) {
    s += UNIT_DEFS[garrison.type].strength * levelMultiplier(garrison) * 0.5 * woundFactor(garrison.hp, unitMaxHp(garrison));
  }
  return Math.max(1, Math.round(s));
}

function vsCityMultiplier(unit: Unit): number {
  let m = 1;
  if (UNIT_DEFS[unit.type].abilities?.includes("bonus_vs_city")) m *= 1.5;
  if (has(unit, "siege")) m *= 1.5;
  return m;
}

function cityAttackBonus(unit: Unit): number {
  let bonus = 0;
  if (has(unit, "city_assault")) bonus += 4;
  if (has(unit, "city_breacher")) bonus += 4;
  if (has(unit, "demolition")) bonus += 3;
  return bonus;
}

// ---- XP & promotions -----------------------------------------------------

function xpForNextLevel(level: number): number {
  return 10 * level;
}

function awardXp(unit: Unit, amount: number): void {
  const def = UNIT_DEFS[unit.type];
  if (def.cls === "settler" || def.cls === "trader") return;
  let mult = 1;
  if (has(unit, "veteran") || has(unit, "veteran_marksman")) mult += 0.25;
  unit.xp += Math.ceil(amount * mult);
  while (unit.xp >= xpForNextLevel(unit.level)) {
    unit.xp -= xpForNextLevel(unit.level);
    unit.level += 1;
    const newMax = unitMaxHp(unit);
    unit.hp = Math.min(newMax, unit.hp + Math.round(newMax * 0.2));
    if (PROMOTION_POOL[def.cls].length > 0) unit.unspentPromotions += 1;
  }
}

/** Promotions this unit could still take, gated by level tier. */
export function availablePromotions(unit: Unit): PromotionId[] {
  const pool = PROMOTION_POOL[UNIT_DEFS[unit.type].cls];
  const maxTier = Math.max(1, unit.level - 1);
  return pool.filter((p) => !unit.promotions.includes(p) && PROMOTION_DEFS[p].tier <= maxTier);
}

// ---- attack resolution ---------------------------------------------------

export interface AttackResult {
  ok: boolean;
  error?: string;
}

function dist(a: { col: number; row: number }, b: { col: number; row: number }): number {
  return axialDistance(offsetToAxial(a), offsetToAxial(b));
}

function captureCity(state: GameState, city: City, attacker: Unit): void {
  // Destroy any of the old owner's units sitting on the tile.
  const garrison = unitAt(state, city.col, city.row);
  if (garrison && garrison.ownerId === city.ownerId) state.units.delete(garrison.id);
  const oldOwner = playerById(state, city.ownerId);
  const taker0 = playerById(state, attacker.ownerId);

  // Barbarians raze cities rather than holding them.
  if (taker0?.isBarbarian) {
    for (const t of state.map.tiles) if (t.ownerCityId === city.id) t.ownerCityId = undefined;
    state.cities.delete(city.id);
    state.log.push(`Barbarians razed ${city.name}!`);
    applyVictoryCheck(state);
    return;
  }

  city.ownerId = attacker.ownerId;
  city.production = null;
  city.population = Math.max(1, city.population - 1);
  city.hp = Math.floor(cityMaxHp(city) / 2);
  city.isCapital = false;
  // Attacker advances into the captured city.
  attacker.col = city.col;
  attacker.row = city.row;
  const taker = playerById(state, attacker.ownerId);
  state.log.push(`${taker?.name ?? "Someone"} captured ${city.name}${oldOwner ? ` from ${oldOwner.name}` : ""}.`);
  applyVictoryCheck(state);
}

/** Resolve an attack by `attacker` against whatever is on (col,row). */
export function resolveAttack(state: GameState, attacker: Unit, col: number, row: number): AttackResult {
  const def = UNIT_DEFS[attacker.type];
  if (def.strength <= 0 && (def.rangedStrength ?? 0) <= 0) return { ok: false, error: "unit cannot attack" };
  if (attacker.attackedThisTurn || attacker.movementLeft <= 0) return { ok: false, error: "no attack available" };

  const attackerOwner = playerById(state, attacker.ownerId)!;
  const ranged = isRanged(def);
  const range = (ranged ? def.range ?? 1 : 1) + (has(attacker, "extended_range") ? 1 : 0);
  const d = dist({ col: attacker.col, row: attacker.row }, { col, row });
  if (d > range) return { ok: false, error: "out of range" };

  const targetTile = getTile(state.map, col, row);
  if (!targetTile) return { ok: false, error: "invalid tile" };

  const enemyUnit = unitAt(state, col, row);
  const enemyCity = cityAt(state, col, row);

  // ---- attack a city ----
  if (enemyCity && enemyCity.ownerId !== attacker.ownerId) {
    const owner = playerById(state, enemyCity.ownerId);
    if (owner && !areEnemies(attackerOwner, owner)) return { ok: false, error: "not at war" };
    const cityDef = cityDefenseStrength(state, enemyCity);
    const mult = vsCityMultiplier(attacker);
    enemyCity.lastAttackedTurn = state.turn;

    if (ranged) {
      const base = (def.rangedStrength ?? 0) * levelMultiplier(attacker) * woundFactor(attacker.hp, unitMaxHp(attacker));
      const attEff = (base + cityAttackBonus(attacker)) * mult;
      enemyCity.hp = Math.max(0, enemyCity.hp - damageFrom(attEff, cityDef));
      awardXp(attacker, 3);
    } else {
      if (enemyCity.hp <= 0) {
        captureCity(state, enemyCity, attacker);
      } else {
        const base = def.strength * levelMultiplier(attacker) * woundFactor(attacker.hp, unitMaxHp(attacker));
        const attEff = (base + cityAttackBonus(attacker)) * mult;
        enemyCity.hp = Math.max(0, enemyCity.hp - damageFrom(attEff, cityDef));
        attacker.hp -= damageFrom(cityDef, attEff);
        awardXp(attacker, 4);
        if (enemyCity.hp <= 0 && attacker.hp > 0) captureCity(state, enemyCity, attacker);
      }
    }
    finishAttack(state, attacker);
    return { ok: true };
  }

  // ---- attack a unit ----
  if (enemyUnit && enemyUnit.ownerId !== attacker.ownerId) {
    const owner = playerById(state, enemyUnit.ownerId);
    if (owner && !areEnemies(attackerOwner, owner)) return { ok: false, error: "not at war" };

    if (ranged) {
      const attEff = attackStrength(state, attacker, enemyUnit, targetTile.terrain, true);
      const defEff = defenseStrength(state, enemyUnit, attacker, true);
      enemyUnit.hp -= damageFrom(attEff, defEff);
      awardXp(attacker, 3);
      awardXp(enemyUnit, 2);
      if (enemyUnit.hp <= 0) killUnit(state, enemyUnit);
    } else {
      const attEff = attackStrength(state, attacker, enemyUnit, targetTile.terrain, false);
      const defEff = defenseStrength(state, enemyUnit, attacker, false);
      enemyUnit.hp -= damageFrom(attEff, defEff);
      let retaliation = damageFrom(defEff, attEff);
      if (has(attacker, "suppression")) retaliation = Math.max(0, retaliation - 3);
      attacker.hp -= retaliation;
      awardXp(attacker, 4);
      awardXp(enemyUnit, 4);
      const defenderDead = enemyUnit.hp <= 0;
      const attackerDead = attacker.hp <= 0;
      if (defenderDead) {
        killUnit(state, enemyUnit);
        if (!attackerDead) {
          let heal = 0;
          if (has(attacker, "bloodlust")) heal += 12;
          if (has(attacker, "forager")) heal += 8;
          if (heal > 0) attacker.hp = Math.min(unitMaxHp(attacker), attacker.hp + heal);
        }
      }
      if (attackerDead) {
        killUnit(state, attacker);
        return { ok: true };
      }
      if (defenderDead && !cityAt(state, col, row) && !unitAt(state, col, row)) {
        attacker.col = col; // advance into vacated tile
        attacker.row = row;
      }
    }
    finishAttack(state, attacker);
    return { ok: true };
  }

  return { ok: false, error: "nothing to attack there" };
}

function killUnit(state: GameState, unit: Unit): void {
  state.units.delete(unit.id);
  const owner = playerById(state, unit.ownerId);
  state.log.push(`${UNIT_DEFS[unit.type].name} (${owner?.name ?? "?"}) was destroyed.`);
}

function finishAttack(state: GameState, attacker: Unit): void {
  if (!state.units.has(attacker.id)) return;
  attacker.attackedThisTurn = true;
  attacker.movementLeft = 0;
}

/** Tiles this unit could attack right now (enemy units/cities in range). */
export function computeAttackTargets(state: GameState, unit: Unit): Set<string> {
  const out = new Set<string>();
  const def = UNIT_DEFS[unit.type];
  if (def.strength <= 0 && (def.rangedStrength ?? 0) <= 0) return out;
  if (unit.attackedThisTurn || unit.movementLeft <= 0) return out;
  const owner = playerById(state, unit.ownerId);
  if (!owner) return out;
  const range = (isRanged(def) ? def.range ?? 1 : 1) + (has(unit, "extended_range") ? 1 : 0);
  const from = { col: unit.col, row: unit.row };

  for (const u of state.units.values()) {
    if (u.ownerId === unit.ownerId) continue;
    const o = playerById(state, u.ownerId);
    if (o && areEnemies(owner, o) && dist(from, u) <= range) out.add(`${u.col},${u.row}`);
  }
  for (const c of state.cities.values()) {
    if (c.ownerId === unit.ownerId) continue;
    const o = playerById(state, c.ownerId);
    if (o && areEnemies(owner, o) && dist(from, c) <= range) out.add(`${c.col},${c.row}`);
  }
  return out;
}

export interface CombatPreview {
  toDefender: number; // damage the attacker would deal
  toAttacker: number; // damage taken back (0 for ranged or vs an empty-HP city)
  vsCity: boolean;
}

/** Predict the outcome of an attack without mutating state (for UI hover odds). */
export function combatPreview(state: GameState, attacker: Unit, col: number, row: number): CombatPreview | null {
  const def = UNIT_DEFS[attacker.type];
  const ranged = isRanged(def);
  const targetTile = getTile(state.map, col, row);
  if (!targetTile) return null;
  const enemyCity = cityAt(state, col, row);
  const enemyUnit = unitAt(state, col, row);

  if (enemyCity && enemyCity.ownerId !== attacker.ownerId) {
    const cityDef = cityDefenseStrength(state, enemyCity);
    const mult = vsCityMultiplier(attacker);
    const base = (ranged ? def.rangedStrength ?? 0 : def.strength) * levelMultiplier(attacker) * woundFactor(attacker.hp, unitMaxHp(attacker));
    const attEff = (base + cityAttackBonus(attacker)) * mult;
    return {
      toDefender: damageFrom(attEff, cityDef),
      toAttacker: ranged ? 0 : damageFrom(cityDef, attEff),
      vsCity: true,
    };
  }
  if (enemyUnit && enemyUnit.ownerId !== attacker.ownerId) {
    const attEff = attackStrength(state, attacker, enemyUnit, targetTile.terrain, ranged);
    const defEff = defenseStrength(state, enemyUnit, attacker, ranged);
    return {
      toDefender: damageFrom(attEff, defEff),
      toAttacker: ranged ? 0 : damageFrom(defEff, attEff),
      vsCity: false,
    };
  }
  return null;
}

/** Start-of-turn upkeep for a player's units: heal, medic aura, reset flags. */
export function healAndReset(state: GameState, player: Player): void {
  const own = [...state.units.values()].filter((u) => u.ownerId === player.id);
  for (const u of own) {
    u.attackedLastTurn = u.attackedThisTurn;
    u.attackedThisTurn = false;
  }
  for (const u of own) {
    if (u.attackedLastTurn) continue;
    let heal = 8;
    if (cityAt(state, u.col, u.row)?.ownerId === player.id) heal += 12;
    if (has(u, "swift_healer")) heal += 5;
    if (has(u, "survivalist")) heal += 8;
    u.hp = Math.min(unitMaxHp(u), u.hp + heal);
    if (u.promotions.includes("medic")) {
      for (const other of own) {
        if (other.id !== u.id && dist(u, other) === 1) {
          other.hp = Math.min(unitMaxHp(other), other.hp + 10);
        }
      }
    }
    if (has(u, "field_medic")) {
      for (const other of own) {
        if (other.id !== u.id && dist(u, other) === 1) {
          other.hp = Math.min(unitMaxHp(other), other.hp + 5);
        }
      }
    }
  }
}
