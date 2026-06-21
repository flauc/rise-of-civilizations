import { getTile } from "@roc/shared";
import type {
  Attitude, BarbarianActivity, BarbarianBribe, City, ContactEvent, GameOver, GameState,
  LogEntry, MoraleEvent, Proposal, Relation, Religion, TradeRecord, TradeRoute, TurnUpdateEvent, Unit, Work,
} from "./state";
import { computeVisible } from "./visibility";
import { tileHasBridge } from "./movement";
import { attitudeLabel, attitudeScore } from "./diplomacy";
import { GLOBAL_MORALE_BASE } from "./morale";
import type { TechId } from "./content";

export interface DiploView {
  met: number[];
  /** Relations involving the viewer (full detail). */
  relations: Relation[];
  /** Each met civ's opinion of the viewer, with the reasons that shape it. */
  attitudeToYou: {
    from: number;
    score: number;
    label: string;
    modifiers: { reason: string; value: number }[];
  }[];
  reputation: Record<number, number>;
  contacts: ContactEvent[];
  /** Proposals where the viewer is sender or recipient. */
  proposals: Proposal[];
  /** Diplomatic history (deals, gifts, wars…) involving the viewer. */
  tradeHistory: TradeRecord[];
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
  naturalWonder?: string;
  wonder?: string;
  river?: number;
  riverLake?: boolean;
  bridge?: boolean;
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
    /** Empire-wide morale (0–200; base 50). */
    globalMorale: number;
    /** Recent global-morale changes (most recent last) for the morale dialog. */
    moraleLog: MoraleEvent[];
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
    /** Great-person points accumulated per class. */
    greatPeoplePoints: Partial<Record<string, number>>;
    /** Lifetime figures earned per class (drives the rising threshold). */
    greatPeopleEarned: Partial<Record<string, number>>;
    /** Recruited Great People not yet activated (figure ids). */
    greatPeople: string[];
    /** Lifetime count of Legends recruited (drives the rising cost). */
    legendsRecruited: number;
  };
  religions: Religion[];
  /** The viewer's own trade routes (for the map overlay + city panel). */
  tradeRoutes: TradeRoute[];
  /** The viewer's own public works in progress. */
  works: Work[];
  /** Wonders already completed in the world. */
  completedWonders: string[];
  /** Great-person ids already recruited by anyone (gone for the world). */
  recruitedGreatPeople: string[];
  /** Whether the Legends feature is on this game. */
  legendsEnabled: boolean;
  /** Legend ids currently recruited somewhere in the world. */
  recruitedLegends: string[];
  /** Natural-wonder ids placed on this map. */
  naturalWonderIds: string[];
  /** First civ to sight each natural wonder (wonderId -> player id). */
  discoveredWonders: Record<string, number>;
  /** First civ to have sighted every natural wonder (undefined until claimed). */
  allNaturalWondersClaimedBy?: number;
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
    const at = state.attitudes.find((x) => x.from === cid && x.to === playerId);
    // Surface only player-meaningful modifiers (hide internal markers, drop zeros).
    const modifiers = (at?.modifiers ?? [])
      .filter((m) => !m.reason.startsWith("__") && m.value !== 0)
      .map((m) => ({ reason: m.reason, value: m.value }));
    return { from: cid, score, label: attitudeLabel(score), modifiers };
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
    tradeHistory: state.tradeHistory
      .filter((t) => t.fromId === playerId || t.toId === playerId)
      .map((t) => ({ ...t })),
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
    if (t.naturalWonder) tv.naturalWonder = t.naturalWonder;
    if (t.wonder) tv.wonder = t.wonder;
    if (t.river) tv.river = t.river;
    if (t.riverLake) tv.riverLake = true;
    if (tileHasBridge(state, col, row)) tv.bridge = true;
    tiles.push(tv);
  }

  const units: Unit[] = [];
  for (const u of state.units.values()) {
    // Hidden enemy units are concealed even on a visible tile until discovered.
    if (u.ownerId === playerId || (visible.has(`${u.col},${u.row}`) && !u.hidden)) units.push(u);
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
      globalMorale: me?.globalMorale ?? GLOBAL_MORALE_BASE,
      moraleLog: me?.moraleLog ? me.moraleLog.map((e) => ({ ...e })) : [],
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
      greatPeoplePoints: { ...(me?.greatPeoplePoints ?? {}) },
      greatPeopleEarned: { ...(me?.greatPeopleEarned ?? {}) },
      greatPeople: [...(me?.greatPeople ?? [])],
      legendsRecruited: me?.legendsRecruited ?? 0,
      barbarianBribes: state.barbarianBribes
        .filter((b) => b.playerId === playerId)
        .map((b) => ({ campKey: b.campKey, untilTurn: b.untilTurn })),
    },
    religions: state.religions.map((r) => ({ ...r, beliefs: [...r.beliefs] })),
    tradeRoutes: state.tradeRoutes.filter((r) => r.ownerId === playerId).map((r) => ({ ...r })),
    works: state.works.filter((w) => w.ownerId === playerId).map((w) => ({ ...w, cityIds: [...w.cityIds] })),
    completedWonders: [...state.completedWonders],
    recruitedGreatPeople: [...(state.recruitedGreatPeople ?? [])],
    legendsEnabled: state.legendsEnabled ?? true,
    recruitedLegends: [...(state.recruitedLegends ?? [])],
    naturalWonderIds: [...state.naturalWonderIds],
    discoveredWonders: { ...state.discoveredWonders },
    allNaturalWondersClaimedBy: state.allNaturalWondersClaimedBy,
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
  recruitedGreatPeople: string[];
  legendsEnabled: boolean;
  recruitedLegends: string[];
  naturalWonderIds: string[];
  discoveredWonders: Record<string, number>;
  allNaturalWondersClaimedBy?: number;
  relations: Relation[];
  attitudes: Attitude[];
  reputation: Record<number, number>;
  contactQueue: ContactEvent[];
  diploProposals: Proposal[];
  tradeHistory: TradeRecord[];
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
    recruitedGreatPeople: state.recruitedGreatPeople ?? [],
    legendsEnabled: state.legendsEnabled ?? true,
    recruitedLegends: state.recruitedLegends ?? [],
    naturalWonderIds: state.naturalWonderIds,
    discoveredWonders: state.discoveredWonders,
    allNaturalWondersClaimedBy: state.allNaturalWondersClaimedBy,
    relations: state.relations,
    attitudes: state.attitudes,
    reputation: state.reputation,
    contactQueue: state.contactQueue,
    diploProposals: state.diploProposals,
    tradeHistory: state.tradeHistory,
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
    recruitedGreatPeople: s.recruitedGreatPeople ?? [],
    legendsEnabled: s.legendsEnabled ?? true,
    recruitedLegends: s.recruitedLegends ?? [],
    naturalWonderIds: s.naturalWonderIds ?? [],
    discoveredWonders: s.discoveredWonders ?? {},
    allNaturalWondersClaimedBy: s.allNaturalWondersClaimedBy,
    relations: s.relations ?? [],
    attitudes: s.attitudes ?? [],
    reputation: s.reputation ?? {},
    contactQueue: s.contactQueue ?? [],
    diploProposals: s.diploProposals ?? [],
    tradeHistory: s.tradeHistory ?? [],
    barbarianActivity: s.barbarianActivity ?? "normal",
    barbarianBribes: s.barbarianBribes ?? [],
    turnUpdates: s.turnUpdates ?? [],
    nextTurnUpdateId: s.nextTurnUpdateId ?? 1,
    players: s.players.map((p) => ({
      ...p,
      globalMorale: p.globalMorale ?? GLOBAL_MORALE_BASE,
      researchQueue: p.researchQueue ?? [],
      met: p.met ?? [],
      atWar: p.atWar ?? [],
      importedLuxuries: p.importedLuxuries ?? [],
      bribesPaid: p.bribesPaid ?? 0,
      leaderAbilityLastUsedTurn: p.leaderAbilityLastUsedTurn ?? -Infinity,
      modifiers: p.modifiers ?? [],
      greatPeoplePoints: p.greatPeoplePoints ?? {},
      greatPeopleEarned: p.greatPeopleEarned ?? {},
      greatPeople: p.greatPeople ?? [],
      legendsRecruited: p.legendsRecruited ?? 0,
      researched: new Set(Array.isArray(p.researched) ? (p.researched as TechId[]) : []),
      civicsResearched: new Set(Array.isArray(p.civicsResearched) ? p.civicsResearched : []),
      explored: new Set(Array.isArray(p.explored) ? p.explored : []),
    })),
    units: new Map(s.units.map((u) => [u.id, u])),
    cities: new Map(s.cities.map((c) => [c.id, { ...c, modifiers: c.modifiers ?? [] }])),
  };
}
