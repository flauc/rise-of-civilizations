# Buildings Expansion

> ✅ **Status: IMPLEMENTED (2026-07-09).** All ten buildings, the `BuildingEffects`/
> `reqBuilding` schema, the `rangedAttacksUsed` counter, AI scoring, the client
> production gating + tooltips, the generated wiki roster, and the ten building icons
> are in. 636 sim tests pass (incl. new combat + `buildings-expansion.test.ts`),
> typecheck + client build clean, verified live in the browser.
>
> Moving unit recruitment out of city production (the training-building system in
> [`training.ts`](../packages/sim/src/game/training.ts)) left cities with far fewer things
> to spend hammers on — production was effectively nerfed because its biggest sink vanished.
> This document restores the sink by expanding the building roster: **ten new tech-gated
> buildings** plus targeted changes to existing ones. The new buildings support the army a
> city trains (speed, quality), harden the city itself (defense, bombardment), and add
> economy/support effects (food reserve, healing aura, victory morale, defensive beacons).
>
> Everything is unlocked by research: every new building has a `reqTech`. Numbers are
> intent — tune during implementation. Era cap is unchanged (Dawn → early gunpowder,
> nothing post-firearms).

---

## 0. Design principles

- **Production compensation.** The ten new buildings total ~340 production per city — a
  developed city has a real construction queue again through the whole game instead of
  running out of buildings by the Classical era.
- **Research-gated.** Every new building is unlocked by a specific tech. New
  buildings slot into existing techs — no new techs needed; several under-used techs
  (Phalanx Doctrine, Torsion Engines, Theology, Optics) become unlock points.
- **Historically grounded.** Names and effects follow real institutions of the era —
  drill yards, armouries, castles, tower artillery, storehouses, monastic infirmaries,
  triumphal arches, beacon chains.
- **One effect, clearly legible.** Each building does one memorable thing (plus at most a
  small yield), in the style of the existing roster.
- **Buildings, not tiers.** These are ordinary one-off `BUILDING_DEFS` entries built through
  `city.buildings` — the five-tier training families stay exactly as they are.

---

## 1. New buildings

### 1.1 Military production (support the training system)

