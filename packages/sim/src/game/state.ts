import type { GameMap } from "@roc/shared";
import { UNIT_DEFS, UNIT_MAX_HP, type BuildingId, type PromotionId, type TechId, type UnitTypeId } from "./content";

export interface Unit {
  id: number;
  ownerId: number;
  type: UnitTypeId;
  col: number;
  row: number;
  movementLeft: number;
  hp: number;
  xp: number;
  level: number;
  unspentPromotions: number;
  promotions: PromotionId[];
  /** Set when the unit attacks; blocks healing next turn. */
  attackedThisTurn: boolean;
  attackedLastTurn: boolean;
  /** Builder charges remaining (workers only). */
  charges: number;
}

export type ProductionItem =
  | { kind: "unit"; id: UnitTypeId }
  | { kind: "building"; id: BuildingId };

/** A craft a specialist practises; Works require labour of specific disciplines. */
export type Discipline = "carpentry" | "survey" | "masonry" | "architecture" | "engineering";

/** A citizen trained into a craft (lives on its City, never on the map). */
export interface Specialist {
  id: number;
  /** SpecialistId (see specialists.ts). */
  type: string;
  /** Personal name (historic, civ-flavored); optional for legacy saves. */
  name?: string;
  xp: number;
  level: number;
}

export interface City {
  id: number;
  ownerId: number;
  name: string;
  col: number;
  row: number;
  population: number;
  foodStored: number;
  productionStored: number;
  production: ProductionItem | null;
  buildings: BuildingId[];
  /** Craftsmen trained from this city's population. */
  specialists: Specialist[];
  /** Wonder ids completed and hosted in this city. */
  wonders: string[];
  /** Tile keys ("col,row") this city's citizens are assigned to work. */
  workedTiles: string[];
  /** Dominant religion id in this city (undefined = none). */
  religion?: string;
  isCapital: boolean;
  /** True if this city was founded as a capital (an "original capital" for the
   *  domination victory — stays true even after capture). */
  foundedAsCapital: boolean;
  hp: number;
  lastAttackedTurn: number;
  rangedAttackUsed: boolean;
}

export interface GameOver {
  winnerId: number;
  condition: "domination" | "score" | "religious";
}

export interface Player {
  id: number;
  name: string;
  color: string;
  isHuman: boolean;
  isBarbarian: boolean;
  /** Civilization id (see @roc/data); undefined for barbarians. */
  civId?: string;
  gold: number;
  researched: Set<TechId>;
  researching: TechId | null;
  scienceProgress: number;
  // Civics / government (culture tree)
  civicsResearched: Set<string>;
  researchingCivic: string | null;
  cultureProgress: number;
  government: string;
  /** Active policy-card ids (capped at the government's slot count). */
  policies: string[];
  // Religion
  faith: number;
  /** Religion id this player founded (if any). */
  foundedReligionId?: string;
  explored: Set<string>;
  /** Stockpiles of strategic resources (and counts of all owned resources). */
  resources: Record<string, number>;
  // Diplomacy
  /** Ids of major civs this player has met (enables diplomacy with them). */
  met: number[];
  /** Ids of civs this player is currently at war with (drives areEnemies). */
  atWar: number[];
}

export interface Religion {
  id: string;
  name: string;
  founderId: number;
  holyCityId: number;
  beliefs: string[];
}

/** A public-works project: develop/upgrade a tile, or raise a wonder. */
export interface Work {
  id: number;
  ownerId: number;
  /** "farm"|"mine"|"quarry"|"lumber_camp"|"road"|"wall"|"tower"|"wonder" (see works.ts). */
  kind: string;
  /** Target tier (1–3) for tile/defensive works. */
  tier?: number;
  /** Target tile for tile/defensive works. */
  target?: { col: number; row: number };
  /** Wonder id (for wonder works). */
  wonderId?: string;
  /** City whose population/queue owns this work. */
  hostCityId: number;
  /** Cities contributing specialist labour (>=1). */
  cityIds: number[];
  /** Labour required, by discipline. */
  requirement: Partial<Record<Discipline, number>>;
  /** Labour accumulated so far, by discipline. */
  progress: Partial<Record<Discipline, number>>;
}

// ---- diplomacy -----------------------------------------------------------

export type DiploStatus = "peace" | "war";
export type PactTier = "none" | "non_aggression" | "defensive" | "alliance";

/** One side of a proposed/active exchange. */
export type DealItem =
  | { kind: "gold"; amount: number }
  | { kind: "goldPerTurn"; amount: number; turns: number }
  | { kind: "resource"; id: string; turns: number }
  | { kind: "peace" }
  | { kind: "openBorders" }
  | { kind: "pact"; tier: Exclude<PactTier, "none">; turns: number }
  | { kind: "declareWarOn"; civId: number };

