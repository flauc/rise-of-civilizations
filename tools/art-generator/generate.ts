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
  dryRun: boolean;
}

function usage(): string {
  return `
AI art generator for Rise of Civilizations

Usage:
  bun run tools/art-generator/generate.ts --unit archer
  bun run tools/art-generator/generate.ts --tile forest
  bun run tools/art-generator/generate.ts --building granary
  bun run tools/art-generator/generate.ts --subset terrain
  bun run tools/art-generator/generate.ts --subset units
  bun run tools/art-generator/generate.ts --subset buildings
  bun run tools/art-generator/generate.ts --all

Options:
  --unit <id>            Generate a specific unit
  --tile <id>            Generate a specific terrain tile
  --building <id>        Generate a specific building icon
  --subset <name>        Generate a subset: terrain, units, buildings, all
  --list                 List all available asset IDs and exit
  --model <id>           Gemini model (default: ${DEFAULT_MODEL})
  --size <512|1K|2K|4K>  Gemini image size (default: ${DEFAULT_IMAGE_SIZE})
  --reference-dir <path> Directory with reference hex tiles
                         (default: "${DEFAULT_REFERENCE_DIR}")
  --reference <path>     Override the reference tile for every generation
  --out-dir <path>       Output directory (default: "${DEFAULT_OUTPUT_DIR}")
  --no-post              Skip ImageMagick post-processing
  --rembg                Use rembg for background removal when available
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
      case "--subset": {
        const name = next();
        if (name === "terrain" || name === "tiles") entries.push(...TERRAIN_SUBSET);
        else if (name === "units") entries.push(...UNIT_SUBSET);
        else if (name === "buildings") entries.push(...BUILDING_SUBSET);
        else if (name === "all") entries.push(...allEntries());
        else fail(`Unknown subset: ${name}. Choose terrain, units, buildings, all.`);
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

async function generateImage(entry: AssetEntry, options: Options): Promise<Buffer> {
  const referenceFile = options.referenceOverride ?? referencePath(entry, options.referenceDir);
  if (!(await fileExists(referenceFile))) {
    throw new Error(`Reference tile not found: ${referenceFile}`);
  }

  const prompt = promptFor(entry);
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

async function postProcessTile(rawPath: string, outPath: string, entry: AssetEntry, referenceFile: string): Promise<void> {
  const { width, height } = await getImageSize(rawPath);
  const maskPath = `${rawPath}.mask.png`;

  // Resize the reference tile's alpha channel to the generated image size and
  // use it as an opacity mask so the outer hex corners become transparent.
  await runCmd("magick", [
    referenceFile,
    "-resize",
    `${width}x${height}!`,
    "-alpha",
    "extract",
    maskPath,
  ]);

  const maskedPath = `${rawPath}.masked.png`;
  await runCmd("magick", [rawPath, maskPath, "-compose", "CopyOpacity", "-composite", maskedPath]);

  await runCmd("magick", [
    maskedPath,
    "-resize",
    `${entry.size.width}x${entry.size.height}!`,
    "-define",
    "png:color-type=6",
    outPath,
  ]);

  // Best-effort cleanup of temp files.
  await Promise.all([unlink(maskPath).catch(() => {}), unlink(maskedPath).catch(() => {})]);
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

async function processEntry(entry: AssetEntry, options: Options, magickAvailable: boolean): Promise<void> {
  console.log(`\n[${entry.category}] ${entry.name} (${entry.id})`);

  const referenceFile = options.referenceOverride ?? referencePath(entry, options.referenceDir);
  console.log(`  reference: ${referenceFile}`);

  const categoryDir = entry.category === "building" ? "buildings" : `${entry.category}s`;
  const rawDir = join(options.outDir, "raw", categoryDir);
  const finalDir = join(options.outDir, categoryDir);
  const rawPath = join(rawDir, `${entry.id}.png`);
  const finalPath = join(finalDir, `${entry.id}.png`);

  if (!options.dryRun) {
    await mkdir(rawDir, { recursive: true });
    await mkdir(finalDir, { recursive: true });
  }

  const image = await generateImage(entry, options);
  if (!options.dryRun) {
    await writeFile(rawPath, image);
    console.log(`  raw saved: ${rawPath}`);
  }

  if (!options.postProcess) {
    console.log(`  post-processing skipped`);
    return;
  }

  if (!magickAvailable) {
    console.warn(`  ImageMagick (magick) not found; skipping post-processing.`);
    return;
  }

  if (options.dryRun) {
    console.log(`  dry-run: skipping post-processing`);
    return;
  }

  if (entry.category === "tile") {
    await postProcessTile(rawPath, finalPath, entry, referenceFile);
  } else {
    await postProcessToken(rawPath, finalPath, entry, options.useRembg);
  }
  console.log(`  final saved: ${finalPath}`);
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

  console.log(`Generating ${entries.length} asset(s) with model ${options.model} (${options.imageSize})`);

  for (const entry of entries) {
    try {
      await processEntry(entry, options, magickAvailable);
    } catch (err) {
      console.error(`  FAILED: ${err instanceof Error ? err.message : String(err)}`);
      if (env.GENERATOR_FAIL_FAST) exit(1);
    }
  }

  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  exit(1);
});
