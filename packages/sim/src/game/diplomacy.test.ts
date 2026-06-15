import { describe, it, expect } from "vitest";
import { getTile } from "@roc/shared";
import { createGame } from "./setup";
import { applyCommand } from "./commands";
import { updateExplored } from "./visibility";
import {
  relationBetween, haveMet, atWar, attitudeScore,
  declareWar, makePeace, gift, proposeDeal, ensureContact, foreignTerritoryOwner,
} from "./diplomacy";
import { areEnemies, unitsOf, type GameState } from "./state";

function twoCivGame(): GameState {
  // 1 human (player 0) + 1 AI (player 1), no barbarians.
  return createGame({ seed: "dip", cols: 40, rows: 28, barbarians: false, humanSlots: 1, playerCount: 2 });
}

describe("diplomacy", () => {
  it("establishes first contact on sight (starting at peace)", () => {
    const s = twoCivGame();
    // Move player 1's settler next to player 0's settler so it falls in sight.
    const mine = unitsOf(s, 0)[0]!;
    const theirs = unitsOf(s, 1)[0]!;
    theirs.col = mine.col + 1;
    theirs.row = mine.row;
    expect(haveMet(s, 0, 1)).toBe(false);
    updateExplored(s, 0);
    expect(haveMet(s, 0, 1)).toBe(true);
    expect(relationBetween(s, 0, 1)!.status).toBe("peace");
    expect(s.players[0]!.met).toContain(1);
  });

  it("requires a declared war to be enemies / to attack", () => {
    const s = twoCivGame();
    ensureContact(s, 0, 1);
    const p0 = s.players[0]!, p1 = s.players[1]!;
    expect(areEnemies(p0, p1)).toBe(false);
    expect(declareWar(s, 0, 1).ok).toBe(true);
    expect(areEnemies(p0, p1)).toBe(true);
    expect(atWar(s, 0, 1)).toBe(true);
    // a fresh war declaration when already at war is rejected
    expect(declareWar(s, 0, 1).ok).toBe(false);
  });

  it("makes peace and then blocks an immediate re-declaration (cooldown)", () => {
    const s = twoCivGame();
    ensureContact(s, 0, 1);
    declareWar(s, 0, 1);
    relationBetween(s, 0, 1)!.lastStatusChangeTurn = s.turn - 15; // long war → AI war-weary
    expect(makePeace(s, 0, 1).ok).toBe(true); // weary AI accepts
    expect(atWar(s, 0, 1)).toBe(false);
    expect(s.players[0]!.atWar).not.toContain(1);
    // peace cooldown forbids re-declaring war right away
    expect(declareWar(s, 0, 1).ok).toBe(false);
  });

  it("gifts improve the recipient's attitude; the AI accepts a one-sided deal", () => {
    const s = twoCivGame();
    ensureContact(s, 0, 1);
    const before = attitudeScore(s, 1, 0);
    s.players[0]!.gold = 100;
    expect(gift(s, 0, 1, 60).ok).toBe(true);
    expect(attitudeScore(s, 1, 0)).toBeGreaterThan(before);
    // Offer the AI gold for nothing → it accepts and the gold moves.
    s.players[0]!.gold = 100;
    const aiGold = s.players[1]!.gold;
    expect(proposeDeal(s, 0, 1, [{ kind: "gold", amount: 40 }], []).ok).toBe(true);
    expect(s.players[1]!.gold).toBe(aiGold + 40);
  });

  it("restricts entering a peaceful civ's territory unless at war / open borders", () => {
    const s = twoCivGame();
    ensureContact(s, 0, 1);
    // Give player 1 a city that owns a tile near player 0.
    const cid = s.nextEntityId++;
    s.cities.set(cid, { id: cid, ownerId: 1, name: "Theirs", col: 10, row: 10, population: 1, foodStored: 0, productionStored: 0, production: null, buildings: [], specialists: [], wonders: [], workedTiles: [], isCapital: true, foundedAsCapital: true, hp: 100, lastAttackedTurn: 0, rangedAttackUsed: false } as never);
    const t = getTile(s.map, 11, 10)!;
    t.ownerCityId = cid;
    expect(foreignTerritoryOwner(s, 0, 11, 10)).toBe(1); // peace, no open borders → blocked
    relationBetween(s, 0, 1)!.openBorders = true;
    expect(foreignTerritoryOwner(s, 0, 11, 10)).toBeNull(); // open borders → free
    relationBetween(s, 0, 1)!.openBorders = false;
    declareWar(s, 0, 1);
    expect(foreignTerritoryOwner(s, 0, 11, 10)).toBeNull(); // at war → enter freely
  });

  it("lends a specialist into the recipient's capital via a deal", () => {
    const s = twoCivGame();
    ensureContact(s, 0, 1);
    // Player 0 has a city with a carpenter; player 1 (AI) has a capital.
    const c0 = s.nextEntityId++;
    s.cities.set(c0, { id: c0, ownerId: 0, name: "Mine", col: 5, row: 5, population: 3, foodStored: 0, productionStored: 0, production: null, buildings: [], specialists: [{ id: 900, type: "carpenter", name: "Test", xp: 0, level: 2 }], wonders: [], workedTiles: [], isCapital: true, foundedAsCapital: true, hp: 100, lastAttackedTurn: 0, rangedAttackUsed: false } as never);
    const c1 = s.nextEntityId++;
    s.cities.set(c1, { id: c1, ownerId: 1, name: "Theirs", col: 20, row: 12, population: 1, foodStored: 0, productionStored: 0, production: null, buildings: [], specialists: [], wonders: [], workedTiles: [], isCapital: true, foundedAsCapital: true, hp: 100, lastAttackedTurn: 0, rangedAttackUsed: false } as never);
    // Offer the AI the carpenter for free (3 turns) — it accepts a gift.
    expect(proposeDeal(s, 0, 1, [{ kind: "specialist", specialistType: "carpenter", turns: 3 }], []).ok).toBe(true);
    expect(s.cities.get(c1)!.specialists.some((sp) => sp.type === "carpenter")).toBe(true);
    expect(s.cities.get(c0)!.specialists.length).toBe(0); // moved out of the lender
  });

  it("flows through applyCommand and queues a contact for the human", () => {
    const s = twoCivGame();
    ensureContact(s, 0, 1);
    expect(s.contactQueue.some((e) => e.youId === 0 && e.otherId === 1)).toBe(true);
    expect(applyCommand(s, { type: "declareWar", targetId: 1 }, 0).ok).toBe(true);
    expect(atWar(s, 0, 1)).toBe(true);
    expect(applyCommand(s, { type: "acknowledgeContact", otherId: 1 }, 0).ok).toBe(true);
    expect(s.contactQueue.length).toBe(0);
  });
});
