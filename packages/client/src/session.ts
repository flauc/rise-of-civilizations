// A Session abstracts "the game the client is rendering": either a LOCAL game
// (single-player hotseat — sim runs in the browser) or an ONLINE game (the Bun
// server is authoritative; we render fog-filtered views and send orders).
//
// main.ts talks only to this interface, so the rendering/input code is identical
// for both modes.

import {
  applyCommand,
  beginTurn,
  exploredForPlayer,
  createGame,
  visibleForPlayer,
  deserializeState,
  serializeState,
  applyPlayerViewPatch,
  type BarbarianActivity,
  type AiDifficulty,
  type ClientMessage,
  type Command,
  type GameState,
  type LobbyChatMessage,
  type MapType,
  type Player,
  type PlayerView,
  type PublicLeaderboardEntry,
  type SerializedState,
  type ServerMessage,
  type VictoryKind,
  TOGGLEABLE_VICTORIES,
} from "@roc/sim";
import { filterChatText } from "@roc/shared";
import type { TerrainType, Tile } from "@roc/shared";
import { applyCheat, type CheatAction, type CheatResult } from "./god-mode";
import { SimWorkerClient } from "./sim-worker-client";

export interface Session {
  readonly isOnline: boolean;
  hasState(): boolean;
  getState(): GameState;
  getViewerId(): number;
  getVisible(): Set<string>;
  getExplored(): Set<string>;
  order(cmd: Command): void;
  /** Cheats are only available in single-player local sessions. */
  cheat?(action: CheatAction): CheatResult;
  endTurn(): void;
  /** True while AI/barbarian turns run off-thread (local play only). */
  isResolvingTurn?(): boolean;
  onUpdate(cb: () => void): void;
  awaiting(): number[];
}

// ---- local (single-player hotseat) --------------------------------------

export type { MapType };

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
  /** Landmass layout to generate. Defaults to "random". */
  mapType?: MapType;
  aiCount?: number;
  barbarians?: boolean | BarbarianActivity;
  /** AI opponent difficulty. Defaults to normal. */
  aiDifficulty?: AiDifficulty;
  /** Enable the Legends (heroes) feature. Defaults to on. */
  legends?: boolean;
  /** Scatter natural wonders across the map. Defaults to off. */
  naturalWonders?: boolean;
  /** Tribal village density. Defaults to medium. Legacy boolean: true → medium, false → none. */
  villages?: boolean | import("@roc/sim").VillageDensity;
  /** Starting gold treasury preset. */
  startingGold?: "tight" | "balanced" | "generous";
  /** Turn at which the score victory triggers; 0 = unlimited. Defaults to 120. */
  turnLimit?: number;
  /** How costly research and civics are. Defaults to normal. */
  gameSpeed?: import("@roc/sim").GameSpeed;
  /** Decisive win conditions enabled; omitted = all toggleable ones. */
  enabledVictories?: VictoryKind[];
  /** The human player's civilization. */
  civId?: string;
  /** Civ id per AI opponent; null/undefined = a random unique civ. */
  aiCivIds?: (string | null)[];
  /** Color per player (index 0 = human, then one per AI); null/undefined = auto. */
  colors?: (string | null)[];
  /** Resume from a previously serialized single-player save. */
  savedState?: SerializedState;
  /** Build the map on finishWorldGen() so the loading scroll can appear first. */
  deferWorldGen?: boolean;
}

export class LocalSession implements Session {
  readonly isOnline = false;
  private state: GameState | null = null;
  /** The human's player id — fog/UI always render for them, not whoever's turn it is. */
  private humanPlayerId = 0;
  private cb: () => void = () => {};
  private pendingOpts: LocalGameOptions | null = null;
  private simWorker: SimWorkerClient | null = null;
  private resolvingTurn = false;

  constructor(opts: LocalGameOptions = {}) {
    if (opts.savedState) {
      this.state = deserializeState(opts.savedState);
      this.humanPlayerId =
        this.state.players.find((p) => p.isHuman && !p.isBarbarian)?.id ?? 0;
    } else if (opts.deferWorldGen) {
      this.pendingOpts = opts;
    } else {
      this.state = this.buildGameState(opts);
      this.humanPlayerId =
        this.state.players.find((p) => p.isHuman && !p.isBarbarian)?.id ?? 0;
    }
  }

