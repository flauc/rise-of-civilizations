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
import { availableProduction, availableTechs } from "./economy";
import { availableCivics, availableGovernments, unlockedPolicies, getGovernment } from "./civs";
import { canFoundReligion, availableReligionNames } from "./religion";
import { availableLegends, canRecruitLegend } from "./legends";
import { canUseLeaderAbility } from "./leader-abilities";
import { canEstablishTradeRoute, tradeRouteDestinations } from "./trade";
import { aiConsiderDiplomacy, atWar } from "./diplomacy";
import { availablePromotions } from "./combat";
import { BELIEFS, WONDER_DEFS } from "@roc/data";
import { availableSpecialists, workerSlots, SPECIALIST_DEFS, type SpecialistId } from "./specialists";
import { nextTierAt, worksOf, worksOfCity, workDiscipline, canStartWonder } from "./works";
import { offsetNeighbors } from "./movement";
import { RESOURCE_DEFS, resourceActive } from "./resources";
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
  "engineering", "carburizing", "siegecraft", "bridge_building", "cavalry_doctrine", "crossbow",
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

function chooseProduction(state: GameState, player: Player, city: City): ProductionItem | null {
  const opts = availableProduction(state, player, city);
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
  // 4. Buildings — broad priority order (skips any already built / not unlocked).
  // If the treasury is empty, lean harder on economic buildings before adding more upkeep.
  const BUILD_ORDER = player.gold <= 0
    ? (["market", "harbor", "granary", "workshop", "library", "walls", "barracks", "forge",
        "shrine", "temple", "monument", "stable", "aqueduct", "academy", "amphitheater"] as const)
    : (["granary", "workshop", "library", "market", "walls", "barracks", "forge",
        "shrine", "temple", "monument", "stable", "aqueduct", "academy", "amphitheater", "harbor"] as const);
  for (const b of BUILD_ORDER) {
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
  const haveDiscipline = (d: string) =>
    city.specialists.some((s) => SPECIALIST_DEFS[s.type as SpecialistId]?.discipline === d);

  // Train a balanced crew, scaling with size and always leaving free workers.
  const wants: SpecialistId[] = [];
  if (city.population >= 2 && unlocked.includes("carpenter") && countOf("carpenter") < 1) wants.push("carpenter");
  if (city.population >= 3 && unlocked.includes("mason") && countOf("mason") < 1) wants.push("mason");
  if (city.population >= 5 && unlocked.includes("carpenter") && countOf("carpenter") < 2) wants.push("carpenter");
  if (city.population >= 6 && unlocked.includes("engineer") && countOf("engineer") < 1) wants.push("engineer");
  if (city.population >= 7 && unlocked.includes("architect") && countOf("architect") < 1) wants.push("architect");
  for (const id of wants) {
    if (workerSlots(city) > 1) applyCommand(state, { type: "convertCitizen", cityId: city.id, specialistId: id, delta: 1 }, pid);
  }

  if (worksOfCity(state, city.id).length >= 2) return; // don't over-queue

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

  // Economic works: improve resources first, then food/production tiles.
  for (let dr = -2; dr <= 2; dr++) {
    for (let dc = -2; dc <= 2; dc++) {
      const col = city.col + dc;
      const row = city.row + dr;
      const tile = getTile(state.map, col, row);
      if (!tile || tile.ownerCityId === undefined) continue;
      const owner = state.cities.get(tile.ownerCityId);
      if (!owner || owner.ownerId !== pid) continue;
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
      else if (!kind && haveDiscipline("survey") && nextTierAt(tile, "road")) kind = "road";
      if (kind && applyCommand(state, { type: "startWork", kind, col, row }, pid).ok) return;
    }
  }
}

/** Start a wonder once per empire, on an empty owned tile a capable city can reach. */
function aiWonders(state: GameState, pid: number): void {
  if (worksOf(state, pid).some((w) => w.kind === "wonder")) return; // one at a time
  const wonder = WONDER_DEFS.find(
    (w) => !state.completedWonders.includes(w.id) && !worksOf(state, pid).some((x) => x.wonderId === w.id),
  );
  if (!wonder) return;
  // canStartWonder enforces ownership, an empty tile, and a nearby city with the
  // required craftsmen — scan owned tiles for the first spot that qualifies.
  for (const t of state.map.tiles) {
    const owner = t.ownerCityId !== undefined ? state.cities.get(t.ownerCityId) : undefined;
    if (!owner || owner.ownerId !== pid) continue;
    if (canStartWonder(state, pid, wonder.id, t.col, t.row).ok) {
      applyCommand(state, { type: "startWonder", wonderId: wonder.id, col: t.col, row: t.row }, pid);
      return;
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

  // Defend a threatened city against hostiles (barbarians or war enemies). We
  // ignore peaceful neighbours so AI armies don't shadow units they can't fight.
  for (const city of citiesOf(state, unit.ownerId)) {
    for (const e of state.units.values()) {
      if (isHostile(state, pid, e.ownerId) && axialDistance(ax(city), ax(e)) <= 3) {
        stepToward(state, unit, e.col, e.row, pid);
        return;
      }
    }
  }
  // Pressure the nearest hostile if there is one; otherwise scout the map.
  const enemy = nearestHostile(state, unit, pid);
  if (enemy) stepToward(state, unit, enemy.col, enemy.row, pid);
  else aiExplore(state, unit, pid);
}

/** Play a full turn for an AI-controlled civ. */
export function aiTakeTurn(state: GameState, playerId: number): void {
  const player = playerById(state, playerId);
  if (!player) return;

  aiConsiderDiplomacy(state, playerId); // declare/sue for war, court friends

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
  aiWonders(state, playerId);

  for (const unit of unitsOf(state, playerId)) {
    if (!state.units.has(unit.id)) continue;
    const def = UNIT_DEFS[unit.type];
    if (unit.unspentPromotions > 0) aiPromote(state, unit, playerId);
    if (def.founder) aiSettler(state, unit, playerId);
    else if (def.trader) aiTrader(state, unit, playerId);
    else aiMilitary(state, unit, playerId);
  }
}
