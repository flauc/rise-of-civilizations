import { axialDistance, getTile, offsetToAxial } from "@roc/shared";
import type { GameState, City, Player, Unit } from "./state";
import { cityAt, log, makeUnit, playerById, unitAt, unitsOf } from "./state";
import { addYields, TERRAIN_YIELDS, ZERO_YIELDS, isWaterTerrain, isForestTerrain, type Yields } from "./terrain";
import { improvementYields } from "./improvements";
import { resourceYields, resourceStock, cityGrowthMultiplier } from "./resources";
import { naturalWonderYields, naturalWonderCulture } from "./natural-wonders";
import { expandTerritory } from "./territory";
import { getWonder, uniqueBuildingForCiv, type CivEffects } from "@roc/data";
import { civEffectsOf, cityEffects, getCivic, uniqueUnitForCiv } from "./civs";
import { cityTradeYields } from "./trade";
import { workerSlots } from "./specialists";
import { cityMaxHp } from "./combat";
import { startingUnitMorale, BARRACKS_MORALE_BONUS, upkeepGoldMultiplier, upkeepModifierPct, minMilitaryPayCost, onBankruptcy } from "./morale";
import { offsetNeighbors, isCoastalLand } from "./movement";
import {
  emitCityGrew,
  emitCivicComplete,
  emitProductionComplete,
  emitResearchComplete,
  emitTreasuryExhausted,
} from "./turn-updates";
import {
  BUILDING_DEFS,
  PROJECT_DEFS,
  TECH_DEFS,
  UNIT_DEFS,
  advanceResearchQueue,
  getBuildingDef,
  type TechId,
} from "./content";

export interface CityYields {
  food: number;
  production: number;
  gold: number;
  science: number;
  culture: number;
  faith: number;
}

const CITY_RADIUS = 2;

/** Tiles within the city's work radius (owned by it) that a citizen may work. */
export function workableTiles(state: GameState, city: City): { col: number; row: number }[] {
  const { map } = state;
  const center = offsetToAxial({ col: city.col, row: city.row });
  const tiles: { col: number; row: number }[] = [];
  for (let r = city.row - CITY_RADIUS; r <= city.row + CITY_RADIUS; r++) {
    for (let c = city.col - CITY_RADIUS - 1; c <= city.col + CITY_RADIUS + 1; c++) {
      if (c < 0 || r < 0 || c >= map.cols || r >= map.rows) continue;
      if (c === city.col && r === city.row) continue;
      if (axialDistance(center, offsetToAxial({ col: c, row: r })) > CITY_RADIUS) {
        continue;
      }
      const tile = getTile(map, c, r);
      // Only tiles inside this city's territory can be worked.
      if (!tile || tile.ownerCityId !== city.id) continue;
      const other = cityAt(state, c, r);
      if (other && other.id !== city.id) continue;
      tiles.push({ col: c, row: r });
    }
  }
  return tiles;
}

/** Citizen-assignment desirability of a tile's yields (food-leaning early). */
export function citizenScore(y: Yields): number {
  return y.food * 1.0 + y.production * 0.8 + y.gold * 0.5 + y.science * 0.6;
}

/** True if the tile has fresh water (lake or adjacent lake). Rivers/marsh are not separate terrains in this map model. */
function isFreshWaterTile(state: GameState, col: number, row: number): boolean {
  const tile = getTile(state.map, col, row);
  if (!tile) return false;
  if (tile.terrain === "lake") return true;
  for (const n of offsetNeighbors(state.map, col, row)) {
    const nt = getTile(state.map, n.col, n.row);
    if (nt?.terrain === "lake") return true;
  }
  return false;
}

/** True if the tile carries tree cover (forest/woods/jungle/taiga). */
function isForestTile(state: GameState, col: number, row: number): boolean {
  const tile = getTile(state.map, col, row);
  return !!tile && isForestTerrain(tile.terrain);
}

/** True if the tile is a hill or mesa. */
function isHillTile(state: GameState, col: number, row: number): boolean {
  const tile = getTile(state.map, col, row);
  return !!tile && (tile.terrain === "hills" || tile.terrain === "mesa");
}

