import { describe, it, expect } from "vitest";
import { MemoryAnalyticsStore } from "./analytics";
import type { AnalyticsEvent } from "@roc/shared";

const now = Date.now();

function start(sessionId: string, clientId: string, civId?: string): AnalyticsEvent {
  return { t: "session_start", sessionId, clientId, mode: "sp", civId, ts: now };
}
function end(
  sessionId: string,
  clientId: string,
  outcome: "win" | "loss" | "abandoned",
  turns: number,
  score?: number,
): AnalyticsEvent {
  return { t: "session_end", sessionId, clientId, outcome, turns, score, ts: now + 1000 };
}

describe("MemoryAnalyticsStore", () => {
  it("merges a session_start + session_end into one session row", async () => {
    const a = new MemoryAnalyticsStore();
    await a.record([start("s1", "p1", "rome"), end("s1", "p1", "win", 42, 300)]);
    const o = await a.overview();
    expect(o.totalSessions).toBe(1);
    expect(o.uniquePlayers).toBe(1);
    expect(o.completedSessions).toBe(1);
    expect(o.avgTurns).toBe(42);
  });

  it("handles out-of-order delivery (end before start)", async () => {
    const a = new MemoryAnalyticsStore();
    await a.record([end("s1", "p1", "loss", 10)]);
    await a.record([start("s1", "p1", "egypt")]);
    const civs = await a.civDistribution();
    expect(civs).toEqual([{ civId: "egypt", count: 1 }]);
    const out = await a.outcomeBreakdown();
    expect(out).toEqual({ win: 0, loss: 1, abandoned: 0 });
  });

  it("counts outcomes including abandoned", async () => {
    const a = new MemoryAnalyticsStore();
    await a.record([
      start("s1", "p1"),
      end("s1", "p1", "win", 20, 100),
      start("s2", "p1"),
      end("s2", "p1", "abandoned", 5),
      start("s3", "p2"),
      end("s3", "p2", "loss", 30, 50),
    ]);
    expect(await a.outcomeBreakdown()).toEqual({ win: 1, loss: 1, abandoned: 1 });
    const o = await a.overview();
    expect(o.uniquePlayers).toBe(2);
    expect(o.abandonedSessions).toBe(1);
  });

  it("aggregates civ distribution sorted by count", async () => {
    const a = new MemoryAnalyticsStore();
    await a.record([start("s1", "p1", "rome"), start("s2", "p2", "rome"), start("s3", "p3", "egypt")]);
    expect(await a.civDistribution()).toEqual([
      { civId: "rome", count: 2 },
      { civId: "egypt", count: 1 },
    ]);
  });

  it("counts sessions per player with win/loss/abandoned splits", async () => {
    const a = new MemoryAnalyticsStore();
    await a.record([
      start("s1", "p1"),
      end("s1", "p1", "win", 20, 100),
      start("s2", "p1"),
      end("s2", "p1", "abandoned", 5),
    ]);
    const per = await a.sessionsPerPlayer();
    expect(per).toHaveLength(1);
    expect(per[0]).toMatchObject({ clientId: "p1", sessions: 2, wins: 1, losses: 0, abandoned: 1 });
  });

  it("ranks the leaderboard by score, completed games only", async () => {
    const a = new MemoryAnalyticsStore();
    await a.record([
      start("s1", "p1", "rome"),
      end("s1", "p1", "win", 40, 250),
      start("s2", "p2", "egypt"),
      end("s2", "p2", "loss", 30, 400),
      start("s3", "p3"),
      end("s3", "p3", "abandoned", 5), // no score -> excluded
    ]);
    const lb = await a.leaderboard();
    expect(lb.map((e) => e.score)).toEqual([400, 250]);
    expect(lb[0]!.clientId).toBe("p2");
  });

  it("tallies votes idempotently and supports removal", async () => {
    const a = new MemoryAnalyticsStore();
    await a.record([
      { t: "feature_vote", clientId: "p1", featureId: "victory-science", action: "add", ts: now },
      // same player re-adding is idempotent (still one vote)
      { t: "feature_vote", clientId: "p1", featureId: "victory-science", action: "add", ts: now },
      { t: "feature_vote", clientId: "p2", featureId: "victory-science", action: "add", ts: now },
      { t: "feature_vote", clientId: "p3", featureId: "map-europe", action: "add", ts: now },
    ]);
    expect(await a.voteTotals()).toEqual([
      { featureId: "victory-science", votes: 2 },
      { featureId: "map-europe", votes: 1 },
    ]);

    // p1 removes their vote -> down to one
    await a.record([{ t: "feature_vote", clientId: "p1", featureId: "victory-science", action: "remove", ts: now }]);
    expect(await a.voteTotals()).toEqual([
      { featureId: "victory-science", votes: 1 },
      { featureId: "map-europe", votes: 1 },
    ]);
  });
});
