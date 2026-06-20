// Natural resources: bonus, luxury, and strategic tile resources.
// Resources are placed during world setup, yield benefits when improved, and
// strategic resources are stockpiled per player to unlock unit production.

import { getTile, hashSeed, type TerrainType, type Tile } from "@roc/shared";
import type { ImprovementKind } from "./improvements";
import type { City, GameState, Player } from "./state";
import { citiesOf } from "./state";
import { addYields, TERRAIN_YIELDS, type Yields } from "./terrain";

export type ResourceType = "bonus" | "luxury" | "strategic";

export type ResourceId =
  // bonus
  | "wheat"
  | "rice"
  | "maize"
  | "cattle"
  | "sheep"
  | "deer"
  | "fish"
  | "crabs"
  | "bananas"
  | "stone"
  // strategic
  | "copper"
  | "tin"
  | "iron"
  | "horses"
  | "elephants"
  | "saltpeter"
  // luxury
  | "wine"
  | "incense"
  | "silk"
  | "spices"
  | "dyes"
  | "furs"
  | "ivory"
  | "pearls"
  | "salt"
  | "tea"
  | "cocoa"
  | "citrus"
  | "tobacco"
  | "silver"
  | "gold_ore";

export interface ResourceDef {
  id: ResourceId;
  type: ResourceType;
  name: string;
  /** Yield bonus when the tile is worked and the resource is improved. */
  yields: Partial<Yields>;
  /** Tile terrains on which this resource can spawn. */
  validTerrain: readonly TerrainType[];
  /** Improvement required to activate the resource. */
  improvement: ImprovementKind;
  /** Extra amenities provided when this resource is active (per tile for bonuses). */
  amenity?: number;
}

const R = (d: ResourceDef): ResourceDef => d;

export const RESOURCE_DEFS: Record<ResourceId, ResourceDef> = {
  // ---- bonus resources -----------------------------------------------------
  wheat: R({
    id: "wheat",
    type: "bonus",
    name: "Wheat",
    yields: { food: 1 },
    validTerrain: ["plains", "grassland", "desert"],
    improvement: "farm",
  }),
  rice: R({
    id: "rice",
    type: "bonus",
    name: "Rice",
    yields: { food: 1 },
    validTerrain: ["grassland", "plains"],
    improvement: "farm",
  }),
  maize: R({
    id: "maize",
    type: "bonus",
    name: "Maize",
    yields: { food: 1 },
    validTerrain: ["plains", "grassland"],
    improvement: "farm",
  }),
  cattle: R({
    id: "cattle",
    type: "bonus",
    name: "Cattle",
    yields: { food: 1 },
    validTerrain: ["grassland", "plains"],
    improvement: "pasture",
  }),
  sheep: R({
    id: "sheep",
    type: "bonus",
    name: "Sheep",
    yields: { food: 1 },
    validTerrain: ["hills", "grassland", "tundra"],
    improvement: "pasture",
  }),
  deer: R({
    id: "deer",
    type: "bonus",
    name: "Deer",
    yields: { food: 1 },
    validTerrain: ["forest", "woods", "tundra"],
    improvement: "camp",
  }),
  fish: R({
    id: "fish",
    type: "bonus",
    name: "Fish",
    yields: { food: 1, gold: 1 },
    validTerrain: ["coast", "lake", "ocean"],
    improvement: "fishing_boats",
  }),
  crabs: R({
    id: "crabs",
    type: "bonus",
    name: "Crabs",
    yields: { food: 1, gold: 1 },
    validTerrain: ["coast", "ocean"],
    improvement: "fishing_boats",
  }),
  bananas: R({
    id: "bananas",
    type: "bonus",
    name: "Bananas",
    yields: { food: 2 },
    validTerrain: ["jungle", "forest", "woods"],
    improvement: "plantation",
    amenity: 1,
  }),
  stone: R({
    id: "stone",
    type: "bonus",
    name: "Stone",
    yields: { production: 1 },
    validTerrain: ["hills", "desert"],
    improvement: "quarry",
  }),

  // ---- strategic resources -------------------------------------------------
  copper: R({
    id: "copper",
    type: "strategic",
    name: "Copper",
    yields: { production: 1 },
    validTerrain: ["hills"],
    improvement: "mine",
  }),
  tin: R({
    id: "tin",
    type: "strategic",
    name: "Tin",
    yields: { production: 1 },
    validTerrain: ["hills", "desert"],
    improvement: "mine",
  }),
  iron: R({
    id: "iron",
    type: "strategic",
    name: "Iron",
    yields: { production: 1 },
    validTerrain: ["hills"],
    improvement: "mine",
  }),
  horses: R({
    id: "horses",
    type: "strategic",
    name: "Horses",
    yields: { food: 1 },
    validTerrain: ["plains", "grassland", "tundra"],
    improvement: "pasture",
  }),
  elephants: R({
    id: "elephants",
    type: "strategic",
    name: "Elephants",
    yields: { food: 1 },
    validTerrain: ["jungle", "grassland", "plains"],
    improvement: "pasture",
  }),
  saltpeter: R({
    id: "saltpeter",
    type: "strategic",
    name: "Saltpeter",
    yields: {},
    validTerrain: ["desert", "hills", "tundra"],
    improvement: "mine",
  }),

  // ---- luxury / amenity resources ------------------------------------------
  wine: R({ id: "wine", type: "luxury", name: "Wine", yields: { gold: 1 }, validTerrain: ["grassland", "plains", "hills"], improvement: "plantation" }),
  incense: R({ id: "incense", type: "luxury", name: "Incense", yields: { gold: 1 }, validTerrain: ["desert", "plains"], improvement: "plantation" }),
  silk: R({ id: "silk", type: "luxury", name: "Silk", yields: { gold: 1 }, validTerrain: ["forest", "jungle", "woods"], improvement: "plantation" }),
  spices: R({ id: "spices", type: "luxury", name: "Spices", yields: { gold: 1 }, validTerrain: ["jungle", "forest", "woods"], improvement: "plantation" }),
  dyes: R({ id: "dyes", type: "luxury", name: "Dyes", yields: { gold: 1 }, validTerrain: ["jungle", "forest", "woods"], improvement: "plantation" }),
  furs: R({ id: "furs", type: "luxury", name: "Furs", yields: { gold: 1 }, validTerrain: ["tundra", "forest", "woods"], improvement: "camp" }),
  ivory: R({ id: "ivory", type: "luxury", name: "Ivory", yields: { gold: 1 }, validTerrain: ["jungle", "forest", "woods"], improvement: "camp" }),
  pearls: R({ id: "pearls", type: "luxury", name: "Pearls", yields: { gold: 1 }, validTerrain: ["coast", "lake"], improvement: "fishing_boats" }),
  salt: R({ id: "salt", type: "luxury", name: "Salt", yields: { gold: 1 }, validTerrain: ["hills", "desert"], improvement: "mine" }),
  tea: R({ id: "tea", type: "luxury", name: "Tea", yields: { gold: 1 }, validTerrain: ["grassland", "hills"], improvement: "plantation" }),
  cocoa: R({ id: "cocoa", type: "luxury", name: "Cocoa", yields: { gold: 1 }, validTerrain: ["jungle", "forest", "woods"], improvement: "plantation" }),
  citrus: R({ id: "citrus", type: "luxury", name: "Citrus", yields: { gold: 1 }, validTerrain: ["grassland", "plains", "jungle"], improvement: "plantation" }),
  tobacco: R({ id: "tobacco", type: "luxury", name: "Tobacco", yields: { gold: 1 }, validTerrain: ["grassland", "plains"], improvement: "plantation" }),
  silver: R({ id: "silver", type: "luxury", name: "Silver", yields: { gold: 2 }, validTerrain: ["hills", "desert"], improvement: "mine" }),
  gold_ore: R({ id: "gold_ore", type: "luxury", name: "Gold", yields: { gold: 2 }, validTerrain: ["hills", "desert"], improvement: "mine" }),
};

