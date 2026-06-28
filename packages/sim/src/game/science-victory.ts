// Science victory — "The Great Endeavor". Era-appropriate (no spaceship): master
// the entire technology tree AND circumnavigate the globe (a ship must visit every
// longitude sector of the world). See docs/VICTORY-CONDITIONS.md §4.

import { getTile } from "@roc/shared";
import type { GameState, Player } from "./state";
import { unitsOf, log } from "./state";
import { TECH_DEFS, type TechId } from "./content";
import { isWaterTerrain } from "./terrain";

/** Longitude sectors the world is divided into for the circumnavigation capstone. */
export const CIRCUMNAVIGATION_SECTORS = 6;

const ALL_TECH_IDS = Object.keys(TECH_DEFS) as TechId[];

/** Whether a player has researched every technology in the tree. */
export function allTechsResearched(player: Player): boolean {
  return ALL_TECH_IDS.every((t) => player.researched.has(t));
}

/** How many of the whole tree a player has researched (for progress display). */
export function techProgress(player: Player): { have: number; total: number } {
  let have = 0;
  for (const t of ALL_TECH_IDS) if (player.researched.has(t)) have++;
  return { have, total: ALL_TECH_IDS.length };
}

/** The longitude sector (0..SECTORS-1) a map column falls in. */
function sectorOf(col: number, cols: number): number {
  return Math.min(CIRCUMNAVIGATION_SECTORS - 1, Math.floor((col / Math.max(1, cols)) * CIRCUMNAVIGATION_SECTORS));
}

/**
 * Record the longitude sectors a player's ships currently occupy. A unit counts
 * as "at sea" when it stands on a water tile (a naval unit, or a land unit that
 * has embarked). When every sector has been visited the globe is circumnavigated.
 * Called once per turn; ships move several tiles so no sector wider than a ship's
 * movement can be skipped.
 */
export function trackCircumnavigation(state: GameState, playerId: number): void {
  const player = state.players.find((p) => p.id === playerId);
  if (!player || player.isBarbarian) return;
  const cols = state.map.cols;
  let cap = player.circumnavigation;
  for (const unit of unitsOf(state, playerId)) {
    const tile = getTile(state.map, unit.col, unit.row);
    if (!tile || !isWaterTerrain(tile.terrain)) continue;
    if (!cap) cap = player.circumnavigation = { visitedSectors: [], done: false };
    const sector = sectorOf(unit.col, cols);
    if (!cap.visitedSectors.includes(sector)) cap.visitedSectors.push(sector);
  }
  if (cap && !cap.done && cap.visitedSectors.length >= CIRCUMNAVIGATION_SECTORS) {
    cap.done = true;
    log(state, `${player.name}'s fleet has circumnavigated the globe!`, {
      actorId: playerId,
      targetIds: [playerId],
    });
  }
}

/** Whether a player has completed the science capstone: the full tree + a voyage. */
export function scienceVictoryAchieved(state: GameState, player: Player): boolean {
  return allTechsResearched(player) && !!player.circumnavigation?.done;
}
