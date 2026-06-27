// Civilization content. Kept dependency-free (loose string ids for unit classes
// and building ids) so the sim can import it without a dependency cycle. The sim
// applies these effects at the relevant points (see packages/sim/src/game/civs.ts).

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
    abilityDesc: "+5% production; melee units +1 strength and muster with higher morale.",
    uniqueUnit: "Sargonic Guard",
    uniqueInfra: "Palace Archive",
    effects: { yieldPercent: { production: 5 }, unitClassCombat: { melee: 1 }, startMoraleBonus: 15 },
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
    abilityDesc: "+5% production; melee units +1 strength and train 10% faster.",
    uniqueUnit: "Hittite Chariot",
    uniqueInfra: "Storm Temple",
    effects: { yieldPercent: { production: 5 }, unitClassCombat: { melee: 1 }, trainTimePercent: -10 },
    cityNames: ["Hattusa", "Kanesh", "Tarhuntassa", "Carchemish", "Alaca Höyük", "Sapinuwa", "Samuha", "Kadesh", "Ugarit", "Malatya"],
  },
  {
    id: "elam",
    name: "Elam",
    leader: "Untash",
    abilityName: "Highland Archers",
    abilityDesc: "Ranged units +2 strength and start with extra XP.",
    uniqueUnit: "Susian Archer",
    uniqueInfra: "Chogha Zanbil",
    effects: { unitClassCombat: { ranged: 2 }, startXpBonus: 10 },
    cityNames: ["Susa", "Anshan", "Chogha Zanbil", "Hidalu", "Dur-Untash", "Madaktu", "Haft Tepe", "Kabnak", "Shimashki", "Awan"],
  },
  {
    id: "phoenicia",
    name: "Phoenicia",
    leader: "Dido",
    abilityName: "Mediterranean Colonies",
    abilityDesc: "+15% gold.",
    uniqueUnit: "Phoenician Bireme",
    uniqueInfra: "Cothon",
    effects: { yieldPercent: { gold: 15 } },
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
    abilityDesc: "Cavalry +1 movement.",
    uniqueUnit: "Median Lancer",
    uniqueInfra: "Royal Stable",
    effects: { cavalryMovementBonus: 1 },
    cityNames: ["Ecbatana", "Rhagae", "Pasargadae", "Susa", "Agbatana", "Cyropolis", "Gaugamela", "Raga", "Patigrabana", "Apamea"],
  },
  {
    id: "persia",
    name: "Persia",
    leader: "Cyrus",
    abilityName: "Satrapies",
    abilityDesc: "+15% gold; melee units +1 combat strength.",
    uniqueUnit: "Immortal",
    uniqueInfra: "Pairidaeza",
    effects: { yieldPercent: { gold: 15 }, unitClassCombat: { melee: 1 } },
    cityNames: ["Persepolis", "Pasargadae", "Susa", "Ecbatana", "Sardis", "Babylon", "Tyre", "Memphis", "Nineveh", "Bactra"],
  },
  {
    id: "parthia",
    name: "Parthia",
    leader: "Mithridates",
    abilityName: "Parthian Shot",
    abilityDesc: "Cavalry +2 combat strength.",
    uniqueUnit: "Parthian Horse Archer",
    uniqueInfra: "Caravanserai",
    effects: { unitClassCombat: { cavalry: 2 } },
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
    abilityDesc: "+1 gold from each worked desert tile; units start with extra XP.",
    uniqueUnit: "Nubian Archer",
    uniqueInfra: "Nubian Pyramid",
    effects: { goldPerWorkedDesert: 1, startXpBonus: 10 },
    cityNames: ["Meroë", "Napata", "Kerma", "Naqa", "Musawwarat es-Sufra", "Dongola", "Kawa", "Soleb", "Semna", "Abu Erteila"],
  },
  {
    id: "carthage",
    name: "Carthage",
    leader: "Hannibal",
    abilityName: "Phoenician Heritage",
    abilityDesc: "+15% gold; cavalry +1 combat strength.",
    uniqueUnit: "Carthaginian War Elephant",
    uniqueInfra: "Cothon",
    effects: { yieldPercent: { gold: 15 }, unitClassCombat: { cavalry: 1 } },
    cityNames: ["Carthage", "Utica", "Hadrumetum", "Leptis Magna", "Gades", "Panormus", "Lilybaeum", "Motya", "Cirta", "Hippo Regius"],
  },
  {
    id: "aksum",
    name: "Aksum",
    leader: "Ezana",
    abilityName: "Red Sea Trade",
    abilityDesc: "+15% gold.",
    uniqueUnit: "Aksumite Spearman",
    uniqueInfra: "Stelae",
    effects: { yieldPercent: { gold: 15 } },
    cityNames: ["Aksum", "Adulis", "Yeha", "Matara", "Qohaito", "Hawulti", "Tokonda", "Beta Giyorgis", "Debre Damo", "Matara"],
  },
  {
    id: "ethiopia_zagwe",
    name: "Ethiopia (Zagwe)",
    leader: "Lalibela",
    abilityName: "Aksumite Legacy",
    abilityDesc: "+10% faith; cavalry +1 combat strength.",
    uniqueUnit: "Oromo Cavalry",
    uniqueInfra: "Rock-Hewn Church",
    effects: { yieldPercent: { faith: 10 }, unitClassCombat: { cavalry: 1 } },
    cityNames: ["Lalibela", "Aksum", "Gondar", "Roha", "Adwa", "Debre Berhan", "Debre Libanos", "Mekelle", "Antioch", "Begemder"],
  },
  {
    id: "mali",
    name: "Mali",
    leader: "Mansa Musa",
    abilityName: "Sahel Merchants",
    abilityDesc: "+10% gold; +2 gold from each worked desert tile.",
    uniqueUnit: "Mandekalu Cavalry",
    uniqueInfra: "Suguba",
    effects: { yieldPercent: { gold: 10 }, goldPerWorkedDesert: 2 },
    cityNames: ["Timbuktu", "Djenné", "Gao", "Koumbi Saleh", "Niani", "Walata", "Aoudaghost", "Tadmekka", "Ségou", "Kano"],
  },
  {
    id: "ghana_empire",
    name: "Ghana Empire",
    leader: "Tunka Manin",
    abilityName: "Gold of Wagadu",
    abilityDesc: "+15% gold.",
    uniqueUnit: "Soninke Warrior",
    uniqueInfra: "Gold Market",
    effects: { yieldPercent: { gold: 15 } },
    cityNames: ["Koumbi Saleh", "Awdaghost", "Tadmekka", "Kumbi", "Walata", "Gao", "Timbuktu", "Azougui", "Sijilmasa", "Niani"],
  },
  {
    id: "songhai",
    name: "Songhai",
    leader: "Askia",
    abilityName: "River of Gold",
    abilityDesc: "+15% gold.",
    uniqueUnit: "Songhai Cavalry",
    uniqueInfra: "River Port",
    effects: { yieldPercent: { gold: 15 } },
    cityNames: ["Gao", "Timbuktu", "Djenné", "Kukiya", "Bentia", "Kabara", "Bamba", "Mema", "Jenne-Jeno", "Taghaza"],
  },
  {
    id: "great_zimbabwe",
    name: "Great Zimbabwe",
    leader: "Nyatsimba",
    abilityName: "Cattle & Stone",
    abilityDesc: "+10% food, +10% gold (great cattle herds).",
    uniqueUnit: "Zimbabwe Spearman",
    uniqueInfra: "Great Enclosure",
    effects: { yieldPercent: { gold: 10, food: 10 } },
    cityNames: ["Great Zimbabwe", "Mapungubwe", "Khami", "Thulamela", "Danamombe", "Manyikeni", "Naletale", "Chibuene", "Sofala", "Kilwa"],
  },
  {
    id: "kanem_bornu",
    name: "Kanem-Bornu",
    leader: "Idris Alooma",
    abilityName: "Trans-Saharan",
    abilityDesc: "+15% gold.",
    uniqueUnit: "Kanembu Guard",
    uniqueInfra: "Sahel Caravan Post",
    effects: { yieldPercent: { gold: 15 } },
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
    abilityDesc: "+10% gold, +5% culture.",
    uniqueUnit: "Minoan Bireme",
    uniqueInfra: "Labyrinth Palace",
    effects: { yieldPercent: { gold: 10, culture: 5 } },
    cityNames: ["Knossos", "Phaistos", "Malia", "Zakros", "Gournia", "Thera", "Akrotiri", "Tylissos", "Archanes", "Amnissos"],
  },
  {
    id: "mycenaean_greece",
    name: "Mycenaean Greece",
    leader: "Agamemnon",
    abilityName: "Heroic Age",
    abilityDesc: "Melee units +2 combat strength.",
    uniqueUnit: "Mycenaean Spearman",
    uniqueInfra: "Megaron",
    effects: { unitClassCombat: { melee: 2 } },
    cityNames: ["Mycenae", "Tiryns", "Pylos", "Thebes", "Knossos", "Midea", "Athens", "Iolcos", "Orchomenus", "Gla"],
  },
  {
    id: "greece",
    name: "Greece",
    leader: "Pericles",
    abilityName: "Plato's Republic",
    abilityDesc: "+15% science; melee units +1 combat strength.",
    uniqueUnit: "Greek Hoplite",
    uniqueInfra: "Acropolis",
    effects: { yieldPercent: { science: 15 }, unitClassCombat: { melee: 1 } },
    cityNames: ["Athens", "Sparta", "Corinth", "Thebes", "Delphi", "Olympia", "Argos", "Ephesus", "Miletus", "Syracuse"],
  },
  {
    id: "sparta",
    name: "Sparta",
    leader: "Leonidas",
    abilityName: "Agoge",
    abilityDesc: "Melee units +2 strength and muster with high morale and extra XP.",
    uniqueUnit: "Spartan Hoplite",
    uniqueInfra: "Syssitia",
    effects: { unitClassCombat: { melee: 2 }, startMoraleBonus: 25, startXpBonus: 10 },
    cityNames: ["Sparta", "Gytheio", "Amyklai", "Thouria", "Messene", "Gythium", "Pellana", "Sellasia", "Kardamyle", "Oitylos"],
  },
  {
    id: "macedon",
    name: "Macedon",
    leader: "Alexander",
    abilityName: "Hellenistic Fusion",
    abilityDesc: "Melee +1 and cavalry +1 strength; units start with extra XP.",
    uniqueUnit: "Hypaspist",
    uniqueInfra: "Basilikoi Paides",
    effects: { unitClassCombat: { melee: 1, cavalry: 1 }, startXpBonus: 15 },
    cityNames: ["Pella", "Aegae", "Thessalonica", "Amphipolis", "Philippi", "Beroea", "Edessa", "Dion", "Stagira", "Pydna"],
  },
  {
    id: "etruscans",
    name: "Etruscans",
    leader: "Lars Porsena",
    abilityName: "Twelve Cities",
    abilityDesc: "+15% gold.",
    uniqueUnit: "Etruscan Hoplite",
    uniqueInfra: "Tumulus",
    effects: { yieldPercent: { gold: 15 } },
    cityNames: ["Veii", "Tarquinia", "Cerveteri", "Vulci", "Populonia", "Volsinii", "Perusia", "Arretium", "Cortona", "Clusium"],
  },
  {
    id: "rome",
    name: "Rome",
    leader: "Trajan",
    abilityName: "All Roads Lead to Rome",
    abilityDesc: "New cities found with a free Monument; cities can train one extra unit at once.",
    uniqueUnit: "Roman Legionary",
    uniqueInfra: "Roman Bath",
    effects: { newCityFreeBuilding: "monument", trainingSlotsBonus: 1 },
    cityNames: ["Rome", "Ostia", "Antium", "Capua", "Pompeii", "Cumae", "Neapolis", "Arretium", "Mediolanum", "Aquileia"],
  },
  {
    id: "celts_gauls",
    name: "Celts / Gauls",
    leader: "Vercingetorix",
    abilityName: "Druidic Lore",
    abilityDesc: "Melee units +1 combat strength; +1 faith from forests in your territory.",
    uniqueUnit: "Gaesatae",
    uniqueInfra: "Oppidum",
    effects: { unitClassCombat: { melee: 1 }, forestTileFaithBonus: 1 },
    cityNames: ["Alesia", "Bibracte", "Gergovia", "Lutetia", "Avaricum", "Numantia", "Camulodunum", "Verlamion", "Glauberg", "Heuneburg"],
  },
  {
    id: "byzantium",
    name: "Byzantium",
    leader: "Justinian",
    abilityName: "Taxis",
    abilityDesc: "Melee units +1 combat strength; cavalry +1 combat strength.",
    uniqueUnit: "Byzantine Cataphract",
    uniqueInfra: "Hippodrome",
    effects: { unitClassCombat: { melee: 1, cavalry: 1 } },
    cityNames: ["Constantinople", "Thessalonica", "Nicomedia", "Antioch", "Trebizond", "Ephesus", "Nicaea", "Smyrna", "Adrianople", "Athens"],
  },
  {
    id: "norse",
    name: "Norse",
    leader: "Harald Hardrada",
    abilityName: "Knarr",
    abilityDesc: "+15% gold; melee units +1 combat strength; +15% gold from coastal raids.",
    uniqueUnit: "Norse Longship",
    uniqueInfra: "Stave Church",
    effects: { yieldPercent: { gold: 15 }, unitClassCombat: { melee: 1 }, coastalRaidGoldPercent: 15 },
    cityNames: ["Kaupang", "Birka", "Hedeby", "Trondheim", "Oslo", "Reykjavik", "York", "Dublin", "Ribe", "Visby"],
  },
  {
    id: "franks",
    name: "Franks",
    leader: "Charlemagne",
    abilityName: "Carolingian Reform",
    abilityDesc: "Cavalry +1 movement and +1 combat strength.",
    uniqueUnit: "Frankish Paladin",
    uniqueInfra: "Palatine Chapel",
    effects: { cavalryMovementBonus: 1, unitClassCombat: { cavalry: 1 } },
    cityNames: ["Aachen", "Paris", "Tours", "Soissons", "Reims", "Cologne", "Trier", "Mainz", "Strasbourg", "Metz"],
  },
  {
    id: "goths",
    name: "Goths",
    leader: "Theodoric",
    abilityName: "Foederati",
    abilityDesc: "Cavalry +1 movement.",
    uniqueUnit: "Gothic Rider",
    uniqueInfra: "Wagon Fort",
    effects: { cavalryMovementBonus: 1 },
    cityNames: ["Ravenna", "Toulouse", "Toledo", "Naples", "Milan", "Aquileia", "Moesia", "Dacia", "Oium", "Gothiscandza"],
  },
  {
    id: "anglo_saxon_england",
    name: "Anglo-Saxon / England",
    leader: "Alfred",
    abilityName: "Workshop of the World",
    abilityDesc: "+10% production; ranged units +2 combat strength.",
    uniqueUnit: "Longbowman",
    uniqueInfra: "Manor House",
    effects: { yieldPercent: { production: 10 }, unitClassCombat: { ranged: 2 } },
    cityNames: ["Winchester", "London", "York", "Canterbury", "Lincoln", "Gloucester", "Worcester", "Durham", "Exeter", "Oxford"],
  },
  {
    id: "france",
    name: "France",
    leader: "Joan of Arc",
    abilityName: "Grand Tour",
    abilityDesc: "+10% gold, +5% culture.",
    uniqueUnit: "Garde Écossaise",
    uniqueInfra: "Château",
    effects: { yieldPercent: { gold: 10, culture: 5 } },
    cityNames: ["Paris", "Orléans", "Tours", "Reims", "Lyon", "Marseille", "Bordeaux", "Rouen", "Avignon", "Toulouse"],
  },
  {
    id: "castile_spain",
    name: "Castile / Spain",
    leader: "Isabella",
    abilityName: "El Escorial",
    abilityDesc: "+10% gold; melee units +1 combat strength.",
    uniqueUnit: "Conquistador",
    uniqueInfra: "Mission",
    effects: { yieldPercent: { gold: 10 }, unitClassCombat: { melee: 1 } },
    cityNames: ["Toledo", "Córdoba", "Seville", "Granada", "Burgos", "Valladolid", "Salamanca", "Segovia", "Madrid", "Barcelona"],
  },
  {
    id: "portugal",
    name: "Portugal",
    leader: "Henry the Navigator",
    abilityName: "Casa da Índia",
    abilityDesc: "+20% gold.",
    uniqueUnit: "Nau",
    uniqueInfra: "Feitoria",
    effects: { yieldPercent: { gold: 20 } },
    cityNames: ["Lisbon", "Porto", "Coimbra", "Évora", "Braga", "Sintra", "Guimarães", "Tomar", "Aveiro", "Lagos"],
  },
  {
    id: "venice",
    name: "Venice",
    leader: "Enrico Dandolo",
    abilityName: "Serenissima",
    abilityDesc: "+20% gold.",
    uniqueUnit: "Venetian Galleass",
    uniqueInfra: "Arsenale",
    effects: { yieldPercent: { gold: 20 } },
    cityNames: ["Venice", "Padua", "Verona", "Vicenza", "Treviso", "Chioggia", "Rovigo", "Belluno", "Mestre", "Murano"],
  },
  {
    id: "genoa",
    name: "Genoa",
    leader: "Andrea Doria",
    abilityName: "Bank of San Giorgio",
    abilityDesc: "+20% gold.",
    uniqueUnit: "Genoese Crossbowman",
    uniqueInfra: "Banco",
    effects: { yieldPercent: { gold: 20 } },
    cityNames: ["Genoa", "Pisa", "Lucca", "Savona", "Ventimiglia", "Albenga", "Sarzana", "Rapallo", "Chiavari", "Finale"],
  },
  {
    id: "dutch_republic",
    name: "Dutch Republic",
    leader: "William the Silent",
    abilityName: "Grachten",
    abilityDesc: "+10% gold, +10% food (reclaimed polderland).",
    uniqueUnit: "Sea Beggar",
    uniqueInfra: "Polder",
    effects: { yieldPercent: { gold: 10, food: 10 } },
    cityNames: ["Amsterdam", "Rotterdam", "The Hague", "Utrecht", "Delft", "Leiden", "Haarlem", "Gouda", "Middelburg", "Groningen"],
  },
  {
    id: "holy_roman_empire",
    name: "Holy Roman Empire / Germany",
    leader: "Barbarossa",
    abilityName: "Free Imperial Cities",
    abilityDesc: "+15% production, +5% gold.",
    uniqueUnit: "Landsknecht",
    uniqueInfra: "Hansa",
    effects: { yieldPercent: { production: 15, gold: 5 } },
    cityNames: ["Aachen", "Frankfurt", "Cologne", "Hamburg", "Lübeck", "Nuremberg", "Regensburg", "Augsburg", "Munich", "Magdeburg"],
  },
  {
    id: "kievan_rus",
    name: "Kievan Rus",
    leader: "Yaroslav",
    abilityName: "Lavra",
    abilityDesc: "+10% faith; +1 faith from forests in your territory.",
    uniqueUnit: "Druzhina",
    uniqueInfra: "Lavra",
    effects: { yieldPercent: { faith: 10 }, forestTileFaithBonus: 1 },
    cityNames: ["Kyiv", "Novgorod", "Vladimir", "Suzdal", "Chernigov", "Polotsk", "Smolensk", "Pereyaslavl", "Galich", "Rostov"],
  },
  {
    id: "poland_lithuania",
    name: "Poland-Lithuania",
    leader: "Jadwiga",
    abilityName: "Golden Liberty",
    abilityDesc: "+10% gold; cavalry +1 combat strength.",
    uniqueUnit: "Winged Hussar",
    uniqueInfra: "Sukiennice",
    effects: { yieldPercent: { gold: 10 }, unitClassCombat: { cavalry: 1 } },
    cityNames: ["Kraków", "Vilnius", "Gniezno", "Poznań", "Warsaw", "Lublin", "Lwów", "Toruń", "Kaunas", "Wrocław"],
  },
  {
    id: "hungary",
    name: "Hungary",
    leader: "Matthias Corvinus",
    abilityName: "Pearl of the Danube",
    abilityDesc: "Cavalry +1 strength; units train 10% faster and start with extra XP (the Black Army).",
    uniqueUnit: "Black Army",
    uniqueInfra: "Thermal Bath",
    effects: { unitClassCombat: { cavalry: 1 }, trainTimePercent: -10, startXpBonus: 10 },
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
    abilityDesc: "+5% production, +15% science.",
    uniqueUnit: "Fire Lancer",
    uniqueInfra: "Imperial Examination Hall",
    effects: { yieldPercent: { production: 5, science: 15 } },
    cityNames: ["Chang'an", "Luoyang", "Kaifeng", "Hangzhou", "Nanjing", "Bianliang", "Yangzhou", "Suzhou", "Guangzhou", "Quanzhou"],
  },
  {
    id: "china_ming",
    name: "China (Ming)",
    leader: "Yongle",
    abilityName: "Treasure Fleets",
    abilityDesc: "+15% gold.",
    uniqueUnit: "Ming War Junk",
    uniqueInfra: "Porcelain Tower",
    effects: { yieldPercent: { gold: 15 } },
    cityNames: ["Beijing", "Nanjing", "Hangzhou", "Suzhou", "Xi'an", "Guangzhou", "Quanzhou", "Fuzhou", "Yangzhou", "Chengdu"],
  },
  {
    id: "maurya",
    name: "Maurya",
    leader: "Ashoka",
    abilityName: "Dharma",
    abilityDesc: "+10% food; cavalry +1 combat strength.",
    uniqueUnit: "Mauryan War Elephant",
    uniqueInfra: "Stepwell",
    effects: { yieldPercent: { food: 10 }, unitClassCombat: { cavalry: 1 } },
    cityNames: ["Pataliputra", "Taxila", "Ujjain", "Vidisha", "Mathura", "Sarnath", "Kosambi", "Rajagriha", "Varanasi", "Kaushambi"],
  },
  {
    id: "gupta_india",
    name: "Gupta India",
    leader: "Chandragupta II",
    abilityName: "Golden Age of India",
    abilityDesc: "+15% science.",
    uniqueUnit: "Gupta Elephant Archer",
    uniqueInfra: "University-Temple",
    effects: { yieldPercent: { science: 15 } },
    cityNames: ["Pataliputra", "Ujjain", "Prayaga", "Mathura", "Sarnath", "Kannauj", "Valabhi", "Ajanta", "Nalanda", "Vidisha"],
  },
  {
    id: "chola",
    name: "Chola",
    leader: "Rajaraja",
    abilityName: "Maritime Empire",
    abilityDesc: "+15% gold.",
    uniqueUnit: "Chola Warship",
    uniqueInfra: "Brihadeeswara Temple",
    effects: { yieldPercent: { gold: 15 } },
    cityNames: ["Thanjavur", "Gangaikonda Cholapuram", "Uraiyur", "Kanchipuram", "Kaveripattinam", "Nagapattinam", "Madurai", "Tiruchirappalli", "Pudukkottai", "Sri Lanka"],
  },
  {
    id: "japan",
    name: "Japan",
    leader: "Tokugawa",
    abilityName: "Bushido",
    abilityDesc: "Melee units +2 combat strength.",
    uniqueUnit: "Samurai",
    uniqueInfra: "Tenshu Castle",
    effects: { unitClassCombat: { melee: 2 } },
    cityNames: ["Kyoto", "Edo", "Osaka", "Nara", "Kamakura", "Nagoya", "Hiroshima", "Nagasaki", "Kobe", "Fukuoka"],
  },
  {
    id: "korea",
    name: "Korea (Goryeo/Joseon)",
    leader: "Sejong",
    abilityName: "Hwarang",
    abilityDesc: "+15% science.",
    uniqueUnit: "Turtle Ship",
    uniqueInfra: "Seowon",
    effects: { yieldPercent: { science: 15 } },
    cityNames: ["Kaesong", "Seoul", "Pyongyang", "Gyeongju", "Busan", "Hanseong", "Andong", "Jeonju", "Daegu", "Gangneung"],
  },
  {
    id: "tibet",
    name: "Tibet",
    leader: "Songtsen Gampo",
    abilityName: "Roof of the World",
    abilityDesc: "+10% faith; cavalry +1 combat strength.",
    uniqueUnit: "Tibetan Cavalry",
    uniqueInfra: "Potala",
    effects: { yieldPercent: { faith: 10 }, unitClassCombat: { cavalry: 1 } },
    cityNames: ["Lhasa", "Shigatse", "Gyantse", "Sakya", "Tsaparang", "Lhoka", "Chamdo", "Nagchu", "Nyingchi", "Xigazê"],
  },
  {
    id: "dai_viet_vietnam",
    name: "Dai Viet (Vietnam)",
    leader: "Le Loi",
    abilityName: "Nine Dragons",
    abilityDesc: "Melee units +1 combat strength; +1 combat strength for units in forests.",
    uniqueUnit: "Voi Chiến",
    uniqueInfra: "Thành",
    effects: { unitClassCombat: { melee: 1 }, forestTileCombatBonus: 1 },
    cityNames: ["Hanoi", "Thăng Long", "Huế", "Hoa Lư", "Thanh Hóa", "Nam Định", "Nghệ An", "Vinh", "Đồng Nai", "Saigon"],
  },
  {
    id: "khmer",
    name: "Khmer",
    leader: "Jayavarman VII",
    abilityName: "Grand Barays",
    abilityDesc: "+12% food (the great reservoirs).",
    uniqueUnit: "Domrey",
    uniqueInfra: "Prasat",
    effects: { yieldPercent: { food: 12 } },
    cityNames: ["Angkor", "Yasodharapura", "Hariharalaya", "Koh Ker", "Phnom Kulen", "Banteay Srei", "Preah Khan", "Ta Prohm", "Sambor Prei Kuk", "Battambang"],
  },
  {
    id: "srivijaya",
    name: "Srivijaya",
    leader: "Balaputra",
    abilityName: "Maritime Mandala",
    abilityDesc: "+15% gold.",
    uniqueUnit: "Jong",
    uniqueInfra: "Candi",
    effects: { yieldPercent: { gold: 15 } },
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
    abilityDesc: "+10% faith; cavalry +1 combat strength.",
    uniqueUnit: "Burmese War Elephant",
    uniqueInfra: "Pagoda",
    effects: { yieldPercent: { faith: 10 }, unitClassCombat: { cavalry: 1 } },
    cityNames: ["Pagan", "Bagan", "Ava", "Mandalay", "Pegu", "Thaton", "Mrauk-U", "Amarapura", "Sagaing", "Pyay"],
  },
  {
    id: "ayutthaya_siam",
    name: "Ayutthaya (Siam)",
    leader: "Ramkhamhaeng",
    abilityName: "Father Governs Children",
    abilityDesc: "+10% science, +5% faith.",
    uniqueUnit: "Siamese War Elephant",
    uniqueInfra: "Wat",
    effects: { yieldPercent: { science: 10, faith: 5 } },
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
    abilityDesc: "Cavalry +1 combat strength; cavalry +1 movement.",
    uniqueUnit: "Scythian Horse Archer",
    uniqueInfra: "Kurgan",
    effects: { cavalryMovementBonus: 1, unitClassCombat: { cavalry: 1 } },
    cityNames: ["Tanais", "Gelonus", "Pazyryk", "Arzhan", "Ulski", "Kargaly", "Issyk", "Filippovka", "Solokha", "Sauromatia"],
  },
  {
    id: "xiongnu",
    name: "Xiongnu",
    leader: "Modu Chanyu",
    abilityName: "Steppe Confederacy",
    abilityDesc: "Cavalry +1 movement; +25% gold from raiding.",
    uniqueUnit: "Xiongnu Horse Archer",
    uniqueInfra: "Felt Tent",
    effects: { cavalryMovementBonus: 1, raidGoldPercent: 25 },
    cityNames: ["Luut Khot", "Khangai", "Otgon", "Ivolga", "Noin-Ula", "Tsetserleg", "Karakorum", "Ordu-Baliq", "Kherlen", "Talas"],
  },
  {
    id: "huns",
    name: "Huns",
    leader: "Attila",
    abilityName: "Scourge of God",
    abilityDesc: "Cavalry +2 combat strength.",
    uniqueUnit: "Hunnic Horde",
    uniqueInfra: "Ordu",
    effects: { unitClassCombat: { cavalry: 2 } },
    cityNames: ["Attila's Court", "Bleda", "Tisza", "Dacia", "Pannonia", "Naissus", "Margus", "Viminacium", "Sirmium", "Aquincum"],
  },
  {
    id: "gokturks",
    name: "Göktürks",
    leader: "Bumin Qaghan",
    abilityName: "Sky Father",
    abilityDesc: "Cavalry +2 combat strength.",
    uniqueUnit: "Turkic Lancer",
    uniqueInfra: "Stone Stele",
    effects: { unitClassCombat: { cavalry: 2 } },
    cityNames: ["Ordu-Baliq", "Suyab", "Talas", "Bishbalik", "Karakorum", "Otuken", "Yenisei", "Altai", "Zhenzhu", "Sogdia"],
  },
  {
    id: "seljuks",
    name: "Seljuks",
    leader: "Alp Arslan",
    abilityName: "Ghazi",
    abilityDesc: "Cavalry +2 combat strength.",
    uniqueUnit: "Ghulam",
    uniqueInfra: "Madrasa",
    effects: { unitClassCombat: { cavalry: 2 } },
    cityNames: ["Merv", "Nishapur", "Rey", "Isfahan", "Baghdad", "Konya", "Iconium", "Hamadan", "Rayy", "Ghazna"],
  },
  {
    id: "mongols",
    name: "Mongols",
    leader: "Genghis Khan",
    abilityName: "Örtöö",
    abilityDesc: "Cavalry +1 combat strength; cavalry +1 movement.",
    uniqueUnit: "Keshig",
    uniqueInfra: "Ordu",
    effects: { cavalryMovementBonus: 1, unitClassCombat: { cavalry: 1 } },
    cityNames: ["Karakorum", "Khanbaliq", "Samarkand", "Bukhara", "Merv", "Nishapur", "Tabriz", "Sarai", "Bolghar", "Almaliq"],
  },
  {
    id: "timurids",
    name: "Timurids",
    leader: "Tamerlane",
    abilityName: "Sword of Islam",
    abilityDesc: "+10% science; cavalry +1 combat strength; +15% gold from raiding; raids also yield science.",
    uniqueUnit: "Timurid Siege Train",
    uniqueInfra: "Registan",
    effects: { yieldPercent: { science: 10 }, unitClassCombat: { cavalry: 1 }, raidGoldPercent: 15, raidSciencePercent: 50 },
    cityNames: ["Samarkand", "Bukhara", "Herat", "Isfahan", "Shiraz", "Mashhad", "Tabriz", "Kabul", "Balkh", "Damascus"],
  },
  {
    id: "ottomans",
    name: "Ottomans",
    leader: "Mehmed II",
    abilityName: "Great Bombard",
    abilityDesc: "Siege units +2 combat strength.",
    uniqueUnit: "Janissary",
    uniqueInfra: "Grand Bazaar",
    effects: { unitClassCombat: { siege: 2 } },
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
    abilityDesc: "+5% production, +10% culture.",
    uniqueUnit: "Olmec Spearman",
    uniqueInfra: "Colossal Head",
    effects: { yieldPercent: { production: 5, culture: 10 } },
    cityNames: ["San Lorenzo", "La Venta", "Tres Zapotes", "Laguna de los Cerros", "Las Bocas", "El Manatí", "Chalcatzingo", "San José Mogote", "La Mojarra", "Potrero Nuevo"],
  },
  {
    id: "maya",
    name: "Maya",
    leader: "Pacal the Great",
    abilityName: "Mayab",
    abilityDesc: "+10% science, +5% culture.",
    uniqueUnit: "Holkan",
    uniqueInfra: "Observatory",
    effects: { yieldPercent: { science: 10, culture: 5 } },
    cityNames: ["Tikal", "Palenque", "Chichen Itza", "Copán", "Calakmul", "Uxmal", "Caracol", "Yaxha", "Bonampak", "Tulum"],
  },
  {
    id: "zapotec",
    name: "Zapotec",
    leader: "Cocijo priesthood",
    abilityName: "Cloud People",
    abilityDesc: "+5% culture; melee units +1 combat strength.",
    uniqueUnit: "Zapotec Warrior",
    uniqueInfra: "Danzante Temple",
    effects: { unitClassCombat: { melee: 1 }, yieldPercent: { culture: 5 } },
    cityNames: ["Monte Albán", "Mitla", "San José Mogote", "Dainzu", "Lambityeco", "Yagul", "Zaachila", "Huamelulpan", "Huitzo", "Teotitlán"],
  },
  {
    id: "teotihuacan",
    name: "Teotihuacan",
    leader: "Priest-Kings",
    abilityName: "City of the Gods",
    abilityDesc: "+10% production, +8% faith.",
    uniqueUnit: "Pyramid Guard",
    uniqueInfra: "Avenue of the Dead",
    effects: { yieldPercent: { production: 10, faith: 8 } },
    cityNames: ["Teotihuacan", "Cuicuilco", "Cholula", "Tula", "Xochicalco", "Cacaxtla", "Cantona", "Tajín", "Tenochtitlan", "Tlaxcala"],
  },
  {
    id: "toltec",
    name: "Toltec",
    leader: "Topiltzin",
    abilityName: "Toltecayotl",
    abilityDesc: "Melee units +2 combat strength.",
    uniqueUnit: "Toltec Warrior",
    uniqueInfra: "Atlantean Hall",
    effects: { unitClassCombat: { melee: 2 } },
    cityNames: ["Tula", "Cholula", "Tollan", "Xicotencatl", "Cempoala", "Tenayuca", "Teotihuacan", "Malinalco", "Tula de Allende", "Huapalcalco"],
  },
  {
    id: "aztec",
    name: "Aztec",
    leader: "Montezuma",
    abilityName: "Legend of the Eagle",
    abilityDesc: "Melee units +2 combat strength.",
    uniqueUnit: "Eagle Warrior",
    uniqueInfra: "Tlachtli",
    effects: { unitClassCombat: { melee: 2 } },
    cityNames: ["Tenochtitlan", "Texcoco", "Tlacopan", "Cholula", "Tlaxcala", "Tenayuca", "Azcapotzalco", "Cuauhtitlan", "Xochimilco", "Otumba"],
  },
  {
    id: "inca",
    name: "Inca",
    leader: "Pachacuti",
    abilityName: "Mit'a",
    abilityDesc: "+10% food; +1 food from fresh-water tiles.",
    uniqueUnit: "Warak'aq",
    uniqueInfra: "Terrace Farm",
    effects: { yieldPercent: { food: 10 }, freshWaterTileFoodBonus: 1 },
    cityNames: ["Cusco", "Machu Picchu", "Quito", "Lima", "Chan Chan", "Tiwanaku", "Huaraz", "Vilcabamba", "Ollantaytambo", "Sacsayhuamán"],
  },
  {
    id: "muisca",
    name: "Muisca",
    leader: "Zipa",
    abilityName: "El Dorado",
    abilityDesc: "+15% gold.",
    uniqueUnit: "Guecha Warrior",
    uniqueInfra: "Salt Temple",
    effects: { yieldPercent: { gold: 15 } },
    cityNames: ["Bacatá", "Hunza", "Muyquytá", "Suamox", "Zipaquirá", "Tunja", "Sogamoso", "Guatavita", "Nemocón", "Tocancipá"],
  },
  {
    id: "mississippian_cahokia",
    name: "Mississippian (Cahokia)",
    leader: "Great Sun",
    abilityName: "Mound Builders",
    abilityDesc: "+10% production, +5% culture.",
    uniqueUnit: "Cahokian Warrior",
    uniqueInfra: "Earthwork Mound",
    effects: { yieldPercent: { production: 10, culture: 5 } },
    cityNames: ["Cahokia", "Moundville", "Etowah", "Spiro", "Kincaid", "Angel", "Emerald", "Wickliffe", "Winterville", "Nodena"],
  },
  {
    id: "haudenosaunee",
    name: "Haudenosaunee (Iroquois)",
    leader: "Hiawatha",
    abilityName: "Great League",
    abilityDesc: "+10% food, +5% production.",
    uniqueUnit: "Mohawk Warrior",
    uniqueInfra: "Longhouse",
    effects: { yieldPercent: { production: 5, food: 10 } },
    cityNames: ["Onondaga", "Seneca", "Cayuga", "Oneida", "Mohawk", "Tuscarora", "Ganondagan", "Canandaigua", "Buffalo", "Caughnawaga"],
  },
  {
    id: "pueblo",
    name: "Pueblo",
    leader: "Council",
    abilityName: "Cliff Dwellers",
    abilityDesc: "+8% production; +1 production from hill tiles.",
    uniqueUnit: "Pueblo Skirmisher",
    uniqueInfra: "Cliff Palace",
    effects: { yieldPercent: { production: 8 }, hillTileProductionBonus: 1 },
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
    abilityDesc: "+15% gold.",
    uniqueUnit: "Koa Warrior",
    uniqueInfra: "Marae",
    effects: { yieldPercent: { gold: 15 } },
    cityNames: ["Hanga Roa", "Mo'orea", "Raiatea", "Tahiti", "Hawai'i", "Samoa", "Tonga", "Aotearoa", "Rapa Nui", "Marquesas"],
  },
  {
    id: "maori",
    name: "Māori",
    leader: "Kupe",
    abilityName: "Mana",
    abilityDesc: "Melee units +2 combat strength.",
    uniqueUnit: "Toa",
    uniqueInfra: "Pā",
    effects: { unitClassCombat: { melee: 2 } },
    cityNames: ["Waitangi", "Kaikohe", "Rotorua", "Wellington", "Auckland", "Christchurch", "Whangārei", "Tauranga", "Hamilton", "Napier"],
  },
  {
    id: "hawaii",
    name: "Hawaiʻi",
    leader: "Kamehameha",
    abilityName: "Aloha ʻĀina",
    abilityDesc: "+10% gold; +1 gold from coastal water tiles.",
    uniqueUnit: "Hawaiian Koa",
    uniqueInfra: "Heiau",
    effects: { yieldPercent: { gold: 10 }, coastalTileGoldBonus: 1 },
    cityNames: ["Honolulu", "Hilo", "Kailua", "Lahaina", "Waipahu", "Pearl City", "Kahului", "Kona", "Molokai", "Kauai"],
  },

  // ===========================================================================
  // EXPANSION — Near East & Arabia (see docs/CIVILIZATIONS-EXPANSION.md)
  // ===========================================================================
  {
    id: "arabia", name: "Arabia", leader: "Harun al-Rashid",
    abilityName: "Faith of the Prophet",
    abilityDesc: "+10% science; +2 faith per trade route.",
    uniqueUnit: "Camel Archer", uniqueInfra: "House of Wisdom",
    effects: { tradeRouteFaithBonus: 2, yieldPercent: { science: 10 } },
    cityNames: ["Mecca", "Medina", "Baghdad", "Damascus", "Kufa", "Basra", "Fustat", "Córdoba", "Samarra", "Kairouan"],
  },
  {
    id: "israelites", name: "Israelites", leader: "Solomon",
    abilityName: "Kingdom of David",
    abilityDesc: "+5% culture, +10% faith; +1 faith per trade route.",
    uniqueUnit: "Gibborim", uniqueInfra: "First Temple",
    effects: { tradeRouteFaithBonus: 1, yieldPercent: { culture: 5, faith: 10 } },
    cityNames: ["Jerusalem", "Samaria", "Hebron", "Bethlehem", "Jericho", "Beersheba", "Megiddo", "Lachish", "Shechem", "Dan"],
  },
  {
    id: "nabataeans", name: "Nabataeans", leader: "Aretas IV",
    abilityName: "Incense Road",
    abilityDesc: "+2 gold from each worked desert tile; desert cities gain +1 food.",
    uniqueUnit: "Desert Raider", uniqueInfra: "Cistern",
    effects: { goldPerWorkedDesert: 2, desertCityYield: { food: 1 } },
    cityNames: ["Petra", "Hegra", "Bosra", "Avdat", "Dumah", "Hawara", "Nessana", "Elusa", "Sela", "Mampsis"],
  },
  {
    id: "saba", name: "Saba", leader: "Bilqis",
    abilityName: "Frankincense Kingdom",
    abilityDesc: "+15% gold; +1 food from fresh-water tiles.",
    uniqueUnit: "Sabaean Spearman", uniqueInfra: "Marib Dam",
    effects: { yieldPercent: { gold: 15 }, freshWaterTileFoodBonus: 1 },
    cityNames: ["Marib", "Sirwah", "Sana'a", "Najran", "Timna", "Shabwa", "Zafar", "Baraqish", "Nashshan", "Kamna"],
  },
  {
    id: "mitanni", name: "Mitanni", leader: "Tushratta",
    abilityName: "Maryannu",
    abilityDesc: "Cavalry +2 combat strength.",
    uniqueUnit: "Maryannu Chariot", uniqueInfra: "Kikkuli Stables",
    effects: { unitClassCombat: { cavalry: 2 } },
    cityNames: ["Washukanni", "Taite", "Kahat", "Nagar", "Irridu", "Harran", "Nuzi", "Alalakh", "Terqa", "Mari"],
  },
  {
    id: "urartu", name: "Urartu", leader: "Sarduri II",
    abilityName: "Kingdom of Van",
    abilityDesc: "+10% production; +1 production from each mine.",
    uniqueUnit: "Urartian Charioteer", uniqueInfra: "Fortress of Van",
    effects: { mineTileProductionBonus: 1, yieldPercent: { production: 10 } },
    cityNames: ["Tushpa", "Erebuni", "Argishtihinili", "Teishebaini", "Musasir", "Ardini", "Hasanlu", "Bastam", "Anzaf", "Karmir Blur"],
  },

  // ===========================================================================
  // EXPANSION — Persia & Central Asia
  // ===========================================================================
  {
    id: "greco_bactria", name: "Greco-Bactria", leader: "Demetrius I",
    abilityName: "Thousand Cities",
    abilityDesc: "+10% science, +10% culture.",
    uniqueUnit: "Bactrian Cataphract", uniqueInfra: "Gymnasion",
    effects: { yieldPercent: { science: 10, culture: 10 } },
    cityNames: ["Bactra", "Ai-Khanoum", "Alexandria-Oxiana", "Demetrias", "Eucratideia", "Bagram", "Termez", "Maracanda", "Sagala", "Pushkalavati"],
  },
  {
    id: "sogdia", name: "Sogdia", leader: "Divashtich",
    abilityName: "Lords of the Silk Road",
    abilityDesc: "+3 gold per trade route; +1 trade route capacity.",
    uniqueUnit: "Sogdian Cavalry", uniqueInfra: "Caravanserai",
    effects: { tradeRouteGoldBonus: 3, tradeRouteCapacityBonus: 1 },
    cityNames: ["Samarkand", "Bukhara", "Panjikent", "Paykend", "Maimurgh", "Kesh", "Nakhshab", "Khujand", "Ustrushana", "Chach"],
  },
  {
    id: "khwarazm", name: "Khwarazm", leader: "Ala ad-Din Muhammad II",
    abilityName: "Shahs of Khwarazm",
    abilityDesc: "+15% gold; +2 gold per trade route.",
    uniqueUnit: "Khwarazmian Lancer", uniqueInfra: "Gurganj Bazaar",
    effects: { yieldPercent: { gold: 15 }, tradeRouteGoldBonus: 2 },
    cityNames: ["Gurganj", "Khiva", "Kath", "Hazarasp", "Merv", "Nishapur", "Otrar", "Urgench", "Samarkand", "Bukhara"],
  },

  // ===========================================================================
  // EXPANSION — North Africa & the Islamic Mediterranean
  // ===========================================================================
  {
    id: "numidia", name: "Numidia", leader: "Masinissa",
    abilityName: "Masaesyli Horse",
    abilityDesc: "Cavalry +1 movement; mounted units heal +10 HP per turn.",
    uniqueUnit: "Numidian Cavalry", uniqueInfra: "Royal Horse Market",
    effects: { cavalryMovementBonus: 1, mountedHealPerTurn: 10 },
    cityNames: ["Cirta", "Hippo Regius", "Thugga", "Zama", "Capsa", "Theveste", "Bulla Regia", "Calama", "Sicca", "Tipasa"],
  },
  {
    id: "fatimids", name: "Fatimid Caliphate", leader: "al-Mu'izz",
    abilityName: "Isma'ili Caliphate",
    abilityDesc: "+10% science, +10% faith.",
    uniqueUnit: "Fatimid Ghulam", uniqueInfra: "Al-Azhar",
    effects: { yieldPercent: { science: 10, faith: 10 } },
    cityNames: ["Cairo", "Mahdia", "Kairouan", "Fustat", "Alexandria", "Damascus", "Ascalon", "Tyre", "Barqa", "Palermo"],
  },
  {
    id: "ayyubids", name: "Ayyubids", leader: "Saladin",
    abilityName: "Sultan of Egypt & Syria",
    abilityDesc: "Cavalry +1 combat strength; melee units +1 combat strength; all units heal +5 HP per turn.",
    uniqueUnit: "Ayyubid Faris", uniqueInfra: "Citadel of Cairo",
    effects: { unitClassCombat: { cavalry: 1, melee: 1 }, unitHealPerTurn: 5 },
    cityNames: ["Cairo", "Damascus", "Aleppo", "Homs", "Hama", "Mosul", "Jerusalem", "Baalbek", "Mayyafariqin", "Sana'a"],
  },
  {
    id: "mamluks", name: "Mamluk Sultanate", leader: "Baybars",
    abilityName: "Slave Soldiers",
    abilityDesc: "Cavalry +2 combat strength.",
    uniqueUnit: "Mamluk", uniqueInfra: "Maydan",
    effects: { unitClassCombat: { cavalry: 2 } },
    cityNames: ["Cairo", "Damascus", "Aleppo", "Alexandria", "Gaza", "Tripoli", "Hama", "Jerusalem", "Homs", "Safed"],
  },
  {
    id: "almoravids", name: "Almoravids", leader: "Yusuf ibn Tashfin",
    abilityName: "Veiled Sultanate",
    abilityDesc: "Melee units +1 combat strength; +1 gold from each worked desert tile.",
    uniqueUnit: "Lamtuna Spearman", uniqueInfra: "Ribat",
    effects: { goldPerWorkedDesert: 1, unitClassCombat: { melee: 1 } },
    cityNames: ["Marrakesh", "Aghmat", "Sijilmasa", "Fez", "Tlemcen", "Ceuta", "Algeciras", "Seville", "Córdoba", "Audaghost"],
  },

  // ===========================================================================
  // EXPANSION — Sub-Saharan Africa
  // ===========================================================================
  {
    id: "swahili", name: "Swahili (Kilwa)", leader: "al-Hasan ibn Sulaiman",
    abilityName: "Monsoon Trade",
    abilityDesc: "Coastal cities gain +3 gold; +2 gold per trade route.",
    uniqueUnit: "Swahili Dhow", uniqueInfra: "Husuni Kubwa",
    effects: { coastalCityYield: { gold: 3 }, tradeRouteGoldBonus: 2 },
    cityNames: ["Kilwa", "Mombasa", "Zanzibar", "Malindi", "Lamu", "Sofala", "Mogadishu", "Pate", "Gedi", "Barawa"],
  },
  {
    id: "benin", name: "Benin", leader: "Oba Ewuare",
    abilityName: "Walls of Benin",
    abilityDesc: "+10% culture; new cities are founded with free Walls.",
    uniqueUnit: "Ogboni Guard", uniqueInfra: "Iya Earthworks",
    effects: { yieldPercent: { culture: 10 }, newCityFreeBuilding: "walls" },
    cityNames: ["Benin City", "Udo", "Ughoton", "Sabongida-Ora", "Ekiadolor", "Urhonigbe", "Usen", "Iyekorhionmwon", "Ogwa", "Uselu"],
  },
  {
    id: "kongo", name: "Kongo", leader: "Afonso I",
    abilityName: "Kingdom of Kongo",
    abilityDesc: "+10% culture, +10% faith.",
    uniqueUnit: "Kongo Archer", uniqueInfra: "Mbanza",
    effects: { yieldPercent: { faith: 10, culture: 10 } },
    cityNames: ["M'banza-Kongo", "Mbanza Soyo", "Mbata", "Mpangu", "Mbamba", "Nsundi", "Mpemba", "Wandu", "Vunda", "Kongo dia Nlaza"],
  },

  // ===========================================================================
  // EXPANSION — Mediterranean & Europe
  // ===========================================================================
  {
    id: "bulgaria", name: "Bulgaria", leader: "Krum",
    abilityName: "Khans of the Danube",
    abilityDesc: "Cavalry +1 combat strength; captured cities keep +1 population.",
    uniqueUnit: "Bulgar Horse Archer", uniqueInfra: "Preslav Court",
    effects: { unitClassCombat: { cavalry: 1 }, captureCityPopulationBonus: 1 },
    cityNames: ["Pliska", "Preslav", "Tarnovo", "Ohrid", "Sofia", "Vidin", "Silistra", "Plovdiv", "Varna", "Skopje"],
  },
  {
    id: "serbia", name: "Serbia", leader: "Stefan Dušan",
    abilityName: "Dušan's Code",
    abilityDesc: "+10% culture; +1 production from each mine.",
    uniqueUnit: "Pronoia Knight", uniqueInfra: "Despot's Hall",
    effects: { yieldPercent: { culture: 10 }, mineTileProductionBonus: 1 },
    cityNames: ["Ras", "Prizren", "Skopje", "Pristina", "Novo Brdo", "Belgrade", "Niš", "Smederevo", "Peć", "Kruševac"],
  },
  {
    id: "bohemia", name: "Bohemia", leader: "Charles IV",
    abilityName: "Crown of St. Wenceslas",
    abilityDesc: "+10% science; +1 production from each mine.",
    uniqueUnit: "Hussite War Wagon", uniqueInfra: "Kutná Hora Mint",
    effects: { mineTileProductionBonus: 1, yieldPercent: { science: 10 } },
    cityNames: ["Prague", "Kutná Hora", "Brno", "Olomouc", "Plzeň", "Kolín", "Tábor", "Hradec Králové", "Cheb", "Znojmo"],
  },
  {
    id: "swiss", name: "Swiss Confederacy", leader: "Werner Stauffacher",
    abilityName: "Reisläufer",
    abilityDesc: "Melee units +2 combat strength.",
    uniqueUnit: "Swiss Halberdier", uniqueInfra: "Rütli Meadow",
    effects: { unitClassCombat: { melee: 2 } },
    cityNames: ["Schwyz", "Uri", "Unterwalden", "Lucerne", "Zürich", "Bern", "Glarus", "Zug", "Basel", "Fribourg"],
  },
  {
    id: "aragon", name: "Crown of Aragon", leader: "James I",
    abilityName: "Mare Nostrum",
    abilityDesc: "Naval units +1 movement; coastal cities gain +2 gold.",
    uniqueUnit: "Almogàver", uniqueInfra: "Llotja",
    effects: { navalMovementBonus: 1, coastalCityYield: { gold: 2 } },
    cityNames: ["Zaragoza", "Barcelona", "Valencia", "Palma", "Tarragona", "Lleida", "Tortosa", "Girona", "Huesca", "Cagliari"],
  },
  {
    id: "scotland", name: "Scotland", leader: "Robert the Bruce",
    abilityName: "Schiltron",
    abilityDesc: "Melee units +1 combat strength; +1 faith from forests in your territory.",
    uniqueUnit: "Highland Schiltron", uniqueInfra: "Tower House",
    effects: { unitClassCombat: { melee: 1 }, forestTileFaithBonus: 1 },
    cityNames: ["Scone", "Stirling", "Edinburgh", "Dunfermline", "Perth", "Aberdeen", "Dunkeld", "Glasgow", "St Andrews", "Inverness"],
  },
  {
    id: "gaelic_ireland", name: "Gaelic Ireland", leader: "Brian Boru",
    abilityName: "High Kingship",
    abilityDesc: "+10% culture, +10% faith.",
    uniqueUnit: "Gallowglass", uniqueInfra: "Round Tower",
    effects: { yieldPercent: { faith: 10, culture: 10 } },
    cityNames: ["Tara", "Cashel", "Armagh", "Clonmacnoise", "Kells", "Dublin", "Cork", "Limerick", "Glendalough", "Kildare"],
  },
  {
    id: "normans", name: "Normans (Sicily)", leader: "Roger II",
    abilityName: "Hauteville Conquest",
    abilityDesc: "+10% science; cavalry +1 combat strength.",
    uniqueUnit: "Norman Knight", uniqueInfra: "Palatine Chapel",
    effects: { unitClassCombat: { cavalry: 1 }, yieldPercent: { science: 10 } },
    cityNames: ["Palermo", "Messina", "Salerno", "Bari", "Syracuse", "Catania", "Amalfi", "Aversa", "Melfi", "Reggio"],
  },
  {
    id: "visigoths", name: "Visigoths", leader: "Leovigild",
    abilityName: "Kingdom of Toledo",
    abilityDesc: "+10% culture; captured cities keep +1 population.",
    uniqueUnit: "Visigothic Noble", uniqueInfra: "Hall of Toledo",
    effects: { captureCityPopulationBonus: 1, yieldPercent: { culture: 10 } },
    cityNames: ["Toledo", "Toulouse", "Barcelona", "Mérida", "Seville", "Narbonne", "Córdoba", "Tarragona", "Recópolis", "Braga"],
  },
  {
    id: "novgorod", name: "Novgorod", leader: "Alexander Nevsky",
    abilityName: "Fur Republic",
    abilityDesc: "+10% gold; +1 gold from coastal water tiles.",
    uniqueUnit: "Ushkuinik", uniqueInfra: "Veche Bell",
    effects: { coastalTileGoldBonus: 1, yieldPercent: { gold: 10 } },
    cityNames: ["Novgorod", "Pskov", "Ladoga", "Beloozero", "Torzhok", "Staraya Russa", "Izborsk", "Vologda", "Vyatka", "Oreshek"],
  },

  // ===========================================================================
  // EXPANSION — European tribal peoples (Iron Age & Arctic)
  // ===========================================================================
  {
    id: "illyrians", name: "Illyrians", leader: "Teuta",
    abilityName: "Adriatic Pirates",
    abilityDesc: "Naval units +1 movement; +35% gold from coastal raids.",
    uniqueUnit: "Liburnian", uniqueInfra: "Gradina",
    effects: { coastalRaidGoldPercent: 35, navalMovementBonus: 1 },
    cityNames: ["Scodra", "Rhizon", "Lissus", "Epidamnus", "Apollonia", "Daorson", "Salona", "Narona", "Bylis", "Amantia"],
  },
  {
    id: "lusitani", name: "Lusitani", leader: "Viriathus",
    abilityName: "Concursare",
    abilityDesc: "+2 combat strength for units in forests.",
    uniqueUnit: "Falcata Warrior", uniqueInfra: "Castro",
    effects: { forestTileCombatBonus: 2 },
    cityNames: ["Viseu", "Conímbriga", "Salmantica", "Ebora", "Pax Julia", "Olisipo", "Bracara", "Mirobriga", "Caurium", "Norba"],
  },
  {
    id: "arevaci", name: "Arevaci", leader: "Caros",
    abilityName: "Spirit of Numantia",
    abilityDesc: "Melee units +1 combat strength; new cities are founded with free Walls.",
    uniqueUnit: "Celtiberian Warrior", uniqueInfra: "Murallas de Numancia",
    effects: { unitClassCombat: { melee: 1 }, newCityFreeBuilding: "walls" },
    cityNames: ["Numantia", "Segeda", "Termantia", "Uxama", "Tiermes", "Clunia", "Bilbilis", "Segontia", "Lutia", "Contrebia"],
  },
  {
    id: "thracians", name: "Thracians", leader: "Sitalces",
    abilityName: "Odrysian Host",
    abilityDesc: "Ranged units +2 combat strength.",
    uniqueUnit: "Thracian Peltast", uniqueInfra: "Thracian Tomb",
    effects: { unitClassCombat: { ranged: 2 } },
    cityNames: ["Seuthopolis", "Cabyle", "Uscudama", "Bizye", "Philippopolis", "Odessos", "Beroe", "Pistiros", "Helis", "Apros"],
  },
  {
    id: "dacians", name: "Dacians", leader: "Decebalus",
    abilityName: "Gold of the Carpathians",
    abilityDesc: "Melee units +1 combat strength; +1 production from each mine.",
    uniqueUnit: "Falxman", uniqueInfra: "Murus Dacicus",
    effects: { mineTileProductionBonus: 1, unitClassCombat: { melee: 1 } },
    cityNames: ["Sarmizegetusa", "Apulum", "Napoca", "Buridava", "Piroboridava", "Costești", "Blidaru", "Cumidava", "Genucla", "Argedava"],
  },
  {
    id: "sami", name: "Sámi", leader: "Noaidi Council",
    abilityName: "People of the Eight Seasons",
    abilityDesc: "+5% food, +10% faith.",
    uniqueUnit: "Ski Raider", uniqueInfra: "Siida Camp",
    effects: { yieldPercent: { faith: 10, food: 5 } },
    cityNames: ["Aanaar", "Guovdageaidnu", "Kárášjohka", "Johkamohkki", "Giron", "Ohcejohka", "Eanodat", "Soađegilli", "Deatnu", "Aarborte"],
  },

  // ===========================================================================
  // EXPANSION — Greek city-states
  // ===========================================================================
  {
    id: "corinth", name: "Corinth", leader: "Periander",
    abilityName: "Two Seas",
    abilityDesc: "Coastal cities gain +2 gold; +2 gold per trade route.",
    uniqueUnit: "Corinthian Trireme", uniqueInfra: "Diolkos",
    effects: { tradeRouteGoldBonus: 2, coastalCityYield: { gold: 2 } },
    cityNames: ["Corinth", "Syracuse", "Corcyra", "Ambracia", "Potidaea", "Apollonia", "Leucas", "Anactorium", "Sicyon", "Cenchreae"],
  },
  {
    id: "thebes", name: "Thebes", leader: "Epaminondas",
    abilityName: "Sacred Band",
    abilityDesc: "Melee units +2 combat strength.",
    uniqueUnit: "Sacred Band", uniqueInfra: "Cadmea",
    effects: { unitClassCombat: { melee: 2 } },
    cityNames: ["Thebes", "Plataea", "Thespiae", "Orchomenus", "Tanagra", "Coronea", "Haliartus", "Chaeronea", "Leuctra", "Aulis"],
  },
  {
    id: "eretria", name: "Eretria", leader: "Eretrian Assembly",
    abilityName: "Euboean Colonists",
    abilityDesc: "+10% culture; +1 gold per trade route; new cities start with +1 population.",
    uniqueUnit: "Penteconter", uniqueInfra: "Emporion",
    effects: { newCityExtraPopulation: 1, tradeRouteGoldBonus: 1, yieldPercent: { culture: 10 } },
    cityNames: ["Eretria", "Chalcis", "Pithekoussai", "Cumae", "Methone", "Mende", "Torone", "Dikaia", "Carystus", "Styra"],
  },
  {
    id: "crete", name: "Crete", leader: "Nearchus",
    abilityName: "Cretan Archers",
    abilityDesc: "Ranged units +2 combat strength.",
    uniqueUnit: "Cretan Archer", uniqueInfra: "Gortyn Code",
    effects: { unitClassCombat: { ranged: 2 } },
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
    abilityDesc: "+10% culture, +5% faith.",
    uniqueUnit: "Zhou Chariot", uniqueInfra: "Ancestral Temple",
    effects: { yieldPercent: { culture: 10, faith: 5 } },
    cityNames: ["Haojing", "Luoyang", "Fenghao", "Qufu", "Linzi", "Xinzheng", "Handan", "Yong", "Jiang", "Wan"],
  },
  {
    id: "delhi_sultanate", name: "Delhi Sultanate", leader: "Alauddin Khalji",
    abilityName: "Sultanate of Hind",
    abilityDesc: "+5% food, +10% gold.",
    uniqueUnit: "Delhi War Elephant", uniqueInfra: "Hauz",
    effects: { yieldPercent: { gold: 10, food: 5 } },
    cityNames: ["Delhi", "Lahore", "Multan", "Daulatabad", "Jaunpur", "Badaun", "Ajmer", "Lakhnauti", "Siri", "Tughlaqabad"],
  },
  {
    id: "mughals", name: "Mughal Empire", leader: "Akbar",
    abilityName: "Padishah",
    abilityDesc: "+10% culture, +10% gold.",
    uniqueUnit: "Mughal Sowar", uniqueInfra: "Red Fort",
    effects: { yieldPercent: { culture: 10, gold: 10 } },
    cityNames: ["Agra", "Delhi", "Fatehpur Sikri", "Lahore", "Kabul", "Allahabad", "Ajmer", "Burhanpur", "Dhaka", "Srinagar"],
  },
  {
    id: "vijayanagara", name: "Vijayanagara", leader: "Krishnadevaraya",
    abilityName: "City of Victory",
    abilityDesc: "+10% gold, +5% faith; +1 food from fresh-water tiles.",
    uniqueUnit: "Vijayanagara War Elephant", uniqueInfra: "Temple Tank",
    effects: { yieldPercent: { gold: 10, faith: 5 }, freshWaterTileFoodBonus: 1 },
    cityNames: ["Vijayanagara", "Hampi", "Penukonda", "Chandragiri", "Srirangapatna", "Udayagiri", "Gutti", "Kanchipuram", "Bhatkal", "Mangalore"],
  },
  {
    id: "champa", name: "Champa", leader: "Jaya Indravarman IV",
    abilityName: "Lords of the Sea",
    abilityDesc: "Naval units +1 movement; +35% gold from coastal raids.",
    uniqueUnit: "Cham Raider", uniqueInfra: "My Son Tower",
    effects: { coastalRaidGoldPercent: 35, navalMovementBonus: 1 },
    cityNames: ["Indrapura", "Vijaya", "Simhapura", "Kauthara", "Panduranga", "Amaravati", "Virapura", "Rajapura", "Bal Hangov", "Bal Sri Banoy"],
  },
  {
    id: "sinhala", name: "Sinhala", leader: "Parakramabahu I",
    abilityName: "Let No Drop Waste",
    abilityDesc: "+5% food; +1 food and +1 production from fresh-water tiles.",
    uniqueUnit: "Sinhala War Elephant", uniqueInfra: "Wewa",
    effects: { yieldPercent: { food: 5 }, freshWaterTileFoodBonus: 1, freshWaterTileProductionBonus: 1 },
    cityNames: ["Anuradhapura", "Polonnaruwa", "Sigiriya", "Kandy", "Dambadeniya", "Yapahuwa", "Kurunegala", "Mahagama", "Tissamaharama", "Kelaniya"],
  },
  {
    id: "khitan", name: "Khitan (Liao)", leader: "Abaoji",
    abilityName: "Dual Administration",
    abilityDesc: "Cavalry +1 movement and +1 combat strength.",
    uniqueUnit: "Ordo Cavalry", uniqueInfra: "Ordo Camp",
    effects: { cavalryMovementBonus: 1, unitClassCombat: { cavalry: 1 } },
    cityNames: ["Shangjing", "Zhongjing", "Dongjing", "Nanjing", "Xijing", "Linhuang", "Liaoyang", "Datong", "Yunzhou", "Zhuozhou"],
  },
  {
    id: "jurchen", name: "Jurchen (Jin)", leader: "Aguda",
    abilityName: "Meng'an-Mouke",
    abilityDesc: "Cavalry +1 combat strength; melee units +2 strength when attacking cities.",
    uniqueUnit: "Iron Pagoda", uniqueInfra: "Meng'an Garrison",
    effects: { unitClassCombat: { cavalry: 1 }, meleeVsCityBonus: 2 },
    cityNames: ["Huining", "Zhongdu", "Bianjing", "Liaoyang", "Datong", "Yanjing", "Huanglongfu", "Hancheng", "Linhuang", "Dading"],
  },

  // ===========================================================================
  // EXPANSION — Steppe & Turkic
  // ===========================================================================
  {
    id: "khazars", name: "Khazars", leader: "Bulan",
    abilityName: "Toll of the Steppe",
    abilityDesc: "+5% faith; +2 gold per trade route.",
    uniqueUnit: "Khazar Lancer", uniqueInfra: "Sarkel Fortress",
    effects: { tradeRouteGoldBonus: 2, yieldPercent: { faith: 5 } },
    cityNames: ["Atil", "Sarkel", "Balanjar", "Samandar", "Kerch", "Tmutarakan", "Sudak", "Phanagoria", "Khazaran", "Semender"],
  },
  {
    id: "avars", name: "Avars", leader: "Bayan I",
    abilityName: "Ring of the Avars",
    abilityDesc: "Cavalry +1 combat strength; +25% gold from raiding.",
    uniqueUnit: "Avar Lancer", uniqueInfra: "Hring",
    effects: { unitClassCombat: { cavalry: 1 }, raidGoldPercent: 25 },
    cityNames: ["Hring", "Sirmium", "Singidunum", "Aquincum", "Savaria", "Carnuntum", "Mursa", "Bassiana", "Brigetio", "Cibalae"],
  },
  {
    id: "golden_horde", name: "Golden Horde", leader: "Batu Khan",
    abilityName: "Tatar Yoke",
    abilityDesc: "Cavalry +1 movement; +25% gold from raiding.",
    uniqueUnit: "Tatar Horse Archer", uniqueInfra: "Yam Relay",
    effects: { raidGoldPercent: 25, cavalryMovementBonus: 1 },
    cityNames: ["Sarai", "Sarai Berke", "Bolghar", "Astrakhan", "Azov", "Kazan", "Solhat", "Ukek", "Majar", "Tyumen"],
  },

  // ===========================================================================
  // EXPANSION — The Americas
  // ===========================================================================
  {
    id: "chimu", name: "Chimú", leader: "Minchançaman",
    abilityName: "Kingdom of Chimor",
    abilityDesc: "+10% gold; desert cities gain +1 food.",
    uniqueUnit: "Chimú Slinger", uniqueInfra: "Chan Chan Citadel",
    effects: { desertCityYield: { food: 1 }, yieldPercent: { gold: 10 } },
    cityNames: ["Chan Chan", "Pacatnamú", "Farfán", "Manchan", "Túcume", "Apurlec", "Pampa Grande", "Galindo", "Purgatorio", "Batán Grande"],
  },
  {
    id: "moche", name: "Moche", leader: "Lord of Sipán",
    abilityName: "Huaca Builders",
    abilityDesc: "+15% faith (the great huacas).",
    uniqueUnit: "Moche Warrior", uniqueInfra: "Huaca",
    effects: { yieldPercent: { faith: 15 } },
    cityNames: ["Moche", "Sipán", "Pampa Grande", "Galindo", "Dos Cabezas", "San José de Moro", "El Brujo", "Pañamarca", "Huancaco", "Cerro Blanco"],
  },
  {
    id: "tiwanaku", name: "Tiwanaku", leader: "Priest-Rulers",
    abilityName: "Raised Fields",
    abilityDesc: "+5% faith; +1 food from fresh-water tiles.",
    uniqueUnit: "Tiwanaku Spearman", uniqueInfra: "Akapana Pyramid",
    effects: { freshWaterTileFoodBonus: 1, yieldPercent: { faith: 5 } },
    cityNames: ["Tiwanaku", "Lukurmata", "Pajchiri", "Khonkho Wankane", "Lakaya", "Ojje", "Pariti", "Wankani", "Kala Uyuni", "Iwawi"],
  },
  {
    id: "tarascans", name: "Tarascans", leader: "Tariácuri",
    abilityName: "Metalsmiths of Michoacán",
    abilityDesc: "Melee units +1 strength and train 10% faster (master metalsmiths).",
    uniqueUnit: "Copper Macehead", uniqueInfra: "Yácata",
    effects: { unitClassCombat: { melee: 1 }, trainTimePercent: -10 },
    cityNames: ["Tzintzuntzan", "Pátzcuaro", "Ihuatzio", "Zacapu", "Erongarícuaro", "Uruapan", "Tariácuri", "Taximaroa", "Coyuca", "Charo"],
  },
  {
    id: "taino", name: "Taíno", leader: "Anacaona",
    abilityName: "Caciquedom",
    abilityDesc: "+10% culture; island cities gain +2 food.",
    uniqueUnit: "Guaribo Slinger", uniqueInfra: "Batey",
    effects: { islandCityYield: { food: 2 }, yieldPercent: { culture: 10 } },
    cityNames: ["Xaragua", "Maguana", "Marién", "Higüey", "Magua", "Caonao", "Borinquen", "Cayacoa", "Guacayarima", "Bainoa"],
  },

  // ===========================================================================
  // EXPANSION — Oceania
  // ===========================================================================
  {
    id: "tonga", name: "Tonga", leader: "Tuʻi Tonga",
    abilityName: "Maritime Tribute",
    abilityDesc: "Naval units +1 movement; island cities gain +2 gold.",
    uniqueUnit: "Tongan Toa", uniqueInfra: "Langi",
    effects: { islandCityYield: { gold: 2 }, navalMovementBonus: 1 },
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
//     and add worked-tile yields. They are single-tier.
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

  // ---- flagship buildings with rich empire-wide effects -------------------
  babylon: { reqTech: "masonry", yields: { science: 1 }, effects: { yieldPercent: { science: 5 } }, desc: "Unique building — +1 science here and +5% science empire-wide." },
  han_china: { reqTech: "masonry", yields: { culture: 1 }, effects: { yieldPercent: { production: 5 } }, desc: "Unique building — +1 culture here and +5% production empire-wide." },
  carthage: { reqTech: "sailcloth", yields: { gold: 2 }, effects: { navalMovementBonus: 1 }, desc: "Unique building — +2 gold and naval units +1 movement empire-wide." },
  phoenicia: { reqTech: "sailcloth", yields: { gold: 2 }, effects: { navalMovementBonus: 1 }, desc: "Unique building — +2 gold and naval units +1 movement empire-wide." },
  portugal: { reqTech: "astronomy", yields: { gold: 3 }, effects: { tradeRouteGoldBonus: 2 }, desc: "Unique building — +3 gold and +2 gold per trade route empire-wide." },
  sparta: { reqTech: "bronze_alloying", yields: { production: 2 }, desc: "Unique building — +2 production." },
  rome: { reqTech: "engineering", yields: { culture: 1, food: 1 }, effects: { yieldPercent: { culture: 10 } }, desc: "Unique building — +1 culture, +1 food, and +10% culture empire-wide." },
  greece: { reqTech: "masonry", yields: { culture: 2, science: 1 }, desc: "Unique building — +2 culture and +1 science." },
  norse: { reqTech: "sailcloth", yields: { faith: 2, culture: 1 }, desc: "Unique building — +2 faith and +1 culture." },
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
  return s + ".";
}

