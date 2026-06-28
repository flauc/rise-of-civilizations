// Victory conditions (M4 → M-V1). Each decisive win path is a pure predicate,
// gated by the game's `enabledVictories` toggle set. Score (at the turn limit)
// and extinction always apply. When several conditions resolve in the same tick
// (possible under simultaneous turns) a deterministic tie-break picks the winner.
//
// Implemented today: domination, religious, score, extinction. The science /
// culture / economic predicates are wired in but return null until their systems
// land (M-V3..M-V5) — enabling them is harmless until then.
//
// See docs/VICTORY-CONDITIONS.md.

import type { GameState, GameOver, Player, VictoryKind } from "./state";
import { citiesOf, defaultEnabledVictories, log, unitsOf } from "./state";
import { empireLuxuryTypes } from "./resources";
import { scienceVictoryAchieved, techProgress, CIRCUMNAVIGATION_SECTORS } from "./science-victory";
import { cultureVictoryAchieved, influenceStanding } from "./culture-victory";

/** Points awarded per unit of each contributor to a civilization's score. */
export const SCORE_WEIGHTS = {
  /** Per city you own. */
  city: 10,
  /** Per point of city population (citizen). */
  population: 2,
  /** Per technology researched. */
  tech: 5,
  /** Per civic (culture-tree advance) researched. */
  civic: 5,
  /** Per military/civilian unit fielded. */
  unit: 1,
  /** Per 10 gold in the treasury. */
  goldPer10: 1,
  /** Per battle won (enemy unit defeated in combat). */
  battle: 2,
  /** Per enemy city captured by conquest. */
  conquest: 15,
} as const;

/** The score contribution of each category, plus the total. */
export interface ScoreBreakdown {
  cities: number;
  population: number;
  techs: number;
  civics: number;
  units: number;
  gold: number;
  battles: number;
  conquests: number;
  total: number;
}

/** Breakdown of a player's score into its contributing parts (see SCORE_WEIGHTS). */
export function scoreBreakdown(state: GameState, playerId: number): ScoreBreakdown {
  const cities = citiesOf(state, playerId);
  const pop = cities.reduce((n, c) => n + c.population, 0);
  const player = state.players.find((p) => p.id === playerId);
  const techCount = player ? player.researched.size : 0;
  const civicCount = player ? player.civicsResearched.size : 0;
  const unitCount = unitsOf(state, playerId).length;
  const gold = player?.gold ?? 0;

  const parts = {
    cities: cities.length * SCORE_WEIGHTS.city,
    population: pop * SCORE_WEIGHTS.population,
    techs: techCount * SCORE_WEIGHTS.tech,
    civics: civicCount * SCORE_WEIGHTS.civic,
    units: unitCount * SCORE_WEIGHTS.unit,
    gold: Math.floor(gold / 10) * SCORE_WEIGHTS.goldPer10,
    battles: (player?.battlesWon ?? 0) * SCORE_WEIGHTS.battle,
    conquests: (player?.citiesCaptured ?? 0) * SCORE_WEIGHTS.conquest,
  };
  return {
    ...parts,
    total:
      parts.cities +
      parts.population +
      parts.techs +
      parts.civics +
      parts.units +
      parts.gold +
      parts.battles +
      parts.conquests,
  };
}

/** A simple aggregate score for the score victory and end-game ranking. */
export function playerScore(state: GameState, playerId: number): number {
  return scoreBreakdown(state, playerId).total;
}

function isAlive(state: GameState, p: Player): boolean {
  return citiesOf(state, p.id).length > 0 || unitsOf(state, p.id).length > 0;
}

/** Whether a decisive win condition is enabled this game (legacy saves: all on). */
function victoryEnabled(state: GameState, kind: VictoryKind): boolean {
  return (state.enabledVictories ?? defaultEnabledVictories()).has(kind);
}

// ---- per-condition predicates ---------------------------------------------

/** Every major civ has been wiped out — a dead game, always terminal. */
function checkExtinction(state: GameState): GameOver | null {
  const majors = state.players.filter((p) => !p.isBarbarian);
  const aliveMajor = majors.filter((p) => isAlive(state, p));
  if (aliveMajor.length === 0 && majors.length > 0) return { condition: "extinction" };
  return null;
}

