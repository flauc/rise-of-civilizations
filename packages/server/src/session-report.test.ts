import { describe, it, expect } from "vitest";
import { aggregateSessionReport, collectReportFacets, buildSessionReportResponse } from "./session-report";
import type { SessionRow } from "./analytics";

function row(partial: Partial<SessionRow> & Pick<SessionRow, "sessionId" | "clientId">): SessionRow {
  return { ...partial };
}

describe("session report", () => {
  const rows: SessionRow[] = [
    row({
      sessionId: "s1",
      clientId: "c1",
      userId: "u1",
      handle: "Alice",
      mapType: "continents",
      mapSize: "medium",
      gameSpeed: "normal",
      aiCount: 2,
      civId: "rome",
      outcome: "win",
      condition: "domination",
      turns: 80,
      score: 1200,
    }),
    row({
      sessionId: "s2",
      clientId: "c2",
      mapType: "continents",
      mapSize: "medium",
      gameSpeed: "normal",
      aiCount: 2,
      civId: "greece",
      outcome: "loss",
      condition: "science",
      turns: 60,
      score: 800,
    }),
    row({
      sessionId: "s3",
      clientId: "c1",
      mapType: "pangaea",
      mapSize: "small",
      gameSpeed: "fast",
      aiCount: 1,
      outcome: "abandoned",
      turns: 12,
    }),
    row({
      sessionId: "s4",
      clientId: "c3",
      mapType: "continents",
      mapSize: "large",
      gameSpeed: "normal",
      aiCount: 3,
    }),
  ];

  it("aggregates totals and outcomes", () => {
    const r = aggregateSessionReport(rows);
    expect(r.totalSessions).toBe(4);
    // Registered sessions key on userId; guest sessions on clientId (s1=u1, s3=c1).
    expect(r.uniquePlayers).toBe(4);
    expect(r.uniqueRegisteredUsers).toBe(1);
    expect(r.wins).toBe(1);
    expect(r.losses).toBe(1);
    expect(r.abandoned).toBe(1);
    expect(r.inProgress).toBe(1);
    expect(r.completedSessions).toBe(2);
    expect(r.avgTurns).toBe(50.7);
  });

  it("filters by map type and size", () => {
    const r = aggregateSessionReport(rows, { mapType: "continents", mapSize: "medium" });
    expect(r.totalSessions).toBe(2);
    expect(r.wins).toBe(1);
    expect(r.losses).toBe(1);
    expect(r.uniquePlayers).toBe(2);
  });

  it("collects facets for filter dropdowns", () => {
    const f = collectReportFacets(rows);
    expect(f.mapTypes).toEqual(["continents", "pangaea"]);
    expect(f.mapSizes).toEqual(["large", "medium", "small"]);
    expect(f.aiCounts).toEqual([1, 2, 3]);
  });

  it("builds a full response with facets and report", () => {
    const res = buildSessionReportResponse(rows, { gameSpeed: "normal" });
    expect(res.filters.gameSpeed).toBe("normal");
    expect(res.report.totalSessions).toBe(3);
    expect(res.facets.mapTypes.length).toBeGreaterThan(0);
  });
});

describe("tutorial funnel", () => {
  const rows: SessionRow[] = [
    // Played the tutorial through, then won the game.
    row({
      sessionId: "t1",
      clientId: "c1",
      isTutorial: true,
      tutorialOutcome: "completed",
      outcome: "win",
      turns: 40,
    }),
    // Finished the coaching, left the game after.
    row({
      sessionId: "t2",
      clientId: "c2",
      isTutorial: true,
      tutorialOutcome: "completed",
      outcome: "abandoned",
      turns: 6,
    }),
    row({
      sessionId: "t3",
      clientId: "c3",
      isTutorial: true,
      tutorialOutcome: "skipped",
      tutorialStep: "t2_attack_barbarian",
      outcome: "abandoned",
      turns: 2,
    }),
    row({
      sessionId: "t4",
      clientId: "c4",
      isTutorial: true,
      tutorialOutcome: "abandoned",
      tutorialStep: "t2_attack_barbarian",
    }),
    // Started the tutorial, still playing it.
    row({ sessionId: "t5", clientId: "c5", isTutorial: true }),
    // Not a tutorial: must not appear anywhere in the funnel.
    row({ sessionId: "g1", clientId: "c6", outcome: "win", turns: 90 }),
  ];

  it("counts plays, finishes, and how many went on to finish the game", () => {
    const t = aggregateSessionReport(rows).tutorial;
    expect(t.started).toBe(5);
    expect(t.completed).toBe(2);
    expect(t.skipped).toBe(1);
    expect(t.abandoned).toBe(1);
    expect(t.inProgress).toBe(1);
    expect(t.completionRate).toBe(40);
    expect(t.gamesFinished).toBe(1);
    expect(t.gameCompletionRate).toBe(20);
  });

  it("reports where players stopped, ignoring completed runs", () => {
    const t = aggregateSessionReport(rows).tutorial;
    expect(t.dropOff).toEqual([{ label: "t2_attack_barbarian", count: 2 }]);
  });

  it("filters to tutorials only and excludes them again", () => {
    expect(aggregateSessionReport(rows, { isTutorial: true }).totalSessions).toBe(5);
    const nonTutorial = aggregateSessionReport(rows, { isTutorial: false });
    expect(nonTutorial.totalSessions).toBe(1);
    expect(nonTutorial.tutorial.started).toBe(0);
    expect(nonTutorial.tutorial.completionRate).toBe(0);
  });

  it("exposes tutorial endings as facets", () => {
    expect(collectReportFacets(rows).tutorialOutcomes).toEqual(["abandoned", "completed", "skipped"]);
  });
});
