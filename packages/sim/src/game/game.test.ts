import { describe, it, expect } from "vitest";
import { createGame } from "./setup";
import { beginTurn, applyCommand } from "./commands";
import { computeReachable } from "./movement";
import { currentPlayer, unitsOf, citiesOf } from "./state";

function newGame() {
  const state = createGame({ seed: "test-m1", cols: 48, rows: 32, barbarians: false });
  beginTurn(state); // start player 0's first turn
  return state;
}

describe("M1 game model", () => {
  it("sets up two players each with a settler and a warrior", () => {
    const state = newGame();
    expect(state.players).toHaveLength(2);
    for (const p of state.players) {
      const units = unitsOf(state, p.id);
      expect(units.some((u) => u.type === "settler")).toBe(true);
      expect(units.some((u) => u.type === "warrior")).toBe(true);
    }
  });

  it("moves a unit onto a reachable tile and spends movement", () => {
    const state = newGame();
    const warrior = unitsOf(state, 0).find((u) => u.type === "warrior")!;
    const reachable = computeReachable(state, warrior);
    expect(reachable.size).toBeGreaterThan(0);
    const [key, entry] = [...reachable.entries()][0]!;
    const [col, row] = key.split(",").map(Number) as [number, number];
    const res = applyCommand(state, { type: "move", unitId: warrior.id, col, row });
    expect(res.ok).toBe(true);
    expect(warrior.col).toBe(col);
    expect(warrior.row).toBe(row);
    expect(warrior.movementLeft).toBe(Math.max(0, 2 - entry.cost));
  });

  it("founds a capital with a settler (consuming it)", () => {
    const state = newGame();
    const settler = unitsOf(state, 0).find((u) => u.type === "settler")!;
    const res = applyCommand(state, { type: "foundCity", unitId: settler.id });
    expect(res.ok).toBe(true);
    expect(state.units.has(settler.id)).toBe(false);
    const cities = citiesOf(state, 0);
    expect(cities).toHaveLength(1);
    expect(cities[0]!.isCapital).toBe(true);
  });

  it("enemy units cannot enter a city but can attack it from an adjacent tile", () => {
    const state = newGame();
    const settler = unitsOf(state, 0).find((u) => u.type === "settler")!;
    applyCommand(state, { type: "foundCity", unitId: settler.id });
    const city = citiesOf(state, 0)[0]!;

    // Teleport an enemy warrior next to the city.
    const enemy = unitsOf(state, 1).find((u) => u.type === "warrior")!;
    enemy.col = city.col + 1;
    enemy.row = city.row;
    enemy.movementLeft = 2;

    // Moving into the city tile is forbidden.
    const moveRes = applyCommand(state, { type: "move", unitId: enemy.id, col: city.col, row: city.row });
    expect(moveRes.ok).toBe(false);
    expect(enemy.col).toBe(city.col + 1);
    expect(enemy.row).toBe(city.row);

    // Attacking the city from the adjacent tile is allowed.
    const attackRes = applyCommand(state, { type: "attack", attackerId: enemy.id, col: city.col, row: city.row });
    expect(attackRes.ok).toBe(true);
  });

  it("accumulates science and completes research over several turns", () => {
    const state = newGame();
    const settler = unitsOf(state, 0).find((u) => u.type === "settler")!;
    applyCommand(state, { type: "foundCity", unitId: settler.id });
    applyCommand(state, { type: "setResearch", techId: "cultivation" });
    for (let i = 0; i < 24; i++) applyCommand(state, { type: "endTurn" });
    expect(currentPlayer(state).id).toBeDefined();
    expect(state.players[0]!.researched.has("cultivation")).toBe(true);
  });
});
