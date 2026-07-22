// Tutorial advisor voice — pre-recorded MP3 per step (ElevenLabs), browser TTS fallback.

import { assetUrl, bundledAssetUrl } from "./asset-base";
import { isNativeApp } from "./app-routes";
import {
  configureMobileAudio,
  ensureGameAudioUnlocked,
  isGameAudioUnlocked,
} from "./game-audio-unlock";
import { duckBackgroundMusic, unduckBackgroundMusic } from "./game-sounds";
import { TUTORIAL_STEP_IDS, type TutorialStepId } from "./tutorial-coach-steps";

const MP3_LOAD_TIMEOUT_MS = 15000;
const PLAY_RETRY_MS = 120;

let currentAudio: HTMLAudioElement | null = null;
let currentUtterance: SpeechSynthesisUtterance | null = null;
/** Scopes the listeners of the line in flight, since clip elements are reused. */
let currentListeners: AbortController | null = null;
const clipCache = new Map<TutorialStepId, HTMLAudioElement>();

let pendingBlocked: {
  text: string;
  stepId: TutorialStepId;
  handlers?: CoachSpeakHandlers;
} | null = null;
let gestureRetryBound = false;

let lastSpeakAttempt: {
  text: string;
  stepId: TutorialStepId;
  handlers?: CoachSpeakHandlers;
} | null = null;
let lastSpeakVoiceStarted = false;
let voiceBedDucked = false;

function duckVoiceBed(): void {
  if (voiceBedDucked) return;
  voiceBedDucked = true;
  duckBackgroundMusic();
}

function unduckVoiceBed(): void {
  if (!voiceBedDucked) return;
  voiceBedDucked = false;
  unduckBackgroundMusic();
}

type PlayResult = "ok" | "blocked" | "error";

/** Call from a user gesture (e.g. Tutorial / Start Game) so mobile WebKit allows MP3 playback. */
export function unlockCoachAudio(): void {
  void ensureGameAudioUnlocked().then((ok) => {
    if (ok) void primeCoachClip("t1_intro");
  });
}

/** Retry the current coach line after a fresh tap if voice never started. */
export function retryCoachVoiceIfNeeded(): void {
  if (lastSpeakVoiceStarted || !lastSpeakAttempt) return;
  void ensureGameAudioUnlocked().then((ok) => {
    if (!ok || !lastSpeakAttempt) return;
    const line = lastSpeakAttempt;
    speakCoachLine(line.text, line.stepId, line.handlers);
  });
}

/** Where ElevenLabs (or other) clips live: `public/coach/voice/<stepId>.mp3`. */
export function coachVoiceClipUrl(stepId: TutorialStepId): string {
  return isNativeApp()
    ? bundledAssetUrl(`coach/voice/${stepId}.mp3`)
    : assetUrl(`coach/voice/${stepId}.mp3`);
}

function makeClip(stepId: TutorialStepId): HTMLAudioElement {
  const audio = new Audio(coachVoiceClipUrl(stepId));
  audio.preload = "auto";
  configureMobileAudio(audio);
  return audio;
}

async function primeCoachClip(stepId: TutorialStepId): Promise<void> {
  try {
    const audio = clipFor(stepId, true);
    if (audio.readyState < HTMLMediaElement.HAVE_METADATA) {
      await new Promise<void>((resolve, reject) => {
        const timer = window.setTimeout(() => reject(new Error("timeout")), 8000);
        audio.addEventListener(
          "canplay",
          () => {
            window.clearTimeout(timer);
            resolve();
          },
          { once: true },
        );
        audio.addEventListener(
          "error",
          () => {
            window.clearTimeout(timer);
            reject(new Error("load"));
          },
          { once: true },
        );
        void audio.load();
      });
    }
    const vol = audio.volume;
    audio.volume = 0.001;
    await audio.play();
    audio.pause();
    audio.currentTime = 0;
    audio.volume = vol;
  } catch {
    /* gesture window may have closed, or clip missing */
  }
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
    const audio = makeClip(stepId);
    audio.load();
    clipCache.set(stepId, audio);
  }
}

/** A warmed clip if we have one, else a fresh element that loads on demand. */
function clipFor(stepId: TutorialStepId, fresh = false): HTMLAudioElement {
  if (!fresh) {
    const cached = clipCache.get(stepId);
    // Rewind rather than re-fetch: a step can be spoken again across games.
    if (cached) {
      cached.currentTime = 0;
      return cached;
    }
  }
  const audio = makeClip(stepId);
  clipCache.set(stepId, audio);
  return audio;
}

