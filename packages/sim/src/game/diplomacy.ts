// Diplomacy between major civilizations. Civs meet on sight, hold opinions of
// one another, and conduct relations: peace/war, treaties and timed deals.
// Barbarians are excluded (always hostile). See docs/DIPLOMACY.md.

import { axialDistance, getTile, offsetToAxial } from "@roc/shared";
import { getCiv, getPersonality, type DiploPersonality } from "@roc/data";
import type {
  Attitude,
  DealItem,
  GameState,
  PactTier,
  Player,
  Proposal,
  Relation,
  TradeRecord,
  TradeRecordKind,
} from "./state";
import { citiesOf, log, playerById, unitsOf, type City } from "./state";
import { UNIT_DEFS, isMilitary } from "./content";
import { RESOURCE_DEFS, empireLuxuryTypes, tradeableLuxuries, type ResourceId } from "./resources";
import { SPECIALIST_DEFS, type SpecialistId } from "./specialists";

export interface DiploResult {
  ok: boolean;
  error?: string;
}
const ok: DiploResult = { ok: true };
const fail = (error: string): DiploResult => ({ ok: false, error });

const PEACE_COOLDOWN = 10; // turns before war can be re-declared after a peace
const WARMONGER_SURPRISE = 20;
const WARMONGER_DENOUNCED = 8;
const PROPOSAL_PENDING_TTL = 12; // turns a pending proposal survives before lapsing
const PROPOSAL_RESOLVED_TTL = 6; // turns a resolved (accepted/declined) proposal lingers

// ---- personality ---------------------------------------------------------

/** The diplomatic temperament of a (usually AI) civ. */
export function personalityOf(state: GameState, playerId: number): DiploPersonality {
  return getPersonality(playerById(state, playerId)?.civId);
}

// ---- trade history -------------------------------------------------------

/** A compact human-readable description of one side of a deal. */
export function describeDealItems(items: DealItem[]): string {
  if (items.length === 0) return "nothing";
  return items
    .map((it) => {
      switch (it.kind) {
        case "gold": return `${it.amount} gold`;
        case "goldPerTurn": return `${it.amount} gold/turn (${it.turns}t)`;
        case "resource": return `${it.id} (${it.turns}t)`;
        case "specialist": return `${it.specialistType} (${it.turns}t)`;
        case "peace": return "peace";
        case "openBorders": return "open borders";
        case "pact": return `${it.tier.replace("_", " ")} (${it.turns}t)`;
        case "declareWarOn": return `war on #${it.civId}`;
      }
    })
    .join(", ");
}

/** Append an entry to the world's diplomatic history. */
function recordTrade(
  state: GameState,
  fromId: number,
  toId: number,
  kind: TradeRecordKind,
  give: DealItem[],
  want: DealItem[],
  note: string,
): void {
  const rec: TradeRecord = { id: state.nextEntityId++, turn: state.turn, fromId, toId, kind, give, want, note };
  state.tradeHistory.push(rec);
  if (state.tradeHistory.length > 400) state.tradeHistory.splice(0, state.tradeHistory.length - 400);
}

// ---- relations & attitudes ----------------------------------------------

export function relationBetween(state: GameState, a: number, b: number): Relation | undefined {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  return state.relations.find((r) => r.a === lo && r.b === hi);
}

export function haveMet(state: GameState, a: number, b: number): boolean {
  return !!relationBetween(state, a, b);
}

/**
 * If (col,row) lies in the territory of a met civ the player is at peace with and
 * has NO open borders, returns that civ's id — entering it would mean war.
 * Returns null for own/unowned/at-war/open-border/barbarian territory.
 */
export function foreignTerritoryOwner(state: GameState, playerId: number, col: number, row: number): number | null {
  const tile = getTile(state.map, col, row);
  if (!tile || tile.ownerCityId === undefined) return null;
  const city = state.cities.get(tile.ownerCityId);
  if (!city || city.ownerId === playerId) return null;
  const me = playerById(state, playerId);
  const owner = playerById(state, city.ownerId);
  if (!me || !owner || owner.isBarbarian) return null;
  if (!me.met.includes(city.ownerId)) return null; // unmet: no diplomacy restriction
  if (me.atWar.includes(city.ownerId)) return null; // at war: enter freely
  if (relationBetween(state, playerId, city.ownerId)?.openBorders) return null;
  return city.ownerId;
}
export function atWar(state: GameState, a: number, b: number): boolean {
  return relationBetween(state, a, b)?.status === "war";
}
export function atPeace(state: GameState, a: number, b: number): boolean {
  return relationBetween(state, a, b)?.status === "peace";
}

function attitudeRec(state: GameState, from: number, to: number): Attitude {
  let at = state.attitudes.find((x) => x.from === from && x.to === to);
  if (!at) {
    at = { from, to, modifiers: [] };
    state.attitudes.push(at);
  }
  return at;
}

export function attitudeScore(state: GameState, from: number, to: number): number {
  const at = state.attitudes.find((x) => x.from === from && x.to === to);
  let s = at ? at.modifiers.reduce((acc, m) => acc + m.value, 0) : 0;
  s -= reputationOf(state, to); // a warmonger reputation sours everyone
  return Math.max(-100, Math.min(100, s));
}

export function attitudeLabel(score: number): string {
  if (score <= -60) return "Hostile";
  if (score <= -25) return "Unfriendly";
  if (score < 10) return "Wary";
  if (score < 40) return "Neutral";
  if (score < 70) return "Friendly";
  return "Allied";
}

