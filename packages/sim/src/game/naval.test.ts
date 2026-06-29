import { describe, expect, it } from "vitest";
import type { GameMap } from "@roc/shared";
import type { City, GameState, Player, Unit } from "./state";
import { makeUnit } from "./state";
import { applyCommand } from "./commands";
import { computeReachable, isCoastalLand } from "./movement";
import { resolveAttack, computeAttackTargets } from "./combat";
import { establishTradeRoute } from "./trade";
import { availableTraining } from "./training";
import { UNIT_DEFS } from "./content";
import type { TerrainType } from "./terrain";

const makeMap = (cols: number, rows: number, terrain: (col: number, row: number) => TerrainType): GameMap => ({
  cols,
  rows,
  tiles: Array.from({ length: rows * cols }, (_, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    return { col, row, terrain: terrain(col, row) };
  }),
});

const makePlayer = (id: number): Player => ({
  id,
  name: `P${id}`,
  civId: "rome",
  color: "#000",
  isHuman: id === 0,
  isBarbarian: false,
  researched: new Set(),
  researching: null,
  researchQueue: [],
  scienceProgress: 0,
  civicsResearched: new Set(),
  researchingCivic: null,
  cultureProgress: 0,
  government: "chiefdom",
  policies: [],
  gold: 0,
  globalMorale: 50,
  faith: 0,
  resources: {},
  explored: new Set(),
  met: [],
  atWar: [],
  importedLuxuries: [],
  bribesPaid: 0,
  leaderAbilityLastUsedTurn: -Infinity,
  modifiers: [],
  greatPeoplePoints: {},
  greatPeopleEarned: {},
  greatPeople: [],
  legendsRecruited: 0,
});

const makeCity = (id: number, ownerId: number, name: string, col: number, row: number): City => ({
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
  isCapital: false,
  foundedAsCapital: false,
  hp: 100,
  lastAttackedTurn: 0,
  rangedAttackUsed: false,
  modifiers: [],
});

const baseState = (map: GameMap, overrides?: Partial<GameState>): GameState => ({
  map,
  players: [makePlayer(0), makePlayer(1)],
  units: new Map(),
  cities: new Map(),
  turn: 1,
  currentPlayerIndex: 0,
  nextEntityId: 10,
  log: [],
  gameOver: null,
  turnLimit: 200,
  religions: [],
  tradeRoutes: [],
  works: [],
  completedWonders: [],
  turnUpdates: [],
  nextTurnUpdateId: 1,
  relations: [],
  ...overrides,
} as GameState);

const addUnit = (state: GameState, unit: Unit): Unit => {
  state.units.set(unit.id, unit);
  unit.movementLeft = UNIT_DEFS[unit.type].movement;
  unit.attackedThisTurn = false;
  return unit;
};

// Land on cols 0-2, shallow coast on cols 3-5, with an ocean tile beyond for ocean tests.
const coastalMap = makeMap(6, 4, (col) => (col >= 3 ? "coast" : "plains"));

const oceanMap = makeMap(8, 4, (col) => {
  if (col === 7) return "ocean";
  if (col >= 3) return "coast";
  return "plains";
});

describe("naval movement", () => {
  it("lets a galley move on coast but not onto land", () => {
    const state = baseState(coastalMap);
    const galley = addUnit(state, makeUnit(1, 0, "galley", 4, 1));
    const reachable = computeReachable(state, galley);
    // (2,1) is inland and must not be reachable; (3,1) is coast and should be reachable.
    expect(reachable.has("2,1")).toBe(false);
    expect(reachable.has("3,1")).toBe(true);
    for (const key of reachable.keys()) {
      const [c, r] = key.split(",").map(Number) as [number, number];
      expect(coastalMap.tiles[r * 6 + c]!.terrain).toBe("coast");
    }
  });

  it("blocks non-ocean-going ships from entering ocean", () => {
    const state = baseState(oceanMap);
    const galley = addUnit(state, makeUnit(1, 0, "galley", 5, 1));
    const reachable = computeReachable(state, galley);
    expect(reachable.has("7,1")).toBe(false);
    const caravel = addUnit(state, makeUnit(2, 0, "caravel", 5, 2));
    const caravelReach = computeReachable(state, caravel);
    expect(caravelReach.has("7,2")).toBe(true);
  });

  it("lets astronomy unlock ocean tiles for all ships", () => {
    const state = baseState(oceanMap);
    state.players[0]!.researched.add("astronomy");
    const galley = addUnit(state, makeUnit(1, 0, "galley", 5, 1));
    const reachable = computeReachable(state, galley);
    expect(reachable.has("7,1")).toBe(true);
  });

  it("prevents land units from moving onto water", () => {
    const state = baseState(coastalMap);
    const warrior = addUnit(state, makeUnit(1, 0, "warrior", 2, 1));
    const reachable = computeReachable(state, warrior);
    expect(reachable.has("3,1")).toBe(false);
  });
});

