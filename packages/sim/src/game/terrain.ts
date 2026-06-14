import type { Tile, TerrainType } from "@roc/shared";
import { improvementYields } from "./improvements";

export type { TerrainType } from "@roc/shared";

export interface Yields {
  food: number;
  production: number;
  gold: number;
  science: number;
}

export function addYields(a: Yields, b: Yields): Yields {
  return {
    food: a.food + b.food,
    production: a.production + b.production,
    gold: a.gold + b.gold,
    science: a.science + b.science,
  };
}

export const ZERO_YIELDS: Yields = { food: 0, production: 0, gold: 0, science: 0 };

/** Base yields a tile produces when worked. Every tile leans toward one of the
 *  four yields, giving citizen-assignment real trade-offs. */
export const TERRAIN_YIELDS: Record<TerrainType, Yields> = {
  ocean: { food: 1, production: 0, gold: 1, science: 0 },
  coast: { food: 1, production: 0, gold: 2, science: 0 },
  lake: { food: 2, production: 0, gold: 1, science: 0 },
  plains: { food: 1, production: 1, gold: 0, science: 0 },
  grassland: { food: 2, production: 0, gold: 0, science: 0 },
  desert: { food: 0, production: 0, gold: 0, science: 0 },
  tundra: { food: 1, production: 0, gold: 0, science: 1 },
  snow: { food: 0, production: 0, gold: 0, science: 0 },
  forest: { food: 1, production: 2, gold: 0, science: 0 },
  jungle: { food: 1, production: 1, gold: 0, science: 1 },
  hills: { food: 0, production: 2, gold: 0, science: 0 },
  mountains: { food: 0, production: 0, gold: 0, science: 2 },
};

/** Total yields of a tile (terrain + tier-aware improvement). */
export function tileYields(tile: Tile): Yields {
  return addYields(TERRAIN_YIELDS[tile.terrain], improvementYields(tile.improvement, tile.improvementLevel));
}

const WATER: ReadonlySet<TerrainType> = new Set<TerrainType>([
  "ocean",
  "coast",
  "lake",
]);

export function isWaterTerrain(t: TerrainType): boolean {
  return WATER.has(t);
}

export const TERRAIN_NAMES: Record<TerrainType, string> = {
  ocean: "Ocean",
  coast: "Coast",
  lake: "Lake",
  plains: "Plains",
  grassland: "Grassland",
  desert: "Desert",
  tundra: "Tundra",
  snow: "Snow",
  forest: "Forest",
  jungle: "Jungle",
  hills: "Hills",
  mountains: "Mountains",
};

const ROUGH: ReadonlySet<TerrainType> = new Set<TerrainType>(["forest", "jungle", "hills"]);

/** Rough terrain costs more to enter but grants a defensive bonus. */
export function isRough(t: TerrainType): boolean {
  return ROUGH.has(t);
}

/** Defensive combat bonus a defender gets standing on this terrain. */
export function terrainDefense(t: TerrainType): number {
  if (t === "hills") return 3;
  if (t === "forest" || t === "jungle") return 2;
  return 0;
}

/** Land movement cost to ENTER a tile; Infinity = impassable to land units. */
export function moveCost(t: TerrainType): number {
  if (isWaterTerrain(t) || t === "mountains") return Infinity;
  if (t === "forest" || t === "jungle" || t === "hills") return 2;
  return 1;
}

export function isPassableLand(t: TerrainType): boolean {
  return Number.isFinite(moveCost(t));
}
