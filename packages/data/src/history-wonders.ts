// Expanded historical write-ups for the world wonders players can raise and the
// natural wonders they can chart. Pure flavour, dependency-free.
//
// Keyed by wonder id (WONDER_DEFS) and natural wonder id (NATURAL_WONDER_DEFS).

export const WONDER_HISTORY: Record<string, string> = {
  great_pyramid:
    "Raised at Giza for the pharaoh Khufu around 2560 BC, the Great Pyramid stood as the tallest structure on Earth for nearly four thousand years, a mountain of some two million limestone blocks laid with a precision that still defies easy explanation. It is the only one of the seven classical wonders still standing, and the effort of building it, quarrying, hauling, feeding and organising a workforce for decades, arguably did as much to forge the Egyptian state as it did to honour a king.",
  hanging_gardens:
    "The Hanging Gardens of Babylon were described by Greek writers as a mountain of terraced greenery rising in tiers above the plain, watered by an ingenious system of screws and chains that lifted the Euphrates to the topmost garden. Tradition holds that Nebuchadnezzar II built them to console a queen who pined for the green hills of her homeland, though no trace has ever been found, and the gardens remain the one classical wonder whose very existence is still argued over.",
  great_library:
    "The Library of Alexandria was the ancient world's boldest project: to gather a copy of every book ever written under one roof. Ships docking in the harbour were searched for scrolls, which were copied and the originals kept. At its height it held hundreds of thousands of works and drew scholars like Euclid and Eratosthenes, who measured the circumference of the Earth from a well and a shadow.",
  colossus:
    "The Colossus of Rhodes was a bronze statue of the sun-god Helios, some thirty metres tall, raised over the harbour to celebrate the island's survival of a long siege. The Rhodians melted down the abandoned siege engines of their enemies to make it. It stood for barely fifty years before an earthquake snapped it at the knees, yet the fallen bronze lay so impressive that visitors travelled for centuries just to see the wreck.",
  great_lighthouse:
    "The Pharos of Alexandria rose more than a hundred metres above its island, its fire and polished bronze mirror throwing a beacon far out to sea and guiding ships safely into Egypt's greatest port. It was among the tallest human-made structures in the world for centuries, and it gave its name to lighthouses in half a dozen languages before earthquakes finally brought it down.",
  sphinx:
    "The Great Sphinx of Giza, a lion's body with a human face, was carved from a single ridge of bedrock and has watched the eastern horizon for some four and a half thousand years. It was already so ancient by the time of the New Kingdom that pharaohs dug it out of the sand and restored it as a relic of a lost age, and its missing nose and eroded flanks have kept scholars arguing ever since.",
  stonehenge:
    "Stonehenge was raised on Salisbury Plain over some fifteen hundred years, its bluestones hauled from Welsh mountains nearly two hundred miles away by people with no wheel, no iron and no draught animals. Its great sarsen ring is aligned on the midsummer sunrise and the midwinter sunset, making it at once a temple, a monument to the dead and an instrument for reading the turning year.",
  oracle:
    "The Oracle of Delphi was the most consulted voice in the Greek world, where the Pythia sat above a cleft in the rock and delivered the god Apollo's answers in riddles that kings and cities staked their futures on. Delphi was held to be the navel of the world, and no colony was founded and no war lightly begun without first asking what the god had to say.",
  tenochtitlan:
    "Tenochtitlan was built on an island in Lake Texcoco, a city of canals, causeways and floating chinampa gardens that fed perhaps two hundred thousand people, larger than any city in Europe at the time. The Spaniards who first saw it from the mountains wrote that they wondered whether they were dreaming, so improbable was the sight of a white stone capital rising straight out of the water.",
};

