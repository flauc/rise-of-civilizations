import { describe, it, expect } from "vitest";
import { getTile, axialDistance, offsetToAxial } from "@roc/shared";
import { createGame } from "./setup";
import { applyCommand } from "./commands";
import { updateExplored, visibleForPlayer, exploredForPlayer } from "./visibility";
import { isPassableLand } from "./terrain";
import {
  relationBetween, haveMet, atWar, attitudeScore,
  declareWar, makePeace, gift, proposeDeal, demandTribute, finalizeDeal,
  canDeclareWar,
  respondProposal, militaryPower, aiInitiateTrade, aiConsiderDiplomacy, previewPeace,
  ensureContact, foreignTerritoryOwner, denounce, diplomacyTick, tradeableTechs,
  cancelSharedVision, sharedVisionPartners,
} from "./diplomacy";
import { viewForPlayer } from "./serialize";
import { beginTurn } from "./commands";
import { makeUnit } from "./state";
import { areEnemies, citiesOf, unitsOf, type GameState } from "./state";
import { UNIT_DEFS } from "./content";
import { offsetNeighbors } from "./movement";

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
    expect(canDeclareWar(s, 0, 1).ok).toBe(false);
    expect(canDeclareWar(s, 0, 1).reason).toMatch(/Peace treaty holds/);
  });

  it("a winning AI refuses peace offers while it still holds a clear edge", () => {
    const s = twoCivGame();
    beginTurn(s);
    for (const pid of [0, 1]) {
      const settler = unitsOf(s, pid).find((u) => u.type === "settler");
      if (settler) applyCommand(s, { type: "foundCity", unitId: settler.id }, pid);
    }
    ensureContact(s, 0, 1);
    declareWar(s, 1, 0);
    relationBetween(s, 0, 1)!.lastStatusChangeTurn = s.turn - 20; // war-weary by old rules
    // Disarm the human and mass a strong army for the AI beside the capital.
    for (const u of unitsOf(s, 0)) if (UNIT_DEFS[u.type].strength > 0) s.units.delete(u.id);
    const target = citiesOf(s, 0)[0]!;
    for (const nb of offsetNeighbors(s.map, target.col, target.row)) {
      const t = getTile(s.map, nb.col, nb.row);
      if (t && !isPassableLand(t.terrain)) t.terrain = "plains";
    }
    for (let i = 0; i < 5; i++) {
      const nb = offsetNeighbors(s.map, target.col, target.row).find((n) => {
        const t = getTile(s.map, n.col, n.row);
        return t && isPassableLand(t.terrain) && !unitsOf(s, 1).some((u) => u.col === n.col && u.row === n.row);
      });
      expect(nb).toBeTruthy();
      const id = s.nextEntityId++;
      s.units.set(id, makeUnit(id, 1, "swordsman", nb!.col, nb!.row));
    }
    expect(militaryPower(s, 1)).toBeGreaterThan(militaryPower(s, 0) * 1.1);
    expect(previewPeace(s, 0, 1)?.accept).toBe(false);
    expect(makePeace(s, 0, 1).ok).toBe(false);
    expect(atWar(s, 0, 1)).toBe(true);
    aiConsiderDiplomacy(s, 1);
    expect(atWar(s, 0, 1)).toBe(true); // winning AI does not sue for peace itself
  });

  it("gifts improve the recipient's attitude; the AI accepts a one-sided deal", () => {
    const s = twoCivGame();
    ensureContact(s, 0, 1);
    const before = attitudeScore(s, 1, 0);
    s.players[0]!.gold = 100;
    expect(gift(s, 0, 1, 60).ok).toBe(true);
    expect(attitudeScore(s, 1, 0)).toBeGreaterThan(before);
    // Offer the AI gold for nothing → it accepts and the deal applies at once
    // (human↔AI never needs a separate finalize step).
    s.players[0]!.gold = 100;
    const aiGold = s.players[1]!.gold;
    expect(proposeDeal(s, 0, 1, [{ kind: "gold", amount: 40 }], []).ok).toBe(true);
    expect(s.diploProposals.find((p) => p.fromId === 0 && p.toId === 1)).toBeUndefined();
    expect(s.players[1]!.gold).toBe(aiGold + 40);
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
    // Offer the AI the carpenter for free (3 turns) — it accepts and applies at once.
    expect(proposeDeal(s, 0, 1, [{ kind: "specialist", specialistType: "carpenter", turns: 3 }], []).ok).toBe(true);
    expect(s.diploProposals.find((p) => p.fromId === 0 && p.toId === 1)).toBeUndefined();
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

describe("diplomacy — trading tech, cities, and units", () => {
  // Two humans so accept→finalize is deterministic (no AI valuation in the way).
  function twoHumans(): GameState {
    const s = createGame({ seed: "dip-trade", cols: 40, rows: 28, barbarians: false, humanSlots: 2, playerCount: 2 });
    beginTurn(s);
    return s;
  }
  function foundFor(s: GameState, owner: number) {
    const settler = unitsOf(s, owner).find((u) => u.type === "settler")!;
    applyCommand(s, { type: "foundCity", unitId: settler.id }, owner);
    return citiesOf(s, owner)[0]!;
  }
  /** Strike a human↔human deal: propose, accept, finalize. */
  function strike(s: GameState, give: Parameters<typeof proposeDeal>[3], want: Parameters<typeof proposeDeal>[4]) {
    expect(proposeDeal(s, 0, 1, give, want).ok).toBe(true);
    const prop = s.diploProposals.find((p) => p.fromId === 0 && p.toId === 1)!;
    expect(respondProposal(s, 1, prop.id, true).ok).toBe(true);
    expect(finalizeDeal(s, 0, prop.id, true).ok).toBe(true);
  }

  it("transfers a researched technology to the other civ (non-rival)", () => {
    const s = twoHumans();
    ensureContact(s, 0, 1);
    s.players[0]!.researched.add("fire_hardening");
    expect(s.players[1]!.researched.has("fire_hardening")).toBe(false);
    strike(s, [{ kind: "tech", techId: "fire_hardening" }], []);
    expect(s.players[1]!.researched.has("fire_hardening")).toBe(true);
    expect(s.players[0]!.researched.has("fire_hardening")).toBe(true); // giver keeps it
  });

  it("tradeableTechs offers only techs the receiver lacks but can support", () => {
    const s = twoHumans();
    s.players[0]!.researched.add("fire_hardening");
    const offerable = tradeableTechs(s, 0, 1);
    expect(offerable).toContain("fire_hardening");
    s.players[1]!.researched.add("fire_hardening");
    expect(tradeableTechs(s, 0, 1)).not.toContain("fire_hardening");
  });

  it("cedes a city to the other civ", () => {
    const s = twoHumans();
    ensureContact(s, 0, 1);
    foundFor(s, 1); // give p1 a city so it isn't wiped out
    const city = foundFor(s, 0);
    strike(s, [{ kind: "city", cityId: city.id }], []);
    expect(s.cities.get(city.id)!.ownerId).toBe(1);
  });

  it("sells a unit (permanent transfer)", () => {
    const s = twoHumans();
    ensureContact(s, 0, 1);
    const unit = unitsOf(s, 0).find((u) => u.type !== "settler")!;
    strike(s, [{ kind: "unit", unitId: unit.id, turns: 0 }], [{ kind: "gold", amount: 5 }]);
    s.players[1]!.gold += 5; // ensure payable
    expect(s.units.get(unit.id)!.ownerId).toBe(1);
  });

  it("lends a unit that reverts to its owner when the loan expires", () => {
    const s = twoHumans();
    ensureContact(s, 0, 1);
    const unit = unitsOf(s, 0).find((u) => u.type !== "settler")!;
    strike(s, [{ kind: "unit", unitId: unit.id, turns: 5 }], []);
    expect(s.units.get(unit.id)!.ownerId).toBe(1); // lent now
    const rel = relationBetween(s, 0, 1)!;
    expect(rel.deals.some((d) => d.item.kind === "unit" && d.unitId === unit.id)).toBe(true);
    s.turn += 5; // loan term elapses
    diplomacyTick(s);
    expect(s.units.get(unit.id)!.ownerId).toBe(0); // returned
  });
});

describe("diplomacy — settling on a rival's doorstep", () => {
  /** An unowned passable-land tile exactly `d` tiles from (col,row), if any. */
  function landAtDistance(s: GameState, col: number, row: number, d: number) {
    const center = offsetToAxial({ col, row });
    for (const t of s.map.tiles) {
      if (!isPassableLand(t.terrain) || t.ownerCityId !== undefined) continue;
      if (axialDistance(center, offsetToAxial({ col: t.col, row: t.row })) === d) return t;
    }
    return undefined;
  }

  /** Two met civs, an AI (1) city founded, and a player-0 settler parked `d` from it. */
  function setup(seed: string, d: number) {
    const s = createGame({ seed, cols: 40, rows: 28, barbarians: false, humanSlots: 1, playerCount: 2 });
    beginTurn(s);
    const aiSettler = unitsOf(s, 1).find((u) => u.type === "settler")!;
    applyCommand(s, { type: "foundCity", unitId: aiSettler.id }, 1);
    const aiCity = citiesOf(s, 1)[0]!;
    ensureContact(s, 0, 1);
    const spot = landAtDistance(s, aiCity.col, aiCity.row, d);
    expect(spot).toBeTruthy();
    const mySettler = unitsOf(s, 0).find((u) => u.type === "settler")!;
    mySettler.col = spot!.col;
    mySettler.row = spot!.row;
    return { s, aiCity, mySettler };
  }

  it("sours a met civ's attitude when a city is founded on their doorstep", () => {
    const { s, mySettler } = setup("encroach", 3);
    const before = attitudeScore(s, 1, 0);
    expect(applyCommand(s, { type: "foundCity", unitId: mySettler.id }, 0).ok).toBe(true);
    const at = s.attitudes.find((x) => x.from === 1 && x.to === 0)!;
    expect(at.modifiers.some((m) => m.reason === "you settled on our borders" && m.value < 0)).toBe(true);
    expect(attitudeScore(s, 1, 0)).toBeLessThan(before);
  });

  it("does not resent a city founded far from anyone's borders", () => {
    const { s, mySettler } = setup("encroach-far", 8);
    applyCommand(s, { type: "foundCity", unitId: mySettler.id }, 0);
    const at = s.attitudes.find((x) => x.from === 1 && x.to === 0);
    expect(at?.modifiers.some((m) => m.reason === "you settled on our borders")).toBeFalsy();
  });

  it("an already-hostile AI that can win declares war over a city on its border", () => {
    const { s, aiCity, mySettler } = setup("encroach-war", 3);
    // The AI already loathes player 0, and fields an army that outmatches them.
    const at = s.attitudes.find((x) => x.from === 1 && x.to === 0)!;
    at.modifiers.push({ reason: "old grudge", value: -90 });
    for (let i = 0; i < 3; i++) {
      const id = s.nextEntityId++;
      s.units.set(id, makeUnit(id, 1, "warrior", aiCity.col, aiCity.row));
    }
    expect(atWar(s, 0, 1)).toBe(false);
    applyCommand(s, { type: "foundCity", unitId: mySettler.id }, 0);
    expect(atWar(s, 0, 1)).toBe(true);
  });

  it("a human offended party never auto-declares war (they choose their own wars)", () => {
    // Roles reversed: AI (1) founds on the human's (0) doorstep.
    const s = createGame({ seed: "encroach-human", cols: 40, rows: 28, barbarians: false, humanSlots: 1, playerCount: 2 });
    beginTurn(s);
    const humanSettler = unitsOf(s, 0).find((u) => u.type === "settler")!;
    applyCommand(s, { type: "foundCity", unitId: humanSettler.id }, 0);
    const humanCity = citiesOf(s, 0)[0]!;
    ensureContact(s, 0, 1);
    const at = s.attitudes.find((x) => x.from === 0 && x.to === 1)!;
    at.modifiers.push({ reason: "old grudge", value: -90 });
    const center = offsetToAxial({ col: humanCity.col, row: humanCity.row });
    const spot = s.map.tiles.find(
      (t) => isPassableLand(t.terrain) && t.ownerCityId === undefined &&
        axialDistance(center, offsetToAxial({ col: t.col, row: t.row })) === 3,
    )!;
    expect(spot).toBeTruthy();
    const aiSettler = unitsOf(s, 1).find((u) => u.type === "settler")!;
    aiSettler.col = spot.col;
    aiSettler.row = spot.row;
    applyCommand(s, { type: "foundCity", unitId: aiSettler.id }, 1);
    expect(atWar(s, 0, 1)).toBe(false); // the human is annoyed but not dragged into war
  });
});

describe("shared vision (map exchange)", () => {
  it("a mutual map-exchange deal grants both sides shared vision", () => {
    const s = twoCivGame();
    ensureContact(s, 0, 1);
    // Sweeten the swap with gold so the AI clearly gains from it whatever its
    // temperament — a bare symmetric trade is a wash a greedy civ would refuse.
    s.players[0]!.gold = 100;
    expect(
      proposeDeal(s, 0, 1, [{ kind: "sharedVision" }, { kind: "gold", amount: 40 }], [{ kind: "sharedVision" }]).ok,
    ).toBe(true);
    expect(s.diploProposals.find((p) => p.fromId === 0 && p.toId === 1)).toBeUndefined();
    expect(relationBetween(s, 0, 1)!.sharedVision).toBe(true);
    expect(sharedVisionPartners(s, 0)).toContain(1);
    expect(sharedVisionPartners(s, 1)).toContain(0);
  });

  it("rejects a redundant map-exchange offer once vision is already shared", () => {
    const s = twoCivGame();
    ensureContact(s, 0, 1);
    relationBetween(s, 0, 1)!.sharedVision = true;
    expect(proposeDeal(s, 0, 1, [{ kind: "sharedVision" }], [{ kind: "sharedVision" }]).ok).toBe(false);
  });

  it("reveals the partner's remembered map and current sight in the player's view", () => {
    const s = twoCivGame();
    ensureContact(s, 0, 1);
    // Park player 1's unit in a far corner player 0 cannot see, and give player 1
    // a memory of that tile.
    const p1u = unitsOf(s, 1)[0]!;
    p1u.col = 35;
    p1u.row = 25;
    const key = "35,25";
    s.players[0]!.explored.delete(key);
    expect(viewForPlayer(s, 0).visible).not.toContain(key); // no pact → hidden

    s.players[1]!.explored.add(key);
    relationBetween(s, 0, 1)!.sharedVision = true;
    const view = viewForPlayer(s, 0);
    expect(view.visible).toContain(key); // live sight is shared
    expect(view.tiles.some((t) => `${t.col},${t.row}` === key)).toBe(true); // remembered map too
    expect(visibleForPlayer(s, 0).has(key)).toBe(true);
    expect(exploredForPlayer(s, 0).has(key)).toBe(true);
  });

  it("cancelling revokes the borrowed sight without leaking into the player's own map", () => {
    const s = twoCivGame();
    ensureContact(s, 0, 1);
    const p1u = unitsOf(s, 1)[0]!;
    p1u.col = 35;
    p1u.row = 25;
    const key = "35,25";
    s.players[0]!.explored.delete(key);
    relationBetween(s, 0, 1)!.sharedVision = true;
    expect(viewForPlayer(s, 0).visible).toContain(key);

    // Either party may end it; here the other side pulls out.
    expect(cancelSharedVision(s, 1, 0).ok).toBe(true);
    expect(relationBetween(s, 0, 1)!.sharedVision).toBe(false);
    expect(viewForPlayer(s, 0).visible).not.toContain(key); // sight gone at once
    expect(s.players[0]!.explored.has(key)).toBe(false); // never persisted
  });

  it("cancelling shared vision that was never agreed fails", () => {
    const s = twoCivGame();
    ensureContact(s, 0, 1);
    expect(cancelSharedVision(s, 0, 1).ok).toBe(false);
  });

  it("declaring war ends any standing map-exchange agreement", () => {
    const s = twoCivGame();
    ensureContact(s, 0, 1);
    relationBetween(s, 0, 1)!.sharedVision = true;
    declareWar(s, 0, 1);
    expect(relationBetween(s, 0, 1)!.sharedVision).toBe(false);
  });

  it("a friendly AI offers to exchange maps once borders are open", () => {
    const s = twoCivGame();
    ensureContact(s, 0, 1);
    relationBetween(s, 0, 1)!.openBorders = true;
    // Make the AI (player 1) warmly disposed toward player 0.
    const at = s.attitudes.find((x) => x.from === 1 && x.to === 0)!;
    at.modifiers.push({ reason: "test-friendship", value: 60 });
    s.turn = 12; // aligns the throttle: (turn + aiId=1) % 13 === 0
    aiConsiderDiplomacy(s, 1);
    const offer = s.diploProposals.find(
      (p) => p.fromId === 1 && p.toId === 0 && p.give.some((i) => i.kind === "sharedVision"),
    );
    expect(offer).toBeDefined();
  });
});
