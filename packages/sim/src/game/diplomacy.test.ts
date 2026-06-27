import { describe, it, expect } from "vitest";
import { getTile } from "@roc/shared";
import { createGame } from "./setup";
import { applyCommand } from "./commands";
import { updateExplored } from "./visibility";
import {
  relationBetween, haveMet, atWar, attitudeScore,
  declareWar, makePeace, gift, proposeDeal, demandTribute, finalizeDeal,
  respondProposal, militaryPower, aiInitiateTrade, aiConsiderDiplomacy,
  ensureContact, foreignTerritoryOwner, denounce,
} from "./diplomacy";
import { makeUnit } from "./state";
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
    // Offer the AI gold for nothing → it accepts, but a human-initiated deal
    // must be finalized by the proposer before the gold actually moves.
    s.players[0]!.gold = 100;
    const aiGold = s.players[1]!.gold;
    expect(proposeDeal(s, 0, 1, [{ kind: "gold", amount: 40 }], []).ok).toBe(true);
    const prop = s.diploProposals.find((p) => p.fromId === 0 && p.toId === 1)!;
    expect(prop.status).toBe("accepted"); // AI gave instant feedback
    expect(s.players[1]!.gold).toBe(aiGold); // not yet applied
    expect(finalizeDeal(s, 0, prop.id, true).ok).toBe(true);
    expect(s.players[1]!.gold).toBe(aiGold + 40); // applied on finalize
    expect(s.diploProposals.find((p) => p.id === prop.id)).toBeUndefined();
  });

  it("a coercive tribute demand only succeeds with overwhelming military advantage", () => {
    const s = twoCivGame();
    ensureContact(s, 0, 1);
    s.players[1]!.gold = 200;
    // No army on either side → the AI is not afraid and refuses.
    const before = s.players[1]!.gold;
    expect(demandTribute(s, 0, 1, 50).ok).toBe(true); // the demand is delivered…
    let prop = s.diploProposals.find((p) => p.fromId === 0 && p.toId === 1)!;
    expect(prop.coercive).toBe(true);
    expect(prop.status).toBe("declined"); // …but refused
    expect(s.players[1]!.gold).toBe(before);
    s.diploProposals = [];
    // Give player 0 an overwhelming army; now the AI yields.
    for (let i = 0; i < 12; i++) {
      const id = s.nextEntityId++;
      s.units.set(id, makeUnit(id, 0, "swordsman", 2 + i, 2));
    }
    expect(militaryPower(s, 0)).toBeGreaterThan(militaryPower(s, 1) * 2);
    const myGold = s.players[0]!.gold;
    expect(demandTribute(s, 0, 1, 50).ok).toBe(true);
    prop = s.diploProposals.find((p) => p.fromId === 0 && p.toId === 1)!;
    expect(s.players[0]!.gold).toBe(myGold + 50); // tribute paid immediately
    expect(prop).toBeUndefined; // coercive demands conclude without a finalize step
  });

  it("a human recipient must respond, then the proposer finalizes (two humans)", () => {
    // 2 humans, no AI.
    const s = createGame({ seed: "dip2", cols: 40, rows: 28, barbarians: false, humanSlots: 2, playerCount: 2 });
    ensureContact(s, 0, 1);
    s.players[0]!.gold = 100;
    expect(proposeDeal(s, 0, 1, [{ kind: "gold", amount: 30 }], []).ok).toBe(true);
    const prop = s.diploProposals.find((p) => p.fromId === 0 && p.toId === 1)!;
    expect(prop.status).toBe("pending"); // waits on the human recipient
    const aiGold = s.players[1]!.gold;
    expect(respondProposal(s, 1, prop.id, true).ok).toBe(true);
    expect(prop.status).toBe("accepted");
    expect(s.players[1]!.gold).toBe(aiGold); // proposer still must finalize
    expect(finalizeDeal(s, 0, prop.id, true).ok).toBe(true);
    expect(s.players[1]!.gold).toBe(aiGold + 30);
  });

  it("re-proposing supersedes the prior pending offer to the same civ", () => {
    // 2 humans so offers stay pending (an AI would resolve them at once).
    const s = createGame({ seed: "dip3", cols: 40, rows: 28, barbarians: false, humanSlots: 2, playerCount: 2 });
    ensureContact(s, 0, 1);
    s.players[0]!.gold = 100;
    expect(proposeDeal(s, 0, 1, [{ kind: "gold", amount: 10 }], []).ok).toBe(true);
    expect(proposeDeal(s, 0, 1, [{ kind: "gold", amount: 25 }], []).ok).toBe(true);
    const pending = s.diploProposals.filter((p) => p.fromId === 0 && p.toId === 1 && p.status === "pending");
    expect(pending).toHaveLength(1); // not two stacked offers
    expect(pending[0]!.give).toEqual([{ kind: "gold", amount: 25 }]); // the latest one
  });

  it("the AI won't pay exorbitant sums for soft concessions (open borders)", () => {
    const s = twoCivGame();
    ensureContact(s, 0, 1);
    s.players[1]!.gold = 1000; // even a rich AI shouldn't overpay
    // Offer open borders in exchange for 200 gold — far above what it is worth.
    expect(proposeDeal(s, 0, 1, [{ kind: "openBorders" }], [{ kind: "gold", amount: 200 }]).ok).toBe(true);
    const prop = s.diploProposals.find((p) => p.fromId === 0 && p.toId === 1)!;
    expect(prop.status).toBe("declined");
  });

  it("the AI refuses to spend gold it does not have on a pact", () => {
    const s = twoCivGame();
    ensureContact(s, 0, 1);
    s.players[1]!.gold = 5; // nearly broke
    expect(proposeDeal(s, 0, 1, [{ kind: "pact", tier: "non_aggression", turns: 20 }], [{ kind: "gold", amount: 80 }]).ok).toBe(true);
    const prop = s.diploProposals.find((p) => p.fromId === 0 && p.toId === 1)!;
    expect(prop.status).toBe("declined");
    expect(prop.reason).toMatch(/afford|so much gold|provide/i);
  });

  it("the AI won't drain its treasury for a soft pact even when it can pay", () => {
    const s = twoCivGame();
    ensureContact(s, 0, 1);
    s.players[1]!.gold = 100; // has the gold, but 80 is far more than 25% of it
    expect(proposeDeal(s, 0, 1, [{ kind: "pact", tier: "non_aggression", turns: 20 }], [{ kind: "gold", amount: 80 }]).ok).toBe(true);
    const prop = s.diploProposals.find((p) => p.fromId === 0 && p.toId === 1)!;
    expect(prop.status).toBe("declined");
  });

  it("rejects proposing a concession that is already in force", () => {
    const s = twoCivGame();
    ensureContact(s, 0, 1);
    relationBetween(s, 0, 1)!.openBorders = true;
    expect(proposeDeal(s, 0, 1, [{ kind: "openBorders" }], []).ok).toBe(false);
  });

  it("a tribute demand lowers standing whether refused or met", () => {
    const s = twoCivGame();
    ensureContact(s, 0, 1);
    s.players[1]!.gold = 100;
    const before = attitudeScore(s, 1, 0);
    demandTribute(s, 0, 1, 50); // weak demander → refused
    const afterRefuse = attitudeScore(s, 1, 0);
    expect(afterRefuse).toBeLessThan(before);
    // Now field an overwhelming army so the demand is met — standing drops further.
    s.diploProposals = [];
    for (let i = 0; i < 12; i++) {
      const id = s.nextEntityId++;
      s.units.set(id, makeUnit(id, 0, "swordsman", 2 + i, 2));
    }
    demandTribute(s, 0, 1, 30);
    expect(attitudeScore(s, 1, 0)).toBeLessThan(afterRefuse);
  });

  it("an AI proposes a trade for a luxury it lacks (paying gold when wealthy)", () => {
    const s = twoCivGame();
    ensureContact(s, 0, 1);
    // Give the human a worked wine plantation → a tradeable luxury the AI lacks.
    const cid = s.nextEntityId++;
    s.cities.set(cid, { id: cid, ownerId: 0, name: "Mine", col: 6, row: 6, population: 2, foodStored: 0, productionStored: 0, production: null, buildings: [], specialists: [], wonders: [], workedTiles: [], isCapital: true, foundedAsCapital: true, hp: 100, lastAttackedTurn: 0, rangedAttackUsed: false, modifiers: [] } as never);
    const t = getTile(s.map, 7, 6)!;
    t.terrain = "grassland"; t.resource = "wine"; t.improvement = "plantation"; t.ownerCityId = cid;
    s.players[1]!.gold = 200; // wealthy AI → pays with gold
    expect(aiInitiateTrade(s, 1, 0)).toBe(true);
    const prop = s.diploProposals.find((p) => p.fromId === 1 && p.toId === 0)!;
    expect(prop.status).toBe("pending"); // awaits the human's response
    expect(prop.want.some((it) => it.kind === "resource" && it.id === "wine")).toBe(true);
    expect(prop.give.some((it) => it.kind === "gold" || it.kind === "goldPerTurn")).toBe(true);
  });

  it("a gold-poor AI barters a spare luxury instead of paying gold", () => {
    const s = twoCivGame();
    ensureContact(s, 0, 1);
    // Human owns wine; AI owns incense (a spare the human lacks).
    const human = s.nextEntityId++;
    s.cities.set(human, { id: human, ownerId: 0, name: "Mine", col: 6, row: 6, population: 2, foodStored: 0, productionStored: 0, production: null, buildings: [], specialists: [], wonders: [], workedTiles: [], isCapital: true, foundedAsCapital: true, hp: 100, lastAttackedTurn: 0, rangedAttackUsed: false, modifiers: [] } as never);
    const tw = getTile(s.map, 7, 6)!; tw.terrain = "grassland"; tw.resource = "wine"; tw.improvement = "plantation"; tw.ownerCityId = human;
    const aiCity = s.nextEntityId++;
    s.cities.set(aiCity, { id: aiCity, ownerId: 1, name: "Theirs", col: 20, row: 12, population: 2, foodStored: 0, productionStored: 0, production: null, buildings: [], specialists: [], wonders: [], workedTiles: [], isCapital: true, foundedAsCapital: true, hp: 100, lastAttackedTurn: 0, rangedAttackUsed: false, modifiers: [] } as never);
    const ti = getTile(s.map, 21, 12)!; ti.terrain = "desert"; ti.resource = "incense"; ti.improvement = "plantation"; ti.ownerCityId = aiCity;
    s.players[1]!.gold = 10; // broke → prefers to barter goods
    expect(aiInitiateTrade(s, 1, 0)).toBe(true);
    const prop = s.diploProposals.find((p) => p.fromId === 1 && p.toId === 0)!;
    expect(prop.want.some((it) => it.kind === "resource" && it.id === "wine")).toBe(true);
    expect(prop.give.some((it) => it.kind === "resource" && it.id === "incense")).toBe(true); // bartered, no gold
  });

  it("an overwhelmingly strong, warlike AI demands tribute before war and escalates if refused", () => {
    const s = twoCivGame(); // human 0, AI 1
    ensureContact(s, 0, 1);
    s.players[1]!.civId = "mongols"; // warlike temperament
    s.players[0]!.gold = 100;
    // The AI fields an overwhelming army.
    for (let i = 0; i < 14; i++) {
      const id = s.nextEntityId++;
      s.units.set(id, makeUnit(id, 1, "swordsman", 2 + i, 3));
    }
    expect(militaryPower(s, 1)).toBeGreaterThan(militaryPower(s, 0) * 2);
    // First it demands tribute rather than going straight to war.
    aiConsiderDiplomacy(s, 1);
    const demand = s.diploProposals.find((p) => p.fromId === 1 && p.toId === 0 && p.coercive);
    expect(demand).toBeDefined();
    expect(atWar(s, 0, 1)).toBe(false);
    // The human refuses → the AI makes good on the threat next time it deliberates.
    expect(respondProposal(s, 0, demand!.id, false).ok).toBe(true);
    aiConsiderDiplomacy(s, 1);
    expect(atWar(s, 0, 1)).toBe(true);
  });

  it("does not re-pitch an offer a human has just rejected", () => {
    const s = twoCivGame();
    ensureContact(s, 0, 1);
    // Give the AI a worked incense plantation (a spare luxury) and the human wine,
    // so the AI has a clear, repeatable reason to keep proposing a wine-for-X deal.
    const human = s.nextEntityId++;
    s.cities.set(human, { id: human, ownerId: 0, name: "Mine", col: 6, row: 6, population: 2, foodStored: 0, productionStored: 0, production: null, buildings: [], specialists: [], wonders: [], workedTiles: [], isCapital: true, foundedAsCapital: true, hp: 100, lastAttackedTurn: 0, rangedAttackUsed: false, modifiers: [] } as never);
    const tw = getTile(s.map, 7, 6)!; tw.terrain = "grassland"; tw.resource = "wine"; tw.improvement = "plantation"; tw.ownerCityId = human;
    const aiCity = s.nextEntityId++;
    s.cities.set(aiCity, { id: aiCity, ownerId: 1, name: "Theirs", col: 20, row: 12, population: 2, foodStored: 0, productionStored: 0, production: null, buildings: [], specialists: [], wonders: [], workedTiles: [], isCapital: true, foundedAsCapital: true, hp: 100, lastAttackedTurn: 0, rangedAttackUsed: false, modifiers: [] } as never);
    const ti = getTile(s.map, 21, 12)!; ti.terrain = "desert"; ti.resource = "incense"; ti.improvement = "plantation"; ti.ownerCityId = aiCity;
    s.players[1]!.gold = 200;

    expect(aiInitiateTrade(s, 1, 0)).toBe(true);
    const prop = s.diploProposals.find((p) => p.fromId === 1 && p.toId === 0)!;
    expect(respondProposal(s, 0, prop.id, false).ok).toBe(true); // human rejects
    // It must NOT immediately fire off the same deal again.
    expect(aiInitiateTrade(s, 1, 0)).toBe(false);
    expect(s.diploProposals.some((p) => p.fromId === 1 && p.toId === 0 && p.status === "pending")).toBe(false);
  });

  it("counters an underpriced offer instead of flatly refusing", () => {
    const s = twoCivGame();
    ensureContact(s, 0, 1);
    // The AI owns a worked wine plantation → a luxury it can put up for trade.
    const aiCity = s.nextEntityId++;
    s.cities.set(aiCity, { id: aiCity, ownerId: 1, name: "Theirs", col: 20, row: 12, population: 2, foodStored: 0, productionStored: 0, production: null, buildings: [], specialists: [], wonders: [], workedTiles: [], isCapital: true, foundedAsCapital: true, hp: 100, lastAttackedTurn: 0, rangedAttackUsed: false, modifiers: [] } as never);
    const tw = getTile(s.map, 21, 12)!; tw.terrain = "grassland"; tw.resource = "wine"; tw.improvement = "plantation"; tw.ownerCityId = aiCity;
    s.players[0]!.gold = 50;
    // Human lowballs: 5 gold for the AI's wine. The AI should counter, not just decline.
    expect(proposeDeal(s, 0, 1, [{ kind: "gold", amount: 5 }], [{ kind: "resource", id: "wine", turns: 20 }]).ok).toBe(true);
    const orig = s.diploProposals.find((p) => p.fromId === 0 && p.toId === 1)!;
    expect(orig.status).toBe("declined");
    const counter = s.diploProposals.find((p) => p.fromId === 1 && p.toId === 0 && p.status === "pending");
    expect(counter).toBeDefined();
    expect(counter!.give.some((it) => it.kind === "resource" && it.id === "wine")).toBe(true); // AI offers the wine
    const askGold = counter!.want.find((it) => it.kind === "gold") as { kind: "gold"; amount: number } | undefined;
    expect(askGold && askGold.amount > 5).toBe(true); // …but at a fairer price
  });

  it("won't act militarily with no army — but turns aggressive once it raises one", () => {
    const s = twoCivGame(); // human 0, AI 1
    ensureContact(s, 0, 1);
    s.players[1]!.civId = "mongols"; // maximally warlike
    // Clear the field, then set up: AI loathes the human and outmatches them, but
    // has only a single soldier — not enough to actually wage a war.
    for (const u of [...s.units.values()]) s.units.delete(u.id);
    const aiCity = s.nextEntityId++;
    s.cities.set(aiCity, { id: aiCity, ownerId: 1, name: "Theirs", col: 20, row: 12, population: 6, foodStored: 0, productionStored: 0, production: null, buildings: [], specialists: [], wonders: [], workedTiles: [], isCapital: true, foundedAsCapital: true, hp: 100, lastAttackedTurn: 0, rangedAttackUsed: false, modifiers: [] } as never);
    const addUnit = (owner: number, col: number, row: number) => {
      const id = s.nextEntityId++;
      s.units.set(id, makeUnit(id, owner, "swordsman", col, row));
    };
    addUnit(1, 19, 12);
    const humanCity = s.nextEntityId++;
    s.cities.set(humanCity, { id: humanCity, ownerId: 0, name: "Mine", col: 22, row: 12, population: 1, foodStored: 0, productionStored: 0, production: null, buildings: [], specialists: [], wonders: [], workedTiles: [], isCapital: true, foundedAsCapital: true, hp: 100, lastAttackedTurn: 0, rangedAttackUsed: false, modifiers: [] } as never);
    denounce(s, 0, 1); // human denounces → AI's opinion sours below the war threshold

    aiConsiderDiplomacy(s, 1);
    const hostileAction = () =>
      atWar(s, 0, 1) || s.diploProposals.some((p) => p.fromId === 1 && p.toId === 0 && p.coercive);
    expect(hostileAction()).toBe(false); // one soldier is not an army → no war, no demand

    // Give the AI a real stack right next to the enemy city; now it acts on its enmity.
    for (let i = 0; i < 4; i++) addUnit(1, 21, 11 + (i % 2));
    aiConsiderDiplomacy(s, 1);
    expect(hostileAction()).toBe(true);
  });

  it("restricts entering a peaceful civ's territory unless at war / open borders", () => {
    const s = twoCivGame();
    ensureContact(s, 0, 1);
    // Give player 1 a city that owns a tile near player 0.
    const cid = s.nextEntityId++;
    s.cities.set(cid, { id: cid, ownerId: 1, name: "Theirs", col: 10, row: 10, population: 1, foodStored: 0, productionStored: 0, production: null, buildings: [], specialists: [], wonders: [], workedTiles: [], isCapital: true, foundedAsCapital: true, hp: 100, lastAttackedTurn: 0, rangedAttackUsed: false, modifiers: [] } as never);
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
    s.cities.set(c0, { id: c0, ownerId: 0, name: "Mine", col: 5, row: 5, population: 3, foodStored: 0, productionStored: 0, production: null, buildings: [], specialists: [{ id: 900, type: "carpenter", name: "Test", xp: 0, level: 2 }], wonders: [], workedTiles: [], isCapital: true, foundedAsCapital: true, hp: 100, lastAttackedTurn: 0, rangedAttackUsed: false, modifiers: [] } as never);
    const c1 = s.nextEntityId++;
    s.cities.set(c1, { id: c1, ownerId: 1, name: "Theirs", col: 20, row: 12, population: 1, foodStored: 0, productionStored: 0, production: null, buildings: [], specialists: [], wonders: [], workedTiles: [], isCapital: true, foundedAsCapital: true, hp: 100, lastAttackedTurn: 0, rangedAttackUsed: false, modifiers: [] } as never);
    // Offer the AI the carpenter for free (3 turns) — it accepts; we finalize.
    expect(proposeDeal(s, 0, 1, [{ kind: "specialist", specialistType: "carpenter", turns: 3 }], []).ok).toBe(true);
    const prop = s.diploProposals.find((p) => p.fromId === 0 && p.toId === 1)!;
    expect(prop.status).toBe("accepted");
    expect(finalizeDeal(s, 0, prop.id, true).ok).toBe(true);
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
