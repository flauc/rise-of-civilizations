#!/usr/bin/env bun
// AI art generator for Rise of Civilizations tiles/units.
//
// Uses Google Gemini Nano Banana 2 to generate images from a prompt + reference
// tile, then post-processes with ImageMagick (and optionally rembg) to resize
// and remove backgrounds.
//
// Examples:
//   bun run tools/art-generator/generate.ts --unit archer
//   bun run tools/art-generator/generate.ts --tile forest --size 2K
//   bun run tools/art-generator/generate.ts --subset terrain
//   bun run tools/art-generator/generate.ts --all

import { readFile, writeFile, mkdir, access, unlink } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, join } from "node:path";
import { spawn } from "node:child_process";
const { argv, env, exit, platform } = process as NodeJS.Process;

import {
  type AssetEntry,
  type ImageSize,
  allEntries,
  findEntry,
  promptFor,
  referencePath,
  DEFAULT_MODEL,
  DEFAULT_IMAGE_SIZE,
  DEFAULT_OUTPUT_DIR,
  DEFAULT_REFERENCE_DIR,
  VALID_IMAGE_SIZES,
  TERRAIN_SUBSET,
  UNIT_SUBSET,
  BUILDING_SUBSET,
  CITY_SUBSET,
  IMPROVEMENT_SUBSET,
  LEADER_SUBSET,
  ROAD_SUBSET,
  DIRT_ROAD_SUBSET,
  STONE_ROAD_SUBSET,
  ADVANCED_STONE_ROAD_SUBSET,
  RIVER_SUBSET,
  RESOURCE_SUBSET,
} from "./config";

interface Options {
  model: string;
  imageSize: ImageSize;
  apiKey: string;
  baseUrl: string;
  referenceDir: string;
  referenceOverride?: string;
  outDir: string;
  postProcess: boolean;
  useRembg: boolean;
  variations: number;
  includeBase: boolean;
  concurrency: number;
  dryRun: boolean;
}

function usage(): string {
  return `
AI art generator for Rise of Civilizations

Usage:
  bun run tools/art-generator/generate.ts --unit archer
  bun run tools/art-generator/generate.ts --tile forest
  bun run tools/art-generator/generate.ts --building granary
  bun run tools/art-generator/generate.ts --leader rome
  bun run tools/art-generator/generate.ts --improvement farm_t1
  bun run tools/art-generator/generate.ts --road dirt_road_3
  bun run tools/art-generator/generate.ts --river river_15
  bun run tools/art-generator/generate.ts --resource wheat
  bun run tools/art-generator/generate.ts --subset terrain
  bun run tools/art-generator/generate.ts --subset units
  bun run tools/art-generator/generate.ts --subset buildings
  bun run tools/art-generator/generate.ts --subset improvements
  bun run tools/art-generator/generate.ts --subset leaders
  bun run tools/art-generator/generate.ts --subset dirt-roads
  bun run tools/art-generator/generate.ts --subset stone-roads
  bun run tools/art-generator/generate.ts --subset advanced-stone-roads
  bun run tools/art-generator/generate.ts --subset rivers
  bun run tools/art-generator/generate.ts --subset resources
  bun run tools/art-generator/generate.ts --all

Options:
  --unit <id>            Generate a specific unit
  --tile <id>            Generate a specific terrain tile
  --building <id>        Generate a specific building icon
  --improvement <id>     Generate a specific map improvement icon (e.g. farm_t1)
  --leader <id>          Generate a specific civilization leader portrait
  --road <id>            Generate a specific road segment
  --river <id>           Generate a specific river segment
  --resource <id>        Generate a specific resource icon
  --subset <name>        Generate a subset: terrain, units, buildings, improvements, cities, leaders, dirt-roads, stone-roads, advanced-stone-roads, rivers, resources, all
  --list                 List all available asset IDs and exit
  --model <id>           Gemini model (default: ${DEFAULT_MODEL})
  --size <512|1K|2K|4K>  Gemini image size (default: ${DEFAULT_IMAGE_SIZE})
  --reference-dir <path> Directory with reference hex tiles
                         (default: "${DEFAULT_REFERENCE_DIR}")
  --reference <path>     Override the reference tile for every generation
  --out-dir <path>       Output directory (default: "${DEFAULT_OUTPUT_DIR}")
  --no-post              Skip ImageMagick post-processing
  --rembg                Use rembg for background removal when available
  --variations <n>       Generate n variants per asset (default: 1)
  --skip-base            Only generate numbered variants (_1.._n), leave base file
  --concurrency <n>      Max parallel API calls (default: 3)
  --dry-run              Do not call the API or write files
  --help                 Show this message

Environment:
  GEMINI_API_KEY         Required for image generation
  GEMINI_BASE_URL        Optional API base URL override
                         (default: https://generativelanguage.googleapis.com/v1beta)
`.trim();
}

