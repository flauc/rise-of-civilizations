# Specialists & Public Works

> **Status (audited 2026-06-19): IMPLEMENTED** — this is the rare doc that matches the code.
> The Worker unit was removed; `specialists.ts` (Carpenter/Agrimensor/Mason/Architect/Military
> Engineer with XP & levels), `works.ts` (tile Works, distance-scaled labour, improvement tiers,
> defensive walls/towers), `fortifications.ts` (tier HP 40/80/140 & 60/110/170, bombard 8/12/16),
> and `WONDER_DEFS` in `@roc/data` (the 5 launch wonders below) all exist, with the Empire UI panels.
> Minor caveat: the `builder` flag and worker-class promotions in `content.ts` are vestigial
> leftovers (see [PROMOTIONS.md](PROMOTIONS.md)). Sections 3–7 below describe what was built.

*Originally a design spec (2026-06-14). Supersedes the Worker unit and instant
unit-built improvements.*

## 1. Motivation

The Worker unit (a wandering civilian with N "build charges" that instantly
plops a Farm/Mine/Road on the tile it stands on) is being **removed**. It is
ahistorical (improvements weren't built by a single roaming laborer) and
shallow (no interesting choices).

In its place, **cities train specialised craftsmen out of their own
population**, and those craftsmen execute **Works** — public-works projects —
on any tile the empire controls. This ties terrain development to the city
economy, gives the population screen a real opportunity cost (a citizen working
a tile vs. a citizen apprenticed as a craftsman), and creates a logistics layer:
distant Works cost more labour, and the grandest Works (Wonders) need many
specialists, sometimes pooled from several cities.

## 2. Core concepts

### 2.1 Specialists

A **specialist** is a citizen a city has trained into a craft. Mechanically:

- A specialist **occupies a population slot**: a city of population *P* can have
  at most *P* citizens total, split between **tile-workers** (assigned to
  worked tiles) and **specialists**. Converting a citizen to a specialist
  un-assigns one worked tile; converting back frees a specialist to work a tile.
- Specialists produce **no tile yield**. Their entire value is the **labour**
  they contribute to Works each turn (and a small flat upkeep benefit — see
  §2.5). This is the opportunity cost: every craftsman is a citizen not
  generating food/production/gold/science from a tile.
- Each specialist has a **discipline** (its craft) and may require a
  **technology** before a city can train it.
- A city may train **any number** of its citizens as specialists (up to its
  population). They are stored as **individual records** on the city (each with
  its own `xp`/`level`), not as map units — they never appear on the map and
  can't be captured in the field.

#### Experience & levels

Specialists **learn their craft on the job**. A specialist that contributes
labour during a turn earns XP (`+2`/turn working), plus a **completion bonus**
(`+6`) shared among the crew when a Work finishes. Crossing an XP threshold
(`10 × level`) raises the specialist's **level** (cap **5**).

Higher level = **faster building**: a specialist contributes

```
labour/turn = 1 + 0.5 × (level − 1)      // Lv1 = 1.0 … Lv5 = 3.0
```

so a veteran Mason builds three times as fast as a fresh apprentice. Progress is
tracked as a floating-point value so fractional labour accumulates cleanly. When
a citizen is **un-trained** back to a tile-worker, the city releases its
**least-experienced** specialist of that craft first, preserving veterans.

#### Specialist roster (historically grounded)

| Specialist | Latin/historic basis | Discipline | Unlock tech | Builds |
|---|---|---|---|---|
| **Carpenter** | *faber tignarius* (woodworker) | `carpentry` | — (from start) | Farms, Lumber Camps |
| **Agrimensor** | Roman land surveyor | `survey` | The Wheel | Roads |
| **Mason** | *faber lapidarius* (stoneworker) | `masonry` | Masonry | Mines, Quarries; Walls/Towers/Forts (with a Military Engineer) |
| **Architect** | *architectus* | `architecture` | Masonry | **Wonders** |
| **Military Engineer** | *mensor / praefectus fabrum* | `engineering` | Engineering | Walls, Towers, Forts (with a Mason); **Wonders** |

Disciplines are an enum so Works can require specific kinds of labour
(`carpentry`, `survey`, `masonry`, `architecture`, `engineering`). One
specialist contributes **1 labour of its discipline per turn**.

> Carpenter is available from the very start so a brand-new city can always
> improve its food tiles — there is never a "can't develop land at all" gap left
> by removing the Worker.

### 2.2 Works (public-works projects)

A **Work** is a queued project. Two kinds:

- **Tile Work** — develops one tile inside your territory: build a Farm, Mine,
  Quarry, Lumber Camp, or Road. Produces a tile `improvement`/`road`.
- **Wonder Work** — a great national project (see §2.4).

A Work has:

- a **target** (a tile `{col,row}` for tile Works; a host city for Wonders);
- a **labour requirement** per discipline (a `Partial<Record<Discipline,
  number>>`);
- **accumulated progress** per discipline;
- a set of **contributing cities** (usually one; Wonders may have several).

Each turn, for every contributing city, each specialist of a needed discipline
adds its **level-scaled labour** (§2.1) toward the matching requirement (capped
at the requirement) and earns XP. When **every** discipline requirement is met,
the Work **completes**: the tile gains its improvement/road, or the Wonder is
raised, and the contributing crew earns a completion XP bonus.

**Specialist assignment is fully manual** (as of the assignment overhaul): a Work
only accrues labour from specialists the player has **explicitly assigned** to it,
and a specialist may labour on **at most one Work at a time**. Specialists can be
pulled from **any** of the player's cities (not just the host city), and several
can be stacked on one Work to finish it faster (a **wonder** instead needs its
whole fixed crew and caps at that headcount — see §2.4) — the per-Work panel shows the
crew's combined labour/turn and the resulting ETA, so the speed impact of picking a
veteran (Lv5 = 3× labour) over an apprentice is visible. Releasing a specialist (or
losing its city) detaches it automatically. The AI assigns its idle craftsmen to its
oldest unfinished Works each turn (`aiAssignSpecialists`). Commands: `assignSpecialist
{ workId, specialistId, on }`. *(This supersedes the original auto-assignment, where
a city's specialists were pooled onto its Works in queue order.)*

A Work can only be **started** when the player has a **free** (trained, currently
unassigned) specialist of each craft it needs — there must be someone idle to put on
the job. `canStartWork` enforces this (returning a `"No <craft> available"` block the
build UI renders as a locked button); assignment itself remains a separate, manual
step after the Work is queued.

### 2.3 Distance-based cost

> "the cost of something will depend on the distance from the city"

The labour requirement of a **Tile Work** scales with how far the target tile is
from the **building city**:

```
requirement(discipline) = baseLabour(workType) × (1 + DISTANCE_FACTOR × hexDistance(city, tile))
```

with `DISTANCE_FACTOR = 0.5`, rounded up. So a Road (base 2) on a tile adjacent
to the city costs `2×(1+0.5×1)=3`, the same Road 4 tiles out costs
`2×(1+0.5×4)=6`. Developing your heartland is cheap; pushing roads/farms to the
frontier is a real investment. A Work may only target tiles within the empire's
territory (`tile.ownerCityId` belongs to one of the player's cities), and the
building city must be the **nearest** owning city (chosen automatically) so the
distance term is meaningful.

### 2.4 Wonders

Wonders are the showcase Works. A Wonder is defined by its **crew** — a headcount of
craftsmen per discipline (`WonderDef.crew`, e.g. the Great Pyramid's 11 Masons + 6
Architects) — and is a grand national project rather than a labour pool. A Wonder:

- **needs its ENTIRE crew idle and free before it can even start.** Unlike a tile
  work (which needs a single free craftsman), `canStartWonder` refuses until the
  player fields the whole crew of each craft — 11 free Masons *and* 6 free
  Architects for the Pyramid. Craftsmen may be **pooled from any/all of the
  player's cities** (the count is empire-wide), so a big civilization gathering
  the workforce is the real gate;
- **caps the crew at that headcount.** No more than `crew[d]` specialists of each
  craft may work it — you cannot rush it by piling on extra bodies (there's no
  room for them), so gathering the crew, not out-massing the labour, is the cost.
  Tile and defensive works stay **uncapped** (stacking a crew on a distant
  farm/road is a legitimate way to hurry it);
- **takes a long, fixed span of construction even fully crewed.** Internally the
  labour requirement is `crew × WONDER_BUILD_TURNS` (= 12), so a full crew of fresh
  (Lv1) craftsmen raises the wonder in ~12 turns; a **veteran** crew (each
  contributing more labour/turn) finishes sooner. It never snaps into being the
  moment the crew is assembled;
- is **unlocked by a technology** (`WonderDef.reqTech`) and charges a **one-time
  cost** in gold, faith, or culture (`goldCost`/`faithCost`/`cultureCost`) the
  moment it breaks ground — a resource sink on top of the crew. `canStartWonder`
  enforces both; `startWonder` deducts the cost;
- can only be **sited where its geography allows** (`WonderDef.placement` — terrain,
  coastal/water, fresh water, near/adjacent terrain, or beside one of your cities),
  checked against the live map in `canStartWonder` (the Great Lighthouse even sits on
  a coastal *water* tile);
- grants strong, permanent **yields** *and*, for several wonders, a **dynamic,
  game-changing effect**. Beyond `yieldPerCity`/`yieldHostCity`/`freeTech`, a
  `WonderEffect` can carry: `civEffects` (a `Partial<CivEffects>` merged into the
  owner's empire bonuses like a policy — see `playerEffects` in civs.ts),
  `shipSightBonus` (naval sight, applied in `unitSight`), `spawnShipEveryTurns` +
  `spawnShipType` (a free-upkeep ship launched from the host city on a schedule via
  `tickWonders`), and `faithOnLegendDeath` (faith granted when one of the owner's
  Legends dies in battle or expires — hooked in `killUnit` and `tickLegends`);
- can only be built **once in the world** (first to finish claims it).

Launch wonder set (ancient era, extensible in `@roc/data`). "Crew" is the craftsmen
you must gather; construction then spans ~`WONDER_BUILD_TURNS` turns:

| Wonder | Unlock (tech · cost) | Site | Crew | Effect |
|---|---|---|---|---|
| **Great Pyramid** | Masonry · 150🪙 | Desert | 11 Masons, 6 Architects | +2 production/city, +2 culture host; **+60 faith whenever a Legend dies or expires** |
| **Hanging Gardens** | Irrigation · 120🪙 | Fresh water (river/lake) | 6 Carpenters, 6 Architects, 4 Engineers | +2 food/city, +2 culture host |
| **Great Library** | Writing · 120🎭 | Beside a city | 7 Architects, 5 Engineers | +4 science host, +1 science/city, free tech |
| **Colossus** | Bronze-working · 140🪙 | Coastal (beside sea) | 6 Masons, 6 Engineers | +5 gold host, +2 trade-route gold; **free warship every 6 turns** |
| **Great Lighthouse** | Sailing · 130🪙 | Coastal water tile | 5 Masons, 5 Architects, 5 Engineers | +1 gold/city, +2 science host; **all ships +2 sight, +1 movement** |
| **Great Sphinx** | Monumental Architecture · 100🎭 | Desert | 9 Masons, 5 Architects | +3 culture & +3 gold host, +1 culture/city |
| **Stonehenge** | Ritual Burial · 80☮️ | Within 5 tiles of a mountain | 9 Masons, 4 Surveyors | +1 faith/city, +3 faith host |
| **The Oracle** | Theology · 120☮️ | Beside a mountain | 6 Architects, 5 Masons | +3 faith & +2 science host, +1 faith/city; **rush production with faith** |
| **Tenochtitlán** | Engineering · 160🪙 | Hill | 7 Engineers, 6 Architects, 5 Masons | +1 food & +1 production/city, +2 gold host; **all land units +1 movement** |

Wonders live in `@roc/data` as `WONDER_DEFS` (dependency-free) with `id, name, crew,
reqTech?, goldCost?/faithCost?/cultureCost?, effect`. Effects reuse the existing
`CivEffects`/yield plumbing where possible.

### 2.5 Specialist upkeep value

To avoid specialists feeling like dead weight when they have no Work to do, an
**idle** specialist (no Work needing its discipline this turn) contributes a
tiny civic benefit: **+0.25 production** to its city per idle specialist
(rounded down at the city total). This is small enough that working tiles is
still usually better, but means a city "banking" craftsmen between projects
isn't wasting them entirely. *(Tunable; can be 0 if it proves too strong.)*

### 2.6 Improvement tiers (every improvement has 3 levels)

Every economic improvement has **three tiers**. Building tier 1 is a Work;
**upgrading** to tier 2 and then tier 3 are *separate* Works, each one contracting
specialists again (with the usual distance-scaled labour cost — and a higher base
cost per tier). A tile stores its improvement **kind + level (1–3)**; higher
tiers give strictly better yields/effects.

| Ladder | Tier 1 | Tier 2 | Tier 3 | Discipline |
|---|---|---|---|---|
| **Road** | Dirt Road (¾ move/tile) | Paved Road *via glareata* (½ move/tile) | Imperial Road *via munita* (¼ move/tile + trade gold) | survey |
| **Farm** | Farm (+1 food) | Irrigated Farm (+2 food) | Estate (+3 food) | carpentry |
| **Lumber Camp** | Lumber Camp (+1 prod) | Sawmill (+2 prod) | Timberworks (+3 prod) | carpentry |
| **Mine** | Mine (+1 prod) | Deep Mine (+2 prod) | Great Mine (+3 prod, +1 gold) | masonry |
| **Quarry** | Quarry (+1 prod) | Stoneworks (+1 prod, +1 gold) | Marble Works (+2 prod, +2 gold) | masonry |

Upgrade Works only appear once the previous tier exists on the tile. Base labour
rises per tier (`tierBase = base × tier`), so tier-3 work is a serious
commitment. Upgrading does **not** require a new technology beyond the
improvement's own unlock — it is purely a labour/specialist investment (a future
pass may gate tier 3 behind era techs).

### 2.7 Defensive works: walls, towers & forts

A second family of Works builds **defensive structures** on a tile. Unlike
economic improvements, a defensive structure **occupies the tile** (mutually
exclusive with farm/mine/etc.), has **HP**, and **blocks enemy movement** — an
enemy unit cannot enter the tile until the structure is destroyed (reduced to
0 HP by attacking it, exactly like attacking a unit). Your own and allied units
pass freely. There are two ladders, both requiring **a Mason *and* a Military
Engineer** (so the host city must field both disciplines — `masonry` +
`engineering` labour on every such Work):

| Ladder | Tier 1 | Tier 2 | Tier 3 | Bombards? |
|---|---|---|---|---|
| **Wall** (blocks) | Palisade | Stone Wall | Great Wall | no |
| **Tower** (blocks + bombards) | Watchtower | Fort | Citadel | yes |

- **Walls** purely block passage; each tier has more HP (Palisade 40 / Stone Wall
  80 / Great Wall 140) and grants a defense bonus to a friendly unit standing on
  the tile.
- **Towers** block *and* **bombard**: once per turn a standing tower makes a free
  ranged attack on an adjacent enemy unit (strength scales with tier — Watchtower
  8 / Fort 12 / Citadel 16, range 1), and has more HP than the equivalent wall.
  A **Tower upgrades to a Fort, and a Fort to a Citadel** via upgrade Works (each
  again needs both a Mason and a Military Engineer).

Structures regenerate HP slowly while not under attack (like cities) and are
owned by the territory's city. Destroying a structure yields the attacker a small
reward. *(Implementation order: build + blocking + HP + destruction first;
tower bombardment second.)*

## 3. Data model changes

### 3.1 `@roc/sim` — `content.ts`

- **Remove** `worker` from `UnitTypeId`, `UNIT_DEFS`, `UnitClass` ("worker"),
  `ROLE`, `PROMOTION_POOL`, and the `builder` flag usage. (Settler/Trader civ
  classes stay.)
- Tech tree: add lightweight unlock anchors where missing. New techs are *not*
  required — we reuse `the_wheel` (Agrimensor), `masonry` (Mason, Architect),
  `engineering` (Engineer). Carpenter is unlocked from the start.

### 3.2 `@roc/sim` — new `specialists.ts`

```ts
export type Discipline = "carpentry" | "survey" | "masonry" | "architecture" | "engineering";
export interface SpecialistDef { id; name; latin; discipline; reqTech?; desc }
export const SPECIALIST_DEFS: Record<SpecialistId, SpecialistDef>;
export interface Specialist { id; type: SpecialistId; xp: number; level: number }  // lives on City
export function specialistLabour(s: Specialist): number;     // 1 + 0.5×(level-1)
export function grantSpecialistXp(s: Specialist, amount: number): void;  // adds xp, levels up (cap 5)
export function specialistUnlocked(player, id): boolean;
export function availableSpecialists(player): SpecialistId[];
export function totalSpecialists(city): number;              // city.specialists.length
export function freeWorkerSlots(city): number;               // population - workedTiles - specialists
export function convertCitizen(state, city, id, delta): Result;  // +1 trains a Lv1; -1 releases least-XP
```

### 3.3 `@roc/sim` — new `works.ts`

```ts
// Tile works build OR upgrade an improvement/structure to a target tier.
export type WorkKind =
  | "farm" | "mine" | "quarry" | "lumber_camp" | "road"   // economic ladders
  | "wall" | "tower"                                        // defensive ladders
  | "wonder";
export interface Work {
  id; ownerId; kind;
  tier?: number;               // target tier (1–3) for tile/defensive works
  target?: { col; row };       // tile works
  wonderId?: string;           // wonder works
  hostCityId: number;
  cityIds: number[];           // contributing cities (>=1)
  requirement: Partial<Record<Discipline, number>>;
  progress: Partial<Record<Discipline, number>>;
}
export function workLabourFor(state, kind, tier, cityId, target): Partial<Record<Discipline, number>>;  // distance-scaled, ×tier
export function nextTierAt(tile, kind): number | null;       // 1 to build, 2/3 to upgrade, null if maxed/invalid
export function canStartWork(state, playerId, kind, target): Result;
export function startWork(state, playerId, kind, target): Result;     // tile/defensive works (tier inferred)
export function startWonder(state, playerId, wonderId, hostCityId): Result;
export function advanceWorks(state, playerId): void;  // per player-turn: apply specialist labour + xp, complete
export function worksOf(state, playerId): Work[];
export function cancelWork(state, workId, playerId): Result;
```

### 3.4 State

- `City.specialists: Specialist[]` (individual records with `xp`/`level`).
- `City.wonders: string[]` (completed wonders hosted here).
- `GameState.works: Work[]`.
- `GameState.completedWonders: string[]` (world-unique guard).
- `Player` keeps existing fields; wonder effects merged via `playerEffects`.

### 3.5 Improvements & tile fields

`improvements.ts` keeps `IMPROVEMENT_DEFS` (now `farm`, `lumber_camp`, `mine`,
`quarry`, each with **per-tier yields**) and a tier-aware `improvementYields(kind,
level)`, but **drops** the unit-driven `buildableHere` / `buildImprovement`. The
tile-eligibility test moves into `works.ts` (`workValidOnTile(kind, tier, tile)`).

`@roc/shared` `Tile` gains:

- `improvementLevel?: number` (1–3; `improvement` already holds the kind).
- `roadLevel?: number` (1–3; `road` stays the boolean "has a road").
- `structure?: { kind: "wall" | "tower"; tier: 1|2|3; hp: number; maxHp: number }`
  — a defensive structure occupying the tile (mutually exclusive with
  `improvement`). Blocks enemy entry while `hp > 0`.

`DEFENSE_DEFS` (in `improvements.ts` or a new `fortifications.ts`) holds per-tier
HP, defense bonus, and (towers) bombard strength/range. Movement
(`movement.ts`/`computeReachable`) treats a tile with an enemy `structure` as
impassable to enemies; `combat.ts` lets adjacent enemies attack a structure
(HP model like cities) and bombarding towers fire in the owner's `beginTurn`.

### 3.6 Commands

Remove `build` (worker). Add:

- `convertCitizen { cityId, specialistId, delta }` (delta ±1)
- `startWork { kind, col, row }` (tier inferred from the tile's current tier;
  covers economic ladders, defensive walls/towers, and tier upgrades)
- `startWonder { wonderId, hostCityId }`
- `assignSpecialist { workId, specialistId, on }` *(pin/release a craftsman to/from a
  Work; replaced the old `assignCityToWonder` — wonders are now staffed the same way as
  every other Work)*
- `reorderWork { cityId, workId, dir }` *(optional polish)*
- `cancelWork { workId }`

The old `attack` command also gains the ability to target an enemy **structure**
tile (reduce its HP; destroy at 0 → tile becomes passable).

### 3.7 Economy integration

- `freeWorkerSlots` caps how many citizens `getCityYields` actually counts as
  tile-workers; specialists are excluded from tile work and add the idle-upkeep
  production.
- `processCity` calls `advanceWorks` for the city after yields, so completed
  Works apply the same turn.
- Wonder effects fold into `playerEffects` (empire-wide) / `getCityYields`
  (host-city) like civ/government/religion effects already do.

## 4. AI

`ai.ts` (replacing the Worker routines):

- Each AI city trains **1–2 Carpenters** early; a Mason once Masonry is known.
- The AI queues a Farm on its best unworked food tile, then a Mine on hills,
  then a Road toward the nearest other city.
- A leading AI with several cities and Architects/Engineers starts a Wonder.

## 5. UI — overview & allocation panels

A new **Empire** menu (button in the top bar / menu) opens a tabbed overview
with three panels (the user asked for one each for specialists, units, and
cities):

1. **Specialists & Works** — per city: population split (workers vs. each
   specialist type) with ＋/－ steppers to convert citizens; the city's Work
   queue with per-discipline progress bars; buttons to start a Work (then pick a
   target tile on the map) or contribute to a Wonder. A global Wonders section
   lists in-progress/available wonders.
2. **Units** — a sortable list of all your units: icon, name, location, moves
   left, HP, status (idle/fortified/working). Click a row to select & centre the
   camera on it. Quick "next idle unit" affordance.
3. **Cities** — a list of all your cities: name, population (workers +
   specialists), yields, current production, garrison, # Works. Click to select &
   centre.

Tile Works are also creatable from the **tile panel** (click a tile in your
territory → "Develop ▸" with the eligible Work types and their distance-scaled
cost). Wonders are startable from the city panel / Specialists panel.

## 6. Wiki

`wiki.ts`: replace the "Improvements = Workers" copy with a new **Specialists &
Public Works** category covering specialists, disciplines, Works, distance cost,
and Wonders; update the Units table (Worker removed) and the Cities section
(population split).

## 7. Migration / sequencing

1. Sim: remove Worker, add specialists + works (tile works first), economy +
   commands + serialize + tests. *(keeps game playable: cities can develop land
   via Carpenters/Masons.)*
2. Sim: wonders.
3. Client: tile-panel "Develop" + the three overview panels.
4. AI + wiki + balancing pass.

Backward-compat: old saves with `worker` units are dropped on load; missing
`works`/`specialists`/`wonders` fields default to empty.
