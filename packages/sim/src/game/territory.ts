// City territory (cultural borders). A city claims a small area when founded and
// expands it outward as its population grows. Worked tiles must lie inside a
// city's territory (see economy.ts), so borders drive the economy too.

import { axialDistance, getTile, offsetToAxial } from "@roc/shared";
import type { GameState, City } from "./state";
import { cityAt } from "./state";

const MAX_RADIUS = 3;

function claim(state: GameState, city: City, col: number, row: number): boolean {
  const tile = getTile(state.map, col, row);
  if (!tile || tile.ownerCityId !== undefined) return false;
  tile.ownerCityId = city.id;
  return true;
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

/** Claim the nearest unowned tile within range — called when the city grows. */
export function expandTerritory(state: GameState, city: City, count = 1): void {
  const center = offsetToAxial({ col: city.col, row: city.row });
  for (let n = 0; n < count; n++) {
    let bestCol = -1;
    let bestRow = -1;
    let bestD = Infinity;
    forEachInRadius(state, city.col, city.row, MAX_RADIUS, (col, row) => {
      const tile = getTile(state.map, col, row);
      if (!tile || tile.ownerCityId !== undefined) return;
      if (cityAt(state, col, row)) return; // don't swallow another city's tile
      const d = axialDistance(center, offsetToAxial({ col, row }));
      if (d <= MAX_RADIUS && d < bestD) {
        bestD = d;
        bestCol = col;
        bestRow = row;
      }
    });
    if (bestCol < 0) return; // nothing left to claim
    claim(state, city, bestCol, bestRow);
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
