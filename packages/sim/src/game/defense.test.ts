import { describe, it, expect } from "vitest";
import { getTile } from "@roc/shared";
import { createGame } from "./setup";
import { beginTurn, applyCommand } from "./commands";
import { computeReachable, offsetNeighbors } from "./movement";
import { computeAttackTargets, resolveAttack, towerBombardment } from "./combat";
import {
  RUBBLE_LIFESPAN,
  repairFraction,
  structureCondition,
  structureDefense,
  structureHp,
  tickRubble,
} from "./fortifications";
import { nextTierAt, workLabourFor } from "./works";
import { citiesOf, makeUnit, unitsOf } from "./state";

function setup() {
  const s = createGame({ seed: "def-test", cols: 40, rows: 28, barbarians: false, humanSlots: 2, playerCount: 2 });
  s.players[0]!.atWar.push(1); // structures only block/fight declared enemies
  s.players[1]!.atWar.push(0);
  beginTurn(s);
  const settler = unitsOf(s, 0).find((u) => u.type === "settler")!;
  applyCommand(s, { type: "foundCity", unitId: settler.id });
  const city = citiesOf(s, 0)[0]!;
  // A structure tile two east of the city, owned by player 0.
  const sc = city.col + 2;
  const sr = city.row;
  const st = getTile(s.map, sc, sr)!;
  st.terrain = "grassland";
  st.ownerCityId = city.id;
  // An enemy (player 1) warrior on a passable neighbour of the structure tile.
  const nb = offsetNeighbors(s.map, sc, sr).find((n) => {
    const t = getTile(s.map, n.col, n.row);
    return t && t.terrain !== "mountains" && t.terrain !== "ocean";
  })!;
  const nt = getTile(s.map, nb.col, nb.row)!;
  nt.terrain = "grassland";
  const eid = s.nextEntityId++;
  const enemy = makeUnit(eid, 1, "warrior", nb.col, nb.row);
  enemy.movementLeft = 2;
  s.units.set(eid, enemy);
  return { s, structTile: st, enemy };
}

describe("defensive structures", () => {
  it("a wall blocks enemy movement until it is breached, then leaves walkable rubble", () => {
    const { s, structTile, enemy } = setup();
    structTile.structure = { kind: "wall", tier: 1, hp: structureHp("wall", 1), maxHp: structureHp("wall", 1) };
    const key = `${structTile.col},${structTile.row}`;

    expect(computeReachable(s, enemy).has(key)).toBe(false); // can't walk onto it
    expect(computeAttackTargets(s, enemy).has(key)).toBe(true); // but can attack it

    // Pound the wall until it falls.
    let guard = 0;
    while (structTile.structure && guard++ < 40) {
      enemy.attackedThisTurn = false;
      enemy.movementLeft = 2;
      enemy.hp = 100;
      resolveAttack(s, enemy, structTile.col, structTile.row);
    }
    // The wall is breached but NOT swept away: the rubble stays put so it can be
    // patched back up, and it no longer blocks anyone.
    expect(structTile.structure).toBeDefined();
    expect(structTile.structure!.hp).toBe(0);
    expect(structureCondition(0, structTile.structure!.maxHp)).toBe("destroyed");
    enemy.movementLeft = 2;
    expect(computeReachable(s, enemy).has(key)).toBe(true);
  });

  it("rubble left unrepaired clears itself after RUBBLE_LIFESPAN turns", () => {
    const { s, structTile } = setup();
    const maxHp = structureHp("wall", 1);
    structTile.structure = { kind: "wall", tier: 1, hp: 0, maxHp, rubbleExpiresTurn: s.turn + RUBBLE_LIFESPAN };

    s.turn += RUBBLE_LIFESPAN - 1;
    tickRubble(s);
    expect(structTile.structure).toBeDefined(); // still within its lifespan

    s.turn += 1;
    tickRubble(s);
    expect(structTile.structure).toBeUndefined(); // hauled away, tile is bare again
  });

  it("a damaged wall is repaired at its own tier, for a fraction of a rebuild", () => {
    const { s, structTile } = setup();
    const maxHp = structureHp("wall", 2);
    const city = citiesOf(s, 0)[0]!;
    const fresh = workLabourFor(s, "wall", 2, city, structTile.col, structTile.row).masonry!;

    // Undamaged, the ladder offers the next tier up.
    structTile.structure = { kind: "wall", tier: 2, hp: maxHp, maxHp };
    expect(nextTierAt(structTile, "wall")).toBe(3);

    // Battered, it must be patched back up at tier 2 first — and that is cheaper.
    structTile.structure = { kind: "wall", tier: 2, hp: maxHp / 2, maxHp };
    expect(nextTierAt(structTile, "wall")).toBe(2);
    const half = workLabourFor(s, "wall", 2, city, structTile.col, structTile.row).masonry!;
    expect(half).toBeLessThan(fresh);
    expect(half).toBeCloseTo(Math.ceil(fresh * repairFraction(maxHp / 2, maxHp)), 0);

    // A flattened wall costs more to repair than a half-standing one, but still
    // less than raising it from nothing.
    structTile.structure = { kind: "wall", tier: 2, hp: 0, maxHp };
    const wrecked = workLabourFor(s, "wall", 2, city, structTile.col, structTile.row).masonry!;
    expect(wrecked).toBeGreaterThan(half);
    expect(wrecked).toBeLessThan(fresh);
  });

  it("a wall shelters its defender by however much of it still stands", () => {
    const maxHp = structureHp("wall", 3);
    const full = structureDefense(3, maxHp, maxHp);
    expect(structureDefense(3, maxHp / 2, maxHp)).toBeCloseTo(full / 2);
    expect(structureDefense(3, 0, maxHp)).toBe(0); // rubble is no cover at all
  });

  it("a tower bombards an adjacent enemy at the owner's turn start", () => {
    const { s, structTile, enemy } = setup();
    structTile.structure = { kind: "tower", tier: 2, hp: structureHp("tower", 2), maxHp: structureHp("tower", 2) };
    const before = enemy.hp;
    towerBombardment(s, 0); // player 0 owns the tower
    expect(enemy.hp).toBeLessThan(before);
  });
});
