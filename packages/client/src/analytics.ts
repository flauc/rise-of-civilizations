/// <reference types="vite/client" />
// Offline-first analytics for the game client. Events are queued in localStorage
// and POSTed to the server only when the browser is online; if we're offline or
// the server is unreachable, the queue simply waits and the game is unaffected.
//
// Everything here is best-effort and wrapped so it can NEVER throw into gameplay
// (a failed localStorage read, a network error, a missing API — all swallowed).

import {
  ANALYTICS_SCHEMA_VERSION,
  type AnalyticsBatch,
  type AnalyticsEvent,
  type GameMode,
  type SessionOutcome,
} from "@roc/shared";

const CLIENT_ID_KEY = "roc-client-id";
const QUEUE_KEY = "roc-analytics-queue";
const ACTIVE_KEY = "roc-active-session";
const QUEUE_CAP = 500;

/** Endpoint resolution mirrors the WS-URL pattern in lobby-ui.ts. */
function resolveEndpoint(): string {
  const explicit = import.meta.env.VITE_ANALYTICS_URL?.trim();
  if (explicit) return explicit;
  // Derive from the WS URL if provided (ws(s)://host:port/ws -> http(s)://.../analytics).
  const wsUrl = import.meta.env.VITE_WS_URL?.trim();
  if (wsUrl) {
    return wsUrl.replace(/^ws/, "http").replace(/\/ws\/?$/, "") + "/analytics";
  }
  const scheme = location.protocol === "https:" ? "https" : "http";
  return `${scheme}://${location.hostname || "localhost"}:3001/analytics`;
}

const ENDPOINT = resolveEndpoint();

function uuid(): string {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  } catch {
    /* fall through */
  }
  return "c_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function getClientId(): string {
  try {
    let id = localStorage.getItem(CLIENT_ID_KEY);
    if (!id) {
      id = uuid();
      localStorage.setItem(CLIENT_ID_KEY, id);
    }
    return id;
  } catch {
    return "anon";
  }
}

const clientId = getClientId();

// ---- queue ---------------------------------------------------------------

function readQueue(): AnalyticsEvent[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as AnalyticsEvent[]) : [];
  } catch {
    return [];
  }
}

function writeQueue(events: AnalyticsEvent[]): void {
  try {
    // Keep only the most recent QUEUE_CAP so a long offline streak can't grow
    // localStorage without bound.
    const capped = events.length > QUEUE_CAP ? events.slice(events.length - QUEUE_CAP) : events;
    localStorage.setItem(QUEUE_KEY, JSON.stringify(capped));
  } catch {
    /* quota / private mode — drop silently */
  }
}

let flushing = false;

/** Send queued events if online. Never throws; failures keep the queue intact. */
export async function flush(): Promise<void> {
  if (flushing) return;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;
  const queue = readQueue();
  if (queue.length === 0) return;
  flushing = true;
  const snapshot = queue.slice();
  try {
    const batch: AnalyticsBatch = { v: ANALYTICS_SCHEMA_VERSION, events: snapshot };
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(batch),
      keepalive: true,
    });
    if (res.ok) {
      // Drop exactly the events we sent; anything appended meanwhile stays queued.
      writeQueue(readQueue().slice(snapshot.length));
    }
  } catch {
    /* offline / network error — leave the queue for next time */
  } finally {
    flushing = false;
  }
}

function enqueue(event: AnalyticsEvent): void {
  try {
    const queue = readQueue();
    queue.push(event);
    writeQueue(queue);
  } catch {
    /* ignore */
  }
  void flush();
}

/** Send the entire queue via sendBeacon (for page unload). */
function flushBeacon(extra?: AnalyticsEvent): void {
  try {
    const queue = readQueue();
    if (extra) queue.push(extra);
    if (queue.length === 0) return;
    const batch: AnalyticsBatch = { v: ANALYTICS_SCHEMA_VERSION, events: queue };
    const blob = new Blob([JSON.stringify(batch)], { type: "application/json" });
    const sent = typeof navigator !== "undefined" && navigator.sendBeacon?.(ENDPOINT, blob);
    if (sent) writeQueue([]);
    else if (extra) writeQueue(queue); // persist the abandoned event for next online flush
  } catch {
    /* ignore */
  }
}

