// Game content. The tech tree is intentionally NOT a Civilization clone — it's
// organised around real materials & techniques (knapping, smelting, alloying,
// carburizing, torsion, equestrianism…) rather than abstract "eras of science".
// Units are numerous and role-rich: many are available from the start, others
// are unlocked by specific technologies. Naval units await the water-movement
// system, so they're intentionally omitted for now.

export type UnitTypeId =
  // civilian
  | "settler" | "worker"
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

export type UnitClass = "settler" | "worker" | "recon" | "melee" | "ranged" | "cavalry" | "siege";
export type UnitAbility = "bonus_vs_cavalry" | "bonus_vs_city";

export type BuildingId =
  | "granary" | "workshop" | "forge" | "walls" | "barracks" | "stable"
  | "market" | "library" | "academy" | "aqueduct" | "harbor" | "monument";

export type TechId =
  // Dawn
  | "knapping" | "foraging" | "fire_hardening" | "hide_working" | "animal_taming"
  | "cultivation" | "ritual_burial" | "pottery_kiln"
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
  founder?: boolean;
  builder?: boolean;
  abilities?: UnitAbility[];
}

const U = (d: UnitDef): UnitDef => d;

export const UNIT_DEFS: Record<UnitTypeId, UnitDef> = {
  settler: U({ id: "settler", name: "Settler", glyph: "S", cls: "settler", movement: 2, sight: 2, cost: 24, strength: 0, founder: true }),
  worker: U({ id: "worker", name: "Worker", glyph: "B", cls: "worker", movement: 2, sight: 2, cost: 16, strength: 0, builder: true }),
  scout: U({ id: "scout", name: "Scout", glyph: "C", cls: "recon", movement: 3, sight: 3, cost: 10, strength: 4 }),

  clubman: U({ id: "clubman", name: "Clubman", glyph: "c", cls: "melee", movement: 2, sight: 2, cost: 10, strength: 6 }),
  warrior: U({ id: "warrior", name: "Warrior", glyph: "W", cls: "melee", movement: 2, sight: 2, cost: 15, strength: 8 }),
  slinger: U({ id: "slinger", name: "Slinger", glyph: "L", cls: "ranged", movement: 2, sight: 2, cost: 12, strength: 4, rangedStrength: 7, range: 1 }),
  javelineer: U({ id: "javelineer", name: "Javelineer", glyph: "J", cls: "ranged", movement: 2, sight: 2, cost: 14, strength: 6, rangedStrength: 8, range: 1 }),
  hunter: U({ id: "hunter", name: "Hunter", glyph: "H", cls: "ranged", movement: 2, sight: 3, cost: 13, strength: 5, rangedStrength: 7, range: 1 }),

  firehard_spear: U({ id: "firehard_spear", name: "Fire-Hardened Spearman", glyph: "F", cls: "melee", movement: 2, sight: 2, cost: 15, strength: 9, reqTech: "fire_hardening", abilities: ["bonus_vs_cavalry"] }),
  war_dog: U({ id: "war_dog", name: "War Dogs", glyph: "D", cls: "melee", movement: 3, sight: 2, cost: 12, strength: 6, reqTech: "animal_taming" }),
  archer: U({ id: "archer", name: "Archer", glyph: "A", cls: "ranged", movement: 2, sight: 2, cost: 18, strength: 6, rangedStrength: 11, range: 2, reqTech: "composite_bow" }),

  axeman: U({ id: "axeman", name: "Bronze Axeman", glyph: "X", cls: "melee", movement: 2, sight: 2, cost: 19, strength: 13, reqTech: "bronze_alloying" }),
  maceman: U({ id: "maceman", name: "Maceman", glyph: "M", cls: "melee", movement: 2, sight: 2, cost: 18, strength: 11, reqTech: "bronze_alloying", abilities: ["bonus_vs_city"] }),
  spearman: U({ id: "spearman", name: "Spearman", glyph: "P", cls: "melee", movement: 2, sight: 2, cost: 18, strength: 11, reqTech: "bronze_alloying", abilities: ["bonus_vs_cavalry"] }),
  hoplite: U({ id: "hoplite", name: "Hoplite", glyph: "O", cls: "melee", movement: 2, sight: 2, cost: 22, strength: 13, reqTech: "phalanx", abilities: ["bonus_vs_cavalry"] }),

  light_chariot: U({ id: "light_chariot", name: "Light Chariot", glyph: "y", cls: "cavalry", movement: 4, sight: 2, cost: 18, strength: 9, reqTech: "the_wheel" }),
  war_chariot: U({ id: "war_chariot", name: "War Chariot", glyph: "Y", cls: "cavalry", movement: 4, sight: 2, cost: 24, strength: 13, reqTech: "chariotry" }),
  rider: U({ id: "rider", name: "Rider", glyph: "R", cls: "cavalry", movement: 4, sight: 2, cost: 18, strength: 10, reqTech: "equestrian" }),
  horse_archer: U({ id: "horse_archer", name: "Horse Archer", glyph: "Q", cls: "cavalry", movement: 4, sight: 2, cost: 22, strength: 7, rangedStrength: 9, range: 1, reqTech: "horse_archery" }),

  swordsman: U({ id: "swordsman", name: "Swordsman", glyph: "Z", cls: "melee", movement: 2, sight: 2, cost: 22, strength: 15, reqTech: "iron_bloomery" }),
  longswordsman: U({ id: "longswordsman", name: "Longswordsman", glyph: "G", cls: "melee", movement: 2, sight: 2, cost: 26, strength: 18, reqTech: "carburizing" }),
  pikeman: U({ id: "pikeman", name: "Pikeman", glyph: "K", cls: "melee", movement: 2, sight: 2, cost: 20, strength: 14, reqTech: "iron_bloomery", abilities: ["bonus_vs_cavalry"] }),
  cataphract: U({ id: "cataphract", name: "Cataphract", glyph: "T", cls: "cavalry", movement: 3, sight: 2, cost: 28, strength: 17, reqTech: "cavalry_doctrine" }),
  crossbowman: U({ id: "crossbowman", name: "Crossbowman", glyph: "V", cls: "ranged", movement: 2, sight: 2, cost: 22, strength: 8, rangedStrength: 14, range: 2, reqTech: "crossbow" }),
  legionary: U({ id: "legionary", name: "Legionary", glyph: "E", cls: "melee", movement: 2, sight: 2, cost: 22, strength: 15, reqTech: "engineering" }),
  war_elephant: U({ id: "war_elephant", name: "War Elephant", glyph: "N", cls: "cavalry", movement: 3, sight: 2, cost: 30, strength: 16, reqTech: "elephantry", abilities: ["bonus_vs_city"] }),

  battering_ram: U({ id: "battering_ram", name: "Battering Ram", glyph: "U", cls: "siege", movement: 2, sight: 2, cost: 16, strength: 6, rangedStrength: 10, range: 1, reqTech: "siegecraft", abilities: ["bonus_vs_city"] }),
  catapult: U({ id: "catapult", name: "Catapult", glyph: "I", cls: "siege", movement: 2, sight: 2, cost: 25, strength: 6, rangedStrength: 14, range: 2, reqTech: "siegecraft", abilities: ["bonus_vs_city"] }),
  ballista: U({ id: "ballista", name: "Ballista", glyph: "b", cls: "siege", movement: 2, sight: 2, cost: 30, strength: 7, rangedStrength: 16, range: 2, reqTech: "torsion_engines", abilities: ["bonus_vs_city"] }),
};

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
  yields: { food?: number; production?: number; gold?: number; science?: number };
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
  monument: B({ id: "monument", name: "Monument", cost: 28, reqTech: "monumental_architecture", yields: { science: 1 } }),
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

