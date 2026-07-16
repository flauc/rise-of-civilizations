import { describe, it, expect } from "vitest";
import {
  DEFAULT_FEMALE_NARRATOR_VOICE,
  DEFAULT_MALE_NARRATOR_VOICES,
  DEFAULT_MALE_NARRATOR_VOICE_IDS,
  maleLeaderVoiceSlotCount,
  leaderVoiceKind,
  CIVILIZATIONS,
} from "./index";

describe("loading-narrator-voices", () => {
  it("provides thirteen distinct male narrator voice ids", () => {
    expect(DEFAULT_MALE_NARRATOR_VOICES).toHaveLength(13);
    expect(new Set(DEFAULT_MALE_NARRATOR_VOICE_IDS).size).toBe(13);
    for (const v of DEFAULT_MALE_NARRATOR_VOICES) {
      expect(v.id.length).toBeGreaterThan(10);
      expect(v.name.length).toBeGreaterThan(0);
    }
  });

  it("matches male voice slot count for the civ roster", () => {
    const maleCount = CIVILIZATIONS.filter((c) => leaderVoiceKind(c.id) === "male").length;
    expect(maleLeaderVoiceSlotCount(maleCount)).toBe(DEFAULT_MALE_NARRATOR_VOICES.length);
  });

  it("has a default female narrator voice", () => {
    expect(DEFAULT_FEMALE_NARRATOR_VOICE.id.length).toBeGreaterThan(10);
  });
});
