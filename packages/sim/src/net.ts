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
  capacity: number;
  hostUserId: string;
}

/** One human player slot in a pre-game lobby room. */
export interface LobbySlot {
  slot: number;
  playerId: number;
  /** Set once a user occupies the slot; absent = open. */
  userId?: string;
  handle?: string;
  /** The civ this player chose; absent = a random unique civ at start. */
  civId?: string;
}

/** Live, broadcast view of a single game's lobby (who's seated + their civ). */
export interface LobbyRoom {
  gameId: string;
  hostUserId: string;
  capacity: number;
  slots: LobbySlot[];
  /** Civ id per AI opponent; null = a random unique civ. */
  aiCivIds: (string | null)[];
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
      /** Civ id per AI opponent; null/undefined = a random unique civ. */
      aiCivIds?: (string | null)[];
      /** Color per player slot (humans first, then AI); null/undefined = auto. */
      colors?: (string | null)[];
    }
  | { t: "joinGame"; gameId: string }
  | { t: "pickCiv"; gameId: string; civId: string | null } // choose your lobby civ; null = random
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
  | { t: "joined"; gameId: string; slot: number; playerId: number }
  | { t: "lobby"; room: LobbyRoom } // live pre-game roster (seats + chosen civs)
  | { t: "started"; gameId: string }
  | { t: "state"; view: PlayerView; awaiting: number[] }
  | { t: "orderRejected"; reason: string }
  | { t: "exported"; blob: string } // full SerializedState JSON blob, sent only to host
  | { t: "loaded"; gameId: string } // confirms the server restored the uploaded save
  | { t: "deleted"; gameId: string }; // the game was removed by the host
