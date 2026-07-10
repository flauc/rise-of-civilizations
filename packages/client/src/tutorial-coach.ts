// In-game tutorial coach: pulsing highlights on HUD buttons for the first five turns.

import type { GameState } from "@roc/sim";
import {
  availableTraining,
  canStartTraining,
  citiesOf,
  computeVisible,
  currentPlayer,
  playerById,
  unitsOf,
} from "@roc/sim";
import { getTile } from "@roc/shared";
import { getCiv, startingUnitsFor } from "@roc/data";
import { TUTORIAL_COACH_TURNS } from "./tutorial";
import { speakCoachLine, stopCoachVoice } from "./coach-voice";
import { assetUrl } from "./asset-base";
import { cutLegendPortraitBackground } from "./coach-portrait";

/** Legend portrait for the tutorial advisor — file: `public/legends/<id>.png`. */
export const TUTORIAL_COACH_LEGEND_ID = "alexander";

export function tutorialCoachPortraitUrl(): string {
  return assetUrl(`legends/${TUTORIAL_COACH_LEGEND_ID}.png`);
}

/** Pre-cut coach portrait (transparent PNG). Used when present — no runtime matting. */
export function tutorialCoachCutoutUrl(): string {
  return assetUrl(`coach/legends/${TUTORIAL_COACH_LEGEND_ID}.png`);
}

export type TutorialStepId =
  | "t1_select_scout"
  | "t1_move_scout"
  | "t1_select_warrior"
  | "t1_move_warrior"
  | "t1_select_settler"
  | "t1_found_city"
  | "t1_open_research"
  | "t1_pick_research"
  | "t1_select_city"
  | "t1_open_construction"
  | "t1_pick_build"
  | "t1_open_train"
  | "t1_train_unit"
  | "t1_end_turn"
  | "spot_barbarian"
  | "spot_enemy"
  | "t2_check_city"
  | "t2_end_turn"
  | "t3_village"
  | "t3_end_turn"
  | "t4_diplomacy"
  | "t4_end_turn"
  | "t5_wrap_up"
  | "t5_end_turn"
  | "complete";

export interface TutorialCoachFlags {
  barbarianExplained: boolean;
  enemyExplained: boolean;
  /** `met.length` when the coach session started — detects first rival contact. */
  initialMetCount: number;
  /** Player tapped through the current info-only coach line. */
  infoAcknowledged: boolean;
}

export interface TutorialCoachMarks {
  scoutStartMove?: number;
  scoutStartCol?: number;
  scoutStartRow?: number;
  warriorStartMove?: number;
  warriorStartCol?: number;
  warriorStartRow?: number;
  /** Positions/movement of units snapshotted when a move step begins. */
  unitSnapshots?: { id: number; type: string; move: number; col: number; row: number }[];
}

export interface TutorialCoachContext {
  state: GameState;
  viewerId: number;
  turn: number;
  selectedUnitId: number | null;
  selectedCityId: number | null;
  marks: TutorialCoachMarks;
  flags: TutorialCoachFlags;
}

export interface TutorialStepDef {
  id: TutorialStepId;
  message: string;
  /** CSS selectors — first visible match is highlighted. */
  targets?: string[];
  /** Highlight a unit's map tile (scout / warrior / settler). */
  unitHighlight?: "scout" | "warrior" | "settler";
  /** Dim everything except the map when the player should tap tiles. */
  mapFocus?: boolean;
  /** Tap the coach bubble to continue (barbarians, enemies, wrap-up). */
  infoOnly?: boolean;
  isDone(ctx: TutorialCoachContext): boolean;
}

function unitOfType(state: GameState, viewerId: number, type: string) {
  return unitsOf(state, viewerId).find((u) => u.type === type);
}

/** Starting military units for the civ (e.g. two Warriors or two Javelineers). */
function fighterTypesFor(state: GameState, viewerId: number): string[] {
  const civId = state.players.find((p) => p.id === viewerId)?.civId;
  return startingUnitsFor(civId).filter((t) => t !== "scout");
}

function isFighterType(state: GameState, viewerId: number, type: string): boolean {
  return fighterTypesFor(state, viewerId).includes(type);
}

function firstFighterUnit(state: GameState, viewerId: number) {
  const types = new Set(fighterTypesFor(state, viewerId));
  return unitsOf(state, viewerId).find((u) => types.has(u.type));
}

