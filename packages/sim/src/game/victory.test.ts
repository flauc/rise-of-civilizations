import { describe, it, expect } from "vitest";
import { createGame } from "./setup";
import { beginTurn, applyCommand } from "./commands";
import { getTile } from "@roc/shared";
import { applyVictoryCheck, checkVictory, playerScore, scoreBreakdown, SCORE_WEIGHTS, victoryProgress, economicPower } from "./victory";
import { trackCircumnavigation, CIRCUMNAVIGATION_SECTORS } from "./science-victory";
import { accrueInfluence, influentialOver } from "./culture-victory";
import { TECH_DEFS } from "./content";
import { citiesOf, makeUnit, unitsOf } from "./state";

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

  it("does not declare domination when that victory is disabled", () => {
    const state = createGame({ seed: "vic-toggle", cols: 36, rows: 24, barbarians: false });
    state.enabledVictories = new Set(["religious", "science", "culture", "economic"]); // no domination
    // Wipe out player 1 entirely — would normally be a domination win.
    for (const u of unitsOf(state, 1)) state.units.delete(u.id);
    for (const c of citiesOf(state, 1)) state.cities.delete(c.id);
    expect(checkVictory(state)).toBeNull();
    // Re-enabling it makes the same board a win.
    state.enabledVictories.add("domination");
    expect(checkVictory(state)?.condition).toBe("domination");
  });

  it("still ends by extinction even with every decisive victory disabled", () => {
    const state = createGame({ seed: "vic-toggle-ext", cols: 36, rows: 24, barbarians: false, humanSlots: 0, playerCount: 2 });
    state.enabledVictories = new Set(); // nothing enabled
    for (const p of state.players) {
      if (p.isBarbarian) continue;
      for (const u of unitsOf(state, p.id)) state.units.delete(u.id);
      for (const c of citiesOf(state, p.id)) state.cities.delete(c.id);
    }
    expect(checkVictory(state)).toEqual({ condition: "extinction" });
  });

  it("reports per-condition progress for the enabled victories", () => {
    const state = createGame({ seed: "vic-progress", cols: 36, rows: 24, barbarians: false });
    const entries = victoryProgress(state, 0);
    const dom = entries.find((e) => e.kind === "domination")!;
    expect(dom.enabled).toBe(true);
    expect(dom.progress).toBeGreaterThanOrEqual(0);
    expect(entries.find((e) => e.kind === "score")!.enabled).toBe(true); // always on
    // Disabling a condition is reflected in its entry.
    state.enabledVictories = new Set(["domination"]);
    const rel = victoryProgress(state, 0).find((e) => e.kind === "religious")!;
    expect(rel.enabled).toBe(false);
  });

  it("declares an economic victory for a clear mercantile hegemony", () => {
    const state = createGame({ seed: "vic-econ", cols: 36, rows: 24, barbarians: false, humanSlots: 1, playerCount: 2 });
    beginTurn(state);
    // Give both majors a city so the field has >= 2 contenders.
    for (const owner of [0, 1]) {
      const settler = unitsOf(state, owner).find((u) => u.type === "settler")!;
      applyCommand(state, { type: "foundCity", unitId: settler.id }, owner);
    }
    state.enabledVictories = new Set(["economic"]);
    expect(checkVictory(state)).toBeNull(); // nobody dominant yet
    // Player 0 amasses an overwhelming treasury → runaway economic power.
    state.players[0]!.gold = 20000;
    expect(economicPower(state, 0)).toBeGreaterThan(economicPower(state, 1) * 2);
    const v = checkVictory(state);
    expect(v?.condition).toBe("economic");
    expect(v?.winnerId).toBe(0);
  });

  it("tracks circumnavigation as ships visit every longitude sector", () => {
    const state = createGame({ seed: "vic-sci-nav", cols: 60, rows: 24, barbarians: false, humanSlots: 1, playerCount: 1 });
    beginTurn(state);
    const uid = state.nextEntityId++;
    state.units.set(uid, makeUnit(uid, 0, "galley", 5, 5));
    const u = state.units.get(uid)!;
    for (let sec = 0; sec < CIRCUMNAVIGATION_SECTORS; sec++) {
      const col = Math.floor(((sec + 0.5) / CIRCUMNAVIGATION_SECTORS) * 60);
      u.col = col;
      u.row = 5;
      getTile(state.map, col, 5)!.terrain = "ocean"; // sail it onto open water
      trackCircumnavigation(state, 0);
    }
    expect(state.players[0]!.circumnavigation?.done).toBe(true);
  });

  it("declares a science victory for the full tech tree plus a circumnavigation", () => {
    const state = createGame({ seed: "vic-sci", cols: 36, rows: 24, barbarians: false, humanSlots: 1, playerCount: 2 });
    beginTurn(state);
    const settler = unitsOf(state, 0).find((u) => u.type === "settler")!;
    applyCommand(state, { type: "foundCity", unitId: settler.id }, 0);
    state.enabledVictories = new Set(["science"]);
    for (const t of Object.keys(TECH_DEFS)) state.players[0]!.researched.add(t as keyof typeof TECH_DEFS);
    expect(checkVictory(state)).toBeNull(); // tree done, but no voyage yet
    state.players[0]!.circumnavigation = { visitedSectors: [0, 1, 2, 3, 4, 5], done: true };
    expect(checkVictory(state)).toEqual({ winnerId: 0, condition: "science" });
  });

  it("declares a culture victory once influential over every rival", () => {
    const state = createGame({ seed: "vic-cul", cols: 36, rows: 24, barbarians: false, humanSlots: 1, playerCount: 2 });
    beginTurn(state);
    for (const owner of [0, 1]) {
      const settler = unitsOf(state, owner).find((u) => u.type === "settler")!;
      applyCommand(state, { type: "foundCity", unitId: settler.id }, owner);
    }
    state.enabledVictories = new Set(["culture"]);
    // Player 0 projects renown (a cultural building); rival has little culture.
    citiesOf(state, 0)[0]!.buildings.push("amphitheater");
    state.players[1]!.cultureLifetime = 3;
    expect(checkVictory(state)).toBeNull(); // no influence accrued yet
    for (let i = 0; i < 5; i++) accrueInfluence(state, 0);
    expect(influentialOver(state, 0, 1)).toBe(true);
    const v = checkVictory(state);
    expect(v?.condition).toBe("culture");
    expect(v?.winnerId).toBe(0);
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
