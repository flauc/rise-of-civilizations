import { describe, it, expect } from "vitest";
import { createGame } from "./setup";
import { beginTurn, applyCommand } from "./commands";
import { leaveRuin, tickRuins, clearRuin, RUIN_LIFESPAN } from "./features";
import { citiesOf, unitsOf, type GameState } from "./state";
import { getTile } from "@roc/shared";

function foundedGame(): { s: GameState } {
  const s = createGame({ seed: "ruins", cols: 40, rows: 28, barbarians: false });
  beginTurn(s);
  return { s };
}

describe("ruins", () => {
  it("leaveRuin marks a tile with an expiry RUIN_LIFESPAN turns out", () => {
    const { s } = foundedGame();
    s.turn = 5;
    const tile = getTile(s.map, 10, 10)!;
    leaveRuin(s, 10, 10);
    expect(tile.feature).toBe("ruin");
    expect(tile.featureExpiresTurn).toBe(5 + RUIN_LIFESPAN);
  });

  it("leaveRuin clears any leftover defensive structure", () => {
    const { s } = foundedGame();
    const tile = getTile(s.map, 12, 8)!;
    tile.structure = { kind: "wall", tier: 1, hp: 50, maxHp: 50 };
    leaveRuin(s, 12, 8);
    expect(tile.structure).toBeUndefined();
    expect(tile.feature).toBe("ruin");
  });

  it("tickRuins fades a ruin only once its lifespan has elapsed", () => {
    const { s } = foundedGame();
    s.turn = 0;
    const tile = getTile(s.map, 14, 6)!;
    leaveRuin(s, 14, 6); // expires at turn RUIN_LIFESPAN

    s.turn = RUIN_LIFESPAN - 1;
    tickRuins(s);
    expect(tile.feature).toBe("ruin"); // not yet

    s.turn = RUIN_LIFESPAN;
    tickRuins(s);
    expect(tile.feature).toBeUndefined();
    expect(tile.featureExpiresTurn).toBeUndefined();
  });

  it("clearRuin only clears ruins, leaving other features intact", () => {
    const { s } = foundedGame();
    const tile = getTile(s.map, 16, 4)!;
    tile.feature = "village";
    clearRuin(tile);
    expect(tile.feature).toBe("village");
  });

  it("founding a city on a ruin clears the ruin", () => {
    const { s } = foundedGame();
    const settler = unitsOf(s, 0).find((u) => u.type === "settler")!;
    const tile = getTile(s.map, settler.col, settler.row)!;
    leaveRuin(s, settler.col, settler.row);
    expect(tile.feature).toBe("ruin");

    const res = applyCommand(s, { type: "foundCity", unitId: settler.id });
    expect(res.ok).toBe(true);
    expect(citiesOf(s, 0).length).toBe(1);
    expect(tile.feature).toBeUndefined();
    expect(tile.featureExpiresTurn).toBeUndefined();
  });
});
