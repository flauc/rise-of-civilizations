// Tech Eurekas — in-world triggers that grant a free science boost toward a specific
// tech, rewarding the player for doing things that naturally lead to that discovery.
// Each eureka fires at most once per player per tech. Conditions are derived from
// observable game state so no extra counters are needed.
//
// Boost ≈ 40 % of the tech's science cost, rounded to the nearest integer.

import { citiesOf, unitsOf, type GameState, type Player } from "./state";
import { TECH_DEFS, UNIT_DEFS, isRanged, type TechId, type UnitTypeId } from "./content";
import { tileOwnerId } from "./territory";
import { isCoastalLand } from "./movement";
import { emitEureka } from "./turn-updates";

export interface EurekaDef {
  desc: string;
  boost: number;
}

export const EUREKA_DEFS: Partial<Record<TechId, EurekaDef>> = {
  // ---- Dawn ----------------------------------------------------------------
  fire_hardening:         { desc: "Win your first battle",             boost: 6  },
  hide_working:           { desc: "Win 2 battles",                     boost: 7  },
  animal_taming:          { desc: "Build a Pasture",                   boost: 8  },
  cultivation:            { desc: "Build a Farm",                      boost: 7  },
  ritual_burial:          { desc: "Accumulate 20 Faith",               boost: 6  },
  pottery_kiln:           { desc: "Grow a city to population 3",       boost: 10 },
  parley:                 { desc: "Meet another civilization",          boost: 6  },
  // ---- Copper / Bronze -----------------------------------------------------
  native_copper:          { desc: "Build a Mine",                      boost: 11 },
  smelting:               { desc: "Stockpile Copper or Tin",           boost: 14 },
  bronze_alloying:        { desc: "Win 3 battles",                     boost: 17 },
  the_wheel:              { desc: "Build a Road",                      boost: 12 },
  equestrian:             { desc: "Secure a Horses resource",          boost: 14 },
  masonry:                { desc: "Build a Quarry",                    boost: 14 },
  weaving:                { desc: "Build a Pasture or Plantation",     boost: 10 },
  composite_bow:          { desc: "Kill an enemy with a ranged unit",  boost: 15 },
  writing:                { desc: "Meet 2 civilizations",              boost: 14 },
  irrigation:             { desc: "Build 2 Farms",                     boost: 12 },
  sailcloth:              { desc: "Found a coastal city",              boost: 13 },
  chariotry:              { desc: "Have 2 Horses resources",           boost: 18 },
  phalanx:                { desc: "Field 3 melee units",               boost: 18 },
  maritime_foraging:      { desc: "Build a Fishery or Fishing Boats",  boost: 12 },
  // ---- Naval ---------------------------------------------------------------
  sailing:                { desc: "Train your first naval unit",       boost: 12 },
  shipbuilding:           { desc: "Own 2 naval units",                 boost: 18 },
  naval_architecture:     { desc: "Win a naval battle",                boost: 28 },
  optics:                 { desc: "Own 3 naval units",                 boost: 22 },
  astronomy:              { desc: "Build a Library in 2 cities",       boost: 32 },
  cartography:            { desc: "Own 4 naval units",                 boost: 36 },
  // ---- Iron / Classical ----------------------------------------------------
  iron_bloomery:          { desc: "Secure an Iron resource",           boost: 22 },
  carburizing:            { desc: "Train a Swordsman",                 boost: 29 },
  siegecraft:             { desc: "Capture an enemy city",             boost: 23 },
  torsion_engines:        { desc: "Own 2 siege units",                 boost: 33 },
  mathematics:            { desc: "Build a Library",                   boost: 24 },
  engineering:            { desc: "Build city Walls",                  boost: 26 },
  coinage:                { desc: "Establish a Trade Route",           boost: 20 },
  philosophy:             { desc: "Assign 2 Specialists",              boost: 22 },
  cavalry_doctrine:       { desc: "Field 3 cavalry units",             boost: 25 },
  horse_archery:          { desc: "Field cavalry and ranged units",    boost: 23 },
  crossbow:               { desc: "Field 3 ranged units",              boost: 26 },
  monumental_architecture:{ desc: "Complete a Wonder",                 boost: 28 },
  elephantry:             { desc: "Secure an Elephants resource",      boost: 26 },
  bridge_building:        { desc: "Build 3 Roads",                     boost: 18 },
  // ---- Intellectual --------------------------------------------------------
  scholasticism:          { desc: "Build a Library in 3 cities",       boost: 27 },
  aesthetics:             { desc: "Build an Amphitheater",             boost: 26 },
  theology:               { desc: "Found a Religion",                  boost: 26 },
  // ---- Gunpowder -----------------------------------------------------------
  gunpowder:              { desc: "Own 2 siege units",                 boost: 38 },
  firearms:               { desc: "Train a Hand Cannon",               boost: 44 },
};

