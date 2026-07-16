// Tutorial game preset and first-game prompt state (localStorage).

import { LocalSession, type MapSize, type MapType } from "./session";
import type { GameSetup } from "./analytics";
import {
  CIVILIZATIONS,
  PLAYER_COLORS,
  TOGGLEABLE_VICTORIES,
  citiesOf,
  computeReachable,
  computeVisible,
  isPassableLand,
  makeUnit,
  unitAt,
  unitMovement,
  unitsOf,
  type GameState,
  type Unit,
} from "@roc/sim";
import { axialDistance, getTile, offsetToAxial } from "@roc/shared";

const HAS_STARTED_GAME_KEY = "roc:has-started-game";
const PROMPT_DISMISSED_KEY = "roc:tutorial-prompt-dismissed";

/** Smallest map, one supercontinent, one AI, minimal barbarians, normal speed — everything else on. */
export const TUTORIAL_MAP_SIZE: MapSize = "small";
export const TUTORIAL_MAP_TYPE: MapType = "pangaea";

/** In-game coach guides the human through this many of their own turns. */
export const TUTORIAL_COACH_TURNS = 5;

/** Coach steps that require the player to act on the map — refresh movement when each begins. */
export const TUTORIAL_MOVE_STEP_IDS = new Set([
  "t1_move_scout",
  "t1_move_warrior",
  "t2_attack_barbarian",
  "t3_village",
]);

/** Restore full movement for the player's map units when a movement lesson starts. */
export function refreshTutorialMovement(state: GameState, viewerId: number, stepId: string): void {
  if (!TUTORIAL_MOVE_STEP_IDS.has(stepId)) return;
  for (const u of unitsOf(state, viewerId)) {
    if (u.aboardShipId !== undefined || u.escortingRouteId !== undefined) continue;
    u.movementLeft = unitMovement(state, u);
    u.sleeping = false;
  }
}

export function hasStartedGame(): boolean {
  try {
    return localStorage.getItem(HAS_STARTED_GAME_KEY) === "1";
  } catch {
    return false;
  }
}

