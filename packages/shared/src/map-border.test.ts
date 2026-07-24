import { describe, expect, it } from "vitest";
import { hexDirectionAngleRad } from "./hex";
import {
  isMapBorderTile,
  isBottomMapBorderTile,
  isSideVoidEdgeTile,
  isUnitPlayableTile,
  mapEdgeSkirtKind,
  mapEdgeSkirtRotationRad,
  mapEdgeSkirtSide,
  mapEdgeVoidKind,
  mapEdgeVoidRotationRad,
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

describe("isSideVoidEdgeTile", () => {
  it("marks top/left/right edges but not bottom row", () => {
    const map = tinyMap(5, 5);
    expect(isSideVoidEdgeTile(map, 2, 0)).toBe(true);
    expect(isSideVoidEdgeTile(map, 0, 2)).toBe(true);
    expect(isSideVoidEdgeTile(map, 4, 2)).toBe(true);
    expect(isSideVoidEdgeTile(map, 2, 4)).toBe(false);
    expect(isSideVoidEdgeTile(map, 0, 4)).toBe(false);
    expect(isSideVoidEdgeTile(map, 2, 2)).toBe(false);
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

describe("isUnitPlayableTile", () => {
  it("blocks only the bottom row", () => {
    const map = tinyMap(5, 5);
    expect(isUnitPlayableTile(map, 0, 2)).toBe(true);
    expect(isUnitPlayableTile(map, 2, 0)).toBe(true);
    expect(isUnitPlayableTile(map, 2, 3)).toBe(true);
    expect(isUnitPlayableTile(map, 2, 4)).toBe(false);
  });
});

describe("mapEdgeVoidKind", () => {
  it("uses hexUnderVoid00 on top/left/right and void2 below", () => {
    const map = tinyMap(5, 5);
    expect(mapEdgeVoidKind(map, 2, -1)).toBe("void0");
    expect(mapEdgeVoidKind(map, 5, 2)).toBe("void0");
    expect(mapEdgeVoidKind(map, -1, 2)).toBe("void0");
    expect(mapEdgeVoidKind(map, 2, 5)).toBe("void2");
  });
});

describe("mapEdgeSkirtRotationRad", () => {
  it("uses 180° for bottom-row ocean/dirt skirts", () => {
    const map = tinyMap(5, 5);
    expect(mapEdgeSkirtRotationRad(map, 2, 4)).toBeCloseTo(Math.PI);
  });
});

describe("mapEdgeVoidRotationRad", () => {
  it("is zero on hexUnderVoid00 canonical direction for top/left/right", () => {
    expect(mapEdgeVoidRotationRad("right", 2)).toBeCloseTo(0);
    expect(mapEdgeVoidRotationRad("top", 2)).toBeCloseTo(0);
    expect(mapEdgeVoidRotationRad("left", 2)).toBeCloseTo(0);
  });

  it("varies along the right edge for different hex steps", () => {
    expect(mapEdgeVoidRotationRad("right", 0)).toBeCloseTo(hexDirectionAngleRad(0) - hexDirectionAngleRad(2));
    expect(mapEdgeVoidRotationRad("right", 1)).toBeCloseTo(hexDirectionAngleRad(1) - hexDirectionAngleRad(2));
  });
});

describe("mapEdgeSkirtKind", () => {
  it("returns null off the bottom row", () => {
    const map = tinyMap(5, 5, "plains");
    expect(mapEdgeSkirtKind(map, 2, 0)).toBeNull();
    expect(mapEdgeSkirtKind(map, 4, 2)).toBeNull();
    expect(mapEdgeSkirtKind(map, 0, 2)).toBeNull();
  });

  it("uses dirt when both tiles flanking the skirt above are land", () => {
    const map = tinyMap(5, 5, "ocean");
    const above = map.rows - 2; // even bottom row (4): skirt (2,4) bridges (1,3) and (2,3)
    setTerrain(map, 1, above, "plains");
    setTerrain(map, 2, above, "bog");
    expect(mapEdgeSkirtKind(map, 2, map.rows - 1)).toBe("dirt");
  });

  // The skirt cliff bridges its two flanking tiles above; the sprites render with a
  // 180 degree left-to-right mirror, so land on the LEFT flank resolves to the
  // East-shore sprite and land on the RIGHT flank to the West-shore sprite.
  it("picks ocean or a shore from the two flanking tiles above the skirt", () => {
    const map = tinyMap(5, 5, "ocean");
    const bottom = map.rows - 1; // 4 (even): skirt (2,4) bridges (1,3) and (2,3)
    const above = bottom - 1;
    expect(mapEdgeSkirtKind(map, 2, bottom)).toBe("ocean");

    setTerrain(map, 1, above, "plains"); // left flank land, right water -> East-shore
    expect(mapEdgeSkirtKind(map, 2, bottom)).toBe("oceanShoreEast");

    setTerrain(map, 1, above, "ocean");
    setTerrain(map, 2, above, "plains"); // left water, right flank land -> West-shore
    expect(mapEdgeSkirtKind(map, 2, bottom)).toBe("oceanShoreWest");

    setTerrain(map, 1, above, "plains"); // both flanks land -> dirt
    expect(mapEdgeSkirtKind(map, 2, bottom)).toBe("dirt");
  });

  it("bridges (col, above) and (col+1, above) on an odd skirt row", () => {
    // The boundary case the single-tile lookup got wrong: on an odd bottom row the
    // skirt below a land tile that borders water must be the shore, not a dirt cliff
    // followed by a separate coast cliff.
    const map = tinyMap(6, 6, "ocean");
    const bottom = map.rows - 1; // 5 (odd): skirt (col,5) bridges (col,4) and (col+1,4)
    const above = bottom - 1;
    setTerrain(map, 1, above, "plains"); // col 1 land, col 2 water
    expect(mapEdgeSkirtKind(map, 1, bottom)).toBe("oceanShoreEast"); // bridges land+water
    expect(mapEdgeSkirtKind(map, 2, bottom)).toBe("ocean"); // bridges water+water
  });

  it("treats coast like ocean and follows the on-map flank at the corners", () => {
    const map = tinyMap(5, 5, "plains");
    const above = map.rows - 2;
    setTerrain(map, 1, above, "coast"); // skirt (2,4): left coast(water), right plains(land)
    expect(mapEdgeSkirtKind(map, 2, map.rows - 1)).toBe("oceanShoreWest");
    // Corner skirt (0,4) has an off-map left flank, so it follows (0,3) = plains.
    expect(mapEdgeSkirtKind(map, 0, map.rows - 1)).toBe("dirt");
  });

  it("ignores interior tiles", () => {
    const map = tinyMap(3, 3, "ocean");
    expect(mapEdgeSkirtKind(map, 1, 1)).toBeNull();
  });
});
