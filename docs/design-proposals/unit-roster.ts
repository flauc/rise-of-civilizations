// Unit roster design artifact.
// NOT imported by the game. Review-only concrete data matching unit-designs.md.

export type UnitClass =
  | "settler" | "worker" | "recon"
  | "melee" | "ranged" | "skirmisher"
  | "cavalry" | "siege" | "naval_melee" | "naval_ranged" | "support";

export type UnitAbility =
  | "bonus_vs_cavalry"
  | "bonus_vs_city"
  | "ignore_terrain_cost"
  | "no_defensive_terrain"
  | "fire_after_move"
  | "zone_of_control"
  | "can_embark"
  | "coastal_raider"
  | "transport"
  | "heal_adjacent";

export interface UnitDef {
  id: string;
  name: string;
  glyph: string;
  cls: UnitClass;
  era: 1 | 2 | 3 | 4 | 5;
  movement: number;
  sight: number;
  cost: number;
  maintenance: number;
  strength: number;
  rangedStrength?: number;
  range?: number;
  reqTech?: string;
  resource?: string;
  abilities?: UnitAbility[];
  notes?: string;
}

const U = (d: UnitDef): UnitDef => d;

export const UNIT_ROSTER: Record<string, UnitDef> = {
  // Civilian & support
  settler: U({ id: "settler", name: "Settler", glyph: "S", cls: "settler", era: 1, movement: 2, sight: 2, cost: 24, maintenance: 0, strength: 0, notes: "Founds a city." }),
  worker: U({ id: "worker", name: "Worker", glyph: "B", cls: "worker", era: 1, movement: 2, sight: 2, cost: 16, maintenance: 0, strength: 0, notes: "Builds tile improvements." }),
  scout: U({ id: "scout", name: "Scout", glyph: "C", cls: "recon", era: 1, movement: 3, sight: 3, cost: 10, maintenance: 0, strength: 4, abilities: ["ignore_terrain_cost"] }),
  pathfinder: U({ id: "pathfinder", name: "Pathfinder", glyph: "c", cls: "recon", era: 2, movement: 3, sight: 4, cost: 16, maintenance: 0, strength: 6, abilities: ["ignore_terrain_cost"], reqTech: "composite_bow" }),
  caravan: U({ id: "caravan", name: "Caravan", glyph: "$", cls: "support", era: 2, movement: 3, sight: 2, cost: 20, maintenance: 1, strength: 2, notes: "Land trade route unit." }),
  medic: U({ id: "medic", name: "Field Medic", glyph: "+", cls: "support", era: 3, movement: 2, sight: 2, cost: 22, maintenance: 1, strength: 2, abilities: ["heal_adjacent"] }),
  engineer: U({ id: "engineer", name: "Military Engineer", glyph: "E", cls: "support", era: 3, movement: 2, sight: 2, cost: 26, maintenance: 1, strength: 4, notes: "Roads, forts, repairs." }),
  missionary: U({ id: "missionary", name: "Missionary", glyph: "m", cls: "support", era: 3, movement: 3, sight: 2, cost: 18, maintenance: 1, strength: 0, notes: "Spreads religion." }),

  // Dawn / Stone era
  clubman: U({ id: "clubman", name: "Clubman", glyph: "w", cls: "melee", era: 1, movement: 2, sight: 2, cost: 10, maintenance: 0, strength: 6 }),
  warrior: U({ id: "warrior", name: "Warrior", glyph: "W", cls: "melee", era: 1, movement: 2, sight: 2, cost: 15, maintenance: 0, strength: 8 }),
  slinger: U({ id: "slinger", name: "Slinger", glyph: "L", cls: "ranged", era: 1, movement: 2, sight: 2, cost: 12, maintenance: 0, strength: 4, rangedStrength: 7, range: 1 }),
  javelineer: U({ id: "javelineer", name: "Javelineer", glyph: "J", cls: "ranged", era: 1, movement: 2, sight: 2, cost: 14, maintenance: 0, strength: 6, rangedStrength: 8, range: 1 }),
  hunter: U({ id: "hunter", name: "Hunter", glyph: "H", cls: "ranged", era: 1, movement: 2, sight: 3, cost: 13, maintenance: 0, strength: 5, rangedStrength: 7, range: 1 }),

  // Bronze era
  firehard_spear: U({ id: "firehard_spear", name: "Fire-Hardened Spearman", glyph: "F", cls: "melee", era: 2, movement: 2, sight: 2, cost: 15, maintenance: 0, strength: 9, reqTech: "fire_hardening", abilities: ["bonus_vs_cavalry"] }),
  war_dog: U({ id: "war_dog", name: "War Dogs", glyph: "D", cls: "melee", era: 2, movement: 3, sight: 2, cost: 12, maintenance: 0, strength: 6, reqTech: "animal_taming" }),
  archer: U({ id: "archer", name: "Archer", glyph: "A", cls: "ranged", era: 2, movement: 2, sight: 2, cost: 18, maintenance: 0, strength: 6, rangedStrength: 11, range: 2, reqTech: "composite_bow" }),
  axeman: U({ id: "axeman", name: "Bronze Axeman", glyph: "X", cls: "melee", era: 2, movement: 2, sight: 2, cost: 19, maintenance: 0, strength: 13, reqTech: "bronze_alloying" }),
  maceman: U({ id: "maceman", name: "Maceman", glyph: "M", cls: "melee", era: 2, movement: 2, sight: 2, cost: 18, maintenance: 0, strength: 11, reqTech: "bronze_alloying", abilities: ["bonus_vs_city"] }),
  spearman: U({ id: "spearman", name: "Spearman", glyph: "P", cls: "melee", era: 2, movement: 2, sight: 2, cost: 18, maintenance: 0, strength: 11, reqTech: "bronze_alloying", abilities: ["bonus_vs_cavalry"] }),
  hoplite: U({ id: "hoplite", name: "Hoplite", glyph: "O", cls: "melee", era: 2, movement: 2, sight: 2, cost: 22, maintenance: 0, strength: 13, reqTech: "phalanx", abilities: ["bonus_vs_cavalry"], notes: "+2 when adjacent to another Hoplite." }),
  light_chariot: U({ id: "light_chariot", name: "Light Chariot", glyph: "y", cls: "cavalry", era: 2, movement: 4, sight: 2, cost: 18, maintenance: 0, strength: 9, reqTech: "the_wheel", abilities: ["no_defensive_terrain"] }),
  war_chariot: U({ id: "war_chariot", name: "War Chariot", glyph: "Y", cls: "cavalry", era: 2, movement: 4, sight: 2, cost: 24, maintenance: 0, strength: 13, reqTech: "chariotry", abilities: ["no_defensive_terrain"] }),
  rider: U({ id: "rider", name: "Rider", glyph: "R", cls: "cavalry", era: 2, movement: 4, sight: 2, cost: 18, maintenance: 0, strength: 10, reqTech: "equestrian" }),
  horse_archer: U({ id: "horse_archer", name: "Horse Archer", glyph: "Q", cls: "cavalry", era: 2, movement: 4, sight: 2, cost: 22, maintenance: 0, strength: 7, rangedStrength: 9, range: 1, reqTech: "horse_archery" }),
  battering_ram: U({ id: "battering_ram", name: "Battering Ram", glyph: "U", cls: "siege", era: 2, movement: 2, sight: 2, cost: 16, maintenance: 0, strength: 6, rangedStrength: 10, range: 1, reqTech: "siegecraft", abilities: ["bonus_vs_city"] }),

  // Iron / Classical era
  swordsman: U({ id: "swordsman", name: "Swordsman", glyph: "Z", cls: "melee", era: 3, movement: 2, sight: 2, cost: 22, maintenance: 1, strength: 15, reqTech: "iron_bloomery", resource: "iron" }),
  longswordsman: U({ id: "longswordsman", name: "Longswordsman", glyph: "G", cls: "melee", era: 3, movement: 2, sight: 2, cost: 26, maintenance: 1, strength: 18, reqTech: "carburizing", resource: "iron" }),
  pikeman: U({ id: "pikeman", name: "Pikeman", glyph: "K", cls: "melee", era: 3, movement: 2, sight: 2, cost: 20, maintenance: 1, strength: 14, reqTech: "iron_bloomery", abilities: ["bonus_vs_cavalry"] }),
  legionary: U({ id: "legionary", name: "Legionary", glyph: "E", cls: "melee", era: 3, movement: 2, sight: 2, cost: 22, maintenance: 1, strength: 15, reqTech: "engineering", notes: "Can build roads and forts." }),
  cataphract: U({ id: "cataphract", name: "Cataphract", glyph: "T", cls: "cavalry", era: 3, movement: 3, sight: 2, cost: 28, maintenance: 2, strength: 17, reqTech: "cavalry_doctrine", resource: "iron" }),
  crossbowman: U({ id: "crossbowman", name: "Crossbowman", glyph: "V", cls: "ranged", era: 3, movement: 2, sight: 2, cost: 22, maintenance: 1, strength: 8, rangedStrength: 14, range: 2, reqTech: "crossbow" }),
  war_elephant: U({ id: "war_elephant", name: "War Elephant", glyph: "N", cls: "cavalry", era: 3, movement: 3, sight: 2, cost: 30, maintenance: 2, strength: 16, reqTech: "elephantry", abilities: ["bonus_vs_city"], resource: "ivory" }),
  catapult: U({ id: "catapult", name: "Catapult", glyph: "I", cls: "siege", era: 3, movement: 2, sight: 2, cost: 25, maintenance: 1, strength: 6, rangedStrength: 14, range: 2, reqTech: "siegecraft", abilities: ["bonus_vs_city"] }),
  ballista: U({ id: "ballista", name: "Ballista", glyph: "b", cls: "siege", era: 3, movement: 2, sight: 2, cost: 30, maintenance: 1, strength: 7, rangedStrength: 16, range: 2, reqTech: "torsion_engines", abilities: ["bonus_vs_city"] }),


// test append
MEDIEVAL_START
  man_at_arms: U({
    id: "man_at_arms",
    name: "Man-at-Arms",
    glyph: "g",
    cls: "melee",
    era: 4,
    movement: 2, sight: 2, cost: 28, maintenance: 1, strength: 20, reqTech: "steel"
  }),
  halberdier: U({
