import { getTile } from "@roc/shared";
import type {
  Attitude, BarbarianActivity, BarbarianBribe, City, ContactEvent, GameOver, GameState,
  LogEntry, Proposal, Relation, Religion, TradeRoute, TurnUpdateEvent, Unit, Work,
} from "./state";
import { computeVisible } from "./visibility";
import { attitudeLabel, attitudeScore } from "./diplomacy";
import type { TechId } from "./content";

export interface DiploView {
  met: number[];
  /** Relations involving the viewer (full detail). */
  relations: Relation[];
  /** Each met civ's opinion of the viewer. */
  attitudeToYou: { from: number; score: number; label: string }[];
  reputation: Record<number, number>;
  contacts: ContactEvent[];
  /** Pending proposals where the viewer is sender or recipient. */
  proposals: Proposal[];
}

// ---- per-player view (fog enforced server-side; never leak unexplored data) --

export interface TileView {
  col: number;
  row: number;
  terrain: string;
  improvement?: string;
  road?: boolean;
  ownerCityId?: number;
  feature?: string;
  resource?: string;
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
    researchQueue: TechId[];
    researched: TechId[];
    cultureProgress: number;
    researchingCivic: string | null;
    civicsResearched: string[];
    government: string;
    policies: string[];
    faith: number;
    foundedReligionId?: string;
    resources: Record<string, number>;
    /** Barbarian bribes paid so far (drives the next bribe's escalating price). */
    bribesPaid: number;
    /** The viewer's active barbarian truces (war-band key + expiry turn). */
    barbarianBribes: { campKey: string; untilTurn: number }[];
    /** Last turn the viewer used their leader ability; -Infinity if never used. */
    leaderAbilityLastUsedTurn: number;
  };
  religions: Religion[];
  /** The viewer's own trade routes (for the map overlay + city panel). */
  tradeRoutes: TradeRoute[];
  /** The viewer's own public works in progress. */
  works: Work[];
  /** Wonders already completed in the world. */
  completedWonders: string[];
  /** Diplomacy known to the viewer. */
  diplomacy: DiploView;
  players: PlayerPublic[];
  cols: number;
  rows: number;
  tiles: TileView[]; // explored tiles only
  visible: string[];
  units: Unit[];
  cities: City[];
  log: LogEntry[];
  turnUpdates: TurnUpdateEvent[];
  gameOver: GameOver | null;
  barbarianActivity: BarbarianActivity;
}

/**
 * Whether a log entry is something `playerId` is allowed to see: world-wide news,
 * their own actions, actions aimed at them, or events on a tile they've explored.
 * Used to keep the game log free of other players' private moves (e.g. AI actions
 * happening out of sight). `known` is the player's explored tiles — since every
 * currently-visible tile is also explored, that set is sufficient.
 */
export function isLogEntryVisible(entry: LogEntry, playerId: number, known: Set<string>): boolean {
  if (entry.world) return true;
  if (entry.actorId === playerId) return true;
  if (entry.targetIds?.includes(playerId)) return true;
  if (entry.tile && known.has(`${entry.tile.col},${entry.tile.row}`)) return true;
  return false;
}

