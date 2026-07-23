import { describe, it, expect } from "vitest";
import { getTile } from "@roc/shared";
import { createGame } from "./setup";
import { beginTurn, applyCommand } from "./commands";
import { unitsOf, citiesOf, makeUnit, type City } from "./state";
import { isPassableLand } from "./terrain";
import { startWonder, startWork } from "./works";
import { establishTradeRoute } from "./trade";
import { pillageTile } from "./raiding";
import { maybeCheckCivElimination } from "./turn-updates";
import { declareWar, ensureContact } from "./diplomacy";

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
      (t) =>
        t.ownerCityId === city.id &&
        !t.improvement &&
        !t.resource &&
        !t.river &&
        (t.terrain === "grassland" || t.terrain === "plains"),
    );
    if (!farmTile) {
      const fallback = getTile(state.map, city.col + 1, city.row)!;
      fallback.terrain = "grassland";
      fallback.improvement = undefined;
      fallback.resource = undefined;
      fallback.river = undefined;
      fallback.ownerCityId = city.id;
    }
    const tile = farmTile ?? getTile(state.map, city.col + 1, city.row)!;

    const res = startWork(state, 0, "farm", tile.col, tile.row);
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

    // Give player 0 the required tech, gold, and the Great Pyramid's full crew (11 Masons + 6 Architects).
    state.players[0]!.researched.add("masonry");
    state.players[0]!.gold = 1000;
    for (let i = 0; i < 11; i++) city.specialists.push({ id: 100 + i, type: "mason", xp: 0, level: 1 });
    for (let i = 0; i < 6; i++) city.specialists.push({ id: 200 + i, type: "architect", xp: 0, level: 1 });

    // Wonders are tile-targeted: pick an empty owned tile (not the city itself).
    const target = state.map.tiles.find(
      (t) =>
        t.ownerCityId === city.id &&
        isPassableLand(t.terrain) &&
        !t.improvement &&
        !t.structure &&
        !(t.col === city.col && t.row === city.row),
    )!;
    target.terrain = "desert"; // the Great Pyramid must sit on a desert tile
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
    // Pin the capital to a known interior spot and flatten the strip to the
    // destination, so the route never depends on the rolled terrain.
    settler.col = 12;
    settler.row = 10;
    for (let c = 12; c <= 12 + 6; c++) getTile(state.map, c, 10)!.terrain = "plains";
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

  it("alerts every other major civ when a rival is eliminated", () => {
    const state = createGame({
      seed: "civ-defeat",
      cols: 36,
      rows: 24,
      barbarians: false,
      humanSlots: 1,
      playerCount: 2,
      civIds: ["khazars", "japan"],
    });
    beginTurn(state);

    // Wipe player 1: delete their only city and all units.
    for (const c of citiesOf(state, 1)) state.cities.delete(c.id);
    for (const u of unitsOf(state, 1)) state.units.delete(u.id);

    maybeCheckCivElimination(state, 1, 0, { col: 10, row: 10 });

    const defeated = state.turnUpdates.filter((e) => e.type === "civDefeated");
    expect(defeated).toHaveLength(1);
    expect(defeated[0]!.playerId).toBe(0);
    expect(defeated[0]!.message).toBe("Bulan defeated Tokugawa.");
    expect(defeated.some((e) => e.playerId === 1)).toBe(false);
    expect(state.log.some((e) => e.world && e.message.includes("Bulan defeated Tokugawa"))).toBe(true);
  });

  it("alerts when the last city is captured even if the victim still has units", () => {
    const state = createGame({
      seed: "civ-defeat-city",
      cols: 36,
      rows: 24,
      barbarians: false,
      humanSlots: 1,
      playerCount: 2,
      civIds: ["khazars", "japan"],
    });
    beginTurn(state);

    const mkCity = (ownerId: number, name: string, col: number, row: number): City => {
      const id = state.nextEntityId++;
      const city: City = {
        id,
        ownerId,
        name,
        col,
        row,
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
        isCapital: true,
        foundedAsCapital: true,
        hp: 0,
        lastAttackedTurn: 0,
        rangedAttackUsed: false,
        modifiers: [],
      };
      state.cities.set(id, city);
      return city;
    };
    mkCity(0, "Khazar Hold", 5, 5);
    const victimCity = mkCity(1, "Edo", 14, 5);

    const attacker = unitsOf(state, 0).find((u) => u.type === "warrior" || u.type === "swordsman")!;
    attacker.col = victimCity.col + 1;
    attacker.row = victimCity.row;
    attacker.movementLeft = 2;
    attacker.attackedThisTurn = false;
    state.players[0]!.atWar.push(1);
    state.players[1]!.atWar.push(0);

    expect(unitsOf(state, 1).length).toBeGreaterThan(0);
    applyCommand(state, { type: "attack", attackerId: attacker.id, col: victimCity.col, row: victimCity.row }, attacker.ownerId);

    const defeated = state.turnUpdates.filter((e) => e.type === "civDefeated");
    expect(defeated.some((e) => e.playerId === 0)).toBe(true);
    expect(defeated[0]!.message).toBe("Bulan defeated Tokugawa.");
  });

  it("announces a war declaration to the victim and to civs that met both sides", () => {
    const state = createGame({
      seed: "war-declared",
      cols: 36,
      rows: 24,
      barbarians: false,
      humanSlots: 1,
      playerCount: 3,
      civIds: ["khazars", "japan", "egypt"],
    });
    beginTurn(state);

    // Player 2 has met both belligerents; the victim only knows the aggressor.
    ensureContact(state, 0, 1);
    ensureContact(state, 2, 0);
    ensureContact(state, 2, 1);

    declareWar(state, 1, 0);

    const events = state.turnUpdates.filter((e) => e.type === "warDeclared");
    const victim = events.find((e) => e.playerId === 0)!;
    expect(victim.message).toBe("Japan has declared war on you!");
    expect(victim.payload?.onYou).toBe(true);
    // The aggressor made the declaration; no announcement for them.
    expect(events.some((e) => e.playerId === 1)).toBe(false);
    const bystander = events.find((e) => e.playerId === 2)!;
    expect(bystander.message).toBe("Japan declared war on Khazars.");
    expect(bystander.payload?.onYou).toBe(false);
  });

  it("does not announce a third-party war to civs that have not met both sides", () => {
    const state = createGame({
      seed: "war-declared-unmet",
      cols: 36,
      rows: 24,
      barbarians: false,
      humanSlots: 1,
      playerCount: 3,
      civIds: ["khazars", "japan", "egypt"],
    });
    beginTurn(state);

    // Player 2 only knows the aggressor, not the victim.
    ensureContact(state, 0, 1);
    ensureContact(state, 2, 1);

    declareWar(state, 1, 0);

    const events = state.turnUpdates.filter((e) => e.type === "warDeclared");
    expect(events.some((e) => e.playerId === 0)).toBe(true); // victim always told
    expect(events.some((e) => e.playerId === 2)).toBe(false);
  });

  it("uses multiplayer usernames in civ-defeat announcements", () => {
    const state = createGame({
      seed: "civ-defeat-mp",
      cols: 36,
      rows: 24,
      barbarians: false,
      humanSlots: 2,
      playerCount: 2,
      playerNames: ["Alice", "Bob"],
      civIds: ["khazars", "japan"],
    });
    beginTurn(state);

    for (const c of citiesOf(state, 1)) state.cities.delete(c.id);
    for (const u of unitsOf(state, 1)) state.units.delete(u.id);

    maybeCheckCivElimination(state, 1, 0, { col: 10, row: 10 });

    const defeated = state.turnUpdates.filter((e) => e.type === "civDefeated");
    expect(defeated).toHaveLength(1);
    expect(defeated[0]!.message).toBe("Alice defeated Bob.");
  });
});
