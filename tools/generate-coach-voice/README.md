# Tutorial coach voice generator (ElevenLabs)

Build-time tool — generates MP3s for the in-game tutorial advisor. The game
ships these files and plays them offline; **no ElevenLabs API key in the client**.

Tutorial text lives in `packages/client/src/tutorial-coach.ts`. This script
reads that file automatically, so add/edit/remove steps there and re-run.

## 1. ElevenLabs account

1. Sign up at [elevenlabs.io](https://elevenlabs.io).
2. **Profile → API Key** → create/copy key.
3. The voice defaults to **Herodotus** (`Gsndh0O5AnuI2Hj3YUlA`). To use another
   narrator: **Voices** → **Copy voice ID** and set `ELEVENLABS_VOICE_ID`.

## 2. Local env (never commit)

In the **repo root**, create `.env`:

```bash
ELEVENLABS_API_KEY=your-api-key-here   # ELEVEN_LABS_API_KEY also accepted
# optional:
# ELEVENLABS_VOICE_ID=override-voice-id   (default: Herodotus)
# ELEVENLABS_MODEL_ID=eleven_turbo_v2_5
```

`.env` is gitignored.

## 3. Verify voice ID (optional)

```bash
bun run generate-coach-voice -- --list-voices
```

Pick the `voice_id` from the list if you're unsure.

## 4. Preview scripts (no API calls)

```bash
bun run generate-coach-voice -- --dry-run
```

## 5. Generate all MP3s

```bash
bun run generate-coach-voice
```

Output: `packages/client/public/coach/voice/t1_select_scout.mp3`, etc.

- Skips files that already exist.
- `--force` regenerates everything.
- `--step t1_select_scout` generates one file.

## 6. Test in game

```bash
bun run dev
```

Start a **Tutorial** game. Each coach step plays its MP3; missing files fall
back to browser speech synthesis.

## When you change tutorial text

1. Edit messages in `tutorial-coach.ts`.
2. Re-run with `--force` (or `--step <id>` for one line).

## Cost note

Each line is one API call (~20 lines for the full tutorial). Re-run only when
text changes or you switch voices.
