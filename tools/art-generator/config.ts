// Configuration for the AI art generator.
//
// Defaults are tuned for the Rise of Civilizations hex sprite style:
// - sample tiles live under "Hex Samples/"
// - generated output lands in assets/generated/
// - Google Gemini Nano Banana 2 (gemini-3.1-flash-image) is the default model.

import { join } from "node:path";
import { CIVILIZATIONS, WONDER_DEFS, UNIQUE_UNITS, UNIQUE_INFRA, NATURAL_WONDER_DEFS, GREAT_PEOPLE, GREAT_PERSON_CLASS_INFO, LEGENDS } from "@roc/data";
import { RESOURCE_DEFS, IMPROVEMENT_DEFS, UNIT_DEFS } from "@roc/sim";

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
  readonly category: "tile" | "unit" | "building" | "leader" | "road" | "river" | "resource" | "improvement" | "construction" | "ui" | "icon" | "village_reward" | "barbarian_reward" | "age" | "pillar" | "hero" | "turn_update" | "natural_wonder" | "wonder_tile" | "great_person" | "legend";
  /** Tall natural wonders (peaks, spires, tepuis) whose summit should rise ABOVE
   *  the hex footprint and overhang the tiles above — like the hand-painted
   *  hex-terrain/mountains.png. Generated on a flat magenta chroma-key backdrop
   *  and post-processed so only the base is clipped to the hex (see generate.ts). */
  readonly overhang?: boolean;
  /** Flat natural wonders (lakes, reefs, deserts, salt flats, wetlands, falls)
   *  that fully FILL a single hex tile with no overhang. Generated 1:1 with the
   *  content encapsulated and resolving at every edge, then placed into the bottom
   *  256×256 hex footprint of the 256×384 tile (see postProcessEncapsulatedTile). */
  readonly encapsulated?: boolean;
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
  { id: "trader", name: "Trader", description: "an ancient trader in travel clothing with a small wooden cart or pack animal loaded with clay jars, cloth bundles, and trade goods", category: "unit", aspectRatio: "1:1", size: { width: 128, height: 128 } },
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
  { id: "hoplite", name: "Heavy Spearman", description: "a heavy spear infantryman with a bronze cuirass, helmet, large round shield, and long thrusting spear (generic, not nation-specific)", category: "unit", aspectRatio: "1:1", size: { width: 128, height: 128 } },
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
  { id: "legionary", name: "Heavy Infantry", description: "a disciplined professional heavy infantryman with a short iron sword, large rectangular shield, helmet, and lamellar armor (generic, not nation-specific)", category: "unit", aspectRatio: "1:1", size: { width: 128, height: 128 } },
  { id: "war_elephant", name: "War Elephant", description: "a war elephant with a wooden howdah and crew, used in battle", category: "unit", aspectRatio: "1:1", size: { width: 128, height: 128 } },
  // siege
  { id: "battering_ram", name: "Battering Ram", description: "a wooden siege ram with a roofed frame and crew pushing it", category: "unit", aspectRatio: "1:1", size: { width: 128, height: 128 } },
  { id: "catapult", name: "Catapult", description: "a classical torsion catapult stone-throwing siege engine", category: "unit", aspectRatio: "1:1", size: { width: 128, height: 128 } },
  { id: "ballista", name: "Ballista", description: "a large bolt-shooting ballista siege engine", category: "unit", aspectRatio: "1:1", size: { width: 128, height: 128 } },
  // early gunpowder
  { id: "hand_cannon", name: "Hand Cannon", description: "a late-medieval handgunner firing an early hand cannon, a short iron tube on a wooden stock with a smoking touch-hole", category: "unit", aspectRatio: "1:1", size: { width: 128, height: 128 } },
  { id: "matchlock", name: "Matchlock Infantry", description: "an early matchlock arquebusier soldier aiming a long matchlock firearm rested on a forked stand, with a smoldering match cord", category: "unit", aspectRatio: "1:1", size: { width: 128, height: 128 } },
  { id: "bombard", name: "Bombard", description: "a huge early siege bombard cannon, a massive cast-bronze barrel on a heavy timber cradle, of the kind that breached the walls of Constantinople", category: "unit", aspectRatio: "1:1", size: { width: 128, height: 128 } },
  // naval — warships (melee)
  { id: "galley", name: "Galley", description: "an early oared wooden galley warship with a single bank of oars and a small square sail, ancient Mediterranean style", category: "unit", aspectRatio: "1:1", size: { width: 128, height: 128 } },
  { id: "bireme", name: "Bireme", description: "an ancient war galley with two banks of oars and a bronze ram at the prow", category: "unit", aspectRatio: "1:1", size: { width: 128, height: 128 } },
  { id: "trireme", name: "Trireme", description: "a classical Greek trireme warship with three banks of oars, a single sail, and a bronze ram at the bow", category: "unit", aspectRatio: "1:1", size: { width: 128, height: 128 } },
  { id: "quinquereme", name: "Quinquereme", description: "a large ancient war galley with multiple banks of oars, a reinforced bronze ram, and a raised fighting deck", category: "unit", aspectRatio: "1:1", size: { width: 128, height: 128 } },
  { id: "longship", name: "Longship", description: "a Viking longship with a single square sail, rows of oars, a carved dragon-head prow, and round shields along the hull", category: "unit", aspectRatio: "1:1", size: { width: 128, height: 128 } },
  { id: "caravel", name: "Caravel", description: "a small ocean-going caravel with lateen and square sails on two or three masts, an Age of Exploration sailing ship", category: "unit", aspectRatio: "1:1", size: { width: 128, height: 128 } },
  // naval — ranged
  { id: "dromon", name: "Dromon", description: "a Byzantine dromon war galley with lateen sails and oars, armed with a Greek-fire siphon at the bow", category: "unit", aspectRatio: "1:1", size: { width: 128, height: 128 } },
  { id: "war_junk", name: "War Junk", description: "a Chinese war junk with battened ribbed sails, a high stern, and a sturdy wooden hull", category: "unit", aspectRatio: "1:1", size: { width: 128, height: 128 } },
  { id: "galleass", name: "Galleass", description: "a large oared-and-sailed galleass warship with gun ports and a raised fighting platform", category: "unit", aspectRatio: "1:1", size: { width: 128, height: 128 } },
  { id: "galleon", name: "Galleon", description: "a tall multi-masted galleon with square sails, a high sterncastle, and rows of cannon ports", category: "unit", aspectRatio: "1:1", size: { width: 128, height: 128 } },
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

export const LEADER_SUBSET: AssetEntry[] = CIVILIZATIONS.map((civ) => ({
  id: civ.id,
  name: civ.leader,
  // Keep only the ability name so the model does not paint stat overlays
  // (+20%, +2, etc.) onto the portrait.
  description: `${civ.name} under ${civ.leader}, celebrated for ${civ.abilityName}`,
  aspectRatio: "3:4",
  size: { width: 320, height: 400 },
  category: "leader" as const,
  referenceTile: DEFAULT_REFERENCE_TILE,
}));

/** One portrait per Great Person, in the same painted style as leader portraits.
 *  Output: great-people/<id>.png. */
export const GREAT_PERSON_SUBSET: AssetEntry[] = GREAT_PEOPLE.map((g) => ({
  id: g.id,
  name: g.name,
  description: `the renowned ${GREAT_PERSON_CLASS_INFO[g.cls].name} of the ${g.era} era`,
  aspectRatio: "3:4",
  size: { width: 320, height: 400 },
  category: "great_person" as const,
  referenceTile: DEFAULT_REFERENCE_TILE,
}));

/** One portrait per Legend (hero), in the same painted style as leader portraits.
 *  Output: legends/<id>.png. */
export const LEGEND_SUBSET: AssetEntry[] = LEGENDS.map((l) => ({
  id: l.id,
  name: l.name,
  description: `the legendary ${l.type === "naval" ? "admiral" : l.type === "support" ? "leader" : "warrior"} hero of the ${l.era} era`,
  aspectRatio: "3:4",
  size: { width: 320, height: 400 },
  category: "legend" as const,
  referenceTile: DEFAULT_REFERENCE_TILE,
}));

/** One on-map UNIT TOKEN per Legend (hero), keyed by the legend id so the overlay
 *  can draw it for the hero unit. Output: units/<id>.png. */
export const LEGEND_UNIT_SUBSET: AssetEntry[] = LEGENDS.map((l) => {
  const base = UNIT_DEFS[l.baseType as keyof typeof UNIT_DEFS]?.name ?? l.baseType;
  return {
    id: l.id,
    name: l.name,
    description: `${l.name}, the legendary ${l.era}-era hero, depicted as a single heroic, ornate ${base.toLowerCase()} champion with distinctive regalia, finer armor, and a commanding presence that sets the hero apart from ordinary soldiers`,
    aspectRatio: "1:1" as const,
    size: { width: 128, height: 128 },
    category: "unit" as const,
  };
});

/** Per-unit description overrides for unique units whose appearance differs from
 *  their base unit (e.g. a "crossbowman" that is actually a war wagon). Keyed by
 *  unique-unit id; falls back to the generated base-unit description otherwise. */
const UNIQUE_UNIT_DESCRIPTION_OVERRIDES: Record<string, string> = {
  anglo_saxon_england_longbowman:
    "an English Longbowman of the medieval Hundred Years' War era: a single foot archer standing at ease in a relaxed ready pose, holding a tall unstrung-tension wooden English longbow (as tall as the man himself) upright and vertical at his side in one hand, the bowstring slack and NOT drawn, an arrow held loosely in the other hand, NOT a crossbow — there must be NO crossbow, NO stock, NO trigger, NO horizontal bow; the bow is NOT being aimed, drawn, or fired; wearing a simple iron kettle helmet or bascinet, a padded gambeson or quilted jacket, with a quiver of arrows at his hip; historically accurate English medieval archer, calm standing posture, facing to the right",
  ottomans_janissary:
    "an elite Ottoman Janissary musketeer of the 15th–16th century: a single foot soldier shouldering a long matchlock musket (tüfek) with a smoldering match cord, NOT a crossbow; wearing the distinctive tall white felt börk cap with a long flowing rear flap, a long ornate kaftan robe in deep red and blue with a sash belt, and a yatağan short sabre at the waist; historically accurate elite Ottoman gunpowder infantry, facing to the right",
  bohemia_hussite_war_wagon:
    "a 15th-century Hussite war wagon (vozová hradba / Wagenburg): a sturdy four-wheeled wooden battle wagon faced with thick reinforced timber side boards and pavise mantlets pierced by loopholes, crewed by Bohemian Hussite soldiers firing early gunpowder handcannons (píšťala / hand gonne) and crossbows from behind the planking, with a long war flail and hooked polearm visible; horse-drawn fortress-on-wheels, not a lone foot soldier",
};

