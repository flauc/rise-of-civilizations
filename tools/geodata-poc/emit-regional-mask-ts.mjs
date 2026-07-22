// Emit packages/sim/src/<id>-mask.ts from a baked *.mask.json file.
//
// Usage:
//   node emit-regional-mask-ts.mjs europe.mask.json
//   node emit-regional-mask-ts.mjs --all   # all *.mask.json except world

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const simSrc = join(here, "../../packages/sim/src");

function toConst(id) {
  return id.replace(/-/g, "_").toUpperCase();
}

function toCamel(id) {
  return id.replace(/[-_]([a-z])/g, (_, c) => c.toUpperCase());
}

function toPascal(id) {
  const c = toCamel(id);
  return c.charAt(0).toUpperCase() + c.slice(1);
}

function emit(meta, outPath) {
  const id = meta.preset === "custom" ? basename(outPath, ".mask.json") : meta.preset;
  const prefix = toConst(id);
  const fn = toCamel(id);
  const cap = toPascal(id);

  const ts =
    `// ${cap} regional land mask — baked from Natural Earth via tools/geodata-poc/bake-regional-mask.mjs.\n` +
    `import { createRegionalMask } from "./regional-mask";\n\n` +
    `export const ${prefix}_LON_MIN = ${meta.lonMin};\n` +
    `export const ${prefix}_LON_MAX = ${meta.lonMax};\n` +
    `export const ${prefix}_LAT_MIN = ${meta.latMin};\n` +
    `export const ${prefix}_LAT_MAX = ${meta.latMax};\n` +
    `export const ${prefix}_MASK_COLS = ${meta.cols};\n` +
    `export const ${prefix}_MASK_ROWS = ${meta.rows};\n\n` +
    `const ${fn}Mask = createRegionalMask({\n` +
    `  lonMin: ${prefix}_LON_MIN,\n` +
    `  lonMax: ${prefix}_LON_MAX,\n` +
    `  latMin: ${prefix}_LAT_MIN,\n` +
    `  latMax: ${prefix}_LAT_MAX,\n` +
    `  maskCols: ${prefix}_MASK_COLS,\n` +
    `  maskRows: ${prefix}_MASK_ROWS,\n` +
    `  maskB64:\n` +
    `    "${meta.b64}",\n` +
    `});\n\n` +
    `export const is${cap}Land = ${fn}Mask.isLand.bind(${fn}Mask);\n` +
    `export const ${fn}TileLatLon = ${fn}Mask.tileLatLon.bind(${fn}Mask);\n`;

  const target = join(simSrc, `${id}-mask.ts`);
  writeFileSync(target, ts);
  console.log(`Wrote ${target} (${meta.landPct}% land)`);
}

const arg = process.argv[2];
if (!arg) {
  console.error("Usage: node emit-regional-mask-ts.mjs <file.mask.json|--all>");
  process.exit(1);
}

const files =
  arg === "--all"
    ? readdirSync(here).filter((f) => f.endsWith(".mask.json") && f !== "world.mask.json")
    : [arg];

for (const file of files) {
  const path = join(here, file);
  const meta = JSON.parse(readFileSync(path, "utf8"));
  emit(meta, file);
}
