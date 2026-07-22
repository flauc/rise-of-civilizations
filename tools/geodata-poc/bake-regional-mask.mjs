// Bake a cropped real-world land mask for a regional map preset (bit-packed base64).
//
// Usage:
//   node bake-regional-mask.mjs --preset=mediterranean
//   node bake-regional-mask.mjs --lonMin=-10 --lonMax=42 --latMin=24 --latMax=56 --cols=96 --rows=64
//
// Requires: npm install in tools/geodata-poc

import { geoContains } from "d3-geo";
import { feature } from "topojson-client";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PRESETS = {
  /** Roman Empire heartland circa 384 CE (Theodosian): Britain to Euphrates, Sahara to Caledonia. */
  mediterranean: {
    lonMin: -10,
    lonMax: 42,
    latMin: 24,
    latMax: 56,
    cols: 96,
    rows: 64,
  },
  /** Continental Europe, British Isles, and Scandinavia (Urals fringe west). */
  europe: {
    lonMin: -25,
    lonMax: 40,
    latMin: 35,
    latMax: 71,
    cols: 104,
    rows: 60,
  },
  /** Africa south of the Mediterranean through the Cape. */
  africa: {
    lonMin: -18,
    lonMax: 52,
    latMin: -35,
    latMax: 37,
    cols: 98,
    rows: 96,
  },
  /** From the Levant and India to Japan and Siberia. */
  asia: {
    lonMin: 25,
    lonMax: 145,
    latMin: -10,
    latMax: 55,
    cols: 120,
    rows: 72,
  },
  /** Alaska through Central America (avoids the dateline). */
  north_america: {
    lonMin: -168,
    lonMax: -52,
    latMin: 12,
    latMax: 72,
    cols: 116,
    rows: 64,
  },
  /** Andes, Amazon, and the Southern Cone. */
  south_america: {
    lonMin: -82,
    lonMax: -34,
    latMin: -56,
    latMax: 13,
    cols: 72,
    rows: 104,
  },
};

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)=(.*)$/);
    return m ? [m[1], m[2]] : [a.replace(/^--/, ""), true];
  }),
);

const preset = args.preset ? PRESETS[String(args.preset)] : null;
if (args.preset && !preset) {
  console.error(`Unknown preset: ${args.preset}. Known: ${Object.keys(PRESETS).join(", ")}`);
  process.exit(1);
}

const lonMin = Number(args.lonMin ?? preset?.lonMin);
const lonMax = Number(args.lonMax ?? preset?.lonMax);
const latMin = Number(args.latMin ?? preset?.latMin);
const latMax = Number(args.latMax ?? preset?.latMax);
const COLS = Number(args.cols ?? preset?.cols ?? 96);
const ROWS = Number(args.rows ?? preset?.rows ?? 64);
const RES = String(args.res ?? "50m");
const OUT = String(args.out ?? `${args.preset ?? "region"}.mask.json`);
const SRC = `https://cdn.jsdelivr.net/npm/world-atlas@2/land-${RES}.json`;

function encodeBits(bits) {
  const byteLen = Math.ceil(bits.length / 8);
  const out = new Uint8Array(byteLen);
  for (let i = 0; i < bits.length; i++) {
    if (bits[i]) out[i >> 3] |= 1 << (i & 7);
  }
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let b64 = "";
  for (let i = 0; i < out.length; i += 3) {
    const a = out[i] ?? 0;
    const b = out[i + 1] ?? 0;
    const c = out[i + 2] ?? 0;
    const n = (a << 16) | (b << 8) | c;
    b64 += alphabet[(n >> 18) & 63];
    b64 += alphabet[(n >> 12) & 63];
    b64 += i + 1 < out.length ? alphabet[(n >> 6) & 63] : "=";
    b64 += i + 2 < out.length ? alphabet[n & 63] : "=";
  }
  return b64;
}

console.log(`Fetching Natural Earth land (${RES})…`);
const res = await fetch(SRC);
if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
const topo = await res.json();
const landKey = topo.objects.land ? "land" : Object.keys(topo.objects)[0];
const land = feature(topo, topo.objects[landKey]);

console.log(`Baking ${COLS}×${ROWS} mask for lon [${lonMin}, ${lonMax}], lat [${latMin}, ${latMax}]…`);

const bits = [];
const grid = [];
let landCount = 0;

for (let row = 0; row < ROWS; row++) {
  const lat = latMax - (row + 0.5) * ((latMax - latMin) / ROWS);
  const line = [];
  const offset = row % 2 ? 0.5 : 0;
  for (let col = 0; col < COLS; col++) {
    const lon = lonMin + (col + 0.5 + offset) * ((lonMax - lonMin) / COLS);
    const isLand = geoContains(land, [lon, lat]);
    bits.push(isLand ? 1 : 0);
    if (isLand) landCount++;
    line.push(isLand ? "#" : "~");
  }
  grid.push(line);
}

console.log("\nPreview (~ land, # coast/inland):\n");
for (const line of grid) {
  console.log(line.join(""));
}

const b64 = encodeBits(bits);
const pct = ((landCount / (COLS * ROWS)) * 100).toFixed(1);
const meta = {
  preset: args.preset ?? "custom",
  lonMin,
  lonMax,
  latMin,
  latMax,
  cols: COLS,
  rows: ROWS,
  landCount,
  landPct: pct,
  source: `natural-earth/world-atlas land-${RES}`,
  b64,
};

const outPath = join(dirname(fileURLToPath(import.meta.url)), OUT);
writeFileSync(outPath, JSON.stringify(meta, null, 2));
console.log(`\n${landCount}/${COLS * ROWS} land (${pct}%). Wrote ${outPath}`);
console.log(`\nBase64 length: ${b64.length} chars`);