/** One token per civilization unique unit (reskins a base unit). Output: units/<id>.png. */
export const UNIQUE_UNIT_SUBSET: AssetEntry[] = UNIQUE_UNITS.map((u) => {
  const civName = CIVILIZATIONS.find((c) => c.id === u.civId)?.name ?? u.civId;
  const baseName = UNIT_DEFS[u.replaces as keyof typeof UNIT_DEFS]?.name ?? u.replaces;
  return {
    id: u.id,
    name: u.name,
    description: UNIQUE_UNIT_DESCRIPTION_OVERRIDES[u.id] ?? `${u.name} — the unique ${baseName.toLowerCase()} of ${civName}; a historically accurate ${baseName.toLowerCase()} with distinctive ${civName} arms, armor, and style`,
    aspectRatio: "1:1" as const,
    size: { width: 128, height: 128 },
    category: "unit" as const,
  };
});

/** One icon per civilization unique infrastructure (building or tile improvement).
 *  Output: buildings/<id>.png or improvements/<id>.png (by kind/category). */
export const UNIQUE_INFRA_SUBSET: AssetEntry[] = UNIQUE_INFRA.map((u) => {
  const civName = CIVILIZATIONS.find((c) => c.id === u.civId)?.name ?? u.civId;
  return {
    id: u.id,
    name: u.name,
    description: `${u.art} — the unique ${u.kind === "improvement" ? "tile improvement" : "building"} of ${civName}`,
    aspectRatio: "1:1" as const,
    size: { width: 128, height: 128 },
    category: u.kind === "improvement" ? ("improvement" as const) : ("building" as const),
    referenceTile: DEFAULT_REFERENCE_TILE,
  };
});

export const RESOURCE_SUBSET: AssetEntry[] = Object.values(RESOURCE_DEFS).map((r) => ({
  id: r.id,
  name: r.name,
  description: `${r.type} resource found on ${r.validTerrain.join("/")}; requires a ${r.improvement} to activate`,
  aspectRatio: "1:1",
  size: { width: 96, height: 96 },
  category: "resource" as const,
}));

export interface ImprovementTierDef {
  readonly id: string;
  readonly name: string;
  readonly tier: 1 | 2 | 3;
  readonly description: string;
}

const IMPROVEMENT_KINDS: Omit<ImprovementTierDef, "tier">[] = [
  {
    id: "farm",
    name: "Farm",
    description: "a cultivated farm plot with golden crop rows",
  },
  {
    id: "lumber_camp",
    name: "Lumber Camp",
    description: "a woodland logging camp with felled timber",
  },
  {
    id: "mine",
    name: "Mine",
    description: "a hillside mine entrance with carts and rough tunnels",
  },
  {
    id: "quarry",
    name: "Quarry",
    description: "an open stone quarry with cut blocks and scaffolding",
  },
  {
    id: "pasture",
    name: "Pasture",
    description: "a fenced grassy pasture with grazing livestock",
  },
  {
    id: "plantation",
    name: "Plantation",
    description: "a cultivated estate with orderly rows of cash crops",
  },
  {
    id: "camp",
    name: "Camp",
    description: "a hunter's or trapper's camp in wild woodland",
  },
  {
    id: "fishing_boats",
    name: "Fishing Boats",
    description: "small wooden fishing boats with nets and baskets",
  },
  {
    id: "fishery",
    name: "Fishery",
    description:
      "an open fishing platform raised on tall wooden stilts standing in the open sea, with fishing nets dipping into the water, fish-drying racks, baskets of fish, and a small moored rowing boat alongside",
  },
  {
    id: "saltern",
    name: "Salt Pans",
    description:
      "a grid of shallow salt-evaporation pans flooded with shimmering blue-green seawater, divided by low walls, with white sea salt crystallizing and small heaps of harvested salt along the edges",
  },
  {
    id: "tower",
    name: "Tower",
    description: "a tall defensive stone tower with crenellations",
  },
];

const TIER_STYLE: Record<1 | 2 | 3, string> = {
  1: "simple, primitive, small scale, made of wood, thatch, and rough stone",
  2: "improved, organized, medium scale, with clay brick, cut timber, and simple irrigation or tools",
  3: "grand, advanced, large scale, with dressed stone, tile, engineered channels, and polished details",
};

// Improvements built on water tiles. They are framed as structures standing in
// the open sea (see promptFor) and use a water-appropriate tier ladder that does
// not pull the model toward dry-land buildings.
export const WATER_IMPROVEMENT_IDS = new Set<string>(["fishery", "saltern"]);

const WATER_TIER_STYLE: Record<1 | 2 | 3, string> = {
  1: "simple and primitive, small scale, rough timber poles and woven materials",
  2: "improved and organized, medium scale, sturdier timber piers and stone edging",
  3: "grand and advanced, large scale, solid timber-and-stone construction with refined details",
};

/** True if an improvement kind/asset id (e.g. "fishery" or "saltern_t2") is water-based. */
export function isWaterImprovementId(id: string): boolean {
  return WATER_IMPROVEMENT_IDS.has(id.replace(/_t[123]$/, ""));
}

export const IMPROVEMENT_SUBSET: AssetEntry[] = IMPROVEMENT_KINDS.flatMap((kind) => {
  const water = WATER_IMPROVEMENT_IDS.has(kind.id);
  const tierStyle = water ? WATER_TIER_STYLE : TIER_STYLE;
  // Water improvements draw their water as part of the sprite, so don't strip it.
  const tail = water ? "No dry land, no buildings on land" : "No walls, no background terrain";
  return ([1, 2, 3] as const).map((tier) => ({
    id: `${kind.id}_t${tier}`,
    name: `${kind.name} (Tier ${tier})`,
    description: `${kind.description}; tier ${tier} style: ${tierStyle[tier]}. ${tail}`,
    aspectRatio: "1:1" as const,
    size: { width: 128, height: 128 },
    category: "improvement" as const,
    referenceTile: water ? "hexOcean00.png" : DEFAULT_REFERENCE_TILE,
  }));
});

/** Per-category "under construction" build-site tokens, drawn on tiles with a Work
 *  in progress. Output: construction/<id>.png (econ / defense / wonder). */
export const CONSTRUCTION_SUBSET: AssetEntry[] = [
  {
    id: "econ",
    name: "Economic Construction Site",
    description:
      "an in-progress economic build site on a single tile: timber scaffolding, dug foundation pits, stacked cut stone and raw timber, baskets of earth, simple wooden tools, and a half-finished low structure. Work underway, NOT finished. No walls, no background terrain",
    aspectRatio: "1:1",
    size: { width: 128, height: 128 },
    category: "construction" as const,
    referenceTile: DEFAULT_REFERENCE_TILE,
  },
  {
    id: "defense",
    name: "Defensive Construction Site",
    description:
      "an in-progress defensive build site on a single tile: a half-raised palisade and stone rampart under construction with wooden scaffolding, ropes and pulleys, partly-laid stone courses, and piled timber and rubble. Work underway, NOT finished. No background terrain",
    aspectRatio: "1:1",
    size: { width: 128, height: 128 },
    category: "construction" as const,
    referenceTile: DEFAULT_REFERENCE_TILE,
  },
  {
    id: "wonder",
    name: "Wonder Construction Site",
    description:
      "an in-progress monumental wonder build site on a single tile: tall timber scaffolding and earthen ramps around a half-raised stone monument, wooden cranes and lifting frames, dressed marble blocks, and bustling construction. Grand scale, work underway, NOT finished. No background terrain",
    aspectRatio: "1:1",
    size: { width: 128, height: 128 },
    category: "construction" as const,
    referenceTile: DEFAULT_REFERENCE_TILE,
  },
];

export const ICON_SUBSET: AssetEntry[] = [
  {
    id: "app_icon",
    name: "App Icon",
    description: "a polished square app icon for an ancient turn-based strategy game. Show a stylized golden sun rising behind a classical stone column or pillar, framed by a subtle hexagon outline, on a deep navy-blue background. Match the painted, slightly stylized look of the reference tile. No text, no letters, no UI labels, no watermark, clean edges suitable for a mobile home screen.",
    aspectRatio: "1:1",
    size: { width: 512, height: 512 },
    category: "icon" as const,
    referenceTile: DEFAULT_REFERENCE_TILE,
  },
  {
    id: "favicon",
    name: "Favicon",
    description: "a small square favicon for an ancient turn-based strategy game. Show a stylized golden sun rising behind a classical stone column or pillar, framed by a subtle hexagon outline, on a deep navy-blue background. Match the painted, slightly stylized look of the reference tile. No text, no letters, no UI labels, no watermark, clean edges suitable for a browser favicon.",
    aspectRatio: "1:1",
    size: { width: 256, height: 256 },
    category: "icon" as const,
    referenceTile: DEFAULT_REFERENCE_TILE,
  },
];

