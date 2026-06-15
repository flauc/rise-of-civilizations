import { describe, it, expect } from "vitest";
import { getTile } from "@roc/shared";
import { createGame } from "./setup";
import { applyCommand, beginTurn } from "./commands";
import { startSimultaneousTurn, resolveSimultaneousTurn } from "./simturn";
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

  it("develops its economy in simultaneous (multiplayer) play, not just hotseat", () => {
    // Regression: resolveSimultaneousTurn once ran processCity/advanceWorks for
    // humans only, so AI civs in multiplayer issued orders but never accumulated
    // production, growth, or research. Drive the simultaneous resolver directly
    // (the human just "readies up" each turn) and confirm the AI actually grows.
    const s = createGame({ seed: "ai-sim", cols: 44, rows: 30, barbarians: false, humanSlots: 1, playerCount: 2 });
    startSimultaneousTurn(s);
    for (let i = 0; i < 30; i++) resolveSimultaneousTurn(s);

    expect(citiesOf(s, 1).length).toBeGreaterThanOrEqual(1); // AI settled
    expect(s.players[1]!.researched.size).toBeGreaterThanOrEqual(2); // and researched
    // Proof the economy ticked for the AI: a city grew past its founding pop.
    expect(citiesOf(s, 1).some((c) => c.population > 1)).toBe(true);
  });

  it("gathers strategic resources and expires stances each simultaneous turn", () => {
    // The simultaneous resolver once skipped gatherPlayerResources and
    // tickAbilities entirely (hotseat ran them in beginTurn). Confirm a turn's
    // start now stockpiles strategic resources and clears/enforces stances & pins.
    const s = createGame({ seed: "ai-sim-eco", cols: 30, rows: 20, barbarians: false, humanSlots: 1, playerCount: 2 });
    startSimultaneousTurn(s);

    const settler = unitsOf(s, 0).find((u) => u.type === "settler")!;
    applyCommand(s, { type: "foundCity", unitId: settler.id }, 0);
    const city = citiesOf(s, 0)[0]!;
    const tile = getTile(s.map, city.col + 1, city.row)!;
    tile.resource = "iron";
    tile.improvement = "mine";
    tile.ownerCityId = city.id;

    const unit = unitsOf(s, 0).find((u) => UNIT_DEFS[u.type].strength > 0)!;
    unit.stance = "brace";
    unit.pinnedUntilTurn = s.turn + 5;

    const before = s.players[0]!.resources.iron ?? 0;
    resolveSimultaneousTurn(s); // resolves this turn, then begins the next

    expect(s.players[0]!.resources.iron ?? 0).toBeGreaterThan(before); // stockpiled
    expect(unit.stance ?? null).toBeNull(); // stance expired at turn start
    expect(unit.movementLeft).toBe(0); // pin enforced at turn start
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
