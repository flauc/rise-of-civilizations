# Unit Active Abilities

> **Status (audited 2026-06-19; §8 + Hide implemented 2026-06-20): PARTIALLY IMPLEMENTED.**
> - ✅ **§3 generic catalogue is built**: `brace, shield_wall, testudo, emplace, charge, shock_charge, trample, fire_and_retreat, skirmish, sunder, pierce, harry, reconnoiter` plus naval `ram, boarding_party, greek_fire, coastal_bombardment` — defined in `content.ts` (`ACTIVE_ABILITY_DEFS` + per-unit assignment), resolved in `abilities.ts`/`combat.ts`/`commands.ts`, with AI and client UI.
> - ✅ **§8 civ-unique / enhanced abilities BUILT** (2026-06-20): `war_cart_charge, parthian_shot, feigned_retreat, hussar_charge, othismos, last_stand, repeating_fire, pavise, arrow_storm, furor, siege_assault`. Now that unique units exist (resolved per civ from a base type), each is mapped in `content.ts` `UNIQUE_ABILITY_OVERRIDES` (keyed by unique-unit id) and resolved by `effectiveAbilities` in `civs.ts`. Mechanics live in `abilities.ts`/`combat.ts`. Reconciliations vs. the §8.2 wishlist: Sassanid Savaran and Timurid Siege Train keep the class default (no bespoke entry yet); Gupta Elephant-Archer keeps Trample (no howdah ranged shot); Maya Holkan/Lusitani/Numidia/Scythian/Sumer also pick up **Hide** (below).
> - ✅ **Hide / ambush (new layer) BUILT** (2026-06-20): a `hide` self-ability across the board for foot infantry and scouts (forest cover), with curated unique units hiding in more terrain and ambushing harder. See "§11 Hide & ambush" below. Sim in `stealth.ts`; fog enforced in `serialize.ts`.
> - ✅ **§9 hero signature abilities BUILT** (2026-07-03): every Legend now carries a real signature power. Combat heroes field curated/bespoke active kits via `LEGEND_ABILITY_OVERRIDES` (`content.ts`, resolved by `effectiveAbilities` in `civs.ts`), including five hero-only abilities: `slay_the_beast, uprising, sacred_banner, pyramid_of_skulls, basilica_bombard`. Support heroes exert passives: per-turn ticks in `legend-passives.ts` (income, drilling, healing, dread, marching), presence effects in `legend-effects.ts` (empire/city `CivEffects` merges, city defense, situational combat bonuses). See the rewritten §9 below.
> - ⚠️ Numbers below are first-draft; treat the §3 entries as "exists, values may differ from code."

---

## 1. Why a new ability layer?

The engine already has **two** kinds of unit power, both of which are *passive*:

| Layer | Where | Nature | Example |
|-------|-------|--------|---------|
| **Unit abilities** | `UnitDef.abilities` in `content.ts` | Always-on combat modifier | `bonus_vs_cavalry` (+5 str vs mounted), `bonus_vs_city` (×1.5 vs cities) |
| **Promotions** | `PROMOTION_DEFS` / `PROMOTION_POOL` | Earned with XP, always-on once taken | `charge` (+4 first attack), `cover` (+4 def vs ranged) |

Neither is a *decision the player makes during a turn*. Every modifier fires automatically
based on terrain, adjacency, or target class. That makes combat about **positioning** but not
about **moment-to-moment tactical choices**.

**Active abilities** add the missing layer: a button the player presses on a selected unit that
spends the unit's action (and/or movement) to do something a normal move/attack cannot — brace
against a charge, ride *through* a target, loose an arrow and gallop back out of reach. They give
each unit class a distinct verb, reward historically literate play, and create rock-paper-scissors
counters (spears brace → cavalry shouldn't charge → horse archers harass the spears instead).

This document specifies that layer. It does **not** replace passive abilities or promotions —
those stay, and several promotions are intentionally re-pointed to *buff* a unit's active ability.

---

## 2. Core framework (how active abilities work)

### 2.1 The two shapes of an ability

Every active ability is one of two shapes:

- **Action ability** — resolves immediately and *consumes the unit's turn* (sets
  `attackedThisTurn = true`, `movementLeft = 0`). Examples: Charge, Fire & Retreat, Sunder.
  An action ability usually *replaces* a normal attack; you do one or the other.
- **Stance** — a toggled state the unit enters by forfeiting its remaining movement. The stance
  persists **until the start of the unit's next turn**, modifying its defense/attack while active.
  Entering a stance ends the unit's turn. Examples: Set Spears, Testudo, Emplace. A unit in a stance
  that gets to act again may *break* the stance (free) and then move normally.

### 2.2 Common rules

- **One active ability per turn.** Using an ability is the unit's action for that turn.
- **Eligibility is checked up-front.** The client only offers the button when the ability is
  legal (correct unit type, enough movement, valid target/tile, off cooldown). The sim
  re-validates on the authoritative side — same pattern as every other `Command`.
- **Cost.** Most abilities cost the whole turn (move + attack). A few cost *only* movement and
  still allow a follow-up — these are called out explicitly.
- **Cooldown (optional).** Most abilities have **no** cooldown (the turn cost is the cost). A
  small number of swingy abilities (Shock Charge, Trample) carry a **1-turn cooldown** to stop
  them being spammed every turn.
