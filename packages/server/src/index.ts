// Authoritative multiplayer server (M3): Bun HTTP + WebSocket gateway over the
// pure lobby/game-host core. Run with Bun: `bun run src/index.ts`.
//
// Protocol: JSON ClientMessage/ServerMessage from @roc/sim over a WS at /ws.
// The sim is server-authoritative; clients send orders, the server validates
// per-owner and broadcasts fog-filtered state.

import type { ClientMessage, ServerMessage } from "@roc/sim";
import { deserializeState, serializeState } from "@roc/sim";
import type { AnalyticsBatch } from "@roc/shared";
import { MemoryStorage } from "./storage";
import { Lobby } from "./lobby";
import { login, register, resume } from "./auth";
import { MemoryAnalyticsStore, type AnalyticsStore } from "./analytics";
import { PostgresAnalyticsStore } from "./analytics-postgres";

interface Conn {
  userId?: string;
  handle?: string;
  gameId?: string;
  playerId?: number;
  slot?: number;
}

const PORT = Number(process.env.PORT ?? 3001);
const storage = new MemoryStorage();
const lobby = new Lobby();
const gameConns = new Map<string, Set<ServerWebSocket<Conn>>>();

// Analytics: durable Postgres when DATABASE_URL is set, else in-memory (dev).
const ADMIN_TOKEN = process.env.ADMIN_TOKEN ?? "";
const analytics: AnalyticsStore = process.env.DATABASE_URL
  ? new PostgresAnalyticsStore()
  : new MemoryAnalyticsStore();
await analytics.init?.().catch((err) => console.error("analytics init failed:", err));
if (!ADMIN_TOKEN) console.warn("ADMIN_TOKEN not set — the /admin API will reject all requests.");

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

/** Read-only admin aggregations, keyed by the URL path segment. */
async function adminQuery(name: string): Promise<unknown | undefined> {
  switch (name) {
    case "overview":
      return analytics.overview();
    case "sessions":
      return analytics.sessionsPerPlayer();
    case "civs":
      return analytics.civDistribution();
    case "config":
      return analytics.configBreakdown();
    case "outcomes":
      return analytics.outcomeBreakdown();
    case "leaderboard":
      return analytics.leaderboard();
    case "votes":
      return analytics.voteTotals();
    case "all": {
      const [overview, sessions, civs, config, outcomes, leaderboard, votes] = await Promise.all([
        analytics.overview(),
        analytics.sessionsPerPlayer(),
        analytics.civDistribution(),
        analytics.configBreakdown(),
        analytics.outcomeBreakdown(),
        analytics.leaderboard(),
        analytics.voteTotals(),
      ]);
      return { overview, sessions, civs, config, outcomes, leaderboard, votes };
    }
    default:
      return undefined;
  }
}

function send(ws: ServerWebSocket<Conn>, msg: ServerMessage): void {
  ws.send(JSON.stringify(msg));
}

function addConn(gameId: string, ws: ServerWebSocket<Conn>): void {
  let set = gameConns.get(gameId);
  if (!set) gameConns.set(gameId, (set = new Set()));
  set.add(ws);
}

function broadcastState(gameId: string): void {
  const host = lobby.get(gameId)?.host;
  if (!host) return;
  for (const ws of gameConns.get(gameId) ?? []) {
    if (ws.data.playerId === undefined) continue;
    send(ws, { t: "state", view: host.view(ws.data.playerId), awaiting: host.awaiting() });
  }
}

function isHost(ws: ServerWebSocket<Conn>): boolean {
  return ws.data.slot === 0;
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
}

