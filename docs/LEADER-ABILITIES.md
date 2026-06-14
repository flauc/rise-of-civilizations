# Leader Abilities

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

---

## Persia & Iran

| Civ | Leader | Ability | Benefit | Cost / Drawback | Unlock | Cooldown |
|-----|--------|---------|---------|-----------------|--------|----------|
| **Median Empire** | Cyaxares | **Horse Lords' Levy** | Spawn 2 Median Lancers near the capital | Consumes 2 population and 3 Horses resources | Horseback Riding | 20 turns |
| **Persia** | Cyrus | **Satrapal Tribute** | Gain 200 gold and +2 envoys with every city-state you have met | All cities produce -15% production for 5 turns (administrative burden) | Statecraft | 25 turns |
| **Parthia** | Mithridates | **Parthian Shot** | Mounted ranged units get +1 movement and +3 ranged strength for 10 turns | Melee units lose -2 strength for 10 turns (army favors horse archers) | Horseback Riding | 20 turns |
| **Sassanid Persia** | Khosrow | **Eranshahr Renovation** | All cities gain +1 amenity and +25% culture for 10 turns | All cities produce -20% gold for 10 turns (court extravagance) | Theology | 25 turns |

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

---

## Mediterranean & Europe

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
| **Goths** | Theodoric | **Foederati Recruitment** | Spawn 3 Gothic Riders near the capital | Cities produce -30% gold for 10 turns (mercenary pay) | Horseback Riding | 20 turns |
| **Anglo-Saxon / England** | Alfred | **Fyrd Levy** | All cities gain +2 production and spawn a Longbowman near the capital | Capital loses 1 citizen and cities produce -10% science for 10 turns | Machinery | 25 turns |
| **France** | Joan of Arc | **Divine Mandate** | All units heal +10 HP per turn and gain +2 strength for 10 turns | All cities lose 1 amenity for 10 turns (religious fervor) | Theology | 20 turns |
| **Castile / Spain** | Isabella | **Reconquista** | Units gain +5 combat strength against cities following other religions for 10 turns | Cities produce -25% gold for 10 turns (crusade cost) | Theology | 25 turns |
| **Portugal** | Henry the Navigator | **Age of Exploration** | Naval units gain +2 sight and +1 movement for 15 turns | Land units lose -1 movement for 15 turns (focus on sea) | Cartography | 30 turns |
| **Venice** | Enrico Dandolo | **Arsenale Rush** | All cities gain +50% production toward naval units for 10 turns | Non-coastal cities produce -20% production for 10 turns | Shipbuilding | 20 turns |
| **Genoa** | Andrea Doria | **Bank of San Giorgio** | Instantly gain 400 gold | All cities produce -25% production for 5 turns (capital flight) | Banking | 25 turns |
| **Dutch Republic** | William the Silent | **Polder Reclamation** | All coastal/lowland tiles gain +2 food and +1 production for 10 turns | Instantly lose 100 gold (engineering cost) | Engineering | 20 turns |
| **Holy Roman Empire / Germany** | Barbarossa | **Imperial Diet** | All cities gain +15% production and +1 amenity for 10 turns | Lose 2 envoys with every city-state (centralization angers local rulers) | Statecraft | 25 turns |
| **Kievan Rus** | Yaroslav | **Kievan Baptism** | All cities gain +2 faith and +1 amenity for 10 turns | Cities produce -15% science for 10 turns (religious focus) | Theology | 20 turns |
| **Poland-Lithuania** | Jadwiga | **Golden Liberty** | Culture output doubled for 5 turns and all cities gain +1 amenity | Cities produce -30% gold for 5 turns (noble tax exemptions) | Statecraft | 25 turns |
| **Hungary** | Matthias Corvinus | **Black Army Contract** | Spawn 2 Black Army mercenaries near the capital | Pay 5 gold per turn for 10 turns and capital loses 1 citizen | Feudalism | 20 turns |

---

## Central, South & East Asia

