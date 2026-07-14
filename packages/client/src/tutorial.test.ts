import { describe, it, expect } from "vitest";
import {
  TUTORIAL_CIV_ID,
  TUTORIAL_MAP_SIZE,
  TUTORIAL_MAP_TYPE,
  createTutorialSetup,
  seedTutorialSurroundings,
  spawnTutorialBarbarian,
  spawnTutorialVillage,
  refreshTutorialMovement,
  TUTORIAL_MOVE_STEP_IDS,
  canReachTileWithFullMovement,
  nearestReachableTutorialVillage,
  isTutorialVillageStepDone,
  ensureReachableTutorialVillage,
  nearestReachableTutorialVillageNow,
} from "./tutorial";
import { TOGGLEABLE_VICTORIES, applyCommand, beginTurn, computeVisible, createGame, unitMaxHp, unitsOf } from "@roc/sim";
import { axialDistance, offsetToAxial } from "@roc/shared";

function tutorialState() {
  const state = createGame({
    seed: "tutorial-seeding",
    cols: 24,
    rows: 16,
    mapType: "pangaea",
    humanSlots: 1,
    playerCount: 2,
    barbarians: "minimal",
    villages: true,
  });
  beginTurn(state);
  return state;
}

describe("tutorial preset", () => {
  it("uses a small one-continent map with one AI, minimal barbarians, normal speed, and features on", () => {
    const setup = createTutorialSetup();
    expect(TUTORIAL_MAP_SIZE).toBe("small");
    expect(TUTORIAL_MAP_TYPE).toBe("pangaea");
    expect(setup.mapSize).toBe("small");
    expect(setup.mapType).toBe("pangaea");
    expect(setup.aiCivIds).toEqual([null]);
    expect(setup.barbarianLevel).toBe("minimal");
    expect(setup.gameSpeed).toBe("normal");
    expect(setup.villages).toBe("medium");
    expect(setup.naturalWonders).toBe(true);
    expect(setup.legends).toBe(true);
    expect(setup.startingGold).toBe("balanced");
    expect(setup.turnLimit).toBe(120);
    expect(setup.enabledVictories).toEqual([...TOGGLEABLE_VICTORIES]);
    expect(setup.isTutorial).toBe(true);
  });

  it("puts the player on the Indus Valley", () => {
    expect(TUTORIAL_CIV_ID).toBe("indus_valley");
  });

  it("seeds a far camp at start but no NEARBY village or barbarian (those come on demand)", () => {
    const state = tutorialState();
    const human = state.players.find((p) => p.isHuman)!;
    const home = unitsOf(state, human.id).find((u) => u.type === "settler") ?? unitsOf(state, human.id)[0]!;
    const homeAx = offsetToAxial({ col: home.col, row: home.row });
    const dist = (col: number, row: number) => axialDistance(homeAx, offsetToAxial({ col, row }));
    const barb = state.players.find((p) => p.isBarbarian)!;

    const nearVillageBefore = state.map.tiles.some((t) => t.feature === "village" && dist(t.col, t.row) <= 3);
    const nearBarbBefore = [...state.units.values()].some((u) => u.ownerId === barb.id && dist(u.col, u.row) <= 3);

    seedTutorialSurroundings(state);

    expect(state.map.tiles.some((t) => t.feature === "barb_camp" && dist(t.col, t.row) <= 6)).toBe(true);
    // Seeding does not add a nearby village or barbarian — they can't be collected/fought early.
    expect(state.map.tiles.some((t) => t.feature === "village" && dist(t.col, t.row) <= 3)).toBe(nearVillageBefore);
    expect([...state.units.values()].some((u) => u.ownerId === barb.id && dist(u.col, u.row) <= 3)).toBe(nearBarbBefore);
  });

  it("spawns a reachable visible village on demand, once", () => {
    const state = tutorialState();
    const human = state.players.find((p) => p.isHuman)!;
    const settler = unitsOf(state, human.id).find((u) => u.type === "settler")!;
    applyCommand(state, { type: "foundCity", unitId: settler.id });

    expect(spawnTutorialVillage(state)).toBe(true);
    const target = nearestReachableTutorialVillage(state, human.id);
    expect(target).toBeDefined();
    expect(canReachTileWithFullMovement(state, human.id, target!.col, target!.row)).toBe(true);
    const visible = computeVisible(state, human.id);
    expect(visible.has(`${target!.col},${target!.row}`)).toBe(true);
    // Idempotent while a reachable visible village already exists.
    expect(spawnTutorialVillage(state)).toBe(false);
  });

  it("places the village within reach of roaming units, not only the capital", () => {
    const state = tutorialState();
    const human = state.players.find((p) => p.isHuman)!;
    const settler = unitsOf(state, human.id).find((u) => u.type === "settler")!;
    applyCommand(state, { type: "foundCity", unitId: settler.id });
    const scout = unitsOf(state, human.id).find((u) => u.type === "scout")!;
    for (const u of unitsOf(state, human.id)) {
      u.col = scout.col + 6;
      u.row = scout.row + 2;
    }
    refreshTutorialMovement(state, human.id, "t3_village");
    // Visibility shifts when units roam — strip every village so spawn recomputes from units.
    for (const t of state.map.tiles) {
      if (t.feature === "village") t.feature = undefined;
    }

    expect(spawnTutorialVillage(state)).toBe(true);
    const target = nearestReachableTutorialVillage(state, human.id)!;
    expect(canReachTileWithFullMovement(state, human.id, target.col, target.row)).toBe(true);
  });

  it("spawns a weakened, reachable barbarian near the capital on demand, once", () => {
    const state = tutorialState();
    const human = state.players.find((p) => p.isHuman)!;
    const settler = unitsOf(state, human.id).find((u) => u.type === "settler")!;
    applyCommand(state, { type: "foundCity", unitId: settler.id });
    const capital = state.cities.values().next().value!;
    const capAx = offsetToAxial({ col: capital.col, row: capital.row });
    const dist = (col: number, row: number) => axialDistance(capAx, offsetToAxial({ col, row }));
    const barb = state.players.find((p) => p.isBarbarian)!;

    expect(spawnTutorialBarbarian(state)).toBe(true);
    const raider = [...state.units.values()].find((u) => u.ownerId === barb.id && dist(u.col, u.row) <= 3);
    expect(raider).toBeDefined();
    expect(raider!.hp).toBeLessThan(unitMaxHp(raider!));
    // Idempotent while a barbarian is already close.
    expect(spawnTutorialBarbarian(state)).toBe(false);
  });

  it("refreshes movement for all owned units when a map-action coach step begins", () => {
    const state = tutorialState();
    const human = state.players.find((p) => p.isHuman)!;
    for (const u of unitsOf(state, human.id)) u.movementLeft = 0;
    refreshTutorialMovement(state, human.id, "t3_village");
    expect(unitsOf(state, human.id).every((u) => u.movementLeft > 0)).toBe(true);
    expect(TUTORIAL_MOVE_STEP_IDS.has("t3_village")).toBe(true);
    expect(TUTORIAL_MOVE_STEP_IDS.has("t1_intro")).toBe(false);
  });

  it("advances the village step when no unit can reach it and movement is spent", () => {
    const state = tutorialState();
    const human = state.players.find((p) => p.isHuman)!;
    const settler = unitsOf(state, human.id).find((u) => u.type === "settler")!;
    applyCommand(state, { type: "foundCity", unitId: settler.id });
    ensureReachableTutorialVillage(state);
    for (const u of unitsOf(state, human.id)) u.movementLeft = 0;
    expect(isTutorialVillageStepDone(state, human.id)).toBe(true);
  });

  it("keeps the village step active while a reachable target still has movement", () => {
    const state = tutorialState();
    const human = state.players.find((p) => p.isHuman)!;
    const settler = unitsOf(state, human.id).find((u) => u.type === "settler")!;
    applyCommand(state, { type: "foundCity", unitId: settler.id });
    ensureReachableTutorialVillage(state);
    refreshTutorialMovement(state, human.id, "t3_village");
    expect(nearestReachableTutorialVillageNow(state, human.id)).toBeDefined();
    expect(isTutorialVillageStepDone(state, human.id)).toBe(false);
  });
});
