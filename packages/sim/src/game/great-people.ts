// Great People: finite, named historical figures earned by accumulating per-class
// points. Buildings (and the capital's seat of government) feed class point pools
// each turn; when a pool fills, the player RECRUITS the next era-appropriate figure
// of that class — globally unique, so once taken it is gone for everyone. A recruit
// can be ACTIVATED once for an instant, themed effect. See docs/GREAT-PEOPLE.md.
//
// Auras / placed-improvement activations from the design doc are a future
// extension; every figure resolves to one of the instant effect hooks below.

import {
  GREAT_PEOPLE,
  GREAT_PERSON_CLASSES,
  getGreatPerson,
  greatPeopleOfClass,
  type GreatPersonClass,
  type GreatPersonDef,
} from "@roc/data";
import type { City, GameState, Player } from "./state";
import { citiesOf, log, playerById, unitsOf } from "./state";
import { BUILDING_DEFS, UNIT_DEFS, isMilitary, isNaval, type BuildingId } from "./content";
import { unitMaxHp } from "./combat";
import { GLOBAL_MORALE_MAX, globalMoraleOf, recordMoraleEvent, recordMoraleGain } from "./morale";
import { emitGreatPersonRecruited } from "./turn-updates";

export type { GreatPersonClass, GreatPersonDef };

/** Great-person points each building contributes per turn to its owner's pools. */
const BUILDING_GP_POINTS: Partial<Record<BuildingId, Partial<Record<GreatPersonClass, number>>>> = {
  library: { scientist: 2 },
  academy: { scientist: 3 },
  market: { merchant: 2 },
  harbor: { admiral: 2, merchant: 1 },
  lighthouse: { admiral: 2 },
  barracks: { general: 2 },
  stable: { general: 1 },
  workshop: { engineer: 1 },
  forge: { engineer: 2 },
  shrine: { prophet: 2 },
  temple: { prophet: 2 },
  monument: { artist: 1 },
  amphitheater: { artist: 3 },
};

/** The capital is the seat of government — it earns Great Statesman points. */
const CAPITAL_STATESMAN_POINTS = 2;

/** Base point cost of a player's FIRST figure of a class; each later figure of
 *  that class costs `GP_THRESHOLD_STEP` more. */
const GP_THRESHOLD_BASE = 60;
const GP_THRESHOLD_STEP = 50;

/** Threshold for a player's next figure of a class, given how many of that class
 *  they have already earned this game. */
export function greatPersonThreshold(earnedOfClass: number): number {
  return GP_THRESHOLD_BASE + GP_THRESHOLD_STEP * earnedOfClass;
}

function pointsOf(player: Player): Partial<Record<GreatPersonClass, number>> {
  return (player.greatPeoplePoints ??= {});
}
function earnedOf(player: Player): Partial<Record<GreatPersonClass, number>> {
  return (player.greatPeopleEarned ??= {});
}

/** Per-turn great-person point gain for one city (buildings + capital seat). */
export function cityGreatPersonPoints(city: City): Partial<Record<GreatPersonClass, number>> {
  const out: Partial<Record<GreatPersonClass, number>> = {};
  const add = (cls: GreatPersonClass, n: number) => {
    out[cls] = (out[cls] ?? 0) + n;
  };
  for (const b of city.buildings) {
    const src = BUILDING_GP_POINTS[b as keyof typeof BUILDING_GP_POINTS];
    if (!src) continue;
    for (const cls of Object.keys(src) as GreatPersonClass[]) add(cls, src[cls]!);
  }
  if (city.isCapital) add("statesman", CAPITAL_STATESMAN_POINTS);
  return out;
}

/** Total per-turn great-person point gain across all of a player's cities. */
export function playerGreatPersonPerTurn(state: GameState, playerId: number): Partial<Record<GreatPersonClass, number>> {
  const out: Partial<Record<GreatPersonClass, number>> = {};
  for (const city of citiesOf(state, playerId)) {
    const c = cityGreatPersonPoints(city);
    for (const cls of Object.keys(c) as GreatPersonClass[]) out[cls] = (out[cls] ?? 0) + c[cls]!;
  }
  return out;
}

/** The next not-yet-recruited figure of a class (earliest era first), if any. */
export function nextAvailableFigure(state: GameState, cls: GreatPersonClass): GreatPersonDef | undefined {
  const taken = new Set(state.recruitedGreatPeople ?? []);
  return greatPeopleOfClass(cls).find((g) => !taken.has(g.id));
}

/**
 * Accrue a player's per-turn great-person points and recruit any figures whose
 * pools have filled. Called once per player each turn (from beginTurn, after city
 * economy). Barbarians never earn Great People.
 */
