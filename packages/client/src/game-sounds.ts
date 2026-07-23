// Ambient background music and weapon-specific combat SFX (HTML5 Audio everywhere).

import { bgmTrackForCiv, CIV_BGM_TRACKS } from "@roc/data";
import type { ActiveAbilityId, GameState } from "@roc/sim";
import { assetUrl, bundledAssetUrl } from "./asset-base";
import { isNativeApp } from "./app-routes";
import { pickBombardClip, pickCombatClipForLog, pickCombatClipForUnit } from "./combat-audio";
import { configureMobileAudio, unlockGameAudio } from "./game-audio-unlock";
import { getSettings, onSettingsChange } from "./settings";

const COMBAT_LOG =
  /\bbombarded\b|\bevaded the attack\b|\bstormed a fortification\b|\bwas destroyed\b|\bwalked into an ambush\b/i;

/** Targeted abilities that do not deal damage (skip attack SFX). */
const NON_COMBAT_TARGETED = new Set<ActiveAbilityId>(["uprising"]);

const HTML_BGM_VOLUME = 0.45;
const HTML_BGM_DUCK = 0.1;
const HTML_SFX_VOLUME = 1;
const BGM_CROSSFADE_MS = 2200;
const BUILDING_SFX = "audio/building.wav";

const DEFAULT_BGM_TRACK = CIV_BGM_TRACKS.default;

/** Where the BGM/SFX files live — dev server, bundled shell, or CDN. */
export function gameAudioUrl(path: string): string {
  const clean = path.replace(/^\/+/, "");
  const encoded = clean.split("/").map((segment) => encodeURIComponent(segment)).join("/");
  if (import.meta.env.DEV) {
    return `${location.origin}/${encoded}`;
  }
  if (isNativeApp()) return bundledAssetUrl(encoded);
  return assetUrl(encoded);
}

function musicVolumeScale(): number {
  const v = getSettings().musicVolume;
  return Number.isFinite(v) ? v : 1;
}

function sfxVolumeScale(): number {
  const v = getSettings().sfxVolume;
  return Number.isFinite(v) ? v : 1;
}

function bgmTargetVolume(): number {
  if (!getSettings().musicEnabled) return 0;
  const base = duckDepth > 0 ? HTML_BGM_DUCK : HTML_BGM_VOLUME;
  return base * musicVolumeScale();
}

function ensureBgmSlot(slot: 0 | 1): HTMLAudioElement {
  if (!bgmSlots[slot]) {
    const el = new Audio();
    el.loop = true;
    el.preload = "auto";
    configureMobileAudio(el);
    bgmSlots[slot] = el;
  }
  return bgmSlots[slot]!;
}

function loadTrackOn(el: HTMLAudioElement, trackPath: string): void {
  const url = gameAudioUrl(trackPath);
  if (el.src !== url) {
    el.src = url;
    el.load();
  }
}

function playWhenReady(el: HTMLAudioElement, start: () => void): void {
  if (el.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
    start();
    return;
  }
  el.addEventListener("canplay", start, { once: true });
}

function cancelCrossfade(): void {
  if (fadeFrame != null) {
    cancelAnimationFrame(fadeFrame);
    fadeFrame = null;
  }
}

function pauseAllBgm(): void {
  cancelCrossfade();
  for (const el of bgmSlots) {
    if (!el) continue;
    el.pause();
    try {
      el.currentTime = 0;
    } catch {
      /* ignore */
    }
  }
  bgmStarted = false;
  currentTrack = null;
}

function crossfadeToTrack(trackPath: string, fromGesture: boolean): void {
  if (!getSettings().musicEnabled) return;
  if (currentTrack === trackPath && bgmStarted) {
    applyBgmVolume();
    return;
  }

  const targetVol = bgmTargetVolume();
  const nextSlot = (activeSlot === 0 ? 1 : 0) as 0 | 1;
  const outgoing = bgmSlots[activeSlot];
  const incoming = ensureBgmSlot(nextSlot);
  loadTrackOn(incoming, trackPath);

  const beginIncoming = (): void => {
    incoming.volume = outgoing && bgmStarted ? 0 : targetVol;
    const ret = incoming.play();
    if (ret !== undefined) {
      void ret
        .then(() => {
          bgmStarted = true;
        })
        .catch((err: unknown) => {
          if (import.meta.env.DEV) console.warn("[roc-audio] BGM play blocked:", err);
        });
    }
  };

  if (!outgoing || !bgmStarted || !currentTrack) {
    cancelCrossfade();
    playWhenReady(incoming, beginIncoming);
    if (fromGesture) beginIncoming();
    activeSlot = nextSlot;
    currentTrack = trackPath;
    return;
  }

  cancelCrossfade();
  playWhenReady(incoming, beginIncoming);
  if (fromGesture) beginIncoming();

  const outStartVol = outgoing.volume;
  const fadeStart = performance.now();

  const tick = (): void => {
    const t = Math.min(1, (performance.now() - fadeStart) / BGM_CROSSFADE_MS);
    const ease = t * t * (3 - 2 * t);
    const vol = bgmTargetVolume();
    incoming.volume = vol * ease;
    outgoing.volume = outStartVol * (1 - ease);
    if (t < 1) {
      fadeFrame = requestAnimationFrame(tick);
      return;
    }
    outgoing.pause();
    try {
      outgoing.currentTime = 0;
    } catch {
      /* ignore */
    }
    activeSlot = nextSlot;
    currentTrack = trackPath;
    incoming.volume = vol;
    fadeFrame = null;
  };
  fadeFrame = requestAnimationFrame(tick);
}

let pendingCivId: string | null = null;

