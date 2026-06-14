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
  // civilian
  { id: "settler", name: "Settler", description: "a lone ancient settler on foot wearing simple hide and woven clothing, carrying basic belongings, no animals, wagons, or companions", category: "unit", aspectRatio: "1:1", size: { width: 128, height: 128 } },
  { id: "worker", name: "Worker", description: "an ancient laborer in simple clothing using a basic flint, bone, or bronze tool", category: "unit", aspectRatio: "1:1", size: { width: 128, height: 128 } },
  // recon
  { id: "scout", name: "Scout", description: "a lightly armed ancient explorer in hides with a simple wooden staff", category: "unit", aspectRatio: "1:1", size: { width: 128, height: 128 } },
  // dawn melee / ranged
  { id: "clubman", name: "Clubman", description: "a stone-age warrior wielding a simple wooden club, no metal", category: "unit", aspectRatio: "1:1", size: { width: 128, height: 128 } },
  { id: "warrior", name: "Warrior", description: "a tribal early fighter with a stone axe or wooden club, no shield, no metal armor or helmet", category: "unit", aspectRatio: "1:1", size: { width: 128, height: 128 } },
  { id: "slinger", name: "Slinger", description: "a skirmisher with a simple leather sling, no metal", category: "unit", aspectRatio: "1:1", size: { width: 128, height: 128 } },
  { id: "javelineer", name: "Javelineer", description: "a light ranged fighter holding a throwing javelin, wearing hide or simple cloth", category: "unit", aspectRatio: "1:1", size: { width: 128, height: 128 } },
  { id: "hunter", name: "Hunter", description: "a tracker with a simple wooden bow or spear and hide clothing", category: "unit", aspectRatio: "1:1", size: { width: 128, height: 128 } },
  // early tech
  { id: "firehard_spear", name: "Fire-Hardened Spearman", description: "an early spearman with a fire-hardened wooden spear and simple hide armor, no metal", category: "unit", aspectRatio: "1:1", size: { width: 128, height: 128 } },
  { id: "war_dog", name: "War Dogs", description: "a pair of trained war dogs with simple hide harnesses, no metal", category: "unit", aspectRatio: "1:1", size: { width: 128, height: 128 } },
  { id: "archer", name: "Archer", description: "a bronze-age bowman drawing a composite bow with flint or bronze tipped arrows", category: "unit", aspectRatio: "1:1", size: { width: 128, height: 128 } },
  // bronze
  { id: "axeman", name: "Bronze Axeman", description: "a bronze-age warrior with a bronze axe and simple leather or bronze armor", category: "unit", aspectRatio: "1:1", size: { width: 128, height: 128 } },
  { id: "maceman", name: "Maceman", description: "a bronze-age warrior with a stone or bronze mace and hide or leather armor", category: "unit", aspectRatio: "1:1", size: { width: 128, height: 128 } },
  { id: "spearman", name: "Spearman", description: "a bronze-age spearman with a long bronze spear and a simple shield", category: "unit", aspectRatio: "1:1", size: { width: 128, height: 128 } },
  { id: "hoplite", name: "Hoplite", description: "a classical hoplite with bronze cuirass, crested helmet, large round shield, and long spear", category: "unit", aspectRatio: "1:1", size: { width: 128, height: 128 } },
  // cavalry
  { id: "light_chariot", name: "Light Chariot", description: "a fast two-wheeled wooden chariot pulled by horses with a driver holding a bow or javelin", category: "unit", aspectRatio: "1:1", size: { width: 128, height: 128 } },
  { id: "war_chariot", name: "War Chariot", description: "a heavier two-wheeled wooden chariot pulled by horses with an armored crew", category: "unit", aspectRatio: "1:1", size: { width: 128, height: 128 } },
  { id: "rider", name: "Rider", description: "a mounted cavalry rider on horseback with a spear or axe and simple armor", category: "unit", aspectRatio: "1:1", size: { width: 128, height: 128 } },
  { id: "horse_archer", name: "Horse Archer", description: "a mounted archer on horseback drawing a composite bow", category: "unit", aspectRatio: "1:1", size: { width: 128, height: 128 } },
  // iron / classical
  { id: "swordsman", name: "Swordsman", description: "an iron-age swordsman with a short iron sword, shield, and leather or bronze armor", category: "unit", aspectRatio: "1:1", size: { width: 128, height: 128 } },
  { id: "longswordsman", name: "Longswordsman", description: "a classical warrior with a long iron sword and chain or scale armor", category: "unit", aspectRatio: "1:1", size: { width: 128, height: 128 } },
  { id: "pikeman", name: "Pikeman", description: "an infantry soldier with a long iron-tipped pike and simple armor", category: "unit", aspectRatio: "1:1", size: { width: 128, height: 128 } },
  { id: "cataphract", name: "Cataphract", description: "a heavily armored mounted rider on a barded horse with a lance or sword", category: "unit", aspectRatio: "1:1", size: { width: 128, height: 128 } },
  { id: "crossbowman", name: "Crossbowman", description: "a soldier aiming a crossbow, wearing simple medieval-style armor", category: "unit", aspectRatio: "1:1", size: { width: 128, height: 128 } },
  { id: "legionary", name: "Legionary", description: "a Roman-style legionary with a short iron gladius, rectangular shield, and segmented armor", category: "unit", aspectRatio: "1:1", size: { width: 128, height: 128 } },
  { id: "war_elephant", name: "War Elephant", description: "a war elephant with a wooden howdah and crew, used in battle", category: "unit", aspectRatio: "1:1", size: { width: 128, height: 128 } },
  // siege
  { id: "battering_ram", name: "Battering Ram", description: "a wooden siege ram with a roofed frame and crew pushing it", category: "unit", aspectRatio: "1:1", size: { width: 128, height: 128 } },
  { id: "catapult", name: "Catapult", description: "a classical torsion catapult stone-throwing siege engine", category: "unit", aspectRatio: "1:1", size: { width: 128, height: 128 } },
  { id: "ballista", name: "Ballista", description: "a large bolt-shooting ballista siege engine", category: "unit", aspectRatio: "1:1", size: { width: 128, height: 128 } },
];

