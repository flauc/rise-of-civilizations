/// <reference types="vite/client" />
import {
  researchableGovernmentsFor,
  availableTechs,
  canFoundReligion,
  cityAt,
  tradeRouteViaMessage,
  citiesOf,
  combatPreview,
  combatPreviewDetail,
  computeAttackTargets,
  computeReachable,
  peaceWarTargets,
  incursionTargets,
  abilityTargets,
  ACTIVE_ABILITY_DEFS,
  getCiv,
  unitAt,
  unitsOf,
  workableTiles,
  expansionCandidates,
  nextExpansionTile,
  expansionScorer,
  cityBombardTargets,
  cityBombardsUsed,
  cityBombardAllowance,
  computeRoadPath,
  canStartRoadRoute,
  freeSurveySpecialistIds,
  tilesNeedingRoad,
  canDeclareWar,
  UNIT_DEFS,
  TERRAIN_NAMES,
  isRough,
  serializeState,
  uniqueUnitForCiv,
  type ActiveAbilityId,
  type GameState,
} from "@roc/sim";
import { getTile } from "@roc/shared";
import { Camera } from "./camera";
import {
  computeWorldBounds,
  drawScene,
  screenToTile,
  tileCenterWorld,
  BASE_SIZE,
} from "./renderer";
import { drawOverlay } from "./overlay";
import { attachInput } from "./input";
import { pickUnitAtScreen } from "./unit-pick";
import { createUI } from "./ui";
import type { CombatOdds, TileTip } from "./ui-types";
import { showCombatPreviewDialog } from "./combat-preview-ui";
import { getSettings } from "./settings";
import { mountGameChat } from "./mp-chat";
import { createLobby } from "./lobby-ui";
import { preloadGameAssets, preloadDeferredGameAssets } from "./asset-preload";
import { createLegalViewer, type LegalPage } from "./legal-viewer";
import { createSupportPage, registerSupportPage, supportPageFromLocation } from "./support-page";
import { initPhoneShellSync } from "./viewport-shell";
import { consumeNativeBootRoute, initialOverlayRoute, isNativeApp, isStandaloneDisplay, setLobbyHidden } from "./app-routes";
import { loadTerrainAtlas } from "./terrain-assets";
import { loadCoastAtlas } from "./coast-assets";
import { loadMapEdgeAtlas } from "./map-edge-assets";
import { loadRiverAtlas } from "./river-assets";
import { loadRoadAtlas } from "./road-assets";
import { loadUnitAtlas } from "./unit-assets";
import { loadCityAtlas } from "./city-assets";
import { loadImprovementAtlas } from "./improvement-assets";
import { loadConstructionAtlas } from "./construction-assets";
import { loadFeatureAtlas } from "./feature-assets";
import {
  ensureNaturalWonderTiles,
  getNaturalWonderAtlas,
  naturalWonderIdsOnMap,
} from "./natural-wonder-assets";
import { ensureWonderTiles, getWonderAtlas, wonderIdsOnMap } from "./wonder-assets";
import { loadResourceAtlas } from "./resource-assets";
import { loadAbilityAtlas } from "./ability-assets";
import { loadReligionIconAtlas } from "./religion-assets";
import { LocalSession, MAP_DIMENSIONS, type Session } from "./session";
import type { CheatAction } from "./god-mode";
import { exportSave, listSavesForUser, makeSaveRecord, saveGame, type SaveRecord } from "./save-db";
import { getAccount, getSaveOwnerId } from "./account";
import { initAnalytics, trackSessionStart, trackSessionEnd, trackBugReport, noteTurns, abandonActiveSession, buildSessionScoreboard, viewerScoreFromBoard, registerSessionSnapshotProvider, trackTutorialEnd, noteTutorialStep, type GameSetup } from "./analytics";
import { resetHudOverlays } from "./hud-root";
import { unlockCoachAudio, retryCoachVoiceIfNeeded } from "./coach-voice";
import { unlockGameAudio } from "./game-audio-unlock";
import {
  isCombatTargetedAbility,
  markPlayerCombatSound,
  playBuildingSound,
  resetCombatSoundTracking,
  setCivilizationBgm,
  syncCombatSounds,
  unlockAppAudioFromGesture,
} from "./game-sounds";
import {
  refreshTutorialMovement,
  spawnTutorialBarbarian,
  spawnTutorialVillage,
  ensureReachableTutorialVillage,
  seedTutorialSurroundings,
} from "./tutorial";
import {
  beginTutorialCoachPortraitPreload,
  tutorialCoachPortraitReady,
} from "./tutorial-coach-portrait";
import { installIconifyHook } from "./icons";
import { initScreenRotation, getCanvasViewportSize } from "./screen-rotation";
import { createLoadingScreen, createTutorialPreparingScreen, type LoadingScreenHandle } from "./loading-screen";
import { MapLayerCache } from "./map-layer-cache";

const canvas = document.getElementById("game") as HTMLCanvasElement;
const ctx = canvas.getContext("2d");
if (!ctx) throw new Error("2D canvas context unavailable");

// Swap emoji for generated icons app-wide (no-op until the icon set is present).
installIconifyHook();
initAnalytics();
initScreenRotation();
initPhoneShellSync();
if (isNativeApp()) document.body.classList.add("roc-native");
if (isStandaloneDisplay()) document.body.classList.add("roc-standalone");
const legalViewer = createLegalViewer();
legalViewer.wireLinks();
const supportPage = createSupportPage();
registerSupportPage(supportPage);
supportPage.wireLinks();

const bootRoute = consumeNativeBootRoute(initialOverlayRoute(location));

function openBootRoute(): void {
  if (bootRoute === "support") {
    setLobbyHidden(true);
    supportPage.open();
  } else if (bootRoute) {
    setLobbyHidden(true);
    legalViewer.open(bootRoute as LegalPage);
  }
}

createLobby(startGame);
openBootRoute();
delete window.__ROC_BOOT_ROUTE__;

function onAppAudioGesture(): void {
  unlockAppAudioFromGesture();
}
document.addEventListener("pointerdown", onAppAudioGesture, { capture: true });
document.addEventListener("touchstart", onAppAudioGesture, { capture: true });
document.addEventListener("touchend", onAppAudioGesture, { capture: true });
document.addEventListener("click", onAppAudioGesture, { capture: true });
document.addEventListener("keydown", onAppAudioGesture, { capture: true });

// Stream the game's assets in behind the lobby, so they are warm by the time a
// game is created. Called after createLobby so the lobby's own leader portraits
// claim the connection first, and skipped for a deep link to a legal or support
// page, which is not a visit on its way to a game.
if (!bootRoute) preloadGameAssets();

