// Durable analytics storage on Postgres via Bun's built-in SQL client. Selected
// in index.ts when DATABASE_URL is set (e.g. the Coolify Postgres container).
// Only runs under Bun — the pure MemoryAnalyticsStore covers tests/dev.

import { SQL } from "bun";
import type {
  AdminOverview,
  AnalyticsEvent,
  BugReportContext,
  BugReportDetail,
  BugReportSummary,
  CivCount,
  ConfigBreakdown,
  LabelCount,
  LeaderboardEntry,
  OutcomeBreakdown,
  PlayerSessionStats,
  SessionOutcome,
  VoteTotal,
} from "@roc/shared";
import type { AnalyticsStore } from "./analytics";

function num(v: unknown): number {
  const n = typeof v === "string" ? Number(v) : (v as number);
  return Number.isFinite(n) ? n : 0;
}

export class PostgresAnalyticsStore implements AnalyticsStore {
  private readonly sql: ReturnType<typeof makeSql>;

  constructor(connectionString = process.env.DATABASE_URL ?? "") {
    this.sql = makeSql(connectionString);
  }

  async init(): Promise<void> {
    const sql = this.sql;
    await sql`
      CREATE TABLE IF NOT EXISTS sessions (
        session_id  TEXT PRIMARY KEY,
        client_id   TEXT NOT NULL,
        mode        TEXT,
        civ_id      TEXT,
        map_type    TEXT,
        map_size    TEXT,
        map_cols    INTEGER,
        map_rows    INTEGER,
        ai_count    INTEGER,
        barbarians  BOOLEAN,
        legends     BOOLEAN,
        started_at  BIGINT,
        ended_at    BIGINT,
        outcome     TEXT,
        condition   TEXT,
        turns       INTEGER,
        score       INTEGER,
        score_rank  INTEGER
      )`;
    // Game-setup columns (added later; ADD COLUMN IF NOT EXISTS makes init idempotent
    // and migrates an already-created table).
    await sql`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS barbarian_level TEXT`;
    await sql`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS natural_wonders BOOLEAN`;
    await sql`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS starting_gold TEXT`;
    await sql`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS ai_civ_ids TEXT`;
    await sql`CREATE INDEX IF NOT EXISTS sessions_client_id_idx ON sessions (client_id)`;
    await sql`CREATE INDEX IF NOT EXISTS sessions_outcome_idx ON sessions (outcome)`;
    await sql`CREATE INDEX IF NOT EXISTS sessions_civ_id_idx ON sessions (civ_id)`;
    await sql`
      CREATE TABLE IF NOT EXISTS feature_votes (
        client_id   TEXT NOT NULL,
        feature_id  TEXT NOT NULL,
        created_at  BIGINT,
        PRIMARY KEY (client_id, feature_id)
      )`;
    await sql`
      CREATE TABLE IF NOT EXISTS bug_reports (
        report_id   TEXT PRIMARY KEY,
        client_id   TEXT NOT NULL,
        session_id  TEXT,
        message     TEXT NOT NULL,
        mode        TEXT,
        turn        INTEGER,
        civ_id      TEXT,
        context     TEXT,
        errors      TEXT,
        state       TEXT,
        created_at  BIGINT
      )`;
    await sql`CREATE INDEX IF NOT EXISTS bug_reports_created_idx ON bug_reports (created_at DESC)`;
  }

