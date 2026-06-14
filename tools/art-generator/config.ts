// Configuration for the AI art generator.
//
// Defaults are tuned for the Rise of Civilizations hex sprite style:
// - sample tiles live under "Hex Samples/"
// - generated output lands in assets/generated/
// - Google Gemini Nano Banana 2 (gemini-3.1-flash-image) is the default model.

import { join } from "node:path";

export interface TargetSize {
  readonly width: number;
  readonly height: number;
}

export interface AssetEntry {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly aspectRatio: string;
  readonly size: TargetSize;
  readonly referenceTile?: string;
  readonly category: "tile" | "unit" | "building";
}

export const DEFAULT_MODEL = "gemini-3.1-flash-image";
export const DEFAULT_IMAGE_SIZE = "1K";
export const DEFAULT_REFERENCE_DIR = "Hex Samples/Hex Basic Terrain Set";
export const DEFAULT_REFERENCE_TILE = "hexPlains00.png";
export const DEFAULT_OUTPUT_DIR = "assets/generated";

// Available Gemini image sizes (API values).
export const VALID_IMAGE_SIZES = ["512", "1K", "2K", "4K"] as const;
export type ImageSize = (typeof VALID_IMAGE_SIZES)[number];

export const TERRAIN_SUBSET: AssetEntry[] = [
  { id: "ocean", name: "Ocean", description: "deep blue open sea with gentle waves", category: "tile", aspectRatio: "2:3", size: { width: 256, height: 384 }, referenceTile: "hexOcean00.png" },
  { id: "coast", name: "Coast", description: "sandy shoreline meeting turquoise water", category: "tile", aspectRatio: "2:3", size: { width: 256, height: 384 }, referenceTile: "hexPlains00.png" },
  { id: "lake", name: "Lake", description: "calm freshwater surrounded by reeds", category: "tile", aspectRatio: "2:3", size: { width: 256, height: 384 }, referenceTile: "hexPlains00.png" },
  { id: "plains", name: "Plains", description: "golden grasslands under a bright sky", category: "tile", aspectRatio: "2:3", size: { width: 256, height: 384 }, referenceTile: "hexPlains00.png" },
  { id: "grassland", name: "Grassland", description: "lush green meadows with soft hills", category: "tile", aspectRatio: "2:3", size: { width: 256, height: 384 }, referenceTile: "hexPlains00.png" },
  { id: "desert", name: "Desert", description: "sandy dunes with scattered dry brush", category: "tile", aspectRatio: "2:3", size: { width: 256, height: 384 }, referenceTile: "hexDesertDunes00.png" },
  { id: "tundra", name: "Tundra", description: "cold windswept plain with sparse moss", category: "tile", aspectRatio: "2:3", size: { width: 256, height: 384 }, referenceTile: "hexScrublands00.png" },
  { id: "snow", name: "Snow", description: "white snow-covered field with soft drifts", category: "tile", aspectRatio: "2:3", size: { width: 256, height: 384 }, referenceTile: "hexScrublands00.png" },
  { id: "forest", name: "Forest", description: "dense broadleaf trees covering the ground", category: "tile", aspectRatio: "2:3", size: { width: 256, height: 384 }, referenceTile: "hexForestBroadleaf00.png" },
  { id: "jungle", name: "Jungle", description: "tropical overgrowth with thick vines", category: "tile", aspectRatio: "2:3", size: { width: 256, height: 384 }, referenceTile: "hexForestBroadleaf00.png" },
  { id: "hills", name: "Hills", description: "rolling green hills with rocky outcrops", category: "tile", aspectRatio: "2:3", size: { width: 256, height: 384 }, referenceTile: "hexHills00.png" },
  { id: "mountains", name: "Mountains", description: "tall snow-capped peaks and cliffs", category: "tile", aspectRatio: "2:3", size: { width: 256, height: 384 }, referenceTile: "hexMountain00.png" },
];

