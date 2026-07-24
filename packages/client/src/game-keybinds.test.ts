import { describe, expect, it } from "vitest";
import {
  DEFAULT_KEYBINDS,
  eventMatchesKeybind,
  formatKeybindLabel,
  validateKeybindCode,
} from "./game-keybinds";

describe("formatKeybindLabel", () => {
  it("formats common codes", () => {
    expect(formatKeybindLabel("Space")).toBe("Space");
    expect(formatKeybindLabel("KeyU")).toBe("U");
    expect(formatKeybindLabel("Digit1")).toBe("1");
    expect(formatKeybindLabel("ArrowLeft")).toBe("Left");
    expect(formatKeybindLabel("F5")).toBe("F5");
  });
});

describe("eventMatchesKeybind", () => {
  it("matches code and ignores modifiers", () => {
    const ev = { code: "KeyU", ctrlKey: false, metaKey: false, altKey: false } as KeyboardEvent;
    expect(eventMatchesKeybind(ev, "KeyU")).toBe(true);
    expect(eventMatchesKeybind({ ...ev, ctrlKey: true } as KeyboardEvent, "KeyU")).toBe(false);
    expect(eventMatchesKeybind(ev, "KeyL")).toBe(false);
  });

  it("matches space", () => {
    const ev = { code: "Space", ctrlKey: false, metaKey: false, altKey: false } as KeyboardEvent;
    expect(eventMatchesKeybind(ev, "Space")).toBe(true);
  });
});

describe("validateKeybindCode", () => {
  it("blocks reserved keys", () => {
    expect(validateKeybindCode("Escape")).toMatch(/reserved/i);
    expect(validateKeybindCode("Enter")).toMatch(/reserved/i);
  });

  it("allows letter keys", () => {
    expect(validateKeybindCode("KeyO")).toBeNull();
    expect(validateKeybindCode("Space")).toBeNull();
  });
});

describe("DEFAULT_KEYBINDS", () => {
  it("matches shipped shortcuts", () => {
    expect(DEFAULT_KEYBINDS.cycleCity).toBe("Space");
    expect(DEFAULT_KEYBINDS.cities).toBe("KeyC");
    expect(DEFAULT_KEYBINDS.units).toBe("KeyU");
    expect(DEFAULT_KEYBINDS.morale).toBe("KeyM");
    expect(DEFAULT_KEYBINDS.techTree).toBe("KeyT");
    expect(DEFAULT_KEYBINDS.legends).toBe("KeyJ");
    expect(DEFAULT_KEYBINDS.leaderboard).toBe("KeyL");
    expect(DEFAULT_KEYBINDS.wiki).toBe("KeyW");
    expect(DEFAULT_KEYBINDS.settings).toBe("KeyO");
  });
});
