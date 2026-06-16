import type { Tile, TerrainType } from "@roc/shared";
import { improvementYields } from "./improvements";

export type { TerrainType } from "@roc/shared";

export interface Yields {
  food: number;
  production: number;
  gold: number;
  science: number;
  faith: number;
}

export function addYields(a: Yields, b: Yields): Yields {
  return {
    food: a.food + b.food,
    production: a.production + b.production,
    gold: a.gold + b.gold,
    science: a.science + b.science,
    faith: a.faith + b.faith,
  };
}

export const ZERO_YIELDS: Yields = { food: 0, production: 0, gold: 0, science: 0, faith: 0 };

/** Base yields a tile produces when worked. Every tile leans toward one of the
 *  four yields, giving citizen-assignment real trade-offs. */
export const TERRAIN_YIELDS: Record<TerrainType, Yields> = {
  ocean: { food: 1, production: 0, gold: 1, science: 0, faith: 0 },
  coast: { food: 1, production: 0, gold: 2, science: 0, faith: 0 },
  lake: { food: 2, production: 0, gold: 1, science: 0, faith: 0 },
  plains: { food: 1, production: 1, gold: 0, science: 0, faith: 0 },
  grassland: { food: 2, production: 0, gold: 0, science: 0, faith: 0 },
  desert: { food: 0, production: 0, gold: 0, science: 0, faith: 0 },
  tundra: { food: 1, production: 0, gold: 0, science: 1, faith: 0 },
  snow: { food: 0, production: 0, gold: 0, science: 0, faith: 0 },
  forest: { food: 1, production: 2, gold: 0, science: 0, faith: 0 },
  jungle: { food: 1, production: 1, gold: 0, science: 1, faith: 0 },
  hills: { food: 0, production: 2, gold: 0, science: 0, faith: 0 },
  mountains: { food: 0, production: 0, gold: 0, science: 2, faith: 0 },
  mesa: { food: 0, production: 2, gold: 0, science: 0, faith: 0 },
  volcano: { food: 0, production: 2, gold: 0, science: 1, faith: 0 },
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
  mesa: "Mesa",
  volcano: "Volcano",
};

const ROUGH: ReadonlySet<TerrainType> = new Set<TerrainType>(["forest", "jungle", "hills", "mesa"]);

/** Rough terrain costs more to enter but grants a defensive bonus. */
export function isRough(t: TerrainType): boolean {
  return ROUGH.has(t);
}

/** Defensive combat bonus a defender gets standing on this terrain. */
export function terrainDefense(t: TerrainType): number {
  if (t === "hills" || t === "mesa") return 3;
  if (t === "forest" || t === "jungle") return 2;
  return 0;
}

/** Land movement cost to ENTER a tile; Infinity = impassable to land units. */
export function moveCost(t: TerrainType): number {
  if (isWaterTerrain(t) || t === "mountains" || t === "volcano") return Infinity;
  if (t === "forest" || t === "jungle" || t === "hills" || t === "mesa") return 2;
  return 1;
}

export function isPassableLand(t: TerrainType): boolean {
  return Number.isFinite(moveCost(t));
}

/** Naval movement cost to ENTER a tile. */
export function navalMoveCost(t: TerrainType, oceanUnlocked: boolean): number {
  if (t === "coast" || t === "lake") return 1;
  if (t === "ocean") return oceanUnlocked ? 1 : Infinity;
  return Infinity;
}

/** True if a naval unit can enter this terrain. */
export function isNavalPassable(t: TerrainType, oceanUnlocked: boolean): boolean {
  return Number.isFinite(navalMoveCost(t, oceanUnlocked));
}
