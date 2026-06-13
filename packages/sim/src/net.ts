// Wire protocol for client <-> server (M3). JSON over WebSocket. Lives in `sim`
// because order messages carry the sim `Command` type. Both the browser client
// and the Bun server import these.

import type { Command } from "./game/commands";
import type { PlayerView } from "./game/serialize";

export interface GameSummary {
  id: string;
  name: string;
  status: "lobby" | "active";
  players: number; // filled human slots
  capacity: number;
}

export type ClientMessage =
  | { t: "register"; handle: string; password: string }
  | { t: "login"; handle: string; password: string }
  | { t: "resume"; token: string }
  | { t: "listGames" }
  | { t: "createGame"; name: string; seed?: string; cols?: number; rows?: number; aiCount?: number }
  | { t: "joinGame"; gameId: string }
  | { t: "startGame"; gameId: string }
  | { t: "order"; cmd: Command }
  | { t: "ready" }; // end-of-turn: ready for simultaneous resolution

export type ServerMessage =
  | { t: "authOk"; token: string; userId: string; handle: string }
  | { t: "error"; message: string }
  | { t: "games"; games: GameSummary[] }
  | { t: "joined"; gameId: string; slot: number; playerId: number }
  | { t: "started"; gameId: string }
  | { t: "state"; view: PlayerView; awaiting: number[] }
  | { t: "orderRejected"; reason: string };
