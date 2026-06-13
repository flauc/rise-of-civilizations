import { describe, it, expect } from "vitest";
import { createGame } from "./setup";
import { beginTurn, applyCommand } from "./commands";
import { civEffectsOf, unitMovement, civCombatBonus } from "./civs";
import { getCityYields } from "./economy";
import { makeUnit, unitsOf, citiesOf, type GameState } from "./state";
import { UNIT_DEFS } from "./content";

function game(): GameState {
  const s = createGame({ seed: "civ-test", cols: 40, rows: 28, barbarians: false, humanSlots: 2 });
  beginTurn(s);
  return s;
}

function inject(s: GameState, owner: number, type: Parameters<typeof makeUnit>[2], col: number, row: number) {
  const id = s.nextEntityId++;
  const u = makeUnit(id, owner, type, col, row);
  s.units.set(id, u);
  return u;
}

describe("civilizations", () => {
  it("resolves a player's civ effects from its civId", () => {
    const s = game();
    s.players[0]!.civId = "egypt";
    expect(civEffectsOf(s, 0).yieldPercent?.production).toBe(20);
  });

  it("Mongols give cavalry +1 movement", () => {
    const s = game();
    s.players[0]!.civId = "mongols";
    s.players[1]!.civId = "rome";
    const rider = inject(s, 0, "rider", 5, 5);
    const otherRider = inject(s, 1, "rider", 7, 5);
    expect(unitMovement(s, rider)).toBe(UNIT_DEFS.rider.movement + 1);
    expect(unitMovement(s, otherRider)).toBe(UNIT_DEFS.rider.movement);
  });

  it("Greece gives melee units +2 combat", () => {
    const s = game();
    s.players[0]!.civId = "greece";
    const warrior = inject(s, 0, "warrior", 5, 5);
    expect(civCombatBonus(s, warrior)).toBe(2);
  });

  it("Rome founds new cities with a free Monument", () => {
    const s = game();
    s.players[0]!.civId = "rome";
    const settler = unitsOf(s, 0).find((u) => u.type === "settler")!;
    applyCommand(s, { type: "foundCity", unitId: settler.id });
    expect(citiesOf(s, 0)[0]!.buildings).toContain("monument");
  });

  it("Egypt's production bonus never lowers output", () => {
    const s = game();
    const settler = unitsOf(s, 0).find((u) => u.type === "settler")!;
    applyCommand(s, { type: "foundCity", unitId: settler.id });
    const city = citiesOf(s, 0)[0]!;
    s.players[0]!.civId = undefined;
    const base = getCityYields(s, city).production;
    s.players[0]!.civId = "egypt";
    expect(getCityYields(s, city).production).toBeGreaterThanOrEqual(base);
  });
});
