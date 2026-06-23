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
export interface SessionStartEvent {
  t: "session_start";
  sessionId: string;
  clientId: string;
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
  /** Starting treasury preset, e.g. "tight"/"balanced"/"generous". */
  startingGold?: string;
  /** Chosen civ per AI opponent (null = random). */
  aiCivIds?: (string | null)[];
  /** Epoch millis on the client when the session started. */
  ts: number;
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

export type AnalyticsEvent = SessionStartEvent | SessionEndEvent | FeatureVoteEvent;

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
  clientId: string;
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

export interface LeaderboardEntry {
  clientId: string;
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

/** A label→count tally, used for the config distributions below. */
export interface LabelCount {
  label: string;
  count: number;
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
}
