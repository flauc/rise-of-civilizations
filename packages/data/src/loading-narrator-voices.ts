/**
 * Default ElevenLabs premade voices for loading-scroll narration.
 * Middle-aged or older male narrators; one id per male-leader bucket (every 10 civs → 13 slots).
 *
 * Override in repo-root .env:
 *   ELEVENLABS_VOICE_IDS_MALE=id0,id1,…,id12
 *   ELEVENLABS_VOICE_ID_FEMALE=…
 */

export interface NarratorVoiceDef {
  id: string;
  name: string;
  note: string;
}

/** Thirteen male narration voices (slots 0–12). */
export const DEFAULT_MALE_NARRATOR_VOICES: readonly NarratorVoiceDef[] = [
  { id: "JBFqnCBsd6RMkjVDRZzb", name: "George", note: "Warm British storyteller, middle-aged" },
  { id: "nPczCjzI2devNBz1zQrb", name: "Brian", note: "Deep resonant narrator, middle-aged" },
  { id: "pqHfZKP75CvOlQylNhV4", name: "Bill", note: "Wise mature documentary tone" },
  { id: "onwK4e9ZLuTAKqWW03F9", name: "Daniel", note: "Steady broadcaster, middle-aged" },
  { id: "pNInz6obpgDQGcFmaJgB", name: "Adam", note: "Deep firm American narrator" },
  { id: "VR6AewLTigWG4xSOukaG", name: "Arnold", note: "Crisp clear middle-aged narrator" },
  { id: "29vD33N1CtxCmqQRPOHJ", name: "Drew", note: "Well-rounded news narration" },
  { id: "5Q0t7uMcjvnagumLfvZi", name: "Paul", note: "Ground reporter, documentary" },
  { id: "Zlb1dXrM653N07WRdFW3", name: "Joseph", note: "Authoritative British, formal" },
  { id: "flq6f7yk4E4fJM5XTYuZ", name: "Michael", note: "Wise grandfatherly audiobook" },
  { id: "ZQe5CZNOzWyzPSCn5a3c", name: "James", note: "Calm older documentary voice" },
  { id: "CwhRBWXzGAHq8TQ4Fs17", name: "Roger", note: "Laid-back resonant narrator" },
  { id: "cjVigY5qzO86Huf0OWal", name: "Eric", note: "Smooth trustworthy narrator" },
] as const;

/** Shared female leader narration voice (nine female civs). */
export const DEFAULT_FEMALE_NARRATOR_VOICE: NarratorVoiceDef = {
  id: "EXAVITQu4vr4xnSDxMaL",
  name: "Sarah",
  note: "Mature reassuring narrator",
};

export const DEFAULT_MALE_NARRATOR_VOICE_IDS: readonly string[] = DEFAULT_MALE_NARRATOR_VOICES.map((v) => v.id);

/** Comma-separated list for .env `ELEVENLABS_VOICE_IDS_MALE`. */
export function maleNarratorVoiceIdsEnvValue(): string {
  return DEFAULT_MALE_NARRATOR_VOICE_IDS.join(",");
}

export function narratorVoiceName(voiceId: string): string | undefined {
  const male = DEFAULT_MALE_NARRATOR_VOICES.find((v) => v.id === voiceId);
  if (male) return male.name;
  if (voiceId === DEFAULT_FEMALE_NARRATOR_VOICE.id) return DEFAULT_FEMALE_NARRATOR_VOICE.name;
  return undefined;
}
