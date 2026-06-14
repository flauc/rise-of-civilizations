# Rise of Civilizations

A turn-based 4X strategy game (Ancient Era → Age of Exploration), Canvas + TypeScript, with a Bun + Postgres multiplayer server. **Design docs live in [`docs/`](docs/PLAN.md).**

## Status: M2 — combat & military ✅

Single-player **vs a local AI opponent** (and AI barbarians), plus real-time **browser multiplayer**:
- **Combat** — HP-based, melee vs. ranged, terrain defense, wounded penalty; units gain **XP**, level up, and pick **promotions**.
- **~29 units across roles & eras** — from clubmen, javelineers and slingers to hoplites, war chariots, horse archers, cataphracts, legionaries, war elephants and siege engines; some available at once, others unlocked by tech.
- **Original, materials-based tech tree** (~33 techs: knapping → smelting → bronze alloying → iron bloomery → carburizing, torsion engines, equestrianism…) — not a Civ clone.
- **Territory** — cities claim land on founding and their borders grow with population; only owned tiles are worked.
- **Tribal villages & barbarian camps** — explore to find villages (random perks: free tech, gold, citizens, units, promotions… or an ambush) and camps that spawn raiders and reward you for clearing them.
- **10 playable civilizations** — Rome, Egypt, Greece, Han China, Persia, Maurya, Mali, Aztec, Mongols, Norse — each with a unique ability that actually changes play (free buildings, yield bonuses, cavalry movement, combat bonuses…).
- **Game setup & UI** — choose your civ, map size, AI opponents and barbarians; minimap, research progress, combat-odds preview on hover, and a victory/defeat screen.
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
| `packages/server` | Authoritative Bun WS server: auth, lobby, simultaneous-turn game host, fog-filtered broadcasts (M3). |
| `packages/data` | Data-driven content (civs/techs/units/great people) — see `docs/`. Populated M4+. |
| `packages/ai` | On-device AI: `AiController` interface + `HeuristicAi` (rules-based, no API). |
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
bun run server     # start the Bun multiplayer server (http://localhost:3001)
```

Multiplayer server quick check: `bun run packages/server/src/index.ts`, then in another
shell `PORT=3030 bun run packages/server/smoke.ts` runs a 2-client over-the-wire test.

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

## Main menu

The game opens on a **Start Screen** with three options:
- **Single Player** — choose your civilization, map size (Small / Medium / Large / Huge / Giant), number of AI opponents, and barbarian intensity, then start a local game.
- **Multiplayer** — connect to a Bun server, register or log in, then create or join a lobby.
- **Load Game** — resume a single-player save stored in your browser's IndexedDB.

Each sub-screen has a **Back** button to return to the Start Screen, and form choices are remembered while you navigate.

## Saving and loading

- Games are saved to your browser's **IndexedDB**, so saves stay on the machine that created them.
- **Single-player:** open the in-game **Menu** (☰) to save, or click **Load Game** from the main menu to resume a saved single-player game.
- **Multiplayer:** only the **host** can save or load. The host opens the Menu, saves the full authoritative state locally, and can later load that save back into the same server game. Other players receive the restored state automatically.

## Roadmap

See [docs/PLAN.md §5](docs/PLAN.md). Next up: **M3** — the Bun multiplayer server: auth, lobby, real-time simultaneous turns, Postgres persistence, and server-side fog/order validation.
