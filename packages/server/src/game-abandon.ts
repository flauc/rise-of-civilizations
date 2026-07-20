/** When every player disconnects from an MP game, purge it after this delay. */
export const DEFAULT_ABANDON_MS = 5 * 60 * 1000;

export function resolveAbandonMs(): number {
  const raw = process.env.GAME_ABANDON_MS;
  if (raw === undefined || raw === "") return DEFAULT_ABANDON_MS;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_ABANDON_MS;
}

type TimerHandle = ReturnType<typeof setTimeout>;

/** Schedules game deletion when no WebSocket connections remain. */
export class GameAbandonScheduler {
  private readonly timers = new Map<string, TimerHandle>();

  constructor(
    private readonly abandonMs: number,
    private readonly onExpire: (gameId: string) => void,
  ) {}

  /** Call when a connection joins or reconnects to a game. */
  playerConnected(gameId: string): void {
    this.cancel(gameId);
  }

  /** Call when a connection closes; starts the timer if the game is now empty. */
  playerDisconnected(gameId: string, liveConnectionCount: number): void {
    if (liveConnectionCount > 0) return;
    this.schedule(gameId);
  }

  /** Call when a game is deleted explicitly (host action or abandon expiry). */
  gameRemoved(gameId: string): void {
    this.cancel(gameId);
  }

  private schedule(gameId: string): void {
    if (this.timers.has(gameId)) return;
    const handle = setTimeout(() => {
      this.timers.delete(gameId);
      this.onExpire(gameId);
    }, this.abandonMs);
    this.timers.set(gameId, handle);
  }

  private cancel(gameId: string): void {
    const handle = this.timers.get(gameId);
    if (!handle) return;
    clearTimeout(handle);
    this.timers.delete(gameId);
  }
}