export const TURN_UPDATE_SUBSET: AssetEntry[] = [
  {
    id: "unitDied",
    name: "Unit Died",
    description: "a solemn stylized hand-painted portrait of a fallen ancient warrior's helmet and spear resting on a battlefield, soft painted background of parchment and muted earth tones. Evoke loss and remembrance, no text, no UI.",
    aspectRatio: "3:4",
    size: { width: 320, height: 400 },
    category: "turn_update" as const,
    referenceTile: DEFAULT_REFERENCE_TILE,
  },
  {
    id: "productionComplete",
    name: "Production Complete",
    description: "a stylized hand-painted portrait of an ancient city's craftsmen finishing a bronze shield and a wooden chariot, a banner of celebration, warm workshop light. Evoke accomplishment and industry, no text, no UI.",
    aspectRatio: "3:4",
    size: { width: 320, height: 400 },
    category: "turn_update" as const,
    referenceTile: DEFAULT_REFERENCE_TILE,
  },
  {
    id: "unitTrained",
    name: "Unit Trained",
    description: "a stylized hand-painted portrait of a newly trained ancient soldier standing proudly at the gate of a barracks, fresh armor and a spear, a veteran instructor nodding in approval, warm morning light. Evoke readiness and recruitment, no text, no UI.",
    aspectRatio: "3:4",
    size: { width: 320, height: 400 },
    category: "turn_update" as const,
    referenceTile: DEFAULT_REFERENCE_TILE,
  },
  {
    id: "researchComplete",
    name: "Research Complete",
    description: "a stylized hand-painted portrait of an ancient scholar unrolling a scroll covered in star charts and geometric diagrams, soft library background. Evoke discovery and knowledge, no text, no UI.",
    aspectRatio: "3:4",
    size: { width: 320, height: 400 },
    category: "turn_update" as const,
    referenceTile: DEFAULT_REFERENCE_TILE,
  },
  {
    id: "civicComplete",
    name: "Civic Complete",
    description: "a stylized hand-painted portrait of a robed lawgiver holding a stone tablet before a gathered assembly in an agora or forum. Evoke civic progress and governance, no text, no UI.",
    aspectRatio: "3:4",
    size: { width: 320, height: 400 },
    category: "turn_update" as const,
    referenceTile: DEFAULT_REFERENCE_TILE,
  },
  {
    id: "improvementComplete",
    name: "Improvement Complete",
    description: "a stylized hand-painted portrait of workers finishing a terraced farm or a hillside mine, tools and baskets in the foreground, golden afternoon light. Evoke productive labor, no text, no UI.",
    aspectRatio: "3:4",
    size: { width: 320, height: 400 },
    category: "turn_update" as const,
    referenceTile: DEFAULT_REFERENCE_TILE,
  },
  {
    id: "wonderComplete",
    name: "Wonder Complete",
    description: "a stylized hand-painted portrait of a grand ancient wonder rising above a city: columns, obelisks, or a ziggurat under a dramatic sunrise. Evoke awe and monumentality, no text, no UI.",
    aspectRatio: "3:4",
    size: { width: 320, height: 400 },
    category: "turn_update" as const,
    referenceTile: DEFAULT_REFERENCE_TILE,
  },
  {
    id: "tradeRoutePillaged",
    name: "Trade Route Pillaged",
    description: "a stylized hand-painted portrait of a burning caravan on a desert road, scattered goods and a broken cart, smoky twilight sky. Evoke raid and disruption, no text, no UI.",
    aspectRatio: "3:4",
    size: { width: 320, height: 400 },
    category: "turn_update" as const,
    referenceTile: DEFAULT_REFERENCE_TILE,
  },
  {
    id: "improvementPillaged",
    name: "Improvement Pillaged",
    description: "a stylized hand-painted portrait of enemy raiders torching a farm and breaking a stone road, smoke and fleeing workers, a looted cart in the foreground. Evoke destruction and loss, no text, no UI.",
    aspectRatio: "3:4",
    size: { width: 320, height: 400 },
    category: "turn_update" as const,
    referenceTile: DEFAULT_REFERENCE_TILE,
  },
  {
    id: "tradeRouteEstablished",
    name: "Trade Route Established",
    description: "a stylized hand-painted portrait of a caravan of merchants setting out from a city gate along a paved road, laden pack animals, distant cities on the horizon, warm morning light. Evoke commerce and connection, no text, no UI.",
    aspectRatio: "3:4",
    size: { width: 320, height: 400 },
    category: "turn_update" as const,
    referenceTile: DEFAULT_REFERENCE_TILE,
  },
  {
    id: "cityLost",
    name: "City Lost",
    description: "a stylized hand-painted portrait of a captured city gate with enemy banners, smoke rising from mud-brick buildings, somber mood. Evoke defeat and loss, no text, no UI.",
    aspectRatio: "3:4",
    size: { width: 320, height: 400 },
    category: "turn_update" as const,
    referenceTile: DEFAULT_REFERENCE_TILE,
  },
  {
    id: "cityGrew",
    name: "City Grew",
    description: "a stylized hand-painted portrait of a thriving ancient city expanding outward, new houses and fields, families and livestock, warm hopeful light. Evoke growth and prosperity, no text, no UI.",
    aspectRatio: "3:4",
    size: { width: 320, height: 400 },
    category: "turn_update" as const,
    referenceTile: DEFAULT_REFERENCE_TILE,
  },
  {
    id: "treasuryExhausted",
    name: "Treasury Exhausted",
    description: "a stylized hand-painted portrait of an empty treasury: an open chest with only a few copper coins, a worried scribe, dim lamplight. Evoke financial strain, no text, no UI.",
    aspectRatio: "3:4",
    size: { width: 320, height: 400 },
    category: "turn_update" as const,
    referenceTile: DEFAULT_REFERENCE_TILE,
  },
];

export const TURN_UPDATE_WONDER_SUBSET: AssetEntry[] = WONDER_DEFS.map((w) => ({
  id: `wonder_${w.id}`,
  name: `${w.name} Complete`,
  description: `a stylized hand-painted portrait of the completed ${w.name}: ${w.desc}. Render a centered scene with a soft painted background such as ancient parchment, a mural, or a neutral textured wall. Evoke awe and monumentality, no text, no UI.`,
  aspectRatio: "3:4",
  size: { width: 320, height: 400 },
  category: "turn_update" as const,
  referenceTile: DEFAULT_REFERENCE_TILE,
}));

export const TURN_UPDATE_IMPROVEMENT_SUBSET: AssetEntry[] = [
  ...Object.values(IMPROVEMENT_DEFS).map((imp) => ({
    id: `improvement_${imp.kind}`,
    name: `${imp.name} Complete`,
    description: `a stylized hand-painted portrait of a completed ${imp.name}: ${imp.name} tile improvement in an ancient turn-based strategy game. Render a centered scene with a soft painted background such as ancient parchment, a mural, or a neutral textured wall. Evoke productive labor and civilization, no text, no UI.`,
    aspectRatio: "3:4" as const,
    size: { width: 320, height: 400 },
    category: "turn_update" as const,
    referenceTile: DEFAULT_REFERENCE_TILE,
  })),
  {
    id: "improvement_road",
    name: "Road Complete",
    description: "a stylized hand-painted portrait of workers completing a stone-paved road between rolling hills, a line of merchants and wagons beginning to travel it. Evoke connection and commerce, no text, no UI.",
    aspectRatio: "3:4",
    size: { width: 320, height: 400 },
    category: "turn_update" as const,
    referenceTile: DEFAULT_REFERENCE_TILE,
  },
  {
    id: "improvement_wall",
    name: "Wall Complete",
    description: "a stylized hand-painted portrait of a completed defensive stone wall with crenellations and a wooden gate, soldiers standing watch, a city behind it. Evoke security and fortification, no text, no UI.",
    aspectRatio: "3:4",
    size: { width: 320, height: 400 },
    category: "turn_update" as const,
    referenceTile: DEFAULT_REFERENCE_TILE,
  },
  {
    id: "improvement_tower",
    name: "Tower Complete",
    description: "a stylized hand-painted portrait of a completed watchtower rising above a forested ridge, a signal fire ready on its platform, distant valleys below. Evoke vigilance and defense, no text, no UI.",
    aspectRatio: "3:4",
    size: { width: 320, height: 400 },
    category: "turn_update" as const,
    referenceTile: DEFAULT_REFERENCE_TILE,
  },
];

export const HERO_SUBSET: AssetEntry[] = [
  {
    id: "hero_ancient_empire",
    name: "Ancient Empire",
    description: "a stylized hand-painted cinematic landscape for a turn-based strategy game hero banner. A vast ancient empire at sunrise: mud-brick cities with ziggurats and temples, workers in fields, a grand road, and distant mountains. Warm golden light, epic scale, no text, no UI.",
    aspectRatio: "16:9",
    size: { width: 1920, height: 1080 },
    category: "hero" as const,
    referenceTile: DEFAULT_REFERENCE_TILE,
  },
  {
    id: "hero_battlefield",
    name: "Epic Battlefield",
    description: "a stylized hand-painted cinematic landscape for a turn-based strategy game hero banner. An epic ancient battlefield: phalanxes, legions, cavalry, and war elephants clash beneath a dramatic sky with banners and dust. Epic scale, no text, no UI.",
    aspectRatio: "16:9",
    size: { width: 1920, height: 1080 },
    category: "hero" as const,
    referenceTile: DEFAULT_REFERENCE_TILE,
  },
  {
    id: "hero_maritime_trade",
    name: "Maritime Trade",
    description: "a stylized hand-painted cinematic landscape for a turn-based strategy game hero banner. A bustling ancient port at golden hour: merchant ships, caravels, docks, warehouses, and a coastal city climbing hillsides. Warm light, epic scale, no text, no UI.",
    aspectRatio: "16:9",
    size: { width: 1920, height: 1080 },
    category: "hero" as const,
    referenceTile: DEFAULT_REFERENCE_TILE,
  },
];