function startGame(session: Session, setup: GameSetup = {}): void {
  resetHudOverlays();
  resetCombatSoundTracking();
  if (setup.civId && setup.civId !== "random") setCivilizationBgm(setup.civId);
  let playerBgmSynced = !!(setup.civId && setup.civId !== "random");
  let loadingDismissed = false;
  let mapBackdropNotified = false;
  let hudInteractiveNotified = false;
  let hudInteractivePending = false;
  let loadingRepaintAt = 0;
  function onLoadingDismiss(): void {
    loadingDismissed = true;
    document.body.classList.remove("roc-loading-scroll", "roc-loading-block-input");
    document.body.classList.add("roc-map-painted");
    document.getElementById("game-loading")?.remove();
    fitted = false;
    resize();
    bumpMapLayers();
    update();
    renderGameHud();
    needsRedraw = true;
    // WebKit can miss the first HUD wiring pass; repaint a few frames before input.
    requestAnimationFrame(() => {
      renderGameHud();
      needsRedraw = true;
      requestAnimationFrame(() => {
        renderGameHud();
        needsRedraw = true;
      });
    });
    if (session.hasState()) {
      ui.banner(`${st().players[st().currentPlayerIndex]?.name ?? "Player"}, Turn ${st().turn}`);
    }
    if (setup.isTutorial) ensureTutorialCoach();
  }
  const unlockGameAudioFromGesture = (): void => {
    unlockGameAudio();
    unlockCoachAudio();
    retryCoachVoiceIfNeeded();
    unlockAppAudioFromGesture();
  };
  document.addEventListener("pointerdown", unlockGameAudioFromGesture, { capture: true });
  document.addEventListener("touchstart", unlockGameAudioFromGesture, { capture: true });
  if (setup.isTutorial) beginTutorialCoachPortraitPreload();
  const loadingScreen: LoadingScreenHandle = setup.isTutorial
    ? createTutorialPreparingScreen({
        onDismiss: onLoadingDismiss,
        portraitReady: () => tutorialCoachPortraitReady(),
      })
    : createLoadingScreen({
        civId: setup.civId,
        resolveCivId: () => {
          if (!session.hasState()) return undefined;
          const me = session.getViewerId();
          return session.getState().players.find((p) => p.id === me)?.civId;
        },
        onDismiss: onLoadingDismiss,
      });
  let worldGenNotified = false;
  let mapFramePainted = false;
  let hudPrimed = false;
  function maybeNotifyWorldGenerated(): void {
    if (worldGenNotified || !session.hasState()) return;
    worldGenNotified = true;
    fitted = false;
    loadingScreen.notifyWorldGenerated();
  }

  const camera = new Camera();
  let dpr = 1;
  let cssWidth = 0;
  let cssHeight = 0;
  let needsRedraw = true;
  let needsHudRender = true;
  let fitted = false;
  const mapLayerCache = new MapLayerCache();
  let terrainRev = 0;
  let fogRev = 0;
  const bumpMapLayers = (): void => {
    terrainRev++;
    fogRev++;
  };

  let selectedUnitId: number | null = null;
  let selectedCityId: number | null = null;
  let selectedTile: { col: number; row: number } | null = null;
  // After ordering a settler to found a city, remember where so we can auto-select the
  // new city once it exists (immediately for local play, next view update for online).
  let pendingFoundAt: { col: number; row: number } | null = null;
  let reachable = new Set<string>();
  let reachableCosts = new Map<string, number>();
  let attackTargets = new Set<string>();
  let pendingAbility: ActiveAbilityId | null = null; // targeted ability awaiting a tile
  let abilityTargetSet = new Set<string>();
  let peaceAttack = new Set<string>(); // would-declare-war attacks
  let incursion = new Map<string, number>(); // foreign peace tiles -> owner id
  let cityWorkable = new Set<string>();
  // Border-expansion picker: when set, the player is choosing the selected city's
  // next-to-claim tile, and `expandCandidates` holds the tiles they can pick from.
  let expandPickCityId: number | null = null;
  let expandCandidates = new Set<string>();
  // The "tap a tile" hint only teaches the picker, so show it once per game.
  let expandHintShown = false;
  // City bombardment: when set, the player is aiming the selected city's once-a-turn
  // bombardment, and `bombardTargets` holds the enemy tiles it can hit.
  let bombardCityId: number | null = null;
  let bombardTargets = new Set<string>();
  // The "tap a highlighted enemy" hint only teaches the aimer, so show it once per game.
  let bombardHintShown = false;
  // Road-route picker: first tile chosen in the tile panel, second tap on the map
  // sets the destination and queues surveyors to pave the path.
  let roadRouteFrom: { col: number; row: number } | null = null;
  let visible = new Set<string>();
  let liftFog = false; // God Mode: render the whole map with no fog
  let gameOverShown = false;
  let gameOverExploreMap = false;
  let wasResolvingTurn = false;
  let sessionTracked = false;
  let hoverOdds: CombatOdds | null = null;
  let idleCycle = 0;
  let mpSaves: SaveRecord[] = [];

  const st = () => session.getState();

  // God Mode cheats are only ever offered on a local dev build running on
  // localhost. Even in single-player, a hosted/production deployment must never
  // expose them, so we gate on the hostname in addition to the offline check.
  const isLocalhost = (() => {
    const h = window.location.hostname;
    return h === "localhost" || h === "127.0.0.1" || h === "::1" || h === "[::1]";
  })();

  // Every tile key, cached per map — used to reveal the whole board in God Mode.
  let allKeysCache: { tiles: GameState["map"]["tiles"]; keys: Set<string> } | null = null;
  function allTileKeys(state: GameState): Set<string> {
    if (allKeysCache?.tiles === state.map.tiles) return allKeysCache.keys;
    const keys = new Set<string>();
    for (const t of state.map.tiles) keys.add(`${t.col},${t.row}`);
    allKeysCache = { tiles: state.map.tiles, keys };
    return keys;
  }

  function recomputeOverlays(): void {
    const u = selectedUnitId != null ? st().units.get(selectedUnitId) : undefined;
    if (!u || u.ownerId !== session.getViewerId()) {
      reachable = new Set();
      reachableCosts = new Map();
      attackTargets = new Set();
      peaceAttack = new Set();
      incursion = new Map();
      return;
    }
    const reach = computeReachable(st(), u);
    reachable = new Set(reach.keys());
    reachableCosts = new Map([...reach.entries()].map(([k, v]) => [k, v.cost]));
    attackTargets = computeAttackTargets(st(), u);
    peaceAttack = peaceWarTargets(st(), u);
    incursion = incursionTargets(st(), u);
  }

  function civNameOf(playerId: number): string {
    const p = st().players.find((pl) => pl.id === playerId);
    return getCiv(p?.civId)?.name ?? p?.name ?? "them";
  }

  /** Lightweight confirm modal for war-triggering actions. */
  function confirmAction(message: string, onYes: () => void): void {
    let modal = document.getElementById("confirm-modal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "confirm-modal";
      // Alignment and padding come from the #confirm-modal rules in index.html
      // (top-anchored on desktop, centered on touch screens).
      modal.style.cssText =
        "position:fixed;inset:0;z-index:70;background:rgba(15,14,11,.72);display:flex;justify-content:center";
      document.body.appendChild(modal);
    }
    modal.innerHTML =
      `<div style="width:min(420px,92vw);background:var(--panel);border:1px solid var(--edge);border-radius:16px;padding:18px 20px;text-align:center">` +
      `<div style="font-size:30px">⚔️</div>` +
      `<div style="color:var(--parchment);margin:10px 0 16px;line-height:1.5">${message}</div>` +
      `<div style="display:flex;gap:10px;justify-content:center">` +
      `<button class="btn" id="cf-no">Cancel</button>` +
      `<button class="btn" id="cf-yes" style="background:var(--danger);border-color:#a04040;color:#f0dcd2">Declare War</button></div></div>`;
    modal.style.display = "flex";
    const dismiss = () => { modal!.style.display = "none"; };
    modal.querySelector<HTMLButtonElement>("#cf-no")!.onclick = dismiss;
    modal.querySelector<HTMLButtonElement>("#cf-yes")!.onclick = () => { dismiss(); onYes(); };
  }

  function update(): void {
    maybeNotifyWorldGenerated();
    if (!session.hasState()) return;
    if (!playerBgmSynced) {
      const me = session.getViewerId();
      const civId = st().players.find((p) => p.id === me)?.civId;
      if (civId) {
        setCivilizationBgm(civId);
        playerBgmSynced = true;
      }
    }
    // Analytics: record the session start once the game state is ready (for an
    // online game the first state view arrives a moment after startGame).
    if (!sessionTracked) {
      sessionTracked = true;
      const me = session.getViewerId();
      const players = st().players;
      const dims = st().map;
      const sizeEntry = Object.entries(MAP_DIMENSIONS).find(
        ([, d]) => d.cols === dims.cols && d.rows === dims.rows,
      );
      trackSessionStart({
        mode: session.isOnline ? "mp" : "sp",
        civId: players.find((p) => p.id === me)?.civId,
        // Prefer the chosen map type/size from setup; fall back to deriving size.
        mapType: setup.mapType,
        mapSize: setup.mapSize ?? sizeEntry?.[0],
        cols: dims.cols,
        rows: dims.rows,
        aiCount: players.filter((p) => !p.isHuman && !p.isBarbarian).length,
        barbarians: players.some((p) => p.isBarbarian),
        legends: setup.legends ?? st().legendsEnabled,
        // Config that only exists at setup time (not on the running state).
        barbarianLevel: setup.barbarianLevel,
        naturalWonders: setup.naturalWonders,
        villages: setup.villages,
        startingGold: setup.startingGold,
        turnLimit: setup.turnLimit,
        gameSpeed: setup.gameSpeed,
        aiCivIds: setup.aiCivIds,
        enabledVictories: setup.enabledVictories,
        isTutorial: setup.isTutorial,
      });
    }
    noteTurns(st().turn);
    syncCombatSounds(st());
    visible = session.getVisible();
    // Drop selection if the unit no longer exists (died/consumed/captured).
    if (selectedUnitId != null && !st().units.has(selectedUnitId)) selectedUnitId = null;
    // A just-founded city: select it so its panel (Construction / Train Units /
    // Specialists) opens automatically once the settler has become the city.
    // Only honor this while the player still has nothing selected — founding
    // clears the selection, so any active selection means they moved on (e.g.
    // picked another unit) and we must not steal focus back to the new city.
    if (pendingFoundAt) {
      if (selectedUnitId != null || selectedCityId != null || selectedTile != null) {
        pendingFoundAt = null;
      } else {
        const me = session.getViewerId();
        const city = [...st().cities.values()].find(
          (c) => c.col === pendingFoundAt!.col && c.row === pendingFoundAt!.row && c.ownerId === me,
        );
        if (city) {
          selectedCityId = city.id;
          selectedUnitId = null;
          pendingFoundAt = null;
        }
      }
    }
    if (selectedCityId != null) {
      const city = st().cities.get(selectedCityId);
      cityWorkable = city ? new Set(workableTiles(st(), city).map((t) => `${t.col},${t.row}`)) : new Set();
    }
    recomputeOverlays();
    if (!fitted && cssWidth > 0 && cssHeight > 0) {
      // Center the camera on the player's starting settler (or first unit).
      const me = session.getViewerId();
      const myUnits = unitsOf(st(), me);
      const startUnit = myUnits.find((u) => u.type === "settler") ?? myUnits[0];
      if (startUnit) {
        camera.zoom = 2.2;
        const c = tileCenterWorld(startUnit.col, startUnit.row);
        camera.offsetX = cssWidth / 2 - c.x * camera.zoom;
        camera.offsetY = cssHeight / 2 - c.y * camera.zoom;
      } else {
        camera.fitToView(computeWorldBounds(st().map), cssWidth, cssHeight, BASE_SIZE * 2);
      }
      fitted = true;
    }
    const over = st().gameOver;
    if (over && !gameOverShown) {
      gameOverShown = true;
      clearSelection();
      // Analytics: clean win/loss end. Rank the viewer among all players by score.
      const me = session.getViewerId();
      const snap = sessionEndSnapshot();
      trackSessionEnd({
        outcome: over.winnerId === me ? "win" : "loss",
        condition: over.condition,
        turns: st().turn,
        ...snap,
      });
    }
    needsRedraw = true;
    needsHudRender = true;
    bumpMapLayers();
    syncMapWonderAssets();
    const resolving = session.isResolvingTurn?.() ?? false;
    if (wasResolvingTurn && !resolving && !session.isOnline) {
      ui.banner(`${st().players[st().currentPlayerIndex]!.name}, Turn ${st().turn}`);
    }
    wasResolvingTurn = resolving;
  }
  session.onUpdate(update);

  // Boot local world after resize so the camera never fits a 0×0 viewport.
  function bootstrapWorld(): void {
    if (session instanceof LocalSession && session.needsWorldGen()) {
      session.finishWorldGen();
    }
    if (!session.hasState()) return;
    if (setup.isTutorial) {
      try {
        seedTutorialSurroundings(session.getState());
      } catch (err) {
        console.error("tutorial seed failed:", err);
      }
    }
    bumpMapLayers();
    syncMapWonderAssets();
    maybeNotifyWorldGenerated();
  }

  function sessionEndSnapshot(): ReturnType<typeof viewerScoreFromBoard> {
    return viewerScoreFromBoard(buildSessionScoreboard(st(), session.getViewerId()));
  }

  registerSessionSnapshotProvider(() => sessionEndSnapshot());

  // Guests can save locally too (keyed by a device-local guest id); saving is
  // always available offline. Online games still require an account to have
  // reached this point, so their saves are tagged with the account id.
  const canSave = true;

  function cancelAbility(): void {
    pendingAbility = null;
    abilityTargetSet = new Set();
  }
  function cancelExpandPick(): void {
    expandPickCityId = null;
    expandCandidates = new Set();
  }
  function cancelBombard(): void {
    bombardCityId = null;
    bombardTargets = new Set();
  }
  function cancelRoadRoutePick(): void {
    roadRouteFrom = null;
  }
  function selectUnit(id: number): void {
    selectedUnitId = id;
    selectedCityId = null;
    selectedTile = null;
    cityWorkable = new Set();
    cancelAbility();
    cancelExpandPick();
    cancelBombard();
    cancelRoadRoutePick();
    recomputeOverlays();
    needsRedraw = true;
    needsHudRender = true;
  }
  function selectCity(id: number): void {
    selectedCityId = id;
    selectedUnitId = null;
    selectedTile = null;
    reachable = new Set();
    reachableCosts = new Map();
    attackTargets = new Set();
    cancelAbility();
    cancelExpandPick();
    cancelBombard();
    cancelRoadRoutePick();
    const city = st().cities.get(id);
    cityWorkable = city ? new Set(workableTiles(st(), city).map((t) => `${t.col},${t.row}`)) : new Set();
    needsRedraw = true;
    needsHudRender = true;
  }
  function selectTile(col: number, row: number): void {
    selectedTile = { col, row };
    selectedUnitId = null;
    selectedCityId = null;
    reachable = new Set();
    reachableCosts = new Map();
    attackTargets = new Set();
    cancelAbility();
    cancelExpandPick();
    cancelBombard();
    cancelRoadRoutePick();
    cityWorkable = new Set();
    hoverOdds = null;
    needsRedraw = true;
    needsHudRender = true;
  }
  function clearSelection(): void {
    selectedUnitId = null;
    selectedCityId = null;
    selectedTile = null;
    reachable = new Set();
    reachableCosts = new Map();
    attackTargets = new Set();
    cancelAbility();
    cancelExpandPick();
    cancelBombard();
    cancelRoadRoutePick();
    cityWorkable = new Set();
    hoverOdds = null;
    needsRedraw = true;
    needsHudRender = true;
  }

  const ui = createUI({
    onEndTurn: () => {
      if (session.isResolvingTurn?.()) return;
      const wasLocal = !session.isOnline;
      session.endTurn();
      clearSelection();
      if (session.isOnline) ui.banner(`Turn submitted, waiting for opponents…`);
      else if (session.isResolvingTurn?.()) ui.banner("Resolving turn…");
      else if (wasLocal) ui.banner(`${st().players[st().currentPlayerIndex]!.name}, Turn ${st().turn}`);
    },
    onFoundCity: () => {
      if (selectedUnitId == null) return;
      const u = st().units.get(selectedUnitId);
      session.order({ type: "foundCity", unitId: selectedUnitId });
      // Remember the tile so the new city is auto-selected once it appears.
      if (u) pendingFoundAt = { col: u.col, row: u.row };
      clearSelection();
    },
    onPromote: (promotion) => {
      if (selectedUnitId != null) session.order({ type: "promote", unitId: selectedUnitId, promotion });
    },
    onUpgradeUnit: () => {
      if (selectedUnitId != null) session.order({ type: "upgradeUnit", unitId: selectedUnitId });
    },
    onSleep: () => {
      if (selectedUnitId != null) session.order({ type: "sleep", unitId: selectedUnitId });
    },
    onWake: () => {
      if (selectedUnitId != null) session.order({ type: "wake", unitId: selectedUnitId });
    },
    onBoardShip: (shipId) => {
      if (selectedUnitId != null) session.order({ type: "boardShip", unitId: selectedUnitId, shipId });
    },
    onDisembarkFromShip: (passengerId) => {
      session.order({ type: "disembarkFromShip", unitId: passengerId });
    },
    onAbility: (ability) => {
      if (selectedUnitId == null) return;
      const unit = st().units.get(selectedUnitId);
      if (!unit) return;
      if (ACTIVE_ABILITY_DEFS[ability].kind === "targeted") {
        // Enter targeting mode: highlight valid tiles and wait for a tap.
        pendingAbility = ability;
        abilityTargetSet = abilityTargets(st(), unit, ability);
        if (abilityTargetSet.size === 0) {
          cancelAbility();
          ui.banner(`No valid target for ${ACTIVE_ABILITY_DEFS[ability].name}.`);
        } else {
          ui.banner(`Select a target for ${ACTIVE_ABILITY_DEFS[ability].name}.`);
        }
        needsRedraw = true;
      } else {
        session.order({ type: "useAbility", unitId: selectedUnitId, ability });
        cancelAbility();
      }
    },
    onConvertCitizen: (cityId, specialistId, delta) =>
      session.order({ type: "convertCitizen", cityId, specialistId, delta, manual: delta > 0 }),
    onSetCityAutoMode: (cityId, mode) => session.order({ type: "setCityAutoMode", cityId, mode }),
    onPickExpandTile: (cityId) => {
      // Toggle the border-tile picker: highlight every tile the city could claim next,
      // then a tap on one sends the override (handled in handleTap).
      if (expandPickCityId === cityId) {
        cancelExpandPick();
      } else {
        const city = st().cities.get(cityId);
        if (!city) return;
        expandPickCityId = cityId;
        expandCandidates = new Set(expansionCandidates(st(), city).map((t) => `${t.col},${t.row}`));
        if (expandCandidates.size === 0) {
          cancelExpandPick();
          ui.banner("This city has no room left to expand.");
        } else if (!expandHintShown) {
          expandHintShown = true;
          ui.banner("Tap a highlighted tile to set where this city grows next.");
        }
      }
      needsRedraw = true;
    },
    onCityBombard: (cityId) => {
      // Toggle the bombardment aimer: highlight every enemy in range, then a tap on
      // one fires the city's once-a-turn shot (handled in handleTap).
      if (bombardCityId === cityId) {
        cancelBombard();
      } else {
        const city = st().cities.get(cityId);
        if (!city) return;
        if (cityBombardsUsed(city) >= cityBombardAllowance(city)) {
          ui.banner("This city has no bombards left this turn.");
          cancelBombard();
        } else {
          const targets = cityBombardTargets(st(), city);
          bombardCityId = cityId;
          bombardTargets = new Set(targets.map((u) => `${u.col},${u.row}`));
          if (bombardTargets.size === 0) {
            cancelBombard();
            ui.banner("No enemies in range to bombard.");
          } else if (!bombardHintShown) {
            bombardHintShown = true;
            ui.banner("Tap a highlighted enemy to bombard it.");
          }
        }
      }
      needsRedraw = true;
    },
    onStartWork: (kind, col, row) => {
      session.order({ type: "startWork", kind, col, row });
      playBuildingSound();
    },
    onStartRoadRoute: (col, row) => {
      roadRouteFrom = { col, row };
      ui.banner("Tap the destination tile for your road route.");
      needsRedraw = true;
    },
    onStartWonder: (wonderId, col, row) => {
      session.order({ type: "startWonder", wonderId, col, row });
      playBuildingSound();
    },
    onCancelWork: (workId) => session.order({ type: "cancelWork", workId }),
    onRushProduction: (cityId, currency) => session.order({ type: "rushProduction", cityId, currency }),
    onRushWork: (workId, currency) => session.order({ type: "rushWork", workId, currency }),
    onAssignSpecialist: (workId, specialistId, on) =>
      session.order({ type: "assignSpecialist", workId, specialistId, on }),
    onSelectUnit: (id) => {
      const u = st().units.get(id);
      if (u) {
        selectUnit(id);
        centerOn(u.col, u.row);
      }
    },
    onSelectCity: (id) => {
      const c = st().cities.get(id);
      if (c) {
        selectCity(id);
        centerOn(c.col, c.row);
      }
    },
    onDeclareWar: (t) => {
      const check = canDeclareWar(st(), session.getViewerId(), t);
      if (!check.ok) {
        ui.banner(check.reason ?? "Cannot declare war.");
        return;
      }
      session.order({ type: "declareWar", targetId: t });
      needsRedraw = true;
    },
    onMakePeace: (t) => session.order({ type: "makePeace", targetId: t }),
    onDenounce: (t) => session.order({ type: "denounce", targetId: t }),
    onGift: (t, g) => session.order({ type: "giftTo", targetId: t, gold: g }),
    onDemandTribute: (t, g) => session.order({ type: "demandTribute", targetId: t, gold: g }),
    onProposeDeal: (t, give, want) => session.order({ type: "proposeDeal", targetId: t, give, want }),
    onCancelSharedVision: (t) => session.order({ type: "cancelSharedVision", targetId: t }),
    onRespondProposal: (id, accept) => session.order({ type: "respondProposal", proposalId: id, accept }),
    onFinalizeDeal: (id, confirm) => session.order({ type: "finalizeDeal", proposalId: id, confirm }),
    onAcknowledgeContact: (o) => session.order({ type: "acknowledgeContact", otherId: o }),
    onSetProduction: (item) => {
      if (selectedCityId != null) {
        session.order({ type: "setProduction", cityId: selectedCityId, item });
        playBuildingSound();
      }
    },
    onStartTraining: (cityId, unit) => session.order({ type: "startTraining", cityId, unit }),
    onCancelTraining: (cityId, orderId) => session.order({ type: "cancelTraining", cityId, orderId }),
    onRushTraining: (cityId, orderId, currency) => session.order({ type: "rushTraining", cityId, orderId, currency }),
    onSetResearch: (techId) => session.order({ type: "setResearch", techId }),
    onSetResearchTarget: (techId) => session.order({ type: "setResearchTarget", techId }),
    onResearchGovernment: (governmentId) => session.order({ type: "setResearchGovernment", governmentId }),
    onSetGovernment: (governmentId) => session.order({ type: "setGovernment", governmentId }),
    onAdoptCivic: (civicId) => session.order({ type: "adoptCivic", civicId }),
    onSlotCivic: (civicId) => session.order({ type: "slotCivic", civicId }),
    onUnslotCivic: (civicId) => session.order({ type: "unslotCivic", civicId }),
    onFoundReligion: (cityId, name, beliefs) => session.order({ type: "foundReligion", cityId, name, beliefs }),
    onUpgradeReligion: () => session.order({ type: "upgradeReligion" }),
    onPickReligionPerk: (perkId) => session.order({ type: "pickReligionPerk", perkId }),
    onMoveHolyCity: (cityId) => session.order({ type: "moveHolyCity", cityId }),
    onBuyReligiousUnit: (cityId, unit) => session.order({ type: "buyReligiousUnit", cityId, unit }),
    onEvangelize: (unitId, cityId) => session.order({ type: "evangelize", unitId, cityId }),
    onPurgeHeresy: (unitId, cityId) => session.order({ type: "purgeHeresy", unitId, cityId }),
    onBoardTradeRoute: (unitId, routeId) => session.order({ type: "boardTradeRoute", unitId, routeId }),
    onActivateGreatPerson: (greatPersonId) => session.order({ type: "activateGreatPerson", greatPersonId }),
    onRecruitLegend: (legendId) => session.order({ type: "recruitLegend", legendId }),
    onUseLeaderAbility: () => session.order({ type: "useLeaderAbility" }),
    onEstablishTrade: (destCityId) => {
      if (selectedUnitId != null) {
        const unit = st().units.get(selectedUnitId);
        const origin = unit ? cityAt(st(), unit.col, unit.row) : undefined;
        const dest = st().cities.get(destCityId);
        if (origin && dest) {
          const via = tradeRouteViaMessage(st(), origin, dest);
          if (via) ui.banner(`🐪 Caravan will travel via ${via}`);
        }
        session.order({ type: "establishTradeRoute", unitId: selectedUnitId, destCityId });
      }
      clearSelection();
    },
    onCancelTradeRoute: (routeId) => session.order({ type: "cancelTradeRoute", routeId }),
    onAssignTradeEscort: (unitId, routeId) => session.order({ type: "assignTradeEscort", unitId, routeId }),
    onLeaveTradeEscort: (routeId) => session.order({ type: "leaveTradeEscort", routeId }),
    onPlunderTradeRoute: (unitId, routeId) => session.order({ type: "plunderTradeRoute", unitId, routeId }),
    onPillage: (unitId) => session.order({ type: "pillage", unitId }),
    onBribeBarbarian: (unitId) => session.order({ type: "bribeBarbarian", unitId }),
    onRecruitBarbarian: (unitId) => session.order({ type: "recruitBarbarian", unitId }),
    onCloseCity: () => {
      clearSelection();
    },
    onCloseTile: () => {
      clearSelection();
    },
    onSuggestion: () => actOnSuggestion(),
    canSave,
    promptSaveOnLeave: canSave && !session.isOnline,
    onLeaveGame: () => {
      abandonActiveSession(sessionEndSnapshot());
      location.reload();
    },
    onSurrender: session.isOnline
      ? () => {
          session.order({ type: "surrender" });
          abandonActiveSession(sessionEndSnapshot());
          location.reload();
        }
      : undefined,
    onSave: async (name) => {
      const userId = getSaveOwnerId();
      const state = session.getState();
      const serialized = serializeState(state);
      if (session.isOnline) {
        const online = session as import("./session").OnlineSession;
        const blob = await online.requestExport();
        const record = makeSaveRecord("mp", JSON.parse(blob) as ReturnType<typeof serializeState>, {
          name,
          gameId: online.gameId,
          userId,
        });
        await saveGame(record);
      } else {
        const record = makeSaveRecord("sp", serialized, { name, userId });
        await saveGame(record);
      }
    },
    onExportCurrentSave: async () => {
      const userId = getSaveOwnerId();
      const state = session.getState();
      let serialized: ReturnType<typeof serializeState>;
      if (session.isOnline) {
        const online = session as import("./session").OnlineSession;
        const blob = await online.requestExport();
        serialized = JSON.parse(blob) as ReturnType<typeof serializeState>;
      } else {
        serialized = serializeState(state);
      }
      const record = makeSaveRecord(session.isOnline ? "mp" : "sp", serialized, {
        gameId: session.isOnline ? (session as import("./session").OnlineSession).gameId : undefined,
        userId,
      });
      return exportSave(record);
    },
    onReportBug: async (message) => {
      const state = session.getState();
      // Capture the fullest snapshot we can: the same serialized state used for
      // saves (host export for MP), plus the current turn/mode/civ. Best-effort —
      // a capture failure must not block the report.
      let stateJson: string | undefined;
      try {
        if (session.isOnline) {
          const online = session as import("./session").OnlineSession;
          stateJson = await online.requestExport();
        } else {
          stateJson = JSON.stringify(serializeState(state));
        }
      } catch {
        stateJson = undefined;
      }
      const me = session.getViewerId();
      const civId = state.players.find((p) => p.id === me)?.civId;
      return trackBugReport({
        message,
        mode: session.isOnline ? "mp" : "sp",
        turn: state.turn,
        civId,
        state: stateJson,
      });
    },
    onMenuOpen: () => {
      if (!session.isOnline) return;
      const me = session.getViewerId();
      if (me !== 0) return;
      const online = session as import("./session").OnlineSession;
      const gameId = online.gameId;
      const userId = getAccount()?.userId;
      if (!userId) {
        ui.setMpSaves([]);
        return;
      }
      // Refresh MP saves matching this game and account.
      listSavesForUser(userId)
        .then((saves) => {
          mpSaves = gameId ? saves.filter((s) => s.mode === "mp" && s.gameId === gameId) : [];
          ui.setMpSaves(mpSaves);
        })
        .catch(() => ui.setMpSaves([]));
    },
    onLoadMpSave: async (blob) => {
      const online = session as import("./session").OnlineSession;
      await online.loadGame(blob);
    },
    onCheat: (action) => {
      const res = session.cheat?.(action);
      if (res && !res.ok) ui.banner(res.error ?? "Cheat failed");
    },
    onToggleLiftFog: (enabled) => {
      liftFog = enabled;
      bumpMapLayers();
      needsRedraw = true;
    },
    onGameOverExploreMap: () => {
      gameOverExploreMap = true;
      liftFog = true;
      bumpMapLayers();
      camera.fitToView(computeWorldBounds(st().map), cssWidth, cssHeight, BASE_SIZE * 2);
      needsRedraw = true;
    },
    onGameOverBackToSummary: () => {
      gameOverExploreMap = false;
      needsRedraw = true;
    },
    onGameOverQuit: () => {
      abandonActiveSession(sessionEndSnapshot());
      location.reload();
    },
    onSetUpkeepModifier: (pct) => session.order({ type: "setUpkeepModifier", pct }),
    onTurnUpdateLocate: (tile) => {
      centerOn(tile.col, tile.row);
      needsRedraw = true;
    },
    onTurnUpdateOpenProduction: (cityId) => {
      const c = st().cities.get(cityId);
      if (c) {
        selectCity(cityId);
        centerOn(c.col, c.row);
      }
      ui.openProductionForCity(cityId);
    },
    onTurnUpdateOpenResearch: () => {
      ui.openResearch();
    },
    onTurnUpdateOpenCivics: () => {
      ui.openCivics();
    },
    onTurnUpdateOpenGreatPeople: () => {
      ui.openGreatPeople();
    },
    onTurnUpdateOpenLegends: () => {
      ui.openLegends();
    },
    onTurnUpdateOpenGold: () => {
      // The gold dialog is driven by a state flag inside ui.ts; simulate a click.
      const goldBtn = document.getElementById("gold-btn");
      goldBtn?.click();
    },
    onTurnUpdateDismiss: () => {
      // No-op: dialog state is managed inside ui.ts.
    },
  });

  const unmountGameChat = session.isOnline
    ? mountGameChat(session as import("./session").OnlineSession, getAccount()?.userId)
    : null;

  let tutorialCoach: { tick(): void } | null = null;
  let tutorialCoachLoading = false;
  function ensureTutorialCoach(): void {
    if (!setup.isTutorial || tutorialCoach || tutorialCoachLoading || !session.hasState()) return;
    tutorialCoachLoading = true;
    void import("./tutorial-coach").then(({ createTutorialCoach }) => {
      if (tutorialCoach) return;
      tutorialCoach = createTutorialCoach({
        getState: st,
        getViewerId: () => session.getViewerId(),
        getSelectedUnitId: () => selectedUnitId,
        getSelectedCityId: () => selectedCityId,
        tileToScreen: (col, row) => {
          const c = tileCenterWorld(col, row);
          return { x: camera.worldToScreenX(c.x), y: camera.worldToScreenY(c.y) };
        },
        banner: (text) => ui.banner(text),
        isWorldReady: () => loadingDismissed,
        exitToMenu: () => {
          abandonActiveSession(sessionEndSnapshot());
          location.reload();
        },
        ensureTutorialVillage: () => {
          if (spawnTutorialVillage(st())) update();
        },
        ensureReachableTutorialVillage: () => {
          if (ensureReachableTutorialVillage(st())) update();
        },
        ensureTutorialBarbarian: () => {
          if (spawnTutorialBarbarian(st())) update();
        },
        refreshTutorialMovement: (stepId) => {
          refreshTutorialMovement(st(), session.getViewerId(), stepId);
          update();
        },
        onTutorialEnd: (outcome) => trackTutorialEnd(outcome),
        onTutorialStep: (stepId, turn) => noteTutorialStep(stepId, turn),
      });
    });
  }

  type Suggestion = { kind: "units" | "research" | "civic" | "religion" | "production"; label: string } | null;
  function computeSuggestion(): Suggestion {
    const me = session.getViewerId();
    const idle = unitsOf(st(), me).filter((u) => u.movementLeft > 0 && !u.sleeping && !u.hidden);
    if (idle.length > 0) return { kind: "units", label: `⮕ Next Unit (${idle.length})` };
    const player = st().players.find((p) => p.id === me);
    if (player && player.researching == null && availableTechs(player).length > 0) {
      return { kind: "research", label: "🔬 Choose Research" };
    }
    if (player && player.researchingGovernment == null && researchableGovernmentsFor(player).length > 0) {
      return { kind: "civic", label: "🏛️ Choose Government" };
    }
    if (canFoundReligion(st(), me)) {
      return { kind: "religion", label: "☮️ Found Religion" };
    }
    const noProd = citiesOf(st(), me).filter((c) => c.production == null);
    if (noProd.length > 0) return { kind: "production", label: `⚒️ Set Production (${noProd.length})` };
    return null;
  }
  function renderGameHud(): void {
    if (!session.hasState()) return;
    const me = session.getViewerId();
    const selCity = selectedCityId != null ? st().cities.get(selectedCityId) ?? null : null;
    ui.render({
      state: st(),
      selectedUnit: selectedUnitId != null ? st().units.get(selectedUnitId) ?? null : null,
      selectedCity: selCity,
      selectedTile:
        selectedTile && isExplored(selectedTile.col, selectedTile.row)
          ? getTile(st().map, selectedTile.col, selectedTile.row) ?? null
          : null,
      viewerId: me,
      odds: hoverOdds,
      suggestion: computeSuggestion(),
      mpSaves,
      cheatsEnabled: !session.isOnline && isLocalhost,
      isMultiplayer: session.isOnline,
      liftFog,
      gameOverExploreMap,
      resolvingTurn: session.isResolvingTurn?.() ?? false,
    });
  }
  function centerOn(col: number, row: number): void {
    const c = tileCenterWorld(col, row);
    camera.offsetX = cssWidth / 2 - c.x * camera.zoom;
    camera.offsetY = cssHeight / 2 - c.y * camera.zoom;
  }
  function actOnSuggestion(): void {
    const s = computeSuggestion();
    if (!s) return session.endTurn();
    const me = session.getViewerId();
    if (s.kind === "units") {
      const idle = unitsOf(st(), me).filter((u) => u.movementLeft > 0 && !u.sleeping && !u.hidden).sort((a, b) => a.id - b.id);
      if (idle.length === 0) return;
      const u = idle[idleCycle++ % idle.length]!;
      selectUnit(u.id);
      centerOn(u.col, u.row);
    } else if (s.kind === "research") {
      ui.openResearch();
    } else if (s.kind === "civic") {
      ui.openCivics();
    } else if (s.kind === "religion") {
      ui.openReligion();
    } else {
      const city = citiesOf(st(), me).find((c) => c.production == null);
      if (city) {
        selectCity(city.id);
        centerOn(city.col, city.row);
      }
    }
    needsRedraw = true;
  }

  function handleTap(sx: number, sy: number): void {
    const me = session.getViewerId();
    let off = screenToTile(camera, st().map, sx, sy);
    const pickedUnit = pickUnitAtScreen(st(), camera, sx, sy, visible, me);
    if (pickedUnit) {
      off = { col: pickedUnit.col, row: pickedUnit.row };
    }
    if (!off) return clearSelection();
    const key = `${off.col},${off.row}`;

    // Targeted-ability mode: a tap on a highlighted tile fires the ability.
    if (pendingAbility != null && selectedUnitId != null) {
      if (abilityTargetSet.has(key)) {
        if (isCombatTargetedAbility(pendingAbility)) {
          markPlayerCombatSound(st().units.get(selectedUnitId!)?.type);
        }
        session.order({ type: "useAbility", unitId: selectedUnitId, ability: pendingAbility, col: off.col, row: off.row });
        cancelAbility();
        return;
      }
      cancelAbility(); // tapping elsewhere cancels targeting
    }
    // Road-route picker: second tap sets the destination and queues the route.
    if (roadRouteFrom != null) {
      const from = roadRouteFrom;
      cancelRoadRoutePick();
      const path = computeRoadPath(st(), me, from.col, from.row, off.col, off.row);
      const can = canStartRoadRoute(st(), me, from.col, from.row, off.col, off.row);
      if (!can.ok) {
        ui.banner(can.error ?? "Cannot pave a route here.");
      } else {
        const specialists = freeSurveySpecialistIds(st(), me);
        const tiles = tilesNeedingRoad(st(), me, path);
        session.order({
          type: "startRoadRoute",
          fromCol: from.col,
          fromRow: from.row,
          toCol: off.col,
          toRow: off.row,
          specialistIds: specialists,
        });
        playBuildingSound();
        ui.banner(
          `${specialists.length} surveyor${specialists.length === 1 ? "" : "s"} paving ${tiles.length} tile${tiles.length === 1 ? "" : "s"}…`,
        );
      }
      needsRedraw = true;
      return;
    }
    // Border-tile picker: a tap on a highlighted candidate sets it as the city's
    // next claim; a tap anywhere else just cancels the picker.
    if (expandPickCityId != null) {
      const cityId = expandPickCityId;
      const isCandidate = expandCandidates.has(key);
      cancelExpandPick();
      if (isCandidate) {
        session.order({ type: "setExpandTarget", cityId, target: { col: off.col, row: off.row } });
      }
      needsRedraw = true;
      return;
    }

    // Bombardment aimer: a tap on a highlighted enemy fires the city's shot; a tap
    // anywhere else just cancels aiming.
    if (bombardCityId != null) {
      const cityId = bombardCityId;
      const isTarget = bombardTargets.has(key);
      cancelBombard();
      if (isTarget) {
        markPlayerCombatSound(undefined, { bombard: true });
        session.order({ type: "cityBombard", cityId, col: off.col, row: off.row });
      }
      needsRedraw = true;
      return;
    }

    const u = pickedUnit ?? unitAt(st(), off.col, off.row);
    const c = cityAt(st(), off.col, off.row);

    // Citizen assignment: with a city selected, tapping a workable tile toggles it.
    if (selectedCityId != null && cityWorkable.has(key)) {
      session.order({ type: "assignCitizen", cityId: selectedCityId, col: off.col, row: off.row });
      return;
    }

    const attack = () => {
      const attackerId = selectedUnitId!;
      const doAttack = () => {
        markPlayerCombatSound(st().units.get(attackerId)?.type);
        session.order({ type: "attack", attackerId, col: off.col, row: off.row });
      };
      if (getSettings().autoAttack) {
        doAttack();
        return;
      }
      const attacker = st().units.get(attackerId);
      const detail = attacker ? combatPreviewDetail(st(), attacker, off.col, off.row) : null;
      // No estimate available means the tap was already vetted as a legal target, so attack anyway.
      if (!detail) {
        doAttack();
        return;
      }
      showCombatPreviewDialog(detail, doAttack);
    };
    const move = () => session.order({ type: "move", unitId: selectedUnitId!, col: off.col, row: off.row });
    const targetOwner = u && u.ownerId !== me ? u.ownerId : c && c.ownerId !== me ? c.ownerId : null;
    const warnAttack = (owner: number) => {
      const check = canDeclareWar(st(), me, owner);
      if (!check.ok) {
        ui.banner(check.reason ?? "Cannot declare war right now.");
        return;
      }
      confirmAction(`Attacking ${civNameOf(owner)} will start a war with them and cancel any deals you have. Continue?`, () => {
        session.order({ type: "declareWar", targetId: owner });
        attack();
      });
    };

    if (u) {
      // When one of our units is selected, tapping an enemy unit on an attack tile
      // issues an attack; otherwise tapping any unit selects it.
      if (u.ownerId !== me && selectedUnitId != null && attackTargets.has(key)) {
        attack();
      } else if (u.ownerId !== me && selectedUnitId != null && peaceAttack.has(key)) {
        warnAttack(u.ownerId);
      } else if (u.ownerId === me && selectedUnitId === u.id && c && c.ownerId === me) {
        selectCity(c.id);
      } else {
        selectUnit(u.id);
      }
    } else if (selectedUnitId != null && attackTargets.has(key)) {
      attack();
    } else if (selectedUnitId != null && peaceAttack.has(key) && targetOwner != null) {
      warnAttack(targetOwner);
    } else if (selectedUnitId != null && reachable.has(key)) {
      move();
    } else if (selectedUnitId != null && incursion.has(key)) {
      const owner = incursion.get(key)!;
      confirmAction(`Entering ${civNameOf(owner)}'s territory without open borders will start a war with them. Continue?`, () => {
        session.order({ type: "declareWar", targetId: owner });
        move();
      });
    } else if (c && c.ownerId === me) {
      selectCity(c.id);
    } else if (isExplored(off.col, off.row)) {
      // Nothing actionable here — inspect the tile instead of just deselecting.
      selectTile(off.col, off.row);
    } else {
      clearSelection();
    }
  }

  function isExplored(col: number, row: number): boolean {
    const me = session.getViewerId();
    return session.getExplored().has(`${col},${row}`);
  }

  /** Limited tile info for the cursor-following hover tooltip. */
  function tipFor(col: number, row: number): TileTip | null {
    if (!isExplored(col, row)) return { name: "Unexplored", rough: null };
    const tile = getTile(st().map, col, row);
    if (!tile) return null;
    let name = tile.wooded && tile.terrain === "hills" ? "Wooded Hills" : TERRAIN_NAMES[tile.terrain];
    if (tile.feature === "village") name = "Village";
    else if (tile.feature === "barb_camp") name = "Barbarian Camp";
    else if (tile.feature === "ruin") name = "Ruins";
    const key = `${col},${row}`;
    const moveCost = selectedUnitId != null && reachable.has(key) ? reachableCosts.get(key) : undefined;
    return { name, rough: isRough(tile.terrain), moveCost };
  }

  function onHover(sx: number, sy: number): void {
    const me = session.getViewerId();
    const pickedUnit = pickUnitAtScreen(st(), camera, sx, sy, visible, me);
    let off = screenToTile(camera, st().map, sx, sy);
    if (pickedUnit) off = { col: pickedUnit.col, row: pickedUnit.row };
    ui.setTileTip(off ? tipFor(off.col, off.row) : null);

    let next: CombatOdds | null = null;
    if (selectedUnitId != null && off && attackTargets.has(`${off.col},${off.row}`)) {
      const u = st().units.get(selectedUnitId);
      const prev = u ? combatPreview(st(), u, off.col, off.row) : null;
      if (prev) {
        const city = cityAt(st(), off.col, off.row);
        const enemy = pickedUnit ?? unitAt(st(), off.col, off.row);
        next = {
          targetName: city ? city.name : enemy ? (uniqueUnitForCiv(st().players.find((p) => p.id === enemy.ownerId)?.civId, enemy.type)?.name ?? UNIT_DEFS[enemy.type].name) : "target",
          toDefender: prev.toDefender,
          toAttacker: prev.toAttacker,
          vsCity: prev.vsCity,
        };
      }
    }
    if (next?.targetName !== hoverOdds?.targetName || next?.toDefender !== hoverOdds?.toDefender) {
      hoverOdds = next;
      needsRedraw = true;
      needsHudRender = true;
    }
  }

  attachInput(canvas, camera, {
    onChange: () => (needsRedraw = true),
    onHover,
    onHoverEnd: () => {
      ui.setTileTip(null);
      if (hoverOdds) {
        hoverOdds = null;
        needsRedraw = true;
        needsHudRender = true;
      }
    },
    onTap: handleTap,
  });

  function viewportSize(): { width: number; height: number } {
    return getCanvasViewportSize();
  }

  function resize(): void {
    const prevW = cssWidth;
    const prevH = cssHeight;
    const prevDpr = dpr;
    const nextDpr = Math.min(window.devicePixelRatio || 1, 2);
    // visualViewport is the source of truth for what's actually visible on
    // mobile. The 100dvh CSS box can lag the real viewport as the browser
    // toolbar shows/hides, leaving the canvas shorter than the screen and a
    // black strip (body bg) at the bottom. Measure the visible viewport and
    // pin the element's height to it so the two can never disagree.
    const { width, height } = viewportSize();
    cssWidth = width;
    cssHeight = height;
    dpr = nextDpr;
    canvas.style.width = cssWidth + "px";
    canvas.style.height = cssHeight + "px";
    const pxW = Math.round(cssWidth * dpr);
    const pxH = Math.round(cssHeight * dpr);
    // Assigning canvas.width/height clears the bitmap even when the value is
    // unchanged — visualViewport fires on every mobile tap as the URL bar
    // slides, so skip redundant writes to avoid a ~100ms black flash.
    if (canvas.width !== pxW || canvas.height !== pxH) {
      canvas.width = pxW;
      canvas.height = pxH;
      fitted = false;
      needsRedraw = true;
    } else if (cssWidth !== prevW || cssHeight !== prevH || dpr !== prevDpr) {
      needsRedraw = true;
    }
  }

  function scheduleResize(): void {
    resize();
    requestAnimationFrame(resize);
    window.setTimeout(resize, 150);
  }

  window.addEventListener("resize", scheduleResize);
  window.addEventListener("orientationchange", scheduleResize);
  screen.orientation?.addEventListener?.("change", scheduleResize);
  window.visualViewport?.addEventListener("resize", scheduleResize);

  const mapAtlasRepaint = (): void => {
    bumpMapLayers();
    needsRedraw = true;
  };

  preloadDeferredGameAssets();

  const terrainAtlas = loadTerrainAtlas(mapAtlasRepaint);
  const coastAtlas = loadCoastAtlas(mapAtlasRepaint);
  const mapEdgeAtlas = loadMapEdgeAtlas(mapAtlasRepaint);
  const riverAtlas = loadRiverAtlas(mapAtlasRepaint);
  const roadAtlas = loadRoadAtlas(mapAtlasRepaint);
  const unitAtlas = loadUnitAtlas(() => {
    needsRedraw = true;
  });
  const cityAtlas = loadCityAtlas(() => {
    needsRedraw = true;
  });
  const improvementAtlas = loadImprovementAtlas(mapAtlasRepaint);
  const constructionAtlas = loadConstructionAtlas(() => {
    needsRedraw = true;
  });
  const featureAtlas = loadFeatureAtlas(() => {
    needsRedraw = true;
  });
  const naturalWonderAtlas = getNaturalWonderAtlas();
  const wonderAtlas = getWonderAtlas();
  const resourceAtlas = loadResourceAtlas(mapAtlasRepaint);
  const abilityAtlas = loadAbilityAtlas(() => {
    needsRedraw = true;
  });
  const religionIconAtlas = loadReligionIconAtlas(() => {
    needsRedraw = true;
  });
  ui.setAbilityAtlas(abilityAtlas);

  function syncMapWonderAssets(): void {
    if (!session.hasState()) return;
    const state = st();
    ensureNaturalWonderTiles(naturalWonderAtlas, naturalWonderIdsOnMap(state), mapAtlasRepaint);
    ensureWonderTiles(wonderAtlas, wonderIdsOnMap(state), mapAtlasRepaint);
  }

  function primeGameHud(): boolean {
    if (hudPrimed || !session.hasState()) return hudPrimed;
    try {
      renderGameHud();
      hudPrimed = true;
    } catch (err) {
      console.error("HUD prime failed:", err);
    }
    return hudPrimed;
  }
  function isHudDomReady(): boolean {
    const hud = document.getElementById("game-hud");
    const endturn = document.getElementById("endturn");
    const topbar = document.getElementById("topbar");
    const menuBtn = document.getElementById("menu-btn");
    return !!hud && !!endturn && !!topbar && !!menuBtn;
  }
  function armHudForInput(): void {
    document.body.classList.remove("roc-loading-block-input");
    renderGameHud();
  }
  function scheduleHudInteractiveNotify(): void {
    if (hudInteractiveNotified || hudInteractivePending || !session.hasState()) return;
    if (!mapFramePainted || !hudPrimed || cssWidth <= 0 || cssHeight <= 0) return;
    hudInteractivePending = true;
    requestAnimationFrame(() => {
      armHudForInput();
      requestAnimationFrame(() => {
        renderGameHud();
        requestAnimationFrame(() => {
          renderGameHud();
          requestAnimationFrame(() => {
            hudInteractivePending = false;
            if (hudInteractiveNotified || !session.hasState() || !hudPrimed || !isHudDomReady()) {
              if (!hudInteractiveNotified && hudPrimed && mapFramePainted) scheduleHudInteractiveNotify();
              return;
            }
            hudInteractiveNotified = true;
            loadingScreen.notifyHudInteractive();
          });
        });
      });
    });
  }
  function maybeNotifyMapBackdrop(): void {
    if (
      mapBackdropNotified ||
      !session.hasState() ||
      !mapFramePainted ||
      cssWidth <= 0 ||
      cssHeight <= 0
    ) {
      return;
    }
    mapBackdropNotified = true;
    loadingScreen.notifyMapRendered();
    scheduleHudInteractiveNotify();
  }
  // Safety backstop if the first paint or HUD prime stalls (atlases keep loading in the background).
  window.setTimeout(() => {
    if (hudInteractiveNotified) return;
    mapFramePainted = true;
    primeGameHud();
    needsRedraw = true;
    maybeNotifyMapBackdrop();
    scheduleHudInteractiveNotify();
  }, 3000);

  function fitCameraToStart(): void {
    if (fitted || !session.hasState() || cssWidth <= 0 || cssHeight <= 0) return;
    const me = session.getViewerId();
    const myUnits = unitsOf(st(), me);
    const startUnit = myUnits.find((u) => u.type === "settler") ?? myUnits[0];
    if (startUnit) {
      camera.zoom = 2.2;
      const c = tileCenterWorld(startUnit.col, startUnit.row);
      camera.offsetX = cssWidth / 2 - c.x * camera.zoom;
      camera.offsetY = cssHeight / 2 - c.y * camera.zoom;
    } else {
      camera.fitToView(computeWorldBounds(st().map), cssWidth, cssHeight, BASE_SIZE * 2);
    }
    fitted = true;
  }

  function frame(): void {
    if (session.hasState() && !mapFramePainted) {
      needsRedraw = true;
    } else if (
      !loadingDismissed &&
      !hudInteractiveNotified &&
      session.hasState() &&
      performance.now() >= loadingRepaintAt
    ) {
      loadingRepaintAt = performance.now() + 250;
      needsRedraw = true;
    }
    if (needsRedraw && session.hasState()) {
      needsRedraw = false;
      fitCameraToStart();
      const me = session.getViewerId();
      visible = session.getVisible();
      // God Mode "Lift Fog": reveal the entire map (local single-player only —
      // the online session is server-filtered and never holds hidden state).
      const allKeys = liftFog ? allTileKeys(st()) : null;
      const explored = allKeys ?? session.getExplored();
      const drawVisible = allKeys ?? visible;
      try {
      drawScene(ctx!, st(), camera, {
        dpr,
        cssWidth,
        cssHeight,
        fog: liftFog ? undefined : { visible: drawVisible, explored },
        terrainAtlas,
        coastAtlas,
        mapEdgeAtlas,
        riverAtlas,
        roadAtlas,
        improvementAtlas,
        resourceAtlas,
        naturalWonderAtlas,
        wonderAtlas,
        mapLayerCache,
        terrainRev,
        fogRev,
      });
      if (!mapFramePainted) {
        mapFramePainted = true;
      }
      } catch (err) {
        console.error("drawScene failed:", err);
        fitted = false;
      }
      const selCity = selectedCityId != null ? st().cities.get(selectedCityId) ?? null : null;
      drawOverlay(ctx!, camera, st(), {
        viewingPlayerId: me,
        visible: drawVisible,
        explored,
        selectedUnitId,
        selectedCityId,
        alwaysShowLabels: getSettings().mapLabels === "always",
        unitOutlines: getSettings().unitOutlines,
        reachable,
        attackTargets,
        abilityTargets: abilityTargetSet,
        bombardTargets,
        cityWorkable,
        cityWorked: selCity ? new Set(selCity.workedTiles) : new Set(),
        expandCandidates,
        roadRouteFrom,
        // Flag where the selected city grows next: the player's chosen tile if any,
        // otherwise the default nearest tile — so a target is always shown.
        expandMarker: selCity ? selCity.expandTarget ?? nextExpansionTile(st(), selCity, expansionScorer(st(), selCity)) : null,
        tradeRoutes: st().tradeRoutes.filter((r) => r.ownerId === me || r.escortUnitId !== undefined),
        works: st()
          .works.filter((w) => w.target && drawVisible.has(`${w.target.col},${w.target.row}`))
          .map((w) => ({ col: w.target!.col, row: w.target!.row, kind: w.kind })),
        unitAtlas,
        cityAtlas,
        featureAtlas,
        constructionAtlas,
        religionIconAtlas,
      }, cssWidth, cssHeight);
      if (loadingDismissed && needsHudRender) {
        needsHudRender = false;
        try {
          renderGameHud();
        } catch (err) {
          console.error("RENDER-THREW", (err as Error)?.stack || err);
        }
      } else if (cssWidth > 0 && cssHeight > 0) {
        if (primeGameHud() && mapFramePainted) {
          maybeNotifyMapBackdrop();
          scheduleHudInteractiveNotify();
        }
      }
    }
    // Tick the coach EVERY frame, not only on redraws: tapping an info-only bubble
    // (the intro, the unit-kinds briefing) sets an acknowledge flag but does not
    // trigger a canvas redraw, so a redraw-gated tick would leave the coach — and
    // its interaction gate — stuck on that step until some unrelated repaint.
    if (session.hasState()) tutorialCoach?.tick();
    requestAnimationFrame(frame);
  }

  resize();
  bootstrapWorld();
  update();
  requestAnimationFrame(frame);

  if (import.meta.env.DEV) {
    (window as unknown as { __roc: unknown }).__roc = {
      get session() {
        return session;
      },
      get state() {
        return session.hasState() ? st() : null;
      },
      tapTile(col: number, row: number) {
        const c = tileCenterWorld(col, row);
        handleTap(camera.worldToScreenX(c.x), camera.worldToScreenY(c.y));
      },
      hoverTile(col: number, row: number) {
        const c = tileCenterWorld(col, row);
        onHover(camera.worldToScreenX(c.x), camera.worldToScreenY(c.y));
      },
    };
  }
}

// Register the PWA service worker in production builds.
if ("serviceWorker" in navigator && !import.meta.env.DEV) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`)
      .catch((err) => console.error("Service worker registration failed:", err));
  });
}
