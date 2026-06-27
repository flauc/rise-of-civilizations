import { describe, it, expect } from "vitest";
import { createGame } from "./setup";
import { beginTurn, applyCommand } from "./commands";
import { workableTiles, toggleCitizen, getCityYields, autoAssignCitizens } from "./economy";
import { convertCitizen, workerSlots } from "./specialists";
import { citiesOf, makeUnit, unitsOf } from "./state";
import { getTile } from "@roc/shared";

function foundedGame() {
  const s = createGame({ seed: "citz", cols: 40, rows: 28, barbarians: false });
  beginTurn(s);
  const settler = unitsOf(s, 0).find((u) => u.type === "settler")!;
  applyCommand(s, { type: "foundCity", unitId: settler.id });
  const city = citiesOf(s, 0)[0]!;
  // These tests reason about a single citizen; normalise to pop 1 (cities now found
  // at pop 2) and re-optimise so exactly one tile is worked.
  city.population = 1;
  autoAssignCitizens(s, city);
  return { s, city };
}

describe("citizen assignment", () => {
  it("a new city assigns its citizens to workable tiles", () => {
    const { s, city } = foundedGame();
    expect(city.workedTiles.length).toBe(city.population); // pop 1 -> 1 tile
    for (const key of city.workedTiles) {
      const [c, r] = key.split(",").map(Number) as [number, number];
      expect(getTile(s.map, c, r)!.ownerCityId).toBe(city.id);
    }
  });

  it("toggling a citizen on a tile changes the worked set and never exceeds population", () => {
    const { s, city } = foundedGame();
    const tiles = workableTiles(s, city);
    const target = tiles.find((t) => !city.workedTiles.includes(`${t.col},${t.row}`)) ?? tiles[0]!;
    const before = city.workedTiles.length;
    expect(applyCommand(s, { type: "assignCitizen", cityId: city.id, col: target.col, row: target.row }).ok).toBe(true);
    expect(city.workedTiles.length).toBeLessThanOrEqual(city.population);
    // toggling the same tile off (if it ended up on) reduces the set
    if (city.workedTiles.includes(`${target.col},${target.row}`)) {
      toggleCitizen(s, city, target.col, target.row);
      expect(city.workedTiles).not.toContain(`${target.col},${target.row}`);
    }
    expect(before).toBeGreaterThanOrEqual(0);
  });

  it("a citizen committed as a specialist can no longer work a tile", () => {
    const { s, city } = foundedGame();
    // Make every citizen a specialist (pop 1 -> 1 carpenter), leaving no free workers.
    expect(convertCitizen(s, city, "carpenter", 1).ok).toBe(true);
    expect(workerSlots(city)).toBe(0);
    // Training pulls the citizen off its tile…
    expect(city.workedTiles.length).toBe(0);

    // …and the player cannot re-assign that specialist onto a tile.
    const target = workableTiles(s, city)[0]!;
    const res = applyCommand(s, { type: "assignCitizen", cityId: city.id, col: target.col, row: target.row });
    expect(res.ok).toBe(false);
    expect(city.workedTiles.length).toBe(0);
  });

  it("an unlocked citizen moves onto a tile once it becomes more profitable", () => {
    const { s, city } = foundedGame(); // pop 1 -> 1 worked tile, none locked
    const tiles = workableTiles(s, city);
    const target = tiles[0]!;
    // Make `target` clearly the best tile and every other workable tile poor.
    for (const t of tiles) {
      const tile = getTile(s.map, t.col, t.row)!;
      tile.resource = undefined;
      if (t === target) {
        tile.terrain = "grassland";
        tile.improvement = "farm";
        tile.improvementLevel = 1;
      } else {
        tile.terrain = "desert";
        tile.improvement = undefined;
      }
    }
    autoAssignCitizens(s, city); // simulates the per-turn re-optimisation
    expect(city.workedTiles).toEqual([`${target.col},${target.row}`]);
  });

  it("auto-optimisation never reshuffles a tile the player locked", () => {
    const { s, city } = foundedGame(); // pop 1, capacity 1
    const tiles = workableTiles(s, city);
    // Lock a tile the city is NOT already auto-working (clicking an auto-worked
    // tile would instead unassign it — existing toggle semantics).
    const locked = tiles.find((t) => !city.workedTiles.includes(`${t.col},${t.row}`))!;
    const rival = tiles.find((t) => t !== locked)!;
    for (const t of tiles) getTile(s.map, t.col, t.row)!.resource = undefined;
    // The locked tile is weak; a different tile is far better.
    const lt = getTile(s.map, locked.col, locked.row)!;
    lt.terrain = "desert";
    lt.improvement = undefined;
    const rt = getTile(s.map, rival.col, rival.row)!;
    rt.terrain = "grassland";
    rt.improvement = "farm";
    rt.improvementLevel = 1;
    // The player explicitly assigns the weak tile (locking it).
    expect(applyCommand(s, { type: "assignCitizen", cityId: city.id, col: locked.col, row: locked.row }).ok).toBe(true);
    expect(city.workedTiles).toEqual([`${locked.col},${locked.row}`]);
    // Re-optimising must keep the manual pick despite the stronger rival.
    autoAssignCitizens(s, city);
    expect(city.workedTiles).toEqual([`${locked.col},${locked.row}`]);
  });

  it("an enemy/barbarian unit on a tile makes it unworkable and yields nothing", () => {
    const s = createGame({ seed: "citz-enemy", cols: 40, rows: 28, barbarians: true });
    beginTurn(s);
    const settler = unitsOf(s, 0).find((u) => u.type === "settler")!;
    applyCommand(s, { type: "foundCity", unitId: settler.id });
    const city = citiesOf(s, 0)[0]!;
    const barb = s.players.find((p) => p.isBarbarian)!; // hostile to everyone

    // An empty workable tile (avoid one already holding a friendly unit).
    const target = workableTiles(s, city).find((t) => !unitsOf(s, 0).some((u) => u.col === t.col && u.row === t.row))!;
    const key = `${target.col},${target.row}`;
    // Pin a citizen onto that exact tile.
    city.lockedTiles = [key];
    autoAssignCitizens(s, city);
    expect(city.workedTiles).toContain(key);
    const before = getCityYields(s, city);

    // Park a barbarian on the tile.
    const uid = s.nextEntityId++;
    s.units.set(uid, makeUnit(uid, barb.id, "warrior", target.col, target.row));

    // The tile drops out of the workable set…
    expect(workableTiles(s, city).some((t) => t.col === target.col && t.row === target.row)).toBe(false);
    // …and contributes no yields even while still listed as worked.
    const occupied = getCityYields(s, city);
    expect(occupied.food + occupied.production + occupied.gold + occupied.science)
      .toBeLessThan(before.food + before.production + before.gold + before.science);
  });

  it("worked tiles contribute their yields (incl. science)", () => {
    const { s, city } = foundedGame();
    const y1 = getCityYields(s, city);
    city.workedTiles = []; // unassign everyone
    const y0 = getCityYields(s, city);
    expect(y1.food + y1.production + y1.gold + y1.science).toBeGreaterThanOrEqual(
      y0.food + y0.production + y0.gold + y0.science,
    );
  });
});
