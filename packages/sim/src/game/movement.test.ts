import { describe, it, expect } from "vitest";
import { getTile } from "@roc/shared";
import { createGame } from "./setup";
import { makeUnit, type City } from "./state";
import { computeReachable, riverBetween } from "./movement";

/** Register a city owned by `ownerId` in the state and return its id (for tile ownership). */
function ownedCity(s: ReturnType<typeof flatGame>, col: number, row: number, ownerId = 0): number {
  const id = s.nextEntityId++;
  const city: City = {
    id, ownerId, name: "Bridgeton", col, row, population: 1,
    foodStored: 0, productionStored: 0, production: null, buildings: [], specialists: [], wonders: [], workedTiles: [],
    isCapital: false, foundedAsCapital: false, hp: 100, lastAttackedTurn: 0, rangedAttackUsed: false, training: {}, trainingQueue: [], modifiers: [],
  };
  s.cities.set(id, city);
  return id;
}

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

  it("a bridge waives the ford cost for a road-to-road river crossing", () => {
    const s = flatGame();
    const u = makeUnit(s.nextEntityId++, 0, "warrior", 10, 10);
    u.movementLeft = 4;
    s.units.set(u.id, u);

    // Roads on both tiles with a river running along the shared east edge.
    const a = getTile(s.map, 10, 10)!;
    const b = getTile(s.map, 11, 10)!;
    a.road = true;
    b.road = true;
    a.river = 1 << 0; // direction 0 = E

    // Without the Bridge Building tech the road still has to ford: 0.75 (dirt road) + 1.
    expect(computeReachable(s, u).get("11,10")!.cost).toBe(1.75);

    // Research Bridge Building and place both crossing tiles in owned territory so a
    // bridge spans the river. The ford penalty is waived (just the road cost remains).
    const cityId = ownedCity(s, 8, 8);
    a.ownerCityId = cityId;
    b.ownerCityId = cityId;
    s.players[0]!.researched.add("bridge_building");
    expect(computeReachable(s, u).get("11,10")!.cost).toBe(0.75);
  });

  it("bridges a river on a neutral road for any army that knows Bridge Building", () => {
    const s = flatGame();
    const u = makeUnit(s.nextEntityId++, 0, "warrior", 10, 10);
    u.movementLeft = 4;
    s.units.set(u.id, u);

    // A roaded river crossing on wholly unclaimed land (nobody owns these tiles).
    const a = getTile(s.map, 10, 10)!;
    const b = getTile(s.map, 11, 10)!;
    a.road = true;
    b.road = true;
    a.river = 1 << 0; // direction 0 = E

    // No owner and no tech → the crossing still fords: 0.75 (dirt road) + 1.
    expect(computeReachable(s, u).get("11,10")!.cost).toBe(1.75);

    // The moving army's own civ researches Bridge Building; its engineers throw a
    // span, so the ford penalty is waived even though the road belongs to no one.
    s.players[0]!.researched.add("bridge_building");
    expect(computeReachable(s, u).get("11,10")!.cost).toBe(0.75);
  });
});

describe("road movement speed", () => {
  /** Lay a straight east-west road of a given tier along row 10. */
  function roadRow(s: ReturnType<typeof flatGame>, level: number) {
    for (let col = 0; col < s.map.cols; col++) {
      const t = getTile(s.map, col, 10)!;
      t.road = true;
      t.roadLevel = level;
    }
  }

  it("dirt roads speed travel on open ground, and each tier roughly halves the cost", () => {
    const s = flatGame();
    const u = makeUnit(s.nextEntityId++, 0, "warrior", 10, 10);
    u.movementLeft = 3;
    s.units.set(u.id, u);

    // Plain grassland costs a full move to enter; a dirt road is cheaper.
    expect(computeReachable(s, u).get("11,10")!.cost).toBe(1); // off-road neighbour
    roadRow(s, 1);
    expect(computeReachable(s, u).get("11,10")!.cost).toBe(0.75); // dirt
    roadRow(s, 2);
    expect(computeReachable(s, u).get("11,10")!.cost).toBe(0.5); // paved
    roadRow(s, 3);
    expect(computeReachable(s, u).get("11,10")!.cost).toBe(0.25); // imperial
  });

  it("gives a unit the road's speed on another civ's road, not just its own", () => {
    const s = flatGame();
    const u = makeUnit(s.nextEntityId++, 0, "warrior", 10, 10);
    u.movementLeft = 3;
    s.units.set(u.id, u);

    // An imperial road whose tiles are claimed by a rival civ (player 1).
    roadRow(s, 3);
    const rivalCity = ownedCity(s, 8, 8, 1);
    getTile(s.map, 10, 10)!.ownerCityId = rivalCity;
    getTile(s.map, 11, 10)!.ownerCityId = rivalCity;

    // With the right of passage (war / open borders → ignoreBorders), the rival's
    // graded highway carries our unit just as fast as our own would (¼ per tile).
    expect(computeReachable(s, u, { ignoreBorders: true }).get("11,10")!.cost).toBe(0.25);
  });

  it("a unit travels much farther along an imperial road than over open ground", () => {
    const s = flatGame();
    const u = makeUnit(s.nextEntityId++, 0, "warrior", 1, 10);
    u.movementLeft = 2;
    s.units.set(u.id, u);

    // Off-road, 2 moves reach 2 tiles east; an imperial road (¼/tile) reaches 8.
    expect(computeReachable(s, u).get("3,10")?.cost).toBe(2);
    expect(computeReachable(s, u).get("9,10")).toBeUndefined();
    roadRow(s, 3);
    expect(computeReachable(s, u).get("9,10")!.cost).toBe(2); // 8 tiles × ¼
  });
});
