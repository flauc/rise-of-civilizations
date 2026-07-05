// Balance model — the tunable point-value constants behind the civ scorer.
//
// The model (see docs/BALANCE.md): every civ pillar is scored as
//     value = magnitude(points) × timingWeight(when it comes online)
// and we want every civ's TOTAL value to land in a narrow band. Because an early
// point compounds harder than a late one, timingWeight is >1 early and <1 late —
// so a late-unlocking unit/ability must carry MORE raw magnitude to match an
// early one. Tune the numbers here; the scorer (score.ts) is pure mechanism.

import type { CivEffects } from "@roc/data";

// ---------------------------------------------------------------------------
// Timing — when a benefit comes online, keyed to cumulative research cost.
// score.ts computes each tech/civic's cumulative cost (itself + all prereqs)
// and buckets it into an era; passives & starting units are always "start".
// ---------------------------------------------------------------------------

export type Era = "start" | "ancient" | "classical" | "medieval" | "late";

/** Cumulative-research-cost upper bounds for each era (exclusive of the next). */
export const ERA_COST_BANDS: { era: Era; maxCumCost: number }[] = [
  { era: "ancient", maxCumCost: 130 },
  { era: "classical", maxCumCost: 340 },
  { era: "medieval", maxCumCost: 680 },
  { era: "late", maxCumCost: Infinity },
];

/** How much an equal magnitude is worth in each era (early advantage compounds). */
export const TIMING_WEIGHT: Record<Era, number> = {
  start: 1.5,
  ancient: 1.3,
  classical: 1.0,
  medieval: 0.8,
  late: 0.65,
};

// ---------------------------------------------------------------------------
// Magnitude — points per unit of each CivEffects field. This is the master
// currency; everything else is expressed in these points.
// ---------------------------------------------------------------------------

/** Points per +1% of a city yield. Production/science compound hardest. */
export const YIELD_PCT_PTS: Record<keyof NonNullable<CivEffects["yieldPercent"]>, number> = {
  // Gold is the UNIVERSAL rush currency (rush.ts): it can rush production, buildings,
  // unit training-time, AND wonder labour — plus upkeep/diplomacy. Most convertible.
  gold: 1.05,
  // Production only builds BUILDINGS, training-building tiers, and lossy conversion
  // projects. Units are trained via population+time (training.ts) and wonders via
  // specialist labour (works.ts) — NOT production. So it's less universal than gold.
  production: 1.0,
  science: 1.0, // compounds via permanent tech unlocks (units/buildings/wonders)
  food: 0.85, // the real cap on army size (1 pop per trained unit), but growth is slow
  culture: 0.85, // funds the civics/policy tree + a victory path
  faith: 0.7, // gates religion → beliefs/Great People/Legends/rush
};

/** Points per +1 flat combat strength, by unit class (military-only ⇒ discounted). */
export const CLASS_COMBAT_PTS: Record<string, number> = {
  melee: 6,
  ranged: 5,
  cavalry: 6,
  siege: 4,
  naval_melee: 5,
  naval_ranged: 5,
  recon: 2,
};
export const CLASS_COMBAT_DEFAULT = 5;

/** Points per +1 flat yield on a per-turn city/tile bonus (coastal/desert/tile etc.). */
export const FLAT_CITY_YIELD_PTS = 4;
export const FLAT_TILE_YIELD_PTS = 5; // worked-tile bonuses scale with # cities

