// Tutorial advisor voice — pre-recorded MP3 per step (ElevenLabs), browser TTS fallback.

import { assetUrl } from "./asset-base";
import type { TutorialStepId } from "./tutorial-coach";

let currentAudio: HTMLAudioElement | null = null;
let currentUtterance: SpeechSynthesisUtterance | null = null;

/** Where ElevenLabs (or other) clips live: `public/coach/voice/<stepId>.mp3`. */
export function coachVoiceClipUrl(stepId: TutorialStepId): string {
  return assetUrl(`coach/voice/${stepId}.mp3`);
}

/** Stop any line currently being spoken. */
export function stopCoachVoice(): void {
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

  const audio = new Audio(coachVoiceClipUrl(stepId));
  currentAudio = audio;
  const fallback = (): void => {
    if (currentAudio !== audio) return;
    currentAudio = null;
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
    { once: true },
  );
  audio.addEventListener(
    "ended",
    () => {
      if (currentAudio !== audio) return;
      currentAudio = null;
      handlers?.onEnd?.();
    },
    { once: true },
  );
  audio.addEventListener("error", fallback);
  void audio.play().catch(fallback);
}
