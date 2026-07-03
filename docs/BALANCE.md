# Civilization Balance — the Power-Budget model

> **Status: v1 (2026-07-01).** A runnable scorer (`tools/balance/`) assigns every
> civilization a single comparable **power budget** so rebalancing is measurable
> instead of by-feel. This doc explains the model; the numbers live in
> [`tools/balance/weights.ts`](../tools/balance/weights.ts) and are meant to be tuned.
>
> Run it: `bun run balance` (ranked table) · `bun run balance --civ rome` (one
> breakdown) · `bun run balance --csv` (spreadsheet import).

Companion to [CIVILIZATIONS.md](CIVILIZATIONS.md) (identity & intent),
[LEADER-ABILITIES.md](LEADER-ABILITIES.md), and [UNIT-ABILITIES.md](UNIT-ABILITIES.md).
Those define *what* each civ is; this defines *how much* it is worth.

---

## 1. The core idea

Every civ is built from **five pillars**:

| Pillar | Source of truth | Notes |
|---|---|---|
| **Passive civ ability** | `CIVILIZATIONS[].effects` (`@roc/data`) | Always-on `CivEffects` |
| **Unique unit** | `UNIQUE_UNITS` + `UNIQUE_ABILITY_OVERRIDES` | Flat combat bonus + (optional) bespoke active ability |
| **Unique infrastructure** | `UNIQUE_INFRA` | One extra building *or* tile improvement |
| **Leader active ability** | `LEADER_ABILITIES` (`@roc/sim`) | Cooldown-gated, deliberately double-edged |
| **Starting setup** | `startingUnits`, `capitalPopulationBonus` | Turn-1 loadout |

Each pillar is scored in one shared **point currency**, and we want every civ's
**total** to land in a narrow band around the mean. *Where* a civ spends its budget
(economy vs. military, early vs. late) is its identity; *how much* it spends should
be roughly equal.

### Value = Magnitude × Timing-weight

The one principle that makes late and early perks comparable:

```
pillarValue = magnitude(points) × timingWeight(when it comes online)
```

An early advantage **compounds** (an extra citizen on turn 5 snowballs into more
cities, more research, more army), so an early point is worth more than a late one.
The timing weight encodes that:

| Era (when the benefit is usable) | Weight |
|---|---|
| **Start** — passive abilities, starting units | **×1.5** |
| **Ancient** — bronze, the wheel, masonry, equestrian | ×1.3 |
| **Classical** — iron, mathematics, coinage, philosophy | ×1.0 |
| **Medieval** — crossbow, engineering, statecraft | ×0.8 |
| **Late** — gunpowder, astronomy, monumental architecture | ×0.65 |

Because we hold *value* equal, a late-unlocking unit or ability must carry **more
raw magnitude** to match an early one — this is the "late perks should be bigger"
intuition, made mechanical.

**Era is computed, not hand-assigned.** The scorer walks each tech/civic's
**cumulative research cost** (its own cost plus every prerequisite) and buckets it
into an era (`ERA_COST_BANDS`). So the timing of a UU is the era of the base unit's
`reqTech`; a building's is its `reqTech`; a leader ability's is its `unlock`.

---

## 2. Magnitude — the point currency

All magnitudes are anchored to city-yield percentages. The full table is in
`weights.ts`; the anchors:

| Effect | Points |
|---|---|
| +1% gold / production / science / food / culture / faith | 1.05 / 1.0 / 1.0 / 0.85 / 0.85 / 0.7 |
| +1 flat combat strength (melee/cavalry) | 6 (ranged/naval 5, siege 4) |
| +1 movement (cavalry / naval / land / all) | 8 / 6 / 10 / 12 |
| A free building on founding | 12 |
| +1 new-city population | 16 · +1 capital population | 11 |
| Faith/Culture may rush production | 8 |
| −1% unit train time | 0.5 · +1 start morale | 0.4 · +1 start XP | 0.5 |
| +1 flat per-turn city yield (coastal/desert) | 4 · worked-tile yield | 5 |