/** Base + improvement yields of a single tile, plus tile-specific leader-ability bonuses. */
function tileWorkYields(state: GameState, col: number, row: number, eff: CivEffects): Yields {
  const tile = getTile(state.map, col, row);
  if (!tile) return ZERO_YIELDS;
  const base = addYields(
    addYields(
      addYields(TERRAIN_YIELDS[tile.terrain], improvementYields(tile.improvement, tile.improvementLevel)),
      resourceYields(tile),
    ),
    naturalWonderYields(tile),
  );
  // Leader-ability tile bonuses.
  if (tile.improvement === "mine") {
    base.production += eff.mineTileProductionBonus ?? 0;
    base.food -= eff.mineTileFoodPenalty ?? 0;
  }
  if (tile.improvement === "pasture") {
    base.gold += eff.pastureTileGoldBonus ?? 0;
    base.food += eff.pastureTileFoodBonus ?? 0;
  }
  if (tile.improvement === "farm") {
    base.food += eff.farmTileFoodBonus ?? 0;
    base.faith += eff.farmTileFaithBonus ?? 0;
  }
  if (isForestTile(state, col, row)) {
    base.faith += eff.forestTileFaithBonus ?? 0;
  }
  if (isHillTile(state, col, row)) {
    base.production += eff.hillTileProductionBonus ?? 0;
  }
  if (isFreshWaterTile(state, col, row)) {
    base.food += eff.freshWaterTileFoodBonus ?? 0;
    base.production += eff.freshWaterTileProductionBonus ?? 0;
  }
  if (isWaterTerrain(tile.terrain)) {
    base.gold += eff.coastalTileGoldBonus ?? 0;
  }
  return base;
}

/** Compute a city's per-turn yields, auto-assigning the best worked tiles. */
export function getCityYields(state: GameState, city: City): CityYields {
  const { map } = state;
  // City center tile (guaranteed minimum 1 food / 1 production).
  const eff = mergeCivEffects(civEffectsOf(state, city.ownerId), cityEffects(state, city));
  const cBase = tileWorkYields(state, city.col, city.row, eff);
  let food = Math.max(1, cBase.food);
  let production = Math.max(1, cBase.production);
  let gold = cBase.gold;
  let science = 1; // base research from every city
  let culture = 1; // base culture from every city
  let faith = cBase.faith; // faith from tiles and leader abilities

  const desertGold = eff.goldPerWorkedDesert ?? 0;
  const centerTile = getTile(map, city.col, city.row);
  if (centerTile?.terrain === "desert") gold += desertGold;
  science += cBase.science;

  // City-type leader-ability flat yields.
  if (centerTile && isCoastalLand(state, city.col, city.row)) {
    const b = eff.coastalCityYield;
    if (b) { food += b.food ?? 0; production += b.production ?? 0; gold += b.gold ?? 0; science += b.science ?? 0; culture += b.culture ?? 0; faith += b.faith ?? 0; }
  }
  if (centerTile?.terrain === "desert") {
    const b = eff.desertCityYield;
    if (b) { food += b.food ?? 0; production += b.production ?? 0; gold += b.gold ?? 0; science += b.science ?? 0; culture += b.culture ?? 0; faith += b.faith ?? 0; }
  }

  // Tiles this city's citizens are assigned to. Citizens trained as specialists
  // no longer work tiles, so only the first `workerSlots` assignments count.
  const cap = workerSlots(city);
  for (const key of city.workedTiles.slice(0, cap)) {
    const [col, row] = key.split(",").map(Number) as [number, number];
    const tile = getTile(map, col, row);
    if (!tile || tile.ownerCityId !== city.id) continue; // ignore lost tiles
    const y = tileWorkYields(state, col, row, eff);
    food += y.food;
    production += y.production;
    gold += y.gold;
    science += y.science;
    faith += y.faith;
    culture += naturalWonderCulture(tile); // scenic wonders inspire culture
    if (tile.terrain === "desert") gold += desertGold;
  }

  // Specialists give a small flat craft upkeep to their city between/while at work.
  production += Math.floor(city.specialists.length * 0.25);

  // Buildings (generic + civ-unique).
  for (const b of city.buildings) {
    const def = getBuildingDef(b);
    if (!def) continue;
    food += def.yields.food ?? 0;
    production += def.yields.production ?? 0;
    gold += def.yields.gold ?? 0;
    science += def.yields.science ?? 0;
    culture += def.yields.culture ?? 0;
    faith += def.yields.faith ?? 0;
  }

  if (city.isCapital) {
    production += 1;
    science += 1;
    culture += 1;
  }

  // Trade routes (origin city gets the bulk; destination a small share).
  const trade = cityTradeYields(state, city);
  food += trade.food;
  production += trade.production;
  gold += trade.gold + (eff.tradeRouteGoldBonus ?? 0);
  science += trade.science;
  faith += eff.tradeRouteFaithBonus ?? 0;

  // Wonders: empire-wide (every owned city) + host-city effects.
  const empireWonders = new Set<string>();
  for (const c of state.cities.values()) {
    if (c.ownerId === city.ownerId) for (const w of c.wonders) empireWonders.add(w);
  }
  const applyW = (e: { food?: number; production?: number; gold?: number; science?: number; culture?: number; faith?: number } | undefined): void => {
    if (!e) return;
    food += e.food ?? 0;
    production += e.production ?? 0;
    gold += e.gold ?? 0;
    science += e.science ?? 0;
    culture += e.culture ?? 0;
    faith += e.faith ?? 0;
  };
  for (const id of empireWonders) applyW(getWonder(id)?.effect.yieldPerCity);
  for (const id of city.wonders) applyW(getWonder(id)?.effect.yieldHostCity);

  // Civ / government / policy / leader-ability yield bonuses (percentage).
  const pct = eff.yieldPercent;
  if (pct) {
    food = Math.floor(food * (1 + (pct.food ?? 0) / 100));
    production = Math.floor(production * (1 + (pct.production ?? 0) / 100));
    gold = Math.floor(gold * (1 + (pct.gold ?? 0) / 100));
    science = Math.floor(science * (1 + (pct.science ?? 0) / 100));
    culture = Math.floor(culture * (1 + (pct.culture ?? 0) / 100));
    faith = Math.floor(faith * (1 + (pct.faith ?? 0) / 100));
  }
  // Non-desert city food penalty/bonus.
  if (centerTile?.terrain !== "desert" && eff.nonDesertCityFoodPercent) {
    food = Math.floor(food * (1 + eff.nonDesertCityFoodPercent / 100));
  }
  return { food, production, gold, science, culture, faith };
}

