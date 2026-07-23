import { describe, it, expect } from "vitest";
import { isWater, isBottomMapBorderTile, landmassSizes } from "@roc/shared";
import {
  generateMap,
  getSetoInlandSeaSpec,
  MAP_TYPES,
  countLandmasses,
  majorLandmassMin,
  mapTypeDisplay,
  resolveMapType,
  targetContinentCount,
  type MapType,
} from "./worldgen";

const GENERATABLE_MAP_TYPES = MAP_TYPES.filter((t) => t !== "random") as MapType[];

function landFraction(mapType: MapType | undefined): number {
  const map = generateMap({ cols: 52, rows: 34, seed: "worldgen-test", mapType });
  let land = 0;
  for (const t of map.tiles) if (!isWater(t.terrain)) land++;
  return land / map.tiles.length;
}

describe("worldgen map types", () => {
  it("every concrete map type produces a mix of land and water", () => {
    for (const mapType of GENERATABLE_MAP_TYPES) {
      const map = generateMap({ cols: 52, rows: 34, seed: "mix", mapType });
      const land = map.tiles.filter((t) => !isWater(t.terrain)).length;
      const water = map.tiles.length - land;
      expect(land, `${mapType} should have land`).toBeGreaterThan(0);
      expect(water, `${mapType} should have water`).toBeGreaterThan(0);
    }
  });

  it("is deterministic for a given seed and type", () => {
    for (const mapType of GENERATABLE_MAP_TYPES) {
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

  it("random resolves to a playable layout from the pool", () => {
    const playable = new Set<MapType>([
      "pangaea",
      "two_continents",
      "three_continents",
      "four_continents",
      "archipelago",
      "inland_sea",
      "islands",
      "realworld",
      "mediterranean",
    ]);
    const resolved = resolveMapType("roll-check", "random");
    expect(playable.has(resolved)).toBe(true);
    expect(resolveMapType("roll-check", "random")).toBe(resolved);
  });

  it("continents rolls one of the 1–4 continent layouts from the seed", () => {
    const layouts = new Set(
      ["alpha", "beta", "gamma", "delta", "epsilon"].map((seed) => resolveMapType(seed, "continents")),
    );
    expect(layouts.size).toBeGreaterThan(1);
    for (const layout of layouts) {
      expect(["pangaea", "two_continents", "three_continents", "four_continents"]).toContain(layout);
    }
  });

  it("continents only rarely rolls a single supercontinent", () => {
    let pangaeas = 0;
    const seeds = 300;
    for (let i = 0; i < seeds; i++) {
      if (resolveMapType(`continents-dist-${i}`, "continents") === "pangaea") pangaeas++;
    }
    expect(pangaeas / seeds).toBeLessThan(0.15); // weighted to ~8%
    expect(pangaeas).toBeGreaterThan(0); // ...but still possible
  });

  it("stamps resolved and requested map types on the generated map", () => {
    const map = generateMap({ cols: 40, rows: 26, seed: "meta-test", mapType: "random" });
    expect(map.mapTypeRequested).toBe("random");
    expect(map.mapType).toBe(resolveMapType("meta-test", "random"));
    expect(map.mapType).not.toBe("random");
  });

  it("the HUD label never reveals a rolled layout", () => {
    // A rolled pick keeps showing the player's choice (no continent-count spoilers)...
    expect(mapTypeDisplay("continents", "three_continents")).toBe("Continents (1–4)");
    expect(mapTypeDisplay("random", "archipelago")).toBe("Random");
    // ...while an explicit pick shows itself.
    expect(mapTypeDisplay("pangaea", "pangaea")).toBe("One Continent");
    expect(mapTypeDisplay(undefined, "islands")).toBe("Islands");
  });

  it("island-style layouts have less land than continental ones", () => {
    expect(landFraction("islands")).toBeLessThan(landFraction("pangaea"));
    expect(landFraction("archipelago")).toBeLessThan(landFraction("pangaea"));
  });

  it("the real-world layout lays down recognizable Earth-sized continents", () => {
    const frac = landFraction("realworld");
    // Earth is ~30% land; sampling the baked mask should stay in a sensible band.
    expect(frac).toBeGreaterThan(0.2);
    expect(frac).toBeLessThan(0.5);
  });

  it("multi-continent layouts produce the promised number of major landmasses", () => {
    const types = ["pangaea", "two_continents", "three_continents", "four_continents"] as const;
    const seeds = ["alpha", "beta", "gamma", "delta", "epsilon", "zeta", "eta", "theta"];
    const cols = 80;
    const rows = 56;
    const minSize = majorLandmassMin(cols, rows);
    for (const mapType of types) {
      const target = targetContinentCount(mapType)!;
      for (const seed of seeds) {
        const map = generateMap({ cols, rows, seed, mapType });
        // Land bridges may join continents, so the actual landmass count can be
        // below the type's continent count — but never above, and never zero.
        // (Polar ice caps are not continents and are excluded.)
        const count = countLandmasses(map, minSize, map.poleAxis);
        expect(count, `${mapType} / ${seed}`).toBe(map.landmassCount);
        expect(count, `${mapType} / ${seed}`).toBeGreaterThanOrEqual(1);
        expect(count, `${mapType} / ${seed}`).toBeLessThanOrEqual(target);
      }
    }
  });

  it("pangaea is always a single major landmass", () => {
    for (const seed of ["alpha", "beta", "gamma", "delta"]) {
      const map = generateMap({ cols: 80, rows: 56, seed, mapType: "pangaea" });
      expect(map.landmassCount).toBe(1);
    }
  });

  it("land bridges sometimes join continents, but not always", () => {
    const seeds = ["a1", "a2", "a3", "a4", "a5", "a6", "a7", "a8", "a9", "a10", "a11", "a12"];
    const counts = new Set(
      seeds.map((seed) => generateMap({ cols: 80, rows: 56, seed, mapType: "three_continents" }).landmassCount),
    );
    // Across a spread of seeds we expect both bridged (<3) and separate (3) worlds.
    expect(counts.has(3)).toBe(true);
    expect([...counts].some((c) => c! < 3)).toBe(true);
  });

  it("islands map stamps many visible islands across the ocean", () => {
    for (let i = 0; i < 8; i++) {
      const map = generateMap({ cols: 80, rows: 56, seed: `islands-visible-${i}`, mapType: "islands" });
      const land = map.tiles.filter((t) => !isWater(t.terrain)).length;
      expect(land / map.tiles.length, `seed ${i} land`).toBeGreaterThan(0.1);
      const islandCount = countLandmasses(map, 3, map.poleAxis);
      expect(islandCount, `seed ${i} count`).toBeGreaterThanOrEqual(15);
    }
  });

  it("inland sea looks like Japan Seto: three shores, basin water, and islets", () => {
    const major = majorLandmassMin(80, 56);
    for (let i = 0; i < 10; i++) {
      const map = generateMap({ cols: 80, rows: 56, seed: `inland-ring-${i}`, mapType: "inland_sea" });
      const count = countLandmasses(map, major, null);
      expect(count, `seed ${i} landmasses`).toBeGreaterThanOrEqual(2);
      expect(count, `seed ${i} landmasses`).toBeLessThanOrEqual(4);

      let northLand = 0;
      let northTiles = 0;
      let southLand = 0;
      let southTiles = 0;
      let basinWater = 0;
      let basinTiles = 0;
      let basinIslets = 0;
      const spec = getSetoInlandSeaSpec(`inland-ring-${i}`);
      const seenBasinLand = new Set<number>();
      const sizes = landmassSizes(map);
      for (const t of map.tiles) {
        const u = map.cols > 1 ? t.col / (map.cols - 1) : 0.5;
        const v = map.rows > 1 ? t.row / (map.rows - 1) : 0.5;
        if (spec.isShoreLand(u, v)) {
          const [, rv] = spec.toLocal(u, v);
          if (rv < 0.44) {
            northTiles++;
            if (!isWater(t.terrain)) northLand++;
          } else if (rv > 0.56) {
            southTiles++;
            if (!isWater(t.terrain)) southLand++;
          }
        }
        if (spec.isBasin(u, v)) {
          basinTiles++;
          if (isWater(t.terrain)) basinWater++;
          else {
            const size = sizes[t.row * map.cols + t.col]!;
            if (size > 0 && size < major && !seenBasinLand.has(size)) {
              seenBasinLand.add(size);
              basinIslets++;
            }
          }
        }
      }
      expect(northLand / northTiles, `seed ${i} north`).toBeGreaterThan(0.45);
      expect(southLand / southTiles, `seed ${i} south`).toBeGreaterThan(0.45);
      expect(basinWater / basinTiles, `seed ${i} basin`).toBeGreaterThan(0.5);
      expect(basinIslets, `seed ${i} islets`).toBeGreaterThanOrEqual(8);
      const land = map.tiles.filter((t) => !isWater(t.terrain)).length;
      expect(land / map.tiles.length).toBeGreaterThan(0.28);
      expect(land / map.tiles.length).toBeLessThan(0.55);
    }
  });

  it("continent-style maps always include small offshore islands", () => {
    for (const mapType of ["pangaea", "two_continents", "four_continents"] as const) {
      const map = generateMap({ cols: 80, rows: 56, seed: "island-check", mapType });
      const islands =
        countLandmasses(map, 1, map.poleAxis) - countLandmasses(map, majorLandmassMin(80, 56), map.poleAxis);
      expect(islands, mapType).toBeGreaterThanOrEqual(2);
    }
  });

  it("most maps also roll a big island (Japan-sized, still below a continent)", () => {
    let withBig = 0;
    for (const seed of ["big-1", "big-2", "big-3", "big-4"]) {
      const map = generateMap({ cols: 80, rows: 56, seed, mapType: "two_continents" });
      // A landmass of 10+ tiles that still isn't a continent (ice caps excluded).
      const bigIslands =
        countLandmasses(map, 10, map.poleAxis) - countLandmasses(map, majorLandmassMin(80, 56), map.poleAxis);
      if (bigIslands >= 1) withBig++;
    }
    expect(withBig).toBeGreaterThanOrEqual(3);
  });

  it("uses north-south poles aligned with the Earth lat/lon grid, with ice at the map edges", () => {
    for (let i = 0; i < 8; i++) {
      const map = generateMap({ cols: 64, rows: 44, seed: `pole-${i}`, mapType: "pangaea" });
      expect(map.poleAxis).toBe("ns");
      // Any land within 3 tiles of a polar edge must be frozen; pack ice should
      // make at least some such land exist.
      const frozen = new Set(["snow", "tundra", "taiga"]);
      let polarIce = 0;
      for (const t of map.tiles) {
        const edgeDist =
          map.poleAxis === "ns"
            ? Math.min(t.row, map.rows - 1 - t.row)
            : Math.min(t.col, map.cols - 1 - t.col);
        if (edgeDist > 5 || isWater(t.terrain)) continue;
        if (frozen.has(t.terrain)) polarIce++;
        if (edgeDist <= 3) {
          expect(frozen.has(t.terrain), `${t.terrain} at ${t.col},${t.row} (axis ${map.poleAxis})`).toBe(true);
        }
      }
      // The ice caps should be clearly visible, not a stray floe or two.
      expect(polarIce, `pole-${i} should have substantial ice caps`).toBeGreaterThanOrEqual(25);
      // And the cap must be a contiguous shelf (a landmass touching the polar
      // border), not just scattered islets.
      const sizes = landmassSizes(map);
      let biggestCap = 0;
      for (const t of map.tiles) {
        const onPolarBorder =
          map.poleAxis === "ns"
            ? t.row === 0 || t.row === map.rows - 1
            : t.col === 0 || t.col === map.cols - 1;
        if (onPolarBorder && !isWater(t.terrain)) {
          biggestCap = Math.max(biggestCap, sizes[t.row * map.cols + t.col]!);
        }
      }
      expect(biggestCap, `pole-${i} cap should be a real landmass`).toBeGreaterThanOrEqual(20);
    }
  });

  it("keeps the bottom map row as water on procedural maps (skirt rim)", () => {
    for (let i = 0; i < 8; i++) {
      const map = generateMap({ cols: 80, rows: 56, seed: `bottom-rim-${i}`, mapType: "pangaea" });
      for (const t of map.tiles) {
        if (!isBottomMapBorderTile(map, t.col, t.row)) continue;
        expect(isWater(t.terrain), `${t.terrain} at bottom ${t.col},${t.row} (${i})`).toBe(true);
      }
    }
  });

  it("rolls hill country away from mountain ranges", () => {
    const map = generateMap({ cols: 80, rows: 56, seed: "hills-check", mapType: "two_continents" });
    const mountains = map.tiles.filter((t) => t.terrain === "mountains" || t.terrain === "volcano");
    const hills = map.tiles.filter((t) => t.terrain === "hills" || t.terrain === "mesa");
    const land = map.tiles.filter((t) => !isWater(t.terrain)).length;
    // Hills are a real share of the land...
    expect(hills.length / land).toBeGreaterThan(0.08);
    // ...and some hill country stands on its own, well away from any mountains.
    const standalone = hills.filter((h) =>
      mountains.every((m) => Math.max(Math.abs(m.col - h.col), Math.abs(m.row - h.row)) >= 4),
    );
    expect(standalone.length).toBeGreaterThan(5);
  });

  it("clads moist hills in trees (wooded hills)", () => {
    const map = generateMap({ cols: 80, rows: 56, seed: "wooded-check", mapType: "two_continents" });
    const wooded = map.tiles.filter((t) => t.wooded);
    // Wooded hills are common...
    expect(wooded.length).toBeGreaterThan(10);
    // ...and only ever hills.
    for (const t of wooded) expect(t.terrain).toBe("hills");
    // Dry hills stay bare.
    const bareHills = map.tiles.filter((t) => t.terrain === "hills" && !t.wooded);
    expect(bareHills.length).toBeGreaterThan(0);
  });

  it("carves inland lakes across the map", () => {
    for (const seed of ["lakes-1", "lakes-2"]) {
      const map = generateMap({ cols: 80, rows: 56, seed, mapType: "two_continents" });
      const lakes = map.tiles.filter((t) => t.terrain === "lake").length;
      expect(lakes, seed).toBeGreaterThanOrEqual(6);
    }
  });

  it("the real world keeps its north/south poles", () => {
    const map = generateMap({ cols: 64, rows: 44, seed: "earth-poles", mapType: "realworld" });
    expect(map.poleAxis).toBe("ns");
  });

  it("mediterranean map uses geodata coastlines with land and sea", () => {
    const map = generateMap({ cols: 80, rows: 56, seed: "rome-384", mapType: "mediterranean" });
    expect(map.mapType).toBe("mediterranean");
    expect(map.poleAxis).toBeUndefined();
    let land = 0;
    let water = 0;
    for (const t of map.tiles) {
      if (isWater(t.terrain)) water++;
      else land++;
    }
    expect(land).toBeGreaterThan(100);
    expect(water).toBeGreaterThan(100);
    expect(land / (land + water)).toBeGreaterThan(0.45);
    expect(land / (land + water)).toBeLessThan(0.85);
  });

  it("mediterranean generation is deterministic", () => {
    const a = generateMap({ cols: 52, rows: 36, seed: "rome-det", mapType: "mediterranean" });
    const b = generateMap({ cols: 52, rows: 36, seed: "rome-det", mapType: "mediterranean" });
    expect(a.tiles.map((t) => t.terrain)).toEqual(b.tiles.map((t) => t.terrain));
  });
});