**Gold is the highest** because it is the universal rush currency (`rush.ts`): it
can rush production, buildings, unit training-time, and wonder labour, on top of
upkeep and diplomacy. **Production is *not* the top** — it only raises buildings,
training-building tiers, and lossy conversion projects; **units are trained from
population + time** (`training.ts`) and **wonders from specialist labour**
(`works.ts`), neither driven by production. Military class bonuses are priced below
economy of equal nominal size because they only pay off in conflict. Situational
effects (raiding, healing, terrain-specific tile bonuses) are discounted accordingly.

> These are the **primary tuning surface.** If the scorer says a whole category of
> civ is systematically high or low, the fix is usually a weight here, not the civs.

---

## 3. How each pillar is scored

- **Passive** — `scoreEffects(civ.effects) × 1.5` (always on ⇒ start weight).
- **Unique unit** — `(bonus×5 + bespokeAbilityImpact) × 0.7(situational) × timing(base unit's reqTech)`.
  The ability impact is *this UU's* active abilities minus its base unit's stock
  ones, so a UU that merely inherits its base scores **0** for abilities — this is
  the metric ask #1 (ability variety) moves.
- **Infrastructure** — `(yields×[4 building | 6 improvement] + empireEffects − costPenalty) × timing(reqTech)`.
- **Leader ability** — `net × timing(unlock) × frequencyFactor(cooldown)`. The
  functions live in `@roc/sim` and can't be auto-scored, so each carries a
  hand-tuned **net** (benefit − cost) point value. Un-annotated civs use
  `LEADER_DEFAULT_NET` — defensible as a v1 because every leader ability is
  double-edged *by design*, so their nets cluster. `frequencyFactor` rewards
  shorter cooldowns (cd 20 ⇒ ×1.0, cd 15 ⇒ ×1.33).
- **Starting setup** — loadout cost delta vs. the default trio + capital-population,
  at start weight.

---

## 4. Reading the output

`bun run balance` prints all 137 civs ranked by total, with the **mean**, **stdev**,
and a **flag band** (`±18` by default). Civs above/below the band are flagged
`▲HIGH` / `▼LOW`. A healthy roster has a small stdev and few flags.

**A flag means one of two things** — either the civ is genuinely mis-tuned (fix the
data), or a *weight* is off and a whole cluster shifts with it (fix `weights.ts`).
Always check whether neighbours share the pattern before touching a single civ.

### Status: rebalance COMPLETE (2026-07-05)

**All 137 civs are in band (82–94, target 88).** The 2026-07 rebalance pulled the
roster from a 42.6–101.2 spread (mean 62) to a flat 82.5–94.0 by buffing
under-budget civs along their historical themes — no civ was made top- or
bottom-tier. In the same pass every unique unit received an ability kit
(`UNIQUE_ABILITY_OVERRIDES`, 131 bespoke kits; ~60 new ability mechanics were
added to the engine), each kit overlap-checked so no ability strictly dominates
another in the same kit, with per-kit historical-inspiration lore
(`UU_ABILITY_LORE`) shown in the wiki and civ picker.

Future balance work: run `bun run balance` after any data change; fix civs that
drift out of band by theme-extending (buff) rather than flattening, and prefer
adjusting `weights.ts` when a whole category drifts together.

---

## 5. Workflow for a rebalance pass

1. `bun run balance` → note the flagged civs and the stdev.
2. For each flag, open its `--civ <id>` breakdown to see which pillar is the outlier.
3. Decide: is it the **civ** (adjust its `effects` / UU `bonus` / infra yields /
   `LEADER_NET`) or the **model** (adjust a weight)?
4. Re-run. Aim to shrink stdev and empty the flag band without flattening identity
   (a war civ *should* out-score on military and under-score on economy — the
   **total** is what we equalise, not the shape).

The scorer reads live data, so it never goes stale: change a civ in `@roc/data`,
re-run, see the new budget immediately.
