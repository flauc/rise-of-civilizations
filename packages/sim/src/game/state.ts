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
}

export interface Religion {
  id: string;
  name: string;
  founderId: number;
  holyCityId: number;
  beliefs: string[];
}

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
  return true; // M2: everyone is hostile to everyone (no diplomacy yet)
}