/** Add an opinion modifier (collapsing a prior modifier with the same reason). */
function addModifier(state: GameState, from: number, to: number, reason: string, value: number, ttl?: number): void {
  const at = attitudeRec(state, from, to);
  const existing = at.modifiers.find((m) => m.reason === reason);
  const expiresTurn = ttl ? state.turn + ttl : undefined;
  if (existing) {
    existing.value = value;
    existing.expiresTurn = expiresTurn;
  } else {
    at.modifiers.push({ reason, value, expiresTurn });
  }
}

export function reputationOf(state: GameState, id: number): number {
  return state.reputation[id] ?? 0;
}
function addReputation(state: GameState, id: number, amount: number): void {
  state.reputation[id] = Math.max(0, (state.reputation[id] ?? 0) + amount);
}

// ---- first contact -------------------------------------------------------

/** Establish first contact between two major civs (idempotent). */
export function ensureContact(state: GameState, aId: number, bId: number): boolean {
  if (aId === bId) return false;
  const A = playerById(state, aId);
  const B = playerById(state, bId);
  if (!A || !B || A.isBarbarian || B.isBarbarian) return false;
  if (relationBetween(state, aId, bId)) return false; // already met
  const lo = Math.min(aId, bId);
  const hi = Math.max(aId, bId);
  state.relations.push({
    a: lo, b: hi, status: "peace", metTurn: state.turn, lastStatusChangeTurn: state.turn,
    openBorders: false, pact: "none", deals: [],
  });
  if (!A.met.includes(bId)) A.met.push(bId);
  if (!B.met.includes(aId)) B.met.push(aId);
  attitudeRec(state, aId, bId);
  attitudeRec(state, bId, aId);
  if (A.isHuman) state.contactQueue.push({ youId: aId, otherId: bId, isPlayerCiv: B.isHuman });
  if (B.isHuman) state.contactQueue.push({ youId: bId, otherId: aId, isPlayerCiv: A.isHuman });
  const an = civName(A), bn = civName(B);
  log(state, `${an} and ${bn} have made contact.`, { targetIds: [aId, bId] });
  return true;
}

/** Detect contacts for a player from the tiles it can currently see. */
export function detectContacts(state: GameState, playerId: number, visible: Set<string>): void {
  const p = playerById(state, playerId);
  if (!p || p.isBarbarian) return;
  for (const u of state.units.values()) {
    if (u.ownerId === playerId) continue;
    const o = playerById(state, u.ownerId);
    if (!o || o.isBarbarian) continue;
    if (visible.has(`${u.col},${u.row}`)) ensureContact(state, playerId, u.ownerId);
  }
  for (const c of state.cities.values()) {
    if (c.ownerId === playerId) continue;
    const o = playerById(state, c.ownerId);
    if (!o || o.isBarbarian) continue;
    if (visible.has(`${c.col},${c.row}`)) ensureContact(state, playerId, c.ownerId);
  }
}

function civName(p: Player): string {
  return getCiv(p.civId)?.name ?? p.name;
}

// ---- war & peace ---------------------------------------------------------

function setWar(state: GameState, r: Relation): void {
  r.status = "war";
  r.lastStatusChangeTurn = state.turn;
  r.openBorders = false;
  r.pact = "none";
  r.pactUntilTurn = undefined;
  r.deals = [];
  const A = playerById(state, r.a);
  const B = playerById(state, r.b);
  if (A && !A.atWar.includes(r.b)) A.atWar.push(r.b);
  if (B && !B.atWar.includes(r.a)) B.atWar.push(r.a);
}
function setPeace(state: GameState, r: Relation): void {
  r.status = "peace";
  r.lastStatusChangeTurn = state.turn;
  r.warAllowedTurn = state.turn + PEACE_COOLDOWN;
  const A = playerById(state, r.a);
  const B = playerById(state, r.b);
  if (A) A.atWar = A.atWar.filter((id) => id !== r.b);
  if (B) B.atWar = B.atWar.filter((id) => id !== r.a);
}

export function declareWar(state: GameState, aId: number, targetId: number): DiploResult {
  if (aId === targetId) return fail("you cannot declare war on yourself");
  const r = relationBetween(state, aId, targetId);
  if (!r) return fail("you have not met them");
  if (r.status === "war") return fail("you are already at war");
  if (r.warAllowedTurn !== undefined && state.turn < r.warAllowedTurn) {
    return fail(`a peace treaty holds until turn ${r.warAllowedTurn}`);
  }
  const denounced = hasModifier(state, aId, targetId, "__denounced");
  setWar(state, r);
  addReputation(state, aId, denounced ? WARMONGER_DENOUNCED : WARMONGER_SURPRISE);
  addModifier(state, targetId, aId, "you declared war on us", -45);
  const A = playerById(state, aId)!;
  const T = playerById(state, targetId)!;
  recordTrade(state, aId, targetId, "war", [], [], `${civName(A)} declared war on ${civName(T)}`);
  log(state, `${civName(A)} declared war on ${civName(T)}!`, { actorId: aId, targetIds: [aId, targetId] });
  return ok;
}

export function makePeace(state: GameState, aId: number, targetId: number): DiploResult {
  const r = relationBetween(state, aId, targetId);
  if (!r || r.status !== "war") return fail("you are not at war with them");
  const target = playerById(state, targetId);
  if (target?.isHuman) {
    return createProposal(state, aId, targetId, [{ kind: "peace" }], []);
  }
  if (!aiAcceptsPeace(state, targetId, aId)) return fail("they refuse to make peace");
  setPeace(state, r);
  addModifier(state, targetId, aId, "we made peace", 8, 40);
  recordTrade(state, aId, targetId, "peace", [], [], `${civName(playerById(state, aId)!)} and ${civName(playerById(state, targetId)!)} made peace`);
  log(state, `${civName(playerById(state, aId)!)} and ${civName(playerById(state, targetId)!)} made peace.`, {
    actorId: aId,
    targetIds: [aId, targetId],
  });
  return ok;
}