function unitMoved(
  u: { movementLeft: number; col: number; row: number },
  startMove: number | undefined,
  startCol: number | undefined,
  startRow: number | undefined,
): boolean {
  if (startMove === undefined) return false;
  if (u.movementLeft < startMove) return true;
  if (startCol !== undefined && startRow !== undefined) {
    return u.col !== startCol || u.row !== startRow;
  }
  return false;
}

function capitalCity(state: GameState, viewerId: number) {
  return citiesOf(state, viewerId).find((c) => c.isCapital) ?? citiesOf(state, viewerId)[0];
}

/** City the player is working in — selected city first, then capital. */
function coachedCity(state: GameState, viewerId: number, selectedCityId: number | null) {
  if (selectedCityId != null) {
    const selected = state.cities.get(selectedCityId);
    if (selected?.ownerId === viewerId) return selected;
  }
  return capitalCity(state, viewerId);
}

function hasQueuedTraining(state: GameState, viewerId: number, selectedCityId: number | null): boolean {
  const city = coachedCity(state, viewerId, selectedCityId);
  if (city && city.trainingQueue.length > 0) return true;
  return citiesOf(state, viewerId).some((c) => c.trainingQueue.length > 0);
}

/** True when the coached city could start at least one training order right now. */
function canQueueAnyTraining(state: GameState, viewerId: number, selectedCityId: number | null): boolean {
  const city = coachedCity(state, viewerId, selectedCityId);
  const player = state.players.find((p) => p.id === viewerId);
  if (!city || !player) return false;
  return availableTraining(state, player, city).some((type) => canStartTraining(state, city, type).ok);
}

function hasQueuedProduction(state: GameState, viewerId: number, selectedCityId: number | null): boolean {
  const city = coachedCity(state, viewerId, selectedCityId);
  if (city?.production != null) return true;
  return citiesOf(state, viewerId).some((c) => c.production != null);
}

function cityPanelVisible(): boolean {
  if (typeof document === "undefined") return false;
  const panel = document.querySelector<HTMLElement>(".city-panel");
  return panel != null && !panel.classList.contains("hidden");
}

function hasHumanCity(state: GameState, viewerId: number): boolean {
  return citiesOf(state, viewerId).length > 0;
}

function playerIsResearching(state: GameState, viewerId: number): boolean {
  return state.players.find((p) => p.id === viewerId)?.researching != null;
}

function citySubpanelOpen(): boolean {
  if (typeof document === "undefined") return false;
  return (
    document.querySelector(".production:not(.hidden)") != null ||
    document.querySelector(".training:not(.hidden)") != null ||
    document.querySelector(".specialists:not(.hidden)") != null
  );
}


/** Move step done if any starting fighter acted, was consumed, or city play started. */
function anyFighterMoveDone(state: GameState, viewerId: number, marks: TutorialCoachMarks): boolean {
  const types = fighterTypesFor(state, viewerId);
  if (types.length === 0) return true;
  const snaps = marks.unitSnapshots?.filter((s) => types.includes(s.type));
  if (snaps && snaps.length > 0) {
    return snaps.some((s) => {
      const u = state.units.get(s.id);
      if (!u) return true;
      if (u.movementLeft < s.move) return true;
      return u.col !== s.col || u.row !== s.row;
    });
  }
  const fighters = unitsOf(state, viewerId).filter((u) => types.includes(u.type));
  if (fighters.length === 0) return true;
  return fighters.some((u) => u.movementLeft <= 0);
}

/** Move step done if the unit acted, was consumed, or the player moved on to city play. */
function unitMoveStepDone(
  state: GameState,
  viewerId: number,
  type: string,
  marks: TutorialCoachMarks,
  startMove: number | undefined,
  startCol: number | undefined,
  startRow: number | undefined,
): boolean {
  if (hasHumanCity(state, viewerId)) return true;
  const u = unitOfType(state, viewerId, type);
  if (!u) return true;
  if (u.movementLeft <= 0) return true;
  if (startMove === undefined) return false;
  return unitMoved(u, startMove, startCol, startRow);
}

function tileKey(col: number, row: number): string {
  return `${col},${row}`;
}

function parseTileKey(key: string): { col: number; row: number } | null {
  const comma = key.indexOf(",");
  if (comma < 0) return null;
  const col = Number(key.slice(0, comma));
  const row = Number(key.slice(comma + 1));
  if (!Number.isFinite(col) || !Number.isFinite(row)) return null;
  return { col, row };
}

