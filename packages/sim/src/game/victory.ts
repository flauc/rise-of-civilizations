// Victory conditions (M4). Two are implemented for now:
//  - Domination: be the last human standing, OR control every original capital.
//  - Score: highest score when the turn limit is reached.
// (Science / Culture / Religious / Economic victories arrive with their systems.)

import type { GameState, GameOver, Player } from "./state";
import { citiesOf, unitsOf } from "./state";

/** A simple aggregate score for the score victory and end-game ranking. */
export function playerScore(state: GameState, playerId: number): number {
  const cities = citiesOf(state, playerId);
  const pop = cities.reduce((n, c) => n + c.population, 0);
  const player = state.players.find((p) => p.id === playerId);
  const techs = player ? player.researched.size : 0;
  const units = unitsOf(state, playerId).length;
  return cities.length * 10 + pop * 2 + techs * 5 + units + Math.floor((player?.gold ?? 0) / 10);
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

  // Domination — one player controls every original capital.
  const capitals = [...state.cities.values()].filter((c) => c.foundedAsCapital);
  if (capitals.length >= 2) {
    const owner = capitals[0]!.ownerId;
    if (capitals.every((c) => c.ownerId === owner)) {
      return { winnerId: owner, condition: "domination" };
    }
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
    const winner = state.players.find((p) => p.id === result.winnerId);
    state.log.push(`${winner?.name ?? "Someone"} wins by ${result.condition}!`);
  }
}
