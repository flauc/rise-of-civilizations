import { axialDistance, getTile, makeRng, offsetToAxial, type TerrainType } from "@roc/shared";
import type { City, GameState, Player, Unit } from "./state";
import { cityAt, log, playerById, unitAt, areEnemies } from "./state";
import {
  UNIT_DEFS,
  UNIT_MAX_HP,
  unitBaseMaxHp,
  isRanged,
  PROMOTION_DEFS,
  PROMOTION_POOL,
  trainingTier,
  type ActiveAbilityId,
  type PromotionId,
} from "./content";
import { isRough, terrainDefense, isWaterTerrain, isForestTerrain } from "./terrain";
import { structureDefense, towerBombard } from "./fortifications";
import { civCombatBonus, uniqueUnitForUnit, unitDisplayName } from "./civs";
import { legendCombatBonus } from "./legends";
import { extendLegendsOnTrigger } from "./legend-lifespan";
import { scuttleShipCargo } from "./naval-cargo";
import { legendCityDefenseBonus } from "./legend-effects";
import { applyVictoryCheck } from "./victory";
import { emitCityLost, emitUnitDied, maybeCheckCivElimination } from "./turn-updates";
import { isNavalUnit, isWaterDomain, isCoastalLand, isForestTile, riverBetween } from "./movement";
import { playerEffects } from "./civs";
import { breakCover } from "./stealth";
import { changeUnitMorale, moraleAttackMultiplier, moraleDefenseMultiplier, onEnemyDefeated, onUnitLost, maybeRoute, retreatOneStep } from "./morale";
import { cityMajorityFaith, religionInstanceForDefId, religionUnitCombatBonus, religionUnitKit, unitPassive } from "./religion-units";
import { onUnitEnter, leaveRuin } from "./features";
import { grantLegendDeathFaith } from "./works";
import { tileOwnerId } from "./territory";
import { playerReligionId, convertCityToPlayerReligion } from "./religion";

/** Flat combat-strength from civics/governments that depend on *where* the unit
 *  fights and *whom* it fights (docs/CIVICS-AND-GOVERNMENTS.md §4): a home/foreign
 *  territory bonus, an all-units bonus, and a bonus vs civs of another religion.
 *  `opponent` is the other combatant (the defender when attacking, the attacker
 *  when defending). */
function conditionalCombatBonus(state: GameState, unit: Unit, opponent: Unit): number {
  const eff = playerEffects(state, unit.ownerId);
  let b = eff.allUnitCombat ?? 0;
  const atHome = tileOwnerId(state, unit.col, unit.row) === unit.ownerId;
  b += atHome ? (eff.homeCombat ?? 0) : (eff.foreignCombat ?? 0);
  if (eff.combatVsOtherReligion) {
    const mine = playerReligionId(state, unit.ownerId);
    // You must hold a faith of your own; the foe counts as "other-religion" if
    // theirs differs (including having none — e.g. barbarians).
    if (mine && playerReligionId(state, opponent.ownerId) !== mine) b += eff.combatVsOtherReligion;
  }
  if (eff.combatVsUniqueUnit && uniqueUnitForUnit(state, opponent)) b += eff.combatVsUniqueUnit;
  return b;
}

/** Combat bonuses from timed modifiers that depend on the unit's own type. */
function typedCombatBonus(state: GameState, unit: Unit, ranged: boolean): number {
  const eff = playerEffects(state, unit.ownerId);
  let b = 0;
  if (eff.gunpowderCombatBonus && UNIT_DEFS[unit.type].gunpowder) b += eff.gunpowderCombatBonus;
  const cls = UNIT_DEFS[unit.type].cls;
  if (!ranged && eff.navalMeleeCombatBonus && cls === "naval_melee") b += eff.navalMeleeCombatBonus;
  return b;
}

/** Fire Lance fires off the unit's melee strength plus this, so the ranged shot
 *  lands slightly harder than a regular thrust (and takes no retaliation). */
const FIRE_LANCE_BONUS = 3;

