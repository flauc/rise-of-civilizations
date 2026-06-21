// Victory conditions (M4). Two are implemented for now:
//  - Domination: be the last human standing, OR control every original capital.
//  - Score: highest score when the turn limit is reached.
// (Science / Culture / Religious / Economic victories arrive with their systems.)

import type { GameState, GameOver, Player } from "./state";
import { citiesOf, log, unitsOf } from "./state";

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

/** Returns the game-over result if a victory condition is now met, else null. */
export function checkVictory(state: GameState): GameOver | null {
  const humans = state.players.filter((p) => p.isHuman);

  // Domination — last human standing.
  const alive = humans.filter((p) => isAlive(state, p));
  if (humans.length > 1 && alive.length === 1) {
    return { winnerId: alive[0]!.id, condition: "domination" };
  }

  // Domination — last major civ standing (humans + AI, excluding barbarians).
  const majors = state.players.filter((p) => !p.isBarbarian);
  const aliveMajor = majors.filter((p) => isAlive(state, p));
  if (majors.length > 1 && aliveMajor.length === 1) {
    return { winnerId: aliveMajor[0]!.id, condition: "domination" };
  }

  // Extinction — every major civilization has been wiped out.
  if (aliveMajor.length === 0 && majors.length > 0) {
    return { condition: "extinction" };
  }

  // Domination — conquest: one non-barbarian player controls every city on the map.
  // Require the sole owner to hold at least two cities so the game doesn't end
  // immediately on turn 1 before every civ has had a chance to found its capital.
  const ownerCityCounts = new Map<number, number>();
  for (const c of state.cities.values()) {
    const owner = state.players.find((p) => p.id === c.ownerId);
    if (!owner || owner.isBarbarian) continue;
    ownerCityCounts.set(owner.id, (ownerCityCounts.get(owner.id) ?? 0) + 1);
  }
  if (ownerCityCounts.size === 1) {
    const [winnerId, cityCount] = [...ownerCityCounts][0]!;
    if (cityCount >= 2) {
      return { winnerId, condition: "domination" };
    }
  }

  // Domination — one player controls every original capital.
  const capitals = [...state.cities.values()].filter((c) => c.foundedAsCapital);
  if (capitals.length >= 2) {
    const owner = capitals[0]!.ownerId;
    if (capitals.every((c) => c.ownerId === owner)) {
      return { winnerId: owner, condition: "domination" };
    }
  }

  // Religious — a religion is the majority faith in every civ that has cities.
  for (const religion of state.religions) {
    const civsWithCities = state.players.filter(
      (p) => !p.isBarbarian && [...state.cities.values()].some((c) => c.ownerId === p.id),
    );
    if (civsWithCities.length < 2) continue;
    const dominantEverywhere = civsWithCities.every((p) => {
      const cities = [...state.cities.values()].filter((c) => c.ownerId === p.id);
      const following = cities.filter((c) => c.religion === religion.id).length;
      return following * 2 > cities.length; // strict majority
    });
    if (dominantEverywhere) return { winnerId: religion.founderId, condition: "religious" };
  }

  // Score — decided at the turn limit.
  if (state.turn >= state.turnLimit && humans.length > 0) {
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

  return null;
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
