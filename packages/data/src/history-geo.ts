// Approximate historical homeland of each civilization, for the Encyclopedia's
// stylized world map. Coordinates are rough lon/lat of the civ's heartland or
// capital (a single representative point), not precise borders. `place` is a
// short human label shown under the map. Keyed by civ id (see CIVILIZATIONS).

export interface CivLocation {
  /** Longitude in degrees, -180 (west) … 180 (east). */
  lon: number;
  /** Latitude in degrees, -90 (south) … 90 (north). */
  lat: number;
  /** Short label for the marked spot, e.g. "Lower Mesopotamia (Ur)". */
  place?: string;
}

export const CIV_LOCATION: Record<string, CivLocation> = {
  // Mesopotamia & the Near East
  sumer: { lon: 46, lat: 31, place: "Lower Mesopotamia (Ur, Uruk)" },
  akkad: { lon: 44, lat: 33, place: "Central Mesopotamia (Akkad)" },
  babylon: { lon: 44.4, lat: 32.5, place: "Babylon, on the Euphrates" },
  assyria: { lon: 43, lat: 36, place: "Upper Tigris (Nineveh, Assur)" },
  hittites: { lon: 34.6, lat: 40, place: "Central Anatolia (Hattusa)" },
  elam: { lon: 48.3, lat: 32, place: "Southwest Iran (Susa)" },
  phoenicia: { lon: 35.4, lat: 34, place: "Levantine coast (Tyre, Sidon)" },
  lydia: { lon: 28, lat: 38.5, place: "Western Anatolia (Sardis)" },

  // Persia & Iran
  median_empire: { lon: 48.5, lat: 34.8, place: "Western Iran (Ecbatana)" },
  persia: { lon: 52.9, lat: 29.9, place: "Fars, Iran (Persepolis)" },
  parthia: { lon: 54, lat: 36.5, place: "Northeastern Iran (Nisa)" },
  sassanid_persia: { lon: 44.6, lat: 33.1, place: "Mesopotamia (Ctesiphon)" },

  // Egypt & Africa
  egypt: { lon: 31.2, lat: 26, place: "The Nile Valley (Thebes, Memphis)" },
  kush_nubia: { lon: 33.7, lat: 16.9, place: "Nubia (Meroë), Sudan" },
  carthage: { lon: 10.3, lat: 36.8, place: "Carthage, North Africa" },
  aksum: { lon: 38.7, lat: 14.1, place: "Ethiopian highlands (Aksum)" },
  ethiopia_zagwe: { lon: 39, lat: 12, place: "Ethiopia (Lalibela)" },
  mali: { lon: -3, lat: 16.8, place: "Western Sahel (Timbuktu)" },
  ghana_empire: { lon: -7.5, lat: 15.8, place: "Western Sahel (Koumbi Saleh)" },
  songhai: { lon: 0, lat: 16.3, place: "Niger Bend (Gao)" },
  great_zimbabwe: { lon: 30.9, lat: -20.3, place: "Zimbabwe plateau" },
  kanem_bornu: { lon: 14, lat: 13, place: "Lake Chad basin" },

  // Mediterranean & Europe
  minoans: { lon: 25.1, lat: 35.3, place: "Crete (Knossos)" },
  mycenaean_greece: { lon: 22.7, lat: 37.7, place: "Peloponnese (Mycenae)" },
  greece: { lon: 23.7, lat: 38, place: "Attica (Athens)" },
  sparta: { lon: 22.4, lat: 37.1, place: "Laconia (Sparta)" },
  macedon: { lon: 22.5, lat: 40.8, place: "Macedon (Pella)" },
  etruscans: { lon: 11.8, lat: 43, place: "Tuscany, Italy" },
  rome: { lon: 12.5, lat: 41.9, place: "Rome, central Italy" },
  celts_gauls: { lon: 2.5, lat: 47, place: "Gaul (central France)" },
  byzantium: { lon: 29, lat: 41, place: "Constantinople" },
  norse: { lon: 10, lat: 60, place: "Scandinavia" },
  franks: { lon: 6.1, lat: 50.8, place: "Rhineland (Aachen)" },
  goths: { lon: 26, lat: 46, place: "Lower Danube" },
  anglo_saxon_england: { lon: -1.3, lat: 51.5, place: "Southern England (Winchester)" },
  france: { lon: 2.3, lat: 48.8, place: "Île-de-France (Paris)" },
  castile_spain: { lon: -3.7, lat: 40.2, place: "Central Iberia (Toledo, Madrid)" },
  portugal: { lon: -9.1, lat: 38.7, place: "Lisbon, Atlantic Iberia" },
  venice: { lon: 12.3, lat: 45.4, place: "Venice, the Adriatic" },
  genoa: { lon: 8.9, lat: 44.4, place: "Genoa, Ligurian coast" },
  dutch_republic: { lon: 4.9, lat: 52.4, place: "The Low Countries (Amsterdam)" },
  holy_roman_empire: { lon: 8.7, lat: 50.1, place: "Central Germany (Frankfurt)" },
  kievan_rus: { lon: 30.5, lat: 50.4, place: "Kyiv, on the Dnieper" },
  poland_lithuania: { lon: 19.9, lat: 50.1, place: "Kraków & the Vistula" },
  hungary: { lon: 19, lat: 47.5, place: "Carpathian Basin (Buda)" },

  // Central, South & East Asia
  han_china: { lon: 108.9, lat: 34.3, place: "Wei valley (Chang'an)" },
  china_tang_song: { lon: 114.3, lat: 34.8, place: "Central Plain (Kaifeng, Luoyang)" },
  china_ming: { lon: 116.4, lat: 39.9, place: "Beijing & Nanjing" },
  maurya: { lon: 85.1, lat: 25.6, place: "Ganges plain (Pataliputra)" },
  gupta_india: { lon: 85.1, lat: 25.6, place: "Ganges plain (Pataliputra)" },
  chola: { lon: 79.1, lat: 10.8, place: "Tamil coast (Thanjavur)" },
  japan: { lon: 138, lat: 36, place: "Central Honshū (Kyoto, Edo)" },
  korea: { lon: 127, lat: 37.5, place: "Korean peninsula (Kaesong)" },
  tibet: { lon: 91.1, lat: 29.6, place: "Tibetan Plateau (Lhasa)" },
  dai_viet_vietnam: { lon: 105.8, lat: 21, place: "Red River delta (Hanoi)" },
  khmer: { lon: 103.9, lat: 13.4, place: "Cambodia (Angkor)" },
  srivijaya: { lon: 104.8, lat: -3, place: "Sumatra (Palembang)" },
  majapahit: { lon: 112.4, lat: -7.5, place: "East Java" },
  pagan_burma: { lon: 94.9, lat: 21.2, place: "Central Burma (Bagan)" },
  ayutthaya_siam: { lon: 100.6, lat: 14.4, place: "Chao Phraya basin (Ayutthaya)" },

  // Steppe & Turkic
  scythians: { lon: 34, lat: 48, place: "Pontic-Caspian steppe" },
  xiongnu: { lon: 105, lat: 47, place: "Mongolian steppe" },
  huns: { lon: 20, lat: 47, place: "Pannonian plain" },
  gokturks: { lon: 101, lat: 47, place: "Orkhon valley, Mongolia" },
  seljuks: { lon: 48, lat: 36, place: "Iran & eastern Anatolia" },
  mongols: { lon: 102.8, lat: 47.2, place: "Mongolia (Karakorum)" },
  timurids: { lon: 66.9, lat: 39.7, place: "Transoxiana (Samarkand)" },
  ottomans: { lon: 29, lat: 40.2, place: "Northwest Anatolia (Bursa)" },

  // The Americas
  olmec: { lon: -94, lat: 18, place: "Gulf coast of Mexico" },
  maya: { lon: -89.6, lat: 17.2, place: "Yucatán & Petén" },
  zapotec: { lon: -96.7, lat: 17, place: "Oaxaca (Monte Albán)" },
  teotihuacan: { lon: -98.8, lat: 19.7, place: "Valley of Mexico" },
  toltec: { lon: -99.3, lat: 20.1, place: "Central Mexico (Tula)" },
  aztec: { lon: -99.1, lat: 19.4, place: "Valley of Mexico (Tenochtitlan)" },
  inca: { lon: -72, lat: -13.5, place: "Peruvian Andes (Cusco)" },
  muisca: { lon: -74.1, lat: 4.6, place: "Colombian highlands (Bogotá)" },
  mississippian_cahokia: { lon: -90.1, lat: 38.7, place: "Mississippi valley (Cahokia)" },
  haudenosaunee: { lon: -76, lat: 43, place: "Northeastern woodlands (NY)" },
  pueblo: { lon: -108.5, lat: 37.2, place: "American Southwest (Mesa Verde)" },

  // Oceania
  polynesia: { lon: -150, lat: -17.5, place: "Central Pacific (Tahiti)" },
  maori: { lon: 174.8, lat: -41, place: "Aotearoa (New Zealand)" },
  hawaii: { lon: -155.5, lat: 19.6, place: "Hawaiian Islands" },

  // Expansion roster
  arabia: { lon: 44.4, lat: 33.3, place: "Abbasid Baghdad / Arabia" },
  israelites: { lon: 35.2, lat: 31.8, place: "Judea (Jerusalem)" },
  nabataeans: { lon: 35.4, lat: 30.3, place: "Petra, Jordan" },
  saba: { lon: 45.3, lat: 15.4, place: "Yemen (Marib)" },
  mitanni: { lon: 40, lat: 37, place: "Upper Khabur, N. Syria" },
  urartu: { lon: 43.4, lat: 38.5, place: "Lake Van highlands" },
  greco_bactria: { lon: 66.9, lat: 36.7, place: "Bactria (Balkh)" },
  sogdia: { lon: 66.9, lat: 39.6, place: "Transoxiana (Samarkand)" },
  khwarazm: { lon: 60, lat: 42, place: "Khwarazm oasis (Gurganj)" },
  numidia: { lon: 6.6, lat: 36.4, place: "Numidia (Cirta), Algeria" },
  fatimids: { lon: 31.2, lat: 30, place: "Cairo, Egypt" },
  ayyubids: { lon: 31.3, lat: 30.1, place: "Cairo & Syria" },
  mamluks: { lon: 31.25, lat: 30.05, place: "Egypt & the Levant (Cairo)" },
  almoravids: { lon: -6.8, lat: 31.6, place: "Marrakesh & the Maghreb" },
  swahili: { lon: 39.5, lat: -8.9, place: "Swahili coast (Kilwa)" },
  benin: { lon: 5.6, lat: 6.3, place: "Benin City, West Africa" },
  kongo: { lon: 14.2, lat: -6.3, place: "Lower Congo (Mbanza-Kongo)" },
  bulgaria: { lon: 27, lat: 43.2, place: "Lower Danube (Pliska)" },
  serbia: { lon: 21, lat: 43, place: "Central Balkans (Serbia)" },
  bohemia: { lon: 14.4, lat: 50.1, place: "Bohemia (Prague)" },
  swiss: { lon: 8.5, lat: 47, place: "Central Alps (Switzerland)" },
  aragon: { lon: 1, lat: 41.5, place: "Aragon & Catalonia" },
  scotland: { lon: -3.2, lat: 56.5, place: "Scotland" },
  gaelic_ireland: { lon: -8, lat: 53.3, place: "Ireland" },
  normans: { lon: 13.4, lat: 38.1, place: "Sicily (Palermo)" },
  visigoths: { lon: -4, lat: 39.9, place: "Iberia (Toledo)" },
  novgorod: { lon: 31.3, lat: 58.5, place: "Novgorod, NW Russia" },
  illyrians: { lon: 19, lat: 42, place: "Eastern Adriatic coast" },
  lusitani: { lon: -8, lat: 40, place: "Western Iberia (Portugal)" },
  arevaci: { lon: -2.5, lat: 41.8, place: "Numantia, central Iberia" },
  thracians: { lon: 26, lat: 42, place: "Thrace (Bulgaria)" },
  dacians: { lon: 23, lat: 45.6, place: "Carpathians (Transylvania)" },
  sami: { lon: 25, lat: 69, place: "Arctic Fennoscandia" },
  corinth: { lon: 22.9, lat: 37.9, place: "Corinthian isthmus" },
  thebes: { lon: 23.3, lat: 38.3, place: "Boeotia (Thebes)" },
  eretria: { lon: 23.8, lat: 38.4, place: "Euboea, Greece" },
  crete: { lon: 25, lat: 35.2, place: "Crete" },
  indus_valley: { lon: 68.1, lat: 27.3, place: "Indus valley (Mohenjo-daro)" },
  zhou_china: { lon: 108.9, lat: 34.3, place: "Wei valley (Haojing)" },
  delhi_sultanate: { lon: 77.2, lat: 28.6, place: "North India (Delhi)" },
  mughals: { lon: 78, lat: 27.2, place: "North India (Agra, Delhi)" },
  vijayanagara: { lon: 76.5, lat: 15.3, place: "Deccan (Hampi)" },
  champa: { lon: 108.3, lat: 15.8, place: "Central Vietnam coast" },
  sinhala: { lon: 80.6, lat: 8.3, place: "Sri Lanka (Anuradhapura)" },
  khitan: { lon: 119, lat: 43.9, place: "Inner Mongolia (Liao)" },
  jurchen: { lon: 126, lat: 45.7, place: "Manchuria (Jin)" },
  khazars: { lon: 47, lat: 47, place: "Lower Volga steppe" },
  avars: { lon: 19, lat: 47, place: "Pannonian plain" },
  golden_horde: { lon: 48, lat: 48.7, place: "Lower Volga (Sarai)" },
  chimu: { lon: -79, lat: -8.1, place: "North coast of Peru (Chan Chan)" },
  moche: { lon: -79.1, lat: -7.9, place: "North coast of Peru" },
  tiwanaku: { lon: -68.7, lat: -16.5, place: "Lake Titicaca basin" },
  tarascans: { lon: -101.6, lat: 19.6, place: "Michoacán, Mexico" },
  taino: { lon: -72, lat: 19, place: "Greater Antilles (Hispaniola)" },
  tonga: { lon: -175.2, lat: -21.1, place: "Tonga, South Pacific" },
};

