import type {
  BarbarianActivity, City, GameOver, LogEntry, Religion, RoadRoute, TradeRoute,
  TurnUpdateEvent, Unit, VictoryKind, Work,
} from "./state";
import type {
  DiploView, PlayerPublic, PlayerView, TileView,
} from "./serialize";
import type { GameSpeed } from "./game-speed";

/** Incremental update to a fog-filtered PlayerView. Upserts replace by id/key; removes drop entries. */
export interface PlayerViewPatch {
  turn?: number;
  turnLimit?: number;
  gameSpeed?: GameSpeed;
  yourId?: number;
  /** Partial empire stats — only changed fields are sent. */
  you?: Partial<Omit<PlayerView["you"], "moraleLog">> & { moraleLog?: PlayerView["you"]["moraleLog"] };
  /** New morale events since the last view (append-only). */
  youMoraleLogAppend?: PlayerView["you"]["moraleLog"];
  religions?: Religion[];
  tradeRoutes?: TradeRoute[];
  removedTradeRouteIds?: number[];
  works?: Work[];
  removedWorkIds?: number[];
  roadRoutes?: RoadRoute[];
  removedRoadRouteIds?: number[];
  completedWonders?: string[];
  recruitedGreatPeople?: string[];
  legendsEnabled?: boolean;
  recruitedLegends?: string[];
  naturalWonderIds?: string[];
  discoveredWonders?: Record<string, number>;
  allNaturalWondersClaimedBy?: number | null;
  /** Partial diplomacy — only changed fields are sent. */
  diplomacy?: Partial<Omit<DiploView, "tradeHistory">> & { tradeHistory?: DiploView["tradeHistory"] };
  /** New trade-history rows since the last view (append-only). */
  diploTradeHistoryAppend?: DiploView["tradeHistory"];
  players?: PlayerPublic[];
  cols?: number;
  rows?: number;
  poleAxis?: "ns" | "ew";
  tiles?: TileView[];
  removedTileKeys?: string[];
  /** Append-only visibility extension (typical when fog expands). */
  visibleAdd?: string[];
  /** Tiles that left sight (e.g. shared vision ended). */
  visibleRemove?: string[];
  visible?: string[];
  units?: Unit[];
  removedUnitIds?: number[];
  cities?: City[];
  removedCityIds?: number[];
  /** Append-only log extension since the last view. */
  logAppend?: LogEntry[];
  /** Full log replace when entries were trimmed or rewritten. */
  log?: LogEntry[];
  turnUpdates?: TurnUpdateEvent[];
  gameOver?: GameOver | null;
  enabledVictories?: VictoryKind[];
  barbarianActivity?: BarbarianActivity;
}

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function diffById<T extends { id: number }>(
  prev: T[],
  next: T[],
): { upsert?: T[]; removed?: number[] } {
  const prevMap = new Map(prev.map((x) => [x.id, x]));
  const nextMap = new Map(next.map((x) => [x.id, x]));
  const upsert = next.filter((x) => {
    const p = prevMap.get(x.id);
    return !p || !sameJson(p, x);
  });
  const removed = [...prevMap.keys()].filter((id) => !nextMap.has(id));
  return {
    upsert: upsert.length > 0 ? upsert : undefined,
    removed: removed.length > 0 ? removed : undefined,
  };
}

function setIfChanged<T>(patch: PlayerViewPatch, key: keyof PlayerViewPatch, prev: T, next: T): void {
  if (!sameJson(prev, next)) (patch as Record<string, unknown>)[key as string] = next;
}

