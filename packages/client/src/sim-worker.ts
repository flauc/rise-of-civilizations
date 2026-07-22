/// <reference lib="webworker" />
import {
  applyCommand,
  beginTurn,
  createGame,
  deserializeState,
  serializeState,
  type NewGameOptions,
  type SerializedState,
} from "@roc/sim";

export type SimWorkerRequest =
  | { id: number; type: "endTurn"; state: SerializedState }
  | { id: number; type: "createGame"; opts: NewGameOptions };

export type SimWorkerResponse =
  | { id: number; ok: true; state: SerializedState }
  | { id: number; ok: false; error: string };

self.onmessage = (ev: MessageEvent<SimWorkerRequest>): void => {
  const msg = ev.data;
  try {
    if (msg.type === "endTurn") {
      const state = deserializeState(msg.state);
      applyCommand(state, { type: "endTurn" });
      const reply: SimWorkerResponse = { id: msg.id, ok: true, state: serializeState(state) };
      self.postMessage(reply);
      return;
    }
    if (msg.type === "createGame") {
      const state = createGame(msg.opts);
      beginTurn(state);
      const reply: SimWorkerResponse = { id: msg.id, ok: true, state: serializeState(state) };
      self.postMessage(reply);
      return;
    }
    const reply: SimWorkerResponse = {
      id: (msg as { id: number }).id,
      ok: false,
      error: `unknown request: ${(msg as { type: string }).type}`,
    };
    self.postMessage(reply);
  } catch (err) {
    const reply: SimWorkerResponse = {
      id: msg.id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
    self.postMessage(reply);
  }
};
