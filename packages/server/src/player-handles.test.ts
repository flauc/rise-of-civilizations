import { describe, it, expect } from "vitest";
import { enrichLeaderboard, enrichSessionsPerPlayer, resolvePlayerHandle, buildHandleByClientId } from "./player-handles";
import type { SessionRow } from "./analytics";

describe("player handle resolution", () => {
  const rows: SessionRow[] = [
    { sessionId: "s1", clientId: "c1", handle: "Alice", userId: "u1" },
    { sessionId: "s2", clientId: "c1", outcome: "win", score: 100, turns: 10 },
  ];

  it("backfills handle from another session with the same clientId", () => {
    const byClient = buildHandleByClientId(rows);
    expect(resolvePlayerHandle({ clientId: "c1" }, byClient, new Map())).toBe("Alice");
  });

  it("enriches legacy leaderboard rows that only carry clientId", () => {
    const lb = enrichLeaderboard(
      [{ clientId: "c1", sessionId: "s2", score: 100, outcome: "win", turns: 10, ts: 1 }],
      rows,
      new Map(),
    );
    expect(lb[0]?.handle).toBe("Alice");
  });

  it("enriches sessions-per-player rows from registered users", () => {
    const stats = enrichSessionsPerPlayer(
      [{ clientId: "c9", userId: "u9", sessions: 3, wins: 1, losses: 0, abandoned: 2, lastPlayed: 1 }],
      rows,
      new Map([["u9", "Bob"]]),
    );
    expect(stats[0]?.handle).toBe("Bob");
  });
});
