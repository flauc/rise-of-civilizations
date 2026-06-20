import { describe, it, expect } from "vitest";
import { getTile } from "@roc/shared";
import { createGame } from "./setup";
import { makeUnit } from "./state";
import { computeReachable, riverBetween } from "./movement";

/** A flat grassland map with no units, for controlled movement tests. */
function flatGame() {
  const s = createGame({ seed: "move-test", cols: 30, rows: 24, barbarians: false, humanSlots: 1, playerCount: 1 });
  for (const t of s.map.tiles) {
    t.terrain = "grassland";
    t.road = false;
    t.river = 0;
  }
  s.units.clear();
  return s;
}

describe("river crossing movement", () => {
  it("costs +1 movement to ford a river edge", () => {
    const s = flatGame();
    const u = makeUnit(s.nextEntityId++, 0, "warrior", 10, 10);
    u.movementLeft = 4;
    s.units.set(u.id, u);

    // Put a river on the edge toward the east neighbour (direction 0 = E).
    getTile(s.map, 10, 10)!.river = 1 << 0;
    expect(riverBetween(s, 10, 10, 11, 10)).toBe(true);
    expect(riverBetween(s, 10, 10, 9, 10)).toBe(false);

    const reach = computeReachable(s, u);
    // West neighbour (no river) is the normal 1-move grassland cost…
    expect(reach.get("9,10")!.cost).toBe(1);
    // …while fording the river to the east costs an extra point.
    expect(reach.get("11,10")!.cost).toBe(2);
  });
});
