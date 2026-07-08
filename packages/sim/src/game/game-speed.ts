// Game speed scales how much science and culture a tech, government, or civic
// costs. Faster speeds mean cheaper research (shorter ages); slower speeds stretch
// each era without touching combat, movement, or yields.

import { civicCost, type CivicDef } from "@roc/data";
import { TECH_DEFS, type TechId } from "./content";
import { getGovernment } from "./civs";

export type GameSpeed = "fast" | "normal" | "slow" | "epic";

export const GAME_SPEEDS: readonly GameSpeed[] = ["fast", "normal", "slow", "epic"];

/** Multiplier applied to tech, government-research, and civic costs. */
export const GAME_SPEED_COST_MULTIPLIER: Record<GameSpeed, number> = {
  fast: 0.67,
  normal: 1,
  slow: 1.5,
  epic: 2.5,
};

export const GAME_SPEED_LABELS: Record<GameSpeed, string> = {
  fast: "Fast",
  normal: "Normal",
  slow: "Slow",
  epic: "Epic",
};

export function normalizeGameSpeed(speed: GameSpeed | undefined): GameSpeed {
  return speed && GAME_SPEED_COST_MULTIPLIER[speed] !== undefined ? speed : "normal";
}

export function gameSpeedMultiplier(state: { gameSpeed?: GameSpeed }): number {
  return GAME_SPEED_COST_MULTIPLIER[normalizeGameSpeed(state.gameSpeed)];
}

function scaleCost(state: { gameSpeed?: GameSpeed }, base: number): number {
  if (base <= 0) return 0;
  return Math.max(1, Math.round(base * gameSpeedMultiplier(state)));
}

export function scaledTechCost(state: { gameSpeed?: GameSpeed }, techId: TechId): number {
  return scaleCost(state, TECH_DEFS[techId].cost);
}

export function scaledGovernmentCost(state: { gameSpeed?: GameSpeed }, governmentId: string): number {
  return scaleCost(state, getGovernment(governmentId)?.cost ?? 0);
}

export function scaledCivicCost(
  state: { gameSpeed?: GameSpeed },
  def: CivicDef,
  adoptedCount: number,
): number {
  return scaleCost(state, civicCost(def, adoptedCount));
}

/** Fee to unslot a civic outside the free re-slot window (10% of base tier cost). */
export function scaledCivicSwapFee(state: { gameSpeed?: GameSpeed }, baseTierCost: number): number {
  return scaleCost(state, Math.round(baseTierCost * 0.1));
}
