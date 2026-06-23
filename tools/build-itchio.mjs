// Packages the client's production build into an itch.io-ready HTML5 zip.
//
// itch.io serves the uploaded zip from a sandboxed iframe and expects
// `index.html` at the *root* of the archive (not nested in a folder), with
// every asset referenced via relative paths. The Vite config already sets
// `base: "./"`, so the build output in packages/client/dist is fully relative.
//
// The full image set is ~120 MB, far too large to bundle into the itch.io zip.
// So the heavy art folders are hosted on our server instead: this build sets
// `VITE_ASSET_BASE_URL` so the client loads every image from that server (see
// src/asset-base.ts), and keeps only the app shell (index.html, JS bundle, UI
// chrome, PWA icons) in the zip.
//
// Usage:
//   bun run itch.io-version -- --asset-base=https://assets.example.com/
//   # or:  VITE_ASSET_BASE_URL=https://assets.example.com/ bun run itch.io-version
//
// Outputs (under dist-itchio/):
//   rise-of-civilizations-itchio-v<version>.zip  -> upload to itch.io
//   server-assets/                               -> upload to the asset server

import { spawnSync } from "node:child_process";
import { deflateRawSync } from "node:zlib";
import {
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
  mkdirSync,
  rmSync,
  cpSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const clientDir = join(repoRoot, "packages", "client");
const distDir = join(clientDir, "dist");
const outDir = join(repoRoot, "dist-itchio");
const serverAssetsDir = join(outDir, "server-assets");

// --- 0. Resolve the asset server base URL --------------------------------
const argBase = process.argv
  .slice(2)
  .find((a) => a.startsWith("--asset-base="))
  ?.slice("--asset-base=".length);
const assetBase = (argBase || process.env.VITE_ASSET_BASE_URL || "").trim();

// Multiplayer/analytics server. Inside the itch.io sandbox `location.hostname`
// is an itch CDN host, so the client's default `wss://<host>:3001/ws` can't
// reach our server — multiplayer silently fails. Bake an absolute URL instead.
// (Analytics derives its endpoint from this too: ws→http, /ws→/analytics.)
const argWs = process.argv
  .slice(2)
  .find((a) => a.startsWith("--ws-url="))
  ?.slice("--ws-url=".length);
const wsUrl = (argWs || process.env.VITE_WS_URL || "wss://server.rise-of-civilizations.com/ws").trim();
if (!/^wss?:\/\//.test(wsUrl)) {
  console.error(`! --ws-url must be an absolute ws(s):// URL, got: ${wsUrl}`);
  process.exit(1);
}

// By default we assume the art is already served at the asset base (e.g. the
// regular web build is deployed there, so /leaders/*.png etc. already exist).
// Pass --stage-assets to also copy the art into dist-itchio/server-assets/ for
// uploading to a host that does NOT already have it.
const stageAssets = process.argv.slice(2).includes("--stage-assets");

if (!assetBase) {
  console.error(
    "! No asset server URL provided.\n" +
      "  The itch.io build hosts game images on our server (they're too large\n" +
      "  to bundle), so it needs to know where they'll live.\n\n" +
      "  Pass one of:\n" +
      "    bun run itch.io-version -- --asset-base=https://assets.example.com/\n" +
      "    VITE_ASSET_BASE_URL=https://assets.example.com/ bun run itch.io-version\n",
  );
  process.exit(1);
}
if (!/^https?:\/\//.test(assetBase)) {
  console.error(`! asset base must be an absolute http(s) URL, got: ${assetBase}`);
  process.exit(1);
}

// --- 1. Build the client (with images pointed at the asset server) -------
console.log(`> building client (assets -> ${assetBase}, multiplayer -> ${wsUrl})…`);
const build = spawnSync("bun", ["run", "--filter", "@roc/client", "build"], {
  cwd: repoRoot,
  stdio: "inherit",
  shell: process.platform === "win32",
  env: { ...process.env, VITE_ASSET_BASE_URL: assetBase, VITE_WS_URL: wsUrl },
});
if (build.status !== 0) {
  console.error("! client build failed");
  process.exit(build.status ?? 1);
}

// --- 2. Collect files, split into "bundled" vs "server-hosted" -----------
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

// A dist file is bundled into the zip if it's the app shell: any root-level
// file (index.html, manifest.json, sw.js, the small PWA icons) plus the JS
// bundle (assets/) and the tiny UI chrome images (ui/, referenced from inline
// CSS by relative path). Everything else is game art served from the server.
function isBundled(name) {
  if (!name.includes("/")) return true;
  const top = name.split("/")[0];
  return top === "assets" || top === "ui";
}

const all = walk(distDir).map((abs) => ({
  abs,
  // Zip entry names must use forward slashes and be relative to dist/.
  name: relative(distDir, abs).split("\\").join("/"),
}));

if (all.length === 0) {
  console.error(`! no files found in ${distDir}`);
  process.exit(1);
}

const bundled = all.filter((f) => isBundled(f.name));
const hosted = all.filter((f) => !isBundled(f.name));

// --- 3. (Optional) stage server-hosted assets for upload -----------------
// Only when --stage-assets is passed; normally the host already serves them.
rmSync(serverAssetsDir, { recursive: true, force: true });
if (stageAssets) {
  for (const f of hosted) {
    const dest = join(serverAssetsDir, f.name);
    mkdirSync(dirname(dest), { recursive: true });
    cpSync(f.abs, dest);
  }
}

// --- 4. Build the zip (app shell only) in memory -------------------------
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

for (const file of bundled) {
  const data = readFileSync(file.abs);
  const nameBuf = Buffer.from(file.name, "utf8");
  const crc = crc32(data);

  // STORE already-compressed payloads where DEFLATE wouldn't help.
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
eocd.writeUInt16LE(bundled.length, 8); // entries on this disk
eocd.writeUInt16LE(bundled.length, 10); // total entries
eocd.writeUInt32LE(centralDir.length, 12); // central dir size
eocd.writeUInt32LE(localData.length, 16); // central dir offset
eocd.writeUInt16LE(0, 20); // comment length

const zip = Buffer.concat([localData, centralDir, eocd]);

// --- 5. Write outputs ----------------------------------------------------
mkdirSync(outDir, { recursive: true });
const version = JSON.parse(
  readFileSync(join(repoRoot, "package.json"), "utf8"),
).version;
const zipPath = join(outDir, `rise-of-civilizations-itchio-v${version}.zip`);
writeFileSync(zipPath, zip);

const sum = (files) => files.reduce((n, f) => n + statSync(f.abs).size, 0);
const mb = (bytes) => (bytes / (1024 * 1024)).toFixed(2);

console.log(
  `\n✓ zip: ${relative(repoRoot, zipPath)} ` +
    `(${bundled.length} files, ${mb(zip.length)} MB)`,
);
console.log(
  `  ${hosted.length} image files (${mb(sum(hosted))} MB) excluded — ` +
    `loaded at runtime from ${assetBase}`,
);

if (stageAssets) {
  const hostedDirs = [...new Set(hosted.map((f) => f.name.split("/")[0]))].sort();
  console.log(
    `✓ server-assets: ${relative(repoRoot, serverAssetsDir)}/ ` +
      `(folders: ${hostedDirs.join(", ")})`,
  );
  console.log("  -> upload these so they're served at the asset base above.");
}

console.log("\nNext steps:");
console.log(`  1. Make sure the art is served at ${assetBase}`);
console.log(`     (e.g. ${assetBase}units/warrior.png must resolve). If your normal`);
console.log("     web build is deployed there, it already is — nothing to upload.");
console.log("     Otherwise re-run with --stage-assets to get an uploadable copy.");
console.log("  2. Upload the zip to itch.io, tick \"This file will be played in the browser\".");
console.log("  3. The asset host must allow cross-origin reads (Access-Control-Allow-Origin: *)");
console.log("     — itch.io games run on a different origin, and the game draws these");
console.log("     images onto a <canvas>, so without CORS the canvas gets tainted.");
