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
  /** Percentage bonus to production toward Wonders. */
  wonderProductionBonus?: number;
  /** Percentage bonus to production toward defensive buildings/walls. */
  defensiveBuildingProductionBonus?: number;
  /** Percentage bonus to production toward Holy Sites and Temples. */
  holySiteTempleProductionBonus?: number;
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
}

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
    abilityDesc: "Early war-carts and extra rewards from clearing barbarian camps.",
    uniqueUnit: "War-Cart",
    uniqueInfra: "Ziggurat",
    effects: { yieldPercent: { production: 10 } },
    cityNames: ["Ur", "Uruk", "Eridu", "Lagash", "Nippur", "Kish", "Umma", "Larsa", "Shuruppak", "Girsu"],
  },
  {
    id: "akkad",
    name: "Akkad",
    leader: "Sargon",
    abilityName: "Sons of Sargon",
    abilityDesc: "Captured cities keep more buildings; siege bonus near the capital.",
    uniqueUnit: "Sargonic Guard",
    uniqueInfra: "Palace Archive",
    effects: { yieldPercent: { production: 10 }, unitClassCombat: { melee: 1 } },
    cityNames: ["Akkad", "Nineveh", "Assur", "Eshnunna", "Sippar", "Babylon", "Nuzi", "Tell Brak", "Gasur", "Dur-Kurigalzu"],
  },
  {
    id: "babylon",
    name: "Babylon",
    leader: "Hammurabi",
    abilityName: "Enuma Anu Enlil",
    abilityDesc: "Eurekas trigger faster; science output is traded for eureka progress.",
    uniqueUnit: "Bowman",
    uniqueInfra: "Walls of Babylon",
    effects: { yieldPercent: { science: 10 } },
    cityNames: ["Babylon", "Borsippa", "Sippar", "Kish", "Nippur", "Uruk", "Ur", "Larsa", "Isin", "Dilbat"],
  },
  {
    id: "assyria",
    name: "Assyria",
    leader: "Ashurbanipal",
    abilityName: "Treatises & Terror",
    abilityDesc: "Siege units are stronger; captured cities grant science.",
    uniqueUnit: "Siege Tower",
    uniqueInfra: "Royal Library",
    effects: { unitClassCombat: { melee: 1, siege: 2 } },
    cityNames: ["Assur", "Nineveh", "Nimrud", "Dur-Sharrukin", "Harran", "Kalhu", "Edessa", "Arbela", "Nisibis", "Carchemish"],
  },
  {
    id: "hittites",
    name: "Hittites",
    leader: "Suppiluliuma",
    abilityName: "Iron of Hatti",
    abilityDesc: "Early iron access and faster ironworking production.",
    uniqueUnit: "Hittite Chariot",
    uniqueInfra: "Storm Temple",
    effects: { yieldPercent: { production: 10 }, unitClassCombat: { melee: 1 } },
    cityNames: ["Hattusa", "Kanesh", "Tarhuntassa", "Carchemish", "Alaca Höyük", "Sapinuwa", "Samuha", "Kadesh", "Ugarit", "Malatya"],
  },
  {
    id: "elam",
    name: "Elam",
    leader: "Untash",
    abilityName: "Highland Archers",
    abilityDesc: "Ranged units gain extra strength in hill terrain.",
    uniqueUnit: "Susian Archer",
    uniqueInfra: "Chogha Zanbil",
    effects: { unitClassCombat: { ranged: 2 } },
    cityNames: ["Susa", "Anshan", "Chogha Zanbil", "Hidalu", "Dur-Untash", "Madaktu", "Haft Tepe", "Kabnak", "Shimashki", "Awan"],
  },
  {
    id: "phoenicia",
    name: "Phoenicia",
    leader: "Dido",
    abilityName: "Mediterranean Colonies",
    abilityDesc: "Cheap coastal settlers, extended naval range, and extra trade gold.",
    uniqueUnit: "Bireme",
    uniqueInfra: "Cothon",
    effects: { yieldPercent: { gold: 15 } },
    cityNames: ["Tyre", "Sidon", "Byblos", "Carthage", "Utica", "Gades", "Leptis Magna", "Hadrumetum", "Motya", "Kition"],
  },
  {
    id: "lydia",
    name: "Lydia",
    leader: "Croesus",
    abilityName: "Coinage",
    abilityDesc: "Markets and banks generate extra gold; trade routes are more profitable.",
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
    abilityDesc: "Mounted units gain extra movement on open terrain.",
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
    abilityDesc: "+20% gold; melee units +2 combat strength.",
    uniqueUnit: "Immortal",
    uniqueInfra: "Pairidaeza",
    effects: { yieldPercent: { gold: 20 }, unitClassCombat: { melee: 2 } },
    cityNames: ["Persepolis", "Pasargadae", "Susa", "Ecbatana", "Sardis", "Babylon", "Tyre", "Memphis", "Nineveh", "Bactra"],
  },
  {
    id: "parthia",
    name: "Parthia",
    leader: "Mithridates",
    abilityName: "Parthian Shot",
    abilityDesc: "Horse archers ignore retreat penalties and fight effectively while moving.",
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
    abilityDesc: "Heavy cavalry are stronger; golden ages boost culture and science.",
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
    abilityDesc: "+20% production in all cities.",
    uniqueUnit: "Maryannu Chariot",
    uniqueInfra: "Sphinx",
    effects: { yieldPercent: { production: 20 } },
    cityNames: ["Memphis", "Thebes", "Heliopolis", "Alexandria", "Giza", "Saqqara", "Abydos", "Luxor", "Karnak", "Tanis"],
  },
  {
    id: "kush_nubia",
    name: "Kush / Nubia",
    leader: "Amanirenas",
    abilityName: "City of the Dead",
    abilityDesc: "Pyramids are cheaper; trade routes through desert grant production.",
    uniqueUnit: "Nubian Archer",
    uniqueInfra: "Nubian Pyramid",
    effects: { yieldPercent: { production: 10 }, goldPerWorkedDesert: 1 },
    cityNames: ["Meroë", "Napata", "Kerma", "Naqa", "Musawwarat es-Sufra", "Dongola", "Kawa", "Soleb", "Semna", "Abu Erteila"],
  },
  {
    id: "carthage",
    name: "Carthage",
    leader: "Hannibal",
    abilityName: "Phoenician Heritage",
    abilityDesc: "Coastal capital bonus, stronger naval movement, and mountain-crossing armies.",
    uniqueUnit: "War Elephant",
    uniqueInfra: "Cothon",
    effects: { yieldPercent: { gold: 15 }, unitClassCombat: { cavalry: 1 } },
    cityNames: ["Carthage", "Utica", "Hadrumetum", "Leptis Magna", "Gades", "Panormus", "Lilybaeum", "Motya", "Cirta", "Hippo Regius"],
  },
  {
    id: "aksum",
    name: "Aksum",
    leader: "Ezana",
    abilityName: "Red Sea Trade",
    abilityDesc: "International trade routes grant extra gold and faith.",
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
    abilityDesc: "Faith from mountains and stronger combat at higher altitude.",
    uniqueUnit: "Oromo Cavalry",
    uniqueInfra: "Rock-Hewn Church",
    effects: { yieldPercent: { production: 10 }, unitClassCombat: { cavalry: 1 } },
    cityNames: ["Lalibela", "Aksum", "Gondar", "Roha", "Adwa", "Debre Berhan", "Debre Libanos", "Mekelle", "Antioch", "Begemder"],
  },
  {
    id: "mali",
    name: "Mali",
    leader: "Mansa Musa",
    abilityName: "Sahel Merchants",
    abilityDesc: "+10% gold and +2 gold from each worked desert tile.",
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
    abilityDesc: "Gold from mining and trade; defensive bonus in home territory.",
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
    abilityDesc: "River trade yields extra gold; embarked units are stronger.",
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
    abilityDesc: "Pastures generate extra gold; trade route capacity is increased.",
    uniqueUnit: "Zimbabwe Spearman",
    uniqueInfra: "Great Enclosure",
    effects: { yieldPercent: { gold: 10, production: 10 } },
    cityNames: ["Great Zimbabwe", "Mapungubwe", "Khami", "Thulamela", "Danamombe", "Manyikeni", "Naletale", "Chibuene", "Sofala", "Kilwa"],
  },
  {
    id: "kanem_bornu",
    name: "Kanem-Bornu",
    leader: "Idris Alooma",
    abilityName: "Trans-Saharan",
    abilityDesc: "Desert trade routes yield gold; early firearms appear in the Exploration era.",
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
    abilityDesc: "First naval power; coastal trade grants extra culture and gold.",
    uniqueUnit: "Minoan Bireme",
    uniqueInfra: "Labyrinth Palace",
    effects: { yieldPercent: { gold: 10 } },
    cityNames: ["Knossos", "Phaistos", "Malia", "Zakros", "Gournia", "Thera", "Akrotiri", "Tylissos", "Archanes", "Amnissos"],
  },
  {
    id: "mycenaean_greece",
    name: "Mycenaean Greece",
    leader: "Agamemnon",
    abilityName: "Heroic Age",
    abilityDesc: "Heroes are cheaper to recruit; melee units gain strength during war.",
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
    abilityDesc: "+20% science; melee units +2 combat strength.",
    uniqueUnit: "Hoplite",
    uniqueInfra: "Acropolis",
    effects: { yieldPercent: { science: 20 }, unitClassCombat: { melee: 2 } },
    cityNames: ["Athens", "Sparta", "Corinth", "Thebes", "Delphi", "Olympia", "Argos", "Ephesus", "Miletus", "Syracuse"],
  },
  {
    id: "sparta",
    name: "Sparta",
    leader: "Leonidas",
    abilityName: "Agoge",
    abilityDesc: "Military units are cheaper and earn experience faster; defensive last-stand bonus.",
    uniqueUnit: "Spartan Hoplite",
    uniqueInfra: "Syssitia",
    effects: { unitClassCombat: { melee: 2 } },
    cityNames: ["Sparta", "Gytheio", "Amyklai", "Thouria", "Messene", "Gythium", "Pellana", "Sellasia", "Kardamyle", "Oitylos"],
  },
  {
    id: "macedon",
    name: "Macedon",
    leader: "Alexander",
    abilityName: "Hellenistic Fusion",
    abilityDesc: "No war-weariness during conquests; capturing cities grants science and culture.",
    uniqueUnit: "Hypaspist",
    uniqueInfra: "Basilikoi Paides",
    effects: { unitClassCombat: { melee: 2, cavalry: 1 } },
    cityNames: ["Pella", "Aegae", "Thessalonica", "Amphipolis", "Philippi", "Beroea", "Edessa", "Dion", "Stagira", "Pydna"],
  },
  {
    id: "etruscans",
    name: "Etruscans",
    leader: "Lars Porsena",
    abilityName: "Twelve Cities",
    abilityDesc: "Extra trade routes and cheaper roads between cities.",
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
    abilityDesc: "New cities are founded with a free Monument.",
    uniqueUnit: "Legionary",
    uniqueInfra: "Roman Bath",
    effects: { newCityFreeBuilding: "monument" },
    cityNames: ["Rome", "Ostia", "Antium", "Capua", "Pompeii", "Cumae", "Neapolis", "Arretium", "Mediolanum", "Aquileia"],
  },
  {
    id: "celts_gauls",
    name: "Celts / Gauls",
    leader: "Vercingetorix",
    abilityName: "Druidic Lore",
    abilityDesc: "Faith from forests; oppida provide strong defensive positions.",
    uniqueUnit: "Gaesatae",
    uniqueInfra: "Oppidum",
    effects: { unitClassCombat: { melee: 1 } },
    cityNames: ["Alesia", "Bibracte", "Gergovia", "Lutetia", "Avaricum", "Numantia", "Camulodunum", "Verlamion", "Glauberg", "Heuneburg"],
  },
  {
    id: "byzantium",
    name: "Byzantium",
    leader: "Justinian",
    abilityName: "Taxis",
    abilityDesc: "Units gain bonus strength against civilizations of other religions.",
    uniqueUnit: "Cataphract",
    uniqueInfra: "Hippodrome",
    effects: { unitClassCombat: { melee: 1, cavalry: 1 } },
    cityNames: ["Constantinople", "Thessalonica", "Nicomedia", "Antioch", "Trebizond", "Ephesus", "Nicaea", "Smyrna", "Adrianople", "Athens"],
  },
  {
    id: "norse",
    name: "Norse",
    leader: "Harald Hardrada",
    abilityName: "Knarr",
    abilityDesc: "+15% gold from raiding; melee units +2 combat strength.",
    uniqueUnit: "Longship",
    uniqueInfra: "Stave Church",
    effects: { yieldPercent: { gold: 15 }, unitClassCombat: { melee: 2 }, raidGoldPercent: 15, coastalRaidGoldPercent: 15 },
    cityNames: ["Kaupang", "Birka", "Hedeby", "Trondheim", "Oslo", "Reykjavik", "York", "Dublin", "Ribe", "Visby"],
  },
  {
    id: "franks",
    name: "Franks",
    leader: "Charlemagne",
    abilityName: "Carolingian Reform",
    abilityDesc: "Knights appear earlier; cities generate extra faith.",
    uniqueUnit: "Frankish Paladin",
    uniqueInfra: "Palatine Chapel",
    effects: { cavalryMovementBonus: 1, yieldPercent: { production: 10 } },
    cityNames: ["Aachen", "Paris", "Tours", "Soissons", "Reims", "Cologne", "Trier", "Mainz", "Strasbourg", "Metz"],
  },
  {
    id: "goths",
    name: "Goths",
    leader: "Theodoric",
    abilityName: "Foederati",
    abilityDesc: "Captured units may join your forces; armies are highly mobile.",
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
    abilityDesc: "Strong production and naval supremacy; longbow defense.",
    uniqueUnit: "Longbowman",
    uniqueInfra: "Manor House",
    effects: { yieldPercent: { production: 15 }, unitClassCombat: { ranged: 2 } },
    cityNames: ["Winchester", "London", "York", "Canterbury", "Lincoln", "Gloucester", "Worcester", "Durham", "Exeter", "Oxford"],
  },
  {
    id: "france",
    name: "France",
    leader: "Joan of Arc",
    abilityName: "Grand Tour",
    abilityDesc: "Wonders grant extra culture; châteaux improve tile culture output.",
    uniqueUnit: "Garde Écossaise",
    uniqueInfra: "Château",
    effects: { yieldPercent: { gold: 10 } },
    cityNames: ["Paris", "Orléans", "Tours", "Reims", "Lyon", "Marseille", "Bordeaux", "Rouen", "Avignon", "Toulouse"],
  },
  {
    id: "castile_spain",
    name: "Castile / Spain",
    leader: "Isabella",
    abilityName: "El Escorial",
    abilityDesc: "Combat bonus against other religions; treasure fleets bring gold from distant colonies.",
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
    abilityDesc: "Long ocean trade range and increased yields from overseas trade.",
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
    abilityDesc: "Extra trade routes and merchant gold; settlers are replaced by city purchases.",
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
    abilityDesc: "Banking generates extra gold; mercenaries are cheaper to hire.",
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
    abilityDesc: "Rivers and polders boost yields; trade routes grant extra gold.",
    uniqueUnit: "Sea Beggar",
    uniqueInfra: "Polder",
    effects: { yieldPercent: { gold: 10, production: 10 } },
    cityNames: ["Amsterdam", "Rotterdam", "The Hague", "Utrecht", "Delft", "Leiden", "Haarlem", "Gouda", "Middelburg", "Groningen"],
  },
  {
    id: "holy_roman_empire",
    name: "Holy Roman Empire / Germany",
    leader: "Barbarossa",
    abilityName: "Free Imperial Cities",
    abilityDesc: "Extra district per city and increased production.",
    uniqueUnit: "Landsknecht",
    uniqueInfra: "Hansa",
    effects: { yieldPercent: { production: 15 } },
    cityNames: ["Aachen", "Frankfurt", "Cologne", "Hamburg", "Lübeck", "Nuremberg", "Regensburg", "Augsburg", "Munich", "Magdeburg"],
  },
  {
    id: "kievan_rus",
    name: "Kievan Rus",
    leader: "Yaroslav",
    abilityName: "Lavra",
    abilityDesc: "Faith from forests and tundra; territory grows quickly.",
    uniqueUnit: "Druzhina",
    uniqueInfra: "Lavra",
    effects: { yieldPercent: { production: 10 } },
    cityNames: ["Kyiv", "Novgorod", "Vladimir", "Suzdal", "Chernigov", "Polotsk", "Smolensk", "Pereyaslavl", "Galich", "Rostov"],
  },
  {
    id: "poland_lithuania",
    name: "Poland-Lithuania",
    leader: "Jadwiga",
    abilityName: "Golden Liberty",
    abilityDesc: "Culture flips conquered tiles; faith converts into culture.",
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
    abilityDesc: "City-state levies are cheaper and stronger.",
    uniqueUnit: "Black Army",
    uniqueInfra: "Thermal Bath",
    effects: { yieldPercent: { production: 10 }, unitClassCombat: { cavalry: 1 } },
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
    abilityDesc: "+15% production and +10% science.",
    uniqueUnit: "Cho-Ko-Nu",
    uniqueInfra: "Great Wall",
    effects: { yieldPercent: { production: 15, science: 10 } },
    cityNames: ["Chang'an", "Luoyang", "Xianyang", "Chengdu", "Nanjing", "Kaifeng", "Hangzhou", "Anyang", "Zhengzhou", "Linzi"],
  },
  {
    id: "china_tang_song",
    name: "China (Tang/Song)",
    leader: "Taizong",
    abilityName: "Middle Kingdom",
    abilityDesc: "Capital-adjacent cities gain yields; gunpowder and printing arrive earlier.",
    uniqueUnit: "Fire Lancer",
    uniqueInfra: "Imperial Examination Hall",
    effects: { yieldPercent: { production: 10, science: 10 } },
    cityNames: ["Chang'an", "Luoyang", "Kaifeng", "Hangzhou", "Nanjing", "Bianliang", "Yangzhou", "Suzhou", "Guangzhou", "Quanzhou"],
  },
  {
    id: "china_ming",
    name: "China (Ming)",
    leader: "Yongle",
    abilityName: "Treasure Fleets",
    abilityDesc: "Massive coastal cities; ocean trade and exploration yield extra gold.",
    uniqueUnit: "War Junk",
    uniqueInfra: "Porcelain Tower",
    effects: { yieldPercent: { gold: 15 } },
    cityNames: ["Beijing", "Nanjing", "Hangzhou", "Suzhou", "Xi'an", "Guangzhou", "Quanzhou", "Fuzhou", "Yangzhou", "Chengdu"],
  },
  {
    id: "maurya",
    name: "Maurya",
    leader: "Ashoka",
    abilityName: "Dharma",
    abilityDesc: "+20% food; cavalry (elephants) +2 combat strength.",
    uniqueUnit: "War Elephant",
    uniqueInfra: "Stepwell",
    effects: { yieldPercent: { food: 20 }, unitClassCombat: { cavalry: 2 } },
    cityNames: ["Pataliputra", "Taxila", "Ujjain", "Vidisha", "Mathura", "Sarnath", "Kosambi", "Rajagriha", "Varanasi", "Kaushambi"],
  },
  {
    id: "gupta_india",
    name: "Gupta India",
    leader: "Chandragupta II",
    abilityName: "Golden Age of India",
    abilityDesc: "Bonus science and culture; mathematics advances earlier.",
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
    abilityDesc: "Naval reach spans oceans; overseas conquest is more profitable.",
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
    abilityDesc: "Units fight at full strength even when damaged; districts cluster for bonuses.",
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
    abilityDesc: "Science from governors and mines; turtle ships bolster coastal defense.",
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
    abilityDesc: "Mountains become workable and grant faith; combat bonus at high altitude.",
    uniqueUnit: "Tibetan Cavalry",
    uniqueInfra: "Potala",
    effects: { yieldPercent: { production: 10 }, unitClassCombat: { cavalry: 1 } },
    cityNames: ["Lhasa", "Shigatse", "Gyantse", "Sakya", "Tsaparang", "Lhoka", "Chamdo", "Nagchu", "Nyingchi", "Xigazê"],
  },
  {
    id: "dai_viet_vietnam",
    name: "Dai Viet (Vietnam)",
    leader: "Le Loi",
    abilityName: "Nine Dragons",
    abilityDesc: "Forest and jungle ambush bonus; strong defensive capabilities.",
    uniqueUnit: "Voi Chiến",
    uniqueInfra: "Thành",
    effects: { unitClassCombat: { melee: 1 } },
    cityNames: ["Hanoi", "Thăng Long", "Huế", "Hoa Lư", "Thanh Hóa", "Nam Định", "Nghệ An", "Vinh", "Đồng Nai", "Saigon"],
  },
  {
    id: "khmer",
    name: "Khmer",
    leader: "Jayavarman VII",
    abilityName: "Grand Barays",
    abilityDesc: "Rivers provide extra food and faith; cities can grow very large.",
    uniqueUnit: "Domrey",
    uniqueInfra: "Prasat",
    effects: { yieldPercent: { food: 15 } },
    cityNames: ["Angkor", "Yasodharapura", "Hariharalaya", "Koh Ker", "Phnom Kulen", "Banteay Srei", "Preah Khan", "Ta Prohm", "Sambor Prei Kuk", "Battambang"],
  },
  {
    id: "srivijaya",
    name: "Srivijaya",
    leader: "Balaputra",
    abilityName: "Maritime Mandala",
    abilityDesc: "Control of sea lanes grants trade gold; coastal cities thrive.",
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
    abilityDesc: "Bonus per coastal city; trade across islands yields extra gold.",
    uniqueUnit: "Majapahit Jong",
    uniqueInfra: "Harbor-Temple",
    effects: { yieldPercent: { gold: 10, production: 10 } },
    cityNames: ["Trowulan", "Wilwatikta", "Majapahit", "Surabaya", "Bali", "Gresik", "Tuban", "Lamongan", "Pajang", "Demak"],
  },
  {
    id: "pagan_burma",
    name: "Pagan (Burma)",
    leader: "Anawrahta",
    abilityName: "Land of Pagodas",
    abilityDesc: "Faith from building construction; war elephants dominate the battlefield.",
    uniqueUnit: "Burmese War Elephant",
    uniqueInfra: "Pagoda",
    effects: { yieldPercent: { production: 10 }, unitClassCombat: { cavalry: 1 } },
    cityNames: ["Pagan", "Bagan", "Ava", "Mandalay", "Pegu", "Thaton", "Mrauk-U", "Amarapura", "Sagaing", "Pyay"],
  },
  {
    id: "ayutthaya_siam",
    name: "Ayutthaya (Siam)",
    leader: "Ramkhamhaeng",
    abilityName: "Father Governs Children",
    abilityDesc: "City-state alliances grant science, culture, and faith.",
    uniqueUnit: "Siamese War Elephant",
    uniqueInfra: "Wat",
    effects: { yieldPercent: { science: 10 } },
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
    abilityDesc: "Extra light cavalry per build; mounted units heal after kills.",
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
    abilityDesc: "Raiding yields extra gold; horse units are cheaper to produce.",
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
    abilityDesc: "Siege power from captured cities; razing cities grants production.",
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
    abilityDesc: "Cavalry gain combat strength; borders expand quickly.",
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
    abilityDesc: "Combat bonus against other religions; conquest grants faith.",
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
    abilityDesc: "Cavalry +1 movement and +2 combat strength.",
    uniqueUnit: "Keshig",
    uniqueInfra: "Ordu",
    effects: { cavalryMovementBonus: 1, unitClassCombat: { cavalry: 2 } },
    cityNames: ["Karakorum", "Khanbaliq", "Samarkand", "Bukhara", "Merv", "Nishapur", "Tabriz", "Sarai", "Bolghar", "Almaliq"],
  },
  {
    id: "timurids",
    name: "Timurids",
    leader: "Tamerlane",
    abilityName: "Sword of Islam",
    abilityDesc: "Siege bonus; plunder enriches cities and advances science.",
    uniqueUnit: "Timurid Siege Train",
    uniqueInfra: "Registan",
    effects: { yieldPercent: { science: 10 }, unitClassCombat: { cavalry: 2 }, raidGoldPercent: 15, raidSciencePercent: 50 },
    cityNames: ["Samarkand", "Bukhara", "Herat", "Isfahan", "Shiraz", "Mashhad", "Tabriz", "Kabul", "Balkh", "Damascus"],
  },
  {
    id: "ottomans",
    name: "Ottomans",
    leader: "Mehmed II",
    abilityName: "Great Bombard",
    abilityDesc: "Siege and gunpowder supremacy; conquered cities stay loyal.",
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
    abilityDesc: "Early culture and faith; colossal heads generate influence.",
    uniqueUnit: "Olmec Spearman",
    uniqueInfra: "Colossal Head",
    effects: { yieldPercent: { production: 10 } },
    cityNames: ["San Lorenzo", "La Venta", "Tres Zapotes", "Laguna de los Cerros", "Las Bocas", "El Manatí", "Chalcatzingo", "San José Mogote", "La Mojarra", "Potrero Nuevo"],
  },
  {
    id: "maya",
    name: "Maya",
    leader: "Pacal the Great",
    abilityName: "Mayab",
    abilityDesc: "Cities near the capital gain yields; observatories boost science.",
    uniqueUnit: "Holkan",
    uniqueInfra: "Observatory",
    effects: { yieldPercent: { science: 10 } },
    cityNames: ["Tikal", "Palenque", "Chichen Itza", "Copán", "Calakmul", "Uxmal", "Caracol", "Yaxha", "Bonampak", "Tulum"],
  },
  {
    id: "zapotec",
    name: "Zapotec",
    leader: "Cocijo priesthood",
    abilityName: "Cloud People",
    abilityDesc: "Hill cities gain defense and extra culture.",
    uniqueUnit: "Zapotec Warrior",
    uniqueInfra: "Danzante Temple",
    effects: { unitClassCombat: { melee: 1 } },
    cityNames: ["Monte Albán", "Mitla", "San José Mogote", "Dainzu", "Lambityeco", "Yagul", "Zaachila", "Huamelulpan", "Huitzo", "Teotitlán"],
  },
  {
    id: "teotihuacan",
    name: "Teotihuacan",
    leader: "Priest-Kings",
    abilityName: "City of the Gods",
    abilityDesc: "Wonders and pyramids are cheaper; culture output is strong.",
    uniqueUnit: "Pyramid Guard",
    uniqueInfra: "Avenue of the Dead",
    effects: { yieldPercent: { production: 15 } },
    cityNames: ["Teotihuacan", "Cuicuilco", "Cholula", "Tula", "Xochicalco", "Cacaxtla", "Cantona", "Tajín", "Tenochtitlan", "Tlaxcala"],
  },
  {
    id: "toltec",
    name: "Toltec",
    leader: "Topiltzin",
    abilityName: "Toltecayotl",
    abilityDesc: "Military culture; veteran units gain extra combat strength.",
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
    abilityDesc: "Melee units +3 combat strength.",
    uniqueUnit: "Eagle Warrior",
    uniqueInfra: "Tlachtli",
    effects: { unitClassCombat: { melee: 3 } },
    cityNames: ["Tenochtitlan", "Texcoco", "Tlacopan", "Cholula", "Tlaxcala", "Tenayuca", "Azcapotzalco", "Cuauhtitlan", "Xochimilco", "Otumba"],
  },
  {
    id: "inca",
    name: "Inca",
    leader: "Pachacuti",
    abilityName: "Mit'a",
    abilityDesc: "Mountains become workable; terrace farms feed large cities.",
    uniqueUnit: "Warak'aq",
    uniqueInfra: "Terrace Farm",
    effects: { yieldPercent: { food: 10 } },
    cityNames: ["Cusco", "Machu Picchu", "Quito", "Lima", "Chan Chan", "Tiwanaku", "Huaraz", "Vilcabamba", "Ollantaytambo", "Sacsayhuamán"],
  },
  {
    id: "muisca",
    name: "Muisca",
    leader: "Zipa",
    abilityName: "El Dorado",
    abilityDesc: "Faith converts into gold; lake and highland tiles yield more.",
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
    abilityDesc: "Earthwork improvements generate culture and faith; river trade is strong.",
    uniqueUnit: "Cahokian Warrior",
    uniqueInfra: "Earthwork Mound",
    effects: { yieldPercent: { production: 10 } },
    cityNames: ["Cahokia", "Moundville", "Etowah", "Spiro", "Kincaid", "Angel", "Emerald", "Wickliffe", "Winterville", "Nodena"],
  },
  {
    id: "haudenosaunee",
    name: "Haudenosaunee (Iroquois)",
    leader: "Hiawatha",
    abilityName: "Great League",
    abilityDesc: "Forest movement and combat bonus; longhouses boost production.",
    uniqueUnit: "Mohawk Warrior",
    uniqueInfra: "Longhouse",
    effects: { yieldPercent: { production: 10 } },
    cityNames: ["Onondaga", "Seneca", "Cayuga", "Oneida", "Mohawk", "Tuscarora", "Ganondagan", "Canandaigua", "Buffalo", "Caughnawaga"],
  },
  {
    id: "pueblo",
    name: "Pueblo",
    leader: "Council",
    abilityName: "Cliff Dwellers",
    abilityDesc: "Desert and mesa tiles grant defense and extra housing.",
    uniqueUnit: "Pueblo Skirmisher",
    uniqueInfra: "Cliff Palace",
    effects: { yieldPercent: { production: 10 } },
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
    abilityDesc: "Ocean embark and sight from the start; settle distant islands early.",
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
    abilityDesc: "Start at sea; unimproved forests and reefs grant yields; pā defend strongly.",
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
    abilityDesc: "Coastal cities gain amenities; island unification yields extra gold.",
    uniqueUnit: "Hawaiian Koa",
    uniqueInfra: "Heiau",
    effects: { yieldPercent: { gold: 10 } },
    cityNames: ["Honolulu", "Hilo", "Kailua", "Lahaina", "Waipahu", "Pearl City", "Kahului", "Kona", "Molokai", "Kauai"],
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
};

