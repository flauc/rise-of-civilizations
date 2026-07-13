import { describe, it, expect } from "vitest";
import { MemoryAnalyticsStore } from "./analytics";
import type { AnalyticsEvent } from "@roc/shared";

const now = Date.now();

function start(sessionId: string, clientId: string, civId?: string, handle?: string): AnalyticsEvent {
  return { t: "session_start", sessionId, clientId, handle, mode: "sp", civId, ts: now };
}
function startCfg(sessionId: string, clientId: string, cfg: Partial<Extract<AnalyticsEvent, { t: "session_start" }>>): AnalyticsEvent {
  return { t: "session_start", sessionId, clientId, mode: "sp", ts: now, ...cfg };
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
      start("s1", "p1", undefined, "Alice"),
      end("s1", "p1", "win", 20, 100),
      start("s2", "p1", undefined, "Alice"),
      end("s2", "p1", "abandoned", 5),
    ]);
    const per = await a.sessionsPerPlayer();
    expect(per).toHaveLength(1);
    expect(per[0]).toMatchObject({ handle: "Alice", sessions: 2, wins: 1, losses: 0, abandoned: 1 });
  });

  it("stores handle on session_end when provided", async () => {
    const a = new MemoryAnalyticsStore();
    await a.record([
      start("s1", "p1", "rome", "Alice"),
      { t: "session_end", sessionId: "s1", clientId: "p1", handle: "Alice", userId: "u1", outcome: "win", turns: 20, score: 100, ts: now + 1000 },
    ]);
    const lb = await a.leaderboard();
    expect(lb[0]?.handle).toBe("Alice");
  });

  it("ranks the leaderboard by score, completed games only", async () => {
    const a = new MemoryAnalyticsStore();
    await a.record([
      start("s1", "p1", "rome", "Alice"),
      end("s1", "p1", "win", 40, 250),
      start("s2", "p2", "egypt", "Bob"),
      end("s2", "p2", "loss", 30, 400),
      start("s3", "p3"),
      end("s3", "p3", "abandoned", 5), // no score -> excluded
    ]);
    const lb = await a.leaderboard();
    expect(lb.map((e) => e.score)).toEqual([400, 250]);
    expect(lb[0]!.handle).toBe("Bob");
  });

  it("aggregates the game-setup config players chose", async () => {
    const a = new MemoryAnalyticsStore();
    await a.record([
      startCfg("s1", "p1", { mapType: "continents", mapSize: "medium", startingGold: "balanced", barbarianLevel: "normal", aiCount: 3, naturalWonders: true, legends: true }),
      startCfg("s2", "p2", { mapType: "continents", mapSize: "small", startingGold: "generous", barbarianLevel: "high", aiCount: 1, naturalWonders: false, legends: true }),
      startCfg("s3", "p3", { mapType: "realworld", mapSize: "medium", startingGold: "balanced", barbarianLevel: "none", aiCount: 3, naturalWonders: false, legends: false }),
    ]);
    const c = await a.configBreakdown();
    expect(c.mapTypes).toEqual([
      { label: "continents", count: 2 },
      { label: "realworld", count: 1 },
    ]);
    expect(c.startingGold.find((x) => x.label === "balanced")?.count).toBe(2);
    expect(c.aiCount.find((x) => x.label === "3")?.count).toBe(2);
    expect(c.barbarians.find((x) => x.label === "none")?.count).toBe(1);
    expect(c.naturalWonders).toEqual({ on: 1, off: 2 });
    expect(c.legends).toEqual({ on: 2, off: 1 });
  });

  it("breaks down wins/losses by victory condition", async () => {
    const a = new MemoryAnalyticsStore();
    await a.record([
      start("s1", "p1"),
      { t: "session_end", sessionId: "s1", clientId: "p1", outcome: "win", condition: "domination", turns: 40, ts: now },
      start("s2", "p2"),
      { t: "session_end", sessionId: "s2", clientId: "p2", outcome: "win", condition: "science", turns: 60, ts: now },
      start("s3", "p3"),
      { t: "session_end", sessionId: "s3", clientId: "p3", outcome: "loss", condition: "domination", turns: 35, ts: now },
    ]);
    const v = await a.victoryBreakdown();
    expect(v.find((x) => x.condition === "domination")).toEqual({ condition: "domination", wins: 1, losses: 1 });
    expect(v.find((x) => x.condition === "science")).toEqual({ condition: "science", wins: 1, losses: 0 });
  });

  it("counts which victory conditions were enabled at setup", async () => {
    const a = new MemoryAnalyticsStore();
    await a.record([
      startCfg("s1", "p1", { enabledVictories: ["domination", "science", "culture"] }),
      startCfg("s2", "p2", { enabledVictories: ["domination", "religious"] }),
    ]);
    const c = await a.configBreakdown();
    expect(c.enabledVictories.find((x) => x.label === "domination")?.count).toBe(2);
    expect(c.enabledVictories.find((x) => x.label === "science")?.count).toBe(1);
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

  it("records the registered username on session start when logged in", async () => {
    const a = new MemoryAnalyticsStore();
    await a.record([
      {
        t: "session_start",
        sessionId: "s1",
        clientId: "anon-uuid",
        handle: "user1",
        userId: "u_abc",
        mode: "sp",
        ts: now,
      },
      end("s1", "anon-uuid", "win", 10, 100),
    ]);
    const list = await a.listGameSessions({ filters: { handle: "user1" } });
    expect(list.total).toBe(1);
    expect(list.items[0]?.handle).toBe("user1");
    expect(list.items[0]?.clientId).toBe("anon-uuid");
  });

  it("lists game sessions with pagination and column filters", async () => {
    const a = new MemoryAnalyticsStore();
    await a.record([
      startCfg("s1", "p1", { mapType: "continents", mapSize: "medium", barbarianLevel: "normal", villages: true, turnLimit: 120, gameSpeed: "normal" }),
      end("s1", "p1", "win", 40, 300),
      startCfg("s2", "p2", { mapType: "realworld", mapSize: "small", barbarianLevel: "none", villages: false, turnLimit: 0, gameSpeed: "fast" }),
      end("s2", "p2", "abandoned", 5),
    ]);

    const page1 = await a.listGameSessions({ page: 1, pageSize: 1, sort: "startedAt", order: "desc" });
    expect(page1.total).toBe(2);
    expect(page1.items).toHaveLength(1);

    const filtered = await a.listGameSessions({
      page: 1,
      pageSize: 25,
      filters: { mapType: "realworld", villages: false },
    });
    expect(filtered.total).toBe(1);
    expect(filtered.items[0]).toMatchObject({
      sessionId: "s2",
      mapType: "realworld",
      villages: false,
      outcome: "abandoned",
    });

    const byText = await a.listGameSessions({ filters: { q: "continents" } });
    expect(byText.total).toBe(1);
    expect(byText.items[0]?.sessionId).toBe("s1");
  });

  it("stores bug reports, lists summaries newest-first, and fetches full detail", async () => {
    const a = new MemoryAnalyticsStore();
    await a.record([
      { t: "bug_report", reportId: "r1", clientId: "p1", sessionId: "s1", message: "older", mode: "sp", turn: 5, civId: "rome", state: '{"x":1}', errors: ["boom"], context: { url: "u" }, ts: now },
      { t: "bug_report", reportId: "r2", clientId: "p2", message: "newer, no state", ts: now + 1000 },
      // duplicate id is ignored (immutable)
      { t: "bug_report", reportId: "r1", clientId: "px", message: "overwrite attempt", ts: now + 2000 },
    ]);

    const list = await a.bugReports();
    expect(list.map((b) => b.reportId)).toEqual(["r2", "r1"]); // newest first
    expect(list[0]).toMatchObject({ reportId: "r2", hasState: false });
    expect(list[1]).toMatchObject({ reportId: "r1", clientId: "p1", turn: 5, hasState: true });
    // summaries omit the heavy payload
    expect((list[1] as unknown as Record<string, unknown>).state).toBeUndefined();
    expect((list[1] as unknown as Record<string, unknown>).errors).toBeUndefined();

    const detail = await a.bugReport("r1");
    expect(detail).toMatchObject({ message: "older", state: '{"x":1}', errors: ["boom"], context: { url: "u" } });
    expect(await a.bugReport("nope")).toBeUndefined();
  });

  it("enriches bug reports from the linked session and supports paginated list", async () => {
    const a = new MemoryAnalyticsStore();
    await a.record([
      startCfg("s1", "p1", { civId: "rome", mapType: "continents", handle: "Caesar", userId: "u1", cols: 80, rows: 56 }),
      end("s1", "p1", "win", 42, 300),
      { t: "bug_report", reportId: "r1", clientId: "p1", sessionId: "s1", message: "stuck", mode: "sp", turn: 10, ts: now + 500 },
    ]);
    const detail = await a.bugReport("r1");
    expect(detail).toMatchObject({
      handle: "Caesar",
      userId: "u1",
      mapType: "continents",
      cols: 80,
      rows: 56,
      outcome: "win",
      sessionTurns: 42,
      score: 300,
    });
    const page = await a.listBugReports({ page: 1, pageSize: 10, filters: { handle: "Caesar" } });
    expect(page.total).toBe(1);
    expect(page.items[0]?.message).toBe("stuck");
  });

  it("exports and restores session rows for dev persistence", async () => {
    const a = new MemoryAnalyticsStore();
    await a.record([start("s1", "p1", "rome"), end("s1", "p1", "win", 42, 300)]);
    const exported = a.exportSessions();
    expect(exported).toHaveLength(1);
    expect(exported[0]).toMatchObject({ sessionId: "s1", clientId: "p1", civId: "rome", outcome: "win" });

    const b = new MemoryAnalyticsStore();
    expect(b.restoreSessions(exported)).toBe(1);
    const o = await b.overview();
    expect(o.totalSessions).toBe(1);
    expect(o.completedSessions).toBe(1);
  });
});
