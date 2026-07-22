import { describe, expect, it } from "vitest";
import { REGIONAL_GEO_MAP_TYPES } from "./geo-maps";
import { generateMap } from "./worldgen";
import { isWater } from "@roc/shared";
import {
  AFRICA_LAT_MAX,
  AFRICA_LAT_MIN,
  AFRICA_LON_MAX,
  AFRICA_LON_MIN,
  africaTileLatLon,
  isAfricaLand,
} from "./africa-mask";
import {
  ASIA_LAT_MAX,
  ASIA_LAT_MIN,
  ASIA_LON_MAX,
  ASIA_LON_MIN,
  asiaTileLatLon,
  isAsiaLand,
} from "./asia-mask";
import {
  EUROPE_LAT_MAX,
  EUROPE_LAT_MIN,
  EUROPE_LON_MAX,
  EUROPE_LON_MIN,
  europeTileLatLon,
  isEuropeLand,
} from "./europe-mask";
import {
  NORTH_AMERICA_LAT_MAX,
  NORTH_AMERICA_LAT_MIN,
  NORTH_AMERICA_LON_MAX,
  NORTH_AMERICA_LON_MIN,
  isNorthAmericaLand,
  northAmericaTileLatLon,
} from "./north_america-mask";
import {
  SOUTH_AMERICA_LAT_MAX,
  SOUTH_AMERICA_LAT_MIN,
  SOUTH_AMERICA_LON_MAX,
  SOUTH_AMERICA_LON_MIN,
  isSouthAmericaLand,
  southAmericaTileLatLon,
} from "./south_america-mask";

const CONTINENT_MASKS = [
  {
    id: "europe",
    isLand: isEuropeLand,
    tileLatLon: europeTileLatLon,
    lonMin: EUROPE_LON_MIN,
    lonMax: EUROPE_LON_MAX,
    latMin: EUROPE_LAT_MIN,
    latMax: EUROPE_LAT_MAX,
    landMin: 0.35,
    landMax: 0.55,
  },
  {
    id: "africa",
    isLand: isAfricaLand,
    tileLatLon: africaTileLatLon,
    lonMin: AFRICA_LON_MIN,
    lonMax: AFRICA_LON_MAX,
    latMin: AFRICA_LAT_MIN,
    latMax: AFRICA_LAT_MAX,
    landMin: 0.45,
    landMax: 0.65,
  },
  {
    id: "asia",
    isLand: isAsiaLand,
    tileLatLon: asiaTileLatLon,
    lonMin: ASIA_LON_MIN,
    lonMax: ASIA_LON_MAX,
    latMin: ASIA_LAT_MIN,
    latMax: ASIA_LAT_MAX,
    landMin: 0.45,
    landMax: 0.65,
  },
  {
    id: "north_america",
    isLand: isNorthAmericaLand,
    tileLatLon: northAmericaTileLatLon,
    lonMin: NORTH_AMERICA_LON_MIN,
    lonMax: NORTH_AMERICA_LON_MAX,
    latMin: NORTH_AMERICA_LAT_MIN,
    latMax: NORTH_AMERICA_LAT_MAX,
    landMin: 0.3,
    landMax: 0.5,
  },
  {
    id: "south_america",
    isLand: isSouthAmericaLand,
    tileLatLon: southAmericaTileLatLon,
    lonMin: SOUTH_AMERICA_LON_MIN,
    lonMax: SOUTH_AMERICA_LON_MAX,
    latMin: SOUTH_AMERICA_LAT_MIN,
    latMax: SOUTH_AMERICA_LAT_MAX,
    landMin: 0.35,
    landMax: 0.55,
  },
] as const;

describe("continental regional masks", () => {
  for (const mask of CONTINENT_MASKS) {
    it(`${mask.id} maps tile corners to its viewport`, () => {
      const cols = 80;
      const rows = 56;
      const nw = mask.tileLatLon(0, 0, cols, rows);
      const se = mask.tileLatLon(cols - 1, rows - 1, cols, rows);
      expect(nw.lat).toBeGreaterThan(se.lat);
      expect(nw.lon).toBeLessThan(se.lon);
      expect(nw.lat).toBeCloseTo(mask.latMax, 0);
      expect(se.lat).toBeCloseTo(mask.latMin, 0);
      expect(Math.abs(nw.lon - mask.lonMin)).toBeLessThan(1);
      expect(Math.abs(se.lon - mask.lonMax)).toBeLessThan(1);
    });

    it(`${mask.id} has recognizable land and sea`, () => {
      const cols = 80;
      const rows = 56;
      let land = 0;
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          if (mask.isLand(col, row, cols, rows)) land++;
        }
      }
      const frac = land / (cols * rows);
      expect(frac).toBeGreaterThan(mask.landMin);
      expect(frac).toBeLessThan(mask.landMax);
    });
  }

  it("regional geo registry lists every continental map type", () => {
    for (const id of ["europe", "africa", "asia", "north_america", "south_america"] as const) {
      expect(REGIONAL_GEO_MAP_TYPES).toContain(id);
    }
  });

  for (const mapType of ["europe", "africa", "asia", "north_america", "south_america"] as const) {
    it(`${mapType} worldgen uses geodata coastlines`, () => {
      const map = generateMap({ cols: 80, rows: 56, seed: `${mapType}-geo`, mapType });
      expect(map.mapType).toBe(mapType);
      const land = map.tiles.filter((t) => !isWater(t.terrain)).length;
      expect(land).toBeGreaterThan(map.tiles.length * 0.2);
      expect(land).toBeLessThan(map.tiles.length * 0.85);
      expect(map.poleAxis).toBeUndefined();
    });
  }
});
