import { describe, it, expect } from "vitest";
import { getTile } from "@roc/shared";
import { createGame } from "./setup";
import { beginTurn, applyCommand } from "./commands";
import { advanceWorks, startWork, nextTierAt, workLabourFor } from "./works";
import { workerSlots, specialistLabour } from "./specialists";
import { citiesOf, unitsOf, type City } from "./state";

function gameWithCity(): { s: ReturnType<typeof createGame>; city: City } {
  const s = createGame({ seed: "works-test", cols: 40, rows: 28, barbarians: false, humanSlots: 1, playerCount: 1 });
  beginTurn(s);
  const settler = unitsOf(s, 0).find((u) => u.type === "settler")!;
  applyCommand(s, { type: "foundCity", unitId: settler.id });
  const city = citiesOf(s, 0)[0]!;
  city.population = 5; // room for craftsmen + workers
  return { s, city };
}

/** Make tile (col,row) a grassland tile owned by `city`. */
function grasslandTile(s: ReturnType<typeof createGame>, city: City, col: number, row: number) {
  const t = getTile(s.map, col, row)!;
  t.terrain = "grassland";
  t.improvement = undefined;
  t.improvementLevel = undefined;
  t.ownerCityId = city.id;
  return t;
}

describe("specialists & works", () => {
  it("trains a craftsman (reducing worker slots) and builds a farm over several turns", () => {
    const { s, city } = gameWithCity();
    const before = workerSlots(city);
    expect(applyCommand(s, { type: "convertCitizen", cityId: city.id, specialistId: "carpenter", delta: 1 }).ok).toBe(true);
    expect(city.specialists).toHaveLength(1);
    expect(workerSlots(city)).toBe(before - 1);

    const tile = grasslandTile(s, city, city.col + 1, city.row);
    expect(nextTierAt(tile, "farm")).toBe(1);
    expect(startWork(s, 0, "farm", tile.col, tile.row).ok).toBe(true);

    // Run turns of labour until the farm is built (guard against runaway loops).
    let guard = 0;
    while (s.works.length > 0 && guard++ < 30) advanceWorks(s, 0);
    expect(tile.improvement).toBe("farm");
    expect(tile.improvementLevel).toBe(1);
    // The carpenter earned XP on the job and levelled up.
    expect(city.specialists[0]!.level).toBeGreaterThanOrEqual(2);
  });

  it("scales labour cost with distance from the city", () => {
    const { s, city } = gameWithCity();
    const near = workLabourFor(s, "farm", 1, city, city.col + 1, city.row).carpentry!;
    const far = workLabourFor(s, "farm", 1, city, city.col + 3, city.row).carpentry!;
    expect(far).toBeGreaterThan(near);
  });

  it("upgrades an improvement through its tiers (each a separate work)", () => {
    const { s, city } = gameWithCity();
    applyCommand(s, { type: "convertCitizen", cityId: city.id, specialistId: "carpenter", delta: 1 });
    const tile = grasslandTile(s, city, city.col + 1, city.row);
    // build tier 1
    startWork(s, 0, "farm", tile.col, tile.row);
    let guard = 0;
    while (s.works.length > 0 && guard++ < 40) advanceWorks(s, 0);
    expect(tile.improvementLevel).toBe(1);
    // now an upgrade to tier 2 is available
    expect(nextTierAt(tile, "farm")).toBe(2);
    expect(startWork(s, 0, "farm", tile.col, tile.row).ok).toBe(true);
    guard = 0;
    while (s.works.length > 0 && guard++ < 40) advanceWorks(s, 0);
    expect(tile.improvementLevel).toBe(2);
    // a tier-1 farm yields less food than a tier-3; tier 2 is the next rung
    expect(nextTierAt(tile, "farm")).toBe(3);
  });

  it("higher-level specialists contribute more labour", () => {
    const { city } = gameWithCity();
    const s1 = { id: 1, type: "carpenter", xp: 0, level: 1 };
    const s5 = { id: 2, type: "carpenter", xp: 0, level: 5 };
    expect(specialistLabour(s5)).toBeGreaterThan(specialistLabour(s1));
    expect(specialistLabour(s1)).toBe(1);
    void city;
  });

  it("refuses to train more craftsmen than the city has citizens", () => {
    const { s, city } = gameWithCity();
    city.population = 1;
    city.specialists = [];
    expect(applyCommand(s, { type: "convertCitizen", cityId: city.id, specialistId: "carpenter", delta: 1 }).ok).toBe(true);
    // city of 1 now fully committed
    expect(applyCommand(s, { type: "convertCitizen", cityId: city.id, specialistId: "carpenter", delta: 1 }).ok).toBe(false);
  });
});