| Building | Tech | Cost | Effect | Historical context |
|---|---|---|---|---|
| **Drill Yard** | Phalanx Doctrine | 28 | Units train **15% faster** in this city (all families) | Greek phalanxes won by drill; the *kampos*/muster field where levies learned formation |
| **Armoury** | Iron Bloomery | 30 | Newly trained units start with **+10 XP** (their first level) | State weapon stores — Roman *fabricae* — issued standardized iron arms; equipped recruits fight like veterans sooner |
| **Arsenal** | Gunpowder | 44 | Units train a further **15% faster** and start with **+10 morale** | The great state arsenals (Venice's Arsenale) — proto-assembly-line war production, the pride of a late-era city |

- Drill Yard and Arsenal percentages stack multiplicatively with the training-tier
  `speedPct`, the civ/city `trainTimePercent`, and the drillmaster garrison bonus — all
  folded into `trainingTimeInCity` ([`training.ts:120`](../packages/sim/src/game/training.ts)).
- Armoury XP and Arsenal morale add to the tier bonuses in `advanceTraining`
  ([`training.ts:169`](../packages/sim/src/game/training.ts)), same slot as `startXpBonus` /
  `startMoraleBonus` civ effects.

### 1.2 City defense (the walls chain)

| Building | Tech | Cost | Requires | Effect | Historical context |
|---|---|---|---|---|---|
| **Castle** | Engineering | 42 | Walls | **+8 city defense**, **+60 city max HP** | The stone keep — from Roman *castella* to the motte-and-bailey; a fortified core that outlasts the outer wall |
| **Ballista Towers** | Torsion Engines | 34 | Walls | City **bombard damage +50%** | Tower-mounted torsion artillery — Syracuse under Archimedes, the walls of Rhodes — turned city walls into weapons |
| **Bombard Tower** | Firearms | 46 | Castle | City can **bombard twice** per turn | Purpose-built gun towers of the 15th century (Rhodes, Constantinople's sea walls) mounted multiple pieces with overlapping fields of fire |

- Castle folds into `cityDefenseStrength` and `cityMaxHp`
  ([`combat.ts:460`](../packages/sim/src/game/combat.ts)) alongside the walls/barracks bonuses.
- Ballista Towers multiplies `cityBombardStrength` ([`combat.ts:938`](../packages/sim/src/game/combat.ts)).
- Bombard Tower: `City.rangedAttackUsed: boolean` becomes a per-turn counter
  (`rangedAttacksUsed: number`) checked against an allowance (1, or 2 with the tower) in
  `bombardWithCity` — with a legacy-save fallback (`false`/`undefined` → 0). The AI's city
  bombard loop just retries while attacks remain.
- Together with Walls this makes a real fortification track: Masonry → Engineering →
  Torsion Engines → Firearms.

### 1.3 Growth & support

| Building | Tech | Cost | Effect | Historical context |
|---|---|---|---|---|
| **Storehouse** | Irrigation | 22 | **Food reserve**: when the city grows, the next citizen starts **30% complete** | State grain stores — Egypt's temple storehouses, Rome's *horrea*, the Inca *qullqa* — carried a city's surplus across seasons |
| **Infirmary** | Theology | 30 | Your units within **2 tiles** heal **+5 HP** per turn | Healing was institutional: Greek *asclepeia*, Roman legionary *valetudinaria*, monastic infirmaries |
| **Triumphal Arch** | Monumental Architecture | 36 | +1 culture; when an enemy unit dies within **3 tiles** of the city, your units within 3 tiles gain **+5 morale** | Rome built arches so victory itself had an address — a standing celebration that steeled the next generation of soldiers |
| **Beacon Tower** | Optics | 26 | This city and every friendly city within **6 tiles** gain **+2 city defense** (stacks to +6) | Signal-fire chains — the Great Wall's beacon towers, Byzantium's 500-mile beacon line — let one city's warning arm a whole frontier |

- Storehouse: in the growth branch of `processCity` ([`economy.ts:619`](../packages/sim/src/game/economy.ts)),
  after `foodStored -= need`, set `foodStored = max(overflow, 0.3 × foodToGrow(newPop))`.
  It intentionally has **no flat food yield** — the Granary keeps that role; this one
  compounds with growth speed.
- Infirmary: a city-aura pass in `healAndReset` ([`combat.ts:1202`](../packages/sim/src/game/combat.ts)),
  next to the existing home-territory and religion-unit heal bonuses. Does not stack across
  multiple Infirmaries (take the max).
- Triumphal Arch: hook the unit-death path in `resolveAttack` where kill morale swings
  already happen ([`morale.ts`](../packages/sim/src/game/morale.ts) helpers) — if the dead
  unit was at war with a city owner whose city (with an Arch) is within 3 tiles, that
  owner's units within 3 tiles of the city gain +5 morale.
- Beacon Tower: computed inside `cityDefenseStrength` by scanning the owner's other cities
  for Beacons in range. Auras from multiple beacons **stack to a cap of +6** (three beacons)
  so beacon-spam doesn't trivialize defense.

---

## 2. Changes to existing buildings

| Building | Change | Why |
|---|---|---|
| **Walls** | Unchanged mechanically; becomes the prerequisite for Castle and Ballista Towers (Castle in turn for Bombard Tower) | Anchors the fortification chain |
| **Granary** | Unchanged (+3 food) | The flat-food role stays here; the new Storehouse handles the reserve mechanic |
| **Barracks / Archery Range (training) Tier 1** | Unchanged — stay ungated | Decided 2026-07-09: keep the AI's and player's anti-barbarian opening intact; only the *new* buildings need tech gates |
| All other buildings | Unchanged | Already tech-gated and role-distinct |

### Schema change

`BuildingDef.effect` today is a narrow union (`"walls" | "barracks" | "harbor" | "lighthouse"`).
Extend `BuildingDef` with an optional structured `effects` block instead of widening the union:

```ts
// content.ts
export interface BuildingEffects {
  trainTimePercent?: number;   // −15 = trains 15% faster (Drill Yard, Arsenal)
  trainedUnitXp?: number;      // Armoury
  trainedUnitMorale?: number;  // Arsenal
  cityDefense?: number;        // Castle
  cityMaxHp?: number;          // Castle
  bombardPercent?: number;     // Ballista Towers
  extraBombards?: number;      // Bombard Tower
  growthCarryover?: number;    // Storehouse (fraction 0–1)
  healAura?: { radius: number; amount: number };        // Infirmary
  victoryMorale?: { radius: number; amount: number };   // Triumphal Arch
  cityDefenseAura?: { radius: number; amount: number }; // Beacon Tower
}
export interface BuildingDef {
  // ...existing fields
  reqBuilding?: BuildingId;    // Castle needs walls; Bombard Tower needs castle
  effects?: BuildingEffects;
}
```

`availableProduction` ([`economy.ts:833`](../packages/sim/src/game/economy.ts)) picks new
buildings up automatically from `BUILDING_DEFS`; it only needs the one-line `reqBuilding`
check. The legacy `effect` union stays for walls/harbor/lighthouse (used elsewhere) — no
migration of old saves needed since `city.buildings` is already a plain id list.

---

## 3. AI

The governor/AI build scoring ([`ai.ts`](../packages/sim/src/game/ai.ts)) must want these:

- **Military focus**: Drill Yard and Armoury right after the relevant training building
  reaches tier 2; Arsenal late.
- **Any city near a war front or barbarian pressure**: Walls → Castle → Ballista Towers,
  Bombard Tower late. Beacon Tower for frontier clusters (2+ own cities in range).
- **Growth focus**: Storehouse right after Granary.
- **All-round**: Infirmary in cities that stage armies (military focus or frontier);
  Triumphal Arch scored with culture buildings plus a bump when at war.

Also add the new effect fields to the civ-effect valuation in `ai.ts` (the `e.homeHealBonus`
-style scoring) so unique-building variants of these effects are valued if we mint any later.

---

## 4. Client & wiki

- **Production menu / city panel** (`ui.ts`): works automatically from `availableProduction`;
  add tooltips describing each new effect, and show "requires Walls/Castle" when the
  `reqBuilding` gate blocks an entry (greyed row, same pattern as coastal-only buildings).
- **Icons**: new glyphs via the emoji→generated-icon bridge (`tools/generate-icons` subset +
  `drawGlyph` fallback) — 🎯 Drill Yard 🛡 Armoury 🏭 Arsenal 🏰 Castle 🗼 Ballista Towers
  💣 Bombard Tower 🏺 Storehouse ⚕ Infirmary 🏛 Triumphal Arch 🔥 Beacon Tower. Paid
  generation + copy to `public/icons` remains the usual manual step.
- **Tech tree** (`techtree.ts:39`): unlock listings derive from `BUILDING_DEFS.reqTech` —
  automatic. The new tier-1 training gates surface via `unlocksOfTech` in `content.ts` —
  verify the two new gates render.
- **Wiki** (`wiki.ts`): the current Buildings entry is one hand-written paragraph. Replace it
  with a **generated roster**: iterate `BUILDING_DEFS` (grouped: Growth & Economy / Science &
  Culture / Faith / Military & Defense) rendering name, cost, tech, prerequisite building and
  effect text from a small per-id description map, plus the five training families and their
  tier tables from `TRAINING_BUILDING_DEFS`. Generated from the defs = can never drift again.
  Also update the two prose sections that enumerate buildings (Construction & Training,
  City-States/Combat mentions of city strength) to mention the defense chain and double
  bombard.

---

## 5. Tests

- `content.test`-level sanity: every new building has a `reqTech`; `reqBuilding` references
  exist; costs positive.
- `training.ts`: Drill Yard/Arsenal stacking math (floor at 1 turn); Armoury XP → unit
  musters at level 2; Arsenal morale adds to tier morale.
- `combat.ts`: Castle defense + HP; Ballista bombard damage; Bombard Tower allows exactly two
  bombards and resets next turn; legacy `rangedAttackUsed` saves load.
- `economy.ts`: Storehouse carryover (including the case where natural overflow exceeds 30%).
- Auras: Infirmary heals at radius 2 not 3, no double-stack; Beacon +2 per tower, +6 cap
  across cities; Triumphal Arch fires only on enemy deaths in radius and only for the city
  owner.

---

## 6. Build order

- **M-B1 — Schema + military production.** `BuildingEffects`/`reqBuilding`, Drill Yard,
  Armoury, Arsenal. Training tests.
- **M-B2 — Defense chain.** Castle, Ballista Towers, Bombard Tower; `rangedAttacksUsed`
  counter refactor. Combat tests.
- **M-B3 — Growth & support.** Storehouse, Infirmary. Economy/heal tests.
- **M-B4 — Morale & auras.** Triumphal Arch, Beacon Tower. Aura tests.
- **M-B5 — AI, client, wiki.** Governor scoring, tooltips + gating UI, icons, generated wiki
  roster, changelog entry.