export const PILLAR_SUBSET: AssetEntry[] = [
  {
    id: "pillar_explore",
    name: "Explore",
    description: "a stylized hand-painted scene of exploration: a lone scout standing on a forested ridge, unfurling a crude map, with distant uncharted mountains and a golden sunrise beyond. Evoke curiosity, discovery, and the unknown frontier.",
    aspectRatio: "3:4",
    size: { width: 320, height: 400 },
    category: "pillar" as const,
    referenceTile: DEFAULT_REFERENCE_TILE,
  },
  {
    id: "pillar_expand",
    name: "Expand",
    description: "a stylized hand-painted scene of expansion: settlers raising the first mud-brick houses of a new city, clearing trees, and laying down roads that connect a growing frontier settlement. Evoke ambition, new foundations, and spreading civilization.",
    aspectRatio: "3:4",
    size: { width: 320, height: 400 },
    category: "pillar" as const,
    referenceTile: DEFAULT_REFERENCE_TILE,
  },
  {
    id: "pillar_exploit",
    name: "Exploit",
    description: "a stylized hand-painted scene of exploitation: farmers harvesting golden wheat, miners hauling ore from a hillside, and workers gathering resources around a busy village. Evoke productivity, labor, and the wealth of the land.",
    aspectRatio: "3:4",
    size: { width: 320, height: 400 },
    category: "pillar" as const,
    referenceTile: DEFAULT_REFERENCE_TILE,
  },
  {
    id: "pillar_exterminate",
    name: "Exterminate",
    description: "a stylized hand-painted scene of warfare: ancient warriors clashing on a battlefield with spears and shields, a siege tower looming, and banners flying under a dramatic sky. Evoke conquest, tactics, and decisive battle.",
    aspectRatio: "3:4",
    size: { width: 320, height: 400 },
    category: "pillar" as const,
    referenceTile: DEFAULT_REFERENCE_TILE,
  },
];

export const AGE_SUBSET: AssetEntry[] = [
  {
    id: "age_stone_dawn",
    name: "Stone / Dawn Age",
    description: "a stylized hand-painted scene of the Stone Age / Dawn era: tribes around a campfire, primitive huts, stone tools, and a vast open plain under a warm sunrise. Evoke the first cities and the dawn of civilization.",
    aspectRatio: "3:4",
    size: { width: 320, height: 400 },
    category: "age" as const,
    referenceTile: DEFAULT_REFERENCE_TILE,
  },
  {
    id: "age_bronze",
    name: "Bronze Age",
    description: "a stylized hand-painted scene of the Bronze Age: a ziggurat or pyramid rising behind a desert city, chariots, and bronze-armored soldiers under a golden sun. Evoke the first empires and monumental architecture.",
    aspectRatio: "3:4",
    size: { width: 320, height: 400 },
    category: "age" as const,
    referenceTile: DEFAULT_REFERENCE_TILE,
  },
  {
    id: "age_iron_classical",
    name: "Iron / Classical Age",
    description: "a stylized hand-painted scene of the Iron / Classical era: legions or phalanxes on a marble plaza, grand temples with columns, and a philosopher addressing citizens under a bright Mediterranean sky.",
    aspectRatio: "3:4",
    size: { width: 320, height: 400 },
    category: "age" as const,
    referenceTile: DEFAULT_REFERENCE_TILE,
  },
  {
    id: "age_medieval",
    name: "Medieval / Faith Age",
    description: "a stylized hand-painted scene of the Medieval era: a castle or cathedral on a hill, knights in armor, samurai, or monks, with banners flying and a moody golden sunset. Evoke faith, feudalism, and fortress architecture.",
    aspectRatio: "3:4",
    size: { width: 320, height: 400 },
    category: "age" as const,
    referenceTile: DEFAULT_REFERENCE_TILE,
  },
  {
    id: "age_exploration",
    name: "Exploration Age",
    description: "a stylized hand-painted scene of the Age of Exploration: tall caravels sailing across a wide ocean toward a distant horizon, a printing press, cannons, and bustling port trade under a dramatic sky.",
    aspectRatio: "3:4",
    size: { width: 320, height: 400 },
    category: "age" as const,
    referenceTile: DEFAULT_REFERENCE_TILE,
  },
];

export const BARBARIAN_REWARD_SUBSET: AssetEntry[] = [
  {
    id: "barb_camp_cleared",
    name: "Barbarian Camp Cleared",
    description: "a smouldering barbarian camp after a victorious battle: crude tents collapsed, a dying campfire, broken wooden spikes, and a triumphant warrior's spear planted in the ground",
    aspectRatio: "1:1",
    size: { width: 160, height: 160 },
    category: "barbarian_reward" as const,
    referenceTile: DEFAULT_REFERENCE_TILE,
  },
];

export const VILLAGE_REWARD_SUBSET: AssetEntry[] = [
  {
    id: "village_reward_tech",
    name: "Village Reward: Tech",
    description: "a village elder teaching a scroll or clay tablet of ancient knowledge to a visitor, warm torchlight, mud-brick hut interior",
    aspectRatio: "1:1",
    size: { width: 160, height: 160 },
    category: "village_reward" as const,
    referenceTile: DEFAULT_REFERENCE_TILE,
  },
  {
    id: "village_reward_gold",
    name: "Village Reward: Gold",
    description: "a small pile of golden coins, a few polished gems, and bronze trinkets spilling from a woven sack inside a tribal hut",
    aspectRatio: "1:1",
    size: { width: 160, height: 160 },
    category: "village_reward" as const,
    referenceTile: DEFAULT_REFERENCE_TILE,
  },
  {
    id: "village_reward_production",
    name: "Village Reward: Production",
    description: "sturdy wooden scaffolding, cut stone blocks, raw timber, and building materials stacked beside a construction site",
    aspectRatio: "1:1",
    size: { width: 160, height: 160 },
    category: "village_reward" as const,
    referenceTile: DEFAULT_REFERENCE_TILE,
  },
  {
    id: "village_reward_population",
    name: "Village Reward: Population",
    description: "a small group of ancient villagers welcoming a newcomer with bread and water, communal hearth, warm and hopeful",
    aspectRatio: "1:1",
    size: { width: 160, height: 160 },
    category: "village_reward" as const,
    referenceTile: DEFAULT_REFERENCE_TILE,
  },
  {
    id: "village_reward_unit",
    name: "Village Reward: Unit",
    description: "a tribal warrior or scout stepping forward from a village clearing, holding a spear or bow, ready to join an expedition",
    aspectRatio: "1:1",
    size: { width: 160, height: 160 },
    category: "village_reward" as const,
    referenceTile: DEFAULT_REFERENCE_TILE,
  },
  {
    id: "village_reward_promotion",
    name: "Village Reward: Promotion",
    description: "a battle-hardened warrior raising a weapon in triumph while villagers cheer, sparks or celebratory dust in the air",
    aspectRatio: "1:1",
    size: { width: 160, height: 160 },
    category: "village_reward" as const,
    referenceTile: DEFAULT_REFERENCE_TILE,
  },
  {
    id: "village_reward_unit_morale",
    name: "Village Reward: Unit Morale",
    description: "a lone warrior feasted and honoured by villagers around a bonfire, sharing food and drink, the soldier's face lit with renewed resolve and high spirits",
    aspectRatio: "1:1",
    size: { width: 160, height: 160 },
    category: "village_reward" as const,
    referenceTile: DEFAULT_REFERENCE_TILE,
  },
  {
    id: "village_reward_global_morale",
    name: "Village Reward: Global Morale",
    description: "a small compact group of villagers and warriors celebrating around a single glowing bonfire, dancing and raising cups together, warm firelight on joyful faces, a hopeful communal mood — drawn as a free-floating vignette resting on a small grassy mound, NOT inside a hexagon and with no hex tile shape or hex border",
    aspectRatio: "1:1",
    size: { width: 160, height: 160 },
    category: "village_reward" as const,
    referenceTile: DEFAULT_REFERENCE_TILE,
  },
  {
    id: "village_reward_faith",
    name: "Village Reward: Faith",
    description: "a humble village shrine at dawn — a small carved stone idol wreathed in incense smoke, votive offerings of flowers and grain, soft golden light and motes glowing in the air, a serene and sacred mood",
    aspectRatio: "1:1",
    size: { width: 160, height: 160 },
    category: "village_reward" as const,
    referenceTile: DEFAULT_REFERENCE_TILE,
  },
  {
    id: "village_reward_civic",
    name: "Village Reward: Civic",
    description: "wise village elders seated in a circle teaching customs and laws to a visitor, clay tablets and woven banners marked with symbols, a communal gathering beneath a great tree, warm daylight and an air of shared tradition",
    aspectRatio: "1:1",
    size: { width: 160, height: 160 },
    category: "village_reward" as const,
    referenceTile: DEFAULT_REFERENCE_TILE,
  },
  {
    id: "village_reward_ambush",
    name: "Village Reward: Ambush",
    description: "a barbarian ambush at night, fierce warriors with crude weapons leaping from behind village huts, flames and smoke",
    aspectRatio: "1:1",
    size: { width: 160, height: 160 },
    category: "village_reward" as const,
    referenceTile: DEFAULT_REFERENCE_TILE,
  },
  {
    id: "village_reward_cache",
    name: "Village Reward: Cache",
    description: "a small hidden cache of ancient coins, a bronze dagger, and a few pieces of jewelry buried under woven cloth",
    aspectRatio: "1:1",
    size: { width: 160, height: 160 },
    category: "village_reward" as const,
    referenceTile: DEFAULT_REFERENCE_TILE,
  },
];

export const UI_SUBSET: AssetEntry[] = [
  { id: "btn_next_move", name: "Next Move Button", description: "a circular play button with a right-pointing triangle arrow icon, polished bronze and stone with carved ancient border trim, hand-painted game UI element in warm metallic tones. No background outside the circular button — only the circular icon on a transparent background", category: "ui", aspectRatio: "1:1", size: { width: 96, height: 96 } },
  { id: "btn_skip_move", name: "Skip Move Button", description: "a circular skip-forward icon with a double right-pointing triangle arrow, dark wooden or slate with subtle carved border, secondary action style, hand-painted game UI element in cool muted tones. No background plate, no shadow, no backdrop — only the circular icon itself on a transparent background", category: "ui", aspectRatio: "1:1", size: { width: 96, height: 96 } },
];

