// Wire protocol for client <-> server (M3). JSON over WebSocket. Lives in `sim`
// because order messages carry the sim `Command` type. Both the browser client
// and the Bun server import these.

import type { Command } from "./game/commands";
import type { BarbarianActivity } from "./game/state";
import type { PlayerView } from "./game/serialize";

export interface GameSummary {
  id: string;
  name: string;
  status: "lobby" | "active";
  players: number; // filled human slots
  capacity: number;
  hostUserId: string;
}

export type ClientMessage =
  | { t: "register"; handle: string; password: string }
  | { t: "login"; handle: string; password: string }
  | { t: "resume"; token: string }
  | { t: "listGames" }
  | { t: "createGame"; name: string; seed?: string; cols?: number; rows?: number; capacity?: number; aiCount?: number; barbarians?: BarbarianActivity }
  | { t: "joinGame"; gameId: string }
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
  | { t: "started"; gameId: string }
  | { t: "state"; view: PlayerView; awaiting: number[] }
  | { t: "orderRejected"; reason: string }
  | { t: "exported"; blob: string } // full SerializedState JSON blob, sent only to host
  | { t: "loaded"; gameId: string } // confirms the server restored the uploaded save
  | { t: "deleted"; gameId: string }; // the game was removed by the host