/** Domination — last civ standing, conquest of all cities, or all original capitals. */
function checkDomination(state: GameState): GameOver | null {
  const humans = state.players.filter((p) => p.isHuman);

  // Last human standing.
  const aliveHumans = humans.filter((p) => isAlive(state, p));
  if (humans.length > 1 && aliveHumans.length === 1) {
    return { winnerId: aliveHumans[0]!.id, condition: "domination" };
  }

  // Last major civ standing (humans + AI, excluding barbarians).
  const majors = state.players.filter((p) => !p.isBarbarian);
  const aliveMajor = majors.filter((p) => isAlive(state, p));
  if (majors.length > 1 && aliveMajor.length === 1) {
    return { winnerId: aliveMajor[0]!.id, condition: "domination" };
  }

  // Conquest — one non-barbarian player controls every city on the map. Require
  // at least two cities so the game doesn't end on turn 1 before every civ has
  // founded its capital.
  const ownerCityCounts = new Map<number, number>();
  for (const c of state.cities.values()) {
    const owner = state.players.find((p) => p.id === c.ownerId);
    if (!owner || owner.isBarbarian) continue;
    ownerCityCounts.set(owner.id, (ownerCityCounts.get(owner.id) ?? 0) + 1);
  }
  if (ownerCityCounts.size === 1) {
    const [winnerId, cityCount] = [...ownerCityCounts][0]!;
    if (cityCount >= 2) return { winnerId, condition: "domination" };
  }

  // One player controls every original capital.
  const capitals = [...state.cities.values()].filter((c) => c.foundedAsCapital);
  if (capitals.length >= 2) {
    const owner = capitals[0]!.ownerId;
    if (capitals.every((c) => c.ownerId === owner)) {
      return { winnerId: owner, condition: "domination" };
    }
  }
  return null;
}

/** Major civs that currently own at least one city. */
function civsWithCities(state: GameState): Player[] {
  return state.players.filter(
    (p) => !p.isBarbarian && [...state.cities.values()].some((c) => c.ownerId === p.id),
  );
}

/** True if `religionId` is the strict majority faith in `player`'s cities. */
function religionDominatesCiv(state: GameState, player: Player, religionId: string): boolean {
  const cities = [...state.cities.values()].filter((c) => c.ownerId === player.id);
  if (cities.length === 0) return false;
  const following = cities.filter((c) => c.religion === religionId).length;
  return following * 2 > cities.length; // strict majority
}

/** Religious — a religion is the majority faith in every civ that has cities. */
function checkReligious(state: GameState): GameOver | null {
  const civs = civsWithCities(state);
  if (civs.length < 2) return null;
  for (const religion of state.religions) {
    if (civs.every((p) => religionDominatesCiv(state, p, religion.id))) {
      return { winnerId: religion.founderId, condition: "religious" };
    }
  }
  return null;
}

/** Science — "The Great Endeavor": master the whole tree and circumnavigate. */
function checkScience(state: GameState): GameOver | null {
  for (const p of civsWithCities(state)) {
    if (scienceVictoryAchieved(state, p)) return { winnerId: p.id, condition: "science" };
  }
  return null;
}

/** Culture — influential (via tourism) over every living major rival. */
function checkCulture(state: GameState): GameOver | null {
  for (const p of civsWithCities(state)) {
    if (cultureVictoryAchieved(state, p)) return { winnerId: p.id, condition: "culture" };
  }
  return null;
}

// ---- economic (Mercantile Hegemony) ---------------------------------------

/** Minimum Economic Power to claim a mercantile victory (also needs a 2× lead). */
export const ECONOMIC_THRESHOLD = 120;

const COMMERCE_BUILDINGS = new Set(["market", "bank", "harbor"]);

/** Luxury resource types this civ alone among the majors controls (a monopoly). */
export function luxuryMonopolies(state: GameState, playerId: number): number {
  const mine = empireLuxuryTypes(state, playerId);
  if (mine.size === 0) return 0;
  const others = state.players.filter((p) => !p.isBarbarian && p.id !== playerId);
  let count = 0;
  for (const lux of mine) {
    if (others.every((p) => !empireLuxuryTypes(state, p.id).has(lux))) count++;
  }
  return count;
}

/** A civ's commercial dominance: international trade, market monopolies, treasury,
 *  and commerce infrastructure. The Economic victory needs a clear hegemony in it. */
