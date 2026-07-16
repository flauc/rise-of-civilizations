// First-person loading-scroll prose for each civilization leader. Pulls origin,
// ability, and perks from civHistory (same encyclopedia source as the wiki).
// Used by the in-game loading screen and tools/generate-loading-voice.ts.

import type { CivDef } from "./index";
import { civHistory, type CivHistory } from "./history-civs";

export interface CivLoadingSpeech {
  civId: string;
  leader: string;
  civName: string;
  /** Intro + origin story (encyclopedia). */
  story: string;
  /** Civ ability lore (encyclopedia). */
  ability: string;
  /** Unique unit/infra, perks, and starting conditions (encyclopedia + sim). */
  leverage: string;
  /** Full spoken script (first person, present tense). Always ends on a complete sentence. */
  text: string;
  /** Shorter section mirror read by voice/TTS; on-screen copy may be richer after speech ends. */
  spoken: { story: string; ability: string; leverage: string };
}

/** Runtime facts the sim already derives (starting loadout, capital size). */
export interface CivLoadingSpeechContext {
  startingUnits: string[];
  capitalPopulation: number;
  /** Resolve a base unit id to a display name (unique unit name when applicable). */
  unitDisplayName: (baseTypeId: string) => string | undefined;
}

/** ElevenLabs loading clips stay under ~500 chars so the full narration plays. */
const MAX_SPEECH_CHARS = 500;

const IRREGULAR_PAST_TO_PRESENT: Record<string, string> = {
  was: "is",
  were: "are",
  had: "have",
  did: "do",
  made: "make",
  led: "lead",
  built: "build",
  rose: "rise",
  grew: "grow",
  ran: "run",
  won: "win",
  became: "become",
  kept: "keep",
  held: "hold",
  told: "tell",
  left: "leave",
  unified: "unify",
  stood: "stand",
  took: "take",
  gave: "give",
  came: "come",
  went: "go",
  saw: "see",
  brought: "bring",
  fought: "fight",
  sought: "seek",
  sent: "send",
  read: "read",
  put: "put",
  cut: "cut",
  fell: "fall",
  found: "find",
  meant: "mean",
  spoke: "speak",
  wrote: "write",
  knew: "know",
  caught: "catch",
  thought: "think",
  spent: "spend",
};

/** -ed words that are not verbs in our scroll copy. */
const ED_NOT_VERBS = new Set([
  "red",
  "bed",
  "fed",
  "wed",
  "shed",
  "sped",
  "speed",
  "unmatched",
  "matched",
  "stamped",
  "breed",
  "bred",
  "bled",
  "aged",
  "sacred",
  "learned",
  "blessed",
  "fixed",
  "mixed",
  "refined",
  "defined",
  "based",
  "passed",
  "crossed",
  "signed",
  "lined",
  "designed",
  "assigned",
  "advanced",
  "balanced",
  "paved",
  "armed",
  "trained",
  "experienced",
  "inexperienced",
  "supposed",
  "alleged",
  "naked",
  "wicked",
  "crooked",
  "kindred",
  "hundred",
  "thousand",
  "backward",
  "forward",
  "awkward",
  "standard",
  "legged",
  "winged",
  "bearded",
  "skilled",
  "filled",
  "called",
  "so-called",
]);

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function trimSentences(text: string, max: number): string {
  const parts = text.match(/[^.!?]+[.!?]+/g);
  if (!parts) return text.trim();
  return parts.slice(0, max).join(" ").trim();
}

function preserveCase(from: string, to: string): string {
  if (!from) return to;
  if (from[0] === from[0]!.toUpperCase()) {
    return to[0]!.toUpperCase() + to.slice(1);
  }
  return to;
}

function replaceWord(text: string, past: string, present: string): string {
  return text.replace(new RegExp(`\\b${escapeRe(past)}\\b`, "gi"), (m) => preserveCase(m, present));
}

function edPastToPresent(word: string): string {
  const lower = word.toLowerCase();
  if (ED_NOT_VERBS.has(lower)) return word;
  if (!lower.endsWith("ed")) return word;
  if (lower.endsWith("ied")) {
    return preserveCase(word, word.slice(0, -3) + "y");
  }
  const stem = word.slice(0, -2);
  const s = stem.toLowerCase();
  if (/sh$|ch$|ss$|x$|zz$|gn$|ph$/.test(s)) return stem;
  if (stem.length >= 2 && s.at(-1) === s.at(-2)) return stem.slice(0, -1);
  if (/[^aeiou]e$/i.test(stem)) return stem;
  return stem + "e";
}

