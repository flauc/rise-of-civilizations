// Shared helpers for the admin "games played" table: filter parsing, row mapping,
// and in-memory filter/sort used by MemoryAnalyticsStore.

import type {
  AdminGameSession,
  AdminGameSessionDetail,
  GameMode,
  GameSessionFilters,
  GameSessionListQuery,
  GameSessionListResponse,
  GameSessionSortField,
  SessionOutcome,
  SessionScoreboardEntry,
} from "@roc/shared";
import { clampFilterText, resolveSqlSortColumn } from "@roc/shared";
import type { SessionRow } from "./analytics";

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

const SORT_FIELDS: ReadonlySet<GameSessionSortField> = new Set([
  "startedAt",
  "endedAt",
  "sessionId",
  "clientId",
  "handle",
  "mode",
  "civId",
  "mapType",
  "mapSize",
  "outcome",
  "condition",
  "turns",
  "score",
  "aiCount",
  "barbarianLevel",
  "startingGold",
  "gameSpeed",
  "turnLimit",
]);

function parseBool(v: string | null): boolean | undefined {
  if (v === "true" || v === "1" || v === "on") return true;
  if (v === "false" || v === "0" || v === "off") return false;
  return undefined;
}

function parseIntOpt(v: string | null): number | undefined {
  if (v == null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : undefined;
}

function parseText(v: string | null): string | undefined {
  return clampFilterText(v?.trim() || undefined);
}

function parseMode(v: string | null): GameMode | undefined {
  return v === "sp" || v === "mp" ? v : undefined;
}

function parseOutcome(v: string | null): SessionOutcome | undefined {
  return v === "win" || v === "loss" || v === "abandoned" ? v : undefined;
}

function parseSort(v: string | null): GameSessionSortField | undefined {
  if (!v) return undefined;
  return SORT_FIELDS.has(v as GameSessionSortField) ? (v as GameSessionSortField) : undefined;
}

/** Parse filter query params shared by the games table and reporting screen. */
export function parseGameSessionFilters(params: URLSearchParams): GameSessionFilters {
  const filters: GameSessionFilters = {};
  const text = (key: keyof GameSessionFilters): void => {
    const v = parseText(params.get(String(key)));
    if (v !== undefined) (filters as Record<string, string>)[key] = v;
  };
  text("sessionId");
  text("clientId");
  text("handle");
  text("userId");
  text("q");
  text("startedAt");
  text("mode");
  text("outcome");
  text("turns");
  text("score");
  text("civId");
  text("mapType");
  text("mapSize");
  text("condition");
  text("barbarianLevel");
  text("startingGold");
  text("gameSpeed");
  text("victory");

  for (const key of ["aiCount", "cols", "rows", "turnLimit"] as const) {
    const n = parseIntOpt(params.get(key));
    if (n !== undefined) filters[key] = n;
  }

  for (const key of ["barbarians", "legends", "naturalWonders", "villages"] as const) {
    const b = parseBool(params.get(key));
    if (b !== undefined) filters[key] = b;
  }

  for (const key of ["startedFrom", "startedTo", "endedFrom", "endedTo"] as const) {
    const n = parseIntOpt(params.get(key));
    if (n !== undefined) filters[key] = n;
  }

  return filters;
}

/** Parse /admin/api/games query params into a normalized list query. */
export function parseGameSessionQuery(params: URLSearchParams): GameSessionListQuery {
  const page = Math.max(1, parseIntOpt(params.get("page")) ?? 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, parseIntOpt(params.get("pageSize")) ?? DEFAULT_PAGE_SIZE));
  const sort = parseSort(params.get("sort"));
  const order = params.get("order") === "asc" ? "asc" : "desc";

  const filters = parseGameSessionFilters(params);
  const hasFilters = Object.keys(filters).length > 0;
  return { page, pageSize, sort, order, filters: hasFilters ? filters : undefined };
}

