import { describe, it, expect } from "vitest";
import { axialDistance, getTile, offsetToAxial } from "@roc/shared";
import { createGame } from "./setup";
import { applyCommand, beginTurn } from "./commands";
import { startSimultaneousTurn, resolveSimultaneousTurn } from "./simturn";
import { aiTakeTurn, aiBarbarianDiplomacy, aiVictoryFocus, aiSeekOpenBorders, aiSeekConquest, aiPeaceBlocked, planSettle, frontierGrabBonus } from "./ai";
import { isBarbarianPacified } from "./bribery";
import { worksOf } from "./works";
import { offsetNeighbors } from "./movement";
import { isPassableLand } from "./terrain";
import { ensureContact, declareWar, personalityOf, relationBetween, atWar } from "./diplomacy";
import { foundReligion } from "./religion";
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

/** Strip every village/camp the map generator scattered, so a test can place and
 *  isolate exactly the feature it cares about. */
function clearFeatures(s: GameState): void {
  for (const t of s.map.tiles) t.feature = undefined;
}

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

/** A barbarians-on game with a player-1 (AI) Warrior beside a barbarian Warrior, and
 *  every other AI unit cleared so military counts are predictable. Returns the pieces
 *  needed to drive barbarian-diplomacy tests. */
function barbAdjacentSetup(seed: string): { s: GameState; ai: GameState["players"][number]; barbId: number; guardId: number; barbUnitId: number } {
  const s = createGame({ seed, cols: 30, rows: 20, barbarians: true, humanSlots: 1, playerCount: 2 });
  beginTurn(s);
  const ai = s.players[1]!;
  const barbId = s.players.find((p) => p.isBarbarian)!.id;
  let h: { col: number; row: number } | null = null;
  let b: { col: number; row: number } | null = null;
  outer: for (const t of s.map.tiles) {
    if (!isPassableLand(t.terrain)) continue;
    for (const n of offsetNeighbors(s.map, t.col, t.row)) {
      const nt = getTile(s.map, n.col, n.row);
      if (nt && isPassableLand(nt.terrain)) { h = { col: t.col, row: t.row }; b = { col: n.col, row: n.row }; break outer; }
    }
  }
  if (!h || !b) throw new Error("no adjacent passable tiles");
  // Clear every AI unit (so milCount is exactly our guard) and whatever sits on b.
  for (const u of [...s.units.values()]) {
    if (u.ownerId === 1) s.units.delete(u.id);
    else if (u.col === b.col && u.row === b.row) s.units.delete(u.id);
  }
  const guardId = s.nextEntityId++;
  s.units.set(guardId, makeUnit(guardId, 1, "warrior", h.col, h.row));
  const barbUnitId = s.nextEntityId++;
  s.units.set(barbUnitId, makeUnit(barbUnitId, barbId, "warrior", b.col, b.row));
  return { s, ai, barbId, guardId, barbUnitId };
}

/** Run end-turns until the AI (player 1) has founded a city. */
function aiWithCity(seed: string): GameState {
  const s = createGame({ seed, cols: 44, rows: 30, barbarians: false, humanSlots: 1, playerCount: 2 });
  beginTurn(s);
  let guard = 0;
  while (citiesOf(s, 1).length === 0 && guard++ < 25) applyCommand(s, { type: "endTurn" });
  return s;
}

