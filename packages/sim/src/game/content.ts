// Game content. The tech tree is intentionally NOT a Civilization clone — it's
// organised around real materials & techniques (knapping, smelting, alloying,
// carburizing, torsion, equestrianism…) rather than abstract "eras of science".
// Units are numerous and role-rich: many are available from the start, others
// are unlocked by specific technologies.

import { UNIQUE_INFRA_BUILDINGS } from "@roc/data";

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
  | "battering_ram" | "catapult" | "ballista"
  // early gunpowder
  | "hand_cannon" | "matchlock" | "bombard"
  // naval melee
  | "galley" | "bireme" | "trireme" | "quinquereme" | "longship" | "caravel"
  // naval ranged
  | "dromon" | "war_junk" | "galleass" | "galleon";

export type UnitClass = "settler" | "trader" | "recon" | "melee" | "ranged" | "cavalry" | "siege" | "naval_melee" | "naval_ranged";
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
  | "reconnoiter"
  | "hide"
  // naval
  | "ram"
  | "boarding_party"
  | "greek_fire"
  | "coastal_bombardment"
  // civ-unique / enhanced (docs/UNIT-ABILITIES.md §8)
  | "war_cart_charge"
  | "parthian_shot"
  | "feigned_retreat"
  | "hussar_charge"
  | "othismos"
  | "last_stand"
  | "repeating_fire"
  | "pavise"
  | "arrow_storm"
  | "furor"
  | "siege_assault"
  | "fire_lance";

/** A persistent stance a unit enters by forfeiting its movement for the turn. */
export type StanceId = "brace" | "shield_wall" | "testudo" | "emplace" | "othismos" | "last_stand" | "pavise";

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
  reconnoiter: A({ id: "reconnoiter", name: "Reconnoiter", verb: "Scout Ahead", glyph: "🔭", kind: "self", cooldown: 0, desc: "Forfeit the turn for a vision pulse: +2 sight until your next turn, and reveal hidden enemy units in sight." }),
  hide: A({ id: "hide", name: "Hide", verb: "Hide", glyph: "🌲 ", kind: "self", cooldown: 0, desc: "Conceal in cover (needs ≥1 movement, forfeits the rest). Invisible to enemies until you act or are discovered. An enemy stepping onto you is ambushed; breaking cover near foes grants an ambush attack bonus." }),
  // civ-unique / enhanced (docs/UNIT-ABILITIES.md §8)
  war_cart_charge: A({ id: "war_cart_charge", name: "War-Cart Charge", verb: "Charge", glyph: "🐎", kind: "targeted", cooldown: 0, desc: "An early, lighter charge (+2 attack) that rides through the target — but not over rough terrain." }),
  parthian_shot: A({ id: "parthian_shot", name: "Parthian Shot", verb: "Parthian Shot", glyph: "🏹", kind: "targeted", cooldown: 0, desc: "Fire on the gallop: shoot even after moving, then fall back a tile for free." }),
  feigned_retreat: A({ id: "feigned_retreat", name: "Feigned Retreat", verb: "Feign / Charge", glyph: "🐎", kind: "targeted", cooldown: 0, desc: "Dual-mode horse tactic: kite a distant foe (fire & retreat) or close and ride through an adjacent one (charge)." }),
  hussar_charge: A({ id: "hussar_charge", name: "Winged Charge", verb: "Charge", glyph: "🐎", kind: "targeted", cooldown: 0, desc: "A lance charge that punches through braced spears, ignoring the Set Spears/Shield Wall penalty." }),
  othismos: A({ id: "othismos", name: "Othismos", verb: "Form Phalanx", glyph: "🛡️", kind: "stance", cooldown: 0, desc: "Shield Wall that also lends adjacent friendly melee +2 attack (the phalanx push). Forfeits movement." }),
  last_stand: A({ id: "last_stand", name: "Last Stand", verb: "Last Stand", glyph: "🛡️", kind: "stance", cooldown: 0, desc: "Brace whose bonus grows as HP falls (up to +60% near death). Forfeits movement." }),
  repeating_fire: A({ id: "repeating_fire", name: "Repeating Fire", verb: "Repeating Fire", glyph: "🏹", kind: "targeted", cooldown: 0, desc: "Loose two volleys in one turn; the second shot is weaker." }),
  pavise: A({ id: "pavise", name: "Pavise", verb: "Set Pavise", glyph: "🛡️", kind: "stance", cooldown: 0, desc: "Plant a pavise shield: +50% defense vs ranged until your next turn. Forfeits movement." }),
  arrow_storm: A({ id: "arrow_storm", name: "Arrow Storm", verb: "Arrow Storm", glyph: "🏹", kind: "targeted", cooldown: 0, desc: "A long volley (+1 range) that also lightly wounds a second enemy beside the target." }),
  furor: A({ id: "furor", name: "Furor", verb: "Furor", glyph: "⚔️", kind: "targeted", cooldown: 0, desc: "A fanatic charge: +6 attack this strike, but −4 defense until your next turn." }),
  siege_assault: A({ id: "siege_assault", name: "Assault Tower", verb: "Assault", glyph: "🪜", kind: "targeted", cooldown: 0, desc: "Storm a city wall: a melee assault that ignores wall defense and shelters its crew." }),
  fire_lance: A({ id: "fire_lance", name: "Fire Lance", verb: "Fire Lance", glyph: "🔥", kind: "targeted", cooldown: 2, desc: "Loose a gunpowder lance at a target up to 2 tiles away — slightly stronger than a melee thrust and drawing no retaliation. Needs two turns to reload." }),
  // naval
  ram: A({ id: "ram", name: "Ram", verb: "Ram", glyph: "⚓", kind: "targeted", cooldown: 0, desc: "Drive the ship into an adjacent enemy vessel (+4 attack)." }),
  boarding_party: A({ id: "boarding_party", name: "Boarding Party", verb: "Board", glyph: "⚔️", kind: "targeted", cooldown: 1, desc: "Grapple and storm an adjacent ship (+5 attack, heal on kill)." }),
  greek_fire: A({ id: "greek_fire", name: "Greek Fire", verb: "Burn", glyph: "🔥", kind: "targeted", cooldown: 1, desc: "Flame projectile that sunders the target and splashes half damage to adjacent enemy ships." }),
  coastal_bombardment: A({ id: "coastal_bombardment", name: "Coastal Bombardment", verb: "Bombard", glyph: "💣", kind: "targeted", cooldown: 0, desc: "Ranged ship focuses fire on a coastal city or unit (+4 ranged strength)." }),
};

