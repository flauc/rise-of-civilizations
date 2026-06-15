import {
  axialNeighbors,
  axialToOffset,
  getTile,
  hexKey,
  offsetToAxial,
  type GameMap,
  type Offset,
} from "@roc/shared";
import { moveCost, isPassableLand, type TerrainType } from "./terrain";
import type { GameState, Unit } from "./state";
import { cityAt } from "./state";
import { UNIT_DEFS } from "./content";
import { foreignTerritoryOwner } from "./diplomacy";

/** Effective movement cost to enter a tile for a specific unit. */
function unitMoveCost(unit: Unit, terrain: TerrainType, road: boolean): number {
  if (road && (unit.promotions.includes("pathfinder") || unit.promotions.includes("commando"))) return 0;
  if (terrain === "hills" && unit.promotions.includes("pathfinder")) return 1;
  if ((terrain === "forest" || terrain === "jungle") &&
    (unit.promotions.includes("woodland_warrior") || unit.promotions.includes("trailblazer") || unit.promotions.includes("guerrilla"))) {
    return 1;
  }
  if (road) return 1;
  return moveCost(terrain);
}

/** In-bounds offset neighbors of a tile (odd-r), routed through shared axial math. */
export function offsetNeighbors(map: GameMap, col: number, row: number): Offset[] {
  const out: Offset[] = [];
  for (const a of axialNeighbors(offsetToAxial({ col, row }))) {
    const o = axialToOffset(a);
    if (o.col >= 0 && o.row >= 0 && o.col < map.cols && o.row < map.rows) {
      out.push(o);
    }
  }
  return out;
}

export interface ReachableEntry {
  cost: number;
}

/** Set of tile keys occupied by units other than `exclude`. */
function occupancy(state: GameState, exclude: Unit): Set<string> {
  const occ = new Set<string>();
  for (const u of state.units.values()) {
    if (u.id !== exclude.id) occ.add(hexKey({ q: u.col, r: u.row }));
  }
  return occ;
}

/** A standing enemy defensive structure blocks entry until it is destroyed. */
export function enemyStructureBlocks(state: GameState, col: number, row: number, playerId: number): boolean {
  const tile = getTile(state.map, col, row);
  if (!tile?.structure || tile.structure.hp <= 0 || tile.ownerCityId === undefined) return false;
  const owner = state.cities.get(tile.ownerCityId);
  return !!owner && owner.ownerId !== playerId;
}

/**
 * Tiles a unit can reach this turn (Dijkstra over land), keyed by "col,row".
 * Honors the "always allowed at least one step" rule into an adjacent passable
 * tile even when its cost exceeds the remaining movement.
 */
export function computeReachable(
  state: GameState,
  unit: Unit,
  opts?: { ignoreBorders?: boolean },
): Map<string, ReachableEntry> {
  const { map } = state;
  const budget = unit.movementLeft;
  const result = new Map<string, ReachableEntry>();
  if (budget <= 0) return result;
  const borderBlocked = (col: number, row: number): boolean =>
    !opts?.ignoreBorders && foreignTerritoryOwner(state, unit.ownerId, col, row) !== null;

  const occ = occupancy(state, unit);
  const key = (o: Offset) => `${o.col},${o.row}`;
  const best = new Map<string, number>();
  best.set(key({ col: unit.col, row: unit.row }), 0);

  // Simple Dijkstra; reachable sets are tiny (movement <= 3).
  const frontier: Offset[] = [{ col: unit.col, row: unit.row }];
  while (frontier.length > 0) {
    // pop the lowest-cost node
    let bi = 0;
    for (let i = 1; i < frontier.length; i++) {
      if (best.get(key(frontier[i]!))! < best.get(key(frontier[bi]!))!) bi = i;
    }
    const cur = frontier.splice(bi, 1)[0]!;
    const curCost = best.get(key(cur))!;

    for (const n of offsetNeighbors(map, cur.col, cur.row)) {
      const tile = getTile(map, n.col, n.row);
      if (!tile || !isPassableLand(tile.terrain)) continue;
      const nk = key(n);
      if (occ.has(`${n.col},${n.row}`)) continue;
      const city = cityAt(state, n.col, n.row);
      if (city && city.ownerId !== unit.ownerId) continue;
      if (enemyStructureBlocks(state, n.col, n.row, unit.ownerId)) continue;
      if (borderBlocked(n.col, n.row)) continue; // foreign territory needs war / open borders
      const enterCost = unitMoveCost(unit, tile.terrain, tile.road ?? false);
      const step = curCost + enterCost;
      if (step <= budget && step < (best.get(nk) ?? Infinity)) {
        best.set(nk, step);
        result.set(nk, { cost: step });
        frontier.push(n);
      }
    }
  }

  // "At least one step": any adjacent passable, unoccupied tile is reachable.
  for (const n of offsetNeighbors(map, unit.col, unit.row)) {
    const tile = getTile(map, n.col, n.row);
    if (!tile || !isPassableLand(tile.terrain)) continue;
    const nk = `${n.col},${n.row}`;
    if (occ.has(nk)) continue;
    const city = cityAt(state, n.col, n.row);
    if (city && city.ownerId !== unit.ownerId) continue;
    if (enemyStructureBlocks(state, n.col, n.row, unit.ownerId)) continue;
    if (borderBlocked(n.col, n.row)) continue;
    if (!result.has(nk)) result.set(nk, { cost: budget });
  }

  return result;
}

/** Foreign at-peace tiles a unit could step into if it declared war, mapped to
 *  the territory owner — drives the "entering this starts a war" warning. */
export function incursionTargets(state: GameState, unit: Unit): Map<string, number> {
  const out = new Map<string, number>();
  if (unit.movementLeft <= 0) return out;
  const open = computeReachable(state, unit, { ignoreBorders: true });
  const closed = computeReachable(state, unit);
  for (const k of open.keys()) {
    if (closed.has(k)) continue;
    const [c, r] = k.split(",").map(Number) as [number, number];
    const owner = foreignTerritoryOwner(state, unit.ownerId, c, r);
    if (owner !== null) out.set(k, owner);
  }
  return out;
}

export function unitSight(unit: Unit): number {
  let sight = UNIT_DEFS[unit.type].sight;
  if (unit.promotions.includes("eagle_eye")) sight += 1;
  if (unit.promotions.includes("outrider")) sight += 1;
  if (unit.promotions.includes("scouting")) sight += 1;
  if (unit.promotions.includes("night_owl")) sight += 1;
  if (unit.promotions.includes("survey")) sight += 1;
  if (unit.promotions.includes("spy")) sight += 1;
  if (unit.promotions.includes("nomad")) sight += 1;
  if (unit.promotions.includes("ranger")) sight += 1;
  if (unit.promotions.includes("eagle_eye_recon")) sight += 2;
  if (unit.promotions.includes("explorer")) sight += 2;
  if (unit.promotions.includes("pioneer")) sight += 1;
  if (unit.promotions.includes("survival_training")) sight += 1;
  return sight;
}
