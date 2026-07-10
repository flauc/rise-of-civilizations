// Multi-tile road routes: pick a start and end, assign surveyors, and they pave the
// path one tile at a time (several in parallel when multiple agrimensores are free).

import { getTile } from "@roc/shared";
import type { GameState, RoadRoute, Work } from "./state";
import { citiesOf, playerById, log, cityAt } from "./state";
import { isPassableLand, isWaterTerrain } from "./terrain";
import { offsetNeighbors } from "./movement";
import {
  assignSpecialist,
  assignedSpecialistIds,
  canStartWork,
  findSpecialist,
  nextTierAt,
  startWork,
  tileBuildableFor,
} from "./works";
import { SPECIALIST_DEFS, type SpecialistId } from "./specialists";

export interface RoadRouteResult {
  ok: boolean;
  error?: string;
  routeId?: number;
}

/** Tiles still needing a road along an ordered path (skips already-paved sites). */
export function tilesNeedingRoad(
  state: GameState,
  playerId: number,
  path: { col: number; row: number }[],
): { col: number; row: number }[] {
  const out: { col: number; row: number }[] = [];
  for (const { col, row } of path) {
    const tile = getTile(state.map, col, row);
    if (!tile) continue;
    if (!tileBuildableFor(state, tile, playerId, "road")) continue;
    if (nextTierAt(tile, "road") === null) continue;
    if (!canStartWork(state, playerId, "road", col, row, { skipStaffCheck: true }).ok) continue;
    out.push({ col, row });
  }
  return out;
}

/** Cost for routing a road path — hug existing roads, avoid rough terrain. */
function roadPathTileCost(
  tile: { terrain: string; road?: boolean; roadLevel?: number },
  col: number,
  row: number,
  state: GameState,
): number {
  if (cityAt(state, col, row)) return 0.1;
  if (tile.road) {
    const tier = tile.roadLevel ?? 1;
    return tier >= 3 ? 0.1 : tier === 2 ? 0.12 : 0.15;
  }
  if (isWaterTerrain(tile.terrain as never)) return Infinity;
  if (!isPassableLand(tile.terrain as never)) return Infinity;
  if (tile.terrain === "grassland" || tile.terrain === "plains" || tile.terrain === "desert") return 1;
  return 2;
}

/** Cheapest passable land path between two tiles (no water). Empty when unreachable. */
export function computeRoadPath(
  state: GameState,
  playerId: number,
  fromCol: number,
  fromRow: number,
  toCol: number,
  toRow: number,
): { col: number; row: number }[] {
  const start = `${fromCol},${fromRow}`;
  const goal = `${toCol},${toRow}`;
  if (start === goal) return [{ col: fromCol, row: fromRow }];

  const dist = new Map<string, number>();
  const cameFrom = new Map<string, string>();
  dist.set(start, 0);
  cameFrom.set(start, "");

  const frontier: string[] = [start];
  while (frontier.length > 0) {
    let bi = 0;
    for (let i = 1; i < frontier.length; i++) {
      if (dist.get(frontier[i]!)! < dist.get(frontier[bi]!)!) bi = i;
    }
    const key = frontier.splice(bi, 1)[0]!;
    if (key === goal) break;
    const curCost = dist.get(key)!;
    const [col, row] = key.split(",").map(Number) as [number, number];
    for (const n of offsetNeighbors(state.map, col, row)) {
      const tile = getTile(state.map, n.col, n.row);
      if (!tile) continue;
      if (isWaterTerrain(tile.terrain)) continue;
      if (!isPassableLand(tile.terrain)) continue;
      if (!tileBuildableFor(state, tile, playerId, "road") && !cityAt(state, n.col, n.row)) continue;
      const nk = `${n.col},${n.row}`;
      const step = roadPathTileCost(tile, n.col, n.row, state);
      if (!Number.isFinite(step)) continue;
      const next = curCost + step;
      if (next < (dist.get(nk) ?? Infinity)) {
        dist.set(nk, next);
        cameFrom.set(nk, key);
        frontier.push(nk);
      }
    }
  }

  if (!cameFrom.has(goal)) return [];
  const path: { col: number; row: number }[] = [];
  let cur = goal;
  while (cur !== "") {
    const [col, row] = cur.split(",").map(Number) as [number, number];
    path.unshift({ col, row });
    cur = cameFrom.get(cur)!;
  }
  return path;
}

function surveyDisciplineOf(specialistId: number, state: GameState, playerId: number): boolean {
  const found = findSpecialist(state, playerId, specialistId);
  if (!found) return false;
  return SPECIALIST_DEFS[found.specialist.type as SpecialistId]?.discipline === "survey";
}

/** Idle agrimensores the player can commit to a route. */
export function freeSurveySpecialistIds(
  state: GameState,
  playerId: number,
  only?: number[],
): number[] {
  const assigned = assignedSpecialistIds(state, playerId);
  const allow = only ? new Set(only) : null;
  const ids: number[] = [];
  for (const c of citiesOf(state, playerId)) {
    for (const s of c.specialists) {
      if (allow && !allow.has(s.id)) continue;
      if (assigned.has(s.id)) continue;
      if (SPECIALIST_DEFS[s.type as SpecialistId]?.discipline !== "survey") continue;
      ids.push(s.id);
    }
  }
  return ids;
}

function activeTargetsOnRoute(state: GameState, routeId: number): Set<string> {
  const keys = new Set<string>();
  for (const w of state.works) {
    if (w.routeId !== routeId || !w.target) continue;
    keys.add(`${w.target.col},${w.target.row}`);
  }
  return keys;
}

