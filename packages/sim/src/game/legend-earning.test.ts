import { describe, expect, it } from "vitest";
import { getLegend } from "@roc/data";
import { createGame } from "./setup";
import { makeUnit, playerById } from "./state";
import {
  legendRecruitThreshold,
  legendTrackFor,
  legendTrackPointsOf,
  onLegendBattleWon,
  onLegendCampCleared,
  onLegendUnitTrained,
} from "./legend-earning";
import { canRecruitLegend, recruitLegend } from "./legends";

describe("legend earning", () => {
  it("maps heroes to combat tracks from their base unit", () => {
    expect(legendTrackFor(getLegend("leonidas")!)).toBe("melee");
    expect(legendTrackFor(getLegend("cyrus")!)).toBe("cavalry");
    expect(legendTrackFor(getLegend("harald_hardrada")!)).toBe("naval");
  });

  it("accrues melee glory from training and cavalry glory from cavalry training", () => {
    const state = createGame({ cols: 12, rows: 12, seed: "earn", playerCount: 1, humanSlots: 1, barbarians: false });
    const player = playerById(state, 0)!;
    onLegendUnitTrained(state, 0, "warrior");
    onLegendUnitTrained(state, 0, "rider");
    expect(legendTrackPointsOf(player, "melee")).toBe(8);
    expect(legendTrackPointsOf(player, "cavalry")).toBe(8);
  });

  it("awards more glory for civ kills than barbarian kills", () => {
    const state = createGame({ cols: 12, rows: 12, seed: "kill", playerCount: 2, humanSlots: 1, barbarians: true });
    const killer = makeUnit(99, 0, "warrior", 3, 3, 0, 100);
    state.units.set(99, killer);
    const player = playerById(state, 0)!;
    onLegendBattleWon(state, killer, 1);
    const civPoints = legendTrackPointsOf(player, "melee");
    onLegendBattleWon(state, killer, state.players.find((p) => p.isBarbarian)!.id);
    expect(legendTrackPointsOf(player, "melee")).toBe(civPoints + 5);
    expect(civPoints).toBe(12);
  });

  it("awards glory for clearing barbarian camps", () => {
    const state = createGame({ cols: 12, rows: 12, seed: "camp", playerCount: 1, humanSlots: 1, barbarians: true });
    const unit = makeUnit(1, 0, "spearman", 2, 2, 0, 100);
    const player = playerById(state, 0)!;
    onLegendCampCleared(state, unit);
    expect(legendTrackPointsOf(player, "melee")).toBe(6);
  });

  it("recruits when track glory meets the threshold", () => {
    const state = createGame({ cols: 14, rows: 14, seed: "recruit", playerCount: 1, humanSlots: 1, barbarians: false });
    const player = playerById(state, 0)!;
    const def = getLegend("gilgamesh")!;
    player.legendTrackPoints = { melee: legendRecruitThreshold(0) };
    state.cities.set(1, {
      id: 1, ownerId: 0, name: "Sparta", col: 3, row: 3, population: 1,
      foodStored: 0, productionStored: 0, production: null, buildings: [],
      specialists: [], wonders: [], workedTiles: [], isCapital: true, foundedAsCapital: true,
      hp: 100, lastAttackedTurn: 0, rangedAttackUsed: false, training: {}, trainingQueue: [], modifiers: [],
    });
    expect(canRecruitLegend(state, 0, def.id).ok).toBe(true);
    const res = recruitLegend(state, 0, def.id);
    expect(res.ok).toBe(true);
    expect(legendTrackPointsOf(player, "melee")).toBe(0);
    expect(player.legendTrackEarned?.melee).toBe(1);
  });
});

describe("legend recruit threshold", () => {
  it("rises per hero recruited on a track", () => {
    expect(legendRecruitThreshold(0)).toBe(50);
    expect(legendRecruitThreshold(1)).toBe(85);
  });
});
