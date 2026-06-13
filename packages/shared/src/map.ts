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
  | "mountains";

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
  /** Whether a road runs through this tile. */
  road?: boolean;
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
