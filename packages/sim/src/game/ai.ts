// Heuristic single-player AI. Pure TypeScript — runs ON THE USER'S MACHINE (in
// the browser for local games, or on the Bun server to fill slots). No network,
// no API, no model download. It plays a full turn for an AI civ by emitting the
// same validated Commands a human would, via applyCommand(..., playerId).
//
// (packages/ai defines an AiController interface so a learned on-device model —
// ONNX Runtime Web / TF.js in a Web Worker — could later replace this. For now
// this rules-based controller is the default and is plenty for a real opponent.)

import { axialDistance, getTile, offsetToAxial } from "@roc/shared";
import { applyCommand } from "./commands";
import { computeReachable, isNavalUnit } from "./movement";
import { computeAttackTargets, unitMaxHp, combatPreview, cityBombardTargets, cityBombardStrength, damageFrom, cityMaxHp } from "./combat";
import { abilityTargets, canUseAbility, unitAbilities } from "./abilities";
import { religionUnitKit, religionInstanceForDefId, cityMajorityFaith } from "./religion-units";
import { availableProduction, availableTechs, workableTiles } from "./economy";
import { adoptableCivics, researchableGovernmentsFor, switchableGovernments, slottableCivics, civicSlotCapacity, getCivic, getGovernment, governmentTier, CIVICS, civicLegal } from "./civs";
import { canFoundReligion, availableReligionNames, buyReligiousUnit, religiousUnitCost, availablePerks, canUpgradeReligion, nextTierRequirement, takenPerkIds } from "./religion";
import { availableLegendsForPlayer, canRecruitLegend } from "./legends";
import { canUseLeaderAbility } from "./leader-abilities";
import { canEstablishTradeRoute, tradeRouteDestinations } from "./trade";
import { aiConsiderDiplomacy, atWar, personalityOf, proposeDeal, relationBetween, attitudeScore, powerRatio, declareWar } from "./diplomacy";
import { availablePromotions } from "./combat";
import { rushCurrencies, canRushWork, canRushTraining, canRushCity, type RushCurrency } from "./rush";
import { availableTraining } from "./training";
import { BELIEFS, WONDER_DEFS, uniqueUnitForCiv, type CivEffects, type DiploPersonality } from "@roc/data";
import { availableSpecialists, workerSlots, SPECIALIST_DEFS, type SpecialistId } from "./specialists";
import {
  nextTierAt,
  worksOf,
  worksOfCity,
  workDiscipline,
  workDisciplines,
  canStartWonder,
  assignSpecialist,
  assignedSpecialistIds,
} from "./works";
import { offsetNeighbors } from "./movement";
import { RESOURCE_DEFS, resourceActive } from "./resources";
import { isPassableLand, isWaterTerrain, tileYields } from "./terrain";
import { BARBARIAN_DIPLOMACY_TECH, UNIT_DEFS, isMilitary, isNaval, isRanged, type TechId, type TrainingClass, type UnitTypeId } from "./content";
import { barbarianBribeCost, barbarianRecruitCost, canParleyWith, isBarbarianPacified } from "./bribery";
import { victoryProgress } from "./victory";
import {
  citiesOf,
  cityAt,
  playerById,
  unitAt,
  unitsOf,
  type City,
  type CityAutoFocus,
  type GameState,
  type Player,
  type ProductionItem,
  type Unit,
  type VictoryKind,
} from "./state";

// Growth/expansion-first ordering. Because units now cost population, a bigger,
// wider empire fuels everything (army, settlers, science, gold), so the AI beelines
// the food/economy/infrastructure techs before deepening its military and reaching
// for the late game. Anything not listed is researched after these, in tree order.
const TECH_PREFERENCE: TechId[] = [
  // Food & early growth
  "cultivation", "pottery_kiln", "animal_taming", "irrigation",
  // Foundations: tools, building, knowledge, wheels & coin
  "native_copper", "masonry", "writing", "the_wheel", "smelting", "bronze_alloying",
  "weaving", "coinage",
  // Culture, science & wealth infrastructure
  "monumental_architecture", "philosophy", "mathematics", "scholasticism", "aesthetics",
  // Seafaring (harbors, fishing, exploration)
  "sailing", "sailcloth", "optics", "maritime_foraging", "shipbuilding",
  // Core military
  "composite_bow", "phalanx", "equestrian", "iron_bloomery", "engineering",
  "carburizing", "siegecraft", "bridge_building", "cavalry_doctrine", "horse_archery",
  "crossbow", "chariotry", "torsion_engines", "elephantry",
  // Faith, late naval & the apex
  "ritual_burial", "theology", "naval_architecture", "astronomy", "cartography",
  "gunpowder", "firearms",
];

/** Techs that unlock or strengthen the military — beelined by warlike civs / in war. */
const MILITARY_TECHS = new Set<TechId>([
  "native_copper", "smelting", "bronze_alloying", "equestrian", "composite_bow",
  "phalanx", "iron_bloomery", "carburizing", "siegecraft", "cavalry_doctrine",
  "crossbow", "gunpowder", "firearms",
]);

/** Pick the next tech: a warlike civ (or one at war) rushes military tech first. */
function pickTech(techs: TechId[], p: DiploPersonality, atWarNow: boolean): TechId {
  if (atWarNow || p.aggression > 0.65) {
    const m = TECH_PREFERENCE.find((t) => techs.includes(t) && MILITARY_TECHS.has(t));
    if (m) return m;
  }
  return TECH_PREFERENCE.find((t) => techs.includes(t)) ?? techs[0]!;
}

/** Crude classification of a policy/belief effect bag for personality weighting. */
/** A personality- and war-state-weighted score for a bundle of effects. Cons are
 *  negative values in the same object and subtract naturally; conditional fields
 *  (war/peace/capital/home/religion) are discounted to their expected value the way
 *  the balance scorer does (docs/CIVICS §7.4, §9). Used to rank civics, governments,
 *  and religion perks alike. */
function effectScore(effects: CivEffects | undefined, p: DiploPersonality, atWarNow: boolean): number {
  if (!effects) return 0;
  const e = effects;
  const warMinded = atWarNow || p.aggression > 0.6;
  let v = 0;
  // ~0.1 pt per 1% of a weighted yield (science cheap in war, gold prized by the greedy).
  const yieldW = (k: string): number =>
    k === "science" ? (warMinded ? 0.6 : 1.4)
    : k === "gold" ? (p.greed > 0.6 ? 1.4 : 1)
    : k === "production" || k === "food" ? 1.2
    : k === "culture" ? 1.1
    : 1;
  const yields = (obj: Record<string, number | undefined> | undefined, disc: number): void => {
    if (!obj) return;
    for (const [k, val] of Object.entries(obj)) if (val) v += val * yieldW(k) * 0.1 * disc;
  };
  yields(e.yieldPercent, 1);
  yields(e.warYieldPercent, warMinded ? 0.6 : 0.15); // only worth it if you fight
  yields(e.peaceYieldPercent, warMinded ? 0.15 : 0.6);
  yields(e.capitalYieldPercent, 0.35); // one city out of many
  const combat = (n: number, disc = 1): void => { v += (warMinded ? 3 : 0.8) * n * 0.5 * disc; };
  if (e.allUnitCombat) combat(e.allUnitCombat);
  if (e.homeCombat) combat(e.homeCombat, 0.7);
  if (e.foreignCombat) combat(e.foreignCombat, warMinded ? 0.7 : 0.3);
  if (e.combatVsOtherReligion) combat(e.combatVsOtherReligion, 0.5);
  if (e.unitClassCombat) for (const val of Object.values(e.unitClassCombat)) combat(val, 0.6);
  if (e.meleeVsCityBonus) combat(e.meleeVsCityBonus, 0.5);
  if (e.cityDefenseBonus) v += e.cityDefenseBonus * 0.3;
  if (e.trainTimePercent) v += -e.trainTimePercent * (warMinded ? 0.06 : 0.02); // faster = good
  if (e.unitUpkeepPercent) v += -e.unitUpkeepPercent * 0.03; // cheaper = good
  if (e.militaryMaintenanceCostMultiplier) v += -(e.militaryMaintenanceCostMultiplier - 1) * 3;
  if (e.raidGoldPercent) v += e.raidGoldPercent * (warMinded ? 0.02 : 0.005);
  if (e.coastalRaidGoldPercent) v += e.coastalRaidGoldPercent * (warMinded ? 0.015 : 0.004);
  if (e.raidSciencePercent) v += e.raidSciencePercent * (warMinded ? 0.01 : 0.003);
  if (e.rushWithFaith || e.rushWithCulture) v += 2; // rushing is broadly powerful
  if (e.garrisonFreeUpkeep) v += 1;
  if (e.convertOnCapture) v += warMinded ? 1.5 : 0.3;
  if (e.tradeRouteCapacityBonus) v += e.tradeRouteCapacityBonus * (p.greed > 0.6 ? 1.2 : 0.8);
  if (e.tradeRouteGoldBonus) v += e.tradeRouteGoldBonus * 0.4;
  if (e.tradeRouteFaithBonus) v += e.tradeRouteFaithBonus * 0.3;
  if (e.enemyReligionPressurePercent) v += -e.enemyReligionPressurePercent * 0.02;
  if (e.startMoraleBonus) v += e.startMoraleBonus * 0.05;
  if (e.startXpBonus) v += e.startXpBonus * 0.05;
  if (e.trainingSlotsBonus) v += e.trainingSlotsBonus * (warMinded ? 1.5 : 0.6);
  if (e.cavalryMovementBonus) v += e.cavalryMovementBonus * (warMinded ? 1 : 0.4);
  if (e.navalMovementBonus) v += e.navalMovementBonus * 0.4;
  if (e.farmTileFoodBonus) v += e.farmTileFoodBonus * 1.2;
  if (e.faithOnKill) v += e.faithOnKill * (warMinded ? 0.5 : 0.2);
  if (e.cultureOnKill) v += e.cultureOnKill * (warMinded ? 0.5 : 0.2);
  if (e.homeHealBonus) v += e.homeHealBonus * 0.15;
  if (e.mountedHealPerTurn) v += e.mountedHealPerTurn * 0.1;
  if (e.ignoreRoughTerrain) v += warMinded ? 1 : 0.4;
  return v;
}

/** The value of holding a government: its own effects (doubled — always on) plus
 *  the best `slots` civics from its legal pool (docs/CIVICS §7.1). Higher-tier
 *  governments naturally win via more slots and stronger effects, but personality
 *  steers which lineage wins a tie. */
function governmentValue(govId: string, p: DiploPersonality, atWarNow: boolean): number {
  const g = getGovernment(govId);
  if (!g) return 0;
  let v = effectScore(g.effects, p, atWarNow) * 2;
  const pool = CIVICS.filter((c) => civicLegal(govId, c.id))
    .map((c) => effectScore(c.effects, p, atWarNow))
    .sort((a, b) => b - a)
    .slice(0, g.slots);
  for (const s of pool) v += Math.max(0, s);
  return v;
}

/** Order civics so the most useful fill the government's limited slots. */
function rankCivics(ids: string[], p: DiploPersonality, atWarNow: boolean): string[] {
  return [...ids].sort((a, b) =>
    effectScore(getCivic(b)?.effects as CivEffects, p, atWarNow) -
    effectScore(getCivic(a)?.effects as CivEffects, p, atWarNow));
}

/** The founding perk pick: the best-scoring TIER-1 perk no other faith claimed. */
function pickBeliefs(state: GameState, p: DiploPersonality): string[] {
  const taken = takenPerkIds(state);
  return BELIEFS
    .filter((b) => b.tier === 1 && !taken.has(b.id))
    .sort((a, b) => effectScore(b.effects as CivEffects, p, false) - effectScore(a.effects as CivEffects, p, false))
    .slice(0, 1)
    .map((b) => b.id);
}

/** Available religion perks ranked to the civ's temperament, best first. */
function rankPerks(perks: { id: string; effects: unknown }[], p: DiploPersonality): string[] {
  return [...perks]
    .sort((a, b) => effectScore(b.effects as CivEffects, p, false) - effectScore(a.effects as CivEffects, p, false))
    .map((b) => b.id);
}

/**
 * The victory this civ is steering toward. It starts from the civ's temperament
 * (warmongers conquer, the greedy trade, the peaceful build culture, the rest pursue
 * the science the AI naturally researches toward), then commits to whichever ENABLED
 * path it is genuinely furthest along once it has a real lead — so a civ that lucks into
 * a culture or religious edge presses it. Recomputed each turn (cheap, and it tracks the
 * game state); only enabled decisive paths are ever chosen.
 */
export function aiVictoryFocus(state: GameState, player: Player, p: DiploPersonality): VictoryKind {
  const prog = victoryProgress(state, player.id).filter((e) => e.enabled && e.kind !== "score");
  // No decisive victory is enabled (a score-only game) → no win to race for; "score" is a
  // neutral focus that adds no bias, so the AI just plays balanced. This is also how the
  // AI respects the host's victory toggles: every path it considers comes from `prog`,
  // whose entries are flagged enabled/disabled straight from `state.enabledVictories`.
  if (prog.length === 0) return "score";
  const has = (k: VictoryKind) => prog.some((e) => e.kind === k);
  let focus: VictoryKind =
    p.aggression > 0.65 ? "domination"
    : p.greed > 0.6 ? "economic"
    : p.aggression < 0.4 ? "culture"
    : "science";
  if (!has(focus)) focus = has("science") ? "science" : (prog[0]!.kind as VictoryKind);
  // Commit to the BUILDER path we're clearly furthest along (progress drifts slowly, so
  // this is stable). Domination is excluded from this override: its "capitals held / total"
  // reads ~100% before rivals have founded their capitals, which would mislead the AI into
  // thinking it's winning a conquest it isn't — so a conquest focus stays personality-driven.
  const lead = prog
    .filter((e) => e.kind !== "domination")
    .sort((a, b) => b.progress - a.progress)[0];
  if (lead && lead.progress >= 0.45) focus = lead.kind as VictoryKind;
  return focus;
}

/** Personality- and victory-focus-weighted desirability of a wonder's effect. The focus
 *  band makes a civ racing a given victory grab the wonders that feed it (a culture civ
 *  prizes culture/tourism wonders, a science civ science ones, and so on). */
