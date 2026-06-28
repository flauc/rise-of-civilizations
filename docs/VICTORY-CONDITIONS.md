# Victory Conditions

> 📋 **Status: DESIGN — not yet implemented (2026-06-28).** Today the game ships four win paths in [`packages/sim/src/game/victory.ts`](../packages/sim/src/game/victory.ts): **Domination** (last civ / all original capitals / all cities), **Score** (highest [`playerScore`](../packages/sim/src/game/victory.ts) at `turnLimit`), **Religious** (a religion is the strict majority faith in every major civ — but it spreads only by passive proximity pressure), and **Extinction** (draw). The `GameOver.condition` union in [`state.ts`](../packages/sim/src/game/state.ts) is `"domination" | "score" | "religious" | "extinction"`.
>
> This document designs the **three new victories** — **Science**, **Culture**, **Economic** — and a **deepening of the Religious** path (missionaries/inquisitors, per-city religion). It also specs the cross-cutting systems they need: **victory-condition toggles**, **international & ocean trade routes**, **Great Works & tourism**, and **faith-purchased religious units**. Everything is scoped to the game's era cap (Ancient → Age of Exploration, ~1550 CE — caravels/galleons/early gunpowder; **no modern era**, so no spaceship/UN/internet analogues — the science and culture paths use period-appropriate capstones).
>
> Numbers below are **intent**; tune in `packages/sim` / `packages/data`. Each victory is a vertical slice through the established seams (`state → economy/commands → serialize → session → ai → client → wiki → tests`), the same pattern religion, trade, and diplomacy already followed.

---

## 0. Design principles

- **Period-grounded.** No spaceship (Science) or jet-age tourism (Culture). Science peaks at an **Age-of-Discovery capstone** (circumnavigation + the great academies); Culture is **Wonders + Great Works + renown**, compared rival-by-rival as in Civ V/VI but framed historically.
- **Each victory is *earned through play*, not a number that ticks up on its own.** Religious needs you to physically evangelize; Economic needs a real trade empire; Science needs the full tree *and* a voyage; Culture needs wonders and great works that out-shine rivals.
- **Toggleable.** Any subset of victories can be enabled per game (lobby checkboxes), defaulting to all on. A game with everything off still ends by Score at the turn limit or by Extinction.
- **Deterministic.** All accrual (influence, pressure, circumnavigation tracking) must be order-independent and seeded — the server and every client must agree (same constraint religion/trade already meet).
- **Legible.** A single **Victory Progress** panel shows, per enabled condition, the current leader and your own progress — so the player always knows how close anyone is (Civ-style "the world is concerned…" warnings).

---

## 1. Victory framework (shared, build first)

### 1.1 State & types
- Extend the union:
  ```ts
  // state.ts
  export type VictoryKind =
    | "domination" | "score" | "religious"
    | "science" | "culture" | "economic" | "extinction";
  export interface GameOver { winnerId?: number; condition: VictoryKind; }
  ```
- `GameState.enabledVictories: Set<VictoryKind>` (default: all the "win" kinds; `extinction`/`score` are always-on fallbacks). Add `NewGameOptions.enabledVictories` and thread it: [`setup.ts`](../packages/sim/src/game/setup.ts) → [`net.ts`](../packages/sim/src/net.ts) `createGame` msg → server [`lobby.ts`](../packages/server/src/lobby.ts) `CreateOptions`/`LobbyGame` → [`serialize.ts`](../packages/sim/src/game/serialize.ts) → client [`session.ts`](../packages/client/src/session.ts).

### 1.2 The check
`checkVictory(state)` already runs from `endTurn`, `resolveSimultaneousTurn`, and `combat.captureCity` (via `applyVictoryCheck`). Refactor it to iterate **only enabled conditions**, each in its own pure predicate:
```ts
function checkDomination(state): GameOver | null  // existing, unchanged
function checkReligious(state):  GameOver | null  // existing, reads per-city dominant religion (§3)
function checkScience(state):    GameOver | null  // §4
function checkCulture(state):    GameOver | null  // §5
function checkEconomic(state):   GameOver | null  // §6
function checkScore(state):      GameOver | null  // existing, fallback at turnLimit
```
**Simultaneity / ties** (real-time simultaneous turns can complete two players in one resolve): collect *all* satisfied results, then pick the winner by (a) decisive conditions before Score, then (b) highest `playerScore`, then (c) lowest player id — fully deterministic. Document this in `victory.ts`.

