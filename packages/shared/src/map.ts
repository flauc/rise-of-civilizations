// Map data model shared by the sim (generation/rules), the client (rendering),
// and tools (the geodata baker bakes into this same shape). Storage is odd-r
// offset (col/row) for a simple rectangle; gameplay math converts to axial.

import { hexDirectionAngleRad, axialNeighbor, axialToOffset, offsetToAxial } from "./hex";

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

/** True when at least one hex neighbour lies outside the map rectangle. */
export function isMapBorderTile(map: GameMap, col: number, row: number): boolean {
  if (col < 0 || row < 0 || col >= map.cols || row >= map.rows) return false;
  for (const [dc, dr] of offsetNeighborDeltas(row)) {
    const nc = col + dc;
    const nr = row + dr;
    if (nc < 0 || nr < 0 || nc >= map.cols || nr >= map.rows) return true;
  }
  return false;
}

/** True on in-bounds tiles where units may stand (excludes the bottom skirt row). */
export function isUnitPlayableTile(map: GameMap, col: number, row: number): boolean {
  if (!getTile(map, col, row)) return false;
  return !isBottomMapBorderTile(map, col, row);
}

/** True on the bottom row of the map grid (on-map ocean/dirt cliff skirts). */
export function isBottomMapBorderTile(map: GameMap, col: number, row: number): boolean {
  return col >= 0 && row >= 0 && col < map.cols && row === map.rows - 1;
}

/** Top/left/right map edge — void paints off-map only (terrain stays playable). */
export function isSideVoidEdgeTile(map: GameMap, col: number, row: number): boolean {
  if (col < 0 || row < 0 || col >= map.cols || row >= map.rows) return false;
  if (row === map.rows - 1) return false;
  return row === 0 || col === 0 || col === map.cols - 1;
}

/** Map-edge underlay sprite id (matches `hex-terrain/map-edge/` PNG basenames). */
export type MapEdgeSkirtKind =
  | "void0"
  | "void1"
  | "void2"
  | "void3"
  | "ocean"
  | "oceanShoreBoth"
  | "oceanShoreEast"
  | "oceanShoreWest"
  | "dirt";

/** Void tile for top/left/right off-map band (`hexVoid00.png`, full hex sprite). */
export function mapEdgeVoidKind(map: GameMap, col: number, row: number): "void0" | "void1" | "void2" | "void3" {
  switch (mapEdgeSkirtSide(map, col, row)) {
    case "top":
    case "right":
    case "left":
      return "void0";
    case "bottom":
      return "void2";
  }
}

/** True for bottom-row skirt PNGs that use the ocean/coast set (not dirt). */
export function isBottomOceanSkirtTerrain(terrain: TerrainType): boolean {
  return terrain === "ocean" || terrain === "coast";
}

/**
 * Pick the hex-under skirt for the bottom map edge. The bottom skirt row itself
 * renders no terrain (it is skipped in the terrain pass), so the skirt's material
 * follows the last VISIBLE tile in the column, which is the row directly above:
 * a land column gets a dirt cliff, a water column gets an ocean cliff. Reading the
 * skirt row directly would be wrong on procedural maps, where that row is scrubbed
 * to ocean and would force an ocean cliff under every column, land included.
 */
export function mapEdgeSkirtKind(map: GameMap, col: number, row: number): MapEdgeSkirtKind | null {
  if (!isBottomMapBorderTile(map, col, row)) return null;
  // A skirt cliff sits below the GAP between the two visible tiles that flank it on
  // the row above (hex rows are offset by half a tile), so it bridges them. Which
  // two depends on the skirt row parity: an odd row sits below (col, above) and
  // (col+1, above); an even row below (col-1, above) and (col, above). Reading a
  // single same-column tile is wrong on one parity and puts a dirt cliff where a
  // shore belongs at a land/water boundary.
  const above = row - 1;
  const oddRow = (row & 1) === 1;
  const left = getTile(map, oddRow ? col : col - 1, above);
  const right = getTile(map, oddRow ? col + 1 : col, above);
  const kindOf = (t: Tile | undefined): "land" | "water" | null =>
    t === undefined ? null : isBottomOceanSkirtTerrain(t.terrain) ? "water" : "land";
  const l = kindOf(left);
  const r = kindOf(right);

  // At the bottom corners one flank is off-map: follow the on-map side, no shore.
  if (l === null && r === null) return null;
  if (l === null) return r === "water" ? "ocean" : "dirt";
  if (r === null) return l === "water" ? "ocean" : "dirt";

  if (l === "land" && r === "land") return "dirt";
  if (l === "water" && r === "water") return "ocean";
  // Mixed flanks = a shoreline cliff. The sprites render with a 180 degree mirror
  // (mapEdgeSkirtRotationRad), so land on the LEFT uses the East-shore art and land
  // on the RIGHT uses the West-shore art to end up on the correct side on screen.
  return l === "land" ? "oceanShoreEast" : "oceanShoreWest";
}

/** Canvas rotation (radians) for bottom-row ocean/dirt skirts: a 180° spin so
 *  the authored chevron seats as the tile's downward cliff. */
export function mapEdgeSkirtRotationRad(_map: GameMap, _col: number, _row: number): number {
  return Math.PI;
}

/** hexUnderVoid00 at 0 rotation matches this outward step (top edge). */
const VOID0_CANONICAL_OUTWARD = 2;

/** Rotate void skirts so they align with the actual off-map step direction. */
export function mapEdgeVoidRotationRad(side: MapEdgeSide, outwardDirection: number): number {
  const canon = side === "bottom" ? 4 : VOID0_CANONICAL_OUTWARD;
  return hexDirectionAngleRad(outwardDirection) - hexDirectionAngleRad(canon);
}

/** Which screen edge a map-border tile (or off-map ghost) faces. */
export type MapEdgeSide = "bottom" | "top" | "left" | "right";

export function mapEdgeSkirtSide(map: GameMap, col: number, row: number): MapEdgeSide {
  const { cols, rows } = map;
  if (row >= rows) return "bottom";
  if (col >= cols) return "right";
  if (row < 0) return "top";
  if (col < 0) return "left";

  const distTop = row;
  const distBottom = rows - 1 - row;
  const distLeft = col;
  const distRight = cols - 1 - col;
  const minDist = Math.min(distTop, distBottom, distLeft, distRight);
  if (distBottom === minDist) return "bottom";
  if (distRight === minDist) return "right";
  if (distTop === minDist) return "top";
  return "left";
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

/** Land on the row above the bottom skirt row connects across the ocean skirt. */
export function skirtBridgedLandNeighbors(map: GameMap, col: number, row: number): Array<[number, number]> {
  const { rows } = map;
  if (row !== rows - 2) return [];
  const bottom = rows - 1;
  const out: Array<[number, number]> = [];
  const seen = new Set<string>();
  const here = offsetToAxial({ col, row });
  for (let d = 0; d < 6; d++) {
    const mid = axialToOffset(axialNeighbor(here, d));
    if (mid.row !== bottom) continue;
    const midAx = offsetToAxial(mid);
    for (let d2 = 0; d2 < 6; d2++) {
      const nb = axialToOffset(axialNeighbor(midAx, d2));
      if (nb.row !== rows - 2) continue;
      if (nb.col === col && nb.row === row) continue;
      const key = `${nb.col},${nb.row}`;
      if (seen.has(key)) continue;
      const t = getTile(map, nb.col, nb.row);
      if (t && !isWater(t.terrain)) {
        seen.add(key);
        out.push([nb.col, nb.row]);
      }
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
        for (const [nc, nr] of skirtBridgedLandNeighbors(map, c, r)) {
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
