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
import { computeAttackTargets, unitMaxHp, combatPreview, cityBombardTargets, cityBombardStrength, cityBombardAllowance, cityBombardsUsed, defenseStrengthVsBombard, damageFrom, cityMaxHp } from "./combat";
import { abilityTargets, canUseAbility, unitAbilities } from "./abilities";
import { religionUnitKit, religionInstanceForDefId, cityMajorityFaith } from "./religion-units";
import { availableProduction, availableTechs, workableTiles } from "./economy";
import { adoptableCivics, researchableGovernmentsFor, switchableGovernments, slottableCivics, civicSlotCapacity, getCivic, getGovernment, governmentTier, CIVICS, civicLegal } from "./civs";
import { canFoundReligion, availableReligionNames, buyReligiousUnit, religiousUnitCost, availablePerks, canUpgradeReligion, nextTierRequirement, takenPerkIds, religionUnlocked } from "./religion";
import { availableLegendsForPlayer, canRecruitLegend, legendRecruitCostFor, legendTrackFor, legendTrackPointsOf } from "./legends";
import { canUseLeaderAbility } from "./leader-abilities";
import { canEstablishTradeRoute, tradeRouteDestinations } from "./trade";
import { aiConsiderDiplomacy, atWar, personalityOf, proposeDeal, relationBetween, attitudeScore, powerRatio, declareWar } from "./diplomacy";
import { availablePromotions } from "./combat";
import { rushCurrencies, canRushWork, canRushTraining, canRushCity, type RushCurrency } from "./rush";
import { availableTraining, freeCitizens } from "./training";
import { BELIEFS, WONDER_DEFS, uniqueUnitForCiv, type CivEffects, type DiploPersonality, type WonderDef } from "@roc/data";
import {
  availableSpecialists,
  workerSlots,
  SPECIALIST_DEFS,
  releaseIdleGovernorSpecialists,
  isPendingGovernorRelease,
  specialistIdForDiscipline,
  specialistUnlocked,
  type SpecialistId,
} from "./specialists";
import {
  nextTierAt,
  worksOf,
  worksOfCity,
  workDiscipline,
  workDisciplines,
  canStartWonder,
  cancelWork,
  crewShortfall,
  assignSpecialist,
  assignedSpecialistIds,
  unassignSpecialistEverywhere,
  wonderStartCost,
  wonderHasBuildSite,
} from "./works";
import { offsetNeighbors } from "./movement";
import { computeRoadPath, startRoadRoute, tilesNeedingRoad } from "./road-routes";
import { RESOURCE_DEFS, resourceActive } from "./resources";
import { isPassableLand, isWaterTerrain, tileYields } from "./terrain";
import { BARBARIAN_DIPLOMACY_TECH, UNIT_DEFS, getBuildingDef, isMilitary, isNaval, isRanged, type TechId, type TrainingClass, type UnitTypeId } from "./content";
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
  type Discipline,
  type GameState,
  type Player,
  type ProductionItem,
  type Unit,
  type VictoryKind,
} from "./state";

interface AiWonderContext {
  target?: WonderDef;
  gatheringCrew: boolean;
  building: boolean;
}

/** True once the empire has grown past the opening — enough cities and population
 *  to justify a grand wonder project while tile works (farms, mines, roads) continue. */
function empireDevelopedForWonders(state: GameState, pid: number, player: Player): boolean {
  const cities = citiesOf(state, pid);
  if (cities.length < 2) return false;
  if (!player.researched.has("masonry" as TechId)) return false;
  const pop = cities.reduce((sum, c) => sum + c.population, 0);
  if (pop < 16) return false;
  if (pop / cities.length < 4) return false;
  if (!cities.some((c) => c.population >= 6)) return false;
  return true;
}

function empireHasDiscipline(state: GameState, pid: number, disc: Discipline): boolean {
  return citiesOf(state, pid).some((c) =>
    c.specialists.some((s) => SPECIALIST_DEFS[s.type as SpecialistId]?.discipline === disc),
  );
}

function wonderDisciplinesReady(state: GameState, pid: number, player: Player, wonder: WonderDef): boolean {
  for (const disc of Object.keys(wonder.crew) as Discipline[]) {
    const specId = specialistIdForDiscipline(disc);
    if (!specId) return false;
    if (!specialistUnlocked(player, specId) && !empireHasDiscipline(state, pid, disc)) return false;
  }
  return true;
}

function crewReadinessGap(state: GameState, pid: number, crew: Partial<Record<Discipline, number>>): number {
  return crewShortfall(state, pid, crew).reduce((sum, s) => sum + (s.need - s.have), 0);
}

function wonderAffordGap(player: Player, wonder: WonderDef): number {
  const cost = wonderStartCost(wonder);
  return Math.max(0, cost.gold - player.gold)
    + Math.max(0, cost.faith - player.faith) * 2
    + Math.max(0, cost.culture - player.cultureProgress) * 2;
}

function wonderStartAffordable(player: Player, wonder: WonderDef): boolean {
  const cost = wonderStartCost(wonder);
  return player.gold >= cost.gold && player.faith >= cost.faith && player.cultureProgress >= cost.culture;
}

/** The least strategic value (see wonderScore) a wonder must offer this civ before it
 *  is worth committing crew and treasury to. wonderScore starts every wonder at 1, so a
 *  bar of 2 keeps any wonder with at least one yield this civ actually values and drops
 *  pure filler — a faith wonder for a warmonger, a gold-only Colossus for a civ that
 *  isn't chasing wealth — that the AI is better off not breaking ground on. */
