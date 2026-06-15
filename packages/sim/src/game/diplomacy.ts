// Diplomacy between major civilizations. Civs meet on sight, hold opinions of
// one another, and conduct relations: peace/war, treaties and timed deals.
// Barbarians are excluded (always hostile). See docs/DIPLOMACY.md.

import { axialDistance, getTile, offsetToAxial } from "@roc/shared";
import { getCiv } from "@roc/data";
import type {
  Attitude,
  DealItem,
  GameState,
  Player,
  Relation,
} from "./state";
import { citiesOf, playerById, unitsOf, type City } from "./state";
import { UNIT_DEFS, isMilitary } from "./content";
import { RESOURCE_DEFS, tradeableLuxuries, type ResourceId } from "./resources";
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
  state.log.push(`${an} and ${bn} have made contact.`);
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
  state.log.push(`${civName(A)} declared war on ${civName(T)}!`);
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
  state.log.push(`${civName(playerById(state, aId)!)} and ${civName(playerById(state, targetId)!)} made peace.`);
  return ok;
}

// ---- soft actions --------------------------------------------------------

function hasModifier(state: GameState, from: number, to: number, reason: string): boolean {
  const at = state.attitudes.find((x) => x.from === from && x.to === to);
  return !!at?.modifiers.some((m) => m.reason === reason);
}

export function denounce(state: GameState, aId: number, targetId: number): DiploResult {
  const r = relationBetween(state, aId, targetId);
  if (!r) return fail("you have not met them");
  addModifier(state, targetId, aId, "you denounced us", -25, 40);
  addModifier(state, aId, targetId, "__denounced", 0, 15); // marker: a later war is not a surprise
  state.log.push(`${civName(playerById(state, aId)!)} denounced ${civName(playerById(state, targetId)!)}.`);
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
  state.log.push(`${civName(A)} sent a gift to ${civName(T)}.`);
  return ok;
}

export function demandTribute(state: GameState, aId: number, targetId: number, goldAmt: number, resourceId?: string): DiploResult {
  if (!relationBetween(state, aId, targetId)) return fail("you have not met them");
  const target = playerById(state, targetId);
  if (target?.isHuman) {
    // Coercive demand → a proposal where the target "gives" tribute for nothing.
    const want: DealItem[] = [];
    if (goldAmt > 0) want.push({ kind: "gold", amount: goldAmt });
    if (resourceId) want.push({ kind: "resource", id: resourceId, turns: 0 });
    return createProposal(state, aId, targetId, [], want);
  }
  // AI complies if afraid (we are much stronger) and not too proud.
  const fearful = militaryPower(state, aId) > militaryPower(state, targetId) * 1.6;
  const A = playerById(state, aId)!;
  const T = playerById(state, targetId)!;
  if (fearful && (goldAmt <= 0 || T.gold >= goldAmt)) {
    if (goldAmt > 0) { T.gold -= goldAmt; A.gold += goldAmt; }
    if (resourceId && (T.resources[resourceId] ?? 0) > 0) { T.resources[resourceId] = (T.resources[resourceId] ?? 0) - 1; A.resources[resourceId] = (A.resources[resourceId] ?? 0) + 1; }
    addModifier(state, targetId, aId, "you bullied us", -18, 50);
    state.log.push(`${civName(T)} paid tribute to ${civName(A)}.`);
    return ok;
  }
  addModifier(state, targetId, aId, "you made demands of us", -12, 30);
  return fail("they refuse your demand");
}

// ---- deals ---------------------------------------------------------------

export function createProposal(state: GameState, fromId: number, toId: number, give: DealItem[], want: DealItem[]): DiploResult {
  if (!relationBetween(state, fromId, toId)) return fail("you have not met them");
  if (!canPayItems(state, fromId, give)) return fail("you cannot provide that");
  state.diploProposals.push({ id: state.nextEntityId++, fromId, toId, give, want });
  return ok;
}

/** Propose a deal. Against an AI it is evaluated instantly; against a human it
 *  becomes a pending proposal. */
export function proposeDeal(state: GameState, fromId: number, targetId: number, give: DealItem[], want: DealItem[]): DiploResult {
  if (!relationBetween(state, fromId, targetId)) return fail("you have not met them");
  if (!canPayItems(state, fromId, give)) return fail("you cannot provide that");
  const target = playerById(state, targetId);
  if (target?.isHuman) return createProposal(state, fromId, targetId, give, want);
  if (!aiEvaluateOffer(state, targetId, fromId, give, want)) return fail("they reject your offer");
  if (!canPayItems(state, targetId, want)) return fail("they cannot provide what you ask");
  applyExchange(state, fromId, targetId, give, want);
  state.log.push(`${civName(playerById(state, fromId)!)} struck a deal with ${civName(target!)}.`);
  return ok;
}