  async record(events: AnalyticsEvent[]): Promise<void> {
    const sql = this.sql;
    for (const e of events) {
      if (e.t === "session_start") {
        const aiCivIds = e.aiCivIds ? JSON.stringify(e.aiCivIds) : null;
        await sql`
          INSERT INTO sessions (session_id, client_id, mode, civ_id, map_type, map_size,
            map_cols, map_rows, ai_count, barbarians, legends, barbarian_level,
            natural_wonders, starting_gold, ai_civ_ids, started_at)
          VALUES (${e.sessionId}, ${e.clientId}, ${e.mode ?? null}, ${e.civId ?? null},
            ${e.mapType ?? null}, ${e.mapSize ?? null}, ${e.cols ?? null}, ${e.rows ?? null},
            ${e.aiCount ?? null}, ${e.barbarians ?? null}, ${e.legends ?? null},
            ${e.barbarianLevel ?? null}, ${e.naturalWonders ?? null}, ${e.startingGold ?? null},
            ${aiCivIds}, ${e.ts})
          ON CONFLICT (session_id) DO UPDATE SET
            client_id = EXCLUDED.client_id, mode = EXCLUDED.mode, civ_id = EXCLUDED.civ_id,
            map_type = EXCLUDED.map_type, map_size = EXCLUDED.map_size, map_cols = EXCLUDED.map_cols,
            map_rows = EXCLUDED.map_rows, ai_count = EXCLUDED.ai_count, barbarians = EXCLUDED.barbarians,
            legends = EXCLUDED.legends, barbarian_level = EXCLUDED.barbarian_level,
            natural_wonders = EXCLUDED.natural_wonders, starting_gold = EXCLUDED.starting_gold,
            ai_civ_ids = EXCLUDED.ai_civ_ids, started_at = EXCLUDED.started_at`;
      } else if (e.t === "session_end") {
        await sql`
          INSERT INTO sessions (session_id, client_id, outcome, condition, turns, score, score_rank, ended_at)
          VALUES (${e.sessionId}, ${e.clientId}, ${e.outcome}, ${e.condition ?? null},
            ${e.turns}, ${e.score ?? null}, ${e.scoreRank ?? null}, ${e.ts})
          ON CONFLICT (session_id) DO UPDATE SET
            client_id = COALESCE(sessions.client_id, EXCLUDED.client_id),
            outcome = EXCLUDED.outcome, condition = EXCLUDED.condition, turns = EXCLUDED.turns,
            score = EXCLUDED.score, score_rank = EXCLUDED.score_rank, ended_at = EXCLUDED.ended_at`;
      } else if (e.t === "feature_vote") {
        if (e.action === "add") {
          await sql`
            INSERT INTO feature_votes (client_id, feature_id, created_at)
            VALUES (${e.clientId}, ${e.featureId}, ${e.ts})
            ON CONFLICT (client_id, feature_id) DO UPDATE SET created_at = EXCLUDED.created_at`;
        } else {
          await sql`DELETE FROM feature_votes WHERE client_id = ${e.clientId} AND feature_id = ${e.featureId}`;
        }
      } else if (e.t === "bug_report") {
        const context = e.context ? JSON.stringify(e.context) : null;
        const errors = e.errors && e.errors.length ? JSON.stringify(e.errors) : null;
        await sql`
          INSERT INTO bug_reports (report_id, client_id, session_id, message, mode, turn,
            civ_id, context, errors, state, created_at)
          VALUES (${e.reportId}, ${e.clientId}, ${e.sessionId ?? null}, ${e.message},
            ${e.mode ?? null}, ${e.turn ?? null}, ${e.civId ?? null}, ${context}, ${errors},
            ${e.state ?? null}, ${e.ts})
          ON CONFLICT (report_id) DO NOTHING`;
      }
    }
  }

  async overview(): Promise<AdminOverview> {
    const sql = this.sql;
    const startOfTodayUtc = Date.UTC(
      new Date().getUTCFullYear(),
      new Date().getUTCMonth(),
      new Date().getUTCDate(),
    );
    const [r] = await sql<Record<string, unknown>>`
      SELECT
        COUNT(*) AS total,
        COUNT(DISTINCT client_id) AS players,
        COUNT(*) FILTER (WHERE outcome IN ('win','loss')) AS completed,
        COUNT(*) FILTER (WHERE outcome = 'abandoned') AS abandoned,
        COALESCE(AVG(turns) FILTER (WHERE turns IS NOT NULL), 0) AS avg_turns,
        COUNT(*) FILTER (WHERE COALESCE(started_at, ended_at, 0) >= ${startOfTodayUtc}) AS today
      FROM sessions`;
    return {
      totalSessions: num(r?.total),
      uniquePlayers: num(r?.players),
      completedSessions: num(r?.completed),
      abandonedSessions: num(r?.abandoned),
      avgTurns: Math.round(num(r?.avg_turns) * 10) / 10,
      sessionsToday: num(r?.today),
    };
  }

