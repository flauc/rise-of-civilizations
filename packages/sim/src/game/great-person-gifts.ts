// Per-figure Great Person activation gifts — each non-prophet figure carries a
// distinct `GreatPersonGift` in @roc/data, resolved here on activate/preview.
// Prophets keep their separate `prophetGift` path in great-people.ts.

import { axialDistance, getTile, offsetToAxial, type Axial } from "@roc/shared";
import type { CivEffects, GreatPersonGift } from "@roc/data";
import type { City, GameState, Player, Unit } from "./state";
import { citiesOf, makeUnit, unitAt, unitsOf } from "./state";
import { BUILDING_DEFS, UNIT_DEFS, isMilitary, isNaval, type BuildingId, type UnitTypeId } from "./content";
import { unitMaxHp } from "./combat";
import { offsetNeighbors } from "./movement";
import { GLOBAL_MORALE_MAX, globalMoraleOf, recordMoraleEvent, recordMoraleGain, startingUnitMorale } from "./morale";
import { isWaterTerrain } from "./terrain";

export interface GiftPreview {
  summary: string;
  detail: string;
}

function ax(u: { col: number; row: number }): Axial {
  return offsetToAxial(u);
}

function addModifier(state: GameState, player: Player, source: string, effect: Partial<CivEffects>, turns: number): void {
  (player.modifiers ??= []).push({ source, effect, expiresOnTurn: state.turn + turns });
}

function liftMorale(state: GameState, player: Player, by: number, reason: string): void {
  const before = globalMoraleOf(player);
  player.globalMorale = Math.min(GLOBAL_MORALE_MAX, (player.globalMorale ?? 50) + by);
  recordMoraleEvent(state, player.id, before, reason);
  recordMoraleGain(state, player.id);
}

/** The city best suited to receive production or a Great Work. */
export function bestProductionCity(state: GameState, playerId: number): City | undefined {
  const cities = citiesOf(state, playerId);
  if (cities.length === 0) return undefined;
  return cities.find((c) => c.isCapital) ?? cities[0];
}

function bestCitiesWithoutBuilding(state: GameState, player: Player, building: string, count: number): City[] {
  return citiesOf(state, player.id)
    .filter((c) => !c.buildings.includes(building as BuildingId))
    .sort((a, b) => b.population - a.population)
    .slice(0, count);
}

