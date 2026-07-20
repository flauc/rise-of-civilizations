import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GameAbandonScheduler } from "./game-abandon";

describe("GameAbandonScheduler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("fires after abandonMs when the last player disconnects", () => {
    const expired: string[] = [];
    const scheduler = new GameAbandonScheduler(60_000, (gameId) => expired.push(gameId));

    scheduler.playerDisconnected("g1", 0);
    expect(expired).toEqual([]);
    vi.advanceTimersByTime(59_999);
    expect(expired).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(expired).toEqual(["g1"]);
  });

  it("does not start a timer while connections remain", () => {
    const expired: string[] = [];
    const scheduler = new GameAbandonScheduler(60_000, (gameId) => expired.push(gameId));

    scheduler.playerDisconnected("g1", 2);
    vi.advanceTimersByTime(120_000);
    expect(expired).toEqual([]);
  });

  it("cancels the timer when a player reconnects", () => {
    const expired: string[] = [];
    const scheduler = new GameAbandonScheduler(60_000, (gameId) => expired.push(gameId));

    scheduler.playerDisconnected("g1", 0);
    vi.advanceTimersByTime(30_000);
    scheduler.playerConnected("g1");
    vi.advanceTimersByTime(60_000);
    expect(expired).toEqual([]);
  });

  it("schedules only one timer per game", () => {
    const expired: string[] = [];
    const scheduler = new GameAbandonScheduler(60_000, (gameId) => expired.push(gameId));

    scheduler.playerDisconnected("g1", 0);
    scheduler.playerDisconnected("g1", 0);
    vi.advanceTimersByTime(60_000);
    expect(expired).toEqual(["g1"]);
  });
});
