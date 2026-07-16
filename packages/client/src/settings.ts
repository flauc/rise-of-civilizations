// Machine-local player preferences. Persisted in localStorage so they survive
// across games (and page reloads) on this device. Settings are purely a client
// concern — they never travel to the server or into a save file.

import { Capacitor } from "@capacitor/core";

export type TurnUpdateView = "expanded" | "compact";

/** Player-chosen screen orientation; the game does not follow device rotation. */
export type ScreenRotation = "portrait" | "landscape";

export interface Settings {
  /** Whether the turn-start updates dialog auto-opens when a new turn begins. */
  turnUpdatePopup: boolean;
  /** Layout the turn-start updates dialog uses (carousel vs. one-screen list). */
  turnUpdateView: TurnUpdateView;
  /** Fixed screen orientation for mobile / installed app builds. */
  screenRotation: ScreenRotation;
  /** When true, skip the pre-attack preview and attack immediately. */
  autoAttack: boolean;
}

const STORAGE_KEY = "roc:settings";
const PORTRAIT_DEFAULT_MIGRATION = "roc:migrated-portrait-default-v1";

function prefersMobileShell(): boolean {
  if (typeof window === "undefined") return false;
  if (Capacitor.isNativePlatform()) return true;
  return window.matchMedia("(max-width: 860px), (pointer: coarse)").matches;
}

function defaultScreenRotation(): ScreenRotation {
  return prefersMobileShell() ? "portrait" : "landscape";
}

const DEFAULTS: Settings = {
  turnUpdatePopup: true,
  turnUpdateView: "expanded",
  screenRotation: "landscape",
  autoAttack: false,
};

let cache: Settings | null = null;
const listeners = new Set<(settings: Settings) => void>();

/** Subscribe to settings changes (same reference after each update). */
export function onSettingsChange(fn: (settings: Settings) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notifySettingsChange(settings: Settings): void {
  for (const fn of listeners) fn(settings);
}

/** Read the current settings, loading from localStorage on first access. */
export function getSettings(): Settings {
  if (cache) return cache;
  const next: Settings = { ...DEFAULTS, screenRotation: defaultScreenRotation() };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Settings>;
      if (typeof parsed.turnUpdatePopup === "boolean") next.turnUpdatePopup = parsed.turnUpdatePopup;
      if (parsed.turnUpdateView === "expanded" || parsed.turnUpdateView === "compact") {
        next.turnUpdateView = parsed.turnUpdateView;
      }
      if (parsed.screenRotation === "portrait" || parsed.screenRotation === "landscape") {
        next.screenRotation = parsed.screenRotation;
      } else {
        next.screenRotation = defaultScreenRotation();
      }
      if (typeof parsed.autoAttack === "boolean") next.autoAttack = parsed.autoAttack;
    }
  } catch {
    // Corrupt JSON or unavailable storage (private mode) → fall back to defaults.
  }
  if (prefersMobileShell() && !localStorage.getItem(PORTRAIT_DEFAULT_MIGRATION)) {
    try {
      localStorage.setItem(PORTRAIT_DEFAULT_MIGRATION, "1");
    } catch {
      /* ignore */
    }
    if (next.screenRotation === "landscape") {
      next.screenRotation = "portrait";
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
    }
  }
  cache = next;
  return next;
}

/** Merge a patch into the settings and persist the result. */
export function updateSettings(patch: Partial<Settings>): Settings {
  const next = { ...getSettings(), ...patch };
  cache = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Ignore write failures (quota, private mode); the in-memory cache still applies.
  }
  notifySettingsChange(next);
  return next;
}