/** Shift historical past-tense prose into present tense for the live scroll. */
export function presentTense(text: string): string {
  let t = text;
  for (const [past, present] of Object.entries(IRREGULAR_PAST_TO_PRESENT)) {
    t = replaceWord(t, past, present);
  }
  t = t.replace(/\b(\w+ed)\b/g, (word) => edPastToPresent(word));
  return t;
}

/** Light third → first person pass so the leader reads as themselves. */
function firstPerson(text: string, civName: string): string {
  let t = text.trim();
  const esc = escapeRe(civName);
  t = t.replace(/^Unified\b/i, "We unify");
  t = t.replace(new RegExp(`^The ${esc}\\s+`, "i"), "We ");
  t = t.replace(new RegExp(`^Medieval ${esc}\\s+`, "i"), "We ");
  t = t.replace(new RegExp(`, ancient ${esc}\\b`, "i"), ", we");
  t = t.replace(new RegExp(`^Ancient ${esc}\\s+`, "i"), "We ");
  t = t.replace(new RegExp(`\\bancient ${esc}\\b`, "i"), "we");
  t = t.replace(new RegExp(`^${esc}\\s+`, "i"), "We ");
  t = t.replace(
    /^The [A-Za-z][^.]{0,48}? (grew|rose|built|ruled|forged|united|were|was|spread|dominated|flourished|commanded|centered|developed|emerged|endured|held|became|carved|created|established|won|led|punched)/i,
    "We $1",
  );
  t = t.replace(/\bIts\b/g, "Our");
  t = t.replace(/\bits\b/g, "our");
  t = t.replace(/\bTheir\b/g, "Our");
  t = t.replace(/\btheir\b/g, "our");
  t = t.replace(/\bThey\b/g, "We");
  t = t.replace(/\bthey\b/g, "we");
  t = t.replace(/\bThe empire\b/gi, "Our empire");
  t = t.replace(/\bThe kingdom\b/gi, "Our kingdom");
  t = t.replace(
    /\b(in|during|throughout|from|at|by|for|with|within|across|over|under|after|before|since|until|while|when|where|as|if|though|although|because|once|whenever|wherever) its\b/gi,
    "$1 our",
  );
  return t;
}

/** Strip em/en dashes from scroll copy (game copy rule). */
export function sanitizeScrollCopy(text: string): string {
  return text
    .replace(/\s*[—–]\s*/g, ", ")
    .replace(/,\s*,+/g, ", ")
    .replace(/\s+([,.!?])/g, "$1")
    .trim();
}

/** First-person, present-tense leader voice for scroll copy. */
export function leaderScrollVoice(text: string, civName: string): string {
  return sanitizeScrollCopy(presentTense(firstPerson(text, civName)));
}

function unitLabel(name: string, count: number): string {
  const lower = name.toLowerCase();
  if (count === 1) return `one ${lower}`;
  if (lower.endsWith("s")) return `${count} ${lower}`;
  return `${count} ${lower}s`;
}

