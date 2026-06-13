# Great People & Legends

Two related "character" systems:

1. **Great People** — finite, named historical figures earned by accumulating **class points** (from specialists, buildings, wonders, and certain civ abilities). Each is a one-time recruit with a one-shot activation and/or a passive while present. They are *characters*, not generic units (see [PLAN.md §3.6](PLAN.md)).
2. **Legends (Heroes)** — the **core "Legends" feature**: powerful, limited unique units recruited via faith/culture/quests, with signature abilities and a lifespan. A civ's leader may also appear here.

> Effects below are *intent*; tuned numbers live in `packages/data`. Each Great Person has a unique `id`, an `era`, a `class`, and an `effect` hook name implemented in `packages/sim`.

---

## 1. Great People

### How they work
- Each **class** has its own point pool, filled by matching specialists/buildings (e.g. Library/University → Scientist points; Temple/Cathedral → Prophet points; Barracks/combat → General points).
- When a pool fills you **recruit the next available figure** for that class (figures unlock roughly in era order; once recruited globally they're gone for that game — competition for the best ones).
- Activation is either an **instant effect**, a **placed tile improvement** (e.g. a General's Citadel), or **attaching to a unit/city** (passive aura).

### 1.1 Great Generals (land military)
*Earned from: combat, Barracks/Armory, Military civics. Effect template: combat aura to nearby units + a one-shot (build Citadel, instant promotion, or retreat).*

| Figure | Era | Signature effect |
|--------|-----|------------------|
| Sun Tzu | Classical | Nearby units +XP; one-shot: grant a free promotion to all adjacent units |
| Hannibal Barca | Classical | Aura: +combat across rivers/in rough terrain; one-shot: ambush move |
| Scipio Africanus | Classical | Aura vs other civ's UUs; build a Citadel |
| Julius Caesar | Classical | Aura + gold/culture when you win battles |
| Belisarius | Medieval | Aura: outnumbered units fight at full strength |
| Khalid ibn al-Walid | Medieval | Aura: cavalry pursuit & morale; heal on kill |
| Subutai | Medieval | Aura: mounted/ranged extra movement & flanking |
| Jan Žižka | Medieval | Aura: defensive wagon-fort bonus; gunpowder ready |
| Joan of Arc | Medieval | Aura: rally — heal & +combat; clears war-weariness |
| Gonzalo de Córdoba | Exploration | Aura: gunpowder units +combat (tercio) |

### 1.2 Great Admirals (naval)
*Earned from: Harbor/Lighthouse/Shipyard, naval combat. Template: naval aura + one-shot (heal fleet, instant ocean move, spawn ship).*

| Figure | Era | Signature effect |
|--------|-----|------------------|
| Themistocles | Classical | Aura: +combat in coastal waters; one-shot: free Trireme |
| Gaius Duilius | Classical | Aura: boarding bonus (naval melee) |
| Artemisia | Classical | Aura: hit-and-run at sea |
| Leif Erikson | Medieval | One-shot: fleet may cross ocean before Astronomy |
| Zheng He | Exploration | Aura + huge trade/diplomacy bonus from naval trade routes |
| Andrea Doria | Exploration | Aura: +gold from coastal cities; repair fleet |
| Khair ad-Din Barbarossa | Exploration | Aura: coastal raiding gold; capture enemy ships |
| Yi Sun-sin | Exploration | Aura: armored ships (turtle) take reduced damage |

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
*Earned from: Shrine/Temple/Cathedral, Holy Sites, faith. Template: found a religion (choose beliefs) or enhance it.*

| Figure | Era | Signature effect |
|--------|-----|------------------|
| Zarathustra | Bronze | Found a religion; faith from fire-temples/light |
| Confucius | Classical | Found a religion; culture/order beliefs |
| Laozi | Classical | Found a religion; faith from nature/wonders |
| Siddhartha Gautama | Classical | Found a religion; amenities/peace beliefs |
| Adi Shankara | Classical | Enhance religion; science from holy sites |
| Augustine of Hippo | Medieval | Enhance religion; missionary/apostle strength |
| Bodhidharma | Medieval | Apostles gain combat; spread along trade |
| Thomas Aquinas | Medieval | Faith→science; theological-combat bonus |
| Rumi | Medieval | Spread pressure & culture from religion |

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

**Type:** `land` / `naval` / `support`. **Recruit via:** the path that fits the hero (Faith, Culture, Conquest, Wonder, Quest). **Lifespan:** turns active before they retire (some rechargeable).

| Legend | Era | Type | Signature ability | Recruit via |
|--------|-----|------|-------------------|-------------|
| Gilgamesh | Bronze | land | Inspires adjacent units; bonus vs barbarians/beasts | Quest (slay a beast camp) |
| Hammurabi | Bronze | support | Grants instant eureka/civic while present; reduces unrest | Wonder (Walls of Babylon) |
| Ramesses II | Bronze | support | Massive wonder/district production aura | Faith |
| Cyrus the Great | Classical | land | Lightning conquest: captured cities keep loyalty; fast move | Conquest |
| Leonidas | Classical | land | Last-stand: huge defensive bonus when outnumbered | Culture |
| Alexander | Classical | land | No war-weariness; capturing cities heals army | Conquest |
| Hannibal | Classical | land | Crossing/ambush mastery; flanking aura | Quest (cross mountains) |
| Sun Tzu | Classical | support | Army-wide +XP & free promotions; reveals enemy plans | Culture |
| Qin Shi Huang | Classical | support | Builders/army surge; speeds a wonder (Great Wall) | Wonder |
| Ashoka | Classical | support | Converts war into faith; amenities aura | Faith |
| Boudica | Classical | land | Converts nearby barbarians/units; rally vs occupiers | Quest |
| Julius Caesar | Classical | land | Gold/culture from victories; veteran legions | Conquest |
| Cleopatra | Classical | support | Trade/diplomacy & gold aura; allure (city-state influence) | Faith |
| Attila | Medieval | land | Siege from movement; raze for production | Conquest |
| Belisarius | Medieval | land | Outnumbered-army full strength; reconquest | Conquest |
| Charlemagne | Medieval | support | Faith + military synergy; crowns/loyalty | Faith |
| Harald Hardrada | Medieval | naval | Coastal raiding gold; ocean voyaging early | Conquest |
| El Cid | Medieval | land | Frontier hero: combat vs other religions; loyalty | Quest |
| Saladin | Medieval | land | Heal on holy ground; bonus vs crusaders/other faiths | Faith |
| Genghis Khan | Medieval | land | Supercharges cavalry (move/sight/combat); terror | Conquest |
| Subutai | Medieval | land | Mounted-ranged hit-and-run mastery; flanking aura | Conquest |
| Joan of Arc | Medieval | land | Rally: heal + combat surge; martyr resurrection once | Faith |
| Tamerlane | Exploration | land | Siege devastation; plunder enriches empire | Conquest |
| Mehmed II | Exploration | support | Great Bombard siege; walls fall faster | Wonder |
| Pachacuti | Exploration | support | Mountain logistics & terrace food aura; rapid expansion | Culture |
| Mansa Musa | Medieval | support | Flood of gold; trade-route value aura | Faith |
| Zheng He | Exploration | naval | Treasure fleet: trade/diplomacy & exploration aura | Wonder |
| Yi Sun-sin | Exploration | naval | Armored ships; crushing naval defense | Quest |
| Tomoe Gozen | Medieval | land | Duelist: massive single-combat strength; mounted archery | Quest |

> **Mythic toggle (optional):** a separate switch can add legendary/mythic heroes (e.g. Gilgamesh's beast-hunts expanded) for groups who want fantasy flavor — kept out of the default historically-grounded mode.

---

## Implementation notes
- **Schema (great person):** `{ id, name, class, era, effect: hookName, kind: 'instant'|'improvement'|'attach', work?: greatWorkId }`.
- **Schema (legend):** `{ id, name, era, type, recruitVia, ability: hookName, lifespan, rechargeable, baseStats }`.
- Effect/ability `hookName`s are implemented and unit-tested in `packages/sim`; `tools/` validates every figure references a real hook and (for legends) a valid recruit path.
- Cross-references: civ leaders that double as Legends are linked in [CIVILIZATIONS.md](CIVILIZATIONS.md); unlock eras align with [TECHNOLOGIES.md](TECHNOLOGIES.md).