export type BuildingId =
  | "granary" | "workshop" | "forge" | "walls"
  | "market" | "library" | "academy" | "aqueduct" | "harbor" | "lighthouse" | "monument" | "amphitheater"
  | "shrine" | "temple";

/**
 * Dedicated unit-training building families. Each trains units of one or more unit
 * classes (see TRAINING_CLASS_OF) and has 5 tiers that improve training speed,
 * starting morale/XP, and the number of units trainable at once. Tiers are raised
 * through normal city construction (see ProductionItem `trainingBuilding`); they are
 * NOT stored in `city.buildings` but in `city.training` (see state.ts).
 */
export type TrainingClass = "barracks" | "archery_range" | "stable" | "siege_workshop" | "shipyard";

export type TechId =
  // Dawn
  | "knapping" | "foraging" | "fire_hardening" | "hide_working" | "animal_taming"
  | "cultivation" | "ritual_burial" | "pottery_kiln" | "parley"
  // Copper / Bronze
  | "native_copper" | "smelting" | "bronze_alloying" | "the_wheel" | "equestrian"
  | "masonry" | "weaving" | "composite_bow" | "writing" | "irrigation"
  | "sailcloth" | "chariotry" | "phalanx" | "maritime_foraging"
  // Naval / Maritime
  | "sailing" | "shipbuilding" | "naval_architecture" | "optics" | "astronomy" | "cartography"
  // Iron / Classical
  | "iron_bloomery" | "carburizing" | "siegecraft" | "torsion_engines"
  | "mathematics" | "engineering" | "coinage" | "philosophy"
  | "cavalry_doctrine" | "horse_archery" | "crossbow"
  | "monumental_architecture" | "elephantry" | "bridge_building"
  // Intellectual / cultural / religious institutions — unlock labour-conversion projects
  | "scholasticism" | "aesthetics" | "theology"
  // Early gunpowder
  | "gunpowder" | "firearms";

export const UNIT_MAX_HP = 100;

export interface UnitDef {
  id: UnitTypeId;
  name: string;
  glyph: string;
  cls: UnitClass;
  movement: number;
  sight: number;
  cost: number;
  /** Gold upkeep per turn. Civilian/consumed units are usually 0. */
  upkeep: number;
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
  /** True if the unit can embark land units or itself cross deep ocean. */
  transport?: boolean;
  /** True if the unit can enter ocean tiles before Astronomy. */
  oceanGoing?: boolean;
  /** Fraction (0–1) by which this unit's chance to rout is reduced — disciplined
   *  elites and heavy units stand their ground (see morale.ts). */
  routeResistance?: number;
  /** Gunpowder weapon: very strong, but its ranged shot must be reloaded — it
   *  fires every other turn (loads one turn, fires the next). New units start
   *  with a charge already loaded (see combat.ts / state.ts `loaded`). */
  gunpowder?: boolean;
  /** Passively reveals concealed enemy units within this many tiles each turn
   *  (e.g. war dogs sniff out hidden ambushers; see stealth.ts). */
  detectHiddenRadius?: number;
}

const U = (d: UnitDef): UnitDef => d;

