// Game content. The tech tree is intentionally NOT a Civilization clone — it's
// organised around real materials & techniques (knapping, smelting, alloying,
// carburizing, torsion, equestrianism…) rather than abstract "eras of science".
// Units are numerous and role-rich: many are available from the start, others
// are unlocked by specific technologies. Naval units await the water-movement
// system, so they're intentionally omitted for now.

export type UnitTypeId =
  // civilian
  | "settler" | "trader"
  // recon
  | "scout"
  // dawn melee/ranged (no tech)
  | "clubman" | "warrior" | "slinger" | "javelineer" | "hunter"
  // early tech
  | "firehard_spear" | "war_dog" | "archer"
  // bronze
  | "axeman" | "maceman" | "spearman" | "hoplite"
  | "light_chariot" | "war_chariot" | "rider" | "horse_archer"
  // iron / classical
  | "swordsman" | "longswordsman" | "pikeman" | "cataphract"
  | "crossbowman" | "legionary" | "war_elephant"
  // siege
  | "battering_ram" | "catapult" | "ballista";

export type UnitClass = "settler" | "trader" | "recon" | "melee" | "ranged" | "cavalry" | "siege";
export type UnitAbility = "bonus_vs_cavalry" | "bonus_vs_city";

/**
 * Player-triggered active abilities (see docs/UNIT-ABILITIES.md §3). These are
 * distinct from the always-on `UnitAbility` modifiers and the XP-earned
 * promotions: using one is a deliberate action that spends the unit's turn.
 * Civ-unique (§8) and hero (§9) abilities are added when those unit types exist.
 */
export type ActiveAbilityId =
  | "brace"
  | "shield_wall"
  | "testudo"
  | "emplace"
  | "charge"
  | "shock_charge"
  | "trample"
  | "fire_and_retreat"
  | "skirmish"
  | "sunder"
  | "pierce"
  | "harry"
  | "reconnoiter";

/** A persistent stance a unit enters by forfeiting its movement for the turn. */
export type StanceId = "brace" | "shield_wall" | "testudo" | "emplace";

/**
 * How an ability is invoked:
 * - `stance`   — toggled on; ends the turn; modifies combat until it clears.
 * - `targeted` — needs a target tile (an adjacent/in-range enemy); resolves now.
 * - `self`     — affects only the user; resolves now and ends the turn.
 */
export type AbilityKind = "stance" | "targeted" | "self";

export interface ActiveAbilityDef {
  id: ActiveAbilityId;
  /** In-game display name. */
  name: string;
  /** Short verb shown on the action button tooltip. */
  verb: string;
  /** Emoji/glyph fallback when no icon image is present. */
  glyph: string;
  kind: AbilityKind;
  /** Extra turns the unit must wait between uses (0 = usable again next turn). */
  cooldown: number;
  desc: string;
}

const A = (d: ActiveAbilityDef): ActiveAbilityDef => d;

export const ACTIVE_ABILITY_DEFS: Record<ActiveAbilityId, ActiveAbilityDef> = {
  brace: A({ id: "brace", name: "Set Spears", verb: "Guard", glyph: "🛡️", kind: "stance", cooldown: 0, desc: "Brace: +25% defense (+40% vs cavalry) until your next turn. Forfeits movement." }),
  shield_wall: A({ id: "shield_wall", name: "Shield Wall", verb: "Form Wall", glyph: "🛡️", kind: "stance", cooldown: 0, desc: "Brace that grows with adjacent friendly infantry (up to +45% defense). Forfeits movement." }),
  testudo: A({ id: "testudo", name: "Testudo", verb: "Form Testudo", glyph: "🐢", kind: "stance", cooldown: 0, desc: "+50% defense vs ranged, −10% vs melee, until your next turn. Forfeits movement." }),
  emplace: A({ id: "emplace", name: "Emplace", verb: "Set Up", glyph: "🎯", kind: "stance", cooldown: 0, desc: "Deploy: +50% ranged strength and +1 range while set, but −25% defense and 0 movement. Moving packs up." }),
  charge: A({ id: "charge", name: "Charge", verb: "Charge", glyph: "🐎", kind: "targeted", cooldown: 0, desc: "Strike an adjacent enemy and ride through to the tile behind it (+4 attack). Blunted by braced spears." }),
  shock_charge: A({ id: "shock_charge", name: "Shock Charge", verb: "Shock Charge", glyph: "🐎", kind: "targeted", cooldown: 1, desc: "Heavy charge: +6 attack and knocks the defender back a tile. Takes full retaliation." }),
  trample: A({ id: "trample", name: "Trample", verb: "Trample", glyph: "🐘", kind: "targeted", cooldown: 1, desc: "Charge that splashes ½ damage to other adjacent enemies. A wounded beast risks rampaging." }),
  fire_and_retreat: A({ id: "fire_and_retreat", name: "Fire & Retreat", verb: "Fire & Retreat", glyph: "🏹", kind: "targeted", cooldown: 0, desc: "Shoot a target, then step one tile away from it (Parthian shot)." }),
  skirmish: A({ id: "skirmish", name: "Skirmish", verb: "Skirmish", glyph: "🏹", kind: "targeted", cooldown: 0, desc: "Shoot a target, then fall back one tile — if you didn't move first and aren't pinned." }),
  sunder: A({ id: "sunder", name: "Sunder", verb: "Sunder", glyph: "🔨", kind: "targeted", cooldown: 0, desc: "A crushing blow: lighter damage but the target loses 25% defense until its next turn." }),
  pierce: A({ id: "pierce", name: "Pierce", verb: "Pierce", glyph: "🎯", kind: "targeted", cooldown: 0, desc: "Armor-piercing bolt: ignores 6 points of the target's defense. Reduced range this shot." }),
  harry: A({ id: "harry", name: "Harry", verb: "Harry", glyph: "🐕", kind: "targeted", cooldown: 0, desc: "Low-damage strike that pins the target — it cannot move on its next turn." }),
  reconnoiter: A({ id: "reconnoiter", name: "Reconnoiter", verb: "Scout Ahead", glyph: "🔭", kind: "self", cooldown: 0, desc: "Forfeit the turn for a vision pulse: +2 sight until your next turn." }),
};

