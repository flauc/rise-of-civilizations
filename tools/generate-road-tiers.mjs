// Derives the Paved (tier 2) and Imperial (tier 3) road overlays from the tier-1
// "dirt" road art already in public/roads, by recolouring it with ImageMagick:
// the warm earthen track is desaturated toward packed stone (paved) and pale
// dressed stone (imperial), matching the procedural roadStyle() palette in the
// renderer. The alpha (transparent tile footprint) is preserved untouched.
//
// Source (tier 1, shipped by sync-road-tiles.mjs):
//   roads/road_<mask>_<v>.png            roads/road_bridge_<mask>_<v>.png
// Output (generated here):
//   roads/road2_<mask>_<v>.png           roads/road2_bridge_<mask>_<v>.png   (paved)
//   roads/road3_<mask>_<v>.png           roads/road3_bridge_<mask>_<v>.png   (imperial)
//
// Requires ImageMagick 7 (`magick`) on PATH.
// Run from the repo root:  node tools/generate-road-tiers.mjs

import { readdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const ROADS = join(root, "packages/client/public/roads");

// Recolour recipes per tier. `-modulate brightness,saturation,hue` (percent, 100 = no change):
// drop saturation to leach out the brown, and lift brightness toward stone. Paved keeps a
// little warmth; Imperial is lighter and a touch cooler (hue 102) to read as dressed stone.
const TIERS = [
  { prefix: "road2", modulate: "110,42,100" }, // Paved  — packed stone
  { prefix: "road3", modulate: "140,26,102" }, // Imperial — pale dressed stone
];

if (!existsSync(ROADS)) {
  console.error(`missing ${ROADS} — run tools/sync-road-tiles.mjs first`);
  process.exit(1);
}

// Only tier-1 sources: road_<mask>_<v>.png and road_bridge_<mask>_<v>.png (never the
// road2_/road3_ files this tool emits, so re-running is idempotent).
const reSrc = /^road(_bridge)?_(\d+)_(\d+)\.png$/;
let made = 0;
for (const file of readdirSync(ROADS)) {
  const m = reSrc.exec(file);
  if (!m) continue;
  const bridge = m[1] ?? ""; // "_bridge" or ""
  const mask = m[2];
  const v = m[3];
  for (const tier of TIERS) {
    const out = `${tier.prefix}${bridge}_${mask}_${v}.png`;
    execFileSync("magick", [join(ROADS, file), "-modulate", tier.modulate, join(ROADS, out)]);
    made++;
  }
}

console.log(`generated ${made} tiered road overlays -> ${ROADS}`);