/** Everything else, per unit unless noted. */
export const PTS = {
  cavalryMovement: 8,
  navalMovement: 6,
  landMovement: 10,
  allUnitMovement: 12,
  mountedSight: 3,
  ignoreRoughTerrain: 6,
  ignoreMountainMovement: 5,
  embarkedCombat: 3,
  meleeVsCity: 4,
  siegeVsCityMult: 8, // per 1.0 multiplier
  unitHealPerTurn: 0.9, // per +1 HP/turn (situational, only while wounded)
  mountedHealPerTurn: 0.7, // per +1 HP/turn
  tradeRouteGold: 4,
  tradeRouteFaith: 3,
  tradeRouteCapacity: 6,
  rushWithFaith: 8,
  rushWithCulture: 8,
  nonDesertCityFoodPct: 0.8, // per 1%
  mineTileProduction: 5,
  pastureTileGold: 4,
  pastureTileFood: 4,
  farmTileFood: 4,
  farmTileFaith: 3,
  forestTileFaith: 3,
  forestTileCombat: 4,
  hillTileProduction: 5,
  freshWaterTileFood: 4,
  freshWaterTileProduction: 5,
  coastalTileGold: 4,
  goldPerWorkedDesert: 5,
  captureCityPopulation: 5,
  raidGoldPct: 0.15, // per 1% (situational — requires active raiding/war)
  coastalRaidGoldPct: 0.12,
  raidSciencePct: 0.12,
  // founding / population — these snowball, so they are priced high
  newCityFreeBuilding: 12,
  newCityExtraPopulation: 16,
  capitalPopulation: 11,
  // training
  trainTimePctFaster: 0.5, // per 1% faster
  startMorale: 0.4, // per point
  startXp: 0.5, // per point
  trainingSlots: 8,
  freeTrainingFamily: 10,
  // penalties (costs are the same currency, subtracted)
  mineTileFoodPenalty: -3,
} as const;

// ---------------------------------------------------------------------------
// Civics & governments (docs/CIVICS-AND-GOVERNMENTS.md §9). Conditional effects
// are worth a fraction of face value; cons are negative values that subtract.
// ---------------------------------------------------------------------------

/** A benefit gated on a game state is discounted to its expected value. */
export const CONDITIONAL_DISCOUNT = {
  warOrPeace: 0.6, // ⚔ at war / ☮ at peace
  homeOrForeign: 0.7, // 🏠 in / out of home territory
  religion: 0.5, // your-vs-their-faith gated
  capital: 0.4, // capital-only (one city of several)
} as const;

/** Points for the conditional & M-C1 combat/utility fields the civic catalogue uses. */
export const CIVIC_PTS = {
  allUnitCombat: 8, // hits every unit, always on
  homeCombat: 5, // × homeOrForeign
  foreignCombat: 5, // × homeOrForeign
  combatVsOtherReligion: 5, // × religion
  cityDefenseBonus: 2, // defensive, situational
  cultureOnKill: 1.5, // per point, per kill
  faithOnKill: 1.5,
  enemyReligionPressurePercent: 0.1, // per −1% (suppression is a benefit)
  garrisonFreeUpkeep: 5,
  homeHealBonus: 0.9, // × homeOrForeign
  convertOnCapture: 6, // × religion
  unitUpkeepPct: 0.3, // per −1% (cheaper = good)
} as const;

// ---------------------------------------------------------------------------
// Unique unit — flat combat bonus + bespoke active ability, timed to the base
// unit it replaces (a Classical UU is worth less than an Ancient one).
// ---------------------------------------------------------------------------

/** A UU only ever fields as one military line ⇒ its raw combat value is discounted. */
export const UU_SITUATIONAL_FACTOR = 0.7;
/** Points per +1 of a UU's flat combat bonus. */
export const UU_BONUS_PTS = 5;

/**
 * Impact points of an active ability (ask #1's variety lever). Base/common
 * abilities are cheap; bespoke civ-unique abilities carry more identity value.
 * A UU's ability score = sum of its abilities' impact − (base unit's abilities'
 * impact), so a UU that merely inherits its base scores 0 here.
 */
