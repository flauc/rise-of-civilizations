// A Session abstracts "the game the client is rendering": either a LOCAL game
// (single-player hotseat — sim runs in the browser) or an ONLINE game (the Bun
// server is authoritative; we render fog-filtered views and send orders).
//
// main.ts talks only to this interface, so the rendering/input code is identical
// for both modes.

import {
  applyCommand,
  beginTurn,
  computeVisible,
  createGame,
  currentPlayer,
  deserializeState,
  type BarbarianActivity,
  type ClientMessage,
  type Command,
  type GameState,
  type Player,
  type PlayerView,
  type SerializedState,
  type ServerMessage,
} from "@roc/sim";
import type { TerrainType, Tile } from "@roc/shared";
import { applyCheat, type CheatAction, type CheatResult } from "./god-mode";

export interface Session {
  readonly isOnline: boolean;
  hasState(): boolean;
  getState(): GameState;
  getViewerId(): number;
  getVisible(): Set<string>;
  order(cmd: Command): void;
  /** Cheats are only available in single-player local sessions. */
  cheat?(action: CheatAction): CheatResult;
  endTurn(): void;
  onUpdate(cb: () => void): void;
  awaiting(): number[];
}

// ---- local (single-player hotseat) --------------------------------------

export type MapSize = "small" | "medium" | "large" | "huge" | "giant";

export const MAP_DIMENSIONS: Record<MapSize, { cols: number; rows: number }> = {
  small: { cols: 36, rows: 24 },
  medium: { cols: 52, rows: 34 },
  large: { cols: 68, rows: 44 },
  huge: { cols: 84, rows: 56 },
  giant: { cols: 100, rows: 68 },
};

export interface LocalGameOptions {
  seed?: string;
  mapSize?: MapSize;
  aiCount?: number;
  barbarians?: boolean | BarbarianActivity;
  /** Starting gold treasury preset. */
  startingGold?: "tight" | "balanced" | "generous";
  /** The human player's civilization. */
  civId?: string;
  /** Civ id per AI opponent; null/undefined = a random unique civ. */
  aiCivIds?: (string | null)[];
  /** Color per player (index 0 = human, then one per AI); null/undefined = auto. */
  colors?: (string | null)[];
  /** Resume from a previously serialized single-player save. */
  savedState?: SerializedState;
}

export class LocalSession implements Session {
  readonly isOnline = false;
  private state: GameState;
  private cb: () => void = () => {};

  constructor(opts: LocalGameOptions = {}) {
    if (opts.savedState) {
      this.state = deserializeState(opts.savedState);
    } else {
      const dims = MAP_DIMENSIONS[opts.mapSize ?? "medium"];
      const aiCivIds = opts.aiCivIds ?? [];
      const aiCount = Math.max(0, opts.aiCount ?? aiCivIds.length);
      // Civ ids align to slots: the human first, then each AI (undefined = random).
      const civIds = [opts.civId, ...aiCivIds.map((c) => c ?? undefined)].slice(0, 1 + aiCount);
      // Single-player = 1 human vs N AI civs (+ optional barbarians).
      this.state = createGame({
        seed: opts.seed ?? "rise",
        cols: dims.cols,
        rows: dims.rows,
        humanSlots: 1,
        playerCount: 1 + aiCount,
        barbarians: opts.barbarians ?? true,
        startingGold: opts.startingGold ?? "balanced",
        civIds,
        colors: opts.colors ?? undefined,
      });
      beginTurn(this.state);
    }
  }
  hasState(): boolean {
    return true;
  }
  getState(): GameState {
    return this.state;
  }
  getViewerId(): number {
    return currentPlayer(this.state).id;
  }
  getVisible(): Set<string> {
    return computeVisible(this.state, this.getViewerId());
  }
  order(cmd: Command): void {
    applyCommand(this.state, cmd);
    this.cb();
  }
  cheat(action: CheatAction): CheatResult {
    const res = applyCheat(this.state, this.getViewerId(), action);
    this.cb();
    return res;
  }
  endTurn(): void {
    applyCommand(this.state, { type: "endTurn" });
    this.cb();
  }
  onUpdate(cb: () => void): void {
    this.cb = cb;
  }
  awaiting(): number[] {
    return [];
  }
}