export type BuildingId =
  | "granary" | "workshop" | "forge" | "walls" | "barracks" | "stable"
  | "market" | "library" | "academy" | "aqueduct" | "harbor" | "monument" | "amphitheater"
  | "shrine" | "temple";

export type TechId =
  // Dawn
  | "knapping" | "foraging" | "fire_hardening" | "hide_working" | "animal_taming"
  | "cultivation" | "ritual_burial" | "pottery_kiln" | "parley"
  // Copper / Bronze
  | "native_copper" | "smelting" | "bronze_alloying" | "the_wheel" | "equestrian"
  | "masonry" | "weaving" | "composite_bow" | "writing" | "irrigation"
  | "sailcloth" | "chariotry" | "phalanx"
  // Iron / Classical
  | "iron_bloomery" | "carburizing" | "siegecraft" | "torsion_engines"
  | "mathematics" | "engineering" | "coinage" | "philosophy"
  | "cavalry_doctrine" | "horse_archery" | "crossbow"
  | "monumental_architecture" | "elephantry";

export const UNIT_MAX_HP = 100;

export interface UnitDef {
  id: UnitTypeId;
  name: string;
  glyph: string;
  cls: UnitClass;
  movement: number;
  sight: number;
  cost: number;
  strength: number;
  rangedStrength?: number;
  range?: number;
  reqTech?: TechId;
  /** Strategic resource required to train this unit. */
  reqResource?: { resource: string; count: number };
  founder?: boolean;
  builder?: boolean;
  /** Consumed to establish a trade route between two of your cities. */
  trader?: boolean;
  abilities?: UnitAbility[];
  /** Player-triggered active abilities (see ACTIVE_ABILITY_DEFS). */
  activeAbilities?: ActiveAbilityId[];
}

const U = (d: UnitDef): UnitDef => d;