export const BUILDING_SUBSET: AssetEntry[] = [
  { id: "barb_camp", name: "Barbarian Camp", description: "a primitive barbarian encampment with crude tents, a bonfire, and wooden spikes, no walls, no background terrain", category: "building", aspectRatio: "1:1", size: { width: 128, height: 128 } },
  { id: "village", name: "Village", description: "a small tribal village with a few thatched-roof huts, no walls, no fortifications, no background terrain", category: "building", aspectRatio: "1:1", size: { width: 128, height: 128 } },
  { id: "ruin", name: "City Ruins", description: "the desolate ruins of a destroyed ancient city: a few crumbling broken mud-brick and stone walls, a toppled column, scorched rubble, and charred timbers overgrown with weeds, abandoned and lifeless, no people, no walls intact, no fortifications, no background terrain", category: "building", aspectRatio: "1:1", size: { width: 128, height: 128 } },
  { id: "granary", name: "Granary", description: "a small grain store with earthen walls", category: "building", aspectRatio: "1:1", size: { width: 128, height: 128 } },
  // Unit-training building families (each trains one unit class; see content.ts TRAINING_BUILDING_DEFS).
  { id: "barracks", name: "Barracks", description: "a military training hall with weapon racks, shields, and a sparring yard, no background terrain", category: "building", aspectRatio: "1:1", size: { width: 128, height: 128 } },
  { id: "archery_range", name: "Archery Range", description: "an archery range with straw targets, racks of bows and quivers of arrows, no background terrain", category: "building", aspectRatio: "1:1", size: { width: 128, height: 128 } },
  { id: "stable", name: "Stable", description: "a horse stable with wooden stalls, a fenced paddock and hay bales, no background terrain", category: "building", aspectRatio: "1:1", size: { width: 128, height: 128 } },
  { id: "siege_workshop", name: "Siege Workshop", description: "a siege workshop with a half-built catapult, timber frames, ropes and woodworking tools, no background terrain", category: "building", aspectRatio: "1:1", size: { width: 128, height: 128 } },
  { id: "shipyard", name: "Shipyard", description: "a coastal shipyard with a wooden warship hull on slipways beside the water, scaffolding and timber, no background terrain", category: "building", aspectRatio: "1:1", size: { width: 128, height: 128 } },
  { id: "market", name: "Market", description: "a covered marketplace with stalls", category: "building", aspectRatio: "1:1", size: { width: 128, height: 128 } },
  { id: "library", name: "Library", description: "a classical archive with scroll shelves", category: "building", aspectRatio: "1:1", size: { width: 128, height: 128 } },
  { id: "monument", name: "Monument", description: "a standing stone or small obelisk", category: "building", aspectRatio: "1:1", size: { width: 128, height: 128 } },
  { id: "temple", name: "Temple", description: "an ancient temple with columns", category: "building", aspectRatio: "1:1", size: { width: 128, height: 128 } },
];

// Tall natural wonders whose summit rises above the hex and overhangs the tiles
// above (like the hand-painted hex-terrain/mountains.png). These use the magenta
// chroma-key prompt + overhang post-process; flat wonders (lakes, reefs, dunes,
// flats) keep the standard hex-masked tile pipeline.
export const OVERHANG_NATURAL_WONDER_IDS = new Set<string>([
  "mount_everest",
  "mount_kilimanjaro",
  "mount_fuji",
  "matterhorn",
  "mount_vesuvius",
  "mount_roraima",
  "zhangjiajie",
  "uluru",
  "table_mountain",
  "cappadocia",
  "giants_causeway",
  "iguazu_falls",
  "zhangye_danxia",
  "grand_canyon",
  "victoria_falls",
  "yosemite",
]);

// Visual identity for overhang wonders. These replace the short gameplay flavour
// text with a vivid, instantly-recognizable description so each peak reads as a
// unique landmark — NOT a generic grey mountain like the plain terrain tile.
export const OVERHANG_NATURAL_WONDER_ART: Record<string, string> = {
  mount_everest:
    "the colossal Himalayan pyramid of MOUNT EVEREST, the tallest mountain on Earth: a vast, imposing dark rock-and-ice massif with a sharp, instantly recognizable three-faceted summit pyramid, sheer black rock faces streaked with deep snow couloirs, hanging glaciers and a heavy mantle of ice, and the famous wind-blown banner of snow streaming sideways from the very summit. It is far taller, grander and more dramatic than an ordinary mountain — a legendary giant that dwarfs everything around it",
  matterhorn:
    "the iconic MATTERHORN: a single dramatic, near-vertical pyramidal Alpine horn with a distinctive hooked, slightly bent summit, four steep ridges and sheer rock faces dusted with snow and ice, unmistakable and far more striking than an ordinary mountain",
  mount_fuji:
    "the sacred MOUNT FUJI: a lone, perfectly symmetrical volcanic cone with smooth, gently curving flanks and a broad snow-capped summit, serene and majestic, instantly recognizable and far grander than an ordinary mountain",
  mount_kilimanjaro:
    "MOUNT KILIMANJARO: a huge, broad-shouldered free-standing volcano rising in isolation, with a wide flattened glacier-capped summit plateau and a brilliant white ice cap above dark volcanic rock flanks, towering and grand, far more imposing than an ordinary mountain",
  mount_vesuvius:
    "MOUNT VESUVIUS: a brooding twin-peaked volcano with a broken, cratered summit, dark ashen volcanic slopes, faint wisps of smoke or steam rising from the crater, ominous and grand, far more dramatic than an ordinary mountain",
  mount_roraima:
    "MOUNT RORAIMA: a colossal sheer-walled tabletop tepui mountain with a perfectly flat summit plateau, vertical cliff faces streaked with waterfalls, wreathed in drifting cloud, utterly unlike an ordinary peaked mountain",
  zhangjiajie:
    "the ZHANGJIAJIE pillars: a dense cluster of towering, slender quartzite sandstone spires and columns rising vertically side by side, their flat tops crowned with green pines, veiled in mist — a forest of stone towers, utterly unlike an ordinary mountain",
  uluru:
    "ULURU (Ayers Rock): a single colossal, isolated rust-red sandstone monolith with a long rounded whaleback dome profile, smooth steeply-curving flanks ribbed with weathering grooves and shallow caves, and a broad gently-rounded flat top. Deep ochre orange-red stone glowing warm, rising abruptly and alone from flat red desert sand and sparse spinifex scrub at its base. It is NOT a pointed snowy peak and has NO snow or ice — a smooth red rock dome, utterly unlike an ordinary mountain",
  table_mountain:
    "TABLE MOUNTAIN: a vast flat-topped sandstone massif with a perfectly LEVEL, broad horizontal summit plateau like a tabletop, framed by sheer vertical cliff faces and fluted rock buttresses, with a thin white 'tablecloth' of cloud spilling gently over the flat front edge. Tan-grey weathered rock with green fynbos scrub on the lower slopes, rising above a coastal plain. It is NOT a pointed peak — its defining feature is the long, dead-flat, horizontal tabletop summit, utterly unlike an ordinary mountain",
  cappadocia:
    "CAPPADOCIA: a clustered grove of tall, slender FAIRY CHIMNEYS (hoodoos) — pale cream and soft-ochre tufa rock cones rising side by side, each tapering spire crowned with a darker, harder mushroom-like boulder cap, and many pierced with small carved cave openings, windows, and doorways of ancient cave dwellings. They rise together from a soft warm valley floor in golden desert light. The defining feature is the forest of cone-capped rock spires, utterly unlike an ordinary mountain",
  giants_causeway:
    "the GIANT'S CAUSEWAY: a dense cluster of interlocking dark basalt columns — thousands of tightly-packed vertical HEXAGONAL stone pillars of stepped, varying heights forming a honeycomb staircase that rises into a low rocky headland in the middle and marches down into the foaming sea on either side. Grey-black volcanic basalt with mossy green tops, white waves breaking against the lowest columns. The defining feature is the geometric hexagonal columnar rock, utterly unlike an ordinary mountain",
  iguazu_falls:
    "IGUAZÚ FALLS: a vast horseshoe-shaped curtain of thundering white waterfalls plunging over a curved cliff edge that is crowned with dense emerald jungle canopy rising highest in the middle, billowing white mist boiling up from the churning pools below, lush tropical rainforest framing the gorge. The defining feature is the wide horseshoe of cascading jungle waterfalls, utterly unlike an ordinary mountain",
  zhangye_danxia:
    "the ZHANGYE DANXIA rainbow mountains: smooth, rolling sandstone ridges rising to a crest in the middle, painted in vivid horizontal STRIPED BANDS of rust-red, orange, yellow, cream, and ochre, the colorful striations following the wave-like contours of the hills. Dry, smooth, banded rock glowing under bright sun. The defining feature is the multicolored rainbow-striped layered rock, utterly unlike an ordinary mountain",
  niagara_falls:
    "NIAGARA FALLS: a colossal wide curving CURTAIN of falling water — a broad horseshoe cataract where a vast sheet of turquoise-green river water pours over a long cliff edge in a thundering white wall, with billowing white mist and spray rising from the churning pool below, framed by low green forested banks. The defining feature is the immense wide curtain of falling water, utterly unlike an ordinary mountain",
  grand_canyon:
    "the GRAND CANYON: an immense, mile-deep gorge of layered red, orange and ochre sandstone, with vast stepped canyon walls and towering flat-topped buttes and mesas rising within it, and the blue-green Colorado River winding far below through the bottom of the chasm. Dramatic horizontal rock strata and sheer cliffs in warm desert light. The defining feature is the colossal layered red-rock canyon, utterly unlike an ordinary mountain",
  victoria_falls:
    "VICTORIA FALLS ('the Smoke That Thunders'): a vast, mile-wide sheet of river water plunging straight down over a long sheer cliff into a narrow gorge, sending an enormous towering column of white mist and spray ('smoke') billowing high into the air above the falls, framed by lush green rainforest. The defining feature is the immense wide waterfall crowned by a giant rising plume of mist, utterly unlike an ordinary mountain",
  yosemite:
    "YOSEMITE VALLEY: a towering massif of sheer, pale-grey GRANITE cliffs and domes — a great rounded half-dome of bare granite sheared off into a vertical cliff face rising highest in the middle, flanked by monumental sheer granite walls, with a thin ribbon waterfall plunging down the rock, and dark green pine forest and giant sequoias clustered at the wooded valley floor below. The defining feature is the colossal bare grey granite cliffs and domes, utterly unlike an ordinary mountain",
};

