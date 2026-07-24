// Authoritative multiplayer server (M3): Bun HTTP + WebSocket gateway over the
// pure lobby/game-host core. Run with Bun: `bun run src/index.ts`.
//
// Protocol: JSON ClientMessage/ServerMessage from @roc/sim over a WS at /ws.
// The sim is server-authoritative; clients send orders, the server validates
// per-owner and broadcasts fog-filtered state.

import type { ClientMessage, LobbyChatMessage, ServerMessage } from "@roc/sim";
import {
  deserializeState,
  diffPlayerView,
  isEmptyPlayerViewPatch,
  serializeState,
  type PlayerView,
} from "@roc/sim";
import type { AnalyticsBatch, AdminRegisteredUser } from "@roc/shared";
import { isSafeLookupId } from "@roc/shared";
import { MemoryStorage } from "./storage";
import { loadPersistedBugReports, persistBugReports } from "./bug-reports-persistence";
import { loadPersistedSessions, persistSessions } from "./analytics-persistence";
import { parseBugReportQuery } from "./bug-reports";
import { initUserPersistence } from "./user-bootstrap";
import { loadPersistedSupportInquiries, persistSupportInquiries } from "./support-persistence";
import { SupportStore, parseSupportInquiryBody } from "./support";
import { Lobby } from "./lobby";
import { GameAbandonScheduler, resolveAbandonMs } from "./game-abandon";
import { createAccount, deleteAccount, login, register, resume } from "./auth";
import { MemoryAnalyticsStore, type AnalyticsStore } from "./analytics";
import { PostgresAnalyticsStore } from "./analytics-postgres";
import { parseGameSessionFilters, parseGameSessionQuery } from "./game-sessions";
import { buildHandleByClientId, enrichLeaderboard, enrichSessionsPerPlayer } from "./player-handles";
import type { SessionRow } from "./analytics";

interface Conn {
  userId?: string;
  handle?: string;
  gameId?: string;
  playerId?: number;
  slot?: number;
  /** Monotonic state sequence for delta updates. */
  viewSeq?: number;
  lastView?: PlayerView;
  lastAwaiting?: number[];
  viewDeltas?: boolean;
}

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

interface StateHost {
  view(playerId: number): PlayerView;
  awaiting(): number[];
}

function sendStateToConn(ws: ServerWebSocket<Conn>, host: StateHost, forceFull = false): void {
  if (ws.data.playerId === undefined) return;
  const nextView = host.view(ws.data.playerId);
  const awaiting = host.awaiting();
  const seq = (ws.data.viewSeq ?? 0) + 1;

  if (forceFull || !ws.data.viewDeltas || ws.data.lastView === undefined) {
    ws.data.viewSeq = seq;
    ws.data.lastView = nextView;
    ws.data.lastAwaiting = [...awaiting];
    sendState(ws, { t: "state", seq, view: nextView, awaiting });
    return;
  }

  const patch = diffPlayerView(ws.data.lastView, nextView);
  const awaitingChanged = !sameJson(ws.data.lastAwaiting ?? [], awaiting);
  if (isEmptyPlayerViewPatch(patch) && !awaitingChanged) return;

  ws.data.viewSeq = seq;
  ws.data.lastView = nextView;
  ws.data.lastAwaiting = [...awaiting];
  sendState(ws, {
    t: "statePatch",
    seq,
    baseSeq: seq - 1,
    patch,
    ...(awaitingChanged ? { awaiting } : {}),
  });
}

const PORT = Number(process.env.PORT ?? 3001);
const storage = new MemoryStorage();
const userPersistence = await initUserPersistence(storage);
const lobby = new Lobby();
const supportStore = new SupportStore();
await loadPersistedSupportInquiries(supportStore);
const gameConns = new Map<string, Set<ServerWebSocket<Conn>>>();

function liveConnectionCount(gameId: string): number {
  return gameConns.get(gameId)?.size ?? 0;
}

const abandonScheduler = new GameAbandonScheduler(resolveAbandonMs(), (gameId) => {
  if (!lobby.get(gameId)) return;
  console.log(`abandoning MP game ${gameId} after all players left`);
  lobby.abandon(gameId);
  removeGameConns(gameId);
  abandonScheduler.gameRemoved(gameId);
});

