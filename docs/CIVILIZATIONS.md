# Civilizations

The full playable roster (target **70+**). Each civ is a **data-driven entry** — adding/editing one is a JSON record plus optional ability hook, never an engine change. Columns:

- **Leader** — drives a unique *agenda* (AI behavior) and may grant a leader bonus.
- **Civ Ability** — the always-on identity bonus.
- **Unique Unit (UU)** — replaces a standard unit, era-appropriate (Ancient → Exploration only).
- **Unique Infrastructure (UI)** — a building or tile improvement that replaces/augments a standard one.
- **Bias** — preferred start terrain for map placement (procedural & geodata maps both honor this).

**Tier 1 (launch 10)** are marked ⭐ — chosen to showcase distinct mechanics across all continents. The rest ship incrementally per roadmap M4→M5.

> Balance numbers (combat strength, yields, costs) live in `packages/data`, not here. This doc defines *identity & intent*.

---

## Mesopotamia & the Near East

| Civ | Leader | Civ Ability | Unique Unit | Unique Infrastructure | Bias |
|-----|--------|-------------|-------------|------------------------|------|
| **Sumer** | Gilgamesh | *Epic Quest* — clearing barbarian camps / huts grants extra rewards; war-carts early | War-Cart (early chariot, no resource needed) | Ziggurat (science on rivers) | River |
| **Akkad** | Sargon | *Sons of Sargon* — captured cities keep more buildings; siege bonus near capital | Sargonic Guard (strong early melee) | Palace Archive (gold + culture) | Plains |
| **Babylon** | Hammurabi | *Enuma Anu Enlil* — each tech first-discovered triggers its eureka instantly; -science but +eureka | Bowman (ranged + melee) | Walls of Babylon (defensive wonder-building) | River |
| **Assyria** | Ashurbanipal | *Treatises & Terror* — siege/intimidation; steal tech on city capture | Siege Tower (boosts melee vs cities) | Royal Library (science from conquest) | Hills |
| **Hittites** | Suppiluliuma | *Iron of Hatti* — early iron access, ironworking discount | Hittite Chariot (heavy chariot) | Storm Temple (faith + production) | Hills |
| **Elam** | Untash | *Highland Archers* — ranged units +range/strength in hills | Susian Archer (elite ranged) | Choga Zanbil (faith wonder-building) | Hills |
| **Phoenicia** | Dido | *Mediterranean Colonies* — cheap coastal settlers; capital can move; +naval range | Bireme (early war galley) | Cothon (harbor: naval production/heal) | Coast |
| **Lydia** | Croesus | *Coinage* — invented currency; markets/banks +gold; trade route gold ++ | Heavy Cavalry (gold-bought) | Mint (gold from luxuries) | Plains |

## Persia & Iran

| Civ | Leader | Civ Ability | Unique Unit | Unique Infrastructure | Bias |
|-----|--------|-------------|-------------|------------------------|------|
| **Median Empire** | Cyaxares | *Horse Lords* — mounted units +movement | Median Lancer (heavy cavalry) | Royal Stable | Plains |
| ⭐ **Persia (Achaemenid)** | Cyrus the Great | *Satrapies* — bonus from trade routes & roads; surprise-war combat bonus, fast conquest | **Immortal** (spearman + ranged, heals fast) | Pairidaeza (garden: culture + gold) | Plains |
| **Parthia** | Mithridates | *Parthian Shot* — horse archers ignore retreat penalty, fire while moving | Parthian Cataphract / Horse Archer | Caravanserai (Silk Road trade gold) | Plains |
| **Sassanid Persia** | Khosrow | *Eranshahr* — cataphracts; +culture/science in golden ages | Savaran Cataphract (heavy cavalry) | Fire Temple (faith + science) | Plains |

## Egypt & Africa

