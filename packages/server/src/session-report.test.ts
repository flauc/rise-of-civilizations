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
