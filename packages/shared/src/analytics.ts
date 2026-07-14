// Analytics event schema, shared by the game client (producer), the server
// (ingestion + storage) and the admin app (read model). Pure types only — no
// DOM/Node — so every package can import it without pulling in a runtime.
//
// Privacy: events carry an anonymous, client-generated `clientId` (a random UUID
// kept in the browser). No personal data is collected. Analytics are best-effort
// and offline-first: the game never depends on them being delivered.

/** Bump when the event shape changes in a non-backward-compatible way. */
export const ANALYTICS_SCHEMA_VERSION = 1;

export type GameMode = "sp" | "mp";
export type SessionOutcome = "win" | "loss" | "abandoned";
export type VoteAction = "add" | "remove";

/** A game session began (single-player or multiplayer). */
/** Tribal village setting a player chose: a density level, or a legacy on/off boolean. */
export type VillageSetting = boolean | "none" | "medium" | "high";

/** Reduce a village setting to on/off for boolean storage and the admin on/off buckets. */
export function villagesEnabled(v: VillageSetting | undefined): boolean | undefined {
  if (v === undefined) return undefined;
  return v !== false && v !== "none";
}

export interface SessionStartEvent {
  t: "session_start";
  sessionId: string;
  clientId: string;
  /** Registered account username, when the player was logged in at session start. */
  handle?: string;
  /** Registered account id, when logged in. */
  userId?: string;
  mode: GameMode;
  /** The human player's civilization id (e.g. "rome"); omitted if unknown. */
  civId?: string;
  /** Landmass layout, e.g. "continents" / "realworld". */
  mapType?: string;
  /** Named map size, e.g. "small" / "medium" (when derivable). */
  mapSize?: string;
  cols?: number;
  rows?: number;
  aiCount?: number;
  /** Whether barbarians are present (true unless the level is "none"). */
  barbarians?: boolean;
  legends?: boolean;
  // --- the rest of the game-setup the player chose (only known at setup time,
  // not derivable from the running state) ---
  /** Barbarian activity level, e.g. "none"/"low"/"normal"/"high". */
  barbarianLevel?: string;
  /** Whether natural wonders were scattered on the map. */
  naturalWonders?: boolean;
  /** Tribal village density the player chose (legacy boolean: on = medium, off = none). */
  villages?: VillageSetting;
  /** Starting treasury preset, e.g. "tight"/"balanced"/"generous". */
  startingGold?: string;
  /** Turn at which the score victory triggers; 0 = unlimited. */
  turnLimit?: number;
  /** How costly research and civics are, e.g. "fast"/"normal"/"slow"/"epic". */
  gameSpeed?: string;
  /** Chosen civ per AI opponent (null = random). */
  aiCivIds?: (string | null)[];
  /** Decisive win conditions enabled this game (e.g. ["domination","science"]). */
  enabledVictories?: string[];
  /** Epoch millis on the client when the session started. */
  ts: number;
}

/** One row in the end-of-game scoreboard (human or AI). */
export interface SessionScoreboardEntry {
  /** In-game civ name at end of session. */
  name: string;
  civId?: string;
  isHuman: boolean;
  isBarbarian?: boolean;
  score?: number;
  /** True for the account that recorded this analytics session. */
  isViewer?: boolean;
  /** Rich end-of-game snapshot (absent on legacy sessions). */
  cities?: number;
  cityNames?: string[];
  gold?: number;
  population?: number;
  /** Researched technology display names. */
  techs?: string[];
  /** Tech display name in progress at session end, if any. */
  researching?: string;
  government?: string;
  civics?: string[];
  wonders?: string[];
  /** Active legend display names on the map at session end. */
  legends?: string[];
  legendsRecruited?: number;
  /** Natural wonders this civ was first to discover. */
  naturalWonders?: string[];
  /** Great People recruited over the game (including activated). */
  greatPeopleRecruited?: string[];
  greatPeople?: string[];
  faith?: number;
  religion?: string;
  battlesWon?: number;
  citiesCaptured?: number;
  eliminated?: boolean;
  units?: number;
  militaryUnits?: number;
}