export const RESOURCE_IDS: ResourceId[] = Object.keys(RESOURCE_DEFS) as ResourceId[];

const ZERO: Yields = { food: 0, production: 0, gold: 0, science: 0, faith: 0 };

/** True if the tile's resource is improved by the matching improvement. */
export function resourceActive(tile: Tile): boolean {
  if (!tile.resource) return false;
  const def = RESOURCE_DEFS[tile.resource as ResourceId];
  if (!def) return false;
  return tile.improvement === def.improvement;
}

/** Yield bonus from the tile's resource, if active. */
export function resourceYields(tile: Tile): Yields {
  if (!resourceActive(tile)) return ZERO;
  const def = RESOURCE_DEFS[tile.resource as ResourceId]!;
  return {
    food: def.yields.food ?? 0,
    production: def.yields.production ?? 0,
    gold: def.yields.gold ?? 0,
    science: def.yields.science ?? 0,
    faith: def.yields.faith ?? 0,
  };
}

/** Amenity bonus from an active resource on this tile (per tile, not unique). */
export function resourceAmenity(tile: Tile): number {
  if (!resourceActive(tile)) return 0;
  const def = RESOURCE_DEFS[tile.resource as ResourceId];
  if (!def) return 0;
  return def.amenity ?? 0;
}

// ---- stockpiles & amenities ----------------------------------------------

function activeResourceTiles(state: GameState, playerId: number): Tile[] {
  const out: Tile[] = [];
  for (const tile of state.map.tiles) {
    if (!tile.resource || !resourceActive(tile)) continue;
    if (tile.ownerCityId === undefined) continue;
    const city = state.cities.get(tile.ownerCityId);
    if (!city || city.ownerId !== playerId) continue;
    out.push(tile);
  }
  return out;
}

/** Add this turn's resource income to the player's stockpiles. */
export function gatherPlayerResources(state: GameState, playerId: number): void {
  const player = state.players[playerId];
  if (!player || player.isBarbarian) return;
  for (const tile of activeResourceTiles(state, playerId)) {
    const id = tile.resource as ResourceId;
    const def = RESOURCE_DEFS[id];
    if (!def) continue;
    if (def.type !== "strategic") continue; // only strategic resources stockpile
    player.resources[id] = (player.resources[id] ?? 0) + 1;
  }
}