function infoDone(ctx: TutorialCoachContext): boolean {
  return ctx.flags.infoAcknowledged;
}

/** Barbarian war-band or camp currently in the player's line of sight. */
export function visibleBarbarianThreat(state: GameState, viewerId: number): boolean {
  const visible = computeVisible(state, viewerId);
  for (const u of state.units.values()) {
    const owner = playerById(state, u.ownerId);
    if (!owner?.isBarbarian) continue;
    if (visible.has(tileKey(u.col, u.row))) return true;
  }
  for (const key of visible) {
    const pos = parseTileKey(key);
    if (!pos) continue;
    const tile = getTile(state.map, pos.col, pos.row);
    if (tile?.feature === "barb_camp") return true;
  }
  return false;
}

/** First rival civ unit or city currently visible (not barbarians). */
export function visibleEnemyCivId(state: GameState, viewerId: number): number | null {
  const visible = computeVisible(state, viewerId);
  for (const u of state.units.values()) {
    if (u.ownerId === viewerId) continue;
    const owner = playerById(state, u.ownerId);
    if (!owner || owner.isBarbarian) continue;
    if (visible.has(tileKey(u.col, u.row))) return u.ownerId;
  }
  for (const c of state.cities.values()) {
    if (c.ownerId === viewerId) continue;
    const owner = playerById(state, c.ownerId);
    if (!owner || owner.isBarbarian) continue;
    if (visible.has(tileKey(c.col, c.row))) return c.ownerId;
  }
  return null;
}

export function visibleVillageTile(state: GameState, viewerId: number): boolean {
  const visible = computeVisible(state, viewerId);
  for (const key of visible) {
    const pos = parseTileKey(key);
    if (!pos) continue;
    const tile = getTile(state.map, pos.col, pos.row);
    if (tile?.feature === "village") return true;
  }
  return false;
}

function enemyDisplayName(state: GameState, playerId: number): string {
  const p = playerById(state, playerId);
  if (!p) return "an enemy civilization";
  return getCiv(p.civId)?.name ?? p.name;
}

function spotEnemyMessage(state: GameState, viewerId: number, flags: TutorialCoachFlags): string {
  const me = state.players.find((p) => p.id === viewerId);
  const metRival = me?.met.find((id) => {
    const other = playerById(state, id);
    return other != null && !other.isBarbarian;
  });
  const visibleId = visibleEnemyCivId(state, viewerId);
  const name = metRival != null ? enemyDisplayName(state, metRival) : visibleId != null ? enemyDisplayName(state, visibleId) : null;
  if (name) {
    return `Hey — that's ${name}, an enemy civilization! They expand and research just like you. Keep your warriors nearby and decide later whether to trade or tangle.`;
  }
  return "Heads up — there's an enemy civilization out there. They want the same land and glory you do. Scout carefully and keep fighters close.";
}

function spotBarbarianStep(): TutorialStepDef {
  return {
    id: "spot_barbarian",
    message:
      "Oh — those are barbarians. Wild raiders from camps out in the wilderness. They'll raid tiles if you let them get too close, so hunt down their camps when your army's ready.",
    infoOnly: true,
    isDone: infoDone,
  };
}

function spotEnemyStep(state: GameState, viewerId: number, flags: TutorialCoachFlags): TutorialStepDef {
  return {
    id: "spot_enemy",
    message: spotEnemyMessage(state, viewerId, flags),
    infoOnly: true,
    isDone: infoDone,
  };
}

function encounterSteps(
  state: GameState,
  viewerId: number,
  flags: TutorialCoachFlags,
  inProgress: ReadonlySet<TutorialStepId>,
): TutorialStepDef[] {
  const out: TutorialStepDef[] = [];
  if (inProgress.has("spot_barbarian") || (!flags.barbarianExplained && visibleBarbarianThreat(state, viewerId))) {
    out.push(spotBarbarianStep());
  }
  const metNewRival =
    (state.players.find((p) => p.id === viewerId)?.met.length ?? 0) > flags.initialMetCount;
  if (
    inProgress.has("spot_enemy") ||
    (!flags.enemyExplained && (metNewRival || visibleEnemyCivId(state, viewerId) != null))
  ) {
    out.push(spotEnemyStep(state, viewerId, flags));
  }
  return out;
}

