// Ambient background music and combat SFX — HTML5 Audio on mobile WebView, Web Audio on desktop.

import type { ActiveAbilityId, GameState } from "@roc/sim";
import { assetUrl, bundledAssetUrl } from "./asset-base";
import { isNativeApp } from "./app-routes";
import { configureMobileAudio, unlockGameAudio } from "./game-audio-unlock";
import { getSettings, onSettingsChange } from "./settings";
import { isPhoneShell } from "./viewport-shell";

const COMBAT_LOG =
  /\bbombarded\b|\bevaded the attack\b|\bstormed a fortification\b|\bwas destroyed\b|\bwalked into an ambush\b/i;

/** Targeted abilities that do not deal damage (skip attack SFX). */
const NON_COMBAT_TARGETED = new Set<ActiveAbilityId>(["uprising"]);

const MUSIC_GAIN = 0.38;
const SFX_GAIN = 0.65;
const DUCK_GAIN = 0.12;
const HTML_BGM_VOLUME = 0.62;
const HTML_BGM_DUCK = 0.1;
const HTML_SFX_VOLUME = 0.9;
const MELODY_NOTES = [220, 247, 262, 294, 330, 392, 440];

/** Android/iOS WebView handles HTML5 Audio reliably; Web Audio oscillators often stay silent. */
function preferHtmlAudio(): boolean {
  return isNativeApp() || isPhoneShell();
}

/** Where the BGM/SFX files live — dev server, bundled shell, or CDN. */
function gameAudioUrl(path: string): string {
  const clean = path.replace(/^\/+/, "");
  // Capacitor live reload (run:android:dev) loads from Vite — not https://localhost.
  if (import.meta.env.DEV) {
    return `${location.origin}/${clean}`;
  }
  if (isNativeApp()) return bundledAssetUrl(clean);
  return assetUrl(clean);
}

function ensureBgmElement(): HTMLAudioElement {
  if (bgmElement) return bgmElement;
  bgmElement = new Audio(gameAudioUrl("audio/bgm-ancient.wav"));
  bgmElement.loop = true;
  bgmElement.preload = "auto";
  configureMobileAudio(bgmElement);
  bgmElement.addEventListener("error", () => {
    if (import.meta.env.DEV) {
      console.warn("[roc-audio] BGM load failed:", bgmElement?.src);
    }
    bgmStarted = false;
  });
  bgmElement.load();
  return bgmElement;
}

/** Start or resume BGM — call synchronously from a tap/click handler when possible. */
function tryPlayBgm(fromGesture: boolean): void {
  if (!getSettings().musicEnabled) return;
  const el = ensureBgmElement();
  applyHtmlBgmVolume();
  const start = (): void => {
    if (!getSettings().musicEnabled || !bgmElement) return;
    const ret = bgmElement.play();
    if (ret !== undefined) {
      void ret
        .then(() => {
          bgmStarted = true;
        })
        .catch((err: unknown) => {
          bgmStarted = false;
          if (import.meta.env.DEV) console.warn("[roc-audio] BGM play blocked:", err);
        });
    }
  };
  if (el.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
    start();
    return;
  }
  el.addEventListener("canplay", start, { once: true });
  if (fromGesture) start();
}

let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let musicGain: GainNode | null = null;
let sfxGain: GainNode | null = null;
let musicFilter: BiquadFilterNode | null = null;

let bgmStarted = false;
let melodyTimer: ReturnType<typeof setInterval> | null = null;
let droneOscs: OscillatorNode[] = [];
let duckDepth = 0;

let bgmElement: HTMLAudioElement | null = null;

let logCursor = 0;
let skipCombatDetectOnce = false;
let lastCombatAt = 0;

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

export function markPlayerCombatSound(): void {
  primeWebAudioFromGesture();
  playCombatSound();
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
    if (msg && isCombatLogMessage(msg)) playCombatSound();
  }
  logCursor = state.log.length;
}

function audioContextCtor(): typeof AudioContext | null {
  return window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext ?? null;
}

