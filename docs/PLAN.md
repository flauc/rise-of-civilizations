# Rise of Civilizations — Master Plan

A turn-based 4X strategy game (a "Civilization" clone) spanning the **Ancient Era → Age of Exploration** (c. 4000 BCE – c. 1550 CE). Browser-first, playable on desktop and mobile, rendered on HTML5 Canvas in TypeScript, with a Bun + PostgreSQL authoritative server for multiplayer. Simple graphics, deep gameplay.

### Design docs
- **[CIVILIZATIONS.md](CIVILIZATIONS.md)** — full 70+ civ roster (leader, ability, unique unit/infrastructure, bias).
- **[TECHNOLOGIES.md](TECHNOLOGIES.md)** — the 85-tech science tree (prereqs, unlocks, eurekas) + civics summary.
- **[GREAT-PEOPLE.md](GREAT-PEOPLE.md)** — Great People rosters by class + the Legends (heroes) roster.
- **[ASSETS-AND-DATA-SOURCES.md](ASSETS-AND-DATA-SOURCES.md)** — where map geodata & free art/audio come from, with licenses.

---

## 1. Design Pillars

1. **Deep systems, simple surface.** Vector/procedural graphics keep the download tiny; the depth lives in the rules, not the pixels.
2. **History from clay to caravel.** The whole arc is the *pre-modern* world. No tanks, no gunpowder dominance — the late game peaks at early firearms, ocean-going ships, and gunpowder siege.
3. **Characters, not chess pieces.** Units have classes, promotions, named veterans, and "Great People" who are genuine characters with abilities — not just "warrior / archer."
4. **Many peoples.** 60+ playable civilizations from every inhabited continent, each with a unique unit, unique infrastructure, and a civ ability.
5. **Play anywhere, anytime.** Real-time *or* asynchronous ("play-by-cloud") multiplayer so a mobile player can take a turn over breakfast.
6. **Server-authoritative & cheat-resistant.** The client renders and sends orders; the server owns the truth.

---

## 2. Scope: Eras & Timeline

The game is divided into **five eras**. Each era gates technologies, units, buildings, and government types.

| Era | Rough dates | Flavor highlights |
|-----|-------------|-------------------|
| **Stone / Dawn** | 4000–3000 BCE | Tribes, settling, slings & clubs, first cities |
| **Bronze** | 3000–1200 BCE | Chariots, bronze arms, writing, ziggurats, early empires |
| **Iron / Classical** | 1200 BCE–500 CE | Legions, phalanxes, roads, philosophy, great empires |
| **Medieval / Faith** | 500–1300 CE | Knights, castles, cathedrals, universities, organized religion |
| **Exploration** | 1300–1550 CE | Caravels & galleons, gunpowder, banking, printing, global trade |

A "score / time limit" game ends at a configurable turn cap inside the Exploration era; victory can be claimed earlier.

---

## 3. Core Game Design

### 3.1 Map & Terrain
- **Hex grid** (preferred over square: cleaner movement, ranged, and adjacency math). Pointy-top hexes, axial coordinates `(q, r)`.
- **Two map sources, both from the start:**
  1. **Procedural** — generated server-side from a seed (reproducible, validatable, tiny to transmit). Tunable continents/Pangaea/archipelago, sea level, climate bands.
  2. **Real-world geodata maps** — *the World, a continent, or a region built from actual Earth geography* (see §3.1.1). Ships curated presets (Earth, Mediterranean, the Americas, East Asia, Europe) **and** lets us rasterize any region on demand.
- **Terrain types:** Ocean, Coast, Lake, River (edge feature), Plains, Grassland, Desert, Tundra, Snow, Forest, Jungle, Marsh, Hills, Mountains (impassable / adjacency bonus), Floodplains, Oasis.
- **Resources:**
  - *Bonus* (food/production): Wheat, Rice, Maize, Cattle, Sheep, Deer, Fish, Crabs, Bananas, Stone.
  - *Luxury* (happiness/amenities): Wine, Incense, Silk, Spices, Dyes, Furs, Ivory, Pearls, Salt, Tea, Cocoa, Citrus, Tobacco, Silver, Gold (lux).
  - *Strategic* (unlock units): Copper, Tin (→ Bronze), Horses, Iron, Saltpeter (Exploration gunpowder), War Elephants/ivory range.
- **Tile yields:** Food, Production, Gold, plus tile-worked Science/Culture/Faith via buildings & improvements.
- **Improvements (built by Workers):** Farm, Pasture, Plantation, Mine, Quarry, Lumber Mill, Camp, Fishing Boats, Road, Fort, Trading Post, Terrace Farm (civ), Polder (civ), etc.

### 3.1.1 Real-world maps from geodata (d3 / Natural Earth)
We can build playable Earth/continent/region maps from **open vector geodata** rather than hand-painting them, then bake the result into our hex format.