export const UNIQUE_INFRA: UniqueInfraDef[] = CIVILIZATIONS.map((civ) => {
  const o = INFRA_OVERRIDES[civ.id] ?? {};
  const kind: UniqueInfraKind = o.kind ?? "building";
  const name = civ.uniqueInfra;
  const def: UniqueInfraDef = {
    id: infraSlug(civ.id, name),
    civId: civ.id,
    name,
    kind,
    reqTech: o.reqTech ?? (kind === "improvement" ? "irrigation" : "masonry"),
    cost: o.cost ?? 30,
    yields: o.yields ?? (kind === "building" ? themeBuildingYields(civ) : { food: 1 }),
    effects: o.effects,
    terrain: o.terrain ?? (kind === "improvement" ? ["grassland", "plains"] : undefined),
    discipline: o.discipline ?? (kind === "improvement" ? "carpentry" : undefined),
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

export const CIVICS: CivicDef[] = [
  { id: "code_of_laws", name: "Code of Laws", cost: 0, prereqs: [], unlocksGovernment: "chiefdom", unlocksPolicy: "discipline" },
  { id: "craftsmanship", name: "Craftsmanship", cost: 25, prereqs: ["code_of_laws"], unlocksPolicy: "urban_planning" },
  { id: "military_tradition", name: "Military Tradition", cost: 30, prereqs: ["code_of_laws"], unlocksPolicy: "maneuver" },
  { id: "mysticism", name: "Mysticism", cost: 25, prereqs: ["code_of_laws"], unlocksPolicy: "god_king" },
  { id: "early_empire", name: "Early Empire", cost: 45, prereqs: ["craftsmanship"], unlocksGovernment: "despotism" },
  { id: "drama_poetry", name: "Drama & Poetry", cost: 50, prereqs: ["mysticism"], unlocksPolicy: "literary_tradition" },
  { id: "recorded_history", name: "Recorded History", cost: 55, prereqs: ["early_empire"], unlocksPolicy: "natural_philosophy" },
  { id: "trade_routes", name: "Trade", cost: 50, prereqs: ["early_empire"], unlocksPolicy: "caravans" },
  { id: "political_philosophy", name: "Political Philosophy", cost: 80, prereqs: ["recorded_history"], unlocksGovernment: "classical_republic" },
  { id: "military_training", name: "Military Training", cost: 70, prereqs: ["military_tradition", "early_empire"], unlocksGovernment: "oligarchy" },
  { id: "statecraft", name: "Statecraft", cost: 75, prereqs: ["political_philosophy"], unlocksGovernment: "monarchy" },
];

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
  effects: CivEffects;
}

export const BELIEFS: BeliefDef[] = [
  { id: "tithe", name: "Tithe", desc: "+15% gold.", effects: { yieldPercent: { gold: 15 } } },
  { id: "scholarship", name: "Scholarship", desc: "+15% science.", effects: { yieldPercent: { science: 15 } } },
  { id: "divine_inspiration", name: "Divine Inspiration", desc: "+10% production.", effects: { yieldPercent: { production: 10 } } },
  { id: "fertility_rites", name: "Fertility Rites", desc: "+15% food.", effects: { yieldPercent: { food: 15 } } },
  { id: "warrior_code", name: "Warrior Code", desc: "Melee units +2 combat.", effects: { unitClassCombat: { melee: 2 } } },
  { id: "holy_warriors", name: "Holy Warriors", desc: "Cavalry units +2 combat.", effects: { unitClassCombat: { cavalry: 2 } } },
  { id: "sacred_paths", name: "Sacred Paths", desc: "Cavalry +1 movement.", effects: { cavalryMovementBonus: 1 } },
  { id: "labor_of_devotion", name: "Labor of Devotion", desc: "Faith can rush production (units, buildings, and tile works).", effects: { rushWithFaith: true } },
];

export const RELIGION_NAMES: string[] = [
  "Sun Cult", "Sky Father", "Ancestor Veneration", "The Great Spirit", "Old Gods",
  "Path of Light", "Earth Mother", "Storm Lords", "The Eternal Flame", "Moon Worship",
];

const BELIEF_BY_ID = new Map(BELIEFS.map((b) => [b.id, b]));
export const getBelief = (id: string | undefined) => (id ? BELIEF_BY_ID.get(id) : undefined);

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
}

export interface WonderDef {
  id: string;
  name: string;
  desc: string;
  /** Labour required, by specialist discipline, to raise the wonder. */
  requirement: Record<string, number>;
  effect: WonderEffect;
}

export const WONDER_DEFS: WonderDef[] = [
  {
    id: "great_pyramid",
    name: "Great Pyramid",
    desc: "A monumental tomb whose construction organises a whole society. +1 production in every city.",
    requirement: { masonry: 11, architecture: 6 },
    effect: { yieldPerCity: { production: 1 } },
  },
  {
    id: "hanging_gardens",
    name: "Hanging Gardens",
    desc: "Terraced gardens fed by ingenious irrigation. +1 food in every city.",
    requirement: { carpentry: 6, architecture: 6, engineering: 4 },
    effect: { yieldPerCity: { food: 1 } },
  },
  {
    id: "great_library",
    name: "Great Library",
    desc: "A vast repository of the world's knowledge. +3 science in the host city, and a free technology on completion.",
    requirement: { architecture: 7, engineering: 5 },
    effect: { yieldHostCity: { science: 3 }, freeTech: true },
  },
  {
    id: "colossus",
    name: "Colossus",
    desc: "A towering bronze statue guarding a great harbour. +3 gold in the host city.",
    requirement: { masonry: 6, engineering: 6 },
    effect: { yieldHostCity: { gold: 3 } },
  },
  {
    id: "great_lighthouse",
    name: "Great Lighthouse",
    desc: "A beacon that draws trade from across the sea. +1 gold in every city.",
    requirement: { masonry: 5, architecture: 5, engineering: 5 },
    effect: { yieldPerCity: { gold: 1 } },
  },
  {
    id: "sphinx",
    name: "Great Sphinx",
    desc: "An enigmatic guardian carved from living rock. +2 culture and +2 gold in the host city.",
    requirement: { masonry: 9, architecture: 5 },
    effect: { yieldHostCity: { culture: 2, gold: 2 } },
  },
  {
    id: "stonehenge",
    name: "Stonehenge",
    desc: "An ancient ring of standing stones aligned to the heavens. +1 faith in every city.",
    requirement: { masonry: 9, survey: 4 },
    effect: { yieldPerCity: { faith: 1 } },
  },
  {
    id: "oracle",
    name: "The Oracle",
    desc: "A sacred temple whose prophecies guide the people. +3 faith and +2 science in the host city.",
    requirement: { architecture: 6, masonry: 5 },
    effect: { yieldHostCity: { faith: 3, science: 2 } },
  },
  {
    id: "tenochtitlan",
    name: "Tenochtitlán",
    desc: "A magnificent island capital of canals and causeways. +1 food and +1 production in every city.",
    requirement: { engineering: 7, architecture: 6, masonry: 5 },
    effect: { yieldPerCity: { food: 1, production: 1 } },
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

export interface GreatPersonDef {
  id: string;
  name: string;
  cls: GreatPersonClass;
  era: GreatPersonEra;
  effect: GreatPersonEffect;
  /** Signature-effect flavour, shown in the UI. */
  desc: string;
}

const GP = (
  id: string,
  name: string,
  cls: GreatPersonClass,
  era: GreatPersonEra,
  effect: GreatPersonEffect,
  desc: string,
): GreatPersonDef => ({ id, name, cls, era, effect, desc });

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
  GP("sun_tzu", "Sun Tzu", "general", "Classical", "drill", "Master strategist: drills your land army, granting each a free promotion."),
  GP("hannibal_barca", "Hannibal Barca", "general", "Classical", "drill", "Crosses the impossible: rallies your land army with a free promotion."),
  GP("scipio_africanus", "Scipio Africanus", "general", "Classical", "drill", "Conqueror of Carthage: hardens your legions with a free promotion."),
  GP("julius_caesar", "Julius Caesar", "general", "Classical", "drill", "Veteran commander: your land army earns a free promotion."),
  GP("belisarius", "Belisarius", "general", "Medieval", "drill", "Wins outnumbered: steels your land army with a free promotion."),
  GP("khalid", "Khalid ibn al-Walid", "general", "Medieval", "drill", "The Drawn Sword of God: your land army earns a free promotion."),
  GP("subutai", "Subutai", "general", "Medieval", "drill", "Peerless horde-marshal: your land army earns a free promotion."),
  GP("joan_of_arc", "Joan of Arc", "general", "Medieval", "drill", "Inspires the host: your land army earns a free promotion."),
  GP("gonzalo", "Gonzalo de Córdoba", "general", "Exploration", "drill", "Father of the tercio: your land army earns a free promotion."),

  // ---- Great Admirals (naval) --------------------------------------------
  GP("themistocles", "Themistocles", "admiral", "Classical", "flagship", "Victor of Salamis: heals your fleet and army and lifts morale."),
  GP("gaius_duilius", "Gaius Duilius", "admiral", "Classical", "flagship", "First Roman sea-triumph: heals your fleet and army and lifts morale."),
  GP("artemisia", "Artemisia", "admiral", "Classical", "flagship", "Cunning at sea: heals your fleet and army and lifts morale."),
  GP("leif_erikson", "Leif Erikson", "admiral", "Medieval", "flagship", "Bold ocean voyager: heals your fleet and army and lifts morale."),
  GP("zheng_he", "Zheng He", "admiral", "Exploration", "flagship", "Treasure-fleet admiral: heals your fleet and army and lifts morale."),
  GP("yi_sun_sin", "Yi Sun-sin", "admiral", "Exploration", "flagship", "Undefeated at sea: heals your fleet and army and lifts morale."),

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
  GP("zarathustra", "Zarathustra", "prophet", "Bronze", "revelation", "Prophet of the sacred fire: a burst of faith toward a religion."),
  GP("confucius", "Confucius", "prophet", "Classical", "revelation", "The Great Sage: a burst of faith toward a religion."),
  GP("laozi", "Laozi", "prophet", "Classical", "revelation", "Sage of the Way: a burst of faith toward a religion."),
  GP("siddhartha", "Siddhartha Gautama", "prophet", "Classical", "revelation", "The Awakened One: a burst of faith toward a religion."),
  GP("augustine", "Augustine of Hippo", "prophet", "Medieval", "revelation", "Great theologian: a burst of faith toward a religion."),
  GP("aquinas", "Thomas Aquinas", "prophet", "Medieval", "revelation", "The Angelic Doctor: a great burst of faith toward a religion."),
  GP("rumi", "Rumi", "prophet", "Medieval", "revelation", "Mystic poet: a burst of faith toward a religion."),

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
// existing base unit (`baseType`); the per-legend signature *active* ability from
// the doc is recorded as `ability`/`abilityDesc` flavour (the base unit's own
// active abilities still apply) — bespoke hero powers are a future extension.

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
  /** Signature active-ability flavour id (see UNIT-ABILITIES.md §9). */
  ability: string;
  abilityDesc: string;
  auraDesc: string;
}

const L = (d: LegendDef): LegendDef => d;

export const LEGENDS: LegendDef[] = [
  // ---- Bronze ------------------------------------------------------------
  L({ id: "gilgamesh", name: "Gilgamesh", era: "Bronze", type: "land", recruitVia: "Quest", baseType: "axeman", combatBonus: 9, auraBonus: 3, lifespan: 30, rechargeable: false, ability: "inspire", abilityDesc: "Inspires adjacent units; bonus vs barbarians and beasts.", auraDesc: "Adjacent allies fight harder." }),
  L({ id: "hammurabi", name: "Hammurabi", era: "Bronze", type: "support", recruitVia: "Wonder", baseType: "warrior", combatBonus: 2, auraBonus: 3, lifespan: 30, rechargeable: false, ability: "lawgiver", abilityDesc: "Grants insight while present; reduces unrest.", auraDesc: "Adjacent allies stand firm under the law." }),
  L({ id: "ramesses_ii", name: "Ramesses II", era: "Bronze", type: "support", recruitVia: "Faith", baseType: "war_chariot", combatBonus: 4, auraBonus: 3, lifespan: 30, rechargeable: false, ability: "monument_builder", abilityDesc: "Massive wonder/district production aura.", auraDesc: "Adjacent allies are emboldened." }),
  // ---- Classical ---------------------------------------------------------
  L({ id: "cyrus", name: "Cyrus the Great", era: "Classical", type: "land", recruitVia: "Conquest", baseType: "cataphract", combatBonus: 9, auraBonus: 3, lifespan: 30, rechargeable: false, ability: "lightning_conquest", abilityDesc: "Fast conquest; captured cities keep loyalty.", auraDesc: "Adjacent allies move with the king." }),
  L({ id: "leonidas", name: "Leonidas", era: "Classical", type: "land", recruitVia: "Culture", baseType: "hoplite", combatBonus: 8, auraBonus: 4, lifespan: 30, rechargeable: false, ability: "last_stand", abilityDesc: "Last stand: huge defensive bonus when outnumbered.", auraDesc: "Adjacent allies hold the line." }),
  L({ id: "alexander", name: "Alexander", era: "Classical", type: "land", recruitVia: "Conquest", baseType: "cataphract", combatBonus: 10, auraBonus: 4, lifespan: 30, rechargeable: false, ability: "undaunted", abilityDesc: "No war-weariness; capturing cities heals the army.", auraDesc: "Adjacent allies are undaunted." }),
  L({ id: "hannibal", name: "Hannibal", era: "Classical", type: "land", recruitVia: "Quest", baseType: "war_elephant", combatBonus: 9, auraBonus: 4, lifespan: 30, rechargeable: false, ability: "grand_ambush", abilityDesc: "Crossing/ambush mastery; flanking aura.", auraDesc: "Adjacent allies flank the enemy." }),
  L({ id: "sun_tzu_legend", name: "Sun Tzu", era: "Classical", type: "support", recruitVia: "Culture", baseType: "swordsman", combatBonus: 3, auraBonus: 4, lifespan: 30, rechargeable: false, ability: "art_of_war", abilityDesc: "Army-wide XP & free promotions; reveals enemy plans.", auraDesc: "Adjacent allies fight with discipline." }),
  L({ id: "qin_shi_huang", name: "Qin Shi Huang", era: "Classical", type: "support", recruitVia: "Wonder", baseType: "swordsman", combatBonus: 3, auraBonus: 3, lifespan: 30, rechargeable: false, ability: "great_wall", abilityDesc: "Builders/army surge; speeds a wonder.", auraDesc: "Adjacent allies labour and fight tirelessly." }),
  L({ id: "ashoka", name: "Ashoka", era: "Classical", type: "support", recruitVia: "Faith", baseType: "war_elephant", combatBonus: 4, auraBonus: 3, lifespan: 30, rechargeable: false, ability: "dhamma", abilityDesc: "Converts war into faith; amenities aura.", auraDesc: "Adjacent allies are heartened." }),
  L({ id: "boudica", name: "Boudica", era: "Classical", type: "land", recruitVia: "Quest", baseType: "war_chariot", combatBonus: 8, auraBonus: 4, lifespan: 30, rechargeable: false, ability: "rally", abilityDesc: "Converts nearby barbarians; rally vs occupiers.", auraDesc: "Adjacent allies are roused to fury." }),
  L({ id: "julius_caesar_legend", name: "Julius Caesar", era: "Classical", type: "land", recruitVia: "Conquest", baseType: "legionary", combatBonus: 9, auraBonus: 4, lifespan: 30, rechargeable: false, ability: "veteran_legions", abilityDesc: "Gold/culture from victories; veteran legions.", auraDesc: "Adjacent legions fight as veterans." }),
  L({ id: "cleopatra", name: "Cleopatra", era: "Classical", type: "support", recruitVia: "Faith", baseType: "warrior", combatBonus: 2, auraBonus: 3, lifespan: 30, rechargeable: false, ability: "allure", abilityDesc: "Trade/diplomacy & gold aura; allure.", auraDesc: "Adjacent allies are inspired by her presence." }),
  // ---- Medieval ----------------------------------------------------------
  L({ id: "attila", name: "Attila", era: "Medieval", type: "land", recruitVia: "Conquest", baseType: "horse_archer", combatBonus: 9, auraBonus: 4, lifespan: 30, rechargeable: false, ability: "terror", abilityDesc: "Siege from movement; raze for production.", auraDesc: "Adjacent allies spread terror." }),
  L({ id: "belisarius", name: "Belisarius", era: "Medieval", type: "land", recruitVia: "Conquest", baseType: "cataphract", combatBonus: 9, auraBonus: 4, lifespan: 30, rechargeable: false, ability: "outnumbered", abilityDesc: "Outnumbered army fights at full strength.", auraDesc: "Adjacent allies never waver when outnumbered." }),
  L({ id: "charlemagne", name: "Charlemagne", era: "Medieval", type: "support", recruitVia: "Faith", baseType: "longswordsman", combatBonus: 5, auraBonus: 4, lifespan: 30, rechargeable: false, ability: "crown", abilityDesc: "Faith + military synergy; crowns/loyalty.", auraDesc: "Adjacent allies are heartened by the crown." }),
  L({ id: "harald_hardrada", name: "Harald Hardrada", era: "Medieval", type: "naval", recruitVia: "Conquest", baseType: "longship", combatBonus: 9, auraBonus: 4, lifespan: 30, rechargeable: false, ability: "coastal_raid", abilityDesc: "Coastal raiding gold; ocean voyaging early.", auraDesc: "Adjacent ships raid mercilessly." }),
  L({ id: "el_cid", name: "El Cid", era: "Medieval", type: "land", recruitVia: "Quest", baseType: "cataphract", combatBonus: 9, auraBonus: 4, lifespan: 30, rechargeable: false, ability: "frontier", abilityDesc: "Combat vs other religions; frontier loyalty.", auraDesc: "Adjacent allies are steadfast on the frontier." }),
  L({ id: "saladin", name: "Saladin", era: "Medieval", type: "land", recruitVia: "Faith", baseType: "cataphract", combatBonus: 9, auraBonus: 4, lifespan: 30, rechargeable: false, ability: "holy_ground", abilityDesc: "Heal on holy ground; bonus vs other faiths.", auraDesc: "Adjacent allies fight for the faith." }),
  L({ id: "genghis_khan", name: "Genghis Khan", era: "Medieval", type: "land", recruitVia: "Conquest", baseType: "horse_archer", combatBonus: 10, auraBonus: 5, lifespan: 30, rechargeable: false, ability: "terror", abilityDesc: "Supercharges cavalry (move/sight/combat); terror.", auraDesc: "Adjacent horsemen become unstoppable." }),
  L({ id: "subutai", name: "Subutai", era: "Medieval", type: "land", recruitVia: "Conquest", baseType: "horse_archer", combatBonus: 9, auraBonus: 4, lifespan: 30, rechargeable: false, ability: "hit_and_run", abilityDesc: "Mounted-ranged hit-and-run mastery; flanking aura.", auraDesc: "Adjacent horse archers strike and fade." }),
  L({ id: "joan_of_arc_legend", name: "Joan of Arc", era: "Medieval", type: "land", recruitVia: "Faith", baseType: "longswordsman", combatBonus: 8, auraBonus: 5, lifespan: 30, rechargeable: true, ability: "martyr", abilityDesc: "Rally: heal + combat surge; martyr resurrection once.", auraDesc: "Adjacent allies are filled with holy fervour." }),
  L({ id: "tomoe_gozen", name: "Tomoe Gozen", era: "Medieval", type: "land", recruitVia: "Quest", baseType: "horse_archer", combatBonus: 9, auraBonus: 4, lifespan: 30, rechargeable: false, ability: "duelist", abilityDesc: "Massive single-combat strength; mounted archery.", auraDesc: "Adjacent allies are emboldened by her duels." }),
  L({ id: "mansa_musa", name: "Mansa Musa", era: "Medieval", type: "support", recruitVia: "Faith", baseType: "warrior", combatBonus: 2, auraBonus: 3, lifespan: 30, rechargeable: false, ability: "golden_flood", abilityDesc: "Flood of gold; trade-route value aura.", auraDesc: "Adjacent allies march on golden coin." }),
  // ---- Exploration -------------------------------------------------------
  L({ id: "tamerlane", name: "Tamerlane", era: "Exploration", type: "land", recruitVia: "Conquest", baseType: "cataphract", combatBonus: 10, auraBonus: 4, lifespan: 30, rechargeable: false, ability: "devastation", abilityDesc: "Siege devastation; plunder enriches the empire.", auraDesc: "Adjacent allies devastate all before them." }),
  L({ id: "mehmed_ii", name: "Mehmed II", era: "Exploration", type: "support", recruitVia: "Wonder", baseType: "catapult", combatBonus: 6, auraBonus: 4, lifespan: 30, rechargeable: false, ability: "great_bombard", abilityDesc: "Great Bombard siege; walls fall faster.", auraDesc: "Adjacent siege engines batter the walls." }),
  L({ id: "pachacuti", name: "Pachacuti", era: "Exploration", type: "support", recruitVia: "Culture", baseType: "swordsman", combatBonus: 3, auraBonus: 3, lifespan: 30, rechargeable: false, ability: "mountain_logistics", abilityDesc: "Mountain logistics & terrace food aura; rapid expansion.", auraDesc: "Adjacent allies cross the mountains with ease." }),
  L({ id: "zheng_he_legend", name: "Zheng He", era: "Exploration", type: "naval", recruitVia: "Wonder", baseType: "trireme", combatBonus: 8, auraBonus: 4, lifespan: 30, rechargeable: false, ability: "treasure_fleet", abilityDesc: "Treasure fleet: trade/diplomacy & exploration aura.", auraDesc: "Adjacent ships sail with the treasure fleet." }),
  L({ id: "yi_sun_sin_legend", name: "Yi Sun-sin", era: "Exploration", type: "naval", recruitVia: "Quest", baseType: "trireme", combatBonus: 10, auraBonus: 4, lifespan: 30, rechargeable: false, ability: "turtle_ship", abilityDesc: "Armored ships; crushing naval defense.", auraDesc: "Adjacent ships are shielded like the turtle ship." }),
];

const LEGEND_BY_ID = new Map(LEGENDS.map((l) => [l.id, l]));
export const getLegend = (id: string | undefined): LegendDef | undefined =>
  id ? LEGEND_BY_ID.get(id) : undefined;
export const LEGEND_IDS: string[] = LEGENDS.map((l) => l.id);