### 1.3 Progress reporting
Add `victoryProgress(state, playerId): VictoryProgress` returning, per enabled condition, a `0..1` fraction plus headline numbers (e.g. "civs converted 3/5", "influential over 2/4", "international routes 6 — leader"). Surface via `serialize.viewForPlayer` so the client renders a **Victory Progress** modal and the AI can read its own standing. Rival progress is shown coarsely (tier/percent, no exact internals) — Civ-style awareness without perfect information.

### 1.4 Client / wiki / tests
- Lobby: a **Victory Conditions** checklist in **both SP and MP** Game Options (`lobby-ui.ts`), mirroring the existing map-type/treasury controls — see §10.4 for the full requirement (MP host authority, persisted in `LobbyGame`, echoed read-only to joiners).
- In-game: a 🏆 **Victory** topbar pill → progress modal; the existing `#gameover` banner already renders `condition` generically — just add labels.
- Wiki: a new **Victory** category in [`wiki.ts`](../packages/client/src/wiki.ts) explaining each path.
- Tests: extend [`victory.test.ts`](../packages/sim/src/game/victory.test.ts) with one scenario per condition + the toggle-gating + the tie-break.

---

## 2. Supporting systems (shared by the new victories)

Three reusable systems unlock multiple victories. Build them as their own slices; the victories then mostly add a `checkX`.

### 2.1 International & ocean trade routes  *(feeds Economic + Science circumnavigation)*
Today [`trade.ts`](../packages/sim/src/game/trade.ts) `establishTradeRoute` hard-requires `dest.ownerId === unit.ownerId` (domestic only), and the caravan pather treats water as a last resort (`caravanTileCost` water = 3).

- **International routes.** Allow a foreign destination city when diplomacy permits — `relationBetween(state, a, b)?.openBorders` **or** `pact === "alliance"` (see [`diplomacy.ts`](../packages/sim/src/game/diplomacy.ts) `PACT_RANK` / `openBorders`). Add `TradeRoute.toOwnerId` and `TradeRoute.international`. International routes:
  - yield **more gold** (e.g. base `+50%`, plus a distance/luxury kicker),
  - grant a **small science + culture trickle to *both* civs** (mutual exchange),
  - apply a recurring **+attitude modifier** to the foreign partner (trade builds goodwill — hook into `diplomacy` modifiers),
  - are **pruned** the moment borders close or war is declared (extend `pruneTradeRoutes`).
- **Ocean routes.** Add a naval trade carrier and let routes run over water:
  - New unit **Cargo Ship** (naval civilian, `trader: true`, `domain: "naval"`), or allow the existing Trader to embark from a **Harbor**. Gate sea routes on a **Harbor/port** at *both* endpoints.
  - Give the pather a naval mode: water tiles cheap, land expensive (mirror image of `caravanTileCost`). Coastal hops need `sailing`; **deep-ocean** crossings need the apex naval tech (e.g. `astronomy`/`cartography` — confirm the id in `content.ts`), matching the "ocean only becomes crossable late" era beat.
  - Ocean routes between **different landmasses** pay the biggest gold bonus (the whole point of the Age of Exploration).
- **Commands:** extend the existing `establishTradeRoute` command to accept a foreign `destCityId`; validation lives in `trade.ts`.
- **AI:** `aiTrader` (in [`ai.ts`](../packages/sim/src/game/ai.ts)) already founds domestic routes — extend to open international/ocean routes with civs it's friendly with.

### 2.2 Faith-purchased religious units  *(powers the deepened Religious path)*
Faith is already a player stockpile (`Player.faith`, spent by `foundReligion`). Add a **buy** path (units bought with faith, *not* the citizen-training pipeline):

