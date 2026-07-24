# Rise of Civilizations — Agent Guide

This document is written for AI coding agents. It describes the project structure, technology stack, build/test commands, code conventions, and important architectural boundaries. Always prefer the facts in this file and the linked docs over general assumptions.

- Human-facing overview: [`README.md`](README.md)
- Master design document: [`docs/PLAN.md`](docs/PLAN.md)
- Content design: [`docs/CIVILIZATIONS.md`](docs/CIVILIZATIONS.md), [`docs/TECHNOLOGIES.md`](docs/TECHNOLOGIES.md), [`docs/GREAT-PEOPLE.md`](docs/GREAT-PEOPLE.md), [`docs/ASSETS-AND-DATA-SOURCES.md`](docs/ASSETS-AND-DATA-SOURCES.md)

## Project overview

**Rise of Civilizations** is a turn-based 4X strategy game spanning the Ancient Era to the Age of Exploration (c. 4000 BCE – c. 1550 CE). It runs in the browser, rendered on HTML5 Canvas in TypeScript, with an authoritative Bun + WebSocket + (planned) PostgreSQL multiplayer server.

Current milestone: **M2/M3 complete** — combat, military, territory, barbarians, villages/camps, an original materials-based tech tree, victory conditions, and a playable browser multiplayer server. **M4** (systems width) is in progress.

## Technology stack

- **Language:** TypeScript 5.6+, ES2022 modules.
- **Package manager / runtime:** Bun 1.3+ (workspace root uses Bun).
- **Build tool:** Vite for the browser client.
- **Test runner:** Vitest.
- **Renderer:** HTML5 Canvas 2D (procedural/vector graphics first).
- **Networking:** Bun native `WebSocket`, JSON wire protocol.
- **Persistence:** In-memory in M3; PostgreSQL is the planned persistent store.
- **External geodata tools:** d3-geo + Natural Earth / world-atlas TopoJSON in `tools/geodata-poc` only.

No linter or formatter is currently configured; that is a documented TODO for later milestones.

## Monorepo layout

This is a **Bun workspace** monorepo defined by root `package.json`.

```
rise-of-civilizations/
  package.json              # workspace root + repo-wide scripts
  tsconfig.base.json        # shared TS compiler options
  tsconfig.json             # repo-wide project references + path aliases
  packages/
    shared/                 # Pure, environment-agnostic core
      src/hex.ts            # Axial hex math, pixel conversions, neighbors
      src/rng.ts            # Seeded PRNG (Mulberry32)
      src/map.ts            # GameMap types and helpers
    sim/                    # Deterministic game simulation
      src/game/             # State, commands, combat, economy, movement, etc.
      src/worldgen.ts       # Procedural map generation
      src/noise.ts          # Value noise for terrain
      src/net.ts            # Client/server wire protocol types
    client/                 # Canvas + Vite browser client
      src/main.ts           # Entry: lobby → renderer loop
      src/renderer.ts       # Hex/canvas rendering
      src/input.ts          # Pointer/touch input
      src/session.ts        # LocalSession vs OnlineSession abstraction
      src/lobby-ui.ts       # Lobby UI
      vite.config.ts        # Vite aliases to shared/sim sources
    server/                 # Authoritative Bun WebSocket server
      src/index.ts          # HTTP + WS gateway
      src/lobby.ts          # In-memory lobby/matchmaking
      src/gamehost.ts       # Per-match authoritative host
      src/auth.ts           # Register/login/resume with Bun.password
      src/storage.ts        # Storage interface + in-memory implementation
      smoke.ts              # Live WS end-to-end smoke test
    data/                   # Data-driven content (placeholder, populated M4+)
    ai/                     # AI controller interface + heuristic AI wrapper
  tools/
    geodata-poc/            # Build-time real-world map → hex baker
```

### Package dependencies

- `shared` has **no dependencies** and must stay pure (no DOM, no Node/Bun APIs).
- `sim` depends only on `@roc/shared`.
- `client` depends on `@roc/shared` and `@roc/sim`.
- `server` depends on `@roc/shared` and `@roc/sim`.
- `ai` depends on `@roc/shared` and `@roc/sim`.
- `data` has no dependencies.

Keep this dependency graph acyclic. **Never** import DOM or Node/Bun APIs into `shared` or `sim`.

## Build and run commands

Run these from the repo root:

