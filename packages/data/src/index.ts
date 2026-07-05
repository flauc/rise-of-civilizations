// Civilization content. Kept dependency-free (loose string ids for unit classes
// and building ids) so the sim can import it without a dependency cycle. The sim
// applies these effects at the relevant points (see packages/sim/src/game/civs.ts).

// Encyclopedia historical/lore content (back stories, ability/perk origins, etc.).
export * from "./history";

export interface CityYieldBonus {
  food?: number;
  production?: number;
  gold?: number;
  science?: number;
  culture?: number;
  faith?: number;
}

export interface CivEffects {
  /** Percentage bonus to a city's per-turn yields. */
  yieldPercent?: { food?: number; production?: number; gold?: number; science?: number; culture?: number; faith?: number };
  /** Extra movement points for cavalry-class units. */
  cavalryMovementBonus?: number;
  /** Extra movement points for naval-class units. */
  navalMovementBonus?: number;
  /** Extra movement points for land military units. */
  landMovementBonus?: number;
  /** Extra movement points for all units. */
  allUnitMovementBonus?: number;
  /** Mounted units gain +sight. */
  mountedSightBonus?: number;
  /** Land units ignore rough-terrain movement penalties. */
  ignoreRoughTerrain?: boolean;
  /** Units ignore mountain movement penalties. */
  ignoreMountainMovement?: boolean;
  /** Flat combat-strength bonus per unit class id ("melee" | "ranged" | "cavalry" | "siege" | "naval_melee" | "naval_ranged" | ...). */
  unitClassCombat?: Record<string, number>;
  /** Flat combat-strength bonus for embarked land units. */
  embarkedCombatBonus?: number;
  /** Flat combat-strength bonus for melee units attacking cities. */
  meleeVsCityBonus?: number;
  /** Multiplier to siege-unit strength vs city defenses. */
  siegeVsCityDefenseMultiplier?: number;
  /** All military units heal this much extra HP per turn. */
  unitHealPerTurn?: number;
  /** Mounted units heal this much extra HP per turn. */
  mountedHealPerTurn?: number;
  /** Multiplier to military unit maintenance (1.5 = +50%). Not yet consumed. */
  militaryMaintenanceCostMultiplier?: number;
  /** Extra gold per trade route. */
  tradeRouteGoldBonus?: number;
  /** Extra faith per trade route. */
  tradeRouteFaithBonus?: number;
  /** Extra trade route capacity. Not yet consumed. */
  tradeRouteCapacityBonus?: number;
  /** Faith may be spent to rush production (city items and tile works). */
  rushWithFaith?: boolean;
  /** Culture may be spent to rush production (city items and tile works). */
  rushWithCulture?: boolean;
  /** Flat yields for coastal cities. */
  coastalCityYield?: CityYieldBonus;
  /** Flat yields for desert cities. */
  desertCityYield?: CityYieldBonus;
  /** Flat yields for island cities. */
  islandCityYield?: CityYieldBonus;
  /** Percentage modifier to food in non-desert cities. */
  nonDesertCityFoodPercent?: number;
  /** Extra production from each worked mine tile. */
  mineTileProductionBonus?: number;
  /** Food penalty from each worked mine tile. */
  mineTileFoodPenalty?: number;
  /** Extra gold from each worked pasture tile. */
  pastureTileGoldBonus?: number;
  /** Extra food from each worked pasture tile. */
  pastureTileFoodBonus?: number;
  /** Extra food from each worked farm tile. */
  farmTileFoodBonus?: number;
  /** Extra faith from each worked farm tile. */
  farmTileFaithBonus?: number;
  /** Extra faith from forest tiles in your territory. */
  forestTileFaithBonus?: number;
  /** Combat bonus for units standing on forest tiles in your territory. */
  forestTileCombatBonus?: number;
  /** Extra production from hill tiles. */
  hillTileProductionBonus?: number;
  /** Extra food from fresh-water tiles. */
  freshWaterTileFoodBonus?: number;
  /** Extra production from fresh-water tiles. */
  freshWaterTileProductionBonus?: number;
  /** Extra gold from coastal water tiles. */
  coastalTileGoldBonus?: number;
  /** Extra gold from each worked desert tile. */
  goldPerWorkedDesert?: number;
  /** A building every new city is founded with (building id). */
  newCityFreeBuilding?: string;
  /** Extra starting population for new cities. */
  newCityExtraPopulation?: number;
  /** Extra population when capturing a city. */
  captureCityPopulationBonus?: number;
  /** Faith gained each time one of your units kills an enemy unit. */
  faithOnKill?: number;
  /** Percentage bonus to all combat XP your units earn (50 = +50%). */
  xpGainPercent?: number;
  /** Percentage bonus to gold from pillaging, plundering trade routes, and sacking cities. */
  raidGoldPercent?: number;
  /** Extra percentage bonus to raid gold when the target tile is adjacent to water (coastal raiding). */
  coastalRaidGoldPercent?: number;
  /** Science gained as a percentage of raid gold (e.g. 50 = +1 science per 2 gold). */
  raidSciencePercent?: number;
  // ---- unit training (see content.ts TRAINING_BUILDING_DEFS / sim training.ts) ----
  /** Percentage change to unit training time (negative = faster, e.g. -25 trains 25% faster). */
  trainTimePercent?: number;
  /** Flat bonus to every trained unit's starting morale. */
  startMoraleBonus?: number;
  /** Flat bonus to every trained unit's starting XP. */
  startXpBonus?: number;
  /** Extra concurrent training slots per training building. */
  trainingSlotsBonus?: number;
  /** Training-building families a city is founded already owning at tier 1
   *  (e.g. ["barracks"] for a martial civ). */
  freeTrainingFamilies?: TrainingClassId[];
}

/** Unit-training building family id (mirrors sim content.ts TrainingClass; kept as a
 *  loose union here so @roc/data stays dependency-free). */
export type TrainingClassId = "barracks" | "archery_range" | "stable" | "siege_workshop" | "shipyard";

export interface CivDef {
  id: string;
  name: string;
  leader: string;
  abilityName: string;
  abilityDesc: string;
  uniqueUnit: string;
  uniqueInfra: string;
  effects: CivEffects;
  /** Historically-grounded city names used when this civ founds cities. */
  cityNames: string[];
  /** A short, flavorful quote attributed to the leader. */
  leaderQuote?: string;
  /** Starting military/recon units (loose unit-id strings) this civ begins with, on
   *  top of the always-present Settler. Defaults to DEFAULT_STARTING_UNITS. */
  startingUnits?: string[];
  /** Extra population on the civ's FIRST (capital) city only (0 or 1). */
  capitalPopulationBonus?: number;
}

/** Population a civ's CAPITAL (its first city) is founded with; a civ may add
 *  capitalPopulationBonus on top. Later cities are founded at 1 and must grow.
 *  Single source of truth: consumed by the sim's foundCity AND the UI's starting-profile
 *  display, so the two can never drift. */
export const BASE_CITY_POPULATION = 2;

/** Default starting loadout (in addition to the Settler) when a civ has no unique unit. */
export const DEFAULT_STARTING_UNITS: string[] = ["warrior", "warrior", "scout"];

/** Units a city can field from turn 1 (tech-free). A civ whose unique unit replaces
 *  one of these fields its UU immediately, since uniqueUnitForCiv reskins the base. */
const EARLY_START_UNITS = new Set(["clubman", "warrior", "slinger", "javelineer", "hunter", "scout"]);

/** Class of each base unit a unique unit may replace (loose strings; mirrors the sim
 *  so @roc/data stays dependency-free). Drives starting loadouts. */
const BASE_UNIT_CLASS: Record<string, string> = {
  clubman: "melee", warrior: "melee", firehard_spear: "melee", war_dog: "melee", axeman: "melee",
  maceman: "melee", spearman: "melee", hoplite: "melee", swordsman: "melee", longswordsman: "melee",
  pikeman: "melee", legionary: "melee",
  slinger: "ranged", javelineer: "ranged", hunter: "ranged", archer: "ranged", crossbowman: "ranged",
  hand_cannon: "ranged", matchlock: "ranged",
  light_chariot: "cavalry", war_chariot: "cavalry", rider: "cavalry", horse_archer: "cavalry",
  cataphract: "cavalry", war_elephant: "cavalry",
  battering_ram: "siege", catapult: "siege", ballista: "siege", bombard: "siege",
  galley: "naval", bireme: "naval", trireme: "naval", quinquereme: "naval", longship: "naval",
  caravel: "naval", dromon: "naval", war_junk: "naval", galleass: "naval", galleon: "naval",
  scout: "recon",
};

/** The turn-1 base unit to start with for a given UU base: the base itself if it's an
 *  early unit (so the civ fields its UU at once), else an early stand-in for its class. */
function earlyEquivalent(baseId: string): string {
  if (EARLY_START_UNITS.has(baseId)) return baseId;
  switch (BASE_UNIT_CLASS[baseId]) {
    case "ranged": return "javelineer";
    case "recon": return "scout";
    default: return "warrior"; // melee / siege / cavalry / naval start on foot
  }
}

/** Derive a civ's starting loadout from its unique unit's class, so its early army
 *  matches its martial identity (e.g. a ranged-UU civ starts with ranged units). */
function derivedStartingUnits(civId: string): string[] {
  const uu = UNIQUE_UNITS.find((u) => u.civId === civId);
  if (!uu) return DEFAULT_STARTING_UNITS;
  const primary = earlyEquivalent(uu.replaces);
  switch (BASE_UNIT_CLASS[uu.replaces]) {
    case "ranged": return [primary, primary, "scout"];
    case "recon": return ["scout", "scout", "warrior"];
    case "cavalry": return ["warrior", "scout", "scout"]; // mobile raiders (no mounts yet)
    case "naval": return ["warrior", "scout", "scout"]; // seafarers range wide
    case "siege": return ["warrior", "warrior", "scout"];
    default: return [primary, primary, "scout"]; // melee
  }
}

/** The starting loadout for a civ: an explicit override, else derived from its UU. */
export function startingUnitsFor(civId: string | undefined): string[] {
  const civ = civId ? getCiv(civId) : undefined;
  if (civ?.startingUnits) return civ.startingUnits;
  return civId ? derivedStartingUnits(civId) : DEFAULT_STARTING_UNITS;
}

/** Extra population for a civ's capital (0 if unset/unknown). */
export function capitalPopulationBonusFor(civId: string | undefined): number {
  const civ = civId ? getCiv(civId) : undefined;
  return civ?.capitalPopulationBonus ?? 0;
}

export interface CivicDef {
  id: string;
  name: string;
  cost: number; // culture
  prereqs: string[];
  /** Government this civic unlocks (optional). */
  unlocksGovernment?: string;
  /** Policy card this civic unlocks (optional). */
  unlocksPolicy?: string;
}

export interface GovernmentDef {
  id: string;
  name: string;
  desc: string;
  /** Civic required to adopt it (absent = available from the start). */
  reqCivic?: string;
  /** Number of policy-card slots. */
  slots: number;
  effects: CivEffects;
}

export interface PolicyDef {
  id: string;
  name: string;
  desc: string;
  effects: CivEffects;
}

/** Fallback pool used when a civilization has no city names or has exhausted them. */
const GENERIC_CITY_NAMES = [
  "Ur", "Akkad", "Memphis", "Thebes", "Babylon", "Nineveh", "Tyre",
  "Athens", "Sparta", "Rome", "Carthage", "Sidon", "Susa", "Knossos",
];

/** Pick the next city name for a civ based on how many cities it has already founded. */
export function nextCityNameForCiv(civId: string | undefined, foundedCount: number): string {
  const civ = getCiv(civId);
  const names = civ?.cityNames.length ? civ.cityNames : GENERIC_CITY_NAMES;
  if (foundedCount < names.length) return names[foundedCount]!;
  const fallbackIndex = foundedCount - names.length;
  if (fallbackIndex < GENERIC_CITY_NAMES.length) return GENERIC_CITY_NAMES[fallbackIndex]!;
  return `${civ?.name ?? "City"} ${foundedCount + 1}`;
}