export const UNIT_DEFS: Record<UnitTypeId, UnitDef> = {
  settler: U({ id: "settler", name: "Settler", glyph: "S", cls: "settler", movement: 2, sight: 2, cost: 24, upkeep: 0, strength: 0, founder: true }),
  trader: U({ id: "trader", name: "Trader", glyph: "$", cls: "trader", movement: 3, sight: 2, cost: 30, upkeep: 1, strength: 0, reqTech: "the_wheel", trader: true }),
  scout: U({ id: "scout", name: "Scout", glyph: "C", cls: "recon", movement: 3, sight: 3, cost: 10, upkeep: 1, strength: 4 }),

  clubman: U({ id: "clubman", name: "Clubman", glyph: "c", cls: "melee", movement: 2, sight: 2, cost: 10, upkeep: 1, strength: 6 }),
  warrior: U({ id: "warrior", name: "Warrior", glyph: "W", cls: "melee", movement: 2, sight: 2, cost: 15, upkeep: 1, strength: 8 }),
  slinger: U({ id: "slinger", name: "Slinger", glyph: "L", cls: "ranged", movement: 2, sight: 2, cost: 12, upkeep: 1, strength: 4, rangedStrength: 7, range: 1 }),
  javelineer: U({ id: "javelineer", name: "Javelineer", glyph: "J", cls: "ranged", movement: 2, sight: 2, cost: 14, upkeep: 1, strength: 6, rangedStrength: 8, range: 1 }),
  hunter: U({ id: "hunter", name: "Hunter", glyph: "H", cls: "ranged", movement: 2, sight: 3, cost: 13, upkeep: 1, strength: 5, rangedStrength: 7, range: 1 }),

  firehard_spear: U({ id: "firehard_spear", name: "Fire-Hardened Spearman", glyph: "F", cls: "melee", movement: 2, sight: 2, cost: 15, upkeep: 1, strength: 9, reqTech: "fire_hardening", abilities: ["bonus_vs_cavalry"] }),
  war_dog: U({ id: "war_dog", name: "War Dogs", glyph: "D", cls: "melee", movement: 3, sight: 2, cost: 12, upkeep: 1, strength: 6, reqTech: "animal_taming", detectHiddenRadius: 2 }),
  archer: U({ id: "archer", name: "Archer", glyph: "A", cls: "ranged", movement: 2, sight: 2, cost: 18, upkeep: 1, strength: 6, rangedStrength: 11, range: 2, reqTech: "composite_bow" }),

  axeman: U({ id: "axeman", name: "Bronze Axeman", glyph: "X", cls: "melee", movement: 2, sight: 2, cost: 19, upkeep: 2, strength: 13, reqTech: "bronze_alloying", reqResource: { resource: "copper", count: 1 } }),
  maceman: U({ id: "maceman", name: "Maceman", glyph: "M", cls: "melee", movement: 2, sight: 2, cost: 18, upkeep: 2, strength: 11, reqTech: "bronze_alloying", reqResource: { resource: "copper", count: 1 }, abilities: ["bonus_vs_city"] }),
  spearman: U({ id: "spearman", name: "Spearman", glyph: "P", cls: "melee", movement: 2, sight: 2, cost: 18, upkeep: 2, strength: 11, reqTech: "bronze_alloying", reqResource: { resource: "copper", count: 1 }, abilities: ["bonus_vs_cavalry"], routeResistance: 0.3 }),
  hoplite: U({ id: "hoplite", name: "Heavy Spearman", glyph: "O", cls: "melee", movement: 2, sight: 2, cost: 22, upkeep: 2, strength: 13, reqTech: "phalanx", reqResource: { resource: "copper", count: 1 }, abilities: ["bonus_vs_cavalry"], routeResistance: 0.5 }),

  light_chariot: U({ id: "light_chariot", name: "Light Chariot", glyph: "y", cls: "cavalry", movement: 4, sight: 2, cost: 18, upkeep: 2, strength: 9, reqTech: "the_wheel", reqResource: { resource: "horses", count: 1 } }),
  war_chariot: U({ id: "war_chariot", name: "War Chariot", glyph: "Y", cls: "cavalry", movement: 4, sight: 2, cost: 24, upkeep: 2, strength: 13, reqTech: "chariotry", reqResource: { resource: "horses", count: 1 } }),
  rider: U({ id: "rider", name: "Rider", glyph: "R", cls: "cavalry", movement: 4, sight: 2, cost: 18, upkeep: 2, strength: 10, reqTech: "equestrian", reqResource: { resource: "horses", count: 1 } }),
  horse_archer: U({ id: "horse_archer", name: "Horse Archer", glyph: "Q", cls: "cavalry", movement: 4, sight: 2, cost: 22, upkeep: 2, strength: 7, rangedStrength: 9, range: 1, reqTech: "horse_archery", reqResource: { resource: "horses", count: 1 } }),

  swordsman: U({ id: "swordsman", name: "Swordsman", glyph: "Z", cls: "melee", movement: 2, sight: 2, cost: 22, upkeep: 2, strength: 15, reqTech: "iron_bloomery", reqResource: { resource: "iron", count: 1 } }),
  longswordsman: U({ id: "longswordsman", name: "Longswordsman", glyph: "G", cls: "melee", movement: 2, sight: 2, cost: 26, upkeep: 3, strength: 18, reqTech: "carburizing", reqResource: { resource: "iron", count: 1 } }),
  pikeman: U({ id: "pikeman", name: "Pikeman", glyph: "K", cls: "melee", movement: 2, sight: 2, cost: 20, upkeep: 2, strength: 14, reqTech: "iron_bloomery", reqResource: { resource: "iron", count: 1 }, abilities: ["bonus_vs_cavalry"], routeResistance: 0.4 }),
  cataphract: U({ id: "cataphract", name: "Cataphract", glyph: "T", cls: "cavalry", movement: 3, sight: 2, cost: 28, upkeep: 3, strength: 17, reqTech: "cavalry_doctrine", reqResource: { resource: "horses", count: 1 }, routeResistance: 0.5 }),
  crossbowman: U({ id: "crossbowman", name: "Crossbowman", glyph: "V", cls: "ranged", movement: 2, sight: 2, cost: 22, upkeep: 2, strength: 8, rangedStrength: 14, range: 2, reqTech: "crossbow" }),
  legionary: U({ id: "legionary", name: "Heavy Infantry", glyph: "E", cls: "melee", movement: 2, sight: 2, cost: 22, upkeep: 2, strength: 15, reqTech: "engineering", routeResistance: 0.6 }),
  war_elephant: U({ id: "war_elephant", name: "War Elephant", glyph: "N", cls: "cavalry", movement: 3, sight: 2, cost: 30, upkeep: 3, strength: 16, reqTech: "elephantry", reqResource: { resource: "elephants", count: 1 }, abilities: ["bonus_vs_city"], routeResistance: 0.4 }),

  battering_ram: U({ id: "battering_ram", name: "Battering Ram", glyph: "U", cls: "siege", movement: 2, sight: 2, cost: 16, upkeep: 2, strength: 6, rangedStrength: 10, range: 1, reqTech: "siegecraft", abilities: ["bonus_vs_city"] }),
  catapult: U({ id: "catapult", name: "Catapult", glyph: "I", cls: "siege", movement: 2, sight: 2, cost: 25, upkeep: 2, strength: 6, rangedStrength: 14, range: 2, reqTech: "siegecraft", abilities: ["bonus_vs_city"] }),
  ballista: U({ id: "ballista", name: "Ballista", glyph: "b", cls: "siege", movement: 2, sight: 2, cost: 30, upkeep: 3, strength: 7, rangedStrength: 16, range: 2, reqTech: "torsion_engines", abilities: ["bonus_vs_city"] }),

  // ---- early gunpowder -----------------------------------------------------
  // Devastating firepower offset by a reload: each fires only every other turn
  // (see the `gunpowder` flag + combat.ts reload logic). New units start loaded.
  hand_cannon: U({ id: "hand_cannon", name: "Hand Cannon", glyph: "n", cls: "ranged", movement: 2, sight: 2, cost: 30, upkeep: 2, strength: 9, rangedStrength: 26, range: 1, reqTech: "gunpowder", gunpowder: true }),
  matchlock: U({ id: "matchlock", name: "Matchlock Infantry", glyph: "k", cls: "ranged", movement: 2, sight: 2, cost: 38, upkeep: 3, strength: 12, rangedStrength: 32, range: 1, reqTech: "firearms", gunpowder: true }),
  bombard: U({ id: "bombard", name: "Bombard", glyph: "ß", cls: "siege", movement: 1, sight: 2, cost: 44, upkeep: 3, strength: 8, rangedStrength: 30, range: 2, reqTech: "gunpowder", gunpowder: true, abilities: ["bonus_vs_city"] }),

  // ---- naval melee ---------------------------------------------------------
  galley: U({ id: "galley", name: "Galley", glyph: "g", cls: "naval_melee", movement: 3, sight: 2, cost: 20, upkeep: 2, strength: 10, reqTech: "sailing" }),
  bireme: U({ id: "bireme", name: "Bireme", glyph: "B", cls: "naval_melee", movement: 3, sight: 2, cost: 28, upkeep: 2, strength: 14, reqTech: "shipbuilding" }),
  trireme: U({ id: "trireme", name: "Trireme", glyph: "T", cls: "naval_melee", movement: 3, sight: 2, cost: 32, upkeep: 3, strength: 16, reqTech: "shipbuilding" }),
  quinquereme: U({ id: "quinquereme", name: "Quinquereme", glyph: "Q", cls: "naval_melee", movement: 3, sight: 2, cost: 38, upkeep: 3, strength: 20, reqTech: "naval_architecture" }),
  longship: U({ id: "longship", name: "Longship", glyph: "L", cls: "naval_melee", movement: 4, sight: 2, cost: 26, upkeep: 2, strength: 12, reqTech: "sailcloth" }),
  caravel: U({ id: "caravel", name: "Caravel", glyph: "V", cls: "naval_melee", movement: 5, sight: 3, cost: 40, upkeep: 3, strength: 14, reqTech: "astronomy", oceanGoing: true }),

  // ---- naval ranged --------------------------------------------------------
  dromon: U({ id: "dromon", name: "Dromon", glyph: "D", cls: "naval_ranged", movement: 4, sight: 2, cost: 34, upkeep: 3, strength: 8, rangedStrength: 14, range: 2, reqTech: "engineering" }),
  war_junk: U({ id: "war_junk", name: "War Junk", glyph: "J", cls: "naval_ranged", movement: 4, sight: 2, cost: 34, upkeep: 3, strength: 10, rangedStrength: 16, range: 2, reqTech: "engineering" }),
  galleass: U({ id: "galleass", name: "Galleass", glyph: "G", cls: "naval_ranged", movement: 3, sight: 2, cost: 40, upkeep: 3, strength: 10, rangedStrength: 18, range: 2, reqTech: "naval_architecture" }),
  galleon: U({ id: "galleon", name: "Galleon", glyph: "O", cls: "naval_ranged", movement: 5, sight: 3, cost: 48, upkeep: 4, strength: 12, rangedStrength: 20, range: 2, reqTech: "cartography", oceanGoing: true }),
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
  bombard: ["emplace"],
  // naval
  galley: ["ram"],
  bireme: ["ram"],
  trireme: ["ram"],
  quinquereme: ["ram"],
  longship: ["ram"],
  caravel: ["boarding_party"],
  dromon: ["greek_fire"],
  war_junk: ["greek_fire"],
  galleass: ["coastal_bombardment"],
  galleon: ["coastal_bombardment"],
};
for (const [id, abilities] of Object.entries(UNIT_ACTIVE_ABILITIES)) {
  UNIT_DEFS[id as UnitTypeId].activeAbilities = abilities;
}

