// Authoritative multiplayer server — skeleton only (M3 builds this out:
// auth, lobby, real-time simultaneous turn resolution, Postgres persistence).
//
// Run with Bun (not installed in this environment yet): `bun run src/index.ts`.

const PORT = Number(process.env.PORT ?? 3001);

const server = Bun.serve({
  port: PORT,
  fetch(req, server) {
    const url = new URL(req.url);
    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ ok: true, service: "roc-server" }), {
        headers: { "content-type": "application/json" },
      });
    }
    // WebSocket upgrade will be wired here in M3.
    return new Response("Rise of Civilizations server (skeleton)", {
      headers: { "content-type": "text/plain" },
    });
  },
  websocket: {
    open() {
      /* M3: register player, send snapshot */
    },
    message() {
      /* M3: validate order against authoritative sim, broadcast deltas */
    },
    close() {
      /* M3: mark disconnected, allow reconnect */
    },
  },
});

console.log(`roc-server listening on http://localhost:${server.port}`);
