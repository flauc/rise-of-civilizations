/// <reference types="vite/client" />
// Changelog: a simple overlay listing what changed in each release. Surfaced
// from the start screen via the version label so players can see what's new.

/** The current game version — shown on the start screen and atop the changelog. */
export const CURRENT_VERSION = "0.7.3";

interface ChangeEntry {
  /** Short category badge, e.g. "New", "Gameplay", "Fix". */
  tag: string;
  title: string;
  desc: string;
}

interface Release {
  version: string;
  /** Optional release date label, e.g. "June 2026". */
  date?: string;
  changes: ChangeEntry[];
}

/** Newest release first. */
const CHANGELOG: Release[] = [
  {
    version: "0.7.3",
    date: "July 2026",
    changes: [
      {
        tag: "New",
        title: "Report, mute, and block players in chat",
        desc:
          "Multiplayer chat now has a menu on each message where you can mute a player to hide their messages, block them, or report them. Muted and blocked players' messages no longer show in your chat. Offensive language is also filtered automatically.",
      },
      {
        tag: "New",
        title: "Support form and legal pages",
        desc:
          "You can now open a support form from the menu to send a question or a bug report, and read the Privacy Policy and Terms of Service from inside the game. New players are asked to accept the terms when they register.",
      },
      {
        tag: "New",
        title: "Delete your account",
        desc:
          "Registered players can permanently delete their account and its saved games from the Settings panel, confirming with their password.",
      },
      {
        tag: "New",
        title: "Natural wonders sit where they belong on Real World maps",
        desc:
          "On a Real World map, natural wonders now appear in their true locations. Mount Everest rises in the Himalayas, Uluru in the Australian outback, the Grand Canyon in North America, and the Great Barrier Reef off the Australian coast.",
      },
      {
        tag: "Gameplay",
        title: "Natural wonders enrich your borders",
        desc:
          "A natural wonder inside your territory now grants culture and tourism just for sitting within your borders, instead of only when a citizen works its tile. Natural wonders are also rarer and spread further apart on the map.",
      },
      {
        tag: "Gameplay",
        title: "Trade routes chain through your ports",
        desc:
          "An inland or coast-locked city can now trade with distant and overseas partners by routing through your own port cities. The route lists the cities it travels via on the way there.",
      },
      {
        tag: "Gameplay",
        title: "Trade income no longer depends on distance",
        desc:
          "Every trade route now earns the same base income no matter how far apart the two cities are. You grow a route by paving its roads, building Markets and Banks at each end, and reaching a foreign or overseas partner. The route's food, production, science, and culture all rise together with its gold.",
      },
      {
        tag: "Gameplay",
        title: "Tribal village density",
        desc:
          "When setting up a game, tribal villages are now set to None, Medium, or High, instead of a single on or off switch.",
      },
      {
        tag: "Gameplay",
        title: "Score victory resolves at the turn limit",
        desc:
          "The score victory now decides at the turn limit and shows your current rank and the leader's score, instead of a progress bar measured against the leader.",
      },
      {
        tag: "Gameplay",
        title: "Governors protect the specialists you trained",
        desc:
          "A city run by a governor no longer disbands craftsmen you assigned by hand. When you change a city's focus, only the specialists the governor itself trained are freed and put back to work. A city set to a Military focus keeps every barracks slot filled.",
      },
      {
        tag: "UI",
        title: "Redesigned end of game screen",
        desc:
          "The finish screen now shows a full scoreboard with every civilization's score broken down, your empire's final stats, and a View Map mode that lets you pan the revealed map after the game is over.",
      },
      {
        tag: "UI",
        title: "World wonders show while under construction",
        desc:
          "A world wonder being built now appears as a labelled marker on its tile, and you can see a rival's wonder site once it comes into view.",
      },
      {
        tag: "Gameplay",
        title: "The AI builds wonders that suit its strategy",
        desc:
          "An AI now develops its empire, gathers the specialist crew a world wonder needs, and builds one that serves its plan. It picks a wonder its civilization actually benefits from rather than the cheapest one it can start.",
      },
      {
        tag: "Gameplay",
        title: "A winning AI presses the war but will still make peace",
        desc:
          "An AI with an overwhelming advantage now fights a war through to the end. One holding only a slight edge will agree to a reasonable peace once the fighting drags on, instead of refusing every offer while it is ahead.",
      },
    ],
  },
  {
    version: "0.7.2",
    date: "July 2026",
    changes: [
      {
        tag: "New",
        title: "Barbarian camps escalate through the ages",
        desc:
          "Camps no longer only turn out warriors and slingers. As the game goes on they field war dogs and fire hardened spears, then chariots and riders, then spearmen, axemen and archers, and eventually swordsmen, pikemen, cataphracts and longswordsmen. What a camp can raise is tied to how far a civilization racing for that unit's technology would have gotten, scaled to the game speed, and hordes lean toward the strongest units a camp has unlocked. Late game raids now hit far harder than early ones.",
      },
      {
        tag: "New",
        title: "Coastal barbarian camps raid by sea",
        desc:
          "A barbarian camp on the coast can now launch warships onto the water beside it: longships, galleys, biremes, triremes, dromons and quinqueremes. Coastal camps favor ships over land units, so a shoreline settlement has to watch the sea as well as the land.",
      },
      {
        tag: "New",
        title: "You are told when war is declared",
        desc:
          "A new alert fires the moment someone declares war on you, interrupting the turn so you see it at once. When two other civilizations you have both met go to war, you learn of it at the start of your next turn. The aggressor gets no such warning.",
      },
      {
        tag: "Gameplay",
        title: "Bridges belong to everyone, and now need Bridge Building to lay",
        desc:
          "A road built across a river is now a bridge that any unit can cross without paying the river crossing penalty, no matter whose land it sits on or what technology the crossing army has. To balance that, a road can no longer be laid on a river tile until you have researched Bridge Building, just as river farms wait on Irrigation.",
      },
      {
        tag: "Gameplay",
        title: "Recon promotions run in a line",
        desc:
          "The scouting promotions now chain. Spy, which grants +1 sight, requires Scouting, and Eagle Eye, which grants +2 sight, requires Spy. You climb the reconnaissance tree in order rather than taking the top rung first.",
      },
      {
        tag: "UI",
        title: "Road grades now look different on the map",
        desc:
          "The three road grades are now easy to tell apart at a glance: a Dirt Road shows as a warm earthen track, a Paved Road as packed stone, and an Imperial highway as pale dressed stone. Roads that cross a river now draw as a wooden bridge spanning the water instead of a road sitting on open water, and standalone stretches of road use the same painted artwork as the rest of the network.",
      },
      {
        tag: "UI",
        title: "Dozens of symbols now render as game art",
        desc:
          "More than fifty ability and religion symbols that used to appear as plain system emoji now show as custom icon art in the same style as the rest of the game: animals such as the horse, elephant, wolf, lion, shark and eagle, nature symbols such as the mountain, sun, moon, snowflake and wave, and faith symbols such as the Om, torii shrine, dharma wheel, star and crescent, Star of David, yin and yang and ankh.",
      },
    ],
  },
  {
    version: "0.7.1",
    date: "July 2026",
    changes: [
      {
        tag: "UI",
        title: "Unique unit and building cards show their stats up front",
        desc:
          "On the civ selection screen and in the wiki, a civ's unique unit now shows its strength, ranged strength, and movement, plus each special ability it has and what that ability does, directly on the card. Unique buildings and improvements now list their per-turn yields there too. Before this you had to open the unit to see any of it.",
      },
      {
        tag: "UI",
        title: "Tile panel shows every yield",
        desc:
          "The tile information panel now lists science, faith, and culture yields, not only food and production. A tile such as Wooded Hills, which gives science, was previously shown as if it produced only food and production.",
      },
      {
        tag: "Fix",
        title: "Cities fire every bombard they have",
        desc:
          "A city with a Bombard Tower is meant to bombard twice per turn, but AI cities were only firing once, and cities loaded from saves made before version 0.6.0 could be stuck never firing at all. Cities now use every bombard available to them each turn.",
      },
      {
        tag: "Fix",
        title: "An error on an opponent's turn no longer freezes the game",
        desc:
          "If an AI or barbarian turn hit an error, the game could get stuck on that opponent and never hand control back to you. Errors during an opponent's turn are now caught and the game continues to the next player.",
      },
      {
        tag: "Fix",
        title: "Selecting a unit clears the city tile overlay",
        desc:
          "The highlighted tiles a city works could stay on screen after you selected a unit. Selecting a unit now clears that overlay.",
      },
      {
        tag: "Gameplay",
        title: "AI attacks the same turn it reaches you",
        desc:
          "AI military units used to march up next to an enemy and stop, giving the enemy the first strike. They now cover the last step and attack in the same turn whenever they have the movement to do both.",
      },
      {
        tag: "Gameplay",
        title: "AI stops throwing units against walls",
        desc:
          "The AI no longer makes attacks that take heavy damage without scoring a kill, such as repeatedly charging a fortified barbarian camp, even when the attacking unit is at full health.",
      },
    ],
  },
  {
    version: "0.7.0",
    date: "July 2026",
    changes: [
      {
        tag: "New",
        title: "A world of continents and land bridges",
        desc:
          "Every map is now generated fresh from a constellation of drifting continents. Roll a single great landmass or as many as four, each its own size and shape, and every so often a Panama or Suez style isthmus reaches out to join two of them, so an overland march between worlds is sometimes possible and sometimes not. Choose your layout in the lobby, or leave it to Random and let the discovery of how many lands there are become part of the game.",
      },
      {
        tag: "New",
        title: "Frozen poles and cold frontiers",
        desc:
          "The far edges of the world now freeze. A band of ice caps girds each pole, drifting icebergs dot the polar seas, and crevasses split the frozen ground, while moist highlands rise into rolling, tree-cloaked hills. On a fantasy map the poles can lie along any pair of opposite edges, not only north and south, so no two worlds feel quite alike. All of it is newly painted, from the hill forests to the ice.",
      },
      {
        tag: "New",
        title: "Herodotus guides your first turns",
        desc:
          "A new tutorial welcomes newcomers with Herodotus, the father of history himself, as their coach. Across the opening five turns he speaks his lessons aloud and lights the way: how units and yields work, how to found a city, how to meet a barbarian in battle, what a tribal village offers, and how to treat with a neighbor. The board even arranges for a barbarian and a village to appear right when the lesson calls for them.",
      },
      {
        tag: "New",
        title: "Sign in and carry your empire with you",
        desc:
          "You can now create an account and sign in. Your games are saved to your name, so you can leave a match and return to it later, while guests still jump straight in and play on their own device. A rebuilt sign-in screen greets you at the door.",
      },
      {
        tag: "New",
        title: "Three new legends answer the call",
        desc:
          "Three heroes join the roster, each with a power drawn from their history. Amanirenas, the warrior queen of Kush who fought Rome to a standstill, leads from the front. Demetrius the Besieger brings Siege Volley, an arcing barrage that falls hardest on the defenders of walls and forts. And Zhuge Liang, the Sleeping Dragon, looses Repeating Fire, two volleys in a single breath, while his presence yields a steady trickle of science and sharpens the archers around him.",
      },
      {
        tag: "Gameplay",
        title: "Legends earn their years",
        desc:
          "A hero no longer lives on a fixed clock. Each legend begins with a short tenure and extends it by doing what made them legendary: a conqueror wins turns by taking cities, a warrior by slaying foes, a lawgiver by adopting civics, a scholar by completing research. Live up to your legend and the legend lives longer.",
      },
      {
        tag: "Gameplay",
        title: "Call on your leader's signature power",
        desc:
          "Your civilization's leader now carries an ability you can invoke yourself. Once it unlocks, a button on the HUD lets you unleash it, then holds it on cooldown until the moment comes again, so the defining power of your civ is a card in your hand rather than a passive footnote.",
      },
      {
        tag: "Gameplay",
        title: "Upgrade your veterans",
        desc:
          "An aging unit need not fall behind. In friendly territory you can now pay gold to upgrade a unit into its modern successor, carrying its hard-won experience forward, so the warrior who has fought since the Bronze Age can march into a new era as a proper soldier.",
      },
      {
        tag: "Gameplay",
        title: "Set the pace of history",
        desc:
          "A new game speed setting lets you choose how long an age lasts. Slow makes research and civics cheaper so the eras rush by, Epic raises their cost for a long, deliberate march through every stage of history, and Normal sits between the two. Pick your tempo when you set up a game.",
      },
      {
        tag: "Gameplay",
        title: "Ferry your armies across the sea",
        desc:
          "Land units can now board a transport ship and ride it overseas as cargo, then step ashore on a distant coast, so moving an army across open water is a matter of loading the fleet rather than sending every soldier swimming.",
      },
      {
        tag: "Gameplay",
        title: "Set a guard on your caravans",
        desc:
          "A trade route can now be given an escort, a unit that travels with the caravan to fend off the raiders who prey on unprotected lanes. Guard the routes that matter and your commerce keeps flowing where before it bled.",
      },
      {
        tag: "Gameplay",
        title: "Islands are worth the voyage",
        desc:
          "Small islands are now deliberately rich. Set sail for one and you are far more likely to find luxuries waiting, and a fishing bounty in the waters around it, so the trouble of crossing the sea to settle a speck of land finally pays off.",
      },
      {
        tag: "Balance",
        title: "Trade routes pay their due, not a fortune",
        desc:
          "The gold a trade route earns has been reined in, with the richest routes capped lower than before and international lanes granting a touch less on top. Trade remains a fine income, but it no longer outpaces every other road to prosperity.",
      },
      {
        tag: "UI",
        title: "Know when a rival falls",
        desc:
          "When a civilization is knocked out of the game, a turn notification now marks the moment, so the fall of a great power never slips by unnoticed.",
      },
    ],
  },
  {
    version: "0.6.0",
    date: "July 2026",
    changes: [
      {
        tag: "New",
        title: "Cities with plenty to build again",
        desc:
          "Now that soldiers are trained from citizens rather than hammered out on the production line, cities had run short of things to build. Ten new buildings fill the gap — spanning growth, city defence and military support — so a developed city has a real construction queue from the ancient era to the age of gunpowder, instead of running out of work by the classical age. Every one is unlocked by research and slots into the techs you already climb.",
      },
      {
        tag: "New",
        title: "A fortress worth besieging",
        desc:
          "Walls now anchor a whole chain of fortifications. A Castle raises a stone keep that outlasts the outer wall — adding defence and a deep reserve of city health — while Ballista Towers turn the ramparts into artillery, striking bombarded foes far harder. A Bombard Tower mounts gun batteries that let a city fire twice in a single turn, and a Beacon Tower lights a signal chain that lends its defence to every friendly city within sight of its flame. Layer them and a frontier capital becomes a nightmare to storm.",
      },
      {
        tag: "Gameplay",
        title: "Armies forged, not just fielded",
        desc:
          "Three new buildings back the muster field. A Drill Yard drills recruits so they train faster; an Armoury issues standardized iron arms, so soldiers march out already blooded with extra experience; and a late-era Arsenal — the pride of a great city — speeds production further and sends its troops off in high spirits. A city that invests in all three fields a faster, sharper, steadier army.",
      },
      {
        tag: "Gameplay",
        title: "Storehouses, infirmaries and arches of triumph",
        desc:
          "A Storehouse keeps a grain reserve, so a growing city never restarts its next citizen from empty — every generation builds on the last. An Infirmary tends the wounded, healing your units for a couple of tiles around it each turn, so a city that stages armies also mends them. And a Triumphal Arch turns victory into an address: when an enemy falls near it, your nearby soldiers are steeled by the sight and fight the harder for it.",
      },
      {
        tag: "UI",
        title: "See what unlocks next",
        desc:
          "The construction menu no longer hides a building you can't yet raise because it needs another first. A Castle, its towers and the great gun batteries appear greyed out with the prerequisite spelled beneath them, so you can plan the whole fortification chain ahead. The in-game encyclopedia's Buildings page is rebuilt too — a complete, always-accurate roster of every building, its cost, its tech and exactly what it does.",
      },
      {
        tag: "Gameplay",
        title: "Rivals fortify and equip",
        desc:
          "Rival empires make full use of the new roster. Cities near a war front raise walls, castles and towers before the blow lands and light beacon networks across a threatened frontier; war-minded civilizations equip their armies with drill yards and armouries; and every empire stocks storehouses and infirmaries to grow and heal — so an AI capital is now as hard to crack as one of your own.",
      },
    ],
  },
  {
    version: "0.5.1",
    date: "July 2026",
    changes: [
      {
        tag: "Gameplay",
        title: "Great works, built again and again",
        desc:
          "A handful of the mightiest civ-unique buildings no longer count just once. Raise the Great Wall in a second city and its empire-wide bonus stacks with the first — and so it goes for the Roman Bath, the Cothon, the Storm Temple, the Royal Stable and the Feitoria. Each new copy adds its gift again, up to a generous ceiling, so an empire that commits to its signature building is rewarded for building it far and wide.",
      },
      {
        tag: "UI",
        title: "Cliffs that face the sea",
        desc:
          "The White Cliffs of Dover and the Giant's Causeway now stand where they belong — along the shoreline, their rock dropping straight into open water instead of floating inland. Several of the grandest wonders were repainted too: the Grand Canyon, Iguazú Falls, Victoria Falls and Yosemite now sit cleanly on the map, their sweeping breadth no longer spilling past the edges of their tile.",
      },
      {
        tag: "UI",
        title: "See what a tile still needs",
        desc:
          "When you can't yet develop a tile or raise a wonder, the option no longer simply vanishes. Locked improvements and world wonders now appear greyed out with the reason spelled out beneath them — the tech to research, the specialist to train, the resource to secure — so you always know what stands between you and the work.",
      },
    ],
  },
  {
    version: "0.5.0",
    date: "July 2026",
    changes: [
      {
        tag: "New",
        title: "A tree of governments",
        desc:
          "Governments are no longer a simple ladder of ever-better upgrades. They now form a branching tree you research with culture — the same way you research technology with science — spreading across three lineages: Authority, Assembly and Faith. Despotism and Tyranny rule by force; Councils and Republics by the citizenry; Priest-Kingships and Theocracies by the gods. Each carries its own strengths and a real weakness, and the government you hold decides which civics you may enact — so your form of rule is the spine of your whole strategy, not just a count of slots.",
      },
      {
        tag: "New",
        title: "Civics are bargains, not bonuses",
        desc:
          "Every civic now carries a cost as well as a gift. Standing Army makes every soldier fiercer but drains your treasury to feed them; Open Markets pours gold in peacetime but chokes in war; Border Wardens harden your troops at home yet leave them weaker abroad. Buy civics with your culture, slot the ones your government allows, and swap them as the war turns — the right civics for a marching empire are the wrong ones for a peaceful one.",
      },
      {
        tag: "Gameplay",
        title: "Revolutions cost blood",
        desc:
          "Changing government is no longer free. Your first is a celebration, and stepping deeper within the same lineage brings only a brief unrest — but abandoning your lineage for another is a revolution: three turns of turmoil in which every city's output falls by a quarter and your slotted civics fall dormant. Choose your path with care; you can't turn on a coin.",
      },
      {
        tag: "Balance",
        title: "A new order, weighed and measured",
        desc:
          "Forty-three civics and fifteen governments arrive fully costed against one another, tier by tier, so no single card or constitution towers over its peers. Powers that only bite in certain moments — at war, on home soil, or against another faith — are priced for how often they truly matter, and every con is a genuine sacrifice rather than a token.",
      },
      {
        tag: "UI",
        title: "Know your government",
        desc:
          "A rebuilt Governments & Civics panel lays the whole tree bare: research the next form of rule, switch with a clear warning of the unrest it will cost, and slot your civics with their upsides in green and their costs in red. The in-game encyclopedia gains full Governments and Civics pages, every entry's trade-offs spelled out.",
      },
      {
        tag: "Gameplay",
        title: "Rivals rule with intent",
        desc:
          "Rival empires now navigate the new tree with a mind of their own — warlords drive down the Authority line, builders and scholars toward the Assembly, the devout toward Faith — researching governments, adopting the civics that suit their temperament, and weighing whether a revolution is worth its unrest before they ever commit to one.",
      },
    ],
  },
  {
    version: "0.4.1",
    date: "July 2026",
    changes: [
      {
        tag: "New",
        title: "Walls that strike back",
        desc:
          "Your cities can now rain fire on an enemy within two tiles, once per turn. Aim it from the new bombard button, tap a highlighted foe, and the shot lands with no risk of return fire — and its strength scales with the city's defenses, so a well-fortified capital is a threat all on its own.",
      },
      {
        tag: "New",
        title: "Choose where your borders grow",
        desc:
          "A city no longer always claims the nearest tile as it expands. Plant a flag on any claimable tile and the city will reach for it next; borders now only grow into ground that touches land you already hold, so your realm spreads the way you intend it to.",
      },
      {
        tag: "Gameplay",
        title: "Great Prophets each bring their own gift",
        desc:
          "Every Great Prophet now carries a secondary gift drawn from history alongside the faith they reveal — Zarathustra's Sacred Fire turns kills into faith and lifts morale, Confucius raises temples in your best temple-less cities, Laozi swells faith across the whole empire, Siddhartha heals every wounded unit, Augustine ordains free missionaries at the holy city, Aquinas forges faith into a burst of science, and Rumi sends a wave of pressure and culture through every city. The plain faith reward is a little smaller now to make room for these.",
      },
      {
        tag: "Gameplay",
        title: "Governors get to work at once",
        desc:
          "Hand a city to a governor and it now chooses what to build that very turn instead of idling until the next — so a freshly appointed governor never wastes the turn you gave it.",
      },
      {
        tag: "Balance",
        title: "Sea-born wonders need the sea",
        desc:
          "A handful of civilizations' unique buildings — Carthage and Phoenicia's trade houses, Portugal's feitoria, Corinth's Diolkos, and the harbor works of Venice, Majapahit, the Swahili and Eretria — now require a coastal city, so their maritime bonuses only rise where they truly belong.",
      },
      {
        tag: "Balance",
        title: "Civics cost more as your culture deepens",
        desc:
          "The price of adopting civics has risen across the board, and now climbs a further 12% for every civic you've already taken — so a runaway culture lead no longer sweeps the whole tree in a handful of turns.",
      },
      {
        tag: "Balance",
        title: "Formations reach farther",
        desc:
          "Discipline and Flanking now count every friendly unit within two tiles rather than only those pressed right alongside, each adding +2 strength up to +8 — so holding a broad line, not just a tight knot, is what wins the melee.",
      },
      {
        tag: "UI",
        title: "The whole race, on the leaderboard",
        desc:
          "Your progress toward every enabled victory condition now sits right under the standings on the leaderboard, so you can read how close each rival is to winning at a glance, without opening a separate panel.",
      },
      {
        tag: "UI",
        title: "Wonders on the tech tree",
        desc:
          "The tech tree now marks which wonders each technology unlocks, alongside its units and buildings — while the long rosters of holy units no longer flood the unlock lines.",
      },
      {
        tag: "UI",
        title: "Faith and culture on every tile",
        desc:
          "When you assign citizens, worked tiles now show their faith and culture yields too, not just food, production, gold and science — and the labels always sit clear of whatever unit is standing on the tile.",
      },
      {
        tag: "UI",
        title: "The lobby remembers your last game",
        desc:
          "Setting up a new single-player game now starts from your last one — same civilization, colour, map, opponents and barbarian level — so you can jump back in with a single click.",
      },
      {
        tag: "Fix",
        title: "Steadier on mobile",
        desc:
          "The map now pins cleanly to the visible screen as the browser's bars slide in and out, banishing the black strips along the edges, and the game holds to portrait on phones.",
      },
    ],
  },
  {
    version: "0.4.0",
    date: "July 2026",
    changes: [
      {
        tag: "New",
        title: "Every religion is now its own religion",
        desc:
          "Each of the 24 faiths carries a historically-fitting preset benefit the moment you found it — Islam's House of Wisdom feeds science and gold, the Aztec faith turns every kill into faith for the sun, Norse raiders plunder richer along the coasts, Jain merchants prosper, Zoroastrian fire temples drive production. Founding also grants one perk pick from a much larger shared pool — and perks are exclusive: a perk claimed by a rival religion is gone for good.",
      },
      {
        tag: "New",
        title: "Religion tiers — grow your faith to tier 5",
        desc:
          "Religions now rise through five tiers. Each upgrade costs faith (250 / 500 / 1000 / 2000) and demands a minimum of follower cities (3 / 6 / 10 / 14), and every tier grants a new perk pick — from that tier or any below it. The perk pool spans five tiers too, from Tithe and Harvest Blessing all the way to Dominion of Heaven and the Sword of God.",
      },
      {
        tag: "New",
        title: "Holy capitals",
        desc:
          "The city where you found your faith is its religious capital: it radiates the strongest pressure and enjoys a bonus fitted to the religion — pilgrims enrich the Christian holy city, the Sikh Khalsa musters troops faster, the Grand Madrasa of Islam feeds science. For 200 faith the capital can be moved to any other follower city you own.",
      },
      {
        tag: "New",
        title: "24 religion unique units with bespoke powers",
        desc:
          "Every faith fields a unique holy unit, trained in any follower city with a Temple. Each carries a genuinely distinct kit: the Evangelist heals and converts as he walks, the Templar Knight and Ghazi turn war into faith, the Jain Ahimsa Ascetic cannot strike a blow yet unmans everyone around him, the Gothi promises Valhalla so every nearby death rallies the line, the Oracle of Delphi prophesies doom, the Nihang's chakram whirls through every adjacent enemy, the Miko dances the Kagura, the Egyptian Mortuary Priest harvests souls, the Manichaean Elect out-converts every preacher alive. Units grow stronger with your religion's tier — and several unlock a second signature ability at tier 4.",
      },
      {
        tag: "Fix",
        title: "Religious victory no longer triggers by accident",
        desc:
          "A city now only counts as converted when a faith truly holds it — a strict majority of its religious pressure above an absolute floor. Previously the faintest trace of ambient spread counted as conversion, so the game could declare a religious victory nobody was pursuing.",
      },
      {
        tag: "New",
        title: "Religion wiki",
        desc:
          "The wiki's religion section documents the whole system — founding, presets, perk tiers and exclusivity, holy capitals, spread and the fixed victory — and every religion now has its own page with its history, benefits and unique unit.",
      },
      {
        tag: "New",
        title: "Share vision across borders",
        desc:
          "A new Exchange Maps treaty lets two civilizations see each other's explored lands and everything their units and cities can see, for as long as the pact holds. Offer it at the table like open borders, end it whenever you like from the agreements list — and it tears up the instant war breaks out. Rivals value it too, and will share sight with civilizations they've come to trust.",
      },
      {
        tag: "UI",
        title: "A rebuilt diplomacy table",
        desc:
          "The negotiation screen has been rebuilt around two tabs — an Overview of every standing offer, action and agreement, and a Make a deal composer. Treaties are now one-tap chips, and everything changing hands sits in clear 'You give' and 'You receive' trays, so a single proposal can bundle open borders, gold, a luxury and a technology at once. One live verdict tells you whether the AI will accept before you send it, suing for peace has its own button and its own read on whether the enemy will take it, and the whole panel now wears the game's parchment-and-gold look.",
      },
      {
        tag: "New",
        title: "Let a governor run your cities",
        desc:
          "Any city can be handed to a governor with a focus — Growth, Military, Science or Money — and it will assign its citizens and choose what to build toward that goal on its own, or stay on Manual if you'd rather manage it yourself. Pick a mode from the compact selector on the city panel. A city you capture always reverts to Manual, so you decide its new course.",
      },
      {
        tag: "Balance",
        title: "Signature improvements are worth the upgrade",
        desc:
          "A civilization's unique tile improvement now grows by +2 yields with every tier you upgrade it, instead of +1 — so putting your craftsmen on your signature works pulls decisively ahead of a plain farm or mine.",
      },
      {
        tag: "Gameplay",
        title: "Coastal bounty waits on the right craft",
        desc:
          "Fisheries and Salt Pans now call for the Maritime Foraging technology before you can build them — and once you've researched a resource's unlocking tech, a city founded right on that resource reaps it automatically, with no improvement needed.",
      },
      {
        tag: "Gameplay",
        title: "Improve the land before you claim it",
        desc:
          "You can now lay roads and build tile improvements on unclaimed, neutral ground — prepare a route or a work site ahead of the settler that will one day annex it (defences and wonders still need your own territory). And a unit whose own civilization has learned Bridge Building can cross a bridged river even when the bridge sits on someone else's land.",
      },
      {
        tag: "Fix",
        title: "One breakthrough at a time",
        desc:
          "A vast surplus of science or culture no longer completes several technologies or civics in a single turn. The overflow now carries into your next research instead, so a windfall speeds you along rather than skipping whole rows of the tree at once.",
      },
      {
        tag: "Gameplay",
        title: "Rivals wield the new systems",
        desc:
          "The AI plays the expanded game. It raises its religion through the tiers, claims tier-fitting perks and musters its faith's unique holy units where they're needed; it prices units, cities and technologies far more shrewdly at the trade table — refusing to arm a civilization it distrusts except at a ransom and guarding its capital dearly; and a rival losing a war will now cede a besieged city (never its capital) to buy peace when the offer includes it.",
      },
    ],
  },
  {
    version: "0.3.1",
    date: "July 2026",
    changes: [
      {
        tag: "New",
        title: "Legends' signature powers are now real",
        desc:
          "Every one of the 29 heroes now carries a working, historically-rooted power. Combat legends field bespoke ability kits — Gilgamesh slays the beast, Boudica raises barbarian war-bands in revolt, Joan lifts the army with her sacred banner, Tamerlane's kills spread panic, Mehmed's great bombard outranges every engine. Support legends exert passive powers while they live: Mansa Musa floods your treasury, Qin Shi Huang walls every city, Sun Tzu drills the troops beside him, Pachacuti's roads carry your armies over rough ground.",
      },
      {
        tag: "New",
        title: "Legend wiki pages tell the history behind each power",
        desc:
          "Every hero's wiki page now lists its real battlefield abilities and a detailed write-up of the historical events the power is drawn from — Thermopylae, Lake Trasimene, the Horns of Hattin, the towers of skulls, the treasure fleets.",
      },
      {
        tag: "Gameplay",
        title: "Wonders are a real undertaking again",
        desc:
          "Wonders no longer snap into being the moment you have a couple of craftsmen. Each wonder now demands a whole crew — you must gather its entire workforce idle and ready (e.g. 11 Masons and 6 Architects for the Great Pyramid), pooled from across your cities, before you can even break ground. That crew is the wonder's whole workforce; no more may join, so you can't rush it by piling on bodies. And even fully crewed, raising a wonder is a long build of many turns — though a crew of veterans, who each work faster, finishes sooner.",
      },
      {
        tag: "New",
        title: "Wonders are unlocked, gated, and world-changing",
        desc:
          "Every wonder is now unlocked by a specific technology, costs a one-time outlay of gold, faith, or culture to begin, and can only be raised where its geography fits — the Pyramids and Sphinx in the desert, Tenochtitlán on a hill, the Colossus on the coast, the Great Lighthouse on coastal water, the Hanging Gardens by fresh water, the Oracle beside a mountain, Stonehenge within sight of one, and the Great Library beside one of your cities. Their yields are stronger across the board — and several now reshape the game itself. The Great Lighthouse gives all your ships +2 sight and +1 movement; the Colossus launches a free, upkeep-free warship from its harbour every six turns; the Oracle lets you rush production with faith; Tenochtitlán's causeways grant all your land units +1 movement; and the Great Pyramid rewards a great offering of faith whenever one of your Legends falls in battle or passes into legend.",
      },
      {
        tag: "Fix",
        title: "Honest hero descriptions",
        desc:
          "Legend ability descriptions previously promised effects that were not implemented; every description now states exactly what the hero does in play.",
      },
      {
        tag: "Fix",
        title: "Great People and Legends no longer overlap",
        desc:
          "Eight figures appeared in both systems (Sun Tzu, Hannibal, Julius Caesar, Belisarius, Subutai, Joan of Arc, Zheng He, Yi Sun-sin). Each person now lives in one system only: they remain Legends, and the Great General and Great Admiral rosters gained era-matched replacements — Epaminondas, Pyrrhus of Epirus, Gaius Marius, Charles Martel, Baibars, Bertrand du Guesclin, Andrea Doria and Francis Drake — each with a freshly painted portrait.",
      },
    ],
  },
  {
    version: "0.3.0",
    date: "July 2026",
    changes: [
      {
        tag: "New",
        title: "A wave of new unique unit abilities",
        desc:
          "Dozens of civilizations across every region now have bespoke unique unit abilities that didn't exist before, giving their signature units distinct tricks in combat instead of generic bonuses.",
      },
      {
        tag: "Balance",
        title: "Civilizations rebalanced across the board",
        desc:
          "We went through all 137 civilizations and rebalanced their bonuses using a new power-budget scoring tool, smoothing out outliers so no civilization is left far ahead of or behind the pack.",
      },
      {
        tag: "New",
        title: "Roads get their own look",
        desc:
          "Roads now render with dedicated artwork instead of a placeholder, making trade routes and empire infrastructure easier to read on the map.",
      },
      {
        tag: "Gameplay",
        title: "Trade and diplomacy improvements",
        desc:
          "Trade routes and diplomatic dealings between civilizations have been reworked and expanded, with new tests covering the updated behavior.",
      },
    ],
  },
  {
    version: "0.2.2",
    date: "June 2026",
    changes: [
      {
        tag: "New",
        title: "Rivals play to win",
        desc:
          "The AI no longer just grows and hopes for the best — it picks the victory best suited to its temperament and drives for it. A builder pours its wonders, buildings and research into science or culture; a merchant prince courts open borders to open lucrative international trade routes and out-commerce the field; a zealot founds a faith and sends missionaries across the world to convert rival cities; and a warmonger that spots a beatable neighbour declares war and marches on its capital. Left alone, rivals will now actually win by science, culture, religion, economy or conquest — not merely run up the score.",
      },
      {
        tag: "Gameplay",
        title: "Rivals expand like they mean it",
        desc:
          "Rival civilizations settle far harder and faster. A new empire opens by hurrying a settler out of its capital for a quick, safe second city, then keeps planting new cities from every settlement that's out of harm's way — even while a distant frontier town is being raided. (Before, a single wandering barbarian near any one city could freeze an entire empire's expansion.) Expect the map to fill with rivals' borders much sooner.",
      },
      {
        tag: "Fix",
        title: "Embarking out to sea needs Sailing",
        desc:
          "Land units can no longer stroll onto the water before their civilization has researched Sailing — the tech that unlocks coastal embarkation. The AI is held to the same rule, so rival armies and settlers stay ashore until they've earned their sea legs.",
      },
      {
        tag: "Fix",
        title: "Foreign borders are borders",
        desc:
          "Slipping a unit into another civilization's territory at peace is an act of war — and now that holds for everyone. The AI no longer wanders across borders uninvited; it routes around foreign land unless it has open borders or has declared war. And when a city's culture expands its borders around someone else's unit, that unit is escorted out to the nearest open ground rather than left camped on land it has no right to — unless the two of you have open borders.",
      },
    ],
  },
  {
    version: "0.2.1",
    date: "June 2026",
    changes: [
      {
        tag: "Gameplay",
        title: "Rivals stop feeding their settlers to barbarians",
        desc:
          "The AI no longer marches defenceless settlers straight into raiders. It now scouts a safe place to found, preferring clear ground over slightly better land that sits in harm's way, and sends a soldier along to guard any settler that must cross dangerous country. A settler caught near a raider founds on the spot if it can, or falls back toward a friendly city until the coast clears — so rivals actually plant the sprawling empires they set out to build.",
      },
      {
        tag: "Gameplay",
        title: "The AI works the wilds — villages and barbarian camps",
        desc:
          "Rival civilizations now make the map pay. Scouts divert to claim the tribal villages they've discovered for their free rewards, and armies march on known barbarian camps to clear them — pocketing the gold and shutting off the raider spawns at the source instead of chasing one war-band across the map.",
      },
      {
        tag: "New",
        title: "Rivals parley with the barbarians",
        desc:
          "With the Parley tech in hand, the AI now deals with raiders the way you can: recruiting a war-band straight into its army when it needs bodies fast or the unit is a battle-hardened bargain, or buying a truce when raiders are pressing it — always keeping enough gold in the treasury that parley never bankrupts it.",
      },
      {
        tag: "Balance",
        title: "Rushing costs more — and a rushing spree costs much more",
        desc:
          "Hurrying things with gold, faith or culture is meaningfully pricier now, and settlers in particular cost a premium to rush. On top of that, every rush you make raises the price of the next one for a few turns: a single splurge is fine, but rushing several things back-to-back climbs steeply before cooling back down once you let the spree rest. The AI plays by the same rules, and spends its surplus far more readily.",
      },
      {
        tag: "Gameplay",
        title: "Roads come in three grades",
        desc:
          "Every road no longer moves troops at the same speed. A humble Dirt Road already beats open ground, a Paved Road roughly halves the cost of crossing a tile, and an Imperial highway lets armies all but glide along it. The tile panel now tells you exactly which grade a road is and how much of a move it takes to cross.",
      },
      {
        tag: "Balance",
        title: "Rivers enrich the land they cross",
        desc:
          "A river running through a tile now adds food to whatever a citizen works there — and a river lake waters fresh ideas with extra science. River-loving civilization and leader perks now correctly count a riverside tile as fresh water, too.",
      },
      {
        tag: "UI",
        title: "See a tile improvement's payoff before you build it",
        desc:
          "Build buttons for tile works now show a compact yield preview beneath the name — the food, production, gold, science or faith you'll gain, and the resource it would activate — so you can weigh a Fishery against Salt Pans at a glance. Pastures, Plantations, Camps and Fishing Boats are now on the build menu as well, so resources like cattle, wine, deer and fish can finally be improved.",
      },
      {
        tag: "UI",
        title: "Cast abilities without opening the panel",
        desc:
          "The compact unit bar now carries icon-only quick-cast buttons for a unit's abilities — and a one-tap Found City for settlers — so you can fire them straight from the collapsed panel without expanding it first.",
      },
      {
        tag: "Gameplay",
        title: "Public works need a free craftsman to start",
        desc:
          "Starting a tile work or wonder now requires an idle specialist of each craft it needs, ready to put on the job. If every mason or carpenter is busy elsewhere the option shows as locked until one frees up, so you can no longer queue works that would sit forever with no one to build them.",
      },
      {
        tag: "Fix",
        title: "No more black strip below the map on mobile",
        desc:
          "On phones, the map now fills the whole screen as the browser's toolbar slides in and out, instead of leaving a black band along the bottom.",
      },
      {
        tag: "Fix",
        title: "Unique units called by their proper names",
        desc:
          "Combat reports, leader-ability descriptions and the civilization picker now name a civ's unique unit instead of the generic one — your Minoan Biremes, Mycenaean Spearmen and Chola Warships read as themselves, and the lobby shows the unique units you field from turn one.",
      },
    ],
  },
  {
    version: "0.2.0",
    date: "June 2026",
    changes: [
      {
        tag: "New",
        title: "Four new ways to win",
        desc:
          "Conquest is no longer the only road to victory. Win by SCIENCE — master the entire technology tree and then circumnavigate the globe, the great feat of the age. Win by CULTURE — let your wonders, Great Works and cultural splendour make your civilization the envy of every rival. Win by RELIGION — convert the whole world to your faith. Or win by ECONOMY — build a trading empire whose commercial might towers over everyone else's.",
      },
      {
        tag: "New",
        title: "Choose how a game can be won",
        desc:
          "When you create a game — single-player or multiplayer — you now pick exactly which victory conditions are in play. Turn off the ones you don't want; in multiplayer the host decides and everyone sees the rules before the match begins. Highest score at the turn limit, and last civilization standing, always apply.",
      },
      {
        tag: "UI",
        title: "Track every road to victory",
        desc:
          "A new 🏆 Victory panel shows, at a glance, how close you stand on each enabled win condition — civilizations converted, technologies and your circumnavigation voyage, cultural influence, mercantile power and your running score — so you always know which path is within reach.",
      },
      {
        tag: "New",
        title: "Spread your faith with Missionaries, Apostles & Inquisitors",
        desc:
          "Religion now spreads by pressure that builds and fades across cities, and follows the trade roads in both directions. Spend faith to ordain religious units: Missionaries flood a city with your religion, Apostles evangelize and defend it, and Inquisitors purge rival faiths from your own cities. A religious unit standing in a trade-route city can even ride the caravan road to emerge at the far end in a fraction of the time.",
      },
      {
        tag: "New",
        title: "Trade with the world — and across the oceans",
        desc:
          "Trade routes are no longer limited to your own cities. With open borders or an alliance you can open lucrative international routes to another civilization, and routes that cross the sea earn a further premium — the spice lanes of the age. International routes are drawn in teal on the map to set them apart, and a route severs the moment war breaks out.",
      },
      {
        tag: "New",
        title: "Trade technologies, cities and even soldiers",
        desc:
          "The diplomacy table now lets you trade far more than gold and luxuries. Hand over (or buy) a technology, cede a city in a peace deal, and sell or lend a unit — a lent unit fights for its borrower and returns to you when the loan ends. The AI values each fairly and guards the techs that would arm a rival against it.",
      },
      {
        tag: "New",
        title: "Banks, Museums and Great Works",
        desc:
          "Two new buildings deepen your economy and culture: the Bank pours out gold and the Museum houses your culture. And a Great Artist now leaves behind a lasting Great Work in one of your cities — an enduring treasure that radiates culture and renown for the rest of the game.",
      },
      {
        tag: "Gameplay",
        title: "A far stronger opponent",
        desc:
          "Rival civilizations now play a much sharper game. They expand boldly — founding cities across the map instead of stopping at a handful — develop their economy and research with real purpose, build the new banks, museums and trade routes, reach out for international commerce, send missionaries to grow their faith, and put their treasury to work hurrying construction instead of letting gold pile up. Expect to be genuinely contested for the map.",
      },
      {
        tag: "UI",
        title: "Encyclopedia covers the new systems",
        desc:
          "The in-game Encyclopedia's Victory and Religion pages have been rewritten to explain all four new victory conditions, the religious-pressure model, and the new Missionaries, Apostles and Inquisitors — and the new religious units now appear on the Units page.",
      },
    ],
  },
  {
    version: "0.1.1",
    date: "June 2026",
    changes: [
      {
        tag: "New",
        title: "A living Encyclopedia",
        desc:
          "Click into any civilization, unit, great person or legend to open a dedicated page that repeats all its stats and adds a historical note on its origin and back story. Civilization pages also explain the real history behind their ability and bonuses, and show clickable cards for their unique unit and unique building that you can drill into for more — with a Back button to step out again.",
      },
      {
        tag: "New",
        title: "Hundreds of historical write-ups",
        desc:
          "Every one of the 137 civilizations, their unique units and buildings, every base unit, great person and legend now carries an extensive, hand-written historical note — the story of who they were, where their powers came from, and why they mattered.",
      },
      {
        tag: "New",
        title: "See where history happened",
        desc:
          "Each civilization's Encyclopedia page now includes a world map marking the historical homeland where that people arose, from Lower Mesopotamia to the Andes to the islands of the Pacific.",
      },
      {
        tag: "UI",
        title: "Jump to the Encyclopedia from anywhere",
        desc:
          "A new 📖 button on the selected-unit panel, the Great People and Legends panels, and the Leaderboard takes you straight to that unit, hero, figure or civilization's Encyclopedia page.",
      },
      {
        tag: "UI",
        title: "Civilizations grouped by region",
        desc:
          "The Encyclopedia's Civilizations page is now organised into regional sections — the Near East, Europe, Africa, Asia, the steppe, the Americas and Oceania — so it is far easier to browse all 137 peoples.",
      },
    ],
  },
  {
    version: "0.1.0",
    date: "June 2026",
    changes: [
      {
        tag: "New",
        title: "Train armies from dedicated military buildings",
        desc:
          "Units are no longer built on the same queue as everything else. To raise an army you now construct the training building for each unit class — a Barracks for infantry, an Archery Range for ranged troops, a Stable for cavalry, a Siege Workshop for engines and a Shipyard for ships — then train units there. Every building has five tiers that train faster, muster steadier and more experienced recruits, and let you train several units at once.",
      },
      {
        tag: "Gameplay",
        title: "Every soldier is a citizen",
        desc:
          "Training a unit now costs one population — a citizen leaves the fields to take up arms. Construction is reserved for buildings, wonders and projects, so the real limit on your army is food and growth, not hammers. Settlers, traders and scouts likewise cost a citizen and are trained from the city centre.",
      },
      {
        tag: "Balance",
        title: "A richer food economy",
        desc:
          "With population now feeding your armies, the land feeds harder: grassland, lakes, wetlands and coasts yield more food, granaries and farms are more generous, cities grow faster, and every new city is founded at population 2 — or 3 for fertile river civilizations.",
      },
      {
        tag: "Gameplay",
        title: "Civilizations begin in character",
        desc:
          "Each civ now starts with an army drawn from its identity. A people whose unique unit is a bowman — Aragon's Almogàver, Babylon's Bowman, Nubia's archers — opens with ranged troops; mounted and seafaring nations bring extra scouts; and fertile river valleys found their capital a citizen larger. The civilization picker now lists each civ's exact starting units and capital size.",
      },
      {
        tag: "Balance",
        title: "All 137 civilizations rebalanced",
        desc:
          "Every civilization was re-tuned for the new economy. Production-for-war bonuses became training advantages (Assyria's war machine, Hungary's professional Black Army, the Tarascan metalsmiths), fertile and monastic peoples now lean into food and faith, and a handful of unique abilities that quietly never did anything were replaced with effects that actually work.",
      },
      {
        tag: "UI",
        title: "New training screen and military-building art",
        desc:
          "A new Train Units panel on every city shows its military buildings, how many units they can train at once, recruits in progress (with the option to cancel or rush them), and a clear free-citizen count — all with freshly painted art for the Barracks, Archery Range, Stable, Siege Workshop and Shipyard.",
      },
    ],
  },
  {
    version: "0.04",
    date: "June 2026",
    changes: [
      {
        tag: "New",
        title: "Rush production with gold — or faith and culture",
        desc:
          "Impatient? You can now spend your treasury to finish a city's current build or a tile/wonder work immediately, paying per unit of work remaining. Gold always works; the new Corvée policy lets you rush with culture, and the Labor of Devotion belief lets you rush with faith — both a little cheaper than coin.",
      },
      {
        tag: "Gameplay",
        title: "Staff public works with individual craftsmen",
        desc:
          "Wonders and tile works are no longer powered by whole cities — you now assign specific craftsmen to them, and each works one project at a time. Start a work as soon as you've researched the right craft (you can staff it later), watch a turns-to-complete estimate, and pull crews onto whatever matters most right now.",
      },
      {
        tag: "Gameplay",
        title: "Wonders are within reach",
        desc:
          "Every ancient wonder costs roughly 40% less labour to raise, so a focused city can realistically complete one in the Ancient Era instead of toiling for an age.",
      },
      {
        tag: "Gameplay",
        title: "A far sharper opponent",
        desc:
          "Rival civilizations now play to win: they march armies onto your cities instead of skirmishing, cross the sea to reach island foes, garrison cities under threat, pull wounded units back to heal, beeline military tech when at war, settle genuinely good land, pick wonders and policies that suit their character, and splurge gold or faith to rush a wonder they're racing you for.",
      },
      {
        tag: "Gameplay",
        title: "Smarter, less repetitive diplomacy",
        desc:
          "AI civs now answer a lopsided trade with a fair counter-offer instead of a flat refusal, and they stop pestering you with the same deal — or the same peace plea — turn after turn. They also only declare wars they can actually prosecute, and commit to a single best target rather than picking a fight with the whole world at once.",
      },
      {
        tag: "Gameplay",
        title: "Barbarians burn your economy",
        desc:
          "Raiders no longer only hunt your units and cities — they now pillage farms, mines and roads and plunder trade routes running through their reach, so an unguarded frontier bleeds yields fast.",
      },
      {
        tag: "New",
        title: "Disband a trade route",
        desc:
          "You can now close one of your own trade routes — handy when raiders keep plundering it. The trader that opened the route is lost and there's no refund, so choose your moment.",
      },
      {
        tag: "New",
        title: "Richer village rewards",
        desc:
          "Goody huts can now bless you with a stockpile of faith or teach your people progress toward the civic you're studying. A gifted citizen now goes straight to work the best free tile, and scouts (who carry no morale) reroll a morale gift into something they can actually use.",
      },
      {
        tag: "UI",
        title: "Construction sites on the map",
        desc:
          "Tiles with a work under way now show an under-construction sprite — distinct for economic improvements, defences and wonders — so you can see at a glance where your craftsmen are busy.",
      },
      {
        tag: "UI",
        title: "See exactly what a Great Person will do",
        desc:
          "Activating a Great Person now previews the precise effect first — how much science, gold or production you'll gain, which city it lands in, or how many units get promoted or healed — so there are no surprises.",
      },
      {
        tag: "Fix",
        title: "Occupied tiles stop paying out",
        desc:
          "An enemy or barbarian standing on one of your worked tiles now blocks it — your citizens won't venture out under a hostile occupation, so a besieging army actually chokes the city it surrounds.",
      },
      {
        tag: "Fix",
        title: "Truly unlimited games",
        desc:
          "Setting no turn limit now means the game never ends on a score countdown — it runs until someone wins by a decisive condition (conquest, religion, and so on).",
      },
    ],
  },
  {
    version: "0.03",
    date: "June 2026",
    changes: [
      {
        tag: "Gameplay",
        title: "Scouts reworked into true explorers",
        desc:
          "Scouts no longer carry morale. They now grow by surviving attacks and by discovery — being the one to find villages, barbarian camps, natural wonders and new civilizations earns them experience. Their promotions are all reconnaissance now (sight, mobility, survival, defence), capped by a new Escape line: a rising chance — 50%, 75%, then 95% — to dodge an attack and slip back a tile unharmed, once per turn.",
      },
      {
        tag: "New",
        title: "Tech tree highlights your civilization's unique unlocks",
        desc:
          "The full tech tree now marks the technologies that unlock your civ's unique unit, unique building and leader ability — sometimes three different techs — and labels them with your unique's proper name instead of the generic one, so you can beeline what makes your civ special.",
      },
      {
        tag: "UI",
        title: "Cleaner unit info on mobile",
        desc:
          "On phones the unit panel now opens as a compact bar showing just the unit's name, strength and health, tucked in just above the toolbar so it no longer swallows the screen. Tap it to expand the full details, tap again to collapse.",
      },
      {
        tag: "UI",
        title: "Clearer tile yields when managing a city",
        desc:
          "Selecting a city now shows each workable tile's yields centred on the tile as a colour-coded label (food, production, gold, science), drawn on top so the city's name can no longer hide the tiles around it. Worked tiles are marked with a gold ring.",
      },
      {
        tag: "Fix",
        title: "Unit strength and movement now reflect civ bonuses",
        desc:
          "The unit info window showed only base stats. Combat strength now includes your civilization's class bonuses and unique-unit bonuses, and movement reflects civ movement perks — so a +2-melee civ's Warrior reads 10, not 8, matching what actually happens in battle.",
      },
      {
        tag: "Fix",
        title: "Military pay boosts are no longer free",
        desc:
          "Paying your army extra to lift morale now costs a minimum each turn — 10, 20, 30 or 40 gold at +50%, +100%, +150% and +200% — even when you have few or no units. Previously a large army-pay morale boost could cost nothing at all.",
      },
    ],
  },
  {
    version: "0.02",
    date: "June 2026",
    changes: [
      {
        tag: "New",
        title: "Turn idle labour into wealth, knowledge & more",
        desc:
          "A city with nothing it wants to build can now run a standing project that converts its production each turn. Coinage mints production into gold and is always available; once you research the right institutions you can also direct a city's labour into Scholarship (science), Patronage (culture) or Tithe (faith). No more wasting turns on units you don't need.",
      },
    ],
  },
  {
    version: "0.01",
    date: "June 2026",
    changes: [
      {
        tag: "Gameplay",
        title: "Reworked barbarians",
        desc:
          "Barbarian strength now scales with map size — no more near-empty giant maps. Camps keep raising war-bands with no global cap, and fresh camps emerge over time out in the fog of war, so clearing one eventually invites another to rise elsewhere.",
      },
      {
        tag: "New",
        title: "Bug reporting",
        desc:
          "You can now report a bug from inside the game. Your report carries a snapshot of the current game, so problems can be reproduced and fixed far faster.",
      },
    ],
  },
];

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