export const UNIT_DEFS: Record<UnitTypeId, UnitDef> = {
  settler: U({ id: "settler", name: "Settler", glyph: "S", cls: "settler", movement: 2, sight: 2, cost: 24, strength: 0, founder: true }),
  trader: U({ id: "trader", name: "Trader", glyph: "$", cls: "trader", movement: 3, sight: 2, cost: 30, strength: 0, reqTech: "the_wheel", trader: true }),
  scout: U({ id: "scout", name: "Scout", glyph: "C", cls: "recon", movement: 3, sight: 3, cost: 10, strength: 4 }),

  clubman: U({ id: "clubman", name: "Clubman", glyph: "c", cls: "melee", movement: 2, sight: 2, cost: 10, strength: 6 }),
  warrior: U({ id: "warrior", name: "Warrior", glyph: "W", cls: "melee", movement: 2, sight: 2, cost: 15, strength: 8 }),
  slinger: U({ id: "slinger", name: "Slinger", glyph: "L", cls: "ranged", movement: 2, sight: 2, cost: 12, strength: 4, rangedStrength: 7, range: 1 }),
  javelineer: U({ id: "javelineer", name: "Javelineer", glyph: "J", cls: "ranged", movement: 2, sight: 2, cost: 14, strength: 6, rangedStrength: 8, range: 1 }),
  hunter: U({ id: "hunter", name: "Hunter", glyph: "H", cls: "ranged", movement: 2, sight: 3, cost: 13, strength: 5, rangedStrength: 7, range: 1 }),

  firehard_spear: U({ id: "firehard_spear", name: "Fire-Hardened Spearman", glyph: "F", cls: "melee", movement: 2, sight: 2, cost: 15, strength: 9, reqTech: "fire_hardening", abilities: ["bonus_vs_cavalry"] }),
  war_dog: U({ id: "war_dog", name: "War Dogs", glyph: "D", cls: "melee", movement: 3, sight: 2, cost: 12, strength: 6, reqTech: "animal_taming" }),
  archer: U({ id: "archer", name: "Archer", glyph: "A", cls: "ranged", movement: 2, sight: 2, cost: 18, strength: 6, rangedStrength: 11, range: 2, reqTech: "composite_bow" }),

  axeman: U({ id: "axeman", name: "Bronze Axeman", glyph: "X", cls: "melee", movement: 2, sight: 2, cost: 19, strength: 13, reqTech: "bronze_alloying", reqResource: { resource: "copper", count: 1 } }),
  maceman: U({ id: "maceman", name: "Maceman", glyph: "M", cls: "melee", movement: 2, sight: 2, cost: 18, strength: 11, reqTech: "bronze_alloying", reqResource: { resource: "copper", count: 1 }, abilities: ["bonus_vs_city"] }),
  spearman: U({ id: "spearman", name: "Spearman", glyph: "P", cls: "melee", movement: 2, sight: 2, cost: 18, strength: 11, reqTech: "bronze_alloying", reqResource: { resource: "copper", count: 1 }, abilities: ["bonus_vs_cavalry"] }),
  hoplite: U({ id: "hoplite", name: "Hoplite", glyph: "O", cls: "melee", movement: 2, sight: 2, cost: 22, strength: 13, reqTech: "phalanx", reqResource: { resource: "copper", count: 1 }, abilities: ["bonus_vs_cavalry"] }),

  light_chariot: U({ id: "light_chariot", name: "Light Chariot", glyph: "y", cls: "cavalry", movement: 4, sight: 2, cost: 18, strength: 9, reqTech: "the_wheel", reqResource: { resource: "horses", count: 1 } }),
  war_chariot: U({ id: "war_chariot", name: "War Chariot", glyph: "Y", cls: "cavalry", movement: 4, sight: 2, cost: 24, strength: 13, reqTech: "chariotry", reqResource: { resource: "horses", count: 1 } }),
  rider: U({ id: "rider", name: "Rider", glyph: "R", cls: "cavalry", movement: 4, sight: 2, cost: 18, strength: 10, reqTech: "equestrian", reqResource: { resource: "horses", count: 1 } }),
  horse_archer: U({ id: "horse_archer", name: "Horse Archer", glyph: "Q", cls: "cavalry", movement: 4, sight: 2, cost: 22, strength: 7, rangedStrength: 9, range: 1, reqTech: "horse_archery", reqResource: { resource: "horses", count: 1 } }),

  swordsman: U({ id: "swordsman", name: "Swordsman", glyph: "Z", cls: "melee", movement: 2, sight: 2, cost: 22, strength: 15, reqTech: "iron_bloomery", reqResource: { resource: "iron", count: 1 } }),
  longswordsman: U({ id: "longswordsman", name: "Longswordsman", glyph: "G", cls: "melee", movement: 2, sight: 2, cost: 26, strength: 18, reqTech: "carburizing", reqResource: { resource: "iron", count: 1 } }),
  pikeman: U({ id: "pikeman", name: "Pikeman", glyph: "K", cls: "melee", movement: 2, sight: 2, cost: 20, strength: 14, reqTech: "iron_bloomery", reqResource: { resource: "iron", count: 1 }, abilities: ["bonus_vs_cavalry"] }),
  cataphract: U({ id: "cataphract", name: "Cataphract", glyph: "T", cls: "cavalry", movement: 3, sight: 2, cost: 28, strength: 17, reqTech: "cavalry_doctrine", reqResource: { resource: "horses", count: 1 } }),
  crossbowman: U({ id: "crossbowman", name: "Crossbowman", glyph: "V", cls: "ranged", movement: 2, sight: 2, cost: 22, strength: 8, rangedStrength: 14, range: 2, reqTech: "crossbow" }),
  legionary: U({ id: "legionary", name: "Legionary", glyph: "E", cls: "melee", movement: 2, sight: 2, cost: 22, strength: 15, reqTech: "engineering" }),
  war_elephant: U({ id: "war_elephant", name: "War Elephant", glyph: "N", cls: "cavalry", movement: 3, sight: 2, cost: 30, strength: 16, reqTech: "elephantry", reqResource: { resource: "elephants", count: 1 }, abilities: ["bonus_vs_city"] }),

  battering_ram: U({ id: "battering_ram", name: "Battering Ram", glyph: "U", cls: "siege", movement: 2, sight: 2, cost: 16, strength: 6, rangedStrength: 10, range: 1, reqTech: "siegecraft", abilities: ["bonus_vs_city"] }),
  catapult: U({ id: "catapult", name: "Catapult", glyph: "I", cls: "siege", movement: 2, sight: 2, cost: 25, strength: 6, rangedStrength: 14, range: 2, reqTech: "siegecraft", abilities: ["bonus_vs_city"] }),
  ballista: U({ id: "ballista", name: "Ballista", glyph: "b", cls: "siege", movement: 2, sight: 2, cost: 30, strength: 7, rangedStrength: 16, range: 2, reqTech: "torsion_engines", abilities: ["bonus_vs_city"] }),
};

