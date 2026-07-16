import { describe, it, expect } from "vitest";
import { shareAtlas } from "./atlas-cache";

/** Stands in for a load*Atlas(): counts calls and lets the test settle it by hand. */
function fakeLoader(): {
  load: (onLoad?: () => void) => { loaded: boolean };
  calls: () => number;
  settle: () => void;
} {
  let calls = 0;
  let ping: (() => void) | undefined;
  let atlas: { loaded: boolean } | null = null;
  return {
    load: (onLoad) => {
      calls++;
      ping = onLoad;
      atlas = { loaded: false };
      return atlas;
    },
    calls: () => calls,
    settle: () => {
      if (atlas) atlas.loaded = true;
      ping?.();
    },
  };
}

describe("shareAtlas", () => {
  it("loads once no matter how many callers ask", () => {
    const fake = fakeLoader();
    const shared = shareAtlas(fake.load);

    const a = shared();
    const b = shared();
    const c = shared(() => {});

    expect(fake.calls()).toBe(1);
    expect(b).toBe(a);
    expect(c).toBe(a);
  });

  it("pings every waiting caller as sprites stream in", () => {
    const fake = fakeLoader();
    const shared = shareAtlas(fake.load);
    let first = 0;
    let second = 0;

    shared(() => first++);
    shared(() => second++);
    fake.settle();

    expect(first).toBe(1);
    expect(second).toBe(1);
  });

  it("pings a caller that arrives after the atlas is already warm", () => {
    const fake = fakeLoader();
    const shared = shareAtlas(fake.load);

    // The boot preload warms it with no callback of its own...
    shared();
    fake.settle();

    // ...and startGame arrives later, needing one redraw against the warm sprites.
    let redraws = 0;
    const atlas = shared(() => redraws++);

    expect(atlas.loaded).toBe(true);
    expect(redraws).toBe(1);
    expect(fake.calls()).toBe(1);
  });

  it("drops callbacks once loaded, so ended games are not pinned", () => {
    const fake = fakeLoader();
    const shared = shareAtlas(fake.load);
    let pings = 0;

    shared(() => pings++);
    fake.settle();
    // A stray late ping (an error event after the last sprite) reaches nobody.
    fake.settle();

    expect(pings).toBe(1);
  });
});
