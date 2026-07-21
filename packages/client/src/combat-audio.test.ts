import { describe, expect, it } from "vitest";
import { pickBombardClip, pickCombatClipForLog, pickCombatClipForUnit } from "./combat-audio";

describe("pickCombatClipForUnit", () => {
  it("maps war dogs to dog clips", () => {
    expect(pickCombatClipForUnit("war_dog")).toMatch(/^audio\/dog\//);
  });

  it("maps spearmen to spear clips", () => {
    expect(pickCombatClipForUnit("spearman")).toMatch(/^audio\/spear, mice, pike, axe\//);
  });

  it("maps archers to swish clips", () => {
    expect(pickCombatClipForUnit("archer")).toMatch(/^audio\/swishes\//);
  });

  it("maps swordsmen to sword clips", () => {
    expect(pickCombatClipForUnit("swordsman")).toMatch(/^audio\/sword - StarNinjas\//);
  });

  it("maps axemen to axe clips", () => {
    expect(pickCombatClipForUnit("axeman")).toMatch(/Seax Axe/);
  });
});

describe("pickCombatClipForLog", () => {
  it("uses siege clips for bombardment", () => {
    expect(pickCombatClipForLog("Rome bombarded a Warrior for 12.")).toMatch(/swish-7|swish-10|Spear Sabre|Sabre Norse/);
  });

  it("uses swish clips for evades", () => {
    expect(pickCombatClipForLog("A scout evaded the attack and slipped away.")).toMatch(/^audio\/swishes\//);
  });
});

describe("pickBombardClip", () => {
  it("returns a siege clip", () => {
    expect(pickBombardClip()).toMatch(/^audio\//);
  });
});
