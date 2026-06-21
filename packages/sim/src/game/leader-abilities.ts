// Active leader abilities (docs/LEADER-ABILITIES.md).

import type { CivEffects, GreatPersonClass } from "@roc/data";
import { getTile } from "@roc/shared";
import type { GameState, Player, City } from "./state";
import { citiesOf, log, makeUnit, unitAt, unitsOf } from "./state";
import { offsetNeighbors, isCoastalLand } from "./movement";
import { UNIT_DEFS, TECH_DEFS, type TechId, type UnitTypeId } from "./content";
import { getCivic } from "./civs";
import {
  startingUnitMorale,
  adjustGlobalMorale,
  changeUnitMorale,
  globalMoraleOf,
  recordMoraleEvent,
  recordMoraleGain,
} from "./morale";

export interface LeaderAbilityResult {
  ok: boolean;
  error?: string;
}

export interface LeaderAbilityDef {
  id: string;
  name: string;
  /** Player-facing summary of the active ability's effect (benefit + cost),
   *  kept in step with `use`. Surfaced in the civ picker and wiki. */
  desc: string;
  unlock: { kind: "tech"; id: TechId } | { kind: "civic"; id: string };
  cooldown: number;
  use: (state: GameState, player: Player) => LeaderAbilityResult;
}

const ok = (): LeaderAbilityResult => ({ ok: true });
const fail = (error: string): LeaderAbilityResult => ({ ok: false, error });

export function leaderAbilityUnlocked(state: GameState, player: Player, def: LeaderAbilityDef): boolean {
  if (def.unlock.kind === "tech") return player.researched.has(def.unlock.id);
  return player.civicsResearched.has(def.unlock.id);
}

export function leaderAbilityCooldownRemaining(state: GameState, player: Player, def: LeaderAbilityDef): number {
  return Math.max(0, def.cooldown - (state.turn - player.leaderAbilityLastUsedTurn));
}

function capitalOf(state: GameState, player: Player): City | undefined {
  return citiesOf(state, player.id).find((c) => c.isCapital);
}

function cityCount(state: GameState, player: Player): number {
  return citiesOf(state, player.id).length;
}

function freeSpawnTiles(state: GameState, col: number, row: number, count: number, wantsWater = false): { col: number; row: number }[] {
  const out: { col: number; row: number }[] = [];
  if (!unitAt(state, col, row)) {
    const tile = getTile(state.map, col, row);
    if (tile && tile.terrain !== "mountains") {
      if (wantsWater) {
        if (tile.terrain === "coast" || tile.terrain === "lake" || tile.terrain === "ocean") out.push({ col, row });
      } else {
        out.push({ col, row });
      }
    }
  }
  for (const n of offsetNeighbors(state.map, col, row)) {
    if (out.length >= count) break;
    if (unitAt(state, n.col, n.row)) continue;
    const tile = getTile(state.map, n.col, n.row);
    if (!tile || tile.terrain === "mountains") continue;
    if (wantsWater) {
      if (tile.terrain === "coast" || tile.terrain === "lake" || tile.terrain === "ocean") out.push(n);
    } else {
      out.push(n);
    }
  }
  return out;
}

function spawnNearCapital(state: GameState, player: Player, type: UnitTypeId, count: number, wantsWater = false): void {
  const capital = capitalOf(state, player);
  if (!capital) return;
  const tiles = freeSpawnTiles(state, capital.col, capital.row, count, wantsWater);
  for (const t of tiles) {
    const id = state.nextEntityId++;
    const u = makeUnit(id, player.id, type, t.col, t.row, 0, startingUnitMorale(state, player.id));
    u.movementLeft = UNIT_DEFS[type].movement;
    state.units.set(id, u);
  }
}

function spawnInCoastalCities(state: GameState, player: Player, type: UnitTypeId, count: number): void {
  const coastal = citiesOf(state, player.id).filter((c) => isCoastalLand(state, c.col, c.row));
  let spawned = 0;
  for (const city of coastal) {
    if (spawned >= count) break;
    const tiles = freeSpawnTiles(state, city.col, city.row, 1, true);
    if (tiles.length === 0) continue;
    const t = tiles[0]!;
    const id = state.nextEntityId++;
    const u = makeUnit(id, player.id, type, t.col, t.row, 0, startingUnitMorale(state, player.id));
    u.movementLeft = UNIT_DEFS[type].movement;
    state.units.set(id, u);
    spawned++;
  }
}

function removePopulation(state: GameState, player: Player, amount: number): void {
  let left = amount;
  const capital = capitalOf(state, player);
  if (capital && capital.population > 1) {
    const take = Math.min(left, capital.population - 1);
    capital.population -= take;
    left -= take;
  }
  for (const c of citiesOf(state, player.id)) {
    if (left <= 0) break;
    if (c.population <= 1) continue;
    const take = Math.min(left, c.population - 1);
    c.population -= take;
    left -= take;
  }
}

function addPlayerModifier(state: GameState, player: Player, source: string, effect: Partial<CivEffects>, duration: number): void {
  player.modifiers.push({ source, effect, expiresOnTurn: state.turn + duration });
}

function addCityModifier(state: GameState, city: City, source: string, effect: Partial<CivEffects>, duration: number): void {
  city.modifiers.push({ source, effect, expiresOnTurn: state.turn + duration });
}

function allCitiesModifier(state: GameState, player: Player, source: string, effect: Partial<CivEffects>, duration: number): void {
  for (const c of citiesOf(state, player.id)) addCityModifier(state, c, source, effect, duration);
}

function citiesWhere(state: GameState, player: Player, predicate: (c: City) => boolean, source: string, effect: Partial<CivEffects>, duration: number): void {
  for (const c of citiesOf(state, player.id)) {
    if (predicate(c)) addCityModifier(state, c, source, effect, duration);
  }
}

function citiesExceptWhere(state: GameState, player: Player, predicate: (c: City) => boolean, source: string, effect: Partial<CivEffects>, duration: number): void {
  for (const c of citiesOf(state, player.id)) {
    if (!predicate(c)) addCityModifier(state, c, source, effect, duration);
  }
}

function finishCurrentCivic(state: GameState, player: Player): void {
  if (!player.researchingCivic) return;
  const def = getCivic(player.researchingCivic);
  if (!def) return;
  player.cultureProgress = def.cost;
  player.civicsResearched.add(player.researchingCivic);
  log(state, `${player.name} completed ${def.name} through a leader ability.`, { actorId: player.id, targetIds: [player.id] });
  player.researchingCivic = null;
}

function stealRandomTech(state: GameState, player: Player): void {
  const enemies = state.players.filter((p) => p.id !== player.id && !p.isBarbarian && player.met.includes(p.id) && player.atWar.includes(p.id));
  const candidates = new Set<TechId>();
  for (const e of enemies) {
    for (const t of e.researched) {
      if (!player.researched.has(t)) candidates.add(t);
    }
  }
  const arr = [...candidates];
  if (arr.length === 0) return;
  const stolen = arr[Math.floor(Math.random() * arr.length)]!;
  player.researched.add(stolen);
  log(state, `${player.name} stole ${stolen} from a rival.`, { actorId: player.id, targetIds: [player.id] });
}

function consumeResource(state: GameState, player: Player, resource: string, amount: number): boolean {
  const have = player.resources[resource] ?? 0;
  if (have < amount) return false;
  player.resources[resource] = have - amount;
  return true;
}

// ---- morale / great-people helpers (now that those systems exist) ----------

/** Shift the player's empire-wide morale and log it for the morale dialog. A
 *  positive shift also resets the morale-decay grace timer. Used by abilities
 *  whose flavor is about national fervor or war-weariness. */
function shiftGlobalMorale(state: GameState, player: Player, delta: number, reason: string): void {
  const before = globalMoraleOf(player);
  adjustGlobalMorale(player, delta);
  recordMoraleEvent(state, player.id, before, reason);
  if (delta > 0) recordMoraleGain(state, player.id);
}

/** Apply a flat morale change to every one of the player's units (a martial
 *  fervor that steels — or, when negative, dampens — the whole army). */
function rallyUnits(state: GameState, player: Player, delta: number): void {
  for (const u of unitsOf(state, player.id)) changeUnitMorale(u, delta);
}

/** Grant great-person points toward a class — patronage/scholarship that draws
 *  great minds, hastening that class's next recruit (see great-people.ts). */
function grantGreatPersonPoints(player: Player, cls: GreatPersonClass, amount: number): void {
  player.greatPeoplePoints[cls] = (player.greatPeoplePoints[cls] ?? 0) + amount;
}