// Hide is available "across the board" to all foot infantry (land melee/ranged)
// and to scouts — they can conceal themselves in cover (see stealth.ts). Cavalry,
// siege and naval units cannot hide unless a unique unit grants it (UNIQUE_ABILITY_OVERRIDES).
for (const id of Object.keys(UNIT_DEFS) as UnitTypeId[]) {
  const d = UNIT_DEFS[id];
  if (d.cls === "melee" || d.cls === "ranged" || id === "scout") {
    d.activeAbilities = [...(d.activeAbilities ?? []), "hide"];
  }
}

/**
 * Civ unique units that REPLACE their base unit's active-ability list with a
 * bespoke/enhanced set (docs/UNIT-ABILITIES.md §8). Keyed by unique-unit id
 * (see UNIQUE_UNITS in @roc/data); resolved per unit by its owner civ in
 * abilities.ts. Uniques not listed here simply inherit their base unit's
 * abilities (the civ's flat combat bonus already differentiates them).
 */
export const UNIQUE_ABILITY_OVERRIDES: Record<string, ActiveAbilityId[]> = {
  sumer_war_cart: ["war_cart_charge", "hide"],
  parthia_parthian_horse_archer: ["parthian_shot"],
  scythians_scythian_horse_archer: ["parthian_shot", "hide"],
  mongols_keshig: ["feigned_retreat"],
  greece_hoplite: ["othismos", "hide"],
  sparta_spartan_hoplite: ["last_stand", "hide"],
  celts_gauls_gaesatae: ["furor", "hide"],
  poland_lithuania_winged_hussar: ["hussar_charge"],
  han_china_cho_ko_nu: ["repeating_fire", "hide"],
  // Tang/Song fire lancers carried an early gunpowder lance — a ranged volley on
  // top of the pikeman's brace (see combat.ts fire_lance handling).
  china_tang_song_fire_lancer: ["fire_lance", "brace", "hide"],
  genoa_genoese_crossbowman: ["pierce", "pavise", "hide"],
  anglo_saxon_england_longbowman: ["arrow_storm", "hide"],
  assyria_siege_tower: ["siege_assault"],
  // Unique cavalry/skirmishers that gain Hide (some can hide in the open, see stealth.ts).
  numidia_numidian_cavalry: ["fire_and_retreat", "hide"],
  lusitani_falcata_warrior: ["sunder", "hide"],
  maya_holkan: ["skirmish", "hide"],
  // Spread to more iconic uniques (reusing existing ability mechanics, class-fit).
  japan_samurai: ["sunder", "last_stand", "hide"], // Bushido — fights on while wounded
  ottomans_janissary: ["pierce", "pavise", "hide"], // elite gunners
  crete_cretan_archer: ["arrow_storm", "hide"], // famed mercenary archers
  thebes_sacred_band: ["othismos", "hide"], // Theban phalanx
  mycenaean_greece_mycenaean_spearman: ["othismos", "hide"],
  huns_hunnic_horde: ["feigned_retreat"],
  xiongnu_xiongnu_horse_archer: ["parthian_shot", "hide"],
  golden_horde_tatar_horse_archer: ["feigned_retreat"],
  aztec_eagle_warrior: ["furor", "hide"], // ferocious shock infantry
  maori_toa: ["furor", "hide"], // haka ferocity
};

