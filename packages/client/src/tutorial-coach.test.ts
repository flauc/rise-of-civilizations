import { describe, it, expect } from "vitest";
import { createGame, beginTurn, applyCommand, startTraining, ensureContact, unitsOf, type City } from "@roc/sim";
import { TUTORIAL_COACH_TURNS } from "./tutorial";
import {
  buildTutorialSteps,
  stepsForTurn,
  isEndTurnStep,
  visibleBarbarianThreat,
  type TutorialCoachContext,
  type TutorialCoachFlags,
} from "./tutorial-coach";

function coachCtx(
  state: ReturnType<typeof createGame>,
  viewerId: number,
  turn: number,
  overrides: Partial<TutorialCoachContext> = {},
): TutorialCoachContext {
  const flags: TutorialCoachFlags = overrides.flags ?? {
    barbarianExplained: false,
    enemyExplained: false,
    initialMetCount: 0,
    infoAcknowledged: false,
  };
  return {
    state,
    viewerId,
    turn,
    selectedUnitId: null,
    selectedCityId: null,
    marks: {},
    flags,
    ...overrides,
  };
}

describe("tutorial coach steps", () => {
  it("defines five coached turns", () => {
    expect(TUTORIAL_COACH_TURNS).toBe(5);
  });

  it("has steps for turns 1–5 ending with end turn", () => {
    const state = createGame({ seed: "coach-turns", cols: 20, rows: 14, humanSlots: 1, playerCount: 2 });
    beginTurn(state);
    const viewerId = state.players[0]!.id;
    for (let t = 1; t <= 5; t++) {
      const steps = buildTutorialSteps(t, coachCtx(state, viewerId, t));
      expect(steps.length).toBeGreaterThan(0);
      expect(isEndTurnStep(steps[steps.length - 1])).toBe(true);
    }
  });

  it("detects scout selection", () => {
    const state = createGame({ seed: "coach", cols: 20, rows: 14, humanSlots: 1, playerCount: 2 });
    beginTurn(state);
    const viewerId = state.players[0]!.id;
    const scout = [...state.units.values()].find((u) => u.ownerId === viewerId && u.type === "scout")!;
    const step = stepsForTurn(1, { state, viewerId, turn: 1 }).find((s) => s.id === "t1_select_scout")!;
    expect(
      step.isDone(
        coachCtx(state, viewerId, 1, {
          selectedUnitId: scout.id,
        }),
      ),
    ).toBe(true);
  });

  it("detects scout movement via marks", () => {
    const state = createGame({ seed: "coach2", cols: 20, rows: 14, humanSlots: 1, playerCount: 2 });
    beginTurn(state);
    const viewerId = state.players[0]!.id;
    const scout = [...state.units.values()].find((u) => u.ownerId === viewerId && u.type === "scout")!;
    scout.movementLeft = 0;
    const step = stepsForTurn(1, { state, viewerId, turn: 1 }).find((s) => s.id === "t1_move_scout")!;
    expect(
      step.isDone(
        coachCtx(state, viewerId, 1, {
          selectedUnitId: scout.id,
          marks: { scoutStartMove: 2, scoutStartCol: scout.col, scoutStartRow: scout.row },
        }),
      ),
    ).toBe(true);
  });

  it("skips move scout when the player already founded a city", () => {
    const state = createGame({ seed: "coach2b", cols: 20, rows: 14, humanSlots: 1, playerCount: 2 });
    beginTurn(state);
    const viewerId = state.players[0]!.id;
    const settler = [...state.units.values()].find((u) => u.ownerId === viewerId && u.type === "settler")!;
    applyCommand(state, { type: "foundCity", unitId: settler.id });
    const step = stepsForTurn(1, { state, viewerId, turn: 1 }).find((s) => s.id === "t1_move_scout")!;
    expect(step.isDone(coachCtx(state, viewerId, 1))).toBe(true);
  });

  it("detects city founded on turn 1", () => {
    const state = createGame({ seed: "coach3", cols: 20, rows: 14, humanSlots: 1, playerCount: 2 });
    beginTurn(state);
    const viewerId = state.players[0]!.id;
    const city: City = {
      id: 99,
      name: "Test",
      ownerId: viewerId,
      col: 5,
      row: 5,
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
      hp: 100,
      lastAttackedTurn: -1,
      rangedAttackUsed: false,
      modifiers: [],
    };
    state.cities.set(city.id, city);
    const step = stepsForTurn(1, { state, viewerId, turn: 1 }).find((s) => s.id === "t1_found_city")!;
    expect(step.isDone(coachCtx(state, viewerId, 1))).toBe(true);
  });

  it("detects any queued training on turn 1 (not only scouts)", () => {
    const state = createGame({ seed: "coach4", cols: 20, rows: 14, humanSlots: 1, playerCount: 2 });
    beginTurn(state);
    const viewerId = state.players[0]!.id;
    const settler = [...state.units.values()].find((u) => u.ownerId === viewerId && u.type === "settler")!;
    applyCommand(state, { type: "foundCity", unitId: settler.id });
    const city = [...state.cities.values()].find((c) => c.ownerId === viewerId)!;
    city.population = 3;
    startTraining(state, city, "settler");
    const step = stepsForTurn(1, { state, viewerId, turn: 1 }).find((s) => s.id === "t1_train_unit")!;
    expect(
      step.isDone(
        coachCtx(state, viewerId, 1, {
          selectedCityId: city.id,
        }),
      ),
    ).toBe(true);
  });

  it("skips train step when the city cannot queue any unit", () => {
    const state = createGame({ seed: "coach5", cols: 20, rows: 14, humanSlots: 1, playerCount: 2 });
    beginTurn(state);
    const viewerId = state.players[0]!.id;
    const settler = [...state.units.values()].find((u) => u.ownerId === viewerId && u.type === "settler")!;
    applyCommand(state, { type: "foundCity", unitId: settler.id });
    const city = [...state.cities.values()].find((c) => c.ownerId === viewerId)!;
    city.population = 1;
    const step = stepsForTurn(1, { state, viewerId, turn: 1 }).find((s) => s.id === "t1_train_unit")!;
    expect(step.isDone(coachCtx(state, viewerId, 1, { selectedCityId: city.id }))).toBe(true);
  });

  it("does not repeat the barbarian briefing after it was shown once", () => {
    const state = createGame({ seed: "coach-barb2", cols: 20, rows: 14, humanSlots: 1, playerCount: 2, barbarians: true });
    beginTurn(state);
    const viewerId = state.players[0]!.id;
    const scout = [...state.units.values()].find((u) => u.ownerId === viewerId && u.type === "scout")!;
    const tile = state.map.tiles.find((t) => t.feature === "barb_camp");
    expect(tile).toBeDefined();
    scout.col = tile!.col;
    scout.row = tile!.row;
    const flags: TutorialCoachFlags = {
      barbarianExplained: true,
      enemyExplained: false,
      initialMetCount: 0,
      infoAcknowledged: false,
    };
    const steps = buildTutorialSteps(3, coachCtx(state, viewerId, 3, { flags }));
    expect(steps.some((s) => s.id === "spot_barbarian")).toBe(false);
  });

  it("keeps an in-progress barbarian briefing until the player taps through", () => {
    const state = createGame({ seed: "coach-barb3", cols: 20, rows: 14, humanSlots: 1, playerCount: 2, barbarians: true });
    beginTurn(state);
    const viewerId = state.players[0]!.id;
    const scout = [...state.units.values()].find((u) => u.ownerId === viewerId && u.type === "scout")!;
    const tile = state.map.tiles.find((t) => t.feature === "barb_camp");
    scout.col = tile!.col;
    scout.row = tile!.row;
    const flags: TutorialCoachFlags = {
      barbarianExplained: true,
      enemyExplained: false,
      initialMetCount: 0,
      infoAcknowledged: false,
    };
    const inProgress = new Set(["spot_barbarian"] as const);
    const steps = buildTutorialSteps(2, coachCtx(state, viewerId, 2, { flags }), inProgress);
    expect(steps[0]?.id).toBe("spot_barbarian");
  });

  it("detects fighter movement for whichever starting fighter the player moves", () => {
    const state = createGame({ seed: "coach-warriors", cols: 20, rows: 14, humanSlots: 1, playerCount: 2 });
    beginTurn(state);
    const viewerId = state.players[0]!.id;
    const fighters = unitsOf(state, viewerId).filter((u) => u.type !== "scout" && u.type !== "settler");
    expect(fighters.length).toBeGreaterThanOrEqual(2);
    const moved = fighters[1]!;
    moved.movementLeft = 0;
    const step = stepsForTurn(1, { state, viewerId, turn: 1 }).find((s) => s.id === "t1_move_warrior")!;
    const snaps = fighters.map((u) => ({
      id: u.id,
      type: u.type,
      move: u.movementLeft + (u.id === moved.id ? 1 : 0),
      col: u.col,
      row: u.row,
    }));
    expect(step.isDone(coachCtx(state, viewerId, 1, { marks: { unitSnapshots: snaps } }))).toBe(true);
  });

  it("inserts a barbarian briefing when a camp is visible", () => {
    const state = createGame({ seed: "coach-barb", cols: 20, rows: 14, humanSlots: 1, playerCount: 2, barbarians: true });
    beginTurn(state);
    const viewerId = state.players[0]!.id;
    const scout = [...state.units.values()].find((u) => u.ownerId === viewerId && u.type === "scout")!;
    const tile = state.map.tiles.find((t) => t.feature === "barb_camp");
    expect(tile).toBeDefined();
    scout.col = tile!.col;
    scout.row = tile!.row;
    expect(visibleBarbarianThreat(state, viewerId)).toBe(true);
    const steps = buildTutorialSteps(2, coachCtx(state, viewerId, 2));
    expect(steps[0]?.id).toBe("spot_barbarian");
  });

  it("inserts an enemy briefing after first contact", () => {
    const state = createGame({ seed: "coach-enemy", cols: 20, rows: 14, humanSlots: 1, playerCount: 2 });
    beginTurn(state);
    const viewerId = state.players[0]!.id;
    const rivalId = state.players.find((p) => p.id !== viewerId && !p.isBarbarian)!.id;
    ensureContact(state, viewerId, rivalId);
    const steps = buildTutorialSteps(3, coachCtx(state, viewerId, 3));
    expect(steps.some((s) => s.id === "spot_enemy")).toBe(true);
  });

  it("does not rewind to select-scout after the scout is deselected", () => {
    const state = createGame({ seed: "coach-rewind", cols: 20, rows: 14, humanSlots: 1, playerCount: 2 });
    beginTurn(state);
    const viewerId = state.players[0]!.id;
    const scout = [...state.units.values()].find((u) => u.ownerId === viewerId && u.type === "scout")!;
    const steps = buildTutorialSteps(1, coachCtx(state, viewerId, 1));
    const completed = new Set<typeof steps[0]["id"]>(["t1_select_scout"]);
    const selectStep = steps.find((s) => s.id === "t1_select_scout")!;
    expect(selectStep.isDone(coachCtx(state, viewerId, 1, { selectedUnitId: scout.id }))).toBe(true);
    expect(selectStep.isDone(coachCtx(state, viewerId, 1, { selectedUnitId: null }))).toBe(false);

    let stepIndex = 0;
    while (stepIndex < steps.length) {
      const candidate = steps[stepIndex]!;
      if (completed.has(candidate.id)) {
        stepIndex++;
        continue;
      }
      if (candidate.isDone(coachCtx(state, viewerId, 1, { selectedUnitId: null }))) {
        completed.add(candidate.id);
        stepIndex++;
        continue;
      }
      break;
    }
    expect(steps[stepIndex]?.id).toBe("t1_move_scout");
  });
});
