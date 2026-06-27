import { describe, it, expect } from "vitest";
import { createGame } from "./setup";
import { beginTurn, applyCommand } from "./commands";
import { unitsOf, citiesOf, makeUnit, type City } from "./state";
import { isPassableLand } from "./terrain";
import { startWonder, startWork } from "./works";
import { establishTradeRoute } from "./trade";
import { pillageTile } from "./raiding";

function newGame() {
  const state = createGame({ seed: "test-turn-updates", cols: 48, rows: 32, barbarians: false });
  beginTurn(state);
  return state;
}

describe("turn update events", () => {
  it("emits unitTrained when a city finishes training a unit", () => {
    const state = newGame();
    const settler = unitsOf(state, 0).find((u) => u.type === "settler")!;
    applyCommand(state, { type: "foundCity", unitId: settler.id });
    const city = citiesOf(state, 0)[0]!;
    city.training.barracks = 1; // a Barracks so it can train melee
    city.population = 3; // room to spare a citizen

    const r = applyCommand(state, { type: "startTraining", cityId: city.id, unit: "warrior" });
    expect(r.ok).toBe(true);
    // Force the order to complete on the next time this city is processed.
    city.trainingQueue[0]!.turnsLeft = 1;

    // In a 2-player game we need to advance past player 1 and back to player 0.
    applyCommand(state, { type: "endTurn" });
    applyCommand(state, { type: "endTurn" });
    const events = state.turnUpdates.filter((e) => e.playerId === 0 && e.type === "unitTrained");
    expect(events.length).toBeGreaterThan(0);
    expect(events[0]!.cityId).toBe(city.id);
    expect(events[0]!.message).toContain("Warrior");
  });

  it("emits researchComplete when a tech is finished", () => {
    const state = newGame();
    const settler = unitsOf(state, 0).find((u) => u.type === "settler")!;
    applyCommand(state, { type: "foundCity", unitId: settler.id });
    applyCommand(state, { type: "setResearch", techId: "cultivation" });

    // Rush through enough turns to finish cultivation.
    for (let i = 0; i < 30; i++) applyCommand(state, { type: "endTurn" });

    const events = state.turnUpdates.filter((e) => e.playerId === 0 && e.type === "researchComplete");
    expect(events.length).toBeGreaterThan(0);
  });

  it("emits unitDied when an owned unit is killed", () => {
    const state = newGame();
    const warrior = unitsOf(state, 0).find((u) => u.type === "warrior" || u.type === "javelineer")!;
    warrior.hp = 1;

    // Declare war and let player 1 attack.
    state.players[0]!.atWar.push(1);
    state.players[1]!.atWar.push(0);
    const enemy = unitsOf(state, 1).find((u) => u.type === "warrior" || u.type === "javelineer")!;
    enemy.col = warrior.col + 1;
    enemy.row = warrior.row;
    enemy.movementLeft = 2;

    applyCommand(state, { type: "attack", attackerId: enemy.id, col: warrior.col, row: warrior.row }, enemy.ownerId);

    const events = state.turnUpdates.filter((e) => e.playerId === 0 && e.type === "unitDied");
    expect(events.length).toBeGreaterThan(0);
    expect(events[0]!.unitId).toBe(warrior.id);
  });

  it("scopes events to the affected player", () => {
    const state = newGame();
    const warrior = unitsOf(state, 0).find((u) => u.type === "warrior" || u.type === "javelineer")!;
    warrior.hp = 1;

    state.players[0]!.atWar.push(1);
    state.players[1]!.atWar.push(0);
    const enemy = unitsOf(state, 1).find((u) => u.type === "warrior" || u.type === "javelineer")!;
    enemy.col = warrior.col + 1;
    enemy.row = warrior.row;
    enemy.movementLeft = 2;

    applyCommand(state, { type: "attack", attackerId: enemy.id, col: warrior.col, row: warrior.row }, enemy.ownerId);

    const p0events = state.turnUpdates.filter((e) => e.playerId === 0 && e.type === "unitDied");
    const p1events = state.turnUpdates.filter((e) => e.playerId === 1 && e.type === "unitDied");
    expect(p0events.length).toBe(1);
    expect(p1events.length).toBe(0);
  });

  it("includes the improvement kind in improvementComplete events", () => {
    const state = newGame();
    const settler = unitsOf(state, 0).find((u) => u.type === "settler")!;
    applyCommand(state, { type: "foundCity", unitId: settler.id });
    const city = citiesOf(state, 0)[0]!;

    // Train a carpenter and find a farmable tile.
    city.specialists.push({ id: 1, type: "carpenter", xp: 0, level: 1, name: "Test Carpenter" });
    const farmTile = state.map.tiles.find(
      (t) => t.ownerCityId === city.id && (t.terrain === "grassland" || t.terrain === "plains"),
    )!;

    const res = startWork(state, 0, "farm", farmTile.col, farmTile.row);
    expect(res.ok).toBe(true);
    const work = state.works.find((w) => w.ownerId === 0 && w.kind === "farm")!;
    work.progress = { ...work.requirement };

    applyCommand(state, { type: "endTurn" });
    applyCommand(state, { type: "endTurn" });

    const events = state.turnUpdates.filter((e) => e.playerId === 0 && e.type === "improvementComplete");
    expect(events.length).toBe(1);
    expect(events[0]!.payload?.kind).toBe("farm");
  });

  it("includes the wonder id in wonderComplete events", () => {
    const state = newGame();
    const settler = unitsOf(state, 0).find((u) => u.type === "settler")!;
    applyCommand(state, { type: "foundCity", unitId: settler.id });
    const city = citiesOf(state, 0)[0]!;

    // Give player 0 the required tech and train specialists for the Great Pyramid.
    state.players[0]!.researched.add("masonry");
    city.specialists.push(
      { id: 1, type: "mason", xp: 0, level: 1, name: "Test Mason" },
      { id: 2, type: "mason", xp: 0, level: 1, name: "Test Mason 2" },
      { id: 3, type: "architect", xp: 0, level: 1, name: "Test Architect" },
    );

    // Wonders are tile-targeted: pick an empty owned tile (not the city itself).
    const target = state.map.tiles.find(
      (t) =>
        t.ownerCityId === city.id &&
        isPassableLand(t.terrain) &&
        !t.improvement &&
        !t.structure &&
        !(t.col === city.col && t.row === city.row),
    )!;
    const res = startWonder(state, 0, "great_pyramid", target.col, target.row);
    expect(res.ok).toBe(true);
    const work = state.works.find((w) => w.ownerId === 0 && w.wonderId === "great_pyramid")!;
    // Force completion.
    work.progress = { ...work.requirement };

    applyCommand(state, { type: "endTurn" });
    applyCommand(state, { type: "endTurn" });

    const events = state.turnUpdates.filter((e) => e.playerId === 0 && e.type === "wonderComplete");
    expect(events.length).toBe(1);
    expect(events[0]!.payload?.wonderId).toBe("great_pyramid");
  });

  it("emits improvementComplete for completed roads, walls, and towers", () => {
    const state = newGame();
    const settler = unitsOf(state, 0).find((u) => u.type === "settler")!;
    applyCommand(state, { type: "foundCity", unitId: settler.id });
    const city = citiesOf(state, 0)[0]!;

    const candidates = state.map.tiles.filter(
      (t) => t.ownerCityId === city.id && isPassableLand(t.terrain) && !t.improvement && !t.structure,
    );
    const roadTile = candidates[0]!;
    const wallTile = candidates[1]!;
    const towerTile = candidates[2]!;

    city.specialists.push({ id: 1, type: "agrimensor", xp: 0, level: 1, name: "Test Surveyor" });
    expect(startWork(state, 0, "road", roadTile.col, roadTile.row).ok).toBe(true);
    city.specialists.push(
      { id: 2, type: "mason", xp: 0, level: 1, name: "Test Mason" },
      { id: 3, type: "engineer", xp: 0, level: 1, name: "Test Engineer" },
    );
    expect(startWork(state, 0, "wall", wallTile.col, wallTile.row).ok).toBe(true);
    expect(startWork(state, 0, "tower", towerTile.col, towerTile.row).ok).toBe(true);

    for (const w of state.works.filter((x) => x.ownerId === 0)) {
      w.progress = { ...w.requirement };
    }

    applyCommand(state, { type: "endTurn" });
    applyCommand(state, { type: "endTurn" });

    const roadEv = state.turnUpdates.find(
      (e) => e.playerId === 0 && e.type === "improvementComplete" && e.payload?.kind === "road",
    );
    const wallEv = state.turnUpdates.find(
      (e) => e.playerId === 0 && e.type === "improvementComplete" && e.payload?.kind === "wall",
    );
    const towerEv = state.turnUpdates.find(
      (e) => e.playerId === 0 && e.type === "improvementComplete" && e.payload?.kind === "tower",
    );

    expect(roadEv).toBeDefined();
    expect(wallEv).toBeDefined();
    expect(towerEv).toBeDefined();
  });

  it("emits tradeRouteEstablished when a trader creates a route", () => {
    const state = newGame();
    const settler = unitsOf(state, 0).find((u) => u.type === "settler")!;
    applyCommand(state, { type: "foundCity", unitId: settler.id });
    const from = citiesOf(state, 0)[0]!;
    const toId = state.nextEntityId++;
    const to: City = {
      id: toId,
      ownerId: 0,
      name: "Trade Town",
      col: from.col + 6,
      row: from.row,
      population: 1,
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
      rangedAttackUsed: false,
      modifiers: [],
    };
    state.cities.set(toId, to);

    const tid = state.nextEntityId++;
    state.units.set(tid, makeUnit(tid, 0, "trader", from.col, from.row));

    const res = establishTradeRoute(state, tid, to.id, 0);
    expect(res.ok).toBe(true);

    const events = state.turnUpdates.filter((e) => e.playerId === 0 && e.type === "tradeRouteEstablished");
    expect(events.length).toBe(1);
    expect(events[0]!.message).toContain("Trade Town");
    expect(events[0]!.payload?.destCol).toBe(to.col);
  });

  it("emits improvementPillaged to the tile owner when an improvement is pillaged", () => {
    const state = newGame();
    const victimCity: City = {
      id: state.nextEntityId++,
      ownerId: 1,
      name: "Target",
      col: 10,
      row: 10,
      population: 1,
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
      rangedAttackUsed: false,
      modifiers: [],
    };
    state.cities.set(victimCity.id, victimCity);

    const tile = state.map.tiles.find((t) => t.col === 11 && t.row === 10)!;
    tile.ownerCityId = victimCity.id;
    tile.improvement = "farm";
    tile.improvementLevel = 1;

    state.players[0]!.atWar.push(1);
    state.players[1]!.atWar.push(0);

    const raiderId = state.nextEntityId++;
    const raider = makeUnit(raiderId, 0, "warrior", 11, 10);
    raider.movementLeft = 2;
    state.units.set(raiderId, raider);

    const res = pillageTile(state, raiderId, 0);
    expect(res.ok).toBe(true);

    const events = state.turnUpdates.filter((e) => e.playerId === 1 && e.type === "improvementPillaged");
    expect(events.length).toBe(1);
    expect(events[0]!.payload?.pillaged).toContain("farm");
    expect(events[0]!.tile).toEqual({ col: 11, row: 10 });
  });
});
