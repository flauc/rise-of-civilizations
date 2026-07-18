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
import { UNIT_DEFS, TECH_DEFS, baseTrainTime, isMilitary, type TechId } from "./content";
import { cityMaxHp } from "./combat";
import { applyVictoryCheck } from "./victory";
import { onWarDeclared } from "./morale";
import { emitWarDeclared } from "./turn-updates";
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
const AI_OFFER_COOLDOWN = 12; // turns an AI waits before pitching the same civ another deal
const AI_REBUFF_COOLDOWN = 28; // longer backoff after an offer is explicitly rejected
const PEACE_REOFFER_COOLDOWN = 10; // a war moves fast; refused peace terms return to the table sooner
const PEACE_FREE_LIMIT = 25; // a peace "price" this trifling isn't worth haggling over: grant it bare

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
        case "sharedVision": return "shared vision";
        case "pact": return `${it.tier.replace("_", " ")} (${it.turns}t)`;
        case "declareWarOn": return `war on #${it.civId}`;
        case "tech": return `${TECH_DEFS[it.techId as TechId]?.name ?? it.techId} (tech)`;
        case "city": return "a city";
        case "unit": return it.turns > 0 ? `a unit (${it.turns}t loan)` : "a unit";
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

/** Ids of every civ `playerId` currently shares vision (an exchanged map) with. */
export function sharedVisionPartners(state: GameState, playerId: number): number[] {
  const out: number[] = [];
  for (const r of state.relations) {
    if (!r.sharedVision) continue;
    if (r.a === playerId) out.push(r.b);
    else if (r.b === playerId) out.push(r.a);
  }
  return out;
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

/** True if `player` is at war with at least one MAJOR civ (barbarians never count).
 *  This is the definition used by war/peace-conditional civics (docs/CIVICS §4):
 *  a barbarian incursion does not flip an empire onto a "war footing". */
export function isAtWarWithMajor(state: GameState, player: Player): boolean {
  for (const id of player.atWar) {
    const other = playerById(state, id);
    if (other && !other.isBarbarian) return true;
  }
  return false;
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
    openBorders: false, sharedVision: false, pact: "none", deals: [],
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
  r.sharedVision = false; // maps are no longer shared once the two are at war
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
  r.aggressorId = undefined;
  // Any war-ending offer still on the table between the two is moot now — drop it
  // so a stale "peace for tribute" can't be accepted after the war already ended.
  state.diploProposals = state.diploProposals.filter(
    (p) =>
      !(((p.fromId === r.a && p.toId === r.b) || (p.fromId === r.b && p.toId === r.a)) &&
        [...p.give, ...p.want].some((it) => it.kind === "peace")),
  );
  const A = playerById(state, r.a);
  const B = playerById(state, r.b);
  if (A) A.atWar = A.atWar.filter((id) => id !== r.b);
  if (B) B.atWar = B.atWar.filter((id) => id !== r.a);
}

/** Whether `aId` may declare war on `targetId` right now (peace cooldown, etc.). */
export function canDeclareWar(
  state: GameState,
  aId: number,
  targetId: number,
): { ok: boolean; reason?: string } {
  if (aId === targetId) return { ok: false, reason: "you cannot declare war on yourself" };
  const r = relationBetween(state, aId, targetId);
  if (!r) return { ok: false, reason: "you have not met them" };
  if (r.status === "war") return { ok: false, reason: "you are already at war" };
  if (r.warAllowedTurn !== undefined && state.turn < r.warAllowedTurn) {
    const left = r.warAllowedTurn - state.turn;
    return {
      ok: false,
      reason: `Peace treaty holds for ${left} more turn${left === 1 ? "" : "s"} (until turn ${r.warAllowedTurn})`,
    };
  }
  return { ok: true };
}

export function declareWar(state: GameState, aId: number, targetId: number): DiploResult {
  const gate = canDeclareWar(state, aId, targetId);
  if (!gate.ok) return fail(gate.reason ?? "cannot declare war");
  const r = relationBetween(state, aId, targetId)!;
  const denounced = hasModifier(state, aId, targetId, "__denounced");
  setWar(state, r);
  r.aggressorId = aId; // the declarer owns this war and must commit to it (see aiAcceptsPeace)
  addReputation(state, aId, denounced ? WARMONGER_DENOUNCED : WARMONGER_SURPRISE);
  addModifier(state, targetId, aId, "you declared war on us", -45);
  const A = playerById(state, aId)!;
  const T = playerById(state, targetId)!;
  recordTrade(state, aId, targetId, "war", [], [], `${civName(A)} declared war on ${civName(T)}`);
  log(state, `${civName(A)} declared war on ${civName(T)}!`, { actorId: aId, targetIds: [aId, targetId] });
  emitWarDeclared(state, aId, targetId);
  onWarDeclared(state, aId); // steels a confident army, unnerves a shaky one
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

/**
 * End a standing shared-vision (exchanged-maps) agreement. Either party may pull
 * out at any time; the other loses the borrowed sight at once and takes it a
 * little personally.
 */
export function cancelSharedVision(state: GameState, aId: number, targetId: number): DiploResult {
  const r = relationBetween(state, aId, targetId);
  if (!r) return fail("you have not met them");
  if (!r.sharedVision) return fail("you do not share vision with them");
  r.sharedVision = false;
  addModifier(state, targetId, aId, "you ended our map sharing", -6, 30);
  const A = playerById(state, aId)!;
  const T = playerById(state, targetId)!;
  recordTrade(state, aId, targetId, "deal", [], [], `${civName(A)} ended map sharing with ${civName(T)}`);
  log(state, `${civName(A)} ended map sharing with ${civName(T)}.`, { actorId: aId, targetIds: [aId, targetId] });
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
    } else if (it.kind === "tech") {
      if (!p.researched.has(it.techId as TechId)) return false;
    } else if (it.kind === "city") {
      if (state.cities.get(it.cityId)?.ownerId !== payerId) return false;
    } else if (it.kind === "unit") {
      if (state.units.get(it.unitId)?.ownerId !== payerId) return false;
    }
  }
  return true;
}

/** Technologies `fromId` knows that `toId` lacks but has the prerequisites for —
 *  the set the deal-builder may offer (and a transfer that makes sense). */
