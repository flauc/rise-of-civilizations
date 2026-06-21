// Public Works: projects a city's specialists execute on tiles in the empire's
// territory. Economic ladders (farm/mine/quarry/lumber_camp/road) and defensive
// structures (wall/tower) each have 3 tiers; building or upgrading is a Work
// whose labour cost scales with distance from the building city and with tier.
// Wonders are great Works needing several disciplines and (optionally) several
// cities. See docs/SPECIALISTS-AND-WORKS.md.

import { axialDistance, getTile, offsetToAxial, type Tile } from "@roc/shared";
import { getWonder, WONDER_DEFS, UNIQUE_IMPROVEMENTS, type UniqueInfraDef } from "@roc/data";
import type { City, Discipline, GameState, Specialist, Work } from "./state";
import { citiesOf, cityAt, log, playerById } from "./state";
import { isPassableLand } from "./terrain";
import { availableTechs } from "./economy";
import {
  SPECIALIST_DEFS,
  grantSpecialistXp,
  specialistLabour,
  type SpecialistId,
} from "./specialists";
import { DEFENSE_NAMES, STRUCTURE_HP, type DefenseKind } from "./fortifications";
import { emitImprovementComplete, emitWonderComplete } from "./turn-updates";

export type EconKind =
  | "farm"
  | "mine"
  | "quarry"
  | "lumber_camp"
  | "pasture"
  | "plantation"
  | "camp"
  | "fishing_boats"
  | "road";
export type { DefenseKind };
export type WorkKind = EconKind | DefenseKind | "wonder";

const MAX_TIER = 3;
const DISTANCE_FACTOR = 0.5;

const ECON_DISCIPLINE: Record<EconKind, Discipline> = {
  farm: "carpentry",
  lumber_camp: "carpentry",
  mine: "masonry",
  quarry: "masonry",
  pasture: "carpentry",
  plantation: "carpentry",
  camp: "carpentry",
  fishing_boats: "survey",
  road: "survey",
};
export const ECON_BASE: Record<EconKind, number> = {
  farm: 3,
  lumber_camp: 3,
  mine: 4,
  quarry: 4,
  pasture: 3,
  plantation: 3,
  camp: 3,
  fishing_boats: 3,
  road: 2,
};
const DEFENSE_BASE: Record<DefenseKind, number> = { wall: 4, tower: 5 };

export const ECON_TERRAIN: Record<EconKind, ReadonlySet<string> | null> = {
  farm: new Set(["grassland", "plains"]),
  lumber_camp: new Set(["forest", "woods", "jungle", "taiga"]),
  mine: new Set(["hills", "desert", "mesa"]),
  quarry: new Set(["hills", "desert", "mesa"]),
  pasture: new Set(["grassland", "plains", "tundra", "hills", "desert"]),
  plantation: new Set(["grassland", "plains", "hills", "forest", "woods", "jungle", "wetlands", "desert"]),
  camp: new Set(["forest", "woods", "jungle", "taiga", "tundra"]),
  fishing_boats: new Set(["coast", "lake", "ocean"]),
  road: null, // any passable land
};

export const ECON_NAMES: Record<EconKind, [string, string, string]> = {
  road: ["Dirt Road", "Paved Road", "Imperial Road"],
  farm: ["Farm", "Irrigated Farm", "Estate"],
  lumber_camp: ["Lumber Camp", "Sawmill", "Timberworks"],
  mine: ["Mine", "Deep Mine", "Great Mine"],
  quarry: ["Quarry", "Stoneworks", "Marble Works"],
  pasture: ["Pasture", "Ranch", "Stud Farm"],
  plantation: ["Plantation", "Estate", "Great Plantation"],
  camp: ["Camp", "Trapper Post", "Hunting Lodge"],
  fishing_boats: ["Fishing Boats", "Fishing Fleet", "Commercial Fishery"],
};

export function isEconKind(kind: string): kind is EconKind {
  return kind in ECON_BASE;
}