// ---- online (server-authoritative) --------------------------------------

/** Rebuild a renderable GameState from a fog-filtered server view. */
function reconstruct(view: PlayerView): { state: GameState; visible: Set<string> } {
  const tiles: Tile[] = new Array(view.cols * view.rows);
  for (let row = 0; row < view.rows; row++) {
    for (let col = 0; col < view.cols; col++) {
      tiles[row * view.cols + col] = { col, row, terrain: "ocean" }; // hidden; fog covers it
    }
  }
  const explored = new Set<string>();
  for (const t of view.tiles) {
    const tile: Tile = { col: t.col, row: t.row, terrain: t.terrain as TerrainType };
    if (t.improvement) tile.improvement = t.improvement;
    if (t.road) tile.road = true;
    if (t.ownerCityId !== undefined) tile.ownerCityId = t.ownerCityId;
    if (t.feature) tile.feature = t.feature;
    if (t.resource) tile.resource = t.resource;
    tiles[t.row * view.cols + t.col] = tile;
    explored.add(`${t.col},${t.row}`);
  }

  // Diplomacy: the viewer's atWar set is derived from the relations it can see.
  const dip = view.diplomacy;
  const atWarOf = (pid: number): number[] => {
    const out: number[] = [];
    for (const r of dip?.relations ?? []) {
      if (r.status !== "war") continue;
      if (r.a === pid) out.push(r.b);
      else if (r.b === pid) out.push(r.a);
    }
    return out;
  };

  const players: Player[] = view.players.map((p) => ({
    id: p.id,
    name: p.name,
    color: p.color,
    isHuman: p.isHuman,
    isBarbarian: p.isBarbarian,
    civId: p.civId,
    met: p.id === view.yourId ? [...(dip?.met ?? [])] : [],
    atWar: atWarOf(p.id),
    importedLuxuries: [],
    gold: p.id === view.yourId ? view.you.gold : 0,
    researched: new Set(p.id === view.yourId ? view.you.researched : []),
    researching: p.id === view.yourId ? view.you.researching : null,
    scienceProgress: p.id === view.yourId ? view.you.scienceProgress : 0,
    civicsResearched: new Set(p.id === view.yourId ? view.you.civicsResearched : []),
    researchingCivic: p.id === view.yourId ? view.you.researchingCivic : null,
    cultureProgress: p.id === view.yourId ? view.you.cultureProgress : 0,
    government: p.id === view.yourId ? view.you.government : "chiefdom",
    policies: p.id === view.yourId ? [...view.you.policies] : [],
    faith: p.id === view.yourId ? view.you.faith : 0,
    foundedReligionId: p.id === view.yourId ? view.you.foundedReligionId : undefined,
    explored: p.id === view.yourId ? explored : new Set<string>(),
    resources: p.id === view.yourId ? { ...view.you.resources } : {},
    bribesPaid: p.id === view.yourId ? (view.you.bribesPaid ?? 0) : 0,
    leaderAbilityLastUsedTurn: p.id === view.yourId ? (view.you.leaderAbilityLastUsedTurn ?? -Infinity) : -Infinity,
    modifiers: [],
  }));

  const state: GameState = {
    map: { cols: view.cols, rows: view.rows, tiles },
    players,
    units: new Map(view.units.map((u) => [u.id, u])),
    cities: new Map(view.cities.map((c) => [c.id, c])),
    turn: view.turn,
    currentPlayerIndex: Math.max(0, players.findIndex((p) => p.id === view.yourId)),
    nextEntityId: 1,
    log: view.log,
    gameOver: view.gameOver,
    turnLimit: 0,
    religions: view.religions,
    tradeRoutes: view.tradeRoutes ?? [],
    works: view.works ?? [],
    completedWonders: view.completedWonders ?? [],
    relations: dip?.relations ?? [],
    attitudes: (dip?.attitudeToYou ?? []).map((a) => ({
      from: a.from,
      to: view.yourId,
      modifiers: [{ reason: "opinion", value: a.score }],
    })),
    reputation: dip?.reputation ?? {},
    contactQueue: dip?.contacts ?? [],
    diploProposals: dip?.proposals ?? [],
    barbarianActivity: view.barbarianActivity ?? "normal",
    barbarianBribes: (view.you.barbarianBribes ?? []).map((b) => ({
      campKey: b.campKey,
      playerId: view.yourId,
      untilTurn: b.untilTurn,
    })),
  };
  return { state, visible: new Set(view.visible) };
}

