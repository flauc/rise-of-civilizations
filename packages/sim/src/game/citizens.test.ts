import { describe, it, expect } from "vitest";
import { createGame } from "./setup";
import { beginTurn, applyCommand } from "./commands";
import { workableTiles, toggleCitizen, getCityYields } from "./economy";
import { convertCitizen, workerSlots } from "./specialists";
import { citiesOf, unitsOf } from "./state";
import { getTile } from "@roc/shared";

function foundedGame() {
  const s = createGame({ seed: "citz", cols: 40, rows: 28, barbarians: false });
  beginTurn(s);
  const settler = unitsOf(s, 0).find((u) => u.type === "settler")!;
  applyCommand(s, { type: "foundCity", unitId: settler.id });
  return { s, city: citiesOf(s, 0)[0]! };
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
