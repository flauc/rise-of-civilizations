/** Civs whose loading-scroll narrator should use the female ElevenLabs voice. */
export const FEMALE_LEADER_CIV_IDS = new Set([
  "phoenicia", // Dido
  "egypt", // Hatshepsut
  "kush_nubia", // Amanirenas
  "france", // Joan of Arc
  "castile_spain", // Isabella
  "poland_lithuania", // Jadwiga
  "scythians", // Tomyris
  "saba", // Bilqis
  "illyrians", // Teuta
]);

/** Male leaders rotate voice every N civs (canonical CIVILIZATIONS order). */
export const MALE_LEADERS_PER_VOICE = 10;

export type LeaderVoiceKind = "male" | "female";

export function leaderVoiceKind(civId: string): LeaderVoiceKind {
  return FEMALE_LEADER_CIV_IDS.has(civId) ? "female" : "male";
}

/**
 * Voice slot for a male leader (0 = first 10 male civs, 1 = next 10, …).
 * Pass civ ids in the same order as `CIVILIZATIONS`.
 */
export function maleLeaderVoiceBucket(civId: string, orderedCivIds: readonly string[]): number {
  if (FEMALE_LEADER_CIV_IDS.has(civId)) return -1;
  let maleIdx = 0;
  for (const id of orderedCivIds) {
    if (FEMALE_LEADER_CIV_IDS.has(id)) continue;
    if (id === civId) return Math.floor(maleIdx / MALE_LEADERS_PER_VOICE);
    maleIdx++;
  }
  return 0;
}

/** How many distinct male voice ids are needed for a civ roster. */
export function maleLeaderVoiceSlotCount(maleCivCount: number): number {
  return Math.max(1, Math.ceil(maleCivCount / MALE_LEADERS_PER_VOICE));
}
