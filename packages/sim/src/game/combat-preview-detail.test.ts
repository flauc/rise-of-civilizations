import { describe, it, expect } from "vitest";
import { createGame } from "./setup";
import { combatPreviewDetail } from "./combat-preview-detail";
import { makeUnit, type GameState, type Unit } from "./state";

function bareGame(): GameState {
  const state = createGame({ seed: "preview", cols: 30, rows: 20, barbarians: false });
  state.units.clear();
  for (const a of state.players) {
    for (const b of state.players) {
      if (a.id !== b.id && !a.atWar.includes(b.id)) a.atWar.push(b.id);
    }
  }
  return state;
}

function place(state: GameState, owner: number, type: Unit["type"], col: number, row: number): Unit {
  const id = state.nextEntityId++;
  const u = makeUnit(id, owner, type, col, row);
  state.units.set(id, u);
  return u;
}

describe("combatPreviewDetail", () => {
  it("returns preview with modifiers on both sides", () => {
    const state = bareGame();
    const atk = place(state, 0, "swordsman", 5, 5);
    const def = place(state, 1, "warrior", 6, 5);
    const detail = combatPreviewDetail(state, atk, def.col, def.row);
    expect(detail).not.toBeNull();
    expect(detail!.preview.toDefender).toBeGreaterThan(0);
    expect(detail!.attackerTokenId).toBeTruthy();
    expect(detail!.attackerHpAfter).toBe(Math.max(0, detail!.attackerHp - detail!.preview.toAttacker));
    expect(detail!.defenderHpAfter).toBe(Math.max(0, detail!.defenderHp - detail!.preview.toDefender));
    expect(detail!.attackerDamage).toBe(detail!.preview.toDefender);
  });

  it("reports no retaliation for ranged attacks", () => {
    const state = bareGame();
    const archer = place(state, 0, "archer", 5, 5);
    const target = place(state, 1, "warrior", 7, 5);
    const detail = combatPreviewDetail(state, archer, target.col, target.row);
    expect(detail).not.toBeNull();
    expect(detail!.preview.toAttacker).toBe(0);
    expect(detail!.defenderTokenId).toBeTruthy();
  });

  it("includes city defenses when attacking a city", () => {
    const state = bareGame();
    const atk = place(state, 0, "swordsman", 5, 5);
    const cityId = state.nextEntityId++;
    state.cities.set(cityId, {
      id: cityId,
      ownerId: 1,
      name: "Rome",
      col: 6,
      row: 5,
      population: 2,
      foodStored: 0,
      productionStored: 0,
      production: null,
      buildings: [],
      specialists: [],
      wonders: [],
      workedTiles: [],
      isCapital: true,
      foundedAsCapital: true,
      hp: 100,
      lastAttackedTurn: 0,
      rangedAttackUsed: false,
      training: {},
      trainingQueue: [],
      modifiers: [],
    } as never);
    const detail = combatPreviewDetail(state, atk, 6, 5);
    expect(detail).not.toBeNull();
    expect(detail!.preview.vsCity).toBe(true);
    expect(detail!.defenderCityTier).not.toBeNull();
    expect(detail!.defenderTokenId).toBeNull();
    expect(detail!.defenderName).toBe("Rome");
  });
});
