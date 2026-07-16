// Loading-scroll narrator voice — pre-baked ElevenLabs MP3 per civ, browser TTS fallback.

import { assetUrl, bundledAssetUrl } from "./asset-base";
import { isNativeApp } from "./app-routes";

/** Pre-baked clip speed in the browser (1 = normal). Text sync follows currentTime. */
export const LOADING_VOICE_PLAYBACK_RATE = 1;

const MP3_LOAD_TIMEOUT_MS = 15000;
const PLAY_RETRY_MS = 120;

let currentAudio: HTMLAudioElement | null = null;
let currentUtterance: SpeechSynthesisUtterance | null = null;
let audioUnlocked = false;
const preloadCache = new Map<string, HTMLAudioElement>();

export function loadingVoiceClipUrl(civId: string, version?: string | null): string {
  // Native shell bundles loading/voice/*.mp3 locally; CDN is the fallback elsewhere.
  const base = isNativeApp()
    ? bundledAssetUrl(`loading/voice/${civId}.mp3`)
    : assetUrl(`loading/voice/${civId}.mp3`);
  if (!version) return base;
  return `${base}${base.includes("?") ? "&" : "?"}v=${encodeURIComponent(version)}`;
}

/** Call from a user gesture (e.g. Start Game) so mobile WebKit allows MP3 playback. */
export function unlockLoadingAudio(): void {
  if (audioUnlocked) return;
  audioUnlocked = true;
  const probe = new Audio();
  probe.src =
    "data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4LjI5LjEwMAAAAAAAAAAAAAAA//uQxAAAAAANIAAAAAExBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq";
  void probe.play().catch(() => {});
}

/** Warm the MP3 while the scroll mounts so playback can start during worldgen. */
export function preloadLoadingVoice(civId: string, version?: string | null): void {
  const url = loadingVoiceClipUrl(civId, version);
  if (preloadCache.has(url)) return;
  const audio = new Audio(url);
  audio.preload = "auto";
  audio.load();
  preloadCache.set(url, audio);
}

export function loadingVoiceVersionUrl(civId: string): string {
  return isNativeApp()
    ? bundledAssetUrl(`loading/voice/${civId}.version`)
    : assetUrl(`loading/voice/${civId}.version`);
}

/** Bust MP3 cache after rebakes (text file alone does not change). */
export async function fetchLoadingVoiceVersion(civId: string): Promise<string | null> {
  try {
    const res = await fetch(loadingVoiceVersionUrl(civId), { cache: "no-cache" });
    if (!res.ok) return null;
    const v = (await res.text()).trim();
    return v || null;
  } catch {
    return null;
  }
}

export function loadingVoiceScriptUrl(civId: string): string {
  return isNativeApp()
    ? bundledAssetUrl(`loading/voice/${civId}.txt`)
    : assetUrl(`loading/voice/${civId}.txt`);
}

/** Exact script baked alongside the MP3 (if present). */
export async function fetchBakedLoadingScript(civId: string): Promise<string | null> {
  try {
    const res = await fetch(loadingVoiceScriptUrl(civId), { cache: "no-cache" });
    if (!res.ok) return null;
    const text = (await res.text()).trim();
    return text || null;
  } catch {
    return null;
  }
}

export function stopLoadingVoice(): void {
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
  u.rate = 0.9 * LOADING_VOICE_PLAYBACK_RATE;
  u.pitch = 0.92;
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

export interface LoadingSpeakHandlers {
  /** Cache-bust token from `<civId>.version` sidecar (written when MP3 is baked). */
  voiceVersion?: string | null;
  /** Fires when the clip actually starts playing — wire text sync here. */
  onSyncStart?: (audio: HTMLAudioElement) => void;
  onFallback?: () => void;
  onEnd?: () => void;
}

function takePreloadedAudio(url: string): HTMLAudioElement {
  const cached = preloadCache.get(url);
  if (cached) {
    preloadCache.delete(url);
    return cached;
  }
  const audio = new Audio(url);
  audio.preload = "auto";
  return audio;
}

async function tryPlayAudio(audio: HTMLAudioElement): Promise<boolean> {
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      await audio.play();
      return true;
    } catch {
      await new Promise((r) => window.setTimeout(r, PLAY_RETRY_MS * (attempt + 1)));
    }
  }
  return false;
}

/** Speak the loading scroll. Uses `loading/voice/<civId>.mp3` when present. */
export function speakLoadingLine(text: string, civId: string, handlers?: LoadingSpeakHandlers): void {
  if (!text) {
    handlers?.onEnd?.();
    return;
  }
  stopLoadingVoice();

  const url = loadingVoiceClipUrl(civId, handlers?.voiceVersion);
  const audio = takePreloadedAudio(url);
  audio.playbackRate = LOADING_VOICE_PLAYBACK_RATE;
  currentAudio = audio;
  let started = false;
  let settled = false;

  const fallback = (): void => {
    if (settled || currentAudio !== audio) return;
    settled = true;
    currentAudio = null;
    handlers?.onFallback?.();
    speakWithBrowserTts(text, handlers?.onEnd);
  };

  const startPlayback = (): void => {
    if (started || settled || currentAudio !== audio) return;
    started = true;
    void tryPlayAudio(audio).then((ok) => {
      if (!ok && currentAudio === audio && !settled) fallback();
    });
  };

  const loadTimer = window.setTimeout(() => {
    if (!settled && currentAudio === audio && audio.paused) fallback();
  }, MP3_LOAD_TIMEOUT_MS);

  const clearLoadTimer = (): void => window.clearTimeout(loadTimer);

  audio.addEventListener(
    "playing",
    () => {
      clearLoadTimer();
      if (currentAudio === audio) handlers?.onSyncStart?.(audio);
    },
    { once: true },
  );
  audio.addEventListener(
    "ended",
    () => {
      clearLoadTimer();
      if (currentAudio !== audio) return;
      currentAudio = null;
      handlers?.onEnd?.();
    },
    { once: true },
  );
  audio.addEventListener(
    "error",
    () => {
      clearLoadTimer();
      fallback();
    },
    { once: true },
  );

  if (audio.readyState >= HTMLMediaElement.HAVE_METADATA) {
    startPlayback();
  } else {
    audio.addEventListener("loadedmetadata", startPlayback, { once: true });
    audio.addEventListener("canplay", startPlayback, { once: true });
    void audio.load();
  }
}