/** Build the full step list for a turn, including one-time encounter briefings. */
export function buildTutorialSteps(
  turn: number,
  ctx: TutorialCoachContext,
  inProgress: ReadonlySet<TutorialStepId> = new Set(),
): TutorialStepDef[] {
  return [...encounterSteps(ctx.state, ctx.viewerId, ctx.flags, inProgress), ...turnSteps(turn, ctx)];
}

function turnSteps(turn: number, ctx: TutorialCoachContext): TutorialStepDef[] {
  switch (turn) {
    case 1:
      return [
        {
          id: "t1_select_scout",
          message:
            "Hey there — glad you're here! Tap your Scout first. They're great at clearing the fog and finding a cozy spot for your first city.",
          targets: ["#units-btn"],
          unitHighlight: "scout",
          isDone: ({ state, viewerId, selectedUnitId }) => {
            if (hasHumanCity(state, viewerId)) return true;
            const u = selectedUnitId != null ? state.units.get(selectedUnitId) : undefined;
            return u?.ownerId === viewerId && u.type === "scout";
          },
        },
        {
          id: "t1_move_scout",
          message: "Nice choice! Tap any tile on the map to send them out. A little scouting now goes a long way.",
          isDone: ({ state, viewerId, marks }) =>
            unitMoveStepDone(state, viewerId, "scout", marks, marks.scoutStartMove, marks.scoutStartCol, marks.scoutStartRow),
        },
        {
          id: "t1_select_warrior",
          message: "Perfect. Tap any Warrior in your units list — they fight for you and keep your Settler safe.",
          targets: ["#units-btn"],
          unitHighlight: "warrior",
          isDone: ({ state, viewerId, selectedUnitId }) => {
            if (hasHumanCity(state, viewerId)) return true;
            const u = selectedUnitId != null ? state.units.get(selectedUnitId) : undefined;
            return u?.ownerId === viewerId && isFighterType(state, viewerId, u.type);
          },
        },
        {
          id: "t1_move_warrior",
          message: "Move whichever Warrior you'd like — just keep one close to your Settler, just in case.",
          isDone: ({ state, viewerId, marks }) => anyFighterMoveDone(state, viewerId, marks),
        },
        {
          id: "t1_select_settler",
          message:
            "Last but not least — your Settler! Only they can found a city, and cities are really the heart of everything you'll build.",
          targets: ["#units-btn"],
          unitHighlight: "settler",
          isDone: ({ state, viewerId, selectedUnitId }) => {
            if (hasHumanCity(state, viewerId)) return true;
            const u = selectedUnitId != null ? state.units.get(selectedUnitId) : undefined;
            return u?.ownerId === viewerId && u.type === "settler";
          },
        },
        {
          id: "t1_found_city",
          message:
            "With the Settler selected, tap Found City. Grassland or plains with food 🍞 nearby is a lovely start.",
          targets: ["#found", "[data-found]"],
          isDone: ({ state, viewerId }) => citiesOf(state, viewerId).length > 0,
        },
        {
          id: "t1_open_research",
          message:
            "City founded — nice work! Tap Research up top. That's how you unlock new units, buildings, and bonuses.",
          targets: ["#research-btn"],
          isDone: ({ state, viewerId }) => {
            if (playerIsResearching(state, viewerId)) return true;
            return document.querySelector(".research:not(.hidden) .tech[data-tech]") != null;
          },
        },
        {
          id: "t1_pick_research",
          message: "Pick any tech that catches your eye. Your cities will chip in science 🔬 each turn until it's done.",
          targets: [".research:not(.hidden) .tech[data-tech]"],
          isDone: ({ state, viewerId }) => playerIsResearching(state, viewerId),
        },
        {
          id: "t1_select_city",
          message:
            "Open your new city — tap it on the map or hit Cities. That's your home base for buildings and training.",
          targets: [".city-panel", "#cities-btn"],
          isDone: ({ state, viewerId, selectedCityId }) => {
            if (hasQueuedProduction(state, viewerId, selectedCityId)) return true;
            if (hasQueuedTraining(state, viewerId, selectedCityId)) return true;
            if (citySubpanelOpen()) return true;
            if (selectedCityId == null) return false;
            const c = state.cities.get(selectedCityId);
            return c?.ownerId === viewerId && cityPanelVisible();
          },
        },
        {
          id: "t1_open_construction",
          message:
            "Tap Construction 🔨 first — something like a Farm or Barracks is perfect. It'll take a few turns, but you've got time.",
          targets: ["#open-prod"],
          isDone: (ctx) => {
            const city = coachedCity(ctx.state, ctx.viewerId, ctx.selectedCityId);
            if (city?.production != null) return true;
            return document.querySelector(".production:not(.hidden) .pcard") != null;
          },
        },
        {
          id: "t1_pick_build",
          message: "Choose any building you like — your city will keep working on it each turn until it's finished.",
          targets: [".production:not(.hidden) .pcard"],
          isDone: (ctx) => hasQueuedProduction(ctx.state, ctx.viewerId, ctx.selectedCityId),
        },
        {
          id: "t1_open_train",
          message:
            "Now try Train Units ⚔️ — scouts and settlers come from here. Your capital is already big enough to train one!",
          targets: ["#open-train"],
          isDone: (ctx) =>
            document.querySelector(".training:not(.hidden)") != null || hasQueuedTraining(ctx.state, ctx.viewerId, ctx.selectedCityId),
        },
        {
          id: "t1_train_unit",
          message:
            "Queue up a Scout — it uses a citizen and takes a few turns. One civilian at a time for now, but that's plenty.",
          targets: [".training:not(.hidden) [data-train]"],
          isDone: (ctx) =>
            hasQueuedTraining(ctx.state, ctx.viewerId, ctx.selectedCityId) ||
            !canQueueAnyTraining(ctx.state, ctx.viewerId, ctx.selectedCityId),
        },
        {
          id: "t1_end_turn",
          message:
            "What a great first turn! The big button hops to your next unit if anyone still has moves. The small one beside it ends your turn — hit that when you're happy with everything.",
          targets: ["#endturn", "#endturn2"],
          isDone: () => false,
        },
      ];
    case 2:
      return [
        {
          id: "t2_check_city",
          message:
            "Welcome to turn 2! Pop open your city and peek at Growth 🍞. Food builds up, then you get a new citizen who can work tiles or help train units. Your queues from last turn are still chugging along!",
          targets: [".city-panel", "#cities-btn"],
          isDone: ({ state, viewerId, selectedCityId }) => {
            if (cityPanelVisible()) return true;
            if (selectedCityId == null) return false;
            const c = state.cities.get(selectedCityId);
            return c?.ownerId === viewerId;
          },
        },
        {
          id: "t2_end_turn",
          message:
            "Keep scouts exploring — villages and rival borders are worth finding early. End turn when you're ready: big button for the next unit, small one to finish.",
          targets: ["#endturn", "#endturn2"],
          isDone: () => false,
        },
      ];
    case 3:
      return [
        ...(visibleVillageTile(ctx.state, ctx.viewerId)
          ? [
              {
                id: "t3_village" as const,
                message:
                  "See that tribal village? They're friendly — walk a unit onto it. Locals might share gold, a tech tip, or even a free warrior. Always worth saying hello!",
                isDone: ({ state, viewerId }: TutorialCoachContext) => {
                  const visible = computeVisible(state, viewerId);
                  for (const key of visible) {
                    const pos = parseTileKey(key);
                    if (!pos) continue;
                    const tile = getTile(state.map, pos.col, pos.row);
                    if (tile?.feature !== "village") continue;
                    for (const u of unitsOf(state, viewerId)) {
                      if (u.col === pos.col && u.row === pos.row) return true;
                    }
                  }
                  return false;
                },
              },
            ]
          : []),
        {
          id: "t3_end_turn",
          message:
            "Keep pushing back the fog and keep settlers safe. If barbarians show up, clear their camps before they cause trouble.",
          targets: ["#endturn", "#endturn2"],
          isDone: () => false,
        },
      ];
    case 4:
      return [
        ...((ctx.state.players.find((p) => p.id === ctx.viewerId)?.met.length ?? 0) > 0
          ? [
              {
                id: "t4_diplomacy" as const,
                message:
                  "You've met someone new — tap Diplomacy 🕊️ to say hi. Rivals aren't monsters; they're chasing the same victories. Trade, make peace, or pick a fight when the time is right.",
                targets: ["#diplo-pill", "[data-bb=\"diplo\"]"],
                isDone: () => document.querySelector("#diplomacy:not(.hidden)") != null,
              },
            ]
          : []),
        {
          id: "t4_end_turn",
          message:
            "Turn 4 — grow your city, stay curious on research, and don't forget your borders. End turn whenever you feel good.",
          targets: ["#endturn", "#endturn2"],
          isDone: () => false,
        },
      ];
    case 5:
      return [
        {
          id: "t5_wrap_up",
          message:
            "Last tip from me! Grow with settlers, out-research rivals, and watch out for barbarians. You can win by conquest, culture, science, and more — check Victory when you're curious. Now go make some history!",
          infoOnly: true,
          isDone: infoDone,
        },
        {
          id: "t5_end_turn",
          message: "You're all set from me — end this turn and I'll step aside. You've got this. Good luck out there!",
          targets: ["#endturn", "#endturn2"],
          isDone: () => false,
        },
      ];
    default:
      return [];
  }
}

