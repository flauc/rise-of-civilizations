# Leader Abilities

> **Status (audited 2026-06-19): IMPLEMENTED, with reduced effects.** All 82 leader abilities exist in `packages/sim/src/game/leader-abilities.ts` with real effects, tech/civic unlocks, and cooldowns. **However, several documented benefits and costs below are NOT in the code because the underlying systems don't exist** — and per the audit's intent these count as *not implemented*:
> - **Envoys / city-states** (e.g. "+2 envoys with every city-state", "lose 1 envoy") — no city-state or envoy system exists; these clauses are dropped or replaced with gold/culture in code.
> - **Diplomatic favor / standing penalties** (e.g. "−5 diplomatic favor per turn", "diplomatic standing worsens") — no diplomatic-favor metric exists.
> - **War-weariness** (e.g. France "ignore war-weariness") — war-weariness is not modeled.
> - **Amenity costs/benefits** (e.g. "lose 1 amenity", "+1 amenity") — amenities exist only as a resource yield; per-city timed amenity modifiers from abilities are mostly not wired.
> - **Unique-unit spawns** spawn the **base** unit instead (e.g. "2 War-Carts" → `light_chariot`, "Mycenaean Spearmen" → `spearman`, "Junks" → `war_junk`), since unique units aren't real types.
> - **Unlock columns are inaccurate**: the tech/civic names here (Iron Working, Horseback Riding, Theology, Currency, Education, Feudalism, Gunpowder…) do **not** match the shipped tech/civic ids (`iron_bloomery`, `equestrian`, `mysticism`, `coinage`, `philosophy`, `statecraft`…). See the actual `unlock` field per civ in `leader-abilities.ts`.
> - **Civ naming drift**: this doc labels some civs differently from the data — "Ostrogoths"→`goths`, "England"→`anglo_saxon_england`, "Qin/Tang China"→`han_china`/`china_tang_song`, "Rapa Nui"→`polynesia`, "Vietnam"→`dai_viet_vietnam`, etc.

Each playable civilization has a unique **active Leader Ability**: a powerful, historically flavored action that can be used repeatedly, but only after a cooldown and only once its prerequisite technology or civic has been researched. Every ability is intentionally **double-edged** — it grants a notable benefit but imposes a meaningful cost, deficit, or strategic trade-off.

These abilities are *active* (a button or command the player chooses to use), not the always-on passive **Civ Ability** documented in [CIVILIZATIONS.md](CIVILIZATIONS.md).

---

## Design goals

1. **Historical flavor** — each ability reflects a famous decision, campaign, policy, or crisis of its leader.
2. **Double-edged** — no ability is pure upside. The cost can be population, gold, science/culture, amenities, war-weariness, diplomatic standing, or opportunity cost elsewhere.
3. **Cooldown gated** — powerful abilities can't be spammed; the cooldown is measured in turns and stored per player (`lastUsedTurn`).
4. **Tech/Civic unlocked** — abilities become available in the mid-game or later, so they don't dominate the very first turns.
5. **Simple to implement** — effects are compositions of existing simulation primitives: spawn units, modify yields, consume population, grant/revoke envoys, apply temporary combat modifiers, etc.

---

## Mechanics summary

- A leader ability is unlocked when the player owns its prerequisite **technology** or **civic**.
- Using the ability sets `leaderAbilityLastUsedTurn = currentTurn`.
- The ability is grayed out until `currentTurn - leaderAbilityLastUsedTurn >= cooldown`.
- Cooldowns are global to the player, not per city.
- If the ability costs population, it is consumed from the **capital** first (or distributed across eligible cities if the cost exceeds capital population). If there isn't enough population, the ability cannot be used.
- Temporary yield/combat modifiers are tracked as timed **player effects** and decay automatically.

---

## Mesopotamia & the Near East

