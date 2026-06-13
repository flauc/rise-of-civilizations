// Seeded, deterministic pseudo-random number generator. All game randomness must
// flow through this so that a given seed + the same orders reproduce exactly —
// critical for server authority, replays, and validating the geodata baker.

export interface Rng {
  /** float in [0, 1). */
  next(): number;
  /** integer in [min, max] inclusive. */
  int(min: number, max: number): number;
  /** float in [min, max). */
  range(min: number, max: number): number;
  /** pick a random element (undefined for an empty array). */
  pick<T>(items: readonly T[]): T | undefined;
}

/** Hash an arbitrary string seed into a 32-bit integer (for human-friendly seeds). */
export function hashSeed(seed: string): number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}

/** mulberry32 — small, fast, good-enough PRNG for game use. */
export function makeRng(seed: number | string): Rng {
  let state = (typeof seed === "string" ? hashSeed(seed) : seed) >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    range: (min, max) => min + next() * (max - min),
    pick: (items) =>
      items.length === 0 ? undefined : items[Math.floor(next() * items.length)],
  };
}
