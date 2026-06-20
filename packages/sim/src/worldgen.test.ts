import { describe, it, expect } from "vitest";
import { isWater } from "@roc/shared";
import { generateMap, MAP_TYPES, type MapType } from "./worldgen";

function landFraction(mapType: MapType | undefined): number {
  const map = generateMap({ cols: 52, rows: 34, seed: "worldgen-test", mapType });
  let land = 0;
  for (const t of map.tiles) if (!isWater(t.terrain)) land++;
  return land / map.tiles.length;
}

describe("worldgen map types", () => {
  it("every map type produces a mix of land and water", () => {
    for (const mapType of MAP_TYPES) {
      const map = generateMap({ cols: 52, rows: 34, seed: "mix", mapType });
      const land = map.tiles.filter((t) => !isWater(t.terrain)).length;
      const water = map.tiles.length - land;
      expect(land, `${mapType} should have land`).toBeGreaterThan(0);
      expect(water, `${mapType} should have water`).toBeGreaterThan(0);
    }
  });

  it("is deterministic for a given seed and type", () => {
    for (const mapType of MAP_TYPES) {
      const a = generateMap({ cols: 40, rows: 26, seed: "det", mapType });
      const b = generateMap({ cols: 40, rows: 26, seed: "det", mapType });
      expect(a.tiles.map((t) => t.terrain)).toEqual(b.tiles.map((t) => t.terrain));
    }
  });

  it("defaults to the continents layout when no type is given", () => {
    const a = generateMap({ cols: 48, rows: 32, seed: "default" });
    const b = generateMap({ cols: 48, rows: 32, seed: "default", mapType: "continents" });
    expect(a.tiles.map((t) => t.terrain)).toEqual(b.tiles.map((t) => t.terrain));
  });

  it("island-style layouts have less land than continental ones", () => {
    expect(landFraction("islands")).toBeLessThan(landFraction("pangaea"));
    expect(landFraction("archipelago")).toBeLessThan(landFraction("continents"));
  });

  it("the real-world layout lays down recognizable Earth-sized continents", () => {
    const frac = landFraction("realworld");
    // Earth is ~30% land; sampling the baked mask should stay in a sensible band.
    expect(frac).toBeGreaterThan(0.2);
    expect(frac).toBeLessThan(0.5);
  });
});
