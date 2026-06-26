import { axialDistance, getTile, offsetToAxial } from "@roc/shared";
import type { GameState, Player, Unit } from "./state";
import { citiesOf, unitsOf } from "./state";
import { unitSight } from "./movement";
import { detectContacts } from "./diplomacy";
import { checkNaturalWonderDiscovery } from "./natural-wonders";
import { detectHiddenUnits } from "./stealth";
import { UNIT_DEFS } from "./content";
import { awardUnitXp, SCOUT_DISCOVERY_XP } from "./combat";

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

/** The recon unit of `playerId` nearest to (col,row) that has it within sight, or
 *  undefined if no scout revealed it. Used to credit a discovery to the scout. */
export function nearestReconInSight(
  state: GameState,
  playerId: number,
  col: number,
  row: number,
): Unit | undefined {
  const target = offsetToAxial({ col, row });
  let best: Unit | undefined;
  let bestDist = Infinity;
  for (const u of unitsOf(state, playerId)) {
    if (UNIT_DEFS[u.type].cls !== "recon") continue;
    const d = axialDistance(offsetToAxial(u), target);
    if (d <= unitSight(u) && d < bestDist) {
      bestDist = d;
      best = u;
    }
  }
  return best;
}

/** Reward scouts for reconnaissance: any village, barbarian camp, or natural
 *  wonder revealed for the FIRST time this pass grants XP to the nearest scout
 *  whose sight covers it. `visible` is the player's current sight; `player.explored`
 *  still holds only what was known before this pass, so the difference is "new". */
function awardScoutDiscoveries(state: GameState, player: Player, visible: Set<string>): void {
  if (player.isBarbarian) return;
  for (const key of visible) {
    if (player.explored.has(key)) continue; // already discovered earlier
    const comma = key.indexOf(",");
    const c = Number(key.slice(0, comma));
    const r = Number(key.slice(comma + 1));
    const tile = getTile(state.map, c, r);
    if (!tile) continue;
    if (tile.feature !== "village" && tile.feature !== "barb_camp" && !tile.naturalWonder) continue;
    const scout = nearestReconInSight(state, player.id, c, r);
    if (scout) awardUnitXp(scout, SCOUT_DISCOVERY_XP);
  }
}

/** A currently-visible tile occupied by `ownerId`'s unit or city, if any — used to
 *  credit the scout that first laid eyes on a newly-met civilization. */
function visibleTileOf(
  state: GameState,
  ownerId: number,
  visible: Set<string>,
): { col: number; row: number } | undefined {
  for (const u of unitsOf(state, ownerId)) if (visible.has(`${u.col},${u.row}`)) return { col: u.col, row: u.row };
  for (const c of citiesOf(state, ownerId)) if (visible.has(`${c.col},${c.row}`)) return { col: c.col, row: c.row };
  return undefined;
}

/** Recompute visibility for a player and fold it into their explored set. */
export function updateExplored(state: GameState, playerId: number): Set<string> {
  const visible = computeVisible(state, playerId);
  const player = state.players.find((p) => p.id === playerId);
  if (player) {
    awardScoutDiscoveries(state, player, visible); // credit scouts before folding in the new tiles
    for (const k of visible) player.explored.add(k);
  }
  detectHiddenUnits(state, playerId); // war dogs etc. sniff out concealed ambushers

  // First contact with newly-sighted civs — credit the discovering scout, if any.
  const metBefore = player ? new Set(player.met) : new Set<number>();
  detectContacts(state, playerId, visible);
  if (player && !player.isBarbarian) {
    for (const otherId of player.met) {
      if (metBefore.has(otherId)) continue; // met before this pass — not a new discovery
      const tile = visibleTileOf(state, otherId, visible);
      const scout = tile && nearestReconInSight(state, playerId, tile.col, tile.row);
      if (scout) awardUnitXp(scout, SCOUT_DISCOVERY_XP);
    }
  }

  checkNaturalWonderDiscovery(state, playerId); // award newly-sighted natural wonders
  return visible;
}
