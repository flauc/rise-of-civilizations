import { describe, it, expect } from "vitest";
import { createGame } from "./setup";
import { beginTurn, applyCommand } from "./commands";
import { citizenScore } from "./economy";
import { autoManageCities } from "./ai";
import { resolveAttack } from "./combat";
import { isMilitary } from "./content";
import { citiesOf, makeUnit, playerById, unitsOf } from "./state";

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
});