/** Second developed city so wonder logic treats the empire as past the opening. */
function addDevelopedSisterCity(s: GameState, main: { id: number; col: number; row: number }): void {
  const id = s.nextEntityId++;
  const col = main.col + 4;
  const row = main.row;
  const tile = s.map.tiles[row * s.map.cols + col];
  if (tile) tile.ownerCityId = id;
  s.cities.set(id, {
    id,
    ownerId: 1,
    name: "Sister",
    col,
    row,
    population: 8,
    foodStored: 0,
    productionStored: 0,
    production: null,
    buildings: [],
    training: {},
    trainingQueue: [],
    specialists: [],
    wonders: [],
    workedTiles: [],
    isCapital: false,
    foundedAsCapital: false,
    hp: 100,
    lastAttackedTurn: 0,
    rangedAttacksUsed: 0,
    rangedAttackUsed: false,
    modifiers: [],
  } as never);
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
    // Use four civs: in a 1v1 the passive human never settles, so the AI wins an
    // instant domination victory (the only civ left with cities) within a few turns and
    // the sim freezes — we'd never observe a real long game. With rival AIs around, the
    // game runs on and we can watch player 1 actually develop.
    const s = createGame({ seed: "ai-long", cols: 44, rows: 30, barbarians: false, humanSlots: 1, playerCount: 4 });
    beginTurn(s);
    let guard = 0;
    while (citiesOf(s, 1).length === 0 && guard++ < 25) applyCommand(s, { type: "endTurn" });
    expect(() => {
      for (let i = 0; i < 50; i++) applyCommand(s, { type: "endTurn" });
    }).not.toThrow();
    expect(citiesOf(s, 1).length).toBeGreaterThanOrEqual(1); // AI keeps its empire
    expect(s.players[1]!.researched.size).toBeGreaterThan(2); // and keeps developing
  });

  it("researches governments and adopts a real one once the culture tree opens", () => {
    const s = createGame({ seed: "ai-gov", cols: 44, rows: 30, barbarians: false, humanSlots: 1, playerCount: 3 });
    beginTurn(s);
    let guard = 0;
    while (citiesOf(s, 1).length === 0 && guard++ < 25) applyCommand(s, { type: "endTurn" });
    s.players[1]!.researched.add("writing"); // open the tree
    s.players[1]!.cultureProgress += 2000; // and give it culture to spend
    for (let i = 0; i < 40; i++) applyCommand(s, { type: "endTurn" });
    const p = s.players[1]!;
    expect(p.governmentsResearched.size).toBeGreaterThan(1); // researched beyond Chiefdom
    expect(p.government).not.toBe("chiefdom"); // and switched into a real government
  });

  it("makes deterministic government/civic choices for a given seed", () => {
    const run = () => {
      const s = createGame({ seed: "ai-gov-det", cols: 44, rows: 30, barbarians: false, humanSlots: 1, playerCount: 3 });
      beginTurn(s);
      let g = 0;
      while (citiesOf(s, 1).length === 0 && g++ < 25) applyCommand(s, { type: "endTurn" });
      s.players[1]!.researched.add("writing");
      s.players[1]!.cultureProgress += 2000;
      for (let i = 0; i < 40; i++) applyCommand(s, { type: "endTurn" });
      const p = s.players[1]!;
      return { gov: p.government, researched: [...p.governmentsResearched].sort(), slotted: [...p.slottedCivics].sort() };
    };
    expect(run()).toEqual(run());
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

  it("bombards nearby enemies from its cities when at war", () => {
    const s = aiWithCity("ai-bombard");
    const city = citiesOf(s, 1)[0]!;
    ensureContact(s, 0, 1);
    expect(declareWar(s, 1, 0).ok).toBe(true);
    for (const u of [...unitsOf(s, 1)]) {
      if (!UNIT_DEFS[u.type].founder) s.units.delete(u.id);
    }
    const neighbor = offsetNeighbors(s.map, city.col, city.row).find((n) => {
      const t = getTile(s.map, n.col, n.row);
      return t && isPassableLand(t.terrain);
    });
    expect(neighbor).toBeTruthy();
    const foe = unitsOf(s, 0).find((u) => UNIT_DEFS[u.type].strength > 0)!;
    foe.col = neighbor!.col;
    foe.row = neighbor!.row;
    const hpBefore = foe.hp;
    city.rangedAttacksUsed = 0;
    aiTakeTurn(s, 1);
    expect(city.rangedAttacksUsed).toBe(1);
    expect(foe.hp).toBeLessThan(hpBefore);
  });

  it("still bombards in a save carrying the stuck pre-0.6.0 bombard flag", () => {
    const s = aiWithCity("ai-bombard-legacy");
    const city = citiesOf(s, 1)[0]!;
    ensureContact(s, 0, 1);
    expect(declareWar(s, 1, 0).ok).toBe(true);
    for (const u of [...unitsOf(s, 1)]) {
      if (!UNIT_DEFS[u.type].founder) s.units.delete(u.id);
    }
    const neighbor = offsetNeighbors(s.map, city.col, city.row).find((n) => {
      const t = getTile(s.map, n.col, n.row);
      return t && isPassableLand(t.terrain) && !unitAt(s, n.col, n.row);
    })!;
    const foe = unitsOf(s, 0).find((u) => UNIT_DEFS[u.type].strength > 0)!;
    foe.col = neighbor.col;
    foe.row = neighbor.row;
    const hpBefore = foe.hp;
    // An old save has the boolean stuck true and no counter at all; the next
    // round's turn-start reset must clear it so the city fires again.
    (city as { rangedAttacksUsed?: number }).rangedAttacksUsed = undefined;
    city.rangedAttackUsed = true;
    applyCommand(s, { type: "endTurn" }); // human passes; the AI round runs
    expect(foe.hp).toBeLessThan(hpBefore);
  });

  it("spends every bombard a Bombard Tower grants", () => {
    const s = aiWithCity("ai-bombard-tower");
    const city = citiesOf(s, 1)[0]!;
    city.buildings.push("bombard_tower"); // +1 bombard per turn
    ensureContact(s, 0, 1);
    expect(declareWar(s, 1, 0).ok).toBe(true);
    for (const u of [...unitsOf(s, 1)]) {
      if (!UNIT_DEFS[u.type].founder) s.units.delete(u.id);
    }
    const spots = offsetNeighbors(s.map, city.col, city.row).filter((n) => {
      const t = getTile(s.map, n.col, n.row);
      return t && isPassableLand(t.terrain) && !unitAt(s, n.col, n.row);
    });
    expect(spots.length).toBeGreaterThanOrEqual(2);
    const foes = unitsOf(s, 0).filter((u) => UNIT_DEFS[u.type].strength > 0).slice(0, 2);
    expect(foes.length).toBe(2);
    foes.forEach((f, i) => {
      f.col = spots[i]!.col;
      f.row = spots[i]!.row;
    });
    city.rangedAttacksUsed = 0;
    aiTakeTurn(s, 1);
    expect(city.rangedAttacksUsed).toBe(2);
  });

  it("closes the last stretch and strikes in the same turn", () => {
    const s = aiWithCity("ai-close-strike");
    ensureContact(s, 0, 1);
    expect(declareWar(s, 1, 0).ok).toBe(true);
    const city = citiesOf(s, 1)[0]!;
    city.rangedAttacksUsed = 99; // mute the city so only the warrior can deal damage
    const warrior = unitsOf(s, 1).find((u) => u.type === "warrior")!;
    for (const u of [...unitsOf(s, 1)]) {
      if (u.id !== warrior.id) s.units.delete(u.id);
    }
    clearFeatures(s); // no villages/camps to lure the warrior elsewhere
    // Level the land so movement costs can't eat the whole budget mid-approach.
    for (const t of s.map.tiles) if (isPassableLand(t.terrain)) t.terrain = "grassland";
    // Park the warrior on its city tile (garrison duty can't pull it back) and put
    // a badly wounded enemy two steps out: beyond arm's reach, within march+strike.
    warrior.col = city.col;
    warrior.row = city.row;
    const spot = landTileAtDepth(s, city, 2)!;
    const foe = unitsOf(s, 0).find((u) => UNIT_DEFS[u.type].strength > 0)!;
    foe.col = spot.col;
    foe.row = spot.row;
    foe.hp = 25;
    warrior.movementLeft = UNIT_DEFS.warrior.movement;
    aiTakeTurn(s, 1);
    // The warrior must have moved AND landed the hit in one turn.
    const after = s.units.get(foe.id);
    expect(after === undefined || after.hp < 25).toBe(true);
    expect(warrior.attackedThisTurn).toBe(true);
  });

  it("refuses a hopeless trade even at full health", () => {
    const s = aiWithCity("ai-no-suicide");
    ensureContact(s, 0, 1);
    expect(declareWar(s, 1, 0).ok).toBe(true);
    const warrior = unitsOf(s, 1).find((u) => u.type === "warrior")!;
    for (const u of [...unitsOf(s, 1)]) {
      if (u.id !== warrior.id) s.units.delete(u.id);
    }
    citiesOf(s, 1).forEach((c) => { c.rangedAttacksUsed = 99; }); // no bombard chip
    clearFeatures(s);
    // A wall of longswordsmen: the warrior would deal ~10 and take ~75. Extra
    // defenders parked far away keep the power ratio out of "crushing" range.
    const adj = freeNeighbor(s, warrior.col, warrior.row)!;
    const wallId = s.nextEntityId++;
    const wall = makeUnit(wallId, 0, "longswordsman", adj.col, adj.row);
    s.units.set(wallId, wall);
    for (let i = 0; i < 4; i++) {
      const far = landTileAtDepth(s, { col: wall.col, row: wall.row }, 6 + i);
      if (!far) continue;
      const id = s.nextEntityId++;
      s.units.set(id, makeUnit(id, 0, "longswordsman", far.col, far.row));
    }
    warrior.movementLeft = UNIT_DEFS.warrior.movement;
    const hpBefore = warrior.hp;
    const wallHpBefore = wall.hp;
    aiTakeTurn(s, 1);
    expect(wall.hp).toBe(wallHpBefore); // the warrior did not throw itself at the wall
    expect(warrior.hp).toBe(hpBefore);
  });

  it("attacks a favorable adjacent enemy when at war", () => {
    const s = aiWithCity("ai-fight");
    ensureContact(s, 0, 1);
    expect(declareWar(s, 1, 0).ok).toBe(true);
    const warrior = unitsOf(s, 1).find((u) => u.type === "warrior")!;
    for (const u of [...unitsOf(s, 1)]) {
      if (u.id !== warrior.id) s.units.delete(u.id);
    }
    const human = unitsOf(s, 0).find((u) => UNIT_DEFS[u.type].strength > 0)!;
    const adj = offsetNeighbors(s.map, warrior.col, warrior.row).find((n) => {
      const t = getTile(s.map, n.col, n.row);
      return t && isPassableLand(t.terrain) && !unitAt(s, n.col, n.row);
    });
    expect(adj).toBeTruthy();
    human.col = adj!.col;
    human.row = adj!.row;
    human.hp = 45;
    warrior.movementLeft = UNIT_DEFS.warrior.movement;
    const hpBefore = human.hp;
    aiTakeTurn(s, 1);
    expect(human.hp).toBeLessThan(hpBefore);
  });

  it("scouts instead of shadowing a peaceful neighbour, then pursues once at war", () => {
    const s = aiWithCity("ai-scout");
    const ai = s.players[1]!;
    const warrior = unitsOf(s, 1).find((u) => UNIT_DEFS[u.type].strength > 0 && !UNIT_DEFS[u.type].founder);
    expect(warrior).toBeTruthy();

    // Level the land so the pursuit isn't detoured by movement-cost terrain, and
    // park the unit away from its own city so garrison duty doesn't pin it.
    for (const t of s.map.tiles) if (isPassableLand(t.terrain)) t.terrain = "grassland";
    const home = citiesOf(s, 1)[0]!;
    for (let dc = 8; dc >= 4; dc--) {
      const t = getTile(s.map, home.col + dc, home.row);
      if (t && isPassableLand(t.terrain) && !unitAt(s, t.col, t.row)) {
        warrior!.col = t.col;
        warrior!.row = t.row;
        break;
      }
    }

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
    clearFeatures(s); // and nothing to collect, so the unit has no other pull

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

  it("paves road routes between its cities once it has surveyors", () => {
    const s = aiWithCity("ai-roads");
    const ai = s.players[1]!;
    ai.researched.add("the_wheel");
    const capital = citiesOf(s, 1)[0]!;
    applyCommand(s, { type: "convertCitizen", cityId: capital.id, specialistId: "agrimensor", delta: 1 }, 1);
    const spot = landTileAtDepth(s, capital, 4);
    expect(spot).toBeTruthy();
    const settlerId = s.nextEntityId++;
    s.units.set(settlerId, makeUnit(settlerId, 1, "settler", spot!.col, spot!.row));
    applyCommand(s, { type: "foundCity", unitId: settlerId }, 1);
    expect(citiesOf(s, 1).length).toBeGreaterThanOrEqual(2);
    aiTakeTurn(s, 1);
    expect(s.roadRoutes.some((r) => r.ownerId === 1 && r.queue.length > 0)).toBe(true);
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

  it("starts a wonder once it has gathered a full wonder crew", () => {
    const s = aiWithCity("ai-wonder");
    const ai = s.players[1]!;
    ai.researched.add("masonry");
    ai.researched.add("engineering");
    ai.gold = 2000; // afford a wonder's one-time gold cost
    const city = citiesOf(s, 1)[0]!;
    city.population = 40;
    addDevelopedSisterCity(s, city);
    // A wonder now needs its ENTIRE crew idle before it can start (11 Masons, etc.),
    // so hand the AI a generous bench covering every non-survey wonder's crafts.
    let id = 5000;
    const bench: [string, number][] = [["mason", 12], ["architect", 8], ["engineer", 8], ["carpenter", 8]];
    for (const [type, n] of bench) for (let i = 0; i < n; i++) city.specialists.push({ id: id++, type: type as never, xp: 0, level: 1 });
    // Wonders now have terrain gates; give the AI legal desert sites for the Great
    // Pyramid — several, since it may also claim one tile for a defensive structure.
    const sites = s.map.tiles
      .filter(
        (t) => t.ownerCityId === city.id && !t.improvement && !t.structure && !(t.col === city.col && t.row === city.row),
      )
      .slice(0, 3);
    expect(sites.length).toBeGreaterThan(0);
    for (const site of sites) {
      site.terrain = "desert";
      site.feature = undefined;
      site.wonder = undefined;
      site.naturalWonder = undefined;
    }
    aiTakeTurn(s, 1);
    expect(worksOf(s, 1).some((w) => w.kind === "wonder")).toBe(true);
  });

  it("builds world wonders when it has the crew and treasury", () => {
    const s = aiWithCity("ai-wonder-build2");
    const ai = s.players[1]!;
    ai.researched.add("writing");
    ai.researched.add("engineering");
    ai.researched.add("masonry");
    ai.gold = 2000;
    ai.cultureProgress = 150;
    const city = citiesOf(s, 1)[0]!;
    city.population = 35;
    addDevelopedSisterCity(s, city);
    let id = 5000;
    for (const [type, n] of [["architect", 8], ["engineer", 6]] as const) {
      for (let i = 0; i < n; i++) city.specialists.push({ id: id++, type, xp: 0, level: 1 });
    }
    s.works = s.works.filter((w) => w.ownerId !== 1);
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
    wounded.movementLeft = UNIT_DEFS["swordsman"].movement;
    aiTakeTurn(s, 1);
    // The wounded swordsman must not trade blows (city bombard may still chip the foe).
    expect(wounded.hp).toBe(20);
    expect(s.units.has(woundedId)).toBe(true);
  });

  it("musters its faith's holy unit in a temple city that follows the religion", () => {
    const s = aiWithCity("ai-holy-train");
    const ai = s.players[1]!;
    const city = citiesOf(s, 1)[0]!;
    // Give the AI a founded religion (Christianity → the Evangelist) and a city that
    // follows it, has a Temple, the tech, and the population to spare.
    ai.researched.add("ritual_burial");
    ai.researched.add("writing");
    ai.faith = 100;
    expect(foundReligion(s, 1, city.id, "Christianity", ["tithe"]).ok).toBe(true);
    city.buildings.push("temple");
    city.population = 6;
    city.religionPressure = { [ai.foundedReligionId!]: 100 };
    city.religion = ai.foundedReligionId;
    aiTakeTurn(s, 1);
    const training = city.trainingQueue.some((o) => UNIT_DEFS[o.unit].religionUnit === "christianity");
    const fielded = unitsOf(s, 1).some((u) => u.type === "evangelist");
    expect(training || fielded).toBe(true);
  });

  it("fires a holy unit's blessing to heal a wounded nearby ally", () => {
    const s = aiWithCity("ai-holy-ability");
    for (const u of unitsOf(s, 1)) s.units.delete(u.id); // isolate the evangelist + one ally
    const ai = s.players[1]!;
    ai.researched.add("ritual_burial");
    ai.faith = 100;
    const city = citiesOf(s, 1)[0]!;
    foundReligion(s, 1, city.id, "Christianity", ["tithe"]);
    const spot = landTileAtDepth(s, city, 3)!;
    const evId = s.nextEntityId++;
    const ev = makeUnit(evId, 1, "evangelist", spot.col, spot.row);
    ev.movementLeft = UNIT_DEFS["evangelist"].movement; // aiTakeTurn doesn't refresh movement
    s.units.set(evId, ev);
    const adj = freeNeighbor(s, spot.col, spot.row)!;
    const woundedId = s.nextEntityId++;
    const wounded = makeUnit(woundedId, 1, "warrior", adj.col, adj.row);
    wounded.hp = 20;
    s.units.set(woundedId, wounded);
    aiTakeTurn(s, 1);
    // Benediction (or the evangelist's healing aura on the AI's own turn) mends the ally.
    expect(s.units.get(woundedId)!.hp).toBeGreaterThan(20);
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
    city.rangedAttacksUsed = 99; // isolate scout movement — city bombard also chips adjacent foes
    aiTakeTurn(s, 1);
    expect(enemy.hp).toBe(hp0); // the scout slipped away instead of attacking
  });

  it("marches a military unit toward a discovered barbarian camp to clear it", () => {
    const s = aiWithCity("ai-camp");
    const ai = s.players[1]!;
    const warrior = unitsOf(s, 1).find((u) => UNIT_DEFS[u.type].strength > 0 && !UNIT_DEFS[u.type].founder)!;
    // Isolate the warrior so only it acts, and clear any war so it's free to roam.
    for (const u of unitsOf(s, 1)) if (u.id !== warrior.id) s.units.delete(u.id);
    clearFeatures(s); // remove map-generated features so only our camp pulls
    // Drop a barbarian camp a few land-steps away on a tile the AI has discovered.
    const spot = landTileAtDepth(s, warrior, 3)!;
    getTile(s.map, spot.col, spot.row)!.feature = "barb_camp";
    ai.explored.add(`${spot.col},${spot.row}`);
    const d0 = dist(warrior, spot);
    warrior.movementLeft = UNIT_DEFS[warrior.type].movement;
    aiTakeTurn(s, 1);
    expect(dist(warrior, spot)).toBeLessThan(d0); // closed on the camp
  });

  it("diverts a scout to collect a discovered tribal village", () => {
    const s = aiWithCity("ai-village");
    const ai = s.players[1]!;
    for (const u of unitsOf(s, 1)) s.units.delete(u.id); // only the scout acts
    clearFeatures(s); // remove map-generated features so only our village pulls
    const city = citiesOf(s, 1)[0]!;
    const scoutId = s.nextEntityId++;
    const scoutSpot = landTileAtDepth(s, city, 2)!;
    s.units.set(scoutId, makeUnit(scoutId, 1, "scout", scoutSpot.col, scoutSpot.row));
    const scout = s.units.get(scoutId)!;
    const spot = landTileAtDepth(s, scout, 3)!;
    getTile(s.map, spot.col, spot.row)!.feature = "village";
    ai.explored.add(`${spot.col},${spot.row}`);
    const d0 = dist(scout, spot);
    scout.movementLeft = UNIT_DEFS["scout"].movement;
    aiTakeTurn(s, 1);
    expect(dist(s.units.get(scoutId)!, spot)).toBeLessThan(d0); // headed for the village
  });

  it("marches a military unit toward a discovered tribal village", () => {
    const s = aiWithCity("ai-mil-village");
    const ai = s.players[1]!;
    const warrior = unitsOf(s, 1).find((u) => UNIT_DEFS[u.type].strength > 0 && !UNIT_DEFS[u.type].founder)!;
    for (const u of unitsOf(s, 1)) if (u.id !== warrior!.id) s.units.delete(u.id);
    clearFeatures(s);
    // Level the land so the march isn't detoured by movement-cost terrain.
    for (const t of s.map.tiles) if (isPassableLand(t.terrain)) t.terrain = "grassland";
    const spot = landTileAtDepth(s, warrior!, 3)!;
    getTile(s.map, spot.col, spot.row)!.feature = "village";
    ai.explored.add(`${spot.col},${spot.row}`);
    const d0 = dist(warrior!, spot);
    warrior!.movementLeft = UNIT_DEFS[warrior!.type].movement;
    aiTakeTurn(s, 1);
    expect(dist(s.units.get(warrior!.id)!, spot)).toBeLessThan(d0);
  });

  it("prefers a nearby village over a farther barbarian camp", () => {
    const s = aiWithCity("ai-village-over-camp");
    const ai = s.players[1]!;
    const warrior = unitsOf(s, 1).find((u) => UNIT_DEFS[u.type].strength > 0 && !UNIT_DEFS[u.type].founder)!;
    for (const u of unitsOf(s, 1)) if (u.id !== warrior!.id) s.units.delete(u.id);
    clearFeatures(s);
    const villageSpot = landTileAtDepth(s, warrior!, 3)!;
    const campSpot = landTileAtDepth(s, warrior!, 7)!;
    getTile(s.map, villageSpot.col, villageSpot.row)!.feature = "village";
    getTile(s.map, campSpot.col, campSpot.row)!.feature = "barb_camp";
    ai.explored.add(`${villageSpot.col},${villageSpot.row}`);
    ai.explored.add(`${campSpot.col},${campSpot.row}`);
    const dV0 = dist(warrior!, villageSpot);
    warrior!.movementLeft = UNIT_DEFS[warrior!.type].movement;
    aiTakeTurn(s, 1);
    expect(dist(s.units.get(warrior!.id)!, villageSpot)).toBeLessThan(dV0);
    expect(dist(s.units.get(warrior!.id)!, campSpot)).toBeGreaterThan(dist(warrior!, villageSpot));
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

  it("finds a distant settle site when the local ring is full of cities", () => {
    const s = aiWithCity("ai-settle-global");
    for (const u of unitsOf(s, 1)) s.units.delete(u.id);
    const city = citiesOf(s, 1)[0]!;
    // Fully explore so the global fallback can see the whole map.
    for (let row = 0; row < s.map.rows; row++)
      for (let col = 0; col < s.map.cols; col++) s.players[1]!.explored.add(`${col},${row}`);
    // Ring the capital so nothing within the local ±6 search is legal.
    for (let dr = -5; dr <= 5; dr++) {
      for (let dc = -5; dc <= 5; dc++) {
        const col = city.col + dc;
        const row = city.row + dr;
        const tile = getTile(s.map, col, row);
        if (!tile || !isPassableLand(tile.terrain)) continue;
        if (dist(city, { col, row }) < 3) continue;
        if (dist(city, { col, row }) > 5) continue;
        const id = s.nextEntityId++;
        s.cities.set(id, {
          id, ownerId: 1, name: `Fill${id}`, col, row, population: 1, foodStored: 0, productionStored: 0,
          production: null, buildings: [], training: {}, trainingQueue: [], specialists: [], wonders: [],
          workedTiles: [], isCapital: false, foundedAsCapital: false, hp: 100, lastAttackedTurn: 0,
          rangedAttackUsed: false, modifiers: [],
        });
      }
    }
    const settlerId = s.nextEntityId++;
    s.units.set(settlerId, makeUnit(settlerId, 1, "settler", city.col, city.row));
    const settler = s.units.get(settlerId)!;
    const plan = planSettle(s, settler, 1);
    expect(plan).toBeTruthy();
    expect(dist(city, plan!)).toBeGreaterThan(5);
  });

  it("assigns different settle destinations to multiple settlers", () => {
    const s = aiWithCity("ai-settle-reserve");
    for (const u of unitsOf(s, 1)) s.units.delete(u.id);
    const city = citiesOf(s, 1)[0]!;
    for (let row = 0; row < s.map.rows; row++)
      for (let col = 0; col < s.map.cols; col++) s.players[1]!.explored.add(`${col},${row}`);
    const a = s.nextEntityId++;
    const b = s.nextEntityId++;
    s.units.set(a, makeUnit(a, 1, "settler", city.col, city.row));
    s.units.set(b, makeUnit(b, 1, "settler", city.col, city.row));
    const reserved = new Set<string>();
    const planA = planSettle(s, s.units.get(a)!, 1, reserved);
    expect(planA).toBeTruthy();
    reserved.add(`${planA!.col},${planA!.row}`);
    const planB = planSettle(s, s.units.get(b)!, 1, reserved);
    expect(planB).toBeTruthy();
    expect(`${planB!.col},${planB!.row}`).not.toBe(`${planA!.col},${planA!.row}`);
  });

  it("routes a settler around a known barbarian camp to safe ground", () => {
    const s = aiWithCity("ai-safe-settle");
    for (const u of unitsOf(s, 1)) s.units.delete(u.id); // only our settler matters
    clearFeatures(s);
    const city = citiesOf(s, 1)[0]!;
    const spot = landTileAtDepth(s, city, 2)!;
    const settlerId = s.nextEntityId++;
    s.units.set(settlerId, makeUnit(settlerId, 1, "settler", spot.col, spot.row));
    const settler = s.units.get(settlerId)!;
    // Fully explore so any camp counts as "known" (the AI plans only around seen threats).
    for (let row = 0; row < s.map.rows; row++)
      for (let col = 0; col < s.map.cols; col++) s.players[1]!.explored.add(`${col},${row}`);

    const before = planSettle(s, settler, 1);
    expect(before).toBeTruthy();
    expect(before!.safe).toBe(true); // no raiders anywhere yet → the best site is safe

    // Drop a barbarian camp right on the site it would otherwise have chosen.
    getTile(s.map, before!.col, before!.row)!.feature = "barb_camp";
    const after = planSettle(s, settler, 1);
    expect(after).toBeTruthy();
    if (after!.col === before!.col && after!.row === before!.row) {
      // No comparable safe site → it accepts the exposed one but flags it for an escort.
      expect(after!.safe).toBe(false);
    } else {
      // It diverted to a different, safe site instead.
      expect(after!.safe).toBe(true);
      expect(getTile(s.map, after!.col, after!.row)!.feature).not.toBe("barb_camp");
    }
  });

  it("never plans a settle onto another civ's territory", () => {
    const s = aiWithCity("ai-foreign-settle");
    for (const u of unitsOf(s, 1)) s.units.delete(u.id); // only our settler matters
    clearFeatures(s);
    const city = citiesOf(s, 1)[0]!;
    const spot = landTileAtDepth(s, city, 2)!;
    const settlerId = s.nextEntityId++;
    s.units.set(settlerId, makeUnit(settlerId, 1, "settler", spot.col, spot.row));
    const settler = s.units.get(settlerId)!;
    for (let row = 0; row < s.map.rows; row++)
      for (let col = 0; col < s.map.cols; col++) s.players[1]!.explored.add(`${col},${row}`);

    const before = planSettle(s, settler, 1);
    expect(before).toBeTruthy();
    // A rival (player 0) claims the very tile the AI would have settled.
    const rivalCityId = s.nextEntityId++;
    s.cities.set(rivalCityId, {
      id: rivalCityId, ownerId: 0, name: "Rival", col: before!.col, row: before!.row, population: 1,
      foodStored: 0, productionStored: 0, production: null, buildings: [], training: {}, trainingQueue: [],
      specialists: [], wonders: [], workedTiles: [], isCapital: false, foundedAsCapital: false, hp: 100,
      lastAttackedTurn: 0, rangedAttackUsed: false, modifiers: [],
    });
    getTile(s.map, before!.col, before!.row)!.ownerCityId = rivalCityId;

    const after = planSettle(s, settler, 1);
    // It must pick somewhere else, and that somewhere is never foreign-owned.
    expect(after).toBeTruthy();
    expect(`${after!.col},${after!.row}`).not.toBe(`${before!.col},${before!.row}`);
    const chosen = getTile(s.map, after!.col, after!.row)!;
    if (chosen.ownerCityId !== undefined) {
      expect(s.cities.get(chosen.ownerCityId)!.ownerId).toBe(1); // only ever our own land
    }
  });

  it("pulls settle scoring toward contested frontier, hardest beside a weaker civ", () => {
    const s = createGame({ seed: "ai-frontier", cols: 44, rows: 30, barbarians: false, humanSlots: 1, playerCount: 2 });
    beginTurn(s);
    const meId = 1, rivalId = 0;
    // Full control over power: wipe the default starting units and cities.
    for (const u of [...s.units.values()]) s.units.delete(u.id);
    for (const [id] of [...s.cities]) s.cities.delete(id);
    s.players[meId]!.met = [rivalId];
    s.players[rivalId]!.met = [meId];
    // Plant one rival city; the exact fields don't matter beyond owner/pos/pop.
    const rx = 20, ry = 15;
    const rivalCityId = s.nextEntityId++;
    s.cities.set(rivalCityId, {
      id: rivalCityId, ownerId: rivalId, name: "Rival", col: rx, row: ry, population: 1, foodStored: 0,
      productionStored: 0, production: null, buildings: [], training: {}, trainingQueue: [], specialists: [],
      wonders: [], workedTiles: [], isCapital: true, foundedAsCapital: true, hp: 100, lastAttackedTurn: 0,
      rangedAttackUsed: false, modifiers: [],
    });

    // We out-power the rival: a small army for us, none for them.
    for (let i = 0; i < 3; i++) { const id = s.nextEntityId++; s.units.set(id, makeUnit(id, meId, "warrior", 0, 0)); }
    const near = frontierGrabBonus(s, meId, rx + 1, ry);
    const far = frontierGrabBonus(s, meId, rx + 5, ry);
    const outside = frontierGrabBonus(s, meId, rx + 12, ry);
    expect(near).toBeGreaterThan(0); // grab the contested plot next to the weak neighbour
    expect(near).toBeGreaterThan(far); // closer to their border = more contested
    expect(outside).toBe(0); // beyond reach, no strategic pull

    // Flip the balance: strip our army, arm the rival heavily.
    for (const u of unitsOf(s, meId)) s.units.delete(u.id);
    for (let i = 0; i < 6; i++) { const id = s.nextEntityId++; s.units.set(id, makeUnit(id, rivalId, "warrior", rx, ry)); }
    const nearStronger = frontierGrabBonus(s, meId, rx + 1, ry);
    expect(nearStronger).toBeLessThan(0); // don't overextend a new city beside a stronger civ
  });

  it("steers a commerce-rich civ toward an economic victory", () => {
    const s = aiWithCity("ai-focus-eco");
    const ai = s.players[1]!;
    ai.gold = 8000; // a deep treasury and...
    const c = citiesOf(s, 1)[0]!;
    for (const b of ["market", "bank", "harbor"]) if (!c.buildings.includes(b)) c.buildings.push(b); // ...full commerce
    // Economic progress is now its furthest-along builder path → it commits to that win,
    // regardless of its temperament's default inclination.
    expect(aiVictoryFocus(s, ai, personalityOf(s, 1))).toBe("economic");
  });

  it("an economic-focused AI offers open borders to unlock international trade", () => {
    const s = createGame({ seed: "ai-ob", cols: 40, rows: 28, barbarians: false, humanSlots: 1, playerCount: 2 });
    beginTurn(s); // player 0 = human, player 1 = AI
    ensureContact(s, 0, 1);
    s.turn = 3; // aligns the AI(1)→0 open-borders throttle so the proposal fires this call
    expect(relationBetween(s, 1, 0)?.openBorders).toBeFalsy();
    aiSeekOpenBorders(s, s.players[1]!, "economic");
    // Offer to the human stays pending (acceptance is diplomacy's job; benchmarks show AI
    // rivals do agree). What we assert here is that the AI actively SEEKS open borders.
    expect(
      s.diploProposals.some(
        (pr) => pr.fromId === 1 && pr.toId === 0 && pr.give.some((i) => i.kind === "openBorders"),
      ),
    ).toBe(true);
  });

  it("won't trespass into peaceful foreign territory (even pre-contact), but may at war", () => {
    const s = createGame({ seed: "ai-tres", cols: 30, rows: 20, barbarians: false, humanSlots: 0, playerCount: 2 });
    beginTurn(s);
    for (const pid of [0, 1]) {
      const settler = unitsOf(s, pid).find((u) => u.type === "settler");
      if (settler) applyCommand(s, { type: "foundCity", unitId: settler.id }, pid);
    }
    const theirCity = citiesOf(s, 1)[0]!;
    const tile = s.map.tiles.find((t) => t.ownerCityId === theirCity.id)!;
    expect(tile).toBeTruthy();
    // At peace (and not even formally met) → player 0 treats player 1's land as off-limits.
    expect(aiPeaceBlocked(s, 0, tile.col, tile.row)).toBe(true);
    // Declaring war opens it up — entering is now a sanctioned act of war.
    ensureContact(s, 0, 1);
    declareWar(s, 0, 1);
    expect(aiPeaceBlocked(s, 0, tile.col, tile.row)).toBe(false);
  });

  it("a domination-focused AI opens a war on a weaker, reachable neighbour", () => {
    const s = createGame({ seed: "ai-conq", cols: 40, rows: 28, barbarians: false, humanSlots: 0, playerCount: 2 });
    beginTurn(s);
    for (const pid of [0, 1]) {
      const settler = unitsOf(s, pid).find((u) => u.type === "settler");
      if (settler) applyCommand(s, { type: "foundCity", unitId: settler.id }, pid);
    }
    ensureContact(s, 0, 1);
    // Disarm player 1, then mass a strong army for player 0 right beside player 1's city.
    for (const u of unitsOf(s, 1)) if (UNIT_DEFS[u.type].strength > 0) s.units.delete(u.id);
    const target = citiesOf(s, 1)[0]!;
    // The rolled map may leave the city short of open land neighbours; the test
    // is about the power gap, so guarantee room for the army.
    for (const nb of offsetNeighbors(s.map, target.col, target.row)) {
      const t = getTile(s.map, nb.col, nb.row);
      if (t && !isPassableLand(t.terrain)) t.terrain = "plains";
    }
    let placed = 0;
    for (const nb of offsetNeighbors(s.map, target.col, target.row)) {
      if (placed >= 4) break;
      const t = getTile(s.map, nb.col, nb.row);
      if (!t || !isPassableLand(t.terrain) || unitAt(s, nb.col, nb.row)) continue;
      const id = s.nextEntityId++;
      s.units.set(id, makeUnit(id, 0, "swordsman", nb.col, nb.row));
      placed++;
    }
    expect(placed).toBeGreaterThanOrEqual(3);
    expect(atWar(s, 0, 1)).toBe(false);
    aiSeekConquest(s, s.players[0]!, "domination");
    expect(atWar(s, 0, 1)).toBe(true); // a beatable neighbour within reach → war
  });

  it("declares war when far ahead even without a domination focus", () => {
    const s = createGame({ seed: "ai-jugg", cols: 40, rows: 28, barbarians: false, humanSlots: 0, playerCount: 2 });
    beginTurn(s);
    for (const pid of [0, 1]) {
      const settler = unitsOf(s, pid).find((u) => u.type === "settler");
      if (settler) applyCommand(s, { type: "foundCity", unitId: settler.id }, pid);
    }
    ensureContact(s, 0, 1);
    for (const u of unitsOf(s, 1)) if (UNIT_DEFS[u.type].strength > 0) s.units.delete(u.id);
    const target = citiesOf(s, 1)[0]!;
    // The rolled map may leave the city short of open land neighbours; the test
    // is about the power gap, so guarantee room for the army.
    for (const nb of offsetNeighbors(s.map, target.col, target.row)) {
      const t = getTile(s.map, nb.col, nb.row);
      if (t && !isPassableLand(t.terrain)) t.terrain = "plains";
    }
    for (let i = 0; i < 5; i++) {
      const nb = freeNeighbor(s, target.col, target.row);
      expect(nb).toBeTruthy();
      const id = s.nextEntityId++;
      s.units.set(id, makeUnit(id, 0, "swordsman", nb!.col, nb!.row));
    }
    expect(atWar(s, 0, 1)).toBe(false);
    aiSeekConquest(s, s.players[0]!, "science"); // not a warmonger focus, but a huge edge
    expect(atWar(s, 0, 1)).toBe(true);
  });

  it("opens by training a settler from the lone capital (pop 2)", () => {
    const s = aiWithCity("ai-open");
    const city = citiesOf(s, 1)[0]!;
    expect(citiesOf(s, 1).length).toBe(1); // just the capital
    // Reset to a fresh opening: founding size, nothing queued, no settler in the field.
    city.trainingQueue = [];
    city.population = 2;
    city.specialists = [];
    for (const u of unitsOf(s, 1)) if (u.type === "settler") s.units.delete(u.id);
    aiTakeTurn(s, 1);
    expect(city.trainingQueue.some((o) => o.unit === "settler")).toBe(true); // opened with a settler
  });

  it("recruits a battle-hardened barbarian when it has Parley and spare gold", () => {
    const { s, ai, barbUnitId } = barbAdjacentSetup("ai-recruit");
    ai.researched.add("parley");
    ai.gold = 1000;
    s.units.get(barbUnitId)!.level = 2; // a bargain → recruited even when not threatened
    aiBarbarianDiplomacy(s, ai, false);
    expect(s.units.get(barbUnitId)?.ownerId).toBe(1); // joined the AI's army
  });

  it("bribes a barbarian war-band into a truce when pressed and recruiting is too dear", () => {
    const { s, ai, barbId, barbUnitId } = barbAdjacentSetup("ai-bribe");
    ai.researched.add("parley");
    s.units.get(barbUnitId)!.campKey = "5,5"; // belongs to a camp → a war-band to truce with
    ai.gold = 100; // enough to bribe (30 + 40 reserve) but not to recruit (75 + 40 reserve)
    aiBarbarianDiplomacy(s, ai, true);
    expect(s.units.get(barbUnitId)?.ownerId).toBe(barbId); // not recruited
    expect(isBarbarianPacified(s, s.units.get(barbUnitId)!, 1)).toBe(true); // a truce was bought
  });

  it("rushes a settler out the door while expanding at peace", () => {
    const s = aiWithCity("ai-settler-rush");
    const city = citiesOf(s, 1)[0]!;
    city.population = 6; // big enough to spare a citizen for a settler
    const r = startTraining(s, city, "settler");
    expect(r.ok).toBe(true);
    const order = city.trainingQueue.find((o) => o.unit === "settler")!;
    order.turnsLeft = 5; // plenty left to be worth hurrying
    s.players[1]!.gold = 1000; // a deep treasury to spend on tempo
    aiTakeTurn(s, 1); // at peace, below target city count → hurry the settler
    expect(order.turnsLeft).toBe(1); // the settler was rushed to completion
    expect(s.players[1]!.gold).toBeLessThan(1000); // gold was spent doing it
  });

  it("an AI with a founded religion ordains a missionary to spread it", () => {
    const s = createGame({ seed: "ai-missionary", cols: 40, rows: 28, barbarians: false, humanSlots: 0, playerCount: 2, legends: false });
    beginTurn(s);
    const settler = unitsOf(s, 0).find((u) => u.type === "settler")!;
    applyCommand(s, { type: "foundCity", unitId: settler.id }, 0);
    const c0 = citiesOf(s, 0)[0]!;
    s.players[0]!.researched.add("ritual_burial");
    s.players[0]!.faith = 100;
    foundReligion(s, 0, c0.id, "Test Faith", []);
    // A second owned city that follows no religion → a target to convert.
    const id = s.nextEntityId++;
    s.cities.set(id, {
      id, ownerId: 0, name: "Heathen Town", col: c0.col + 3, row: c0.row, population: 1,
      foodStored: 0, productionStored: 0, production: null, buildings: [], specialists: [], wonders: [], workedTiles: [],
      isCapital: false, foundedAsCapital: false, hp: 100, lastAttackedTurn: 0, rangedAttackUsed: false, training: {}, trainingQueue: [], modifiers: [],
    });
    s.players[0]!.faith = 300; // plenty to ordain a missionary
    aiTakeTurn(s, 0);
    expect(unitsOf(s, 0).some((u) => u.type === "missionary")).toBe(true);
  });
});
