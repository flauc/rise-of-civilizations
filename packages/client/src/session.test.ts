import { expect, test, vi } from "vitest";
import {
  beginTurn,
  createGame,
  ensureContact,
  proposeDeal,
  relationBetween,
  serializeState,
  unitsOf,
  visibleForPlayer,
} from "@roc/sim";
import { LocalSession, MAP_DIMENSIONS, toNewGameOptions, type LocalGameOptions } from "./session";

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

test("LocalSession fog includes a map-exchange partner's sight", () => {
  const session = new LocalSession({ seed: "sv-fog", mapSize: "small", aiCount: 1, barbarians: false });
  const s = session.getState();
  ensureContact(s, 0, 1);
  const aiUnit = unitsOf(s, 1)[0]!;
  aiUnit.col = 30;
  aiUnit.row = 20;
  const key = "30,20";
  s.players[0]!.explored.delete(key);
  s.players[1]!.explored.add(key);

  expect(session.getVisible().has(key)).toBe(false);
  expect(session.getExplored().has(key)).toBe(false);

  relationBetween(s, 0, 1)!.sharedVision = true;

  expect(visibleForPlayer(s, 0).has(key)).toBe(true);
  expect(session.getVisible().has(key)).toBe(true);
  expect(session.getExplored().has(key)).toBe(true);
  expect(session.getViewerId()).toBe(0);
});

test("LocalSession adopts a menu-pregenerated world on finishWorldGen", async () => {
  const opts: LocalGameOptions = { seed: "pg-adopt", mapSize: "small", aiCount: 1, barbarians: false };
  const world = createGame(toNewGameOptions(opts));
  beginTurn(world);
  const session = new LocalSession({
    ...opts,
    deferWorldGen: true,
    pregenerated: Promise.resolve(serializeState(world)),
  });
  expect(session.hasState()).toBe(false);

  const updates = vi.fn();
  session.onUpdate(updates);
  session.finishWorldGen();
  await flush();

  expect(session.hasState()).toBe(true);
  expect(updates).toHaveBeenCalled();
  expect(session.getState().map.cols).toBe(MAP_DIMENSIONS.small.cols);
  expect(session.getViewerId()).toBe(0);
  expect(unitsOf(session.getState(), 0).length).toBeGreaterThan(0);
});

test("LocalSession falls back to main-thread worldgen when the pregen fails", async () => {
  const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  const session = new LocalSession({
    seed: "pg-fallback",
    mapSize: "small",
    aiCount: 1,
    barbarians: false,
    deferWorldGen: true,
    pregenerated: Promise.reject(new Error("worker died")),
  });
  session.finishWorldGen();
  await flush();

  expect(session.hasState()).toBe(true);
  expect(session.getState().map.cols).toBe(MAP_DIMENSIONS.small.cols);
  expect(errSpy).toHaveBeenCalled();
  errSpy.mockRestore();
});

test("LocalSession applies shared vision immediately when the AI accepts", () => {
  const session = new LocalSession({ seed: "sv-deal", mapSize: "small", aiCount: 1, barbarians: false });
  const s = session.getState();
  ensureContact(s, 0, 1);
  s.players[0]!.gold = 100;
  expect(
    proposeDeal(
      s,
      0,
      1,
      [{ kind: "sharedVision" }, { kind: "gold", amount: 40 }],
      [{ kind: "sharedVision" }],
    ).ok,
  ).toBe(true);
  expect(relationBetween(s, 0, 1)!.sharedVision).toBe(true);
});
