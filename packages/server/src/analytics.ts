// Analytics storage behind an interface, mirroring the storage.ts pattern. The
// default MemoryAnalyticsStore is pure and vitest-testable; analytics-postgres.ts
// provides the durable Postgres adapter used when DATABASE_URL is set.
//
// The logical model is two tables:
//  - sessions: one row per game session, keyed by sessionId. A `session_start`
//    event fills the setup columns; a `session_end` event fills the outcome
//    columns. Either may arrive first (offline queues can reorder), so writes
//    merge rather than overwrite.
//  - feature_votes: one row per (clientId, featureId). "add" upserts, "remove"
//    deletes — so the tally always reflects current votes, idempotently.

import type {
  AdminBugReport,
  AdminOverview,
  AnalyticsEvent,
  BugReportDetail,
  BugReportSummary,
  CivCount,
  ConfigBreakdown,
  LabelCount,
  LeaderboardEntry,
  OutcomeBreakdown,
  PlayerSessionStats,
  SessionOutcome,
  SessionScoreboardEntry,
  VictoryTypeCount,
  VoteTotal,
} from "@roc/shared";
import { bugReportFromEvent, enrichBugReportFromSession, listBugReportsFromRows } from "./bug-reports";
import { buildHandleByClientId, resolvePlayerHandle } from "./player-handles";

export interface SessionRow {
  sessionId: string;
  clientId: string;
  handle?: string;
  userId?: string;
  mode?: string;
  civId?: string;
  mapType?: string;
  mapSize?: string;
  cols?: number;
  rows?: number;
  aiCount?: number;
  barbarians?: boolean;
  legends?: boolean;
  barbarianLevel?: string;
  naturalWonders?: boolean;
  villages?: boolean;
  startingGold?: string;
  turnLimit?: number;
  gameSpeed?: string;
  aiCivIds?: (string | null)[];
  enabledVictories?: string[];
  startedAt?: number;
  endedAt?: number;
  outcome?: SessionOutcome;
  condition?: string;
  turns?: number;
  score?: number;
  scoreRank?: number;
  scoreboard?: SessionScoreboardEntry[];
}

/** Full stored bug report row (list fields + heavy detail payload). */
export interface BugReportRow extends AdminBugReport {
  context?: import("@roc/shared").BugReportContext;
  errors?: string[];
  state?: string;
}

export interface AnalyticsStore {
  /** Create tables / prepare the store. No-op for memory. */
  init?(): Promise<void>;
  record(events: AnalyticsEvent[]): Promise<void>;
  overview(): Promise<AdminOverview>;
  sessionsPerPlayer(limit?: number): Promise<PlayerSessionStats[]>;
  civDistribution(): Promise<CivCount[]>;
  configBreakdown(): Promise<ConfigBreakdown>;
  outcomeBreakdown(): Promise<OutcomeBreakdown>;
  /** Win/loss counts grouped by the victory condition the game ended on. */
  victoryBreakdown(): Promise<VictoryTypeCount[]>;
  leaderboard(limit?: number): Promise<LeaderboardEntry[]>;
  voteTotals(): Promise<VoteTotal[]>;
  /** Bug reports, newest first (summaries — no heavy state payload). */
  bugReports(limit?: number): Promise<BugReportSummary[]>;
  /** A single bug report with its full captured payload. */
  bugReport(reportId: string): Promise<BugReportDetail | undefined>;
  listGameSessions(query: import("@roc/shared").GameSessionListQuery): Promise<import("@roc/shared").GameSessionListResponse>;
  gameSession(sessionId: string): Promise<import("@roc/shared").AdminGameSessionDetail | undefined>;
  sessionReport(filters: import("@roc/shared").GameSessionFilters): Promise<import("@roc/shared").SessionReportResponse>;
  listBugReports(query: import("@roc/shared").BugReportListQuery): Promise<import("@roc/shared").BugReportListResponse>;
}

