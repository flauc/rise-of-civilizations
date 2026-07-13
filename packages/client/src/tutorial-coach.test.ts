import { describe, it, expect } from "vitest";
import { createGame, beginTurn, applyCommand, startTraining, ensureContact, unitsOf, type City } from "@roc/sim";
import { TUTORIAL_COACH_TURNS } from "./tutorial";
import {
  buildTutorialSteps,
  stepsForTurn,
  isEndTurnStep,
  visibleBarbarianThreat,
  gateSelectorsForStep,
  gateAllowsCanvas,
  isTutorialDismissControl,
  type TutorialCoachContext,
  type TutorialCoachFlags,
} from "./tutorial-coach";

/** The camp tile the generator placed, or one planted on land — camp placement
 *  depends on the rolled terrain, and these tests only care that a camp exists. */
function ensureBarbCamp(state: ReturnType<typeof createGame>) {
  let tile = state.map.tiles.find((t) => t.feature === "barb_camp");
  if (!tile) {
    tile = state.map.tiles.find(
      (t) => !["ocean", "coast", "lake", "mountains", "volcano"].includes(t.terrain) && !t.feature,
    )!;
    tile.feature = "barb_camp";
  }
  return tile;
}

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

  it("has steps for every turn: 1-4 end with end turn, 5 ends with the choice", () => {
    const state = createGame({ seed: "coach-turns", cols: 20, rows: 14, humanSlots: 1, playerCount: 2 });
    beginTurn(state);
    const viewerId = state.players[0]!.id;
    for (let t = 1; t <= 4; t++) {
      const steps = buildTutorialSteps(t, coachCtx(state, viewerId, t));
      expect(steps.length).toBeGreaterThan(0);
      expect(isEndTurnStep(steps[steps.length - 1])).toBe(true);
    }
    const finale = buildTutorialSteps(5, coachCtx(state, viewerId, 5));
    expect(finale[finale.length - 1]!.id).toBe("t5_choice");
    expect(finale[finale.length - 1]!.choice).toBe(true);
  });

  it("opens turn 1 with Herodotus introducing himself and the Indus Valley", () => {
    const state = createGame({ seed: "coach-intro", cols: 20, rows: 14, humanSlots: 1, playerCount: 2 });
    beginTurn(state);
    const viewerId = state.players[0]!.id;
    const steps = buildTutorialSteps(1, coachCtx(state, viewerId, 1));
    expect(steps[0]!.id).toBe("t1_intro");
    expect(steps[0]!.infoOnly).toBe(true);
    expect(steps[0]!.message).toContain("Herodotus");
    expect(steps[0]!.message).toContain("father of history");
    expect(steps[0]!.message).toContain("Indus Valley");
    expect(steps[0]!.isDone(coachCtx(state, viewerId, 1))).toBe(false);
    const acknowledged = coachCtx(state, viewerId, 1);
    acknowledged.flags.infoAcknowledged = true;
    expect(steps[0]!.isDone(acknowledged)).toBe(true);
  });

  it("briefs unit stats (incl. the scout's reach) and the full roster of kinds", () => {
    const state = createGame({ seed: "coach-kinds", cols: 20, rows: 14, humanSlots: 1, playerCount: 2 });
    beginTurn(state);
    const viewerId = state.players[0]!.id;
    const steps = buildTutorialSteps(1, coachCtx(state, viewerId, 1));
    const stats = steps.find((s) => s.id === "t1_unit_stats")!;
    expect(stats.infoOnly).toBe(true);
    expect(stats.message).toMatch(/movement/i);
    expect(stats.message).toMatch(/sight/i);
    expect(stats.message).toMatch(/strength/i);
    expect(stats.message).toMatch(/three tiles/i);
    const kinds = steps.find((s) => s.id === "t1_unit_kinds")!;
    expect(kinds.infoOnly).toBe(true);
    expect(kinds.message).toMatch(/cavalry/i);
    expect(kinds.message).toMatch(/siege/i);
    expect(kinds.message).toMatch(/ships|naval/i);
    expect(kinds.message).toMatch(/gunpowder/i);
  });

  it("explains the yields after founding and the next button before ending turn 1", () => {
    const state = createGame({ seed: "coach-yields", cols: 20, rows: 14, humanSlots: 1, playerCount: 2 });
    beginTurn(state);
    const viewerId = state.players[0]!.id;
    const ids = buildTutorialSteps(1, coachCtx(state, viewerId, 1)).map((s) => s.id);
    expect(ids.indexOf("t1_yields")).toBe(ids.indexOf("t1_found_city") + 1);
    const steps = buildTutorialSteps(1, coachCtx(state, viewerId, 1));
    const yields = steps.find((s) => s.id === "t1_yields")!;
    for (const word of ["Food", "Production", "Gold", "Science", "Culture", "faith"]) {
      expect(yields.message).toContain(word);
    }
    const next = steps.find((s) => s.id === "t1_next_button")!;
    expect(next.infoOnly).toBe(true);
    expect(next.message).toMatch(/even mid-turn/i);
    expect(ids.indexOf("t1_next_button")).toBe(ids.indexOf("t1_end_turn") - 1);
  });

  it("recommends Plant Cultivation as the first research and highlights it", () => {
    const state = createGame({ seed: "coach-research", cols: 20, rows: 14, humanSlots: 1, playerCount: 2 });
    beginTurn(state);
    const viewerId = state.players[0]!.id;
    const pick = buildTutorialSteps(1, coachCtx(state, viewerId, 1)).find((s) => s.id === "t1_pick_research")!;
    expect(pick.message).toContain("Plant Cultivation");
    expect(pick.targets?.[0]).toContain("cultivation");
  });

  it("gates guided steps to the map or a menu but never during free play", () => {
    const state = createGame({ seed: "coach-gate", cols: 20, rows: 14, humanSlots: 1, playerCount: 2 });
    beginTurn(state);
    const viewerId = state.players[0]!.id;
    const steps = buildTutorialSteps(1, coachCtx(state, viewerId, 1));
    const byId = (id: string) => steps.find((s) => s.id === id)!;
    expect(gateAllowsCanvas(byId("t1_move_scout"))).toBe(true);
    expect(gateAllowsCanvas(byId("t1_pick_research"))).toBe(false);
    // Panels are id elements (#research), not classes — the gate must allow the
    // real element or clicks inside the opened panel get swallowed.
    expect(gateSelectorsForStep(byId("t1_pick_research"))).toContain("#research");
    expect(gateSelectorsForStep(byId("t1_end_turn"))).toContain("#endturn");
    // Info-only briefings expose no HUD targets — only the coach bubble is live.
    expect(gateSelectorsForStep(byId("t1_intro"))).toHaveLength(0);
  });

  it("always allows dialog close buttons through the interaction gate", () => {
    const stubBtn = (opts: { id?: string; classes?: string[]; ariaLabel?: string }): Element => {
      const btn = {
        id: opts.id ?? "",
        classList: { contains: (c: string) => opts.classes?.includes(c) ?? false },
        getAttribute: (n: string) => (n === "aria-label" ? opts.ariaLabel ?? null : null),
        closest: (sel: string) => (sel === "button" ? btn : null),
      };
      return btn as unknown as Element;
    };
    expect(isTutorialDismissControl(stubBtn({ id: "trclose", classes: ["panel-close"] }))).toBe(true);
    expect(isTutorialDismissControl(stubBtn({ id: "turn-update-close", classes: ["dialog-x"] }))).toBe(
      true,
    );
    expect(isTutorialDismissControl(stubBtn({ id: "emp-close", classes: ["emp-x"] }))).toBe(true);
    expect(isTutorialDismissControl(stubBtn({ id: "next-unit" }))).toBe(false);
  });

  it("marks city construction and training steps as speak-then-hide", () => {
    const state = createGame({ seed: "coach-speak-hide", cols: 20, rows: 14, humanSlots: 1, playerCount: 2 });
    beginTurn(state);
    const viewerId = state.players[0]!.id;
    const t1 = buildTutorialSteps(1, coachCtx(state, viewerId, 1));
    for (const id of [
      "t1_select_city",
      "t1_open_construction",
      "t1_pick_build",
      "t1_open_train",
      "t1_train_unit",
    ]) {
      expect(t1.find((s) => s.id === id)?.speakThenHide).toBe(true);
    }
    const t2 = buildTutorialSteps(2, coachCtx(state, viewerId, 2));
    expect(t2.find((s) => s.id === "t2_check_city")?.speakThenHide).toBe(true);
  });

  it("briefs unit kinds AFTER selecting the scout but BEFORE moving it", () => {
    const state = createGame({ seed: "coach-order", cols: 20, rows: 14, humanSlots: 1, playerCount: 2 });
    beginTurn(state);
    const viewerId = state.players[0]!.id;
    const ids = buildTutorialSteps(1, coachCtx(state, viewerId, 1)).map((s) => s.id);
    const sel = ids.indexOf("t1_select_scout");
    const kinds = ids.indexOf("t1_unit_kinds");
    const move = ids.indexOf("t1_move_scout");
    expect(sel).toBeGreaterThanOrEqual(0);
    expect(kinds).toBeGreaterThan(sel);
    expect(move).toBeGreaterThan(kinds);
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
    const tile = ensureBarbCamp(state);
    scout.col = tile.col;
    scout.row = tile.row;
    const flags: TutorialCoachFlags = {
      barbarianExplained: true,
      enemyExplained: false,
      initialMetCount: 0,
      infoAcknowledged: false,
    };
    const steps = buildTutorialSteps(3, coachCtx(state, viewerId, 3, { flags }));
    expect(steps.some((s) => s.id === "spot_barbarian")).toBe(false);
  });

  it("schedules the turn-2 combat arc: barbarians, briefing, attack, victory", () => {
    const state = createGame({ seed: "coach-barb3", cols: 20, rows: 14, humanSlots: 1, playerCount: 2, barbarians: true });
    beginTurn(state);
    const viewerId = state.players[0]!.id;
    const ids = buildTutorialSteps(2, coachCtx(state, viewerId, 2)).map((s) => s.id);
    const order = ["t2_check_city", "spot_barbarian", "t2_combat_brief", "t2_attack_barbarian", "t2_victory", "t2_end_turn"];
    expect(ids).toEqual(order);
  });

  it("completes the attack lesson when a snapshotted barbarian bleeds or dies", () => {
    const state = createGame({ seed: "coach-attack", cols: 20, rows: 14, humanSlots: 1, playerCount: 2, barbarians: true });
    beginTurn(state);
    const viewerId = state.players[0]!.id;
    const barb = state.players.find((p) => p.isBarbarian);
    expect(barb).toBeDefined();
    const raider = [...state.units.values()].find((u) => u.ownerId === barb!.id);
    const step = buildTutorialSteps(2, coachCtx(state, viewerId, 2)).find((s) => s.id === "t2_attack_barbarian")!;
    // No snapshot yet: nothing to teach with, the step self-skips.
    expect(step.isDone(coachCtx(state, viewerId, 2, { marks: { barbSnapshots: [] } }))).toBe(true);
    if (raider) {
      // Park the raider beside the player's warrior so it counts as "in reach".
      const fighter = unitsOf(state, viewerId).find((u) => u.type !== "scout" && u.type !== "settler")!;
      raider.col = fighter.col + 1;
      raider.row = fighter.row;
      // Untouched target: waiting for the strike.
      expect(
        step.isDone(coachCtx(state, viewerId, 2, { marks: { barbSnapshots: [{ id: raider.id, hp: raider.hp }] } })),
      ).toBe(false);
      // Bled: done.
      expect(
        step.isDone(coachCtx(state, viewerId, 2, { marks: { barbSnapshots: [{ id: raider.id, hp: raider.hp + 5 }] } })),
      ).toBe(true);
      // Dead: done.
      expect(
        step.isDone(coachCtx(state, viewerId, 2, { marks: { barbSnapshots: [{ id: -1, hp: 10 }] } })),
      ).toBe(true);
    }
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

  it("still detects a visible barbarian threat (used by the ring highlight)", () => {
    const state = createGame({ seed: "coach-barb", cols: 20, rows: 14, humanSlots: 1, playerCount: 2, barbarians: true });
    beginTurn(state);
    const viewerId = state.players[0]!.id;
    const scout = [...state.units.values()].find((u) => u.ownerId === viewerId && u.type === "scout")!;
    const tile = ensureBarbCamp(state);
    scout.col = tile.col;
    scout.row = tile.row;
    expect(visibleBarbarianThreat(state, viewerId)).toBe(true);
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
    const completed = new Set<typeof steps[0]["id"]>(["t1_intro", "t1_select_scout"]);
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
    // The unit-stats briefing follows selection (before moving); the point is it
    // does NOT rewind to select-scout just because the scout was deselected.
    expect(steps[stepIndex]?.id).not.toBe("t1_select_scout");
    expect(steps[stepIndex]?.id).toBe("t1_unit_stats");
  });
});
