// Copies the purchased "Hex Rivers Coasts Seas" coast tiles into the client's
// public folder, re-keyed by OUR runtime convention so the renderer can look a
// tile up directly by its land-neighbour mask.
//
// The asset names each coastline by a 6-bit string `hexCoast<bbbbbb>-<vv>.png`.
// Empirically (verified by eye against the painted shorelines), the rightmost
// bit is value 1 and each asset bit `b` (LSB = 0) corresponds to the painted hex
// EDGE facing our neighbour direction d = (b + 3) % 6, where directions follow
// HEX_DIRECTIONS in @roc/shared (0=E, 1=NE, 2=NW, 3=W, 4=SW, 5=SE).
//
// We rewrite each file to `coasts/coast_<dirMask>_<variant>.png`, where bit d of
// dirMask is set when the neighbour in direction d is LAND. That makes the
// renderer lookup a trivial `coast_${landMask}_${variant}` with no bit juggling.
//
// Run from the repo root:  node tools/sync-coast-tiles.mjs

import { readdirSync, mkdirSync, copyFileSync, rmSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(
  root,
  "assets/purchased/Hex Rivers Coasts Seas 1.0.1/Hex Rivers Coasts Seas 1.0.1/Coasts",
);
const OUT = join(root, "packages/client/public/hex-terrain/coasts");

/** asset 6-bit mask (LSB = value 1) -> our direction mask (bit d = land in dir d). */
function assetMaskToDirMask(assetMask) {
  let dir = 0;
  for (let b = 0; b < 6; b++) {
    if (assetMask & (1 << b)) dir |= 1 << ((b + 3) % 6);
  }
  return dir;
}

if (existsSync(OUT)) rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const re = /^hexCoast([01]{6})-(\d+)\.png$/;
let copied = 0;
for (const file of readdirSync(SRC)) {
  const m = re.exec(file);
  if (!m) continue;
  const assetMask = parseInt(m[1], 2); // m[1][0] is the most-significant bit (value 32)
  const variant = parseInt(m[2], 10);
  const dirMask = assetMaskToDirMask(assetMask);
  copyFileSync(join(SRC, file), join(OUT, `coast_${dirMask}_${variant}.png`));
  copied++;
}

console.log(`Copied ${copied} coast tiles -> ${OUT}`);
