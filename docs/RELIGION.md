# ☮️ Religion — presets, tiers, perks, holy capitals & unique units

> 📋 **Status: IMPLEMENTED (2026-07-04).** This documents the religion overhaul that
> turned faiths from a 2-belief pick into a full progression system. Code:
> [`packages/sim/src/game/religion.ts`](../packages/sim/src/game/religion.ts) (tiers,
> perks, holy capital), [`religion-units.ts`](../packages/sim/src/game/religion-units.ts)
> (unique-unit kits), and the data tables in
> [`packages/data/src/index.ts`](../packages/data/src/index.ts) (`BELIEFS`,
> `RELIGION_TIERS`, `RELIGION_KITS`).

## 1. Founding

Unchanged gateway: research **Ritual & Burial**, bank **100 faith**, pick a faith from
the 24-religion pool at one of your cities (it becomes the **holy city**). What you get
changed:

- The religion's **preset benefit** — a fixed, historically-fitting empire bonus
  (`RELIGION_KITS[..].preset`), e.g. Islam's *House of Wisdom* (+10% science, +5% gold),
  the Aztec *Nourish the Sun* (kills yield 6 faith), Norse *Wrath of the North*
  (coastal-raid gold + embarked combat).
- **One perk pick** from the tier-1 pool (was: two beliefs).
- The **capital bonus** on the holy city (`RELIGION_KITS[..].capital`), active while the
  city keeps the faith — e.g. the Sikh *Khalsa Muster* trains units 20% faster there.
- Access to the religion's **unique unit** (see §5).

## 2. The perk pool (`BELIEFS`, 38 perks, tiers 1–5)

- Every perk has a `tier`. A religion may pick perks of any tier **at or below its own
  tier** — a tier-2 religion may still take a tier-1 perk.
- **Perks are exclusive across religions**: once any religion claims a perk, no other
  religion in that game may take it (enforced at founding and at every pick).
- Picks are budgeted: 1 at founding + 1 per tier upgrade (`pendingPerkPicks` =
  `tier − beliefs.length`).

## 3. Religion tiers (`RELIGION_TIERS`)

| Tier | Faith cost | Follower cities | Grants |
|------|-----------:|----------------:|--------|
| 1    | — (found)  | —  | preset + 1 perk + unique unit |
| 2    | 250        | 3  | +1 perk pick, stronger unit |
| 3    | 500        | 6  | +1 perk pick, stronger unit |
| 4    | 1000       | 10 | +1 perk pick, unit's **tier-4 active** unlocks |
| 5    | 2000       | 14 | +1 perk pick, unit at full power |

A **follower city** is one where the faith holds a **strict majority** of religious
pressure (`majorityReligion`) — the map's converted badge. Upgrading is the
`upgradeReligion` command; picking is `pickReligionPerk`.

## 4. The holy capital

- `religion.holyCityId` radiates the strongest pressure (unchanged `HOLY_PRESSURE`),
  anchors the faith, and enjoys the kit's capital bonus (merged via `cityEffects` →
  `holyCityBonus`); a holy city converted away from its faith grants nothing.
- **Moving the capital**: `moveHolyCity` command, costs `MOVE_HOLY_CITY_COST` (200)
  faith, target must be a city you own that already follows the faith.

## 5. Religion unique units (`RELIGION_UNIT_KITS`)

One per faith, defined in `UNIT_DEFS` with `religionUnit: <religion def id>`:

- **Trained with production** (not faith) in **any city that follows the faith and has
  a Temple**; no training-building family; one holy unit musters at a time per city.
- **Tier scaling**: +2 strength per tier above 1 (`religionUnitStrengthBonus`); all
  aura/harvest/ability magnitudes scale ×(1 + 0.25·(tier−1)) (`religionTierScale`).
  Some units unlock a second active ability at religion tier 4 (`tier4Active`, wired
  through `effectiveAbilities` in civs.ts).
- Kits are deliberately distinct: healing/morale/XP/combat/dread **auras**
  (combat seam: `religionUnitCombatBonus`; per-turn seam: `tickReligionUnitAuras` in
  combat.ts `healAndReset`), **faith harvests** on own kills or any adjacent death,
  **pressure radiation** into cities within 2 tiles, **garrison boons** (gold/culture/
  train-speed), **homeland fervor**, **forest affinity** (auras double in woods),
  **death rallies** (Valhalla), a **pacifist** who cannot attack but shames and saps
  attackers, and signature actives (Benediction/Darshan/Orisha's Favor, Purifying
  Flame/Storm Call, Chakkar, the Doom-Prophecy family, Kagura/Mettā, Takbīr,
  Deus Vult).
- Artwork: `tools/art-generator` `--subset religion-units` → `units/<id>.png` +
  `units-big/<id>.png` (same pipeline as ordinary units).

## 6. Religious victory (fixed 2026-07-04)

The old check counted a city as following a faith on **any nonzero pressure**, so a
lone founded religion "won" off trace ambient seepage. Now a city counts as
**converted** only when the faith holds a strict majority of its pressure **and** at
least `CONVERSION_PRESSURE` (12) absolute pressure (`cityConvertedTo` in religion.ts);
a civ is converted when a strict majority of its cities are; the victory needs every
civ with cities converted. Sustained holy-city proximity, trade routes, and
missionaries clear the floor easily — faint seepage never does.

## 7. New `CivEffects` keys

- `faithOnKill` — faith per enemy unit killed (consumed in combat's
  `harvestFaithOnKill`).
- `xpGainPercent` — % bonus to combat XP (consumed in `awardXp`).
- Also fixed in this pass: `trainTimePercent`, `startXpBonus`, `startMoraleBonus`,
  `trainingSlotsBonus`, `freeTrainingFamilies` were documented but never merged in
  `civs.mergeInto` — they merge now, and `trainingTimeInCity` additionally honors
  city-scoped effects (holy-capital bonuses) and garrisoned drillmasters.

## 8. AI

The heuristic AI founds with the best-scoring unclaimed tier-1 perk, spends pending
perk picks every turn (temperament-scored), and upgrades tiers when followers + faith
allow — eagerly when pursuing a religious victory, otherwise keeping a 150-faith
cushion for missionaries and legends.
