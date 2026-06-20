// Real-world land mask, baked from public-domain Natural Earth land polygons by
// tools/geodata-poc (see PLAN.md §3.1.1). One bit per hex (1 = land, 0 = ocean),
// row-major in odd-r offset coords, bit-packed and base64-encoded so the whole
// recognizable Earth shape ships in ~1 KB instead of the 240 KB raw hexmap.
//
// worldgen.ts samples this when the "Real World" map type is chosen and then
// regenerates elevation/biomes procedurally on top of the real continent shape,
// so the continents are recognizable but the terrain still varies by run.

export const WORLD_MASK_COLS = 110;
export const WORLD_MASK_ROWS = 64;

// prettier-ignore
const WORLD_MASK_B64 =
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHzgDwAAAAAAAAAAAAD49/8HwAEAYAAAAAAABHD8/wEIAABAAAAAAAAADvg/AABggD8AAAAAoJcP/A8AAAj9/8sBwP9f0A7+AMAP+P///+/3//8fiw8E+PP/////P/n//4XhAID7//////8H/v8/OCAA4PX/////IwAD/w8+AIAw/////wcDAID/vx8AQOD/////gAEA4P//BwDY//////8QAADw/z8GAPz/////fwAAAPj/PwAA//f+//8HAAAA/v8DAND1uP///wQAAID/PwAAHP7v//+PAAAA4P8PAACH+vv/fyIAAADw/wEAgA/5//+fBgAAAPg/AADwL/z//w8AAAAA/ggAAP7/9///AwAAAAAfBACA/9/7//8AAAAAAAcAAPD/9+P/LwAAAACAiQAA/P/78fsAAAAAAODDAAD//z44HgIAAAAAgAEAwP9/BwQOAAAAAABAAAD4/z+AgSMAAAAAACAPAPj/P0CAEAAAAAAA4AcA/v8PAAAEAAAAAAD4BwDA/wMARQAAAAAAAP8BAPg/AICcAAAAAADA/wEA/A8AQI4AAAAAAPD/AQD/AQAQwAEAAAAA+P8AgH8AABjgAAAAAAD+PwDgHwAAQAACAAAAAP8HAPgHAACABQAAAADA/wEA/wkAADiBAAAAAOB/AIA/AwAA/wAAAAAA+A8A4EcAAPA/AAAAAAD+AQD4MwAA/B8AAAAAgD8AAH4AAID/BwAAAADgDwAAHwAAwP8DAAAAAPgBAMABAABwfgAAAAAAHgAAAAAAAAAeAAAAAMAHAAAAAAAAgAMEAAAA8AAAAAAAAAAAAAEAAAAcAAAAAAAAAAAQAAAAAAMAAAAAAAAAAAQAAADgAAAAAAAAAAAAAAAAADABAAAAAAAAAAAAAAAAGAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAAAAAAgAAAAAAAAAABgAAAPKP//8/AAAAAMADAP7///3///8BAP7x/wDA////////PwD///8DgP////////8HAPz//5DD/////////wDA//////////////9/8P///////////////////////////////////w==";

const B64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** Pure base64 → bytes (no dependency on atob/Buffer, so sim stays portable). */
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

let packed: Uint8Array | null = null;
function maskBits(): Uint8Array {
  if (!packed) packed = decodeBase64(WORLD_MASK_B64);
  return packed;
}

/**
 * Whether the real-world Earth map has land at the given tile of a `cols`×`rows`
 * grid. The baked mask is sampled (nearest-neighbour) so any map size still
 * yields recognizable continents — bigger maps are crisper, smaller ones blockier.
 */
export function isWorldLand(col: number, row: number, cols: number, rows: number): boolean {
  const bits = maskBits();
  const mc = cols <= 1 ? 0 : Math.round((col / (cols - 1)) * (WORLD_MASK_COLS - 1));
  const mr = rows <= 1 ? 0 : Math.round((row / (rows - 1)) * (WORLD_MASK_ROWS - 1));
  const i = mr * WORLD_MASK_COLS + mc;
  return (bits[i >> 3]! & (1 << (i & 7))) !== 0;
}
