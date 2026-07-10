// Tutorial game preset and first-game prompt state (localStorage).

import { LocalSession, type MapSize, type MapType } from "./session";
import type { GameSetup } from "./analytics";
import { CIVILIZATIONS, PLAYER_COLORS, TOGGLEABLE_VICTORIES } from "@roc/sim";

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

const TUTORIAL_CIV_ID = [...CIVILIZATIONS].sort((a, b) => a.name.localeCompare(b.name))[0]!.id;

export function createTutorialSession(): LocalSession {
  return new LocalSession({
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