export function respondProposal(state: GameState, playerId: number, proposalId: number, accept: boolean): DiploResult {
  const idx = state.diploProposals.findIndex((p) => p.id === proposalId && p.toId === playerId);
  if (idx < 0) return fail("no such proposal");
  const prop = state.diploProposals[idx]!;
  state.diploProposals.splice(idx, 1);
  if (!accept) return ok;
  if (!canPayItems(state, prop.fromId, prop.give) || !canPayItems(state, prop.toId, prop.want)) {
    return fail("the deal can no longer be honoured");
  }
  applyExchange(state, prop.fromId, prop.toId, prop.give, prop.want);
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
      state.log.push(`${civName(playerById(state, fromId)!)} lent a ${SPECIALIST_DEFS[type as SpecialistId]?.name ?? "specialist"} to ${civName(playerById(state, toId)!)}.`);
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

function aiAcceptsPeace(state: GameState, aiId: number, otherId: number): boolean {
  const r = relationBetween(state, aiId, otherId);
  if (!r) return false;
  const warDuration = state.turn - r.lastStatusChangeTurn;
  const losing = militaryPower(state, aiId) < militaryPower(state, otherId) * 0.9;
  const weary = warDuration >= 12;
  const score = attitudeScore(state, aiId, otherId);
  return losing || weary || score > -30;
}

/** Rough gold-value the AI places on a deal item it would RECEIVE. */
function itemValue(state: GameState, aiId: number, otherId: number, item: DealItem): number {
  switch (item.kind) {
    case "gold": return item.amount;
    case "goldPerTurn": return item.amount * item.turns * 0.8;
    case "resource": return item.turns * 6;
    case "specialist": return item.turns * 4;
    case "peace": return atWar(state, aiId, otherId) ? 80 : 0;
    case "openBorders": return 10 + attitudeScore(state, aiId, otherId) * 0.2;
    case "pact": {
      const att = attitudeScore(state, aiId, otherId);
      if (item.tier === "alliance" && att < 40) return -999; // won't ally a non-friend
      if (item.tier === "defensive" && att < 10) return -999;
      return (item.tier === "alliance" ? 30 : item.tier === "defensive" ? 18 : 8) + att * 0.2;
    }
    case "declareWarOn": return -40; // costly favour
  }
}

function aiEvaluateOffer(state: GameState, aiId: number, fromId: number, give: DealItem[], want: DealItem[]): boolean {
  // give = what the proposer gives the AI; want = what the AI must give up.
  const gain = give.reduce((s, it) => s + itemValue(state, aiId, fromId, it), 0);
  const cost = want.reduce((s, it) => s + itemValue(state, aiId, fromId, it), 0);
  if (give.some((it) => it.kind === "pact" && itemValue(state, aiId, fromId, it) < -900)) return false;
  return gain >= cost;
}

/** An AI civ's diplomatic decisions for its turn. */
export function aiConsiderDiplomacy(state: GameState, aiId: number): void {
  const me = playerById(state, aiId);
  if (!me || me.isHuman || me.isBarbarian) return;
  for (const otherId of [...me.met]) {
    const r = relationBetween(state, aiId, otherId);
    if (!r) continue;
    const score = attitudeScore(state, aiId, otherId);
    if (r.status === "war") {
      // sue for peace if weary or losing
      if (aiAcceptsPeace(state, aiId, otherId) && militaryPower(state, aiId) < militaryPower(state, otherId)) {
        makePeace(state, aiId, otherId);
      }
      continue;
    }
    // at peace: consider war if hostile, strong, and free of pacts
    const canWar = r.warAllowedTurn === undefined || state.turn >= r.warAllowedTurn;
    const strong = militaryPower(state, aiId) > militaryPower(state, otherId) * 1.3;
    if (score <= -40 && strong && r.pact === "none" && canWar) {
      declareWar(state, aiId, otherId);
      continue;
    }
    // friendly upkeep: occasionally offer mutual open borders
    if (score >= 40 && r.pact === "none" && !r.openBorders && (state.turn + aiId) % 13 === 0) {
      proposeDeal(state, aiId, otherId, [{ kind: "openBorders" }], [{ kind: "openBorders" }]);
    }
  }
}
