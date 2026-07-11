// Tutorial game preset and first-game prompt state (localStorage).

import { LocalSession, type MapSize, type MapType } from "./session";
import type { GameSetup } from "./analytics";
import {
  CIVILIZATIONS,
  PLAYER_COLORS,
  TOGGLEABLE_VICTORIES,
  citiesOf,
  computeVisible,
  isPassableLand,
  makeUnit,
  unitAt,
  unitsOf,
  type GameState,
} from "@roc/sim";
import { axialDistance, offsetToAxial } from "@roc/shared";

const HAS_STARTED_GAME_KEY = "roc:has-started-game";
const PROMPT_DISMISSED_KEY = "roc:tutorial-prompt-dismissed";

/** Smallest map, one supercontinent, one AI, minimal barbarians, normal speed — everything else on. */
export const TUTORIAL_MAP_SIZE: MapSize = "small";
export const TUTORIAL_MAP_TYPE: MapType = "pangaea";

/** In-game coach guides the human through this many of their own turns. */
export const TUTORIAL_COACH_TURNS = 5;

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
  const session = new LocalSession({
    civId: TUTORIAL_CIV_ID,
    mapSize: TUTORIAL_MAP_SIZE,
    mapType: TUTORIAL_MAP_TYPE,
    aiCivIds: [null],
    colors: [PLAYER_COLORS[0]!, PLAYER_COLORS[1]!],
    barbarians: "minimal",
    villages: true,
    naturalWonders: true,
    legends: true,
    startingGold: "balanced",
    turnLimit: 120,
    gameSpeed: "normal",
    enabledVictories: [...TOGGLEABLE_VICTORIES],
    seed: "tutorial-" + Math.random().toString(36).slice(2, 8),
  });
  seedTutorialSurroundings(session.getState());
  return session;
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

/** Spawn the tutorial's tribal village a couple of tiles from the capital, right
 *  when the turn-3 lesson calls for it. Idempotent: does nothing if a village is
 *  already visible nearby. Returns true if it changed the map. */
export function spawnTutorialVillage(state: GameState): boolean {
  const human = state.players.find((p) => p.isHuman);
  if (!human) return false;
  const anchor = tutorialAnchor(state, human.id);
  if (!anchor) return false;
  const visible = computeVisible(state, human.id);
  const anchorAx = offsetToAxial(anchor);
  const alreadyThere = state.map.tiles.some(
    (t) =>
      t.feature === "village" &&
      visible.has(`${t.col},${t.row}`) &&
      axialDistance(anchorAx, offsetToAxial({ col: t.col, row: t.row })) <= 4,
  );
  if (alreadyThere) return false;
  // Must land on a currently-visible tile so the lesson fires and the ring shows;
  // widen the ring, then fall back to any open tile as a last resort.
  const tile =
    openRingTile(state, human.id, anchor, 2, 3, true) ??
    openRingTile(state, human.id, anchor, 1, 3, true) ??
    openRingTile(state, human.id, anchor, 2, 3);
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
    mapType: TUTORIAL_MAP_TYPE,
    mapSize: TUTORIAL_MAP_SIZE,
    startingGold: "balanced",
    villages: true,
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