export const CIVILIZATIONS: CivDef[] = [
  // ===========================================================================
  // Mesopotamia & the Near East
  // ===========================================================================
  {
    id: "sumer",
    name: "Sumer",
    leader: "Gilgamesh",
    abilityName: "Epic Quest",
    abilityDesc: "+10% production, +10% science.",
    uniqueUnit: "War-Cart",
    uniqueInfra: "Ziggurat",
    effects: { yieldPercent: { production: 10, science: 10 } },
    cityNames: ["Ur", "Uruk", "Eridu", "Lagash", "Nippur", "Kish", "Umma", "Larsa", "Shuruppak", "Girsu"],
  },
  {
    id: "akkad",
    name: "Akkad",
    leader: "Sargon",
    abilityName: "Sons of Sargon",
    abilityDesc: "+10% production; melee units +1 strength; newly trained units muster with +20 morale (world's first standing army).",
    uniqueUnit: "Sargonic Guard",
    uniqueInfra: "Palace Archive",
    effects: { yieldPercent: { production: 10 }, unitClassCombat: { melee: 1 }, startMoraleBonus: 20 },
    cityNames: ["Akkad", "Nineveh", "Assur", "Eshnunna", "Sippar", "Babylon", "Nuzi", "Tell Brak", "Gasur", "Dur-Kurigalzu"],
  },
  {
    id: "babylon",
    name: "Babylon",
    leader: "Hammurabi",
    abilityName: "Enuma Anu Enlil",
    abilityDesc: "+15% science.",
    uniqueUnit: "Bowman",
    uniqueInfra: "Walls of Babylon",
    effects: { yieldPercent: { science: 15 } },
    cityNames: ["Babylon", "Borsippa", "Sippar", "Kish", "Nippur", "Uruk", "Ur", "Larsa", "Isin", "Dilbat"],
  },
  {
    id: "assyria",
    name: "Assyria",
    leader: "Ashurbanipal",
    abilityName: "Treatises & Terror",
    abilityDesc: "Melee +1, siege +2 strength; all units train 15% faster and start with extra XP.",
    uniqueUnit: "Siege Tower",
    uniqueInfra: "Royal Library",
    effects: { unitClassCombat: { melee: 1, siege: 2 }, trainTimePercent: -15, startXpBonus: 10 },
    cityNames: ["Assur", "Nineveh", "Nimrud", "Dur-Sharrukin", "Harran", "Kalhu", "Edessa", "Arbela", "Nisibis", "Carchemish"],
  },
  {
    id: "hittites",
    name: "Hittites",
    leader: "Suppiluliuma",
    abilityName: "Iron of Hatti",
    abilityDesc: "+10% production; melee units +1 strength; all units train 20% faster and start with +5 XP (masters of early ironworking).",
    uniqueUnit: "Hittite Chariot",
    uniqueInfra: "Storm Temple",
    effects: { yieldPercent: { production: 10 }, unitClassCombat: { melee: 1 }, trainTimePercent: -20, startXpBonus: 5 },
    cityNames: ["Hattusa", "Kanesh", "Tarhuntassa", "Carchemish", "Alaca Höyük", "Sapinuwa", "Samuha", "Kadesh", "Ugarit", "Malatya"],
  },
  {
    id: "elam",
    name: "Elam",
    leader: "Untash",
    abilityName: "Highland Archers",
    abilityDesc: "+10% science; ranged units +2 strength; newly trained units start with +10 XP (literate Susa, elite bowmen).",
    uniqueUnit: "Susian Archer",
    uniqueInfra: "Chogha Zanbil",
    effects: { yieldPercent: { science: 10 }, unitClassCombat: { ranged: 2 }, startXpBonus: 10 },
    cityNames: ["Susa", "Anshan", "Chogha Zanbil", "Hidalu", "Dur-Untash", "Madaktu", "Haft Tepe", "Kabnak", "Shimashki", "Awan"],
  },
  {
    id: "phoenicia",
    name: "Phoenicia",
    leader: "Dido",
    abilityName: "Mediterranean Colonies",
    abilityDesc: "+20% gold; +2 gold per trade route (masters of Mediterranean sea trade).",
    uniqueUnit: "Phoenician Bireme",
    uniqueInfra: "Cothon",
    effects: { yieldPercent: { gold: 20 }, tradeRouteGoldBonus: 2 },
    cityNames: ["Tyre", "Sidon", "Byblos", "Carthage", "Utica", "Gades", "Leptis Magna", "Hadrumetum", "Motya", "Kition"],
  },
  {
    id: "lydia",
    name: "Lydia",
    leader: "Croesus",
    abilityName: "Coinage",
    abilityDesc: "+20% gold.",
    uniqueUnit: "Heavy Cavalry",
    uniqueInfra: "Mint",
    effects: { yieldPercent: { gold: 20 } },
    cityNames: ["Sardis", "Thyateira", "Philadelphia", "Magnesia", "Tralles", "Ephesus", "Miletus", "Halicarnassus", "Smyrna", "Laodicea"],
  },

  // ===========================================================================
  // Persia & Iran
  // ===========================================================================
  {
    id: "median_empire",
    name: "Median Empire",
    leader: "Cyaxares",
    abilityName: "Horse Lords",
    abilityDesc: "Cavalry +1 movement and +1 strength; +10% production (the first horse-lord empire).",
    uniqueUnit: "Median Lancer",
    uniqueInfra: "Royal Stable",
    effects: { cavalryMovementBonus: 1, unitClassCombat: { cavalry: 1 }, yieldPercent: { production: 10 } },
    cityNames: ["Ecbatana", "Rhagae", "Pasargadae", "Susa", "Agbatana", "Cyropolis", "Gaugamela", "Raga", "Patigrabana", "Apamea"],
  },
  {
    id: "persia",
    name: "Persia",
    leader: "Cyrus",
    abilityName: "Satrapies",
    abilityDesc: "+15% gold, +8% science; melee units +1 strength (the tolerant, road-building empire).",
    uniqueUnit: "Immortal",
    uniqueInfra: "Pairidaeza",
    effects: { yieldPercent: { gold: 15, science: 8 }, unitClassCombat: { melee: 1 } },
    cityNames: ["Persepolis", "Pasargadae", "Susa", "Ecbatana", "Sardis", "Babylon", "Tyre", "Memphis", "Nineveh", "Bactra"],
  },
  {
    id: "parthia",
    name: "Parthia",
    leader: "Mithridates",
    abilityName: "Parthian Shot",
    abilityDesc: "Cavalry +2 strength and +1 movement; +10% gold (the Silk Road horse-archer empire).",
    uniqueUnit: "Parthian Horse Archer",
    uniqueInfra: "Caravanserai",
    effects: { unitClassCombat: { cavalry: 2 }, cavalryMovementBonus: 1, yieldPercent: { gold: 10 } },
    cityNames: ["Ctesiphon", "Nisa", "Hecatompylos", "Rhages", "Ecbatana", "Seleucia", "Hatra", "Dura-Europos", "Merv", "Gurgan"],
  },
  {
    id: "sassanid_persia",
    name: "Sassanid Persia",
    leader: "Khosrow",
    abilityName: "Eranshahr",
    abilityDesc: "+10% gold, +10% science; cavalry +1 combat strength.",
    uniqueUnit: "Savaran Cataphract",
    uniqueInfra: "Fire Temple",
    effects: { yieldPercent: { science: 10, gold: 10 }, unitClassCombat: { cavalry: 1 } },
    cityNames: ["Ctesiphon", "Estakhr", "Gundeshapur", "Nishapur", "Ray", "Gorgan", "Istakhr", "Bishapur", "Hamadan", "Susa"],
  },

  // ===========================================================================
  // Egypt & Africa
  // ===========================================================================
  {
    id: "egypt",
    name: "Egypt",
    leader: "Hatshepsut",
    abilityName: "Iteru",
    abilityDesc: "+10% production, +10% food (the Nile's bounty).",
    uniqueUnit: "Maryannu Chariot",
    uniqueInfra: "Obelisk",
    effects: { yieldPercent: { production: 10, food: 10 } },
    cityNames: ["Memphis", "Thebes", "Heliopolis", "Alexandria", "Giza", "Saqqara", "Abydos", "Luxor", "Karnak", "Tanis"],
  },
  {
    id: "kush_nubia",
    name: "Kush / Nubia",
    leader: "Amanirenas",
    abilityName: "City of the Dead",
    abilityDesc: "+1 gold from each worked desert tile; ranged units +1 strength; newly trained units start with +10 XP (the Land of the Bow).",
    uniqueUnit: "Nubian Archer",
    uniqueInfra: "Nubian Pyramid",
    effects: { goldPerWorkedDesert: 1, unitClassCombat: { ranged: 1 }, startXpBonus: 10 },
    cityNames: ["Meroë", "Napata", "Kerma", "Naqa", "Musawwarat es-Sufra", "Dongola", "Kawa", "Soleb", "Semna", "Abu Erteila"],
  },
  {
    id: "carthage",
    name: "Carthage",
    leader: "Hannibal",
    abilityName: "Phoenician Heritage",
    abilityDesc: "+15% gold; +2 gold per trade route; cavalry +1 strength (merchant empire of the western sea).",
    uniqueUnit: "Carthaginian War Elephant",
    uniqueInfra: "Cothon",
    effects: { yieldPercent: { gold: 15 }, tradeRouteGoldBonus: 2, unitClassCombat: { cavalry: 1 } },
    cityNames: ["Carthage", "Utica", "Hadrumetum", "Leptis Magna", "Gades", "Panormus", "Lilybaeum", "Motya", "Cirta", "Hippo Regius"],
  },
  {
    id: "aksum",
    name: "Aksum",
    leader: "Ezana",
    abilityName: "Red Sea Trade",
    abilityDesc: "+15% gold, +10% faith; coastal cities +2 gold (the Red Sea trade and Africa's first Christian kingdom).",
    uniqueUnit: "Aksumite Spearman",
    uniqueInfra: "Stelae",
    effects: { yieldPercent: { gold: 15, faith: 10 }, coastalCityYield: { gold: 2 } },
    cityNames: ["Aksum", "Adulis", "Yeha", "Matara", "Qohaito", "Hawulti", "Tokonda", "Beta Giyorgis", "Debre Damo", "Matara"],
  },
  {
    id: "ethiopia_zagwe",
    name: "Ethiopia (Zagwe)",
    leader: "Lalibela",
    abilityName: "Aksumite Legacy",
    abilityDesc: "+15% faith, +8% culture; faith can rush production; cavalry +1 strength (the churches hewn from living rock).",
    uniqueUnit: "Oromo Cavalry",
    uniqueInfra: "Rock-Hewn Church",
    effects: { yieldPercent: { faith: 15, culture: 8 }, rushWithFaith: true, unitClassCombat: { cavalry: 1 } },
    cityNames: ["Lalibela", "Aksum", "Gondar", "Roha", "Adwa", "Debre Berhan", "Debre Libanos", "Mekelle", "Antioch", "Begemder"],
  },
  {
    id: "mali",
    name: "Mali",
    leader: "Mansa Musa",
    abilityName: "Sahel Merchants",
    abilityDesc: "+10% gold, +8% science; +2 gold from each worked desert tile (Timbuktu's gold and its scholars).",
    uniqueUnit: "Mandekalu Cavalry",
    uniqueInfra: "Suguba",
    effects: { yieldPercent: { gold: 10, science: 8 }, goldPerWorkedDesert: 2 },
    cityNames: ["Timbuktu", "Djenné", "Gao", "Koumbi Saleh", "Niani", "Walata", "Aoudaghost", "Tadmekka", "Ségou", "Kano"],
  },
  {
    id: "ghana_empire",
    name: "Ghana Empire",
    leader: "Tunka Manin",
    abilityName: "Gold of Wagadu",
    abilityDesc: "+20% gold; +1 gold per trade route (the gold-for-salt trade of Wagadu).",
    uniqueUnit: "Soninke Warrior",
    uniqueInfra: "Gold Market",
    effects: { yieldPercent: { gold: 20 }, tradeRouteGoldBonus: 1 },
    cityNames: ["Koumbi Saleh", "Awdaghost", "Tadmekka", "Kumbi", "Walata", "Gao", "Timbuktu", "Azougui", "Sijilmasa", "Niani"],
  },
  {
    id: "songhai",
    name: "Songhai",
    leader: "Askia",
    abilityName: "River of Gold",
    abilityDesc: "+15% gold, +10% production; cavalry +1 strength; +1 food from fresh-water tiles (the Niger's fleet and Askia's cavalry).",
    uniqueUnit: "Songhai Cavalry",
    uniqueInfra: "River Port",
    effects: { yieldPercent: { gold: 15, production: 10 }, unitClassCombat: { cavalry: 1 }, freshWaterTileFoodBonus: 1 },
    cityNames: ["Gao", "Timbuktu", "Djenné", "Kukiya", "Bentia", "Kabara", "Bamba", "Mema", "Jenne-Jeno", "Taghaza"],
  },
  {
    id: "great_zimbabwe",
    name: "Great Zimbabwe",
    leader: "Nyatsimba",
    abilityName: "Cattle & Stone",
    abilityDesc: "+10% food, +10% gold; pastures +1 food and +1 gold; +1 gold per trade route (great herds and the Sofala gold trade).",
    uniqueUnit: "Zimbabwe Spearman",
    uniqueInfra: "Great Enclosure",
    effects: { yieldPercent: { gold: 10, food: 10 }, pastureTileFoodBonus: 1, pastureTileGoldBonus: 1, tradeRouteGoldBonus: 1 },
    cityNames: ["Great Zimbabwe", "Mapungubwe", "Khami", "Thulamela", "Danamombe", "Manyikeni", "Naletale", "Chibuene", "Sofala", "Kilwa"],
  },
  {
    id: "kanem_bornu",
    name: "Kanem-Bornu",
    leader: "Idris Alooma",
    abilityName: "Trans-Saharan",
    abilityDesc: "+15% gold; cavalry +1 strength and +1 movement (the mailed horse-lords of Lake Chad).",
    uniqueUnit: "Kanembu Guard",
    uniqueInfra: "Sahel Caravan Post",
    effects: { yieldPercent: { gold: 15 }, unitClassCombat: { cavalry: 1 }, cavalryMovementBonus: 1 },
    cityNames: ["Njimi", "Birnin Gazargamo", "Ngazargamu", "Kukawa", "Mao", "Bilma", "Zinder", "Agades", "Kanem", "Ngala"],
  },

  // ===========================================================================
  // Mediterranean & Europe
  // ===========================================================================
  {
    id: "minoans",
    name: "Minoans",
    leader: "Minos",
    abilityName: "Thalassocracy",
    abilityDesc: "+15% gold, +10% culture; coastal cities +2 gold (the first sea empire — unwalled palaces guarded by a fleet).",
    uniqueUnit: "Minoan Bireme",
    uniqueInfra: "Labyrinth Palace",
    effects: { yieldPercent: { gold: 15, culture: 10 }, coastalCityYield: { gold: 2 } },
    cityNames: ["Knossos", "Phaistos", "Malia", "Zakros", "Gournia", "Thera", "Akrotiri", "Tylissos", "Archanes", "Amnissos"],
  },
  {
    id: "mycenaean_greece",
    name: "Mycenaean Greece",
    leader: "Agamemnon",
    abilityName: "Heroic Age",
    abilityDesc: "+12% production; melee units +3 strength; newly trained units start with +5 XP (the palace-armories of the heroic age).",
    uniqueUnit: "Mycenaean Spearman",
    uniqueInfra: "Megaron",
    effects: { yieldPercent: { production: 12 }, unitClassCombat: { melee: 3 }, startXpBonus: 5 },
    cityNames: ["Mycenae", "Tiryns", "Pylos", "Thebes", "Knossos", "Midea", "Athens", "Iolcos", "Orchomenus", "Gla"],
  },
  {
    id: "greece",
    name: "Greece",
    leader: "Pericles",
    abilityName: "Plato's Republic",
    abilityDesc: "+20% science, +10% culture; melee units +1 strength (the polis of philosophers and citizen-hoplites).",
    uniqueUnit: "Greek Hoplite",
    uniqueInfra: "Acropolis",
    effects: { yieldPercent: { science: 20, culture: 10 }, unitClassCombat: { melee: 1 } },
    cityNames: ["Athens", "Sparta", "Corinth", "Thebes", "Delphi", "Olympia", "Argos", "Ephesus", "Miletus", "Syracuse"],
  },
  {
    id: "sparta",
    name: "Sparta",
    leader: "Leonidas",
    abilityName: "Agoge",
    abilityDesc: "Melee units +2 strength; all units train 10% faster and muster with +30 morale and +15 XP (a lifetime under arms).",
    uniqueUnit: "Spartan Hoplite",
    uniqueInfra: "Syssitia",
    effects: { unitClassCombat: { melee: 2 }, trainTimePercent: -10, startMoraleBonus: 30, startXpBonus: 15 },
    cityNames: ["Sparta", "Gytheio", "Amyklai", "Thouria", "Messene", "Gythium", "Pellana", "Sellasia", "Kardamyle", "Oitylos"],
  },
  {
    id: "macedon",
    name: "Macedon",
    leader: "Alexander",
    abilityName: "Hellenistic Fusion",
    abilityDesc: "Melee and cavalry +1 strength; all units train 15% faster and muster with +15 morale and +20 XP (the army Philip built and Alexander led).",
    uniqueUnit: "Hypaspist",
    uniqueInfra: "Basilikoi Paides",
    effects: { unitClassCombat: { melee: 1, cavalry: 1 }, trainTimePercent: -15, startMoraleBonus: 15, startXpBonus: 20 },
    cityNames: ["Pella", "Aegae", "Thessalonica", "Amphipolis", "Philippi", "Beroea", "Edessa", "Dion", "Stagira", "Pydna"],
  },
  {
    id: "etruscans",
    name: "Etruscans",
    leader: "Lars Porsena",
    abilityName: "Twelve Cities",
    abilityDesc: "+18% gold, +8% culture, +5% production (the league of twelve cities that taught Rome to build).",
    uniqueUnit: "Etruscan Hoplite",
    uniqueInfra: "Tumulus",
    effects: { yieldPercent: { gold: 18, culture: 8, production: 5 } },
    cityNames: ["Veii", "Tarquinia", "Cerveteri", "Vulci", "Populonia", "Volsinii", "Perusia", "Arretium", "Cortona", "Clusium"],
  },
  {
    id: "rome",
    name: "Rome",
    leader: "Trajan",
    abilityName: "All Roads Lead to Rome",
    abilityDesc: "+5% production; new cities are founded with a free Monument; cities can train one extra unit at once (the roads and colonies of empire).",
    uniqueUnit: "Roman Legionary",
    uniqueInfra: "Roman Bath",
    effects: { yieldPercent: { production: 5 }, newCityFreeBuilding: "monument", trainingSlotsBonus: 1 },
    cityNames: ["Rome", "Ostia", "Antium", "Capua", "Pompeii", "Cumae", "Neapolis", "Arretium", "Mediolanum", "Aquileia"],
  },
  {
    id: "celts_gauls",
    name: "Celts / Gauls",
    leader: "Vercingetorix",
    abilityName: "Druidic Lore",
    abilityDesc: "Melee units +2 strength, and +2 more fighting on forest tiles in your territory; +2 faith from your forests (the sacred groves arm and embolden).",
    uniqueUnit: "Gaesatae",
    uniqueInfra: "Oppidum",
    effects: { unitClassCombat: { melee: 2 }, forestTileCombatBonus: 2, forestTileFaithBonus: 2 },
    cityNames: ["Alesia", "Bibracte", "Gergovia", "Lutetia", "Avaricum", "Numantia", "Camulodunum", "Verlamion", "Glauberg", "Heuneburg"],
  },
  {
    id: "byzantium",
    name: "Byzantium",
    leader: "Justinian",
    abilityName: "Taxis",
    abilityDesc: "+8% science, +8% culture, +5% faith, +5% gold; melee and cavalry +1 strength (the Roman state that outlived Rome by a thousand years).",
    uniqueUnit: "Byzantine Cataphract",
    uniqueInfra: "Hippodrome",
    effects: { yieldPercent: { science: 8, culture: 8, faith: 5, gold: 5 }, unitClassCombat: { melee: 1, cavalry: 1 } },
    cityNames: ["Constantinople", "Thessalonica", "Nicomedia", "Antioch", "Trebizond", "Ephesus", "Nicaea", "Smyrna", "Adrianople", "Athens"],
  },
  {
    id: "norse",
    name: "Norse",
    leader: "Harald Hardrada",
    abilityName: "Knarr",
    abilityDesc: "+15% gold; melee units +1 strength; naval units +1 movement; +15% gold from coastal raids (the ships that reached four continents).",
    uniqueUnit: "Norse Longship",
    uniqueInfra: "Stave Church",
    effects: { yieldPercent: { gold: 15 }, unitClassCombat: { melee: 1 }, navalMovementBonus: 1, coastalRaidGoldPercent: 15 },
    cityNames: ["Kaupang", "Birka", "Hedeby", "Trondheim", "Oslo", "Reykjavik", "York", "Dublin", "Ribe", "Visby"],
  },
  {
    id: "franks",
    name: "Franks",
    leader: "Charlemagne",
    abilityName: "Carolingian Reform",
    abilityDesc: "+10% faith, +5% production; cavalry +2 strength and +1 movement (Charlemagne's church schools and mailed horsemen).",
    uniqueUnit: "Frankish Paladin",
    uniqueInfra: "Palatine Chapel",
    effects: { yieldPercent: { faith: 10, production: 5 }, cavalryMovementBonus: 1, unitClassCombat: { cavalry: 2 } },
    cityNames: ["Aachen", "Paris", "Tours", "Soissons", "Reims", "Cologne", "Trier", "Mainz", "Strasbourg", "Metz"],
  },
  {
    id: "goths",
    name: "Goths",
    leader: "Theodoric",
    abilityName: "Foederati",
    abilityDesc: "Cavalry +2 strength and +1 movement; +10% food; captured cities keep +1 population (a whole people on the move, absorbing what it conquers).",
    uniqueUnit: "Gothic Rider",
    uniqueInfra: "Wagon Fort",
    effects: { cavalryMovementBonus: 1, unitClassCombat: { cavalry: 2 }, yieldPercent: { food: 10 }, captureCityPopulationBonus: 1 },
    cityNames: ["Ravenna", "Toulouse", "Toledo", "Naples", "Milan", "Aquileia", "Moesia", "Dacia", "Oium", "Gothiscandza"],
  },
  {
    id: "anglo_saxon_england",
    name: "Anglo-Saxon / England",
    leader: "Alfred",
    abilityName: "Workshop of the World",
    abilityDesc: "+12% production; ranged units +2 strength; new cities are founded with free Walls (Alfred's fortified burh network).",
    uniqueUnit: "Longbowman",
    uniqueInfra: "Manor House",
    effects: { yieldPercent: { production: 12 }, unitClassCombat: { ranged: 2 }, newCityFreeBuilding: "walls" },
    cityNames: ["Winchester", "London", "York", "Canterbury", "Lincoln", "Gloucester", "Worcester", "Durham", "Exeter", "Oxford"],
  },
  {
    id: "france",
    name: "France",
    leader: "Joan of Arc",
    abilityName: "Grand Tour",
    abilityDesc: "+12% gold, +12% culture, +8% faith (the most Christian kingdom, arbiter of Europe's taste).",
    uniqueUnit: "Garde Écossaise",
    uniqueInfra: "Château",
    effects: { yieldPercent: { gold: 12, culture: 12, faith: 8 } },
    cityNames: ["Paris", "Orléans", "Tours", "Reims", "Lyon", "Marseille", "Bordeaux", "Rouen", "Avignon", "Toulouse"],
  },
  {
    id: "castile_spain",
    name: "Castile / Spain",
    leader: "Isabella",
    abilityName: "El Escorial",
    abilityDesc: "+12% gold, +8% faith; melee units +1 strength; captured cities keep +1 population (Reconquista and the empire it forged).",
    uniqueUnit: "Conquistador",
    uniqueInfra: "Mission",
    effects: { yieldPercent: { gold: 12, faith: 8 }, unitClassCombat: { melee: 1 }, captureCityPopulationBonus: 1 },
    cityNames: ["Toledo", "Córdoba", "Seville", "Granada", "Burgos", "Valladolid", "Salamanca", "Segovia", "Madrid", "Barcelona"],
  },
  {
    id: "portugal",
    name: "Portugal",
    leader: "Henry the Navigator",
    abilityName: "Casa da Índia",
    abilityDesc: "+20% gold; +2 gold per trade route; coastal cities +1 gold; naval units +1 movement (the crown office that ran the world's first global trade empire).",
    uniqueUnit: "Nau",
    uniqueInfra: "Feitoria",
    effects: { yieldPercent: { gold: 20 }, tradeRouteGoldBonus: 2, coastalCityYield: { gold: 1 }, navalMovementBonus: 1 },
    cityNames: ["Lisbon", "Porto", "Coimbra", "Évora", "Braga", "Sintra", "Guimarães", "Tomar", "Aveiro", "Lagos"],
  },
  {
    id: "venice",
    name: "Venice",
    leader: "Enrico Dandolo",
    abilityName: "Serenissima",
    abilityDesc: "+22% gold; +2 gold per trade route; naval units +1 movement (the merchant republic wedded to the sea).",
    uniqueUnit: "Venetian Galleass",
    uniqueInfra: "Arsenale",
    effects: { yieldPercent: { gold: 22 }, tradeRouteGoldBonus: 2, navalMovementBonus: 1 },
    cityNames: ["Venice", "Padua", "Verona", "Vicenza", "Treviso", "Chioggia", "Rovigo", "Belluno", "Mestre", "Murano"],
  },
  {
    id: "genoa",
    name: "Genoa",
    leader: "Andrea Doria",
    abilityName: "Bank of San Giorgio",
    abilityDesc: "+22% gold; +1 gold per trade route (the bank that owned colonies and financed kings).",
    uniqueUnit: "Genoese Crossbowman",
    uniqueInfra: "Banco",
    effects: { yieldPercent: { gold: 22 }, tradeRouteGoldBonus: 1 },
    cityNames: ["Genoa", "Pisa", "Lucca", "Savona", "Ventimiglia", "Albenga", "Sarzana", "Rapallo", "Chiavari", "Finale"],
  },
  {
    id: "dutch_republic",
    name: "Dutch Republic",
    leader: "William the Silent",
    abilityName: "Grachten",
    abilityDesc: "+10% gold, +10% food, +5% production; +2 gold per trade route; farms +1 food (polders, windmills and the carrying trade).",
    uniqueUnit: "Sea Beggar",
    uniqueInfra: "Polder",
    effects: { yieldPercent: { gold: 10, food: 10, production: 5 }, tradeRouteGoldBonus: 2, farmTileFoodBonus: 1 },
    cityNames: ["Amsterdam", "Rotterdam", "The Hague", "Utrecht", "Delft", "Leiden", "Haarlem", "Gouda", "Middelburg", "Groningen"],
  },
  {
    id: "holy_roman_empire",
    name: "Holy Roman Empire / Germany",
    leader: "Barbarossa",
    abilityName: "Free Imperial Cities",
    abilityDesc: "+20% production, +10% gold; all units train 10% faster (the free cities' workshops and the mercenary muster).",
    uniqueUnit: "Landsknecht",
    uniqueInfra: "Hansa",
    effects: { yieldPercent: { production: 20, gold: 10 }, trainTimePercent: -10 },
    cityNames: ["Aachen", "Frankfurt", "Cologne", "Hamburg", "Lübeck", "Nuremberg", "Regensburg", "Augsburg", "Munich", "Magdeburg"],
  },
  {
    id: "kievan_rus",
    name: "Kievan Rus",
    leader: "Yaroslav",
    abilityName: "Lavra",
    abilityDesc: "+12% faith, +10% culture; +2 faith from forests in your territory; +2 gold per trade route (monasteries, icons, and the river road to the Greeks).",
    uniqueUnit: "Druzhina",
    uniqueInfra: "Lavra",
    effects: { yieldPercent: { faith: 12, culture: 10 }, forestTileFaithBonus: 2, tradeRouteGoldBonus: 2 },
    cityNames: ["Kyiv", "Novgorod", "Vladimir", "Suzdal", "Chernigov", "Polotsk", "Smolensk", "Pereyaslavl", "Galich", "Rostov"],
  },
  {
    id: "poland_lithuania",
    name: "Poland-Lithuania",
    leader: "Jadwiga",
    abilityName: "Golden Liberty",
    abilityDesc: "+12% gold, +8% faith; cavalry +2 strength (the noble commonwealth, bulwark of Christendom).",
    uniqueUnit: "Winged Hussar",
    uniqueInfra: "Sukiennice",
    effects: { yieldPercent: { gold: 12, faith: 8 }, unitClassCombat: { cavalry: 2 } },
    cityNames: ["Kraków", "Vilnius", "Gniezno", "Poznań", "Warsaw", "Lublin", "Lwów", "Toruń", "Kaunas", "Wrocław"],
  },
  {
    id: "hungary",
    name: "Hungary",
    leader: "Matthias Corvinus",
    abilityName: "Pearl of the Danube",
    abilityDesc: "+5% gold; cavalry +2 strength; all units train 15% faster and start with +15 XP (Corvinus' taxes paid Europe's first standing army since Rome).",
    uniqueUnit: "Black Army",
    uniqueInfra: "Thermal Bath",
    effects: { yieldPercent: { gold: 5 }, unitClassCombat: { cavalry: 2 }, trainTimePercent: -15, startXpBonus: 15 },
    cityNames: ["Buda", "Pest", "Esztergom", "Székesfehérvár", "Pécs", "Debrecen", "Győr", "Sopron", "Eger", "Visegrád"],
  },

  // ===========================================================================
  // Central, South & East Asia
  // ===========================================================================
  {
    id: "han_china",
    name: "Han China",
    leader: "Qin Shi Huang",
    abilityName: "Dynastic Cycle",
    abilityDesc: "+12% production, +10% science.",
    uniqueUnit: "Cho-Ko-Nu",
    uniqueInfra: "Great Wall",
    effects: { yieldPercent: { production: 12, science: 10 } },
    cityNames: ["Chang'an", "Luoyang", "Xianyang", "Chengdu", "Nanjing", "Kaifeng", "Hangzhou", "Anyang", "Zhengzhou", "Linzi"],
  },
  {
    id: "china_tang_song",
    name: "China (Tang/Song)",
    leader: "Taizong",
    abilityName: "Middle Kingdom",
    abilityDesc: "+5% production, +15% science, +5% culture (the exams, the poets, the printing blocks).",
    uniqueUnit: "Fire Lancer",
    uniqueInfra: "Imperial Examination Hall",
    effects: { yieldPercent: { production: 5, science: 15, culture: 5 } },
    cityNames: ["Chang'an", "Luoyang", "Kaifeng", "Hangzhou", "Nanjing", "Bianliang", "Yangzhou", "Suzhou", "Guangzhou", "Quanzhou"],
  },
  {
    id: "china_ming",
    name: "China (Ming)",
    leader: "Yongle",
    abilityName: "Treasure Fleets",
    abilityDesc: "+18% gold; +2 gold per trade route (Zheng He's fleets and the tribute trade).",
    uniqueUnit: "Ming War Junk",
    uniqueInfra: "Porcelain Tower",
    effects: { yieldPercent: { gold: 18 }, tradeRouteGoldBonus: 2 },
    cityNames: ["Beijing", "Nanjing", "Hangzhou", "Suzhou", "Xi'an", "Guangzhou", "Quanzhou", "Fuzhou", "Yangzhou", "Chengdu"],
  },
  {
    id: "maurya",
    name: "Maurya",
    leader: "Ashoka",
    abilityName: "Dharma",
    abilityDesc: "+10% food, +5% production; cavalry +1 strength (the Arthashastra's administered empire).",
    uniqueUnit: "Mauryan War Elephant",
    uniqueInfra: "Stepwell",
    effects: { yieldPercent: { food: 10, production: 5 }, unitClassCombat: { cavalry: 1 } },
    cityNames: ["Pataliputra", "Taxila", "Ujjain", "Vidisha", "Mathura", "Sarnath", "Kosambi", "Rajagriha", "Varanasi", "Kaushambi"],
  },
  {
    id: "gupta_india",
    name: "Gupta India",
    leader: "Chandragupta II",
    abilityName: "Golden Age of India",
    abilityDesc: "+18% science, +8% culture (Aryabhata's zero and Kalidasa's verse).",
    uniqueUnit: "Gupta Elephant Archer",
    uniqueInfra: "University-Temple",
    effects: { yieldPercent: { science: 18, culture: 8 } },
    cityNames: ["Pataliputra", "Ujjain", "Prayaga", "Mathura", "Sarnath", "Kannauj", "Valabhi", "Ajanta", "Nalanda", "Vidisha"],
  },
  {
    id: "chola",
    name: "Chola",
    leader: "Rajaraja",
    abilityName: "Maritime Empire",
    abilityDesc: "+18% gold; coastal cities +2 gold; +2 gold per trade route (the merchant guilds that spanned the Bay of Bengal).",
    uniqueUnit: "Chola Warship",
    uniqueInfra: "Brihadeeswara Temple",
    effects: { yieldPercent: { gold: 18 }, coastalCityYield: { gold: 2 }, tradeRouteGoldBonus: 2 },
    cityNames: ["Thanjavur", "Gangaikonda Cholapuram", "Uraiyur", "Kanchipuram", "Kaveripattinam", "Nagapattinam", "Madurai", "Tiruchirappalli", "Pudukkottai", "Sri Lanka"],
  },
  {
    id: "japan",
    name: "Japan",
    leader: "Tokugawa",
    abilityName: "Bushido",
    abilityDesc: "+10% culture; melee units +3 strength; newly trained units muster with +15 morale (the way of the warrior).",
    uniqueUnit: "Samurai",
    uniqueInfra: "Tenshu Castle",
    effects: { yieldPercent: { culture: 10 }, unitClassCombat: { melee: 3 }, startMoraleBonus: 15 },
    cityNames: ["Kyoto", "Edo", "Osaka", "Nara", "Kamakura", "Nagoya", "Hiroshima", "Nagasaki", "Kobe", "Fukuoka"],
  },
  {
    id: "korea",
    name: "Korea (Goryeo/Joseon)",
    leader: "Sejong",
    abilityName: "Hwarang",
    abilityDesc: "+18% science, +8% culture, +8% production (movable type, Hangul and the royal shipyards).",
    uniqueUnit: "Turtle Ship",
    uniqueInfra: "Seowon",
    effects: { yieldPercent: { science: 18, culture: 8, production: 8 } },
    cityNames: ["Kaesong", "Seoul", "Pyongyang", "Gyeongju", "Busan", "Hanseong", "Andong", "Jeonju", "Daegu", "Gangneung"],
  },
  {
    id: "tibet",
    name: "Tibet",
    leader: "Songtsen Gampo",
    abilityName: "Roof of the World",
    abilityDesc: "+15% faith, +8% culture; cavalry +1 strength; units ignore mountain movement penalties (the monasteries of the high plateau).",
    uniqueUnit: "Tibetan Cavalry",
    uniqueInfra: "Potala",
    effects: { yieldPercent: { faith: 15, culture: 8 }, unitClassCombat: { cavalry: 1 }, ignoreMountainMovement: true },
    cityNames: ["Lhasa", "Shigatse", "Gyantse", "Sakya", "Tsaparang", "Lhoka", "Chamdo", "Nagchu", "Nyingchi", "Xigazê"],
  },
  {
    id: "dai_viet_vietnam",
    name: "Dai Viet (Vietnam)",
    leader: "Le Loi",
    abilityName: "Nine Dragons",
    abilityDesc: "Melee units +2 strength, and +2 more fighting on forest tiles in your territory (the jungle war that wore down every invader).",
    uniqueUnit: "Voi Chiến",
    uniqueInfra: "Thành",
    effects: { unitClassCombat: { melee: 2 }, forestTileCombatBonus: 2 },
    cityNames: ["Hanoi", "Thăng Long", "Huế", "Hoa Lư", "Thanh Hóa", "Nam Định", "Nghệ An", "Vinh", "Đồng Nai", "Saigon"],
  },
  {
    id: "khmer",
    name: "Khmer",
    leader: "Jayavarman VII",
    abilityName: "Grand Barays",
    abilityDesc: "+15% food, +8% faith; +1 food from fresh-water tiles (the great reservoirs that fed a million people at Angkor).",
    uniqueUnit: "Domrey",
    uniqueInfra: "Prasat",
    effects: { yieldPercent: { food: 15, faith: 8 }, freshWaterTileFoodBonus: 1 },
    cityNames: ["Angkor", "Yasodharapura", "Hariharalaya", "Koh Ker", "Phnom Kulen", "Banteay Srei", "Preah Khan", "Ta Prohm", "Sambor Prei Kuk", "Battambang"],
  },
  {
    id: "srivijaya",
    name: "Srivijaya",
    leader: "Balaputra",
    abilityName: "Maritime Mandala",
    abilityDesc: "+18% gold; coastal cities +2 gold (every ship through the Strait of Malacca paid the mandala's toll).",
    uniqueUnit: "Jong",
    uniqueInfra: "Candi",
    effects: { yieldPercent: { gold: 18 }, coastalCityYield: { gold: 2 } },
    cityNames: ["Palembang", "Jambi", "Kedah", "Chaiya", "Takuapa", "Melayu", "Bangka", "Belitung", "Barus", "Lamuri"],
  },
  {
    id: "majapahit",
    name: "Majapahit",
    leader: "Hayam Wuruk",
    abilityName: "Nusantara",
    abilityDesc: "+10% gold, +10% food.",
    uniqueUnit: "Majapahit Jong",
    uniqueInfra: "Harbor-Temple",
    effects: { yieldPercent: { gold: 10, food: 10 } },
    cityNames: ["Trowulan", "Wilwatikta", "Majapahit", "Surabaya", "Bali", "Gresik", "Tuban", "Lamongan", "Pajang", "Demak"],
  },
  {
    id: "pagan_burma",
    name: "Pagan (Burma)",
    leader: "Anawrahta",
    abilityName: "Land of Pagodas",
    abilityDesc: "+15% faith, +8% culture, +5% production; faith can rush production (ten thousand pagodas rose on the Pagan plain).",
    uniqueUnit: "Burmese War Elephant",
    uniqueInfra: "Pagoda",
    effects: { yieldPercent: { faith: 15, culture: 8, production: 5 }, rushWithFaith: true },
    cityNames: ["Pagan", "Bagan", "Ava", "Mandalay", "Pegu", "Thaton", "Mrauk-U", "Amarapura", "Sagaing", "Pyay"],
  },
  {
    id: "ayutthaya_siam",
    name: "Ayutthaya (Siam)",
    leader: "Ramkhamhaeng",
    abilityName: "Father Governs Children",
    abilityDesc: "+10% science, +10% faith, +12% gold (the open entrepôt where every nation traded).",
    uniqueUnit: "Siamese War Elephant",
    uniqueInfra: "Wat",
    effects: { yieldPercent: { science: 10, faith: 10, gold: 12 } },
    cityNames: ["Ayutthaya", "Sukhothai", "Chiang Mai", "Thonburi", "Phitsanulok", "Nakhon Si Thammarat", "Lopburi", "Pattaya", "Bangkok", "Lampang"],
  },

  // ===========================================================================
  // Steppe & Turkic
  // ===========================================================================
  {
    id: "scythians",
    name: "Scythians",
    leader: "Tomyris",
    abilityName: "People of the Steppe",
    abilityDesc: "+8% gold; cavalry +2 strength and +1 movement (the kurgan gold of the steppe princes).",
    uniqueUnit: "Scythian Horse Archer",
    uniqueInfra: "Kurgan",
    effects: { yieldPercent: { gold: 8 }, cavalryMovementBonus: 1, unitClassCombat: { cavalry: 2 } },
    cityNames: ["Tanais", "Gelonus", "Pazyryk", "Arzhan", "Ulski", "Kargaly", "Issyk", "Filippovka", "Solokha", "Sauromatia"],
  },
  {
    id: "xiongnu",
    name: "Xiongnu",
    leader: "Modu Chanyu",
    abilityName: "Steppe Confederacy",
    abilityDesc: "+8% food; cavalry +1 strength and +1 movement; +35% gold from raiding (the herds and the raids that taught China to build walls).",
    uniqueUnit: "Xiongnu Horse Archer",
    uniqueInfra: "Felt Tent",
    effects: { yieldPercent: { food: 8 }, cavalryMovementBonus: 1, unitClassCombat: { cavalry: 1 }, raidGoldPercent: 35 },
    cityNames: ["Luut Khot", "Khangai", "Otgon", "Ivolga", "Noin-Ula", "Tsetserleg", "Karakorum", "Ordu-Baliq", "Kherlen", "Talas"],
  },
  {
    id: "huns",
    name: "Huns",
    leader: "Attila",
    abilityName: "Scourge of God",
    abilityDesc: "+10% gold; cavalry +2 strength and +1 movement; +25% gold from raiding (Rome paid Attila tribute either way — in gold or in plunder).",
    uniqueUnit: "Hunnic Horde",
    uniqueInfra: "Ordu",
    effects: { yieldPercent: { gold: 10 }, unitClassCombat: { cavalry: 2 }, cavalryMovementBonus: 1, raidGoldPercent: 25 },
    cityNames: ["Attila's Court", "Bleda", "Tisza", "Dacia", "Pannonia", "Naissus", "Margus", "Viminacium", "Sirmium", "Aquincum"],
  },
  {
    id: "gokturks",
    name: "Göktürks",
    leader: "Bumin Qaghan",
    abilityName: "Sky Father",
    abilityDesc: "+8% production; cavalry +2 strength and +1 movement (the smiths of the Altai forged their own iron before they ruled the steppe).",
    uniqueUnit: "Turkic Lancer",
    uniqueInfra: "Stone Stele",
    effects: { yieldPercent: { production: 8 }, unitClassCombat: { cavalry: 2 }, cavalryMovementBonus: 1 },
    cityNames: ["Ordu-Baliq", "Suyab", "Talas", "Bishbalik", "Karakorum", "Otuken", "Yenisei", "Altai", "Zhenzhu", "Sogdia"],
  },
  {
    id: "seljuks",
    name: "Seljuks",
    leader: "Alp Arslan",
    abilityName: "Ghazi",
    abilityDesc: "+10% faith, +10% gold; cavalry +2 strength (the frontier warriors of the faith and the madrasa network behind them).",
    uniqueUnit: "Ghulam",
    uniqueInfra: "Madrasa",
    effects: { yieldPercent: { faith: 10, gold: 10 }, unitClassCombat: { cavalry: 2 } },
    cityNames: ["Merv", "Nishapur", "Rey", "Isfahan", "Baghdad", "Konya", "Iconium", "Hamadan", "Rayy", "Ghazna"],
  },
  {
    id: "mongols",
    name: "Mongols",
    leader: "Genghis Khan",
    abilityName: "Örtöö",
    abilityDesc: "+8% gold; cavalry +2 strength and +1 movement; +25% gold from raiding (the relay-post empire — tribute moved as fast as the horde).",
    uniqueUnit: "Keshig",
    uniqueInfra: "Ordu",
    effects: { yieldPercent: { gold: 8 }, cavalryMovementBonus: 1, unitClassCombat: { cavalry: 2 }, raidGoldPercent: 25 },
    cityNames: ["Karakorum", "Khanbaliq", "Samarkand", "Bukhara", "Merv", "Nishapur", "Tabriz", "Sarai", "Bolghar", "Almaliq"],
  },
  {
    id: "timurids",
    name: "Timurids",
    leader: "Tamerlane",
    abilityName: "Sword of Islam",
    abilityDesc: "+12% science, +5% culture; cavalry +2 strength; +15% gold from raiding, and raids also yield science (Timur carried scholars home along with the loot).",
    uniqueUnit: "Timurid Siege Train",
    uniqueInfra: "Registan",
    effects: { yieldPercent: { science: 12, culture: 5 }, unitClassCombat: { cavalry: 2 }, raidGoldPercent: 15, raidSciencePercent: 50 },
    cityNames: ["Samarkand", "Bukhara", "Herat", "Isfahan", "Shiraz", "Mashhad", "Tabriz", "Kabul", "Balkh", "Damascus"],
  },
  {
    id: "ottomans",
    name: "Ottomans",
    leader: "Mehmed II",
    abilityName: "Great Bombard",
    abilityDesc: "+10% gold; siege units +3 strength; all units train 10% faster and start with +10 XP (the devshirme corps and the guns that took Constantinople).",
    uniqueUnit: "Janissary",
    uniqueInfra: "Grand Bazaar",
    effects: { yieldPercent: { gold: 10 }, unitClassCombat: { siege: 3 }, trainTimePercent: -10, startXpBonus: 10 },
    cityNames: ["Istanbul", "Bursa", "Edirne", "Ankara", "Konya", "Iznik", "Thessalonica", "Cairo", "Baghdad", "Sofia"],
  },

  // ===========================================================================
  // The Americas
  // ===========================================================================
  {
    id: "olmec",
    name: "Olmec",
    leader: "Council",
    abilityName: "Mother Culture",
    abilityDesc: "+10% production, +12% culture, +8% faith (the first cities, calendars and gods of Mesoamerica).",
    uniqueUnit: "Olmec Spearman",
    uniqueInfra: "Colossal Head",
    effects: { yieldPercent: { production: 10, culture: 12, faith: 8 } },
    cityNames: ["San Lorenzo", "La Venta", "Tres Zapotes", "Laguna de los Cerros", "Las Bocas", "El Manatí", "Chalcatzingo", "San José Mogote", "La Mojarra", "Potrero Nuevo"],
  },
  {
    id: "maya",
    name: "Maya",
    leader: "Pacal the Great",
    abilityName: "Mayab",
    abilityDesc: "+15% science, +10% culture, +10% faith; farms +1 food (the calendar priests, the glyphs, and the milpa fields).",
    uniqueUnit: "Holkan",
    uniqueInfra: "Observatory",
    effects: { yieldPercent: { science: 15, culture: 10, faith: 10 }, farmTileFoodBonus: 1 },
    cityNames: ["Tikal", "Palenque", "Chichen Itza", "Copán", "Calakmul", "Uxmal", "Caracol", "Yaxha", "Bonampak", "Tulum"],
  },
  {
    id: "zapotec",
    name: "Zapotec",
    leader: "Cocijo priesthood",
    abilityName: "Cloud People",
    abilityDesc: "+12% culture, +10% faith, +8% science; melee units +1 strength (Mesoamerica's first writing, carved at Monte Albán).",
    uniqueUnit: "Zapotec Warrior",
    uniqueInfra: "Danzante Temple",
    effects: { unitClassCombat: { melee: 1 }, yieldPercent: { culture: 12, faith: 10, science: 8 } },
    cityNames: ["Monte Albán", "Mitla", "San José Mogote", "Dainzu", "Lambityeco", "Yagul", "Zaachila", "Huamelulpan", "Huitzo", "Teotitlán"],
  },
  {
    id: "teotihuacan",
    name: "Teotihuacan",
    leader: "Priest-Kings",
    abilityName: "City of the Gods",
    abilityDesc: "+12% production, +12% faith, +8% culture, +8% gold (the metropolis whose obsidian reached every corner of Mesoamerica).",
    uniqueUnit: "Pyramid Guard",
    uniqueInfra: "Avenue of the Dead",
    effects: { yieldPercent: { production: 12, faith: 12, culture: 8, gold: 8 } },
    cityNames: ["Teotihuacan", "Cuicuilco", "Cholula", "Tula", "Xochicalco", "Cacaxtla", "Cantona", "Tajín", "Tenochtitlan", "Tlaxcala"],
  },
  {
    id: "toltec",
    name: "Toltec",
    leader: "Topiltzin",
    abilityName: "Toltecayotl",
    abilityDesc: "+12% culture, +5% production; melee units +3 strength (toltecayotl — to be Toltec was to be master of every art, war included).",
    uniqueUnit: "Toltec Warrior",
    uniqueInfra: "Atlantean Hall",
    effects: { yieldPercent: { culture: 12, production: 5 }, unitClassCombat: { melee: 3 } },
    cityNames: ["Tula", "Cholula", "Tollan", "Xicotencatl", "Cempoala", "Tenayuca", "Teotihuacan", "Malinalco", "Tula de Allende", "Huapalcalco"],
  },
  {
    id: "aztec",
    name: "Aztec",
    leader: "Montezuma",
    abilityName: "Legend of the Eagle",
    abilityDesc: "+8% faith; melee units +2 strength (the flower wars fed the altars, and the altars fed the empire's resolve).",
    uniqueUnit: "Eagle Warrior",
    uniqueInfra: "Tlachtli",
    effects: { yieldPercent: { faith: 8 }, unitClassCombat: { melee: 2 } },
    cityNames: ["Tenochtitlan", "Texcoco", "Tlacopan", "Cholula", "Tlaxcala", "Tenayuca", "Azcapotzalco", "Cuauhtitlan", "Xochimilco", "Otumba"],
  },
  {
    id: "inca",
    name: "Inca",
    leader: "Pachacuti",
    abilityName: "Mit'a",
    abilityDesc: "+10% food, +8% production; +1 food from fresh-water tiles (the rotating labor draft that built an empire of roads and terraces).",
    uniqueUnit: "Warak'aq",
    uniqueInfra: "Terrace Farm",
    effects: { yieldPercent: { food: 10, production: 8 }, freshWaterTileFoodBonus: 1 },
    cityNames: ["Cusco", "Machu Picchu", "Quito", "Lima", "Chan Chan", "Tiwanaku", "Huaraz", "Vilcabamba", "Ollantaytambo", "Sacsayhuamán"],
  },
  {
    id: "muisca",
    name: "Muisca",
    leader: "Zipa",
    abilityName: "El Dorado",
    abilityDesc: "+18% gold, +10% faith (the gilded man of Lake Guatavita — gold offered to the gods by the raft-load).",
    uniqueUnit: "Guecha Warrior",
    uniqueInfra: "Salt Temple",
    effects: { yieldPercent: { gold: 18, faith: 10 } },
    cityNames: ["Bacatá", "Hunza", "Muyquytá", "Suamox", "Zipaquirá", "Tunja", "Sogamoso", "Guatavita", "Nemocón", "Tocancipá"],
  },
  {
    id: "mississippian_cahokia",
    name: "Mississippian (Cahokia)",
    leader: "Great Sun",
    abilityName: "Mound Builders",
    abilityDesc: "+12% production, +8% culture, +10% food (the maize bottomlands that fed a city larger than London).",
    uniqueUnit: "Cahokian Warrior",
    uniqueInfra: "Earthwork Mound",
    effects: { yieldPercent: { production: 12, culture: 8, food: 10 } },
    cityNames: ["Cahokia", "Moundville", "Etowah", "Spiro", "Kincaid", "Angel", "Emerald", "Wickliffe", "Winterville", "Nodena"],
  },
  {
    id: "haudenosaunee",
    name: "Haudenosaunee (Iroquois)",
    leader: "Hiawatha",
    abilityName: "Great League",
    abilityDesc: "+12% food, +8% production, +10% culture; units +2 strength on forest tiles in your territory (the Great Law of Peace, defended in its own woods).",
    uniqueUnit: "Mohawk Warrior",
    uniqueInfra: "Longhouse",
    effects: { yieldPercent: { production: 8, food: 12, culture: 10 }, forestTileCombatBonus: 2 },
    cityNames: ["Onondaga", "Seneca", "Cayuga", "Oneida", "Mohawk", "Tuscarora", "Ganondagan", "Canandaigua", "Buffalo", "Caughnawaga"],
  },
  {
    id: "pueblo",
    name: "Pueblo",
    leader: "Council",
    abilityName: "Cliff Dwellers",
    abilityDesc: "+10% production, +10% faith; +2 production from hill tiles (the kivas and great houses of the canyon country).",
    uniqueUnit: "Pueblo Skirmisher",
    uniqueInfra: "Cliff Palace",
    effects: { yieldPercent: { production: 10, faith: 10 }, hillTileProductionBonus: 2 },
    cityNames: ["Chaco Canyon", "Mesa Verde", "Taos", "Acoma", "Zuni", "Hopi", "Canyon de Chelly", "Bandelier", "Pecos", "San Ildefonso"],
  },

  // ===========================================================================
  // Oceania
  // ===========================================================================
  {
    id: "polynesia",
    name: "Polynesia",
    leader: "Hotu Matua",
    abilityName: "Wayfinding",
    abilityDesc: "+15% gold; +1 gold from coastal water tiles; naval units +1 movement (star paths and swell patterns no other sailors could read).",
    uniqueUnit: "Koa Warrior",
    uniqueInfra: "Marae",
    effects: { yieldPercent: { gold: 15 }, coastalTileGoldBonus: 1, navalMovementBonus: 1 },
    cityNames: ["Hanga Roa", "Mo'orea", "Raiatea", "Tahiti", "Hawai'i", "Samoa", "Tonga", "Aotearoa", "Rapa Nui", "Marquesas"],
  },
  {
    id: "maori",
    name: "Māori",
    leader: "Kupe",
    abilityName: "Mana",
    abilityDesc: "+8% culture, +5% food; melee units +3 strength (mana — the standing won in war and carved into the meeting house).",
    uniqueUnit: "Toa",
    uniqueInfra: "Pā",
    effects: { yieldPercent: { culture: 8, food: 5 }, unitClassCombat: { melee: 3 } },
    cityNames: ["Waitangi", "Kaikohe", "Rotorua", "Wellington", "Auckland", "Christchurch", "Whangārei", "Tauranga", "Hamilton", "Napier"],
  },
  {
    id: "hawaii",
    name: "Hawaiʻi",
    leader: "Kamehameha",
    abilityName: "Aloha ʻĀina",
    abilityDesc: "+12% gold, +8% food, +5% culture; +2 gold from coastal water tiles (the fishponds and taro terraces of the islands).",
    uniqueUnit: "Hawaiian Koa",
    uniqueInfra: "Heiau",
    effects: { yieldPercent: { gold: 12, food: 8, culture: 5 }, coastalTileGoldBonus: 2 },
    cityNames: ["Honolulu", "Hilo", "Kailua", "Lahaina", "Waipahu", "Pearl City", "Kahului", "Kona", "Molokai", "Kauai"],
  },

  // ===========================================================================
  // EXPANSION — Near East & Arabia (see docs/CIVILIZATIONS-EXPANSION.md)
  // ===========================================================================
  {
    id: "arabia", name: "Arabia", leader: "Harun al-Rashid",
    abilityName: "Faith of the Prophet",
    abilityDesc: "+12% science, +10% faith, +5% gold; +2 faith and +2 gold per trade route (the faith spread down the caravan roads).",
    uniqueUnit: "Camel Archer", uniqueInfra: "House of Wisdom",
    effects: { tradeRouteFaithBonus: 2, tradeRouteGoldBonus: 2, yieldPercent: { science: 12, faith: 10, gold: 5 } },
    cityNames: ["Mecca", "Medina", "Baghdad", "Damascus", "Kufa", "Basra", "Fustat", "Córdoba", "Samarra", "Kairouan"],
  },
  {
    id: "israelites", name: "Israelites", leader: "Solomon",
    abilityName: "Kingdom of David",
    abilityDesc: "+10% culture, +15% faith, +8% gold; +1 faith per trade route (Solomon's temple and Solomon's trade).",
    uniqueUnit: "Gibborim", uniqueInfra: "First Temple",
    effects: { tradeRouteFaithBonus: 1, yieldPercent: { culture: 10, faith: 15, gold: 8 } },
    cityNames: ["Jerusalem", "Samaria", "Hebron", "Bethlehem", "Jericho", "Beersheba", "Megiddo", "Lachish", "Shechem", "Dan"],
  },
  {
    id: "nabataeans", name: "Nabataeans", leader: "Aretas IV",
    abilityName: "Incense Road",
    abilityDesc: "+5% gold; +3 gold from each worked desert tile; desert cities +1 food and +1 gold (the hidden cisterns made the desert a highway).",
    uniqueUnit: "Desert Raider", uniqueInfra: "Cistern",
    effects: { yieldPercent: { gold: 5 }, goldPerWorkedDesert: 3, desertCityYield: { food: 1, gold: 1 } },
    cityNames: ["Petra", "Hegra", "Bosra", "Avdat", "Dumah", "Hawara", "Nessana", "Elusa", "Sela", "Mampsis"],
  },
  {
    id: "saba", name: "Saba", leader: "Bilqis",
    abilityName: "Frankincense Kingdom",
    abilityDesc: "+18% gold, +8% faith; +1 food from fresh-water tiles (frankincense for every altar in the ancient world).",
    uniqueUnit: "Sabaean Spearman", uniqueInfra: "Marib Dam",
    effects: { yieldPercent: { gold: 18, faith: 8 }, freshWaterTileFoodBonus: 1 },
    cityNames: ["Marib", "Sirwah", "Sana'a", "Najran", "Timna", "Shabwa", "Zafar", "Baraqish", "Nashshan", "Kamna"],
  },
  {
    id: "mitanni", name: "Mitanni", leader: "Tushratta",
    abilityName: "Maryannu",
    abilityDesc: "+10% food, +5% production; cavalry +2 strength and +1 movement (Kikkuli's horse-training text and the Habur plains).",
    uniqueUnit: "Maryannu Chariot", uniqueInfra: "Kikkuli Stables",
    effects: { yieldPercent: { food: 10, production: 5 }, unitClassCombat: { cavalry: 2 }, cavalryMovementBonus: 1 },
    cityNames: ["Washukanni", "Taite", "Kahat", "Nagar", "Irridu", "Harran", "Nuzi", "Alalakh", "Terqa", "Mari"],
  },
  {
    id: "urartu", name: "Urartu", leader: "Sarduri II",
    abilityName: "Kingdom of Van",
    abilityDesc: "+12% production, +10% faith, +5% food; +2 production from each mine (Haldi's fortress-temples above bronze workshops and vineyards).",
    uniqueUnit: "Urartian Charioteer", uniqueInfra: "Fortress of Van",
    effects: { mineTileProductionBonus: 2, yieldPercent: { production: 12, faith: 10, food: 5 } },
    cityNames: ["Tushpa", "Erebuni", "Argishtihinili", "Teishebaini", "Musasir", "Ardini", "Hasanlu", "Bastam", "Anzaf", "Karmir Blur"],
  },

  // ===========================================================================
  // EXPANSION — Persia & Central Asia
  // ===========================================================================
  {
    id: "greco_bactria", name: "Greco-Bactria", leader: "Demetrius I",
    abilityName: "Thousand Cities",
    abilityDesc: "+12% science, +12% culture, +5% gold (the land of a thousand cities).",
    uniqueUnit: "Bactrian Cataphract", uniqueInfra: "Gymnasion",
    effects: { yieldPercent: { science: 12, culture: 12, gold: 5 } },
    cityNames: ["Bactra", "Ai-Khanoum", "Alexandria-Oxiana", "Demetrias", "Eucratideia", "Bagram", "Termez", "Maracanda", "Sagala", "Pushkalavati"],
  },
  {
    id: "sogdia", name: "Sogdia", leader: "Divashtich",
    abilityName: "Lords of the Silk Road",
    abilityDesc: "+12% gold; +3 gold and +1 capacity per trade route (masters of the Silk Road).",
    uniqueUnit: "Sogdian Cavalry", uniqueInfra: "Caravanserai",
    effects: { yieldPercent: { gold: 12 }, tradeRouteGoldBonus: 3, tradeRouteCapacityBonus: 1 },
    cityNames: ["Samarkand", "Bukhara", "Panjikent", "Paykend", "Maimurgh", "Kesh", "Nakhshab", "Khujand", "Ustrushana", "Chach"],
  },
  {
    id: "khwarazm", name: "Khwarazm", leader: "Ala ad-Din Muhammad II",
    abilityName: "Shahs of Khwarazm",
    abilityDesc: "+18% gold; +2 gold per trade route (the rich Khwarazmian shahs).",
    uniqueUnit: "Khwarazmian Lancer", uniqueInfra: "Gurganj Bazaar",
    effects: { yieldPercent: { gold: 18 }, tradeRouteGoldBonus: 2 },
    cityNames: ["Gurganj", "Khiva", "Kath", "Hazarasp", "Merv", "Nishapur", "Otrar", "Urgench", "Samarkand", "Bukhara"],
  },

  // ===========================================================================
  // EXPANSION — North Africa & the Islamic Mediterranean
  // ===========================================================================
  {
    id: "numidia", name: "Numidia", leader: "Masinissa",
    abilityName: "Masaesyli Horse",
    abilityDesc: "Cavalry +1 strength, +1 movement and +1 sight; mounted units heal +10 HP per turn; +10% food (Masinissa made Numidia a granary).",
    uniqueUnit: "Numidian Cavalry", uniqueInfra: "Royal Horse Market",
    effects: { unitClassCombat: { cavalry: 1 }, cavalryMovementBonus: 1, mountedSightBonus: 1, mountedHealPerTurn: 10, yieldPercent: { food: 10 } },
    cityNames: ["Cirta", "Hippo Regius", "Thugga", "Zama", "Capsa", "Theveste", "Bulla Regia", "Calama", "Sicca", "Tipasa"],
  },
  {
    id: "fatimids", name: "Fatimid Caliphate", leader: "al-Mu'izz",
    abilityName: "Isma'ili Caliphate",
    abilityDesc: "+12% science, +12% faith, +5% gold; faith can rush production (Cairo, al-Azhar and the caliph's word).",
    uniqueUnit: "Fatimid Ghulam", uniqueInfra: "Al-Azhar",
    effects: { yieldPercent: { science: 12, faith: 12, gold: 5 }, rushWithFaith: true },
    cityNames: ["Cairo", "Mahdia", "Kairouan", "Fustat", "Alexandria", "Damascus", "Ascalon", "Tyre", "Barqa", "Palermo"],
  },
  {
    id: "ayyubids", name: "Ayyubids", leader: "Saladin",
    abilityName: "Sultan of Egypt & Syria",
    abilityDesc: "+10% production; cavalry and melee +1 strength; melee +2 strength attacking cities; all units heal +5 HP per turn (Saladin's engineers and sappers).",
    uniqueUnit: "Ayyubid Faris", uniqueInfra: "Citadel of Cairo",
    effects: { yieldPercent: { production: 10 }, unitClassCombat: { cavalry: 1, melee: 1 }, meleeVsCityBonus: 2, unitHealPerTurn: 5 },
    cityNames: ["Cairo", "Damascus", "Aleppo", "Homs", "Hama", "Mosul", "Jerusalem", "Baalbek", "Mayyafariqin", "Sana'a"],
  },
  {
    id: "mamluks", name: "Mamluk Sultanate", leader: "Baybars",
    abilityName: "Slave Soldiers",
    abilityDesc: "+5% gold; cavalry +2 strength; all units train 15% faster and start with +15 XP (the furusiyya academies of Cairo).",
    uniqueUnit: "Mamluk", uniqueInfra: "Maydan",
    effects: { yieldPercent: { gold: 5 }, unitClassCombat: { cavalry: 2 }, trainTimePercent: -15, startXpBonus: 15 },
    cityNames: ["Cairo", "Damascus", "Aleppo", "Alexandria", "Gaza", "Tripoli", "Hama", "Jerusalem", "Homs", "Safed"],
  },
  {
    id: "almoravids", name: "Almoravids", leader: "Yusuf ibn Tashfin",
    abilityName: "Veiled Sultanate",
    abilityDesc: "+12% faith; melee units +2 strength; +2 gold from each worked desert tile (the veiled warriors of the ribats).",
    uniqueUnit: "Lamtuna Spearman", uniqueInfra: "Ribat",
    effects: { yieldPercent: { faith: 12 }, goldPerWorkedDesert: 2, unitClassCombat: { melee: 2 } },
    cityNames: ["Marrakesh", "Aghmat", "Sijilmasa", "Fez", "Tlemcen", "Ceuta", "Algeciras", "Seville", "Córdoba", "Audaghost"],
  },

  // ===========================================================================
  // EXPANSION — Sub-Saharan Africa
  // ===========================================================================
  {
    id: "swahili", name: "Swahili (Kilwa)", leader: "al-Hasan ibn Sulaiman",
    abilityName: "Monsoon Trade",
    abilityDesc: "+5% gold; coastal cities +3 gold; +3 gold per trade route; naval units +1 movement (the monsoon winds and coral cities).",
    uniqueUnit: "Swahili Dhow", uniqueInfra: "Husuni Kubwa",
    effects: { yieldPercent: { gold: 5 }, coastalCityYield: { gold: 3 }, tradeRouteGoldBonus: 3, navalMovementBonus: 1 },
    cityNames: ["Kilwa", "Mombasa", "Zanzibar", "Malindi", "Lamu", "Sofala", "Mogadishu", "Pate", "Gedi", "Barawa"],
  },
  {
    id: "benin", name: "Benin", leader: "Oba Ewuare",
    abilityName: "Walls of Benin",
    abilityDesc: "+12% culture, +8% production; new cities are founded with free Walls (the guild quarters and great earthworks of Benin City).",
    uniqueUnit: "Ogboni Guard", uniqueInfra: "Iya Earthworks",
    effects: { yieldPercent: { culture: 12, production: 8 }, newCityFreeBuilding: "walls" },
    cityNames: ["Benin City", "Udo", "Ughoton", "Sabongida-Ora", "Ekiadolor", "Urhonigbe", "Usen", "Iyekorhionmwon", "Ogwa", "Uselu"],
  },
  {
    id: "kongo", name: "Kongo", leader: "Afonso I",
    abilityName: "Kingdom of Kongo",
    abilityDesc: "+15% culture, +15% faith, +8% food (the populous provinces of the manikongo).",
    uniqueUnit: "Kongo Archer", uniqueInfra: "Mbanza",
    effects: { yieldPercent: { faith: 15, culture: 15, food: 8 } },
    cityNames: ["M'banza-Kongo", "Mbanza Soyo", "Mbata", "Mpangu", "Mbamba", "Nsundi", "Mpemba", "Wandu", "Vunda", "Kongo dia Nlaza"],
  },

  // ===========================================================================
  // EXPANSION — Mediterranean & Europe
  // ===========================================================================
  {
    id: "bulgaria", name: "Bulgaria", leader: "Krum",
    abilityName: "Khans of the Danube",
    abilityDesc: "+10% production, +8% food; cavalry +2 strength; captured cities keep +1 population (Krum's laws and the Danube plain).",
    uniqueUnit: "Bulgar Horse Archer", uniqueInfra: "Preslav Court",
    effects: { yieldPercent: { production: 10, food: 8 }, unitClassCombat: { cavalry: 2 }, captureCityPopulationBonus: 1 },
    cityNames: ["Pliska", "Preslav", "Tarnovo", "Ohrid", "Sofia", "Vidin", "Silistra", "Plovdiv", "Varna", "Skopje"],
  },
  {
    id: "serbia", name: "Serbia", leader: "Stefan Dušan",
    abilityName: "Dušan's Code",
    abilityDesc: "+12% culture, +10% gold, +5% faith; +2 production from each mine (the Novo Brdo silver mines and the emperor's law).",
    uniqueUnit: "Pronoia Knight", uniqueInfra: "Despot's Hall",
    effects: { yieldPercent: { culture: 12, gold: 10, faith: 5 }, mineTileProductionBonus: 2 },
    cityNames: ["Ras", "Prizren", "Skopje", "Pristina", "Novo Brdo", "Belgrade", "Niš", "Smederevo", "Peć", "Kruševac"],
  },
  {
    id: "bohemia", name: "Bohemia", leader: "Charles IV",
    abilityName: "Crown of St. Wenceslas",
    abilityDesc: "+12% science, +10% gold, +5% culture; +2 production from each mine (Kutná Hora silver and Charles' Prague).",
    uniqueUnit: "Hussite War Wagon", uniqueInfra: "Kutná Hora Mint",
    effects: { mineTileProductionBonus: 2, yieldPercent: { science: 12, gold: 10, culture: 5 } },
    cityNames: ["Prague", "Kutná Hora", "Brno", "Olomouc", "Plzeň", "Kolín", "Tábor", "Hradec Králové", "Cheb", "Znojmo"],
  },
  {
    id: "swiss", name: "Swiss Confederacy", leader: "Werner Stauffacher",
    abilityName: "Reisläufer",
    abilityDesc: "+5% production; melee units +3 strength; land units ignore rough-terrain penalties; all units train 10% faster (the mountain confederates muster fast and march anywhere).",
    uniqueUnit: "Swiss Halberdier", uniqueInfra: "Rütli Meadow",
    effects: { yieldPercent: { production: 5 }, unitClassCombat: { melee: 3 }, ignoreRoughTerrain: true, trainTimePercent: -10 },
    cityNames: ["Schwyz", "Uri", "Unterwalden", "Lucerne", "Zürich", "Bern", "Glarus", "Zug", "Basel", "Fribourg"],
  },
  {
    id: "aragon", name: "Crown of Aragon", leader: "James I",
    abilityName: "Mare Nostrum",
    abilityDesc: "+12% gold; coastal cities +3 gold; +1 gold per trade route; naval units +1 movement (the consulates of the sea from Barcelona to Athens).",
    uniqueUnit: "Almogàver", uniqueInfra: "Llotja",
    effects: { yieldPercent: { gold: 12 }, navalMovementBonus: 1, coastalCityYield: { gold: 3 }, tradeRouteGoldBonus: 1 },
    cityNames: ["Zaragoza", "Barcelona", "Valencia", "Palma", "Tarragona", "Lleida", "Tortosa", "Girona", "Huesca", "Cagliari"],
  },
  {
    id: "scotland", name: "Scotland", leader: "Robert the Bruce",
    abilityName: "Schiltron",
    abilityDesc: "+10% faith, +8% food; melee units +2 strength; +1 production from hills; +1 faith from your forests (the hard kirk-and-glen resilience of the north).",
    uniqueUnit: "Highland Schiltron", uniqueInfra: "Tower House",
    effects: { yieldPercent: { faith: 10, food: 8 }, unitClassCombat: { melee: 2 }, hillTileProductionBonus: 1, forestTileFaithBonus: 1 },
    cityNames: ["Scone", "Stirling", "Edinburgh", "Dunfermline", "Perth", "Aberdeen", "Dunkeld", "Glasgow", "St Andrews", "Inverness"],
  },
  {
    id: "gaelic_ireland", name: "Gaelic Ireland", leader: "Brian Boru",
    abilityName: "High Kingship",
    abilityDesc: "+12% culture, +12% faith, +5% food; +1 faith from your forests; newly trained units muster with +10 morale (the island of saints and scholars — and its sworn retainers).",
    uniqueUnit: "Gallowglass", uniqueInfra: "Round Tower",
    effects: { yieldPercent: { faith: 12, culture: 12, food: 5 }, forestTileFaithBonus: 1, startMoraleBonus: 10 },
    cityNames: ["Tara", "Cashel", "Armagh", "Clonmacnoise", "Kells", "Dublin", "Cork", "Limerick", "Glendalough", "Kildare"],
  },
  {
    id: "normans", name: "Normans (Sicily)", leader: "Roger II",
    abilityName: "Hauteville Conquest",
    abilityDesc: "+10% science, +8% gold; cavalry +2 strength; captured cities keep +1 population (a handful of knights won kingdoms — and ran them brilliantly).",
    uniqueUnit: "Norman Knight", uniqueInfra: "Palatine Chapel",
    effects: { unitClassCombat: { cavalry: 2 }, yieldPercent: { science: 10, gold: 8 }, captureCityPopulationBonus: 1 },
    cityNames: ["Palermo", "Messina", "Salerno", "Bari", "Syracuse", "Catania", "Amalfi", "Aversa", "Melfi", "Reggio"],
  },
  {
    id: "visigoths", name: "Visigoths", leader: "Leovigild",
    abilityName: "Kingdom of Toledo",
    abilityDesc: "+12% culture, +10% faith, +10% gold; captured cities keep +1 population (the councils, crowns and treasure of Toledo).",
    uniqueUnit: "Visigothic Noble", uniqueInfra: "Hall of Toledo",
    effects: { captureCityPopulationBonus: 1, yieldPercent: { culture: 12, faith: 10, gold: 10 } },
    cityNames: ["Toledo", "Toulouse", "Barcelona", "Mérida", "Seville", "Narbonne", "Córdoba", "Tarragona", "Recópolis", "Braga"],
  },
  {
    id: "novgorod", name: "Novgorod", leader: "Alexander Nevsky",
    abilityName: "Fur Republic",
    abilityDesc: "+12% gold; +2 gold from coastal water tiles; +2 gold per trade route (the fur trade and the Hansa kontor on the Volkhov).",
    uniqueUnit: "Ushkuinik", uniqueInfra: "Veche Bell",
    effects: { coastalTileGoldBonus: 2, yieldPercent: { gold: 12 }, tradeRouteGoldBonus: 2 },
    cityNames: ["Novgorod", "Pskov", "Ladoga", "Beloozero", "Torzhok", "Staraya Russa", "Izborsk", "Vologda", "Vyatka", "Oreshek"],
  },

  // ===========================================================================
  // EXPANSION — European tribal peoples (Iron Age & Arctic)
  // ===========================================================================
  {
    id: "illyrians", name: "Illyrians", leader: "Teuta",
    abilityName: "Adriatic Pirates",
    abilityDesc: "+8% gold; coastal cities +2 gold; naval units +2 movement; +50% gold from coastal raids (Teuta's state piracy).",
    uniqueUnit: "Liburnian", uniqueInfra: "Gradina",
    effects: { yieldPercent: { gold: 8 }, coastalCityYield: { gold: 2 }, coastalRaidGoldPercent: 50, navalMovementBonus: 2 },
    cityNames: ["Scodra", "Rhizon", "Lissus", "Epidamnus", "Apollonia", "Daorson", "Salona", "Narona", "Bylis", "Amantia"],
  },
  {
    id: "lusitani", name: "Lusitani", leader: "Viriathus",
    abilityName: "Concursare",
    abilityDesc: "+8% food; melee units +1 strength, and +3 more fighting on forest tiles in your territory; land units ignore rough-terrain penalties (Viriathus' running guerrilla war).",
    uniqueUnit: "Falcata Warrior", uniqueInfra: "Castro",
    effects: { yieldPercent: { food: 8 }, unitClassCombat: { melee: 1 }, forestTileCombatBonus: 3, ignoreRoughTerrain: true },
    cityNames: ["Viseu", "Conímbriga", "Salmantica", "Ebora", "Pax Julia", "Olisipo", "Bracara", "Mirobriga", "Caurium", "Norba"],
  },
  {
    id: "arevaci", name: "Arevaci", leader: "Caros",
    abilityName: "Spirit of Numantia",
    abilityDesc: "+10% production; melee units +2 strength; new cities are founded with free Walls (the town that chose fire over surrender).",
    uniqueUnit: "Celtiberian Warrior", uniqueInfra: "Murallas de Numancia",
    effects: { yieldPercent: { production: 10 }, unitClassCombat: { melee: 2 }, newCityFreeBuilding: "walls" },
    cityNames: ["Numantia", "Segeda", "Termantia", "Uxama", "Tiermes", "Clunia", "Bilbilis", "Segontia", "Lutia", "Contrebia"],
  },
  {
    id: "thracians", name: "Thracians", leader: "Sitalces",
    abilityName: "Odrysian Host",
    abilityDesc: "+10% gold; ranged units +3 strength; cavalry +1 strength (Thracian gold and the peltasts every Greek army hired).",
    uniqueUnit: "Thracian Peltast", uniqueInfra: "Thracian Tomb",
    effects: { yieldPercent: { gold: 10 }, unitClassCombat: { ranged: 3, cavalry: 1 } },
    cityNames: ["Seuthopolis", "Cabyle", "Uscudama", "Bizye", "Philippopolis", "Odessos", "Beroe", "Pistiros", "Helis", "Apros"],
  },
  {
    id: "dacians", name: "Dacians", leader: "Decebalus",
    abilityName: "Gold of the Carpathians",
    abilityDesc: "+10% gold; melee units +2 strength; +2 production from each mine (the mountain gold that drew Trajan's legions).",
    uniqueUnit: "Falxman", uniqueInfra: "Murus Dacicus",
    effects: { yieldPercent: { gold: 10 }, mineTileProductionBonus: 2, unitClassCombat: { melee: 2 } },
    cityNames: ["Sarmizegetusa", "Apulum", "Napoca", "Buridava", "Piroboridava", "Costești", "Blidaru", "Cumidava", "Genucla", "Argedava"],
  },
  {
    id: "sami", name: "Sámi", leader: "Noaidi Council",
    abilityName: "People of the Eight Seasons",
    abilityDesc: "+10% food, +12% faith; +1 faith from your forests; land units ignore rough-terrain penalties (the noaidi's drum and the reindeer roads).",
    uniqueUnit: "Ski Raider", uniqueInfra: "Siida Camp",
    effects: { yieldPercent: { faith: 12, food: 10 }, forestTileFaithBonus: 1, ignoreRoughTerrain: true },
    cityNames: ["Aanaar", "Guovdageaidnu", "Kárášjohka", "Johkamohkki", "Giron", "Ohcejohka", "Eanodat", "Soađegilli", "Deatnu", "Aarborte"],
  },

  // ===========================================================================
  // EXPANSION — Greek city-states
  // ===========================================================================
  {
    id: "corinth", name: "Corinth", leader: "Periander",
    abilityName: "Two Seas",
    abilityDesc: "Coastal cities +3 gold; +3 gold per trade route; naval units +1 movement (the diolkos hauled ships between two seas).",
    uniqueUnit: "Corinthian Trireme", uniqueInfra: "Diolkos",
    effects: { tradeRouteGoldBonus: 3, coastalCityYield: { gold: 3 }, navalMovementBonus: 1 },
    cityNames: ["Corinth", "Syracuse", "Corcyra", "Ambracia", "Potidaea", "Apollonia", "Leucas", "Anactorium", "Sicyon", "Cenchreae"],
  },
  {
    id: "thebes", name: "Thebes", leader: "Epaminondas",
    abilityName: "Sacred Band",
    abilityDesc: "+10% culture, +5% faith; melee units +3 strength; newly trained units muster with +15 morale (Epaminondas' Thebes — devotion made discipline).",
    uniqueUnit: "Sacred Band", uniqueInfra: "Cadmea",
    effects: { yieldPercent: { culture: 10, faith: 5 }, unitClassCombat: { melee: 3 }, startMoraleBonus: 15 },
    cityNames: ["Thebes", "Plataea", "Thespiae", "Orchomenus", "Tanagra", "Coronea", "Haliartus", "Chaeronea", "Leuctra", "Aulis"],
  },
  {
    id: "eretria", name: "Eretria", leader: "Eretrian Assembly",
    abilityName: "Euboean Colonists",
    abilityDesc: "+12% culture, +5% gold; +2 gold per trade route; new cities start with +1 population (the first great Greek colonizers).",
    uniqueUnit: "Penteconter", uniqueInfra: "Emporion",
    effects: { newCityExtraPopulation: 1, tradeRouteGoldBonus: 2, yieldPercent: { culture: 12, gold: 5 } },
    cityNames: ["Eretria", "Chalcis", "Pithekoussai", "Cumae", "Methone", "Mende", "Torone", "Dikaia", "Carystus", "Styra"],
  },
  {
    id: "crete", name: "Crete", leader: "Nearchus",
    abilityName: "Cretan Archers",
    abilityDesc: "+10% gold; ranged units +3 strength; newly trained units start with +10 XP (the mercenary isle — every army paid for Cretan bows).",
    uniqueUnit: "Cretan Archer", uniqueInfra: "Gortyn Code",
    effects: { yieldPercent: { gold: 10 }, unitClassCombat: { ranged: 3 }, startXpBonus: 10 },
    cityNames: ["Knossos", "Gortyn", "Phaistos", "Kydonia", "Lyttos", "Itanos", "Hierapytna", "Praisos", "Eleutherna", "Lato"],
  },

  // ===========================================================================
  // EXPANSION — South & East Asia
  // ===========================================================================
  {
    id: "indus_valley", name: "Indus Valley", leader: "Priest-Council",
    abilityName: "Planned Cities",
    abilityDesc: "New cities are founded with a free Granary; new cities start with +1 population.",
    uniqueUnit: "Harappan Spearman", uniqueInfra: "Great Bath",
    effects: { newCityExtraPopulation: 1, newCityFreeBuilding: "granary" },
    cityNames: ["Mohenjo-daro", "Harappa", "Dholavira", "Rakhigarhi", "Lothal", "Kalibangan", "Ganweriwala", "Mehrgarh", "Banawali", "Surkotada"],
  },
  {
    id: "zhou_china", name: "Zhou China", leader: "King Wu",
    abilityName: "Mandate of Heaven",
    abilityDesc: "+12% culture, +8% faith, +8% production (the rites, the ancestors, and the great bronze foundries).",
    uniqueUnit: "Zhou Chariot", uniqueInfra: "Ancestral Temple",
    effects: { yieldPercent: { culture: 12, faith: 8, production: 8 } },
    cityNames: ["Haojing", "Luoyang", "Fenghao", "Qufu", "Linzi", "Xinzheng", "Handan", "Yong", "Jiang", "Wan"],
  },
  {
    id: "delhi_sultanate", name: "Delhi Sultanate", leader: "Alauddin Khalji",
    abilityName: "Sultanate of Hind",
    abilityDesc: "+12% gold, +8% faith, +5% food; all units train 10% faster (Alauddin's price edicts paid a standing army).",
    uniqueUnit: "Delhi War Elephant", uniqueInfra: "Hauz",
    effects: { yieldPercent: { gold: 12, faith: 8, food: 5 }, trainTimePercent: -10 },
    cityNames: ["Delhi", "Lahore", "Multan", "Daulatabad", "Jaunpur", "Badaun", "Ajmer", "Lakhnauti", "Siri", "Tughlaqabad"],
  },
  {
    id: "mughals", name: "Mughal Empire", leader: "Akbar",
    abilityName: "Padishah",
    abilityDesc: "+12% culture, +12% gold, +8% faith (sulh-i kul — universal tolerance under the emperor of peace).",
    uniqueUnit: "Mughal Sowar", uniqueInfra: "Red Fort",
    effects: { yieldPercent: { culture: 12, gold: 12, faith: 8 } },
    cityNames: ["Agra", "Delhi", "Fatehpur Sikri", "Lahore", "Kabul", "Allahabad", "Ajmer", "Burhanpur", "Dhaka", "Srinagar"],
  },
  {
    id: "vijayanagara", name: "Vijayanagara", leader: "Krishnadevaraya",
    abilityName: "City of Victory",
    abilityDesc: "+12% gold, +8% faith, +8% culture; +1 food from fresh-water tiles (Hampi — travellers wrote no city on earth compared).",
    uniqueUnit: "Vijayanagara War Elephant", uniqueInfra: "Temple Tank",
    effects: { yieldPercent: { gold: 12, faith: 8, culture: 8 }, freshWaterTileFoodBonus: 1 },
    cityNames: ["Vijayanagara", "Hampi", "Penukonda", "Chandragiri", "Srirangapatna", "Udayagiri", "Gutti", "Kanchipuram", "Bhatkal", "Mangalore"],
  },
  {
    id: "champa", name: "Champa", leader: "Jaya Indravarman IV",
    abilityName: "Lords of the Sea",
    abilityDesc: "+10% gold; coastal cities +2 gold; naval units +2 movement; +50% gold from coastal raids (the corsair kingdom of the South China Sea).",
    uniqueUnit: "Cham Raider", uniqueInfra: "My Son Tower",
    effects: { yieldPercent: { gold: 10 }, coastalCityYield: { gold: 2 }, coastalRaidGoldPercent: 50, navalMovementBonus: 2 },
    cityNames: ["Indrapura", "Vijaya", "Simhapura", "Kauthara", "Panduranga", "Amaravati", "Virapura", "Rajapura", "Bal Hangov", "Bal Sri Banoy"],
  },
  {
    id: "sinhala", name: "Sinhala", leader: "Parakramabahu I",
    abilityName: "Let No Drop Waste",
    abilityDesc: "+10% food, +10% faith, +5% culture; +1 food and +1 production from fresh-water tiles (Parakramabahu's great tanks and the Mahavihara).",
    uniqueUnit: "Sinhala War Elephant", uniqueInfra: "Wewa",
    effects: { yieldPercent: { food: 10, faith: 10, culture: 5 }, freshWaterTileFoodBonus: 1, freshWaterTileProductionBonus: 1 },
    cityNames: ["Anuradhapura", "Polonnaruwa", "Sigiriya", "Kandy", "Dambadeniya", "Yapahuwa", "Kurunegala", "Mahagama", "Tissamaharama", "Kelaniya"],
  },
  {
    id: "khitan", name: "Khitan (Liao)", leader: "Abaoji",
    abilityName: "Dual Administration",
    abilityDesc: "+10% gold; cavalry +2 strength and +1 movement (steppe riders taxing settled China through twin capitals).",
    uniqueUnit: "Ordo Cavalry", uniqueInfra: "Ordo Camp",
    effects: { yieldPercent: { gold: 10 }, cavalryMovementBonus: 1, unitClassCombat: { cavalry: 2 } },
    cityNames: ["Shangjing", "Zhongjing", "Dongjing", "Nanjing", "Xijing", "Linhuang", "Liaoyang", "Datong", "Yunzhou", "Zhuozhou"],
  },
  {
    id: "jurchen", name: "Jurchen (Jin)", leader: "Aguda",
    abilityName: "Meng'an-Mouke",
    abilityDesc: "+10% production; cavalry +2 strength; melee +2 strength attacking cities (the Jin ran the largest iron industry on earth).",
    uniqueUnit: "Iron Pagoda", uniqueInfra: "Meng'an Garrison",
    effects: { yieldPercent: { production: 10 }, unitClassCombat: { cavalry: 2 }, meleeVsCityBonus: 2 },
    cityNames: ["Huining", "Zhongdu", "Bianjing", "Liaoyang", "Datong", "Yanjing", "Huanglongfu", "Hancheng", "Linhuang", "Dading"],
  },

  // ===========================================================================
  // EXPANSION — Steppe & Turkic
  // ===========================================================================
  {
    id: "khazars", name: "Khazars", leader: "Bulan",
    abilityName: "Toll of the Steppe",
    abilityDesc: "+10% gold, +8% faith; +3 gold per trade route (every road between two worlds paid the khagan's toll).",
    uniqueUnit: "Khazar Lancer", uniqueInfra: "Sarkel Fortress",
    effects: { tradeRouteGoldBonus: 3, yieldPercent: { gold: 10, faith: 8 } },
    cityNames: ["Atil", "Sarkel", "Balanjar", "Samandar", "Kerch", "Tmutarakan", "Sudak", "Phanagoria", "Khazaran", "Semender"],
  },
  {
    id: "avars", name: "Avars", leader: "Bayan I",
    abilityName: "Ring of the Avars",
    abilityDesc: "+10% gold; cavalry +2 strength and +1 movement; +25% gold from raiding (two centuries of Byzantine tribute hoarded in the Ring).",
    uniqueUnit: "Avar Lancer", uniqueInfra: "Hring",
    effects: { yieldPercent: { gold: 10 }, unitClassCombat: { cavalry: 2 }, cavalryMovementBonus: 1, raidGoldPercent: 25 },
    cityNames: ["Hring", "Sirmium", "Singidunum", "Aquincum", "Savaria", "Carnuntum", "Mursa", "Bassiana", "Brigetio", "Cibalae"],
  },
  {
    id: "golden_horde", name: "Golden Horde", leader: "Batu Khan",
    abilityName: "Tatar Yoke",
    abilityDesc: "+8% gold; cavalry +2 strength and +1 movement; +35% gold from raiding (the yoke — tribute enforced at a gallop).",
    uniqueUnit: "Tatar Horse Archer", uniqueInfra: "Yam Relay",
    effects: { yieldPercent: { gold: 8 }, raidGoldPercent: 35, unitClassCombat: { cavalry: 2 }, cavalryMovementBonus: 1 },
    cityNames: ["Sarai", "Sarai Berke", "Bolghar", "Astrakhan", "Azov", "Kazan", "Solhat", "Ukek", "Majar", "Tyumen"],
  },

  // ===========================================================================
  // EXPANSION — The Americas
  // ===========================================================================
  {
    id: "chimu", name: "Chimú", leader: "Minchançaman",
    abilityName: "Kingdom of Chimor",
    abilityDesc: "+12% gold, +8% production; desert cities +1 food and +1 gold (the canal-fed desert capital of Chan Chan and its goldsmiths).",
    uniqueUnit: "Chimú Slinger", uniqueInfra: "Chan Chan Citadel",
    effects: { desertCityYield: { food: 1, gold: 1 }, yieldPercent: { gold: 12, production: 8 } },
    cityNames: ["Chan Chan", "Pacatnamú", "Farfán", "Manchan", "Túcume", "Apurlec", "Pampa Grande", "Galindo", "Purgatorio", "Batán Grande"],
  },
  {
    id: "moche", name: "Moche", leader: "Lord of Sipán",
    abilityName: "Huaca Builders",
    abilityDesc: "+15% faith, +8% culture, +8% production, +8% food (adobe mountains raised brick by brick, and canals that greened the desert).",
    uniqueUnit: "Moche Warrior", uniqueInfra: "Huaca",
    effects: { yieldPercent: { faith: 15, culture: 8, production: 8, food: 8 } },
    cityNames: ["Moche", "Sipán", "Pampa Grande", "Galindo", "Dos Cabezas", "San José de Moro", "El Brujo", "Pañamarca", "Huancaco", "Cerro Blanco"],
  },
  {
    id: "tiwanaku", name: "Tiwanaku", leader: "Priest-Rulers",
    abilityName: "Raised Fields",
    abilityDesc: "+15% faith, +10% food, +8% culture; +2 food from fresh-water tiles (the suka kollus — raised fields that out-yielded modern farms at 4,000 meters).",
    uniqueUnit: "Tiwanaku Spearman", uniqueInfra: "Akapana Pyramid",
    effects: { freshWaterTileFoodBonus: 2, yieldPercent: { faith: 15, food: 10, culture: 8 } },
    cityNames: ["Tiwanaku", "Lukurmata", "Pajchiri", "Khonkho Wankane", "Lakaya", "Ojje", "Pariti", "Wankani", "Kala Uyuni", "Iwawi"],
  },
  {
    id: "tarascans", name: "Tarascans", leader: "Tariácuri",
    abilityName: "Metalsmiths of Michoacán",
    abilityDesc: "+10% gold; melee units +2 strength; all units train 15% faster (the only Mesoamerican army with metal weapons — and it never fell to the Aztecs).",
    uniqueUnit: "Copper Macehead", uniqueInfra: "Yácata",
    effects: { yieldPercent: { gold: 10 }, unitClassCombat: { melee: 2 }, trainTimePercent: -15 },
    cityNames: ["Tzintzuntzan", "Pátzcuaro", "Ihuatzio", "Zacapu", "Erongarícuaro", "Uruapan", "Tariácuri", "Taximaroa", "Coyuca", "Charo"],
  },
  {
    id: "taino", name: "Taíno", leader: "Anacaona",
    abilityName: "Caciquedom",
    abilityDesc: "+15% culture, +8% food, +8% faith; island cities +2 food (the conuco mounds and the zemi spirits of the islands).",
    uniqueUnit: "Guaribo Slinger", uniqueInfra: "Batey",
    effects: { islandCityYield: { food: 2 }, yieldPercent: { culture: 15, food: 8, faith: 8 } },
    cityNames: ["Xaragua", "Maguana", "Marién", "Higüey", "Magua", "Caonao", "Borinquen", "Cayacoa", "Guacayarima", "Bainoa"],
  },

  // ===========================================================================
  // EXPANSION — Oceania
  // ===========================================================================
  {
    id: "tonga", name: "Tonga", leader: "Tuʻi Tonga",
    abilityName: "Maritime Tribute",
    abilityDesc: "+5% gold; naval units +2 movement; island cities +3 gold (the Tuʻi Tonga's tribute fleets ranged a thousand miles of ocean).",
    uniqueUnit: "Tongan Toa", uniqueInfra: "Langi",
    effects: { yieldPercent: { gold: 5 }, islandCityYield: { gold: 3 }, navalMovementBonus: 2 },
    cityNames: ["Mu'a", "Lapaha", "Heketa", "Nuku'alofa", "Niuatoputapu", "Pangai", "Neiafu", "Ohonua", "Hihifo", "Kolovai"],
  },
];

