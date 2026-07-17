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

- Do not commit or push git changes until the user explicitly asks.
- Treat mobile responsiveness as a first-class requirement for all client UI work; scrollable lobby/setup panels should pin primary actions (Back, Start Game) in a sticky footer visible without scrolling.
- Modal/dialog consistency: sticky top-right X on every dialog; close only via X or Esc (choose-research also closes when selecting an item); never dismiss on backdrop or outside click.
- In admin and in-game UI, show registered usernames/handles only—never raw account IDs, truncated hashes, or password hashes; keep admin tables clean with per-column filters, Reporting filters behind a Filters toggle, and fully clickable session rows for rich game detail (no separate View link).
- When helping with local environment setup, prefer documenting shell commands over adding new helper files to the repo unless the user asks for a file.
- Hide gated UI (upgrade buttons, wonders, etc.) until the relevant tech is unlocked; use info buttons/dialogs for extra detail rather than showing everything upfront.
- Heuristic AI should play to win: collect villages, city-bombard at war, cap idle settlers (they must found), build naval capacity for overseas expansion, connect cities with road routes via agrimensores, and press city conquest when clearly ahead—including cross-continent invasions after dominating the home landmass; when clearly stronger at war, never offer or accept peace—re-evaluate each turn and pursue total conquest; once cities are well developed, queue world wonders, legends, and great-people projects without skipping early farms, mines, or improvements.
- Tutorial coach copy should use a friendly, human tone for first-time 4X players and walk them through everything doable in turn 1: unit moves, founding a city, research, Construction, and training a unit; explain barbarians only on first sighting; call AI opponents "enemy" not "AI".
- Governor mode should keep citizens on tiles unless queueing work: train specialists on demand when starting public works and free idle governor-trained specialists each turn (manual +1 picks stay).
- Game over screen: show stats summary, optional full-map explore, and a quit action; pin "Your empire" at the top; final standings use civ portraits with per-player victory progress toggled on row click (second click hides).
- Featured civilization on the lobby/start screen uses a fixed top-to-bottom layout that must not shift when civ content changes; on phones hide the leader portrait image (keep civ text), pin the menu to the top in portrait, and hide the featured-civ panel in landscape so login/actions stay visible.
- Pre-attack combat preview shows likely outcome and modifier breakdown in a two-column layout (unit icons, HP now/after, damage); settings `autoAttack` skips the confirmation dialog.

## Learned Workspace Facts

