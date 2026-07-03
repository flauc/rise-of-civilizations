import { describe, it, expect } from "vitest";
import { createGame } from "./setup";
import { beginTurn, applyCommand } from "./commands";
import { availableProduction } from "./economy";
import { offsetNeighbors } from "./movement";
import { citiesOf, unitsOf, type GameState } from "./state";
import { getTile } from "@roc/shared";

function game(): GameState {
  const s = createGame({ seed: "coastal-test", cols: 40, rows: 28, barbarians: false, humanSlots: 2 });
  beginTurn(s);
  return s;
}

function foundCity(s: GameState, owner = 0) {
  const settler = unitsOf(s, owner).find((u) => u.type === "settler")!;
  applyCommand(s, { type: "foundCity", unitId: settler.id }, owner);
  return citiesOf(s, owner)[0]!;
}

/** Force every tile around a city to be land (landlocked) or make one neighbour water. */
function setCoastal(s: GameState, city: { col: number; row: number }, coastal: boolean) {
  const neighbors = offsetNeighbors(s.map, city.col, city.row);
  for (const n of neighbors) {
    const t = getTile(s.map, n.col, n.row);
    if (t) t.terrain = "grassland" as typeof t.terrain;
  }
  if (coastal) {
    const first = getTile(s.map, neighbors[0]!.col, neighbors[0]!.row)!;
    first.terrain = "ocean" as typeof first.terrain;
  }
}

describe("coastal buildings", () => {
  it("offers the Harbor only in a city adjacent to water", () => {
    const s = game();
    const city = foundCity(s, 0);
    s.players[0]!.researched.add("sailcloth");
    const harborOffered = () =>
      availableProduction(s, s.players[0]!, city).some((o) => o.item.kind === "building" && o.item.id === "harbor");

    setCoastal(s, city, false);
    expect(harborOffered()).toBe(false); // landlocked → no harbor

    setCoastal(s, city, true);
    expect(harborOffered()).toBe(true); // water in the inner ring → harbor available
  });

  it("rejects a setProduction command for a Harbor in a landlocked city", () => {
    const s = game();
    const city = foundCity(s, 0);
    s.players[0]!.researched.add("sailcloth");
    setCoastal(s, city, false);
    expect(
      applyCommand(s, { type: "setProduction", cityId: city.id, item: { kind: "building", id: "harbor" } }, 0).ok,
    ).toBe(false);

    setCoastal(s, city, true);
    expect(
      applyCommand(s, { type: "setProduction", cityId: city.id, item: { kind: "building", id: "harbor" } }, 0).ok,
    ).toBe(true);
  });
});
