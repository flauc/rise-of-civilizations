// In-memory lobby + match registry. Pure TS (no Bun) so it's unit-testable.

import { createGame, type BarbarianActivity, type GameState, type GameSummary, type LobbyRoom, type MapType } from "@roc/sim";
import { GameHost } from "./gamehost";

export interface Slot {
  slot: number;
  playerId: number;
  userId?: string;
  handle?: string;
  /** Civ chosen by the player in this slot; undefined = a random unique civ. */
  civId?: string;
}

export interface LobbyGame {
  id: string;
  name: string;
  status: "lobby" | "active";
  seed: string;
  capacity: number;
  cols?: number;
  rows?: number;
  aiCount: number;
  mapType: MapType;
  barbarians: BarbarianActivity;
  naturalWonders: boolean;
  startingGold: "tight" | "balanced" | "generous";
  /** Civ id per AI opponent; null = a random unique civ. */
  aiCivIds: (string | null)[];
  /** Color per player slot (humans first, then AI); null = auto-assigned. */
  colors: (string | null)[];
  slots: Slot[];
  host?: GameHost;
}

const MAX_CAPACITY = 12;
const MAX_AI = 12;

export interface CreateOptions {
  seed?: string;
  cols?: number;
  rows?: number;
  capacity?: number;
  aiCount?: number;
  mapType?: MapType;
  barbarians?: BarbarianActivity;
  naturalWonders?: boolean;
  startingGold?: "tight" | "balanced" | "generous";
  aiCivIds?: (string | null)[];
  colors?: (string | null)[];
}

function randomId(): string {
  return "g_" + Math.random().toString(36).slice(2, 10);
}

export class Lobby {
  private readonly games = new Map<string, LobbyGame>();

  create(name: string, ownerUserId: string, ownerHandle: string, opts: CreateOptions = {}): LobbyGame {
    const id = randomId();
    const capacity = Math.max(1, Math.min(MAX_CAPACITY, opts.capacity ?? 2));
    // Prefer an explicit aiCivIds list (one entry per AI) so the host's per-AI civ
    // choices survive; otherwise fall back to a plain count of random-civ AIs.
    const aiCount = Math.max(0, Math.min(MAX_AI, opts.aiCivIds?.length ?? opts.aiCount ?? 0));
    const aiCivIds = (opts.aiCivIds ?? Array.from({ length: aiCount }, () => null)).slice(0, aiCount);
    const slots: Slot[] = Array.from({ length: capacity }, (_, i) => ({ slot: i, playerId: i }));
    slots[0]!.userId = ownerUserId;
    slots[0]!.handle = ownerHandle;
    const game: LobbyGame = {
      id,
      name,
      status: "lobby",
      seed: opts.seed ?? id,
      capacity,
      cols: opts.cols,
      rows: opts.rows,
      aiCount,
      mapType: opts.mapType ?? "continents",
      barbarians: opts.barbarians ?? "normal",
      naturalWonders: opts.naturalWonders ?? false,
      startingGold: opts.startingGold ?? "balanced",
      aiCivIds,
      colors: (opts.colors ?? []).slice(0, capacity + aiCount),
      slots,
    };
    this.games.set(id, game);
    return game;
  }

  get(id: string): LobbyGame | undefined {
    return this.games.get(id);
  }

  /** Join a game in an open slot (idempotent if already seated). */
  join(gameId: string, userId: string, handle: string): { slot: number; playerId: number } | { error: string } {
    const game = this.games.get(gameId);
    if (!game) return { error: "no such game" };
    if (game.status !== "lobby") return { error: "game already started" };
    const existing = game.slots.find((s) => s.userId === userId);
    if (existing) return { slot: existing.slot, playerId: existing.playerId };
    const open = game.slots.find((s) => s.userId === undefined);
    if (!open) return { error: "game is full" };
    open.userId = userId;
    open.handle = handle;
    return { slot: open.slot, playerId: open.playerId };
  }

  /**
   * Choose (or clear, with civId=null) the civ for the slot a user occupies.
   * Rejects a civ already claimed by another human slot or an AI opponent so
   * no two players share one.
   */
  pickCiv(gameId: string, userId: string, civId: string | null): { error: string } | { ok: true } {
    const game = this.games.get(gameId);
    if (!game) return { error: "no such game" };
    if (game.status !== "lobby") return { error: "game already started" };
    const slot = game.slots.find((s) => s.userId === userId);
    if (!slot) return { error: "not in this game" };
    if (civId === null) {
      slot.civId = undefined;
      return { ok: true };
    }
    const takenByHuman = game.slots.some((s) => s !== slot && s.civId === civId);
    const takenByAi = game.aiCivIds.includes(civId);
    if (takenByHuman || takenByAi) return { error: "civ already taken" };
    slot.civId = civId;
    return { ok: true };
  }

  /** A broadcastable snapshot of a game's pre-game roster. */
  room(gameId: string): LobbyRoom | undefined {
    const g = this.games.get(gameId);
    if (!g) return undefined;
    return {
      gameId: g.id,
      name: g.name,
      hostUserId: g.slots[0]?.userId ?? "",
      capacity: g.capacity,
      slots: g.slots.map((s) => ({
        slot: s.slot,
        playerId: s.playerId,
        userId: s.userId,
        handle: s.handle,
        civId: s.civId,
      })),
      aiCivIds: g.aiCivIds,
      colors: g.colors,
    };
  }

  /** Start the match: build the sim state and a GameHost. */
  start(gameId: string): { error: string } | { ok: true } {
    const game = this.games.get(gameId);
    if (!game) return { error: "no such game" };
    if (game.status === "active") return { ok: true };
    const names = game.slots.map((s, i) => s.handle ?? `Player ${i + 1}`);
    // Civ ids align to the player slots: each human's chosen civ (undefined =
    // random unique) then the AI civs.
    const civIds = [
      ...game.slots.map((s) => s.civId ?? undefined),
      ...game.aiCivIds.map((c) => c ?? undefined),
    ];
    const state = createGame({
      seed: game.seed,
      cols: game.cols,
      rows: game.rows,
      mapType: game.mapType,
      playerNames: names,
      playerCount: names.length + game.aiCount,
      humanSlots: names.length,
      barbarians: game.barbarians,
      naturalWonders: game.naturalWonders,
      startingGold: game.startingGold,
      civIds,
      colors: game.colors,
    });
    game.host = new GameHost(state);
    game.status = "active";
    return { ok: true };
  }

  /** Which player slot a user occupies in a game (if any). */
  slotOf(gameId: string, userId: string): Slot | undefined {
    return this.games.get(gameId)?.slots.find((s) => s.userId === userId);
  }

  /** Remove a game from the lobby. Only the host may delete it. */
  delete(gameId: string, hostUserId: string): { error: string } | { ok: true } {
    const game = this.games.get(gameId);
    if (!game) return { error: "no such game" };
    if (game.slots[0]?.userId !== hostUserId) return { error: "only the host can delete this game" };
    this.games.delete(gameId);
    return { ok: true };
  }

  /** Replace an active game's host with a restored state. */
  restore(gameId: string, state: GameState): { error: string } | { ok: true } {
    const game = this.games.get(gameId);
    if (!game) return { error: "no such game" };
    if (game.status !== "active") return { error: "game not active" };
    game.host = GameHost.fromState(state);
    return { ok: true };
  }

  list(): GameSummary[] {
    return [...this.games.values()].map((g) => ({
      id: g.id,
      name: g.name,
      status: g.status,
      players: g.slots.filter((s) => s.userId).length,
      capacity: g.capacity,
      hostUserId: g.slots[0]?.userId ?? "",
    }));
  }
}
