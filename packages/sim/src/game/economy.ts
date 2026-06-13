import { axialDistance, getTile, offsetToAxial } from "@roc/shared";
import type { GameState, City, Player } from "./state";
import { cityAt, makeUnit, unitAt } from "./state";
import { addYields, TERRAIN_YIELDS, type Yields } from "./terrain";
import { improvementYields } from "./improvements";
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
}

const CITY_RADIUS = 2;

/** Tiles within the city's work radius, excluding other cities' centers. */
function workableTiles(state: GameState, city: City): { col: number; row: number }[] {
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
      const other = cityAt(state, c, r);
      if (other && other.id !== city.id) continue;
      tiles.push({ col: c, row: r });
    }
  }
  return tiles;
}

function tileScore(food: number, production: number, gold: number): number {
  return food * 1.0 + production * 0.8 + gold * 0.5;
}

/** Base + improvement yields of a single tile. */
function tileWorkYields(map: GameState["map"], col: number, row: number): Yields {
  const tile = getTile(map, col, row);
  if (!tile) return { food: 0, production: 0, gold: 0 };
  return addYields(TERRAIN_YIELDS[tile.terrain], improvementYields(tile.improvement));
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

  // Best `population` surrounding tiles.
  const candidates = workableTiles(state, city)
    .map((t) => ({ y: tileWorkYields(map, t.col, t.row) }))
    .sort((a, b) =>
      tileScore(b.y.food, b.y.production, b.y.gold) -
      tileScore(a.y.food, a.y.production, a.y.gold),
    );
  for (let i = 0; i < city.population && i < candidates.length; i++) {
    const y = candidates[i]!.y;
    food += y.food;
    production += y.production;
    gold += y.gold;
  }

  // Buildings.
  for (const b of city.buildings) {
    const def = BUILDING_DEFS[b];
    food += def.yields.food ?? 0;
    production += def.yields.production ?? 0;
    gold += def.yields.gold ?? 0;
    science += def.yields.science ?? 0;
  }

  if (city.isCapital) {
    production += 1;
    science += 1;
  }
  return { food, production, gold, science };
}

export function foodToGrow(population: number): number {
  return 15 + 6 * (population - 1);
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

  // Food / growth.
  const surplus = y.food - city.population * 2;
  city.foodStored += surplus;
  if (city.foodStored < 0) {
    if (city.population > 1) {
      city.population -= 1;
      state.log.push(`${city.name} starved (now pop ${city.population}).`);
    }
    city.foodStored = 0;
  } else {
    const need = foodToGrow(city.population);
    if (city.foodStored >= need) {
      city.foodStored -= need;
      city.population += 1;
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
        placeUnit(state, city, city.production.id);
        state.log.push(`${city.name} trained a ${UNIT_DEFS[city.production.id].name}.`);
      } else {
        if (!city.buildings.includes(city.production.id)) {
          city.buildings.push(city.production.id);
        }
        state.log.push(`${city.name} built a ${BUILDING_DEFS[city.production.id].name}.`);
      }
      city.production = null;
    }
  }

  // Gold + science (empire pools).
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
    out.push({ item: { kind: "unit", id: def.id }, name: def.name, cost: def.cost });
  }
  for (const def of Object.values(BUILDING_DEFS)) {
    if (def.reqTech && !player.researched.has(def.reqTech)) continue;
    if (city.buildings.includes(def.id)) continue;
    out.push({
      item: { kind: "building", id: def.id },
      name: def.name,
      cost: def.cost,
    });
  }
  return out;
}