/** How much of a strategic resource the player currently has in stock. */
export function resourceStock(player: Player, resourceId: string): number {
  return player.resources[resourceId] ?? 0;
}

/** All active luxury resource types owned by this player (one amenity per type). */
export function empireLuxuryTypes(state: GameState, playerId: number): Set<ResourceId> {
  const set = new Set<ResourceId>();
  for (const tile of activeResourceTiles(state, playerId)) {
    const id = tile.resource as ResourceId;
    const def = RESOURCE_DEFS[id];
    if (def?.type === "luxury") set.add(id);
  }
  return set;
}

/** Base amenities a city receives from the empire's luxuries and local bonus resources. */
export function cityAmenities(state: GameState, city: City): number {
  const owned = empireLuxuryTypes(state, city.ownerId);
  let amenities = owned.size;
  // Luxuries imported via diplomatic deals grant an amenity if not already owned.
  const player = state.players.find((p) => p.id === city.ownerId);
  if (player) {
    for (const id of new Set(player.importedLuxuries)) {
      if (!owned.has(id as ResourceId)) amenities += 1;
    }
  }
  for (const tile of activeResourceTiles(state, city.ownerId)) {
    if (tile.ownerCityId === city.id) {
      amenities += resourceAmenity(tile);
    }
  }
  return amenities;
}

/** Luxury resource ids the player owns (active tiles) that it could trade away. */
export function tradeableLuxuries(state: GameState, playerId: number): string[] {
  return [...empireLuxuryTypes(state, playerId)];
}

/** Unhappiness generated by the city's population. */
export function cityUnhappiness(city: City): number {
  return city.population;
}

/**
 * Multiplier applied to a city's food surplus. A city whose amenities cover its
 * unhappiness grows at full speed; a shortfall *slows* growth proportionally but
 * never fully halts it (floored at 0.3), so a young or luxury-poor city can still
 * grow — just slower than a contented one. Excess amenities give no bonus.
 */
export function cityGrowthMultiplier(state: GameState, city: City): number {
  const a = cityAmenities(state, city);
  const u = cityUnhappiness(city);
  if (a >= u) return 1;
  const deficit = u - a;
  return Math.max(0.3, 1 - 0.15 * deficit);
}

// ---- map placement --------------------------------------------------------

/** Placement density for each resource (fraction of map tiles). */
const RESOURCE_DENSITY: Record<ResourceId, number> = {
  // bonus
  wheat: 0.003,
  rice: 0.003,
  maize: 0.003,
  cattle: 0.003,
  sheep: 0.002,
  deer: 0.002,
  fish: 0.003,
  crabs: 0.002,
  bananas: 0.002,
  stone: 0.003,
  // strategic
  copper: 0.0015,
  tin: 0.001,
  iron: 0.0015,
  horses: 0.0015,
  elephants: 0.001,
  saltpeter: 0.001,
  // luxury
  wine: 0.0015,
  incense: 0.0015,
  silk: 0.0015,
  spices: 0.0015,
  dyes: 0.0015,
  furs: 0.0015,
  ivory: 0.0015,
  pearls: 0.0015,
  salt: 0.0015,
  tea: 0.0015,
  cocoa: 0.0015,
  citrus: 0.0015,
  tobacco: 0.0015,
  silver: 0.001,
  gold_ore: 0.001,
};

function resourceFitsTerrain(def: ResourceDef, terrain: TerrainType): boolean {
  if (terrain === "mountains" || terrain === "volcano") return false;
  return def.validTerrain.includes(terrain);
}

/** Scatter resources deterministically after villages/camps are placed. */
export function placeResources(
  state: GameState,
  starts: ({ col: number; row: number } | null)[],
  seed: number | string,
): void {
  const { map } = state;
  const area = map.cols * map.rows;

  for (const id of RESOURCE_IDS) {
    const def = RESOURCE_DEFS[id];
    const density = RESOURCE_DENSITY[id] ?? 0;
    const target = Math.max(1, Math.floor(area * density));

    const eligible: { col: number; row: number; key: number }[] = [];
    for (const tile of map.tiles) {
      if (tile.resource || tile.feature) continue;
      if (tile.terrain === "mountains" || tile.terrain === "volcano") continue;
      if (!resourceFitsTerrain(def, tile.terrain)) continue;
      if (tile.ownerCityId !== undefined) continue; // unclaimed only
      if (starts.some((s) => s && s.col === tile.col && s.row === tile.row)) continue;
      eligible.push({ col: tile.col, row: tile.row, key: hashSeed(`res:${id}:${tile.col},${tile.row}:${seed}`) });
    }
    eligible.sort((a, b) => a.key - b.key);

    let placed = 0;
    for (const e of eligible) {
      if (placed >= target) break;
      const t = getTile(map, e.col, e.row);
      if (!t || t.resource || t.feature) continue;
      t.resource = id;
      placed++;
    }
  }
}