function wonderScore(effect: unknown, p: DiploPersonality, focus: VictoryKind): number {
  const s = JSON.stringify(effect ?? {});
  let v = 1;
  if (/production|food/.test(s)) v += 2;
  if (/science|culture/.test(s)) v += p.aggression < 0.55 ? 2 : 1;
  if (/combat|strength|unit|military|defense/.test(s)) v += p.aggression > 0.6 ? 3 : 0;
  if (/gold/.test(s)) v += p.greed > 0.6 ? 2 : 0;
  // The civ's win condition strongly pulls its wonder picks toward the matching yield.
  if (focus === "culture" && /culture|tourism/.test(s)) v += 5;
  if (focus === "science" && /science/.test(s)) v += 5;
  if (focus === "economic" && /gold|trade/.test(s)) v += 5;
  if (focus === "religious" && /faith|religion/.test(s)) v += 5;
  if (focus === "domination" && /combat|strength|military|defense/.test(s)) v += 5;
  return v;
}

function ax(o: { col: number; row: number }) {
  return offsetToAxial(o);
}

/**
 * A tile the AI must NOT trespass into during peaceful movement: it belongs to another
 * civ we're at peace with and lack open borders with. For a human, stepping into foreign
 * land is a deliberate act of war (the client makes you confirm and declares it); the AI
 * honours the same rule by simply routing around such territory — it only enters once it
 * has chosen war (see aiSeekConquest) or earned open borders. Unlike the sim's met-gated
 * border check this also avoids the land of civs not yet formally met, so the AI never
 * blunders across a visible border uninvited.
 */
export function aiPeaceBlocked(state: GameState, pid: number, col: number, row: number): boolean {
  const tile = getTile(state.map, col, row);
  if (!tile || tile.ownerCityId === undefined) return false;
  const city = state.cities.get(tile.ownerCityId);
  if (!city || city.ownerId === pid) return false;
  const owner = playerById(state, city.ownerId);
  if (!owner || owner.isBarbarian) return false;
  if (atWar(state, pid, city.ownerId)) return false; // at war → free to march in
  return !relationBetween(state, pid, city.ownerId)?.openBorders; // open borders → welcome
}

/** Move a unit one step toward (goalCol,goalRow) if it makes progress. */
function stepToward(state: GameState, unit: Unit, goalCol: number, goalRow: number, pid: number): boolean {
  const player = playerById(state, pid);
  const here = getTile(state.map, unit.col, unit.row);
  const canEmbark =
    !isNavalUnit(unit) &&
    !unit.embarked &&
    !!player?.researched.has("sailing") &&
    !!here &&
    isPassableLand(here.terrain);
  if (
    canEmbark &&
    isCoastalTile(state, unit.col, unit.row) &&
    !sameLandmass(state, { col: unit.col, row: unit.row }, { col: goalCol, row: goalRow }) &&
    tryNavalStep(state, unit, goalCol, goalRow, pid)
  ) {
    return true;
  }

  const reach = computeReachable(state, unit);
  if (reach.size === 0) return false;
  const goal = ax({ col: goalCol, row: goalRow });
  let bestKey: string | null = null;
  let bestD = axialDistance(ax(unit), goal);
  for (const key of reach.keys()) {
    const [c, r] = key.split(",").map(Number) as [number, number];
    if (aiPeaceBlocked(state, pid, c, r)) continue; // don't trespass into peaceful foreign land
    const d = axialDistance(ax({ col: c, row: r }), goal);
    if (d < bestD) {
      bestD = d;
      bestKey = key;
    }
  }
  if (!bestKey) return tryNavalStep(state, unit, goalCol, goalRow, pid); // blocked on land → try the sea
  const [c, r] = bestKey.split(",").map(Number) as [number, number];
  return applyCommand(state, { type: "move", unitId: unit.id, col: c, row: r }, pid).ok;
}

/**
 * When a land march stalls, cross water: embark from coastal land onto the sea, or
 * disembark back to land — but only when the hop actually gets us closer to the
 * goal. (Open-water movement itself is handled by the normal `move` path, since an
 * embarked unit is already water-domain.) Lets the AI reach islands and over-sea foes.
 */
function tryNavalStep(state: GameState, unit: Unit, goalCol: number, goalRow: number, pid: number): boolean {
  const goal = ax({ col: goalCol, row: goalRow });
  const curD = axialDistance(ax(unit), goal);
  const here = getTile(state.map, unit.col, unit.row);
  if (!here) return false;
  const occupied = (col: number, row: number) =>
    [...state.units.values()].some((u) => u.id !== unit.id && u.col === col && u.row === row);

  if (unit.embarked) {
    // Step ashore where it brings us nearest the goal.
    let best: { col: number; row: number } | null = null;
    let bestD = curD;
    for (const n of offsetNeighbors(state.map, unit.col, unit.row)) {
      const t = getTile(state.map, n.col, n.row);
      if (!t || isWaterTerrain(t.terrain) || !isPassableLand(t.terrain) || occupied(n.col, n.row)) continue;
      if (aiPeaceBlocked(state, pid, n.col, n.row)) continue; // don't wade ashore into foreign land
      const d = axialDistance(ax(n), goal);
      if (d < bestD) {
        bestD = d;
        best = n;
      }
    }
    if (best) return applyCommand(state, { type: "disembark", unitId: unit.id, col: best.col, row: best.row }, pid).ok;
    return false;
  }

  // On land: put to sea toward the goal (embark validates that we're coastal).
  if (isWaterTerrain(here.terrain)) return false;
  let best: { col: number; row: number } | null = null;
  let bestD = curD;
  for (const n of offsetNeighbors(state.map, unit.col, unit.row)) {
    const t = getTile(state.map, n.col, n.row);
    if (!t || !isWaterTerrain(t.terrain) || occupied(n.col, n.row)) continue;
    if (aiPeaceBlocked(state, pid, n.col, n.row)) continue; // don't put to sea into foreign waters
    const d = axialDistance(ax(n), goal);
    if (d < bestD) {
      bestD = d;
      best = n;
    }
  }
  if (best) return applyCommand(state, { type: "embark", unitId: unit.id, col: best.col, row: best.row }, pid).ok;
  return false;
}

function isCoastalTile(state: GameState, col: number, row: number): boolean {
  for (const n of offsetNeighbors(state.map, col, row)) {
    const t = getTile(state.map, n.col, n.row);
    if (t && isWaterTerrain(t.terrain)) return true;
  }
  return false;
}

/** Whether two land tiles connect without crossing water (same continent / island). */
function sameLandmass(
  state: GameState,
  from: { col: number; row: number },
  to: { col: number; row: number },
): boolean {
  const start = getTile(state.map, from.col, from.row);
  const end = getTile(state.map, to.col, to.row);
  if (!start || !end || !isPassableLand(start.terrain) || !isPassableLand(end.terrain)) return false;
  if (from.col === to.col && from.row === to.row) return true;
  const seen = new Set<string>([`${from.col},${from.row}`]);
  const q: { col: number; row: number }[] = [from];
  while (q.length) {
    const cur = q.shift()!;
    if (cur.col === to.col && cur.row === to.row) return true;
    for (const n of offsetNeighbors(state.map, cur.col, cur.row)) {
      const k = `${n.col},${n.row}`;
      if (seen.has(k)) continue;
      const t = getTile(state.map, n.col, n.row);
      if (!t || !isPassableLand(t.terrain)) continue;
      seen.add(k);
      q.push(n);
    }
  }
  return false;
}

/** Capital (or first city) — anchor for "home continent" checks. */
function homeAnchor(state: GameState, pid: number): { col: number; row: number } | null {
  const capital = citiesOf(state, pid).find((c) => c.isCapital);
  const city = capital ?? citiesOf(state, pid)[0];
  return city ? { col: city.col, row: city.row } : null;
}

/** True when this civ holds a clear majority of cities on its home landmass. */
function dominatesHomeContinent(state: GameState, pid: number): boolean {
  const anchor = homeAnchor(state, pid);
  if (!anchor) return false;
  let ours = 0;
  let total = 0;
  for (const c of state.cities.values()) {
    if (!sameLandmass(state, anchor, c)) continue;
    total++;
    if (c.ownerId === pid) ours++;
  }
  return total >= 3 && ours / total >= 0.55;
}

/** Shipyard online and a small fleet ready to ferry troops overseas. */
function navalInvasionReady(state: GameState, player: Player): boolean {
  if (!player.researched.has("sailing")) return false;
  const hasShipyard = citiesOf(state, player.id).some((c) => c.training.shipyard);
  const naval = unitsOf(state, player.id).filter((u) => isNaval(UNIT_DEFS[u.type])).length;
  return hasShipyard && naval >= 2;
}

/** Best power edge over rivals we're currently at war with (>1 = winning). */
function conquestLeadRatio(state: GameState, pid: number): number {
  const player = playerById(state, pid);
  if (!player) return 1;
  let best = 1;
  for (const id of player.atWar) {
    if (playerById(state, id)?.isBarbarian) continue;
    best = Math.max(best, powerRatio(state, pid, id));
  }
  return best;
}

/** A friendly city that actually needs a defender — not a distant skirmish while we're crushing the war. */
function cityNeedsRelief(state: GameState, pid: number, city: City, pushOffense: boolean): boolean {
  let threats = 0;
  for (const e of state.units.values()) {
    if (!isHostile(state, pid, e.ownerId) || !isMilitary(e.type)) continue;
    if (axialDistance(ax(city), ax(e)) > 3) continue;
    threats++;
  }
  if (threats === 0) return false;
  if (pushOffense && threats < 2 && city.hp > cityMaxHp(city) * 0.55) return false;
  return true;
}

/** Barbarians are always fair game; civs only when we're actually at war. */
function isHostile(state: GameState, pid: number, otherId: number): boolean {
  if (otherId === pid) return false;
  if (playerById(state, otherId)?.isBarbarian) return true;
  return atWar(state, pid, otherId);
}

function nearestHostile(state: GameState, unit: Unit, pid: number): { col: number; row: number } | null {
  const me = playerById(state, pid);
  if (!me) return null;
  let best: { col: number; row: number } | null = null;
  let bestD = Infinity;
  const from = ax(unit);
  const consider = (col: number, row: number, owner: number) => {
    if (!isHostile(state, pid, owner)) return;
    const d = axialDistance(from, ax({ col, row }));
    if (d < bestD) {
      bestD = d;
      best = { col, row };
    }
  };
  for (const u of state.units.values()) consider(u.col, u.row, u.ownerId);
  for (const c of state.cities.values()) consider(c.col, c.row, c.ownerId);
  return best;
}

/** Friendly battle-ready military units within `radius` of (col,row), including self. */
function friendlyMilitaryNear(state: GameState, pid: number, col: number, row: number, radius: number): number {
  const at = ax({ col, row });
  let n = 0;
  for (const u of state.units.values()) {
    if (u.ownerId !== pid || !isMilitary(u.type)) continue;
    if (axialDistance(at, ax(u)) <= radius) n++;
  }
  return n;
}

/** Nearest hostile city — the objective an army at war should converge on. */
function nearestHostileCity(state: GameState, unit: Unit, pid: number): { col: number; row: number } | null {
  const anchor = homeAnchor(state, pid);
  const overseas = dominatesHomeContinent(state, pid);
  let best: { col: number; row: number } | null = null;
  let bestScore = -Infinity;
  const from = ax(unit);
  for (const c of state.cities.values()) {
    if (!isHostile(state, pid, c.ownerId)) continue;
    const d = axialDistance(from, ax(c));
    let score = -d;
    if (c.isCapital) score += 10;
    if (c.hp < cityMaxHp(c) * 0.65) score += 6;
    if (overseas && anchor && !sameLandmass(state, anchor, c)) score += 4;
    if (score > bestScore) {
      bestScore = score;
      best = { col: c.col, row: c.row };
    }
  }
  return best;
}

/** Nearest land tile this player hasn't explored yet — a scouting goal. */
function nearestUnexplored(state: GameState, unit: Unit, pid: number): { col: number; row: number } | null {
  const me = playerById(state, pid);
  if (!me) return null;
  let best: { col: number; row: number } | null = null;
  let bestD = Infinity;
  const from = ax(unit);
  for (let row = 0; row < state.map.rows; row++) {
    for (let col = 0; col < state.map.cols; col++) {
      if (me.explored.has(`${col},${row}`)) continue;
      const tile = getTile(state.map, col, row);
      if (!tile || !isPassableLand(tile.terrain)) continue;
      const d = axialDistance(from, ax({ col, row }));
      if (d < bestD) {
        bestD = d;
        best = { col, row };
      }
    }
  }
  return best;
}

/**
 * Nearest map feature of `kind` this player has already discovered. Tribal villages
 * hand any unit that steps on them a free perk (tech/gold/units/morale…); barbarian
 * camps are cleared by a military unit for gold and, crucially, to shut off the
 * raider spawns. We only target tiles we've explored, so the AI hunts what it has
 * legitimately found rather than cheating with knowledge of the fogged map.
 */
function nearestFeature(
  state: GameState,
  unit: Unit,
  pid: number,
  kind: "village" | "barb_camp",
): { col: number; row: number } | null {
  const me = playerById(state, pid);
  if (!me) return null;
  let best: { col: number; row: number } | null = null;
  let bestD = Infinity;
  const from = ax(unit);
  for (const t of state.map.tiles) {
    if (t.feature !== kind) continue;
    if (!me.explored.has(`${t.col},${t.row}`)) continue;
    const d = axialDistance(from, ax({ col: t.col, row: t.row }));
    if (d < bestD) {
      bestD = d;
      best = { col: t.col, row: t.row };
    }
  }
  return best;
}

/** Nearest discovered tribal village within `maxDist` (Infinity = any). */
function nearestVillage(
  state: GameState,
  unit: Unit,
  pid: number,
  maxDist = Infinity,
): { col: number; row: number } | null {
  const village = nearestFeature(state, unit, pid, "village");
  if (!village) return null;
  if (axialDistance(ax(unit), ax(village)) > maxDist) return null;
  return village;
}

/** March on a discovered village — scouts and any military unit can collect it. */
function aiHuntVillage(state: GameState, unit: Unit, pid: number, maxDist = 24): boolean {
  const village = nearestVillage(state, unit, pid, maxDist);
  if (!village) return false;
  stepToward(state, unit, village.col, village.row, pid);
  return true;
}

/**
 * Race for map features. Villages are strongly preferred — they're one-shot rewards
 * any rival can steal — and only yield to a camp when it's dramatically closer.
 * During war, only detour for villages/camps that are a short hop away.
 */
