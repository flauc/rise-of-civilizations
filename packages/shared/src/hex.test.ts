import { describe, it, expect } from "vitest";
import {
  axialDistance,
  axialNeighbors,
  axialToPixel,
  pixelToAxial,
  axialRound,
  offsetToAxial,
  axialToOffset,
  hexKey,
} from "./hex";

describe("hex math", () => {
  it("distance is 0 to self and 1 to each neighbor", () => {
    const origin = { q: 0, r: 0 };
    expect(axialDistance(origin, origin)).toBe(0);
    for (const n of axialNeighbors(origin)) {
      expect(axialDistance(origin, n)).toBe(1);
    }
  });

  it("pixel round-trips back to the same hex", () => {
    const size = 24;
    for (let q = -10; q <= 10; q++) {
      for (let r = -10; r <= 10; r++) {
        const h = { q, r };
        const back = axialRound(pixelToAxial(axialToPixel(h, size), size));
        expect(back).toEqual(h);
      }
    }
  });

  it("offset <-> axial round-trips (odd-r)", () => {
    for (let col = 0; col < 12; col++) {
      for (let row = 0; row < 12; row++) {
        const back = axialToOffset(offsetToAxial({ col, row }));
        expect(back).toEqual({ col, row });
      }
    }
  });

  it("hexKey is stable and unique per coordinate", () => {
    expect(hexKey({ q: 1, r: -2 })).toBe("1,-2");
    expect(hexKey({ q: 1, r: -2 })).not.toBe(hexKey({ q: -2, r: 1 }));
  });
});
