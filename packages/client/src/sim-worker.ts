/// <reference lib="webworker" />
import { applyCommand, deserializeState, serializeState, type SerializedState } from "@roc/sim";

export type SimWorkerRequest = {
  id: number;
  type: "endTurn";
  state: SerializedState;
};

export type SimWorkerResponse =
  | { id: number; ok: true; state: SerializedState }
  | { id: number; ok: false; error: string };

self.onmessage = (ev: MessageEvent<SimWorkerRequest>): void => {
  const msg = ev.data;
  try {
    const state = deserializeState(msg.state);
    if (msg.type === "endTurn") {
      applyCommand(state, { type: "endTurn" });
      const reply: SimWorkerResponse = { id: msg.id, ok: true, state: serializeState(state) };
      self.postMessage(reply);
      return;
    }
    const reply: SimWorkerResponse = { id: msg.id, ok: false, error: `unknown request: ${msg.type}` };
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
