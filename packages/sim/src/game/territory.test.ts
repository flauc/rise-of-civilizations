import { describe, it, expect } from "vitest";
import { createGame } from "./setup";
import { beginTurn, applyCommand } from "./commands";
import { territorySize, expandTerritory } from "./territory";
import { citiesOf, unitsOf } from "./state";
import { getTile } from "@roc/shared";

describe("territory", () => {
  it("a new city claims its center plus a ring, and tiles are owned", () => {
    const state = createGame({ seed: "terr", cols: 40, rows: 28, barbarians: false });
    beginTurn(state);
    const settler = unitsOf(state, 0).find((u) => u.type === "settler")!;
    applyCommand(state, { type: "foundCity", unitId: settler.id });
    const city = citiesOf(state, 0)[0]!;
    // center + 6 neighbors (minus any out-of-bounds/water already-claimed) -> ~7
    expect(territorySize(state, city)).toBeGreaterThanOrEqual(4);
    expect(getTile(state.map, city.col, city.row)!.ownerCityId).toBe(city.id);
  });

  it("expands borders when the city grows", () => {
    const state = createGame({ seed: "terr2", cols: 40, rows: 28, barbarians: false });
    beginTurn(state);
    const settler = unitsOf(state, 0).find((u) => u.type === "settler")!;
    applyCommand(state, { type: "foundCity", unitId: settler.id });
    const city = citiesOf(state, 0)[0]!;
    const before = territorySize(state, city);
    expandTerritory(state, city, 3);
    expect(territorySize(state, city)).toBeGreaterThan(before);
  });
});

// getTile is re-exported from @roc/sim via state? It's from @roc/shared; import path note:
