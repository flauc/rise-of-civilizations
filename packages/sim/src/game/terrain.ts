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
  coast: { food: 2, production: 0, gold: 2, science: 0, faith: 0 },
  lake: { food: 3, production: 0, gold: 1, science: 0, faith: 0 },
  plains: { food: 1, production: 1, gold: 0, science: 0, faith: 0 },
  grassland: { food: 3, production: 0, gold: 0, science: 0, faith: 0 },
  desert: { food: 0, production: 0, gold: 0, science: 0, faith: 0 },
  tundra: { food: 1, production: 0, gold: 0, science: 1, faith: 0 },
  // Snowy boreal pine forest: cold but a strong source of production (like woods).
  taiga: { food: 1, production: 2, gold: 0, science: 0, faith: 0 },
  snow: { food: 0, production: 0, gold: 0, science: 0, faith: 0 },
  // Forest is the dense, knowledge-rich woodland: same output as woods plus +1 science.
  forest: { food: 1, production: 2, gold: 0, science: 1, faith: 0 },
  woods: { food: 1, production: 2, gold: 0, science: 0, faith: 0 },
  jungle: { food: 1, production: 1, gold: 0, science: 1, faith: 0 },
  // Fertile flooded marsh: a food powerhouse, but yields nothing else.
  wetlands: { food: 3, production: 0, gold: 0, science: 0, faith: 0 },
  // Murky peat bog: poor land, but its eerie stillness draws a trickle of faith.
  bog: { food: 1, production: 0, gold: 0, science: 0, faith: 1 },
  hills: { food: 0, production: 2, gold: 0, science: 0, faith: 0 },
  mountains: { food: 0, production: 0, gold: 0, science: 2, faith: 0 },
  mesa: { food: 0, production: 2, gold: 0, science: 0, faith: 0 },
  volcano: { food: 0, production: 2, gold: 0, science: 1, faith: 0 },
};

/** Total yields of a tile (terrain + tier-aware improvement + river bonuses). */
export function tileYields(tile: Tile): Yields {
  let y = addYields(TERRAIN_YIELDS[tile.terrain], improvementYields(tile.improvement, tile.improvementLevel));
  if (tile.river) {
    // A river enriches the land it crosses; a river lake also waters fresh ideas.
    y = addYields(y, { food: 1, production: 0, gold: 0, science: tile.riverLake ? 1 : 0, faith: 0 });
  }
  return y;
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
  taiga: "Taiga",
  snow: "Snow",
  forest: "Forest",
  woods: "Woods",
  jungle: "Jungle",
  wetlands: "Wetlands",
  bog: "Bog",
  hills: "Hills",
  mountains: "Mountains",
  mesa: "Mesa",
  volcano: "Volcano",
};

/** Tree-cover terrain (rough, defensible, supports lumber camps and concealment).
 *  Includes the snowy boreal taiga alongside the temperate/tropical woodlands. */
const FOREST: ReadonlySet<TerrainType> = new Set<TerrainType>(["forest", "woods", "jungle", "taiga"]);

/** True if the terrain is tree cover (forest/woods/jungle/taiga). */
export function isForestTerrain(t: TerrainType): boolean {
  return FOREST.has(t);
}

// Tree cover plus hills/mesa and the soggy marshlands all slow movement.
const ROUGH: ReadonlySet<TerrainType> = new Set<TerrainType>([
  ...FOREST,
  "hills",
  "mesa",
  "wetlands",
  "bog",
]);

/** Rough terrain costs more to enter; tree cover and high ground also defend. */
export function isRough(t: TerrainType): boolean {
  return ROUGH.has(t);
}

/** Defensive combat bonus a defender gets standing on this terrain. */
export function terrainDefense(t: TerrainType): number {
  if (t === "hills" || t === "mesa") return 3;
  if (isForestTerrain(t)) return 2;
  return 0; // open marsh (wetlands/bog) is rough to cross but offers no cover
}

/** Land movement cost to ENTER a tile; Infinity = impassable to land units. */
export function moveCost(t: TerrainType): number {
  if (isWaterTerrain(t) || t === "mountains" || t === "volcano") return Infinity;
  if (isRough(t)) return 2;
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
