import { describe, expect, it } from "vitest";
import { createGame, PLAYER_COLORS } from "./setup";

const nonBarb = (s: ReturnType<typeof createGame>) => s.players.filter((p) => !p.isBarbarian);

describe("createGame setup options", () => {
  it("honours requested civ ids per slot and fills the rest randomly & uniquely", () => {
    const state = createGame({
      seed: "civ-test",
      playerCount: 4,
      humanSlots: 1,
      civIds: ["rome", undefined, "sumer", undefined],
      barbarians: false,
    });
    const players = nonBarb(state);
    expect(players[0]!.civId).toBe("rome");
    expect(players[2]!.civId).toBe("sumer");
    // Auto-filled slots get civs, and no two players share one.
    const civs = players.map((p) => p.civId);
    expect(civs.every(Boolean)).toBe(true);
    expect(new Set(civs).size).toBe(civs.length);
  });

  it("never lets two players share a civilization even when duplicates are requested", () => {
    const state = createGame({
      seed: "dup-civ",
      playerCount: 3,
      humanSlots: 1,
      civIds: ["rome", "rome", "rome"],
      barbarians: false,
    });
    const players = nonBarb(state);
    expect(players[0]!.civId).toBe("rome"); // first occurrence keeps it
    const civs = players.map((p) => p.civId);
    expect(civs.every(Boolean)).toBe(true);
    expect(new Set(civs).size).toBe(3); // the other two got distinct civs
  });

  it("assigns requested colors and keeps every player color unique", () => {
    const state = createGame({
      seed: "color-test",
      playerCount: 3,
      humanSlots: 1,
      colors: ["#123456", "#abcdef", undefined],
      barbarians: false,
    });
    const players = nonBarb(state);
    expect(players[0]!.color).toBe("#123456");
    expect(players[1]!.color).toBe("#abcdef");
    expect(players[2]!.color).toBeTruthy();
    const colors = players.map((p) => p.color);
    expect(new Set(colors).size).toBe(colors.length);
  });

  it("never lets two players share a color even when duplicates are requested", () => {
    const state = createGame({
      seed: "dup-test",
      playerCount: 3,
      humanSlots: 1,
      colors: ["#e0533d", "#e0533d", "#e0533d"],
      barbarians: false,
    });
    const colors = nonBarb(state).map((p) => p.color);
    expect(new Set(colors).size).toBe(3);
  });

  it("supports up to 12 AI opponents with distinct palette colors", () => {
    const state = createGame({
      seed: "many-ai",
      playerCount: 13, // 1 human + 12 AI
      humanSlots: 1,
      barbarians: false,
    });
    const players = nonBarb(state);
    expect(players).toHaveLength(13);
    const colors = players.map((p) => p.color);
    expect(new Set(colors).size).toBe(13);
    expect(colors.every((c) => PLAYER_COLORS.includes(c))).toBe(true);
  });
});