/** Merge two CivEffects objects into a single object. */
function mergeCivEffects(a: CivEffects, b: CivEffects): CivEffects {
  const out: CivEffects = { ...a };
  // Re-apply merge logic by summing numeric fields and OR-ing booleans.
  // For this helper we only need the fields consumed by getCityYields.
  for (const k of ["coastalCityYield", "desertCityYield", "islandCityYield"] as const) {
    const av = a[k];
    const bv = b[k];
    if (av && bv) {
      (out[k] as NonNullable<CivEffects[typeof k]>) = { ...av };
      for (const kk of ["food", "production", "gold", "science", "culture", "faith"] as const) {
        if (bv[kk]) (out[k] as NonNullable<CivEffects[typeof k]>)[kk] = ((out[k] as NonNullable<CivEffects[typeof k]>)[kk] ?? 0) + bv[kk]!;
      }
    } else if (bv) {
      out[k] = { ...bv };
    }
  }
  for (const k of [
    "goldPerWorkedDesert", "tradeRouteGoldBonus", "tradeRouteFaithBonus",
    "mineTileProductionBonus", "mineTileFoodPenalty", "pastureTileGoldBonus", "pastureTileFoodBonus",
    "farmTileFoodBonus", "farmTileFaithBonus", "forestTileFaithBonus", "hillTileProductionBonus",
    "freshWaterTileFoodBonus", "freshWaterTileProductionBonus", "coastalTileGoldBonus", "nonDesertCityFoodPercent",
  ] as const) {
    const av = a[k] ?? 0;
    const bv = b[k] ?? 0;
    if (av || bv) out[k] = (av as number) + (bv as number);
  }
  if (b.yieldPercent) {
    out.yieldPercent ??= {};
    for (const k of ["food", "production", "gold", "science", "culture", "faith"] as const) {
      if (b.yieldPercent[k]) out.yieldPercent[k] = (out.yieldPercent[k] ?? 0) + b.yieldPercent[k]!;
    }
  }
  return out;
}

