import { describe, expect, it } from "vitest";
import { hexDirectionAngleRad } from "./hex";
import {
  isMapBorderTile,
  isBottomMapBorderTile,
  isSideVoidEdgeTile,
  isUnitPlayableTile,
  mapEdgeSkirtKind,
  mapEdgeSkirtRotationRad,
  isBottomSkirtTile,
  isMapTilePresent,
  leftBottomHexUnderSlots,
  leftBottomHexUnderKind,
  leftBottomHexUnderAnchor,
  mapBottomEdgeTerrainSlots,
  mapBottomEdgeTerrainRefCol,
  mapBottomEdgeTerrainDrawCol,
  isBottomOceanSkirtTerrain,
  isMapBottomEdgeTerrainSlot,
  mapBottomEdgeSkirtKind,
  mapBottomEdgeSkirtRotationRad,
  MAP_BOTTOM_EDGE_SKIRT_ROTATION_RAD,
  isLeftBottomGapTerrainSlot,
  getMapSlotTile,
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
    const map = tinyMap(5, 5);
    expect(isMapBorderTile(map, 0, 1)).toBe(true);
    expect(isMapBorderTile(map, 2, 2)).toBe(false);
  });

  it("treats penultimate corners as border when bottom row corners are omitted", () => {
    const map = tinyMap(5, 5);
    expect(isMapTilePresent(map, 0, 4)).toBe(false);
    expect(isMapBorderTile(map, 0, 1)).toBe(true);
  });
});