| Civ | Leader | Ability | Benefit | Cost / Drawback | Unlock | Cooldown |
|-----|--------|---------|---------|-----------------|--------|----------|
| **Sumer** | Gilgamesh | **City of Uruk Levy** | Spawn 2 War-Carts near the capital instantly | Capital loses 2 citizens and 100 gold | The Wheel | 15 turns |
| **Akkad** | Sargon | **Sons of Sargon Mobilization** | All cities gain +25% production for 10 turns | All cities lose 1 amenity (overworked populace) | Bronze Working | 20 turns |
| **Babylon** | Hammurabi | **Code of Laws** | Instantly finish the current civic and gain bonus culture | -20% science for 5 turns (legal bureaucracy slows inquiry) | Writing | 25 turns |
| **Assyria** | Ashurbanipal | **Library of Nineveh** | Steal a random technology from the nearest rival you have met | All cities lose 2 amenities for 5 turns (terror and deportation) | Iron Working | 25 turns |
| **Hittites** | Suppiluliuma | **Iron of Hatti** | All mine tiles produce +2 production for 10 turns | All mine tiles produce -1 food for 10 turns (miners drafted) | Iron Working | 20 turns |
| **Elam** | Untash | **Chogha Zanbil Devotion** | Capital gains +50% production toward wonders for 10 turns and +2 faith | Other cities lose 20% production (labor diverted to the capital) | Masonry | 25 turns |
| **Phoenicia** | Dido | **Colonial Expedition** | Gain a free Settler and all naval units +1 movement for 10 turns | Capital loses 2 population (colonists depart) | Sailing | 25 turns |
| **Lydia** | Croesus | **Debase the Stater** | Instantly gain 300 gold | All cities produce -15% gold for 10 turns (inflation) | Currency | 20 turns |

### Historical notes

- **City of Uruk Levy** — Gilgamesh, the semi-mythical king of Uruk, is described in the *Epic of Gilgamesh* as a builder and warrior who could summon the fighting men of his city.
- **Sons of Sargon Mobilization** — Sargon of Akkad forged the world's first known empire and imposed a centralized administration over conquered Sumerian cities.
- **Code of Laws** — Hammurabi is famous for his law code, one of the earliest comprehensive legal systems, inscribed on a stele.
- **Library of Nineveh** — Ashurbanipal assembled a vast library at Nineveh with tablets from across the empire, preserving works such as the *Epic of Gilgamesh*.
- **Iron of Hatti** — The Hittites were early masters of ironworking, giving them a military and economic edge during the Late Bronze Age.
- **Chogha Zanbil Devotion** — Untash-Napirisha built the ziggurat of Chogha Zanbil, a major Elamite religious center in present-day Iran.
- **Colonial Expedition** — Dido (Elissa) is the legendary Phoenician queen who led colonists from Tyre to found Carthage in North Africa.
- **Debase the Stater** — Croesus of Lydia issued some of the first standardized gold and silver coins, and his name became synonymous with wealth.

---

## Persia & Iran

| Civ | Leader | Ability | Benefit | Cost / Drawback | Unlock | Cooldown |
|-----|--------|---------|---------|-----------------|--------|----------|
| **Median Empire** | Cyaxares | **Horse Lords' Levy** | Spawn 2 Median Lancers near the capital | Consumes 2 population and 3 Horses resources | Horseback Riding | 20 turns |
| **Persia** | Cyrus | **Satrapal Tribute** | Gain 200 gold and +2 envoys with every city-state you have met | All cities produce -15% production for 5 turns (administrative burden) | Statecraft | 25 turns |
| **Parthia** | Mithridates | **Parthian Shot** | Mounted ranged units get +1 movement and +3 ranged strength for 10 turns | Melee units lose -2 strength for 10 turns (army favors horse archers) | Horseback Riding | 20 turns |
| **Sassanid Persia** | Khosrow | **Eranshahr Renovation** | All cities gain +1 amenity and +25% culture for 10 turns | All cities produce -20% gold for 10 turns (court extravagance) | Theology | 25 turns |

### Historical notes

- **Horse Lords' Levy** — The Medes were renowned cavalrymen; Cyaxares reorganized the Median army into a disciplined force.
- **Satrapal Tribute** — Cyrus the Great divided the Achaemenid Empire into satrapies governed by satraps who sent tribute and soldiers to the king.
- **Parthian Shot** — Parthian horse archers perfected the tactic of feigning retreat while shooting backward, giving rise to the phrase "Parthian shot."
- **Eranshahr Renovation** — Khosrow I (Anushirvan) sponsored major legal, agricultural, and architectural reforms across the Sassanid Empire.

---

## Egypt & Africa

