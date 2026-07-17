import { expect, test } from "vitest";
import { getTile } from "@roc/shared";
import { beginTurn, createGame, currentPlayer, territorySize, unitAt } from "@roc/sim";
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

test("adds population and expands each city by one tile", () => {
  const s = newGame();
  const p = currentPlayer(s);
  const tile = s.map.tiles.find(
    (t) =>
      (t.terrain === "grassland" || t.terrain === "plains") && !unitAt(s, t.col, t.row),
  )!;
  applyCheat(s, p.id, { type: "foundCity", col: tile.col, row: tile.row });
  const city = [...s.cities.values()].find((c) => c.ownerId === p.id)!;
  const beforePop = city.population;
  const beforeTerritory = territorySize(s, city);
  const res = applyCheat(s, p.id, { type: "addPopulation" });
  expect(res.ok).toBe(true);
  expect(city.population).toBe(beforePop + 1);
  expect(territorySize(s, city)).toBeGreaterThan(beforeTerritory);
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

test("builds an economic improvement and a defensive structure", () => {
  const s = newGame();
  const p = currentPlayer(s);
  const farmTile = s.map.tiles.find((t) => t.terrain === "grassland")!;
  const wallTile = s.map.tiles.find((t) => (t.terrain === "plains" || t.terrain === "grassland") && t !== farmTile)!;

  const farmRes = applyCheat(s, p.id, { type: "buildWork", kind: "farm", col: farmTile.col, row: farmTile.row });
  expect(farmRes.ok).toBe(true);
  expect(farmTile.improvement).toBe("farm");
  expect(farmTile.improvementLevel).toBe(3);

  const wallRes = applyCheat(s, p.id, { type: "buildWork", kind: "wall", col: wallTile.col, row: wallTile.row });
  expect(wallRes.ok).toBe(true);
  expect(wallTile.structure).toMatchObject({ kind: "wall", tier: 3 });
  expect(wallTile.structure!.hp).toBeGreaterThan(0);
});

test("spawns a naval unit on a water tile", () => {
  const s = newGame();
  const p = currentPlayer(s);
  const tile = s.map.tiles.find((t) => t.terrain === "coast" || t.terrain === "lake")!;
  const beforeUnits = s.units.size;
  const res = applyCheat(s, p.id, { type: "spawnUnit", unitType: "galley", col: tile.col, row: tile.row });
  expect(res.ok).toBe(true);
  expect(s.units.size).toBe(beforeUnits + 1);
  const spawned = unitAt(s, tile.col, tile.row);
  expect(spawned?.type).toBe("galley");
});

test("places land units on nearby land when a water tile is selected", () => {
  const s = newGame();
  const p = currentPlayer(s);
  const tile = s.map.tiles.find((t) => t.terrain === "ocean")!;
  const beforeIds = new Set(s.units.keys());
  const res = applyCheat(s, p.id, { type: "spawnUnit", unitType: "warrior", col: tile.col, row: tile.row });
  expect(res.ok).toBe(true);
  const spawned = [...s.units.values()].find((u) => !beforeIds.has(u.id))!;
  expect(spawned.type).toBe("warrior");
  const spawnTile = getTile(s.map, spawned.col, spawned.row)!;
  expect(spawnTile.terrain).not.toBe("ocean");
});
