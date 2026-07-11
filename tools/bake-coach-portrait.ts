#!/usr/bin/env bun
/** Bake a transparent coach portrait PNG from a legend card image. */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { PNG } from "pngjs";
import { processPortraitPixels } from "../packages/client/src/coach-portrait.ts";

const legendId = process.argv[2] ?? "alexander";
const root = join(import.meta.dir, "..");
const srcPath = join(root, "packages/client/public/legends", `${legendId}.png`);
const outPath = join(root, "packages/client/public/coach/legends", `${legendId}.png`);

const png = PNG.sync.read(readFileSync(srcPath));
const rgba = new Uint8ClampedArray(png.data.buffer, png.data.byteOffset, png.data.byteLength);
const { data, outW, outH } = processPortraitPixels(rgba, png.width, png.height);

const out = new PNG({ width: outW, height: outH });
out.data = Buffer.from(data);
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, PNG.sync.write(out));
console.log(`Wrote ${outPath} (${outW}×${outH})`);
