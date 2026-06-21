// Packages the client's production build into an itch.io-ready HTML5 zip.
//
// itch.io serves the uploaded zip from a sandboxed iframe and expects
// `index.html` at the *root* of the archive (not nested in a folder), with
// every asset referenced via relative paths. The Vite config already sets
// `base: "./"`, so the build output in packages/client/dist is fully
// relative — this script just runs that build and zips its contents.
//
// The zip is written with Node's built-in zlib (DEFLATE) so there are no
// extra dependencies to install. Run via: `bun run itch.io-version`.

import { spawnSync } from "node:child_process";
import { deflateRawSync } from "node:zlib";
import {
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
  mkdirSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const clientDir = join(repoRoot, "packages", "client");
const distDir = join(clientDir, "dist");
const outDir = join(repoRoot, "dist-itchio");

// --- 1. Build the client -------------------------------------------------
console.log("> building client (vite build)…");
const build = spawnSync("bun", ["run", "--filter", "@roc/client", "build"], {
  cwd: repoRoot,
  stdio: "inherit",
  shell: process.platform === "win32",
});
if (build.status !== 0) {
  console.error("! client build failed");
  process.exit(build.status ?? 1);
}

// --- 2. Collect files from dist/ ----------------------------------------
/** @returns {string[]} absolute file paths under `dir`, recursively */
function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

const files = walk(distDir).map((abs) => ({
  abs,
  // Zip entry names must use forward slashes and be relative to dist/.
  name: relative(distDir, abs).split("\\").join("/"),
}));

if (files.length === 0) {
  console.error(`! no files found in ${distDir}`);
  process.exit(1);
}

// --- 3. Build the zip in memory -----------------------------------------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// DOS date/time — use a fixed timestamp so builds are reproducible.
const DOS_TIME = 0;
const DOS_DATE = ((2024 - 1980) << 9) | (1 << 5) | 1; // 2024-01-01

const localParts = [];
const centralParts = [];
let offset = 0;

for (const file of files) {
  const data = readFileSync(file.abs);
  const nameBuf = Buffer.from(file.name, "utf8");
  const crc = crc32(data);

  // STORE tiny/already-compressed payloads where DEFLATE wouldn't help.
  const deflated = deflateRawSync(data, { level: 9 });
  const useDeflate = deflated.length < data.length;
  const method = useDeflate ? 8 : 0;
  const payload = useDeflate ? deflated : data;

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0); // local file header signature
  local.writeUInt16LE(20, 4); // version needed
  local.writeUInt16LE(0, 6); // flags
  local.writeUInt16LE(method, 8); // compression method
  local.writeUInt16LE(DOS_TIME, 10);
  local.writeUInt16LE(DOS_DATE, 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(payload.length, 18); // compressed size
  local.writeUInt32LE(data.length, 22); // uncompressed size
  local.writeUInt16LE(nameBuf.length, 26);
  local.writeUInt16LE(0, 28); // extra length
  localParts.push(local, nameBuf, payload);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0); // central dir header signature
  central.writeUInt16LE(20, 4); // version made by
  central.writeUInt16LE(20, 6); // version needed
  central.writeUInt16LE(0, 8); // flags
  central.writeUInt16LE(method, 10);
  central.writeUInt16LE(DOS_TIME, 12);
  central.writeUInt16LE(DOS_DATE, 14);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(payload.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(nameBuf.length, 28);
  central.writeUInt16LE(0, 30); // extra length
  central.writeUInt16LE(0, 32); // comment length
  central.writeUInt16LE(0, 34); // disk number start
  central.writeUInt16LE(0, 36); // internal attrs
  central.writeUInt32LE(0, 38); // external attrs
  central.writeUInt32LE(offset, 42); // local header offset
  centralParts.push(central, nameBuf);

  offset += local.length + nameBuf.length + payload.length;
}

const centralDir = Buffer.concat(centralParts);
const localData = Buffer.concat(localParts);

const eocd = Buffer.alloc(22);
eocd.writeUInt32LE(0x06054b50, 0); // end of central dir signature
eocd.writeUInt16LE(0, 4); // disk number
eocd.writeUInt16LE(0, 6); // disk with central dir
eocd.writeUInt16LE(files.length, 8); // entries on this disk
eocd.writeUInt16LE(files.length, 10); // total entries
eocd.writeUInt32LE(centralDir.length, 12); // central dir size
eocd.writeUInt32LE(localData.length, 16); // central dir offset
eocd.writeUInt16LE(0, 20); // comment length

const zip = Buffer.concat([localData, centralDir, eocd]);

// --- 4. Write it out -----------------------------------------------------
mkdirSync(outDir, { recursive: true });
const version = JSON.parse(
  readFileSync(join(repoRoot, "package.json"), "utf8"),
).version;
const zipPath = join(outDir, `rise-of-civilizations-itchio-v${version}.zip`);
writeFileSync(zipPath, zip);

const mb = (zip.length / (1024 * 1024)).toFixed(2);
console.log(`\n✓ packaged ${files.length} files → ${relative(repoRoot, zipPath)} (${mb} MB)`);
console.log("  Upload this zip to itch.io and tick \"This file will be played in the browser\".");