async function handle(ws: ServerWebSocket<Conn>, msg: ClientMessage): Promise<void> {
  switch (msg.t) {
    case "register":
    case "login":
    case "resume": {
      const res =
        msg.t === "register"
          ? await register(storage, msg.handle, msg.password)
          : msg.t === "login"
            ? await login(storage, msg.handle, msg.password)
            : await resume(storage, msg.token);
      if ("error" in res) return send(ws, { t: "error", message: res.error });
      ws.data.userId = res.userId;
      ws.data.handle = res.handle;
      send(ws, { t: "authOk", token: res.token, userId: res.userId, handle: res.handle });
      return;
    }
    case "listGames":
      return send(ws, { t: "games", games: lobby.list() });

    case "createGame": {
      if (!ws.data.userId) return send(ws, { t: "error", message: "not logged in" });
      const game = lobby.create(msg.name, ws.data.userId, ws.data.handle ?? "Player", {
        seed: msg.seed,
        cols: msg.cols,
        rows: msg.rows,
        capacity: msg.capacity,
        aiCount: msg.aiCount,
        mapType: msg.mapType,
        barbarians: msg.barbarians,
        naturalWonders: msg.naturalWonders,
        startingGold: msg.startingGold,
        aiCivIds: msg.aiCivIds,
        colors: msg.colors,
      });
      ws.data.gameId = game.id;
      ws.data.playerId = game.slots[0]!.playerId;
      ws.data.slot = 0;
      addConn(game.id, ws);
      send(ws, { t: "joined", gameId: game.id, slot: 0, playerId: ws.data.playerId });
      return;
    }
    case "joinGame": {
      if (!ws.data.userId) return send(ws, { t: "error", message: "not logged in" });
      const r = lobby.join(msg.gameId, ws.data.userId, ws.data.handle ?? "Player");
      if ("error" in r) return send(ws, { t: "error", message: r.error });
      ws.data.gameId = msg.gameId;
      ws.data.playerId = r.playerId;
      ws.data.slot = r.slot;
      addConn(msg.gameId, ws);
      send(ws, { t: "joined", gameId: msg.gameId, slot: r.slot, playerId: r.playerId });
      return;
    }
    case "startGame": {
      const r = lobby.start(msg.gameId);
      if ("error" in r) return send(ws, { t: "error", message: r.error });
      for (const c of gameConns.get(msg.gameId) ?? []) send(c, { t: "started", gameId: msg.gameId });
      broadcastState(msg.gameId);
      return;
    }
    case "deleteGame": {
      if (!ws.data.userId) return send(ws, { t: "error", message: "not logged in" });
      const game = lobby.get(msg.gameId);
      if (!game) return send(ws, { t: "error", message: "no such game" });
      if (game.slots[0]?.userId !== ws.data.userId) return send(ws, { t: "error", message: "only the host can delete this game" });
      const r = lobby.delete(msg.gameId, ws.data.userId);
      if ("error" in r) return send(ws, { t: "error", message: r.error });
      removeGameConns(msg.gameId);
      send(ws, { t: "games", games: lobby.list() });
      return;
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
      broadcastState(game.id);
      return send(ws, { t: "loaded", gameId: game.id });
    }
  }
}

const server = Bun.serve<Conn>({
  port: PORT,
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

    // Analytics ingestion: best-effort, fail-soft (always 204 so clients never
    // retry-storm). The game works whether or not this succeeds.
    if (url.pathname === "/analytics" && req.method === "POST") {
      try {
        const batch = (await req.json()) as AnalyticsBatch;
        const events = Array.isArray(batch?.events) ? batch.events.slice(0, 100) : [];
        if (events.length) await analytics.record(events);
      } catch (err) {
        console.error("analytics ingest error:", err);
      }
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // Admin read API (token-gated).
    if (url.pathname.startsWith("/admin/api/")) {
      if (!adminAuthorized(req)) return jsonResponse({ error: "unauthorized" }, 401);
      const name = url.pathname.slice("/admin/api/".length);
      const result = await adminQuery(name);
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
      if (ws.data.gameId) gameConns.get(ws.data.gameId)?.delete(ws);
    },
  },
});

console.log(`roc-server listening on http://localhost:${server.port}`);
