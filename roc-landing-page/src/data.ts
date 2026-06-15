export interface FeaturedCiv {
  id: string;
  name: string;
  leader: string;
  abilityName: string;
  abilityDesc: string;
  uniqueUnit: string;
  uniqueInfra: string;
  region: string;
  era: string;
}

export const FEATURED_CIVS: FeaturedCiv[] = [
  {
    id: 'sumer',
    name: 'Sumer',
    leader: 'Gilgamesh',
    abilityName: 'Epic Quest',
    abilityDesc: 'Early war-carts and extra rewards from clearing barbarian camps.',
    uniqueUnit: 'War-Cart',
    uniqueInfra: 'Ziggurat',
    region: 'Mesopotamia',
    era: 'Dawn Age',
  },
  {
    id: 'egypt',
    name: 'Egypt',
    leader: 'Hatshepsut',
    abilityName: 'Iteru',
    abilityDesc: '+20% production in all cities.',
    uniqueUnit: 'Maryannu Chariot',
    uniqueInfra: 'Sphinx',
    region: 'Nile Valley',
    era: 'Bronze Age',
  },
  {
    id: 'greece',
    name: 'Greece',
    leader: 'Pericles',
    abilityName: "Plato's Republic",
    abilityDesc: '+20% science; melee units +2 combat strength.',
    uniqueUnit: 'Hoplite',
    uniqueInfra: 'Acropolis',
    region: 'Mediterranean',
    era: 'Classical Age',
  },
  {
    id: 'persia',
    name: 'Persia',
    leader: 'Cyrus',
    abilityName: 'Satrapies',
    abilityDesc: '+20% gold; melee units +2 combat strength.',
    uniqueUnit: 'Immortal',
    uniqueInfra: 'Pairidaeza',
    region: 'Iran',
    era: 'Classical Age',
  },
  {
    id: 'rome',
    name: 'Rome',
    leader: 'Trajan',
    abilityName: 'All Roads Lead to Rome',
    abilityDesc: 'New cities are founded with a free Monument.',
    uniqueUnit: 'Legionary',
    uniqueInfra: 'Roman Bath',
    region: 'Europe',
    era: 'Classical Age',
  },
  {
    id: 'han_china',
    name: 'Han China',
    leader: 'Qin Shi Huang',
    abilityName: 'Dynastic Cycle',
    abilityDesc: '+15% production and +10% science.',
    uniqueUnit: 'Cho-Ko-Nu',
    uniqueInfra: 'Great Wall',
    region: 'East Asia',
    era: 'Classical Age',
  },
  {
    id: 'maurya',
    name: 'Maurya',
    leader: 'Ashoka',
    abilityName: 'Dharma',
    abilityDesc: '+20% food; cavalry (elephants) +2 combat strength.',
    uniqueUnit: 'War Elephant',
    uniqueInfra: 'Stepwell',
    region: 'South Asia',
    era: 'Classical Age',
  },
  {
    id: 'norse',
    name: 'Norse',
    leader: 'Harald Hardrada',
    abilityName: 'Knarr',
    abilityDesc: '+15% gold from raiding; melee units +2 combat strength.',
    uniqueUnit: 'Longship',
    uniqueInfra: 'Stave Church',
    region: 'Northern Europe',
    era: 'Medieval Age',
  },
  {
    id: 'japan',
    name: 'Japan',
    leader: 'Tokugawa',
    abilityName: 'Bushido',
    abilityDesc: 'Units fight at full strength even when damaged.',
    uniqueUnit: 'Samurai',
    uniqueInfra: 'Tenshu Castle',
    region: 'East Asia',
    era: 'Medieval Age',
  },
  {
    id: 'mongols',
    name: 'Mongols',
    leader: 'Genghis Khan',
    abilityName: 'Örtöö',
    abilityDesc: 'Cavalry +1 movement and +2 combat strength.',
    uniqueUnit: 'Keshig',
    uniqueInfra: 'Ordu',
    region: 'Central Asia',
    era: 'Medieval Age',
  },
  {
    id: 'aztec',
    name: 'Aztec',
    leader: 'Montezuma',
    abilityName: 'Legend of the Eagle',
    abilityDesc: 'Melee units +3 combat strength.',
    uniqueUnit: 'Eagle Warrior',
    uniqueInfra: 'Tlachtli',
    region: 'Mesoamerica',
    era: 'Medieval Age',
  },
  {
    id: 'inca',
    name: 'Inca',
    leader: 'Pachacuti',
    abilityName: "Mit'a",
    abilityDesc: 'Mountains become workable; terrace farms feed large cities.',
    uniqueUnit: "Warak'aq",
    uniqueInfra: 'Terrace Farm',
    region: 'Andes',
    era: 'Medieval Age',
  },
];

