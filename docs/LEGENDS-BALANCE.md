# Legends Balance — the Hero Power-Budget model

> **Status: IMPLEMENTED (2026-07-11).** The §5.2 stats, the three new heroes (§7),
> and the structural fixes (§4: combat nerf folded into printed stats, `def.lifespan`
> now honored, the ranged track filled) are all live in `@roc/data` + `@roc/sim`.
> This doc does for the now-32 Legends what [BALANCE.md](BALANCE.md) does for the 137
> civs: assigns every hero a single comparable **power budget**. Companion to
> [GREAT-PEOPLE.md](GREAT-PEOPLE.md) §2 (identity & intent).
>
> **One deviation from the proposal:** Mehmed II keeps his **catapult** body (not
> bombard). Bombard's `gunpowder` reload gate (fires every other turn) stacked on
> the Basilica ability's 2-turn cooldown would nearly disable him, and bombard has
> movement 1. His other buffs (aura 5, Basilica +8 vs walls, 20-turn lifespan) land
> him at ~53 regardless.
>
> Sources of truth scored here: `LEGENDS` (`@roc/data` index.ts), kit overrides
> (`sim/content.ts` LEGEND_ABILITY_OVERRIDES), passives (`sim/legend-passives.ts`,
> `sim/legend-effects.ts`), life extensions (`sim/legend-lifespan.ts`), and the
> recruit economy (`sim/legend-earning.ts`).

---

## 1. Why legends need their own model

Legends differ from civs in three ways that change the scoring:

1. **They are bought from a shared, escalating market.** Every hero on a track
   costs the same rising glory price (50 → 85 → 120 …, `legend-earning.ts`),
   regardless of era or quality. So unlike civs (where every player gets exactly
   one), a mispriced hero is *always* picked first and a weak one is *never*
   picked. Equal budgets matter even more here.
2. **They are temporary.** Everything a hero does is multiplied by how long it
   lives, and lifespans are wildly unequal in practice because life-extension
   triggers differ (a kill-extended war hero in a long war is near-permanent; a
   `revolution`-extended hero almost never triggers).
3. **They are single units.** A hero's *body* (the base unit it reskins) is part
   of its budget. A support hero on a `warrior` body (strength 8) in the Medieval
   era is a liability that dies to anything, no matter what its passive pays.

### The formula

```
legendValue = (Body + Self + Aura + Kit + Signature + Longevity + Life) × Naval × EraWeight
```

| Component | What it measures | Weight |
|---|---|---|
| **Body** | Base-unit quality vs. a 13-strength reference: `(effStr − 13) × 2 + (move − 2) × 3`, plus small adders for range (+4–6), bonus_vs_city (+2), route resistance (+1–3) | see table §2 |
| **Self** | The hero's own combat bonus, **after** the `LEGEND_COMBAT_NERF −2` | 4 pts / effective point |
| **Aura** | Adjacent-ally combat bonus (multi-unit, but adjacency-gated) | 5 pts / point |
| **Kit** | Active abilities **beyond the base unit's stock kit** (mirrors the civ UU rule: an inherited kit scores 0) | hand-scored 0–10 |
| **Signature** | The passive/presence power, valued over a 15-turn life (hand-scored like LEADER_NET) | hand-scored |
| **Longevity** | Expected value of life-extension triggers: kill 7 · tech 6 · civic 5 · city-capture 4 · pillage 3 · city-converted 3 · revolution 1 (cap 12; kill only counts at 7 if the hero can actually fight) | sum, capped |
| **Life** | Deviation from the 15-turn base lifespan: ±1.5 pts / turn (a knob — see §5.2) | ±1.5 / turn |
| **Naval** | Naval heroes only matter on water maps | ×0.85 |
| **Rechargeable** | Returns to the pool on retirement (Joan only) | +8 flat |

**Era weight** encodes compounding, exactly as in BALANCE.md — an early hero's
kills, gold, and tempo snowball; a late hero must be raw-bigger to be worth the
same glory:

| Legend era | Weight |
|---|---|
| Bronze | ×1.3 |
| Classical | ×1.0 |
| Medieval | ×0.8 |
| Exploration | ×0.65 |

**Target band: 61 ± 9 (52–70).** Mirrors the civ band philosophy: a war hero
should out-score on Self/Kit and a support hero on Signature — the **total** is
what we equalise, not the shape.

---

