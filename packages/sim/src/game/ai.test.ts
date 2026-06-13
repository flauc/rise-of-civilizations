import { describe, it, expect } from "vitest";
import { createGame } from "./setup";
import { applyCommand, beginTurn } from "./commands";
import { aiTakeTurn } from "./ai";
import { citiesOf, unitsOf } from "./state";

describe("AI opponent", () => {
  it("founds a city, researches, and grows when run", () => {
    const state = createGame({ seed: "ai-test", cols: 40, rows: 28, barbarians: false, humanSlots: 1 });
    beginTurn(state);
    expect(state.players[1]!.isHuman).toBe(false);
    expect(state.players[1]!.isBarbarian).toBe(false);

    // Human (player 0) just ends turns; the AI (player 1) auto-plays each time.
    for (let i = 0; i < 12; i++) applyCommand(state, { type: "endTurn" });

    expect(citiesOf(state, 1).length).toBeGreaterThanOrEqual(1); // AI settled
    const ai = state.players[1]!;
    expect(ai.researching !== null || ai.researched.size > 1).toBe(true); // AI researches
    expect(unitsOf(state, 1).length).toBeGreaterThanOrEqual(1); // AI has a force
  });

  it("can be invoked directly without throwing", () => {
    const state = createGame({ seed: "ai-test2", cols: 36, rows: 24, barbarians: true, humanSlots: 1 });
    beginTurn(state);
    expect(() => aiTakeTurn(state, 1)).not.toThrow();
  });
});