function listCities(cities: City[]): string {
  const names = cities.map((c) => c.name);
  if (names.length <= 1) return names[0] ?? "your cities";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

function isLandMilitary(type: UnitTypeId): boolean {
  const def = UNIT_DEFS[type];
  return isMilitary(type) && !isNaval(def);
}

function isCavalry(type: UnitTypeId): boolean {
  return UNIT_DEFS[type].cls === "cavalry";
}

function isNavalUnit(type: UnitTypeId): boolean {
  return isNaval(UNIT_DEFS[type]);
}

function drillUnits(state: GameState, playerId: number, promotions: number, filter: (u: Unit) => boolean): number {
  let n = 0;
  for (const u of unitsOf(state, playerId)) {
    if (!filter(u)) continue;
    u.unspentPromotions += promotions;
    n += 1;
  }
  return n;
}

function healUnits(state: GameState, playerId: number, filter: (u: Unit) => boolean): number {
  let n = 0;
  for (const u of unitsOf(state, playerId)) {
    if (!filter(u)) continue;
    const full = unitMaxHp(u);
    if (u.hp < full) {
      u.hp = full;
      n += 1;
    }
  }
  return n;
}

function healAllWounded(state: GameState, playerId: number): number {
  return healUnits(state, playerId, (u) => u.hp < unitMaxHp(u));
}

function playerFaithId(state: GameState, player: Player): string | undefined {
  if (player.foundedReligionId) return player.foundedReligionId;
  for (const c of citiesOf(state, player.id)) if (c.religion) return c.religion;
  return undefined;
}

function addFaithPressure(city: City, relId: string, amount: number): void {
  (city.religionPressure ??= {})[relId] = (city.religionPressure[relId] ?? 0) + amount;
}

function addGreatWork(state: GameState, player: Player, title: string, culture: number): string {
  player.cultureProgress += culture;
  const city = bestProductionCity(state, player.id);
  if (city) {
    if (!city.greatWorks) city.greatWorks = [];
    city.greatWorks.push({ id: state.nextEntityId++, title });
    return `+${culture} culture and "${title}" in ${city.name}`;
  }
  return `+${culture} culture`;
}

function spawnShipAtCoast(state: GameState, player: Player, shipType: UnitTypeId): string {
  const cities = citiesOf(state, player.id);
  for (const city of cities) {
    for (const n of offsetNeighbors(state.map, city.col, city.row)) {
      const tile = getTile(state.map, n.col, n.row);
      if (!tile || !isWaterTerrain(tile.terrain) || unitAt(state, n.col, n.row)) continue;
      const id = state.nextEntityId++;
      const morale = startingUnitMorale(state, player.id);
      state.units.set(id, makeUnit(id, player.id, shipType, n.col, n.row, 0, morale));
      return `a free ${UNIT_DEFS[shipType].name} at ${city.name}`;
    }
  }
  return "no coastal water was free for a ship";
}

function revealAroundCities(state: GameState, player: Player, radius: number): number {
  let n = 0;
  for (const city of citiesOf(state, player.id)) {
    const center = ax(city);
    for (let col = 0; col < state.map.cols; col++) {
      for (let row = 0; row < state.map.rows; row++) {
        if (axialDistance(center, offsetToAxial({ col, row })) > radius) continue;
        const key = `${col},${row}`;
        if (!player.explored.has(key)) {
          player.explored.add(key);
          n += 1;
        }
      }
    }
  }
  return n;
}

/** Apply a per-figure gift. Returns a short human-readable summary. */
export function applyGreatPersonGift(
  state: GameState,
  player: Player,
  figureName: string,
  gift: GreatPersonGift,
): string {
  switch (gift.kind) {
    case "drill_land": {
      const n = drillUnits(state, player.id, gift.promotions, (u) => isLandMilitary(u.type));
      liftMorale(state, player, gift.morale, `${figureName} drilled the army`);
      return n > 0 ? `a free promotion to ${n} land unit${n === 1 ? "" : "s"}` : "your army is heartened";
    }
    case "drill_double": {
      const n = drillUnits(state, player.id, gift.promotions, (u) => isLandMilitary(u.type));
      liftMorale(state, player, gift.morale, `${figureName} reformed the legions`);
      return n > 0 ? `${gift.promotions} free promotions to ${n} land unit${n === 1 ? "" : "s"}` : "your army is heartened";
    }
    case "drill_cavalry": {
      if (gift.healCavalry) healUnits(state, player.id, (u) => isCavalry(u.type));
      const n = drillUnits(state, player.id, gift.promotions, (u) => isCavalry(u.type));
      liftMorale(state, player, gift.morale, `${figureName} rallied the cavalry`);
      return n > 0 ? `healed cavalry and promoted ${n} mounted unit${n === 1 ? "" : "s"}` : "your cavalry is heartened";
    }
    case "scipios_genius": {
      const n = drillUnits(state, player.id, gift.promotions, (u) => isLandMilitary(u.type));
      addModifier(state, player, figureName, { combatVsUniqueUnit: gift.combatVsUnique }, gift.turns);
      liftMorale(state, player, gift.morale, `${figureName} taught the legions`);
      return `+${gift.combatVsUnique} vs unique units for ${gift.turns} turns` + (n > 0 ? `; promoted ${n} unit${n === 1 ? "" : "s"}` : "");
    }
    case "martel_hammer": {
      const n = drillUnits(state, player.id, gift.promotions, (u) => isLandMilitary(u.type));
      addModifier(state, player, figureName, { cityDefenseBonus: gift.cityDefenseBonus }, gift.turns);
      liftMorale(state, player, gift.morale, `${figureName} held the line`);
      return `+${gift.cityDefenseBonus} city defense for ${gift.turns} turns` + (n > 0 ? `; promoted ${n} unit${n === 1 ? "" : "s"}` : "");
    }
    case "baibars_victory": {
      const n = drillUnits(state, player.id, gift.promotions, (u) => isLandMilitary(u.type));
      addModifier(state, player, figureName, { faithOnKill: gift.faithOnKill }, gift.turns);
      liftMorale(state, player, gift.morale, `${figureName} led the Mamluks`);
      return `+${gift.faithOnKill} faith per kill for ${gift.turns} turns` + (n > 0 ? `; promoted ${n} unit${n === 1 ? "" : "s"}` : "");
    }
    case "guerrilla_eagle": {
      const n = drillUnits(state, player.id, gift.promotions, (u) => isLandMilitary(u.type));
      addModifier(state, player, figureName, { raidGoldPercent: gift.raidGoldPercent }, gift.turns);
      liftMorale(state, player, gift.morale, `${figureName} waged petite guerre`);
      return `+${gift.raidGoldPercent}% raid gold for ${gift.turns} turns` + (n > 0 ? `; promoted ${n} unit${n === 1 ? "" : "s"}` : "");
    }
    case "tercio": {
      const n = drillUnits(state, player.id, gift.promotions, (u) => isLandMilitary(u.type));
      addModifier(state, player, figureName, { gunpowderCombatBonus: gift.gunpowderCombat }, gift.turns);
      liftMorale(state, player, gift.morale, `${figureName} drilled the tercios`);
      return `+${gift.gunpowderCombat} gunpowder combat for ${gift.turns} turns` + (n > 0 ? `; promoted ${n} unit${n === 1 ? "" : "s"}` : "");
    }
    case "spawn_trireme": {
      const healed = healAllWounded(state, player.id);
      liftMorale(state, player, gift.morale, `${figureName} saved the fleet`);
      const ship = spawnShipAtCoast(state, player, "trireme");
      return healed > 0 ? `healed ${healed} units, ${ship}` : ship;
    }
    case "corvus": {
      const healed = healUnits(state, player.id, (u) => isNavalUnit(u.type));
      addModifier(state, player, figureName, { navalMeleeCombatBonus: gift.navalMeleeBonus }, gift.turns);
      liftMorale(state, player, gift.morale, `${figureName} boarded the enemy`);
      return `+${gift.navalMeleeBonus} naval melee for ${gift.turns} turns` + (healed > 0 ? `; healed ${healed} ship${healed === 1 ? "" : "s"}` : "");
    }
    case "artemisia_retreat": {
      const healed = healUnits(state, player.id, (u) => isNavalUnit(u.type));
      addModifier(
        state,
        player,
        figureName,
        {
          unitClassCombat: { naval_melee: gift.navalCombat, naval_ranged: gift.navalCombat },
          navalMovementBonus: gift.navalMovementBonus,
        },
        gift.turns,
      );
      liftMorale(state, player, gift.morale, `${figureName} struck and faded`);
      return `ships fight at +${gift.navalCombat} and sail +${gift.navalMovementBonus} movement for ${gift.turns} turns`;
    }
    case "vinland": {
      const healed = healUnits(state, player.id, (u) => isNavalUnit(u.type));
      addModifier(state, player, figureName, { navalMovementBonus: gift.navalMovementBonus }, gift.turns);
      liftMorale(state, player, gift.morale, `${figureName} crossed the ocean`);
      return `+${gift.navalMovementBonus} ship movement for ${gift.turns} turns` + (healed > 0 ? `; healed ${healed} ship${healed === 1 ? "" : "s"}` : "");
    }
    case "genoa_repair": {
      const healed = healUnits(state, player.id, (u) => isNavalUnit(u.type));
      player.gold += gift.gold;
      liftMorale(state, player, gift.morale, `${figureName} freed Genoa`);
      return `+${gift.gold} gold` + (healed > 0 ? ` and healed ${healed} ship${healed === 1 ? "" : "s"}` : "");
    }
    case "armada": {
      const healed = healAllWounded(state, player.id);
      addModifier(state, player, figureName, { raidGoldPercent: gift.raidGoldPercent }, 12);
      liftMorale(state, player, gift.morale, `${figureName} singed the Armada`);
      return healed > 0
        ? `healed ${healed} units; +${gift.raidGoldPercent}% raid gold for 12 turns`
        : `+${gift.raidGoldPercent}% raid gold for 12 turns`;
    }
    case "science_burst":
    case "science_double": {
      player.scienceProgress += gift.science;
      return `+${gift.science} science`;
    }
    case "science_siege": {
      player.scienceProgress += gift.science;
      addModifier(state, player, figureName, { unitClassCombat: { siege: gift.siegeBonus } }, gift.turns);
      return `+${gift.science} science; siege units +${gift.siegeBonus} for ${gift.turns} turns`;
    }
    case "library_empire":
    case "university_boost": {
      player.scienceProgress += gift.science;
      addModifier(state, player, figureName, { yieldPercent: { science: gift.sciencePercent } }, gift.turns);
      return `+${gift.science} science; +${gift.sciencePercent}% science for ${gift.turns} turns`;
    }
    case "production_surge":
    case "wonder_push":
    case "dome_rush": {
      const city = bestProductionCity(state, player.id);
      if (city) city.productionStored += gift.production;
      return `+${gift.production} production in ${city?.name ?? "your capital"}`;
    }
    case "free_building": {
      const targets = bestCitiesWithoutBuilding(state, player, gift.building, gift.count);
      const bname = BUILDING_DEFS[gift.building as BuildingId]?.name ?? gift.building;
      if (targets.length > 0) {
        for (const c of targets) c.buildings.push(gift.building as BuildingId);
      }
      const city = bestProductionCity(state, player.id);
      if (city) city.productionStored += gift.production;
      return targets.length > 0
        ? `${bname} in ${listCities(targets)}; +${gift.production} production`
        : `+${gift.production} production (your cities already have ${bname})`;
    }
    case "fortify_empire": {
      const city = bestProductionCity(state, player.id);
      if (city) city.productionStored += gift.production;
      addModifier(state, player, figureName, { cityDefenseBonus: gift.cityDefenseBonus }, gift.turns);
      return `+${gift.production} production; +${gift.cityDefenseBonus} city defense for ${gift.turns} turns`;
    }
    case "workshop_genius": {
      const city = bestProductionCity(state, player.id);
      if (city) city.productionStored += gift.production;
      addModifier(state, player, figureName, { trainTimePercent: gift.trainTimePercent }, gift.turns);
      return `+${gift.production} production; ${gift.trainTimePercent}% train time for ${gift.turns} turns`;
    }
    case "gold_windfall":
    case "fugger_finance": {
      player.gold += gift.gold;
      return `+${gift.gold} gold`;
    }
    case "silk_road": {
      player.gold += gift.gold;
      addModifier(state, player, figureName, { tradeRouteGoldBonus: gift.tradeRouteGoldBonus }, gift.turns);
      return `+${gift.gold} gold; +${gift.tradeRouteGoldBonus} gold per route for ${gift.turns} turns`;
    }
    case "polo_journey": {
      player.gold += gift.gold;
      const revealed = revealAroundCities(state, player, gift.revealRadius);
      return `+${gift.gold} gold; revealed ${revealed} distant tile${revealed === 1 ? "" : "s"}`;
    }
    case "battuta_caravan": {
      player.gold += gift.gold;
      player.scienceProgress += gift.science;
      return `+${gift.gold} gold and +${gift.science} science`;
    }
    case "market_reform": {
      player.gold += gift.gold;
      addModifier(
        state,
        player,
        figureName,
        { yieldPercent: { gold: gift.yieldGoldPercent, food: gift.yieldFoodPercent } },
        gift.turns,
      );
      return `+${gift.gold} gold; +${gift.yieldGoldPercent}% gold and +${gift.yieldFoodPercent}% food for ${gift.turns} turns`;
    }
    case "medici_patron": {
      player.gold += gift.gold;
      player.cultureProgress += gift.culture;
      return `+${gift.gold} gold and +${gift.culture} culture`;
    }
    case "culture_inspire": {
      player.cultureProgress += gift.culture;
      return `+${gift.culture} culture`;
    }
    case "great_work":
      return addGreatWork(state, player, gift.workTitle, gift.culture);
    case "civic_reform": {
      player.cultureProgress += gift.culture;
      return `+${gift.culture} culture`;
    }
    case "military_reform": {
      player.cultureProgress += gift.culture;
      addModifier(state, player, figureName, { startMoraleBonus: gift.startMoraleBonus }, gift.turns);
      return `+${gift.culture} culture; new units +${gift.startMoraleBonus} morale for ${gift.turns} turns`;
    }
    case "arthashastra": {
      player.cultureProgress += gift.culture;
      player.scienceProgress += gift.science;
      player.gold += gift.gold;
      return `+${gift.culture} culture, +${gift.science} science, +${gift.gold} gold`;
    }
    case "oratory": {
      player.cultureProgress += gift.culture;
      addModifier(state, player, figureName, { yieldPercent: { culture: gift.culturePercent } }, gift.turns);
      return `+${gift.culture} culture; +${gift.culturePercent}% culture for ${gift.turns} turns`;
    }
    case "justinian_code": {
      player.cultureProgress += gift.culture;
      addModifier(state, player, figureName, { cityDefenseBonus: gift.cityDefenseBonus }, gift.turns);
      return `+${gift.culture} culture; +${gift.cityDefenseBonus} city defense for ${gift.turns} turns`;
    }
    case "administer_conquest": {
      player.cultureProgress += gift.culture;
      addModifier(state, player, figureName, { captureCityPopulationBonus: gift.capturePopBonus }, 20);
      return `+${gift.culture} culture; captured cities +${gift.capturePopBonus} population for 20 turns`;
    }
    case "loyalty_pressure": {
      player.cultureProgress += gift.culture;
      const relId = playerFaithId(state, player);
      let n = 0;
      if (relId) {
        for (const c of citiesOf(state, player.id)) {
          addFaithPressure(c, relId, gift.pressure);
          n += 1;
        }
      }
      return `+${gift.culture} culture` + (n > 0 ? `; +${gift.pressure} pressure in ${n} cit${n === 1 ? "y" : "ies"}` : "");
    }
    case "utopian_vision": {
      player.cultureProgress += gift.culture;
      liftMorale(state, player, gift.morale, `${figureName} envisioned Utopia`);
      return `+${gift.culture} culture and +${gift.morale} empire morale`;
    }
  }
}

/** Describe a gift WITHOUT mutating — mirrors applyGreatPersonGift. */
export function describeGreatPersonGift(state: GameState, player: Player, gift: GreatPersonGift): GiftPreview {
  switch (gift.kind) {
    case "drill_land": {
      const n = unitsOf(state, player.id).filter((u) => isLandMilitary(u.type)).length;
      return {
        summary: n > 0 ? `promote ${n} land unit${n === 1 ? "" : "s"}` : "hearten the army",
        detail: `Grants a free promotion to each of your ${n} land military units and lifts morale by +${gift.morale}.`,
      };
    }
    case "drill_double": {
      const n = unitsOf(state, player.id).filter((u) => isLandMilitary(u.type)).length;
      return {
        summary: n > 0 ? `${gift.promotions} promotions to ${n} units` : "hearten the army",
        detail: `Reforms the legions: ${gift.promotions} free promotions per land soldier and +${gift.morale} morale.`,
      };
    }
    case "drill_cavalry": {
      const n = unitsOf(state, player.id).filter((u) => isCavalry(u.type)).length;
      return {
        summary: n > 0 ? `heal & promote ${n} cavalry` : "hearten the cavalry",
        detail: `Heals every mounted unit and grants a free promotion to each cavalry unit (+${gift.morale} morale).`,
      };
    }
    case "scipios_genius":
      return {
        summary: `+${gift.combatVsUnique} vs unique units`,
        detail: `Drills the army and teaches them +${gift.combatVsUnique} combat vs enemy unique units for ${gift.turns} turns.`,
      };
    case "martel_hammer":
      return {
        summary: `+${gift.cityDefenseBonus} city defense`,
        detail: `Promotes the army and fortifies every city at +${gift.cityDefenseBonus} defense for ${gift.turns} turns.`,
      };
    case "baibars_victory":
      return {
        summary: `+${gift.faithOnKill} faith per kill`,
        detail: `Drills the army; kills yield +${gift.faithOnKill} faith for ${gift.turns} turns.`,
      };
    case "guerrilla_eagle":
      return {
        summary: `+${gift.raidGoldPercent}% raid gold`,
        detail: `Promotes the army and enriches every raid by +${gift.raidGoldPercent}% for ${gift.turns} turns.`,
      };
    case "tercio":
      return {
        summary: `+${gift.gunpowderCombat} gunpowder combat`,
        detail: `Drills the army and hardens gunpowder troops at +${gift.gunpowderCombat} for ${gift.turns} turns.`,
      };
    case "spawn_trireme":
      return { summary: "heal fleet · free Trireme", detail: "Heals wounded units, lifts morale, and spawns a free Trireme beside the coast." };
    case "corvus":
      return {
        summary: `+${gift.navalMeleeBonus} naval boarding`,
        detail: `Heals ships and grants +${gift.navalMeleeBonus} naval melee combat for ${gift.turns} turns.`,
      };
    case "artemisia_retreat":
      return {
        summary: `ships +${gift.navalCombat} · +${gift.navalMovementBonus} move`,
        detail: `Heals the fleet; ships fight at +${gift.navalCombat} and gain +${gift.navalMovementBonus} movement for ${gift.turns} turns.`,
      };
    case "vinland":
      return {
        summary: `+${gift.navalMovementBonus} ship movement`,
        detail: `Heals the fleet and extends ship range by +${gift.navalMovementBonus} for ${gift.turns} turns.`,
      };
    case "genoa_repair":
      return { summary: `+${gift.gold} gold · heal fleet`, detail: `Heals ships, pays +${gift.gold} gold from Genoese trade, and lifts morale.` };
    case "armada":
      return {
        summary: `heal all · +${gift.raidGoldPercent}% raids`,
        detail: `Heals every wounded unit and enriches raids by +${gift.raidGoldPercent}% for 12 turns.`,
      };
    case "science_burst":
      return { summary: `+${gift.science} science`, detail: `A burst of +${gift.science} science toward your current research.` };
    case "science_double":
      return { summary: `+${gift.science} science`, detail: `A double flash of insight worth +${gift.science} science — two eurekas at once.` };
    case "science_siege":
      return {
        summary: `+${gift.science} science · siege +${gift.siegeBonus}`,
        detail: `+${gift.science} science and siege units fight at +${gift.siegeBonus} for ${gift.turns} turns.`,
      };
    case "library_empire":
      return {
        summary: `+${gift.science} science · +${gift.sciencePercent}% science`,
        detail: `+${gift.science} science and +${gift.sciencePercent}% science empire-wide for ${gift.turns} turns.`,
      };
    case "university_boost":
      return {
        summary: `+${gift.science} science · +${gift.sciencePercent}% science`,
        detail: `+${gift.science} science and Academies shine +${gift.sciencePercent}% brighter for ${gift.turns} turns.`,
      };
    case "production_surge":
    case "wonder_push":
    case "dome_rush": {
      const where = bestProductionCity(state, player.id)?.name ?? "your capital";
      return { summary: `+${gift.production} production`, detail: `+${gift.production} production in ${where}.` };
    }
    case "free_building": {
      const targets = bestCitiesWithoutBuilding(state, player, gift.building, gift.count);
      const bname = BUILDING_DEFS[gift.building as BuildingId]?.name ?? gift.building;
      return targets.length > 0
        ? { summary: `${targets.length} free ${bname}`, detail: `Raises ${bname} in ${listCities(targets)} and +${gift.production} production.` }
        : { summary: `+${gift.production} production`, detail: `Your cities already have ${bname}; grants +${gift.production} production instead.` };
    }
    case "fortify_empire":
      return {
        summary: `+${gift.production} prod · +${gift.cityDefenseBonus} defense`,
        detail: `Production surge and +${gift.cityDefenseBonus} city defense for ${gift.turns} turns.`,
      };
    case "workshop_genius":
      return {
        summary: `+${gift.production} prod · faster training`,
        detail: `+${gift.production} production and ${gift.trainTimePercent}% training time for ${gift.turns} turns.`,
      };
    case "gold_windfall":
    case "fugger_finance":
      return { summary: `+${gift.gold} gold`, detail: `Pours +${gift.gold} gold into your treasury.` };
    case "silk_road":
      return {
        summary: `+${gift.gold} gold · richer routes`,
        detail: `+${gift.gold} gold now and +${gift.tradeRouteGoldBonus} gold per trade route for ${gift.turns} turns.`,
      };
    case "polo_journey":
      return { summary: `+${gift.gold} gold · reveal lands`, detail: `+${gift.gold} gold and reveals distant tiles around your cities.` };
    case "battuta_caravan":
      return { summary: `+${gift.gold} gold · +${gift.science} science`, detail: `Gold and knowledge from the far caravan roads.` };
    case "market_reform":
      return {
        summary: `+${gift.gold} gold · market reform`,
        detail: `+${gift.gold} gold and +${gift.yieldGoldPercent}% gold / +${gift.yieldFoodPercent}% food for ${gift.turns} turns.`,
      };
    case "medici_patron":
      return { summary: `+${gift.gold} gold · +${gift.culture} culture`, detail: `Banking windfall and artistic patronage.` };
    case "culture_inspire":
      return { summary: `+${gift.culture} culture`, detail: `Inspires your people with +${gift.culture} culture.` };
    case "great_work": {
      const where = bestProductionCity(state, player.id)?.name ?? "your capital";
      return {
        summary: `+${gift.culture} culture · Great Work`,
        detail: `+${gift.culture} culture and leaves "${gift.workTitle}" as a Great Work in ${where}.`,
      };
    }
    case "civic_reform":
      return { summary: `+${gift.culture} culture`, detail: `Enacts reforms worth +${gift.culture} culture toward civics.` };
    case "military_reform":
      return {
        summary: `+${gift.culture} culture · sterner recruits`,
        detail: `+${gift.culture} culture and new units start with +${gift.startMoraleBonus} morale for ${gift.turns} turns.`,
      };
    case "arthashastra":
      return {
        summary: `culture · science · gold`,
        detail: `+${gift.culture} culture, +${gift.science} science, and +${gift.gold} gold from shrewd statecraft.`,
      };
    case "oratory":
      return {
        summary: `+${gift.culture} culture · +${gift.culturePercent}% culture`,
        detail: `+${gift.culture} culture and +${gift.culturePercent}% culture for ${gift.turns} turns.`,
      };
    case "justinian_code":
      return {
        summary: `+${gift.culture} culture · +${gift.cityDefenseBonus} defense`,
        detail: `Codifies law (+${gift.culture} culture) and +${gift.cityDefenseBonus} city defense for ${gift.turns} turns.`,
      };
    case "administer_conquest":
      return {
        summary: `+${gift.culture} culture · stabilize conquests`,
        detail: `+${gift.culture} culture; captured cities gain +${gift.capturePopBonus} population for 20 turns.`,
      };
    case "loyalty_pressure": {
      const n = citiesOf(state, player.id).length;
      return {
        summary: `+${gift.culture} culture · pressure surge`,
        detail: `+${gift.culture} culture and +${gift.pressure} religious pressure across your ${n} cities.`,
      };
    }
    case "utopian_vision":
      return {
        summary: `+${gift.culture} culture · +${gift.morale} morale`,
        detail: `+${gift.culture} culture toward civics and +${gift.morale} empire morale.`,
      };
  }
}