- **Determinism.** Like all combat, abilities are fully deterministic (no hidden RNG) so the
  server and client agree. Anything "random-feeling" (e.g. elephant panic) is derived from a
  seeded hash of turn + unit id, exactly like villages/camps.
- **Fog & legality.** An ability that needs a target tile (Charge, Fire & Retreat) requires that
  tile to be visible and to satisfy the ability's geometry (see each entry).

### 2.3 Proposed data/state shape (for the implementation phase — not final)

```ts
// content.ts — a unit can declare zero or more active abilities
export type ActiveAbilityId =
  | "brace" | "shield_wall" | "testudo"
  | "charge" | "shock_charge" | "trample"
  | "fire_and_retreat" | "skirmish"
  | "sunder" | "pierce" | "harry"
  | "emplace" | "reconnoiter"
  // civ-unique (see §8)
  | "parthian_shot" | "feigned_retreat" | "hussar_charge" | "othismos"
  | "last_stand" | "repeating_fire" | "pavise" | "furor"
  | "arrow_storm" | "siege_assault" | "war_cart_charge";

interface UnitDef {
  // ...existing...
  activeAbilities?: ActiveAbilityId[];
}

// state.ts — per-unit runtime
interface Unit {
  // ...existing...
  stance?: "brace" | "shield_wall" | "testudo" | "emplace" | "pavise" | null;
  abilityCooldowns?: Partial<Record<ActiveAbilityId, number>>; // turns remaining
}

// commands.ts — a single new command kind
| { kind: "useAbility"; unitId: number; ability: ActiveAbilityId; col?: number; row?: number }
```

> The exact field names are provisional; the point of review is to lock the **catalogue and
> mechanics** first, then settle the data shape.

---

## 3. The ability catalogue

Each entry lists: **what it does**, the **historical basis**, the **gameplay role/counters**, and
its **cost**. Numbers are first-pass values for balancing later.

### 3.1 Set Spears *(Brace)* — anti-cavalry infantry

- **In-game name:** **Set Spears** (historical) — "Guard" is the verb shown in the action tooltip.
- **Ability id:** `brace`.
- **Effect:** Forfeit remaining movement to brace. Until the start of the unit's next turn it
  gains **+25% defense** (multiplicative on defense strength). Against a **cavalry** attacker the
  brace is sharper — **+40%** — stacking with the unit's existing `bonus_vs_cavalry`. A braced
  unit cannot move; if attacked it does not lose the stance.
- **History:** A spear line's whole purpose was to *hold*. Bracing spears — butt grounded, points
  levelled — turned infantry into a wall horses would not run onto. This is the foundational
  drilled response to a cavalry threat from Sumer to the Swiss pike square.
- **Gameplay:** The defensive anchor. Turns a spearman from a mediocre attacker into an
  immovable shield that punishes cavalry for charging. Hard-counters Charge (§3.4).
- **Units:** Fire-Hardened Spearman, Spearman, Hoplite, Pikeman.
- **Cost:** Stance. Ends the turn. No cooldown.
- *This is the "Guard" ability requested in the brief — named **Set Spears / Brace** per review.*

### 3.2 Shield Wall — heavy spear blocks

- **Effect:** Like Set Spears, but the bonus **scales with adjacent friendly melee/spear units**:
  +15% base, +10% for each adjacent friendly infantry unit (cap +45%). Models a continuous line.
- **History:** The Greek **phalanx** and the Norse **skjaldborg** were only strong *together* —
  an isolated hoplite was vulnerable, a packed line nearly unbreakable from the front.
- **Gameplay:** Rewards keeping infantry in a coherent line rather than scattering them. A
  flanking attacker (hitting from a tile with no adjacent friendly) negates most of the bonus —
  encouraging the attacker to maneuver.
- **Units:** Hoplite (replaces its Set Spears with this stronger, formation-dependent version).
- **Cost:** Stance. Ends the turn. No cooldown.

### 3.3 Testudo — Roman shell

- **Effect:** Stance granting **+50% defense vs ranged** attacks but **−10% defense vs melee**
  (locked shields are great against arrows, clumsy in a melee brawl). Movement forfeited.
- **History:** The Roman legion's **testudo** ("tortoise") locked shields overhead and to the
  flanks to cross killing ground under missile fire — superb against archery, deliberately
  traded away mobility and melee agility.
- **Gameplay:** A directed counter to ranged-heavy armies; lets legions advance on archers/siege.
  Useless against another melee line, so it's a read, not a default.
- **Units:** Legionary.
- **Cost:** Stance. Ends the turn. No cooldown.

### 3.4 Charge *(Breakthrough)* — light & medium cavalry