const MIN_WONDER_VALUE = 2;

/** How badly the AI wants a given wonder: its strategic value LEADS, discounted by how
 *  far it still is from buildable (missing crew, unaffordable) so an equally-useful but
 *  reachable wonder wins. Value-first means the AI commits to the wonder that serves its
 *  strategy, not merely the cheapest one it happens to be able to break ground on. */
function wonderDesirability(
  state: GameState,
  pid: number,
  player: Player,
  w: WonderDef,
  p: DiploPersonality,
  focus: VictoryKind,
): number {
  const value = wonderScore(w.effect, p, focus);
  const crewGap = crewReadinessGap(state, pid, w.crew as Partial<Record<Discipline, number>>);
  const affordGap = wonderAffordGap(player, w);
  return value - crewGap * 0.5 - affordGap / 400;
}

/** Wonders this civ could build once tech and treasury are ready. */
function aiWonderPlanCandidates(
  state: GameState,
  pid: number,
  player: Player,
  p: DiploPersonality,
  focus: VictoryKind,
): WonderDef[] {
  if (!empireDevelopedForWonders(state, pid, player)) return [];
  return WONDER_DEFS.filter(
    (w) => !state.completedWonders.includes(w.id) && !worksOf(state, pid).some((x) => x.wonderId === w.id),
  )
    .filter((w) => !w.reqTech || player.researched.has(w.reqTech as TechId))
    .filter((w) => wonderHasBuildSite(state, pid, w.id))
    .filter((w) => wonderDisciplinesReady(state, pid, player, w))
    // Only wonders whose effect actually serves this civ — no chasing filler.
    .filter((w) => wonderScore(w.effect, p, focus) >= MIN_WONDER_VALUE)
    // Most wanted first: strategic value, discounted by how far off it still is.
    .sort(
      (a, b) =>
        wonderDesirability(state, pid, player, b, p, focus) -
        wonderDesirability(state, pid, player, a, p, focus),
    );
}

/** Wonders the civ can break ground on this turn. */
function aiWonderCandidates(
  state: GameState,
  pid: number,
  player: Player,
  p: DiploPersonality,
  focus: VictoryKind,
): WonderDef[] {
  return aiWonderPlanCandidates(state, pid, player, p, focus).filter((w) => wonderStartAffordable(player, w));
}

function pickAiWonderTarget(
  state: GameState,
  pid: number,
  player: Player,
  p: DiploPersonality,
  focus: VictoryKind,
): WonderDef | undefined {
  if (worksOf(state, pid).some((w) => w.kind === "wonder")) return undefined;
  const ready = aiWonderPlanCandidates(state, pid, player, p, focus).filter((w) => {
    const cost = wonderStartCost(w);
    if (cost.culture > 0 && player.cultureProgress < cost.culture) return false;
    if (cost.faith > 0 && player.faith < cost.faith) return false;
    return true;
  });
  if (ready[0]) return ready[0];
  return aiWonderPlanCandidates(state, pid, player, p, focus)[0];
}

function specialistById(state: GameState, pid: number, specialistId: number) {
  for (const city of citiesOf(state, pid)) {
    const found = city.specialists.find((s) => s.id === specialistId);
    if (found) return found;
  }
  return undefined;
}

function aiWonderContext(state: GameState, pid: number, player: Player, p: DiploPersonality, focus: VictoryKind): AiWonderContext {
  if (!empireDevelopedForWonders(state, pid, player)) {
    return { gatheringCrew: false, building: false };
  }
  const building = worksOf(state, pid).some((w) => w.kind === "wonder");
  const target = building
    ? WONDER_DEFS.find((w) => worksOf(state, pid).some((x) => x.wonderId === w.id))
    : pickAiWonderTarget(state, pid, player, p, focus);
  const techReady = !target?.reqTech || player.researched.has(target.reqTech as TechId);
  const crewReady =
    !target || crewShortfall(state, pid, target.crew as Partial<Record<Discipline, number>>).length === 0;
  const affordable = !target || wonderStartAffordable(player, target);
  // Only freeze tile works the turn we break ground (crew + gold ready). Until then
  // keep improving farms, mines, and roads while training specialists organically.
  const breakingGround = !!target && !building && techReady && crewReady && affordable;
  return { target, gatheringCrew: breakingGround, building };
}

function aiWonderResearchPick(
  state: GameState,
  pid: number,
  player: Player,
  techs: TechId[],
  atWarNow: boolean,
  threatened: boolean,
): TechId | null {
  if (threatened && atWarNow) return null;
  if (!empireDevelopedForWonders(state, pid, player)) return null;
  const p = personalityOf(state, pid);
  const focus = aiVictoryFocus(state, player, p);
  const target = pickAiWonderTarget(state, pid, player, p, focus);
  if (target?.reqTech && techs.includes(target.reqTech as TechId) && !player.researched.has(target.reqTech as TechId)) {
    return target.reqTech as TechId;
  }
  for (const t of ["masonry", "writing", "irrigation", "engineering", "bronze_alloying", "sailing"] as TechId[]) {
    if (techs.includes(t) && !player.researched.has(t)) return t;
  }
  if (target) {
    for (const disc of Object.keys(target.crew)) {
      if (disc === "engineering" && !player.researched.has("engineering") && techs.includes("engineering")) return "engineering";
      if (disc === "architecture" && !player.researched.has("masonry") && techs.includes("masonry")) return "masonry";
      if (disc === "masonry" && !player.researched.has("masonry") && techs.includes("masonry")) return "masonry";
      if (disc === "carpentry" && !player.researched.has("native_copper") && techs.includes("native_copper")) return "native_copper";
    }
  }
  return null;
}

