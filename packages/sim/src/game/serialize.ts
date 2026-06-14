import { getTile } from "@roc/shared";
import type { BarbarianActivity, GameState, Unit, City, GameOver, Religion, TradeRoute } from "./state";
import { computeVisible } from "./visibility";
import type { TechId } from "./content";

// ---- per-player view (fog enforced server-side; never leak unexplored data) --

export interface TileView {
  col: number;
  row: number;
  terrain: string;
  improvement?: string;
  road?: boolean;
  ownerCityId?: number;
  feature?: string;
}

export interface PlayerPublic {
  id: number;
  name: string;
  color: string;
  isHuman: boolean;
  isBarbarian: boolean;
  civId?: string;
}

export interface PlayerView {
  turn: number;
  yourId: number;
  you: {
    gold: number;
    scienceProgress: number;
    researching: TechId | null;
    researched: TechId[];
    cultureProgress: number;
    researchingCivic: string | null;
    civicsResearched: string[];
    government: string;
    policies: string[];
    faith: number;
    foundedReligionId?: string;
  };
  religions: Religion[];
  /** The viewer's own trade routes (for the map overlay + city panel). */
  tradeRoutes: TradeRoute[];
  players: PlayerPublic[];
  cols: number;
  rows: number;
  tiles: TileView[]; // explored tiles only
  visible: string[];
  units: Unit[];
  cities: City[];
  log: string[];
  gameOver: GameOver | null;
  barbarianActivity: BarbarianActivity;
}

/** Build the state a player is allowed to see (fog of war enforced here). */
export function viewForPlayer(state: GameState, playerId: number): PlayerView {
  const me = state.players.find((p) => p.id === playerId);
  const explored = me?.explored ?? new Set<string>();
  const visible = computeVisible(state, playerId);

  const tiles: TileView[] = [];
  for (const key of explored) {
    const [col, row] = key.split(",").map(Number) as [number, number];
    const t = getTile(state.map, col, row);
    if (!t) continue;
    const tv: TileView = { col, row, terrain: t.terrain };
    if (t.improvement) tv.improvement = t.improvement;
    if (t.road) tv.road = true;
    if (t.ownerCityId !== undefined) tv.ownerCityId = t.ownerCityId;
    if (t.feature) tv.feature = t.feature;
    tiles.push(tv);
  }

  const units: Unit[] = [];
  for (const u of state.units.values()) {
    if (u.ownerId === playerId || visible.has(`${u.col},${u.row}`)) units.push(u);
  }
  const cities: City[] = [];
  for (const c of state.cities.values()) {
    if (c.ownerId === playerId || visible.has(`${c.col},${c.row}`)) cities.push(c);
  }

  return {
    turn: state.turn,
    yourId: playerId,
    you: {
      gold: me?.gold ?? 0,
      scienceProgress: me?.scienceProgress ?? 0,
      researching: me?.researching ?? null,
      researched: me ? [...me.researched] : [],
      cultureProgress: me?.cultureProgress ?? 0,
      researchingCivic: me?.researchingCivic ?? null,
      civicsResearched: me ? [...me.civicsResearched] : [],
      government: me?.government ?? "chiefdom",
      policies: me ? [...me.policies] : [],
      faith: me?.faith ?? 0,
      foundedReligionId: me?.foundedReligionId,
    },
    religions: state.religions.map((r) => ({ ...r, beliefs: [...r.beliefs] })),
    tradeRoutes: state.tradeRoutes.filter((r) => r.ownerId === playerId).map((r) => ({ ...r })),
    players: state.players.map((p) => ({
      id: p.id,
      name: p.name,
      color: p.color,
      isHuman: p.isHuman,
      isBarbarian: p.isBarbarian,
      civId: p.civId,
    })),
    cols: state.map.cols,
    rows: state.map.rows,
    tiles,
    visible: [...visible],
    units,
    cities,
    log: state.log.slice(-12),
    gameOver: state.gameOver,
    barbarianActivity: state.barbarianActivity,
  };
}

// ---- full (de)serialization for persistence (snapshots) ------------------

export interface SerializedState {
  map: GameState["map"];
  turn: number;
  currentPlayerIndex: number;
  nextEntityId: number;
  log: string[];
  gameOver: GameOver | null;
  turnLimit: number;
  religions: Religion[];
  tradeRoutes: TradeRoute[];
  barbarianActivity: BarbarianActivity;
  players: Array<
    Omit<GameState["players"][number], "researched" | "explored"> & {
      researched: string[];
      explored: string[];
    }
  >;
  units: Unit[];
  cities: City[];
}

export function serializeState(state: GameState): SerializedState {
  return {
    map: state.map,
    turn: state.turn,
    currentPlayerIndex: state.currentPlayerIndex,
    nextEntityId: state.nextEntityId,
    log: state.log,
    gameOver: state.gameOver,
    turnLimit: state.turnLimit,
    religions: state.religions,
    tradeRoutes: state.tradeRoutes,
    barbarianActivity: state.barbarianActivity,
    players: state.players.map((p) => ({
      ...p,
      researched: [...p.researched],
      explored: [...p.explored],
    })),
    units: [...state.units.values()],
    cities: [...state.cities.values()],
  };
}

export function deserializeState(s: SerializedState): GameState {
  return {
    map: s.map,
    turn: s.turn,
    currentPlayerIndex: s.currentPlayerIndex,
    nextEntityId: s.nextEntityId,
    log: s.log,
    gameOver: s.gameOver,
    turnLimit: s.turnLimit,
    religions: s.religions,
    tradeRoutes: s.tradeRoutes ?? [],
    barbarianActivity: s.barbarianActivity ?? "normal",
    players: s.players.map((p) => ({
      ...p,
      researched: new Set(p.researched as TechId[]),
      explored: new Set(p.explored),
    })),
    units: new Map(s.units.map((u) => [u.id, u])),
    cities: new Map(s.cities.map((c) => [c.id, c])),
  };
}