```bash
bun install          # install all workspace dependencies
bun run dev          # start the Vite client dev server -> http://localhost:5173
bun run build        # production build of the client
bun run preview      # preview the production client build
bun run typecheck    # repo-wide TypeScript check (tsc --noEmit)
bun run test         # run unit tests with vitest
bun run server       # start the Bun multiplayer server -> http://localhost:3001
```

### Server quick checks

```bash
# Start the server on a specific port
PORT=3001 bun run packages/server/src/index.ts

# In another shell, run the live WebSocket smoke test
PORT=3030 bun run packages/server/smoke.ts
```

The client accepts URL query parameters for map setup: `?seed=anything&cols=80&rows=56`.

## Code style and conventions

- **TypeScript strict mode is mandatory.** `tsconfig.base.json` enables `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `noFallthroughCasesInSwitch`, and `isolatedModules`.
- **Module system:** ESNext modules, Bundler module resolution.
- **Path aliases:** `@roc/shared`, `@roc/sim`, `@roc/data`, `@roc/ai` are mapped to each package's `src/index.ts`.
- **File naming:** lowercase kebab or camelCase for source files (e.g. `game.test.ts`, `lobby-ui.ts`).
- **Comments:** inline comments explain *why*, not what. Keep comments concise and accurate.
- **No `any`:** Prefer explicit types. Use `unknown` and narrow when the type is uncertain.
- **Indexed access:** Because `noUncheckedIndexedAccess` is on, array/map index results may be `undefined`. Code uses `!` only where the value is provably present, or checks explicitly.
- **Environment purity:**
  - `packages/shared` and `packages/sim` must remain runnable in the browser, Bun, and Web Workers.
  - Browser-only code lives in `packages/client`.
  - Bun/Node-only code lives in `packages/server`.

## Testing instructions

Tests are co-located with source code as `*.test.ts` files.

```bash
bun run test         # run all tests once
bun run test -- --watch  # watch mode (vitest)
```

Key test files:

- `packages/shared/src/hex.test.ts` — hex math correctness.
- `packages/sim/src/game/game.test.ts` — core game model (movement, founding, research).
- `packages/sim/src/game/combat.test.ts` — combat resolution.
- `packages/sim/src/game/features.test.ts` — villages and barbarian camps.
- `packages/sim/src/game/territory.test.ts` — territory/border logic.
- `packages/sim/src/game/victory.test.ts` — victory conditions.
- `packages/sim/src/game/ai.test.ts` — AI behavior.
- `packages/server/src/server.test.ts` — storage + lobby + game host + fog filtering.

Add or update tests when changing deterministic simulation behavior. The server test runs the lobby/game-host core without Bun's network stack; `smoke.ts` covers the live WebSocket path.

## Architecture overview

### Simulation model

- The game state is held in `GameState` (`packages/sim/src/game/state.ts`).
- All player actions are expressed as `Command` values and applied through `applyCommand(state, cmd, actingPlayerId?)` (`packages/sim/src/game/commands.ts`).
- The server passes `actingPlayerId` to validate simultaneous-turn orders per-owner.
- Turn flow: `beginTurn` refreshes movement/heals/cities, then `endTurn` advances player index and auto-runs barbarian/AI turns.
- Determinism is guaranteed by a seeded PRNG (`packages/shared/src/rng.ts`) and integer-friendly math.

### Networking model

- **Server-authoritative.** Clients send orders; the server validates and broadcasts fog-filtered `PlayerView` snapshots.
- Protocol types live in `packages/sim/src/net.ts` so both client and server share them.
- Fog of war is enforced server-side in `packages/server/src/gamehost.ts` via `viewForPlayer`; clients never receive hidden units/tiles.
- `packages/client/src/session.ts` abstracts `LocalSession` (single-player, runs sim locally) and `OnlineSession` (renders server views and sends orders).

### AI

- `packages/ai` exports an `AiController` interface and a default `HeuristicAi`.
- The actual rules/utility implementation is inside `packages/sim/src/game/ai.ts` so the engine can drive AI without a circular dependency.
- All AI runs on-device; no external APIs are used.

### Maps

- Procedural world generation lives in `packages/sim/src/worldgen.ts`.
- A real-world geodata proof-of-concept lives in `tools/geodata-poc/` and bakes Natural Earth data into a hex map offline.

## Security considerations

- **Password hashing:** The server uses `Bun.password` (`bcrypt`) for register/login.
- **Auth tokens:** Random 32-byte hex session tokens stored in `MemoryStorage`; case-insensitive handles.
- **Order validation:** Every order is validated against the submitting player's ownership and the current game rules. Illegal orders are rejected, never applied.
- **Fog of war:** Server filters the per-player view; do not rely on the client to hide information.
- **Do not commit secrets:** `.env` and `.env.*` are gitignored.
- **External assets:** Prefer public-domain / CC0 sources; record license per asset. See `docs/ASSETS-AND-DATA-SOURCES.md`.

## Art generation

A standalone AI art generator lives in `tools/art-generator/`:

- `tools/art-generator/generate.ts` — CLI that calls Google Gemini Nano Banana 2
  with a prompt + reference tile, then resizes and masks the result with
  ImageMagick.
- `tools/art-generator/config.ts` — asset subsets (terrain, units, buildings,
  improvements, resources, leaders, ui, icons, village-rewards, barbarian-rewards, ages, pillars, heroes), prompt templates, and target sizes.

Typical commands:

```bash
bun run tools/art-generator/generate.ts --unit archer
bun run tools/art-generator/generate.ts --tile forest --size 2K
bun run tools/art-generator/generate.ts --leader rome --size 1K
bun run tools/art-generator/generate.ts --subset leaders
bun run tools/art-generator/generate.ts --subset units
bun run tools/art-generator/generate.ts --subset resources
bun run tools/art-generator/generate.ts --subset improvements
bun run tools/art-generator/generate.ts --subset ages
bun run tools/art-generator/generate.ts --subset pillars
bun run tools/art-generator/generate.ts --subset heroes
bun run tools/art-generator/generate.ts --icon favicon
bun run tools/art-generator/generate.ts --all

