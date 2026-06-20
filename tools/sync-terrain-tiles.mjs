// Copies the purchased painted terrain tiles into the client's public folder as
// the per-terrain variant atlas the renderer expects (`<terrain>.png`,
// `<terrain>_1.png`, …). Each purchased biome ships 4 painted variations
// (…00–…03); some game terrains pull from two biomes for extra variety.
//
// Water is split three ways to read as distinct bodies of water:
//   - lake  -> hexLake      (calm turquoise inland water)
//   - coast -> hexOceanCalm (gentle shallow coastal sea)
//   - ocean -> hexOcean     (deep choppy open sea with whitecaps)
//
// The tropical jungle band (jungle/wetlands/bog) is painted from the Tropics &
// Wetlands pack, and the polar band (snow/tundra/taiga) from the Cold Lands pack,
// so each frozen or steamy region reads as a mix of distinct, differently-yielding
// tiles. Terrains with no good match in any pack (mesa, volcano) are left untouched
// so their existing art is kept.
//
// Run from the repo root:  node tools/sync-terrain-tiles.mjs

import { readdirSync, mkdirSync, copyFileSync, rmSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASIC = join(root, "assets/purchased/Hex Terrain Basic 1.3.0/Hex Terrain Basic 1.3.0/Tiles");
const SEAS = join(root, "assets/purchased/Hex Rivers Coasts Seas 1.0.1/Hex Rivers Coasts Seas 1.0.1/Tiles");
const TROPICS = join(root, "assets/purchased/Hex Tropics Wetlands 1.1.0/Hex Tropics Wetlands 1.1.0/Tiles");
const COLD = join(root, "assets/purchased/Hex Cold Lands 1.1/Hex Cold Lands 1.1/Tiles");
const OUT = join(root, "packages/client/public/hex-terrain");

// game terrain -> ordered list of [sourceDir, tilePrefix]; each prefix has 00–03.
const MAP = {
  grassland: [[BASIC, "hexPlains"]], // lush green meadow
  plains: [[BASIC, "hexScrublands"]], // golden dry grass
  desert: [[BASIC, "hexDesertDunes"]],
  forest: [[BASIC, "hexForestBroadleaf"]], // dense forest (+1 science)
  woods: [[BASIC, "hexWoodlands"]], // lighter open woodland
  hills: [[BASIC, "hexHills"], [BASIC, "hexHighlands"]],
  mountains: [[BASIC, "hexMountain"]],
  ocean: [[BASIC, "hexOcean"]],
  coast: [[SEAS, "hexOceanCalm"]],
  lake: [[SEAS, "hexLake"]],
  // Tropical band — distinct wet biomes.
  jungle: [[TROPICS, "hexJungle"]], // dense biodiverse jungle (food/prod/science)
  wetlands: [[TROPICS, "hexWetlands"], [TROPICS, "hexSwamp"]], // fertile flooded marsh (food)
  bog: [[TROPICS, "hexBog"]], // murky peat bog (faith)
  // Polar band — distinct frozen biomes.
  snow: [[COLD, "hexSnowField"]], // barren ice sheet (0 yield)
  tundra: [[COLD, "hexPlainsColdSnowCovered"], [COLD, "hexPlainsColdSnowTransition"]], // frozen steppe (food/science)
  taiga: [[COLD, "hexForestPineSnowCovered"], [COLD, "hexForestPineSnowTransition"]], // snowy boreal forest (production)
};

// Terrains that KEEP their existing base tile and only gain extra variants from
// the pack (copied as `<terrain>_1.png`…). The base `<terrain>.png` is untouched.
const APPEND = {};

mkdirSync(OUT, { recursive: true });

function gatherSources(sources) {
  const files = [];
  for (const [dir, prefix] of sources) {
    for (let i = 0; i < 4; i++) {
      const p = join(dir, `${prefix}0${i}.png`);
      if (existsSync(p)) files.push(p);
    }
  }
  return files;
}

let total = 0;
for (const [terrain, sources] of Object.entries(MAP)) {
  // Remove any existing variants for this terrain so stale art can't linger.
  for (const f of readdirSync(OUT)) {
    if (f === `${terrain}.png` || f.startsWith(`${terrain}_`)) rmSync(join(OUT, f));
  }
  gatherSources(sources).forEach((src, idx) => {
    copyFileSync(src, join(OUT, idx === 0 ? `${terrain}.png` : `${terrain}_${idx}.png`));
    total++;
  });
  console.log(`${terrain}: ${gatherSources(sources).length} variants`);
}

for (const [terrain, sources] of Object.entries(APPEND)) {
  // Keep the existing base `<terrain>.png`; only refresh the numbered variants.
  for (const f of readdirSync(OUT)) {
    if (f.startsWith(`${terrain}_`)) rmSync(join(OUT, f));
  }
  gatherSources(sources).forEach((src, i) => {
    copyFileSync(src, join(OUT, `${terrain}_${i + 1}.png`));
    total++;
  });
  console.log(`${terrain}: base + ${gatherSources(sources).length} appended variants`);
}

console.log(`\nCopied ${total} terrain tiles -> ${OUT}`);