describe("embarkation", () => {
  it("embarks a land unit from coastal land onto adjacent water (with Sailing)", () => {
    const state = baseState(coastalMap);
    state.players[0]!.researched.add("sailing");
    const warrior = addUnit(state, makeUnit(1, 0, "warrior", 2, 1));
    expect(isCoastalLand(state, 2, 1)).toBe(true);
    const res = applyCommand(state, { type: "embark", unitId: warrior.id, col: 3, row: 1 });
    expect(res.ok).toBe(true);
    expect(warrior.col).toBe(3);
    expect(warrior.row).toBe(1);
    expect(warrior.embarked).toBe(true);
    expect(warrior.movementLeft).toBe(0);
  });

  it("rejects embark without the Sailing tech", () => {
    const state = baseState(coastalMap);
    const warrior = addUnit(state, makeUnit(1, 0, "warrior", 2, 1));
    const res = applyCommand(state, { type: "embark", unitId: warrior.id, col: 3, row: 1 });
    expect(res.ok).toBe(false);
    expect(warrior.embarked).toBeFalsy();
  });

  it("blocks embarking into a met civ's waters without war or open borders", () => {
    // Fresh map so we don't mutate the shared coastalMap's tile ownership.
    const map = makeMap(6, 4, (col) => (col >= 3 ? "coast" : "plains"));
    const state = baseState(map);
    state.players[0]!.researched.add("sailing");
    state.players[0]!.met = [1];
    const theirCity = makeCity(50, 1, "Theirs", 0, 2);
    state.cities.set(theirCity.id, theirCity);
    map.tiles[1 * 6 + 3]!.ownerCityId = theirCity.id; // tile (3,1) is player 1's water
    const warrior = addUnit(state, makeUnit(1, 0, "warrior", 2, 1));
    const res = applyCommand(state, { type: "embark", unitId: warrior.id, col: 3, row: 1 });
    expect(res.ok).toBe(false);
    expect(warrior.embarked).toBeFalsy();
  });

  it("disembarks an embarked unit onto adjacent land", () => {
    const state = baseState(coastalMap);
    const warrior = addUnit(state, makeUnit(1, 0, "warrior", 3, 1));
    warrior.embarked = true;
    const res = applyCommand(state, { type: "disembark", unitId: warrior.id, col: 2, row: 1 });
    expect(res.ok).toBe(true);
    expect(warrior.embarked).toBe(false);
    expect(warrior.movementLeft).toBe(0);
  });

  it("rejects embark from inland tiles", () => {
    const state = baseState(coastalMap);
    state.players[0]!.researched.add("sailing");
    const warrior = addUnit(state, makeUnit(1, 0, "warrior", 0, 1));
    const res = applyCommand(state, { type: "embark", unitId: warrior.id, col: 1, row: 1 });
    expect(res.ok).toBe(false);
    expect(warrior.embarked).toBeFalsy();
  });
});

