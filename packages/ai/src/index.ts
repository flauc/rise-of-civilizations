// AI opponents. Everything here runs ON THE USER'S MACHINE — no network calls,
// no external API. The default is a fast rules/utility controller (implemented
// in @roc/sim so the engine can drive it without a dependency cycle).
//
// On-device learned models later: implement `AiController` with a small policy
// network run via ONNX Runtime Web or TensorFlow.js inside a Web Worker (still
// fully local, no API). The engine only needs `takeTurn`, so it's a drop-in.

import { aiTakeTurn, type GameState } from "@roc/sim";

export interface AiController {
  /** Play a full turn for `playerId`, emitting orders into `state`. */
  takeTurn(state: GameState, playerId: number): void | Promise<void>;
}

/** The default rules-based controller (zero dependencies, instant, offline). */
export class HeuristicAi implements AiController {
  takeTurn(state: GameState, playerId: number): void {
    aiTakeTurn(state, playerId);
  }
}

export const defaultAi: AiController = new HeuristicAi();