## 2. Body scores (base-unit reference)

| Base unit | Str (rng) | Move | Adders | Body |
|---|---|---|---|---|
| warrior | 8 | 2 | — | **−10** |
| spearman | 11 | 2 | vs-cav +2, routeRes +1 | **−1** |
| axeman | 13 | 2 | — | **0** |
| hoplite | 13 | 2 | vs-cav +2, routeRes +2 | **4** |
| swordsman | 15 | 2 | — | **4** |
| war_chariot | 13 | 4 | — | **6** |
| legionary | 15 | 2 | routeRes +3 | **7** |
| longswordsman | 18 | 2 | — | **10** |
| horse_archer | 7 (9) | 4 | range +4 | **2** |
| cataphract | 17 | 3 | routeRes +2 | **13** |
| war_elephant | 16 | 3 | vs-city +2, routeRes +2 | **13** |
| catapult | 6 (14) | 2 | range-2 +6, vs-city +2 | **10** |
| crossbowman | 8 (14) | 2 | range-2 +6 | **8** |
| trireme | 16 | 3 | — | **9** |
| longship | 12 | 4 | — | **4** |

---

## 3. Current roster, scored

Raw = Body + Self + Aura + Kit + Sig + Long (+8 rechargeable for Joan).
Total = Raw × Naval × Era. **Mean ≈ 53 · spread 17–82 · band 52–70.**

| Legend | Era | Body | Self | Aura | Kit | Sig | Long | Raw | Total | Flag |
|---|---|---|---|---|---|---|---|---|---|---|
| Alexander | Cla | 13 | 32 | 20 | 6 | 0 | 11 | 82 | **82** | ▲HIGH |
| Gilgamesh | Bro | 0 | 28 | 15 | 8 | 0 | 7 | 58 | **75** | ▲HIGH |
| Julius Caesar | Cla | 7 | 28 | 20 | 9 | 0 | 11 | 75 | **75** | ▲HIGH |
| Hannibal | Cla | 13 | 28 | 20 | 6 | 0 | 7 | 74 | **74** | ▲HIGH |
| Cyrus | Cla | 13 | 28 | 15 | 0 | 10 | 4 | 70 | **70** | edge |
| Boudica | Cla | 6 | 24 | 20 | 9 | 0 | 10 | 69 | **69** | ok |
| Ramesses II | Bro | 6 | 8 | 15 | 0 | 18 | 5 | 52 | **68** | ok |
| Genghis Khan | Med | 2 | 32 | 25 | 8 | 8 | 7 | 82 | **66** | ok |
| Saladin | Med | 13 | 28 | 20 | 8 | 0 | 10 | 79 | **63** | ok |
| El Cid | Med | 13 | 28 | 20 | 0 | 10 | 7 | 78 | **62** | ok |
| Joan of Arc | Med | 10 | 24 | 25 | 8 | 0 | 3 (+8) | 78 | **62** | ok |
| Leonidas | Cla | 4 | 24 | 20 | 6 | 0 | 7 | 61 | **61** | ok |
| Belisarius | Med | 13 | 28 | 20 | 0 | 6 | 4 | 71 | **57** | ok |
| Subutai | Med | 2 | 28 | 20 | 8 | 0 | 11 | 69 | **55** | ok |
| Tamerlane | Exp | 13 | 32 | 20 | 8 | 0 | 11 | 84 | **55** | ok |
| Attila | Med | 2 | 28 | 20 | 7 | 0 | 10 | 67 | **54** | ok |
| Tomoe Gozen | Med | 2 | 28 | 20 | 6 | 0 | 7 | 63 | **50** | ▼low |
| Sun Tzu | Cla | 4 | 4 | 20 | 0 | 10 | 11 | 49 | **49** | ▼LOW |
| Charlemagne | Med | 10 | 12 | 20 | 7 | 5 | 6 | 60 | **48** | ▼LOW |
| Harald Hardrada | Med | 4 | 28 | 20 | 6 | 0 | 10 | 68 ×.85 | **46** | ▼LOW |
| Ashoka | Cla | 13 | 8 | 15 | −4 | 10 | 3 | 45 | **45** | ▼LOW |
| Yi Sun-sin | Exp | 9 | 32 | 20 | 10 | 0 | 7 | 78 ×.85 | **43** | ▼LOW |
| Qin Shi Huang | Cla | 4 | 4 | 15 | 0 | 14 | 5 | 42 | **42** | ▼LOW |
| Zheng He | Exp | 9 | 24 | 20 | 5 | 10 | 6 | 74 ×.85 | **41** | ▼LOW |
| Mehmed II | Exp | 10 | 16 | 20 | 8 | 0 | 4 | 58 | **38** | ▼LOW |
| Hammurabi | Bro | −10 | 0 | 15 | 0 | 12 | 5 | 22 | **29** | ▼LOW |
| Pachacuti | Exp | 4 | 4 | 15 | 0 | 14 | 5 | 42 | **27** | ▼LOW |
| Mansa Musa | Med | −10 | 0 | 15 | 0 | 16 | 6 | 27 | **22** | ▼LOW |
| Cleopatra | Cla | −10 | 0 | 15 | 0 | 9 | 3 | 17 | **17** | ▼LOW |

