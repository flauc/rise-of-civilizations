import { describe, it, expect } from "vitest";
import { createGame } from "./setup";
import { applyCommand } from "./commands";
import { updateExplored } from "./visibility";
import {
  naturalWonderYields,
  naturalWonderCulture,
  checkNaturalWonderDiscovery,
  placeNaturalWonders,
} from "./natural-wonders";
import { getCityYields } from "./economy";
import { citiesOf, unitsOf } from "./state";
import { getTile } from "@roc/shared";
import { getNaturalWonder, NATURAL_WONDER_IDS } from "@roc/data";

function foundCapital(state: ReturnType<typeof createGame>) {
  const settler = unitsOf(state, 0).find((u) => u.type === "settler")!;
  applyCommand(state, { type: "foundCity", unitId: settler.id }, 0);
  return citiesOf(state, 0)[0]!;
}

describe("natural wonders", () => {
  it("places several single-tile natural wonders on the map", () => {
    const state = createGame({ seed: "nw-map", cols: 48, rows: 32, barbarians: false, naturalWonders: true });
    expect(state.naturalWonderIds.length).toBeGreaterThan(5);
    // Every placed wonder occupies exactly one tile and is a known def.
    for (const id of state.naturalWonderIds) {
      expect(getNaturalWonder(id)).toBeDefined();
      const tiles = state.map.tiles.filter((t) => t.naturalWonder === id);
      expect(tiles.length).toBe(1);
    }
  });

  it("placement is deterministic for the same seed", () => {
    const a = createGame({ seed: "nw-det", cols: 44, rows: 30, barbarians: false, naturalWonders: true });
    const b = createGame({ seed: "nw-det", cols: 44, rows: 30, barbarians: false, naturalWonders: true });
    const key = (s: typeof a) => s.map.tiles.map((t) => `${t.col},${t.row}:${t.naturalWonder ?? ""}`).join("|");
    expect(key(a)).toBe(key(b));
  });

  it("a wonder tile yields its bonus output when worked", () => {
    const state = createGame({ seed: "nw-yield", cols: 30, rows: 20, barbarians: false });
    const tile = getTile(state.map, 5, 5)!;
    tile.naturalWonder = "great_barrier_reef";
    const def = getNaturalWonder("great_barrier_reef")!;
    const y = naturalWonderYields(tile);
    expect(y.food).toBe(def.tileYields.food ?? 0);
    expect(y.gold).toBe(def.tileYields.gold ?? 0);
    expect(y.science).toBe(def.tileYields.science ?? 0);
    expect(naturalWonderCulture(getTile(state.map, 5, 5)!)).toBe(def.tileYields.culture ?? 0);
  });

  it("a worked wonder tile raises the city's yields", () => {
    const state = createGame({ seed: "nw-city", cols: 30, rows: 20, barbarians: false });
    const city = foundCapital(state);
    const tile = getTile(state.map, city.col + 1, city.row)!;
    tile.terrain = "grassland";
    tile.naturalWonder = "victoria_falls"; // +2 culture, +1 food
    tile.ownerCityId = city.id;

    const before = getCityYields(state, city);
    city.lockedTiles = [`${tile.col},${tile.row}`];
    city.workedTiles = [`${tile.col},${tile.row}`];
    const after = getCityYields(state, city);
    expect(after.culture).toBeGreaterThan(before.culture);
  });

  it("the first civ to sight a wonder claims its one-time bonus, announced world-wide", () => {
    const state = createGame({ seed: "nw-discover", cols: 30, rows: 20, barbarians: false });
    const tile = getTile(state.map, 6, 6)!;
    tile.naturalWonder = "mount_everest";
    // A second, far-off wonder nobody has sighted keeps the "all wonders" grand
    // bonus from also firing, so we measure the single discovery in isolation.
    getTile(state.map, 20, 14)!.naturalWonder = "dead_sea";
    state.naturalWonderIds = ["mount_everest", "dead_sea"];
    state.discoveredWonders = {};
    state.allNaturalWondersClaimedBy = undefined;
    for (const p of state.players) p.explored.clear(); // control vision exactly

    const player = state.players[0]!;
    const def = getNaturalWonder("mount_everest")!;
    const scienceBefore = player.scienceProgress;
    const faithBefore = player.faith;

    player.explored.add("6,6");
    checkNaturalWonderDiscovery(state, 0);

    expect(state.discoveredWonders["mount_everest"]).toBe(0);
    expect(player.scienceProgress).toBe(scienceBefore + (def.discoveryBonus.science ?? 0));
    expect(player.faith).toBe(faithBefore + (def.discoveryBonus.faith ?? 0));
    const entry = state.log.find((l) => l.message.includes("Mount Everest"));
    expect(entry?.world).toBe(true);
    // The discovery carries rich dialog data: wonder name, bonus text, and (since
    // it's this civ's first wonder) the grand "all wonders" incentive text.
    expect(entry?.wonder?.wonderId).toBe("mount_everest");
    expect(entry?.wonder?.bonusText).toContain("science");
    expect(entry?.wonder?.firstDiscovery).toBe(true);
    expect(entry?.wonder?.allBonusText).toBeTruthy();

    // A second civ sighting it later does NOT re-award the bonus.
    const p2 = state.players[1]!;
    const p2Science = p2.scienceProgress;
    p2.explored.add("6,6");
    checkNaturalWonderDiscovery(state, 1);
    expect(state.discoveredWonders["mount_everest"]).toBe(0);
    expect(p2.scienceProgress).toBe(p2Science);
  });

  it("awards the grand bonus to the first civ to sight every wonder", () => {
    const state = createGame({ seed: "nw-all", cols: 30, rows: 20, barbarians: false });
    // Reduce the world to two single-tile wonders for a deterministic test.
    for (const t of state.map.tiles) t.naturalWonder = undefined;
    getTile(state.map, 3, 3)!.naturalWonder = "uluru";
    getTile(state.map, 8, 8)!.naturalWonder = "dead_sea";
    state.naturalWonderIds = ["uluru", "dead_sea"];
    state.discoveredWonders = {};
    state.allNaturalWondersClaimedBy = undefined;
    for (const p of state.players) p.explored.clear(); // control vision exactly

    const player = state.players[0]!;
    player.explored.add("3,3");
    checkNaturalWonderDiscovery(state, 0);
    expect(state.allNaturalWondersClaimedBy).toBeUndefined();

    const goldBefore = player.gold;
    player.explored.add("8,8");
    checkNaturalWonderDiscovery(state, 0);
    expect(state.allNaturalWondersClaimedBy).toBe(0);
    expect(player.gold).toBeGreaterThan(goldBefore);
    expect(state.log.some((l) => l.world && l.message.includes("every natural wonder"))).toBe(true);
  });

  it("discovery flows through a unit move + updateExplored", () => {
    const state = createGame({ seed: "nw-move", cols: 30, rows: 20, barbarians: false });
    // Plant a wonder right next to a unit, then refresh vision.
    const warrior = unitsOf(state, 0).find((u) => u.type === "warrior")!;
    const here = getTile(state.map, warrior.col, warrior.row)!;
    here.naturalWonder = "uluru";
    state.naturalWonderIds = ["uluru"];
    state.discoveredWonders = {};
    updateExplored(state, 0);
    expect(state.discoveredWonders["uluru"]).toBe(0);
  });

  it("placeNaturalWonders keeps wonders away from start positions", () => {
    const state = createGame({ seed: "nw-starts", cols: 40, rows: 28, barbarians: false, naturalWonders: true });
    // Every wonder id placed is a known def.
    expect(state.naturalWonderIds.length).toBeGreaterThan(0);
    for (const id of state.naturalWonderIds) {
      expect(NATURAL_WONDER_IDS).toContain(id);
    }
  });
});