/** Crossfade lobby / in-game BGM to match a civilization (or keep current when civ is random). */
export function setCivilizationBgm(civId: string | null | undefined, opts?: { fromGesture?: boolean }): void {
  if (!civId || civId === "random") return;
  pendingCivId = civId;
  if (!getSettings().musicEnabled) return;
  crossfadeToTrack(bgmTrackForCiv(civId), opts?.fromGesture ?? false);
}

/** Start default BGM when no civilization is featured yet. */
export function startDefaultBackgroundMusic(fromGesture = false): void {
  crossfadeToTrack(DEFAULT_BGM_TRACK, fromGesture);
}

let bgmStarted = false;
let duckDepth = 0;
let activeSlot: 0 | 1 = 0;
let currentTrack: string | null = null;
let fadeFrame: number | null = null;
const bgmSlots: [HTMLAudioElement | null, HTMLAudioElement | null] = [null, null];

let logCursor = 0;
let skipCombatDetectOnce = false;
let lastCombatAt = 0;
let lastBuildingAt = 0;

export function isCombatLogMessage(message: string): boolean {
  return COMBAT_LOG.test(message);
}

export function isCombatTargetedAbility(ability: ActiveAbilityId): boolean {
  return !NON_COMBAT_TARGETED.has(ability);
}

export function resetCombatSoundTracking(): void {
  logCursor = 0;
  skipCombatDetectOnce = false;
  lastCombatAt = 0;
}

export function markPlayerCombatSound(unitType?: string, opts?: { bombard?: boolean }): void {
  primeAudioFromGesture();
  playCombatSound(opts?.bombard ? pickBombardClip() : pickCombatClipForUnit(unitType));
  skipCombatDetectOnce = true;
}

export function syncCombatSounds(state: GameState): void {
  if (skipCombatDetectOnce) {
    skipCombatDetectOnce = false;
    logCursor = state.log.length;
    return;
  }
  for (let i = logCursor; i < state.log.length; i++) {
    const msg = state.log[i]?.message;
    if (msg && isCombatLogMessage(msg)) playCombatSound(pickCombatClipForLog(msg));
  }
  logCursor = state.log.length;
}

export function primeWebAudioFromGesture(): boolean {
  return primeAudioFromGesture();
}

function primeAudioFromGesture(): boolean {
  unlockGameAudio();
  if (pendingCivId) {
    crossfadeToTrack(bgmTrackForCiv(pendingCivId), true);
  } else if (!bgmStarted) {
    startDefaultBackgroundMusic(true);
  } else if (bgmSlots[activeSlot]?.paused) {
    const ret = bgmSlots[activeSlot]!.play();
    if (ret !== undefined) void ret.catch(() => undefined);
  }
  return true;
}

function applyBgmVolume(): void {
  if (!getSettings().musicEnabled) {
    pauseAllBgm();
    return;
  }
  if (fadeFrame != null) return;
  const vol = bgmTargetVolume();
  const active = bgmSlots[activeSlot];
  if (active) active.volume = vol;
}

export async function initGameSounds(): Promise<boolean> {
  return primeAudioFromGesture();
}

export async function startBackgroundMusic(): Promise<void> {
  if (!getSettings().musicEnabled) return;
  if (!currentTrack) startDefaultBackgroundMusic(false);
  else if (bgmSlots[activeSlot]?.paused) {
    const ret = bgmSlots[activeSlot]!.play();
    if (ret !== undefined) void ret.catch(() => undefined);
  }
}

export function stopBackgroundMusic(): void {
  pauseAllBgm();
}

export function playCombatSound(clipPath?: string): void {
  if (!getSettings().sfxEnabled) return;
  const now = performance.now();
  if (now - lastCombatAt < 90) return;
  lastCombatAt = now;
  void playHtmlOneShotSfx(clipPath ?? pickCombatClipForUnit(), pickCombatClipForUnit());
}

/** Hammer-on-wood cue when the player queues a tile work, city build, or wonder. */
export function playBuildingSound(): void {
  if (!getSettings().sfxEnabled) return;
  const now = performance.now();
  if (now - lastBuildingAt < 120) return;
  lastBuildingAt = now;
  void playHtmlOneShotSfx(BUILDING_SFX);
}

async function playHtmlOneShotSfx(clipPath: string, fallbackPath?: string): Promise<void> {
  const clip = new Audio(gameAudioUrl(clipPath));
  configureMobileAudio(clip);
  clip.volume = HTML_SFX_VOLUME * sfxVolumeScale();
  clip.addEventListener(
    "error",
    () => {
      if (fallbackPath && clipPath !== fallbackPath) {
        void playHtmlOneShotSfx(fallbackPath);
      } else if (import.meta.env.DEV) {
        console.warn("[roc-audio] SFX load failed:", clip.src);
      }
    },
    { once: true },
  );
  const ret = clip.play();
  if (ret !== undefined) {
    void ret.catch((err: unknown) => {
      if (import.meta.env.DEV) console.warn("[roc-audio] SFX play blocked:", err);
    });
  }
}

export function duckBackgroundMusic(): void {
  duckDepth++;
  applyBgmVolume();
}

export function unduckBackgroundMusic(): void {
  duckDepth = Math.max(0, duckDepth - 1);
  applyBgmVolume();
}

export function unlockAppAudioFromGesture(): void {
  unlockGameAudio();
  primeAudioFromGesture();
  if (getSettings().musicEnabled) void startBackgroundMusic();
}

onSettingsChange((s) => {
  applyBgmVolume();
  if (s.musicEnabled) {
    void startBackgroundMusic();
  } else {
    stopBackgroundMusic();
  }
});
