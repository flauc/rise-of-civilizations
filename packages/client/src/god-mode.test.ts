import { expect, test } from "vitest";
import { beginTurn, createGame, currentPlayer, unitAt } from "@roc/sim";
import { applyCheat } from "./god-mode";

function newGame() {
  const s = createGame({
    seed: "god",
    cols: 40,
    rows: 28,
    barbarians: false,
    humanSlots: 1,
    playerCount: 2,
  });
  beginTurn(s);
  return s;
}

test("unlocks every technology", () => {
  const s = newGame();
  const p = currentPlayer(s);
  const before = p.researched.size;
  const res = applyCheat(s, p.id, { type: "unlockTechs" });
  expect(res.ok).toBe(true);
  expect(p.researched.size).toBeGreaterThan(before);
  expect(p.researching).toBeNull();
});

test("builds and upgrades a road instantly", () => {
  const s = newGame();
  const p = currentPlayer(s);
  const tile = s.map.tiles.find((t) => t.terrain === "grassland" || t.terrain === "plains")!;
  const res = applyCheat(s, p.id, { type: "buildRoad", col: tile.col, row: tile.row, level: 3 });
  expect(res.ok).toBe(true);
  expect(tile.road).toBe(true);
  expect(tile.roadLevel).toBe(3);
});

test("founds a city by spawning a settler", () => {
  const s = newGame();
  const p = currentPlayer(s);
  const tile = s.map.tiles.find(
    (t) =>
      (t.terrain === "grassland" || t.terrain === "plains") && !unitAt(s, t.col, t.row),
  )!;
  const before = s.cities.size;
  const res = applyCheat(s, p.id, { type: "foundCity", col: tile.col, row: tile.row });
  expect(res.ok).toBe(true);
  expect(s.cities.size).toBe(before + 1);
});

test("spawns a unit and adds gold", () => {
  const s = newGame();
  const p = currentPlayer(s);
  const tile = s.map.tiles.find((t) => t.terrain === "grassland" || t.terrain === "plains")!;
  const beforeUnits = s.units.size;
  const beforeGold = p.gold;
  applyCheat(s, p.id, { type: "spawnUnit", unitType: "warrior", col: tile.col, row: tile.row });
  expect(s.units.size).toBe(beforeUnits + 1);
  applyCheat(s, p.id, { type: "addGold", amount: 100 });
  expect(p.gold).toBe(beforeGold + 100);
});

test("heals all own units", () => {
  const s = newGame();
  const p = currentPlayer(s);
  const u = [...s.units.values()].find((x) => x.ownerId === p.id)!;
  u.hp = 10;
  applyCheat(s, p.id, { type: "healUnits" });
  expect(u.hp).toBeGreaterThan(10);
});

test("reveals the entire map", () => {
  const s = newGame();
  const p = currentPlayer(s);
  p.explored.clear();
  applyCheat(s, p.id, { type: "revealMap" });
  expect(p.explored.size).toBe(s.map.cols * s.map.rows);
});