// ---------------------------------------------------------------------------
// Condition helpers
// ---------------------------------------------------------------------------

function countImprovements(state: GameState, playerId: number, kind: string): number {
  let n = 0;
  for (const tile of state.map.tiles) {
    if (tile.improvement === kind && tileOwnerId(state, tile.col, tile.row) === playerId) n++;
  }
  return n;
}

function hasImprovement(state: GameState, playerId: number, kind: string): boolean {
  return countImprovements(state, playerId, kind) >= 1;
}

function hasBuilding(state: GameState, playerId: number, building: string): boolean {
  return citiesOf(state, playerId).some((c) => (c.buildings as string[]).includes(building));
}

function buildingCityCount(state: GameState, playerId: number, building: string): number {
  return citiesOf(state, playerId).filter((c) => (c.buildings as string[]).includes(building)).length;
}

function unitClassCount(state: GameState, playerId: number, cls: string): number {
  return unitsOf(state, playerId).filter(
    (u) => UNIT_DEFS[u.type as UnitTypeId]?.cls === cls,
  ).length;
}

function navalCount(state: GameState, playerId: number): number {
  return unitsOf(state, playerId).filter((u) => {
    const d = UNIT_DEFS[u.type as UnitTypeId];
    return d && (d.cls === "naval_melee" || d.cls === "naval_ranged");
  }).length;
}

function rangedCount(state: GameState, playerId: number): number {
  return unitsOf(state, playerId).filter((u) => {
    const d = UNIT_DEFS[u.type as UnitTypeId];
    return d && isRanged(d);
  }).length;
}

function hasUnit(state: GameState, playerId: number, type: UnitTypeId): boolean {
  return unitsOf(state, playerId).some((u) => u.type === type);
}

function totalSpecialists(state: GameState, playerId: number): number {
  return citiesOf(state, playerId).reduce((s, c) => s + c.specialists.length, 0);
}

function hasCoastalCity(state: GameState, playerId: number): boolean {
  return citiesOf(state, playerId).some((c) => isCoastalLand(state, c.col, c.row));
}

function hasCityWonder(state: GameState, playerId: number): boolean {
  return citiesOf(state, playerId).some((c) => c.wonders.length > 0);
}

// ---------------------------------------------------------------------------
// Core check function
// ---------------------------------------------------------------------------

/**
 * Check every unearned eureka condition for this player.
 * Called at the start of each player's turn (before advanceResearch) so the
 * science boost is applied immediately and may complete the current tech.
 */
