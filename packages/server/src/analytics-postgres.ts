// Durable analytics storage on Postgres via Bun's built-in SQL client. Selected
// in index.ts when DATABASE_URL is set (e.g. the Coolify Postgres container).
// Only runs under Bun — the pure MemoryAnalyticsStore covers tests/dev.

import { SQL } from "bun";
import type {
  AdminOverview,
  AnalyticsEvent,
  BugReportContext,
  BugReportDetail,
  BugReportListQuery,
  BugReportListResponse,
  BugReportSummary,
  CivCount,
  ConfigBreakdown,
  GameSessionListQuery,
  GameSessionListResponse,
  LabelCount,
  LeaderboardEntry,
  OutcomeBreakdown,
  PlayerSessionStats,
  SessionOutcome,
  VictoryTypeCount,
  VoteTotal,
} from "@roc/shared";
import type { AnalyticsStore } from "./analytics";
import type { BugReportRow, SessionRow } from "./analytics";
import { bugReportFromEvent, enrichBugReportFromSession, listBugReportsFromRows } from "./bug-reports";
import { buildHandleByClientId, resolvePlayerHandle } from "./player-handles";

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
    await sql`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS enabled_victories TEXT`;
    await sql`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS villages BOOLEAN`;
    await sql`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS turn_limit INTEGER`;
    await sql`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS game_speed TEXT`;
    await sql`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS user_id TEXT`;
    await sql`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS handle TEXT`;
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
    await sql`ALTER TABLE bug_reports ADD COLUMN IF NOT EXISTS handle TEXT`;
    await sql`ALTER TABLE bug_reports ADD COLUMN IF NOT EXISTS user_id TEXT`;
    await sql`ALTER TABLE bug_reports ADD COLUMN IF NOT EXISTS map_type TEXT`;
    await sql`ALTER TABLE bug_reports ADD COLUMN IF NOT EXISTS map_size TEXT`;
    await sql`ALTER TABLE bug_reports ADD COLUMN IF NOT EXISTS map_cols INTEGER`;
    await sql`ALTER TABLE bug_reports ADD COLUMN IF NOT EXISTS map_rows INTEGER`;
    await sql`ALTER TABLE bug_reports ADD COLUMN IF NOT EXISTS ai_count INTEGER`;
    await sql`ALTER TABLE bug_reports ADD COLUMN IF NOT EXISTS barbarians BOOLEAN`;
    await sql`ALTER TABLE bug_reports ADD COLUMN IF NOT EXISTS legends BOOLEAN`;
    await sql`ALTER TABLE bug_reports ADD COLUMN IF NOT EXISTS barbarian_level TEXT`;
    await sql`ALTER TABLE bug_reports ADD COLUMN IF NOT EXISTS natural_wonders BOOLEAN`;
    await sql`ALTER TABLE bug_reports ADD COLUMN IF NOT EXISTS villages BOOLEAN`;
    await sql`ALTER TABLE bug_reports ADD COLUMN IF NOT EXISTS starting_gold TEXT`;
    await sql`ALTER TABLE bug_reports ADD COLUMN IF NOT EXISTS turn_limit INTEGER`;
    await sql`ALTER TABLE bug_reports ADD COLUMN IF NOT EXISTS game_speed TEXT`;
    await sql`ALTER TABLE bug_reports ADD COLUMN IF NOT EXISTS ai_civ_ids TEXT`;
    await sql`ALTER TABLE bug_reports ADD COLUMN IF NOT EXISTS enabled_victories TEXT`;
    await sql`ALTER TABLE bug_reports ADD COLUMN IF NOT EXISTS outcome TEXT`;
    await sql`ALTER TABLE bug_reports ADD COLUMN IF NOT EXISTS condition TEXT`;
    await sql`ALTER TABLE bug_reports ADD COLUMN IF NOT EXISTS session_turns INTEGER`;
    await sql`ALTER TABLE bug_reports ADD COLUMN IF NOT EXISTS score INTEGER`;
    await sql`ALTER TABLE bug_reports ADD COLUMN IF NOT EXISTS score_rank INTEGER`;
    await sql`ALTER TABLE bug_reports ADD COLUMN IF NOT EXISTS started_at BIGINT`;
    await sql`ALTER TABLE bug_reports ADD COLUMN IF NOT EXISTS ended_at BIGINT`;
  }

  async record(events: AnalyticsEvent[]): Promise<void> {
    const sql = this.sql;
    for (const e of events) {
      if (e.t === "session_start") {
        const aiCivIds = e.aiCivIds ? JSON.stringify(e.aiCivIds) : null;
        const enabledVictories = e.enabledVictories ? JSON.stringify(e.enabledVictories) : null;
        await sql`
          INSERT INTO sessions (session_id, client_id, user_id, handle, mode, civ_id, map_type, map_size,
            map_cols, map_rows, ai_count, barbarians, legends, barbarian_level,
            natural_wonders, villages, starting_gold, turn_limit, game_speed,
            ai_civ_ids, enabled_victories, started_at)
          VALUES (${e.sessionId}, ${e.clientId}, ${e.userId ?? null}, ${e.handle ?? null},
            ${e.mode ?? null}, ${e.civId ?? null},
            ${e.mapType ?? null}, ${e.mapSize ?? null}, ${e.cols ?? null}, ${e.rows ?? null},
            ${e.aiCount ?? null}, ${e.barbarians ?? null}, ${e.legends ?? null},
            ${e.barbarianLevel ?? null}, ${e.naturalWonders ?? null}, ${e.villages ?? null},
            ${e.startingGold ?? null}, ${e.turnLimit ?? null}, ${e.gameSpeed ?? null},
            ${aiCivIds}, ${enabledVictories}, ${e.ts})
          ON CONFLICT (session_id) DO UPDATE SET
            client_id = EXCLUDED.client_id, user_id = EXCLUDED.user_id, handle = EXCLUDED.handle,
            mode = EXCLUDED.mode, civ_id = EXCLUDED.civ_id,
            map_type = EXCLUDED.map_type, map_size = EXCLUDED.map_size, map_cols = EXCLUDED.map_cols,
            map_rows = EXCLUDED.map_rows, ai_count = EXCLUDED.ai_count, barbarians = EXCLUDED.barbarians,
            legends = EXCLUDED.legends, barbarian_level = EXCLUDED.barbarian_level,
            natural_wonders = EXCLUDED.natural_wonders, villages = EXCLUDED.villages,
            starting_gold = EXCLUDED.starting_gold, turn_limit = EXCLUDED.turn_limit,
            game_speed = EXCLUDED.game_speed, ai_civ_ids = EXCLUDED.ai_civ_ids,
            enabled_victories = EXCLUDED.enabled_victories, started_at = EXCLUDED.started_at`;
      } else if (e.t === "session_end") {
        await sql`
          INSERT INTO sessions (session_id, client_id, user_id, handle, outcome, condition, turns, score, score_rank, ended_at)
          VALUES (${e.sessionId}, ${e.clientId}, ${e.userId ?? null}, ${e.handle ?? null}, ${e.outcome}, ${e.condition ?? null},
            ${e.turns}, ${e.score ?? null}, ${e.scoreRank ?? null}, ${e.ts})
          ON CONFLICT (session_id) DO UPDATE SET
            client_id = COALESCE(sessions.client_id, EXCLUDED.client_id),
            user_id = COALESCE(sessions.user_id, EXCLUDED.user_id),
            handle = COALESCE(sessions.handle, EXCLUDED.handle),
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
        const row = bugReportFromEvent(e);
        if (e.sessionId) {
          const [s] = await sql<Record<string, unknown>>`
            SELECT session_id, client_id, user_id, handle, mode, civ_id, map_type, map_size, map_cols, map_rows,
              ai_count, barbarians, legends, barbarian_level, natural_wonders, villages,
              starting_gold, turn_limit, game_speed, ai_civ_ids, enabled_victories,
              started_at, ended_at, outcome, condition, turns, score, score_rank
            FROM sessions WHERE session_id = ${e.sessionId} LIMIT 1`;
          if (s) enrichBugReportFromSession(row, pgRowToSessionRow(s));
        }
        const context = row.context ? JSON.stringify(row.context) : null;
        const errors = row.errors && row.errors.length ? JSON.stringify(row.errors) : null;
        const aiCivIds = row.aiCivIds ? JSON.stringify(row.aiCivIds) : null;
        const enabledVictories = row.enabledVictories ? JSON.stringify(row.enabledVictories) : null;
        await sql`
          INSERT INTO bug_reports (report_id, client_id, session_id, message, mode, turn, civ_id,
            handle, user_id, map_type, map_size, map_cols, map_rows, ai_count, barbarians, legends,
            barbarian_level, natural_wonders, villages, starting_gold, turn_limit, game_speed,
            ai_civ_ids, enabled_victories, outcome, condition, session_turns, score, score_rank,
            started_at, ended_at, context, errors, state, created_at)
          VALUES (${row.reportId}, ${row.clientId}, ${row.sessionId ?? null}, ${row.message},
            ${row.mode ?? null}, ${row.turn ?? null}, ${row.civId ?? null},
            ${row.handle ?? null}, ${row.userId ?? null}, ${row.mapType ?? null}, ${row.mapSize ?? null},
            ${row.cols ?? null}, ${row.rows ?? null}, ${row.aiCount ?? null}, ${row.barbarians ?? null},
            ${row.legends ?? null}, ${row.barbarianLevel ?? null}, ${row.naturalWonders ?? null},
            ${row.villages ?? null}, ${row.startingGold ?? null}, ${row.turnLimit ?? null},
            ${row.gameSpeed ?? null}, ${aiCivIds}, ${enabledVictories},
            ${row.outcome ?? null}, ${row.condition ?? null}, ${row.sessionTurns ?? null},
            ${row.score ?? null}, ${row.scoreRank ?? null}, ${row.startedAt ?? null}, ${row.endedAt ?? null},
            ${context}, ${errors}, ${row.state ?? null}, ${row.ts})
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
    const rows = await this.allSessionRows();
    const byClient = buildHandleByClientId(rows);
    const byUser = new Map<string, string>();
    for (const r of rows) {
      if (r.userId && r.handle?.trim()) byUser.set(r.userId, r.handle.trim());
    }
    const sql = this.sql;
    const grouped = await sql<Record<string, unknown>>`
      SELECT COALESCE(user_id::text, handle, client_id) AS player_key,
        MAX(client_id) AS client_id,
        MAX(user_id) AS user_id,
        MAX(handle) FILTER (WHERE handle IS NOT NULL AND handle <> '') AS handle,
        COUNT(*) AS sessions,
        COUNT(*) FILTER (WHERE outcome = 'win') AS wins,
        COUNT(*) FILTER (WHERE outcome = 'loss') AS losses,
        COUNT(*) FILTER (WHERE outcome = 'abandoned') AS abandoned,
        MAX(COALESCE(ended_at, started_at, 0)) AS last_played
      FROM sessions GROUP BY player_key
      ORDER BY sessions DESC LIMIT ${limit}`;
    return grouped.map((r) => ({
      handle: resolvePlayerHandle(
        {
          handle: r.handle == null ? undefined : String(r.handle),
          userId: r.user_id == null ? undefined : String(r.user_id),
          clientId: r.client_id == null ? undefined : String(r.client_id),
        },
        byClient,
        byUser,
      ),
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
    const onOff = async (col: "natural_wonders" | "legends" | "villages"): Promise<{ on: number; off: number }> => {
      const [r] =
        col === "natural_wonders"
          ? await sql<Record<string, unknown>>`SELECT COUNT(*) FILTER (WHERE natural_wonders) AS on, COUNT(*) FILTER (WHERE natural_wonders = false) AS off FROM sessions`
          : col === "legends"
            ? await sql<Record<string, unknown>>`SELECT COUNT(*) FILTER (WHERE legends) AS on, COUNT(*) FILTER (WHERE legends = false) AS off FROM sessions`
            : await sql<Record<string, unknown>>`SELECT COUNT(*) FILTER (WHERE villages) AS on, COUNT(*) FILTER (WHERE villages = false) AS off FROM sessions`;
      return { on: num(r?.on), off: num(r?.off) };
    };
    const enabledVictoriesTally = async (): Promise<LabelCount[]> => {
      // enabled_victories is a JSON text array; aggregate in JS (small data set).
      const rows = await sql<Record<string, unknown>>`SELECT enabled_victories FROM sessions WHERE enabled_victories IS NOT NULL`;
      const counts = new Map<string, number>();
      for (const r of rows) {
        const list = parseJson<string[]>(r.enabled_victories) ?? [];
        for (const v of list) counts.set(v, (counts.get(v) ?? 0) + 1);
      }
      return [...counts.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
    };
    const [mapTypes, mapSizes, startingGold, barbarians, aiCount, naturalWonders, legends, villages, enabledVictories] = await Promise.all([
      tally("map_type"), tally("map_size"), tally("starting_gold"), tally("barbarian_level"), tally("ai_count"),
      onOff("natural_wonders"), onOff("legends"), onOff("villages"), enabledVictoriesTally(),
    ]);
    return { mapTypes, mapSizes, startingGold, barbarians, aiCount, naturalWonders, legends, villages, enabledVictories };
  }

  async victoryBreakdown(): Promise<VictoryTypeCount[]> {
    const rows = await this.sql<Record<string, unknown>>`
      SELECT condition,
        COUNT(*) FILTER (WHERE outcome = 'win') AS wins,
        COUNT(*) FILTER (WHERE outcome = 'loss') AS losses
      FROM sessions
      WHERE condition IS NOT NULL AND outcome IN ('win','loss')
      GROUP BY condition ORDER BY (COUNT(*)) DESC`;
    return rows.map((r) => ({ condition: String(r.condition), wins: num(r.wins), losses: num(r.losses) }));
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
    const all = await this.allSessionRows();
    const byClient = buildHandleByClientId(all);
    const byUser = new Map<string, string>();
    for (const r of all) {
      if (r.userId && r.handle?.trim()) byUser.set(r.userId, r.handle.trim());
    }
    const rows = await this.sql<Record<string, unknown>>`
      SELECT session_id, client_id, user_id, handle, civ_id, score, outcome, turns,
        COALESCE(ended_at, started_at, 0) AS ts
      FROM sessions
      WHERE score IS NOT NULL AND outcome IN ('win','loss')
      ORDER BY score DESC LIMIT ${limit}`;
    return rows.map((r) => ({
      handle: resolvePlayerHandle(
        {
          handle: r.handle == null ? undefined : String(r.handle),
          userId: r.user_id == null ? undefined : String(r.user_id),
          clientId: String(r.client_id),
        },
        byClient,
        byUser,
      ),
      sessionId: String(r.session_id),
      civId: r.civ_id == null ? undefined : String(r.civ_id),
      score: num(r.score),
      outcome: String(r.outcome) as SessionOutcome,
      turns: num(r.turns),
      ts: num(r.ts),
    }));
  }

  /** All session rows (for admin handle backfill). */
  async exportSessionRows(): Promise<SessionRow[]> {
    return this.allSessionRows();
  }

  async voteTotals(): Promise<VoteTotal[]> {
    const rows = await this.sql<Record<string, unknown>>`
      SELECT feature_id, COUNT(*) AS votes FROM feature_votes
      GROUP BY feature_id ORDER BY votes DESC`;
    return rows.map((r) => ({ featureId: String(r.feature_id), votes: num(r.votes) }));
  }

  async bugReports(limit = 200): Promise<BugReportSummary[]> {
    const rows = await this.allBugReportRows(false);
    return rows
      .sort((a, b) => b.ts - a.ts)
      .slice(0, limit)
      .map(({ context: _c, errors: _e, state: _s, ...summary }) => summary);
  }

  async bugReport(reportId: string): Promise<BugReportDetail | undefined> {
    const [r] = await this.sql<Record<string, unknown>>`
      SELECT report_id, client_id, session_id, message, mode, turn, civ_id, created_at,
        (state IS NOT NULL) AS has_state, handle, user_id, map_type, map_size, map_cols, map_rows,
        ai_count, barbarians, legends, barbarian_level, natural_wonders, villages,
        starting_gold, turn_limit, game_speed, ai_civ_ids, enabled_victories,
        outcome, condition, session_turns, score, score_rank, started_at, ended_at,
        context, errors, state
      FROM bug_reports WHERE report_id = ${reportId} LIMIT 1`;
    if (!r) return undefined;
    return pgRowToBugReportRow(r, true);
  }

  async listBugReports(query: BugReportListQuery): Promise<BugReportListResponse> {
    const rows = await this.allBugReportRows(false);
    return listBugReportsFromRows(rows, query);
  }

  /** Load bug report rows for admin list/filter (omit heavy state unless requested). */
  private async allBugReportRows(includeHeavy: boolean): Promise<BugReportRow[]> {
    const rows = includeHeavy
      ? await this.sql<Record<string, unknown>>`
          SELECT report_id, client_id, session_id, message, mode, turn, civ_id, created_at,
            (state IS NOT NULL) AS has_state, handle, user_id, map_type, map_size, map_cols, map_rows,
            ai_count, barbarians, legends, barbarian_level, natural_wonders, villages,
            starting_gold, turn_limit, game_speed, ai_civ_ids, enabled_victories,
            outcome, condition, session_turns, score, score_rank, started_at, ended_at,
            context, errors, state
          FROM bug_reports`
      : await this.sql<Record<string, unknown>>`
          SELECT report_id, client_id, session_id, message, mode, turn, civ_id, created_at,
            (state IS NOT NULL) AS has_state, handle, user_id, map_type, map_size, map_cols, map_rows,
            ai_count, barbarians, legends, barbarian_level, natural_wonders, villages,
            starting_gold, turn_limit, game_speed, ai_civ_ids, enabled_victories,
            outcome, condition, session_turns, score, score_rank, started_at, ended_at
          FROM bug_reports`;
    return rows.map((r) => pgRowToBugReportRow(r, includeHeavy));
  }

  async listGameSessions(query: GameSessionListQuery): Promise<GameSessionListResponse> {
    const rows = await this.allSessionRows();
    const { listGameSessionsFromRows } = await import("./game-sessions");
    return listGameSessionsFromRows(rows, query);
  }

  /** Load all session rows for admin list/filter (analytics scale is modest). */
  private async allSessionRows(): Promise<SessionRow[]> {
    const rows = await this.sql<Record<string, unknown>>`
      SELECT session_id, client_id, user_id, handle, mode, civ_id, map_type, map_size, map_cols, map_rows,
        ai_count, barbarians, legends, barbarian_level, natural_wonders, villages,
        starting_gold, turn_limit, game_speed, ai_civ_ids, enabled_victories,
        started_at, ended_at, outcome, condition, turns, score, score_rank
      FROM sessions`;
    return rows.map(pgRowToSessionRow);
  }
}

function pgRowToBugReportRow(r: Record<string, unknown>, includeHeavy: boolean): BugReportRow {
  return {
    reportId: String(r.report_id),
    clientId: String(r.client_id),
    sessionId: r.session_id == null ? undefined : String(r.session_id),
    message: String(r.message ?? ""),
    ts: num(r.created_at),
    hasState: r.has_state === true || r.has_state === "t" || r.has_state === "true",
    handle: r.handle == null ? undefined : String(r.handle),
    userId: r.user_id == null ? undefined : String(r.user_id),
    mode: r.mode == null ? undefined : (String(r.mode) as import("@roc/shared").GameMode),
    turn: r.turn == null ? undefined : num(r.turn),
    civId: r.civ_id == null ? undefined : String(r.civ_id),
    mapType: r.map_type == null ? undefined : String(r.map_type),
    mapSize: r.map_size == null ? undefined : String(r.map_size),
    cols: r.map_cols == null ? undefined : num(r.map_cols),
    rows: r.map_rows == null ? undefined : num(r.map_rows),
    aiCount: r.ai_count == null ? undefined : num(r.ai_count),
    barbarians: r.barbarians == null ? undefined : r.barbarians === true || r.barbarians === "t",
    legends: r.legends == null ? undefined : r.legends === true || r.legends === "t",
    barbarianLevel: r.barbarian_level == null ? undefined : String(r.barbarian_level),
    naturalWonders: r.natural_wonders == null ? undefined : r.natural_wonders === true || r.natural_wonders === "t",
    villages: r.villages == null ? undefined : r.villages === true || r.villages === "t",
    startingGold: r.starting_gold == null ? undefined : String(r.starting_gold),
    turnLimit: r.turn_limit == null ? undefined : num(r.turn_limit),
    gameSpeed: r.game_speed == null ? undefined : String(r.game_speed),
    aiCivIds: parseJson<(string | null)[]>(r.ai_civ_ids),
    enabledVictories: parseJson<string[]>(r.enabled_victories),
    outcome: r.outcome == null ? undefined : (String(r.outcome) as import("@roc/shared").SessionOutcome),
    condition: r.condition == null ? undefined : String(r.condition),
    sessionTurns: r.session_turns == null ? undefined : num(r.session_turns),
    score: r.score == null ? undefined : num(r.score),
    scoreRank: r.score_rank == null ? undefined : num(r.score_rank),
    startedAt: r.started_at == null ? undefined : num(r.started_at),
    endedAt: r.ended_at == null ? undefined : num(r.ended_at),
    context: includeHeavy ? parseJson<BugReportContext>(r.context) : undefined,
    errors: includeHeavy ? parseJson<string[]>(r.errors) : undefined,
    state: includeHeavy && r.state != null ? String(r.state) : undefined,
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

function pgRowToSessionRow(r: Record<string, unknown>): SessionRow {
  return {
    sessionId: String(r.session_id),
    clientId: String(r.client_id),
    userId: r.user_id == null ? undefined : String(r.user_id),
    handle: r.handle == null ? undefined : String(r.handle),
    mode: r.mode == null ? undefined : String(r.mode),
    civId: r.civ_id == null ? undefined : String(r.civ_id),
    mapType: r.map_type == null ? undefined : String(r.map_type),
    mapSize: r.map_size == null ? undefined : String(r.map_size),
    cols: r.map_cols == null ? undefined : num(r.map_cols),
    rows: r.map_rows == null ? undefined : num(r.map_rows),
    aiCount: r.ai_count == null ? undefined : num(r.ai_count),
    barbarians: r.barbarians == null ? undefined : r.barbarians === true || r.barbarians === "t",
    legends: r.legends == null ? undefined : r.legends === true || r.legends === "t",
    barbarianLevel: r.barbarian_level == null ? undefined : String(r.barbarian_level),
    naturalWonders: r.natural_wonders == null ? undefined : r.natural_wonders === true || r.natural_wonders === "t",
    villages: r.villages == null ? undefined : r.villages === true || r.villages === "t",
    startingGold: r.starting_gold == null ? undefined : String(r.starting_gold),
    turnLimit: r.turn_limit == null ? undefined : num(r.turn_limit),
    gameSpeed: r.game_speed == null ? undefined : String(r.game_speed),
    aiCivIds: parseJson<(string | null)[]>(r.ai_civ_ids),
    enabledVictories: parseJson<string[]>(r.enabled_victories),
    startedAt: r.started_at == null ? undefined : num(r.started_at),
    endedAt: r.ended_at == null ? undefined : num(r.ended_at),
    outcome: r.outcome == null ? undefined : (String(r.outcome) as SessionOutcome),
    condition: r.condition == null ? undefined : String(r.condition),
    turns: r.turns == null ? undefined : num(r.turns),
    score: r.score == null ? undefined : num(r.score),
    scoreRank: r.score_rank == null ? undefined : num(r.score_rank),
  };
}

function makeSql(connectionString: string) {
  return new SQL(connectionString);
}