export const UNIT_SUBSET: AssetEntry[] = [
  { id: "settler", name: "Settler", description: "a lone prehistoric settler on foot wearing simple animal hides, carrying basic hide and woven belongings, no animals, wagons, or companions", category: "unit", aspectRatio: "1:1", size: { width: 128, height: 128 } },
  { id: "worker", name: "Worker", description: "a stone-age laborer in hide clothing using a simple flint or bone tool", category: "unit", aspectRatio: "1:1", size: { width: 128, height: 128 } },
  { id: "scout", name: "Scout", description: "a prehistoric explorer in animal hides carrying a simple wooden staff", category: "unit", aspectRatio: "1:1", size: { width: 128, height: 128 } },
  { id: "clubman", name: "Clubman", description: "a stone-age warrior wielding a simple wooden club, no metal", category: "unit", aspectRatio: "1:1", size: { width: 128, height: 128 } },
  { id: "warrior", name: "Warrior", description: "a tribal prehistoric fighter with a stone axe or wooden club, no shield, no metal armor or helmet", category: "unit", aspectRatio: "1:1", size: { width: 128, height: 128 } },
  { id: "slinger", name: "Slinger", description: "a prehistoric skirmisher with a simple leather sling, no metal", category: "unit", aspectRatio: "1:1", size: { width: 128, height: 128 } },
  { id: "archer", name: "Archer", description: "a prehistoric hunter with a simple wooden bow and flint-tipped arrows", category: "unit", aspectRatio: "1:1", size: { width: 128, height: 128 } },
  { id: "spearman", name: "Spearman", description: "a tribal fighter with a sharpened wooden or stone-tipped spear, no shield, no metal", category: "unit", aspectRatio: "1:1", size: { width: 128, height: 128 } },
  { id: "swordsman", name: "Swordsman", description: "an iron-age soldier with a short sword and shield", category: "unit", aspectRatio: "1:1", size: { width: 128, height: 128 } },
  { id: "light_chariot", name: "Light Chariot", description: "a fast two-wheeled chariot pulled by horses", category: "unit", aspectRatio: "1:1", size: { width: 128, height: 128 } },
  { id: "rider", name: "Rider", description: "a mounted cavalry scout", category: "unit", aspectRatio: "1:1", size: { width: 128, height: 128 } },
  { id: "catapult", name: "Catapult", description: "a classical stone-throwing siege engine", category: "unit", aspectRatio: "1:1", size: { width: 128, height: 128 } },
];

export const BUILDING_SUBSET: AssetEntry[] = [
  { id: "granary", name: "Granary", description: "a small grain store with earthen walls", category: "building", aspectRatio: "1:1", size: { width: 128, height: 128 } },
  { id: "barracks", name: "Barracks", description: "a simple military training hall", category: "building", aspectRatio: "1:1", size: { width: 128, height: 128 } },
  { id: "market", name: "Market", description: "a covered marketplace with stalls", category: "building", aspectRatio: "1:1", size: { width: 128, height: 128 } },
  { id: "library", name: "Library", description: "a classical archive with scroll shelves", category: "building", aspectRatio: "1:1", size: { width: 128, height: 128 } },
  { id: "monument", name: "Monument", description: "a standing stone or small obelisk", category: "building", aspectRatio: "1:1", size: { width: 128, height: 128 } },
  { id: "temple", name: "Temple", description: "an ancient temple with columns", category: "building", aspectRatio: "1:1", size: { width: 128, height: 128 } },
];

export function allEntries(): AssetEntry[] {
  return [...TERRAIN_SUBSET, ...UNIT_SUBSET, ...BUILDING_SUBSET];
}

export function findEntry(id: string): AssetEntry | undefined {
  return allEntries().find((e) => e.id === id);
}

export function referencePath(entry: AssetEntry, referenceDir = DEFAULT_REFERENCE_DIR): string {
  const fileName = entry.referenceTile ?? DEFAULT_REFERENCE_TILE;
  return join(referenceDir, fileName);
}

export function promptFor(entry: AssetEntry): string {
  if (entry.category === "tile") {
    return `Create a flat 2D hand-painted hexagonal strategy game tile for "${entry.name}". ${entry.description}. Match the visual style of the attached reference tile: slightly stylized, saturated but natural colors, readable at small sizes, and framed inside a vertical 2:3 pointy-top hex. IMPORTANT: do not include roads, paths, houses, huts, fences, farms, or any buildings or man-made structures — those will be added as separate tile improvements. Render as a flat 2D illustration with no 3D perspective, no realistic depth, no depth-of-field, and no camera angle shifts. Keep the same overall composition, camera angle, and hex footprint as the reference; vary only subtle natural details like texture, lighting, and vegetation so the grid remains uniform. The artwork must be fully self-contained and look correct in isolation; avoid paths, rivers, shadows, or objects that appear to continue off the tile edges. Preserve the soft shadow along the bottom edges of the hex, similar to the reference tile.`;
  }
  if (entry.category === "unit") {
    return `Create a small standalone unit token/icon for a prehistoric turn-based strategy game set around 5000 BCE. Subject: ${entry.name} — ${entry.description}. Match the painted, slightly stylized look of the attached hex tile reference. Render the subject from a near-top-down or three-quarter view, centered, in a static idle pose standing still and facing toward the right side of the image, as an isolated figure on a clean solid white background. Use only stone, wood, bone, leather, and hide materials; no metal, no shields, no helmets, no advanced armor, no wheels, no sails, and no domesticated beasts of burden. No walking, running, attacking, or action motion; no motion blur or dynamic swinging of limbs/weapons. No text, no UI, no border, no ground plane, no terrain, no grass, no dirt, no base platform, and no cast shadow underneath the figure. The unit should float cleanly on the white background with nothing else in the frame.`;
  }
  return `Create a small building icon for a turn-based strategy game. Subject: ${entry.name} — ${entry.description}. Match the painted, slightly stylized look of the attached hex tile reference. Render the building from a three-quarter view, centered, on a clean solid white background. No text, no UI, no border.`;
}
