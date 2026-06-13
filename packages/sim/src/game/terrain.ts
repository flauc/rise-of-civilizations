import type { Tile, TerrainType } from "@roc/shared";

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

/** Total yields of a tile (terrain + improvement). */
export function tileYields(tile: Tile): Yields {
  const base = TERRAIN_YIELDS[tile.terrain];
  if (tile.improvement === "farm") return { ...base, food: base.food + 1 };
  if (tile.improvement === "mine") return { ...base, production: base.production + 1 };
  return base;
}

const WATER: ReadonlySet<TerrainType> = new Set<TerrainType>([
  "ocean",
  "coast",
  "lake",
]);

export function isWaterTerrain(t: TerrainType): boolean {
  return WATER.has(t);
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
