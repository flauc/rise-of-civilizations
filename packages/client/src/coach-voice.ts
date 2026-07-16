// Tutorial advisor voice — pre-recorded MP3 per step (ElevenLabs), browser TTS fallback.

import { assetUrl } from "./asset-base";
import { TUTORIAL_STEP_IDS, type TutorialStepId } from "./tutorial-coach";

let currentAudio: HTMLAudioElement | null = null;
let currentUtterance: SpeechSynthesisUtterance | null = null;
/** Scopes the listeners of the line in flight, since clip elements are reused. */
let currentListeners: AbortController | null = null;
const clipCache = new Map<TutorialStepId, HTMLAudioElement>();

/** Where ElevenLabs (or other) clips live: `public/coach/voice/<stepId>.mp3`. */
export function coachVoiceClipUrl(stepId: TutorialStepId): string {
  return assetUrl(`coach/voice/${stepId}.mp3`);
}

/**
 * Warm every tutorial clip (~6.5 MB across ~30 files). Unlike the loading
 * narration, which is one clip out of 137 and only knowable once a civ is
 * picked, the coach lines are the same for every game, so they can all be
 * fetched up front. Cheap to call more than once: the cache makes it a no-op.
 */
export function preloadCoachVoice(): void {
  for (const stepId of TUTORIAL_STEP_IDS) {
    // "complete" is a terminal state with no line to speak, so no clip is baked.
    if (stepId === "complete" || clipCache.has(stepId)) continue;
    const audio = new Audio(coachVoiceClipUrl(stepId));
    audio.preload = "auto";
    audio.load();
    clipCache.set(stepId, audio);
  }
}

/** A warmed clip if we have one, else a fresh element that loads on demand. */
function clipFor(stepId: TutorialStepId): HTMLAudioElement {
  const cached = clipCache.get(stepId);
  // Rewind rather than re-fetch: a step can be spoken again across games.
  if (cached) {
    cached.currentTime = 0;
    return cached;
  }
  const audio = new Audio(coachVoiceClipUrl(stepId));
  clipCache.set(stepId, audio);
  return audio;
}

/** Stop any line currently being spoken. */
export function stopCoachVoice(): void {
  currentListeners?.abort();
  currentListeners = null;
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
    currentAudio = null;
  }
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  currentUtterance = null;
}

function speakWithBrowserTts(text: string, onEnd?: () => void): void {
  if (!text || !("speechSynthesis" in window)) {
    onEnd?.();
    return;
  }
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "en-US";
  u.rate = 0.93;
  u.pitch = 0.95;
  u.onend = () => {
    if (currentUtterance === u) currentUtterance = null;
    onEnd?.();
  };
  u.onerror = () => {
    if (currentUtterance === u) currentUtterance = null;
    onEnd?.();
  };
  currentUtterance = u;
  window.speechSynthesis.speak(u);
}

export interface CoachSpeakHandlers {
  /** The recorded clip actually began playing; `durationSec` is its length (0 if unknown). */
  onPlay?: (durationSec: number) => void;
  /** No timed clip is available — the caller should reveal text at its own pace. */
  onFallback?: () => void;
  /** Speech finished (MP3 ended or browser TTS completed). */
  onEnd?: () => void;
}

/**
 * Speak a tutorial line. Uses `coach/voice/<stepId>.mp3` when the file exists;
 * otherwise falls back to browser speech synthesis. `handlers.onPlay` fires the
 * moment the clip starts (so text can be revealed in step with the voice), and
 * `handlers.onFallback` fires when there is no timed clip to sync to.
 */
export function speakCoachLine(
  text: string,
  stepId?: TutorialStepId,
  handlers?: CoachSpeakHandlers,
): void {
  if (!text) return;
  stopCoachVoice();

  if (!stepId) {
    speakWithBrowserTts(text, handlers?.onEnd);
    handlers?.onFallback?.();
    return;
  }

  const audio = clipFor(stepId);
  currentAudio = audio;
  const ac = new AbortController();
  currentListeners = ac;
  const { signal } = ac;

  const fallback = (): void => {
    if (currentAudio !== audio) return;
    currentAudio = null;
    ac.abort();
    currentListeners = null;
    speakWithBrowserTts(text, handlers?.onEnd);
    handlers?.onFallback?.();
  };
  audio.addEventListener(
    "playing",
    () => {
      if (currentAudio === audio) {
        handlers?.onPlay?.(Number.isFinite(audio.duration) ? audio.duration : 0);
      }
    },
    { once: true, signal },
  );
  audio.addEventListener(
    "ended",
    () => {
      if (currentAudio !== audio) return;
      currentAudio = null;
      currentListeners = null;
      handlers?.onEnd?.();
    },
    { once: true, signal },
  );
  // A clip warmed at boot may already have failed (no baked mp3 for this step);
  // the error event is long gone by now, but play() still rejects, so both paths
  // land on the same TTS fallback.
  audio.addEventListener("error", fallback, { signal });
  void audio.play().catch(fallback);
}