/** @deprecated Use buildTutorialSteps — kept for tests that pass a minimal context. */
export function stepsForTurn(turn: number, ctx?: Partial<TutorialCoachContext>): TutorialStepDef[] {
  const flags: TutorialCoachFlags = ctx?.flags ?? {
    barbarianExplained: false,
    enemyExplained: false,
    initialMetCount: 0,
    infoAcknowledged: false,
  };
  const fullCtx: TutorialCoachContext = {
    state: ctx?.state ?? ({} as GameState),
    viewerId: ctx?.viewerId ?? 0,
    turn: ctx?.turn ?? turn,
    selectedUnitId: ctx?.selectedUnitId ?? null,
    selectedCityId: ctx?.selectedCityId ?? null,
    marks: ctx?.marks ?? {},
    flags,
  };
  return buildTutorialSteps(turn, fullCtx, new Set());
}

export function isEndTurnStep(step: TutorialStepDef | undefined): boolean {
  return step?.id.endsWith("_end_turn") ?? false;
}

/** Strip emoji so TTS / ElevenLabs reads clean prose. */
export function coachSpeechText(message: string): string {
  return message
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export interface TutorialCoachDeps {
  getState: () => GameState;
  getViewerId: () => number;
  getSelectedUnitId: () => number | null;
  getSelectedCityId: () => number | null;
  tileToScreen: (col: number, row: number) => { x: number; y: number } | null;
  banner: (text: string) => void;
  /** False while the loading veil covers the map — coach waits to speak. */
  isWorldReady: () => boolean;
}

export interface TutorialCoach {
  tick(): void;
  destroy(): void;
}

function findVisibleTarget(selectors: string[] | undefined): HTMLElement | null {
  if (!selectors) return null;
  for (const sel of selectors) {
    const el = document.querySelector<HTMLElement>(sel);
    if (!el) continue;
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0 && !el.classList.contains("hidden")) return el;
  }
  return null;
}