const LEADER_QUOTES: Record<string, string> = {
  sumer: "I will set up my name where the names of famous men are written.",
  akkad: "The king's shadow is long, but his word is longer still.",
  babylon: "That the strong might not oppress the weak, I have inscribed my law upon stone.",
  assyria: "I am learned, I have seen what is hidden from others; wisdom is my counsel.",
  hittites: "Let the storm-god strike where Hatti's chariots roll.",
  elam: "Between the highlands and the plain, we build temples that touch the sky.",
  phoenicia: "I found a city and a people; let legend do the rest.",
  lydia: "Count no man happy until his final day has closed.",
  median_empire: "From the Zagros to the steppe, the Medes ride as one.",
  persia: "Diversity in counsel, unity in command.",
  parthia: "Poison cannot kill what has been tempered by patience.",
  sassanid_persia: "Justice is the soul of kingship; without it, empire is mere plunder.",
  egypt: "I have restored that which was in ruins; I have made the obscure magnificent.",
  kush_nubia: "Rome may take our gold, but never our pride.",
  carthage: "I will either find a way, or make one.",
  aksum: "By this cross, Aksum is made one beneath heaven.",
  ethiopia_zagwe: "From living rock we carve a prayer that stone may outlast empire.",
  mali: "Gold is the dust beneath the feet of the righteous pilgrim.",
  ghana_empire: "The gold of Wagadu flows only where trade is guarded by spears.",
  songhai: "The scholar's ink is holier than the martyr's blood.",
  great_zimbabwe: "Great Zimbabwe stands because its stones speak of many hands made one.",
  kanem_bornu: "A kingdom is a garden; neglect it, and the desert returns.",
  minoans: "Where the bull dances, the seas obey.",
  mycenaean_greece: "A thousand ships for honor; one throne for the victor.",
  greece: "What you leave behind is not what is engraved in stone monuments, but what is woven into the lives of others.",
  sparta: "Molon labe — come and take them.",
  macedon: "There is nothing impossible to him who will try.",
  etruscans: "Rome's gates shall open to Etruscan courage, or not at all.",
  rome: "I have done my duty; now I may rest.",
  celts_gauls: "United Gaul is a single people, and the Republic shall know it.",
  byzantium: "The emperor is never weary of conferring benefits on his subjects.",
  norse: "A coward's fate is worse than a warrior's wound.",
  franks: "To have another language is to possess a second soul.",
  goths: "Goth and Roman may differ in custom, but a just reign unites both.",
  anglo_saxon_england: "A wise man seeks wisdom until his last breath.",
  france: "I am not afraid; I was born to do this.",
  castile_spain: "I will cleanse my kingdom and send its light across the western sea.",
  portugal: "The sea is dangerous and its storms terrible, but these obstacles have never yet been sufficient reason to remain ashore.",
  venice: "Venice does not ask permission; Venice sets the price.",
  genoa: "The sea is our wall, and our galleys its gates.",
  dutch_republic: "I cannot approve of princes ruling the conscience of their subjects.",
  holy_roman_empire: "The empire is a forge; I am its hammer.",
  kievan_rus: "Law and faith together raise Kiev above the northern forests.",
  poland_lithuania: "I choose not a crown, but a people.",
  hungary: "A kingdom without a library is a body without a soul.",
  han_china: "I have unified all under heaven; let a thousand ages remember.",
  china_tang_song: "With a bronze mirror, one sees one's face; with history, one's age.",
  china_ming: "The dragon throne commands the seas; let the treasure fleets sail.",
  maurya: "The only true conquest is the conquest of the self.",
  gupta_india: "Prosperity is the lotus that blooms from just rule.",
  chola: "Every temple bell is a verse in the empire's hymn.",
  japan: "The nation is a garden; trim too little and weeds grow, too much and flowers die.",
  korea: "The letters I give my people are the voice of every soul.",
  tibet: "Between the snows and the sky, let wisdom and law find a throne.",
  dai_viet_vietnam: "From Lam Son's bamboo groves, a nation's will is forged.",
  khmer: "I have built hospitals and roads; compassion is the true monument.",
  srivijaya: "Where the monsoon blows, Srivijaya's ships carry more than cargo.",
  majapahit: "Majapahit is the mandala around which the archipelago turns.",
  pagan_burma: "Pagodas rise from faith, but kingdoms stand on discipline.",
  ayutthaya_siam: "The bell of justice hangs at my gate; any may ring it.",
  scythians: "I warned you I would satiate your thirst with blood.",
  xiongnu: "The steppe bows only to the arrow that knows its target.",
  huns: "It is not enough to be victorious; the world must know it trembles.",
  gokturks: "From the wolf's stock, we build an empire of the sky.",
  seljuks: "Behold the fate of princes; glory is dust, and power a loan.",
  mongols: "If you had not committed great sins, God would not have sent a punishment like me upon you.",
  timurids: "I am the scourge of God appointed to chastise you.",
  ottomans: "The city is fallen; from this day forth, it is a capital of empires.",
  olmec: "In stone we carve the first face of the people.",
  maya: "I have taken my seat in the sky; let time read my name.",
  zapotec: "Lightning speaks for the rain-giver; we are its voice.",
  teotihuacan: "The avenue of the dead leads to the heart of the sun.",
  toltec: "Let the feathered serpent guide us from war to wisdom.",
  aztec: "The sun himself weeps when the warrior's song is stilled.",
  inca: "I have turned the world upside down and made it Inca.",
  muisca: "Beneath the lake's mirror, gold is only the shadow of the gods.",
  mississippian_cahokia: "The mound is the earth; the sun above, our ancestor.",
  haudenosaunee: "In peace we plant, in council we thrive, in unity we endure.",
  pueblo: "We are the people of the sun; our walls hold both home and prayer.",
  polynesia: "Across the wide ocean we carried our gods, our seed, and our name.",
  maori: "I have returned from the land of the long white cloud.",
  hawaii: "The life of the land is perpetuated in righteousness.",

  // Expansion civilizations
  arabia: "Seek knowledge even unto China; the scholar's pen outlasts the sword.",
  israelites: "Wisdom is better than rubies, and a wise heart builds a kingdom.",
  nabataeans: "We who hide water in the desert need fear no army.",
  saba: "From Marib I sent frankincense to every throne under heaven.",
  mitanni: "Let the horses of Hurri thunder, and kings will sue for peace.",
  urartu: "Upon the rock of Van I carved my name where no enemy may reach.",
  greco_bactria: "A thousand cities of Hellas bloom between the Oxus and the Indus.",
  sogdia: "The road of silk is our river; every caravan a tribute to Samarkand.",
  khwarazm: "From the Caspian to the Indus, the Shah's word is law.",
  numidia: "Africa belongs to those who can ride it from dawn to dusk.",
  fatimids: "In Cairo I raise a city of learning to rival the stars.",
  ayyubids: "I make war on armies, not on the helpless; let mercy be my conquest.",
  mamluks: "Slaves we were born, but lions we became; the Mongol tide breaks on us.",
  almoravids: "Veiled in the desert, we carry the faith on the points of our spears.",
  swahili: "The monsoon is our highway; gold and porcelain meet at Kilwa.",
  benin: "Within these walls of earth, bronze remembers what men forget.",
  kongo: "I have given my kingdom a new faith and a written name.",
  bulgaria: "Let the emperor's pride fill my cup; the Danube is ours.",
  serbia: "By this code I bind tsar and peasant alike to justice.",
  bohemia: "Prague shall be the golden crown upon the brow of the empire.",
  swiss: "Free men need no king; our pikes are our charter.",
  aragon: "From Valencia to the isles, the sea answers to Aragon.",
  scotland: "Now's the day, and now's the hour — for freedom we stand.",
  gaelic_ireland: "High King of Éire — let the round towers ring from sea to sea.",
  normans: "Greek, Arab, and Latin serve one crown beneath the Sicilian sun.",
  visigoths: "From Toledo I rule both the sword and the law of the Goths.",
  novgorod: "Whoever comes to us with the sword shall perish by the sword.",
  illyrians: "The sea is free to the Illyrians; let Rome learn to swim.",
  lusitani: "Strike from the hills and vanish; Rome shall tire before we do.",
  arevaci: "Numantia does not surrender; we burn before we bow.",
  thracians: "From the Haemus I summon a host no Greek can number.",
  dacians: "Better to die free on Sarmizegetusa than live a slave to Rome.",
  sami: "The reindeer leads, the drum speaks, and the long night is our home.",
  corinth: "Where two seas meet, Corinth takes its toll.",
  thebes: "Strike the strongest wing first, and Sparta's wall will break.",
  eretria: "Our ships carry the alphabet farther than any sword.",
  crete: "No wall stands long against the archers of Crete.",
  indus_valley: "We build by the level and the line; the city itself is our temple.",
  zhou_china: "Heaven has withdrawn its mandate from Shang and given it to Zhou.",
  delhi_sultanate: "I set the price of bread and the price of kings alike.",
  mughals: "Let all faiths sit at one table; the realm is wide enough for every prayer.",
  vijayanagara: "A crowned king should rule with an eye to all his people's welfare.",
  champa: "The sea brings tribute; let Angkor fear the Cham sail.",
  sinhala: "Let not one drop of rain reach the sea unused.",
  khitan: "On horseback we conquer; from the city we rule.",
  jurchen: "As iron breaks the pot, so the Jurchen break the Liao.",
  khazars: "Many roads, many faiths, one toll — all pass the Khazar gate.",
  avars: "Give me your gold, emperor, or give me your provinces.",
  golden_horde: "From Sarai the princes of the Rus come to kneel for their patents.",
  chimu: "In Chan Chan we weave walls of adobe and rivers of gold.",
  moche: "The huaca rises to the sun; in its shadow the lords are gods.",
  tiwanaku: "At the roof of the world, the raised fields feed multitudes.",
  tarascans: "Our copper turns back the Mexica; Michoacán bows to no eagle.",
  taino: "In the areíto we sing the deeds of the caciques and the gods.",
  tonga: "The ocean is no barrier but a road; its islands send their tribute.",
};