export function tradeableTechs(state: GameState, fromId: number, toId: number): TechId[] {
  const from = playerById(state, fromId);
  const to = playerById(state, toId);
  if (!from || !to) return [];
  return ([...from.researched] as TechId[]).filter(
    (t) => !to.researched.has(t) && TECH_DEFS[t]?.prereqs.every((p) => to.researched.has(p)),
  );
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
    if (it.kind === "sharedVision" && rel.sharedVision) return "you already share vision";
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

  // Re-proposing supersedes your previous standing offer to this civ rather than
  // stacking a second one — at most one pending offer per direction at a time.
  // (Direction-scoped, so it leaves an AI counter-offer and any just-declined
  // original from a counter exchange untouched.)
  state.diploProposals = state.diploProposals.filter(
    (p) => !(p.fromId === fromId && p.toId === toId && p.status === "pending"),
  );

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

  // An AI that initiates a (non-coercive) deal won't re-pitch the same civ for a
  // while — this is what stops it offering an identical deal turn after turn.
  const proposer = playerById(state, fromId);
  if (proposer && !proposer.isHuman && !proposer.isBarbarian && !coercive) {
    addModifier(state, fromId, toId, "__offerCd", 0, AI_OFFER_COOLDOWN);
  }

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
      const proposer = playerById(state, fromId);
      const proposerIsAI = proposer && !proposer.isHuman;
      // Coercive demands, AI-initiated deals, and human→AI deals all conclude
      // once the AI accepts. Only human↔human needs a proposer finalize step.
      if (coercive || proposerIsAI || proposer?.isHuman) settleProposal(state, prop);
    } else if (!coercive && !decision.accept && decision.counter && playerById(state, fromId)?.isHuman) {
      // Rather than a flat "no", the AI volleys back a fair counter for the human
      // to weigh. (Recipient is human → this stays pending until they respond.)
      createProposal(state, toId, fromId, decision.counter.give, decision.counter.want, false);
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
    const proposerIsAI = !playerById(state, prop.fromId)?.isHuman && !playerById(state, prop.fromId)?.isBarbarian;
    // A refused coercive demand lets an AI demander escalate to war later.
    if (prop.coercive && proposerIsAI) {
      addModifier(state, prop.fromId, playerId, "__demandRefused", 0, 8);
    } else if (proposerIsAI) {
      // The AI remembers a rebuffed deal and backs off, rather than re-pitching it.
      // Refused peace terms return to the table sooner: a war's fortunes move fast,
      // and the price the AI would set next time moves with them.
      const warEnding = [...prop.give, ...prop.want].some((it) => it.kind === "peace");
      addModifier(state, prop.fromId, playerId, "__offerRebuffed", 0, warEnding ? PEACE_REOFFER_COOLDOWN : AI_REBUFF_COOLDOWN);
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
    case "sharedVision":
      if (r) r.sharedVision = true;
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
    case "tech":
      // Technology is non-rival: the payer keeps it, the receiver gains it.
      receiver.researched.add(item.techId as TechId);
      log(state, `${civName(payer)} shared ${TECH_DEFS[item.techId as TechId]?.name ?? item.techId} with ${civName(receiver)}.`, {
        actorId: payerId,
        targetIds: [payerId, receiverId],
      });
      break;
    case "city":
      transferCity(state, item.cityId, payerId, receiverId);
      break;
    case "unit":
      if (item.turns > 0) {
        // Lend: move the unit now, record an obligation to return it later.
        if (transferUnit(state, item.unitId, payerId, receiverId) && r) {
          r.deals.push({ fromId: payerId, item, untilTurn: state.turn + item.turns, unitId: item.unitId });
        }
      } else {
        transferUnit(state, item.unitId, payerId, receiverId); // sell (permanent)
      }
      break;
  }
}

/** Cede a city from one civ to another (a diplomatic, non-violent transfer).
 *  Territory follows automatically (tiles reference the city, whose owner changes).
 *  A capital changing hands can decide a domination victory, so we re-check. */
function transferCity(state: GameState, cityId: number, fromId: number, toId: number): void {
  const city = state.cities.get(cityId);
  if (!city || city.ownerId !== fromId) return;
  city.ownerId = toId;
  city.isCapital = false; // a ceded city is never the new owner's seat of government
  city.autoMode = undefined; // hand it over under the new owner's manual control
  const from = playerById(state, fromId);
  const to = playerById(state, toId);
  log(state, `${civName(from!)} ceded ${city.name} to ${civName(to!)}.`, {
    actorId: fromId,
    targetIds: [fromId, toId],
    tile: { col: city.col, row: city.row },
  });
  applyVictoryCheck(state);
}

/** Move a unit's ownership (sale or the start of a loan). Returns false if gone. */
function transferUnit(state: GameState, unitId: number, fromId: number, toId: number): boolean {
  const unit = state.units.get(unitId);
  if (!unit || unit.ownerId !== fromId) return false;
  unit.ownerId = toId;
  unit.movementLeft = 0; // a freshly handed-over unit waits a turn before acting
  return true;
}