/**
 * The active abilities a unit type fields, for static display (wiki, lobby) where
 * no game state exists. Honors a unique unit's override (UNIQUE_ABILITY_OVERRIDES);
 * pass `uniqueUnitId` to resolve a civ's unique variant, otherwise the base unit's
 * abilities are returned. Mirrors `effectiveAbilities` (civs.ts) without a Unit.
 */
export function unitActiveAbilityIds(type: UnitTypeId, uniqueUnitId?: string): ActiveAbilityId[] {
  if (uniqueUnitId) {
    const override = UNIQUE_ABILITY_OVERRIDES[uniqueUnitId];
    if (override) return override;
  }
  return UNIT_DEFS[type].activeAbilities ?? [];
}

export const MILITARY_CLASSES: ReadonlySet<UnitClass> = new Set(["melee", "ranged", "cavalry", "siege", "naval_melee", "naval_ranged"]);

export function isMilitary(type: UnitTypeId): boolean {
  return MILITARY_CLASSES.has(UNIT_DEFS[type].cls);
}

export function isRanged(def: UnitDef): boolean {
  return (def.range ?? 0) >= 1 && (def.rangedStrength ?? 0) > 0;
}

export function isNaval(def: UnitDef): boolean {
  return def.cls === "naval_melee" || def.cls === "naval_ranged";
}

export interface BuildingDef {
  id: BuildingId;
  name: string;
  cost: number;
  reqTech?: TechId;
  /** Strategic resource required to build this building. */
  reqResource?: { resource: string; count: number };
  yields: { food?: number; production?: number; gold?: number; science?: number; culture?: number; faith?: number };
  effect?: "walls" | "barracks" | "harbor" | "lighthouse";
}

const B = (d: BuildingDef): BuildingDef => d;

export const BUILDING_DEFS: Record<BuildingId, BuildingDef> = {
  granary: B({ id: "granary", name: "Granary", cost: 20, reqTech: "pottery_kiln", yields: { food: 3 } }),
  workshop: B({ id: "workshop", name: "Workshop", cost: 18, reqTech: "native_copper", yields: { production: 1 } }),
  forge: B({ id: "forge", name: "Forge", cost: 26, reqTech: "smelting", yields: { production: 2 } }),
  walls: B({ id: "walls", name: "Walls", cost: 24, reqTech: "masonry", yields: {}, effect: "walls" }),
  market: B({ id: "market", name: "Market", cost: 24, reqTech: "coinage", yields: { gold: 3 } }),
  library: B({ id: "library", name: "Archive", cost: 26, reqTech: "writing", yields: { science: 2 } }),
  academy: B({ id: "academy", name: "Academy", cost: 34, reqTech: "philosophy", yields: { science: 3 } }),
  aqueduct: B({ id: "aqueduct", name: "Aqueduct", cost: 30, reqTech: "engineering", yields: { food: 2 } }),
  harbor: B({ id: "harbor", name: "Harbor", cost: 24, reqTech: "sailcloth", yields: { gold: 2 }, effect: "harbor" }),
  lighthouse: B({ id: "lighthouse", name: "Lighthouse", cost: 30, reqTech: "optics", yields: { gold: 1, science: 1 }, effect: "lighthouse" }),
  monument: B({ id: "monument", name: "Monument", cost: 22, reqTech: "monumental_architecture", yields: { culture: 2 } }),
  amphitheater: B({ id: "amphitheater", name: "Amphitheater", cost: 26, reqTech: "writing", yields: { culture: 3 } }),
  shrine: B({ id: "shrine", name: "Shrine", cost: 18, reqTech: "ritual_burial", yields: { faith: 2 } }),
  temple: B({ id: "temple", name: "Temple", cost: 28, reqTech: "writing", yields: { faith: 2, culture: 1 } }),
};

// ---- Training buildings (unit-class production families) ------------------
// A city trains units of a given class only if it owns the matching training
// building, and each unit costs a citizen (population). Tiers (1–5), raised via
// construction and gated by tech, improve training speed, starting morale/XP, and
// the number of units trainable at once. See training.ts for the runtime logic.

export interface TrainingTierDef {
  /** Tier number (1–5). */
  tier: number;
  /** Construction cost to raise the building TO this tier (from the previous one). */
  cost: number;
  /** Tech required to build/upgrade to this tier (tier 1 may be ungated). */
  reqTech?: TechId;
  /** Units of this family trainable simultaneously at this tier. */
  slots: number;
  /** Bonus added to a trained unit's starting morale. */
  moraleBonus: number;
  /** A trained unit's starting XP. */
  xp: number;
  /** Train-time multiplier (lower = faster); 1.0 at tier 1 down to ~0.4 at tier 5. */
  speedPct: number;
  /** Flat per-turn yields the building grants its city (e.g. Stable +production). */
  yields?: { food?: number; production?: number; gold?: number; science?: number; culture?: number; faith?: number };
  /** City-defense contribution (Barracks), folded into combat.cityDefenseStrength. */
  defense?: number;
}

export interface TrainingBuildingDef {
  id: TrainingClass;
  name: string;
  glyph: string;
  /** Unit classes trained at this building. */
  classes: UnitClass[];
  /** Exactly 5 tier definitions, tier 1 first. */
  tiers: TrainingTierDef[];
}

/** Standard 5-step tier curve for slots / morale / xp / speed, shared by all families. */
const TIER_CURVE: Omit<TrainingTierDef, "tier" | "cost" | "reqTech">[] = [
  { slots: 1, moraleBonus: 0, xp: 0, speedPct: 1.0 },
  { slots: 1, moraleBonus: 10, xp: 10, speedPct: 0.85 },
  { slots: 2, moraleBonus: 20, xp: 20, speedPct: 0.7 },
  { slots: 2, moraleBonus: 30, xp: 30, speedPct: 0.55 },
  { slots: 3, moraleBonus: 40, xp: 40, speedPct: 0.4 },
];

const TIER_COSTS = [22, 30, 40, 52, 66];

