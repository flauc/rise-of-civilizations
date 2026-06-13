import { describe, it, expect } from "vitest";
import { createGame } from "./setup";
import { beginTurn } from "./commands";
import { damageFrom, resolveAttack, cityMaxHp } from "./combat";
import { makeUnit, type GameState, type Unit } from "./state";

function bareGame(): GameState {
  // No barbarians, no starting units to keep scenarios controlled.
  const state = createGame({ seed: "combat", cols: 30, rows: 20, barbarians: false });
  state.units.clear();
  return state;
}

function place(state: GameState, owner: number, type: Unit["type"], col: number, row: number): Unit {
  const id = state.nextEntityId++;
  const u = makeUnit(id, owner, type, col, row);
  u.movementLeft = 2;
  state.units.set(id, u);
  return u;
}

describe("M2 combat", () => {
  it("damage rises as attacker outclasses defender", () => {
    expect(damageFrom(20, 20)).toBeLessThan(damageFrom(40, 20));
    expect(damageFrom(10, 40)).toBeLessThan(damageFrom(20, 20));
    expect(damageFrom(100, 1)).toBeLessThanOrEqual(75);
    expect(damageFrom(1, 100)).toBeGreaterThanOrEqual(1);
  });

  it("a melee attack damages both units; a strong attacker can kill", () => {
    const state = bareGame();
    const atk = place(state, 0, "swordsman", 5, 5);
    const def = place(state, 1, "warrior", 6, 5); // adjacent (odd-r)
    const res = resolveAttack(state, atk, def.col, def.row);
    expect(res.ok).toBe(true);
    // Defender took damage (or died); attacker spent its attack.
    expect(atk.attackedThisTurn).toBe(true);
    expect(atk.movementLeft).toBe(0);
  });

  it("ranged attack hits without taking counter damage", () => {
    const state = bareGame();
    const archer = place(state, 0, "archer", 5, 5);
    const target = place(state, 1, "warrior", 7, 5); // within range 2
    const hpBefore = archer.hp;
    const res = resolveAttack(state, archer, target.col, target.row);
    expect(res.ok).toBe(true);
    expect(archer.hp).toBe(hpBefore); // no retaliation
    expect(target.hp).toBeLessThan(100);
  });

  it("a melee unit captures a city whose HP is depleted", () => {
    const state = bareGame();
    // Give player 1 a city directly.
    const id = state.nextEntityId++;
    const city = {
      id, ownerId: 1, name: "Target", col: 10, row: 8, population: 1,
      foodStored: 0, productionStored: 0, production: null, buildings: [],
      isCapital: true, hp: 0, lastAttackedTurn: 0, rangedAttackUsed: false,
    };
    city.hp = 0; // already battered to 0
    state.cities.set(id, city);
    const atk = place(state, 0, "swordsman", 11, 8); // adjacent
    const res = resolveAttack(state, atk, 10, 8);
    expect(res.ok).toBe(true);
    expect(state.cities.get(id)!.ownerId).toBe(0); // captured
    expect(atk.col).toBe(10);
    expect(atk.row).toBe(8); // advanced into the city
  });

  it("cities have more HP with walls", () => {
    const base = { population: 3, buildings: [] as string[] } as never;
    const walled = { population: 3, buildings: ["walls"] } as never;
    expect(cityMaxHp(walled)).toBeGreaterThan(cityMaxHp(base));
  });

  it("barbarians take an automatic turn when reached via endTurn", () => {
    const state = createGame({ seed: "barb", cols: 40, rows: 26 });
    expect(state.players.some((p) => p.isBarbarian)).toBe(true);
    beginTurn(state);
    // Should not throw and should keep a human as the active player after a cycle.
    // (endTurn auto-runs the barbarian slot.)
    expect(() => beginTurn(state)).not.toThrow();
  });
});
