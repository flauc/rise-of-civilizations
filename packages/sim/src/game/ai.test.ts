import { describe, it, expect } from "vitest";
import { axialDistance, getTile, offsetToAxial } from "@roc/shared";
import { createGame } from "./setup";
import { applyCommand, beginTurn } from "./commands";
import { startSimultaneousTurn, resolveSimultaneousTurn } from "./simturn";
import { aiTakeTurn } from "./ai";
import { worksOf } from "./works";
import { offsetNeighbors } from "./movement";
import { isPassableLand } from "./terrain";
import { ensureContact, declareWar } from "./diplomacy";
import { startTraining } from "./training";
import { UNIT_DEFS } from "./content";
import { citiesOf, makeUnit, unitAt, unitsOf, type GameState } from "./state";

/** First passable, unoccupied land neighbour of (col,row). */
function freeNeighbor(s: GameState, col: number, row: number) {
  return offsetNeighbors(s.map, col, row).find((n) => {
    const t = getTile(s.map, n.col, n.row);
    return t && isPassableLand(t.terrain) && !unitAt(s, n.col, n.row);
  });
}

const dist = (a: { col: number; row: number }, b: { col: number; row: number }) =>
  axialDistance(offsetToAxial(a), offsetToAxial(b));

/** First unoccupied passable-land tile exactly `depth` land-steps from `start`. */
function landTileAtDepth(s: GameState, start: { col: number; row: number }, depth: number): { col: number; row: number } | null {
  const seen = new Set([`${start.col},${start.row}`]);
  let frontier = [{ col: start.col, row: start.row, d: 0 }];
  while (frontier.length) {
    const cur = frontier.shift()!;
    if (cur.d === depth && !unitAt(s, cur.col, cur.row)) return { col: cur.col, row: cur.row };
    if (cur.d >= depth) continue;
    for (const n of offsetNeighbors(s.map, cur.col, cur.row)) {
      const k = `${n.col},${n.row}`;
      if (seen.has(k)) continue;
      const t = getTile(s.map, n.col, n.row);
      if (!t || !isPassableLand(t.terrain)) continue;
      seen.add(k);
      frontier.push({ col: n.col, row: n.row, d: cur.d + 1 });
    }
  }
  return null;
}

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

  it("scouts instead of shadowing a peaceful neighbour, then pursues once at war", () => {
    const s = aiWithCity("ai-scout");
    const ai = s.players[1]!;
    const warrior = unitsOf(s, 1).find((u) => UNIT_DEFS[u.type].strength > 0 && !UNIT_DEFS[u.type].founder);
    expect(warrior).toBeTruthy();

    // Park a human unit 3 land-steps away (reachable, but not adjacent to attack).
    const spot = landTileAtDepth(s, warrior!, 3);
    expect(spot).toBeTruthy();
    const human = unitsOf(s, 0).find((u) => UNIT_DEFS[u.type].strength > 0)!;
    human.col = spot!.col;
    human.row = spot!.row;

    // Fully explore the map for the AI so scouting is a no-op: at peace, the unit
    // has no reason to move toward the (peaceful) human at all.
    for (let row = 0; row < s.map.rows; row++)
      for (let col = 0; col < s.map.cols; col++) ai.explored.add(`${col},${row}`);

    const d0 = dist(warrior!, human);
    warrior!.movementLeft = UNIT_DEFS[warrior!.type].movement;
    aiTakeTurn(s, 1);
    expect(dist(warrior!, human)).toBeGreaterThanOrEqual(d0); // did NOT chase a peaceful unit

    // Declare war → the AI should now close on the enemy.
    ensureContact(s, 0, 1);
    expect(declareWar(s, 1, 0).ok).toBe(true);
    const d1 = dist(warrior!, human);
    warrior!.movementLeft = UNIT_DEFS[warrior!.type].movement;
    aiTakeTurn(s, 1);
    expect(dist(warrior!, human)).toBeLessThan(d1); // pursues once hostile
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

  it("falls back to its city to heal when a unit is badly wounded", () => {
    const s = aiWithCity("ai-retreat");
    for (const u of unitsOf(s, 1)) s.units.delete(u.id); // isolate one wounded unit
    const city = citiesOf(s, 1)[0]!;
    const spot = landTileAtDepth(s, city, 3)!;
    const woundedId = s.nextEntityId++;
    const wounded = makeUnit(woundedId, 1, "swordsman", spot.col, spot.row);
    wounded.hp = 20;
    s.units.set(woundedId, wounded);
    // War with the human, whose soldier stands adjacent to the wounded unit.
    ensureContact(s, 0, 1);
    declareWar(s, 0, 1);
    const adj = freeNeighbor(s, spot.col, spot.row)!;
    const enemyId = s.nextEntityId++;
    const enemy = makeUnit(enemyId, 0, "swordsman", adj.col, adj.row);
    s.units.set(enemyId, enemy);
    const hp0 = enemy.hp;
    wounded.movementLeft = UNIT_DEFS["swordsman"].movement;
    aiTakeTurn(s, 1);
    // An even matchup it would otherwise attack — but wounded, it disengages instead.
    expect(enemy.hp).toBe(hp0);
    expect(s.units.has(woundedId)).toBe(true); // and it survived to heal
  });

  it("uses scouts to explore, not to fight (won't attack an adjacent enemy)", () => {
    const s = aiWithCity("ai-scout-role");
    for (const u of unitsOf(s, 1)) s.units.delete(u.id); // only the scout acts
    const city = citiesOf(s, 1)[0]!;
    const spot = landTileAtDepth(s, city, 2)!;
    const scoutId = s.nextEntityId++;
    s.units.set(scoutId, makeUnit(scoutId, 1, "scout", spot.col, spot.row));
    ensureContact(s, 0, 1);
    declareWar(s, 0, 1);
    const adj = freeNeighbor(s, spot.col, spot.row)!;
    const enemyId = s.nextEntityId++;
    const enemy = makeUnit(enemyId, 0, "swordsman", adj.col, adj.row);
    s.units.set(enemyId, enemy);
    const hp0 = enemy.hp;
    s.units.get(scoutId)!.movementLeft = UNIT_DEFS["scout"].movement;
    aiTakeTurn(s, 1);
    expect(enemy.hp).toBe(hp0); // the scout slipped away instead of attacking
  });

  it("rushes wartime troop training with surplus gold", () => {
    const s = aiWithCity("ai-rush");
    const city = citiesOf(s, 1)[0]!;
    city.training.barracks = 1;
    city.population = 5;
    const r = startTraining(s, city, "warrior");
    expect(r.ok).toBe(true);
    city.trainingQueue[0]!.turnsLeft = 5; // plenty left to be worth rushing
    s.players[1]!.gold = 1000;
    ensureContact(s, 0, 1);
    declareWar(s, 1, 0); // AI at war → threatened → hurries troops
    aiTakeTurn(s, 1);
    expect(s.players[1]!.gold).toBeLessThan(1000); // spent gold to hurry it
    expect(city.trainingQueue.some((o) => o.turnsLeft === 1)).toBe(true); // a unit was hurried
  });
});
