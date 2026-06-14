// Specialists: citizens a city trains into a craft. A specialist occupies a
// population slot (so it can't also work a tile), contributes level-scaled
// labour of its discipline to the city's Works each turn, and levels up with
// experience. See docs/SPECIALISTS-AND-WORKS.md.

import type { City, Discipline, GameState, Player, Specialist } from "./state";
import type { TechId } from "./content";

export type SpecialistId = "carpenter" | "agrimensor" | "mason" | "architect" | "engineer";

export interface SpecialistDef {
  id: SpecialistId;
  name: string;
  /** Historic/Latin basis, shown in the UI/wiki. */
  latin: string;
  discipline: Discipline;
  /** Technology required before a city can train this craft (absent = from start). */
  reqTech?: TechId;
  desc: string;
}

export const SPECIALIST_DEFS: Record<SpecialistId, SpecialistDef> = {
  carpenter: {
    id: "carpenter", name: "Carpenter", latin: "faber tignarius", discipline: "carpentry",
    desc: "Woodworker. Builds and upgrades Farms and Lumber Camps.",
  },
  agrimensor: {
    id: "agrimensor", name: "Agrimensor", latin: "land surveyor", discipline: "survey", reqTech: "the_wheel",
    desc: "Surveyor. Lays out and upgrades Roads.",
  },
  mason: {
    id: "mason", name: "Mason", latin: "faber lapidarius", discipline: "masonry", reqTech: "masonry",
    desc: "Stoneworker. Builds Mines and Quarries, and (with a Military Engineer) defensive works.",
  },
  architect: {
    id: "architect", name: "Architect", latin: "architectus", discipline: "architecture", reqTech: "masonry",
    desc: "Master planner. Contributes architecture labour to Wonders.",
  },
  engineer: {
    id: "engineer", name: "Military Engineer", latin: "praefectus fabrum", discipline: "engineering", reqTech: "engineering",
    desc: "Builds Walls, Towers and Forts (with a Mason) and contributes to Wonders.",
  },
};

export const SPECIALIST_IDS = Object.keys(SPECIALIST_DEFS) as SpecialistId[];

const MAX_LEVEL = 5;

/** Level-scaled labour a specialist contributes per turn (Lv1 = 1.0 … Lv5 = 3.0). */
export function specialistLabour(s: Specialist): number {
  return 1 + 0.5 * (s.level - 1);
}

/** XP needed to advance FROM the given level to the next. */
export function xpForNextLevel(level: number): number {
  return 10 * level;
}

/** Add experience, levelling up (capped) as thresholds are crossed. */
export function grantSpecialistXp(s: Specialist, amount: number): void {
  if (s.level >= MAX_LEVEL) return;
  s.xp += amount;
  while (s.level < MAX_LEVEL && s.xp >= xpForNextLevel(s.level)) {
    s.xp -= xpForNextLevel(s.level);
    s.level += 1;
  }
  if (s.level >= MAX_LEVEL) s.xp = 0;
}

export function specialistUnlocked(player: Player, id: SpecialistId): boolean {
  const req = SPECIALIST_DEFS[id].reqTech;
  return !req || player.researched.has(req);
}

export function availableSpecialists(player: Player): SpecialistId[] {
  return SPECIALIST_IDS.filter((id) => specialistUnlocked(player, id));
}

export function totalSpecialists(city: City): number {
  return city.specialists.length;
}

export function specialistsByType(city: City, id: SpecialistId): Specialist[] {
  return city.specialists.filter((s) => s.type === id);
}

/** All specialists in a city of a given discipline. */
export function specialistsOfDiscipline(city: City, discipline: Discipline): Specialist[] {
  return city.specialists.filter((s) => SPECIALIST_DEFS[s.type as SpecialistId]?.discipline === discipline);
}

/** Population not committed to a craft — the cap on how many tiles can be worked. */
export function workerSlots(city: City): number {
  return Math.max(0, city.population - city.specialists.length);
}

export interface SpecialistResult {
  ok: boolean;
  error?: string;
}

/**
 * Train (delta > 0) or release (delta < 0) one craftsman of `id`.
 * Training pulls a citizen off a worked tile if the city is at capacity;
 * releasing frees the least-experienced craftsman back to (potentially) a tile.
 */
export function convertCitizen(
  state: GameState,
  city: City,
  id: SpecialistId,
  delta: number,
): SpecialistResult {
  const player = state.players.find((p) => p.id === city.ownerId);
  if (delta > 0) {
    if (!player || !specialistUnlocked(player, id)) return { ok: false, error: "specialist not unlocked" };
    if (city.specialists.length >= city.population) return { ok: false, error: "no free citizens" };
    city.specialists.push({ id: state.nextEntityId++, type: id, xp: 0, level: 1 });
    // If we've over-committed the population, drop the lowest-value worked tile.
    while (city.workedTiles.length + city.specialists.length > city.population && city.workedTiles.length > 0) {
      city.workedTiles.pop();
    }
    return { ok: true };
  }
  if (delta < 0) {
    const pool = specialistsByType(city, id);
    if (pool.length === 0) return { ok: false, error: "no such specialist to release" };
    // Release the least-experienced (lowest level, then lowest xp), keeping veterans.
    pool.sort((a, b) => a.level - b.level || a.xp - b.xp);
    const drop = pool[0]!;
    city.specialists = city.specialists.filter((s) => s.id !== drop.id);
    return { ok: true };
  }
  return { ok: false, error: "no-op" };
}