for (const civ of CIVILIZATIONS) {
  civ.leaderQuote = LEADER_QUOTES[civ.id];
}

const BY_ID = new Map(CIVILIZATIONS.map((c) => [c.id, c]));

export function getCiv(id: string | undefined): CivDef | undefined {
  return id ? BY_ID.get(id) : undefined;
}

export const CIV_IDS: string[] = CIVILIZATIONS.map((c) => c.id);

// ---- Capital population theme -------------------------------------------------
// Starting UNITS are derived from each civ's unique unit (see startingUnitsFor).
// Here we only mark the fertile river-valley civilizations whose dense early
// populations let the capital found at pop 3 instead of the base 2.
const RIVER_CIVS = new Set([
  "sumer", "akkad", "babylon", "egypt", "kush_nubia", "han_china", "china_tang_song",
  "china_ming", "zhou_china", "maurya", "gupta_india", "indus_valley", "khmer", "aztec",
  "inca", "srivijaya", "majapahit", "dai_viet_vietnam",
]);
for (const civ of CIVILIZATIONS) {
  if (RIVER_CIVS.has(civ.id)) civ.capitalPopulationBonus = 1;
}

// ===========================================================================
// Diplomatic personalities. Each AI civ has a temperament that shapes how it
// conducts diplomacy: some are warlike conquerors, others cautious traders.
// All weights are 0..1. A few notable civs are hand-tuned; every other civ
// gets a deterministic, varied default derived from its id so the world still
// feels diverse without authoring 60+ entries. See diplomacy.ts for use.
// ===========================================================================

export interface DiploPersonality {
  /** How readily it declares war. High = seeks conquest at the slightest edge. */
  aggression: number;
  /** Willingness to fight when NOT overwhelmingly ahead (pride / risk appetite). */
  boldness: number;
  /** Honours deals and pacts; slow to betray or break treaties. */
  loyalty: number;
  /** Recovers attitude faster and sues for peace sooner. */
  forgiveness: number;
  /** Values gold and trade highly; drives a harder bargain and demands more. */
  greed: number;
}

export const DEFAULT_PERSONALITY: DiploPersonality = {
  aggression: 0.45,
  boldness: 0.45,
  loyalty: 0.55,
  forgiveness: 0.5,
  greed: 0.5,
};

/** Hand-tuned temperaments for civs with a strong historical character. */
const PERSONALITIES: Record<string, Partial<DiploPersonality>> = {
  // Conquerors — quick to war, proud, unforgiving.
  mongols: { aggression: 0.95, boldness: 0.9, loyalty: 0.25, forgiveness: 0.2, greed: 0.55 },
  assyria: { aggression: 0.9, boldness: 0.85, loyalty: 0.3, forgiveness: 0.2, greed: 0.5 },
  aztec: { aggression: 0.85, boldness: 0.8, loyalty: 0.35, forgiveness: 0.25, greed: 0.4 },
  huns: { aggression: 0.95, boldness: 0.95, loyalty: 0.2, forgiveness: 0.15, greed: 0.6 },
  sparta: { aggression: 0.8, boldness: 0.95, loyalty: 0.6, forgiveness: 0.3, greed: 0.3 },
  rome: { aggression: 0.7, boldness: 0.75, loyalty: 0.5, forgiveness: 0.4, greed: 0.5 },
  macedon: { aggression: 0.8, boldness: 0.85, loyalty: 0.45, forgiveness: 0.35, greed: 0.45 },
  persia: { aggression: 0.6, boldness: 0.65, loyalty: 0.55, forgiveness: 0.45, greed: 0.6 },
  norse: { aggression: 0.75, boldness: 0.8, loyalty: 0.4, forgiveness: 0.35, greed: 0.7 },
  // Traders & builders — peaceful, pragmatic, loyal.
  carthage: { aggression: 0.4, boldness: 0.5, loyalty: 0.55, forgiveness: 0.55, greed: 0.85 },
  phoenicia: { aggression: 0.3, boldness: 0.4, loyalty: 0.65, forgiveness: 0.65, greed: 0.85 },
  lydia: { aggression: 0.3, boldness: 0.4, loyalty: 0.6, forgiveness: 0.6, greed: 0.9 },
  egypt: { aggression: 0.35, boldness: 0.45, loyalty: 0.7, forgiveness: 0.6, greed: 0.55 },
  maurya: { aggression: 0.3, boldness: 0.45, loyalty: 0.75, forgiveness: 0.75, greed: 0.45 },
  mali: { aggression: 0.3, boldness: 0.4, loyalty: 0.7, forgiveness: 0.65, greed: 0.8 },
  han_china: { aggression: 0.45, boldness: 0.5, loyalty: 0.7, forgiveness: 0.6, greed: 0.55 },
  greece: { aggression: 0.45, boldness: 0.55, loyalty: 0.6, forgiveness: 0.55, greed: 0.5 },
  babylon: { aggression: 0.35, boldness: 0.45, loyalty: 0.65, forgiveness: 0.6, greed: 0.55 },
  sumer: { aggression: 0.5, boldness: 0.5, loyalty: 0.55, forgiveness: 0.5, greed: 0.5 },
};

/** Tiny deterministic string hash → [0,1), so unlisted civs still vary. */
function hash01(s: string, salt: number): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  }
  // map to [0,1)
  return ((h >>> 0) % 1000) / 1000;
}

const PERSONALITY_CACHE = new Map<string, DiploPersonality>();

/**
 * The diplomatic temperament for a civ. Hand-tuned where defined; otherwise a
 * deterministic spread around the default so each civ behaves a little
 * differently. Always returns a full personality (never undefined).
 */
export function getPersonality(civId: string | undefined): DiploPersonality {
  const id = civId ?? "__none__";
  const cached = PERSONALITY_CACHE.get(id);
  if (cached) return cached;
  const tuned = civId ? PERSONALITIES[civId] : undefined;
  // Deterministic jitter (±0.2) around each field's default when not hand-set.
  const jitter = (base: number, salt: number) =>
    Math.max(0, Math.min(1, base + (hash01(id, salt) - 0.5) * 0.4));
  const p: DiploPersonality = {
    aggression: tuned?.aggression ?? jitter(DEFAULT_PERSONALITY.aggression, 1),
    boldness: tuned?.boldness ?? jitter(DEFAULT_PERSONALITY.boldness, 2),
    loyalty: tuned?.loyalty ?? jitter(DEFAULT_PERSONALITY.loyalty, 3),
    forgiveness: tuned?.forgiveness ?? jitter(DEFAULT_PERSONALITY.forgiveness, 4),
    greed: tuned?.greed ?? jitter(DEFAULT_PERSONALITY.greed, 5),
  };
  PERSONALITY_CACHE.set(id, p);
  return p;
}

/** A short label describing a civ's diplomatic temperament (for the UI). */
export function personalityLabel(p: DiploPersonality): string {
  if (p.aggression >= 0.75) return "Warmongering";
  if (p.aggression >= 0.6) return "Aggressive";
  if (p.greed >= 0.8) return "Mercantile";
  if (p.aggression <= 0.35 && p.forgiveness >= 0.6) return "Peaceful";
  if (p.loyalty >= 0.7) return "Honourable";
  return "Pragmatic";
}

// ===========================================================================
// Unique units. Each civ's unique unit "reskins" a base unit it replaces:
// when that civ builds (or fields) the base unit it gets the unique name, art
// (keyed by `id`), and a flat combat bonus. `replaces` is a base UnitTypeId
// from packages/sim/src/game/content.ts (kept as a string so @roc/data stays
// dependency-free). Resolved by owner-civ at read time — see uniqueUnitForCiv.
// ===========================================================================

export interface UniqueUnitDef {
  /** Art/lookup key, e.g. "rome_legionary". Filename: client public/units/<id>.png. */
  id: string;
  civId: string;
  name: string;
  /** Base UnitTypeId this unit replaces for its civ. */
  replaces: string;
  /** Flat combat bonus (added to strength, or ranged strength for ranged units). */
  bonus: number;
}

// Primary strength of each base unit a unique unit may replace (melee/cavalry/naval
// use combat strength; ranged use ranged strength). Mirrors UNIT_DEFS in the sim —
// kept here only to scale the unique-unit bonus, so @roc/data stays dependency-free.
const BASE_UNIT_PRIMARY: Record<string, number> = {
  warrior: 8, slinger: 7, javelineer: 8, hunter: 7, light_chariot: 9, archer: 11,
  axeman: 13, maceman: 11, spearman: 11, hoplite: 13, war_chariot: 13, rider: 10,
  horse_archer: 9, battering_ram: 10, swordsman: 15, longswordsman: 18, pikeman: 14,
  cataphract: 17, crossbowman: 14, legionary: 15, war_elephant: 16, catapult: 14,
  ballista: 16, galley: 10, bireme: 14, trireme: 16, quinquereme: 20, longship: 12,
  caravel: 14, dromon: 14, war_junk: 16, galleass: 18, galleon: 20,
};

/** Unique-unit combat bonus scaled by base-unit strength so a flat boost is fair
 *  across eras: cheap/early bases (≤8) get +2, mid (9–15) +3, heavy/late (≥16) +4. */
function scaledUuBonus(replaces: string): number {
  const p = BASE_UNIT_PRIMARY[replaces] ?? 11;
  return p <= 8 ? 2 : p >= 16 ? 4 : 3;
}

function uu(civId: string, name: string, replaces: string, bonus = scaledUuBonus(replaces), idName = name): UniqueUnitDef {
  // The art/lookup id is derived from `idName` (defaults to `name`). Passing an
  // explicit `idName` lets the display `name` carry a civ prefix (e.g. "Roman
  // Legionary") while keeping a stable id (rome_legionary) for art and overrides.
  const slug = idName
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
  return { id: `${civId}_${slug}`, civId, name, replaces, bonus };
}

export const UNIQUE_UNITS: UniqueUnitDef[] = [
  // Mesopotamia & Near East
  uu("sumer", "War-Cart", "light_chariot"),
  uu("akkad", "Sargonic Guard", "axeman"),
  uu("babylon", "Bowman", "archer"),
  uu("assyria", "Siege Tower", "battering_ram"),
  uu("hittites", "Hittite Chariot", "war_chariot"),
  uu("elam", "Susian Archer", "archer"),
  uu("phoenicia", "Phoenician Bireme", "galley", 3, "Bireme"),
  uu("lydia", "Heavy Cavalry", "cataphract"),
  // Persia & Iran
  uu("median_empire", "Median Lancer", "cataphract"),
  uu("persia", "Immortal", "spearman"),
  uu("parthia", "Parthian Horse Archer", "horse_archer"),
  uu("sassanid_persia", "Savaran Cataphract", "cataphract"),
  // Egypt & Africa
  uu("egypt", "Maryannu Chariot", "war_chariot"),
  uu("kush_nubia", "Nubian Archer", "archer"),
  uu("carthage", "Carthaginian War Elephant", "war_elephant", 4, "War Elephant"),
  uu("aksum", "Aksumite Spearman", "spearman"),
  uu("ethiopia_zagwe", "Oromo Cavalry", "rider"),
  uu("mali", "Mandekalu Cavalry", "cataphract"),
  uu("ghana_empire", "Soninke Warrior", "swordsman"),
  uu("songhai", "Songhai Cavalry", "rider"),
  uu("great_zimbabwe", "Zimbabwe Spearman", "spearman"),
  uu("kanem_bornu", "Kanembu Guard", "spearman"),
  // Mediterranean & Europe
  uu("minoans", "Minoan Bireme", "galley"),
  uu("mycenaean_greece", "Mycenaean Spearman", "spearman"),
  uu("greece", "Greek Hoplite", "spearman", 3, "Hoplite"),
  uu("sparta", "Spartan Hoplite", "hoplite"),
  uu("macedon", "Hypaspist", "swordsman"),
  uu("etruscans", "Etruscan Hoplite", "hoplite"),
  uu("rome", "Roman Legionary", "swordsman", 3, "Legionary"),
  uu("celts_gauls", "Gaesatae", "axeman"),
  uu("byzantium", "Byzantine Cataphract", "cataphract", 4, "Cataphract"),
  uu("norse", "Norse Longship", "longship", 3, "Longship"),
  uu("franks", "Frankish Paladin", "cataphract"),
  uu("goths", "Gothic Rider", "cataphract"),
  uu("anglo_saxon_england", "Longbowman", "crossbowman"),
  uu("france", "Garde Écossaise", "cataphract"),
  uu("castile_spain", "Conquistador", "cataphract"),
  uu("portugal", "Nau", "caravel"),
  uu("venice", "Venetian Galleass", "galleass"),
  uu("genoa", "Genoese Crossbowman", "crossbowman"),
  uu("dutch_republic", "Sea Beggar", "galleass"),
  uu("holy_roman_empire", "Landsknecht", "pikeman"),
  uu("kievan_rus", "Druzhina", "cataphract"),
  uu("poland_lithuania", "Winged Hussar", "cataphract"),
  uu("hungary", "Black Army", "cataphract"),
  // Central, South & East Asia
  uu("han_china", "Cho-Ko-Nu", "crossbowman"),
  uu("china_tang_song", "Fire Lancer", "pikeman"),
  uu("china_ming", "Ming War Junk", "war_junk", 4, "War Junk"),
  uu("maurya", "Mauryan War Elephant", "war_elephant", 4, "War Elephant"),
  uu("gupta_india", "Gupta Elephant Archer", "war_elephant"),
  uu("chola", "Chola Warship", "trireme"),
  uu("japan", "Samurai", "longswordsman"),
  uu("korea", "Turtle Ship", "war_junk"),
  uu("tibet", "Tibetan Cavalry", "rider"),
  uu("dai_viet_vietnam", "Voi Chiến", "war_elephant"),
  uu("khmer", "Domrey", "war_elephant"),
  uu("srivijaya", "Jong", "bireme"),
  uu("majapahit", "Majapahit Jong", "trireme"),
  uu("pagan_burma", "Burmese War Elephant", "war_elephant"),
  uu("ayutthaya_siam", "Siamese War Elephant", "war_elephant"),
  // Steppe & Turkic
  uu("scythians", "Scythian Horse Archer", "horse_archer"),
  uu("xiongnu", "Xiongnu Horse Archer", "horse_archer"),
  uu("huns", "Hunnic Horde", "horse_archer"),
  uu("gokturks", "Turkic Lancer", "cataphract"),
  uu("seljuks", "Ghulam", "cataphract"),
  uu("mongols", "Keshig", "horse_archer"),
  uu("timurids", "Timurid Siege Train", "catapult"),
  uu("ottomans", "Janissary", "crossbowman"),
  // The Americas
  uu("olmec", "Olmec Spearman", "spearman"),
  uu("maya", "Holkan", "javelineer"),
  uu("zapotec", "Zapotec Warrior", "swordsman"),
  uu("teotihuacan", "Pyramid Guard", "spearman"),
  uu("toltec", "Toltec Warrior", "swordsman"),
  uu("aztec", "Eagle Warrior", "warrior"),
  uu("inca", "Warak'aq", "slinger"),
  uu("muisca", "Guecha Warrior", "swordsman"),
  uu("mississippian_cahokia", "Cahokian Warrior", "axeman"),
  uu("haudenosaunee", "Mohawk Warrior", "swordsman"),
  uu("pueblo", "Pueblo Skirmisher", "javelineer"),
  // Oceania
  uu("polynesia", "Koa Warrior", "warrior"),
  uu("maori", "Toa", "warrior"),
  uu("hawaii", "Hawaiian Koa", "warrior"),

  // ---- Expansion roster ----
  uu("arabia", "Camel Archer", "horse_archer"),
  uu("israelites", "Gibborim", "swordsman"),
  uu("nabataeans", "Desert Raider", "rider"),
  uu("saba", "Sabaean Spearman", "spearman"),
  uu("mitanni", "Maryannu Chariot", "war_chariot"),
  uu("urartu", "Urartian Charioteer", "war_chariot"),
  uu("greco_bactria", "Bactrian Cataphract", "cataphract"),
  uu("sogdia", "Sogdian Cavalry", "rider"),
  uu("khwarazm", "Khwarazmian Lancer", "cataphract"),
  uu("numidia", "Numidian Cavalry", "horse_archer"),
  uu("fatimids", "Fatimid Ghulam", "cataphract"),
  uu("ayyubids", "Ayyubid Faris", "cataphract"),
  uu("mamluks", "Mamluk", "cataphract"),
  uu("almoravids", "Lamtuna Spearman", "spearman"),
  uu("swahili", "Swahili Dhow", "bireme"),
  uu("benin", "Ogboni Guard", "swordsman"),
  uu("kongo", "Kongo Archer", "archer"),
  uu("bulgaria", "Bulgar Horse Archer", "horse_archer"),
  uu("serbia", "Pronoia Knight", "cataphract"),
  uu("bohemia", "Hussite War Wagon", "crossbowman"),
  uu("swiss", "Swiss Halberdier", "pikeman"),
  uu("aragon", "Almogàver", "javelineer"),
  uu("scotland", "Highland Schiltron", "pikeman"),
  uu("gaelic_ireland", "Gallowglass", "longswordsman"),
  uu("normans", "Norman Knight", "cataphract"),
  uu("visigoths", "Visigothic Noble", "cataphract"),
  uu("novgorod", "Ushkuinik", "longship"),
  uu("illyrians", "Liburnian", "bireme"),
  uu("lusitani", "Falcata Warrior", "swordsman"),
  uu("arevaci", "Celtiberian Warrior", "swordsman"),
  uu("thracians", "Thracian Peltast", "javelineer"),
  uu("dacians", "Falxman", "longswordsman"),
  uu("sami", "Ski Raider", "hunter"),
  uu("corinth", "Corinthian Trireme", "trireme"),
  uu("thebes", "Sacred Band", "hoplite"),
  uu("eretria", "Penteconter", "galley"),
  uu("crete", "Cretan Archer", "archer"),
  uu("indus_valley", "Harappan Spearman", "spearman"),
  uu("zhou_china", "Zhou Chariot", "war_chariot"),
  uu("delhi_sultanate", "Delhi War Elephant", "war_elephant"),
  uu("mughals", "Mughal Sowar", "cataphract"),
  uu("vijayanagara", "Vijayanagara War Elephant", "war_elephant"),
  uu("champa", "Cham Raider", "bireme"),
  uu("sinhala", "Sinhala War Elephant", "war_elephant"),
  uu("khitan", "Ordo Cavalry", "cataphract"),
  uu("jurchen", "Iron Pagoda", "cataphract"),
  uu("khazars", "Khazar Lancer", "cataphract"),
  uu("avars", "Avar Lancer", "cataphract"),
  uu("golden_horde", "Tatar Horse Archer", "horse_archer"),
  uu("chimu", "Chimú Slinger", "slinger"),
  uu("moche", "Moche Warrior", "warrior"),
  uu("tiwanaku", "Tiwanaku Spearman", "spearman"),
  uu("tarascans", "Copper Macehead", "maceman"),
  uu("taino", "Guaribo Slinger", "javelineer"),
  uu("tonga", "Tongan Toa", "warrior"),
];

const UU_BY_ID = new Map(UNIQUE_UNITS.map((u) => [u.id, u]));
const UU_BY_CIV_BASE = new Map(UNIQUE_UNITS.map((u) => [`${u.civId}|${u.replaces}`, u]));

/** The unique unit a civ fields in place of `baseType`, if any. */
export function uniqueUnitForCiv(civId: string | undefined, baseType: string): UniqueUnitDef | undefined {
  if (!civId) return undefined;
  return UU_BY_CIV_BASE.get(`${civId}|${baseType}`);
}

export function getUniqueUnit(id: string | undefined): UniqueUnitDef | undefined {
  return id ? UU_BY_ID.get(id) : undefined;
}

export const UNIQUE_UNIT_IDS: string[] = UNIQUE_UNITS.map((u) => u.id);

// ===========================================================================
// Unique Infrastructure. Each civ fields ONE unique building OR tile improvement —
// an EXTRA piece of infrastructure, never a replacement for an existing one.
//   • Buildings are produced in a city's build queue (offered only to the owning
//     civ once its reqTech is known). They add flat host-city yields and, while at
//     least one of the civ's cities has one, optionally apply rich empire-wide
//     CivEffects.
//   • Improvements are built on owned tiles by city specialists (the Works system),
//     and add worked-tile yields. Like the economic ladders they upgrade through
  //     three tiers — the def yields here are the tier-1 base, and each higher tier adds
  //     +2 to every yield it produces, a steeper curve than generic improvements (+1/tier)
  //     that rewards the investment (see sim improvements.ts uniqueImpYieldsAt).
// Resolved by owner civ at read time, mirroring UNIQUE_UNITS. Loose tech-id strings
// keep @roc/data dependency-free.
// ===========================================================================

export type UniqueInfraKind = "building" | "improvement";

export interface UniqueInfraDef {
  /** Art/lookup id, e.g. "sumer_ziggurat". Filename: buildings|improvements/<id>.png. */
  id: string;
  civId: string;
  name: string;
  kind: UniqueInfraKind;
  /** Tech that unlocks it (loose id from the sim's TechId set). */
  reqTech: string;
  /** Player-facing one-line summary (generated when not overridden). */
  desc: string;
  /** Subject text for the art generator. */
  art: string;
  /** Production cost (buildings only; improvements use Works labour). */
  cost: number;
  /** Flat per-turn yields: host city (building) or worked tile (improvement). */
  yields: CityYieldBonus;
  /** Empire-wide bonuses applied while the owner has built this (buildings only). */
  effects?: CivEffects;
  /** Terrains the improvement may be built on (improvements only). */
  terrain?: string[];
  /** Specialist craft that builds the improvement (improvements only). */
  discipline?: "carpentry" | "masonry" | "survey";
  /** Buildings only: may only be constructed in a coastal city (adjacent to ocean/lake). */
  requiresCoastal?: boolean;
}

type InfraOverride = Partial<Omit<UniqueInfraDef, "id" | "civId" | "name">>;

/** Per-civ overrides: which infra are tile improvements, and bespoke yields/effects.
 *  Any civ not listed gets a default themed BUILDING derived from its identity. */
const INFRA_OVERRIDES: Record<string, InfraOverride> = {
  // ---- tile improvements (built on territory tiles via Works) -------------
  inca: { kind: "improvement", reqTech: "irrigation", terrain: ["hills", "grassland", "plains"], discipline: "carpentry", yields: { food: 2 }, art: "an Inca terraced farm carved into a steep hillside with stone retaining walls and rows of crops" },
  dutch_republic: { kind: "improvement", reqTech: "engineering", terrain: ["grassland", "plains"], discipline: "survey", yields: { food: 1, production: 1 }, art: "a Dutch polder: reclaimed farmland behind an earthen dyke with a drainage windmill" },
  france: { kind: "improvement", reqTech: "masonry", terrain: ["grassland", "plains", "hills"], discipline: "masonry", yields: { gold: 2 }, art: "a French château estate with a turreted manor house and vineyards" },
  maurya: { kind: "improvement", reqTech: "irrigation", terrain: ["plains", "grassland", "desert"], discipline: "masonry", yields: { food: 1, faith: 1 }, art: "an Indian stepwell with symmetric descending stone steps down to groundwater" },
  nabataeans: { kind: "improvement", reqTech: "masonry", terrain: ["desert"], discipline: "survey", yields: { food: 1, gold: 1 }, art: "a Nabataean rock-cut desert cistern collecting and storing water" },
  saba: { kind: "improvement", reqTech: "irrigation", terrain: ["desert", "plains"], discipline: "survey", yields: { food: 2 }, art: "the great Marib dam: an ancient earthen-and-stone irrigation dam across a wadi" },
  sinhala: { kind: "improvement", reqTech: "irrigation", terrain: ["grassland", "plains"], discipline: "survey", yields: { food: 2 }, art: "a Sinhala wewa: a large ancient reservoir tank with an earthen bund and sluice" },
  vijayanagara: { kind: "improvement", reqTech: "irrigation", terrain: ["grassland", "plains"], discipline: "survey", yields: { food: 1, faith: 1 }, art: "a South Indian stone temple tank: a stepped rectangular sacred water tank" },
  mississippian_cahokia: { kind: "improvement", reqTech: "masonry", terrain: ["grassland", "plains"], discipline: "masonry", yields: { faith: 2 }, art: "a Mississippian earthwork platform mound with a flat top and ramp" },
  scythians: { kind: "improvement", reqTech: "masonry", terrain: ["plains", "grassland", "tundra"], discipline: "masonry", yields: { faith: 2 }, art: "a Scythian kurgan: a large steppe burial mound of earth and stone" },
  aksum: { kind: "improvement", reqTech: "masonry", terrain: ["plains", "hills"], discipline: "masonry", yields: { faith: 2 }, art: "towering carved Aksumite stelae (granite obelisks) standing on a plateau" },
  gokturks: { kind: "improvement", reqTech: "masonry", terrain: ["plains", "hills", "tundra"], discipline: "masonry", yields: { faith: 2 }, art: "a Göktürk stone stele with runic inscriptions on the open steppe" },
  olmec: { kind: "improvement", reqTech: "masonry", terrain: ["grassland", "plains", "jungle"], discipline: "masonry", yields: { faith: 2 }, art: "a colossal Olmec carved basalt head set in tropical lowland" },
  egypt: { kind: "improvement", reqTech: "masonry", terrain: ["desert", "plains"], discipline: "masonry", yields: { faith: 2 }, art: "a tall carved ancient Egyptian obelisk: a slender tapering stone pillar covered in hieroglyphs, topped with a small pyramidion" },
  kush_nubia: { kind: "improvement", reqTech: "masonry", terrain: ["desert"], discipline: "masonry", yields: { faith: 1, gold: 1 }, art: "a steep-sided Nubian pyramid of the Kushite kings at Meroë" },
  celts_gauls: { kind: "improvement", reqTech: "masonry", terrain: ["hills", "forest"], discipline: "masonry", yields: { production: 1, gold: 1 }, art: "a Celtic oppidum: a timber-and-earth rampart hillfort with a wooden gate" },
  benin: { kind: "improvement", reqTech: "masonry", terrain: ["grassland", "plains", "forest"], discipline: "masonry", yields: { production: 2 }, art: "the Walls of Benin: vast earthwork ramparts and ditches around farmland" },
  mongols: { kind: "improvement", reqTech: "equestrian", terrain: ["plains", "grassland", "tundra"], discipline: "carpentry", yields: { production: 1, gold: 1 }, art: "a Mongol ordu: a royal camp of round felt gers (yurts) on the steppe" },
  huns: { kind: "improvement", reqTech: "equestrian", terrain: ["plains", "grassland", "tundra"], discipline: "carpentry", yields: { production: 1, gold: 1 }, art: "a Hunnic ordu encampment of hide tents and horse corrals on the plains" },
  xiongnu: { kind: "improvement", reqTech: "equestrian", terrain: ["plains", "grassland", "tundra"], discipline: "carpentry", yields: { food: 1, production: 1 }, art: "a Xiongnu felt-tent steppe camp with grazing horses" },

  // ---- flagship buildings with rich empire-wide effects (reqTech: INFRA_REQ_TECH) --
  babylon: { yields: { science: 1 }, effects: { yieldPercent: { science: 5 } }, desc: "Unique building — +1 science here and +5% science empire-wide." },
  han_china: { yields: { culture: 1 }, effects: { yieldPercent: { production: 5 } }, desc: "Unique building — +1 culture here and +5% production empire-wide." },
  carthage: { requiresCoastal: true, yields: { gold: 2 }, effects: { navalMovementBonus: 1 }, desc: "Unique building — +2 gold and naval units +1 movement empire-wide (coastal cities only)." },
  phoenicia: { requiresCoastal: true, yields: { gold: 3 }, effects: { navalMovementBonus: 1 }, desc: "Unique building — +3 gold and naval units +1 movement empire-wide (coastal cities only)." },
  elam: { yields: { faith: 2, science: 1 }, effects: { yieldPercent: { science: 5 } }, desc: "Unique building — +2 faith, +1 science, and +5% science empire-wide." },
  hittites: { yields: { production: 2 }, effects: { unitClassCombat: { melee: 1 } }, desc: "Unique building — +2 production and melee units +1 strength empire-wide." },
  median_empire: { yields: { production: 2 }, effects: { unitClassCombat: { cavalry: 1 } }, desc: "Unique building — +2 production and cavalry units +1 strength empire-wide." },
  greco_bactria: { yields: { science: 2, culture: 1 }, effects: { yieldPercent: { science: 5 } }, desc: "Unique building — +2 science, +1 culture, and +5% science empire-wide." },
  portugal: { requiresCoastal: true, yields: { gold: 3 }, effects: { tradeRouteGoldBonus: 2 }, desc: "Unique building — +3 gold and +2 gold per trade route empire-wide (coastal cities only)." },
  sparta: { yields: { production: 2 }, desc: "Unique building — +2 production." },
  rome: { yields: { culture: 1, food: 1 }, effects: { yieldPercent: { culture: 10 } }, desc: "Unique building — +1 culture, +1 food, and +10% culture empire-wide." },
  greece: { yields: { culture: 2, science: 1 }, desc: "Unique building — +2 culture and +1 science." },
  norse: { yields: { faith: 2, culture: 1 }, desc: "Unique building — +2 faith and +1 culture." },

  // ---- coastal-only buildings (harbours, shipyards, sea-trade posts) ------
  // These are maritime structures that only make sense in a city on the water,
  // so they may only be built in a coastal city (adjacent to ocean/lake). Their
  // default themed yields/desc are kept — only the coastal gate is added.
  corinth: { requiresCoastal: true },       // Diolkos — ship-hauling trackway between two seas
  venice: { requiresCoastal: true },        // Arsenale — the great naval shipyard
  majapahit: { requiresCoastal: true },     // Harbor-Temple — the archipelago's sea gate
  swahili: { requiresCoastal: true },       // Husuni Kubwa — the Kilwa island trade palace
  eretria: { requiresCoastal: true },       // Emporion — the Euboean maritime trading colony
};

/** Slugify a name into a stable art/lookup id (matches the unique-unit scheme). */
function infraSlug(civId: string, name: string): string {
  const slug = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
  return `${civId}_${slug}`;
}

const INFRA_YIELD_KEYS = ["food", "production", "gold", "science", "culture", "faith"] as const;

/** A default flat building yield themed to the civ's strongest passive yield. */
function themeBuildingYields(civ: CivDef): CityYieldBonus {
  const yp = civ.effects.yieldPercent;
  if (yp) {
    let bestK: keyof CityYieldBonus | undefined;
    let bestV = 0;
    for (const k of INFRA_YIELD_KEYS) {
      const v = yp[k] ?? 0;
      if (v > bestV) { bestV = v; bestK = k; }
    }
    if (bestK) return { [bestK]: bestK === "gold" ? 3 : 2 };
  }
  if (civ.effects.unitClassCombat) return { production: 2 };
  return { production: 2 };
}

function fmtInfraYields(y: CityYieldBonus): string {
  const parts = INFRA_YIELD_KEYS.filter((k) => y[k]).map((k) => `+${y[k]} ${k}`);
  return parts.length <= 1 ? parts.join("") : parts.slice(0, -1).join(", ") + " and " + parts.at(-1);
}

function describeInfra(def: UniqueInfraDef): string {
  const ys = fmtInfraYields(def.yields);
  if (def.kind === "improvement") {
    const where = def.terrain?.length ? ` on ${def.terrain.join("/")} tiles` : "";
    return `Unique tile improvement${where} — worked yields ${ys || "vary"}.`;
  }
  let s = `Unique building — ${ys || "no base yields"}`;
  if (def.effects) s += ", plus empire bonuses while standing";
  if (def.requiresCoastal) s += " (coastal cities only)";
  return s + ".";
}

/**
 * Tech that unlocks each civ's unique BUILDING, chosen by what the structure is and
 * its historical context — so the research path to a civ's signature building is
 * diverse rather than uniformly Masonry. Single source of truth for building tech
 * gates (tile improvements keep their reqTech in INFRA_OVERRIDES). Comment = building.
 */
