# Unit Design Proposal

> Review-only draft. Not yet wired into `packages/sim/src/game/content.ts`.

This document proposes a complete, reviewable unit roster for *Rise of Civilizations* that meshes with the existing materials-based tech tree and the 5-era scope (Dawn → Bronze → Iron/Classical → Medieval → Exploration).

## 1. Design goals

- **Roles are readable:** every unit has a clear job (scout, line melee, anti-cav, ranged, skirmisher, heavy cav, siege, naval, support, civilian).
- **Era identity:** each era adds a few meaningful units rather than a flat power ladder.
- **No dead units:** even early units stay useful via upgrades, cheap cost, or terrain bonuses.
- **Unique-unit hooks:** civilization UUs can replace base units by overriding a few fields (`id`, `name`, `glyph`, `strength`, `abilities`) while keeping the same class/cost profile.
- **Simple renderer glyphs:** single ASCII/Unicode characters for the procedural canvas renderer.

## 2. Unit schema

```ts
type UnitClass =
  | "settler" | "worker" | "recon"
  | "melee" | "ranged" | "skirmisher"
  | "cavalry" | "siege" | "naval_melee" | "naval_ranged" | "support";

type UnitAbility =
  | "bonus_vs_cavalry"      // +5 vs cavalry class
  | "bonus_vs_city"         // +50% damage vs cities/walls
  | "ignore_terrain_cost"   // forests/hills/marsh cost 1
  | "no_defensive_terrain"  // does not benefit from terrain defense
  | "fire_after_move"       // ranged: can move and shoot in same turn
  | "zone_of_control"       // exerts ZoC (most military)
  | "can_embark"            // enters coastal/ocean tiles
  | "coastal_raider"        // +gold on pillaging coastal improvements
  | "transport"             // can carry land units
  | "heal_adjacent";        // medic: adjacent friendly units heal +5/turn

interface UnitDef {
  id: string;
  name: string;
  glyph: string;          // 1-char renderer symbol
  cls: UnitClass;
  era: 1 | 2 | 3 | 4 | 5; // Stone / Bronze / Iron / Medieval / Exploration
  movement: number;       // points per turn
  sight: number;          // vision radius in hexes
  cost: number;           // production cost
  maintenance: number;    // gold per turn
  strength: number;       // melee / defensive combat stat
  rangedStrength?: number;// used only when attacking at range
  range?: number;         // attack reach in hexes
  reqTech?: TechId;       // empty = available from start
  resource?: string;      // e.g. "horses", "iron"
  abilities?: UnitAbility[];
  notes?: string;
}
```

## 3. Base unit roster

### 3.1 Civilian & support

| ID | Name | Glyph | Class | Era | Mvt | Sight | Cost | Maint | Str | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| `settler` | Settler | `S` | settler | 1 | 2 | 2 | 24 | 0 | 0 | Founds a city. Cannot attack. |
| `worker` | Worker | `B` | worker | 1 | 2 | 2 | 16 | 0 | 0 | Builds tile improvements (charge-based). |
| `scout` | Scout | `C` | recon | 1 | 3 | 3 | 10 | 0 | 4 | Ignores terrain cost. |
| `pathfinder` | Pathfinder | `c` | recon | 2 | 3 | 4 | 16 | 0 | 6 | Upgrade from Scout via `composite_bow` or gold. |
| `caravan` | Caravan | `$` | support | 2 | 3 | 2 | 20 | 1 | 2 | Creates land trade routes; plunderable. |
| `medic` | Field Medic | `+` | support | 3 | 2 | 2 | 22 | 1 | 2 | `heal_adjacent`. No combat bonus. |
| `engineer` | Military Engineer | `E` | support | 3 | 2 | 2 | 26 | 1 | 4 | Builds roads, forts, repairs. |
| `missionary` | Missionary | `m` | support | 4 | 3 | 2 | 18 | 1 | 0 | Spreads religion. |

### 3.2 Dawn / Stone era (available immediately)

| ID | Name | Glyph | Class | Era | Mvt | Sight | Cost | Str | RStr | Rng | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `clubman` | Clubman | `w` | melee | 1 | 2 | 2 | 10 | 6 | — | — | Cheapest military. |
| `warrior` | Warrior | `W` | melee | 1 | 2 | 2 | 15 | 8 | — | — | Standard early infantry. |
| `slinger` | Slinger | `L` | ranged | 1 | 2 | 2 | 12 | 4 | 7 | 1 | Weak ranged; eureka to Archer. |
| `javelineer` | Javelineer | `J` | ranged | 1 | 2 | 2 | 14 | 6 | 8 | 1 | Short-range skirmisher feel. |
| `hunter` | Hunter | `H` | ranged | 1 | 2 | 3 | 13 | 5 | 7 | 1 | Better sight, forest bonus. |

