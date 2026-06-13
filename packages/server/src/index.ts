// Authoritative multiplayer server (M3): Bun HTTP + WebSocket gateway over the
// pure lobby/game-host core. Run with Bun: `bun run src/index.ts`.
//
// Protocol: JSON ClientMessage/ServerMessage from @roc/sim over a WS at /ws.
// The sim is server-authoritative; clients send orders, the server validates
// per-owner and broadcasts fog-filtered state.

import type { ClientMessage, ServerMessage } from "@roc/sim";
import { MemoryStorage } from "./storage";
import { Lobby } from "./lobby";
import { login, register, resume } from "./auth";

interface Conn {
  userId?: string;
  handle?: string;
  gameId?: string;
  playerId?: number;
}

const PORT = Number(process.env.PORT ?? 3001);
const storage = new MemoryStorage();
const lobby = new Lobby();
const gameConns = new Map<string, Set<ServerWebSocket<Conn>>>();

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
        aiCount: msg.aiCount,
      });
      ws.data.gameId = game.id;
      ws.data.playerId = game.slots[0]!.playerId;
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
  }
}

const server = Bun.serve<Conn>({
  port: PORT,
  fetch(req, server) {
    const url = new URL(req.url);
    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ ok: true, service: "roc-server" }), {
        headers: { "content-type": "application/json" },
      });
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
