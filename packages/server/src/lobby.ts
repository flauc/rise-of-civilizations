// In-memory lobby + match registry. Pure TS (no Bun) so it's unit-testable.
//
// A game in the "lobby" state has an editable roster of slots. Each slot is
// either a human seat (open or occupied by a user) or an AI opponent. The host
// can reconfigure everything — slot count, each slot's kind/civ/color, the map
// and game options, and a join password — right up until the match starts.

import {
  createGame,
  PLAYER_COLORS,
  type BarbarianActivity,
  type GameState,
  type GameSummary,
  type LobbyRoom,
  type MapType,
} from "@roc/sim";
import { GameHost } from "./gamehost";

export type SlotKind = "human" | "ai";

export interface Slot {
  /** Stable id for the lifetime of the lobby (independent of array position). */
  id: number;
  kind: SlotKind;
  /** Set when a human occupies the seat. */
  userId?: string;
  handle?: string;
  /** Chosen civ (human pick or AI assignment); undefined = a random unique civ. */
  civId?: string;
  /** Player color; assigned from the palette so the roster always shows one. */
  color?: string;
  /** Sim player index, assigned at start (humans first, then AI). */
  playerId?: number;
}

export type StartingGold = "tight" | "balanced" | "generous";

export interface LobbyGame {
  id: string;
  name: string;
  status: "lobby" | "active";
  seed: string;
  cols?: number;
  rows?: number;
  mapSize?: string;
  mapType: MapType;
  barbarians: BarbarianActivity;
  naturalWonders: boolean;
  startingGold: StartingGold;
  /** Turn at which the score victory triggers; 0 = unlimited. */
  turnLimit: number;
  /** Optional join password; empty/undefined means the game is open. */
  password?: string;
  hostUserId: string;
  slots: Slot[];
  nextSlotId: number;
  host?: GameHost;
}

const MAX_HUMANS = 12;
const MAX_TOTAL = 24;

export interface CreateOptions {
  seed?: string;
  cols?: number;
  rows?: number;
  mapSize?: string;
  /** Number of human seats to open (including the host). */
  capacity?: number;
  aiCount?: number;
  mapType?: MapType;
  barbarians?: BarbarianActivity;
  naturalWonders?: boolean;
  startingGold?: StartingGold;
  /** Turn at which the score victory triggers; 0 = unlimited. Defaults to 120. */
  turnLimit?: number;
  password?: string;
  /** Civ id per AI opponent; null = a random unique civ. */
  aiCivIds?: (string | null)[];
  /** Color per slot (humans first, then AI); null = auto-assigned. */
  colors?: (string | null)[];
}

/** Patch for host-only game-level reconfiguration. */
export interface ConfigurePatch {
  name?: string;
  /** Empty string clears the password (game becomes open). */
  password?: string;
  cols?: number;
  rows?: number;
  mapSize?: string;
  mapType?: MapType;
  barbarians?: BarbarianActivity;
  naturalWonders?: boolean;
  startingGold?: StartingGold;
  /** Turn at which the score victory triggers; 0 = unlimited. */
  turnLimit?: number;
}

export interface SlotPatch {
  kind?: SlotKind;
  /** null clears the civ back to random. */
  civId?: string | null;
  color?: string;
}

type Result = { error: string } | { ok: true };

function randomId(): string {
  return "g_" + Math.random().toString(36).slice(2, 10);
}

export class Lobby {
  private readonly games = new Map<string, LobbyGame>();

  private firstFreeColor(game: LobbyGame): string {
    const used = new Set(game.slots.map((s) => s.color).filter(Boolean));
    return PLAYER_COLORS.find((c) => !used.has(c)) ?? "#9aa0a6";
  }

  private requireHostLobby(gameId: string, userId: string): LobbyGame | { error: string } {
    const game = this.games.get(gameId);
    if (!game) return { error: "no such game" };
    if (game.status !== "lobby") return { error: "game already started" };
    if (game.hostUserId !== userId) return { error: "only the host can do that" };
    return game;
  }

  /** True if `civId` is already claimed by some slot other than `exceptId`. */
  private civTaken(game: LobbyGame, civId: string, exceptId: number): boolean {
    return game.slots.some((s) => s.id !== exceptId && s.civId === civId);
  }