/** A timed obligation created by an accepted deal (e.g. gold/turn for N turns). */
export interface DealObligation {
  fromId: number;
  item: DealItem;
  untilTurn: number;
}

/** Shared relationship record for a met pair of major civs (a < b). */
export interface Relation {
  a: number;
  b: number;
  status: DiploStatus;
  metTurn: number;
  lastStatusChangeTurn: number;
  /** Earliest turn war may be re-declared after a peace (cooldown); undefined = now. */
  warAllowedTurn?: number;
  openBorders: boolean;
  pact: PactTier;
  pactUntilTurn?: number;
  deals: DealObligation[];
}

export interface AttitudeModifier {
  reason: string;
  value: number;
  expiresTurn?: number;
}

/** A civ's directional opinion of another (AI-held; 'from' is usually an AI). */
export interface Attitude {
  from: number;
  to: number;
  modifiers: AttitudeModifier[];
}

/** A newly-met civ awaiting the viewer's acknowledgement (drives the dialog). */
export interface ContactEvent {
  youId: number;
  otherId: number;
  isPlayerCiv: boolean;
}

/** A consensual offer awaiting the recipient's accept/reject. */
export interface Proposal {
  id: number;
  fromId: number;
  toId: number;
  give: DealItem[];
  want: DealItem[];
}

/** A trade route carrying goods from one of a player's cities to another. */
export interface TradeRoute {
  id: number;
  ownerId: number;
  /** Origin city — receives the bulk of the route's yields. */
  fromCityId: number;
  /** Destination city — receives a smaller share. */
  toCityId: number;
}

export type BarbarianActivity = "none" | "low" | "normal" | "high";

export interface GameState {
  map: GameMap;
  players: Player[];
  units: Map<number, Unit>;
  cities: Map<number, City>;
  turn: number;
  currentPlayerIndex: number;
  nextEntityId: number;
  log: string[];
  gameOver: GameOver | null;
  turnLimit: number;
  religions: Religion[];
  /** Active trade routes between cities (all players). */
  tradeRoutes: TradeRoute[];
  /** In-progress public-works projects (all players). */
  works: Work[];
  /** Wonder ids already completed somewhere in the world (each is world-unique). */
  completedWonders: string[];
  // Diplomacy
  /** Relationship records for met pairs of major civs. */
  relations: Relation[];
  /** Directional attitudes (AI-held opinions). */
  attitudes: Attitude[];
  /** Warmonger reputation per player (raised by aggression, decays over time). */
  reputation: Record<number, number>;
  /** First-contact events awaiting the human's acknowledgement. */
  contactQueue: ContactEvent[];
  /** Consensual offers awaiting a response. */
  diploProposals: Proposal[];
  /** Barbarian intensity setting for this game. */
  barbarianActivity: BarbarianActivity;
}

/** Construct a unit with all combat fields defaulted. movementLeft starts 0
 *  (set by beginTurn). XP bonus (e.g. from Barracks) can be passed in. */
export function makeUnit(
  id: number,
  ownerId: number,
  type: UnitTypeId,
  col: number,
  row: number,
  xp = 0,
): Unit {
  return {
    id,
    ownerId,
    type,
    col,
    row,
    movementLeft: 0,
    hp: UNIT_MAX_HP,
    xp,
    level: 1,
    unspentPromotions: 0,
    promotions: [],
    attackedThisTurn: false,
    attackedLastTurn: false,
    charges: UNIT_DEFS[type].builder ? 3 : 0,
  };
}

export function currentPlayer(state: GameState): Player {
  return state.players[state.currentPlayerIndex]!;
}

export function playerById(state: GameState, id: number): Player | undefined {
  return state.players.find((p) => p.id === id);
}

export function unitsOf(state: GameState, playerId: number): Unit[] {
  return [...state.units.values()].filter((u) => u.ownerId === playerId);
}

export function citiesOf(state: GameState, playerId: number): City[] {
  return [...state.cities.values()].filter((c) => c.ownerId === playerId);
}

export function unitAt(state: GameState, col: number, row: number): Unit | undefined {
  for (const u of state.units.values()) {
    if (u.col === col && u.row === row) return u;
  }
  return undefined;
}

export function cityAt(state: GameState, col: number, row: number): City | undefined {
  for (const c of state.cities.values()) {
    if (c.col === col && c.row === row) return c;
  }
  return undefined;
}

export function areEnemies(a: Player, b: Player): boolean {
  if (a.id === b.id) return false;
  // Barbarians are hostile to everyone; otherwise hostility requires a declared war.
  if (a.isBarbarian || b.isBarbarian) return true;
  return a.atWar.includes(b.id);
}