export const PILLARS = [
  {
    title: 'Explore',
    desc: 'Chart unknown lands, dispatch scouts, and reveal resources from wheat fields to iron mines.',
    asset: 'assets/units/scout.png',
  },
  {
    title: 'Expand',
    desc: 'Found cities across continents, claim territory, and build roads that bind your empire together.',
    asset: 'assets/units/settler.png',
  },
  {
    title: 'Exploit',
    desc: 'Assign citizens, improve tiles, trade luxuries, and balance food, production, gold, and science.',
    asset: 'assets/resources/wheat.png',
  },
  {
    title: 'Exterminate',
    desc: 'Wage tactical wars with unique units, promotions, and combined-arms combat across land and sea.',
    asset: 'assets/units/warrior.png',
  },
] as const;

export const ERAS = [
  { name: 'Stone / Dawn', years: '4000–3000 BCE', desc: 'First tribes, farms, and mud-brick cities.', terrain: 'plains' },
  { name: 'Bronze Age', years: '3000–1200 BCE', desc: 'Chariots, ziggurats, and the first empires.', terrain: 'desert' },
  { name: 'Iron / Classical', years: '1200 BCE–500 CE', desc: 'Legions, phalanxes, philosophy, and great roads.', terrain: 'grassland' },
  { name: 'Medieval / Faith', years: '500–1300 CE', desc: 'Knights, castles, samurai, and cathedrals.', terrain: 'forest' },
  { name: 'Exploration', years: '1300–1550 CE', desc: 'Caravels, gunpowder, printing, and global trade.', terrain: 'ocean' },
] as const;

export const ALL_LEADERS = [
  'akkad', 'aksum', 'anglo_saxon_england', 'assyria', 'ayutthaya_siam', 'aztec', 'babylon', 'byzantium',
  'carthage', 'castile_spain', 'celts_gauls', 'china_ming', 'china_tang_song', 'chola', 'dai_viet_vietnam',
  'dutch_republic', 'egypt', 'elam', 'ethiopia_zagwe', 'etruscans', 'france', 'franks', 'genoa',
  'ghana_empire', 'gokturks', 'goths', 'great_zimbabwe', 'greece', 'gupta_india', 'han_china', 'haudenosaunee',
  'hawaii', 'hittites', 'holy_roman_empire', 'hungary', 'huns', 'inca', 'japan', 'kanem_bornu', 'khmer',
  'kievan_rus', 'korea', 'kush_nubia', 'lydia', 'macedon', 'majapahit', 'mali', 'maori', 'maurya', 'maya',
  'median_empire', 'minoans', 'mississippian_cahokia', 'mongols', 'muisca', 'mycenaean_greece', 'norse',
  'olmec', 'ottomans', 'pagan_burma', 'parthia', 'persia', 'phoenicia', 'poland_lithuania', 'polynesia',
  'portugal', 'pueblo', 'rome', 'sassanid_persia', 'scythians', 'seljuks', 'songhai', 'sparta', 'srivijaya',
  'sumer', 'teotihuacan', 'tibet', 'timurids', 'toltec', 'venice', 'xiongnu', 'zapotec',
];
