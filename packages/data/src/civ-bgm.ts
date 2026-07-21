// Regional lobby / in-game background music keyed by civilization.

import { CIV_REGIONS } from "./history-geo";

export type CivBgmRegion =
  | "africa"
  | "ancientMiddleEast"
  | "celtic"
  | "eastAsia"
  | "india"
  | "japan"
  | "siberian"
  | "default";

/** Public-relative paths under packages/client/public/. */
export const CIV_BGM_TRACKS: Record<CivBgmRegion, string> = {
  africa: "audio/background/africa.ogg",
  ancientMiddleEast: "audio/background/AncientMiddleEast-Egypt.ogg",
  celtic: "audio/background/celtic.ogg",
  eastAsia: "audio/background/eastAsia.ogg",
  india: "audio/background/India.ogg",
  japan: "audio/background/Japan.ogg",
  siberian: "audio/background/Siberian.ogg",
  default: "audio/background/background.ogg",
};

const mesopotamia = new Set(CIV_REGIONS[0]!.civIds);
const persia = new Set(CIV_REGIONS[1]!.civIds);
const africaRegion = new Set(CIV_REGIONS[2]!.civIds);
const medEurope = new Set(CIV_REGIONS[3]!.civIds);
const asia = new Set(CIV_REGIONS[4]!.civIds);
const steppe = new Set(CIV_REGIONS[5]!.civIds);
const americas = new Set(CIV_REGIONS[6]!.civIds);
const oceania = new Set(CIV_REGIONS[7]!.civIds);

const ANCIENT_MIDDLE_EAST = new Set([...mesopotamia, ...persia, "egypt"]);
const AFRICA = new Set([...africaRegion].filter((id) => id !== "egypt"));
const CELTIC = new Set(["celts_gauls", "gaelic_ireland", "scotland", "norse", "sami"]);
const INDIA = new Set([
  "maurya",
  "gupta_india",
  "chola",
  "indus_valley",
  "delhi_sultanate",
  "mughals",
  "vijayanagara",
  "sinhala",
]);
const JAPAN = new Set(["japan"]);
const EAST_ASIA = new Set([...asia].filter((id) => !INDIA.has(id) && !JAPAN.has(id)));
const SIBERIAN = new Set([...steppe, "novgorod", "kievan_rus"]);
const CLASSICAL_MEDITERRANEAN = new Set([
  "minoans",
  "mycenaean_greece",
  "greece",
  "sparta",
  "macedon",
  "etruscans",
  "rome",
  "byzantium",
  "corinth",
  "thebes",
  "eretria",
  "crete",
  "illyrians",
  "thracians",
  "lusitani",
  "arevaci",
  "dacians",
]);

export function civBgmRegion(civId: string): CivBgmRegion {
  if (JAPAN.has(civId)) return "japan";
  if (INDIA.has(civId)) return "india";
  if (CELTIC.has(civId)) return "celtic";
  if (SIBERIAN.has(civId)) return "siberian";
  if (AFRICA.has(civId)) return "africa";
  if (ANCIENT_MIDDLE_EAST.has(civId) || CLASSICAL_MEDITERRANEAN.has(civId)) return "ancientMiddleEast";
  if (EAST_ASIA.has(civId)) return "eastAsia";
  if (americas.has(civId) || oceania.has(civId)) return "default";
  if (medEurope.has(civId)) return "default";
  return "default";
}

export function bgmTrackForCiv(civId: string): string {
  return CIV_BGM_TRACKS[civBgmRegion(civId)];
}
