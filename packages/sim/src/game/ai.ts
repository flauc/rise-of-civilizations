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
import { availableProduction, availableTechs } from "./economy";
import { availableCivics, availableGovernments, unlockedPolicies, getGovernment } from "./civs";
import { canFoundReligion, availableReligionNames } from "./religion";
import { canEstablishTradeRoute, tradeRouteDestinations } from "./trade";
import { BELIEFS } from "@roc/data";
import { availableSpecialists, workerSlots, SPECIALIST_DEFS, type SpecialistId } from "./specialists";
import { nextTierAt, worksOfCity } from "./works";
import { isPassableLand } from "./terrain";
import { UNIT_DEFS, isMilitary, type TechId } from "./content";
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
  "engineering", "carburizing", "siegecraft", "cavalry_doctrine", "crossbow",
];

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
  if (!bestKey) return false;
  const [c, r] = bestKey.split(",").map(Number) as [number, number];
  return applyCommand(state, { type: "move", unitId: unit.id, col: c, row: r }, pid).ok;
}

function nearestEnemy(state: GameState, unit: Unit, pid: number): { col: number; row: number } | null {
  const me = playerById(state, pid);
  if (!me) return null;
  let best: { col: number; row: number } | null = null;
  let bestD = Infinity;
  const from = ax(unit);
  const consider = (col: number, row: number, owner: number) => {
    if (owner === pid) return;
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

// ---- production choice ---------------------------------------------------

function chooseProduction(state: GameState, player: Player, city: City): ProductionItem | null {
  const opts = availableProduction(player, city);
  const units = unitsOf(state, player.id);
  const has = (t: string) => units.some((u) => u.type === t);
  const cityCount = citiesOf(state, player.id).length;
  const bestMilitary = () =>
    opts
      .filter((o) => o.item.kind === "unit" && isMilitary(o.item.id))
      .sort((a, b) => UNIT_DEFS[b.item.id as keyof typeof UNIT_DEFS].strength - UNIT_DEFS[a.item.id as keyof typeof UNIT_DEFS].strength)[0]?.item ?? null;

  // 1. Always keep at least one defender.
  if (!units.some((u) => isMilitary(u.type))) {
    const m = bestMilitary();
    if (m) return m;
  }
  // 2. Expand while small.
  if (cityCount < 3 && city.population >= 2 && !has("settler")) {
    const s = opts.find((o) => o.item.id === "settler");
    if (s) return s.item;
  }
  // 3. A trader once we have somewhere to trade with.
  if (cityCount >= 2 && !has("trader")) {
    const t = opts.find((o) => o.item.id === "trader");
    if (t) return t.item;
  }
  // 4. Economy buildings.
  for (const b of ["granary", "library", "walls"] as const) {
    const o = opts.find((x) => x.item.kind === "building" && x.item.id === b);
    if (o) return o.item;
  }
  // 5. Otherwise more military.
  return bestMilitary() ?? opts[0]?.item ?? null;
}

// ---- per-unit behaviour --------------------------------------------------

function findSettleSpot(state: GameState, unit: Unit, pid: number): { col: number; row: number } | null {
  const cities = [...state.cities.values()];
  let best: { col: number; row: number } | null = null;
  let bestD = Infinity;
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
      if (d < bestD) {
        bestD = d;
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
  // Keep a couple of citizens as craftsmen once the city is large enough.
  const wants: SpecialistId[] = [];
  if (city.population >= 2 && unlocked.includes("carpenter") && countOf("carpenter") < 1) wants.push("carpenter");
  if (city.population >= 4 && unlocked.includes("mason") && countOf("mason") < 1) wants.push("mason");
  for (const id of wants) {
    if (workerSlots(city) > 1) applyCommand(state, { type: "convertCitizen", cityId: city.id, specialistId: id, delta: 1 }, pid);
  }
  // Queue a Work if the city has idle craftsmen and few pending projects.
  if (worksOfCity(state, city.id).length >= 2) return;
  const haveDiscipline = (d: string) =>
    city.specialists.some((s) => SPECIALIST_DEFS[s.type as SpecialistId]?.discipline === d);
  for (let dr = -2; dr <= 2; dr++) {
    for (let dc = -2; dc <= 2; dc++) {
      const col = city.col + dc;
      const row = city.row + dr;
      const tile = getTile(state.map, col, row);
      if (!tile || tile.ownerCityId === undefined) continue;
      const owner = state.cities.get(tile.ownerCityId);
      if (!owner || owner.ownerId !== pid) continue;
      let kind: string | null = null;
      if (haveDiscipline("carpentry") && nextTierAt(tile, "farm")) kind = "farm";
      else if (haveDiscipline("carpentry") && nextTierAt(tile, "lumber_camp")) kind = "lumber_camp";
      else if (haveDiscipline("masonry") && nextTierAt(tile, "mine")) kind = "mine";
      if (kind && applyCommand(state, { type: "startWork", kind, col, row }, pid).ok) return;
    }
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
  const targets = computeAttackTargets(state, unit);
  if (targets.size > 0) {
    let chosen: { col: number; row: number } | null = null;
    for (const key of targets) {
      const [col, row] = key.split(",").map(Number) as [number, number];
      const city = cityAt(state, col, row);
      const enemy = unitAt(state, col, row);
      const favorable =
        !!city ||
        (enemy ? enemy.hp <= unit.hp + 10 || UNIT_DEFS[unit.type].strength >= UNIT_DEFS[enemy.type].strength : false);
      if (favorable) {
        chosen = { col, row };
        break;
      }
    }
    if (chosen) {
      applyCommand(state, { type: "attack", attackerId: unit.id, col: chosen.col, row: chosen.row }, pid);
      return;
    }
  }
  // Defend a threatened city, else pressure the nearest enemy.
  for (const city of citiesOf(state, unit.ownerId)) {
    for (const e of state.units.values()) {
      if (e.ownerId !== unit.ownerId && axialDistance(ax(city), ax(e)) <= 3) {
        stepToward(state, unit, e.col, e.row, pid);
        return;
      }
    }
  }
  const enemy = nearestEnemy(state, unit, pid);
  if (enemy) stepToward(state, unit, enemy.col, enemy.row, pid);
}

/** Play a full turn for an AI-controlled civ. */
export function aiTakeTurn(state: GameState, playerId: number): void {
  const player = playerById(state, playerId);
  if (!player) return;

  if (!player.researching) {
    const techs = availableTechs(player);
    if (techs.length > 0) {
      const pick = TECH_PREFERENCE.find((t) => techs.includes(t)) ?? techs[0]!;
      applyCommand(state, { type: "setResearch", techId: pick }, playerId);
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
  for (const pol of unlockedPolicies(player)) {
    if (!player.policies.includes(pol)) applyCommand(state, { type: "togglePolicy", policyId: pol }, playerId);
  }

  // Found a religion once enough faith is stored.
  if (canFoundReligion(state, playerId)) {
    const city = citiesOf(state, playerId)[0];
    if (city) {
      const name = availableReligionNames(state)[0] ?? "";
      const beliefs = BELIEFS.slice(0, 2).map((b) => b.id);
      applyCommand(state, { type: "foundReligion", cityId: city.id, name, beliefs }, playerId);
    }
  }

  for (const city of citiesOf(state, playerId)) {
    if (!city.production) {
      const item = chooseProduction(state, player, city);
      if (item) applyCommand(state, { type: "setProduction", cityId: city.id, item }, playerId);
    }
    aiManageCity(state, city, player, playerId);
  }

  for (const unit of unitsOf(state, playerId)) {
    if (!state.units.has(unit.id)) continue;
    const def = UNIT_DEFS[unit.type];
    if (def.founder) aiSettler(state, unit, playerId);
    else if (def.trader) aiTrader(state, unit, playerId);
    else aiMilitary(state, unit, playerId);
  }
}
