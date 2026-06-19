// Machine-local player preferences. Persisted in localStorage so they survive
// across games (and page reloads) on this device. Settings are purely a client
// concern — they never travel to the server or into a save file.

export type TurnUpdateView = "expanded" | "compact";

export interface Settings {
  /** Whether the turn-start updates dialog auto-opens when a new turn begins. */
  turnUpdatePopup: boolean;
  /** Layout the turn-start updates dialog uses (carousel vs. one-screen list). */
  turnUpdateView: TurnUpdateView;
}

const STORAGE_KEY = "roc:settings";

const DEFAULTS: Settings = {
  turnUpdatePopup: true,
  turnUpdateView: "expanded",
};

let cache: Settings | null = null;

/** Read the current settings, loading from localStorage on first access. */
export function getSettings(): Settings {
  if (cache) return cache;
  const next: Settings = { ...DEFAULTS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Settings>;
      if (typeof parsed.turnUpdatePopup === "boolean") next.turnUpdatePopup = parsed.turnUpdatePopup;
      if (parsed.turnUpdateView === "expanded" || parsed.turnUpdateView === "compact") {
        next.turnUpdateView = parsed.turnUpdateView;
      }
    }
  } catch {
    // Corrupt JSON or unavailable storage (private mode) → fall back to defaults.
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
  return next;
}