| Civ | Leader | Civ Ability | Unique Unit | Unique Infrastructure | Bias |
|-----|--------|-------------|-------------|------------------------|------|
| ⭐ **Egypt** | Hatshepsut / Ramesses II | *Iteru* — +production toward wonders & districts on rivers; flood is beneficial | Maryannu Chariot Archer | Sphinx (culture/faith improvement) | River / Floodplain |
| **Kush / Nubia** | Amanirenas | *City of the Dead* — pyramids cheap; trade routes to/through grant production | Nubian Archer (strong ranged + bonus) | Nubian Pyramid (yield by district) | Desert / River |
| **Carthage** | Hannibal | *Phoenician Heritage* — coastal capital, naval movement; mountain-crossing army | War Elephant (Carthaginian) | Cothon + Tophet | Coast |
| **Aksum** | Ezana | *Red Sea Trade* — international trade routes give faith + gold; coastal | Aksumite Spearman | Stelae (great-work culture) | Coast / Hills |
| **Ethiopia (Zagwe)** | Lalibela | *Aksumite Legacy* — faith from mountains; +combat at higher altitude | Oromo Cavalry | Rock-Hewn Church (faith) | Hills |
| **Mali** | Mansa Musa | *Sahel Merchants* — extra gold from desert tiles & trade; cheaper purchases | Mandekalu Cavalry | Suguba (discount commercial building) | Desert |
| **Ghana Empire** | Tunka Manin | *Gold of Wagadu* — gold from mining/trade; defensive bonus at home | Soninke Warrior | Gold Market | Desert / Plains |
| **Songhai** | Askia | *River of Gold* — river trade gold; embarked units stronger | Songhai Cavalry | River Port | River |
| **Great Zimbabwe** | Nyatsimba | *Cattle & Stone* — pastures +gold; trade route capacity ↑ | Zimbabwe Spearman | Great Enclosure (gold from cattle/luxuries) | Plains / Hills |
| **Kanem-Bornu** | Idris Alooma | *Trans-Saharan* — desert trade; early firearms in Exploration era | Kanembu Guard | Sahel Caravan Post | Desert |

## Mediterranean & Europe