function fail(message: string): never {
  console.error(message);
  exit(1);
  throw new Error(message);
}

function parseArgs(): { entries: AssetEntry[]; options: Options } {
  const args = argv.slice(2);
  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    console.log(usage());
    exit(0);
  }

  if (args.includes("--list")) {
    console.log("Available assets:");
    for (const e of allEntries()) {
      console.log(`  ${e.category.padEnd(8)} ${e.id.padEnd(16)} ${e.name}`);
    }
    exit(0);
  }

  const entries: AssetEntry[] = [];
  const options: Options = {
    model: DEFAULT_MODEL,
    imageSize: DEFAULT_IMAGE_SIZE,
    apiKey: env.GEMINI_API_KEY ?? "",
    baseUrl: env.GEMINI_BASE_URL ?? "https://generativelanguage.googleapis.com/v1beta",
    referenceDir: DEFAULT_REFERENCE_DIR,
    outDir: DEFAULT_OUTPUT_DIR,
    postProcess: true,
    useRembg: false,
    variations: 1,
    includeBase: true,
    concurrency: 3,
    dryRun: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = (): string => {
      const v = args[++i];
      if (v === undefined) fail(`Missing value for ${arg}`);
      return v;
    };

    switch (arg) {
      case "--unit": {
        const id = next();
        const e = findEntry(id);
        if (!e || e.category !== "unit") fail(`Unknown unit: ${id}`);
        entries.push(e);
        break;
      }
      case "--tile": {
        const id = next();
        const e = findEntry(id);
        if (!e || e.category !== "tile") fail(`Unknown tile: ${id}`);
        entries.push(e);
        break;
      }
      case "--building": {
        const id = next();
        const e = findEntry(id);
        if (!e || e.category !== "building") fail(`Unknown building: ${id}`);
        entries.push(e);
        break;
      }
      case "--improvement": {
        const id = next();
        const e = findEntry(id);
        if (!e || e.category !== "improvement") fail(`Unknown improvement: ${id}`);
        entries.push(e);
        break;
      }
      case "--leader": {
        const id = next();
        const e = findEntry(id);
        if (!e || e.category !== "leader") fail(`Unknown leader: ${id}`);
        entries.push(e);
        break;
      }
      case "--road": {
        const id = next();
        const e = findEntry(id);
        if (!e || e.category !== "road") fail(`Unknown road: ${id}`);
        entries.push(e);
        break;
      }
      case "--river": {
        const id = next();
        const e = findEntry(id);
        if (!e || e.category !== "river") fail(`Unknown river: ${id}`);
        entries.push(e);
        break;
      }
      case "--resource": {
        const id = next();
        const e = findEntry(id);
        if (!e || e.category !== "resource") fail(`Unknown resource: ${id}`);
        entries.push(e);
        break;
      }
      case "--subset": {
        const name = next();
        if (name === "terrain" || name === "tiles") entries.push(...TERRAIN_SUBSET);
        else if (name === "units") entries.push(...UNIT_SUBSET);
        else if (name === "buildings") entries.push(...BUILDING_SUBSET);
        else if (name === "improvements") entries.push(...IMPROVEMENT_SUBSET);
        else if (name === "cities") entries.push(...CITY_SUBSET);
        else if (name === "leaders") entries.push(...LEADER_SUBSET);
        else if (name === "dirt-roads") entries.push(...DIRT_ROAD_SUBSET);
        else if (name === "stone-roads") entries.push(...STONE_ROAD_SUBSET);
        else if (name === "advanced-stone-roads") entries.push(...ADVANCED_STONE_ROAD_SUBSET);
        else if (name === "rivers") entries.push(...RIVER_SUBSET);
        else if (name === "resources") entries.push(...RESOURCE_SUBSET);
        else if (name === "all") entries.push(...allEntries());
        else fail(`Unknown subset: ${name}. Choose terrain, units, buildings, improvements, cities, leaders, dirt-roads, stone-roads, advanced-stone-roads, rivers, resources, or all.`);
        break;
      }
      case "--all":
        entries.push(...allEntries());
        break;
      case "--model":
        options.model = next();
        break;
      case "--size": {
        const s = next();
        if (!VALID_IMAGE_SIZES.includes(s as ImageSize)) fail(`Invalid size: ${s}`);
        options.imageSize = s as ImageSize;
        break;
      }
      case "--reference-dir":
        options.referenceDir = next();
        break;
      case "--reference":
        options.referenceOverride = next();
        break;
      case "--out-dir":
        options.outDir = next();
        break;
      case "--no-post":
        options.postProcess = false;
        break;
      case "--rembg":
        options.useRembg = true;
        break;
      case "--variations": {
        const n = Number(next());
        if (!Number.isInteger(n) || n < 1) fail("--variations must be a positive integer");
        options.variations = n;
        break;
      }
      case "--concurrency": {
        const n = Number(next());
        if (!Number.isInteger(n) || n < 1) fail("--concurrency must be a positive integer");
        options.concurrency = n;
        break;
      }
      case "--skip-base":
        options.includeBase = false;
        break;
      case "--dry-run":
        options.dryRun = true;
        break;
      default:
        fail(`Unknown argument: ${arg}`);
    }
  }

  if (entries.length === 0) {
    fail("No assets specified. Use --unit, --tile, --building, --subset, or --all.");
  }

  return { entries, options };
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function runCmd(command: string, args: string[], stdin?: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, { stdio: ["pipe", "pipe", "pipe"] });
    const chunks: Buffer[] = [];
    const errChunks: Buffer[] = [];
    proc.stdout.on("data", (c) => chunks.push(c));
    proc.stderr.on("data", (c) => errChunks.push(c));
    if (stdin) proc.stdin.end(stdin);
    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`${command} ${args.join(" ")} exited ${code}: ${Buffer.concat(errChunks).toString("utf8")}`));
      } else {
        resolve(Buffer.concat(chunks));
      }
    });
    proc.on("error", (err) => reject(err));
  });
}

