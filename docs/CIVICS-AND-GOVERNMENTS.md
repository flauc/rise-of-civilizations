# Civics & Governments Overhaul

> ✅ **Status: IMPLEMENTED (M-C1…M-C5 shipped 2026-07-06).** All five milestones are in: engine hooks, the 15-government tree, civic adoption/slotting, the full 43-civic catalogue, AI, wiki, and a balance pass (`bun run balance --civics` → 56/58 entries in-band). The numbers in the tables below are the **shipped, tuned** values. The historical design notes are kept for context. Original state before the overhaul:
>
> Before this overhaul the game shipped a flat, cheap civics tree: **11 civics** ([`packages/data/src/index.ts:2507`](../packages/data/src/index.ts)) costing 60–190 culture with a +12% per-adopted escalation (`civicCost`, [`data/index.ts:2529`](../packages/data/src/index.ts)), **5 governments** ([`data/index.ts:2533`](../packages/data/src/index.ts)) that are strictly-better upgrades (more slots, only positive effects — the AI literally picks by `slots` count, [`ai.ts:1779`](../packages/sim/src/game/ai.ts)), and **8 policy cards** ([`data/index.ts:2541`](../packages/data/src/index.ts)) with only upsides (`corvee` is orphaned — nothing unlocks it). Government switching is **instant and free** ([`commands.ts:551`](../packages/sim/src/game/commands.ts)). Culture accrues into `player.cultureProgress` and buys the selected civic one-per-turn (`advanceCivic`, [`economy.ts:725`](../packages/sim/src/game/economy.ts)); the tree opens with the **Writing** tech (`CIVICS_REQUIRED_TECH`, [`content.ts:1078`](../packages/sim/src/game/content.ts)).
>
> This document replaces that with: a **government tree** (researched with culture, branching like the tech tree — the government you hold determines *which civics you may adopt*), and **civics as expensive pros-and-cons cards** (every civic has a drawback smaller than its upside, and many are *conditional* — war vs peace, home vs foreign territory — so they drastically change how you play). Numbers are **intent**; tune in `packages/data` / `bun run balance` (see [BALANCE.md](BALANCE.md)).
>
> Terminology note: the old three-concept split (civics tree → unlocks governments + policies) collapses into **two** concepts. "Civics" now means the slottable tradeoff cards (absorbing the old `POLICY_DEFS`); the old civic tree nodes become the **government tree**. `POLICY_DEFS` is retired.

---

## 0. Design principles

1. **Every civic is a bargain, not a bonus.** Each civic has pros and cons; the pros clearly outweigh the cons (roughly 2:1 in balance-scorer points), but the con is real enough that a civic is *wrong* for some empires. "Standing Army" is a mistake for a broke pacifist; "Open Markets" is a mistake for a warmonger.
2. **Civics change how you play, not just how big your numbers are.** The catalogue leans on *conditional* effects — at-war vs at-peace, inside vs outside your borders, your religion vs theirs — so adopting a civic is a commitment to a playstyle.
3. **Governments are identities, not upgrades.** The tree has three lineages (**Authority**, **Assembly**, **Faith**). Each government carries its own pros *and cons*, gates which civics you can slot, and switching lineage costs a **revolution**. There is no "best" government — the AI must stop sorting by slot count.
4. **Culture is scarce again.** One culture pool feeds two sinks — researching the next government *and* buying civics — so every adoption delays your next government. Total culture demand is ~4–5× the current tree; nobody finishes everything.
5. **Deterministic & server-authoritative.** All new effects resolve from serializable state (`atWar`, tile ownership, religion majorities) — no randomness, same result on server and every client. Same constraint as religion/trade/victory.
6. **Legible.** Cards show pros in green, cons in red, conditions labeled ("⚔ while at war", "🏠 in home territory"). The player should never be surprised by a hidden malus.

---

## 1. The new model at a glance

