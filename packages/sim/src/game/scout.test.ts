import { describe, it, expect } from "vitest";
import { getTile } from "@roc/shared";
import { createGame } from "./setup";
import { resolveAttack, scoutEscapeChance, awardUnitXp, SCOUT_DISCOVERY_XP } from "./combat";
import { changeUnitMorale, maybeRoute, moraleAttackMultiplier, moraleDefenseMultiplier, hasMorale } from "./morale";
import { updateExplored } from "./visibility";
import { ensureContact } from "./diplomacy";
import { makeUnit, playerById, type GameState, type Unit } from "./state";

function warAll(state: GameState): void {
  for (const a of state.players) {
    for (const b of state.players) {
      if (a.id !== b.id && !a.atWar.includes(b.id)) a.atWar.push(b.id);
    }
  }
}

function bareGame(): GameState {
  const state = createGame({ seed: "scout", cols: 30, rows: 20, barbarians: false });
  state.units.clear();
  warAll(state);
  return state;
}

function place(state: GameState, owner: number, type: Unit["type"], col: number, row: number): Unit {
  const id = state.nextEntityId++;
  const u = makeUnit(id, owner, type, col, row);
  u.movementLeft = 2;
  state.units.set(id, u);
  return u;
}

describe("scouts — no morale", () => {
  it("a scout is outside the morale system", () => {
    const scout = makeUnit(1, 0, "scout", 0, 0);
    expect(hasMorale(scout)).toBe(false);
    expect(moraleAttackMultiplier(scout)).toBe(1);
    expect(moraleDefenseMultiplier(scout)).toBe(1);
  });

  it("changeUnitMorale does not move a scout's morale", () => {
    const scout = makeUnit(1, 0, "scout", 0, 0, 0, 100);
    changeUnitMorale(scout, -80);
    expect(scout.morale).toBe(100);
  });

  it("a scout never routs", () => {
    const state = bareGame();
    const scout = place(state, 0, "scout", 5, 5);
    scout.morale = 0; // would rout a normal unit
    expect(maybeRoute(state, scout)).toBe(false);
  });
});

describe("scouts — Escape perk", () => {
  it("scoutEscapeChance reflects the best escape promotion held", () => {
    const u = makeUnit(1, 0, "scout", 0, 0);
    expect(scoutEscapeChance(u)).toBe(0);
    u.promotions.push("evasion");
    expect(scoutEscapeChance(u)).toBe(0.5);
    u.promotions.push("vanish");
    expect(scoutEscapeChance(u)).toBe(0.95); // best wins
  });

  it("a scout dodges an attack (no damage) and slips back a tile", () => {
    const state = bareGame();
    const atk = place(state, 1, "warrior", 5, 5);
    const scout = place(state, 0, "scout", 6, 5); // adjacent (odd-r)
    scout.promotions.push("vanish"); // 95% — deterministic seed below dodges
    const hpBefore = scout.hp;
    const fromCol = scout.col;
    const fromRow = scout.row;
    const res = resolveAttack(state, atk, scout.col, scout.row);
    expect(res.ok).toBe(true);
    expect(scout.hp).toBe(hpBefore); // dodged — no damage
    expect(scout.col !== fromCol || scout.row !== fromRow).toBe(true); // slipped a tile
    expect(scout.escapeUsedTurn).toBe(state.turn);
    expect(atk.attackedThisTurn).toBe(true); // attacker still spent its strike
  });

  it("only escapes once per turn — a second attack the same turn lands", () => {
    const state = bareGame();
    const atk = place(state, 1, "warrior", 5, 5);
    const scout = place(state, 0, "scout", 6, 5);
    scout.promotions.push("vanish");
    scout.escapeUsedTurn = state.turn; // already escaped this turn
    const hpBefore = scout.hp;
    const res = resolveAttack(state, atk, scout.col, scout.row);
    expect(res.ok).toBe(true);
    expect(scout.hp).toBeLessThan(hpBefore); // the blow landed
  });
});

describe("scouts — reconnaissance XP", () => {
  it("awardUnitXp grants a scout XP but not a settler", () => {
    const scout = makeUnit(1, 0, "scout", 0, 0);
    awardUnitXp(scout, 5);
    expect(scout.xp).toBe(5);
    const settler = makeUnit(2, 0, "settler", 0, 0);
    awardUnitXp(settler, 5);
    expect(settler.xp).toBe(0);
  });

  it("discovering a village in sight grants the nearest scout XP", () => {
    const state = bareGame();
    const player = playerById(state, 0)!;
    player.explored.clear();
    const scout = place(state, 0, "scout", 5, 5);
    const t = getTile(state.map, 6, 5)!;
    t.feature = "village";
    const xpBefore = scout.xp;
    updateExplored(state, 0);
    expect(scout.xp).toBe(xpBefore + SCOUT_DISCOVERY_XP);
  });

  it("a natural wonder revealed by a scout grants XP", () => {
    const state = bareGame();
    const player = playerById(state, 0)!;
    player.explored.clear();
    const scout = place(state, 0, "scout", 5, 5);
    getTile(state.map, 6, 5)!.naturalWonder = "test_wonder";
    const xpBefore = scout.xp;
    updateExplored(state, 0);
    expect(scout.xp).toBe(xpBefore + SCOUT_DISCOVERY_XP);
  });

  it("a non-recon unit revealing a discovery grants no XP", () => {
    const state = bareGame();
    const player = playerById(state, 0)!;
    player.explored.clear();
    const warrior = place(state, 0, "warrior", 5, 5);
    getTile(state.map, 6, 5)!.feature = "village";
    updateExplored(state, 0);
    expect(warrior.xp).toBe(0);
  });

  it("first contact with a new civ credits the discovering scout", () => {
    const state = bareGame();
    const player = playerById(state, 0)!;
    player.explored.clear();
    // Ensure players 0 and 1 have not met yet.
    state.relations = state.relations.filter((r) => !(r.a === Math.min(0, 1) && r.b === Math.max(0, 1)));
    player.met = player.met.filter((id) => id !== 1);
    playerById(state, 1)!.met = playerById(state, 1)!.met.filter((id) => id !== 0);

    const scout = place(state, 0, "scout", 5, 5);
    place(state, 1, "warrior", 6, 5); // an enemy unit within the scout's sight
    const xpBefore = scout.xp;
    updateExplored(state, 0);
    expect(player.met).toContain(1); // contact happened
    expect(scout.xp).toBe(xpBefore + SCOUT_DISCOVERY_XP);
  });
});