  create(name: string, ownerUserId: string, ownerHandle: string, opts: CreateOptions = {}): LobbyGame {
    const id = randomId();
    const capacity = Math.max(1, Math.min(MAX_HUMANS, opts.capacity ?? 2));
    const aiCivIds = (opts.aiCivIds ?? Array.from({ length: opts.aiCount ?? 0 }, () => null)).slice(
      0,
      MAX_TOTAL - capacity,
    );
    const colors = opts.colors ?? [];
    let nextSlotId = 0;
    const slots: Slot[] = [];
    for (let i = 0; i < capacity; i++) {
      slots.push({ id: nextSlotId++, kind: "human", color: colors[i] ?? undefined });
    }
    for (let i = 0; i < aiCivIds.length; i++) {
      slots.push({ id: nextSlotId++, kind: "ai", civId: aiCivIds[i] ?? undefined, color: colors[capacity + i] ?? undefined });
    }
    // The host always takes the first human seat.
    slots[0]!.userId = ownerUserId;
    slots[0]!.handle = ownerHandle;
    const game: LobbyGame = {
      id,
      name,
      status: "lobby",
      seed: opts.seed ?? id,
      cols: opts.cols,
      rows: opts.rows,
      mapSize: opts.mapSize,
      mapType: opts.mapType ?? "continents",
      barbarians: opts.barbarians ?? "normal",
      naturalWonders: opts.naturalWonders ?? false,
      startingGold: opts.startingGold ?? "balanced",
      turnLimit: opts.turnLimit ?? 120,
      password: opts.password || undefined,
      hostUserId: ownerUserId,
      slots,
      nextSlotId,
    };
    // Backfill any colors the host didn't specify so the roster is fully colored.
    for (const s of slots) if (!s.color) s.color = this.firstFreeColor(game);
    this.games.set(id, game);
    return game;
  }

  get(id: string): LobbyGame | undefined {
    return this.games.get(id);
  }

  /** Join an open human seat (idempotent if already seated). Honors the password. */
  join(
    gameId: string,
    userId: string,
    handle: string,
    password?: string,
  ): { slotId: number } | { error: string } {
    const game = this.games.get(gameId);
    if (!game) return { error: "no such game" };
    if (game.status !== "lobby") return { error: "game already started" };
    const existing = game.slots.find((s) => s.userId === userId);
    if (existing) return { slotId: existing.id };
    if (game.password && password !== game.password) return { error: "wrong password" };
    const open = game.slots.find((s) => s.kind === "human" && s.userId === undefined);
    if (!open) return { error: "game is full" };
    open.userId = userId;
    open.handle = handle;
    return { slotId: open.id };
  }

  /** Host-only game-level reconfiguration (map, options, name, password). */
  configure(gameId: string, userId: string, patch: ConfigurePatch): Result {
    const game = this.requireHostLobby(gameId, userId);
    if ("error" in game) return game;
    if (patch.name !== undefined) game.name = patch.name.slice(0, 60) || game.name;
    if (patch.password !== undefined) game.password = patch.password || undefined;
    if (patch.cols !== undefined) game.cols = patch.cols;
    if (patch.rows !== undefined) game.rows = patch.rows;
    if (patch.mapSize !== undefined) game.mapSize = patch.mapSize;
    if (patch.mapType !== undefined) game.mapType = patch.mapType;
    if (patch.barbarians !== undefined) game.barbarians = patch.barbarians;
    if (patch.naturalWonders !== undefined) game.naturalWonders = patch.naturalWonders;
    if (patch.startingGold !== undefined) game.startingGold = patch.startingGold;
    if (patch.turnLimit !== undefined) game.turnLimit = Math.max(0, Math.floor(patch.turnLimit));
    return { ok: true };
  }

  /** Host adds a slot of the given kind. */
  addSlot(gameId: string, userId: string, kind: SlotKind): Result {
    const game = this.requireHostLobby(gameId, userId);
    if ("error" in game) return game;
    if (game.slots.length >= MAX_TOTAL) return { error: "no more room for players" };
    if (kind === "human" && game.slots.filter((s) => s.kind === "human").length >= MAX_HUMANS)
      return { error: "max human players reached" };
    const slot: Slot = { id: game.nextSlotId++, kind };
    game.slots.push(slot);
    slot.color = this.firstFreeColor(game);
    return { ok: true };
  }

  /** Host removes a slot (cannot remove their own or the last human seat). */
  removeSlot(gameId: string, userId: string, slotId: number): { ok: true; kicked?: string } | { error: string } {
    const game = this.requireHostLobby(gameId, userId);
    if ("error" in game) return game;
    const slot = game.slots.find((s) => s.id === slotId);
    if (!slot) return { error: "no such slot" };
    if (slot.userId === game.hostUserId) return { error: "the host cannot leave their own game" };
    if (slot.kind === "human" && game.slots.filter((s) => s.kind === "human").length <= 1)
      return { error: "a game needs at least one human seat" };
    const kicked = slot.userId;
    game.slots = game.slots.filter((s) => s.id !== slotId);
    return kicked ? { ok: true, kicked } : { ok: true };
  }

  /** Host updates a slot's kind / AI civ / color. Toggling an occupied human seat to AI evicts the player. */
  updateSlot(
    gameId: string,
    userId: string,
    slotId: number,
    patch: SlotPatch,
  ): { ok: true; kicked?: string } | { error: string } {
    const game = this.requireHostLobby(gameId, userId);
    if ("error" in game) return game;
    const slot = game.slots.find((s) => s.id === slotId);
    if (!slot) return { error: "no such slot" };
    let kicked: string | undefined;
    if (patch.kind && patch.kind !== slot.kind) {
      if (patch.kind === "human" && game.slots.filter((s) => s.kind === "human").length >= MAX_HUMANS)
        return { error: "max human players reached" };
      if (patch.kind === "ai" && slot.userId) {
        kicked = slot.userId;
        slot.userId = undefined;
        slot.handle = undefined;
        slot.civId = undefined;
      }
      slot.kind = patch.kind;
    }
    if (patch.civId !== undefined) {
      if (patch.civId === null) slot.civId = undefined;
      else if (this.civTaken(game, patch.civId, slot.id)) return { error: "civ already taken" };
      else slot.civId = patch.civId;
    }
    if (patch.color !== undefined) slot.color = patch.color;
    return kicked ? { ok: true, kicked } : { ok: true };
  }