function aiHuntMapFeatures(state: GameState, unit: Unit, pid: number): boolean {
  const atWar = (playerById(state, pid)?.atWar.length ?? 0) > 0;
  const village = nearestFeature(state, unit, pid, "village");
  const camp = nearestFeature(state, unit, pid, "barb_camp");
  if (!village && !camp) return false;

  const dV = village ? axialDistance(ax(unit), ax(village)) : Infinity;
  const dC = camp ? axialDistance(ax(unit), ax(camp)) : Infinity;
  const villageMax = atWar ? 10 : 24;
  const villageOk = village !== null && dV <= villageMax;
  const campOk = camp !== null && (!atWar || dC <= 12);

  let goal: { col: number; row: number } | null = null;
  if (villageOk && campOk) {
    // Prefer the village unless the camp is 3+ tiles closer — camps can wait.
    goal = dC + 3 < dV ? camp : village;
  } else if (villageOk) {
    goal = village;
  } else if (campOk) {
    goal = camp;
  }
  if (!goal) return false;
  stepToward(state, unit, goal.col, goal.row, pid);
  return true;
}

/** When not at war, wander toward the unexplored frontier instead of idling. */
function aiExplore(state: GameState, unit: Unit, pid: number): void {
  const goal = nearestUnexplored(state, unit, pid);
  if (goal) stepToward(state, unit, goal.col, goal.row, pid);
}

// ---- production choice ---------------------------------------------------

/** Is a hostile (war enemy or barbarian) within `radius` of THIS city specifically? */
function hostileNearCity(state: GameState, pid: number, city: City, radius: number): boolean {
  for (const u of state.units.values()) {
    if (isHostile(state, pid, u.ownerId) && axialDistance(ax(city), ax(u)) <= radius) return true;
  }
  return false;
}

/** Is a hostile (war enemy or barbarian) lurking near any of the player's cities? */
function hostileNearCities(state: GameState, pid: number): boolean {
  return citiesOf(state, pid).some((c) => hostileNearCity(state, pid, c, 4));
}

/** A city with open water in its inner ring — values a harbor and seafaring. */
function isCoastalCity(state: GameState, city: City): boolean {
  for (const n of offsetNeighbors(state.map, city.col, city.row)) {
    const t = getTile(state.map, n.col, n.row);
    if (t && isWaterTerrain(t.terrain)) return true;
  }
  return false;
}

/** Fraction of the land map this player has explored (drives early scouting). */
function exploredFraction(state: GameState, pid: number): number {
  const me = playerById(state, pid);
  if (!me) return 1;
  return me.explored.size / Math.max(1, state.map.cols * state.map.rows);
}

/** How many cities this civ aims to settle before consolidating. Wide empires win
 *  (every city adds population to spend on army, settlers, science and gold), so
 *  the AI now expands far more ambitiously — `findSettleSpot` caps it by real land. */
function targetCityCount(p: DiploPersonality): number {
  if (p.aggression > 0.7) return 14; // warmongers settle a strong core, then conquer the rest
  if (p.aggression < 0.45) return 26; // peaceful builders blanket the map
  return 20;
}

/**
 * Construction chooser: what a city should BUILD (units are trained separately, see
 * aiTrainUnits). Covers training-building tiers, infrastructure, projects.
 */
function chooseConstruction(state: GameState, player: Player, city: City, p: DiploPersonality, focus: VictoryKind): ProductionItem | null {
  const opts = availableProduction(state, player, city);
  const atWar = player.atWar.length > 0;
  const warMinded = atWar || p.aggression > 0.6;
  const coastal = isCoastalCity(state, city);
  const overseasPush = dominatesHomeContinent(state, player.id) && (warMinded || focus === "domination");

  const findBuilding = (id: string): ProductionItem | null =>
    opts.find((o) => o.item.kind === "building" && o.item.id === id)?.item ?? null;
  const findTraining = (fam: TrainingClass): ProductionItem | null =>
    opts.find((o) => o.item.kind === "trainingBuilding" && o.item.family === fam)?.item ?? null;

  // 1. A Barracks first so the city can train melee defenders at all.
  if (!city.training.barracks) { const b = findTraining("barracks"); if (b) return b; }
  // Coastal cities raise a shipyard early so the empire can reach other landmasses.
  if (coastal && !city.training.shipyard) { const s = findTraining("shipyard"); if (s) return s; }
  if (overseasPush && coastal && !city.training.siege_workshop) { const sw = findTraining("siege_workshop"); if (sw) return sw; }
  if (warMinded && !city.training.archery_range) { const a = findTraining("archery_range"); if (a) return a; }
  if (warMinded && !city.training.stable) { const s = findTraining("stable"); if (s) return s; }

  // 2. Economy / infrastructure buildings (skips any already built / not unlocked).
  // Growth first (a Granary feeds bigger cities → more pop for everything), then the
  // commerce/science/culture core, including the Bank and Museum that drive the
  // economic and culture victories.
  const order: string[] = ["granary", "workshop", "market", "library"];
  if (coastal) order.unshift("harbor");
  if (warMinded) order.unshift("walls"); // fortify the frontier before it's tested
  if (player.gold <= 0) order.unshift("market"); // prioritise income when broke
  // The civ's victory focus pulls its win-condition buildings to the front of the queue:
  // commerce for an economic hegemony, culture buildings for tourism, science buildings
  // for the Great Endeavor, shrines/temples for a religious crusade.
  const focusBuildings: Partial<Record<VictoryKind, string[]>> = {
    economic: ["market", "bank", "harbor"],
    culture: ["amphitheater", "monument", "museum", "temple"],
    science: ["library", "academy"],
    religious: ["shrine", "temple"],
  };
  for (const id of [...(focusBuildings[focus] ?? [])].reverse()) order.unshift(id);
  order.push(
    "forge", "bank", "monument", "amphitheater", "academy", "museum",
    "aqueduct", "temple", "shrine", "walls", "lighthouse",
  );
  const seen = new Set<string>();
  for (const id of order) {
    if (seen.has(id)) continue;
    seen.add(id);
    const b = findBuilding(id);
    if (b) return b;
  }

  // 3. Upgrade training buildings to improve army quality (war-minded first).
  const famOrder: TrainingClass[] = warMinded
    ? ["barracks", "archery_range", "stable", "siege_workshop", "shipyard"]
    : ["barracks", "stable", "archery_range", "siege_workshop", "shipyard"];
  for (const fam of famOrder) { const up = findTraining(fam); if (up) return up; }

  // 4. Broke and nothing economic left → mint coin.
  if (player.gold < 0) {
    const coin = opts.find((o) => o.item.kind === "project" && o.item.id === "coinage")?.item;
    if (coin) return coin;
  }
  // 5. Any remaining building, else any project.
  return opts.find((o) => o.item.kind === "building")?.item
    ?? opts.find((o) => o.item.kind === "project")?.item
    ?? null;
}

/** Highest-strength naval unit the city can currently train, or null. */
function bestTrainableNaval(trainable: UnitTypeId[], civId?: string): UnitTypeId | null {
  const score = (t: UnitTypeId): number => {
    const def = UNIT_DEFS[t];
    const bonus = civId ? (uniqueUnitForCiv(civId, t)?.bonus ?? 0) : 0;
    return Math.max(def.strength, def.rangedStrength ?? 0) + bonus + (def.oceanGoing ? 2 : 0);
  };
  return trainable
    .filter((t) => isNaval(UNIT_DEFS[t]))
    .sort((a, b) => score(b) - score(a))[0] ?? null;
}

/** Highest-strength military unit the city can currently train, or null. */
function bestTrainableMilitary(trainable: UnitTypeId[], civId?: string, preferRanged = false): UnitTypeId | null {
  const score = (t: UnitTypeId): number => {
    const def = UNIT_DEFS[t];
    const bonus = civId ? (uniqueUnitForCiv(civId, t)?.bonus ?? 0) : 0;
    const melee = def.strength + bonus;
    const ranged = (def.rangedStrength ?? 0) + bonus;
    return preferRanged ? Math.max(melee, ranged * 1.05) : melee;
  };
  return trainable
    .filter((t) => isMilitary(t))
    .sort((a, b) => score(b) - score(a))[0] ?? null;
}

/**
 * Training chooser: spend spare citizens on units. Civilians (scout/settler/trader)
 * and military are all trained here now (each costs a population point). Paces itself
 * by keeping some citizens working unless under threat.
 */
function aiTrainUnits(state: GameState, player: Player, city: City, p: DiploPersonality, escortShortfall = false): void {
  const trainable = availableTraining(state, player, city);
  const units = unitsOf(state, player.id);
  const has = (t: string) => units.some((u) => u.type === t);
  const cityCount = citiesOf(state, player.id).length;
  const settlersOut = units.filter((u) => u.type === "settler").length;
  const settlersPipeline = settlersInPipeline(state, player.id);
  const milCount = units.filter((u) => isMilitary(u.type)).length;
  // Threat is LOCAL, not empire-wide: a city pauses its own expansion only if an enemy
  // is right on top of it. Two coarser flags used to freeze the WHOLE empire's growth —
  // a single roaming barbarian near any city, and (worse) merely *being at war* — which
  // is why an AI stuck in a stalemate war it can't end would stop settling entirely and
  // wither. Now safe backline cities keep expanding while the front does the fighting.
  const localThreat = hostileNearCity(state, player.id, city, 2);
  const atWar = player.atWar.length > 0;
  const expanding = !localThreat && cityCount + settlersOut < targetCityCount(p);
  const settlersWanted = maxSettlersWanted(cityCount, targetCityCount(p));
  const canBuildSettler =
    expanding &&
    settlersPipeline < settlersWanted &&
    (exploredFraction(state, player.id) < 0.85 || hasSettleableLand(state, player.id));
  // Opening play: get the lone capital's first settler out the door immediately — it
  // founds a cheap, safe second city while the starting Warriors screen it. We let the
  // capital dip to a single citizen for this one settler (it regrows once it leaves);
  // afterwards settlers come from the healthier pop-3 gate so cities keep growing rather
  // than freezing into a swarm of fragile pop-1 hamlets.
  const openingSettler = canBuildSettler && cityCount <= 1 && settlersOut === 0;

  const tryTrain = (type: UnitTypeId): boolean =>
    trainable.includes(type) &&
    applyCommand(state, { type: "startTraining", cityId: city.id, unit: type }, player.id).ok;

  // Don't drain a city below this many citizens just to make units (relaxed under threat
  // and for that all-important opening settler).
  const keepPop = localThreat || openingSettler ? 1 : 2;
  if (city.population <= keepPop) return;

  // The opening settler takes precedence over the rest — beeline the second city.
  if (openingSettler && city.population >= 2 && tryTrain("settler")) return;
  // Civilians: a scout early (we usually start with one), a trader to link cities. Note
  // expansion continues even during a distant war — safe cities keep settling rather than
  // freezing the whole empire; the army is raised by the frontier and by maxed-out cities.
  if (!localThreat && exploredFraction(state, player.id) < 0.7) {
    const scouts = units.filter((u) => u.type === "scout").length;
    if (scouts < 2 && tryTrain("scout")) return;
  }
  // Expand: a safe city below the empire's target builds settlers from pop 3 (dropping
  // to 2, so it keeps growing). Cap how many are out or in muster so they don't pile up
  // when the map is crowded and can't find a legal site.
  if (canBuildSettler && city.population >= 3 && tryTrain("settler")) return;
  // Keep a trader heading out whenever we have fewer routes than cities (links the
  // empire and, with open borders, opens lucrative international trade).
  const routeCount = state.tradeRoutes.filter((r) => r.ownerId === player.id).length;
  if (!localThreat && cityCount >= 2 && !has("trader") && routeCount < cityCount && tryTrain("trader")) return;

  const coastal = isCoastalCity(state, city);
  const overseasPush = dominatesHomeContinent(state, player.id);
  const navalCount = units.filter((u) => isNaval(UNIT_DEFS[u.type])).length;
  const desiredNaval = overseasPush && player.researched.has("sailing")
    ? Math.max(3, Math.ceil(cityCount * 0.85))
    : atWar || p.aggression > 0.55
      ? Math.max(2, Math.ceil(cityCount * 0.75))
      : Math.max(1, Math.ceil(cityCount / 2));
  if (coastal && city.training.shipyard && player.researched.has("sailing") && navalCount < desiredNaval) {
    const naval = bestTrainableNaval(trainable, player.civId);
    if (naval && tryTrain(naval)) return;
  }

  // Military: a war footing when fighting or locally menaced, else a peacetime garrison
  // that scales with the empire (warlike civs hold a bigger host so they can threaten
  // neighbours, not just defend). Cities still expanding above don't reach here, so the
  // army is mustered by frontier cities and by those that have hit the expansion target.
  const desired = ((atWar || localThreat)
    ? cityCount * 2 + 2
    : Math.max(cityCount + (p.aggression > 0.6 ? 3 : 2), 4)) + (escortShortfall ? 2 : 0);
  if (milCount < desired) {
    const type = bestTrainableMilitary(trainable, player.civId, atWar || localThreat);
    if (type) tryTrain(type);
  }
}

// ---- per-unit behaviour --------------------------------------------------

/** Quality of a tile as a city site: food/production, fresh water, coast, nearby resources. */
function settleScore(state: GameState, col: number, row: number): number {
  const tile = getTile(state.map, col, row);
  if (!tile || !isPassableLand(tile.terrain)) return -Infinity;
  const y = tileYields(tile);
  let s = y.food * 2 + y.production;
  if (tile.river || tile.riverLake) s += 5; // fresh water is prime real estate
  let coastal = false;
  for (const n of offsetNeighbors(state.map, col, row)) {
    const t = getTile(state.map, n.col, n.row);
    if (!t) continue;
    if (isWaterTerrain(t.terrain)) coastal = true;
    if (t.resource) s += 3; // a resource in the first ring
  }
  if (coastal) s += 3;
  // A second-ring sweep for more resources to work later.
  for (let dr = -2; dr <= 2; dr++) {
    for (let dc = -2; dc <= 2; dc++) {
      const t = getTile(state.map, col + dc, row + dr);
      if (t?.resource) s += 1;
    }
  }
  return s;
}

/** Tiles the AI KNOWS hold a barbarian threat: a discovered camp, or a barbarian band
 *  standing on a tile it has explored. Gated on `explored` so the AI plans around the
 *  raiders it has actually seen, not ones hidden in the fog (no omniscient routing). */
function knownBarbThreats(state: GameState, pid: number): { col: number; row: number }[] {
  const me = playerById(state, pid);
  if (!me) return [];
  const out: { col: number; row: number }[] = [];
  for (const u of state.units.values()) {
    if (!playerById(state, u.ownerId)?.isBarbarian) continue;
    if (me.explored.has(`${u.col},${u.row}`)) out.push({ col: u.col, row: u.row });
  }
  for (const t of state.map.tiles) {
    if (t.feature === "barb_camp" && me.explored.has(`${t.col},${t.row}`)) out.push({ col: t.col, row: t.row });
  }
  return out;
}

/** A chosen city site plus whether it (and its approach) looks clear of known raiders. */
export interface SettlePlan {
  col: number;
  row: number;
  safe: boolean;
}

