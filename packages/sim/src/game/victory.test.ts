import { describe, it, expect } from "vitest";
import { createGame } from "./setup";
import { applyVictoryCheck, checkVictory, playerScore } from "./victory";
import { unitsOf } from "./state";

describe("victory", () => {
  it("declares domination when only one human remains", () => {
    const state = createGame({ seed: "vic", cols: 36, rows: 24, barbarians: false });
    // Wipe out player 1 entirely.
    for (const u of unitsOf(state, 1)) state.units.delete(u.id);
    const v = checkVictory(state);
    expect(v).toEqual({ winnerId: 0, condition: "domination" });
    applyVictoryCheck(state);
    expect(state.gameOver?.winnerId).toBe(0);
  });

  it("declares a score victory at the turn limit", () => {
    const state = createGame({ seed: "vic2", cols: 36, rows: 24, barbarians: false });
    state.turnLimit = 1;
    state.turn = 1;
    const v = checkVictory(state);
    expect(v?.condition).toBe("score");
    expect(typeof playerScore(state, 0)).toBe("number");
  });

  it("does not declare victory at game start", () => {
    const state = createGame({ seed: "vic3", cols: 36, rows: 24, barbarians: false });
    expect(checkVictory(state)).toBeNull();
  });
});
