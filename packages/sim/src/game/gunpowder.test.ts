import { describe, it, expect } from "vitest";
import { createGame } from "./setup";
import { resolveAttack, healAndReset, computeAttackTargets } from "./combat";
import { detectHiddenUnits } from "./stealth";
import { UNIT_DEFS } from "./content";
import { makeUnit, playerById, type GameState, type Unit } from "./state";

function warAll(state: GameState): void {
  for (const a of state.players) {
    for (const b of state.players) {
      if (a.id !== b.id && !a.atWar.includes(b.id)) a.atWar.push(b.id);
    }
  }
}

function bareGame(): GameState {
  const state = createGame({ seed: "gunpowder", cols: 30, rows: 20, barbarians: false });
  state.units.clear();
  warAll(state);
  return state;
}

function place(state: GameState, owner: number, type: Unit["type"], col: number, row: number): Unit {
  const id = state.nextEntityId++;
  const u = makeUnit(id, owner, type, col, row);
  u.movementLeft = 4;
  state.units.set(id, u);
  return u;
}

/** Re-arm a unit for a fresh turn the way beginTurn would (without the full loop). */
function newTurn(state: GameState, ownerId: number, u: Unit): void {
  state.turn += 1;
  healAndReset(state, playerById(state, ownerId)!);
  u.movementLeft = 4;
}

describe("early gunpowder units", () => {
  it("the generic replacements lost their civ-specific names", () => {
    expect(UNIT_DEFS.hoplite.name).toBe("Heavy Spearman");
    expect(UNIT_DEFS.legionary.name).toBe("Heavy Infantry");
  });

  it("hand cannon, matchlock and bombard exist as strong gunpowder units", () => {
    for (const id of ["hand_cannon", "matchlock", "bombard"] as const) {
      expect(UNIT_DEFS[id].gunpowder).toBe(true);
      expect(UNIT_DEFS[id].rangedStrength ?? 0).toBeGreaterThanOrEqual(26);
    }
    expect(UNIT_DEFS.bombard.abilities).toContain("bonus_vs_city");
  });

  it("starts loaded and can fire immediately", () => {
    const state = bareGame();
    const gun = place(state, 0, "hand_cannon", 5, 5);
    expect(gun.loaded).toBe(true);
    place(state, 1, "spearman", 6, 5); // adjacent target (range 1)

    const res = resolveAttack(state, gun, 6, 5);
    expect(res.ok).toBe(true);
    expect(gun.loaded).toBe(false); // spent its charge
    expect(gun.attackedThisTurn).toBe(true);
  });

  it("must reload for a turn after firing, then fires every other turn", () => {
    const state = bareGame();
    const gun = place(state, 0, "matchlock", 5, 5);
    place(state, 1, "spearman", 6, 5);

    // Turn 1: fires the loaded shot.
    expect(resolveAttack(state, gun, 6, 5).ok).toBe(true);
    expect(gun.loaded).toBe(false);

    // Turn 2: reloads — it becomes loaded but cannot fire this turn.
    newTurn(state, 0, gun);
    expect(gun.loaded).toBe(true);
    expect(gun.reloading).toBe(true);
    expect(computeAttackTargets(state, gun).size).toBe(0);
    place(state, 1, "spearman", 6, 5); // a fresh target in range
    expect(resolveAttack(state, gun, 6, 5).ok).toBe(false); // still reloading

    // Turn 3: charge is ready — it can fire again.
    newTurn(state, 0, gun);
    expect(gun.reloading).toBe(false);
    expect(resolveAttack(state, gun, 6, 5).ok).toBe(true);
    expect(gun.loaded).toBe(false);
  });
});

describe("war dogs detect hidden units", () => {
  it("reveal a concealed enemy within 2 tiles, but not one farther away", () => {
    const state = bareGame();
    const hidden = place(state, 1, "spearman", 10, 5);
    hidden.hidden = true;

    // A war dog 2 tiles away sniffs out the ambusher.
    const dog = place(state, 0, "war_dog", 12, 5);
    detectHiddenUnits(state, 0);
    expect(hidden.hidden).toBe(false);

    // Re-hide and move the dog out of range (4 tiles): it stays concealed.
    hidden.hidden = true;
    dog.col = 14;
    detectHiddenUnits(state, 0);
    expect(hidden.hidden).toBe(true);
  });

  it("an ordinary unit does not detect hidden enemies", () => {
    const state = bareGame();
    const hidden = place(state, 1, "spearman", 10, 5);
    hidden.hidden = true;
    place(state, 0, "warrior", 11, 5); // adjacent, but no detection
    detectHiddenUnits(state, 0);
    expect(hidden.hidden).toBe(true);
  });
});