/** Must match `MIN_CITY_DISTANCE` in commands.ts — founding fails closer than this. */
const SETTLE_MIN_CITY_DISTANCE = 3;
/** How close a known barbarian threat may be before a site counts as "exposed". */
const SETTLE_DANGER_RADIUS = 3;
/** Local search radius before falling back to empire-wide explored land. */
const SETTLE_LOCAL_RADIUS = 6;
/** A safe site is taken over the best one as long as it's within this much quality. */
const SETTLE_SAFE_MARGIN = 6;

function isSettleCandidate(
  state: GameState,
  col: number,
  row: number,
  unitId: number,
  reserved?: Set<string>,
): boolean {
  const key = `${col},${row}`;
  if (reserved?.has(key)) return false;
  const tile = getTile(state.map, col, row);
  if (!tile || !isPassableLand(tile.terrain)) return false;
  if (cityAt(state, col, row)) return false;
  const here = ax({ col, row });
  for (const c of state.cities.values()) {
    if (axialDistance(here, ax(c)) < SETTLE_MIN_CITY_DISTANCE) return false;
  }
  if (unitId >= 0) {
    const occ = unitAt(state, col, row);
    if (occ && occ.id !== unitId) return false;
  }
  return true;
}

/** Any explored tile where a city could still be founded (ignores friendly units standing on it). */
function hasSettleableLand(state: GameState, pid: number, reserved?: Set<string>): boolean {
  const me = playerById(state, pid);
  if (!me) return false;
  for (const t of state.map.tiles) {
    if (!me.explored.has(`${t.col},${t.row}`)) continue;
    if (isSettleCandidate(state, t.col, t.row, -1, reserved)) return true;
  }
  return false;
}

function settlersInPipeline(state: GameState, pid: number): number {
  let n = unitsOf(state, pid).filter((u) => u.type === "settler").length;
  for (const c of citiesOf(state, pid)) {
    n += c.trainingQueue.filter((o) => o.unit === "settler").length;
  }
  return n;
}

function maxSettlersWanted(cityCount: number, target: number): number {
  const room = target - cityCount;
  if (room <= 0) return 0;
  return Math.max(1, Math.min(3, room));
}

function finalizeSettlePlan(
  state: GameState,
  pid: number,
  best: { col: number; row: number },
  bestValue: number,
  safeBest: { col: number; row: number } | null,
  safeBestValue: number,
): SettlePlan {
  const threats = knownBarbThreats(state, pid);
  const exposed = (col: number, row: number) =>
    threats.some((t) => axialDistance(ax({ col, row }), ax(t)) <= SETTLE_DANGER_RADIUS);
  if (safeBest && safeBestValue >= bestValue - SETTLE_SAFE_MARGIN) {
    return { ...safeBest, safe: true };
  }
  return { ...best, safe: !exposed(best.col, best.row) };
}

function rankSettleCandidates(
  state: GameState,
  unit: Unit,
  pid: number,
  candidates: { col: number; row: number }[],
  trekFactor: number,
): { best: { col: number; row: number } | null; bestValue: number; safeBest: { col: number; row: number } | null; safeBestValue: number } {
  const threats = knownBarbThreats(state, pid);
  const exposed = (col: number, row: number) =>
    threats.some((t) => axialDistance(ax({ col, row }), ax(t)) <= SETTLE_DANGER_RADIUS);
  let best: { col: number; row: number } | null = null;
  let bestValue = -Infinity;
  let safeBest: { col: number; row: number } | null = null;
  let safeBestValue = -Infinity;
  for (const { col, row } of candidates) {
    const value = settleScore(state, col, row) - axialDistance(ax(unit), ax({ col, row })) * trekFactor;
    if (value > bestValue) {
      bestValue = value;
      best = { col, row };
    }
    if (!exposed(col, row) && value > safeBestValue) {
      safeBestValue = value;
      safeBest = { col, row };
    }
  }
  return { best, bestValue, safeBest, safeBestValue };
}

/**
 * Choose where a settler should found, preferring ground clear of barbarians. We rank
 * candidate sites by land quality (minus a trek discount), then:
 *  - if the best site is clear of known raiders, take it (no escort needed);
 *  - if it's exposed but a nearly-as-good *safe* site exists, take the safe one instead;
 *  - only when the best land is unavoidably in harm's way do we take it and flag it
 *    unsafe, so the turn planner knows to send a guard along.
 *
 * Searches locally first, then any explored tile empire-wide (late game: the ±6 ring
 * around a settler is often full even when distant frontiers still have room).
 * `reserved` holds sites already claimed by other settlers this turn.
 */
export function planSettle(state: GameState, unit: Unit, pid: number, reserved?: Set<string>): SettlePlan | null {
  const local: { col: number; row: number }[] = [];
  for (let dr = -SETTLE_LOCAL_RADIUS; dr <= SETTLE_LOCAL_RADIUS; dr++) {
    for (let dc = -SETTLE_LOCAL_RADIUS; dc <= SETTLE_LOCAL_RADIUS; dc++) {
      const col = unit.col + dc;
      const row = unit.row + dr;
      if (isSettleCandidate(state, col, row, unit.id, reserved)) local.push({ col, row });
    }
  }
  let ranked = rankSettleCandidates(state, unit, pid, local, 1.5);
  if (ranked.best) {
    return finalizeSettlePlan(state, pid, ranked.best, ranked.bestValue, ranked.safeBest, ranked.safeBestValue);
  }

  const me = playerById(state, pid);
  if (!me) return null;
  const global: { col: number; row: number }[] = [];
  for (const t of state.map.tiles) {
    if (!me.explored.has(`${t.col},${t.row}`)) continue;
    if (isSettleCandidate(state, t.col, t.row, unit.id, reserved)) global.push({ col: t.col, row: t.row });
  }
  ranked = rankSettleCandidates(state, unit, pid, global, 0.35);
  if (!ranked.best) return null;
  return finalizeSettlePlan(state, pid, ranked.best, ranked.bestValue, ranked.safeBest, ranked.safeBestValue);
}

/** Best known settle site on a different landmass (for coastal expansion overseas). */
function nearestOverseasLand(state: GameState, unit: Unit, pid: number): { col: number; row: number } | null {
  const me = playerById(state, pid);
  if (!me) return null;
  const from = { col: unit.col, row: unit.row };
  let best: { col: number; row: number } | null = null;
  let bestValue = -Infinity;
  for (const t of state.map.tiles) {
    if (!me.explored.has(`${t.col},${t.row}`)) continue;
    if (!isSettleCandidate(state, t.col, t.row, unit.id)) continue;
    if (sameLandmass(state, from, { col: t.col, row: t.row })) continue;
    const value = settleScore(state, t.col, t.row) - axialDistance(ax(unit), ax({ col: t.col, row: t.row })) * 0.5;
    if (value > bestValue) {
      bestValue = value;
      best = { col: t.col, row: t.row };
    }
  }
  return best;
}

function aiSettler(state: GameState, unit: Unit, pid: number, plan?: SettlePlan | null): void {
  // Settlers are defenceless and a lost one squanders a whole city's worth of effort
  // (the chief reason the AI under-expands on barbarian-infested maps). If a hostile
  // is closing in, settle on the spot if we possibly can, else pull back toward the
  // nearest friendly city until the coast is clear — never walk into the raiders.
  const threat = nearestHostile(state, unit, pid);
  if (threat && axialDistance(ax(unit), ax(threat)) <= 3) {
    if (applyCommand(state, { type: "foundCity", unitId: unit.id }, pid).ok) return;
    const home = citiesOf(state, pid)
      .map((c) => ({ col: c.col, row: c.row, d: axialDistance(ax(unit), ax(c)) }))
      .sort((a, b) => a.d - b.d)[0];
    if (home && home.d > 0) {
      stepToward(state, unit, home.col, home.row, pid);
      return;
    }
  }
  if (applyCommand(state, { type: "foundCity", unitId: unit.id }, pid).ok) return;
  const spot = plan ?? planSettle(state, unit, pid);
  if (spot) {
    stepToward(state, unit, spot.col, spot.row, pid);
    applyCommand(state, { type: "foundCity", unitId: unit.id }, pid); // try again if we arrived
    return;
  }
  // No good site nearby — coastal empires put settlers to sea toward fresh land.
  const player = playerById(state, pid);
  if (player?.researched.has("sailing") && isCoastalTile(state, unit.col, unit.row)) {
    const overseas = nearestOverseasLand(state, unit, pid);
    if (overseas) {
      stepToward(state, unit, overseas.col, overseas.row, pid);
      applyCommand(state, { type: "foundCity", unitId: unit.id }, pid);
      return;
    }
  }
  // Push toward the unexplored frontier to uncover new land rather than idling.
  aiExplore(state, unit, pid);
}

/** Start a tile/defence work only when this city has an idle craftsman for every
 *  discipline it needs, and pin them to it the instant it's created. This guarantees
 *  the system never starts an improvement it can't staff right away, and — because
 *  the freshly assigned craftsmen leave the idle pool immediately — it can't
 *  over-commit several works to a single specialist within one turn. */
function startWorkStaffed(state: GameState, city: City, pid: number, kind: string, col: number, row: number): boolean {
  const assigned = assignedSpecialistIds(state, pid);
  const picks: number[] = [];
  for (const disc of workDisciplines(kind)) {
    const s = city.specialists.find(
      (sp) => !assigned.has(sp.id) && !picks.includes(sp.id) && SPECIALIST_DEFS[sp.type as SpecialistId]?.discipline === disc,
    );
    if (!s) return false; // no free craftsman for this craft — don't start an unstaffable work
    picks.push(s.id);
  }
  if (picks.length === 0) return false; // work resolved to no disciplines (unknown kind)
  if (!applyCommand(state, { type: "startWork", kind, col, row }, pid).ok) return false;
  const work = state.works.find((w) => w.ownerId === pid && w.target?.col === col && w.target?.row === row);
  if (work) for (const id of picks) assignSpecialist(state, pid, work.id, id, true);
  return true;
}

/** Train craftsmen and queue public works for one city. */
function aiManageCity(state: GameState, city: City, player: Player, pid: number): void {
  const unlocked = availableSpecialists(player);
  const countOf = (id: SpecialistId) => city.specialists.filter((s) => s.type === id).length;
  const haveDiscipline = (d: string) =>
    city.specialists.some((s) => SPECIALIST_DEFS[s.type as SpecialistId]?.discipline === d);

  // Train a balanced crew, scaling with size and always leaving free workers. Bigger
  // cities support deeper benches so their public works actually keep pace.
  const wants: SpecialistId[] = [];
  const wantCarpenter = Math.min(3, Math.floor(city.population / 3));
  // Masons earn their keep on mines/quarries, so a deep bench is never wasted — and a
  // large empire needs it to ever pool a wonder's heavy masonry crew. Architects and
  // engineers scale up with size too so a big civ can gather a full wonder workforce.
  const wantMason = Math.min(4, Math.floor(city.population / 3));
  if (unlocked.includes("carpenter") && countOf("carpenter") < wantCarpenter) wants.push("carpenter");
  // A surveyor (agrimensor) is what lets a city lay roads — keep one on staff so every
  // city, whatever its governor focus, can build roads (see the road work below).
  if (unlocked.includes("agrimensor") && countOf("agrimensor") < 1) wants.push("agrimensor");
  if (unlocked.includes("mason") && countOf("mason") < wantMason) wants.push("mason");
  if (city.population >= 6 && unlocked.includes("engineer") && countOf("engineer") < 1) wants.push("engineer");
  if (city.population >= 7 && unlocked.includes("architect") && countOf("architect") < 1) wants.push("architect");
  if (city.population >= 9 && unlocked.includes("engineer") && countOf("engineer") < 2) wants.push("engineer");
  if (city.population >= 11 && unlocked.includes("architect") && countOf("architect") < 2) wants.push("architect");
  for (const id of wants) {
    if (workerSlots(city) > 1) applyCommand(state, { type: "convertCitizen", cityId: city.id, specialistId: id, delta: 1 }, pid);
  }

  if (worksOfCity(state, city.id).length >= 3) return; // don't over-queue

  // Defensive structure: a capital/large city with both crafts fortifies a
  // border tile (towers bombard; walls just block).
  if (city.population >= 6 && haveDiscipline("masonry") && haveDiscipline("engineering")) {
    const hasStructureNearby = state.map.tiles.some(
      (t) => t.structure && t.ownerCityId === city.id,
    );
    if (!hasStructureNearby) {
      for (const n of offsetNeighbors(state.map, city.col, city.row)) {
        const tile = getTile(state.map, n.col, n.row);
        if (!tile || tile.ownerCityId !== city.id || tile.improvement || tile.structure) continue;
        if (nextTierAt(tile, "tower") && startWorkStaffed(state, city, pid, "tower", n.col, n.row)) return;
      }
    }
  }

  // Economic works: walk the city's actual workable tiles, best yields first, and
  // queue the most valuable improvement (resources before plain terrain).
  const tiles = workableTiles(state, city)
    .map((t) => ({ ...t, tile: getTile(state.map, t.col, t.row)! }))
    .filter((t) => t.tile && t.tile.ownerCityId !== undefined && state.cities.get(t.tile.ownerCityId)?.ownerId === pid)
    .sort((a, b) => {
      const ra = a.tile.resource ? 1 : 0;
      const rb = b.tile.resource ? 1 : 0;
      if (ra !== rb) return rb - ra; // resources first
      const ya = tileYields(a.tile);
      const yb = tileYields(b.tile);
      return yb.food + yb.production - (ya.food + ya.production);
    });
  for (const { col, row, tile } of tiles) {
    let kind: string | null = null;
    // Prioritize improving a resource with the correct improvement.
    if (tile.resource && !resourceActive(tile, state)) {
      const rdef = RESOURCE_DEFS[tile.resource as keyof typeof RESOURCE_DEFS];
      if (rdef) {
        const needed = rdef.improvement;
        if (haveDiscipline(workDiscipline(needed)) && nextTierAt(tile, needed)) {
          kind = needed;
        }
      }
    }
    if (!kind && haveDiscipline("carpentry") && nextTierAt(tile, "farm")) kind = "farm";
    else if (!kind && haveDiscipline("carpentry") && nextTierAt(tile, "lumber_camp")) kind = "lumber_camp";
    else if (!kind && haveDiscipline("masonry") && nextTierAt(tile, "mine")) kind = "mine";
    else if (!kind && haveDiscipline("survey") && player.researched.has("maritime_foraging") && nextTierAt(tile, "fishery"))
      kind = "fishery";
    else if (!kind && haveDiscipline("survey") && nextTierAt(tile, "road")) kind = "road";
    if (kind && startWorkStaffed(state, city, pid, kind, col, row)) return;
  }
}

