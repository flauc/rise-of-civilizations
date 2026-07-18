/** Word-weighted reveal timeline so scroll text tracks narrated speech more closely. */

export interface WordRevealMark {
  /** Exclusive end index in the source string (code points). */
  charEnd: number;
  atSec: number;
}

function wordWeight(word: string): number {
  const core = word.replace(/[^\p{L}\p{N}]/gu, "");
  let w = Math.max(1, core.length);
  if (/[.!?]["']?$/.test(word)) w += 5;
  else if (/[,;:]["']?$/.test(word)) w += 2.5;
  return w;
}

/** Map audio duration to cumulative word reveal marks (non-linear — pauses weigh more). */
export function buildWordRevealTimeline(text: string, durationSec: number): WordRevealMark[] {
  if (!text || durationSec <= 0) return [];

  const marks: WordRevealMark[] = [];
  const re = /\S+\s*/gu;
  let match: RegExpExecArray | null;
  let total = 0;
  const parts: { charEnd: number; weight: number }[] = [];

  while ((match = re.exec(text)) !== null) {
    const chunk = match[0];
    const word = chunk.trim();
    if (!word) continue;
    parts.push({ charEnd: match.index + chunk.length, weight: wordWeight(word) });
    total += parts[parts.length - 1]!.weight;
  }

  if (parts.length === 0 || total <= 0) {
    return [{ charEnd: text.length, atSec: durationSec }];
  }

  let t = 0;
  const span = durationSec * 0.99;
  for (const part of parts) {
    t += (part.weight / total) * span;
    marks.push({ charEnd: part.charEnd, atSec: t });
  }
  return marks;
}

/** How many code points should be visible at `currentSec`. Interpolates within
 *  each word span so characters stream in continuously instead of whole words
 *  popping at their mark. */
export function charCountAtTime(timeline: WordRevealMark[], currentSec: number): number {
  if (timeline.length === 0) return 0;
  let prevEnd = 0;
  let prevSec = 0;
  for (const mark of timeline) {
    if (currentSec >= mark.atSec) {
      prevEnd = mark.charEnd;
      prevSec = mark.atSec;
      continue;
    }
    const span = mark.atSec - prevSec;
    if (span <= 0) return mark.charEnd;
    const frac = Math.max(0, (currentSec - prevSec) / span);
    return prevEnd + Math.floor((mark.charEnd - prevEnd) * frac);
  }
  return prevEnd;
}

/** Ease displayed char count toward the sync target for smoother scroll reveal. */
export function smoothCharCount(current: number, target: number, rate = 0.22): number {
  if (target <= current) return target;
  const diff = target - current;
  if (diff < 0.45) return target;
  return current + diff * rate;
}
