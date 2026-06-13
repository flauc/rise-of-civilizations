// Tiny fractal value-noise built on the shared seeded RNG. Good enough to grow
// believable continents for M0; the geodata baker (tools/) is the alternative
// map source. Deterministic for a given seed.

import type { Rng } from "@roc/shared";

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

export interface Noise2D {
  (x: number, y: number): number; // returns [0, 1]
}

/**
 * Build a fractal value-noise sampler over a wrapping lattice.
 * @param rng     seeded RNG (lattice values drawn from it)
 * @param size    lattice resolution (wraps modulo size)
 * @param octaves number of summed frequency bands
 */
export function makeValueNoise(rng: Rng, size = 64, octaves = 4): Noise2D {
  const lattice = new Float32Array(size * size);
  for (let i = 0; i < lattice.length; i++) lattice[i] = rng.next();

  const at = (xi: number, yi: number): number => {
    const xm = ((xi % size) + size) % size;
    const ym = ((yi % size) + size) % size;
    return lattice[ym * size + xm]!;
  };

  const sample = (x: number, y: number): number => {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const tx = smoothstep(x - x0);
    const ty = smoothstep(y - y0);
    const v00 = at(x0, y0);
    const v10 = at(x0 + 1, y0);
    const v01 = at(x0, y0 + 1);
    const v11 = at(x0 + 1, y0 + 1);
    const top = v00 + (v10 - v00) * tx;
    const bot = v01 + (v11 - v01) * tx;
    return top + (bot - top) * ty;
  };

  return (x: number, y: number): number => {
    let total = 0;
    let amplitude = 1;
    let frequency = 1;
    let max = 0;
    for (let o = 0; o < octaves; o++) {
      total += sample(x * frequency, y * frequency) * amplitude;
      max += amplitude;
      amplitude *= 0.5;
      frequency *= 2;
    }
    return total / max;
  };
}
