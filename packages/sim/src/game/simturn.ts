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
import { processCity, applyUnitUpkeep } from "./economy";
import { barbarianTurn } from "./barbarians";
import { updateExplored } from "./visibility";
import { applyVictoryCheck } from "./victory";
import { spreadReligion } from "./religion";
import { pruneTradeRoutes } from "./trade";
import { pruneBarbarianBribes } from "./bribery";
import { advanceWorks } from "./works";
import { gatherPlayerResources } from "./resources";
import { tickAbilities } from "./abilities";
import { canStealthMove, stealthMovement } from "./stealth";
import { diplomacyTick } from "./diplomacy";
import { aiTakeTurn } from "./ai";

/** Begin a fresh turn for ALL players at once: refresh movement, heal, reveal. */
export function startSimultaneousTurn(state: GameState): void {
  for (const u of state.units.values()) {
    if (u.sleeping) continue;
    u.movementLeft = unitMovement(state, u);
    // A concealed stealth-mover creeps at one third its normal pace.
    if (u.hidden && canStealthMove(state, u)) u.movementLeft = stealthMovement(u.movementLeft);
  }
  for (const p of state.players) {
    healAndReset(state, p);
    tickAbilities(state, p); // expire stances/pulses, enforce pins (after movement reset)
    gatherPlayerResources(state, p.id); // stockpile strategic resources for the turn
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
  // Economy for every civ — humans AND AI alike. (Barbarians own no cities or
  // works, so skipping them just avoids needless iteration.) Without this the AI
  // would issue orders via aiTakeTurn but never accumulate production, growth,
  // gold, or research — i.e. never actually develop in simultaneous play.
  for (const p of state.players) {
    if (p.isBarbarian) continue;
    for (const c of state.cities.values()) {
      if (c.ownerId === p.id) processCity(state, c, p);
    }
    applyUnitUpkeep(state, p); // empire-wide unit maintenance after city income
    advanceWorks(state, p.id); // specialists labour on public works
  }
  spreadReligion(state);
  diplomacyTick(state); // pay deal obligations, decay relations, expire pacts (once per round)
  pruneBarbarianBribes(state); // expire truces whose 10 turns have elapsed
  state.turn += 1;
  startSimultaneousTurn(state);
  applyVictoryCheck(state);
}