| Civ | Leader | Ability | Benefit | Cost / Drawback | Unlock | Cooldown |
|-----|--------|---------|---------|-----------------|--------|----------|
| **Egypt** | Hatshepsut | **Monumental Building Spree** | All cities gain +25% production toward Wonders for 10 turns | Each city starting a Wonder project loses 1 population (corvée labor) | Masonry | 25 turns |
| **Kush / Nubia** | Amanirenas | **City of the Dead Rush** | Desert cities gain +3 production and +2 faith for 10 turns | Non-desert cities produce -10% food for 10 turns | Masonry | 20 turns |
| **Carthage** | Hannibal | **Alpine Crossing** | All land units ignore rough-terrain movement penalty and gain +1 movement for 5 turns | All land units take 10 damage per turn during the effect (harsh forced march) | Engineering | 20 turns |
| **Aksum** | Ezana | **Red Sea Trade Mission** | All trade routes yield +5 gold and +2 faith for 10 turns | Military unit maintenance costs +50% for 10 turns (merchant focus) | Currency | 25 turns |
| **Ethiopia (Zagwe)** | Lalibela | **Rock-Hewn Pilgrimage** | Gain +50 faith and all cities gain +1 amenity for 10 turns | All cities produce -15% production for 10 turns (labor diverted to churches) | Theology | 20 turns |
| **Mali** | Mansa Musa | **Hajj to Mecca** | Gain 500 gold and +2 faith per turn for 10 turns | All cities lose 1 population and produce -30% production for 10 turns (massive spending) | Theology | 30 turns |
| **Ghana Empire** | Tunka Manin | **Gold of Wagadu** | Instantly gain 300 gold | Lose 100 science and produce -10% science for 10 turns (trade secrets sold) | Currency | 20 turns |
| **Songhai** | Askia | **Timbuktu Scholarship** | Instantly gain 100 science and +25% science for 5 turns | All cities produce -30% gold for 5 turns (endowment spending) | Education | 25 turns |
| **Great Zimbabwe** | Nyatsimba | **Cattle Drive** | All pasture tiles produce +2 gold and +1 food for 10 turns | All cities lose 1 amenity for 10 turns (herders away from home) | Currency | 20 turns |
| **Kanem-Bornu** | Idris Alooma | **Trans-Saharan Caravan** | Gain 250 gold and +1 trade route capacity for 10 turns | Land military units lose -1 movement for 10 turns (caravan guard duties) | Trade Routes | 25 turns |

### Historical notes

- **Monumental Building Spree** — Hatshepsut built extensively, including her mortuary temple at Deir el-Bahari and obelisks at Karnak.
- **City of the Dead Rush** — The Kushite queen Amanirenas fought Roman expansion and built Nubian pyramids at Meroë.
- **Alpine Crossing** — Hannibal led his army, including war elephants, over the Alps to attack Rome during the Second Punic War.
- **Red Sea Trade Mission** — Ezana of Aksum controlled lucrative Red Sea commerce and adopted Christianity, linking Aksum to Byzantine networks.
- **Rock-Hewn Pilgrimage** — King Lalibela commissioned the famous rock-hewn churches of Lalibela as a "New Jerusalem."
- **Hajj to Mecca** — Mansa Musa's 1324 pilgrimage to Mecca was so lavish that it reportedly depressed the gold price in Egypt for years.
- **Gold of Wagadu** — Ghana's rulers controlled the trans-Saharan gold trade, making Wagadu fabulously wealthy.
- **Timbuktu Scholarship** — Askia the Great of Songhai promoted Timbuktu as a center of Islamic learning and scholarship.
- **Cattle Drive** — Great Zimbabwe's wealth rested partly on cattle herding and long-distance trade in gold and ivory.
- **Trans-Saharan Caravan** — Idris Alooma of Kanem-Bornu expanded trans-Saharan trade and made pilgrimages to Mecca.

---

## Mediterranean & Europe (Part 1)

