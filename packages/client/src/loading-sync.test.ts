import { describe, it, expect } from "vitest";
import { buildWordRevealTimeline, charCountAtTime } from "./loading-sync";

describe("loading-sync", () => {
  it("reveals progressively and finishes at end", () => {
    const text = "Hello world. Again!";
    const timeline = buildWordRevealTimeline(text, 10);
    expect(timeline.length).toBeGreaterThan(0);
    expect(charCountAtTime(timeline, 0)).toBe(0);
    expect(charCountAtTime(timeline, 10)).toBe(text.length);
    const mid = charCountAtTime(timeline, 5);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(text.length);
  });

  it("weights sentence endings later than mid-clause words", () => {
    const a = buildWordRevealTimeline("One two three.", 12);
    const b = buildWordRevealTimeline("One two three", 12);
    const endA = a[a.length - 1]!.atSec;
    const endB = b[b.length - 1]!.atSec;
    expect(endA).toBeCloseTo(12 * 0.99, 1);
    expect(endB).toBeCloseTo(12 * 0.99, 1);
    const beforeEnd = a[a.length - 2]!.atSec;
    const gapA = endA - beforeEnd;
    const gapB = endB - (b[b.length - 2]?.atSec ?? 0);
    expect(gapA).toBeGreaterThan(gapB * 0.5);
  });
});
