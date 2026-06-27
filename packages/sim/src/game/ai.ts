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
import { canFoundReligion, availableReligionNames } from "./religion";
import { availableLegends, canRecruitLegend } from "./legends";
import { canUseLeaderAbility } from "./leader-abilities";
import { canEstablishTradeRoute, tradeRouteDestinations } from "./trade";
import { aiConsiderDiplomacy, atWar, personalityOf } from "./diplomacy";
import { availablePromotions } from "./combat";
import { rushCurrencies, canRushWork, canRushTraining, type RushCurrency } from "./rush";
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
import { UNIT_DEFS, isMilitary, isRanged, type TechId, type TrainingClass, type UnitTypeId } from "./content";
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
} from "./state";

const TECH_PREFERENCE: TechId[] = [
  "cultivation", "pottery_kiln", "animal_taming", "native_copper", "smelting",
  "bronze_alloying", "writing", "masonry", "the_wheel", "equestrian",
  "composite_bow", "phalanx", "iron_bloomery", "coinage", "philosophy",
  "engineering", "carburizing", "siegecraft", "bridge_building", "cavalry_doctrine", "crossbow",
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

/** Personality-weighted desirability of a wonder's effect (varies the AI's picks). */
function wonderScore(effect: unknown, p: DiploPersonality): number {
  const s = JSON.stringify(effect ?? {});
  let v = 1;
  if (/production|food/.test(s)) v += 2;
  if (/science|culture/.test(s)) v += p.aggression < 0.55 ? 2 : 1;
  if (/combat|strength|unit|military|defense/.test(s)) v += p.aggression > 0.6 ? 3 : 0;
  if (/gold/.test(s)) v += p.greed > 0.6 ? 2 : 0;
  return v;
}

function ax(o: { col: number; row: number }) {
  return offsetToAxial(o);
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

/** When not at war, wander toward the unexplored frontier instead of idling. */
function aiExplore(state: GameState, unit: Unit, pid: number): void {
  const goal = nearestUnexplored(state, unit, pid);
  if (goal) stepToward(state, unit, goal.col, goal.row, pid);
}

// ---- production choice ---------------------------------------------------

/** Is a hostile (war enemy or barbarian) lurking near any of the player's cities? */
function hostileNearCities(state: GameState, pid: number): boolean {
  for (const c of citiesOf(state, pid)) {
    for (const u of state.units.values()) {
      if (isHostile(state, pid, u.ownerId) && axialDistance(ax(c), ax(u)) <= 4) return true;
    }
  }
  return false;
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

/** How many cities this civ aims to settle before consolidating — builders sprawl. */
function targetCityCount(p: DiploPersonality): number {
  if (p.aggression > 0.7) return 4; // warmongers take cities rather than plant them
  if (p.aggression < 0.45) return 7; // peaceful builders expand wide
  return 5;
}

/**
 * Construction chooser: what a city should BUILD (units are trained separately, see
 * aiTrainUnits). Covers training-building tiers, infrastructure, projects.
 */
function chooseConstruction(state: GameState, player: Player, city: City, p: DiploPersonality): ProductionItem | null {
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
  const order: string[] = ["granary", "workshop", "library", "market"];
  if (coastal) order.unshift("harbor");
  if (player.gold <= 0) order.unshift("market"); // prioritise income when broke
  order.push("walls", "forge", "shrine", "temple", "monument", "aqueduct", "academy", "amphitheater", "harbor", "lighthouse");
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
function aiTrainUnits(state: GameState, player: Player, city: City, p: DiploPersonality, threatened: boolean): void {
  // Don't drain a city below this many citizens just to make units (relaxed in war).
  const keepPop = threatened ? 1 : 2;
  if (city.population <= keepPop) return;
  const trainable = availableTraining(state, player, city);
  const units = unitsOf(state, player.id);
  const has = (t: string) => units.some((u) => u.type === t);
  const cityCount = citiesOf(state, player.id).length;
  const tryTrain = (type: UnitTypeId): boolean =>
    trainable.includes(type) &&
    applyCommand(state, { type: "startTraining", cityId: city.id, unit: type }, player.id).ok;

  // Civilians: a scout early, a settler to expand at peace, a trader to link cities.
  if (!threatened && exploredFraction(state, player.id) < 0.45 && !has("scout") && tryTrain("scout")) return;
  if (!threatened && cityCount < targetCityCount(p) && city.population >= 3 && !has("settler") && tryTrain("settler")) return;
  if (cityCount >= 2 && !has("trader") && tryTrain("trader")) return;

  // Military: train toward a target army size (one unit per city per turn).
  const milCount = units.filter((u) => isMilitary(u.type)).length;
  const desired = threatened ? cityCount * 2 + 1 : Math.max(cityCount + 1, 2);
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

function findSettleSpot(state: GameState, unit: Unit, pid: number): { col: number; row: number } | null {
  const cities = [...state.cities.values()];
  let best: { col: number; row: number } | null = null;
  let bestValue = -Infinity;
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
      // Reward good land, but discount the trek to reach it so settlers don't roam forever.
      const value = settleScore(state, col, row) - d * 1.5;
      if (value > bestValue) {
        bestValue = value;
        best = { col, row };
      }
    }
  }
  return best;
}

function aiSettler(state: GameState, unit: Unit, pid: number): void {
  if (applyCommand(state, { type: "foundCity", unitId: unit.id }, pid).ok) return;
  const spot = findSettleSpot(state, unit, pid);
  if (spot) {
    stepToward(state, unit, spot.col, spot.row, pid);
    applyCommand(state, { type: "foundCity", unitId: unit.id }, pid); // try again if we arrived
  }
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

/** Start the wonder that best fits the civ, on an owned tile a capable city can reach. */
function aiWonders(state: GameState, pid: number, p: DiploPersonality): void {
  if (worksOf(state, pid).some((w) => w.kind === "wonder")) return; // one at a time
  // Rank still-available wonders by how well their effect suits this civ, then take
  // the first we can actually start (canStartWonder checks craftsmen + an empty tile).
  const candidates = WONDER_DEFS.filter(
    (w) => !state.completedWonders.includes(w.id) && !worksOf(state, pid).some((x) => x.wonderId === w.id),
  ).sort((a, b) => wonderScore(b.effect, p) - wonderScore(a.effect, p));
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
    const dest = tradeRouteDestinations(state, unit)[0];
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

function aiMilitary(state: GameState, unit: Unit, pid: number): void {
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
  // No city to march on: pressure the nearest hostile unit, or scout if all is quiet.
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
  aiExplore(state, unit, pid);
}

/**
 * Spend stockpiled gold/faith/culture to hurry production when it counts — finishing
 * a wonder we're racing for, or rushing out troops under threat. Faith and culture
 * (cheaper, and only via perks) are spent before precious gold, and each pool keeps a
 * reserve so rushing never bankrupts religion, civics, or the treasury.
 */
function aiRush(state: GameState, player: Player, threatened: boolean): void {
  const pid = player.id;
  const avail = rushCurrencies(state, pid);
  if (avail.length === 0) return;
  const atWar = player.atWar.length > 0;
  const reserve: Record<RushCurrency, number> = { gold: atWar ? 20 : 80, faith: 40, culture: 40 };
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
  // 2) Under threat, hurry out the troops we're training to meet the danger.
  if (threatened) {
    for (const city of citiesOf(state, pid)) {
      for (const order of city.trainingQueue) {
        if (!isMilitary(order.unit)) continue;
        const c = choose((cur) => canRushTraining(state, pid, city.id, order.id, cur));
        if (c) applyCommand(state, { type: "rushTraining", cityId: city.id, orderId: order.id, currency: c }, pid);
      }
    }
  }
}

/** Play a full turn for an AI-controlled civ. */
export function aiTakeTurn(state: GameState, playerId: number): void {
  const player = playerById(state, playerId);
  if (!player) return;
  const p = personalityOf(state, playerId);
  const atWarNow = player.atWar.length > 0;
  const threatened = atWarNow || hostileNearCities(state, playerId);

  aiConsiderDiplomacy(state, playerId); // declare/sue for war, court friends

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
      applyCommand(state, { type: "setResearch", techId: pickTech(techs, p, atWarNow) }, playerId);
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

  for (const city of citiesOf(state, playerId)) {
    if (!city.production) {
      const item = chooseConstruction(state, player, city, p);
      if (item) applyCommand(state, { type: "setProduction", cityId: city.id, item }, playerId);
    }
    aiTrainUnits(state, player, city, p, threatened);
    aiManageCity(state, city, player, playerId);
  }
  aiWonders(state, playerId, p);
  aiAssignSpecialists(state, playerId); // staff the works just queued (manual assignment)
  aiRush(state, player, threatened); // hurry wonders / wartime troops with gold/faith/culture

  for (const unit of unitsOf(state, playerId)) {
    if (!state.units.has(unit.id)) continue;
    const def = UNIT_DEFS[unit.type];
    if (unit.unspentPromotions > 0) aiPromote(state, unit, playerId);
    if (def.founder) aiSettler(state, unit, playerId);
    else if (def.trader) aiTrader(state, unit, playerId);
    else if (def.cls === "recon") aiScout(state, unit, playerId);
    else aiMilitary(state, unit, playerId);
  }
}