| Civ | Leader | Ability | Benefit | Cost / Drawback | Unlock | Cooldown |
|-----|--------|---------|---------|-----------------|--------|----------|
| **Minoans** | Minos | **Thalassocratic Fleet** | Spawn 2 Biremes and all naval units gain +1 movement for 10 turns | Capital loses 2 population (sailors levied) | Sailing | 20 turns |
| **Mycenaean Greece** | Agamemnon | **Heroic Muster** | Spawn 2 Mycenaean Spearmen and all melee units gain +2 strength for 10 turns | Consumes 4 citizens (mass levy) | Bronze Working | 20 turns |
| **Greece** | Pericles | **Delian League Tribute** | Gain 200 gold and +2 culture per turn for 10 turns | Lose 1 envoy with every city-state (subject resentment) | Political Philosophy | 25 turns |
| **Sparta** | Leonidas | **Agoge Mobilization** | All melee units gain +25% XP and +2 strength for 10 turns | All cities lose 1 population (warrior-society training) | Iron Working | 25 turns |
| **Macedon** | Alexander | **Hellenistic Campaign** | All units gain +1 movement and +3 combat strength for 10 turns | Cities produce -20% gold and -20% science for 10 turns (army drains treasury) | Military Strategy | 25 turns |
| **Etruscans** | Lars Porsena | **Twelve Cities Congress** | Gain +1 trade route and 50 gold | All cities produce -10% production for 5 turns (political negotiations) | Currency | 20 turns |
| **Rome** | Trajan | **Citizen Levy** | Spawn 3 Legionaries near the capital | Consumes 6 citizens (citizen-soldiers leave fields and workshops) | Iron Working | 15 turns |
| **Celts / Gauls** | Vercingetorix | **Druidic Uprising** | Forest tiles in your territory give +2 faith and units in forest gain +3 strength for 10 turns | Cities produce -20% science for 10 turns (oral tradition over literacy) | Mysticism | 20 turns |
| **Byzantium** | Justinian | **Corpus Juris Civilis** | Instantly finish the current civic and all cities gain +1 amenity for 10 turns | Cities produce -15% production for 5 turns (legal reform disruption) | Political Philosophy | 25 turns |
| **Norse** | Harald Hardrada | **Viking Raid** | Naval melee units gain +50% coastal pillage gold and +2 movement for 10 turns | All cities lose 2 amenities for 10 turns (warriors away raiding) | Sailing | 20 turns |
| **Franks** | Charlemagne | **Carolingian Renaissance** | All cities gain +25% culture and +1 faith for 10 turns | All cities produce -20% gold for 10 turns (monastic spending) | Theology | 25 turns |

### Historical notes

- **Thalassocratic Fleet** — The Minoans of Crete were a maritime civilization whose palaces, such as Knossos, dominated Aegean trade.
- **Heroic Muster** — Agamemnon, king of Mycenae, led the Greek forces in the Trojan War according to Homer.
- **Delian League Tribute** — Pericles used Delian League funds to build the Parthenon and project Athenian power over allied states.
- **Agoge Mobilization** — Spartan boys underwent the *agoge*, a rigorous military training regime that produced elite hoplites.
- **Hellenistic Campaign** — Alexander the Great conquered from Greece to India, spreading Hellenistic culture across his empire.
- **Twelve Cities Congress** — The Etruscan League, traditionally of twelve cities, was a confederation of Etruscan city-states.
- **Citizen Levy** — Roman legions were citizen-soldiers who served in exchange for land and political rights.
- **Druidic Uprising** — Vercingetorix united Gallic tribes against Julius Caesar; druids were central to Gallic religion and resistance.
- **Corpus Juris Civilis** — Justinian I codified Roman law in the *Corpus Juris Civilis*, which shaped European legal systems for centuries.
- **Viking Raid** — Harald Hardrada was a Norse king and famed raider who led seaborne expeditions across Europe.
- **Carolingian Renaissance** — Charlemagne sponsored a revival of learning, art, and administration across his Frankish empire.


## Mediterranean & Europe (Part 2)

| Civ | Leader | Ability | Benefit | Cost / Drawback | Unlock | Cooldown |
|-----|--------|---------|---------|-----------------|--------|----------|
| **Ostrogoths** | Theodoric | **Foederati Recruitment** | Spawn 2 Gothic Cavalry and gain 1 population in the capital | Lose 150 gold (mercenary payment) | Feudalism | 20 turns |
| **England** | Alfred | **Fyrd Levy** | Spawn 4 Spearmen near the capital | All cities produce -20% production for 5 turns | Feudalism | 20 turns |
| **France** | Joan of Arc | **Divine Mandate** | All military units gain +3 strength and ignore war-weariness for 10 turns | Cities produce -15% culture for 10 turns (mysticism sidelines salons) | Theology | 25 turns |
| **Spain** | Isabella | **Reconquista** | Melee units gain +4 strength vs. cities following other religions for 10 turns | -5 diplomatic favor per turn for 10 turns with all civs (religious militancy) | Divine Right | 20 turns |
| **Portugal** | Henry | **Age of Exploration** | Naval units gain +2 movement and all coastal cities gain +3 gold for 10 turns | Land units lose -1 movement for 10 turns (resources diverted to fleets) | Astronomy | 25 turns |
| **Venice** | Enrico Dandolo | **Arsenale Rush** | Instantly build 3 Galleys in any coastal city | All cities produce -25% gold for 5 turns (massive shipbuilding) | Shipbuilding | 20 turns |
| **Genoa** | Andrea Doria | **Bank of San Giorgio** | Gain 400 gold | All cities produce -10% production for 10 turns (debt service) | Banking | 20 turns |
| **Netherlands** | William the Silent | **Polder Reclamation** | Gain +2 population and +3 food per turn in coastal cities for 10 turns | All cities produce -15% production for 5 turns (dyke labor) | Engineering | 25 turns |
| **Holy Roman Empire** | Barbarossa | **Imperial Diet** | All cities gain +20% production and +2 production for 10 turns | Diplomatic relations with all city-states worsen by 2 envoys | Feudalism | 25 turns |
| **Kievan Rus'** | Yaroslav | **Kievan Baptism** | Gain +100 faith and +25% culture for 10 turns | Military units lose -2 strength for 10 turns (piety over martial drill) | Theology | 20 turns |
| **Poland-Lithuania** | Jadwiga | **Golden Liberty** | All cities gain +1 amenity and +1 production for 10 turns | Cities produce -15% gold for 10 turns (noble tax exemptions) | Feudalism | 25 turns |
| **Hungary** | Matthias Corvinus | **Black Army Contract** | Spawn 2 Mercenary Cavalry with bonus XP | Pay 300 gold immediately and lose 2 population in the capital | Mercenaries | 20 turns |