export function techUnlocked(researched: ReadonlySet<TechId>, tech: TechId): boolean {
  return TECH_DEFS[tech].prereqs.every((p) => researched.has(p));
}

// ---- Promotions (unchanged from M2) --------------------------------------

export type PromotionId = "shock" | "drill" | "cover" | "accuracy" | "barrage" | "siege" | "medic";

export interface PromotionDef {
  id: PromotionId;
  name: string;
  desc: string;
}

export const PROMOTION_DEFS: Record<PromotionId, PromotionDef> = {
  shock: { id: "shock", name: "Shock", desc: "+3 when attacking on open ground" },
  drill: { id: "drill", name: "Drill", desc: "+3 when attacking in rough terrain" },
  cover: { id: "cover", name: "Cover", desc: "+4 defense vs ranged attacks" },
  accuracy: { id: "accuracy", name: "Accuracy", desc: "+3 ranged vs targets on open ground" },
  barrage: { id: "barrage", name: "Barrage", desc: "+3 ranged vs targets in rough terrain" },
  siege: { id: "siege", name: "Siege", desc: "+50% vs cities" },
  medic: { id: "medic", name: "Medic", desc: "Heals self and adjacent allies each turn" },
};

export const PROMOTION_POOL: Record<UnitClass, PromotionId[]> = {
  melee: ["shock", "drill", "cover", "medic"],
  cavalry: ["shock", "drill", "cover", "medic"],
  recon: ["shock", "cover", "medic"],
  ranged: ["accuracy", "barrage", "cover", "medic"],
  siege: ["siege", "accuracy", "medic"],
  settler: [],
  worker: [],
};
