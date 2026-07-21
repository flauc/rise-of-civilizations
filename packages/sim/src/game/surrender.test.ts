import { describe, expect, it } from "vitest";
import { createGame } from "./setup";
import { applySurrender } from "./surrender";
import { citiesOf, unitsOf } from "./state";

describe("applySurrender", () => {
  it("eliminates the player, clears their map presence, and alerts rivals", () => {
    const state = createGame({
      seed: "surrender",
      cols: 24,
      rows: 16,
      humanSlots: 2,
      playerCount: 3,
    });
    const human = state.players.find((p) => p.isHuman)!;
    expect(unitsOf(state, human.id).length).toBeGreaterThan(0);

    const res = applySurrender(state, human.id);
    expect(res.ok).toBe(true);
    expect(human.eliminated).toBe(true);
    expect(citiesOf(state, human.id)).toHaveLength(0);
    expect(unitsOf(state, human.id)).toHaveLength(0);

    const alerts = state.turnUpdates.filter((e) => e.type === "civDefeated");
    expect(alerts.length).toBeGreaterThan(0);
    expect(alerts[0]!.message).toContain("surrendered");
    expect(alerts.some((e) => e.playerId === human.id)).toBe(false);
  });

  it("rejects repeat surrender", () => {
    const state = createGame({
      seed: "surrender-twice",
      cols: 24,
      rows: 16,
      humanSlots: 1,
      playerCount: 2,
    });
    const human = state.players.find((p) => p.isHuman)!;
    expect(applySurrender(state, human.id).ok).toBe(true);
    expect(applySurrender(state, human.id).ok).toBe(false);
  });
});