  async sessionsPerPlayer(limit = 100): Promise<PlayerSessionStats[]> {
    const rows = await this.sql<Record<string, unknown>>`
      SELECT client_id,
        COUNT(*) AS sessions,
        COUNT(*) FILTER (WHERE outcome = 'win') AS wins,
        COUNT(*) FILTER (WHERE outcome = 'loss') AS losses,
        COUNT(*) FILTER (WHERE outcome = 'abandoned') AS abandoned,
        MAX(COALESCE(ended_at, started_at, 0)) AS last_played
      FROM sessions GROUP BY client_id
      ORDER BY sessions DESC LIMIT ${limit}`;
    return rows.map((r) => ({
      clientId: String(r.client_id),
      sessions: num(r.sessions),
      wins: num(r.wins),
      losses: num(r.losses),
      abandoned: num(r.abandoned),
      lastPlayed: num(r.last_played),
    }));
  }

  async civDistribution(): Promise<CivCount[]> {
    const rows = await this.sql<Record<string, unknown>>`
      SELECT civ_id, COUNT(*) AS count FROM sessions
      WHERE civ_id IS NOT NULL GROUP BY civ_id ORDER BY count DESC`;
    return rows.map((r) => ({ civId: String(r.civ_id), count: num(r.count) }));
  }

  async configBreakdown(): Promise<ConfigBreakdown> {
    const sql = this.sql;
    // One labelled GROUP BY per dimension. Column names are hardcoded (never user
    // input), so inlining them in the template is safe.
    const tally = async (expr: "map_type" | "map_size" | "starting_gold" | "barbarian_level" | "ai_count"): Promise<LabelCount[]> => {
      let rows: Record<string, unknown>[];
      switch (expr) {
        case "map_type": rows = await sql<Record<string, unknown>>`SELECT map_type::text AS label, COUNT(*) AS count FROM sessions WHERE map_type IS NOT NULL GROUP BY map_type ORDER BY count DESC`; break;
        case "map_size": rows = await sql<Record<string, unknown>>`SELECT map_size::text AS label, COUNT(*) AS count FROM sessions WHERE map_size IS NOT NULL GROUP BY map_size ORDER BY count DESC`; break;
        case "starting_gold": rows = await sql<Record<string, unknown>>`SELECT starting_gold::text AS label, COUNT(*) AS count FROM sessions WHERE starting_gold IS NOT NULL GROUP BY starting_gold ORDER BY count DESC`; break;
        case "barbarian_level": rows = await sql<Record<string, unknown>>`SELECT barbarian_level::text AS label, COUNT(*) AS count FROM sessions WHERE barbarian_level IS NOT NULL GROUP BY barbarian_level ORDER BY count DESC`; break;
        case "ai_count": rows = await sql<Record<string, unknown>>`SELECT ai_count::text AS label, COUNT(*) AS count FROM sessions WHERE ai_count IS NOT NULL GROUP BY ai_count ORDER BY count DESC`; break;
      }
      return rows.map((r) => ({ label: String(r.label), count: num(r.count) }));
    };
    const onOff = async (col: "natural_wonders" | "legends"): Promise<{ on: number; off: number }> => {
      const [r] = col === "natural_wonders"
        ? await sql<Record<string, unknown>>`SELECT COUNT(*) FILTER (WHERE natural_wonders) AS on, COUNT(*) FILTER (WHERE natural_wonders = false) AS off FROM sessions`
        : await sql<Record<string, unknown>>`SELECT COUNT(*) FILTER (WHERE legends) AS on, COUNT(*) FILTER (WHERE legends = false) AS off FROM sessions`;
      return { on: num(r?.on), off: num(r?.off) };
    };
    const [mapTypes, mapSizes, startingGold, barbarians, aiCount, naturalWonders, legends] = await Promise.all([
      tally("map_type"), tally("map_size"), tally("starting_gold"), tally("barbarian_level"), tally("ai_count"),
      onOff("natural_wonders"), onOff("legends"),
    ]);
    return { mapTypes, mapSizes, startingGold, barbarians, aiCount, naturalWonders, legends };
  }

