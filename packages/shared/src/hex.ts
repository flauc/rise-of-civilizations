// Hex grid math. Pointy-top hexes, axial coordinates (q, r), with odd-r offset
// helpers for rectangular map storage. Conventions follow Red Blob Games.
//
// This module is pure (no DOM/Node) so the client renderer, the sim, the server,
// and tools all share one source of truth for geometry.

export interface Axial {
  readonly q: number;
  readonly r: number;
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** The six neighbor directions in axial space (pointy-top). */
export const HEX_DIRECTIONS: readonly Axial[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

export function axial(q: number, r: number): Axial {
  return { q, r };
}

export function axialAdd(a: Axial, b: Axial): Axial {
  return { q: a.q + b.q, r: a.r + b.r };
}

export function axialEquals(a: Axial, b: Axial): boolean {
  return a.q === b.q && a.r === b.r;
}

/** Neighbor in one of the six directions (0..5). */
export function axialNeighbor(h: Axial, direction: number): Axial {
  const dir = HEX_DIRECTIONS[((direction % 6) + 6) % 6]!;
  return axialAdd(h, dir);
}

export function axialNeighbors(h: Axial): Axial[] {
  return HEX_DIRECTIONS.map((d) => axialAdd(h, d));
}

/** Distance in hex steps between two axial coordinates. */
export function axialDistance(a: Axial, b: Axial): number {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dq + dr) + Math.abs(dr)) / 2;
}

/** Stable string key for using a hex in a Set/Map. */
export function hexKey(h: Axial): string {
  return `${h.q},${h.r}`;
}

// ---- pixel conversions (pointy-top) --------------------------------------

const SQRT3 = Math.sqrt(3);

/** Axial hex -> pixel center, given a hex size (center-to-corner radius). */
export function axialToPixel(h: Axial, size: number): Point {
  return {
    x: size * (SQRT3 * h.q + (SQRT3 / 2) * h.r),
    y: size * (1.5 * h.r),
  };
}

/** Pixel -> fractional axial; pair with axialRound for the containing hex. */
export function pixelToAxial(p: Point, size: number): Axial {
  return {
    q: ((SQRT3 / 3) * p.x - (1 / 3) * p.y) / size,
    r: ((2 / 3) * p.y) / size,
  };
}

/** Round fractional axial coords to the nearest hex (via cube rounding). */
export function axialRound(h: Axial): Axial {
  const x = h.q;
  const z = h.r;
  const y = -x - z;
  let rx = Math.round(x);
  let ry = Math.round(y);
  let rz = Math.round(z);
  const dx = Math.abs(rx - x);
  const dy = Math.abs(ry - y);
  const dz = Math.abs(rz - z);
  if (dx > dy && dx > dz) {
    rx = -ry - rz;
  } else if (dy > dz) {
    ry = -rx - rz;
  } else {
    rz = -rx - ry;
  }
  return { q: rx, r: rz };
}

/** The six corner points of a hex centered at `center`, pointy-top. */
export function hexCorners(center: Point, size: number): Point[] {
  const corners: Point[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 30);
    corners.push({
      x: center.x + size * Math.cos(angle),
      y: center.y + size * Math.sin(angle),
    });
  }
  return corners;
}

// ---- odd-r offset <-> axial (for rectangular map storage) ----------------

export interface Offset {
  readonly col: number;
  readonly row: number;
}

export function offsetToAxial(o: Offset): Axial {
  const q = o.col - (o.row - (o.row & 1)) / 2;
  return { q, r: o.row };
}

export function axialToOffset(h: Axial): Offset {
  const col = h.q + (h.r - (h.r & 1)) / 2;
  return { col, row: h.r };
}
