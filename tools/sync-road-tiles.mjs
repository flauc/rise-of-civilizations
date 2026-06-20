// Copies the purchased road artwork into the client's public folder, re-keyed by
// OUR runtime direction convention so the renderer can look a road tile up
// directly by its connection mask.
//
// Each asset is named by a 6-bit edge string. Asset bit `b` (LSB = value 1)
// corresponds to our neighbour direction d = (b + 3) % 6, where directions follow
// HEX_DIRECTIONS in @roc/shared (0=E, 1=NE, 2=NW, 3=W, 4=SW, 5=SE) — the same
// mapping used by sync-river-tiles.mjs. Each painted road reaches the MIDPOINT of
// the marked edges, so two adjacent road tiles join seamlessly when each carries
// the bit toward the other.
//
// Output (bit d of <mask> = road crosses the edge toward neighbour direction d):
//   roads/road_<mask>_<v>.png         road segment for a connection mask (1..63)
//   roads/road_bridge_<mask>_<v>.png  straight road carried over a river on a
//                                     bridge (only the 3 straight-through masks:
//                                     9 = E–W, 18 = NE–SW, 36 = NW–SE)
//
// Run from the repo root:  node tools/sync-road-tiles.mjs

import { readdirSync, mkdirSync, copyFileSync, rmSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const ROADS = join(
  root,
  "assets/purchased/Hex Medieval Fantasy Locations 1.3.4/Hex Medieval Fantasy Locations 1.3.4/Roads",
);
const OUT = join(root, "packages/client/public/roads");

/** asset 6-bit mask (LSB = value 1) -> our direction mask (bit d = connection toward dir d). */
function assetMaskToDirMask(assetMask) {
  let dir = 0;
  for (let b = 0; b < 6; b++) {
    if (assetMask & (1 << b)) dir |= 1 << ((b + 3) % 6);
  }
  return dir;
}

if (existsSync(OUT)) rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const counts = { road: 0, bridge: 0 };

const reBridge = /^hexRoadBridge-([01]{6})-(\d+)\.png$/;
const reRoad = /^hexRoad-([01]{6})-(\d+)\.png$/;
for (const file of readdirSync(ROADS)) {
  let m = reBridge.exec(file);
  if (m) {
    const dir = assetMaskToDirMask(parseInt(m[1], 2));
    copyFileSync(join(ROADS, file), join(OUT, `road_bridge_${dir}_${parseInt(m[2], 10)}.png`));
    counts.bridge++;
    continue;
  }
  m = reRoad.exec(file);
  if (m) {
    const dir = assetMaskToDirMask(parseInt(m[1], 2));
    copyFileSync(join(ROADS, file), join(OUT, `road_${dir}_${parseInt(m[2], 10)}.png`));
    counts.road++;
  }
}

console.log(`roads: ${counts.road}, bridges: ${counts.bridge} -> ${OUT}`);
