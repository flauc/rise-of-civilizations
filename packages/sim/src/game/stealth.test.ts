import { describe, it, expect } from "vitest";
import { getTile, type TerrainType } from "@roc/shared";
import { createGame } from "./setup";
import { applyCommand, beginTurn } from "./commands";
import { useAbility, unitAbilities } from "./abilities";
import { breakCover, canStealthMove } from "./stealth";
import { viewForPlayer } from "./serialize";
import { makeUnit, playerById, type GameState, type Unit } from "./state";

function warAll(state: GameState): void {
  for (const a of state.players) {
    for (const b of state.players) {
      if (a.id !== b.id && !a.atWar.includes(b.id)) a.atWar.push(b.id);
    }
  }
}

function bareGame(): GameState {
  const state = createGame({ seed: "stealth", cols: 30, rows: 20, barbarians: false });
  state.units.clear();
  warAll(state);
  return state;
}

function setTerrain(state: GameState, col: number, row: number, terrain: TerrainType): void {
  const t = getTile(state.map, col, row);
  if (t) t.terrain = terrain;
}

function place(state: GameState, owner: number, type: Unit["type"], col: number, row: number): Unit {
  const id = state.nextEntityId++;
  const u = makeUnit(id, owner, type, col, row);
  u.movementLeft = 4;
  state.units.set(id, u);
  return u;
}

describe("hide & ambush", () => {
  it("foot infantry can Hide in forest but not on open ground", () => {
    const state = bareGame();
    const spear = place(state, 0, "spearman", 5, 5);

    setTerrain(state, 5, 5, "grassland");
    expect(useAbility(state, spear, "hide").ok).toBe(false); // no cover

    setTerrain(state, 5, 5, "forest");
    expect(useAbility(state, spear, "hide").ok).toBe(true);
    expect(spear.hidden).toBe(true);
    expect(spear.movementLeft).toBe(0); // forfeits remaining movement
  });

  it("requires at least one movement point to hide", () => {
    const state = bareGame();
    setTerrain(state, 5, 5, "forest");
    const spear = place(state, 0, "spearman", 5, 5);
    spear.movementLeft = 0;
    expect(useAbility(state, spear, "hide").ok).toBe(false);
  });

  it("cavalry cannot hide unless their unique unit grants it", () => {
    const state = bareGame();
    setTerrain(state, 5, 5, "forest");
    const rider = place(state, 0, "rider", 5, 5);
    expect(unitAbilities(state, rider).includes("hide")).toBe(false);
    expect(useAbility(state, rider, "hide").ok).toBe(false);
  });

  it("a hidden unit is concealed from enemies in the per-player view", () => {
    const state = bareGame();
    setTerrain(state, 5, 5, "forest");
    const spear = place(state, 0, "spearman", 5, 5);
    place(state, 1, "scout", 6, 5); // an enemy that can see the tile

    spear.hidden = true;
    let enemyView = viewForPlayer(state, 1);
    expect(enemyView.units.some((u) => u.col === 5 && u.row === 5)).toBe(false);

    spear.hidden = false;
    enemyView = viewForPlayer(state, 1);
    expect(enemyView.units.some((u) => u.col === 5 && u.row === 5)).toBe(true);
  });

  it("stepping onto a concealed enemy springs an ambush", () => {
    const state = bareGame();
    setTerrain(state, 5, 5, "forest");
    setTerrain(state, 6, 5, "grassland");
    const hider = place(state, 0, "spearman", 5, 5);
    hider.hidden = true;
    const intruder = place(state, 1, "warrior", 6, 5);

    const res = applyCommand(state, { type: "move", unitId: intruder.id, col: 5, row: 5 }, 1);
    expect(res.ok).toBe(true);
    expect(hider.hidden).toBe(false); // revealed by the ambush
    expect(intruder.col).toBe(6); // halted — did not take the tile
    expect(intruder.row).toBe(5);
    expect(intruder.hp).toBeLessThan(100); // took ambush damage
    expect(intruder.movementLeft).toBe(0);
  });

  it("breaking cover within 2 tiles of an enemy grants the ambush attack window", () => {
    const state = bareGame();
    setTerrain(state, 5, 5, "forest");
    const hider = place(state, 0, "spearman", 5, 5);
    hider.hidden = true;
    place(state, 1, "warrior", 6, 5); // enemy within 2 tiles

    breakCover(state, hider);
    expect(hider.hidden).toBe(false);
    expect(hider.ambushReadyUntilTurn).toBe(state.turn);
    expect(hider.ambushBonus).toBeGreaterThan(0);
  });

  it("Reconnoiter reveals hidden enemy units in sight", () => {
    const state = bareGame();
    const scout = place(state, 0, "scout", 5, 5);
    setTerrain(state, 6, 5, "forest");
    const lurker = place(state, 1, "spearman", 6, 5);
    lurker.hidden = true;

    expect(useAbility(state, scout, "reconnoiter").ok).toBe(true);
    expect(lurker.hidden).toBe(false);
  });
});

