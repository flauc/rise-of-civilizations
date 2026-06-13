// Real-time SIMULTANEOUS turn model (the M3 multiplayer launch mode), as opposed
// to the sequential hotseat flow in commands.ts (beginTurn/endTurn).
//
// In simultaneous play every player acts during the same turn. The server applies
// each player's orders as they arrive (validated per-owner via applyCommand's
// actingPlayerId). When all human players are ready, the turn is resolved:
// barbarians act, economies tick, then the next turn begins for everyone at once.

import { UNIT_DEFS } from "./content";
import type { GameState } from "./state";
import { healAndReset } from "./combat";
import { processCity } from "./economy";
import { barbarianTurn } from "./barbarians";
import { updateExplored } from "./visibility";

/** Begin a fresh turn for ALL players at once: refresh movement, heal, reveal. */
export function startSimultaneousTurn(state: GameState): void {
  for (const u of state.units.values()) {
    u.movementLeft = UNIT_DEFS[u.type].movement;
  }
  for (const p of state.players) {
    healAndReset(state, p);
    for (const c of state.cities.values()) {
      if (c.ownerId === p.id) c.rangedAttackUsed = false;
    }
    updateExplored(state, p.id);
  }
}

/** Resolve the current turn: barbarians act, economies tick, advance to next. */
export function resolveSimultaneousTurn(state: GameState): void {
  // Non-human factions (barbarians) take their actions using the movement they
  // were granted at the start of this turn.
  for (const p of state.players) {
    if (!p.isHuman) barbarianTurn(state, p.id);
  }
  // Economy for human players.
  for (const p of state.players) {
    if (!p.isHuman) continue;
    for (const c of state.cities.values()) {
      if (c.ownerId === p.id) processCity(state, c, p);
    }
  }
  state.turn += 1;
  startSimultaneousTurn(state);
}