| Civ | Leader | Civ Ability | Unique Unit | Unique Infrastructure | Bias |
|-----|--------|-------------|-------------|------------------------|------|
| **Minoans** | Minos | *Thalassocracy* — first naval power; coastal trade + culture | Minoan Bireme | Labyrinth Palace (culture) | Coast / Island |
| **Mycenaean Greece** | Agamemnon | *Heroic Age* — heroes cheaper to recruit; melee bonus in war | Mycenaean Spearman | Megaron (palace culture) | Coast / Hills |
| ⭐ **Greece (Hellas)** | Pericles / Gorgo | *Plato's Republic* — extra Wildcard policy slot; city-state envoys give culture | **Hoplite** (phalanx: bonus in formation) | Acropolis (culture district hill) | Hills / Coast |
| **Sparta** | Leonidas | *Agoge* — military units cheaper, +XP; defensive last-stand bonus | Spartan Hoplite | Syssitia (military training) | Hills |
| **Macedon** | Alexander | *Hellenistic Fusion* — no war-weariness during golden conquests; capture gives science/culture | Hypaspist + Hetairoi (Companion Cavalry) | Basilikoi Paides (military academy) | Plains / Hills |
| **Etruscans** | Lars Porsena | *Twelve Cities* — extra trade routes; roads cheaper | Etruscan Hoplite | Tumulus (culture tomb) | Hills |
| ⭐ **Rome** | Trajan / Caesar | *All Roads Lead to Rome* — free roads link cities; new cities start with a free building | **Legionary** (can build roads/forts) | Roman Bath (housing + amenity) | Plains / River |
| **Celts / Gauls** | Vercingetorix | *Druidic Lore* — faith from forests; oppida defense | Gaesatae (fierce melee) | Oppidum (defensive culture building) | Forest / Hills |
| **Byzantium** | Justinian / Basil II | *Taxis* — units gain bonus vs civs of other religions; holy sites +military | Cataphract / Dromon (Greek Fire ship) | Hippodrome (amenity + great general pts) | Coast |
| ⭐ **Norse / Vikings** | Harald Hardrada | *Knarr* — embark cheaply, coastal raiding gold, ocean sailing early | **Longship** (raider, heals on coast) | Stave Church (faith + production) | Coast / Tundra |
| **Franks** | Charlemagne | *Carolingian Reform* — knights early; faith from cities | Frankish Paladin (knight) | Palatine Chapel (faith + culture) | Plains |
| **Goths** | Theodoric | *Foederati* — captured units join you; mobility | Gothic Rider (heavy cavalry) | Wagon Fort | Plains |
| **Anglo-Saxon / England** | Alfred / Eleanor | *Workshop of the World* — production & naval supremacy; longbow defense | **Longbowman** (long-range archer) | Manor House (housing + production) | Coast / Grassland |
| **France** | Joan of Arc / Catherine | *Grand Tour* — wonders give extra culture/tourism; chateaux | Garde Écossaise / Gendarme | Château (adjacency culture/gold) | River / Plains |
| **Castile / Spain** | Isabella | *El Escorial* — combat bonus vs other religions; treasure fleets from far cities | Conquistador (Exploration cavalry) | Mission (faith on other continents) | Plains / Coast |
| **Portugal** | Henry the Navigator | *Casa da Índia* — strong ocean trade range; +trade yields overseas | Nau (carrack trade/war ship) | Feitoria (trade post on coasts) | Coast |
| **Venice** | Enrico Dandolo | *Serenissima* — extra trade routes, merchant gold; can't build settlers (buys cities) | Venetian Galleass | Arsenale (naval production wonder-building) | Coast / Lagoon |
| **Genoa** | Andrea Doria | *Bank of San Giorgio* — banking gold; mercenaries cheaper | Crossbowman (Genoese) | Banco (gold + great merchant pts) | Coast |
| **Dutch Republic** | William the Silent | *Grachten* — rivers/polders boost yields; trade gold | Sea Beggar (privateer) | Polder (reclaim sea tiles) | Coast / River |
| **Holy Roman Empire / Germany** | Barbarossa | *Free Imperial Cities* — extra district per city; production | Landsknecht (anti-cavalry) | Hansa (production district) | Forest / Hills |
| **Kievan Rus** | Yaroslav | *Lavra* — faith from forests/tundra; territory grows fast | Druzhina (heavy cavalry) | Lavra (faith district, great-person pts) | Forest / Tundra |
| **Poland-Lithuania** | Jadwiga / Casimir | *Golden Liberty* — culture flips conquered tiles; faith→culture | Winged Hussar (shock cavalry) | Sukiennice (trade hall) | Plains |
| **Hungary** | Matthias Corvinus | *Pearl of the Danube* — city-state levies cheaper & stronger | Black Army (mercenary) | Thermal Bath (amenity + science) | Plains / River |

## Central, South & East Asia