function ensureGraph(audio: AudioContext): void {
  if (masterGain) return;
  masterGain = audio.createGain();
  masterGain.gain.value = 1;
  masterGain.connect(audio.destination);

  musicGain = audio.createGain();
  musicFilter = audio.createBiquadFilter();
  musicFilter.type = "lowpass";
  musicFilter.frequency.value = 1800;
  musicFilter.Q.value = 0.6;
  musicGain.connect(musicFilter);
  musicFilter.connect(masterGain);

  sfxGain = audio.createGain();
  sfxGain.connect(masterGain);
  applyVolumeSettings();
}

export function primeWebAudioFromGesture(): boolean {
  if (preferHtmlAudio()) return primeHtmlAudioFromGesture();
  const Ctx = audioContextCtor();
  if (!Ctx) return false;
  if (!ctx) {
    ctx = new Ctx();
    ensureGraph(ctx);
  }
  applyVolumeSettings();
  if (ctx.state === "suspended") {
    void ctx.resume().then(() => {
      if (ctx?.state === "running" && getSettings().musicEnabled) void startBackgroundMusic();
    });
  }
  return true;
}

function primeHtmlAudioFromGesture(): boolean {
  unlockGameAudio();
  tryPlayBgm(true);
  return true;
}

function applyHtmlBgmVolume(): void {
  if (!bgmElement) return;
  const s = getSettings();
  if (!s.musicEnabled) {
    bgmElement.pause();
    return;
  }
  bgmElement.volume = duckDepth > 0 ? HTML_BGM_DUCK : HTML_BGM_VOLUME;
}

async function startHtmlBackgroundMusic(): Promise<void> {
  tryPlayBgm(false);
}

function stopHtmlBackgroundMusic(): void {
  if (bgmElement) {
    bgmElement.pause();
    try {
      bgmElement.currentTime = 0;
    } catch {
      /* ignore */
    }
  }
  bgmStarted = false;
}

function applyVolumeSettings(): void {
  const s = getSettings();
  if (preferHtmlAudio()) {
    applyHtmlBgmVolume();
    return;
  }
  if (musicGain) musicGain.gain.value = s.musicEnabled ? (duckDepth > 0 ? DUCK_GAIN : MUSIC_GAIN) : 0;
  if (sfxGain) sfxGain.gain.value = s.sfxEnabled ? SFX_GAIN : 0;
}

function scheduleMelodyNote(audio: AudioContext): void {
  if (!musicGain || !getSettings().musicEnabled || audio.state !== "running") return;
  const note = MELODY_NOTES[Math.floor(Math.random() * MELODY_NOTES.length)]!;
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = "triangle";
  osc.frequency.value = note;
  const t = audio.currentTime;
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.07, t + 0.08);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 2.4);
  osc.connect(gain);
  gain.connect(musicGain);
  osc.start(t);
  osc.stop(t + 2.5);
}

function startDrone(audio: AudioContext): void {
  if (!musicGain || audio.state !== "running") return;
  stopDrone();
  for (const freq of [55, 82.5]) {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.value = 0.055;
    osc.connect(gain);
    gain.connect(musicGain);
    osc.start();
    droneOscs.push(osc);
  }
}

function stopDrone(): void {
  for (const osc of droneOscs) {
    try {
      osc.stop();
    } catch {
      /* already stopped */
    }
  }
  droneOscs = [];
}

function stopMelodyTimer(): void {
  if (melodyTimer != null) {
    clearInterval(melodyTimer);
    melodyTimer = null;
  }
}

export async function initGameSounds(): Promise<boolean> {
  if (preferHtmlAudio()) return primeHtmlAudioFromGesture();
  if (!ctx) return false;
  if (ctx.state === "suspended") {
    try {
      await ctx.resume();
    } catch {
      return false;
    }
  }
  return ctx.state === "running";
}