function aiCancelNonWonderWorks(state: GameState, pid: number): void {
  for (const w of [...worksOf(state, pid)]) {
    if (w.kind !== "wonder") cancelWork(state, w.id, pid);
  }
}

/** Drop competing tile works only while a wonder is actively under construction,
 *  or on the single turn we break ground (crew and treasury are finally ready). */
function aiWonderClearDistractions(state: GameState, pid: number, wonderCtx: AiWonderContext): void {
  if (!wonderCtx.building && !wonderCtx.gatheringCrew) return;
  aiCancelNonWonderWorks(state, pid);
}

function aiFreeWonderCrew(state: GameState, pid: number, wonder: WonderDef): void {
  const short = crewShortfall(state, pid, wonder.crew as Partial<Record<Discipline, number>>);
  if (short.length === 0) return;
  const needDisc = new Set(short.map((s) => s.disc));
  for (const w of worksOf(state, pid)) {
    if (w.kind === "wonder") continue;
    for (const sid of [...w.assignedSpecialistIds]) {
      const spec = specialistById(state, pid, sid);
      const disc = spec ? SPECIALIST_DEFS[spec.type as SpecialistId]?.discipline : undefined;
      if (disc && needDisc.has(disc)) unassignSpecialistEverywhere(state, pid, sid);
    }
  }
}

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