// ---- civ-unique tile improvements (single-tier, owner-civ only) ------------
const UNIQUE_IMP_BASE = 5; // labour, scaled by distance
const UNIQUE_IMP_BY_KIND = new Map<string, UniqueInfraDef>(UNIQUE_IMPROVEMENTS.map((u) => [u.id, u]));

/** Whether a kind string is a civ-unique tile improvement (kind === its infra id). */
export function isUniqueImpKind(kind: string): boolean {
  return UNIQUE_IMP_BY_KIND.has(kind);
}
function uniqueImpDef(kind: string): UniqueInfraDef | undefined {
  return UNIQUE_IMP_BY_KIND.get(kind);
}

/** Discipline required for an economic work kind. */
export function workDiscipline(kind: EconKind): Discipline {
  return ECON_DISCIPLINE[kind];
}
export function isDefenseKind(kind: string): kind is DefenseKind {
  return kind in DEFENSE_BASE;
}

/** Human-readable name of a work kind at a tier. */
export function workName(kind: string, tier: number): string {
  if (isUniqueImpKind(kind)) return uniqueImpDef(kind)!.name;
  const i = Math.min(MAX_TIER, Math.max(1, tier)) - 1;
  if (isEconKind(kind)) return ECON_NAMES[kind][i]!;
  if (isDefenseKind(kind)) return DEFENSE_NAMES[kind][i]!;
  if (kind === "wonder") return "Wonder";
  return kind;
}

export interface WorkResult {
  ok: boolean;
  error?: string;
  workId?: number;
}

