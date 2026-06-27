import { describe, expect, it } from "vitest";
import { getTile, offsetToAxial, axialDistance } from "@roc/shared";
import { createGame, PLAYER_COLORS } from "./setup";
import { beginTurn, applyCommand } from "./commands";
import { unitsOf, citiesOf, cityAt, makeUnit } from "./state";
import { isPassableLand } from "./terrain";

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

describe("starting profiles", () => {
  it("default loadout is a Settler + 2 Warriors + a Scout", () => {
    const s = createGame({ seed: "profile-default", playerCount: 1, humanSlots: 1, civIds: ["rome"], barbarians: false });
    const mine = unitsOf(s, 0);
    expect(mine.filter((u) => u.type === "settler").length).toBe(1);
    expect(mine.filter((u) => u.type === "warrior").length).toBe(2);
    expect(mine.filter((u) => u.type === "scout").length).toBe(1);
  });

  it("a civ whose unique unit is ranged begins with ranged units, not warriors", () => {
    // Aragon's Almogàver replaces the Javelineer, so it should start with javelineers.
    const s = createGame({ seed: "profile-archer", playerCount: 1, humanSlots: 1, civIds: ["aragon"], barbarians: false });
    const mine = unitsOf(s, 0);
    expect(mine.filter((u) => u.type === "javelineer").length).toBeGreaterThan(0);
    expect(mine.filter((u) => u.type === "warrior").length).toBe(0);
  });

  it("a fertile river civ founds its capital at pop 3; later cities at 2", () => {
    const s = createGame({ seed: "profile-river", playerCount: 1, humanSlots: 1, civIds: ["egypt"], barbarians: false });
    beginTurn(s);
    const settler = unitsOf(s, 0).find((u) => u.type === "settler")!;
    applyCommand(s, { type: "foundCity", unitId: settler.id });
    const capital = citiesOf(s, 0)[0]!;
    expect(capital.population).toBe(3);

    // A second city — founded with a fresh settler far from the capital — starts at base 2.
    const spot = s.map.tiles.find(
      (t) =>
        isPassableLand(t.terrain) &&
        axialDistance(offsetToAxial(t), offsetToAxial(capital)) >= 3 &&
        !cityAt(s, t.col, t.row) &&
        ![...s.units.values()].some((u) => u.col === t.col && u.row === t.row),
    )!;
    const sid = s.nextEntityId++;
    s.units.set(sid, makeUnit(sid, 0, "settler", spot.col, spot.row));
    expect(applyCommand(s, { type: "foundCity", unitId: sid }).ok).toBe(true);
    const second = citiesOf(s, 0).find((c) => c.id !== capital.id)!;
    expect(second.population).toBe(2);
  });

  it("a default civ founds its capital at pop 2", () => {
    const s = createGame({ seed: "profile-default-pop", playerCount: 1, humanSlots: 1, civIds: ["rome"], barbarians: false });
    beginTurn(s);
    const settler = unitsOf(s, 0).find((u) => u.type === "settler")!;
    applyCommand(s, { type: "foundCity", unitId: settler.id });
    expect(citiesOf(s, 0)[0]!.population).toBe(2);
  });
});