// ---- governor mode (player-facing "auto mode" for a single city) ---------

/** Building/training-building order per governor focus, tried before the
 *  generic development order below. */
const AUTO_FOCUS_BUILDING_ORDER: Record<CityAutoFocus, string[]> = {
  growth: ["granary", "aqueduct"],
  military: ["walls", "forge"],
  science: ["library", "academy"],
  money: ["market", "harbor", "bank"],
};

const MILITARY_TRAINING_FAMILIES: TrainingClass[] = ["archery_range", "stable", "siege_workshop", "shipyard"];

/** Production choice for a governed city: front-load whatever serves its
 *  focus (a training-building ladder for military, else its focus buildings),
 *  then fall back to the same generic economy/infrastructure order the full
 *  AI uses, so a governed city never idles once its focus is satisfied. */
function chooseAutoProduction(state: GameState, player: Player, city: City, focus: CityAutoFocus): ProductionItem | null {
  const opts = availableProduction(state, player, city);
  const findBuilding = (id: string): ProductionItem | null =>
    opts.find((o) => o.item.kind === "building" && o.item.id === id)?.item ?? null;
  const findTraining = (fam: TrainingClass): ProductionItem | null =>
    opts.find((o) => o.item.kind === "trainingBuilding" && o.item.family === fam)?.item ?? null;

  if (focus === "military") {
    if (!city.training.barracks) { const b = findTraining("barracks"); if (b) return b; }
    for (const fam of MILITARY_TRAINING_FAMILIES) {
      if (!city.training[fam]) { const b = findTraining(fam); if (b) return b; }
    }
  }

  const order = [
    ...AUTO_FOCUS_BUILDING_ORDER[focus],
    "granary", "workshop", "market", "library", "forge", "bank", "aqueduct", "harbor",
    "monument", "amphitheater", "academy", "museum", "temple", "shrine", "lighthouse", "walls",
  ];
  const seen = new Set<string>();
  for (const id of order) {
    if (seen.has(id)) continue;
    seen.add(id);
    const b = findBuilding(id);
    if (b) return b;
  }

  // Nothing fresh to build: for a military city, upgrade an existing training
  // building tier instead of idling.
  if (focus === "military") {
    for (const fam of ["barracks", ...MILITARY_TRAINING_FAMILIES] as TrainingClass[]) {
      const up = findTraining(fam);
      if (up) return up;
    }
  }

  if (player.gold < 0) {
    const coin = opts.find((o) => o.item.kind === "project" && o.item.id === "coinage")?.item;
    if (coin) return coin;
  }
  return opts.find((o) => o.item.kind === "building")?.item
    ?? opts.find((o) => o.item.kind === "project")?.item
    ?? null;
}

/** Keep a military-focus governed city training soldiers up to a standing
 *  garrison target, without draining it below a safe population floor or
 *  stacking up orders faster than they can be trained. */
function autoTrainMilitary(state: GameState, city: City, player: Player): void {
  if (city.population <= 2 || city.trainingQueue.length > 0) return;
  const trainable = availableTraining(state, player, city);
  const type = bestTrainableMilitary(trainable, player.civId);
  if (!type) return;
  const cityCount = citiesOf(state, player.id).length;
  const milCount = unitsOf(state, player.id).filter((u) => isMilitary(u.type)).length;
  if (milCount >= cityCount * 2 + 2) return;
  applyCommand(state, { type: "startTraining", cityId: city.id, unit: type }, player.id);
}

/**
 * Player-facing "governor" mode: auto-manage one city toward a chosen focus
 * (growth/military/science/money) every turn. Worked-tile assignment is
 * already skewed toward the focus by `processCity`→`autoAssignCitizens`
 * (keyed off `city.autoMode`); this adds production/training on top, then
 * falls back to the same generic tile-improvement/specialist logic the full
 * AI uses (`aiManageCity`) so a governed city keeps developing even once its
 * focus-specific queue is empty. Military units are only ever trained here
 * when the focus is explicitly "military".
 */
export function governorPickProduction(state: GameState, city: City, player: Player): void {
  if (!city.autoMode || city.production) return; // don't override an in-progress build
  const item = chooseAutoProduction(state, player, city, city.autoMode);
  if (item) applyCommand(state, { type: "setProduction", cityId: city.id, item }, player.id);
}

export function autoManageCity(state: GameState, city: City, player: Player): void {
  const focus = city.autoMode;
  if (!focus) return;
  governorPickProduction(state, city, player);
  if (focus === "military") autoTrainMilitary(state, city, player);
  aiManageCity(state, city, player, player.id); // generic: specialists, tile works, roads
}

/** Run governor mode for every auto-managed city this player owns, then let
 *  their idle specialists (from those cities only) staff the empire's Works —
 *  mirroring what the AI does for itself, but scoped to opted-in cities. */
export function autoManageCities(state: GameState, player: Player): void {
  const autoCities = citiesOf(state, player.id).filter((c) => c.autoMode);
  if (autoCities.length === 0) return;
  for (const city of autoCities) autoManageCity(state, city, player);
  aiAssignSpecialists(state, player.id, autoCities);
}

/**
 * Barbarian diplomacy (needs the Parley tech). With a unit or city beside a raider,
 * the AI can RECRUIT it (pay a fee to take a ready-made soldier into the army — no
 * population cost, and it removes a threat) or BRIBE its war-band into a 10-turn truce.
 * The AI recruits when it still wants troops and can afford it, and otherwise buys a
 * truce when raiders are pressing it — both keep a gold reserve so parley never
 * bankrupts the treasury. At most one bribe per turn (each one doubles the next price).
 */
export function aiBarbarianDiplomacy(state: GameState, player: Player, threatened: boolean): void {
  const pid = player.id;
  if (!player.researched.has(BARBARIAN_DIPLOMACY_TECH)) return;
  const reserve = 40; // never parley ourselves to the brink of bankruptcy
  const cityCount = citiesOf(state, pid).length;
  let milCount = unitsOf(state, pid).filter((u) => isMilitary(u.type)).length;
  let bribedThisTurn = false;
  for (const e of [...state.units.values()]) {
    if (!playerById(state, e.ownerId)?.isBarbarian) continue;
    if (isBarbarianPacified(state, e, pid)) continue;
    if (!canParleyWith(state, e, pid)) continue;
    // Recruit a raider into the fold — but only when it actually pays: under threat we
    // need bodies *now* (faster than training), or the band is a bargain (a battle-
    // levelled unit for roughly a rookie's price). Buying rookies we could just train
    // only bleeds gold, so we don't. Always keep a reserve.
    const recruitCost = barbarianRecruitCost(e);
    const bargain = e.level >= 2;
    if ((threatened || bargain) && milCount < cityCount + 3 && player.gold >= recruitCost + reserve) {
      if (applyCommand(state, { type: "recruitBarbarian", unitId: e.id }, pid).ok) {
        milCount += 1;
        continue;
      }
    }
    // Otherwise, when raiders are pressing us, buy a truce rather than bleed for it.
    const bribeCost = barbarianBribeCost(player);
    if (!bribedThisTurn && threatened && player.gold >= bribeCost + reserve) {
      if (applyCommand(state, { type: "bribeBarbarian", unitId: e.id }, pid).ok) bribedThisTurn = true;
    }
  }
}

/** Start the wonder that best fits the civ, on an owned tile a capable city can reach. */
function aiWonders(state: GameState, pid: number, p: DiploPersonality, focus: VictoryKind): void {
  if (worksOf(state, pid).some((w) => w.kind === "wonder")) return; // one at a time
  // Rank still-available wonders by how well their effect suits this civ, then take
  // the first we can actually start (canStartWonder checks craftsmen + an empty tile).
  const candidates = WONDER_DEFS.filter(
    (w) => !state.completedWonders.includes(w.id) && !worksOf(state, pid).some((x) => x.wonderId === w.id),
  ).sort((a, b) => wonderScore(b.effect, p, focus) - wonderScore(a.effect, p, focus));
  for (const wonder of candidates) {
    for (const t of state.map.tiles) {
      const owner = t.ownerCityId !== undefined ? state.cities.get(t.ownerCityId) : undefined;
      if (!owner || owner.ownerId !== pid) continue;
      if (canStartWonder(state, pid, wonder.id, t.col, t.row).ok) {
        applyCommand(state, { type: "startWonder", wonderId: wonder.id, col: t.col, row: t.row }, pid);
        return;
      }
    }
  }
}

/**
 * Staff the empire's works. With manual assignment, nothing labours unless it is
 * explicitly assigned, so the AI pins every idle craftsman to the oldest work that
 * still needs its discipline (mirroring the old auto-assignment as explicit orders).
 * `cities` scopes which cities' specialists are considered (default: all of them);
 * `autoManageCities` passes only the player's governor-mode cities.
 */
function aiAssignSpecialists(state: GameState, pid: number, cities: City[] = citiesOf(state, pid)): void {
  const works = worksOf(state, pid);
  if (works.length === 0) return;
  const assigned = assignedSpecialistIds(state, pid);
  for (const city of cities) {
    for (const s of city.specialists) {
      if (assigned.has(s.id)) continue;
      const disc = SPECIALIST_DEFS[s.type as SpecialistId]?.discipline;
      if (!disc) continue;
      // Try each work needing this craft in turn — a wonder may refuse us (its
      // per-craft crew is capped), so fall through to the next candidate work
      // rather than leaving the craftsman idle.
      for (const w of works) {
        if ((w.requirement[disc] ?? 0) <= (w.progress[disc] ?? 0)) continue;
        if (assignSpecialist(state, pid, w.id, s.id, true).ok) {
          assigned.add(s.id);
          break;
        }
      }
    }
  }
}

/** Spend a unit's earned promotions on sensible picks. */
function aiPromote(state: GameState, unit: Unit, pid: number): void {
  let guard = 0;
  while (unit.unspentPromotions > 0 && guard++ < 4) {
    const opts = availablePromotions(unit);
    if (opts.length === 0) break;
    const pref = ["medic", "shock", "cover", "drill", "blitz", "accuracy", "siege"];
    const pick = pref.find((p) => opts.includes(p as never)) ?? opts[0]!;
    if (!applyCommand(state, { type: "promote", unitId: unit.id, promotion: pick as never }, pid).ok) break;
  }
}