export function foodToGrow(population: number): number {
  return 8 + 3 * (population - 1);
}

/** Raw food surplus a city banks each turn before the growth multiplier:
 *  total food yield minus 1 per citizen. Negative when the city is starving. */
export function cityFoodSurplus(state: GameState, city: City): number {
  return getCityYields(state, city).food - city.population;
}

/**
 * Net food actually added to (or drained from) a city's store this turn. A
 * positive surplus is scaled by the amenity growth multiplier but always nets at
 * least +1 so a fed city never stalls; a deficit drains at the raw rate. This is
 * the single source of truth shared by the sim and the UI's growth read-out.
 */
export function cityFoodGrowth(state: GameState, city: City, surplus = cityFoodSurplus(state, city)): number {
  if (surplus <= 0) return surplus;
  return Math.max(1, Math.floor(surplus * cityGrowthMultiplier(state, city)));
}

const keyOf = (t: { col: number; row: number }) => `${t.col},${t.row}`;

/** A per-city scorer ranking a tile by how profitable it is to work — using the
 *  full tile yields (terrain + improvement + resource + leader-ability bonuses),
 *  so a freshly-completed improvement immediately makes its tile more desirable. */
function tileScorer(state: GameState, city: City): (key: string) => number {
  const eff = mergeCivEffects(civEffectsOf(state, city.ownerId), cityEffects(state, city));
  return (key: string): number => {
    const [c, r] = key.split(",").map(Number) as [number, number];
    const tile = getTile(state.map, c, r);
    return tile ? citizenScore(tileWorkYields(state, c, r, eff)) : -Infinity;
  };
}

/**
 * Re-optimise a city's worked tiles. Tiles the player locked (manual picks) are
 * always kept — best-scoring first if they exceed capacity — and the remaining
 * citizen slots are filled with the highest-yield unlocked tiles. Because the
 * unlocked set is recomputed from scratch every call, a citizen on a now-inferior
 * tile is reshuffled onto a better one (e.g. once an improvement completes),
 * while manual assignments stay put. Also drops capacity (specialists/starvation)
 * and lost-territory tiles.
 */
export function autoAssignCitizens(state: GameState, city: City): void {
  const cap = workerSlots(city);
  const score = tileScorer(state, city);
  const valid = new Set(workableTiles(state, city).map(keyOf));
  // Drop locks on tiles we can no longer work (lost territory, etc.).
  const locked = [...new Set(city.lockedTiles ?? [])].filter((k) => valid.has(k));
  // Honour locks first; if they exceed capacity, work the best-scoring of them.
  const workedLocked = [...locked].sort((a, b) => score(b) - score(a)).slice(0, cap);
  const lockedSet = new Set(workedLocked);
  // Fill the rest with the best unlocked tiles.
  const auto = [...valid]
    .filter((k) => !lockedSet.has(k))
    .sort((a, b) => score(b) - score(a))
    .slice(0, Math.max(0, cap - workedLocked.length));
  city.lockedTiles = locked;
  city.workedTiles = [...workedLocked, ...auto];
}

/** Manually toggle a citizen on/off a tile. Assigning *locks* the tile so it is
 *  preserved through auto-optimisation; toggling it again unlocks it and hands
 *  the citizen back to automatic management. */
export function toggleCitizen(state: GameState, city: City, col: number, row: number): boolean {
  const key = `${col},${row}`;
  city.lockedTiles ??= [];
  // Already assigned here → unlock and free the citizen.
  if (city.lockedTiles.includes(key) || city.workedTiles.includes(key)) {
    city.lockedTiles = city.lockedTiles.filter((k) => k !== key);
    city.workedTiles = city.workedTiles.filter((k) => k !== key);
    return true;
  }
  const valid = new Set(workableTiles(state, city).map(keyOf));
  if (!valid.has(key)) return false;
  // No citizen is free to work a tile — every one is committed as a specialist.
  if (workerSlots(city) <= 0) return false;
  // Lock the pick, then re-optimise; at capacity this swaps out the worst
  // unlocked tile rather than over-committing past the worker cap.
  city.lockedTiles.push(key);
  autoAssignCitizens(state, city);
  return true;
}