- **Effect:** Attack an adjacent enemy; if the tile **directly behind** the target (same line from
  attacker through defender) is empty and passable, the horseman **rides through and ends on that
  tile** after the strike. Charging grants **+4 attack** for this blow (does not stack with the
  `charge`/`cavalry_charge` promotion's first-attack bonus — use the larger). If the target dies,
  the pass-through still happens (you ride over the corpse).
- **Counter:** Against a unit in **Set Spears/Shield Wall** stance, the charge is **blunted** — no
  +4 bonus, and the cavalry takes **+25% retaliation**. Against a braced spear line, charging is
  a mistake.
- **History:** Shock cavalry won battles by *breaking through* a line and reforming behind it,
  collapsing morale — not by trading blows in place. The pass-through models penetration and the
  threat of being taken in the rear.
- **Gameplay:** Mobility-as-weapon. Lets cavalry punch a hole, reach soft targets (archers, siege,
  settlers) behind the front, and avoid being pinned. Spears explicitly answer it.
- **Units:** Rider, Light Chariot, War Chariot. (Cataphract uses Shock Charge instead.)
- **Cost:** Action (replaces the attack + uses movement). No cooldown.
- *This is the "Charge / pass-through" ability requested in the brief.*

### 3.5 Shock Charge — heavy cavalry

- **Effect:** A heavier Charge: **+6 attack**, and the defender (if it survives) is **knocked back**
  one tile if the tile behind it is empty (the cataphract takes the defender's vacated tile). Deals
  bonus damage but the cataphract takes **full retaliation** (no evasion). **1-turn cooldown.**
- **History:** The **cataphract** / heavy lancer was a battering ram of man and barded horse —
  devastating on impact but committed; it could not skirmish, only smash.
- **Gameplay:** The hammer. High-impact opener that's punishing if thrown at braced spears.
  Cooldown stops it from being a repeatable blender.
- **Units:** Cataphract. (Could extend to a future Knight/Lancer line.)
- **Cost:** Action. **1-turn cooldown.**

### 3.6 Trample — war beasts

- **Effect:** Charge variant that hits the target **and** deals splash damage (½) to any other
  enemy adjacent to the elephant after the strike, then advances through. **Panic risk:** if the
  elephant is below half HP when it tramples, a seeded check may cause it to **rampage** — it
  still attacks but the pass-through direction is forced toward the nearest unit (friend or foe),
  dealing splash to *whoever* is there. **1-turn cooldown.**
- **History:** War elephants scattered formations by sheer mass — but a wounded, maddened
  elephant was as dangerous to its own side as the enemy, which is why Romans learned to open
  lanes and let them through.
- **Gameplay:** Area threat with a built-in drawback that makes committing a hurt elephant a
  gamble — historically flavorful and a real decision.
- **Units:** War Elephant.
- **Cost:** Action. **1-turn cooldown.**

### 3.7 Fire and Retreat *(Parthian Shot)* — horse archers

- **Effect:** Make a ranged attack, then **immediately step one tile directly away** from the
  target (to an empty, passable tile) without provoking. Requires ≥1 movement remaining *after*
  the shot's reserve; the retreat is free of the normal "attack ends movement" rule.
- **History:** The **Parthian shot** — Scythians, Parthians, and Mongols loosing arrows while
  wheeling away — kept horse archers permanently out of melee reach, grinding down heavier foes.
- **Gameplay:** The quintessential kiter. Lets horse archers chip an enemy and stay un-catchable,
  the natural answer to slow spear lines and the bane of unsupported infantry. Countered by other
  cavalry (who can close the gap) and by terrain that limits the retreat tile.
- **Units:** Horse Archer.
- **Cost:** Action (the shot is the attack; the step is the bonus). No cooldown.
- *This is the "Fire and Retreat" ability requested in the brief.*

### 3.8 Skirmish *(Fall Back)* — foot skirmishers

- **Effect:** The infantry version of Fire & Retreat, but weaker: ranged attack, then step **one
  tile back** *only if* the unit did not move before attacking this turn (skirmishers must be set,
  not already winded). No step if adjacent to two or more enemies (they're pinned).
- **History:** Light troops — **peltasts**, **velites**, slingers — harassed and withdrew before
  the heavy lines closed, never meant to hold ground.
- **Gameplay:** Gives foot ranged a taste of mobility without matching mounted kiting. Rewards
  pre-positioning.
- **Units:** Javelineer, Slinger. (Hunter keeps its recon identity; see Reconnoiter.)
- **Cost:** Action. No cooldown.

### 3.9 Sunder *(Armor Break)* — heavy crushing infantry

- **Effect:** A melee attack that deals slightly reduced damage but applies **Sundered** to the
  target: **−25% defense until the start of the target's next turn.** Sets up a follow-up kill by
  another unit.
- **History:** **Maces, axes, and war-hammers** existed to defeat armor — crushing or splitting
  what a blade couldn't cut. They traded some lethality for the ability to *open up* a protected foe.
- **Gameplay:** A combo enabler — the maceman softens, the swordsman finishes. Makes stacked
  attacks meaningfully better than spreading damage.
- **Units:** Bronze Axeman, Maceman, Longswordsman.
- **Cost:** Action. No cooldown.

### 3.10 Pierce *(Armor-Piercing Bolt)* — crossbows

- **Effect:** A ranged attack that **ignores a flat portion of the target's defense** (e.g. ignore
  the first 6 points of terrain/structure/armor defense) but with reduced range for that shot.
- **History:** The **crossbow** could punch through mail and plate that turned ordinary arrows —
  feared enough to draw papal condemnation. Its weakness was a slow reload (modeled by the turn cost).
- **Gameplay:** The anti-armor / anti-fortification answer. Strong against high-defense melee and
  units sheltering in defensive terrain; the reduced range keeps it from being a free pick.
- **Units:** Crossbowman.
- **Cost:** Action. No cooldown.

### 3.11 Harry *(Pin)* — war dogs / harassers

- **Effect:** A fast melee attack that, on landing, **pins** the target: the target's
  `movementLeft` is set to 0 next turn (it must fight or wait — it cannot disengage). Low damage.
- **History:** **War dogs** (and light harassers) were used to fix and disrupt — slowing a foe,
  breaking formation, holding them for the heavier troops.
- **Gameplay:** A control tool — lock down a fleeing wounded unit or a kiting horse archer so your
  cavalry can catch it. Trades damage for tempo.
- **Units:** War Dogs.
- **Cost:** Action. No cooldown.

### 3.12 Emplace *(Set Up)* — siege engines

- **Effect:** Stance: spend a turn deploying. While **emplaced**, the engine gains **+50% ranged
  strength** and **+1 range**, but has **0 movement** and **−25% defense** (crews exposed). Packing
  up to relocate costs the next turn's movement (break stance = 1 move, then it can reposition).
- **History:** Torsion artillery — **catapults, ballistae, onagers** — had to be assembled, sighted,
  and anchored before they could shoot effectively, then broken down to move. They were murderous
  when set and helpless when caught moving.
- **Gameplay:** Forces siege to be *positioned*, not driven up to a wall and fired the same turn.
  Creates a vulnerability window (moving/exposed) that a raid can exploit — and a payoff for
  protecting an emplaced battery.
- **Units:** Catapult, Ballista. (Battering Ram keeps its straightforward `bonus_vs_city` melee
  role; it's a wall-breaker, not field artillery.)
- **Cost:** Stance. Ends the turn. No cooldown.

### 3.13 Reconnoiter — scouts & hunters

- **Effect:** Forfeit the turn to gain a **vision pulse**: +2 sight radius this turn and reveal the
  contents (unit/city, not just terrain) of all tiles in range until the unit's next turn. Does not
  fight.
- **History:** The eyes of the army — **scouts and hunters** ranged ahead to find the enemy, read
  the ground, and report, rather than fight.
- **Gameplay:** Turns recon units into genuine intelligence assets, valuable even with no combat
  power. Pairs with the existing recon promotions.
- **Units:** Scout, Hunter.
- **Cost:** Stance (ends turn). No cooldown.

---

## 4. Per-unit assignment

Units not listed have **no** active ability (deliberately — early/basic units stay simple, so
unlocking an ability-bearing unit feels like progress).

| Unit | Class | Active ability | Notes |
|------|-------|----------------|-------|
| Scout | recon | Reconnoiter | intel pulse |
| Hunter | ranged | Reconnoiter | tracker, not a line skirmisher |
| Clubman | melee | — | dawn basic |
| Warrior | melee | — | dawn basic |
| Slinger | ranged | Skirmish | weak fall-back |
| Javelineer | ranged | Skirmish | classic peltast |
| Fire-Hardened Spearman | melee | Set Spears | first bracing spear |
| War Dogs | melee | Harry | pin/disrupt |
| Archer | ranged | — | massed volley flavor via promotions |
| Bronze Axeman | melee | Sunder | armor break |
| Maceman | melee | Sunder | crusher (keeps `bonus_vs_city`) |
| Spearman | melee | Set Spears | the requested guard |
| Hoplite | melee | Shield Wall | formation brace |
| Light Chariot | cavalry | Charge | pass-through |
| War Chariot | cavalry | Charge | pass-through |
| Rider | cavalry | Charge | pass-through |
| Horse Archer | cavalry | Fire and Retreat | Parthian shot |
| Swordsman | melee | — | raw line infantry (promotions carry it) |
| Longswordsman | melee | Sunder | steel can break armor |
| Pikeman | melee | Set Spears | premier anti-cavalry brace |
| Cataphract | cavalry | Shock Charge | heavy hammer |
| Crossbowman | ranged | Pierce | armor-piercing |
| Legionary | melee | Testudo | shell vs missiles |
| War Elephant | cavalry | Trample | splash + panic risk |
| Battering Ram | siege | — | melee wall-breaker (`bonus_vs_city`) |
| Catapult | siege | Emplace | field artillery |
| Ballista | siege | Emplace | field artillery |
| Settler / Trader | civilian | — | non-combat |

---

## 5. The rock-paper-scissors it creates

The point of the catalogue is an interlocking counter-web, not isolated tricks:

- **Cavalry Charge** breaks soft lines and reaches the backfield →
- **Set Spears / Shield Wall** spears hard-counter the charge (brace and punish) →
- **Fire & Retreat** horse archers ignore the brace, kiting the slow spears to death →
- **Charge** cavalry run the horse archers down (close the gap they rely on), or **Harry** pins them →
- **Testudo** legions shrug off the archers and advance →
- **Emplaced** siege and **Pierce** crossbows crack the testudo/armor and dug-in defenders →
- siege is slow and exposed while moving → **Charge** cavalry raid it. (Loop closes.)

No single unit is a default best pick; the *active decision each turn* is which verb the situation rewards.

---

## 6. Interaction with existing systems

- **Promotions stay, and some now buff abilities.** E.g. `charge`/`cavalry_charge` (first-attack
  +4) should be reconciled with the Charge *ability* (don't double-dip — take the larger). A future
  promotion could let **Set Spears** also reflect a little damage, or let **Emplace** set up in 0 turns.
- **Passive `bonus_vs_cavalry`** still applies and **stacks** with Set Spears' anti-cavalry brace —
  that's intended: a braced pikeman should be a cavalry graveyard.
- **`combatPreview`** must learn about stances/abilities so the hover odds stay honest (e.g. show
  the reduced damage when charging into a braced line).
- **AI (`ai.ts`)** needs ability-aware heuristics: brace spears when cavalry is adjacent, kite with
  horse archers, emplace siege near a target city, Sunder before a gang-kill. This is the largest
  implementation cost and should be scoped as its own step.
- **Client (`ui.ts` / `overlay.ts` / `main.ts`)** needs ability buttons on the unit panel, a target
  picker for the targeted ones (Charge/Fire&Retreat show the resulting tile), and stance indicators
  on the unit (e.g. a small shield glyph for Set Spears, a "set up" glyph for Emplace).

---

## 7. Decisions & open questions

**Locked (decided at review):**

- ✅ **Scope:** build the **whole framework + full catalogue at once** (not a 3-ability slice).
- ✅ **Cooldowns:** keep **1-turn cooldowns on Shock Charge and Trample**; every other ability is
  turn-cost only.
- ✅ **Elephant panic:** **keep** the seeded rampage drawback on Trample (deterministic, flavorful).

- ✅ **Naming:** the anti-cavalry brace is named **Set Spears** in-game (historical), with
  **"Guard"** as the action-tooltip verb. Ability id `brace`.
- ✅ **Civ-unique abilities:** yes — selected unique units get bespoke/enhanced abilities. See §8.
- ✅ **Legends (heroes):** yes — combat Legends get a **signature active ability** on top of their
  aura. See §9.
- ✅ **Presentation:** each ability (and stance) may ship an **optional icon**; the UI degrades
  gracefully to an emoji/glyph when the image is absent. See §10.

**Still open:**

1. **Numbers pass:** all percentages/flat bonuses above are first-draft and need a balancing pass
   once the framework is in.

---

## 8. Civ-unique abilities

A civilization's **unique unit** normally *inherits* the active ability of its class (a Spartan
Hoplite still has Shield Wall, a Savaran Cataphract still has Shock Charge). On top of that, a
**curated subset** of unique units gets a **bespoke or enhanced** ability that expresses the civ's
historical identity and reinforces its `effects` in [`@roc/data`](../packages/data/src/index.ts).
We deliberately do **not** give all 70+ civs a bespoke ability — only those where history points
to a clearly distinct tactic. Everyone else's unique unit just carries the class default (often
with the civ's flat `unitClassCombat` bonus already doing the differentiating).

> **Dependency:** unique units are currently *descriptive strings* in `@roc/data` (e.g.
> `uniqueUnit: "Keshig"`), not yet real `UnitTypeId`s in `content.ts`. These bespoke abilities
> land when unique units are implemented as actual unit types. **Naval** uniques (Bireme, Longship,
> Nau, Turtle Ship, Jong…) are **deferred** with the rest of the naval layer. Remaining **gunpowder**
> uniques (Conquistador, Sea Beggar…) wait for the Exploration-era firearms pass.

### 8.1 New bespoke abilities

| Ability id | Name | Base | Twist |
|---|---|---|---|
| `parthian_shot` | Parthian Shot | Fire & Retreat | May **move *then* fire** (no "must be set" rule) and the retreat step costs no movement — true skirmish-on-the-gallop. |
| `feigned_retreat` | Feigned Retreat | Fire & Retreat **+** Charge | A dual-mode horse unit: can kite *or* close and ride through. Models the Mongol lure-and-encircle. |
| `hussar_charge` | Winged Charge | Charge | **Ignores the Set Spears/Shield Wall penalty** — the one charge that punches through a braced line (famous winged-hussar lance shock). |
| `war_cart_charge` | War-Cart Charge | Charge | Available far earlier than other charges (dawn-era), but only +2 (not +4) and no pass-through vs rough terrain — the primitive battle-cart. |
| `othismos` | Othismos | Shield Wall | While in Shield Wall, **adjacent friendly Hoplites also gain +2 attack** (the phalanx *push*), not just defense. |
| `last_stand` | Last Stand | Set Spears | Brace bonus **scales as HP drops** (up to +60% near death) instead of a flat +25% — Spartan refusal to break. |
| `repeating_fire` | Repeating Fire | (ranged) | **Attack twice** in one turn at reduced strength on the second shot (Han Cho-Ko-Nu repeating crossbow). Replaces Pierce. |
| `pavise` | Pavise | (ranged) + stance | Pierce **plus** a deployable **Pavise** shield stance (+5 defense vs ranged) — the Genoese crossbowman's shield-pavise pairing. |
| `arrow_storm` | Arrow Storm | Skirmish/(ranged) | Ranged attack with **+1 range** that also lightly damages a *second* enemy adjacent to the target (massed English longbow volley). |
| `furor` | Furor | Charge/(melee) | Huge first-strike (**+6 attack**) but **−4 defense until next turn** — the naked Gaesatae fanatic charge. |
| `siege_assault` | Assault Tower | (siege/melee) | A mobile **siege tower**: melee attack vs cities that **ignores wall defense** and shelters its crew (Assyrian/late-antique tower). |
| `fire_lance` | Fire Lance | (melee → ranged) | A melee unit looses an early-gunpowder lance at a target **up to 2 tiles away**: fires off its melee strength **+3** and draws **no retaliation**, but has a **2-turn cooldown** (Tang/Song fire lancer). |

### 8.2 Curated civ → unique unit → ability

Land uniques only (naval/gunpowder noted above are out of scope for now).

| Civ | Unique unit | Class | Ability |
|---|---|---|---|
| **Sumer** | War-Cart | cavalry | `war_cart_charge` (early, weaker charge) |
| **Parthia** | Parthian Horse Archer | cavalry | `parthian_shot` (enhanced Fire & Retreat) |
| **Scythians** | Scythian Horse Archer | cavalry | `parthian_shot` + heals on a killing shot (ties to "heal after kills") |
| **Xiongnu** | Xiongnu Horse Archer | cavalry | Fire & Retreat (class default) |
| **Mongols** | Keshig | cavalry | `feigned_retreat` (kite *or* charge) |
| **Greece** | Hoplite | melee | `othismos` (phalanx push) |
| **Sparta** | Spartan Hoplite | melee | `last_stand` (HP-scaling brace) |
| **Macedon** | Hypaspist | melee | Shield Wall (class) + Sunder (elite flexibility) |
| **Mycenaean Greece / Olmec / Zapotec / Aksum / Great Zimbabwe** | spearmen | melee | Set Spears (class default; civ combat bonus differentiates) |
| **Rome** | Legionary | melee | Testudo (class) + can build a field fort (per PLAN §3.6) |
| **Celts / Gauls** | Gaesatae | melee | `furor` (fanatic charge) |
| **Byzantium** | Cataphract | cavalry | Shock Charge (class) |
| **Sassanid Persia** | Savaran Cataphract | cavalry | Shock Charge with **2-tile knockback** |
| **Median Empire / Göktürks / Goths / Huns / Franks / Tibet / Ethiopia / Songhai / Mali** | lancers & riders | cavalry | Charge / Shock Charge (class default) |
| **Poland-Lithuania** | Winged Hussar | cavalry | `hussar_charge` (ignores brace penalty) |
| **Persia** | Immortal | melee | Set Spears (class) + heals at turn start in friendly territory ("endless ranks") |
| **Han China** | Cho-Ko-Nu | ranged | `repeating_fire` (double shot) |
| **China (Tang/Song)** | Fire Lancer | melee | `fire_lance` (ranged gunpowder volley, 2-turn cooldown) |
| **Genoa** | Genoese Crossbowman | ranged | `pavise` (Pierce + shield stance) |
| **Anglo-Saxon / England** | Longbowman | ranged | `arrow_storm` (long-range volley) |
| **Elam** | Susian Archer | ranged | Skirmish (class) + the civ's hill ranged bonus |
| **Maurya / Carthage** | War Elephant | cavalry | Trample (class) — Maurya's are **disciplined: no panic risk** (Dharma) |
| **Pagan / Ayutthaya / Khmer (Domrey)** | war elephants | cavalry | Trample (class), enhanced splash |
| **Gupta India** | Gupta Elephant Archer | cavalry | Trample **+** a ranged attack option (howdah archers) |
| **Assyria** | Siege Tower | siege | `siege_assault` (assault tower vs walls) |
| **Timurids** | Timurid Siege Train | siege | Emplace with **+1 extra range** while set |
| **Aztec / Toltec** | Eagle/Jaguar & Toltec Warrior | melee | Sunder or Charge (TBD with the Americas pass) |

*Anything marked "class default" needs no new code beyond the unique unit existing — it simply
reuses the §3 ability. Bespoke rows reference the new ids in §8.1.*

---

## 9. Legend (hero) signature abilities

**Legends** (heroes) are the game's core character feature — recruitable, limited, lifespan-bound
units (see [GREAT-PEOPLE.md §2](GREAT-PEOPLE.md)). Every Legend keeps its **passive aura**
(flat +CS to adjacent friendly military). On top of that, every hero now carries a **real
signature power**, built in one of two ways:

- **Combat heroes** field a curated **active-ability kit** replacing their base unit's list —
  `LEGEND_ABILITY_OVERRIDES` in `content.ts` (keyed by legend id), resolved per unit by
  `effectiveAbilities` (`civs.ts`) via `unit.legendId`. Where an existing ability IS the hero's
  historical tactic it is reused (Leonidas → `last_stand`, Saladin → `feigned_retreat`+`harry`);
  five bespoke hero-only abilities were added for powers nothing else captured (§9.1).
- **Support heroes** exert **passive powers** simply by living: per-turn ticks in
  `legend-passives.ts` (`tickLegendPassives`, run in `beginTurn` and `startSimultaneousTurn`) and
  always-on presence effects in `legend-effects.ts` (empire/city `CivEffects` merged into
  `playerEffects`/`cityEffects`, a city-defense hook in `cityDefenseStrength`, and situational
  combat bonuses folded into `legendCombatBonus`).

The wiki's Legends pages document each power and the history behind it
(`LEGEND_ABILITY_HISTORY` in `@roc/data` history-people.ts).

### 9.1 Hero-only active abilities (new mechanics)

| Ability id | Hero | Effect |
|---|---|---|
| `slay_the_beast` | Gilgamesh | +6 attack vs barbarians (+1 others); a kill grants +10 morale to the hero and adjacent allies. CD 1. |
| `uprising` | Boudica | An adjacent **barbarian** unit joins your side (no blow struck; ends the turn). CD 3. |
| `sacred_banner` | Joan of Arc | Self: the hero and adjacent allies heal 10 HP and gain +15 morale; ends the turn. CD 2. |
| `pyramid_of_skulls` | Tamerlane | +4 attack; if the target dies, every enemy within 2 tiles of the kill loses 15 morale. CD 2. |
| `basilica_bombard` | Mehmed II | Ranged shot at +1 range; +6 ranged strength vs units holding walls/forts (+2 otherwise); no retaliation. CD 2 (reload). |

### 9.2 Legend → signature power (as built)

| Legend | Kind | Power |
|---|---|---|
| Gilgamesh | active kit | `slay_the_beast, sunder, hide` |
| Hammurabi | passive | Code of Laws: +1 global morale per turn |
| Ramesses II | passive | Monument Builder: garrisoned city +25% production & +25% culture |
| Cyrus the Great | passive | The King's March: Cyrus + adjacent friendlies +1 movement each turn |
| Leonidas | active kit | `last_stand, hide` (one stance — no shield-wall stacking) |
| Alexander | active kit | `hammer_and_anvil, shock_charge` |
| Hannibal | active kit | `trample, hide` — the only elephant that can ambush from cover |
| Sun Tzu | passive | Art of War: adjacent allies +3 XP/turn; reveals hidden enemies in sight |
| Qin Shi Huang | passive | Great Wall: ALL your cities +6 defense strength |
| Ashoka | passive | Dhamma: +2 faith/turn; adjacent allies heal +10/turn; fields **no** attack abilities |
| Boudica | active kit | `uprising, charge` |
| Julius Caesar | active kit | `pilum, plunder, hide` |
| Cleopatra | passive | Allure: adjacent enemies −2 CS; +3 gold/turn |
| Attila | active kit | `terrorize, fire_and_retreat` |
| Belisarius | passive | Against All Odds: +2 CS per adjacent enemy beyond the first (max +6) |
| Charlemagne | mixed | +2 faith/turn; kit `heroic_challenge, sunder, hide` |
| Harald Hardrada | active kit | `ram, strandhogg` |
| El Cid | passive | Campeador: +4 CS outside your own borders |
| Saladin | active kit | `feigned_retreat, harry` (Hattin) |
| Genghis Khan | mixed | Dread: adjacent enemies −3 morale/turn; kit `nerge, fire_and_retreat` |
| Subutai | active kit | `parthian_shot, feigned_retreat` |
| Joan of Arc | active kit | `sacred_banner, sunder, hide` (+ rechargeable martyr return) |
| Tomoe Gozen | active kit | `heroic_challenge, fire_and_retreat` |
| Mansa Musa | passive | Golden Flood: +8 gold/turn |
| Tamerlane | active kit | `pyramid_of_skulls, shock_charge` |
| Mehmed II | active kit | `basilica_bombard, emplace` |
| Pachacuti | passive | Qhapaq Ñan: land units ignore rough terrain; garrisoned city +25% food |
| Zheng He | mixed | Treasure Fleet: +4 gold/turn, ships +1 movement; kit `ram, monsoon_run` |
| Yi Sun-sin | active kit | `broadside, turtle_shell` |

**AI:** legends use their kits through the existing ability categories in `ai.ts`, plus dedicated
handling for `basilica_bombard`, `uprising` and `sacred_banner`. **Tests:**
`legend-abilities.test.ts` (kits, actives, situational passives, presence effects, per-turn ticks).

---

## 10. Presentation — icons & graceful fallback

Active abilities need an on-screen affordance (the action button) and, for stances, an on-map
indicator. Both should look good with art **and** work with none.

### 10.1 Optional ability icons (never required)

- Each ability *may* ship a PNG at **`packages/client/public/abilities/<ability_id>.png`** —
  e.g. `abilities/brace.png` (Set Spears), `abilities/charge.png`, `abilities/fire_and_retreat.png`,
  `abilities/parthian_shot.png`.
- Icons load through the **same atlas-with-fallback pattern already used for units**
  ([`unit-assets.ts`](../packages/client/src/unit-assets.ts)): build an `AbilityAtlas`, request each
  image, and on `onerror` simply leave that entry `undefined`. **A missing or broken image must
  never break the game** — the loader counts it as "done" and moves on, exactly like the unit atlas.
- **Fallback:** when `images[id]` is absent, the ability button renders a built-in **emoji/glyph**
  defined alongside each ability in `content.ts` (proposed `ActiveAbilityDef.glyph`), e.g.
  🛡️ Set Spears, 🐎 Charge, 🏹 Fire & Retreat, 🐢 Testudo, 🧱 Emplace. The button is fully
  functional with just the glyph; art is pure polish that can be added later, per-ability, with no
  code change.

### 10.2 Stance indicators on the map

- A unit in a stance (Set Spears, Shield Wall, Testudo, Emplace, Pavise) shows a small badge on its
  token via the overlay. If `abilities/<stance>.png` exists it's drawn; otherwise the overlay draws
  the ability's glyph (same fallback as 10.1). Stances may also get a subtle tinted ring (e.g. blue
  for a defensive brace) drawn in code, so the state is always readable even with zero art.

### 10.3 Legend portraits

- Legends reuse the existing **leader-portrait** pipeline
  ([`leader-assets.ts`](../packages/client/src/leader-assets.ts)) for their unit panel / recruit
  card, with the same missing-image fallback (initials/colored chip). Their signature-ability button
  uses the §10.1 ability-icon mechanism.

### 10.4 Proposed asset manifest (to add incrementally — all optional)

```
packages/client/public/abilities/
  brace.png  shield_wall.png  testudo.png
  charge.png  shock_charge.png  trample.png
  fire_and_retreat.png  skirmish.png
  sunder.png  pierce.png  harry.png  emplace.png  reconnoiter.png
  # civ-unique & hero (§8/§9)
  parthian_shot.png  feigned_retreat.png  hussar_charge.png  othismos.png
  last_stand.png  repeating_fire.png  pavise.png  furor.png
  arrow_storm.png  siege_assault.png  war_cart_charge.png
  duel.png  rally.png  grand_ambush.png  lightning_advance.png
  terror.png  great_bombard.png  inspire.png
```

> None of these files need to exist for the feature to ship. Drop any subset in and they light up
> automatically; the rest keep their glyphs.

---

## 11. Hide & ambush (concealment)

A new self-ability, **Hide** (`hide`, glyph 🌲), is available **across the board to all foot
infantry (land melee/ranged classes) and scouts**. A curated set of unique units can hide in more
terrain and ambush harder. Implemented in [`stealth.ts`](../packages/sim/src/game/stealth.ts).

**Hiding.** Costs a turn: the unit must have **≥1 movement**, forfeits all remaining movement, and
becomes **hidden**. Hidden units are **invisible to enemies** — concealed even on a tile the enemy
can see (fog enforced in `serialize.ts viewForPlayer`). A unit stays hidden across turns until it
**breaks cover** (moves, attacks, or is woken via the *wake* command) or is **discovered**.

**Cover (terrain).**
- Default (ordinary infantry/scouts): **forest or jungle** (dense cover — not light *woods*). Moving **breaks cover**.
- Special uniques hide in more: **Numidian Cavalry** (forest/plains/grassland/desert), **Scythian
  Horse Archer** (forest/plains/grassland), **Sumerian War-Cart** (forest/plains), **Maya Holkan**
  (forest/jungle), **Lusitani Falcata Warrior** (forest/hills/plains). These are the "special units"
  and "unique cavalry" that can hide in the open. Edit `SPECIAL_HIDE` in `stealth.ts` to extend.

**Stealth repositioning.** A curated subset of guerrilla/light uniques — flagged `stealthMove` in
`SPECIAL_HIDE` (**Lusitani Falcata Warrior**, **Maya Holkan**, **Numidian Cavalry**) — can **move
while staying concealed**, but only at **one third their normal pace** (`stealthMovement` =
`max(1, floor(movement/3))`, applied at turn start in `beginTurn`/`startSimultaneousTurn`). Everyone
else reveals the moment they move. Creeping into position and then striking from concealment chains
naturally into the ambush attack bonus.

**Ambush — stepping onto a hidden unit.** An enemy that **navigates directly onto** a concealed
unit's tile is **ambushed**: the hidden unit is revealed and strikes the intruder by surprise (no
retaliation, the hider's ambush bonus), the intruder defends at **−20%**, is **halted** (does not
take the tile), and loses its movement. (`combat.ts resolveAmbush`; move interception in
`commands.ts`; `movement.ts occupancy` lets a mover path onto a concealed enemy.)

**Ambush perk — breaking cover near foes.** When a unit breaks cover **within 2 tiles of an enemy**
it gains the ambush window: its attacks until the start of its next turn deal **+20% (default)**, or
**+30%** for the sharper uniques (`ambushBonus`). Read in `combat.ts attackStrength` via
`unit.ambushReadyUntilTurn` / `unit.ambushBonus`.

**Discovery via Reconnoiter.** A scout's **Reconnoiter** pulse now also **reveals every concealed
non-friendly unit within (sight + 2) tiles** (`revealHiddenInSight`). Attacking a hidden unit (e.g.
a ranged shot) also flushes it out.

---

*Cross-references:* unit roster & passive abilities live in
[`packages/sim/src/game/content.ts`](../packages/sim/src/game/content.ts); combat resolution in
[`packages/sim/src/game/combat.ts`](../packages/sim/src/game/combat.ts); promotions in
[PROMOTIONS.md](PROMOTIONS.md); the overall combat model in [PLAN.md §3.7](PLAN.md).
