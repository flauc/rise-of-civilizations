import { describe, it, expect } from "vitest";
import { createGame } from "./setup";
import { beginTurn, applyCommand } from "./commands";
import { unitsOf, citiesOf } from "./state";

function newGame() {
  const state = createGame({ seed: "test-research-queue", cols: 48, rows: 32, barbarians: false });
  beginTurn(state);
  return state;
}

describe("research queue", () => {
  it("setResearchTarget picks the first researchable prereq and queues the rest", () => {
    const state = newGame();
    const res = applyCommand(state, { type: "setResearchTarget", techId: "pottery_kiln" });
    expect(res.ok).toBe(true);
    const p = state.players[0]!;
    expect(p.researching).toBe("cultivation");
    expect(p.researchQueue).toEqual(["pottery_kiln"]);
  });

  it("advances through the queue as each tech completes", () => {
    const state = newGame();
    const settler = unitsOf(state, 0).find((u) => u.type === "settler")!;
    applyCommand(state, { type: "foundCity", unitId: settler.id });
    applyCommand(state, { type: "setResearchTarget", techId: "pottery_kiln" });

    // Run enough turns for a single city to finish cultivation + pottery_kiln.
    for (let i = 0; i < 45; i++) applyCommand(state, { type: "endTurn" });

    const p = state.players[0]!;
    expect(p.researched.has("cultivation")).toBe(true);
    expect(p.researched.has("pottery_kiln")).toBe(true);
    expect(p.researchQueue).toEqual([]);
    expect(p.researching).toBeNull();
  });

  it("manually picking a tech clears the research queue", () => {
    const state = newGame();
    applyCommand(state, { type: "setResearchTarget", techId: "pottery_kiln" });
    const res = applyCommand(state, { type: "setResearch", techId: "fire_hardening" });
    expect(res.ok).toBe(true);
    const p = state.players[0]!;
    expect(p.researching).toBe("fire_hardening");
    expect(p.researchQueue).toEqual([]);
  });

  it("rejects targeting a tech that is already known", () => {
    const state = newGame();
    const p = state.players[0]!;
    p.researched.add("pottery_kiln");
    const res = applyCommand(state, { type: "setResearchTarget", techId: "pottery_kiln" });
    expect(res.ok).toBe(false);
  });

  it("skips queue entries that were obtained by other means", () => {
    const state = newGame();
    applyCommand(state, { type: "setResearchTarget", techId: "pottery_kiln" });
    const p = state.players[0]!;
    // Grant the first queued tech through a village-style reward.
    p.researched.add("cultivation");
    applyCommand(state, { type: "setResearchTarget", techId: "pottery_kiln" });
    expect(p.researching).toBe("pottery_kiln");
    expect(p.researchQueue).toEqual([]);
  });
});
