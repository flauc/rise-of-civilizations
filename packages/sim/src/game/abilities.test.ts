import { describe, it, expect } from "vitest";
import { createGame } from "./setup";
import { resolveAttack } from "./combat";
import { useAbility, canUseAbility, tickAbilities, abilityTargets } from "./abilities";
import { makeUnit, playerById, type GameState, type Unit } from "./state";

function warAll(state: GameState): void {
  for (const a of state.players) {
    for (const b of state.players) {
      if (a.id !== b.id && !a.atWar.includes(b.id)) a.atWar.push(b.id);
    }
  }
}

function bareGame(): GameState {
  const state = createGame({ seed: "abil", cols: 30, rows: 20, barbarians: false });
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

describe("active abilities", () => {
  it("Set Spears (brace) reduces damage taken — especially from cavalry", () => {
    // Unbraced run.
    let state = bareGame();
    let rider = place(state, 0, "rider", 5, 5);
    let spear = place(state, 1, "spearman", 6, 5);
    resolveAttack(state, rider, spear.col, spear.row);
    const unbracedLoss = 100 - spear.hp;

    // Braced run.
    state = bareGame();
    rider = place(state, 0, "rider", 5, 5);
    spear = place(state, 1, "spearman", 6, 5);
    expect(useAbility(state, spear, "brace").ok).toBe(true);
    expect(spear.stance).toBe("brace");
    expect(spear.movementLeft).toBe(0);
    resolveAttack(state, rider, spear.col, spear.row);
    const bracedLoss = 100 - spear.hp;

    expect(bracedLoss).toBeLessThan(unbracedLoss);
  });

  it("Charge rides through the target to the tile behind it", () => {
    const state = bareGame();
    const rider = place(state, 0, "rider", 5, 5);
    place(state, 1, "warrior", 6, 5); // adjacent; will survive one hit
    const res = useAbility(state, rider, "charge", 6, 5);
    expect(res.ok).toBe(true);
    // Rider ended up past the defender (no longer on its start tile).
    expect(`${rider.col},${rider.row}`).not.toBe("5,5");
  });

  it("Fire & Retreat shoots without retaliation, then steps away", () => {
    const state = bareGame();
    const ha = place(state, 0, "horse_archer", 5, 5);
    const target = place(state, 1, "warrior", 6, 5);
    const hp = ha.hp;
    const before = Math.abs(ha.col - target.col) + Math.abs(ha.row - target.row);
    const res = useAbility(state, ha, "fire_and_retreat", target.col, target.row);
    expect(res.ok).toBe(true);
    expect(ha.hp).toBe(hp); // ranged: no counter-attack
    expect(target.hp).toBeLessThan(100);
    const after = Math.abs(ha.col - target.col) + Math.abs(ha.row - target.row);
    expect(after).toBeGreaterThan(before); // retreated
  });

  it("Sunder debuffs the target's defense for a turn", () => {
    const state = bareGame();
    const axe = place(state, 0, "axeman", 5, 5);
    const foe = place(state, 1, "warrior", 6, 5);
    expect(useAbility(state, axe, "sunder", foe.col, foe.row).ok).toBe(true);
    if (state.units.has(foe.id)) expect(foe.sunderedUntilTurn).toBe(state.turn + 1);
  });

  it("Harry pins the target so it cannot move next turn", () => {
    const state = bareGame();
    const dog = place(state, 0, "war_dog", 5, 5);
    const foe = place(state, 1, "warrior", 6, 5);
    expect(useAbility(state, dog, "harry", foe.col, foe.row).ok).toBe(true);
    if (state.units.has(foe.id)) {
      expect(foe.pinnedUntilTurn).toBe(state.turn + 1);
      foe.movementLeft = 4;
      tickAbilities(state, playerById(state, 1)!);
      expect(foe.movementLeft).toBe(0); // pin enforced at turn start
    }
  });

  it("Emplace grants extra range to a siege engine", () => {
    const state = bareGame();
    const cat = place(state, 0, "catapult", 5, 5); // base range 2
    place(state, 1, "warrior", 9, 5); // distance 4? ensure > 2, <= 3 target below
    const far = place(state, 1, "warrior", 8, 5); // distance 3 from (5,5)
    // Not emplaced: range 2, distance 3 is out of range.
    expect(resolveAttack(state, cat, far.col, far.row).ok).toBe(false);
    // Emplace, then (simulating its next turn) it reaches distance 3.
    expect(useAbility(state, cat, "emplace").ok).toBe(true);
    expect(cat.stance).toBe("emplace");
    cat.movementLeft = 2;
    cat.attackedThisTurn = false;
    expect(resolveAttack(state, cat, far.col, far.row).ok).toBe(true);
  });

  it("Shock Charge goes on cooldown after use", () => {
    const state = bareGame();
    const cata = place(state, 0, "cataphract", 5, 5);
    place(state, 1, "warrior", 6, 5);
    expect(useAbility(state, cata, "shock_charge", 6, 5).ok).toBe(true);
    expect(cata.abilityCooldowns?.shock_charge).toBe(state.turn + 2);
    // Even with movement restored, it's still on cooldown this turn.
    cata.movementLeft = 4;
    cata.attackedThisTurn = false;
    expect(canUseAbility(state, cata, "shock_charge").ok).toBe(false);
  });

  it("Reconnoiter spends the turn for a vision pulse", () => {
    const state = bareGame();
    const scout = place(state, 0, "scout", 5, 5);
    expect(useAbility(state, scout, "reconnoiter").ok).toBe(true);
    expect(scout.scouting).toBe(true);
    expect(scout.movementLeft).toBe(0);
  });

  it("Reconnoiter requires at least one movement point left", () => {
    const state = bareGame();
    const scout = place(state, 0, "scout", 5, 5);
    scout.movementLeft = 0;
    expect(useAbility(state, scout, "reconnoiter").ok).toBe(false);
    scout.movementLeft = 1;
    expect(useAbility(state, scout, "reconnoiter").ok).toBe(true);
  });

  it("abilityTargets lists in-range enemies for a targeted ability", () => {
    const state = bareGame();
    const rider = place(state, 0, "rider", 5, 5);
    place(state, 1, "warrior", 6, 5); // adjacent
    const targets = abilityTargets(state, rider, "charge");
    expect(targets.has("6,5")).toBe(true);
  });

  it("Fire Lance shoots from 2 tiles, takes no retaliation, and goes on a 2-turn cooldown", () => {
    const state = bareGame();
    // The fire_lance override only applies to the Tang/Song unique pikeman.
    playerById(state, 0)!.civId = "china_tang_song";
    const lancer = place(state, 0, "pikeman", 5, 5);
    const target = place(state, 1, "warrior", 7, 5); // distance 2
    const hp = lancer.hp;
    const res = useAbility(state, lancer, "fire_lance", target.col, target.row);
    expect(res.ok).toBe(true);
    expect(lancer.hp).toBe(hp); // ranged volley: no counter-attack
    expect(target.hp).toBeLessThan(100);
    expect(lancer.abilityCooldowns?.fire_lance).toBe(state.turn + 3); // cooldown 2 → wait two turns

    // On cooldown even with movement/attack restored this turn.
    lancer.movementLeft = 4;
    lancer.attackedThisTurn = false;
    expect(canUseAbility(state, lancer, "fire_lance").ok).toBe(false);
  });

  it("Fire Lance cannot reach a target 3 tiles away", () => {
    const state = bareGame();
    playerById(state, 0)!.civId = "china_tang_song";
    const lancer = place(state, 0, "pikeman", 5, 5);
    const far = place(state, 1, "warrior", 8, 5); // distance 3
    expect(useAbility(state, lancer, "fire_lance", far.col, far.row).ok).toBe(false);
  });

  it("Fire Lance hits slightly harder than the lancer's melee thrust", () => {
    // Ranged volley (tough defender so neither hit saturates the damage cap).
    let state = bareGame();
    playerById(state, 0)!.civId = "china_tang_song";
    let lancer = place(state, 0, "pikeman", 5, 5);
    let foe = place(state, 1, "longswordsman", 7, 5);
    useAbility(state, lancer, "fire_lance", foe.col, foe.row);
    const lanceDmg = 100 - foe.hp;

    // Plain melee thrust from the same matchup.
    state = bareGame();
    playerById(state, 0)!.civId = "china_tang_song";
    lancer = place(state, 0, "pikeman", 5, 5);
    foe = place(state, 1, "longswordsman", 6, 5);
    resolveAttack(state, lancer, foe.col, foe.row);
    const meleeDmg = 100 - foe.hp;

    expect(lanceDmg).toBeGreaterThan(meleeDmg);
  });

  it("rejects abilities the unit does not have", () => {
    const state = bareGame();
    const warrior = place(state, 0, "warrior", 5, 5);
    expect(canUseAbility(state, warrior, "charge").ok).toBe(false);
  });
});
