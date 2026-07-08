import { describe, it, expect } from "vitest";
import { createGame } from "./setup";
import { TECH_DEFS } from "./content";
import {
  scaledCivicCost,
  scaledGovernmentCost,
  scaledTechCost,
} from "./game-speed";
import { getCivic, getGovernment } from "./civs";

describe("game speed", () => {
  it("defaults to normal (1× costs)", () => {
    const state = createGame({ seed: "speed-normal", barbarians: false });
    expect(scaledTechCost(state, "pottery_kiln")).toBe(TECH_DEFS.pottery_kiln.cost);
  });

  it("fast lowers research and civic costs", () => {
    const state = createGame({ seed: "speed-fast", gameSpeed: "fast", barbarians: false });
    expect(scaledTechCost(state, "pottery_kiln")).toBeLessThan(TECH_DEFS.pottery_kiln.cost);
    const gov = getGovernment("despotism")!;
    expect(scaledGovernmentCost(state, "despotism")).toBeLessThan(gov.cost);
    const civic = getCivic("civic_pride")!;
    expect(scaledCivicCost(state, civic, 0)).toBeLessThan(civic.cost);
  });

  it("epic raises research and civic costs", () => {
    const state = createGame({ seed: "speed-epic", gameSpeed: "epic", barbarians: false });
    expect(scaledTechCost(state, "pottery_kiln")).toBeGreaterThan(TECH_DEFS.pottery_kiln.cost);
    const gov = getGovernment("despotism")!;
    expect(scaledGovernmentCost(state, "despotism")).toBeGreaterThan(gov.cost);
  });
});