// ---- soft actions --------------------------------------------------------

function hasModifier(state: GameState, from: number, to: number, reason: string): boolean {
  const at = state.attitudes.find((x) => x.from === from && x.to === to);
  return !!at?.modifiers.some((m) => m.reason === reason);
}

function removeModifier(state: GameState, from: number, to: number, reason: string): void {
  const at = state.attitudes.find((x) => x.from === from && x.to === to);
  if (at) at.modifiers = at.modifiers.filter((m) => m.reason !== reason);
}

export function denounce(state: GameState, aId: number, targetId: number): DiploResult {
  const r = relationBetween(state, aId, targetId);
  if (!r) return fail("you have not met them");
  addModifier(state, targetId, aId, "you denounced us", -25, 40);
  addModifier(state, aId, targetId, "__denounced", 0, 15); // marker: a later war is not a surprise
  recordTrade(state, aId, targetId, "denounce", [], [], `${civName(playerById(state, aId)!)} denounced ${civName(playerById(state, targetId)!)}`);
  log(state, `${civName(playerById(state, aId)!)} denounced ${civName(playerById(state, targetId)!)}.`, {
    actorId: aId,
    targetIds: [aId, targetId],
  });
  return ok;
}

function canPayItems(state: GameState, payerId: number, items: DealItem[]): boolean {
  const p = playerById(state, payerId);
  if (!p) return false;
  let gold = p.gold;
  for (const it of items) {
    if (it.kind === "gold") {
      gold -= it.amount;
      if (gold < 0) return false;
    } else if (it.kind === "resource") {
      const def = RESOURCE_DEFS[it.id as ResourceId];
      if (def?.type === "luxury") {
        if (!tradeableLuxuries(state, payerId).includes(it.id)) return false;
      } else if ((p.resources[it.id] ?? 0) <= 0) return false;
    } else if (it.kind === "specialist") {
      if (!hasSpecialistType(state, payerId, it.specialistType)) return false;
    } else if (it.kind === "declareWarOn") {
      if (!relationBetween(state, payerId, it.civId)) return false;
    }
  }
  return true;
}

function hasSpecialistType(state: GameState, playerId: number, type: string): boolean {
  return citiesOf(state, playerId).some((c) => c.specialists.some((s) => s.type === type));
}

function capitalOf(state: GameState, playerId: number): City | undefined {
  const cities = citiesOf(state, playerId);
  return cities.find((c) => c.isCapital) ?? cities[0];
}

export function gift(state: GameState, aId: number, targetId: number, goldAmt: number, resourceId?: string): DiploResult {
  if (!relationBetween(state, aId, targetId)) return fail("you have not met them");
  const A = playerById(state, aId)!;
  const T = playerById(state, targetId)!;
  if (goldAmt > 0) {
    if (A.gold < goldAmt) return fail("not enough gold");
    A.gold -= goldAmt;
    T.gold += goldAmt;
  }
  if (resourceId) {
    if ((A.resources[resourceId] ?? 0) <= 0) return fail("you do not have that resource");
    A.resources[resourceId] = (A.resources[resourceId] ?? 0) - 1;
    T.resources[resourceId] = (T.resources[resourceId] ?? 0) + 1;
  }
  if (goldAmt <= 0 && !resourceId) return fail("nothing to give");
  const value = Math.min(20, 6 + Math.floor(goldAmt / 25) + (resourceId ? 6 : 0));
  addModifier(state, targetId, aId, "your generous gifts", value, 30);
  const giftItems: DealItem[] = [];
  if (goldAmt > 0) giftItems.push({ kind: "gold", amount: goldAmt });
  if (resourceId) giftItems.push({ kind: "resource", id: resourceId, turns: 0 });
  recordTrade(state, aId, targetId, "gift", giftItems, [], `${civName(A)} gifted ${describeDealItems(giftItems)} to ${civName(T)}`);
  log(state, `${civName(A)} sent a gift to ${civName(T)}.`, { actorId: aId, targetIds: [aId, targetId] });
  return ok;
}

/**
 * Demand tribute under threat. Creates a coercive proposal: the target "gives"
 * gold/resource for nothing. The recipient (AI evaluated immediately by fear;
 * human on their turn) accepts only when they judge the demander overwhelmingly
 * stronger. Refusal sours the relationship; against a proud, aggressive AI a
 * demand may even provoke war.
 */
export function demandTribute(state: GameState, aId: number, targetId: number, goldAmt: number, resourceId?: string): DiploResult {
  if (!relationBetween(state, aId, targetId)) return fail("you have not met them");
  const want: DealItem[] = [];
  if (goldAmt > 0) want.push({ kind: "gold", amount: goldAmt });
  if (resourceId) want.push({ kind: "resource", id: resourceId, turns: 0 });
  if (want.length === 0) return fail("demand something");
  return createProposal(state, aId, targetId, [], want, true);
}

// ---- deals ---------------------------------------------------------------

const PACT_RANK: Record<PactTier, number> = { none: 0, non_aggression: 1, defensive: 2, alliance: 3 };

/**
 * If any item in `items` would have no effect because the relation already
 * provides it (open borders already granted, or a pact of equal/higher tier
 * already in force), return a player-facing reason; otherwise undefined.
 */
function redundantItem(rel: Relation, items: DealItem[]): string | undefined {
  for (const it of items) {
    if (it.kind === "openBorders" && rel.openBorders) return "you already have open borders";
    if (it.kind === "pact" && PACT_RANK[rel.pact] >= PACT_RANK[it.tier]) {
      return `you already have a ${rel.pact.replace("_", " ")} in force`;
    }
  }
  return undefined;
}

