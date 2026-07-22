// Stamp authentic terrain at each regional wonder's real-world coordinates so
// Matterhorn is mountains, Vesuvius a volcano, Plitvice a lake, and so on.

import { NATURAL_WONDER_DEFS, type NaturalWonderDef } from "@roc/data";
import {
  axialNeighbor,
  axialToOffset,
  getTile,
  isWater,
  offsetToAxial,
  type GameMap,
  type TerrainType,
} from "@roc/shared";
import { isRegionalGeoMapType } from "./geo-maps";
import { mapGeoProfile, tileInWonderBox, wonderBoxOverlapsMap } from "./map-geo";

export function isInlandNaturalWonder(def: NaturalWonderDef): boolean {
  return !def.openOcean && !def.coastalWater && !def.coastalFront && !def.coastal && !def.adjacentToWater;
}

const TERRAIN_PRIORITY: TerrainType[] = [
  "volcano",
  "mountains",
  "lake",
  "mesa",
  "jungle",
  "forest",
  "desert",
  "hills",
  "grassland",
  "plains",
];

function preferredTerrain(def: NaturalWonderDef): TerrainType {
  for (const t of TERRAIN_PRIORITY) {
    if (def.validTerrain.includes(t)) return t;
  }
  return def.validTerrain[0]! as TerrainType;
}

function neighborTilesAt(map: GameMap, col: number, row: number) {
  const here = offsetToAxial({ col, row });
  const out: NonNullable<ReturnType<typeof getTile>>[] = [];
  for (let d = 0; d < 6; d++) {
    const nb = axialToOffset(axialNeighbor(here, d));
    const t = getTile(map, nb.col, nb.row);
    if (t) out.push(t);
  }
  return out;
}

function isSea(map: GameMap, col: number, row: number): boolean {
  const t = getTile(map, col, row);
  return !!t && (t.terrain === "ocean" || t.terrain === "coast");
}

function bordersSea(map: GameMap, col: number, row: number): boolean {
  return neighborTilesAt(map, col, row).some((n) => isSea(map, n.col, n.row));
}

/** Hex steps from land to the nearest ocean/coast tile (0 = touches sea). */
function seaDistance(map: GameMap, col: number, row: number, max = 16): number {
  if (bordersSea(map, col, row)) return 0;
  const { cols, rows } = map;
  const start = row * cols + col;
  const seen = new Set<number>([start]);
  const q: { col: number; row: number; dist: number }[] = [{ col, row, dist: 0 }];
  while (q.length) {
    const cur = q.shift()!;
    if (cur.dist >= max) continue;
    const here = offsetToAxial({ col: cur.col, row: cur.row });
    for (let d = 0; d < 6; d++) {
      const nb = axialToOffset(axialNeighbor(here, d));
      if (nb.col < 0 || nb.row < 0 || nb.col >= cols || nb.row >= rows) continue;
      const idx = nb.row * cols + nb.col;
      if (seen.has(idx)) continue;
      seen.add(idx);
      const t = getTile(map, nb.col, nb.row);
      if (!t || isWater(t.terrain)) return cur.dist + 1;
      q.push({ col: nb.col, row: nb.row, dist: cur.dist + 1 });
    }
  }
  return max;
}

function frontFacesSea(map: GameMap, col: number, row: number): boolean {
  const here = offsetToAxial({ col, row });
  return [4, 5].every((d) => {
    const nb = axialToOffset(axialNeighbor(here, d));
    return isSea(map, nb.col, nb.row);
  });
}

function besideWater(map: GameMap, col: number, row: number): boolean {
  const t = getTile(map, col, row);
  if (!t) return false;
  if (isWater(t.terrain) || t.river || t.riverLake) return true;
  return neighborTilesAt(map, col, row).some((n) => isWater(n.terrain) || n.river || n.riverLake);
}

function ringedByOcean(map: GameMap, col: number, row: number): boolean {
  return neighborTilesAt(map, col, row).every((n) => n.terrain === "ocean");
}

/** True when a tile can host this wonder after terrain is stamped. */
function tileMatchesWonderRules(map: GameMap, col: number, row: number, def: NaturalWonderDef): boolean {
  const t = getTile(map, col, row);
  if (!t) return false;
  if (def.openOcean) return t.terrain === "ocean" && ringedByOcean(map, col, row);
  if (def.coastalWater) return isWater(t.terrain) && neighborTilesAt(map, col, row).some((n) => !isWater(n.terrain));
  if (isWater(t.terrain)) return false;
  if (def.coastalFront) return frontFacesSea(map, col, row);
  if (def.coastal) return bordersSea(map, col, row);
  if (def.adjacentToWater) return besideWater(map, col, row);
  return true;
}

