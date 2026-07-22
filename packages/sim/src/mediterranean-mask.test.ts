import { describe, expect, it } from "vitest";
import {
  isMediterraneanLand,
  mediterraneanTileLatLon,
  MEDITERRANEAN_LAT_MAX,
  MEDITERRANEAN_LAT_MIN,
  MEDITERRANEAN_LON_MAX,
  MEDITERRANEAN_LON_MIN,
} from "./mediterranean-mask";

describe("mediterranean mask", () => {
  it("maps tile corners to the Roman Empire viewport", () => {
    const cols = 80;
    const rows = 56;
    const nw = mediterraneanTileLatLon(0, 0, cols, rows);
    const se = mediterraneanTileLatLon(cols - 1, rows - 1, cols, rows);
    expect(nw.lat).toBeGreaterThan(se.lat);
    expect(nw.lon).toBeLessThan(se.lon);
    expect(nw.lat).toBeCloseTo(MEDITERRANEAN_LAT_MAX, 0);
    expect(se.lat).toBeCloseTo(MEDITERRANEAN_LAT_MIN, 0);
    expect(nw.lon).toBeCloseTo(MEDITERRANEAN_LON_MIN, 0);
    expect(se.lon).toBeCloseTo(MEDITERRANEAN_LON_MAX, 0);
  });

  it("has recognizable land and sea at medium resolution", () => {
    const cols = 80;
    const rows = 56;
    let land = 0;
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        if (isMediterraneanLand(col, row, cols, rows)) land++;
      }
    }
    const total = cols * rows;
    expect(land / total).toBeGreaterThan(0.45);
    expect(land / total).toBeLessThan(0.85);
  });
});