// Flat natural wonders that fill a single hex tile with NO overhang. Generated 1:1
// with the whole scene resolving at every edge, then placed into the hex footprint
// (see postProcessEncapsulatedTile). Niagara uses this instead of the overhang path.
export const FLAT_NATURAL_WONDER_IDS = new Set<string>([
  "niagara_falls",
  "amazon_rainforest",
  "cliffs_of_dover",
  "dead_sea",
  "eye_of_the_sahara",
  "galapagos_islands",
  "great_barrier_reef",
  "lake_baikal",
  "moraine_lake",
  "pamukkale",
  "pantanal",
  "plitvice_lakes",
  "sahara_dunes",
  "salar_de_uyuni",
]);

// Vivid full-tile descriptions for the flat wonders. Each is framed top-down /
// slightly elevated and ENDS at the tile edges so the scene reads as one complete,
// self-contained tile.
export const FLAT_NATURAL_WONDER_ART: Record<string, string> = {
  niagara_falls:
    "NIAGARA FALLS seen straight down from directly overhead: the curving horseshoe brink where turquoise-green river water pours over the cliff edge into a ring of churning white foam and mist, the wide calm blue river above and the frothing plunge pool below — an aerial map view of the falls, NO horizon, NO sky",
  amazon_rainforest:
    "the AMAZON RAINFOREST seen straight down from directly overhead: an unbroken aerial carpet of lush emerald treetops with subtle tonal variation, a muddy-brown river winding across, a few clustered taller emergent crowns — dense canopy seen from directly above",
  cliffs_of_dover:
    "the WHITE CLIFFS OF DOVER seen straight down from directly overhead: a bright white chalk coastline edge where green grassy clifftops meet deep blue-green sea, white surf tracing the shore and pale chalk shallows — an aerial map of the coastline",
  dead_sea:
    "the DEAD SEA seen straight down from directly overhead: turquoise mineral-rich hypersaline water with swirling white salt patterns, a pale salt-crusted shoreline and arid tan banks — a flat aerial view of the still salt water",
  eye_of_the_sahara:
    "the EYE OF THE SAHARA (Richat Structure) seen straight down from directly overhead: a giant concentric bullseye of circular rock rings in tan, ochre and pale blue-grey forming a vast target pattern in the desert",
  galapagos_islands:
    "the GALÁPAGOS ISLANDS seen straight down from directly overhead: rugged dark volcanic islands of black lava rock and green scrub ringed by white surf in bright turquoise tropical sea, with a few small islets — an aerial map of the isles",
  great_barrier_reef:
    "the GREAT BARRIER REEF seen straight down from directly overhead through clear water: vivid coral formations in turquoise and deep blue, intricate orange, pink and tan coral patterns, pale sandy shallows and darker channels",
  lake_baikal:
    "LAKE BAIKAL seen straight down from directly overhead: deep clear blue water partly covered by cracked turquoise ice sheets and snow, dark forested and snow-dusted shores framing the water — a flat aerial view, NO mountains on a horizon, NO sky",
  moraine_lake:
    "MORAINE LAKE seen straight down from directly overhead: a vivid glacier-fed turquoise-blue lake ringed by dark green pine forest with patches of pale grey rocky shore — an aerial map of the brilliant blue lake, NO mountains on a horizon, NO sky",
  pamukkale:
    "PAMUKKALE seen straight down from directly overhead: terraced pure-white travertine basins of pale turquoise thermal water forming stepped scalloped pools of glistening calcium-white mineral — an aerial view of the white terraces",
  pantanal:
    "the PANTANAL wetland seen straight down from directly overhead: a patchwork of winding waterways, reedy green islands, lily-covered lagoons and grassy flooded plains with scattered tree clusters",
  plitvice_lakes:
    "the PLITVICE LAKES seen straight down from directly overhead: a chain of terraced turquoise and emerald pools linked by white waterfalls, surrounded by dense green forest — an aerial view of the lakes",
  sahara_dunes:
    "the SAHARA seen straight down from directly overhead: endless golden-orange sand dunes with smooth sinuous curving crest lines and rippled sand, soft shadows tracing the dune ridges — an aerial sea of dunes",
  salar_de_uyuni:
    "the SALAR DE UYUNI salt flat seen straight down from directly overhead: a blinding-white salt plain patterned with the famous hexagonal salt-crust polygons and a thin mirror sheen of water in places — a flat aerial view",
};

// Each natural wonder is ONE full hex map TILE (256×384, same format as terrain),
// generated and post-processed exactly like a terrain tile so it tessellates and
// the renderer can draw it in place of the underlying terrain. Overhang wonders
// (see above) instead let their peak rise above the hex footprint.
export const NATURAL_WONDER_SUBSET: AssetEntry[] = NATURAL_WONDER_DEFS.map((w) => {
  const encapsulated = FLAT_NATURAL_WONDER_IDS.has(w.id);
  return {
    id: w.id,
    name: w.name,
    description: w.desc,
    // Flat wonders are generated as a self-contained square tile (1:1); overhang
    // and default wonders use the taller 2:3 frame.
    aspectRatio: encapsulated ? "1:1" : "2:3",
    size: { width: 256, height: 384 },
    category: "natural_wonder" as const,
    referenceTile: DEFAULT_REFERENCE_TILE,
    overhang: OVERHANG_NATURAL_WONDER_IDS.has(w.id),
    encapsulated,
  };
});

// Built world-wonders that lack hand-authored decor art. Each is ONE decor prop
// (the monument itself) on a clean background, rendered as a transparent overlay
// the renderer draws on top of a tile's terrain — same role as the purchased
// Decor tiles (pyramid, sphinx, …). Output: wonders/<id>.png, then re-anchored to
// the 256×384 hex-tile footprint by tools/art-generator/normalize_wonder_tile.py.
const GENERATED_WONDER_TILES: { readonly id: string; readonly name: string; readonly description: string }[] = [
  {
    id: "hanging_gardens",
    name: "Hanging Gardens",
    description:
      "the Hanging Gardens of Babylon: a grand tiered stone terrace structure overflowing with lush cascading greenery, vines, flowering plants, and small trees, with stepped levels and arched stone supports",
  },
  {
    id: "colossus",
    name: "Colossus",
    description:
      "the Colossus of Rhodes, the legendary ancient Greek Wonder of the World: a colossal bronze statue of the sun god Helios depicted as a bearded, heroic, muscular NUDE MALE figure. He stands upright and frontal with BOTH ARMS LOWERED at his sides, feet planted apart, one hand resting on a tall ancient Greek longbow, gazing straight ahead out to sea. Weathered green-bronze metal, on a square cut-stone harbor pedestal, ancient Hellenistic Greek style. CRITICAL: this is a MAN, not a woman; it must NOT resemble the Statue of Liberty in any way — NO raised arm, NO arm held up, NO torch, NO flame held aloft, NO flowing robe, dress or gown, NO stone tablet, NO seven-point spiked tiara/halo crown",
  },
  {
    id: "great_lighthouse",
    name: "Great Lighthouse",
    description:
      "the Great Lighthouse of Alexandria: a tall tiered ancient stone lighthouse tower, square base, octagonal middle, cylindrical top, with a glowing beacon fire crowning its summit",
  },
];

export const WONDER_TILE_SUBSET: AssetEntry[] = GENERATED_WONDER_TILES.map((w) => ({
  id: w.id,
  name: w.name,
  description: w.description,
  aspectRatio: "2:3",
  size: { width: 256, height: 384 },
  category: "wonder_tile" as const,
  referenceTile: DEFAULT_REFERENCE_TILE,
}));

export function allEntries(): AssetEntry[] {
  return [...TERRAIN_SUBSET, ...UNIT_SUBSET, ...UNIQUE_UNIT_SUBSET, ...CITY_SUBSET, ...BUILDING_SUBSET, ...UNIQUE_INFRA_SUBSET, ...IMPROVEMENT_SUBSET, ...CONSTRUCTION_SUBSET, ...LEADER_SUBSET, ...GREAT_PERSON_SUBSET, ...LEGEND_SUBSET, ...ROAD_SUBSET, ...RIVER_SUBSET, ...RESOURCE_SUBSET, ...UI_SUBSET, ...ICON_SUBSET, ...VILLAGE_REWARD_SUBSET, ...BARBARIAN_REWARD_SUBSET, ...AGE_SUBSET, ...PILLAR_SUBSET, ...HERO_SUBSET, ...TURN_UPDATE_SUBSET, ...TURN_UPDATE_WONDER_SUBSET, ...TURN_UPDATE_IMPROVEMENT_SUBSET, ...NATURAL_WONDER_SUBSET, ...WONDER_TILE_SUBSET];
}

export function findEntry(id: string): AssetEntry | undefined {
  return allEntries().find((e) => e.id === id);
}

export function referencePath(entry: AssetEntry, referenceDir = DEFAULT_REFERENCE_DIR): string {
  const fileName = entry.referenceTile ?? DEFAULT_REFERENCE_TILE;
  return join(referenceDir, fileName);
}

const ROAD_TYPES: readonly { readonly id: string; readonly name: string; readonly material: string }[] = [
  { id: "dirt_road", name: "Dirt Road", material: "packed dirt" },
  { id: "stone_road", name: "Stone Road", material: "cobblestone" },
  { id: "advanced_stone_road", name: "Advanced Stone Road", material: "cut flagstone" },
];

/** Side names used when describing a hex edge mask to the image model. */
const SIDE_NAMES = ["right", "upper-right", "upper-left", "left", "lower-left", "lower-right"] as const;

