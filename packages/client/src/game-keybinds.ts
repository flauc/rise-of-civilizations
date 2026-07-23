// In-game keyboard shortcuts — defaults, persistence, matching, and rebinding UI helpers.

import { getSettings, updateSettings } from "./settings";

/** Logical shortcut ids wired in ui.ts. */
export type GameKeybindAction =
  | "cycleCity"
  | "cities"
  | "units"
  | "morale"
  | "techTree"
  | "legends"
  | "leaderboard"
  | "wiki"
  | "settings";

/** KeyboardEvent.code value (layout-independent). */
export type KeybindCode = string;

export type GameKeybinds = Record<GameKeybindAction, KeybindCode>;

export interface GameKeybindDef {
  action: GameKeybindAction;
  label: string;
  hint: string;
}

export const GAME_KEYBIND_DEFS: readonly GameKeybindDef[] = [
  { action: "cycleCity", label: "Cycle cities", hint: "Select and pan to your next city" },
  { action: "cities", label: "Cities", hint: "Open or close the Empire cities list" },
  { action: "units", label: "Units", hint: "Open the Empire units list" },
  { action: "morale", label: "Morale", hint: "Toggle empire morale" },
  { action: "techTree", label: "Technology tree", hint: "Open or close the full research tree" },
  { action: "legends", label: "Legends", hint: "Toggle legends" },
  { action: "leaderboard", label: "Standings", hint: "Toggle civilization standings" },
  { action: "wiki", label: "Encyclopedia", hint: "Toggle the in-game wiki" },
  { action: "settings", label: "Settings", hint: "Open or close this settings panel" },
];

export const DEFAULT_KEYBINDS: GameKeybinds = {
  cycleCity: "Space",
  cities: "KeyC",
  units: "KeyU",
  morale: "KeyM",
  techTree: "KeyT",
  legends: "KeyJ",
  leaderboard: "KeyL",
  wiki: "KeyW",
  settings: "KeyO",
};

/** Keys reserved for core UI (Esc closes dialogs, Enter ends turn). */
const BLOCKED_CODES = new Set([
  "Escape",
  "Enter",
  "Tab",
  "ShiftLeft",
  "ShiftRight",
  "ControlLeft",
  "ControlRight",
  "AltLeft",
  "AltRight",
  "MetaLeft",
  "MetaRight",
  "CapsLock",
  "ContextMenu",
]);

let captureAction: GameKeybindAction | null = null;

export function isKeybindCaptureActive(): boolean {
  return captureAction !== null;
}

export function getCapturingKeybindAction(): GameKeybindAction | null {
  return captureAction;
}

export function startKeybindCapture(action: GameKeybindAction): void {
  captureAction = action;
}

export function cancelKeybindCapture(): void {
  captureAction = null;
}

/** Merge saved overrides with defaults. */
export function getKeybinds(): GameKeybinds {
  const saved = getSettings().keybinds ?? {};
  const out = { ...DEFAULT_KEYBINDS };
  for (const def of GAME_KEYBIND_DEFS) {
    const code = saved[def.action];
    if (typeof code === "string" && code.length > 0) out[def.action] = code;
  }
  return out;
}

export function getKeybindFor(action: GameKeybindAction): KeybindCode {
  return getKeybinds()[action];
}

/** Parenthetical hint for buttons, e.g. "(U)". */
export function keybindHint(action: GameKeybindAction): string {
  return `(${formatKeybindLabel(getKeybindFor(action))})`;
}

export function formatKeybindLabel(code: KeybindCode): string {
  if (code === "Space") return "Space";
  if (code.startsWith("Key") && code.length === 4) return code.slice(3).toUpperCase();
  if (code.startsWith("Digit") && code.length === 6) return code.slice(5);
  if (code.startsWith("Numpad") && code.length > 6) return code.slice(6);
  if (code.startsWith("Arrow")) return code.slice(5);
  if (code.startsWith("F") && /^F\d+$/.test(code)) return code;
  return code;
}

export function eventMatchesKeybind(e: KeyboardEvent, code: KeybindCode): boolean {
  if (e.ctrlKey || e.metaKey || e.altKey) return false;
  return e.code === code;
}

export function validateKeybindCode(code: KeybindCode): string | null {
  if (!code) return "Choose a key.";
  if (BLOCKED_CODES.has(code)) return "That key is reserved for menus or ending your turn.";
  if (code.startsWith("Audio") || code.startsWith("Media") || code.startsWith("Browser")) {
    return "Media keys cannot be used as shortcuts.";
  }
  return null;
}

export function findKeybindConflict(action: GameKeybindAction, code: KeybindCode): GameKeybindAction | null {
  const binds = getKeybinds();
  for (const def of GAME_KEYBIND_DEFS) {
    if (def.action === action) continue;
    if (binds[def.action] === code) return def.action;
  }
  return null;
}

export function updateKeybind(action: GameKeybindAction, code: KeybindCode): void {
  const binds = { ...getSettings().keybinds, [action]: code };
  updateSettings({ keybinds: binds });
}

export function resetKeybinds(): void {
  updateSettings({ keybinds: {} });
}

/** Apply a captured key during settings rebinding. Returns an error message or null on success. */
export function applyCapturedKeybind(action: GameKeybindAction, e: KeyboardEvent): string | null {
  if (e.key === "Escape") {
    cancelKeybindCapture();
    return null;
  }
  if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return "Use a single key without Ctrl, Cmd, or Alt.";
  const code = e.code;
  const err = validateKeybindCode(code);
  if (err) return err;
  const conflict = findKeybindConflict(action, code);
  if (conflict) {
    const other = GAME_KEYBIND_DEFS.find((d) => d.action === conflict)?.label ?? conflict;
    return `Already used by ${other}. Pick another key.`;
  }
  updateKeybind(action, code);
  cancelKeybindCapture();
  return null;
}
