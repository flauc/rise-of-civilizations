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

import { readFile, writeFile, mkdir, access, unlink, copyFile } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, join, basename } from "node:path";
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
  UNIQUE_UNIT_SUBSET,
  UNIQUE_INFRA_SUBSET,
  BUILDING_SUBSET,
  CITY_SUBSET,
  IMPROVEMENT_SUBSET,
  CONSTRUCTION_SUBSET,
  LEADER_SUBSET,
  GREAT_PERSON_SUBSET,
  LEGEND_SUBSET,
  LEGEND_UNIT_SUBSET,
  ROAD_SUBSET,
  DIRT_ROAD_SUBSET,
  STONE_ROAD_SUBSET,
  ADVANCED_STONE_ROAD_SUBSET,
  RIVER_SUBSET,
  RESOURCE_SUBSET,
  UI_SUBSET,
  ICON_SUBSET,
  VILLAGE_REWARD_SUBSET,
  BARBARIAN_REWARD_SUBSET,
  AGE_SUBSET,
  PILLAR_SUBSET,
  HERO_SUBSET,
  TURN_UPDATE_SUBSET,
  TURN_UPDATE_WONDER_SUBSET,
  TURN_UPDATE_IMPROVEMENT_SUBSET,
  NATURAL_WONDER_SUBSET,
  WONDER_TILE_SUBSET,
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
  bun run tools/art-generator/generate.ts --ui btn_next_move
  bun run tools/art-generator/generate.ts --icon app_icon
  bun run tools/art-generator/generate.ts --village-reward village_reward_tech
  bun run tools/art-generator/generate.ts --barbarian-reward barb_camp_cleared
  bun run tools/art-generator/generate.ts --turn-update tradeRouteEstablished
  bun run tools/art-generator/generate.ts --subset terrain
  bun run tools/art-generator/generate.ts --subset units
  bun run tools/art-generator/generate.ts --subset buildings
  bun run tools/art-generator/generate.ts --subset unique-infra
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
  --construction <id>    Generate a construction-site token (econ, defense, wonder)
  --leader <id>          Generate a specific civilization leader portrait
  --road <id>            Generate a specific road segment
  --river <id>           Generate a specific river segment
  --resource <id>        Generate a specific resource icon
  --ui <id>              Generate a specific UI element (e.g. btn_next_move)
  --icon <id>            Generate a specific app icon (e.g. app_icon)
  --village-reward <id>  Generate a specific village reward illustration (e.g. village_reward_tech)
  --barbarian-reward <id> Generate a specific barbarian reward illustration (e.g. barb_camp_cleared)
  --turn-update <id>     Generate a specific turn-update portrait (e.g. tradeRouteEstablished or improvement_road)
  --natural-wonder <id>  Generate a specific natural wonder illustration (e.g. matterhorn)
  --subset <name>        Generate a subset: terrain, units, buildings, improvements, cities, leaders, dirt-roads, stone-roads, advanced-stone-roads, rivers, resources, ui, icons, village-rewards, barbarian-rewards, ages, pillars, heroes, turn-updates, turn-update-wonders, turn-update-improvements, natural-wonders, all
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
      case "--construction": {
        const id = next();
        const e = findEntry(id);
        if (!e || e.category !== "construction") fail(`Unknown construction site: ${id}`);
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
      case "--great-person": {
        const id = next();
        const e = findEntry(id);
        if (!e || e.category !== "great_person") fail(`Unknown great person: ${id}`);
        entries.push(e);
        break;
      }
      case "--legend": {
        const id = next();
        const e = findEntry(id);
        if (!e || e.category !== "legend") fail(`Unknown legend: ${id}`);
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
      case "--ui": {
        const id = next();
        const e = findEntry(id);
        if (!e || e.category !== "ui") fail(`Unknown UI element: ${id}`);
        entries.push(e);
        break;
      }
      case "--icon": {
        const id = next();
        const e = findEntry(id);
        if (!e || e.category !== "icon") fail(`Unknown icon: ${id}`);
        entries.push(e);
        break;
      }
      case "--village-reward": {
        const id = next();
        const e = findEntry(id);
        if (!e || e.category !== "village_reward") fail(`Unknown village reward: ${id}`);
        entries.push(e);
        break;
      }
      case "--barbarian-reward": {
        const id = next();
        const e = findEntry(id);
        if (!e || e.category !== "barbarian_reward") fail(`Unknown barbarian reward: ${id}`);
        entries.push(e);
        break;
      }
      case "--turn-update": {
        const id = next();
        const e = findEntry(id);
        if (!e || e.category !== "turn_update") fail(`Unknown turn update: ${id}`);
        entries.push(e);
        break;
      }
      case "--natural-wonder": {
        const id = next();
        const e = findEntry(id);
        if (!e || e.category !== "natural_wonder") fail(`Unknown natural wonder: ${id}`);
        entries.push(e);
        break;
      }
      case "--wonder-tile": {
        const id = next();
        const e = findEntry(id);
        if (!e || e.category !== "wonder_tile") fail(`Unknown wonder tile: ${id}`);
        entries.push(e);
        break;
      }
      case "--subset": {
        const name = next();
        if (name === "terrain" || name === "tiles") entries.push(...TERRAIN_SUBSET);
        else if (name === "units") entries.push(...UNIT_SUBSET);
        else if (name === "unique-units") entries.push(...UNIQUE_UNIT_SUBSET);
        else if (name === "unique-infra") entries.push(...UNIQUE_INFRA_SUBSET);
        else if (name === "buildings") entries.push(...BUILDING_SUBSET);
        else if (name === "improvements") entries.push(...IMPROVEMENT_SUBSET);
        else if (name === "construction") entries.push(...CONSTRUCTION_SUBSET);
        else if (name === "cities") entries.push(...CITY_SUBSET);
        else if (name === "leaders") entries.push(...LEADER_SUBSET);
        else if (name === "great-people") entries.push(...GREAT_PERSON_SUBSET);
        else if (name === "legends") entries.push(...LEGEND_SUBSET);
        else if (name === "legend-units") entries.push(...LEGEND_UNIT_SUBSET);
        else if (name === "dirt-roads") entries.push(...DIRT_ROAD_SUBSET);
        else if (name === "stone-roads") entries.push(...STONE_ROAD_SUBSET);
        else if (name === "advanced-stone-roads") entries.push(...ADVANCED_STONE_ROAD_SUBSET);
        else if (name === "rivers") entries.push(...RIVER_SUBSET);
        else if (name === "resources") entries.push(...RESOURCE_SUBSET);
        else if (name === "ui") entries.push(...UI_SUBSET);
        else if (name === "icons") entries.push(...ICON_SUBSET);
        else if (name === "village-rewards") entries.push(...VILLAGE_REWARD_SUBSET);
        else if (name === "barbarian-rewards") entries.push(...BARBARIAN_REWARD_SUBSET);
        else if (name === "ages") entries.push(...AGE_SUBSET);
        else if (name === "pillars") entries.push(...PILLAR_SUBSET);
        else if (name === "heroes") entries.push(...HERO_SUBSET);
        else if (name === "turn-updates") entries.push(...TURN_UPDATE_SUBSET);
        else if (name === "turn-update-wonders") entries.push(...TURN_UPDATE_WONDER_SUBSET);
        else if (name === "turn-update-improvements") entries.push(...TURN_UPDATE_IMPROVEMENT_SUBSET);
        else if (name === "natural-wonders") entries.push(...NATURAL_WONDER_SUBSET);
        else if (name === "wonder-tiles") entries.push(...WONDER_TILE_SUBSET);
        else if (name === "all") entries.push(...allEntries());
        else fail(`Unknown subset: ${name}. Choose terrain, units, buildings, improvements, cities, leaders, dirt-roads, stone-roads, advanced-stone-roads, rivers, resources, ui, icons, village-rewards, barbarian-rewards, ages, pillars, heroes, turn-updates, turn-update-wonders, turn-update-improvements, natural-wonders, or all.`);
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

async function openTopHexMaskPath(width: number, height: number, outPath: string): Promise<void> {
  // Like hexMaskPath, but the region ABOVE the hex's two upper vertices is left
  // fully open (white) instead of slanting back to the top vertex. This keeps the
  // clean hex base (sides + bottom V) while letting a tall peak overhang upward,
  // matching the hand-painted hex-terrain/mountains.png silhouette.
  const cx = width / 2;
  const topY = height - width;
  const quarter = width / 4;
  const threeQuarter = (3 * width) / 4;
  const upperVertexY = topY + quarter; // y of the upper-left / upper-right hex vertices
  const polygon = `${cx},${topY} ${width},${topY + quarter} ${width},${topY + threeQuarter} ${cx},${height} 0,${topY + threeQuarter} 0,${topY + quarter}`;
  await runCmd("magick", [
    "-size", `${width}x${height}`, "xc:black",
    "-fill", "white",
    "-draw", `polygon ${polygon}`,
    "-draw", `rectangle 0,0 ${width - 1},${upperVertexY}`,
    outPath,
  ]);
}

async function lowerEdgeShadowAmountPath(width: number, height: number, outPath: string): Promise<void> {
  // Build a soft grayscale "shadow amount" map (≈0 in the interior, rising toward
  // the hex's LOWER edges) used to gently darken the base so the landmark reads as
  // resting in the tile — the soft grounding shadow seen in hex-terrain/mountains.png,
  // not a hard black outline. The top stays open (overhang), so no shadow there.
  const cx = width / 2;
  const topY = height - width;
  const quarter = width / 4;
  const threeQuarter = (3 * width) / 4;
  const upperVertexY = topY + quarter;
  const polygon = `${cx},${topY} ${width},${topY + quarter} ${width},${topY + threeQuarter} ${cx},${height} 0,${topY + threeQuarter} 0,${topY + quarter}`;
  await runCmd("magick", [
    "-size", `${width}x${height}`, "xc:black", "-fill", "white", "-draw", `polygon ${polygon}`,
    "(", "+clone", "-morphology", "Erode", "Disk:20", ")",
    "-compose", "Minus", "-composite", // perimeter band = hex − eroded hex
    "(", "-size", `${width}x${height}`, "xc:black", "-fill", "white", "-draw", `rectangle 0,${upperVertexY} ${width - 1},${height - 1}`, ")",
    "-compose", "Multiply", "-composite", // keep only the LOWER edges
    "-blur", "0x12", // soften into a gentle gradient
    "-evaluate", "Multiply", "0.4", // max darkening ≈ 40%
    outPath,
  ]);
}

async function postProcessOverhangTile(rawPath: string, outPath: string, entry: AssetEntry): Promise<void> {
  // Tall peak wonder: the model paints the mountain on a flat magenta backdrop.
  // We chroma-key the magenta away (sky around/above the peak becomes transparent)
  // and clip ONLY the base to the hex footprint, so the summit overhangs the tiles
  // above just like hex-terrain/mountains.png.
  const resizedPath = `${rawPath}.resized.png`;
  const keyedPath = `${rawPath}.keyed.png`;
  const magMaskPath = `${rawPath}.magmask.png`;
  const despilledPath = `${rawPath}.despill.png`;
  const cleanRgbPath = `${rawPath}.clean.png`;
  const shadowPath = `${rawPath}.shadow.png`;
  const shadedRgbPath = `${rawPath}.shaded.png`;
  const maskPath = `${rawPath}.mask.png`;
  const keyedAlphaPath = `${rawPath}.kalpha.png`;
  const finalAlphaPath = `${rawPath}.falpha.png`;

  // 1. Scale the generated image to the target tile canvas.
  await runCmd("magick", [rawPath, "-resize", `${entry.size.width}x${entry.size.height}!`, resizedPath]);

  // 2. Chroma-key the flat magenta backdrop to transparent. A generous fuzz cleans
  //    up the anti-aliased fringe; magenta is far from any natural rock/snow/sky.
  await runCmd("magick", [resizedPath, "-fuzz", "22%", "-transparent", "#FF00FF", "-define", "png:color-type=6", keyedPath]);

  // 3. Despill the magenta tint left on the anti-aliased silhouette edge. Only
  //    true-magenta pixels (R>G AND B>G) are pulled toward green; this leaves warm
  //    rock and bluish snow shadows untouched, so the painted look is preserved.
  await runCmd("magick", [keyedPath, "-alpha", "off", "-fx", "(r>g && b>g) ? 1 : 0", magMaskPath]);
  await runCmd("magick", [keyedPath, "-channel", "RB", "-fx", "min(u,g)", "+channel", despilledPath]);
  await runCmd("magick", [keyedPath, despilledPath, magMaskPath, "-compose", "over", "-composite", cleanRgbPath]);

  // 4. Paint a soft grounding shadow along the lower hex edges so the base reads as
  //    resting in the tile (like mountains.png) rather than being sliced. shaded =
  //    cleanRgb × (1 − shadowAmount); the top is left untouched so the peak overhangs.
  await lowerEdgeShadowAmountPath(entry.size.width, entry.size.height, shadowPath);
  await runCmd("magick", [cleanRgbPath, "(", shadowPath, "-negate", ")", "-compose", "Multiply", "-composite", shadedRgbPath]);

  // 5. Intersect the keyed alpha with an open-top hex mask so the base is clipped
  //    symmetrically to the hex while the peak above the hex is preserved.
  //    final alpha = keyedAlpha × hexMask.
  await openTopHexMaskPath(entry.size.width, entry.size.height, maskPath);
  await runCmd("magick", [keyedPath, "-alpha", "extract", keyedAlphaPath]);
  await runCmd("magick", [keyedAlphaPath, maskPath, "-compose", "Multiply", "-composite", finalAlphaPath]);
  await runCmd("magick", [shadedRgbPath, finalAlphaPath, "-compose", "CopyOpacity", "-composite", "-define", "png:color-type=6", outPath]);

  // Best-effort cleanup of temp files.
  await Promise.all([
    unlink(resizedPath).catch(() => {}),
    unlink(keyedPath).catch(() => {}),
    unlink(magMaskPath).catch(() => {}),
    unlink(despilledPath).catch(() => {}),
    unlink(cleanRgbPath).catch(() => {}),
    unlink(shadowPath).catch(() => {}),
    unlink(shadedRgbPath).catch(() => {}),
    unlink(maskPath).catch(() => {}),
    unlink(keyedAlphaPath).catch(() => {}),
    unlink(finalAlphaPath).catch(() => {}),
  ]);
}

async function postProcessEncapsulatedTile(rawPath: string, outPath: string, entry: AssetEntry): Promise<void> {
  // Flat wonder: the model paints a pointy-top HEXAGON filled by the wonder, with the
  // four frame corners outside the hexagon flat magenta. We anchor that square into the
  // bottom width×width hex footprint of the taller canvas (no overhang), chroma-key the
  // magenta corners away, despill the fringe, then intersect with the exact hex mask so
  // the geometry is perfect. A soft lower-edge shadow grounds it like a terrain tile.
  const footprint = entry.size.width; // bottom square = hex footprint
  const W = entry.size.width;
  const H = entry.size.height;
  const squarePath = `${rawPath}.square.png`;
  const keyedPath = `${rawPath}.keyed.png`;
  const fittedPath = `${rawPath}.fitted.png`;
  const canvasPath = `${rawPath}.canvas.png`;
  const magMaskPath = `${rawPath}.magmask.png`;
  const despilledPath = `${rawPath}.despill.png`;
  const cleanRgbPath = `${rawPath}.clean.png`;
  const shadowPath = `${rawPath}.shadow.png`;
  const shadedPath = `${rawPath}.shaded.png`;
  const maskPath = `${rawPath}.mask.png`;
  const canvasAlphaPath = `${rawPath}.calpha.png`;
  const finalAlphaPath = `${rawPath}.falpha.png`;

  // 1. Scale the generated hexagon to the footprint square.
  await runCmd("magick", [rawPath, "-resize", `${footprint}x${footprint}!`, squarePath]);

  // 2. Chroma-key the flat magenta corners (and any magenta margin) to transparent.
  await runCmd("magick", [squarePath, "-fuzz", "22%", "-transparent", "#FF00FF", "-define", "png:color-type=6", keyedPath]);

  // 3. Trim the transparent margin and rescale the drawn hexagon to fill the whole
  //    footprint — the model sometimes paints the hexagon slightly inset, which would
  //    otherwise leave the tile smaller than the hex. This makes it always fill.
  await runCmd("magick", [keyedPath, "-trim", "+repage", "-resize", `${footprint}x${footprint}!`, fittedPath]);

  // 4. Anchor it at the bottom of the tall canvas (top region stays transparent — no overhang).
  await runCmd("magick", [fittedPath, "-background", "none", "-gravity", "south", "-extent", `${W}x${H}`, canvasPath]);

  // 5. Despill the magenta tint on the anti-aliased hexagon edge (only true-magenta
  //    pixels, R>G AND B>G, are pulled toward green — natural colors are untouched).
  await runCmd("magick", [canvasPath, "-alpha", "off", "-fx", "(r>g && b>g) ? 1 : 0", magMaskPath]);
  await runCmd("magick", [canvasPath, "-channel", "RB", "-fx", "min(u,g)", "+channel", despilledPath]);
  await runCmd("magick", [canvasPath, despilledPath, magMaskPath, "-compose", "over", "-composite", cleanRgbPath]);

  // 6. Soft grounding shadow along the lower hex edges (same as terrain tiles).
  await lowerEdgeShadowAmountPath(W, H, shadowPath);
  await runCmd("magick", [cleanRgbPath, "(", shadowPath, "-negate", ")", "-compose", "Multiply", "-composite", shadedPath]);

  // 7. Intersect the (now full-bleed) keyed alpha with the exact hex mask for perfect
  //    geometry. final alpha = canvasAlpha × hexMask.
  await hexMaskPath(W, H, maskPath);
  await runCmd("magick", [canvasPath, "-alpha", "extract", canvasAlphaPath]);
  await runCmd("magick", [canvasAlphaPath, maskPath, "-compose", "Multiply", "-composite", finalAlphaPath]);
  await runCmd("magick", [shadedPath, finalAlphaPath, "-compose", "CopyOpacity", "-composite", "-define", "png:color-type=6", outPath]);

  await Promise.all([
    unlink(squarePath).catch(() => {}),
    unlink(keyedPath).catch(() => {}),
    unlink(fittedPath).catch(() => {}),
    unlink(canvasPath).catch(() => {}),
    unlink(magMaskPath).catch(() => {}),
    unlink(despilledPath).catch(() => {}),
    unlink(cleanRgbPath).catch(() => {}),
    unlink(shadowPath).catch(() => {}),
    unlink(shadedPath).catch(() => {}),
    unlink(maskPath).catch(() => {}),
    unlink(canvasAlphaPath).catch(() => {}),
    unlink(finalAlphaPath).catch(() => {}),
  ]);
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

  // Step 1: color-key the solid white/light background out and trim to the
  // figure. This "cleaned" image keeps the model's full resolution.
  const cleaned = `${rawPath}.clean.png`;
  await runCmd("magick", [
    source,
    "-fuzz",
    "20%",
    "-transparent",
    "white",
    "-trim",
    "+repage",
    "-define",
    "png:color-type=6",
    cleaned,
  ]);

  // Step 2: keep the full-size, background-removed art alongside the token so
  // the wiki (and any hi-res use) can show big crisp images. units → units-full.
  if (entry.category === "unit") {
    const fullDir = join(dirname(outPath), "..", "units-full");
    await mkdir(fullDir, { recursive: true });
    await copyFile(cleaned, join(fullDir, basename(outPath)));
  }

  // Step 3: the resized token, padded/cropped to the exact target size.
  await runCmd("magick", [
    cleaned,
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
  await unlink(cleaned).catch(() => {});
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

async function postProcessIcon(rawPath: string, finalDir: string, entry: AssetEntry): Promise<void> {
  // Generate a full set of PWA icon variants from one high-res source.
  // Square icons are center-cropped from the generated 1:1 image.
  const base = join(finalDir, entry.id);

  // 512x512 main icon.
  await runCmd("magick", [
    rawPath,
    "-resize",
    "512x512^",
    "-gravity",
    "center",
    "-extent",
    "512x512",
    "-define",
    "png:color-type=6",
    `${base}.png`,
  ]);

  // 192x192 standard icon.
  await runCmd("magick", [
    rawPath,
    "-resize",
    "192x192^",
    "-gravity",
    "center",
    "-extent",
    "192x192",
    "-define",
    "png:color-type=6",
    `${base}_192.png`,
  ]);

  // 180x180 Apple touch icon on a solid background matching the game UI.
  await runCmd("magick", [
    rawPath,
    "-resize",
    "180x180^",
    "-gravity",
    "center",
    "-extent",
    "180x180",
    "-define",
    "png:color-type=6",
    `${base}_180.png`,
  ]);

  // 192x192 maskable icon: keep content within the central safe zone by
  // padding the artwork so it survives Android's icon shape masking.
  await runCmd("magick", [
    rawPath,
    "-resize",
    "154x154^",
    "-gravity",
    "center",
    "-extent",
    "154x154",
    "-background",
    "none",
    "-gravity",
    "center",
    "-extent",
    "192x192",
    "-define",
    "png:color-type=6",
    `${base}_maskable.png`,
  ]);
}

async function postProcessFavicon(rawPath: string, finalDir: string, entry: AssetEntry): Promise<void> {
  // Browser favicon set: multi-resolution ICO plus PNG fallbacks.
  const base = join(finalDir, entry.id);

  // 32x32 PNG fallback used by most modern browsers.
  await runCmd("magick", [
    rawPath,
    "-resize",
    "32x32^",
    "-gravity",
    "center",
    "-extent",
    "32x32",
    "-define",
    "png:color-type=6",
    `${base}-32x32.png`,
  ]);

  // 16x16 PNG fallback.
  await runCmd("magick", [
    rawPath,
    "-resize",
    "16x16^",
    "-gravity",
    "center",
    "-extent",
    "16x16",
    "-define",
    "png:color-type=6",
    `${base}-16x16.png`,
  ]);

  // Multi-resolution ICO for legacy browsers / bookmarks.
  await runCmd("magick", [
    rawPath,
    "-define",
    "icon:auto-resize=16,32,48,64",
    `${base}.ico`,
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
    entry.category === "construction" ? "construction" :
    entry.category === "natural_wonder" ? "natural-wonders" :
    entry.category === "wonder_tile" ? "wonders" :
    entry.category === "great_person" ? "great-people" :
    entry.category === "legend" ? "legends" :
    entry.category === "ui" ? "ui" :
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

      if (entry.category === "natural_wonder" && entry.overhang) {
        // Tall peak wonders overhang the hex — chroma-key + base-only hex clip.
        await postProcessOverhangTile(rawPath, finalPath, entry);
      } else if (entry.category === "natural_wonder" && entry.encapsulated) {
        // Flat wonders: a self-contained 1:1 tile placed into the hex footprint.
        await postProcessEncapsulatedTile(rawPath, finalPath, entry);
      } else if (entry.category === "tile" || entry.category === "road" || entry.category === "river" || entry.category === "natural_wonder") {
        // Natural wonders are full hex tiles — same hex-masked tile pipeline.
        await postProcessTile(rawPath, finalPath, entry);
      } else if (entry.category === "leader" || entry.category === "great_person" || entry.category === "legend" || entry.category === "age" || entry.category === "pillar" || entry.category === "hero" || entry.category === "turn_update") {
        await postProcessPortrait(rawPath, finalPath, entry);
      } else if (entry.category === "icon" && entry.id === "favicon") {
        await postProcessFavicon(rawPath, finalDir, entry);
      } else if (entry.category === "icon") {
        await postProcessIcon(rawPath, finalDir, entry);
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
