import { axialDistance, getTile, offsetToAxial } from "@roc/shared";
import type { GameState, City, Player } from "./state";
import { cityAt, makeUnit, unitAt } from "./state";
import { addYields, TERRAIN_YIELDS, ZERO_YIELDS, type Yields } from "./terrain";
import { improvementYields } from "./improvements";
import { resourceYields, resourceStock, cityGrowthMultiplier } from "./resources";
import { expandTerritory } from "./territory";
import { getWonder } from "@roc/data";
import { civEffectsOf, getCivic } from "./civs";
import { cityTradeYields } from "./trade";
import { workerSlots } from "./specialists";
import { cityMaxHp } from "./combat";
import { offsetNeighbors } from "./movement";
import {
  BUILDING_DEFS,
  TECH_DEFS,
  UNIT_DEFS,
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

/** Base + improvement yields of a single tile. */
function tileWorkYields(map: GameState["map"], col: number, row: number): Yields {
  const tile = getTile(map, col, row);
  if (!tile) return ZERO_YIELDS;
  return addYields(
    addYields(TERRAIN_YIELDS[tile.terrain], improvementYields(tile.improvement, tile.improvementLevel)),
    resourceYields(tile),
  );
}

/** Compute a city's per-turn yields, auto-assigning the best worked tiles. */
export function getCityYields(state: GameState, city: City): CityYields {
  const { map } = state;
  // City center tile (guaranteed minimum 1 food / 1 production).
  const cBase = tileWorkYields(map, city.col, city.row);
  let food = Math.max(1, cBase.food);
  let production = Math.max(1, cBase.production);
  let gold = cBase.gold;
  let science = 1; // base research from every city
  let culture = 1; // base culture from every city
  let faith = 0; // faith only comes from shrines/temples

  const eff = civEffectsOf(state, city.ownerId);
  const desertGold = eff.goldPerWorkedDesert ?? 0;
  if (getTile(map, city.col, city.row)?.terrain === "desert") gold += desertGold;
  science += cBase.science;

  // Tiles this city's citizens are assigned to. Citizens trained as specialists
  // no longer work tiles, so only the first `workerSlots` assignments count.
  const cap = workerSlots(city);
  for (const key of city.workedTiles.slice(0, cap)) {
    const [col, row] = key.split(",").map(Number) as [number, number];
    const tile = getTile(map, col, row);
    if (!tile || tile.ownerCityId !== city.id) continue; // ignore lost tiles
    const y = tileWorkYields(map, col, row);
    food += y.food;
    production += y.production;
    gold += y.gold;
    science += y.science;
    if (tile.terrain === "desert") gold += desertGold;
  }

  // Specialists give a small flat craft upkeep to their city between/while at work.
  production += Math.floor(city.specialists.length * 0.25);

  // Buildings.
  for (const b of city.buildings) {
    const def = BUILDING_DEFS[b];
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
  gold += trade.gold;
  science += trade.science;

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

  // Civ / government / policy yield bonuses (percentage).
  const pct = eff.yieldPercent;
  if (pct) {
    food = Math.floor(food * (1 + (pct.food ?? 0) / 100));
    production = Math.floor(production * (1 + (pct.production ?? 0) / 100));
    gold = Math.floor(gold * (1 + (pct.gold ?? 0) / 100));
    science = Math.floor(science * (1 + (pct.science ?? 0) / 100));
  }
  return { food, production, gold, science, culture, faith };
}

export function foodToGrow(population: number): number {
  return 15 + 6 * (population - 1);
}

const keyOf = (t: { col: number; row: number }) => `${t.col},${t.row}`;
const scoreOfKey = (state: GameState, key: string): number => {
  const [c, r] = key.split(",").map(Number) as [number, number];
  return citizenScore(tileWorkYields(state.map, c, r));
};

/** Clean up a city's worked tiles (drop lost/invalid, cap at population) and
 *  fill any spare citizens onto the best available tiles. */
export function autoAssignCitizens(state: GameState, city: City): void {
  const cap = workerSlots(city);
  const valid = new Set(workableTiles(state, city).map(keyOf));
  let worked = [...new Set(city.workedTiles)].filter((k) => valid.has(k));
  worked.sort((a, b) => scoreOfKey(state, b) - scoreOfKey(state, a));
  if (worked.length > cap) worked = worked.slice(0, cap);
  const workedSet = new Set(worked);
  const avail = [...valid]
    .filter((k) => !workedSet.has(k))
    .sort((a, b) => scoreOfKey(state, b) - scoreOfKey(state, a));
  while (worked.length < cap && avail.length > 0) worked.push(avail.shift()!);
  city.workedTiles = worked;
}

/** Assign one spare citizen to the best available tile (used on city growth). */
export function assignOneCitizen(state: GameState, city: City): void {
  if (city.workedTiles.length >= workerSlots(city)) return;
  const workedSet = new Set(city.workedTiles);
  let best: string | null = null;
  let bestScore = -Infinity;
  for (const t of workableTiles(state, city)) {
    const k = keyOf(t);
    if (workedSet.has(k)) continue;
    const s = scoreOfKey(state, k);
    if (s > bestScore) {
      bestScore = s;
      best = k;
    }
  }
  if (best) city.workedTiles.push(best);
}

/** Keep only the best worked tiles the city's free citizens can staff. */
export function trimCitizens(state: GameState, city: City): void {
  const cap = workerSlots(city);
  if (city.workedTiles.length <= cap) return;
  city.workedTiles = [...city.workedTiles]
    .sort((a, b) => scoreOfKey(state, b) - scoreOfKey(state, a))
    .slice(0, cap);
}

/** Toggle a citizen on/off a tile. Adding past capacity swaps out the worst tile. */
export function toggleCitizen(state: GameState, city: City, col: number, row: number): boolean {
  const key = `${col},${row}`;
  const idx = city.workedTiles.indexOf(key);
  if (idx >= 0) {
    city.workedTiles.splice(idx, 1); // un-assign
    return true;
  }
  const valid = new Set(workableTiles(state, city).map(keyOf));
  if (!valid.has(key)) return false;
  city.workedTiles.push(key);
  if (city.workedTiles.length > workerSlots(city)) {
    let worstIdx = -1;
    let worst = Infinity;
    for (let i = 0; i < city.workedTiles.length; i++) {
      if (city.workedTiles[i] === key) continue;
      const s = scoreOfKey(state, city.workedTiles[i]!);
      if (s < worst) {
        worst = s;
        worstIdx = i;
      }
    }
    if (worstIdx >= 0) city.workedTiles.splice(worstIdx, 1);
  }
  return true;
}

/** Spawn a finished unit at the city, or the nearest open adjacent land tile. */
function placeUnit(state: GameState, city: City, type: keyof typeof UNIT_DEFS): void {
  const xpBonus = city.buildings.includes("barracks") ? 15 : 0;
  const spawn = (col: number, row: number) => {
    const id = state.nextEntityId++;
    state.units.set(id, makeUnit(id, city.ownerId, type, col, row, xpBonus));
  };
  if (!unitAt(state, city.col, city.row)) {
    spawn(city.col, city.row);
    return;
  }
  for (const n of offsetNeighbors(state.map, city.col, city.row)) {
    const tile = getTile(state.map, n.col, n.row);
    if (tile && !unitAt(state, n.col, n.row) && tile.terrain !== "mountains") {
      spawn(n.col, n.row);
      return;
    }
  }
}

/** Advance one city by a turn: yields -> growth, production, gold, research. */
export function processCity(state: GameState, city: City, owner: Player): void {
  const y = getCityYields(state, city);

  // Food / growth (happiness can reduce surplus growth but not increase it).
  const surplus = y.food - city.population * 2;
  const growthMult = cityGrowthMultiplier(state, city);
  city.foodStored += surplus > 0 ? Math.floor(surplus * growthMult) : surplus;
  if (city.foodStored < 0) {
    if (city.population > 1) {
      city.population -= 1;
      trimCitizens(state, city);
      state.log.push(`${city.name} starved (now pop ${city.population}).`);
    }
    city.foodStored = 0;
  } else {
    const need = foodToGrow(city.population);
    if (city.foodStored >= need) {
      city.foodStored -= need;
      city.population += 1;
      expandTerritory(state, city); // borders grow with the city
      assignOneCitizen(state, city); // new citizen works the best free tile
      state.log.push(`${city.name} grew to pop ${city.population}.`);
    }
  }

  // Production.
  city.productionStored += y.production;
  if (city.production) {
    const cost =
      city.production.kind === "unit"
        ? UNIT_DEFS[city.production.id].cost
        : BUILDING_DEFS[city.production.id].cost;
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
        state.log.push(`${city.name} trained a ${udef.name}.`);
      } else {
        const bdef = BUILDING_DEFS[city.production.id];
        if (!city.buildings.includes(city.production.id)) {
          city.buildings.push(city.production.id);
        }
        if (bdef.reqResource) {
          owner.resources[bdef.reqResource.resource] = Math.max(
            0,
            (owner.resources[bdef.reqResource.resource] ?? 0) - bdef.reqResource.count,
          );
        }
        state.log.push(`${city.name} built a ${bdef.name}.`);
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
      state.log.push(`${owner.name} discovered ${def.name}.`);
      owner.researching = null;
    }
  }
  owner.faith += y.faith;
  owner.cultureProgress += y.culture;
  if (owner.researchingCivic) {
    const def = getCivic(owner.researchingCivic);
    if (def && owner.cultureProgress >= def.cost) {
      owner.cultureProgress -= def.cost;
      owner.civicsResearched.add(owner.researchingCivic);
      state.log.push(`${owner.name} adopted ${def.name}.`);
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
export function availableProduction(player: Player, city: City): ProductionOption[] {
  const out: ProductionOption[] = [];
  for (const def of Object.values(UNIT_DEFS)) {
    if (def.reqTech && !player.researched.has(def.reqTech)) continue;
    if (def.reqResource && resourceStock(player, def.reqResource.resource) < def.reqResource.count) continue;
    out.push({ item: { kind: "unit", id: def.id }, name: def.name, cost: def.cost });
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
  return out;
}