/**
 * Create a proposal and (against an AI recipient) resolve the AI's response
 * immediately so the proposer gets instant feedback. The proposal carries a
 * lifecycle status:
 *  - `pending`   — awaiting a human recipient's response;
 *  - `accepted`  — recipient agreed; a human proposer must then `finalizeDeal`
 *                  (an AI proposer / coercive demand applies at once);
 *  - `declined`  — refused, with a one-line reason the proposer can read.
 */
export function createProposal(
  state: GameState,
  fromId: number,
  toId: number,
  give: DealItem[],
  want: DealItem[],
  coercive = false,
): DiploResult {
  if (fromId === toId) return fail("you cannot deal with yourself");
  const rel = relationBetween(state, fromId, toId);
  if (!rel) return fail("you have not met them");
  if (!canPayItems(state, fromId, give)) return fail("you cannot provide that");
  if (give.length === 0 && want.length === 0) return fail("the offer is empty");
  const redundant = redundantItem(rel, [...give, ...want]);
  if (redundant) return fail(redundant);

  const prop: Proposal = {
    id: state.nextEntityId++,
    fromId,
    toId,
    give,
    want,
    createdTurn: state.turn,
    status: "pending",
    coercive: coercive || undefined,
  };
  state.diploProposals.push(prop);

  // A coercive demand is an affront in itself: it sours the target's opinion of
  // the demander whether or not it is ultimately met.
  if (coercive) {
    const pers = personalityOf(state, toId);
    addModifier(state, toId, fromId, "you made demands of us", -10 - Math.round(pers.aggression * 10), 40);
  }

  const recipient = playerById(state, toId);
  if (recipient && !recipient.isHuman && !recipient.isBarbarian) {
    // Resolve the AI's stance right away.
    const decision = coercive
      ? aiDecideDemand(state, toId, fromId, want)
      : aiDecideOffer(state, toId, fromId, give, want);
    prop.reason = decision.reason;
    prop.status = decision.accept ? "accepted" : "declined";
    if (decision.accept) {
      const proposerIsAI = !playerById(state, fromId)?.isHuman;
      // Coercive demands and AI-initiated deals conclude without a finalize step.
      if (coercive || proposerIsAI) settleProposal(state, prop);
    }
  }
  return ok;
}

/** Propose a (non-coercive) two-sided deal. */
export function proposeDeal(state: GameState, fromId: number, targetId: number, give: DealItem[], want: DealItem[]): DiploResult {
  return createProposal(state, fromId, targetId, give, want, false);
}

/**
 * The recipient (`toId`) responds to a still-pending proposal. Accepting a deal
 * proposed by an AI applies it immediately; accepting one proposed by a human
 * marks it `accepted` and waits for that human to `finalizeDeal`.
 */
export function respondProposal(state: GameState, playerId: number, proposalId: number, accept: boolean): DiploResult {
  const prop = state.diploProposals.find((p) => p.id === proposalId && p.toId === playerId && p.status === "pending");
  if (!prop) return fail("no such proposal");
  if (!accept) {
    prop.status = "declined";
    prop.reason = "You rejected the offer.";
    // A refused coercive demand lets an AI demander escalate to war later.
    if (prop.coercive && !playerById(state, prop.fromId)?.isHuman) {
      addModifier(state, prop.fromId, playerId, "__demandRefused", 0, 8);
    }
    // Nothing for an AI proposer to see → drop it outright.
    if (!playerById(state, prop.fromId)?.isHuman) {
      state.diploProposals = state.diploProposals.filter((p) => p.id !== prop.id);
    }
    return ok;
  }
  if (!canPayItems(state, prop.fromId, prop.give) || !canPayItems(state, prop.toId, prop.want)) {
    return fail("the deal can no longer be honoured");
  }
  prop.status = "accepted";
  // A human proposer must confirm; an AI proposer concludes at once.
  if (!playerById(state, prop.fromId)?.isHuman) return settleProposal(state, prop);
  return ok;
}

/**
 * The proposer (`fromId`) finalizes an accepted proposal (`confirm` true) or
 * dismisses a resolved one (`confirm` false). This is the explicit second
 * confirmation a human initiator makes once the other side has agreed.
 */
export function finalizeDeal(state: GameState, playerId: number, proposalId: number, confirm: boolean): DiploResult {
  const prop = state.diploProposals.find((p) => p.id === proposalId && p.fromId === playerId);
  if (!prop) return fail("no such proposal");
  if (!confirm) {
    state.diploProposals = state.diploProposals.filter((p) => p.id !== prop.id);
    return ok;
  }
  if (prop.status !== "accepted") return fail("they have not accepted this offer");
  return settleProposal(state, prop);
}