// Analytics: durable Postgres when DATABASE_URL is set, else in-memory (dev).
const isProd = process.env.NODE_ENV === "production";
const ADMIN_TOKEN = process.env.ADMIN_TOKEN ?? (isProd ? "" : "dev");
const analytics: AnalyticsStore = process.env.DATABASE_URL
  ? new PostgresAnalyticsStore()
  : new MemoryAnalyticsStore();
const memoryAnalytics = analytics instanceof MemoryAnalyticsStore ? analytics : null;
if (memoryAnalytics) {
  await loadPersistedSessions(memoryAnalytics);
  await loadPersistedBugReports(memoryAnalytics);
}
await analytics.init?.().catch((err) => console.error("analytics init failed:", err));
if (!process.env.ADMIN_TOKEN && !isProd) {
  console.warn("ADMIN_TOKEN not set — using default token \"dev\" (local dev only).");
} else if (!ADMIN_TOKEN) {
  console.warn("ADMIN_TOKEN not set — the /admin API will reject all requests.");
}

const CORS_HEADERS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type, authorization, x-admin-token",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...CORS_HEADERS },
  });
}

function adminAuthorized(req: Request): boolean {
  if (!ADMIN_TOKEN) return false;
  const auth = req.headers.get("authorization");
  const bearer = auth?.startsWith("Bearer ") ? auth.slice(7) : undefined;
  return bearer === ADMIN_TOKEN || req.headers.get("x-admin-token") === ADMIN_TOKEN;
}

/** Registered accounts for the admin dashboard (passwords are bcrypt hashes only). */
async function adminListUsers(): Promise<AdminRegisteredUser[]> {
  const users = await storage.listUsers();
  return users.map((u) => ({
    id: u.id,
    handle: u.handle,
    createdAt: u.createdAt,
    email: u.email,
    newsletterOptIn: u.newsletterOptIn,
  }));
}

/** Registered usernames keyed by account id — fills gaps when a session row lost its handle. */
async function registeredUserHandles(): Promise<Map<string, string>> {
  const users = await adminListUsers();
  return new Map(users.map((u) => [u.id, u.handle]));
}

async function loadSessionRows(): Promise<SessionRow[]> {
  if (memoryAnalytics) return memoryAnalytics.exportSessions();
  if (analytics instanceof PostgresAnalyticsStore) return analytics.exportSessionRows();
  return [];
}

async function adminLeaderboard() {
  const [entries, rows, byUser] = await Promise.all([
    analytics.leaderboard(),
    loadSessionRows(),
    registeredUserHandles(),
  ]);
  return enrichLeaderboard(entries, rows, byUser);
}

async function publicLeaderboard(limit = 25) {
  const capped = Math.min(50, Math.max(1, limit));
  const [entries, rows, byUser] = await Promise.all([
    analytics.leaderboardBestPerPlayer(capped),
    loadSessionRows(),
    registeredUserHandles(),
  ]);
  return enrichLeaderboard(entries, rows, byUser);
}

async function adminSessionsPerPlayer() {
  const [entries, rows, byUser] = await Promise.all([
    analytics.sessionsPerPlayer(),
    loadSessionRows(),
    registeredUserHandles(),
  ]);
  return enrichSessionsPerPlayer(entries, rows, byUser);
}

/** Read-only admin aggregations, keyed by the URL path segment. */
async function adminQuery(name: string, searchParams?: URLSearchParams): Promise<unknown | undefined> {
  switch (name) {
    case "overview":
      return analytics.overview();
    case "users":
      return adminListUsers();
    case "games":
      return analytics.listGameSessions(parseGameSessionQuery(searchParams ?? new URLSearchParams()));
    case "reporting":
      return analytics.sessionReport(parseGameSessionFilters(searchParams ?? new URLSearchParams()));
    case "bug-reports":
      return analytics.listBugReports(parseBugReportQuery(searchParams ?? new URLSearchParams()));
    case "sessions":
      return adminSessionsPerPlayer();
    case "civs":
      return analytics.civDistribution();
    case "config":
      return analytics.configBreakdown();
    case "outcomes":
      return analytics.outcomeBreakdown();
    case "victories":
      return analytics.victoryBreakdown();
    case "leaderboard":
      return adminLeaderboard();
    case "votes":
      return analytics.voteTotals();
    case "bugReports":
      return analytics.bugReports();
    case "all": {
      const [overview, recentGamesList, sessions, civs, config, outcomes, victories, leaderboard, votes, bugReports, users] =
        await Promise.all([
          analytics.overview(),
          analytics.listGameSessions({ page: 1, pageSize: 12, sort: "startedAt", order: "desc" }),
          adminSessionsPerPlayer(),
          analytics.civDistribution(),
          analytics.configBreakdown(),
          analytics.outcomeBreakdown(),
          analytics.victoryBreakdown(),
          adminLeaderboard(),
          analytics.voteTotals(),
          analytics.bugReports(12),
          adminListUsers(),
        ]);
      return { overview, recentGames: recentGamesList.items, sessions, civs, config, outcomes, victories, leaderboard, votes, bugReports, users,
        playerHandles: Object.fromEntries(buildHandleByClientId(await loadSessionRows())),
      };
    }
    default:
      return undefined;
  }
}