- New command `buyReligiousUnit{ cityId, type }` in [`commands.ts`](../packages/sim/src/game/commands.ts); cost scales with the count already bought (like `legendCost`). Spawns in the city.
- New `UNIT_DEFS` (in [`content.ts`](../packages/sim/src/game/content.ts)), all `religious: true`, weak/zero melee:
  - **Missionary** — `spreadCharges` (e.g. 3). Moves to a target city (yours, or a foreign one you have peace/open-borders with) and spends a charge to inject a burst of your religion's **pressure** (§3). Consumed when charges run out.
  - **Apostle** — stronger spread + can initiate **theological combat** (§3.3) against enemy religious units; may also yield a **Relic** Great Work on "martyrdom" (ties into §5).
  - **Inquisitor** — purges *other* religions' pressure from cities **inside your territory** ("remove heresy"); cannot evangelize abroad.
- **Buildings:** Shrine/Temple already produce faith + Prophet GP points; optionally add a **Holy Site** wonder/building granting bonus faith and a free Missionary charge.

### 2.3 Great Works & tourism  *(the core of the Culture path)*
Great Works do **not** exist yet — the Artist Great Person currently gives an instant `+150 culture` / `masterwork` production ([`great-people.ts`](../packages/sim/src/game/great-people.ts)). Build the slot system:

- `City.greatWorks?: GreatWork[]`, where `GreatWork = { id; kind: "writing"|"art"|"music"|"relic"|"artifact"; title; creatorCivId; culture; tourism }`.
- **Slots** come from buildings/wonders: `greatWorkSlots(city)` — Amphitheater (music/writing), Temple (relic), a new **Museum** (art/artifact), and select **wonders**. A work only exists if a free slot holds it.
- **Sources:** an **Artist** Great Person may *create a Great Work* (instead of the instant culture) when a slot is free; some **wonders** grant a free work on completion; **Apostles** can produce a **relic** (§2.2). (Archaeology/antiquity-site digs are a *later* extension — out of scope for v1.)
- **Tourism (renown):** each work and many wonders emit `tourism` per turn; `tourismOutput(state, playerId)` sums them plus a fraction of culture, scaled by multipliers (open borders, an active trade route, shared religion) and reduced by the target's **culture defense**. This is the engine the Culture victory reads.

---

## 3. ☮️ Religious victory — *deepen the existing path*

**Win condition (kept, refined):** a religion is the **dominant faith in every major civ that owns cities** (≥ 2 such civs). Today this reads `city.religion` (a single id) and spread is automatic. We make conversion **active and contestable**.

### 3.1 Per-city pressure model
Replace the single `city.religion` overwrite in [`religion.ts`](../packages/sim/src/game/religion.ts) `spreadReligion` with **accumulating pressure**:
- `City.religionPressure: Record<religionId, number>`. `dominantReligion(city)` = the max-pressure religion (ties → none / unchanged). Keep `city.religion` as a **derived cache** recomputed after each spread tick, so existing readers (UI, victory check, `civs.playerEffects` belief merge) keep working.
- **Ambient spread** (each religion turn, as now but additive): holy cities (×3) and follower cities emit pressure to cities within `SPREAD_RANGE` (currently 5), *added* to `religionPressure`, with a small per-turn **decay** so conversions are gradual and reversible — a religion must keep applying pressure to hold a frontier city.
- Holy cities remain pinned to their own religion.

### 3.2 Missionaries & Inquisitors (from §2.2)
- **Missionary** → big one-shot pressure injection in a target city (charge-limited). This is the *primary* way to convert distant/foreign cities — ambient pressure alone won't cross a continent.
- **Inquisitor** → zeroes rival pressure in your own cities (defend your core).
- Foreign cities can **expel** missionaries (a diplomatic action / on war), so spreading into a hostile empire is hard without open borders — which links Religion to Diplomacy.

