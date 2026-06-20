// Procedural map generation for M0. Produces a GameMap of the same shape the
// geodata baker emits, so the renderer is source-agnostic.

import {
  makeRng,
  getTile,
  axialNeighbor,
  axialToOffset,
  offsetToAxial,
  isWater,
  type GameMap,
  type Tile,
  type TerrainType,
  type Rng,
} from "@roc/shared";
import { makeValueNoise } from "./noise";
import { isWorldLand } from "./worldmask";

/**
 * The shape of the world a map is generated as. Procedural types shape the
 * elevation field into recognizable landmass layouts; "realworld" instead lays
 * the baked Natural Earth continents down and grows terrain on top of them.
 */
export type MapType =
  | "continents"
  | "pangaea"
  | "two_continents"
  | "three_continents"
  | "archipelago"
  | "inland_sea"
  | "islands"
  | "realworld";

export const MAP_TYPES: readonly MapType[] = [
  "continents",
  "pangaea",
  "two_continents",
  "three_continents",
  "archipelago",
  "inland_sea",
  "islands",
  "realworld",
];

export interface WorldGenOptions {
  cols: number;
  rows: number;
  seed: number | string;
  /** Fraction of the map that should be below sea level (0..1). */
  seaLevel?: number;
  /** Landmass layout to generate. Defaults to "continents". */
  mapType?: MapType;
}

