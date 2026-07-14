import { describe, it, expect } from "vitest";
import { createGame } from "./setup";
import { beginTurn, applyCommand } from "./commands";
import { citiesOf, unitsOf } from "./state";
import { buildSessionScoreboard } from "./session-snapshot";

describe("buildSessionScoreboard", () => {
  it("captures cities, techs, and economy per player", () => {
    const state = createGame({ seed: "snap", cols: 40, rows: 28, barbarians: false });
    beginTurn(state);
    const settler = unitsOf(state, 0).find((u) => u.type === "settler")!;
    applyCommand(state, { type: "foundCity", unitId: settler.id });

    const board = buildSessionScoreboard(state, 0);
    expect(board.length).toBeGreaterThan(1);
    const viewer = board.find((p) => p.isViewer)!;
    expect(viewer.cities).toBe(1);
    expect(viewer.cityNames).toEqual([citiesOf(state, 0)[0]!.name]);
    expect(viewer.population).toBeGreaterThan(0);
    expect(viewer.gold).toBeTypeOf("number");
    expect(viewer.techs?.length).toBeGreaterThan(0);
    expect(viewer.government).toBeTruthy();
  });
});
