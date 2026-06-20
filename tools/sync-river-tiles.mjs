// Copies the purchased river artwork into the client's public folder, re-keyed by
// OUR runtime direction convention so the renderer can look a tile up directly by
// its river-connection mask.
//
// Like the coast tiles, each asset is named by a 6-bit edge string. Asset bit `b`
// (LSB = value 1) corresponds to our neighbour direction d = (b + 3) % 6, where
// directions follow HEX_DIRECTIONS in @roc/shared (0=E, 1=NE, 2=NW, 3=W, 4=SW,
// 5=SE). Each painted channel reaches the MIDPOINT of the marked edges, so two
// adjacent river tiles join seamlessly when each carries the bit toward the other.
//
// Output (bit d of <mask> = river crosses the edge toward neighbour direction d):
//   coasts/… (separate script)
//   rivers/river_<mask>_<v>.png       full overland channel (mask 0..63)
//   rivers/river_mouth_<mask>_<v>.png river fanning into the sea (single-bit mask)
//   rivers/river_lake_<mask>_<v>.png  spring/terminal lake at a river end (single-bit)
//
// Run from the repo root:  node tools/sync-river-tiles.mjs

import { readdirSync, mkdirSync, copyFileSync, rmSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SET = join(root, "assets/purchased/Hex Rivers Coasts Seas 1.0.1/Hex Rivers Coasts Seas 1.0.1");
const RIVERS = join(SET, "Rivers");
const MOUTHS = join(SET, "River Mouths");
const OUT = join(root, "packages/client/public/hex-terrain/rivers");

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

const counts = { river: 0, lake: 0, mouth: 0 };

// Rivers folder holds both `hexRiver…` channels and `hexRiverLakeEnd…` ponds.
const reLake = /^hexRiverLakeEnd([01]{6})-(\d+)\.png$/;
const reRiver = /^hexRiver([01]{6})-(\d+)\.png$/;
for (const file of readdirSync(RIVERS)) {
  let m = reLake.exec(file);
  if (m) {
    const dir = assetMaskToDirMask(parseInt(m[1], 2));
    copyFileSync(join(RIVERS, file), join(OUT, `river_lake_${dir}_${parseInt(m[2], 10)}.png`));
    counts.lake++;
    continue;
  }
  m = reRiver.exec(file);
  if (m) {
    const dir = assetMaskToDirMask(parseInt(m[1], 2));
    copyFileSync(join(RIVERS, file), join(OUT, `river_${dir}_${parseInt(m[2], 10)}.png`));
    counts.river++;
  }
}

const reMouth = /^hexRiverMouth([01]{6})-(\d+)\.png$/;
for (const file of readdirSync(MOUTHS)) {
  const m = reMouth.exec(file);
  if (!m) continue;
  const dir = assetMaskToDirMask(parseInt(m[1], 2));
  copyFileSync(join(MOUTHS, file), join(OUT, `river_mouth_${dir}_${parseInt(m[2], 10)}.png`));
  counts.mouth++;
}

console.log(`rivers: ${counts.river}, lake-ends: ${counts.lake}, mouths: ${counts.mouth} -> ${OUT}`);
