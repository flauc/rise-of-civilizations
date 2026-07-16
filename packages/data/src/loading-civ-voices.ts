/**
 * Per-civilization ElevenLabs narrator voice for loading-scroll clips.
 * Maps each civ to a premade voice whose accent fits its region (British for
 * classical Europe, American for the Americas, etc.). Rebake MP3s after changes:
 *   bun run tools/generate-loading-voice.ts -- --force
 */

import {
  DEFAULT_FEMALE_NARRATOR_VOICE,
  DEFAULT_MALE_NARRATOR_VOICE_IDS,
} from "./loading-narrator-voices";
import { leaderVoiceKind, maleLeaderVoiceBucket } from "./leader-voice";

/** Premade voice ids (see loading-narrator-voices.ts for names/notes). */
const V = {
  george: "JBFqnCBsd6RMkjVDRZzb",
  brian: "nPczCjzI2devNBz1zQrb",
  bill: "pqHfZKP75CvOlQylNhV4",
  daniel: "onwK4e9ZLuTAKqWW03F9",
  adam: "pNInz6obpgDQGcFmaJgB",
  arnold: "VR6AewLTigWG4xSOukaG",
  drew: "29vD33N1CtxCmqQRPOHJ",
  paul: "5Q0t7uMcjvnagumLfvZi",
  joseph: "Zlb1dXrM653N07WRdFW3",
  michael: "flq6f7yk4E4fJM5XTYuZ",
  james: "ZQe5CZNOzWyzPSCn5a3c",
  roger: "CwhRBWXzGAHq8TQ4Fs17",
  eric: "cjVigY5qzO86Huf0OWal",
  sarah: DEFAULT_FEMALE_NARRATOR_VOICE.id,
} as const;

function assign(map: Record<string, string>, ids: readonly string[], voiceId: string): void {
  for (const id of ids) map[id] = voiceId;
}

function buildCivNarratorVoiceMap(): Record<string, string> {
  const map: Record<string, string> = {};

  // Mesopotamian leaders each get a voice matched to their hand-written script:
  // Gilgamesh the epic storyteller, Sargon the iron conqueror, Hammurabi the
  // formal lawgiver, Ashurbanipal the resonant menace, Suppiluliuma the steady
  // rebuilder king.
  assign(map, ["sumer"], V.george);
  assign(map, ["akkad"], V.adam);
  assign(map, ["babylon"], V.joseph);
  assign(map, ["assyria"], V.brian);
  assign(map, ["hittites"], V.daniel);

  assign(map, [
    "elam", "israelites", "mitanni", "urartu",
    "nabataeans", "lydia",
  ], V.brian);

  assign(map, [
    "persia", "parthia", "sassanid_persia", "median_empire", "sogdia", "khwarazm", "greco_bactria",
  ], V.bill);

  assign(map, [
    "arabia", "fatimids", "ayyubids", "mamluks", "almoravids", "seljuks", "timurids", "ottomans",
  ], V.joseph);

  assign(map, ["phoenicia", "egypt", "kush_nubia", "france", "castile_spain", "poland_lithuania", "scythians", "saba", "illyrians"], V.sarah);

  assign(map, ["carthage", "aksum", "ethiopia_zagwe", "numidia", "swahili"], V.michael);

  assign(map, ["mali", "ghana_empire", "songhai", "great_zimbabwe", "kanem_bornu", "benin", "kongo"], V.roger);

  assign(map, [
    "minoans", "mycenaean_greece", "greece", "sparta", "macedon", "etruscans", "corinth", "thebes",
    "eretria", "crete",
  ], V.george);

  assign(map, ["rome", "byzantium", "thracians", "dacians"], V.daniel);

  assign(map, [
    "celts_gauls", "norse", "franks", "goths", "visigoths", "anglo_saxon_england", "normans", "scotland",
    "gaelic_ireland", "lusitani", "arevaci", "sami",
  ], V.drew);

  assign(map, ["portugal", "venice", "genoa", "aragon", "swiss"], V.eric);

  assign(map, ["dutch_republic", "holy_roman_empire", "hungary", "bohemia", "bulgaria"], V.paul);

  assign(map, ["kievan_rus", "serbia", "novgorod"], V.arnold);

  assign(map, ["han_china", "china_tang_song", "china_ming", "zhou_china", "japan", "korea", "tibet", "khitan", "jurchen"], V.james);

  assign(map, [
    "dai_viet_vietnam", "khmer", "srivijaya", "majapahit", "pagan_burma", "ayutthaya_siam", "champa",
    "sinhala", "indus_valley",
  ], V.eric);

  assign(map, ["maurya", "gupta_india", "chola", "delhi_sultanate", "mughals", "vijayanagara"], V.michael);

  assign(map, ["xiongnu", "huns", "gokturks", "mongols", "khazars", "avars", "golden_horde"], V.brian);

  assign(map, [
    "olmec", "maya", "zapotec", "teotihuacan", "toltec", "aztec", "inca", "muisca",
    "mississippian_cahokia", "haudenosaunee", "pueblo", "chimu", "moche", "tiwanaku", "tarascans", "taino",
  ], V.adam);

  assign(map, ["polynesia", "maori", "hawaii", "tonga"], V.roger);

  return map;
}

export const CIV_NARRATOR_VOICE_BY_ID: Readonly<Record<string, string>> = buildCivNarratorVoiceMap();

/** ElevenLabs voice id for a civ's loading-scroll clip (regional accent when mapped). */
export function narratorVoiceIdForCiv(civId: string, orderedCivIds: readonly string[]): string {
  const mapped = CIV_NARRATOR_VOICE_BY_ID[civId];
  if (mapped) return mapped;
  if (leaderVoiceKind(civId) === "female") return DEFAULT_FEMALE_NARRATOR_VOICE.id;
  const bucket = maleLeaderVoiceBucket(civId, orderedCivIds);
  return DEFAULT_MALE_NARRATOR_VOICE_IDS[bucket] ?? DEFAULT_MALE_NARRATOR_VOICE_IDS[0]!;
}