async function commandExists(command: string): Promise<boolean> {
  try {
    // `where` on Windows, `which` elsewhere.
    const check = platform === "win32" ? "where" : "which";
    await runCmd(check, [command]);
    return true;
  } catch {
    return false;
  }
}

async function toBase64(path: string): Promise<string> {
  const buf = await readFile(path);
  return buf.toString("base64");
}

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
        inlineData?: { mimeType: string; data: string };
        inline_data?: { mime_type: string; data: string };
      }>;
    };
  }>;
  error?: { message: string; code?: number };
}

async function generateImage(entry: AssetEntry, options: Options, prompt: string): Promise<Buffer> {
  const referenceFile = options.referenceOverride ?? referencePath(entry, options.referenceDir);
  if (!(await fileExists(referenceFile))) {
    throw new Error(`Reference tile not found: ${referenceFile}`);
  }

  const imageData = await toBase64(referenceFile);

  const url = `${options.baseUrl}/models/${options.model}:generateContent?key=${options.apiKey}`;
  const body = {
    contents: [
      {
        role: "user",
        parts: [
          { text: prompt },
          { inline_data: { mime_type: "image/png", data: imageData } },
        ],
      },
    ],
    generationConfig: {
      responseModalities: ["TEXT", "IMAGE"],
      imageConfig: {
        aspectRatio: entry.aspectRatio,
        imageSize: options.imageSize,
      },
    },
  };

  console.log(`  → Calling ${options.model} for ${entry.id} (${entry.aspectRatio} ${options.imageSize})`);
  if (options.dryRun) {
    console.log(`     dry-run: skipping API call`);
    return Buffer.alloc(0);
  }

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = (await res.json()) as GeminiResponse | null;
  if (!res.ok || data?.error) {
    throw new Error(`Gemini API error: ${data?.error?.message ?? JSON.stringify(data)}`);
  }

  const candidate = data?.candidates?.[0];
  const parts = candidate?.content?.parts ?? [];
  for (const part of parts) {
    const imageData = part.inlineData?.data ?? part.inline_data?.data;
    if (imageData) {
      return Buffer.from(imageData, "base64");
    }
  }

  // Sometimes the model returns only text (e.g. a refusal or description).
  const text = parts.map((p) => p.text).filter(Boolean).join("\n");
  throw new Error(`No image returned. Model said:\n${text}`);
}