### 3.3 Theological combat (light)
When an **Apostle** initiates against an adjacent enemy religious unit: compare a **faith-strength** (base + a `religious_strength` promotion track + holy-city proximity). Loser loses charges or is removed; winner gains pressure/relic. Keep it simple — no full combat model; it's a flavorful skirmish layer, optional behind a setting if it complicates MP.

### 3.4 Victory check changes
`checkReligious` reads `dominantReligion(city)` instead of `city.religion`, and requires the dominance to **hold for N consecutive religion-turns** (e.g. 3) to avoid a single missionary flicker ending the game. Winner is `religion.founderId` (unchanged). Add a per-religion `dominantSinceTurn` tracker.

### 3.5 AI
Extend `ai.ts`: once it has founded a religion and has spare faith, buy Missionaries and send them to the nearest un-converted (foreign or own) city; buy an Inquisitor when its core cities carry rival pressure. (`ai` already founds religions when able.)

---

## 4. 🔬 Science victory — *"The Great Endeavor"*

No spaceship in this era. The scientific capstone is the **Age of Discovery**: master the whole tree, build the great academies, and **circumnavigate the globe**.

### 4.1 Win condition
1. **Complete the tech tree** — `allTechsResearched(player)` (every id in `TECH_DEFS`, including the apex `gunpowder` → `firearms` and the apex naval/astronomy tech), **and**
2. **Finish the capstone**, in two stages:
   - **The Academies** — build the **Great Observatory** wonder (new, in `@roc/data` `WONDER_DEFS`) *and* complete a **Scientific Endeavor** project chain in a city: three sequential conversion-style projects modeled on the existing `PROJECT_DEFS` (`coinage`/`scholarship`/… in `content.ts`) — e.g. *Compile the Great Library → Found the University → Print the Encyclopaedia*, each consuming production over several turns.
   - **Circumnavigation** — send a Caravel/Galleon **around the world** and home. Track `Player.circumnavigation = { visitedSectors: Set<number>; done: boolean }`: divide the map's columns into N longitude sectors; mark a sector visited when one of the player's naval units enters it (hook in `movement`/`onUnitEnter`). Complete when **all sectors** are visited **and** a ship returns to a friendly **port** (Harbor). On a non-wrapping map this reduces to "reach the far-east and far-west extremes and return" — verify the map's east-west wrap behavior in `worldgen`/`shared` and pick the sector rule to match.

> **Why circumnavigation:** it's the iconic 1500s scientific/exploratory triumph, it's visible and contestable on the map, and it reuses the §2.1 ocean-trade pathing and naval units rather than inventing a sci-fi capstone.

### 4.2 State & module
- New `science-victory.ts`: `allTechsResearched`, capstone-stage helpers, circumnavigation tracking, `checkScience`.
- `Player.scienceVictory?: { observatoryDone; endeavorStage: 0..3; circumnavigation }`. Circumnavigation hook lives wherever naval movement resolves.

### 4.3 AI
Extend `TECH_PREFERENCE` to research to completion; build the Observatory + run the Endeavor projects when ahead in science; opportunistically sail a ship around. (The AI is unlikely to *win* by science, which is acceptable — the human-facing path is the point; the AI mainly needs to *not* be trivially out-raced and to show up in progress reporting.)

---

## 5. 🎭 Culture victory — *"Influence — Wonders of the World"* (largest)

Civ-style **tourism vs culture**, framed as **renown**: your accumulated cultural influence over a rival must exceed that rival's own lifetime culture — for **every** living major civ.

