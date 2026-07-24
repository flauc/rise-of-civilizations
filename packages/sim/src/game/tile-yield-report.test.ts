import { describe, it, expect } from "vitest";
import { createGame } from "./setup";
import { beginTurn, applyCommand } from "./commands";
import { tileYieldReport } from "./economy";
import { citiesOf, unitsOf, type GameState } from "./state";
import { getTile, isMapTilePresent } from "@roc/shared";

function game(): GameState {
  const s = createGame({ seed: "yield-report", cols: 40, rows: 28, barbarians: false, humanSlots: 2 });
  beginTurn(s);
  // Grant player 0 a named trait that boosts coastal (water) tiles by +1 gold.
  s.players[0]!.modifiers.push({
    source: "Maritime Traders",
    effect: { coastalTileGoldBonus: 1 },
    expiresOnTurn: s.turn + 999,
  });
  return s;
}

function foundCity(s: GameState, owner = 0) {
  const settler = unitsOf(s, owner).find((u) => u.type === "settler")!;
  applyCommand(s, { type: "foundCity", unitId: settler.id }, owner);
  return citiesOf(s, owner)[0]!;
}

/** Force a tile to a given terrain. */
function setTerrain(s: GameState, col: number, row: number, terrain: string) {
  const t = getTile(s.map, col, row)!;
  t.terrain = terrain as typeof t.terrain;
}

describe("tileYieldReport", () => {
  it("attributes an owner's trait on a claimed coast tile", () => {
    const s = game();
    const city = foundCity(s, 0);
    const owned = s.map.tiles.find((t) => t.ownerCityId === city.id && t.col !== city.col && t.row !== city.row)!;
    setTerrain(s, owned.col, owned.row, "coast");

    const r = tileYieldReport(s, owned.col, owned.row, 0);
    expect(r.preview).toBe(false);
    // Base coast gold (2) + the trait (1).
    expect(r.yields.gold).toBe(3);
    const src = r.sources.find((x) => x.label === "Maritime Traders");
    expect(src?.delta.gold).toBe(1);
  });

  it("previews the viewer's trait on an unclaimed coast tile without folding it into the headline", () => {
    const s = game();
    // A tile far from spawn, still unclaimed.
    const free = s.map.tiles.find((t) => t.ownerCityId === undefined && isMapTilePresent(s.map, t.col, t.row))!;
    setTerrain(s, free.col, free.row, "coast");

    const r = tileYieldReport(s, free.col, free.row, 0);
    expect(r.preview).toBe(true);
    // Headline stays the perk-blind base (coast gold = 2).
    expect(r.yields.gold).toBe(2);
    const src = r.sources.find((x) => x.label === "Maritime Traders");
    expect(src?.delta.gold).toBe(1);
  });

  it("does not list a coastal source on a landlocked grassland tile", () => {
    const s = game();
    const free = s.map.tiles.find((t) => t.ownerCityId === undefined && isMapTilePresent(s.map, t.col, t.row))!;
    setTerrain(s, free.col, free.row, "grassland");

    const r = tileYieldReport(s, free.col, free.row, 0);
    expect(r.sources.find((x) => x.label === "Maritime Traders")).toBeUndefined();
  });
});
