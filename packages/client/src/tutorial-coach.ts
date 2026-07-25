// In-game tutorial coach: pulsing highlights on HUD buttons for the first five turns.

import type { GameState } from "@roc/sim";
import {
  availableTraining,
  canStartTraining,
  citiesOf,
  computeVisible,
  currentPlayer,
  isMilitary,
  playerById,
  unitsOf,
} from "@roc/sim";
import { getTile } from "@roc/shared";
import { getCiv, startingUnitsFor } from "@roc/data";
import {
  TUTORIAL_COACH_TURNS,
  TUTORIAL_MOVE_STEP_IDS,
  ensureReachableTutorialVillage,
  isTutorialVillageStepDone,
  nearestReachableTutorialVillage,
  nearestReachableTutorialVillageNow,
  tutorialVillageLessonActive,
} from "./tutorial";
import { iconify } from "./icons";
import { speakCoachLine, stopCoachVoice, unlockCoachAudio, retryCoachVoiceIfNeeded } from "./coach-voice";
import {
  isTutorialCoachPortraitReady,
  resolvedTutorialCoachPortraitUrl,
  tutorialCoachPortraitReady,
} from "./tutorial-coach-portrait";
import { TUTORIAL_STEP_IDS, type TutorialStepId } from "./tutorial-coach-steps";

export { TUTORIAL_STEP_IDS, type TutorialStepId };
export {
  TUTORIAL_COACH_LEGEND_ID,
  tutorialCoachCutoutUrl,
  tutorialCoachPortraitUrl,
} from "./tutorial-coach-portrait";

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
  /** Nearby barbarians snapshotted when the attack lesson begins — the step
   *  completes once any of them has bled or died. */
  barbSnapshots?: { id: number; hp: number }[];
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
  /** Highlight an arbitrary map tile (village, barbarian) when no DOM target fits. */
  tileHighlight?: (ctx: TutorialCoachContext) => { col: number; row: number } | null;
  /** Dim everything except the map when the player should tap tiles. */
  mapFocus?: boolean;
  /** Tap the coach bubble to continue (barbarians, enemies, wrap-up). */
  infoOnly?: boolean;
  /** Speak the line, then hide the bubble so HUD panels stay clear to tap. */
  speakThenHide?: boolean;
  /** Final step: render Keep playing / End tutorial buttons in the bubble. */
  choice?: boolean;
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
  const panel = document.querySelector<HTMLElement>("#city-panel");
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
    document.querySelector("#production:not(.hidden)") != null ||
    document.querySelector("#training:not(.hidden)") != null ||
    document.querySelector("#specialists:not(.hidden)") != null
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
  return tutorialVillageLessonActive(state, viewerId);
}

/** Closest visible tribal village tile, for the highlight ring. */
export function nearestVisibleVillage(
  state: GameState,
  viewerId: number,
): { col: number; row: number } | null {
  const visible = computeVisible(state, viewerId);
  let best: { col: number; row: number } | null = null;
  let bestD = Infinity;
  const homes = unitsOf(state, viewerId);
  for (const key of visible) {
    const pos = parseTileKey(key);
    if (!pos) continue;
    const tile = getTile(state.map, pos.col, pos.row);
    if (tile?.feature !== "village") continue;
    const d = Math.min(
      ...homes.map((u) => Math.abs(u.col - pos.col) + Math.abs(u.row - pos.row)),
      Infinity,
    );
    if (d < bestD) {
      bestD = d;
      best = pos;
    }
  }
  return best;
}

/** Closest visible barbarian unit (falling back to a camp tile), for the ring. */
export function nearestVisibleBarbarian(
  state: GameState,
  viewerId: number,
): { col: number; row: number } | null {
  const visible = computeVisible(state, viewerId);
  for (const u of state.units.values()) {
    const owner = playerById(state, u.ownerId);
    if (!owner?.isBarbarian) continue;
    if (visible.has(tileKey(u.col, u.row))) return { col: u.col, row: u.row };
  }
  for (const key of visible) {
    const pos = parseTileKey(key);
    if (!pos) continue;
    const tile = getTile(state.map, pos.col, pos.row);
    if (tile?.feature === "barb_camp") return pos;
  }
  return null;
}

/** Barbarian units close to the player's capital — the attack lesson's targets. */
function nearbyBarbarians(state: GameState, viewerId: number): { id: number; hp: number }[] {
  const city = capitalCity(state, viewerId);
  const anchor = city ?? unitsOf(state, viewerId)[0];
  if (!anchor) return [];
  const out: { id: number; hp: number }[] = [];
  for (const u of state.units.values()) {
    const owner = playerById(state, u.ownerId);
    if (!owner?.isBarbarian) continue;
    const d = Math.abs(u.col - anchor.col) + Math.abs(u.row - anchor.row);
    if (d <= 8) out.push({ id: u.id, hp: u.hp });
  }
  return out;
}