/** Bitmask of every distinct road/river connection pattern up to hex rotation (0 side skipped). */
export const CONNECTION_MASKS: readonly number[] = [1, 3, 5, 7, 9, 11, 13, 15, 21, 23, 27, 31, 63];

function connectedSideNames(mask: number): string[] {
  return SIDE_NAMES.filter((_, i) => (mask & (1 << i)) !== 0);
}

function describeConnection(mask: number, kind: "road" | "river", material?: string): string {
  const sides = connectedSideNames(mask);
  if (sides.length === 0) return "";
  const type = kind === "road" ? (material ? `${material} road` : "road") : "river";
  if (sides.length === 6) return `a ${type} hub connecting all six sides`;
  if (sides.length === 1) return `a ${type} dead-end entering from the ${sides[0]} side`;
  const list = sides.slice(0, -1).join(", ") + " and " + sides[sides.length - 1];
  return `a ${type} connecting the ${list} sides`;
}

function makeRoadEntries(): AssetEntry[] {
  const entries: AssetEntry[] = [];
  for (const type of ROAD_TYPES) {
    for (const mask of CONNECTION_MASKS) {
      entries.push({
        id: `${type.id}_${mask}`,
        name: `${type.name} (${mask.toString(2).padStart(6, "0")})`,
        description: describeConnection(mask, "road", type.material),
        aspectRatio: "1:1",
        size: { width: 256, height: 256 },
        category: "road",
        referenceTile: DEFAULT_REFERENCE_TILE,
      });
    }
  }
  return entries;
}

export const ROAD_SUBSET: AssetEntry[] = makeRoadEntries();
export const DIRT_ROAD_SUBSET: AssetEntry[] = ROAD_SUBSET.filter((e) => e.id.startsWith("dirt_road_"));
export const STONE_ROAD_SUBSET: AssetEntry[] = ROAD_SUBSET.filter((e) => e.id.startsWith("stone_road_"));
export const ADVANCED_STONE_ROAD_SUBSET: AssetEntry[] = ROAD_SUBSET.filter((e) => e.id.startsWith("advanced_stone_road_"));

export const RIVER_SUBSET: AssetEntry[] = CONNECTION_MASKS.map((mask) => ({
  id: `river_${mask}`,
  name: `River (${mask.toString(2).padStart(6, "0")})`,
  description: describeConnection(mask, "river"),
  aspectRatio: "1:1",
  size: { width: 256, height: 256 },
  category: "river",
  referenceTile: DEFAULT_REFERENCE_TILE,
}));

/** Per-leader portrait subject overrides for civs whose default depiction needs steering. */
const LEADER_SUBJECT_OVERRIDES: Record<string, string> = {
  greco_bactria: "Demetrius I, the Hellenistic Greek-Bactrian king, wearing a royal cloth diadem and chiton — an ordinary human head with NO animal-skin cap and NO elephant-scalp headdress",
  indus_valley: "a single Bronze-Age Indus Valley priest-king of Mohenjo-daro — one solitary robed figure",
  eretria: "a single ancient Euboean Greek aristocratic magistrate — one solitary figure",
};