// Assign each unit's player-triggered active abilities (docs/UNIT-ABILITIES.md §4).
// Done as a post-pass so the UNIT_DEFS literals stay readable.
const UNIT_ACTIVE_ABILITIES: Partial<Record<UnitTypeId, ActiveAbilityId[]>> = {
  scout: ["reconnoiter"],
  hunter: ["reconnoiter"],
  slinger: ["skirmish"],
  javelineer: ["skirmish"],
  firehard_spear: ["brace"],
  war_dog: ["harry"],
  axeman: ["sunder"],
  maceman: ["sunder"],
  spearman: ["brace"],
  hoplite: ["shield_wall"],
  light_chariot: ["charge"],
  war_chariot: ["charge"],
  rider: ["charge"],
  horse_archer: ["fire_and_retreat"],
  longswordsman: ["sunder"],
  pikeman: ["brace"],
  cataphract: ["shock_charge"],
  crossbowman: ["pierce"],
  legionary: ["testudo"],
  war_elephant: ["trample"],
  catapult: ["emplace"],
  ballista: ["emplace"],
};
for (const [id, abilities] of Object.entries(UNIT_ACTIVE_ABILITIES)) {
  UNIT_DEFS[id as UnitTypeId].activeAbilities = abilities;
}

export const MILITARY_CLASSES: ReadonlySet<UnitClass> = new Set(["melee", "ranged", "cavalry", "siege"]);

export function isMilitary(type: UnitTypeId): boolean {
  return MILITARY_CLASSES.has(UNIT_DEFS[type].cls);
}

export function isRanged(def: UnitDef): boolean {
  return (def.range ?? 0) >= 1 && (def.rangedStrength ?? 0) > 0;
}

export interface BuildingDef {
  id: BuildingId;
  name: string;
  cost: number;
  reqTech?: TechId;
  /** Strategic resource required to build this building. */
  reqResource?: { resource: string; count: number };
  yields: { food?: number; production?: number; gold?: number; science?: number; culture?: number; faith?: number };
  effect?: "walls" | "barracks";
}

const B = (d: BuildingDef): BuildingDef => d;

export const BUILDING_DEFS: Record<BuildingId, BuildingDef> = {
  granary: B({ id: "granary", name: "Granary", cost: 20, reqTech: "pottery_kiln", yields: { food: 2 } }),
  workshop: B({ id: "workshop", name: "Workshop", cost: 18, reqTech: "native_copper", yields: { production: 1 } }),
  forge: B({ id: "forge", name: "Forge", cost: 26, reqTech: "smelting", yields: { production: 2 } }),
  walls: B({ id: "walls", name: "Walls", cost: 24, reqTech: "masonry", yields: {}, effect: "walls" }),
  barracks: B({ id: "barracks", name: "Barracks", cost: 22, reqTech: "bronze_alloying", yields: {}, effect: "barracks" }),
  stable: B({ id: "stable", name: "Stable", cost: 20, reqTech: "equestrian", yields: { production: 1 } }),
  market: B({ id: "market", name: "Market", cost: 24, reqTech: "coinage", yields: { gold: 3 } }),
  library: B({ id: "library", name: "Archive", cost: 26, reqTech: "writing", yields: { science: 2 } }),
  academy: B({ id: "academy", name: "Academy", cost: 34, reqTech: "philosophy", yields: { science: 3 } }),
  aqueduct: B({ id: "aqueduct", name: "Aqueduct", cost: 30, reqTech: "engineering", yields: { food: 2 } }),
  harbor: B({ id: "harbor", name: "Harbor", cost: 24, reqTech: "sailcloth", yields: { gold: 2 } }),
  monument: B({ id: "monument", name: "Monument", cost: 22, reqTech: "monumental_architecture", yields: { culture: 2 } }),
  amphitheater: B({ id: "amphitheater", name: "Amphitheater", cost: 26, reqTech: "ritual_burial", yields: { culture: 3 } }),
  shrine: B({ id: "shrine", name: "Shrine", cost: 18, reqTech: "ritual_burial", yields: { faith: 2 } }),
  temple: B({ id: "temple", name: "Temple", cost: 28, reqTech: "writing", yields: { faith: 2, culture: 1 } }),
};

export interface TechDef {
  id: TechId;
  name: string;
  cost: number;
  prereqs: TechId[];
}

const T = (id: TechId, name: string, cost: number, prereqs: TechId[]): TechDef => ({ id, name, cost, prereqs });

