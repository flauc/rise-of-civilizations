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
  private readonly humanIds: number[];

  constructor(state: GameState, startTurn = true) {
    this.state = state;
    this.humanIds = state.players.filter((p) => p.isHuman).map((p) => p.id);
    if (startTurn) startSimultaneousTurn(state);
  }

  /** Restore a host from a saved state without refreshing the turn. */
  static fromState(state: GameState): GameHost {
    return new GameHost(state, false);
  }

  /** Apply a player's order (move/attack/found/build/promote/production/research). */
  order(playerId: number, cmd: Command): OrderOutcome {
    if (cmd.type === "endTurn") return { ok: false, error: "use ready, not endTurn" };
    const res = applyCommand(this.state, cmd, playerId);
    return { ok: res.ok, ...(res.error !== undefined ? { error: res.error } : {}) };
  }

  /** Mark a player ready (end of turn). Resolves the turn once all are ready. */
  ready_(playerId: number): OrderOutcome {
    if (!this.humanIds.includes(playerId)) return { ok: false, error: "not a player" };
    this.ready.add(playerId);
    if (this.humanIds.every((id) => this.ready.has(id))) {
      resolveSimultaneousTurn(this.state);
      this.ready.clear();
      return { ok: true, resolved: true };
    }
    return { ok: true, resolved: false };
  }

  /** Human players we are still waiting on this turn. */
  awaiting(): number[] {
    return this.humanIds.filter((id) => !this.ready.has(id));
  }

  view(playerId: number): PlayerView {
    return viewForPlayer(this.state, playerId);
  }
}
