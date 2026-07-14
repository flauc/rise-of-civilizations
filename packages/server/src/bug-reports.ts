// Shared helpers for the admin bug reports table: filter parsing, row mapping,
// and in-memory filter/sort used by MemoryAnalyticsStore.

import type {
  AdminBugReport,
  BugReportFilters,
  BugReportListQuery,
  BugReportListResponse,
  BugReportSortField,
  BugReportEvent,
  GameMode,
  SessionOutcome,
} from "@roc/shared";
import { clampFilterText, villagesEnabled } from "@roc/shared";
import type { BugReportRow, SessionRow } from "./analytics";

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

const SORT_FIELDS: ReadonlySet<BugReportSortField> = new Set([
  "ts",
  "reportId",
  "clientId",
  "handle",
  "sessionId",
  "mode",
  "civId",
  "mapType",
  "mapSize",
  "outcome",
  "condition",
  "turn",
  "sessionTurns",
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

function parseSort(v: string | null): BugReportSortField | undefined {
  if (!v) return undefined;
  return SORT_FIELDS.has(v as BugReportSortField) ? (v as BugReportSortField) : undefined;
}

/** Parse /admin/api/bug-reports query params into a normalized list query. */
export function parseBugReportQuery(params: URLSearchParams): BugReportListQuery {
  const page = Math.max(1, parseIntOpt(params.get("page")) ?? 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, parseIntOpt(params.get("pageSize")) ?? DEFAULT_PAGE_SIZE));
  const sort = parseSort(params.get("sort"));
  const order = params.get("order") === "asc" ? "asc" : "desc";

  const filters: BugReportFilters = {};
  const text = (key: keyof BugReportFilters): void => {
    const v = parseText(params.get(String(key)));
    if (v !== undefined) (filters as Record<string, string>)[key] = v;
  };
  text("reportId");
  text("clientId");
  text("handle");
  text("userId");
  text("sessionId");
  text("message");
  text("q");
  text("ts");
  text("mode");
  text("turn");
  text("civId");
  text("mapType");
  text("mapSize");
  text("condition");
  text("barbarianLevel");
  text("startingGold");
  text("gameSpeed");
  text("outcome");

  for (const key of ["aiCount", "cols", "rows", "turnLimit", "sessionTurns", "score"] as const) {
    const n = parseIntOpt(params.get(key));
    if (n !== undefined) filters[key] = n;
  }

  for (const key of ["barbarians", "legends", "naturalWonders", "villages", "hasState"] as const) {
    const b = parseBool(params.get(key));
    if (b !== undefined) filters[key] = b;
  }

  for (const key of ["tsFrom", "tsTo"] as const) {
    const n = parseIntOpt(params.get(key));
    if (n !== undefined) filters[key] = n;
  }

  const hasFilters = Object.keys(filters).length > 0;
  return { page, pageSize, sort, order, filters: hasFilters ? filters : undefined };
}

export function bugReportFromEvent(e: BugReportEvent): BugReportRow {
  return {
    reportId: e.reportId,
    clientId: e.clientId,
    sessionId: e.sessionId,
    message: e.message,
    ts: e.ts,
    hasState: !!e.state,
    handle: e.handle,
    userId: e.userId,
    mode: e.mode,
    turn: e.turn,
    civId: e.civId,
    mapType: e.mapType,
    mapSize: e.mapSize,
    cols: e.cols,
    rows: e.rows,
    aiCount: e.aiCount,
    barbarians: e.barbarians,
    legends: e.legends,
    barbarianLevel: e.barbarianLevel,
    naturalWonders: e.naturalWonders,
    villages: villagesEnabled(e.villages),
    startingGold: e.startingGold,
    turnLimit: e.turnLimit,
    gameSpeed: e.gameSpeed,
    aiCivIds: e.aiCivIds,
    enabledVictories: e.enabledVictories,
    context: e.context,
    errors: e.errors,
    state: e.state,
  };
}

/** Fill missing report fields from the linked analytics session row. */
export function enrichBugReportFromSession(row: BugReportRow, session?: SessionRow): void {
  if (!session) return;
  row.handle ??= session.handle;
  row.userId ??= session.userId;
  row.mode ??= session.mode as GameMode | undefined;
  row.civId ??= session.civId;
  row.mapType ??= session.mapType;
  row.mapSize ??= session.mapSize;
  row.cols ??= session.cols;
  row.rows ??= session.rows;
  row.aiCount ??= session.aiCount;
  row.barbarians ??= session.barbarians;
  row.legends ??= session.legends;
  row.barbarianLevel ??= session.barbarianLevel;
  row.naturalWonders ??= session.naturalWonders;
  row.villages ??= session.villages;
  row.startingGold ??= session.startingGold;
  row.turnLimit ??= session.turnLimit;
  row.gameSpeed ??= session.gameSpeed;
  row.aiCivIds ??= session.aiCivIds;
  row.enabledVictories ??= session.enabledVictories;
  row.outcome ??= session.outcome;
  row.condition ??= session.condition;
  row.sessionTurns ??= session.turns;
  row.score ??= session.score;
  row.scoreRank ??= session.scoreRank;
  row.startedAt ??= session.startedAt;
  row.endedAt ??= session.endedAt;
}

export function rowToAdminBugReport(row: BugReportRow): AdminBugReport {
  const { context: _c, errors: _e, state: _s, ...summary } = row;
  return summary;
}

function sortValue(row: BugReportRow, field: BugReportSortField): string | number {
  switch (field) {
    case "ts":
      return row.ts ?? 0;
    case "reportId":
      return row.reportId;
    case "clientId":
      return row.clientId;
    case "handle":
      return row.handle ?? "";
    case "sessionId":
      return row.sessionId ?? "";
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
    case "turn":
      return row.turn ?? -1;
    case "sessionTurns":
      return row.sessionTurns ?? -1;
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

function bugReportSearchText(row: BugReportRow): string {
  const parts = [
    row.reportId,
    row.clientId,
    row.handle,
    row.userId,
    row.sessionId,
    row.message,
    row.mode,
    row.civId,
    row.mapType,
    row.mapSize,
    row.outcome,
    row.condition,
    row.barbarianLevel,
    row.startingGold,
    row.gameSpeed,
    row.turn != null ? String(row.turn) : "",
    row.sessionTurns != null ? String(row.sessionTurns) : "",
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

export function matchesBugReportFilters(row: BugReportRow, f: BugReportFilters): boolean {
  if (f.q && !bugReportSearchText(row).includes(f.q.toLowerCase())) return false;
  if (f.ts && !matchesTimestampText(row.ts, f.ts)) return false;
  if (f.reportId && !row.reportId.toLowerCase().includes(f.reportId.toLowerCase())) return false;
  if (f.clientId && !row.clientId.toLowerCase().includes(f.clientId.toLowerCase())) return false;
  if (f.handle && !(row.handle ?? "").toLowerCase().includes(f.handle.toLowerCase())) return false;
  if (f.userId && !(row.userId ?? "").toLowerCase().includes(f.userId.toLowerCase())) return false;
  if (f.sessionId && !(row.sessionId ?? "").toLowerCase().includes(f.sessionId.toLowerCase())) return false;
  if (f.message && !row.message.toLowerCase().includes(f.message.toLowerCase())) return false;
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
  if (f.turn && !String(row.turn ?? "").includes(f.turn)) return false;
  if (f.sessionTurns !== undefined && row.sessionTurns !== f.sessionTurns) return false;
  if (f.score !== undefined && row.score !== f.score) return false;
  if (f.barbarians !== undefined && row.barbarians !== f.barbarians) return false;
  if (f.legends !== undefined && row.legends !== f.legends) return false;
  if (f.naturalWonders !== undefined && row.naturalWonders !== f.naturalWonders) return false;
  if (f.villages !== undefined && row.villages !== f.villages) return false;
  if (f.hasState !== undefined && row.hasState !== f.hasState) return false;
  if (f.tsFrom !== undefined && row.ts < f.tsFrom) return false;
  if (f.tsTo !== undefined && row.ts > f.tsTo) return false;
  return true;
}

export function listBugReportsFromRows(rows: BugReportRow[], query: BugReportListQuery): BugReportListResponse {
  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, query.pageSize ?? DEFAULT_PAGE_SIZE));
  const sort = query.sort && SORT_FIELDS.has(query.sort) ? query.sort : "ts";
  const order = query.order === "asc" ? 1 : -1;
  const filters = query.filters;

  let list = filters ? rows.filter((r) => matchesBugReportFilters(r, filters)) : rows;
  list = [...list].sort((a, b) => {
    const av = sortValue(a, sort);
    const bv = sortValue(b, sort);
    if (av < bv) return -order;
    if (av > bv) return order;
    return a.reportId.localeCompare(b.reportId) * order;
  });

  const total = list.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const offset = (safePage - 1) * pageSize;
  const items = list.slice(offset, offset + pageSize).map(rowToAdminBugReport);

  return { items, total, page: safePage, pageSize, totalPages };
}