export const TECH_DEFS: Record<TechId, TechDef> = {
  // Dawn — free roots + first developments
  knapping: T("knapping", "Stone Knapping", 0, []),
  foraging: T("foraging", "Foraging", 0, []),
  fire_hardening: T("fire_hardening", "Fire-Hardening", 15, ["knapping"]),
  hide_working: T("hide_working", "Hide-Working", 18, ["knapping"]),
  animal_taming: T("animal_taming", "Animal Taming", 20, ["foraging"]),
  cultivation: T("cultivation", "Plant Cultivation", 18, ["foraging"]),
  ritual_burial: T("ritual_burial", "Ritual & Burial", 16, ["foraging"]),
  parley: T("parley", "Parley", 16, ["foraging"]),
  pottery_kiln: T("pottery_kiln", "Pottery & Kilns", 24, ["cultivation"]),

  // Copper / Bronze
  native_copper: T("native_copper", "Native Copper", 28, ["pottery_kiln"]),
  smelting: T("smelting", "Smelting", 34, ["native_copper"]),
  bronze_alloying: T("bronze_alloying", "Bronze Alloying", 42, ["smelting"]),
  the_wheel: T("the_wheel", "The Wheel", 30, ["animal_taming"]),
  equestrian: T("equestrian", "Equestrianism", 34, ["animal_taming"]),
  masonry: T("masonry", "Masonry", 35, ["pottery_kiln"]),
  weaving: T("weaving", "Weaving", 26, ["hide_working"]),
  composite_bow: T("composite_bow", "Composite Bow", 38, ["hide_working", "bronze_alloying"]),
  writing: T("writing", "Writing", 36, ["pottery_kiln"]),
  irrigation: T("irrigation", "Irrigation", 30, ["cultivation"]),
  sailcloth: T("sailcloth", "Sailcloth", 32, ["weaving"]),
  chariotry: T("chariotry", "Chariotry", 46, ["the_wheel", "bronze_alloying"]),
  phalanx: T("phalanx", "Phalanx Doctrine", 46, ["bronze_alloying"]),

  // Iron / Classical
  iron_bloomery: T("iron_bloomery", "Iron Bloomery", 55, ["smelting"]),
  carburizing: T("carburizing", "Carburizing (Steel)", 72, ["iron_bloomery"]),
  siegecraft: T("siegecraft", "Siegecraft", 58, ["masonry", "the_wheel"]),
  mathematics: T("mathematics", "Mathematics", 60, ["writing"]),
  torsion_engines: T("torsion_engines", "Torsion Engines", 82, ["siegecraft", "mathematics"]),
  engineering: T("engineering", "Engineering", 66, ["mathematics", "masonry"]),
  coinage: T("coinage", "Coinage", 50, ["writing"]),
  philosophy: T("philosophy", "Philosophy", 56, ["writing"]),
  cavalry_doctrine: T("cavalry_doctrine", "Cavalry Doctrine", 62, ["equestrian", "bronze_alloying"]),
  horse_archery: T("horse_archery", "Horse Archery", 58, ["equestrian", "composite_bow"]),
  crossbow: T("crossbow", "Crossbow", 65, ["carburizing"]),
  monumental_architecture: T("monumental_architecture", "Monumental Architecture", 70, ["masonry", "writing"]),
  elephantry: T("elephantry", "Elephantry", 64, ["animal_taming", "bronze_alloying"]),
};

export const ALL_TECHS: TechId[] = Object.keys(TECH_DEFS) as TechId[];

/** Techs every civ begins the game already knowing. */
export const STARTING_TECHS: TechId[] = ["knapping", "foraging"];

/** Systems gated behind a specific technology (not available from the start). */
export const CIVICS_REQUIRED_TECH: TechId = "writing";
export const RELIGION_REQUIRED_TECH: TechId = "ritual_burial";
/** Unlocks bribing and recruiting barbarian war-bands (see bribery.ts). */
export const BARBARIAN_DIPLOMACY_TECH: TechId = "parley";

export function techUnlocked(researched: ReadonlySet<TechId>, tech: TechId): boolean {
  return TECH_DEFS[tech].prereqs.every((p) => researched.has(p));
}

// ---- human-readable descriptions (for the UI) ----------------------------

const ROLE: Record<UnitClass, string> = {
  melee: "Melee infantry",
  ranged: "Ranged",
  cavalry: "Cavalry",
  siege: "Siege engine",
  recon: "Recon / scout",
  settler: "Founds a new city",
  trader: "Establishes trade routes",
};

export interface UnitInfo {
  role: string;
  stats: string;
  note: string;
}

export function unitInfo(type: UnitTypeId): UnitInfo {
  const d = UNIT_DEFS[type];
  const stats: string[] = [];
  if (d.strength > 0) stats.push(`⚔ ${d.strength}`);
  if ((d.rangedStrength ?? 0) > 0) stats.push(`🏹 ${d.rangedStrength} (range ${d.range})`);
  stats.push(`🥾 ${d.movement}`);
  const notes: string[] = [];
  if (d.abilities?.includes("bonus_vs_cavalry")) notes.push("bonus vs cavalry");
  if (d.abilities?.includes("bonus_vs_city")) notes.push("bonus vs cities");
  if (d.builder) notes.push("3 build charges");
  if (d.founder) notes.push("consumed to found a city");
  if (d.trader) notes.push("consumed to set up a trade route");
  if (d.reqResource) notes.push(`requires ${d.reqResource.count} ${d.reqResource.resource}`);
  return { role: ROLE[d.cls], stats: stats.join(" · "), note: notes.join(" · ") };
}

