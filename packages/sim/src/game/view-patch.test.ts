import { describe, expect, it } from "vitest";
import { createGame, viewForPlayer, applyCommand, beginTurn } from "@roc/sim";
import {
  applyPlayerViewPatch,
  diffPlayerView,
  isEmptyPlayerViewPatch,
} from "./view-patch";

describe("PlayerView patches", () => {
  it("empty diff when views are identical", () => {
    const state = createGame({ seed: "patch-idle", cols: 40, rows: 28, playerCount: 2 });
    const view = viewForPlayer(state, 0);
    expect(isEmptyPlayerViewPatch(diffPlayerView(view, view))).toBe(true);
  });

  it("patch round-trips after a unit move", () => {
    const state = createGame({ seed: "patch-move", cols: 40, rows: 28, playerCount: 2, barbarians: false });
    beginTurn(state);
    const before = viewForPlayer(state, 0);
    const unit = [...state.units.values()].find((u) => u.ownerId === 0 && u.type === "warrior");
    expect(unit).toBeDefined();
    const fromCol = unit!.col;
    const fromRow = unit!.row;
    const neighbors = [
      { col: unit!.col + 1, row: unit!.row },
      { col: unit!.col - 1, row: unit!.row },
      { col: unit!.col, row: unit!.row + 1 },
      { col: unit!.col, row: unit!.row - 1 },
    ];
    const dest = neighbors.find((n) => {
      const res = applyCommand(state, { type: "move", unitId: unit!.id, col: n.col, row: n.row }, 0);
      return res.ok;
    });
    expect(dest).toBeDefined();
    const after = viewForPlayer(state, 0);
    const patch = diffPlayerView(before, after);
    expect(patch.units?.some((u) => u.id === unit!.id && (u.col !== fromCol || u.row !== fromRow))).toBe(true);
    const merged = applyPlayerViewPatch(before, patch);
    expect(merged).toEqual(after);
    expect(JSON.stringify(patch).length).toBeLessThan(JSON.stringify(after).length);
  });

  it("patch round-trips after end turn", () => {
    const state = createGame({ seed: "patch-turn", cols: 36, rows: 24, playerCount: 2, barbarians: false });
    const before = viewForPlayer(state, 0);
    applyCommand(state, { type: "endTurn" }, 0);
    const after = viewForPlayer(state, 0);
    const patch = diffPlayerView(before, after);
    expect(applyPlayerViewPatch(before, patch)).toEqual(after);
  });

  it("log changes append instead of replacing when possible", () => {
    const state = createGame({ seed: "patch-log", cols: 32, rows: 22, playerCount: 1 });
    const before = viewForPlayer(state, 0);
    state.log.push({ message: "Test entry", world: true });
    const after = viewForPlayer(state, 0);
    const patch = diffPlayerView(before, after);
    expect(patch.logAppend?.length).toBe(1);
    expect(patch.log).toBeUndefined();
    expect(applyPlayerViewPatch(before, patch).log).toEqual(after.log);
  });

  it("sends only changed you fields and incremental visible tiles", () => {
    const state = createGame({ seed: "patch-you", cols: 40, rows: 28, playerCount: 2, barbarians: false });
    const before = viewForPlayer(state, 0);
    state.players[0]!.gold += 5;
    const after = viewForPlayer(state, 0);
    const patch = diffPlayerView(before, after);
    expect(patch.you?.gold).toBe(after.you.gold);
    expect(patch.you?.researched).toBeUndefined();
    expect(applyPlayerViewPatch(before, patch)).toEqual(after);
  });

  it("visible growth uses visibleAdd when tiles only enter sight", () => {
    const state = createGame({ seed: "patch-vis", cols: 40, rows: 28, playerCount: 2, barbarians: false });
    const before = viewForPlayer(state, 0);
    const after = viewForPlayer(state, 0);
    after.visible = [...before.visible, "99,99"];
    const patch = diffPlayerView(before, after);
    expect(patch.visibleAdd).toEqual(["99,99"]);
    expect(patch.visible).toBeUndefined();
    expect(applyPlayerViewPatch(before, patch).visible).toEqual(after.visible);
  });
});