- **Government tree** — nodes are governments. You research one at a time with culture (exactly like techs with science). Prereqs are OR-semantics (any listed parent unlocks the child). Researching a government does **not** switch to it; switching is a separate, costly act (§2.4).
- **Civics** — one-time purchases from the same culture pool. Adopting a civic permanently unlocks it, but it only does anything while **slotted**. Slots come from your current government (2 → 6 by tier).
- **Availability** — a civic can be adopted/slotted only if (a) its **branch** is `neutral` or matches your current government's branch(es), or it is that government's **exclusive** civic, and (b) its **tier** ≤ your government's tier.
- **The tension** — culture spent on a civic is culture not spent on the next government; a deep-tree government gives more slots and better civics but costs a revolution if it's off-lineage.

---

## 2. The government tree

### 2.1 Structure

Three branches. `oligarchy` is a deliberate hybrid (Authority + Assembly) so an early despot can pivot toward the republic lineage without a revolution.

```
                              chiefdom (T0)
               ┌───────────────────┼───────────────────┐
          despotism         council_of_elders     priest_kingship      T1 · Bronze
           │      \           /        │                 │
        tyranny    oligarchy      classical_republic  temple_state     T2 · Classical
        │    \      │     \            │                  │
 steppe_khanate  feudal_monarchy   merchant_republic   theocracy       T3 · Medieval
                      │                 │                 │
              absolute_monarchy    trade_league     divine_mandate     T4 · Exploration
```

Prereqs (OR): tyranny←despotism · oligarchy←despotism|council_of_elders · classical_republic←council_of_elders · temple_state←priest_kingship · steppe_khanate←tyranny · feudal_monarchy←tyranny|oligarchy · merchant_republic←classical_republic|oligarchy · theocracy←temple_state · absolute_monarchy←feudal_monarchy · trade_league←merchant_republic · divine_mandate←theocracy.

### 2.2 Government roster

Every government past Chiefdom has at least one con. Slots by tier: **T0=2, T1=3, T2=4, T3=5, T4=6**. Research costs: **T1=90, T2=260, T3=700, T4=1400** (flat, no escalation — escalation lives on civics).

| Government | T | Branch | Cost | Pros | Cons |
|---|---|---|---:|---|---|
| `chiefdom` Chiefdom | 0 | — | 0 | — | — |
| `despotism` Despotism | 1 | Authority | 90 | +10% production | −5% science |
| `council_of_elders` Council of Elders | 1 | Assembly | 90 | +10% culture, +5% food | −5% production |
| `priest_kingship` Priest-Kingship | 1 | Faith | 90 | +20% faith | −5% science |
| `tyranny` Tyranny | 2 | Authority | 260 | all units +2 combat, −20% train time | −10% culture |
| `oligarchy` Oligarchy | 2 | Authority+Assembly | 260 | melee & cavalry +3 combat, +10% gold | −5% science |
| `classical_republic` Classical Republic | 2 | Assembly | 260 | +15% science, +10% culture | units −2 combat outside home territory |
| `temple_state` Temple State | 2 | Faith | 260 | +25% faith, +10% culture | −10% gold |
| `steppe_khanate` Steppe Khanate | 3 | Authority | 700 | cavalry +3 combat, cavalry +1 movement, +100% raid gold | −10% science |
| `feudal_monarchy` Feudal Monarchy | 3 | Authority | 700 | +15% production, cavalry +3 combat | unit upkeep ×1.15 |
| `merchant_republic` Merchant Republic | 3 | Assembly | 700 | +25% gold, +1 trade route capacity | −10% production |
| `theocracy` Theocracy | 3 | Faith | 700 | +30% faith, +10% culture | −10% science |
| `absolute_monarchy` Absolute Monarchy | 4 | Authority | 1400 | +15% production, +15% gold, all units +2 combat | −10% culture |
| `trade_league` Trade League | 4 | Assembly | 1400 | +30% gold, +2 trade route capacity, +10% science | unit upkeep ×1.25 |
| `divine_mandate` Divine Mandate | 4 | Faith | 1400 | +30% faith, +10% gold, +4 combat vs other-religion civs | −10% science |

### 2.3 Research

- `player.researchingGovernment: string | null` + `player.governmentsResearched: Set<string>` replace the civic-research fields. `advanceCivic` in [`economy.ts`](../packages/sim/src/game/economy.ts) becomes `advanceGovernment` — same shape: culture pool ≥ cost → unlock, one per turn, remainder carries.
- Tree still opens with **Writing** (keep `CIVICS_REQUIRED_TECH`).
- Researching a government where you already hold a same-tier one is normal and intended (research wide, hold one).

