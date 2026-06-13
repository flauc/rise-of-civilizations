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
