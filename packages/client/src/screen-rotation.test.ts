import { describe, expect, it } from "vitest";
import {
  effectiveViewportFromRaw,
  layoutViewportMismatch,
} from "./screen-rotation";

describe("screen rotation layout", () => {
  it("detects portrait device vs landscape preference", () => {
    expect(layoutViewportMismatch("landscape", 390, 844)).toBe(true);
    expect(layoutViewportMismatch("landscape", 844, 390)).toBe(false);
    expect(layoutViewportMismatch("portrait", 844, 390)).toBe(true);
    expect(layoutViewportMismatch("portrait", 390, 844)).toBe(false);
  });

  it("swaps viewport dimensions for CSS fallback", () => {
    expect(
      effectiveViewportFromRaw("landscape", 390, 844, true),
    ).toEqual({ width: 844, height: 390 });
    expect(
      effectiveViewportFromRaw("portrait", 844, 390, true),
    ).toEqual({ width: 390, height: 844 });
    expect(
      effectiveViewportFromRaw("landscape", 844, 390, true),
    ).toEqual({ width: 844, height: 390 });
  });

  it("keeps raw dimensions when CSS fallback is off", () => {
    expect(
      effectiveViewportFromRaw("landscape", 390, 844, false),
    ).toEqual({ width: 390, height: 844 });
  });
});
