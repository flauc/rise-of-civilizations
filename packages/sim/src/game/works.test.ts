import { describe, it, expect } from "vitest";
import { getTile } from "@roc/shared";
import { createGame } from "./setup";
import { beginTurn, applyCommand } from "./commands";
import {
  advanceWorks,
  startWork,
  nextTierAt,
  workLabourFor,
  workLabourPerTurn,
  workEtaTurns,
} from "./works";
import { workerSlots, specialistLabour } from "./specialists";
import { citiesOf, unitsOf, type City } from "./state";

/** Pin a city's specialist to a work via the command path. */
function assign(s: ReturnType<typeof createGame>, workId: number, specialistId: number, on = true): boolean {
  return applyCommand(s, { type: "assignSpecialist", workId, specialistId, on }).ok;
}

function gameWithCity(): { s: ReturnType<typeof createGame>; city: City } {
  const s = createGame({ seed: "works-test", cols: 40, rows: 28, barbarians: false, humanSlots: 1, playerCount: 1 });
  beginTurn(s);
  const settler = unitsOf(s, 0).find((u) => u.type === "settler")!;
  applyCommand(s, { type: "foundCity", unitId: settler.id });
  const city = citiesOf(s, 0)[0]!;
  city.population = 5; // room for craftsmen + workers
  return { s, city };
}

