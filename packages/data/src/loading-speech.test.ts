import { describe, it, expect } from "vitest";
import {
  getCiv,
  buildCivLoadingSpeech,
  civLoadingSpeechText,
  leaderScrollVoice,
  loadingSpeechContextFor,
  CIVILIZATIONS,
} from "./index";
import { MAX_HANDWRITTEN_SPEECH_CHARS } from "./loading-speech";
import { CIV_LOADING_SCRIPTS } from "./loading-speech-scripts";

function speechFor(civId: string) {
  const civ = getCiv(civId)!;
  return buildCivLoadingSpeech(civ, loadingSpeechContextFor(civId));
}

describe("buildCivLoadingSpeech", () => {
  it("dutch script names its ability and uniques in the leader's voice", () => {
    const s = speechFor("dutch_republic");
    expect(s.text.length).toBeLessThanOrEqual(MAX_HANDWRITTEN_SPEECH_CHARS);
    expect(s.text).toMatch(/[.!?]["']?\s*$/);
    expect(s.story).toMatch(/William/);
    expect(s.ability).toContain("Grachten");
    expect(s.text).toContain("Sea Beggar");
    expect(s.text).toContain("Polder");
    expect(s.text).toBe(civLoadingSpeechText(s.spoken));
  });

  it("rome script stays within budget and complete", () => {
    const s = speechFor("rome");
    expect(s.text.length).toBeLessThanOrEqual(MAX_HANDWRITTEN_SPEECH_CHARS);
    expect(s.text).toMatch(/[.!?]["']?\s*$/);
    expect(s.text).toContain("Trajan");
    expect(s.ability.toLowerCase()).toMatch(/road/);
    expect(s.text.toLowerCase()).not.toContain("open with");
  });

  it("leaderScrollVoice converts sample past prose", () => {
    expect(leaderScrollVoice("The Dutch Republic emerged and led the world.", "Dutch Republic")).toBe(
      "We emerge and lead the world.",
    );
  });

  it("every civ script fits the voice budget", () => {
    for (const civ of CIVILIZATIONS) {
      const s = speechFor(civ.id);
      const budget = CIV_LOADING_SCRIPTS[civ.id] ? MAX_HANDWRITTEN_SPEECH_CHARS : 500;
      expect(s.text.length, civ.id).toBeLessThanOrEqual(budget);
      expect(s.text, civ.id).toMatch(/[.!?]["']?\s*$/);
    }
  });

  it("hand-written scripts replace the auto-derived voice without a loadout line", () => {
    const s = speechFor("sumer");
    expect(s.story).toContain("I am Gilgamesh of Uruk");
    expect(s.ability).toContain("Epic Quest");
    expect(s.leverage).toContain("War-Cart");
    expect(s.leverage).toContain("Ziggurat");
    expect(s.text.toLowerCase()).not.toContain("open with");
    expect(s.text.length).toBeLessThanOrEqual(MAX_HANDWRITTEN_SPEECH_CHARS);
    expect(s.text).not.toMatch(/[—–]/);
    expect(s.text).toBe(civLoadingSpeechText(s.spoken));
  });

  it("hand-written scripts never contain long dashes", () => {
    for (const [civId, script] of Object.entries(CIV_LOADING_SCRIPTS)) {
      expect(`${script.story} ${script.ability} ${script.leverage}`, civId).not.toMatch(/[—–]/);
    }
  });

  it("removes em dashes from scroll copy", () => {
    const s = speechFor("egypt");
    expect(s.story).not.toMatch(/[—–]/);
    expect(s.text).not.toMatch(/[—–]/);
  });
});
