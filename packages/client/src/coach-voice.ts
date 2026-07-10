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

function speakWithBrowserTts(text: string): void {
  if (!text || !("speechSynthesis" in window)) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "en-US";
  u.rate = 0.93;
  u.pitch = 0.95;
  currentUtterance = u;
  window.speechSynthesis.speak(u);
}

/**
 * Speak a tutorial line. Uses `coach/voice/<stepId>.mp3` when the file exists;
 * otherwise falls back to browser speech synthesis.
 */
export function speakCoachLine(text: string, stepId?: TutorialStepId): void {
  if (!text) return;
  stopCoachVoice();

  if (!stepId) {
    speakWithBrowserTts(text);
    return;
  }

  const audio = new Audio(coachVoiceClipUrl(stepId));
  currentAudio = audio;
  audio.addEventListener("error", () => {
    if (currentAudio === audio) {
      currentAudio = null;
      speakWithBrowserTts(text);
    }
  });
  void audio.play().catch(() => {
    if (currentAudio === audio) currentAudio = null;
    speakWithBrowserTts(text);
  });
}
