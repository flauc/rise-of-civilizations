// Proof of concept for PLAN.md §3.1.1 — bake real-world geodata into our hex map format.
//
// Pipeline:
//   1. Fetch Natural Earth land polygons (world-atlas TopoJSON, public domain) from the CDN.
//   2. Convert TopoJSON -> GeoJSON (topojson-client).
//   3. Lay a pointy-top hex grid over an equirectangular world.
//   4. For each hex center (lon/lat), test land vs ocean with d3.geoContains.
//   5. Assign a placeholder terrain by latitude band (the real pipeline samples a DEM/biome here).
//   6. Emit (a) an ASCII preview to the console and (b) a compact baked map JSON.
//
// This is BUILD-TIME tooling. d3/topojson and the GeoJSON never ship to the game client —
// only the small baked JSON does. Run: `npm run bake` (optionally `-- --cols=120`).

import { geoContains } from "d3-geo";
import { feature } from "topojson-client";
import { writeFileSync } from "node:fs";

// ---- options -------------------------------------------------------------
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)=(.*)$/);
    return m ? [m[1], m[2]] : [a.replace(/^--/, ""), true];
  })
);
const COLS = Number(args.cols ?? 100); // hex columns across the globe
const RES = String(args.res ?? "110m"); // 110m | 50m | 10m (Natural Earth scale)
const OUT = String(args.out ?? "world.hexmap.json");
const SRC = `https://cdn.jsdelivr.net/npm/world-atlas@2/land-${RES}.json`;

// Equirectangular world spans 360° lon x 180° lat. For pointy-top hexes the
// vertical row spacing is sqrt(3)/2 of the horizontal spacing.
const lonStep = 360 / COLS;
const rowStep = lonStep * (Math.sqrt(3) / 2);
const ROWS = Math.max(1, Math.round(180 / rowStep));

// ---- terrain placeholder (real pipeline: sample DEM + Köppen here) --------
function classifyTerrain(lat) {
  const a = Math.abs(lat);
  if (a >= 66) return "snow"; // polar
  if (a >= 55) return "tundra"; // boreal
  if (a >= 35) return "grassland"; // temperate
  if (a >= 23.5) return a >= 28 ? "desert" : "plains"; // subtropical-ish
  return "jungle"; // tropical
}

// short glyphs for the ASCII preview
const GLYPH = {
  ocean: "~",
  snow: "*",
  tundra: ":",
  grassland: "\"",
  desert: ".",
  plains: ",",
  jungle: "#",
};

// ---- main ----------------------------------------------------------------
console.log(`Fetching Natural Earth land (${RES}) from:\n  ${SRC}`);
const res = await fetch(SRC);
if (!res.ok) throw new Error(`fetch failed: ${res.status} ${res.statusText}`);
const topo = await res.json();
const landKey = topo.objects.land ? "land" : Object.keys(topo.objects)[0];
const land = feature(topo, topo.objects[landKey]); // GeoJSON FeatureCollection

console.log(`Baking ${COLS} x ${ROWS} hex grid (${COLS * ROWS} hexes)...`);

const tiles = [];
const grid = []; // rows of terrain keys, for preview
let landCount = 0;

for (let row = 0; row < ROWS; row++) {
  const lat = 90 - (row + 0.5) * (180 / ROWS);
  const offset = row % 2 ? 0.5 : 0; // odd rows shift half a hex (offset coords)
  const line = [];
  for (let col = 0; col < COLS; col++) {
    const lon = -180 + (col + 0.5 + offset) * lonStep;
    const wrappedLon = ((lon + 180) % 360) - 180; // keep in [-180,180)
    const isLand = geoContains(land, [wrappedLon, lat]);
    const terrain = isLand ? classifyTerrain(lat) : "ocean";
    if (isLand) landCount++;
    line.push(terrain);
    tiles.push({ q: col, r: row, terrain }); // axial-ish; refine in real tool
  }
  grid.push(line);
}

// ---- ASCII preview -------------------------------------------------------
console.log("\nLand/ocean preview (terrain glyphs):\n");
for (let row = 0; row < ROWS; row++) {
  const pad = row % 2 ? " " : ""; // visual hex offset
  console.log(pad + grid[row].map((t) => GLYPH[t] ?? "?").join(""));
}

// ---- baked output (the only artifact the game would consume) -------------
const baked = {
  format: "rise-hexmap@0",
  source: `natural-earth/world-atlas land-${RES}`,
  license: "public-domain",
  layout: "pointy-top-offset",
  cols: COLS,
  rows: ROWS,
  tiles, // [{ q, r, terrain }]
};
writeFileSync(OUT, JSON.stringify(baked));
const pct = ((landCount / (COLS * ROWS)) * 100).toFixed(1);
console.log(
  `\nDone. ${landCount}/${COLS * ROWS} land hexes (${pct}%). Wrote ${OUT} (${(
    JSON.stringify(baked).length / 1024
  ).toFixed(1)} KB).`
);