  async outcomeBreakdown(): Promise<OutcomeBreakdown> {
    const rows = await this.sql<Record<string, unknown>>`
      SELECT outcome, COUNT(*) AS count FROM sessions
      WHERE outcome IS NOT NULL GROUP BY outcome`;
    const out: OutcomeBreakdown = { win: 0, loss: 0, abandoned: 0 };
    for (const r of rows) {
      const o = String(r.outcome) as keyof OutcomeBreakdown;
      if (o in out) out[o] = num(r.count);
    }
    return out;
  }

  async leaderboard(limit = 50): Promise<LeaderboardEntry[]> {
    const rows = await this.sql<Record<string, unknown>>`
      SELECT session_id, client_id, civ_id, score, outcome, turns,
        COALESCE(ended_at, started_at, 0) AS ts
      FROM sessions
      WHERE score IS NOT NULL AND outcome IN ('win','loss')
      ORDER BY score DESC LIMIT ${limit}`;
    return rows.map((r) => ({
      clientId: String(r.client_id),
      sessionId: String(r.session_id),
      civId: r.civ_id == null ? undefined : String(r.civ_id),
      score: num(r.score),
      outcome: String(r.outcome) as SessionOutcome,
      turns: num(r.turns),
      ts: num(r.ts),
    }));
  }

  async voteTotals(): Promise<VoteTotal[]> {
    const rows = await this.sql<Record<string, unknown>>`
      SELECT feature_id, COUNT(*) AS votes FROM feature_votes
      GROUP BY feature_id ORDER BY votes DESC`;
    return rows.map((r) => ({ featureId: String(r.feature_id), votes: num(r.votes) }));
  }

  async bugReports(limit = 200): Promise<BugReportSummary[]> {
    // Omit the heavy `state`/`context`/`errors` columns from the list; surface
    // only whether a snapshot exists. The detail endpoint fetches the full row.
    const rows = await this.sql<Record<string, unknown>>`
      SELECT report_id, client_id, session_id, message, mode, turn, civ_id, created_at,
        (state IS NOT NULL) AS has_state
      FROM bug_reports ORDER BY created_at DESC LIMIT ${limit}`;
    return rows.map(summaryFromRow);
  }

  async bugReport(reportId: string): Promise<BugReportDetail | undefined> {
    const [r] = await this.sql<Record<string, unknown>>`
      SELECT report_id, client_id, session_id, message, mode, turn, civ_id, created_at,
        (state IS NOT NULL) AS has_state, context, errors, state
      FROM bug_reports WHERE report_id = ${reportId} LIMIT 1`;
    if (!r) return undefined;
    return {
      ...summaryFromRow(r),
      context: parseJson<BugReportContext>(r.context),
      errors: parseJson<string[]>(r.errors),
      state: r.state == null ? undefined : String(r.state),
    };
  }
}

function summaryFromRow(r: Record<string, unknown>): BugReportSummary {
  return {
    reportId: String(r.report_id),
    clientId: String(r.client_id),
    sessionId: r.session_id == null ? undefined : String(r.session_id),
    message: String(r.message ?? ""),
    mode: r.mode == null ? undefined : String(r.mode),
    turn: r.turn == null ? undefined : num(r.turn),
    civId: r.civ_id == null ? undefined : String(r.civ_id),
    ts: num(r.created_at),
    hasState: r.has_state === true || r.has_state === "t" || r.has_state === "true",
  };
}

function parseJson<T>(v: unknown): T | undefined {
  if (v == null) return undefined;
  try {
    return JSON.parse(String(v)) as T;
  } catch {
    return undefined;
  }
}

function makeSql(connectionString: string) {
  return new SQL(connectionString);
}
