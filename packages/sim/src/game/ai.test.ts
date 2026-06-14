import { describe, it, expect } from "vitest";
import { getTile } from "@roc/shared";
import { createGame } from "./setup";
import { applyCommand, beginTurn } from "./commands";
import { aiTakeTurn } from "./ai";
import { worksOf } from "./works";
import { offsetNeighbors } from "./movement";
import { isPassableLand } from "./terrain";
import { UNIT_DEFS } from "./content";
import { citiesOf, unitsOf, type GameState } from "./state";

/** Run end-turns until the AI (player 1) has founded a city. */
function aiWithCity(seed: string): GameState {
  const s = createGame({ seed, cols: 44, rows: 30, barbarians: false, humanSlots: 1, playerCount: 2 });
  beginTurn(s);
  let guard = 0;
  while (citiesOf(s, 1).length === 0 && guard++ < 25) applyCommand(s, { type: "endTurn" });
  return s;
}

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

  it("plays a long game (research, build, expand) without crashing", () => {
    const s = aiWithCity("ai-long");
    expect(() => {
      for (let i = 0; i < 50; i++) applyCommand(s, { type: "endTurn" });
    }).not.toThrow();
    expect(citiesOf(s, 1).length).toBeGreaterThanOrEqual(1); // AI keeps its empire
    expect(s.players[1]!.researched.size).toBeGreaterThan(2); // and keeps developing
  });

  it("spends earned promotions on its units", () => {
    const s = aiWithCity("ai-promo");
    const u = unitsOf(s, 1).find((x) => UNIT_DEFS[x.type].strength > 0)!;
    u.level = 2;
    u.unspentPromotions = 1;
    aiTakeTurn(s, 1);
    expect(u.unspentPromotions).toBe(0);
    expect(u.promotions.length).toBeGreaterThan(0);
  });

  it("fortifies a city with a tower when it has a Mason and Military Engineer", () => {
    const s = aiWithCity("ai-fort");
    const ai = s.players[1]!;
    ai.researched.add("masonry");
    ai.researched.add("engineering");
    const city = citiesOf(s, 1)[0]!;
    city.population = 10;
    // Make a neighbouring tile a clean, owned build site.
    const nb = offsetNeighbors(s.map, city.col, city.row)[0]!;
    const nt = getTile(s.map, nb.col, nb.row)!;
    nt.terrain = "grassland";
    nt.improvement = undefined;
    nt.structure = undefined;
    nt.ownerCityId = city.id;
    expect(isPassableLand(nt.terrain)).toBe(true);
    applyCommand(s, { type: "convertCitizen", cityId: city.id, specialistId: "mason", delta: 1 }, 1);
    applyCommand(s, { type: "convertCitizen", cityId: city.id, specialistId: "engineer", delta: 1 }, 1);
    aiTakeTurn(s, 1);
    expect(worksOf(s, 1).some((w) => w.kind === "tower" || w.kind === "wall")).toBe(true);
  });

  it("starts a wonder when it has Architect + Military Engineer", () => {
    const s = aiWithCity("ai-wonder");
    const ai = s.players[1]!;
    ai.researched.add("masonry");
    ai.researched.add("engineering");
    const city = citiesOf(s, 1)[0]!;
    city.population = 10;
    applyCommand(s, { type: "convertCitizen", cityId: city.id, specialistId: "architect", delta: 1 }, 1);
    applyCommand(s, { type: "convertCitizen", cityId: city.id, specialistId: "engineer", delta: 1 }, 1);
    aiTakeTurn(s, 1);
    expect(worksOf(s, 1).some((w) => w.kind === "wonder")).toBe(true);
  });
});