/** Apply an accepted proposal's exchange, record it, and remove the proposal. */
function settleProposal(state: GameState, prop: Proposal): DiploResult {
  if (!canPayItems(state, prop.fromId, prop.give) || !canPayItems(state, prop.toId, prop.want)) {
    state.diploProposals = state.diploProposals.filter((p) => p.id !== prop.id);
    return fail("the deal can no longer be honoured");
  }
  applyExchange(state, prop.fromId, prop.toId, prop.give, prop.want);
  const from = playerById(state, prop.fromId)!;
  const to = playerById(state, prop.toId)!;
  if (prop.coercive) {
    addModifier(state, prop.toId, prop.fromId, "you bullied us", -18, 50);
    removeModifier(state, prop.fromId, prop.toId, "__demandRefused"); // they complied
    recordTrade(state, prop.fromId, prop.toId, "tribute", [], prop.want,
      `${civName(to)} paid tribute (${describeDealItems(prop.want)}) to ${civName(from)}`);
    log(state, `${civName(to)} paid tribute to ${civName(from)}.`, { actorId: prop.fromId, targetIds: [prop.fromId, prop.toId] });
  } else {
    recordTrade(state, prop.fromId, prop.toId, "deal", prop.give, prop.want,
      `${civName(from)} ⇄ ${civName(to)}: gave ${describeDealItems(prop.give)}, got ${describeDealItems(prop.want)}`);
    log(state, `${civName(from)} struck a deal with ${civName(to)}.`, { actorId: prop.fromId, targetIds: [prop.fromId, prop.toId] });
  }
  state.diploProposals = state.diploProposals.filter((p) => p.id !== prop.id);
  return ok;
}

/** fromId pays `give` to toId; toId pays `want` to fromId. */
function applyExchange(state: GameState, fromId: number, toId: number, give: DealItem[], want: DealItem[]): void {
  for (const it of give) applyItem(state, fromId, toId, it);
  for (const it of want) applyItem(state, toId, fromId, it);
  recomputeImportedLuxuries(state);
}

/** Move a craftsman of `type` from the lender to the borrower's capital. */
function lendSpecialist(state: GameState, fromId: number, toId: number, type: string, untilTurn: number) {
  const cap = capitalOf(state, toId);
  if (!cap) return undefined;
  for (const c of citiesOf(state, fromId)) {
    const idx = c.specialists.findIndex((s) => s.type === type);
    if (idx >= 0) {
      const [spec] = c.specialists.splice(idx, 1);
      cap.specialists.push(spec!);
      log(state, `${civName(playerById(state, fromId)!)} lent a ${SPECIALIST_DEFS[type as SpecialistId]?.name ?? "specialist"} to ${civName(playerById(state, toId)!)}.`, {
        actorId: fromId,
        targetIds: [fromId, toId],
      });
      return { fromId, item: { kind: "specialist", specialistType: type, turns: untilTurn - state.turn } as DealItem, untilTurn, specialistId: spec!.id };
    }
  }
  return undefined;
}

/** Return a lent craftsman to its lender's capital when the loan ends. */
function returnSpecialist(state: GameState, ob: { fromId: number; specialistId?: number }): void {
  if (ob.specialistId === undefined) return;
  for (const c of state.cities.values()) {
    const idx = c.specialists.findIndex((s) => s.id === ob.specialistId);
    if (idx >= 0) {
      const [spec] = c.specialists.splice(idx, 1);
      const home = capitalOf(state, ob.fromId);
      if (home && spec) home.specialists.push(spec);
      return;
    }
  }
}

/** Rebuild each player's set of luxuries imported through active deals. */
function recomputeImportedLuxuries(state: GameState): void {
  for (const p of state.players) p.importedLuxuries = [];
  for (const r of state.relations) {
    for (const d of r.deals) {
      if (d.item.kind !== "resource") continue;
      if (RESOURCE_DEFS[d.item.id as ResourceId]?.type !== "luxury") continue;
      const receiver = d.fromId === r.a ? r.b : r.a;
      const p = playerById(state, receiver);
      if (p && !p.importedLuxuries.includes(d.item.id)) p.importedLuxuries.push(d.item.id);
    }
  }
}

function applyItem(state: GameState, payerId: number, receiverId: number, item: DealItem): void {
  const r = relationBetween(state, payerId, receiverId);
  const payer = playerById(state, payerId);
  const receiver = playerById(state, receiverId);
  if (!payer || !receiver) return;
  switch (item.kind) {
    case "gold":
      payer.gold -= item.amount;
      receiver.gold += item.amount;
      break;
    case "goldPerTurn":
    case "resource":
      if (r) r.deals.push({ fromId: payerId, item, untilTurn: state.turn + item.turns });
      break;
    case "specialist": {
      if (!r) break;
      const ob = lendSpecialist(state, payerId, receiverId, item.specialistType, state.turn + item.turns);
      if (ob) r.deals.push(ob);
      break;
    }
    case "peace":
      if (r && r.status === "war") setPeace(state, r);
      break;
    case "openBorders":
      if (r) r.openBorders = true;
      break;
    case "pact":
      if (r) {
        r.pact = item.tier;
        r.pactUntilTurn = state.turn + item.turns;
      }
      break;
    case "declareWarOn":
      declareWar(state, payerId, item.civId);
      break;
  }
}

// ---- per-turn tick -------------------------------------------------------

