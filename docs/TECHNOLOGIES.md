# Technology Tree

> ⚠️ **Implementation note (audited 2026-06-19):** the *shipped* tech tree (`packages/sim/src/game/content.ts`, `TECH_DEFS`) was deliberately rebuilt to be **original and materials-based** (Stone Knapping → Smelting → Bronze Alloying → Iron Bloomery → Carburizing, Torsion Engines, Equestrianism, etc.) rather than the Civ-style draft below. **The whole table in this file is therefore NOT what the game uses.** Concretely:
> - The real tree has **~41 techs**, not the ~85 below, with **different ids and prereqs** (e.g. `iron_bloomery`, `carburizing`, `equestrian`, `the_wheel`, `coinage`, `philosophy`).
> - ❌ **The eureka system described here is not implemented** — there are no in-world eureka boosts in the shipped tree (so Babylon's eureka-themed ability has nothing to hook into).
>
> This document is kept as historical design context; the code is the source of truth.


The **Science** tree: ~85 techs across the five eras (Stone → Bronze → Classical → Medieval → Exploration). Research is funded by the empire's Science yield. The parallel **Civics** tree (governments & policies) is summarized at the bottom and detailed in [PLAN.md §3.5](PLAN.md).

**Eureka system:** most techs have a **eureka** — an in-world action that grants a chunk of free progress (encourages playing toward your tech). Babylon's civ ability interacts with this (see [CIVILIZATIONS.md](CIVILIZATIONS.md)).

Columns: **Tech** · **Prereqs** · **Unlocks** (units `U`, buildings `B`, improvements `I`, wonders `W`, abilities `A`) · **Eureka**.

> Costs/numbers live in `packages/data`. This doc defines structure, prerequisites, and intent. IDs are kebab-case.

---

## Shipped tech tree (source of truth)

This is the **actual** tree the game runs, generated from `TECH_DEFS` in
[`packages/sim/src/game/content.ts`](../packages/sim/src/game/content.ts) (audited 2026-06-19):
**41 techs**, snake_case ids, science-funded, **no eurekas**. `Unlocks` is derived from the
`reqTech` of units/buildings/specialists. `knapping` and `foraging` are the two free roots
(cost 0). The Civics tree is unlocked once **Writing** is researched.

> The five "Era" tables further below are the **original Civ-style draft** and are kept only as
> archived design history — they do **not** match the code.

### Dawn — roots & first developments

| Tech | Cost | Prereqs | Unlocks |
|------|-----:|---------|---------|
| `knapping` Stone Knapping | 0 | — | root → Fire-Hardening, Hide-Working |
| `foraging` Foraging | 0 | — | root → Animal Taming, Cultivation, Ritual & Burial, Parley |
| `fire_hardening` Fire-Hardening | 15 | knapping | U Fire-Hardened Spearman |
| `hide_working` Hide-Working | 18 | knapping | → Weaving, Composite Bow |
| `animal_taming` Animal Taming | 20 | foraging | U War Dogs; → Wheel, Equestrianism, Elephantry |
| `cultivation` Plant Cultivation | 18 | foraging | Farms (Carpenter); → Pottery, Irrigation |
| `ritual_burial` Ritual & Burial | 16 | foraging | B Shrine |
| `parley` Parley | 16 | foraging | diplomacy/contact flavor (no direct build) |
| `pottery_kiln` Pottery & Kilns | 24 | cultivation | B Granary; → Native Copper, Masonry, Writing |

### Copper & Bronze

| Tech | Cost | Prereqs | Unlocks |
|------|-----:|---------|---------|
| `native_copper` Native Copper | 28 | pottery_kiln | B Workshop |
| `smelting` Smelting | 34 | native_copper | B Forge; → Bronze Alloying, Iron Bloomery |
| `bronze_alloying` Bronze Alloying | 42 | smelting | U Bronze Axeman, Maceman, Spearman; B Barracks |
| `the_wheel` The Wheel | 30 | animal_taming | U Trader, Light Chariot; Agrimensor (Roads) |
| `equestrian` Equestrianism | 34 | animal_taming | U Rider; B Stable |
| `masonry` Masonry | 35 | pottery_kiln | B Walls; Mason & Architect (Mines, Quarries, Wonders) |
| `weaving` Weaving | 26 | hide_working | → Sailcloth, Sailing |
| `composite_bow` Composite Bow | 38 | hide_working, bronze_alloying | U Archer |
| `writing` Writing | 36 | pottery_kiln | B Archive, B Temple, B Amphitheater; **unlocks Civics tree**; → Math, Coinage, Philosophy |
| `irrigation` Irrigation | 30 | cultivation | improved farm yields |
| `sailcloth` Sailcloth | 32 | weaving | U Longship; B Harbor |
| `chariotry` Chariotry | 46 | the_wheel, bronze_alloying | U War Chariot |
| `phalanx` Phalanx Doctrine | 46 | bronze_alloying | U Hoplite |

### Naval & Maritime

| Tech | Cost | Prereqs | Unlocks |
|------|-----:|---------|---------|
| `sailing` Sailing | 30 | sailcloth, weaving | U Galley |
| `shipbuilding` Shipbuilding | 46 | sailing, bronze_alloying | U Bireme, U Trireme |
| `naval_architecture` Naval Architecture | 70 | shipbuilding, mathematics | U Quinquereme, U Galleass |
| `optics` Optics | 55 | mathematics, shipbuilding | B Lighthouse |
| `astronomy` Astronomy | 80 | optics, philosophy | U Caravel (ocean-going) |
| `cartography` Cartography | 90 | astronomy, naval_architecture | U Galleon (ocean-going) |

### Iron & Classical

| Tech | Cost | Prereqs | Unlocks |
|------|-----:|---------|---------|
| `iron_bloomery` Iron Bloomery | 55 | smelting | U Swordsman, U Pikeman |
| `carburizing` Carburizing (Steel) | 72 | iron_bloomery | U Longswordsman; → Crossbow |
| `siegecraft` Siegecraft | 58 | masonry, the_wheel | U Battering Ram, U Catapult |
| `bridge_building` Bridge Building | 44 | masonry, the_wheel | A Bridges over rivers (roads cross rivers: no ford penalty, keep the assault penalty, count as a city connection) |
| `mathematics` Mathematics | 60 | writing | → Engineering, Optics, Torsion Engines, Naval Architecture |
| `torsion_engines` Torsion Engines | 82 | siegecraft, mathematics | U Ballista |
| `engineering` Engineering | 66 | mathematics, masonry | U Legionary, U Dromon, U War Junk; B Aqueduct; Military Engineer (Forts/Towers/Wonders) |
| `coinage` Coinage | 50 | writing | B Market |
| `philosophy` Philosophy | 56 | writing | B Academy |
| `cavalry_doctrine` Cavalry Doctrine | 62 | equestrian, bronze_alloying | U Cataphract |
| `horse_archery` Horse Archery | 58 | equestrian, composite_bow | U Horse Archer |
| `crossbow` Crossbow | 65 | carburizing | U Crossbowman |
| `monumental_architecture` Monumental Architecture | 70 | masonry, writing | B Monument |
| `elephantry` Elephantry | 64 | animal_taming, bronze_alloying | U War Elephant |

> Each combat unit also carries its class **active ability** (see [UNIT-ABILITIES.md](UNIT-ABILITIES.md)
> §3) and class **promotions** ([PROMOTIONS.md](PROMOTIONS.md)). Wonders are built via the
> Specialists/Works system, not unlocked directly by a tech — see
> [SPECIALISTS-AND-WORKS.md](SPECIALISTS-AND-WORKS.md).

---

# Archived design draft (Civ-style — NOT in the game)

*Everything below is the superseded ~85-tech draft, kept for design history only.*

## Era I — Stone / Dawn (4000–3000 BCE)

| Tech | Prereqs | Unlocks | Eureka |
|------|---------|---------|--------|
| **agriculture** | — (start) | `I` Farm · `A` found cities | (start tech) |
| **pottery** | agriculture | `B` Granary · `B` Shrine-storehouse | Found a 2nd city |
| **animal-husbandry** | agriculture | `I` Pasture · `U` Scout · `A` reveals **Horses** | Improve a pasture |
| **mining** | agriculture | `I` Mine · `A` reveals **Copper** | Build a mine |
| **archery** | animal-husbandry | `U` Archer (replaces Slinger) | Kill a unit with a Slinger |
| **sailing** | pottery | `U` Galley · `I` Fishing Boats · `A` embark on coast | Found a coastal city |
| **mysticism** | pottery | `B` Temple-shrine · `A` Pantheon faith | Build a Shrine |
| **the-wheel** | animal-husbandry, mining | `A` roads cheaper · enables chariots | Build a road |

## Era II — Bronze (3000–1200 BCE)

| Tech | Prereqs | Unlocks | Eureka |
|------|---------|---------|--------|
| **writing** | mysticism | `B` Library · `A` diplomacy, tech trading (later) | Build a relationship with another civ |
| **bronze-working** | mining | `U` Spearman · `A` reveals **Tin**; Hoplite/Phalanx UUs | Kill 3 barbarians |
| **masonry** | mining | `B` Walls · `I` Quarry · `W` Pyramids | Build a Quarry |
| **chariotry** | the-wheel, bronze-working | `U` Light Chariot · `U` Heavy/Scythed Chariot (UUs) | Own 2 Horses-improved tiles |
| **irrigation** | pottery | `I` improved Farm/Plantation yields · `W` Hanging Gardens | Farm 3 floodplain/river tiles |
| **trapping** | animal-husbandry | `I` Camp · `A` reveals **Furs/Ivory** | Build a Camp |
| **currency** | writing | `B` Market · `A` trade routes (Caravan) | Make a trade route |
| **mathematics** | writing, masonry | `U` Catapult · `A` districts/quarters cheaper | Build the Pyramids or 2 Catapults |
| **astrology** | mysticism, writing | `W` Oracle · `A` Great Prophet points | Find a Natural Wonder |

## Era III — Iron / Classical (1200 BCE–500 CE)

| Tech | Prereqs | Unlocks | Eureka |
|------|---------|---------|--------|
| **iron-working** | bronze-working | `U` Swordsman · `A` reveals **Iron**; Legionary/Immortal UUs | Build a Mine on Iron |
| **horseback-riding** | chariotry | `U` Horseman · `B` Stable · Cavalry UUs | Pasture 2 Horses |
| **construction** | masonry, currency | `B` Aqueduct · `B` Colosseum · `A` bridges over rivers | Build 2 Markets |
| **engineering** | the-wheel, masonry | `U` Ballista · `B` Fort · `I` Roman Road (Rome) · `A` Military Engineer | Build an Aqueduct |
| **drama-poetry** | astrology | `B` Amphitheater · `A` Great Writer points, Great Works | Build an Amphitheater |
| **philosophy** | drama-poetry, currency | `B` (national) Academy · `A` Great Scientist points; culture | Have 2 specialists working |
| **shipbuilding** | sailing, bronze-working | `U` Bireme/Trireme · `A` heal ships at sea | Own 2 Galleys |
| **mathematics→optics** *(optics)* | mathematics, shipbuilding | `U` Quinquereme/Dromon · `B` Lighthouse · `A` coastal sight | Build a Lighthouse |
| **iron-working→metal-casting** *(metal-casting)* | iron-working | `B` Forge · `B` Workshop (base) · `A` production from Forge | Build a Forge |
| **military-strategy** | iron-working, philosophy | `A` Great General points · formations | Win 3 land battles |

## Era IV — Medieval / Faith (500–1300 CE)

| Tech | Prereqs | Unlocks | Eureka |
|------|---------|---------|--------|
| **theology** | philosophy, astrology | `B` Cathedral · `U` Missionary/Apostle · `A` enhance religion | Found a religion |
| **feudalism** | currency, military-strategy | `U` Pikeman · `I` Manor/Field · `A` levy mechanics | Have 6 Farms |
| **stirrups-chivalry** *(chivalry)* | horseback-riding, feudalism | `U` Knight · Heavy-cavalry UUs (Paladin, Cataphract, Hussar) | Own 2 Knights' worth of resources (Horses+Iron) |
| **machinery** | engineering, iron-working | `U` Crossbowman · `U` Longbowman (England) · `B` Watermill/Lumber Mill | Own a Crossbowman |
| **castles** | construction, feudalism | `B` Castle · `A` Renaissance-walls upgrade | Build 3 Walls |
| **physics** | mathematics, engineering | `U` Trebuchet · `A` siege range | Build 2 Catapults/Ballistae |
| **education** | theology, philosophy | `B` University · `A` Great Scientist points ↑; science from specialists | Build 2 Libraries |
| **guilds** | currency, education | `B` Workshop (full) · `B` Bank (base) · `A` extra specialist slots | Make 3 trade routes |
| **steel** | iron-working, machinery | `U` Man-at-Arms / Longswordsman · UU Samurai/Landsknecht | Build an Armory/Forge upgrade |
| **compass** | optics, machinery | `B` Harbor · `A` +naval movement; enables Caravel research | Own 2 Harbors |
| **banking** | guilds, currency | `B` (full) Bank · `A` empire gold ↑; Great Merchant pts | Have 3 Banks-worth of trade gold |

## Era V — Exploration (1300–1550 CE)

| Tech | Prereqs | Unlocks | Eureka |
|------|---------|---------|--------|
| **astronomy** | education, optics | `B` Observatory · `A` cross deep **Ocean** tiles; science ↑ | Build a University adjacent to mountains |
| **cartography** | compass, astronomy | `U` Caravel · `U` Nau/Carrack (Portugal) · `A` ocean trade routes | Discover 2 new continents/landmasses |
| **gunpowder** | steel, physics | `U` Bombard · `U` Arquebusier/Musketeer · `U` Janissary (Ottomans) · `A` reveals **Saltpeter** | Build an Armory or capture a city with a siege unit |
| **metallurgy** | gunpowder, banking | `U` Cannon · `U` Conquistador (Spain) · `A` upgrade siege | Own a Bombard |
| **printing-press** | education, machinery | `B` Printing House · `A` science & Great Works of Writing ↑; eurekas worth more | Own 3 Universities |
| **square-rigging** *(navigation)* | cartography, banking | `U` Galleon · `U` Galleass (Venice) · `A` long ocean trade range | Sink a ship in deep ocean |
| **economics** | banking, printing-press | `B` Stock Exchange (early bourse) · `A` trade gold ↑; Economic victory progress | Have 2 Banks + 6 trade routes |
| **siege-tactics** | metallurgy, castles | `U` Great Bombard (Ottoman) · `A` bonus vs walls | Destroy a Castle/Walls with a Bombard |

---

## Tech-to-unit map (sanity check for unique units)

| Unique Unit | Required tech |
|-------------|---------------|
| Hoplite / Immortal / Legionary | bronze-working / iron-working |
| Companion Cavalry / Cataphract / Knight UUs | stirrups-chivalry |
| Longbowman | machinery |
| Samurai / Landsknecht / Man-at-Arms | steel |
| Longship / Bireme / Trireme | shipbuilding |
| Caravel / Nau / War Junk | cartography |
| Galleon / Galleass | square-rigging |
| Janissary / Arquebusier / Bombard | gunpowder |
| Conquistador / Cannon | metallurgy |
| Great Bombard | siege-tactics |

If a civ's UU has no reachable tech here, the `tools/` data validator flags it.

---

## Civics / Government tree (summary — see PLAN.md §3.5)

Runs in **parallel**, funded by Culture. Governments unlock through civics and provide **policy-card slots** (Military / Economic / Diplomatic / Wildcard):

`Code of Laws → Chiefdom` → **Despotism** | **Classical Republic** | **Oligarchy** → (Medieval) **Monarchy** | **Theocracy** → (Exploration) **Merchant Republic**.

Key civics also unlock: Mysticism (Pantheons), Drama (Great Works slots), Political Philosophy (choose government), Theology (religious policies), Feudalism/Serfdom (builder/levy policies), Mercenaries (unit maintenance), Guilds (commerce), Exploration (overseas settling & trade), Reformation/Humanism (Exploration-era culture & science).

> Wonders are unlocked across **both** trees; full wonder list maintained in `packages/data` and referenced in PLAN.md §3.5.
