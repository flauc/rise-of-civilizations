import { describe, it, expect } from "vitest";
import { createGame } from "./setup";
import { beginTurn, applyCommand } from "./commands";
import {
  RESOURCE_DEFS,
  resourceActive,
  resourceYields,
  gatherPlayerResources,
  cityAmenities,
  cityGrowthMultiplier,
  placeResources,
} from "./resources";
import { getTile } from "@roc/shared";
import { citiesOf, unitsOf } from "./state";
import { availableProduction, processCity } from "./economy";
import { UNIT_DEFS } from "./content";

function foundCapital(state: ReturnType<typeof createGame>): ReturnType<typeof citiesOf>[number] {
  const settler = unitsOf(state, 0).find((u) => u.type === "settler")!;
  applyCommand(state, { type: "foundCity", unitId: settler.id }, 0);
  return citiesOf(state, 0)[0]!;
}

describe("resources & amenities", () => {
  it("places resources on the map during setup", () => {
    const state = createGame({ seed: "res-map", cols: 40, rows: 28, barbarians: false });
    const resources = state.map.tiles.filter((t) => t.resource).length;
    expect(resources).toBeGreaterThan(10);
  });

  it("a resource only yields when improved with the matching improvement", () => {
    const state = createGame({ seed: "res-yield", cols: 30, rows: 20, barbarians: false });
    const tile = getTile(state.map, 5, 5)!;
    tile.resource = "iron";
    expect(resourceActive(tile)).toBe(false);
    expect(resourceYields(tile)).toEqual({ food: 0, production: 0, gold: 0, science: 0 });

    tile.improvement = "mine";
    expect(resourceActive(tile)).toBe(true);
    expect(resourceYields(tile)).toEqual({ food: 0, production: 1, gold: 0, science: 0 });
  });

  it("gathers strategic resources into the player's stockpile", () => {
    const state = createGame({ seed: "res-stock", cols: 30, rows: 20, barbarians: false });
    beginTurn(state); // establish territory / not needed, just start turn
    const city = foundCapital(state);

    // Put an improved iron tile inside the city's territory.
    const tile = getTile(state.map, city.col + 1, city.row)!;
    tile.resource = "iron";
    tile.improvement = "mine";
    tile.ownerCityId = city.id;

    const player = state.players[0]!;
    expect(player.resources.iron ?? 0).toBe(0);
    gatherPlayerResources(state, 0);
    expect(player.resources.iron).toBe(1);

    // A second gather adds another unit.
    gatherPlayerResources(state, 0);
    expect(player.resources.iron).toBe(2);
  });

  it("only lists units in production when the required strategic resource is available", () => {
    const state = createGame({ seed: "res-prod", cols: 30, rows: 20, barbarians: false });
    const city = foundCapital(state);
    const player = state.players[0]!;

    player.researched.add("iron_bloomery");
    expect(availableProduction(player, city).some((o) => o.item.id === "swordsman")).toBe(false);

    player.resources.iron = 1;
    expect(availableProduction(player, city).some((o) => o.item.id === "swordsman")).toBe(true);
  });

  it("consumes the strategic resource when a unit finishes", () => {
    const state = createGame({ seed: "res-consume", cols: 30, rows: 20, barbarians: false });
    const city = foundCapital(state);
    const player = state.players[0]!;

    player.researched.add("iron_bloomery");
    player.resources.iron = 1;
    city.production = { kind: "unit", id: "swordsman" };
    city.productionStored = UNIT_DEFS.swordsman.cost;

    processCity(state, city, player);
    expect(player.resources.iron).toBe(0);
    expect(unitsOf(state, 0).some((u) => u.type === "swordsman")).toBe(true);
  });

  it("amenities come from unique luxury types owned", () => {
    const state = createGame({ seed: "res-amenity", cols: 30, rows: 20, barbarians: false });
    const city = foundCapital(state);

    // One wine tile and one silk tile, both improved and owned.
    const wine = getTile(state.map, city.col + 1, city.row)!;
    wine.resource = "wine";
    wine.improvement = "plantation";
    wine.ownerCityId = city.id;

    const silk = getTile(state.map, city.col - 1, city.row)!;
    silk.resource = "silk";
    silk.improvement = "plantation";
    silk.ownerCityId = city.id;

    expect(cityAmenities(state, city)).toBe(2);
  });

  it("unhappiness reduces growth when amenities are low", () => {
    const state = createGame({ seed: "res-happy", cols: 30, rows: 20, barbarians: false });
    const city = foundCapital(state);
    city.population = 4; // high unhappiness
    city.foodStored = 0;

    expect(cityAmenities(state, city)).toBe(0);
    expect(cityGrowthMultiplier(state, city)).toBeLessThan(1);
  });

  it("placeResources is deterministic for the same seed", () => {
    const a = createGame({ seed: "det", cols: 40, rows: 28, barbarians: false });
    const b = createGame({ seed: "det", cols: 40, rows: 28, barbarians: false });
    const idsA = a.map.tiles.map((t) => `${t.col},${t.row}:${t.resource ?? ""}`).join("|");
    const idsB = b.map.tiles.map((t) => `${t.col},${t.row}:${t.resource ?? ""}`).join("|");
    expect(idsA).toBe(idsB);
  });
});