function send(ws: ServerWebSocket<Conn>, msg: ServerMessage, compress = false): void {
  ws.send(JSON.stringify(msg), compress);
}

function sendState(ws: ServerWebSocket<Conn>, msg: Extract<ServerMessage, { t: "state" } | { t: "statePatch" }>): void {
  send(ws, msg, true);
}

function addConn(gameId: string, ws: ServerWebSocket<Conn>): void {
  let set = gameConns.get(gameId);
  if (!set) gameConns.set(gameId, (set = new Set()));
  set.add(ws);
  abandonScheduler.playerConnected(gameId);
}

function noteConnClosed(gameId: string): void {
  abandonScheduler.playerDisconnected(gameId, liveConnectionCount(gameId));
}

function broadcastState(gameId: string, forceFull = false): void {
  const host = lobby.get(gameId)?.host;
  if (!host) return;
  for (const ws of gameConns.get(gameId) ?? []) {
    sendStateToConn(ws, host, forceFull);
  }
}

/** Push the live pre-game roster (seats + chosen civs) to everyone in a game. */
function broadcastLobby(gameId: string): void {
  const room = lobby.room(gameId);
  if (!room) return;
  for (const ws of gameConns.get(gameId) ?? []) send(ws, { t: "lobby", room });
}

function sendLobbyChatHistory(ws: ServerWebSocket<Conn>, gameId: string): void {
  send(ws, { t: "lobbyChatHistory", gameId, messages: lobby.chatHistory(gameId) });
}

function broadcastLobbyChat(gameId: string, message: LobbyChatMessage): void {
  for (const ws of gameConns.get(gameId) ?? []) send(ws, { t: "lobbyChat", gameId, message });
}

function isHost(ws: ServerWebSocket<Conn>): boolean {
  const game = ws.data.gameId ? lobby.get(ws.data.gameId) : undefined;
  return !!game && game.hostUserId === ws.data.userId;
}

/** Drop a kicked/removed user from a game: notify them and detach their conn. */
function evict(gameId: string, userId: string): void {
  for (const ws of [...(gameConns.get(gameId) ?? [])]) {
    if (ws.data.userId !== userId) continue;
    send(ws, { t: "kicked", gameId });
    ws.data.gameId = undefined;
    ws.data.playerId = undefined;
    ws.data.slot = undefined;
    gameConns.get(gameId)?.delete(ws);
  }
  noteConnClosed(gameId);
}

/**
 * Detach a socket from whatever game it is currently attached to, before it
 * creates or joins another. Without this a socket that switches games without
 * an explicit `leaveGame` lingers in the old game's `gameConns` set forever:
 * the game never reaches zero live connections (so it is never abandoned),
 * leaks its lobby entry, and keeps receiving broadcasts on a dead socket.
 */
function detachFromGame(ws: ServerWebSocket<Conn>): void {
  const prev = ws.data.gameId;
  if (!prev) return;
  gameConns.get(prev)?.delete(ws);
  ws.data.gameId = undefined;
  ws.data.playerId = undefined;
  ws.data.slot = undefined;
  noteConnClosed(prev);
}

function removeGameConns(gameId: string): void {
  const set = gameConns.get(gameId);
  if (!set) return;
  for (const ws of set) {
    send(ws, { t: "deleted", gameId });
    ws.data.gameId = undefined;
    ws.data.playerId = undefined;
    ws.data.slot = undefined;
  }
  gameConns.delete(gameId);
  abandonScheduler.gameRemoved(gameId);
}

