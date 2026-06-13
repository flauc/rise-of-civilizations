# Rise of Civilizations

A turn-based 4X strategy game (Ancient Era → Age of Exploration), Canvas + TypeScript, with a Bun + Postgres multiplayer server. **Design docs live in [`docs/`](docs/PLAN.md).**

## Status: M2 — combat & military ✅

A hotseat 2-player war game (plus AI barbarians):
- **Combat** — HP-based, melee vs. ranged, terrain defense, wounded penalty; units gain **XP**, level up, and pick **promotions**.
- **10 unit classes** — settler, worker, scout, warrior, slinger, archer, spearman (anti-cavalry), swordsman, horseman, catapult (anti-city siege).
- **City siege & capture** — cities have HP/defense and walls; reduce a city to 0 HP and take it with a melee unit.
- **Barbarians** — a hostile AI faction that spawns and raids, auto-running between human turns.
- **Workers** — build farms/mines and roads (roads speed movement); a 12-tech tree gates units & buildings.

Earlier milestones: **M1** added cities, tile yields, movement, fog of war, research, and hotseat turns; **M0** delivered the monorepo, hex math + seeded RNG, the procedural world generator, and the canvas renderer. All built on an authoritative `sim` (commands validated against game state — the same model the M3 server will own).

## Monorepo layout

| Package | What it is |
|---------|-----------|
| `packages/shared` | Pure core: hex math, seeded RNG, map types. No DOM/Node — reused everywhere. |
| `packages/sim` | Deterministic simulation. M0: procedural world generation (noise → terrain). |
| `packages/client` | Canvas + TypeScript game client (Vite). The M0 hex renderer lives here. |
| `packages/server` | Authoritative Bun server (skeleton; built out in M3). |
| `packages/data` | Data-driven content (civs/techs/units/great people) — see `docs/`. Populated M4+. |
| `packages/ai` | Single-player AI opponents (M5). |
| `tools/geodata-poc` | Spike that bakes real-world Natural Earth data into a hex map (PLAN.md §3.1.1). |

## Prerequisites

- **[Bun](https://bun.sh)** 1.3+ (package manager + server runtime).
- On Windows, if `bun` isn't on PATH yet, it's at `%USERPROFILE%\.bun\bin\bun.exe` — open a new terminal or add it to PATH.

## Commands (run from the repo root)

```bash
bun install        # install all workspace deps
bun run dev        # start the client dev server (Vite) -> http://localhost:5173
bun run build      # production build of the client
bun run typecheck  # repo-wide TypeScript check
bun run test       # unit tests (vitest)
bun run server     # start the Bun server skeleton (needs Bun)
```

The client accepts URL params: `?seed=anything&cols=80&rows=56`.

## Controls

- **Pan:** drag (mouse or one finger).
- **Zoom:** mouse wheel, or two-finger pinch.
- Hover a hex to see its coordinates and terrain in the HUD.

## Controls (in-game)

- **Select** a unit/city: click/tap it. **Move:** with a unit selected, click a white reachable tile.
- **Attack:** with a unit selected, click a red-highlighted enemy unit/city in range.
- **Found City** (Settler), **Build** farm/mine/road (Worker), **Promote** (leveled units): buttons in the unit panel.
- **Production/Research:** city panel dropdown / "Research" button. **Pan/zoom:** drag, wheel, or pinch.

## Roadmap

See [docs/PLAN.md §5](docs/PLAN.md). Next up: **M3** — the Bun multiplayer server: auth, lobby, real-time simultaneous turns, Postgres persistence, and server-side fog/order validation.