export function buildingInfo(id: BuildingId): string {
  const d = BUILDING_DEFS[id];
  const y = d.yields;
  const parts: string[] = [];
  if (y.food) parts.push(`+${y.food} 🍞`);
  if (y.production) parts.push(`+${y.production} ⚒️`);
  if (y.gold) parts.push(`+${y.gold} 🪙`);
  if (y.science) parts.push(`+${y.science} 🔬`);
  if (y.culture) parts.push(`+${y.culture} 🎭`);
  if (y.faith) parts.push(`+${y.faith} ☮️`);
  if (d.effect === "walls") parts.push("city walls (+HP & defense)");
  if (d.effect === "barracks") parts.push("+city defense; new units gain XP");
  return parts.join(", ") || "—";
}

/** Names of units/buildings a tech unlocks (for the research picker). */
export function techUnlocks(techId: TechId): string[] {
  const out: string[] = [];
  for (const d of Object.values(UNIT_DEFS)) if (d.reqTech === techId) out.push(d.name);
  for (const d of Object.values(BUILDING_DEFS)) if (d.reqTech === techId) out.push(d.name);
  return out;
}

// ---- Promotions -----------------------------------------------------------

export type PromotionId =
  // shared combat
  | "shock"
  | "drill"
  | "cover"
  | "medic"
  // melee
  | "blitz"
  | "commando"
  | "amphibious"
  | "woodland_warrior"
  | "charge"
  | "toughness"
  | "discipline"
  | "formation"
  | "city_assault"
  | "brawler"
  | "veteran"
  | "eagle_eye"
  | "forager"
  | "stalwart"
  | "besieger"
  | "pathfinder"
  // cavalry
  | "flanking"
  | "mobility"
  | "cavalry_charge"
  | "trample"
  | "mounted_archer"
  | "outrider"
  | "raider"
  | "swift_healer"
  | "breakthrough"
  | "harrier"
  | "nomad"
  | "lancer"
  | "skirmisher"
  | "pursuit"
  | "bloodlust"
  | "intimidation"
  // ranged
  | "accuracy"
  | "barrage"
  | "extended_range"
  | "volley"
  | "sniper"
  | "logistics"
  | "scouting"
  | "camouflage"
  | "field_medic"
  | "suppression"
  | "sharpshooter"
  | "elevation"
  | "poison_arrows"
  | "rapid_reload"
  | "trailblazer"
  | "hunter"
  | "veteran_marksman"
  | "night_owl"
  // siege
  | "siege"
  | "city_breacher"
  | "heavy_caliber"
  | "entrenchment"
  | "counter_battery"
  | "rapid_deployment"
  | "survey"
  | "demolition"
  // recon
  | "tracking"
  | "guerrilla"
  | "survivalist"
  | "spy"
  | "ambush"
  | "ranger"
  | "eagle_eye_recon"
  // civilian
  | "pioneer"
  | "colonist"
  | "explorer"
  | "engineer"
  | "foreman"
  | "survival_training";

export interface PromotionDef {
  id: PromotionId;
  name: string;
  desc: string;
  tier: 1 | 2 | 3;
}

