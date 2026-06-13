// Civilization content. Kept dependency-free (loose string ids for unit classes
// and building ids) so the sim can import it without a dependency cycle. The sim
// applies these effects at the relevant points (see packages/sim/src/game/civs.ts).

export interface CivEffects {
  /** Percentage bonus to a city's per-turn yields. */
  yieldPercent?: { food?: number; production?: number; gold?: number; science?: number };
  /** Extra movement points for cavalry-class units. */
  cavalryMovementBonus?: number;
  /** Flat combat-strength bonus per unit class id ("melee" | "ranged" | "cavalry" | "siege" | ...). */
  unitClassCombat?: Record<string, number>;
  /** Extra gold from each worked desert tile. */
  goldPerWorkedDesert?: number;
  /** A building every new city is founded with (building id). */
  newCityFreeBuilding?: string;
  /** Extra starting population for new cities. */
  newCityExtraPopulation?: number;
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
}

export const CIVILIZATIONS: CivDef[] = [
  {
    id: "rome",
    name: "Rome",
    leader: "Trajan",
    abilityName: "All Roads Lead to Rome",
    abilityDesc: "New cities are founded with a free Monument.",
    uniqueUnit: "Legionary",
    uniqueInfra: "Roman Bath",
    effects: { newCityFreeBuilding: "monument" },
  },
  {
    id: "egypt",
    name: "Egypt",
    leader: "Hatshepsut",
    abilityName: "Iteru",
    abilityDesc: "+20% production in all cities.",
    uniqueUnit: "Maryannu Chariot",
    uniqueInfra: "Sphinx",
    effects: { yieldPercent: { production: 20 } },
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
  },
  {
    id: "han_china",
    name: "Han China",
    leader: "Qin Shi Huang",
    abilityName: "Dynastic Cycle",
    abilityDesc: "+15% production and +10% science.",
    uniqueUnit: "Cho-Ko-Nu",
    uniqueInfra: "Great Wall",
    effects: { yieldPercent: { production: 15, science: 10 } },
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
  },
  {
    id: "norse",
    name: "Norse",
    leader: "Harald Hardrada",
    abilityName: "Knarr",
    abilityDesc: "+15% gold from raiding; melee units +2 combat strength.",
    uniqueUnit: "Longship",
    uniqueInfra: "Stave Church",
    effects: { yieldPercent: { gold: 15 }, unitClassCombat: { melee: 2 } },
  },
];

const BY_ID = new Map(CIVILIZATIONS.map((c) => [c.id, c]));

export function getCiv(id: string | undefined): CivDef | undefined {
  return id ? BY_ID.get(id) : undefined;
}

export const CIV_IDS: string[] = CIVILIZATIONS.map((c) => c.id);

// ===========================================================================
// Civics tree, governments and policies (the culture-funded parallel tree).
// ===========================================================================

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
