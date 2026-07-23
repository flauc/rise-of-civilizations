// Speculative single-player world generation while the player is still in the
// menu. The lobby calls updateWorldPregen() (debounced) whenever a setup option
// changes; a sim worker builds the world off-thread with a seed minted here.
// When the player hits Start, claimWorldPregen() hands the world over if the
// final settings still match, so the game opens without a worldgen wait. On any
// mismatch the session simply generates as before, so this is always safe.

import type { NewGameOptions, SerializedState } from "@roc/sim";
import { toNewGameOptions, type LocalGameOptions } from "./session";
import { SimWorkerClient } from "./sim-worker-client";

/** Everything that shapes generation except the seed (minted per pregen). */
export type PregenOptions = Omit<
  LocalGameOptions,
  "seed" | "savedState" | "deferWorldGen" | "pregenerated"
>;

/** Minimal worker surface; tests inject a fake via setPregenWorkerFactory. */
export interface PregenWorker {
  createGame(opts: NewGameOptions): Promise<SerializedState>;
  terminate(): void;
}

let workerFactory: (() => PregenWorker) | null = null;

/** Test hook: replace the real sim worker. Pass null to restore it. */
export function setPregenWorkerFactory(factory: (() => PregenWorker) | null): void {
  workerFactory = factory;
}

function pregenSupported(): boolean {
  return workerFactory != null || SimWorkerClient.supported();
}

function makeWorker(): PregenWorker {
  return workerFactory ? workerFactory() : new SimWorkerClient();
}

function newSeed(): string {
  return "rise-" + Math.random().toString(36).slice(2, 8);
}

/** Canonical settings fingerprint: two option sets with the same key generate
 *  identical worlds for a given seed. Field order is fixed by hand so callers
 *  can build the object any way they like. */
export function pregenKey(o: PregenOptions): string {
  return JSON.stringify([
    o.civId ?? null,
    o.mapSize ?? "medium",
    o.mapType ?? "random",
    o.aiCount ?? null,
    o.aiCivIds ?? [],
    o.colors ?? [],
    o.barbarians ?? true,
    o.aiDifficulty ?? "normal",
    o.villages ?? "medium",
    o.naturalWonders ?? true,
    o.legends ?? true,
    o.startingGold ?? "balanced",
    o.turnLimit ?? 120,
    o.gameSpeed ?? "normal",
    o.enabledVictories ?? null,
  ]);
}

let client: PregenWorker | null = null;
let current: { key: string; seed: string; promise: Promise<SerializedState> } | null = null;

/** Start (or keep) a background generation for these settings. No-op when the
 *  same settings are already pregenerating or workers are unavailable. */
export function updateWorldPregen(opts: PregenOptions): void {
  if (!pregenSupported()) return;
  const key = pregenKey(opts);
  if (current?.key === key) return;
  // Kill any stale in-flight generation so the fresh one isn't queued behind it.
  disposeWorldPregen();
  const seed = newSeed();
  client = makeWorker();
  const promise = client.createGame(toNewGameOptions({ ...opts, seed }));
  // Superseded or never-claimed pregens must not surface unhandled rejections.
  promise.catch(() => {});
  current = { key, seed, promise };
}

/** Take the pregenerated world if it matches these settings; null otherwise.
 *  Either way the module lets go of its worker (a miss disposes it, a hit
 *  terminates it once the result promise settles). */
export function claimWorldPregen(
  opts: PregenOptions,
): { seed: string; state: Promise<SerializedState> } | null {
  const cur = current;
  current = null;
  if (!cur || cur.key !== pregenKey(opts)) {
    disposeWorldPregen();
    return null;
  }
  const owned = client;
  client = null;
  const state = owned ? cur.promise.finally(() => owned.terminate()) : cur.promise;
  return { seed: cur.seed, state };
}

/** Drop any pregenerated world and stop the worker (menu closed, MP/save started). */
export function disposeWorldPregen(): void {
  client?.terminate();
  client = null;
  current = null;
}
