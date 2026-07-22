// Shared bit-packed regional land mask (Natural Earth via bake-regional-mask.mjs).

const B64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function decodeBase64(s: string): Uint8Array {
  const lookup = new Int16Array(256).fill(-1);
  for (let i = 0; i < B64_ALPHABET.length; i++) lookup[B64_ALPHABET.charCodeAt(i)] = i;
  let len = s.length;
  while (len > 0 && s[len - 1] === "=") len--;
  const out = new Uint8Array((len * 3) >> 2);
  let bits = 0;
  let nbits = 0;
  let oi = 0;
  for (let i = 0; i < len; i++) {
    const v = lookup[s.charCodeAt(i)]!;
    if (v < 0) continue;
    bits = (bits << 6) | v;
    nbits += 6;
    if (nbits >= 8) {
      nbits -= 8;
      out[oi++] = (bits >> nbits) & 0xff;
    }
  }
  return out;
}

export interface RegionalMaskDef {
  lonMin: number;
  lonMax: number;
  latMin: number;
  latMax: number;
  maskCols: number;
  maskRows: number;
  maskB64: string;
}

export interface RegionalMask {
  lonMin: number;
  lonMax: number;
  latMin: number;
  latMax: number;
  maskCols: number;
  maskRows: number;
  isLand(col: number, row: number, cols: number, rows: number): boolean;
  tileLatLon(col: number, row: number, cols: number, rows: number): { lat: number; lon: number };
}

/** Build a resampled land mask + lat/lon mapper for a geographic viewport. */
export function createRegionalMask(def: RegionalMaskDef): RegionalMask {
  let packed: Uint8Array | null = null;
  const maskBits = (): Uint8Array => {
    if (!packed) packed = decodeBase64(def.maskB64);
    return packed;
  };
  return {
    lonMin: def.lonMin,
    lonMax: def.lonMax,
    latMin: def.latMin,
    latMax: def.latMax,
    maskCols: def.maskCols,
    maskRows: def.maskRows,
    isLand(col: number, row: number, cols: number, rows: number): boolean {
      const bits = maskBits();
      const mc = cols <= 1 ? 0 : Math.round((col / (cols - 1)) * (def.maskCols - 1));
      const mr = rows <= 1 ? 0 : Math.round((row / (rows - 1)) * (def.maskRows - 1));
      const i = mr * def.maskCols + mc;
      return (bits[i >> 3]! & (1 << (i & 7))) !== 0;
    },
    tileLatLon(col: number, row: number, cols: number, rows: number): { lat: number; lon: number } {
      const mc = cols <= 1 ? 0 : (col / (cols - 1)) * (def.maskCols - 1);
      const mr = rows <= 1 ? 0 : (row / (rows - 1)) * (def.maskRows - 1);
      const lat = def.latMax - (mr + 0.5) * ((def.latMax - def.latMin) / def.maskRows);
      const lon = def.lonMin + (mc + 0.5) * ((def.lonMax - def.lonMin) / def.maskCols);
      return { lat, lon };
    },
  };
}