/** A game session ended — win, loss, or abandoned (left before resolution). */
export interface SessionEndEvent {
  t: "session_end";
  sessionId: string;
  clientId: string;
  outcome: SessionOutcome;
  /** Victory/defeat condition (e.g. "domination", "score"), when known. */
  condition?: string;
  /** Turns played when the session ended. */
  turns: number;
  /** Final score of the viewing player (for the leaderboard). */
  score?: number;
  /** 1-based rank of the viewing player among all players by score. */
  scoreRank?: number;
  /** Final standings when the game ended cleanly (all civs + scores). */
  scoreboard?: SessionScoreboardEntry[];
  /** Registered account username, when logged in at session end. */
  handle?: string;
  /** Registered account id, when logged in at session end. */
  userId?: string;
  ts: number;
}

/** The player toggled a vote on a planned roadmap feature. */
export interface FeatureVoteEvent {
  t: "feature_vote";
  clientId: string;
  featureId: string;
  action: VoteAction;
  ts: number;
}

/** Browser/environment context captured alongside a bug report. */
export interface BugReportContext {
  userAgent?: string;
  url?: string;
  language?: string;
  /** Inner viewport, e.g. "1280x720". */
  viewport?: string;
  /** Physical screen size, e.g. "1920x1080". */
  screen?: string;
  devicePixelRatio?: number;
  online?: boolean;
  /** Vite build mode at send time ("production" / "development"). */
  buildMode?: string;
}

/**
 * The player filed a bug report from the in-game menu. Carries the free-text
 * description plus a best-effort snapshot of the game so it can be reproduced:
 * the full serialized state (`state`), recent client-side errors, and browser
 * context. Reports are immutable and identified by `reportId`.
 */
export interface BugReportEvent {
  t: "bug_report";
  reportId: string;
  clientId: string;
  /** The active game session, when one is running. */
  sessionId?: string;
  /** Registered account username, when logged in. */
  handle?: string;
  /** Registered account id, when logged in. */
  userId?: string;
  /** What the player wrote. */
  message: string;
  mode?: GameMode;
  /** Turn number at capture time. */
  turn?: number;
  /** The viewing player's civilization id. */
  civId?: string;
  /** Game setup at report time (mirrors session_start when a game is running). */
  mapType?: string;
  mapSize?: string;
  cols?: number;
  rows?: number;
  aiCount?: number;
  barbarians?: boolean;
  legends?: boolean;
  barbarianLevel?: string;
  naturalWonders?: boolean;
  villages?: VillageSetting;
  startingGold?: string;
  turnLimit?: number;
  gameSpeed?: string;
  aiCivIds?: (string | null)[];
  enabledVictories?: string[];
  /** Recent client error messages (window errors / console.error), newest last. */
  errors?: string[];
  context?: BugReportContext;
  /** Full serialized game-state JSON (best-effort; absent if capture failed). */
  state?: string;
  ts: number;
}

export type AnalyticsEvent = SessionStartEvent | SessionEndEvent | FeatureVoteEvent | BugReportEvent;

/** The POST body the client sends to the server's ingestion endpoint. */
export interface AnalyticsBatch {
  /** ANALYTICS_SCHEMA_VERSION at send time. */
  v: number;
  events: AnalyticsEvent[];
}

// ---- admin read model ----------------------------------------------------
// The shapes the admin API returns, shared so the dashboard stays in sync.

export interface AdminOverview {
  totalSessions: number;
  uniquePlayers: number;
  /** Sessions that reached a win/loss outcome. */
  completedSessions: number;
  abandonedSessions: number;
  avgTurns: number;
  sessionsToday: number;
}

export interface PlayerSessionStats {
  /** Registered username when known; guests have no handle. */
  handle?: string;
  sessions: number;
  wins: number;
  losses: number;
  abandoned: number;
  lastPlayed: number;
}

export interface CivCount {
  civId: string;
  count: number;
}

export interface OutcomeBreakdown {
  win: number;
  loss: number;
  abandoned: number;
}

/** Win/loss tally for a single victory condition (e.g. "domination", "science"). */
export interface VictoryTypeCount {
  /** The victory/defeat condition, e.g. "domination" / "score" / "religious". */
  condition: string;
  /** Sessions the viewing player WON via this condition. */
  wins: number;
  /** Sessions that ended on this condition where the viewer lost. */
  losses: number;
}