async function tryPlayAudio(audio: HTMLAudioElement): Promise<PlayResult> {
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      await audio.play();
      return "ok";
    } catch (e) {
      if (e instanceof DOMException && (e.name === "NotAllowedError" || e.name === "AbortError")) {
        return "blocked";
      }
      await new Promise((r) => window.setTimeout(r, PLAY_RETRY_MS * (attempt + 1)));
    }
  }
  return "error";
}

function bindGestureRetry(): void {
  if (gestureRetryBound) return;
  gestureRetryBound = true;
  const onGesture = (): void => {
    gestureRetryBound = false;
    void ensureGameAudioUnlocked().then((ok) => {
      const pending = pendingBlocked;
      pendingBlocked = null;
      if (pending && ok) speakCoachLine(pending.text, pending.stepId, pending.handlers);
    });
  };
  document.addEventListener("pointerdown", onGesture, { capture: true, once: true });
  document.addEventListener("touchstart", onGesture, { capture: true, once: true });
}

/** Stop any line currently being spoken. */
export function stopCoachVoice(): void {
  pendingBlocked = null;
  currentListeners?.abort();
  currentListeners = null;
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
    currentAudio = null;
  }
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  currentUtterance = null;
  unduckVoiceBed();
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
    unduckVoiceBed();
    onEnd?.();
  };
  u.onerror = () => {
    if (currentUtterance === u) currentUtterance = null;
    unduckVoiceBed();
    onEnd?.();
  };
  duckVoiceBed();
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

  lastSpeakAttempt = { text, stepId, handlers };
  lastSpeakVoiceStarted = false;

  let audio = clipFor(stepId);
  currentAudio = audio;
  const ac = new AbortController();
  currentListeners = ac;
  const { signal } = ac;
  let started = false;
  let settled = false;

  const fallback = (): void => {
    if (settled) return;
    settled = true;
    currentAudio = null;
    ac.abort();
    currentListeners = null;
    speakWithBrowserTts(text, handlers?.onEnd);
    handlers?.onFallback?.();
  };

  const deferUntilGesture = (): void => {
    if (settled) return;
    settled = true;
    currentAudio = null;
    ac.abort();
    currentListeners = null;
    pendingBlocked = { text, stepId, handlers };
    bindGestureRetry();
    handlers?.onFallback?.();
  };

  const wireClip = (clip: HTMLAudioElement): void => {
    clip.addEventListener(
      "playing",
      () => {
        clearLoadTimer();
        duckVoiceBed();
        if (currentAudio === clip) {
          lastSpeakVoiceStarted = true;
          handlers?.onPlay?.(Number.isFinite(clip.duration) ? clip.duration : 0);
        }
      },
      { once: true, signal },
    );
    clip.addEventListener(
      "ended",
      () => {
        clearLoadTimer();
        if (currentAudio !== clip) return;
        currentAudio = null;
        currentListeners = null;
        unduckVoiceBed();
        handlers?.onEnd?.();
      },
      { once: true, signal },
    );
    clip.addEventListener("error", fallback, { signal });
  };

  const loadTimer = window.setTimeout(() => {
    if (!settled && currentAudio === audio && audio.paused) fallback();
  }, MP3_LOAD_TIMEOUT_MS);
  const clearLoadTimer = (): void => window.clearTimeout(loadTimer);

  wireClip(audio);

  const attemptPlay = async (): Promise<void> => {
    if (settled || currentAudio !== audio) return;

    let result = await tryPlayAudio(audio);
    if (result === "ok" || settled || currentAudio !== audio) return;
    if (result === "blocked") {
      deferUntilGesture();
      return;
    }

    // Clips warmed before unlock can stay blocked on iOS — retry with a fresh element.
    if (isGameAudioUnlocked()) {
      audio = clipFor(stepId, true);
      currentAudio = audio;
      wireClip(audio);
      if (audio.readyState < HTMLMediaElement.HAVE_METADATA) {
        await new Promise<void>((resolve) => {
          audio.addEventListener("canplay", () => resolve(), { once: true, signal });
          void audio.load();
        });
      }
      result = await tryPlayAudio(audio);
      if (result === "ok" || settled || currentAudio !== audio) return;
      if (result === "blocked") {
        deferUntilGesture();
        return;
      }
    }

    if (!isGameAudioUnlocked()) deferUntilGesture();
    else fallback();
  };

  const startPlayback = (): void => {
    if (started || settled || currentAudio !== audio) return;
    started = true;
    void attemptPlay();
  };

  if (audio.readyState >= HTMLMediaElement.HAVE_METADATA) {
    startPlayback();
  } else {
    audio.addEventListener("loadedmetadata", startPlayback, { once: true, signal });
    audio.addEventListener("canplay", startPlayback, { once: true, signal });
    void audio.load();
  }
}