/** Build a family's 5 tiers from the shared curve + per-family tech gates and extras. */
function makeTiers(
  gates: (TechId | undefined)[],
  extra?: (i: number) => Partial<TrainingTierDef>,
): TrainingTierDef[] {
  return TIER_CURVE.map((c, i) => ({
    tier: i + 1,
    cost: TIER_COSTS[i]!,
    reqTech: gates[i],
    ...c,
    ...(extra ? extra(i) : {}),
  }));
}

export const TRAINING_BUILDING_DEFS: Record<TrainingClass, TrainingBuildingDef> = {
  barracks: {
    id: "barracks", name: "Barracks", glyph: "🛡️", classes: ["melee"],
    // Melee discipline scales with metallurgy; also fortifies the city.
    tiers: makeTiers(
      [undefined, "bronze_alloying", "iron_bloomery", "carburizing", "gunpowder"],
      (i) => ({ defense: 2 + i }),
    ),
  },
  archery_range: {
    id: "archery_range", name: "Archery Range", glyph: "🏹", classes: ["ranged"],
    tiers: makeTiers([undefined, "composite_bow", "crossbow", "carburizing", "firearms"]),
  },
  stable: {
    id: "stable", name: "Stable", glyph: "🐎", classes: ["cavalry"],
    // Stables also lend the city a little production (as the old Stable building did).
    tiers: makeTiers(
      ["the_wheel", "equestrian", "cavalry_doctrine", "carburizing", "gunpowder"],
      () => ({ yields: { production: 1 } }),
    ),
  },
  siege_workshop: {
    id: "siege_workshop", name: "Siege Workshop", glyph: "⚙️", classes: ["siege"],
    tiers: makeTiers(["siegecraft", "mathematics", "torsion_engines", "engineering", "gunpowder"]),
  },
  shipyard: {
    id: "shipyard", name: "Shipyard", glyph: "⚓", classes: ["naval_melee", "naval_ranged"],
    tiers: makeTiers(["sailing", "shipbuilding", "naval_architecture", "optics", "cartography"]),
  },
};

export const TRAINING_CLASSES = Object.keys(TRAINING_BUILDING_DEFS) as TrainingClass[];

/** Which training family (if any) a unit type is trained at. Civilians (settler/
 *  trader) and recon (scout) return null — they are trained from the city center. */
export function trainingClassFor(type: UnitTypeId): TrainingClass | null {
  const cls = UNIT_DEFS[type].cls;
  for (const fam of TRAINING_CLASSES) {
    if (TRAINING_BUILDING_DEFS[fam].classes.includes(cls)) return fam;
  }
  return null;
}

/** Resolve a single tier def for a family (tier clamped to 1–5). */
export function trainingTier(family: TrainingClass, tier: number): TrainingTierDef {
  const tiers = TRAINING_BUILDING_DEFS[family].tiers;
  return tiers[Math.max(1, Math.min(tiers.length, tier)) - 1]!;
}

/** Base training time (turns) for a unit before any building-tier speed-up, derived
 *  from its legacy production cost. */
export function baseTrainTime(type: UnitTypeId): number {
  return Math.max(2, Math.round(UNIT_DEFS[type].cost / 6));
}

/** Training time (turns) for a unit given a building-tier speed multiplier. Civilians
 *  trained from the city center pass speedPct = 1. Always at least 1 turn. */
export function trainTimeFor(type: UnitTypeId, speedPct = 1): number {
  return Math.max(1, Math.round(baseTrainTime(type) * speedPct));
}

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
  maritime_foraging: T("maritime_foraging", "Maritime Foraging", 30, ["pottery_kiln"]),
  sailcloth: T("sailcloth", "Sailcloth", 32, ["weaving"]),
  chariotry: T("chariotry", "Chariotry", 46, ["the_wheel", "bronze_alloying"]),
  phalanx: T("phalanx", "Phalanx Doctrine", 46, ["bronze_alloying"]),

  // Naval / Maritime
  sailing: T("sailing", "Sailing", 30, ["sailcloth", "weaving"]),
  shipbuilding: T("shipbuilding", "Shipbuilding", 46, ["sailing", "bronze_alloying"]),
  naval_architecture: T("naval_architecture", "Naval Architecture", 70, ["shipbuilding", "mathematics"]),
  optics: T("optics", "Optics", 55, ["mathematics", "shipbuilding"]),
  astronomy: T("astronomy", "Astronomy", 80, ["optics", "philosophy"]),
  cartography: T("cartography", "Cartography", 90, ["astronomy", "naval_architecture"]),

  // Iron / Classical
  iron_bloomery: T("iron_bloomery", "Iron Bloomery", 55, ["smelting"]),
  carburizing: T("carburizing", "Carburizing (Steel)", 72, ["iron_bloomery"]),
  siegecraft: T("siegecraft", "Siegecraft", 58, ["masonry", "the_wheel"]),
  bridge_building: T("bridge_building", "Bridge Building", 44, ["masonry", "the_wheel"]),
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

  // Intellectual / cultural / religious institutions. Each lets a city pour its
  // labour into a corresponding empire output (see PROJECT_DEFS).
  scholasticism: T("scholasticism", "Scholasticism", 68, ["philosophy"]),
  aesthetics: T("aesthetics", "Aesthetics", 64, ["philosophy"]),
  theology: T("theology", "Theology", 66, ["philosophy", "ritual_burial"]),

  // Early gunpowder — the close of the era (caps at hand cannons, matchlocks, bombards).
  gunpowder: T("gunpowder", "Gunpowder", 95, ["carburizing", "engineering"]),
  firearms: T("firearms", "Firearms", 110, ["gunpowder"]),
};

export const ALL_TECHS: TechId[] = Object.keys(TECH_DEFS) as TechId[];

// ---- Conversion projects --------------------------------------------------
// A city with nothing it wants to build can instead set its labourers to a
// standing "project" that converts the city's production each turn into an
// empire resource. Coinage (gold) is always available — historically the act of
// minting surplus into coin; the others are unlocked by an institutional tech.

export type ProjectId = "coinage" | "scholarship" | "patronage" | "tithe";

/** Which empire pool a project's converted production flows into. */
export type ProjectOutput = "gold" | "science" | "culture" | "faith";

export interface ProjectDef {
  id: ProjectId;
  name: string;
  glyph: string;
  output: ProjectOutput;
  /** Units of output produced per 1 production invested. */
  ratio: number;
  /** Tech that unlocks the project (Coinage is ungated). */
  reqTech?: TechId;
  desc: string;
}