Notes on components: Ashoka's Kit is **−4** because his (deliberately) empty
override strips the war elephant's stock Trample. Cyrus's Sig is King's March
(+1 move, self + adjacent). Genghis's Sig is the −3 morale/turn adjacency tick.

### What the scores say (read the clusters, not the individuals)

1. **The support archetype is systematically broken, not individually mistuned.**
   Cleopatra 17, Mansa Musa 22, Pachacuti 27, Hammurabi 29, Qin 42, Sun Tzu 49 —
   every hero whose value is a passive sits at the bottom. Three causes stack:
   the `warrior`/`swordsman` bodies are paper (−10 to +4 Body), the −2 combat
   nerf zeroes their printed combat bonus (Cleopatra's "2" is effectively 0), and
   their passives are priced timidly (+3 gold/turn does not buy a hero slot).
2. **The Classical cataphract conqueror is the stat template everyone else is
   measured against — and it wins.** Alexander 82, Caesar 75, Hannibal 74,
   Cyrus 70: best bodies, biggest self bonuses, and double life-extensions
   (kill + capture) in the era with full compounding weight.
3. **Every Exploration hero is under water** (Tamerlane only survives on raw
   stats). The same glory price buys 35% less compounding time, and their
   magnitudes were never raised to pay for it. Same late-perks-must-be-bigger
   rule as BALANCE.md §1.
4. **Naval heroes are double-discounted** (situational ×0.85 *and* late eras),
   so Harald/Zheng He/Yi Sun-sin all flag low.

---

## 4. Structural findings (fix these regardless of stats)

1. **The ranged track is EMPTY.** `legend-earning.ts` banks glory for five
   tracks, but zero of 29 legends map to `ranged`. A player who trains archers
   and wins with them accrues glory that can never be spent. Either add ranged
   legends (§7) or stop accruing/showing a dead track.
2. **Track congestion is extreme:** cavalry **14**, melee **11**, naval **3**,
   siege **1**, ranged **0**. The escalating threshold self-balances *within* a
   track (each recruit raises the next price), but it means a cavalry player has
   14 heroes competing at rising prices while a siege player caps out at one
   cheap hero. §6/§7 rebalance this to roughly 9 / 15 / 3 / 2 / 3 with the three
   proposed additions.
3. **`LegendDef.lifespan` is dead data.** `recruitLegend` uses
   `LEGEND_DEFAULT_LIFESPAN` (15) unconditionally; the per-def field is ignored.
   Make the code honor `def.lifespan` — it is the single best balance knob this
   system has (§5.2) and it is already in the data model and the UI copy.
4. **`LEGEND_COMBAT_NERF = 2` is a hidden lie in the UI.** Support heroes show
   "combat bonus 2" and get 0. Fold the nerf into the data (store effective
   values, delete the constant) so printed stats are honest and tunable per hero.
5. **Life-extension triggers are a shadow budget nobody priced.** Kill-extension
   on a 30-strength fighter is worth several times `revolution`-extension on a
   support hero. Sun Tzu (tech **and** civic, +2 each) can plausibly sustain
   himself indefinitely in a tall empire — fine today only because his combat
   value is tiny; re-check whenever his numbers change.

---

## 5. The rebalance

### 5.1 Design rules

- **Support heroes stop pretending to fight.** They get era-appropriate
  bodyguard bodies (no more Medieval heroes on strength-8 warrior bodies), real
  printed combat bonuses (post-nerf-fold), and passives priced like the hero
  slot they occupy.
- **Lifespan scales with era.** Bronze/Classical heroes burn bright and brief
  (12–15 turns); Medieval 15–20; Exploration 20–25. This is the mechanical
  answer to "late heroes compound less" — they simply live longer.
- **The conqueror template gets a haircut, not a rework.** Trim aura/self by 1
  and drop one of the two life-extension triggers on the double-dippers.
- **Naval heroes ride the band floor deliberately** (~50–52). They score on
  land-average maps; on archipelago maps their effective value is ÷0.85. Pushing
  them to band center would make them oppressive on water maps.

### 5.2 Per-legend proposed stats

Only changed fields listed; everything else stays. "CB" = combatBonus (values
below assume the nerf is folded in, i.e. printed = effective; to keep the
current nerf instead, add +2 to every CB below).

#### Bronze

| Legend | Now | Changes | New total |
|---|---|---|---|
| **Gilgamesh** | 75 ▲ | CB 9→**6** (eff. −1) · lifespan 15→**12** (his immortality is earned kill by kill; extensions unchanged) | **64** |
| **Hammurabi** | 29 ▼ | body warrior→**spearman** · CB 2→**2** (eff. +2) · aura 3→**4** · Code of Laws morale +1→**+2**/turn | **69** |
| **Ramesses II** | 68 | unchanged | **68** |

#### Classical

| Legend | Now | Changes | New total |
|---|---|---|---|
| **Alexander** | 82 ▲ | CB 10→**7** (eff. −1) · aura 4→**3** · life-ext: drop the kill trigger, keep city-capture +2 | **66** |
| **Julius Caesar** | 75 ▲ | CB 9→**6** (eff. −1) · kit: drop `hide` (a hiding legion is silly anyway), keep Pilum + Plunder | **69** |
| **Hannibal** | 74 ▲ | aura 4→**3** | **69** |
| **Cyrus** | 70 | unchanged — top of band, watch | **70** |
| **Boudica** | 69 | unchanged | **69** |
| **Leonidas** | 61 | unchanged | **61** |
| **Sun Tzu** | 49 ▼ | body swordsman→**crossbowman** (Warring-States crossbows; **founds the ranged track**) · aura 4→**5** · drill +3→**+5** XP/turn | **62** |
| **Qin Shi Huang** | 42 ▼ | CB 3→**3** (eff. +2) · Great Wall +6→**+10** city defense · lifespan 15→**20** (the emperor who chased immortality) | **64** |
| **Ashoka** | 45 ▼ | Dhamma faith +2→**+4**/turn · heal +10→**+15** · add life-ext: civic adopted +2 (keep the empty kit — he renounced the charge) | **56** |
| **Cleopatra** | 17 ▼ | body warrior→**war_chariot** (the queen's chariot) · CB 2→**3** (eff. +3) · aura 3→**4** · Allure −2→**−3** · gold +3→**+6**/turn · add life-ext: tech +2 (the scholar-queen) | **65** |

#### Medieval

| Legend | Now | Changes | New total |
|---|---|---|---|
| **Genghis Khan** | 66 | unchanged — the ceiling for the era | **66** |
| **Saladin** | 63 | unchanged | **63** |
| **El Cid** | 62 | unchanged | **62** |
| **Joan of Arc** | 62 | unchanged (rechargeable stays unique to her) | **62** |
| **Attila** | 54 | aura 4→**5** | **58** |
| **Belisarius** | 57 | unchanged | **57** |
| **Charlemagne** | 48 ▼ | CB 5→**5** (eff. +2) · Crown of the West faith +2→**+3**/turn | **57** |
| **Mansa Musa** | 22 ▼ | body warrior→**swordsman** (the hajj escort) · CB 2→**2** (eff. +2) · Golden Flood +8→**+14** gold/turn **and +2 faith/turn** · lifespan 15→**20** | **56** |
| **Subutai** | 55 | unchanged | **55** |
| **Tomoe Gozen** | 50 ▼ | CB 9→**8** (eff. +1) · kit: Fire & Retreat→**Parthian Shot** (the archer of archers shoots after moving) | **55** |
| **Harald Hardrada** | 46 ▼ | CB 9→**8** (eff. +1) · aura 4→**5** | **52** |

#### Exploration

| Legend | Now | Changes | New total |
|---|---|---|---|
| **Tamerlane** | 55 | unchanged | **55** |
| **Mehmed II** | 38 ▼ | body catapult→**bombard** (it IS Orban's gun) · CB 6→**6** (eff. +2) · aura 4→**5** · Basilica +6→**+8** vs walls/forts · lifespan 15→**20** | **54** |
| **Pachacuti** | 27 ▼ | body swordsman→**legionary** (the Inca royal guard) · CB 3→**4** (eff. +3) · aura 3→**4** · garrison +25% food→**+25% food AND +25% production** (keep empire-wide rough-terrain pass) · lifespan 15→**25** (a 33-year reign) | **54** |
| **Zheng He** | 41 ▼ | Treasure Fleet gold +4→**+10**/turn · aura 4→**5** · lifespan 15→**20** | **52** |
| **Yi Sun-sin** | 43 ▼ | aura 4→**5** · lifespan 15→**20** | **50** |

### 5.3 Proposed roster after the pass

Mean ≈ **60** · spread **50–70** · zero flags outside the naval floor (which is
intentional, §5.1). Shape preserved: conquerors still peak on Self/Kit,
supports on Signature, and the era ceiling still slopes downward into lifespan.

---

## 6. Recruit-economy notes (no changes proposed yet)

`THRESHOLD_BASE 50 / STEP 35` and the earn rates (train 8, civ kill 12, barb
kill 5, camp 6) look sane *given* equal hero budgets — the whole point of this
pass is that price can stay flat because value becomes flat. Re-examine only
after the stats land: if playtests show first-hero timing arriving before the
first war resolves, raise `THRESHOLD_BASE`, not per-hero prices.

---

## 7. Roster gaps — three proposed additions (optional, separate PR)

These fix the empty/starved tracks (§4.1–4.2) without touching existing heroes.
All three are absent from the Great People roster, so the no-double-dipping rule
(GREAT-PEOPLE.md) holds.

| New legend | Era | Track | Sketch | Est. total |
|---|---|---|---|---|
| **Amanirenas** | Classical | **ranged** | The one-eyed Kushite queen who fought Augustus to a treaty. Body `archer`, CB 6 (eff.), aura 4, kit Aimed Shot + Skirmish, life-ext: kill +1 | ~59 |
| **Zhuge Liang** | Medieval | **ranged** (support) | The Sleeping Dragon. Body `crossbowman`, CB 2 (eff.), aura 4, kit Repeating Fire, Sig: +2 science/turn and adjacent ranged/siege units drill +3 XP/turn, life-ext: tech +2, civic +2 | ~52 |
| **Demetrius Poliorcetes** | Classical | **siege** | "The Besieger." Body `catapult`, CB 5 (eff.), aura 4, kit Siege Volley, life-ext: city-capture +2 | ~61 |

Resulting track spread: melee 9 · cavalry 15 · ranged 3 · siege 2 · naval 3.
Cavalry stays heavy — acceptable because it is the most contested (self-pricing)
track and thematically earned, but it is the first place to look when adding
future heroes (prefer melee/ranged/siege bodies).

---

## 8. Implementation checklist (when this is greenlit)

1. `sim/legends.ts` `recruitLegend`: use `def.lifespan` instead of
   `LEGEND_DEFAULT_LIFESPAN` (keep the constant as the fallback).
2. Fold `LEGEND_COMBAT_NERF` into `LEGENDS[].combatBonus` (−2 across the board,
   floor 0) and delete the constant + the `Math.max` in `legendCombatBonus`.
3. Apply §5.2 stat/body/aura/kit/passive/lifespan changes in `@roc/data`
   `LEGENDS`, `sim/content.ts` LEGEND_ABILITY_OVERRIDES,
   `sim/legend-passives.ts`, `sim/legend-effects.ts`, `sim/legend-lifespan.ts`.
   Update each `abilityDesc`/`auraDesc` to match (keep them honest; no em
   dashes, no unregistered emoji in game copy).
4. New bodies referenced: `spearman`, `crossbowman`, `war_chariot`, `swordsman`,
   `legionary`, `bombard` — all exist in `UNIT_DEFS`; verify `bombard`'s
   gunpowder reload interacts sanely with Basilica Bombard's cooldown.
5. Optional: §7 additions (data + portraits via the art pipeline + wiki lore in
   `history-people.ts`).
6. Optional but recommended: extend `tools/balance` with `bun run balance
   --legends` implementing §1's formula so this table never goes stale.