export type ServerEvent = ServerMessage;

/** Owns the WebSocket. Used for lobby ops, then as the in-game Session. */
export class OnlineSession implements Session {
  readonly isOnline = true;
  private ws: WebSocket | null = null;
  private state: GameState | null = null;
  private visible = new Set<string>();
  private viewerId = 0;
  private awaitingIds: number[] = [];
  private cb: () => void = () => {};
  private handlers = new Set<(m: ServerEvent) => void>();
  private exportResolve: ((blob: string) => void) | null = null;
  private exportReject: ((reason: string) => void) | null = null;
  private loadResolve: (() => void) | null = null;
  private loadReject: ((reason: string) => void) | null = null;
  /** Server game id; set by lobby-ui when the game starts. */
  gameId?: string;

  constructor(private readonly url: string) {}

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.url);
      this.ws = ws;
      ws.onopen = () => resolve();
      ws.onerror = () => reject(new Error("connection failed"));
      ws.onmessage = (e) => this.onMessage(JSON.parse(String(e.data)) as ServerMessage);
    });
  }

  private onMessage(msg: ServerMessage): void {
    if (msg.t === "state") {
      const { state, visible } = reconstruct(msg.view);
      this.state = state;
      this.visible = visible;
      this.viewerId = msg.view.yourId;
      this.awaitingIds = msg.awaiting;
      this.cb();
    } else if (msg.t === "exported") {
      this.exportResolve?.(msg.blob);
      this.exportResolve = null;
      this.exportReject = null;
    } else if (msg.t === "loaded") {
      this.loadResolve?.();
      this.loadResolve = null;
      this.loadReject = null;
    } else if (msg.t === "error") {
      this.exportReject?.(msg.message);
      this.exportResolve = null;
      this.exportReject = null;
      this.loadReject?.(msg.message);
      this.loadResolve = null;
      this.loadReject = null;
    }
    for (const h of this.handlers) h(msg);
  }

  /** Subscribe to raw server messages (lobby phase). */
  on(handler: (m: ServerEvent) => void): void {
    this.handlers.add(handler);
  }

  send(msg: ClientMessage): void {
    this.ws?.send(JSON.stringify(msg));
  }

  hasState(): boolean {
    return this.state !== null;
  }

  getState(): GameState {
    if (!this.state) throw new Error("no state yet");
    return this.state;
  }
  getViewerId(): number {
    return this.viewerId;
  }
  getVisible(): Set<string> {
    return this.visible;
  }
  order(cmd: Command): void {
    this.send({ t: "order", cmd });
  }
  endTurn(): void {
    this.send({ t: "ready" });
  }
  onUpdate(cb: () => void): void {
    this.cb = cb;
  }
  awaiting(): number[] {
    return this.awaitingIds;
  }

  /** Ask the server to export the full authoritative state. Host only. */
  requestExport(): Promise<string> {
    return new Promise((resolve, reject) => {
      this.exportResolve = resolve;
      this.exportReject = reject;
      this.send({ t: "exportState" });
    });
  }

  /** Upload a full save blob to restore the server game. Host only. */
  loadGame(blob: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.loadResolve = resolve;
      this.loadReject = reject;
      this.send({ t: "loadGame", blob });
    });
  }
}