async function handle(ws: ServerWebSocket<Conn>, msg: ClientMessage): Promise<void> {
  switch (msg.t) {
    case "register":
    case "login":
    case "resume": {
      const res =
        msg.t === "register"
          ? await register(storage, msg.handle, msg.password, {
              email: msg.email,
              newsletter: msg.newsletter,
            })
          : msg.t === "login"
            ? await login(storage, msg.handle, msg.password)
            : await resume(storage, msg.token);
      if ("error" in res) return send(ws, { t: "error", message: res.error });
      ws.data.userId = res.userId;
      ws.data.handle = res.handle;
      if (msg.t === "register") {
        userPersistence.save().catch((err) => console.error("user persistence save failed:", err));
      }
      send(ws, { t: "authOk", token: res.token, userId: res.userId, handle: res.handle });
      return;
    }
    case "deleteAccount": {
      const res = await deleteAccount(storage, msg.token, msg.password);
      if ("error" in res) return send(ws, { t: "error", message: res.error });
      // Forced: deleting the last account legitimately empties the registry, and
      // the guard would otherwise refuse the write and resurrect the user.
      userPersistence.save(true).catch((err) => console.error("user persistence save failed:", err));
      send(ws, { t: "accountDeleted" });
      return;
    }
    case "listGames":
      return send(ws, { t: "games", games: lobby.list() });

    case "createGame": {
      if (!ws.data.userId) return send(ws, { t: "error", message: "not logged in" });
      detachFromGame(ws);
      const game = lobby.create(msg.name, ws.data.userId, ws.data.handle ?? "Player", {
        seed: msg.seed,
        cols: msg.cols,
        rows: msg.rows,
        mapSize: msg.mapSize,
        capacity: msg.capacity,
        aiCount: msg.aiCount,
        mapType: msg.mapType,
        barbarians: msg.barbarians,
        aiDifficulty: msg.aiDifficulty,
        naturalWonders: msg.naturalWonders,
        villages: msg.villages,
        startingGold: msg.startingGold,
        turnLimit: msg.turnLimit,
        gameSpeed: msg.gameSpeed,
        enabledVictories: msg.enabledVictories,
        aiCivIds: msg.aiCivIds,
        colors: msg.colors,
        password: msg.password,
      });
      ws.data.gameId = game.id;
      ws.data.slot = game.slots[0]!.id;
      addConn(game.id, ws);
      send(ws, { t: "joined", gameId: game.id, slotId: game.slots[0]!.id });
      sendLobbyChatHistory(ws, game.id);
      broadcastLobby(game.id);
      return;
    }
    case "joinGame": {
      if (!ws.data.userId) return send(ws, { t: "error", message: "not logged in" });
      const r = lobby.join(msg.gameId, ws.data.userId, ws.data.handle ?? "Player", msg.password);
      if ("error" in r) return send(ws, { t: "error", message: r.error });
      if (ws.data.gameId && ws.data.gameId !== msg.gameId) detachFromGame(ws);
      ws.data.gameId = msg.gameId;
      ws.data.slot = r.slotId;
      addConn(msg.gameId, ws);
      send(ws, { t: "joined", gameId: msg.gameId, slotId: r.slotId });
      const game = lobby.get(msg.gameId);
      if (game?.status === "active") {
        ws.data.playerId = r.playerId ?? game.slots.find((s) => s.userId === ws.data.userId)?.playerId;
        send(ws, { t: "started", gameId: msg.gameId });
        if (ws.data.playerId !== undefined && game.host) {
          sendStateToConn(ws, game.host, true);
        }
        return;
      }
      sendLobbyChatHistory(ws, msg.gameId);
      broadcastLobby(msg.gameId);
      return;
    }
    case "pickCiv": {
      if (!ws.data.userId) return send(ws, { t: "error", message: "not logged in" });
      const r = lobby.pickCiv(msg.gameId, ws.data.userId, msg.civId);
      if ("error" in r) return send(ws, { t: "error", message: r.error });
      broadcastLobby(msg.gameId);
      return;
    }
    case "configureGame": {
      if (!ws.data.userId) return send(ws, { t: "error", message: "not logged in" });
      const r = lobby.configure(msg.gameId, ws.data.userId, {
        name: msg.name,
        password: msg.password,
        cols: msg.cols,
        rows: msg.rows,
        mapSize: msg.mapSize,
        mapType: msg.mapType,
        barbarians: msg.barbarians,
        aiDifficulty: msg.aiDifficulty,
        naturalWonders: msg.naturalWonders,
        villages: msg.villages,
        startingGold: msg.startingGold,
        turnLimit: msg.turnLimit,
        gameSpeed: msg.gameSpeed,
        enabledVictories: msg.enabledVictories,
      });
      if ("error" in r) return send(ws, { t: "error", message: r.error });
      broadcastLobby(msg.gameId);
      send(ws, { t: "games", games: lobby.list() });
      return;
    }
    case "addSlot": {
      if (!ws.data.userId) return send(ws, { t: "error", message: "not logged in" });
      const r = lobby.addSlot(msg.gameId, ws.data.userId, msg.kind);
      if ("error" in r) return send(ws, { t: "error", message: r.error });
      broadcastLobby(msg.gameId);
      return;
    }
    case "removeSlot": {
      if (!ws.data.userId) return send(ws, { t: "error", message: "not logged in" });
      const r = lobby.removeSlot(msg.gameId, ws.data.userId, msg.slotId);
      if ("error" in r) return send(ws, { t: "error", message: r.error });
      if (r.kicked) evict(msg.gameId, r.kicked);
      broadcastLobby(msg.gameId);
      return;
    }
    case "updateSlot": {
      if (!ws.data.userId) return send(ws, { t: "error", message: "not logged in" });
      const r = lobby.updateSlot(msg.gameId, ws.data.userId, msg.slotId, {
        kind: msg.kind,
        civId: msg.civId,
        color: msg.color,
      });
      if ("error" in r) return send(ws, { t: "error", message: r.error });
      if (r.kicked) evict(msg.gameId, r.kicked);
      broadcastLobby(msg.gameId);
      return;
    }
    case "kickSlot": {
      if (!ws.data.userId) return send(ws, { t: "error", message: "not logged in" });
      const r = lobby.kick(msg.gameId, ws.data.userId, msg.slotId);
      if ("error" in r) return send(ws, { t: "error", message: r.error });
      evict(msg.gameId, r.kicked);
      broadcastLobby(msg.gameId);
      return;
    }
    case "startGame": {
      if (!ws.data.userId) return send(ws, { t: "error", message: "not logged in" });
      const r = lobby.start(msg.gameId, ws.data.userId);
      if ("error" in r) return send(ws, { t: "error", message: r.error });
      // Bind each connection to its assigned sim player (humans first, then AI).
      const game = lobby.get(msg.gameId);
      for (const c of gameConns.get(msg.gameId) ?? []) {
        c.data.playerId = game?.slots.find((s) => s.userId === c.data.userId)?.playerId;
      }
      for (const c of gameConns.get(msg.gameId) ?? []) send(c, { t: "started", gameId: msg.gameId });
      broadcastState(msg.gameId, true);
      return;
    }
    case "setFeatures": {
      ws.data.viewDeltas = msg.deltas ?? false;
      return;
    }
    case "resyncState": {
      const host = ws.data.gameId ? lobby.get(ws.data.gameId)?.host : undefined;
      if (!host || ws.data.playerId === undefined) return;
      sendStateToConn(ws, host, true);
      return;
    }
    case "deleteGame": {
      if (!ws.data.userId) return send(ws, { t: "error", message: "not logged in" });
      const game = lobby.get(msg.gameId);
      if (!game) return send(ws, { t: "error", message: "no such game" });
      if (game.hostUserId !== ws.data.userId) return send(ws, { t: "error", message: "only the host can delete this game" });
      const r = lobby.delete(msg.gameId, ws.data.userId);
      if ("error" in r) return send(ws, { t: "error", message: r.error });
      removeGameConns(msg.gameId);
      send(ws, { t: "games", games: lobby.list() });
      return;
    }
    case "leaveGame": {
      if (!ws.data.userId) return send(ws, { t: "error", message: "not logged in" });
      const r = lobby.leave(msg.gameId, ws.data.userId);
      if ("error" in r) return send(ws, { t: "error", message: r.error });
      gameConns.get(msg.gameId)?.delete(ws);
      ws.data.gameId = undefined;
      ws.data.slot = undefined;
      ws.data.playerId = undefined;
      if (!r.wasHost) broadcastLobby(msg.gameId); // let the room see the seat reopen
      send(ws, { t: "games", games: lobby.list() });
      return;
    }
    case "lobbyChat": {
      if (!ws.data.userId) return send(ws, { t: "error", message: "not logged in" });
      if (ws.data.gameId !== msg.gameId) return send(ws, { t: "error", message: "not in this game" });
      const r = lobby.appendChat(msg.gameId, ws.data.userId, ws.data.handle ?? "Player", msg.text);
      if ("error" in r) return send(ws, { t: "error", message: r.error });
      broadcastLobbyChat(msg.gameId, r.message);
      return;
    }
    case "ping":
      return; // keepalive — nothing to do
    case "getLeaderboard": {
      try {
        const limit = msg.limit ?? 25;
        const entries = await publicLeaderboard(limit);
        return send(ws, { t: "leaderboard", entries });
      } catch (err) {
        console.error("leaderboard error:", err);
        return send(ws, { t: "error", message: "leaderboard unavailable" });
      }
    }
    case "order": {
      const host = ws.data.gameId ? lobby.get(ws.data.gameId)?.host : undefined;
      if (!host || ws.data.playerId === undefined) return send(ws, { t: "error", message: "not in a game" });
      const out = host.order(ws.data.playerId, msg.cmd);
      if (!out.ok) return send(ws, { t: "orderRejected", reason: out.error ?? "rejected" });
      broadcastState(ws.data.gameId!);
      return;
    }
    case "ready": {
      const host = ws.data.gameId ? lobby.get(ws.data.gameId)?.host : undefined;
      if (!host || ws.data.playerId === undefined) return send(ws, { t: "error", message: "not in a game" });
      host.ready_(ws.data.playerId);
      broadcastState(ws.data.gameId!);
      return;
    }
    case "exportState": {
      const game = ws.data.gameId ? lobby.get(ws.data.gameId) : undefined;
      const host = game?.host;
      if (!host || ws.data.playerId === undefined) return send(ws, { t: "error", message: "not in a game" });
      if (!isHost(ws)) return send(ws, { t: "error", message: "only the host can export" });
      const blob = JSON.stringify(serializeState(host.state));
      return send(ws, { t: "exported", blob });
    }
    case "loadGame": {
      const game = ws.data.gameId ? lobby.get(ws.data.gameId) : undefined;
      if (!game || ws.data.playerId === undefined) return send(ws, { t: "error", message: "not in a game" });
      if (!isHost(ws)) return send(ws, { t: "error", message: "only the host can load" });
      let state;
      try {
        state = deserializeState(JSON.parse(msg.blob) as ReturnType<typeof serializeState>);
      } catch {
        return send(ws, { t: "error", message: "invalid save blob" });
      }
      const r = lobby.restore(game.id, state);
      if ("error" in r) return send(ws, { t: "error", message: r.error });
      broadcastState(game.id, true);
      return send(ws, { t: "loaded", gameId: game.id });
    }
  }
}

