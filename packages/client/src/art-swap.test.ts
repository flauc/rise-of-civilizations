import { describe, it, expect, beforeEach, vi } from "vitest";
import { swapArt, clearArt } from "./art-swap";

/**
 * A stand-in for HTMLImageElement. `decode()` resolves for sources listed in
 * `good` and rejects for everything else, which is what the real one does for
 * art that 404s.
 */
function fakeImg(good: string[]): HTMLImageElement {
  const classes = new Set<string>();
  const img = {
    src: "",
    classList: {
      add: (c: string) => classes.add(c),
      remove: (c: string) => classes.delete(c),
      contains: (c: string) => classes.has(c),
    },
    decode: () => (good.includes(img.src) ? Promise.resolve() : Promise.reject(new Error("404"))),
  };
  return img as unknown as HTMLImageElement;
}

const isPending = (img: HTMLImageElement): boolean => img.classList.contains("art-pending");
const isHidden = (img: HTMLImageElement): boolean => img.classList.contains("hidden");

describe("swapArt", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("shows nothing until the new art has decoded", async () => {
    const img = fakeImg(["camp.png"]);
    swapArt(img, ["camp.png"]);

    // Synchronously after the call, the old picture must already be blanked.
    expect(isPending(img)).toBe(true);

    await vi.waitFor(() => expect(isPending(img)).toBe(false));
    expect(img.src).toBe("camp.png");
    expect(isHidden(img)).toBe(false);
  });

  it("falls through to the next candidate when art is missing", async () => {
    const img = fakeImg(["generic.png"]);
    swapArt(img, ["specific.png", "generic.png", "placeholder.png"]);

    await vi.waitFor(() => expect(isPending(img)).toBe(false));
    expect(img.src).toBe("generic.png");
    expect(isHidden(img)).toBe(false);
  });

  it("hides the element when no candidate decodes", async () => {
    const img = fakeImg([]);
    swapArt(img, ["a.png", "b.png"]);

    await vi.waitFor(() => expect(isHidden(img)).toBe(true));
    expect(isPending(img)).toBe(false);
  });

  it("never lets a superseded swap paint over the newer one", async () => {
    const img = fakeImg(["village.png", "camp.png"]);

    // Village announcement starts loading, player clicks straight to the camp one.
    swapArt(img, ["village.png"]);
    swapArt(img, ["camp.png"]);

    await vi.waitFor(() => expect(isPending(img)).toBe(false));
    expect(img.src).toBe("camp.png");

    // Give the superseded swap every chance to clobber it.
    await Promise.resolve();
    await Promise.resolve();
    expect(img.src).toBe("camp.png");
  });

  it("clearArt cancels a swap in flight rather than letting it appear later", async () => {
    const img = fakeImg(["village.png"]);
    swapArt(img, ["village.png"]);
    clearArt(img);

    await Promise.resolve();
    await Promise.resolve();
    expect(isHidden(img)).toBe(true);
    expect(isPending(img)).toBe(false);
  });
});