async function getImageSize(path: string): Promise<{ width: number; height: number }> {
  const out = await runCmd("magick", ["identify", "-format", "%w %h", path]);
  const [w, h] = out.toString("utf8").trim().split(" ").map(Number);
  if (!w || !h) throw new Error(`Could not identify image size for ${path}`);
  return { width: w, height: h };
}

async function hexMaskPath(width: number, height: number, outPath: string): Promise<void> {
  // Pointy-top hex inscribed in the bottom width×width square of the canvas.
  // The bottom vertex sits at the bottom edge; the top vertex is at height - width.
  const cx = width / 2;
  const topY = height - width;
  const quarter = width / 4;
  const threeQuarter = (3 * width) / 4;
  const polygon = `${cx},${topY} ${width},${topY + quarter} ${width},${topY + threeQuarter} ${cx},${height} 0,${topY + threeQuarter} 0,${topY + quarter}`;
  await runCmd("magick", ["-size", `${width}x${height}`, "xc:black", "-fill", "white", "-draw", `polygon ${polygon}`, outPath]);
}

async function postProcessTile(rawPath: string, outPath: string, entry: AssetEntry): Promise<void> {
  const resizedPath = `${rawPath}.resized.png`;
  const maskPath = `${rawPath}.mask.png`;

  // Scale the generated image to the target tile canvas first.
  await runCmd("magick", [rawPath, "-resize", `${entry.size.width}x${entry.size.height}!`, resizedPath]);

  // Create a precise hex mask at the target size and apply it. This removes any
  // background bleed around the hex edges and makes the top overhang transparent.
  await hexMaskPath(entry.size.width, entry.size.height, maskPath);
  await runCmd("magick", [resizedPath, maskPath, "-compose", "CopyOpacity", "-composite", "-define", "png:color-type=6", outPath]);

  // Best-effort cleanup of temp files.
  await Promise.all([unlink(resizedPath).catch(() => {}), unlink(maskPath).catch(() => {})]);
}

async function postProcessToken(rawPath: string, outPath: string, entry: AssetEntry, useRembg: boolean): Promise<void> {
  let source = rawPath;

  if (useRembg && (await commandExists("rembg"))) {
    const rembgPath = `${rawPath}.rembg.png`;
    await runCmd("rembg", ["i", rawPath, rembgPath]);
    source = rembgPath;
  }

  // Color-key a solid white/light background as a fallback/rembg supplement,
  // trim transparent edges, then pad/crop to the exact target size.
  await runCmd("magick", [
    source,
    "-fuzz",
    "20%",
    "-transparent",
    "white",
    "-trim",
    "+repage",
    "-resize",
    `${entry.size.width}x${entry.size.height}>`,
    "-background",
    "none",
    "-gravity",
    "center",
    "-extent",
    `${entry.size.width}x${entry.size.height}`,
    "-define",
    "png:color-type=6",
    outPath,
  ]);
}