describe("naval combat", () => {
  it("allows naval melee to attack adjacent enemy ships", () => {
    const state = baseState(coastalMap);
    const galley = addUnit(state, makeUnit(1, 0, "galley", 4, 1));
    const enemy = addUnit(state, makeUnit(2, 1, "galley", 5, 1));
    state.players[0]!.atWar.push(1);
    state.players[1]!.atWar.push(0);
    const res = resolveAttack(state, galley, 5, 1);
    expect(res.ok).toBe(true);
    expect(galley.attackedThisTurn).toBe(true);
  });

  it("allows naval ranged to bombard coastal cities", () => {
    const state = baseState(coastalMap);
    const dromon = addUnit(state, makeUnit(1, 0, "dromon", 4, 1));
    const city = makeCity(1, 1, "Ostia", 2, 1);
    state.cities.set(1, city);
    state.players[0]!.atWar.push(1);
    state.players[1]!.atWar.push(0);
    const hpBefore = city.hp;
    const res = resolveAttack(state, dromon, 2, 1);
    expect(res.ok).toBe(true);
    expect(city.hp).toBeLessThan(hpBefore);
  });

  it("ships cannot capture cities, only reduce them to 0 hp", () => {
    const state = baseState(coastalMap);
    const galley = addUnit(state, makeUnit(1, 0, "galley", 3, 1));
    const city = makeCity(1, 1, "Ostia", 2, 1);
    city.hp = 1;
    state.cities.set(1, city);
    state.players[0]!.atWar.push(1);
    state.players[1]!.atWar.push(0);
    resolveAttack(state, galley, 2, 1);
    expect(city.hp).toBe(0);
    expect(city.ownerId).toBe(1);
  });

  it("prevents land units from attacking native ships", () => {
    const state = baseState(coastalMap);
    const warrior = addUnit(state, makeUnit(1, 0, "warrior", 2, 1));
    addUnit(state, makeUnit(2, 1, "galley", 3, 1));
    state.players[0]!.atWar.push(1);
    state.players[1]!.atWar.push(0);
    const res = resolveAttack(state, warrior, 3, 1);
    expect(res.ok).toBe(false);
  });

  it("ships cannot attack inland targets", () => {
    const state = baseState(coastalMap);
    const galley = addUnit(state, makeUnit(1, 0, "galley", 4, 1));
    addUnit(state, makeUnit(2, 1, "warrior", 0, 1));
    state.players[0]!.atWar.push(1);
    state.players[1]!.atWar.push(0);
    const res = resolveAttack(state, galley, 0, 1);
    expect(res.ok).toBe(false);
  });

  it("extended_range_naval lets ranged ships strike from range 3", () => {
    const state = baseState(oceanMap);
    const dromon = addUnit(state, makeUnit(1, 0, "dromon", 4, 1));
    dromon.promotions.push("extended_range_naval");
    addUnit(state, makeUnit(2, 1, "galley", 7, 1));
    state.players[0]!.atWar.push(1);
    state.players[1]!.atWar.push(0);
    expect(computeAttackTargets(state, dromon).has("7,1")).toBe(true);
    const res = resolveAttack(state, dromon, 7, 1);
    expect(res.ok).toBe(true);
  });
});

describe("naval production", () => {
  it("only allows training naval units in coastal cities", () => {
    const state = baseState(coastalMap);
    const coastal = makeCity(1, 0, "Roma", 2, 1);
    const inland = makeCity(2, 0, "Arretium", 0, 1);
    state.players[0]!.researched.add("sailing");
    coastal.population = 3;
    inland.population = 3;
    coastal.training.shipyard = 1; // a Shipyard so it can train ships
    inland.training.shipyard = 1;
    state.cities.set(1, coastal);
    state.cities.set(2, inland);
    const coastalOpts = availableTraining(state, state.players[0]!, coastal);
    const inlandOpts = availableTraining(state, state.players[0]!, inland);
    expect(coastalOpts.includes("galley")).toBe(true);
    expect(inlandOpts.includes("galley")).toBe(false);
  });
});

describe("trade routes over water", () => {
  it("computes a trade route path across coastal water", () => {
    const state = baseState(coastalMap);
    const cityA = makeCity(1, 0, "Roma", 1, 1);
    const cityB = makeCity(2, 0, "Neapolis", 5, 1);
    state.cities.set(1, cityA);
    state.cities.set(2, cityB);
    const trader = addUnit(state, makeUnit(1, 0, "trader", 1, 1));
    const res = establishTradeRoute(state, trader.id, 2, 0);
    expect(res.ok).toBe(true);
    const route = state.tradeRoutes[0]!;
    expect(route.path.length).toBeGreaterThan(2);
    const crossesWater = route.path.some((key) => {
      const [c, r] = key.split(",").map(Number) as [number, number];
      return coastalMap.tiles[r * 6 + c]!.terrain === "coast";
    });
    expect(crossesWater).toBe(true);
  });
});
