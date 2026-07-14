// Tutorial coach voice scripts — no Vite/DOM deps (used by generate-coach-voice.ts).

import { createGame, beginTurn } from "@roc/sim";
import { TUTORIAL_COACH_TURNS } from "./tutorial";
import {
  buildTutorialSteps,
  coachSpeechText,
  SPOT_BARBARIAN_MESSAGE,
  SPOT_ENEMY_FALLBACK_MESSAGE,
  T3_VILLAGE_MESSAGE,
  T4_DIPLOMACY_MESSAGE,
  type TutorialStepId,
} from "./tutorial-coach";

export type TutorialCoachVoiceStep = {
  id: Exclude<TutorialStepId, "complete">;
  text: string;
};

/** All spoken lines for the tutorial coach (turns 1–5 + encounter briefings). */
export function allCoachVoiceSteps(): TutorialCoachVoiceStep[] {
  const state = createGame({ seed: "coach-voice", cols: 24, rows: 16, humanSlots: 1, playerCount: 2 });
  beginTurn(state);
  const viewerId = state.players[0]!.id;
  const flags = {
    barbarianExplained: false,
    enemyExplained: false,
    initialMetCount: 0,
    infoAcknowledged: false,
  };
  const ctx = {
    state,
    viewerId,
    turn: 1,
    selectedUnitId: null,
    selectedCityId: null,
    marks: {},
    flags,
  };

  const seen = new Set<TutorialStepId>();
  const out: TutorialCoachVoiceStep[] = [];
  const add = (id: TutorialStepId, message: string): void => {
    if (seen.has(id)) return;
    seen.add(id);
    out.push({ id: id as TutorialCoachVoiceStep["id"], text: coachSpeechText(message) });
  };

  for (let turn = 1; turn <= TUTORIAL_COACH_TURNS; turn++) {
    ctx.turn = turn;
    for (const step of buildTutorialSteps(turn, ctx)) {
      add(step.id, step.message);
    }
  }

  // Conditional lines (encounters, villages, diplomacy) may not occur in the
  // synthetic playthrough above — ship their clips unconditionally. Enemy
  // sightings use dynamic rival names in-game, so ship the generic variant.
  add("spot_barbarian", SPOT_BARBARIAN_MESSAGE);
  add("spot_enemy", SPOT_ENEMY_FALLBACK_MESSAGE);
  add("t3_village", T3_VILLAGE_MESSAGE);
  add("t4_diplomacy", T4_DIPLOMACY_MESSAGE);

  return out;
}
