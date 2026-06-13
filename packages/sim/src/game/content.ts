// Data-driven content for the M2 slice: unit types (with combat stats), a wider
// tech tree, buildings, and promotions. Full rosters live in /docs and grow later.

export type UnitTypeId =
  | "settler"
  | "worker"
  | "scout"
  | "warrior"
  | "slinger"
  | "archer"
  | "spearman"
  | "swordsman"
  | "horseman"
  | "catapult";

export type UnitClass =
  | "settler"
  | "worker"
  | "recon"
  | "melee"
  | "ranged"
  | "cavalry"
  | "siege";

export type UnitAbility = "bonus_vs_cavalry" | "bonus_vs_city";

export type BuildingId = "granary" | "library" | "walls" | "barracks";

export type TechId =
  | "agriculture"
  | "pottery"
  | "animal_husbandry"
  | "mining"
  | "archery"
  | "bronze_working"
  | "masonry"
  | "writing"
  | "iron_working"
  | "horseback_riding"
  | "the_wheel"
  | "mathematics";

export const UNIT_MAX_HP = 100;

export interface UnitDef {
  id: UnitTypeId;
  name: string;
  glyph: string;
  cls: UnitClass;
  movement: number;
  sight: number;
  cost: number;
  /** Combat strength (used for melee attack and all defense). */
  strength: number;
  /** Ranged attack strength (0 = cannot make ranged attacks). */
  rangedStrength?: number;
  /** Attack range in hexes (>=1 means it attacks at range). */
  range?: number;
  reqTech?: TechId;
  founder?: boolean;
  builder?: boolean;
  abilities?: UnitAbility[];
}

export const UNIT_DEFS: Record<UnitTypeId, UnitDef> = {
  settler: { id: "settler", name: "Settler", glyph: "S", cls: "settler", movement: 2, sight: 2, cost: 24, strength: 0, founder: true },
  worker: { id: "worker", name: "Worker", glyph: "B", cls: "worker", movement: 2, sight: 2, cost: 16, strength: 0, builder: true },
  scout: { id: "scout", name: "Scout", glyph: "C", cls: "recon", movement: 3, sight: 3, cost: 12, strength: 5 },
  warrior: { id: "warrior", name: "Warrior", glyph: "W", cls: "melee", movement: 2, sight: 2, cost: 15, strength: 8 },
  slinger: { id: "slinger", name: "Slinger", glyph: "L", cls: "ranged", movement: 2, sight: 2, cost: 14, strength: 5, rangedStrength: 8, range: 1 },
  archer: { id: "archer", name: "Archer", glyph: "A", cls: "ranged", movement: 2, sight: 2, cost: 18, strength: 6, rangedStrength: 11, range: 2, reqTech: "archery" },
  spearman: { id: "spearman", name: "Spearman", glyph: "P", cls: "melee", movement: 2, sight: 2, cost: 18, strength: 11, reqTech: "bronze_working", abilities: ["bonus_vs_cavalry"] },
  swordsman: { id: "swordsman", name: "Swordsman", glyph: "X", cls: "melee", movement: 2, sight: 2, cost: 22, strength: 15, reqTech: "iron_working" },
  horseman: { id: "horseman", name: "Horseman", glyph: "H", cls: "cavalry", movement: 4, sight: 2, cost: 20, strength: 12, reqTech: "horseback_riding" },
  catapult: { id: "catapult", name: "Catapult", glyph: "T", cls: "siege", movement: 2, sight: 2, cost: 25, strength: 6, rangedStrength: 14, range: 2, reqTech: "mathematics", abilities: ["bonus_vs_city"] },
};

export function isRanged(def: UnitDef): boolean {
  return (def.range ?? 0) >= 1 && (def.rangedStrength ?? 0) > 0;
}

export interface BuildingDef {
  id: BuildingId;
  name: string;
  cost: number;
  reqTech?: TechId;
  yields: { food?: number; production?: number; gold?: number; science?: number };
  /** Special effects resolved by the city, not as flat yields. */
  effect?: "walls" | "barracks";
}

export const BUILDING_DEFS: Record<BuildingId, BuildingDef> = {
  granary: { id: "granary", name: "Granary", cost: 20, reqTech: "pottery", yields: { food: 1 } },
  library: { id: "library", name: "Library", cost: 28, reqTech: "writing", yields: { science: 2 } },
  walls: { id: "walls", name: "Walls", cost: 24, reqTech: "masonry", yields: {}, effect: "walls" },
  barracks: { id: "barracks", name: "Barracks", cost: 22, reqTech: "bronze_working", yields: {}, effect: "barracks" },
};

export interface TechDef {
  id: TechId;
  name: string;
  cost: number;
  prereqs: TechId[];
}

export const TECH_DEFS: Record<TechId, TechDef> = {
  agriculture: { id: "agriculture", name: "Agriculture", cost: 0, prereqs: [] },
  pottery: { id: "pottery", name: "Pottery", cost: 20, prereqs: ["agriculture"] },
  animal_husbandry: { id: "animal_husbandry", name: "Animal Husbandry", cost: 20, prereqs: ["agriculture"] },
  mining: { id: "mining", name: "Mining", cost: 25, prereqs: ["agriculture"] },
  archery: { id: "archery", name: "Archery", cost: 25, prereqs: ["agriculture"] },
  bronze_working: { id: "bronze_working", name: "Bronze Working", cost: 35, prereqs: ["mining"] },
  masonry: { id: "masonry", name: "Masonry", cost: 35, prereqs: ["mining"] },
  writing: { id: "writing", name: "Writing", cost: 30, prereqs: ["pottery"] },
  iron_working: { id: "iron_working", name: "Iron Working", cost: 55, prereqs: ["bronze_working"] },
  horseback_riding: { id: "horseback_riding", name: "Horseback Riding", cost: 45, prereqs: ["animal_husbandry"] },
  the_wheel: { id: "the_wheel", name: "The Wheel", cost: 40, prereqs: ["animal_husbandry"] },
  mathematics: { id: "mathematics", name: "Mathematics", cost: 65, prereqs: ["writing", "the_wheel"] },
};

export const ALL_TECHS: TechId[] = Object.keys(TECH_DEFS) as TechId[];

export function techUnlocked(researched: ReadonlySet<TechId>, tech: TechId): boolean {
  return TECH_DEFS[tech].prereqs.every((p) => researched.has(p));
}

// ---- Promotions ----------------------------------------------------------

export type PromotionId =
  | "shock"
  | "drill"
  | "cover"
  | "accuracy"
  | "barrage"
  | "siege"
  | "medic";

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

/** Promotions a class can choose from. */
export const PROMOTION_POOL: Record<UnitClass, PromotionId[]> = {
  melee: ["shock", "drill", "cover", "medic"],
  cavalry: ["shock", "drill", "cover", "medic"],
  recon: ["shock", "cover", "medic"],
  ranged: ["accuracy", "barrage", "cover", "medic"],
  siege: ["siege", "accuracy", "medic"],
  settler: [],
  worker: [],
};