/** Pay timed obligations, expire deals/pacts/modifiers, decay reputation. */
export function diplomacyTick(state: GameState): void {
  for (const r of state.relations) {
    // pay ongoing obligations
    for (const d of r.deals) {
      const other = d.fromId === r.a ? r.b : r.a;
      if (d.item.kind === "goldPerTurn") {
        const from = playerById(state, d.fromId);
        const to = playerById(state, other);
        if (from && to) {
          const amt = Math.min(from.gold, d.item.amount);
          from.gold -= amt;
          to.gold += amt;
        }
      } else if (d.item.kind === "resource" && RESOURCE_DEFS[d.item.id as ResourceId]?.type !== "luxury") {
        // Strategic resources stockpile; luxuries instead grant amenities (below).
        const from = playerById(state, d.fromId);
        const to = playerById(state, other);
        if (from && to && (from.resources[d.item.id] ?? 0) > 0) {
          from.resources[d.item.id] = (from.resources[d.item.id] ?? 0) - 1;
          to.resources[d.item.id] = (to.resources[d.item.id] ?? 0) + 1;
        }
      }
    }
    // Return lent specialists whose loan has expired, then drop expired deals.
    for (const d of r.deals) {
      if (state.turn >= d.untilTurn && d.item.kind === "specialist") returnSpecialist(state, d);
    }
    r.deals = r.deals.filter((d) => state.turn < d.untilTurn);
    if (r.pactUntilTurn !== undefined && state.turn >= r.pactUntilTurn) {
      r.pact = "none";
      r.pactUntilTurn = undefined;
    }
  }
  recomputeImportedLuxuries(state);
  // Expire stale proposals: pending offers lapse, resolved ones linger briefly.
  state.diploProposals = state.diploProposals.filter((p) => {
    const ttl = p.status === "pending" ? PROPOSAL_PENDING_TTL : PROPOSAL_RESOLVED_TTL;
    return state.turn - p.createdTurn < ttl;
  });
  for (const at of state.attitudes) {
    at.modifiers = at.modifiers.filter((m) => m.expiresTurn === undefined || state.turn < m.expiresTurn);
  }
  for (const id of Object.keys(state.reputation)) {
    const n = Number(id);
    state.reputation[n] = Math.max(0, (state.reputation[n] ?? 0) - 1);
  }
  // Bordering civs accumulate mild friction, so neighbours become rivals.
  for (const r of state.relations) {
    if (r.status !== "peace") continue;
    if (nearestCityDistance(state, r.a, r.b) <= 6) {
      bumpTension(state, r.a, r.b);
      bumpTension(state, r.b, r.a);
    }
  }
}

function bumpTension(state: GameState, from: number, to: number): void {
  const at = attitudeRec(state, from, to);
  let m = at.modifiers.find((x) => x.reason === "border friction");
  if (!m) {
    m = { reason: "border friction", value: 0 };
    at.modifiers.push(m);
  }
  m.value = Math.max(-22, m.value - 1);
}

function nearestCityDistance(state: GameState, a: number, b: number): number {
  let best = Infinity;
  for (const ca of citiesOf(state, a)) {
    for (const cb of citiesOf(state, b)) {
      const d = axialDistance(offsetToAxial({ col: ca.col, row: ca.row }), offsetToAxial({ col: cb.col, row: cb.row }));
      if (d < best) best = d;
    }
  }
  return best;
}

// ---- AI ------------------------------------------------------------------

export function militaryPower(state: GameState, playerId: number): number {
  let p = 1;
  for (const u of unitsOf(state, playerId)) {
    if (isMilitary(u.type)) p += UNIT_DEFS[u.type].strength * (1 + 0.05 * (u.level - 1)) * (u.hp / 100);
  }
  for (const c of citiesOf(state, playerId)) p += 4 + c.population;
  return p;
}

/** Relative strength of `aId` versus `bId` (>1 means `aId` is stronger). */
export function powerRatio(state: GameState, aId: number, bId: number): number {
  return militaryPower(state, aId) / Math.max(1, militaryPower(state, bId));
}

/**
 * Whether the AI is willing to make peace, shaped by its temperament. Forgiving
 * civs sue sooner and at a higher attitude floor; bold/aggressive ones hold out
 * unless they are clearly losing.
 */
function aiAcceptsPeace(state: GameState, aiId: number, otherId: number): boolean {
  const r = relationBetween(state, aiId, otherId);
  if (!r) return false;
  const p = personalityOf(state, aiId);
  const warDuration = state.turn - r.lastStatusChangeTurn;
  const losing = powerRatio(state, aiId, otherId) < 0.9;
  const weary = warDuration >= Math.round(16 - p.forgiveness * 8 - (losing ? 4 : 0));
  const score = attitudeScore(state, aiId, otherId);
  // A bold AI that is winning would rather press the war.
  if (!losing && p.boldness > 0.7 && !weary) return score > 30;
  return losing || weary || score > -40 + p.forgiveness * 40 - p.aggression * 15;
}

function atWarWithAnyone(state: GameState, aiId: number): boolean {
  return state.relations.some((r) => (r.a === aiId || r.b === aiId) && r.status === "war");
}

/**
 * Rough gold-value the AI places on a deal item it would RECEIVE. Soft, mostly-
 * symbolic concessions (open borders, a non-aggression pact) are worth little
 * unless the AI is very friendly or genuinely fears the other civ — so the AI
 * never pays exorbitant sums for them.
 */
function itemValue(state: GameState, aiId: number, otherId: number, item: DealItem): number {
  switch (item.kind) {
    case "gold": return item.amount;
    case "goldPerTurn": return item.amount * item.turns * 0.8;
    case "resource": return item.turns * 6;
    case "specialist": return item.turns * 4;
    case "peace": return atWar(state, aiId, otherId) ? 80 : 0;
    case "openBorders": {
      const att = attitudeScore(state, aiId, otherId);
      // Wanted only when very friendly, or when at war and needing to move armies.
      const friendly = att >= 60 ? 6 + (att - 60) * 0.25 : att >= 30 ? 2 : -4;
      return friendly + (atWarWithAnyone(state, aiId) ? 4 : 0);
    }
    case "pact": {
      const att = attitudeScore(state, aiId, otherId);
      if (item.tier === "alliance" && att < 40) return -999; // won't ally a non-friend
      if (item.tier === "defensive" && att < 10) return -999;
      const base = item.tier === "alliance" ? 25 : item.tier === "defensive" ? 14 : 6;
      // A non-aggression pact is chiefly worth buying when you fear the other civ.
      const fear = item.tier === "non_aggression" ? Math.max(0, powerRatio(state, otherId, aiId) - 1) * 18 : 0;
      return base + att * 0.15 + fear;
    }
    case "declareWarOn": return -40; // costly favour
  }
}