export function createChangelog(): { open(): void; close(): void } {
  const root = document.createElement("div");
  root.id = "changelog";
  root.className = "hidden";
  root.innerHTML = `
    <div class="changelog-shell">
      <div class="changelog-header">
        <div class="changelog-heading">
          <div class="changelog-title">What's New</div>
          <div class="changelog-subtitle">Recent changes to Rise of Civilizations.</div>
        </div>
        <button class="changelog-close" id="changelog-close" aria-label="Close">✕</button>
      </div>
      <div class="changelog-list">
        ${CHANGELOG.map(
          (r) => `
          <div class="changelog-release">
            <div class="changelog-release-head">
              <span class="changelog-version">v${escapeHtml(r.version)}</span>
              ${r.date ? `<span class="changelog-date">${escapeHtml(r.date)}</span>` : ""}
            </div>
            <div class="changelog-changes">
              ${r.changes
                .map(
                  (c) => `
                <div class="changelog-item">
                  <div class="changelog-item-top">
                    <span class="changelog-badge">${escapeHtml(c.tag)}</span>
                    <span class="changelog-item-title">${escapeHtml(c.title)}</span>
                  </div>
                  <div class="changelog-item-desc">${escapeHtml(c.desc)}</div>
                </div>`,
                )
                .join("")}
            </div>
          </div>`,
        ).join("")}
      </div>
    </div>`;

  const style = document.createElement("style");
  style.textContent = `
    #changelog{position:fixed;inset:0;z-index:60;background:rgba(15,14,11,.94);backdrop-filter:blur(10px);display:flex;align-items:stretch;justify-content:center;overflow:auto}
    #changelog.hidden{display:none !important}
    .changelog-shell{display:flex;flex-direction:column;width:min(640px,100%);margin:auto;min-height:100%;padding:max(28px,env(safe-area-inset-top)) max(24px,env(safe-area-inset-right)) max(28px,env(safe-area-inset-bottom)) max(24px,env(safe-area-inset-left))}
    .changelog-header{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex:none}
    .changelog-title{font-family:'Cinzel',Georgia,serif;font-size:30px;font-weight:800;color:#e8dcc5;letter-spacing:.5px}
    .changelog-subtitle{color:#b8aa8d;font-size:14px;margin-top:6px;max-width:460px;line-height:1.5}
    .changelog-close{flex:0 0 auto;width:38px;height:38px;border-radius:10px;border:1px solid var(--edge);background:transparent;color:#e8dcc5;cursor:pointer;font-size:16px;line-height:1;transition:background .12s,border-color .12s,color .12s}
    .changelog-close:hover{background:rgba(201,162,39,.14);border-color:#c9a227;color:#f0d878}
    .changelog-list{flex:1;display:flex;flex-direction:column;gap:26px;margin-top:26px}
    .changelog-release-head{display:flex;align-items:baseline;gap:12px;padding-bottom:10px;border-bottom:1px solid var(--edge)}
    .changelog-version{font-family:'Cinzel',Georgia,serif;font-size:20px;font-weight:800;color:#f0d878}
    .changelog-date{color:#b8aa8d;font-size:12.5px;text-transform:uppercase;letter-spacing:.06em}
    .changelog-changes{display:flex;flex-direction:column;gap:12px;margin-top:14px}
    .changelog-item{padding:16px 18px;background:#1f1c14;border:1px solid var(--edge);border-radius:14px}
    .changelog-item-top{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
    .changelog-badge{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#15120c;background:linear-gradient(135deg,#c9a227,#a6821f);border-radius:999px;padding:3px 9px}
    .changelog-item-title{font-family:'Cinzel',Georgia,serif;font-size:17px;font-weight:700;color:#e8dcc5}
    .changelog-item-desc{color:#b8aa8d;font-size:13.5px;line-height:1.5;margin-top:7px}
    @media(max-width:640px){
      .changelog-title{font-size:24px}
      .changelog-item{padding:14px}
    }`;

  document.head.appendChild(style);
  document.body.appendChild(root);

  const doClose = (): void => {
    root.classList.add("hidden");
  };
  root.querySelector<HTMLButtonElement>("#changelog-close")!.addEventListener("click", doClose);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !root.classList.contains("hidden")) doClose();
  });

  return {
    open() {
      root.classList.remove("hidden");
    },
    close: doClose,
  };
}