/** Spawn a finished unit at the city, or the nearest open adjacent valid tile. */
function placeUnit(state: GameState, city: City, type: keyof typeof UNIT_DEFS): void {
  const hasBarracks = city.buildings.includes("barracks");
  const xpBonus = hasBarracks ? 15 : 0;
  // Units mustered in a Barracks start with steadier morale.
  const morale = startingUnitMorale(state, city.ownerId, hasBarracks ? BARRACKS_MORALE_BONUS : 0);
  const udef = UNIT_DEFS[type];
  const spawn = (col: number, row: number) => {
    const id = state.nextEntityId++;
    state.units.set(id, makeUnit(id, city.ownerId, type, col, row, xpBonus, morale));
  };
  // Naval units spawn on an adjacent water tile; land units spawn on land.
  const wantsWater = udef.cls === "naval_melee" || udef.cls === "naval_ranged";
  if (!wantsWater && !unitAt(state, city.col, city.row)) {
    spawn(city.col, city.row);
    return;
  }
  for (const n of offsetNeighbors(state.map, city.col, city.row)) {
    const tile = getTile(state.map, n.col, n.row);
    if (!tile || unitAt(state, n.col, n.row)) continue;
    if (wantsWater && isWaterTerrain(tile.terrain)) {
      spawn(n.col, n.row);
      return;
    }
    if (!wantsWater && tile.terrain !== "mountains" && !isWaterTerrain(tile.terrain)) {
      spawn(n.col, n.row);
      return;
    }
  }
}

