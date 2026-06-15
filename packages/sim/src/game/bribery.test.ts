import { describe, it, expect } from "vitest";
import { getTile } from "@roc/shared";
import { createGame } from "./setup";
import { applyCommand } from "./commands";
import { barbarianTurn } from "./barbarians";
import {
  barbarianBribeCost,
  barbarianRecruitCost,
  isBarbarianPacified,
  pruneBarbarianBribes,
  BRIBE_TURNS,
} from "./bribery";
import { makeUnit, unitsOf, type GameState, type Unit } from "./state";
import { offsetNeighbors } from "./movement";
import { isPassableLand } from "./terrain";

/** Build a scenario: an isolated human Warrior with a barbarian Warrior next to it. */
function setup(seed: string) {
  const state = createGame({ seed, cols: 30, rows: 20, barbarians: true });
  const player = state.players[0]!;
  player.researched.add("parley");
  player.gold = 1000;
  const barbId = state.players.find((p) => p.isBarbarian)!.id;

  // Find a passable tile with a passable neighbour to host the two units.
  let h: { col: number; row: number } | null = null;
  let b: { col: number; row: number } | null = null;
  outer: for (const t of state.map.tiles) {
    if (!isPassableLand(t.terrain)) continue;
    for (const n of offsetNeighbors(state.map, t.col, t.row)) {
      const nt = getTile(state.map, n.col, n.row);
      if (nt && isPassableLand(nt.terrain)) {
        h = { col: t.col, row: t.row };
        b = { col: n.col, row: n.row };
        break outer;
      }
    }
  }
  if (!h || !b) throw new Error("no spot");

  // Clear anything already standing on the two chosen tiles.
  for (const u of [...state.units.values()]) {
    if ((u.col === h.col && u.row === h.row) || (u.col === b.col && u.row === b.row)) state.units.delete(u.id);
  }
  const hUnit = makeUnit(state.nextEntityId++, 0, "warrior", h.col, h.row);
  hUnit.movementLeft = 2;
  state.units.set(hUnit.id, hUnit);
  const bUnit = makeUnit(state.nextEntityId++, barbId, "warrior", b.col, b.row);
  bUnit.campKey = "99,99";
  bUnit.movementLeft = 2;
  state.units.set(bUnit.id, bUnit);

  return { state, player, barbId, hUnit, bUnit };
}

describe("barbarian bribery", () => {
  it("requires the Parley tech", () => {
    const { state, player, bUnit } = setup("br1");
    player.researched.delete("parley");
    const res = applyCommand(state, { type: "bribeBarbarian", unitId: bUnit.id }, 0);
    expect(res.ok).toBe(false);
  });

  it("bribing a war-band buys a truce and each bribe doubles the price", () => {
    const { state, player, bUnit } = setup("br2");
    expect(barbarianBribeCost(player)).toBe(30);

    const before = player.gold;
    const res = applyCommand(state, { type: "bribeBarbarian", unitId: bUnit.id }, 0);
    expect(res.ok).toBe(true);
    expect(player.gold).toBe(before - 30);
    expect(player.bribesPaid).toBe(1);
    expect(barbarianBribeCost(player)).toBe(60); // next one costs double
    expect(isBarbarianPacified(state, bUnit, 0)).toBe(true);

    // A new raider from the same camp (campKey) is covered by the same truce.
    const sibling = makeUnit(state.nextEntityId++, bUnit.ownerId, "slinger", bUnit.col, bUnit.row);
    sibling.campKey = "99,99";
    expect(isBarbarianPacified(state, sibling, 0)).toBe(true);
  });

  it("a bribed war-band does not attack the briber, but an un-bribed one does", () => {
    // Control: no bribe → the barbarian attacks the adjacent human.
    const ctrl = setup("br3");
    barbarianTurn(ctrl.state, ctrl.barbId);
    const survivor = ctrl.state.units.get(ctrl.hUnit.id);
    expect(!survivor || survivor.hp < 100).toBe(true);

    // Bribed: the same setup, but the war-band leaves the briber alone.
    const { state, bUnit, hUnit, barbId } = setup("br3");
    expect(applyCommand(state, { type: "bribeBarbarian", unitId: bUnit.id }, 0).ok).toBe(true);
    barbarianTurn(state, barbId);
    const safe = state.units.get(hUnit.id);
    expect(safe).toBeDefined();
    expect(safe!.hp).toBe(100);
  });

  it("truces expire after BRIBE_TURNS", () => {
    const { state, bUnit } = setup("br4");
    expect(applyCommand(state, { type: "bribeBarbarian", unitId: bUnit.id }, 0).ok).toBe(true);
    expect(isBarbarianPacified(state, bUnit, 0)).toBe(true);
    state.turn += BRIBE_TURNS; // still inclusive on the final turn
    expect(isBarbarianPacified(state, bUnit, 0)).toBe(true);
    state.turn += 1;
    expect(isBarbarianPacified(state, bUnit, 0)).toBe(false);
    pruneBarbarianBribes(state);
    expect(state.barbarianBribes.length).toBe(0);
  });
});

describe("barbarian recruitment", () => {
  it("prices scale with unit type and level", () => {
    const warrior = makeUnit(1, 9, "warrior", 0, 0);
    const slinger = makeUnit(2, 9, "slinger", 0, 0);
    expect(barbarianRecruitCost(warrior)).toBe(75); // 15 cost × 5
    expect(barbarianRecruitCost(slinger)).toBe(60); // 12 cost × 5
    warrior.level = 2;
    expect(barbarianRecruitCost(warrior)).toBe(105); // +40% per level
  });

  it("recruiting transfers the unit into your army for a fee", () => {
    const { state, player, barbId, bUnit } = setup("br5");
    const cost = barbarianRecruitCost(bUnit);
    const gold = player.gold;
    const barbsBefore = unitsOf(state, barbId).length;

    const res = applyCommand(state, { type: "recruitBarbarian", unitId: bUnit.id }, 0);
    expect(res.ok).toBe(true);
    expect(player.gold).toBe(gold - cost);

    const recruited = state.units.get(bUnit.id) as Unit;
    expect(recruited.ownerId).toBe(0);
    expect(recruited.campKey).toBeUndefined();
    expect(unitsOf(state, barbId).length).toBe(barbsBefore - 1);
  });

  it("cannot parley with a barbarian that is not adjacent", () => {
    const { state, bUnit } = setup("br6");
    bUnit.col = (bUnit.col + 5) % 30; // move it far from the human unit
    bUnit.row = (bUnit.row + 5) % 20;
    const res = applyCommand(state, { type: "recruitBarbarian", unitId: bUnit.id }, 0);
    expect(res.ok).toBe(false);
  });
});