export function rowToAdminGameSession(row: SessionRow): AdminGameSession {
  return {
    sessionId: row.sessionId,
    clientId: row.clientId,
    handle: row.handle,
    userId: row.userId,
    mode: row.mode as GameMode | undefined,
    civId: row.civId,
    mapType: row.mapType,
    mapSize: row.mapSize,
    cols: row.cols,
    rows: row.rows,
    aiCount: row.aiCount,
    barbarians: row.barbarians,
    barbarianLevel: row.barbarianLevel,
    legends: row.legends,
    naturalWonders: row.naturalWonders,
    villages: row.villages,
    startingGold: row.startingGold,
    turnLimit: row.turnLimit,
    gameSpeed: row.gameSpeed,
    aiCivIds: row.aiCivIds,
    enabledVictories: row.enabledVictories,
    outcome: row.outcome,
    condition: row.condition,
    turns: row.turns,
    score: row.score,
    scoreRank: row.scoreRank,
    startedAt: row.startedAt,
    endedAt: row.endedAt,
  };
}

/** Build a scoreboard for older sessions that predate the scoreboard field. */
function formatAiCivLabel(civ: string | null | undefined, slot: number): string {
  if (!civ) return `AI ${slot + 1} (random)`;
  return civ
    .split(/[_-]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function deriveScoreboard(row: SessionRow): SessionScoreboardEntry[] {
  if (row.scoreboard?.length) return row.scoreboard;
  const entries: SessionScoreboardEntry[] = [];
  if (row.civId || row.handle || row.score != null) {
    entries.push({
      name: row.handle?.trim() || "You",
      civId: row.civId,
      isHuman: true,
      score: row.score,
      isViewer: true,
    });
  }
  for (let i = 0; i < (row.aiCivIds?.length ?? 0); i++) {
    const civ = row.aiCivIds![i];
    entries.push({
      name: formatAiCivLabel(civ, i),
      civId: civ ?? undefined,
      isHuman: false,
    });
  }
  return entries;
}

export function rowToAdminGameSessionDetail(row: SessionRow): AdminGameSessionDetail {
  return { ...rowToAdminGameSession(row), scoreboard: deriveScoreboard(row) };
}

function sortValue(row: SessionRow, field: GameSessionSortField): string | number {
  switch (field) {
    case "startedAt":
      return row.startedAt ?? 0;
    case "endedAt":
      return row.endedAt ?? 0;
    case "sessionId":
      return row.sessionId;
    case "clientId":
      return row.clientId;
    case "handle":
      return row.handle ?? "";
    case "mode":
      return row.mode ?? "";
    case "civId":
      return row.civId ?? "";
    case "mapType":
      return row.mapType ?? "";
    case "mapSize":
      return row.mapSize ?? "";
    case "outcome":
      return row.outcome ?? "";
    case "condition":
      return row.condition ?? "";
    case "turns":
      return row.turns ?? -1;
    case "score":
      return row.score ?? -1;
    case "aiCount":
      return row.aiCount ?? -1;
    case "barbarianLevel":
      return row.barbarianLevel ?? "";
    case "startingGold":
      return row.startingGold ?? "";
    case "gameSpeed":
      return row.gameSpeed ?? "";
    case "turnLimit":
      return row.turnLimit ?? -1;
  }
}

function gameSessionSearchText(row: SessionRow): string {
  const parts = [
    row.sessionId,
    row.clientId,
    row.handle,
    row.userId,
    row.mode,
    row.civId,
    row.mapType,
    row.mapSize,
    row.outcome,
    row.condition,
    row.barbarianLevel,
    row.startingGold,
    row.gameSpeed,
    row.turns != null ? String(row.turns) : "",
    row.score != null ? String(row.score) : "",
    row.aiCount != null ? String(row.aiCount) : "",
    ...(row.aiCivIds ?? []),
    ...(row.enabledVictories ?? []),
  ];
  return parts.filter(Boolean).join(" ").toLowerCase();
}

function matchesTimestampText(ts: number | undefined, q: string): boolean {
  if (ts == null) return false;
  const hay = [String(ts), new Date(ts).toLocaleString(), new Date(ts).toISOString()].join(" ").toLowerCase();
  return hay.includes(q.toLowerCase());
}

export function matchesGameSessionFilters(row: SessionRow, f: GameSessionFilters): boolean {
  if (f.q && !gameSessionSearchText(row).includes(f.q.toLowerCase())) return false;
  if (f.startedAt && !matchesTimestampText(row.startedAt, f.startedAt)) return false;
  if (f.sessionId && !row.sessionId.toLowerCase().includes(f.sessionId.toLowerCase())) return false;
  if (f.clientId && !row.clientId.toLowerCase().includes(f.clientId.toLowerCase())) return false;
  if (f.handle && !(row.handle ?? "").toLowerCase().includes(f.handle.toLowerCase())) return false;
  if (f.userId && !(row.userId ?? "").toLowerCase().includes(f.userId.toLowerCase())) return false;
  if (f.mode && !(row.mode ?? "").toLowerCase().includes(f.mode.toLowerCase())) return false;
  if (f.civId && !(row.civId ?? "").toLowerCase().includes(f.civId.toLowerCase())) return false;
  if (f.mapType && row.mapType !== f.mapType) return false;
  if (f.mapSize && row.mapSize !== f.mapSize) return false;
  if (f.outcome && !(row.outcome ?? "").toLowerCase().includes(f.outcome.toLowerCase())) return false;
  if (f.condition && !(row.condition ?? "").toLowerCase().includes(f.condition.toLowerCase())) return false;
  if (f.barbarianLevel && row.barbarianLevel !== f.barbarianLevel) return false;
  if (f.startingGold && row.startingGold !== f.startingGold) return false;
  if (f.gameSpeed && row.gameSpeed !== f.gameSpeed) return false;
  if (f.aiCount !== undefined && row.aiCount !== f.aiCount) return false;
  if (f.cols !== undefined && row.cols !== f.cols) return false;
  if (f.rows !== undefined && row.rows !== f.rows) return false;
  if (f.turnLimit !== undefined && row.turnLimit !== f.turnLimit) return false;
  if (f.turns && !String(row.turns ?? "").includes(f.turns)) return false;
  if (f.score && !String(row.score ?? "").includes(f.score)) return false;
  if (f.barbarians !== undefined && row.barbarians !== f.barbarians) return false;
  if (f.legends !== undefined && row.legends !== f.legends) return false;
  if (f.naturalWonders !== undefined && row.naturalWonders !== f.naturalWonders) return false;
  if (f.villages !== undefined && row.villages !== f.villages) return false;
  if (f.victory && !(row.enabledVictories ?? []).includes(f.victory)) return false;
  if (f.startedFrom !== undefined && (row.startedAt ?? 0) < f.startedFrom) return false;
  if (f.startedTo !== undefined && (row.startedAt ?? 0) > f.startedTo) return false;
  if (f.endedFrom !== undefined && (row.endedAt ?? 0) < f.endedFrom) return false;
  if (f.endedTo !== undefined && (row.endedAt ?? 0) > f.endedTo) return false;
  return true;
}

export function listGameSessionsFromRows(rows: SessionRow[], query: GameSessionListQuery): GameSessionListResponse {
  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, query.pageSize ?? DEFAULT_PAGE_SIZE));
  const sort = query.sort && SORT_FIELDS.has(query.sort) ? query.sort : "startedAt";
  const order = query.order === "asc" ? 1 : -1;
  const filters = query.filters;

  let list = filters ? rows.filter((r) => matchesGameSessionFilters(r, filters)) : rows;
  list = [...list].sort((a, b) => {
    const av = sortValue(a, sort);
    const bv = sortValue(b, sort);
    if (av < bv) return -order;
    if (av > bv) return order;
    return a.sessionId.localeCompare(b.sessionId) * order;
  });

  const total = list.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const offset = (safePage - 1) * pageSize;
  const items = list.slice(offset, offset + pageSize).map(rowToAdminGameSession);

  return { items, total, page: safePage, pageSize, totalPages };
}

/** Whitelist sort field → Postgres column name (never use raw user input). */
const GAME_SESSION_SQL_SORT: Readonly<Record<GameSessionSortField, string>> = {
  startedAt: "started_at",
  endedAt: "ended_at",
  sessionId: "session_id",
  clientId: "client_id",
  handle: "handle",
  mode: "mode",
  civId: "civ_id",
  mapType: "map_type",
  mapSize: "map_size",
  outcome: "outcome",
  condition: "condition",
  turns: "turns",
  score: "score",
  aiCount: "ai_count",
  barbarianLevel: "barbarian_level",
  startingGold: "starting_gold",
  gameSpeed: "game_speed",
  turnLimit: "turn_limit",
};

export function sortFieldToSql(sort: GameSessionSortField | undefined): string {
  return resolveSqlSortColumn(sort, GAME_SESSION_SQL_SORT, "started_at");
}