const INFRA_REQ_TECH: Record<string, string> = {
  // Mesopotamia & the Near East
  sumer: "monumental_architecture", // Ziggurat
  akkad: "writing", // Palace Archive
  babylon: "masonry", // Walls of Babylon
  assyria: "writing", // Royal Library
  hittites: "ritual_burial", // Storm Temple
  elam: "masonry", // Chogha Zanbil (a masonry ziggurat)
  phoenicia: "sailing", // Cothon (war harbor)
  lydia: "coinage", // Mint (Lydia struck the first coins)
  // Persia & Iran
  median_empire: "equestrian", // Royal Stable
  persia: "irrigation", // Pairidaeza (paradise garden)
  parthia: "the_wheel", // Caravanserai
  sassanid_persia: "ritual_burial", // Fire Temple
  // Egypt & Africa
  carthage: "sailing", // Cothon (war harbor)
  ethiopia_zagwe: "masonry", // Rock-Hewn Church (carved from living rock)
  mali: "coinage", // Suguba (great market)
  ghana_empire: "coinage", // Gold Market
  songhai: "sailing", // River Port
  great_zimbabwe: "masonry", // Great Enclosure (dry-stone walls)
  kanem_bornu: "the_wheel", // Sahel Caravan Post
  // Mediterranean & Europe
  minoans: "masonry", // Labyrinth Palace
  mycenaean_greece: "masonry", // Megaron
  greece: "monumental_architecture", // Acropolis
  sparta: "bronze_alloying", // Syssitia (warrior mess)
  macedon: "philosophy", // Basilikoi Paides (royal school of pages)
  etruscans: "ritual_burial", // Tumulus (burial mound)
  rome: "engineering", // Roman Bath
  byzantium: "the_wheel", // Hippodrome (chariot racing)
  norse: "ritual_burial", // Stave Church
  franks: "ritual_burial", // Palatine Chapel
  goths: "the_wheel", // Wagon Fort
  anglo_saxon_england: "masonry", // Manor House
  castile_spain: "ritual_burial", // Mission
  portugal: "astronomy", // Feitoria (age-of-exploration trade post)
  venice: "shipbuilding", // Arsenale (great shipyard)
  genoa: "coinage", // Banco (bank)
  holy_roman_empire: "coinage", // Hansa (trade league)
  kievan_rus: "ritual_burial", // Lavra (monastery)
  poland_lithuania: "coinage", // Sukiennice (cloth hall)
  hungary: "engineering", // Thermal Bath
  // Central, South & East Asia
  han_china: "masonry", // Great Wall
  china_tang_song: "philosophy", // Imperial Examination Hall
  china_ming: "monumental_architecture", // Porcelain Tower
  gupta_india: "philosophy", // University-Temple (Nalanda)
  chola: "monumental_architecture", // Brihadeeswara Temple
  japan: "masonry", // Tenshu Castle
  korea: "philosophy", // Seowon (Confucian academy)
  tibet: "monumental_architecture", // Potala
  dai_viet_vietnam: "masonry", // Thành (citadel)
  khmer: "ritual_burial", // Prasat (temple tower)
  srivijaya: "ritual_burial", // Candi
  majapahit: "sailing", // Harbor-Temple
  pagan_burma: "ritual_burial", // Pagoda
  ayutthaya_siam: "ritual_burial", // Wat
  // Steppe & Turkic
  seljuks: "philosophy", // Madrasa
  timurids: "monumental_architecture", // Registan
  ottomans: "coinage", // Grand Bazaar
  // The Americas
  maya: "mathematics", // Observatory (Maya astronomy WAS its mathematics — the zero, the Long Count)
  zapotec: "ritual_burial", // Danzante Temple
  teotihuacan: "monumental_architecture", // Avenue of the Dead
  toltec: "masonry", // Atlantean Hall
  aztec: "ritual_burial", // Tlachtli (ritual ball court)
  muisca: "ritual_burial", // Salt Temple
  haudenosaunee: "cultivation", // Longhouse
  pueblo: "masonry", // Cliff Palace
  // Oceania
  polynesia: "ritual_burial", // Marae (sacred ground)
  maori: "masonry", // Pā (fortified village)
  hawaii: "ritual_burial", // Heiau (temple)
  // Near East & Arabia (expansion)
  arabia: "philosophy", // House of Wisdom
  israelites: "ritual_burial", // First Temple
  mitanni: "equestrian", // Kikkuli Stables (horse-training manual)
  urartu: "masonry", // Fortress of Van
  // Persia & Central Asia (expansion)
  greco_bactria: "philosophy", // Gymnasion
  sogdia: "the_wheel", // Caravanserai (Silk Road)
  khwarazm: "coinage", // Gurganj Bazaar
  // North Africa & Islamic Mediterranean (expansion)
  numidia: "equestrian", // Royal Horse Market
  fatimids: "philosophy", // Al-Azhar (great teaching mosque)
  ayyubids: "engineering", // Citadel of Cairo
  mamluks: "equestrian", // Maydan (cavalry parade ground)
  almoravids: "masonry", // Ribat (fortified monastery)
  // Sub-Saharan Africa (expansion)
  swahili: "coinage", // Husuni Kubwa (great trade palace)
  kongo: "masonry", // Mbanza (royal capital)
  // Mediterranean & Europe (expansion)
  bulgaria: "masonry", // Preslav Court
  serbia: "masonry", // Despot's Hall
  bohemia: "coinage", // Kutná Hora Mint
  swiss: "parley", // Rütli Meadow (the founding oath)
  aragon: "coinage", // Llotja (commodities exchange)
  scotland: "masonry", // Tower House
  gaelic_ireland: "ritual_burial", // Round Tower (monastic)
  normans: "ritual_burial", // Palatine Chapel
  visigoths: "writing", // Hall of Toledo (church councils & law)
  novgorod: "coinage", // Veche Bell (merchant republic)
  // European tribal peoples (expansion)
  illyrians: "masonry", // Gradina (hillfort)
  lusitani: "masonry", // Castro (hillfort)
  arevaci: "masonry", // Murallas de Numancia (walls)
  thracians: "ritual_burial", // Thracian Tomb
  dacians: "masonry", // Murus Dacicus (fortification)
  sami: "animal_taming", // Siida Camp (reindeer herding)
  // Greek city-states (expansion)
  corinth: "the_wheel", // Diolkos (paved ship-portage trackway)
  thebes: "masonry", // Cadmea (citadel)
  eretria: "coinage", // Emporion (trading port)
  crete: "writing", // Gortyn Code (great law inscription)
  // South & East Asia (expansion)
  indus_valley: "masonry", // Great Bath
  zhou_china: "ritual_burial", // Ancestral Temple
  delhi_sultanate: "irrigation", // Hauz (reservoir)
  mughals: "masonry", // Red Fort
  champa: "ritual_burial", // My Son Tower (temple towers)
  khitan: "equestrian", // Ordo Camp
  jurchen: "equestrian", // Meng'an Garrison
  // Steppe & Turkic (expansion)
  khazars: "masonry", // Sarkel Fortress
  avars: "masonry", // Hring (ring fortress)
  golden_horde: "equestrian", // Yam Relay (horse-post network)
  // Americas (expansion)
  chimu: "masonry", // Chan Chan Citadel
  moche: "ritual_burial", // Huaca (adobe temple)
  tiwanaku: "monumental_architecture", // Akapana Pyramid
  tarascans: "ritual_burial", // Yácata (stepped pyramid)
  taino: "ritual_burial", // Batey (ceremonial ball court)
  tonga: "ritual_burial", // Langi (royal tombs)
};

export const UNIQUE_INFRA: UniqueInfraDef[] = CIVILIZATIONS.map((civ) => {
  const o = INFRA_OVERRIDES[civ.id] ?? {};
  const kind: UniqueInfraKind = o.kind ?? "building";
  const name = civ.uniqueInfra;
  const def: UniqueInfraDef = {
    id: infraSlug(civ.id, name),
    civId: civ.id,
    name,
    kind,
    reqTech: kind === "improvement"
      ? (o.reqTech ?? "irrigation")
      : (INFRA_REQ_TECH[civ.id] ?? o.reqTech ?? "masonry"),
    cost: o.cost ?? 30,
    yields: o.yields ?? (kind === "building" ? themeBuildingYields(civ) : { food: 1 }),
    effects: o.effects,
    terrain: o.terrain ?? (kind === "improvement" ? ["grassland", "plains"] : undefined),
    discipline: o.discipline ?? (kind === "improvement" ? "carpentry" : undefined),
    requiresCoastal: o.requiresCoastal,
    art: o.art ?? `${name}, the unique ${kind === "improvement" ? "tile improvement" : "building"} of ${civ.name}`,
    desc: "",
  };
  def.desc = o.desc ?? describeInfra(def);
  return def;
});

const UI_BY_CIV = new Map(UNIQUE_INFRA.map((u) => [u.civId, u]));
const UI_BY_ID = new Map(UNIQUE_INFRA.map((u) => [u.id, u]));

/** The unique infrastructure a civ fields (one per civ). */
export function uniqueInfraForCiv(civId: string | undefined): UniqueInfraDef | undefined {
  return civId ? UI_BY_CIV.get(civId) : undefined;
}
export function getUniqueInfra(id: string | undefined): UniqueInfraDef | undefined {
  return id ? UI_BY_ID.get(id) : undefined;
}
/** The civ's unique building, if its infra is a building. */
export function uniqueBuildingForCiv(civId: string | undefined): UniqueInfraDef | undefined {
  const u = uniqueInfraForCiv(civId);
  return u && u.kind === "building" ? u : undefined;
}
/** The civ's unique tile improvement, if its infra is an improvement. */
export function uniqueImprovementForCiv(civId: string | undefined): UniqueInfraDef | undefined {
  const u = uniqueInfraForCiv(civId);
  return u && u.kind === "improvement" ? u : undefined;
}
/** All unique tile-improvement defs (kind === "improvement"). */
export const UNIQUE_IMPROVEMENTS: UniqueInfraDef[] = UNIQUE_INFRA.filter((u) => u.kind === "improvement");
/** All unique building defs (kind === "building"). */
export const UNIQUE_INFRA_BUILDINGS: UniqueInfraDef[] = UNIQUE_INFRA.filter((u) => u.kind === "building");

// ===========================================================================
// Civics tree, governments and policies (the culture-funded parallel tree).
// ===========================================================================

// Base culture costs. The *effective* cost climbs with each civic already
// adopted (see CIVIC_COST_ESCALATION / civicCost) so the short tree can't be
// cleared in a handful of turns by an empire's passive culture trickle.
export const CIVICS: CivicDef[] = [
  { id: "code_of_laws", name: "Code of Laws", cost: 0, prereqs: [], unlocksGovernment: "chiefdom", unlocksPolicy: "discipline" },
  { id: "craftsmanship", name: "Craftsmanship", cost: 60, prereqs: ["code_of_laws"], unlocksPolicy: "urban_planning" },
  { id: "military_tradition", name: "Military Tradition", cost: 70, prereqs: ["code_of_laws"], unlocksPolicy: "maneuver" },
  { id: "mysticism", name: "Mysticism", cost: 60, prereqs: ["code_of_laws"], unlocksPolicy: "god_king" },
  { id: "early_empire", name: "Early Empire", cost: 110, prereqs: ["craftsmanship"], unlocksGovernment: "despotism" },
  { id: "drama_poetry", name: "Drama & Poetry", cost: 120, prereqs: ["mysticism"], unlocksPolicy: "literary_tradition" },
  { id: "recorded_history", name: "Recorded History", cost: 130, prereqs: ["early_empire"], unlocksPolicy: "natural_philosophy" },
  { id: "trade_routes", name: "Trade", cost: 120, prereqs: ["early_empire"], unlocksPolicy: "caravans" },
  { id: "political_philosophy", name: "Political Philosophy", cost: 190, prereqs: ["recorded_history"], unlocksGovernment: "classical_republic" },
  { id: "military_training", name: "Military Training", cost: 165, prereqs: ["military_tradition", "early_empire"], unlocksGovernment: "oligarchy" },
  { id: "statecraft", name: "Statecraft", cost: 180, prereqs: ["political_philosophy"], unlocksGovernment: "monarchy" },
];

/** Each civic already adopted raises the culture cost of the next by this
 *  fraction of its base cost (Civ-style escalation), so late civics stay
 *  meaningful instead of falling for free out of a culture surplus. */
export const CIVIC_COST_ESCALATION = 0.12;

/** Effective culture cost of a civic given how many the player has already
 *  adopted. Used by the sim (to charge culture) and the client (to display the
 *  cost and progress) so both agree on the escalated price. */
export function civicCost(def: CivicDef, adoptedCount: number): number {
  return Math.round(def.cost * (1 + CIVIC_COST_ESCALATION * Math.max(0, adoptedCount)));
}

export const GOVERNMENTS: GovernmentDef[] = [
  { id: "chiefdom", name: "Chiefdom", desc: "The starting government. 2 policy slots.", slots: 2, effects: {} },
  { id: "despotism", name: "Despotism", desc: "+10% production. 3 policy slots.", reqCivic: "early_empire", slots: 3, effects: { yieldPercent: { production: 10 } } },
  { id: "oligarchy", name: "Oligarchy", desc: "Melee & cavalry +2 combat. 4 policy slots.", reqCivic: "military_training", slots: 4, effects: { unitClassCombat: { melee: 2, cavalry: 2 } } },
  { id: "classical_republic", name: "Classical Republic", desc: "+15% science. 4 policy slots.", reqCivic: "political_philosophy", slots: 4, effects: { yieldPercent: { science: 15 } } },
  { id: "monarchy", name: "Monarchy", desc: "+10% production and +10% gold. 5 policy slots.", reqCivic: "statecraft", slots: 5, effects: { yieldPercent: { production: 10, gold: 10 } } },
];

export const POLICIES: PolicyDef[] = [
  { id: "discipline", name: "Discipline", desc: "Melee units +2 combat.", effects: { unitClassCombat: { melee: 2 } } },
  { id: "maneuver", name: "Maneuver", desc: "Cavalry +1 movement.", effects: { cavalryMovementBonus: 1 } },
  { id: "urban_planning", name: "Urban Planning", desc: "+15% production.", effects: { yieldPercent: { production: 15 } } },
  { id: "god_king", name: "God King", desc: "+15% gold.", effects: { yieldPercent: { gold: 15 } } },
  { id: "literary_tradition", name: "Literary Tradition", desc: "+10% science.", effects: { yieldPercent: { science: 10 } } },
  { id: "natural_philosophy", name: "Natural Philosophy", desc: "+20% science.", effects: { yieldPercent: { science: 20 } } },
  { id: "caravans", name: "Caravans", desc: "+20% gold.", effects: { yieldPercent: { gold: 20 } } },
  { id: "corvee", name: "Corvée", desc: "Culture can rush production (units, buildings, and tile works).", effects: { rushWithCulture: true } },
];

const CIVIC_BY_ID = new Map(CIVICS.map((c) => [c.id, c]));
const GOV_BY_ID = new Map(GOVERNMENTS.map((g) => [g.id, g]));
const POLICY_BY_ID = new Map(POLICIES.map((p) => [p.id, p]));

export const getCivic = (id: string | undefined) => (id ? CIVIC_BY_ID.get(id) : undefined);
export const getGovernment = (id: string | undefined) => (id ? GOV_BY_ID.get(id) : undefined);
export const getPolicy = (id: string | undefined) => (id ? POLICY_BY_ID.get(id) : undefined);

// ===========================================================================
// Religion: beliefs (chosen when founding) and a pool of religion names.
// ===========================================================================

export interface BeliefDef {
  id: string;
  name: string;
  desc: string;
  /** Perk tier 1–5. A religion may pick perks of any tier up to its own tier. */
  tier: number;
  effects: CivEffects;
}

/** The general perk pool. Perks are EXCLUSIVE across religions in a game: once a
 *  religion takes one, no other religion may. A religion picks one perk when it
 *  is founded (tier 1) and one more at each tier upgrade (see RELIGION_TIERS);
 *  each pick may come from any tier at or below the religion's current tier. */
export const BELIEFS: BeliefDef[] = [
  // ---- tier 1 — founding beliefs -----------------------------------------
  { id: "tithe", name: "Tithe", desc: "+15% gold.", tier: 1, effects: { yieldPercent: { gold: 15 } } },
  { id: "scholarship", name: "Scholarship", desc: "+15% science.", tier: 1, effects: { yieldPercent: { science: 15 } } },
  { id: "divine_inspiration", name: "Divine Inspiration", desc: "+10% production.", tier: 1, effects: { yieldPercent: { production: 10 } } },
  { id: "fertility_rites", name: "Fertility Rites", desc: "+15% food.", tier: 1, effects: { yieldPercent: { food: 15 } } },
  { id: "warrior_code", name: "Warrior Code", desc: "Melee units +2 combat.", tier: 1, effects: { unitClassCombat: { melee: 2 } } },
  { id: "holy_warriors", name: "Holy Warriors", desc: "Cavalry units +2 combat.", tier: 1, effects: { unitClassCombat: { cavalry: 2 } } },
  { id: "sacred_paths", name: "Sacred Paths", desc: "Cavalry +1 movement.", tier: 1, effects: { cavalryMovementBonus: 1 } },
  { id: "labor_of_devotion", name: "Labor of Devotion", desc: "Faith can rush production (units, buildings, and tile works).", tier: 1, effects: { rushWithFaith: true } },
  { id: "choral_hymns", name: "Choral Hymns", desc: "+15% culture.", tier: 1, effects: { yieldPercent: { culture: 15 } } },
  { id: "pilgrim_ways", name: "Pilgrim Ways", desc: "+1 faith per trade route.", tier: 1, effects: { tradeRouteFaithBonus: 1 } },
  { id: "sylvan_rites", name: "Sylvan Rites", desc: "Forest tiles in your territory +1 faith.", tier: 1, effects: { forestTileFaithBonus: 1 } },
  { id: "harvest_blessing", name: "Harvest Blessing", desc: "Worked farm tiles +1 food.", tier: 1, effects: { farmTileFoodBonus: 1 } },
  { id: "martial_catechism", name: "Martial Catechism", desc: "Trained units start with +5 XP.", tier: 1, effects: { startXpBonus: 5 } },
  { id: "desert_hermits", name: "Desert Hermits", desc: "Desert cities +2 faith.", tier: 1, effects: { desertCityYield: { faith: 2 } } },
  // ---- tier 2 -------------------------------------------------------------
  { id: "crusading_spirit", name: "Crusading Spirit", desc: "Melee units +4 combat attacking cities.", tier: 2, effects: { meleeVsCityBonus: 4 } },
  { id: "monastic_orders", name: "Monastic Orders", desc: "+20% science.", tier: 2, effects: { yieldPercent: { science: 20 } } },
  { id: "almsgiving", name: "Almsgiving", desc: "+20% gold.", tier: 2, effects: { yieldPercent: { gold: 20 } } },
  { id: "rites_of_spring", name: "Rites of Spring", desc: "+20% food.", tier: 2, effects: { yieldPercent: { food: 20 } } },
  { id: "drilled_faithful", name: "Drilled Faithful", desc: "Units train 15% faster.", tier: 2, effects: { trainTimePercent: -15 } },
  { id: "pilgrim_hospices", name: "Pilgrim Hospices", desc: "All units heal +3 HP per turn.", tier: 2, effects: { unitHealPerTurn: 3 } },
  { id: "iconography", name: "Sacred Iconography", desc: "+20% culture.", tier: 2, effects: { yieldPercent: { culture: 20 } } },
  // ---- tier 3 -------------------------------------------------------------
  { id: "zealotry", name: "Zealotry", desc: "Kills yield 8 faith.", tier: 3, effects: { faithOnKill: 8 } },
  { id: "church_militant", name: "Church Militant", desc: "Melee and ranged units +3 combat.", tier: 3, effects: { unitClassCombat: { melee: 3, ranged: 3 } } },
  { id: "golden_reliquaries", name: "Golden Reliquaries", desc: "+15% gold and +15% culture.", tier: 3, effects: { yieldPercent: { gold: 15, culture: 15 } } },
  { id: "illuminated_scripts", name: "Illuminated Scripts", desc: "+25% science.", tier: 3, effects: { yieldPercent: { science: 25 } } },
  { id: "blessed_hearths", name: "Blessed Hearths", desc: "New cities are founded with +1 population.", tier: 3, effects: { newCityExtraPopulation: 1 } },
  { id: "consecrated_forges", name: "Consecrated Forges", desc: "+20% production.", tier: 3, effects: { yieldPercent: { production: 20 } } },
  // ---- tier 4 -------------------------------------------------------------
  { id: "veneration_of_saints", name: "Veneration of Saints", desc: "Trained units start with +15 XP.", tier: 4, effects: { startXpBonus: 15 } },
  { id: "divine_mandate", name: "Divine Mandate", desc: "+15% production and +15% gold.", tier: 4, effects: { yieldPercent: { production: 15, gold: 15 } } },
  { id: "martyrs_legacy", name: "Martyr's Legacy", desc: "Kills yield 6 faith; trained units +10 morale.", tier: 4, effects: { faithOnKill: 6, startMoraleBonus: 10 } },
  { id: "soldiers_of_god", name: "Soldiers of God", desc: "Melee and cavalry units +4 combat.", tier: 4, effects: { unitClassCombat: { melee: 4, cavalry: 4 } } },
  { id: "temple_academies", name: "Temple Academies", desc: "+20% science and +10% culture.", tier: 4, effects: { yieldPercent: { science: 20, culture: 10 } } },
  { id: "trials_of_faith", name: "Trials of Faith", desc: "Units earn +30% combat XP.", tier: 4, effects: { xpGainPercent: 30 } },
  // ---- tier 5 -------------------------------------------------------------
  { id: "dominion_of_heaven", name: "Dominion of Heaven", desc: "+15% to every yield.", tier: 5, effects: { yieldPercent: { food: 15, production: 15, gold: 15, science: 15, culture: 15, faith: 15 } } },
  { id: "sword_of_god", name: "Sword of God", desc: "Melee, ranged, cavalry and siege units +4 combat.", tier: 5, effects: { unitClassCombat: { melee: 4, ranged: 4, cavalry: 4, siege: 4 } } },
  { id: "eternal_covenant", name: "Eternal Covenant", desc: "Units earn +50% combat XP and train with +10 XP.", tier: 5, effects: { xpGainPercent: 50, startXpBonus: 10 } },
  { id: "heavens_bounty", name: "Heaven's Bounty", desc: "+25% food and +25% gold.", tier: 5, effects: { yieldPercent: { food: 25, gold: 25 } } },
  { id: "voice_of_the_prophet", name: "Voice of the Prophet", desc: "+30% faith; kills yield 10 faith.", tier: 5, effects: { yieldPercent: { faith: 30 }, faithOnKill: 10 } },
];

// ---- religion tiers --------------------------------------------------------

/** Requirements to raise a religion to a tier: a flat faith price plus a minimum
 *  number of follower cities (cities whose majority faith is this religion).
 *  Each tier reached grants one new perk pick from the pool above. */
export interface ReligionTierDef {
  tier: number;
  faithCost: number;
  minFollowerCities: number;
}

export const RELIGION_TIERS: ReligionTierDef[] = [
  { tier: 1, faithCost: 0, minFollowerCities: 0 },
  { tier: 2, faithCost: 250, minFollowerCities: 3 },
  { tier: 3, faithCost: 500, minFollowerCities: 6 },
  { tier: 4, faithCost: 1000, minFollowerCities: 10 },
  { tier: 5, faithCost: 2000, minFollowerCities: 14 },
];

export const MAX_RELIGION_TIER = 5;

export const getReligionTier = (tier: number): ReligionTierDef | undefined =>
  RELIGION_TIERS.find((t) => t.tier === tier);

/** Faith price to move a religion's holy capital to another follower city. */
export const MOVE_HOLY_CITY_COST = 200;

/** A real historical religion a player may found. Each has an emblem icon and a
 *  full artwork (see tools/art-generator) plus lore for the encyclopedia. The set
 *  is drawn from faiths that existed up to the Age of Exploration (~1500 CE). */
export interface ReligionDef {
  /** Stable kebab id; keys the icon/artwork assets (religions/<id>.png). */
  id: string;
  /** Display name shown on the founding card and city labels. */
  name: string;
  /** One-line hook shown on the founding card. */
  blurb: string;
  /** Full encyclopedia history — multiple paragraphs separated by "\n\n". */
  wiki: string;
}

export const RELIGIONS: ReligionDef[] = [
  { id: "christianity", name: "Christianity", blurb: "The faith of the risen Christ, spread from Judea across the known world.", wiki: "Christianity arose in first-century Roman Judea from the life and teaching of Jesus of Nazareth, a Jewish preacher whom his followers proclaimed the Messiah — crucified under Pontius Pilate and, they held, risen from the dead. His disciples, above all the apostles Peter and Paul, carried the message that salvation was offered to all peoples, Jew and gentile alike, through his death and resurrection.\n\nFor nearly three centuries the faith spread through the cities of the Roman world as an often-persecuted minority, meeting in house-churches, tending the sick and the poor, and producing martyrs whose courage won both admiration and converts. In 313 CE the emperor Constantine granted toleration at the Edict of Milan, and by the end of the fourth century Christianity had become the official religion of the empire.\n\nIts writings gathered into the New Testament and its doctrine defined at great councils such as Nicaea, the faith outlasted the fall of Rome to become the dominant religion of medieval Europe, shaping its art, law, learning, and kingship for a thousand years and ultimately spreading to every continent." },
  { id: "catholicism", name: "Catholicism", blurb: "The Western Church, united under the Bishop of Rome.", wiki: "The Catholic Church is the Latin Christianity of the West, tracing its authority to the apostle Peter and led by his successors, the popes in Rome. As the western and eastern halves of the old Roman world drifted apart in language, politics, and theology, the breach was formalised in the Great Schism of 1054, leaving the Latin Church distinct from Eastern Orthodoxy.\n\nThrough the Middle Ages the Church was the great unifying institution of Europe. Its monasteries preserved learning through the dark centuries, its cathedrals rose over every city, its universities at Paris and Bologna gave birth to the scholastic tradition, and its calls to crusade sent armies to the Holy Land. Its sacraments, its Latin liturgy, and its canon law bound quarrelsome kingdoms into a single Christendom that owed allegiance to Rome.\n\nPopes crowned emperors and excommunicated kings, and the Church amassed enormous wealth and influence. That power, and the abuses it bred, would eventually provoke the Protestant Reformation of the sixteenth century — but for the whole of the medieval millennium, Catholic Christianity was the spiritual and cultural heart of western Europe." },
  { id: "orthodoxy", name: "Eastern Orthodoxy", blurb: "The Byzantine Church of icons, incense and empire.", wiki: "Eastern Orthodoxy is the Christianity of the Greek-speaking East, centred on Constantinople, the New Rome founded by Constantine. Through the thousand-year life of the Byzantine Empire it preserved Roman law, Greek learning, and the theology of the early Church councils, defining its faith through the seven ecumenical councils and its worship through a liturgy of extraordinary beauty.\n\nOrthodoxy is a faith of images and mystery. Its gilded icons are held to be windows into heaven; its domed churches, above all the great Hagia Sophia, were built to bring heaven to earth; and its monasticism, centred on the Holy Mountain of Athos, cultivated the contemplative tradition of hesychasm and unceasing prayer. The dispute over icons — settled in their favour in 843 — and the widening rift with the Latin West culminated in the Great Schism of 1054.\n\nEven as Byzantium declined and finally fell to the Ottomans in 1453, the faith had already been carried north. The conversion of the Bulgarians, Serbs, and above all the Rus' of Kiev around 988 planted Orthodoxy across the Slavic world, where Moscow would in time claim to be a Third Rome and heir to the fallen empire." },
  { id: "islam", name: "Islam", blurb: "Submission to the one God, revealed to the Prophet Muhammad.", wiki: "Islam began in the early seventh century with Muhammad, a merchant of Mecca who, Muslims believe, received revelations from God through the angel Gabriel over some twenty-three years. Gathered after his death into the Qur'an, these revelations called the faithful to submit to the one God, Allah, and to the Five Pillars: the profession of faith, prayer, almsgiving, fasting in Ramadan, and pilgrimage to Mecca. Driven from Mecca to Medina in 622 — the Hijra that opens the Muslim calendar — Muhammad united much of Arabia under the new faith before his death in 632.\n\nWithin a single century his successors, the caliphs, forged one of the largest empires in history, carrying Islam from the Atlantic coast of Iberia across North Africa and the Middle East to the frontiers of India and China. Arabic became the language of religion, administration, and scholarship across this vast realm.\n\nUnder the Abbasid caliphs of Baghdad the Islamic world entered a golden age, its scholars preserving and advancing Greek philosophy, mathematics, astronomy, and medicine while its merchants linked three continents in a single web of trade. Splitting early into Sunni and Shia branches, Islam grew into one of the great world religions, its faith and learning shaping civilisations from Spain to Southeast Asia." },
  { id: "judaism", name: "Judaism", blurb: "The covenant of one God with the people of Israel.", wiki: "Judaism is the oldest of the Abrahamic faiths and among the first to worship a single God. Its foundational story tells of the covenant between that God and the patriarch Abraham, renewed with Moses at Mount Sinai, where the people of Israel received the Torah — the Law that binds them to God through its commandments. Its scriptures record the history of Israel from the Exodus out of Egypt to the kingdom of David and Solomon and the building of the Temple in Jerusalem.\n\nThe destruction of the First Temple by Babylon in 586 BCE and the exile that followed forced a profound transformation: a faith once centred on Temple sacrifice learned to survive through scripture, prayer, and study. After the Romans destroyed the Second Temple in 70 CE, the rabbis codified this tradition in the Mishnah and Talmud, and the synagogue and the law sustained Jewish life across a diaspora scattered from Spain to Persia.\n\nThrough centuries of dispersion and frequent persecution, Jewish communities preserved their identity, learning, and covenant. Though always a small people, Judaism's monotheism and moral vision seeded the two largest religions on earth, Christianity and Islam, both of which revere its scriptures and its prophets." },
  { id: "hinduism", name: "Hinduism", blurb: "The eternal dharma of countless gods and sacred texts.", wiki: "Hinduism is less a single church than a vast family of traditions native to the Indian subcontinent, with no single founder and roots reaching back more than three thousand years. Its oldest scriptures, the Vedas, were composed in Sanskrit by the Aryan peoples of northern India; from their hymns and the later philosophical Upanishads grew the core ideas of dharma (sacred duty), karma (the moral consequence of action), and samsara (the cycle of death and rebirth from which the soul seeks liberation, or moksha).\n\nHindus worship the divine in countless forms, above all the great gods Vishnu the preserver, Shiva the destroyer and transformer, and the Goddess Devi in her many aspects. Its sprawling epics, the Mahabharata and Ramayana, and the beloved Bhagavad Gita gave the faith its enduring moral and devotional stories, while its philosophers developed schools of thought of remarkable subtlety.\n\nOver the centuries Hinduism expressed itself in soaring temples, in the caste ordering of society, in pilgrimage to sacred rivers, and in the passionate devotional movements of bhakti. Flourishing under dynasties such as the Guptas and Cholas, and enduring alongside Buddhism, Jainism, and later Islam, it remained the living faith of the majority of the subcontinent." },
  { id: "buddhism", name: "Buddhism", blurb: "The Middle Way to enlightenment taught by the Buddha.", wiki: "Buddhism began with Siddhartha Gautama, a prince of the Shakya clan in the foothills of the Himalayas who, around the fifth century BCE, renounced his comfortable life to seek the cause of human suffering. Attaining enlightenment beneath the bodhi tree, he became the Buddha, the Awakened One, and taught the Four Noble Truths — that life entails suffering, that suffering arises from craving, that it can cease, and that the way to its cessation is the Eightfold Path of right conduct, meditation, and wisdom.\n\nUnlike the faiths around it, Buddhism looked not to a creator god but to release from the cycle of rebirth through insight and ethical living, open to all regardless of caste. Organised around communities of monks and nuns, it won a great patron in the emperor Ashoka, who in the third century BCE spread it across India and dispatched missionaries abroad.\n\nCarried by monks and merchants along the Silk Road and the sea lanes, Buddhism divided into the Theravada of Sri Lanka and Southeast Asia, the Mahayana of China, Korea, and Japan with its compassionate bodhisattvas, and the Vajrayana of Tibet. Though it faded in the land of its birth, it reshaped the spiritual and artistic life of all of Asia." },
  { id: "zoroastrianism", name: "Zoroastrianism", blurb: "The cosmic struggle of light against darkness.", wiki: "Zoroastrianism was preached by the prophet Zarathustra (Zoroaster) in the lands of ancient Iran, at a date scholars place anywhere from 1500 to 600 BCE. He proclaimed a single supreme god, Ahura Mazda, the Wise Lord, and framed all of existence as a cosmic struggle between truth and order (asha) and the destructive spirit of the lie (druj). Human beings, endowed with free will, must choose their side through good thoughts, good words, and good deeds — a moral vision of startling originality.\n\nFire, the symbol of Ahura Mazda's light and purity, burned at the heart of its worship, tended by a priesthood of magi in temples where the sacred flames were never allowed to die. Its ideas of a final judgement, a resurrection of the dead, and a struggle between heaven and hell would deeply influence Judaism, Christianity, and Islam.\n\nFor over a thousand years Zoroastrianism was the state religion of three great Persian empires — the Achaemenid, Parthian, and Sasanian. The Arab conquest of Persia in the seventh century CE gradually eclipsed it; its fire temples were extinguished one by one, and many of the faithful fled to India, where their descendants, the Parsis, keep the ancient flame to this day." },
  { id: "jainism", name: "Jainism", blurb: "The path of non-violence and radical self-discipline.", wiki: "Jainism is an ancient faith of the Indian subcontinent, teaching a path to liberation through radical non-violence and self-discipline. Jains revere a succession of twenty-four tirthankaras, the ford-makers who show the way across the ocean of rebirth; the last and best documented, Mahavira, lived in the sixth century BCE as a contemporary of the Buddha, renewing a tradition his followers held to be far older.\n\nAt the heart of Jainism stands ahimsa — non-violence toward every living being, however small. This principle is pursued to extraordinary lengths: monks sweep the path before them, strain their water, and some veil the mouth, lest they harm even an insect. Jains hold that every soul is bound by the karma it accumulates through action, and that only through non-violence, truthfulness, non-attachment, and severe austerity can the soul be freed to rise, luminous and omniscient, to the summit of the universe.\n\nThough always a small community, Jains became prominent as merchants and scholars, their honesty and non-violence winning them trust and wealth, which they poured into some of India's most exquisite marble temples. Their ethic of ahimsa left a lasting mark on Indian civilisation — and, through Mahatma Gandhi, on the modern world." },
  { id: "sikhism", name: "Sikhism", blurb: "One God, honest work, and equality before the divine.", wiki: "Sikhism was founded in the Punjab of northern India by Guru Nanak (1469–1539), who taught that there is but one formless, eternal God, and that all people — of every caste, creed, and gender — stand equal before the divine. Rejecting both Hindu ritualism and religious division, he called his followers to a life of honest labour, sharing with others, and constant loving remembrance of God's name.\n\nNanak was the first of ten living Gurus who shaped the faith over the following two centuries. They compiled its scripture, the Guru Granth Sahib — a collection of sacred hymns that would become the eternal Guru after the tenth — and established institutions such as the communal free kitchen, the langar, where all eat together as equals. The Golden Temple at Amritsar became the faith's spiritual centre.\n\nAs the community faced persecution under the Mughal emperors, its character grew more martial. In 1699 the tenth Guru, Gobind Singh, founded the Khalsa, an order of initiated Sikhs bound by discipline and marked by the five articles of faith, forging a people of both deep devotion and fearless courage who would go on to found a powerful kingdom in the Punjab." },
  { id: "taoism", name: "Taoism", blurb: "Harmony with the Tao, the natural way of all things.", wiki: "Taoism grew from the ancient wisdom traditions of China and the teachings attributed to the sage Laozi, whose slender classic the Tao Te Ching counsels harmony with the Tao — the nameless, effortless Way that underlies and flows through all of nature. Its central ideal is wu wei, action through non-action: the wise person, like water, accomplishes all things by yielding, by simplicity, and by not forcing against the grain of the world.\n\nThe playful philosopher Zhuangzi deepened this vision with parables questioning the boundaries of self, knowledge, and reality. Alongside this philosophical Taoism there grew a rich religious tradition, with its own pantheon of immortals and deities, its monastic orders, and its quest for longevity and even physical immortality through breathing exercises, meditation, and alchemy.\n\nAs one of the three great teachings of China alongside Confucianism and Buddhism, Taoism balanced the formal, dutiful order of Confucian society with a love of spontaneity, nature, and mystery. Its influence pervaded Chinese medicine, painting, poetry, martial arts, and the enduring image of the hermit sage wandering the misty mountains in search of the Way." },
  { id: "confucianism", name: "Confucianism", blurb: "Virtue, ritual and harmony ordering society.", wiki: "Confucianism is the ethical and social tradition founded on the teachings of Confucius (Kong Fuzi, 551–479 BCE), a scholar and would-be advisor who lived during the turbulent decline of the Zhou dynasty. Distressed by the disorder of his age, he taught that a harmonious society rests on virtue, on the proper performance of ritual, and above all on right relationships — between ruler and subject, parent and child, husband and wife, and among friends — bound together by filial piety and mutual obligation.\n\nAt the centre of his teaching stood the junzi, the cultivated gentleman who governs himself and others through moral example and benevolence (ren) rather than through force. His sayings, gathered by disciples into the Analects, and the writings of later thinkers such as Mencius, became the classics that every educated Chinese would study.\n\nAdopted as state doctrine under the Han dynasty, Confucianism shaped Chinese civilisation for two thousand years. Its greatest institution was the imperial examination system, which staffed the vast bureaucracy with scholar-officials chosen by merit rather than birth. Its ideals of learning, hierarchy, and social harmony spread across Korea, Vietnam, and Japan, ordering much of East Asian civilisation." },
  { id: "shinto", name: "Shinto", blurb: "The way of the kami, spirits of the Japanese isles.", wiki: "Shinto — the Way of the Kami — is the indigenous faith of Japan, a tradition without founder, scripture, or fixed creed that reaches back into the islands' prehistory. It venerates the kami, the countless sacred spirits that dwell in mountains, rivers, trees, waterfalls, storms, ancestors, and remarkable people. The kami are not distant gods but immediate presences, to be honoured, thanked, and appeased so that life may flourish in harmony with them.\n\nAt the heart of Shinto lies a deep concern with purity and the cleansing of pollution, expressed through ritual washing, offerings, and festival. Worship centres on the shrine, its sacred precinct marked by the vermilion torii gate that separates the ordinary world from the dwelling of the kami; the greatest of these, the shrine of the sun-goddess Amaterasu at Ise, is rebuilt anew every twenty years.\n\nFrom Amaterasu, myth held, descended the imperial line itself, binding the faith to the throne and to the identity of the Japanese people. Though it absorbed much from Buddhism and Confucianism after their arrival from the mainland — often coexisting with Buddhism in the same shrines and temples — Shinto endured as the native spiritual ground of Japan, sanctifying the natural world and the rhythm of the seasons." },
  { id: "tengrism", name: "Tengrism", blurb: "Worship of the Eternal Blue Sky of the steppe.", wiki: "Tengrism was the ancient faith of the nomadic peoples of the Eurasian steppe — the Turks, Mongols, Huns, and their many kin. At its centre stood Tengri, the Eternal Blue Sky, the supreme and impartial power that watched over all and granted fortune to the worthy. Beside him were honoured Umay, the mother-goddess of earth and fertility, and the innumerable spirits of the mountains, rivers, fire, and ancestors that filled the nomad's world.\n\nTengrism had no scripture and no temples; the open sky was its cathedral. Its rites were led by shamans, the böö or kam, who beat their drums to fall into trance and journey in spirit to the heavens or the underworld — to heal the sick, guide the souls of the dead, and read the omens before a raid or a battle. Central to the faith was the belief that a righteous ruler governed by the mandate of Heaven.\n\nIt was this conviction that Genghis Khan invoked as he united the Mongol tribes and unleashed them upon the world; he claimed Tengri's favour as he built the largest contiguous empire in history. As the Mongols and Turks settled among conquered peoples, many adopted Buddhism, Islam, or Christianity — yet the old sky-worship long endured beneath and within them, and lingers among steppe peoples still." },
  { id: "norse", name: "Norse Paganism", blurb: "The old gods of Asgard — Odin, Thor and the fates.", wiki: "Norse paganism was the pre-Christian religion of the Scandinavian peoples, part of the wider family of Germanic heathenism. It worshipped two families of gods: the warlike Aesir, dwelling in Asgard, and the fertility-giving Vanir. Chief among them were Odin the one-eyed wanderer, god of wisdom, poetry, war, and the dead; Thor the red-bearded thunderer, defender of gods and men with his hammer Mjölnir; and Freyja, goddess of love and battle. Over all loomed the Norns, who wove the fate of every being, and the certainty of Ragnarök, the doom in which the gods themselves would fall.\n\nWorship took the form of the blót, a sacrifice and feast held in the hall or the sacred grove, presided over by a chieftain-priest, the goði. The faith prized honour, loyalty, courage, and a good name that would outlive death. A warrior who fell bravely in battle might be chosen for Valhalla, Odin's hall, to feast and fight until the last day.\n\nCarried across the seas in the Viking Age by raiders, traders, and settlers who reached from Russia to Newfoundland, the old religion flourished for centuries before Christian missionaries and kings gradually converted the North. Iceland adopted Christianity by a remarkable decision of its assembly around the year 1000, and the old gods slowly faded — but their myths, preserved in the Icelandic sagas and Eddas, live on." },
  { id: "hellenism", name: "Hellenism", blurb: "The Olympian gods of Greece and their sacred rites.", wiki: "The religion of the ancient Greeks honoured a great family of gods who, it was believed, dwelt atop Mount Olympus and meddled endlessly in the affairs of mortals. Chief among the twelve Olympians were Zeus the king of the gods and lord of the sky, his queen Hera, the sea-god Poseidon, wise Athena, radiant Apollo, and a host of others, each with their own domains, temples, and festivals. The Greeks did not so much believe in their gods as live with them, seeing their hands in every storm, harvest, and stroke of fortune.\n\nGreek religion had no scripture or church, but it was woven through every part of life. Its myths, told by Homer and Hesiod, explained the world; its great sanctuaries, above all the oracle of Apollo at Delphi, were consulted before any weighty undertaking; and its festivals, from the Olympic Games to the dramatic contests of Athens, were acts of worship as much as of civic pride.\n\nFor those who longed for something deeper, the mystery cults — of Demeter at Eleusis, or of Dionysus — offered secret rites and the hope of a blessed afterlife. Spread across the Mediterranean by Greek colonists and later fused with Roman religion, this vibrant polytheism suffused classical civilisation for over a thousand years, until it was gradually displaced by Christianity." },
  { id: "egyptian", name: "Egyptian Pantheon", blurb: "The gods of the Nile and the promise of the afterlife.", wiki: "The religion of ancient Egypt was among the longest-lived faiths in human history, enduring in recognisable form for over three thousand years along the banks of the Nile. Its gods were legion — the falcon-headed Horus, the sun-god Ra sailing his barque across the sky, Isis the great mother, Anubis who guarded the dead, and Osiris, the slain and risen king who ruled the afterlife. The rhythm of the Nile's life-giving flood and the daily death and rebirth of the sun gave the Egyptians a cosmos of profound order, which they called maat.\n\nCentral to the faith was an unshakeable belief in life beyond death. The Egyptians preserved their dead through mummification, furnished their tombs for the journey ahead, and inscribed spells to guide the soul past judgement, where the heart was weighed against the feather of truth. It was this conviction that raised the pyramids and the great mortuary temples.\n\nThe pharaoh stood at the meeting point of gods and men, a living god responsible for upholding maat, served by a vast and wealthy priesthood in temples of colossal stone at Karnak, Luxor, and beyond. The faith weathered even the brief revolution of Akhenaten, who tried to impose worship of a single sun-disc, before the old gods returned — enduring until the coming of Christianity finally closed the temples." },
  { id: "mesopotamian", name: "Mesopotamian Faith", blurb: "The temple-gods of Sumer, Babylon and Assyria.", wiki: "The religion of ancient Mesopotamia — the land between the Tigris and Euphrates — is the oldest faith recorded in writing, first set down by the Sumerians more than five thousand years ago and inherited in turn by the Akkadians, Babylonians, and Assyrians. Its pantheon numbered hundreds of gods, led by the sky-father Anu, Enlil lord of wind and storm, Ea the god of wisdom and fresh water, Ishtar the fierce goddess of love and war, and Marduk, the champion who in Babylon's great creation epic slew the chaos-dragon Tiamat and fashioned the world from her body.\n\nThe gods were held to have created humankind to labour on their behalf and to feed them through offerings. Each city was the earthly household of its patron deity, whose temple — crowned by a towering stepped ziggurat that reached toward heaven — stood at its heart, and whose priest-kings ruled in the god's name.\n\nMesopotamian religion was obsessed with divining the will of the gods, reading the future in the stars, in the entrails of sacrificed animals, and in dreams and omens of every kind — a practice that made its priests the world's first astronomers. Its myths of creation and of a great flood, recorded on clay tablets, echo down through later scriptures, and its temple-astronomy shaped the science of civilisations for millennia to come." },
  { id: "druidism", name: "Celtic Druidism", blurb: "The sacred groves and old gods of the Celts.", wiki: "Celtic paganism was the religion of the Celtic peoples who spread across Iron Age Europe from Ireland and Britain to Gaul and beyond. They worshipped a great many gods and goddesses — deities of war, craft, healing, and sovereignty, often tied to particular tribes and places — and held that the divine dwelt everywhere in the living land: in rivers and springs, in hilltops, and above all in the sacred groves of oak.\n\nThe faith was guided by the druids, a learned priestly class who were at once priests, judges, healers, poets, and keepers of tradition. According to Julius Caesar and other classical writers, they underwent up to twenty years of training, committing their vast lore to memory rather than to writing, and taught that the soul was immortal and passed from one body to another. They presided over sacrifices, arbitrated disputes between tribes, and marked the turning of the year with festivals such as Samhain and Beltane.\n\nThe Celts left no scriptures of their own, and much of what they believed was lost when Rome conquered Gaul and Britain and suppressed the druids, and when Christianity later swept through the Celtic lands. Yet echoes of the old faith survived in folklore, in holy wells and seasonal customs, and in the rich mythology written down by the monks of medieval Ireland and Wales." },
  { id: "manichaeism", name: "Manichaeism", blurb: "A universal gospel of light warring against darkness.", wiki: "Manichaeism was founded by the prophet Mani (216–274 CE) in Sasanian Persia, who proclaimed himself the last in a line of messengers that included Zoroaster, the Buddha, and Jesus, and set out to found a single universal religion embracing them all. From Zoroastrian, Christian, and Buddhist sources he wove a sweeping dualist myth: the cosmos is the battleground of two eternal principles, Light and Darkness, and particles of divine light lie trapped within the material world, awaiting release.\n\nMani's followers were divided into two ranks. The Elect lived in strict purity — celibate, propertyless, and vegetarian — labouring to free the imprisoned light through prayer and abstinence, while the larger body of Hearers supported them and lived by a gentler rule. Mani himself was a gifted artist, and his faith was famous for its beautifully illuminated books.\n\nCarried by missionaries along the Silk Road, Manichaeism spread with astonishing speed, at its height stretching from Roman North Africa — where the young Augustine was a Hearer before his conversion to Christianity — to the Uyghur steppe and Tang China. Yet everywhere it was regarded as a dangerous heresy: hunted in turn by Zoroastrians, Christians, and Muslims, and eventually stamped out in China, it was driven to extinction, its very name becoming a byword for heresy." },
  { id: "aztec", name: "Aztec Faith", blurb: "Blood offerings to keep the sun in motion.", wiki: "The religion of the Aztecs — the Mexica of the Valley of Mexico — was a rich and demanding faith that reached its height in the two centuries before the Spanish conquest. It worshipped a crowded pantheon: Huitzilopochtli the sun and war god who guided the Mexica to their island capital Tenochtitlan; Tlaloc the rain-giver; Quetzalcoatl the feathered serpent of wind and wisdom; and Tezcatlipoca, the capricious smoking mirror. The Aztecs inherited much of this cosmology from the older civilisations of Mesoamerica.\n\nAt its centre lay a belief that the universe was fragile and doomed, having already passed through four ages that ended in destruction. The present Fifth Sun could only be sustained by nourishing the gods with the most precious of offerings — human blood. The Aztecs waged war in part to take captives, who were sacrificed by the thousand atop the great pyramids to keep the sun moving and hold off the end of the world.\n\nThis was a faith of intricate ritual, governed by two interlocking calendars and a powerful priesthood, expressed in monumental temples, carved sun-stones, and vivid painted books. It dominated central Mexico until 1521, when the arrival of Hernán Cortés and the fall of Tenochtitlan brought the world of the Fifth Sun to a sudden and violent end." },
  { id: "maya", name: "Maya Faith", blurb: "The gods of maize, time and the sacred calendar.", wiki: "The religion of the Maya flourished across the city-states of the Yucatán and the Central American lowlands, reaching its classical height between the third and ninth centuries CE. The Maya honoured a vast array of gods — the maize god whose death and rebirth mirrored the growing of their staple crop, the rain-god Chaac, the sun and moon, and the fearsome lords of Xibalba, the underworld. Above all they were obsessed with time itself, which they conceived as a living, cyclical force.\n\nMaya priests were astronomers and mathematicians of genius. Using a sophisticated system of interlocking calendars — the 260-day sacred round, the 365-day solar year, and the vast Long Count that reckoned time over millennia — and a place-value numeral system that included the concept of zero, they charted the movements of Venus, the sun, and the moon with remarkable accuracy, and predicted eclipses from atop their jungle pyramids.\n\nThe faith was sustained by ritual bloodletting, in which kings and nobles offered their own blood to nourish the gods and open portals to the divine, and by ballgames laden with cosmic meaning. Recorded in carved stone stelae and folding bark-paper codices, Maya religion outlived the mysterious collapse of the great classical cities, enduring in the highlands where daykeepers count the sacred calendar even now." },
  { id: "inca", name: "Inti Worship", blurb: "Devotion to Inti, the golden sun of the Andes.", wiki: "The religion of the Inca crowned the greatest empire of the pre-Columbian Andes, which at its height in the fifteenth and early sixteenth centuries stretched along the mountain spine of South America. At its summit stood Inti, the sun-god, revered as the divine ancestor of the emperor — the Sapa Inca — whose person was therefore sacred. Beside Inti were honoured the creator god Viracocha, the thunder-god Illapa who brought the rains, and Pachamama, the earth-mother who gave the harvest.\n\nThe faith was inseparable from the state. From the Coricancha, the Temple of the Sun in the capital Cuzco whose walls were once sheathed in gold, a powerful priesthood led by the high priest Willaq Umu conducted the great festivals of the Andean year, above all Inti Raymi at the winter solstice. The Inca practised elaborate offerings, and in times of crisis the solemn sacrifice of children, the capacocha, on high mountain peaks.\n\nAndean religion venerated the huacas — the countless sacred places, stones, springs, and ancestral mummies that filled the landscape — and bound them into an imperial cult through a network of shrines and ritual sight-lines radiating from Cuzco. This sun-worship crowned the Andes until Francisco Pizarro's conquest of 1533 tore the gold from the temple walls and toppled the empire of the sun." },
  { id: "yoruba", name: "Yoruba Faith", blurb: "The orisha spirits and the wisdom of Ifá divination.", wiki: "The religion of the Yoruba people of West Africa, centred in the forests and cities of what is now Nigeria and Benin, is a sophisticated faith that took shape over many centuries around the sacred city of Ile-Ife, held to be the place where the world itself was created. It teaches a single supreme creator, Olodumare, who is remote from daily affairs, and who governs the world through a great pantheon of orisha — powerful spirits such as Shango the thunder-god and king, Ogun the god of iron and war, Osun of the river, and Esu the trickster and messenger who stands at every crossroads.\n\nAt the heart of Yoruba religion is the pursuit of good character and destiny, and above all the intricate wisdom-system of Ifá. Its priests, the babalawo, divine the will of the orisha and the path of a person's fate by casting sacred palm-nuts or a divining chain, reading one of 256 figures each tied to a vast body of memorised verse — one of the most elaborate oral corpuses in the world.\n\nExpressed through drumming, dance, festival, and superb sculpture, Yoruba religion was carried across the Atlantic in the age of the slave trade. There it survived and transformed, giving rise to the living faiths of Santería in Cuba, Candomblé in Brazil, and Vodou in the wider Caribbean — making it one of the most influential of all African religions." },
];

