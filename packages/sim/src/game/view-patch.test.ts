import { describe, expect, it } from "vitest";
import { getTile } from "@roc/shared";
import { createGame, viewForPlayer, applyCommand, beginTurn } from "@roc/sim";
import {
  applyPlayerViewPatch,
  diffPlayerView,
  isEmptyPlayerViewPatch,
} from "./view-patch";
import { computeReachable, offsetNeighbors } from "./movement";
import { isPassableLand } from "./terrain";

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
    // Procedural starts can box the warrior in; open one adjacent grassland tile.
    for (const n of offsetNeighbors(state.map, unit!.col, unit!.row)) {
      const t = getTile(state.map, n.col, n.row)!;
      if (!isPassableLand(t.terrain)) t.terrain = "grassland";
    }
    for (const other of [...state.units.values()]) {
      if (other.id === unit!.id) continue;
      const blocks = offsetNeighbors(state.map, unit!.col, unit!.row).some(
        (n) => n.col === other.col && n.row === other.row,
      );
      if (!blocks) continue;
      const escape = state.map.tiles.find(
        (t) =>
          isPassableLand(t.terrain) &&
          !offsetNeighbors(state.map, unit!.col, unit!.row).some((n) => n.col === t.col && n.row === t.row) &&
          ![...state.units.values()].some((u) => u.col === t.col && u.row === t.row),
      );
      if (escape) {
        other.col = escape.col;
        other.row = escape.row;
      }
    }
    const reachable = computeReachable(state, unit!);
    const destKey = [...reachable.keys()].find((k) => k !== `${fromCol},${fromRow}`);
    expect(destKey).toBeDefined();
    const [destCol, destRow] = destKey!.split(",").map(Number) as [number, number];
    const moveRes = applyCommand(state, { type: "move", unitId: unit!.id, col: destCol, row: destRow }, 0);
    expect(moveRes.ok).toBe(true);
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