### 2.4 Switching & revolutions

Switching is a command (`setGovernment`) but no longer free:

- **First adoption** (Chiefdom → any T1) is **free** — no unrest, celebrate it in the log.
- **Same-lineage step** (target shares a branch with current government, e.g. Despotism → Tyranny): **1 turn of unrest**.
- **Revolution** (no shared branch, e.g. Tyranny → Classical Republic): **3 turns of unrest**.
- **Unrest**: all city yields −25% and **all civic slots are emptied** for the duration (`player.unrestTurns: number`, decremented in the turn loop; yields hook in `economy.ts` beside `yieldPercent`).
- After the switch, civics whose branch/tier no longer qualifies are auto-unslotted (they stay adopted). One **free re-slot window**: the turn unrest ends, all slotting is free (§3.3).
- Cooldown: may not switch again for **10 turns** (`player.governmentChangedTurn`).

---

## 3. Civics: adoption & slotting

### 3.1 Adoption

- Civics are bought **instantly** from `player.cultureProgress` when affordable — max **one adoption per turn**. This competes directly with government research (same pool, spend-priority is the player's choice; the buy command simply deducts).
- Cost by tier with escalation: `civicCost(def, adoptedCount) = round(tierCost × 1.15^adoptedCount)` where tierCost = **T1 100 · T2 220 · T3 480 · T4 900**. (Current formula is linear +12% on bases 60–190 — the new curve is both steeper and compounding; the 8th civic costs ~3× sticker.)
- Adoption is **permanent** (a `Set`, like today's `civicsResearched`). No refunds.

### 3.2 Slotting

- `player.slottedCivics: string[]`, capacity = current government's `slots`. Only slotted civics contribute effects.
- Slotting an adopted civic into a **free slot is free**. **Swapping out** a slotted civic costs **10% of that civic's base tier cost** in culture (friction, not a wall).
- Free re-slot windows (all swaps free that turn): the turn you adopt a new civic, and the turn unrest ends after a government switch.

### 3.3 Legality

`civicLegal(player, civicId)`: branch ∈ {`neutral`, any branch of current government} or civic is the current government's exclusive; and `tier ≤ governmentTier`. Checked on adopt, on slot, and re-checked after every government change (illegal slotted civics auto-unslot).

---

## 4. New engine hooks (CivEffects additions)

The merge pipeline (`playerEffects` → `mergeInto`, [`civs.ts:96`](../packages/sim/src/game/civs.ts)) stays as-is — cons are just **negative values** in the same fields, which `mergeInto` already sums. What's new is *conditional* fields that resolve at their point of use, not at merge time:

| New field | Semantics | Applied in |
|---|---|---|
| `warYieldPercent: Partial<Record<Yield, number>>` | added to `yieldPercent` only while **at war with ≥1 major civ** | `economy.ts` yield phase, beside `yieldPercent` ([`economy.ts:355`](../packages/sim/src/game/economy.ts)) |
| `peaceYieldPercent: Partial<Record<Yield, number>>` | added only while at peace with all majors | same |
| `homeCombat: number` | flat combat strength on tiles **owned by the unit's owner** (via `tile.ownerCityId` → city owner, see [`territory.ts`](../packages/sim/src/game/territory.ts)) | `combat.ts` strength calc, beside `unitClassCombat` ([`combat.ts:318`](../packages/sim/src/game/combat.ts)) |
| `foreignCombat: number` | flat combat strength on any tile **not** owned by the unit's owner (neutral wilderness counts as foreign — it works vs barbarians) | same |
| `allUnitCombat: number` | flat combat, all units (today only per-class `unitClassCombat` exists) | same |
| `capitalYieldPercent: Partial<Record<Yield, number>>` | yield % applied to the capital city only | `economy.ts` per-city yield phase |
| `cultureOnKill: number` | culture per enemy unit killed (mirror of existing `faithOnKill`) | `combat.ts` kill rewards |
| `combatVsOtherReligion: number` | flat combat vs units of a civ whose majority religion differs from yours (readers exist in [`religion.ts`](../packages/sim/src/game/religion.ts)) | `combat.ts` |
| `enemyReligionPressurePercent: number` | scales **rival** religions' pressure gain in your cities (−50 = halved) | `religion.ts` spread tick |
| `cityDefenseBonus: number` | flat city combat strength when defending | `combat.ts` city defense |
| `garrisonFreeUpkeep: boolean` | garrisoned units cost no upkeep | `unitUpkeep` ([`economy.ts:740`](../packages/sim/src/game/economy.ts)) |
| `homeHealBonus: number` | extra HP/turn healing inside own territory (beside `unitHealPerTurn`) | healing tick |
| `convertOnCapture: boolean` | captured cities immediately adopt your religion's pressure majority | `combat.ts` captureCity |

Definitions to pin in code comments:
- **At war** = `player.atWar` contains ≥1 **major civ** id (barbarians never count). Add helper `isAtWarWithMajor(state, player)` in `diplomacy.ts`.
- **Home territory** = tile's `ownerCityId` resolves to a city owned by the unit's owner. Everything else — enemy, ally, neutral wilderness — is *not home*. `homeCombat` and `foreignCombat` are independent fields; a civic may set either or both (with opposite signs).

Existing fields the catalogue reuses (no new work): `yieldPercent`, `unitClassCombat`, `militaryMaintenanceCostMultiplier`, `trainTimePercent`, `trainingSlotsBonus`, `startXpBonus`, `startMoraleBonus`, `farmTileFoodBonus`, `raidGoldPercent`, `raidSciencePercent`, `coastalRaidGoldPercent`, `faithOnKill`, `rushWithFaith`, `tradeRouteGoldBonus`, `tradeRouteFaithBonus`, `tradeRouteCapacityBonus`, `landMovementBonus`, `navalMovementBonus`, `cavalryMovementBonus`, `ignoreRoughTerrain`, `meleeVsCityBonus`, `unitHealPerTurn`.

---

## 5. Civic catalogue

43 civics: 12 neutral, 8 per branch, 7 government exclusives. Costs are the §3.1 tier bases before escalation. Pro:con ratio target ≈ 2:1 in balance-scorer points (§9).

### 5.1 Neutral (legal under every government)

| Civic | T | Cost | Pros | Cons |
|---|---|---:|---|---|
| `festivals` Festivals | 1 | 100 | +15% culture | −5% production |
| `corvee_labor` Corvée | 1 | 100 | +15% production; culture can rush production (`rushWithCulture`) | −5% food |
| `militia_levies` Militia Levies | 1 | 100 | unit upkeep ×0.7, −20% train time | all units −2 combat |
| `discipline` Discipline | 1 | 100 | melee +3 combat | +10% train time |
| `standing_army` Standing Army | 2 | 220 | all units +3 combat | unit upkeep ×1.4 |
| `open_markets` Open Markets | 2 | 220 | ☮ +20% gold at peace | ⚔ −10% gold at war |
| `war_footing` War Footing | 2 | 220 | ⚔ +15% production and unit upkeep ×0.75 at war | −5% gold (always) |
| `scholar_patronage` Scholar Patronage | 2 | 220 | +15% science | −10% gold |
| `border_wardens` Border Wardens | 2 | 220 | 🏠 +4 combat in home territory | −2 combat outside it |
| `expeditionary_zeal` Expeditionary Zeal | 2 | 220 | +4 combat outside home territory | 🏠 −2 combat at home |
| `naval_tradition` Naval Tradition | 2 | 220 | naval units +3 combat, +1 movement | −5% production |
| `centralization` Centralization | 3 | 480 | capital +25% all yields | −5% gold empire-wide |

### 5.2 Authority branch

| Civic | T | Cost | Pros | Cons |
|---|---|---:|---|---|
| `warrior_aristocracy` Warrior Aristocracy | 1 | 100 | melee & cavalry +3 combat | −10% science |
| `spoils_of_war` Spoils of War | 1 | 100 | +100% raid gold, +3 culture per kill | ☮ −5% gold at peace |
| `conscription` Conscription | 2 | 220 | −30% train time, +1 training slot | new units −10 starting XP |
| `iron_discipline` Iron Discipline | 2 | 220 | +10 starting morale, +5 HP/turn healing at home | −5% culture |
| `serfdom` Serfdom | 2 | 220 | farms +1 food, +10% production | −10% culture |
| `royal_garrisons` Royal Garrisons | 3 | 480 | cities +6 defense, garrisoned units free upkeep | −5% gold |
| `military_state` Military State | 3 | 480 | ⚔ +20% production at war; unit upkeep ×0.8 (always) | −10% science |
| `total_war` Total War | 3 | 480 | melee +25% vs cities, +50% raid science | ⚔ −10% gold at war |

### 5.3 Assembly branch

| Civic | T | Cost | Pros | Cons |
|---|---|---:|---|---|
| `public_assembly` Public Assembly | 1 | 100 | +10% science, +5% culture | −5% production |
| `civic_pride` Civic Pride | 1 | 100 | +10% culture, +10% food | −5% gold |
| `free_artisans` Free Artisans | 2 | 220 | +15% production, +10% gold | unit upkeep ×1.2 |
| `citizen_militia` Citizen Militia | 2 | 220 | 🏠 +5 combat at home, unit upkeep ×0.8 | −3 combat outside home |
| `merchant_guilds` Merchant Guilds | 2 | 220 | +50% trade route gold, +1 route capacity | −5% production |
| `natural_philosophy` Natural Philosophy | 3 | 480 | +25% science | −10% faith |
| `rule_of_law` Rule of Law | 3 | 480 | ☮ +15% **all** yields at peace | ⚔ −10% all yields at war |
| `patronage_of_arts` Patronage of the Arts | 3 | 480 | +25% culture, +10% gold | −10% production |

### 5.4 Faith branch

| Civic | T | Cost | Pros | Cons |
|---|---|---:|---|---|
| `ancestor_worship` Ancestor Worship | 1 | 100 | +10% culture, +10% faith | −5% gold |
| `divine_kingship` Divine Kingship | 1 | 100 | +15% faith, +5% production | −5% science |
| `temple_economy` Temple Economy | 2 | 220 | +15% gold, +10% faith | −5% science |
| `pilgrimage` Pilgrimage | 2 | 220 | +20% faith, trade routes +2 faith | −5% gold |
| `monastic_orders` Monastic Orders | 3 | 480 | +15% science, +15% faith | −10% gold |
| `theocratic_levies` Theocratic Levies | 3 | 480 | faith can rush units (`rushWithFaith`), +5 starting morale | +10% train time |
| `holy_war` Holy War | 3 | 480 | +4 combat vs other-religion civs, +3 faith per kill | −10% science |
| `inquisition` Inquisition | 4 | 900 | rival religion pressure −50% in your cities, +10% faith | −10% science |

### 5.5 Government exclusives (legal only under their government)

| Civic | Government | T | Cost | Pros | Cons |
|---|---|---|---:|---|---|
| `knightly_orders` Knightly Orders | feudal_monarchy | 3 | 480 | cavalry +5 combat, cavalry +10 HP/turn at home | cavalry upkeep ×1.5 |
| `horse_lords` Horse Lords | steppe_khanate | 3 | 480 | cavalry +1 movement, cavalry ignore rough terrain | −10% science |
| `letters_of_marque` Letters of Marque | merchant_republic | 3 | 480 | naval +4 combat, +100% coastal raid gold | ☮ −5% gold at peace |
| `state_church` State Church | theocracy | 3 | 480 | +20% faith, +10% culture | −5% gold |
| `divine_right` Divine Right | absolute_monarchy | 4 | 900 | capital +20% all yields, cities +6 defense | −10% culture |
| `banking_houses` Banking Houses | trade_league | 4 | 900 | +30% gold, +50% trade route gold | all units −2 combat |
| `holy_conquest` Holy Conquest | divine_mandate | 4 | 900 | +6 combat vs other-religion civs, captured cities convert to your religion | −10% gold |

**Retired:** `POLICY_DEFS` entries map into the above — `discipline`→`discipline`, `urban_planning`→`free_artisans`, `maneuver`→`horse_lords`, `god_king`→`divine_kingship`, `literary_tradition`→`festivals`/`patronage_of_arts`, `natural_philosophy`→`natural_philosophy`, `caravans`→`merchant_guilds`, `corvee`→`corvee_labor`. Old civic-tree nodes (`code_of_laws`, `early_empire`, …) are retired outright; their gating role moves to the government tree.

---

## 6. Costs & pacing

- **Current total** to finish everything: ~1,300 culture (11 civics, shallow escalation). **New totals:** one full government path (T1→T4) = 2,450; 8 civics at mixed tiers with 1.15^n escalation ≈ 3,500–4,500. A completionist would need **~10,000+ culture** — intentionally unreachable.
- **Design targets** (validate in AI-vs-AI runs, cf. [AI tuning](ai-tuning.md) methodology):
  - Average civ at game end: **T3 government, 5–6 adopted civics**.
  - Culture-focused civ: **T4 by ~75% of the turn limit**, 8–10 civics.
  - First T1 government: ~turn 25–35 (shortly after Writing). *Observed (M-C5 spot-check, 3-civ AI game): first T1 ≈ turn 37 — a touch slow; nudge if longer runs confirm (cheaper T1 nodes, or the AI prioritising Writing sooner).*
  - A T2 civic should feel like ~8–12 turns of empire culture output mid-game.
- Culture's balance-scorer weight (0.85 pts per 1%, [BALANCE.md](BALANCE.md)) rises in value since culture now buys real power; re-run `bun run balance` after implementation and re-tune civ culture abilities if they dominate.

---

## 7. AI changes ([`ai.ts`](../packages/sim/src/game/ai.ts))

1. **Government research choice**: score each researchable government = `effectScore(gov.effects)` + Σ top-`slots` `effectScore(civic.effects)` over its legal pool, weighted by personality (warmonger → Authority, builder/science → Assembly, religious → Faith). Replace the `sort by slots` pick at `ai.ts:1785`.
2. **Switching**: only switch when (score gain over current government, over ~20 turns) > (unrest cost ≈ 25% yields × unrest turns + re-slot fees). Never switch while at war unless the target is war-leaning.
3. **Civic adoption**: replace "first available" with `effectScore` ranking; budget guard — don't buy a civic if it would delay an in-progress government by more than N turns unless at war and the civic is martial.
4. **`effectScore` extensions**: score the new conditional fields — `warYieldPercent`/`homeCombat`/etc. weighted by current war state (the `atWar` param already exists in `rankPolicies`, [`ai.ts:118`](../packages/sim/src/game/ai.ts)); cons are negative values and score naturally.
5. **Re-slotting triggers**: on war declared/peace made, re-rank slotted civics and use the swap mechanic (pay the 10% fee only if the score swing is large); always re-slot for free in the post-unrest window.

---

## 8. UI, wiki, serialization

- **UI** ([`ui.ts`](../packages/client/src/ui.ts) `renderCivics`, ~2184): replace the flat list with (a) a **government tree panel** reusing the tech-tree rendering pattern (nodes, prereq edges, research progress bar), (b) a **civic card grid** — adopted vs adoptable vs locked-by-government, pros green / cons red, condition badges (⚔ ☮ 🏠), (c) slot row with drag/tap slotting and the swap-fee confirm, (d) a **revolution confirm dialog** stating unrest turns and slot loss. Turn-update prompts: "government research complete" and the free re-slot window.
- **Wiki** ([`wiki.ts`](../packages/client/src/wiki.ts)): a **Governments** category page per government (branch, pros/cons, civic pool) and a **Civics** category generated from `CIVIC_DEFS`.
- **Serialization** ([`serialize.ts`](../packages/sim/src/game/serialize.ts)): replace `researchingCivic`/`civicsResearched` with `researchingGovernment`, `governmentsResearched: string[]`, `civicsAdopted: string[]`, `slottedCivics: string[]`, `unrestTurns`, `governmentChangedTurn`. Games are in-memory only (no Postgres persistence yet) — **no save migration needed**; bump the protocol/schema version so stale clients resync.
- **Data model** ([`data/index.ts`](../packages/data/src/index.ts)): `GovernmentDef` gains `branch: Branch[]`, `tier`, `cost`, `prereqGovernments: string[]` (OR), `exclusiveCivics: string[]`. `CivicDef` becomes `{ id, name, desc, tier, branch: "neutral" | Branch | "exclusive", effects: CivEffects }` (cons = negative values in the same `effects` object; no separate pros/cons structs — the UI splits by sign).

---

## 9. Balance scorer integration ([BALANCE.md](BALANCE.md))

- Cons score as **negative points** through the existing weights — no new machinery.
- **Conditional discount**: effects gated on war/peace score at **60%** of face value; home/foreign territory gates at **70%**; religion-conditional at **50%**. Add these multipliers to the scorer so civics/governments get one comparable number.
- Acceptance band per civic: net score of a Tn civic ≈ net score of other Tn civics ±20%; governments within a tier within ±15% of each other.

---

## 10. Tests

Extend/replace `civs`-related tests plus a new `governments.test.ts`:
- tree legality (prereq OR-semantics, tier gating, Writing gate)
- adoption cost escalation math; one-adoption-per-turn; pool competition (adoption delays government research)
- slotting: capacity, swap fee, free windows, auto-unslot on government change
- revolution: unrest yield malus, slot emptying, same-lineage vs cross-lineage turn counts, 10-turn cooldown, free first adoption
- each new CivEffects hook: one combat test (home/foreign/religion), one economy test (war/peace/capital yields), upkeep (garrison-free), religion pressure scaling, convert-on-capture
- AI: government scoring prefers branch matching personality; no switch during losing war; determinism (same seed → same choices)

---

## 11. Build sequence

Vertical slices through the established seams (`state → economy/commands → serialize → session → ai → client → wiki → tests`), each shippable:

- **M-C1 — Engine hooks. ✅ DONE.** All §4 CivEffects fields + `isAtWarWithMajor` (`diplomacy.ts`) + `tileOwnerId` home-territory check (`territory.ts`) + `playerReligionId`/`convertCityToPlayerReligion` (`religion.ts`), applied in combat/economy/religion. Covered by `packages/sim/src/game/civic-hooks.test.ts` (13 tests). No data changes yet — pure capability.
- **M-C2 — Government tree. ✅ DONE.** New `GovernmentDef`/`CivicDef` shapes, all 15 governments (`data/index.ts`), tree research (`advanceGovernment`), switching + unrest/revolution + 10-turn cooldown (`switchGovernment`/`tickUnrest` in `commands.ts`), −25% unrest yield malus (`economy.ts`), serialization (both paths). Covered by `government.test.ts`.
- **M-C3 — Civics adoption & slots. ✅ DONE.** `adoptCivic`/`slotCivic`/`unslotCivic` commands, one-adoption-per-turn, escalating cost (1.15^n), slot capacity, 10% swap fee + free re-slot windows, legality re-check + auto-unslot on switch, functional Governments & Civics client panel. `POLICY_DEFS` retired; the 8 old policies migrated into the catalogue (discipline, corvée→corvee_labor, urban_planning→free_artisans, maneuver→horse_lords, god_king→divine_kingship, literary_tradition→festivals/patronage, natural_philosophy, caravans→merchant_guilds). Combined with M-C2 (no throwaway policy bridge).
- **M-C4 — Full catalogue + AI. ✅ DONE.** All 43 civics + 15 governments as data. Wiki **Governments** and **Civics** category pages (pro/con badges) in `wiki.ts`. AI (`ai.ts`): `effectScore` rewritten to weight the new conditional fields by war state and discount conditional/capital effects; `governmentValue` scores a node by its effects + its best-`slots` legal civics; research picks best value, switching weighs the unrest cost and won't revolt mid-war unless the target is Authority-leaning; civic adopt/slot ranked by `effectScore`. AI governance + determinism tests in `ai.test.ts`.
- **M-C5 — Balance pass. ✅ DONE.** Scorer integration (§9): `scoreEffects` extended for the conditional/M-C1 fields with the §9 discounts (`tools/balance/weights.ts` `CONDITIONAL_DISCOUNT`/`CIVIC_PTS`), plus a `bun run balance --civics` report grouping by tier with the acceptance bands. Tuned effect magnitudes across the catalogue until **56/58 entries land in-band** — the two intentional outliers are Oligarchy (the 2-branch hybrid, premium by design) and Naval Tradition (niche/situational). Catalogue tables above reflect the shipped numbers. *Ongoing:* longer AI-vs-AI pacing runs to confirm the §6 turn targets (culture-economy costs are unchanged from the design intent).