function startingUnitsSpoken(ctx: CivLoadingSpeechContext): string {
  const counts = new Map<string, number>();
  for (const u of ctx.startingUnits) counts.set(u, (counts.get(u) ?? 0) + 1);
  const labels = [...counts.entries()].map(([id, n]) => {
    const name = ctx.unitDisplayName(id) ?? id.replaceAll("_", " ");
    return unitLabel(name, n);
  });
  if (labels.length === 0) return "my settler and escorts";
  if (labels.length === 1) return labels[0]!;
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]}`;
}

function capitalSpoken(pop: number): string {
  return pop === 1 ? "one citizen" : `${pop} citizens`;
}

function endsSentence(text: string): boolean {
  return /[.!?]["']?\s*$/.test(text.trim());
}

function spokenAbilityStats(civ: CivDef): string {
  let d = civ.abilityDesc.trim().replace(/\s*\([^)]*\)\.?\s*$/, "");
  if (!d.endsWith(".")) d += ".";
  return `Our ${civ.abilityName}: ${d}`;
}

/** Encyclopedia ability blurb (same source as the in-game wiki). */
function wikiAbilityVoice(hist: CivHistory | undefined, civ: CivDef, maxSentences: number): string {
  if (hist?.ability) return leaderScrollVoice(trimSentences(hist.ability, maxSentences), civ.name);
  return spokenAbilityStats(civ);
}

/** Encyclopedia perks blurb (same source as the in-game wiki). */
function wikiPerksVoice(hist: CivHistory | undefined, civ: CivDef, maxSentences: number): string {
  if (!hist?.perks) return "";
  return leaderScrollVoice(trimSentences(hist.perks, maxSentences), civ.name);
}

function wikiOriginVoice(hist: CivHistory | undefined, civ: CivDef, maxSentences: number): string {
  if (hist?.origin) return leaderScrollVoice(trimSentences(hist.origin, maxSentences), civ.name);
  return leaderScrollVoice(trimSentences(civ.abilityDesc, 1), civ.name);
}

function joinSpeechParts(parts: string[]): string {
  return parts.filter(Boolean).join(" ");
}

interface SpeechCandidate {
  story: string;
  ability: string;
  leverage: string;
}

/** Pick the richest script that still fits the character budget (never mid-sentence). */
function pickSpeech(candidates: SpeechCandidate[]): SpeechCandidate {
  for (const c of candidates) {
    const text = joinSpeechParts([c.story, c.ability, c.leverage]);
    if (text.length <= MAX_SPEECH_CHARS && endsSentence(text)) return c;
  }
  const fallback = candidates[candidates.length - 1]!;
  const text = joinSpeechParts([fallback.story, fallback.ability, fallback.leverage]);
  if (endsSentence(text)) return fallback;
  return { ...fallback, story: trimSentences(fallback.story, 99) };
}

/** Full flat script for voice clips and legacy .txt sidecars. */
export function civLoadingSpeechText(speech: Pick<CivLoadingSpeech, "story" | "ability" | "leverage">): string {
  return joinSpeechParts([speech.story, speech.ability, speech.leverage]);
}

/** Spoken loading-scroll script for a civ leader. */
export function buildCivLoadingSpeech(civ: CivDef, ctx: CivLoadingSpeechContext): CivLoadingSpeech {
  const hist = civHistory(civ.id);
  const intro = `I am ${civ.leader}, leader of ${civ.name}.`;
  const start = `I open with ${capitalSpoken(ctx.capitalPopulation)}, ${startingUnitsSpoken(ctx)}.`;
  const unique = `We field the ${civ.uniqueUnit} and build the ${civ.uniqueInfra}.`;

  const origin1 = wikiOriginVoice(hist, civ, 1);
  const origin2 = wikiOriginVoice(hist, civ, 2);

  const abilityWiki1 = wikiAbilityVoice(hist, civ, 1);
  const abilityWiki2 = wikiAbilityVoice(hist, civ, 2);
  const abilityGame = spokenAbilityStats(civ);

  const perksWiki1 = wikiPerksVoice(hist, civ, 1);
  const perksWiki2 = wikiPerksVoice(hist, civ, 2);

  const display = {
    story: sanitizeScrollCopy(joinSpeechParts([intro, origin2])),
    ability: sanitizeScrollCopy(abilityWiki2 || abilityWiki1 || abilityGame),
    leverage: sanitizeScrollCopy(joinSpeechParts([unique, perksWiki2 || perksWiki1, start])),
  };

  const storyFull2 = joinSpeechParts([intro, origin2]);
  const storyFull1 = joinSpeechParts([intro, origin1]);

  const leverageUniqueStart = joinSpeechParts([unique, start]);
  const leveragePerksStart = joinSpeechParts([perksWiki1, start]);
  const leverageUniquePerksStart = joinSpeechParts([unique, perksWiki1, start]);
  const leverageUniquePerks2Start = joinSpeechParts([unique, perksWiki2, start]);

  const picked = pickSpeech([
    { story: storyFull1, ability: abilityWiki1, leverage: leverageUniquePerksStart },
    { story: storyFull1, ability: abilityWiki1, leverage: leverageUniqueStart },
    { story: storyFull1, ability: abilityWiki1, leverage: leveragePerksStart },
    { story: storyFull2, ability: abilityWiki1, leverage: leverageUniquePerksStart },
    { story: storyFull1, ability: abilityWiki2, leverage: leverageUniquePerksStart },
    { story: storyFull2, ability: abilityWiki2, leverage: leverageUniquePerksStart },
    { story: storyFull1, ability: abilityWiki1, leverage: leverageUniquePerks2Start },
    { story: storyFull1, ability: abilityGame, leverage: leverageUniquePerksStart },
    { story: storyFull1, ability: abilityGame, leverage: leverageUniqueStart },
    { story: intro, ability: abilityWiki1, leverage: leverageUniqueStart },
    { story: intro, ability: abilityGame, leverage: start },
  ]);

  const spoken = {
    story: sanitizeScrollCopy(picked.story),
    ability: sanitizeScrollCopy(picked.ability),
    leverage: sanitizeScrollCopy(picked.leverage),
  };

  return {
    civId: civ.id,
    leader: civ.leader,
    civName: civ.name,
    story: display.story,
    ability: display.ability,
    leverage: display.leverage,
    spoken,
    text: sanitizeScrollCopy(civLoadingSpeechText(spoken)),
  };
}
