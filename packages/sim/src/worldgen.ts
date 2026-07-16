// Procedural map generation for M0. Produces a GameMap of the same shape the
// geodata baker emits, so the renderer is source-agnostic.

import {
  makeRng,
  getTile,
  axialNeighbor,
  axialToOffset,
  offsetToAxial,
  offsetNeighborDeltas,
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
  | "random"
  | "continents"
  | "pangaea"
  | "two_continents"
  | "three_continents"
  | "four_continents"
  | "archipelago"
  | "inland_sea"
  | "islands"
  | "realworld";

/** Layouts the "Random" menu choice can roll (excludes the meta "random" type). */
export const RANDOM_MAP_POOL: readonly MapType[] = [
  "continents",
  "pangaea",
  "two_continents",
  "three_continents",
  "four_continents",
  "archipelago",
  "inland_sea",
  "islands",
  "realworld",
];

/** All map-type values (menu + internal). */
export const MAP_TYPES: readonly MapType[] = [
  "random",
  "continents",
  "pangaea",
  "two_continents",
  "three_continents",
  "four_continents",
  "archipelago",
  "inland_sea",
  "islands",
  "realworld",
];

/** Human-readable names for map layouts (menus + in-game HUD). */
export const MAP_TYPE_LABELS: Record<MapType, string> = {
  random: "Random",
  continents: "Continents (1–4)",
  pangaea: "One Continent",
  two_continents: "Two Continents",
  three_continents: "Three Continents",
  four_continents: "Four Continents",
  archipelago: "Archipelago",
  inland_sea: "Inland Sea",
  islands: "Islands",
  realworld: "Real World (Earth)",
};

export function mapTypeLabel(type: MapType | string | undefined): string {
  if (!type) return "";
  return MAP_TYPE_LABELS[type as MapType] ?? type.replaceAll("_", " ");
}

/** Label for the in-game HUD. A rolled lobby choice (Random / Continents 1–4)
 *  keeps showing the player's pick — revealing the rolled layout (or how many
 *  continents there really are) would spoil exploration. */
export function mapTypeDisplay(
  requested: MapType | string | undefined,
  resolved: MapType | string,
): string {
  if (requested && requested !== resolved) return mapTypeLabel(requested);
  return mapTypeLabel(resolved);
}

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

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

/** A continent seed in normalized map coordinates (0..1), with its own randomized
 *  silhouette: size, elliptical stretch, rotation, and radial lobes. */
interface ContinentSeed {
  cx: number;
  cy: number;
  /** Base radius of the land blob around this seed. */
  r: number;
  /** Rotation of the silhouette (radians). */
  rot: number;
  /** Elliptical stretch: >1 squashes the blob along its rotated x-axis. */
  aspect: number;
  /** Radial harmonics that swell/pinch the coast by angle (peninsulas & bays). */
  lobes: { k: number; amp: number; phase: number }[];
}

/** A narrow land corridor joining two continents (a Panama/Suez-style isthmus). */
interface Bridge {
  a: number;
  b: number;
  /** Half-width of the corridor in normalized map units. */
  width: number;
  /** Sinusoidal wobble of the corridor centerline. */
  waves: number;
  phase: number;
  amp: number;
}

interface ContinentLayout {
  seeds: ContinentSeed[];
  bridges: Bridge[];
}

/** Open-ocean strip between Voronoi cells — keeps landmasses from merging. */
const CONTINENT_SEPARATION = 0.07;
/** Chance each eligible continent pair is joined by a land bridge. */
const BRIDGE_CHANCE = 0.4;

/** How many major landmasses a map type promises. */
export function targetContinentCount(type: MapType): number | null {
  switch (type) {
    case "pangaea":
      return 1;
    case "two_continents":
      return 2;
    case "three_continents":
      return 3;
    case "four_continents":
      return 4;
    default:
      return null;
  }
}

/**
 * Turn a menu/lobby map type into the concrete layout used for generation.
 * "random" picks any playable layout; "continents" rolls 1–4 separate landmasses.
 */
export function resolveMapType(seed: number | string, mapType: MapType = "continents"): MapType {
  if (mapType === "random") {
    const rng = makeRng(`${seed}:map-random`);
    const pick = RANDOM_MAP_POOL[Math.floor(rng.next() * RANDOM_MAP_POOL.length)]!;
    return resolveMapType(seed, pick);
  }
  if (mapType === "continents") {
    // Weighted roll: a single supercontinent is a rare treat, not 1-in-4.
    const rng = makeRng(`${seed}:continents`);
    const roll = rng.next();
    if (roll < 0.08) return "pangaea";
    if (roll < 0.4) return "two_continents";
    if (roll < 0.72) return "three_continents";
    return "four_continents";
  }
  return mapType;
}

/** Fixed anchor positions per layout; randomization spins/jitters/re-sizes them. */
function continentAnchorsFor(type: MapType): { cx: number; cy: number; r: number }[] | null {
  switch (type) {
    case "pangaea":
      return [{ cx: 0.5, cy: 0.5, r: 0.58 }];
    case "two_continents":
      return [
        { cx: 0.28, cy: 0.5, r: 0.31 },
        { cx: 0.72, cy: 0.5, r: 0.31 },
      ];
    case "three_continents":
      return [
        { cx: 0.25, cy: 0.32, r: 0.28 },
        { cx: 0.75, cy: 0.33, r: 0.28 },
        { cx: 0.5, cy: 0.74, r: 0.28 },
      ];
    case "four_continents":
      return [
        { cx: 0.24, cy: 0.27, r: 0.27 },
        { cx: 0.76, cy: 0.27, r: 0.27 },
        { cx: 0.24, cy: 0.73, r: 0.27 },
        { cx: 0.76, cy: 0.73, r: 0.27 },
      ];
    default:
      return null;
  }
}

/** Continent pairs a land bridge may join (adjacent cells only, no diagonals). */
function bridgeablePairs(count: number): [number, number][] {
  if (count === 2) return [[0, 1]];
  if (count === 3) return [[0, 1], [0, 2], [1, 2]];
  if (count === 4) return [[0, 1], [0, 2], [1, 3], [2, 3]];
  return [];
}

/**
 * Roll the concrete continent layout for a seed. The anchor constellation is spun
 * around the map center and jittered, and every continent draws its own size,
 * stretch, and coastal lobes — so no two maps share an arrangement, and one
 * continent can dwarf another. A few pairs may be joined by land bridges.
 */
function makeContinentLayout(seed: number | string, type: MapType): ContinentLayout | null {
  const anchors = continentAnchorsFor(type);
  if (!anchors) return null;
  const rng = makeRng(`${seed}:continent-layout`);
  const spin = rng.next() * Math.PI * 2;
  const seeds: ContinentSeed[] = anchors.map((a) => {
    let cx = a.cx;
    let cy = a.cy;
    if (anchors.length > 1) {
      // Rotate the whole constellation so "two continents" isn't always east/west.
      const dx = a.cx - 0.5;
      const dy = a.cy - 0.5;
      cx = 0.5 + dx * Math.cos(spin) - dy * Math.sin(spin);
      cy = 0.5 + dx * Math.sin(spin) + dy * Math.cos(spin);
    }
    return {
      cx: clamp(cx + (rng.next() - 0.5) * 0.08, 0.18, 0.82),
      cy: clamp(cy + (rng.next() - 0.5) * 0.08, 0.18, 0.82),
      r: a.r * (0.78 + rng.next() * 0.5), // up to ~2.7× area difference between continents
      rot: rng.next() * Math.PI * 2,
      aspect: 0.8 + rng.next() * 0.6,
      lobes: [
        { k: 2, amp: 0.1 + rng.next() * 0.12, phase: rng.next() * Math.PI * 2 },
        { k: 3, amp: 0.06 + rng.next() * 0.1, phase: rng.next() * Math.PI * 2 },
        { k: 5, amp: 0.04 + rng.next() * 0.06, phase: rng.next() * Math.PI * 2 },
      ],
    };
  });
  const bridges: Bridge[] = [];
  const pairs = bridgeablePairs(seeds.length);
  for (let i = pairs.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [pairs[i], pairs[j]] = [pairs[j]!, pairs[i]!];
  }
  const maxBridges = Math.min(2, seeds.length - 1);
  for (const [a, b] of pairs) {
    if (bridges.length >= maxBridges) break;
    if (rng.next() >= BRIDGE_CHANCE) continue;
    bridges.push({
      a,
      b,
      width: 0.016 + rng.next() * 0.014,
      waves: 1 + Math.floor(rng.next() * 3),
      phase: rng.next() * Math.PI * 2,
      amp: 0.02 + rng.next() * 0.05,
    });
  }
  return { seeds, bridges };
}

/** How many connected landmasses the layout promises once bridges join seeds. */
function layoutComponents(layout: ContinentLayout): number {
  const parent = layout.seeds.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
  for (const br of layout.bridges) parent[find(br.a)] = find(br.b);
  return new Set(layout.seeds.map((_, i) => find(i))).size;
}

/** The seed's blob deformed by stretch, rotation, and coastal lobes: ~1 at the
 *  center, fading to 0 by its (angle-dependent) radius. */
function shapedBlob(u: number, v: number, s: ContinentSeed): number {
  const dx = u - s.cx;
  const dy = v - s.cy;
  const cos = Math.cos(s.rot);
  const sin = Math.sin(s.rot);
  const x = (dx * cos - dy * sin) * s.aspect;
  const y = dx * sin + dy * cos;
  const d = Math.hypot(x, y);
  if (d < 1e-9) return 1;
  const ang = Math.atan2(y, x);
  let r = s.r;
  for (const l of s.lobes) r *= 1 + l.amp * Math.sin(l.k * ang + l.phase);
  return 1 - smoothstep(r * 0.42, r, d);
}

/**
 * Each tile belongs to exactly one continent cell (nearest seed). Land only grows
 * inside that cell and away from the shared borders, so continents cannot merge
 * into one supercontinent — except along explicit bridge corridors.
 */
function voronoiContinentMask(
  u: number,
  v: number,
  edge: number,
  seeds: ContinentSeed[],
  separation: number,
): number {
  let nearest: ContinentSeed | undefined;
  let d0 = Infinity;
  let d1 = Infinity;
  for (const s of seeds) {
    const d = Math.hypot(u - s.cx, v - s.cy);
    if (d < d0) {
      d1 = d0;
      d0 = d;
      nearest = s;
    } else if (d < d1) {
      d1 = d;
    }
  }
  if (seeds.length > 1 && d1 - d0 < separation) return 0;
  return (0.22 + 0.88 * shapedBlob(u, v, nearest!)) * edge;
}

function layoutMask(layout: ContinentLayout): (u: number, v: number, edge: number) => number {
  return (u, v, edge) => voronoiContinentMask(u, v, edge, layout.seeds, CONTINENT_SEPARATION);
}

/** Distance from (u,v) to the (wobbled) centerline of a bridge corridor. */
function bridgeDist(u: number, v: number, layout: ContinentLayout, br: Bridge): number {
  const a = layout.seeds[br.a]!;
  const b = layout.seeds[br.b]!;
  const dx = b.cx - a.cx;
  const dy = b.cy - a.cy;
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return Infinity;
  const t = clamp(((u - a.cx) * dx + (v - a.cy) * dy) / (len * len), 0, 1);
  // The wobble is pinned at both ends so the corridor still meets each core.
  const wob = Math.sin(t * Math.PI * br.waves + br.phase) * br.amp * Math.sin(t * Math.PI);
  const px = a.cx + dx * t - (dy / len) * wob;
  const py = a.cy + dy * t + (dx / len) * wob;
  return Math.hypot(u - px, v - py);
}

/** Extra height from bridge corridors: land is certain along the centerline and
 *  tapers off noisily toward the corridor edge, giving a ragged natural isthmus. */
function bridgeBoost(u: number, v: number, layout: ContinentLayout, e: number, seaLevel: number): number {
  let best = 0;
  for (const br of layout.bridges) {
    const d = bridgeDist(u, v, layout, br);
    if (d >= br.width) continue;
    const core = 1 - d / br.width;
    const h = seaLevel - 0.04 + (0.07 + 0.14 * e) * core;
    if (h > best) best = h;
  }
  return best;
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

function shaperFor(type: MapType, layout: ContinentLayout | null): Shaper {
  switch (type) {
    case "pangaea":
      // One dominant central supercontinent (randomized shape via the layout).
      return { seaLevel: 0.42, freq: 0.85, mask: layoutMask(layout!) };
    case "two_continents":
      return { seaLevel: 0.44, freq: 1, mask: layoutMask(layout!) };
    case "three_continents":
      return { seaLevel: 0.45, freq: 1.05, mask: layoutMask(layout!) };
    case "four_continents":
      return { seaLevel: 0.46, freq: 1.05, mask: layoutMask(layout!) };
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

/** Smallest landmass that counts as a "major" one (a continent) — everything
 *  below is an island. Islands the generator sprinkles stay under this, so the
 *  continent-count promise of the map type is never disturbed. */
export function majorLandmassMin(cols: number, rows: number): number {
  return Math.max(24, Math.round((cols * rows) / 160));
}

/** Hex tiles in a radius-r disk (axial distance ≤ r). Matches city territory geometry. */
function hexDiskTileCount(radius: number): number {
  return 1 + 3 * radius * (radius + 1);
}

/** Minimum land tiles on a standalone island for a **player start**. Smaller
 *  islets may still appear on the map (offshore scenery, island chains) but
 *  findStarts keeps civs off them — they cannot develop Sailing and a navy.
 *  Sized for radius-2 city borders plus the Sailing tech chain and Shipyard. */
export function minViableIslandTiles(): number {
  return hexDiskTileCount(2); // 19
}

export function generateMap(opts: WorldGenOptions): GameMap {
  const requested = opts.mapType ?? "continents";
  const mapType = resolveMapType(opts.seed, requested);
  const genOpts = { ...opts, mapType };
  const minSize = majorLandmassMin(opts.cols, opts.rows);
  const stamp = (map: GameMap): GameMap => ({
    ...map,
    mapType,
    mapTypeRequested: requested,
    // Continental landmasses only — the polar ice caps don't count.
    landmassCount: countLandmasses(map, minSize, map.poleAxis),
  });
  const target = targetContinentCount(mapType);
  const maxAttempts = target !== null ? 16 : 1;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const seed = attempt === 0 ? opts.seed : `${opts.seed}:continent:${attempt}`;
    const map = generateMapOnce({ ...genOpts, seed });
    if (target === null) return stamp(map);
    // Land bridges deliberately join continents, so the promised landmass count
    // is the layout's connected-component count, not the raw continent count.
    const layout = makeContinentLayout(seed, mapType)!;
    if (countLandmasses(map, minSize, map.poleAxis) === layoutComponents(layout)) return stamp(map);
  }
  // Last resort: regenerate with wider seam carving to force separation.
  return stamp(generateMapOnce({ ...genOpts, seed: `${opts.seed}:continent:force` }, 1.35));
}

/** How much the domain warp displaces coastlines (normalized map units). */
const WARP_AMP = 0.045;

function generateMapOnce(opts: WorldGenOptions, separationScale = 1): GameMap {
  const { cols, rows } = opts;
  const mapType = opts.mapType ?? "continents";
  const realWorld = mapType === "realworld";
  const layout = makeContinentLayout(opts.seed, mapType);
  const shaper = shaperFor(mapType, layout);
  const seaLevel = opts.seaLevel ?? shaper.seaLevel;
  const rng = makeRng(opts.seed);
  const elevation = makeValueNoise(rng, 64, 5);
  const moisture = makeValueNoise(rng, 48, 4);
  // Domain warp: bend the coordinates the landmass masks see, so continent
  // outlines and Voronoi seams turn ragged instead of geometric.
  const warpNoise = makeValueNoise(rng, 32, 3);
  // Independent hill country: the relief field alone only yields hills as
  // skirts around mountain cores, so a separate noise band rolls open uplands.
  const hillNoise = makeValueNoise(rng, 40, 4);
  const warp = (u: number, v: number): [number, number] =>
    realWorld
      ? [u, v]
      : [
          u + (warpNoise(u * 2.6, v * 2.6) - 0.5) * 2 * WARP_AMP,
          v + (warpNoise(u * 2.6 + 9.2, v * 2.6 + 4.7) - 0.5) * 2 * WARP_AMP,
        ];

  const tiles: Tile[] = new Array(cols * rows);
  const heights = new Float32Array(cols * rows); // raw elevation, for river flow
  const nx = (6 / cols) * shaper.freq; // noise frequency scale across the map
  const ny = (6 / rows) * shaper.freq;
  const moistAt = (col: number, row: number): number => moisture(col * nx + 13.5, row * ny + 7.25);
  // Open flat ground in a hill-noise band becomes rolling hill country. Wooded,
  // wet, and frozen ground keeps its character (and the polar band stays flat
  // ice, so the caps read as ice sheets).
  const applyHills = (terrain: TerrainType, col: number, row: number, equatorness: number): TerrainType => {
    if (equatorness < 0.18) return terrain;
    if (terrain !== "grassland" && terrain !== "plains" && terrain !== "desert" && terrain !== "tundra") {
      return terrain;
    }
    return hillNoise(col * nx * 1.7 + 31.7, row * ny * 1.7 + 17.3) > 0.56 ? "hills" : terrain;
  };
  // The frozen poles sit at a random pair of opposite edges; Earth stays N/S.
  const poleAxis: "ns" | "ew" = !realWorld && makeRng(`${opts.seed}:poles`).next() < 0.5 ? "ew" : "ns";
  const equatorAt = (col: number, row: number): number =>
    poleAxis === "ns"
      ? 1 - Math.abs((rows > 1 ? row / (rows - 1) : 0.5) - 0.5) * 2
      : 1 - Math.abs((cols > 1 ? col / (cols - 1) : 0.5) - 0.5) * 2;

  for (let row = 0; row < rows; row++) {
    // Falloff toward the map edges keeps continents off the borders.
    const v = rows > 1 ? row / (rows - 1) : 0.5;
    for (let col = 0; col < cols; col++) {
      const equatorness = equatorAt(col, row); // 0 at poles, 1 at equator
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
          const m = moistAt(col, row);
          // Use the SAME normalized relief the procedural maps feed classifyLand,
          // so mountains/hills stay rare. Feeding raw noise here (which clusters
          // near 0.5, above the 0.52 mountain threshold) turned whole continents
          // into impassable ranges.
          const relief = Math.max(0, (e - seaLevel) / (1 - seaLevel));
          terrain = elevatedDetail(
            applyHills(classifyLand(relief, m, equatorness), col, row, equatorness),
            equatorness,
            m,
            rng,
          );
        }
      } else {
        const [wu, wv] = warp(u, v);
        height = e * shaper.mask(wu, wv, edgeFalloff);
        if (layout && layout.bridges.length) {
          height = Math.max(height, bridgeBoost(wu, wv, layout, e, seaLevel) * Math.min(1, edgeFalloff * 4));
        }
        if (height < seaLevel) {
          terrain = "ocean";
        } else {
          const m = moistAt(col, row);
          terrain = elevatedDetail(
            applyHills(classifyLand((height - seaLevel) / (1 - seaLevel), m, equatorness), col, row, equatorness),
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

  const map: GameMap = { cols, rows, tiles, poleAxis };
  if (layout && layout.seeds.length > 1) {
    carveContinentSeams(map, layout, CONTINENT_SEPARATION * separationScale, warp, heights, seaLevel);
  }
  // Lakes before bridges: a causeway stamped later simply punches through.
  sprinkleLakes(map, heights, rng, seaLevel);
  if (layout && layout.bridges.length) stampBridges(map, heights, layout, seaLevel, moistAt, equatorAt, rng);
  // Every world gets islands: small scatters, a big one or two, arcs, pack ice
  // at the poles. Island worlds already are islands.
  if (mapType !== "islands" && mapType !== "archipelago") {
    sprinkleIslands(map, heights, rng, seaLevel, moistAt, equatorAt, poleAxis);
  }
  // Moist hills grow a forest cover — wooded hills, everywhere on the map
  // (continents, islands, bridges alike).
  for (const t of tiles) {
    if (t.terrain === "hills" && moistAt(t.col, t.row) > 0.5) t.wooded = true;
  }
  markLakes(map);
  markCoasts(map);
  generateRivers(map, heights, rng);
  return map;
}

/**
 * Count connected land regions at least `minTiles` large (ignores tiny islets).
 * When `excludeCapsAxis` is given, regions touching that axis's polar map
 * borders are skipped: those are the generated ice caps, not continents —
 * procedural continents never reach the border (the edge falloff forces ocean
 * there), so border contact identifies a cap unambiguously.
 */
export function countLandmasses(
  map: GameMap,
  minTiles = 16,
  excludeCapsAxis?: "ns" | "ew" | null,
): number {
  const { cols, rows, tiles } = map;
  const seen = new Array<boolean>(cols * rows).fill(false);
  let count = 0;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const start = row * cols + col;
      if (seen[start] || isWater(tiles[start]!.terrain)) continue;
      let size = 0;
      let touchesPole = false;
      const stack: [number, number][] = [[col, row]];
      seen[start] = true;
      while (stack.length) {
        const [c, r] = stack.pop()!;
        size++;
        if (excludeCapsAxis === "ns" ? r === 0 || r === rows - 1 : excludeCapsAxis === "ew" ? c === 0 || c === cols - 1 : false) {
          touchesPole = true;
        }
        for (const [nc, nr] of waterNeighbors(map, c, r)) {
          const ni = nr * cols + nc;
          if (!seen[ni] && !isWater(tiles[ni]!.terrain)) {
            seen[ni] = true;
            stack.push([nc, nr]);
          }
        }
      }
      if (size >= minTiles && !touchesPole) count++;
    }
  }
  return count;
}

/** Flood any land sitting on a Voronoi seam back to open ocean. Bridge corridors
 *  are exempt — they are the sanctioned crossings of the seam. */
function carveContinentSeams(
  map: GameMap,
  layout: ContinentLayout,
  separation: number,
  warp: (u: number, v: number) => [number, number],
  heights: Float32Array,
  seaLevel: number,
): void {
  const { cols, rows, tiles } = map;
  for (let row = 0; row < rows; row++) {
    const v = rows > 1 ? row / (rows - 1) : 0.5;
    for (let col = 0; col < cols; col++) {
      const tile = tiles[row * cols + col]!;
      if (isWater(tile.terrain)) continue;
      const u = cols > 1 ? col / (cols - 1) : 0.5;
      const [wu, wv] = warp(u, v);
      const dists = layout.seeds.map((s) => Math.hypot(wu - s.cx, wv - s.cy)).sort((a, b) => a - b);
      if ((dists[1] ?? Infinity) - dists[0]! >= separation) continue;
      if (layout.bridges.some((br) => bridgeDist(wu, wv, layout, br) < br.width + 0.004)) continue;
      tile.terrain = "ocean";
      heights[row * cols + col] = seaLevel * 0.5;
    }
  }
}

/** Force a walkable causeway of land tiles along each bridge corridor, so a
 *  rolled bridge always actually connects its continents at any map resolution. */
function stampBridges(
  map: GameMap,
  heights: Float32Array,
  layout: ContinentLayout,
  seaLevel: number,
  moistAt: (col: number, row: number) => number,
  equatorAt: (col: number, row: number) => number,
  rng: Rng,
): void {
  const { cols, rows, tiles } = map;
  const step = 0.4 / Math.max(cols, rows);
  const stampTile = (c: number, r: number): void => {
    const tile = tiles[r * cols + c]!;
    if (!isWater(tile.terrain)) return;
    const relief = 0.05 + rng.next() * 0.2; // low ground: a flat, passable isthmus
    tile.terrain = classifyLand(relief, moistAt(c, r), equatorAt(c, r));
    heights[r * cols + c] = seaLevel + 0.01 + relief * 0.1;
  };
  for (const br of layout.bridges) {
    const a = layout.seeds[br.a]!;
    const b = layout.seeds[br.b]!;
    const dx = b.cx - a.cx;
    const dy = b.cy - a.cy;
    const len = Math.hypot(dx, dy);
    if (len < 1e-9) continue;
    let prev: { col: number; row: number } | null = null;
    for (let t = 0; t <= 1; t += step) {
      const wob = Math.sin(t * Math.PI * br.waves + br.phase) * br.amp * Math.sin(t * Math.PI);
      const px = a.cx + dx * t - (dy / len) * wob;
      const py = a.cy + dy * t + (dx / len) * wob;
      const col = Math.round(px * (cols - 1));
      const row = Math.round(py * (rows - 1));
      if (col < 1 || row < 1 || col >= cols - 1 || row >= rows - 1) {
        prev = null;
        continue;
      }
      if (prev && (prev.col !== col || prev.row !== row)) {
        // Diagonal offset steps aren't always hex-adjacent; drop a connector so
        // the causeway never breaks into separate landmasses.
        const adjacent = offsetNeighborDeltas(prev.row).some(
          ([dc, dr]) => prev!.col + dc === col && prev!.row + dr === row,
        );
        if (!adjacent) stampTile(col, prev.row);
      }
      stampTile(col, row);
      prev = { col, row };
    }
  }
}

/**
 * Carve small inland lakes into flat land (depressions, meltwater, oxbows).
 * Only tiles whose entire neighbourhood is land qualify, so a lake never opens
 * into the sea; carved basins sit low, so rivers naturally drain toward them.
 */
function sprinkleLakes(map: GameMap, heights: Float32Array, rng: Rng, seaLevel: number): void {
  const { cols, rows, tiles } = map;
  const idx = (c: number, r: number) => r * cols + c;
  const carvable = (t: Tile): boolean =>
    !isWater(t.terrain) && t.terrain !== "mountains" && t.terrain !== "volcano";
  const allLandAround = (c: number, r: number): boolean => {
    const nbs = waterNeighbors(map, c, r);
    return nbs.length === 6 && nbs.every(([nc, nr]) => !isWater(tiles[idx(nc, nr)]!.terrain));
  };
  const target = Math.max(3, Math.round((cols * rows) / 170));
  let carved = 0;
  for (let tries = 0; tries < target * 30 && carved < target; tries++) {
    const c = 2 + Math.floor(rng.next() * (cols - 4));
    const r = 2 + Math.floor(rng.next() * (rows - 4));
    if (!carvable(tiles[idx(c, r)]!) || !allLandAround(c, r)) continue;
    const size = 1 + Math.floor(rng.next() * 4); // 1..4 tiles
    const cluster: [number, number][] = [[c, r]];
    while (cluster.length < size) {
      const [fc, fr] = cluster[Math.floor(rng.next() * cluster.length)]!;
      const options = waterNeighbors(map, fc, fr).filter(([nc, nr]) => {
        const nt = tiles[idx(nc, nr)]!;
        return (
          carvable(nt) && allLandAround(nc, nr) && !cluster.some(([cc, rr]) => cc === nc && rr === nr)
        );
      });
      if (!options.length) break;
      cluster.push(options[Math.floor(rng.next() * options.length)]!);
    }
    for (const [lc, lr] of cluster) {
      tiles[idx(lc, lr)]!.terrain = "lake";
      heights[idx(lc, lr)] = seaLevel * 0.75; // a basin rivers can drain into
    }
    carved++;
  }
}

/** Minimum open-water gap (in tiles) kept between an island and other land. */
const ISLAND_LAND_GAP = 2;

/** One island to stamp: a growth region around a center plus terrain flavor. */
interface IslandStamp {
  col: number;
  row: number;
  /** Growth is confined to this Chebyshev radius around the center. */
  radius: number;
  /** Target tile count. */
  size: number;
  /** Upper bound on rolled relief (higher → hillier islands). */
  reliefMax: number;
  /** Frozen pack-ice islet at a pole (snow/tundra regardless of latitude). */
  polar?: boolean;
}

/**
 * Stamp an Earth-like mix of islands into open ocean: a scatter of small islets,
 * one or two big islands (Japan), curved island arcs (the Philippines), and
 * frozen pack-ice islets hugging the polar edges. Every island stays well below
 * the "major landmass" threshold and keeps an open-water gap from all other
 * land, so the promised landmass count never changes.
 */
function sprinkleIslands(
  map: GameMap,
  heights: Float32Array,
  rng: Rng,
  seaLevel: number,
  moistAt: (col: number, row: number) => number,
  equatorAt: (col: number, row: number) => number,
  poleAxis: "ns" | "ew",
): void {
  const { cols, rows, tiles } = map;
  const idx = (c: number, r: number) => r * cols + c;

  // Multi-source BFS: distance (in tiles) from every water tile to nearest land.
  const dist = new Int32Array(cols * rows);
  const computeLandDistances = (): void => {
    dist.fill(-1);
    let frontier: [number, number][] = [];
    for (const t of tiles) {
      if (!isWater(t.terrain)) {
        dist[idx(t.col, t.row)] = 0;
        frontier.push([t.col, t.row]);
      }
    }
    let d = 0;
    while (frontier.length) {
      d++;
      const next: [number, number][] = [];
      for (const [c, r] of frontier) {
        for (const [nc, nr] of waterNeighbors(map, c, r)) {
          const ni = idx(nc, nr);
          if (dist[ni] === -1) {
            dist[ni] = d;
            next.push([nc, nr]);
          }
        }
      }
      frontier = next;
    }
  };
  computeLandDistances();
  // (dist stays -1 on a landless map: treat that as "far from land".)
  const farFromLand = (i: number, min: number): boolean => dist[i] === -1 || dist[i]! >= min;

  // 0) Polar ice caps: a contiguous frozen landmass on each polar edge — but
  //    not a wall: each cap spans only ~50–60% of its edge and bulges deepest
  //    at its heart, tapering to nothing at the tips (an Antarctica seen from
  //    above). It always keeps a water gap from continents (receding wherever
  //    one nears the pole), so it can never land-bridge anything. It touches
  //    the map border, which is how countLandmasses tells a cap from a
  //    continent.
  const capEdgeLen = poleAxis === "ns" ? cols : rows;
  const capMaxDepth = Math.min(6, Math.max(3, Math.round(Math.min(cols, rows) * 0.15)));
  for (const edge of [0, 1] as const) {
    const span = Math.round(capEdgeLen * (0.5 + rng.next() * 0.1)); // 50–60% of the edge
    const startAlong = Math.floor(rng.next() * (capEdgeLen - span));
    let wobble = 0;
    let lead = 0;
    for (let k = 0; k < span; k++) {
      const along = startAlong + k;
      const roll = rng.next();
      if (lead > 0) lead--;
      else if (roll < 0.04) lead = 1 + Math.floor(rng.next() * 2); // open-water lead
      else if (roll < 0.45) wobble = Math.max(-1, Math.min(1, wobble + (rng.next() < 0.5 ? -1 : 1)));
      if (lead > 0) continue;
      // Elliptical depth profile, roughened by the wobble.
      const t = span > 1 ? (k / (span - 1)) * 2 - 1 : 0;
      const depth = Math.max(1, Math.round(capMaxDepth * Math.sqrt(Math.max(0, 1 - t * t))) + wobble);
      for (let dd = 0; dd < depth; dd++) {
        const c = poleAxis === "ns" ? along : edge === 0 ? dd : cols - 1 - dd;
        const r = poleAxis === "ns" ? (edge === 0 ? dd : rows - 1 - dd) : along;
        const i = idx(c, r);
        if (tiles[i]!.terrain !== "ocean" || !farFromLand(i, ISLAND_LAND_GAP + 1)) continue;
        const m = moistAt(c, r);
        tiles[i]!.terrain = dd === 0 ? "snow" : m > 0.62 ? "taiga" : m > 0.45 ? "tundra" : "snow";
        heights[i] = seaLevel + 0.02;
      }
    }
  }
  // The caps are land now — refresh distances so islands keep away from them too.
  computeLandDistances();

  // Islands must stay safely below the major-landmass threshold used by the
  // continent-count validation in generateMap.
  const majorLandmass = majorLandmassMin(cols, rows);

  // Placed islands: (center, radius). New islands must keep a ≥2-tile Chebyshev
  // gap to every existing one, so no two ever touch (hex-adjacency needs both
  // coordinate deltas ≤1).
  const placed: { col: number; row: number; radius: number }[] = [];
  const fitsAt = (c: number, r: number, radius: number): boolean =>
    placed.every((p) => Math.max(Math.abs(p.col - c), Math.abs(p.row - r)) >= p.radius + radius + 2);

  const stampIsland = (spec: IslandStamp): void => {
    const margin = spec.polar ? 1 : 2;
    const center = idx(spec.col, spec.row);
    const isle: number[] = [center];
    const inIsle = new Set<number>([center]);
    const growth: number[] = [center];
    while (isle.length < spec.size && growth.length) {
      const fi = Math.floor(rng.next() * growth.length);
      const from = growth[fi]!;
      const options = waterNeighbors(map, from % cols, (from / cols) | 0).filter(([nc, nr]) => {
        const ni = idx(nc, nr);
        return (
          !inIsle.has(ni) &&
          tiles[ni]!.terrain === "ocean" &&
          farFromLand(ni, ISLAND_LAND_GAP + 1) &&
          Math.abs(nc - spec.col) <= spec.radius &&
          Math.abs(nr - spec.row) <= spec.radius &&
          nc >= margin && nr >= margin && nc < cols - margin && nr < rows - margin
        );
      });
      if (!options.length) {
        growth.splice(fi, 1);
        continue;
      }
      const [nc, nr] = options[Math.floor(rng.next() * options.length)]!;
      const ni = idx(nc, nr);
      inIsle.add(ni);
      isle.push(ni);
      growth.push(ni);
    }
    for (const i of isle) {
      const c = i % cols;
      const r = (i / cols) | 0;
      const eq = equatorAt(c, r);
      // Flat to hilly, never mountains — and polar-band islands stay flat ice.
      const reliefCap = eq < 0.18 ? Math.min(spec.reliefMax, 0.35) : spec.reliefMax;
      const relief = rng.next() * reliefCap;
      tiles[i]!.terrain = spec.polar
        ? (moistAt(c, r) > 0.55 ? "tundra" : "snow")
        : classifyLand(relief, moistAt(c, r), eq);
      heights[i] = seaLevel + 0.02 + relief * 0.1;
    }
    placed.push({ col: spec.col, row: spec.row, radius: spec.radius });
  };

  /** A few random tries for an open-ocean spot with room for `radius`. */
  const findSpot = (margin: number, radius: number): { col: number; row: number } | null => {
    for (let tries = 0; tries < 60; tries++) {
      const c = margin + Math.floor(rng.next() * (cols - margin * 2));
      const r = margin + Math.floor(rng.next() * (rows - margin * 2));
      const i = idx(c, r);
      if (tiles[i]!.terrain !== "ocean" || !farFromLand(i, ISLAND_LAND_GAP + 1) || !fitsAt(c, r, radius)) continue;
      return { col: c, row: r };
    }
    return null;
  };

  // 1) One to three big islands (Japan, Madagascar): sizeable and hilly —
  //    clearly more than an islet, still below the major-landmass bar.
  const bigMax = Math.min(30, majorLandmass - 4);
  const bigCount = 1 + Math.floor(rng.next() * 3);
  for (let i = 0; i < bigCount; i++) {
    const size = 10 + Math.floor(rng.next() * (bigMax - 9)); // 10..bigMax
    const radius = 3 + Math.ceil(size / 10); // room to sprawl
    const at = findSpot(4, radius);
    if (!at) continue;
    stampIsland({ ...at, radius, size, reliefMax: 0.5 });
  }

  // 2) One or two island arcs (the Philippines): a curved chain of islets.
  const arcCount = 1 + (rng.next() < 0.5 ? 1 : 0);
  for (let i = 0; i < arcCount; i++) {
    const at = findSpot(3, 1);
    if (!at) continue;
    let x = at.col;
    let y = at.row;
    let ang = rng.next() * Math.PI * 2;
    const bend = (rng.next() - 0.5) * 0.5; // gentle curvature per link
    const links = 4 + Math.floor(rng.next() * 4); // 4..7 islets
    for (let k = 0; k < links; k++) {
      const c = Math.round(x);
      const r = Math.round(y);
      if (c >= 2 && r >= 2 && c < cols - 2 && r < rows - 2) {
        const ci = idx(c, r);
        if (tiles[ci]!.terrain === "ocean" && farFromLand(ci, ISLAND_LAND_GAP + 1) && fitsAt(c, r, 1)) {
          stampIsland({ col: c, row: r, radius: 1, size: 1 + Math.floor(rng.next() * 3), reliefMax: 0.45 });
        }
      }
      const step = 6 + rng.next(); // keeps neighbouring islets from merging
      x += Math.cos(ang) * step;
      y += Math.sin(ang) * step;
      ang += bend;
    }
  }

  // 3) The base scatter of small islets.
  const isletTarget = Math.max(3, Math.round((cols * rows) / 320));
  for (let i = 0; i < isletTarget; i++) {
    const at = findSpot(2, 2);
    if (!at) continue;
    stampIsland({ ...at, radius: 2, size: 1 + Math.floor(rng.next() * 4), reliefMax: 0.45 });
  }

  // 4) Pack-ice floes drifting just off the polar shelf, for a broken fringe.
  const polarEdgeLen = poleAxis === "ns" ? cols : rows;
  const floes = Math.max(2, Math.round(polarEdgeLen / 12));
  for (const edge of [0, 1] as const) {
    for (let slot = 0; slot < floes; slot++) {
      for (let tries = 0; tries < 8; tries++) {
        const along = 1 + Math.floor(rng.next() * (polarEdgeLen - 2));
        const depth = 3 + Math.floor(rng.next() * 5); // offshore of the shelf
        const c = poleAxis === "ns" ? along : edge === 0 ? 1 + depth : cols - 2 - depth;
        const r = poleAxis === "ns" ? (edge === 0 ? 1 + depth : rows - 2 - depth) : along;
        if (c < 1 || r < 1 || c >= cols - 1 || r >= rows - 1) continue;
        const ci = idx(c, r);
        if (tiles[ci]!.terrain !== "ocean" || !farFromLand(ci, ISLAND_LAND_GAP + 1) || !fitsAt(c, r, 1)) continue;
        stampIsland({ col: c, row: r, radius: 1, size: 1 + Math.floor(rng.next() * 3), reliefMax: 0.3, polar: true });
        break;
      }
    }
  }
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
