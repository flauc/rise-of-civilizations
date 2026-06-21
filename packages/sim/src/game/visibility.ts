import { axialDistance, offsetToAxial } from "@roc/shared";
import type { GameState } from "./state";
import { citiesOf, unitsOf } from "./state";
import { unitSight } from "./movement";
import { detectContacts } from "./diplomacy";
import { checkNaturalWonderDiscovery } from "./natural-wonders";
import { detectHiddenUnits } from "./stealth";

const CITY_SIGHT = 3;

/** Tiles currently visible to a player (within sight of any unit or city). */
export function computeVisible(state: GameState, playerId: number): Set<string> {
  const visible = new Set<string>();
  const { map } = state;

  const reveal = (col: number, row: number, sight: number): void => {
    const center = offsetToAxial({ col, row });
    const minCol = Math.max(0, col - sight - 1);
    const maxCol = Math.min(map.cols - 1, col + sight + 1);
    const minRow = Math.max(0, row - sight);
    const maxRow = Math.min(map.rows - 1, row + sight);
    for (let r = minRow; r <= maxRow; r++) {
      for (let c = minCol; c <= maxCol; c++) {
        if (axialDistance(center, offsetToAxial({ col: c, row: r })) <= sight) {
          visible.add(`${c},${r}`);
        }
      }
    }
  };

  for (const u of unitsOf(state, playerId)) reveal(u.col, u.row, unitSight(u));
  for (const c of citiesOf(state, playerId)) reveal(c.col, c.row, CITY_SIGHT);
  return visible;
}

/** Recompute visibility for a player and fold it into their explored set. */
export function updateExplored(state: GameState, playerId: number): Set<string> {
  const visible = computeVisible(state, playerId);
  const player = state.players.find((p) => p.id === playerId);
  if (player) for (const k of visible) player.explored.add(k);
  detectHiddenUnits(state, playerId); // war dogs etc. sniff out concealed ambushers
  detectContacts(state, playerId, visible); // first contact with newly-sighted civs
  checkNaturalWonderDiscovery(state, playerId); // award newly-sighted natural wonders
  return visible;
}
