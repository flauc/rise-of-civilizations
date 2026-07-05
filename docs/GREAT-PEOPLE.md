# Great People & Legends

> ✅ **Status: IMPLEMENTED (2026-06-21), with simplifications.** Both systems are live in `packages/sim` + `packages/data` with UI, AI, save/load, an in-game wiki category each, and generated portrait art. **What's faithful:** the full named rosters (every figure/hero below exists by name, era, and class/type), the point-pool → recruit → activate flow for Great People, and the faith-recruit → lifespan → aura flow for Legends. **What's simplified (read the per-section "Implementation" notes):**
> - **Great People effects are per-CLASS, not per-figure** — every Scientist gives the same instant eureka, every General the same army drill, etc. The unique signature in each figure's row is *flavour text*, not a distinct coded effect. **Exception: Great Prophets are per-FIGURE (2026-07-05)** — each gives a smaller flat faith burst plus a distinct, historically-themed gift (see §1.6). All effects are **instant one-shots** (a few prophet gifts grant a *timed* empire buff); auras, placed improvements (a General's Citadel), unit-attach, and Great Works / tourism are **not** implemented (the Writer/Artist/Musician classes are merged into one **Artist** culture class).
> - **Legends are recruited with FAITH** (a rising cost), not the varied per-hero paths (Faith/Culture/Conquest/Wonder/Quest) — those are flavour. Each hero reskins a base unit and carries a flat combat bonus + an adjacent-ally aura + a lifespan; the per-hero **signature active ability** is flavour (the base unit's own abilities apply). The optional **Mythic toggle** is not built.
>
> The "Specialists" in `specialists.ts` remain a *separate* system (craftsmen for Public Works — see [SPECIALISTS-AND-WORKS.md](SPECIALISTS-AND-WORKS.md)), unrelated to the Great People here.

Two related "character" systems:

1. **Great People** — finite, named historical figures earned by accumulating **class points** (from specialists, buildings, wonders, and certain civ abilities). Each is a one-time recruit with a one-shot activation and/or a passive while present. They are *characters*, not generic units (see [PLAN.md §3.6](PLAN.md)).
2. **Legends (Heroes)** — the **core "Legends" feature**: powerful, limited unique units recruited via faith/culture/quests, with signature abilities and a lifespan. A civ's leader may also appear here.

> Effects below are *intent*; tuned numbers live in `packages/data`. Each Great Person has a unique `id`, an `era`, a `class`, and an `effect` hook name implemented in `packages/sim`.

---

## 1. Great People

### How they work
- Each **class** has its own point pool, filled by matching buildings each turn.
- When a pool fills you **recruit the next available figure** for that class (figures unlock roughly in era order; once recruited globally they're gone for that game — competition for the best ones).
- Activation is either an **instant effect**, a **placed tile improvement** (e.g. a General's Citadel), or **attaching to a unit/city** (passive aura).

> **Implementation (`great-people.ts`, `@roc/data` `GREAT_PEOPLE`).** Eight classes: **General, Admiral, Scientist, Engineer, Merchant, Prophet, Artist, Statesman** — the design's Writers/Artists/Musicians are merged into one **Artist** (culture) class. Per-turn class points come from buildings: Archive/Academy → Scientist; Market/Harbor → Merchant; Harbor/Lighthouse → Admiral; Barracks/Stable → General; Workshop/Forge → Engineer; Shrine/Temple → Prophet; Monument/Amphitheater → Artist; the **capital** (seat of government) → Statesman. The first figure of a class costs **60** points, each later one **+50** (60 → 110 → 160 …). Recruits wait in the 🎖️ panel until **activated** for a one-shot, **per-class** effect (the figure's own row is flavour): Scientist → **+160 science** (eureka); Merchant → **+250 gold**; Engineer → **+150 production** in your best city; Artist → **+150 culture**; Statesman → **+150 culture** (toward civics); Prophet → **+110 faith PLUS a per-figure gift** (see §1.6 — the one per-figure class); General → a **free promotion to every land military unit** + morale; Admiral → **heal your fleet & army** + morale. Auras, placed improvements, unit-attach, and Great Works/tourism are **not** built. AI activates recruits immediately; an in-game **Wiki → Great People** category and generated portraits (`great-people/<id>.png`) round it out.

> **No double-dipping with Legends (2026-07-03):** a historical person appears in ONE system only. Figures who exist as Legends (Sun Tzu, Hannibal, Julius Caesar, Belisarius, Subutai, Joan of Arc, Zheng He, Yi Sun-sin) were removed from the Great People roster and replaced by era-matched peers (Epaminondas, Pyrrhus, Gaius Marius, Charles Martel, Baibars, du Guesclin, Andrea Doria, Francis Drake).

### 1.1 Great Generals (land military)
*Earned from: combat, Barracks/Armory, Military civics. Effect template: combat aura to nearby units + a one-shot (build Citadel, instant promotion, or retreat).*

| Figure | Era | Signature effect |
|--------|-----|------------------|
| Epaminondas | Classical | Oblique order: one-shot free promotion to the land army |
| Pyrrhus of Epirus | Classical | The fighting king: rallies the land army with a free promotion |
| Scipio Africanus | Classical | Aura vs other civ's UUs; build a Citadel |
| Gaius Marius | Classical | Reformer of the legions: drills the land army (free promotion) |
| Charles Martel | Medieval | The Hammer of Tours: steels the land army (free promotion) |
| Khalid ibn al-Walid | Medieval | Aura: cavalry pursuit & morale; heal on kill |
| Baibars | Medieval | Victor of Ain Jalut: drills the land army (free promotion) |
| Jan Žižka | Medieval | Aura: defensive wagon-fort bonus; gunpowder ready |
| Bertrand du Guesclin | Medieval | The Eagle of Brittany: drills the land army (free promotion) |
| Gonzalo de Córdoba | Exploration | Aura: gunpowder units +combat (tercio) |

### 1.2 Great Admirals (naval)
*Earned from: Harbor/Lighthouse/Shipyard, naval combat. Template: naval aura + one-shot (heal fleet, instant ocean move, spawn ship).*

| Figure | Era | Signature effect |
|--------|-----|------------------|
| Themistocles | Classical | Aura: +combat in coastal waters; one-shot: free Trireme |
| Gaius Duilius | Classical | Aura: boarding bonus (naval melee) |
| Artemisia | Classical | Aura: hit-and-run at sea |
| Leif Erikson | Medieval | One-shot: fleet may cross ocean before Astronomy |
| Francis Drake | Exploration | Scourge of the Armada: heals fleet & army, lifts morale |
| Andrea Doria | Exploration | Aura: +gold from coastal cities; repair fleet |
| Khair ad-Din Barbarossa | Exploration | Aura: coastal raiding gold; capture enemy ships |

### 1.3 Great Scientists
*Earned from: Library/University/Academy, science specialists. Template: instant tech/eureka or science burst.*

| Figure | Era | Signature effect |
|--------|-----|------------------|
| Archimedes | Classical | One-shot: instant eureka for 1 tech; siege boost |
| Hypatia | Classical | Libraries +science empire-wide |
| Aristotle | Classical | Extra science from city-state envoys |
| Aryabhata | Classical | Instant progress in math/astronomy techs |
| Zhang Heng | Classical | Free Observatory-equivalent building |
| Al-Khwarizmi | Medieval | One-shot: 2 eurekas |
| Ibn al-Haytham | Medieval | Universities +science |
| Su Song | Medieval | Free Workshop + production toward science buildings |
| Hildegard of Bingen | Medieval | Science from faith (Holy Site adjacency) |
| Nicolaus Copernicus | Exploration | Big science burst; boosts Astronomy/Exploration techs |

### 1.4 Great Engineers
*Earned from: Workshop/Forge, production wonders. Template: wonder/production boost, free building, fortification.*

| Figure | Era | Signature effect |
|--------|-----|------------------|
| Imhotep | Bronze | One-shot: large production toward a Wonder |
| Vitruvius | Classical | Free Aqueduct/Bath; +district production |
| Su Song (eng.) | Medieval | Free Watermill + production |
| Filippo Brunelleschi | Medieval | One-shot: finish a wonder instantly (capped) |
| Isidore of Miletus | Medieval | Build a unique dome wonder cheaply |
| Mimar Sinan | Exploration | Walls/Castles +defense; free fortification |
| Leonardo da Vinci | Exploration | +production & unit upgrade discounts (workshop genius) |

### 1.5 Great Merchants
*Earned from: Market/Bank/Harbor, trade routes. Template: gold burst, acquire luxury, trade-route capacity.*

| Figure | Era | Signature effect |
|--------|-----|------------------|
| Zhang Qian | Classical | One-shot: +1 trade route capacity; open Silk Road |
| Marco Polo | Medieval | Reveal map / trade-route range ↑; gold |
| Ibn Battuta | Medieval | Diplomatic visibility + gold from distant routes |
| Cosimo de' Medici | Exploration | Banks +gold; Great Person points ↑ |
| Jakob Fugger | Exploration | Huge gold burst; influence over city-states |
| Wang Anshi | Medieval | Reforms: food/gold from markets empire-wide |

### 1.6 Great Prophets (found & shape religions)
*Earned from: Shrine/Temple/Cathedral, Holy Sites, faith.*

> **Prophets are the one class with PER-FIGURE effects (2026-07-05).** Every prophet still gives a **flat faith burst — now smaller (+110)** — but layers a distinct, historically-themed **gift** on top (`ProphetGift` in `@roc/data`, resolved in `great-people.ts`). This is the exception to the "effects are per-class" simplification noted at the top of this doc.

| Figure | Era | As-built effect (faith +110, then…) |
|--------|-----|------------------|
| Zarathustra | Bronze | **Sacred Fire** — the holy war on the Lie: for 10 turns your units reap +6 faith per kill, +8 empire morale |
| Confucius | Classical | **Rites in Stone** — raises a Temple at once in your 2 best temple-less cities (else +120 faith) |
| Laozi | Classical | **The Watercourse Way** — faith flows +25% empire-wide for 10 turns |
| Siddhartha Gautama | Classical | **Great Compassion** — mends every wounded unit to full health, +12 empire morale |
| Augustine of Hippo | Medieval | **City of God** — ordains 2 free Missionaries at your holy city and presses the faith into it (+40) |
| Thomas Aquinas | Medieval | **Summa Theologica** — faith wedded to reason: an instant +150 science |
| Rumi | Medieval | **Whirling of the Heart** — a +30 pressure surge across every city, +20% culture for 8 turns |

> Religious figures are treated factually as the historical founders/teachers of real traditions, consistent with the religion mechanic. Founding a religion is optional per game.

### 1.7 Great Writers / Artists / Musicians (culture & tourism)
*Earned from: Amphitheater/Theater/Museum, culture specialists. Each produces **Great Works** that fill slots and generate tourism.*

| Figure | Class | Era | Great Work / effect |
|--------|-------|-----|---------------------|
| Homer | Writer | Classical | Epic Great Works (great tourism) |
| Sappho | Writer | Classical | Lyric works; culture burst |
| Valmiki | Writer | Classical | Epic works |
| Murasaki Shikibu | Writer | Medieval | Prose works; +tourism |
| Ferdowsi | Writer | Medieval | National epic; culture |
| Dante Alighieri | Writer | Exploration | Works + faith/culture |
| Phidias | Artist | Classical | Sculpture works; wonder beauty |
| Gu Kaizhi | Artist | Classical | Scroll works |
| Giotto | Artist | Medieval | Fresco works |
| Andrei Rublev | Artist | Medieval | Icon works (faith + culture) |
| Michelangelo | Artist | Exploration | Masterpiece works (huge tourism) |
| Hildegard of Bingen | Musician | Medieval | Composition works; faith + culture |
| Guillaume de Machaut | Musician | Medieval | Composition works |
| Josquin des Prez | Musician | Exploration | Composition works; +tourism |

### 1.8 Great Statesmen / Lawgivers (governance & civics)
*Earned from: Government Plaza/Palace, diplomatic civics. Template: instant civic, bonus policy slot, or governance reform.*

| Figure | Era | Signature effect |
|--------|-----|------------------|
| Solon | Classical | One-shot: instant civic (lawgiving) |
| Lycurgus | Classical | Extra Military policy slot |
| Chanakya (Kautilya) | Classical | Diplomatic/economic policy power; spy bonus |
| Cicero | Classical | Culture from cities; oratory |
| Justinian (law) | Medieval | Codify law: reduced unrest, extra Wildcard slot |
| Yelü Chucai | Medieval | Conquered cities stabilize; admin reform |
| Eleanor of Aquitaine | Medieval | Culture flips nearby cities (loyalty pressure) |
| Thomas More | Exploration | Amenities/utopian policy; +Wildcard slot |

---

## 2. Legends (Heroes) — *core feature*

Heroes are **recruitable, powerful, limited units** central to the game's identity. They're earned through a **recruitment path** (faith/culture points, a wonder, or a quest), have **signature abilities**, and a **lifespan/cooldown** so they stay precious and don't snowball. On by default; toggleable off per game.

> The **passive auras** in the table below are the hero's always-on effect. Combat Legends *also*
> get a **signature *active* ability** (a triggered battlefield power) — see
> [UNIT-ABILITIES.md §9](UNIT-ABILITIES.md) for the curated roster (e.g. Leonidas → Last Stand,
> Hannibal → Grand Ambush, Genghis → Terror).

**Type:** `land` / `naval` / `support`. **Recruit via:** the path that fits the hero (Faith, Culture, Conquest, Wonder, Quest). **Lifespan:** turns active before they retire (some rechargeable).

> **Implementation (`legends.ts`, `@roc/data` `LEGENDS`).** All heroes below exist with their era and type. They are recruited from the **⭐ Legends** panel by spending **faith** — the "Recruit via" column is flavour; the real cost is faith, rising **150 → 250 → 350 …** per hero. Each is **globally unique** while alive. On recruit, the hero spawns at one of your cities (naval heroes on adjacent water) as a unit reskinning a base type (`baseType`), with a flat **combat bonus**, an **aura** giving adjacent friendly military +combat (strongest nearby aura only; no stacking), and a **lifespan** (~30 turns; a few — e.g. Joan of Arc — are *rechargeable* and return to the pool when they retire). On the map a hero shows a gold ring, a 👑 crown, and its name. Every hero's **signature power is now real** (2026-07-03): combat legends field curated/bespoke active-ability kits (`LEGEND_ABILITY_OVERRIDES`, content.ts), support legends exert passives while they live (`legend-passives.ts` per-turn ticks + `legend-effects.ts` presence effects) — see [UNIT-ABILITIES.md §9](UNIT-ABILITIES.md) for the full as-built table. Enabled by default; a per-game **Legends** toggle (lobby + `legendsEnabled`) switches the whole feature off. AI recruits heroes when it can afford them; an in-game **Wiki → Legends** category, generated **portraits** (`legends/<id>.png`) and **map unit tokens** (`units/<id>.png`) complete it. The optional **Mythic toggle** is not built.

| Legend | Era | Type | Signature power (as built) | Recruit via |
|--------|-----|------|----------------------------|-------------|
| Gilgamesh | Bronze | land | Slay the Beast: +6 vs barbarians; kills hearten nearby allies | Quest (slay a beast camp) |
| Hammurabi | Bronze | support | Code of Laws: +1 global morale every turn | Wonder (Walls of Babylon) |
| Ramesses II | Bronze | support | Monument Builder: his city +25% production & culture | Faith |
| Cyrus the Great | Classical | land | The King's March: +1 movement for Cyrus & adjacent allies | Conquest |
| Leonidas | Classical | land | Last Stand: hero-grade brace that grows as he is wounded | Culture |
| Alexander | Classical | land | Hammer & Anvil + Shock Charge | Conquest |
| Hannibal | Classical | land | Grand Ambush: the only elephant that Hides in cover; Trample | Quest (cross mountains) |
| Sun Tzu | Classical | support | Art of War: adjacent allies +3 XP/turn; reveals hidden enemies | Culture |
| Qin Shi Huang | Classical | support | Great Wall: every city +6 defense while he lives | Wonder |
| Ashoka | Classical | support | Dhamma: +2 faith/turn; adjacent allies heal +10/turn; no attacks | Faith |
| Boudica | Classical | land | Uprising: an adjacent barbarian war-band joins your side | Quest |
| Julius Caesar | Classical | land | Veteran Legions: Pilum Volley + Plunder | Conquest |
| Cleopatra | Classical | support | Allure: adjacent enemies −2 CS; +3 gold/turn | Faith |
| Attila | Medieval | land | Terror: Terrorize (rout check) + Fire & Retreat | Conquest |
| Belisarius | Medieval | land | Against All Odds: +2 CS per adjacent enemy beyond the first | Conquest |
| Charlemagne | Medieval | support | Crown of the West: +2 faith/turn; Heroic Challenge | Faith |
| Harald Hardrada | Medieval | naval | Strandhögg: raiding strike that loots gold; Ram | Conquest |
| El Cid | Medieval | land | Campeador: +4 CS beyond your own borders | Quest |
| Saladin | Medieval | land | Horns of Hattin: Feigned Retreat + Harry | Faith |
| Genghis Khan | Medieval | land | Terror of the Steppe: adjacent enemies −3 morale/turn; Nerge | Conquest |
| Subutai | Medieval | land | Hit and Run: Parthian Shot + Feigned Retreat | Conquest |
| Joan of Arc | Medieval | land | Sacred Banner: heal + morale surge; martyr (rechargeable) | Faith |
| Tomoe Gozen | Medieval | land | Duelist: Heroic Challenge + mounted archery | Quest |
| Mansa Musa | Medieval | support | Golden Flood: +8 gold every turn | Faith |
| Tamerlane | Exploration | land | Pyramid of Skulls: kills panic every enemy within 2 tiles | Conquest |
| Mehmed II | Exploration | support | The Basilica: +1-range bombard, +6 vs wall/fort defenders | Wonder |
| Pachacuti | Exploration | support | Qhapaq Ñan: land units ignore rough terrain; his city +25% food | Culture |
| Zheng He | Exploration | naval | Treasure Fleet: +4 gold/turn, ships +1 movement; Monsoon Run | Wonder |
| Yi Sun-sin | Exploration | naval | Turtle Ship: Turtle Shell stance + Broadside | Quest |

> **Mythic toggle (optional):** a separate switch can add legendary/mythic heroes (e.g. Gilgamesh's beast-hunts expanded) for groups who want fantasy flavor — kept out of the default historically-grounded mode.

---

## Implementation notes (as built)
- **Great person schema** (`@roc/data` `GreatPersonDef`): `{ id, name, cls: GreatPersonClass, era, effect: GreatPersonEffect, desc, prophetGift? }`. `effect` is one of eight **class-level** hooks (`eureka | windfall | masterwork | inspiration | revelation | reform | drill | flagship`) resolved in `great-people.ts`. The optional **`prophetGift`** (`ProphetGift` union) is the one per-figure field — carried only by Great Prophets, it layers a secondary historically-themed effect (timed buff, temple, missionaries, heal, science, pressure surge) on top of the smaller `revelation` faith burst.
- **Legend schema** (`@roc/data` `LegendDef`): `{ id, name, era, type, recruitVia, baseType, combatBonus, auraBonus, lifespan, rechargeable, ability, abilityDesc, auraDesc }`. `recruitVia` is flavour; `ability`/`abilityDesc` name the hero's REAL signature power, coded as active kits (`LEGEND_ABILITY_OVERRIDES`, content.ts; resolution in abilities.ts/combat.ts) or passives (`legend-passives.ts` ticks + `legend-effects.ts` presence effects), alongside `baseType` + `combatBonus` + `auraBonus` + `lifespan` + `rechargeable`.
- **State:** `Player.greatPeoplePoints` / `greatPeopleEarned` / `greatPeople[]` and `GameState.recruitedGreatPeople[]`; `Player.legendsRecruited`, `GameState.legendsEnabled` / `recruitedLegends[]`; a Legend on the map is a `Unit` with `legendId` + `legendExpiresOnTurn`. All serialized for save/load and the multiplayer player-view.
- **Commands:** `activateGreatPerson { greatPersonId }`, `recruitLegend { legendId, cityId? }`. Accrual/recruitment runs in `beginTurn` (`accrueGreatPeople`), lifespans retire in `beginTurn` (`tickLegends`). Tested in `great-people.test.ts` (12) + `legends.test.ts` (9).
- Cross-references: civ leaders that double as Legends are linked in [CIVILIZATIONS.md](CIVILIZATIONS.md); eras align with [TECHNOLOGIES.md](TECHNOLOGIES.md).
