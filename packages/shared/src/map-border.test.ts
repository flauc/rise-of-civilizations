import { describe, expect, it } from "vitest";
import { hexDirectionAngleRad } from "./hex";
import {
  isMapBorderTile,
  isBottomMapBorderTile,
  isSideVoidEdgeTile,
  isUnitPlayableTile,
  mapEdgeSkirtKind,
  mapEdgeSkirtRotationRad,
  isMapTilePresent,
  mapBottomCliffTiles,
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
  it("uses 180° for the bottom cliff band", () => {
    const map = tinyMap(5, 5);
    expect(mapEdgeSkirtRotationRad(map, 2, 3)).toBeCloseTo(Math.PI);
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
  it("returns null off the cliff row and on omitted slots", () => {
    const map = tinyMap(5, 5, "plains");
    expect(mapEdgeSkirtKind(map, 2, 0)).toBeNull();
    expect(mapEdgeSkirtKind(map, 2, 2)).toBeNull();
    expect(mapEdgeSkirtKind(map, 2, 4)).toBeNull(); // bottom row renders no terrain
    // Row 3 is odd, so col 0 is present there; on an even cliff row it would not be.
    const evenCliffRow = tinyMap(5, 6, "plains");
    expect(isMapTilePresent(evenCliffRow, 0, 4)).toBe(false);
    expect(mapEdgeSkirtKind(evenCliffRow, 0, 4)).toBeNull();
  });

  it("gives every land tile on the cliff row a dirt cliff", () => {
    const map = tinyMap(5, 5, "ocean");
    const cliff = map.rows - 2;
    setTerrain(map, 1, cliff, "plains");
    setTerrain(map, 2, cliff, "bog");
    expect(mapEdgeSkirtKind(map, 1, cliff)).toBe("dirt");
    expect(mapEdgeSkirtKind(map, 2, cliff)).toBe("dirt");
  });

  it("fades a water cliff to dirt on whichever side its row neighbour is land", () => {
    const map = tinyMap(6, 5, "ocean");
    const cliff = map.rows - 2;
    expect(mapEdgeSkirtKind(map, 3, cliff)).toBe("ocean");

    // Land to the west: the art is mirrored, so the east variant lands the dirt west.
    setTerrain(map, 2, cliff, "plains");
    expect(mapEdgeSkirtKind(map, 3, cliff)).toBe("oceanShoreEast");

    setTerrain(map, 2, cliff, "ocean");
    setTerrain(map, 4, cliff, "plains");
    expect(mapEdgeSkirtKind(map, 3, cliff)).toBe("oceanShoreWest");

    setTerrain(map, 2, cliff, "plains");
    expect(mapEdgeSkirtKind(map, 3, cliff)).toBe("oceanShoreBoth");
  });

  it("keeps the shore on the water tile, not the land tile beside it", () => {
    // cols 0-2 land, cols 3-5 water: the coast runs between col 2 and col 3.
    const map = tinyMap(6, 5, "ocean");
    const cliff = map.rows - 2;
    for (const col of [0, 1, 2]) setTerrain(map, col, cliff, "plains");
    expect(mapEdgeSkirtKind(map, 2, cliff)).toBe("dirt");
    expect(mapEdgeSkirtKind(map, 3, cliff)).toBe("oceanShoreEast");
    expect(mapEdgeSkirtKind(map, 4, cliff)).toBe("ocean");
  });

  it("treats coast like ocean and reads no shore off the map edge", () => {
    const map = tinyMap(5, 5, "plains");
    const cliff = map.rows - 2;
    setTerrain(map, 2, cliff, "coast");
    expect(mapEdgeSkirtKind(map, 2, cliff)).toBe("oceanShoreBoth");
    setTerrain(map, map.cols - 1, cliff, "ocean");
    expect(mapEdgeSkirtKind(map, map.cols - 1, cliff)).toBe("oceanShoreEast");
  });
});

describe("mapBottomCliffTiles", () => {
  it("lists the present tiles on the last row that renders terrain", () => {
    // 8x8: the cliff row is 6, which is even, so its col 0 is omitted by the stagger.
    const map = tinyMap(8, 8);
    expect(mapBottomCliffTiles(map)).toEqual(
      [1, 2, 3, 4, 5, 6, 7].map((col) => ({ col, row: 6 })),
    );
  });

  it("includes col 0 when the cliff row is odd", () => {
    const map = tinyMap(8, 9);
    expect(mapBottomCliffTiles(map)[0]).toEqual({ col: 0, row: 7 });
    expect(mapBottomCliffTiles(map)).toHaveLength(8);
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

