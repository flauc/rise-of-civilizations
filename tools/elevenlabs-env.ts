/** Shared ElevenLabs env helpers for bake scripts (tools/ only). */

import {
  DEFAULT_FEMALE_NARRATOR_VOICE,
  DEFAULT_MALE_NARRATOR_VOICE_IDS,
  leaderVoiceKind,
  narratorVoiceIdForCiv,
  narratorVoiceName,
  type LeaderVoiceKind,
  CIV_NARRATOR_VOICE_BY_ID,
} from "../packages/data/src/index.ts";

export const HERODOTUS_VOICE_ID = "Gsndh0O5AnuI2Hj3YUlA";
export const DEFAULT_MODEL = "eleven_turbo_v2_5";
/** Longer loading-scroll clips — completes full scripts more reliably than turbo. */
export const LOADING_VOICE_MODEL = "eleven_multilingual_v2";

export function elevenLabsApiKey(env: NodeJS.ProcessEnv): string {
  const v = env.ELEVENLABS_API_KEY?.trim() || env.ELEVEN_LABS_API_KEY?.trim();
  if (!v) {
    throw new Error("Missing ELEVENLABS_API_KEY. Add it to .env in the repo root.");
  }
  return v;
}

/** Male narrator voice — tutorial Herodotus by default. */
export function maleVoiceId(env: NodeJS.ProcessEnv): string {
  return env.ELEVENLABS_VOICE_ID?.trim() || HERODOTUS_VOICE_ID;
}

/** Female leader voice — falls back to default Sarah narrator when unset. */
export function femaleVoiceId(env: NodeJS.ProcessEnv): string {
  return env.ELEVENLABS_VOICE_ID_FEMALE?.trim() || DEFAULT_FEMALE_NARRATOR_VOICE.id;
}

/** One voice id per male-leader bucket (every 10 civs). Uses 13 premade narrators when unset. */
export function maleVoiceIds(env: NodeJS.ProcessEnv): string[] {
  const list = env.ELEVENLABS_VOICE_IDS_MALE?.trim();
  if (list) {
    const ids = list.split(",").map((s) => s.trim()).filter(Boolean);
    if (ids.length > 0) return ids;
  }
  return [...DEFAULT_MALE_NARRATOR_VOICE_IDS];
}

export function voiceIdForLeader(kind: LeaderVoiceKind, env: NodeJS.ProcessEnv): string {
  return kind === "female" ? femaleVoiceId(env) : maleVoiceIds(env)[0]!;
}

/** Pick the ElevenLabs voice for a civ's loading-scroll clip. */
export function voiceIdForCiv(civId: string, orderedCivIds: readonly string[], env: NodeJS.ProcessEnv): string {
  const regional = narratorVoiceIdForCiv(civId, orderedCivIds);
  if (leaderVoiceKind(civId) === "female") {
    return env.ELEVENLABS_VOICE_ID_FEMALE?.trim() || regional;
  }
  return regional;
}

export function voiceLabel(kind: LeaderVoiceKind, env: NodeJS.ProcessEnv): string {
  if (kind === "female") {
    const id = env.ELEVENLABS_VOICE_ID_FEMALE?.trim();
    return id ? `female (${id})` : `female (${DEFAULT_FEMALE_NARRATOR_VOICE.name})`;
  }
  const ids = maleVoiceIds(env);
  return ids.length === 1 ? `male (${ids[0]})` : `male (${ids.length} voices)`;
}

export function voiceLabelForCiv(
  civId: string,
  orderedCivIds: readonly string[],
  env: NodeJS.ProcessEnv,
): string {
  const id = voiceIdForCiv(civId, orderedCivIds, env);
  const label = narratorVoiceName(id);
  const kind = leaderVoiceKind(civId);
  const regional = CIV_NARRATOR_VOICE_BY_ID[civId] === id;
  const tag = regional ? "regional" : kind;
  return label ? `${tag} ${label} (${id})` : `${tag} (${id})`;
}

export function printDefaultNarratorVoices(): void {
  console.log("Default loading-scroll narrator voices (13 male slots + female):\n");
  DEFAULT_MALE_NARRATOR_VOICE_IDS.forEach((id, i) => {
    const v = narratorVoiceName(id);
    console.log(`  slot ${String(i + 1).padStart(2)}  ${v ?? "?"}  ${id}`);
  });
  console.log(`  female   ${DEFAULT_FEMALE_NARRATOR_VOICE.name}  ${DEFAULT_FEMALE_NARRATOR_VOICE.id}`);
  console.log("\nPaste into .env:");
  console.log(`ELEVENLABS_VOICE_IDS_MALE=${DEFAULT_MALE_NARRATOR_VOICE_IDS.join(",")}`);
  console.log(`ELEVENLABS_VOICE_ID_FEMALE=${DEFAULT_FEMALE_NARRATOR_VOICE.id}`);
}