export function checkEurekas(state: GameState, player: Player): void {
  if (!player.eurekaTriggered) player.eurekaTriggered = new Set();
  const pid = player.id;
  const res = player.resources;
  const battles = player.battlesWon ?? 0;

  const trigger = (techId: TechId, condition: boolean): void => {
    if (!condition) return;
    if (player.eurekaTriggered!.has(techId)) return;
    if (player.researched.has(techId)) return;
    const def = EUREKA_DEFS[techId];
    if (!def) return;
    player.eurekaTriggered!.add(techId);
    player.scienceProgress += def.boost;
    emitEureka(state, pid, TECH_DEFS[techId].name, def.desc, def.boost);
  };

  // ---- Dawn ----------------------------------------------------------------
  trigger("fire_hardening",    battles >= 1);
  trigger("hide_working",      battles >= 2);
  trigger("animal_taming",     hasImprovement(state, pid, "pasture"));
  trigger("cultivation",       hasImprovement(state, pid, "farm"));
  trigger("ritual_burial",     player.faith >= 20);
  trigger("pottery_kiln",      citiesOf(state, pid).some((c) => c.population >= 3));
  trigger("parley",            player.met.length >= 1);

  // ---- Copper / Bronze -----------------------------------------------------
  trigger("native_copper",     hasImprovement(state, pid, "mine"));
  trigger("smelting",          (res["copper"] ?? 0) >= 1 || (res["tin"] ?? 0) >= 1);
  trigger("bronze_alloying",   battles >= 3);
  trigger("the_wheel",         hasImprovement(state, pid, "road"));
  trigger("equestrian",        (res["horses"] ?? 0) >= 1);
  trigger("masonry",           hasImprovement(state, pid, "quarry"));
  trigger("weaving",           hasImprovement(state, pid, "pasture") || hasImprovement(state, pid, "plantation"));
  trigger("composite_bow",     battles >= 2 && rangedCount(state, pid) >= 1);
  trigger("writing",           player.met.length >= 2);
  trigger("irrigation",        countImprovements(state, pid, "farm") >= 2);
  trigger("sailcloth",         hasCoastalCity(state, pid));
  trigger("chariotry",         (res["horses"] ?? 0) >= 2);
  trigger("phalanx",           unitClassCount(state, pid, "melee") >= 3);
  trigger("maritime_foraging", hasImprovement(state, pid, "fishery") || hasImprovement(state, pid, "fishing_boats"));

  // ---- Naval ---------------------------------------------------------------
  trigger("sailing",           navalCount(state, pid) >= 1);
  trigger("shipbuilding",      navalCount(state, pid) >= 2);
  trigger("naval_architecture", battles >= 5 && navalCount(state, pid) >= 1);
  trigger("optics",            navalCount(state, pid) >= 3);
  trigger("astronomy",         buildingCityCount(state, pid, "library") >= 2);
  trigger("cartography",       navalCount(state, pid) >= 4);

  // ---- Iron / Classical ----------------------------------------------------
  trigger("iron_bloomery",     (res["iron"] ?? 0) >= 1);
  trigger("carburizing",       hasUnit(state, pid, "swordsman"));
  trigger("siegecraft",        (player.citiesCaptured ?? 0) >= 1);
  trigger("torsion_engines",   unitClassCount(state, pid, "siege") >= 2);
  trigger("mathematics",       hasBuilding(state, pid, "library"));
  trigger("engineering",       hasBuilding(state, pid, "walls"));
  trigger("coinage",           state.tradeRoutes.some((r) => r.ownerId === pid));
  trigger("philosophy",        totalSpecialists(state, pid) >= 2);
  trigger("cavalry_doctrine",  unitClassCount(state, pid, "cavalry") >= 3);
  trigger("horse_archery",     unitClassCount(state, pid, "cavalry") >= 2 && rangedCount(state, pid) >= 1);
  trigger("crossbow",          rangedCount(state, pid) >= 3);
  trigger("monumental_architecture", hasCityWonder(state, pid));
  trigger("elephantry",        (res["elephants"] ?? 0) >= 1);
  trigger("bridge_building",   countImprovements(state, pid, "road") >= 3);

  // ---- Intellectual --------------------------------------------------------
  trigger("scholasticism",     buildingCityCount(state, pid, "library") >= 3);
  trigger("aesthetics",        hasBuilding(state, pid, "amphitheater"));
  trigger("theology",          player.foundedReligionId !== undefined);

  // ---- Gunpowder -----------------------------------------------------------
  trigger("gunpowder",         unitClassCount(state, pid, "siege") >= 2);
  trigger("firearms",          hasUnit(state, pid, "hand_cannon"));
}