| Civ | Leader | Civ Ability | Unique Unit | Unique Infrastructure | Bias |
|-----|--------|-------------|-------------|------------------------|------|
| ⭐ **China (Han)** | Qin Shi Huang / Wu | *Dynastic Cycle* — eurekas/inspirations give extra progress; builders get extra charges (Great Wall) | Crossbowman (Han Cho-Ko-Nu) | Great Wall (defense + gold/culture over time) | River / Plains |
| **China (Tang/Song)** | Taizong / Wu Zetian | *Middle Kingdom* — capital-adjacent cities +yields; gunpowder & printing early | Fire Lancer (early gunpowder) | Imperial Examination Hall (science) | River |
| **China (Ming)** | Yongle | *Treasure Fleets* — massive coastal cities; ocean trade & exploration | War Junk (naval) | Porcelain Tower (science wonder-building) | Coast / River |
| **Maurya India** | Ashoka | *Dharma* — faith gives amenities; war-weariness reduced when defending | **War Elephant** (Mauryan) | Stepwell (food + faith improvement) | River / Jungle |
| **Gupta India** | Chandragupta II | *Golden Age of India* — +science & culture; mathematics early | Gupta Elephant Archer | University-Temple (science + faith) | River |
| **Chola** | Rajaraja | *Maritime Empire* — naval reach across oceans; overseas conquest | Chola Warship | Brihadeeswara Temple (faith/culture) | Coast |
| **Japan** | Tokugawa / Hojo | *Bushido* — units fight at full strength when damaged; districts cluster | **Samurai** (no damage penalty) | Castle (Tenshu) (defense + culture) | Coast / Hills |
| **Korea (Goryeo/Joseon)** | Sejong | *Hwarang* — science from governors/mines; turtle ship defense | Turtle Ship (armored warship) | Seowon (science district) | Hills / Coast |
| **Tibet** | Songtsen Gampo | *Roof of the World* — mountains workable, faith from peaks; +combat at altitude | Tibetan Cavalry | Potala (faith wonder-building) | Mountains / Hills |
| **Dai Viet (Vietnam)** | Le Loi | *Nine Dragons* — forest/jungle ambush bonus; defensive | Voi Chiến (war elephant) | Thành (citadel) | Jungle / Marsh |
| **Khmer** | Jayavarman VII | *Grand Barays* — rivers give food/faith; large cities | Domrey (siege elephant) | Prasat (faith + great-work) | River / Jungle |
| **Srivijaya** | Balaputra | *Maritime Mandala* — control of sea lanes gives trade gold; coastal | Jong (naval) | Candi (coastal faith/culture) | Coast / Island |
| **Majapahit** | Hayam Wuruk | *Nusantara* — bonus per coastal city; trade across islands | Majapahit Jong | Harbor-Temple | Coast / Island |
| **Pagan (Burma)** | Anawrahta | *Land of Pagodas* — faith from building; war elephants | Burmese War Elephant | Pagoda (faith) | River / Jungle |
| **Ayutthaya (Siam)** | Ramkhamhaeng | *Father Governs Children* — city-state alliances give science/culture/faith | Siamese War Elephant | Wat (science + faith) | River / Jungle |

## Steppe & Turkic

| Civ | Leader | Civ Ability | Unique Unit | Unique Infrastructure | Bias |
|-----|--------|-------------|-------------|------------------------|------|
| **Scythians** | Tomyris | *People of the Steppe* — extra light cavalry per build; heal on kill | Scythian Horse Archer | Kurgan (faith + gold tomb) | Plains / Tundra |
| **Xiongnu** | Modu Chanyu | *Steppe Confederacy* — raiding gold; horse units cheap | Xiongnu Horse Archer | Felt Tent (mobile production) | Plains |
| **Huns** | Attila | *Scourge of God* — siege from captured cities; raze for production | Hunnic Horde (battering ram cavalry) | Ordu | Plains |
| **Göktürks** | Bumin Qaghan | *Sky Father* — cavalry +combat; fast border growth | Turkic Lancer | Stone Stele | Plains / Hills |
| **Seljuks** | Alp Arslan | *Ghazi* — combat bonus vs other religions; conquest faith | Ghulam (elite cavalry) | Madrasa (science + faith) | Plains / Hills |
| ⭐ **Mongols** | Genghis / Kublai Khan | *Örtöö* — cavalry +movement & sight; gain combat strength from spies/envoys; conquest of cities easier | **Keshig / Mangudai** (mounted ranged, hit-and-run) | Ordu (stable: cavalry production/heal) | Plains |
| **Timurids** | Tamerlane | *Sword of Islam* — siege bonus; plunder enriches cities | Timurid Siege Train | Registan (science + culture) | Plains / Desert |
| **Ottomans** | Mehmed II / Suleiman | *Great Bombard* — siege & gunpowder supremacy; conquered cities stay loyal | Janissary (gunpowder) / Great Bombard | Grand Bazaar (gold + amenities) | Plains / Coast |

## The Americas