### 5.1 Win condition
- You are **Influential** (or higher) over **all** other living major civs.
- **Influence** accrues from **tourism** (§2.3): `Player.influenceOver: Record<rivalId, number>` += `tourismToward(you, rival)` each turn.
- A rival's **resistance** is their **lifetime domestic culture**: add `Player.cultureLifetime` (accumulate each city's culture yield every turn). You are *Influential over rival R* when `influenceOver[R] ≥ R.cultureLifetime`.
- Tiers for UI/flavor: **Unknown → Familiar → Popular → Influential → Dominant** (thresholds as fractions of the rival's culture). Win at Influential-over-all.

### 5.2 Tourism multipliers (intent)
`tourismToward(you, rival)` = base renown × modifiers:
- **+** open borders with the rival, an active **trade route** to them, **shared religion** (your dominant faith == theirs), shared government/era;
- **−** the rival's **culture defense** (their own culture output / wonders), and being at war with them.

These knobs make Culture interlock with Diplomacy (open borders), Trade (§2.1), and Religion (§3) — it's the most *systems-coupled* victory, which is why it's last.

### 5.3 What's needed
- **Great Works system** (§2.3) — the main new build: slots, `GreatWork`, sources, tourism.
- **Wonders**: tag tourism on culturally significant wonders in `@roc/data`; add a **Museum** building (art/artifact slots) and ensure Amphitheater/Temple expose slots.
- **Great People change**: give the **Artist** activation an option — instant culture *or* **create a Great Work** when a slot is free (backward-compatible; default to work if a slot exists).
- `culture-victory.ts`: `tourismOutput`, `tourismToward`, influence accrual, tier/status, `checkCulture`.
- State: `Player.cultureLifetime`, `Player.influenceOver`, `City.greatWorks`.

### 5.4 AI
Build culture buildings + wonders, route Artists into Great Works, keep open borders. The AI need not master Culture victory but must generate works/tourism so influence math is meaningful and rivals show progress.

---

## 6. 🪙 Economic victory — *"Mercantile Hegemony"*

Era analog = a **merchant-prince / trading-empire** dominance (Venice, Hansa, Mali, Portugal), **not** a modern world bank. You win by commanding world commerce.

### 6.1 Win condition (composite power, with a clear-hegemony gate)
Compute an **Economic Power** score per civ and require both a floor **and** a decisive lead:
```
EconomicPower(p) =
    w1 * internationalRouteCount(p)          // §2.1 routes to other civs / overseas
  + w2 * luxuryMonopolies(p)                 // resource types you dominate
  + w3 * goldPerTurn(p)                       // net income
  + w4 * treasury(p) / 100
  + w5 * commerceBuildings(p)                 // markets + new Banks
```
**Win** when `EconomicPower(you) ≥ ECONOMIC_THRESHOLD` (scaled by map size / player count / turn) **and** `≥ 2 × second-best` — a hegemony, not a squeak. This single-number gate is cleaner to balance and AI-legible than a multi-clause checklist, while still *requiring* a real trade empire (routes), market control (monopolies), and wealth.

- **Luxury monopolies** (`resources.ts`): `luxuryMonopolies(state, p)` = luxury types where `p` owns the most copies and strictly more than everyone else (or is the sole holder). Luxuries are already placed and counted in `Player.resources` / `importedLuxuries`.
- **International routes**: the §2.1 count (domestic routes don't count toward hegemony — you must trade with *the world*).

### 6.2 What's needed
- **§2.1 international + ocean trade** — the backbone; without it Economic is just "hoard gold".
- New **Bank** building (after a coinage/banking tech) → gold % + Merchant GP points; possibly a **Great Bourse**/**Mint** wonder as a power multiplier.
- `economic-victory.ts`: `internationalRouteCount`, `luxuryMonopolies`, `goldPerTurn`, `economicPower`, `checkEconomic`.

### 6.3 AI
`aiConsiderDiplomacy` already trades and gifts; add a **merchant profile**: prioritize Markets/Banks/Harbors and traders, open international routes, and pursue luxury monopolies through deals. Personality `greed` (already in `@roc/data` personalities) is a natural weight.

---

## 7. Cross-cutting implementation checklist

Per the established vertical-slice pattern, each victory touches:

| Layer | Work |
|-------|------|
| `state.ts` | `VictoryKind` union; `GameState.enabledVictories`; per-victory `Player`/`City` fields (`religionPressure`, `circumnavigation`/`scienceVictory`, `cultureLifetime`/`influenceOver`/`greatWorks`); `TradeRoute.toOwnerId`/`international` |
| `@roc/data` | Religious units, Cargo Ship, Bank/Museum; Great Observatory + capstone projects; tourism tags on wonders; Great-Work slot tables; new tech gates |
| `content.ts` | Unit/building/project defs + tech gates wired to `@roc/data` |
| `economy.ts` | tourism/culture-lifetime accrual; Bank yields; international-route yields folded into `getCityYields` |
| `religion.ts` / new `*-victory.ts` | per-city pressure; tourism/influence; science capstone; economic power; the per-victory `checkX` |
| `commands.ts` | `buyReligiousUnit`, extended `establishTradeRoute` (foreign dest), capstone-project start, create-Great-Work, missionary/inquisitor actions |
| `serialize.ts` / `session.ts` | flow new state + `victoryProgress` to the client (fog-aware: full self-progress, coarse rival-progress) |
| `ai.ts` | pursue each enabled condition (missionaries, international trade, capstone, works) |
| client | lobby victory toggles; Victory Progress modal + 🏆 pill; `#gameover` labels; trade/religion/works UI |
| `wiki.ts` | a **Victory** category |
| tests | `victory.test.ts` per-condition + per-system tests (trade-international, religion-pressure, great-works, etc.) |

---

## 8. Suggested milestones

Build as independent slices, each with tests + a commit:

1. **M-V1 — Framework, toggles & analytics.** `VictoryKind` union, `enabledVictories`, refactor `checkVictory` into per-condition predicates, `victoryProgress`, **SP+MP lobby checklist (§10.4)**, Victory Progress modal, wiki stub, and the **analytics victory reporting (§10.5)** (record `enabledVictories` at session start; admin victory-type breakdown). *Small; unblocks everything.*
2. **M-D1 — Diplomacy trading (§10.2).** Add `tech` / `city` / `unit` (sell + lend) deal items to the propose→respond→finalize lifecycle, AI valuation, and the deal-builder UI. *Independent of the victories; can land any time, pairs naturally with M-V3.*
3. **M-V2 — Religious (deepen).** Per-city pressure, Missionary/Apostle/Inquisitor (faith-buy), theological skirmish, refined `checkReligious`, AI. Plus **trade-route faith spread (§10.1)** and **religious-unit fast-travel along routes (§10.3)** — both work on today's domestic routes immediately and gain international reach once M-V3 lands. *Proves the faith-unit + per-city patterns.*
4. **M-V3 — Economic.** International + ocean trade (§2.1), Bank/monopoly, `economicPower`, `checkEconomic`, AI merchant. *Independently valuable; backbone for §4 circumnavigation and the international reach of §10.1/§10.3.*
5. **M-V4 — Science.** Full-tree check, Great Observatory + Endeavor projects, circumnavigation tracking (reuses §2.1 ocean pathing), `checkScience`, AI.
6. **M-V5 — Culture.** Great Works & tourism (§2.3), Museum/wonder slots, Artist→work option, influence accrual, `checkCulture`, AI. *Largest, most systems-coupled — last.*

---

## 9. Decisions to confirm before coding

1. **Thresholds** — all the numbers (faith costs, `ECONOMIC_THRESHOLD`, influence tiers, circumnavigation sector count, "hold for N turns") are placeholders; happy to start with my suggested values and tune.
2. **Religious winner** — keep "founder of the dominant religion wins", or "whoever *currently controls the holy city* wins" (lets a conqueror steal a religious victory)? Default: founder.
3. **Great People — Artist split.** Keep the merged **Artist** class (one work type) for v1, or split back into Writer/Artist/Musician for themed-work bonuses? Default: keep merged for v1, themed bonuses later.
4. **Theological combat** depth — light skirmish (proposed) vs. none (missionaries just get expelled). Default: light, and behind a setting if MP balance suffers.
5. **Science capstone shape** — circumnavigation + academies (proposed) vs. a pure project-chain (no voyage). Default: include the voyage (more flavorful, reuses ocean trade).
6. **Map wrap** — confirm whether the world wraps east-west; it changes the circumnavigation sector rule (§4.1).

---

## 10. Extensions (round 2 — 2026-06-28)

Five additions requested after the first draft. They deepen the coupling between **Trade ⇄ Religion ⇄ Diplomacy** and round out configurability + telemetry.

### 10.1 Trade routes spread religious influence (both directions)
Historically, faith travelled the trade arteries (Buddhism & Islam along the Silk Road; Islam across the Indian Ocean). Make every active trade route a **two-way conduit of religious pressure** (§3.1):

- During the religion tick in [`religion.ts`](../packages/sim/src/game/religion.ts) `spreadReligion`, after ambient proximity pressure, iterate `state.tradeRoutes`. For each route, the **dominant religion of endpoint A injects pressure into endpoint B and vice-versa**, regardless of the distance between them — the route bridges the gap that proximity spread (range 5) cannot.
- **Magnitude scales with route strength**: derive a `routeStrength` from `tradeRouteYield(state, route).gold` (a proxy for traffic / road-tier / market bonuses — the route already computes `roadConnectionBonus`). `pressure = RELIGION_TRADE_FACTOR * routeStrength`.
- **International routes (§2.1) carry your faith into rival empires** — a peaceful, diplomacy-gated path to the Religious victory that pairs with open borders/alliances. Inquisitors (§2.2) still purge it at home; a rival can sever the route (war / plunder) to stop the bleed.
- **UI:** the route tooltip/overlay shows "carries ☮ \<religion\>"; the city religion panel attributes pressure sources (proximity / route / missionary).

### 10.2 Diplomatic trading of technologies, cities, and units
Extend the deal system. Today [`diplomacy.ts`](../packages/sim/src/game/diplomacy.ts) `DealItem` covers `gold` / `goldPerTurn` / `resource` / `openBorders` / `specialist` (already **lendable** with an `untilTurn` + `specialistId`, see `applyExchange`) / `peace` / pact tiers. Add three kinds, all flowing through the existing **propose → respond → finalize** lifecycle, `describeDealItems`, `recordTrade`, `itemValue` (AI valuation), and serialize `DiploView`:

- **`{ kind: "tech", techId }`** — transfer a researched technology (instant, permanent). Offerable only for techs the giver **has**, the receiver **lacks**, and the receiver has the **prereqs** for. AI valuation is high and *strategically guarded*: it won't sell a tech that hands the buyer a unit able to beat it, and leading-edge/military techs cost more. Optional Civ-style **tech-brokering** attitude penalty with third parties. Supports tech-for-gold and tech-for-tech.
- **`{ kind: "city", cityId }`** — cede a city (permanent ownership transfer) for peace settlements, purchases, or vassal deals. Reuse the ownership-transfer plumbing in [`combat.ts`](../packages/sim/src/game/combat.ts) `captureCity` **minus the razing** (flip `ownerId`, reassign territory `ownerCityId`, keep buildings). **Triggers `applyVictoryCheck`** afterward (capitals change hands → can decide Domination).
- **`{ kind: "unit", unitId, turns? }`** — **sell** a unit (`turns` absent/0 → permanent transfer) or **lend** it (`turns > 0` → reverts to the original owner after N turns), modelled exactly on the existing **specialist loan** (`untilTurn`/`specialistId` record; revert in `diplomacyTick`). Lent units fight for the borrower then return — coalition warfare / mercenaries. Validation: giver owns the unit; a lent unit can't be disbanded or gifted onward by the borrower.
- **Client** ([`diplomacy.ts`](../packages/client/src/diplomacy.ts) deal-builder): new give/want rows — **Tech** (dropdown of tradeable techs), **City** (dropdown of your cities, with a warning when ceding a capital), **Unit** (dropdown of your units + a Sell/Lend toggle + duration). Everything else (inbox/outbox, finalize, trade history) already renders generic `DealItem`s.

### 10.3 Religious units fast-travel along trade routes
Let a **religious unit** (Missionary/Apostle/Inquisitor; §2.2) ride a trade route like a caravan — entering at one endpoint city and emerging at the other in a fraction of the walking time.

- **Command** `boardTradeRoute{ unitId, routeId }`: the unit must stand in an endpoint city of `routeId` (and have the right to use it — its own route, or an **international** route whose terms admit it, which is how you ferry a missionary *into a partner's empire* — pairs with §10.1). The unit leaves the map into transit: `Unit.inTransit = { routeId, exitCityId, arrivesOnTurn }`; it re-appears at the far endpoint (or nearest open tile) when the turn arrives.
- **Travel time scales with distance ÷ route strength**: `turns = max(1, ceil(routeDistance / (BASE_SPEED * strengthFactor)))`, where `routeDistance` = the route's stored `path.length`, and `strengthFactor` rises with route gold / road tier / river connection (the same `routeStrength` proxy as §10.1). A long, well-developed route delivers a missionary in ~1–2 turns instead of ten; a weak short route saves less.
- **Interdiction:** if the route is plundered or severed (war, lost endpoint) while a unit is in transit, the unit is dumped at the nearest surviving endpoint. Capacity is one religious unit in transit per route at a time (prevents conga-lines).
- Scope: religious units in v1 (optionally Traders/civilians later). Not military — this is a faith-logistics lane, not a troop highway.

### 10.4 Victory toggles configurable in single-player **and** multiplayer
Reinforces §1.1/§1.4 as a hard requirement:

- **SP:** the Victory Conditions checklist sits in the Single-Player setup panel (`lobby-ui.ts`), threaded `opts.enabledVictories → createGame` like map type / legends.
- **MP:** the same checklist in the **create-game** panel; the **host's choice is authoritative**, stored in the server `LobbyGame`/`CreateOptions` ([`lobby.ts`](../packages/server/src/lobby.ts)) and sent via the `net.ts` `createGame` message. Joiners see the enabled set **read-only** in the lobby before Start, so everyone knows the win paths in play.
- Defaults: all decisive victories on; `score`/`extinction` always-on fallbacks. The chosen set is echoed through `serialize` into the in-game Victory Progress panel and recorded in analytics (§10.5).

### 10.5 Analytics: report on victory types
`SessionEndEvent.condition` in [`shared/src/analytics.ts`](../packages/shared/src/analytics.ts) **already carries the win/loss condition** — but the admin read-model only has `OutcomeBreakdown` (win/loss/abandoned), with no per-condition tally, and the *enabled* set isn't recorded. Add:

- **Schema** (`shared/src/analytics.ts`): `SessionStartEvent.enabledVictories?: string[]` (the configured set from §10.4); a read-model shape `VictoryBreakdown` (reuse `LabelCount[]`: condition → count) and a config distribution for enabled victories.
- **Server** ([`analytics.ts`](../packages/server/src/analytics.ts) `AnalyticsStore` + [`analytics-postgres.ts`](../packages/server/src/analytics-postgres.ts)): a `victoryBreakdown()` query grouping completed `session_end`s by `condition` (split win vs. loss); store `enabledVictories` on the session row and fold it into `ConfigBreakdown`. Expose `GET /admin/api/victories` and include it in `/admin/api/all`.
- **Admin app** ([`admin/src/main.ts`](../packages/admin/src/main.ts)): a **Victory types** card — a bar list of `condition → wins` (e.g. "Domination 42 · Score 30 · Religious 8 · Economic 5 · Science 3 · Culture 2") next to an **Enabled victories** config distribution, alongside the existing map-type/treasury/civ sections. Privacy & offline-first behaviour unchanged.

---

*See also: [PLAN.md](PLAN.md) (master), [DIPLOMACY.md](DIPLOMACY.md) (open borders / alliances that gate international trade & tourism), [GREAT-PEOPLE.md](GREAT-PEOPLE.md) (the Artist class that creates Great Works), [SPECIALISTS-AND-WORKS.md](SPECIALISTS-AND-WORKS.md) (the works/wonder engine), [RESOURCES-AND-AMENITIES.md](RESOURCES-AND-AMENITIES.md) (luxuries behind monopolies), [TECHNOLOGIES.md](TECHNOLOGIES.md) (the tree the Science path must complete).*