### Historical notes

- **Foederati Recruitment** — Theodoric the Great ruled Italy as a Gothic king, relying on *foederati* (barbarian allies of Rome) for military power.
- **Fyrd Levy** — Alfred the Great reorganized the Anglo-Saxon *fyrd*, a militia of free men called out to defend their shires.
- **Divine Mandate** — Joan of Arc claimed divine guidance and led French forces during the Hundred Years' War.
- **Reconquista** — Isabella I completed the Christian *Reconquista* of Iberia and sponsored Columbus's transatlantic voyage.
- **Age of Exploration** — Prince Henry the Navigator sponsored Portuguese voyages down the African coast and into the Atlantic.
- **Arsenale Rush** — Venice's Arsenale shipyard could mass-produce galleys, giving the republic naval dominance.
- **Bank of San Giorgio** — The Bank of Saint George financed Genoa's fleets and managed the republic's public debt.
- **Polder Reclamation** — Dutch engineers drained wetlands (*polders*) to create farmland and expand the republic.
- **Imperial Diet** — Frederick Barbarossa asserted imperial authority over German princes through diets and military campaigns.
- **Kievan Baptism** — Yaroslav the Wise helped Christianize Kievan Rus' and issued its first legal code, the *Russkaya Pravda*.
- **Golden Liberty** — Polish-Lithuanian *Golden Liberty* gave nobles broad privileges, shaping the commonwealth's politics.
- **Black Army Contract** — Matthias Corvinus fielded the Black Army, a professional mercenary force that made Hungary a regional power.

---

## Central, South & East Asia

| Civ | Leader | Ability | Benefit | Cost / Drawback | Unlock | Cooldown |
|-----|--------|---------|---------|-----------------|--------|----------|
| **Qin China** | Qin Shi Huang | **Great Wall Mobilization** | All cities gain +50% production toward defensive buildings/walls for 10 turns | All cities lose 1 population and -1 amenity for 10 turns (corvée labor) | Masonry | 25 turns |
| **Tang China** | Taizong | **Imperial Examination** | Instantly gain +200 science and +1 science per city for 10 turns | Military units lose -2 strength for 10 turns (scholar-bureaucrats over generals) | Education | 20 turns |
| **Ming China** | Yongle | **Treasure Fleet** | Gain 2 free Junks; trade routes yield +5 gold for 10 turns | All cities produce -15% production for 5 turns (shipbuilding mobilization) | Navigation | 25 turns |
| **Maurya India** | Ashoka | **Dharma Edicts** | All cities gain +2 faith and +1 amenity for 10 turns | Military units lose -3 strength for 10 turns (turn to pacifism) | Theology | 25 turns |
| **Gupta India** | Chandragupta II | **Golden Age Patronage** | All cities gain +25% culture and +25% science for 10 turns | All cities produce -20% gold for 10 turns (court patronage) | Philosophy | 25 turns |
| **Chola** | Rajaraja | **Naval Expedition** | Spawn 2 naval melee units and all naval units gain +2 movement for 10 turns | Capital loses 2 population (sailors and marines levied) | Shipbuilding | 20 turns |
| **Japan** | Tokugawa | **Sakoku Edict** | All cities gain +25% production and +25% culture for 10 turns | All trade routes are suspended and foreign envoys are lost (isolation) | Gunpowder | 30 turns |
| **Korea** | Sejong | **Hangul Scholars** | Instantly gain +150 science and +150 culture | Cities produce -10% production for 5 turns (scholarly priorities) | Printing | 25 turns |
| **Tibet** | Songtsen Gampo | **Roof of the World Pilgrimage** | All cities gain +3 faith for 10 turns and units ignore mountain movement penalty | All cities produce -15% gold for 10 turns (pilgrimage expenses) | Theology | 20 turns |
| **Vietnam** | Le Loi | **Nine Dragons Ambush** | All land units gain +3 strength in forest/jungle and +1 movement for 10 turns | Cities produce -15% science for 10 turns (guerrilla focus) | Guerrilla Tactics | 20 turns |
| **Khmer** | Jayavarman VII | **Baray Irrigation** | All cities gain +2 food and +1 production from fresh-water tiles for 10 turns | Cities produce -10% gold for 10 turns (monumental hydraulic works) | Engineering | 25 turns |
| **Srivijaya** | Balaputra | **Maritime Mandala** | Gain 1 free Settler and +2 gold from coastal tiles for 10 turns | Capital loses 1 population (colonists sent overseas) | Astronomy | 25 turns |
| **Majapahit** | Hayam Wuruk | **Nusantara Unity** | All cities gain +1 amenity and +1 faith for 10 turns | All cities produce -10% science for 10 turns (ritual focus) | Theology | 20 turns |
| **Burma** | Anawrahta | **Pagoda Building Spree** | All cities gain +50% production toward Holy Sites and Temples for 10 turns | All cities produce -15% gold for 10 turns (lavish donations) | Theology | 25 turns |
| **Siam** | Ramkhamhaeng | **Father Governs Children** | Gain +100 culture and +1 envoy with every city-state you have met | Cities produce -10% production for 5 turns (diplomatic gifts) | Political Philosophy | 20 turns |