export const NATURAL_WONDER_HISTORY: Record<string, string> = {
  mount_everest:
    "Everest is the highest point on the planet, its summit standing where the air holds barely a third of the oxygen found at sea level, in a zone where the human body simply begins to die. The rock at the very top is marine limestone, laid down on an ancient seabed and driven skyward by the slow collision of India with Asia, so the roof of the world is, quite literally, the floor of a vanished ocean.",
  mount_kilimanjaro:
    "Kilimanjaro rises alone out of the East African savanna, a solitary volcano so tall that a climber passes from tropical farmland through rainforest, heath and alpine desert to glaciers in the space of a few days, crossing what amounts to a journey from the equator to the poles. That it carries snow within sight of the equator made it a wonder that European geographers flatly refused to believe when it was first reported.",
  mount_fuji:
    "Fuji's near-perfect cone has been the most painted, most climbed and most venerated mountain in Japan for centuries, a sacred peak whose ascent was itself an act of worship and whose form became shorthand for the country. It is an active volcano, and its last eruption in 1707 dusted the streets of Edo, sixty miles away, with ash.",
  matterhorn:
    "The Matterhorn's four sheer faces rise to a horn so improbably sharp that it looks invented, carved by glaciers grinding away at the mountain from every side at once until only the blade in the middle was left. Its first ascent in 1865 ended in disaster on the descent when a rope broke and four men fell, a tragedy that made the peak famous across Europe overnight.",
  mount_vesuvius:
    "Vesuvius buried Pompeii and Herculaneum under ash and rock in AD 79, killing thousands, and in doing so sealed two Roman towns almost perfectly for seventeen centuries. What destroyed them also preserved them: loaves still in ovens, graffiti still on walls, and hollows in the ash that, filled with plaster, turn out to be the shapes of the dying. The volcano remains active, with millions now living in its shadow.",
  table_mountain:
    "Table Mountain's flat summit stands above the Cape like a wall, often draped in a spilling cloud that local tradition calls the tablecloth. It is one of the oldest mountains on Earth, far older than the Himalayas or the Alps, and its slopes hold a kingdom of plant life so distinct and so dense that a single mountain carries more species than many entire countries.",
  uluru:
    "Uluru rises abruptly from the flat red centre of Australia, a single mass of sandstone whose visible bulk is only the tip of a formation running kilometres underground. To the Anangu, its traditional owners, it is not scenery but scripture: every fissure, cave and stain on its flanks records the acts of ancestral beings, and the rock is read the way other cultures read a text.",
  mount_roraima:
    "Roraima is a tepui, a tabletop mountain whose sheer walls rise hundreds of metres to a plateau that has stood isolated for so long that much of the life on top is found nowhere else on Earth, marooned in the clouds. Its permanently misted summit, ringed by waterfalls that pour off the edge into nothing, gave Conan Doyle the setting for The Lost World.",
  eye_of_the_sahara:
    "The Richat Structure is a bullseye of concentric rock rings some forty kilometres across, so vast and so regular that it is far easier to see from orbit than from the ground, where it reads as nothing more than low ridges. Long thought to be an impact crater, it is now understood as a geological dome that rose and then eroded away, layer by layer, into a target visible from space.",
  grand_canyon:
    "The Colorado River has spent millions of years cutting a mile down through the Arizona plateau, exposing a wall of rock that steps back nearly two billion years into the planet's past. To walk from the rim to the river is to walk down through eras, past reefs and deserts and seabeds stacked one atop the next, and to reach stone at the bottom that was already ancient before complex life existed.",
  salar_de_uyuni:
    "Uyuni is the largest salt flat on Earth, the crust of a prehistoric lake that dried away and left ten billion tonnes of salt behind. It is so vast and so flat, varying by less than a metre across a hundred kilometres, that satellites use it to calibrate their instruments. When a shallow film of rain lies on it, the whole plain becomes a mirror and the horizon simply disappears.",
  zhangye_danxia:
    "The Danxia hills are banded in ochre, crimson and green, layers of sandstone and mineral laid down over millions of years, tilted on end by colliding plates and then stripped bare by wind and rain into ridges that look painted. The colours are simply iron and trace minerals oxidising at different rates, which does nothing to make the landscape look less deliberate.",
  cappadocia:
    "Volcanic ash settled across Cappadocia and hardened into soft tuff, which wind and water then carved into a forest of spires, cones and mushroom-capped pillars. Because the stone cuts easily but holds its shape, people spent centuries hollowing it out, digging churches, houses and entire underground cities many levels deep, where whole populations could vanish below ground and wait out an invasion.",
  pamukkale:
    "Hot mineral springs have been spilling down this hillside for millennia, depositing calcium carbonate that hardened into blinding white terraces filled with warm turquoise pools, a frozen cascade of stone. The Romans built the spa city of Hierapolis on top of it, and the sick came from across the empire to bathe in waters that were believed to heal.",
  sahara_dunes:
    "The Sahara is a desert the size of a continent, its dune seas rolling for hundreds of kilometres and its sands hiding riverbeds, fish fossils and rock paintings of cattle and swimmers, proof that it was green within human memory. It has swung between grassland and wasteland many times as the Earth wobbles on its axis, and it will be green again.",
  great_barrier_reef:
    "The Great Barrier Reef stretches more than two thousand kilometres along the Australian coast and is the largest structure on Earth built by living things, the accumulated skeletons of countless tiny coral polyps. It is visible from space, it shelters a staggering density of life, and the whole edifice is the work of animals a few millimetres across.",
  galapagos_islands:
    "Isolated a thousand kilometres out in the Pacific, the Galápagos filled with life that arrived by luck on driftwood and wind and then, cut off, went its own way: finches with different beaks on each island, tortoises with different shells, iguanas that learned to swim. It was here that a young naturalist noticed the pattern, and the islands quietly rearranged how we understand every living thing.",
  cliffs_of_dover:
    "The chalk cliffs at Dover are made of the compacted shells of untold trillions of microscopic sea creatures that drifted to the floor of a warm ocean over millions of years. Facing the narrowest point of the Channel, they have served as England's first landmark and last farewell for as long as people have crossed it, and their brilliant white face is simply what remains when the sea keeps cutting them fresh.",
  giants_causeway:
    "Forty thousand basalt columns, most of them hexagonal, step down into the northern sea like a paved road going nowhere. They formed as a thick lava flow cooled and contracted, cracking into a honeycomb with the same geometry that dries into mud flats. Irish tradition offers a better explanation: the giant Finn MacCool built it to cross to Scotland and settle an argument.",
  dead_sea:
    "The Dead Sea lies at the lowest exposed point on the planet, more than four hundred metres below sea level, in a rift with no outlet, so the water that flows in only leaves by evaporating and the salt it carries stays behind. It is nearly ten times saltier than the ocean, dense enough that a swimmer floats without effort and nothing larger than a microbe can live in it.",
  lake_baikal:
    "Baikal is the oldest and deepest lake on Earth, a rift more than a mile deep holding a fifth of all the unfrozen fresh water in the world, more than every Great Lake combined. It has been open water for twenty-five million years, long enough for its inhabitants to become unlike anything elsewhere, including the world's only exclusively freshwater seal.",
  niagara_falls:
    "Niagara is not the tallest waterfall, but few move more water: the outflow of four Great Lakes forced over a single ledge in a thunder that can be heard for miles. The falls are also visibly impermanent, chewing backwards upstream through soft rock at a rate measured in feet per year, and in geological terms they will one day eat their way to Lake Erie and drain it.",
  victoria_falls:
    "The Zambezi drops into a narrow chasm along a front more than a kilometre and a half wide, throwing up a column of spray visible from forty kilometres away and giving the falls their older name, Mosi-oa-Tunya, the Smoke That Thunders. Because the river falls into a slot rather than over a cliff, it forms the largest single sheet of falling water on the planet.",
  iguazu_falls:
    "Iguazú is not one waterfall but hundreds, spread in a vast jungle horseshoe where the river shatters over successive ledges into mist and rainbow, the whole thing loud enough to drown conversation. Its centrepiece, the Devil's Throat, is a chasm that swallows half the river at once. Eleanor Roosevelt, on seeing it, is said to have pitied Niagara.",
  angel_falls:
    "Water leaves the top of Auyán-tepui and falls almost a kilometre, so far that in the dry season much of it turns to mist before it ever reaches the ground. It is the tallest uninterrupted waterfall in the world, hidden deep in Venezuelan jungle, and it went unrecorded by outsiders until a bush pilot named Jimmie Angel spotted it from the air while hunting for gold.",
  plitvice_lakes:
    "Sixteen turquoise lakes descend in terraces, one spilling into the next over natural dams of travertine that the water itself is still building, grain by grain, as mineral precipitates onto moss and fallen wood. The barriers grow about a centimetre a year, which means the whole landscape is not a finished thing but a slow work in progress.",
  moraine_lake:
    "Moraine Lake is fed by glaciers that grind rock into a flour so fine it hangs suspended in the water, scattering light into a blue that photographs are routinely accused of faking. Ringed by ten peaks, it fills and colours with the summer melt, and its impossible shade is nothing more than powdered stone and physics.",
  amazon_rainforest:
    "The Amazon holds perhaps a tenth of all known species and generates so much of its own weather that the forest effectively waters itself, moisture rising and falling again and again as it crosses the basin in what has been called a flying river. Beneath the canopy lie the traces of large settled societies and soils they enriched, evidence that this wilderness has long been inhabited.",
  pantanal:
    "The Pantanal floods every wet season into the largest tropical wetland on Earth, an inland sea that then withdraws and concentrates its fish, caiman, capybara and jaguar into shrinking pools. That annual pulse of flood and drought is the engine of the place, and it makes the Pantanal the easiest landscape in the Americas to actually see wildlife in.",
  yosemite:
    "Glaciers gouged a river valley into a trough with walls of sheer granite, leaving El Capitan and Half Dome standing over meadows and groves of giant sequoias, among the largest living things that have ever existed. The valley became the argument that convinced a nation to set land aside for its own sake, and the seed of the whole idea of a national park.",
  zhangjiajie:
    "Thousands of quartzite sandstone pillars stand in a forest of their own, some hundreds of metres tall, their bases lost in cloud so that the columns appear to float unsupported. They were left behind as water and ice widened the cracks in a plateau until only the strongest cores remained standing, and the effect was startling enough to be borrowed wholesale for the floating mountains of Pandora.",
};

export const wonderHistory = (wonderId: string | undefined): string | undefined =>
  wonderId ? WONDER_HISTORY[wonderId] : undefined;

export const naturalWonderHistory = (wonderId: string | undefined): string | undefined =>
  wonderId ? NATURAL_WONDER_HISTORY[wonderId] : undefined;
