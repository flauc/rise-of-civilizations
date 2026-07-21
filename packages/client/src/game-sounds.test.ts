import { describe, expect, it } from "vitest";
import { isCombatLogMessage, isCombatTargetedAbility } from "./game-sounds";

describe("isCombatLogMessage", () => {
  it("matches combat log lines", () => {
    expect(isCombatLogMessage("Rome bombarded a Warrior for 12.")).toBe(true);
    expect(isCombatLogMessage("A scout evaded the attack and slipped away.")).toBe(true);
    expect(isCombatLogMessage("Carthage stormed a fortification.")).toBe(true);
    expect(isCombatLogMessage("A Warrior (Rome) was destroyed.")).toBe(true);
    expect(isCombatLogMessage("Rome's Scout walked into an ambush!")).toBe(true);
  });

  it("ignores unrelated log lines", () => {
    expect(isCombatLogMessage("Rome founded Roma.")).toBe(false);
    expect(isCombatLogMessage("Rome discovered Writing.")).toBe(false);
  });
});

describe("isCombatTargetedAbility", () => {
  it("treats uprising as non-combat", () => {
    expect(isCombatTargetedAbility("uprising")).toBe(false);
  });

  it("treats strike abilities as combat", () => {
    expect(isCombatTargetedAbility("charge")).toBe(true);
    expect(isCombatTargetedAbility("basilica_bombard")).toBe(true);
  });
});