- **Data sources (all small & open):**
  - **Natural Earth** via the `world-atlas` / `topojson` packages — land, coastline, and country polygons. The 110m land file is only ~100 KB; 50m for regional zoom. Easily within the download budget.
  - Optional low-res **biome/climate** classification (Köppen) or an elevation tile to seed terrain; if we'd rather avoid the extra payload, we approximate biomes from **latitude + coastal distance** heuristics.
- **Pipeline (offline build step, in `tools/`):**
  1. Pick a region + **d3-geo projection** (equirectangular for the whole world; a regional projection — e.g. conic — for continents) and a hex resolution.
  2. For each hex, take its center lon/lat and test **`d3.geoContains(landPolygons, [lon, lat])`** → land vs ocean. Coast = land hex adjacent to ocean.
  3. Assign terrain by **latitude band + elevation/biome sample + coastal distance** (e.g. equatorial+wet → Jungle, mid-latitude → Grassland/Forest, subtropical-dry → Desert, high-latitude → Tundra/Snow, high elevation → Hills/Mountains). Rivers traced from coastline/elevation or a curated river layer.
  4. Place **resources & historical start positions** with a curated overlay (so Egypt starts on the Nile, etc.) layered on the procedural resource scatter.
  5. **Bake to our compact hex map format** (the same format procedural maps use) → the runtime never ships d3 or GeoJSON; it just loads a small baked map. d3 lives only in the build tool.