# Generate 5 randomized variants per terrain tile and copy to the client
bun run tools/art-generator/generate.ts --subset terrain --variations 5 --size 512
# (then copy assets/generated/tiles/*.png to packages/client/public/hex-terrain/)

# Generate resource icons and copy them to the client
bun run tools/art-generator/generate.ts --subset resources --size 512
# (then copy assets/generated/resources/*.png to packages/client/public/resources/)

# Generate tiered map improvement icons (farm, mine, lumber camp, etc.) and copy to the client
bun run tools/art-generator/generate.ts --subset improvements --variations 5 --size 512
# (then copy assets/generated/improvements/*.png to packages/client/public/improvements/)

# Add extra variants without overwriting the existing base tile
bun run tools/art-generator/generate.ts --tile plains --variations 4 --skip-base --size 512

# Generate UI buttons (next move, skip move, etc.) and copy them to the client
bun run tools/art-generator/generate.ts --subset ui --size 1K
# (then copy assets/generated/ui/*.png to packages/client/public/ui/)

# Generate PWA icons and copy them to the client
bun run tools/art-generator/generate.ts --icon app_icon
# (then copy assets/generated/icons/*.png to packages/client/public/)

# Generate a favicon set and copy it to the client and landing page
bun run tools/art-generator/generate.ts --icon favicon
# (then copy assets/generated/icons/favicon.ico and favicon-*.png to
#  packages/client/public/ and roc-landing-page/public/)

# Generate era/age artwork for the landing page
bun run tools/art-generator/generate.ts --subset ages
# (then copy assets/generated/ages/*.png to roc-landing-page/public/assets/ages/)

# Generate gameplay pillar artwork for the landing page
bun run tools/art-generator/generate.ts --subset pillars
# (then copy assets/generated/pillars/*.png to roc-landing-page/public/assets/pillars/)

# Generate hero banner artwork for the landing page
bun run tools/art-generator/generate.ts --subset heroes
# (then copy assets/generated/heros/*.png to roc-landing-page/public/assets/hero/)

# Generate village reward illustrations and copy them to the client
bun run tools/art-generator/generate.ts --subset village-rewards
# (then copy assets/generated/village_rewards/*.png to packages/client/public/village-rewards/)

# Generate barbarian camp cleared illustration and copy it to the client
bun run tools/art-generator/generate.ts --barbarian-reward barb_camp_cleared
# (then copy assets/generated/barbarian_rewards/*.png to packages/client/public/barbarian-rewards/)