function diffPartialRecord(
  prev: Record<string, number>,
  next: Record<string, number>,
): Record<string, number> | undefined {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(next)) {
    if (prev[k] !== v) out[k] = v;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function diffYou(prev: PlayerView["you"], next: PlayerView["you"]): Partial<PlayerView["you"]> | undefined {
  const patch: Partial<PlayerView["you"]> = {};
  const scalarKeys = [
    "gold", "globalMorale", "upkeepModifierPct", "scienceProgress", "researching",
    "cultureProgress", "researchingGovernment", "unrestTurns", "governmentChangedTurn",
    "government", "faith", "foundedReligionId", "bribesPaid", "leaderAbilityLastUsedTurn",
    "legendsRecruited",
  ] as const;
  for (const key of scalarKeys) {
    if (prev[key] !== next[key]) (patch as Record<string, unknown>)[key] = next[key];
  }
  if (!sameJson(prev.researchQueue, next.researchQueue)) patch.researchQueue = next.researchQueue;
  if (!sameJson(prev.researched, next.researched)) patch.researched = next.researched;
  if (!sameJson(prev.governmentsResearched, next.governmentsResearched)) {
    patch.governmentsResearched = next.governmentsResearched;
  }
  if (!sameJson(prev.civicsAdopted, next.civicsAdopted)) patch.civicsAdopted = next.civicsAdopted;
  if (!sameJson(prev.slottedCivics, next.slottedCivics)) patch.slottedCivics = next.slottedCivics;
  if (!sameJson(prev.resources, next.resources)) patch.resources = next.resources;
  if (!sameJson(prev.greatPeoplePoints, next.greatPeoplePoints)) {
    patch.greatPeoplePoints = next.greatPeoplePoints;
  }
  if (!sameJson(prev.greatPeopleEarned, next.greatPeopleEarned)) {
    patch.greatPeopleEarned = next.greatPeopleEarned;
  }
  if (!sameJson(prev.greatPeople, next.greatPeople)) patch.greatPeople = next.greatPeople;
  if (!sameJson(prev.barbarianBribes, next.barbarianBribes)) patch.barbarianBribes = next.barbarianBribes;
  return Object.keys(patch).length > 0 ? patch : undefined;
}

function diffDiplomacy(prev: DiploView, next: DiploView): Partial<Omit<DiploView, "tradeHistory">> | undefined {
  const patch: Partial<Omit<DiploView, "tradeHistory">> = {};
  if (!sameJson(prev.met, next.met)) patch.met = next.met;
  if (!sameJson(prev.relations, next.relations)) patch.relations = next.relations;
  if (!sameJson(prev.attitudeToYou, next.attitudeToYou)) patch.attitudeToYou = next.attitudeToYou;
  const rep = diffPartialRecord(prev.reputation, next.reputation);
  if (rep) patch.reputation = rep;
  if (!sameJson(prev.contacts, next.contacts)) patch.contacts = next.contacts;
  if (!sameJson(prev.proposals, next.proposals)) patch.proposals = next.proposals;
  return Object.keys(patch).length > 0 ? patch : undefined;
}

function diffVisible(prev: string[], next: string[]): Pick<PlayerViewPatch, "visible" | "visibleAdd" | "visibleRemove"> {
  if (sameJson(prev, next)) return {};
  const prevSet = new Set(prev);
  const nextSet = new Set(next);
  const visibleAdd = next.filter((k) => !prevSet.has(k));
  const visibleRemove = prev.filter((k) => !nextSet.has(k));
  if (visibleAdd.length === 0 && visibleRemove.length === 0) return {};
  if (visibleRemove.length === 0 && visibleAdd.length > 0) return { visibleAdd };
  if (visibleAdd.length === 0 && visibleRemove.length > 0) return { visibleRemove };
  return { visible: next };
}

/** Build the smallest patch that transforms `prev` into `next`. */
export function diffPlayerView(prev: PlayerView, next: PlayerView): PlayerViewPatch {
  const patch: PlayerViewPatch = {};

  setIfChanged(patch, "turn", prev.turn, next.turn);
  setIfChanged(patch, "turnLimit", prev.turnLimit, next.turnLimit);
  setIfChanged(patch, "gameSpeed", prev.gameSpeed, next.gameSpeed);
  setIfChanged(patch, "yourId", prev.yourId, next.yourId);
  const youDiff = diffYou(prev.you, next.you);
  if (youDiff) patch.you = youDiff;
  if (
    next.you.moraleLog.length > prev.you.moraleLog.length &&
    prev.you.moraleLog.every((e, i) => sameJson(e, next.you.moraleLog[i]))
  ) {
    patch.youMoraleLogAppend = next.you.moraleLog.slice(prev.you.moraleLog.length);
  } else if (!sameJson(prev.you.moraleLog, next.you.moraleLog)) {
    patch.you = { ...patch.you, moraleLog: next.you.moraleLog };
  }
  setIfChanged(patch, "religions", prev.religions, next.religions);
  setIfChanged(patch, "completedWonders", prev.completedWonders, next.completedWonders);
  setIfChanged(patch, "recruitedGreatPeople", prev.recruitedGreatPeople, next.recruitedGreatPeople);
  setIfChanged(patch, "legendsEnabled", prev.legendsEnabled, next.legendsEnabled);
  setIfChanged(patch, "recruitedLegends", prev.recruitedLegends, next.recruitedLegends);
  setIfChanged(patch, "naturalWonderIds", prev.naturalWonderIds, next.naturalWonderIds);
  setIfChanged(patch, "discoveredWonders", prev.discoveredWonders, next.discoveredWonders);
  setIfChanged(patch, "allNaturalWondersClaimedBy", prev.allNaturalWondersClaimedBy, next.allNaturalWondersClaimedBy);
  const diploDiff = diffDiplomacy(prev.diplomacy, next.diplomacy);
  if (diploDiff) patch.diplomacy = diploDiff;
  if (
    next.diplomacy.tradeHistory.length > prev.diplomacy.tradeHistory.length &&
    prev.diplomacy.tradeHistory.every((e, i) => sameJson(e, next.diplomacy.tradeHistory[i]))
  ) {
    patch.diploTradeHistoryAppend = next.diplomacy.tradeHistory.slice(prev.diplomacy.tradeHistory.length);
  } else if (!sameJson(prev.diplomacy.tradeHistory, next.diplomacy.tradeHistory)) {
    patch.diplomacy = { ...patch.diplomacy, tradeHistory: next.diplomacy.tradeHistory };
  }
  setIfChanged(patch, "players", prev.players, next.players);
  setIfChanged(patch, "cols", prev.cols, next.cols);
  setIfChanged(patch, "rows", prev.rows, next.rows);
  setIfChanged(patch, "poleAxis", prev.poleAxis, next.poleAxis);
  Object.assign(patch, diffVisible(prev.visible, next.visible));
  setIfChanged(patch, "turnUpdates", prev.turnUpdates, next.turnUpdates);
  setIfChanged(patch, "gameOver", prev.gameOver, next.gameOver);
  setIfChanged(patch, "enabledVictories", prev.enabledVictories, next.enabledVictories);
  setIfChanged(patch, "barbarianActivity", prev.barbarianActivity, next.barbarianActivity);

  const prevTileMap = new Map(prev.tiles.map((t) => [`${t.col},${t.row}`, t]));
  const nextTileMap = new Map(next.tiles.map((t) => [`${t.col},${t.row}`, t]));
  const changedTiles: TileView[] = [];
  for (const [key, tile] of nextTileMap) {
    const old = prevTileMap.get(key);
    if (!old || !sameJson(old, tile)) changedTiles.push(tile);
  }
  if (changedTiles.length > 0) patch.tiles = changedTiles;
  const removedTileKeys = [...prevTileMap.keys()].filter((k) => !nextTileMap.has(k));
  if (removedTileKeys.length > 0) patch.removedTileKeys = removedTileKeys;

  const unitDiff = diffById(prev.units, next.units);
  if (unitDiff.upsert) patch.units = unitDiff.upsert;
  if (unitDiff.removed) patch.removedUnitIds = unitDiff.removed;

  const cityDiff = diffById(prev.cities, next.cities);
  if (cityDiff.upsert) patch.cities = cityDiff.upsert;
  if (cityDiff.removed) patch.removedCityIds = cityDiff.removed;

  const routeDiff = diffById(prev.tradeRoutes ?? [], next.tradeRoutes ?? []);
  if (routeDiff.upsert) patch.tradeRoutes = routeDiff.upsert;
  if (routeDiff.removed) patch.removedTradeRouteIds = routeDiff.removed;

  const workDiff = diffById(prev.works ?? [], next.works ?? []);
  if (workDiff.upsert) patch.works = workDiff.upsert;
  if (workDiff.removed) patch.removedWorkIds = workDiff.removed;

  const roadDiff = diffById(prev.roadRoutes ?? [], next.roadRoutes ?? []);
  if (roadDiff.upsert) patch.roadRoutes = roadDiff.upsert;
  if (roadDiff.removed) patch.removedRoadRouteIds = roadDiff.removed;

  if (
    next.log.length >= prev.log.length &&
    prev.log.every((entry, i) => sameJson(entry, next.log[i]))
  ) {
    if (next.log.length > prev.log.length) patch.logAppend = next.log.slice(prev.log.length);
  } else if (!sameJson(prev.log, next.log)) {
    patch.log = next.log;
  }

  return patch;
}

export function isEmptyPlayerViewPatch(patch: PlayerViewPatch): boolean {
  return Object.keys(patch).length === 0;
}

function upsertById<T extends { id: number }>(list: T[], upsert: T[] | undefined): T[] {
  if (!upsert || upsert.length === 0) return list;
  const map = new Map(list.map((x) => [x.id, x]));
  for (const item of upsert) map.set(item.id, item);
  return [...map.values()];
}

function removeById<T extends { id: number }>(list: T[], removed: number[] | undefined): T[] {
  if (!removed || removed.length === 0) return list;
  const drop = new Set(removed);
  return list.filter((x) => !drop.has(x.id));
}

/** Apply a patch onto a baseline PlayerView (mutates a shallow clone). */
export function applyPlayerViewPatch(base: PlayerView, patch: PlayerViewPatch): PlayerView {
  const next: PlayerView = {
    ...base,
    you: { ...base.you },
    diplomacy: {
      ...base.diplomacy,
      relations: base.diplomacy.relations.map((r) => ({ ...r, deals: r.deals.map((d) => ({ ...d })) })),
      attitudeToYou: base.diplomacy.attitudeToYou.map((a) => ({
        ...a,
        modifiers: a.modifiers.map((m) => ({ ...m })),
      })),
      contacts: base.diplomacy.contacts.map((c) => ({ ...c })),
      proposals: base.diplomacy.proposals.map((p) => ({ ...p })),
      tradeHistory: base.diplomacy.tradeHistory.map((t) => ({ ...t })),
    },
    tiles: base.tiles.map((t) => ({ ...t })),
    visible: [...base.visible],
    units: base.units.map((u) => ({ ...u })),
    cities: base.cities.map((c) => ({ ...c })),
    log: base.log.map((e) => ({ ...e })),
    turnUpdates: base.turnUpdates.map((e) => ({ ...e })),
    players: base.players.map((p) => ({ ...p })),
    religions: base.religions.map((r) => ({ ...r })),
    tradeRoutes: (base.tradeRoutes ?? []).map((r) => ({ ...r })),
    works: (base.works ?? []).map((w) => ({ ...w })),
    roadRoutes: (base.roadRoutes ?? []).map((r) => ({ ...r })),
    completedWonders: [...base.completedWonders],
    recruitedGreatPeople: [...base.recruitedGreatPeople],
    recruitedLegends: [...base.recruitedLegends],
    naturalWonderIds: [...base.naturalWonderIds],
    discoveredWonders: { ...base.discoveredWonders },
    enabledVictories: [...base.enabledVictories],
  };

  if (patch.turn !== undefined) next.turn = patch.turn;
  if (patch.turnLimit !== undefined) next.turnLimit = patch.turnLimit;
  if (patch.gameSpeed !== undefined) next.gameSpeed = patch.gameSpeed;
  if (patch.yourId !== undefined) next.yourId = patch.yourId;
  if (patch.you !== undefined) {
    const { moraleLog, ...rest } = patch.you;
    next.you = { ...next.you, ...rest };
    if (moraleLog !== undefined) next.you.moraleLog = moraleLog.map((e) => ({ ...e }));
  }
  if (patch.youMoraleLogAppend) {
    next.you.moraleLog = [...next.you.moraleLog, ...patch.youMoraleLogAppend.map((e) => ({ ...e }))];
  }
  if (patch.religions !== undefined) next.religions = patch.religions.map((r) => ({ ...r }));
  if (patch.completedWonders !== undefined) next.completedWonders = [...patch.completedWonders];
  if (patch.recruitedGreatPeople !== undefined) next.recruitedGreatPeople = [...patch.recruitedGreatPeople];
  if (patch.legendsEnabled !== undefined) next.legendsEnabled = patch.legendsEnabled;
  if (patch.recruitedLegends !== undefined) next.recruitedLegends = [...patch.recruitedLegends];
  if (patch.naturalWonderIds !== undefined) next.naturalWonderIds = [...patch.naturalWonderIds];
  if (patch.discoveredWonders !== undefined) next.discoveredWonders = { ...patch.discoveredWonders };
  if (patch.allNaturalWondersClaimedBy !== undefined) {
    next.allNaturalWondersClaimedBy = patch.allNaturalWondersClaimedBy ?? undefined;
  }
  if (patch.diplomacy !== undefined) {
    const { tradeHistory, ...rest } = patch.diplomacy;
    next.diplomacy = { ...next.diplomacy, ...rest };
    if (rest.relations) next.diplomacy.relations = rest.relations.map((r) => ({ ...r, deals: r.deals.map((d) => ({ ...d })) }));
    if (rest.attitudeToYou) {
      next.diplomacy.attitudeToYou = rest.attitudeToYou.map((a) => ({
        ...a,
        modifiers: a.modifiers.map((m) => ({ ...m })),
      }));
    }
    if (rest.contacts) next.diplomacy.contacts = rest.contacts.map((c) => ({ ...c }));
    if (rest.proposals) next.diplomacy.proposals = rest.proposals.map((p) => ({ ...p }));
    if (tradeHistory !== undefined) next.diplomacy.tradeHistory = tradeHistory.map((t) => ({ ...t }));
  }
  if (patch.diploTradeHistoryAppend) {
    next.diplomacy.tradeHistory = [
      ...next.diplomacy.tradeHistory,
      ...patch.diploTradeHistoryAppend.map((t) => ({ ...t })),
    ];
  }
  if (patch.players !== undefined) next.players = patch.players.map((p) => ({ ...p }));
  if (patch.cols !== undefined) next.cols = patch.cols;
  if (patch.rows !== undefined) next.rows = patch.rows;
  if (patch.poleAxis !== undefined) next.poleAxis = patch.poleAxis;
  if (patch.visibleRemove) {
    const drop = new Set(patch.visibleRemove);
    next.visible = next.visible.filter((k) => !drop.has(k));
  }
  if (patch.visibleAdd) {
    const vis = [...next.visible];
    for (const k of patch.visibleAdd) {
      if (!vis.includes(k)) vis.push(k);
    }
    next.visible = vis;
  }
  if (patch.visible !== undefined) next.visible = [...patch.visible];
  if (patch.visibleRemove || patch.visibleAdd || patch.visible) next.visible.sort();
  if (patch.turnUpdates !== undefined) next.turnUpdates = patch.turnUpdates.map((e) => ({ ...e }));
  if (patch.gameOver !== undefined) next.gameOver = patch.gameOver;
  if (patch.enabledVictories !== undefined) next.enabledVictories = [...patch.enabledVictories];
  if (patch.barbarianActivity !== undefined) next.barbarianActivity = patch.barbarianActivity;

  if (patch.removedTileKeys) {
    const drop = new Set(patch.removedTileKeys);
    next.tiles = next.tiles.filter((t) => !drop.has(`${t.col},${t.row}`));
  }
  if (patch.tiles) {
    const map = new Map(next.tiles.map((t) => [`${t.col},${t.row}`, t]));
    for (const t of patch.tiles) map.set(`${t.col},${t.row}`, { ...t });
    next.tiles = [...map.values()];
  }

  next.units = removeById(next.units, patch.removedUnitIds);
  next.units = upsertById(next.units, patch.units?.map((u) => ({ ...u })));

  next.cities = removeById(next.cities, patch.removedCityIds);
  next.cities = upsertById(next.cities, patch.cities?.map((c) => ({ ...c })));

  next.tradeRoutes = removeById(next.tradeRoutes ?? [], patch.removedTradeRouteIds);
  next.tradeRoutes = upsertById(next.tradeRoutes ?? [], patch.tradeRoutes?.map((r) => ({ ...r })));

  next.works = removeById(next.works ?? [], patch.removedWorkIds);
  next.works = upsertById(next.works ?? [], patch.works?.map((w) => ({ ...w })));

  next.roadRoutes = removeById(next.roadRoutes ?? [], patch.removedRoadRouteIds);
  next.roadRoutes = upsertById(next.roadRoutes ?? [], patch.roadRoutes?.map((r) => ({ ...r })));

  if (patch.logAppend) next.log = [...next.log, ...patch.logAppend.map((e) => ({ ...e }))];
  if (patch.log) next.log = patch.log.map((e) => ({ ...e }));

  return next;
}
