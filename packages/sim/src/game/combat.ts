import { axialDistance, getTile, offsetToAxial, type TerrainType } from "@roc/shared";
import type { City, GameState, Player, Unit } from "./state";
import { cityAt, log, playerById, unitAt, areEnemies } from "./state";
import {
  UNIT_DEFS,
  UNIT_MAX_HP,
  isRanged,
  PROMOTION_DEFS,
  PROMOTION_POOL,
  type ActiveAbilityId,
  type PromotionId,
} from "./content";
import { isRough, terrainDefense, isWaterTerrain, isForestTerrain } from "./terrain";
import { structureDefense, towerBombard } from "./fortifications";
import { civCombatBonus, uniqueUnitForUnit } from "./civs";
import { applyVictoryCheck } from "./victory";
import { emitCityLost, emitUnitDied } from "./turn-updates";
import { isNavalUnit, isWaterDomain, isCoastalLand, isForestTile, riverBetween } from "./movement";
import { playerEffects } from "./civs";
import { breakCover } from "./stealth";

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

/** Uniques living by Bushidō: +30% strength when defending below 30% HP — they fight hardest cornered. */
const BUSHIDO_UNITS = new Set<string>(["japan_samurai"]);

/** True if this unit gets the passive Bushidō defensive bonus right now. */
function hasBushido(state: GameState, unit: Unit): boolean {
  if (unit.hp >= unitMaxHp(unit) * 0.3) return false;
  const uu = uniqueUnitForUnit(state, unit);
  return !!uu && BUSHIDO_UNITS.has(uu.id);
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

function attackStrength(
  state: GameState,
  unit: Unit,
  defender: Unit,
  targetTerrain: TerrainType,
  ranged: boolean,
  ability?: ActiveAbilityId,
): number {
  const def = UNIT_DEFS[unit.type];
  const defenderCls = UNIT_DEFS[defender.type].cls;
  let s = (ranged ? def.rangedStrength ?? 0 : def.strength) * levelMultiplier(unit);
  s += civCombatBonus(state, unit);

  // Active-ability attack bonuses.
  const defenderBraced = defender.stance === "brace" || defender.stance === "shield_wall" || defender.stance === "othismos" || defender.stance === "last_stand";
  if (!ranged && ability === "charge" && !defenderBraced) s += 4; // braced spears blunt a charge
  if (!ranged && ability === "war_cart_charge" && !defenderBraced) s += 2; // primitive battle-cart
  if (!ranged && ability === "hussar_charge") s += 4; // winged lance punches through a brace
  if (!ranged && ability === "furor") s += 6; // fanatic naked charge
  if (!ranged && ability === "shock_charge") s += 6;
  if (!ranged && ability === "trample") s += 3;
  if (!ranged && ability === "sunder") s -= 2; // a crushing blow lands lighter but debuffs
  if (!ranged && ability === "harry") s *= 0.6; // a harrying nip, not a kill blow
  if (!ranged && ability === "ram") s += 4; // naval ram
  if (!ranged && ability === "boarding_party") s += 5; // grapple and board
  if (ranged && ability === "coastal_bombardment") s += 4; // focused coastal fire
  // Emplaced siege fires harder.
  if (ranged && unit.stance === "emplace") s += (def.rangedStrength ?? 0) * 0.5;

  // Terrain-based bonuses.
  if (!ranged && has(unit, "shock") && isOpen(targetTerrain)) s += 3;
  if (!ranged && has(unit, "drill") && isRough(targetTerrain)) s += 3;
  if (ranged && has(unit, "accuracy") && isOpen(targetTerrain)) s += 3;
  if (ranged && has(unit, "barrage") && isRough(targetTerrain)) s += 3;
  if (has(unit, "woodland_warrior") && isForestTerrain(targetTerrain)) s += 3;
  if (has(unit, "guerrilla") && isRough(targetTerrain)) s += 3;
  if (has(unit, "amphibious") && (targetTerrain === "coast" || targetTerrain === "lake")) s += 3;

  // Naval bonuses.
  const defenderIsNaval = defenderCls === "naval_melee" || defenderCls === "naval_ranged";
  if (has(unit, "boarding") && defenderCls === "naval_melee") s += 4;
  if (has(unit, "boarding") && defenderCls === "naval_ranged") s += 3;
  if (has(unit, "chain_shot") && defenderIsNaval) s += 4;
  if (has(unit, "ramming") && !unit.attackedThisTurn && defenderIsNaval) s += 4;
  if (has(unit, "fleet_discipline") && adjacentNavalFriendlies(state, unit) > 0) s += 2;
  if (has(unit, "pursuit_at_sea") && isWounded(defender) && defenderIsNaval) s += 3;
  if (ranged && has(unit, "coastal_bombardment") && !isWaterTerrain(targetTerrain)) s += 4;
  if (ranged && has(unit, "broadside")) s += 2;

  // Civ / leader-ability combat bonuses.
  const eff = playerEffects(state, unit.ownerId);
  if (unit.embarked && eff.embarkedCombatBonus) s += eff.embarkedCombatBonus;
  if (isForestTile(state, unit.col, unit.row) && eff.forestTileCombatBonus) s += eff.forestTileCombatBonus;
  if (ranged && ability === "coastal_bombardment" && !isWaterTerrain(targetTerrain)) s += 4;

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

  // Phalanx push: a friendly neighbour holding Othismos lends melee +2 attack.
  if (!ranged) {
    for (const u of state.units.values()) {
      if (u.ownerId === unit.ownerId && u.id !== unit.id && u.stance === "othismos" && dist(unit, u) === 1) {
        s += 2;
        break;
      }
    }
  }

  // Assaulting across a river blunts a melee attack (ranged fire flies over it).
  if (!ranged && riverBetween(state, unit.col, unit.row, defender.col, defender.row)) s *= 0.75;

  // Ambush perk: a unit that broke cover near foes strikes harder until its next turn.
  if (unit.ambushReadyUntilTurn !== undefined && state.turn <= unit.ambushReadyUntilTurn) {
    s *= 1 + (unit.ambushBonus ?? 0.2);
  }

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

function adjacentNavalFriendlies(state: GameState, unit: Unit): number {
  let count = 0;
  for (const u of state.units.values()) {
    if (u.ownerId !== unit.ownerId || u.id === unit.id) continue;
    if ((UNIT_DEFS[u.type].cls === "naval_melee" || UNIT_DEFS[u.type].cls === "naval_ranged") && dist(unit, u) === 1) count++;
  }
  return count;
}

/** True if a land unit/city is on a coastal tile and can be reached by ships. */
function isCoastalTarget(state: GameState, col: number, row: number): boolean {
  return isCoastalLand(state, col, row);
}

function defenseStrength(state: GameState, unit: Unit, attacker: Unit, vsRanged: boolean): number {
  const def = UNIT_DEFS[unit.type];
  const attackerCls = UNIT_DEFS[attacker.type].cls;
  let s = def.strength * levelMultiplier(unit);
  const tile = getTile(state.map, unit.col, unit.row);
  // Ships (and embarked units) on water receive no terrain defense.
  if (tile && !isWaterTerrain(tile.terrain)) s += terrainDefense(tile.terrain);

  // Civ / leader-ability defensive bonuses.
  const eff = playerEffects(state, unit.ownerId);
  if (unit.embarked && eff.embarkedCombatBonus) s += eff.embarkedCombatBonus;
  if (isForestTile(state, unit.col, unit.row) && eff.forestTileCombatBonus) s += eff.forestTileCombatBonus;
  // A friendly defensive structure on the tile shelters its defender.
  if (tile?.structure && tile.ownerCityId !== undefined) {
    const o = state.cities.get(tile.ownerCityId);
    if (o && o.ownerId === unit.ownerId) s += structureDefense(tile.structure.tier);
  }
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
  // Furor leaves the fanatic exposed.
  if (unit.exposedUntilTurn !== undefined && state.turn <= unit.exposedUntilTurn) s -= 4;

  s += civCombatBonus(state, unit);

  // Stance defensive multipliers.
  let stanceMult = 1;
  if (unit.stance === "brace") stanceMult = attackerCls === "cavalry" ? 1.4 : 1.25;
  else if (unit.stance === "shield_wall" || unit.stance === "othismos") {
    stanceMult = Math.min(1.45, 1.15 + 0.1 * adjacentInfantry(state, unit));
  } else if (unit.stance === "last_stand") {
    // Spartan refusal: brace that sharpens as HP drops (up to +60% near death).
    const missing = 1 - unit.hp / unitMaxHp(unit);
    const base = attackerCls === "cavalry" ? 1.4 : 1.25;
    stanceMult = Math.min(1.6, base + 0.35 * missing);
  } else if (unit.stance === "testudo") stanceMult = vsRanged ? 1.5 : 0.9;
  else if (unit.stance === "pavise") stanceMult = vsRanged ? 1.5 : 1.0;
  else if (unit.stance === "emplace") stanceMult = 0.75;
  // Sundered units defend weaker.
  if (unit.sunderedUntilTurn !== undefined && state.turn <= unit.sunderedUntilTurn) stanceMult *= 0.75;
  // Bushidō: a cornered Samurai fights all the harder.
  if (hasBushido(state, unit)) stanceMult *= 1.3;

  return Math.max(1, s) * stanceMult * woundFactor(unit.hp, unitMaxHp(unit));
}

/** Count friendly melee/cavalry infantry-style neighbors (for Shield Wall). */
function adjacentInfantry(state: GameState, unit: Unit): number {
  let count = 0;
  for (const u of state.units.values()) {
    if (u.ownerId !== unit.ownerId || u.id === unit.id) continue;
    const cls = UNIT_DEFS[u.type].cls;
    if ((cls === "melee" || cls === "ranged") && dist(unit, u) === 1) count++;
  }
  return count;
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
    log(state, `Barbarians razed ${city.name}!`, {
      actorId: taker0?.id,
      targetIds: oldOwner ? [oldOwner.id] : undefined,
      tile: { col: city.col, row: city.row },
    });
    if (oldOwner && !oldOwner.isBarbarian) {
      emitCityLost(state, oldOwner.id, city.id, city.name, city.col, city.row);
    }
    applyVictoryCheck(state);
    return;
  }

  city.ownerId = attacker.ownerId;
  city.production = null;
  const eff = playerEffects(state, attacker.ownerId);
  const popBonus = eff.captureCityPopulationBonus ?? 0;
  city.population = Math.max(1, city.population - 1 + popBonus);
  city.hp = Math.floor(cityMaxHp(city) / 2);
  city.isCapital = false;
  // Attacker advances into the captured city.
  attacker.col = city.col;
  attacker.row = city.row;
  const taker = playerById(state, attacker.ownerId);
  log(state, `${taker?.name ?? "Someone"} captured ${city.name}${oldOwner ? ` from ${oldOwner.name}` : ""}.`, {
    actorId: attacker.ownerId,
    targetIds: oldOwner ? [oldOwner.id] : undefined,
    tile: { col: city.col, row: city.row },
  });
  if (oldOwner && !oldOwner.isBarbarian) {
    emitCityLost(state, oldOwner.id, city.id, city.name, city.col, city.row);
  }
  applyVictoryCheck(state);
}

/** Resolve an attack by `attacker` against whatever is on (col,row). */
export function resolveAttack(
  state: GameState,
  attacker: Unit,
  col: number,
  row: number,
  opts?: { ability?: ActiveAbilityId },
): AttackResult {
  const ability = opts?.ability;
  const def = UNIT_DEFS[attacker.type];
  if (def.strength <= 0 && (def.rangedStrength ?? 0) <= 0) return { ok: false, error: "unit cannot attack" };
  if (attacker.attackedThisTurn || attacker.movementLeft <= 0) return { ok: false, error: "no attack available" };
  if (attacker.embarked) return { ok: false, error: "embarked units cannot attack" };

  // Striking from concealment springs the ambush: reveal and arm the attacker.
  breakCover(state, attacker);

  const attackerOwner = playerById(state, attacker.ownerId)!;
  const attackerNaval = isNavalUnit(attacker);
  const ranged = isRanged(def);
  let range = (ranged ? def.range ?? 1 : 1) +
    (has(attacker, "extended_range") ? 1 : 0) +
    (ranged && has(attacker, "extended_range_naval") ? 1 : 0);
  if (ranged && attacker.stance === "emplace") range += 1; // emplaced engines reach further
  if (ability === "pierce") range = Math.max(1, range - 1); // careful aimed bolt, shorter
  if (ability === "arrow_storm") range += 1; // a long massed volley
  const d = dist({ col: attacker.col, row: attacker.row }, { col, row });
  if (d > range) return { ok: false, error: "out of range" };

  const targetTile = getTile(state.map, col, row);
  if (!targetTile) return { ok: false, error: "invalid tile" };

  const enemyUnit = unitAt(state, col, row);
  const enemyCity = cityAt(state, col, row);

  // ---- attack a city ----
  if (enemyCity && enemyCity.ownerId !== attacker.ownerId) {
    if (attackerNaval && !isCoastalTarget(state, col, row)) return { ok: false, error: "city is not coastal" };
    const owner = playerById(state, enemyCity.ownerId);
    if (owner && !areEnemies(attackerOwner, owner)) return { ok: false, error: "not at war" };
    let cityDef = cityDefenseStrength(state, enemyCity);
    if (ability === "siege_assault" && cityHasWalls(enemyCity)) cityDef = Math.max(1, cityDef - 6); // tower ignores the wall bonus
    const mult = vsCityMultiplier(attacker);
    const eff = playerEffects(state, attacker.ownerId);
    enemyCity.lastAttackedTurn = state.turn;

    if (ranged) {
      const base = (def.rangedStrength ?? 0) * levelMultiplier(attacker) * woundFactor(attacker.hp, unitMaxHp(attacker));
      let attEff = (base + cityAttackBonus(attacker)) * mult;
      if (def.cls === "siege" && eff.siegeVsCityDefenseMultiplier) {
        attEff *= 1 + eff.siegeVsCityDefenseMultiplier / 100;
      }
      enemyCity.hp = Math.max(0, enemyCity.hp - damageFrom(attEff, cityDef));
      awardXp(attacker, 3);
    } else {
      if (enemyCity.hp <= 0) {
        if (attackerNaval) {
          // Ships can reduce a city to 0 HP but cannot capture it from the sea.
          enemyCity.hp = 0;
        } else {
          captureCity(state, enemyCity, attacker);
        }
      } else {
        const base = def.strength * levelMultiplier(attacker) * woundFactor(attacker.hp, unitMaxHp(attacker));
        let attEff = (base + cityAttackBonus(attacker)) * mult + (eff.meleeVsCityBonus ?? 0);
        if (def.cls === "siege" && eff.siegeVsCityDefenseMultiplier) {
          attEff *= 1 + eff.siegeVsCityDefenseMultiplier / 100;
        }
        enemyCity.hp = Math.max(0, enemyCity.hp - damageFrom(attEff, cityDef));
        attacker.hp -= Math.round(damageFrom(cityDef, attEff) * (ability === "siege_assault" ? 0.5 : 1)); // the tower shelters its crew
        awardXp(attacker, 4);
        if (enemyCity.hp <= 0 && attacker.hp > 0) {
          if (attackerNaval) {
            enemyCity.hp = 0;
          } else {
            captureCity(state, enemyCity, attacker);
          }
        }
      }
    }
    finishAttack(state, attacker);
    return { ok: true };
  }

  // ---- attack a unit ----
  if (enemyUnit && enemyUnit.ownerId !== attacker.ownerId) {
    const owner = playerById(state, enemyUnit.ownerId);
    if (owner && !areEnemies(attackerOwner, owner)) return { ok: false, error: "not at war" };
    if (enemyUnit.hidden) enemyUnit.hidden = false; // attacking flushes out a concealed unit

    const defenderCls = UNIT_DEFS[enemyUnit.type].cls;
    const defenderIsNaval = isNavalUnit(enemyUnit) || !!enemyUnit.embarked;
    if (attackerNaval) {
      // Ships may attack other ships/embarked units freely; land units only if they are on a coastal tile.
      if (!defenderIsNaval && !isCoastalTarget(state, enemyUnit.col, enemyUnit.row)) {
        return { ok: false, error: "target is not coastal" };
      }
    } else if (isNavalUnit(enemyUnit)) {
      // Land units cannot attack native naval units (ships out of reach on open water).
      return { ok: false, error: "cannot attack naval units from land" };
    }

    if (ranged) {
      const attEff = attackStrength(state, attacker, enemyUnit, targetTile.terrain, true, ability);
      let defEff = defenseStrength(state, enemyUnit, attacker, true);
      if (ability === "pierce") defEff = Math.max(1, defEff - 6); // armor-piercing bolt
      enemyUnit.hp -= damageFrom(attEff, defEff);
      awardXp(attacker, 3);
      awardXp(enemyUnit, 2);
      if (ability === "sunder") enemyUnit.sunderedUntilTurn = state.turn + 1;
      if (enemyUnit.hp <= 0) killUnit(state, enemyUnit);
    } else {
      const attEff = attackStrength(state, attacker, enemyUnit, targetTile.terrain, false, ability);
      let defEff = defenseStrength(state, enemyUnit, attacker, false);
      if (ability === "pierce") defEff = Math.max(1, defEff - 6);
      enemyUnit.hp -= damageFrom(attEff, defEff);
      if ((ability === "sunder" || ability === "greek_fire") && enemyUnit.hp > 0) enemyUnit.sunderedUntilTurn = state.turn + 1;
      if (ability === "harry" && enemyUnit.hp > 0) enemyUnit.pinnedUntilTurn = state.turn + 1;
      let retaliation = damageFrom(defEff, attEff);
      if (has(attacker, "suppression")) retaliation = Math.max(0, retaliation - 3);
      // Charging onto braced spears is punished with heavier retaliation.
      const defenderBraced = enemyUnit.stance === "brace" || enemyUnit.stance === "shield_wall" || enemyUnit.stance === "othismos" || enemyUnit.stance === "last_stand";
      if ((ability === "charge" || ability === "shock_charge" || ability === "war_cart_charge") && defenderBraced) retaliation = Math.round(retaliation * 1.25);
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
      if (defenderDead && !cityAt(state, col, row) && !unitAt(state, col, row) && !targetTile.structure) {
        // Naval melee ships only advance onto water tiles; they cannot beach onto land.
        if (!attackerNaval || isWaterTerrain(targetTile.terrain)) {
          attacker.col = col; // advance into vacated tile
          attacker.row = row;
        }
      }
    }
    finishAttack(state, attacker);
    return { ok: true };
  }

  // ---- attack a defensive structure (wall / tower) ----
  const struct = targetTile.structure;
  if (struct && struct.hp > 0 && targetTile.ownerCityId !== undefined) {
    const sCity = state.cities.get(targetTile.ownerCityId);
    if (sCity && sCity.ownerId !== attacker.ownerId) {
      if (attackerNaval && !isCoastalTarget(state, col, row)) return { ok: false, error: "structure is not coastal" };
      const owner = playerById(state, sCity.ownerId);
      if (owner && !areEnemies(attackerOwner, owner)) return { ok: false, error: "not at war" };
      const structDef = 6 + struct.tier * 4 + terrainDefense(targetTile.terrain);
      const base =
        (ranged ? def.rangedStrength ?? 0 : def.strength) *
        levelMultiplier(attacker) *
        woundFactor(attacker.hp, unitMaxHp(attacker));
      const attEff = (base + cityAttackBonus(attacker)) * vsCityMultiplier(attacker);
      struct.hp = Math.max(0, struct.hp - damageFrom(attEff, structDef));
      if (!ranged) attacker.hp -= damageFrom(structDef * 0.5, attEff); // melee takes some back
      awardXp(attacker, 3);
      if (struct.hp <= 0) {
        targetTile.structure = undefined;
        attackerOwner.gold += 10;
        log(state, `${attackerOwner.name} stormed a fortification.`, {
          actorId: attacker.ownerId,
          targetIds: sCity ? [sCity.ownerId] : undefined,
          tile: { col, row },
        });
      }
      if (attacker.hp <= 0) {
        killUnit(state, attacker);
        return { ok: true };
      }
      finishAttack(state, attacker);
      return { ok: true };
    }
  }

  return { ok: false, error: "nothing to attack there" };
}

/**
 * Towers bombard: each standing tower owned by `playerId` makes one free ranged
 * hit on the weakest adjacent enemy unit. Called at the owner's turn start.
 */
export function towerBombardment(state: GameState, playerId: number): void {
  const owner = playerById(state, playerId);
  if (!owner) return;
  for (const t of state.map.tiles) {
    if (!t.structure || t.structure.kind !== "tower" || t.structure.hp <= 0) continue;
    if (t.ownerCityId === undefined) continue;
    const c = state.cities.get(t.ownerCityId);
    if (!c || c.ownerId !== playerId) continue;
    let target: Unit | null = null;
    for (const u of state.units.values()) {
      const uo = playerById(state, u.ownerId);
      if (!uo || !areEnemies(owner, uo)) continue;
      if (dist({ col: t.col, row: t.row }, u) !== 1) continue;
      if (!target || u.hp < target.hp) target = u;
    }
    if (target) {
      const dmg = damageFrom(towerBombard(t.structure.tier), defenseStrengthVsBombard(state, target));
      target.hp -= dmg;
      log(state, `A tower bombarded ${UNIT_DEFS[target.type].name} for ${dmg}.`, {
        actorId: playerId,
        targetIds: [target.ownerId],
        tile: { col: target.col, row: target.row },
      });
      if (target.hp <= 0) killUnit(state, target);
    }
  }
}

/** Simplified defense value used when a tower bombards a unit. */
function defenseStrengthVsBombard(state: GameState, unit: Unit): number {
  const tile = getTile(state.map, unit.col, unit.row);
  let s = UNIT_DEFS[unit.type].strength * levelMultiplier(unit);
  if (tile) s += terrainDefense(tile.terrain);
  if (has(unit, "cover")) s += 4;
  return Math.max(1, s) * woundFactor(unit.hp, unitMaxHp(unit));
}

function killUnit(state: GameState, unit: Unit): void {
  state.units.delete(unit.id);
  const owner = playerById(state, unit.ownerId);
  log(state, `${UNIT_DEFS[unit.type].name} (${owner?.name ?? "?"}) was destroyed.`, {
    targetIds: owner ? [owner.id] : undefined,
    tile: { col: unit.col, row: unit.row },
  });
  if (owner && !owner.isBarbarian) {
    emitUnitDied(
      state,
      owner.id,
      unit.id,
      UNIT_DEFS[unit.type].name,
      unit.col,
      unit.row,
    );
  }
}

/** Deal flat damage to a unit (e.g. Trample splash), killing it if it drops to 0. */
export function applyDirectDamage(state: GameState, unit: Unit, dmg: number): void {
  unit.hp -= Math.max(0, Math.round(dmg));
  if (unit.hp <= 0) killUnit(state, unit);
}

/**
 * A concealed unit ambushes the intruder that just stepped onto it: a surprise
 * strike with no retaliation, the hider's ambush bonus, and the intruder caught
 * off guard (−20% defense). Call `breakCover` on the hider first so its ambush
 * window/bonus is armed (see stealth.ts / commands.ts).
 */
export function resolveAmbush(state: GameState, hider: Unit, intruder: Unit): void {
  const tile = getTile(state.map, intruder.col, intruder.row);
  if (!tile) return;
  const attEff = attackStrength(state, hider, intruder, tile.terrain, false, undefined);
  const defEff = defenseStrength(state, intruder, hider, false) * 0.8; // surprised: −20%
  intruder.hp -= damageFrom(attEff, defEff);
  awardXp(hider, 4);
  awardXp(intruder, 2);
  if (intruder.hp <= 0) killUnit(state, intruder);
}

/** An extra ranged hit at `factor` of full strength (Repeating Fire 2nd shot, Arrow Storm splash). */
export function secondaryRangedDamage(state: GameState, attacker: Unit, target: Unit, factor: number): void {
  const tile = getTile(state.map, target.col, target.row);
  if (!tile) return;
  const attEff = attackStrength(state, attacker, target, tile.terrain, true, undefined) * factor;
  const defEff = defenseStrength(state, target, attacker, true);
  target.hp -= damageFrom(attEff, defEff);
  awardXp(attacker, 1);
  if (target.hp <= 0) killUnit(state, target);
}

function finishAttack(state: GameState, attacker: Unit): void {
  if (!state.units.has(attacker.id)) return;
  attacker.attackedThisTurn = true;
  attacker.movementLeft = 0;
}

/** True if `attacker` can legally target a tile/unit/city in the given domain. */
function isDomainAttackable(state: GameState, attacker: Unit, targetCol: number, targetRow: number, targetIsNaval: boolean): boolean {
  if (attacker.embarked) return false;
  const attackerNaval = isNavalUnit(attacker);
  if (!attackerNaval) {
    // Land units may not attack native ships.
    return !targetIsNaval;
  }
  // Naval units may attack ships/embarked units anywhere; land/city targets only if coastal.
  if (targetIsNaval) return true;
  return isCoastalTarget(state, targetCol, targetRow);
}

/** Tiles this unit could attack right now (enemy units/cities in range). */
export function computeAttackTargets(state: GameState, unit: Unit): Set<string> {
  const out = new Set<string>();
  const def = UNIT_DEFS[unit.type];
  if (def.strength <= 0 && (def.rangedStrength ?? 0) <= 0) return out;
  if (unit.attackedThisTurn || unit.movementLeft <= 0) return out;
  if (unit.embarked) return out;
  const owner = playerById(state, unit.ownerId);
  if (!owner) return out;
  const range = (isRanged(def) ? def.range ?? 1 : 1) +
    (has(unit, "extended_range") ? 1 : 0) +
    (isRanged(def) && has(unit, "extended_range_naval") ? 1 : 0);
  const from = { col: unit.col, row: unit.row };
  const attackerNaval = isNavalUnit(unit);

  for (const u of state.units.values()) {
    if (u.ownerId === unit.ownerId) continue;
    const o = playerById(state, u.ownerId);
    if (o && areEnemies(owner, o) && dist(from, u) <= range &&
        isDomainAttackable(state, unit, u.col, u.row, isNavalUnit(u) || !!u.embarked)) {
      out.add(`${u.col},${u.row}`);
    }
  }
  for (const c of state.cities.values()) {
    if (c.ownerId === unit.ownerId) continue;
    const o = playerById(state, c.ownerId);
    if (o && areEnemies(owner, o) && dist(from, c) <= range &&
        isDomainAttackable(state, unit, c.col, c.row, false)) {
      out.add(`${c.col},${c.row}`);
    }
  }
  // Enemy defensive structures can be attacked (and must be, to pass them).
  for (const t of state.map.tiles) {
    if (!t.structure || t.structure.hp <= 0 || t.ownerCityId === undefined) continue;
    const c = state.cities.get(t.ownerCityId);
    if (!c || c.ownerId === unit.ownerId) continue;
    const o = playerById(state, c.ownerId);
    if (o && areEnemies(owner, o) && dist(from, t) <= range && !unitAt(state, t.col, t.row) &&
        (!attackerNaval || isCoastalTarget(state, t.col, t.row))) {
      out.add(`${t.col},${t.row}`);
    }
  }
  return out;
}

/** Tiles holding a met, at-peace civ's unit/city in range — attacking one would
 *  declare war. Used by the client to warn before a surprise attack. */
export function peaceWarTargets(state: GameState, unit: Unit): Set<string> {
  const out = new Set<string>();
  const def = UNIT_DEFS[unit.type];
  if (def.strength <= 0 && (def.rangedStrength ?? 0) <= 0) return out;
  if (unit.attackedThisTurn || unit.movementLeft <= 0) return out;
  if (unit.embarked) return out;
  const me = playerById(state, unit.ownerId);
  if (!me) return out;
  const range = (isRanged(def) ? def.range ?? 1 : 1) +
    (has(unit, "extended_range") ? 1 : 0) +
    (isRanged(def) && has(unit, "extended_range_naval") ? 1 : 0);
  const from = { col: unit.col, row: unit.row };
  const attackerNaval = isNavalUnit(unit);
  const isPeaceTarget = (ownerId: number): boolean => {
    if (ownerId === unit.ownerId) return false;
    const o = playerById(state, ownerId);
    if (!o || o.isBarbarian) return false;
    return me.met.includes(ownerId) && !me.atWar.includes(ownerId);
  };
  for (const u of state.units.values()) {
    if (isPeaceTarget(u.ownerId) && dist(from, u) <= range &&
        isDomainAttackable(state, unit, u.col, u.row, isNavalUnit(u) || !!u.embarked)) {
      out.add(`${u.col},${u.row}`);
    }
  }
  for (const c of state.cities.values()) {
    if (isPeaceTarget(c.ownerId) && dist(from, c) <= range &&
        isDomainAttackable(state, unit, c.col, c.row, false)) {
      out.add(`${c.col},${c.row}`);
    }
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
  const eff = playerEffects(state, player.id);
  for (const u of own) {
    if (u.attackedLastTurn) continue;
    const cls = UNIT_DEFS[u.type].cls;
    let heal = 8;
    if (cityAt(state, u.col, u.row)?.ownerId === player.id) heal += 12;
    if (has(u, "swift_healer")) heal += 5;
    if (has(u, "survivalist")) heal += 8;
    heal += eff.unitHealPerTurn ?? 0;
    if (cls === "cavalry") heal += eff.mountedHealPerTurn ?? 0;
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
    // Repair crew only works while the ship is at sea.
    if (has(u, "repair_crew")) {
      const tile = getTile(state.map, u.col, u.row);
      if (tile && isWaterTerrain(tile.terrain)) {
        u.hp = Math.min(unitMaxHp(u), u.hp + 5);
      }
    }
  }
}
