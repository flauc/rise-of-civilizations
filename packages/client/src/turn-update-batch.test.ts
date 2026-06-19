import { describe, expect, it } from "vitest";
import type { TurnUpdateEvent } from "@roc/sim";
import { selectTurnUpdates } from "./turn-update-batch";

function ev(id: number, playerId: number, turn: number, type = "productionComplete"): TurnUpdateEvent {
  return { id, playerId, turn, type: type as TurnUpdateEvent["type"], message: `event ${id}` };
}

describe("selectTurnUpdates", () => {
  it("shows nothing on a viewer's first render but marks history as seen", () => {
    const events = [ev(1, 0, 1), ev(2, 0, 1)];
    const batch = selectTurnUpdates(events, 0, undefined);
    expect(batch.toShow).toEqual([]);
    expect(batch.lastSeen).toBe(2);
  });

  it("surfaces only events newer than the last seen id", () => {
    const events = [ev(1, 0, 1), ev(2, 0, 2), ev(3, 0, 2)];
    const batch = selectTurnUpdates(events, 0, 1);
    expect(batch.toShow.map((e) => e.id)).toEqual([2, 3]);
    expect(batch.lastSeen).toBe(3);
  });

  it("includes enemy-phase events tagged with the previous turn number", () => {
    // The player's own begin-of-turn economy (turn 2) was seen up to id 10.
    // The AI then killed a unit during its phase, which the sim tagged turn 2
    // as well (pre-increment) but with a newer id. It must still surface.
    const events = [
      ev(10, 0, 2, "productionComplete"),
      ev(11, 0, 2, "unitDied"), // AI kill during the enemy phase
      ev(12, 0, 3, "researchComplete"), // next turn's economy
    ];
    const batch = selectTurnUpdates(events, 0, 10);
    expect(batch.toShow.map((e) => e.id)).toEqual([11, 12]);
    expect(batch.toShow.some((e) => e.type === "unitDied")).toBe(true);
  });

  it("does not re-show events already seen", () => {
    const events = [ev(1, 0, 1), ev(2, 0, 1)];
    const batch = selectTurnUpdates(events, 0, 2);
    expect(batch.toShow).toEqual([]);
    expect(batch.lastSeen).toBe(2);
  });

  it("isolates events by viewer (hotseat safety)", () => {
    const events = [ev(1, 0, 1), ev(2, 1, 1), ev(3, 0, 1)];
    const batch = selectTurnUpdates(events, 0, 0);
    expect(batch.toShow.map((e) => e.id)).toEqual([1, 3]);
    expect(batch.lastSeen).toBe(3);
  });

  it("keeps the high-water mark when there are no events for the viewer", () => {
    const events = [ev(5, 1, 1)];
    const batch = selectTurnUpdates(events, 0, 4);
    expect(batch.toShow).toEqual([]);
    expect(batch.lastSeen).toBe(4);
  });
});