/** Advance one city by a turn: yields -> growth, production, gold, research. */
export function processCity(state: GameState, city: City, owner: Player): void {
  // Re-optimise tile assignments before computing yields, so improvements that
  // completed (or territory that changed) pull citizens onto better tiles.
  autoAssignCitizens(state, city);
  const y = getCityYields(state, city);

  // Food / growth. Surplus amenities speed growth; a shortfall never slows it
  // below baseline. cityFoodGrowth is the shared sim/UI source of truth.
  const surplus = y.food - city.population;
  const foodDelta = cityFoodGrowth(state, city, surplus);
  // A city readying a settler pauses growth: the food a settler would consume
  // isn't banked toward a new citizen (a deficit can still starve the city).
  const buildingSettler =
    city.production?.kind === "unit" && UNIT_DEFS[city.production.id].founder === true;
  city.foodStored += buildingSettler && foodDelta > 0 ? 0 : foodDelta;
  if (city.foodStored < 0) {
    if (city.population > 1) {
      city.population -= 1;
      autoAssignCitizens(state, city);
      log(state, `${city.name} starved (now pop ${city.population}).`, {
        actorId: city.ownerId,
        targetIds: [city.ownerId],
        tile: { col: city.col, row: city.row },
      });
    }
    city.foodStored = 0;
  } else if (!buildingSettler) {
    const need = foodToGrow(city.population);
    if (city.foodStored >= need) {
      city.foodStored -= need;
      city.population += 1;
      expandTerritory(state, city); // borders grow with the city
      autoAssignCitizens(state, city); // new citizen works the best free tile
      log(state, `${city.name} grew to pop ${city.population}.`, {
        actorId: city.ownerId,
        targetIds: [city.ownerId],
        tile: { col: city.col, row: city.row },
      });
      emitCityGrew(
        state,
        city.ownerId,
        city.id,
        city.name,
        city.population,
        city.col,
        city.row,
      );
    }
  }

  // Production.
  city.productionStored += y.production;
  if (city.production?.kind === "project") {
    // A standing conversion project: cash the city's banked production into the
    // chosen empire pool. Coinage credits gold directly; the science/culture/
    // faith projects feed their progress pools, so the conversion can complete a
    // tech/civic the same turn (see the empire-pool section below). The remainder
    // that doesn't convert cleanly is carried over rather than wasted.
    const def = PROJECT_DEFS[city.production.id];
    const converted = Math.floor(city.productionStored * def.ratio);
    if (converted > 0) {
      city.productionStored -= Math.ceil(converted / def.ratio);
      switch (def.output) {
        case "gold": owner.gold += converted; break;
        case "science": owner.scienceProgress += converted; break;
        case "culture": owner.cultureProgress += converted; break;
        case "faith": owner.faith += converted; break;
      }
    }
  } else if (city.production) {
    const cost =
      city.production.kind === "unit"
        ? UNIT_DEFS[city.production.id].cost
        : getBuildingDef(city.production.id)?.cost ?? Infinity;
    if (city.productionStored >= cost) {
      city.productionStored -= cost;
      if (city.production.kind === "unit") {
        const udef = UNIT_DEFS[city.production.id];
        placeUnit(state, city, city.production.id);
        if (udef.reqResource) {
          owner.resources[udef.reqResource.resource] = Math.max(
            0,
            (owner.resources[udef.reqResource.resource] ?? 0) - udef.reqResource.count,
          );
        }
        log(state, `${city.name} trained a ${udef.name}.`, {
          actorId: city.ownerId,
          targetIds: [city.ownerId],
          tile: { col: city.col, row: city.row },
        });
        emitProductionComplete(
          state,
          city.ownerId,
          city.id,
          city.name,
          city.production,
          udef.name,
          city.col,
          city.row,
        );
      } else {
        const bdef = getBuildingDef(city.production.id);
        if (!city.buildings.includes(city.production.id)) {
          city.buildings.push(city.production.id);
        }
        if (bdef?.reqResource) {
          owner.resources[bdef.reqResource.resource] = Math.max(
            0,
            (owner.resources[bdef.reqResource.resource] ?? 0) - bdef.reqResource.count,
          );
        }
        log(state, `${city.name} built a ${bdef?.name ?? city.production.id}.`, {
          actorId: city.ownerId,
          targetIds: [city.ownerId],
          tile: { col: city.col, row: city.row },
        });
        emitProductionComplete(
          state,
          city.ownerId,
          city.id,
          city.name,
          city.production,
          bdef?.name ?? city.production.id,
          city.col,
          city.row,
        );
      }
      city.production = null;
    }
  }

  // Gold + science + culture (empire pools).
  owner.gold += y.gold;
  owner.scienceProgress += y.science;
  if (owner.researching) {
    const def = TECH_DEFS[owner.researching];
    if (owner.scienceProgress >= def.cost) {
      owner.scienceProgress -= def.cost;
      owner.researched.add(owner.researching);
      log(state, `${owner.name} discovered ${def.name}.`, { actorId: owner.id, targetIds: [owner.id] });
      emitResearchComplete(state, owner.id, def.name);
      owner.researching = null;
      advanceResearchQueue(owner);
    }
  }
  owner.faith += y.faith;
  owner.cultureProgress += y.culture;
  if (owner.researchingCivic) {
    const def = getCivic(owner.researchingCivic);
    if (def && owner.cultureProgress >= def.cost) {
      owner.cultureProgress -= def.cost;
      owner.civicsResearched.add(owner.researchingCivic);
      log(state, `${owner.name} adopted ${def.name}.`, { actorId: owner.id, targetIds: [owner.id] });
      emitCivicComplete(state, owner.id, def.name);
      owner.researchingCivic = null;
    }
  }

  // City HP regen when not under attack; keep within current max.
  const maxHp = cityMaxHp(city);
  if (state.turn > city.lastAttackedTurn) {
    city.hp = Math.min(maxHp, city.hp + 20);
  }
  city.hp = Math.min(city.hp, maxHp);
}

/** Per-unit gold upkeep, modified by the owner's militaryMaintenanceCostMultiplier
 *  and their military-pay setting (see morale.ts upkeepGoldMultiplier). */
export function unitUpkeep(state: GameState, unit: Unit): number {
  const base = UNIT_DEFS[unit.type].upkeep ?? 0;
  if (base <= 0) return 0;
  const mult = civEffectsOf(state, unit.ownerId).militaryMaintenanceCostMultiplier ?? 1;
  const payMult = upkeepGoldMultiplier(playerById(state, unit.ownerId));
  return Math.round(base * mult * payMult);
}