export const civLocation = (civId: string | undefined): CivLocation | undefined =>
  civId ? CIV_LOCATION[civId] : undefined;

/** Ordered geographic regions for grouping civilizations in the Encyclopedia.
 *  Every civ id appears in exactly one region. */
export const CIV_REGIONS: { name: string; civIds: string[] }[] = [
  {
    name: "Mesopotamia & the Near East",
    civIds: ["sumer", "akkad", "babylon", "assyria", "hittites", "elam", "phoenicia", "lydia", "mitanni", "urartu", "israelites", "nabataeans", "saba", "arabia"],
  },
  {
    name: "Persia & Iran",
    civIds: ["median_empire", "persia", "parthia", "sassanid_persia", "greco_bactria", "sogdia", "khwarazm"],
  },
  {
    name: "Egypt & Africa",
    civIds: ["egypt", "kush_nubia", "carthage", "aksum", "ethiopia_zagwe", "mali", "ghana_empire", "songhai", "great_zimbabwe", "kanem_bornu", "numidia", "fatimids", "ayyubids", "mamluks", "almoravids", "swahili", "benin", "kongo"],
  },
  {
    name: "Mediterranean & Europe",
    civIds: ["minoans", "mycenaean_greece", "greece", "sparta", "macedon", "etruscans", "rome", "celts_gauls", "byzantium", "norse", "franks", "goths", "anglo_saxon_england", "france", "castile_spain", "portugal", "venice", "genoa", "dutch_republic", "holy_roman_empire", "kievan_rus", "poland_lithuania", "hungary", "bulgaria", "serbia", "bohemia", "swiss", "aragon", "scotland", "gaelic_ireland", "normans", "visigoths", "novgorod", "illyrians", "lusitani", "arevaci", "thracians", "dacians", "sami", "corinth", "thebes", "eretria", "crete"],
  },
  {
    name: "South, East & Southeast Asia",
    civIds: ["han_china", "china_tang_song", "china_ming", "maurya", "gupta_india", "chola", "japan", "korea", "tibet", "dai_viet_vietnam", "khmer", "srivijaya", "majapahit", "pagan_burma", "ayutthaya_siam", "indus_valley", "zhou_china", "delhi_sultanate", "mughals", "vijayanagara", "champa", "sinhala", "khitan", "jurchen"],
  },
  {
    name: "Steppe & Turkic",
    civIds: ["scythians", "xiongnu", "huns", "gokturks", "seljuks", "mongols", "timurids", "ottomans", "khazars", "avars", "golden_horde"],
  },
  {
    name: "The Americas",
    civIds: ["olmec", "maya", "zapotec", "teotihuacan", "toltec", "aztec", "inca", "muisca", "mississippian_cahokia", "haudenosaunee", "pueblo", "chimu", "moche", "tiwanaku", "tarascans", "taino"],
  },
  {
    name: "Oceania",
    civIds: ["polynesia", "maori", "hawaii", "tonga"],
  },
];
