import { describe, it, expect } from "vitest";
import { createGame } from "./setup";
import { beginTurn, applyCommand } from "./commands";
import { citiesOf, unitsOf, playerById, type City } from "./state";
import {
  availableTraining,
  canStartTraining,
  startTraining,
  cancelTraining,
  advanceTraining,
  trainSlots,
  trainingTimeInCity,
  freeCitizens,
} from "./training";

function game(): { s: ReturnType<typeof createGame>; city: City } {
  const s = createGame({ seed: "training-test", cols: 40, rows: 28, barbarians: false, humanSlots: 1, playerCount: 1 });
  beginTurn(s);
  const settler = unitsOf(s, 0).find((u) => u.type === "settler")!;
  applyCommand(s, { type: "foundCity", unitId: settler.id });
  return { s, city: citiesOf(s, 0)[0]! };
}

describe("unit training", () => {
  it("training a melee unit requires a Barracks", () => {
    const { s, city } = game();
    city.population = 3;
    expect(canStartTraining(s, city, "warrior").ok).toBe(false); // no Barracks yet
    city.training.barracks = 1;
    expect(canStartTraining(s, city, "warrior").ok).toBe(true);
  });

  it("starting an order debits a citizen; cancelling refunds it", () => {
    const { s, city } = game();
    city.population = 3;
    city.training.barracks = 1;
    const before = city.population;
    const r = startTraining(s, city, "warrior");
    expect(r.ok).toBe(true);
    expect(city.population).toBe(before - 1);
    expect(city.trainingQueue.length).toBe(1);

    cancelTraining(s, city, city.trainingQueue[0]!.id);
    expect(city.population).toBe(before);
    expect(city.trainingQueue.length).toBe(0);
  });

  it("never trains the city's last citizen", () => {
    const { s, city } = game();
    city.population = 1;
    city.training.barracks = 1;
    expect(canStartTraining(s, city, "warrior").ok).toBe(false);
  });

  it("a family's tier sets how many units train at once", () => {
    const { s, city } = game();
    city.population = 6;
    city.training.barracks = 1; // tier 1 → 1 slot
    expect(trainSlots(s, city, "barracks")).toBe(1);
    expect(startTraining(s, city, "warrior").ok).toBe(true);
    expect(startTraining(s, city, "warrior").ok).toBe(false); // slot full

    city.training.barracks = 3; // tier 3 → 2 slots
    expect(trainSlots(s, city, "barracks")).toBe(2);
    expect(startTraining(s, city, "warrior").ok).toBe(true); // a second now fits
    expect(startTraining(s, city, "warrior").ok).toBe(false);
  });

  it("higher tiers train faster and field steadier, more experienced recruits", () => {
    const { s, city } = game();
    const player = playerById(s, 0)!;
    city.population = 4;
    city.training.barracks = 1;
    const slow = trainingTimeInCity(s, city, "warrior");
    city.training.barracks = 5;
    const fast = trainingTimeInCity(s, city, "warrior");
    expect(fast).toBeLessThan(slow);

    // A tier-5 Barracks musters a unit with the tier's starting XP/morale.
    const beforeIds = new Set(unitsOf(s, 0).map((u) => u.id));
    expect(startTraining(s, city, "warrior").ok).toBe(true);
    city.trainingQueue[0]!.turnsLeft = 1;
    advanceTraining(s, city, player);
    const unit = unitsOf(s, 0).find((u) => !beforeIds.has(u.id))!;
    expect(unit).toBeDefined();
    expect(unit.type).toBe("warrior");
    expect(unit.xp).toBe(40); // tier-5 starting XP
    expect(unit.morale ?? 0).toBeGreaterThan(100); // +40 morale bonus over a neutral base
  });

  it("strategic resources gate training", () => {
    const { s, city } = game();
    const player = playerById(s, 0)!;
    player.researched.add("iron_bloomery");
    city.training.barracks = 1;
    city.population = 3;
    expect(canStartTraining(s, city, "swordsman").ok).toBe(false); // no iron
    player.resources.iron = 1;
    expect(canStartTraining(s, city, "swordsman").ok).toBe(true);
    expect(availableTraining(s, player, city).includes("swordsman")).toBe(true);
  });

  it("civilians and scouts train from the city center without a building", () => {
    const { s, city } = game();
    city.population = 3;
    expect(canStartTraining(s, city, "scout").ok).toBe(true);
    expect(canStartTraining(s, city, "settler").ok).toBe(true);
    expect(freeCitizens(city)).toBeGreaterThan(0);
  });
});