export interface LeaderboardEntry {
  /** Registered username when known. */
  handle?: string;
  sessionId: string;
  civId?: string;
  score: number;
  outcome: SessionOutcome;
  turns: number;
  ts: number;
}

export interface VoteTotal {
  featureId: string;
  votes: number;
}

/** A bug report row in the admin list (no heavy `state` payload). */
export interface AdminBugReport {
  reportId: string;
  clientId: string;
  sessionId?: string;
  message: string;
  ts: number;
  /** Whether a full state snapshot was captured (fetch the detail to get it). */
  hasState: boolean;
  /** Registered username when the reporter was logged in. */
  handle?: string;
  userId?: string;
  mode?: GameMode;
  turn?: number;
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
  /** Linked session outcome, when known at report time. */
  outcome?: SessionOutcome;
  condition?: string;
  /** Total turns recorded on the linked session (may differ from `turn` at report). */
  sessionTurns?: number;
  score?: number;
  scoreRank?: number;
  startedAt?: number;
  endedAt?: number;
}

/** @deprecated Use AdminBugReport — kept for older admin payloads. */
export interface BugReportSummary {
  reportId: string;
  clientId: string;
  sessionId?: string;
  message: string;
  mode?: string;
  turn?: number;
  civId?: string;
  ts: number;
  hasState: boolean;
}

/** A bug report with its full captured payload, for the admin detail view. */
export interface BugReportDetail extends AdminBugReport {
  context?: BugReportContext;
  errors?: string[];
  state?: string;
}

/** A label→count tally, used for the config distributions below. */
export interface LabelCount {
  label: string;
  count: number;
}

/** A registered game account as shown in the admin dashboard (bcrypt hash only). */
export interface AdminRegisteredUser {
  id: string;
  handle: string;
  createdAt: number;
  email?: string;
  newsletterOptIn?: boolean;
}

/** Distribution of the game-setup choices players made. */
export interface ConfigBreakdown {
  mapTypes: LabelCount[];
  mapSizes: LabelCount[];
  startingGold: LabelCount[];
  barbarians: LabelCount[];
  aiCount: LabelCount[];
  naturalWonders: { on: number; off: number };
  legends: { on: number; off: number };
  villages: { on: number; off: number };
  /** How often each decisive victory was enabled (multi-select per session). */
  enabledVictories: LabelCount[];
}

/** One played game session as shown in the admin games table. */
export interface AdminGameSession {
  sessionId: string;
  clientId: string;
  /** Registered username when the player was logged in; omitted for guests. */
  handle?: string;
  userId?: string;
  mode?: GameMode;
  civId?: string;
  mapType?: string;
  mapSize?: string;
  cols?: number;
  rows?: number;
  aiCount?: number;
  barbarians?: boolean;
  barbarianLevel?: string;
  legends?: boolean;
  naturalWonders?: boolean;
  villages?: boolean;
  startingGold?: string;
  turnLimit?: number;
  gameSpeed?: string;
  aiCivIds?: (string | null)[];
  enabledVictories?: string[];
  outcome?: SessionOutcome;
  condition?: string;
  turns?: number;
  score?: number;
  scoreRank?: number;
  startedAt?: number;
  endedAt?: number;
}

/** Full detail for a single played game (admin drill-down). */
export interface AdminGameSessionDetail extends AdminGameSession {
  /** Final standings; derived from setup when older sessions lack a stored board. */
  scoreboard: SessionScoreboardEntry[];
}

/** Optional column filters for the admin games table (server-side). */
export interface GameSessionFilters {
  /** Free-text search across visible session fields. */
  q?: string;
  /** Partial match on session start time (timestamp / locale date). */
  startedAt?: string;
  sessionId?: string;
  clientId?: string;
  handle?: string;
  userId?: string;
  mode?: string;
  civId?: string;
  mapType?: string;
  mapSize?: string;
  outcome?: string;
  condition?: string;
  barbarianLevel?: string;
  startingGold?: string;
  gameSpeed?: string;
  aiCount?: number;
  cols?: number;
  rows?: number;
  turnLimit?: number;
  /** Partial match on turn count text. */
  turns?: string;
  /** Partial match on score text. */
  score?: string;
  barbarians?: boolean;
  legends?: boolean;
  naturalWonders?: boolean;
  villages?: boolean;
  /** Match sessions where this victory was enabled at setup. */
  victory?: string;
  startedFrom?: number;
  startedTo?: number;
  endedFrom?: number;
  endedTo?: number;
}

