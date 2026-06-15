import { describe, it, expect } from "vitest";
import { foodToGrow } from "./economy";

describe("foodToGrow", () => {
  it("uses a flatter curve so small cities grow faster", () => {
    expect(foodToGrow(1)).toBe(8);
    expect(foodToGrow(2)).toBe(11);
    expect(foodToGrow(3)).toBe(14);
    expect(foodToGrow(5)).toBe(20);
  });
});