/** Names pool (derived) — kept for founding logic that matches by name. */
export const RELIGION_NAMES: string[] = RELIGIONS.map((r) => r.name);

const BELIEF_BY_ID = new Map(BELIEFS.map((b) => [b.id, b]));
export const getBelief = (id: string | undefined) => (id ? BELIEF_BY_ID.get(id) : undefined);

const RELIGION_BY_ID = new Map(RELIGIONS.map((r) => [r.id, r]));
const RELIGION_BY_NAME = new Map(RELIGIONS.map((r) => [r.name, r]));
export const getReligionDef = (id: string | undefined) => (id ? RELIGION_BY_ID.get(id) : undefined);
export const getReligionByName = (name: string | undefined) => (name ? RELIGION_BY_NAME.get(name) : undefined);

// ---- per-religion kits ------------------------------------------------------
// Every religion carries a historically-fitting PRESET benefit (granted to the
// founder's empire the moment the faith is founded), a CAPITAL bonus (applied to
// the faith's holy city while it keeps the faith), and a UNIQUE UNIT identity
// (its stats, abilities and tier scaling live in @roc/sim religion-units.ts —
// this table is the presentation layer that names it and keys its artwork).

/** A named, described effect bundle (a religion's preset or capital bonus). */
export interface ReligionBonusDef {
  name: string;
  desc: string;
  effects: CivEffects;
}

/** Presentation identity of a religion's unique unit (mechanics live in @roc/sim). */
export interface ReligionUnitInfo {
  /** Unit type id — also keys the artwork (units/<id>.png, units-big/<id>.png). */
  id: string;
  name: string;
  /** One-line hook shown in the wiki and training UI. */
  blurb: string;
  /** Artwork prompt for tools/art-generator. */
  art: string;
  /** Real-world historical background shown in the wiki (who these people actually were). */
  history: string;
}

export interface ReligionKitDef {
  religionId: string;
  preset: ReligionBonusDef;
  capital: ReligionBonusDef;
  unit: ReligionUnitInfo;
}

export const RELIGION_KITS: ReligionKitDef[] = [
  {
    religionId: "christianity",
    preset: { name: "The Great Commission", desc: "+10% faith and +1 faith per trade route — the gospel travels every road.", effects: { yieldPercent: { faith: 10 }, tradeRouteFaithBonus: 1 } },
    capital: { name: "Pilgrim Roads", desc: "+15% gold in the holy city as pilgrims flock to its shrines.", effects: { yieldPercent: { gold: 15 } } },
    unit: { id: "evangelist", name: "Evangelist", blurb: "A travelling preacher who mends the wounded and carries the faith into every city he nears.", art: "a humble early-Christian travelling preacher in a rough wool robe holding a wooden staff and a small scroll, kind weathered face, sandals, dusty road", history: "The earliest Christians spread their faith not by conquest but on foot, as travelling preachers who carried the gospel from Roman Judea across the Mediterranean world. Following the example of the apostles — above all Paul of Tarsus, whose journeys founded churches from Antioch to Corinth to Rome — these evangelists walked the empire's roads with little more than a staff, a cloak, and copies of scripture. Persecuted for three centuries, they won converts by tending the sick, sheltering the poor, and preaching in marketplaces and house-churches. By the time Constantine legalised the faith in 313 CE, their quiet, relentless mission had carried Christianity into every province of the empire." },
  },
  {
    religionId: "catholicism",
    preset: { name: "Peter's Pence", desc: "+10% gold and +5% culture — tithes and cathedrals bind Christendom together.", effects: { yieldPercent: { gold: 10, culture: 5 } } },
    capital: { name: "Cathedral See", desc: "+20% culture in the holy city, seat of the Church.", effects: { yieldPercent: { culture: 20 } } },
    unit: { id: "templar_knight", name: "Templar Knight", blurb: "A warrior-monk of the militant orders whose banner emboldens nearby soldiers and whose charge answers to God alone.", art: "a mounted Templar knight on an armored warhorse, chainmail and white surcoat with a red cross, great helm, couched lance and kite shield bearing a red cross, white horse caparison with red crosses, single horse and rider", history: "The Poor Fellow-Soldiers of Christ and of the Temple of Solomon were founded around 1119 to protect Christian pilgrims on the perilous roads to Jerusalem after the First Crusade. Endorsed by Bernard of Clairvaux and the Church, the Templars became the first of the great military orders — warrior-monks bound by vows of poverty, chastity, and obedience who nonetheless fought as heavy cavalry at the sharp end of Crusader armies at battles like Montgisard and Hattin. Their white mantles bearing a red cross became famous across Christendom, and their network of commanderies grew into an early international banking system that financed kings and pilgrims alike. Their wealth and independence bred envy; in 1307 King Philip IV of France had the order's members arrested on trumped-up charges, and in 1312 Pope Clement V suppressed the order, ending two centuries of history in torture and fire." },
  },
  {
    religionId: "orthodoxy",
    preset: { name: "Iconostasis", desc: "+15% culture — gilded icons and domed churches glorify the faith.", effects: { yieldPercent: { culture: 15 } } },
    capital: { name: "Hagia's Light", desc: "+15% culture and +10% faith in the holy city beneath the great dome.", effects: { yieldPercent: { culture: 15, faith: 10 } } },
    unit: { id: "hesychast_monk", name: "Hesychast Monk", blurb: "A monk of ceaseless prayer whose stillness steadies the hearts of every soldier around him.", art: "an Orthodox hesychast monk in black robes and klobuk with a long grey beard, prayer rope in hand, serene closed-eye meditation, candlelight", history: "Hesychasm — from the Greek hesychia, stillness — was the contemplative heart of Eastern Orthodox monasticism, above all on the Holy Mountain of Athos. Its practitioners sought union with God through ceaseless inner prayer, repeating the Jesus Prayer in rhythm with the breath until the mind descended into the heart. In the fourteenth century the monk Gregory Palamas defended the hesychasts' claim to behold the uncreated light of God against the philosopher Barlaam, and his theology of the divine energies was affirmed by councils in Constantinople. From the monasteries of Athos and Sinai this tradition of silent prayer spread across the Orthodox world, shaping the spiritual life of Byzantium, the Slavs, and Rus'." },
  },
  {
    religionId: "islam",
    preset: { name: "House of Wisdom", desc: "+10% science and +5% gold — scholars and merchants carry the faith to a golden age.", effects: { yieldPercent: { science: 10, gold: 5 } } },
    capital: { name: "Grand Madrasa", desc: "+20% science in the holy city's courts of learning.", effects: { yieldPercent: { science: 20 } } },
    unit: { id: "ghazi_warrior", name: "Ghazi", blurb: "A frontier holy warrior whose victories feed the faith and whose cry rallies the ranks.", art: "an early-Islamic ghazi warrior in lamellar armour with a green banner, curved sword raised, turbaned helmet, desert wind", history: "The ghazi was a warrior of the frontier, one who fought in the ghazw — the raiding expeditions along the ever-shifting borders of the Islamic world. From the Umayyad campaigns against Byzantium to the Turkish marches of Anatolia, bands of ghazis combined religious zeal with the older steppe traditions of mounted raiding, drawn to the frontier by faith, plunder, and glory. The early Ottoman state itself grew out of a ghazi beylik on the Byzantine border, and its first rulers styled themselves champions of the faith. Celebrated in frontier epics and warrior-brotherhoods, the ghazi ideal shaped the military culture of Islam from Iberia to India." },
  },
  {
    religionId: "judaism",
    preset: { name: "People of the Book", desc: "+10% science and +5% faith — scripture and study sustain the covenant.", effects: { yieldPercent: { science: 10, faith: 5 } } },
    capital: { name: "The Temple", desc: "+20% faith in the holy city where the Temple stands.", effects: { yieldPercent: { faith: 20 } } },
    unit: { id: "maccabee_zealot", name: "Maccabee Zealot", blurb: "A defender of the covenant who fights hardest on home soil and whose fall only steels his brothers.", art: "a Judean Maccabee rebel fighter in simple bronze scale armour with a round shield and short sword, determined face, rocky hill country", history: "In 167 BCE the Seleucid king Antiochus IV outlawed Jewish worship and defiled the Temple in Jerusalem, sparking a revolt led by the priest Mattathias and his sons. His son Judas — called Maccabeus, the Hammer — welded farmers and shepherds into a guerrilla army that defeated far larger Seleucid forces in the hills of Judea through ambush, zeal, and knowledge of the land. In 164 BCE they retook Jerusalem and rededicated the Temple, an event still commemorated at Hanukkah. Their victory founded the Hasmonean dynasty, which ruled an independent Jewish kingdom for a century until the coming of Rome." },
  },
  {
    religionId: "hinduism",
    preset: { name: "Sacred Rivers", desc: "Fresh-water tiles +1 food and +5% faith — the rivers themselves are holy.", effects: { freshWaterTileFoodBonus: 1, yieldPercent: { faith: 5 } } },
    capital: { name: "Ghats of the Ganges", desc: "+20% food in the holy city on the sacred river.", effects: { yieldPercent: { food: 20 } } },
    unit: { id: "sadhu", name: "Sadhu", blurb: "A wandering ascetic whose darshan blesses warriors and whose presence carries the dharma outward.", art: "a Hindu sadhu ascetic STANDING upright mid-stride with a tall wooden staff, ash-marked skin, saffron cloth, rudraksha beads and a brass water pot, one hand raised in blessing, facing to the left", history: "The sadhu is a holy wanderer of the Indian subcontinent who has renounced home, wealth, and family to pursue moksha — liberation from the cycle of rebirth. Marked with sacred ash and clad in saffron, sadhus have walked India's roads for millennia, living on alms and devoting themselves to meditation, yoga, and austerity. Some follow Shiva, others Vishnu; some gather in vast numbers at pilgrimage festivals like the Kumbh Mela, the largest religious gathering on earth. Revered as living embodiments of detachment, a sadhu's blessing — his darshan, the auspicious sight of a holy person — has long been sought by kings and commoners alike." },
  },
  {
    religionId: "buddhism",
    preset: { name: "The Middle Way", desc: "+10% food and +5% culture — contentment and balance nourish the people.", effects: { yieldPercent: { food: 10, culture: 5 } } },
    capital: { name: "Great Stupa", desc: "+15% culture and +5% faith in the holy city around the relic mound.", effects: { yieldPercent: { culture: 15, faith: 5 } } },
    unit: { id: "bodhisattva", name: "Bodhisattva", blurb: "An enlightened guide who heals the suffering and stills the fury of enemies who draw near.", art: "a serene Buddhist bodhisattva figure in flowing robes with a lotus flower, gentle smile, subtle halo, monastery garden", history: "In the Mahayana tradition that spread across East Asia, a bodhisattva is one who has attained the threshold of enlightenment yet vows to remain in the world of suffering until every being is freed. Figures such as Avalokiteshvara, the bodhisattva of compassion — known as Guanyin in China and Kannon in Japan — became among the most beloved objects of devotion in all of Buddhism. Their ideal of boundless compassion, expressed through the perfections of generosity, patience, and wisdom, reshaped the spiritual life of India, Tibet, China, Korea, and Japan. Carried by monks and merchants along the Silk Road, the bodhisattva path offered salvation not through withdrawal but through the vow to save all beings." },
  },
  {
    religionId: "zoroastrianism",
    preset: { name: "Sacred Flame", desc: "+10% production — the fire temples never go cold.", effects: { yieldPercent: { production: 10 } } },
    capital: { name: "Fire Temple", desc: "+20% production in the holy city around the eternal flame.", effects: { yieldPercent: { production: 20 } } },
    unit: { id: "flame_magus", name: "Magus of the Flame", blurb: "A fire-priest whose purifying flame scorches the wicked and unsettles every foe who nears it.", art: "a Zoroastrian magus priest in cream and crimson robes and a tall cap, striding forward holding aloft a burning bronze torch of sacred fire in one hand, flame reflected in his eyes", history: "The magi were the hereditary priesthood of ancient Persia, keepers of the sacred fire that was the earthly symbol of Ahura Mazda's truth and light. In the fire temples of the Achaemenid, Parthian, and Sasanian empires they tended flames that were never allowed to die, chanted the hymns of the Avesta, and conducted the rituals of purity that governed Zoroastrian life. Learned in astronomy and ritual, the magi gave their name to the word magic, and it was magi who, in the Christian gospel, were said to have followed a star to Bethlehem. After the Arab conquest of Persia their fire temples were extinguished one by one, and the surviving faithful carried their sacred flames into exile in India, where they became the Parsis." },
  },
  {
    religionId: "jainism",
    preset: { name: "Merchant Piety", desc: "+15% gold — the ahimsa of the counting house prospers.", effects: { yieldPercent: { gold: 15 } } },
    capital: { name: "Marble Temples", desc: "+20% gold in the holy city of carved white shrines.", effects: { yieldPercent: { gold: 20 } } },
    unit: { id: "ahimsa_ascetic", name: "Ahimsa Ascetic", blurb: "A radical pacifist who cannot strike a blow — yet enemies falter before him, and shame wounds any who strike him.", art: "a lone Jain ascetic monk in plain white cloth robes with a small peacock-feather broom in hand and a white cloth over his mouth, walking barefoot with serene discipline, no background elements, isolated single figure", history: "The Jain muni, or ascetic, takes the principle of ahimsa — non-violence toward every living thing — to its furthest extreme. Renewed by Mahavira in the sixth century BCE, Jain monks sweep the ground before them with a soft broom to avoid crushing insects, strain their water, and some wear a cloth over the mouth lest they inhale a living creature. Renouncing all possessions and violence, they pursue the liberation of the soul through austerity, truth, and radical restraint, some fasting unto death in the rite of sallekhana. Though few in number, Jain ascetics exerted a moral influence across India far out of proportion to their size — an influence that would echo centuries later in Gandhi's philosophy of nonviolence." },
  },
  {
    religionId: "sikhism",
    preset: { name: "Sant-Sipahi", desc: "Melee units +2 combat and trained units +5 morale — saint and soldier in one.", effects: { unitClassCombat: { melee: 2 }, startMoraleBonus: 5 } },
    capital: { name: "Khalsa Muster", desc: "Units train 20% faster in the holy city.", effects: { trainTimePercent: -20 } },
    unit: { id: "nihang_warrior", name: "Nihang", blurb: "A fearless blue-clad warrior whose steel chakram whirls through every enemy at his side.", art: "a Sikh Nihang warrior in deep blue robes and towering turban with steel chakrams and a curved talwar, fearless bearing", history: "The Akali Nihangs were the warrior-ascetics of the Sikh Khalsa, an order traditionally traced to Guru Gobind Singh, who founded the Khalsa in 1699. Clad in deep blue robes and towering dumalla turbans bristling with steel quoits — the razor-edged chakram — they were famed for fearlessness, martial skill, and a refusal to bow to any earthly power. Nihangs formed the shock troops and vanguard of Sikh armies through the eighteenth-century wars against the Mughals and Afghans, holding out in the forests and defending the faith when the community was hunted. To this day they preserve the traditional martial art of gatka and the memory of the Khalsa's armed struggle." },
  },
  {
    religionId: "taoism",
    preset: { name: "Harmony of Qi", desc: "+10% food and all units heal +2 HP per turn — the Way restores all things.", effects: { yieldPercent: { food: 10 }, unitHealPerTurn: 2 } },
    capital: { name: "Mountain Monastery", desc: "+10% food and +10% science in the holy city between the peaks.", effects: { yieldPercent: { food: 10, science: 10 } } },
    unit: { id: "sage_of_the_way", name: "Sage of the Way", blurb: "A wandering sage whose effortless path speeds nearby soldiers and mends their wounds.", art: "an elderly Taoist sage in grey robes with a gnarled staff and gourd, wispy white beard, misty mountain path", history: "The Taoist sage sought harmony with the Tao, the nameless Way that underlies all nature, through simplicity, spontaneity, and wu wei — action through non-action. Following the teachings attributed to Laozi and Zhuangzi, such hermits withdrew to the mountains to cultivate the breath, refine the spirit, and search for the elixir of long life. Their pursuits shaped Chinese medicine, alchemy, painting, and poetry, and their quiet influence balanced the ordered formality of Confucian society. The image of the white-bearded immortal wandering the misty peaks became one of the most enduring in all of Chinese art." },
  },
  {
    religionId: "confucianism",
    preset: { name: "Civil Examinations", desc: "+10% culture and +5% science — virtue and merit order the state.", effects: { yieldPercent: { culture: 10, science: 5 } } },
    capital: { name: "Imperial Academy", desc: "+15% science and +5% culture in the holy city of scholars.", effects: { yieldPercent: { science: 15, culture: 5 } } },
    unit: { id: "imperial_scholar", name: "Imperial Scholar", blurb: "A scholar-official whose drills school nearby troops and whose administration hastens the city that hosts him.", art: "a Confucian scholar-official in silk hanfu robes and black scholar's cap holding a bamboo scroll, dignified posture, palace courtyard", history: "For two thousand years China was governed not by a warrior aristocracy but by a class of scholar-officials chosen through the imperial examinations. Steeped in the Confucian classics, candidates endured gruelling multi-day examinations that tested their mastery of ritual, poetry, and moral philosophy, and success could raise a farmer's son to the heights of the state. The ideal of the junzi — the cultivated gentleman who governs through virtue and proper ritual rather than force — ordered society around filial piety, learning, and merit. Emulated across Korea, Vietnam, and Japan, this meritocratic bureaucracy was among the most sophisticated systems of government in the pre-modern world." },
  },
  {
    religionId: "shinto",
    preset: { name: "Kami of Shore and Grove", desc: "Coastal cities +1 faith and +1 food — the spirits dwell in every bay.", effects: { coastalCityYield: { faith: 1, food: 1 } } },
    capital: { name: "Grand Shrine", desc: "+15% faith and +5% culture in the holy city beneath the torii.", effects: { yieldPercent: { faith: 15, culture: 5 } } },
    unit: { id: "miko_priestess", name: "Miko", blurb: "A shrine maiden whose kagura dance heals and heartens, and whose sight pierces every ambush.", art: "a lone Shinto miko shrine maiden standing in white kosode and red hakama holding kagura suzu bells in one raised hand, long black hair, calm watchful eyes, no background elements, isolated single figure", history: "The miko is a shrine maiden of Japan's indigenous Shinto faith, a servant of the kami whose roles reach back into the earliest history of the islands. In ancient times miko were shamanesses and oracles who entered trance to convey the will of the gods; the legendary queen Himiko who ruled early Japan may have been such a figure. In later centuries their office became more ceremonial — performing the sacred kagura dances, purifying worshippers, and assisting the priests at festivals. Clad in white kosode and crimson hakama, the miko remains one of the most recognisable images of Shinto devotion." },
  },
  {
    religionId: "tengrism",
    preset: { name: "Eternal Blue Sky", desc: "Cavalry +2 combat and mounted units +1 sight — the sky watches over the horde.", effects: { unitClassCombat: { cavalry: 2 }, mountedSightBonus: 1 } },
    capital: { name: "Sacred Ovoo", desc: "+10% production and +10% faith in the holy city beneath the sky shrine.", effects: { yieldPercent: { production: 10, faith: 10 } } },
    unit: { id: "sky_shaman", name: "Sky Shaman", blurb: "A mounted shaman who rides with the wind, quickening and heartening the riders around him.", art: "a Mongolian steppe shaman on horseback in fur and feathers with a great frame drum, arms raised to a vast blue sky", history: "Among the Turkic and Mongol peoples of the Eurasian steppe, the shaman — the boo or kam — mediated between the world of men and the spirits of the Eternal Blue Sky, Tengri. Beating a great frame drum to enter trance, the shaman ascended in spirit to the heavens or descended to the underworld to heal the sick, foretell the future, guide the souls of the dead, and read omens before battle. Genghis Khan himself claimed the mandate of Tengri, and his shaman Kokochu wielded great influence at the founding of the Mongol Empire. Riding with the horde across Eurasia, the sky-worship of the steppe endured alongside — and often within — the Buddhism and Islam that later spread among the nomads." },
  },
  {
    religionId: "norse",
    preset: { name: "Wrath of the North", desc: "+25% gold from coastal raids and embarked units +2 combat — the gods favor the bold.", effects: { coastalRaidGoldPercent: 25, embarkedCombatBonus: 2 } },
    capital: { name: "Great Mead Hall", desc: "+10% production and +10% gold in the holy city's feast-hall.", effects: { yieldPercent: { production: 10, gold: 10 } } },
    unit: { id: "gothi_warpriest", name: "Gothi War-Priest", blurb: "A priest of the old gods who turns every nearby death into fury — fallen comrades rally the line, and blood feeds the faith.", art: "a Norse gothi war-priest in bear fur and runic amulets holding a ritual axe and oath-ring, braided beard, longship shore", history: "In the pre-Christian north the godi was both chieftain and priest, a leader who presided over the blot sacrifices to the Aesir and Vanir and kept the peace at the local assembly, the thing. In Iceland the godar were the ruling class, their authority resting on both their temples and their followings of armed free men. They led the great feasts in the mead-hall, cast lots and read omens, and dedicated warriors to Odin, who chose the slain for the feast-halls of Valhalla. When Iceland converted to Christianity around the year 1000, it was the godar themselves who debated and decided the change at the Althing." },
  },
  {
    religionId: "hellenism",
    preset: { name: "Panhellenic Games", desc: "+10% culture and trained units +5 XP — excellence honors the gods.", effects: { yieldPercent: { culture: 10 }, startXpBonus: 5 } },
    capital: { name: "Oracle's Sanctuary", desc: "+15% culture and +5% science in the holy city of the sanctuary.", effects: { yieldPercent: { culture: 15, science: 5 } } },
    unit: { id: "oracle_of_delphi", name: "Oracle", blurb: "A seeress whose prophecies expose what is hidden and doom those she names.", art: "a Greek oracle priestess on a bronze tripod wreathed in laurel and rising vapors, white chiton, distant unfocused prophetic gaze, Delphic temple columns", history: "At Delphi, the navel of the Greek world, the priestess known as the Pythia delivered the prophecies of Apollo for over a thousand years. Seated on a bronze tripod above a cleft in the rock, wreathed in laurel and rising vapours, she spoke in the god's voice, and her often riddling answers were sought by private citizens and kings alike. No colony was founded, no war undertaken, without consulting the oracle; Croesus of Lydia, Sparta, and Athens all shaped their fates by her words. The most famous of her maxims — know thyself, and nothing in excess — were carved at the temple's entrance, and the oracle's authority endured until Christian emperors silenced it in the fourth century CE." },
  },
  {
    religionId: "egyptian",
    preset: { name: "Gift of the Nile", desc: "Fresh-water tiles +1 food and desert cities +1 faith — the river is life, the desert eternity.", effects: { freshWaterTileFoodBonus: 1, desertCityYield: { faith: 1 } } },
    capital: { name: "Karnak Rising", desc: "+15% production and +5% faith in the holy city of great temples.", effects: { yieldPercent: { production: 15, faith: 5 } } },
    unit: { id: "mortuary_priest", name: "Mortuary Priest", blurb: "A priest of the dead who harvests faith from every soul that falls near him, friend or foe.", art: "an ancient Egyptian mortuary priest in white linen and leopard-skin sash holding an ankh and censer, shaved head, kohl-lined eyes, temple of the dead", history: "In ancient Egypt the cult of the dead required a permanent priesthood to sustain the deceased in the afterlife. The mortuary priests, above all the sem priest in his leopard-skin sash, performed the rites of embalming and the Opening of the Mouth ceremony that restored the mummy's senses for eternity. Endowed by the wealthy with land and offerings, these priests recited spells, burned incense, and laid out bread, beer, and meat before the tomb so the ka of the dead would never hunger. For a civilisation that spent its wealth preparing for the journey beyond death, they were the guardians of the passage from this world to the next." },
  },
  {
    religionId: "mesopotamian",
    preset: { name: "Cradle of Civilization", desc: "Worked farm tiles +1 food and +5% science — the first fields, the first writing.", effects: { farmTileFoodBonus: 1, yieldPercent: { science: 5 } } },
    capital: { name: "Great Ziggurat", desc: "+15% science and +5% gold in the holy city beneath the tower.", effects: { yieldPercent: { science: 15, gold: 5 } } },
    unit: { id: "ziggurat_astrologer", name: "Ziggurat Astrologer", blurb: "A priest of the stars whose omens school nearby troops, enrich his temple city, and confound its enemies.", art: "a Mesopotamian astrologer-priest in fringed robes and conical cap reading a clay star-tablet atop a ziggurat at night, oil lamp", history: "From the summits of their mud-brick ziggurats, the priests of Babylon and Assyria watched the heavens for the messages of the gods. Believing that the movements of the sun, moon, and planets foretold the fate of kings and cities, they compiled meticulous records of eclipses and omens over centuries — records that made them the world's first true astronomers. Their star-catalogues and mathematical methods for predicting celestial events were inherited by the Greeks and passed down to shape astronomy for two millennia. Serving the temple of Marduk and the great gods Anu and Enlil, the astrologer-priest stood at the meeting point of religion, science, and statecraft in humanity's oldest civilisation." },
  },
  {
    religionId: "druidism",
    preset: { name: "Sacred Groves", desc: "Forest tiles +1 faith and units fighting in your forests +2 combat.", effects: { forestTileFaithBonus: 1, forestTileCombatBonus: 2 } },
    capital: { name: "Grove Sanctum", desc: "+15% food and +5% faith in the holy city ringed by old oaks.", effects: { yieldPercent: { food: 15, faith: 5 } } },
    unit: { id: "archdruid", name: "Archdruid", blurb: "A keeper of the groves who vanishes into the trees, where his healing and his curses grow twice as strong.", art: "a Celtic archdruid in deep green hooded robes with a golden sickle and oak staff, mistletoe crown, ancient mossy oak grove", history: "The druids were the learned priestly class of the Celtic peoples of Gaul, Britain, and Ireland — at once priests, judges, healers, and keepers of tradition. According to Julius Caesar and other classical writers, they presided over sacrifices in sacred oak groves, administered the law, and taught a doctrine of the soul's immortality, committing their vast learning to memory over twenty years of training rather than to writing. They wielded immense authority, able to halt wars between tribes and to bar wrongdoers from the sacrifices. The Roman conquest and the coming of Christianity destroyed the druidic order, and because they left no writings of their own, much of what they knew was lost with them." },
  },
  {
    religionId: "manichaeism",
    preset: { name: "Light in Every Land", desc: "+2 faith and +1 gold per trade route — the gospel of light travels with the caravans.", effects: { tradeRouteFaithBonus: 2, tradeRouteGoldBonus: 1 } },
    capital: { name: "Scriptorium of Light", desc: "+15% gold and +5% science in the holy city of illuminated books.", effects: { yieldPercent: { gold: 15, science: 5 } } },
    unit: { id: "elect_missionary", name: "Elect", blurb: "A fasting missionary of the light whose mere passage converts cities faster than any other preacher alive.", art: "a Manichaean elect missionary in pure white robes and tall white cap carrying an illuminated gospel book painted with gold light rays, Silk Road caravanserai", history: "The religion founded by the prophet Mani in third-century Persia divided its followers into two ranks: the ordinary Hearers, and the Elect, who lived in strict purity to free the particles of divine light imprisoned in matter. The Elect renounced marriage, property, and labour that might harm living things, ate only ritually prepared food, and devoted themselves to prayer, fasting, and the copying of beautifully illuminated scriptures. As missionaries they carried Mani's gospel of light along the Silk Road, and for a time Manichaeism stretched from Roman North Africa — where the young Augustine was a Hearer — to Tang China and the Uyghur steppe. Hunted as heretics by Zoroastrians, Christians, and Muslims alike, the Elect and their faith were eventually driven to extinction." },
  },
  {
    religionId: "aztec",
    preset: { name: "Nourish the Sun", desc: "Kills yield 6 faith — every fallen enemy feeds Huitzilopochtli.", effects: { faithOnKill: 6 } },
    capital: { name: "Templo Mayor", desc: "+15% faith and +5% production in the holy city of the great pyramid.", effects: { yieldPercent: { faith: 15, production: 5 } } },
    unit: { id: "eagle_priest", name: "Eagle Priest", blurb: "A warrior-priest who takes captives for the sun — his kills pour faith to the altar and terror into enemy hearts.", art: "an Aztec eagle warrior-priest in feathered eagle helmet and jaguar-trimmed regalia with obsidian macuahuitl, fierce war paint, pyramid steps", history: "Among the Mexica the eagle warriors were an elite military order, and the line between warrior and priest ran through the temples of Tenochtitlan. The Aztecs believed the sun-god Huitzilopochtli required the nourishment of human hearts to rise each day and hold off the end of the world, and war was waged in part to take captives for sacrifice. Warrior-priests in eagle regalia climbed the steps of the Templo Mayor to offer these captives atop the great pyramid, sustaining the cosmos through blood. This union of war, priesthood, and sacrifice lay at the heart of Aztec power until the Spanish conquest shattered it in 1521." },
  },
  {
    religionId: "maya",
    preset: { name: "The Long Count", desc: "+10% science and +5% culture — the calendar orders heaven and earth.", effects: { yieldPercent: { science: 10, culture: 5 } } },
    capital: { name: "Observatory Pyramid", desc: "+15% science and +5% faith in the holy city that watches the stars.", effects: { yieldPercent: { science: 15, faith: 5 } } },
    unit: { id: "daykeeper", name: "Daykeeper", blurb: "A calendar priest whose auguries drill nearby troops and, at the appointed hour, darken the sky over his enemies.", art: "a Maya daykeeper priest in jade ornaments and quetzal-feather headdress reading a folded bark codex, glyph stela and stepped pyramid behind", history: "The aj q'ij, or daykeeper, was the calendar priest of the Maya, master of the sacred 260-day tzolk'in count and the intricate Long Count that reckoned cosmic time. By tracking the interlocking cycles of the calendar and the movements of Venus and the moon, the daykeeper cast auguries, named children, and chose auspicious days for planting, marriage, and war. Maya astronomer-priests achieved extraordinary precision, calculating the length of the solar year and predicting eclipses from their observatories atop the jungle pyramids. Remarkably, the tradition never wholly died: daykeepers still count the sacred calendar in the highlands of Guatemala today." },
  },
  {
    religionId: "inca",
    preset: { name: "Children of Inti", desc: "Hill tiles +1 production and +5% gold — the sun gilds the mountain empire.", effects: { hillTileProductionBonus: 1, yieldPercent: { gold: 5 } } },
    capital: { name: "Coricancha", desc: "+15% gold and +5% faith in the holy city sheathed in sun-gold.", effects: { yieldPercent: { gold: 15, faith: 5 } } },
    unit: { id: "sun_priest", name: "Sun Priest of Inti", blurb: "A golden priest of the sun whose warmth mends and heartens soldiers, and whose temple gilds the city that hosts him.", art: "an Inca high priest of Inti in a golden sun-disc pectoral and fine vicuña textiles raising a ceremonial kero cup to the sun, Andean peaks", history: "At the summit of the Inca religious hierarchy stood the Willaq Umu, the high priest of the sun-god Inti, who was regarded as the divine ancestor of the emperor himself. From the Coricancha in Cuzco — the golden Temple of the Sun, its walls once sheathed in plates of gold — the priesthood conducted the great festivals of the Andean year, above all Inti Raymi, the festival of the sun at the winter solstice. They oversaw the mountain-top shrines and the chosen women, the acllas, who wove fine cloth and brewed the sacred chicha for the rites. Bound to the person of the emperor, the sun cult crowned the Andes until Pizarro's conquest tore the gold from the temple walls in 1533." },
  },
  {
    religionId: "yoruba",
    preset: { name: "Ifá Wisdom", desc: "+10% culture and +5% gold — divination and drumming order the city.", effects: { yieldPercent: { culture: 10, gold: 5 } } },
    capital: { name: "Ilé-Ifẹ̀ Crown", desc: "+15% culture and +5% gold in the holy city of the crowned kings.", effects: { yieldPercent: { culture: 15, gold: 5 } } },
    unit: { id: "babalawo", name: "Babalawo", blurb: "A diviner of Ifá who reads what is hidden, steadies hearts with the talking drum, and calls the orisha's favor onto a chosen warrior.", art: "a Yoruba babalawo diviner in indigo agbada robes and cowrie-shell beads casting an opele divination chain over a carved wooden tray, talking drum at his side", history: "The babalawo — literally father of secrets — is the priest and diviner of Ifa, the sophisticated system of wisdom at the heart of Yoruba religion in West Africa. Through casting a chain of seed-pods or marking sacred palm-nuts, the babalawo reads one of 256 figures, each linked to a vast body of memorised verses that reveal the will of the orisha and the path a person must take. Years of apprenticeship are required to master this oral corpus, one of the most complex divination systems ever developed. Carried across the Atlantic in the holds of slave ships, the traditions of the babalawo took root in the New World, surviving in the Santeria of Cuba and the Candomble of Brazil." },
  },
];

