import { describe, it, expect } from "vitest";
import {
  TUTORIAL_CIV_ID,
  TUTORIAL_MAP_SIZE,
  TUTORIAL_MAP_TYPE,
  createTutorialSetup,
  seedTutorialSurroundings,
  spawnTutorialBarbarian,
  spawnTutorialVillage,
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
    expect(setup.villages).toBe(true);
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

  it("spawns a visible village near the capital on demand, once", () => {
    const state = tutorialState();
    const human = state.players.find((p) => p.isHuman)!;
    const settler = unitsOf(state, human.id).find((u) => u.type === "settler")!;
    applyCommand(state, { type: "foundCity", unitId: settler.id });
    const capital = state.cities.values().next().value!;
    const capAx = offsetToAxial({ col: capital.col, row: capital.row });
    const dist = (col: number, row: number) => axialDistance(capAx, offsetToAxial({ col, row }));

    expect(spawnTutorialVillage(state)).toBe(true);
    const visible = computeVisible(state, human.id);
    const village = state.map.tiles.find(
      (t) => t.feature === "village" && dist(t.col, t.row) <= 3 && visible.has(`${t.col},${t.row}`),
    );
    expect(village).toBeDefined();
    // Idempotent while a visible village is already close.
    expect(spawnTutorialVillage(state)).toBe(false);
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
});