- **Why this is a clean fit:**
  - Keeps the runtime tiny — geodata processing is build-time, output is our normal map blob.
  - Same downstream code path as procedural maps (renderer/sim don't care how a map was made).
  - Lets us ship **curated historical presets** (Earth, Mediterranean, Americas, Europe, East Asia) and a tool to generate new regions later.
- **Curated layer on top:** named-region presets can hand-tune start bias, resources, and city-state spots for a more "historical" scenario feel, satisfying the *historically grounded* tone.
- **Concrete sources & licenses** (Natural Earth, world-atlas TopoJSON, DEM, biome data): see `docs/ASSETS-AND-DATA-SOURCES.md`.
- ✅ **Proven:** a working spike in `tools/geodata-poc/` already bakes the real Natural Earth land file into a recognizable Earth hex map (land/ocean + placeholder terrain). See its README for what's real vs. still placeholder (terrain biome, equal-area projection, output compaction).

### 3.2 Turn Model — *real-time simultaneous (primary), with async support*
- **Launch/primary mode: real-time simultaneous ("WeGo").** All players are online together; everyone plans and issues orders during the turn under a **shared turn timer**. When all players hit "end turn" (or the timer expires) the server resolves every player's orders in a deterministic order and advances. This is the mode we build and tune first (M3).
- This scales far better than strict sequential turns for 4–12 players and keeps sessions moving on mobile.
- **Combat between two human players** in the same turn is resolved by submission order with a documented, deterministic tie-break, plus an optional brief **"combat lock" sub-phase** so simultaneous attacks resolve fairly (the trickiest fairness problem — gets its own design doc before M3).
- **Asynchronous / play-by-cloud:** the *same* simultaneous engine, but a game can be flagged async with a long per-turn deadline (e.g. 24h). The server notifies (push/web-push/email) when the turn is ready. State lives in Postgres; nobody needs to be online at once. Shipped right after the real-time path since it reuses the same resolution code.
- **Hotseat / single-player vs AI** uses the same engine with a local server loop.

### 3.3 Economy / Yields
Per-city and per-empire ledgers:
- **Food** → city growth (population) & settlers.
- **Production** → units, buildings, wonders.
- **Gold** → empire-wide treasury; buy units/buildings, upgrade, maintenance, bribes.
- **Science** → tech tree progress (empire pool).
- **Culture** → civic tree progress + border expansion + tourism (culture victory).
- **Faith** → religion: prophets, missionaries, holy buildings, faith-purchases.
- **Amenities / Happiness** → from luxuries & buildings; unhappiness penalizes growth & combat; revolt at extremes.
- **Maintenance:** units, buildings, and roads cost gold/turn — forces real economic trade-offs.

### 3.4 Cities
- Found with a **Settler**; city works tiles within a radius (grows from 1 → 3 rings).
- **Population** assigned to worked tiles or **specialist slots** (Scientist, Merchant, Artist, Priest, Engineer) in buildings.
- **Districts/quarters (lightweight):** city can dedicate quarters — Military (barracks/walls), Sacred (temples), Campus (library/university), Market, Harbor, Theater. Keeps the Civ-VI feel without heavy art.
- **Buildings:** Granary, Library, Market, Temple, Barracks, Walls, Aqueduct, Amphitheater, University, Bank, Cathedral, Harbor, Lighthouse, Workshop, Forge, Shipyard, Bazaar, Observatory, etc.
- **City defense:** walls give HP + ranged strike; cities can be besieged & captured (not always razed).
- **Loyalty/unrest:** distant or recently conquered cities can flip if loyalty drops — discourages infinite blob expansion.

> 📄 **Full tech tree (85 techs, prereqs, eurekas) + civics summary:** [TECHNOLOGIES.md](TECHNOLOGIES.md)

### 3.5 Technology & Civics (two parallel trees)
- **Tech tree** (Science): ~80–100 techs across 5 eras. Unlocks units, buildings, improvements, wonders. Examples: Pottery, Animal Husbandry, Bronze Working, Writing, Wheel, Iron Working, Masonry, Mathematics, Currency, Construction, Engineering, Optics (ocean travel), Machinery (crossbow), Castles, Banking, Astronomy, Printing Press, Gunpowder, Cartography, Sailing→Caravels→Galleons.
- **Civics tree** (Culture): governments & policies. Governments: **Chiefdom → Despotism / Republic → Oligarchy / Classical Republic → Monarchy / Theocracy → Merchant Republic**, each with policy-card slots (Military, Economic, Diplomatic, Wildcard). Policies are swappable, enabling build-your-own playstyle.
- **Wonders:** world wonders (one per game) + national wonders. Pyramids, Hanging Gardens, Great Library, Colossus, Oracle, Great Lighthouse, Terracotta Army, Petra, Hagia Sophia, Alhambra, Forbidden City, Notre Dame, University of Sankoré, Machu Picchu, Borobudur, Angkor Wat, etc.

### 3.6 Units & "Characters"
> 📄 **Full Great People rosters + Legends (heroes) roster:** [GREAT-PEOPLE.md](GREAT-PEOPLE.md)

The roster is intentionally rich. Units have: a **class**, **combat strength**, **movement**, **range**, **abilities**, **XP/promotions**, and can earn a **veteran name**.

**Civilian / Support characters**
- **Settler / Founder** — establishes cities.
- **Worker / Laborer** — builds improvements (charge-based).
- **Scout / Pathfinder / Explorer** — vision, ignores terrain cost, finds ruins/huts.
- **Trader / Caravan** — establishes trade routes (gold/science/food); vulnerable to raiders.
- **Missionary / Apostle / Inquisitor** — spread or defend religion; apostles can debate (religious combat).
- **Envoy / Diplomat** — influence city-states / minor powers.
- **Spy / Agent** — steal tech/gold, sabotage, counter-intelligence (Exploration era).
- **Military Engineer** — roads, forts, siege support, can repair.
- **Naval Explorer** — early ocean crossing.

**Great People** (finite, earned via specialist points — true named characters with one-shot or passive powers)
- **Great General** (Strategos / Khan / Legate) — combat aura + can build a Citadel.
- **Great Admiral** — naval aura, heal at sea, extra movement.
- **Great Scientist** (Scholar / Astronomer / Philosopher) — free tech / science burst / eureka.
- **Great Engineer** (Architect / Artisan) — wonder production, free building, fortifications.
- **Great Merchant** — gold/trade bonus, acquire luxuries, establish trade post.
- **Great Prophet** — *founds a religion*, defines its beliefs.
- **Great Writer / Artist / Musician** — Great Works (culture & tourism).
- **Great Statesman / Lawgiver** — bonus policy slot / instant civic.

**Hero units — "Legends" (a core feature)** — historical figures as powerful, limited unique characters that are central to the game's identity. Each Legend has:
- A **recruitment path** (earned via faith/culture/great-people points, wonders, or quests), so heroes are a strategic resource, not guaranteed.
- **Signature abilities** (e.g. Sun Tzu boosts nearby unit XP & grants a free promotion; Hannibal gets crossing/ambush bonuses; Joan of Arc rallies and heals; Genghis Khan supercharges cavalry; Mansa Musa pumps trade gold; Imhotep accelerates wonders).
- A **lifespan / cooldown** (heroes can expire or need recharging) to keep them precious and prevent snowballing.
- **Quests & rivalries** that tie into the world (free a city, win a battle, found a religion).
- Roster spanning all regions & eras: Hammurabi, Cyrus, Leonidas, Alexander, Hannibal, Boudica, Ashoka, Sun Tzu, Qin Shi Huang, Saladin, Genghis Khan, Tomoe Gozen, Joan of Arc, Mansa Musa, Pachacuti, Gilgamesh, Imhotep, and more.
- Still **toggleable off** per game for purists, but on by default and balanced as part of the core loop.

**Military — combined arms with class identity**
- *Melee infantry:* Warrior → Spearman → Swordsman → Man-at-Arms (+ civ uniques: Hoplite, Legionary, Immortal, Huscarl, Samurai, Jaguar Warrior).
- *Anti-cavalry:* Spearman → Pikeman (bonus vs mounted).
- *Ranged:* Slinger → Archer → Composite Bowman → Crossbowman → Longbowman.
- *Skirmishers:* Javelineer / Peltast (hit-and-run).
- *Light cavalry:* Horseman → Horse Archer → Hussar (+ Mangudai, Cossack).
- *Heavy cavalry:* Companion Cavalry → Cataphract → Knight → Lancer → Conquistador.
- *War beasts:* War Elephant, Camel Archer, War Dogs.
- *Chariots:* Light Chariot → Heavy / Scythed Chariot.
- *Siege:* Battering Ram → Catapult → Ballista → Trebuchet → Bombard (gunpowder).
- *Gunpowder (Exploration):* Arquebusier / Musketeer; early field Cannon.
- *Naval:* Galley → Bireme/Trireme → Quinquereme/Dromon → Longship → War Junk → Galleass → **Caravel → Galleon** (the late-game ocean enablers).
- *Support:* Medic, Standard Bearer, Supply Train, Siege Tower (attaches to melee).

**Promotion / veterancy system**
- Units earn **XP** from combat. At thresholds they pick **promotions** from trees:
  - *Melee:* Shock (vs open), Drill (vs rough), Charge, Formation, Cover.
  - *Ranged:* Accuracy, Barrage, Volley, Garrison.
  - *Cavalry:* Pursuit, Flanking, Caparison.
  - *Naval:* Boarding, Bombardment, Coastal Raider, Wolfpack.
  - *Universal:* Medic, March (heal while moving), Logistics (extra attack), Morale.
- Veteran units get a **generated name & rank** ("The IX Legion 'Hispana'"), creating attachment.

### 3.7 Combat
- **Combat strength** model with modifiers: terrain, fortification, flanking, support, river crossing, health, promotions, great-general aura, era diff.
- **Ranged units** strike without taking retaliation; **melee** trades damage.
- **Zone of control**, **flanking bonuses**, **city sieges** (walls absorb, must be ground down by siege).
- **Combat is HP-based** (units have hit points; not one-shot) → tactical depth, retreats, healing.

### 3.8 Religion
- A **Great Prophet** founds a religion → choose a Pantheon belief + Founder/Follower/Enhancer beliefs.
- Spread via **Missionaries/Apostles**, pressure from holy cities, and trade routes.
- **Theological combat** between apostles. Religious victory path = dominant religion worldwide.

### 3.9 Culture & Tourism
- Great Works fill slots in Amphitheaters/Museums/Wonders.
- **Tourism** accumulates against other civs' culture → **Culture victory** when you're "influential" over everyone.

### 3.10 Diplomacy & Trade
- **City-states / minor powers** (independent cities you befriend via envoys for bonuses).
- Player diplomacy: open borders, declarations of friendship, defensive pacts, denouncements, formal war/peace, trade deals (gold, resources, cities, tech in Exploration era).
- **Trade routes** (caravans/cargo ships) generate yields and spread religion/culture; can be **plundered**.
- **Casus belli** system: warmongering penalties reduced if you have justification (liberation, holy war, reconquest).

### 3.11 Victory Conditions
1. **Domination** — control every original capital.
2. **Science** — reach the pinnacle pre-modern achievement (e.g. complete the great voyages / circumnavigation + a capstone wonder). *(Adapted since there's no space race in this era.)*
3. **Culture** — be tourism-dominant over all rivals.
4. **Religious** — your religion is dominant in every civ.
5. **Economic / Trade** — control a target share of world trade & treasury (fits the Age of Exploration finale).
6. **Score** — highest score at turn limit.

### 3.12 Civilizations (target roster — 70+)
> 📄 **Full roster with leader, ability, unique unit & infrastructure for every civ:** [CIVILIZATIONS.md](CIVILIZATIONS.md)

Each civ ships with: **Leader** (with an agenda/trait), **Civ Ability**, **Unique Unit**, **Unique Infrastructure** (building/improvement), and a **start bias**. Phase 1 ships ~10; the rest land incrementally (data-driven, so adding a civ is a JSON entry + a unit/ability hook).

**Mesopotamia & Near East:** Sumer, Akkad, Babylon, Assyria, Hittites, Elam, Phoenicia, Lydia.
**Persia & Iran:** Median, Achaemenid Persia, Parthia, Sassanid Persia.
**Egypt & Africa:** Egypt, Kush/Nubia, Carthage, Aksum, Ethiopia, Mali, Ghana, Songhai, Great Zimbabwe, Kanem-Bornu.
**Mediterranean & Europe:** Minoans, Mycenaean Greece, Athens, Sparta, Macedon, Etruscans, Rome, Celts/Gauls, Byzantium, Norse/Vikings, Franks, Goths, Anglo-Saxon England, Kingdom of France, Castile/Spain, Portugal, Venice, Genoa, Dutch Republic, Holy Roman Empire/Germany, Kievan Rus, Poland-Lithuania, Hungary.
**Central, South & East Asia:** Zhou/Qin/Han China, Tang/Song China, Ming China, Maurya India, Gupta India, Chola, Japan, Goryeo/Joseon Korea, Tibet, Dai Viet, Khmer, Srivijaya, Majapahit, Pagan (Burma), Ayutthaya (Siam).
**Steppe & Turkic:** Scythians, Xiongnu, Huns, Göktürks, Seljuks, Mongols, Timurids, Ottomans.
**The Americas:** Olmec, Maya, Zapotec, Teotihuacan, Toltec, Aztec, Inca, Muisca, Mississippian (Cahokia), Haudenosaunee (Iroquois), Pueblo.
**Oceania:** Polynesia, Māori, Hawaii.

*Example detailed entries:*
- **Rome** — Ability *"All Roads Lead to Rome"* (free roads between cities, trade-route range +). UU: **Legionary** (can build forts/roads). UI: **Roman Road / Bath**. Leader: Trajan/Caesar.
- **Mongols** — Ability *"Örtöö"* (cavalry +movement, gain combat strength from envoys/spies). UU: **Keshig / Mangudai** (mounted ranged, hit-and-run). UI: **Ordu** (stable district). Leader: Genghis/Kublai.
- **Mali** — Ability *"Sahel Merchants"* (gold from desert/trade). UU: **Mandekalu Cavalry**. UI: **Suguba** (cheap purchases). Leader: Mansa Musa.
- **Inca** — Ability *"Mit'a"* (work mountains, mountain adjacency). UU: **Warak'aq** (slinger). UI: **Terrace Farm**. Leader: Pachacuti.
- **Egypt** — Ability *"Iteru"* (bonus building on rivers/floodplains, wonder production). UU: **Maryannu Chariot Archer**. UI: **Sphinx**. Leader: Hatshepsut/Ramesses.

---

## 4. Technical Architecture

### 4.1 Monorepo layout
```
rise-of-civilizations/
  packages/
    shared/      # TS types, game rules constants, hex math, RNG, serialization (used by client AND server)
    sim/         # deterministic game simulation: state, command processing, resolution
    client/      # canvas renderer, input, UI, netcode client (browser)
    server/      # Bun: websocket gateway, matchmaking, game host loop, persistence
    data/        # JSON/TS data: civs, units, techs, buildings, terrain, beliefs (data-driven)
    ai/          # single-player / fill AI (runs server-side or in a worker)
  docs/
    PLAN.md
  tools/         # map preview, balance spreadsheets, data validators
```
- **Bun workspaces** (or pnpm) for the monorepo. `shared` + `sim` are pure TS with **no DOM and no Node/Bun APIs** so they run identically in browser, Bun, and a Web Worker.

### 4.2 Client — rendering & input
- **Canvas 2D** to start (broadest device support, simplest). Architect the renderer behind an interface so a **WebGL/WebGPU** batched backend can replace it later if perf demands.
- **Render approach for "tiny download":** graphics are **procedural/vector** — hexes, units, and improvements are drawn from code (paths, polygons, gradients) and/or a **single small generated sprite atlas baked at build time or first load**. No multi-megabyte art packs up front. Icons can be a compact SVG/font set.
- **Camera:** pan/zoom with culling (only draw visible hexes). Dirty-rectangle / layered canvases (terrain layer cached to an offscreen canvas, units/UI on top) to keep mobile framerates up.
- **Game loop:** `requestAnimationFrame` for render; simulation is event/turn-driven, not per-frame.
- **Input abstraction:** unified pointer events → works for mouse, touch, pen. Mobile UX: tap-to-select, tap-to-move, long-press context, pinch-zoom, edge-pan, large touch targets, bottom-sheet panels. Responsive layout (portrait & landscape).
- **State:** an **ECS-lite** or normalized store for entities; the renderer reads from the authoritative client mirror of game state.
- **PWA:** installable, offline shell, service-worker caching so repeat loads are instant.

### 4.3 Graphics / asset budget (the "no big download" requirement)
- **Initial bundle target: < ~1.5 MB gzipped** (code + minimal atlas + fonts).
- Code-split by route/phase: **menu/lobby chunk** loads first; the **heavy sim + in-game renderer** chunk loads when a match starts (with a progress bar). The map/data for a specific match streams from the server.
- Game data (civs/units/techs) is JSON, fetched per-match and cached.
- Optional higher-fidelity art packs are **lazy, opt-in downloads** post-MVP — never required to play.

### 4.4 Networking model — *server-authoritative state sync*
- **Transport:** WebSocket (Bun's native WS). Binary frames (e.g. MessagePack or a compact custom schema) for state/orders.
- **Authority:** the **server owns the simulation**. Clients send **orders/commands** ("move unit 42 to (q,r)", "set city production", "research X"). Server validates against the authoritative `sim` state and rejects illegal orders → cheat-resistant.
- **Why not lockstep/deterministic P2P:** turn-based + server-authoritative is simpler, robust to disconnects, and naturally supports async play. We still keep `sim` **deterministic** (seeded RNG, integer math where possible) so the server can run it and clients can *predict* locally for snappy UI.
- **Sync:** server sends **state deltas** per resolved turn (and incremental order acks during a turn). Reconnect → server sends a full snapshot. Fog of war is enforced server-side: a client only receives what its civ can see (also prevents map-hacking).
- **Prediction:** client optimistically applies its own legal orders for responsiveness, reconciles on server confirmation.

### 4.5 Server — Bun
- **Bun HTTP + WebSocket** server. Responsibilities:
  - **Auth** (sign-up/login, JWT/session; optional OAuth later).
  - **Lobby & matchmaking** (create/join game, ready-up, settings: map size, # players, civs, era pace, async on/off).
  - **Game host loop:** one logical "game host" per active match holds the in-memory authoritative `sim` state, processes incoming orders, resolves turns, persists snapshots.
  - **Persistence:** write state to Postgres each turn (and on demand) so games survive restarts and power async play.
  - **AI driver:** for empty slots / single-player, runs the `ai` package server-side.
  - **Notifications:** "it's your turn" via WebSocket if online, push/web-push/email if not (async games).
- **Scaling:** each match is independent → horizontally scalable. Start single-process; later shard matches across worker processes/instances with a router keyed by `gameId`. Heavy turn resolution can run in a **worker thread** to avoid blocking the gateway.

### 4.6 Database — PostgreSQL
Core tables (sketch):
```
users(id, handle, email, pass_hash, created_at, ...)
games(id, name, status, settings_json, map_seed, current_turn, is_async, turn_deadline, created_at)
game_players(game_id, user_id, slot, civ_id, is_ai, is_alive, score, last_seen, has_submitted_turn)
game_snapshots(game_id, turn, state_blob, created_at)         -- compact binary/jsonb authoritative state
game_orders(game_id, turn, player_slot, order_blob, received_at)  -- audit log / replay / dispute resolution
chat_messages(game_id, user_id, body, created_at)
sessions(token, user_id, expires_at)
```
- **Authoritative state** stored as a compact blob (`bytea`/`jsonb`) per snapshot; we don't need full relational modeling of every unit for the live sim (it lives in memory), but we **keep an order log** for replays, debugging, and dispute resolution.
- Indices on `(game_id, turn)`, player lookups, and "games awaiting my turn."
- Migrations via a lightweight tool (e.g. `drizzle`/`kysely`/raw SQL files). Use a typed query builder for safety.

### 4.7 Shared determinism & anti-cheat
- All randomness flows through a **seeded PRNG** in `shared`. Same seed + same orders ⇒ same outcome.
- Server is the only authority that advances `sim`; clients can run the identical `sim` for prediction but never dictate results.
- Fog-of-war filtering happens server-side per recipient.

---

## 5. Roadmap / Milestones

The strategy is **vertical slice first**, then widen. Each milestone is playable.

**M0 — Foundations (skeleton)** ✅ *done*
- ✅ Monorepo (Bun workspaces) with `shared`/`sim`/`client`/`server`/`data`/`ai`, TS strict, Vite, vitest.
- ✅ `shared`: hex math (axial + odd-r offset, pixel conversions), seeded RNG, map types — unit-tested.
- ✅ `sim`: procedural world generation (fractal value-noise → terrain + coasts).
- ✅ `client`: canvas renders a pannable/zoomable hex grid on desktop + mobile (drag pan, wheel/pinch zoom, hover readout). Build ~4 KB gzipped.
- ⏳ Remaining for later: lint/format config + CI.

**M1 — Single-player vertical slice (no server yet)** ✅ *done*
- ✅ Map generation from a seed, in `sim`.
- ✅ Found a city with a Settler; auto-worked tiles; yields (food/prod/gold/science), growth.
- ✅ Units move on the grid with movement points (Dijkstra reachable) & per-player fog of war.
- ✅ 6-tech tree with prereq gating; city production of units & buildings (Granary/Library).
- ✅ Hotseat 2-player turn flow (authoritative `sim` with validated commands — the M3 server model).
- Verified end-to-end through the real UI (found city, move, research, end-turn fog switch).

**M2 — Combat & depth** ✅ *done*
- ✅ HP-based combat (deterministic damage), melee vs ranged, terrain defense, wounded penalty, advance-after-kill.
- ✅ 10 unit types across classes (settler/worker/scout/warrior/slinger/archer/spearman/swordsman/horseman/catapult), anti-cavalry & anti-city bonuses.
- ✅ XP + leveling + a promotion system (shock/drill/cover/accuracy/barrage/siege/medic).
- ✅ City HP/defense, siege, and **capture** (melee takes a 0-HP city); walls/barracks buildings.
- ✅ Barbarians (a non-human player) with simple aggressive AI, auto-run between human turns.
- ✅ Workers build improvements (farm/mine) + roads (cheaper movement); expanded 12-tech tree.
- ⏳ Deferred to a later step: world/national **wonders** (the roadmap's "first wonders").

**M3 — Multiplayer server (real-time simultaneous first)** ✅ *playable in-browser; persistence/timer pending*
- ✅ Bun HTTP+WS gateway, auth (register/login/resume via `Bun.password`), in-memory lobby (create/join/start).
- ✅ **Server-authoritative** sim: orders validated per-owner (`applyCommand(state, cmd, actingPlayerId)`); illegal orders rejected.
- ✅ **Real-time simultaneous turns** (`startSimultaneousTurn`/`resolveSimultaneousTurn`): all players act, resolve when all ready (barbarians + economy tick, turn advances).
- ✅ **Server-side fog filtering** (`viewForPlayer`) — clients only receive explored tiles + visible entities (anti-maphack).
- ✅ Verified end-to-end: vitest core tests + a live **WebSocket smoke test** (2 clients register→create→join→start→found→ready→resolve).
- ✅ **M3b — browser multiplayer**: lobby UI (single-player + connect/register/login/create/join/start), a `Session` abstraction (`LocalSession` keeps single-player; `OnlineSession` renders server views + sends orders), verified live in-browser (register → create → start → render fog-filtered map → found-city order round-trips through the server).
- ⏳ Postgres persistence (Storage interface + in-memory done; Postgres adapter via `Bun.sql` pending a DB); turn timer + combat-lock sub-phase; async play-by-cloud + notifications.

**M4 — Systems width** 🚧 *in progress*
- ✅ **Victory conditions** (domination — last-standing or all original capitals; score at the turn limit) with detection + in-game game-over banner; `gameOver` flows through the server view.
- ✅ **Original tech tree** (not a Civ clone): ~33 techs organised around real materials/techniques (Stone Knapping, Fire-Hardening, Smelting, Bronze Alloying, Carburizing, Torsion Engines, Equestrianism…). See `packages/sim/src/game/content.ts` (supersedes the earlier Civ-style draft in TECHNOLOGIES.md).
- ✅ **Deep unit roster** (~29 land units across roles & eras: clubman/warrior/slinger/javelineer/hunter → fire-hardened spear/war-dogs/archer → axeman/maceman/spearman/hoplite/chariots/riders/horse-archer → swordsman/longsword/pikeman/cataphract/crossbow/legionary/war-elephant + siege ram/catapult/ballista). Some available immediately, others tech-gated. AI is class-based so it adapts.
- ✅ **Reworked buildings** (Granary/Workshop/Forge/Walls/Barracks/Stable/Market/Archive/Academy/Aqueduct/Harbor/Monument), tech-gated.
- ✅ **Territory / cultural borders**: cities claim their tile + ring on founding and expand outward as population grows; only owned tiles can be worked; borders rendered (tinted region + outline), shown in the city panel, and sent through the fog-filtered server view.
- ✅ **Map features** — **tribal Villages** (random perk on entry: learn a tech, gold, production/citizen boost, free unit, free promotion, or a barbarian ambush) and **Barbarian Camps** (periodically spawn raiders; clear them with a military unit for a reward). Deterministic (seeded) so the server & clients agree. Rendered as ? / ! markers; flow through the server view. Barbarians now **raze** captured cities rather than holding them.
- ✅ **Game-creation menu** — single-player setup (map size S/M/L, 0–4 AI opponents, barbarians toggle) and the same map-size + AI-fill options on multiplayer create. Engine generalised to **N players** with greedy-spread starts and an 8-colour palette.
- ✅ **In-game UI polish** — clickable **minimap** (explored terrain + cities/units + viewport rect, click-to-recenter), **combat-odds preview** on hover ("vs Archer: deal 45 · take 20"), and a **Victory/Defeat overlay** with winner/condition + Back to Menu.
- ✅ **Responsive UI overhaul** — a compact **top bar that fits & wraps** (works mobile + desktop), with Research/Civics shown as progress pills; an **informative production picker** (each unit/building shows role, combat stats, movement, special notes, cost & turns); **research/civic pickers show what they unlock**; unit panel shows a role line; and **mobile bottom-sheet panels** via media queries.
- ✅ **Civilizations data layer** — `packages/data` holds 10 launch civs (Rome, Egypt, Greece, Han China, Persia, Maurya, Mali, Aztec, Mongols, Norse), each with a leader, ability, unique unit & infrastructure. A typed **ability-effects** system (`packages/sim/src/game/civs.ts`) applies them to yields (% bonuses, Mali desert gold), unit movement (Mongol cavalry), combat (class bonuses), and city founding (Rome's free Monument). Civ pick in the setup menu (random unique for AI), shown in the top bar, and carried through the multiplayer view.
- ✅ **Tile yields + manual citizen assignment** — tiles produce food/production/gold/**science**; each citizen works a tile (auto-assigned to the best on growth, **reassignable by clicking tiles** in the city view, swapping at capacity). Redesigned **city panel** (yields grid, citizens W/P, growth & production bars) and **top bar** (sectioned), **unit↔city selection cycling** (tap a unit again to select the city under it), and a **smart action button** that suggests *Next Unit → Choose Research → Set Production* before offering *End Turn* (with an always-available secondary End Turn).
- ✅ **Civics, governments & policies** — a culture-funded **civics tree** (11 civics) parallel to the tech tree; **governments** (Chiefdom → Despotism / Oligarchy / Classical Republic / Monarchy) each with policy **slots** + a base bonus; **policy cards** slotted for stacking effects. All bonuses (civ + government + policies) merge through one `playerEffects()` applied to yields/combat/movement. New 🎭 **culture** yield (Monument/Amphitheater + base), a Civics panel UI, and a "Choose Civic" smart suggestion. AI develops civics & adopts governments too.
- ⏳ Religion; culture/tourism; trade routes; diplomacy/city-states; geodata-map integration.
- ⏳ Religion, culture/tourism, trade routes, diplomacy & city-states.
- ⏳ 10 launch civilizations (data-driven), each with UU/UI/ability.
- ⏳ **First Legends (heroes)** wired into recruitment + abilities (core feature).
- ⏳ **Real-world geodata map pipeline** integrated into `tools/` + first curated Earth/Mediterranean presets.

**M5 — Content, AI, polish** 🚧 *AI started*
- ✅ Basic single-player **AI** opponent (rules/utility controller — expands, researches, builds, defends & attacks). Runs **on-device** (pure TS in the browser/server), no API. Behind an `AiController` interface so an on-device learned model (ONNX/TF.js in a worker) can drop in later. Single Player = 1 human vs 1 AI (+ barbarians).
- Expand civ roster toward 60+, more wonders/units, Great People, and the full Legends roster.
- More curated geodata maps (Americas, Europe, East Asia) + start-bias overlays.
- Balance pass, tutorials/onboarding, PWA install, performance tuning for low-end mobile.
- Packaging exploration (Capacitor/Tauri for app stores) — *after* web is solid.

---

## 6. Key Technical Decisions (recommended defaults)

| Decision | Recommendation | Why |
|---|---|---|
| Grid | **Hex** | Cleaner movement/ranged/adjacency than squares |
| Rendering | **Canvas 2D first**, renderer behind an interface | Max device support, simplest; swap to WebGL later if needed |
| Art | **Procedural/vector + tiny baked atlas** | Meets "no big download"; matches "simple graphics" |
| Turn model | **Real-time simultaneous first**, async on same engine | Chosen: live sessions first; async reuses the code |
| Netcode | **Server-authoritative state sync** (not P2P lockstep) | Robust, cheat-resistant, async-friendly |
| Maps | **Procedural + real-world geodata (d3/Natural Earth), both from start** | Chosen: baked at build time, runtime stays tiny |
| Heroes | **Legends are a core feature** (toggleable off) | Chosen: central to identity, balanced into the loop |
| Tone | **Historically grounded** | Chosen: real leaders/agendas, educational flavor |
| Language across stack | **TypeScript everywhere**, pure `shared`/`sim` | One codebase of rules for client, server, AI |
| Server | **Bun + native WebSocket** | As requested; fast, modern, great DX |
| DB | **Postgres** (snapshots + order log) | As requested; durable, supports async/replay |
| Packaging | **PWA now, Capacitor/Tauri later** | Web-first requirement; app stores deferred |

---

## 7. Risks & Open Questions

- **Simultaneous-turn combat resolution** is the trickiest fairness problem → needs a clearly specified, deterministic resolution order and tie-breaks (design doc before coding M3).
- **AI quality** for a deep 4X is a large effort → start rules/utility-based and iterate; it's the longest pole for satisfying single-player.
- **Balance across 60+ civs** is ongoing → keep everything data-driven so balance is tuning, not refactoring.
- **Mobile performance** with large maps → aggressive culling, layered/cached canvases, and a possible WebGL backend are the mitigation.
- **Scope** is very large → the milestone plan keeps a *playable* build at every step so we never have an unshippable mass of half-features.
- **Real-time simultaneous netcode** (chosen launch mode) raises the bar on latency, reconnect handling, and the combat-lock fairness sub-phase → prototype the resolution rules early (a design doc + a tiny simulation harness before full M3).

### Resolved direction (locked in from kickoff):
1. **Tone:** ✅ Historically grounded — real leaders/agendas, educational flavor text.
2. **Legends (heroes):** ✅ Core feature, on by default, with recruitment + abilities + lifespan; toggleable off for purists.
3. **Primary multiplayer mode:** ✅ Real-time simultaneous first; async play-by-cloud follows on the same engine.
4. **Maps:** ✅ Both procedural and curated from the start, including **real-world geodata maps** (d3-geo + Natural Earth/TopoJSON) baked to our hex format at build time — World, continent, and region presets. See §3.1.1.