# Generate the whole emoji-icon set (the hand-painted PNGs that replace UI emoji)
bun run tools/art-generator/generate.ts --subset emoji-icons
# Or generate a single new emoji icon (cheaper — regenerate only what you added)
bun run tools/art-generator/generate.ts --emoji-icon ic_flag_planted
# (then copy assets/generated/icons/*.png to packages/client/public/icons/)
```

### Adding a new emoji to the UI (IMPORTANT)

The UI is authored with emoji (🪙, ⚔, 🔬 …), but every emoji is swapped at runtime
for a hand-painted PNG by the emoji→icon bridge in `packages/client/src/icons.ts`
(DOM via the patched `innerHTML` setter, canvas via `drawGlyph`). **Any emoji not
registered in that bridge renders as the raw system emoji, which looks out of place
next to the generated icons.** So whenever you introduce a *new* emoji anywhere in the
client UI you MUST:

1. Add it to `EMOJI_ICON` in `packages/client/src/icons.ts` (`"🚩": "ic_flag_planted"`).
2. Add a matching `[id, description]` entry to `EMOJI_ICON_DEFS` in
   `tools/art-generator/config.ts` (the `id` must equal the value side above).
3. Generate the PNG and copy it in:
   `bun run tools/art-generator/generate.ts --emoji-icon <id>` then copy
   `assets/generated/icons/<id>.png` to `packages/client/public/icons/`.

Until the PNG exists the bridge is self-healing (it falls back to the emoji), so the
code is safe to ship, but the icon looks unfinished — don't consider a new emoji done
until its icon is generated. Prefer reusing an already-registered emoji when one fits.

Leader portraits are generated as a `leader` asset subset and copied from
`assets/generated/leaders/` to `packages/client/public/leaders/` so the Start
Screen can load them.

The client renderer loads all `hex-terrain/<terrain>.png` plus
`<terrain>_1.png` … `<terrain>_4.png` variants and picks one deterministically
per tile coordinate, so maps look less repetitive. It also loads improvement
sprites from `improvements/<kind>_t<tier>.png` plus `_1` … `_4` variants,
picking the correct tier for the tile's improvement level. UI buttons live in
`ui/` and can be used by the HTML/CSS interface as image backgrounds.

It requires `GEMINI_API_KEY` and ImageMagick (`magick`). See
`tools/art-generator/README.md` for setup and customization.

## Deployment notes

- The client is a static Vite build (`dist/`).
- The server is a Bun process. Currently it stores state in memory; a `Storage` interface exists in `packages/server/src/storage.ts` for a future PostgreSQL adapter.
- PWA packaging is implemented: the client has a web app manifest (`packages/client/public/manifest.json`), icons, and an offline-caching service worker (`packages/client/public/sw.js`) registered from `packages/client/src/main.ts`. Native app stores via Capacitor/Tauri are explicitly deferred until the web build is solid.

## Common pitfalls

- `noUncheckedIndexedAccess` means `[0]` on arrays returns `T | undefined`. Code already uses `!` in many places where the value is known; keep the same style.
- `shared` and `sim` must not import Node/Bun/DOM modules. If you need crypto, timers, or storage, do it in the client or server package.
- Civilization definitions (including civilization-specific city names) live in `packages/data/src/index.ts`. Unit/tech/building content is still defined in `packages/sim/src/game/content.ts`.
- `tools/geodata-poc` has its own `package.json` and `node_modules`; it is not part of the Bun workspace and uses npm.
- Never introduce a new emoji in the client UI without registering it in the emoji→icon bridge and generating its PNG — see "Adding a new emoji to the UI" under Art generation. An unregistered emoji renders as the raw system glyph, inconsistent with the generated icon set.

## Learned User Preferences

- Do not commit or push git changes until the user explicitly asks; day-to-day work stays on `dev`; Play/App Store uploads are manual GitHub Actions `workflow_dispatch` runs (`.github/workflows/android.yml`, `.github/workflows/iOS.yml`), not auto on push; push to `main` does not deploy the web client; production web is a separate host deploy from `main`; GitHub Actions secrets go under repository Settings → Secrets and variables → Actions, not profile secrets.
- Treat mobile responsiveness as a first-class requirement for all client UI work; use `isPhoneShell()` / short-edge detection (`viewport-shell.ts`, `roc-phone-shell`) so layout feels consistent across handsets, not just one test device; scrollable lobby/setup panels should pin primary actions (Back, Start Game) in a sticky footer visible without scrolling; native settings hide Delete account; diplomacy lists show each civ's player color; turn-update Locate on cityGrew/productionComplete selects the city and opens tile yields, and omit Locate on informational alerts like civ defeated; city panel anchors just below the top bar on desktop (`--topbar-h`) and top-right under the menu bar on mobile; city-panel hover labels (`#stat-tip`) are desktop-only `(hover: hover) and (pointer: fine)`; reject broad HUD/map scaling on native—prefer targeted Back/X tap targets and layout guards so controls stay on-screen without shrinking the map.
- Modal/dialog consistency: sticky top-right X on every dialog (including scrollable mobile sheets); close only via X or Esc (choose-research also closes when selecting an item); never dismiss on backdrop or outside click. HUD map panels (treasury, morale, log, leaderboard, research, Train Units, turn updates) use `.panel hidden` + `wirePanelClose()` like `#trclose`, not a dim overlay with `.show` opacity/pointer-events CSS that blocks taps; remove stale `.show` rules on those dialog IDs. Only one HUD center panel at a time (opening Treasury/Research/etc. closes peers). Standard headers use `dialogHeader()` / `.roc-dialog-head` in-flow layout (`dialog-close.ts`); legacy pinned ✕ bands remain on empire/settings/combat preview. Other modals use `bindDialogClose()`; header titles/bands use `pointer-events: none` so title text does not steal ✕ taps; in-flow `.dialog-x` is `position: relative` with `::after` centered in the button disc (`img.gi` has `pointer-events: none`); toolbar headers (`roc-dialog-head--toolbar`, Choose Research, Turn Updates) left-align the title, use 12px action gap, and no ✕ bleed (`::before { inset: 0 }`). Empire (cities/units/specialists/trade) and Diplomacy use centered panels without a dim full-screen backdrop and must not hide HUD/topbar chrome; `#save-modal` also keeps nav chrome visible. Game Menu sub-panels (Wiki, Leaderboard, Game Log, God Mode) keep the menu open like Settings. `#game-hud` uses `pointer-events: none`, so open panels must be on the HUD pointer-events allowlist. In-game chat uses a compact docked panel on desktop and a full-screen sheet on mobile/native; close only via X or Esc; closed state is a compact toggle top-left under the leader portrait with an unread badge for other players' messages; chat controls must not use shared `.dialog-x` (steals Send taps).
- In admin and in-game UI, show registered usernames/handles only—never raw account IDs, truncated hashes, or password hashes; keep admin tables clean with per-column filters, Reporting filters behind a Filters toggle, and fully clickable session rows for rich game detail (no separate View link).
- When helping with local environment setup, prefer documenting shell commands over adding new helper files to the repo unless the user asks for a file.
- Hide gated UI (upgrade buttons, wonders, etc.) until the relevant tech is unlocked; use info buttons/dialogs for extra detail rather than showing everything upfront.
- Heuristic AI should play to win: collect villages, city-bombard at war, cap idle settlers (they must found), build naval capacity for overseas expansion, connect cities with road routes via agrimensores, and press city conquest when clearly ahead—including cross-continent invasions after dominating the home landmass; when clearly stronger at war, never offer or accept peace—re-evaluate each turn and pursue total conquest; once cities are well developed, queue world wonders, legends, and great-people projects without skipping early farms, mines, or improvements. AI opponent difficulty mirrors barbarian Easy/Normal/Hard tiers (never None); even on Hard, AI must follow the same rules as human players with no extra leverage.
- Tutorial coach copy should use a friendly, human tone for first-time 4X players and walk them through everything doable in turn 1: unit moves, founding a city, research, Construction, and training a unit; explain barbarians only on first sighting; call AI opponents "enemy" not "AI".
- Governor mode should keep citizens on tiles unless queueing work: train specialists on demand when starting public works and free idle governor-trained specialists each turn (manual +1 picks stay).
- Game over screen: show stats summary, optional full-map explore, and a quit action; pin "Your empire" at the top; final standings use civ portraits with per-player victory progress toggled on row click (second click hides).
- Featured civilization on the lobby/start screen uses a fixed top-to-bottom layout that must not shift when civ content changes; on phones hide the leader portrait image (keep civ text), pin the menu to the top in portrait, and hide the featured-civ panel in landscape so login/actions stay visible.
- Pre-attack combat preview shows likely outcome and modifier breakdown in a two-column layout (unit icons, HP now/after, damage); settings `autoAttack` skips the confirmation dialog.

