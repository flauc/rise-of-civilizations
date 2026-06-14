// Religion: faith founds a religion (with chosen beliefs) at a holy city, which
// then spreads to nearby cities via "pressure". Founder beliefs apply to the
// founder's empire (merged in civs.playerEffects).

import { axialDistance, offsetToAxial } from "@roc/shared";
import { RELIGION_NAMES, getBelief, BELIEFS } from "@roc/data";
import type { City, GameState, Religion } from "./state";
import { citiesOf, playerById } from "./state";

export { BELIEFS, getBelief };
export type { BeliefDef } from "@roc/data";

export const FAITH_TO_FOUND = 100;
const SPREAD_RANGE = 5;

export function religionById(state: GameState, id: string | undefined): Religion | undefined {
  return id ? state.religions.find((r) => r.id === id) : undefined;
}

/** How many religions may exist this game (one per non-barbarian civ). */
export function religionsCap(state: GameState): number {
  return state.players.filter((p) => !p.isBarbarian).length;
}

export function availableReligionNames(state: GameState): string[] {
  const used = new Set(state.religions.map((r) => r.name));
  return RELIGION_NAMES.filter((n) => !used.has(n));
}

export function canFoundReligion(state: GameState, playerId: number): boolean {
  const p = playerById(state, playerId);
  if (!p || p.isBarbarian || p.foundedReligionId) return false;
  return (
    p.faith >= FAITH_TO_FOUND &&
    citiesOf(state, playerId).length > 0 &&
    state.religions.length < religionsCap(state)
  );
}

export interface FoundResult {
  ok: boolean;
  error?: string;
}

export function foundReligion(
  state: GameState,
  playerId: number,
  cityId: number,
  name: string,
  beliefs: string[],
): FoundResult {
  if (!canFoundReligion(state, playerId)) return { ok: false, error: "cannot found a religion now" };
  const city = state.cities.get(cityId);
  if (!city || city.ownerId !== playerId) return { ok: false, error: "not your city" };
  const validBeliefs = beliefs.filter((b) => getBelief(b)).slice(0, 2);
  const names = availableReligionNames(state);
  const finalName = name && names.includes(name) ? name : names[0] ?? `Religion ${state.religions.length + 1}`;
  const id = `rel_${playerId}`;
  const religion: Religion = { id, name: finalName, founderId: playerId, holyCityId: cityId, beliefs: validBeliefs };
  state.religions.push(religion);
  const p = playerById(state, playerId)!;
  p.foundedReligionId = id;
  p.faith -= FAITH_TO_FOUND;
  city.religion = id;
  state.log.push(`${p.name} founded ${finalName} in ${city.name}!`);
  return { ok: true };
}

/** Spread religions by proximity pressure; the strongest religion wins each city. */
export function spreadReligion(state: GameState): void {
  if (state.religions.length === 0) return;
  const holyCityIds = new Set(state.religions.map((r) => r.holyCityId));
  const cities = [...state.cities.values()];
  const d = (a: City, b: City) => axialDistance(offsetToAxial(a), offsetToAxial(b));

  for (const target of cities) {
    const pressure: Record<string, number> = {};
    for (const src of cities) {
      if (!src.religion) continue;
      const dist = d(target, src);
      if (dist > SPREAD_RANGE) continue;
      const w = (SPREAD_RANGE - dist + 1) * (holyCityIds.has(src.id) ? 3 : 1) * (src.id === target.id ? 2 : 1);
      pressure[src.religion] = (pressure[src.religion] ?? 0) + w;
    }
    let best: string | undefined;
    let bestP = 0;
    for (const [rel, p] of Object.entries(pressure)) {
      if (p > bestP) {
        bestP = p;
        best = rel;
      }
    }
    if (best) target.religion = best;
  }
  // Holy cities always keep their own religion.
  for (const r of state.religions) {
    const c = state.cities.get(r.holyCityId);
    if (c) c.religion = r.id;
  }
}

export function cityFollowerCount(state: GameState, religionId: string): number {
  let n = 0;
  for (const c of state.cities.values()) if (c.religion === religionId) n++;
  return n;
}
