import type { NewGameOptions, SerializedState } from "@roc/sim";
import type { SimWorkerRequest, SimWorkerResponse } from "./sim-worker";

type Pending = {
  resolve: (state: SerializedState) => void;
  reject: (err: Error) => void;
};

/** Runs heavy sim work off the main thread (local single-player end turn,
 *  speculative world generation while the menu is open). */
export class SimWorkerClient {
  private worker: Worker | null = null;
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();

  static supported(): boolean {
    return typeof Worker !== "undefined";
  }

  endTurn(state: SerializedState): Promise<SerializedState> {
    return this.request((id) => ({ id, type: "endTurn", state }));
  }

  createGame(opts: NewGameOptions): Promise<SerializedState> {
    return this.request((id) => ({ id, type: "createGame", opts }));
  }

  private request(build: (id: number) => SimWorkerRequest): Promise<SerializedState> {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      this.pending.set(id, { resolve, reject });
      try {
        this.workerForRequest().postMessage(build(id));
      } catch (err) {
        this.pending.delete(id);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  terminate(): void {
    this.worker?.terminate();
    this.worker = null;
    for (const p of this.pending.values()) p.reject(new Error("sim worker terminated"));
    this.pending.clear();
  }

  private workerForRequest(): Worker {
    if (!this.worker) {
      this.worker = new Worker(new URL("./sim-worker.ts", import.meta.url), { type: "module" });
      this.worker.onmessage = (ev: MessageEvent<SimWorkerResponse>) => {
        const msg = ev.data;
        const p = this.pending.get(msg.id);
        if (!p) return;
        this.pending.delete(msg.id);
        if (msg.ok) p.resolve(msg.state);
        else p.reject(new Error(msg.error));
      };
      this.worker.onerror = (ev) => {
        const err = new Error(ev.message || "sim worker error");
        for (const p of this.pending.values()) p.reject(err);
        this.pending.clear();
        this.worker?.terminate();
        this.worker = null;
      };
    }
    return this.worker;
  }
}
