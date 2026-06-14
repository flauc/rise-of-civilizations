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
  if (equatorness < 0.32) return moisture > 0.5 ? "forest" : "tundra";
  if (equatorness > 0.78) return moisture > 0.45 ? "jungle" : "desert";
  if (moisture < 0.32) return "desert";
  if (moisture > 0.62) return "forest";
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
  markCoasts(map);
  return map;
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