/** Return a lent unit to its lender when the loan ends (if it still lives). */
function returnUnit(state: GameState, ob: { fromId: number; unitId?: number }): void {
  if (ob.unitId === undefined) return;
  const unit = state.units.get(ob.unitId);
  if (unit) unit.ownerId = ob.fromId;
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
    // Return lent specialists/units whose loan has expired, then drop expired deals.
    for (const d of r.deals) {
      if (state.turn >= d.untilTurn && d.item.kind === "specialist") returnSpecialist(state, d);
      if (state.turn >= d.untilTurn && d.item.kind === "unit") returnUnit(state, d);
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

// ---- settling on a rival's doorstep --------------------------------------

// How close a new city must sit to another civ's territory to register as an
// intrusion at all, and the point at which planting one is read as an outright
// encroachment that a hostile neighbour may answer with war.
const ENCROACH_RANGE = 4; // tiles from their nearest owned tile to provoke resentment
const ENCROACH_PROVOKE = 2; // this close (right against their borders) can spark war

/** Deepen a stacking opinion penalty (each fresh affront adds to it, to a floor). */
function worsenModifier(state: GameState, from: number, to: number, reason: string, delta: number, floor: number, ttl: number): void {
  const at = attitudeRec(state, from, to);
  let m = at.modifiers.find((x) => x.reason === reason);
  if (!m) {
    m = { reason, value: 0 };
    at.modifiers.push(m);
  }
  m.value = Math.max(floor, m.value + delta);
  m.expiresTurn = state.turn + ttl;
}

/**
 * A newly founded city sits on the map; every met major civ whose borders it
 * crowds resents it. The nearer it is planted to their territory the sharper the
 * affront, and it cuts deeper against an aggressive, territorial temperament.
 * When a city is dropped right against the borders of a civ that already dislikes
 * the founder — and that civ can reach and beat them — the intrusion is a casus
 * belli it may answer with war on the spot. Only an AI reacts with war; a human
 * chooses their own wars.
 */
export function onCityFoundedNearRivals(state: GameState, city: City): void {
  const founderId = city.ownerId;
  const founder = playerById(state, founderId);
  if (!founder || founder.isBarbarian) return;
  const here = offsetToAxial({ col: city.col, row: city.row });

  // Nearest owned tile of each other civ to the new city (one pass over the map).
  const terrDist = new Map<number, number>();
  for (const t of state.map.tiles) {
    if (t.ownerCityId === undefined) continue;
    const owner = state.cities.get(t.ownerCityId)?.ownerId;
    if (owner === undefined || owner === founderId) continue;
    const d = axialDistance(here, offsetToAxial({ col: t.col, row: t.row }));
    const cur = terrDist.get(owner);
    if (cur === undefined || d < cur) terrDist.set(owner, d);
  }

  for (const [otherId, dist] of terrDist) {
    if (dist > ENCROACH_RANGE) continue;
    const other = playerById(state, otherId);
    if (!other || other.isBarbarian) continue;
    const r = relationBetween(state, founderId, otherId);
    if (!r || !other.met.includes(founderId)) continue; // must have met to care
    if (r.status === "war") continue; // already fighting — nothing to escalate

    const p = personalityOf(state, otherId);
    // Severity: ~1.0 right on their border, tapering to ~0 at ENCROACH_RANGE.
    const severity = Math.max(0, 1 - dist / (ENCROACH_RANGE + 1));
    const penalty = -Math.round((6 + severity * 16) * (0.6 + p.aggression * 0.9));
    worsenModifier(state, otherId, founderId, "you settled on our borders", penalty, -60, 60);
    log(state, `${civName(other)} resent ${civName(founder)} founding ${city.name} near their borders.`, {
      actorId: founderId,
      targetIds: [otherId, founderId],
      tile: { col: city.col, row: city.row },
    });

    // A city planted right against their borders can be a casus belli — but only
    // an AI already soured on the founder, able to reach and beat them and not
    // bound by a pact, will actually march. How low its opinion must sink scales
    // with temperament: a warlike civ needs far less provocation than a placid one.
    if (other.isHuman || dist > ENCROACH_PROVOKE) continue;
    const canWar = r.pact === "none" && (r.warAllowedTurn === undefined || state.turn >= r.warAllowedTurn);
    if (!canWar || !canWageWarOn(state, otherId, founderId)) continue;
    const score = attitudeScore(state, otherId, founderId); // includes the fresh penalty
    const warThreshold = -35 - (1 - p.aggression) * 35; // aggr 1 → -35, placid → -70
    if (score <= warThreshold && powerRatio(state, otherId, founderId) >= 1.0) {
      declareWar(state, otherId, founderId);
    }
  }
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

/** Count enemy (at-war-with `aiId`) military units on or adjacent to (col,row). */
function enemyMilitaryNear(state: GameState, aiId: number, col: number, row: number): number {
  const here = offsetToAxial({ col, row });
  let n = 0;
  for (const u of state.units.values()) {
    if (u.ownerId === aiId || !isMilitary(u.type)) continue;
    if (!atWar(state, aiId, u.ownerId)) continue;
    if (axialDistance(here, offsetToAxial({ col: u.col, row: u.row })) <= 1) n++;
  }
  return n;
}

/** A city on the brink: badly wounded, or ringed by enemy troops about to storm it. */
function cityUnderSiege(state: GameState, aiId: number, c: City): boolean {
  return c.hp <= cityMaxHp(c) * 0.5 || enemyMilitaryNear(state, aiId, c.col, c.row) >= 2;
}

/** Battle-ready offensive units (civilians and badly wounded units don't count). */
function offensiveUnitCount(state: GameState, playerId: number): number {
  let n = 0;
  for (const u of unitsOf(state, playerId)) if (isMilitary(u.type) && u.hp >= 40) n++;
  return n;
}

/** Closest hop between either side's forces/cities — how far an army must march. */
function strikeDistance(state: GameState, aId: number, bId: number): number {
  const anchors = (id: number, militaryOnly: boolean) => [
    ...unitsOf(state, id).filter((u) => !militaryOnly || isMilitary(u.type)).map((u) => ({ col: u.col, row: u.row })),
    ...citiesOf(state, id).map((c) => ({ col: c.col, row: c.row })),
  ];
  const mine = anchors(aId, true);
  const theirs = anchors(bId, false);
  let best = Infinity;
  for (const m of mine) {
    for (const t of theirs) {
      const d = axialDistance(offsetToAxial(m), offsetToAxial(t));
      if (d < best) best = d;
    }
  }
  return best;
}

/**
 * Whether the AI can — and would actually bother to — prosecute a war on `otherId`:
 * it must field a real offensive army, and the enemy must be within striking
 * range (or the AI must be an overwhelming juggernaut willing to march any
 * distance). This is what stops the AI declaring wars it has no means to fight.
 */
function canWageWarOn(state: GameState, aiId: number, otherId: number): boolean {
  if (offensiveUnitCount(state, aiId) < 2) return false;
  if (powerRatio(state, aiId, otherId) >= 2.0) return true; // a juggernaut marches anywhere
  return strikeDistance(state, aiId, otherId) <= 18;
}

/** Has the AI recently pitched (or been rebuffed by) this civ? Then hold off. */
function offerOnCooldown(state: GameState, aiId: number, otherId: number): boolean {
  return hasModifier(state, aiId, otherId, "__offerCd") || hasModifier(state, aiId, otherId, "__offerRebuffed");
}

/** Turns an aggressor stays committed to a war it started before weighing peace. */
function commitTurns(p: DiploPersonality): number {
  return Math.round(6 + p.aggression * 6 + p.boldness * 4); // ~6..16 turns
}

/**
 * The net value `aiId` attaches to ending its war with `otherId` RIGHT NOW,
 * expressed as the tribute it demands (positive) or would itself pay (negative).
 * This one number drives all three faces of peace-making, so they stay coherent:
 *  - the terms a victor proposes (buildPeaceTerms fills a basket to this price);
 *  - the judgement of any war-ending deal or counter-offer (aiDecideOffer charges
 *    it against the offer's value — so a player may swap the demanded city for
 *    gold and the AI weighs the substitution honestly);
 *  - bare-peace acceptance (free only when the price is trifling).
 */
export function peacePrice(state: GameState, aiId: number, otherId: number): number {
  const r = relationBetween(state, aiId, otherId);
  if (!r || r.status !== "war") return 0;
  const p = personalityOf(state, aiId);
  const ratio = powerRatio(state, aiId, otherId);
  const warDuration = state.turn - r.lastStatusChangeTurn;
  const edge = ratio - 1;
  let price: number;
  if (edge > 0) {
    // The victor's ask scales with dominance and temperament...
    price = edge * (70 + p.greed * 60 + p.aggression * 40);
    // ...soars when the enemy teeters on destruction (a reprieve is bought dearly)...
    const theirCities = citiesOf(state, otherId);
    const theirCapital = theirCities.find((c) => c.isCapital) ?? theirCities[0];
    const brink = theirCities.length > 0 &&
      ((theirCities.length <= 2 && ratio >= 1.8) ||
        (theirCapital !== undefined && cityUnderSiege(state, otherId, theirCapital)));
    if (brink) price += 250 + p.aggression * 250;
    // ...carries a premium while a fresh aggressor is still committed to its war...
    if (r.aggressorId === aiId && warDuration < commitTurns(p)) price *= 1.5;
    // ...erodes as the fighting drags on (an exhausted victor settles cheaper)...
    price *= Math.max(0.35, 1 - warDuration / 50);
    // ...and collapses when circumstances turn: a second front, or its own cities
    // besieged, make this a war to wrap up cheaply rather than milk.
    if (atWarWithOtherMajor(state, aiId, otherId)) price *= 0.35;
    if (citiesOf(state, aiId).some((c) => cityUnderSiege(state, aiId, c))) price *= 0.3;
  } else {
    // The loser pays: modestly when merely behind, desperately when facing ruin.
    price = edge * 140 - Math.max(0, warDuration - 10) * 3;
    const myCities = citiesOf(state, aiId);
    const myCapital = myCities.find((c) => c.isCapital) ?? myCities[0];
    const doomed = myCities.length > 0 &&
      ((myCities.length <= 2 && ratio <= 0.55) ||
        (myCapital !== undefined && cityUnderSiege(state, aiId, myCapital)));
    if (doomed) price -= 350 + (1 - p.boldness) * 150;
  }
  return Math.round(Math.max(-600, Math.min(1500, price)));
}

/**
 * Whether the AI wants this war OVER (on some terms — what terms is peacePrice's
 * business). A civ that is CRUSHING its rival — or a warmonger holding a clear
 * upper hand — fights on to finish the job. Short of that threshold a mere edge is
 * no longer a life sentence of war: a marginally-ahead civ can still come to terms
 * once the fighting drags on (war-weariness) or attitudes soften. Only truly
 * dominant or bloodthirsty civs press a war to elimination.
 */
function aiWantsWarOver(state: GameState, aiId: number, otherId: number): boolean {
  const r = relationBetween(state, aiId, otherId);
  if (!r) return false;
  const p = personalityOf(state, aiId);
  const ratio = powerRatio(state, aiId, otherId);
  // Press on to elimination only with an overwhelming edge, or as a warmonger with a
  // solid lead. Below that, fall through to the weariness/attitude logic so the AI
  // will take a reasonable peace instead of grinding every war to annihilation.
  if (citiesOf(state, otherId).length > 0) {
    if (ratio >= 2.0) return false;
    if (p.aggression > 0.7 && ratio >= 1.4) return false;
  }

  const warDuration = state.turn - r.lastStatusChangeTurn;
  const losing = ratio < 0.9;
  // An AI that STARTED this war commits to it: it won't sue for peace within the
  // opening turns unless the war has actually turned against it. Without this an
  // aggressor could declare war (e.g. to enforce a refused tribute demand) and then
  // offer a free peace a turn or two later — pointless flip-flopping — the moment a
  // drifting power ratio dips below the "fight on" line. The window scales with
  // temperament: an aggressive, bold civ presses the war it picked far longer.
  if (r.aggressorId === aiId && !losing && warDuration < commitTurns(p)) return false;
  const weary = warDuration >= Math.round(16 - p.forgiveness * 8 - (losing ? 4 : 0));
  const score = attitudeScore(state, aiId, otherId);
  if (!losing && p.boldness > 0.7 && !weary) return score > 30;
  return losing || weary || score > -40 + p.forgiveness * 40 - p.aggression * 15;
}

/** Bare (no-strings) peace: granted only when the AI wants out AND asks nothing much.
 *  A willing-but-winning AI refuses here and instead names its price in a deal. */
function aiAcceptsPeace(state: GameState, aiId: number, otherId: number): boolean {
  return aiWantsWarOver(state, aiId, otherId) && peacePrice(state, aiId, otherId) <= PEACE_FREE_LIMIT;
}

function atWarWithAnyone(state: GameState, aiId: number): boolean {
  return state.relations.some((r) => (r.a === aiId || r.b === aiId) && r.status === "war");
}

/** At war with a MAJOR civ other than `exceptId` — a second front pulling the AI
 *  away from the war it might otherwise press for terms (barbarians don't count). */
function atWarWithOtherMajor(state: GameState, aiId: number, exceptId: number): boolean {
  for (const rel of state.relations) {
    if (rel.status !== "war") continue;
    if (rel.a !== aiId && rel.b !== aiId) continue;
    const foe = rel.a === aiId ? rel.b : rel.a;
    if (foe === exceptId) continue;
    if (!playerById(state, foe)?.isBarbarian) return true;
  }
  return false;
}

/**
 * Assemble the tribute a victorious AI demands to end a war, worth roughly `price`
 * in its own valuation (itemValue — the very pricing the deal evaluator applies to
 * counter-offers, so a player swapping the demanded city for gold is judged by the
 * same yardstick). Drawn from the loser's ACTUAL assets, most liquid first:
 *  - gold, up to the debt;
 *  - a luxury or two;
 *  - surrendered units, once the victor clearly dominates (disarming the loser);
 *  - a frontier city, only under utter dominance and a deep remaining debt
 *    (never the capital, never their last city);
 *  - any shortfall as reparations paid per turn.
 */
function buildPeaceTerms(state: GameState, aiId: number, otherId: number, price: number): DealItem[] {
  const loser = playerById(state, otherId);
  if (!loser) return [];
  const items: DealItem[] = [];
  let remaining = price;
  const ratio = powerRatio(state, aiId, otherId);

  const gold = Math.min(Math.floor(loser.gold), Math.ceil(remaining));
  if (gold >= 10) {
    items.push({ kind: "gold", amount: gold });
    remaining -= gold;
  }

  for (const lux of tradeableLuxuries(state, otherId)) {
    if (remaining <= 40 || items.filter((i) => i.kind === "resource").length >= 2) break;
    const it: DealItem = { kind: "resource", id: lux, turns: 20 };
    items.push(it);
    remaining -= itemValue(state, aiId, otherId, it);
  }

  if (ratio >= 1.4) {
    const troops = unitsOf(state, otherId)
      .filter((u) => isMilitary(u.type) && u.hp >= 60)
      .map((u) => ({ id: u.id, v: itemValue(state, aiId, otherId, { kind: "unit", unitId: u.id, turns: 0 }) }))
      .sort((a, b) => b.v - a.v)
      .slice(0, 2);
    for (const t of troops) {
      if (remaining <= 60) break;
      items.push({ kind: "unit", unitId: t.id, turns: 0 });
      remaining -= t.v;
    }
  }

  const theirCities = citiesOf(state, otherId);
  if (ratio >= 1.8 && theirCities.length >= 2 && remaining >= 250) {
    // The natural concession is the frontier city nearest the victor's own lands.
    const mine = citiesOf(state, aiId);
    let best: City | undefined;
    let bestD = Infinity;
    for (const c of theirCities) {
      if (c.isCapital) continue;
      let d = Infinity;
      for (const m of mine) {
        d = Math.min(d, axialDistance(offsetToAxial({ col: c.col, row: c.row }), offsetToAxial({ col: m.col, row: m.row })));
      }
      if (best === undefined || d < bestD) {
        bestD = d;
        best = c;
      }
    }
    if (best) {
      const v = itemValue(state, aiId, otherId, { kind: "city", cityId: best.id });
      if (v <= remaining * 1.7) {
        items.push({ kind: "city", cityId: best.id });
        remaining -= v;
      }
    }
  }

  if (remaining > 25) {
    const turns = 15;
    const amount = Math.max(1, Math.min(12, Math.ceil(remaining / (turns * 0.8))));
    items.push({ kind: "goldPerTurn", amount, turns });
  }
  return items;
}

/**
 * The AI has decided it wants this war over (aiWantsWarOver) — now it settles on
 * terms, shaped by what ending the war is worth to it (peacePrice):
 *  - price ≤ trifling, or overriding circumstances (a second front, its own cities
 *    under siege): a plain peace, no strings. When a losing AI's bare offer is
 *    refused by a winner holding out, it sweetens the offer with gold of its own.
 *  - price > trifling: the victor makes the loser BUY peace — a tribute basket of
 *    gold, luxuries, surrendered units, even a frontier city (buildPeaceTerms).
 */
export function aiSueForPeace(state: GameState, aiId: number, otherId: number): void {
  const r = relationBetween(state, aiId, otherId);
  const me = playerById(state, aiId);
  if (!r || r.status !== "war" || !me || !playerById(state, otherId)) return;
  const price = peacePrice(state, aiId, otherId);
  const distracted = atWarWithOtherMajor(state, aiId, otherId);
  const beleaguered = citiesOf(state, aiId).some((c) => cityUnderSiege(state, aiId, c));
  const pending = state.diploProposals.some(
    (pr) => pr.fromId === aiId && pr.toId === otherId && pr.status === "pending",
  );

  if (price <= PEACE_FREE_LIMIT || distracted || beleaguered) {
    const res = makePeace(state, aiId, otherId);
    // A losing AI whose bare offer was refused puts what the war's end is worth to
    // it on the table — gold rather than more blood. The winner judges the sum
    // against its own price for peace, so the two converge (or don't) honestly.
    if (!res.ok && price < -60 && !pending && !offerOnCooldown(state, aiId, otherId)) {
      const gold = Math.min(Math.floor(me.gold), Math.round(-price));
      if (gold >= 10) proposeDeal(state, aiId, otherId, [{ kind: "peace" }, { kind: "gold", amount: gold }], []);
    }
    return;
  }

  // A victor names its price. Don't badger: at most one standing offer, and back
  // off after a refusal (peace terms return to the table on a short cooldown).
  if (pending || offerOnCooldown(state, aiId, otherId)) return;
  const terms = buildPeaceTerms(state, aiId, otherId, price);
  if (terms.length === 0) {
    makePeace(state, aiId, otherId); // nothing worth taking: just end it
    return;
  }
  proposeDeal(state, aiId, otherId, [{ kind: "peace" }], terms);
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
    // Ending a war is mutual, not a per-item good: aiDecideOffer charges it once,
    // via peacePrice (kept at 0 here so summing either ledger stays safe).
    case "peace": return 0;
    case "openBorders": {
      const att = attitudeScore(state, aiId, otherId);
      // Wanted only when very friendly, or when at war and needing to move armies.
      const friendly = att >= 60 ? 6 + (att - 60) * 0.25 : att >= 30 ? 2 : -4;
      return friendly + (atWarWithAnyone(state, aiId) ? 4 : 0);
    }
    case "sharedVision": {
      // Seeing a friend's lands is welcome intel — worth more when actively at war
      // (spot troop movements). But baring your own map to a civ you distrust is a
      // liability, so a wary/hostile AI values it at a loss and won't sign on.
      const att = attitudeScore(state, aiId, otherId);
      const friendly = att >= 25 ? 5 + att * 0.06 : att >= -10 ? 1 : -8;
      return friendly + (atWarWithAnyone(state, aiId) ? 5 : 0);
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
    case "tech": {
      // Knowledge is dear: the AI prices a tech above its research cost and is loath
      // to hand a rival the edge — so it asks a premium when giving one up.
      const cost = TECH_DEFS[item.techId as TechId]?.cost ?? 60;
      return Math.round(cost * 1.3);
    }
    case "city": {
      const c = state.cities.get(item.cityId);
      if (!c) return 0;
      // A city is a treasure; an AI rarely parts with one and pays dearly to gain one.
      // The capital is all but priceless (and ceding one is hard-gated in aiDecideOffer).
      const base = 300 + c.population * 60 + c.buildings.length * 25 + c.wonders.length * 120;
      return c.isCapital ? base * 5 + 2000 : base;
    }
    case "unit": {
      const u = state.units.get(item.unitId);
      if (!u) return 20;
      const def = UNIT_DEFS[u.type];
      // A unit is worth what it costs in GOLD to raise a replacement — the same
      // "fast-train" (rush) price a player pays: ~14 gold per training turn, and
      // turns ≈ cost/6. Pricing it at the raw hammer cost (as before) sold units
      // for a fraction of that, so the AI parted with troops far too cheaply.
      const replace = Math.max(def.cost, (baseTrainTime(u.type) - 1) * 14);
      const levelMult = 1 + 0.15 * Math.max(0, u.level - 1); // veterans cost more
      const hpMult = Math.max(0.4, u.hp / 100); // a battered unit is worth less
      // A permanent sale asks a premium over bare replacement — parting with a
      // standing unit weakens the army. A loan is a fraction, scaled by its term.
      // (A further standing-based premium is applied in aiDecideOffer: the AI
      // will not arm a civ it distrusts except for an exorbitant sum.)
      const value = item.turns > 0
        ? replace * 0.4 + item.turns * 3
        : replace * 1.8;
      return Math.round(value * levelMult * hpMult);
    }
  }
}

/** Total gold an item set asks the AI to part with (lump + full term of per-turn). */
function goldOutlay(items: DealItem[]): number {
  return items.reduce((s, it) =>
    s + (it.kind === "gold" ? it.amount : it.kind === "goldPerTurn" ? it.amount * it.turns : 0), 0);
}

/**
 * Build a fair counter to a rejected offer: keep the same structural items but
 * rebalance the gold so the trade is worth the AI's while — it pays less, and/or
 * asks the other side to cover the shortfall. Returned from the AI's perspective
 * as the proposer, or null when there's no concrete trade on the table or the two
 * sides are simply too far apart to bridge.
 */
function buildCounterOffer(give: DealItem[], want: DealItem[], deficit: number, warEnds = false): { give: DealItem[]; want: DealItem[] } | null {
  // Peace is worth bridging a far wider gap for than an ordinary barter.
  if (deficit <= 5 || deficit > (warEnds ? 900 : 400)) return null;
  const tradeable = [...give, ...want].some(
    (it) => it.kind === "resource" || it.kind === "specialist" || it.kind === "peace" || it.kind === "city" || it.kind === "unit",
  );
  if (!tradeable) return null;
  // As proposer the AI gives what it was asked for (`want`) and seeks `give`.
  const cGive = want.map((it) => ({ ...it }));
  const cWant = give.map((it) => ({ ...it }));
  // Peace reads as something the counter-proposer extends, whichever tray it
  // started in (the term is mutual either way).
  const pi = cWant.findIndex((it) => it.kind === "peace");
  if (pi >= 0) cGive.push(...cWant.splice(pi, 1));
  let remaining = deficit;
  // 1) Shave the gold the AI itself would pay.
  const myGold = cGive.find((it) => it.kind === "gold") as Extract<DealItem, { kind: "gold" }> | undefined;
  if (myGold) {
    const cut = Math.min(myGold.amount, remaining);
    myGold.amount -= cut;
    remaining -= cut;
  }
  const trimmedGive = cGive.filter((it) => !(it.kind === "gold" && it.amount <= 0));
  // 2) Ask the other side to make up the rest in coin.
  if (remaining > 0) {
    const theirGold = cWant.find((it) => it.kind === "gold") as Extract<DealItem, { kind: "gold" }> | undefined;
    if (theirGold) theirGold.amount += Math.ceil(remaining);
    else cWant.push({ kind: "gold", amount: Math.ceil(remaining) });
  }
  if (trimmedGive.length === 0 && cWant.length === 0) return null;
  return { give: trimmedGive, want: cWant };
}

/**
 * How much more the AI demands to PART WITH a unit, scaled by standing. Handing
 * troops to a civ is arming them, so the AI will sell near replacement cost only
 * to a close ally; for anyone it does not trust it asks a steep premium, and for
 * a rival an outright exorbitant one — effectively refusing to sell for any fair
 * price. Applied only to units the AI gives up (never to what it receives).
 */
function unitPartingPremium(state: GameState, aiId: number, otherId: number): number {
  const att = attitudeScore(state, aiId, otherId);
  if (att >= 70) return 1;    // allied — sells at the standard premium
  if (att >= 40) return 1.6;  // friendly — a modest surcharge
  if (att >= 10) return 3;    // neutral / wary — steep
  return 5;                   // unfriendly or hostile — only for an absurd sum
}

/** Evaluate a (non-coercive) offer from the AI's perspective. */
function aiDecideOffer(
  state: GameState,
  aiId: number,
  fromId: number,
  give: DealItem[], // what the proposer gives the AI
  want: DealItem[], // what the AI must give up
): { accept: boolean; reason: string; counter?: { give: DealItem[]; want: DealItem[] } } {
  // A relationship-defining item the AI flatly refuses (e.g. ally a non-friend).
  if (give.some((it) => it.kind === "pact" && itemValue(state, aiId, fromId, it) < -900)) {
    return { accept: false, reason: "We will not enter such a pact with you." };
  }
  // The AI cannot give resources/specialists it does not possess.
  if (!canPayItems(state, aiId, want)) {
    return { accept: false, reason: "We cannot provide what you ask." };
  }
  // Does this deal end a war between the two? Peace is mutual, so it counts the
  // same whichever ledger it was written on; its worth is charged once, below,
  // via peacePrice (a dominant victor demands the difference be paid in tribute,
  // a desperate loser will pay it).
  const warEnds = atWar(state, aiId, fromId) && [...give, ...want].some((it) => it.kind === "peace");
  // A city — above all the capital — is almost never for sale. The AI hard-refuses
  // ceding one in trade, regardless of how much gold is piled on, with two war
  // exceptions: surrendering a besieged city outright to a stronger enemy for
  // peace, and (softer) letting the value comparison decide a non-capital cession
  // when buying peace from a far stronger foe.
  for (const it of want) {
    if (it.kind !== "city") continue;
    const c = state.cities.get(it.cityId);
    if (!c || c.ownerId !== aiId) continue;
    const desperate = warEnds && cityUnderSiege(state, aiId, c) && powerRatio(state, fromId, aiId) >= 1.3;
    if (desperate) {
      return {
        accept: true,
        reason: c.isCapital
          ? "Our capital is all but lost — take it, and end this war."
          : "Take the city, and let there be peace.",
      };
    }
    if (c.isCapital) return { accept: false, reason: "Our capital is not for sale — at any price." };
    if (citiesOf(state, aiId).length <= 1) return { accept: false, reason: "We will not trade away our last city." };
    // Facing a far stronger enemy, a non-capital city may be bargained away to buy
    // peace: fall through to the value comparison instead of refusing outright.
    const surrender = warEnds && powerRatio(state, fromId, aiId) >= 1.5;
    if (!surrender && attitudeScore(state, aiId, fromId) < 40) {
      return { accept: false, reason: "We will not hand over one of our cities." };
    }
  }
  const ai = playerById(state, aiId)!;
  const p = personalityOf(state, aiId);
  // It will drain the treasury only to buy peace or when it genuinely fears the
  // other civ; otherwise it won't spend more than a slice of its gold on soft
  // concessions — and never gold it doesn't have.
  const goldAsked = goldOutlay(want);
  const buyingSafety = warEnds || powerRatio(state, fromId, aiId) > 1.4;
  const spendCap = buyingSafety ? ai.gold : Math.floor(ai.gold * 0.25);
  if (goldAsked > spendCap) {
    return { accept: false, reason: ai.gold < goldAsked ? "We cannot afford that." : "We will not part with so much gold." };
  }
  // A war-ending deal is charged the AI's price for peace: negative for a winner
  // (the offer must pay it off), positive for a loser (who gladly pays to get out).
  const gain =
    give.reduce((s, it) => s + itemValue(state, aiId, fromId, it), 0) +
    (warEnds ? -peacePrice(state, aiId, fromId) : 0);
  // Greedy/proud civs overvalue what they part with → drive a harder bargain.
  const costMult = 1 + (p.greed - 0.5) * 0.4 + Math.max(0, -attitudeScore(state, aiId, fromId)) / 200;
  // Units carry an extra standing-based premium when handed over: the AI won't
  // arm a civ it distrusts for a fair price (see unitPartingPremium). Surrendering
  // arms to END a war is different from arming a rival, so the premium is capped.
  const cost = want.reduce(
    (s, it) =>
      s + itemValue(state, aiId, fromId, it) *
        (it.kind === "unit" ? Math.min(unitPartingPremium(state, aiId, fromId), warEnds ? 2 : Infinity) : 1),
    0,
  ) * costMult;
  if (gain >= cost) {
    return { accept: true, reason: gain > cost * 1.3 ? "A most generous offer — agreed." : "These terms are acceptable." };
  }
  // Declined on value: if a concrete trade is on the table and the gap is
  // bridgeable, volley back a fair counter rather than a flat refusal.
  const counter = buildCounterOffer(give, want, cost - gain, warEnds);
  if (counter) {
    return { accept: false, reason: "Your offer is not worth what you ask — but we would accept this.", counter };
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
): { accept: boolean; reason: string; counter?: { give: DealItem[]; want: DealItem[] } } {
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
  if (canWar && ratio < 1.0 && p.aggression > 0.7 && canWageWarOn(state, aiId, fromId)) {
    declareWar(state, aiId, fromId);
    return { accept: false, reason: "You dare make demands of us? This means war!" };
  }
  return { accept: false, reason: ratio >= 1.3 ? "We will not be bullied — yet." : "You are in no position to make demands." };
}

/** A tribute demand's verdict WITHOUT side effects — the pure core of aiDecideDemand. */
function demandVerdict(state: GameState, aiId: number, fromId: number, want: DealItem[]): { accept: boolean; reason: string } {
  const p = personalityOf(state, aiId);
  const ratio = powerRatio(state, fromId, aiId);
  const required = 2.0 + p.boldness * 1.5;
  if (!canPayItems(state, aiId, want)) return { accept: false, reason: "They have nothing to give." };
  if (ratio >= required) return { accept: true, reason: "Their armies leave them no choice — they would yield." };
  return { accept: false, reason: ratio >= 1.3 ? "They will not be bullied — yet." : "They are in no position to be bullied." };
}

/**
 * How an AI recipient would answer a proposal, computed WITHOUT mutating state —
 * so the UI can tell the player up front whether a deal or demand will be met.
 * Returns null when there's no predictable verdict to show: the recipient is a
 * human/barbarian, the two haven't met, or the offer is empty. A redundant or
 * unpayable offer comes back as a refusal with the same reason the sim would give.
 */
export function previewProposal(
  state: GameState,
  fromId: number,
  toId: number,
  give: DealItem[],
  want: DealItem[],
  coercive = false,
): { accept: boolean; reason: string } | null {
  const to = playerById(state, toId);
  if (!to || to.isHuman || to.isBarbarian) return null;
  const rel = relationBetween(state, fromId, toId);
  if (!rel) return null;
  if (give.length === 0 && want.length === 0) return null;
  if (!canPayItems(state, fromId, give)) return { accept: false, reason: "You cannot provide that." };
  const redundant = redundantItem(rel, [...give, ...want]);
  if (redundant) return { accept: false, reason: redundant };
  if (coercive) return demandVerdict(state, toId, fromId, want);
  const d = aiDecideOffer(state, toId, fromId, give, want);
  return { accept: d.accept, reason: d.reason };
}

/**
 * Whether the AI (`toId`) would accept a peace offer from `fromId`, computed
 * WITHOUT side effects — mirrors the `makePeace` path (`aiAcceptsPeace`), which
 * lets a winning, proud AI hold out. Returns null when there's no verdict to show
 * (recipient is human/barbarian, or the two aren't at war).
 */
export function previewPeace(state: GameState, fromId: number, toId: number): { accept: boolean; reason: string } | null {
  const to = playerById(state, toId);
  if (!to || to.isHuman || to.isBarbarian) return null;
  const r = relationBetween(state, fromId, toId);
  if (!r || r.status !== "war") return null;
  if (!aiWantsWarOver(state, toId, fromId)) {
    const winning = powerRatio(state, toId, fromId) >= 1.5;
    return {
      accept: false,
      reason: winning
        ? "They smell victory. Only a staggering tribute could stay their hand."
        : "They refuse to make peace.",
    };
  }
  if (peacePrice(state, toId, fromId) > PEACE_FREE_LIMIT) {
    return { accept: false, reason: "They will end this war, but only for a price. Offer them a deal." };
  }
  return { accept: true, reason: "They are willing to end the war." };
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
  // Don't pile offers onto an existing pending proposal between the two, and don't
  // re-pitch a civ we've offered (or been rebuffed by) recently.
  if (state.diploProposals.some((p) => p.fromId === aiId && p.toId === otherId && p.status === "pending")) return false;
  if (offerOnCooldown(state, aiId, otherId)) return false;

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

/** A planned act of aggression against one civ, with a priority for comparison. */
type WarIntent =
  | { action: "demand"; demand: number; priority: number }
  | { action: "war"; priority: number };

/**
 * Whether — and how — the AI would move against `otherId` this turn, given its
 * temperament, the balance of power, and whether it can actually reach them. The
 * `priority` ranks rival targets so the AI commits to the single juiciest mark
 * rather than declaring war on everyone it dislikes at once.
 */
function aggressiveIntent(state: GameState, aiId: number, otherId: number): WarIntent | null {
  const r = relationBetween(state, aiId, otherId);
  if (!r || r.status !== "peace") return null;
  const other = playerById(state, otherId);
  if (!other || other.isBarbarian) return null;
  const p = personalityOf(state, aiId);
  const canWar = r.pact === "none" && (r.warAllowedTurn === undefined || state.turn >= r.warAllowedTurn);
  if (!canWar || !canWageWarOn(state, aiId, otherId)) return null;
  // Awaiting an answer to a standing demand → hold and see if they pay.
  if (state.diploProposals.some((pr) => pr.fromId === aiId && pr.toId === otherId && pr.coercive && pr.status === "pending")) {
    return null;
  }

  const ratio = powerRatio(state, aiId, otherId);
  const score = attitudeScore(state, aiId, otherId);
  // An enemy already mired in another war is a tempting, cheaper target.
  const opportunistic = other.atWar.some((id) => id !== aiId && !playerById(state, id)?.isBarbarian);
  const requiredRatio = (1.6 - p.aggression * 0.7) - (opportunistic ? 0.3 : 0);
  const scoreThreshold = -55 + p.aggression * 45;
  const despises = ratio >= requiredRatio && score <= scoreThreshold;
  const overwhelming = ratio >= 2.0;
  const refused = hasModifier(state, aiId, otherId, "__demandRefused");

  // Attractiveness as a mark: weaker, more-hated, beleaguered and nearer rank higher.
  const reach = nearestCityDistance(state, aiId, otherId);
  const priority = (ratio - 1) * 25 + Math.max(0, -score) * 0.5 + (opportunistic ? 25 : 0) - Math.min(reach, 25);

  // The overwhelmingly strong would rather extort than spend blood — demand
  // tribute first (the credible threat of war is the lever), unless already rebuffed.
  if (overwhelming && !refused && score < 25 && (p.greed > 0.4 || p.aggression > 0.5)) {
    const demand = 20 + Math.round((p.greed * 0.5 + p.aggression * 0.5) * 50);
    return { action: "demand", demand, priority };
  }
  // War: when it despises a civ it can beat, OR to make good on a refused demand.
  const enforceRefusal = refused && ratio >= requiredRatio && p.aggression > 0.45;
  if (despises || enforceRefusal) return { action: "war", priority: priority + (enforceRefusal ? 10 : 0) };
  return null;
}

/** An AI civ's diplomatic decisions for its turn, driven by its personality. */
export function aiConsiderDiplomacy(state: GameState, aiId: number): void {
  const me = playerById(state, aiId);
  if (!me || me.isHuman || me.isBarbarian) return;
  const p = personalityOf(state, aiId);

  // Pick a single best aggression target this turn — the AI shouldn't make war on
  // (or shake down) the whole world at once; it commits to the juiciest mark.
  let pick: { id: number; intent: WarIntent } | null = null;
  for (const otherId of me.met) {
    const intent = aggressiveIntent(state, aiId, otherId);
    if (intent && (!pick || intent.priority > pick.intent.priority)) pick = { id: otherId, intent };
  }
  if (pick) {
    if (pick.intent.action === "demand") demandTribute(state, aiId, pick.id, pick.intent.demand);
    else declareWar(state, aiId, pick.id);
  }

  for (const otherId of [...me.met]) {
    if (pick && otherId === pick.id) continue; // already acted on this civ
    const r = relationBetween(state, aiId, otherId);
    if (!r) continue;
    const other = playerById(state, otherId);
    if (!other || other.isBarbarian) continue;
    const score = attitudeScore(state, aiId, otherId);

    if (r.status === "war") {
      // Sue for peace when the AI wants the war over (war-weary, losing, or no
      // longer hostile) — aiSueForPeace decides the terms (bare, or for tribute).
      // Don't badger a human with the same peace offer every turn.
      if (aiWantsWarOver(state, aiId, otherId)) {
        const pendingPeace = state.diploProposals.some(
          (pr) => pr.fromId === aiId && pr.toId === otherId && pr.status === "pending",
        );
        if (!other.isHuman || (!pendingPeace && !offerOnCooldown(state, aiId, otherId))) {
          aiSueForPeace(state, aiId, otherId);
        }
      }
      continue;
    }

    // ---- at peace (and not our war target): cultivate ties or seek a trade ----
    // Friendly, loyal civs cultivate ties: open borders, then non-aggression.
    // Skip if we've recently pitched (or been turned down by) this civ.
    if (score >= 40 && r.pact === "none" && (state.turn + aiId) % 13 === 0 && !offerOnCooldown(state, aiId, otherId)) {
      if (!r.openBorders) {
        proposeDeal(state, aiId, otherId, [{ kind: "openBorders" }], [{ kind: "openBorders" }]);
        continue;
      } else if (!r.sharedVision) {
        // Once borders are open, friends swap maps too — shared eyes on the world.
        proposeDeal(state, aiId, otherId, [{ kind: "sharedVision" }], [{ kind: "sharedVision" }]);
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