/** Empire-wide military pay due this turn: the summed unit upkeep, but never less
 *  than the military-pay floor (minMilitaryPayCost) so a morale boost always costs
 *  something even with a tiny or empty army. */
export function militaryUpkeepTotal(state: GameState, player: Player): number {
  let total = 0;
  for (const u of unitsOf(state, player.id)) total += unitUpkeep(state, u);
  return Math.max(total, minMilitaryPayCost(upkeepModifierPct(player)));
}

/** Deduct empire-wide unit upkeep from a player's treasury after cities have produced yields. */
export function applyUnitUpkeep(state: GameState, player: Player): void {
  if (player.isBarbarian) return;
  const total = militaryUpkeepTotal(state, player);
  if (total <= 0) return;
  player.gold -= total;
  if (player.gold < 0) {
    log(state, `${player.name}'s treasury is exhausted after paying ${total} gold in unit upkeep.`, {
      actorId: player.id,
      targetIds: [player.id],
    });
    emitTreasuryExhausted(state, player.id);
    // Disband the most expensive non-essential military unit until solvent.
    const disbandable = unitsOf(state, player.id)
      .filter((u) => u.type !== "settler")
      .sort((a, b) => unitUpkeep(state, b) - unitUpkeep(state, a));
    while (player.gold < 0 && disbandable.length > 0) {
      const u = disbandable.shift()!;
      state.units.delete(u.id);
      player.gold += unitUpkeep(state, u);
    }
    // Unpaid wages gut the army's spirit: global morale plunges and every
    // surviving unit loses heart (see onBankruptcy in morale.ts).
    onBankruptcy(state, player.id);
  }
}

/** Techs the player can research right now (prereqs met, not yet known). */
export function availableTechs(player: Player): TechId[] {
  return (Object.keys(TECH_DEFS) as TechId[]).filter(
    (t) =>
      !player.researched.has(t) &&
      TECH_DEFS[t].prereqs.every((p) => player.researched.has(p)),
  );
}

export interface ProductionOption {
  item: import("./state").ProductionItem;
  name: string;
  cost: number;
}

/** Everything a city can currently build, gated by the owner's tech. */
export function availableProduction(state: GameState, player: Player, city: City): ProductionOption[] {
  const out: ProductionOption[] = [];
  const coastal = isCoastalLand(state, city.col, city.row);
  for (const def of Object.values(UNIT_DEFS)) {
    if (def.reqTech && !player.researched.has(def.reqTech)) continue;
    if (def.reqResource && resourceStock(player, def.reqResource.resource) < def.reqResource.count) continue;
    // Naval units can only be built in coastal cities.
    if ((def.cls === "naval_melee" || def.cls === "naval_ranged") && !coastal) continue;
    const uu = uniqueUnitForCiv(player.civId, def.id);
    out.push({ item: { kind: "unit", id: def.id }, name: uu?.name ?? def.name, cost: def.cost });
  }
  for (const def of Object.values(BUILDING_DEFS)) {
    if (def.reqTech && !player.researched.has(def.reqTech)) continue;
    if (def.reqResource && resourceStock(player, def.reqResource.resource) < def.reqResource.count) continue;
    if (city.buildings.includes(def.id)) continue;
    out.push({
      item: { kind: "building", id: def.id },
      name: def.name,
      cost: def.cost,
    });
  }
  // The civ's unique building (an extra building, offered only to this civ once
  // its tech is known and it hasn't already been built here).
  const ub = uniqueBuildingForCiv(player.civId);
  if (ub && player.researched.has(ub.reqTech as TechId) && !city.buildings.includes(ub.id)) {
    out.push({ item: { kind: "building", id: ub.id }, name: ub.name, cost: ub.cost });
  }
  // Standing conversion projects (Coinage always; the rest gated by tech). These
  // never "complete", so their cost is 0 — the UI shows them as ongoing.
  for (const def of Object.values(PROJECT_DEFS)) {
    if (def.reqTech && !player.researched.has(def.reqTech)) continue;
    out.push({ item: { kind: "project", id: def.id }, name: def.name, cost: 0 });
  }
  return out;
}
