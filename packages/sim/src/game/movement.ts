import {
  axialNeighbors,
  axialToOffset,
  getTile,
  hexKey,
  offsetToAxial,
  type GameMap,
  type Offset,
} from "@roc/shared";
import { moveCost, isPassableLand } from "./terrain";
import type { GameState, Unit } from "./state";
import { cityAt } from "./state";
import { UNIT_DEFS } from "./content";

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

/**
 * Tiles a unit can reach this turn (Dijkstra over land), keyed by "col,row".
 * Honors the "always allowed at least one step" rule into an adjacent passable
 * tile even when its cost exceeds the remaining movement.
 */
export function computeReachable(
  state: GameState,
  unit: Unit,
): Map<string, ReachableEntry> {
  const { map } = state;
  const budget = unit.movementLeft;
  const result = new Map<string, ReachableEntry>();
  if (budget <= 0) return result;

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
      const enterCost = tile.road ? 1 : moveCost(tile.terrain);
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
    if (!result.has(nk)) result.set(nk, { cost: budget });
  }

  return result;
}

export function unitSight(unit: Unit): number {
  return UNIT_DEFS[unit.type].sight;
}