function enemyDisplayName(state: GameState, playerId: number): string {
  const p = playerById(state, playerId);
  if (!p) return "an enemy civilization";
  return getCiv(p.civId)?.name ?? p.name;
}

// Static texts for conditional steps — exported so the voice generator can ship
// clips for lines that may not appear in its synthetic playthrough.
export const SPOT_BARBARIAN_MESSAGE =
  "Steady. Those are barbarians, raiders bred in camps out in the wild. Left alone they will plunder your fields and harry your units. And see how they linger near your borders. We will not leave them be.";
export const SPOT_ENEMY_FALLBACK_MESSAGE =
  "Look there, another civilization walks this land. They found cities, study, and scheme, just as you do. Watch them, trade with them, or fight them. But never ignore them.";
export const T3_VILLAGE_MESSAGE =
  "There, that camp of tents is a tribal village, and they are friendly. Walk any unit onto it and the locals may offer gold, a secret of craft, or even a young warrior eager to join you. In my books, hospitality is never refused.";
export const T4_DIPLOMACY_MESSAGE =
  "You are not alone in this land. You have met another people. Open Diplomacy 🕊️. Wars make the loudest chapters, but trade and truces build the longest empires. Speak first. You can always fight later.";

function spotEnemyMessage(state: GameState, viewerId: number, flags: TutorialCoachFlags): string {
  const me = state.players.find((p) => p.id === viewerId);
  const metRival = me?.met.find((id) => {
    const other = playerById(state, id);
    return other != null && !other.isBarbarian;
  });
  const visibleId = visibleEnemyCivId(state, viewerId);
  const name = metRival != null ? enemyDisplayName(state, metRival) : visibleId != null ? enemyDisplayName(state, visibleId) : null;
  if (name) {
    return `Look there, that is ${name}, another civilization in this land. They found cities, study, and scheme, just as you do. Watch them, trade with them, or fight them. But never ignore them.`;
  }
  return SPOT_ENEMY_FALLBACK_MESSAGE;
}

function spotEnemyStep(state: GameState, viewerId: number, flags: TutorialCoachFlags): TutorialStepDef {
  return {
    id: "spot_enemy",
    message: spotEnemyMessage(state, viewerId, flags),
    infoOnly: true,
    isDone: infoDone,
  };
}

/** Reactive one-time briefings. Barbarians are a SCHEDULED turn-2 lesson now
 *  (the tutorial map plants one near the start), so only rival contact remains. */
