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
import { computeReachable } from "./movement";
import { computeAttackTargets } from "./combat";
import { abilityTargets, canUseAbility, unitAbilities } from "./abilities";
import { availableProduction, availableTechs, workableTiles } from "./economy";
import { availableCivics, availableGovernments, unlockedPolicies, getGovernment } from "./civs";
import { canFoundReligion, availableReligionNames, buyReligiousUnit, religiousUnitCost } from "./religion";
import { availableLegends, canRecruitLegend } from "./legends";
import { canUseLeaderAbility } from "./leader-abilities";
import { canEstablishTradeRoute, tradeRouteDestinations } from "./trade";
import { aiConsiderDiplomacy, atWar, personalityOf, proposeDeal, relationBetween, attitudeScore, powerRatio, declareWar } from "./diplomacy";
import { availablePromotions } from "./combat";
import { rushCurrencies, canRushWork, canRushTraining, canRushCity, type RushCurrency } from "./rush";
import { availableTraining } from "./training";
import { BELIEFS, WONDER_DEFS, getPolicy, type DiploPersonality } from "@roc/data";
import { availableSpecialists, workerSlots, SPECIALIST_DEFS, type SpecialistId } from "./specialists";
import {
  nextTierAt,
  worksOf,
  worksOfCity,
  workDiscipline,
  canStartWonder,
  assignSpecialist,
  assignedSpecialistIds,
} from "./works";
import { offsetNeighbors } from "./movement";
import { RESOURCE_DEFS, resourceActive } from "./resources";
import { isPassableLand, isWaterTerrain, tileYields } from "./terrain";
import { BARBARIAN_DIPLOMACY_TECH, UNIT_DEFS, isMilitary, isRanged, type TechId, type TrainingClass, type UnitTypeId } from "./content";
import { barbarianBribeCost, barbarianRecruitCost, canParleyWith, isBarbarianPacified } from "./bribery";
import { victoryProgress } from "./victory";
import {
  citiesOf,
  cityAt,
  playerById,
  unitAt,
  unitsOf,
  type City,
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
function effectScore(effects: Record<string, unknown> | undefined, p: DiploPersonality, atWarNow: boolean): number {
  if (!effects) return 1;
  const e = effects as Record<string, unknown>;
  const s = JSON.stringify(e);
  const martial = e.unitClassCombat !== undefined || e.cavalryMovementBonus !== undefined;
  const rushPerk = e.rushWithFaith === true || e.rushWithCulture === true;
  const warMinded = atWarNow || p.aggression > 0.6;
  let v = 1;
  if (rushPerk) v += 2; // rushing is broadly powerful
  if (martial) v += warMinded ? 3 : 0.5;
  if (/yieldPercent/.test(s)) {
    if (/science/.test(s)) v += warMinded ? 1 : 2.5;
    if (/gold/.test(s)) v += p.greed > 0.6 ? 2.5 : 1;
    if (/food|production/.test(s)) v += 2;
  }
  return v;
}

/** Order unlocked policies so the most useful fill the government's limited slots. */
function rankPolicies(ids: string[], p: DiploPersonality, atWarNow: boolean): string[] {
  return [...ids].sort((a, b) =>
    effectScore(getPolicy(b)?.effects as Record<string, unknown>, p, atWarNow) -
    effectScore(getPolicy(a)?.effects as Record<string, unknown>, p, atWarNow));
}

/** Choose two religion beliefs that suit the civ's temperament. */
function pickBeliefs(p: DiploPersonality): string[] {
  return [...BELIEFS]
    .sort((a, b) => effectScore(b.effects as Record<string, unknown>, p, false) - effectScore(a.effects as Record<string, unknown>, p, false))
    .slice(0, 2)
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
  let best: { col: number; row: number } | null = null;
  let bestD = Infinity;
  const from = ax(unit);
  for (const c of state.cities.values()) {
    if (!isHostile(state, pid, c.ownerId)) continue;
    const d = axialDistance(from, ax(c));
    if (d < bestD) {
      bestD = d;
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

  const findBuilding = (id: string): ProductionItem | null =>
    opts.find((o) => o.item.kind === "building" && o.item.id === id)?.item ?? null;
  const findTraining = (fam: TrainingClass): ProductionItem | null =>
    opts.find((o) => o.item.kind === "trainingBuilding" && o.item.family === fam)?.item ?? null;

  // 1. A Barracks first so the city can train melee defenders at all.
  if (!city.training.barracks) { const b = findTraining("barracks"); if (b) return b; }
  // 1b. War-minded civs raise more training families early; coastal cities a shipyard.
  if (warMinded && !city.training.archery_range) { const a = findTraining("archery_range"); if (a) return a; }
  if (coastal && !city.training.shipyard) { const s = findTraining("shipyard"); if (s) return s; }
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

/** Highest-strength military unit the city can currently train, or null. */
function bestTrainableMilitary(trainable: UnitTypeId[]): UnitTypeId | null {
  return trainable
    .filter((t) => isMilitary(t))
    .sort((a, b) => UNIT_DEFS[b].strength - UNIT_DEFS[a].strength)[0] ?? null;
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
  const milCount = units.filter((u) => isMilitary(u.type)).length;
  // Threat is LOCAL, not empire-wide: a city pauses its own expansion only if an enemy
  // is right on top of it. Two coarser flags used to freeze the WHOLE empire's growth —
  // a single roaming barbarian near any city, and (worse) merely *being at war* — which
  // is why an AI stuck in a stalemate war it can't end would stop settling entirely and
  // wither. Now safe backline cities keep expanding while the front does the fighting.
  const localThreat = hostileNearCity(state, player.id, city, 2);
  const atWar = player.atWar.length > 0;
  const expanding = !localThreat && cityCount + settlersOut < targetCityCount(p);
  // Opening play: get the lone capital's first settler out the door immediately — it
  // founds a cheap, safe second city while the starting Warriors screen it. We let the
  // capital dip to a single citizen for this one settler (it regrows once it leaves);
  // afterwards settlers come from the healthier pop-3 gate so cities keep growing rather
  // than freezing into a swarm of fragile pop-1 hamlets.
  const openingSettler = expanding && cityCount <= 1 && settlersOut === 0;

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
  if (!localThreat && exploredFraction(state, player.id) < 0.45 && !has("scout") && tryTrain("scout")) return;
  // Expand: a safe city below the empire's target builds settlers from pop 3 (dropping
  // to 2, so it keeps growing). The biggest single lever now that units cost population.
  if (expanding && city.population >= 3 && tryTrain("settler")) return;
  // Keep a trader heading out whenever we have fewer routes than cities (links the
  // empire and, with open borders, opens lucrative international trade).
  const routeCount = state.tradeRoutes.filter((r) => r.ownerId === player.id).length;
  if (!localThreat && cityCount >= 2 && !has("trader") && routeCount < cityCount && tryTrain("trader")) return;

  // Military: a war footing when fighting or locally menaced, else a peacetime garrison
  // that scales with the empire (warlike civs hold a bigger host so they can threaten
  // neighbours, not just defend). Cities still expanding above don't reach here, so the
  // army is mustered by frontier cities and by those that have hit the expansion target.
  const desired = ((atWar || localThreat)
    ? cityCount * 2 + 2
    : Math.max(cityCount + (p.aggression > 0.6 ? 3 : 2), 4)) + (escortShortfall ? 2 : 0);
  if (milCount < desired) {
    const type = bestTrainableMilitary(trainable);
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

/** How close a known barbarian threat may be before a site counts as "exposed". */
const SETTLE_DANGER_RADIUS = 3;
/** A safe site is taken over the best one as long as it's within this much quality. */
const SETTLE_SAFE_MARGIN = 6;

/**
 * Choose where a settler should found, preferring ground clear of barbarians. We rank
 * candidate sites by land quality (minus a trek discount), then:
 *  - if the best site is clear of known raiders, take it (no escort needed);
 *  - if it's exposed but a nearly-as-good *safe* site exists, take the safe one instead;
 *  - only when the best land is unavoidably in harm's way do we take it and flag it
 *    unsafe, so the turn planner knows to send a guard along.
 */
export function planSettle(state: GameState, unit: Unit, pid: number): SettlePlan | null {
  const cities = [...state.cities.values()];
  const threats = knownBarbThreats(state, pid);
  const exposed = (col: number, row: number) =>
    threats.some((t) => axialDistance(ax({ col, row }), ax(t)) <= SETTLE_DANGER_RADIUS);
  let best: { col: number; row: number } | null = null;
  let bestValue = -Infinity;
  let safeBest: { col: number; row: number } | null = null;
  let safeBestValue = -Infinity;
  for (let dr = -6; dr <= 6; dr++) {
    for (let dc = -6; dc <= 6; dc++) {
      const col = unit.col + dc;
      const row = unit.row + dr;
      const tile = getTile(state.map, col, row);
      if (!tile || !isPassableLand(tile.terrain)) continue;
      const here = ax({ col, row });
      if (cities.some((c) => axialDistance(here, ax(c)) < 3)) continue;
      if (unitAt(state, col, row) && !(col === unit.col && row === unit.row)) continue;
      const d = axialDistance(ax(unit), here);
      // Reward good land, but discount the trek to reach it so settlers don't roam
      // forever (measured: settling nearer founds more cities than chasing far land,
      // since a long, undefended march just feeds barbarians a free settler).
      const value = settleScore(state, col, row) - d * 1.5;
      if (value > bestValue) {
        bestValue = value;
        best = { col, row };
      }
      if (!exposed(col, row) && value > safeBestValue) {
        safeBestValue = value;
        safeBest = { col, row };
      }
    }
  }
  if (!best) return null;
  // A safe site that's almost as good as the best is worth the small downgrade.
  if (safeBest && safeBestValue >= bestValue - SETTLE_SAFE_MARGIN) {
    return { ...safeBest, safe: true };
  }
  // The best land is unavoidably exposed — take it, but it warrants an escort.
  return { ...best, safe: !exposed(best.col, best.row) };
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
  // No viable site within reach — push toward the unexplored frontier to uncover new
  // land rather than letting a precious settler stand idle.
  aiExplore(state, unit, pid);
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
  const wantMason = Math.min(2, Math.floor(city.population / 4));
  if (unlocked.includes("carpenter") && countOf("carpenter") < wantCarpenter) wants.push("carpenter");
  if (unlocked.includes("mason") && countOf("mason") < wantMason) wants.push("mason");
  if (city.population >= 6 && unlocked.includes("engineer") && countOf("engineer") < 1) wants.push("engineer");
  if (city.population >= 7 && unlocked.includes("architect") && countOf("architect") < 1) wants.push("architect");
  if (city.population >= 9 && unlocked.includes("engineer") && countOf("engineer") < 2) wants.push("engineer");
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
        if (nextTierAt(tile, "tower") && applyCommand(state, { type: "startWork", kind: "tower", col: n.col, row: n.row }, pid).ok) return;
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
    if (tile.resource && !resourceActive(tile)) {
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
    if (kind && applyCommand(state, { type: "startWork", kind, col, row }, pid).ok) return;
  }
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
 */
function aiAssignSpecialists(state: GameState, pid: number): void {
  const works = worksOf(state, pid);
  if (works.length === 0) return;
  const assigned = assignedSpecialistIds(state, pid);
  for (const city of citiesOf(state, pid)) {
    for (const s of city.specialists) {
      if (assigned.has(s.id)) continue;
      const disc = SPECIALIST_DEFS[s.type as SpecialistId]?.discipline;
      if (!disc) continue;
      const w = works.find((x) => (x.requirement[disc] ?? 0) > (x.progress[disc] ?? 0));
      if (!w) continue;
      if (assignSpecialist(state, pid, w.id, s.id, true).ok) assigned.add(s.id);
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

function aiMilitary(state: GameState, unit: Unit, pid: number, escortSettlerId?: number): void {
  const abilities = unitAbilities(state, unit);
  const def = UNIT_DEFS[unit.type];

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

  const targets = computeAttackTargets(state, unit);
  if (targets.size > 0) {
    let chosen: { col: number; row: number } | null = null;
    let cityChoice: { col: number; row: number } | null = null;
    for (const key of targets) {
      const [col, row] = key.split(",").map(Number) as [number, number];
      const city = cityAt(state, col, row);
      const enemy = unitAt(state, col, row);
      if (city) {
        // Storm a city only when it's already weakened or we've massed a couple of
        // attackers around it — never throw a lone melee unit at a healthy city.
        // Ranged units bombard freely (no retaliation) to soften it for the assault.
        const supported = friendlyMilitaryNear(state, pid, col, row, 1) >= 2;
        if ((city.hp <= 55 || supported || isRanged(def)) && !cityChoice) cityChoice = { col, row };
        continue;
      }
      const favorable = enemy
        ? enemy.hp <= unit.hp + 10 || UNIT_DEFS[unit.type].strength >= UNIT_DEFS[enemy.type].strength
        : false;
      if (favorable && !chosen) chosen = { col, row };
    }
    // Prefer storming a city when it's a sound move; else hit a favourable unit.
    chosen = cityChoice ?? chosen;
    if (chosen) {
      // Cavalry strike with a charge (extra punch + breakthrough) when hitting a unit.
      const enemy = unitAt(state, chosen.col, chosen.row);
      const charge = abilities.find((a) => a === "shock_charge" || a === "charge" || a === "hussar_charge" || a === "war_cart_charge" || a === "furor");
      if (enemy && charge && abilityTargets(state, unit, charge).has(`${chosen.col},${chosen.row}`)) {
        applyCommand(state, { type: "useAbility", unitId: unit.id, ability: charge, col: chosen.col, row: chosen.row }, pid);
        return;
      }
      const ranged2 = abilities.find((a) => a === "repeating_fire" || a === "arrow_storm");
      if (enemy && ranged2 && abilityTargets(state, unit, ranged2).has(`${chosen.col},${chosen.row}`)) {
        applyCommand(state, { type: "useAbility", unitId: unit.id, ability: ranged2, col: chosen.col, row: chosen.row }, pid);
        return;
      }
      const sunder = abilities.find((a) => a === "sunder" || a === "pierce" || a === "harry" || a === "siege_assault");
      if (enemy && sunder && abilityTargets(state, unit, sunder).has(`${chosen.col},${chosen.row}`)) {
        applyCommand(state, { type: "useAbility", unitId: unit.id, ability: sunder, col: chosen.col, row: chosen.row }, pid);
        return;
      }
      applyCommand(state, { type: "attack", attackerId: unit.id, col: chosen.col, row: chosen.row }, pid);
      return;
    }
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
  // walls. We ignore peaceful neighbours so armies don't shadow units they can't fight.
  for (const city of citiesOf(state, unit.ownerId)) {
    const threat = [...state.units.values()].some(
      (e) => isHostile(state, pid, e.ownerId) && axialDistance(ax(city), ax(e)) <= 3,
    );
    if (!threat) continue;
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

  // No war to wage: make the roaming pay. March on the nearest known barbarian camp
  // (gold, and it stops the raider spawns) and snap up tribal villages, heading to
  // whichever is closer — ties go to the camp, since clearing it removes a standing
  // threat. This runs ahead of chasing a lone, distant barbarian: better to burn the
  // nest than trail one wasp across the map.
  {
    const camp = nearestFeature(state, unit, pid, "barb_camp");
    const village = nearestFeature(state, unit, pid, "village");
    let goal = camp ?? village;
    if (camp && village) {
      goal = axialDistance(ax(unit), ax(village)) < axialDistance(ax(unit), ax(camp)) ? village : camp;
    }
    if (goal) {
      stepToward(state, unit, goal.col, goal.row, pid);
      return;
    }
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
  // Scouts are the natural village-collectors: any unit triggers a village, and a
  // scout fans out across the map anyway, so divert to the nearest discovered one
  // for its free perk before drifting on toward the frontier. (Camps need a military
  // unit to clear, so scouts leave those alone.)
  const village = nearestFeature(state, unit, pid, "village");
  if (village) {
    stepToward(state, unit, village.col, village.row, pid);
    return;
  }
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
  // 3) Hurry out the troops we're training — to meet a danger, or to get a guard
  //    marching toward a settler that's stranded in hostile country without one.
  if (threatened || escortShortfall) {
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
 * A domination-focused civ doesn't wait to be provoked. Once it fields a real army and
 * a clearly weaker neighbour sits within striking range, it declares war and goes for
 * the capital — the per-unit military AI already converges on enemy cities and storms
 * them. This is what turns a warmonger's intent into an actual conquest victory.
 */
export function aiSeekConquest(state: GameState, player: Player, focus: VictoryKind): void {
  if (focus !== "domination" || player.atWar.length > 0) return;
  const pid = player.id;
  const army = unitsOf(state, pid).filter((u) => isMilitary(u.type) && u.hp >= 40).length;
  if (army < 3) return; // need a credible force before opening a war
  let target: number | null = null;
  let bestScore = -Infinity;
  for (const otherId of player.met) {
    const r = relationBetween(state, pid, otherId);
    if (!r || r.status !== "peace" || r.pact !== "none") continue;
    if (r.warAllowedTurn !== undefined && state.turn < r.warAllowedTurn) continue; // a peace holds
    const other = playerById(state, otherId);
    if (!other || other.isBarbarian || citiesOf(state, otherId).length === 0) continue;
    if (powerRatio(state, pid, otherId) < 1.25) continue; // only strike the clearly weaker
    const reach = nearestRivalCityDistance(state, pid, otherId);
    if (reach > 16) continue; // too far to prosecute a campaign
    const score = powerRatio(state, pid, otherId) * 10 - reach;
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

  // Civics: develop the next civic, adopt the best government, slot all policies.
  if (!player.researchingCivic) {
    const civics = availableCivics(player);
    if (civics.length > 0) applyCommand(state, { type: "setCivic", civicId: civics[0]! }, playerId);
  }
  const bestGov = availableGovernments(player)
    .map((g) => getGovernment(g)!)
    .sort((a, b) => b.slots - a.slots)[0];
  if (bestGov && bestGov.id !== player.government) {
    applyCommand(state, { type: "setGovernment", governmentId: bestGov.id }, playerId);
  }
  // Slot policies best-first so the most useful fill the government's limited slots.
  for (const pol of rankPolicies(unlockedPolicies(player), p, atWarNow)) {
    if (!player.policies.includes(pol)) applyCommand(state, { type: "togglePolicy", policyId: pol }, playerId);
  }

  // Recruit a Legend when faith allows — prefer a land hero, else any available.
  if (state.legendsEnabled) {
    const options = availableLegends(state);
    const pick = options.find((l) => l.type === "land") ?? options[0];
    if (pick && canRecruitLegend(state, playerId, pick.id).ok) {
      applyCommand(state, { type: "recruitLegend", legendId: pick.id }, playerId);
    }
  }

  // Found a religion once enough faith is stored.
  if (canFoundReligion(state, playerId)) {
    const city = citiesOf(state, playerId)[0];
    if (city) {
      const name = availableReligionNames(state)[0] ?? "";
      applyCommand(state, { type: "foundReligion", cityId: city.id, name, beliefs: pickBeliefs(p) }, playerId);
    }
  }

  // Evangelize the empire: buy a missionary to convert any cities not yet ours in faith.
  aiBuyMissionaries(state, player, playerId, focus);

  // Plan each settler's destination once (safety-aware). This drives the guard
  // assignment below AND tells the city/rush passes whether we must muster an extra
  // warrior: a settler bound for dangerous ground with no soldier free to guard it is
  // an "escort shortfall" we answer by raising — and hurrying — a fresh warrior.
  const settlePlans = new Map<number, SettlePlan>();
  for (const u of unitsOf(state, playerId)) {
    if (!UNIT_DEFS[u.type].founder) continue;
    const plan = planSettle(state, u, playerId);
    if (plan) settlePlans.set(u.id, plan);
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
    aiManageCity(state, city, player, playerId);
  }
  aiWonders(state, playerId, p, focus);
  aiAssignSpecialists(state, playerId); // staff the works just queued (manual assignment)
  aiRush(state, player, p, threatened, escortShortfall); // hurry wonders / settlers / troops

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
