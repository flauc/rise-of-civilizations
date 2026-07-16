import { describe, it, expect } from "vitest";
import { CIVILIZATIONS, leaderVoiceKind, FEMALE_LEADER_CIV_IDS, maleLeaderVoiceBucket, maleLeaderVoiceSlotCount, MALE_LEADERS_PER_VOICE } from "./index";

const orderedCivIds = CIVILIZATIONS.map((c) => c.id);

describe("leaderVoiceKind", () => {
  it("marks known female leaders", () => {
    expect(leaderVoiceKind("egypt")).toBe("female");
    expect(leaderVoiceKind("france")).toBe("female");
    expect(leaderVoiceKind("illyrians")).toBe("female");
  });

  it("defaults other civs to male", () => {
    expect(leaderVoiceKind("rome")).toBe("male");
    expect(leaderVoiceKind("dutch_republic")).toBe("male");
  });

  it("female set stays in sync with expectations", () => {
    expect(FEMALE_LEADER_CIV_IDS.size).toBe(9);
  });
});

describe("maleLeaderVoiceBucket", () => {
  it("rotates every ten male civs in roster order", () => {
    expect(maleLeaderVoiceBucket("sumer", orderedCivIds)).toBe(0);
    expect(maleLeaderVoiceBucket("sassanid_persia", orderedCivIds)).toBe(1);
    expect(maleLeaderVoiceBucket("rome", orderedCivIds)).toBe(2);
    expect(maleLeaderVoiceBucket("indus_valley", orderedCivIds)).toBe(11);
    expect(maleLeaderVoiceBucket("tonga", orderedCivIds)).toBe(12);
    expect(maleLeaderVoiceBucket("egypt", orderedCivIds)).toBe(-1);
  });

  it("needs thirteen male voice slots for the current roster", () => {
    const maleCount = CIVILIZATIONS.filter((c) => leaderVoiceKind(c.id) === "male").length;
    expect(maleCount).toBe(128);
    expect(maleLeaderVoiceSlotCount(maleCount)).toBe(13);
    expect(MALE_LEADERS_PER_VOICE).toBe(10);
  });
});