export function economicPower(state: GameState, playerId: number): number {
  const cities = citiesOf(state, playerId);
  const ownRoutes = state.tradeRoutes.filter((r) => r.ownerId === playerId);
  const intlRoutes = ownRoutes.filter((r) => r.international).length;
  const commerce = cities.reduce(
    (n, c) => n + c.buildings.filter((b) => COMMERCE_BUILDINGS.has(b)).length,
    0,
  );
  const treasury = state.players.find((p) => p.id === playerId)?.gold ?? 0;
  return (
    8 * intlRoutes +
    25 * luxuryMonopolies(state, playerId) +
    treasury / 100 +
    4 * commerce +
    2 * ownRoutes.length
  );
}

/** Economic — one civ's mercantile hegemony dwarfs every rival's. */
function checkEconomic(state: GameState): GameOver | null {
  const majors = civsWithCities(state);
  if (majors.length < 2) return null;
  const ranked = majors
    .map((p) => ({ id: p.id, power: economicPower(state, p.id) }))
    .sort((a, b) => b.power - a.power);
  const [first, second] = ranked;
  if (first && second && first.power >= ECONOMIC_THRESHOLD && first.power >= 2 * second.power) {
    return { winnerId: first.id, condition: "economic" };
  }
  return null;
}

/** Score — decided at the turn limit (a limit of 0 means unlimited). */
function checkScore(state: GameState): GameOver | null {
  const humans = state.players.filter((p) => p.isHuman);
  if (state.turnLimit <= 0 || state.turn < state.turnLimit || humans.length === 0) return null;
  let best = humans[0]!;
  let bestScore = playerScore(state, best.id);
  for (const p of humans) {
    const s = playerScore(state, p.id);
    if (s > bestScore) {
      best = p;
      bestScore = s;
    }
  }
  return { winnerId: best.id, condition: "score" };
}

/** Deterministically pick a single winner when several conditions resolve at once:
 *  decisive conditions beat a score finish, then highest score, then lowest id. */
function pickWinner(state: GameState, results: GameOver[]): GameOver | null {
  if (results.length === 0) return null;
  const decisive = results.filter((r) => r.condition !== "score");
  const pool = decisive.length > 0 ? decisive : results;
  pool.sort((a, b) => {
    const sa = a.winnerId !== undefined ? playerScore(state, a.winnerId) : -Infinity;
    const sb = b.winnerId !== undefined ? playerScore(state, b.winnerId) : -Infinity;
    if (sb !== sa) return sb - sa;
    return (a.winnerId ?? Number.POSITIVE_INFINITY) - (b.winnerId ?? Number.POSITIVE_INFINITY);
  });
  return pool[0]!;
}

/** Returns the game-over result if a victory condition is now met, else null. */
export function checkVictory(state: GameState): GameOver | null {
  // A dead game is over no matter which victories are enabled.
  const extinct = checkExtinction(state);
  if (extinct) return extinct;

  const results: GameOver[] = [];
  if (victoryEnabled(state, "domination")) {
    const r = checkDomination(state);
    if (r) results.push(r);
  }
  if (victoryEnabled(state, "religious")) {
    const r = checkReligious(state);
    if (r) results.push(r);
  }
  if (victoryEnabled(state, "science")) {
    const r = checkScience(state);
    if (r) results.push(r);
  }
  if (victoryEnabled(state, "culture")) {
    const r = checkCulture(state);
    if (r) results.push(r);
  }
  if (victoryEnabled(state, "economic")) {
    const r = checkEconomic(state);
    if (r) results.push(r);
  }
  // Score is an always-on fallback at the turn limit.
  const score = checkScore(state);
  if (score) results.push(score);

  return pickWinner(state, results);
}

/** Check and record a victory; logs and freezes the game when one occurs. */
export function applyVictoryCheck(state: GameState): void {
  if (state.gameOver) return;
  const result = checkVictory(state);
  if (result) {
    state.gameOver = result;
    if (result.condition === "extinction") {
      log(state, "Every civilization has fallen — there is no winner.", { world: true });
    } else {
      const winner = state.players.find((p) => p.id === result.winnerId);
      log(state, `${winner?.name ?? "Someone"} wins by ${result.condition}!`, { world: true });
    }
  }
}

// ---- progress reporting ----------------------------------------------------