  /** True while map generation is still queued (loading scroll is showing). */
  needsWorldGen(): boolean {
    return this.pendingOpts != null;
  }

  /** Run procedural world generation (call once after the loading UI is visible). */
  finishWorldGen(): void {
    if (!this.pendingOpts) return;
    const opts = this.pendingOpts;
    this.pendingOpts = null;
    this.state = this.buildGameState(opts);
    this.humanPlayerId =
      this.state.players.find((p) => p.isHuman && !p.isBarbarian)?.id ?? 0;
    this.cb();
  }

  private buildGameState(opts: LocalGameOptions): GameState {
    const dims = MAP_DIMENSIONS[opts.mapSize ?? "medium"];
    const aiCivIds = opts.aiCivIds ?? [];
    const aiCount = Math.max(0, opts.aiCount ?? aiCivIds.length);
    const civIds = [opts.civId, ...aiCivIds.map((c) => c ?? undefined)].slice(0, 1 + aiCount);
    const state = createGame({
      seed: opts.seed ?? "rise",
      cols: dims.cols,
      rows: dims.rows,
      mapType: opts.mapType ?? "random",
      humanSlots: 1,
      playerCount: 1 + aiCount,
      barbarians: opts.barbarians ?? true,
      aiDifficulty: opts.aiDifficulty ?? "normal",
      legends: opts.legends ?? true,
      naturalWonders: opts.naturalWonders ?? true,
      villages: opts.villages ?? "medium",
      startingGold: opts.startingGold ?? "balanced",
      turnLimit: opts.turnLimit ?? 120,
      gameSpeed: opts.gameSpeed ?? "normal",
      enabledVictories: opts.enabledVictories,
      civIds,
      colors: opts.colors ?? undefined,
    });
    beginTurn(state);
    return state;
  }