  /** Host evicts the player occupying a seat; the seat stays open. */
  kick(gameId: string, userId: string, slotId: number): { ok: true; kicked: string } | { error: string } {
    const game = this.requireHostLobby(gameId, userId);
    if ("error" in game) return game;
    const slot = game.slots.find((s) => s.id === slotId);
    if (!slot) return { error: "no such slot" };
    if (!slot.userId) return { error: "seat is already empty" };
    if (slot.userId === game.hostUserId) return { error: "the host cannot kick themselves" };
    const kicked = slot.userId;
    slot.userId = undefined;
    slot.handle = undefined;
    slot.civId = undefined;
    return { ok: true, kicked };
  }

  /**
   * A player chooses (or clears, with civId=null) the civ for their own seat.
   * Rejects a civ already claimed by another slot so no two players share one.
   */
  pickCiv(gameId: string, userId: string, civId: string | null): Result {
    const game = this.games.get(gameId);
    if (!game) return { error: "no such game" };
    if (game.status !== "lobby") return { error: "game already started" };
    const slot = game.slots.find((s) => s.userId === userId);
    if (!slot) return { error: "not in this game" };
    if (civId === null) {
      slot.civId = undefined;
      return { ok: true };
    }
    if (this.civTaken(game, civId, slot.id)) return { error: "civ already taken" };
    slot.civId = civId;
    return { ok: true };
  }

  /** A broadcastable snapshot of a game's pre-game roster + config. */
  room(gameId: string): LobbyRoom | undefined {
    const g = this.games.get(gameId);
    if (!g) return undefined;
    return {
      gameId: g.id,
      name: g.name,
      hostUserId: g.hostUserId,
      mapType: g.mapType,
      mapSize: g.mapSize,
      barbarians: g.barbarians,
      naturalWonders: g.naturalWonders,
      startingGold: g.startingGold,
      turnLimit: g.turnLimit,
      hasPassword: !!g.password,
      slots: g.slots.map((s) => ({
        id: s.id,
        kind: s.kind,
        userId: s.userId,
        handle: s.handle,
        civId: s.civId,
        color: s.color,
      })),
    };
  }

  /** Start the match: build the sim state and a GameHost (humans first, then AI). */
  start(gameId: string, userId?: string): Result {
    const game = this.games.get(gameId);
    if (!game) return { error: "no such game" };
    if (userId && game.hostUserId !== userId) return { error: "only the host can start the game" };
    if (game.status === "active") return { ok: true };
    const humans = game.slots.filter((s) => s.kind === "human");
    const ais = game.slots.filter((s) => s.kind === "ai");
    const ordered = [...humans, ...ais];
    ordered.forEach((s, i) => (s.playerId = i));
    const names = ordered.map((s, i) => (s.kind === "human" ? s.handle ?? `Player ${i + 1}` : `AI ${i + 1}`));
    const civIds = ordered.map((s) => s.civId ?? undefined);
    const colors = ordered.map((s) => s.color ?? null);
    const state = createGame({
      seed: game.seed,
      cols: game.cols,
      rows: game.rows,
      mapType: game.mapType,
      playerNames: names,
      playerCount: ordered.length,
      humanSlots: humans.length,
      barbarians: game.barbarians,
      naturalWonders: game.naturalWonders,
      startingGold: game.startingGold,
      turnLimit: game.turnLimit,
      civIds,
      colors,
    });
    game.host = new GameHost(state);
    game.status = "active";
    return { ok: true };
  }

  /** Which slot a user occupies in a game (if any). */
  slotOf(gameId: string, userId: string): Slot | undefined {
    return this.games.get(gameId)?.slots.find((s) => s.userId === userId);
  }

  /** Remove a game from the lobby. Only the host may delete it. */
  delete(gameId: string, hostUserId: string): Result {
    const game = this.games.get(gameId);
    if (!game) return { error: "no such game" };
    if (game.hostUserId !== hostUserId) return { error: "only the host can delete this game" };
    this.games.delete(gameId);
    return { ok: true };
  }

  /** Replace an active game's host with a restored state. */
  restore(gameId: string, state: GameState): Result {
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
      players: g.slots.filter((s) => s.kind === "human" && s.userId).length,
      capacity: g.slots.filter((s) => s.kind === "human").length,
      hostUserId: g.hostUserId,
      hasPassword: !!g.password,
    }));
  }
}