const RELIGION_KIT_BY_ID = new Map(RELIGION_KITS.map((k) => [k.religionId, k]));
export const getReligionKit = (religionId: string | undefined) =>
  religionId ? RELIGION_KIT_BY_ID.get(religionId) : undefined;
/** The religion kit whose unique unit has the given unit type id. */
const RELIGION_KIT_BY_UNIT = new Map(RELIGION_KITS.map((k) => [k.unit.id, k]));
export const religionKitForUnit = (unitTypeId: string | undefined) =>
  unitTypeId ? RELIGION_KIT_BY_UNIT.get(unitTypeId) : undefined;

// ---- Wonders (great Works built by pooled specialists) -------------------
// Requirement keys are specialist disciplines: "carpentry" | "survey" |
// "masonry" | "architecture" | "engineering". Kept as loose strings so this
// package stays dependency-free.

export interface WonderEffect {
  /** Flat per-turn yield added to EVERY city the owner controls. */
  yieldPerCity?: { food?: number; production?: number; gold?: number; science?: number; culture?: number; faith?: number };
  /** Flat per-turn yield added to the host city only. */
  yieldHostCity?: { food?: number; production?: number; gold?: number; science?: number; culture?: number; faith?: number };
  /** Grant the owner a free, already-available technology on completion. */
  freeTech?: boolean;
  /** Passive empire-wide bonuses granted to the wonder's owner, merged into their
   *  CivEffects exactly like a policy or civ ability (e.g. faster ships, rush-with-faith). */
  civEffects?: Partial<CivEffects>;
  /** +N sight range for ALL of the owner's naval units (Great Lighthouse). */
  shipSightBonus?: number;
  /** Faith granted to the owner each time one of their Legends dies OR expires
   *  (Great Pyramid — a grand tomb that sanctifies fallen heroes). */
  faithOnLegendDeath?: number;
  /** Every N turns, spawn a free (no-upkeep) ship at the wonder's host city
   *  (Colossus). `spawnShipType` names the unit (defaults to a galley). */
  spawnShipEveryTurns?: number;
  spawnShipType?: string;
}

/** Terrain/geography constraints on where a wonder may be raised. Interpreted by
 *  @roc/sim's `canStartWonder` against the live map (this package stays map-agnostic);
 *  `site` is the human-readable requirement shown in the build UI and errors. */
export interface WonderPlacement {
  /** The wonder's own tile must be one of these terrains. */
  terrain?: string[];
  /** The wonder sits on a coastal WATER tile (open water that borders land). */
  coastalWater?: boolean;
  /** The (land) tile must border at least one water tile. */
  adjacentToWater?: boolean;
  /** The tile must have or border fresh water (a river or a lake). */
  freshWater?: boolean;
  /** At least one neighbouring tile must be one of these terrains. */
  adjacentTerrain?: string[];
  /** Some tile within `range` hexes must be one of these terrains. */
  nearTerrain?: { terrain: string[]; range: number };
  /** The tile must be adjacent to one of the builder's own cities. */
  adjacentToCity?: boolean;
  /** Short human-readable requirement, e.g. "a desert tile" (used as "requires …"). */
  site: string;
}

export interface WonderDef {
  id: string;
  name: string;
  desc: string;
  /** The crew of craftsmen, by discipline, that must be committed to raise the
   *  wonder — you need this many free specialists of each craft to *start* it, and
   *  no more than this many may work it. Raising the wonder then takes a fixed span
   *  of construction (see WONDER_BUILD_TURNS in @roc/sim): even the full crew is a
   *  long undertaking, and it's the crew you must gather, not a labour total you can
   *  rush by piling on bodies. */
  crew: Record<string, number>;
  /** Technology (a TechId in @roc/sim; kept as a string here so @roc/data stays
   *  dependency-free) that must be researched before the wonder can be started. */
  reqTech?: string;
  /** One-time resources spent from the owner's treasury when the wonder is STARTED,
   *  on top of gathering the crew. Wonders vary which currency they demand. */
  goldCost?: number;
  faithCost?: number;
  cultureCost?: number;
  /** Where on the map the wonder may be sited (terrain/geography gate). */
  placement?: WonderPlacement;
  effect: WonderEffect;
}

export const WONDER_DEFS: WonderDef[] = [
  {
    id: "great_pyramid",
    name: "Great Pyramid",
    desc: "A monumental tomb whose construction organises a whole society. +2 production in every city, +2 culture in the host city — and a great offering of faith whenever one of your Legends dies or passes into legend.",
    crew: { masonry: 11, architecture: 6 },
    reqTech: "masonry",
    goldCost: 150,
    placement: { terrain: ["desert", "mesa"], site: "a desert tile" },
    effect: {
      yieldPerCity: { production: 2 },
      yieldHostCity: { culture: 2 },
      faithOnLegendDeath: 60,
    },
  },
  {
    id: "hanging_gardens",
    name: "Hanging Gardens",
    desc: "Terraced gardens fed by ingenious irrigation. +2 food in every city and +2 culture in the host city.",
    crew: { carpentry: 6, architecture: 6, engineering: 4 },
    reqTech: "irrigation",
    goldCost: 120,
    placement: { freshWater: true, site: "fresh water beside it (a river or lake)" },
    effect: { yieldPerCity: { food: 2 }, yieldHostCity: { culture: 2 } },
  },
  {
    id: "great_library",
    name: "Great Library",
    desc: "A vast repository of the world's knowledge. +4 science in the host city, +1 science in every city, and a free technology on completion.",
    crew: { architecture: 7, engineering: 5 },
    reqTech: "writing",
    cultureCost: 120,
    placement: { adjacentToCity: true, site: "a tile beside one of your cities" },
    effect: { yieldPerCity: { science: 1 }, yieldHostCity: { science: 4 }, freeTech: true },
  },
  {
    id: "colossus",
    name: "Colossus",
    desc: "A towering bronze statue guarding a great harbour. +5 gold in the host city, +2 gold to every trade route — and every 6 turns its shipyards launch a warship that costs no upkeep.",
    crew: { masonry: 6, engineering: 6 },
    reqTech: "bronze_alloying",
    goldCost: 140,
    placement: { adjacentToWater: true, site: "a coastal tile beside the sea" },
    effect: {
      yieldHostCity: { gold: 5 },
      civEffects: { tradeRouteGoldBonus: 2 },
      spawnShipEveryTurns: 6,
      spawnShipType: "galley",
    },
  },
  {
    id: "great_lighthouse",
    name: "Great Lighthouse",
    desc: "A beacon that draws trade from across the sea. +1 gold in every city, +2 science in the host city — and all your ships gain +2 sight and +1 movement.",
    crew: { masonry: 5, architecture: 5, engineering: 5 },
    reqTech: "sailing",
    goldCost: 130,
    placement: { coastalWater: true, site: "a coastal water tile" },
    effect: {
      yieldPerCity: { gold: 1 },
      yieldHostCity: { science: 2 },
      shipSightBonus: 2,
      civEffects: { navalMovementBonus: 1 },
    },
  },
  {
    id: "sphinx",
    name: "Great Sphinx",
    desc: "An enigmatic guardian carved from living rock. +3 culture and +3 gold in the host city, and +1 culture in every city.",
    crew: { masonry: 9, architecture: 5 },
    reqTech: "monumental_architecture",
    cultureCost: 100,
    placement: { terrain: ["desert", "mesa"], site: "a desert tile" },
    effect: { yieldPerCity: { culture: 1 }, yieldHostCity: { culture: 3, gold: 3 } },
  },
  {
    id: "stonehenge",
    name: "Stonehenge",
    desc: "An ancient ring of standing stones aligned to the heavens. +1 faith in every city and +3 faith in the host city.",
    crew: { masonry: 9, survey: 4 },
    reqTech: "ritual_burial",
    faithCost: 80,
    placement: { nearTerrain: { terrain: ["mountains"], range: 5 }, site: "a site within 5 tiles of a mountain" },
    effect: { yieldPerCity: { faith: 1 }, yieldHostCity: { faith: 3 } },
  },
  {
    id: "oracle",
    name: "The Oracle",
    desc: "A sacred temple whose prophecies guide the people. +3 faith and +2 science in the host city, +1 faith in every city — and its prophecies let you rush production with faith.",
    crew: { architecture: 6, masonry: 5 },
    reqTech: "theology",
    faithCost: 120,
    placement: { adjacentTerrain: ["mountains"], site: "a tile beside a mountain" },
    effect: {
      yieldPerCity: { faith: 1 },
      yieldHostCity: { faith: 3, science: 2 },
      civEffects: { rushWithFaith: true },
    },
  },
  {
    id: "tenochtitlan",
    name: "Tenochtitlán",
    desc: "A magnificent island capital of canals and causeways. +1 food and +1 production in every city, +2 gold in the host city — and its causeways grant all your land units +1 movement.",
    crew: { engineering: 7, architecture: 6, masonry: 5 },
    reqTech: "engineering",
    goldCost: 160,
    placement: { terrain: ["hills"], site: "a hill" },
    effect: {
      yieldPerCity: { food: 1, production: 1 },
      yieldHostCity: { gold: 2 },
      civEffects: { landMovementBonus: 1 },
    },
  },
];

const WONDER_BY_ID = new Map(WONDER_DEFS.map((w) => [w.id, w]));
export const getWonder = (id: string | undefined) => (id ? WONDER_BY_ID.get(id) : undefined);
export const WONDER_IDS: string[] = WONDER_DEFS.map((w) => w.id);

// ---- Natural Wonders -----------------------------------------------------
// Awe-inspiring features of the natural world (Everest, the Grand Canyon, the
// Great Barrier Reef…). Unlike the built world-wonders above, these are placed
// on the map at world-gen, span 1–4 contiguous tiles, and reward the FIRST civ
// to lay eyes on them. Worked by a citizen inside a civ's borders, each tile
// also yields bonus output. The first civ to have sighted EVERY natural wonder
// earns a grand one-time bonus (see ALL_NATURAL_WONDERS_BONUS).

/** A one-time reward granted to a civilization (the first discoverer / completer). */
export interface NaturalWonderBonus {
  science?: number;
  faith?: number;
  gold?: number;
  culture?: number;
  /** Grant the recipient a free, already-available technology. */
  freeTech?: boolean;
}

export interface NaturalWonderDef {
  id: string;
  name: string;
  /** Short flavour line shown in the tile panel and discovery announcement. */
  desc: string;
  /** Terrains this wonder may occupy (used for placement; the wonder then
   *  replaces that tile's art with its own full-tile illustration). */
  validTerrain: string[];
  /** Per-turn bonus yields a citizen working the wonder tile adds to its city. */
  tileYields: { food?: number; production?: number; gold?: number; science?: number; culture?: number; faith?: number };
  /** One-time reward to the first civ to sight this wonder. */
  discoveryBonus: NaturalWonderBonus;
}

const NW = (d: NaturalWonderDef): NaturalWonderDef => d;

// Every natural wonder is a single, full map tile. Worked-tile yields are strong
// (these are rare, unique tiles) and the discovery reward to the FIRST civ to
// sight each is a meaningful one-time burst, themed to the wonder.
export const NATURAL_WONDER_DEFS: NaturalWonderDef[] = [
  // ---- sacred & towering peaks (science / faith) --------------------------
  NW({ id: "mount_everest", name: "Mount Everest", desc: "The highest peak on Earth, roof of the world.", validTerrain: ["mountains"], tileYields: { science: 3, faith: 1 }, discoveryBonus: { science: 90, faith: 40 } }),
  NW({ id: "mount_kilimanjaro", name: "Mount Kilimanjaro", desc: "A snow-capped volcano towering over the savanna.", validTerrain: ["mountains"], tileYields: { food: 2, faith: 2 }, discoveryBonus: { faith: 70, culture: 40 } }),
  NW({ id: "mount_fuji", name: "Mount Fuji", desc: "A sacred, perfectly symmetrical volcanic cone.", validTerrain: ["mountains", "volcano"], tileYields: { faith: 3, culture: 1 }, discoveryBonus: { faith: 90, culture: 40 } }),
  NW({ id: "matterhorn", name: "Matterhorn", desc: "An iconic pyramidal Alpine peak on the Swiss-Italian border.", validTerrain: ["mountains"], tileYields: { science: 2, culture: 2 }, discoveryBonus: { science: 60, culture: 50 } }),
  NW({ id: "mount_vesuvius", name: "Mount Vesuvius", desc: "A restless volcano whose ash preserves whole cities.", validTerrain: ["volcano", "mountains"], tileYields: { production: 3, science: 1 }, discoveryBonus: { science: 60, gold: 40 } }),
  NW({ id: "table_mountain", name: "Table Mountain", desc: "A flat-topped massif guarding a great cape.", validTerrain: ["mountains", "mesa"], tileYields: { culture: 2, gold: 1, science: 1 }, discoveryBonus: { culture: 70, gold: 40 } }),
  NW({ id: "uluru", name: "Uluru", desc: "A vast red monolith sacred to its people.", validTerrain: ["desert", "mesa"], tileYields: { faith: 3, culture: 1 }, discoveryBonus: { faith: 80, culture: 50 } }),
  NW({ id: "mount_roraima", name: "Mount Roraima", desc: "A sheer-walled tabletop mountain wreathed in cloud.", validTerrain: ["mesa", "mountains"], tileYields: { science: 3, food: 1 }, discoveryBonus: { science: 90 } }),

  // ---- rock & desert wonders (science / gold / faith) ---------------------
  NW({ id: "eye_of_the_sahara", name: "Eye of the Sahara", desc: "A colossal bullseye of rock rings in the desert.", validTerrain: ["desert"], tileYields: { science: 3, gold: 1 }, discoveryBonus: { science: 80, gold: 50 } }),
  NW({ id: "grand_canyon", name: "Grand Canyon", desc: "A mile-deep gorge carved over eons.", validTerrain: ["mesa", "desert"], tileYields: { science: 2, gold: 2 }, discoveryBonus: { science: 90, gold: 50 } }),
  NW({ id: "salar_de_uyuni", name: "Salar de Uyuni", desc: "The world's largest salt flat, a mirror to the sky.", validTerrain: ["desert"], tileYields: { gold: 3, production: 1 }, discoveryBonus: { gold: 110 } }),
  NW({ id: "zhangye_danxia", name: "Zhangye Danxia", desc: "Rainbow-banded sandstone ridges.", validTerrain: ["mesa", "desert"], tileYields: { culture: 2, science: 1, gold: 1 }, discoveryBonus: { culture: 60, science: 40 } }),
  NW({ id: "cappadocia", name: "Cappadocia", desc: "Fairy-chimney spires and hidden cave cities.", validTerrain: ["mesa", "hills"], tileYields: { faith: 2, culture: 1, production: 1 }, discoveryBonus: { faith: 60, culture: 60 } }),
  NW({ id: "pamukkale", name: "Pamukkale", desc: "Cascading white travertine terraces and hot springs.", validTerrain: ["hills"], tileYields: { faith: 2, gold: 1, culture: 1 }, discoveryBonus: { faith: 50, culture: 50 } }),
  NW({ id: "sahara_dunes", name: "Sahara", desc: "An endless sea of wind-sculpted dunes.", validTerrain: ["desert"], tileYields: { gold: 2, faith: 1, production: 1 }, discoveryBonus: { gold: 90, faith: 40 } }),

  // ---- coasts, reefs & islands (gold / science) ---------------------------
  NW({ id: "great_barrier_reef", name: "Great Barrier Reef", desc: "The largest living structure on Earth.", validTerrain: ["coast"], tileYields: { food: 3, gold: 2, science: 1 }, discoveryBonus: { gold: 80, science: 60 } }),
  NW({ id: "galapagos_islands", name: "Galápagos Islands", desc: "Isolated isles teeming with singular life.", validTerrain: ["coast"], tileYields: { science: 3, food: 1 }, discoveryBonus: { science: 90, freeTech: true } }),
  NW({ id: "cliffs_of_dover", name: "White Cliffs of Dover", desc: "Gleaming chalk cliffs facing the sea.", validTerrain: ["coast", "hills"], tileYields: { gold: 3, culture: 1 }, discoveryBonus: { gold: 70, culture: 30 } }),
  NW({ id: "giants_causeway", name: "Giant's Causeway", desc: "Interlocking basalt columns marching into the sea.", validTerrain: ["coast", "hills"], tileYields: { science: 2, culture: 2 }, discoveryBonus: { science: 60, culture: 40 } }),

  // ---- lakes & waterfalls (food / culture / gold) -------------------------
  NW({ id: "dead_sea", name: "Dead Sea", desc: "The lowest, saltiest water on the planet.", validTerrain: ["lake"], tileYields: { gold: 3, faith: 1 }, discoveryBonus: { gold: 90, faith: 30 } }),
  NW({ id: "lake_baikal", name: "Lake Baikal", desc: "The deepest, oldest freshwater lake on Earth.", validTerrain: ["lake"], tileYields: { food: 2, science: 2 }, discoveryBonus: { science: 80, gold: 30 } }),
  NW({ id: "niagara_falls", name: "Niagara Falls", desc: "A thundering curtain of falling water.", validTerrain: ["lake", "coast"], tileYields: { food: 2, gold: 2, culture: 1 }, discoveryBonus: { culture: 60, gold: 40 } }),
  NW({ id: "victoria_falls", name: "Victoria Falls", desc: "\"The Smoke That Thunders\" — a mile-wide cataract.", validTerrain: ["jungle", "grassland"], tileYields: { food: 2, culture: 2 }, discoveryBonus: { culture: 80, gold: 20 } }),
  NW({ id: "iguazu_falls", name: "Iguazú Falls", desc: "A vast horseshoe of jungle waterfalls.", validTerrain: ["jungle"], tileYields: { food: 2, gold: 2 }, discoveryBonus: { culture: 70, gold: 40 } }),
  NW({ id: "angel_falls", name: "Angel Falls", desc: "The world's tallest waterfall, plunging from a jungle tepui.", validTerrain: ["jungle", "hills"], tileYields: { food: 2, culture: 2 }, discoveryBonus: { culture: 90, science: 30 } }),
  NW({ id: "plitvice_lakes", name: "Plitvice Lakes", desc: "Terraced turquoise lakes linked by waterfalls.", validTerrain: ["lake", "forest"], tileYields: { food: 2, culture: 1, gold: 1 }, discoveryBonus: { culture: 60, gold: 30 } }),
  NW({ id: "moraine_lake", name: "Moraine Lake", desc: "Glacial meltwater of impossible blue beneath the peaks.", validTerrain: ["mountains", "lake"], tileYields: { science: 2, culture: 2 }, discoveryBonus: { culture: 50, science: 50 } }),

  // ---- great forests & valleys (science / production / culture) -----------
  NW({ id: "amazon_rainforest", name: "Amazon Rainforest", desc: "An immense, teeming green ocean of trees.", validTerrain: ["jungle"], tileYields: { food: 2, production: 2, science: 1 }, discoveryBonus: { science: 100, freeTech: true } }),
  NW({ id: "pantanal", name: "Pantanal", desc: "The world's largest tropical wetland.", validTerrain: ["grassland", "jungle"], tileYields: { food: 3, gold: 1 }, discoveryBonus: { gold: 60, science: 40 } }),
  NW({ id: "yosemite", name: "Yosemite Valley", desc: "Sheer granite walls above ancient sequoias.", validTerrain: ["mountains", "forest"], tileYields: { production: 2, culture: 1, science: 1 }, discoveryBonus: { culture: 60, science: 40 } }),
  NW({ id: "zhangjiajie", name: "Zhangjiajie", desc: "A forest of towering quartzite pillars.", validTerrain: ["mountains", "forest"], tileYields: { science: 2, culture: 2 }, discoveryBonus: { science: 60, culture: 50 } }),
];

const NATURAL_WONDER_BY_ID = new Map(NATURAL_WONDER_DEFS.map((w) => [w.id, w]));
export const getNaturalWonder = (id: string | undefined): NaturalWonderDef | undefined =>
  id ? NATURAL_WONDER_BY_ID.get(id) : undefined;
export const NATURAL_WONDER_IDS: string[] = NATURAL_WONDER_DEFS.map((w) => w.id);

/** Grand one-time reward to the first civ to have sighted EVERY natural wonder on the map. */
export const ALL_NATURAL_WONDERS_BONUS: NaturalWonderBonus = {
  science: 250,
  culture: 200,
  gold: 300,
  faith: 150,
  freeTech: true,
};

// ---- Specialist names ----------------------------------------------------
// Craftsmen are named (best effort) after a real historical master of their
// craft and civilization; failing that, after a master of another civilization,
// and finally from a culturally-matched pool of authentic period given-names.
// Disciplines: "carpentry" | "survey" | "masonry" | "architecture" | "engineering".

export interface MasterCraftsman {
  name: string;
  discipline: string;
  /** Civilization id this figure is associated with (if any). */
  civId?: string;
  /** Short historical note for the encyclopedia. */
  note: string;
}

/** Real, documented master craftsmen — the wiki gallery and primary name source. */
export const MASTER_CRAFTSMEN: MasterCraftsman[] = [
  // Architecture
  { name: "Imhotep", discipline: "architecture", civId: "egypt", note: "Vizier to King Djoser; designed the Step Pyramid at Saqqara (c. 2650 BCE) — the earliest architect known to history by name." },
  { name: "Hemiunu", discipline: "architecture", civId: "egypt", note: "Vizier and overseer of works for Khufu, traditionally credited with planning the Great Pyramid of Giza." },
  { name: "Ineni", discipline: "architecture", civId: "egypt", note: "Royal architect under Thutmose I who oversaw the first hidden tombs cut in the Valley of the Kings." },
  { name: "Ictinus", discipline: "architecture", civId: "greece", note: "Co-architect of the Parthenon (447–432 BCE) and the Temple of Apollo at Bassae." },
  { name: "Callicrates", discipline: "architecture", civId: "greece", note: "Athenian architect of the Parthenon and the elegant Temple of Athena Nike." },
  { name: "Mnesikles", discipline: "architecture", civId: "greece", note: "Designed the Propylaea, the great columned gateway to the Athenian Acropolis." },
  { name: "Hippodamus", discipline: "architecture", civId: "greece", note: "Of Miletus; the 'father of urban planning', who devised the orthogonal grid adopted across the Greek world." },
  { name: "Sostratus", discipline: "architecture", civId: "greece", note: "Of Cnidus; credited with the Lighthouse (Pharos) of Alexandria, one of the Seven Wonders." },
  { name: "Vitruvius", discipline: "architecture", civId: "rome", note: "Architect and military engineer under Augustus; wrote De architectura, the only surviving classical treatise on building." },
  { name: "Apollodorus", discipline: "architecture", civId: "rome", note: "Of Damascus; Trajan's architect — designed his Forum and Column and the great timber bridge over the Danube." },
  { name: "Cossutius", discipline: "architecture", civId: "rome", note: "Roman architect who resumed the colossal Temple of Olympian Zeus in Athens for Antiochus IV." },
  // Engineering
  { name: "Archimedes", discipline: "engineering", civId: "greece", note: "Engineer of Syracuse; devised compound pulleys, the water screw, and the siege machines that long held off Rome." },
  { name: "Ctesibius", discipline: "engineering", civId: "greece", note: "Alexandrian inventor and father of pneumatics; built force pumps and precise water clocks." },
  { name: "Heron", discipline: "engineering", civId: "greece", note: "Of Alexandria; described the aeolipile steam device, automata, and the dioptra surveying instrument." },
  { name: "Eupalinos", discipline: "engineering", civId: "greece", note: "Of Megara; drove the 1,000-metre Tunnel of Samos from both ends to meet in the middle (6th c. BCE)." },
  { name: "Frontinus", discipline: "engineering", civId: "rome", note: "Sextus Julius Frontinus, water commissioner of Rome; wrote De aquaeductu on the city's aqueducts." },
  { name: "Zhang Heng", discipline: "engineering", civId: "han_china", note: "Han polymath who built a water-powered armillary sphere and the first seismoscope (132 CE)." },
  { name: "Du Shi", discipline: "engineering", civId: "han_china", note: "Han governor who harnessed water power to drive bellows for casting iron (c. 31 CE)." },
  { name: "Ma Jun", discipline: "engineering", civId: "han_china", note: "Mechanical engineer of the late Han credited with the south-pointing chariot and improved silk looms." },
  // Surveying
  { name: "Hyginus", discipline: "survey", civId: "rome", note: "Hyginus Gromaticus, Roman land-surveyor who wrote on the laying-out of colonies and military camps." },
  { name: "Siculus Flaccus", discipline: "survey", civId: "rome", note: "Roman agrimensor whose treatise on the conditions of land survives in the Corpus Agrimensorum." },
  { name: "Eratosthenes", discipline: "survey", civId: "greece", note: "Chief librarian at Alexandria who measured the Earth's circumference using shadows and geometry." },
  // Masonry
  { name: "Senenmut", discipline: "masonry", civId: "egypt", note: "Steward to Hatshepsut who supervised the building of her terraced temple at Deir el-Bahari." },
  { name: "Kha", discipline: "masonry", civId: "egypt", note: "Overseer of works at Deir el-Medina; his intact tomb preserved a gilded cubit rod and a builder's toolkit." },
  { name: "Gudea", discipline: "masonry", civId: "sumer", note: "Ruler of Lagash famed for a vast temple-building program; his statues depict him with a builder's plan and rule." },
  { name: "Ur-Nammu", discipline: "masonry", civId: "sumer", note: "King of Ur who raised the great ziggurat of Ur and standardised building measures across Sumer." },
  { name: "Hiram", discipline: "masonry", civId: "phoenicia", note: "Master craftsman sent from Tyre to cast the bronze pillars and fittings of Solomon's Temple." },
  // Carpentry
  { name: "Lu Ban", discipline: "carpentry", civId: "han_china", note: "Legendary Chinese master carpenter and engineer, later revered as the patron of builders and craftsmen." },
];

/** Cultural regions used to pick authentic given-names per civilization. */
export type CraftRegion =
  | "mesopotamian" | "anatolian" | "iranian" | "levantine" | "egyptian" | "african"
  | "aegean" | "italic" | "northern_european" | "medieval_european"
  | "east_asian" | "southeast_asian" | "south_asian" | "steppe"
  | "mesoamerican" | "andean" | "north_american" | "oceanian";

/** Map every civilization to a cultural region (defaults to mesopotamian). */
export const CIV_REGION: Record<string, CraftRegion> = {
  sumer: "mesopotamian", akkad: "mesopotamian", babylon: "mesopotamian", assyria: "mesopotamian", elam: "mesopotamian",
  hittites: "anatolian", lydia: "anatolian",
  median_empire: "iranian", persia: "iranian", parthia: "iranian", sassanid_persia: "iranian",
  phoenicia: "levantine", carthage: "levantine",
  egypt: "egyptian", kush_nubia: "egyptian",
  mali: "african", ghana_empire: "african", songhai: "african", great_zimbabwe: "african",
  kanem_bornu: "african", aksum: "african", ethiopia_zagwe: "african",
  minoans: "aegean", mycenaean_greece: "aegean", greece: "aegean", sparta: "aegean", macedon: "aegean",
  etruscans: "italic", rome: "italic",
  celts_gauls: "northern_european", norse: "northern_european", franks: "northern_european",
  goths: "northern_european", anglo_saxon_england: "northern_european",
  byzantium: "medieval_european", france: "medieval_european", castile_spain: "medieval_european",
  portugal: "medieval_european", venice: "medieval_european", genoa: "medieval_european",
  dutch_republic: "medieval_european", holy_roman_empire: "medieval_european", kievan_rus: "medieval_european",
  poland_lithuania: "medieval_european", hungary: "medieval_european",
  han_china: "east_asian", china_tang_song: "east_asian", china_ming: "east_asian",
  japan: "east_asian", korea: "east_asian", tibet: "east_asian",
  dai_viet_vietnam: "southeast_asian", khmer: "southeast_asian", srivijaya: "southeast_asian",
  majapahit: "southeast_asian", pagan_burma: "southeast_asian", ayutthaya_siam: "southeast_asian",
  maurya: "south_asian", gupta_india: "south_asian", chola: "south_asian",
  scythians: "steppe", xiongnu: "steppe", huns: "steppe", gokturks: "steppe",
  seljuks: "steppe", mongols: "steppe", timurids: "steppe", ottomans: "steppe",
  olmec: "mesoamerican", maya: "mesoamerican", zapotec: "mesoamerican",
  teotihuacan: "mesoamerican", toltec: "mesoamerican", aztec: "mesoamerican",
  inca: "andean", muisca: "andean",
  mississippian_cahokia: "north_american", haudenosaunee: "north_american", pueblo: "north_american",
  polynesia: "oceanian", maori: "oceanian", hawaii: "oceanian",
};

