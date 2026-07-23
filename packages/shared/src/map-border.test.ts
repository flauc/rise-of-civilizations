import { describe, expect, it } from "vitest";
import {
  isMapBorderTile,
  isBottomMapBorderTile,
  mapEdgeSkirtKind,
  mapEdgeSkirtSide,
  type GameMap,
  type Tile,
} from "./map";

function tinyMap(cols: number, rows: number, terrain: Tile["terrain"] = "plains"): GameMap {
  const tiles: Tile[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      tiles.push({ col, row, terrain });
    }
  }
  return { cols, rows, tiles };
}

function setTerrain(map: GameMap, col: number, row: number, terrain: Tile["terrain"]): void {
  map.tiles[row * map.cols + col]!.terrain = terrain;
}

describe("isMapBorderTile", () => {
  it("marks perimeter tiles and not interior tiles", () => {
    const map = tinyMap(3, 3);
    expect(isMapBorderTile(map, 0, 0)).toBe(true);
    expect(isMapBorderTile(map, 2, 2)).toBe(true);
    expect(isMapBorderTile(map, 1, 1)).toBe(false);
  });
});

describe("mapEdgeSkirtSide", () => {
  it("picks the nearest map edge", () => {
    const map = tinyMap(5, 5);
    expect(mapEdgeSkirtSide(map, 2, 4)).toBe("bottom");
    expect(mapEdgeSkirtSide(map, 4, 2)).toBe("right");
    expect(mapEdgeSkirtSide(map, 2, 0)).toBe("top");
    expect(mapEdgeSkirtSide(map, 0, 2)).toBe("left");
  });

  it("classifies off-map ghost hexes", () => {
    const map = tinyMap(5, 5);
    expect(mapEdgeSkirtSide(map, 2, 5)).toBe("bottom");
    expect(mapEdgeSkirtSide(map, 5, 2)).toBe("right");
    expect(mapEdgeSkirtSide(map, 2, -1)).toBe("top");
    expect(mapEdgeSkirtSide(map, -1, 2)).toBe("left");
  });
});

describe("isBottomMapBorderTile", () => {
  it("is true only on the last row", () => {
    const map = tinyMap(5, 5);
    expect(isBottomMapBorderTile(map, 0, 4)).toBe(true);
    expect(isBottomMapBorderTile(map, 4, 4)).toBe(true);
    expect(isBottomMapBorderTile(map, 2, 3)).toBe(false);
    expect(isBottomMapBorderTile(map, 2, 0)).toBe(false);
  });
});

describe("mapEdgeSkirtKind", () => {
  it("uses void on every map-border tile", () => {
    const map = tinyMap(3, 3, "plains");
    expect(mapEdgeSkirtKind(map, 0, 0)).toBe("void");
    expect(mapEdgeSkirtKind(map, 2, 2)).toBe("void");

    setTerrain(map, 1, 2, "ocean");
    expect(mapEdgeSkirtKind(map, 1, 2)).toBe("void");

    setTerrain(map, 0, 1, "snow");
    expect(mapEdgeSkirtKind(map, 0, 1)).toBe("void");
  });

  it("ignores interior tiles", () => {
    const map = tinyMap(3, 3, "ocean");
    expect(mapEdgeSkirtKind(map, 1, 1)).toBeNull();
  });
});