const P = (d: ProjectDef): ProjectDef => d;

export const PROJECT_DEFS: Record<ProjectId, ProjectDef> = {
  coinage: P({
    id: "coinage",
    name: "Coinage",
    glyph: "🪙",
    output: "gold",
    ratio: 1,
    desc: "Set the city's artisans to minting: its production is converted into gold for the treasury each turn.",
  }),
  scholarship: P({
    id: "scholarship",
    name: "Scholarship",
    glyph: "🔬",
    output: "science",
    ratio: 0.5,
    reqTech: "scholasticism",
    desc: "Direct the city's labour toward learning: half its production is converted into science each turn.",
  }),
  patronage: P({
    id: "patronage",
    name: "Patronage",
    glyph: "🎭",
    output: "culture",
    ratio: 0.5,
    reqTech: "aesthetics",
    desc: "Patronise the arts: half the city's production is converted into culture each turn.",
  }),
  tithe: P({
    id: "tithe",
    name: "Tithe",
    glyph: "☮️",
    output: "faith",
    ratio: 0.5,
    reqTech: "theology",
    desc: "Tithe the city's labour to the faithful: half its production is converted into faith each turn.",
  }),
};

export const ALL_PROJECTS: ProjectId[] = Object.keys(PROJECT_DEFS) as ProjectId[];

export function getProjectDef(id: string): ProjectDef | undefined {
  return PROJECT_DEFS[id as ProjectId];
}

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

/** Tier = longest path from a root tech. Used to order prerequisites. */
function techTier(id: TechId, memo = new Map<TechId, number>()): number {
  const cached = memo.get(id);
  if (cached !== undefined) return cached;
  const prereqs = TECH_DEFS[id].prereqs;
  const tier = prereqs.length === 0 ? 0 : Math.max(...prereqs.map((p) => techTier(p, memo))) + 1;
  memo.set(id, tier);
  return tier;
}

/** All techs required to reach `target`, not already researched, in a valid research order. */
export function computeResearchPath(researched: ReadonlySet<TechId>, target: TechId): TechId[] {
  if (researched.has(target)) return [];
  const missing = new Set<TechId>();
  const collect = (id: TechId): void => {
    if (researched.has(id) || missing.has(id)) return;
    missing.add(id);
    for (const p of TECH_DEFS[id].prereqs) collect(p);
  };
  collect(target);
  const memo = new Map<TechId, number>();
  return [...missing].sort((a, b) => {
    const ta = techTier(a, memo);
    const tb = techTier(b, memo);
    if (ta !== tb) return ta - tb;
    return TECH_DEFS[a].name.localeCompare(TECH_DEFS[b].name);
  });
}

/** After finishing a tech, pick the next queued tech whose prerequisites are met. */
export function advanceResearchQueue(player: {
  researched: Set<TechId>;
  researching: TechId | null;
  researchQueue: TechId[];
}): void {
  while (player.researchQueue.length > 0) {
    const next = player.researchQueue[0]!;
    if (player.researched.has(next)) {
      player.researchQueue.shift();
      continue;
    }
    if (techUnlocked(player.researched, next)) {
      player.researching = next;
      player.researchQueue.shift();
      return;
    }
    break;
  }
  player.researching = null;
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
  naval_melee: "Naval melee",
  naval_ranged: "Naval ranged",
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
  if (d.gunpowder) notes.push("gunpowder: fires every other turn (reloads after firing)");
  if (d.detectHiddenRadius) notes.push(`reveals hidden units within ${d.detectHiddenRadius} tiles`);
  if (d.builder) notes.push("3 build charges");
  if (d.founder) notes.push("consumed to found a city");
  if (d.trader) notes.push("consumed to set up a trade route");
  if (d.reqResource) notes.push(`requires ${d.reqResource.count} ${d.reqResource.resource}`);
  if (d.upkeep > 0) notes.push(`${d.upkeep}🪙/turn upkeep`);
  if (isNaval(d)) notes.push("naval");
  if (d.oceanGoing) notes.push("ocean-going");
  return { role: ROLE[d.cls], stats: stats.join(" · "), note: notes.join(" · ") };
}

/**
 * Synthesized building defs for civ-unique buildings (see UNIQUE_INFRA in
 * @roc/data). They behave like normal buildings — flat host-city yields and a
 * production cost — but are only offered to the owning civ (see availableProduction)
 * and additionally carry empire-wide CivEffects merged in playerEffects.
 */
const UNIQUE_BUILDING_DEFS: Record<string, BuildingDef> = {};
for (const u of UNIQUE_INFRA_BUILDINGS) {
  UNIQUE_BUILDING_DEFS[u.id] = {
    id: u.id as BuildingId,
    name: u.name,
    cost: u.cost,
    reqTech: u.reqTech as TechId,
    yields: u.yields,
  };
}

/** Resolve a building id to its def, honoring civ-unique buildings. */
export function getBuildingDef(id: string): BuildingDef | undefined {
  return BUILDING_DEFS[id as BuildingId] ?? UNIQUE_BUILDING_DEFS[id];
}

export function buildingInfo(id: string): string {
  const d = getBuildingDef(id);
  if (!d) return "—";
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
  if (d.effect === "harbor") parts.push("heals adjacent naval units; +trade gold");
  if (d.effect === "lighthouse") parts.push("+1 sight for naval units in this city");
  return parts.join(", ") || "—";
}

/**
 * Map/mechanic/system unlocks whose payoff is neither a unit nor a building, so
 * they cannot be derived from UNIT_DEFS / BUILDING_DEFS. These are otherwise
 * invisible in the research picker and tech tree, so they are curated here as a
 * single source of truth for both surfaces. Keep in sync with the gates that
 * actually enforce them (works.ts, trade.ts, movement.ts, specialists.ts, etc.).
 */