async function postProcessPortrait(rawPath: string, outPath: string, entry: AssetEntry): Promise<void> {
  // Leader portraits keep their background. Just crop/resize to the target
  // portrait frame so they fit the Start Screen card uniformly.
  await runCmd("magick", [
    rawPath,
    "-resize",
    `${entry.size.width}x${entry.size.height}^`,
    "-gravity",
    "center",
    "-extent",
    `${entry.size.width}x${entry.size.height}`,
    "-define",
    "png:color-type=6",
    outPath,
  ]);
}

function variantSuffix(index: number): string {
  return index === 0 ? "" : `_${index}`;
}

async function processEntry(entry: AssetEntry, options: Options, magickAvailable: boolean): Promise<void> {
  console.log(`\n[${entry.category}] ${entry.name} (${entry.id}) × ${options.variations}`);

  const referenceFile = options.referenceOverride ?? referencePath(entry, options.referenceDir);
  console.log(`  reference: ${referenceFile}`);

  const categoryDir =
    entry.category === "building" ? "buildings" :
    entry.category === "improvement" ? "improvements" :
    `${entry.category}s`;
  const rawDir = join(options.outDir, "raw", categoryDir);
  const finalDir = join(options.outDir, categoryDir);

  if (!options.dryRun) {
    await mkdir(rawDir, { recursive: true });
    await mkdir(finalDir, { recursive: true });
  }

  const basePrompt = promptFor(entry);
  const startVariant = options.includeBase ? 0 : 1;

  for (let v = startVariant; v < startVariant + options.variations; v++) {
    try {
      const suffix = variantSuffix(v);
      const rawPath = join(rawDir, `${entry.id}${suffix}.png`);
      const finalPath = join(finalDir, `${entry.id}${suffix}.png`);

      const prompt = options.variations > 1
        ? `${basePrompt} (variant ${v + 1} of ${options.variations})`
        : basePrompt;

      const image = await generateImage(entry, options, prompt);
      if (!options.dryRun) {
        await writeFile(rawPath, image);
        console.log(`  raw saved: ${rawPath}`);
      }

      if (!options.postProcess) {
        console.log(`  post-processing skipped`);
        continue;
      }

      if (!magickAvailable) {
        console.warn(`  ImageMagick (magick) not found; skipping post-processing.`);
        continue;
      }

      if (options.dryRun) {
        console.log(`  dry-run: skipping post-processing`);
        continue;
      }

      if (entry.category === "tile" || entry.category === "road" || entry.category === "river") {
        await postProcessTile(rawPath, finalPath, entry);
      } else if (entry.category === "leader") {
        await postProcessPortrait(rawPath, finalPath, entry);
      } else {
        await postProcessToken(rawPath, finalPath, entry, options.useRembg);
      }
      console.log(`  final saved: ${finalPath}`);
    } catch (err) {
      console.error(`  variant ${v + 1} FAILED: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

async function main(): Promise<void> {
  const { entries, options } = parseArgs();

  if (!options.dryRun && !options.apiKey) {
    fail("GEMINI_API_KEY is required. Set it as an environment variable.");
  }

  const magickAvailable = await commandExists("magick");
  if (options.postProcess && !magickAvailable) {
    console.warn("Warning: ImageMagick (magick) not found in PATH. Post-processing will be skipped.");
  }

  console.log(`Generating ${entries.length} asset(s) / ${entries.length * options.variations} image call(s) with model ${options.model} (${options.imageSize})`);

  async function runWithConcurrency<T>(items: T[], concurrency: number, fn: (item: T) => Promise<void>): Promise<void> {
    const queue = [...items];
    async function worker(): Promise<void> {
      while (queue.length > 0) {
        const item = queue.shift()!;
        await fn(item);
      }
    }
    await Promise.all(Array.from({ length: concurrency }, worker));
  }

  await runWithConcurrency(entries, options.concurrency, async (entry) => {
    try {
      await processEntry(entry, options, magickAvailable);
    } catch (err) {
      console.error(`  FAILED: ${err instanceof Error ? err.message : String(err)}`);
      if (env.GENERATOR_FAIL_FAST) exit(1);
    }
  });

  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  exit(1);
});