export const LEADER_ABILITIES: Record<string, LeaderAbilityDef> = {
  // Mesopotamia & the Near East
  sumer: {
    id: "sumer",
    name: "City of Uruk Levy",
    desc: "Spawn 2 War-Carts by the capital. Costs 2 capital population and 100 gold.",
    unlock: { kind: "tech", id: "the_wheel" },
    cooldown: 15,
    use: (state, player) => {
      const capital = capitalOf(state, player);
      if (!capital || capital.population < 2) return fail("capital needs 2 population");
      if (player.gold < 100) return fail("needs 100 gold");
      removePopulation(state, player, 2);
      player.gold -= 100;
      spawnNearCapital(state, player, "light_chariot", 2);
      log(state, `${player.name} levied the City of Uruk.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },
  akkad: {
    id: "akkad",
    name: "Sons of Sargon Mobilization",
    desc: "All cities +25% production for 10 turns, but −5% food.",
    unlock: { kind: "tech", id: "bronze_alloying" },
    cooldown: 20,
    use: (state, player) => {
      allCitiesModifier(state, player, "sons_of_sargon", { yieldPercent: { production: 25 } }, 10);
      allCitiesModifier(state, player, "sons_of_sargon_cost", { yieldPercent: { food: -5 } }, 10);
      log(state, `${player.name} mobilized the Sons of Sargon.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },
  babylon: {
    id: "babylon",
    name: "Code of Laws",
    desc: "Instantly finish your current civic and gain Great Statesman progress; −20% science for 5 turns.",
    unlock: { kind: "tech", id: "writing" },
    cooldown: 25,
    use: (state, player) => {
      finishCurrentCivic(state, player);
      grantGreatPersonPoints(player, "statesman", 50); // Hammurabi's lawgiving hastens a Great Statesman
      addPlayerModifier(state, player, "code_of_laws", { yieldPercent: { science: -20 } }, 5);
      log(state, `${player.name} proclaimed a Code of Laws.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },
  assyria: {
    id: "assyria",
    name: "Library of Nineveh",
    desc: "Steal a random technology from a rival you're at war with; −10% culture for 5 turns.",
    unlock: { kind: "tech", id: "iron_bloomery" },
    cooldown: 25,
    use: (state, player) => {
      stealRandomTech(state, player);
      allCitiesModifier(state, player, "library_of_nineveh", { yieldPercent: { culture: -10 } }, 5);
      log(state, `${player.name} looted the Library of Nineveh.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },
  hittites: {
    id: "hittites",
    name: "Iron of Hatti",
    desc: "Mines give +2 production for 10 turns, but −1 food each.",
    unlock: { kind: "tech", id: "iron_bloomery" },
    cooldown: 20,
    use: (state, player) => {
      addPlayerModifier(state, player, "iron_of_hatti", { mineTileProductionBonus: 2, mineTileFoodPenalty: 1 }, 10);
      log(state, `${player.name} harnessed the Iron of Hatti.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },
  elam: {
    id: "elam",
    name: "Chogha Zanbil Devotion",
    desc: "Capital +50% Wonder production and +10% faith for 10 turns; other cities −20% production.",
    unlock: { kind: "tech", id: "masonry" },
    cooldown: 25,
    use: (state, player) => {
      const capital = capitalOf(state, player);
      if (capital) addCityModifier(state, capital, "chogha_zanbil", { wonderProductionBonus: 50, yieldPercent: { faith: 10 } }, 10);
      citiesExceptWhere(state, player, (c) => c.isCapital, "chogha_zanbil_cost", { yieldPercent: { production: -20 } }, 10);
      log(state, `${player.name} devoted labor to Chogha Zanbil.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },
  phoenicia: {
    id: "phoenicia",
    name: "Colonial Expedition",
    desc: "Gain a free Settler and naval units +1 movement for 10 turns. Costs 2 capital population.",
    unlock: { kind: "tech", id: "sailing" },
    cooldown: 25,
    use: (state, player) => {
      const capital = capitalOf(state, player);
      if (!capital || capital.population < 2) return fail("capital needs 2 population");
      removePopulation(state, player, 2);
      spawnNearCapital(state, player, "settler", 1);
      addPlayerModifier(state, player, "colonial_expedition", { navalMovementBonus: 1 }, 10);
      log(state, `${player.name} launched a Colonial Expedition.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },
  lydia: {
    id: "lydia",
    name: "Debase the Stater",
    desc: "Instantly gain 300 gold; −15% gold in all cities for 10 turns.",
    unlock: { kind: "tech", id: "coinage" },
    cooldown: 20,
    use: (state, player) => {
      player.gold += 300;
      addPlayerModifier(state, player, "debase_the_stater", { yieldPercent: { gold: -15 } }, 10);
      log(state, `${player.name} debased the stater for instant gold.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },

  // Persia & Iran
  median_empire: {
    id: "median_empire",
    name: "Horse Lords' Levy",
    desc: "Spawn 2 Median Lancers by the capital. Costs 2 population and 3 horses.",
    unlock: { kind: "tech", id: "equestrian" },
    cooldown: 20,
    use: (state, player) => {
      const capital = capitalOf(state, player);
      if (!capital || capital.population < 2) return fail("capital needs 2 population");
      if (!consumeResource(state, player, "horses", 3)) return fail("needs 3 horses");
      removePopulation(state, player, 2);
      // cataphract is the base type the Median Lancer unique replaces.
      spawnNearCapital(state, player, "cataphract", 2);
      log(state, `${player.name} levied Horse Lords.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },
  persia: {
    id: "persia",
    name: "Satrapal Tribute",
    desc: "Instantly gain 200 gold; −15% production for 5 turns.",
    unlock: { kind: "civic", id: "statecraft" },
    cooldown: 25,
    use: (state, player) => {
      player.gold += 200;
      addPlayerModifier(state, player, "satrapal_tribute", { yieldPercent: { production: -15 } }, 5);
      log(state, `${player.name} collected Satrapal Tribute.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },
  parthia: {
    id: "parthia",
    name: "Parthian Shot",
    desc: "Cavalry +3 combat strength and +1 movement for 10 turns; melee −2 strength.",
    unlock: { kind: "tech", id: "equestrian" },
    cooldown: 20,
    use: (state, player) => {
      addPlayerModifier(state, player, "parthian_shot", { unitClassCombat: { cavalry: 3 }, cavalryMovementBonus: 1 }, 10);
      addPlayerModifier(state, player, "parthian_shot_cost", { unitClassCombat: { melee: -2 } }, 10);
      log(state, `${player.name} ordered the Parthian Shot.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },
  sassanid_persia: {
    id: "sassanid_persia",
    name: "Eranshahr Renovation",
    desc: "All cities +25% culture and +5% food for 10 turns; −20% gold.",
    unlock: { kind: "civic", id: "mysticism" },
    cooldown: 25,
    use: (state, player) => {
      allCitiesModifier(state, player, "eranshahr", { yieldPercent: { culture: 25, food: 5 } }, 10);
      allCitiesModifier(state, player, "eranshahr_cost", { yieldPercent: { gold: -20 } }, 10);
      log(state, `${player.name} began the Eranshahr Renovation.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },

  // Egypt & Africa
  egypt: {
    id: "egypt",
    name: "Monumental Building Spree",
    desc: "All cities +25% Wonder production for 10 turns. Costs up to 4 population.",
    unlock: { kind: "tech", id: "masonry" },
    cooldown: 25,
    use: (state, player) => {
      allCitiesModifier(state, player, "monumental_spree", { wonderProductionBonus: 25 }, 10);
      removePopulation(state, player, Math.min(cityCount(state, player), 4));
      log(state, `${player.name} began a Monumental Building Spree.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },
  kush_nubia: {
    id: "kush_nubia",
    name: "City of the Dead Rush",
    desc: "Desert cities +3 production and +2 faith for 10 turns; non-desert cities −10% food.",
    unlock: { kind: "tech", id: "masonry" },
    cooldown: 20,
    use: (state, player) => {
      citiesWhere(state, player, (c) => getTile(state.map, c.col, c.row)?.terrain === "desert", "city_of_the_dead", { desertCityYield: { production: 3, faith: 2 } }, 10);
      citiesExceptWhere(state, player, (c) => getTile(state.map, c.col, c.row)?.terrain === "desert", "city_of_the_dead_cost", { nonDesertCityFoodPercent: -10 }, 10);
      log(state, `${player.name} rushed the City of the Dead.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },
  carthage: {
    id: "carthage",
    name: "Alpine Crossing",
    desc: "Land units ignore rough terrain and +1 movement for 5 turns, but take 5 damage per turn.",
    unlock: { kind: "tech", id: "engineering" },
    cooldown: 20,
    use: (state, player) => {
      addPlayerModifier(state, player, "alpine_crossing", { ignoreRoughTerrain: true, landMovementBonus: 1 }, 5);
      addPlayerModifier(state, player, "alpine_crossing_cost", { unitHealPerTurn: -5 }, 5);
      log(state, `${player.name} ordered an Alpine Crossing.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },
  aksum: {
    id: "aksum",
    name: "Red Sea Trade Mission",
    desc: "Trade routes +5 gold and +2 faith for 10 turns; −15% gold in all cities.",
    unlock: { kind: "tech", id: "coinage" },
    cooldown: 25,
    use: (state, player) => {
      addPlayerModifier(state, player, "red_sea_trade", { tradeRouteGoldBonus: 5, tradeRouteFaithBonus: 2 }, 10);
      allCitiesModifier(state, player, "red_sea_trade_cost", { yieldPercent: { gold: -15 } }, 10);
      log(state, `${player.name} sent a Red Sea Trade Mission.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },
  ethiopia_zagwe: {
    id: "ethiopia_zagwe",
    name: "Rock-Hewn Pilgrimage",
    desc: "Gain 50 faith and all cities +10% faith for 10 turns; −15% production.",
    unlock: { kind: "civic", id: "mysticism" },
    cooldown: 20,
    use: (state, player) => {
      player.faith += 50;
      allCitiesModifier(state, player, "rock_hewn", { yieldPercent: { faith: 10 } }, 10);
      allCitiesModifier(state, player, "rock_hewn_cost", { yieldPercent: { production: -15 } }, 10);
      log(state, `${player.name} declared a Rock-Hewn Pilgrimage.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },
  mali: {
    id: "mali",
    name: "Hajj to Mecca",
    desc: "Gain 500 gold and +10% faith for 10 turns; −30% production and lose 1 population per city.",
    unlock: { kind: "civic", id: "mysticism" },
    cooldown: 30,
    use: (state, player) => {
      player.gold += 500;
      addPlayerModifier(state, player, "hajj", { yieldPercent: { faith: 10 } }, 10);
      allCitiesModifier(state, player, "hajj_cost", { yieldPercent: { production: -30 } }, 10);
      removePopulation(state, player, citiesOf(state, player.id).length);
      log(state, `${player.name} embarked on the Hajj to Mecca.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },
  ghana_empire: {
    id: "ghana_empire",
    name: "Gold of Wagadu",
    desc: "Instantly gain 300 gold; lose 100 science progress and −10% science for 10 turns.",
    unlock: { kind: "tech", id: "coinage" },
    cooldown: 20,
    use: (state, player) => {
      player.gold += 300;
      player.scienceProgress = Math.max(0, player.scienceProgress - 100);
      addPlayerModifier(state, player, "gold_of_wagadu", { yieldPercent: { science: -10 } }, 10);
      log(state, `${player.name} spent the Gold of Wagadu.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },
  songhai: {
    id: "songhai",
    name: "Timbuktu Scholarship",
    desc: "Gain 100 science, +25% science and Great Scientist progress for 5 turns; −30% gold.",
    unlock: { kind: "tech", id: "philosophy" },
    cooldown: 25,
    use: (state, player) => {
      player.scienceProgress += 100;
      addPlayerModifier(state, player, "timbuktu", { yieldPercent: { science: 25 } }, 5);
      grantGreatPersonPoints(player, "scientist", 50); // the madrasas of Timbuktu attract a Great Scientist
      addPlayerModifier(state, player, "timbuktu_cost", { yieldPercent: { gold: -30 } }, 5);
      log(state, `${player.name} funded Timbuktu Scholarship.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },
  great_zimbabwe: {
    id: "great_zimbabwe",
    name: "Cattle Drive",
    desc: "Pastures +2 gold and +1 food for 10 turns; −5% food in all cities.",
    unlock: { kind: "tech", id: "coinage" },
    cooldown: 20,
    use: (state, player) => {
      addPlayerModifier(state, player, "cattle_drive", { pastureTileGoldBonus: 2, pastureTileFoodBonus: 1 }, 10);
      allCitiesModifier(state, player, "cattle_drive_cost", { yieldPercent: { food: -5 } }, 10);
      log(state, `${player.name} began a Cattle Drive.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },
  kanem_bornu: {
    id: "kanem_bornu",
    name: "Trans-Saharan Caravan",
    desc: "Gain 250 gold and +1 trade-route capacity for 10 turns; land units −1 movement.",
    unlock: { kind: "civic", id: "trade_routes" },
    cooldown: 25,
    use: (state, player) => {
      player.gold += 250;
      addPlayerModifier(state, player, "trans_saharan", { tradeRouteCapacityBonus: 1 }, 10);
      addPlayerModifier(state, player, "trans_saharan_cost", { landMovementBonus: -1 }, 10);
      log(state, `${player.name} dispatched a Trans-Saharan Caravan.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },

  // Mediterranean & Europe
  minoans: {
    id: "minoans",
    name: "Thalassocratic Fleet",
    desc: "Spawn 2 Biremes in coastal cities and naval +1 movement for 10 turns. Costs 2 capital population.",
    unlock: { kind: "tech", id: "sailing" },
    cooldown: 20,
    use: (state, player) => {
      const capital = capitalOf(state, player);
      if (!capital || capital.population < 2) return fail("capital needs 2 population");
      removePopulation(state, player, 2);
      // galley is the base type the Minoan Bireme unique replaces.
      spawnInCoastalCities(state, player, "galley", 2);
      addPlayerModifier(state, player, "thalassocratic_fleet", { navalMovementBonus: 1 }, 10);
      log(state, `${player.name} launched a Thalassocratic Fleet.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },
  mycenaean_greece: {
    id: "mycenaean_greece",
    name: "Heroic Muster",
    desc: "Spawn 2 Spearmen and melee +2 strength for 10 turns. Costs 4 population.",
    unlock: { kind: "tech", id: "bronze_alloying" },
    cooldown: 20,
    use: (state, player) => {
      const capital = capitalOf(state, player);
      if (!capital || capital.population < 4) return fail("capital needs 4 population");
      removePopulation(state, player, 4);
      spawnNearCapital(state, player, "spearman", 2);
      addPlayerModifier(state, player, "heroic_muster", { unitClassCombat: { melee: 2 } }, 10);
      log(state, `${player.name} called a Heroic Muster.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },
  greece: {
    id: "greece",
    name: "Delian League Tribute",
    desc: "Gain 200 gold and +10% culture for 10 turns; −10% science.",
    unlock: { kind: "civic", id: "political_philosophy" },
    cooldown: 25,
    use: (state, player) => {
      player.gold += 200;
      addPlayerModifier(state, player, "delian_league", { yieldPercent: { culture: 10 } }, 10);
      addPlayerModifier(state, player, "delian_league_cost", { yieldPercent: { science: -10 } }, 10);
      log(state, `${player.name} collected Delian League Tribute.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },
  sparta: {
    id: "sparta",
    name: "Agoge Mobilization",
    desc: "All cities +10% production, melee +2 strength and +25 unit morale for 10 turns. Costs up to 3 population.",
    unlock: { kind: "tech", id: "iron_bloomery" },
    cooldown: 25,
    use: (state, player) => {
      allCitiesModifier(state, player, "agoge", { yieldPercent: { production: 10 } }, 10);
      addPlayerModifier(state, player, "agoge_combat", { unitClassCombat: { melee: 2 } }, 10);
      rallyUnits(state, player, 25); // a warrior society hardens every soldier's nerve
      removePopulation(state, player, Math.min(cityCount(state, player), 3));
      log(state, `${player.name} began Agoge Mobilization.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },
  macedon: {
    id: "macedon",
    name: "Hellenistic Campaign",
    desc: "All units +1 movement and +3 combat strength for 10 turns; −20% gold and −20% science.",
    unlock: { kind: "civic", id: "statecraft" },
    cooldown: 25,
    use: (state, player) => {
      addPlayerModifier(state, player, "hellenistic_campaign", { allUnitMovementBonus: 1, unitClassCombat: { melee: 3, cavalry: 3, ranged: 3 } }, 10);
      allCitiesModifier(state, player, "hellenistic_campaign_cost", { yieldPercent: { gold: -20, science: -20 } }, 10);
      log(state, `${player.name} began a Hellenistic Campaign.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },
  etruscans: {
    id: "etruscans",
    name: "Twelve Cities Congress",
    desc: "Gain 50 gold and +1 trade-route capacity for 10 turns; −10% production for 5 turns.",
    unlock: { kind: "tech", id: "coinage" },
    cooldown: 20,
    use: (state, player) => {
      player.gold += 50;
      addPlayerModifier(state, player, "twelve_cities", { tradeRouteCapacityBonus: 1 }, 10);
      allCitiesModifier(state, player, "twelve_cities_cost", { yieldPercent: { production: -10 } }, 5);
      log(state, `${player.name} convened the Twelve Cities Congress.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },
  rome: {
    id: "rome",
    name: "Citizen Levy",
    desc: "Spawn 3 Legionaries by the capital. Costs 6 population.",
    unlock: { kind: "tech", id: "iron_bloomery" },
    cooldown: 15,
    use: (state, player) => {
      const capital = capitalOf(state, player);
      if (!capital || capital.population < 6) return fail("capital needs 6 population");
      removePopulation(state, player, 6);
      // swordsman is the base type the Rome Legionary unique replaces.
      spawnNearCapital(state, player, "swordsman", 3);
      log(state, `${player.name} called a Citizen Levy.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },
  celts_gauls: {
    id: "celts_gauls",
    name: "Druidic Uprising",
    desc: "Forests +2 faith and units in forest +3 strength for 10 turns; −20% science.",
    unlock: { kind: "civic", id: "mysticism" },
    cooldown: 20,
    use: (state, player) => {
      addPlayerModifier(state, player, "druidic_uprising", { forestTileFaithBonus: 2, forestTileCombatBonus: 3 }, 10);
      allCitiesModifier(state, player, "druidic_uprising_cost", { yieldPercent: { science: -20 } }, 10);
      log(state, `${player.name} called a Druidic Uprising.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },
  byzantium: {
    id: "byzantium",
    name: "Corpus Juris Civilis",
    desc: "Instantly finish your current civic; +10% culture for 10 turns and −15% production for 5 turns.",
    unlock: { kind: "civic", id: "political_philosophy" },
    cooldown: 25,
    use: (state, player) => {
      finishCurrentCivic(state, player);
      allCitiesModifier(state, player, "corpus_juris", { yieldPercent: { culture: 10 } }, 10);
      allCitiesModifier(state, player, "corpus_juris_cost", { yieldPercent: { production: -15 } }, 5);
      log(state, `${player.name} proclaimed the Corpus Juris Civilis.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },
  norse: {
    id: "norse",
    name: "Viking Raid",
    desc: "Naval +2 movement, +50% coastal-raid gold and warships +2 strength for 10 turns; −10% production.",
    unlock: { kind: "tech", id: "sailing" },
    cooldown: 20,
    use: (state, player) => {
      addPlayerModifier(state, player, "viking_raid", { navalMovementBonus: 2, coastalRaidGoldPercent: 50, unitClassCombat: { naval_melee: 2 } }, 10);
      allCitiesModifier(state, player, "viking_raid_cost", { yieldPercent: { production: -10 } }, 10);
      log(state, `${player.name} declared a Viking Raid.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },
  franks: {
    id: "franks",
    name: "Carolingian Renaissance",
    desc: "All cities +25% culture and +10% faith for 10 turns; −20% gold.",
    unlock: { kind: "civic", id: "mysticism" },
    cooldown: 25,
    use: (state, player) => {
      allCitiesModifier(state, player, "carolingian_renaissance", { yieldPercent: { culture: 25, faith: 10 } }, 10);
      allCitiesModifier(state, player, "carolingian_renaissance_cost", { yieldPercent: { gold: -20 } }, 10);
      log(state, `${player.name} began the Carolingian Renaissance.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },
  goths: {
    id: "goths",
    name: "Foederati Recruitment",
    desc: "Spawn 2 Gothic Riders and gain 1 capital population. Costs 150 gold.",
    unlock: { kind: "civic", id: "statecraft" },
    cooldown: 20,
    use: (state, player) => {
      if (player.gold < 150) return fail("needs 150 gold");
      player.gold -= 150;
      // cataphract is the base type the Gothic Rider unique replaces.
      spawnNearCapital(state, player, "cataphract", 2);
      const capital = capitalOf(state, player);
      if (capital) capital.population += 1;
      log(state, `${player.name} recruited Foederati.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },
  anglo_saxon_england: {
    id: "anglo_saxon_england",
    name: "Fyrd Levy",
    desc: "Spawn 4 Spearmen by the capital; −20% production for 5 turns.",
    unlock: { kind: "civic", id: "statecraft" },
    cooldown: 20,
    use: (state, player) => {
      const capital = capitalOf(state, player);
      if (!capital || capital.population < 4) return fail("capital needs 4 population");
      removePopulation(state, player, 4);
      spawnNearCapital(state, player, "spearman", 4);
      allCitiesModifier(state, player, "fyrd_cost", { yieldPercent: { production: -20 } }, 5);
      log(state, `${player.name} raised the Fyrd.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },
  france: {
    id: "france",
    name: "Divine Mandate",
    desc: "All units +3 combat strength, +20 empire and +30 unit morale for 10 turns; −15% culture.",
    unlock: { kind: "civic", id: "mysticism" },
    cooldown: 25,
    use: (state, player) => {
      addPlayerModifier(state, player, "divine_mandate", { unitClassCombat: { melee: 3, ranged: 3, cavalry: 3 } }, 10);
      // Holy fervor steels the army against war-weariness — the design's "ignore
      // war-weariness", expressed through the morale system: a surge of empire and
      // unit morale that buffers the coming campaign.
      shiftGlobalMorale(state, player, 20, "Divine Mandate");
      rallyUnits(state, player, 30);
      allCitiesModifier(state, player, "divine_mandate_cost", { yieldPercent: { culture: -15 } }, 10);
      log(state, `${player.name} proclaimed a Divine Mandate.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },
  castile_spain: {
    id: "castile_spain",
    name: "Reconquista",
    desc: "Melee +4 strength versus cities for 10 turns; −10% culture.",
    unlock: { kind: "civic", id: "political_philosophy" },
    cooldown: 20,
    use: (state, player) => {
      addPlayerModifier(state, player, "reconquista", { meleeVsCityBonus: 4 }, 10);
      allCitiesModifier(state, player, "reconquista_cost", { yieldPercent: { culture: -10 } }, 10);
      log(state, `${player.name} proclaimed the Reconquista.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },
  portugal: {
    id: "portugal",
    name: "Age of Exploration",
    desc: "Naval +2 movement and coastal cities +3 gold for 10 turns; land units −1 movement.",
    unlock: { kind: "tech", id: "astronomy" },
    cooldown: 25,
    use: (state, player) => {
      addPlayerModifier(state, player, "age_of_exploration", { navalMovementBonus: 2, coastalCityYield: { gold: 3 } }, 10);
      addPlayerModifier(state, player, "age_of_exploration_cost", { landMovementBonus: -1 }, 10);
      log(state, `${player.name} began the Age of Exploration.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },
  venice: {
    id: "venice",
    name: "Arsenale Rush",
    desc: "Spawn 3 Galleys in coastal cities; −25% gold for 5 turns.",
    unlock: { kind: "tech", id: "shipbuilding" },
    cooldown: 20,
    use: (state, player) => {
      spawnInCoastalCities(state, player, "galley", 3);
      allCitiesModifier(state, player, "arsenale_rush_cost", { yieldPercent: { gold: -25 } }, 5);
      log(state, `${player.name} rushed the Arsenale.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },
  genoa: {
    id: "genoa",
    name: "Bank of San Giorgio",
    desc: "Instantly gain 400 gold; −10% production in all cities for 10 turns.",
    unlock: { kind: "tech", id: "coinage" },
    cooldown: 20,
    use: (state, player) => {
      player.gold += 400;
      allCitiesModifier(state, player, "bank_san_giorgio_cost", { yieldPercent: { production: -10 } }, 10);
      log(state, `${player.name} drew on the Bank of San Giorgio.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },
  dutch_republic: {
    id: "dutch_republic",
    name: "Polder Reclamation",
    desc: "Coastal cities +2 population and +3 food for 10 turns; −15% production for 5 turns.",
    unlock: { kind: "tech", id: "engineering" },
    cooldown: 25,
    use: (state, player) => {
      const coastal = citiesOf(state, player.id).filter((c) => isCoastalLand(state, c.col, c.row));
      for (const c of coastal) {
        c.population += 2;
        addCityModifier(state, c, "polder_reclamation", { coastalCityYield: { food: 3 } }, 10);
      }
      allCitiesModifier(state, player, "polder_reclamation_cost", { yieldPercent: { production: -15 } }, 5);
      log(state, `${player.name} began Polder Reclamation.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },
  holy_roman_empire: {
    id: "holy_roman_empire",
    name: "Imperial Diet",
    desc: "All cities +20% production and +2 production from hills for 10 turns; −10% culture.",
    unlock: { kind: "civic", id: "statecraft" },
    cooldown: 25,
    use: (state, player) => {
      allCitiesModifier(state, player, "imperial_diet", { yieldPercent: { production: 20 } }, 10);
      allCitiesModifier(state, player, "imperial_diet_flat", { hillTileProductionBonus: 2 }, 10);
      allCitiesModifier(state, player, "imperial_diet_cost", { yieldPercent: { culture: -10 } }, 10);
      log(state, `${player.name} convened the Imperial Diet.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },
  kievan_rus: {
    id: "kievan_rus",
    name: "Kievan Baptism",
    desc: "Gain 100 faith and +25% culture for 10 turns; all units −2 combat strength.",
    unlock: { kind: "civic", id: "mysticism" },
    cooldown: 20,
    use: (state, player) => {
      player.faith += 100;
      allCitiesModifier(state, player, "kievan_baptism", { yieldPercent: { culture: 25 } }, 10);
      addPlayerModifier(state, player, "kievan_baptism_cost", { unitClassCombat: { melee: -2, ranged: -2, cavalry: -2 } }, 10);
      log(state, `${player.name} celebrated the Kievan Baptism.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },
  poland_lithuania: {
    id: "poland_lithuania",
    name: "Golden Liberty",
    desc: "All cities +10% production and +10% culture for 10 turns; −15% gold.",
    unlock: { kind: "civic", id: "statecraft" },
    cooldown: 25,
    use: (state, player) => {
      allCitiesModifier(state, player, "golden_liberty", { yieldPercent: { production: 10, culture: 10 } }, 10);
      allCitiesModifier(state, player, "golden_liberty_cost", { yieldPercent: { gold: -15 } }, 10);
      log(state, `${player.name} proclaimed Golden Liberty.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },
  hungary: {
    id: "hungary",
    name: "Black Army Contract",
    desc: "Spawn 2 Black Army cavalry by the capital. Costs 300 gold and 2 population.",
    unlock: { kind: "civic", id: "statecraft" },
    cooldown: 20,
    use: (state, player) => {
      const capital = capitalOf(state, player);
      if (!capital || capital.population < 2) return fail("capital needs 2 population");
      if (player.gold < 300) return fail("needs 300 gold");
      player.gold -= 300;
      removePopulation(state, player, 2);
      // cataphract is the base type the Hungarian Black Army unique replaces.
      spawnNearCapital(state, player, "cataphract", 2);
      log(state, `${player.name} signed the Black Army Contract.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },

  // Central, South & East Asia
  han_china: {
    id: "han_china",
    name: "Great Wall Mobilization",
    desc: "All cities +50% defensive-building production and ranged +2 strength for 10 turns. Costs up to 4 population.",
    unlock: { kind: "tech", id: "masonry" },
    cooldown: 25,
    use: (state, player) => {
      allCitiesModifier(state, player, "great_wall", { defensiveBuildingProductionBonus: 50 }, 10);
      addPlayerModifier(state, player, "great_wall_combat", { unitClassCombat: { ranged: 2 } }, 10);
      removePopulation(state, player, Math.min(cityCount(state, player), 4));
      log(state, `${player.name} mobilized the Great Wall.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },
  china_tang_song: {
    id: "china_tang_song",
    name: "Imperial Examination",
    desc: "Gain 200 science, +25% science, +10% culture and Great Scientist progress for 10 turns; all units −2 strength.",
    unlock: { kind: "tech", id: "philosophy" },
    cooldown: 25,
    use: (state, player) => {
      player.scienceProgress += 200;
      addPlayerModifier(state, player, "imperial_examination", { yieldPercent: { science: 25, culture: 10 } }, 10);
      grantGreatPersonPoints(player, "scientist", 40); // merit scholars rise toward a Great Scientist
      addPlayerModifier(state, player, "imperial_examination_cost", { unitClassCombat: { melee: -2, cavalry: -2, ranged: -2 } }, 10);
      log(state, `${player.name} held the Imperial Examination.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },
  china_ming: {
    id: "china_ming",
    name: "Treasure Fleet",
    desc: "Spawn 2 War Junks, naval +2 movement and trade routes +5 gold for 10 turns; −15% production for 5 turns.",
    unlock: { kind: "tech", id: "astronomy" },
    cooldown: 30,
    use: (state, player) => {
      spawnInCoastalCities(state, player, "war_junk", 2);
      addPlayerModifier(state, player, "treasure_fleet", { navalMovementBonus: 2, tradeRouteGoldBonus: 5 }, 10);
      allCitiesModifier(state, player, "treasure_fleet_cost", { yieldPercent: { production: -15 } }, 5);
      log(state, `${player.name} launched the Treasure Fleet.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },
  maurya: {
    id: "maurya",
    name: "Dharma Edicts",
    desc: "All cities +15% faith and +10% culture for 10 turns; all units −3 strength and −15 morale.",
    unlock: { kind: "civic", id: "mysticism" },
    cooldown: 25,
    use: (state, player) => {
      allCitiesModifier(state, player, "dharma_edicts", { yieldPercent: { faith: 15, culture: 10 } }, 10);
      addPlayerModifier(state, player, "dharma_edicts_cost", { unitClassCombat: { melee: -3, cavalry: -3, ranged: -3 } }, 10);
      rallyUnits(state, player, -15); // a turn to pacifism saps the army's fighting spirit
      log(state, `${player.name} issued the Dharma Edicts.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },
  gupta_india: {
    id: "gupta_india",
    name: "Golden Age Patronage",
    desc: "All cities +30% science and +15% culture plus Great Scientist/Artist progress for 10 turns; −20% gold.",
    unlock: { kind: "tech", id: "philosophy" },
    cooldown: 25,
    use: (state, player) => {
      addPlayerModifier(state, player, "gupta_golden_age", { yieldPercent: { science: 30, culture: 15 } }, 10);
      // A golden age of patronage draws great minds to the court.
      grantGreatPersonPoints(player, "scientist", 40);
      grantGreatPersonPoints(player, "artist", 40);
      allCitiesModifier(state, player, "gupta_cost", { yieldPercent: { gold: -20 } }, 10);
      log(state, `${player.name} ushered in Golden Age Patronage.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },
  chola: {
    id: "chola",
    name: "Naval Expedition",
    desc: "Spawn 2 Warships in coastal cities and naval +2 movement for 10 turns. Costs 2 population.",
    unlock: { kind: "tech", id: "shipbuilding" },
    cooldown: 20,
    use: (state, player) => {
      const capital = capitalOf(state, player);
      if (!capital || capital.population < 2) return fail("capital needs 2 population");
      removePopulation(state, player, 2);
      // trireme is the base type the Chola Warship unique replaces.
      spawnInCoastalCities(state, player, "trireme", 2);
      addPlayerModifier(state, player, "naval_expedition", { navalMovementBonus: 2 }, 10);
      log(state, `${player.name} launched a Naval Expedition.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },
  japan: {
    id: "japan",
    name: "Sakoku Edict",
    desc: "All cities +25% production and +25% culture for 10 turns; trade routes −10 gold and all units −1 movement.",
    unlock: { kind: "tech", id: "crossbow" },
    cooldown: 30,
    use: (state, player) => {
      allCitiesModifier(state, player, "sakoku", { yieldPercent: { production: 25, culture: 25 } }, 10);
      addPlayerModifier(state, player, "sakoku_cost", { tradeRouteGoldBonus: -10, allUnitMovementBonus: -1 }, 10);
      log(state, `${player.name} issued the Sakoku Edict.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },
  korea: {
    id: "korea",
    name: "Hangul Scholars",
    desc: "Gain 150 science and 150 culture plus Great Scientist/Artist progress; −10% production for 5 turns.",
    unlock: { kind: "tech", id: "writing" },
    cooldown: 25,
    use: (state, player) => {
      player.scienceProgress += 150;
      player.cultureProgress += 150;
      grantGreatPersonPoints(player, "scientist", 30); // the Hall of Worthies cultivates great minds
      grantGreatPersonPoints(player, "artist", 30);
      allCitiesModifier(state, player, "hangul_cost", { yieldPercent: { production: -10 } }, 5);
      log(state, `${player.name} funded Hangul Scholars.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },
  tibet: {
    id: "tibet",
    name: "Roof of the World Pilgrimage",
    desc: "All cities +20% faith and units cross mountains freely for 10 turns; −15% gold.",
    unlock: { kind: "civic", id: "mysticism" },
    cooldown: 20,
    use: (state, player) => {
      allCitiesModifier(state, player, "roof_of_the_world", { yieldPercent: { faith: 20 } }, 10);
      addPlayerModifier(state, player, "roof_of_the_world", { ignoreMountainMovement: true }, 10);
      allCitiesModifier(state, player, "roof_of_the_world_cost", { yieldPercent: { gold: -15 } }, 10);
      log(state, `${player.name} began the Roof of the World Pilgrimage.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },
  dai_viet_vietnam: {
    id: "dai_viet_vietnam",
    name: "Nine Dragons Ambush",
    desc: "Melee and ranged +3 strength and all units +1 movement for 10 turns; −15% science.",
    unlock: { kind: "civic", id: "military_training" },
    cooldown: 20,
    use: (state, player) => {
      addPlayerModifier(state, player, "nine_dragons", { unitClassCombat: { melee: 3, ranged: 3 }, allUnitMovementBonus: 1 }, 10);
      allCitiesModifier(state, player, "nine_dragons_cost", { yieldPercent: { science: -15 } }, 10);
      log(state, `${player.name} laid a Nine Dragons Ambush.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },
  khmer: {
    id: "khmer",
    name: "Baray Irrigation",
    desc: "All cities +15% food, +5% production and bonus fresh-water yields for 10 turns; −10% gold.",
    unlock: { kind: "tech", id: "engineering" },
    cooldown: 25,
    use: (state, player) => {
      allCitiesModifier(state, player, "baray", { yieldPercent: { food: 15, production: 5 }, freshWaterTileFoodBonus: 1, freshWaterTileProductionBonus: 1 }, 10);
      allCitiesModifier(state, player, "baray_cost", { yieldPercent: { gold: -10 } }, 10);
      log(state, `${player.name} began Baray Irrigation.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },
  srivijaya: {
    id: "srivijaya",
    name: "Maritime Mandala",
    desc: "Gain a free Settler and coastal tiles +2 gold for 10 turns. Costs 1 capital population.",
    unlock: { kind: "tech", id: "astronomy" },
    cooldown: 25,
    use: (state, player) => {
      const capital = capitalOf(state, player);
      if (!capital || capital.population < 1) return fail("capital needs population");
      removePopulation(state, player, 1);
      spawnNearCapital(state, player, "settler", 1);
      addPlayerModifier(state, player, "maritime_mandala", { coastalTileGoldBonus: 2 }, 10);
      log(state, `${player.name} proclaimed a Maritime Mandala.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },
  majapahit: {
    id: "majapahit",
    name: "Nusantara Unity",
    desc: "All cities +10% faith and +10% culture for 10 turns; −10% science.",
    unlock: { kind: "civic", id: "mysticism" },
    cooldown: 20,
    use: (state, player) => {
      allCitiesModifier(state, player, "nusantara", { yieldPercent: { faith: 10, culture: 10 } }, 10);
      allCitiesModifier(state, player, "nusantara_cost", { yieldPercent: { science: -10 } }, 10);
      log(state, `${player.name} declared Nusantara Unity.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },
  pagan_burma: {
    id: "pagan_burma",
    name: "Pagoda Building Spree",
    desc: "All cities +50% Holy Site and Temple production for 10 turns; −15% gold.",
    unlock: { kind: "civic", id: "mysticism" },
    cooldown: 25,
    use: (state, player) => {
      allCitiesModifier(state, player, "pagoda_spree", { holySiteTempleProductionBonus: 50 }, 10);
      allCitiesModifier(state, player, "pagoda_spree_cost", { yieldPercent: { gold: -15 } }, 10);
      log(state, `${player.name} began a Pagoda Building Spree.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },
  ayutthaya_siam: {
    id: "ayutthaya_siam",
    name: "Father Governs Children",
    desc: "Gain 100 culture and +10% culture for 10 turns; −10% production for 5 turns.",
    unlock: { kind: "civic", id: "political_philosophy" },
    cooldown: 20,
    use: (state, player) => {
      player.cultureProgress += 100;
      allCitiesModifier(state, player, "father_governs", { yieldPercent: { culture: 10 } }, 10);
      allCitiesModifier(state, player, "father_governs_cost", { yieldPercent: { production: -10 } }, 5);
      log(state, `${player.name} invoked Father Governs Children.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },

  // Steppe & Turkic
  scythians: {
    id: "scythians",
    name: "Steppe Nomad Surge",
    desc: "Mounted units heal +20 HP per turn and cavalry +1 movement for 10 turns; −15% culture.",
    unlock: { kind: "tech", id: "equestrian" },
    cooldown: 20,
    use: (state, player) => {
      addPlayerModifier(state, player, "steppe_nomad_surge", { mountedHealPerTurn: 20, cavalryMovementBonus: 1 }, 10);
      allCitiesModifier(state, player, "steppe_nomad_surge_cost", { yieldPercent: { culture: -15 } }, 10);
      log(state, `${player.name} began a Steppe Nomad Surge.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },
  xiongnu: {
    id: "xiongnu",
    name: "Raiding Confederacy",
    desc: "Gain 200 gold, cavalry +3 strength and +25% raid gold for 10 turns; −10% culture.",
    unlock: { kind: "tech", id: "equestrian" },
    cooldown: 20,
    use: (state, player) => {
      player.gold += 200;
      addPlayerModifier(state, player, "raiding_confederacy", { unitClassCombat: { cavalry: 3 }, raidGoldPercent: 25 }, 10);
      allCitiesModifier(state, player, "raiding_confederacy_cost", { yieldPercent: { culture: -10 } }, 10);
      log(state, `${player.name} formed a Raiding Confederacy.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },
  huns: {
    id: "huns",
    name: "Scourge of God",
    desc: "All units +4 strength (and +4 versus cities), +15 empire and +15 unit morale for 10 turns; −10% food.",
    unlock: { kind: "tech", id: "iron_bloomery" },
    cooldown: 20,
    use: (state, player) => {
      addPlayerModifier(state, player, "scourge_of_god", { unitClassCombat: { cavalry: 4, melee: 4 }, meleeVsCityBonus: 4 }, 10);
      shiftGlobalMorale(state, player, 15, "Scourge of God"); // dread of the horde stiffens its own spine
      rallyUnits(state, player, 15);
      allCitiesModifier(state, player, "scourge_of_god_cost", { yieldPercent: { food: -10 } }, 10);
      log(state, `${player.name} unleashed the Scourge of God.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },
  gokturks: {
    id: "gokturks",
    name: "Sky Tengri Mobilization",
    desc: "Cavalry +2 strength and mounted units +1 sight for 10 turns; −20% science.",
    unlock: { kind: "tech", id: "equestrian" },
    cooldown: 20,
    use: (state, player) => {
      addPlayerModifier(state, player, "sky_tengri", { unitClassCombat: { cavalry: 2 }, mountedSightBonus: 1 }, 10);
      allCitiesModifier(state, player, "sky_tengri_cost", { yieldPercent: { science: -20 } }, 10);
      log(state, `${player.name} began Sky Tengri Mobilization.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },
  seljuks: {
    id: "seljuks",
    name: "Ghazi Jihad",
    desc: "Melee +3 strength and captured cities keep +2 population for 10 turns; −10% culture.",
    unlock: { kind: "civic", id: "mysticism" },
    cooldown: 25,
    use: (state, player) => {
      addPlayerModifier(state, player, "ghazi_jihad", { unitClassCombat: { melee: 3 } }, 10);
      addPlayerModifier(state, player, "ghazi_jihad_capture", { captureCityPopulationBonus: 2 }, 10);
      allCitiesModifier(state, player, "ghazi_jihad_cost", { yieldPercent: { culture: -10 } }, 10);
      log(state, `${player.name} declared a Ghazi Jihad.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },
  mongols: {
    id: "mongols",
    name: "Ortöö Relay",
    desc: "Spawn 2 Keshigs and cavalry +2 movement for 10 turns; −20% gold. Costs 3 horses.",
    unlock: { kind: "tech", id: "equestrian" },
    cooldown: 30,
    use: (state, player) => {
      if (!consumeResource(state, player, "horses", 3)) return fail("needs 3 horses");
      spawnNearCapital(state, player, "horse_archer", 2);
      addPlayerModifier(state, player, "ortoo_relay", { cavalryMovementBonus: 2 }, 10);
      allCitiesModifier(state, player, "ortoo_relay_cost", { yieldPercent: { gold: -20 } }, 10);
      log(state, `${player.name} activated the Örtöö Relay.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },
  timurids: {
    id: "timurids",
    name: "Tower of Skulls",
    desc: "Melee +3 strength and raids yield science for 10 turns; −15% culture.",
    unlock: { kind: "civic", id: "statecraft" },
    cooldown: 25,
    use: (state, player) => {
      addPlayerModifier(state, player, "tower_of_skulls", { unitClassCombat: { melee: 3 }, raidSciencePercent: 50 }, 10);
      allCitiesModifier(state, player, "tower_of_skulls_cost", { yieldPercent: { culture: -15 } }, 10);
      log(state, `${player.name} built a Tower of Skulls.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },
  ottomans: {
    id: "ottomans",
    name: "Great Bombard",
    desc: "Spawn 2 Catapults and siege +50% versus city defenses for 1 turn; −25% production for 5 turns.",
    unlock: { kind: "tech", id: "engineering" },
    cooldown: 25,
    use: (state, player) => {
      spawnNearCapital(state, player, "catapult", 2);
      addPlayerModifier(state, player, "great_bombard", { siegeVsCityDefenseMultiplier: 0.5 }, 1);
      allCitiesModifier(state, player, "great_bombard_cost", { yieldPercent: { production: -25 } }, 5);
      log(state, `${player.name} deployed the Great Bombard.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },

  // The Americas
  olmec: {
    id: "olmec",
    name: "Colossal Head",
    desc: "Gain 100 culture and capital +10% culture for 10 turns; −10% production for 5 turns.",
    unlock: { kind: "tech", id: "masonry" },
    cooldown: 20,
    use: (state, player) => {
      player.cultureProgress += 100;
      const capital = capitalOf(state, player);
      if (capital) addCityModifier(state, capital, "colossal_head", { yieldPercent: { culture: 10 } }, 10);
      allCitiesModifier(state, player, "colossal_head_cost", { yieldPercent: { production: -10 } }, 5);
      log(state, `${player.name} carved a Colossal Head.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },
  maya: {
    id: "maya",
    name: "Long Count Prophecy",
    desc: "All cities +25% science and +10% faith for 10 turns; −10% food.",
    unlock: { kind: "tech", id: "astronomy" },
    cooldown: 25,
    use: (state, player) => {
      allCitiesModifier(state, player, "long_count", { yieldPercent: { science: 25, faith: 10 } }, 10);
      allCitiesModifier(state, player, "long_count_cost", { yieldPercent: { food: -10 } }, 10);
      log(state, `${player.name} read the Long Count Prophecy.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },
  zapotec: {
    id: "zapotec",
    name: "Cloud Temple Ritual",
    desc: "Farms +1 food and +1 faith for 10 turns; −10% production.",
    unlock: { kind: "tech", id: "cultivation" },
    cooldown: 20,
    use: (state, player) => {
      addPlayerModifier(state, player, "cloud_temple", { farmTileFoodBonus: 1, farmTileFaithBonus: 1 }, 10);
      allCitiesModifier(state, player, "cloud_temple_cost", { yieldPercent: { production: -10 } }, 10);
      log(state, `${player.name} held a Cloud Temple Ritual.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },
  teotihuacan: {
    id: "teotihuacan",
    name: "Avenue of the Dead",
    desc: "Capital +25% production and +10% culture for 10 turns; other cities −5% culture.",
    unlock: { kind: "tech", id: "masonry" },
    cooldown: 25,
    use: (state, player) => {
      const capital = capitalOf(state, player);
      if (capital) addCityModifier(state, capital, "avenue_of_the_dead", { yieldPercent: { production: 25, culture: 10 } }, 10);
      citiesExceptWhere(state, player, (c) => c.isCapital, "avenue_of_the_dead_cost", { yieldPercent: { culture: -5 } }, 10);
      log(state, `${player.name} opened the Avenue of the Dead.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },
  toltec: {
    id: "toltec",
    name: "Toltecayotl War-Bands",
    desc: "Spawn 2 Toltec Warriors and melee +2 strength for 10 turns. Costs up to 3 population.",
    unlock: { kind: "tech", id: "bronze_alloying" },
    cooldown: 20,
    use: (state, player) => {
      removePopulation(state, player, Math.min(cityCount(state, player), 3));
      // swordsman is the base type the Toltec Warrior unique replaces.
      spawnNearCapital(state, player, "swordsman", 2);
      addPlayerModifier(state, player, "toltecayotl", { unitClassCombat: { melee: 2 } }, 10);
      log(state, `${player.name} raised Toltecayotl War-Bands.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },
  aztec: {
    id: "aztec",
    name: "Flower War",
    desc: "Melee +3 strength, raids yield science and +20 unit morale for 10 turns; −15% culture.",
    unlock: { kind: "civic", id: "military_tradition" },
    cooldown: 25,
    use: (state, player) => {
      addPlayerModifier(state, player, "flower_war", { unitClassCombat: { melee: 3 }, raidSciencePercent: 50 }, 10);
      rallyUnits(state, player, 20); // warriors emboldened by the sacred war
      allCitiesModifier(state, player, "flower_war_cost", { yieldPercent: { culture: -15 } }, 10);
      log(state, `${player.name} declared a Flower War.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },
  inca: {
    id: "inca",
    name: "Mit'a Labor Draft",
    desc: "All cities +30% production for 10 turns; −10% food and lose up to 8 population.",
    unlock: { kind: "tech", id: "engineering" },
    cooldown: 25,
    use: (state, player) => {
      allCitiesModifier(state, player, "mita", { yieldPercent: { production: 30 } }, 10);
      allCitiesModifier(state, player, "mita_cost", { yieldPercent: { food: -10 } }, 10);
      removePopulation(state, player, Math.min(cityCount(state, player) * 2, 8));
      log(state, `${player.name} imposed the Mit'a.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },
  muisca: {
    id: "muisca",
    name: "El Dorado Offering",
    desc: "Gain 250 gold and +10% faith for 10 turns; −15% production for 5 turns.",
    unlock: { kind: "tech", id: "coinage" },
    cooldown: 20,
    use: (state, player) => {
      player.gold += 250;
      addPlayerModifier(state, player, "el_dorado", { yieldPercent: { faith: 10 } }, 10);
      allCitiesModifier(state, player, "el_dorado_cost", { yieldPercent: { production: -15 } }, 5);
      log(state, `${player.name} made an El Dorado Offering.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },
  mississippian_cahokia: {
    id: "mississippian_cahokia",
    name: "Mound Builders' Feast",
    desc: "All cities +15% food for 10 turns; −15% production for 5 turns.",
    unlock: { kind: "tech", id: "cultivation" },
    cooldown: 20,
    use: (state, player) => {
      allCitiesModifier(state, player, "mound_builders", { yieldPercent: { food: 15 } }, 10);
      allCitiesModifier(state, player, "mound_builders_cost", { yieldPercent: { production: -15 } }, 5);
      log(state, `${player.name} held a Mound Builders' Feast.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },
  haudenosaunee: {
    id: "haudenosaunee",
    name: "Great Law of Peace",
    desc: "Gain 100 culture and all cities +15% culture and +10% production for 10 turns; −10% production for the first 5 turns.",
    unlock: { kind: "civic", id: "political_philosophy" },
    cooldown: 25,
    use: (state, player) => {
      player.cultureProgress += 100;
      allCitiesModifier(state, player, "great_law", { yieldPercent: { culture: 15, production: 10 } }, 10);
      allCitiesModifier(state, player, "great_law_cost", { yieldPercent: { production: -10 } }, 5);
      log(state, `${player.name} recited the Great Law of Peace.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },
  pueblo: {
    id: "pueblo",
    name: "Cliff Dwelling Defense",
    desc: "Hills +1 production and ranged +2 strength for 10 turns; −10% food.",
    unlock: { kind: "tech", id: "masonry" },
    cooldown: 20,
    use: (state, player) => {
      allCitiesModifier(state, player, "cliff_dwelling", { hillTileProductionBonus: 1 }, 10);
      addPlayerModifier(state, player, "cliff_dwelling_defense", { unitClassCombat: { ranged: 2 } }, 10);
      allCitiesModifier(state, player, "cliff_dwelling_cost", { yieldPercent: { food: -10 } }, 10);
      log(state, `${player.name} manned the Cliff Dwellings.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },

  // Oceania
  polynesia: {
    id: "polynesia",
    name: "Wayfinding Expedition",
    desc: "Naval +2 movement and island cities +2 food for 10 turns; land units −1 movement.",
    unlock: { kind: "tech", id: "sailing" },
    cooldown: 20,
    use: (state, player) => {
      addPlayerModifier(state, player, "wayfinding", { navalMovementBonus: 2, islandCityYield: { food: 2 } }, 10);
      addPlayerModifier(state, player, "wayfinding_cost", { landMovementBonus: -1 }, 10);
      log(state, `${player.name} set out on a Wayfinding Expedition.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },
  maori: {
    id: "maori",
    name: "Haka War Challenge",
    desc: "Melee +3 strength for 10 turns; −10% culture.",
    unlock: { kind: "tech", id: "bronze_alloying" },
    cooldown: 20,
    use: (state, player) => {
      addPlayerModifier(state, player, "haka", { unitClassCombat: { melee: 3 } }, 10);
      allCitiesModifier(state, player, "haka_cost", { yieldPercent: { culture: -10 } }, 10);
      log(state, `${player.name} performed the Haka War Challenge.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },
  hawaii: {
    id: "hawaii",
    name: "Aloha ʻĀina Unification",
    desc: "All cities +25% production and +10% culture for 10 turns; −15% gold.",
    unlock: { kind: "civic", id: "political_philosophy" },
    cooldown: 25,
    use: (state, player) => {
      allCitiesModifier(state, player, "aloha_aina", { yieldPercent: { production: 25, culture: 10 } }, 10);
      allCitiesModifier(state, player, "aloha_aina_cost", { yieldPercent: { gold: -15 } }, 10);
      log(state, `${player.name} achieved Aloha ʻĀina Unification.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },

  // ===========================================================================
  // EXPANSION leaders (docs/CIVILIZATIONS-EXPANSION.md)
  // ===========================================================================
  arabia: {
    id: "arabia", name: "Translation Movement",
    desc: "Gain 200 science and +25% science for 10 turns; −20% gold.", unlock: { kind: "tech", id: "philosophy" }, cooldown: 25,
    use: (state, player) => {
      player.scienceProgress += 200;
      addPlayerModifier(state, player, "translation_movement", { yieldPercent: { science: 25 } }, 10);
      allCitiesModifier(state, player, "translation_movement_cost", { yieldPercent: { gold: -20 } }, 10);
      log(state, `${player.name} sponsored the Translation Movement.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },
  israelites: {
    id: "israelites", name: "Wisdom of Solomon",
    desc: "Instantly finish your current civic and gain 100 culture; −15% production for 5 turns.", unlock: { kind: "tech", id: "writing" }, cooldown: 25,
    use: (state, player) => {
      finishCurrentCivic(state, player);
      player.cultureProgress += 100;
      allCitiesModifier(state, player, "wisdom_of_solomon_cost", { yieldPercent: { production: -15 } }, 5);
      log(state, `${player.name} invoked the Wisdom of Solomon.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },
  nabataeans: {
    id: "nabataeans", name: "Hidden Cisterns",
    desc: "Desert cities +3 food and +2 production for 10 turns; −15% gold.", unlock: { kind: "tech", id: "masonry" }, cooldown: 20,
    use: (state, player) => {
      allCitiesModifier(state, player, "hidden_cisterns", { desertCityYield: { food: 3, production: 2 } }, 10);
      allCitiesModifier(state, player, "hidden_cisterns_cost", { yieldPercent: { gold: -15 } }, 10);
      log(state, `${player.name} opened the Hidden Cisterns.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },
  saba: {
    id: "saba", name: "Queen's Caravan",
    desc: "Instantly gain 400 gold and 50 faith. Costs 2 capital population.", unlock: { kind: "tech", id: "coinage" }, cooldown: 25,
    use: (state, player) => {
      const capital = capitalOf(state, player);
      if (!capital || capital.population < 2) return fail("capital needs 2 population");
      player.gold += 400;
      player.faith += 50;
      removePopulation(state, player, 2);
      log(state, `${player.name} sent the Queen's Caravan.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },
  mitanni: {
    id: "mitanni", name: "Hurrian Charioteers",
    desc: "Spawn 2 War Chariots by the capital. Costs 2 population and 3 horses.", unlock: { kind: "tech", id: "chariotry" }, cooldown: 20,
    use: (state, player) => {
      const capital = capitalOf(state, player);
      if (!capital || capital.population < 2) return fail("capital needs 2 population");
      if (!consumeResource(state, player, "horses", 3)) return fail("needs 3 horses");
      removePopulation(state, player, 2);
      spawnNearCapital(state, player, "war_chariot", 2);
      log(state, `${player.name} mustered Hurrian Charioteers.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },
  urartu: {
    id: "urartu", name: "Citadel of Van",
    desc: "All cities +50% defensive-building production and melee +2 strength for 10 turns; −15% gold.", unlock: { kind: "tech", id: "masonry" }, cooldown: 25,
    use: (state, player) => {
      allCitiesModifier(state, player, "citadel_of_van", { defensiveBuildingProductionBonus: 50 }, 10);
      addPlayerModifier(state, player, "citadel_of_van_combat", { unitClassCombat: { melee: 2 } }, 10);
      allCitiesModifier(state, player, "citadel_of_van_cost", { yieldPercent: { gold: -15 } }, 10);
      log(state, `${player.name} raised the Citadel of Van.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },
  greco_bactria: {
    id: "greco_bactria", name: "Indo-Greek Expansion",
    desc: "All units +1 movement and +3 combat strength for 10 turns; −20% science.", unlock: { kind: "tech", id: "cavalry_doctrine" }, cooldown: 25,
    use: (state, player) => {
      addPlayerModifier(state, player, "indo_greek", { allUnitMovementBonus: 1, unitClassCombat: { melee: 3, cavalry: 3, ranged: 3 } }, 10);
      allCitiesModifier(state, player, "indo_greek_cost", { yieldPercent: { science: -20 } }, 10);
      log(state, `${player.name} launched the Indo-Greek Expansion.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },
  sogdia: {
    id: "sogdia", name: "Silk Road Caravan",
    desc: "Gain 250 gold and +1 trade-route capacity for 10 turns; land units −1 movement.", unlock: { kind: "civic", id: "trade_routes" }, cooldown: 25,
    use: (state, player) => {
      player.gold += 250;
      addPlayerModifier(state, player, "silk_road", { tradeRouteCapacityBonus: 1 }, 10);
      addPlayerModifier(state, player, "silk_road_cost", { landMovementBonus: -1 }, 10);
      log(state, `${player.name} dispatched a Silk Road Caravan.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },
  khwarazm: {
    id: "khwarazm", name: "Mobilize the Shah's Host",
    desc: "Spawn 3 Lancers by the capital. Costs 300 gold and 2 population.", unlock: { kind: "tech", id: "cavalry_doctrine" }, cooldown: 20,
    use: (state, player) => {
      const capital = capitalOf(state, player);
      if (!capital || capital.population < 2) return fail("capital needs 2 population");
      if (player.gold < 300) return fail("needs 300 gold");
      player.gold -= 300;
      removePopulation(state, player, 2);
      spawnNearCapital(state, player, "cataphract", 3);
      log(state, `${player.name} mobilized the Shah's host.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },
  numidia: {
    id: "numidia", name: "Numidian Skirmish",
    desc: "Cavalry +1 movement and mounted units heal +20 HP per turn for 10 turns; −15% culture.", unlock: { kind: "tech", id: "equestrian" }, cooldown: 20,
    use: (state, player) => {
      addPlayerModifier(state, player, "numidian_skirmish", { cavalryMovementBonus: 1, mountedHealPerTurn: 20 }, 10);
      allCitiesModifier(state, player, "numidian_skirmish_cost", { yieldPercent: { culture: -15 } }, 10);
      log(state, `${player.name} began a Numidian Skirmish.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },
  fatimids: {
    id: "fatimids", name: "Found al-Qahira",
    desc: "Capital +25% production and +25% science and gain 100 faith for 10 turns; −20% gold.", unlock: { kind: "tech", id: "masonry" }, cooldown: 25,
    use: (state, player) => {
      const capital = capitalOf(state, player);
      if (capital) addCityModifier(state, capital, "found_al_qahira", { yieldPercent: { production: 25, science: 25 } }, 10);
      player.faith += 100;
      allCitiesModifier(state, player, "found_al_qahira_cost", { yieldPercent: { gold: -20 } }, 10);
      log(state, `${player.name} founded al-Qahira.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },
  ayyubids: {
    id: "ayyubids", name: "Reconquest of Jerusalem",
    desc: "Melee +4 strength versus cities and all units heal +5 HP per turn for 10 turns; −10% gold.", unlock: { kind: "tech", id: "iron_bloomery" }, cooldown: 25,
    use: (state, player) => {
      addPlayerModifier(state, player, "reconquest", { meleeVsCityBonus: 4, unitHealPerTurn: 5 }, 10);
      allCitiesModifier(state, player, "reconquest_cost", { yieldPercent: { gold: -10 } }, 10);
      log(state, `${player.name} launched the Reconquest of Jerusalem.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },
  mamluks: {
    id: "mamluks", name: "Faris Charge",
    desc: "Spawn 2 Mamluks and cavalry +3 strength for 10 turns. Costs 300 gold.", unlock: { kind: "tech", id: "cavalry_doctrine" }, cooldown: 25,
    use: (state, player) => {
      if (player.gold < 300) return fail("needs 300 gold");
      player.gold -= 300;
      spawnNearCapital(state, player, "cataphract", 2);
      addPlayerModifier(state, player, "faris_charge", { unitClassCombat: { cavalry: 3 } }, 10);
      log(state, `${player.name} ordered the Faris Charge.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },
  almoravids: {
    id: "almoravids", name: "Murabitun Jihad",
    desc: "Melee +3 strength for 10 turns; −20% science.", unlock: { kind: "civic", id: "mysticism" }, cooldown: 20,
    use: (state, player) => {
      addPlayerModifier(state, player, "murabitun_jihad", { unitClassCombat: { melee: 3 } }, 10);
      allCitiesModifier(state, player, "murabitun_jihad_cost", { yieldPercent: { science: -20 } }, 10);
      log(state, `${player.name} declared the Murabitun Jihad.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },
  swahili: {
    id: "swahili", name: "Monsoon Winds",
    desc: "Trade routes +5 gold and naval +2 movement for 10 turns; −15% production.", unlock: { kind: "tech", id: "sailing" }, cooldown: 25,
    use: (state, player) => {
      addPlayerModifier(state, player, "monsoon_winds", { tradeRouteGoldBonus: 5, navalMovementBonus: 2 }, 10);
      allCitiesModifier(state, player, "monsoon_winds_cost", { yieldPercent: { production: -15 } }, 10);
      log(state, `${player.name} caught the Monsoon Winds.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },
  benin: {
    id: "benin", name: "Edo Bronze Casting",
    desc: "Gain 150 culture and all cities +50% defensive-building production for 10 turns; −15% gold.", unlock: { kind: "tech", id: "masonry" }, cooldown: 25,
    use: (state, player) => {
      player.cultureProgress += 150;
      allCitiesModifier(state, player, "edo_bronze", { defensiveBuildingProductionBonus: 50 }, 10);
      allCitiesModifier(state, player, "edo_bronze_cost", { yieldPercent: { gold: -15 } }, 10);
      log(state, `${player.name} began Edo Bronze Casting.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },
  kongo: {
    id: "kongo", name: "Catholic Conversion",
    desc: "Gain 100 faith and +25% culture for 10 turns; −15% production.", unlock: { kind: "civic", id: "mysticism" }, cooldown: 20,
    use: (state, player) => {
      player.faith += 100;
      allCitiesModifier(state, player, "catholic_conversion", { yieldPercent: { culture: 25 } }, 10);
      allCitiesModifier(state, player, "catholic_conversion_cost", { yieldPercent: { production: -15 } }, 10);
      log(state, `${player.name} embraced the Catholic Conversion.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },
  bulgaria: {
    id: "bulgaria", name: "Nikephoros' Skull",
    desc: "Melee +3 strength versus cities and captured cities keep +2 population for 10 turns; −15% culture.", unlock: { kind: "tech", id: "iron_bloomery" }, cooldown: 25,
    use: (state, player) => {
      addPlayerModifier(state, player, "nikephoros_skull", { meleeVsCityBonus: 3, captureCityPopulationBonus: 2 }, 10);
      allCitiesModifier(state, player, "nikephoros_skull_cost", { yieldPercent: { culture: -15 } }, 10);
      log(state, `${player.name} raised Nikephoros' Skull.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },
  serbia: {
    id: "serbia", name: "Dušan's Code",
    desc: "Instantly finish your current civic; +10% culture for 10 turns and −15% production for 5 turns.", unlock: { kind: "civic", id: "political_philosophy" }, cooldown: 25,
    use: (state, player) => {
      finishCurrentCivic(state, player);
      allCitiesModifier(state, player, "dusans_code", { yieldPercent: { culture: 10 } }, 10);
      allCitiesModifier(state, player, "dusans_code_cost", { yieldPercent: { production: -15 } }, 5);
      log(state, `${player.name} proclaimed Dušan's Code.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },
  bohemia: {
    id: "bohemia", name: "Golden Bull",
    desc: "Instantly gain 150 science, 150 culture and 200 gold; −10% production for 5 turns.", unlock: { kind: "tech", id: "philosophy" }, cooldown: 25,
    use: (state, player) => {
      player.scienceProgress += 150;
      player.cultureProgress += 150;
      player.gold += 200;
      allCitiesModifier(state, player, "golden_bull_cost", { yieldPercent: { production: -10 } }, 5);
      log(state, `${player.name} issued the Golden Bull.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },
  swiss: {
    id: "swiss", name: "Pike Square",
    desc: "Spawn 2 Halberdiers and melee +4 strength for 10 turns. Costs 200 gold.", unlock: { kind: "tech", id: "iron_bloomery" }, cooldown: 20,
    use: (state, player) => {
      if (player.gold < 200) return fail("needs 200 gold");
      player.gold -= 200;
      spawnNearCapital(state, player, "pikeman", 2);
      addPlayerModifier(state, player, "pike_square", { unitClassCombat: { melee: 4 } }, 10);
      log(state, `${player.name} formed a Pike Square.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },
  aragon: {
    id: "aragon", name: "Conquest of Valencia",
    desc: "Melee +4 strength versus cities and coastal cities +3 gold for 10 turns; −15% science.", unlock: { kind: "tech", id: "shipbuilding" }, cooldown: 25,
    use: (state, player) => {
      addPlayerModifier(state, player, "conquest_valencia", { meleeVsCityBonus: 4, coastalCityYield: { gold: 3 } }, 10);
      allCitiesModifier(state, player, "conquest_valencia_cost", { yieldPercent: { science: -15 } }, 10);
      log(state, `${player.name} began the Conquest of Valencia.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },
  scotland: {
    id: "scotland", name: "Bannockburn",
    desc: "Melee +2 strength for 10 turns; −10% gold.", unlock: { kind: "tech", id: "iron_bloomery" }, cooldown: 20,
    use: (state, player) => {
      addPlayerModifier(state, player, "bannockburn", { unitClassCombat: { melee: 2 } }, 10);
      allCitiesModifier(state, player, "bannockburn_cost", { yieldPercent: { gold: -10 } }, 10);
      log(state, `${player.name} stood at Bannockburn.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },
  gaelic_ireland: {
    id: "gaelic_ireland", name: "Battle of Clontarf",
    desc: "Spawn 2 Gallowglass and melee +2 strength for 10 turns. Costs 2 population.", unlock: { kind: "tech", id: "carburizing" }, cooldown: 20,
    use: (state, player) => {
      const capital = capitalOf(state, player);
      if (!capital || capital.population < 2) return fail("capital needs 2 population");
      removePopulation(state, player, 2);
      spawnNearCapital(state, player, "longswordsman", 2);
      addPlayerModifier(state, player, "clontarf", { unitClassCombat: { melee: 2 } }, 10);
      log(state, `${player.name} fought the Battle of Clontarf.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },
  normans: {
    id: "normans", name: "Conquest of Sicily",
    desc: "Cavalry +3 strength and captured cities keep +1 population for 10 turns; −15% culture.", unlock: { kind: "tech", id: "cavalry_doctrine" }, cooldown: 25,
    use: (state, player) => {
      addPlayerModifier(state, player, "conquest_sicily", { unitClassCombat: { cavalry: 3 }, captureCityPopulationBonus: 1 }, 10);
      allCitiesModifier(state, player, "conquest_sicily_cost", { yieldPercent: { culture: -15 } }, 10);
      log(state, `${player.name} began the Conquest of Sicily.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },
  visigoths: {
    id: "visigoths", name: "Liber Iudiciorum",
    desc: "Instantly finish your current civic; melee +2 strength for 10 turns and −15% gold.", unlock: { kind: "civic", id: "statecraft" }, cooldown: 25,
    use: (state, player) => {
      finishCurrentCivic(state, player);
      addPlayerModifier(state, player, "liber_iudiciorum", { unitClassCombat: { melee: 2 } }, 10);
      allCitiesModifier(state, player, "liber_iudiciorum_cost", { yieldPercent: { gold: -15 } }, 10);
      log(state, `${player.name} codified the Liber Iudiciorum.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },
  novgorod: {
    id: "novgorod", name: "Battle on the Ice",
    desc: "Gain 200 gold and melee +2 strength for 10 turns; −15% production for 5 turns.", unlock: { kind: "tech", id: "iron_bloomery" }, cooldown: 20,
    use: (state, player) => {
      addPlayerModifier(state, player, "battle_on_ice", { unitClassCombat: { melee: 2 } }, 10);
      player.gold += 200;
      allCitiesModifier(state, player, "battle_on_ice_cost", { yieldPercent: { production: -15 } }, 5);
      log(state, `${player.name} won the Battle on the Ice.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },
  illyrians: {
    id: "illyrians", name: "Adriatic Raid",
    desc: "+50% coastal-raid gold and naval +2 movement for 10 turns; −10% production.", unlock: { kind: "tech", id: "sailing" }, cooldown: 20,
    use: (state, player) => {
      addPlayerModifier(state, player, "adriatic_raid", { coastalRaidGoldPercent: 50, navalMovementBonus: 2 }, 10);
      allCitiesModifier(state, player, "adriatic_raid_cost", { yieldPercent: { production: -10 } }, 10);
      log(state, `${player.name} launched an Adriatic Raid.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },
  lusitani: {
    id: "lusitani", name: "Guerrilla War",
    desc: "Melee +3 strength and units ignore rough terrain for 10 turns; −15% gold.", unlock: { kind: "tech", id: "iron_bloomery" }, cooldown: 20,
    use: (state, player) => {
      addPlayerModifier(state, player, "guerrilla_war", { unitClassCombat: { melee: 3 }, ignoreRoughTerrain: true }, 10);
      allCitiesModifier(state, player, "guerrilla_war_cost", { yieldPercent: { gold: -15 } }, 10);
      log(state, `${player.name} waged a Guerrilla War.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },
  arevaci: {
    id: "arevaci", name: "Siege of Numantia",
    desc: "All cities +50% defensive-building production and melee +4 strength for 10 turns; −10% production.", unlock: { kind: "tech", id: "iron_bloomery" }, cooldown: 25,
    use: (state, player) => {
      allCitiesModifier(state, player, "siege_numantia", { defensiveBuildingProductionBonus: 50 }, 10);
      addPlayerModifier(state, player, "siege_numantia_combat", { unitClassCombat: { melee: 4 } }, 10);
      allCitiesModifier(state, player, "siege_numantia_cost", { yieldPercent: { production: -10 } }, 10);
      log(state, `${player.name} endured the Siege of Numantia.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },
  thracians: {
    id: "thracians", name: "Mercenary Levy",
    desc: "Spawn 3 Peltasts and ranged +2 strength for 10 turns. Costs 200 gold.", unlock: { kind: "tech", id: "bronze_alloying" }, cooldown: 20,
    use: (state, player) => {
      if (player.gold < 200) return fail("needs 200 gold");
      player.gold -= 200;
      spawnNearCapital(state, player, "javelineer", 3);
      addPlayerModifier(state, player, "mercenary_levy", { unitClassCombat: { ranged: 2 } }, 10);
      log(state, `${player.name} raised a Mercenary Levy.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },
  dacians: {
    id: "dacians", name: "Sarmizegetusa Stand",
    desc: "Gain 150 gold and melee +3 strength for 10 turns; −15% science.", unlock: { kind: "tech", id: "carburizing" }, cooldown: 25,
    use: (state, player) => {
      addPlayerModifier(state, player, "sarmizegetusa", { unitClassCombat: { melee: 3 } }, 10);
      player.gold += 150;
      allCitiesModifier(state, player, "sarmizegetusa_cost", { yieldPercent: { science: -15 } }, 10);
      log(state, `${player.name} made the Sarmizegetusa Stand.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },
  sami: {
    id: "sami", name: "Drum of the Noaidi",
    desc: "Gain 50 faith and land units +1 movement for 10 turns; −10% production.", unlock: { kind: "civic", id: "mysticism" }, cooldown: 20,
    use: (state, player) => {
      player.faith += 50;
      addPlayerModifier(state, player, "drum_of_noaidi", { landMovementBonus: 1 }, 10);
      allCitiesModifier(state, player, "drum_of_noaidi_cost", { yieldPercent: { production: -10 } }, 10);
      log(state, `${player.name} beat the Drum of the Noaidi.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },
  corinth: {
    id: "corinth", name: "Isthmian Games",
    desc: "Gain 250 gold and +10% culture for 10 turns; −10% production.", unlock: { kind: "tech", id: "coinage" }, cooldown: 20,
    use: (state, player) => {
      player.gold += 250;
      allCitiesModifier(state, player, "isthmian_games", { yieldPercent: { culture: 10 } }, 10);
      allCitiesModifier(state, player, "isthmian_games_cost", { yieldPercent: { production: -10 } }, 10);
      log(state, `${player.name} held the Isthmian Games.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },
  thebes: {
    id: "thebes", name: "Oblique Phalanx",
    desc: "Spawn 2 Sacred Band and melee +4 strength for 10 turns. Costs 2 population.", unlock: { kind: "tech", id: "phalanx" }, cooldown: 25,
    use: (state, player) => {
      const capital = capitalOf(state, player);
      if (!capital || capital.population < 2) return fail("capital needs 2 population");
      removePopulation(state, player, 2);
      spawnNearCapital(state, player, "hoplite", 2);
      addPlayerModifier(state, player, "oblique_phalanx", { unitClassCombat: { melee: 4 } }, 10);
      log(state, `${player.name} formed the Oblique Phalanx.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },
  eretria: {
    id: "eretria", name: "Found a Colony",
    desc: "Gain a free Settler and coastal cities +2 gold for 10 turns. Costs 1 population.", unlock: { kind: "tech", id: "sailing" }, cooldown: 25,
    use: (state, player) => {
      const capital = capitalOf(state, player);
      if (!capital || capital.population < 1) return fail("capital needs population");
      removePopulation(state, player, 1);
      spawnNearCapital(state, player, "settler", 1);
      allCitiesModifier(state, player, "found_colony", { coastalCityYield: { gold: 2 } }, 10);
      log(state, `${player.name} founded a Colony.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },
  crete: {
    id: "crete", name: "Hire the Cretan Archers",
    desc: "Spawn 2 Cretan Archers and ranged +3 strength for 10 turns. Costs 200 gold.", unlock: { kind: "tech", id: "composite_bow" }, cooldown: 20,
    use: (state, player) => {
      if (player.gold < 200) return fail("needs 200 gold");
      player.gold -= 200;
      spawnNearCapital(state, player, "archer", 2);
      addPlayerModifier(state, player, "cretan_archers", { unitClassCombat: { ranged: 3 } }, 10);
      log(state, `${player.name} hired the Cretan Archers.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },
  indus_valley: {
    id: "indus_valley", name: "Grid Planning",
    desc: "Farms and fresh-water tiles +1 food for 10 turns; −15% gold.", unlock: { kind: "tech", id: "masonry" }, cooldown: 25,
    use: (state, player) => {
      allCitiesModifier(state, player, "grid_planning", { farmTileFoodBonus: 1, freshWaterTileFoodBonus: 1 }, 10);
      allCitiesModifier(state, player, "grid_planning_cost", { yieldPercent: { gold: -15 } }, 10);
      log(state, `${player.name} began Grid Planning.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },
  zhou_china: {
    id: "zhou_china", name: "Mandate of Heaven",
    desc: "Gain 150 culture and melee +4 strength versus cities for 10 turns; −10% production.", unlock: { kind: "tech", id: "writing" }, cooldown: 25,
    use: (state, player) => {
      player.cultureProgress += 150;
      addPlayerModifier(state, player, "mandate_of_heaven", { meleeVsCityBonus: 4 }, 10);
      allCitiesModifier(state, player, "mandate_of_heaven_cost", { yieldPercent: { production: -10 } }, 10);
      log(state, `${player.name} proclaimed the Mandate of Heaven.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },
  delhi_sultanate: {
    id: "delhi_sultanate", name: "Market Reforms",
    desc: "Gain 300 gold and all cities +10% food for 10 turns; −15% science.", unlock: { kind: "tech", id: "coinage" }, cooldown: 25,
    use: (state, player) => {
      player.gold += 300;
      allCitiesModifier(state, player, "market_reforms", { yieldPercent: { food: 10 } }, 10);
      allCitiesModifier(state, player, "market_reforms_cost", { yieldPercent: { science: -15 } }, 10);
      log(state, `${player.name} decreed Market Reforms.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },
  mughals: {
    id: "mughals", name: "Din-i Ilahi",
    desc: "All cities +25% culture and +10% science for 10 turns; lose 50 faith.", unlock: { kind: "tech", id: "philosophy" }, cooldown: 25,
    use: (state, player) => {
      allCitiesModifier(state, player, "din_i_ilahi", { yieldPercent: { culture: 25, science: 10 } }, 10);
      player.faith = Math.max(0, player.faith - 50);
      log(state, `${player.name} proclaimed the Din-i Ilahi.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },
  vijayanagara: {
    id: "vijayanagara", name: "Amuktamalyada",
    desc: "+25% gold and +25% faith for 10 turns; −15% production.", unlock: { kind: "civic", id: "political_philosophy" }, cooldown: 25,
    use: (state, player) => {
      addPlayerModifier(state, player, "amuktamalyada", { yieldPercent: { gold: 25, faith: 25 } }, 10);
      allCitiesModifier(state, player, "amuktamalyada_cost", { yieldPercent: { production: -15 } }, 10);
      log(state, `${player.name} composed the Amuktamalyada.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },
  champa: {
    id: "champa", name: "Sack of Angkor",
    desc: "+50% coastal-raid gold and naval +2 movement for 10 turns; −10% production.", unlock: { kind: "tech", id: "shipbuilding" }, cooldown: 20,
    use: (state, player) => {
      addPlayerModifier(state, player, "sack_of_angkor", { coastalRaidGoldPercent: 50, navalMovementBonus: 2 }, 10);
      allCitiesModifier(state, player, "sack_of_angkor_cost", { yieldPercent: { production: -10 } }, 10);
      log(state, `${player.name} led the Sack of Angkor.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },
  sinhala: {
    id: "sinhala", name: "Polonnaruwa Tanks",
    desc: "Fresh-water tiles +2 food and +1 production for 10 turns; −10% gold.", unlock: { kind: "tech", id: "engineering" }, cooldown: 25,
    use: (state, player) => {
      allCitiesModifier(state, player, "polonnaruwa_tanks", { freshWaterTileFoodBonus: 2, freshWaterTileProductionBonus: 1 }, 10);
      allCitiesModifier(state, player, "polonnaruwa_tanks_cost", { yieldPercent: { gold: -10 } }, 10);
      log(state, `${player.name} filled the Polonnaruwa Tanks.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },
  khitan: {
    id: "khitan", name: "Ordo Levy",
    desc: "Spawn 2 Ordo Cavalry and cavalry +1 movement for 10 turns. Costs 1 population and 3 horses.", unlock: { kind: "tech", id: "cavalry_doctrine" }, cooldown: 20,
    use: (state, player) => {
      const capital = capitalOf(state, player);
      if (!capital || capital.population < 1) return fail("capital needs population");
      if (!consumeResource(state, player, "horses", 3)) return fail("needs 3 horses");
      removePopulation(state, player, 1);
      spawnNearCapital(state, player, "cataphract", 2);
      addPlayerModifier(state, player, "ordo_levy", { cavalryMovementBonus: 1 }, 10);
      log(state, `${player.name} called an Ordo Levy.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },
  jurchen: {
    id: "jurchen", name: "Tieta Charge",
    desc: "Cavalry +3 strength and captured cities keep +2 population for 10 turns; −15% gold.", unlock: { kind: "tech", id: "cavalry_doctrine" }, cooldown: 25,
    use: (state, player) => {
      addPlayerModifier(state, player, "tieta_charge", { unitClassCombat: { cavalry: 3 }, captureCityPopulationBonus: 2 }, 10);
      allCitiesModifier(state, player, "tieta_charge_cost", { yieldPercent: { gold: -15 } }, 10);
      log(state, `${player.name} ordered the Tieta Charge.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },
  khazars: {
    id: "khazars", name: "Conversion of Bulan",
    desc: "Instantly gain 100 faith and 200 gold; −10% science for 10 turns.", unlock: { kind: "tech", id: "coinage" }, cooldown: 20,
    use: (state, player) => {
      player.faith += 100;
      player.gold += 200;
      allCitiesModifier(state, player, "conversion_of_bulan_cost", { yieldPercent: { science: -10 } }, 10);
      log(state, `${player.name} celebrated the Conversion of Bulan.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },
  avars: {
    id: "avars", name: "Siege of 626",
    desc: "Gain 150 gold, melee +4 strength versus cities and cavalry +4 strength for 10 turns; −10% production.", unlock: { kind: "tech", id: "siegecraft" }, cooldown: 25,
    use: (state, player) => {
      addPlayerModifier(state, player, "siege_626", { meleeVsCityBonus: 4, unitClassCombat: { cavalry: 4 } }, 10);
      player.gold += 150;
      allCitiesModifier(state, player, "siege_626_cost", { yieldPercent: { production: -10 } }, 10);
      log(state, `${player.name} mounted the Siege of 626.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },
  golden_horde: {
    id: "golden_horde", name: "Tribute of the Rus",
    desc: "Gain 400 gold and +25% raid gold for 10 turns; −10% culture.", unlock: { kind: "tech", id: "equestrian" }, cooldown: 25,
    use: (state, player) => {
      player.gold += 400;
      addPlayerModifier(state, player, "tribute_of_rus", { raidGoldPercent: 25 }, 10);
      allCitiesModifier(state, player, "tribute_of_rus_cost", { yieldPercent: { culture: -10 } }, 10);
      log(state, `${player.name} exacted the Tribute of the Rus.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },
  chimu: {
    id: "chimu", name: "Goldsmiths of Chimor",
    desc: "Instantly gain 250 gold and 100 culture; −10% production for 5 turns.", unlock: { kind: "tech", id: "masonry" }, cooldown: 20,
    use: (state, player) => {
      player.gold += 250;
      player.cultureProgress += 100;
      allCitiesModifier(state, player, "goldsmiths_cost", { yieldPercent: { production: -10 } }, 5);
      log(state, `${player.name} commissioned the Goldsmiths of Chimor.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },
  moche: {
    id: "moche", name: "Sacrifice Ceremony",
    desc: "Gain 100 faith and melee +3 strength for 10 turns. Costs 2 capital population.", unlock: { kind: "tech", id: "ritual_burial" }, cooldown: 25,
    use: (state, player) => {
      const capital = capitalOf(state, player);
      if (!capital || capital.population < 2) return fail("capital needs 2 population");
      player.faith += 100;
      addPlayerModifier(state, player, "sacrifice_ceremony", { unitClassCombat: { melee: 3 } }, 10);
      removePopulation(state, player, 2);
      log(state, `${player.name} held the Sacrifice Ceremony.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },
  tiwanaku: {
    id: "tiwanaku", name: "Raised Fields",
    desc: "Fresh-water tiles +3 food for 10 turns; −10% production.", unlock: { kind: "tech", id: "cultivation" }, cooldown: 20,
    use: (state, player) => {
      allCitiesModifier(state, player, "raised_fields", { freshWaterTileFoodBonus: 3 }, 10);
      allCitiesModifier(state, player, "raised_fields_cost", { yieldPercent: { production: -10 } }, 10);
      log(state, `${player.name} built Raised Fields.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },
  tarascans: {
    id: "tarascans", name: "Bronze Arms",
    desc: "All units +2 combat strength and all cities +25% production for 10 turns; −10% gold.", unlock: { kind: "tech", id: "smelting" }, cooldown: 25,
    use: (state, player) => {
      addPlayerModifier(state, player, "bronze_arms", { unitClassCombat: { melee: 2, cavalry: 2, ranged: 2 } }, 10);
      allCitiesModifier(state, player, "bronze_arms_prod", { yieldPercent: { production: 25 } }, 10);
      allCitiesModifier(state, player, "bronze_arms_cost", { yieldPercent: { gold: -10 } }, 10);
      log(state, `${player.name} forged Bronze Arms.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },
  taino: {
    id: "taino", name: "Areíto Gathering",
    desc: "Gain 50 faith and +10% culture for 10 turns; −10% production for 5 turns.", unlock: { kind: "civic", id: "political_philosophy" }, cooldown: 20,
    use: (state, player) => {
      player.faith += 50;
      allCitiesModifier(state, player, "areito", { yieldPercent: { culture: 10 } }, 10);
      allCitiesModifier(state, player, "areito_cost", { yieldPercent: { production: -10 } }, 5);
      log(state, `${player.name} held an Areíto Gathering.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },
  tonga: {
    id: "tonga", name: "Voyage of Tribute",
    desc: "Island cities +3 gold and +1 faith and naval +2 movement for 10 turns; land units −1 movement.", unlock: { kind: "tech", id: "sailing" }, cooldown: 20,
    use: (state, player) => {
      addPlayerModifier(state, player, "voyage_of_tribute", { islandCityYield: { gold: 3, faith: 1 }, navalMovementBonus: 2 }, 10);
      addPlayerModifier(state, player, "voyage_of_tribute_cost", { landMovementBonus: -1 }, 10);
      log(state, `${player.name} set out on a Voyage of Tribute.`, { actorId: player.id, targetIds: [player.id] });
      return ok();
    },
  },
};

export function getLeaderAbilityForCiv(civId: string): LeaderAbilityDef | undefined {
  return LEADER_ABILITIES[civId];
}

/** Display name of the tech or civic that unlocks a leader ability. */
export function leaderAbilityUnlockLabel(def: LeaderAbilityDef): string {
  if (def.unlock.kind === "tech") return TECH_DEFS[def.unlock.id].name;
  return getCivic(def.unlock.id)?.name ?? def.unlock.id;
}

export function canUseLeaderAbility(state: GameState, player: Player): LeaderAbilityResult {
  const civId = player.civId;
  if (!civId) return fail("player has no civilization");
  const def = getLeaderAbilityForCiv(civId);
  if (!def) return fail(`${civId} has no active leader ability`);
  if (!leaderAbilityUnlocked(state, player, def)) return fail(`${def.name} is not yet unlocked`);
  const remaining = leaderAbilityCooldownRemaining(state, player, def);
  if (remaining > 0) return fail(`${def.name} is on cooldown for ${remaining} more turns`);
  return ok();
}

export function useLeaderAbility(state: GameState, player: Player): LeaderAbilityResult {
  const civId = player.civId;
  if (!civId) return fail("player has no civilization");
  const def = getLeaderAbilityForCiv(civId);
  if (!def) return fail(`${civId} has no active leader ability`);
  const can = canUseLeaderAbility(state, player);
  if (!can.ok) return can;
  const result = def.use(state, player);
  if (!result.ok) return result;
  player.leaderAbilityLastUsedTurn = state.turn;
  log(state, `${player.name} used ${def.name}.`, { actorId: player.id, targetIds: [player.id] });
  return ok();
}