export function markGameStarted(): void {
  try {
    localStorage.setItem(HAS_STARTED_GAME_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function tutorialPromptDismissed(): boolean {
  try {
    return localStorage.getItem(PROMPT_DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

export function dismissTutorialPrompt(): void {
  try {
    localStorage.setItem(PROMPT_DISMISSED_KEY, "1");
  } catch {
    /* ignore */
  }
}

/** True when we should recommend the tutorial before the player's first game. */
export function shouldRecommendTutorial(): boolean {
  return !hasStartedGame() && !tutorialPromptDismissed();
}

/** Herodotus teaches with the Indus Valley — one of the first urban cultures in the world. */
export const TUTORIAL_CIV_ID =
  CIVILIZATIONS.find((c) => c.id === "indus_valley")?.id ??
  [...CIVILIZATIONS].sort((a, b) => a.name.localeCompare(b.name))[0]!.id;

export function createTutorialSession(): LocalSession {
  return new LocalSession({
    civId: TUTORIAL_CIV_ID,
    mapSize: TUTORIAL_MAP_SIZE,
    mapType: TUTORIAL_MAP_TYPE,
    aiCivIds: [null],
    colors: [PLAYER_COLORS[0]!, PLAYER_COLORS[1]!],
    barbarians: "minimal",
    villages: "medium",
    naturalWonders: true,
    legends: true,
    startingGold: "balanced",
    turnLimit: 120,
    gameSpeed: "normal",
    enabledVictories: [...TOGGLEABLE_VICTORIES],
    seed: "tutorial-" + Math.random().toString(36).slice(2, 8),
    deferWorldGen: true,
  });
}

/** The player's anchor for tutorial spawns: their capital once founded, else the
 *  Settler (turn 1, before founding). */
function tutorialAnchor(state: GameState, humanId: number): { col: number; row: number } | null {
  const capital = citiesOf(state, humanId).find((c) => c.isCapital) ?? citiesOf(state, humanId)[0];
  if (capital) return { col: capital.col, row: capital.row };
  const unit = unitsOf(state, humanId).find((u) => u.type === "settler") ?? unitsOf(state, humanId)[0];
  return unit ? { col: unit.col, row: unit.row } : null;
}

/** Nearest open, passable land tile in the [min,max] ring around `anchor`. When
 *  `mustSee` is set, only currently-visible tiles are considered (so a spawn shows
 *  the instant it lands and its lesson can fire); otherwise falls back to any open
 *  tile in the ring. */
function openRingTile(
  state: GameState,
  humanId: number,
  anchor: { col: number; row: number },
  min: number,
  max: number,
  mustSee = false,
): { col: number; row: number } | undefined {
  const anchorAx = offsetToAxial(anchor);
  const visible = computeVisible(state, humanId);
  const open = state.map.tiles.filter((t) => {
    if (!isPassableLand(t.terrain) || t.feature || t.resource || t.structure) return false;
    if (unitAt(state, t.col, t.row)) return false;
    const d = axialDistance(anchorAx, offsetToAxial({ col: t.col, row: t.row }));
    return d >= min && d <= max;
  });
  open.sort(
    (a, b) =>
      axialDistance(anchorAx, offsetToAxial({ col: a.col, row: a.row })) -
      axialDistance(anchorAx, offsetToAxial({ col: b.col, row: b.row })),
  );
  const visibleTile = open.find((t) => visible.has(`${t.col},${t.row}`));
  if (mustSee) return visibleTile;
  return visibleTile ?? open[0];
}

/** Seed only the far barbarian camp at game start: a visible long-term goal the
 *  player won't reach during the tutorial. The village and the first barbarian
 *  are spawned on demand (see spawnTutorialVillage / spawnTutorialBarbarian) so
 *  they cannot be collected or fought before their lesson. */
export function seedTutorialSurroundings(state: GameState): void {
  const human = state.players.find((p) => p.isHuman);
  if (!human) return;
  const anchor = tutorialAnchor(state, human.id);
  if (!anchor) return;
  const campTile = openRingTile(state, human.id, anchor, 4, 6);
  if (campTile) getTileAt(state, campTile.col, campTile.row)!.feature = "barb_camp";
}

function getTileAt(state: GameState, col: number, row: number) {
  return state.map.tiles.find((t) => t.col === col && t.row === row);
}

/** Land units that can walk for tutorial map lessons. */
function mobileTutorialUnits(state: GameState, viewerId: number): Unit[] {
  return unitsOf(state, viewerId).filter(
    (u) => u.aboardShipId === undefined && u.escortingRouteId === undefined,
  );
}

function reachableWithFullMovement(
  state: GameState,
  unit: Unit,
): Map<string, { cost: number }> {
  const saved = unit.movementLeft;
  unit.movementLeft = unitMovement(state, unit);
  try {
    return computeReachable(state, unit);
  } finally {
    unit.movementLeft = saved;
  }
}

/** True when some owned unit could step onto the tile with its current movement. */
export function canReachTileWithCurrentMovement(
  state: GameState,
  viewerId: number,
  col: number,
  row: number,
): boolean {
  const key = `${col},${row}`;
  for (const unit of mobileTutorialUnits(state, viewerId)) {
    if (unit.movementLeft <= 0) continue;
    if (computeReachable(state, unit).has(key)) return true;
  }
  return false;
}

/** Closest visible tribal village reachable with units' current movement this turn. */
export function nearestReachableTutorialVillageNow(
  state: GameState,
  viewerId: number,
): { col: number; row: number } | null {
  const visible = computeVisible(state, viewerId);
  const homes = mobileTutorialUnits(state, viewerId);
  let best: { col: number; row: number } | null = null;
  let bestD = Infinity;
  for (const key of visible) {
    const [col, row] = key.split(",").map(Number) as [number, number];
    const tile = getTile(state.map, col, row);
    if (tile?.feature !== "village") continue;
    if (!canReachTileWithCurrentMovement(state, viewerId, col, row)) continue;
    const d = Math.min(
      ...homes.map((u) => Math.abs(u.col - col) + Math.abs(u.row - row)),
      Infinity,
    );
    if (d < bestD) {
      bestD = d;
      best = { col, row };
    }
  }
  return best;
}

/** True when a human unit is standing on a visible tribal village. */
export function humanOnVisibleVillage(state: GameState, viewerId: number): boolean {
  const visible = computeVisible(state, viewerId);
  for (const u of unitsOf(state, viewerId)) {
    if (!visible.has(`${u.col},${u.row}`)) continue;
    const tile = getTile(state.map, u.col, u.row);
    if (tile?.feature === "village") return true;
  }
  return false;
}

/** Turn-3 village lesson can show when a village is visible or we can place one. */
export function tutorialVillageLessonActive(state: GameState, viewerId: number): boolean {
  const visible = computeVisible(state, viewerId);
  if (
    state.map.tiles.some(
      (t) => t.feature === "village" && visible.has(`${t.col},${t.row}`),
    )
  ) {
    return true;
  }
  return bestOpenReachableTile(state, viewerId) != null;
}

/** Advance the village step when done, or when the lesson can no longer be completed. */
export function isTutorialVillageStepDone(state: GameState, viewerId: number): boolean {
  if (humanOnVisibleVillage(state, viewerId)) return true;
  if (nearestReachableTutorialVillageNow(state, viewerId)) return false;
  if (!nearestReachableTutorialVillage(state, viewerId)) return true;
  const mobile = mobileTutorialUnits(state, viewerId);
  return !mobile.some((u) => u.movementLeft > 0);
}

/** Drop unreachable visible villages and spawn one a unit can walk onto this turn. */
export function ensureReachableTutorialVillage(state: GameState): boolean {
  const human = state.players.find((p) => p.isHuman);
  if (!human) return false;
  if (nearestReachableTutorialVillage(state, human.id)) return false;
  const visible = computeVisible(state, human.id);
  let changed = false;
  for (const t of state.map.tiles) {
    if (t.feature === "village" && visible.has(`${t.col},${t.row}`)) {
      t.feature = undefined;
      changed = true;
    }
  }
  return spawnTutorialVillage(state) || changed;
}

/** True when some owned unit could step onto the tile this turn with full movement. */
export function canReachTileWithFullMovement(
  state: GameState,
  viewerId: number,
  col: number,
  row: number,
): boolean {
  const key = `${col},${row}`;
  for (const unit of mobileTutorialUnits(state, viewerId)) {
    if (reachableWithFullMovement(state, unit).has(key)) return true;
  }
  return false;
}

/** Closest visible tribal village the player can actually walk onto this turn. */
export function nearestReachableTutorialVillage(
  state: GameState,
  viewerId: number,
): { col: number; row: number } | null {
  const visible = computeVisible(state, viewerId);
  const homes = mobileTutorialUnits(state, viewerId);
  let best: { col: number; row: number } | null = null;
  let bestD = Infinity;
  for (const key of visible) {
    const [col, row] = key.split(",").map(Number) as [number, number];
    const tile = getTile(state.map, col, row);
    if (tile?.feature !== "village") continue;
    if (!canReachTileWithFullMovement(state, viewerId, col, row)) continue;
    const d = Math.min(
      ...homes.map((u) => Math.abs(u.col - col) + Math.abs(u.row - row)),
      Infinity,
    );
    if (d < bestD) {
      bestD = d;
      best = { col, row };
    }
  }
  return best;
}

/** Open, visible land tile some unit can reach with a full move budget — prefer fewer steps. */
function bestOpenReachableTile(
  state: GameState,
  viewerId: number,
): { col: number; row: number } | undefined {
  const visible = computeVisible(state, viewerId);
  let best: { col: number; row: number; cost: number } | undefined;
  for (const unit of mobileTutorialUnits(state, viewerId)) {
    for (const [key, entry] of reachableWithFullMovement(state, unit)) {
      if (!visible.has(key)) continue;
      const [col, row] = key.split(",").map(Number) as [number, number];
      const tile = getTile(state.map, col, row);
      if (!tile || !isPassableLand(tile.terrain) || tile.feature || tile.resource || tile.structure) {
        continue;
      }
      if (unitAt(state, col, row)) continue;
      if (!best || entry.cost < best.cost) best = { col, row, cost: entry.cost };
    }
  }
  return best ? { col: best.col, row: best.row } : undefined;
}

/** Spawn the tutorial's tribal village where a unit can walk this turn, right when
 *  the turn-3 lesson calls for it. Idempotent while a reachable visible village
 *  already exists. Returns true if it changed the map. */
export function spawnTutorialVillage(state: GameState): boolean {
  const human = state.players.find((p) => p.isHuman);
  if (!human) return false;
  if (nearestReachableTutorialVillage(state, human.id)) return false;
  const tile = bestOpenReachableTile(state, human.id);
  if (!tile) return false;
  getTileAt(state, tile.col, tile.row)!.feature = "village";
  return true;
}

/** Spawn the tutorial's first (weakened) barbarian within the Warrior's reach,
 *  right when the turn-2 combat lesson calls for it. Idempotent: does nothing if
 *  a barbarian is already close. Returns true if it spawned one. */
export function spawnTutorialBarbarian(state: GameState): boolean {
  const human = state.players.find((p) => p.isHuman);
  const barbarian = state.players.find((p) => p.isBarbarian);
  if (!human || !barbarian) return false;
  const anchor = tutorialAnchor(state, human.id);
  if (!anchor) return false;
  const anchorAx = offsetToAxial(anchor);
  const alreadyClose = [...state.units.values()].some(
    (u) =>
      u.ownerId === barbarian.id &&
      axialDistance(anchorAx, offsetToAxial({ col: u.col, row: u.row })) <= 3,
  );
  if (alreadyClose) return false;
  // Visible and within the Warrior's reach (1-2 tiles from the capital).
  const tile =
    openRingTile(state, human.id, anchor, 2, 2, true) ??
    openRingTile(state, human.id, anchor, 1, 2, true) ??
    openRingTile(state, human.id, anchor, 1, 3);
  if (!tile) return false;
  const id = state.nextEntityId++;
  const clubman = makeUnit(id, barbarian.id, "clubman", tile.col, tile.row);
  clubman.hp = Math.max(1, Math.round(clubman.hp * 0.6));
  state.units.set(id, clubman);
  return true;
}

export function createTutorialSetup(): GameSetup {
  return {
    civId: TUTORIAL_CIV_ID,
    mapType: TUTORIAL_MAP_TYPE,
    mapSize: TUTORIAL_MAP_SIZE,
    startingGold: "balanced",
    villages: "medium",
    naturalWonders: true,
    barbarianLevel: "minimal",
    aiCivIds: [null],
    legends: true,
    turnLimit: 120,
    gameSpeed: "normal",
    enabledVictories: [...TOGGLEABLE_VICTORIES],
    isTutorial: true,
  };
}