// ---- active-session tracking (for abandoned detection) -------------------

interface ActiveSession {
  sessionId: string;
  mode: GameMode;
  turns: number;
}
let active: ActiveSession | null = null;

function persistActive(): void {
  try {
    if (active) localStorage.setItem(ACTIVE_KEY, JSON.stringify(active));
    else localStorage.removeItem(ACTIVE_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * The subset of a session's metadata that the player chooses in the lobby and
 * that can't be recovered from the running game state (map type, treasury,
 * natural wonders, barbarian level, AI civ picks). Threaded from the lobby into
 * `startGame` so it can be attached to the session_start event.
 */
export type GameSetup = Pick<
  SessionStartMeta,
  "mapType" | "mapSize" | "startingGold" | "naturalWonders" | "barbarianLevel" | "aiCivIds" | "legends"
>;

export interface SessionStartMeta {
  mode: GameMode;
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
  startingGold?: string;
  aiCivIds?: (string | null)[];
}

/** Record the start of a game session and become the "active" session. */
export function trackSessionStart(meta: SessionStartMeta): string {
  const sessionId = uuid();
  active = { sessionId, mode: meta.mode, turns: 0 };
  persistActive();
  enqueue({
    t: "session_start",
    sessionId,
    clientId,
    mode: meta.mode,
    civId: meta.civId,
    mapType: meta.mapType,
    mapSize: meta.mapSize,
    cols: meta.cols,
    rows: meta.rows,
    aiCount: meta.aiCount,
    barbarians: meta.barbarians,
    legends: meta.legends,
    barbarianLevel: meta.barbarianLevel,
    naturalWonders: meta.naturalWonders,
    startingGold: meta.startingGold,
    aiCivIds: meta.aiCivIds,
    ts: Date.now(),
  });
  return sessionId;
}

/** Cheap in-memory update of the active session's turn count (call per frame). */
export function noteTurns(turns: number): void {
  if (active) active.turns = turns;
}

/** Record a clean (win/loss) session end and clear the active session. */
export function trackSessionEnd(args: {
  outcome: SessionOutcome;
  condition?: string;
  turns: number;
  score?: number;
  scoreRank?: number;
}): void {
  if (!active) return;
  const sessionId = active.sessionId;
  active = null;
  persistActive();
  enqueue({
    t: "session_end",
    sessionId,
    clientId,
    outcome: args.outcome,
    condition: args.condition,
    turns: args.turns,
    score: args.score,
    scoreRank: args.scoreRank,
    ts: Date.now(),
  });
}

export function trackFeatureVote(featureId: string, action: "add" | "remove"): void {
  enqueue({ t: "feature_vote", clientId, featureId, action, ts: Date.now() });
}

// ---- lifecycle wiring ----------------------------------------------------

let wired = false;
/** Call once at startup: flush the queue and install online/unload flush hooks. */
export function initAnalytics(): void {
  if (wired) return;
  wired = true;

  // A session left over from a previous load that never ended → abandoned.
  try {
    const raw = localStorage.getItem(ACTIVE_KEY);
    if (raw) {
      const stale = JSON.parse(raw) as ActiveSession;
      localStorage.removeItem(ACTIVE_KEY);
      if (stale?.sessionId) {
        enqueue({
          t: "session_end",
          sessionId: stale.sessionId,
          clientId,
          outcome: "abandoned",
          turns: stale.turns ?? 0,
          ts: Date.now(),
        });
      }
    }
  } catch {
    /* ignore */
  }

  void flush();
  window.addEventListener("online", () => void flush());

  const onLeave = (): void => {
    // Persist the live turn count, then beacon an abandoned end if a session is
    // still active (covers reload-to-menu and tab close); otherwise flush queue.
    if (active) {
      persistActive();
      const end: AnalyticsEvent = {
        t: "session_end",
        sessionId: active.sessionId,
        clientId,
        outcome: "abandoned",
        turns: active.turns,
        ts: Date.now(),
      };
      active = null;
      persistActive();
      flushBeacon(end);
    } else {
      flushBeacon();
    }
  };
  window.addEventListener("pagehide", onLeave);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      if (active) persistActive();
      flushBeacon();
    }
  });
}
