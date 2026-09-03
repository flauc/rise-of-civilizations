// Geographic coordinate system for each map layout. Natural wonders (and any
// future geo-keyed content) resolve tile → lat/lon through this registry so
// placement stays correct on every map type. Procedural layouts use the full
// Earth grid; regional geodata maps register their own viewport. New maps: add
// a profile here and wire worldgen to the same lat/lon helper for biomes.

import { worldTileLatLon, type RealWorldWonderBox, inRealWorldWonderBox } from "./worldmask";
import {
  mediterraneanTileLatLon,
  MEDITERRANEAN_LAT_MAX,
  MEDITERRANEAN_LAT_MIN,
  MEDITERRANEAN_LON_MAX,
  MEDITERRANEAN_LON_MIN,
} from "./mediterranean-mask";
import { GEO_MAP_PROFILES } from "./geo-maps";
import type { MapType } from "./worldgen";
import { getNaturalWonder } from "@roc/data";

export type { RealWorldWonderBox };

export interface MapGeoProfile {
  /** Human-readable label (debug / tests). */
  id: string;
  tileLatLon(col: number, row: number, cols: number, rows: number): { lat: number; lon: number };
  /** Extra degrees of slack when testing a wonder's lat/lon box. */
  wonderBoxPad: number;
}

/** Full Earth: procedural layouts and Real World share the baked mask grid. */
export const EARTH_MAP_GEO: MapGeoProfile = GEO_MAP_PROFILES.realworld!;

/** Roman Empire viewport (Iberia → Euphrates, Sahara fringe → Britain). */
export const MEDITERRANEAN_MAP_GEO: MapGeoProfile = GEO_MAP_PROFILES.mediterranean!;

/**
 * Lookup table for layouts with a dedicated geo viewport. Every other map type
 * (including future procedural presets) falls back to the Earth grid.
 */
const REGIONAL_MAP_GEO: Partial<Record<MapType, MapGeoProfile>> = { ...GEO_MAP_PROFILES };

/** Resolve the geographic profile for a map layout (unknown → Earth). */
export function mapGeoProfile(mapType: string | undefined): MapGeoProfile {
  if (mapType && mapType in REGIONAL_MAP_GEO) {
    return REGIONAL_MAP_GEO[mapType as MapType]!;
  }
  return EARTH_MAP_GEO;
}

/** Register a regional geo profile when adding a new geodata map. */
export function registerRegionalMapGeo(mapType: MapType, profile: MapGeoProfile): void {
  REGIONAL_MAP_GEO[mapType] = profile;
}

/** Remove a regional override (tests / hot reload). */
export function clearRegionalMapGeo(mapType: MapType): void {
  delete REGIONAL_MAP_GEO[mapType];
}

export function expandWonderBox(box: RealWorldWonderBox, pad: number): RealWorldWonderBox {
  return {
    latMin: box.latMin - pad,
    latMax: box.latMax + pad,
    lonMin: box.lonMin - pad,
    lonMax: box.lonMax + pad,
  };
}

export function tileInWonderBox(
  geo: MapGeoProfile,
  col: number,
  row: number,
  cols: number,
  rows: number,
  box: RealWorldWonderBox,
): boolean {
  const { lat, lon } = geo.tileLatLon(col, row, cols, rows);
  return inRealWorldWonderBox(lat, lon, expandWonderBox(box, geo.wonderBoxPad));
}

/** Lat/lon bounds of the map grid (corner tiles). */
export function mapGeoBounds(
  geo: MapGeoProfile,
  cols: number,
  rows: number,
): RealWorldWonderBox {
  const nw = geo.tileLatLon(0, 0, cols, rows);
  const se = geo.tileLatLon(Math.max(0, cols - 1), Math.max(0, rows - 1), cols, rows);
  return {
    latMin: Math.min(nw.lat, se.lat),
    latMax: Math.max(nw.lat, se.lat),
    lonMin: Math.min(nw.lon, se.lon),
    lonMax: Math.max(nw.lon, se.lon),
  };
}

/** True when a wonder's box overlaps the map viewport (for ordering / diagnostics). */
export function wonderBoxOverlapsMap(
  geo: MapGeoProfile,
  cols: number,
  rows: number,
  box: RealWorldWonderBox,
): boolean {
  const view = mapGeoBounds(geo, cols, rows);
  return !(
    box.latMax < view.latMin ||
    box.latMin > view.latMax ||
    box.lonMax < view.lonMin ||
    box.lonMin > view.lonMax
  );
}

export const MEDITERRANEAN_VIEWPORT = {
  latMin: MEDITERRANEAN_LAT_MIN,
  latMax: MEDITERRANEAN_LAT_MAX,
  lonMin: MEDITERRANEAN_LON_MIN,
  lonMax: MEDITERRANEAN_LON_MAX,
} as const;

export interface MapTileGeo {
  mapType?: string;
  cols: number;
  rows: number;
}

/** True when a placed wonder sits inside its definition geo box for this map. */
export function naturalWonderTileGeoValid(
  map: MapTileGeo,
  wonderId: string,
  col: number,
  row: number,
): boolean {
  const def = getNaturalWonder(wonderId);
  if (!def) return false;
  const geo = mapGeoProfile(map.mapType);
  return tileInWonderBox(geo, col, row, map.cols, map.rows, def.realWorldBox);
}

/**
 * List every natural wonder placed outside its geo box (empty = all valid). A
 * MULTI-TILE wonder is judged as a whole: its footprint may straddle the edge of a
 * tight box (the Grand Canyon's is barely a tile wide), so it counts as valid as
 * long as at least one of its tiles falls inside.
 */
export function naturalWonderGeoViolations(
  map: MapTileGeo & { tiles: readonly { col: number; row: number; naturalWonder?: string }[] },
): string[] {
  const inBox = new Set<string>();
  const outOfBox = new Map<string, { col: number; row: number }>();
  for (const t of map.tiles) {
    if (!t.naturalWonder) continue;
    if (naturalWonderTileGeoValid(map, t.naturalWonder, t.col, t.row)) {
      inBox.add(t.naturalWonder);
    } else if (!outOfBox.has(t.naturalWonder)) {
      outOfBox.set(t.naturalWonder, { col: t.col, row: t.row });
    }
  }
  const out: string[] = [];
  for (const [id, t] of outOfBox) {
    if (inBox.has(id)) continue;
    out.push(`${id} at ${t.col},${t.row} on ${map.mapType ?? "earth"}`);
  }
  return out;
}

/** Dev/test guard: every placed wonder must match its geo box. */
export function assertNaturalWonderGeo(map: MapTileGeo & { tiles: readonly { col: number; row: number; naturalWonder?: string }[] }): void {
  const bad = naturalWonderGeoViolations(map);
  if (bad.length > 0) throw new Error(`Natural wonder geo violation: ${bad.join("; ")}`);
}
