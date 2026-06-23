// Builds the web client for the native apps and stages it into ./www.
//
// Like tools/build-itchio.mjs, this builds the client with the production asset
// + multiplayer URLs baked in, then copies ONLY the app shell (index.html, JS
// bundle, UI chrome, manifest, icons) into ./www. The ~120 MB of game art is
// left out and streamed from the live CDN at runtime, so the installed app
// stays small (well under store limits).
//
// Override the hosted endpoints with env vars if you ever move them:
//   ASSET_BASE=https://game.rise-of-civilizations.com/ \
//   WS_URL=wss://server.rise-of-civilizations.com/ws \
//   node build-mobile.mjs

import { spawnSync } from "node:child_process";
import {
  readdirSync,
  statSync,
  rmSync,
  mkdirSync,
  cpSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const distDir = join(repoRoot, "packages", "client", "dist");
const wwwDir = join(here, "www");

const assetBase = (process.env.ASSET_BASE || "https://game.rise-of-civilizations.com/").trim();
const wsUrl = (process.env.WS_URL || "wss://server.rise-of-civilizations.com/ws").trim();

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

// A dist file is part of the app shell if it's a root-level file (index.html,
// manifest.json, sw.js, icons) or lives under assets/ (JS bundle) or ui/ (the
// tiny UI chrome referenced from inline CSS). Everything else is game art that
// the CDN serves.
function isShell(name) {
  if (!name.includes("/")) return true;
  const top = name.split("/")[0];
  return top === "assets" || top === "ui";
}

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

const all = walk(distDir).map((abs) => ({
  abs,
  name: relative(distDir, abs).split("\\").join("/"),
}));
if (all.length === 0) {
  console.error(`! no files found in ${distDir}`);
  process.exit(1);
}

rmSync(wwwDir, { recursive: true, force: true });
mkdirSync(wwwDir, { recursive: true });

const shell = all.filter((f) => isShell(f.name));
for (const f of shell) {
  const dest = join(wwwDir, f.name);
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(f.abs, dest);
}

const mb = (bytes) => (bytes / (1024 * 1024)).toFixed(2);
const shellBytes = shell.reduce((n, f) => n + statSync(f.abs).size, 0);
console.log(
  `\n✓ staged ${shell.length} app-shell files (${mb(shellBytes)} MB) into mobile/www`,
);
console.log(
  `  ${all.length - shell.length} art files excluded — streamed from ${assetBase}`,
);
console.log("  next: run `npx cap sync` (or `npm run build` does both).");
