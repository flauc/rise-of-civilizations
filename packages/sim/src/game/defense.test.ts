import { describe, it, expect } from "vitest";
import { getTile } from "@roc/shared";
import { createGame } from "./setup";
import { beginTurn, applyCommand } from "./commands";
import { computeReachable, offsetNeighbors } from "./movement";
import { computeAttackTargets, resolveAttack, towerBombardment } from "./combat";
import { structureHp } from "./fortifications";
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
  it("a wall blocks enemy movement and must be attacked to be removed", () => {
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
    expect(structTile.structure).toBeUndefined();
    // Now the tile is passable again.
    enemy.movementLeft = 2;
    expect(computeReachable(s, enemy).has(key)).toBe(true);
  });

  it("a tower bombards an adjacent enemy at the owner's turn start", () => {
    const { s, structTile, enemy } = setup();
    structTile.structure = { kind: "tower", tier: 2, hp: structureHp("tower", 2), maxHp: structureHp("tower", 2) };
    const before = enemy.hp;
    towerBombardment(s, 0); // player 0 owns the tower
    expect(enemy.hp).toBeLessThan(before);
  });
});
