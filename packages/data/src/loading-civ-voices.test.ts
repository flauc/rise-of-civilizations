import { describe, it, expect } from "vitest";
import { CIVILIZATIONS, CIV_NARRATOR_VOICE_BY_ID, narratorVoiceIdForCiv } from "./index";

const orderedCivIds = CIVILIZATIONS.map((c) => c.id);

describe("CIV_NARRATOR_VOICE_BY_ID", () => {
  it("covers every civilization with a regional narrator voice", () => {
    for (const civ of CIVILIZATIONS) {
      expect(CIV_NARRATOR_VOICE_BY_ID[civ.id], civ.id).toBeTruthy();
      expect(narratorVoiceIdForCiv(civ.id, orderedCivIds)).toBe(CIV_NARRATOR_VOICE_BY_ID[civ.id]);
    }
    expect(Object.keys(CIV_NARRATOR_VOICE_BY_ID).length).toBe(CIVILIZATIONS.length);
  });

  it("uses distinct accents for representative civ groups", () => {
    expect(narratorVoiceIdForCiv("rome", orderedCivIds)).not.toBe(narratorVoiceIdForCiv("aztec", orderedCivIds));
    expect(narratorVoiceIdForCiv("anglo_saxon_england", orderedCivIds)).not.toBe(narratorVoiceIdForCiv("inca", orderedCivIds));
    expect(narratorVoiceIdForCiv("egypt", orderedCivIds)).toBe(narratorVoiceIdForCiv("france", orderedCivIds));
  });
});