/** Total gold an item set asks the AI to part with (lump + full term of per-turn). */
function goldOutlay(items: DealItem[]): number {
  return items.reduce((s, it) =>
    s + (it.kind === "gold" ? it.amount : it.kind === "goldPerTurn" ? it.amount * it.turns : 0), 0);
}

/** Evaluate a (non-coercive) offer from the AI's perspective. */
function aiDecideOffer(
  state: GameState,
  aiId: number,
  fromId: number,
  give: DealItem[], // what the proposer gives the AI
  want: DealItem[], // what the AI must give up
): { accept: boolean; reason: string } {
  // A relationship-defining item the AI flatly refuses (e.g. ally a non-friend).
  if (give.some((it) => it.kind === "pact" && itemValue(state, aiId, fromId, it) < -900)) {
    return { accept: false, reason: "We will not enter such a pact with you." };
  }
  // The AI cannot give resources/specialists it does not possess.
  if (!canPayItems(state, aiId, want)) {
    return { accept: false, reason: "We cannot provide what you ask." };
  }
  const ai = playerById(state, aiId)!;
  const p = personalityOf(state, aiId);
  // It will drain the treasury only to buy peace or when it genuinely fears the
  // other civ; otherwise it won't spend more than a slice of its gold on soft
  // concessions — and never gold it doesn't have.
  const goldAsked = goldOutlay(want);
  const buyingSafety = give.some((it) => it.kind === "peace") || powerRatio(state, fromId, aiId) > 1.4;
  const spendCap = buyingSafety ? ai.gold : Math.floor(ai.gold * 0.25);
  if (goldAsked > spendCap) {
    return { accept: false, reason: ai.gold < goldAsked ? "We cannot afford that." : "We will not part with so much gold." };
  }
  const gain = give.reduce((s, it) => s + itemValue(state, aiId, fromId, it), 0);
  // Greedy/proud civs overvalue what they part with → drive a harder bargain.
  const costMult = 1 + (p.greed - 0.5) * 0.4 + Math.max(0, -attitudeScore(state, aiId, fromId)) / 200;
  const cost = want.reduce((s, it) => s + itemValue(state, aiId, fromId, it), 0) * costMult;
  if (gain >= cost) {
    return { accept: true, reason: gain > cost * 1.3 ? "A most generous offer — agreed." : "These terms are acceptable." };
  }
  return { accept: false, reason: "Your offer is not worth what you ask." };
}

/**
 * Evaluate a coercive tribute demand. The AI yields ONLY when it judges the
 * demander to hold an overwhelming military advantage, scaled by its boldness —
 * proud civs demand to be even more outmatched, and a strong, aggressive AI may
 * answer a demand with war instead.
 */
function aiDecideDemand(
  state: GameState,
  aiId: number,
  fromId: number,
  want: DealItem[],
): { accept: boolean; reason: string } {
  const p = personalityOf(state, aiId);
  const ratio = powerRatio(state, fromId, aiId); // how much stronger the demander is
  const required = 2.0 + p.boldness * 1.5; // 2.0 (timid) … 3.5 (proud) times our strength
  const canPay = canPayItems(state, aiId, want);
  if (ratio >= required && canPay) {
    return { accept: true, reason: "Your armies leave us no choice. We yield." };
  }
  // Remember that the demander was rebuffed, so it can escalate to war later.
  addModifier(state, fromId, aiId, "__demandRefused", 0, 8);
  // (The attitude penalty for making a demand is applied in createProposal, so
  // it lands whether the demand is met or refused.) A proud, strong AI may even
  // answer the affront with war.
  if (!canPay) return { accept: false, reason: "We have nothing to give even if we wished to." };
  const r = relationBetween(state, aiId, fromId);
  const canWar = r && r.status === "peace" && (r.warAllowedTurn === undefined || state.turn >= r.warAllowedTurn) && r.pact === "none";
  if (canWar && ratio < 1.0 && p.aggression > 0.7) {
    declareWar(state, aiId, fromId);
    return { accept: false, reason: "You dare make demands of us? This means war!" };
  }
  return { accept: false, reason: ratio >= 1.3 ? "We will not be bullied — yet." : "You are in no position to make demands." };
}

/** Distinct specialist types currently trained in a player's cities. */
function specialistTypesOf(state: GameState, playerId: number): string[] {
  const set = new Set<string>();
  for (const c of citiesOf(state, playerId)) for (const s of c.specialists) set.add(s.type);
  return [...set];
}

/** Luxuries a player effectively enjoys (owned tiles + active imports). */
function ownedLuxurySet(state: GameState, playerId: number): Set<string> {
  const set = new Set<string>(empireLuxuryTypes(state, playerId));
  const p = playerById(state, playerId);
  for (const id of p?.importedLuxuries ?? []) set.add(id);
  return set;
}

/**
 * An AI offers the player (or another civ) a fair trade for something it needs:
 * a luxury it lacks, or — when it has public works under way — a specialist to
 * build them. Payment reflects its means: a wealthy civ pays gold (per turn),
 * while a gold-poor civ hoards its coin and prefers to barter a spare luxury.
 * Returns true if an offer was sent.
 */