export async function startBackgroundMusic(): Promise<void> {
  if (!getSettings().musicEnabled) return;
  if (preferHtmlAudio()) {
    await startHtmlBackgroundMusic();
    return;
  }
  if (!ctx) return;
  if (ctx.state === "suspended") {
    try {
      await ctx.resume();
    } catch {
      return;
    }
  }
  if (ctx.state !== "running") return;
  if (bgmStarted) return;
  bgmStarted = true;
  startDrone(ctx);
  scheduleMelodyNote(ctx);
  stopMelodyTimer();
  melodyTimer = setInterval(() => {
    if (!getSettings().musicEnabled || !ctx || ctx.state !== "running") return;
    scheduleMelodyNote(ctx);
  }, 3200 + Math.random() * 1800);
  applyVolumeSettings();
}

export function stopBackgroundMusic(): void {
  if (preferHtmlAudio()) {
    stopHtmlBackgroundMusic();
    return;
  }
  stopMelodyTimer();
  stopDrone();
  bgmStarted = false;
}

export function playCombatSound(): void {
  if (!getSettings().sfxEnabled) return;
  const now = performance.now();
  if (now - lastCombatAt < 90) return;
  lastCombatAt = now;
  if (preferHtmlAudio()) {
    void playHtmlCombatSound();
    return;
  }
  void emitCombatSoundWhenReady();
}

async function playHtmlCombatSound(): Promise<void> {
  const clip = new Audio(gameAudioUrl("audio/combat-clash.wav"));
  configureMobileAudio(clip);
  clip.volume = HTML_SFX_VOLUME;
  const ret = clip.play();
  if (ret !== undefined) {
    void ret.catch((err: unknown) => {
      if (import.meta.env.DEV) console.warn("[roc-audio] SFX play blocked:", err);
    });
  }
}

async function emitCombatSoundWhenReady(): Promise<void> {
  if (!ctx || !sfxGain) return;
  if (ctx.state === "suspended") {
    try {
      await ctx.resume();
    } catch {
      return;
    }
  }
  if (ctx.state !== "running") return;
  emitCombatSound(ctx);
}

function emitCombatSound(audio: AudioContext): void {
  if (!sfxGain) return;
  const t = audio.currentTime;
  const bufferSize = Math.floor(audio.sampleRate * 0.18);
  const buffer = audio.createBuffer(1, bufferSize, audio.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    const env = Math.pow(1 - i / bufferSize, 2.2);
    data[i] = (Math.random() * 2 - 1) * env;
  }
  const noise = audio.createBufferSource();
  noise.buffer = buffer;
  const noiseFilter = audio.createBiquadFilter();
  noiseFilter.type = "bandpass";
  noiseFilter.frequency.value = 900;
  noiseFilter.Q.value = 0.8;
  const noiseGain = audio.createGain();
  noiseGain.gain.setValueAtTime(0.0001, t);
  noiseGain.gain.exponentialRampToValueAtTime(0.45, t + 0.01);
  noiseGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
  noise.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  noiseGain.connect(sfxGain);
  noise.start(t);
  noise.stop(t + 0.2);

  const blade = audio.createOscillator();
  const bladeGain = audio.createGain();
  blade.type = "sawtooth";
  blade.frequency.setValueAtTime(520, t);
  blade.frequency.exponentialRampToValueAtTime(180, t + 0.09);
  bladeGain.gain.setValueAtTime(0.0001, t);
  bladeGain.gain.exponentialRampToValueAtTime(0.16, t + 0.008);
  bladeGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
  blade.connect(bladeGain);
  bladeGain.connect(sfxGain);
  blade.start(t);
  blade.stop(t + 0.12);
}

export function duckBackgroundMusic(): void {
  duckDepth++;
  applyVolumeSettings();
}

export function unduckBackgroundMusic(): void {
  duckDepth = Math.max(0, duckDepth - 1);
  applyVolumeSettings();
}

export function unlockAppAudioFromGesture(): void {
  unlockGameAudio();
  if (preferHtmlAudio()) {
    primeHtmlAudioFromGesture();
    return;
  }
  primeWebAudioFromGesture();
  if (getSettings().musicEnabled) void startBackgroundMusic();
}

onSettingsChange((s) => {
  applyVolumeSettings();
  if (s.musicEnabled) {
    if (!bgmStarted) void startBackgroundMusic();
    else if (preferHtmlAudio() && bgmElement?.paused) void startHtmlBackgroundMusic();
  } else {
    stopBackgroundMusic();
  }
});
