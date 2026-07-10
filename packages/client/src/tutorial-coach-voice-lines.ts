// Tutorial coach voice scripts — no Vite/DOM deps (used by generate-coach-voice.ts).

import { createGame, beginTurn } from "@roc/sim";
import { TUTORIAL_COACH_TURNS } from "./tutorial.ts";
import {
  buildTutorialSteps,
  coachSpeechText,
  type TutorialStepId,
} from "./tutorial-coach.ts";

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

  // Encounter lines use dynamic rival names in-game — ship generic clips for generation.
  add(
    "spot_barbarian",
    "Oh — those are barbarians. Wild raiders from camps out in the wilderness. They'll raid tiles if you let them get too close, so hunt down their camps when your army's ready.",
  );
  add(
    "spot_enemy",
    "Heads up — there's an enemy civilization out there. They want the same land and glory you do. Scout carefully and keep fighters close.",
  );

  return out;
}