export function craftRegionForCiv(civId: string | undefined): CraftRegion {
  return (civId && CIV_REGION[civId]) || "mesopotamian";
}

/** Authentic period given-names by cultural region (fallback name pool). */
export const REGION_CRAFT_NAMES: Record<CraftRegion, string[]> = {
  mesopotamian: ["Ur-Nammu", "Gudea", "Eannatum", "Shulgi", "Ur-Bau", "Lu-Nanna", "Ur-Ningirsu", "Enannatum", "Ibbi-Sin", "Naram-Sin", "Ur-Nanshe", "Sin-iddinam", "Warad-Sin", "Lugal-ushumgal"],
  anatolian: ["Hattusili", "Mursili", "Suppiluliuma", "Tudhaliya", "Muwatalli", "Arnuwanda", "Telipinu", "Labarna", "Kurunta", "Alyattes", "Gyges", "Sadyattes", "Pithana", "Anitta"],
  iranian: ["Darius", "Cyrus", "Bardiya", "Otanes", "Gobryas", "Hydarnes", "Aspathines", "Intaphrenes", "Mardonius", "Artabanus", "Vishtaspa", "Pharnaspes", "Datis", "Megabyzus"],
  levantine: ["Hiram", "Abibaal", "Ithobaal", "Eshmunazar", "Bodashtart", "Mago", "Hanno", "Hamilcar", "Hasdrubal", "Adherbal", "Bomilcar", "Maharbal", "Gisco", "Bostar"],
  egyptian: ["Imhotep", "Ineni", "Hemiunu", "Senenmut", "Kha", "Nakht", "Ptahhotep", "Amenhotep", "Rahotep", "Khaemwaset", "Bak", "Thutmose", "Nebamun", "Userhat"],
  african: ["Sundiata", "Sakura", "Sulayman", "Kankan", "Naré", "Fakoli", "Tiramakhan", "Mari Djata", "Ezana", "Kaleb", "Gadarat", "Ousanas", "Tunka Manin", "Askia"],
  aegean: ["Ictinus", "Callicrates", "Mnesikles", "Daedalus", "Theodoros", "Rhoikos", "Metagenes", "Chersiphron", "Pheidias", "Hippodamos", "Pytheos", "Satyros", "Polykleitos", "Deinokrates"],
  italic: ["Marcus", "Lucius", "Gaius", "Quintus", "Titus", "Publius", "Aulus", "Gnaeus", "Servius", "Decimus", "Vitruvius", "Cossutius", "Postumius", "Mucius"],
  northern_european: ["Bjorn", "Leif", "Erik", "Sigurd", "Ivar", "Halfdan", "Gunnar", "Thorstein", "Ulf", "Arne", "Harald", "Rolf", "Brennus", "Cunobelin"],
  medieval_european: ["Guillaume", "Pierre", "Jean", "Arnolfo", "Lorenzo", "Giovanni", "Konrad", "Heinrich", "Dietrich", "Willem", "Jan", "Wojciech", "Géza", "Yaroslav"],
  east_asian: ["Lu Ban", "Zhang Heng", "Du Shi", "Ma Jun", "Yu Hao", "Li Chun", "Yuwen Kai", "Shen Kuo", "Li Jie", "Gongshu", "Cai Lun", "Ding Huan", "Sun Wu", "Mo Di"],
  southeast_asian: ["Jayavarman", "Suryavarman", "Yasovarman", "Indravarman", "Gajah Mada", "Hayam Wuruk", "Anawrahta", "Kyansittha", "Airlangga", "Kertanegara", "Ramkhamhaeng", "Naresuan"],
  south_asian: ["Vishvakarma", "Mandana", "Devadatta", "Ananta", "Govinda", "Narahari", "Dhruva", "Bhoja", "Nagabhata", "Harisena", "Vishnugupta", "Sthapati"],
  steppe: ["Bumin", "Istemi", "Bilge", "Kultegin", "Tonyukuk", "Attila", "Bleda", "Modu", "Subotai", "Jebe", "Alp Arslan", "Tughril", "Osman", "Timur"],
  mesoamerican: ["Tlacaelel", "Nezahualcoyotl", "Itzcoatl", "Axayacatl", "Tizoc", "Cuauhtemoc", "Pakal", "Kan Bahlam", "Jasaw", "Yax Nuun", "Siyaj", "Waxaklajuun"],
  andean: ["Pachacuti", "Viracocha", "Tupac", "Sinchi Roca", "Mayta Capac", "Lloque", "Yawar", "Amaru", "Inca Roca", "Huayna"],
  north_american: ["Hiawatha", "Deganawida", "Tadodaho", "Atotarho", "Sganyodaiyo", "Donnacona", "Tamanend", "Powhatan", "Onatah", "Tecumseh"],
  oceanian: ["Kupe", "Hotu Matua", "Pa'ao", "Tupaia", "Ru", "Rangi", "Tane", "Maui", "Hema", "Tama", "Kahiki", "Manaia"],
};

const MASTER_BY_DISCIPLINE = new Map<string, MasterCraftsman[]>();
for (const m of MASTER_CRAFTSMEN) {
  const arr = MASTER_BY_DISCIPLINE.get(m.discipline) ?? [];
  arr.push(m);
  MASTER_BY_DISCIPLINE.set(m.discipline, arr);
}

/**
 * Ordered candidate names for a craftsman: real masters of this civ & craft
 * first, then masters of the craft from any civ, then the region's name pool.
 */
export function specialistNameCandidates(civId: string | undefined, discipline: string): string[] {
  const masters = MASTER_BY_DISCIPLINE.get(discipline) ?? [];
  const sameCiv = masters.filter((m) => m.civId === civId).map((m) => m.name);
  const otherMasters = masters.filter((m) => m.civId !== civId).map((m) => m.name);
  const region = REGION_CRAFT_NAMES[craftRegionForCiv(civId)] ?? [];
  return [...sameCiv, ...otherMasters, ...region];
}

// ---- Great People --------------------------------------------------------
// Finite, named historical figures earned by accumulating per-class points (from
// buildings/wonders each turn). Recruiting one is a one-time, globally-unique
// event — once a figure is taken in a game, it is gone for everyone (competition
// for the best ones). Each recruit can be ACTIVATED once for an instant, themed
// effect. See docs/GREAT-PEOPLE.md. Auras / tile-improvement activations are a
// future extension; every figure here resolves to an instant effect hook the sim
// implements in packages/sim/src/game/great-people.ts.

/** A point pool / discipline a Great Person belongs to. */
export type GreatPersonClass =
  | "general"
  | "admiral"
  | "scientist"
  | "engineer"
  | "merchant"
  | "prophet"
  | "artist"
  | "statesman";

/** The instant effect a Great Person applies when activated. */
export type GreatPersonEffect =
  | "eureka" // scientist: a burst of science toward research
  | "windfall" // merchant: a burst of gold
  | "masterwork" // engineer: a burst of production in your best city
  | "inspiration" // artist: a burst of culture
  | "revelation" // prophet: a burst of faith
  | "reform" // statesman: a burst of culture toward civics
  | "drill" // general: a free promotion to your land military + a morale lift
  | "flagship"; // admiral: heal your fleet & army and lift morale

export type GreatPersonEra = "Bronze" | "Classical" | "Medieval" | "Exploration";

/**
 * A Great Prophet's SECONDARY gift, layered on top of a (smaller) faith burst so
 * each prophet plays differently and echoes the historical figure. The flat faith
 * still comes from the `revelation` effect; this adds the flavour. Interpreted in
 * `packages/sim/great-people.ts`; all magnitudes live here.
 */
export type ProphetGift =
  /** Zarathustra — the holy war on the Lie: faith on every kill + a morale lift, for a time. */
  | { kind: "zeal"; turns: number; faithOnKill: number; morale: number }
  /** Confucius — raises a Temple at once in up to `count` of your best temple-less cities. */
  | { kind: "temples"; count: number; faithIfNone: number }
  /** Laozi — the Watercourse Way: +`faithPercent`% faith empire-wide for `turns` turns. */
  | { kind: "faithFlow"; turns: number; faithPercent: number }
  /** Siddhartha — great compassion: heals all your wounded units + a morale lift. */
  | { kind: "compassion"; morale: number }
  /** Augustine — the City of God: ordains `missionaries` free Missionaries and presses the faith. */
  | { kind: "mission"; missionaries: number; pressure: number }
  /** Aquinas — faith wedded to reason: an instant burst of science. */
  | { kind: "scholastic"; science: number }
  /** Rumi — the whirling: a pressure surge across all your cities + timed culture. */
  | { kind: "revival"; pressure: number; turns: number; culturePercent: number };

export interface GreatPersonDef {
  id: string;
  name: string;
  cls: GreatPersonClass;
  era: GreatPersonEra;
  effect: GreatPersonEffect;
  /** Signature-effect flavour, shown in the UI. */
  desc: string;
  /** Great Prophets only: the historically-themed secondary gift (see ProphetGift). */
  prophetGift?: ProphetGift;
}

const GP = (
  id: string,
  name: string,
  cls: GreatPersonClass,
  era: GreatPersonEra,
  effect: GreatPersonEffect,
  desc: string,
  prophetGift?: ProphetGift,
): GreatPersonDef => ({ id, name, cls, era, effect, desc, ...(prophetGift ? { prophetGift } : {}) });

/** Display metadata per class (glyph + the point-pool's name). */
export const GREAT_PERSON_CLASS_INFO: Record<GreatPersonClass, { name: string; glyph: string }> = {
  general: { name: "Great General", glyph: "⚔️" },
  admiral: { name: "Great Admiral", glyph: "⚓" },
  scientist: { name: "Great Scientist", glyph: "🔬" },
  engineer: { name: "Great Engineer", glyph: "🛠️" },
  merchant: { name: "Great Merchant", glyph: "💰" },
  prophet: { name: "Great Prophet", glyph: "☮️" },
  artist: { name: "Great Artist", glyph: "🎭" },
  statesman: { name: "Great Statesman", glyph: "🏛️" },
};

export const GREAT_PERSON_CLASSES = Object.keys(GREAT_PERSON_CLASS_INFO) as GreatPersonClass[];

// Figures are ordered (earliest era first) so recruitment hands out the
// era-appropriate figure next. The historical signature lives in `desc`; the
// concrete `effect` keeps the same theme (scientists → science, generals → a
// battlefield promotion, etc.).
export const GREAT_PEOPLE: GreatPersonDef[] = [
  // ---- Great Generals (land military) ------------------------------------
  // (Figures who appear as LEGENDS — Sun Tzu, Hannibal, Caesar, Belisarius,
  // Subutai, Joan of Arc — are deliberately absent here: one system per person.)
  GP("epaminondas", "Epaminondas", "general", "Classical", "drill", "Broke Sparta at Leuctra: drills your land army, granting each a free promotion."),
  GP("pyrrhus", "Pyrrhus of Epirus", "general", "Classical", "drill", "The fighting king: rallies your land army with a free promotion."),
  GP("scipio_africanus", "Scipio Africanus", "general", "Classical", "drill", "Conqueror of Carthage: hardens your legions with a free promotion."),
  GP("gaius_marius", "Gaius Marius", "general", "Classical", "drill", "Reformer of the legions: your land army earns a free promotion."),
  GP("charles_martel", "Charles Martel", "general", "Medieval", "drill", "The Hammer of Tours: steels your land army with a free promotion."),
  GP("khalid", "Khalid ibn al-Walid", "general", "Medieval", "drill", "The Drawn Sword of God: your land army earns a free promotion."),
  GP("baibars", "Baibars", "general", "Medieval", "drill", "Victor of Ain Jalut: your land army earns a free promotion."),
  GP("du_guesclin", "Bertrand du Guesclin", "general", "Medieval", "drill", "The Eagle of Brittany: your land army earns a free promotion."),
  GP("gonzalo", "Gonzalo de Córdoba", "general", "Exploration", "drill", "Father of the tercio: your land army earns a free promotion."),

  // ---- Great Admirals (naval) --------------------------------------------
  // (Zheng He and Yi Sun-sin are LEGENDS, so they are absent here.)
  GP("themistocles", "Themistocles", "admiral", "Classical", "flagship", "Victor of Salamis: heals your fleet and army and lifts morale."),
  GP("gaius_duilius", "Gaius Duilius", "admiral", "Classical", "flagship", "First Roman sea-triumph: heals your fleet and army and lifts morale."),
  GP("artemisia", "Artemisia", "admiral", "Classical", "flagship", "Cunning at sea: heals your fleet and army and lifts morale."),
  GP("leif_erikson", "Leif Erikson", "admiral", "Medieval", "flagship", "Bold ocean voyager: heals your fleet and army and lifts morale."),
  GP("andrea_doria", "Andrea Doria", "admiral", "Exploration", "flagship", "Liberator of Genoa: heals your fleet and army and lifts morale."),
  GP("francis_drake", "Francis Drake", "admiral", "Exploration", "flagship", "Scourge of the Armada: heals your fleet and army and lifts morale."),

  // ---- Great Scientists --------------------------------------------------
  GP("archimedes", "Archimedes", "scientist", "Classical", "eureka", "Eureka! A flash of insight bursts your current research forward."),
  GP("hypatia", "Hypatia", "scientist", "Classical", "eureka", "Scholar of Alexandria: a burst of science speeds your research."),
  GP("aristotle", "Aristotle", "scientist", "Classical", "eureka", "The Philosopher: a burst of science speeds your research."),
  GP("aryabhata", "Aryabhata", "scientist", "Classical", "eureka", "Pioneer of astronomy: a burst of science speeds your research."),
  GP("al_khwarizmi", "Al-Khwarizmi", "scientist", "Medieval", "eureka", "Father of algebra: a great burst of science speeds your research."),
  GP("ibn_al_haytham", "Ibn al-Haytham", "scientist", "Medieval", "eureka", "Father of optics: a burst of science speeds your research."),
  GP("copernicus", "Nicolaus Copernicus", "scientist", "Exploration", "eureka", "Turned the heavens: a great burst of science speeds your research."),

  // ---- Great Engineers ---------------------------------------------------
  GP("imhotep", "Imhotep", "engineer", "Bronze", "masterwork", "Architect of the first pyramid: a surge of production in your best city."),
  GP("vitruvius", "Vitruvius", "engineer", "Classical", "masterwork", "Master builder: a surge of production in your best city."),
  GP("su_song", "Su Song", "engineer", "Medieval", "masterwork", "Clockwork genius: a surge of production in your best city."),
  GP("brunelleschi", "Filippo Brunelleschi", "engineer", "Medieval", "masterwork", "Raised the great dome: a large surge of production in your best city."),
  GP("mimar_sinan", "Mimar Sinan", "engineer", "Exploration", "masterwork", "Imperial architect: a surge of production in your best city."),
  GP("da_vinci", "Leonardo da Vinci", "engineer", "Exploration", "masterwork", "Universal genius: a great surge of production in your best city."),

  // ---- Great Merchants ---------------------------------------------------
  GP("zhang_qian", "Zhang Qian", "merchant", "Classical", "windfall", "Opened the Silk Road: a windfall of gold flows to your treasury."),
  GP("marco_polo", "Marco Polo", "merchant", "Medieval", "windfall", "Far-travelled trader: a windfall of gold flows to your treasury."),
  GP("ibn_battuta", "Ibn Battuta", "merchant", "Medieval", "windfall", "Greatest medieval traveller: a windfall of gold flows to your treasury."),
  GP("wang_anshi", "Wang Anshi", "merchant", "Medieval", "windfall", "Reforming minister: a windfall of gold flows to your treasury."),
  GP("cosimo", "Cosimo de' Medici", "merchant", "Exploration", "windfall", "Banker of Florence: a large windfall of gold flows to your treasury."),
  GP("fugger", "Jakob Fugger", "merchant", "Exploration", "windfall", "Richest man of his age: a huge windfall of gold flows to your treasury."),

  // ---- Great Prophets ----------------------------------------------------
  GP("zarathustra", "Zarathustra", "prophet", "Bronze", "revelation", "Prophet of the sacred fire: faith, and a holy war on the Lie — your kills reap faith for a time.", { kind: "zeal", turns: 10, faithOnKill: 6, morale: 8 }),
  GP("confucius", "Confucius", "prophet", "Classical", "revelation", "The Great Sage: faith, and the rites made stone — a Temple rises at once in your greatest cities.", { kind: "temples", count: 2, faithIfNone: 120 }),
  GP("laozi", "Laozi", "prophet", "Classical", "revelation", "Sage of the Way: faith, and the Watercourse Way — faith flows effortlessly across the empire for a time.", { kind: "faithFlow", turns: 10, faithPercent: 25 }),
  GP("siddhartha", "Siddhartha Gautama", "prophet", "Classical", "revelation", "The Awakened One: faith, and great compassion — every wounded soul in your armies is mended and the realm is heartened.", { kind: "compassion", morale: 12 }),
  GP("augustine", "Augustine of Hippo", "prophet", "Medieval", "revelation", "Great theologian: faith, and the City of God — free Missionaries are ordained to carry the word outward.", { kind: "mission", missionaries: 2, pressure: 40 }),
  GP("aquinas", "Thomas Aquinas", "prophet", "Medieval", "revelation", "The Angelic Doctor: faith wedded to reason — a burst of faith AND an instant flowering of science.", { kind: "scholastic", science: 150 }),
  GP("rumi", "Rumi", "prophet", "Medieval", "revelation", "Mystic poet: faith, and the whirling — a surge of devotion sweeps every city and culture blooms for a time.", { kind: "revival", pressure: 30, turns: 8, culturePercent: 20 }),

  // ---- Great Artists (writers / artists / musicians) ---------------------
  GP("homer", "Homer", "artist", "Classical", "inspiration", "Father of epic poetry: a burst of culture inspires your empire."),
  GP("sappho", "Sappho", "artist", "Classical", "inspiration", "The Tenth Muse: a burst of culture inspires your empire."),
  GP("valmiki", "Valmiki", "artist", "Classical", "inspiration", "First poet of the epic: a burst of culture inspires your empire."),
  GP("phidias", "Phidias", "artist", "Classical", "inspiration", "Greatest classical sculptor: a burst of culture inspires your empire."),
  GP("murasaki", "Murasaki Shikibu", "artist", "Medieval", "inspiration", "Author of the first novel: a burst of culture inspires your empire."),
  GP("giotto", "Giotto", "artist", "Medieval", "inspiration", "Father of the Renaissance: a burst of culture inspires your empire."),
  GP("dante", "Dante Alighieri", "artist", "Exploration", "inspiration", "Author of the Commedia: a great burst of culture inspires your empire."),
  GP("michelangelo", "Michelangelo", "artist", "Exploration", "inspiration", "Supreme master: a great burst of culture inspires your empire."),

  // ---- Great Statesmen / Lawgivers ---------------------------------------
  GP("solon", "Solon", "statesman", "Classical", "reform", "The Lawgiver: a burst of culture speeds your civic reforms."),
  GP("lycurgus", "Lycurgus", "statesman", "Classical", "reform", "Founder of Sparta's order: a burst of culture speeds your civic reforms."),
  GP("chanakya", "Chanakya", "statesman", "Classical", "reform", "Author of the Arthashastra: a burst of culture speeds your civic reforms."),
  GP("cicero", "Cicero", "statesman", "Classical", "reform", "Greatest Roman orator: a burst of culture speeds your civic reforms."),
  GP("justinian", "Justinian", "statesman", "Medieval", "reform", "Codifier of Roman law: a great burst of culture speeds your civic reforms."),
  GP("yelu_chucai", "Yelü Chucai", "statesman", "Medieval", "reform", "Reforming administrator: a burst of culture speeds your civic reforms."),
  GP("eleanor", "Eleanor of Aquitaine", "statesman", "Medieval", "reform", "Queen of two realms: a burst of culture speeds your civic reforms."),
  GP("thomas_more", "Thomas More", "statesman", "Exploration", "reform", "Author of Utopia: a great burst of culture speeds your civic reforms."),
];

const GREAT_PERSON_BY_ID = new Map(GREAT_PEOPLE.map((g) => [g.id, g]));
export const getGreatPerson = (id: string | undefined): GreatPersonDef | undefined =>
  id ? GREAT_PERSON_BY_ID.get(id) : undefined;

/** Figures of a class, in recruit order (earliest era first). */
export const greatPeopleOfClass = (cls: GreatPersonClass): GreatPersonDef[] =>
  GREAT_PEOPLE.filter((g) => g.cls === cls);

// ---- Legends (Heroes) — the core "Legends" feature -----------------------
// Powerful, limited unique units recruited with faith. Each has a passive aura
// (heartens adjacent friendly units), its own combat strength bonus, and a
// lifespan (turns active before it "passes into legend"). On by default,
// toggleable off per game. See docs/GREAT-PEOPLE.md §2. Each legend reskins an
// existing base unit (`baseType`) and carries a real signature power: combat
// heroes get a bespoke/curated ACTIVE ability kit (sim LEGEND_ABILITY_OVERRIDES,
// resolved in abilities.ts/combat.ts), support heroes a PASSIVE presence effect
// (sim legends.ts — per-turn income/auras, combat hooks, empire/city effects).
// `abilityDesc` below describes exactly what the coded mechanics do.

export type LegendType = "land" | "naval" | "support";
export type LegendRecruitVia = "Faith" | "Culture" | "Conquest" | "Wonder" | "Quest";

export interface LegendDef {
  id: string;
  name: string;
  era: GreatPersonEra;
  type: LegendType;
  /** Historical recruitment path (flavour; all legends cost faith in-game). */
  recruitVia: LegendRecruitVia;
  /** Existing unit id this legend is built on (its body & base abilities). */
  baseType: string;
  /** Flat combat-strength bonus for the legend itself. */
  combatBonus: number;
  /** Flat combat-strength bonus to adjacent friendly military units (aura). */
  auraBonus: number;
  /** Turns the legend stays on the map before retiring. */
  lifespan: number;
  /** If true, retiring returns the legend to the pool to be recruited again. */
  rechargeable: boolean;
  /** Signature power id. For combat heroes this is (one of) the hero's real
   *  active abilities (sim LEGEND_ABILITY_OVERRIDES); for support heroes it is
   *  the passive implemented in the sim's legends.ts. */
  ability: string;
  /** What the signature power actually does in game terms (kept honest). */
  abilityDesc: string;
  auraDesc: string;
}

const L = (d: LegendDef): LegendDef => d;

export const LEGENDS: LegendDef[] = [
  // ---- Bronze ------------------------------------------------------------
  L({ id: "gilgamesh", name: "Gilgamesh", era: "Bronze", type: "land", recruitVia: "Quest", baseType: "axeman", combatBonus: 9, auraBonus: 3, lifespan: 30, rechargeable: false, ability: "slay_the_beast", abilityDesc: "Slay the Beast: a hero's blow at +6 attack against barbarians (+1 against others); when the foe falls, Gilgamesh and adjacent allies take heart (+10 morale).", auraDesc: "Adjacent allies fight harder beside the hero of Uruk." }),
  L({ id: "hammurabi", name: "Hammurabi", era: "Bronze", type: "support", recruitVia: "Wonder", baseType: "warrior", combatBonus: 2, auraBonus: 3, lifespan: 30, rechargeable: false, ability: "code_of_laws", abilityDesc: "Code of Laws: while the lawgiver lives, your empire-wide morale rises +1 every turn — the law steadies the realm.", auraDesc: "Adjacent allies stand firm under the law." }),
  L({ id: "ramesses_ii", name: "Ramesses II", era: "Bronze", type: "support", recruitVia: "Faith", baseType: "war_chariot", combatBonus: 4, auraBonus: 3, lifespan: 30, rechargeable: false, ability: "monument_builder", abilityDesc: "Monument Builder: the city Ramesses stands in works at +25% production and +25% culture while the pharaoh holds court there.", auraDesc: "Adjacent allies are emboldened by the living god." }),
  // ---- Classical ---------------------------------------------------------
  L({ id: "cyrus", name: "Cyrus the Great", era: "Classical", type: "land", recruitVia: "Conquest", baseType: "cataphract", combatBonus: 9, auraBonus: 3, lifespan: 30, rechargeable: false, ability: "kings_march", abilityDesc: "The King's March: at the start of your turn, Cyrus and every friendly unit beside him gain +1 movement — his armies arrive before word of their coming.", auraDesc: "Adjacent allies move with the king." }),
  L({ id: "leonidas", name: "Leonidas", era: "Classical", type: "land", recruitVia: "Culture", baseType: "hoplite", combatBonus: 8, auraBonus: 4, lifespan: 30, rechargeable: false, ability: "last_stand", abilityDesc: "Last Stand: a hero's brace whose defense grows as his wounds deepen — up to +60% near death. The pass does not fall while he stands.", auraDesc: "Adjacent allies hold the line." }),
  L({ id: "alexander", name: "Alexander", era: "Classical", type: "land", recruitVia: "Conquest", baseType: "cataphract", combatBonus: 10, auraBonus: 4, lifespan: 30, rechargeable: false, ability: "hammer_and_anvil", abilityDesc: "Hammer & Anvil: +4 attack against an enemy already engaged by another of your units — the phalanx holds, the Companions fall on the flank. He can also Shock Charge to knock a foe from its ground.", auraDesc: "Adjacent allies are undaunted." }),
  L({ id: "hannibal", name: "Hannibal", era: "Classical", type: "land", recruitVia: "Quest", baseType: "war_elephant", combatBonus: 9, auraBonus: 4, lifespan: 30, rechargeable: false, ability: "grand_ambush", abilityDesc: "Grand Ambush: alone among elephants, Hannibal can Hide in cover — breaking concealment strikes with the ambush bonus — and Trample through the enemy line.", auraDesc: "Adjacent allies flank the enemy." }),
  L({ id: "sun_tzu_legend", name: "Sun Tzu", era: "Classical", type: "support", recruitVia: "Culture", baseType: "swordsman", combatBonus: 3, auraBonus: 4, lifespan: 30, rechargeable: false, ability: "art_of_war", abilityDesc: "The Art of War: adjacent friendly units drill under the master (+3 XP at the start of each turn), and hidden enemies within his sight are revealed — know the enemy.", auraDesc: "Adjacent allies fight with discipline." }),
  L({ id: "qin_shi_huang", name: "Qin Shi Huang", era: "Classical", type: "support", recruitVia: "Wonder", baseType: "swordsman", combatBonus: 3, auraBonus: 3, lifespan: 30, rechargeable: false, ability: "great_wall", abilityDesc: "The Great Wall: while the First Emperor lives, every one of your cities defends at +6 strength — the wall is the whole empire's.", auraDesc: "Adjacent allies labour and fight tirelessly." }),
  L({ id: "ashoka", name: "Ashoka", era: "Classical", type: "support", recruitVia: "Faith", baseType: "war_elephant", combatBonus: 4, auraBonus: 3, lifespan: 30, rechargeable: false, ability: "dhamma", abilityDesc: "Dhamma: +2 faith every turn, and adjacent friendly units heal +10 HP at the start of your turn — rest houses and healers travel with the emperor.", auraDesc: "Adjacent allies are heartened by his compassion." }),
  L({ id: "boudica", name: "Boudica", era: "Classical", type: "land", recruitVia: "Quest", baseType: "war_chariot", combatBonus: 8, auraBonus: 4, lifespan: 30, rechargeable: false, ability: "uprising", abilityDesc: "Uprising: rouse an adjacent barbarian war-band to her cause — it joins your side. The tribes rise where she rides.", auraDesc: "Adjacent allies are roused to fury." }),
  L({ id: "julius_caesar_legend", name: "Julius Caesar", era: "Classical", type: "land", recruitVia: "Conquest", baseType: "legionary", combatBonus: 9, auraBonus: 4, lifespan: 30, rechargeable: false, ability: "veteran_legions", abilityDesc: "Veteran Legions: the pila fly, then the gladius closes (Pilum Volley); his victories Plunder gold from the slain — Gaul paid for Caesar's wars.", auraDesc: "Adjacent legions fight as veterans." }),
  L({ id: "cleopatra", name: "Cleopatra", era: "Classical", type: "support", recruitVia: "Faith", baseType: "warrior", combatBonus: 2, auraBonus: 3, lifespan: 30, rechargeable: false, ability: "allure", abilityDesc: "Allure: enemy units adjacent to the queen fight at −2 strength, and the wealth of Egypt yields +3 gold every turn.", auraDesc: "Adjacent allies are inspired by her presence." }),
  // ---- Medieval ----------------------------------------------------------
  L({ id: "attila", name: "Attila", era: "Medieval", type: "land", recruitVia: "Conquest", baseType: "horse_archer", combatBonus: 9, auraBonus: 4, lifespan: 30, rechargeable: false, ability: "terrorize", abilityDesc: "Terror: a thunderous assault (+3 attack) that shakes the survivor's nerve — it must pass a rout check or break and flee. He fires and fades like the steppe wind.", auraDesc: "Adjacent allies spread terror." }),
  L({ id: "belisarius", name: "Belisarius", era: "Medieval", type: "land", recruitVia: "Conquest", baseType: "cataphract", combatBonus: 9, auraBonus: 4, lifespan: 30, rechargeable: false, ability: "against_all_odds", abilityDesc: "Against All Odds: +2 combat strength for every enemy beyond the first standing adjacent to him (up to +6) — the fewer his men, the greater his art.", auraDesc: "Adjacent allies never waver when outnumbered." }),
  L({ id: "charlemagne", name: "Charlemagne", era: "Medieval", type: "support", recruitVia: "Faith", baseType: "longswordsman", combatBonus: 5, auraBonus: 4, lifespan: 30, rechargeable: false, ability: "crown_of_the_west", abilityDesc: "Crown of the West: +2 faith every turn while the emperor lives, and his Heroic Challenge fells enemy champions to hearten the host.", auraDesc: "Adjacent allies are heartened by the crown." }),
  L({ id: "harald_hardrada", name: "Harald Hardrada", era: "Medieval", type: "naval", recruitVia: "Conquest", baseType: "longship", combatBonus: 9, auraBonus: 4, lifespan: 30, rechargeable: false, ability: "strandhogg", abilityDesc: "Strandhögg: the lightning ship-borne raid (+2 attack) that carries off gold when it kills, and the Ram that drives the longship home.", auraDesc: "Adjacent ships raid mercilessly." }),
  L({ id: "el_cid", name: "El Cid", era: "Medieval", type: "land", recruitVia: "Quest", baseType: "cataphract", combatBonus: 9, auraBonus: 4, lifespan: 30, rechargeable: false, ability: "campeador", abilityDesc: "Campeador: +4 combat strength on any tile outside your own borders — the frontier between the realms is his true home.", auraDesc: "Adjacent allies are steadfast on the frontier." }),
  L({ id: "saladin", name: "Saladin", era: "Medieval", type: "land", recruitVia: "Faith", baseType: "cataphract", combatBonus: 9, auraBonus: 4, lifespan: 30, rechargeable: false, ability: "horns_of_hattin", abilityDesc: "The Horns of Hattin: Feigned Retreat lures the enemy on to exhaustion, and Harry pins them in place, far from water — the battle is won before it is fought.", auraDesc: "Adjacent allies fight for the faith." }),
  L({ id: "genghis_khan", name: "Genghis Khan", era: "Medieval", type: "land", recruitVia: "Conquest", baseType: "horse_archer", combatBonus: 10, auraBonus: 5, lifespan: 30, rechargeable: false, ability: "terror_of_the_steppe", abilityDesc: "Terror of the Steppe: enemy units adjacent to the Khan lose 3 morale at the start of your every turn — his name alone unmakes armies. In battle he closes the Nerge hunting-ring (+5 attack with two allies beside the target).", auraDesc: "Adjacent allies ride harder under the Khan's banner." }),
  L({ id: "subutai", name: "Subutai", era: "Medieval", type: "land", recruitVia: "Conquest", baseType: "horse_archer", combatBonus: 9, auraBonus: 4, lifespan: 30, rechargeable: false, ability: "hit_and_run", abilityDesc: "Hit and Run: the Parthian Shot fired on the gallop, and the Feigned Retreat that lured whole armies onto ground of his choosing.", auraDesc: "Adjacent horse archers strike and fade." }),
  L({ id: "joan_of_arc_legend", name: "Joan of Arc", era: "Medieval", type: "land", recruitVia: "Faith", baseType: "longswordsman", combatBonus: 8, auraBonus: 5, lifespan: 30, rechargeable: true, ability: "sacred_banner", abilityDesc: "Sacred Banner: raise the banner of Orléans — Joan and adjacent allies heal 10 HP and gain +15 morale. Martyred, she alone returns to the pool to be called again.", auraDesc: "Adjacent allies are filled with holy fervour." }),
  L({ id: "tomoe_gozen", name: "Tomoe Gozen", era: "Medieval", type: "land", recruitVia: "Quest", baseType: "horse_archer", combatBonus: 9, auraBonus: 4, lifespan: 30, rechargeable: false, ability: "duelist", abilityDesc: "Duelist: her Heroic Challenge strikes a champion's blow (+3 attack) — when the foe falls, every ally within 2 tiles takes heart. She looses arrows from the saddle and fades (Fire & Retreat).", auraDesc: "Adjacent allies are emboldened by her duels." }),
  L({ id: "mansa_musa", name: "Mansa Musa", era: "Medieval", type: "support", recruitVia: "Faith", baseType: "warrior", combatBonus: 2, auraBonus: 3, lifespan: 30, rechargeable: false, ability: "golden_flood", abilityDesc: "Golden Flood: +8 gold every turn while the mansa reigns — the richest man who ever lived pays for your wars and your works.", auraDesc: "Adjacent allies march on golden coin." }),
  // ---- Exploration -------------------------------------------------------
  L({ id: "tamerlane", name: "Tamerlane", era: "Exploration", type: "land", recruitVia: "Conquest", baseType: "cataphract", combatBonus: 10, auraBonus: 4, lifespan: 30, rechargeable: false, ability: "pyramid_of_skulls", abilityDesc: "Pyramid of Skulls: a conqueror's blow (+4 attack) struck to be seen — if the target falls, every enemy unit within 2 tiles loses 15 morale.", auraDesc: "Adjacent allies devastate all before them." }),
  L({ id: "mehmed_ii", name: "Mehmed II", era: "Exploration", type: "support", recruitVia: "Wonder", baseType: "catapult", combatBonus: 6, auraBonus: 4, lifespan: 30, rechargeable: false, ability: "basilica_bombard", abilityDesc: "The Basilica: Orban's great bombard hurls a stone ball at +1 range, at +6 ranged strength against units holding walls or forts (+2 otherwise). Two turns to reload.", auraDesc: "Adjacent siege engines batter the walls." }),
  L({ id: "pachacuti", name: "Pachacuti", era: "Exploration", type: "support", recruitVia: "Culture", baseType: "swordsman", combatBonus: 3, auraBonus: 3, lifespan: 30, rechargeable: false, ability: "qhapaq_nan", abilityDesc: "Qhapaq Ñan: while he lives your land units ignore rough-terrain movement penalties — the royal roads run everywhere — and the city he stands in grows +25% food from the terraces.", auraDesc: "Adjacent allies cross the mountains with ease." }),
  L({ id: "zheng_he_legend", name: "Zheng He", era: "Exploration", type: "naval", recruitVia: "Wonder", baseType: "trireme", combatBonus: 8, auraBonus: 4, lifespan: 30, rechargeable: false, ability: "treasure_fleet", abilityDesc: "Treasure Fleet: +4 gold every turn and +1 movement for all your ships while the admiral sails; he can Catch the Monsoon for a burst of speed.", auraDesc: "Adjacent ships sail with the treasure fleet." }),
  L({ id: "yi_sun_sin_legend", name: "Yi Sun-sin", era: "Exploration", type: "naval", recruitVia: "Quest", baseType: "trireme", combatBonus: 10, auraBonus: 4, lifespan: 30, rechargeable: false, ability: "turtle_ship", abilityDesc: "Turtle Ship: seal the spiked iron shell (+30% defense; melee attackers bleed on the spikes) or fire a crashing Broadside at range that wrecks the survivor's rigging.", auraDesc: "Adjacent ships are shielded like the turtle ship." }),
];

const LEGEND_BY_ID = new Map(LEGENDS.map((l) => [l.id, l]));
export const getLegend = (id: string | undefined): LegendDef | undefined =>
  id ? LEGEND_BY_ID.get(id) : undefined;
export const LEGEND_IDS: string[] = LEGENDS.map((l) => l.id);