const server = Bun.serve<Conn>({
  port: PORT,
  // hostname is a valid Bun.serve runtime option; the ambient bun types available to
  // tsc here omit it, so suppress the excess-property check on this one line.
  // @ts-expect-error - bun-types gap, not a real error
  hostname: "0.0.0.0",
  async fetch(req, server) {
    const url = new URL(req.url);
    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ ok: true, service: "roc-server" }), {
        headers: { "content-type": "application/json" },
      });
    }

    // CORS preflight for the analytics + admin endpoints.
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (url.pathname === "/analytics" && req.method === "POST") {
      try {
        // Read the raw body and parse as JSON ourselves: sendBeacon delivers a
        // text/plain body (so it isn't blocked cross-origin), and req.json()
        // would otherwise depend on the content-type.
        const batch = JSON.parse(await req.text()) as AnalyticsBatch;
        const events = Array.isArray(batch?.events) ? batch.events.slice(0, 100) : [];
        if (events.length) {
          await analytics.record(events);
          if (memoryAnalytics) {
            persistSessions(memoryAnalytics).catch((err) => console.error("game persistence save failed:", err));
            persistBugReports(memoryAnalytics).catch((err) => console.error("bug report persistence save failed:", err));
          }
        }
      } catch (err) {
        console.error("analytics ingest error:", err);
      }
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (url.pathname === "/api/leaderboard" && req.method === "GET") {
      try {
        const limitRaw = url.searchParams.get("limit");
        const limit = limitRaw ? Number.parseInt(limitRaw, 10) : 25;
        const entries = await publicLeaderboard(Number.isFinite(limit) ? limit : 25);
        return jsonResponse({ entries });
      } catch (err) {
        console.error("leaderboard error:", err);
        return jsonResponse({ error: "unavailable" }, 503);
      }
    }

    if (url.pathname === "/support" && req.method === "POST") {
      try {
        const parsed = parseSupportInquiryBody(JSON.parse(await req.text()));
        if ("error" in parsed) return jsonResponse({ error: parsed.error }, 400);
        const record = supportStore.add(parsed);
        persistSupportInquiries(supportStore).catch((err) =>
          console.error("support persistence save failed:", err),
        );
        return jsonResponse({ ok: true, inquiryId: record.id });
      } catch (err) {
        console.error("support ingest error:", err);
        return jsonResponse({ error: "invalid body" }, 400);
      }
    }

    // Admin read API (token-gated).
    if (url.pathname.startsWith("/admin/api/")) {
      if (!adminAuthorized(req)) return jsonResponse({ error: "unauthorized" }, 401);

      if (url.pathname === "/admin/api/users" && req.method === "POST") {
        try {
          const body = (await req.json()) as {
            handle?: string;
            password?: string;
            email?: string;
            newsletter?: boolean;
          };
          const handle = body.handle?.trim() ?? "";
          const password = body.password ?? "";
          const created = await createAccount(storage, handle, password, {
            email: body.email,
            newsletter: body.newsletter,
          });
          if ("error" in created) return jsonResponse({ error: created.error }, 400);
          const u = created.user;
          await userPersistence.save();
          const row: AdminRegisteredUser = {
            id: u.id,
            handle: u.handle,
            createdAt: u.createdAt,
            email: u.email,
            newsletterOptIn: u.newsletterOptIn,
          };
          return jsonResponse(row, 201);
        } catch {
          return jsonResponse({ error: "invalid body" }, 400);
        }
      }

      const name = url.pathname.slice("/admin/api/".length);
      // Single bug report detail (full captured payload): /admin/api/bug-report/<id>.
      if (name.startsWith("bug-report/")) {
        const id = decodeURIComponent(name.slice("bug-report/".length));
        if (!isSafeLookupId(id)) return jsonResponse({ error: "not found" }, 404);
        const report = await analytics.bugReport(id);
        if (!report) return jsonResponse({ error: "not found" }, 404);
        return jsonResponse(report);
      }
      // Single game session detail: /admin/api/game/<sessionId>.
      if (name.startsWith("game/")) {
        const id = decodeURIComponent(name.slice("game/".length));
        if (!isSafeLookupId(id)) return jsonResponse({ error: "not found" }, 404);
        const game = await analytics.gameSession(id);
        if (!game) return jsonResponse({ error: "not found" }, 404);
        return jsonResponse(game);
      }
      const result = await adminQuery(name, url.searchParams);
      if (result === undefined) return jsonResponse({ error: "not found" }, 404);
      return jsonResponse(result);
    }

    if (url.pathname === "/ws") {
      if (server.upgrade<Conn>(req, { data: {} })) return undefined;
      return new Response("upgrade failed", { status: 400 });
    }
    return new Response("Rise of Civilizations server", {
      headers: { "content-type": "text/plain" },
    });
  },
  websocket: {
    idleTimeout: 0, // never time out idle connections (game state is server-authoritative; clients may be AFK)
    perMessageDeflate: true,
    open() {
      /* connection opens unauthenticated; client sends register/login next */
    },
    async message(ws, message) {
      let parsed: ClientMessage;
      try {
        parsed = JSON.parse(typeof message === "string" ? message : "") as ClientMessage;
      } catch {
        return send(ws, { t: "error", message: "bad message" });
      }
      try {
        await handle(ws, parsed);
      } catch (err) {
        send(ws, { t: "error", message: String(err) });
      }
    },
    close(ws) {
      const gameId = ws.data.gameId;
      if (!gameId) return;
      gameConns.get(gameId)?.delete(ws);
      noteConnClosed(gameId);
    },
  },
});

console.log(`roc-server listening on http://0.0.0.0:${server.port} (emulator: ws://10.0.2.2:${server.port}/ws)`);