export function createTutorialCoach(deps: TutorialCoachDeps): TutorialCoach {
  let dismissed = false;
  let trackedTurn = 1;
  let marks: TutorialCoachMarks = {};
  let lastStepId: TutorialStepId | null = null;
  /** Steps that finished once — never rewind (e.g. deselecting a unit must not replay step 1). */
  const completedSteps = new Set<TutorialStepId>();
  /** Encounter briefings in progress — kept until the player taps through even after the one-time flag is set. */
  const encounterInProgress = new Set<TutorialStepId>();
  let typeTimer = 0;
  const TYPE_MS = 34;

  const initialState = deps.getState();
  const initialViewer = deps.getViewerId();
  const initialPlayer = initialState.players.find((p) => p.id === initialViewer);
  const flags: TutorialCoachFlags = {
    barbarianExplained: false,
    enemyExplained: false,
    initialMetCount: initialPlayer?.met.length ?? 0,
    infoAcknowledged: false,
  };

  const root = document.createElement("div");
  root.id = "tutorial-coach";
  root.innerHTML =
    `<div id="tutorial-coach-dim"></div>` +
    `<div id="tutorial-coach-ring" hidden></div>` +
    `<div id="tutorial-coach-panel">` +
    `<div id="tutorial-coach-card">` +
    `<div id="tutorial-coach-bubble">` +
    `<div id="tutorial-coach-tail" aria-hidden="true"></div>` +
    `<div id="tutorial-coach-dialog">` +
    `<div id="tutorial-coach-text"></div>` +
    `</div></div>` +
    `<div id="tutorial-coach-foot">` +
    `<span id="tutorial-coach-progress"></span>` +
    `<button type="button" id="tutorial-coach-skip">Skip tutorial tips</button>` +
    `</div></div>` +
    `<img id="tutorial-coach-portrait" alt="Tutorial advisor" />` +
    `</div>`;
  document.body.appendChild(root);

  const dim = root.querySelector<HTMLElement>("#tutorial-coach-dim")!;
  const ring = root.querySelector<HTMLElement>("#tutorial-coach-ring")!;
  const textEl = root.querySelector<HTMLElement>("#tutorial-coach-text")!;
  const progressEl = root.querySelector<HTMLElement>("#tutorial-coach-progress")!;
  const skipBtn = root.querySelector<HTMLButtonElement>("#tutorial-coach-skip")!;
  const panelEl = root.querySelector<HTMLElement>("#tutorial-coach-panel")!;
  const portraitEl = root.querySelector<HTMLImageElement>("#tutorial-coach-portrait")!;

  function loadPortrait(): void {
    const sourceUrl = tutorialCoachPortraitUrl();
    const cutoutUrl = tutorialCoachCutoutUrl();

    const show = (url: string): void => {
      portraitEl.src = url;
    };

    // Prefer a baked transparent coach cutout when shipped in public/coach/legends/.
    const preCut = new Image();
    preCut.onload = () => show(cutoutUrl);
    preCut.onerror = () => {
      const img = new Image();
      img.onload = () => {
        const cut = cutLegendPortraitBackground(img);
        show(cut ?? sourceUrl);
      };
      img.onerror = () => portraitEl.removeAttribute("src");
      img.src = sourceUrl;
    };
    preCut.src = cutoutUrl;
  }
  loadPortrait();

  const dismiss = (message?: string): void => {
    if (dismissed) return;
    dismissed = true;
    stopTyping();
    stopCoachVoice();
    root.remove();
    if (message) deps.banner(message);
  };

  skipBtn.addEventListener("click", () => dismiss("Tutorial tips off — you've got this!"));

  const bubbleEl = root.querySelector<HTMLElement>("#tutorial-coach-bubble")!;
  const dialogEl = root.querySelector<HTMLElement>("#tutorial-coach-dialog")!;
  bubbleEl.addEventListener("click", () => {
    flags.infoAcknowledged = true;
  });

  function markStepExplained(stepId: TutorialStepId): void {
    if (stepId === "spot_barbarian") flags.barbarianExplained = true;
    if (stepId === "spot_enemy") flags.enemyExplained = true;
  }

  function stopTyping(): void {
    window.clearInterval(typeTimer);
    typeTimer = 0;
    panelEl.classList.remove("speaking");
    portraitEl.classList.remove("speaking");
  }

  /** Reveal the line character-by-character while TTS reads it aloud. */
  function startTyping(message: string, stepId: TutorialStepId): void {
    stopTyping();
    textEl.textContent = "";
    panelEl.classList.add("speaking");
    portraitEl.classList.add("speaking");
    speakCoachLine(message, stepId);
    let i = 0;
    typeTimer = window.setInterval(() => {
      i += 1;
      textEl.textContent = message.slice(0, i);
      if (i >= message.length) stopTyping();
    }, TYPE_MS);
  }

  function seedMarks(step: TutorialStepDef, state: GameState, viewerId: number): void {
    if (step.id === "t1_move_scout") {
      const scout = unitOfType(state, viewerId, "scout");
      if (scout) {
        marks = {
          ...marks,
          scoutStartMove: scout.movementLeft,
          scoutStartCol: scout.col,
          scoutStartRow: scout.row,
        };
      }
    } else if (step.id === "t1_move_warrior") {
      const types = fighterTypesFor(state, viewerId);
      marks = {
        ...marks,
        unitSnapshots: unitsOf(state, viewerId)
          .filter((u) => types.includes(u.type))
          .map((u) => ({ id: u.id, type: u.type, move: u.movementLeft, col: u.col, row: u.row })),
      };
    }
  }

  function positionRing(rect: DOMRect): void {
    const pad = 6;
    ring.hidden = false;
    ring.style.left = `${rect.left - pad}px`;
    ring.style.top = `${rect.top - pad}px`;
    ring.style.width = `${rect.width + pad * 2}px`;
    ring.style.height = `${rect.height + pad * 2}px`;
  }

  function positionRingAt(x: number, y: number, size = 72): void {
    const half = size / 2;
    ring.hidden = false;
    ring.style.left = `${x - half}px`;
    ring.style.top = `${y - half}px`;
    ring.style.width = `${size}px`;
    ring.style.height = `${size}px`;
    ring.style.borderRadius = "50%";
  }

  function resetRingShape(): void {
    ring.style.borderRadius = "12px";
  }

  function tick(): void {
    if (dismissed) return;

    if (!deps.isWorldReady()) {
      root.classList.add("hidden");
      stopTyping();
      stopCoachVoice();
      return;
    }

    const state = deps.getState();
    const player = currentPlayer(state);
    if (!player.isHuman) {
      root.classList.add("hidden");
      return;
    }
    root.classList.remove("hidden");

    const turn = state.turn;
    if (turn > TUTORIAL_COACH_TURNS) {
      dismiss("Tutorial complete — go build your empire!");
      return;
    }

    if (turn !== trackedTurn) {
      trackedTurn = turn;
      marks = {};
      lastStepId = null;
      completedSteps.clear();
      flags.infoAcknowledged = false;
    }

    const ctx: TutorialCoachContext = {
      state,
      viewerId: deps.getViewerId(),
      turn,
      selectedUnitId: deps.getSelectedUnitId(),
      selectedCityId: deps.getSelectedCityId(),
      marks,
      flags,
    };

    const steps = buildTutorialSteps(turn, ctx, encounterInProgress);

    let stepIndex = 0;
    while (stepIndex < steps.length) {
      const candidate = steps[stepIndex]!;
      if (completedSteps.has(candidate.id)) {
        stepIndex++;
        continue;
      }
      if (candidate.isDone(ctx)) {
        markStepExplained(candidate.id);
        encounterInProgress.delete(candidate.id);
        completedSteps.add(candidate.id);
        flags.infoAcknowledged = false;
        stepIndex++;
        continue;
      }
      break;
    }

    if (stepIndex >= steps.length) {
      dismiss("Tutorial complete — go build your empire!");
      return;
    }

    const step = steps[stepIndex]!;
    if (lastStepId !== step.id) {
      seedMarks(step, state, ctx.viewerId);
    }

    if (step.id === "complete") {
      stopTyping();
      textEl.textContent = "Tutorial complete — explore, expand, and conquer!";
      progressEl.textContent = "";
      ring.hidden = true;
      dim.classList.remove("show");
      return;
    }

    if (step.id !== lastStepId) {
      lastStepId = step.id;
      flags.infoAcknowledged = false;
      if (step.id === "spot_barbarian" || step.id === "spot_enemy") {
        encounterInProgress.add(step.id);
        markStepExplained(step.id);
      }
      startTyping(step.message, step.id);
    }
    progressEl.textContent = `Turn ${turn} of ${TUTORIAL_COACH_TURNS}`;
    bubbleEl.classList.toggle("info-only", step.infoOnly === true);
    dialogEl.classList.toggle("info-only", step.infoOnly === true);

    dim.classList.toggle("show", step.mapFocus === true);
    resetRingShape();

    const target = findVisibleTarget(step.targets);
    if (target) {
      positionRing(target.getBoundingClientRect());
    } else if (step.unitHighlight === "warrior") {
      const selected =
        ctx.selectedUnitId != null ? state.units.get(ctx.selectedUnitId) : undefined;
      const u =
        selected?.ownerId === ctx.viewerId && isFighterType(state, ctx.viewerId, selected.type)
          ? selected
          : firstFighterUnit(state, ctx.viewerId);
      if (u) {
        const pt = deps.tileToScreen(u.col, u.row);
        if (pt) positionRingAt(pt.x, pt.y);
        else ring.hidden = true;
      } else {
        ring.hidden = true;
      }
    } else if (step.unitHighlight) {
      const u = unitOfType(state, ctx.viewerId, step.unitHighlight);
      if (u) {
        const pt = deps.tileToScreen(u.col, u.row);
        if (pt) positionRingAt(pt.x, pt.y);
        else ring.hidden = true;
      } else {
        ring.hidden = true;
      }
    } else {
      ring.hidden = true;
    }
  }

  function destroy(): void {
    stopTyping();
    stopCoachVoice();
    root.remove();
    dismissed = true;
  }

  return { tick, destroy };
}
