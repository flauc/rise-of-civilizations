import { describe, it, expect } from "vitest";
import { createGame } from "./setup";
import { beginTurn, applyCommand } from "./commands";
import { applyVictoryCheck, checkVictory, playerScore, scoreBreakdown, SCORE_WEIGHTS } from "./victory";
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
      specialists: [],
      wonders: [],
      workedTiles: [],
      isCapital: false,
      foundedAsCapital: false,
      hp: 0,
      lastAttackedTurn: 0,
      rangedAttackUsed: false, training: {}, trainingQueue: [], modifiers: [],
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

  it("never ends by score when the turn limit is unlimited (0)", () => {
    const state = createGame({ seed: "vic-unlimited", cols: 36, rows: 24, barbarians: false });
    state.turnLimit = 0;
    state.turn = 100000;
    expect(checkVictory(state)).toBeNull();
  });

  it("scores battles won and cities conquered as permanent achievements", () => {
    const state = createGame({ seed: "vic-score", cols: 36, rows: 24, barbarians: false });
    const before = scoreBreakdown(state, 0);
    expect(before.battles).toBe(0);
    expect(before.conquests).toBe(0);

    const player = state.players.find((p) => p.id === 0)!;
    player.battlesWon = 3;
    player.citiesCaptured = 2;
    const after = scoreBreakdown(state, 0);
    expect(after.battles).toBe(3 * SCORE_WEIGHTS.battle);
    expect(after.conquests).toBe(2 * SCORE_WEIGHTS.conquest);
    expect(after.total - before.total).toBe(3 * SCORE_WEIGHTS.battle + 2 * SCORE_WEIGHTS.conquest);

    // These achievements persist even after the units/cities are gone.
    for (const u of unitsOf(state, 0)) state.units.delete(u.id);
    for (const c of citiesOf(state, 0)) state.cities.delete(c.id);
    const stripped = scoreBreakdown(state, 0);
    expect(stripped.battles).toBe(3 * SCORE_WEIGHTS.battle);
    expect(stripped.conquests).toBe(2 * SCORE_WEIGHTS.conquest);
  });

  it("counts civics toward the score", () => {
    const state = createGame({ seed: "vic-civics", cols: 36, rows: 24, barbarians: false });
    const before = scoreBreakdown(state, 0);
    const player = state.players.find((p) => p.id === 0)!;
    player.civicsResearched.add("code_of_laws");
    const after = scoreBreakdown(state, 0);
    expect(after.civics - before.civics).toBe(SCORE_WEIGHTS.civic);
  });

  it("does not declare victory at game start", () => {
    const state = createGame({ seed: "vic3", cols: 36, rows: 24, barbarians: false });
    expect(checkVictory(state)).toBeNull();
  });

  it("declares domination when only one major civ remains (even if no humans)", () => {
    const state = createGame({ seed: "vic-ai", cols: 36, rows: 24, barbarians: false, humanSlots: 0, playerCount: 2 });
    // Wipe out player 1 entirely.
    for (const u of unitsOf(state, 1)) state.units.delete(u.id);
    for (const c of citiesOf(state, 1)) state.cities.delete(c.id);
    const v = checkVictory(state);
    expect(v).toEqual({ winnerId: 0, condition: "domination" });
  });

  it("declares extinction when every major civ is wiped out", () => {
    const state = createGame({ seed: "vic-ext", cols: 36, rows: 24, barbarians: false, humanSlots: 0, playerCount: 2 });
    // Wipe out every major player.
    for (const p of state.players) {
      if (p.isBarbarian) continue;
      for (const u of unitsOf(state, p.id)) state.units.delete(u.id);
      for (const c of citiesOf(state, p.id)) state.cities.delete(c.id);
    }
    const v = checkVictory(state);
    expect(v).toEqual({ condition: "extinction" });
    applyVictoryCheck(state);
    expect(state.gameOver).toEqual({ condition: "extinction" });
    expect(state.log[state.log.length - 1]!.message).toContain("Every civilization has fallen");
  });
});
