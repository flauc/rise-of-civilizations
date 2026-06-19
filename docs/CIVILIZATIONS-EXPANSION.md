# Civilizations Expansion — proposed new civs (pre-1500)

> **Status: DESIGN PROPOSAL (2026-06-19) — NOT IMPLEMENTED.** This doc adds historically notable
> civilizations *not yet in the roster* (the gaps catalogued in
> [CIVILIZATIONS.md → Historical civilizations not yet added](CIVILIZATIONS.md#historical-civilizations-not-yet-added-up-to-the-age-of-exploration)),
> each with a **Civ Ability**, **Unique Unit**, **Unique Infrastructure**, **start Bias**, and an
> active **Leader Ability**. It follows the existing schema so an entry can become a `CivDef` in
> `@roc/data` + a `LeaderAbilityDef` in `leader-abilities.ts`.
>
> **Design rules followed:** (1) every Unique Unit **replaces a real base unit** that exists in
> `content.ts`; (2) Civ Abilities map onto fields the engine actually reads (`yieldPercent`,
> `unitClassCombat`, movement/trade/tile bonuses, `newCityFreeBuilding`, `goldPerWorkedDesert`,
> `captureCityPopulationBonus`, etc.) — the prose adds flavor, the bracketed hint is the wireable
> part; (3) Leader Abilities are **double-edged** and compose existing primitives (spawn unit, timed
> modifier, gold/faith/science/culture, population cost) with a tech/civic unlock + cooldown.
> Era range stays **Ancient → Age of Exploration** (no post-1500 gunpowder dominance). Mughals &
> Vijayanagara straddle 1500 and are included with a note.

---

## 1. Near East & Arabia

**Historical basis:** the Arab Caliphate is the single largest omission of the period; the
incense-road kingdoms (Nabataea, Saba), the Bronze-Age chariot powers (Mitanni), the highland
kingdom of Urartu, and the Israelite monarchy round out the cradle.

### Identity

| Civ | Leader | Civ Ability | Unique Unit (replaces) | Unique Infrastructure | Bias |
|-----|--------|-------------|------------------------|------------------------|------|
| **Arabia (Caliphate)** | Harun al-Rashid | *Faith of the Prophet* — international trade routes give faith **and** science; conquered cities lose unrest fast [tradeRouteFaithBonus + yieldPercent.science] | **Camel Archer** (Horse Archer) — no desert movement penalty, +str vs cavalry | **House of Wisdom** (Academy) — +science, +faith | Desert / Coast |
| **Israelites (Judah)** | Solomon | *Kingdom of David* — capital wonder/temple production up; faith from trade [wonderProductionBonus + tradeRouteFaithBonus] | **Gibborim** (Swordsman) — elite, +str defending home territory | **First Temple** (Temple) — +faith, +culture | Hills |
| **Nabataeans** | Aretas IV | *Incense Road* — +gold per worked desert tile; desert cities gain food (cisterns) [goldPerWorkedDesert + desertCityYield.food] | **Desert Raider** (Rider) — ignores rough terrain, raid gold | **Cistern** (Aqueduct) — food in desert cities | Desert |
| **Saba (Sheba)** | Bilqis | *Frankincense Kingdom* — luxury & gold from desert; dam irrigation food [yieldPercent.gold + freshWaterTileFoodBonus] | **Sabaean Spearman** (Spearman) — +str in hills/desert | **Marib Dam** (Granary) — big food on rivers | Desert / Hills |
| **Mitanni** | Tushratta | *Maryannu* — chariots cheaper & stronger; horse breeding [unitClassCombat.cavalry] | **Maryannu Chariot** (War Chariot) — heavy chariot, +str | **Kikkuli Stables** (Stable) — +production, cavalry heal | Plains |
| **Urartu** | Sarduri II | *Kingdom of Van* — mining production; defensive bonus in hills/mountains [mineTileProductionBonus + defensiveBuildingProductionBonus] | **Urartian Charioteer** (War Chariot) — strong in hills | **Fortress of Van** (Walls) — +HP, +defense | Hills / Mountains |

### Leader abilities

| Civ | Leader Ability | Benefit | Cost / Drawback | Unlock | CD |
|-----|----------------|---------|-----------------|--------|----|
| Arabia | **Translation Movement** | +200 science instantly; +25% science 10 turns | −20% gold 10 turns (scholar patronage) | philosophy | 25 |
| Israelites | **Wisdom of Solomon** | Finish current civic; +100 culture | −15% production 5 turns (corvée for the Temple) | writing | 25 |
| Nabataeans | **Hidden Cisterns** | Desert cities +3 food & +2 production 10 turns | −15% gold 10 turns (waterworks upkeep) | masonry | 20 |
| Saba | **Queen's Caravan** | +400 gold and +2 faith/turn 10 turns | −2 population in the capital (caravan levy) | coinage | 25 |
| Mitanni | **Hurrian Charioteers** | Spawn 2 War Chariots near capital | 3 Horses + 2 population | chariotry | 20 |
| Urartu | **Citadel of Van** | All cities +50% defensive-building production; units +3 str in hills 10 turns | −15% gold 10 turns (garrison cost) | masonry | 25 |

---

## 2. Persia & Central Asia

**Historical basis:** the Hellenistic "thousand cities" of Bactria, the Sogdian merchant princes who
ran the Silk Road, and the short-lived but vast Khwarazmian Empire.

### Identity

| Civ | Leader | Civ Ability | Unique Unit (replaces) | Unique Infrastructure | Bias |
|-----|--------|-------------|------------------------|------------------------|------|
| **Greco-Bactria** | Demetrius I | *Thousand Cities* — +science & culture in cities; Hellenistic fusion [yieldPercent.science+culture] | **Bactrian Cataphract** (Cataphract) — +str, +movement | **Gymnasion** (Academy) — +science, +culture | Hills |
| **Sogdia** | Divashtich | *Lords of the Silk Road* — +trade route gold & capacity [tradeRouteGoldBonus + tradeRouteCapacityBonus] | **Sogdian Cavalry** (Rider) — +str escorting, raid gold | **Caravanserai** (Market) — gold from routes | Desert / Plains |
| **Khwarazm** | Ala ad-Din Muhammad II | *Shahs of Khwarazm* — gold from trade; cheap cavalry but high upkeep (fragile) [yieldPercent.gold + militaryMaintenanceCostMultiplier] | **Khwarazmian Lancer** (Cataphract) — strong charge | **Gurganj Bazaar** (Market) — +gold, +culture | Desert / River |

### Leader abilities

| Civ | Leader Ability | Benefit | Cost / Drawback | Unlock | CD |
|-----|----------------|---------|-----------------|--------|----|
| Greco-Bactria | **Indo-Greek Expansion** | All units +3 str & +1 movement 10 turns; +1 free building in next city | −20% science 10 turns | cavalry_doctrine | 25 |
| Sogdia | **Silk Road Caravan** | +250 gold; +1 trade route capacity 10 turns | −1 land movement 10 turns (caravan guard duty) | trade_routes | 25 |
| Khwarazm | **Mobilize the Shah's Host** | Spawn 3 Cataphracts near capital | 300 gold and 2 population | cavalry_doctrine | 20 |

---

## 3. North Africa & the Islamic Mediterranean

**Historical basis:** Numidia's saddle-less light horse, the Fatimid foundation of Cairo & al-Azhar,
Saladin's Ayyubids, the Mamluk slave-soldier state that stopped the Mongols, and the Almoravid
desert-veiled jihad.

### Identity

| Civ | Leader | Civ Ability | Unique Unit (replaces) | Unique Infrastructure | Bias |
|-----|--------|-------------|------------------------|------------------------|------|
| **Numidia** | Masinissa | *Masaesyli Horse* — light cavalry +movement, heal on open ground, low upkeep [cavalryMovementBonus + mountedHealPerTurn] | **Numidian Cavalry** (Horse Archer) — fast hit-and-run, no rough penalty | **Royal Horse Market** (Stable) — cheaper cavalry | Plains / Desert |
| **Fatimid Caliphate** | al-Mu'izz | *Isma'ili Caliphate* — +science & faith; gold from Mediterranean trade [yieldPercent.science+faith] | **Fatimid Ghulam** (Cataphract) — elite slave cavalry | **Al-Azhar** (Academy) — +science & +faith | Coast / River |
| **Ayyubids** | Saladin | *Sultan of Egypt & Syria* — combat bonus vs other religions; heal in home territory [unitClassCombat + unitHealPerTurn] | **Ayyubid Faris** (Cataphract) — strong vs other faiths | **Citadel of Cairo** (Walls) — +HP, +defense | Hills / Desert |
| **Mamluk Sultanate** | Baybars | *Slave Soldiers* — elite cavalry bought with gold; cavalry +combat [unitClassCombat.cavalry] | **Mamluk** (Cataphract) — horse-archer/lancer hybrid | **Maydan** (Barracks) — cavalry XP & heal | Desert / Plains |
| **Almoravids** | Yusuf ibn Tashfin | *Veiled Sultanate* — trans-Saharan gold; faith fuels melee [goldPerWorkedDesert + unitClassCombat.melee] | **Lamtuna Spearman** (Spearman) — veiled, +str, anti-cavalry | **Ribat** (Walls) — faith + defense (frontier monastery) | Desert |

### Leader abilities

| Civ | Leader Ability | Benefit | Cost / Drawback | Unlock | CD |
|-----|----------------|---------|-----------------|--------|----|
| Numidia | **Numidian Skirmish** | All cavalry +1 movement & heal 20 HP/turn 10 turns | −15% culture 10 turns (nomadic society) | equestrian | 20 |
| Fatimids | **Found al-Qahira** | Capital +25% production & +2 science 10 turns; +100 faith | −20% gold 10 turns (palace city outlay) | masonry | 25 |
| Ayyubids | **Reconquest of Jerusalem** | Melee +4 vs other-religion cities; units heal in your land 10 turns | Diplomatic standing sours (holy war) | iron_bloomery | 25 |
| Mamluks | **Faris Charge** | Spawn 2 Cataphracts; cavalry +3 str 10 turns | 300 gold (buy the slave-soldiers) | cavalry_doctrine | 25 |
| Almoravids | **Murabitun Jihad** | Melee +3 str & forest/desert faith 10 turns | −20% science 10 turns (austere piety) | mysticism | 20 |

---

## 4. Sub-Saharan Africa

**Historical basis:** the Swahili Indian-Ocean trade cities, the walled bronze-casting kingdom of
Benin, and Kongo's Atlantic-facing Christian monarchy.

### Identity

| Civ | Leader | Civ Ability | Unique Unit (replaces) | Unique Infrastructure | Bias |
|-----|--------|-------------|------------------------|------------------------|------|
| **Swahili (Kilwa)** | al-Hasan ibn Sulaiman | *Monsoon Trade* — large coastal-city & international-route gold [coastalCityYield.gold + tradeRouteGoldBonus] | **Swahili Dhow** (Bireme) — trade + war, +naval movement | **Husuni Kubwa** (Harbor) — coastal palace, +gold | Coast |
| **Benin** | Oba Ewuare | *Walls of Benin* — earthworks defense + culture; bronze casting culture [defensiveBuildingProductionBonus + yieldPercent.culture] | **Ogboni Guard** (Swordsman) — +str defending | **Iya Earthworks** (Walls) — defense + culture | Forest / River |
| **Kongo** | Afonso I | *Kingdom of Kongo* — faith & culture from conversion; nkutu cloth trade gold [yieldPercent.faith+culture] | **Kongo Archer** (Archer) — +ranged str in forest | **Mbanza** (Monument) — capital culture district | Forest / River |

### Leader abilities

| Civ | Leader Ability | Benefit | Cost / Drawback | Unlock | CD |
|-----|----------------|---------|-----------------|--------|----|
| Swahili | **Monsoon Winds** | Trade routes +5 gold; naval units +2 movement 10 turns | −15% production 10 turns (merchant focus) | sailing | 25 |
| Benin | **Edo Bronze Casting** | +150 culture; all cities +50% defensive production 10 turns | −15% gold 10 turns (royal guild monopoly) | masonry | 25 |
| Kongo | **Catholic Conversion** | +100 faith; +25% culture 10 turns | −15% production 10 turns (church-building) | mysticism | 20 |

---

## 5. Mediterranean & Europe

**Historical basis:** the Bulgarian and Serbian Balkan empires, the silver-and-universities Bohemia
(with the Hussite war-wagon), the Swiss pike, the Aragonese thalassocracy and its Almogavar raiders,
Bruce's schiltrons, Gaelic gallowglass, Norman Sicily, the Visigothic kingdom, and the fur-trading
Novgorod republic.

### Identity

| Civ | Leader | Civ Ability | Unique Unit (replaces) | Unique Infrastructure | Bias |
|-----|--------|-------------|------------------------|------------------------|------|
| **Bulgaria** | Krum | *Khans of the Danube* — combat near home; capture grants population [unitClassCombat + captureCityPopulationBonus] | **Bulgar Horse Archer** (Horse Archer) — +str, hit-and-run | **Preslav Court** (Monument) — culture + faith | Plains / River |
| **Serbia** | Stefan Dušan | *Dušan's Code* — culture + amenity from law; silver mining gold [yieldPercent.culture + mineTileProductionBonus] | **Pronoia Knight** (Cataphract) — heavy noble cavalry | **Despot's Hall** (Amphitheater) — culture + amenity | Hills / Mountains |
| **Bohemia** | Charles IV | *Crown of St. Wenceslas* — silver mining gold; universities +science [mineTileProductionBonus + yieldPercent.science] | **Hussite War Wagon** (Crossbowman) — mobile wagon-fort, strong defending | **Kutná Hora Mint** (Market) — gold from mines | Hills / Forest |
| **Swiss Confederacy** | Werner Stauffacher | *Reisläufer* — pikemen elite; mercenary gold; mountain defense [unitClassCombat.melee] | **Swiss Halberdier** (Pikeman) — crushes cavalry, mercenary | **Rütli Meadow** (Barracks) — cheaper, veteran pikes | Mountains / Hills |
| **Crown of Aragon** | James I | *Mare Nostrum* — naval & coastal-trade power; Almogavar raiders [navalMovementBonus + coastalCityYield.gold] | **Almogàver** (Javelineer) — fierce raider skirmisher | **Llotja** (Harbor) — sea-trade exchange, +gold | Coast |
| **Scotland** | Robert the Bruce | *Schiltron* — anti-cavalry spears; highland combat & faith [unitClassCombat + forestTileFaithBonus] | **Highland Schiltron** (Pikeman) — +defense, anti-cavalry | **Tower House** (Walls) — defense + culture | Hills / Tundra |
| **Gaelic Ireland** | Brian Boru | *High Kingship* — monastic faith & culture; galloglass mercenaries [yieldPercent.faith+culture] | **Gallowglass** (Longswordsman) — heavy axe mercenary | **Round Tower** (Temple) — faith + culture | Grassland / Hills |
| **Normans (Sicily)** | Roger II | *Hauteville Conquest* — knights early & strong; multicultural admin gold + science [unitClassCombat.cavalry + yieldPercent.science] | **Norman Knight** (Cataphract) — devastating charge | **Palatine Chapel** (Temple) — faith + culture + science | Coast / Hills |
| **Visigoths** | Leovigild | *Kingdom of Toledo* — captured units join you; legal code culture [captureCityPopulationBonus + yieldPercent.culture] | **Visigothic Noble** (Cataphract) — heavy cavalry | **Hall of Toledo** (Monument) — culture + amenity | Plains / Hills |
| **Novgorod** | Alexander Nevsky | *Fur Republic* — gold from tundra/forest trade; veche civics [coastalTileGoldBonus-equiv + yieldPercent.gold] | **Ushkuinik** (Longship) — river raider, coastal pillage | **Veche Bell** (Monument) — culture, extra policy flavor | Tundra / Forest |

### Leader abilities

| Civ | Leader Ability | Benefit | Cost / Drawback | Unlock | CD |
|-----|----------------|---------|-----------------|--------|----|
| Bulgaria | **Nikephoros' Skull** | Melee +3 vs cities; captured cities +2 population 10 turns | −15% culture 10 turns (war footing) | iron_bloomery | 25 |
| Serbia | **Dušan's Code** | Finish current civic; all cities +1 amenity 10 turns | −15% production 5 turns (legal reform) | political_philosophy | 25 |
| Bohemia | **Golden Bull** | +150 science & +150 culture; +200 gold | −10% production 5 turns (court patronage) | philosophy | 25 |
| Swiss | **Pike Square** | Spawn 2 Pikemen; melee +4 vs cavalry 10 turns | 200 gold (mercenary contracts) | iron_bloomery | 20 |
| Aragon | **Conquest of Valencia** | Melee +4 vs cities; coastal cities +3 gold 10 turns | −15% science 10 turns (war finance) | shipbuilding | 25 |
| Scotland | **Bannockburn** | All units +25% defense & +4 vs cavalry 10 turns | −10% gold 10 turns (scorched earth) | iron_bloomery | 20 |
| Gaelic Ireland | **Battle of Clontarf** | Spawn 2 Longswordsmen; melee +2 str 10 turns | −2 population (levy the clans) | carburizing | 20 |
| Normans | **Conquest of Sicily** | Cavalry +3 str; captured cities keep buildings 10 turns | −15% culture 10 turns (foreign rule friction) | cavalry_doctrine | 25 |
| Visigoths | **Liber Iudiciorum** | Finish current civic; melee +2 str 10 turns | −15% gold 10 turns (administrative cost) | statecraft | 25 |
| Novgorod | **Battle on the Ice** | Units +25% defense on snow/tundra; +200 gold (fur tribute) | −15% production 5 turns (mobilize the levy) | iron_bloomery | 20 |

---

## 5b. European tribal peoples (Iron Age & Arctic)

**Historical basis:** the peoples Rome (and the cold) never fully tamed — Illyrian pirates of the
Adriatic, the Iberian guerrillas and Celtiberian sword-smiths, the curved-blade warriors of Thrace
and Dacia, and the Arctic Sámi reindeer-herders. Their identity is rough-terrain warfare, distinctive
blades (sica, falcata, gladius hispaniensis, rhomphaia, falx), hill-forts, and frontier survival.

### Identity

| Civ | Leader | Civ Ability | Unique Unit (replaces) | Unique Infrastructure | Bias |
|-----|--------|-------------|------------------------|------------------------|------|
| **Illyrians** | Teuta | *Adriatic Pirates* — coastal raiding gold; faster ships [coastalRaidGoldPercent + navalMovementBonus] | **Liburnian** (Bireme) — fast light raider (the ship Rome later copied) | **Gradina** (Walls) — hillfort, defense + culture | Coast / Hills |
| **Lusitani** | Viriathus | *Concursare* — units +combat & ignore penalties in forest/hills (hit-and-run) [forestTileCombatBonus + ignoreRoughTerrain] | **Falcata Warrior** (Swordsman) — curved falcata, +str attacking from rough terrain | **Castro** (Walls) — fortified roundhouse hamlet, defense + culture | Hills / Forest |
| **Arevaci** | Caros | *Spirit of Numantia* — last-stand defense in home territory; Celtiberian steel (the *gladius hispaniensis*) +melee [unitClassCombat.melee + defensiveBuildingProductionBonus] | **Celtiberian Warrior** (Swordsman) — the sword Rome itself adopted, +str | **Murallas de Numancia** (Walls) — +HP, +defense | Hills |
| **Thracians** | Sitalces | *Odrysian Host* — superior, cheap light infantry; mercenary tradition [unitClassCombat.ranged] | **Thracian Peltast** (Javelineer) — elite skirmisher, hit-and-run | **Thracian Tomb** (Amphitheater) — painted tholos tomb, culture + faith | Hills / Plains |
| **Dacians** | Decebalus | *Gold of the Carpathians* — gold & production from mines/mountains; falx anti-armor [mineTileProductionBonus + unitClassCombat.melee] | **Falxman** (Longswordsman) — two-handed falx, ignores part of target defense | **Murus Dacicus** (Walls) — distinctive Dacian wall, +HP, +defense | Hills / Mountains |
| **Sámi** | (Noaidi Council) | *People of the Eight Seasons* — yields & food from tundra/snow; units ignore snow/tundra movement cost [tundra/snow city yield + snow landMovementBonus] | **Ski Raider** (Hunter) — *skridfinn* skier, very fast over snow, ambush + sight | **Siida Camp** (Shrine) — goahti settlement, faith + food from tundra | Tundra / Snow |

### Leader abilities

| Civ | Leader Ability | Benefit | Cost / Drawback | Unlock | CD |
|-----|----------------|---------|-----------------|--------|----|
| Illyrians | **Adriatic Raid** | Naval units +50% raid gold & +2 movement 10 turns | Diplomatic standing sours (piracy); −10% production 10 turns | sailing | 20 |
| Lusitani | **Guerrilla War** | All units +3 str & ignore rough-terrain penalties 10 turns | −15% gold 10 turns (raiding, not farming) | iron_bloomery | 20 |
| Arevaci | **Siege of Numantia** | All cities +50% defensive production; units +4 defense in your territory 10 turns | −1 amenity all cities 10 turns (siege hardship) | iron_bloomery | 25 |
| Thracians | **Mercenary Levy** | Spawn 3 Javelineers; ranged +2 str 10 turns | 200 gold (mercenary pay) | bronze_alloying | 20 |
| Dacians | **Sarmizegetusa Stand** | Units +25% defense & +3 str in hills/mountains 10 turns; +150 gold (mountain gold) | −15% science 10 turns (mobilization) | carburizing | 25 |
| Sámi | **Drum of the Noaidi** | +50 faith; units +1 movement on snow/tundra & +1 sight 10 turns | −10% production 10 turns (small, dispersed bands) | mysticism | 20 |

> **Historical notes** — **Teuta**: Ardiaean queen whose Adriatic piracy provoked the Illyrian Wars;
> the *liburna* became a standard Roman warship. **Viriathus**: a Lusitanian shepherd-turned-warlord
> who beat several Roman armies via *concursare* (charge-and-withdraw). **Arevaci**: the Celtiberian
> tribe whose city **Numantia** withstood Rome for years; their steel inspired the *gladius
> hispaniensis*. **Sitalces**: Odrysian king who led a vast Thracian host; Thracian **peltasts** were
> the prized mercenary skirmishers of the Greek world (and Spartacus was a Thracian). **Decebalus**:
> last king of Dacia, whose two-handed **falx** forced Rome to add arm-guards, and whose Carpathian
> gold Trajan looted. **Sámi**: Arctic reindeer-herders of Fennoscandia; the "skridfinnar"
> (ski-runners) and the **noaidi** shaman with his ritual drum are their signature.

---

## 5c. Greek city-states

**Historical basis:** the Hellenic world was a patchwork of *poleis*, not one "Greece." Beyond Athens
(the existing **Greece/Hellas** civ), Sparta, Macedon, and Mycenae, the headline city-states are
commercial **Corinth**, the **Thebes** of the Sacred Band, the colonizing Euboean port of **Eretria**,
and Classical **Crete** of the mercenary archers.

> **Note on Knossos:** Knossos is the palace-capital of the Bronze-Age **Minoans**, who are already in
> the roster (leader Minos, *Thalassocracy*, Labyrinth Palace). To avoid a duplicate, the entry below
> is **Crete** as a *Classical/Hellenistic* polis defined by its world-renowned Cretan archers and the
> Gortyn law code — a different era and identity from the Minoan thalassocracy.

### Identity

| Civ | Leader | Civ Ability | Unique Unit (replaces) | Unique Infrastructure | Bias |
|-----|--------|-------------|------------------------|------------------------|------|
| **Corinth** | Periander | *Two Seas* — commerce hub between the Aegean and the west: +trade-route & coastal-city gold [tradeRouteGoldBonus + coastalCityYield.gold] | **Corinthian Trireme** (Trireme) — Corinth built Greece's first triremes; +str, +movement | **Diolkos** (Harbor) — paved ship-portage; +gold and your naval units get +1 movement | Coast |
| **Thebes** | Epaminondas | *Sacred Band* — elite heavy infantry; oblique-order flanking [unitClassCombat.melee] | **Sacred Band** (Hoplite) — elite paired hoplites, very high str, +str adjacent to a friendly unit | **Cadmea** (Walls) — Theban citadel, +HP + culture | Plains / Hills |
| **Eretria** | (Eretrian Assembly) | *Euboean Colonists* — cheap settlers & early colonies; alphabet/trade spreads culture & gold [newCityExtraPopulation + tradeRouteGoldBonus + yieldPercent.culture] | **Penteconter** (Galley) — 50-oared colonizing warship; +movement, embark | **Emporion** (Market) — overseas trading post, +gold from routes | Coast / Island |
| **Crete (Knossos)** ² | Nearchus | *Cretan Archers* — ranged units +range & combat (the ancient world's premier mercenary archers) [unitClassCombat.ranged + range] | **Cretan Archer** (Archer) — superior mercenary archer, +range, +ranged str | **Gortyn Code** (Amphitheater) — famed law code, culture + amenity | Hills / Coast |

² *Distinct from the **Minoans** (Bronze-Age Knossos) already in the roster — see the note above.*

### Leader abilities

| Civ | Leader Ability | Benefit | Cost / Drawback | Unlock | CD |
|-----|----------------|---------|-----------------|--------|----|
| Corinth | **Isthmian Games** | +250 gold and +2 culture/turn 10 turns | −10% production 10 turns (festival expense) | coinage | 20 |
| Thebes | **Oblique Phalanx (Leuctra)** | Spawn 2 Hoplites; melee +4 str & flanking 10 turns | −2 population (citizen levy) | phalanx | 25 |
| Eretria | **Found a Colony** | Gain a free Settler; coastal cities +2 gold 10 turns | −1 population (colonists depart) | sailing | 25 |
| Crete | **Hire the Cretan Archers** | Spawn 2 Archers; ranged +3 str & +1 range 10 turns | 200 gold (mercenary contract) | composite_bow | 20 |

> **Historical notes** — **Periander**: tyrant of Corinth, one of the Seven Sages, who built the
> *diolkos* (a paved track to drag ships across the Isthmus) and made Corinth a commercial power;
> Thucydides credits Corinth with Greece's first triremes. **Epaminondas**: the Theban general whose
> oblique phalanx shattered Spartan invincibility at **Leuctra (371 BCE)**, backed by the elite
> **Sacred Band**. **Eretria**: with Chalcis, a pioneer of Greek colonization (e.g. Pithekoussai) and
> the spread of the alphabet, fought in the Lelantine War. **Nearchus**: a Cretan, Alexander's admiral
> and explorer; Crete supplied the Greek world's best mercenary **archers** and the **Gortyn** law code.

---

## 6. South & East Asia

**Historical basis:** Harappan grid cities, Zhou's Mandate of Heaven, the Delhi Sultanate's market
reforms and elephants, Mughal synthesis (post-1500 note), Vijayanagara's temple economy, seafaring
Champa, Sri Lanka's tank irrigation, and the Khitan/Jurchen conquest dynasties.

### Identity

| Civ | Leader | Civ Ability | Unique Unit (replaces) | Unique Infrastructure | Bias |
|-----|--------|-------------|------------------------|------------------------|------|
| **Indus Valley** | (Priest-Council) | *Planned Cities* — new cities start larger with a free building; sanitation food [newCityExtraPopulation + newCityFreeBuilding] | **Harappan Spearman** (Spearman) — cheap, sturdy | **Great Bath** (Aqueduct) — amenity + faith | River |
| **Zhou China** | King Wu | *Mandate of Heaven* — culture & faith legitimacy; feudal levies [yieldPercent.culture+faith] | **Zhou Chariot** (War Chariot) — +str, +movement | **Ancestral Temple** (Temple) — faith + culture | River / Plains |
| **Delhi Sultanate** | Alauddin Khalji | *Sultanate of Hind* — price controls (gold & food); cheaper units [yieldPercent.gold + yieldPercent.food] | **Delhi War Elephant** (War Elephant) — armored, +str | **Hauz (Reservoir)** (Aqueduct) — food + amenity | River / Plains |
| **Mughal Empire** ¹ | Akbar | *Padishah* — wonders & culture; religious tolerance amenity [wonderProductionBonus + yieldPercent.culture] | **Mughal Sowar** (Cataphract) — heavy cavalry | **Red Fort** (Walls) — defense + culture | River / Plains |
| **Vijayanagara** | Krishnadevaraya | *City of Victory* — temple-bazaar gold & faith; tank-fed food [yieldPercent.gold+faith + freshWaterTileFoodBonus] | **Vijayanagara War Elephant** (War Elephant) — +str | **Temple Tank** (Granary) — food + gold | River / Hills |
| **Champa** | Jaya Indravarman IV | *Lords of the Sea* — coastal raiding gold; Cham navy [coastalRaidGoldPercent + navalMovementBonus] | **Cham Raider** (Bireme) — fast coastal raider | **My Son Tower** (Temple) — faith + culture | Coast / Jungle |
| **Sinhala (Sri Lanka)** | Parakramabahu I | *Let No Drop Waste* — food & production from fresh water; war elephants [freshWaterTileFoodBonus + freshWaterTileProductionBonus] | **Sinhala War Elephant** (War Elephant) — +str | **Wewa (Reservoir)** (Granary) — large food | River / Jungle |
| **Khitan (Liao)** | Abaoji | *Dual Administration* — cavalry **and** city yields (steppe + sown) [cavalryMovementBonus + yieldPercent.production] | **Ordo Cavalry** (Cataphract) — mobile heavy horse | **Ordo Camp** (Stable) — production + cavalry heal | Plains / Tundra |
| **Jurchen (Jin)** | Aguda | *Meng'an-Mouke* — heavy cavalry militia; conquest of cities [unitClassCombat.cavalry + meleeVsCityBonus] | **Iron Pagoda** (Cataphract) — fully armored cavalry | **Meng'an Garrison** (Barracks) — production + XP | Plains / Forest |

¹ *Mughals straddle 1500 (Babur 1526). Include if "Age of Exploration" is read as the era's start;
keep firearms restrained per the no-gunpowder-dominance rule (Akbar leans culture/tolerance, not guns).*

### Leader abilities

| Civ | Leader Ability | Benefit | Cost / Drawback | Unlock | CD |
|-----|----------------|---------|-----------------|--------|----|
| Indus Valley | **Grid Planning** | Next 2 founded cities +2 population & a free building; +2 food all cities 10 turns | −15% gold 10 turns (public works) | masonry | 25 |
| Zhou China | **Mandate of Heaven** | +150 culture; melee +4 vs cities 10 turns | −1 amenity all cities 10 turns (upheaval) | writing | 25 |
| Delhi Sultanate | **Market Reforms** | +300 gold; unit production 25% cheaper 10 turns | −15% science 10 turns (state control) | coinage | 25 |
| Mughals | **Din-i Ilahi** | All cities +1 amenity, +25% culture & +2 science 10 turns | −50 faith (syncretic creed angers clergy) | philosophy | 25 |
| Vijayanagara | **Amuktamalyada** | +25% gold & +25% faith 10 turns | −15% production 10 turns (temple festivals) | political_philosophy | 25 |
| Champa | **Sack of Angkor** | Naval units +50% raid gold & +2 movement 10 turns | −10% production 10 turns (fleet mobilization) | shipbuilding | 20 |
| Sinhala | **Polonnaruwa Tanks** | All cities +2 food & +1 production from water 10 turns | −10% gold 10 turns (hydraulic upkeep) | engineering | 25 |
| Khitan | **Ordo Levy** | Spawn 2 Cataphracts; cavalry +1 movement 10 turns | 3 Horses + 1 population | cavalry_doctrine | 20 |
| Jurchen | **Tieta Charge** | Cavalry +3 str; captured cities +2 population 10 turns | −15% gold 10 turns (war economy) | cavalry_doctrine | 25 |

---

## 7. Steppe & Turkic

**Historical basis:** the Khazar trade-toll khaganate (and its elite conversion), the Avar ring-forts
and stirrup cavalry, and the Golden Horde's tribute over the Rus.

### Identity

| Civ | Leader | Civ Ability | Unique Unit (replaces) | Unique Infrastructure | Bias |
|-----|--------|-------------|------------------------|------------------------|------|
| **Khazars** | Bulan | *Toll of the Steppe* — trade route gold; tolerant faith [tradeRouteGoldBonus + yieldPercent.faith] | **Khazar Lancer** (Cataphract) — steppe heavy horse | **Sarkel Fortress** (Walls) — defense + gold | Plains / River |
| **Avars** | Bayan I | *Ring of the Avars* — stirrup cavalry combat; tribute gold [unitClassCombat.cavalry + raidGoldPercent] | **Avar Lancer** (Cataphract) — stirrup shock cavalry | **Hring (Ring-Fort)** (Walls) — defense + stored gold | Plains |
| **Golden Horde** | Batu Khan | *Tatar Yoke* — gold from distant/conquered cities; horse archers [raidGoldPercent + cavalryMovementBonus] | **Tatar Horse Archer** (Horse Archer) — +movement, raid | **Yam Relay** (Stable) — movement + trade | Plains |

### Leader abilities

| Civ | Leader Ability | Benefit | Cost / Drawback | Unlock | CD |
|-----|----------------|---------|-----------------|--------|----|
| Khazars | **Conversion of Bulan** | +100 faith; +200 gold (trade tolls) | −10% science 10 turns | coinage | 20 |
| Avars | **Siege of 626** | Melee/cavalry +4 vs cities; +150 gold tribute 10 turns | −2 amenities all cities 10 turns (terror) | siegecraft | 25 |
| Golden Horde | **Tribute of the Rus** | +400 gold; cavalry +25% raid gold 10 turns | Diplomatic standing sours with all met civs | equestrian | 25 |

---

## 8. The Americas

**Historical basis:** the Andean sequence before the Inca (Moche huacas, Tiwanaku raised fields,
Chimú goldsmithing), the metallurgical Tarascans who held off the Aztecs, and the island Taíno.

### Identity

| Civ | Leader | Civ Ability | Unique Unit (replaces) | Unique Infrastructure | Bias |
|-----|--------|-------------|------------------------|------------------------|------|
| **Chimú** | Minchançaman | *Kingdom of Chimor* — coastal-desert irrigation food; goldsmith luxury gold [desertCityYield.food + yieldPercent.gold] | **Chimú Slinger** (Slinger) — +ranged str | **Chan Chan Citadel** (Monument) — gold + culture (adobe) | Coast / Desert |
| **Moche** | Lord of Sipán | *Huaca Builders* — adobe pyramids give faith & culture; fishing + irrigation [holySiteTempleProductionBonus + yieldPercent.faith] | **Moche Warrior** (Warrior) — +str, capture flavor | **Huaca** (Temple) — faith + culture | Coast / Desert |
| **Tiwanaku** | (Priest-Rulers) | *Raised Fields* — food at altitude (suka kollu) and on lakes; monolith faith [hillTileProductionBonus-as-food + freshWaterTileFoodBonus] | **Tiwanaku Spearman** (Spearman) — +str at altitude | **Akapana Pyramid** (Temple) — faith + culture | Hills / Lake |
| **Tarascans (Purépecha)** | Tariácuri | *Metalsmiths of Michoacán* — copper/bronze: +production & unit combat; anti-Aztec defense [yieldPercent.production + unitClassCombat] | **Copper Macehead** (Maceman) — metal weapons, +str | **Yácata** (Monument) — faith + culture | Lake / Hills |
| **Taíno** | Anacaona | *Caciquedom* — island culture & faith; cassava food; canoe trade [islandCityYield.food + yieldPercent.culture] | **Guaribo Slinger** (Javelineer) — island skirmisher | **Batey** (Amphitheater) — amenity + culture (ballcourt) | Island / Coast |

### Leader abilities

| Civ | Leader Ability | Benefit | Cost / Drawback | Unlock | CD |
|-----|----------------|---------|-----------------|--------|----|
| Chimú | **Goldsmiths of Chimor** | +250 gold; +100 culture | −15% production 5 turns (artisan focus) | masonry | 20 |
| Moche | **Sacrifice Ceremony** | +100 faith; melee +3 str 10 turns | −2 population (ritual sacrifice) | ritual_burial | 25 |
| Tiwanaku | **Raised Fields** | All highland/lake cities +3 food 10 turns | −10% production 10 turns (labor in the fields) | cultivation | 20 |
| Tarascans | **Bronze Arms** | All units +2 str; +25% production 10 turns | −10% gold 10 turns (smelting effort) | smelting | 25 |
| Taíno | **Areíto Gathering** | All cities +1 amenity & +2 culture 10 turns; +50 faith | −10% production 5 turns (festival) | political_philosophy | 20 |

---

## 9. Oceania

**Historical basis:** the maritime Tuʻi Tonga "empire" that drew tribute across the western Pacific.

### Identity

| Civ | Leader | Civ Ability | Unique Unit (replaces) | Unique Infrastructure | Bias |
|-----|--------|-------------|------------------------|------------------------|------|
| **Tonga** | Tuʻi Tonga | *Maritime Tribute* — gold & faith from coastal/island cities; long voyaging [islandCityYield.gold + navalMovementBonus] | **Tongan Toa** (Warrior) — island warrior, +str near coast | **Langi** (Temple) — royal tomb, faith + culture | Island / Coast |

### Leader ability

| Civ | Leader Ability | Benefit | Cost / Drawback | Unlock | CD |
|-----|----------------|---------|-----------------|--------|----|
| Tonga | **Voyage of Tribute** | Coastal/island cities +3 gold & +1 faith; naval +2 movement 10 turns | −1 land movement 10 turns (crews at sea) | sailing | 20 |

---

## Implementation notes

- **To wire a civ:** add a `CivDef` to `CIVILIZATIONS` in `@roc/data` (leader, `abilityName`,
  `abilityDesc`, `uniqueUnit`/`uniqueInfra` strings, flat `effects` from the bracketed hints,
  `cityNames`), and a `LeaderAbilityDef` keyed by civ id in `leader-abilities.ts` (compose
  `spawnNearCapital`, `addPlayerModifier`/`allCitiesModifier`, gold/faith/science deltas,
  `removePopulation`, `consumeResource`).
- **Unique Units** remain cosmetic until the UU system exists (see
  [CIVILIZATIONS.md audit](CIVILIZATIONS.md#implementation-status-audit)); the "(replaces X)" target
  is the base unit a real UU would substitute when that system lands. Each UU's class also implies a
  §3 active ability from [UNIT-ABILITIES.md](UNIT-ABILITIES.md).
- **Avoided unimplemented systems:** none of these leader abilities depend on envoys/city-states,
  diplomatic favor, or war-weariness (the gaps flagged in [LEADER-ABILITIES.md](LEADER-ABILITIES.md));
  "diplomatic standing sours" entries are flavor pending the attitude hook in `diplomacy.ts`.
- **City-name lists** (10 each, historically grounded) still need authoring per civ before data entry.
- This roster (**55 civs**) covers the most significant omissions; further peoples can follow the
  same template — e.g. **Picts/Caledonians, Iberians/Tartessos, Veneti, Vascones (Basques),
  Cimbri/Teutones, Suebi, Frisians, Pannonians** and more Greek *poleis* (**Syracuse, Rhodes, Miletus,
  Argos**) in Europe, and **Funan, Uyghurs, Mixtec, Sarmatians, Samoa/Fiji** elsewhere.
