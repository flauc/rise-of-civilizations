// Real-time SIMULTANEOUS turn model (the M3 multiplayer launch mode), as opposed
// to the sequential hotseat flow in commands.ts (beginTurn/endTurn).
//
// In simultaneous play every player acts during the same turn. The server applies
// each player's orders as they arrive (validated per-owner via applyCommand's
// actingPlayerId). When all human players are ready, the turn is resolved:
// barbarians act, economies tick, then the next turn begins for everyone at once.

import type { GameState } from "./state";
import { unitMovement } from "./civs";
import { healAndReset, towerBombardment } from "./combat";
import { processCity } from "./economy";
import { barbarianTurn } from "./barbarians";
import { updateExplored } from "./visibility";
import { applyVictoryCheck } from "./victory";
import { spreadReligion } from "./religion";
import { pruneTradeRoutes } from "./trade";
import { advanceWorks } from "./works";
import { aiTakeTurn } from "./ai";

/** Begin a fresh turn for ALL players at once: refresh movement, heal, reveal. */
export function startSimultaneousTurn(state: GameState): void {
  for (const u of state.units.values()) {
    u.movementLeft = unitMovement(state, u);
  }
  for (const p of state.players) {
    healAndReset(state, p);
    for (const c of state.cities.values()) {
      if (c.ownerId === p.id) c.rangedAttackUsed = false;
    }
    towerBombardment(state, p.id);
    updateExplored(state, p.id);
  }
}

/** Resolve the current turn: barbarians act, economies tick, advance to next. */
export function resolveSimultaneousTurn(state: GameState): void {
  if (state.gameOver) return;
  pruneTradeRoutes(state); // drop routes whose cities were lost/captured
  // Non-human factions act using the movement granted at the start of this turn:
  // AI civs play a full turn; barbarians raid.
  for (const p of state.players) {
    if (p.isHuman) continue;
    if (p.isBarbarian) barbarianTurn(state, p.id);
    else aiTakeTurn(state, p.id);
  }
  // Economy for human players.
  for (const p of state.players) {
    if (!p.isHuman) continue;
    for (const c of state.cities.values()) {
      if (c.ownerId === p.id) processCity(state, c, p);
    }
    advanceWorks(state, p.id); // specialists labour on public works
  }
  spreadReligion(state);
  state.turn += 1;
  startSimultaneousTurn(state);
  applyVictoryCheck(state);
}