for (const civ of CIVILIZATIONS) {
  civ.leaderQuote = LEADER_QUOTES[civ.id];
}

const BY_ID = new Map(CIVILIZATIONS.map((c) => [c.id, c]));

export function getCiv(id: string | undefined): CivDef | undefined {
  return id ? BY_ID.get(id) : undefined;
}

export const CIV_IDS: string[] = CIVILIZATIONS.map((c) => c.id);

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
    requirement: { masonry: 18, architecture: 10 },
    effect: { yieldPerCity: { production: 1 } },
  },
  {
    id: "hanging_gardens",
    name: "Hanging Gardens",
    desc: "Terraced gardens fed by ingenious irrigation. +1 food in every city.",
    requirement: { carpentry: 10, architecture: 10, engineering: 6 },
    effect: { yieldPerCity: { food: 1 } },
  },
  {
    id: "great_library",
    name: "Great Library",
    desc: "A vast repository of the world's knowledge. +3 science in the host city, and a free technology on completion.",
    requirement: { architecture: 12, engineering: 8 },
    effect: { yieldHostCity: { science: 3 }, freeTech: true },
  },
  {
    id: "colossus",
    name: "Colossus",
    desc: "A towering bronze statue guarding a great harbour. +3 gold in the host city.",
    requirement: { masonry: 10, engineering: 10 },
    effect: { yieldHostCity: { gold: 3 } },
  },
  {
    id: "great_lighthouse",
    name: "Great Lighthouse",
    desc: "A beacon that draws trade from across the sea. +1 gold in every city.",
    requirement: { masonry: 8, architecture: 8, engineering: 8 },
    effect: { yieldPerCity: { gold: 1 } },
  },
];

const WONDER_BY_ID = new Map(WONDER_DEFS.map((w) => [w.id, w]));
export const getWonder = (id: string | undefined) => (id ? WONDER_BY_ID.get(id) : undefined);
export const WONDER_IDS: string[] = WONDER_DEFS.map((w) => w.id);

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
