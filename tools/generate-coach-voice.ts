#!/usr/bin/env bun
/**
 * Generate tutorial coach MP3s via ElevenLabs Text-to-Speech API.
 *
 * Reads lines from tutorial-coach.ts (single source of truth), writes to
 * packages/client/public/coach/voice/<stepId>.mp3
 *
 * Setup:
 *   1. elevenlabs.io → Profile → API Key
 *   2. Voices → pick narrator → Copy voice ID
 *   3. Create .env in repo root:
 *        ELEVENLABS_API_KEY=...
 *        ELEVENLABS_VOICE_ID=...
 *
 * Usage:
 *   bun run generate-coach-voice              # skip existing files
 *   bun run generate-coach-voice -- --force   # regenerate all
 *   bun run generate-coach-voice -- --step t1_select_scout
 *   bun run generate-coach-voice -- --dry-run
 *   bun run generate-coach-voice -- --list-voices
 */

import { access, mkdir, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { join } from "node:path";
import { allCoachVoiceSteps } from "../packages/client/src/tutorial-coach-voice-lines.ts";

const { argv, env, exit } = process;

const root = join(import.meta.dir, "..");
const outDir = join(root, "packages/client/public/coach/voice");

const API_BASE = "https://api.elevenlabs.io/v1";
const DEFAULT_MODEL = "eleven_turbo_v2_5";
/** Herodotus — the tutorial advisor's ElevenLabs voice (override with ELEVENLABS_VOICE_ID). */
const HERODOTUS_VOICE_ID = "Gsndh0O5AnuI2Hj3YUlA";

function usage(): void {
  console.log(`Usage: bun run tools/generate-coach-voice.ts [options]

Options:
  --step <id>     Generate one step only (e.g. t1_select_scout)
  --force         Overwrite existing MP3s
  --dry-run       Print scripts without calling the API
  --list-voices   Print voices on your ElevenLabs account (needs API key)
  --help          Show this help

Environment (repo-root .env or shell):
  ELEVENLABS_API_KEY   Required for generation (ELEVEN_LABS_API_KEY also accepted)
  ELEVENLABS_VOICE_ID  Optional — defaults to Herodotus (${HERODOTUS_VOICE_ID})
  ELEVENLABS_MODEL_ID  Optional (default: ${DEFAULT_MODEL})
`);
}

function argFlag(name: string): boolean {
  return argv.includes(name);
}

function argValue(name: string): string | undefined {
  const i = argv.indexOf(name);
  if (i === -1 || i + 1 >= argv.length) return undefined;
  return argv[i + 1];
}

/** API key from either spelling: ELEVENLABS_API_KEY or ELEVEN_LABS_API_KEY. */
function requireApiKey(): string {
  const v = env.ELEVENLABS_API_KEY?.trim() || env.ELEVEN_LABS_API_KEY?.trim();
  if (!v) {
    console.error("Missing ELEVENLABS_API_KEY. Add it to .env in the repo root or export it in your shell.");
    exit(1);
  }
  return v;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function listVoices(apiKey: string): Promise<void> {
  const res = await fetch(`${API_BASE}/voices`, {
    headers: { "xi-api-key": apiKey },
  });
  if (!res.ok) {
    console.error(`Failed to list voices (${res.status}): ${await res.text()}`);
    exit(1);
  }
  const data = (await res.json()) as {
    voices?: Array<{ voice_id: string; name: string; category?: string }>;
  };
  console.log("Your ElevenLabs voices:\n");
  for (const v of data.voices ?? []) {
    console.log(`  ${v.name.padEnd(28)} ${v.voice_id}${v.category ? `  (${v.category})` : ""}`);
  }
  console.log("\nCopy the voice_id you want into ELEVENLABS_VOICE_ID in .env");
}

async function synthesize(
  apiKey: string,
  voiceId: string,
  modelId: string,
  text: string,
): Promise<ArrayBuffer> {
  const url = `${API_BASE}/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text,
      model_id: modelId,
      voice_settings: {
        stability: 0.55,
        similarity_boost: 0.78,
        style: 0.15,
        use_speaker_boost: true,
      },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`ElevenLabs ${res.status}: ${body}`);
  }
  return res.arrayBuffer();
}

async function main(): Promise<void> {
  if (argFlag("--help") || argFlag("-h")) {
    usage();
    return;
  }

  if (argFlag("--list-voices")) {
    await listVoices(requireApiKey());
    return;
  }

  const dryRun = argFlag("--dry-run");
  const force = argFlag("--force");
  const onlyStep = argValue("--step");

  let steps = allCoachVoiceSteps();
  if (onlyStep) {
    steps = steps.filter((s) => s.id === onlyStep);
    if (steps.length === 0) {
      console.error(`Unknown step "${onlyStep}". Known ids:`);
      for (const s of allCoachVoiceSteps()) console.error(`  ${s.id}`);
      exit(1);
    }
  }

  if (dryRun) {
    console.log(`Would generate ${steps.length} file(s) → ${outDir}\n`);
    for (const s of steps) {
      console.log(`${s.id}.mp3`);
      console.log(`  ${s.text}\n`);
    }
    return;
  }

  const apiKey = requireApiKey();
  const voiceId = env.ELEVENLABS_VOICE_ID?.trim() || HERODOTUS_VOICE_ID;
  const modelId = env.ELEVENLABS_MODEL_ID?.trim() || DEFAULT_MODEL;
  // <phoneme> SSML tags (used to force a correct pronunciation) are only honored
  // by older models, not the default turbo v2.5 — so any clip containing one is
  // synthesized on a phoneme-capable model instead.
  const phonemeModel = env.ELEVENLABS_PHONEME_MODEL?.trim() || "eleven_turbo_v2";

  await mkdir(outDir, { recursive: true });

  let generated = 0;
  let skipped = 0;

  for (const step of steps) {
    const outPath = join(outDir, `${step.id}.mp3`);
    if (!force && (await fileExists(outPath))) {
      console.log(`skip  ${step.id}.mp3 (exists — use --force to regenerate)`);
      skipped++;
      continue;
    }

    const stepModel = step.text.includes("<phoneme") ? phonemeModel : modelId;
    process.stdout.write(`gen   ${step.id}.mp3 (${stepModel}) … `);
    try {
      const audio = await synthesize(apiKey, voiceId, stepModel, step.text);
      await writeFile(outPath, Buffer.from(audio));
      console.log("ok");
      generated++;
    } catch (err) {
      console.log("failed");
      console.error(err instanceof Error ? err.message : err);
      exit(1);
    }
  }

  console.log(`\nDone: ${generated} generated, ${skipped} skipped.`);
  console.log(`Files: packages/client/public/coach/voice/`);
  console.log(`Start tutorial in dev to hear them (missing files still use browser TTS).`);
}

void main();
