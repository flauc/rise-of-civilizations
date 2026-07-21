// Voluntary concession — removes a major civ from an in-progress match.

import type { GameState } from "./state";
import { citiesOf, playerById, unitsOf } from "./state";
import { applyVictoryCheck } from "./victory";
import { emitPlayerSurrendered } from "./turn-updates";

const ok = { ok: true as const };
const fail = (error: string) => ({ ok: false as const, error });

/** Remove a player's units and cities, mark them eliminated, and notify rivals. */
export function applySurrender(state: GameState, playerId: number) {
  const player = playerById(state, playerId);
  if (!player || player.isBarbarian) return fail("cannot surrender");
  if (player.eliminated) return fail("already eliminated");
  if (state.gameOver) return fail("game is over");

  for (const unit of [...unitsOf(state, playerId)]) {
    state.units.delete(unit.id);
  }
  for (const city of [...citiesOf(state, playerId)]) {
    state.cities.delete(city.id);
  }

  player.eliminated = true;
  emitPlayerSurrendered(state, playerId);
  applyVictoryCheck(state);
  return ok;
}
