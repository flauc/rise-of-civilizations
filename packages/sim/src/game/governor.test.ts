import { describe, it, expect } from "vitest";
import { createGame } from "./setup";
import { beginTurn, applyCommand } from "./commands";
import { citizenScore } from "./economy";
import { autoManageCities } from "./ai";
import { resolveAttack } from "./combat";
import { isMilitary } from "./content";
import { citiesOf, makeUnit, playerById, unitsOf } from "./state";
import { specialistsByType, workerSlots } from "./specialists";
import { assignSpecialist, startWork } from "./works";
import { getTile } from "@roc/shared";

function foundedGame() {
  const s = createGame({ seed: "gov", cols: 40, rows: 28, barbarians: false });
  beginTurn(s);
  const settler = unitsOf(s, 0).find((u) => u.type === "settler")!;
  applyCommand(s, { type: "foundCity", unitId: settler.id });
  const city = citiesOf(s, 0)[0]!;
  return { s, city };
}

describe("governor mode (city auto-management)", () => {
  it("citizenScore weighs a tile's yields toward the chosen focus", () => {
    const foodTile = { food: 4, production: 1, gold: 1, science: 1, faith: 0 };
    const prodTile = { food: 1, production: 4, gold: 1, science: 1, faith: 0 };
    const goldTile = { food: 1, production: 1, gold: 4, science: 1, faith: 0 };
    const sciTile = { food: 1, production: 1, gold: 1, science: 4, faith: 0 };
    expect(citizenScore(foodTile, "growth")).toBeGreaterThan(citizenScore(prodTile, "growth"));
    expect(citizenScore(prodTile, "military")).toBeGreaterThan(citizenScore(foodTile, "military"));
    expect(citizenScore(goldTile, "money")).toBeGreaterThan(citizenScore(foodTile, "money"));
    expect(citizenScore(sciTile, "science")).toBeGreaterThan(citizenScore(foodTile, "science"));
  });

  it("setCityAutoMode sets and clears a city's governor focus", () => {
    const { s, city } = foundedGame();
    expect(city.autoMode).toBeUndefined();
    expect(applyCommand(s, { type: "setCityAutoMode", cityId: city.id, mode: "science" }).ok).toBe(true);
    expect(city.autoMode).toBe("science");
    expect(applyCommand(s, { type: "setCityAutoMode", cityId: city.id, mode: null }).ok).toBe(true);
    expect(city.autoMode).toBeUndefined();
  });

  it("rejects setting the auto-mode of another player's city", () => {
    const { s, city } = foundedGame();
    expect(applyCommand(s, { type: "setCityAutoMode", cityId: city.id, mode: "growth" }, 1).ok).toBe(false);
  });

  it("assigning a governor picks production that same turn (nothing was building)", () => {
    const { s, city } = foundedGame();
    city.production = null;
    applyCommand(s, { type: "setCityAutoMode", cityId: city.id, mode: "growth" });
    expect(city.production).not.toBeNull(); // chosen immediately, not next turn
  });

  it("assigning a governor never overrides an in-progress build", () => {
    const { s, city } = foundedGame();
    const existing = { kind: "building", id: "monument" } as const;
    city.production = existing;
    applyCommand(s, { type: "setCityAutoMode", cityId: city.id, mode: "growth" });
    expect(city.production).toEqual(existing); // left untouched
  });

  it("a growth-focus city queues its focus building once its tech is known", () => {
    const { s, city } = foundedGame();
    const player = playerById(s, 0)!;
    player.researched.add("pottery_kiln"); // unlocks the Granary
    applyCommand(s, { type: "setCityAutoMode", cityId: city.id, mode: "growth" });
    city.production = null;
    autoManageCities(s, player);
    expect(city.production).toEqual({ kind: "building", id: "granary" });
  });

  it("a science-focus city prefers its focus building over a generically-earlier one", () => {
    const { s, city } = foundedGame();
    const player = playerById(s, 0)!;
    // Both the growth-order Granary and the science-order Archive are available;
    // the science focus should still front-load its own building.
    player.researched.add("pottery_kiln");
    player.researched.add("writing");
    applyCommand(s, { type: "setCityAutoMode", cityId: city.id, mode: "science" });
    city.production = null;
    autoManageCities(s, player);
    expect(city.production).toEqual({ kind: "building", id: "library" });
  });

  it("only a military-focus city ever auto-trains a military unit", () => {
    const { s, city } = foundedGame();
    const player = playerById(s, 0)!;
    city.population = 8; // plenty of citizens so training never starves the city
    city.training.barracks = 1; // simulate an already-built Barracks (Warrior needs no tech)

    applyCommand(s, { type: "setCityAutoMode", cityId: city.id, mode: "growth" });
    autoManageCities(s, player);
    expect(city.trainingQueue.some((o) => isMilitary(o.unit))).toBe(false);

    applyCommand(s, { type: "setCityAutoMode", cityId: city.id, mode: "military" });
    autoManageCities(s, player);
    expect(city.trainingQueue.some((o) => isMilitary(o.unit))).toBe(true);
  });

  it("military focus fills every open barracks slot and does not queue new public works", () => {
    const { s, city } = foundedGame();
    const player = playerById(s, 0)!;
    city.population = 6;
    city.training.barracks = 3; // tier 3 → 2 concurrent training slots
    const worksBefore = s.works.length;

    applyCommand(s, { type: "setCityAutoMode", cityId: city.id, mode: "military" });
    autoManageCities(s, player);

    expect(city.trainingQueue.filter((o) => isMilitary(o.unit)).length).toBe(2);
    expect(s.works.length).toBe(worksBefore);
  });

  it("does nothing for cities left in manual mode", () => {
    const { s, city } = foundedGame();
    const player = playerById(s, 0)!;
    const before = city.production;
    autoManageCities(s, player);
    expect(city.production).toEqual(before);
  });

  it("a captured city reverts to manual control (autoMode cleared)", () => {
    const { s, city } = foundedGame();
    applyCommand(s, { type: "setCityAutoMode", cityId: city.id, mode: "money" });
    expect(city.autoMode).toBe("money");
    // Put the two civs at war and batter the city to 0 HP so a melee unit captures it.
    const attacker = playerById(s, 1)!;
    const owner = playerById(s, 0)!;
    if (!owner.atWar.includes(1)) owner.atWar.push(1);
    if (!attacker.atWar.includes(0)) attacker.atWar.push(0);
    city.hp = 0;
    const atkId = s.nextEntityId++;
    const atk = makeUnit(atkId, 1, "swordsman", city.col + 1, city.row);
    atk.movementLeft = 2;
    s.units.set(atkId, atk);
    const res = resolveAttack(s, atk, city.col, city.row);
    expect(res.ok).toBe(true);
    expect(city.ownerId).toBe(1); // captured
    expect(city.autoMode).toBeUndefined(); // governor cleared for the new owner
  });

  it("switching governor focus releases AI-trained idle carpenters but keeps manual ones", () => {
    const { s, city } = foundedGame();
    city.population = 6;

    applyCommand(s, { type: "convertCitizen", cityId: city.id, specialistId: "carpenter", delta: 1 });
    const aiCarpenter = specialistsByType(city, "carpenter")[0]!;

    applyCommand(s, { type: "convertCitizen", cityId: city.id, specialistId: "carpenter", delta: 1, manual: true });
    const manualCarpenter = specialistsByType(city, "carpenter").find((sp) => sp.id !== aiCarpenter.id)!;
    expect(city.lockedSpecialists).toContain(manualCarpenter.id);

    for (const mode of ["military", "science", "money"] as const) {
      applyCommand(s, { type: "convertCitizen", cityId: city.id, specialistId: "carpenter", delta: 1 });
      const extraAi = specialistsByType(city, "carpenter").find(
        (sp) => sp.id !== aiCarpenter.id && sp.id !== manualCarpenter.id,
      )!;
      applyCommand(s, { type: "setCityAutoMode", cityId: city.id, mode });
      expect(city.specialists.some((sp) => sp.id === extraAi.id)).toBe(false);
      expect(city.specialists.some((sp) => sp.id === manualCarpenter.id)).toBe(true);
    }
    expect(workerSlots(city)).toBeGreaterThan(0);
  });

  it("AI carpenter finishes the current job after a focus change, then is freed without starting a new one", () => {
    const { s, city } = foundedGame();
    city.population = 6;

    applyCommand(s, { type: "convertCitizen", cityId: city.id, specialistId: "carpenter", delta: 1 });
    const aiCarpenter = specialistsByType(city, "carpenter")[0]!;
    const tile = workableFarmTile(s, city);
    expect(startWork(s, 0, "farm", tile.col, tile.row).ok).toBe(true);
    const work = s.works.find((w) => w.target?.col === tile.col)!;
    expect(assignSpecialist(s, 0, work.id, aiCarpenter.id, true).ok).toBe(true);

    applyCommand(s, { type: "setCityAutoMode", cityId: city.id, mode: "military" });
    expect(city.specialists.some((sp) => sp.id === aiCarpenter.id)).toBe(true);
    expect(work.assignedSpecialistIds).toContain(aiCarpenter.id);
    expect(city.pendingSpecialistRelease).toContain(aiCarpenter.id);

    // Work completes — next governed turn releases the carpenter; no new work is queued.
    const worksBefore = s.works.length;
    work.progress.carpentry = work.requirement.carpentry ?? 999;
    autoManageCities(s, playerById(s, 0)!);
    expect(city.specialists.some((sp) => sp.id === aiCarpenter.id)).toBe(false);
    expect(s.works.length).toBeLessThanOrEqual(worksBefore);
  });

  it("manual carpenters stay when governor focus changes, even after AI ones are freed", () => {
    const { s, city } = foundedGame();
    city.population = 4;
    applyCommand(s, { type: "convertCitizen", cityId: city.id, specialistId: "carpenter", delta: 1, manual: true });
    const manual = city.specialists[0]!;
    applyCommand(s, { type: "setCityAutoMode", cityId: city.id, mode: "military" });
    expect(city.specialists.some((sp) => sp.id === manual.id)).toBe(true);
    expect(city.pendingSpecialistRelease ?? []).not.toContain(manual.id);
  });

  it("growth governor keeps citizens free when no public works are queued", () => {
    const { s, city } = foundedGame();
    const player = playerById(s, 0)!;
    city.population = 6;
    player.researched.add("masonry");
    player.researched.add("the_wheel");
    for (const t of s.map.tiles) {
      if (t.ownerCityId !== city.id) continue;
      t.improvement = "farm";
      t.improvementLevel = 3;
    }
    applyCommand(s, { type: "setCityAutoMode", cityId: city.id, mode: "growth" });
    autoManageCities(s, player);
    expect(city.specialists.length).toBe(0);
    expect(workerSlots(city)).toBe(6);
  });

  it("growth governor trains a specialist on demand when queueing a farm", () => {
    const { s, city } = foundedGame();
    const player = playerById(s, 0)!;
    city.population = 4;
    workableFarmTile(s, city);
    // Strip any luxury the map seeded nearby so the plain-farm path runs here; an
    // unhappy governor prioritizing luxuries for amenities is covered separately.
    for (const t of s.map.tiles) if (t.ownerCityId === city.id) t.resource = undefined;
    applyCommand(s, { type: "setCityAutoMode", cityId: city.id, mode: "growth" });
    autoManageCities(s, player);
    expect(specialistsByType(city, "carpenter").length).toBe(1);
    expect(s.works.some((w) => w.kind === "farm")).toBe(true);
  });

  it("an unhappy governor improves a luxury tile for amenities before farming plain land", () => {
    const { s, city } = foundedGame();
    const player = playerById(s, 0)!;
    city.population = 4; // unhappiness 4 > 0 amenities -> amenity shortfall
    // A plain farmable tile: the amenity-blind loop would have queued a farm here first.
    workableFarmTile(s, city);
    // An unimproved wine tile (grassland -> plantation) that grants a brand-new amenity.
    const wine = getTile(s.map, city.col - 1, city.row)!;
    wine.terrain = "grassland";
    wine.improvement = undefined;
    wine.resource = "wine";
    wine.ownerCityId = city.id;
    applyCommand(s, { type: "setCityAutoMode", cityId: city.id, mode: "growth" });
    autoManageCities(s, player);
    // The single queued economic work activates the luxury, not the plain farm.
    expect(
      s.works.some((w) => w.kind === "plantation" && w.target?.col === wine.col && w.target?.row === wine.row),
    ).toBe(true);
    expect(s.works.some((w) => w.kind === "farm")).toBe(false);
  });
});

function workableFarmTile(s: ReturnType<typeof createGame>, city: ReturnType<typeof citiesOf>[0]) {
  for (const t of s.map.tiles) {
    if (t.ownerCityId !== city.id || t.improvement || t.resource || t.river) continue;
    if (t.terrain === "grassland" || t.terrain === "plains") return t;
  }
  const t = getTile(s.map, city.col + 1, city.row)!;
  t.terrain = "grassland";
  t.improvement = undefined;
  t.resource = undefined;
  t.river = undefined;
  t.ownerCityId = city.id;
  return t;
}