/** Maximum HP for a unit, increasing by 5% per level above 1, unit tier, and promotions. */
export function unitMaxHp(unit: Unit): number {
  let bonus = 0;
  if (has(unit, "toughness")) bonus += 15;
  if (has(unit, "colonist")) bonus += 20;
  return unitBaseMaxHp(unit.type, unit.level) + bonus;
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

/** Melee exchange without moving either unit or spending the attacker's turn pool.
 *  Used when a trade-route escort intercepts a plunder attempt. Both may die. */
export function exchangeMeleeCombat(
  state: GameState,
  attacker: Unit,
  defender: Unit,
  terrain: TerrainType,
): void {
  const attEff = attackStrength(state, attacker, defender, terrain, false, undefined);
  const defEff = defenseStrength(state, defender, attacker, false);
  defender.hp -= damageFrom(attEff, defEff);
  let retaliation = damageFrom(defEff, attEff);
  if (has(attacker, "suppression")) retaliation = Math.max(0, retaliation - 3);
  attacker.hp -= retaliation;
  awardXp(state, attacker, 4);
  awardXp(state, defender, 4);
  if (defender.hp <= 0) {
    killUnit(state, defender, { victorOwnerId: attacker.ownerId });
    onEnemyDefeated(state, attacker, defender);
    harvestFaithOnKill(state, attacker);
  } else {
    maybeRoute(state, defender);
  }
  if (attacker.hp <= 0) killUnit(state, attacker, { victorOwnerId: defender.ownerId });
}

function adjacentFriendlies(state: GameState, unit: Unit): number {
  let count = 0;
  for (const u of state.units.values()) {
    if (u.ownerId === unit.ownerId && u.id !== unit.id && dist(unit, u) === 1) count++;
  }
  return count;
}

function friendliesWithin(state: GameState, unit: Unit, radius: number): number {
  let count = 0;
  for (const u of state.units.values()) {
    if (u.ownerId === unit.ownerId && u.id !== unit.id && dist(unit, u) <= radius) count++;
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
  // A melee unit's Fire Lance fires off its melee strength (it has no rangedStrength).
  if (ranged && ability === "fire_lance") s = (def.strength + FIRE_LANCE_BONUS) * levelMultiplier(unit);
  // Broadside: gun-armed ships fire their battery using hull strength if they lack a ranged rating.
  if (ranged && ability === "broadside" && !def.rangedStrength) s = def.strength * levelMultiplier(unit);
  // Elephant-back shooters fire a lighter weapon than the beast's bulk suggests.
  if (ranged && ability === "howdah_volley") s = Math.max(4, def.strength - 4) * levelMultiplier(unit);
  if (ranged && ability === "double_ballista") s = Math.max(4, def.strength - 2) * levelMultiplier(unit);
  s += civCombatBonus(state, unit);
  s += conditionalCombatBonus(state, unit, defender); // civics: home/foreign/all-unit/other-religion
  s += typedCombatBonus(state, unit, ranged);
  s += legendCombatBonus(state, unit); // hero strength + adjacent-hero aura
  s += religionUnitCombatBonus(state, unit); // faith-tier strength + religious auras
  if (unit.cursedUntilTurn !== undefined && state.turn <= unit.cursedUntilTurn) s -= unit.cursedPenalty ?? 3;

  // Active-ability attack bonuses.
  const defenderBraced = defender.stance === "brace" || defender.stance === "shield_wall" || defender.stance === "othismos" || defender.stance === "last_stand";
  if (!ranged && ability === "charge" && !defenderBraced) s += 4; // braced spears blunt a charge
  if (!ranged && ability === "war_cart_charge" && !defenderBraced) s += 2; // primitive battle-cart
  if (!ranged && ability === "hussar_charge") s += 4; // winged lance punches through a brace
  if (!ranged && ability === "furor") s += 6; // fanatic naked charge
  if (!ranged && ability === "shock_charge") s += 6;
  if (!ranged && (ability === "plunder" || ability === "strandhogg")) s += 2; // a raiding strike, out for loot not the biggest blow
  if (!ranged && ability === "overrun") s += 2; // momentum strike — surges on if the target falls
  if (!ranged && ability === "drilled_charge") s += 4; // parade-ground charge, too clean to answer
  if (!ranged && ability === "terrorize") s += 3; // thunderous assault that shakes morale
  if (!ranged && ability === "wedge_charge") s += 4; // the cataphract wedge punches through
  if (!ranged && ability === "hammer_and_anvil") s += 4; // coordinated blow on an engaged enemy
  if (!ranged && ability === "heroic_challenge") s += 3; // a champion's blow
  if (!ranged && ability === "zweihander") s += 2; // the great sword hacks the pike hedge
  if (!ranged && ability === "kadesh_charge") s += 4; // the heavy three-crew chariot
  if (!ranged && ability === "king_of_battle") s += Math.min(4, adjacentFriendlyMilitary(state, unit)); // the army fights as one
  if (!ranged && ability === "ride_down") s += defender.hp < unitMaxHp(defender) / 2 ? 6 : 1; // run down the faltering
  if (!ranged && ability === "halberd_hook") s += defenderCls === "cavalry" ? 6 : 2; // the hook drags riders down
  if (!ranged && ability === "couched_lance") s += 2 + Math.min(4, UNIT_DEFS[unit.type].movement - unit.movementLeft); // momentum feeds the lance
  if (!ranged && ability === "falx_reap") s += 1; // the falx reaches over the shield (armor bypass below)
  if (!ranged && ability === "sparth_cleave") s += 2; // the great axe sweeps an arc
  if (!ranged && ability === "shear_oars") s += 2; // rake the oar-bank
  if (!ranged && ability === "deus_vult") s += 5; // the crusader's charge
  if (ranged && ability === "siege_volley" && defendsWalls(state, defender)) s += 5; // arcing fire onto the ramparts
  // Legend (hero) signature abilities (docs/UNIT-ABILITIES.md §9).
  if (!ranged && ability === "slay_the_beast") s += playerById(state, defender.ownerId)?.isBarbarian ? 6 : 1; // the hero's blow out of the Epic
  if (!ranged && ability === "pyramid_of_skulls") s += 4; // a conqueror's blow, struck to be seen
  if (ranged && ability === "basilica_bombard") s += defendsWalls(state, defender) ? 6 : 2; // the great bombard against the ramparts
  if (ranged && ability === "mountain_ambush" && attackerOnRough(state, unit)) s += 4; // loosed from the high passes
  if (ranged && ability === "winter_war" && attackerOnWinter(state, unit)) s += 4; // struck from the white silence
  if (!ranged && ability === "duel_of_kings") s += defenderCls === "cavalry" ? 6 : 2; // single combat between the beasts
  if (!ranged && ability === "gate_breaker") s += defendsWalls(state, defender) ? 5 : 1; // drive the beast at the gate
  if (!ranged && ability === "highland_charge") s += attackerOnRough(state, unit) ? 4 : 1; // striking downhill
  if (!ranged && ability === "qamargah") s += isWeakened(state, defender) ? 5 : 1; // the circle closes on the weak
  if (ability === "nerge") s += friendliesBeside(state, unit, defender) >= 2 ? 5 : 1; // the ring is closed — lance or arrow alike
  if (!ranged && ability === "wolf_pack") s += cavalryBeside(state, unit, defender) ? 3 : 0; // the pack hunts together
  if (ranged && ability === "steady_volley" && unit.movementLeft >= UNIT_DEFS[unit.type].movement) s += 4; // planted feet, level barrels
  if (ranged && ability === "camel_panic" && defenderCls === "cavalry") s += 4; // horses bolt at the smell
  if (!ranged && ability === "flower_war") s += 2; // fighting for captives, not corpses
  if (!ranged && ability === "mourning_war") s += 2; // a raid to replace the fallen
  if (!ranged && ability === "obsidian_reap") s += 1; // volcanic glass (armor bypass below)
  if (!ranged && ability === "leiomano") s += 2; // the shark-tooth club tears
  if (!ranged && ability === "beach_assault" && unit.embarked) s += 5; // storming out of the surf
  if (ranged && ability === "bolas") s *= 0.7; // thrown to entangle, not to kill
  if (ranged && ability === "hornet_bomb") s *= 0.6; // the wasps do the real work
  if (ranged && ability === "poisoned_arrows") s *= 0.8; // a lighter shot — the venom does the rest
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
  if (has(unit, "discipline")) s += 2 * Math.min(4, friendliesWithin(state, unit, 2));
  if (has(unit, "flanking")) s += 2 * Math.min(4, friendliesWithin(state, unit, 2));
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

  // Maimed (Aimed Shot): a wounded arm strikes weaker.
  if (unit.maimedUntilTurn !== undefined && state.turn <= unit.maimedUntilTurn) s *= 0.75;

  return s * woundFactor(unit.hp, unitMaxHp(unit)) * moraleAttackMultiplier(unit);
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
  s += conditionalCombatBonus(state, unit, attacker); // civics: home/foreign/all-unit/other-religion
  s += typedCombatBonus(state, unit, vsRanged);
  s += legendCombatBonus(state, unit); // hero strength + adjacent-hero aura
  s += religionUnitCombatBonus(state, unit); // faith-tier strength + religious auras
  if (unit.cursedUntilTurn !== undefined && state.turn <= unit.cursedUntilTurn) s -= unit.cursedPenalty ?? 3;

  // Stance defensive multipliers.
  let stanceMult = 1;
  if (unit.stance === "brace") stanceMult = attackerCls === "cavalry" ? 1.4 : 1.25;
  else if (unit.stance === "shield_wall" || unit.stance === "othismos") {
    stanceMult = Math.min(1.45, 1.15 + 0.1 * adjacentInfantry(state, unit));
  } else if (unit.stance === "stone_bulwark") stanceMult = 1.25;
  else if (unit.stance === "zareba") stanceMult = attackerCls === "cavalry" ? 1.45 : 1.25;
  else if (unit.stance === "iron_wall") stanceMult = 1.35;
  else if (unit.stance === "wagenburg") stanceMult = 1.4;
  else if (unit.stance === "schiltron") stanceMult = attackerCls === "cavalry" ? 1.5 : 1.3;
  else if (unit.stance === "elephant_wall") stanceMult = 1.25;
  else if (unit.stance === "turtle_shell") stanceMult = 1.3;
  else if (unit.stance === "last_stand") {
    // Spartan refusal: brace that sharpens as HP drops (up to +60% near death).
    const missing = 1 - unit.hp / unitMaxHp(unit);
    const base = attackerCls === "cavalry" ? 1.4 : 1.25;
    stanceMult = Math.min(1.6, base + 0.35 * missing);
  } else if (unit.stance === "testudo") stanceMult = vsRanged ? 1.5 : 0.9;
  else if (unit.stance === "pavise") stanceMult = vsRanged ? 1.5 : 1.0;
  else if (unit.stance === "emplace") stanceMult = 0.75;
  // A friendly Stone Bulwark or Elephant Wall on an adjacent tile shelters this unit too.
  if (unit.stance !== "stone_bulwark" && unit.stance !== "elephant_wall" && adjacentBulwark(state, unit)) stanceMult *= 1.15;
  // Sundered units defend weaker.
  if (unit.sunderedUntilTurn !== undefined && state.turn <= unit.sunderedUntilTurn) stanceMult *= 0.75;
  // Bushidō: a cornered Samurai fights all the harder.
  if (hasBushido(state, unit)) stanceMult *= 1.3;

  return Math.max(1, s) * stanceMult * woundFactor(unit.hp, unitMaxHp(unit)) * moraleDefenseMultiplier(unit);
}

/** Count the attacker's friendly units adjacent to the defender (Nerge). */
function friendliesBeside(state: GameState, attacker: Unit, defender: Unit): number {
  let count = 0;
  for (const u of state.units.values()) {
    if (u.ownerId !== attacker.ownerId || u.id === attacker.id) continue;
    if (dist(defender, u) === 1) count++;
  }
  return count;
}

/** True if one of the attacker's cavalry units stands beside the defender (Wolf Pack). */
function cavalryBeside(state: GameState, attacker: Unit, defender: Unit): boolean {
  for (const u of state.units.values()) {
    if (u.ownerId !== attacker.ownerId || u.id === attacker.id) continue;
    if (UNIT_DEFS[u.type].cls === "cavalry" && dist(defender, u) === 1) return true;
  }
  return false;
}

/** True if the target already carries a combat debuff (Qamargah). */
function isWeakened(state: GameState, unit: Unit): boolean {
  const active = (t?: number) => t !== undefined && state.turn <= t;
  return active(unit.sunderedUntilTurn) || active(unit.pinnedUntilTurn) || active(unit.maimedUntilTurn) ||
    active(unit.poisonedUntilTurn) || active(unit.routedUntilTurn);
}

/** True if the attacker fires from rough terrain (Mountain Ambush). */
function attackerOnRough(state: GameState, unit: Unit): boolean {
  const tile = getTile(state.map, unit.col, unit.row);
  return !!tile && isRough(tile.terrain);
}

/** True if the attacker fires from winter terrain (Winter War). */
function attackerOnWinter(state: GameState, unit: Unit): boolean {
  const t = getTile(state.map, unit.col, unit.row)?.terrain;
  return t === "tundra" || t === "taiga" || t === "snow";
}

/** Count friendly military units adjacent to `unit` (King of Battle). */
function adjacentFriendlyMilitary(state: GameState, unit: Unit): number {
  let count = 0;
  for (const u of state.units.values()) {
    if (u.ownerId !== unit.ownerId || u.id === unit.id) continue;
    if (UNIT_DEFS[u.type].strength > 0 && dist(unit, u) === 1) count++;
  }
  return count;
}

/** True if `unit` garrisons a city or holds a fortified tile (Siege Volley). */
function defendsWalls(state: GameState, unit: Unit): boolean {
  if (cityAt(state, unit.col, unit.row)) return true;
  const tile = getTile(state.map, unit.col, unit.row);
  return !!tile?.structure;
}

/** True if a friendly unit holding a wall stance (Stone Bulwark / Elephant Wall) stands adjacent. */
function adjacentBulwark(state: GameState, unit: Unit): boolean {
  for (const u of state.units.values()) {
    if (u.ownerId !== unit.ownerId || u.id === unit.id) continue;
    if ((u.stance === "stone_bulwark" || u.stance === "elephant_wall") && dist(unit, u) === 1) return true;
  }
  return false;
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
  s += legendCityDefenseBonus(state, city); // Qin Shi Huang's Great Wall

  // A Barracks fortifies its city — defense scales with the building's tier.
  const barracksTier = city.training.barracks ?? 0;
  if (barracksTier > 0) s += trainingTier("barracks", barracksTier).defense ?? 0;
  if (tile) s += terrainDefense(tile.terrain);
  s += playerEffects(state, city.ownerId).cityDefenseBonus ?? 0; // civics: Royal Garrisons, Divine Right
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

/** XP required for a unit to advance from `level` to the next one. */
export function unitXpForNextLevel(level: number): number {
  return 10 * level;
}

function awardXp(state: GameState, unit: Unit, amount: number): void {
  applyXp(unit, amount, playerEffects(state, unit.ownerId).xpGainPercent ?? 0);
}

function applyXp(unit: Unit, amount: number, xpGainPercent: number): void {
  const def = UNIT_DEFS[unit.type];
  if (def.cls === "settler" || def.cls === "trader") return;
  let mult = 1 + Math.max(0, xpGainPercent) / 100;
  if (has(unit, "veteran") || has(unit, "veteran_marksman")) mult += 0.25;
  unit.xp += Math.ceil(amount * mult);
  while (unit.xp >= unitXpForNextLevel(unit.level)) {
    unit.xp -= unitXpForNextLevel(unit.level);
    unit.level += 1;
    const newMax = unitMaxHp(unit);
    unit.hp = Math.min(newMax, unit.hp + Math.round(newMax * 0.2));
    if (PROMOTION_POOL[def.cls].length > 0) unit.unspentPromotions += 1;
  }
}

/** XP a scout earns per discovery (village / barb camp / natural wonder / new civ). */
export const SCOUT_DISCOVERY_XP = 3;

/** Grant XP to a unit from a non-combat source (e.g. scout reconnaissance
 *  discoveries). Mirrors combat awards: settlers/traders get none, veterans more. */
export function awardUnitXp(unit: Unit, amount: number): void {
  applyXp(unit, amount, 0);
}

/** Recon Escape: the unit's best dodge chance among its escape promotions (0 = none). */
export function scoutEscapeChance(unit: Unit): number {
  if (has(unit, "vanish")) return 0.95;
  if (has(unit, "slip_away")) return 0.75;
  if (has(unit, "evasion")) return 0.5;
  return 0;
}

/**
 * If `defender` is a scout that can still escape this turn, roll its Escape perk.
 * On success it dodges the blow entirely (no damage) and slips back one tile, and
 * spends its once-per-turn escape. Returns true if it escaped (the caller should
 * then finish the attacker's strike without applying damage). Hemmed-in scouts with
 * nowhere to retreat take the hit normally. Deterministic via the seeded RNG.
 */
function tryScoutEscape(state: GameState, attacker: Unit, defender: Unit): boolean {
  const chance = scoutEscapeChance(defender);
  if (chance <= 0 || defender.escapeUsedTurn === state.turn) return false;
  const rng = makeRng(`escape:${defender.id}:${state.turn}:${attacker.id}`);
  if (rng.next() >= chance) return false;
  if (!retreatOneStep(state, defender)) return false; // nowhere to flee — the blow lands
  defender.escapeUsedTurn = state.turn;
  const owner = playerById(state, defender.ownerId);
  log(state, `${unitDisplayName(state, defender)} (${owner?.name ?? "?"}) evaded the attack and slipped away.`, {
    targetIds: owner ? [owner.id] : undefined,
    tile: { col: defender.col, row: defender.row },
  });
  return true;
}

/** Promotions this unit could still take, gated by level tier and any chain prerequisite. */
export function availablePromotions(unit: Unit): PromotionId[] {
  const pool = PROMOTION_POOL[UNIT_DEFS[unit.type].cls];
  const maxTier = Math.max(1, unit.level - 1);
  return pool.filter((p) => {
    const def = PROMOTION_DEFS[p];
    if (unit.promotions.includes(p) || def.tier > maxTier) return false;
    if (def.prereq && !unit.promotions.includes(def.prereq)) return false;
    return true;
  });
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
    leaveRuin(state, city.col, city.row); // razed cities leave a ruin behind
    log(state, `Barbarians razed ${city.name}!`, {
      actorId: taker0?.id,
      targetIds: oldOwner ? [oldOwner.id] : undefined,
      tile: { col: city.col, row: city.row },
    });
    if (oldOwner && !oldOwner.isBarbarian) {
      emitCityLost(state, oldOwner.id, city.id, city.name, city.col, city.row);
    }
    applyVictoryCheck(state);
    if (oldOwner && !oldOwner.isBarbarian) {
      maybeCheckCivElimination(state, oldOwner.id, taker0?.id ?? attacker.ownerId, { col: city.col, row: city.row });
    }
    return;
  }

  city.ownerId = attacker.ownerId;
  city.production = null;
  city.autoMode = undefined; // a captured city reverts to its new owner's manual control
  const eff = playerEffects(state, attacker.ownerId);
  const popBonus = eff.captureCityPopulationBonus ?? 0;
  city.population = Math.max(1, city.population - 1 + popBonus);
  city.hp = Math.floor(cityMaxHp(city) / 2);
  city.isCapital = false;
  // Attacker advances into the captured city.
  attacker.col = city.col;
  attacker.row = city.row;
  const taker = playerById(state, attacker.ownerId);
  if (taker) taker.citiesCaptured = (taker.citiesCaptured ?? 0) + 1;
  // Civics: a captured city may immediately adopt the conqueror's faith (Holy Conquest).
  if (eff.convertOnCapture) convertCityToPlayerReligion(state, city, attacker.ownerId);
  log(state, `${taker?.name ?? "Someone"} captured ${city.name}${oldOwner ? ` from ${oldOwner.name}` : ""}.`, {
    actorId: attacker.ownerId,
    targetIds: oldOwner ? [oldOwner.id] : undefined,
    tile: { col: city.col, row: city.row },
  });
  if (oldOwner && !oldOwner.isBarbarian) {
    emitCityLost(state, oldOwner.id, city.id, city.name, city.col, city.row);
  }
  extendLegendsOnTrigger(state, attacker.ownerId, "city_capture");
  applyVictoryCheck(state);
  if (oldOwner && !oldOwner.isBarbarian) {
    maybeCheckCivElimination(state, oldOwner.id, attacker.ownerId, { col: city.col, row: city.row });
  }
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
  // The Ahimsa Ascetic (and any pacifist kit) refuses violence outright.
  if (religionUnitKit(attacker.type)?.passives.cannotAttack) return { ok: false, error: "this unit refuses violence" };
  if (attacker.attackedThisTurn || attacker.movementLeft <= 0) return { ok: false, error: "no attack available" };
  // Beach Assault is the one strike an embarked unit can make: storming ashore.
  if (attacker.embarked && ability !== "beach_assault") return { ok: false, error: "embarked units cannot attack" };

  // Striking from concealment springs the ambush: reveal and arm the attacker.
  breakCover(state, attacker);

  const attackerOwner = playerById(state, attacker.ownerId)!;
  const attackerNaval = isNavalUnit(attacker);
  // Fire Lance turns a melee unit's strike into a ranged volley for that shot.
  const ranged = isRanged(def) || ability === "fire_lance" || ability === "broadside" || ability === "howdah_volley" || ability === "double_ballista";

  // Gunpowder weapons can only fire a charged shot — they reload (and cannot
  // fire) on the turn after firing. See healAndReset for the reload tick.
  if (ranged && def.gunpowder && (!attacker.loaded || attacker.reloading)) {
    return { ok: false, error: attacker.reloading ? "reloading this turn" : "needs to reload" };
  }
  let range = (ranged ? def.range ?? 1 : 1) +
    (has(attacker, "extended_range") ? 1 : 0) +
    (ranged && has(attacker, "extended_range_naval") ? 1 : 0);
  if (ranged && attacker.stance === "emplace") range += 1; // emplaced engines reach further
  if (ability === "pierce") range = Math.max(1, range - 1); // careful aimed bolt, shorter
  if (ability === "arrow_storm") range += 1; // a long massed volley
  if (ability === "fire_lance") range += 1; // the lance reaches a tile beyond a melee thrust
  if (ability === "basilica_bombard") range += 1; // the great bombard outranges every other engine
  if (ability === "double_ballista") range = 2; // the elephant-back ballista outranges a thrust
  if (ability === "howdah_volley") range = Math.max(1, range); // bows from the howdah strike adjacent
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
      const rs = ability === "fire_lance" ? def.strength + FIRE_LANCE_BONUS
        : ability === "broadside" ? (def.rangedStrength ?? def.strength)
        : ability === "howdah_volley" ? Math.max(4, def.strength - 4)
        : ability === "double_ballista" ? Math.max(4, def.strength - 2)
        : def.rangedStrength ?? 0;
      const base = rs * levelMultiplier(attacker) * woundFactor(attacker.hp, unitMaxHp(attacker));
      let attEff = (base + cityAttackBonus(attacker)) * mult;
      if (def.cls === "siege" && eff.siegeVsCityDefenseMultiplier) {
        attEff *= 1 + eff.siegeVsCityDefenseMultiplier / 100;
      }
      enemyCity.hp = Math.max(0, enemyCity.hp - damageFrom(attEff, cityDef));
      awardXp(state, attacker, 3);
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
        if (ability === "deus_vult") attEff += 8; // God wills the walls down
        if (def.cls === "siege" && eff.siegeVsCityDefenseMultiplier) {
          attEff *= 1 + eff.siegeVsCityDefenseMultiplier / 100;
        }
        enemyCity.hp = Math.max(0, enemyCity.hp - damageFrom(attEff, cityDef));
        attacker.hp -= Math.round(damageFrom(cityDef, attEff) * (ability === "siege_assault" ? 0.5 : 1)); // the tower shelters its crew
        awardXp(state, attacker, 4);
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

    // A scout may dodge the blow and slip away (once per turn) before it lands.
    if (tryScoutEscape(state, attacker, enemyUnit)) {
      finishAttack(state, attacker);
      return { ok: true };
    }

    if (ranged) {
      const attEff = attackStrength(state, attacker, enemyUnit, targetTile.terrain, true, ability);
      let defEff = defenseStrength(state, enemyUnit, attacker, true);
      if (ability === "pierce") defEff = Math.max(1, defEff - 6); // armor-piercing bolt
      if (ability === "aimed_shot") defEff = Math.max(1, defEff - 4); // the marksman finds the gap
      if (ability === "zagros_shot") defEff = Math.max(1, defEff - 4); // a heavy highland shaft
      enemyUnit.hp -= damageFrom(attEff, defEff);
      awardXp(state, attacker, 3);
      awardXp(state, enemyUnit, 2);
      if (ability === "sunder") enemyUnit.sunderedUntilTurn = state.turn + 1;
      if (ability === "aimed_shot" && enemyUnit.hp > 0) enemyUnit.maimedUntilTurn = state.turn + 1;
      if (ability === "poisoned_arrows" && enemyUnit.hp > 0) enemyUnit.poisonedUntilTurn = state.turn + 2;
      if (ability === "broadside" && enemyUnit.hp > 0) enemyUnit.sunderedUntilTurn = state.turn + 1; // rigging wrecked
      if (ability === "stone_hail" && enemyUnit.hp > 0) enemyUnit.sunderedUntilTurn = state.turn + 1; // shields cracked
      if ((ability === "bolas" || ability === "hornet_bomb") && enemyUnit.hp > 0) enemyUnit.pinnedUntilTurn = state.turn + 1; // entangled / swarmed
      if (enemyUnit.hp <= 0) {
        killUnit(state, enemyUnit, { victorOwnerId: attacker.ownerId });
        onEnemyDefeated(state, attacker, enemyUnit); // the marksman and nearby allies rally
        harvestFaithOnKill(state, attacker); // Zealotry / Ghazi / Eagle Priest &c.
      } else {
        maybeRoute(state, enemyUnit); // a unit under fire may break
      }
    } else {
      const attEff = attackStrength(state, attacker, enemyUnit, targetTile.terrain, false, ability);
      let defEff = defenseStrength(state, enemyUnit, attacker, false);
      if (ability === "pierce") defEff = Math.max(1, defEff - 6);
      if (ability === "falx_reap" || ability === "obsidian_reap") defEff = Math.max(1, defEff - 6); // the blade reaches past armor
      enemyUnit.hp -= damageFrom(attEff, defEff);
      if ((ability === "sunder" || ability === "greek_fire") && enemyUnit.hp > 0) enemyUnit.sunderedUntilTurn = state.turn + 1;
      if (ability === "harry" && enemyUnit.hp > 0) enemyUnit.pinnedUntilTurn = state.turn + 1;
      if (ability === "zweihander" && enemyUnit.hp > 0) enemyUnit.stance = null; // the pike hedge is broken open
      if (ability === "shear_oars" && enemyUnit.hp > 0) enemyUnit.pinnedUntilTurn = state.turn + 1; // crippled in the water
      if (ability === "leiomano" && enemyUnit.hp > 0) enemyUnit.poisonedUntilTurn = state.turn + 2; // torn flesh keeps bleeding
      let retaliation = damageFrom(defEff, attEff);
      if (has(attacker, "suppression")) retaliation = Math.max(0, retaliation - 3);
      // Charging onto braced spears is punished with heavier retaliation.
      const defenderBraced = enemyUnit.stance === "brace" || enemyUnit.stance === "shield_wall" || enemyUnit.stance === "othismos" || enemyUnit.stance === "last_stand";
      if ((ability === "charge" || ability === "shock_charge" || ability === "war_cart_charge") && defenderBraced) retaliation = Math.round(retaliation * 1.25);
      // A drilled charge is executed too cleanly to answer.
      if (ability === "drilled_charge") retaliation = 0;
      // The three-man chariot's shield-bearer wards off half the reply.
      if (ability === "kadesh_charge") retaliation = Math.round(retaliation / 2);
      // Storming a zareba means wading through the thorns first.
      if (enemyUnit.stance === "zareba") attacker.hp -= 6;
      // Cavalry breaking on a schiltron bleed on the spear points.
      if (enemyUnit.stance === "schiltron" && UNIT_DEFS[attacker.type].cls === "cavalry") attacker.hp -= 5;
      // Boarders die on the turtle ship's spiked roof.
      if (enemyUnit.stance === "turtle_shell") attacker.hp -= 8;
      attacker.hp -= retaliation;
      // Striking a serene or nonviolent holy figure shames the attacker.
      const thornKit = religionUnitKit(enemyUnit.type);
      if (thornKit?.passives.thornMorale) {
        changeUnitMorale(attacker, -unitPassive(state, enemyUnit, thornKit, thornKit.passives.thornMorale));
      }
      awardXp(state, attacker, 4);
      awardXp(state, enemyUnit, 4);
      const defenderDead = enemyUnit.hp <= 0;
      const attackerDead = attacker.hp <= 0;
      if (defenderDead) {
        killUnit(state, enemyUnit, { victorOwnerId: attacker.ownerId });
        onEnemyDefeated(state, attacker, enemyUnit); // the victor and nearby allies rally
        harvestFaithOnKill(state, attacker); // Zealotry / Ghazi / Eagle Priest &c.
        if (!attackerDead) {
          let heal = 0;
          if (has(attacker, "bloodlust")) heal += 12;
          if (has(attacker, "forager")) heal += 8;
          if (heal > 0) attacker.hp = Math.min(unitMaxHp(attacker), attacker.hp + heal);
        }
      } else {
        maybeRoute(state, enemyUnit); // a battered defender may break and flee
      }
      if (attackerDead) {
        killUnit(state, attacker, { victorOwnerId: enemyUnit.ownerId });
        return { ok: true };
      }
      if (defenderDead && !cityAt(state, col, row) && !unitAt(state, col, row) && !targetTile.structure) {
        // Naval melee ships only advance onto water tiles; they cannot beach onto land.
        if (!attackerNaval || isWaterTerrain(targetTile.terrain)) {
          attacker.col = col; // advance into vacated tile
          attacker.row = row;
          onUnitEnter(state, attacker); // resolve any feature (barb camp / village) on the captured tile
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
      awardXp(state, attacker, 3);
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
        killUnit(state, attacker, { victorOwnerId: sCity.ownerId });
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
      log(state, `A tower bombarded ${unitDisplayName(state, target)} for ${dmg}.`, {
        actorId: playerId,
        targetIds: [target.ownerId],
        tile: { col: target.col, row: target.row },
      });
      if (target.hp <= 0) killUnit(state, target, { victorOwnerId: playerId });
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

/** How far a city can throw a bombardment — enough to hit an enemy at its gates
 *  or one tile beyond. */
export const CITY_BOMBARD_RANGE = 2;

/** The attack strength a city bombards with: half its defensive strength, so a
 *  walled, garrisoned, or populous city hits meaningfully harder. */
export function cityBombardStrength(state: GameState, city: City): number {
  return Math.max(1, Math.round(cityDefenseStrength(state, city) * 0.5));
}

/** Enemy units this city could bombard right now (in range and at war). Used by the
 *  client to offer targets and to enable/disable the bombard button. */
export function cityBombardTargets(state: GameState, city: City): Unit[] {
  const owner = playerById(state, city.ownerId);
  if (!owner) return [];
  const out: Unit[] = [];
  for (const u of state.units.values()) {
    const uo = playerById(state, u.ownerId);
    if (!uo || !areEnemies(owner, uo)) continue;
    if (dist({ col: city.col, row: city.row }, u) > CITY_BOMBARD_RANGE) continue;
    out.push(u);
  }
  return out;
}

/**
 * Manual city bombardment: one strength-scaled ranged hit per turn on a nearby
 * enemy unit. Player-triggered only (never automatic) — wired to the cityBombard
 * command and the bombard button on the city panel. The city takes no retaliation.
 */
export function cityBombard(
  state: GameState,
  playerId: number,
  cityId: number,
  col: number,
  row: number,
): { ok: boolean; error?: string } {
  const city = state.cities.get(cityId);
  if (!city) return { ok: false, error: "no such city" };
  if (city.ownerId !== playerId) return { ok: false, error: "not your city" };
  if (city.rangedAttackUsed) return { ok: false, error: "this city has already bombarded this turn" };
  const owner = playerById(state, playerId);
  const target = unitAt(state, col, row);
  if (!target) return { ok: false, error: "no unit to bombard there" };
  const to = playerById(state, target.ownerId);
  if (!owner || !to || !areEnemies(owner, to)) return { ok: false, error: "not an enemy unit" };
  if (dist({ col: city.col, row: city.row }, target) > CITY_BOMBARD_RANGE) return { ok: false, error: "target out of range" };
  const dmg = damageFrom(cityBombardStrength(state, city), defenseStrengthVsBombard(state, target));
  target.hp -= dmg;
  city.rangedAttackUsed = true;
  log(state, `${city.name} bombarded ${unitDisplayName(state, target)} for ${dmg}.`, {
    actorId: playerId,
    targetIds: [target.ownerId],
    tile: { col: target.col, row: target.row },
  });
  if (target.hp <= 0) killUnit(state, target, { victorOwnerId: playerId });
  return { ok: true };
}

export function killUnit(state: GameState, unit: Unit, _opts?: { victorOwnerId?: number }): void {
  if (isNavalUnit(unit)) scuttleShipCargo(state, unit.id, killUnit);
  religionRitesOnDeath(state, unit); // mortuary harvests + Valhalla rallies (before removal)
  onUnitLost(state, unit); // nearby friendlies waver + global morale drops (before removal)
  const wasLegend = !!unit.legendId;
  const legendTile = { col: unit.col, row: unit.row };
  state.units.delete(unit.id);
  const owner = playerById(state, unit.ownerId);
  const name = unitDisplayName(state, unit);
  // A slain Legend may be honoured with faith by its owner's wonder (Great Pyramid).
  if (wasLegend) grantLegendDeathFaith(state, unit.ownerId, legendTile);
  log(state, `${name} (${owner?.name ?? "?"}) was destroyed.`, {
    targetIds: owner ? [owner.id] : undefined,
    tile: { col: unit.col, row: unit.row },
  });
  if (owner && !owner.isBarbarian) {
    emitUnitDied(state, owner.id, unit.id, name, unit.col, unit.row);
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
  awardXp(state, hider, 4);
  awardXp(state, intruder, 2);
  if (intruder.hp <= 0) killUnit(state, intruder, { victorOwnerId: hider.ownerId });
}

/** A melee sweep hit at `factor` of full strength drawing no retaliation (Chakkar). */
export function sweepMeleeDamage(state: GameState, attacker: Unit, target: Unit, factor: number): void {
  const tile = getTile(state.map, target.col, target.row);
  if (!tile) return;
  const attEff = attackStrength(state, attacker, target, tile.terrain, false, undefined) * factor;
  const defEff = defenseStrength(state, target, attacker, false);
  target.hp -= damageFrom(attEff, defEff);
  awardXp(state, attacker, 2);
  if (target.hp <= 0) {
    killUnit(state, target, { victorOwnerId: attacker.ownerId });
    onEnemyDefeated(state, attacker, target);
    harvestFaithOnKill(state, attacker);
  }
}

/** An extra ranged hit at `factor` of full strength (Repeating Fire 2nd shot, Arrow Storm splash). */
export function secondaryRangedDamage(state: GameState, attacker: Unit, target: Unit, factor: number): void {
  const tile = getTile(state.map, target.col, target.row);
  if (!tile) return;
  const attEff = attackStrength(state, attacker, target, tile.terrain, true, undefined) * factor;
  const defEff = defenseStrength(state, target, attacker, true);
  target.hp -= damageFrom(attEff, defEff);
  awardXp(state, attacker, 1);
  if (target.hp <= 0) killUnit(state, target, { victorOwnerId: attacker.ownerId });
}

function finishAttack(state: GameState, attacker: Unit): void {
  if (!state.units.has(attacker.id)) return;
  attacker.attackedThisTurn = true;
  attacker.movementLeft = 0;
  // A gunpowder shot spends its charge; the unit must reload next turn.
  const def = UNIT_DEFS[attacker.type];
  if (def.gunpowder && isRanged(def)) attacker.loaded = false;
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
  // A gunpowder weapon with no loaded charge (mid-reload) cannot fire this turn.
  if (def.gunpowder && isRanged(def) && (!unit.loaded || unit.reloading)) return out;
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
    // Gunpowder reload tick: an empty weapon spends this turn reloading (it
    // becomes loaded but cannot fire until next turn); a loaded one is ready.
    if (UNIT_DEFS[u.type].gunpowder) {
      if (!u.loaded) {
        u.loaded = true;
        u.reloading = true;
      } else {
        u.reloading = false;
      }
    }
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
    if ((eff.homeHealBonus ?? 0) !== 0 && tileOwnerId(state, u.col, u.row) === player.id) heal += eff.homeHealBonus!;
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
  tickReligionUnitAuras(state, player);
}

// ---- religion unique-unit hooks (kits live in religion-units.ts) -----------

/** Faith harvested when `killer` fells an enemy: empire-wide faith-on-kill
 *  effects (Zealotry, the Aztec preset) plus the killer's own kit (Ghazi,
 *  Eagle Priest, Templar). Called right after onEnemyDefeated. */
function harvestFaithOnKill(state: GameState, killer: Unit): void {
  const owner = playerById(state, killer.ownerId);
  if (!owner || owner.isBarbarian) return;
  const eff = playerEffects(state, owner.id);
  let faith = eff.faithOnKill ?? 0;
  const kit = religionUnitKit(killer.type);
  if (kit?.passives.faithOnKillSelf) faith += unitPassive(state, killer, kit, kit.passives.faithOnKillSelf);
  if (faith > 0) owner.faith += faith;
  // Civics: culture harvested per kill (Spoils of War, Holy War).
  const culture = eff.cultureOnKill ?? 0;
  if (culture > 0) owner.cultureProgress += culture;
}

/** Death rites around a falling unit: mortuary kits harvest faith from ANY
 *  adjacent death, and death-rally kits (Valhalla) turn a fallen comrade into
 *  fresh resolve. Runs while the dying unit is still on the map. */
function religionRitesOnDeath(state: GameState, dead: Unit): void {
  for (const u of state.units.values()) {
    if (u.id === dead.id) continue;
    const kit = religionUnitKit(u.type);
    if (!kit || dist(u, dead) !== 1) continue;
    const keeper = playerById(state, u.ownerId);
    if (kit.passives.faithOnNearbyDeath && keeper && !keeper.isBarbarian) {
      keeper.faith += unitPassive(state, u, kit, kit.passives.faithOnNearbyDeath);
    }
    if (kit.passives.deathRally && u.ownerId === dead.ownerId) {
      const rally = unitPassive(state, u, kit, kit.passives.deathRally);
      changeUnitMorale(u, rally);
      for (const f of state.units.values()) {
        if (f.id === u.id || f.id === dead.id || f.ownerId !== u.ownerId) continue;
        if (dist(u, f) === 1) changeUnitMorale(f, rally);
      }
    }
  }
}

/** Per-turn powers of `player`'s religion unique units: healing/morale/XP/move
 *  auras on adjacent allies, dread on adjacent enemies, ambient pressure into
 *  nearby cities, and garrison boons in follower cities. Runs from healAndReset
 *  (after movement refresh, so movement auras persist through the turn). */
function tickReligionUnitAuras(state: GameState, player: Player): void {
  for (const u of [...state.units.values()]) {
    if (u.ownerId !== player.id) continue;
    const kit = religionUnitKit(u.type);
    if (!kit) continue;
    const p = kit.passives;
    const healN = unitPassive(state, u, kit, p.healAura);
    const moraleN = unitPassive(state, u, kit, p.moraleAura);
    const xpN = unitPassive(state, u, kit, p.xpAura);
    const moveN = unitPassive(state, u, kit, p.moveAura);
    const enemyMoraleN = unitPassive(state, u, kit, p.enemyMoraleAura);
    if (healN || moraleN || xpN || moveN || enemyMoraleN) {
      for (const other of state.units.values()) {
        if (other.id === u.id || dist(u, other) !== 1) continue;
        if (other.ownerId === player.id) {
          if (healN) other.hp = Math.min(unitMaxHp(other), other.hp + healN);
          if (moraleN) changeUnitMorale(other, moraleN);
          if (xpN) awardXp(state, other, xpN);
          if (moveN) other.movementLeft += moveN;
        } else if (enemyMoraleN) {
          const otherOwner = playerById(state, other.ownerId);
          if (otherOwner && areEnemies(player, otherOwner)) changeUnitMorale(other, -enemyMoraleN);
        }
      }
    }
    // The faith seeps outward from its holy servants (cities within 2 tiles).
    if (p.pressureAura) {
      const rel = religionInstanceForDefId(state, UNIT_DEFS[u.type].religionUnit);
      if (rel) {
        const amt = unitPassive(state, u, kit, p.pressureAura);
        for (const c of state.cities.values()) {
          if (dist(u, c) > 2) continue;
          c.religionPressure ??= {};
          c.religionPressure[rel.id] = (c.religionPressure[rel.id] ?? 0) + amt;
        }
      }
    }
    // Garrison boons only flow in a city that actually keeps the faith.
    if (p.goldGarrisoned || p.cultureGarrisoned) {
      const city = cityAt(state, u.col, u.row);
      const rel = religionInstanceForDefId(state, UNIT_DEFS[u.type].religionUnit);
      if (city && city.ownerId === player.id && rel && cityMajorityFaith(city) === rel.id) {
        if (p.goldGarrisoned) player.gold += unitPassive(state, u, kit, p.goldGarrisoned);
        if (p.cultureGarrisoned) {
          const culture = unitPassive(state, u, kit, p.cultureGarrisoned);
          player.cultureProgress += culture;
          player.cultureLifetime = (player.cultureLifetime ?? 0) + culture;
        }
      }
    }
  }
}
