import { describe, it, expect } from "vitest";
import {
  getCiv,
  buildCivLoadingSpeech,
  civLoadingSpeechText,
  leaderScrollVoice,
  loadingSpeechContextFor,
  CIVILIZATIONS,
} from "./index";

function speechFor(civId: string) {
  const civ = getCiv(civId)!;
  return buildCivLoadingSpeech(civ, loadingSpeechContextFor(civId));
}

describe("buildCivLoadingSpeech", () => {
  it("dutch script ends on a full sentence and mentions starting conditions", () => {
    const s = speechFor("dutch_republic");
    expect(s.text.length).toBeLessThanOrEqual(500);
    expect(s.text).toMatch(/[.!?]["']?\s*$/);
    expect(s.text.toLowerCase()).toMatch(/open with|capital/);
    expect(s.text.toLowerCase()).toMatch(/march|march with|set out|begin|open with/);
    expect(s.text).toContain("Grachten");
    expect(s.text).toContain("Sea Beggar");
    expect(s.text).toContain("Polder");
    expect(s.story).toContain("William the Silent");
    expect(s.ability).toContain("Grachten");
    expect(s.leverage).toContain("Sea Beggar");
    expect(s.text).toBe(civLoadingSpeechText(s.spoken));
  });

  it("rome script stays within budget and complete", () => {
    const s = speechFor("rome");
    expect(s.text.length).toBeLessThanOrEqual(500);
    expect(s.text).toMatch(/[.!?]["']?\s*$/);
    expect(s.text).toContain("Trajan");
    expect(s.text.toLowerCase()).toContain("open with");
    expect(s.ability.toLowerCase()).toMatch(/road/);
    expect(s.ability.length).toBeGreaterThan(0);
    expect(s.text).not.toMatch(/unmatch spe|stampe\b/);
  });

  it("ability and leverage draw from encyclopedia history when available", () => {
    const s = speechFor("rome");
    expect(s.ability.toLowerCase()).toMatch(/road|paved/);
    expect(s.leverage.toLowerCase()).toMatch(/monument|legion/);
    expect(s.spoken.ability.toLowerCase()).toMatch(/road|paved/);
  });

  it("story prose uses first-person present tense", () => {
    const dutch = speechFor("dutch_republic");
    expect(dutch.story).toMatch(/\bemerge\b/i);
    expect(dutch.story).not.toMatch(/\bemerged\b/i);
    expect(dutch.story).toMatch(/\blead\b/i);
    expect(dutch.story).not.toMatch(/\bled\b/);

    const rome = speechFor("rome");
    expect(rome.story).toMatch(/\bgrow\b/i);
    expect(rome.story).not.toMatch(/\bgrew\b/i);

    const egypt = speechFor("egypt");
    expect(egypt.story).toMatch(/\bWe (unify|endure)\b/i);
    expect(egypt.story).not.toMatch(/\bendured\b/i);

    const france = speechFor("france");
    expect(france.story).toMatch(/^I am Joan of Arc.*\bWe grow\b/is);
  });

  it("leaderScrollVoice converts sample past prose", () => {
    expect(leaderScrollVoice("The Dutch Republic emerged and led the world.", "Dutch Republic")).toBe(
      "We emerge and lead the world.",
    );
  });

  it("every civ script fits the voice budget", () => {
    for (const civ of CIVILIZATIONS) {
      const s = speechFor(civ.id);
      expect(s.text.length, civ.id).toBeLessThanOrEqual(500);
      expect(s.text, civ.id).toMatch(/[.!?]["']?\s*$/);
    }
  });

  it("removes em dashes from scroll copy", () => {
    const s = speechFor("egypt");
    expect(s.story).not.toMatch(/[—–]/);
    expect(s.text).not.toMatch(/[—–]/);
  });
});