export const CITY_SUBSET: AssetEntry[] = [
  { id: "city_1", name: "Hamlet", description: "about 1 small ancient mud-brick house, no walls, no fortifications, no defensive structures, same hand-painted stylized ancient mud-brick style as the other city tiers", category: "building", aspectRatio: "1:1", size: { width: 128, height: 128 } },
  { id: "city_2", name: "Small Village", description: "about 2 ancient mud-brick houses grouped together, no walls, no fortifications, same hand-painted stylized ancient mud-brick style as the other city tiers", category: "building", aspectRatio: "1:1", size: { width: 144, height: 144 } },
  { id: "city_3", name: "Village", description: "about 3 ancient mud-brick houses grouped together, no walls, no fortifications, same hand-painted stylized ancient mud-brick style as the other city tiers", category: "building", aspectRatio: "1:1", size: { width: 160, height: 160 } },
  { id: "city_4", name: "Large Village", description: "about 4 ancient mud-brick houses grouped together, no walls, no fortifications, same hand-painted stylized ancient mud-brick style as the other city tiers", category: "building", aspectRatio: "1:1", size: { width: 176, height: 176 } },
  { id: "city_5", name: "Small Town", description: "about 5 ancient mud-brick houses grouped together, no walls, no fortifications, same hand-painted stylized ancient mud-brick style as the other city tiers", category: "building", aspectRatio: "1:1", size: { width: 192, height: 192 } },
  { id: "city_6", name: "Town", description: "about 6 ancient mud-brick houses grouped together, no walls, no fortifications, same hand-painted stylized ancient mud-brick style as the other city tiers", category: "building", aspectRatio: "1:1", size: { width: 208, height: 208 } },
  { id: "city_7", name: "Large Town", description: "about 7 ancient mud-brick houses grouped together, no walls, no fortifications, same hand-painted stylized ancient mud-brick style as the other city tiers", category: "building", aspectRatio: "1:1", size: { width: 224, height: 224 } },
  { id: "city_8", name: "Small City", description: "about 8 ancient mud-brick houses grouped together, no walls, no fortifications, same hand-painted stylized ancient mud-brick style as the other city tiers", category: "building", aspectRatio: "1:1", size: { width: 240, height: 240 } },
  { id: "city_9", name: "City", description: "about 9 ancient mud-brick houses grouped together, no walls, no fortifications, same hand-painted stylized ancient mud-brick style as the other city tiers", category: "building", aspectRatio: "1:1", size: { width: 256, height: 256 } },
  { id: "city_10", name: "Great City", description: "about 10 ancient mud-brick houses grouped together, no walls, no fortifications, same hand-painted stylized ancient mud-brick style as the other city tiers", category: "building", aspectRatio: "1:1", size: { width: 272, height: 272 } },
];