function collectAnchorCandidates(
  map: GameMap,
  def: NaturalWonderDef,
  box: { latMin: number; latMax: number; lonMin: number; lonMax: number },
): { col: number; row: number; dist: number; rulesOk: boolean; terrainOk: boolean; inland: number }[] {
  const geo = mapGeoProfile(map.mapType);
  const { cols, rows } = map;
  const centerLat = (box.latMin + box.latMax) / 2;
  const centerLon = (box.lonMin + box.lonMax) / 2;
  const inlandWonder = isInlandNaturalWonder(def);
  const out: { col: number; row: number; dist: number; rulesOk: boolean; terrainOk: boolean; inland: number }[] = [];

  for (const t of map.tiles) {
    if (!tileInWonderBox(geo, t.col, t.row, cols, rows, box)) continue;
    if (def.openOcean || def.coastalWater) {
      if (!isWater(t.terrain) && t.terrain !== "coast") continue;
    } else if (isWater(t.terrain)) {
      continue;
    }
    const inland = inlandWonder ? seaDistance(map, t.col, t.row) : 0;
    if (inlandWonder && inland < REGIONAL_INLAND_SEA_DIST) continue;
    const { lat, lon } = geo.tileLatLon(t.col, t.row, cols, rows);
    const dist = (lat - centerLat) ** 2 + (lon - centerLon) ** 2;
    const terrain = preferredTerrain(def);
    const idx = t.row * cols + t.col;
    const saved = map.tiles[idx]!;
    map.tiles[idx] = { ...t, terrain, river: undefined, riverLake: false };
    const rulesOk = tileMatchesWonderRules(map, t.col, t.row, def);
    map.tiles[idx] = saved;
    out.push({
      col: t.col,
      row: t.row,
      dist,
      rulesOk,
      terrainOk: def.validTerrain.includes(t.terrain),
      inland,
    });
  }
  return out;
}

/** Max degrees from a wonder center for inland fallback anchors on coarse regional maps. */
const INLAND_FALLBACK_GEO = 3;

function findInlandFallbackAnchor(
  map: GameMap,
  def: NaturalWonderDef,
): { col: number; row: number } | null {
  const geo = mapGeoProfile(map.mapType);
  const { cols, rows } = map;
  const box = def.realWorldBox;
  const centerLat = (box.latMin + box.latMax) / 2;
  const centerLon = (box.lonMin + box.lonMax) / 2;
  let best: { col: number; row: number; score: number } | null = null;

  for (const t of map.tiles) {
    if (isWater(t.terrain)) continue;
    const { lat, lon } = geo.tileLatLon(t.col, t.row, cols, rows);
    if (Math.abs(lat - centerLat) > INLAND_FALLBACK_GEO || Math.abs(lon - centerLon) > INLAND_FALLBACK_GEO) continue;
    const inland = seaDistance(map, t.col, t.row);
    if (inland < REGIONAL_INLAND_SEA_DIST) continue;
    const geoDist = (lat - centerLat) ** 2 + (lon - centerLon) ** 2;
    const score = inland * 100 - geoDist;
    if (!best || score > best.score) best = { col: t.col, row: t.row, score };
  }
  return best ? { col: best.col, row: best.row } : null;
}

function pickAnchorTile(
  map: GameMap,
  def: NaturalWonderDef,
): { col: number; row: number } | null {
  let candidates = collectAnchorCandidates(map, def, def.realWorldBox);
  if (candidates.length === 0 && isInlandNaturalWonder(def)) {
    const fallback = findInlandFallbackAnchor(map, def);
    if (fallback) return fallback;
  }
  if (candidates.length === 0) return null;
  const inlandWonder = isInlandNaturalWonder(def);
  candidates.sort(
    (a, b) =>
      Number(b.rulesOk) - Number(a.rulesOk) ||
      Number(b.terrainOk) - Number(a.terrainOk) ||
      (inlandWonder ? b.inland - a.inland : 0) ||
      a.dist - b.dist,
  );
  const best = candidates[0]!;
  return { col: best.col, row: best.row };
}

function stampTileForWonder(map: GameMap, col: number, row: number, def: NaturalWonderDef): void {
  const t = getTile(map, col, row);
  if (!t) return;
  t.river = undefined;
  t.riverLake = false;
  t.wooded = false;
  if (def.openOcean) {
    t.terrain = "ocean";
    return;
  }
  if (def.coastalWater) {
    t.terrain = "coast";
    return;
  }
  t.terrain = preferredTerrain(def);
}

/** Ensure every viewport wonder has correct terrain at its geographic anchor. */
export function anchorRegionalWonderTerrain(map: GameMap): Map<string, { col: number; row: number }> {
  const anchors = new Map<string, { col: number; row: number }>();
  if (!isRegionalGeoMapType(map.mapType)) return anchors;
  const geo = mapGeoProfile(map.mapType);
  const { cols, rows } = map;

  for (const def of NATURAL_WONDER_DEFS) {
    if (!wonderBoxOverlapsMap(geo, cols, rows, def.realWorldBox)) continue;
    const anchor = pickAnchorTile(map, def);
    if (!anchor) continue;
    stampTileForWonder(map, anchor.col, anchor.row, def);
    anchors.set(def.id, anchor);
  }
  return anchors;
}

/** Wonders whose real-world box overlaps a regional viewport. */
export function regionalEligibleWonderCount(map: GameMap): number {
  if (!isRegionalGeoMapType(map.mapType)) return 0;
  const geo = mapGeoProfile(map.mapType);
  return NATURAL_WONDER_DEFS.filter((w) => wonderBoxOverlapsMap(geo, map.cols, map.rows, w.realWorldBox))
    .length;
}

/** Minimum hex steps from ocean/coast for inland wonders on regional maps. */
export const REGIONAL_INLAND_SEA_DIST = 2;

export function regionalInlandSeaOk(map: GameMap, col: number, row: number, min = REGIONAL_INLAND_SEA_DIST): boolean {
  return seaDistance(map, col, row) >= min;
}

/** Minimum hex spacing between wonders on cropped regional maps. */
export const REGIONAL_WONDER_SPACING = 6;