export type GameSessionSortField =
  | "startedAt"
  | "endedAt"
  | "sessionId"
  | "clientId"
  | "handle"
  | "mode"
  | "civId"
  | "mapType"
  | "mapSize"
  | "outcome"
  | "condition"
  | "turns"
  | "score"
  | "aiCount"
  | "barbarianLevel"
  | "startingGold"
  | "gameSpeed"
  | "turnLimit";

export interface GameSessionListQuery {
  page?: number;
  pageSize?: number;
  sort?: GameSessionSortField;
  order?: "asc" | "desc";
  filters?: GameSessionFilters;
}

export interface GameSessionListResponse {
  items: AdminGameSession[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** Distinct values for reporting filter dropdowns. */
export interface SessionReportFacets {
  mapTypes: string[];
  mapSizes: string[];
  gameSpeeds: string[];
  startingGold: string[];
  barbarianLevels: string[];
  aiCounts: number[];
  modes: string[];
  outcomes: string[];
  turnLimits: number[];
  civIds: string[];
  conditions: string[];
  victories: string[];
}

/** Aggregated metrics for a filtered slice of game sessions. */
export interface SessionReport {
  totalSessions: number;
  uniquePlayers: number;
  uniqueRegisteredUsers: number;
  wins: number;
  losses: number;
  abandoned: number;
  /** Sessions with no recorded outcome yet. */
  inProgress: number;
  completedSessions: number;
  avgTurns: number;
  avgScore?: number;
  /** Share of sessions that ended in win or loss (0–100). */
  completionRate: number;
  /** Share of completed sessions that were wins (0–100). */
  winRate: number;
  byMode: LabelCount[];
  byMapType: LabelCount[];
  byMapSize: LabelCount[];
  byGameSpeed: LabelCount[];
  byVictoryCondition: LabelCount[];
  topCivs: CivCount[];
}

export interface SessionReportResponse {
  facets: SessionReportFacets;
  report: SessionReport;
  filters: GameSessionFilters;
}

/** Optional column filters for the admin bug reports table (server-side). */
export interface BugReportFilters {
  /** Free-text search across visible report fields. */
  q?: string;
  /** Partial match on report timestamp (timestamp / locale date). */
  ts?: string;
  reportId?: string;
  clientId?: string;
  handle?: string;
  userId?: string;
  sessionId?: string;
  message?: string;
  mode?: string;
  civId?: string;
  mapType?: string;
  mapSize?: string;
  outcome?: string;
  condition?: string;
  barbarianLevel?: string;
  startingGold?: string;
  gameSpeed?: string;
  aiCount?: number;
  cols?: number;
  rows?: number;
  turnLimit?: number;
  /** Partial match on in-game turn text. */
  turn?: string;
  sessionTurns?: number;
  score?: number;
  barbarians?: boolean;
  legends?: boolean;
  naturalWonders?: boolean;
  villages?: boolean;
  hasState?: boolean;
  tsFrom?: number;
  tsTo?: number;
}

export type BugReportSortField =
  | "ts"
  | "reportId"
  | "clientId"
  | "handle"
  | "sessionId"
  | "mode"
  | "civId"
  | "mapType"
  | "mapSize"
  | "outcome"
  | "condition"
  | "turn"
  | "sessionTurns"
  | "score"
  | "aiCount"
  | "barbarianLevel"
  | "startingGold"
  | "gameSpeed"
  | "turnLimit";

export interface BugReportListQuery {
  page?: number;
  pageSize?: number;
  sort?: BugReportSortField;
  order?: "asc" | "desc";
  filters?: BugReportFilters;
}

export interface BugReportListResponse {
  items: AdminBugReport[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