/** True when at war with a major civ and our military power meets or beats theirs. */
function winningAtWar(state: GameState, pid: number): boolean {
  const player = playerById(state, pid);
  if (!player || player.atWar.length === 0) return false;
  return conquestLeadRatio(state, pid) >= 1.0;
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
  // Growth first (a Granary + Storehouse feed bigger cities → more pop for
  // everything), then the commerce/science/culture core, including the Bank and
  // Museum that drive the economic and culture victories.
  const order: string[] = ["granary", "storehouse", "shrine", "workshop", "market", "library", "monument"];
  if (coastal) order.unshift("harbor");
  // Frontier / war cities harden themselves: Walls → Castle → Ballista Towers, plus a
  // Beacon network where two or more of our cities sit within signalling range, and an
  // Infirmary to keep the staged army healed. (availableProduction enforces the chain,
  // so Castle only surfaces once Walls stand.)
  const beaconAura = getBuildingDef("beacon_tower")?.effects?.cityDefenseAura;
  const beaconCluster = beaconAura
    ? citiesOf(state, player.id).some((c) =>
        c.id !== city.id &&
        axialDistance(offsetToAxial(city), offsetToAxial(c)) <= beaconAura.radius)
    : false;
  const localThreat = hostileNearCity(state, player.id, city, 3);
  if (warMinded || localThreat) {
    order.unshift("infirmary", "ballista_towers", "castle", "walls");
    if (beaconCluster) order.unshift("beacon_tower");
    order.push("bombard_tower"); // late-era gun tower
  }
  // Military-production support once the city trains a real army (barracks/range tier 2+).
  const trainsArmies = (city.training.barracks ?? 0) >= 2 || (city.training.archery_range ?? 0) >= 2;
  if (trainsArmies || warMinded) order.unshift("armoury", "drill_yard");
  if (warMinded) order.unshift("walls"); // fortify the frontier before it's tested
  if (player.gold <= 0) order.unshift("market"); // prioritise income when broke
  // The civ's victory focus pulls its win-condition buildings to the front of the queue:
  // commerce for an economic hegemony, culture buildings for tourism, science buildings
  // for the Great Endeavor, shrines/temples for a religious crusade.
  const focusBuildings: Partial<Record<VictoryKind, string[]>> = {
    economic: ["market", "bank", "harbor"],
    culture: ["amphitheater", "monument", "triumphal_arch", "museum", "temple"],
    science: ["library", "academy"],
    religious: ["shrine", "temple"],
  };
  for (const id of [...(focusBuildings[focus] ?? [])].reverse()) order.unshift(id);
  // A Triumphal Arch (culture + a battlefield morale aura) is worth more while at war.
  if (atWar) order.unshift("triumphal_arch");
  order.push(
    "forge", "bank", "monument", "amphitheater", "triumphal_arch", "academy", "museum",
    "aqueduct", "temple", "shrine", "walls", "castle", "ballista_towers", "arsenal",
    "armoury", "drill_yard", "storehouse", "infirmary", "beacon_tower", "bombard_tower", "lighthouse",
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
    ? cityCount * (winningAtWar(state, player.id) ? 3 : 2) + (winningAtWar(state, player.id) ? 4 : 2)
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
function startWorkStaffed(
  state: GameState,
  city: City,
  pid: number,
  kind: string,
  col: number,
  row: number,
  opts?: { trainIfNeeded?: boolean; player?: Player },
): boolean {
  const player = opts?.player ?? playerById(state, pid);
  const assigned = assignedSpecialistIds(state, pid);
  const picks: number[] = [];
  for (const disc of workDisciplines(kind)) {
    let s = city.specialists.find(
      (sp) =>
        !assigned.has(sp.id) &&
        !picks.includes(sp.id) &&
        !isPendingGovernorRelease(city, sp.id) &&
        SPECIALIST_DEFS[sp.type as SpecialistId]?.discipline === disc,
    );
    if (!s && opts?.trainIfNeeded && player) {
      const specId = specialistIdForDiscipline(disc);
      if (specId && specialistUnlocked(player, specId) && workerSlots(city) >= 1) {
        applyCommand(state, { type: "convertCitizen", cityId: city.id, specialistId: specId, delta: 1 }, pid);
        s = city.specialists.find(
          (sp) =>
            !assigned.has(sp.id) &&
            !picks.includes(sp.id) &&
            !isPendingGovernorRelease(city, sp.id) &&
            SPECIALIST_DEFS[sp.type as SpecialistId]?.discipline === disc,
        );
      }
    }
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
function aiManageCity(
  state: GameState,
  city: City,
  player: Player,
  pid: number,
  wonderCtx: AiWonderContext = { gatheringCrew: false, building: false },
): void {
  const focus = city.autoMode;
  const unlocked = availableSpecialists(player);
  const countOf = (id: SpecialistId) => city.specialists.filter((s) => s.type === id).length;
  const haveDiscipline = (d: string) =>
    city.specialists.some((s) => SPECIALIST_DEFS[s.type as SpecialistId]?.discipline === d);
  const canSupplyDiscipline = (d: string) => {
    if (haveDiscipline(d)) return true;
    if (!focus) return false;
    const specId = specialistIdForDiscipline(d as Discipline);
    return !!specId && unlocked.includes(specId) && workerSlots(city) >= 1;
  };
  const workOpts = focus ? { trainIfNeeded: true as const, player } : undefined;

  // Every turn: release AI specialists marked at the last focus change once idle.
  // Governor mode also drops any other idle AI-trained bench — citizens stay free
  // for tiles unless a specialist is actively staffing a work.
  if (focus) {
    const released = releaseIdleGovernorSpecialists(state, city, pid, { allIdleUnlocked: true });
    for (const id of released) unassignSpecialistEverywhere(state, pid, id);
  } else {
    const released = releaseIdleGovernorSpecialists(state, city, pid);
    for (const id of released) unassignSpecialistEverywhere(state, pid, id);
  }

  // Full AI keeps a standing bench; governor trains on demand when queueing work.
  const wants: SpecialistId[] = [];
  if (!focus) {
    let wantCarpenter = Math.min(3, Math.floor(city.population / 3));
    let wantMason = Math.min(4, Math.floor(city.population / 3));
    let wantArchitect = city.population >= 7 ? 1 : 0;
    let wantEngineer = city.population >= 6 ? 1 : 0;
    if (wonderCtx.gatheringCrew && wonderCtx.target) {
      for (const gap of crewShortfall(state, pid, wonderCtx.target.crew as Partial<Record<Discipline, number>>)) {
        const specId = specialistIdForDiscipline(gap.disc);
        if (specId === "mason") wantMason = Math.max(wantMason, Math.min(12, gap.need));
        if (specId === "architect") wantArchitect = Math.max(wantArchitect, Math.min(8, gap.need));
        if (specId === "engineer") wantEngineer = Math.max(wantEngineer, Math.min(8, gap.need));
        if (specId === "carpenter") wantCarpenter = Math.max(wantCarpenter, Math.min(8, gap.need));
      }
    } else if (wonderCtx.target && !wonderCtx.building) {
      // Soft wonder interest: nudge a modest bench while farms and mines keep running.
      wantMason = Math.max(wantMason, Math.min(6, Math.floor(city.population / 2)));
      if (city.population >= 8) wantArchitect = Math.max(wantArchitect, 1);
      if (city.population >= 7) wantEngineer = Math.max(wantEngineer, 1);
    }
    if (unlocked.includes("carpenter") && countOf("carpenter") < wantCarpenter) wants.push("carpenter");
    // A surveyor (agrimensor) is what lets a city lay roads — keep one on staff so every
    // city, whatever its governor focus, can build roads (see the road work below).
    if (unlocked.includes("agrimensor") && countOf("agrimensor") < 1) wants.push("agrimensor");
    if (unlocked.includes("mason") && countOf("mason") < wantMason) wants.push("mason");
    if (unlocked.includes("engineer") && countOf("engineer") < wantEngineer) wants.push("engineer");
    if (unlocked.includes("architect") && countOf("architect") < wantArchitect) wants.push("architect");
    if (city.population >= 9 && unlocked.includes("engineer") && countOf("engineer") < Math.max(wantEngineer, 2)) wants.push("engineer");
    if (city.population >= 11 && unlocked.includes("architect") && countOf("architect") < Math.max(wantArchitect, 2)) wants.push("architect");
  }
  for (const id of wants) {
    while (workerSlots(city) >= 1) {
      const specId = id as SpecialistId;
      const disc = SPECIALIST_DEFS[specId]?.discipline;
      const prepGap = wonderCtx.gatheringCrew && wonderCtx.target && disc
        ? crewShortfall(state, pid, wonderCtx.target.crew as Partial<Record<Discipline, number>>).find((g) => g.disc === disc)
        : undefined;
      const empireCount = prepGap
        ? citiesOf(state, pid).reduce((n, c) => n + c.specialists.filter((s) => s.type === specId).length, 0)
        : 0;
      const targetCount = prepGap
        ? prepGap.need
        : specId === "mason" ? Math.min(12, Math.floor(city.population / 2))
        : specId === "architect" || specId === "engineer" ? Math.min(8, Math.floor(city.population / 3))
        : specId === "carpenter" ? Math.min(8, Math.floor(city.population / 3))
        : 1;
      if (prepGap ? empireCount >= prepGap.need : countOf(specId) >= targetCount) break;
      if (!applyCommand(state, { type: "convertCitizen", cityId: city.id, specialistId: specId, delta: 1 }, pid).ok) break;
    }
  }

  if (focus === "military") return;

  // While a wonder is actively under construction, skip new tile works in this city.
  if (wonderCtx.building) return;

  if (worksOfCity(state, city.id).length >= 3) return; // don't over-queue

  // Defensive structure: a capital/large city with both crafts fortifies a
  // border tile (towers bombard; walls just block).
  if (city.population >= 6 && canSupplyDiscipline("masonry") && canSupplyDiscipline("engineering")) {
    const hasStructureNearby = state.map.tiles.some(
      (t) => t.structure && t.ownerCityId === city.id,
    );
    if (!hasStructureNearby) {
      for (const n of offsetNeighbors(state.map, city.col, city.row)) {
        const tile = getTile(state.map, n.col, n.row);
        if (!tile || tile.ownerCityId !== city.id || tile.improvement || tile.structure) continue;
        if (nextTierAt(tile, "tower") && startWorkStaffed(state, city, pid, "tower", n.col, n.row, workOpts)) return;
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
        if (canSupplyDiscipline(workDiscipline(needed)) && nextTierAt(tile, needed)) {
          kind = needed;
        }
      }
    }
    if (!kind && canSupplyDiscipline("carpentry") && nextTierAt(tile, "farm")) kind = "farm";
    else if (!kind && canSupplyDiscipline("carpentry") && nextTierAt(tile, "lumber_camp")) kind = "lumber_camp";
    else if (!kind && canSupplyDiscipline("masonry") && nextTierAt(tile, "mine")) kind = "mine";
    else if (
      !kind &&
      canSupplyDiscipline("survey") &&
      nextTierAt(tile, "road") &&
      (citiesOf(state, pid).length >= 2 || player.atWar.length > 0)
    ) {
      kind = "road";
    } else if (!kind && canSupplyDiscipline("survey") && player.researched.has("maritime_foraging") && nextTierAt(tile, "fishery")) {
      kind = "fishery";
    }
    if (kind && startWorkStaffed(state, city, pid, kind, col, row, workOpts)) return;
  }
}

/**
 * Link the empire with paved routes once The Wheel is known. Picks the capital
 * (or largest city) and the nearest city still missing a road connection, then
 * queues a multi-tile route the agrimensores pave automatically — same as a
 * human-drawn road route.
 */
function aiConnectRoads(state: GameState, pid: number): void {
  const player = playerById(state, pid);
  if (!player?.researched.has("the_wheel")) return;
  if (state.roadRoutes.some((r) => r.ownerId === pid && r.queue.length > 0)) return;

  const cities = citiesOf(state, pid);
  if (cities.length < 2) return;

  const hub = cities.find((c) => c.isCapital) ?? cities.reduce((a, b) => (a.population >= b.population ? a : b));
  let best: { to: typeof hub; need: number } | null = null;
  for (const other of cities) {
    if (other.id === hub.id) continue;
    const path = computeRoadPath(state, pid, hub.col, hub.row, other.col, other.row);
    if (path.length === 0) continue;
    const need = tilesNeedingRoad(state, pid, path).length;
    if (need === 0) continue;
    if (!best || need < best.need) best = { to: other, need };
  }
  if (!best) return;
  startRoadRoute(state, pid, hub.col, hub.row, best.to.col, best.to.row);
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
 *  garrison target, filling every open barracks slot each turn. */
function autoTrainMilitary(state: GameState, city: City, player: Player): void {
  const cityCount = citiesOf(state, player.id).length;
  const milCap = cityCount * 2 + 2;

  while (city.population >= 2 && freeCitizens(city) >= 1) {
    const milCount =
      unitsOf(state, player.id).filter((u) => isMilitary(u.type)).length +
      city.trainingQueue.filter((o) => isMilitary(o.unit)).length;
    if (milCount >= milCap) break;

    const trainable = availableTraining(state, player, city);
    const type = bestTrainableMilitary(trainable, player.civId);
    if (!type) break;
    if (!applyCommand(state, { type: "startTraining", cityId: city.id, unit: type }, player.id).ok) break;
  }
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

export function autoManageCity(
  state: GameState,
  city: City,
  player: Player,
  wonderCtx: AiWonderContext = { gatheringCrew: false, building: false },
): void {
  const focus = city.autoMode;
  if (!focus) return;

  // Free idle AI-trained craftsmen before skewing citizens toward the new focus.
  const released = releaseIdleGovernorSpecialists(state, city, player.id);
  for (const id of released) unassignSpecialistEverywhere(state, player.id, id);

  governorPickProduction(state, city, player);
  if (focus === "military") {
    autoTrainMilitary(state, city, player);
    return; // no new public works or specialist training while mustering troops
  }
  aiManageCity(state, city, player, player.id, wonderCtx);
}

/** Wonder prep/build context shared by the main AI turn and governor auto-manage
 *  (which runs at beginTurn before aiTakeTurn and must not steal wonder crews). */
export function aiWonderTurnContext(state: GameState, playerId: number): AiWonderContext {
  const player = playerById(state, playerId);
  if (!player) return { gatheringCrew: false, building: false };
  const p = personalityOf(state, playerId);
  const focus = aiVictoryFocus(state, player, p);
  return aiWonderContext(state, playerId, player, p, focus);
}

/** Run governor mode for every auto-managed city this player owns, then let
 *  their idle specialists (from those cities only) staff the empire's Works —
 *  mirroring what the AI does for itself, but scoped to opted-in cities. */
export function autoManageCities(state: GameState, player: Player): void {
  const autoCities = citiesOf(state, player.id).filter((c) => c.autoMode);
  if (autoCities.length === 0) return;
  const pid = player.id;
  const wonderCtx = aiWonderTurnContext(state, pid);
  aiWonderClearDistractions(state, pid, wonderCtx);
  // Route each governed city through the full governor logic (focus-building choice
  // and, for a military focus, troop training) — not the raw specialist/works manager,
  // which would leave production unset and never muster an army.
  for (const city of autoCities) autoManageCity(state, city, player, wonderCtx);
  // Military-focus cities keep citizens free for training — don't re-staff works.
  const staffCities = autoCities.filter((c) => c.autoMode !== "military");
  if (staffCities.length > 0) aiAssignSpecialists(state, pid, staffCities, wonderCtx);
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

/** Gently train specialists toward a wonder crew while tile works continue. */
function aiWonderCrewPrep(state: GameState, pid: number, wonder: WonderDef, maxConverts = 4): void {
  if (worksOf(state, pid).some((w) => w.kind === "wonder")) return;
  const player = playerById(state, pid);
  if (!player) return;
  if (crewShortfall(state, pid, wonder.crew as Partial<Record<Discipline, number>>).length === 0) return;

  const unlocked = availableSpecialists(player);
  let converted = 0;
  for (const city of [...citiesOf(state, pid)].sort((a, b) => b.population - a.population)) {
    for (let guard = 0; guard < 40 && workerSlots(city) >= 1 && converted < maxConverts; guard++) {
      const short = crewShortfall(state, pid, wonder.crew as Partial<Record<Discipline, number>>);
      if (short.length === 0) return;
      const gap = short.sort((a, b) => b.need - b.have - (a.need - a.have))[0]!;
      const specId = specialistIdForDiscipline(gap.disc);
      if (!specId || !unlocked.includes(specId) || !specialistUnlocked(player, specId)) break;
      if (!applyCommand(state, { type: "convertCitizen", cityId: city.id, specialistId: specId, delta: 1 }, pid).ok) break;
      converted++;
    }
  }
}

function aiWonders(state: GameState, pid: number, player: Player, p: DiploPersonality, focus: VictoryKind): void {
  if (worksOf(state, pid).some((w) => w.kind === "wonder")) return;
  for (const wonder of aiWonderCandidates(state, pid, player, p, focus)) {
    if (crewShortfall(state, pid, wonder.crew as Partial<Record<Discipline, number>>).length > 0) continue;
    for (const t of state.map.tiles) {
      const owner = t.ownerCityId !== undefined ? state.cities.get(t.ownerCityId) : undefined;
      if (!owner || owner.ownerId !== pid) continue;
      if (canStartWonder(state, pid, wonder.id, t.col, t.row).ok) {
        applyCommand(state, { type: "startWonder", wonderId: wonder.id, col: t.col, row: t.row }, pid);
        aiCancelNonWonderWorks(state, pid);
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
function aiAssignSpecialists(
  state: GameState,
  pid: number,
  cities: City[] = citiesOf(state, pid),
  wonderCtx: AiWonderContext = { gatheringCrew: false, building: false },
): void {
  let works = [...worksOf(state, pid)];
  if (wonderCtx.building) works = works.filter((w) => w.kind === "wonder");
  works.sort((a, b) => {
    if (a.kind === "wonder" && b.kind !== "wonder") return -1;
    if (b.kind === "wonder" && a.kind !== "wonder") return 1;
    return a.id - b.id;
  });
  if (works.length === 0) return;
  const assigned = assignedSpecialistIds(state, pid);
  for (const city of cities) {
    for (const s of city.specialists) {
      if (assigned.has(s.id)) continue;
      if (isPendingGovernorRelease(city, s.id)) continue;
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
    const crushing = lead >= 1.0;
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
    const crushing = lead >= 1.0;
    const kill = preview.toDefender >= enemy.hp ? SCORE_KILL_UNIT : 0;
    if (!kill) {
      if (preview.toAttacker >= unit.hp) return null;
      if (!crushing && preview.toAttacker > preview.toDefender + 5 && unit.hp < 70) return null;
      // Even at full health, never trade into a wall: taking double-plus damage
      // for no kill just feeds the enemy (the classic barbarian-camp meat grinder).
      if (!crushing && preview.toAttacker > preview.toDefender * 2 + 8) return null;
    }
    return kill + preview.toDefender * 2 - preview.toAttacker * (crushing ? 1.5 : 2);
  }
  return null;
}

/** Land the chosen strike, preferring a matching combat ability over a plain attack. */
function executeAttack(state: GameState, unit: Unit, pid: number, chosen: { col: number; row: number }): void {
  const abilities = unitAbilities(state, unit);
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
}

/** One favourable strike from where the unit now stands, if any. Used after a unit
 *  has repositioned so a soldier who marched up to an enemy still gets the first
 *  blow in the same turn instead of gifting the opening hit. */
function aiTryAttack(state: GameState, unit: Unit, pid: number): boolean {
  if (unit.attackedThisTurn || unit.movementLeft <= 0) return false;
  const choice = pickBestAttackTarget(state, unit, pid, computeAttackTargets(state, unit));
  if (!choice) return false;
  executeAttack(state, unit, pid, { col: choice.col, row: choice.row });
  return true;
}

/** Close the last stretch AND strike in one turn: when nothing is in range from
 *  where the unit stands, march to a reachable tile that leaves movement to spare
 *  (an attack needs movement left) and puts a favourably-scored enemy in range,
 *  then hit it. Without this the AI parks adjacent to its target and hands the
 *  enemy the first blow every time. */
function approachAndStrike(state: GameState, unit: Unit, pid: number): boolean {
  if (unit.attackedThisTurn || unit.movementLeft <= 0 || unit.embarked) return false;
  const def = UNIT_DEFS[unit.type];
  if (def.strength <= 0 && (def.rangedStrength ?? 0) <= 0) return false;
  if (def.gunpowder && isRanged(def) && (!unit.loaded || unit.reloading)) return false;
  const range = isRanged(def) ? def.range ?? 1 : 1;

  // Cheap pre-check before any pathfinding: is any hostile even close enough?
  const maxD = unit.movementLeft + range;
  const near: { col: number; row: number }[] = [];
  for (const e of state.units.values()) {
    if (isHostile(state, pid, e.ownerId) && axialDistance(ax(unit), ax(e)) <= maxD) near.push(e);
  }
  for (const c of state.cities.values()) {
    if (c.ownerId !== pid && isHostile(state, pid, c.ownerId) && axialDistance(ax(unit), ax(c)) <= maxD) near.push(c);
  }
  if (near.length === 0) return false;

  // Tiles we can move to while keeping movement for the strike itself.
  const strikeTiles: { col: number; row: number; cost: number }[] = [];
  for (const [key, entry] of computeReachable(state, unit)) {
    if (entry.cost >= unit.movementLeft) continue;
    const [c, r] = key.split(",").map(Number) as [number, number];
    if (aiPeaceBlocked(state, pid, c, r)) continue;
    strikeTiles.push({ col: c, row: r, cost: entry.cost });
  }
  if (strikeTiles.length === 0) return false;

  // Score (same trade discipline as a standing attack) only the foes we could
  // genuinely reach-and-hit, and remember the cheapest firing tile for each.
  let bestFoe: { col: number; row: number; score: number; from: { col: number; row: number } } | null = null;
  for (const foe of near) {
    let from: { col: number; row: number; cost: number } | null = null;
    for (const t of strikeTiles) {
      if (axialDistance(ax(t), ax(foe)) > range) continue;
      if (!from || t.cost < from.cost) from = t;
    }
    if (!from) continue;
    const score = scoreAttackTarget(state, unit, pid, foe.col, foe.row);
    if (score == null) continue;
    if (!bestFoe || score > bestFoe.score) bestFoe = { col: foe.col, row: foe.row, score, from };
  }
  if (!bestFoe) return false;

  if (!applyCommand(state, { type: "move", unitId: unit.id, col: bestFoe.from.col, row: bestFoe.from.row }, pid).ok) return false;
  // Validate from the new tile (domain/loaded checks live in computeAttackTargets).
  if (computeAttackTargets(state, unit).has(`${bestFoe.col},${bestFoe.row}`)) {
    executeAttack(state, unit, pid, { col: bestFoe.col, row: bestFoe.row });
  } else {
    aiTryAttack(state, unit, pid);
  }
  return true;
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

/** Fire each city's bombards (base 1/turn, +extra from a Bombard Tower) at the
 *  best nearby enemies, preferring kills, then the most damage dealt. */
function aiCityBombard(state: GameState, pid: number): void {
  for (const city of citiesOf(state, pid)) {
    while (cityBombardsUsed(city) < cityBombardAllowance(city)) {
      const targets = cityBombardTargets(state, city);
      if (targets.length === 0) break;
      const str = cityBombardStrength(state, city);
      let best: Unit | null = null;
      let bestScore = -Infinity;
      for (const t of targets) {
        const dmg = damageFrom(str, defenseStrengthVsBombard(state, t));
        const kill = dmg >= t.hp ? 1000 : 0;
        const score = kill - t.hp + dmg;
        if (score > bestScore) {
          bestScore = score;
          best = t;
        }
      }
      if (!best) break;
      const res = applyCommand(state, { type: "cityBombard", cityId: city.id, col: best.col, row: best.row }, pid);
      if (!res.ok) break; // never spin on a rejected shot
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

  const pushOffense = winningAtWar(state, pid);
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
    executeAttack(state, unit, pid, { col: attackChoice.col, row: attackChoice.row });
    return;
  }

  // Nothing in range from here — close the gap and strike in the same turn.
  if (approachAndStrike(state, unit, pid)) return;

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

  // Escort duty: while winning a war, every sword marches on the enemy — settlers wait.
  if (escortSettlerId !== undefined && !pushOffense) {
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

  // Economic warfare: raze an enemy improvement we're standing on.
  {
    const here = getTile(state.map, unit.col, unit.row);
    const owner = here?.ownerCityId !== undefined ? state.cities.get(here.ownerCityId) : undefined;
    if (here?.improvement && owner && isHostile(state, pid, owner.ownerId)) {
      if (applyCommand(state, { type: "pillage", unitId: unit.id }, pid).ok) return;
    }
  }

  // Converge on the enemy's nearest city — the primary objective while winning a war.
  const objective = nearestHostileCity(state, unit, pid);
  if (objective) {
    stepToward(state, unit, objective.col, objective.row, pid);
    return;
  }

  // Villages/camps only when not pressing a winning war.
  if (!pushOffense && aiHuntMapFeatures(state, unit, pid)) return;

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
function aiRush(
  state: GameState,
  player: Player,
  p: DiploPersonality,
  threatened: boolean,
  escortShortfall = false,
  wonderCtx: AiWonderContext = { gatheringCrew: false, building: false },
): void {
  const pid = player.id;
  const avail = rushCurrencies(state, pid);
  if (avail.length === 0) return;
  const atWar = player.atWar.length > 0;
  const wonderGoldFloor =
    wonderCtx.gatheringCrew && wonderCtx.target ? wonderStartCost(wonderCtx.target).gold + 10 : 0;
  // Keep a war chest while fighting; at peace, spend more freely to out-tempo rivals
  // (but never so low that next turn's upkeep tips us into bankruptcy and disbanding).
  const reserve: Record<RushCurrency, number> = {
    gold: wonderCtx.building ? 5 : Math.max(atWar ? 30 : 50, wonderGoldFloor),
    faith: wonderCtx.building ? 5 : 40,
    culture: wonderCtx.building ? 5 : 40,
  };
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
    let guard = 0;
    while (guard++ < 20) {
      let rushed = false;
      for (const cur of avail) {
        const r = canRushWork(state, pid, w.id, cur);
        if (!r.ok || r.cost == null) continue;
        const minLeft = wonderCtx.building ? 0 : cur === "gold" ? 5 : 10;
        if (poolOf(cur) - r.cost < minLeft) continue;
        applyCommand(state, { type: "rushWork", workId: w.id, currency: cur }, pid);
        rushed = true;
        break;
      }
      if (!rushed) break;
    }
  }
  if (wonderCtx.gatheringCrew) return; // hoard gold/faith/culture for breaking ground
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
  const winningWar = winningAtWar(state, pid);
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
        const wonderTech = aiWonderResearchPick(state, playerId, player, techs, atWarNow, threatened);
        const wonderReady = empireDevelopedForWonders(state, playerId, player);
        if (wonderTech && wonderReady && techs.includes(wonderTech)) {
          techId = wonderTech;
        } else if (
          !player.foundedReligionId &&
          !atWarNow &&
          citiesOf(state, playerId).length >= 2 &&
          techs.includes("ritual_burial" as TechId) &&
          !religionUnlocked(state, playerId) &&
          !wonderReady
        ) {
          techId = "ritual_burial" as TechId;
        } else {
          techId = wonderTech ?? pickTech(techs, p, atWarNow);
        }
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

  // Found a religion once enough faith is stored (before legends can spend faith).
  if (canFoundReligion(state, playerId)) {
    const city = citiesOf(state, playerId)[0];
    if (city) {
      const name = availableReligionNames(state)[0] ?? "";
      applyCommand(state, { type: "foundReligion", cityId: city.id, name, beliefs: pickBeliefs(state, p) }, playerId);
    }
  }

  // Recruit a Legend when enough track glory is banked — pick the hero we can
  // afford soonest on the track with the most surplus glory.
  if (state.legendsEnabled) {
    const options = availableLegendsForPlayer(state, playerId)
      .map((l) => ({ l, check: canRecruitLegend(state, playerId, l.id) }))
      .filter((x) => x.check.ok)
      .sort((a, b) => {
        const trackA = legendTrackFor(a.l);
        const trackB = legendTrackFor(b.l);
        const surplusA = legendTrackPointsOf(player, trackA) - legendRecruitCostFor(a.l, player);
        const surplusB = legendTrackPointsOf(player, trackB) - legendRecruitCostFor(b.l, player);
        if (surplusB !== surplusA) return surplusB - surplusA;
        return legendRecruitCostFor(a.l, player) - legendRecruitCostFor(b.l, player);
      });
    const pick = options[0]?.l;
    if (pick) applyCommand(state, { type: "recruitLegend", legendId: pick.id }, playerId);
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

  aiConnectRoads(state, playerId);

  const wonderCtx = aiWonderContext(state, playerId, player, p, focus);
  aiWonderClearDistractions(state, playerId, wonderCtx);
  if (wonderCtx.gatheringCrew && wonderCtx.target) {
    aiFreeWonderCrew(state, playerId, wonderCtx.target);
  }

  for (const city of citiesOf(state, playerId)) {
    if (!city.production) {
      const item = chooseConstruction(state, player, city, p, focus);
      if (item) applyCommand(state, { type: "setProduction", cityId: city.id, item }, playerId);
    }
    aiTrainUnits(state, player, city, p, escortShortfall);
    aiTrainReligionUnit(state, player, city, p, focus); // muster the faith's holy unit
    aiManageCity(state, city, player, playerId, wonderCtx);
  }
  if (wonderCtx.target) {
    aiWonderCrewPrep(state, playerId, wonderCtx.target, wonderCtx.gatheringCrew ? 40 : 4);
  }
  aiWonders(state, playerId, player, p, focus);
  const wonderActive = worksOf(state, playerId).some((w) => w.kind === "wonder");
  const staffCtx: AiWonderContext = wonderActive
    ? { target: wonderCtx.target, gatheringCrew: false, building: true }
    : wonderCtx;
  aiAssignSpecialists(state, playerId, citiesOf(state, playerId), staffCtx); // staff the works just queued (manual assignment)
  aiRush(state, player, p, threatened, escortShortfall, staffCtx); // hurry wonders / settlers / troops
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
    else {
      aiMilitary(state, unit, playerId, escorts.get(unit.id));
      // aiMilitary may have marched the unit next to an enemy: with movement (and
      // the attack) still unspent, strike now rather than let the foe swing first.
      const moved = state.units.get(unit.id);
      if (moved) aiTryAttack(state, moved, playerId);
    }
  }

  // After the army has manoeuvred, parley with any barbarians it now stands beside —
  // recruit the ones we want, buy a truce with bands that are pressing us.
  aiBarbarianDiplomacy(state, player, threatened);
}
