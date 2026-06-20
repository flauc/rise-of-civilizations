// Procedural map generation for M0. Produces a GameMap of the same shape the
// geodata baker emits, so the renderer is source-agnostic.

import {
  makeRng,
  getTile,
  type GameMap,
  type Tile,
  type TerrainType,
} from "@roc/shared";
import { makeValueNoise } from "./noise";

export interface WorldGenOptions {
  cols: number;
  rows: number;
  seed: number | string;
  /** Fraction of the map that should be below sea level (0..1). */
  seaLevel?: number;
}

/** Classify a land tile from elevation, moisture and latitude (0=pole, 1=equator). */
function classifyLand(
  elevation: number,
  moisture: number,
  equatorness: number,
): TerrainType {
  if (elevation > 0.82) return "mountains";
  if (elevation > 0.7) return "hills";
  if (equatorness < 0.18) return "snow";
  // Wetter/denser stands become true forest (+science); lighter stands are woods.
  if (equatorness < 0.32) return moisture > 0.5 ? (moisture > 0.7 ? "forest" : "woods") : "tundra";
  if (equatorness > 0.78) return moisture > 0.45 ? "jungle" : "desert";
  if (moisture < 0.32) return "desert";
  if (moisture > 0.62) return moisture > 0.8 ? "forest" : "woods";
  return equatorness > 0.55 ? "plains" : "grassland";
}

export function generateMap(opts: WorldGenOptions): GameMap {
  const { cols, rows } = opts;
  const seaLevel = opts.seaLevel ?? 0.42;
  const rng = makeRng(opts.seed);
  const elevation = makeValueNoise(rng, 64, 5);
  const moisture = makeValueNoise(rng, 48, 4);

  const tiles: Tile[] = new Array(cols * rows);
  const nx = 6 / cols; // noise frequency scale across the map
  const ny = 6 / rows;

  for (let row = 0; row < rows; row++) {
    // Falloff toward the top/bottom edges keeps continents off the borders.
    const latitude = row / (rows - 1); // 0 (north) .. 1 (south)
    const equatorness = 1 - Math.abs(latitude - 0.5) * 2; // 0 at poles, 1 at equator
    for (let col = 0; col < cols; col++) {
      const e = elevation(col * nx, row * ny);
      const edgeFalloff =
        Math.min(1, (Math.min(col, cols - 1 - col) / (cols * 0.12)) * 1) *
        Math.min(1, (Math.min(row, rows - 1 - row) / (rows * 0.12)) * 1);
      const height = e * (0.55 + 0.45 * edgeFalloff);

      let terrain: TerrainType;
      if (height < seaLevel) {
        terrain = "ocean";
      } else {
        const m = moisture(col * nx + 13.5, row * ny + 7.25);
        terrain = classifyLand(
          (height - seaLevel) / (1 - seaLevel),
          m,
          equatorness,
        );
        // Scatter distinctive elevated terrain for visual and strategic variety.
        if (terrain === "mountains" && rng.next() < 0.08) {
          terrain = "volcano";
        } else if (
          terrain === "hills" &&
          (equatorness > 0.75 || m < 0.3) &&
          rng.next() < 0.25
        ) {
          terrain = "mesa";
        }
      }
      tiles[row * cols + col] = { col, row, terrain };
    }
  }

  const map: GameMap = { cols, rows, tiles };
  markLakes(map);
  markCoasts(map);
  return map;
}

/** Odd-r offset neighbours of a tile, clamped to the map. */
function waterNeighbors(map: GameMap, col: number, row: number): [number, number][] {
  const odd = row & 1;
  const dirs = odd
    ? [[1, 0], [1, -1], [0, -1], [-1, 0], [0, 1], [1, 1]]
    : [[1, 0], [0, -1], [-1, -1], [-1, 0], [-1, 1], [0, 1]];
  const out: [number, number][] = [];
  for (const [dc, dr] of dirs) {
    const nc = col + dc!;
    const nr = row + dr!;
    if (nc >= 0 && nr >= 0 && nc < map.cols && nr < map.rows) out.push([nc, nr]);
  }
  return out;
}

/**
 * Turn enclosed inland bodies of water into lakes. Flood-fills each connected
 * ocean region; a region that never touches the map edge is landlocked, so
 * (unless it's a large inland sea) it becomes a lake. The open sea touches the
 * border and stays ocean.
 */
function markLakes(map: GameMap): void {
  const { cols, rows, tiles } = map;
  const lakeMax = Math.max(12, Math.round(cols * rows * 0.03));
  const seen = new Array<boolean>(cols * rows).fill(false);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const start = row * cols + col;
      if (seen[start] || tiles[start]!.terrain !== "ocean") continue;
      const region: number[] = [];
      let touchesEdge = false;
      const stack: [number, number][] = [[col, row]];
      seen[start] = true;
      while (stack.length) {
        const [c, r] = stack.pop()!;
        region.push(r * cols + c);
        if (c === 0 || r === 0 || c === cols - 1 || r === rows - 1) touchesEdge = true;
        for (const [nc, nr] of waterNeighbors(map, c, r)) {
          const ni = nr * cols + nc;
          if (!seen[ni] && tiles[ni]!.terrain === "ocean") {
            seen[ni] = true;
            stack.push([nc, nr]);
          }
        }
      }
      if (!touchesEdge && region.length <= lakeMax) {
        for (const i of region) tiles[i]!.terrain = "lake";
      }
    }
  }
}

/** Turn ocean tiles that border land into coast (for nicer shorelines). */
function markCoasts(map: GameMap): void {
  for (const tile of map.tiles) {
    if (tile.terrain !== "ocean") continue;
    const { col, row } = tile;
    const odd = row & 1;
    // odd-r neighbor offsets
    const dirs = odd
      ? [
          [1, 0],
          [1, -1],
          [0, -1],
          [-1, 0],
          [0, 1],
          [1, 1],
        ]
      : [
          [1, 0],
          [0, -1],
          [-1, -1],
          [-1, 0],
          [-1, 1],
          [0, 1],
        ];
    for (const [dc, dr] of dirs) {
      const n = getTile(map, col + dc!, row + dr!);
      if (n && n.terrain !== "ocean" && n.terrain !== "coast") {
        tile.terrain = "coast";
        break;
      }
    }
  }
}