function encounterSteps(
  state: GameState,
  viewerId: number,
  flags: TutorialCoachFlags,
  inProgress: ReadonlySet<TutorialStepId>,
): TutorialStepDef[] {
  const out: TutorialStepDef[] = [];
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
          id: "t1_intro",
          message:
            "Ah, there you are. I am Herodotus of Halicarnassus. They call me the father of history, for I wrote down the deeds of kings so the world would not forget them. Today, I write yours. You lead the Indus Valley, among the first peoples on earth to raise true cities, planned to the very brick. Stay with me for five turns and I will teach you to rule. Tap my words when you're ready.",
          infoOnly: true,
          isDone: infoDone,
        },
        {
          id: "t1_select_scout",
          message:
            "Every chronicle begins with a question: what lies beyond the hill? Your Scout answers it. Select them. Tap them on the map, or open your Units list.",
          targets: ["#units-btn"],
          unitHighlight: "scout",
          isDone: ({ state, viewerId, selectedUnitId }) => {
            if (hasHumanCity(state, viewerId)) return true;
            const u = selectedUnitId != null ? state.units.get(selectedUnitId) : undefined;
            return u?.ownerId === viewerId && u.type === "scout";
          },
        },
        {
          id: "t1_unit_stats",
          message:
            "A moment, before they run off. Every unit lives by three numbers. Movement is how far it travels each turn. Sight is how far it sees. Strength is how hard it fights. Your Scout moves three tiles and sees far, but is frail in battle.",
          infoOnly: true,
          isDone: infoDone,
        },
        {
          id: "t1_unit_kinds",
          message:
            "And units come in many kinds. Scouts explore. Melee troops like your Warriors hold the line. Ranged units, your Slingers and Javelineers, strike from a tile away. In time you will tame horses for cavalry, fast and fearsome on open ground. You will raise siege engines to crack city walls, and launch ships to rule the seas. And one day, gunpowder will change everything. The right unit for the right task: that is half of ruling.",
          infoOnly: true,
          isDone: infoDone,
        },
        {
          id: "t1_move_scout",
          message:
            "Now send your Scout toward the horizon. Tap any tile and they will walk until their movement is spent. Every step reveals more of the map.",
          isDone: ({ state, viewerId, marks }) =>
            unitMoveStepDone(state, viewerId, "scout", marks, marks.scoutStartMove, marks.scoutStartCol, marks.scoutStartRow),
        },
        {
          id: "t1_select_warrior",
          message:
            "The wilds hold wolves of the two-legged kind. Select a Warrior. Your Settler should never wander unguarded.",
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
          message:
            "March them wherever you judge best. Beside your Settler is wisest. In my travels I passed many caravans. The ones with spears arrived.",
          isDone: ({ state, viewerId, marks }) => anyFighterMoveDone(state, viewerId, marks),
        },
        {
          id: "t1_select_settler",
          message:
            "And now the one this chronicle is truly about: your Settler. Select them.",
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
            "Tap Found City. Only Settlers can found cities, and cities are how an empire grows. Each one works the land around it and adds its harvest, labor, and learning to your realm. More cities, more of everything. Grassland or plains near food 🍞 serves best.",
          targets: ["#found", "[data-found]"],
          isDone: ({ state, viewerId }) => citiesOf(state, viewerId).length > 0,
        },
        {
          id: "t1_yields",
          message:
            "Look at what your young city now produces. Food 🍞 fills bellies and grows new citizens. Production ⚒️ is labor, and it raises your buildings. Gold 🪙 fills your treasury, paying upkeep and buying what you cannot wait for. Science 🔬 drives discovery. Culture 🎭 shapes your government and laws. And faith 🙏, in time, can found a religion. Every choice you make trades one of these for another.",
          infoOnly: true,
          isDone: infoDone,
        },
        {
          id: "t1_open_research",
          message:
            "A city without learning is only a camp with walls. Open Research 🔬 at the top of your screen.",
          targets: ["#research-btn"],
          isDone: ({ state, viewerId }) => {
            if (playerIsResearching(state, viewerId)) return true;
            return document.querySelector("#research:not(.hidden) .tech[data-tech]") != null;
          },
        },
        {
          id: "t1_pick_research",
          message:
            "Take Plant Cultivation. It unlocks farming and opens the road to pottery and, dearest to my heart, writing. Every discovery has a price in science 🔬, and the science your cities make each turn pays it down. Citizens, buildings like the Archive, and clever specialists all add to it. More science, faster discoveries. Grow, and you will out-think the world.",
          targets: [
            "#research:not(.hidden) .tech[data-tech='cultivation']",
            "#research:not(.hidden) .tech[data-tech]",
          ],
          isDone: ({ state, viewerId }) => playerIsResearching(state, viewerId),
        },
        {
          id: "t1_select_city",
          message: "Now step inside your city. Tap it on the map, or use the Cities button.",
          speakThenHide: true,
          targets: ["#city-panel", "#cities-btn"],
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
            "This is your seat of power. Open Construction 🔨. This is where labor becomes buildings. Some are specialized: a Barracks, an Archery Range, a Stable. Those do more than stand there. They train your citizens into specialized roles, turning farmhands into soldiers, archers, and riders.",
          speakThenHide: true,
          targets: ["#open-prod"],
          isDone: (ctx) => {
            const city = coachedCity(ctx.state, ctx.viewerId, ctx.selectedCityId);
            if (city?.production != null) return true;
            return document.querySelector("#production:not(.hidden) .pcard") != null;
          },
        },
        {
          id: "t1_pick_build",
          message:
            "Pick a project. A Barracks hardens the town and drills melee troops. A Farm feeds it. There is no wrong answer, labor is never wasted. Great works simply take a few turns. Patience.",
          speakThenHide: true,
          targets: ["#production:not(.hidden) .pcard"],
          isDone: (ctx) => hasQueuedProduction(ctx.state, ctx.viewerId, ctx.selectedCityId),
        },
        {
          id: "t1_open_train",
          message: "Cities also raise units themselves. Open Train Units ⚔️.",
          speakThenHide: true,
          targets: ["#open-train"],
          isDone: (ctx) =>
            document.querySelector("#training:not(.hidden)") != null || hasQueuedTraining(ctx.state, ctx.viewerId, ctx.selectedCityId),
        },
        {
          id: "t1_train_unit",
          message:
            "Queue a Scout. And mark this: training spends a citizen. A person leaves the fields and takes up the road. Spend your people wisely.",
          speakThenHide: true,
          targets: ["#training:not(.hidden) [data-train]"],
          isDone: (ctx) =>
            hasQueuedTraining(ctx.state, ctx.viewerId, ctx.selectedCityId) ||
            !canQueueAnyTraining(ctx.state, ctx.viewerId, ctx.selectedCityId),
        },
        {
          id: "t1_next_button",
          message:
            "See the large button in the corner? It always knows what you've forgotten. Tap it at any time, even mid-turn, and it carries you to your next waiting task: an idle unit, an empty research slot, a city with nothing to build. The small button beside it is different. That one ends your turn.",
          targets: ["#endturn"],
          infoOnly: true,
          isDone: infoDone,
        },
        {
          id: "t1_end_turn",
          message:
            "Your first turn is written, and it reads well. When you're satisfied, tap the small button. The world will take its turn, and we will speak again.",
          targets: ["#endturn2", "#endturn"],
          isDone: () => false,
        },
      ];
    case 2:
      return [
        {
          id: "t2_check_city",
          message:
            "Turn two, and your city worked while you slept. Open it and look at Growth 🍞. Food fills the stores, and when they brim, a new citizen is born to work your tiles. Your building and training carry on by themselves.",
          speakThenHide: true,
          targets: ["#city-panel", "#cities-btn"],
          isDone: ({ state, viewerId, selectedCityId }) => {
            if (cityPanelVisible()) return true;
            if (selectedCityId == null) return false;
            const c = state.cities.get(selectedCityId);
            return c?.ownerId === viewerId;
          },
        },
        {
          id: "spot_barbarian",
          message: SPOT_BARBARIAN_MESSAGE,
          infoOnly: true,
          tileHighlight: ({ state, viewerId }) => nearestVisibleBarbarian(state, viewerId),
          isDone: infoDone,
        },
        {
          id: "t2_combat_brief",
          message:
            "Time for your first lesson in war. Select a unit and tap an enemy in reach to attack. In melee, both sides bleed, and strength decides who bleeds more. Ranged units strike without taking a scratch. Terrain and wounds matter too, so watch the odds shown before you commit. And wounded units heal each turn they rest.",
          infoOnly: true,
          isDone: infoDone,
        },
        {
          id: "t2_attack_barbarian",
          message: "Now, your Warrior. Select them, and strike that barbarian down. History smiles on the bold.",
          unitHighlight: "warrior",
          tileHighlight: ({ state, viewerId }) => nearestVisibleBarbarian(state, viewerId),
          isDone: ({ state, marks }) => {
            const snaps = marks.barbSnapshots;
            if (!snaps || snaps.length === 0) return false;
            return snaps.some((s) => {
              const u = state.units.get(s.id);
              return !u || u.hp < s.hp;
            });
          },
        },
        {
          id: "t2_victory",
          message:
            "Well fought. Later, when your army is stronger, hunt down their camp as well. Raze it and you will loot a fine sum of gold 🪙. I have seen empires rise on plunder alone.",
          infoOnly: true,
          isDone: infoDone,
        },
        {
          id: "t2_end_turn",
          message:
            "Let your Scout keep roaming. Tribal villages and rival borders are worth finding early. End the turn when the field is quiet.",
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
                message: T3_VILLAGE_MESSAGE,
                tileHighlight: ({ state, viewerId }: TutorialCoachContext) =>
                  nearestReachableTutorialVillageNow(state, viewerId) ??
                  nearestReachableTutorialVillage(state, viewerId),
                isDone: ({ state, viewerId }: TutorialCoachContext) =>
                  isTutorialVillageStepDone(state, viewerId),
              },
            ]
          : []),
        {
          id: "t3_end_turn",
          message:
            "Push back the fog, and keep your Settler behind spears. The wider your maps, the wiser your choices.",
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
                message: T4_DIPLOMACY_MESSAGE,
                targets: ["#diplo-pill", "[data-bb=\"diplo\"]"],
                isDone: () => document.querySelector("#diplomacy:not(.hidden)") != null,
              },
            ]
          : []),
        {
          id: "t4_end_turn",
          message:
            "Tend the same three fires every turn: your units, your research, your cities' work. Do that, and history bends toward you.",
          targets: ["#endturn", "#endturn2"],
          isDone: () => false,
        },
      ];
    case 5:
      return [
        {
          id: "t5_wrap_up",
          message:
            "My ink runs low, so hear my last lesson. There are many roads to greatness: conquest, culture, science, faith, gold. Open Victory 🏆 now and then to see how you stand. Grow with settlers. Out-think your rivals. And never let a barbarian camp grow old.",
          infoOnly: true,
          isDone: infoDone,
        },
        {
          id: "t5_choice",
          message:
            "Our five turns are spent, and your chronicle has a fine opening chapter. Will you play this game to its end, or set it down here and start fresh when you're ready? Choose below. Either way, you have my blessing... and my quill.",
          choice: true,
          isDone: infoDone,
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

/** The game canvas — clickable only on steps that ask the player to touch the map. */
const GATE_CANVAS_SELECTOR = "#game";

/** In-game menus, panels, and top/bottom bars — always live during the tutorial. */
export const TUTORIAL_HUD_SELECTOR = "#game-hud";

/** Overlays mounted outside #game-hud that must stay usable during guided steps. */
const TUTORIAL_OVERLAY_SELECTORS = ["#combat-preview-overlay"] as const;

/** True when `el` is inside HUD chrome the player may always use while coached. */
export function tutorialHudAlwaysAllowed(el: Element): boolean {
  if (el.closest(TUTORIAL_HUD_SELECTOR)) return true;
  for (const sel of TUTORIAL_OVERLAY_SELECTORS) {
    if (el.closest(sel)) return true;
  }
  return false;
}

/** Close / dismiss controls stay clickable while the coach gate is active. */
export function isTutorialDismissControl(el: Element): boolean {
  const btn = el.closest("button");
  if (!btn) return false;
  if (btn.classList.contains("dialog-x") || btn.classList.contains("panel-close")) return true;
  if (btn.id === "dp-back") return true;
  const id = btn.id;
  if (id && /close$/i.test(id)) return true;
  const label = btn.getAttribute("aria-label")?.toLowerCase();
  return label?.includes("close") === true;
}

/**
 * Interaction gate per step: the full HUD stays clickable at all times; only the
 * map canvas is optionally restricted on steps that don't need it. STEP_GATE
 * `canvas` flags and `targets` still drive coach highlights, not click jails.
 */
const STEP_GATE: Partial<Record<TutorialStepId, { extra?: string[]; canvas?: boolean }>> = {
  // Info-only briefings: only the coach bubble (tap to continue) is live.
  t1_intro: {},
  t1_unit_stats: {},
  t1_unit_kinds: {},
  t1_yields: {},
  t2_combat_brief: {},
  t2_victory: {},
  t5_choice: {},
  spot_barbarian: {},
  spot_enemy: {},
  // The combat lesson: select the Warrior (map or Units list) and strike.
  t2_attack_barbarian: {
    extra: [
      "#units-btn",
      '[data-bb="units"]',
      "#empire",
      "#combat-preview-overlay",
      "#combat-preview-dialog",
      "#combat-preview-attack",
      "#combat-preview-cancel",
    ],
    canvas: true,
  },
  // Unit selection can happen on the map or through the Units list.
  t1_select_scout: { extra: ["#units-btn", '[data-bb="units"]', "#empire"], canvas: true },
  t1_move_scout: { canvas: true },
  t1_select_warrior: { extra: ["#units-btn", '[data-bb="units"]', "#empire"], canvas: true },
  t1_move_warrior: { canvas: true },
  t1_select_settler: { extra: ["#units-btn", '[data-bb="units"]', "#empire"], canvas: true },
  t1_found_city: { extra: ["#found", "[data-found]"], canvas: true },
  t1_open_research: { extra: ["#research-btn", "#research"] },
  t1_pick_research: { extra: ["#research"] },
  t1_select_city: { extra: ["#cities-btn", '[data-bb="empire"]', "#empire", "#city-panel"], canvas: true },
  t1_open_construction: { extra: ["#cities-btn", "#city-panel", "#production"], canvas: true },
  t1_pick_build: { extra: ["#city-panel", "#production"], canvas: true },
  t1_open_train: { extra: ["#cities-btn", "#city-panel", "#training"], canvas: true },
  t1_train_unit: { extra: ["#city-panel", "#training"], canvas: true },
  t2_check_city: { extra: ["#cities-btn", '[data-bb="empire"]', "#empire", "#city-panel"], canvas: true },
  t3_village: { canvas: true },
  t4_diplomacy: { extra: ["#diplo-pill", '[data-bb="diplo"]', "#diplomacy"] },
};

/** Selectors highlighted for a step (coach ring). Not used to block HUD clicks. */
export function gateSelectorsForStep(step: TutorialStepDef): string[] {
  const list = [...(step.targets ?? [])];
  const gate = STEP_GATE[step.id];
  if (gate?.extra) list.push(...gate.extra);
  if (isEndTurnStep(step)) list.push("#endturn", "#endturn2");
  return list;
}

/** Whether `step` lets the player interact with the map canvas. */
export function gateAllowsCanvas(step: TutorialStepDef): boolean {
  return STEP_GATE[step.id]?.canvas ?? false;
}

/** Strip emoji so TTS / ElevenLabs reads clean prose. */
/** Phonetic respellings applied ONLY to the spoken (TTS) text, never the on-screen
 *  text, so the voice pronounces names the model otherwise mangles. The bubble
 *  still displays the correct spelling. */
const SPEECH_PRONUNCIATIONS: [RegExp, string][] = [
  // The narrator's own name reads badly as plain "Herodotus". Force the exact
  // pronunciation huh-ROD-uh-tus (/həˈrɑːdətəs/) with an SSML phoneme tag. NOTE:
  // phoneme tags need a phoneme-capable model — the voice generator auto-switches
  // any clip containing "<phoneme" to one (see tools/generate-coach-voice.ts).
  [/Herodotus/g, '<phoneme alphabet="cmu-arpabet" ph="HH AH0 R AA1 D AH0 T AH0 S">Herodotus</phoneme>'],
];

export function coachSpeechText(message: string): string {
  let text = message
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  for (const [pattern, replacement] of SPEECH_PRONUNCIATIONS) {
    text = text.replace(pattern, replacement);
  }
  return text;
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
  /** "End tutorial here" on the final choice — leave the game back to the menu. */
  exitToMenu?: () => void;
  /** Spawn the turn-3 tribal village on demand (so it can't be collected early). */
  ensureTutorialVillage?: () => void;
  /** Replace unreachable villages so turn 3 can always be completed. */
  ensureReachableTutorialVillage?: () => void;
  /** Spawn the turn-2 barbarian on demand (so it can't be fought/fled early). */
  ensureTutorialBarbarian?: () => void;
  /** Give the player's units fresh movement when a map-action lesson begins. */
  refreshTutorialMovement?: (stepId: string) => void;
  /** Analytics: the coaching ended (all steps done, or the player skipped it). */
  onTutorialEnd?: (outcome: "completed" | "skipped") => void;
  /** Analytics: where the player currently is, so an abandon records the drop-off point. */
  onTutorialStep?: (stepId: string, turn: number) => void;
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
  /** Bumped on every startTyping so a delayed audio/fallback callback from a
   *  superseded line can't hijack the current one. */
  let typeSeq = 0;
  const TYPE_MS = 34;
  /** speakThenHide: wait for both text reveal and voice before clearing the bubble. */
  let briefingTypingDone = false;
  let briefingVoiceDone = false;
  let briefingStepId: TutorialStepId | null = null;
  let briefingVoiceFallbackTimer = 0;

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
    `<div id="tutorial-coach-choice" hidden>` +
    `<button type="button" id="tutorial-coach-continue">Keep playing</button>` +
    `<button type="button" id="tutorial-coach-finish">End tutorial here</button>` +
    `</div>` +
    `<div id="tutorial-coach-foot">` +
    `<span id="tutorial-coach-progress"></span>` +
    `<button type="button" id="tutorial-coach-skip">Skip tutorial tips</button>` +
    `</div></div>` +
    `<img id="tutorial-coach-portrait" alt="Herodotus, your tutorial advisor" />` +
    `</div>`;
  document.body.appendChild(root);

  const dim = root.querySelector<HTMLElement>("#tutorial-coach-dim")!;
  const ring = root.querySelector<HTMLElement>("#tutorial-coach-ring")!;
  const textEl = root.querySelector<HTMLElement>("#tutorial-coach-text")!;
  const progressEl = root.querySelector<HTMLElement>("#tutorial-coach-progress")!;
  const skipBtn = root.querySelector<HTMLButtonElement>("#tutorial-coach-skip")!;
  const panelEl = root.querySelector<HTMLElement>("#tutorial-coach-panel")!;
  const portraitEl = root.querySelector<HTMLImageElement>("#tutorial-coach-portrait")!;

  // ---- interaction gate --------------------------------------------------
  // HUD menus stay live for the whole tutorial. Only the map is optionally gated
  // on steps that don't need map input (info briefings, panel-only steps).
  let gateActive = false;
  let gateSelectors: string[] = [];
  let gateCanvas = false;

  function gateAllows(target: EventTarget | null): boolean {
    const el = target instanceof Element ? target : null;
    if (!el) return true;
    if (root.contains(el)) return true; // coach bubble / skip
    if (isTutorialDismissControl(el)) return true;
    if (tutorialHudAlwaysAllowed(el)) return true;
    for (const sel of gateSelectors) {
      if (el.closest(sel)) return true;
    }
    if (gateCanvas && el.closest(GATE_CANVAS_SELECTOR)) return true;
    return false;
  }

  const gateHandler = (e: Event): void => {
    if (!gateActive || dismissed) return;
    if (gateAllows(e.target)) return;
    e.preventDefault();
    e.stopPropagation();
    (e as Event & { stopImmediatePropagation?: () => void }).stopImmediatePropagation?.();
  };
  const GATE_EVENTS = ["pointerdown", "mousedown", "click", "touchstart"] as const;
  for (const type of GATE_EVENTS) window.addEventListener(type, gateHandler, true);

  function loadPortrait(): void {
    const url = resolvedTutorialCoachPortraitUrl();
    if (url) {
      portraitEl.src = url;
      return;
    }
    void tutorialCoachPortraitReady().then(() => {
      const readyUrl = resolvedTutorialCoachPortraitUrl();
      if (readyUrl) portraitEl.src = readyUrl;
    });
  }
  loadPortrait();

  function resetBriefing(stepId: TutorialStepId | null): void {
    window.clearTimeout(briefingVoiceFallbackTimer);
    briefingVoiceFallbackTimer = 0;
    briefingTypingDone = false;
    briefingVoiceDone = false;
    briefingStepId = stepId;
    root.classList.remove("coach-action-ready");
  }

  function enterActionPhaseIfReady(): void {
    if (!briefingStepId) return;
    if (!briefingTypingDone || !briefingVoiceDone) return;
    root.classList.add("coach-action-ready");
    panelEl.classList.remove("speaking");
    portraitEl.classList.remove("speaking");
  }

  const removeGate = (): void => {
    gateActive = false;
    for (const type of GATE_EVENTS) window.removeEventListener(type, gateHandler, true);
  };

  const dismiss = (outcome: "completed" | "skipped", message?: string): void => {
    if (dismissed) return;
    dismissed = true;
    removeGate();
    resetBriefing(null);
    stopTyping();
    stopCoachVoice();
    root.remove();
    deps.onTutorialEnd?.(outcome);
    if (message) deps.banner(message);
  };

  skipBtn.addEventListener("click", () => dismiss("skipped", "Tutorial tips off. You've got this!"));

  const bubbleEl = root.querySelector<HTMLElement>("#tutorial-coach-bubble")!;
  const dialogEl = root.querySelector<HTMLElement>("#tutorial-coach-dialog")!;
  const choiceEl = root.querySelector<HTMLElement>("#tutorial-coach-choice")!;
  /** Whether the current step advances on a bubble tap (info-only briefings). */
  let bubbleTapAdvances = false;
  bubbleEl.addEventListener("click", () => {
    unlockCoachAudio();
    retryCoachVoiceIfNeeded();
    if (bubbleTapAdvances) flags.infoAcknowledged = true;
  });
  choiceEl.querySelector<HTMLButtonElement>("#tutorial-coach-continue")!.addEventListener("click", () => {
    flags.infoAcknowledged = true;
  });
  choiceEl.querySelector<HTMLButtonElement>("#tutorial-coach-finish")!.addEventListener("click", () => {
    // The choice only appears after the last coached turn, so leaving here still
    // counts as having seen the tutorial through.
    dismiss("completed");
    deps.exitToMenu?.();
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

  /** Reveal the line character-by-character, paced to Herodotus's voice so the
   *  text appears as he speaks rather than racing ahead of the audio. */
  function startTyping(message: string, stepId: TutorialStepId, speakThenHide: boolean): void {
    stopTyping();
    textEl.textContent = "";
    panelEl.classList.add("speaking");
    portraitEl.classList.add("speaking");

    const markTypingDone = (): void => {
      if (!speakThenHide || briefingStepId !== stepId) return;
      briefingTypingDone = true;
      enterActionPhaseIfReady();
      briefingVoiceFallbackTimer = window.setTimeout(() => {
        if (briefingStepId !== stepId || briefingVoiceDone) return;
        briefingVoiceDone = true;
        enterActionPhaseIfReady();
      }, 4000);
    };

    const markVoiceDone = (): void => {
      if (!speakThenHide || briefingStepId !== stepId) return;
      window.clearTimeout(briefingVoiceFallbackTimer);
      briefingVoiceFallbackTimer = 0;
      briefingVoiceDone = true;
      enterActionPhaseIfReady();
    };

    // Reveal by code point (not UTF-16 unit) so a multi-char emoji is never split
    // mid-reveal, and render via innerHTML+iconify so emoji become the game's
    // painted icons instead of raw system emoji.
    const chars = Array.from(message);
    const token = ++typeSeq;
    let started = false;
    const beginTyping = (perCharMs: number): void => {
      if (started || token !== typeSeq) return; // superseded or already running
      started = true;
      let i = 0;
      typeTimer = window.setInterval(() => {
        i += 1;
        textEl.innerHTML = iconify(chars.slice(0, i).join(""));
        if (i >= chars.length) {
          stopTyping();
          markTypingDone();
        }
      }, perCharMs);
    };

    if (speakThenHide) {
      briefingVoiceDone = false;
    } else {
      briefingVoiceDone = true;
    }

    speakCoachLine(message, stepId, {
      // Spread the reveal across ~92% of the clip so text lands just before the
      // voice finishes; clamp per-char speed so it stays readable either way.
      onPlay: (durationSec) => {
        const ms =
          durationSec > 0.3
            ? Math.min(90, Math.max(18, (durationSec * 1000 * 0.92) / chars.length))
            : TYPE_MS;
        beginTyping(ms);
      },
      onFallback: () => beginTyping(TYPE_MS),
      onEnd: speakThenHide ? markVoiceDone : undefined,
    });

    // Safety net: if no clip plays and no fallback fires (e.g. audio blocked and
    // speech synthesis is silent) within a beat, reveal at the default pace so the
    // bubble is never left blank.
    window.setTimeout(() => beginTyping(TYPE_MS), 1400);
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
    } else if (step.id === "t2_attack_barbarian") {
      marks = { ...marks, barbSnapshots: nearbyBarbarians(state, viewerId) };
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

    if (!deps.isWorldReady() || !isTutorialCoachPortraitReady()) {
      gateActive = false;
      root.classList.add("hidden");
      stopTyping();
      stopCoachVoice();
      return;
    }

    // Hide the coach until the portrait element has decoded (avoids an empty bubble flash).
    if (resolvedTutorialCoachPortraitUrl() && (!portraitEl.complete || portraitEl.naturalWidth <= 0)) {
      gateActive = false;
      root.classList.add("hidden");
      return;
    }

    const state = deps.getState();
    const player = currentPlayer(state);
    if (!player.isHuman) {
      gateActive = false;
      root.classList.add("hidden");
      return;
    }
    root.classList.remove("hidden");

    const turn = state.turn;
    if (turn > TUTORIAL_COACH_TURNS) {
      dismiss("completed", "The chronicle is yours. Rule well!");
      return;
    }

    if (turn !== trackedTurn) {
      trackedTurn = turn;
      marks = {};
      lastStepId = null;
      completedSteps.clear();
      flags.infoAcknowledged = false;
      // Ending the turn counts as reading any open one-time briefing — otherwise
      // an untapped "spot barbarian/enemy" line replays at the start of every turn.
      encounterInProgress.clear();
      // Spawn each guaranteed encounter exactly when its lesson begins, so it
      // cannot be fought or collected before its turn (which would strand the
      // step waiting on a thing that's already gone).
      if (turn === 2) deps.ensureTutorialBarbarian?.();
      if (turn === 3) deps.ensureReachableTutorialVillage?.();
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
      dismiss("completed", "The chronicle is yours. Rule well!");
      return;
    }

    const step = steps[stepIndex]!;
    deps.onTutorialStep?.(step.id, turn);
    if (lastStepId !== step.id) {
      if (step.id === "t2_attack_barbarian") {
        deps.ensureTutorialBarbarian?.();
        deps.refreshTutorialMovement?.(step.id);
      } else if (TUTORIAL_MOVE_STEP_IDS.has(step.id)) {
        deps.refreshTutorialMovement?.(step.id);
        if (step.id === "t3_village") deps.ensureReachableTutorialVillage?.();
      }
      seedMarks(step, state, ctx.viewerId);
    } else if (step.id === "t2_attack_barbarian" && !marks.barbSnapshots?.length) {
      deps.ensureTutorialBarbarian?.();
      const fresh = nearbyBarbarians(state, ctx.viewerId);
      if (fresh.length) marks = { ...marks, barbSnapshots: fresh };
    }

    // Confine interaction to this step's allowed targets (plus the coach and,
    // when the step needs it, the map). End-turn steps are free-play — the coach
    // invites the player to explore and grow — so they lift the gate entirely.
    if (isEndTurnStep(step)) {
      gateActive = false;
    } else {
      gateActive = true;
      gateSelectors = gateSelectorsForStep(step);
      gateCanvas = gateAllowsCanvas(step);
    }

    if (step.id === "complete") {
      gateActive = false;
      stopTyping();
      textEl.textContent = "The chronicle is yours. Explore, expand, and conquer!";
      progressEl.textContent = "";
      ring.hidden = true;
      dim.classList.remove("show");
      return;
    }

    if (step.id !== lastStepId) {
      lastStepId = step.id;
      flags.infoAcknowledged = false;
      resetBriefing(step.speakThenHide ? step.id : null);
      if (step.id === "spot_barbarian" || step.id === "spot_enemy") {
        encounterInProgress.add(step.id);
        markStepExplained(step.id);
      }
      startTyping(step.message, step.id, step.speakThenHide === true);
    }
    progressEl.textContent = `Turn ${turn} of ${TUTORIAL_COACH_TURNS}`;
    bubbleTapAdvances = step.infoOnly === true;
    bubbleEl.classList.toggle("info-only", step.infoOnly === true);
    dialogEl.classList.toggle("info-only", step.infoOnly === true);
    choiceEl.hidden = step.choice !== true;

    if (step.id === "t3_village" && !isTutorialVillageStepDone(state, ctx.viewerId)) {
      if (!nearestReachableTutorialVillageNow(state, ctx.viewerId)) {
        const full = nearestReachableTutorialVillage(state, ctx.viewerId);
        const mobile = unitsOf(state, ctx.viewerId).filter(
          (u) => u.aboardShipId === undefined && u.escortingRouteId === undefined,
        );
        if (!full) {
          deps.ensureReachableTutorialVillage?.();
        } else if (!mobile.some((u) => u.movementLeft > 0)) {
          deps.refreshTutorialMovement?.(step.id);
        }
      }
    }

    dim.classList.toggle("show", step.mapFocus === true);
    resetRingShape();

    const target = findVisibleTarget(step.targets);
    const tilePos = step.tileHighlight?.(ctx) ?? null;
    if (target) {
      positionRing(target.getBoundingClientRect());
    } else if (tilePos) {
      const pt = deps.tileToScreen(tilePos.col, tilePos.row);
      if (pt) positionRingAt(pt.x, pt.y);
      else ring.hidden = true;
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
    removeGate();
    resetBriefing(null);
    stopTyping();
    stopCoachVoice();
    root.remove();
    dismissed = true;
  }

  return { tick, destroy };
}