export const PROMOTION_DEFS: Record<PromotionId, PromotionDef> = {
  // shared
  shock: { id: "shock", name: "Shock", desc: "+3 strength attacking on open ground" , tier: 1 },
  drill: { id: "drill", name: "Drill", desc: "+3 strength attacking in rough terrain" , tier: 1 },
  cover: { id: "cover", name: "Cover", desc: "+4 defense vs ranged attacks" , tier: 1 },
  medic: { id: "medic", name: "Medic", desc: "Heals self +10 and adjacent allies +10 each turn" , tier: 1 },

  // melee
  blitz: { id: "blitz", name: "Blitz", desc: "+2 strength" , tier: 2 },
  commando: { id: "commando", name: "Commando", desc: "+1 movement; roads cost no movement" , tier: 2 },
  amphibious: { id: "amphibious", name: "Amphibious", desc: "+3 strength near water tiles" , tier: 2 },
  woodland_warrior: { id: "woodland_warrior", name: "Woodland Warrior", desc: "+3 strength in forest/jungle; forests cost 1 less movement" , tier: 2 },
  charge: { id: "charge", name: "Charge", desc: "+4 strength on the first attack each turn" , tier: 2 },
  toughness: { id: "toughness", name: "Toughness", desc: "+15 max HP" , tier: 2 },
  discipline: { id: "discipline", name: "Discipline", desc: "+2 strength when adjacent to a friendly unit" , tier: 2 },
  formation: { id: "formation", name: "Formation", desc: "+4 defense vs cavalry attacks" , tier: 2 },
  city_assault: { id: "city_assault", name: "City Assault", desc: "+4 strength vs cities" , tier: 3 },
  brawler: { id: "brawler", name: "Brawler", desc: "+3 strength when defending" , tier: 2 },
  veteran: { id: "veteran", name: "Veteran", desc: "+25% XP gain" , tier: 3 },
  eagle_eye: { id: "eagle_eye", name: "Eagle Eye", desc: "+1 sight" , tier: 2 },
  forager: { id: "forager", name: "Forager", desc: "Heals +8 HP after killing a unit or clearing a camp" , tier: 3 },
  stalwart: { id: "stalwart", name: "Stalwart", desc: "-4 damage taken from the first attack against it each turn" , tier: 2 },
  besieger: { id: "besieger", name: "Besieger", desc: "+3 defense when adjacent to an enemy city" , tier: 2 },
  pathfinder: { id: "pathfinder", name: "Pathfinder", desc: "Roads cost no movement; hills cost 1 less movement" , tier: 2 },

  // cavalry
  flanking: { id: "flanking", name: "Flanking", desc: "+2 strength per adjacent friendly unit (max +6)" , tier: 2 },
  mobility: { id: "mobility", name: "Mobility", desc: "+1 movement" , tier: 2 },
  cavalry_charge: { id: "cavalry_charge", name: "Cavalry Charge", desc: "+4 strength on the first attack each turn" , tier: 2 },
  trample: { id: "trample", name: "Trample", desc: "+4 strength vs wounded units" , tier: 2 },
  mounted_archer: { id: "mounted_archer", name: "Mounted Archer", desc: "+1 movement; ranged cavalry gains +2 ranged strength" , tier: 2 },
  outrider: { id: "outrider", name: "Outrider", desc: "+1 sight" , tier: 2 },
  raider: { id: "raider", name: "Raider", desc: "+25 gold when clearing barbarian camps" , tier: 3 },
  swift_healer: { id: "swift_healer", name: "Swift Healer", desc: "Heals +5 HP each turn" , tier: 2 },
  breakthrough: { id: "breakthrough", name: "Breakthrough", desc: "+1 movement after killing a unit" , tier: 3 },
  harrier: { id: "harrier", name: "Harrier", desc: "+3 strength vs ranged units" , tier: 2 },
  nomad: { id: "nomad", name: "Nomad", desc: "Plains and desert cost 1 movement; +1 sight on open ground" , tier: 3 },
  lancer: { id: "lancer", name: "Lancer", desc: "+3 strength vs melee units" , tier: 2 },
  skirmisher: { id: "skirmisher", name: "Skirmisher", desc: "+3 defense when not adjacent to an enemy" , tier: 2 },
  pursuit: { id: "pursuit", name: "Pursuit", desc: "+3 strength when attacking a damaged unit" , tier: 2 },
  bloodlust: { id: "bloodlust", name: "Bloodlust", desc: "Heals +12 HP on kill" , tier: 3 },
  intimidation: { id: "intimidation", name: "Intimidation", desc: "Enemy units adjacent have -2 strength" , tier: 3 },

  // ranged
  accuracy: { id: "accuracy", name: "Accuracy", desc: "+3 ranged strength vs targets on open ground" , tier: 1 },
  barrage: { id: "barrage", name: "Barrage", desc: "+3 ranged strength vs targets in rough terrain" , tier: 1 },
  extended_range: { id: "extended_range", name: "Extended Range", desc: "+1 range" , tier: 2 },
  volley: { id: "volley", name: "Volley", desc: "+2 ranged strength" , tier: 2 },
  sniper: { id: "sniper", name: "Sniper", desc: "+4 ranged strength vs wounded units" , tier: 2 },
  logistics: { id: "logistics", name: "Logistics", desc: "+1 movement" , tier: 2 },
  scouting: { id: "scouting", name: "Scouting", desc: "+1 sight" , tier: 1 },
  camouflage: { id: "camouflage", name: "Camouflage", desc: "+3 defense in rough terrain" , tier: 2 },
  field_medic: { id: "field_medic", name: "Field Medic", desc: "Adjacent allied units heal +5 extra each turn" , tier: 2 },
  suppression: { id: "suppression", name: "Suppression", desc: "Targets deal -3 damage when retaliating" , tier: 2 },
  sharpshooter: { id: "sharpshooter", name: "Sharpshooter", desc: "+3 ranged strength vs melee units" , tier: 2 },
  elevation: { id: "elevation", name: "Elevation", desc: "+2 ranged strength when on a hill" , tier: 2 },
  poison_arrows: { id: "poison_arrows", name: "Poison Arrows", desc: "Targets heal -5 HP next turn" , tier: 3 },
  rapid_reload: { id: "rapid_reload", name: "Rapid Reload", desc: "+1 movement after attacking" , tier: 3 },
  trailblazer: { id: "trailblazer", name: "Trailblazer", desc: "Forest/jungle movement cost reduced by 1" , tier: 2 },
  hunter: { id: "hunter", name: "Hunter", desc: "+3 ranged strength vs cavalry" , tier: 2 },
  veteran_marksman: { id: "veteran_marksman", name: "Veteran Marksman", desc: "+25% XP gain" , tier: 3 },
  night_owl: { id: "night_owl", name: "Night Owl", desc: "+1 sight" , tier: 2 },

  // siege
  siege: { id: "siege", name: "Siege", desc: "+50% strength vs cities" , tier: 1 },
  city_breacher: { id: "city_breacher", name: "City Breacher", desc: "+4 additional strength vs cities" , tier: 2 },
  heavy_caliber: { id: "heavy_caliber", name: "Heavy Caliber", desc: "+3 ranged strength vs units" , tier: 2 },
  entrenchment: { id: "entrenchment", name: "Entrenchment", desc: "+4 defense if the unit did not move this turn" , tier: 2 },
  counter_battery: { id: "counter_battery", name: "Counter Battery", desc: "+4 ranged strength vs ranged/siege units" , tier: 2 },
  rapid_deployment: { id: "rapid_deployment", name: "Rapid Deployment", desc: "+1 movement" , tier: 2 },
  survey: { id: "survey", name: "Survey", desc: "+1 sight" , tier: 2 },
  demolition: { id: "demolition", name: "Demolition", desc: "+3 strength vs units in cities or forts" , tier: 2 },

  // recon
  tracking: { id: "tracking", name: "Tracking", desc: "+1 movement" , tier: 1 },
  guerrilla: { id: "guerrilla", name: "Guerrilla", desc: "+3 strength in rough terrain; ignores rough terrain penalties" , tier: 2 },
  survivalist: { id: "survivalist", name: "Survivalist", desc: "Heals +8 HP each turn" , tier: 2 },
  spy: { id: "spy", name: "Spy", desc: "+1 sight" , tier: 2 },
  ambush: { id: "ambush", name: "Ambush", desc: "+4 strength on the first attack each turn" , tier: 2 },
  ranger: { id: "ranger", name: "Ranger", desc: "+2 strength; +1 sight" , tier: 2 },
  eagle_eye_recon: { id: "eagle_eye_recon", name: "Eagle Eye", desc: "+2 sight" , tier: 3 },

  // civilian
  pioneer: { id: "pioneer", name: "Pioneer", desc: "+1 sight; +1 movement" , tier: 1 },
  colonist: { id: "colonist", name: "Colonist", desc: "+20 HP" , tier: 1 },
  explorer: { id: "explorer", name: "Explorer", desc: "+2 sight" , tier: 1 },
  engineer: { id: "engineer", name: "Engineer", desc: "+1 movement; +1 build charge" , tier: 1 },
  foreman: { id: "foreman", name: "Foreman", desc: "+1 movement" , tier: 1 },
  survival_training: { id: "survival_training", name: "Survival Training", desc: "+15 HP; +1 sight" , tier: 1 },
};

