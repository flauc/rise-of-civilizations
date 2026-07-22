import { getTile } from "@roc/shared";
import type {
  Attitude, AiDifficulty, BarbarianActivity, BarbarianBribe, City, ContactEvent, GameOver, GameState,
  LogEntry, MoraleEvent, Proposal, Relation, Religion, RoadRoute, TradeRecord, TradeRoute, TurnUpdateEvent,
  Unit, VictoryKind, Work,
} from "./state";
import { defaultEnabledVictories } from "./state";
import { exploredForPlayer, visibleForPlayer } from "./visibility";
import { attitudeLabel, attitudeScore } from "./diplomacy";
import { GLOBAL_MORALE_BASE } from "./morale";
import type { TechId } from "./content";
import { normalizeGameSpeed, type GameSpeed } from "./game-speed";
import { normalizeAiDifficulty } from "./ai-difficulty";

/** Wire-safe unit snapshot — never alias live sim state (patch diffs compare views). */
function cloneUnit(u: Unit): Unit {
  return {
    ...u,
    promotions: [...u.promotions],
    ...(u.abilityCooldowns ? { abilityCooldowns: { ...u.abilityCooldowns } } : {}),
    ...(u.inTransit ? { inTransit: { ...u.inTransit } } : {}),
  };
}

/** Wire-safe city snapshot — never alias live sim state (patch diffs compare views). */
function cloneCity(c: City): City {
  return {
    ...c,
    buildings: [...c.buildings],
    training: { ...c.training },
    trainingQueue: c.trainingQueue.map((o) => ({ ...o })),
    specialists: c.specialists.map((s) => ({ ...s })),
    wonders: [...c.wonders],
    workedTiles: [...c.workedTiles],
    lockedTiles: c.lockedTiles ? [...c.lockedTiles] : undefined,
    lockedSpecialists: c.lockedSpecialists ? [...c.lockedSpecialists] : undefined,
    pendingSpecialistRelease: c.pendingSpecialistRelease ? [...c.pendingSpecialistRelease] : undefined,
    expandTarget: c.expandTarget ? { ...c.expandTarget } : undefined,
    religionPressure: c.religionPressure ? { ...c.religionPressure } : undefined,
    greatWorks: c.greatWorks?.map((w) => ({ ...w })),
    production: c.production ? { ...c.production } : null,
    modifiers: c.modifiers.map((m) => ({ ...m, effect: { ...m.effect } })),
  };
}

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
  /** Tree-clad hills (visual decor overlay). */
  wooded?: boolean;
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
  /** Turn at which the score victory triggers; 0 = unlimited (no turn cap). */
  turnLimit: number;
  /** How costly research and civics are. */
  gameSpeed: GameSpeed;
  yourId: number;
  you: {
    gold: number;
    /** Empire-wide morale (0–200; base 50). */
    globalMorale: number;
    /** Military-pay setting (−100…+200) scaling unit upkeep and morale decay. */
    upkeepModifierPct: number;
    /** Recent global-morale changes (most recent last) for the morale dialog. */
    moraleLog: MoraleEvent[];
    scienceProgress: number;
    researching: TechId | null;
    researchQueue: TechId[];
    researched: TechId[];
    cultureProgress: number;
    researchingGovernment: string | null;
    governmentsResearched: string[];
    civicsAdopted: string[];
    slottedCivics: string[];
    unrestTurns: number;
    governmentChangedTurn: number;
    government: string;
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
  /** The viewer's own multi-tile road routes being paved. */
  roadRoutes: RoadRoute[];
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
  /** Which opposite edges hold the frozen poles ("ns" or "ew"); for polar decor. */
  poleAxis?: "ns" | "ew";
  tiles: TileView[]; // explored tiles only
  visible: string[];
  units: Unit[];
  cities: City[];
  log: LogEntry[];
  turnUpdates: TurnUpdateEvent[];
  gameOver: GameOver | null;
  /** Decisive win conditions enabled this game (score/extinction always apply). */
  enabledVictories: VictoryKind[];
  barbarianActivity: BarbarianActivity;
  aiDifficulty: AiDifficulty;
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

/** Max log lines included in a wire PlayerView (full game log still grows client-side via patches). */
export const VIEW_WIRE_LOG_MAX = 200;

/** Build the state a player is allowed to see (fog of war enforced here). */
export function viewForPlayer(state: GameState, playerId: number): PlayerView {
  const me = state.players.find((p) => p.id === playerId);
  // Borrowed map-exchange sight is folded in here; partner tiles never mutate the
  // viewer's persisted `explored` set, so cancelling the pact revokes them cleanly.
  const explored = exploredForPlayer(state, playerId);
  const visible = visibleForPlayer(state, playerId);

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
    if (t.wooded) tv.wooded = true;
    tiles.push(tv);
  }

  const units: Unit[] = [];
  for (const u of state.units.values()) {
    // Cargo is hidden below decks — never reveal enemy troops stowed on a ship.
    if (u.aboardShipId !== undefined) {
      if (u.ownerId === playerId) units.push(cloneUnit(u));
      continue;
    }
    // Hidden enemy units are concealed even on a visible tile until discovered.
    if (u.ownerId === playerId || (visible.has(`${u.col},${u.row}`) && !u.hidden)) units.push(cloneUnit(u));
  }
  const cities: City[] = [];
  for (const c of state.cities.values()) {
    if (c.ownerId === playerId || visible.has(`${c.col},${c.row}`)) cities.push(cloneCity(c));
  }

  const allLog = state.log.filter((entry) => isLogEntryVisible(entry, playerId, explored));
  const log =
    allLog.length > VIEW_WIRE_LOG_MAX ? allLog.slice(-VIEW_WIRE_LOG_MAX) : allLog;
  const turnUpdates = state.turnUpdates
    .filter((e) => e.playerId === playerId)
    .sort((a, b) => a.id - b.id);

  return {
    turn: state.turn,
    turnLimit: state.turnLimit,
    gameSpeed: normalizeGameSpeed(state.gameSpeed),
    yourId: playerId,
    you: {
      gold: me?.gold ?? 0,
      globalMorale: me?.globalMorale ?? GLOBAL_MORALE_BASE,
      upkeepModifierPct: me?.upkeepModifierPct ?? 0,
      moraleLog: me?.moraleLog ? me.moraleLog.map((e) => ({ ...e })) : [],
      scienceProgress: me?.scienceProgress ?? 0,
      researching: me?.researching ?? null,
      researchQueue: me?.researchQueue ?? [],
      researched: me ? [...me.researched] : [],
      cultureProgress: me?.cultureProgress ?? 0,
      researchingGovernment: me?.researchingGovernment ?? null,
      governmentsResearched: me ? [...me.governmentsResearched] : ["chiefdom"],
      civicsAdopted: me ? [...me.civicsAdopted] : [],
      slottedCivics: me ? [...me.slottedCivics] : [],
      unrestTurns: me?.unrestTurns ?? 0,
      governmentChangedTurn: me?.governmentChangedTurn ?? -Infinity,
      government: me?.government ?? "chiefdom",
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
    tradeRoutes: [
      ...state.tradeRoutes.filter((r) => r.ownerId === playerId),
      ...state.tradeRoutes.filter((r) => r.escortUnitId !== undefined && r.ownerId !== playerId),
    ]
      .filter((r, i, arr) => arr.findIndex((x) => x.id === r.id) === i)
      .map((r) => ({ ...r, path: [...r.path] })),
    works: state.works
      .filter((w) => {
        if (w.ownerId === playerId) return true;
        // Opponent wonder build sites are visible once the tile is in sight.
        if (w.kind !== "wonder" || !w.target) return false;
        return visible.has(`${w.target.col},${w.target.row}`);
      })
      .map((w) => ({ ...w, cityIds: [...w.cityIds], assignedSpecialistIds: [...w.assignedSpecialistIds] })),
    roadRoutes: state.roadRoutes
      .filter((r) => r.ownerId === playerId)
      .map((r) => ({ ...r, queue: r.queue.map((t) => ({ ...t })), specialistIds: [...r.specialistIds] })),
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
    poleAxis: state.map.poleAxis,
    tiles,
    visible: [...visible].sort(),
    units,
    cities,
    log,
    turnUpdates,
    gameOver: state.gameOver,
    enabledVictories: [...(state.enabledVictories ?? defaultEnabledVictories())],
    barbarianActivity: state.barbarianActivity,
    aiDifficulty: state.aiDifficulty,
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
  gameSpeed: GameSpeed;
  enabledVictories: VictoryKind[];
  religions: Religion[];
  tradeRoutes: TradeRoute[];
  works: Work[];
  roadRoutes?: RoadRoute[];
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
  aiDifficulty: AiDifficulty;
  barbarianBribes: BarbarianBribe[];
  turnUpdates: TurnUpdateEvent[];
  nextTurnUpdateId: number;
  players: Array<
    Omit<GameState["players"][number], "researched" | "governmentsResearched" | "civicsAdopted" | "explored"> & {
      researched: string[];
      governmentsResearched: string[];
      civicsAdopted: string[];
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
    gameSpeed: normalizeGameSpeed(state.gameSpeed),
    enabledVictories: [...(state.enabledVictories ?? defaultEnabledVictories())],
    religions: state.religions,
    tradeRoutes: state.tradeRoutes,
    works: state.works,
    roadRoutes: state.roadRoutes,
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
    aiDifficulty: state.aiDifficulty,
    barbarianBribes: state.barbarianBribes,
    turnUpdates: state.turnUpdates,
    nextTurnUpdateId: state.nextTurnUpdateId,
    players: state.players.map((p) => ({
      ...p,
      researched: [...p.researched],
      governmentsResearched: [...p.governmentsResearched],
      civicsAdopted: [...p.civicsAdopted],
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
    gameSpeed: normalizeGameSpeed(s.gameSpeed),
    enabledVictories: s.enabledVictories ? new Set(s.enabledVictories) : defaultEnabledVictories(),
    // Legacy saves predate religion tiers — every faith starts at tier 1.
    religions: (s.religions ?? []).map((r) => ({ ...r, tier: r.tier ?? 1 })),
    tradeRoutes: s.tradeRoutes ?? [],
    works: (s.works ?? []).map((w) => ({
      ...w,
      cityIds: w.cityIds ?? [],
      assignedSpecialistIds: w.assignedSpecialistIds ?? [],
    })),
    roadRoutes: s.roadRoutes ?? [],
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
    aiDifficulty: normalizeAiDifficulty(s.aiDifficulty as AiDifficulty | "none" | undefined),
    barbarianBribes: s.barbarianBribes ?? [],
    turnUpdates: s.turnUpdates ?? [],
    nextTurnUpdateId: s.nextTurnUpdateId ?? 1,
    players: s.players.map((p) => ({
      ...p,
      globalMorale: p.globalMorale ?? GLOBAL_MORALE_BASE,
      upkeepModifierPct: p.upkeepModifierPct ?? 0,
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
      legendTrackPoints: p.legendTrackPoints ?? {},
      legendTrackEarned: p.legendTrackEarned ?? {},
      battlesWon: p.battlesWon ?? 0,
      citiesCaptured: p.citiesCaptured ?? 0,
      eurekaTriggered: new Set<string>(
        Array.isArray((p as unknown as { eurekaTriggered: unknown }).eurekaTriggered)
          ? (p as unknown as { eurekaTriggered: string[] }).eurekaTriggered
          : []
      ),
      slottedCivics: p.slottedCivics ?? [],
      unrestTurns: p.unrestTurns ?? 0,
      governmentChangedTurn: p.governmentChangedTurn ?? -Infinity,
      researched: new Set(Array.isArray(p.researched) ? (p.researched as TechId[]) : []),
      governmentsResearched: new Set(Array.isArray(p.governmentsResearched) ? p.governmentsResearched : ["chiefdom"]),
      civicsAdopted: new Set(Array.isArray(p.civicsAdopted) ? p.civicsAdopted : []),
      explored: new Set(Array.isArray(p.explored) ? p.explored : []),
    })),
    units: new Map(s.units.map((u) => [u.id, u])),
    cities: new Map(s.cities.map((c) => [c.id, { ...c, modifiers: c.modifiers ?? [], training: c.training ?? {}, trainingQueue: c.trainingQueue ?? [] }])),
  };
}
