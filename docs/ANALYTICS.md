# Analytics & Admin Dashboard

Anonymous, **offline-first** gameplay metrics. The game never depends on analytics
being delivered: events queue in the browser and are sent only when online. If the
server is unreachable or the player is offline, gameplay is completely unaffected.

## What we measure

| Metric | Source event | Where it shows |
| --- | --- | --- |
| Sessions played per user | `session_start` (grouped by anonymous `clientId`) | Overview, Sessions per player |
| Turns played | `session_end.turns` | Overview (avg), Leaderboard |
| Civilization picked | `session_start.civId` | Civilizations picked |
| Leaderboard standing | `session_end.score` / `scoreRank` | Leaderboard |
| Outcome (win / loss / abandoned) | `session_end.outcome` | Outcomes, Sessions per player |
| Votes per planned feature | `feature_vote` (roadmap) | Feature votes |

## How it flows

1. **Client** (`packages/client/src/analytics.ts`) assigns a random anonymous
   `clientId` (localStorage), queues events in localStorage, and POSTs them to the
   server **only when `navigator.onLine`**. On page unload it uses `navigator.sendBeacon`
   so an abandoned game (reload / tab close) is still recorded. Leaving a game without
   reaching victory is reported as `outcome: "abandoned"`.
2. **Server** (`packages/server/src/index.ts`) exposes:
   - `POST /analytics` — ingestion (CORS-open, fail-soft, always returns `204`).
   - `GET /admin/api/{overview|sessions|civs|outcomes|leaderboard|votes|all}` —
     token-gated read API.
   Storage is durable Postgres (`PostgresAnalyticsStore`, via Bun's built-in
   `SQL`) when `DATABASE_URL` is set, otherwise an in-memory store for dev/tests
   (`MemoryAnalyticsStore`). The event schema is shared in
   `packages/shared/src/analytics.ts`.
3. **Admin app** (`packages/admin`) is a small Vite dashboard that reads the
   `/admin/api/*` endpoints (sending the token as `x-admin-token`).

## Database schema (auto-created on boot via `init()`)

- `sessions(session_id PK, client_id, mode, civ_id, map_type, map_size, map_cols,
  map_rows, ai_count, barbarians, legends, started_at, ended_at, outcome,
  condition, turns, score, score_rank)` — one row per game; `session_start` fills
  setup columns, `session_end` fills outcome columns (`ON CONFLICT` merge, so the
  two halves can arrive in any order).
- `feature_votes(client_id, feature_id, created_at, PK(client_id, feature_id))` —
  `add` upserts, `remove` deletes, so the tally is always the current vote count.

## Environment variables

**Server**
- `DATABASE_URL` — Postgres connection string (the Coolify Postgres container).
  When unset, the server falls back to in-memory analytics (data lost on restart).
- `ADMIN_TOKEN` — shared secret required by the `/admin` API. If unset, the admin
  API rejects every request.

**Client build** (`packages/client`)
- `VITE_ANALYTICS_URL` — analytics endpoint. Defaults to `http(s)://<host>:3001/analytics`
  (derived from `VITE_WS_URL` if set).

**Admin build** (`packages/admin`)
- `VITE_API_URL` — server base URL. Defaults to `http://localhost:3001`.

## Local development

```bash
# 1. Start Postgres
docker compose up -d

# 2. Run the server against it
DATABASE_URL=postgres://roc:roc@localhost:5432/roc ADMIN_TOKEN=dev bun run server

# 3. Run the game (sends analytics) and the admin dashboard
bun run dev          # game on :5173
bun run dev:admin    # dashboard on :5174  (enter token "dev")
```

## Coolify deployment

- Run Postgres as its own service/container; copy its connection string into the
  server service's `DATABASE_URL`, and set `ADMIN_TOKEN`. Tables are created on
  first boot.
- Build the client with `VITE_ANALYTICS_URL` pointing at the public server origin,
  and the admin app with `VITE_API_URL` pointing at the same server.
