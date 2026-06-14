import { describe, it, expect } from "vitest";
import { createGame } from "./setup";
import { beginTurn, applyCommand } from "./commands";
import { applyVictoryCheck, checkVictory, playerScore } from "./victory";
import { citiesOf, unitsOf } from "./state";

describe("victory", () => {
  it("declares domination when only one human remains", () => {
    const state = createGame({ seed: "vic", cols: 36, rows: 24, barbarians: false });
    // Wipe out player 1 entirely.
    for (const u of unitsOf(state, 1)) state.units.delete(u.id);
    for (const c of citiesOf(state, 1)) state.cities.delete(c.id);
    const v = checkVictory(state);
    expect(v).toEqual({ winnerId: 0, condition: "domination" });
    applyVictoryCheck(state);
    expect(state.gameOver?.winnerId).toBe(0);
  });

  it("declares conquest domination when one player controls every city", () => {
    const state = createGame({
      seed: "vic-conquest",
      cols: 36,
      rows: 24,
      barbarians: false,
      humanSlots: 1,
      playerCount: 2,
    });
    // Found player 0's capital (createGame only spawns settlers).
    beginTurn(state);
    const settler = unitsOf(state, 0).find((u) => u.type === "settler")!;
    applyCommand(state, { type: "foundCity", unitId: settler.id });
    // Clear player 1's cities so player 0 controls every city.
    for (const c of citiesOf(state, 1)) state.cities.delete(c.id);
    // Give player 0 a second city so conquest can fire.
    const secondCity = citiesOf(state, 0)[0]!;
    const id = state.nextEntityId++;
    state.cities.set(id, {
      id,
      ownerId: 0,
      name: "Second",
      col: secondCity.col + 2,
      row: secondCity.row,
      population: 1,
      foodStored: 0,
      productionStored: 0,
      production: null,
      buildings: [],
      workedTiles: [],
      isCapital: false,
      foundedAsCapital: false,
      hp: 0,
      lastAttackedTurn: 0,
      rangedAttackUsed: false,
    });
    const v = checkVictory(state);
    expect(v?.condition).toBe("domination");
    expect(v?.winnerId).toBe(0);
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