function routeById(state: GameState, routeId: number): RoadRoute | undefined {
  return state.roadRoutes.find((r) => r.id === routeId);
}

function nextTileForRoute(state: GameState, route: RoadRoute): { col: number; row: number } | null {
  const busy = activeTargetsOnRoute(state, route.id);
  for (const t of route.queue) {
    const key = `${t.col},${t.row}`;
    if (busy.has(key)) continue;
    const tile = getTile(state.map, t.col, t.row);
    if (!tile) continue;
    if (nextTierAt(tile, "road") === null) continue;
    if (!canStartWork(state, route.ownerId, "road", t.col, t.row, { skipStaffCheck: true }).ok) continue;
    return t;
  }
  return null;
}

function specialistBusy(state: GameState, playerId: number, specialistId: number): boolean {
  return assignedSpecialistIds(state, playerId).has(specialistId);
}

/** Start works on the next unclaimed queue tiles for every idle route surveyor. */
export function dispatchRoadRoute(state: GameState, route: RoadRoute): void {
  for (const sid of route.specialistIds) {
    if (specialistBusy(state, route.ownerId, sid)) continue;
    const tile = nextTileForRoute(state, route);
    if (!tile) break;
    const res = startWork(state, route.ownerId, "road", tile.col, tile.row, {
      routeId: route.id,
      skipStaffCheck: true,
    });
    if (!res.ok || res.workId === undefined) continue;
    assignSpecialist(state, route.ownerId, res.workId, sid, true);
  }
  pruneFinishedRoutes(state, route.ownerId);
}

function pruneFinishedRoutes(state: GameState, playerId: number): void {
  state.roadRoutes = state.roadRoutes.filter((r) => {
    if (r.ownerId !== playerId) return true;
    if (r.queue.length === 0) return false;
    const busy = activeTargetsOnRoute(state, r.id);
    const remaining = r.queue.filter((t) => {
      const tile = getTile(state.map, t.col, t.row);
      return tile && nextTierAt(tile, "road") !== null;
    });
    return remaining.length > 0 || busy.size > 0;
  });
}

/** After a route segment completes, drop that tile from the queue and dispatch more. */
export function advanceRoadRoute(
  state: GameState,
  playerId: number,
  routeId: number,
  completedWork: Work,
): void {
  const route = routeById(state, routeId);
  if (!route || route.ownerId !== playerId) return;
  const target = completedWork.target;
  if (target) {
    route.queue = route.queue.filter((t) => t.col !== target.col || t.row !== target.row);
  }
  dispatchRoadRoute(state, route);
}

export function canStartRoadRoute(
  state: GameState,
  playerId: number,
  fromCol: number,
  fromRow: number,
  toCol: number,
  toRow: number,
  specialistIds?: number[],
): RoadRouteResult {
  const path = computeRoadPath(state, playerId, fromCol, fromRow, toCol, toRow);
  if (path.length === 0) return { ok: false, error: "no passable path between those tiles" };
  const queue = tilesNeedingRoad(state, playerId, path);
  if (queue.length === 0) return { ok: false, error: "route is already fully paved" };
  const free = freeSurveySpecialistIds(state, playerId, specialistIds);
  if (free.length === 0) {
    return { ok: false, error: specialistIds?.length ? "chosen surveyors are not available" : "No Agrimensor available" };
  }
  if (specialistIds?.length) {
    for (const id of specialistIds) {
      if (!surveyDisciplineOf(id, state, playerId)) return { ok: false, error: "not a surveyor" };
    }
  }
  return { ok: true };
}

export function startRoadRoute(
  state: GameState,
  playerId: number,
  fromCol: number,
  fromRow: number,
  toCol: number,
  toRow: number,
  specialistIds?: number[],
): RoadRouteResult {
  const can = canStartRoadRoute(state, playerId, fromCol, fromRow, toCol, toRow, specialistIds);
  if (!can.ok) return can;

  const path = computeRoadPath(state, playerId, fromCol, fromRow, toCol, toRow);
  const queue = tilesNeedingRoad(state, playerId, path);
  const specialists = freeSurveySpecialistIds(state, playerId, specialistIds);
  const id = state.nextEntityId++;
  const route: RoadRoute = { id, ownerId: playerId, queue, specialistIds: specialists };
  state.roadRoutes.push(route);

  const owner = playerById(state, playerId);
  log(state, `${owner?.name ?? "Someone"} began paving a road route (${queue.length} tile${queue.length === 1 ? "" : "s"}).`, {
    actorId: owner?.id,
    targetIds: owner ? [owner.id] : undefined,
    tile: { col: fromCol, row: fromRow },
  });

  dispatchRoadRoute(state, route);
  return { ok: true, routeId: id };
}

export function cancelRoadRoute(state: GameState, routeId: number, playerId: number): RoadRouteResult {
  const route = routeById(state, routeId);
  if (!route || route.ownerId !== playerId) return { ok: false, error: "no such route" };
  state.works = state.works.filter((w) => !(w.routeId === routeId && w.ownerId === playerId));
  state.roadRoutes = state.roadRoutes.filter((r) => r.id !== routeId);
  return { ok: true };
}

/** Drop route segments when a work is cancelled manually. */
export function onRouteWorkCancelled(state: GameState, work: Work): void {
  if (work.routeId === undefined) return;
  const route = routeById(state, work.routeId);
  if (!route) return;
  dispatchRoadRoute(state, route);
}