- Admin analytics UI is a separate Vite app (typically `localhost:5174` or `5175`); it talks to the Bun game server API on `localhost:3001`. Overview is the live dashboard with a Recent games snapshot (no aggregate Game setup table); Reporting has a Filters toggle plus fully clickable session rows with rich per-player drill-down (setup, civs, scores, cities, techs, legends); Games supports setup/player/score drill-down including AI opponents; map size labels use Small/Medium/Large not pixel dimensions; Users tab includes Create user button for admin-provisioned accounts.
- Guest sessions do not persist saved games; registered users are prompted to save on exit and saves survive server restarts; pre-password-validation accounts are grandfathered test users. Registered accounts persist to `.roc-users.json` (or `ROC_USERS_FILE` / `ROC_DATA_DIR`) and to Postgres `roc_users` when `DATABASE_URL` is set (table auto-created via `CREATE TABLE IF NOT EXISTS`, no manual migrations); the server saves on register/delete, every 5 minutes, and on shutdown.
- Map lobby: **Random** is first (rolls full pool); **Continents (1–4)** randomizes landmass count plus fixed One / Two / Three / Four Continent presets; **Inland Sea** is Japan Seto-style (Honshu / Shikoku / Kyushu shores, basin islets, Kanmon and Bungo straits); `generateMap` resolves layout from seed and the client shows it (e.g. `Random → Archipelago`); `findStarts` skips islands below `minViableIslandTiles()` (19 hexes) except on the dedicated **Islands** layout.
- Trade routes pay flat base gold (not distance-based), prefer built roads on pathfinding and for tiered road bonuses, support hub routing through owned ports (client names via-cities), and recompute sealed routes when a faster road path appears; multi-tile road routes let players pick endpoints and agrimensores pave one tile at a time.
- Natural wonders use terrain flags (`openOcean`, `coastalWater`, `coastalFront`); count scales to map size (~8–10 on giant maps) with min 10 hex spacing; player-built world wonders render from `tile.wonder` and online `PlayerView` must expose wonder tiles.
- Village lobby density is None / Medium / High (legacy boolean maps to none/medium); Medium matches the old default count, High places more villages with at least 7 hex spacing.
- Game loading veil is a parchment scroll with first-person present-tense leader speech (no em dashes); scroll shows the spoken script only (not richer encyclopedia sections); text reveal syncs to pre-baked voice via `loading-sync.ts` (scripts capped at 500 chars in `loading-speech.ts` so clips finish cleanly); map stays hidden until first full render with "Loading..." until worldgen and assets are ready; fixed Skip button; post-speech hold keeps transparent `map-backdrop` (not a solid overlay); hold 3 seconds after speech ends before dismiss (Skip exits immediately); scripts in `packages/data/src/loading-speech.ts`, MP3s pre-baked via `tools/generate-loading-voice.ts` into `public/loading/voice/<civId>.mp3`; each civ maps to a regional ElevenLabs premade voice in `loading-civ-voices.ts` (rebake all with `--force` after voice-map changes; ElevenLabs bake, not live client API).
- Tutorial mode uses the smallest pangaea map, one AI, minimal barbarians, and normal speed (`packages/client/src/tutorial.ts`); lobby Tutorial button; first-time skippable prompt. Coach guides turns 1–5 (`TUTORIAL_COACH_TURNS`) bottom-right with UI highlights; speak-then-hide on city/construction/train steps (bubble clears after voice+text, highlight ring stays); turn 3 refreshes movement on map steps, spawns villages within reach, auto-advances when stuck; interaction gate always allows dialog X buttons; portrait at `public/coach/legends/` (`tools/bake-coach-portrait.ts`) else `public/legends/`; pre-baked MP3 via `tools/generate-coach-voice.ts` (`--force` to regenerate; ElevenLabs, not live client API) with browser-TTS fallback; catch-up advances past done steps; waits for loading veil.
- Primary `#endturn` always ends the turn; secondary `#endturn2` is an optional suggestion nudge (Next Unit, etc.) — the sim never requires using all movement before ending. Peace treaty cooldown blocks re-declaring war after accepting peace; the client should surface `canDeclareWar` feedback instead of silent failure.
- Online turn resolution in `GameHost` only waits on `connectedHumanIds` (human seats with a live WebSocket); empty lobby slots never block end-turn or AI progress.
- Native iOS/Android wrappers live in `mobile/` (Capacitor, bundle `com.riseofcivilizations.game`); thin shell streams from `game.rise-of-civilizations.com`, so deploy the web client before Play/App Store uploads; mobile defaults to portrait orientation and `#game` respects safe-area insets; viewport sync (`beginGameViewportSync` in `viewport-sync.ts`) starts when a game begins, not at lobby boot; native lobby uses `body.roc-native.roc-lobby-open #game` canvas passthrough so WebKit taps reach lobby buttons; loading overlay must be removed on dismiss or stuck `roc-loading-scroll` blocks HUD clicks; iOS test builds via `cd mobile && npm run build` then Xcode Run; App Store uploads require Xcode 26+ / iOS 26 SDK (Xcode 16.2 / iOS 18.2 SDK rejected); iOS: `pod install`, open `App.xcworkspace`, set Version/Build (`MARKETING_VERSION` / `CURRENT_PROJECT_VERSION` on App target in `project.pbxproj`), then local `Product → Archive → Distribute App → Upload` (not Xcode Cloud / Review Workflow); Android: `npm run apk` debug, `npm run bundle:release` → AAB; `versionCode`/`versionName` only in `mobile/android/app/build.gradle` (bump `versionCode` each Play upload); release signing via `mobile/android/key.properties` (gitignored); store screenshots in `tools/store-screenshots/out/appstore/` and `out/playstore/` (13-inch iPad also required if `TARGETED_DEVICE_FAMILY` includes iPad); iOS export compliance: `ITSAppUsesNonExemptEncryption=false` for HTTPS-only WebKit apps—answer encryption as "None of the algorithms..." (claiming standard encryption outside Apple OS + France triggers French ANSSI); do not enable Game Center in App Store Connect unless the Xcode project has the entitlement; Capacitor boots to home (don't reopen saved legal/support WebView URLs); Android splash is solid-color only (no image assets); edge-to-edge via `EdgeToEdge.enable()` in `MainActivity`.
- Client legal pages (`/privacy`, `/terms`, support, delete-account) on `game.rise-of-civilizations.com` require no login; production web builds must set `VITE_BASE=/` so deep-link routes resolve `/assets/` and boot the legal overlay; Play/App Store review checks production legal URLs serve actual policy text, not the game lobby.