function startOfTodayUtc(now = Date.now()): number {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export class MemoryAnalyticsStore implements AnalyticsStore {
  private readonly sessions = new Map<string, SessionRow>();
  /** key = `${clientId}:${featureId}` -> timestamp. */
  private readonly votes = new Map<string, number>();
  /** reportId -> full report payload. */
  private readonly reports = new Map<string, BugReportRow>();

  async record(events: AnalyticsEvent[]): Promise<void> {
    for (const e of events) {
      if (e.t === "session_start") {
        const row = this.sessions.get(e.sessionId) ?? { sessionId: e.sessionId, clientId: e.clientId };
        row.clientId = e.clientId;
        row.handle = e.handle;
        row.userId = e.userId;
        row.mode = e.mode;
        row.civId = e.civId;
        row.mapType = e.mapType;
        row.mapSize = e.mapSize;
        row.cols = e.cols;
        row.rows = e.rows;
        row.aiCount = e.aiCount;
        row.barbarians = e.barbarians;
        row.legends = e.legends;
        row.barbarianLevel = e.barbarianLevel;
        row.naturalWonders = e.naturalWonders;
        row.villages = e.villages;
        row.startingGold = e.startingGold;
        row.turnLimit = e.turnLimit;
        row.gameSpeed = e.gameSpeed;
        row.aiCivIds = e.aiCivIds;
        row.enabledVictories = e.enabledVictories;
        row.startedAt = e.ts;
        this.sessions.set(e.sessionId, row);
      } else if (e.t === "session_end") {
        const row = this.sessions.get(e.sessionId) ?? { sessionId: e.sessionId, clientId: e.clientId };
        row.clientId = row.clientId || e.clientId;
        if (e.handle) row.handle = e.handle;
        if (e.userId) row.userId = e.userId;
        row.outcome = e.outcome;
        row.condition = e.condition;
        row.turns = e.turns;
        row.score = e.score;
        row.scoreRank = e.scoreRank;
        if (e.scoreboard?.length) row.scoreboard = e.scoreboard;
        row.endedAt = e.ts;
        this.sessions.set(e.sessionId, row);
      } else if (e.t === "feature_vote") {
        const key = `${e.clientId}:${e.featureId}`;
        if (e.action === "add") this.votes.set(key, e.ts);
        else this.votes.delete(key);
      } else if (e.t === "bug_report") {
        if (!this.reports.has(e.reportId)) {
          const row = bugReportFromEvent(e);
          if (e.sessionId) enrichBugReportFromSession(row, this.sessions.get(e.sessionId));
          this.reports.set(e.reportId, row);
        }
      }
    }
  }

  private rows(): SessionRow[] {
    return [...this.sessions.values()];
  }

  async overview(): Promise<AdminOverview> {
    const rows = this.rows();
    const players = new Set(rows.map((r) => r.clientId));
    const ended = rows.filter((r) => r.turns !== undefined);
    const completed = rows.filter((r) => r.outcome === "win" || r.outcome === "loss");
    const abandoned = rows.filter((r) => r.outcome === "abandoned");
    const today = startOfTodayUtc();
    const avgTurns = ended.length
      ? ended.reduce((s, r) => s + (r.turns ?? 0), 0) / ended.length
      : 0;
    return {
      totalSessions: rows.length,
      uniquePlayers: players.size,
      completedSessions: completed.length,
      abandonedSessions: abandoned.length,
      avgTurns: Math.round(avgTurns * 10) / 10,
      sessionsToday: rows.filter((r) => (r.startedAt ?? r.endedAt ?? 0) >= today).length,
    };
  }

  async sessionsPerPlayer(limit = 100): Promise<PlayerSessionStats[]> {
    const rows = this.rows();
    const byClient = buildHandleByClientId(rows);
    const byUser = new Map<string, string>();
    for (const r of rows) {
      if (r.userId && r.handle?.trim()) byUser.set(r.userId, r.handle.trim());
    }
    const byPlayer = new Map<string, PlayerSessionStats & { clientId?: string; userId?: string }>();
    for (const r of rows) {
      const key = r.userId ?? r.handle ?? r.clientId;
      let s = byPlayer.get(key);
      if (!s) {
        s = {
          clientId: r.clientId,
          userId: r.userId,
          handle: resolvePlayerHandle(r, byClient, byUser),
          sessions: 0,
          wins: 0,
          losses: 0,
          abandoned: 0,
          lastPlayed: 0,
        };
        byPlayer.set(key, s);
      }
      if (r.handle) s.handle = resolvePlayerHandle(r, byClient, byUser);
      s.sessions++;
      if (r.outcome === "win") s.wins++;
      else if (r.outcome === "loss") s.losses++;
      else if (r.outcome === "abandoned") s.abandoned++;
      s.lastPlayed = Math.max(s.lastPlayed, r.endedAt ?? r.startedAt ?? 0);
    }
    return [...byPlayer.values()]
      .map(({ clientId: _c, userId: _u, ...rest }) => rest)
      .sort((a, b) => b.sessions - a.sessions)
      .slice(0, limit);
  }

  async civDistribution(): Promise<CivCount[]> {
    const counts = new Map<string, number>();
    for (const r of this.rows()) {
      if (!r.civId) continue;
      counts.set(r.civId, (counts.get(r.civId) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([civId, count]) => ({ civId, count }))
      .sort((a, b) => b.count - a.count);
  }

  async configBreakdown(): Promise<ConfigBreakdown> {
    const rows = this.rows();
    const tally = (pick: (r: SessionRow) => string | undefined): LabelCount[] => {
      const counts = new Map<string, number>();
      for (const r of rows) {
        const v = pick(r);
        if (v === undefined || v === null || v === "") continue;
        counts.set(v, (counts.get(v) ?? 0) + 1);
      }
      return [...counts.entries()]
        .map(([label, count]) => ({ label, count }))
        .sort((a, b) => b.count - a.count);
    };
    const onOff = (pick: (r: SessionRow) => boolean | undefined): { on: number; off: number } => {
      let on = 0,
        off = 0;
      for (const r of rows) {
        const v = pick(r);
        if (v === true) on++;
        else if (v === false) off++;
      }
      return { on, off };
    };
    return {
      mapTypes: tally((r) => r.mapType),
      mapSizes: tally((r) => r.mapSize),
      startingGold: tally((r) => r.startingGold),
      barbarians: tally((r) => r.barbarianLevel),
      aiCount: tally((r) => (r.aiCount === undefined ? undefined : String(r.aiCount))),
      naturalWonders: onOff((r) => r.naturalWonders),
      legends: onOff((r) => r.legends),
      villages: onOff((r) => r.villages),
      enabledVictories: (() => {
        const counts = new Map<string, number>();
        for (const r of rows) {
          for (const v of r.enabledVictories ?? []) counts.set(v, (counts.get(v) ?? 0) + 1);
        }
        return [...counts.entries()]
          .map(([label, count]) => ({ label, count }))
          .sort((a, b) => b.count - a.count);
      })(),
    };
  }

  async outcomeBreakdown(): Promise<OutcomeBreakdown> {
    const out: OutcomeBreakdown = { win: 0, loss: 0, abandoned: 0 };
    for (const r of this.rows()) {
      if (r.outcome) out[r.outcome]++;
    }
    return out;
  }

  async victoryBreakdown(): Promise<VictoryTypeCount[]> {
    const by = new Map<string, VictoryTypeCount>();
    for (const r of this.rows()) {
      if (!r.condition || (r.outcome !== "win" && r.outcome !== "loss")) continue;
      let v = by.get(r.condition);
      if (!v) by.set(r.condition, (v = { condition: r.condition, wins: 0, losses: 0 }));
      if (r.outcome === "win") v.wins++;
      else v.losses++;
    }
    return [...by.values()].sort((a, b) => b.wins + b.losses - (a.wins + a.losses));
  }

  async leaderboard(limit = 50): Promise<LeaderboardEntry[]> {
    const rows = this.rows();
    const byClient = buildHandleByClientId(rows);
    const byUser = new Map<string, string>();
    for (const r of rows) {
      if (r.userId && r.handle?.trim()) byUser.set(r.userId, r.handle.trim());
    }
    return rows
      .filter((r) => r.score !== undefined && (r.outcome === "win" || r.outcome === "loss"))
      .map((r) => ({
        handle: resolvePlayerHandle(r, byClient, byUser),
        sessionId: r.sessionId,
        civId: r.civId,
        score: r.score ?? 0,
        outcome: r.outcome as SessionOutcome,
        turns: r.turns ?? 0,
        ts: r.endedAt ?? r.startedAt ?? 0,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  async voteTotals(): Promise<VoteTotal[]> {
    const counts = new Map<string, number>();
    for (const key of this.votes.keys()) {
      const featureId = key.slice(key.indexOf(":") + 1);
      counts.set(featureId, (counts.get(featureId) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([featureId, votes]) => ({ featureId, votes }))
      .sort((a, b) => b.votes - a.votes);
  }

  async bugReports(limit = 200): Promise<BugReportSummary[]> {
    return [...this.reports.values()]
      .sort((a, b) => b.ts - a.ts)
      .slice(0, limit)
      .map(({ context: _c, errors: _e, state: _s, ...summary }) => summary);
  }

  async bugReport(reportId: string): Promise<BugReportDetail | undefined> {
    const row = this.reports.get(reportId);
    if (!row) return undefined;
    return row;
  }

  async listBugReports(query: import("@roc/shared").BugReportListQuery): Promise<import("@roc/shared").BugReportListResponse> {
    return listBugReportsFromRows(this.bugReportRows(), query);
  }

  private bugReportRows(): BugReportRow[] {
    return [...this.reports.values()];
  }

  async listGameSessions(query: import("@roc/shared").GameSessionListQuery): Promise<import("@roc/shared").GameSessionListResponse> {
    const { listGameSessionsFromRows } = await import("./game-sessions");
    return listGameSessionsFromRows(this.rows(), query);
  }

  async gameSession(sessionId: string): Promise<import("@roc/shared").AdminGameSessionDetail | undefined> {
    const { rowToAdminGameSessionDetail } = await import("./game-sessions");
    const row = this.sessions.get(sessionId);
    return row ? rowToAdminGameSessionDetail(row) : undefined;
  }

  async sessionReport(filters: import("@roc/shared").GameSessionFilters): Promise<import("@roc/shared").SessionReportResponse> {
    const { buildSessionReportResponse } = await import("./session-report");
    return buildSessionReportResponse(this.rows(), filters);
  }

  /** All session rows (for dev JSON persistence). */
  exportSessions(): SessionRow[] {
    return this.rows();
  }

  /** Restore sessions loaded from disk (skips invalid rows). */
  restoreSessions(rows: SessionRow[]): number {
    let count = 0;
    for (const row of rows) {
      if (!row.sessionId || !row.clientId) continue;
      this.sessions.set(row.sessionId, row);
      count++;
    }
    return count;
  }

  exportBugReports(): BugReportRow[] {
    return this.bugReportRows();
  }

  restoreBugReports(rows: BugReportRow[]): number {
    let count = 0;
    for (const row of rows) {
      if (!row.reportId || !row.clientId || !row.message) continue;
      this.reports.set(row.reportId, row);
      count++;
    }
    return count;
  }
}
