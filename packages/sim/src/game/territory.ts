// City territory (cultural borders). A city claims a small area when founded and
// expands it outward as its population grows. Worked tiles must lie inside a
// city's territory (see economy.ts), so borders drive the economy too.

import { axialDistance, axialNeighbors, axialToOffset, getTile, offsetToAxial } from "@roc/shared";
import type { GameState, City } from "./state";
import { cityAt } from "./state";

const MAX_RADIUS = 3;

function claim(state: GameState, city: City, col: number, row: number): boolean {
  const tile = getTile(state.map, col, row);
  if (!tile || tile.ownerCityId !== undefined) return false;
  tile.ownerCityId = city.id;
  return true;
}

/** The player id that owns the tile at (col,row) via its controlling city, or
 *  undefined for unclaimed wilderness. "Home territory" for a unit means this
 *  equals the unit's owner id (docs/CIVICS-AND-GOVERNMENTS.md §4). */
export function tileOwnerId(state: GameState, col: number, row: number): number | undefined {
  const cityId = getTile(state.map, col, row)?.ownerCityId;
  if (cityId === undefined) return undefined;
  return state.cities.get(cityId)?.ownerId;
}

/** All tiles currently in a city's territory. */
export function cityTerritory(state: GameState, city: City): { col: number; row: number }[] {
  const out: { col: number; row: number }[] = [];
  for (const t of state.map.tiles) if (t.ownerCityId === city.id) out.push({ col: t.col, row: t.row });
  return out;
}

export function territorySize(state: GameState, city: City): number {
  let n = 0;
  for (const t of state.map.tiles) if (t.ownerCityId === city.id) n++;
  return n;
}

/** Initial borders on founding: the city tile plus its immediate ring. */
export function foundTerritory(state: GameState, city: City): void {
  claim(state, city, city.col, city.row);
  const center = offsetToAxial({ col: city.col, row: city.row });
  forEachInRadius(state, city.col, city.row, 1, (col, row) => {
    if (axialDistance(center, offsetToAxial({ col, row })) === 1) claim(state, city, col, row);
  });
}

/** Can this city claim (col,row) next? It must be unowned, not another city, within
 *  the max radius, AND immediately adjacent to a tile the city already owns — borders
 *  only ever grow outward from their own edge, never jumping across a gap. */
export function canExpandTo(state: GameState, city: City, col: number, row: number): boolean {
  const tile = getTile(state.map, col, row);
  if (!tile || tile.ownerCityId !== undefined) return false;
  if (cityAt(state, col, row)) return false; // don't swallow another city's tile
  const axial = offsetToAxial({ col, row });
  const center = offsetToAxial({ col: city.col, row: city.row });
  if (axialDistance(center, axial) > MAX_RADIUS) return false;
  // Must touch an already-owned tile of this city (contiguous growth only).
  for (const n of axialNeighbors(axial)) {
    const o = axialToOffset(n);
    if (getTile(state.map, o.col, o.row)?.ownerCityId === city.id) return true;
  }
  return false;
}

/** Every tile the city could claim next (unowned, in range) — for the picker UI. */
export function expansionCandidates(state: GameState, city: City): { col: number; row: number }[] {
  const out: { col: number; row: number }[] = [];
  forEachInRadius(state, city.col, city.row, MAX_RADIUS, (col, row) => {
    if (canExpandTo(state, city, col, row)) out.push({ col, row });
  });
  return out;
}

/** The tile the city would claim next by default: the nearest unowned tile in range. */
export function nextExpansionTile(state: GameState, city: City): { col: number; row: number } | null {
  const center = offsetToAxial({ col: city.col, row: city.row });
  let best: { col: number; row: number } | null = null;
  let bestD = Infinity;
  forEachInRadius(state, city.col, city.row, MAX_RADIUS, (col, row) => {
    if (!canExpandTo(state, city, col, row)) return;
    const d = axialDistance(center, offsetToAxial({ col, row }));
    if (d < bestD) {
      bestD = d;
      best = { col, row };
    }
  });
  return best;
}

/** Claim a tile within range when the city grows. Honours the player's chosen
 *  `expandTarget` when it's still claimable, otherwise takes the nearest tile. */
export function expandTerritory(state: GameState, city: City, count = 1): void {
  for (let n = 0; n < count; n++) {
    const pick = city.expandTarget;
    if (pick && canExpandTo(state, city, pick.col, pick.row)) {
      claim(state, city, pick.col, pick.row);
      city.expandTarget = undefined; // consumed — fall back to auto for the next grow
      continue;
    }
    if (pick) city.expandTarget = undefined; // stale pick (now owned/out of range) — drop it
    const next = nextExpansionTile(state, city);
    if (!next) return; // nothing left to claim
    claim(state, city, next.col, next.row);
  }
}

function forEachInRadius(
  state: GameState,
  col: number,
  row: number,
  radius: number,
  fn: (col: number, row: number) => void,
): void {
  const { map } = state;
  for (let r = row - radius; r <= row + radius; r++) {
    for (let c = col - radius - 1; c <= col + radius + 1; c++) {
      if (c < 0 || r < 0 || c >= map.cols || r >= map.rows) continue;
      fn(c, r);
    }
  }
}
