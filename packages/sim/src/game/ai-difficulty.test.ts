import { describe, expect, it } from "vitest";
import { createGame } from "./setup";
import {
  aiDifficultyExecutionRate,
  aiExecutes,
  normalizeAiDifficulty,
} from "./ai-difficulty";

describe("AI difficulty", () => {
  it("high always executes optional plays; minimal skips more often", () => {
    const high = createGame({ seed: "ai-exec-high", aiDifficulty: "high", barbarians: false });
    const minimal = createGame({ seed: "ai-exec-min", aiDifficulty: "minimal", barbarians: false });
    expect(aiExecutes(high, 1, "rush")).toBe(true);
    expect(aiExecutes(high, 1, "conquest")).toBe(true);

    let minimalRush = 0;
    let highRush = 0;
    for (let turn = 1; turn <= 40; turn++) {
      high.turn = turn;
      minimal.turn = turn;
      if (aiExecutes(high, 1, "rush")) highRush++;
      if (aiExecutes(minimal, 1, "rush")) minimalRush++;
    }
    expect(highRush).toBe(40);
    expect(minimalRush).toBeLessThan(highRush);
  });

  it("execution rates increase with difficulty", () => {
    expect(aiDifficultyExecutionRate("minimal")).toBeLessThan(aiDifficultyExecutionRate("low"));
    expect(aiDifficultyExecutionRate("low")).toBeLessThan(aiDifficultyExecutionRate("normal"));
    expect(aiDifficultyExecutionRate("normal")).toBeLessThan(aiDifficultyExecutionRate("high"));
    expect(aiDifficultyExecutionRate("high")).toBe(1);
  });

  it("legacy none normalizes to minimal", () => {
    expect(normalizeAiDifficulty("none")).toBe("minimal");
  });

  it("is stored on new games and defaults to normal", () => {
    expect(createGame({ seed: "ai-diff-def", barbarians: false }).aiDifficulty).toBe("normal");
    expect(createGame({ seed: "ai-diff-high", aiDifficulty: "high", barbarians: false }).aiDifficulty).toBe("high");
  });
});