### 3.3 Bronze era

| ID | Name | Glyph | Class | Era | Mvt | Sight | Cost | Str | RStr | Rng | Tech | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `firehard_spear` | Fire-Hardened Spearman | `F` | melee | 2 | 2 | 2 | 15 | 9 | — | — | `fire_hardening` | `bonus_vs_cavalry`. |
| `war_dog` | War Dogs | `D` | melee | 2 | 3 | 2 | 12 | 6 | — | — | `animal_taming` | Fast, cheap harassment. |
| `archer` | Archer | `A` | ranged | 2 | 2 | 2 | 18 | 6 | 11 | 2 | `composite_bow` | First true 2-range ranged. |
| `axeman` | Bronze Axeman | `X` | melee | 2 | 2 | 2 | 19 | 13 | — | — | `bronze_alloying` | Strong line infantry. |
| `maceman` | Maceman | `M` | melee | 2 | 2 | 2 | 18 | 11 | — | — | `bronze_alloying` | `bonus_vs_city`. |
| `spearman` | Spearman | `P` | melee | 2 | 2 | 2 | 18 | 11 | — | — | `bronze_alloying` | `bonus_vs_cavalry`. |
| `hoplite` | Hoplite | `O` | melee | 2 | 2 | 2 | 22 | 13 | — | — | `phalanx` | `bonus_vs_cavalry`; +2 when adjacent to another Hoplite. |
| `light_chariot` | Light Chariot | `y` | cavalry | 2 | 4 | 2 | 18 | 9 | — | — | `the_wheel` | Fast, no terrain defense benefit. |
| `war_chariot` | War Chariot | `Y` | cavalry | 2 | 4 | 2 | 24 | 13 | — | — | `chariotry` | Heavy chariot line. |
| `rider` | Rider | `R` | cavalry | 2 | 4 | 2 | 18 | 10 | — | — | `equestrian` | First mounted melee. |
| `horse_archer` | Horse Archer | `Q` | cavalry | 2 | 4 | 2 | 22 | 7 | 9 | 1 | `horse_archery` | Mobile ranged. |
| `battering_ram` | Battering Ram | `U` | siege | 2 | 2 | 2 | 16 | 6 | 10 | 1 | `siegecraft` | `bonus_vs_city`; must melee city. |

### 3.4 Iron / Classical era

| ID | Name | Glyph | Class | Era | Mvt | Sight | Cost | Str | RStr | Rng | Tech | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `swordsman` | Swordsman | `Z` | melee | 3 | 2 | 2 | 22 | 15 | — | — | `iron_bloomery` | Needs `iron`. |
| `longswordsman` | Longswordsman | `G` | melee | 3 | 2 | 2 | 26 | 18 | — | — | `carburizing` | Steel blade infantry. |
| `pikeman` | Pikeman | `K` | melee | 3 | 2 | 2 | 20 | 14 | — | — | `iron_bloomery` | `bonus_vs_cavalry`. |
| `legionary` | Legionary | `E` | melee | 3 | 2 | 2 | 22 | 15 | — | — | `engineering` | Can build roads/forts (engineer-lite). |
| `cataphract` | Cataphract | `T` | cavalry | 3 | 3 | 2 | 28 | 17 | — | — | `cavalry_doctrine` | Heavy cavalry; needs `horses` + `iron`. |
| `crossbowman` | Crossbowman | `V` | ranged | 3 | 2 | 2 | 22 | 8 | 14 | 2 | `crossbow` | High ranged strength. |
| `war_elephant` | War Elephant | `N` | cavalry | 3 | 3 | 2 | 30 | 16 | — | — | `elephantry` | `bonus_vs_city`; needs ivory-access tile or unique. |
| `catapult` | Catapult | `I` | siege | 3 | 2 | 2 | 25 | 6 | 14 | 2 | `siegecraft` | `bonus_vs_city`. |
| `ballista` | Ballista | `b` | siege | 3 | 2 | 2 | 30 | 7 | 16 | 2 | `torsion_engines` | `bonus_vs_city`. |

### 3.5 Medieval era

| ID | Name | Glyph | Class | Era | Mvt | Sight | Cost | Str | RStr | Rng | Tech | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `man_at_arms` | Man-at-Arms | `m` | melee | 4 | 2 | 2 | 28 | 20 | — | — | `steel` (new) | Plate-armor infantry. |
| `halberdier` | Halberdier | `h` | melee | 4 | 2 | 2 | 24 | 16 | — | — | `feudalism` (new) | `bonus_vs_cavalry`; cheap. |
| `longbowman` | Longbowman | `l` | ranged | 4 | 2 | 2 | 26 | 9 | 16 | 3 | `machinery` (new) | 3 range; England UU variant. |
| `knight` | Knight | `k` | cavalry | 4 | 4 | 2 | 36 | 22 | — | — | `stirrups` (new) | Needs `horses` + `iron`. |
| `trebuchet` | Trebuchet | `t` | siege | 4 | 2 | 2 | 34 | 6 | 20 | 2 | `physics` (new) | `bonus_vs_city`; high damage. |
| `carrack` | Carrack | `n` | naval_ranged | 4 | 4 | 3 | 32 | 10 | 14 | 2 | `shipbuilding` (new) | Coastal + ocean near coast. |

