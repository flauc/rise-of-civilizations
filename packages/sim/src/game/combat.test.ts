import { describe, it, expect } from "vitest";
import { createGame } from "./setup";
import { beginTurn } from "./commands";
import { damageFrom, resolveAttack, cityMaxHp, unitMaxHp, availablePromotions } from "./combat";
import { PROMOTION_DEFS } from "./content";
import { citiesOf, makeUnit, type GameState, type Unit } from "./state";

function warAll(state: GameState): void {
  // Combat scenarios assume open hostility — put every major civ at war.
  for (const a of state.players) {
    for (const b of state.players) {
      if (a.id !== b.id && !a.atWar.includes(b.id)) a.atWar.push(b.id);
    }
  }
}

function bareGame(): GameState {
  // No barbarians, no starting units to keep scenarios controlled.
  const state = createGame({ seed: "combat", cols: 30, rows: 20, barbarians: false });
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
      foodStored: 0, productionStored: 0, production: null, buildings: [], specialists: [], wonders: [], workedTiles: [],
      isCapital: true, foundedAsCapital: true, hp: 0, lastAttackedTurn: 0, rangedAttackUsed: false, modifiers: [],
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

  it("clears a barbarian camp when advancing onto it after killing its defender", () => {
    const state = bareGame();
    const tile = state.map.tiles.find((t) => t.col === 6 && t.row === 5)!;
    tile.feature = "barb_camp";
    const atk = place(state, 0, "swordsman", 5, 5);
    const def = place(state, 1, "scout", 6, 5); // weak defender standing on the camp
    def.hp = 1; // ensure the swordsman kills and advances in
    const p0 = state.players[0]!;
    const goldBefore = p0.gold;
    const res = resolveAttack(state, atk, 6, 5);
    expect(res.ok).toBe(true);
    expect(atk.col).toBe(6);
    expect(atk.row).toBe(5); // advanced onto the camp tile
    expect(tile.feature).toBeUndefined(); // camp cleared on entry
    expect(p0.gold).toBeGreaterThan(goldBefore); // reward paid
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

  it("unit max HP increases by 5% per level", () => {
    const state = bareGame();
    const u = place(state, 0, "warrior", 5, 5);
    expect(unitMaxHp(u)).toBe(100);
    u.level = 2;
    expect(unitMaxHp(u)).toBe(105);
    u.level = 3;
    expect(unitMaxHp(u)).toBe(110);
  });

  it("leveling up heals the unit for 20% of its new max HP", () => {
    const state = bareGame();
    const archer = place(state, 0, "archer", 5, 5);
    const target = place(state, 1, "warrior", 7, 5);
    archer.xp = 9; // one XP away from level 2
    archer.hp = 50;
    resolveAttack(state, archer, target.col, target.row);
    expect(archer.level).toBe(2);
    expect(unitMaxHp(archer)).toBe(105);
    // 50 + 20% of 105 = 50 + 21 = 71, capped at new max.
    expect(archer.hp).toBe(71);
  });

  it("a higher-level unit deals more damage than a same-type level 1 unit", () => {
    const state = bareGame();
    const lv1Archer = place(state, 0, "archer", 6, 5);
    const lv2Archer = place(state, 0, "archer", 6, 4);
    lv2Archer.level = 2;
    const targetA = place(state, 1, "warrior", 7, 5);
    const targetB = place(state, 1, "warrior", 7, 4);
    resolveAttack(state, lv1Archer, targetA.col, targetA.row);
    const targetHpAfterLv1 = targetA.hp;
    resolveAttack(state, lv2Archer, targetB.col, targetB.row);
    expect(targetB.hp).toBeLessThan(targetHpAfterLv1);
  });

  it("ends the game immediately when a player's last city is captured", () => {
    const state = bareGame();
    const mkCity = (ownerId: number, name: string, col: number, row: number) => {
      const cid = state.nextEntityId++;
      const c = {
        id: cid, ownerId, name, col, row, population: 1, foodStored: 0, productionStored: 0,
        production: null, buildings: [], specialists: [], wonders: [], workedTiles: [], isCapital: true, foundedAsCapital: true,
        hp: 100, lastAttackedTurn: 0, rangedAttackUsed: false, modifiers: [],
      };
      state.cities.set(cid, c);
      return c;
    };
    // Player 0 owns two cities; player 1 owns one city (their last).
    const p0City = mkCity(0, "P0-Capital", 5, 5);
    const p1City = mkCity(1, "P1-Capital", 14, 5);
    // Give player 0 a second city.
    const id = state.nextEntityId++;
    state.cities.set(id, {
      id,
      ownerId: 0,
      name: "P0-Second",
      col: p0City.col + 2,
      row: p0City.row,
      population: 1,
      foodStored: 0,
      productionStored: 0,
      production: null,
      buildings: [],
      specialists: [],
      wonders: [],
      workedTiles: [],
      isCapital: false,
      foundedAsCapital: false,
      hp: 0,
      lastAttackedTurn: 0,
      rangedAttackUsed: false, modifiers: [],
    });
    p1City.hp = 0; // already battered
    const swordsman = place(state, 0, "swordsman", p1City.col + 1, p1City.row);
    swordsman.movementLeft = 2;
    swordsman.attackedThisTurn = false;
    expect(state.gameOver).toBeNull();
    resolveAttack(state, swordsman, p1City.col, p1City.row);
    expect(state.gameOver).not.toBeNull();
    expect(state.gameOver?.winnerId).toBe(0);
  });

  it("toughness increases max HP", () => {
    const state = bareGame();
    const u = place(state, 0, "warrior", 5, 5);
    expect(unitMaxHp(u)).toBe(100);
    u.promotions.push("toughness");
    expect(unitMaxHp(u)).toBe(115);
  });

  it("charge deals more damage on the first attack", () => {
    const state = bareGame();
    const normal = place(state, 0, "warrior", 5, 5);
    const charger = place(state, 0, "warrior", 5, 6);
    charger.promotions.push("charge");
    const targetA = place(state, 1, "warrior", 6, 5);
    const targetB = place(state, 1, "warrior", 6, 6);
    resolveAttack(state, normal, targetA.col, targetA.row);
    resolveAttack(state, charger, targetB.col, targetB.row);
    expect(targetB.hp).toBeLessThan(targetA.hp);
  });

  it("only tier-1 promotions are available at level 2", () => {
    const state = bareGame();
    const archer = place(state, 0, "archer", 5, 5);
    archer.level = 2;
    const options = availablePromotions(archer);
    expect(options.length).toBeGreaterThan(0);
    expect(options.some((p) => PROMOTION_DEFS[p].tier === 2)).toBe(false);
    expect(options.some((p) => PROMOTION_DEFS[p].tier === 3)).toBe(false);
  });

  it("tier-2 promotions become available at level 3", () => {
    const state = bareGame();
    const archer = place(state, 0, "archer", 5, 5);
    archer.level = 3;
    const options = availablePromotions(archer);
    expect(options.some((p) => PROMOTION_DEFS[p].tier === 2)).toBe(true);
    expect(options.some((p) => PROMOTION_DEFS[p].tier === 3)).toBe(false);
  });

  it("a chained promotion stays locked until its prerequisite is held", () => {
    const state = bareGame();
    const scout = place(state, 0, "scout", 5, 5);
    scout.level = 3; // tier 2 unlocked by level

    // slip_away (tier 2) requires evasion (tier 1) first.
    let options = availablePromotions(scout);
    expect(options).toContain("evasion");
    expect(options).not.toContain("slip_away");

    scout.promotions.push("evasion");
    options = availablePromotions(scout);
    expect(options).toContain("slip_away");
    expect(options).not.toContain("evasion"); // already held

    // vanish (tier 3) still requires slip_away and a high enough level.
    scout.promotions.push("slip_away");
    scout.level = 4;
    options = availablePromotions(scout);
    expect(options).toContain("vanish");
  });

  it("extended_range lets archers attack one tile farther", () => {
    const state = bareGame();
    const archer = place(state, 0, "archer", 5, 5);
    const farTarget = place(state, 1, "warrior", 8, 5); // distance 3
    const closeTarget = place(state, 1, "warrior", 7, 5); // distance 2
    // Without promotion, only distance 2 is reachable.
    expect(resolveAttack(state, archer, farTarget.col, farTarget.row).ok).toBe(false);
    expect(resolveAttack(state, archer, closeTarget.col, closeTarget.row).ok).toBe(true);

    const archer2 = place(state, 0, "archer", 10, 5);
    archer2.promotions.push("extended_range");
    const farTarget2 = place(state, 1, "warrior", 13, 5); // distance 3
    expect(resolveAttack(state, archer2, farTarget2.col, farTarget2.row).ok).toBe(true);
  });
});