/** The player's city nearest to a tile (host + distance basis), or null. */
export function nearestOwningCity(state: GameState, playerId: number, col: number, row: number): City | null {
  const tileAx = offsetToAxial({ col, row });
  let best: City | null = null;
  let bestD = Infinity;
  for (const c of citiesOf(state, playerId)) {
    const d = axialDistance(tileAx, offsetToAxial({ col: c.col, row: c.row }));
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

/**
 * The next tier a work of `kind` would target on a tile, or null if it can't be
 * built/upgraded there (wrong terrain, occupied, already max tier).
 */
export function nextTierAt(tile: Tile, kind: string): number | null {
  if (kind === "road") {
    if (!isPassableLand(tile.terrain)) return null;
    const cur = tile.road ? tile.roadLevel ?? 1 : 0;
    return cur < MAX_TIER ? cur + 1 : null;
  }
  if (isEconKind(kind)) {
    if (tile.structure) return null; // occupied by a defensive structure
    const terrains = ECON_TERRAIN[kind];
    // Farms can also be cut into otherwise-unfarmable land a river crosses, by
    // draining and channelling it — Nile/Mesopotamia style. That extra
    // eligibility is gated on Irrigation in canStartWork.
    const terrainOk =
      !terrains ||
      terrains.has(tile.terrain) ||
      (kind === "farm" && !!tile.river && isPassableLand(tile.terrain));
    if (!terrainOk) return null;
    if (tile.improvement && tile.improvement !== kind) return null; // a different improvement is here
    const cur = tile.improvement === kind ? tile.improvementLevel ?? 1 : 0;
    return cur < MAX_TIER ? cur + 1 : null;
  }
  if (isDefenseKind(kind)) {
    if (!isPassableLand(tile.terrain)) return null;
    if (tile.improvement) return null; // economic improvement occupies the tile
    if (tile.structure && tile.structure.kind !== kind) return null; // wrong structure type
    const cur = tile.structure && tile.structure.kind === kind ? tile.structure.tier : 0;
    return cur < MAX_TIER ? cur + 1 : null;
  }
  if (isUniqueImpKind(kind)) {
    const def = uniqueImpDef(kind)!;
    if (tile.structure) return null;
    if (def.terrain && !def.terrain.includes(tile.terrain)) return null;
    if (tile.improvement && tile.improvement !== kind) return null;
    return tile.improvement === kind ? null : 1; // single tier
  }
  return null;
}

/** Distance-and-tier-scaled labour requirement for a tile/defensive work. */
export function workLabourFor(
  state: GameState,
  kind: string,
  tier: number,
  city: City,
  col: number,
  row: number,
): Partial<Record<Discipline, number>> {
  const dist = axialDistance(offsetToAxial({ col, row }), offsetToAxial({ col: city.col, row: city.row }));
  const distMult = 1 + DISTANCE_FACTOR * dist;
  if (isEconKind(kind)) {
    const base = ECON_BASE[kind] * tier * distMult;
    return { [ECON_DISCIPLINE[kind]]: Math.ceil(base) };
  }
  if (isDefenseKind(kind)) {
    const base = DEFENSE_BASE[kind] * tier * distMult;
    // Defensive works need both a Mason and a Military Engineer.
    return { masonry: Math.ceil(base), engineering: Math.ceil(base) };
  }
  if (isUniqueImpKind(kind)) {
    const disc = uniqueImpDef(kind)!.discipline ?? "carpentry";
    return { [disc]: Math.ceil(UNIQUE_IMP_BASE * tier * distMult) };
  }
  return {};
}

function tileOwnedBy(state: GameState, tile: Tile, playerId: number): boolean {
  if (tile.ownerCityId === undefined) return false;
  const city = state.cities.get(tile.ownerCityId);
  return !!city && city.ownerId === playerId;
}

/** Specialist disciplines a work of `kind` needs trained before it can begin. */
export function workDisciplines(kind: string): Discipline[] {
  if (isEconKind(kind)) return [ECON_DISCIPLINE[kind]];
  if (isDefenseKind(kind)) return ["masonry", "engineering"];
  if (isUniqueImpKind(kind)) return [uniqueImpDef(kind)!.discipline ?? "carpentry"];
  return [];
}

/** Disciplines a city can currently supply from its trained craftsmen. */
export function cityDisciplines(city: City): Set<Discipline> {
  const set = new Set<Discipline>();
  for (const s of city.specialists) {
    const d = SPECIALIST_DEFS[s.type as SpecialistId]?.discipline;
    if (d) set.add(d);
  }
  return set;
}

/** The display name of the specialist that practises a discipline (e.g. "Mason"). */
export function specialistNameForDiscipline(d: Discipline): string {
  for (const id of Object.keys(SPECIALIST_DEFS) as SpecialistId[]) {
    if (SPECIALIST_DEFS[id].discipline === d) return SPECIALIST_DEFS[id].name;
  }
  return d;
}

function disciplinesError(missing: Discipline[]): string {
  return `No ${missing.map(specialistNameForDiscipline).join(" or ")} to do the work — train one first`;
}

/** Nearest of the player's cities that has every discipline in `disciplines`. */
function nearestCapableCity(
  state: GameState,
  playerId: number,
  col: number,
  row: number,
  disciplines: Discipline[],
): City | null {
  const tileAx = offsetToAxial({ col, row });
  let best: City | null = null;
  let bestD = Infinity;
  for (const c of citiesOf(state, playerId)) {
    const have = cityDisciplines(c);
    if (!disciplines.every((d) => have.has(d))) continue;
    const d = axialDistance(tileAx, offsetToAxial({ col: c.col, row: c.row }));
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

/** Validate a tile/defensive work without mutating (drives the build UI). */
export function canStartWork(state: GameState, playerId: number, kind: string, col: number, row: number): WorkResult {
  if (!isEconKind(kind) && !isDefenseKind(kind) && !isUniqueImpKind(kind)) return { ok: false, error: "unknown work" };
  const tile = getTile(state.map, col, row);
  if (!tile) return { ok: false, error: "no such tile" };
  if (!tileOwnedBy(state, tile, playerId)) return { ok: false, error: "tile not in your territory" };
  // A civ's unique improvement can only be built by that civ, once its tech is known.
  if (isUniqueImpKind(kind)) {
    const p = playerById(state, playerId);
    const def = uniqueImpDef(kind)!;
    if (p?.civId !== def.civId) return { ok: false, error: "not your civilization's unique improvement" };
    if (!(p.researched as ReadonlySet<string>).has(def.reqTech)) return { ok: false, error: `requires ${def.reqTech}` };
  }
  if (state.works.some((w) => w.ownerId === playerId && w.target && w.target.col === col && w.target.row === row)) {
    return { ok: false, error: "this tile is already being worked" };
  }
  const tier = nextTierAt(tile, kind);
  if (tier === null) return { ok: false, error: "cannot build that here" };
  // Farming a river tile means draining and channelling it — only possible once
  // Irrigation has been researched.
  if (kind === "farm" && tile.river && !playerById(state, playerId)?.researched.has("irrigation")) {
    return { ok: false, error: "Research Irrigation to farm river tiles" };
  }
  const needs = workDisciplines(kind);
  const host = nearestCapableCity(state, playerId, col, row, needs);
  if (!host) {
    // Distinguish "no city at all" from "no city with the right craftsmen".
    if (!nearestOwningCity(state, playerId, col, row)) return { ok: false, error: "no city to build from" };
    return { ok: false, error: disciplinesError(needs) };
  }
  return { ok: true };
}

/** Start (or upgrade) a tile/defensive work. Tier is inferred from the tile. */
export function startWork(state: GameState, playerId: number, kind: string, col: number, row: number): WorkResult {
  const can = canStartWork(state, playerId, kind, col, row);
  if (!can.ok) return can;
  const tile = getTile(state.map, col, row)!;
  const tier = nextTierAt(tile, kind)!;
  const host = nearestCapableCity(state, playerId, col, row, workDisciplines(kind))!;
  const id = state.nextEntityId++;
  state.works.push({
    id,
    ownerId: playerId,
    kind,
    tier,
    target: { col, row },
    hostCityId: host.id,
    cityIds: [host.id],
    requirement: workLabourFor(state, kind, tier, host, col, row),
    progress: {},
  });
  return { ok: true, workId: id };
}

/** Is this tile a clear, buildable spot for a world-wonder? (no city, feature,
 *  improvement, structure, natural or built wonder, and passable land). */
export function isWonderBuildableTile(tile: Tile): boolean {
  if (!isPassableLand(tile.terrain)) return false;
  if (tile.improvement || tile.structure || tile.feature) return false;
  if (tile.naturalWonder || tile.wonder) return false;
  return true;
}

/** Validate starting a wonder on a tile without mutating (drives the wonder UI).
 *  Wonders are tile-targeted like improvements: the player picks an empty tile in
 *  their territory and the nearest city with every required craft hosts the work. */
export function canStartWonder(state: GameState, playerId: number, wonderId: string, col: number, row: number): WorkResult {
  const def = getWonder(wonderId);
  if (!def) return { ok: false, error: "no such wonder" };
  if (state.completedWonders.includes(wonderId)) return { ok: false, error: "wonder already built" };
  if (state.works.some((w) => w.ownerId === playerId && w.wonderId === wonderId)) {
    return { ok: false, error: "already building that wonder" };
  }
  const tile = getTile(state.map, col, row);
  if (!tile) return { ok: false, error: "no such tile" };
  if (!tileOwnedBy(state, tile, playerId)) return { ok: false, error: "tile not in your territory" };
  if (cityAt(state, col, row)) return { ok: false, error: "cannot build a wonder on a city" };
  if (!isWonderBuildableTile(tile)) return { ok: false, error: "cannot build a wonder here" };
  if (state.works.some((w) => w.ownerId === playerId && w.target && w.target.col === col && w.target.row === row)) {
    return { ok: false, error: "this tile is already being worked" };
  }
  const needs = Object.keys(def.requirement) as Discipline[];
  const host = nearestCapableCity(state, playerId, col, row, needs);
  if (!host) {
    if (!nearestOwningCity(state, playerId, col, row)) return { ok: false, error: "no city to build from" };
    return { ok: false, error: disciplinesError(needs) };
  }
  return { ok: true };
}

/** Begin a wonder on an owned tile, hosted by the nearest city with the crew. */
export function startWonder(state: GameState, playerId: number, wonderId: string, col: number, row: number): WorkResult {
  const can = canStartWonder(state, playerId, wonderId, col, row);
  if (!can.ok) return can;
  const def = getWonder(wonderId)!;
  const host = nearestCapableCity(state, playerId, col, row, Object.keys(def.requirement) as Discipline[])!;
  const id = state.nextEntityId++;
  state.works.push({
    id,
    ownerId: playerId,
    kind: "wonder",
    wonderId,
    target: { col, row },
    hostCityId: host.id,
    cityIds: [host.id],
    requirement: { ...(def.requirement as Partial<Record<Discipline, number>>) },
    progress: {},
  });
  return { ok: true, workId: id };
}

/** Add/remove a contributing city from a wonder work. */
export function assignCityToWonder(state: GameState, workId: number, cityId: number, on: boolean, playerId: number): WorkResult {
  const w = state.works.find((x) => x.id === workId);
  if (!w || w.ownerId !== playerId) return { ok: false, error: "no such work" };
  if (w.kind !== "wonder") return { ok: false, error: "not a wonder" };
  const city = state.cities.get(cityId);
  if (!city || city.ownerId !== playerId) return { ok: false, error: "not your city" };
  if (on) {
    if (!w.cityIds.includes(cityId)) w.cityIds.push(cityId);
  } else if (cityId !== w.hostCityId) {
    w.cityIds = w.cityIds.filter((id) => id !== cityId);
  }
  return { ok: true };
}

export function cancelWork(state: GameState, workId: number, playerId: number): WorkResult {
  const before = state.works.length;
  state.works = state.works.filter((w) => !(w.id === workId && w.ownerId === playerId));
  return before === state.works.length ? { ok: false, error: "no such work" } : { ok: true };
}

export function worksOf(state: GameState, playerId: number): Work[] {
  return state.works.filter((w) => w.ownerId === playerId);
}

export function worksOfCity(state: GameState, cityId: number): Work[] {
  return state.works.filter((w) => w.cityIds.includes(cityId));
}

/** The work a specialist labours on this turn (first incomplete city work that
 *  still needs its discipline), or null if it is idle. */
export function currentWorkFor(state: GameState, city: City, specialist: Specialist): Work | null {
  const disc = SPECIALIST_DEFS[specialist.type as SpecialistId]?.discipline;
  if (!disc) return null;
  for (const w of state.works) {
    if (!w.cityIds.includes(city.id)) continue;
    if ((w.requirement[disc] ?? 0) > (w.progress[disc] ?? 0)) return w;
  }
  return null;
}

function needs(w: Work, d: Discipline): boolean {
  return (w.requirement[d] ?? 0) > (w.progress[d] ?? 0);
}
function isComplete(w: Work): boolean {
  return (Object.keys(w.requirement) as Discipline[]).every((d) => (w.progress[d] ?? 0) >= (w.requirement[d] ?? 0));
}

/** Drop works whose host city is gone/changed owner or whose tile left our territory. */
function pruneWorks(state: GameState): void {
  state.works = state.works.filter((w) => {
    const host = state.cities.get(w.hostCityId);
    if (!host || host.ownerId !== w.ownerId) return false;
    w.cityIds = w.cityIds.filter((id) => {
      const c = state.cities.get(id);
      return c && c.ownerId === w.ownerId;
    });
    if (w.cityIds.length === 0) return false;
    if (w.target) {
      const t = getTile(state.map, w.target.col, w.target.row);
      if (!t || !tileOwnedBy(state, t, w.ownerId)) return false;
    }
    if (w.wonderId && state.completedWonders.includes(w.wonderId)) return false;
    return true;
  });
}

function completeWork(state: GameState, w: Work): void {
  const owner = playerById(state, w.ownerId);
  if (w.kind === "wonder" && w.wonderId) {
    if (state.completedWonders.includes(w.wonderId)) return; // someone beat us to it
    const def = getWonder(w.wonderId);
    state.completedWonders.push(w.wonderId);
    const host = state.cities.get(w.hostCityId);
    if (host && !host.wonders.includes(w.wonderId)) host.wonders.push(w.wonderId);
    // Stamp the chosen tile so the wonder's decor renders on the map.
    if (w.target) {
      const wtile = getTile(state.map, w.target.col, w.target.row);
      if (wtile) wtile.wonder = w.wonderId;
    }
    if (def?.effect.freeTech && owner) {
      const tech = availableTechs(owner)[0];
      if (tech) {
        owner.researched.add(tech);
        log(state, `${owner.name} gained ${tech} from the ${def.name}.`, {
          actorId: owner.id,
          targetIds: [owner.id],
          tile: host ? { col: host.col, row: host.row } : undefined,
        });
      }
    }
    const at = w.target ?? (host ? { col: host.col, row: host.row } : undefined);
    log(state, `${owner?.name ?? "Someone"} completed the ${def?.name ?? "Wonder"}!`, {
      actorId: owner?.id,
      targetIds: owner ? [owner.id] : undefined,
      tile: at,
    });
    if (owner && !owner.isBarbarian && def) {
      emitWonderComplete(
        state,
        owner.id,
        w.id,
        def.id,
        def.name,
        at?.col ?? w.hostCityId,
        at?.row ?? 0,
      );
    }
    return;
  }
  if (!w.target) return;
  const tile = getTile(state.map, w.target.col, w.target.row);
  if (!tile) return;
  const tier = w.tier ?? 1;
  if (w.kind === "road") {
    tile.road = true;
    tile.roadLevel = tier;
  } else if (isEconKind(w.kind) || isUniqueImpKind(w.kind)) {
    tile.improvement = w.kind;
    tile.improvementLevel = tier;
  } else if (isDefenseKind(w.kind)) {
    const maxHp = STRUCTURE_HP[w.kind][tier - 1]!;
    tile.structure = { kind: w.kind, tier, hp: maxHp, maxHp };
  }
  log(state, `${owner?.name ?? "Someone"} completed a ${workName(w.kind, tier)}.`, {
    actorId: owner?.id,
    targetIds: owner ? [owner.id] : undefined,
    tile: w.target ? { col: w.target.col, row: w.target.row } : undefined,
  });
  if (owner && !owner.isBarbarian && w.target) {
    emitImprovementComplete(
      state,
      owner.id,
      w.id,
      w.kind,
      workName(w.kind, tier),
      w.target.col,
      w.target.row,
    );
  }
}

/**
 * Apply one turn of specialist labour to a player's works, in queue order per
 * city, granting XP. Completed works apply their effect and are removed.
 */
export function advanceWorks(state: GameState, playerId: number): void {
  pruneWorks(state);
  const works = state.works.filter((w) => w.ownerId === playerId);
  if (works.length === 0) return;

  for (const city of citiesOf(state, playerId)) {
    const cityWorks = works.filter((w) => w.cityIds.includes(city.id) && !isComplete(w));
    for (const s of city.specialists) {
      const disc = SPECIALIST_DEFS[s.type as SpecialistId]?.discipline;
      if (!disc) continue;
      const w = cityWorks.find((x) => needs(x, disc));
      if (!w) continue; // idle this turn
      const add = specialistLabour(s);
      w.progress[disc] = Math.min(w.requirement[disc] ?? 0, (w.progress[disc] ?? 0) + add);
      grantSpecialistXp(s, 2);
    }
  }

  // Complete and remove finished works; award a completion XP bonus.
  for (const w of works) {
    if (!isComplete(w)) continue;
    for (const cid of w.cityIds) {
      const c = state.cities.get(cid);
      if (!c) continue;
      for (const s of c.specialists) {
        const disc = SPECIALIST_DEFS[s.type as SpecialistId]?.discipline;
        if (disc && w.requirement[disc]) grantSpecialistXp(s, 6);
      }
    }
    completeWork(state, w);
  }
  state.works = state.works.filter((w) => !(w.ownerId === playerId && isComplete(w)));
  pruneWorks(state);
}

export { WONDER_DEFS };