export const ABILITY_IMPACT: Record<string, number> = {
  // common, shared across many base units
  brace: 3, shield_wall: 4, testudo: 4, emplace: 4, charge: 4, skirmish: 3,
  sunder: 3, pierce: 3, harry: 2, reconnoiter: 2, hide: 1, fire_and_retreat: 3, ram: 3,
  shock_charge: 5, trample: 5, boarding_party: 4, greek_fire: 5, coastal_bombardment: 4,
  // bespoke civ-unique / enhanced (worth more — they define the UU)
  war_cart_charge: 5, parthian_shot: 6, feigned_retreat: 6, hussar_charge: 6,
  othismos: 6, last_stand: 6, repeating_fire: 6, pavise: 5, arrow_storm: 6,
  furor: 5, siege_assault: 6, fire_lance: 7, plunder: 5,
  // bespoke civ-unique abilities (Egypt & Africa wave)
  aimed_shot: 6, terrorize: 6, overrun: 6, war_drums: 5, poisoned_arrows: 6,
  stone_bulwark: 5, fresh_mounts: 5, drilled_charge: 6, zareba: 5, monsoon_run: 4,
  // bespoke civ-unique abilities (Mediterranean & Europe wave)
  pilum: 6, strandhogg: 5, hellburner: 7, broadside: 6, zweihander: 5,
  hammer_and_anvil: 7, wedge_charge: 7, heroic_challenge: 6, mounted_volley: 6,
  // bespoke civ-unique abilities (Mesopotamia & Persia revisit)
  king_of_battle: 6, siege_volley: 5, kadesh_charge: 6, zagros_shot: 6,
  ride_down: 5, endless_ranks: 6, iron_wall: 5,
  // bespoke civ-unique abilities (European expansion wave)
  wagenburg: 6, halberd_hook: 6, schiltron: 6, sparth_cleave: 6, couched_lance: 7,
  mountain_ambush: 6, desperta_ferro: 5, falx_reap: 6, winter_war: 6, shear_oars: 5, swift_oars: 4,
  // bespoke civ-unique abilities (Asia wave)
  howdah_volley: 6, double_ballista: 6, duel_of_kings: 6, elephant_wall: 6,
  gate_breaker: 6, turtle_shell: 6, highland_charge: 6, qamargah: 6,
  // bespoke civ-unique abilities (Steppe & Near East wave)
  whistling_arrows: 6, nerge: 7, steady_volley: 6, wolf_pack: 6, naphtha_shot: 6, camel_panic: 6,
  // bespoke civ-unique abilities (Americas & Oceania wave)
  flower_war: 6, haka: 5, bolas: 5, hornet_bomb: 6, stone_hail: 6, beach_assault: 6,
  mourning_war: 6, atlatl_volley: 6, obsidian_reap: 6, leiomano: 6,
};
export const ABILITY_IMPACT_DEFAULT = 3;

// ---------------------------------------------------------------------------
// Unique infrastructure.
// ---------------------------------------------------------------------------

/** Building host-city yields are worth less than an improvement's worked-tile
 *  yields (which scale with every city that builds them). */
export const INFRA_BUILDING_YIELD_PTS = 4;
export const INFRA_IMPROVEMENT_YIELD_PTS = 6; // + tiers up, so priced higher
/** Baseline building cost; production above/below this nudges value down/up. */
export const INFRA_BASELINE_COST = 30;
export const INFRA_COST_PTS_PER_10 = 1.2; // value penalty per +10 cost over baseline

// ---------------------------------------------------------------------------
// Leader ability — an active, cooldown-gated, deliberately double-edged power.
// The functions live in @roc/sim so they can't be auto-scored; instead each is
// a NET point value (benefit − cost) that we tune by hand. Un-annotated civs
// fall back to LEADER_DEFAULT_NET (all leader abilities are ~equal net BY
// DESIGN, so a constant baseline is a fair v1 — see docs/BALANCE.md).
//
// Final leader value = net × timingWeight(unlock) × frequencyFactor(cooldown).
// ---------------------------------------------------------------------------

export const LEADER_DEFAULT_NET = 14;

/** Cooldown 20 ⇒ 1.0; shorter cooldowns fire more often over a game ⇒ worth more. */
export function frequencyFactor(cooldown: number): number {
  if (cooldown <= 0) return 1.5;
  return Math.min(1.6, 20 / cooldown);
}

/**
 * Hand-tuned NET point value for leader abilities that are clearly above/below
 * the double-edged baseline. Keyed by civ id. Everything else uses the default.
 * This table is the primary tuning surface as we audit leader abilities.
 */
export const LEADER_NET: Record<string, number> = {
  // strong instant economy / army swings
  babylon: 20, // finish a civic + statesman points
  assyria: 22, // steal a whole tech
  lydia: 16, // +300 gold
  sumer: 12, // 2 War-Carts, but costs 2 pop + 100 gold
  // examples the user called out (kept at baseline unless clearly off)
  chola: 14,
  almoravids: 15,
};

/** The single budget EVERY civ should reach. We want a flat roster (no tiers), and
 *  we close the gap by BUFFING under-budget civs, so the target sits near the current
 *  top rather than the mean. A civ within ±OUTLIER_BAND of this is "in band". */
export const TARGET_TOTAL = 88;
/** Half-width of the acceptable band around TARGET_TOTAL (points). */
export const OUTLIER_BAND = 6;