export const TECH_SYSTEM_UNLOCKS: Partial<Record<TechId, string[]>> = {
  // Systems gated behind a tech (see CIVICS/RELIGION/BARBARIAN_DIPLOMACY constants).
  [CIVICS_REQUIRED_TECH]: ["Civics"],
  [RELIGION_REQUIRED_TECH]: ["Religion"],
  [BARBARIAN_DIPLOMACY_TECH]: ["Bribe & recruit barbarians"],
  // Tile-improvement & map mechanics.
  irrigation: ["Farms on river tiles"],
  maritime_foraging: ["Fishery & Saltern improvements"],
  bridge_building: ["Bridges over rivers"],
  sailing: ["Sea trade routes"],
  astronomy: ["Ocean travel for ships"],
  // New specialist types (see specialists.ts).
  the_wheel: ["Agrimensor specialist"],
  masonry: ["Mason & Architect specialists"],
  engineering: ["Military Engineer specialist"],
  // Labour-conversion projects (see PROJECT_DEFS).
  scholasticism: ["Scholarship project (labour → science)"],
  aesthetics: ["Patronage project (labour → culture)"],
  theology: ["Tithe project (labour → faith)"],
};

/** Map/mechanic/system unlocks for a tech (not units or buildings). */
export function techSystemUnlocks(techId: TechId): string[] {
  return TECH_SYSTEM_UNLOCKS[techId] ?? [];
}

/** Names of everything a tech unlocks — units, buildings, and mechanics (for the research picker). */
export function techUnlocks(techId: TechId): string[] {
  const out: string[] = [];
  for (const d of Object.values(UNIT_DEFS)) if (d.reqTech === techId) out.push(d.name);
  for (const d of Object.values(BUILDING_DEFS)) if (d.reqTech === techId) out.push(d.name);
  // Training-building tiers gated by this tech.
  for (const fam of TRAINING_CLASSES) {
    for (const t of TRAINING_BUILDING_DEFS[fam].tiers) {
      if (t.reqTech === techId) out.push(`${TRAINING_BUILDING_DEFS[fam].name} Tier ${t.tier}`);
    }
  }
  out.push(...techSystemUnlocks(techId));
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
  | "evasion"
  | "slip_away"
  | "vanish"
  // naval melee
  | "boarding"
  | "ramming"
  | "marines"
  | "reinforced_hull"
  | "fleet_discipline"
  | "pursuit_at_sea"
  // naval ranged
  | "coastal_bombardment"
  | "extended_range_naval"
  | "chain_shot"
  | "spotter"
  | "repair_crew"
  | "broadside"
  // civilian
  | "pioneer"
  | "colonist"
  | "explorer";

export interface PromotionDef {
  id: PromotionId;
  name: string;
  desc: string;
  tier: 1 | 2 | 3;
  /**
   * Another promotion that must already be held before this one can be taken.
   * Used for tiered chains where a higher tier is a strict upgrade of a lower
   * one (e.g. the Escape line evasion → slip_away → vanish). Independent
   * promotions leave this undefined.
   */
  prereq?: PromotionId;
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
  raider: { id: "raider", name: "Raider", desc: "+25 gold when clearing barbarian camps; +10 gold from pillaging" , tier: 3 },
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
  evasion: { id: "evasion", name: "Evasion", desc: "50% chance to dodge an attack and slip back one tile — once per turn" , tier: 1 },
  slip_away: { id: "slip_away", name: "Slip Away", desc: "75% chance to dodge an attack and slip back one tile — once per turn" , tier: 2, prereq: "evasion" },
  vanish: { id: "vanish", name: "Vanish", desc: "95% chance to dodge an attack and slip back one tile — once per turn" , tier: 3, prereq: "slip_away" },

  // naval melee
  boarding: { id: "boarding", name: "Boarding", desc: "+4 strength vs naval melee units" , tier: 2 },
  ramming: { id: "ramming", name: "Ramming", desc: "+4 strength on the first naval attack each turn" , tier: 2 },
  marines: { id: "marines", name: "Marines", desc: "Can pillage adjacent coastal tiles" , tier: 3 },
  reinforced_hull: { id: "reinforced_hull", name: "Reinforced Hull", desc: "+15 max HP" , tier: 2 },
  fleet_discipline: { id: "fleet_discipline", name: "Fleet Discipline", desc: "+2 strength when adjacent to a friendly naval unit" , tier: 2 },
  pursuit_at_sea: { id: "pursuit_at_sea", name: "Pursuit at Sea", desc: "+3 strength when attacking a damaged ship" , tier: 2 },

  // naval ranged
  coastal_bombardment: { id: "coastal_bombardment", name: "Coastal Bombardment", desc: "+4 ranged strength vs cities" , tier: 2 },
  extended_range_naval: { id: "extended_range_naval", name: "Extended Range", desc: "+1 range" , tier: 2 },
  chain_shot: { id: "chain_shot", name: "Chain Shot", desc: "+4 ranged strength vs naval units" , tier: 2 },
  spotter: { id: "spotter", name: "Spotter", desc: "+1 sight" , tier: 2 },
  repair_crew: { id: "repair_crew", name: "Repair Crew", desc: "Heals +5 HP each turn at sea" , tier: 2 },
  broadside: { id: "broadside", name: "Broadside", desc: "+2 ranged strength" , tier: 2 },

  // civilian
  pioneer: { id: "pioneer", name: "Pioneer", desc: "+1 sight; +1 movement" , tier: 1 },
  colonist: { id: "colonist", name: "Colonist", desc: "+20 HP" , tier: 1 },
  explorer: { id: "explorer", name: "Explorer", desc: "+2 sight" , tier: 1 },
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
  // Scouts are reconnaissance units, not fighters: the only combat perks offered
  // are defensive (cover/stalwart). The rest are vision, mobility, survival, and
  // the tiered Escape line (evasion → slip_away → vanish).
  recon: [
    "cover",
    "medic",
    "scouting",
    "tracking",
    "survivalist",
    "spy",
    "pathfinder",
    "stalwart",
    "eagle_eye_recon",
    "evasion",
    "slip_away",
    "vanish",
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
  naval_melee: [
    "boarding",
    "ramming",
    "medic",
    "fleet_discipline",
    "pursuit_at_sea",
    "reinforced_hull",
    "marines",
  ],
  naval_ranged: [
    "coastal_bombardment",
    "extended_range_naval",
    "chain_shot",
    "spotter",
    "repair_crew",
    "broadside",
    "medic",
  ],
};