  hasState(): boolean {
    return this.state != null;
  }
  getState(): GameState {
    if (!this.state) throw new Error("LocalSession: world not generated yet");
    return this.state;
  }
  getViewerId(): number {
    return this.humanPlayerId;
  }
  getVisible(): Set<string> {
    return visibleForPlayer(this.getState(), this.getViewerId());
  }
  getExplored(): Set<string> {
    return exploredForPlayer(this.getState(), this.getViewerId());
  }
  order(cmd: Command): void {
    if (this.resolvingTurn) return;
    applyCommand(this.getState(), cmd);
    this.cb();
  }
  cheat(action: CheatAction): CheatResult {
    if (this.resolvingTurn) return { ok: false, error: "turn resolving" };
    const res = applyCheat(this.getState(), this.getViewerId(), action);
    this.cb();
    return res;
  }
  isResolvingTurn(): boolean {
    return this.resolvingTurn;
  }
  endTurn(): void {
    if (this.resolvingTurn || !this.state) return;
    const needsWorker =
      SimWorkerClient.supported() &&
      this.state.players.some((p) => !p.isHuman && !this.state!.gameOver);
    if (!needsWorker) {
      applyCommand(this.state, { type: "endTurn" });
      this.cb();
      return;
    }
    if (!this.simWorker) this.simWorker = new SimWorkerClient();
    this.resolvingTurn = true;
    this.cb();
    const snapshot = serializeState(this.state);
    void this.simWorker
      .endTurn(snapshot)
      .then((saved) => {
        this.resolvingTurn = false;
        if (!this.state) return;
        this.state = deserializeState(saved);
        this.cb();
      })
      .catch((err) => {
        console.error("sim worker endTurn failed, falling back to main thread:", err);
        this.resolvingTurn = false;
        if (!this.state) return;
        applyCommand(this.state, { type: "endTurn" });
        this.cb();
      });
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
    if (t.naturalWonder) tile.naturalWonder = t.naturalWonder;
    if (t.wonder) tile.wonder = t.wonder;
    if (t.river) tile.river = t.river;
    if (t.riverLake) tile.riverLake = true;
    if (t.wooded) tile.wooded = true;
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
    globalMorale: p.id === view.yourId ? view.you.globalMorale : 50,
    upkeepModifierPct: p.id === view.yourId ? (view.you.upkeepModifierPct ?? 0) : 0,
    moraleLog: p.id === view.yourId ? (view.you.moraleLog ?? []).map((e) => ({ ...e })) : [],
    researched: new Set(p.id === view.yourId ? view.you.researched : []),
    researching: p.id === view.yourId ? view.you.researching : null,
    researchQueue: p.id === view.yourId ? view.you.researchQueue : [],
    scienceProgress: p.id === view.yourId ? view.you.scienceProgress : 0,
    governmentsResearched: new Set(p.id === view.yourId ? view.you.governmentsResearched : ["chiefdom"]),
    researchingGovernment: p.id === view.yourId ? view.you.researchingGovernment : null,
    civicsAdopted: new Set(p.id === view.yourId ? view.you.civicsAdopted : []),
    slottedCivics: p.id === view.yourId ? [...view.you.slottedCivics] : [],
    unrestTurns: p.id === view.yourId ? view.you.unrestTurns : 0,
    governmentChangedTurn: p.id === view.yourId ? view.you.governmentChangedTurn : -Infinity,
    cultureProgress: p.id === view.yourId ? view.you.cultureProgress : 0,
    government: p.id === view.yourId ? view.you.government : "chiefdom",
    faith: p.id === view.yourId ? view.you.faith : 0,
    foundedReligionId: p.id === view.yourId ? view.you.foundedReligionId : undefined,
    explored: p.id === view.yourId ? explored : new Set<string>(),
    resources: p.id === view.yourId ? { ...view.you.resources } : {},
    bribesPaid: p.id === view.yourId ? (view.you.bribesPaid ?? 0) : 0,
    leaderAbilityLastUsedTurn: p.id === view.yourId ? (view.you.leaderAbilityLastUsedTurn ?? -Infinity) : -Infinity,
    modifiers: [],
    greatPeoplePoints: p.id === view.yourId ? { ...(view.you.greatPeoplePoints ?? {}) } : {},
    greatPeopleEarned: p.id === view.yourId ? { ...(view.you.greatPeopleEarned ?? {}) } : {},
    greatPeople: p.id === view.yourId ? [...(view.you.greatPeople ?? [])] : [],
    legendsRecruited: p.id === view.yourId ? (view.you.legendsRecruited ?? 0) : 0,
  }));

  const state: GameState = {
    map: { cols: view.cols, rows: view.rows, tiles, poleAxis: view.poleAxis },
    players,
    units: new Map(view.units.map((u) => [u.id, u])),
    cities: new Map(view.cities.map((c) => [c.id, c])),
    turn: view.turn,
    currentPlayerIndex: Math.max(0, players.findIndex((p) => p.id === view.yourId)),
    nextEntityId: 1,
    log: view.log,
    gameOver: view.gameOver,
    turnLimit: view.turnLimit ?? 0,
    gameSpeed: view.gameSpeed ?? "normal",
    enabledVictories: new Set(view.enabledVictories ?? TOGGLEABLE_VICTORIES),
    religions: view.religions,
    tradeRoutes: view.tradeRoutes ?? [],
    works: view.works ?? [],
    roadRoutes: view.roadRoutes ?? [],
    completedWonders: view.completedWonders ?? [],
    recruitedGreatPeople: view.recruitedGreatPeople ?? [],
    legendsEnabled: view.legendsEnabled ?? true,
    recruitedLegends: view.recruitedLegends ?? [],
    naturalWonderIds: view.naturalWonderIds ?? [],
    discoveredWonders: view.discoveredWonders ?? {},
    allNaturalWondersClaimedBy: view.allNaturalWondersClaimedBy,
    relations: dip?.relations ?? [],
    attitudes: (dip?.attitudeToYou ?? []).map((a) => ({
      from: a.from,
      to: view.yourId,
      // Real reasons so the UI can show the breakdown; sum (minus reputation)
      // reconstructs the same score the server computed.
      modifiers: a.modifiers.map((m) => ({ reason: m.reason, value: m.value })),
    })),
    reputation: dip?.reputation ?? {},
    contactQueue: dip?.contacts ?? [],
    diploProposals: dip?.proposals ?? [],
    tradeHistory: dip?.tradeHistory ?? [],
    barbarianActivity: view.barbarianActivity ?? "normal",
    aiDifficulty: view.aiDifficulty ?? "normal",
    turnUpdates: view.turnUpdates ?? [],
    nextTurnUpdateId: 1,
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
  private leaderboardResolve: ((entries: PublicLeaderboardEntry[]) => void) | null = null;
  private leaderboardReject: ((reason: string) => void) | null = null;
  private leaderboardTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  /** Server game id; set when joining/creating a lobby room. */
  gameId?: string;
  private chatMessages: LobbyChatMessage[] = [];
  private pendingChat: LobbyChatMessage | null = null;
  private chatHandle = "You";
  private chatUserId = "";
  private chatHandlers = new Set<(messages: readonly LobbyChatMessage[]) => void>();
  private lastView: PlayerView | null = null;
  private lastSeq = 0;

  constructor(private readonly url: string) {}

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.url);
      this.ws = ws;
      let opened = false;
      let settled = false;
      const finish = (ok: boolean, err?: Error): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (ok) resolve();
        else reject(err ?? new Error("connection failed"));
      };
      const timer = setTimeout(
        () => finish(false, new Error(`Could not reach ${this.url}. Run: bun run server, then adb reverse tcp:3001 tcp:3001`)),
        12_000,
      );
      ws.onopen = () => {
        opened = true;
        this.send({ t: "setFeatures", deltas: true });
        this.pingTimer = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ t: "ping" }));
        }, 45_000);
        finish(true);
      };
      ws.onerror = () => finish(false, new Error("connection failed"));
      ws.onclose = () => {
        if (this.pingTimer) {
          clearInterval(this.pingTimer);
          this.pingTimer = null;
        }
        if (!opened) finish(false, new Error("connection closed"));
      };
      ws.onmessage = (e) => this.onMessage(JSON.parse(String(e.data)) as ServerMessage);
    });
  }

  isOpen(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  private applyServerView(view: PlayerView, awaiting: number[]): void {
    const { state, visible } = reconstruct(view);
    this.state = state;
    this.visible = visible;
    this.viewerId = view.yourId;
    this.awaitingIds = awaiting;
    this.cb();
  }

  private onMessage(msg: ServerMessage): void {
    if (msg.t === "state") {
      this.lastView = msg.view;
      this.lastSeq = msg.seq ?? 0;
      this.applyServerView(msg.view, msg.awaiting);
    } else if (msg.t === "statePatch") {
      if (!this.lastView || msg.baseSeq !== this.lastSeq) {
        this.send({ t: "resyncState" });
        return;
      }
      this.lastView = applyPlayerViewPatch(this.lastView, msg.patch);
      this.lastSeq = msg.seq;
      this.applyServerView(this.lastView, msg.awaiting ?? this.awaitingIds);
    } else if (msg.t === "exported") {
      this.exportResolve?.(msg.blob);
      this.exportResolve = null;
      this.exportReject = null;
    } else if (msg.t === "leaderboard") {
      if (this.leaderboardTimer) {
        clearTimeout(this.leaderboardTimer);
        this.leaderboardTimer = null;
      }
      this.leaderboardResolve?.(msg.entries);
      this.leaderboardResolve = null;
      this.leaderboardReject = null;
    } else if (msg.t === "loaded") {
      this.loadResolve?.();
      this.loadResolve = null;
      this.loadReject = null;
    } else if (msg.t === "joined") {
      this.gameId = msg.gameId;
      this.chatMessages = [];
      this.pendingChat = null;
    } else if (msg.t === "lobbyChatHistory") {
      if (!this.gameId) this.gameId = msg.gameId;
      if (msg.gameId === this.gameId) {
        this.chatMessages = msg.messages;
        this.emitChat();
      }
    } else if (msg.t === "lobbyChat") {
      if (!this.gameId) this.gameId = msg.gameId;
      if (msg.gameId === this.gameId) {
        this.chatMessages.push(msg.message);
        while (this.chatMessages.length > 100) this.chatMessages.shift();
        if (this.pendingChat && this.isOurChatMessage(msg.message)) this.pendingChat = null;
        this.emitChat();
      }
    } else if (msg.t === "deleted" || msg.t === "kicked") {
      if (this.gameId === msg.gameId) {
        this.gameId = undefined;
        this.chatMessages = [];
        this.emitChat();
      }
    } else if (msg.t === "error") {
      this.pendingChat = null;
      this.emitChat();
      this.exportReject?.(msg.message);
      this.exportResolve = null;
      this.exportReject = null;
      this.loadReject?.(msg.message);
      this.loadResolve = null;
      this.loadReject = null;
      this.leaderboardReject?.(msg.message);
      this.leaderboardResolve = null;
      this.leaderboardReject = null;
      if (this.leaderboardTimer) {
        clearTimeout(this.leaderboardTimer);
        this.leaderboardTimer = null;
      }
    }
    for (const h of this.handlers) h(msg);
  }

  /** Subscribe to raw server messages (lobby phase). */
  on(handler: (m: ServerEvent) => void): void {
    this.handlers.add(handler);
  }

  /** Subscribe to lobby/in-game chat updates. Returns an unsubscribe function. */
  onChat(handler: (messages: readonly LobbyChatMessage[]) => void): () => void {
    this.chatHandlers.add(handler);
    handler(this.displayChatMessages());
    return () => this.chatHandlers.delete(handler);
  }

  getChatMessages(): readonly LobbyChatMessage[] {
    return this.chatMessages;
  }

  /** Messages for the UI, including an unsent line while waiting for the server. */
  displayChatMessages(): readonly LobbyChatMessage[] {
    return this.pendingChat ? [...this.chatMessages, this.pendingChat] : this.chatMessages;
  }

  setChatHandle(handle: string): void {
    this.chatHandle = handle.trim() || "You";
  }

  setChatUserId(userId: string): void {
    this.chatUserId = userId;
  }

  private isOurChatMessage(message: LobbyChatMessage): boolean {
    if (this.chatUserId && message.userId === this.chatUserId) return true;
    return message.handle === this.chatHandle;
  }

  sendChat(text: string): void {
    if (!this.gameId) return;
    const trimmed = text.trim();
    if (!trimmed) return;
    this.pendingChat = {
      userId: this.chatUserId,
      handle: this.chatHandle,
      text: filterChatText(trimmed),
      at: Date.now(),
    };
    this.emitChat();
    this.send({ t: "lobbyChat", gameId: this.gameId, text: trimmed });
  }

  private emitChat(): void {
    const messages = this.displayChatMessages();
    for (const h of this.chatHandlers) h(messages);
  }

  send(msg: ClientMessage): void {
    this.ws?.send(JSON.stringify(msg));
  }

  /** Close the socket and drop lobby handlers (e.g. on logout or account switch). */
  disconnect(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    if (this.ws) {
      this.ws.onmessage = null;
      this.ws.onclose = null;
      this.ws.onerror = null;
      try {
        this.ws.close();
      } catch {
        /* ignore */
      }
      this.ws = null;
    }
    this.handlers.clear();
    this.chatHandlers.clear();
    this.gameId = undefined;
    this.chatMessages = [];
    this.pendingChat = null;
    this.state = null;
    this.lastView = null;
    this.lastSeq = 0;
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
  getExplored(): Set<string> {
    if (!this.state) return new Set();
    return this.state.players.find((p) => p.id === this.viewerId)?.explored ?? new Set();
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

  /** Top scores from completed games on this server. */
  requestLeaderboard(limit = 25): Promise<PublicLeaderboardEntry[]> {
    return new Promise((resolve, reject) => {
      if (!this.isOpen()) {
        reject(new Error("not connected"));
        return;
      }
      this.leaderboardResolve = resolve;
      this.leaderboardReject = reject;
      this.leaderboardTimer = setTimeout(() => {
        this.leaderboardTimer = null;
        this.leaderboardResolve = null;
        this.leaderboardReject = null;
        reject(new Error("leaderboard timeout"));
      }, 8_000);
      this.send({ t: "getLeaderboard", limit });
    });
  }
}