function aiTrader(state: GameState, unit: Unit, pid: number): void {
  const tryEstablish = (): boolean => {
    if (!canEstablishTradeRoute(state, unit)) return false;
    const origin = cityAt(state, unit.col, unit.row);
    const dests = tradeRouteDestinations(state, unit);
    // Prefer the richest route: international destinations pay +50% (and overseas
    // ones more still), and a longer haul earns more gold — so chase those first.
    if (origin) {
      dests.sort((a, b) => {
        const intl = (c: City) => (c.ownerId !== unit.ownerId ? 1 : 0);
        if (intl(a) !== intl(b)) return intl(b) - intl(a);
        return axialDistance(ax(b), ax(origin)) - axialDistance(ax(a), ax(origin));
      });
    }
    const dest = dests[0];
    if (!dest) return false;
    return applyCommand(state, { type: "establishTradeRoute", unitId: unit.id, destCityId: dest.id }, pid).ok;
  };
  if (tryEstablish()) return;
  // Walk to the nearest of our cities, then set out a route from there.
  const cities = citiesOf(state, unit.ownerId);
  if (cities.length < 2) return;
  let best: City | null = null;
  let bestD = Infinity;
  for (const c of cities) {
    const d = axialDistance(ax(unit), ax(c));
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  if (best && (best.col !== unit.col || best.row !== unit.row)) {
    stepToward(state, unit, best.col, best.row, pid);
    tryEstablish();
  }
}

/** Buy a missionary when the AI has founded a faith, has spare faith, and one of
 *  its own cities still follows a different (or no) religion. A civ pursuing a religious
 *  victory keeps a smaller faith reserve and runs several missionaries at once to convert
 *  its empire fast (the bedrock for the win). */
function aiBuyMissionaries(state: GameState, player: Player, pid: number, focus: VictoryKind): void {
  const rel = player.foundedReligionId;
  if (!rel) return;
  const zealot = focus === "religious";
  const cost = religiousUnitCost("missionary");
  if (player.faith < cost + (zealot ? 20 : 60)) return; // keep a reserve for founding/legends
  const needs = citiesOf(state, pid).some((c) => c.religion !== rel);
  if (!needs) return;
  // Don't stockpile missionaries: a zealot fields up to three at once, others just one.
  const inField = unitsOf(state, pid).filter((u) => u.type === "missionary").length;
  if (inField >= (zealot ? 3 : 1)) return;
  const city = citiesOf(state, pid)[0];
  if (city) buyReligiousUnit(state, pid, city.id, "missionary");
}

/** Walk a missionary to the nearest of our cities that doesn't yet follow our
 *  religion and convert it. */
function aiReligiousUnit(state: GameState, unit: Unit, pid: number, focus: VictoryKind): void {
  const rel = playerById(state, pid)?.foundedReligionId;
  if (!rel || unit.inTransit) return;
  // 1) Convert our own cities first — a faithful home empire is the bedrock of the win.
  let best: City | null = null;
  let bestD = Infinity;
  for (const c of citiesOf(state, pid)) {
    if (c.religion === rel) continue;
    const d = axialDistance(ax(unit), ax(c));
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  // 2) Pursuing a religious victory and the home empire is converted? Carry the faith
  //    abroad: head for the nearest peaceful rival city (open borders let the missionary
  //    cross the border) that doesn't yet follow us. This is the only way to win — the
  //    condition needs a majority in EVERY civ, not just our own.
  if (!best && focus === "religious") {
    for (const c of state.cities.values()) {
      if (c.ownerId === pid || c.religion === rel) continue;
      const owner = playerById(state, c.ownerId);
      if (!owner || owner.isBarbarian) continue;
      const r = relationBetween(state, pid, c.ownerId);
      if (!r || r.status !== "peace" || !r.openBorders) continue; // can only cross with open borders
      const d = axialDistance(ax(unit), ax(c));
      if (d < bestD) { bestD = d; best = c; }
    }
  }
  if (!best) return;
  if (axialDistance(ax(unit), ax(best)) <= 1) {
    applyCommand(state, { type: "evangelize", unitId: unit.id, cityId: best.id }, pid);
    return;
  }
  stepToward(state, unit, best.col, best.row, pid);
  if (state.units.has(unit.id) && axialDistance(ax(unit), ax(best)) <= 1) {
    applyCommand(state, { type: "evangelize", unitId: unit.id, cityId: best.id }, pid);
  }
}

// ---- religion UNIQUE units (production-trained; see religion-units.ts) -----

/** Train the faith's unique holy unit in an eligible temple city. Support and
 *  converter clergy scale with the empire and with a religious focus; war-priests
 *  are mustered only by aggressive/at-war civs. Kept modest so cities don't starve. */
function aiTrainReligionUnit(state: GameState, player: Player, city: City, p: DiploPersonality, focus: VictoryKind): void {
  const relId = player.foundedReligionId;
  if (!relId) return;
  if (city.population < 4) return; // never drain a small city for a holy unit
  if (hostileNearCity(state, player.id, city, 2)) return; // a menaced city musters soldiers instead
  // Only OUR faith's unit, and only when the city can truly train it right now —
  // availableTraining gates on reqTech AND temple AND majority faith (unlike the
  // looser trainableReligionUnits, which skips the tech check).
  const type = availableTraining(state, player, city).find(
    (t) => UNIT_DEFS[t].religionUnit && religionInstanceForDefId(state, UNIT_DEFS[t].religionUnit)?.id === relId,
  );
  if (!type) return;
  const kit = religionUnitKit(type);
  if (!kit) return;
  const def = UNIT_DEFS[type];
  const inField = unitsOf(state, player.id).filter((u) => u.type === type).length;
  const zealot = focus === "religious";
  const aggressive = p.aggression > 0.6 || player.atWar.length > 0;
  const cityCount = citiesOf(state, player.id).length;
  const milCount = unitsOf(state, player.id).filter((u) => isMilitary(u.type)).length;

  let cap: number;
  if (isMilitary(type) && !kit.passives.cannotAttack) {
    cap = aggressive ? Math.min(3, Math.ceil(cityCount / 2)) : 0; // war-priest
  } else if ((kit.passives.pressureAura ?? 0) >= 3) {
    cap = zealot ? 4 : 2; // converter (Evangelist / Elect / Sadhu): spread the faith
  } else if (kit.passives.cannotAttack) {
    cap = zealot ? 2 : 1; // pacifist debuff-aura (Ahimsa Ascetic)
  } else {
    cap = milCount >= 3 ? 1 + (zealot ? 1 : 0) : 0; // support priest — only worth it with an army
  }
  void def;
  if (inField >= cap) return;
  applyCommand(state, { type: "startTraining", cityId: city.id, unit: type }, player.id);
}

/** Drive a religion unique unit: war-priests fight; converters spread the faith by
 *  proximity; support clergy shadow the army; and all of them fire their signature
 *  actives (heals, rallies, holy fire, prophetic curses) when it lands well. */
function aiReligionUnit(state: GameState, unit: Unit, pid: number, focus: VictoryKind): void {
  const kit = religionUnitKit(unit.type);
  if (!kit) { aiMilitary(state, unit, pid); return; }

  // Offensive holy actives (holy fire / prophecies / the whirling chakram) come first —
  // they hit multiple foes and are worth ending the turn for.
  if (aiReligionAbility(state, unit, pid)) return;

  // War-priests otherwise behave like any soldier (and know their charge, e.g. Deus Vult).
  if (isMilitary(unit.type) && !kit.passives.cannotAttack) {
    aiMilitary(state, unit, pid);
    return;
  }
  if (!state.units.has(unit.id) || unit.movementLeft <= 0 || unit.attackedThisTurn) return;

  // Converters radiate faith into cities within two tiles — park them among the unconverted.
  if ((kit.passives.pressureAura ?? 0) >= 3) {
    aiConverterMove(state, unit, pid, focus);
    return;
  }
  // Support and pacifist clergy shadow the nearest friendly fighters so their auras land.
  aiAccompanyArmy(state, unit, pid);
}

/** Fire a religion unit's best available active ability, returning true if it did.
 *  Heals/rallies help our side; holy fire and prophecies hurt clustered enemies. */
function aiReligionAbility(state: GameState, unit: Unit, pid: number): boolean {
  const abilities = unitAbilities(state, unit);
  const use = (a: string, col: number, row: number): boolean => {
    if (!canUseAbility(state, unit, a as never).ok) return false;
    return applyCommand(state, { type: "useAbility", unitId: unit.id, ability: a as never, col, row }, pid).ok;
  };
  const enemiesWithin = (r: number) =>
    [...state.units.values()].filter((e) => isHostile(state, pid, e.ownerId) && axialDistance(ax(unit), ax(e)) <= r);

  // Holy fire / whirling strike: hit every adjacent enemy. Worth it with 2+ in reach.
  for (const a of ["chakkar", "purifying_flame", "storm_call"]) {
    if (abilities.includes(a as never) && enemiesWithin(1).length >= 2 && use(a, 0, 0)) return true;
  }
  // Prophetic dooms: curse a knot of enemies within two tiles before battle is joined.
  for (const a of ["doom_prophecy", "omen_of_ishtar", "eclipse_prophecy"]) {
    if (abilities.includes(a as never) && enemiesWithin(2).length >= 2 && use(a, 0, 0)) return true;
  }
  // Area heal / rally: when clustered with allies and a fight is near, lift the whole group.
  for (const a of ["kagura", "metta", "takbir"]) {
    if (!abilities.includes(a as never)) continue;
    const alliesNear = unitsOf(state, pid).filter((u) => u.id !== unit.id && axialDistance(ax(unit), ax(u)) <= 2).length;
    if (alliesNear >= 2 && enemiesWithin(3).length >= 1 && use(a, 0, 0)) return true;
  }
  // Blessing: heal a wounded adjacent ally (Benediction / Darshan / Orisha's Favor).
  for (const a of ["benediction", "darshan", "orisha_favor"]) {
    if (!abilities.includes(a as never)) continue;
    for (const key of abilityTargets(state, unit, a as never)) {
      const [col, row] = key.split(",").map(Number) as [number, number];
      const ally = unitAt(state, col, row);
      if (ally && ally.hp < unitMaxHp(ally) * 0.7 && use(a, col, row)) return true;
    }
  }
  return false;
}

/** Move a converter toward the nearest city not yet following our faith — its
 *  pressure aura converts from two tiles away, so it need only loiter nearby. */
function aiConverterMove(state: GameState, unit: Unit, pid: number, focus: VictoryKind): void {
  const relId = playerById(state, pid)?.foundedReligionId;
  if (!relId || unit.inTransit) return;
  let best: City | null = null;
  let bestD = Infinity;
  for (const c of citiesOf(state, pid)) {
    if (cityMajorityFaith(c) === relId) continue;
    const d = axialDistance(ax(unit), ax(c));
    if (d < bestD) { bestD = d; best = c; }
  }
  // Religious-victory civ with a converted home empire carries the faith abroad,
  // to peaceful rivals whose open borders let the converter cross.
  if (!best && focus === "religious") {
    for (const c of state.cities.values()) {
      if (c.ownerId === pid || cityMajorityFaith(c) === relId) continue;
      const owner = playerById(state, c.ownerId);
      if (!owner || owner.isBarbarian) continue;
      const r = relationBetween(state, pid, c.ownerId);
      if (!r || r.status !== "peace" || !r.openBorders) continue;
      const d = axialDistance(ax(unit), ax(c));
      if (d < bestD) { bestD = d; best = c; }
    }
  }
  if (best && bestD > 2) stepToward(state, unit, best.col, best.row, pid);
}

/** Shadow the nearest friendly fighting unit so support/pacifist auras land where the
 *  fighting is; with no army in the field, shelter in the nearest city. */
function aiAccompanyArmy(state: GameState, unit: Unit, pid: number): void {
  let target: Unit | null = null;
  let bestD = Infinity;
  for (const u of unitsOf(state, pid)) {
    if (u.id === unit.id || !isMilitary(u.type)) continue;
    const d = axialDistance(ax(unit), ax(u));
    if (d < bestD) { bestD = d; target = u; }
  }
  if (target) {
    if (bestD > 1) stepToward(state, unit, target.col, target.row, pid);
    return;
  }
  const home = citiesOf(state, pid)
    .map((c) => ({ c, d: axialDistance(ax(unit), ax(c)) }))
    .sort((a, b) => a.d - b.d)[0];
  if (home && home.d > 0) stepToward(state, unit, home.c.col, home.c.row, pid);
}

/**
 * Send a guard only to settlers headed for unavoidably dangerous ground (their
 * `planSettle` came back unsafe — the best land was exposed and no nearly-as-good safe
 * site existed). Settlers steering to clear ground need no escort, so we don't pull
 * soldiers off proactive camp-clearing, which protects the whole empire far better
 * than 1:1 babysitting. Returns escortUnitId → settlerId; recomputed fresh each turn.
 */
function assignEscorts(state: GameState, pid: number, plans: Map<number, SettlePlan>): Map<number, number> {
  const out = new Map<number, number>();
  const needGuard = unitsOf(state, pid).filter((u) => plans.get(u.id)?.safe === false);
  if (needGuard.length === 0) return out;
  const guards = unitsOf(state, pid).filter((u) => isMilitary(u.type) && u.hp >= 40);
  if (guards.length === 0) return out;
  const taken = new Set<number>();
  for (const s of needGuard) {
    let best: Unit | null = null;
    let bestD = Infinity;
    for (const g of guards) {
      if (taken.has(g.id)) continue;
      const d = axialDistance(ax(g), ax(s));
      if (d < bestD) {
        bestD = d;
        best = g;
      }
    }
    // Only a soldier already reasonably near responds; a distant army stays on task.
    if (best && bestD <= 8) {
      taken.add(best.id);
      out.set(best.id, s.id);
    }
  }
  return out;
}

const SCORE_KILL_UNIT = 500;
const SCORE_KILL_CITY = 1000;

/** Score an adjacent attack using combatPreview; null if the trade is too poor. */
function scoreAttackTarget(state: GameState, unit: Unit, pid: number, col: number, row: number): number | null {
  const preview = combatPreview(state, unit, col, row);
  if (!preview) return null;
  const def = UNIT_DEFS[unit.type];
  const city = cityAt(state, col, row);
  const enemy = unitAt(state, col, row);

  if (city && city.ownerId !== pid) {
    const lead = powerRatio(state, pid, city.ownerId);
    const crushing = lead >= 1.45;
    const ranged = isRanged(def);
    const supported = friendlyMilitaryNear(state, pid, col, row, 2) >= (crushing ? 1 : 2);
    const canAssault =
      crushing ||
      ranged ||
      supported ||
      city.hp <= (crushing ? 85 : 55) ||
      preview.toDefender >= city.hp ||
      (preview.toAttacker < unit.hp && preview.toDefender >= Math.max(6, city.hp * (crushing ? 0.08 : 0.12)));
    if (!canAssault) return null;
    const finish = preview.toDefender >= city.hp ? SCORE_KILL_CITY : 0;
    const siegeBonus = crushing ? preview.toDefender * 1.5 : 0;
    return finish + preview.toDefender * 2 - preview.toAttacker * (crushing ? 2 : 3) + siegeBonus;
  }

  if (enemy && isHostile(state, pid, enemy.ownerId)) {
    const lead = powerRatio(state, pid, enemy.ownerId);
    const crushing = lead >= 1.45;
    const kill = preview.toDefender >= enemy.hp ? SCORE_KILL_UNIT : 0;
    if (!kill) {
      if (preview.toAttacker >= unit.hp) return null;
      if (!crushing && preview.toAttacker > preview.toDefender + 5 && unit.hp < 70) return null;
    }
    return kill + preview.toDefender * 2 - preview.toAttacker * (crushing ? 1.5 : 2);
  }
  return null;
}

function pickBestAttackTarget(
  state: GameState,
  unit: Unit,
  pid: number,
  targets: Set<string>,
): { col: number; row: number; score: number } | null {
  let best: { col: number; row: number; score: number } | null = null;
  for (const key of targets) {
    const [col, row] = key.split(",").map(Number) as [number, number];
    const score = scoreAttackTarget(state, unit, pid, col, row);
    if (score == null) continue;
    if (!best || score > best.score) best = { col, row, score };
  }
  return best;
}

/** Fire each city's once-per-turn bombard at the best nearby enemy. */
function aiCityBombard(state: GameState, pid: number): void {
  for (const city of citiesOf(state, pid)) {
    if (city.rangedAttackUsed) continue;
    const targets = cityBombardTargets(state, city);
    if (targets.length === 0) continue;
    const str = cityBombardStrength(state, city);
    let best: Unit | null = null;
    let bestScore = -Infinity;
    for (const t of targets) {
      const tile = getTile(state.map, t.col, t.row);
      let def = UNIT_DEFS[t.type].strength * (t.hp / unitMaxHp(t));
      if (tile) def += 2; // rough terrain cushion
      const dmg = damageFrom(str, Math.max(1, Math.round(def)));
      const kill = dmg >= t.hp ? 1000 : 0;
      const score = kill - t.hp + dmg;
      if (score > bestScore) {
        bestScore = score;
        best = t;
      }
    }
    if (best) {
      applyCommand(state, { type: "cityBombard", cityId: city.id, col: best.col, row: best.row }, pid);
    }
  }
}

function aiMilitary(state: GameState, unit: Unit, pid: number, escortSettlerId?: number): void {
  const abilities = unitAbilities(state, unit);

  // Badly wounded and in danger? Fall back to the nearest city to heal (cities mend
  // a unit far faster) rather than feeding it to the enemy.
  if (unit.hp <= 30) {
    const inDanger = [...state.units.values()].some(
      (e) => isHostile(state, pid, e.ownerId) && axialDistance(ax(unit), ax(e)) <= 2,
    );
    if (inDanger) {
      const home = citiesOf(state, pid)
        .map((c) => ({ col: c.col, row: c.row, d: axialDistance(ax(unit), ax(c)) }))
        .sort((a, b) => a.d - b.d)[0];
      if (home) {
        if (home.d === 0) return; // already safe in the city — hold and heal
        stepToward(state, unit, home.col, home.row, pid);
        return;
      }
    }
  }

  // Horse archers prefer Fire & Retreat: same damage, no counter, and they reposition.
  const kite = abilities.find((a) => a === "fire_and_retreat" || a === "parthian_shot" || a === "feigned_retreat");
  if (kite) {
    const t = [...abilityTargets(state, unit, kite)][0];
    if (t) {
      const [col, row] = t.split(",").map(Number) as [number, number];
      applyCommand(state, { type: "useAbility", unitId: unit.id, ability: kite, col, row }, pid);
      return;
    }
  }

  // Fire lancers loose a ranged volley (no retaliation) whenever one is in reach.
  if (abilities.includes("fire_lance")) {
    const t = [...abilityTargets(state, unit, "fire_lance")][0];
    if (t) {
      const [col, row] = t.split(",").map(Number) as [number, number];
      applyCommand(state, { type: "useAbility", unitId: unit.id, ability: "fire_lance", col, row }, pid);
      return;
    }
  }

  // Naval gunnery: pick the best previewed target for coastal/broadside abilities.
  const navalBombard = abilities.find((a) => a === "coastal_bombardment" || a === "broadside" || a === "greek_fire");
  if (navalBombard && canUseAbility(state, unit, navalBombard).ok) {
    let best: { col: number; row: number; score: number } | null = null;
    for (const key of abilityTargets(state, unit, navalBombard)) {
      const [col, row] = key.split(",").map(Number) as [number, number];
      const preview = combatPreview(state, unit, col, row);
      if (!preview) continue;
      const score = preview.toDefender * 2 - preview.toAttacker * 2;
      if (!best || score > best.score) best = { col, row, score };
    }
    if (best && best.score > 0) {
      applyCommand(state, { type: "useAbility", unitId: unit.id, ability: navalBombard, col: best.col, row: best.row }, pid);
      return;
    }
  }

  // Mehmed's great bombard: an outranging siege shot with no retaliation.
  if (abilities.includes("basilica_bombard")) {
    const t = [...abilityTargets(state, unit, "basilica_bombard")][0];
    if (t && canUseAbility(state, unit, "basilica_bombard").ok) {
      const [col, row] = t.split(",").map(Number) as [number, number];
      applyCommand(state, { type: "useAbility", unitId: unit.id, ability: "basilica_bombard", col, row }, pid);
      return;
    }
  }

  // Boudica rouses an adjacent barbarian war-band to her side whenever she can.
  if (abilities.includes("uprising")) {
    const t = [...abilityTargets(state, unit, "uprising")][0];
    if (t && canUseAbility(state, unit, "uprising").ok) {
      const [col, row] = t.split(",").map(Number) as [number, number];
      applyCommand(state, { type: "useAbility", unitId: unit.id, ability: "uprising", col, row }, pid);
      return;
    }
  }

  // Joan raises the sacred banner when the line around her is battered.
  if (abilities.includes("sacred_banner") && canUseAbility(state, unit, "sacred_banner").ok) {
    const battered =
      unit.hp <= 60 ||
      [...state.units.values()].some(
        (u) => u.ownerId === pid && u.id !== unit.id && u.hp <= 60 && axialDistance(ax(unit), ax(u)) === 1,
      );
    if (battered) {
      applyCommand(state, { type: "useAbility", unitId: unit.id, ability: "sacred_banner", col: 0, row: 0 }, pid);
      return;
    }
  }

  const pushOffense = conquestLeadRatio(state, pid) >= 1.35;
  const threatenedCity = citiesOf(state, pid).find((city) => {
    if (unit.col === city.col && unit.row === city.row) return false;
    return cityNeedsRelief(state, pid, city, pushOffense);
  });

  const targets = computeAttackTargets(state, unit);
  const attackChoice = pickBestAttackTarget(state, unit, pid, targets);
  const attackCity = attackChoice != null && cityAt(state, attackChoice.col, attackChoice.row)?.ownerId !== pid;

  if (threatenedCity && !pushOffense && !attackCity) {
    const distToCity = axialDistance(ax(unit), ax(threatenedCity));
    const hasKill = attackChoice != null && attackChoice.score >= SCORE_KILL_UNIT;
    if (!hasKill && distToCity > 2) {
      stepToward(state, unit, threatenedCity.col, threatenedCity.row, pid);
      return;
    }
  }

  if (attackChoice) {
    const chosen = { col: attackChoice.col, row: attackChoice.row };
    // Cavalry strike with a charge (extra punch + breakthrough) when hitting a unit.
    const enemy = unitAt(state, chosen.col, chosen.row);
    const charge = abilities.find((a) => a === "shock_charge" || a === "charge" || a === "hussar_charge" || a === "war_cart_charge" || a === "furor" || a === "deus_vult");
    if (enemy && charge && abilityTargets(state, unit, charge).has(`${chosen.col},${chosen.row}`)) {
      applyCommand(state, { type: "useAbility", unitId: unit.id, ability: charge, col: chosen.col, row: chosen.row }, pid);
      return;
    }
    const ranged2 = abilities.find((a) => a === "repeating_fire" || a === "arrow_storm");
    if (enemy && ranged2 && abilityTargets(state, unit, ranged2).has(`${chosen.col},${chosen.row}`)) {
      applyCommand(state, { type: "useAbility", unitId: unit.id, ability: ranged2, col: chosen.col, row: chosen.row }, pid);
      return;
    }
    const sunder = abilities.find((a) => a === "sunder" || a === "pierce" || a === "harry" || a === "siege_assault" || a === "slay_the_beast" || a === "pyramid_of_skulls");
    if (enemy && sunder && abilityTargets(state, unit, sunder).has(`${chosen.col},${chosen.row}`)) {
      applyCommand(state, { type: "useAbility", unitId: unit.id, ability: sunder, col: chosen.col, row: chosen.row }, pid);
      return;
    }
    applyCommand(state, { type: "attack", attackerId: unit.id, col: chosen.col, row: chosen.row }, pid);
    return;
  }

  // No good attack: brace spears against adjacent enemy cavalry rather than idling.
  const braceLike = abilities.find((a) => a === "shield_wall" || a === "othismos" || a === "last_stand" || a === "brace");
  if (braceLike) {
    const stance = braceLike;
    const threatened = [...state.units.values()].some(
      (e) => e.ownerId !== unit.ownerId && UNIT_DEFS[e.type].cls === "cavalry" && axialDistance(ax(unit), ax(e)) <= 2,
    );
    if (threatened && canUseAbility(state, unit, stance).ok) {
      applyCommand(state, { type: "useAbility", unitId: unit.id, ability: stance, col: 0, row: 0 }, pid);
      return;
    }
  }

  // Defend a threatened city: fall back to garrison it (rather than chasing the
  // raider into the open). If already standing in the threatened city, hold the
  // walls. While crushing a war, only cities in real danger pull units off the front.
  for (const city of citiesOf(state, unit.ownerId)) {
    if (!cityNeedsRelief(state, pid, city, pushOffense)) continue;
    if (unit.col === city.col && unit.row === city.row) return; // hold the walls
    stepToward(state, unit, city.col, city.row, pid);
    return;
  }

  // Escort duty: shepherd an assigned settler to its new home instead of roaming off
  // to clear camps. Immediate attacks were already handled above (a raider we could
  // favourably hit, we hit), so here we position: interpose ourselves toward the
  // nearest raider menacing the settler, else march at its side (staying adjacent so
  // we don't block the tile it needs to move onto).
  if (escortSettlerId !== undefined) {
    const settler = state.units.get(escortSettlerId);
    if (settler && settler.ownerId === pid) {
      let menace: { col: number; row: number } | null = null;
      let menaceD = Infinity;
      for (const e of state.units.values()) {
        if (!isHostile(state, pid, e.ownerId)) continue;
        const d = axialDistance(ax(settler), ax(e));
        if (d <= 3 && d < menaceD) {
          menaceD = d;
          menace = { col: e.col, row: e.row };
        }
      }
      if (menace) {
        stepToward(state, unit, menace.col, menace.row, pid);
        return;
      }
      if (axialDistance(ax(unit), ax(settler)) > 1) {
        stepToward(state, unit, settler.col, settler.row, pid);
        return;
      }
      return; // at the settler's side with no threat in sight — hold and guard
    }
  }

  // Race for tribal villages and barbarian camps before other errands — villages
  // are one-shot prizes any rival can steal, so grab them while we can.
  if (aiHuntMapFeatures(state, unit, pid)) return;

  // Economic warfare: raze an enemy improvement we're standing on (isHostile means
  // we're at war with — or raiding — its owner, so this is never an unprovoked act).
  {
    const here = getTile(state.map, unit.col, unit.row);
    const owner = here?.ownerCityId !== undefined ? state.cities.get(here.ownerCityId) : undefined;
    if (here?.improvement && owner && isHostile(state, pid, owner.ownerId)) {
      if (applyCommand(state, { type: "pillage", unitId: unit.id }, pid).ok) return;
    }
  }

  // Converge on the enemy's nearest city to actually take it — this turns a
  // declared war into a real campaign rather than aimless skirmishing.
  const objective = nearestHostileCity(state, unit, pid);
  if (objective) {
    stepToward(state, unit, objective.col, objective.row, pid);
    return;
  }

  // Nothing to collect: pressure the nearest hostile unit, or scout if all is quiet.
  const enemy = nearestHostile(state, unit, pid);
  if (enemy) stepToward(state, unit, enemy.col, enemy.row, pid);
  else aiExplore(state, unit, pid);
}

/** Recon units reveal the map and avoid combat — they're fragile and level by scouting. */
function aiScout(state: GameState, unit: Unit, pid: number): void {
  const threat = nearestHostile(state, unit, pid);
  if (threat && axialDistance(ax(unit), ax(threat)) <= 2) {
    // Slip away toward the nearest city rather than trade blows.
    const home = citiesOf(state, pid)
      .map((c) => ({ col: c.col, row: c.row, d: axialDistance(ax(unit), ax(c)) }))
      .sort((a, b) => a.d - b.d)[0];
    if (home && home.d > 0) {
      stepToward(state, unit, home.col, home.row, pid);
      return;
    }
  }
  // Villages are the scout's top job — any unit can collect them and rivals race
  // for the same reward, so beeline every discovered one before exploring further.
  if (aiHuntVillage(state, unit, pid)) return;
  aiExplore(state, unit, pid);
}

/**
 * Spend stockpiled gold/faith/culture to hurry production when it counts — finishing
 * a wonder we're racing for, hurrying out settlers to win the expansion race, rushing
 * troops under threat, and pouring a deep treasury into faster city development. Faith
 * and culture (cheaper, and only via perks) are spent before precious gold, and each
 * pool keeps a reserve so rushing never bankrupts religion, civics, or the treasury.
 */
function aiRush(state: GameState, player: Player, p: DiploPersonality, threatened: boolean, escortShortfall = false): void {
  const pid = player.id;
  const avail = rushCurrencies(state, pid);
  if (avail.length === 0) return;
  const atWar = player.atWar.length > 0;
  // Keep a war chest while fighting; at peace, spend more freely to out-tempo rivals
  // (but never so low that next turn's upkeep tips us into bankruptcy and disbanding).
  const reserve: Record<RushCurrency, number> = { gold: atWar ? 30 : 50, faith: 40, culture: 40 };
  const poolOf = (c: RushCurrency) => (c === "gold" ? player.gold : c === "faith" ? player.faith : player.cultureProgress);
  // Choose the cheapest affordable currency (culture → faith → gold) that still
  // leaves its reserve intact after paying.
  const choose = (cost: (c: RushCurrency) => { ok: boolean; cost?: number }): RushCurrency | null => {
    for (const c of ["culture", "faith", "gold"] as RushCurrency[]) {
      if (!avail.includes(c)) continue;
      const r = cost(c);
      if (!r.ok || r.cost == null) continue;
      if (poolOf(c) - r.cost < reserve[c]) continue;
      return c;
    }
    return null;
  };

  // 1) Race to finish wonders — being first to a wonder is worth the splurge.
  for (const w of worksOf(state, pid)) {
    if (w.kind !== "wonder") continue;
    const c = choose((cur) => canRushWork(state, pid, w.id, cur));
    if (c) applyCommand(state, { type: "rushWork", workId: w.id, currency: c }, pid);
  }
  // 2) Win the land grab: while still expanding at peace, hurry any settler in muster
  //    out the door. A rushed settler founds a whole city many turns ahead of schedule
  //    — the single biggest tempo swing the AI can buy.
  if (!threatened) {
    const empireSize = citiesOf(state, pid).length + unitsOf(state, pid).filter((u) => u.type === "settler").length;
    if (empireSize <= targetCityCount(p)) {
      for (const city of citiesOf(state, pid)) {
        for (const order of city.trainingQueue) {
          if (order.unit !== "settler") continue;
          const c = choose((cur) => canRushTraining(state, pid, city.id, order.id, cur));
          if (c) applyCommand(state, { type: "rushTraining", cityId: city.id, orderId: order.id, currency: c }, pid);
        }
      }
    }
  }
  // 3) Hurry out the troops we're training — to meet a danger, push a winning war, or
  //    get a guard marching toward a stranded settler.
  const winningWar = atWar && conquestLeadRatio(state, pid) >= 1.4;
  if (threatened || escortShortfall || winningWar) {
    for (const city of citiesOf(state, pid)) {
      for (const order of city.trainingQueue) {
        if (!isMilitary(order.unit)) continue;
        const c = choose((cur) => canRushTraining(state, pid, city.id, order.id, cur));
        if (c) applyCommand(state, { type: "rushTraining", cityId: city.id, orderId: order.id, currency: c }, pid);
      }
    }
  }
  // 4) Don't let gold sit idle: pour a healthy surplus into faster city development,
  //    keeping a reserve (a real war chest when fighting). The old bar (gold > 400)
  //    almost never tripped; this invests far more readily so a rich AI snowballs.
  const goldFloor = atWar ? 250 : 120;
  if (player.gold > goldFloor) {
    for (const city of citiesOf(state, pid)) {
      if (player.gold <= goldFloor) break;
      if (!city.production) continue;
      const r = canRushCity(state, pid, city.id, "gold");
      if (r.ok && r.cost != null && player.gold - r.cost >= goldFloor) {
        applyCommand(state, { type: "rushProduction", cityId: city.id, currency: "gold" }, pid);
      }
    }
  }
}

// ---- active victory pursuit ----------------------------------------------

/**
 * A builder-victory civ courts mutual open borders with peaceful neighbours. Open
 * borders are the gate to three things the AI otherwise can't reach: international
 * trade routes (economic power), missionaries crossing into rival cities (religious
 * conversion), and a tourism multiplier (culture). The deal is symmetric, so a civ
 * that isn't openly hostile almost always agrees.
 */
export function aiSeekOpenBorders(state: GameState, player: Player, focus: VictoryKind): void {
  if (focus !== "economic" && focus !== "culture" && focus !== "religious") return;
  const pid = player.id;
  for (const otherId of player.met) {
    // Throttle: weigh each neighbour roughly every ten turns, not every single turn.
    if ((state.turn + pid * 7 + otherId) % 10 !== 0) continue;
    const r = relationBetween(state, pid, otherId);
    if (!r || r.status !== "peace" || r.openBorders) continue;
    const other = playerById(state, otherId);
    if (!other || other.isBarbarian) continue;
    if (attitudeScore(state, pid, otherId) <= -25) continue; // a hostile civ would refuse
    if (state.diploProposals.some((pr) => pr.fromId === pid && pr.toId === otherId && pr.status === "pending")) continue;
    proposeDeal(state, pid, otherId, [{ kind: "openBorders" }], [{ kind: "openBorders" }]);
  }
}

/** Closest hop from any of our forces/cities to a rival's nearest city. */
function nearestRivalCityDistance(state: GameState, pid: number, otherId: number): number {
  const mine = [
    ...citiesOf(state, pid).map((c) => ax(c)),
    ...unitsOf(state, pid).filter((u) => isMilitary(u.type)).map((u) => ax(u)),
  ];
  let best = Infinity;
  for (const c of citiesOf(state, otherId)) {
    const t = ax(c);
    for (const m of mine) best = Math.min(best, axialDistance(m, t));
  }
  return best;
}

/**
 * A strong civ doesn't wait to be provoked. Once it fields a real army and a weaker
 * neighbour is reachable, it declares war and storms their cities — the per-unit
 * military AI already converges on enemy capitals. When the home continent is locked
 * down and a fleet is ready, it also opens wars across the sea.
 */
export function aiSeekConquest(state: GameState, player: Player, focus: VictoryKind): void {
  const pid = player.id;
  const p = personalityOf(state, pid);
  const army = unitsOf(state, pid).filter((u) => isMilitary(u.type) && u.hp >= 40).length;
  if (army < 3) return;

  const overseas = dominatesHomeContinent(state, pid);
  const navalReady = navalInvasionReady(state, player);
  const warmonger = focus === "domination" || p.aggression > 0.55;

  let bestPeaceRatio = 1;
  for (const otherId of player.met) {
    const other = playerById(state, otherId);
    if (!other || other.isBarbarian || citiesOf(state, otherId).length === 0) continue;
    const r = relationBetween(state, pid, otherId);
    if (!r || r.status !== "peace") continue;
    bestPeaceRatio = Math.max(bestPeaceRatio, powerRatio(state, pid, otherId));
  }

  if (!warmonger && bestPeaceRatio < 1.45) return;

  if (player.atWar.length > 0) {
    let worstWarRatio = Infinity;
    for (const id of player.atWar) {
      if (playerById(state, id)?.isBarbarian) continue;
      worstWarRatio = Math.min(worstWarRatio, powerRatio(state, pid, id));
    }
    if (worstWarRatio < 1.15) return; // losing the current war — consolidate first
    if (player.atWar.length >= 2 && bestPeaceRatio < 1.85) return;
  }

  const minRatio = bestPeaceRatio >= 2 ? 1.1 : bestPeaceRatio >= 1.6 ? 1.15 : warmonger ? 1.2 : 1.35;
  const anchor = homeAnchor(state, pid);

  let target: number | null = null;
  let bestScore = -Infinity;
  for (const otherId of player.met) {
    if (player.atWar.includes(otherId)) continue;
    const r = relationBetween(state, pid, otherId);
    if (!r || r.status !== "peace" || r.pact !== "none") continue;
    if (r.warAllowedTurn !== undefined && state.turn < r.warAllowedTurn) continue;
    const other = playerById(state, otherId);
    if (!other || other.isBarbarian || citiesOf(state, otherId).length === 0) continue;
    const ratio = powerRatio(state, pid, otherId);
    if (ratio < minRatio) continue;
    const reach = nearestRivalCityDistance(state, pid, otherId);
    const onOtherContinent = anchor != null && citiesOf(state, otherId).some((c) => !sameLandmass(state, anchor, c));
    const maxReach = onOtherContinent
      ? (overseas && navalReady ? 999 : 14)
      : 20;
    if (reach > maxReach) continue;
    const bonus = onOtherContinent && overseas && navalReady ? 20 : 0;
    const score = ratio * 10 - reach * 0.4 + bonus;
    if (score > bestScore) { bestScore = score; target = otherId; }
  }
  if (target !== null) declareWar(state, pid, target);
}

/** The longitude sector (0..5) a map column falls in — mirrors science-victory.ts. */
function sectorOfCol(col: number, cols: number): number {
  return Math.min(5, Math.floor((col / Math.max(1, cols)) * 6));
}

/**
 * Send a science civ's voyager toward the nearest unvisited longitude sector's water,
 * chipping away at the circumnavigation capstone (a ship — or an embarked land unit —
 * must visit every sector). stepToward handles embarking from the coast. Returns true if
 * it took the helm of this unit. Only worth doing once the civ can actually put to sea.
 */
function aiCircumnavigate(state: GameState, unit: Unit, pid: number): boolean {
  const me = playerById(state, pid);
  if (!me?.researched.has("sailing")) return false;
  const visited = new Set(me.circumnavigation?.visitedSectors ?? []);
  if (visited.size >= 6) return false; // already circled the globe
  const cols = state.map.cols;
  let best: { col: number; row: number } | null = null;
  let bestD = Infinity;
  for (const t of state.map.tiles) {
    if (!isWaterTerrain(t.terrain) || visited.has(sectorOfCol(t.col, cols))) continue;
    const d = axialDistance(ax(unit), ax({ col: t.col, row: t.row }));
    if (d < bestD) { bestD = d; best = { col: t.col, row: t.row }; }
  }
  if (!best) return false;
  stepToward(state, unit, best.col, best.row, pid);
  return true;
}

/** Play a full turn for an AI-controlled civ. */
export function aiTakeTurn(state: GameState, playerId: number): void {
  const player = playerById(state, playerId);
  if (!player) return;
  const p = personalityOf(state, playerId);
  const atWarNow = player.atWar.length > 0;
  const threatened = atWarNow || hostileNearCities(state, playerId);
  // The victory this civ is actively steering toward — it biases wonders, construction,
  // research, religion and naval exploration below so the AI plays to win, not just to grow.
  const focus = aiVictoryFocus(state, player, p);

  aiConsiderDiplomacy(state, playerId); // declare/sue for war, court friends
  aiSeekOpenBorders(state, player, focus); // court open borders for trade/faith/tourism
  aiSeekConquest(state, player, focus); // a warmonger opens a war it can win

  // Military pay (upkeep modifier): pay more in war to steady morale when affordable;
  // economise in peacetime, especially when the treasury is thin.
  const targetUpkeep = atWarNow ? (player.gold > 100 ? 50 : 0) : (player.gold < 0 ? -50 : 0);
  if (targetUpkeep !== player.upkeepModifierPct) {
    applyCommand(state, { type: "setUpkeepModifier", pct: targetUpkeep }, playerId);
  }

  // Use the civilization's active leader ability if it is off cooldown and affordable.
  if (canUseLeaderAbility(state, player).ok) {
    applyCommand(state, { type: "useLeaderAbility" }, playerId);
  }

  // Put any recruited Great People straight to work (their instant effects).
  for (const id of [...(player.greatPeople ?? [])]) {
    applyCommand(state, { type: "activateGreatPerson", greatPersonId: id }, playerId);
  }

  if (!player.researching) {
    const techs = availableTechs(player);
    if (techs.length > 0) {
      // With barbarians on the map, grab cheap Parley (and its lone prereq) early —
      // bribing and recruiting raiders is a powerful survival tool the AI ignored before.
      // We wait until the food opener (cultivation) is in so growth isn't delayed for it.
      const barbWorld = state.players.some((pl) => pl.isBarbarian);
      let techId: TechId;
      if (barbWorld && !player.researched.has(BARBARIAN_DIPLOMACY_TECH) && player.researched.has("cultivation" as TechId)) {
        techId = techs.includes(BARBARIAN_DIPLOMACY_TECH)
          ? BARBARIAN_DIPLOMACY_TECH
          : (techs.includes("foraging" as TechId) ? ("foraging" as TechId) : pickTech(techs, p, atWarNow));
      } else {
        techId = pickTech(techs, p, atWarNow);
      }
      applyCommand(state, { type: "setResearch", techId }, playerId);
    }
  }

  // Government tree: research the node with the best value for this personality
  // (its effects + the best civics it would unlock). Research is free of unrest,
  // so it is fine to research wide and hold one (docs/CIVICS §7.1, §7.3).
  if (!player.researchingGovernment) {
    const pick = researchableGovernmentsFor(player)
      .sort((a, b) => governmentValue(b, p, atWarNow) - governmentValue(a, p, atWarNow))[0];
    if (pick) applyCommand(state, { type: "setResearchGovernment", governmentId: pick }, playerId);
  }
  // Switch to the best-value researched government, but weigh the unrest cost of a
  // revolution and never revolt mid-war unless the target is war-leaning (§7.2).
  {
    const cur = getGovernment(player.government);
    const curValue = governmentValue(player.government, p, atWarNow);
    const best = switchableGovernments(player)
      .filter((id) => id !== player.government)
      .sort((a, b) => governmentValue(b, p, atWarNow) - governmentValue(a, p, atWarNow))[0];
    const target = best ? getGovernment(best) : undefined;
    if (target) {
      const sharesBranch = cur ? cur.branch.some((br) => target.branch.includes(br)) : false;
      const unrest = player.government === "chiefdom" ? 0 : sharesBranch ? 1 : 3;
      const gain = governmentValue(best!, p, atWarNow) - curValue;
      // Each unrest turn ≈ 2 points of foregone value; only switch if the gain clears it.
      const worthIt = gain > unrest * 2;
      const warBlocks = atWarNow && unrest > 0 && !target.branch.includes("authority");
      if (worthIt && !warBlocks) applyCommand(state, { type: "setGovernment", governmentId: best! }, playerId);
    }
  }
  // Adopt the best affordable legal civic (one adoption per turn).
  for (const cid of rankCivics(adoptableCivics(player), p, atWarNow)) {
    if (applyCommand(state, { type: "adoptCivic", civicId: cid }, playerId).ok) break;
  }
  // Slot adopted civics best-first into any free slots.
  for (const cid of rankCivics(slottableCivics(player), p, atWarNow)) {
    if (player.slottedCivics.length >= civicSlotCapacity(player)) break;
    applyCommand(state, { type: "slotCivic", civicId: cid }, playerId);
  }

  // Recruit a Legend when enough track glory is banked — prefer the track with the most progress.
  if (state.legendsEnabled) {
    const options = availableLegendsForPlayer(state, playerId)
      .filter((l) => canRecruitLegend(state, playerId, l.id).ok);
    const pick = options[0];
    if (pick) applyCommand(state, { type: "recruitLegend", legendId: pick.id }, playerId);
  }

  // Found a religion once enough faith is stored.
  if (canFoundReligion(state, playerId)) {
    const city = citiesOf(state, playerId)[0];
    if (city) {
      const name = availableReligionNames(state)[0] ?? "";
      applyCommand(state, { type: "foundReligion", cityId: city.id, name, beliefs: pickBeliefs(state, p) }, playerId);
    }
  }

  // Tend the founded faith: spend any unspent perk picks, then rise a tier when
  // the followers and the faith reserve allow (a religious-victory civ upgrades
  // eagerly; others keep a cushion for missionaries and legends).
  if (player.foundedReligionId) {
    const relId = player.foundedReligionId;
    for (const perk of rankPerks(availablePerks(state, relId), p)) {
      if (!applyCommand(state, { type: "pickReligionPerk", perkId: perk }, playerId).ok) break;
    }
    const req = nextTierRequirement(state, relId);
    const cushion = focus === "religious" ? 0 : 150;
    if (req && player.faith >= req.faithCost + cushion && canUpgradeReligion(state, playerId).ok) {
      applyCommand(state, { type: "upgradeReligion" }, playerId);
      for (const perk of rankPerks(availablePerks(state, relId), p)) {
        if (!applyCommand(state, { type: "pickReligionPerk", perkId: perk }, playerId).ok) break;
      }
    }
  }

  // Evangelize the empire: buy a missionary to convert any cities not yet ours in faith.
  aiBuyMissionaries(state, player, playerId, focus);

  // Plan each settler's destination once (safety-aware). This drives the guard
  // assignment below AND tells the city/rush passes whether we must muster an extra
  // warrior: a settler bound for dangerous ground with no soldier free to guard it is
  // an "escort shortfall" we answer by raising — and hurrying — a fresh warrior.
  const settlePlans = new Map<number, SettlePlan>();
  const reservedSites = new Set<string>();
  for (const u of unitsOf(state, playerId)) {
    if (!UNIT_DEFS[u.type].founder) continue;
    const plan = planSettle(state, u, playerId, reservedSites);
    if (plan) {
      settlePlans.set(u.id, plan);
      reservedSites.add(`${plan.col},${plan.row}`);
    }
  }
  const escorts = assignEscorts(state, playerId, settlePlans);
  const guarded = new Set(escorts.values());
  const escortShortfall = [...settlePlans.entries()].some(
    ([id, plan]) => plan.safe === false && !guarded.has(id),
  );

  for (const city of citiesOf(state, playerId)) {
    if (!city.production) {
      const item = chooseConstruction(state, player, city, p, focus);
      if (item) applyCommand(state, { type: "setProduction", cityId: city.id, item }, playerId);
    }
    aiTrainUnits(state, player, city, p, escortShortfall);
    aiTrainReligionUnit(state, player, city, p, focus); // muster the faith's holy unit
    aiManageCity(state, city, player, playerId);
  }
  aiWonders(state, playerId, p, focus);
  aiAssignSpecialists(state, playerId); // staff the works just queued (manual assignment)
  aiRush(state, player, p, threatened, escortShortfall); // hurry wonders / settlers / troops
  aiCityBombard(state, playerId);

  // A science civ dedicates its first recon unit to the circumnavigation capstone —
  // sailing the globe — while the rest scout as normal.
  const voyagerId = focus === "science"
    ? unitsOf(state, playerId).filter((u) => UNIT_DEFS[u.type].cls === "recon").sort((a, b) => a.id - b.id)[0]?.id
    : undefined;

  for (const unit of unitsOf(state, playerId)) {
    if (!state.units.has(unit.id)) continue;
    const def = UNIT_DEFS[unit.type];
    if (unit.unspentPromotions > 0) aiPromote(state, unit, playerId);
    if (def.founder) aiSettler(state, unit, playerId, settlePlans.get(unit.id));
    else if (def.trader) aiTrader(state, unit, playerId);
    else if (def.religious) aiReligiousUnit(state, unit, playerId, focus);
    else if (religionUnitKit(unit.type)) aiReligionUnit(state, unit, playerId, focus);
    else if (def.cls === "recon") {
      if (unit.id === voyagerId && aiCircumnavigate(state, unit, playerId)) continue;
      aiScout(state, unit, playerId);
    }
    else aiMilitary(state, unit, playerId, escorts.get(unit.id));
  }

  // After the army has manoeuvred, parley with any barbarians it now stands beside —
  // recruit the ones we want, buy a truce with bands that are pressing us.
  aiBarbarianDiplomacy(state, player, threatened);
}