export const BUILDING_SUBSET: AssetEntry[] = [
  { id: "village", name: "Village", description: "a small tribal village with a few thatched-roof huts, no walls, no fortifications, no background terrain", category: "building", aspectRatio: "1:1", size: { width: 128, height: 128 } },
  { id: "farm", name: "Farm", description: "a small cultivated farm plot with neat rows of golden crops and a tiny wooden shed, no walls, no background terrain", category: "building", aspectRatio: "1:1", size: { width: 128, height: 128 } },
  { id: "granary", name: "Granary", description: "a small grain store with earthen walls", category: "building", aspectRatio: "1:1", size: { width: 128, height: 128 } },
  { id: "barracks", name: "Barracks", description: "a simple military training hall", category: "building", aspectRatio: "1:1", size: { width: 128, height: 128 } },
  { id: "market", name: "Market", description: "a covered marketplace with stalls", category: "building", aspectRatio: "1:1", size: { width: 128, height: 128 } },
  { id: "library", name: "Library", description: "a classical archive with scroll shelves", category: "building", aspectRatio: "1:1", size: { width: 128, height: 128 } },
  { id: "monument", name: "Monument", description: "a standing stone or small obelisk", category: "building", aspectRatio: "1:1", size: { width: 128, height: 128 } },
  { id: "temple", name: "Temple", description: "an ancient temple with columns", category: "building", aspectRatio: "1:1", size: { width: 128, height: 128 } },
];

export function allEntries(): AssetEntry[] {
  return [...TERRAIN_SUBSET, ...UNIT_SUBSET, ...CITY_SUBSET, ...BUILDING_SUBSET];
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
    return `Create a small standalone unit token/icon for an ancient turn-based strategy game spanning the Stone Age to the Classical era. Subject: ${entry.name} — ${entry.description}. Match the painted, slightly stylized look of the attached hex tile reference. Render the subject from a near-top-down or three-quarter view, centered, in a static idle pose standing still and facing toward the right side of the image, as an isolated figure on a clean solid white background. Use only materials and technology appropriate to the unit's era and description; no anachronistic weapons, armor, or equipment. No walking, running, attacking, or action motion; no motion blur or dynamic swinging of limbs/weapons. No text, no UI, no border, no ground plane, no terrain, no grass, no dirt, no base platform, and no cast shadow underneath the figure. The unit should float cleanly on the white background with nothing else in the frame.`;
  }
  return `Create a small standalone building icon for a turn-based strategy game. Subject: ${entry.name} — ${entry.description}. Match the painted, slightly stylized look of the attached hex tile reference. Render the subject from a three-quarter or near-top-down view, centered, as an isolated building on a clean solid white background. No text, no UI, no border, no ground plane, no terrain, no grass, no dirt, no base platform, and no cast shadow underneath. The building should float cleanly on the white background with nothing else in the frame.`;
}
