#!/usr/bin/env bun
/**
 * Generate loading-scroll MP3s via ElevenLabs Text-to-Speech API.
 *
 * Scripts are kept short (~500 chars) so ElevenLabs synthesizes the full clip.
 *
 * Voice env (.env in repo root):
 *   ELEVENLABS_API_KEY=...
 *   ELEVENLABS_VOICE_ID=...              default male / tutorial coach (Alex, Herodotus, …)
 *   ELEVENLABS_VOICE_ID_FEMALE=...        all 9 female leaders share one voice
 *   ELEVENLABS_VOICE_IDS_MALE=id0,id1,…   optional override; default is per-civ regional accents
 *
 * Usage:
 *   bun run generate-loading-voice -- --list-narrators
 *   bun run generate-loading-voice -- --civ dutch_republic --dry-run
 *   bun run generate-loading-voice -- --civ dutch_republic
 *   bun run generate-loading-voice -- --civ egypt --force
 *   bun run generate-loading-voice -- --txt-only
 *   bun run generate-loading-voice -- --force
 */

import { access, mkdir, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { join } from "node:path";
import {
  CIVILIZATIONS,
  buildCivLoadingSpeech,
  leaderVoiceKind,
  loadingSpeechContextFor,
  maleLeaderVoiceSlotCount,
} from "../packages/data/src/index.ts";
import {
  DEFAULT_MODEL,
  LOADING_VOICE_MODEL,
  elevenLabsApiKey,
  voiceIdForCiv,
  voiceLabelForCiv,
  printDefaultNarratorVoices,
} from "./elevenlabs-env.ts";

const { argv, env, exit } = process;

const root = join(import.meta.dir, "..");
const outDir = join(root, "packages/client/public/loading/voice");

const API_BASE = "https://api.elevenlabs.io/v1";

function argFlag(name: string): boolean {
  return argv.includes(name);
}

function argValue(name: string): string | undefined {
  const i = argv.indexOf(name);
  if (i === -1 || i + 1 >= argv.length) return undefined;
  return argv[i + 1];
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function parseElevenLabsError(status: number, body: string): string {
  try {
    const j = JSON.parse(body) as { detail?: { code?: string; message?: string } };
    if (j.detail?.code === "quota_exceeded") {
      return (
        `ElevenLabs quota exceeded (${status}). ${j.detail.message ?? ""}\n` +
        `Tip: scripts are ~500 characters each. Bake one civ at a time with --civ <id>, ` +
        `or top up credits at elevenlabs.io. Use --dry-run to preview length first.`
      );
    }
    if (j.detail?.message) return `ElevenLabs ${status}: ${j.detail.message}`;
  } catch {
    // fall through
  }
  return `ElevenLabs ${status}: ${body}`;
}

async function synthesize(text: string, apiKey: string, voiceId: string, modelId: string): Promise<ArrayBuffer> {
  const res = await fetch(`${API_BASE}/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "xi-api-key": apiKey,
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text,
      model_id: modelId,
      voice_settings: { stability: 0.55, similarity_boost: 0.8, style: 0.15, use_speaker_boost: true },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(parseElevenLabsError(res.status, body));
  }
  return res.arrayBuffer();
}

async function main(): Promise<void> {
  const force = argFlag("--force");
  const dryRun = argFlag("--dry-run");
  const txtOnly = argFlag("--txt-only");
  const listNarrators = argFlag("--list-narrators");
  const onlyCiv = argValue("--civ");

  if (listNarrators) {
    printDefaultNarratorVoices();
    return;
  }

  const civs = onlyCiv ? CIVILIZATIONS.filter((c) => c.id === onlyCiv) : CIVILIZATIONS;
  const orderedCivIds = CIVILIZATIONS.map((c) => c.id);
  const maleCivCount = CIVILIZATIONS.filter((c) => leaderVoiceKind(c.id) === "male").length;
  const requiredMaleSlots = maleLeaderVoiceSlotCount(maleCivCount);
  const maleVoiceSlotIds = (env.ELEVENLABS_VOICE_IDS_MALE?.trim() ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!dryRun && !txtOnly && maleVoiceSlotIds.length > 0 && maleVoiceSlotIds.length < requiredMaleSlots) {
    console.warn(
      `Warning: ELEVENLABS_VOICE_IDS_MALE has ${maleVoiceSlotIds.length} id(s) but ${requiredMaleSlots} are needed for ${maleCivCount} male civs (reuses last ids for higher slots).`,
    );
  }

  if (onlyCiv && civs.length === 0) {
    console.error(`Unknown civ id: ${onlyCiv}`);
    exit(1);
  }

  if (!dryRun && !txtOnly) await mkdir(outDir, { recursive: true });
  if (txtOnly) await mkdir(outDir, { recursive: true });

  let apiKey = "";
  if (!dryRun && !txtOnly) {
    try {
      apiKey = elevenLabsApiKey(env);
    } catch (err) {
      console.error(String(err));
      exit(1);
    }
  }

  const modelId =
    env.ELEVENLABS_LOADING_MODEL_ID?.trim() || env.ELEVENLABS_MODEL_ID?.trim() || LOADING_VOICE_MODEL;

  let generated = 0;
  let skipped = 0;
  let txtWritten = 0;

  for (const civ of civs) {
    const speech = buildCivLoadingSpeech(civ, loadingSpeechContextFor(civ.id));
    const outPath = join(outDir, `${civ.id}.mp3`);
    const txtPath = join(outDir, `${civ.id}.txt`);
    const versionPath = join(outDir, `${civ.id}.version`);
    const voiceKind = leaderVoiceKind(civ.id);
    const voiceId = voiceIdForCiv(civ.id, orderedCivIds, env);

    if (txtOnly) {
      await writeFile(txtPath, speech.text, "utf8");
      txtWritten++;
      continue;
    }

    if (!dryRun && !force && (await fileExists(outPath))) {
      skipped++;
      continue;
    }
    if (dryRun) {
      console.log(
        `\n--- ${civ.id} (${speech.leader}) · ${voiceLabelForCiv(civ.id, orderedCivIds, env)} · ${speech.text.length} chars ---\n${speech.text}\n`,
      );
      continue;
    }
    console.log(
      `Generating ${civ.id} (${speech.leader}, ${voiceKind} voice, ${speech.text.length} chars)…`,
    );
    try {
      const audio = await synthesize(speech.text, apiKey, voiceId, modelId);
      await writeFile(outPath, Buffer.from(audio));
      await writeFile(txtPath, speech.text, "utf8");
      await writeFile(versionPath, String(Date.now()), "utf8");
      generated++;
    } catch (err) {
      console.error(String(err));
      exit(1);
    }
    await new Promise((r) => setTimeout(r, 350));
  }

  if (dryRun) {
    console.log(`Dry run: ${civs.length} script(s).`);
    return;
  }
  if (txtOnly) {
    console.log(`Wrote ${txtWritten} script file(s) to ${outDir} (no API credits used).`);
    return;
  }
  console.log(`Done. Generated ${generated}, skipped ${skipped} (already present). Output: ${outDir}`);
}

main().catch((err) => {
  console.error(err);
  exit(1);
});