export function promptFor(entry: AssetEntry): string {
  if (entry.category === "tile") {
    return `Create a flat 2D hand-painted hexagonal strategy game tile for "${entry.name}". ${entry.description}. Match the visual style of the attached reference tile: slightly stylized, saturated but natural colors, readable at small sizes, and framed inside a vertical 2:3 pointy-top hex. IMPORTANT: do not include roads, paths, houses, huts, fences, farms, or any buildings or man-made structures — those will be added as separate tile improvements. Render as a flat 2D illustration with no 3D perspective, no realistic depth, no depth-of-field, and no camera angle shifts. Keep the same overall composition, camera angle, and hex footprint as the reference; vary only subtle natural details like texture, lighting, and vegetation so the grid remains uniform. The artwork must be fully self-contained and look correct in isolation; avoid paths, rivers, shadows, or objects that appear to continue off the tile edges. Preserve the soft shadow along the bottom edges of the hex, similar to the reference tile.`;
  }
  if (entry.category === "leader" || entry.category === "great_person" || entry.category === "legend") {
    const subject =
      entry.category === "leader"
        ? LEADER_SUBJECT_OVERRIDES[entry.id] ?? `${entry.name}, ruler of ${entry.description}`
        : `${entry.name}, ${entry.description}, depicted as the real historical figure in period-accurate dress`;
    return `Create a stylized hand-painted portrait of ${subject}. Match the painted, slightly stylized look of the attached reference tile; use it only as a style reference and ignore its hexagonal shape. Depict a SINGLE person — exactly one figure, a solo portrait, never a group, crowd, or multiple people. Render a waist-up portrait facing slightly toward the viewer, set against a soft painted background such as ancient parchment, a mural, or a neutral textured wall visible only behind the head and shoulders. The figure is large and fills most of the frame: the head sits near the top and the clothed chest and torso continue straight down so the body is cropped cleanly by the bottom edge of the image. The entire lower half of the image must be filled with the figure's solidly painted clothing and body — never empty background, and absolutely NO fade, gradient, vignette, spotlight falloff, smoke, or dissolve of the figure into the background at the torso, bottom, or sides; the body stays fully opaque all the way to the lower edge. Do not make the background transparent. Use clothing, regalia, and materials appropriate to the civilization's era and geography. NO text, NO letters, NO numbers, NO percentages, NO plus signs, NO symbols, NO UI elements, NO ability descriptions, NO stat boxes, NO border, NO frame, NO modern objects, NO ground plane, NO terrain, and NO cast shadow underneath the figure.`;
  }
  if (entry.category === "road") {
    return `Create a small hand-painted road segment for a turn-based strategy game. Subject: ${entry.description}. Render ONLY the narrow ${entry.description.includes("dirt") ? "dirt" : entry.description.includes("cobblestone") ? "stone" : "stone"} road/path on a fully transparent background. The road should be a thin, continuous path that reaches exactly the named hex edges and does NOT fill the hex. Match the painted, slightly stylized look of the attached reference tile. No terrain, no grass, no ground, no sky, no buildings, no text, no UI, no border, and no cast shadow. The background must remain transparent.`;
  }
  if (entry.category === "river") {
    return `Create a small hand-painted river segment for a turn-based strategy game. Subject: ${entry.description}. Render ONLY the water channel on a fully transparent background. The river should be a thin, continuous waterway that reaches exactly the named hex edges and does NOT fill the hex. Match the painted, slightly stylized look of the attached reference tile. No terrain, no grass, no ground, no sky, no buildings, no text, no UI, no border, and no cast shadow. The background must remain transparent.`;
  }
  if (entry.category === "unit") {
    return `Create a small standalone unit token/icon for an ancient turn-based strategy game spanning the Stone Age to the Classical era. Subject: ${entry.name} — ${entry.description}. Match the painted, slightly stylized look of the attached hex tile reference. Render the subject from a near-top-down or three-quarter view, centered, in a static idle pose standing still and facing toward the right side of the image, as an isolated figure on a clean solid white background. Use only materials and technology appropriate to the unit's era and description; no anachronistic weapons, armor, or equipment. No walking, running, attacking, or action motion; no motion blur or dynamic swinging of limbs/weapons. No text, no UI, no border, no ground plane, no terrain, no grass, no dirt, no base platform, and no cast shadow underneath the figure. For ships, boats, or naval units, show the vessel alone with NO water, NO sea, NO waves, and NO ripples. The unit should float cleanly on the white background with nothing else in the frame.`;
  }
  if (entry.category === "resource") {
    return `Create a tiny standalone map resource icon for an ancient turn-based strategy game. Subject: ${entry.name} — ${entry.description}. Match the painted, slightly stylized look of the attached hex tile reference. Render the resource as a small, clear symbol or object from a near-top-down or three-quarter view, centered, as an isolated item on a clean solid white background. Keep it smaller than a unit icon so it reads as a map token. No text, no UI, no border, no ground plane, no terrain, no grass, no dirt, no base platform, and no cast shadow underneath. The resource icon should float cleanly on the white background with nothing else in the frame.`;
  }
  if (entry.category === "improvement") {
    if (isWaterImprovementId(entry.id)) {
      return `Create a small standalone map improvement icon for an ancient turn-based strategy game. IMPORTANT: this improvement is built ON WATER and must read clearly as a structure standing in the open sea — NOT a house, hut, cabin, or building on dry land, and NOT sitting on grass, sand, or soil. Subject: ${entry.name} — ${entry.description}. Match the painted, slightly stylized look of the attached hex tile reference. Render it from a three-quarter or near-top-down view, centered, as an isolated improvement on a clean solid white background, with gentle blue-green water ripples ONLY right at its waterline/base as part of the sprite. Keep it compact so it reads as a tile overlay. Absolutely NO dry ground, NO grass, NO sand, NO dirt, NO field, NO enclosing hut or house walls, NO thatched roof, NO fence, NO text, NO UI, NO border, and NO cast shadow. Everything except the improvement and the small ripples at its waterline must be clean solid white so the background can be removed cleanly.`;
    }
    return `Create a small standalone map improvement icon for an ancient turn-based strategy game. Subject: ${entry.name} — ${entry.description}. Match the painted, slightly stylized look of the attached hex tile reference. Render the subject from a three-quarter or near-top-down view, centered, as an isolated improvement on a clean solid white background. Keep it compact so it reads as a tile overlay. No text, no UI, no border, no ground plane, no terrain, no grass, no dirt, no base platform, and no cast shadow underneath. The improvement should float cleanly on the white background with nothing else in the frame.`;
  }
  if (entry.category === "natural_wonder" && entry.overhang) {
    const subject = OVERHANG_NATURAL_WONDER_ART[entry.id] ?? entry.description;
    return `Create a single tall hand-painted sprite of a UNIQUE, legendary NATURAL WONDER for an ancient turn-based strategy hex map: ${subject}. This is a famous one-of-a-kind landmark, so it must be instantly recognizable and clearly GRANDER and more dramatic than ordinary terrain — exaggerate its distinctive silhouette, scale, color, and character so a player can tell at a glance it is "${entry.name}". Paint ONE formation that is HORIZONTALLY CENTERED and roughly bilaterally SYMMETRIC, with its highest point directly above the horizontal center of the image and its greatest mass in the middle. Its base must settle evenly into the lower half on BOTH sides so the left and right are balanced and matching, and every edge, ridge, slope, and rock face must clearly RESOLVE and END within the frame — never abruptly cropped, sliced, or jammed flat against the left or right edge. The lower half is completely FILLED with the landmark's own solid mass — rock, and whatever snow, ice, sand, vegetation, or water naturally belongs to it — reaching the LEFT, RIGHT, and BOTTOM edges so there are no transparent gaps. View it straight-on from a slightly elevated angle as a flat 2D illustration with no 3D camera perspective; slightly stylized, saturated but natural colors, readable at small sizes, matching the painted look of the attached reference tile. Do NOT draw any hexagon outline, tile border, frame, dark outline, or hard shadow line — the landmark should simply fill to the edges naturally (the hex tile footprint is applied afterwards). CRITICAL BACKGROUND RULE: ONLY the sky — the area around and ABOVE the top of the landmark and to either side of its upper portion — must be filled with a single FLAT, SOLID, UNIFORM pure magenta color (hex #FF00FF, RGB 255,0,255); the bottom and lower sides are entirely filled by the landmark, NOT magenta. The magenta sky must be perfectly flat with NO gradient, NO clouds, NO haze, NO glow, NO atmosphere, and NO shading — a plain chroma-key backdrop so it can be removed cleanly. Do NOT use any magenta, pink, or purple anywhere on the landmark itself. No roads, no buildings, no people, no text, no labels.`;
  }
  if (entry.category === "natural_wonder" && entry.encapsulated) {
    const subject = FLAT_NATURAL_WONDER_ART[entry.id] ?? `the natural wonder ${entry.name}: ${entry.description}`;
    return `Create a flat 2D hand-painted POINTY-TOP HEXAGON map tile, entirely filled by one natural wonder as its terrain: ${subject}. The artwork is shaped as a single pointy-top hexagon — a vertical hexagon with a point at the very top and very bottom and two vertical side edges — exactly the hexagonal shape of the attached reference tile, and the hexagon fills the whole frame, its top point, bottom point and two side edges touching the frame edges. Compose the wonder so it COMPLETELY FILLS the hexagon and its content is arranged to FIT the hexagon: every element resolves and ENDS naturally along the six straight hexagon edges, so nothing important is sliced or cut off. PERSPECTIVE (very important): render it from a STRICT, DIRECTLY-OVERHEAD BIRD'S-EYE / AERIAL TOP-DOWN view — looking straight down from above like a satellite or map view. There must be NO horizon, NO sky, NO distant background, NO mountains or scenery receding into the distance, NO vanishing point and NO 3D perspective — every part of the scene is seen flat from directly above at the same scale, like a hand-painted map terrain tile. CRITICAL BACKGROUND RULE: the FOUR triangular corner areas OUTSIDE the hexagon (top-left, top-right, bottom-left, bottom-right corners of the frame) must be filled with flat, solid, uniform pure magenta (hex #FF00FF, RGB 255,0,255) with no gradient or shading, so they can be removed cleanly — do NOT paint any wonder content, border, outline, or frame in those corners or along the hexagon edge. Match the painted, slightly stylized look of the reference tile: saturated but natural colors, readable at small sizes. Do NOT include roads, paths, houses, huts, fences, farms, units, boats, ships, text, labels, or any man-made structures.`;
  }
  if (entry.category === "natural_wonder") {
    return `Create a flat 2D hand-painted hexagonal strategy game map tile depicting the natural wonder "${entry.name}". ${entry.description}. The ENTIRE hex tile is filled by this one natural wonder as its terrain — the canyon, lake, reef, dunes, falls, forest or peak fills the whole hex, painted top-down/slightly-angled and readable at small sizes. Match the visual style of the attached reference tile: slightly stylized, saturated but natural colors, framed inside a vertical 2:3 pointy-top hex. IMPORTANT: do not include roads, paths, houses, huts, fences, farms, units, text, labels, or any man-made structures. Render as a flat 2D illustration with no 3D perspective, no realistic depth, and no camera angle shifts. Keep the same overall composition, camera angle, and hex footprint as the reference; the artwork must be fully self-contained and look correct in isolation, with nothing continuing off the tile edges. Preserve the soft shadow along the bottom edges of the hex, similar to the reference tile.`;
  }
  if (entry.category === "wonder_tile") {
    return `Create a single hand-painted decorative monument prop for an ancient turn-based strategy hex map: ${entry.description}. Render ONLY the monument structure itself, centered, as one isolated object on a clean solid pure-white background. Match the painted, slightly stylized look of the attached reference hex tile (use it only as a style reference and ignore its hexagonal shape). View it from a slightly elevated three-quarter angle, sized so it reads clearly as a single tile-sized landmark. IMPORTANT: no terrain, no ground plane, no grass, no water, no base platform, no other buildings, no people, no text, no UI, no border, and no cast shadow on the ground. The monument must be fully self-contained and float cleanly on the white background so its background can be removed, leaving a transparent decor sprite to overlay a map tile.`;
  }
  if (entry.category === "ui") {
    return `Create a hand-painted game UI button for an ancient turn-based strategy game. Subject: ${entry.name} — ${entry.description}. Match the painted, slightly stylized look of the attached reference tile. Render the button horizontally, centered, filling most of the frame, on a fully transparent background. No text, no letters, no icons, no UI labels, no border frame beyond the button itself, and no cast shadow. The button should float cleanly with nothing else in the frame.`;
  }
  if (entry.category === "icon") {
    return `Create a square mobile app icon for an ancient turn-based strategy game called "Rise of Civilizations". Subject: ${entry.name} — ${entry.description}. Match the painted, slightly stylized look of the attached reference tile. Render as a centered, self-contained square icon filling the frame. No text, no letters, no words, no UI labels, no watermark, no border frame, and no cast shadow outside the icon. The icon should look polished and readable as a small phone home-screen app.`;
  }
  if (entry.category === "age") {
    return `Create a stylized hand-painted era portrait for an ancient turn-based strategy game called "Rise of Civilizations". Subject: ${entry.name} — ${entry.description}. Match the painted, slightly stylized look of the attached reference tile; use it only as a style reference and ignore its hexagonal shape. Render a centered scene with a strong sense of time and place, set against a soft painted background. NO text, NO letters, NO numbers, NO percentages, NO plus signs, NO symbols, NO UI elements, NO ability descriptions, NO stat boxes, NO border, NO frame, NO modern objects, and NO cast shadow. Keep the composition clear and readable at small sizes.`;
  }
  if (entry.category === "pillar") {
    return `Create a stylized hand-painted gameplay pillar illustration for an ancient turn-based strategy game called "Rise of Civilizations". Subject: ${entry.name} — ${entry.description}. Match the painted, slightly stylized look of the attached reference tile; use it only as a style reference and ignore its hexagonal shape. Render a centered scene that captures the theme and mood of the pillar, set against a soft painted background. NO text, NO letters, NO numbers, NO percentages, NO plus signs, NO symbols, NO UI elements, NO ability descriptions, NO stat boxes, NO border, NO frame, NO modern objects, and NO cast shadow. Keep the composition clear and readable at small sizes.`;
  }
  if (entry.category === "hero") {
    return `Create a stylized hand-painted cinematic hero banner for an ancient turn-based strategy game called "Rise of Civilizations". Subject: ${entry.name} — ${entry.description}. Match the painted, slightly stylized look of the attached reference tile; use it only as a style reference and ignore its hexagonal shape. Render a wide, epic landscape suitable for a full-width website hero background. NO text, NO letters, NO numbers, NO percentages, NO plus signs, NO symbols, NO UI elements, NO ability descriptions, NO stat boxes, NO border, NO frame, NO modern objects, and NO cast shadow. Keep the composition readable behind centered headline text.`;
  }
  if (entry.category === "turn_update") {
    return `Create a stylized hand-painted portrait illustration for a turn-start update in an ancient turn-based strategy game called "Rise of Civilizations". Subject: ${entry.name} — ${entry.description}. Match the painted, slightly stylized look of the attached reference tile; use it only as a style reference and ignore its hexagonal shape. Render a centered scene with a soft painted background such as ancient parchment, a mural, or a neutral textured wall. Do not make the background transparent. NO text, NO letters, NO numbers, NO percentages, NO plus signs, NO symbols, NO UI elements, NO ability descriptions, NO stat boxes, NO border, NO frame, NO modern objects, NO ground plane, NO terrain, and NO cast shadow.`;
  }
  if (entry.category === "village_reward") {
    return `Create a small narrative reward illustration for an ancient turn-based strategy game. Subject: ${entry.name} — ${entry.description}. Match the painted, slightly stylized look of the attached reference tile. Render as a centered scene on a clean solid white background. No text, no letters, no UI labels, no watermark, no border frame, and no cast shadow. The illustration should read clearly at small sizes.`;
  }
  if (entry.category === "barbarian_reward") {
    return `Create a small narrative reward illustration for an ancient turn-based strategy game. Subject: ${entry.name} — ${entry.description}. Match the painted, slightly stylized look of the attached reference tile. Render as a centered scene on a clean solid white background. No text, no letters, no UI labels, no watermark, no border frame, and no cast shadow. The illustration should read clearly at small sizes.`;
  }
  return `Create a small standalone building icon for a turn-based strategy game. Subject: ${entry.name} — ${entry.description}. Match the painted, slightly stylized look of the attached hex tile reference. Render the subject from a three-quarter or near-top-down view, centered, as an isolated building on a clean solid white background. No text, no UI, no border, no ground plane, no terrain, no grass, no dirt, no base platform, and no cast shadow underneath. The building should float cleanly on the white background with nothing else in the frame.`;
}