export const PROMOTION_POOL: Record<UnitClass, PromotionId[]> = {
  melee: [
    "shock",
    "drill",
    "cover",
    "medic",
    "blitz",
    "commando",
    "amphibious",
    "woodland_warrior",
    "charge",
    "toughness",
    "discipline",
    "formation",
    "city_assault",
    "brawler",
    "veteran",
    "eagle_eye",
    "forager",
    "stalwart",
    "besieger",
    "pathfinder",
  ],
  cavalry: [
    "shock",
    "drill",
    "cover",
    "medic",
    "flanking",
    "mobility",
    "cavalry_charge",
    "trample",
    "mounted_archer",
    "outrider",
    "raider",
    "swift_healer",
    "breakthrough",
    "harrier",
    "nomad",
    "lancer",
    "skirmisher",
    "pursuit",
    "bloodlust",
    "intimidation",
  ],
  recon: [
    "shock",
    "cover",
    "medic",
    "scouting",
    "tracking",
    "guerrilla",
    "survivalist",
    "spy",
    "ambush",
    "ranger",
    "eagle_eye_recon",
  ],
  ranged: [
    "accuracy",
    "barrage",
    "cover",
    "medic",
    "extended_range",
    "volley",
    "sniper",
    "logistics",
    "scouting",
    "camouflage",
    "field_medic",
    "suppression",
    "sharpshooter",
    "elevation",
    "poison_arrows",
    "rapid_reload",
    "trailblazer",
    "hunter",
    "veteran_marksman",
    "night_owl",
  ],
  siege: [
    "siege",
    "accuracy",
    "medic",
    "extended_range",
    "volley",
    "city_breacher",
    "heavy_caliber",
    "entrenchment",
    "counter_battery",
    "rapid_deployment",
    "survey",
    "demolition",
  ],
  settler: ["pioneer", "colonist", "explorer"],
  trader: [],
};