### Historical notes

- **Great Wall Mobilization** — Qin Shi Huang unified China and linked earlier fortifications into an early Great Wall using corvée labor.
- **Imperial Examination** — The Tang dynasty perfected the imperial examination system, selecting officials by merit rather than birth.
- **Treasure Fleet** — The Yongle Emperor sent Zheng He's massive treasure fleets across the Indian Ocean and beyond.
- **Dharma Edicts** — Ashoka Maurya issued edicts promoting Buddhism and moral governance across his vast empire.
- **Golden Age Patronage** — Gupta India saw a golden age of mathematics, literature, and art under imperial patronage.
- **Naval Expedition** — Rajaraja Chola I built a powerful navy that dominated the Bay of Bengal and Southeast Asian waters.
- **Sakoku Edict** — Tokugawa Japan closed its borders under *sakoku*, strictly limiting foreign contact for over two centuries.
- **Hangul Scholars** — Sejong the Great commissioned Hangul, the Korean alphabet, to promote literacy among commoners.
- **Roof of the World Pilgrimage** — Songtsen Gampo unified Tibet and promoted Buddhism, later associated with the Potala Palace.
- **Nine Dragons Ambush** — Le Loi led a guerrilla war against Ming Chinese occupation using Vietnam's forests and river networks.
- **Baray Irrigation** — The Khmer king Jayavarman VII built vast *baray* reservoirs to support the agriculture of Angkor.
- **Maritime Mandala** — Srivijaya dominated the maritime Silk Road through a network of port-city alliances across Southeast Asia.
- **Nusantara Unity** — Hayam Wuruk's Majapahit empire united much of the Indonesian archipelago under one rule.
- **Pagoda Building Spree** — Anawrahta of Pagan built thousands of Buddhist pagodas across the Burmese plain.
- **Father Governs Children** — Ramkhamhaeng of Sukhothai forged alliances with smaller Thai city-states and promoted Buddhism.


## Steppe & Turkic

