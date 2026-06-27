// Wire protocol for client <-> server (M3). JSON over WebSocket. Lives in `sim`
// because order messages carry the sim `Command` type. Both the browser client
// and the Bun server import these.

import type { Command } from "./game/commands";
import type { BarbarianActivity } from "./game/state";
import type { PlayerView } from "./game/serialize";
import type { MapType } from "./worldgen";

export interface GameSummary {
  id: string;
  name: string;
  status: "lobby" | "active";
  players: number; // filled human slots
  capacity: number; // total human slots
  hostUserId: string;
  /** Whether a password is required to join. */
  hasPassword: boolean;
}

export type SlotKind = "human" | "ai";

/** One player slot (human seat or AI opponent) in a pre-game lobby room. */
export interface LobbySlot {
  /** Stable slot id (independent of position). */
  id: number;
  kind: SlotKind;
  /** Set once a user occupies a human seat; absent = open. */
  userId?: string;
  handle?: string;
  /** Chosen civ (human pick or AI assignment); absent = random at start. */
  civId?: string;
  /** Player color. */
  color?: string;
}

/** Live, broadcast view of a single game's lobby (roster + config). */
export interface LobbyRoom {
  gameId: string;
  name: string;
  hostUserId: string;
  mapType: MapType;
  mapSize?: string;
  barbarians: BarbarianActivity;
  naturalWonders: boolean;
  startingGold: "tight" | "balanced" | "generous";
  /** Turn at which the score victory triggers; 0 = unlimited. */
  turnLimit: number;
  hasPassword: boolean;
  slots: LobbySlot[];
}

export type ClientMessage =
  | { t: "register"; handle: string; password: string }
  | { t: "login"; handle: string; password: string }
  | { t: "resume"; token: string }
  | { t: "listGames" }
  | {
      t: "createGame";
      name: string;
      seed?: string;
      cols?: number;
      rows?: number;
      capacity?: number;
      aiCount?: number;
      barbarians?: BarbarianActivity;
      /** Scatter natural wonders across the map. Defaults to off. */
      naturalWonders?: boolean;
      /** Landmass layout to generate (one big continent, archipelago, real world…). */
      mapType?: MapType;
      /** Starting gold treasury preset for major civ players. */
      startingGold?: "tight" | "balanced" | "generous";
      /** Turn at which the score victory triggers; 0 = unlimited. Defaults to 120. */
      turnLimit?: number;
      /** Civ id per AI opponent; null/undefined = a random unique civ. */
      aiCivIds?: (string | null)[];
      /** Color per player slot (humans first, then AI); null/undefined = auto. */
      colors?: (string | null)[];
      /** Human-readable map size label, kept for the lobby editor. */
      mapSize?: string;
      /** Optional join password. */
      password?: string;
    }
  | { t: "joinGame"; gameId: string; password?: string }
  | { t: "pickCiv"; gameId: string; civId: string | null } // choose your lobby civ; null = random
  // --- host-only lobby management (game must be in the "lobby" state) ---
  | {
      t: "configureGame";
      gameId: string;
      name?: string;
      /** Empty string clears the password. */
      password?: string;
      cols?: number;
      rows?: number;
      mapSize?: string;
      mapType?: MapType;
      barbarians?: BarbarianActivity;
      naturalWonders?: boolean;
      startingGold?: "tight" | "balanced" | "generous";
      /** Turn at which the score victory triggers; 0 = unlimited. */
      turnLimit?: number;
    }
  | { t: "addSlot"; gameId: string; kind: "human" | "ai" }
  | { t: "removeSlot"; gameId: string; slotId: number }
  | { t: "updateSlot"; gameId: string; slotId: number; kind?: "human" | "ai"; civId?: string | null; color?: string }
  | { t: "kickSlot"; gameId: string; slotId: number }
  | { t: "startGame"; gameId: string }
  | { t: "order"; cmd: Command }
  | { t: "ready" } // end-of-turn: ready for simultaneous resolution
  | { t: "exportState" } // host requests the full authoritative state for saving
  | { t: "loadGame"; blob: string } // host uploads a full SerializedState blob to restore
  | { t: "deleteGame"; gameId: string }; // host removes a game from the lobby

export type ServerMessage =
  | { t: "authOk"; token: string; userId: string; handle: string }
  | { t: "error"; message: string }
  | { t: "games"; games: GameSummary[] }
  | { t: "joined"; gameId: string; slotId: number }
  | { t: "lobby"; room: LobbyRoom } // live pre-game roster (seats + chosen civs)
  | { t: "kicked"; gameId: string } // the host removed you from the game
  | { t: "started"; gameId: string }
  | { t: "state"; view: PlayerView; awaiting: number[] }
  | { t: "orderRejected"; reason: string }
  | { t: "exported"; blob: string } // full SerializedState JSON blob, sent only to host
  | { t: "loaded"; gameId: string } // confirms the server restored the uploaded save
  | { t: "deleted"; gameId: string }; // the game was removed by the host