| Civ | Leader | Civ Ability | Unique Unit | Unique Infrastructure | Bias |
|-----|--------|-------------|-------------|------------------------|------|
| **Olmec** | (Council) | *Mother Culture* — early culture & faith; colossal heads | Olmec Spearman | Colossal Head (culture monument) | Coast / Jungle |
| **Maya** | Pacal the Great | *Mayab* — cities near capital +yields; observatory science | Holkan (atlatl skirmisher) | Observatory (science from plantations) | Jungle |
| **Zapotec** | (Cocijo priesthood) | *Cloud People* — hill cities defense + culture | Zapotec Warrior | Danzante Temple (culture) | Hills |
| **Teotihuacan** | (Priest-Kings) | *City of the Gods* — wonders & pyramids cheap; culture | Pyramid Guard | Avenue of the Dead (culture district) | Plains / Hills |
| **Toltec** | Topiltzin | *Toltecayotl* — military culture; veteran units | Toltec Warrior | Atlantean Hall | Plains |
| **Aztec** | Montezuma | *Legend of the Eagle* — captured units & sacrifices boost amenities/build; war fuels economy | **Eagle Warrior** (captures defeated units) | Tlachtli (ballcourt: amenity + GG/GP pts) | Plains / Marsh |
| **Inca** | Pachacuti | *Mit'a* — work mountains, mountain-adjacent food; terrace farms feed big cities | **Warak'aq** (slinger, double attack) | Terrace Farm (food on hills, +to fresh water) | Mountains / Hills |
| **Muisca** | Zipa | *El Dorado* — faith → gold; lake/highland bonus | Guecha Warrior | Salt Temple (gold/faith) | Hills / Lake |
| **Mississippian (Cahokia)** | (Great Sun) | *Mound Builders* — earthwork improvements give culture/faith; river trade | Cahokian Warrior | Earthwork Mound (culture/faith) | River / Grassland |
| **Haudenosaunee (Iroquois)** | Hiawatha | *Great League* — forest movement & combat; longhouse production | Mohawk Warrior (forest ambush) | Longhouse (production from forests) | Forest |
| **Pueblo** | (Council) | *Cliff Dwellers* — desert/mesa defense + housing | Pueblo Skirmisher | Cliff Palace (housing + defense) | Desert / Hills |

## Oceania

| Civ | Leader | Civ Ability | Unique Unit | Unique Infrastructure | Bias |
|-----|--------|-------------|-------------|------------------------|------|
| **Polynesia** | Hotu Matua | *Wayfinding* — ocean embark & sight from the start; settle distant isles | Koa Warrior | Marae (faith + culture) | Island / Coast |
| **Māori** | Kupe | *Mana* — start at sea; unimproved forests/reefs give yields; pā defense | Toa (haka debuff) | Pā (defensive earthwork) | Island / Forest |
| **Hawaiʻi** | Kamehameha | *Aloha ʻĀina* — coastal cities + amenities; island unification | Hawaiian Koa | Heiau (faith temple) | Island / Coast |

---

## Notes for implementation

- **Schema (each civ):** `id, name, leader, agenda, civAbility{name, effectHooks[]}, uniqueUnit{replaces, era, stats?}, uniqueInfra{type:'building'|'improvement', replaces}, startBias[], region, era`.
- **Effect hooks** are named handlers in `packages/sim` (e.g. `riverWonderProduction`, `cavalryMovementBonus`) so abilities are composable and testable.
- **Uniqueness checks:** UUs/UIs must reference a valid base entry in [TECHNOLOGIES.md](TECHNOLOGIES.md) / building list, so a validator in `tools/` can lint the data.
- **Legends (heroes)** are *not* listed here — they're a cross-civ recruitable system in [GREAT-PEOPLE.md](GREAT-PEOPLE.md#legends-heroes). A civ's leader (e.g. Hannibal, Pachacuti) can *also* appear as a Legend unit in Legends mode.
- See [PLAN.md §3.12](PLAN.md) for how civs slot into the broader design.