## Learned Workspace Facts

- Admin analytics UI is a separate Vite app (typically `localhost:5174` or `5175`); it talks to the Bun game server API on `localhost:3001`. Overview is the live dashboard with a Recent games snapshot (no aggregate Game setup table); Reporting has a Filters toggle plus fully clickable session rows with rich per-player drill-down (setup, civs, scores, cities, techs, legends); Games supports setup/player/score drill-down including AI opponents; map size labels use Small/Medium/Large not pixel dimensions; Users tab includes Create user button for admin-provisioned accounts.
- Guest sessions do not persist saved games; registered users are prompted to save on exit and saves survive server restarts; pre-password-validation accounts are grandfathered test users. Registered accounts persist to `.roc-users.json` (or `ROC_USERS_FILE` / `ROC_DATA_DIR`) and to Postgres `roc_users` when `DATABASE_URL` is set (table auto-created via `CREATE TABLE IF NOT EXISTS`, no manual migrations); the server saves on register/delete, every 5 minutes, and on shutdown.
- Map lobby: **Random** is first (rolls full pool); **Continents (1–4)** randomizes landmass count plus fixed One / Two / Three / Four Continent presets; **Inland Sea** is Japan Seto-style (Honshu / Shikoku / Kyushu shores, basin islets, Kanmon and Bungo straits); **Mediterranean** bakes Roman Empire ~384 AD coastlines via `mediterranean-mask.ts`; **Africa / Asia / Europe / North America / South America** bake continent coastlines via `regional-mask.ts` and geodata-poc (`bake-regional-mask.mjs`, `emit-regional-mask-ts.mjs`); regional geodata maps must omit `poleAxis` (`polarCapLand` flood-fills border-connected land and blanks the map); natural-wonder placement on regional layouts uses `map-geo.ts` coordinate masks so wonders spawn in correct lat/lon bands; `generateMap` resolves layout from seed and the client shows it (e.g. `Random → Archipelago`); `findStarts` skips islands below `minViableIslandTiles()` (19 hexes) except on the dedicated **Islands** layout. Village density is None / Medium / High (legacy boolean maps to none/medium); Medium matches the old default count, High places more villages with at least 7 hex spacing.
- Trade routes pay flat base gold (not distance-based), prefer built roads on pathfinding and for tiered road bonuses, support hub routing through owned ports (client names via-cities), and recompute sealed routes when a faster road path appears; multi-tile road routes let players pick endpoints and agrimensores pave one tile at a time. Adjacent military units at war can pillage enemy tile improvements and roads from the unit panel; `previewPillage` shows gold/science payout before confirming. Bankruptcy (`applyUnitUpkeep`): when treasury cannot cover upkeep, Military Pay resets to 0%; non-scout units desert to barbarians (scouts disband); if barbarians are off, units are deleted instead.
- Natural wonders use terrain flags (`openOcean`, `coastalWater`, `coastalFront`); count scales to map size (~8–10 on giant maps) with min 10 hex spacing. Player-built world wonders are fully implemented (9 in `public/wonders/`); research tech, gather crew, build via tile panel; completed wonders render from `tile.wonder` and online `PlayerView` must expose wonder tiles.
- Game loading veil is a parchment scroll with first-person present-tense leader speech (no em dashes); scroll shows the spoken script only (not richer encyclopedia sections); text reveal syncs to pre-baked voice via `loading-sync.ts` (scripts capped at 500 chars in `loading-speech.ts` so clips finish cleanly); map and HUD stay hidden under `body.roc-loading-scroll` until dismiss; veil foot shows "Loading..." until the first map frame paints and the HUD is primed, then reveals Skip (no Turn N banner above the veil); Skip stays hidden until worldgen, first map paint, and HUD wiring are all ready so menu taps work immediately after skip/dismiss; post-speech hold keeps transparent `map-backdrop` (not a solid overlay); hold 3 seconds after speech ends before dismiss (Skip exits immediately); scripts in `packages/data/src/loading-speech.ts`, MP3s pre-baked via `tools/generate-loading-voice.ts` into `public/loading/voice/<civId>.mp3`; each civ maps to a regional ElevenLabs premade voice in `loading-civ-voices.ts` (rebake all with `--force` after voice-map changes; ElevenLabs bake, not live client API); mobile browser loading voice unlocks via shared `game-audio-unlock.ts` on first user tap (Skip or any tap during the veil).
- Tutorial mode uses the smallest pangaea map, one AI, minimal barbarians, and normal speed (`packages/client/src/tutorial.ts`); lobby Tutorial button; first-time skippable prompt. Coach guides turns 1–5 (`TUTORIAL_COACH_TURNS`) bottom-right with UI highlights; speak-then-hide on city/construction/train steps (bubble clears after voice+text, highlight ring stays); turn 3 refreshes movement on map steps, spawns villages within reach, auto-advances when stuck; interaction gate always allows dialog X buttons and keeps HUD/menus fully clickable except on explicit map-target coach steps; portrait at `public/coach/legends/` (`tools/bake-coach-portrait.ts`) else `public/legends/`; coach does not start until portrait loads (`tutorial-coach-portrait.ts` gates the preparing veil); pre-baked MP3 via `tools/generate-coach-voice.ts` (`--force` to regenerate; ElevenLabs, not live client API) with browser-TTS fallback; coach/loading voice on mobile browsers unlock via shared `game-audio-unlock.ts` on first user gesture (tap during loading veil, first tap after game start, or coach bubble tap), bubble tap retries voice if autoplay failed, native Capacitor builds bundle `coach/voice` via `mobile/build-mobile.mjs`; catch-up advances past done steps; waits for loading veil.
- Primary `#endturn` always ends the turn (`#endturn2` is an optional nudge only); peace treaty cooldown blocks re-declaring war and the client should surface `canDeclareWar` feedback. Online `GameHost` waits only on `connectedHumanIds`; empty lobby slots never block progress; Turn N started banner on turn advance (turn 2+); HUD shows "Turn N" beside the trophy and trophy opens Civilization Standings; same-origin tabs share localStorage auth; `GameAbandonScheduler` deletes the game after 5 minutes if all humans disconnect; MP Menu Surrender confirms then `surrender` removes units/cities and returns to lobby; MP broadcasts sequenced `statePatch` deltas (`view-patch.ts`) after opt-in `setFeatures: { deltas: true }`, with full `state` on connect/resync/seq mismatch; local SP runs sim in `sim-worker.ts`; renderer caches static layers in `map-layer-cache.ts` and pan/zoom skips HUD rebuild plus culls off-screen overlay/terrain; map border tiles skip normal terrain sprites; bottom row and left/right extension slots draw live hexUnder* skirts from `public/hex-terrain/map-edge/` via `paintMapEdgeRimSkirts` / `paintMapBottomEdgeSkirts` and `mapEdgeSkirtKind` / `mapBottomEdgeSkirtKind` (void stars on extension slots); bottom hex-under art uses π + flipY in `drawHexUnderOverlay`, with optional screen-space nudge via `MAP_BOTTOM_EDGE_SKIRT_OFFSET_X/Y` applied after rotate/flipY; staggered map shape uses `mapBottomEdgeTerrainSlots` for omitted corners and east ghost on penultimate row; edge overlays are not baked into the terrain cache; villages/barbarians skip border placement; MP host lobby mirrors SP setup (legends toggle, treasury dropdown, per-victory On/Off); SP lobby always opens with 1 AI (count not persisted); Roadmap menu hidden when `ROADMAP_MILESTONES` is empty (`roadmap-data.ts`); MP lobby shows an online leaderboard of each registered player's best completed-game score (`online-leaderboard.ts`), not every run; Tutorial stays in the main lobby, not the MP panel; AI setup uses `ai-difficulty.ts` tiers matching barbarian Easy/Normal/Hard.
- In-game BGM and combat SFX: regional civ tracks mapped in `packages/data/src/civ-bgm.ts` (`audio/background/*.ogg`), played/crossfaded from `packages/client/src/game-sounds.ts` (lobby featured civ + in-game); civ picker region filters and search use the same BGM region chips (`CIV_BGM_FILTER_CHIPS`), not wiki geography; weapon hits in `packages/client/src/combat-audio.ts` under `public/audio/`; building queue cue `audio/building.wav` via `playBuildingSound()`; separate Settings sliders for music and SFX; at 100% music, BGM caps at `HTML_BGM_VOLUME` (0.45) and SFX uses full 1.0 headroom; do not duck BGM for combat/building one-shots (causes audible lag); coach/loading voice only uses duck helpers; native and phone shell use HTML5 Audio (Web Audio on desktop); `.7z`/`.zip` archives must be extracted to plain WAV/OGG/MP3 before bundling.
- Native iOS/Android wrappers live in `mobile/` (Capacitor, bundle `com.riseofcivilizations.game`); thin shell streams from `game.rise-of-civilizations.com`, so deploy the web client before Play/App Store uploads; root `package.json` `"version"` is the single source of truth—`tools/sync-mobile-version.mjs` writes Android `versionName`, iOS `MARKETING_VERSION`, and `packages/client/src/version.ts`; `mobile/build-mobile.mjs` runs sync before every mobile build (CI relies on this, not a separate workflow step); GitHub mobile publish uses manual `workflow_dispatch` in `.github/workflows/android.yml` (Play track: production/internal/alpha/beta) and `.github/workflows/iOS.yml` (optional Submit for App Store review checkbox); CI build numbers via `1000 + run×10 + attempt` (and `GITHUB_RUN_ID`) must exceed the last App Store Connect / Play upload; 12 repository Action secrets in `mobile/README.md`, Play upload service account invited under **Users and permissions** (Google removed the standalone API access page), keystore uploaded as base64 `ANDROID_KEYSTORE_BASE64`; iOS CI via `mobile/scripts/install-ios-signing.sh`: `IOS_CERTIFICATE_BASE64` must be an Apple Distribution `.p12` with private key (Development fails), App Store profile must include that cert (re-download `IOS_PROVISIONING_PROFILE_BASE64` after cert changes); iOS upload (`upload-testflight-build`) and review submit (`submit-app-store-review.sh` with `--app_version` from `package.json`, `skip_app_version_update false`) are separate steps—upload can succeed while deliver fails with *no editable version* if that semver is already live (bump `package.json` higher); script exits 0 with a warning when Waiting for Review or no editable version (new build still lands in TestFlight), set `IOS_REJECT_WAITING_REVIEW=true` to cancel and resubmit or uncheck Submit for App Store review for upload-only; mobile defaults to portrait orientation and `#game` respects safe-area insets; iOS Safari in a browser tab cannot lock orientation—Horizontal/Vertical settings use CSS fallback (`roc-want-landscape` / `roc-want-portrait` in `screen-rotation.ts`); canvas resize in `main.ts` starts when a game begins, not at lobby boot; native lobby uses `body.roc-native.roc-lobby-open #game` canvas passthrough so WebKit taps reach lobby buttons; loading overlay must be removed on dismiss or stuck `roc-loading-scroll` blocks HUD clicks; HUD sheets hide/block with `:has()` on actually open panels, not a stale `body.roc-hud-sheet-open` (MP chat uses `.open`, not `pushHudOverlay`; call `resetHudOverlays()` when a game starts); iOS test builds via `cd mobile && npm run build` then Xcode Run; App Store uploads require Xcode 26+ / iOS 26 SDK (Xcode 16.2 / iOS 18.2 SDK rejected); iOS: `pod install`, open `App.xcworkspace`, set Version/Build (`MARKETING_VERSION` / `CURRENT_PROJECT_VERSION` on App target in `project.pbxproj`), then local `Product → Archive → Distribute App → Upload` (not Xcode Cloud / Review Workflow); `MARKETING_VERSION` synced from root `package.json` must be **strictly higher** than the latest approved or live App Store version (cannot reuse a lower semver after a higher one is on the store); Android: `npm run apk` debug, `npm run bundle:release` → AAB; `versionCode`/`versionName` only in `mobile/android/app/build.gradle` (bump `versionCode` each Play upload); release signing via `mobile/android/key.properties` (gitignored); store screenshots in `tools/store-screenshots/out/appstore/` and `out/playstore/` (13-inch iPad also required if `TARGETED_DEVICE_FAMILY` includes iPad); iOS export compliance: `ITSAppUsesNonExemptEncryption=false` for HTTPS-only WebKit apps—answer encryption as "None of the algorithms..." (claiming standard encryption outside Apple OS + France triggers French ANSSI); do not enable Game Center in App Store Connect unless the Xcode project has the entitlement; Capacitor boots to home (don't reopen saved legal/support WebView URLs); Android splash is solid-color only (no image assets); edge-to-edge via `EdgeToEdge.enable()` in `MainActivity`.
- Client legal pages (`/privacy`, `/terms`, support, delete-account) on `game.rise-of-civilizations.com` require no login; production web builds must set `VITE_BASE=/` so deep-link routes resolve `/assets/` and boot the legal overlay; Play/App Store review checks production legal URLs serve actual policy text, not the game lobby.
- In-game keyboard shortcuts live in `packages/client/src/game-keybinds.ts`: defaults Space (cycle cities), C/U/M/T/J/L/W/O (cities, units, morale, tech tree, legends, standings, wiki, settings); overrides persist in settings and rebind in a collapsible Settings section; Esc and Enter stay reserved.
