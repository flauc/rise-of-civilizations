import type { TerrainType } from "@roc/shared";

export interface Yields {
  food: number;
  production: number;
  gold: number;
}

export function addYields(a: Yields, b: Yields): Yields {
  return {
    food: a.food + b.food,
    production: a.production + b.production,
    gold: a.gold + b.gold,
  };
}

export const ZERO_YIELDS: Yields = { food: 0, production: 0, gold: 0 };

/** Base yields a tile produces when worked. */
export const TERRAIN_YIELDS: Record<TerrainType, Yields> = {
  ocean: { food: 1, production: 0, gold: 1 },
  coast: { food: 1, production: 0, gold: 2 },
  lake: { food: 2, production: 0, gold: 1 },
  plains: { food: 1, production: 1, gold: 0 },
  grassland: { food: 2, production: 0, gold: 0 },
  desert: { food: 0, production: 0, gold: 0 },
  tundra: { food: 1, production: 0, gold: 0 },
  snow: { food: 0, production: 0, gold: 0 },
  forest: { food: 1, production: 2, gold: 0 },
  jungle: { food: 1, production: 1, gold: 0 },
  hills: { food: 0, production: 2, gold: 0 },
  mountains: { food: 0, production: 0, gold: 0 },
};

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