/** A single victory path's standing for one player (drives the Victory panel). */
export interface VictoryProgressEntry {
  kind: VictoryKind;
  /** Whether this decisive condition is enabled this game. */
  enabled: boolean;
  /** This player's progress toward the condition, 0..1 (1 = won). */
  progress: number;
  /** A short headline, e.g. "Capitals 2/4" or "Not yet implemented". */
  detail: string;
}

const ALL_TECH_COUNT_HINT = 1; // avoids div-by-zero before content is counted

/** Per-condition progress for a player, for the Victory Progress UI and the AI.
 *  Only enabled decisive conditions plus the always-on Score finish are returned. */
export function victoryProgress(state: GameState, playerId: number): VictoryProgressEntry[] {
  const player = state.players.find((p) => p.id === playerId);
  const out: VictoryProgressEntry[] = [];
  const enabled = (k: VictoryKind) => victoryEnabled(state, k);

  // Domination — share of original capitals held.
  {
    const capitals = [...state.cities.values()].filter((c) => c.foundedAsCapital);
    const held = capitals.filter((c) => c.ownerId === playerId).length;
    const total = Math.max(1, capitals.length);
    out.push({
      kind: "domination",
      enabled: enabled("domination"),
      progress: held / total,
      detail: `Capitals ${held}/${capitals.length}`,
    });
  }

  // Religious — if this player founded a religion, share of civs it dominates.
  {
    const relId = player?.foundedReligionId;
    const civs = civsWithCities(state);
    let prog = 0;
    let detail = "No religion founded";
    if (relId && civs.length > 0) {
      const dominated = civs.filter((p) => religionDominatesCiv(state, p, relId)).length;
      prog = dominated / civs.length;
      detail = `Civs converted ${dominated}/${civs.length}`;
    }
    out.push({ kind: "religious", enabled: enabled("religious"), progress: prog, detail });
  }

  // Science — full tech tree + circumnavigation (the Great Endeavor).
  {
    const tp = player ? techProgress(player) : { have: 0, total: 1 };
    const sectors = player?.circumnavigation?.visitedSectors.length ?? 0;
    const techFrac = tp.have / tp.total;
    const voyageFrac = Math.min(1, sectors / CIRCUMNAVIGATION_SECTORS);
    out.push({
      kind: "science",
      enabled: enabled("science"),
      progress: (techFrac + voyageFrac) / 2,
      detail: `Techs ${tp.have}/${tp.total} · voyage ${sectors}/${CIRCUMNAVIGATION_SECTORS}`,
    });
  }

  // Culture — how many rivals you've become culturally influential over.
  {
    const st = influenceStanding(state, playerId);
    out.push({
      kind: "culture",
      enabled: enabled("culture"),
      progress: st.total > 0 ? st.influenced / st.total : 0,
      detail: `Influential over ${st.influenced}/${st.total}`,
    });
  }

  // Economic — your mercantile power vs. the threshold and the field.
  {
    const power = economicPower(state, playerId);
    const rivals = civsWithCities(state)
      .filter((p) => p.id !== playerId)
      .map((p) => economicPower(state, p.id));
    const topRival = rivals.length ? Math.max(...rivals) : 0;
    // Progress = how close you are to both gates (the threshold and a 2× lead).
    const vsThreshold = Math.min(1, power / ECONOMIC_THRESHOLD);
    const vsLead = topRival > 0 ? Math.min(1, power / (2 * topRival)) : power > 0 ? 1 : 0;
    out.push({
      kind: "economic",
      enabled: enabled("economic"),
      progress: Math.min(vsThreshold, vsLead),
      detail: `Power ${Math.round(power)} · lead vs ${Math.round(topRival)}`,
    });
  }

  // Score — your score vs. the current leader, and turns elapsed.
  {
    const humans = state.players.filter((p) => p.isHuman);
    const scores = humans.map((p) => playerScore(state, p.id));
    const leader = Math.max(1, ...scores, ALL_TECH_COUNT_HINT);
    const mine = playerScore(state, playerId);
    const turnFrac = state.turnLimit > 0 ? Math.min(1, state.turn / state.turnLimit) : 0;
    out.push({
      kind: "score",
      enabled: true,
      progress: Math.min(1, mine / leader),
      detail:
        state.turnLimit > 0
          ? `Score ${mine} · turn ${state.turn}/${state.turnLimit}`
          : `Score ${mine} · unlimited`,
    });
    void turnFrac;
  }

  return out;
}