export function aiInitiateTrade(state: GameState, aiId: number, otherId: number): boolean {
  const ai = playerById(state, aiId);
  const other = playerById(state, otherId);
  if (!ai || !other || other.isBarbarian) return false;
  // Don't pile offers onto an existing pending proposal between the two.
  if (state.diploProposals.some((p) => p.fromId === aiId && p.toId === otherId && p.status === "pending")) return false;

  const poor = ai.gold < 80; // short on gold → values coin highly, prefers barter
  // A spare luxury the AI owns that the other side does NOT — appealing barter.
  const theirLux = ownedLuxurySet(state, otherId);
  const spareLux = tradeableLuxuries(state, aiId).find((l) => !theirLux.has(l));

  // --- need 1: a luxury the AI lacks that the other side can spare ---
  const myLux = ownedLuxurySet(state, aiId);
  const wantLux = tradeableLuxuries(state, otherId).find((l) => !myLux.has(l) && l !== spareLux);
  if (wantLux) {
    const want: DealItem[] = [{ kind: "resource", id: wantLux, turns: 20 }];
    let give: DealItem[];
    if (poor && spareLux) give = [{ kind: "resource", id: spareLux, turns: 20 }]; // barter goods-for-goods
    else if (poor) give = [{ kind: "goldPerTurn", amount: 2, turns: 15 }]; // scrape together a little coin
    else give = [{ kind: "goldPerTurn", amount: 4, turns: 20 }]; // buy it outright
    return proposeDeal(state, aiId, otherId, give, want).ok;
  }

  // --- need 2: a specialist to advance construction (it has works under way) ---
  const building = state.works.some((w) => w.ownerId === aiId);
  if (building) {
    const mySpec = new Set(specialistTypesOf(state, aiId));
    const wantSpec = specialistTypesOf(state, otherId).find((t) => !mySpec.has(t));
    if (wantSpec) {
      const want: DealItem[] = [{ kind: "specialist", specialistType: wantSpec, turns: 15 }];
      let give: DealItem[];
      if (poor && spareLux) give = [{ kind: "resource", id: spareLux, turns: 15 }];
      else if (poor) give = [{ kind: "goldPerTurn", amount: 3, turns: 12 }];
      else give = [{ kind: "gold", amount: 60 }]; // a hiring fee it can afford
      if (!canPayItems(state, aiId, give)) return false;
      return proposeDeal(state, aiId, otherId, give, want).ok;
    }
  }
  return false;
}

/** An AI civ's diplomatic decisions for its turn, driven by its personality. */
export function aiConsiderDiplomacy(state: GameState, aiId: number): void {
  const me = playerById(state, aiId);
  if (!me || me.isHuman || me.isBarbarian) return;
  const p = personalityOf(state, aiId);
  for (const otherId of [...me.met]) {
    const r = relationBetween(state, aiId, otherId);
    if (!r) continue;
    const other = playerById(state, otherId);
    if (!other || other.isBarbarian) continue;
    const score = attitudeScore(state, aiId, otherId);
    const ratio = powerRatio(state, aiId, otherId);

    if (r.status === "war") {
      // Sue for peace when willing (war-weary, losing, or no longer hostile).
      if (aiAcceptsPeace(state, aiId, otherId)) makePeace(state, aiId, otherId);
      continue;
    }

    // ---- at peace ----
    const canWar = r.pact === "none" && (r.warAllowedTurn === undefined || state.turn >= r.warAllowedTurn);
    // Aggressive civs need only a slim edge and tolerate a higher attitude; the
    // peaceful only strike a civ they despise and clearly outmatch. An enemy
    // already mired in another war is a tempting, cheaper target.
    const opportunistic = other.atWar.some((id) => id !== aiId && !playerById(state, id)?.isBarbarian);
    const requiredRatio = (1.6 - p.aggression * 0.7) - (opportunistic ? 0.3 : 0);
    const scoreThreshold = -55 + p.aggression * 45;
    const despises = ratio >= requiredRatio && score <= scoreThreshold;

    // Don't act militarily while a demand is still on the table — await the answer.
    const demandPending = state.diploProposals.some(
      (pr) => pr.fromId === aiId && pr.toId === otherId && pr.coercive && pr.status === "pending",
    );
    if (demandPending) continue;

    const overwhelming = ratio >= 2.0; // can take what it wants by force
    const refused = hasModifier(state, aiId, otherId, "__demandRefused");

    if (canWar) {
      // The overwhelmingly strong would rather extort than spend blood — demand
      // tribute FIRST (the credible threat of war is the lever), provided they
      // haven't already been rebuffed. Greedy or aggressive civs especially.
      if (overwhelming && !refused && score < 25 && (p.greed > 0.4 || p.aggression > 0.5)) {
        const demand = 20 + Math.round((p.greed * 0.5 + p.aggression * 0.5) * 50);
        demandTribute(state, aiId, otherId, demand);
        continue;
      }
      // War: when it despises a civ it can beat, OR to make good on a refused
      // demand (an aggressive civ follows through on the threat). The truly
      // warlike are far more willing to actually invade after a snub.
      const enforceRefusal = refused && ratio >= requiredRatio && p.aggression > 0.45;
      if (despises || enforceRefusal) {
        declareWar(state, aiId, otherId);
        continue;
      }
    }

    // Friendly, loyal civs cultivate ties: open borders, then non-aggression.
    if (score >= 40 && r.pact === "none" && (state.turn + aiId) % 13 === 0) {
      if (!r.openBorders) {
        proposeDeal(state, aiId, otherId, [{ kind: "openBorders" }], [{ kind: "openBorders" }]);
        continue;
      } else if (p.loyalty > 0.6 && score >= 55) {
        proposeDeal(state, aiId, otherId, [{ kind: "pact", tier: "non_aggression", turns: 25 }], [{ kind: "pact", tier: "non_aggression", turns: 25 }]);
        continue;
      }
    }

    // Not hostile? Seek a mutually useful trade for something the AI needs.
    if (score > -15 && (state.turn + aiId * 3 + otherId) % 11 === 0) {
      aiInitiateTrade(state, aiId, otherId);
    }
  }
}