describe("civ-unique abilities (§8)", () => {
  it("a civ's unique unit fields its bespoke ability in place of the base one", () => {
    const state = bareGame();
    playerById(state, 0)!.civId = "han_china"; // Cho-Ko-Nu replaces the Crossbowman
    const chokonu = place(state, 0, "crossbowman", 5, 5);
    const abilities = unitAbilities(state, chokonu);
    expect(abilities.includes("repeating_fire")).toBe(true);
    expect(abilities.includes("pierce")).toBe(false);
  });

  it("an ordinary civ's unit keeps its base-class ability", () => {
    const state = bareGame();
    playerById(state, 0)!.civId = "egypt"; // no crossbow unique
    const xbow = place(state, 0, "crossbowman", 5, 5);
    expect(unitAbilities(state, xbow).includes("pierce")).toBe(true);
  });

  it("Sumer's War-Cart wields the early War-Cart Charge", () => {
    const state = bareGame();
    playerById(state, 0)!.civId = "sumer"; // War-Cart replaces the Light Chariot
    const cart = place(state, 0, "light_chariot", 5, 5);
    const abilities = unitAbilities(state, cart);
    expect(abilities.includes("war_cart_charge")).toBe(true);
    expect(abilities.includes("charge")).toBe(false);
  });
});

describe("stealth repositioning", () => {
  it("a guerrilla unique can creep while staying hidden; an ordinary hider cannot", () => {
    const state = bareGame();
    playerById(state, 0)!.civId = "lusitani"; // Falcata Warrior can stealth-move
    setTerrain(state, 5, 5, "forest");
    setTerrain(state, 6, 5, "plains");
    const guerrilla = place(state, 0, "swordsman", 5, 5);
    expect(canStealthMove(state, guerrilla)).toBe(true);
    guerrilla.hidden = true;
    guerrilla.movementLeft = 1;
    const res = applyCommand(state, { type: "move", unitId: guerrilla.id, col: 6, row: 5 }, 0);
    expect(res.ok).toBe(true);
    expect(guerrilla.col).toBe(6); // repositioned
    expect(guerrilla.hidden).toBe(true); // and still concealed

    // An ordinary forest hider breaks cover the moment it moves.
    playerById(state, 1)!.civId = "egypt";
    setTerrain(state, 10, 5, "forest");
    setTerrain(state, 11, 5, "plains");
    const grunt = place(state, 1, "swordsman", 10, 5);
    expect(canStealthMove(state, grunt)).toBe(false);
    grunt.hidden = true;
    grunt.movementLeft = 2;
    applyCommand(state, { type: "move", unitId: grunt.id, col: 11, row: 5 }, 1);
    expect(grunt.hidden).toBe(false); // revealed by moving
  });

  it("a hidden stealth-mover starts its turn at one third movement", () => {
    const state = bareGame();
    playerById(state, 0)!.civId = "lusitani";
    setTerrain(state, 5, 5, "forest");
    const guerrilla = place(state, 0, "swordsman", 5, 5); // base movement 2
    guerrilla.hidden = true;
    beginTurn(state); // refreshes movement for the current player (player 0)
    expect(guerrilla.hidden).toBe(true);
    expect(guerrilla.movementLeft).toBe(1); // floor(2/3) clamped to a minimum of 1
  });
});