| Civ | Leader | Ability | Benefit | Cost / Drawback | Unlock | Cooldown |
|-----|--------|---------|---------|-----------------|--------|----------|
| **Han China** | Qin Shi Huang | **Great Wall Mobilization** | All cities gain +25% production toward defensive buildings and Wonders for 10 turns | All cities lose 1 population (corvée labor) | Masonry | 25 turns |
| **China (Tang/Song)** | Taizong | **Imperial Examination** | Instantly gain 150 science and +25% science for 5 turns | Cities produce -20% culture for 5 turns (bureaucratic focus) | Recorded History | 20 turns |
| **China (Ming)** | Yongle | **Treasure Fleet** | Gain 3 naval trade units and +3 trade route capacity for 10 turns | Lose 200 gold and capital loses 1 population | Cartography | 30 turns |
| **Maurya India** | Ashoka | **Dharma Edicts** | All cities gain +2 amenities and +1 faith for 10 turns | Cities produce -15% production for 10 turns (rock-edict labor) | Theology | 20 turns |
| **Gupta India** | Chandragupta II | **Golden Age Patronage** | +50% culture and +25% science for 5 turns | Cities produce -30% gold for 5 turns (patron spending) | Philosophy | 25 turns |
| **Chola** | Rajaraja | **Naval Expedition** | Spawn 2 Chola Warships and all naval units gain +2 movement for 10 turns | All cities lose 2 amenities for 10 turns (fleet levies) | Shipbuilding | 20 turns |
| **Japan** | Tokugawa | **Sakoku Edict** | All cities gain +20% production and +2 amenities for 10 turns | All international trade routes are suspended and produce -50% trade route gold | Feudalism | 25 turns |
| **Korea (Goryeo/Joseon)** | Sejong | **Hangul Scholars** | Instantly gain 200 science and +1 great scientist point per turn for 10 turns | Cities produce -20% culture for 10 turns (literary elite) | Education | 25 turns |
| **Tibet** | Songtsen Gampo | **Roof of the World Pilgrimage** | Mountain cities gain +3 faith and +2 food for 10 turns | Non-mountain cities produce -10% production for 10 turns | Theology | 20 turns |
| **Dai Viet (Vietnam)** | Le Loi | **Nine Dragons Ambush** | Units in forest/jungle gain +4 strength and +1 movement for 10 turns | Cities produce -10% gold for 10 turns (guerrilla supply) | Military Training | 20 turns |
| **Khmer** | Jayavarman VII | **Baray Irrigation** | All cities gain +2 food and +1 production for 10 turns | Instantly lose 100 gold (public works) | Engineering | 20 turns |
| **Srivijaya** | Balaputra | **Maritime Mandala** | Coastal cities gain +3 gold and +1 trade route capacity for 10 turns | Land military units lose -1 movement for 10 turns (naval focus) | Trade Routes | 25 turns |
| **Majapahit** | Hayam Wuruk | **Nusantara Unity** | Coastal cities gain +2 culture and +1 amenity for 10 turns | Inland cities lose 1 amenity for 10 turns (island favoritism) | Statecraft | 20 turns |
| **Pagan (Burma)** | Anawrahta | **Pagoda Building Spree** | All cities gain +50% production toward religious buildings for 10 turns | Cities produce -20% science for 10 turns (religious focus) | Theology | 20 turns |
| **Ayutthaya (Siam)** | Ramkhamhaeng | **Father Governs Children** | City-state alliances grant +50 gold each and +2 envoys | Cities produce -20% production for 5 turns (diplomatic focus) | Political Philosophy | 25 turns |

---

## Steppe & Turkic

| Civ | Leader | Ability | Benefit | Cost / Drawback | Unlock | Cooldown |
|-----|--------|---------|---------|-----------------|--------|----------|
| **Scythians** | Tomyris | **Steppe Nomad Surge** | Light cavalry units heal 10 HP on kill and gain +1 movement for 10 turns | All cities lose 1 amenity for 10 turns (warriors abroad) | Animal Husbandry | 20 turns |
| **Xiongnu** | Modu Chanyu | **Raiding Confederacy** | Mounted units gain +3 strength and +50% pillage gold for 10 turns | Cities produce -20% science for 10 turns (nomad raiding) | Horseback Riding | 20 turns |
| **Huns** | Attila | **Scourge of God** | All units gain +4 combat strength versus cities for 10 turns | All cities lose 2 amenities for 10 turns (terror tactics) | Iron Working | 20 turns |
| **Göktürks** | Bumin Qaghan | **Sky Tengri Mobilization** | All cavalry units gain +2 movement for 10 turns | Cities produce -15% gold for 10 turns (nomadic logistics) | Horseback Riding | 20 turns |
| **Seljuks** | Alp Arslan | **Ghazi Jihad** | All units gain +3 combat strength against civs of other religions for 10 turns | Cities produce -25% gold for 10 turns (holy war cost) | Theology | 25 turns |
| **Mongols** | Genghis Khan | **Örtöö Relay** | Mounted units gain +1 sight and +2 movement for 10 turns | All cities lose 1 population (levy) | Horseback Riding | 25 turns |
| **Timurids** | Tamerlane | **Tower of Skulls** | Instantly gain 200 culture and all units gain +3 strength for 10 turns | All cities lose 2 amenities for 10 turns (terror) | Military Strategy | 25 turns |
| **Ottomans** | Mehmed II | **Great Bombard** | Siege units gain +50% production and +3 ranged strength for 10 turns | Cities produce -30% gold for 10 turns (siege logistics) | Gunpowder | 25 turns |

---

## The Americas