| Civ | Leader | Ability | Benefit | Cost / Drawback | Unlock | Cooldown |
|-----|--------|---------|---------|-----------------|--------|----------|
| **Scythians** | Tomyris | **Steppe Nomad Surge** | All mounted units heal 20 HP per turn and gain +1 movement for 10 turns | Cities produce -15% culture for 10 turns (mobile lifestyle undermines cities) | Horseback Riding | 20 turns |
| **Xiongnu** | Modu Chanyu | **Raiding Confederacy** | Gain 200 gold and all mounted units gain +3 strength for 10 turns | Diplomatic favor -5 per turn for 10 turns with all neighbors (constant raids) | Animal Husbandry | 20 turns |
| **Huns** | Attila | **Scourge of God** | All land units gain +4 strength vs. cities for 10 turns | All cities lose 1 amenity and -10% food for 10 turns (terror and displacement) | Iron Working | 20 turns |
| **Göktürks** | Bumin Qaghan | **Sky Tengri Mobilization** | All mounted units gain +2 strength and +1 sight for 10 turns | Cities produce -20% science for 10 turns (shamanic priorities) | Horseback Riding | 20 turns |
| **Seljuks** | Alp Arslan | **Ghazi Jihad** | All melee units gain +3 strength for 10 turns; cities you capture gain +2 population | Diplomatic standing with all civs worsens (holy war) | Theology | 25 turns |
| **Mongolia** | Genghis Khan | **Örtöö Relay** | All mounted units gain +2 movement and supply-line attrition immunity for 10 turns | Cities produce -20% gold for 10 turns (empire-wide logistics cost) | Horseback Riding | 30 turns |
| **Timurids** | Tamerlane | **Tower of Skulls** | Melee units gain +3 strength and enemies defeated in your territory grant +50% culture/turn for 10 turns | All cities lose 2 amenities for 10 turns (fear and terror) | Military Strategy | 25 turns |
| **Ottomans** | Mehmed II | **Great Bombard** | Siege units gain +50% strength vs. city defenses and ignore walls for 1 turn | All cities produce -25% production for 5 turns (massive foundry effort) | Gunpowder | 25 turns |

### Historical notes

- **Steppe Nomad Surge** — The Scythians were horse-riding nomads of the Eurasian steppe; Tomyris famously defeated Cyrus the Great.
- **Raiding Confederacy** — Modu Chanyu unified the Xiongnu confederation and organized raids against Chinese frontiers.
- **Scourge of God** — Attila led Hunnic incursions across Europe and was called the "Scourge of God" by contemporaries.
- **Sky Tengri Mobilization** — Bumin Qaghan founded the Göktürk Khaganate and promoted Tengrism, the sky-centered steppe religion.
- **Ghazi Jihad** — Alp Arslan led Seljuk Turks to victory at Manzikert, opening Anatolia to Turkic settlement and Islamic influence.
- **Örtöö Relay** — The Mongols used the *örtöö* relay-station system for rapid communication across their vast empire.
- **Tower of Skulls** — Timur (Tamerlane) built towers of skulls from defeated enemies and conquered from Persia to Delhi.
- **Great Bombard** — Mehmed II used massive bronze cannons, including the Great Bombard, to breach the walls of Constantinople.

---

## The Americas

| Civ | Leader | Ability | Benefit | Cost / Drawback | Unlock | Cooldown |
|-----|--------|---------|---------|-----------------|--------|----------|
| **Olmec** | Council of Elders | **Colossal Head** | Gain +100 culture and the capital gains +1 amenity | All cities produce -10% production for 5 turns (monumental labor) | Masonry | 20 turns |
| **Maya** | Pacal | **Long Count Prophecy** | All cities gain +25% science and +2 faith for 10 turns | Cities produce -10% food for 10 turns (astronomer-priests diverted labor) | Astronomy | 25 turns |
| **Zapotec** | Cocijo Priesthood | **Cloud Temple Ritual** | Farm tiles produce +1 food and +1 faith for 10 turns | All cities produce -10% production for 10 turns (temple ceremonies) | Agriculture | 20 turns |
| **Teotihuacan** | Priest-Kings | **Avenue of the Dead** | Capital gains +25% production and +2 culture for 10 turns | Other cities lose 1 amenity for 10 turns (centralization) | Masonry | 25 turns |
| **Toltec** | Topiltzin | **Toltecayotl War-Bands** | Spawn 2 Eagle Warriors and all melee units gain +2 strength for 10 turns | All cities lose 1 population (warrior levies) | Bronze Working | 20 turns |
| **Aztec** | Montezuma | **Flower War** | Melee units defeat enemies heal 25 HP and gain +2 strength for 10 turns | Diplomatic standing worsens with every civ you have met | Military Tradition | 25 turns |
| **Inca** | Pachacuti | **Mit'a Labor Draft** | All cities gain +30% production toward buildings for 10 turns | All cities lose 1 population and -1 amenity for 10 turns (rotational labor draft) | Engineering | 25 turns |
| **Muisca** | Zipa | **El Dorado Offering** | Gain 250 gold and +2 faith for 10 turns | All cities produce -15% production for 5 turns (gold poured into the lake) | Currency | 20 turns |
| **Mississippians (Cahokia)** | Great Sun | **Mound Builders' Feast** | All cities gain +2 food and +1 amenity for 10 turns | All cities produce -15% production for 5 turns (feasting labor) | Agriculture | 20 turns |
| **Iroquois** | Hiawatha | **Great Law of Peace** | Gain +2 envoys with every city-state you have met and +50 culture | All cities produce -10% production for 5 turns (diplomatic councils) | Political Philosophy | 25 turns |
| **Ancestral Pueblo** | Clan Council | **Cliff Dwelling Defense** | Cities gain +50% defense strength and +1 production from hill tiles for 10 turns | All cities produce -10% food for 10 turns (defensive concentration) | Masonry | 20 turns |

