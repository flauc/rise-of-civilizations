import { describe, it, expect } from "vitest";
import { createGame } from "./setup";
import { beginTurn } from "./commands";
import { triggerVillage, spawnFromCamps, maybeSpawnCamps, clearBarbCamp } from "./features";
import { computeVisible } from "./visibility";
import { unitsOf, type GameState, type Player, type Unit } from "./state";
import {
  globalMoraleOf,
  onVillageGlobalMorale,
  onVillageUnitMorale,
  unitMorale,
  VILLAGE_GLOBAL_MORALE,
  VILLAGE_UNIT_MORALE,
} from "./morale";
import { getTile, isPolarTile, axialDistance, offsetToAxial } from "@roc/shared";
import type { GameSpeed } from "./game-speed";
import { UNIT_DEFS, type UnitTypeId } from "./content";

function firstUnit(state: GameState, ownerId: number): Unit {
  return unitsOf(state, ownerId)[0]!;
}

describe("map features", () => {
  it("places villages and barbarian camps on the map", () => {
    const state = createGame({ seed: "feat", cols: 44, rows: 30, barbarians: true });
    const villages = state.map.tiles.filter((t) => t.feature === "village").length;
    const camps = state.map.tiles.filter((t) => t.feature === "barb_camp").length;
    expect(villages).toBeGreaterThan(0);
    expect(camps).toBeGreaterThan(0);
  });

  it("never places villages, camps, or barbarians on the frozen poles", () => {
    for (const seed of ["pole-feat-1", "pole-feat-2", "pole-feat-3"]) {
      const state = createGame({ seed, cols: 60, rows: 40, barbarians: "high", mapType: "two_continents" });
      for (const t of state.map.tiles) {
        if (t.feature === "village" || t.feature === "barb_camp") {
          expect(isPolarTile(state.map, t.col, t.row), `${t.feature} at ${t.col},${t.row} (${seed})`).toBe(false);
        }
      }
      const barb = state.players.find((p) => p.isBarbarian);
      if (barb) {
        for (const u of unitsOf(state, barb.id)) {
          expect(isPolarTile(state.map, u.col, u.row), `barbarian at ${u.col},${u.row} (${seed})`).toBe(false);
        }
      }
    }
  });

  it("skips villages when density is none", () => {
    const state = createGame({ seed: "no-villages", cols: 44, rows: 30, barbarians: true, villages: "none" });
    const villages = state.map.tiles.filter((t) => t.feature === "village").length;
    expect(villages).toBe(0);
  });

  it("high village density places more villages than medium, at least 7 hexes apart", () => {
    const medium = createGame({ seed: "vil-dens", cols: 80, rows: 56, barbarians: false, villages: "medium" });
    const high = createGame({ seed: "vil-dens", cols: 80, rows: 56, barbarians: false, villages: "high" });
    const medSpots = medium.map.tiles.filter((t) => t.feature === "village");
    const highSpots = high.map.tiles.filter((t) => t.feature === "village");
    expect(highSpots.length).toBeGreaterThan(medSpots.length);
    for (const spots of [medSpots, highSpots]) {
      const ax = spots.map((t) => offsetToAxial({ col: t.col, row: t.row }));
      for (let i = 0; i < ax.length; i++) {
        for (let j = i + 1; j < ax.length; j++) {
          expect(axialDistance(ax[i]!, ax[j]!)).toBeGreaterThanOrEqual(7);
        }
      }
    }
  });

  it("a village grants a perk and is consumed on entry", () => {
    const state = createGame({ seed: "feat2", cols: 44, rows: 30, barbarians: true });
    beginTurn(state);
    const unit = firstUnit(state, 0);
    // Plant a village under the unit and trigger it.
    const tile = getTile(state.map, unit.col, unit.row)!;
    tile.feature = "village";
    const logBefore = state.log.length;
    const player = state.players[0]!;
    triggerVillage(state, unit, player);
    expect(state.log.length).toBeGreaterThan(logBefore); // some perk was logged
  });

  it("barbarian camps spawn raiders over time", () => {
    const state = createGame({ seed: "feat3", cols: 44, rows: 30, barbarians: true });
    const barbId = state.players.find((p) => p.isBarbarian)!.id;
    const before = unitsOf(state, barbId).length;
    // Advance enough turns that a camp's cadence (4–6) fires at least once.
    let spawnedMore = false;
    for (let t = 1; t <= 12 && !spawnedMore; t++) {
      state.turn = t;
      spawnFromCamps(state, barbId);
      if (unitsOf(state, barbId).length > before) spawnedMore = true;
    }
    expect(spawnedMore).toBe(true);
  });

  it("the horde grows past the old fixed cap — there is no global unit limit", () => {
    const state = createGame({ seed: "feat-nocap", cols: 60, rows: 40, barbarians: true });
    const barbId = state.players.find((p) => p.isBarbarian)!.id;
    // March the barbarians' war-bands off their camps each turn so the camp tiles
    // stay clear and keep producing — left in place they'd block their own spawns.
    let parking = 0;
    for (let t = 1; t <= 60; t++) {
      state.turn = t;
      spawnFromCamps(state, barbId);
      for (const u of unitsOf(state, barbId)) {
        u.col = 0;
        u.row = parking++ % state.map.rows; // shove them into a corner column
      }
    }
    expect(unitsOf(state, barbId).length).toBeGreaterThan(12); // old "normal" cap
  });

  // Sweep a barbarians game, spawning from camps each turn and clearing the raiders
  // afterward so camps keep producing. Records the first turn each unit type appeared.
  function tierSweep(speed: GameSpeed, turns = 200) {
    const state = createGame({ seed: "barb-tier", cols: 60, rows: 40, barbarians: true, gameSpeed: speed });
    const barbId = state.players.find((p) => p.isBarbarian)!.id;
    const first: Record<string, number> = {};
    for (let t = 1; t <= turns; t++) {
      state.turn = t;
      spawnFromCamps(state, barbId);
      for (const u of unitsOf(state, barbId)) {
        if (first[u.type] === undefined) first[u.type] = t;
      }
      for (const u of [...unitsOf(state, barbId)]) state.units.delete(u.id); // clear for next turn
    }
    return first;
  }

  it("barbarian camps field progressively stronger units, including cavalry", () => {
    const first = tierSweep("normal");
    // A unit can never spawn before its unlock turn (cumulative tech cost / rate):
    // fire-hardened spears and war dogs within a few turns, riders (cavalry!) by
    // ~turn 10, then bronze, iron, and finally steel/cataphracts.
    expect(first.warrior!).toBeLessThan(5); // Ancient raiders from the start
    expect(first.firehard_spear!).toBeGreaterThanOrEqual(3);
    expect(first.firehard_spear!).toBeLessThan(15);
    expect(first.war_dog!).toBeGreaterThanOrEqual(4);
    expect(first.rider!).toBeGreaterThanOrEqual(10); // cavalry, and it does appear
    expect(first.rider!).toBeLessThan(30);
    expect(first.spearman!).toBeGreaterThanOrEqual(27);
    expect(first.swordsman!).toBeGreaterThanOrEqual(29);
    expect(first.longswordsman!).toBeGreaterThanOrEqual(42);
    expect(first.cataphract!).toBeGreaterThanOrEqual(48); // late heavy cavalry
    // Ordering: cavalry and bronze precede iron precede steel.
    expect(first.rider!).toBeLessThan(first.swordsman!);
    expect(first.spearman!).toBeLessThan(first.longswordsman!);
  });

  it("stretches the barbarian roster for slower game speeds", () => {
    const normal = tierSweep("normal");
    const epic = tierSweep("epic");
    // Epic multiplies tech costs 2.5x; unlocks stretch ~1.7x, so the iron age
    // reaches the horde far later (swordsman unlock 29 -> ~49, rider 10 -> ~17).
    expect(epic.rider!).toBeGreaterThanOrEqual(17);
    expect(epic.swordsman!).toBeGreaterThanOrEqual(49);
    expect(epic.swordsman!).toBeGreaterThan(normal.swordsman! + 10);
  });

  it("coastal barbarian camps launch warships", () => {
    const state = createGame({ seed: "barb-sea", cols: 40, rows: 30, barbarians: true });
    const barbId = state.players.find((p) => p.isBarbarian)!.id;
    for (const t of state.map.tiles) t.feature = undefined; // start from a clean map
    for (const u of [...unitsOf(state, barbId)]) state.units.delete(u.id);
    // Craft several coastal camps: a strip of coast with camps on the land beside it.
    let camps = 0;
    for (let row = 3; row < state.map.rows - 3 && camps < 5; row += 4) {
      const land = getTile(state.map, 10, row);
      const sea = getTile(state.map, 11, row);
      if (!land || !sea) continue;
      land.terrain = "grassland";
      land.feature = "barb_camp";
      sea.terrain = "coast";
      camps++;
    }
    expect(camps).toBeGreaterThan(0);

    const seenTypes = new Set<UnitTypeId>();
    for (let t = 14; t <= 150; t++) {
      state.turn = t;
      spawnFromCamps(state, barbId);
      for (const u of unitsOf(state, barbId)) seenTypes.add(u.type);
      for (const u of [...unitsOf(state, barbId)]) state.units.delete(u.id);
    }
    const spawnedNaval = [...seenTypes].some((ty) => UNIT_DEFS[ty].cls.startsWith("naval"));
    expect(spawnedNaval).toBe(true); // ships raid from the sea
  });

  it("a camp beside a tiny lake stays land-locked", () => {
    const state = createGame({ seed: "barb-pond", cols: 40, rows: 30, barbarians: true });
    const barbId = state.players.find((p) => p.isBarbarian)!.id;
    for (const t of state.map.tiles) t.feature = undefined;
    for (const u of [...unitsOf(state, barbId)]) state.units.delete(u.id);
    // Isolate an inland region so no ocean/coast leaks in, then drop a lone pond
    // beside a camp: one tile, too small to float a fleet.
    for (let c = 6; c <= 16; c++) for (let r = 6; r <= 14; r++) getTile(state.map, c, r)!.terrain = "grassland";
    getTile(state.map, 10, 10)!.feature = "barb_camp";
    getTile(state.map, 11, 10)!.terrain = "lake";

    const seenTypes = new Set<UnitTypeId>();
    for (let t = 40; t <= 200; t++) {
      state.turn = t;
      spawnFromCamps(state, barbId);
      for (const u of unitsOf(state, barbId)) seenTypes.add(u.type);
      for (const u of [...unitsOf(state, barbId)]) state.units.delete(u.id);
    }
    const spawnedNaval = [...seenTypes].some((ty) => UNIT_DEFS[ty].cls.startsWith("naval"));
    expect(spawnedNaval).toBe(false); // a pond can't launch warships
  });

  it("a camp beside a large enough lake launches warships", () => {
    const state = createGame({ seed: "barb-lake", cols: 40, rows: 30, barbarians: true });
    const barbId = state.players.find((p) => p.isBarbarian)!.id;
    for (const t of state.map.tiles) t.feature = undefined;
    for (const u of [...unitsOf(state, barbId)]) state.units.delete(u.id);
    for (let c = 6; c <= 18; c++) for (let r = 6; r <= 14; r++) getTile(state.map, c, r)!.terrain = "grassland";
    getTile(state.map, 10, 10)!.feature = "barb_camp";
    // A connected strip of four lake tiles beside the camp: big enough to sail.
    for (const c of [11, 12, 13, 14]) getTile(state.map, c, 10)!.terrain = "lake";

    const seenTypes = new Set<UnitTypeId>();
    for (let t = 40; t <= 200; t++) {
      state.turn = t;
      spawnFromCamps(state, barbId);
      for (const u of unitsOf(state, barbId)) seenTypes.add(u.type);
      for (const u of [...unitsOf(state, barbId)]) state.units.delete(u.id);
    }
    const spawnedNaval = [...seenTypes].some((ty) => UNIT_DEFS[ty].cls.startsWith("naval"));
    expect(spawnedNaval).toBe(true); // a real lake floats a raiding party
  });

  it("new camps emerge only in the fog of war, up to the target density", () => {
    const state = createGame({ seed: "feat-fog", cols: 60, rows: 40, barbarians: true });
    const barbId = state.players.find((p) => p.isBarbarian)!.id;
    // Wipe existing camps so we're below target and a fresh one must appear.
    for (const tile of state.map.tiles) if (tile.feature === "barb_camp") tile.feature = undefined;
    expect(state.map.tiles.some((t) => t.feature === "barb_camp")).toBe(false);

    state.turn = 7; // a multiple of the "normal" camp-spawn cadence
    maybeSpawnCamps(state, barbId);

    const camps = state.map.tiles.filter((t) => t.feature === "barb_camp");
    expect(camps.length).toBe(1); // one new camp per spawn tick (gradual)

    // It must NOT sit on a tile any civilization can currently see.
    const sighted = new Set<string>();
    for (const p of state.players) {
      if (p.isBarbarian) continue;
      for (const k of computeVisible(state, p.id)) sighted.add(k);
    }
    for (const c of camps) expect(sighted.has(`${c.col},${c.row}`)).toBe(false);
  });

  it("does not spawn new camps once the target density is met", () => {
    const state = createGame({ seed: "feat-fog-full", cols: 44, rows: 30, barbarians: true });
    const barbId = state.players.find((p) => p.isBarbarian)!.id;
    const before = state.map.tiles.filter((t) => t.feature === "barb_camp").length;
    state.turn = 7;
    maybeSpawnCamps(state, barbId); // already at target from placement → no-op
    const after = state.map.tiles.filter((t) => t.feature === "barb_camp").length;
    expect(after).toBe(before);
  });

  it("clearing a barbarian camp raises unit and global morale", () => {
    const state = createGame({ seed: "feat-morale", cols: 44, rows: 30, barbarians: true });
    beginTurn(state);
    const unit = firstUnit(state, 0);
    const player = state.players[0]!;
    const moraleBefore = globalMoraleOf(player);
    const unitMoraleBefore = unitMorale(unit);
    clearBarbCamp(state, unit, player);
    expect(globalMoraleOf(player)).toBeGreaterThan(moraleBefore);
    expect(unitMorale(unit)).toBeGreaterThan(unitMoraleBefore);
  });

  it("a village can grant a large morale boost to a single unit", () => {
    const state = createGame({ seed: "feat-vill-umorale", cols: 44, rows: 30, barbarians: true });
    beginTurn(state);
    const unit = firstUnit(state, 0);
    const before = unitMorale(unit);
    onVillageUnitMorale(state, unit);
    expect(unitMorale(unit)).toBe(before + VILLAGE_UNIT_MORALE);
  });

  it("a village can grant a smaller morale boost to the whole empire", () => {
    const state = createGame({ seed: "feat-vill-gmorale", cols: 44, rows: 30, barbarians: true });
    beginTurn(state);
    const player = state.players[0]!;
    const before = globalMoraleOf(player);
    onVillageGlobalMorale(state, player);
    expect(globalMoraleOf(player)).toBe(before + VILLAGE_GLOBAL_MORALE);
    // a global lift is recorded for the morale dialog and resets the decay grace
    expect(player.moraleLog?.some((e) => e.reason.includes("village"))).toBe(true);
    expect(player.lastMoraleGainTurn).toBe(state.turn);
  });

  // Sample the reward category triggerVillage hands out across many seeds by
  // walking the unit over a range of tiles (the RNG keys off turn + position).
  function sampleVillageRewards(state: GameState, unit: Unit, player: Player): Set<string> {
    const seen = new Set<string>();
    for (let t = 1; t <= 40; t++) {
      state.turn = t;
      for (let d = 0; d < 6; d++) {
        unit.col = 5 + d;
        unit.row = 5 + (t % 7);
        triggerVillage(state, unit, player);
        const last = state.log[state.log.length - 1];
        if (last?.reward) seen.add(last.reward);
      }
    }
    return seen;
  }

  it("a village can bless a civ with faith", () => {
    const state = createGame({ seed: "feat-vill-faith", cols: 44, rows: 30, barbarians: true });
    beginTurn(state);
    const unit = firstUnit(state, 0);
    const player = state.players[0]!;
    const faithBefore = player.faith;
    const rewards = sampleVillageRewards(state, unit, player);
    expect(rewards.has("faith")).toBe(true);
    expect(player.faith).toBeGreaterThan(faithBefore);
  });

  it("a village only grants a civic boost once the civ has engaged the culture tree", () => {
    const state = createGame({ seed: "feat-vill-civic", cols: 44, rows: 30, barbarians: true });
    beginTurn(state);
    const unit = firstUnit(state, 0);
    const player = state.players[0]!;

    // No government in progress: the civic band must never be handed out.
    player.researchingGovernment = null;
    expect(sampleVillageRewards(state, unit, player).has("civic")).toBe(false);

    // Now researching a government: the boost becomes possible and adds culture progress.
    player.researchingGovernment = "despotism";
    const cultureBefore = player.cultureProgress;
    const rewards = sampleVillageRewards(state, unit, player);
    expect(rewards.has("civic")).toBe(true);
    expect(player.cultureProgress).toBeGreaterThan(cultureBefore);
  });

  it("disabling barbarians removes barbarian players, units, and camps", () => {
    const state = createGame({ seed: "feat-none", cols: 44, rows: 30, barbarians: "none" });
    expect(state.barbarianActivity).toBe("none");
    expect(state.players.some((p) => p.isBarbarian)).toBe(false);
    expect(state.map.tiles.some((t) => t.feature === "barb_camp")).toBe(false);
    const barbUnits = [...state.units.values()].filter((u) =>
      state.players.find((p) => p.id === u.ownerId)?.isBarbarian,
    ).length;
    expect(barbUnits).toBe(0);
  });
});
