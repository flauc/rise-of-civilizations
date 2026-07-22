import type { AiDifficulty, GameState } from "./state";

export const AI_DIFFICULTY_LEVELS: readonly AiDifficulty[] = ["minimal", "low", "normal", "high"];

/**
 * How often optional AI optimizations run. Core play (research, training, movement,
 * construction) always executes under the same rules as humans. Difficulty only gates
 * skilled extras: rushing, wonder races, conquest timing, aggressive diplomacy, etc.
 */
const EXECUTION_RATE: Record<AiDifficulty, number> = {
  minimal: 0.45,
  low: 0.65,
  normal: 0.85,
  high: 1,
};

export type AiExecutionBucket =
  | "rush"
  | "conquest"
  | "diplomacyAggro"
  | "wonders"
  | "legends"
  | "openBorders";

/** Legacy saves/lobby values may still carry "none"; treat as minimal. */
export function normalizeAiDifficulty(v: AiDifficulty | "none" | undefined): AiDifficulty {
  if (v === "none") return "minimal";
  return v ?? "normal";
}

export function aiDifficultyExecutionRate(level: AiDifficulty): number {
  return EXECUTION_RATE[level];
}

/** Deterministic per-turn gate: lower difficulties skip some skilled plays, never cheat. */
export function aiExecutes(state: GameState, playerId: number, bucket: AiExecutionBucket): boolean {
  const rate = aiDifficultyExecutionRate(normalizeAiDifficulty(state.aiDifficulty));
  if (rate >= 1) return true;
  const bucketSalt = bucket.split("").reduce((n, c) => n + c.charCodeAt(0), 0);
  const roll = ((state.turn * 31 + playerId * 17 + bucketSalt * 13) % 100) / 100;
  return roll < rate;
}
