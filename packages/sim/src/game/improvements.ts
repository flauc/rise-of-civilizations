import type { Yields } from "./terrain";
import { UNIQUE_IMPROVEMENTS } from "@roc/data";

// Civ-unique tile improvements (see UNIQUE_INFRA in @roc/data). Single-tier: their
// worked yields are the same regardless of level. Keyed by the improvement id,
// which is also the tile.improvement kind string the Works system stamps.
const UNIQUE_IMP_YIELDS: Record<string, Yields> = {};
for (const u of UNIQUE_IMPROVEMENTS) {
  UNIQUE_IMP_YIELDS[u.id] = {
    food: u.yields.food ?? 0,
    production: u.yields.production ?? 0,
    gold: u.yields.gold ?? 0,
    science: u.yields.science ?? 0,
    faith: u.yields.faith ?? 0,
  };
}

/** Whether a kind string is a civ-unique tile improvement. */
export function isUniqueImprovementKind(kind: string): boolean {
  return kind in UNIQUE_IMP_YIELDS;
}

// Tile improvements now come in three tiers, built by city specialists via Works
// (see works.ts). This module holds their per-tier yields; the unit-driven build
// path (Workers) has been removed.

export type ImprovementKind =
  | "farm"
  | "mine"
  | "quarry"
  | "lumber_camp"
  | "pasture"
  | "plantation"
  | "camp"
  | "fishing_boats"
  | "fishery"
  | "saltern";

export interface ImprovementDef {
  kind: ImprovementKind;
  name: string;
  /** Per-tier worked yields (index 0 = tier 1 … index 2 = tier 3). */
  tiers: [Partial<Yields>, Partial<Yields>, Partial<Yields>];
}

export const IMPROVEMENT_DEFS: Record<ImprovementKind, ImprovementDef> = {
  farm: {
    kind: "farm",
    name: "Farm",
    tiers: [{ food: 2 }, { food: 3 }, { food: 4 }],
  },
  lumber_camp: {
    kind: "lumber_camp",
    name: "Lumber Camp",
    tiers: [{ production: 1 }, { production: 2 }, { production: 3 }],
  },
  mine: {
    kind: "mine",
    name: "Mine",
    tiers: [{ production: 1 }, { production: 2 }, { production: 3, gold: 1 }],
  },
  quarry: {
    kind: "quarry",
    name: "Quarry",
    tiers: [{ production: 1 }, { production: 1, gold: 1 }, { production: 2, gold: 2 }],
  },
  pasture: {
    kind: "pasture",
    name: "Pasture",
    tiers: [{ food: 1 }, { food: 1, production: 1 }, { food: 2, production: 1 }],
  },
  plantation: {
    kind: "plantation",
    name: "Plantation",
    tiers: [{ gold: 1 }, { gold: 1, food: 1 }, { gold: 2, food: 1 }],
  },
  camp: {
    kind: "camp",
    name: "Camp",
    tiers: [{ food: 1 }, { food: 1, gold: 1 }, { food: 2, gold: 1 }],
  },
  fishing_boats: {
    kind: "fishing_boats",
    name: "Fishing Boats",
    tiers: [{ food: 1, gold: 1 }, { food: 1, gold: 2 }, { food: 2, gold: 2 }],
  },
  // Water improvements unlocked by Maritime Foraging. Fishery leans food +
  // production (drying racks, processing); Saltern is a coastal gold engine
  // (evaporating brine for the salt trade).
  fishery: {
    kind: "fishery",
    name: "Fishery",
    tiers: [{ food: 1, production: 1 }, { food: 2, production: 1 }, { food: 2, production: 2 }],
  },
  saltern: {
    kind: "saltern",
    name: "Salt Pans",
    tiers: [{ gold: 1 }, { gold: 2 }, { gold: 2, food: 1 }],
  },
};

const ZERO: Yields = { food: 0, production: 0, gold: 0, science: 0, faith: 0 };

/** Worked-yield bonus a tile's improvement contributes, given its kind + tier. */
export function improvementYields(kind: string | undefined, level = 1): Yields {
  if (!kind) return ZERO;
  const uniq = UNIQUE_IMP_YIELDS[kind];
  if (uniq) return uniq; // civ-unique improvement (single tier)
  const def = IMPROVEMENT_DEFS[kind as ImprovementKind];
  if (!def) return ZERO;
  const tier = def.tiers[Math.min(3, Math.max(1, level)) - 1] ?? {};
  return {
    food: tier.food ?? 0,
    production: tier.production ?? 0,
    gold: tier.gold ?? 0,
    science: tier.science ?? 0,
    faith: tier.faith ?? 0,
  };
}