### 3.6 Exploration era

| ID | Name | Glyph | Class | Era | Mvt | Sight | Cost | Str | RStr | Rng | Tech | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `musketeer` | Musketeer | `u` | melee | 5 | 2 | 2 | 32 | 24 | — | — | `gunpowder` (new) | Early firearm; needs `saltpeter`. |
| `arquebusier` | Arquebusier | `a` | ranged | 5 | 2 | 2 | 30 | 10 | 18 | 2 | `gunpowder` (new) | Ranged firearm. |
| `conquistador` | Conquistador | `q` | cavalry | 5 | 4 | 2 | 40 | 25 | — | — | `metallurgy` (new) | Heavy exploration cavalry. |
| `cannon` | Cannon | `o` | siege | 5 | 2 | 2 | 40 | 8 | 24 | 2 | `metallurgy` (new) | `bonus_vs_city`. |
| `caravel` | Caravel | `v` | naval_melee | 5 | 5 | 3 | 36 | 18 | — | — | `cartography` (new) | First true ocean explorer. |
| `galleon` | Galleon | `g` | naval_ranged | 5 | 4 | 3 | 44 | 14 | 20 | 2 | `square_rigging` (new) | Transport + ranged. |

## 4. Unit-class rules

| Class | Move base | ZoC | Special |
|---|---|---|---|
| settler | 2 | no | Cannot attack; founds city on settle command. |
| worker | 2 | no | Builds improvements; consumed charge on build. |
| recon | 3 | no | `ignore_terrain_cost`. |
| melee | 2 | yes | Balanced attacker/defender. |
| ranged | 2 | yes | Strikes at range; takes no retaliation. |
| skirmisher | 3 | no | (future) hit-and-run after attack. |
| cavalry | 4 | yes | Fast; often `no_defensive_terrain`. |
| siege | 2 | yes | `bonus_vs_city`; weak vs units. |
| naval_melee | 4–5 | yes | Boarding/melee on water; can enter ocean with tech. |
| naval_ranged | 4 | yes | Bombards land/coastal. |
| support | 2–3 | no | Non-combat utility; exerts no ZoC. |

## 5. Upgrade paths (proposed)

A unit can be upgraded for the production difference (or gold) when the owner knows the target tech.

```
Clubman → Warrior → Axeman → Swordsman → Longswordsman → Man-at-Arms
Slinger → Archer → Crossbowman → Arquebusier
Javelineer → (no direct upgrade; cheap niche)
Fire-Hardened Spear → Spearman → Pikeman → Halberdier
Warrior / Axeman → Hoplite (sidegrade, anti-cav)
Rider → Horse Archer / Cataphract → Knight → Conquistador
Light Chariot → War Chariot
Scout → Pathfinder
Battering Ram → Catapult → Ballista → Trebuchet → Cannon
```

## 6. Unique unit examples (civ replacements)

| Civ | Base unit | Unique unit | Changes |
|---|---|---|---|
| Rome | Legionary | **Legionary** | already has engineer-lite road/fort build. |
| Greece | Hoplite | **Hoplite** | +2 adjacent phalanx stacking already base. |
| Persia | Spearman | **Immortal** | `rangedStrength: 6, range: 1` (ranged+melee hybrid), fast heal. |
| Egypt | War Chariot | **Maryannu Chariot Archer** | ranged chariot: `rangedStrength: 11, range: 2`. |
| China | Crossbowman | **Chu-Ko-Nu** | `fire_after_move` and +1 attack per turn. |
| England | Longbowman | **Longbowman** | already stronger 3-range variant. |
| Mongols | Horse Archer | **Mangudai** | +1 movement, can move after attack. |
| Mali | Knight | **Mandekalu Cavalry** | no resource requirement, cheaper maintenance. |
| Japan | Longswordsman | **Samurai** | fights at full strength when wounded. |
| Aztec | Warrior | **Eagle Warrior** | chance to capture defeated enemy unit. |

## 7. Open questions for review

1. Should naval units be gated behind a separate **water-movement** system commit, or can they live as buildable units that simply can't move until that system lands?
2. Is the `skirmisher` class worth adding now, or should javelineers/horse archers remain in `ranged`/`cavalry`?
3. Should `saltpeter`/`iron`/`horses` requirements be hard-gated or just cheaper when owned?
4. Do we want a single global upgrade table, or per-unit target lists?
