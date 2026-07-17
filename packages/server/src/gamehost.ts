// Per-match authoritative controller. Pure TS (no Bun APIs) so it runs under
// vitest. Holds the sim state, validates/apply orders per-owner, and resolves
// simultaneous turns when all human players are ready.

import {
  applyCommand,
  resolveSimultaneousTurn,
  startSimultaneousTurn,
  viewForPlayer,
  type Command,
  type GameState,
  type PlayerView,
} from "@roc/sim";

export interface OrderOutcome {
  ok: boolean;
  error?: string;
  /** True when this order (a "ready") caused the turn to resolve. */
  resolved?: boolean;
}

export class GameHost {
  readonly state: GameState;
  private readonly ready = new Set<number>();
  /** Connected humans only — empty lobby seats must not block resolution. */
  private readonly connectedHumanIds: number[];

  constructor(state: GameState, connectedHumanIds: number[], startTurn = true) {
    this.state = state;
    this.connectedHumanIds = [...connectedHumanIds];
    if (startTurn) startSimultaneousTurn(state);
  }

  /** Restore a host from a saved state without refreshing the turn. */
  static fromState(state: GameState, connectedHumanIds: number[]): GameHost {
    return new GameHost(state, connectedHumanIds, false);
  }

  /** Apply a player's order (move/attack/found/build/promote/production/research). */
  order(playerId: number, cmd: Command): OrderOutcome {
    if (cmd.type === "endTurn") return { ok: false, error: "use ready, not endTurn" };
    const res = applyCommand(this.state, cmd, playerId);
    return { ok: res.ok, ...(res.error !== undefined ? { error: res.error } : {}) };
  }

  /** Mark a player ready (end of turn). Resolves the turn once all are ready. */
  ready_(playerId: number): OrderOutcome {
    if (!this.connectedHumanIds.includes(playerId)) return { ok: false, error: "not a player" };
    this.ready.add(playerId);
    if (this.connectedHumanIds.every((id) => this.ready.has(id))) {
      resolveSimultaneousTurn(this.state);
      this.ready.clear();
      return { ok: true, resolved: true };
    }
    return { ok: true, resolved: false };
  }

  /** Connected human players we are still waiting on this turn. */
  awaiting(): number[] {
    return this.connectedHumanIds.filter((id) => !this.ready.has(id));
  }

  view(playerId: number): PlayerView {
    return viewForPlayer(this.state, playerId);
  }
}
