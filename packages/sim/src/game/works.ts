// Public Works: projects a city's specialists execute on tiles in the empire's
// territory. Economic ladders (farm/mine/quarry/lumber_camp/road) and defensive
// structures (wall/tower) each have 3 tiers; building or upgrading is a Work
// whose labour cost scales with distance from the building city and with tier.
// Wonders are great Works needing several disciplines and (optionally) several
// cities. See docs/SPECIALISTS-AND-WORKS.md.

import { axialDistance, getTile, offsetToAxial, type Tile } from "@roc/shared";
import { getWonder, WONDER_DEFS, UNIQUE_IMPROVEMENTS, type UniqueInfraDef } from "@roc/data";
import type { City, Discipline, GameState, Player, Specialist, Work } from "./state";
import { citiesOf, cityAt, log, playerById } from "./state";
import { isPassableLand } from "./terrain";
import { availableTechs } from "./economy";
import { TECH_DEFS, type TechId } from "./content";
import {
  SPECIALIST_DEFS,
  availableSpecialists,
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
  | "fishery"
  | "saltern"
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
  fishery: "survey",
  saltern: "survey",
  road: "survey",
};

// Econ improvements gated behind a researched technology (loose TechId strings).
// Most improvements are available from the start; these unlock with progress.
export const ECON_REQ_TECH: Partial<Record<EconKind, TechId>> = {
  fishery: "maritime_foraging",
  saltern: "maritime_foraging",
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
  fishery: 4,
  saltern: 3,
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
  fishery: new Set(["coast", "lake", "ocean"]),
  saltern: new Set(["coast", "lake"]),
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
  fishery: ["Fishery", "Fishing Wharf", "Grand Fishery"],
  saltern: ["Salt Pans", "Saltern", "Salt Works"],
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

/** Locate one of a player's specialists by id, with the city it lives on. */
export function findSpecialist(
  state: GameState,
  playerId: number,
  specialistId: number,
): { city: City; specialist: Specialist } | null {
  for (const c of citiesOf(state, playerId)) {
    const s = c.specialists.find((x) => x.id === specialistId);
    if (s) return { city: c, specialist: s };
  }
  return null;
}

/** The discipline a specialist practises, or undefined for an unknown type. */
function specialistDiscipline(s: Specialist): Discipline | undefined {
  return SPECIALIST_DEFS[s.type as SpecialistId]?.discipline;
}

/** True if the player has researched the tech that lets them train a `d`-craftsman. */
function disciplineUnlocked(player: Player, d: Discipline): boolean {
  return availableSpecialists(player).some((id) => SPECIALIST_DEFS[id].discipline === d);
}

/** True if any of the player's cities already has a trained `d`-craftsman. */
function playerHasDiscipline(state: GameState, playerId: number, d: Discipline): boolean {
  return citiesOf(state, playerId).some((c) => cityDisciplines(c).has(d));
}

/** Disciplines the player can neither train (tech-locked) nor already fields — so a
 *  work needing them could never be completed. */
function lockedDisciplines(state: GameState, playerId: number, player: Player, disciplines: Discipline[]): Discipline[] {
  return disciplines.filter((d) => !disciplineUnlocked(player, d) && !playerHasDiscipline(state, playerId, d));
}

/** Recompute a work's contributing cities from its assigned specialists. */
function recomputeCityIds(state: GameState, w: Work): void {
  const ids = new Set<number>();
  for (const sid of w.assignedSpecialistIds) {
    const found = findSpecialist(state, w.ownerId, sid);
    if (found) ids.add(found.city.id);
  }
  w.cityIds = [...ids];
}

/** The display name of the specialist that practises a discipline (e.g. "Mason"). */
export function specialistNameForDiscipline(d: Discipline): string {
  for (const id of Object.keys(SPECIALIST_DEFS) as SpecialistId[]) {
    if (SPECIALIST_DEFS[id].discipline === d) return SPECIALIST_DEFS[id].name;
  }
  return d;
}

/** Error shown when a needed discipline's craftsman isn't researched yet. */
function lockedDisciplinesError(missing: Discipline[]): string {
  return `Research is needed before a ${missing.map(specialistNameForDiscipline).join(" or ")} can do this work`;
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
  // Some econ improvements are locked behind a technology (e.g. water works
  // unlocked by Maritime Foraging).
  if (isEconKind(kind)) {
    const req = ECON_REQ_TECH[kind];
    if (req && !playerById(state, playerId)?.researched.has(req)) {
      return { ok: false, error: `requires ${TECH_DEFS[req].name}` };
    }
  }
  // Farming a river tile means draining and channelling it — only possible once
  // Irrigation has been researched.
  if (kind === "farm" && tile.river && !playerById(state, playerId)?.researched.has("irrigation")) {
    return { ok: false, error: "Research Irrigation to farm river tiles" };
  }
  const host = nearestOwningCity(state, playerId, col, row);
  if (!host) return { ok: false, error: "no city to build from" };
  const player = playerById(state, playerId);
  if (player) {
    // The craft must be at least researchable (or already fielded) …
    const locked = lockedDisciplines(state, playerId, player, workDisciplines(kind));
    if (locked.length) return { ok: false, error: lockedDisciplinesError(locked) };
    // … and there must be an idle craftsman to take the job. A work can't be queued
    // unless the player has a free specialist of each craft it needs to assign to it.
    const missing = unstaffableDisciplines(state, playerId, kind);
    if (missing.length) return { ok: false, error: noFreeSpecialistError(missing) };
  }
  return { ok: true };
}

/** Start (or upgrade) a tile/defensive work. Tier is inferred from the tile. */
export function startWork(state: GameState, playerId: number, kind: string, col: number, row: number): WorkResult {
  const can = canStartWork(state, playerId, kind, col, row);
  if (!can.ok) return can;
  const tile = getTile(state.map, col, row)!;
  const tier = nextTierAt(tile, kind)!;
  const host = nearestOwningCity(state, playerId, col, row)!;
  const id = state.nextEntityId++;
  state.works.push({
    id,
    ownerId: playerId,
    kind,
    tier,
    target: { col, row },
    hostCityId: host.id,
    cityIds: [],
    assignedSpecialistIds: [],
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
  const host = nearestOwningCity(state, playerId, col, row);
  if (!host) return { ok: false, error: "no city to build from" };
  const player = playerById(state, playerId);
  if (player) {
    const locked = lockedDisciplines(state, playerId, player, Object.keys(def.requirement) as Discipline[]);
    if (locked.length) return { ok: false, error: lockedDisciplinesError(locked) };
  }
  return { ok: true };
}

/** Begin a wonder on an owned tile, hosted by the nearest city with the crew. */
export function startWonder(state: GameState, playerId: number, wonderId: string, col: number, row: number): WorkResult {
  const can = canStartWonder(state, playerId, wonderId, col, row);
  if (!can.ok) return can;
  const def = getWonder(wonderId)!;
  const host = nearestOwningCity(state, playerId, col, row)!;
  const id = state.nextEntityId++;
  state.works.push({
    id,
    ownerId: playerId,
    kind: "wonder",
    wonderId,
    target: { col, row },
    hostCityId: host.id,
    cityIds: [],
    assignedSpecialistIds: [],
    requirement: { ...(def.requirement as Partial<Record<Discipline, number>>) },
    progress: {},
  });
  return { ok: true, workId: id };
}

/**
 * Assign (on) or unassign (off) one of the player's specialists to/from a work.
 * A specialist may labour on at most one work at a time, so assigning first
 * detaches it from any other work. Only specialists whose discipline the work
 * still needs may be assigned.
 */
export function assignSpecialist(
  state: GameState,
  playerId: number,
  workId: number,
  specialistId: number,
  on: boolean,
): WorkResult {
  const w = state.works.find((x) => x.id === workId && x.ownerId === playerId);
  if (!w) return { ok: false, error: "no such work" };
  const found = findSpecialist(state, playerId, specialistId);
  if (!found) return { ok: false, error: "no such specialist" };
  if (!on) {
    if (!w.assignedSpecialistIds.includes(specialistId)) return { ok: false, error: "not assigned here" };
    w.assignedSpecialistIds = w.assignedSpecialistIds.filter((id) => id !== specialistId);
    recomputeCityIds(state, w);
    return { ok: true, workId };
  }
  const disc = specialistDiscipline(found.specialist);
  // A work's needed crafts are its requirement keys (covers wonders, which list
  // several disciplines, as well as econ/defensive works).
  if (!disc || !(disc in w.requirement)) {
    return { ok: false, error: "this work needs no labour of that craft" };
  }
  if (w.assignedSpecialistIds.includes(specialistId)) return { ok: true, workId };
  // Enforce one-work-per-specialist: detach from any other work first.
  unassignSpecialistEverywhere(state, playerId, specialistId);
  w.assignedSpecialistIds.push(specialistId);
  recomputeCityIds(state, w);
  return { ok: true, workId };
}

/** Remove a specialist from every work it might be assigned to (keeps cityIds fresh). */
export function unassignSpecialistEverywhere(state: GameState, playerId: number, specialistId: number): void {
  for (const w of state.works) {
    if (w.ownerId !== playerId) continue;
    if (!w.assignedSpecialistIds.includes(specialistId)) continue;
    w.assignedSpecialistIds = w.assignedSpecialistIds.filter((id) => id !== specialistId);
    recomputeCityIds(state, w);
  }
}

/** Specialist ids of the player already committed to some work (so the UI can hide them). */
export function assignedSpecialistIds(state: GameState, playerId: number): Set<number> {
  const set = new Set<number>();
  for (const w of state.works) {
    if (w.ownerId !== playerId) continue;
    for (const id of w.assignedSpecialistIds) set.add(id);
  }
  return set;
}

/** Per-discipline count of the player's trained craftsmen not currently assigned to any
 *  work — the idle labour available to staff a freshly started work. */
export function freeSpecialistsByDiscipline(state: GameState, playerId: number): Map<Discipline, number> {
  const assigned = assignedSpecialistIds(state, playerId);
  const counts = new Map<Discipline, number>();
  for (const c of citiesOf(state, playerId)) {
    for (const s of c.specialists) {
      if (assigned.has(s.id)) continue;
      const d = specialistDiscipline(s);
      if (d) counts.set(d, (counts.get(d) ?? 0) + 1);
    }
  }
  return counts;
}

/** Disciplines a work of `kind` needs for which the player has no idle craftsman to
 *  spare right now (so the work could be started but never staffed). */
function unstaffableDisciplines(state: GameState, playerId: number, kind: string): Discipline[] {
  const free = freeSpecialistsByDiscipline(state, playerId);
  const missing: Discipline[] = [];
  for (const d of new Set(workDisciplines(kind))) {
    if ((free.get(d) ?? 0) < 1) missing.push(d);
  }
  return missing;
}

/** Error shown when a needed craft has no idle specialist to take the job. */
function noFreeSpecialistError(missing: Discipline[]): string {
  // Capitalised "No …" so the build UI renders this as a locked (need-a-craftsman) button.
  return `No ${missing.map(specialistNameForDiscipline).join(" or ")} available`;
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

/** The work a specialist is currently assigned to, or null if it is idle. */
export function currentWorkFor(state: GameState, _city: City, specialist: Specialist): Work | null {
  return state.works.find((w) => w.assignedSpecialistIds.includes(specialist.id)) ?? null;
}

function needs(w: Work, d: Discipline): boolean {
  return (w.requirement[d] ?? 0) > (w.progress[d] ?? 0);
}
function isComplete(w: Work): boolean {
  return (Object.keys(w.requirement) as Discipline[]).every((d) => (w.progress[d] ?? 0) >= (w.requirement[d] ?? 0));
}

/** Labour-per-turn an assigned crew contributes to a work, by discipline. */
export function workLabourPerTurn(state: GameState, w: Work): Partial<Record<Discipline, number>> {
  const out: Partial<Record<Discipline, number>> = {};
  for (const sid of w.assignedSpecialistIds) {
    const found = findSpecialist(state, w.ownerId, sid);
    if (!found) continue;
    const disc = specialistDiscipline(found.specialist);
    if (!disc) continue;
    out[disc] = (out[disc] ?? 0) + specialistLabour(found.specialist);
  }
  return out;
}

/** Turns until a work completes at its current crew rate, or Infinity if a needed
 *  discipline has no assignee (so the work would never finish). 0 = already done. */
export function workEtaTurns(state: GameState, w: Work): number {
  const rate = workLabourPerTurn(state, w);
  let eta = 0;
  for (const d of Object.keys(w.requirement) as Discipline[]) {
    const remaining = (w.requirement[d] ?? 0) - (w.progress[d] ?? 0);
    if (remaining <= 0) continue;
    const r = rate[d] ?? 0;
    if (r <= 0) return Infinity;
    eta = Math.max(eta, Math.ceil(remaining / r));
  }
  return eta;
}

/** Drop works whose host city is gone/changed owner or whose tile left our territory.
 *  Works with no assigned specialists are kept (they sit idle until the player staffs
 *  them) — only the host-city/target/wonder anchors can retire a work. */
function pruneWorks(state: GameState): void {
  state.works = state.works.filter((w) => {
    const host = state.cities.get(w.hostCityId);
    if (!host || host.ownerId !== w.ownerId) return false;
    // Drop assignments whose specialist no longer exists / left the empire.
    w.assignedSpecialistIds = w.assignedSpecialistIds.filter((sid) => !!findSpecialist(state, w.ownerId, sid));
    recomputeCityIds(state, w);
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
 * Apply one turn of specialist labour to a player's works. Labour is entirely
 * assignment-driven: only specialists explicitly assigned to a work contribute,
 * each adding its level-scaled labour to its discipline and earning XP. Completed
 * works apply their effect (and a shared completion XP bonus) and are removed.
 */
export function advanceWorks(state: GameState, playerId: number): void {
  pruneWorks(state);
  const works = state.works.filter((w) => w.ownerId === playerId);
  if (works.length === 0) return;

  for (const w of works) {
    for (const sid of w.assignedSpecialistIds) {
      const found = findSpecialist(state, playerId, sid);
      if (!found) continue;
      const disc = specialistDiscipline(found.specialist);
      if (!disc || !needs(w, disc)) continue; // wrong craft or that discipline is done
      const add = specialistLabour(found.specialist);
      w.progress[disc] = Math.min(w.requirement[disc] ?? 0, (w.progress[disc] ?? 0) + add);
      grantSpecialistXp(found.specialist, 2);
    }
  }

  // Complete and remove finished works; award a completion XP bonus to the crew.
  for (const w of works) {
    if (!isComplete(w)) continue;
    for (const sid of w.assignedSpecialistIds) {
      const found = findSpecialist(state, playerId, sid);
      if (found) grantSpecialistXp(found.specialist, 6);
    }
    completeWork(state, w);
  }
  state.works = state.works.filter((w) => !(w.ownerId === playerId && isComplete(w)));
  pruneWorks(state);
}

export { WONDER_DEFS };
