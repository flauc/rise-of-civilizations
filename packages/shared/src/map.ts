// Map data model shared by the sim (generation/rules), the client (rendering),
// and tools (the geodata baker bakes into this same shape). Storage is odd-r
// offset (col/row) for a simple rectangle; gameplay math converts to axial.

export type TerrainType =
  | "ocean"
  | "coast"
  | "lake"
  | "plains"
  | "grassland"
  | "desert"
  | "tundra"
  | "snow"
  | "forest"
  | "jungle"
  | "hills"
  | "mountains"
  | "mesa"
  | "volcano";

export const TERRAIN_TYPES: readonly TerrainType[] = [
  "ocean",
  "coast",
  "lake",
  "plains",
  "grassland",
  "desert",
  "tundra",
  "snow",
  "forest",
  "jungle",
  "hills",
  "mountains",
  "mesa",
  "volcano",
];

/** Is this terrain water (impassable to land units, navigable by ships)? */
export function isWater(t: TerrainType): boolean {
  return t === "ocean" || t === "coast" || t === "lake";
}

export interface Tile {
  readonly col: number;
  readonly row: number;
  terrain: TerrainType;
  /** Built tile improvement id (e.g. "farm", "mine"); undefined if none. */
  improvement?: string;
  /** Improvement tier 1–3 (undefined treated as 1 when an improvement exists). */
  improvementLevel?: number;
  /** Whether a road runs through this tile. */
  road?: boolean;
  /** Road tier 1–3 (undefined treated as 1 when a road exists). */
  roadLevel?: number;
  /** A defensive structure occupying this tile (blocks enemy entry until destroyed). */
  structure?: { kind: "wall" | "tower"; tier: number; hp: number; maxHp: number };
  /** Id of the city whose territory this tile belongs to; undefined if neutral. */
  ownerCityId?: number;
  /** A map feature on this tile: "village" (perk when entered) or "barb_camp". */
  feature?: string;
  /** A natural resource on this tile (e.g. "iron", "bananas", "silk"). */
  resource?: string;
  /** A natural wonder occupying this tile (e.g. "grand_canyon"); multi-tile
   *  wonders set the same id on each tile they span. */
  naturalWonder?: string;
}

export interface GameMap {
  readonly cols: number;
  readonly rows: number;
  /** Row-major: index = row * cols + col. */
  readonly tiles: Tile[];
}

export function tileIndex(map: GameMap, col: number, row: number): number {
  return row * map.cols + col;
}

export function getTile(map: GameMap, col: number, row: number): Tile | undefined {
  if (col < 0 || row < 0 || col >= map.cols || row >= map.rows) return undefined;
  return map.tiles[tileIndex(map, col, row)];
}