### Historical notes

- **Colossal Head** — Olmec rulers commissioned colossal stone heads, possibly portraits of rulers or famous ballgame players.
- **Long Count Prophecy** — Maya rulers such as Pacal the Great used the Long Count calendar and built observatories at sites like Palenque.
- **Cloud Temple Ritual** — Zapotec worship centered on Cocijo, the rain-lightning deity, at hilltop temples such as Monte Albán.
- **Avenue of the Dead** — Teotihuacan's rulers built the Avenue of the Dead and massive pyramids in a highly planned city.
- **Toltecayotl War-Bands** — The Toltecs were revered as master warriors and craftsmen; Topiltzin was a legendary Toltec ruler-priest.
- **Flower War** — Aztec "flower wars" were ritualized conflicts meant to capture prisoners for religious sacrifice.
- **Mit'a Labor Draft** — The Inca *mit'a* system required subjects to perform rotational labor for the state on roads, terraces, and buildings.
- **El Dorado Offering** — Muisca rulers made gold offerings in Lake Guatavita, inspiring the European legend of El Dorado.
- **Mound Builders' Feast** — Cahokia's rulers organized large public feasts and mound-building projects that sustained political authority.
- **Great Law of Peace** — Hiawatha helped establish the Iroquois Confederacy and its Great Law of Peace among the Five Nations.
- **Cliff Dwelling Defense** — Ancestral Pueblo peoples built cliff dwellings for defense and survival in the American Southwest.

---

## Oceania

| Civ | Leader | Ability | Benefit | Cost / Drawback | Unlock | Cooldown |
|-----|--------|---------|---------|-----------------|--------|----------|
| **Rapa Nui** | Hotu Matua | **Wayfinding Expedition** | Naval units gain +2 movement and all island cities gain +2 food for 10 turns | Land units lose -1 movement for 10 turns (naval focus) | Sailing | 20 turns |
| **Māori** | Kupe | **Haka War Challenge** | All melee units gain +3 strength for 10 turns | Cities produce -10% culture for 10 turns (constant war footing) | Bronze Working | 20 turns |
| **Hawaii** | Kamehameha | **Aloha ʻĀina Unification** | All cities gain +1 amenity and +25% production for 10 turns | Diplomatic relations with all other civs cool by 10 favor | Political Philosophy | 25 turns |

### Historical notes

- **Wayfinding Expedition** — Polynesian navigators used stars, waves, and birds to settle remote Pacific islands such as Rapa Nui.
- **Haka War Challenge** — Māori *haka* are ceremonial challenges and war dances; Kupe is the legendary Polynesian discoverer of Aotearoa.
- **Aloha ʻĀina Unification** — Kamehameha I unified the Hawaiian Islands through a combination of diplomacy, alliances, and warfare.

---

## Implementation notes

- Store `leaderAbilityId`, `leaderAbilityUnlockedTechOrCivic`, `leaderAbilityLastUsedTurn`, and `leaderAbilityCooldown` in `PlayerState`.
- Use the existing `addUnit`, `modifyPlayerYields`, `addEnvoy`, `applyTimedModifier` primitives in `commands.ts`.
- Temporary effects should be modeled as `PlayerModifier` or `CityModifier` entries with `expiresOnTurn`.
- Population costs are applied via `removePopulation(cityId, amount)` and must validate the city has enough population.
- The UI should display the cooldown as a radial fill or disabled button with `N turns remaining`.
- AI players should be allowed to use leader abilities; add a simple utility check in the heuristic AI when the ability is off cooldown and the benefit outweighs the cost.

---

## Open questions

1. Should some abilities scale with era (e.g., later unlocking grants stronger units/yields)?
2. Should leader abilities consume **faith** as an additional cost for religious-themed abilities?
3. Should diplomatic penalties from abilities decay or remain permanent?
4. Should we expose a "historical context" tooltip in the UI that reads directly from the **Historical notes** section above?
