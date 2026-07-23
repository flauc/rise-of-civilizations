import { afterEach, expect, test } from "vitest";
import type { NewGameOptions, SerializedState } from "@roc/sim";
import {
  claimWorldPregen,
  disposeWorldPregen,
  pregenKey,
  setPregenWorkerFactory,
  updateWorldPregen,
  type PregenOptions,
  type PregenWorker,
} from "./world-pregen";

const FAKE_STATE = { fake: true } as unknown as SerializedState;

interface FakeWorker extends PregenWorker {
  calls: NewGameOptions[];
  terminated: boolean;
}

function installFakeFactory(): FakeWorker[] {
  const workers: FakeWorker[] = [];
  setPregenWorkerFactory(() => {
    const worker: FakeWorker = {
      calls: [],
      terminated: false,
      createGame(opts: NewGameOptions) {
        worker.calls.push(opts);
        return Promise.resolve(FAKE_STATE);
      },
      terminate() {
        worker.terminated = true;
      },
    };
    workers.push(worker);
    return worker;
  });
  return workers;
}

const baseOpts = (): PregenOptions => ({
  civId: "minoans",
  mapSize: "small",
  mapType: "pangaea",
  aiCivIds: [null, "egypt"],
  colors: ["#111111", "#222222", "#333333"],
  barbarians: "low",
  aiDifficulty: "normal",
  villages: "medium",
  naturalWonders: true,
  legends: true,
  startingGold: "balanced",
  turnLimit: 120,
  gameSpeed: "normal",
  enabledVictories: ["domination", "science"],
});

afterEach(() => {
  disposeWorldPregen();
  setPregenWorkerFactory(null);
});

test("pregenKey is stable for equal settings and changes when any setting changes", () => {
  expect(pregenKey(baseOpts())).toBe(pregenKey(baseOpts()));
  expect(pregenKey({ ...baseOpts(), mapSize: "large" })).not.toBe(pregenKey(baseOpts()));
  expect(pregenKey({ ...baseOpts(), civId: "egypt" })).not.toBe(pregenKey(baseOpts()));
  expect(pregenKey({ ...baseOpts(), aiCivIds: [null] })).not.toBe(pregenKey(baseOpts()));
  expect(pregenKey({ ...baseOpts(), enabledVictories: ["domination"] })).not.toBe(pregenKey(baseOpts()));
});

test("claim returns the pregenerated world when settings match, then stops the worker", async () => {
  const workers = installFakeFactory();
  updateWorldPregen(baseOpts());
  expect(workers).toHaveLength(1);
  expect(workers[0]!.calls).toHaveLength(1);
  // The pregen minted its own seed and passed the settings through.
  expect(workers[0]!.calls[0]!.seed).toMatch(/^rise-/);
  expect(workers[0]!.calls[0]!.mapType).toBe("pangaea");

  const claimed = claimWorldPregen(baseOpts());
  expect(claimed).not.toBeNull();
  expect(claimed!.seed).toBe(workers[0]!.calls[0]!.seed);
  await expect(claimed!.state).resolves.toBe(FAKE_STATE);
  expect(workers[0]!.terminated).toBe(true);
});

test("claim misses when settings changed after the pregen", () => {
  const workers = installFakeFactory();
  updateWorldPregen(baseOpts());
  const claimed = claimWorldPregen({ ...baseOpts(), naturalWonders: false });
  expect(claimed).toBeNull();
  expect(workers[0]!.terminated).toBe(true);
  // A miss consumes the pregen; a second claim also returns null.
  expect(claimWorldPregen(baseOpts())).toBeNull();
});

test("unchanged settings do not regenerate; changed settings replace the worker", () => {
  const workers = installFakeFactory();
  updateWorldPregen(baseOpts());
  updateWorldPregen(baseOpts());
  expect(workers).toHaveLength(1);
  expect(workers[0]!.calls).toHaveLength(1);

  updateWorldPregen({ ...baseOpts(), mapSize: "large" });
  expect(workers).toHaveLength(2);
  expect(workers[0]!.terminated).toBe(true);
  expect(workers[1]!.calls[0]!.cols).toBeGreaterThan(workers[0]!.calls[0]!.cols!);
});

test("dispose drops the pregen and stops the worker", () => {
  const workers = installFakeFactory();
  updateWorldPregen(baseOpts());
  disposeWorldPregen();
  expect(workers[0]!.terminated).toBe(true);
  expect(claimWorldPregen(baseOpts())).toBeNull();
});
