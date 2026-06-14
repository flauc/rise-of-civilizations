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
import { BELIEFS } from "@roc/data";
import { buildableHere } from "./improvements";
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
  // 3. A worker to improve tiles.
  if (!has("worker")) {
    const w = opts.find((o) => o.item.id === "worker");
    if (w) return w.item;
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

function aiWorker(state: GameState, unit: Unit, pid: number): void {
  const buildHere = () => {
    const here = buildableHere(state, unit);
    const kind = here.includes("farm") ? "farm" : here.includes("mine") ? "mine" : null;
    if (kind) {
      applyCommand(state, { type: "build", unitId: unit.id, improvement: kind }, pid);
      return true;
    }
    return false;
  };
  if (buildHere()) return;
  // Walk toward a workable tile near one of our cities.
  for (const city of citiesOf(state, unit.ownerId)) {
    for (let dr = -2; dr <= 2; dr++) {
      for (let dc = -2; dc <= 2; dc++) {
        const col = city.col + dc;
        const row = city.row + dr;
        const tile = getTile(state.map, col, row);
        if (!tile || tile.improvement) continue;
        if (tile.terrain === "grassland" || tile.terrain === "plains" || tile.terrain === "hills") {
          if (stepToward(state, unit, col, row, pid)) {
            buildHere();
            return;
          }
        }
      }
    }
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
  }

  for (const unit of unitsOf(state, playerId)) {
    if (!state.units.has(unit.id)) continue;
    const def = UNIT_DEFS[unit.type];
    if (def.founder) aiSettler(state, unit, playerId);
    else if (def.builder) aiWorker(state, unit, playerId);
    else aiMilitary(state, unit, playerId);
  }
}