/** Smooth 0→1 ramp between edges `a` and `b` (Hermite). */
function smoothstep(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** A soft landmass centered at (cx,cy): ~1 at the center, fading to 0 by radius r. */
function blob(u: number, v: number, cx: number, cy: number, r: number): number {
  const d = Math.hypot(u - cx, v - cy);
  return 1 - smoothstep(r * 0.45, r, d);
}

/**
 * How a map type shapes generation: a sea level, a noise-frequency multiplier
 * (higher = more, smaller landmasses), and an elevation multiplier per tile.
 * `mask` takes normalized position (u,v in 0..1) plus the border `edge` falloff.
 */
interface Shaper {
  seaLevel: number;
  freq: number;
  mask(u: number, v: number, edge: number): number;
}

function shaperFor(type: MapType): Shaper {
  switch (type) {
    case "pangaea":
      // One dominant central supercontinent.
      return { seaLevel: 0.42, freq: 0.85, mask: (u, v, e) => (0.35 + 0.8 * blob(u, v, 0.5, 0.5, 0.62)) * e };
    case "two_continents":
      return {
        seaLevel: 0.44,
        freq: 1,
        mask: (u, v, e) => (0.3 + 0.85 * Math.max(blob(u, v, 0.27, 0.5, 0.42), blob(u, v, 0.73, 0.5, 0.42))) * e,
      };
    case "three_continents":
      return {
        seaLevel: 0.45,
        freq: 1.05,
        mask: (u, v, e) =>
          (0.28 +
            0.85 *
              Math.max(
                blob(u, v, 0.24, 0.33, 0.34),
                blob(u, v, 0.75, 0.34, 0.34),
                blob(u, v, 0.5, 0.74, 0.34),
              )) *
          e,
      };
    case "inland_sea":
      // A ring of land wrapped around a central sea (with open ocean at the rim).
      return {
        seaLevel: 0.42,
        freq: 1,
        mask: (u, v, e) => (0.4 + 0.6 * smoothstep(0.12, 0.4, Math.hypot(u - 0.5, v - 0.5))) * e,
      };
    case "archipelago":
      // Many medium islands: lower land bias + higher-frequency fragmentation.
      return { seaLevel: 0.5, freq: 1.8, mask: (_u, _v, e) => (0.55 + 0.4 * e) * (0.6 + 0.4 * e) };
    case "islands":
      // Lots of small scattered islands.
      return { seaLevel: 0.58, freq: 2.6, mask: (_u, _v, e) => (0.5 + 0.4 * e) * (0.55 + 0.45 * e) };
    case "realworld":
    case "continents":
    default:
      // Default: the original behavior — continents kept off the map borders.
      return { seaLevel: 0.42, freq: 1, mask: (_u, _v, e) => 0.55 + 0.45 * e };
  }
}

/** Scatter distinctive elevated terrain (volcanoes, mesas) for variety. */
function elevatedDetail(terrain: TerrainType, equatorness: number, moisture: number, rng: Rng): TerrainType {
  if (terrain === "mountains" && rng.next() < 0.08) return "volcano";
  if (terrain === "hills" && (equatorness > 0.75 || moisture < 0.3) && rng.next() < 0.25) return "mesa";
  return terrain;
}

/** Classify a land tile from elevation, moisture and latitude (0=pole, 1=equator). */
function classifyLand(
  elevation: number,
  moisture: number,
  equatorness: number,
): TerrainType {
  // The fractal value-noise clusters near 0.5, so these thresholds are tuned to
  // that distribution to yield a visible amount of high ground (~3% mountains,
  // ~10% hills of all land) rather than the near-zero the old 0.7/0.82 gave.
  if (elevation > 0.52) return "mountains";
  if (elevation > 0.38) return "hills";
  // Polar band: a frozen mix rather than a uniform ice sheet. Drier ground stays
  // barren snow (0 yield); a moderately moist belt is frozen tundra steppe; the
  // wettest pockets grow snowy boreal taiga (production).
  if (equatorness < 0.18) {
    if (moisture < 0.4) return "snow";
    if (moisture > 0.62) return "taiga";
    return "tundra";
  }
  // Wetter/denser stands become true forest (+science); lighter stands are woods.
  // The forest cutoff splits the wet range near its middle so forest is about as
  // common as woods (the old 0.7/0.8 cutoffs sat in the noise's rare upper tail,
  // yielding almost no forest).
  if (equatorness < 0.32) return moisture > 0.5 ? (moisture > 0.59 ? "forest" : "woods") : "tundra";
  // Equatorial band: a wet gradient instead of uniform jungle. Dry edges are
  // desert; the moist belt is dense jungle; wetter lowland is fertile wetlands
  // (food); the soggiest extremes turn to poor peat bog.
  if (equatorness > 0.78) {
    if (moisture < 0.45) return "desert";
    if (moisture < 0.62) return "jungle";
    if (moisture < 0.78) return "wetlands";
    return "bog";
  }
  if (moisture < 0.32) return "desert";
  if (moisture > 0.62) return moisture > 0.70 ? "forest" : "woods";
  return equatorness > 0.55 ? "plains" : "grassland";
}

export function generateMap(opts: WorldGenOptions): GameMap {
  const { cols, rows } = opts;
  const mapType = opts.mapType ?? "continents";
  const realWorld = mapType === "realworld";
  const shaper = shaperFor(mapType);
  const seaLevel = opts.seaLevel ?? shaper.seaLevel;
  const rng = makeRng(opts.seed);
  const elevation = makeValueNoise(rng, 64, 5);
  const moisture = makeValueNoise(rng, 48, 4);

  const tiles: Tile[] = new Array(cols * rows);
  const heights = new Float32Array(cols * rows); // raw elevation, for river flow
  const nx = (6 / cols) * shaper.freq; // noise frequency scale across the map
  const ny = (6 / rows) * shaper.freq;

  for (let row = 0; row < rows; row++) {
    // Falloff toward the top/bottom edges keeps continents off the borders.
    const latitude = row / (rows - 1); // 0 (north) .. 1 (south)
    const equatorness = 1 - Math.abs(latitude - 0.5) * 2; // 0 at poles, 1 at equator
    const v = rows > 1 ? row / (rows - 1) : 0.5;
    for (let col = 0; col < cols; col++) {
      const u = cols > 1 ? col / (cols - 1) : 0.5;
      const e = elevation(col * nx, row * ny);
      const edgeFalloff =
        Math.min(1, (Math.min(col, cols - 1 - col) / (cols * 0.12)) * 1) *
        Math.min(1, (Math.min(row, rows - 1 - row) / (rows * 0.12)) * 1);

      let terrain: TerrainType;
      let height: number;
      if (realWorld) {
        // Lay down the real continents, then grow elevation/biomes on the land.
        if (!isWorldLand(col, row, cols, rows)) {
          terrain = "ocean";
          height = seaLevel * 0.5;
        } else {
          height = seaLevel + 1e-3 + e * (1 - seaLevel);
          const m = moisture(col * nx + 13.5, row * ny + 7.25);
          // Use the SAME normalized relief the procedural maps feed classifyLand,
          // so mountains/hills stay rare. Feeding raw noise here (which clusters
          // near 0.5, above the 0.52 mountain threshold) turned whole continents
          // into impassable ranges.
          const relief = Math.max(0, (e - seaLevel) / (1 - seaLevel));
          terrain = elevatedDetail(classifyLand(relief, m, equatorness), equatorness, m, rng);
        }
      } else {
        height = e * shaper.mask(u, v, edgeFalloff);
        if (height < seaLevel) {
          terrain = "ocean";
        } else {
          const m = moisture(col * nx + 13.5, row * ny + 7.25);
          terrain = elevatedDetail(
            classifyLand((height - seaLevel) / (1 - seaLevel), m, equatorness),
            equatorness,
            m,
            rng,
          );
        }
      }
      tiles[row * cols + col] = { col, row, terrain };
      heights[row * cols + col] = height;
    }
  }

  const map: GameMap = { cols, rows, tiles };
  markLakes(map);
  markCoasts(map);
  generateRivers(map, heights, rng);
  return map;
}

/** Direction (0..5) from tile A to adjacent tile B, or -1 if not neighbours. */
function dirBetween(a: Tile, bCol: number, bRow: number): number {
  const ax = offsetToAxial({ col: a.col, row: a.row });
  for (let d = 0; d < 6; d++) {
    const n = axialToOffset(axialNeighbor(ax, d));
    if (n.col === bCol && n.row === bRow) return d;
  }
  return -1;
}

/**
 * Carve a handful of rivers that flow from high ground downhill to the sea (or to
 * a terminal lake). Each step links two tiles by setting, on both, the river bit
 * pointing at the other — so the painted channels meet at the shared edge midpoint
 * and join seamlessly. The source tile ends up with a single bit (a spring); a run
 * that dies in a basin turns its last tile into a small river lake.
 */
function generateRivers(map: GameMap, heights: Float32Array, rng: Rng): void {
  const { cols, rows, tiles } = map;
  const idx = (c: number, r: number) => r * cols + c;
  const isLand = (t: Tile | undefined): boolean =>
    !!t && !isWater(t.terrain) && t.terrain !== "mountains" && t.terrain !== "volcano";

  // Candidate sources: elevated land tiles, away from the very edge.
  const sources: number[] = [];
  for (let r = 2; r < rows - 2; r++) {
    for (let c = 2; c < cols - 2; c++) {
      const t = tiles[idx(c, r)]!;
      if (isLand(t) && heights[idx(c, r)]! > 0.55) sources.push(idx(c, r));
    }
  }
  // Pick a generous spread of sources so rivers thread across the whole map.
  const target = Math.max(12, Math.round((cols * rows) / 30));
  const chosen: number[] = [];
  for (let i = sources.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [sources[i], sources[j]] = [sources[j]!, sources[i]!];
  }
  for (const s of sources) {
    if (chosen.length >= target) break;
    const sc = s % cols, sr = (s / cols) | 0;
    if (chosen.every((o) => Math.abs((o % cols) - sc) + Math.abs(((o / cols) | 0) - sr) > 1)) {
      chosen.push(s);
    }
  }

  // Walk a river downhill from `startTile`, linking each step to the lowest
  // neighbour (descending into water as a mouth, pooling into a lake in a basin).
  const flow = (startTile: Tile): void => {
    let cur = startTile;
    const visited = new Set<number>([idx(cur.col, cur.row)]);
    for (let step = 0; step < cols + rows; step++) {
      const here = offsetToAxial({ col: cur.col, row: cur.row });
      let best: Tile | undefined;
      let bestH = heights[idx(cur.col, cur.row)]!;
      for (let d = 0; d < 6; d++) {
        const n = axialToOffset(axialNeighbor(here, d));
        const nt = getTile(map, n.col, n.row);
        if (!nt) continue;
        if (nt.terrain === "mountains" || nt.terrain === "volcano") continue;
        const h = heights[idx(n.col, n.row)]!;
        if (h < bestH - 1e-4) { bestH = h; best = nt; }
      }
      if (!best) {
        cur.riverLake = true; // basin with nowhere to drain → a small lake
        break;
      }
      const d = dirBetween(cur, best.col, best.row);
      if (d < 0) break;
      cur.river = (cur.river ?? 0) | (1 << d);
      if (isWater(best.terrain)) break; // reached the sea: this edge is a river mouth
      best.river = (best.river ?? 0) | (1 << ((d + 3) % 6));
      if (visited.has(idx(best.col, best.row))) break; // merged into an existing river
      visited.add(idx(best.col, best.row));
      cur = best;
    }
  };

  for (const start of chosen) {
    if (tiles[start]!.river) continue; // already part of a river
    flow(tiles[start]!);
  }

  // Mountain springs: a few extra rivers tumble straight out of a mountainside.
  // Only the four lower edges (E, W, SW, SE) have combined mountain+river art, so
  // a spring must drain toward one of those.
  const MOUNTAIN_DIRS = [0, 3, 4, 5];
  const mtnSources: number[] = [];
  for (let r = 2; r < rows - 2; r++) {
    for (let c = 2; c < cols - 2; c++) {
      const m = tiles[idx(c, r)]!;
      if (m.terrain !== "mountains" || m.river) continue;
      const here = offsetToAxial({ col: c, row: r });
      const mh = heights[idx(c, r)]!;
      const drains = MOUNTAIN_DIRS.some((d) => {
        const n = axialToOffset(axialNeighbor(here, d));
        const nt = getTile(map, n.col, n.row);
        return !!nt && nt.terrain !== "mountains" && nt.terrain !== "volcano" && heights[idx(n.col, n.row)]! < mh - 1e-4;
      });
      if (drains) mtnSources.push(idx(c, r));
    }
  }
  for (let i = mtnSources.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [mtnSources[i], mtnSources[j]] = [mtnSources[j]!, mtnSources[i]!];
  }
  const mtnTarget = Math.max(3, Math.round((cols * rows) / 250));
  const placed: number[] = [];
  for (const s of mtnSources) {
    if (placed.length >= mtnTarget) break;
    const sc = s % cols, sr = (s / cols) | 0;
    if (!placed.every((o) => Math.abs((o % cols) - sc) + Math.abs(((o / cols) | 0) - sr) > 2)) continue;
    const m = tiles[s]!;
    const here = offsetToAxial({ col: m.col, row: m.row });
    // Spill toward the lowest of the art-supported (lower) edges.
    let best: Tile | undefined;
    let bestH = heights[s]!;
    let bestDir = -1;
    for (const d of MOUNTAIN_DIRS) {
      const n = axialToOffset(axialNeighbor(here, d));
      const nt = getTile(map, n.col, n.row);
      if (!nt || nt.terrain === "mountains" || nt.terrain === "volcano") continue;
      const h = heights[idx(n.col, n.row)]!;
      if (h < bestH - 1e-4) { bestH = h; best = nt; bestDir = d; }
    }
    if (!best || bestDir < 0) continue;
    const bestWasRiver = !!best.river;
    m.river = (m.river ?? 0) | (1 << bestDir);
    placed.push(s);
    if (isWater(best.terrain)) continue; // spills straight into the sea (a mouth)
    best.river = (best.river ?? 0) | (1 << ((bestDir + 3) % 6));
    if (!bestWasRiver) flow(best); // carry the new river on downhill to the sea
  }
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