/** Make tile (col,row) a plain (non-river) grassland tile owned by `city`. */
function grasslandTile(s: ReturnType<typeof createGame>, city: City, col: number, row: number) {
  const t = getTile(s.map, col, row)!;
  t.terrain = "grassland";
  t.improvement = undefined;
  t.improvementLevel = undefined;
  t.river = undefined; // a plain field — farmable without Irrigation
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
    const work = startWork(s, 0, "farm", tile.col, tile.row);
    expect(work.ok).toBe(true);
    // Manual assignment: pin the carpenter to the new work.
    expect(assign(s, work.workId!, city.specialists[0]!.id)).toBe(true);

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
    const carpenterId = city.specialists[0]!.id;
    const tile = grasslandTile(s, city, city.col + 1, city.row);
    // build tier 1
    const t1 = startWork(s, 0, "farm", tile.col, tile.row);
    assign(s, t1.workId!, carpenterId);
    let guard = 0;
    while (s.works.length > 0 && guard++ < 40) advanceWorks(s, 0);
    expect(tile.improvementLevel).toBe(1);
    // now an upgrade to tier 2 is available; the carpenter is free again — reassign it
    expect(nextTierAt(tile, "farm")).toBe(2);
    const t2 = startWork(s, 0, "farm", tile.col, tile.row);
    expect(t2.ok).toBe(true);
    assign(s, t2.workId!, carpenterId);
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

  it("allows starting a work before any craftsman is trained (assignment is manual)", () => {
    const { s, city } = gameWithCity();
    const tile = grasslandTile(s, city, city.col + 1, city.row);
    // Carpentry is unlocked from the start, so a farm may be queued even with no
    // carpenter yet — the player trains and assigns one afterwards.
    expect(city.specialists).toHaveLength(0);
    expect(applyCommand(s, { type: "startWork", kind: "farm", col: tile.col, row: tile.row }).ok).toBe(true);
    expect(s.works).toHaveLength(1);
    // But it makes no progress while unstaffed.
    advanceWorks(s, 0);
    expect(s.works[0]!.progress.carpentry ?? 0).toBe(0);
  });

  it("refuses to start a work whose craft is not yet researched", () => {
    const { s, city } = gameWithCity();
    const tile = grasslandTile(s, city, city.col + 1, city.row);
    tile.terrain = "hills"; // mine terrain (needs the Mason craft → Masonry tech)
    expect(applyCommand(s, { type: "startWork", kind: "mine", col: tile.col, row: tile.row }).ok).toBe(false);
    expect(s.works).toHaveLength(0);
    // Once Masonry is researched the Mason craft is unlockable and the work is allowed.
    s.players[0]!.researched.add("masonry");
    expect(applyCommand(s, { type: "startWork", kind: "mine", col: tile.col, row: tile.row }).ok).toBe(true);
  });

  it("a work makes no progress until a specialist is assigned, then progresses", () => {
    const { s, city } = gameWithCity();
    applyCommand(s, { type: "convertCitizen", cityId: city.id, specialistId: "carpenter", delta: 1 });
    const tile = grasslandTile(s, city, city.col + 1, city.row);
    const work = startWork(s, 0, "farm", tile.col, tile.row);
    // Unassigned: a turn passes with zero progress.
    advanceWorks(s, 0);
    expect(s.works[0]!.progress.carpentry ?? 0).toBe(0);
    // Assign the carpenter: now labour accrues.
    assign(s, work.workId!, city.specialists[0]!.id);
    advanceWorks(s, 0);
    expect(s.works.length === 0 || (s.works[0]!.progress.carpentry ?? 0) > 0).toBe(true);
  });

  it("stacking specialists adds their labour and shortens the ETA", () => {
    const { s, city } = gameWithCity();
    city.population = 8;
    applyCommand(s, { type: "convertCitizen", cityId: city.id, specialistId: "carpenter", delta: 1 });
    applyCommand(s, { type: "convertCitizen", cityId: city.id, specialistId: "carpenter", delta: 1 });
    const [a, b] = city.specialists;
    // Use a distant tile so the requirement is several turns of labour.
    const tile = grasslandTile(s, city, city.col + 4, city.row);
    const work = startWork(s, 0, "farm", tile.col, tile.row);
    expect(work.ok, work.error).toBe(true);
    const w = s.works[0]!;

    assign(s, work.workId!, a!.id);
    const oneRate = workLabourPerTurn(s, w).carpentry!;
    const etaOne = workEtaTurns(s, w);

    assign(s, work.workId!, b!.id);
    const twoRate = workLabourPerTurn(s, w).carpentry!;
    expect(twoRate).toBeCloseTo(oneRate * 2);
    expect(workEtaTurns(s, w)).toBeLessThanOrEqual(etaOne);
  });

  it("releasing a specialist detaches it from its work", () => {
    const { s, city } = gameWithCity();
    applyCommand(s, { type: "convertCitizen", cityId: city.id, specialistId: "carpenter", delta: 1 });
    const tile = grasslandTile(s, city, city.col + 1, city.row);
    const work = startWork(s, 0, "farm", tile.col, tile.row);
    assign(s, work.workId!, city.specialists[0]!.id);
    expect(s.works[0]!.assignedSpecialistIds).toHaveLength(1);
    // Release the carpenter — it must drop off the work.
    applyCommand(s, { type: "convertCitizen", cityId: city.id, specialistId: "carpenter", delta: -1 });
    expect(s.works[0]!.assignedSpecialistIds).toHaveLength(0);
  });

  it("a specialist can only be on one work at a time", () => {
    const { s, city } = gameWithCity();
    applyCommand(s, { type: "convertCitizen", cityId: city.id, specialistId: "carpenter", delta: 1 });
    const id = city.specialists[0]!.id;
    const t1 = grasslandTile(s, city, city.col + 1, city.row);
    const t2 = grasslandTile(s, city, city.col - 1, city.row);
    const w1 = startWork(s, 0, "farm", t1.col, t1.row);
    const w2 = startWork(s, 0, "farm", t2.col, t2.row);
    assign(s, w1.workId!, id);
    assign(s, w2.workId!, id); // moving to w2 detaches from w1
    const work1 = s.works.find((w) => w.id === w1.workId);
    const work2 = s.works.find((w) => w.id === w2.workId);
    expect(work1!.assignedSpecialistIds).toHaveLength(0);
    expect(work2!.assignedSpecialistIds).toEqual([id]);
  });

  it("blocks farming a river tile until Irrigation is researched", () => {
    const { s, city } = gameWithCity();
    applyCommand(s, { type: "convertCitizen", cityId: city.id, specialistId: "carpenter", delta: 1 });
    const tile = grasslandTile(s, city, city.col + 1, city.row);
    tile.river = 0b001001; // a river runs through this grassland

    // Terrain is valid, but without Irrigation the farm is refused.
    expect(nextTierAt(tile, "farm")).toBe(1);
    expect(startWork(s, 0, "farm", tile.col, tile.row).ok).toBe(false);

    // Once Irrigation is researched, the river tile can be farmed.
    s.players[0]!.researched.add("irrigation");
    expect(startWork(s, 0, "farm", tile.col, tile.row).ok).toBe(true);
  });

  it("lets a river irrigate otherwise-unfarmable terrain (e.g. desert)", () => {
    const { s, city } = gameWithCity();
    applyCommand(s, { type: "convertCitizen", cityId: city.id, specialistId: "carpenter", delta: 1 });
    const tile = grasslandTile(s, city, city.col + 1, city.row);
    tile.terrain = "desert"; // not in the farm terrain whitelist

    // A dry desert tile can never be farmed.
    expect(nextTierAt(tile, "farm")).toBe(null);

    // A river crossing it makes it eligible, but only with Irrigation.
    tile.river = 0b001001;
    expect(nextTierAt(tile, "farm")).toBe(1);
    expect(startWork(s, 0, "farm", tile.col, tile.row).ok).toBe(false);
    s.players[0]!.researched.add("irrigation");
    expect(startWork(s, 0, "farm", tile.col, tile.row).ok).toBe(true);
  });

  it("gates water improvements (fishery) behind the Maritime Foraging tech", () => {
    const { s, city } = gameWithCity();
    // Agrimensors (the survey craft water works need) require The Wheel.
    s.players[0]!.researched.add("the_wheel");
    applyCommand(s, { type: "convertCitizen", cityId: city.id, specialistId: "agrimensor", delta: 1 });

    // A coastal tile owned by the city.
    const tile = grasslandTile(s, city, city.col + 1, city.row);
    tile.terrain = "coast";

    // Terrain is valid, but without Maritime Foraging the fishery is refused.
    expect(nextTierAt(tile, "fishery")).toBe(1);
    expect(startWork(s, 0, "fishery", tile.col, tile.row).ok).toBe(false);

    // Once researched, the fishery can be built.
    s.players[0]!.researched.add("maritime_foraging");
    expect(startWork(s, 0, "fishery", tile.col, tile.row).ok).toBe(true);
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
