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
  | "taiga"
  | "snow"
  | "forest"
  | "woods"
  | "jungle"
  | "wetlands"
  | "bog"
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
  "taiga",
  "snow",
  "forest",
  "woods",
  "jungle",
  "wetlands",
  "bog",
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
  /** Tree-clad hills: moist hills grow a forest cover (visual decor overlay). */
  wooded?: boolean;
  /** Whether a road runs through this tile. */
  road?: boolean;
  /** Road tier 1–3 (undefined treated as 1 when a road exists). */
  roadLevel?: number;
  /** A defensive structure occupying this tile (blocks enemy entry until destroyed). */
  structure?: { kind: "wall" | "tower"; tier: number; hp: number; maxHp: number };
  /** Id of the city whose territory this tile belongs to; undefined if neutral. */
  ownerCityId?: number;
  /** A map feature on this tile: "village" (perk when entered), "barb_camp", or
   *  "ruin" (left behind when a city is destroyed; fades on its own or when a new
   *  city is founded on the spot). */
  feature?: string;
  /** Turn on/after which a transient feature (e.g. a "ruin") clears itself. */
  featureExpiresTurn?: number;
  /** A natural resource on this tile (e.g. "iron", "bananas", "silk"). */
  resource?: string;
  /** A natural wonder occupying this tile (e.g. "grand_canyon"); multi-tile
   *  wonders set the same id on each tile they span. */
  naturalWonder?: string;
  /** A completed built world-wonder occupying this tile (e.g. "great_pyramid").
   *  Rendered as a decor overlay on top of the tile's terrain. */
  wonder?: string;
  /** River-connection mask: bit `d` set means a river runs across this tile's edge
   *  toward neighbour direction `d` (HEX_DIRECTIONS). 0/undefined means no river.
   *  Adjacent river tiles join when each carries the bit pointing at the other. */
  river?: number;
  /** Marks this river tile as a spring/terminal lake (renders as a small lake and
   *  yields bonus science on top of the river's food). */
  riverLake?: boolean;
  /** A road on this river tile is carried over the water on a bridge (requires the
   *  Bridge Building tech in the tile's territory). A bridged road-to-road river
   *  crossing waives the movement ford penalty and keeps the river as a city-to-city
   *  road connection; the assault penalty for crossing it still applies. Derived
   *  each turn from road + river + tech, so it is not authored directly. */
  bridge?: boolean;
}

export interface GameMap {
  readonly cols: number;
  readonly rows: number;
  /** Row-major: index = row * cols + col. */
  readonly tiles: Tile[];
  /** Lobby / setup choice before resolution (e.g. "random", "continents"). */
  readonly mapTypeRequested?: string;
  /** Concrete layout used to generate this map (after Random / Continents rolls). */
  readonly mapType?: string;
  /** Number of major landmasses the generator produced (land bridges can join
   *  two continents into one landmass, so this may be below the type's count). */
  readonly landmassCount?: number;
  /** Which opposite map edges hold the frozen poles: "ns" (top/bottom, Earth's
   *  default) or "ew" (left/right). Rolled per map for procedural layouts. */
  readonly poleAxis?: "ns" | "ew";
}

export function tileIndex(map: GameMap, col: number, row: number): number {
  return row * map.cols + col;
}

/** Odd-r offset neighbour deltas for a row (hex grid). */
export function offsetNeighborDeltas(row: number): readonly (readonly [number, number])[] {
  return row & 1
    ? [[1, 0], [1, -1], [0, -1], [-1, 0], [0, 1], [1, 1]]
    : [[1, 0], [0, -1], [-1, -1], [-1, 0], [-1, 1], [0, 1]];
}

/** Width (in tiles) of the frozen polar zone near each pole edge — the band the
 *  ice caps and polar decor occupy. 0 when the map has no rolled poleAxis. */
export function polarBandWidth(map: GameMap): number {
  if (!map.poleAxis) return 0;
  const dim = map.poleAxis === "ew" ? map.cols : map.rows;
  return Math.max(4, Math.round(dim * 0.16));
}

/** True if a tile lies in the frozen polar zone near a pole edge (the ice caps
 *  and their fringe). Used to keep villages/barbarians out of the poles. */
export function isPolarTile(map: GameMap, col: number, row: number): boolean {
  const band = polarBandWidth(map);
  if (band === 0) return false;
  const dist = map.poleAxis === "ew" ? Math.min(col, map.cols - 1 - col) : Math.min(row, map.rows - 1 - row);
  return dist < band;
}

/**
 * Indices of land tiles connected to a polar map border — the generated ice
 * caps (procedural continents never reach the border). Empty when the map
 * carries no poleAxis stamp (hand-made maps, older saves).
 */
export function polarCapLand(map: GameMap): Set<number> {
  const axis = map.poleAxis;
  const out = new Set<number>();
  if (!axis) return out;
  const { cols, rows, tiles } = map;
  const stack: number[] = [];
  const push = (c: number, r: number): void => {
    const i = r * cols + c;
    if (!out.has(i) && !isWater(tiles[i]!.terrain)) {
      out.add(i);
      stack.push(i);
    }
  };
  if (axis === "ns") {
    for (let c = 0; c < cols; c++) {
      push(c, 0);
      push(c, rows - 1);
    }
  } else {
    for (let r = 0; r < rows; r++) {
      push(0, r);
      push(cols - 1, r);
    }
  }
  while (stack.length) {
    const i = stack.pop()!;
    const c = i % cols;
    const r = (i / cols) | 0;
    for (const [dc, dr] of offsetNeighborDeltas(r)) {
      const nc = c + dc;
      const nr = r + dr;
      if (nc >= 0 && nr >= 0 && nc < cols && nr < rows) push(nc, nr);
    }
  }
  return out;
}

/**
 * Size of the connected land region each tile belongs to (0 for water tiles).
 * Lets callers tell continent tiles from small-island tiles cheaply.
 */
export function landmassSizes(map: GameMap): Int32Array {
  const { cols, rows, tiles } = map;
  const sizes = new Int32Array(cols * rows);
  const seen = new Array<boolean>(cols * rows).fill(false);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const start = row * cols + col;
      if (seen[start] || isWater(tiles[start]!.terrain)) continue;
      const region: number[] = [];
      const stack: [number, number][] = [[col, row]];
      seen[start] = true;
      while (stack.length) {
        const [c, r] = stack.pop()!;
        region.push(r * cols + c);
        for (const [dc, dr] of offsetNeighborDeltas(r)) {
          const nc = c + dc;
          const nr = r + dr;
          if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
          const ni = nr * cols + nc;
          if (!seen[ni] && !isWater(tiles[ni]!.terrain)) {
            seen[ni] = true;
            stack.push([nc, nr]);
          }
        }
      }
      for (const i of region) sizes[i] = region.length;
    }
  }
  return sizes;
}

export function getTile(map: GameMap, col: number, row: number): Tile | undefined {
  if (col < 0 || row < 0 || col >= map.cols || row >= map.rows) return undefined;
  return map.tiles[tileIndex(map, col, row)];
}
