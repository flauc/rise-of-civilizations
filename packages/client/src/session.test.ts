import { expect, test } from "vitest";
import {
  ensureContact,
  proposeDeal,
  relationBetween,
  unitsOf,
  visibleForPlayer,
} from "@roc/sim";
import { LocalSession } from "./session";

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