export function accrueGreatPeople(state: GameState, player: Player): void {
  if (player.isBarbarian) return;
  state.recruitedGreatPeople ??= [];
  const points = pointsOf(player);
  const perTurn = playerGreatPersonPerTurn(state, player.id);
  for (const cls of Object.keys(perTurn) as GreatPersonClass[]) {
    points[cls] = (points[cls] ?? 0) + perTurn[cls]!;
  }
  // Recruit while a pool can afford the next figure AND one is still available.
  for (const cls of GREAT_PERSON_CLASSES) {
    let guard = 0;
    while (guard++ < 16) {
      const earned = earnedOf(player)[cls] ?? 0;
      const cost = greatPersonThreshold(earned);
      if ((points[cls] ?? 0) < cost) break;
      const figure = nextAvailableFigure(state, cls);
      if (!figure) {
        // No figures left of this class — stop draining the pool.
        break;
      }
      points[cls] = (points[cls] ?? 0) - cost;
      earnedOf(player)[cls] = earned + 1;
      state.recruitedGreatPeople.push(figure.id);
      (player.greatPeople ??= []).push(figure.id);
      log(state, `${player.name} recruited ${figure.name}, a ${figure.cls === "general" ? "Great General" : "Great Person"}.`, {
        actorId: player.id,
        targetIds: [player.id],
      });
      emitGreatPersonRecruited(state, player.id, figure);
    }
  }
}

export interface ActivateResult {
  ok: boolean;
  error?: string;
}

/** The city best suited to receive an engineer's production surge. */
function bestProductionCity(state: GameState, playerId: number): City | undefined {
  const cities = citiesOf(state, playerId);
  if (cities.length === 0) return undefined;
  // Prefer the capital; otherwise the first city. (Avoids importing the economy
  // module just to rank by yield — production effect is forgiving of the choice.)
  return cities.find((c) => c.isCapital) ?? cities[0];
}

/** Effect magnitudes (instant one-shots). */
const EUREKA_SCIENCE = 160;
const WINDFALL_GOLD = 250;
const MASTERWORK_PRODUCTION = 150;
const INSPIRATION_CULTURE = 150;
const REVELATION_FAITH = 200;
const REFORM_CULTURE = 150;
const GP_MORALE_LIFT = 12;

function liftGlobalMorale(state: GameState, player: Player, by: number): void {
  const before = globalMoraleOf(player);
  player.globalMorale = Math.min(GLOBAL_MORALE_MAX, (player.globalMorale ?? 50) + by);
  recordMoraleEvent(state, player.id, before, "A Great Person inspired the empire");
  recordMoraleGain(state, player.id);
}

/** Apply a figure's instant effect. Returns a short human-readable summary. */
function applyGreatPersonEffect(state: GameState, player: Player, def: GreatPersonDef): string {
  switch (def.effect) {
    case "eureka": {
      player.scienceProgress += EUREKA_SCIENCE;
      return `+${EUREKA_SCIENCE} science`;
    }
    case "windfall": {
      player.gold += WINDFALL_GOLD;
      return `+${WINDFALL_GOLD} gold`;
    }
    case "masterwork": {
      const city = bestProductionCity(state, player.id);
      if (city) city.productionStored += MASTERWORK_PRODUCTION;
      return `+${MASTERWORK_PRODUCTION} production in ${city?.name ?? "your capital"}`;
    }
    case "inspiration": {
      player.cultureProgress += INSPIRATION_CULTURE;
      return `+${INSPIRATION_CULTURE} culture`;
    }
    case "revelation": {
      player.faith += REVELATION_FAITH;
      return `+${REVELATION_FAITH} faith`;
    }
    case "reform": {
      player.cultureProgress += REFORM_CULTURE;
      return `+${REFORM_CULTURE} culture`;
    }
    case "drill": {
      let n = 0;
      for (const u of unitsOf(state, player.id)) {
        const def2 = UNIT_DEFS[u.type];
        if (isMilitary(u.type) && !isNaval(def2)) {
          u.unspentPromotions += 1;
          n += 1;
        }
      }
      liftGlobalMorale(state, player, GP_MORALE_LIFT);
      return n > 0 ? `a free promotion to ${n} land unit${n === 1 ? "" : "s"}` : "your army is heartened";
    }
    case "flagship": {
      let n = 0;
      for (const u of unitsOf(state, player.id)) {
        const full = unitMaxHp(u);
        if (u.hp < full) {
          u.hp = full;
          n += 1;
        }
      }
      liftGlobalMorale(state, player, GP_MORALE_LIFT);
      return n > 0 ? `healed ${n} unit${n === 1 ? "" : "s"}` : "your fleet is heartened";
    }
  }
}

/**
 * Activate (and consume) a recruited Great Person the player holds. Applies the
 * figure's instant effect. The figure stays in `state.recruitedGreatPeople`
 * (globally taken forever) but is removed from the player's available list.
 */
export function activateGreatPerson(state: GameState, player: Player, id: string): ActivateResult {
  const held = player.greatPeople ?? [];
  if (!held.includes(id)) return { ok: false, error: "you have no such Great Person" };
  const def = getGreatPerson(id);
  if (!def) return { ok: false, error: "unknown Great Person" };
  const summary = applyGreatPersonEffect(state, player, def);
  player.greatPeople = held.filter((g) => g !== id);
  log(state, `${player.name} put ${def.name} to work: ${summary}.`, {
    actorId: player.id,
    targetIds: [player.id],
  });
  return { ok: true };
}

/** True if the player has any recruited-but-unused Great People. */
export function hasUnusedGreatPeople(player: Player): boolean {
  return (player.greatPeople?.length ?? 0) > 0;
}

export { GREAT_PEOPLE };
