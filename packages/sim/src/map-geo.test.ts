import { describe, expect, it } from "vitest";
import { getNaturalWonder, NATURAL_WONDER_DEFS } from "@roc/data";
import { createGame } from "./game/setup";
import {
  EARTH_MAP_GEO,
  MEDITERRANEAN_MAP_GEO,
  assertNaturalWonderGeo,
  mapGeoBounds,
  mapGeoProfile,
  clearRegionalMapGeo,
  naturalWonderGeoViolations,
  naturalWonderTileGeoValid,
  registerRegionalMapGeo,
  tileInWonderBox,
  wonderBoxOverlapsMap,
} from "./map-geo";
import { MAP_TYPES } from "./worldgen";
import type { MapType } from "./worldgen";

const PLAYABLE_MAP_TYPES = MAP_TYPES.filter((t) => t !== "random") as MapType[];

describe("map geo registry", () => {
  it("defaults unknown and procedural layouts to the Earth grid", () => {
    expect(mapGeoProfile("pangaea")).toBe(EARTH_MAP_GEO);
    expect(mapGeoProfile("future_europe" as MapType)).toBe(EARTH_MAP_GEO);
  });

  it("resolves regional geodata maps to their viewport", () => {
    expect(mapGeoProfile("realworld")).toBe(EARTH_MAP_GEO);
    expect(mapGeoProfile("mediterranean")).toBe(MEDITERRANEAN_MAP_GEO);
  });

  it("allows registering a new regional map profile", () => {
    const custom = {
      id: "test-region",
      tileLatLon: () => ({ lat: 10, lon: 20 }),
      wonderBoxPad: 0,
    };
    registerRegionalMapGeo("inland_sea" as MapType, custom);
    expect(mapGeoProfile("inland_sea")).toBe(custom);
    clearRegionalMapGeo("inland_sea");
    expect(mapGeoProfile("inland_sea")).toBe(EARTH_MAP_GEO);
  });

  it("Mediterranean bounds match the Roman Empire viewport", () => {
    const bounds = mapGeoBounds(MEDITERRANEAN_MAP_GEO, 80, 56);
    expect(bounds.latMax).toBeGreaterThan(bounds.latMin);
    expect(bounds.lonMax).toBeGreaterThan(bounds.lonMin);
    expect(bounds.latMin).toBeGreaterThanOrEqual(23);
    expect(bounds.latMax).toBeLessThanOrEqual(57);
  });
});

describe("natural wonder geo on all map types", () => {
  it("every natural wonder definition has a valid geo box", () => {
    expect(NATURAL_WONDER_DEFS.length).toBeGreaterThanOrEqual(30);
    for (const w of NATURAL_WONDER_DEFS) {
      const box = w.realWorldBox;
      expect(box.latMax, w.id).toBeGreaterThan(box.latMin);
      expect(box.lonMax, w.id).toBeGreaterThan(box.lonMin);
      expect(box.latMax - box.latMin, w.id).toBeLessThanOrEqual(25);
      expect(box.lonMax - box.lonMin, w.id).toBeLessThanOrEqual(50);
    }
  });

  it("rejects placements outside each wonder home region", () => {
    const map = { mapType: "realworld" as const, cols: 110, rows: 64 };
    const geo = mapGeoProfile("realworld");
    const europeCol = 52;
    const europeRow = 10;
    const { lat } = geo.tileLatLon(europeCol, europeRow, map.cols, map.rows);
    expect(lat).toBeGreaterThan(45);
    for (const id of ["sahara_dunes", "mount_everest", "grand_canyon", "uluru", "amazon_rainforest"] as const) {
      expect(
        tileInWonderBox(geo, europeCol, europeRow, map.cols, map.rows, getNaturalWonder(id)!.realWorldBox),
        `${id} must not fit central Europe`,
      ).toBe(false);
    }
    expect(
      naturalWonderTileGeoValid(map, "sahara_dunes", europeCol, europeRow),
    ).toBe(false);
  });

  it("assertNaturalWonderGeo passes on generated maps", () => {
    const state = createGame({ seed: "geo-assert", cols: 80, rows: 56, mapType: "realworld", naturalWonders: true });
    expect(() => assertNaturalWonderGeo(state.map)).not.toThrow();
    expect(naturalWonderGeoViolations(state.map)).toEqual([]);
  });

  it("every playable map type places wonders inside their geo boxes", () => {
    let sawAny = false;
    for (const mapType of PLAYABLE_MAP_TYPES) {
      for (let i = 0; i < 6; i++) {
        const state = createGame({
          seed: `all-geo-${mapType}-${i}`,
          cols: mapType === "mediterranean" ? 80 : 72,
          rows: mapType === "mediterranean" ? 56 : 48,
          mapType,
          barbarians: false,
          naturalWonders: true,
        });
        for (const t of state.map.tiles) {
          if (!t.naturalWonder) continue;
          sawAny = true;
          const def = getNaturalWonder(t.naturalWonder);
          expect(def?.realWorldBox, `${mapType} ${t.naturalWonder}`).toBeDefined();
        }
        // Whole-wonder rule: a multi-tile footprint may straddle the edge of a
        // tight box as long as the wonder itself lands inside it.
        expect(naturalWonderGeoViolations(state.map), `${mapType} geo violations`).toEqual([]);
      }
    }
    expect(sawAny).toBe(true);
  });

  it("only considers wonders whose box overlaps the map viewport", () => {
    const geo = MEDITERRANEAN_MAP_GEO;
    expect(wonderBoxOverlapsMap(geo, 80, 56, getNaturalWonder("sahara_dunes")!.realWorldBox!)).toBe(true);
    expect(wonderBoxOverlapsMap(geo, 80, 56, getNaturalWonder("mount_everest")!.realWorldBox!)).toBe(false);
    expect(wonderBoxOverlapsMap(EARTH_MAP_GEO, 80, 56, getNaturalWonder("mount_everest")!.realWorldBox!)).toBe(true);
  });
});