| Civ | Leader | Ability | Benefit | Cost / Drawback | Unlock | Cooldown |
|-----|--------|---------|---------|-----------------|--------|----------|
| **Olmec** | Council | **Colossal Head** | All cities gain +50 culture and +1 faith for 10 turns | Cities produce -15% production for 10 turns (monument labor) | Mysticism | 20 turns |
| **Maya** | Pacal the Great | **Long Count Prophecy** | Instantly gain 150 science and +25% science for 5 turns | Cities produce -20% culture for 5 turns (astronomer-priests) | Mathematics | 25 turns |
| **Zapotec** | Cocijo priesthood | **Cloud Temple Ritual** | Hill cities gain +2 faith and +2 production for 10 turns | Non-hill cities lose 1 amenity for 10 turns | Mysticism | 20 turns |
| **Teotihuacan** | Priest-Kings | **Avenue of the Dead** | All cities gain +25% production toward Wonders for 10 turns | Each city starting a Wonder loses 1 population | Masonry | 25 turns |
| **Toltec** | Topiltzin | **Toltecayotl War-Bands** | Spawn 2 Toltec Warriors and all melee units gain +2 strength for 10 turns | Capital loses 2 citizens | Bronze Working | 20 turns |
| **Aztec** | Montezuma | **Flower War** | Melee units capture defeated enemies and gain +3 strength for 10 turns | Units heal 50% slower for 10 turns (blood-ritual focus) | Military Tradition | 25 turns |
| **Inca** | Pachacuti | **Mit'a Labor Draft** | All cities gain +30% production toward tile improvements for 10 turns | All cities lose 1 population (corvée labor) | Construction | 20 turns |
| **Muisca** | Zipa | **El Dorado Offering** | Instantly gain 300 gold | Lose 100 faith and all cities lose 1 amenity for 5 turns (sacred gold spent) | Currency | 20 turns |
| **Mississippian (Cahokia)** | Great Sun | **Mound Builders' Feast** | River cities gain +2 food and +1 faith for 10 turns | Cities produce -10% production for 10 turns (ceremonial labor) | Mysticism | 20 turns |
| **Haudenosaunee (Iroquois)** | Hiawatha | **Great Law of Peace** | All cities gain +1 amenity and +10% production for 10 turns | All military units lose -2 strength for 10 turns (peaceful focus) | Code of Laws | 25 turns |
| **Pueblo** | Council | **Cliff Dwelling Defense** | Desert/hill cities gain +5 city defense and +2 food for 10 turns | Units lose -1 movement for 10 turns (defensive posture) | Masonry | 20 turns |

---

## Oceania

| Civ | Leader | Ability | Benefit | Cost / Drawback | Unlock | Cooldown |
|-----|--------|---------|---------|-----------------|--------|----------|
| **Polynesia** | Hotu Matua | **Wayfinding Expedition** | Naval units gain +2 sight and Settlers may embark on ocean for 10 turns | Capital loses 1 population (expedition) | Sailing | 25 turns |
| **Māori** | Kupe | **Haka War Challenge** | Melee units gain +4 strength and adjacent enemy units take 5 damage per turn for 5 turns | All cities lose 1 amenity for 5 turns (war mobilization) | Military Tradition | 20 turns |
| **Hawaiʻi** | Kamehameha | **Aloha ʻĀina Unification** | Coastal cities gain +2 amenities and +2 culture for 10 turns | Cities produce -20% science for 10 turns (isolation) | Statecraft | 25 turns |

---

## Implementation notes

- Add a `leaderAbility` field to the `CivDef` schema in `packages/data/src/index.ts`:
  ```ts
  leaderAbility: {
    name: string;
    description: string;
    unlockTech?: TechId;
    unlockCivic?: CivicId;
    cooldown: number;
    effect: LeaderAbilityEffect;
  }
  ```
- Store `leaderAbilityLastUsedTurn` on each `Player` in `GameState`.
- The UI should show the ability button once unlocked, grayed out while on cooldown, with a tooltip showing benefit/cost.
- When implementing, prefer existing hooks: yield modifiers, unit spawning, population consumption, envoy changes, and temporary combat/movement modifiers.
- Cooldowns in this doc range from **15 to 30 turns**; unit-spawning abilities tend toward the shorter end, while economy-warping abilities tend toward the longer end.

---

## Balance notes for review

- **Population costs** are the most dramatic downside. Rome's *Citizen Levy* (3 legions for 6 citizens) is intentionally steep because legions are strong and reusable.
- **Yield surges** paired with yield penalties force the player to time ability use around build queues or wars.
- **Amenity penalties** discourage using abilities during growth phases.
- **Diplomatic/envoy costs** make abilities expensive for city-state-focused strategies.
- Several naval abilities (Phoenicia, Norse, Portugal, Chola, Venice) have trade-offs between sea power and land power or domestic happiness.

Feedback welcome — especially on cooldown lengths, population costs, and whether any ability feels one-sided rather than double-edged.