function buildDiploView(state: GameState, playerId: number): DiploView {
  const me = state.players.find((p) => p.id === playerId);
  const met = me ? [...me.met] : [];
  const relations = state.relations
    .filter((r) => r.a === playerId || r.b === playerId)
    .map((r) => ({ ...r, deals: r.deals.map((d) => ({ ...d })) }));
  const attitudeToYou = met.map((cid) => {
    const score = attitudeScore(state, cid, playerId);
    return { from: cid, score, label: attitudeLabel(score) };
  });
  const reputation: Record<number, number> = {};
  for (const cid of [playerId, ...met]) reputation[cid] = state.reputation[cid] ?? 0;
  return {
    met,
    relations,
    attitudeToYou,
    reputation,
    contacts: state.contactQueue.filter((e) => e.youId === playerId).map((e) => ({ ...e })),
    proposals: state.diploProposals.filter((p) => p.toId === playerId || p.fromId === playerId).map((p) => ({ ...p })),
  };
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
    if (t.resource) tv.resource = t.resource;
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

  const log = state.log.filter((entry) => isLogEntryVisible(entry, playerId, explored));
  const turnUpdates = state.turnUpdates
    .filter((e) => e.playerId === playerId)
    .sort((a, b) => a.id - b.id);

  return {
    turn: state.turn,
    yourId: playerId,
    you: {
      gold: me?.gold ?? 0,
      scienceProgress: me?.scienceProgress ?? 0,
      researching: me?.researching ?? null,
      researchQueue: me?.researchQueue ?? [],
      researched: me ? [...me.researched] : [],
      cultureProgress: me?.cultureProgress ?? 0,
      researchingCivic: me?.researchingCivic ?? null,
      civicsResearched: me ? [...me.civicsResearched] : [],
      government: me?.government ?? "chiefdom",
      policies: me ? [...me.policies] : [],
      faith: me?.faith ?? 0,
      foundedReligionId: me?.foundedReligionId,
      resources: me?.resources ?? {},
      bribesPaid: me?.bribesPaid ?? 0,
      leaderAbilityLastUsedTurn: me?.leaderAbilityLastUsedTurn ?? -Infinity,
      barbarianBribes: state.barbarianBribes
        .filter((b) => b.playerId === playerId)
        .map((b) => ({ campKey: b.campKey, untilTurn: b.untilTurn })),
    },
    religions: state.religions.map((r) => ({ ...r, beliefs: [...r.beliefs] })),
    tradeRoutes: state.tradeRoutes.filter((r) => r.ownerId === playerId).map((r) => ({ ...r })),
    works: state.works.filter((w) => w.ownerId === playerId).map((w) => ({ ...w, cityIds: [...w.cityIds] })),
    completedWonders: [...state.completedWonders],
    diplomacy: buildDiploView(state, playerId),
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
    log,
    turnUpdates,
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
  log: LogEntry[];
  gameOver: GameOver | null;
  turnLimit: number;
  religions: Religion[];
  tradeRoutes: TradeRoute[];
  works: Work[];
  completedWonders: string[];
  relations: Relation[];
  attitudes: Attitude[];
  reputation: Record<number, number>;
  contactQueue: ContactEvent[];
  diploProposals: Proposal[];
  barbarianActivity: BarbarianActivity;
  barbarianBribes: BarbarianBribe[];
  turnUpdates: TurnUpdateEvent[];
  nextTurnUpdateId: number;
  players: Array<
    Omit<GameState["players"][number], "researched" | "civicsResearched" | "explored"> & {
      researched: string[];
      civicsResearched: string[];
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
    works: state.works,
    completedWonders: state.completedWonders,
    relations: state.relations,
    attitudes: state.attitudes,
    reputation: state.reputation,
    contactQueue: state.contactQueue,
    diploProposals: state.diploProposals,
    barbarianActivity: state.barbarianActivity,
    barbarianBribes: state.barbarianBribes,
    turnUpdates: state.turnUpdates,
    nextTurnUpdateId: state.nextTurnUpdateId,
    players: state.players.map((p) => ({
      ...p,
      researched: [...p.researched],
      civicsResearched: [...p.civicsResearched],
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
    log: Array.isArray(s.log)
      ? (s.log as (LogEntry | string)[]).map((e) => (typeof e === "string" ? { message: e, turn: 0 } : e))
      : [],
    gameOver: s.gameOver,
    turnLimit: s.turnLimit,
    religions: s.religions,
    tradeRoutes: s.tradeRoutes ?? [],
    works: s.works ?? [],
    completedWonders: s.completedWonders ?? [],
    relations: s.relations ?? [],
    attitudes: s.attitudes ?? [],
    reputation: s.reputation ?? {},
    contactQueue: s.contactQueue ?? [],
    diploProposals: s.diploProposals ?? [],
    barbarianActivity: s.barbarianActivity ?? "normal",
    barbarianBribes: s.barbarianBribes ?? [],
    turnUpdates: s.turnUpdates ?? [],
    nextTurnUpdateId: s.nextTurnUpdateId ?? 1,
    players: s.players.map((p) => ({
      ...p,
      researchQueue: p.researchQueue ?? [],
      met: p.met ?? [],
      atWar: p.atWar ?? [],
      importedLuxuries: p.importedLuxuries ?? [],
      bribesPaid: p.bribesPaid ?? 0,
      leaderAbilityLastUsedTurn: p.leaderAbilityLastUsedTurn ?? -Infinity,
      modifiers: p.modifiers ?? [],
      researched: new Set(Array.isArray(p.researched) ? (p.researched as TechId[]) : []),
      civicsResearched: new Set(Array.isArray(p.civicsResearched) ? p.civicsResearched : []),
      explored: new Set(Array.isArray(p.explored) ? p.explored : []),
    })),
    units: new Map(s.units.map((u) => [u.id, u])),
    cities: new Map(s.cities.map((c) => [c.id, { ...c, modifiers: c.modifiers ?? [] }])),
  };
}
