import { describe, it, expect } from "vitest";
import { createGame } from "./setup";
import { beginTurn, applyCommand } from "./commands";
import { availableProduction, processCity, getCityYields, autoAssignCitizens } from "./economy";
import { citiesOf, unitsOf, type GameState } from "./state";
import { PROJECT_DEFS } from "./content";

function game(): GameState {
  const s = createGame({ seed: "project-test", cols: 40, rows: 28, barbarians: false, humanSlots: 2 });
  beginTurn(s);
  return s;
}

function foundCity(s: GameState, owner = 0) {
  const settler = unitsOf(s, owner).find((u) => u.type === "settler")!;
  applyCommand(s, { type: "foundCity", unitId: settler.id }, owner);
  return citiesOf(s, owner)[0]!;
}

describe("conversion projects", () => {
  it("offers Coinage to everyone but gates the others behind their tech", () => {
    const s = game();
    const player = s.players[0]!;
    const city = foundCity(s, 0);
    const offered = (id: string) =>
      availableProduction(s, player, city).some((o) => o.item.kind === "project" && o.item.id === id);

    expect(offered("coinage")).toBe(true); // always available
    expect(offered("scholarship")).toBe(false);
    expect(offered("patronage")).toBe(false);
    expect(offered("tithe")).toBe(false);

    player.researched.add(PROJECT_DEFS.scholarship.reqTech!);
    player.researched.add(PROJECT_DEFS.patronage.reqTech!);
    player.researched.add(PROJECT_DEFS.tithe.reqTech!); // tithe is gated by Theology
    expect(offered("scholarship")).toBe(true);
    expect(offered("patronage")).toBe(true);
    expect(offered("tithe")).toBe(true);
  });

  it("Coinage converts the city's production into gold each turn (1:1)", () => {
    const s = game();
    const player = s.players[0]!;
    const city = foundCity(s, 0);
    city.production = { kind: "project", id: "coinage" };
    city.productionStored = 0;

    const goldBefore = player.gold;
    autoAssignCitizens(s, city);
    const y = getCityYields(s, city);
    processCity(s, city, player);

    // The city still earns its normal gold yield; the project mints its full
    // production into gold on top of that (1:1).
    expect(player.gold).toBe(goldBefore + y.gold + y.production);
    expect(city.productionStored).toBe(0); // nothing banked — fully converted
  });

  it("Scholarship pours half the city's production into science (research)", () => {
    const s = game();
    const player = s.players[0]!;
    player.researched.add("scholasticism");
    player.researching = null; // avoid spending the science on a tech this turn
    const city = foundCity(s, 0);
    city.production = { kind: "project", id: "scholarship" };
    city.productionStored = 0;

    const sciBefore = player.scienceProgress;
    const prod = getProd(s, city);
    processCity(s, city, player);

    // half the production (floored) converts; base city science (+ tile science)
    // is still added by the empire-pool section on top.
    expect(player.scienceProgress).toBeGreaterThanOrEqual(sciBefore + Math.floor(prod * 0.5));
  });

  it("setProduction accepts a project command and validates its tech gate", () => {
    const s = game();
    const player = s.players[0]!;
    const city = foundCity(s, 0);
    // Coinage is allowed; scholarship is not until researched.
    expect(applyCommand(s, { type: "setProduction", cityId: city.id, item: { kind: "project", id: "coinage" } }, 0).ok).toBe(true);
    expect(applyCommand(s, { type: "setProduction", cityId: city.id, item: { kind: "project", id: "scholarship" } }, 0).ok).toBe(false);
    player.researched.add("scholasticism");
    expect(applyCommand(s, { type: "setProduction", cityId: city.id, item: { kind: "project", id: "scholarship" } }, 0).ok).toBe(true);
  });
});

/** The production yield processCity will bank/convert this turn. */
function getProd(s: GameState, city: ReturnType<typeof foundCity>): number {
  // Mirror processCity: it auto-assigns citizens then reads getCityYields.
  autoAssignCitizens(s, city);
  return getCityYields(s, city).production;
}
