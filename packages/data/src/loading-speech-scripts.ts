// Hand-written loading-scroll scripts, one per civilization. These replace the
// auto-derived encyclopedia transforms in loading-speech.ts: each leader speaks
// in their own voice instead of machine-shifted wiki prose.
//
// Authoring rules:
// - First person, the leader speaking to the player. Past tense is fine for the
//   leader's own legend; present tense for what the civ does in the game.
// - No em or en dashes anywhere (game copy rule), no emojis, no "&" (spell
//   "and" for TTS).
// - No starting-loadout line; the script ends on the leverage section.
// - story + ability + leverage together stay under 1000 characters
//   (MAX_HANDWRITTEN_SPEECH_CHARS) so ElevenLabs synthesizes the full clip.
// - `ability` should name the civ ability; `leverage` should name the unique
//   unit and unique building/improvement.
//
// Civs missing from this map fall back to the auto-derived script until their
// hand-written text lands here.

export interface CivLoadingScript {
  /** Who the leader is and the civ's origin hook. */
  story: string;
  /** The civ ability, named, in the leader's voice. */
  ability: string;
  /** Unique unit + unique infra and how to play them. */
  leverage: string;
}

export const CIV_LOADING_SCRIPTS: Record<string, CivLoadingScript> = {
  sumer: {
    story:
      "I am Gilgamesh of Uruk, the king who saw the deep. Between the Tigris and the Euphrates my people raise the first cities the world has ever known: Ur, Uruk, Eridu, Lagash. We cut canals through the marsh, harness the wheel and the plough, and tally grain on wet clay, and in those small pressed marks we invent writing itself. Every city that will ever stand begins here, in our mud and reed.",
    ability:
      "I crossed mountains and oceans hunting eternal life, and I came home with something better: knowledge, and walls to carve it on. That is our Epic Quest. Sumer builds quicker and learns quicker than any rival, for the temple feeds the labourer and the school shapes the scribe.",
    leverage:
      "Send my War-Carts thundering across the floodplain before the enemy raises a single wall, and set a Ziggurat in every city, so heaven itself watches over our work.",
  },
  akkad: {
    story:
      "I am Sargon of Akkad. My mother set me adrift on the river in a basket of reeds, and I rose from cup-bearer to king of kings. The quarrelling cities of Sumer now answer to one throne, mine, and my realm runs from the Lower Sea to the Upper, the first empire the world has ever seen. Kings after me will measure themselves against my name for two thousand years.",
    ability:
      "Fifty-four hundred soldiers eat bread before me every day, fed from my table, drilled in my courtyard, ready at my word. That is Sons of Sargon: the world's first standing army. My cities work harder, my spearmen strike harder, and every recruit marches out with fire already in his chest.",
    leverage:
      "Break the enemy line with the Sargonic Guard, and let the Palace Archive set every conquest in clay, so nothing we win is ever forgotten.",
  },
  babylon: {
    story:
      "I am Hammurabi of Babylon. I took a modest town on the Euphrates and raised it into the crown of Mesopotamia. I set the law in stone, two hundred and eighty-two judgments standing in the public square, so the strong might not oppress the weak and every man could know what justice costs. Cities can be conquered; law, once written, endures.",
    ability:
      "Night after night my priests climb the ziggurat and read the sky, marking every omen, every eclipse, every wandering star on tablets of clay. They call the great series Enuma Anu Enlil. To read fate they first had to predict the heavens, and so watching became mathematics, and mathematics became power. No rival matches Babylon in science.",
    leverage:
      "My Bowmen darken the field while the Walls of Babylon rise so high that no army dares the assault. Let other kings swing the sword; we count the stars, and we outlast them all.",
  },
  assyria: {
    story:
      "I am Ashurbanipal, king of the world, king of Assyria. I can read the scholar's tablet and draw the war bow, and few kings alive can claim both. At Nineveh I gathered every text worth keeping, tens of thousands of tablets, the whole memory of Mesopotamia under one roof. And when cities defied me, I made of them a lesson that neighbouring kings recite to their sons.",
    ability:
      "Treatises and Terror is how I rule. My scribes collect wisdom without rest; my heralds proclaim cruelty without shame. The story of one broken rebel spares me ten sieges, for the wise open their gates before my army crests the hill.",
    leverage:
      "Roll my Siege Towers to their walls and watch them crack like dry clay. My recruits drill fast and march out as veterans, and the Royal Library keeps everything that conquest wins.",
  },
  hittites: {
    story:
      "I am Suppiluliuma, Great King of Hatti. I found my kingdom in ashes and rebuilt it into a power that made Pharaoh himself uneasy. From the stone fortress of Hattusa my armies crossed the plateau in every direction, and when Egypt's widowed queen sought a new husband, it was to my house she wrote. The Bronze Age has two great thrones, and one of them is mine.",
    ability:
      "Let other kings hoard gold; my smiths hammer iron, the metal princes beg for and I ration like water in a drought. Iron of Hatti keeps the forges of Hattusa burning day and night, and puts hardened weapons into trained hands faster than any rival can muster.",
    leverage:
      "Three men to a chariot, driver, shield and spear, thunder across the plain. The Hittite Chariot shatters battle lines, and the Storm Temple keeps the god of tempests fighting at our side.",
  },
  elam: {
    story:
      "I am Untash-Napirisha, king of Anshan and Susa. Elam has watched Mesopotamia from the mountains for two thousand years, speaking a tongue no neighbour understands, writing in a script all our own. We raided their plains and carried home their treasures; Hammurabi's own law stone stands in Susa as our trophy.",
    ability:
      "Mine are the Highland Archers, bred in the Zagros where every boy shoots before he can plough. Rivals pay any price for Susian bowmen; mine march out already blooded, and literate Susa, old as writing itself, keeps my scholars ahead of every court.",
    leverage:
      "Loose the Susian Archer from the high ground and no line will ever reach you; feather them at range and let the mountains finish the work. And raise Chogha Zanbil, the great ziggurat I built for the gods, so they remember who honoured them first.",
  },
  phoenicia: {
    story:
      "I am Dido, queen of Tyre, who fled a murderous brother with a fleet and founded Carthage on a foreign shore. Offered only as much land as an oxhide could cover, I cut the hide into one long thread and ringed a whole hill with it. My people are the master mariners of the Mediterranean: we sail from Byblos to the Atlantic, sell cedar, glass and the purple dye kings covet, and we gave the world its alphabet.",
    ability:
      "Mediterranean Colonies is our way: not conquest, but a chain of daughter cities and trading posts on every coast, each one a knot in a single golden net. Phoenicia grows rich beyond all rivals, and every trade route pays a merchant's premium.",
    leverage:
      "Let the Phoenician Bireme sweep the sea lanes clear, and dig a Cothon in your harbours, the ringed war-port that shelters a whole fleet inside the city walls.",
  },
  lydia: {
    story:
      "I am Croesus of Lydia, and my very name means wealth. The river Pactolus washes gold through my capital Sardis, and men measure their fortunes against mine. An oracle told me a great empire would fall if I marched on Cyrus. It fell; it was my own. Learn from me: count no man happy until the end is known.",
    ability:
      "Coinage is my gift to the world. My mint struck the first true coins from electrum, the river's own alloy of gold and silver, weight and purity sworn by the royal seal, and trade itself was transformed: portable, trusted, anonymous value. Lydia gathers gold faster than any kingdom alive.",
    leverage:
      "Spend it well. Heavy Cavalry bought with Sardian gold breaks armies raised on promises, and a Mint in every city turns your markets into rivers of coin. Wealth is a weapon; I only drew it too late.",
  },
  median_empire: {
    story:
      "I am Cyaxares of Media. I gathered the quarrelling Iranian tribes into one kingdom, drilled them into ordered regiments of spearmen, bowmen and horse, and with Babylon at my side I burned Nineveh and ended Assyria forever. The empire that had terrorised the world for centuries fell to a highland people it despised. From Ecbatana my realm ran across the whole plateau, the first Iranian empire.",
    ability:
      "Horse Lords is what the Greeks called us, and rightly. Media's pastures raise the Nisaean horse, taller and swifter than any common breed, and a nobility born in the saddle. My cavalry rides farther and strikes harder, and my ordered kingdom works without rest.",
    leverage:
      "Send the Median Lancer where the enemy feels safest, and build the Royal Stable, so the herds that made us never thin.",
  },
  persia: {
    story:
      "I am Cyrus, King of Kings, founder of Persia. In a single generation I raised the largest empire the world had yet seen, from the Aegean to the Indus, and I ruled it not with terror but with tolerance: every people kept its gods, its tongue, its customs, and served me the more gladly for it.",
    ability:
      "Satrapies is my machinery of empire. Each province answers to a satrap, each satrap to my inspectors, the Eyes of the King, and tribute rolls down the Royal Road into my treasuries. Persia grows rich and learned on what a hundred nations bring, and my infantry march with imperial discipline.",
    leverage:
      "The Immortals never number fewer than ten thousand; fill each fallen man's place before the enemy sees the gap. And plant a Pairidaeza, my walled paradise garden, wherever your cities need beauty and rest.",
  },
  parthia: {
    story:
      "I am Mithridates of Parthia. My people rode off the northeastern steppe and took Persia for our own, and from Ctesiphon on the Tigris we ruled it for three centuries as the one power Rome could not break. At Carrhae our arrows devoured an entire Roman army, the host of rich Crassus himself, while its legions grasped at empty air.",
    ability:
      "They named the trick after us: the Parthian Shot. My riders feign flight, then twist in the saddle at full gallop and loose death into their pursuers. Parthian cavalry strikes harder and rides faster than any rival, and the Silk Road pays us toll on every bale of silk bound for Rome.",
    leverage:
      "Never stand still. The Parthian Horse Archer wins by refusing the battle the enemy wants, and the Caravanserai turns every desert road into a stream of gold.",
  },
  sassanid_persia: {
    story:
      "I am Khosrow, Shahanshah of Eranshahr, heir of Cyrus and Darius. For four centuries my house matched Rome and Byzantium blow for blow, and between the wars we built: at Gundeshapur my academy gathered Greek, Persian and Indian learning under one roof, physicians and philosophers side by side.",
    ability:
      "Eranshahr, the realm of the Iranians, is more than a name; it is a claim. One sacred kingship, one ancient line restored. My empire draws gold from the Gulf trade and the caravan roads, science from Gundeshapur, and my horsemen carry the weight of both.",
    leverage:
      "The Savaran Cataphract is a wall of iron at the gallop, rider and horse armoured alike; nothing on foot outlasts its charge. And keep the Fire Temple burning in every city, for the sacred flame steadies the realm as surely as the sword defends it.",
  },
  egypt: {
    story:
      "I am Hatshepsut, Pharaoh of Egypt, a woman who took the throne and wore the double crown through twenty years of peace and plenty. I sent my ships south to the land of Punt and brought home incense, ebony and living myrrh trees, and I built at Karnak as though the gods themselves had set the stones.",
    ability:
      "Iteru is our name for the Nile, and the Nile is Egypt. Each year the flood lays down fresh black silt, our priests time it by the rising of Sirius, the granaries fill, and a fed people is free to build. My cities grow faster and work harder than any on earth, for the river itself labours beside us.",
    leverage:
      "The Maryannu Chariot sweeps the field before the enemy can form a line. And raise Obelisks as I did, needles of granite that fix the sun god's favour upon your cities.",
  },
  kush_nubia: {
    story:
      "I am Amanirenas, kandake of Kush, the one-eyed queen who made war on Augustus. When Rome reached for Nubia I struck first, sacked their border towns, and buried the bronze head of their emperor beneath a temple doorstep, so every foot that entered trod upon him. Rome signed the peace.",
    ability:
      "City of the Dead names Meroe, where my ancestors, kings and ruling queens alike, sleep beneath pyramids steeper and more numerous than Egypt's. Our deserts hold gold, our smiths work iron, and the Land of the Bow sends its soldiers out already veterans.",
    leverage:
      "The Nubian Archer earned that name over three thousand years; Egypt itself hired our bowmen, and so will your enemies fear them. And build Nubian Pyramids over your honoured dead, for a dynasty sure of its past does not kneel.",
  },
  carthage: {
    story:
      "I am Hannibal of Carthage. As a boy I swore undying enmity against Rome, and I kept the oath: I led my army, elephants and all, over the Alps into Italy itself, and at Cannae I destroyed the greatest host Rome ever fielded. For fifteen years I made war in their homeland unbeaten.",
    ability:
      "Phoenician Heritage is the blood of Tyre in our veins, the seafaring and the shrewdness of the mother city grown greater than she ever was. Carthage is a merchant republic: our sea lanes pay for our wars, our trade routes run heavy with silver, and our gold buys the finest horsemen of Numidia.",
    leverage:
      "The Carthaginian War Elephant breaks formations by its mere coming; drive it at their centre. And dig a Cothon, the ringed harbour of Carthage, so your fleet is built faster than the enemy can sink it.",
  },
  aksum: {
    story:
      "I am Ezana of Aksum, king of kings. From the highlands I command the Red Sea, the hinge between Rome, Arabia and India, and through my port of Adulis pass ivory, incense and gold. I struck my own gold coinage, and I was among the first kings on earth to take the Christian faith.",
    ability:
      "Red Sea Trade is Aksum's station in the world. A Persian prophet counted us among the four great powers of the earth, and he was right to. My coastal cities grow rich on every sail that passes, and the new faith knits the kingdom together.",
    leverage:
      "The Aksumite Spearman holds the highland passes no invader has ever kept; let the mountains fight beside him. And raise the Stelae, towers of carved granite above the royal tombs, taller than anything Rome ever cut from a single stone, so the world may read our permanence.",
  },
  ethiopia_zagwe: {
    story:
      "I am Lalibela, king of the Zagwe, and I did not build my churches: I freed them. Eleven churches carved downward out of living volcanic rock, a new Jerusalem in the highlands for a people cut off from the old one. Pilgrims walk their trenches eight centuries on, and the prayers have never stopped.",
    ability:
      "Aksumite Legacy is the mantle we carry, the faith and kingship of old Aksum restored in a new line. Devotion is our engine: Ethiopia overflows with faith and culture, and that faith can be spent directly on your works, turning prayer into finished stone as my masons did at Roha.",
    leverage:
      "The Oromo Cavalry guards the mountain approaches at speed; the highlands defend those who ride them. And hew the Rock-Hewn Church wherever you settle, for what is carved from the mountain cannot be burned.",
  },
  mali: {
    story:
      "I am Mansa Musa of Mali. When I went on pilgrimage to Mecca I gave away so much gold along the road that its price in Cairo fell for a decade. Men call me the richest who ever lived. Perhaps. What I prize more is Timbuktu, where I raised mosques and gathered scholars from across the world.",
    ability:
      "Sahel Merchants is the secret of that wealth: I sit where the gold fields of the south meet the desert roads of the north, and every camel load of gold and salt that crosses my realm pays the mansa his due. Mali's gold flows deepest where the land is driest, and Timbuktu turns some of it into learning.",
    leverage:
      "The Mandekalu Cavalry keeps the caravan roads safe and the tribute moving; an empire of merchants still needs horsemen. Build the Suguba, the great open market, in every city, and let the world come to you to trade.",
  },
  ghana_empire: {
    story:
      "I am Tunka Manin, king of Wagadu, the land the Arab geographers simply call the Land of Gold. They say my horse is tethered to a nugget the size of a boulder; let them say it. What is true is this: for centuries every load of gold moving north and every slab of salt moving south has paid my toll, and my court at Koumbi Saleh wants for nothing.",
    ability:
      "Gold of Wagadu is the oldest fortune in the Sahel. Ghana wrote the book that Mali and Songhai would only copy: hold the crossing, tax the exchange, and grow rich without drawing the sword. My treasury swells, and every trade route pays a little more.",
    leverage:
      "The Soninke Warrior guards what the gold buys; a rich land unguarded is only an invitation. And raise the Gold Market in your cities, so the wealth that crosses your borders learns to stay.",
  },
  songhai: {
    story:
      "I am Askia Muhammad of Songhai, ruler of the largest empire West Africa has ever seen. From Gao I command the Niger with a navy of war canoes and the plains with my horsemen, and I made the Sankore mosque of Timbuktu a lighthouse of learning that drew scholars from Cairo and beyond.",
    ability:
      "River of Gold is the Niger itself: highway, larder and treasury in one moving water. My river fleet binds Gao, Timbuktu and Djenne into a single realm; the floodplain feeds my cities, the trade roads fill my vaults, and my cavalry answers quickly.",
    leverage:
      "The Songhai Cavalry won an empire; use it to keep one, striking along the banks where your fleet has already scouted. And build River Ports on every fresh water, so the current carries your grain, your goods and your soldiers.",
  },
  great_zimbabwe: {
    story:
      "I am Nyatsimba, lord of Great Zimbabwe. On the high plateau between the Zambezi and the Limpopo my people raised granite walls without a drop of mortar, stone fitted to stone so truly they stand to this day, the greatest works south of the Sahara. And our herds of cattle covered the hills like cloud shadow.",
    ability:
      "Cattle and Stone are the two pillars of my power. The herds are wealth you can count on the hoof, feeding and enriching every settlement, and the gold of our rivers travels down to Sofala and returns as the goods of the Indian Ocean. Pastures and trade alike pay double here.",
    leverage:
      "The Zimbabwe Spearman holds the plateau where our cattle graze; guard the herds and the herds will feed your rise. And build the Great Enclosure, walls that need no mortar because they were made to stand forever.",
  },
  kanem_bornu: {
    story:
      "I am Idris Alooma of Kanem-Bornu, mai of an empire that has ruled the lands around Lake Chad for near a thousand years. I brought muskets and Turkish gunsmiths across the desert before my neighbours had heard the sound of powder, and every traveller who survives the road speaks of my mailed horsemen.",
    ability:
      "Trans-Saharan is the long road that keeps us alive, the caravan routes running from the savanna to the sea. Every load that crosses my realm pays for the horses my empire rides, and those horses ride farther and strike harder than any in the Sudan.",
    leverage:
      "The Kanembu Guard is my answer to any army foolish enough to test us; it has held this land longer than most kingdoms have existed. And set the Sahel Caravan Post along your roads, so the desert itself works for you.",
  },
  minoans: {
    story:
      "I am Minos, king of Knossos, lord of the oldest throne in Europe. Long before Athens or Rome, my Crete raised palaces of a thousand rooms, painted with leaping dolphins and bull-dancers, and we built them without walls. Why wall a city when no enemy can cross the water you rule? Later Greeks would whisper of my labyrinth; the truth is grander: an empire of trade older than their gods.",
    ability:
      "Thalassocracy means rule of the sea, and the word was coined for us. My ships carry oil, wine and painted pottery to every shore of the Aegean, and gold and culture flow home with the tide. Every coastal city of mine grows richer simply by touching the water.",
    leverage:
      "Keep Minoan Biremes thick on the waves so no raider ever sees my shore, and raise the Labyrinth Palace at the heart of your cities; let visitors wander its thousand rooms and marvel.",
  },
  mycenaean_greece: {
    story:
      "I am Agamemnon, lord of golden Mycenae, king of men. From citadels of stone so vast that later Greeks swore giants had built them, I ruled the age Homer sang: shaft graves heaped with gold, warriors buried in bronze, and a thousand ships launched against Troy for the sake of honour and plunder. The lions carved above my gate have watched that road for three thousand years.",
    ability:
      "Heroic Age is what they call my time, and my palaces earn the name. The Linear B tablets of my scribes tally bronze, chariots and rations without rest, so my cities produce more, my spearmen strike harder, and every recruit steps from the armoury already blooded.",
    leverage:
      "Form the Mycenaean Spearmen behind their tower shields and break the enemy as we broke Troy. In every city raise the Megaron, the great hall where kings feast and wars are planned.",
  },
  greece: {
    story:
      "I am Pericles of Athens. I led the city in her golden age, when we crowned the Acropolis with the Parthenon and filled the theatre, the assembly and the agora with the boldest minds alive. We beat back Persia at Salamis, and then dared something stranger: we let free citizens rule themselves. Plague took me at the height of the war, but what Athens built in those years no army has ever taken back.",
    ability:
      "Plato's Republic is our gift, the examined life made policy. In my Greece the schools never close: philosophy, mathematics and drama pour out science and culture faster than any rival, and the citizen who debates in the morning still carries his shield at dusk.",
    leverage:
      "Stand the Greek Hoplites shoulder to shoulder in the phalanx, and crown each city with an Acropolis, so every stranger who sees it knows who taught the world to think.",
  },
  sparta: {
    story:
      "I am Leonidas, king of Sparta. At Thermopylae I stood with three hundred of my own against the whole host of Persia, and when they demanded our weapons I told them to come and take them. Sparta needs no walls and keeps no poets; our walls are our men, and our poetry is the sound of the phalanx advancing.",
    ability:
      "The Agoge takes a boy of seven and returns a soldier twenty years later. We do not train recruits; we raise veterans. My warriors muster faster than any rival's, and they march out already hard, already proud, already impossible to break.",
    leverage:
      "The Spartan Hoplite is the finest infantry the world will ever see; spend him where the line must hold. And build the Syssitia, the common mess, for men who eat together stand together, and neither hunger nor fear divides them.",
  },
  macedon: {
    story:
      "I am Alexander of Macedon. My father Philip forged the finest army of the age; I took it to the ends of the earth. Persia, Egypt, Babylon, the Indus: I crossed them all before my thirty-third year, and I never lost a battle. Aristotle taught me to think like a Greek. The world taught me to want all of it.",
    ability:
      "Hellenistic Fusion is my design: Greek and Persian made one realm. I married into Bactria, dressed as a king of kings, and enrolled the conquered into my ranks. My soldiers of every kind train faster and march out spirited and seasoned, hammer and anvil in a single hand.",
    leverage:
      "Send the Hypaspists in first, the shield-bearers who go wherever the fighting is worst, and found the Basilikoi Paides, the school of royal pages, so each generation of officers is forged before it is needed.",
  },
  etruscans: {
    story:
      "I am Lars Porsena of Clusium. Before Rome learned to build, we taught her: the arch, the drain, the temple, even the trappings of her kings came out of Etruria. Our league grew rich on iron and copper, and we painted our tombs with dancers and feasts, for a people sure of itself does not fear the afterlife.",
    ability:
      "Twelve Cities is our league, twelve proud towns meeting at one shared sanctuary, quarrelling and prospering together. Etruscan gold flows from the richest ore in Italy, our culture from the tombs and bronzes it buys, and our workshops never stand idle.",
    leverage:
      "The Etruscan Hoplite holds the line just as we carried the Greek manner of war into Italy, and the Tumulus, our great mounded tomb, turns even our dead into monuments that enrich the living.",
  },
  rome: {
    story:
      "I am Trajan, first of the emperors born in the provinces, and under me Rome reached her greatest breadth, from Britain to the Persian Gulf. I bridged the Danube, humbled Dacia, and spent its gold on forums, harbours and roads. The Senate itself named me Optimus, the best of princes.",
    ability:
      "All Roads Lead to Rome, and I laid the stones. Eighty thousand kilometres of paved highway move my legions, my couriers and my grain faster than any rival can answer. Every colony I plant is born already Roman, monument and all, and my cities muster armies side by side.",
    leverage:
      "Trust the Roman Legionary; he digs a fortified camp every night and wins by discipline what others beg from fortune. And build the Roman Bath, for clean, contented citizens carry an empire longer than fear does.",
  },
  celts_gauls: {
    story:
      "I am Vercingetorix of the Arverni. When Caesar came to make Gaul a province, I did what no man had done before: I united the tribes. I burned our own fields to starve his legions and threw him back at Gergovia. At Alesia I laid down my arms so my people might live, but the fire I lit never went out.",
    ability:
      "Druidic Lore is the strength beneath our swords. The druids keep our memory, our law and our gods in the sacred groves, and the groves repay us: my warriors fight harder among their own trees, and faith rises from every forest we hold. There is no writing in our schools, only memory, and memory does not burn.",
    leverage:
      "Loose the Gaesatae, the naked spearmen who scorn armour and death alike, upon any line that thinks itself safe, and gather your people in the Oppidum, the great hill-fort no legion takes cheaply.",
  },
  byzantium: {
    story:
      "I am Justinian, emperor of the Romans, ruling from Constantinople long after old Rome fell. I set the whole of Roman law in order in one great code, raised Hagia Sophia in five years, and sent Belisarius to win back Africa and Italy. Solomon, I said beneath that dome, I have outdone you.",
    ability:
      "Taxis means order, and order is how we govern and how we war. My officers fight by the book because I wrote the book. Learning, art, faith and gold advance in measured ranks, and my soldiers, foot and horse alike, strike with a discipline that valour alone cannot match.",
    leverage:
      "The Byzantine Cataphract, man and horse sheathed in iron, delivers the charge exactly as the manual commands. And build the Hippodrome; give the people their races and their factions, and they will forgive an emperor almost anything.",
  },
  norse: {
    story:
      "I am Harald Hardrada. At fifteen I bled at Stiklestad; then I fought for the emperor in Constantinople, leading the Varangian Guard from Sicily to the Holy Land, and came home with a shipload of gold to take the crown of Norway. They call me the last of the Vikings. Let every coast say the name softly.",
    ability:
      "Knarr is the broad cargo ship that carries our other face: trader, settler, explorer. We grew rich by sail as much as by sword. My ships run faster than any rival's, gold follows every voyage, and an undefended coast is an invitation I always accept.",
    leverage:
      "Strike from the Norse Longship where no army stands waiting, take what you wish, and be gone with the tide. Then raise the Stave Church, timber towering like a ship set on end, so even our prayers smell of the sea.",
  },
  franks: {
    story:
      "I am Charlemagne, king of the Franks. On Christmas Day in the year eight hundred, the Pope set an emperor's crown on my head in Rome, and the West had an empire again. Saxons, Lombards and Avars had already learned the weight of my host. I spent my life in the saddle uniting it, and my evenings learning my letters, for a realm of swords alone is a realm of sand.",
    ability:
      "The Carolingian Reform is my true monument: one coinage, one clear script, schools in every cathedral, and royal envoys riding to every county in my name. Faith and industry rise together, and my mailed horsemen, sustained by grants of land, ride farther and strike harder than any.",
    leverage:
      "Send the Frankish Paladins where the need is greatest and the cause is holiest, and build the Palatine Chapel as I did at Aachen, so that God and empire share one roof.",
  },
  goths: {
    story:
      "I am Theodoric, king of the Ostrogoths. I was raised a hostage in the palaces of Constantinople and learned everything Rome had to teach; then I led my whole people, wagons, herds and children, over the mountains and took Italy for my own. I ruled from Ravenna as Rome's better: a barbarian who kept the lights burning.",
    ability:
      "Foederati is what they called us, allied soldiers settled inside the empire, half guest and half conqueror. A nation on the move learns to feed itself anywhere: my riders range fast and hit hard, our fields stay full, and the cities we take keep their people, for I waste nothing I win.",
    leverage:
      "The Gothic Rider broke the legions at Adrianople; let him break your enemies in the open field. And circle the Wagon Fort wherever you halt, for a moving people carries its walls with it.",
  },
  anglo_saxon_england: {
    story:
      "I am Alfred of Wessex, the king the English would call Great. When the Danes had swallowed every other kingdom, I held out in the marshes, struck back, and won. Then I did the harder thing: I ringed my land with fortified burhs, rebuilt the schools, and turned the books my people needed into their own tongue.",
    ability:
      "Workshop of the World is the long road my shires set out upon: an orderly, industrious land that turns harvest and craft into wealth, generation upon generation. My cities produce more than any rival's, and every new town is founded behind walls already standing, as my burhs were.",
    leverage:
      "Train the Longbowman, whose arrow-storm will one day break charging knights at Agincourt, and grant the Manor House its lands, for a well-run estate feeds the scholar and the archer alike.",
  },
  france: {
    story:
      "I am Joan, a farm girl from Domremy. I was seventeen when the voices sent me to a kingdom that had stopped believing in itself. I broke the siege of Orleans, led the Dauphin through enemy country to Reims, and saw him crowned. They burned me for it, and still France rose. Faith is not a shield; it is a banner.",
    ability:
      "The Grand Tour is what my France becomes: cathedrals, chateaux and courts so radiant that all Europe comes to look and stays to learn. Gold, culture and faith rise together here, for the kingdom that fed my visions has never stopped inspiring them in others.",
    leverage:
      "Keep the Garde Écossaise close about your king, loyal blades from a faithful ally, and raise the Château in your countryside, beauty and stronghold in one, as French as the lilies.",
  },
  castile_spain: {
    story:
      "I am Isabella of Castile. I took a broken inheritance, married Ferdinand of Aragon, and made of two crowns one Spain. In the year Granada fell I ended a struggle of seven centuries, and in that same year I staked my treasure on a Genoese sailor's westward gamble. He found a new world, and it answered to me.",
    ability:
      "El Escorial is the soul of my Spain set in stone: palace, monastery and tomb in one, gold and faith fused into power. Silver fills my treasury, zeal steels my soldiers, and the cities I take I do not raze; I settle them, convert them, and keep their people as my own.",
    leverage:
      "Send the Conquistadors where the maps go blank; a handful of them can topple thrones. And plant the Mission beside every conquest, for a land is only truly won when it prays with you.",
  },
  portugal: {
    story:
      "I am Henry, prince of Portugal, and I never captained the voyages that made me the Navigator. My work was patience: at Sagres I gathered pilots, mapmakers and shipwrights, and year after year I sent captains past the capes that legend said no ship survived. They came back, and each one brought back more of the map. I died before India was reached, but every league of that sea road was charted first in my house.",
    ability:
      "The Casa da India is the counting-house of an ocean. Every spice, every cargo from Africa to the Indies passes through my crown's ledgers in Lisbon. Gold pours from my trade routes, my coastal cities thrive, and my ships sail faster than any rival's.",
    leverage:
      "Load the Nau deep and send her where the profit lies farthest, and plant the Feitoria on every foreign shore: a warehouse, a fortress and a flag, all in one building.",
  },
  venice: {
    story:
      "I am Enrico Dandolo, Doge of Venice. I took the office past eighty and blind, and I still out-saw every prince in Christendom. When the Fourth Crusade could not pay for its fleet, I set the price, and I sailed with them; at Constantinople, old as I was, I went over the wall with the banner of Saint Mark before me.",
    ability:
      "Serenissima, the Most Serene Republic, is not a boast but a method. While kings squander, Venice compounds. The trade of East and West passes through my lagoon and pays for the privilege: gold beyond any rival, and swift ships to carry it. My Venice buys before it fights, and fights only when the ledger says it must.",
    leverage:
      "The Venetian Galleass outguns anything afloat; use her to make the sea a Venetian street. And build the Arsenale, whose workers can launch a finished warship in a single day.",
  },
  genoa: {
    story:
      "I am Andrea Doria, admiral of Genoa. For forty years I sold my galleys to kings, to France, to the Emperor, to whoever paid in good coin, and then I sailed home and set my republic free without taking a crown for myself. My city's merchants reach from the Black Sea to the Atlantic, and our bankers hold half the crowned heads of Europe in debt.",
    ability:
      "The Bank of San Giorgio is our true sovereign. Founded to manage the state's debt, it grew so mighty that it governed whole colonies in the republic's name. It swells my treasury beyond any rival's, and every trade route I run pays its quiet tribute to the counting house.",
    leverage:
      "Plant my Genoese Crossbowmen behind their great shields and let any assault bleed itself white, and raise a Banco in every city, for gold, wisely lent, wins wars that fleets cannot finish.",
  },
  dutch_republic: {
    story:
      "I am William of Orange, and they call me the Silent, though I speak plainly enough: no king shall rule the conscience of my people. I led a small, waterlogged land of marsh and polder into revolt against Habsburg Spain, the mightiest empire on earth, and we did not break. Out of that stubbornness a golden age was born.",
    ability:
      "Grachten, the canals that thread our every city, are how we mastered the water instead of drowning in it. They feed us, pay us and build us: gold and food flow in, the workshops hum, our farms grow fat behind the dykes, and every trade route comes home heavier than it left.",
    leverage:
      "Let my Sea Beggars harry the enemy's coasts as they once harried Spain's, and lay Polders along your shores, for land wrestled from the sea feeds cities the sea can never starve.",
  },
  holy_roman_empire: {
    story:
      "I am Frederick, whom the Italians named Barbarossa for my red beard. Elected King of the Romans and crowned Holy Roman Emperor, six times I led my knights over the Alps to bend proud cities to the crown. They say I never died, that I only sleep beneath a mountain until the empire needs me. Perhaps they are right; here I am.",
    ability:
      "Free Imperial Cities is the secret of my patchwork realm. Nuremberg, Augsburg, Lübeck: towns that answer to no lord but the emperor grow rich and busy. Their workshops out-produce any rival, their gold fills my chest, and their wealth musters soldiers faster than any feudal levy.",
    leverage:
      "Hire Landsknechts by the regiment, pikes for whoever holds the paymaster's purse, and build the Hansa where trade gathers, so every route feeds the forges of the empire.",
  },
  kievan_rus: {
    story:
      "I am Yaroslav, whom the chronicles call the Wise, Grand Prince of Kyiv. My forefathers came down the rivers as Varangian traders, and on the road from the Varangians to the Greeks we built a realm. I raised Saint Sophia in Kyiv, set our law down in writing, and wed my daughters to the kings of France, Norway and Hungary.",
    ability:
      "Lavra is the great monastery, like the Kyiv Caves where monks pray in candlelit catacombs. Since we took the faith from Byzantium, these houses have written our chronicles and painted our icons. Faith and culture pour from them, the very forests yield devotion, and the river road pays gold on every route.",
    leverage:
      "My Druzhina, the sworn retinue at my side, breaks whatever the steppe sends against us. Build the Lavra in your cities and let the monks make our name eternal.",
  },
  poland_lithuania: {
    story:
      "I am Jadwiga, crowned not queen but King of Poland, for the crown itself was mine. I took it as a girl, and I gave my hand to Jogaila of Lithuania to join two nations and bring the last pagan land in Europe to the font. I gave my own jewels to restore the university at Kraków. I ruled with a woman's patience and a king's will.",
    ability:
      "Golden Liberty is the pride of our commonwealth: a nobility that bows to no tyrant and elects its own monarch. Free men fight harder for what is theirs. Gold and faith flow through the realm, and our cavalry ride with a strength no conscript can match.",
    leverage:
      "When the hour is darkest, send the Winged Hussars; their charge has broken armies three times their number. And build the Sukiennice, for the cloth halls of Kraków turn trade into power.",
  },
  hungary: {
    story:
      "I am Matthias Corvinus, the Raven King. The nobles chose me at fifteen, thinking a boy would be easy to lead, and I taxed their pride to build the finest court and library east of Italy. From Buda on the Danube I ruled by law and wit, and the poor still tell tales that I walked among them in disguise, listening.",
    ability:
      "Pearl of the Danube is my Buda: Renaissance splendour on Europe's frontier, paid for by taxes no baron could dodge. That treasury keeps soldiers under arms the whole year round, so my troops muster faster than any rival's and march out already drilled, and my horsemen ride the harder for it.",
    leverage:
      "The Black Army answers to my purse, not to any lord, and it fights like it. Build Thermal Baths along the Danube, and let the city rest as deeply as the army fights.",
  },
  han_china: {
    story:
      "I am Qin Shi Huang, the First Emperor. I ended five hundred years of warring states and made of them one China: one script, one law, one measure for every cart and coin. The dynasty that followed mine ruled four centuries by the pattern I set, and to this day the people call themselves Han. Emperors end; the empire does not.",
    ability:
      "Dynastic Cycle is the wheel of our history: a house rises with the Mandate of Heaven, governs, decays and is replaced, yet China endures. That endurance is strength. My workshops out-produce the world and my scholars out-think it, for the civilization that invented paper keeps its records well.",
    leverage:
      "Massed Cho-Ko-Nu repeat their bolts until no charge survives the field, and the Great Wall makes my border itself a weapon. Let the barbarians break upon it.",
  },
  china_tang_song: {
    story:
      "I am Taizong of the Tang. I won my father's throne on horseback and ruled it with the brush, keeping ministers bold enough to tell me when I erred. In my Chang'an, the greatest city on earth, poets, merchants and pilgrims of every nation crowded the wide avenues. The ages after me called my reign the model of good government.",
    ability:
      "Middle Kingdom is what we call China: the civilised centre to which the world defers. Under Tang and Song that name was earned, with gunpowder, printing, the compass and paper money. My scholars, chosen by examination and not by birth, drive science ahead of every rival, and the poets follow.",
    leverage:
      "When the enemy masses at your gate, my Fire Lancers greet them with the world's first gunpowder. Build the Imperial Examination Hall, and let talent govern instead of blood.",
  },
  china_ming: {
    story:
      "I am the Yongle Emperor of the Ming. I took the throne by force and spent my reign proving that heaven chose rightly: I raised the Forbidden City at Beijing, restored the Great Wall, and sent my admiral Zheng He across the ocean with fleets larger than any the world had seen. Let every shore learn the name of China.",
    ability:
      "Treasure Fleets carry my glory to Arabia and Africa: hundreds of ships bearing porcelain and silk outward, and tribute home. The silver of the world flows toward my markets, gold beyond any rival's, and every trade route I open returns richer than the last.",
    leverage:
      "The Ming War Junk rules whatever water it dares to sail; build fleets, not excuses. And raise the Porcelain Tower at Nanjing, so that travellers praise its shining brick in every port on earth.",
  },
  maurya: {
    story:
      "I am Ashoka, third emperor of the Maurya, ruler of nearly all of India. I conquered Kalinga and stood afterward upon a field of a hundred thousand dead, and something in me broke and was remade. I turned from the sword to the dharma, and carved my repentance on rocks and pillars across the land, so that even stone would preach mercy.",
    ability:
      "Dharma is righteous order: rule by conscience, declared aloud. I dug wells, planted shade trees, and sent physicians where I once sent armies. My people eat well and build steadily, and even my elephants, kept now for defence, strike with a trained and sober strength.",
    leverage:
      "When war must come despite me, the Mauryan War Elephant ends arguments that words cannot. And sink Stepwells in every city, for water held against the dry season is an empire held together.",
  },
  gupta_india: {
    story:
      "I am Chandragupta the Second, called Vikramaditya, Sun of Valour. Under my house northern India flowered as it never had before: nine gems adorned my court, Kalidasa wrote verses kings still weep at, and our astronomers reckoned the heavens while our mathematicians gave the world the zero. Later ages call my India golden. They are correct.",
    ability:
      "Golden Age of India is that flowering made lasting. Science leaps ahead of every rival, for my scholars counted in decimals while others still counted on their fingers, and culture follows close behind, carried in poetry, in sculpture, and in the painted caves of Ajanta.",
    leverage:
      "The Gupta Elephant Archer looses arrows from a moving tower of war; screen your borders with them. And build the University-Temple, where prayer and proof share one roof.",
  },
  chola: {
    story:
      "I am Rajaraja Chola, lord of the Tamil south. Where other Indian kings looked only inland, I looked to the sea: my fleets took Lanka and the islands, my merchant guilds traded from Arabia to China, and my son would carry our banners across the Bay of Bengal itself. At Thanjavur I raised a granite temple so vast that men still wonder how its crown was lifted.",
    ability:
      "Maritime Empire is the whole of my method. The Bay of Bengal is a Chola lake: my coastal cities grow rich upon it, every trade route returns heavy with gold, and my treasury outweighs any rival's. The king who commands the water never begs upon the land.",
    leverage:
      "Build Chola Warships until the horizon itself is yours, and raise the Brihadeeswara Temple, so the god of the tall tower watches over the wealth the sea brings home.",
  },
  japan: {
    story:
      "I am Tokugawa Ieyasu. Nobunaga hammered the rice cake, Hideyoshi kneaded it, and I, who knew how to wait, ate it. At Sekigahara I ended the age of warring provinces, and my house gave Japan two and a half centuries of peace, ruled from Edo while the emperor reigned in Kyoto. Patience is also a weapon. Mine cut deepest of all.",
    ability:
      "Bushido is the way of the warrior: honour, loyalty, and the acceptance of death before disgrace. My swordsmen strike harder than any rival's, and every recruit musters with a spirit already tempered, for the samurai arts of tea, verse and sword all sharpen the same soul.",
    leverage:
      "The Samurai is the finest blade ever fielded; do not waste him on skirmishes. Build the Tenshu Castle, and let its white keep teach every neighbour the price of ambition.",
  },
  korea: {
    story:
      "I am Sejong of Joseon. My scholars said the Chinese classics were enough; I said a farmer should be able to write his own name. So I made Hangul, letters so simple that a wise man learns them in a morning, and gave reading to the common people. I measured the rain, cast the heavens in bronze instruments, and put learning before lineage.",
    ability:
      "Hwarang is the old ideal of Silla: young warriors trained equally in ethics, arts and arms. That fusion is Korea's strength. Science leads every rival, culture ripens alongside it, and our workshops turn invention into iron and print faster than others can copy it.",
    leverage:
      "When invasion comes by sea, the Turtle Ship answers, armoured where every other hull is naked wood. Build Seowon academies in the quiet hills, and let scholarship become sovereignty.",
  },
  tibet: {
    story:
      "I am Songtsen Gampo, who gathered the clans of the high plateau into one Tibetan Empire. My horsemen rode down from the roof of the world until even Tang China treated with us, and my brides from Nepal and China carried the Buddha's teaching into my court. I gave my people a script, a law, and Lhasa itself.",
    ability:
      "Roof of the World is our fortress and our altar. The thin air that turns armies back breeds a hardy people: faith rises from the monasteries, culture rises with it, my riders fight the stronger, and my armies cross the mountains as easily as other men cross meadows.",
    leverage:
      "My Tibetan Cavalry strike where no lowland army believes a horse can go. And raise the Potala above your capital, palace and temple in one, standing closer to heaven than any rival's walls.",
  },
  dai_viet_vietnam: {
    story:
      "I am Le Loi, a farmer of Lam Son who took up a sword the lake spirit lent me. For ten years I fought the Ming occupation from the forests, feeding my soldiers on patience and the enemy on ambush, until the invaders begged for the road home. Then I rowed out onto the lake and returned the sword to the golden turtle. Its work was done.",
    ability:
      "Nine Dragons is the many-mouthed river that feeds us and shields us. My fighters strike harder wherever blades cross, and harder still among the trees of our own homeland, where every invader from the Mongols to the Ming has bled, bogged down and turned back.",
    leverage:
      "The Voi Chiến, our war elephant, crashes through lines that never heard it coming. And ring your cities with the Thành, ramparts of stone and earth that make every siege a slow defeat.",
  },
  khmer: {
    story:
      "I am Jayavarman the Seventh of the Khmer. When the Cham burned Angkor, I drove them out and rebuilt my capital greater than before, raising the stone faces of the Bayon, hospitals along the royal roads, and rest houses for pilgrims. A million people lived under my care in the greatest city of its age, fed by water we commanded.",
    ability:
      "The Grand Barays are our secret: vast reservoirs that hold the whole monsoon and pour it out through the dry season. My people never hunger and never doubt; food and faith flow together, every fresh-water field yields more, and the empire grows on rice as surely as on stone.",
    leverage:
      "Ride the Domrey into battle, the war elephant of the Angkor reliefs, that carries my warriors above every spear line, and raise a Prasat in every city, temple towers that turn devotion into stone.",
  },
  srivijaya: {
    story:
      "I am Balaputra of Srivijaya, lord of Palembang and the seas between India and China. My realm has no fixed borders, only harbours: a web of allied ports commanding the Strait of Malacca, where every ship that passes pays our toll. Even at distant Nalanda the monks study in a monastery my gifts endowed, for our wealth travels as far as our sails.",
    ability:
      "Maritime Mandala is our dominion: power that radiates from the centre across the water, held by trade and influence rather than walls. Gold pours into our treasury from the toll of the straits, every coastal city grows richer still, and the wider our web of harbours spreads, the tighter our grip on the sea becomes.",
    leverage:
      "Sail the Jong, the great ship of the southern seas, to hold the straits and carry your trade, and raise a Candi in your cities so pilgrims and merchants alike bow toward Srivijaya before sailing on.",
  },
  majapahit: {
    story:
      "I am Hayam Wuruk, king of Majapahit in eastern Java. Under my reign the realm reached its height, and my minister Gajah Mada swore his famous oath: no rest, no spice, no comfort, until all the islands bowed to Majapahit. Fleet by fleet, port by port, we bound the archipelago into one realm of trade and tribute.",
    ability:
      "Nusantara is that vow made real: the island world gathered under one crown. The spice routes feed our treasury and the rice terraces feed our people, gold and food flowing in together, and a realm fed from both sea and soil never starves and never stalls.",
    leverage:
      "Send the Majapahit Jong across the seas in great fleets, towering ships no rival hull can match, and build the Harbor-Temple where ships and gods share one shore, so every port in your realm prays and profits alike.",
  },
  pagan_burma: {
    story:
      "I am Anawrahta, first king of a united Burma. From Pagan I gathered the lands of the Irrawaddy under one throne and one faith, carrying home the scriptures of Thaton and setting Theravada in the hearts of my people. On our dry plain we raised thousands of temples, until the horizon itself was made of spires.",
    ability:
      "Land of Pagodas is that devotion in stone. Faith, culture and craft rise together in my cities, and belief itself can finish what hands began: spend faith to rush your building, and watch temples stand where scaffolding stood the day before.",
    leverage:
      "March the Burmese War Elephant at the head of your armies, as my elephants once carried the scriptures home from Thaton, and cover the plain with Pagodas, for a kingdom that builds for heaven never lacks for earth.",
  },
  ayutthaya_siam: {
    story:
      "I am Ramkhamhaeng of Siam. At my palace gate hangs a bell: any subject with a grievance may ring it, and the king himself comes out to judge, as a father judges among his children. That is how I rule, and it is why the merchants of China, India and Persia crowd our river, trading freely in a kingdom at peace with itself.",
    ability:
      "Father Governs Children makes us prosper in every way at once: learning in the temple schools, faith in the monasteries, and gold in the open markets where every nation is welcome. A contented people works, studies and prays without being driven.",
    leverage:
      "When war does come, ride the Siamese War Elephant, on whose back kings duel kings between the watching armies, and raise a Wat in every city, so wisdom and merit grow side by side through peace and war alike.",
  },
  scythians: {
    story:
      "I am Tomyris, queen of the Massagetae, mother of the Scythian steppe. Cyrus of Persia, conqueror of half the world, took my son by a trick, so I broke his army, and the legend says I gave his severed head its fill of blood. Let every empire hear it: the grass sea has a queen, and she does not forgive.",
    ability:
      "People of the Steppe is our whole way of life. We ride before we walk and shoot before we speak; my cavalry strike harder and range farther than any rival's, and the gold of the burial mounds enriches the tribes. No city binds us, so no city can be taken from us.",
    leverage:
      "Loose the Scythian Horse Archer in circling swarms that sting and fade before the enemy can answer, and raise Kurgans over your honoured dead, mounds of gold that make the steppe itself remember its princes.",
  },
  xiongnu: {
    story:
      "I am Modu, Chanyu of the Xiongnu. I trained my riders to loose their arrows wherever my whistling arrow flew, without question, and with that obedience I welded the quarrelling tribes into the first empire of the steppe. Han China married its princesses to us, paid us tribute, and built its Great Wall for fear of my horsemen.",
    ability:
      "Steppe Confederacy is that union. Our herds feed us on the move, our cavalry ride faster and strike harder than any settled army, and raiding pays best of all: the plunder of farms and cities swells our gold more than any market could.",
    leverage:
      "Send the Xiongnu Horse Archer wherever the enemy is weakest and be gone before his columns turn, and pitch the Felt Tent in your cities, for a people whose homes travel with the herds wants for nothing.",
  },
  huns: {
    story:
      "I am Attila. Rome called me the Scourge of God and paid twenty-one hundred pounds of gold a year to keep my riders from its gates, and when the gold stopped, I came and collected it myself. From the Hungarian plain my empire stretched across the peoples of the steppe, and two Roman emperors trembled at one horseman.",
    ability:
      "Scourge of God is the terror that rides ahead of my army and wins half my battles before the first arrow flies. My cavalry strike harder and move faster than anything Rome can field, gold flows to me in tribute, and every raid fills the wagons deeper.",
    leverage:
      "Unleash the Hunnic Horde and let no border rest: strike, plunder and vanish before the legions form their line. Then raise the Ordu, the great camp of the war chief, wherever your horsemen gather for the next storm.",
  },
  gokturks: {
    story:
      "I am Bumin, first Qaghan of the Turks. My people began as iron-smiths in the Altai mountains, forging blades for our overlords, until I turned those blades and made an empire that stretched from Manchuria toward the Black Sea. We were the first in history to bear the name Turk, and we carved our deeds in stone so no descendant could forget.",
    ability:
      "Sky Father is the mandate of Tengri, lord of the eternal blue sky, under whom I rule all that the sky covers. Our forges never cool, our workshops outbuild every rival, and our cavalry strike with heaven's own weight behind the lance.",
    leverage:
      "Send the Turkic Lancer crashing through their lines with the whole steppe at his back, and raise the Stone Stele in your cities, words cut in rock that harden a people's memory into power.",
  },
  seljuks: {
    story:
      "I am Alp Arslan, the Heroic Lion of the Seljuks. At Manzikert I broke the army of Byzantium and took its emperor captive with my own hands, and through that open door the ghazis poured into Anatolia and made it Turkish forever. Behind my horsemen rode my vizier Nizam al-Mulk, building an empire of schools as I built one of swords.",
    ability:
      "Ghazi is the zeal of the holy frontier. Faith and gold flow together from the mosques and endowments of Isfahan and Merv, and my cavalry fight with the fervour of warriors who believe heaven itself watches the charge.",
    leverage:
      "Charge with the Ghulam, the slave-soldier bought as a boy and drilled into the finest horseman alive, and found a Madrasa in every city to train the clerics and clerks of the realm, for the empire the sword takes, the school keeps.",
  },
  mongols: {
    story:
      "I am Temujin, whom the tribes named Genghis Khan when I united the steppe. From Korea to Hungary my empire became the largest the earth has ever carried, won not by numbers but by discipline, speed, and knowing more than my enemy knew. Cities that opened their gates prospered under my peace; cities that did not became warnings.",
    ability:
      "The Örtöö is my nervous system: relay stations a day's ride apart, fresh horses always saddled, so my word crosses a continent faster than rumour. My cavalry strike harder and range farther than any rival's, and raiding fills the treasury as we go.",
    leverage:
      "Guard your khan with the Keshig, the household riders who never leave his side and never break, and plant the Ordu wherever the horde gathers, for my capital is wherever my horses stand.",
  },
  timurids: {
    story:
      "I am Timur, whom the West calls Tamerlane. Lame in one leg, I outmarched every army of my age, toppling sultans from Delhi to Ankara, and from each conquered city I sent two caravans home to Samarkand: one of plunder, one of scholars, artists and builders. My enemies remember towers of skulls; my city remembers turquoise domes.",
    ability:
      "Sword of Islam is the conqueror's zeal that drives me on. Science and culture flourish at my court in Samarkand, my cavalry hit harder in the charge, and my raids carry home learning along with the loot, so every war leaves my empire wiser.",
    leverage:
      "Roll the Timurid Siege Train against the proudest fortress in the world and watch it kneel, then raise the Registan at the heart of your cities, where the finest minds of the age teach beneath my domes.",
  },
  ottomans: {
    story:
      "I am Mehmed, called the Conqueror. At twenty-one I stood before the triple walls of Constantinople, walls that had defied the world for a thousand years, and my great guns spoke until the walls fell. I even carried my fleet overland on greased logs into their chained harbour. Rome's last empire ended at my word; the Ottoman age began.",
    ability:
      "Great Bombard is my art of war: siege engines that shatter any wall built by man, soldiers who train faster and march out already seasoned, and gold from an empire seated astride every trade route between east and west.",
    leverage:
      "Send in the Janissaries, recruited as boys, drilled without mercy, and kept under arms the whole year round, and build the Grand Bazaar in your cities, where the wealth of three continents changes hands under one roof.",
  },
  olmec: {
    story:
      "We are the council of the Olmec, elders of San Lorenzo and La Venta on the Gulf coast. Ours are the first cities of this land, the first gods, the first calendar, the first ballgame. Three thousand years from now, peoples who never heard our true name will still pray in the patterns we set down, for everything here begins with us.",
    ability:
      "Mother Culture is that inheritance flowing forward. Our workshops build faster, our arts and rites run deeper than any newcomer's, and faith gathers around the old gods we were the first to name, the jaguar and the serpent and the rain.",
    leverage:
      "Arm the Olmec Spearman to guard the ceremonial centres, and carve the Colossal Head from basalt hauled through swamp and forest without wheel or beast of burden, faces of our rulers that will outstare time itself.",
  },
  maya: {
    story:
      "I am Pacal of Palenque, crowned at twelve years old, king for sixty-eight. I raised my city from defeat into splendour and built the Temple of the Inscriptions to carry my name across the ages. My priests count time itself: they hold the zero, the Long Count, and the paths of Venus, written in the only true script of these continents.",
    ability:
      "Mayab, our own name for our homeland, is a realm of the mind. Science, culture and faith all flourish together, and the milpa fields, maize, beans and squash grown as one, make every farm yield more and feed whole cities in the deep forest.",
    leverage:
      "Defend the forest cities with the Holkan, the spear bearer of the lowland kings, and raise the Observatory, where calendar priests read the heavens with a precision the world will not match for a thousand years.",
  },
  zapotec: {
    story:
      "We are the priests of Cocijo, lord of lightning and rain, voice of the Zapotec. Our people call themselves the Cloud People, sprung from the clouds and rocks of Oaxaca itself, and on a mountaintop we levelled with our own hands we built Monte Alban, among the first cities of this land, carved with the earliest writing it has ever known.",
    ability:
      "Cloud People is that rootedness made power. Culture, faith and learning rise together on the mountain, our carvers set names and dates in stone before any neighbour could write, and our warriors fight the harder for defending the ground their souls were born from.",
    leverage:
      "Send the Zapotec Warrior down into the valleys to carry the mountain's will, and raise the Danzante Temple, where carved stones record what becomes of those who defy the mountain.",
  },
  teotihuacan: {
    story:
      "We are the priest-kings of Teotihuacan, and we do not give our names; the city speaks for us. In the Valley of Mexico we laid out a metropolis on a sacred grid, a hundred thousand souls beneath the Pyramids of the Sun and Moon. Peoples yet unborn will find our ruins, name them the place where the gods were created, and make pilgrimage to what we built.",
    ability:
      "City of the Gods is what they will call it, and they will not be wrong. Our masons raise monuments faster than rivals raise huts, our altars smoke day and night, and the green obsidian of our mines travels to every corner of the land and returns as gold. Everything we do, we do at the scale of the gods.",
    leverage:
      "Set the Pyramid Guard on the temple steps, silent and immovable, and drive the Avenue of the Dead through the heart of every city, so all who walk it walk toward heaven.",
  },
  toltec: {
    story:
      "I am Topiltzin Quetzalcoatl, priest-king of Tula, servant of the Feathered Serpent. Where legend ends and my life begins, not even I can say, and I prefer it so. My people will be remembered as the very model of civilization; kings of later ages will forge false bloodlines just to claim descent from Tula.",
    ability:
      "Toltecayotl is our word for it: to be Toltec is to be master of every art. The sculptor's chisel, the feather-worker's loom, the spear in a trained hand, all one discipline. Our culture blooms, and our warriors strike harder than any rival's, for there is no line between the workshop and the war camp.",
    leverage:
      "March the Toltec Warrior at the front, artistry written in bronze and blood, and raise the Atlantean Hall, where stone giants stand watch, so our excellence outlives even our legends.",
  },
  aztec: {
    story:
      "I am Montezuma of the Mexica. Our god told us to wander until we saw an eagle on a cactus devouring a serpent, and on a lake island we found the omen and raised Tenochtitlan, a city on the water that shames every capital on land. My eagle and jaguar knights have bent every neighbor to its will. The world pays us tribute, or it pays in blood.",
    ability:
      "Legend of the Eagle is that founding vision, and it never leaves us. The altars are fed, the gods are kept strong, and every warrior fights knowing destiny already chose our side. The flower wars never end, and neither does our resolve. Faith flows, and our blades bite deeper.",
    leverage:
      "Send the Eagle Warriors to take captives, not corpses; each one hardens the empire. And build the Tlachtli, the ball court where the game itself is worship and the whole city roars.",
  },
  inca: {
    story:
      "I am Pachacuti, the earth-shaker. I found Cusco a village and left it the navel of the world, capital of an empire running the whole spine of the Andes. No wheel, no writing, no draft animal; only stone, rope bridges, and a people organized like nothing the mountains had ever seen. Machu Picchu is only the smallest jewel of what I raised.",
    ability:
      "Mit'a is our tax, and it is paid in sweat, not coin. Every village owes the state its turn of labor, and with it we cut roads through cliffs and fill storehouses against famine. No money changes hands in my empire, and nothing goes undone. My cities grow and build faster, and every stream feeds them.",
    leverage:
      "The Warak'aq cracks skulls with a sling stone from a distance others cannot answer. Carve Terrace Farms up the mountainsides, and slopes that starve other kings will feed my legions.",
  },
  muisca: {
    story:
      "I am the Zipa, lord of Bacata on the cold high plateau. When I took power I was covered in gold dust and rafted onto the sacred lake at Guatavita, and I gave the gold back to the water. Strangers will garble that rite into a legend and die in the jungles chasing it. Let them come; the mountains will collect the toll.",
    ability:
      "El Dorado, they will call me: the gilded man. Let them chase the myth; I keep the truth. My goldsmiths, my emeralds, and my salt make the highlands rich beyond any raider's dream, and every offering binds the gods closer to my people. The lake keeps what it is given, and it gives back favor.",
    leverage:
      "The Guecha Warrior holds the passes into my plateau, and the Salt Temple turns white rock into steady wealth. Trade what the earth gives; drown the rest in the lake, where no thief can follow.",
  },
  mississippian_cahokia: {
    story:
      "I am the Great Sun of Cahokia. From the summit of the great mound I look over a city larger than any across the eastern sea, raised basket by basket from the river bottomlands. At the plaza's edge our circle of cedar posts marks the turning of the sun, so the planting never comes late. The rivers are our roads; shell, copper, and stories flow to us from the whole continent.",
    ability:
      "Mound Builders is what we are. Ten thousand hands carrying earth, one basketload at a time, until a mountain stands where the temples and the chiefs belong. No people anywhere has piled the earth higher. The maize fields feed the work, the work feeds the city, and the city remembers.",
    leverage:
      "The Cahokian Warrior keeps the floodplain ours, and every Earthwork Mound lifts a city closer to the sun. Build where the rivers meet, and let the current bring the world to you.",
  },
  haudenosaunee: {
    story:
      "I am Hiawatha. I knew the grief that hollows a man, and out of it the Peacemaker and I built something better than vengeance: five nations bound under the Great Law of Peace, their quarrels buried beneath the white pine. I carried that law from village to village until every chief took hold of it. We govern by council and consensus, and we endure.",
    ability:
      "The Great League is our strength. Nations that once bled each other now plant, build, and sing at the same council fire, and any enemy who steps into our forests learns that peace among ourselves never meant softness toward invaders. In our own woods we are strongest, and our woods are everywhere.",
    leverage:
      "The Mohawk Warrior strikes from the treeline and vanishes back into it. Raise the Longhouse in every city: one roof, many fires, and a league no siege can break.",
  },
  pueblo: {
    story:
      "We are the council of the Pueblo peoples. No single voice rules here; we speak in turn and act as one. In the canyon country we raised the great houses of Chaco and the dwellings of Mesa Verde, read the sky for the planting, and coaxed corn from a land that gives nothing away for free. The desert did not defeat us; it taught us.",
    ability:
      "Cliff Dwellers names how we live: villages tucked into the high alcoves, reached by ladder and toehold, shaded in summer and warm in winter. The hills work for us, the kivas keep our prayers, and hardship makes us builders, not beggars. We waste nothing: not water, not stone, not daylight.",
    leverage:
      "The Pueblo Skirmisher knows every ledge and dry wash; make raiders pay for each step. And set the Cliff Palace into the canyon wall, a fortress the desert itself defends.",
  },
  polynesia: {
    story:
      "I am Hotu Matua. When trouble came to my homeland I did not cling to it; I loaded the great double-hulled canoes with my people, our seed plants, and our gods, and sailed for a speck of land my dreamer had seen across the empty ocean. We found Rapa Nui exactly where the dream had placed it. We were never lost.",
    ability:
      "Wayfinding is our science: the star paths, the shape of a swell bent by an unseen island, the flight of a bird at dusk. No chart, no compass, no fear; the knowledge lives in us. The ocean that walls other peoples in is our open road; our canoes run faster, and every shore we work pays us gold.",
    leverage:
      "The Koa Warrior guards the beaches, and the Marae binds each new island to the ancestors. Settle far and settle early; claim the coasts before your rivals learn to read the water.",
  },
  maori: {
    story:
      "I am Kupe. I chased a great octopus across the open Pacific, so the story goes, and at the end of that hunt I found the long white cloud on the horizon: Aotearoa, a land no human eye had seen. I marked its coasts, carried the sailing directions home, and my people followed. It was colder and vaster than our fathers' islands, and we mastered it all the same.",
    ability:
      "Mana is what we live and die for: standing, earned by ancestry and deeds, and above all by victory. It cannot be bought, only won and defended. Every carving on the meeting house declares whose deeds stand tallest. Our culture grows from it, and our warriors strike like men with everything to prove.",
    leverage:
      "The Toa leads the war party; let his taiaha do the talking. And crown the hills with the Pa, earth and palisade, a stronghold that has humbled proud armies before.",
  },
  hawaii: {
    story:
      "I am Kamehameha. They said the man who moved the Naha stone would unite the islands, and I moved it. Island by island, battle by battle, I gathered Hawaii under one rule, fighting with spear and musket alike, and where there had been generations of war between chiefs I left a single kingdom under one law.",
    ability:
      "Aloha 'Aina means love of the land, and with us it is law as much as feeling. We tend the fishponds and the taro terraces, and the land and sea repay the care; abundance here is discipline, not luck. My coasts run with gold, my people eat well, and the islands prosper together.",
    leverage:
      "The Hawaiian Koa fights as my own guard fought, close and without fear. Raise the Heiau above the shore, keep the gods honored, and let every harbor fill your treasury.",
  },
  arabia: {
    story:
      "I am Harun al-Rashid, Commander of the Faithful, caliph in Baghdad. Within my round city gather poets, physicians, and astronomers, and it is said I walk the streets at night in disguise to hear the truths my courtiers polish away. A thousand and one tales will be told of my court. My age will be called golden.",
    ability:
      "Faith of the Prophet carried my people from the desert to Spain within a single century, and the same fire now lights the lamps of scholars. Faith and knowledge travel together in my realm, and every caravan carries both, coin and creed alike. Wealth follows wisdom down every road we open.",
    leverage:
      "The Camel Archer strikes where horses falter and is gone before the reply. And build the House of Wisdom, where the learning of Greece, Persia, and India is translated, weighed, and surpassed.",
  },
  israelites: {
    story:
      "I am Solomon, son of David, king in Jerusalem. When the Lord offered me anything, I asked for wisdom, and everything else followed: fleets sailing to Ophir, cedar from Tyre, kings and queens at my gate bearing riddles and gifts. I once judged between two mothers with a single sword, and all Israel saw whose wisdom was in me.",
    ability:
      "Kingdom of David is our inheritance: one people, one covenant, one city on the hill. Faith gathers in Jerusalem the way waters gather in the sea, culture and gold beside it, and every trade route carries a blessing home. We are small among empires, yet what is written in the heart cannot be burned.",
    leverage:
      "The Gibborim, my mighty men, guard what David won. And build the First Temple; I spent seven years raising mine, and no work of my hands mattered more.",
  },
  nabataeans: {
    story:
      "I am Aretas the Fourth, lover of my people, king of the Nabataeans. My capital is Petra, carved into rose-red cliffs, where invading armies arrive thirsty and leave beaten. Even Rome deals with me as a partner, for no legion can march where there are no wells. We know something worth more than gold in the desert: where the water hides.",
    ability:
      "The Incense Road runs through my kingdom because it must; only we can water it. Frankincense and myrrh cross the sands on our terms, every desert tile my people work pays gold, and my desert cities eat and prosper where others perish. We paid for Petra with perfume, not plunder.",
    leverage:
      "The Desert Raider strikes from the dunes and melts away before the counterblow. Dig the Cistern in every city; the rain falls seldom, but under my kingdom not one drop is wasted.",
  },
  saba: {
    story:
      "I am Bilqis, queen of Saba, whom the scriptures call Sheba. I crossed the desert to test Solomon with hard questions and matched the wisest king alive; I came home with my throne intact and his respect besides. My engineers built the great dam at Marib, and it has watered the desert for generations. My kingdom needs no husband to rule it, only rain and good sense.",
    ability:
      "The Frankincense Kingdom is mine because the sacred trees grow almost nowhere else on earth. Every altar from Rome to India burns what my caravans carry, and their gold and their prayers both flow back to Marib. Kings empty their treasuries for what grows wild in my hills.",
    leverage:
      "The Sabaean Spearman keeps the incense groves untouched, and the Marib Dam turns a desert wadi into gardens. Guard the water, sell the smoke, and let the world make you rich.",
  },
  mitanni: {
    story:
      "I am Tushratta, king of Mitanni, lord of the Habur plains. Pharaoh calls me brother in his letters and takes my daughter as his bride; even Egypt courts the kingdom that masters the horse. Between Hatti and Assyria I hold my ground with wheels, reins, and nerve, and the great courts send for our trainers at any price.",
    ability:
      "Maryannu names my chariot nobility, an aristocracy sworn to the war-cart. Kikkuli's training text, the oldest of its kind, conditions our horses like athletes, circuit after circuit at the gallop, so my riders strike harder and range farther while my plains feed the whole endeavor.",
    leverage:
      "The Maryannu Chariot decides open battle before the infantry can matter. Raise the Kikkuli Stables and breed speed itself; whoever rules the horse rules the plain.",
  },
  urartu: {
    story:
      "I am Sarduri, king of Urartu, throned at Tushpa on the great rock above Lake Van. Assyria, the terror of the age, marched north against my highlands and went home with nothing. I carved my victories into the cliff face itself, where neither flood nor fire can reach them, and from that rock my garrisons watch every pass.",
    ability:
      "Kingdom of Van is a realm of stone and of Haldi's fire. My smiths pour bronze that traders carry to distant seas, my engineers cut canals and vineyards into the mountainsides, and every mine in my hills works double. Stone, bronze, water, and the favor of Haldi: I need nothing else.",
    leverage:
      "The Urartian Charioteer runs down raiders on the high plateaus. And build the Fortress of Van in your cities; let every siege break against it, as Assyria broke against mine.",
  },
  greco_bactria: {
    story:
      "I am Demetrius, king of Bactria, son of Euthydemus. When Alexander's empire crumbled, his easternmost Greeks did not go home; we stayed on the Oxus and built a kingdom of our own. I led our phalanx over the Hindu Kush into India, and on my coins I wear the elephant crown to prove it. Greek, Persian and Indian live side by side in my realm, and ancient writers count our cities in the thousands.",
    ability:
      "They call my land the Thousand Cities, and every one earns its keep. Bactria gathers science, culture and gold together, for a theatre, a fire temple and a caravan market can share the same street.",
    leverage:
      "My Bactrian Cataphracts ride in full armour, man and horse alike, and break whatever stands before them. Raise a Gymnasion in every city and let Greek learning flourish a world away from Greece.",
  },
  sogdia: {
    story:
      "I am Divashtich, lord of Panjikent, last prince of free Sogdia. My people never built an empire; we built something better, a web of merchant colonies stretching from Samarkand to the gates of China. Our tongue became the common language of the Silk Road itself, and where armies could not pass, our caravans went singing.",
    ability:
      "We are the Lords of the Silk Road. Sogdia grows rich beyond its rivals, and every trade route we send out carries more gold and more goods than anyone else's, for the middleman always eats first. Samarkand and Bukhara never conquered the world; they simply sold it everything it wanted.",
    leverage:
      "My Sogdian Cavalry guard the caravans and cut raiders down before they reach the road. Build Caravanserais along every route, welcome all traders under their arches, and let the world's wealth stop at our door.",
  },
  khwarazm: {
    story:
      "I am Ala ad-Din Muhammad, Shah of Khwarazm. In one generation my house raised an empire from the oasis cities of the Amu Darya to the heart of Persia, richer than any realm between China and Baghdad. Pride was my crown and my curse: I insulted the envoys of the Mongol khan, and the storm that followed swallowed my cities whole. Learn from me, and this time we endure.",
    ability:
      "Shahs of Khwarazm is the wealth of the oasis throne. Gold pours through my treasury faster than rivals can count it, and every trade route we open pays a shah's tribute on top. Merv, Khiva and Gurganj are markets first and fortresses second, and the markets never close.",
    leverage:
      "My Khwarazmian Lancers are armoured horsemen of the Iranian world; keep them massed and no raider touches your caravans. Build the Gurganj Bazaar and turn the desert crossroads into a treasury.",
  },
  numidia: {
    story:
      "I am Masinissa, king of Numidia. I began as a chief among quarrelling Berber tribes and ended a king whom Rome itself courted. At Zama my riders circled Hannibal's flanks and helped bring Carthage down forever. Then I did the harder thing: I taught a nation of herdsmen to plough, and made my kingdom a granary. Rome called me its friend, and I made certain the friendship paid in grain and in glory.",
    ability:
      "Masaesyli Horse is my people's gift. We ride without bridle, guiding the horse by voice alone. Our cavalry strike harder, move farther and see beyond any rival, our mounts recover overnight, and our fields feed everyone.",
    leverage:
      "Send my Numidian Cavalry to sting, scatter and vanish before the enemy can turn about. Raise the Royal Horse Market and every city will breed the swiftest horses the Mediterranean has ever seen.",
  },
  fatimids: {
    story:
      "I am al-Mu'izz, Fatimid caliph, descended from Fatima, daughter of the Prophet. My general took Egypt without ruin, and I founded a new capital on the Nile: Cairo, the Victorious. There I raised al-Azhar, where scholars still teach a thousand years on. Baghdad claimed the caliphate; I answered by building a brighter one. My poets, my astronomers and my jurists all ate at one table, and the table was Cairo's.",
    ability:
      "The Isma'ili Caliphate joins the mosque, the library and the mint. Science, faith and gold rise together, and when the caliph is also the imam, faith itself commands the builders: spend it, and great works rise overnight.",
    leverage:
      "My Fatimid Ghulams, drilled and loyal, are the iron around the throne. Build Al-Azhar and keep its lamps burning; learning, once lit in Cairo, never goes out.",
  },
  ayyubids: {
    story:
      "I am Saladin, a Kurdish soldier who rose to rule an empire. I united Egypt and Syria under one banner, broke the Crusader host at Hattin, and in 1187 I took Jerusalem back, and took it with mercy, not massacre. Even my enemies told stories of my honour; that too is a weapon. When the Lionheart lay sick, I sent him my own physician, and we fought each other all the harder for it.",
    ability:
      "Sultan of Egypt and Syria is unity made strength. My realm builds faster, my horsemen and swordsmen strike harder, my soldiers heal even on the march, and when we come against city walls, the walls should worry.",
    leverage:
      "The Ayyubid Faris is my armoured horseman, patient and disciplined; use him to break field armies before the siege begins. Raise the Citadel of Cairo, my engineers' masterpiece, and rule from behind stone no enemy will crack.",
  },
  mamluks: {
    story:
      "I am Baybars. I was sold as a boy for a handful of coins, a slave from the steppe; I died a sultan of Egypt. At Ain Jalut we did what no power on earth had done: we stopped the Mongols and turned them back. Then I swept the Crusaders from their castles one by one, and I built roads and post stations so a letter reached Cairo from Damascus in four days. Never scorn a man for how he began.",
    ability:
      "Slave Soldiers is our paradox and our pride. Boys bought from the steppe are raised in the furusiyya schools into the finest cavalry alive. My soldiers train faster, march out already seasoned, and my horsemen hit like a falling wall.",
    leverage:
      "The Mamluk himself is the answer to most questions a battlefield can ask. Build the Maydan, the training ground of Cairo, and every generation of recruits comes out sharper than the last.",
  },
  almoravids: {
    story:
      "I am Yusuf ibn Tashfin, commander of the veiled ones. From the ribats of the western Sahara my Sanhaja brothers rode out with faith for armour, and we built an empire from the gold roads of Ghana to the heart of Spain. At Sagrajas I broke the Christian king's host in an afternoon, and I founded Marrakesh still wearing the veil of the desert.",
    ability:
      "The Veiled Sultanate marches on belief. Our faith runs deep, our fighting men strike harder, and the desert other kings call barren pays us gold from every worked dune. The gold of the Ghana road crossed the sands to my mints, and my dinars were trusted from Spain to Egypt.",
    leverage:
      "My Lamtuna Spearmen hold a line the way the desert holds its silence. Build Ribats along the frontier; each one is fortress, monastery and recruiting ground in a single set of walls.",
  },
  swahili: {
    story:
      "I am al-Hasan ibn Sulaiman, sultan of Kilwa. When the traveller Ibn Battuta came to my coast, he called Kilwa one of the most beautiful cities in the world. My people raised it in coral stone, and our fortune rides the monsoon: out to Arabia and India on one wind, home again on the other. I struck my own coins and set my name upon them, for a sultan of merchants must be good for his word.",
    ability:
      "Monsoon Trade is that rhythm made policy. Gold flows to us from Sofala in the south and from every sea route we open, our coastal cities grow rich on the tide, and our ships run faster than any rival's.",
    leverage:
      "My Swahili Dhows are traders and escorts both; let them stitch the whole coast into one market. Then raise Husuni Kubwa, my palace above the harbour, a hundred rooms and a bathing pool looking out over the sea.",
  },
  benin: {
    story:
      "I am Ewuare, oba of Benin, and they call me Ewuare the Great. I took a broken city and remade it: broad avenues, guild quarters for the casters of brass, and around it all the great earthworks, ditch and rampart dug so vast that few builders on earth have moved more soil. My craftsmen's bronzes will speak for us when every throne is dust.",
    ability:
      "Walls of Benin means no city of mine is ever born naked. Every new city rises with its walls already standing, our culture flowers from the guild quarters, and our workshops outbuild the neighbours. Think carefully before you trouble a people who dig faster than armies march.",
    leverage:
      "The Ogboni Guard keep order at home and break sieges abroad. Extend the Iya Earthworks around every settlement, and let your enemies spend their strength on ditch after ditch after ditch.",
  },
  kongo: {
    story:
      "I am Afonso, manikongo, king of Kongo. When the Portuguese came to my father's court, I did not fear their books; I mastered them. I learned their letters and their faith and wrote to their kings as an equal, ruler to ruler. My realm was governed from Mbanza-Kongo through appointed lords, one of the best ordered kingdoms in all Africa. I sent my sons across the sea to study, and one came home a bishop.",
    ability:
      "Kingdom of Kongo is that good order at work. Culture, faith and food all swell together, for a well governed province is a full one, and my crowded capital never goes hungry.",
    leverage:
      "My Kongo Archers loose in disciplined ranks; mass them and few armies will press the attack home. Build the Mbanza in each province, court and market and church in one, and rule as I did: with a pen as often as a spear.",
  },
  bulgaria: {
    story:
      "I am Krum, khan of the Bulgars. The emperor Nikephoros marched into my mountains to erase me; he burned my capital and refused every offer of peace, so he did not march out, and his skull became my drinking cup. Yet I was more than a warrior. I gave my realm its first written laws, one law for Bulgar and Slav alike, and made a state where there had been only tribes.",
    ability:
      "Khans of the Danube is that hard union of sword and plough. My realm works harder and eats better, my horsemen strike with steppe fury, and the cities I take I keep whole, people and all.",
    leverage:
      "Send the Bulgar Horse Archers wheeling ahead of the line; they shoot, fade and return before the enemy can answer. Then build the Preslav Court, and show Byzantium that the barbarians raise palaces too.",
  },
  serbia: {
    story:
      "I am Stefan Dushan, Emperor of the Serbs and Greeks. I doubled my kingdom at Byzantium's expense without losing a single great battle, and in 1349 I gave it my Code: law binding noble, priest and peasant alike, for an empire ruled by whim is no empire at all. At my height the empire ran from the Danube down to the Gulf of Corinth. The silver of Novo Brdo paid for my crown; the law made it worth wearing.",
    ability:
      "Dushan's Code is order that pays. Culture, gold and faith rise together under written law, and every mine we work, silver above all, hammers out extra production for the realm.",
    leverage:
      "My Pronoia Knights hold land in exchange for service, so their armour is always paid for. Raise the Despot's Hall in your cities and govern as I did: sternly, splendidly, and in writing.",
  },
  bohemia: {
    story:
      "I am Charles, King of Bohemia and Holy Roman Emperor. I made Prague my jewel: a stone bridge over the Vltava, a new town, and in 1348 a university, the first in central Europe. Beneath my kingdom ran veins of silver, and above them I set learning, so that Bohemia might be rich twice over. They came to call Prague the mother of cities; I made her an empress.",
    ability:
      "The Crown of Saint Wenceslas binds it all together. Science and gold flow strongly and culture follows, while every mine we sink, Kutna Hora before all, yields extra production for the kingdom's works.",
    leverage:
      "The Hussite War Wagon is my people's stubborn genius: a rolling fortress bristling with guns that breaks charging knights like kindling. Build the Kutna Hora Mint and let the silver groschen carry Bohemia's name across Europe.",
  },
  swiss: {
    story:
      "I am Werner Stauffacher of Schwyz. On the Rutli meadow, by night, we free men of the forest cantons swore an oath: no Habsburg bailiff would ever rule us. At Morgarten we proved it, when mountain herdsmen shattered a duke's army of knights among the rocks. We were farmers. We simply refused to kneel. Three small cantons swore that night; a confederacy grew from it, one valley at a time.",
    ability:
      "Reislaufer is what Europe came to call our fighting men. Our militias muster faster than any rival, our infantry strike far harder, and no mountain, marsh or forest slows our march, for we were born in country other armies fear.",
    leverage:
      "The Swiss Halberdier is the finest foot soldier of the age; form the square and let the knights break upon it. Keep the Rutli Meadow sacred, for the oath sworn there is worth more than any wall.",
  },
  aragon: {
    story:
      "I am James of Aragon, and they named me the Conqueror. I began as a boy king held hostage in a castle; I grew into the man who took Mallorca from the sea in 1229 and Valencia soon after. My crown ruled with its merchant cities, not over them, and Barcelona's ships carried our banner from Sicily to Athens. I even wrote the book of my own deeds, so no chronicler could soften them.",
    ability:
      "Mare Nostrum, our sea, is no idle boast. Gold flows through every harbour, our coastal cities prosper, our trade routes pay a premium, and our ships outrun any rival on the water.",
    leverage:
      "My Almogavers are lean, fast raiders in sheepskin and steel; their war cry alone has emptied battlefields. Build the Llotja in your ports, the merchants' exchange hall, and let commerce conquer whatever the sword leaves standing.",
  },
  scotland: {
    story:
      "I am Robert the Bruce, King of Scots. I was crowned at Scone with England's army on my heels, hunted through the heather, and I learned that a small nation wins by refusing to break. At Bannockburn in 1314 my spearmen stood against the flower of English knighthood and drove it into the burn. Scotland stayed free, because we would have it no other way.",
    ability:
      "Schiltron is our way of war: a bristling ring of long spears that no charge can crack. My melee soldiers fight harder, the glens feed us, the kirk steadies us, and every hill and forest of this hard land gives back more than it asks.",
    leverage:
      "Plant the Highland Schiltron on rough ground and let their cavalry ruin themselves upon it, and raise a Tower House over every holding, for a stubborn stone keep is how a small kingdom says no.",
  },
  gaelic_ireland: {
    story:
      "I am Brian Boru, High King of Ireland, the Ard Ri. I rose from Munster through a land of quarrelling kingdoms and bent them, one by one, to a single crown. At Clontarf in 1014 we broke the power of the Norse, though the victory cost me my life. Ireland remembers: the island of saints and scholars kept learning alive while the rest of Europe forgot how to read.",
    ability:
      "High Kingship gathers the whole island's strength. Culture and faith flow from the monasteries, the forests themselves feel holy, the land feeds us, and every warrior who takes my oath musters with fire already in his heart.",
    leverage:
      "Send the Gallowglass in first, mailed axemen sworn to the death, and raise a Round Tower beside every abbey, so when the raiders come our books and bells are already above their reach.",
  },
  normans: {
    story:
      "I am Roger the Second, King of Sicily. My Hauteville kin rode out of Normandy as landless younger sons and carved kingdoms from Byzantines and Arabs with a handful of knights. I finished the work: in Palermo, Greek scribes, Arab geographers and Latin clerks all serve one crown, the most brilliant court in Europe. We do not merely conquer. We govern.",
    ability:
      "Hauteville Conquest is that restless genius. My cavalry strike with greater force, science and gold pour through Palermo, and when a city falls to us it is not gutted; its people stay, and by the next season they are ours.",
    leverage:
      "Lead with the Norman Knight, the charge no line withstands, and build the Palatine Chapel, where craftsmen of three faiths gilded one ceiling, to remind the world what conquest can become.",
  },
  visigoths: {
    story:
      "I am Leovigild, king of the Visigoths. My people sacked Rome itself, then crossed a dying empire to build something that would last: a kingdom in Hispania ruled from Toledo. I drove out rivals, founded cities, and was first among our kings to sit a throne in royal regalia, crown and sceptre, a Goth reigning as the Caesars did.",
    ability:
      "Kingdom of Toledo is settled dominion. Church councils write our law, votive crowns of solid gold hang above our altars, and culture, faith and treasure grow together under one throne. When we take a city we keep it whole; its people become our people, and their strength becomes ours.",
    leverage:
      "Send the Visigothic Noble to break their lines, warrior aristocracy of the old blood that once took Rome itself, and raise the Hall of Toledo, where crown and council sit together and turn conquest into lasting law.",
  },
  novgorod: {
    story:
      "I am Alexander Nevsky, prince of Novgorod. On the Neva I broke the Swedes, and on the frozen lake at Peipus I drew the Teutonic knights onto spring ice and watched it swallow them. Yet I serve a strange master: a republic. The citizens of Novgorod hire their princes and dismiss them at the ringing of a bell, and their fur trade reaches from the Hansa to the Urals.",
    ability:
      "Fur Republic is that wealth. Gold flows from the coasts and along every trade route, for the northern forests are full of sable and squirrel, the German merchants keep their kontor inside our walls, and the traders of the Volkhov know the price of every pelt to the last coin.",
    leverage:
      "Loose the Ushkuinik along the rivers to raid and trade in the same breath, and hang the Veche Bell in every city; while it rings, the people rule, and a free city fights like no subject ever will.",
  },
  illyrians: {
    story:
      "I am Teuta, queen of the Illyrians. When my husband died I took the helm of a coast of sailors and raiders, and I gave my captains one law: the sea belongs to the bold. Rome sent envoys to scold me, a queen, in my own hall. They learned that Illyria apologises to no one, and my swift ships made the whole Adriatic, Greek and Roman alike, pay for the right to sail it.",
    ability:
      "Adriatic Pirates is my law made policy. Gold fills every coastal city, my fleets move faster than any prey can flee, and every raid on a foreign shore comes home riding low in the water, heavy with plunder.",
    leverage:
      "Build the Liburnian, the galley so swift that Rome copied the design and kept our name for it, and crown your headlands with the Gradina, stone hillforts on the heights, watching every approach from the sea.",
  },
  lusitani: {
    story:
      "I am Viriathus. I kept sheep in the hills of Lusitania until Rome slaughtered my people under a flag of truce, and I survived the treachery. So I taught the survivors a new kind of war: strike, scatter, vanish, strike again. For eight years I humiliated one consular army after another, and in the end Rome could defeat me only by buying my murderers.",
    ability:
      "The Romans called it Concursare, the running war: strike where they are weak, refuse battle where they are strong. My warriors fight far harder in the forests of our own land, no broken ground slows our march, and the hills that starve an invading army feed my people well.",
    leverage:
      "Arm the Falcata Warrior, whose curved blade shears shield and helm alike, and build the Castro on the high places; a walled hill village is a fortress Rome must climb for, bleed for, and burn one at a time.",
  },
  arevaci: {
    story:
      "I am Caros of Segeda, war leader of the Arevaci. When Rome marched on our Celtiberian highlands I led twenty thousand of the tribes out to meet them, and on the feast day of Vulcan, when they believed no one would fight, we ambushed the legions and cut down thousands. My people are the folk of Numantia, the fortress town that, when all was lost, chose fire and death over a Roman chain.",
    ability:
      "Spirit of Numantia is that unbending will. Our workshops labour harder, our melee warriors strike harder, and every new town we found raises its walls before its houses; we build nothing we cannot defend.",
    leverage:
      "Send the Celtiberian Warrior against them, stubborn fighters bred in the high country, and raise the Murallas de Numancia; behind those walls a town of herdsmen held the masters of the world at bay for twenty years.",
  },
  thracians: {
    story:
      "I am Sitalces, king of the Odrysians, greatest of the Thracian realms. From the Danube to the Aegean the tribes pay my tribute, and when I marched on Macedonia the Greeks swore I led one hundred and fifty thousand men. Every army in Hellas hires our fighters and pays in good gold; even their poets admit no people under the sun is more warlike than mine.",
    ability:
      "Odrysian Host is that strength, for hire and for keeping. Gold pours into my treasury as tribute and pay, my javelin men strike far harder than their light gear suggests, and my horsemen are the terror of the open plain.",
    leverage:
      "Screen every advance with the Thracian Peltast, dart and wheel and dart again, and build the Thracian Tomb, painted vaults where our chiefs sleep on gold, so the dead keep enriching the living and no one forgets whose land this is.",
  },
  dacians: {
    story:
      "I am Decebalus, last king of Dacia. Twice I fought the full weight of Rome and made an emperor buy peace from me with gold and engineers; it took Trajan himself, two wars and a bridge across the Danube to bring me down. I chose my own end over walking in chains in his triumph. The gold of my mountains built Rome a forum. Imagine what it built for us first.",
    ability:
      "Gold of the Carpathians is that buried power. Treasure flows from the mountains, every mine cut into them works harder, and my melee warriors swing the blade with a force that made the legions redesign their own armour.",
    leverage:
      "Field the Falxman, whose two-handed curved blade shears through shield, helm and the arm beneath, and build the Murus Dacicus, the layered wall of stone and timber that made Sarmizegetusa a fortress in the clouds.",
  },
  sami: {
    story:
      "We are the noaidi of the north, the drum-keepers of the Sami. Where others see a wasteland we read a living country: we follow the reindeer through the year's eight seasons, cross the snows on skis faster than any horse, and speak with the land through the beat of the drum. Empires rise and fall to the south of us. We endure, as the mountain endures.",
    ability:
      "People of the Eight Seasons is that deep fit between folk and land. Our herds and rivers feed us well, faith rises from every forest like breath in cold air, and no mountain, marsh or snowfield slows our people at all.",
    leverage:
      "Send the Ski Raider gliding over ground no enemy can cross, striking and gone like weather, and set the Siida Camp wherever the herds pause, for our whole way of life travels with us and leaves nothing behind for an enemy to burn.",
  },
  corinth: {
    story:
      "I am Periander, tyrant of Corinth. Some count me among the seven sages of Greece; the rest call me worse. Under my hand Corinth commands the isthmus, the narrow neck of land between two seas, and I built the diolkos, the stone slipway that hauls whole ships across it. Every cargo moving between east and west pays its respects, and its tolls, to us.",
    ability:
      "Two Seas is that stranglehold made prosperity. Gold pours into our coastal cities and along every trade route we run, and our fleets move faster, for a ship that skips the long voyage round the Peloponnese beats every rival to market.",
    leverage:
      "Guard the gulfs with the Corinthian Trireme, built in the city that taught Greece the art of shipbuilding, and lay the Diolkos across the isthmus, so commerce and navies alike roll over dry land on our terms.",
  },
  thebes: {
    story:
      "I am Epaminondas of Thebes. All Greece believed Spartans could not be beaten in open battle, so at Leuctra I stacked my left wing fifty shields deep and struck their king head on. The myth died that afternoon. I marched into the Peloponnese, freed the helots of Messenia, and left Sparta a shadow. One battle, rightly aimed, can end an age.",
    ability:
      "Sacred Band names our elite: one hundred and fifty sworn pairs of devoted warriors who train as one and die before they part. Their example lifts the whole city; our melee troops hit harder in the press of battle, and every recruit musters already burning to be worthy of them.",
    leverage:
      "Strike your decisive blow with the Sacred Band and nowhere else, and hold the Cadmea, the high citadel of our seven-gated city, for whoever keeps that rock keeps Thebes.",
  },
  eretria: {
    story:
      "We are the assembly of Eretria, merchant city of Euboea. Our fathers were among the first Greeks to dare the open sea with a purpose: at Pithekoussai and Cumae in the west we planted the earliest colonies, carrying our goods and the alphabet itself to new shores. When Ionia rose against Persia, we alone with Athens sent ships. We paid dearly, and regret nothing.",
    ability:
      "Euboean Colonists is that pioneering hunger. Culture and gold flow through our harbours, trade routes run richer, and every city we found begins crowded and eager, for our people emigrate with the whole household.",
    leverage:
      "Range the coasts with the Penteconter, fifty oars and a hull full of trade goods, and raise the Emporion in every new port, the market hall where a young colony first becomes a power.",
  },
  crete: {
    story:
      "I am Nearchus of Crete. Alexander gave me his fleet, and I brought it from the mouth of the Indus along unknown coasts to Persia, through hunger, storm and fear, without losing the flotilla. My island breeds such men. Every king in the world pays for Cretan bows, and our cities have grown rich selling the finest archers alive.",
    ability:
      "Cretan Archers is that trade in skill. Gold flows home with every mercenary's wage, our ranged troops strike harder than any rival's, and our recruits muster already trained, for on Crete boys learn the bow before the plough.",
    leverage:
      "Let the Cretan Archer thin their lines before they ever close, and inscribe the Gortyn Code, our great wall of written law, for a city with justice in stone hires out its sons with a clear conscience.",
  },
  indus_valley: {
    story:
      "We are the priest-council of the Indus. Long before other lands raised their first towns, we built Mohenjo-daro and Harappa: streets laid on a grid, standard baked brick in every wall, covered drains beneath every lane, wells and granaries for all. We left no boasting kings and no monuments to war. We left cities that worked. Read our script if you can; no one yet has.",
    ability:
      "Planned Cities is our whole craft. Every settlement we found rises with its granary already built and stocked and extra households already housed, for we design the whole city before the first brick is fired.",
    leverage:
      "Guard the orderly streets with the Harappan Spearman, for a quiet people need not be a helpless one, and build the Great Bath at the heart of each city, the deep watertight pool of brick where order and purity meet.",
  },
  zhou_china: {
    story:
      "I am King Wu of Zhou. At Muye my chariots broke the last Shang king, whose cruelty had cost him Heaven's favour, and I founded the dynasty that would rule China longer than any other. Under my house Confucius and Laozi will teach, and the rites we set down will shape a civilization for three thousand years.",
    ability:
      "Heaven grants the right to rule to the just and strips it from tyrants. That is the Mandate of Heaven, and while I hold it my people flourish: our culture deepens, our ancestors are honoured in faith, and the great bronze foundries never cool.",
    leverage:
      "Send the Zhou Chariot rolling ahead of the enemy's spears, aristocrats at war as in the oldest songs, and raise an Ancestral Temple in every city, so the dead advise the living and the living deserve to rule.",
  },
  delhi_sultanate: {
    story:
      "I am Alauddin Khalji, Sultan of Delhi. When the Mongols burned half the world, they broke against my walls again and again; India stood because I stood. I fixed the price of grain in every market of my capital, not from kindness, but so I could pay the greatest standing army of the age.",
    ability:
      "That machine of state is the Sultanate of Hind. Gold flows to the treasury, faith fills the mosques, cheap bread fills the ranks, and my regiments muster faster than any rival can count them. An army that is fed and paid does not break, and mine never did.",
    leverage:
      "March the Delhi War Elephant at the front, a moving wall no horse will face and no line will hold, and dig a Hauz in every city, the great reservoir that keeps Delhi drinking through siege and summer alike. Water and elephants: the two things Hindustan respects.",
  },
  mughals: {
    story:
      "I am Akbar, Padishah of Hindustan, heir to Timur and to Genghis Khan. I took the throne at thirteen and built an empire holding a quarter of the world's wealth. My grandfather Babur won Hindustan with cannon at Panipat; I made it something worth keeping. In my house of worship, Muslim, Hindu, Christian and Jain argue late into the night, for I rule them all, and I would understand them all.",
    ability:
      "Padishah is more than a title; it is sulh-i kul, universal peace under one master king. Tolerance keeps my markets loud with every tongue, so culture, gold and faith all swell together beneath my banner. An emperor who burns his subjects' temples rules ashes.",
    leverage:
      "Loose the Mughal Sowar, armoured horse carrying the wealth of empire into battle, and raise the Red Fort, sandstone walls proclaiming that this dynasty intends to stay.",
  },
  vijayanagara: {
    story:
      "I am Krishnadevaraya, emperor of Vijayanagara, the last great Hindu bulwark of the south, raised against the sultans of the north. My capital Hampi is a marvel; travellers from Persia and Portugal swore no city on earth compared. I won every war I fought and wrote poetry between the campaigns.",
    ability:
      "Vijayanagara means City of Victory, and the name is a promise. Temple gold fills my treasury, faith and culture flower in a thousand shrines, and wherever fresh water runs my fields grow heavy. The bazaars of Hampi sell diamonds in open stalls by the measure, and still my vaults stay full.",
    leverage:
      "Send the Vijayanagara War Elephant crashing through their line, the prestige weapon of the south, and dig a Temple Tank beside every shrine, so water, worship and wealth pool in one place. Elephants and water: the south is won with both.",
  },
  champa: {
    story:
      "I am Jaya Indravarman the Fourth of Champa. My people have held the coast of the South China Sea for a thousand years, merchants when trade is good and pirates when it is better. I sailed my fleet up the great river itself and sacked Angkor, the mightiest city of our age, in its own heartland. For years the Khmer wore our yoke, until fortune turned, as it always does at sea.",
    ability:
      "We are Lords of the Sea. Every coastal city of mine drips gold, my ships run faster than any rival's, and when we raid a foreign shore we strip it properly. Trade when the winds favour you, raid when they favour your enemies; either way the sea pays.",
    leverage:
      "Slip the Cham Raider along their coastline and let their harbours pay your wages, and build the My Son Tower, brick sanctuaries of Shiva that no mortar holds together and no age brings down.",
  },
  sinhala: {
    story:
      "I am Parakramabahu, king of Lanka from Polonnaruwa. I united the island under one crown and gave one command that outlived every war: let not a single drop of rain reach the sea without first serving man. My tanks and canals turned the dry zone into a granary, and the Sea of Parakrama still bears my name.",
    ability:
      "Let No Drop Waste is that command made law. Water feeds the paddies, the paddies feed the monks, and the monasteries that keep the oldest Buddhist tradition on earth fill my island with faith and learning. I fed my armies from those same tanks, and sent them as far as Burma when kings there forgot their manners.",
    leverage:
      "March the Sinhala War Elephant when diplomacy fails, and dig a Wewa beside every city; the reservoir is my true monument, and it feeds armies long after the kings who raised them are dust.",
  },
  khitan: {
    story:
      "I am Abaoji, first emperor of the Liao. I made the Khitan tribes one nation and took the northern rim of China for our pasture. Europe would call all China Cathay for centuries, and Cathay is only our name spoken by strangers. Our legends begin with a rider on a white horse; I gave my people victories to go with the story. I ruled two worlds at once and lost neither.",
    ability:
      "Dual Administration is how: a northern chancellery rules the riders by steppe custom, a southern one rules the farmers by Chinese law, and both pay me. Gold flows from the settled lands while my cavalry stays fast, hard and free.",
    leverage:
      "The Ordo Cavalry is my household guard, riders sworn to the emperor alone; strike with them where the enemy is thinnest. The Ordo Camp keeps fresh horsemen mustering wherever my banner stops.",
  },
  jurchen: {
    story:
      "I am Aguda of the Jurchen, a chief from the Manchurian forests. Our Khitan overlords ordered me to dance at a banquet; I refused, and then I broke their empire. In little more than a decade my riders took northern China from the Song, and my Jin dynasty ran the greatest iron industry the world had yet seen.",
    ability:
      "Meng'an-Mouke binds my people into households of a hundred and a thousand, farmers and soldiers in one body. Our furnaces outproduce every rival, our cavalry hits like a hammer, and city walls do not impress men raised on breaking them. The Song called us barbarians, and then they paid us tribute.",
    leverage:
      "Send in the Iron Pagodas, horse and rider armoured head to hoof, and plant a Meng'an Garrison on conquered ground, so every victory settles itself. Iron won this empire; iron will keep it.",
  },
  khazars: {
    story:
      "I am Bulan, khagan of the Khazars. My realm sits astride the gate between two worlds, where the silk of the east and the furs of the north must cross my steppe, and every caravan pays. When emperors and caliphs each pressed their faith on me, I heard them all out and chose Judaism, my own answer, on my own ground.",
    ability:
      "Toll of the Steppe is the simplest wealth there is: hold the crossroads and let the world enrich you. Every trade route pays my treasury, and faith gathers where all faiths meet. Furs, silver, silk and slaves, all of it crosses my steppe, and none of it crosses free.",
    leverage:
      "The Khazar Lancer guards the roads that feed us; keep him close to your caravans. And build the Sarkel Fortress, the white citadel on the river, so no rival ever holds the gate instead. Wealth invites wolves; be ready to be merchant and soldier both.",
  },
  avars: {
    story:
      "I am Bayan, khagan of the Avars. My horsemen brought the stirrup into Europe, and with it a charge no shield wall had ever felt. For two hundred years Byzantium counted its safety in gold paid to me, and every coin went into the Ring, the great fortress hoard at the heart of my realm. When my envoys wanted more, they simply asked, and Constantinople found the money.",
    ability:
      "Ring of the Avars is that hoard still growing. Tribute and plunder flow inward, my cavalry rides harder and strikes faster than any neighbour, and raiding pays half again for those who do it well. What we cannot tax, we take.",
    leverage:
      "The Avar Lancer is the point of the spear; charge him home before their lines are set. And raise the Hring itself, so everything your riders take has somewhere safe to sleep. Strike, seize, ride home; the Ring grows either way.",
  },
  golden_horde: {
    story:
      "I am Batu, grandson of Genghis Khan and lord of the Golden Horde. I burned my way across the Russian principalities until every prince knelt at Sarai for the right to keep his own throne. For two centuries they paid, and they remembered it as a yoke laid on their necks. It was. Europe would have been next, and only a great khan's death called me home from its doorstep.",
    ability:
      "Tatar Yoke is tribute enforced at a gallop. Gold rides in from subject lands, my cavalry outpaces and outfights the men who owe it, and raiding fills the treasury faster than any tax collector.",
    leverage:
      "The Tatar Horse Archer kills from a distance no footman can answer; never let him stand still. And string Yam Relays across your empire, the post stations that let one khan hold half the world. Speed is the whole art: arrive before the news of you does.",
  },
  chimu: {
    story:
      "I am Minchansaman, last great king of Chimor. My capital Chan Chan is the largest adobe city ever raised, ten walled palaces on a coast where rain almost never falls. We led rivers out of the mountains through canals and made the desert bloom, and our goldsmiths had no equals in all the Andes.",
    ability:
      "Kingdom of Chimor is that mastery of the impossible coast. Gold and craft pour from my workshops, and cities set in the desert feed and pay as if they stood in a green valley. When the Inca finally overcame us, they marched my smiths to Cuzco to teach them; even conquest bowed to our craft.",
    leverage:
      "The Chimu Slinger greets invaders with stones from beyond spear reach; screen your armies with him. And build the Chan Chan Citadel, walled compound of kings, so what the goldsmiths make, the walls keep. In the desert, water is the treasury behind the treasury.",
  },
  moche: {
    story:
      "I am the Lord of Sipan, priest and king of the Moche. My people raised mountains of adobe on the coast of Peru, millions of bricks in a single temple, and led canals through the desert until it fed us all. We left no writing; our potters answered for us, firing our faces and our gods into clay that still speaks.",
    ability:
      "Huaca Builders is the labour of a whole people turned to the sacred. Faith rises with every course of brick, and culture, food and craft rise with it, for the gods reward those who build. The greatest of our temples swallowed a hundred million bricks, and each one bears its maker's mark.",
    leverage:
      "The Moche Warrior guards the canals and takes his captives for the altars; keep him between the enemy and your fields. And raise a Huaca in every city, temple and tomb in one, brick by brick toward heaven.",
  },
  tiwanaku: {
    story:
      "We are the priest-rulers of Tiwanaku, keepers of the stone city beside Lake Titicaca, four thousand meters into the sky. Where night frost kills every crop, we learned to cheat it: ridged fields between channels of water that hold the day's warmth until morning. The Andes learned their gods from our carvings.",
    ability:
      "Raised Fields is that patient miracle. Our suka kollus outyield the warm lowlands, fresh water doubles every harvest beside it, and a people fed without hunger turns its hands to faith and to art.",
    leverage:
      "The Tiwanaku Spearman guards the terraces; we are builders before we are soldiers, but we are not defenceless. Raise the Akapana Pyramid, our holy mountain of cut stone, and let heaven look down on ordered fields. Feed the people first; empires built on hunger fall in a season.",
  },
  tarascans: {
    story:
      "I am Tariacuri, founder of the Tarascan state of Michoacan. I bound the lake cities into one kingdom, and my heirs did what no other power managed: they met the Aztec army in the field, broke it, and were never conquered. Our secret rang from the forges; alone in our world, we fought with metal.",
    ability:
      "Metalsmiths of Michoacan is that edge made policy. Copper and bronze fill our markets with gold and our warriors' hands with weapons their stone-armed enemies cannot match, and our armies muster with a smith's speed. Speed and metal decide battles before courage gets its chance.",
    leverage:
      "The Copper Macehead shatters obsidian and the arm that holds it; lead every assault with him. And build the Yacata, our round-stepped temples above the lake, where the fire god keeps our hearths burning. Let the Aztecs count captives; we count victories.",
  },
  taino: {
    story:
      "I am Anacaona, cacica of Xaragua. My name means Golden Flower, and my people knew me first as a poet; I composed the areitos, the sung histories danced in the plaza. I ruled the richest chiefdom of Hispaniola in my own right, and when strangers came from the sea I met them with dignity, not fear.",
    ability:
      "Caciquedom is the way of the islands: many villages, one voice. Our conucos, the mounded gardens, keep every island fed, and song, spirit and story flow through my people like a warm sea. The zemis, our carved spirits, watch over field and family alike.",
    leverage:
      "The Guaribo Slinger defends our shores with a stone and a steady eye. And build the Batey, the court where we play the ball game, settle our quarrels and dance the areito; a people who gather cannot be scattered. Grow wide across the islands; every new shore is another garden.",
  },
  tonga: {
    story:
      "I am the Tui Tonga, sacred king of the sea. From Lapaha my double canoes range a thousand miles of open Pacific, and islands that have never seen my face send tribute in fine mats, feathers and yams. No wall holds my empire together; kinship, prestige and the finest sailors alive do. Fiji and Samoa knew my name before they ever saw my sails.",
    ability:
      "Maritime Tribute is empire without conquest. Island cities pour gold into my court, my fleets cross water faster than any rival, and the horizon is a road, not a border. No one commands the whole ocean, but no one needs to; command the islands and the ocean follows.",
    leverage:
      "The Tongan Toa is a warrior bred to fight from a rocking deck; land him where he is least expected. And raise the Langi, the terraced stone tombs of my line, so even our dead command respect across the ocean.",
  },
};
