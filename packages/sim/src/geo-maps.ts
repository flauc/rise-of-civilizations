// Registry for geodata-backed map layouts (Natural Earth coastlines).

import type { MapGeoProfile } from "./map-geo";
import type { MapType } from "./worldgen";
import { isWorldLand, worldTileLatLon } from "./worldmask";
import { isMediterraneanLand, mediterraneanTileLatLon } from "./mediterranean-mask";
import { isEuropeLand, europeTileLatLon } from "./europe-mask";
import { isAfricaLand, africaTileLatLon } from "./africa-mask";
import { isAsiaLand, asiaTileLatLon } from "./asia-mask";
import { isNorthAmericaLand, northAmericaTileLatLon } from "./north_america-mask";
import { isSouthAmericaLand, southAmericaTileLatLon } from "./south_america-mask";

/** Cropped regional viewports (land touches map borders — no polar ice caps). */
export const REGIONAL_GEO_MAP_TYPES = [
  "mediterranean",
  "europe",
  "africa",
  "asia",
  "north_america",
  "south_america",
] as const;

export type RegionalGeoMapType = (typeof REGIONAL_GEO_MAP_TYPES)[number];

const REGIONAL_GEO_SET = new Set<string>(REGIONAL_GEO_MAP_TYPES);

export function isRegionalGeoMapType(mapType: string | undefined): mapType is RegionalGeoMapType {
  return mapType != null && REGIONAL_GEO_SET.has(mapType);
}

/** True for Real World and every cropped regional geodata layout. */
export function isGeoMapType(mapType: string | undefined): mapType is RegionalGeoMapType | "realworld" {
  return mapType === "realworld" || isRegionalGeoMapType(mapType);
}

type LandCheck = (col: number, row: number, cols: number, rows: number) => boolean;

const GEO_LAND_CHECKS: Partial<Record<MapType, LandCheck>> = {
  realworld: isWorldLand,
  mediterranean: isMediterraneanLand,
  europe: isEuropeLand,
  africa: isAfricaLand,
  asia: isAsiaLand,
  north_america: isNorthAmericaLand,
  south_america: isSouthAmericaLand,
};

export function isGeoMapLand(
  mapType: MapType | string | undefined,
  col: number,
  row: number,
  cols: number,
  rows: number,
): boolean {
  if (!mapType || !(mapType in GEO_LAND_CHECKS)) return false;
  return GEO_LAND_CHECKS[mapType as MapType]!(col, row, cols, rows);
}

/** Regional viewports omit poleAxis so border land is not treated as polar ice. */
export function regionalGeoMapOmitsPoleAxis(mapType: string | undefined): boolean {
  return isRegionalGeoMapType(mapType);
}

/** Skip procedural offshore island clutter on cropped regional maps. */
export function regionalGeoMapSkipsOffshoreIslands(mapType: string | undefined): boolean {
  return isRegionalGeoMapType(mapType);
}

export const GEO_MAP_PROFILES: Partial<Record<MapType, MapGeoProfile>> = {
  realworld: {
    id: "earth",
    tileLatLon: worldTileLatLon,
    wonderBoxPad: 1,
  },
  mediterranean: {
    id: "mediterranean",
    tileLatLon: mediterraneanTileLatLon,
    wonderBoxPad: 3,
  },
  europe: {
    id: "europe",
    tileLatLon: europeTileLatLon,
    wonderBoxPad: 3,
  },
  africa: {
    id: "africa",
    tileLatLon: africaTileLatLon,
    wonderBoxPad: 3,
  },
  asia: {
    id: "asia",
    tileLatLon: asiaTileLatLon,
    wonderBoxPad: 3,
  },
  north_america: {
    id: "north_america",
    tileLatLon: northAmericaTileLatLon,
    wonderBoxPad: 3,
  },
  south_america: {
    id: "south_america",
    tileLatLon: southAmericaTileLatLon,
    wonderBoxPad: 3,
  },
};
