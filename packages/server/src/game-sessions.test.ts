import { describe, it, expect } from "vitest";
import { deriveScoreboard } from "./game-sessions";
import type { SessionRow } from "./analytics";

describe("game session detail", () => {
  it("derives a scoreboard from human + AI civ picks when none was stored", () => {
    const row: SessionRow = {
      sessionId: "s1",
      clientId: "p1",
      handle: "Caesar",
      civId: "rome",
      score: 500,
      aiCivIds: ["greece", null],
    };
    const board = deriveScoreboard(row);
    expect(board).toHaveLength(3);
    expect(board[0]).toMatchObject({ name: "Caesar", civId: "rome", isHuman: true, score: 500, isViewer: true });
    expect(board[1]).toMatchObject({ name: "Greece", civId: "greece", isHuman: false });
    expect(board[2]).toMatchObject({ name: "AI 2 (random)", isHuman: false });
  });
});