describe("isSideVoidEdgeTile", () => {
  it("marks top/left/right edges but not bottom row", () => {
    const map = tinyMap(5, 5);
    expect(isSideVoidEdgeTile(map, 2, 0)).toBe(true);
    expect(isSideVoidEdgeTile(map, 0, 1)).toBe(true);
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
  it("is true on present bottom-row tiles only (corners omitted)", () => {
    const map = tinyMap(5, 5);
    expect(isBottomMapBorderTile(map, 0, 4)).toBe(false);
    expect(isBottomMapBorderTile(map, 4, 4)).toBe(false);
    expect(isBottomMapBorderTile(map, 2, 4)).toBe(true);
    expect(isBottomMapBorderTile(map, 2, 3)).toBe(false);
  });
});

describe("isUnitPlayableTile", () => {
  it("blocks only the bottom row", () => {
    const map = tinyMap(5, 5);
    expect(isUnitPlayableTile(map, 0, 1)).toBe(true);
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
    const above = map.rows - 2;
    setTerrain(map, 1, above, "plains");
    setTerrain(map, 2, above, "bog");
    expect(mapEdgeSkirtKind(map, 2, map.rows - 1)).toBe("dirt");
  });

  it("picks ocean or a shore from the two flanking tiles above the skirt", () => {
    const map = tinyMap(5, 5, "ocean");
    const bottom = map.rows - 1;
    const above = bottom - 1;
    expect(mapEdgeSkirtKind(map, 2, bottom)).toBe("ocean");

    setTerrain(map, 1, above, "plains");
    expect(mapEdgeSkirtKind(map, 2, bottom)).toBe("oceanShoreEast");

    setTerrain(map, 1, above, "ocean");
    setTerrain(map, 2, above, "plains");
    expect(mapEdgeSkirtKind(map, 2, bottom)).toBe("oceanShoreWest");

    setTerrain(map, 1, above, "plains");
    expect(mapEdgeSkirtKind(map, 2, bottom)).toBe("dirt");
  });

  it("bridges (col, above) and (col+1, above) on an odd skirt row", () => {
    const map = tinyMap(6, 6, "ocean");
    const bottom = map.rows - 1;
    const above = bottom - 1;
    setTerrain(map, 1, above, "plains");
    expect(mapEdgeSkirtKind(map, 1, bottom)).toBe("oceanShoreEast");
    expect(mapEdgeSkirtKind(map, 2, bottom)).toBe("ocean");
  });

  it("treats coast like ocean and follows the on-map flank at the corners", () => {
    const map = tinyMap(5, 5, "plains");
    const above = map.rows - 2;
    setTerrain(map, 1, above, "coast");
    expect(mapEdgeSkirtKind(map, 2, map.rows - 1)).toBe("oceanShoreWest");
    setTerrain(map, 1, above, "plains");
    setTerrain(map, 2, above, "plains");
    expect(mapEdgeSkirtKind(map, 1, map.rows - 1)).toBe("dirt");
  });

  it("ignores interior tiles", () => {
    const map = tinyMap(3, 3, "ocean");
    expect(mapEdgeSkirtKind(map, 1, 1)).toBeNull();
  });
});

describe("isMapTilePresent", () => {
  it("omits both corner columns on the bottom row", () => {
    const map = tinyMap(5, 5);
    expect(isMapTilePresent(map, 0, 4)).toBe(false);
    expect(isMapTilePresent(map, 4, 4)).toBe(false);
    expect(isMapTilePresent(map, 2, 4)).toBe(true);
    expect(isMapTilePresent(map, 0, 2)).toBe(false);
    expect(isMapTilePresent(map, 0, 3)).toBe(true);
  });

  it("omits col 0 on 1st, 3rd, 5th… rows (left-edge stair step)", () => {
    const map = tinyMap(7, 7);
    expect(isMapTilePresent(map, 0, 0)).toBe(false);
    expect(isMapTilePresent(map, 0, 1)).toBe(true);
    expect(isMapTilePresent(map, 0, 2)).toBe(false);
    expect(isMapTilePresent(map, 0, 3)).toBe(true);
    expect(isMapTilePresent(map, 0, 4)).toBe(false);
    expect(isMapTilePresent(map, 1, 0)).toBe(true);
  });
});

describe("leftBottomHexUnderSlots", () => {
  it("lists col 0 on the last three rows", () => {
    const map = tinyMap(7, 7);
    const bottom = map.rows - 1;
    const penultimate = map.rows - 2;
    const antepenultimate = map.rows - 3;
    expect(leftBottomHexUnderSlots(map)).toEqual([
      { col: 0, row: antepenultimate },
      { col: 0, row: penultimate },
      { col: 0, row: bottom },
    ]);
  });

  it("picks dirt or ocean from the inward neighbor terrain", () => {
    const map = tinyMap(7, 7, "plains");
    const penultimate = map.rows - 2;
    const bottom = map.rows - 1;
    const refCol = isMapTilePresent(map, 0, penultimate) ? 0 : 1;
    setTerrain(map, refCol, penultimate, "ocean");
    expect(leftBottomHexUnderKind(map, 0, penultimate)).toBe("ocean");
    expect(leftBottomHexUnderKind(map, 0, bottom)).toBe("ocean");
    setTerrain(map, refCol, penultimate, "forest");
    expect(leftBottomHexUnderKind(map, 0, penultimate)).toBe("dirt");
    expect(leftBottomHexUnderKind(map, 0, bottom)).toBe("dirt");
  });

  it("anchors west curbs on the playable ocean/land hex", () => {
    const map = tinyMap(8, 8);
    const penultimate = map.rows - 2;
    const bottom = map.rows - 1;
    const antepenultimate = map.rows - 3;
    const expectAnchor = (row: number) =>
      isMapTilePresent(map, 0, row) ? { col: 0, row } : { col: 1, row };
    expect(leftBottomHexUnderAnchor(map, antepenultimate)).toEqual(expectAnchor(antepenultimate));
    expect(leftBottomHexUnderAnchor(map, penultimate)).toEqual(expectAnchor(penultimate));
    expect(leftBottomHexUnderAnchor(map, bottom)).toEqual({ col: 1, row: bottom });
  });

  it("anchors penultimate on col 0 when that slot is present", () => {
    const map = tinyMap(7, 7);
    const penultimate = map.rows - 2;
    if (isMapTilePresent(map, 0, penultimate)) {
      expect(leftBottomHexUnderAnchor(map, penultimate)).toEqual({ col: 0, row: penultimate });
    }
  });

  it("flags penultimate col 0 when omitted for gap terrain", () => {
    const map = tinyMap(8, 8);
    const penultimate = map.rows - 2;
    if (!isMapTilePresent(map, 0, penultimate)) {
      expect(isLeftBottomGapTerrainSlot(map, 0, penultimate)).toBe(true);
      expect(isMapBottomEdgeTerrainSlot(map, 0, penultimate)).toBe(true);
      expect(getMapSlotTile(map, 0, penultimate)?.col).toBe(0);
    }
  });
});

describe("mapBottomEdgeTerrainSlots", () => {
  it("lists omitted corners plus penultimate east ghost when right edge is present", () => {
    const map = tinyMap(8, 8);
    const penultimate = map.rows - 2;
    const bottom = map.rows - 1;
    const slots = mapBottomEdgeTerrainSlots(map);
    expect(slots.some((s) => s.col === 0 && s.row === bottom)).toBe(true);
    expect(slots.some((s) => s.col === map.cols - 1 && s.row === bottom)).toBe(true);
    if (isMapTilePresent(map, map.cols - 1, penultimate)) {
      expect(slots.some((s) => s.col === map.cols && s.row === penultimate)).toBe(true);
      expect(slots.some((s) => s.col === map.cols - 1 && s.row === penultimate)).toBe(false);
      expect(mapBottomEdgeTerrainRefCol(map, map.cols, penultimate)).toBe(map.cols - 1);
    }
    if (!isMapTilePresent(map, 0, penultimate)) {
      expect(slots.some((s) => s.col === 0 && s.row === penultimate)).toBe(true);
    }
    expect(mapBottomEdgeTerrainRefCol(map, 0, bottom)).toBe(1);
    expect(mapBottomEdgeTerrainRefCol(map, map.cols, penultimate)).toBe(map.cols - 1);
    expect(mapBottomEdgeTerrainDrawCol(map, map.cols, penultimate)).toBe(map.cols);
    expect(mapBottomEdgeTerrainDrawCol(map, 0, bottom)).toBe(0);
    expect(mapEdgeSkirtKind(map, map.cols - 2, bottom)).not.toBeNull();
  });

  it("picks hexUnderOcean or hexUnderDirt from the inward neighbor", () => {
    const map = tinyMap(8, 8, "plains");
    const bottom = map.rows - 1;
    const penultimate = map.rows - 2;
    setTerrain(map, 1, penultimate, "ocean");
    expect(mapBottomEdgeSkirtKind(map, 0, bottom)).toBe("ocean");
    setTerrain(map, 1, penultimate, "forest");
    expect(mapBottomEdgeSkirtKind(map, 0, bottom)).toBe("dirt");
    setTerrain(map, map.cols - 2, penultimate, "ocean");
    setTerrain(map, map.cols - 1, penultimate, "ocean");
    expect(mapEdgeSkirtKind(map, map.cols - 2, bottom)).toBe("ocean");
    if (isMapTilePresent(map, map.cols - 1, penultimate)) {
      setTerrain(map, map.cols - 1, penultimate, "ocean");
      expect(mapBottomEdgeSkirtKind(map, map.cols, penultimate)).toBe("ocean");
      setTerrain(map, map.cols - 1, penultimate, "plains");
      expect(mapBottomEdgeSkirtKind(map, map.cols, penultimate)).toBe("dirt");
    }
  });

  it("uses 180° on all bottom-edge hex-under skirts", () => {
    const map = tinyMap(8, 8);
    const penultimate = map.rows - 2;
    const bottom = map.rows - 1;
    expect(mapBottomEdgeSkirtRotationRad(map, 0, bottom)).toBe(Math.PI);
    expect(mapBottomEdgeSkirtRotationRad(map, 0, penultimate)).toBe(Math.PI);
    expect(mapBottomEdgeSkirtRotationRad(map, map.cols, penultimate)).toBe(Math.PI);
    expect(MAP_BOTTOM_EDGE_SKIRT_ROTATION_RAD).toBe(Math.PI);
  });
});

describe("isBottomSkirtTile", () => {
  it("matches the bottom skirt row alias", () => {
    const map = tinyMap(5, 5);
    expect(isBottomSkirtTile(map, 2, 4)).toBe(true);
    expect(isBottomSkirtTile(map, 0, 4)).toBe(false);
    expect(isBottomSkirtTile(map, 2, 3)).toBe(false);
  });
});
