import { renderTechTreeInto } from "./techtree";
import { createWiki } from "./wiki";
import { createEmpire, type Tab as EmpireTab } from "./empire";
import { createDiplomacy } from "./diplomacy";
import type { DealItem } from "@roc/sim";
import type { SaveRecord } from "./save-db";
import type { CheatAction } from "./god-mode";
import { getSettings, updateSettings, type TurnUpdateView } from "./settings";
import { selectTurnUpdates } from "./turn-update-batch";
import {
  availableCivics,
  availableGovernments,
  availableProduction,
  availablePromotions,
  availableTechs,
  unlockedPolicies,
  getCivic,
  getGovernment,
  getPolicy,
  BELIEFS,
  getBelief,
  religionById,
  cityFollowerCount,
  canFoundReligion,
  religionUnlocked,
  civicsUnlocked,
  availableReligionNames,
  CIVICS_REQUIRED_TECH,
  RELIGION_REQUIRED_TECH,
  FAITH_TO_FOUND,
  cityAt,
  tradeRouteDestinations,
  tradeRouteYield,
  tradeRoutesFrom,
  SPECIALIST_DEFS,
  availableSpecialists,
  workerSlots,
  nextTierAt,
  workName,
  canStartWork,
  worksOfCity,
  citiesOf,
  unitsOf,
  cityDefenseStrength,
  cityMaxHp,
  foodToGrow,
  unitMaxHp,
  unitUpkeep,
  getCiv,
  getCityYields,
  territorySize,
  BUILDING_DEFS,
  IMPROVEMENT_DEFS,
  PROMOTION_DEFS,
  TECH_DEFS,
  UNIT_DEFS,
  buildingInfo,
  techUnlocks,
  unitInfo,
  tileYields,
  resourceYields,
  resourceActive,
  RESOURCE_DEFS,
  addYields,
  ACTIVE_ABILITY_DEFS,
  canUseAbility,
  unitAbilities,
  moveCost,
  isRough,
  isWaterTerrain,
  isPassableLand,
  terrainDefense,
  TERRAIN_NAMES,
  barbarianBribeCost,
  barbarianRecruitCost,
  isBarbarianPacified,
  isLogEntryVisible,
  canParleyWith,
  BRIBE_TURNS,
  BARBARIAN_DIPLOMACY_TECH,
  type City,
  type GameState,
  type ImprovementKind,
  type LogEntry,
  type ProductionItem,
  type FeatureRewardType,
  type ActiveAbilityId,
  type PromotionId,
  type TechId,
  type Unit,
  type UnitTypeId,
  type TurnUpdateEvent,
} from "@roc/sim";
import type { Tile } from "@roc/shared";
import { abilityIconHtml, type AbilityAtlas } from "./ability-assets";

export interface CombatOdds {
  targetName: string;
  toDefender: number;
  toAttacker: number;
  vsCity: boolean;
}

export interface Suggestion {
  kind: "units" | "research" | "civic" | "religion" | "production";
  label: string;
}

/** Limited info shown in the cursor-following hover tooltip. */
export interface TileTip {
  name: string;
  /** true = rough, false = open, null = unknown/unexplored (chip hidden). */
  rough: boolean | null;
}

type TileLine = { kind: "good" | "bad" | "neutral"; text: string };
interface TileReport {
  name: string;
  subtitle: string;
  yields: ReturnType<typeof tileYields>;
  lines: TileLine[];
}

/** Build the human-readable benefits/deficits breakdown for a tile. */
function tileReport(state: GameState, tile: Tile): TileReport {
  const t = tile.terrain;
  const y = addYields(tileYields(tile), resourceYields(tile));
  const water = isWaterTerrain(t);
  const passable = isPassableLand(t);
  const rough = isRough(t);
  const def = terrainDefense(t);

  let name = TERRAIN_NAMES[t];
  if (tile.feature === "village") name = `${TERRAIN_NAMES[t]} · Village`;
  else if (tile.feature === "barb_camp") name = `${TERRAIN_NAMES[t]} · Barbarian Camp`;

  let subtitle: string;
  if (water) subtitle = "Water · naval units only";
  else if (!passable) subtitle = "Impassable to land units";
  else if (tile.road) subtitle = "Open · road (fast movement)";
  else if (rough) subtitle = `Rough · ${moveCost(t)} moves to enter`;
  else subtitle = "Open · 1 move to enter";

  const lines: TileLine[] = [];
  if (y.food) lines.push({ kind: "good", text: `+${y.food} food${y.food >= 2 ? " — quick city growth" : ""}` });
  if (y.production) lines.push({ kind: "good", text: `+${y.production} production` });
  if (y.gold) lines.push({ kind: "good", text: `+${y.gold} gold` });
  if (y.science) lines.push({ kind: "good", text: `+${y.science} science` });
  if (def > 0) lines.push({ kind: "good", text: `+${def} combat defense for units standing here` });
  if (tile.improvement) {
    const imp = IMPROVEMENT_DEFS[tile.improvement as ImprovementKind]?.name ?? tile.improvement;
    lines.push({ kind: "good", text: `${imp} improvement boosts its yields` });
  }
  if (tile.road) lines.push({ kind: "good", text: "Road speeds movement through this tile" });
  if (tile.resource) {
    const rdef = RESOURCE_DEFS[tile.resource as keyof typeof RESOURCE_DEFS];
    const rname = rdef?.name ?? tile.resource;
    lines.push({ kind: "good", text: `Resource: ${rname}` });
    if (!resourceActive(tile)) {
      const needed = rdef?.improvement ?? "improvement";
      lines.push({ kind: "bad", text: `Needs a ${needed} to activate` });
    }
  }
  if (tile.feature === "village") lines.push({ kind: "good", text: "Village — a reward when one of your units enters" });

  if (!y.food && !water) lines.push({ kind: "bad", text: "No food — cannot feed a growing city" });
  if (rough) lines.push({ kind: "bad", text: "Rough ground — slow for units to cross" });
  if (!passable && !water) lines.push({ kind: "bad", text: "Land units cannot enter" });
  if (water) lines.push({ kind: "bad", text: "Needs a naval unit to cross" });
  else if (def === 0 && passable) lines.push({ kind: "neutral", text: "No defensive cover for units" });
  if (tile.feature === "barb_camp") lines.push({ kind: "bad", text: "Barbarian camp — clear it for a reward" });

  if (tile.ownerCityId != null) {
    const city = state.cities.get(tile.ownerCityId);
    if (city) lines.push({ kind: "neutral", text: `Within ${city.name}'s territory` });
  } else if (passable && !water) {
    lines.push({ kind: "neutral", text: "Unclaimed — found or expand a city to work it" });
  }

  return { name, subtitle, yields: y, lines };
}

export interface UIView {
  state: GameState;
  selectedUnit: Unit | null;
  selectedCity: City | null;
  /** Inspected tile, shown when no unit/city is selected. */
  selectedTile?: Tile | null;
  /** The player this client is rendering for. */
  viewerId: number;
  /** Combat odds for the attack target currently hovered (if any). */
  odds?: CombatOdds | null;
  /** Next suggested action (drives the smart action button). */
  suggestion?: Suggestion | null;
  /** Multiplayer saves available to the host for loading. */
  mpSaves?: SaveRecord[];
  /** True when the local session supports God Mode cheats. */
  cheatsEnabled?: boolean;
}

export interface UIHandlers {
  onEndTurn(): void;
  onFoundCity(): void;
  onPromote(promotion: PromotionId): void;
  /** Invoke an active ability. The controller decides whether it needs a target. */
  onAbility(ability: ActiveAbilityId): void;
  onSleep(): void;
  onWake(): void;
  onConvertCitizen(cityId: number, specialistId: string, delta: number): void;
  onStartWork(kind: string, col: number, row: number): void;
  onStartWonder(wonderId: string, hostCityId: number): void;
  onCancelWork(workId: number): void;
  onSelectUnit(unitId: number): void;
  onSelectCity(cityId: number): void;
  onDeclareWar(targetId: number): void;
  onMakePeace(targetId: number): void;
  onDenounce(targetId: number): void;
  onGift(targetId: number, gold: number): void;
  onDemandTribute(targetId: number, gold: number): void;
  onProposeDeal(targetId: number, give: DealItem[], want: DealItem[]): void;
  onRespondProposal(proposalId: number, accept: boolean): void;
  onAcknowledgeContact(otherId: number): void;
  onSetProduction(item: ProductionItem): void;
  onSetResearch(techId: TechId): void;
  onSetResearchTarget(techId: TechId): void;
  onSetCivic(civicId: string): void;
  onSetGovernment(governmentId: string): void;
  onTogglePolicy(policyId: string): void;
  onFoundReligion(cityId: number, name: string, beliefs: string[]): void;
  onEstablishTrade(destCityId: number): void;
  onBribeBarbarian(unitId: number): void;
  onRecruitBarbarian(unitId: number): void;
  onCloseCity(): void;
  onCloseTile(): void;
  onSuggestion(): void;
  onSave(name: string): Promise<void>;
  onExportCurrentSave(): Promise<string>;
  onMenuOpen(): void;
  onLoadMpSave(blob: string): Promise<void>;
  onCheat(action: CheatAction): void;
  onTurnUpdateLocate(tile: { col: number; row: number }): void;
  onTurnUpdateOpenProduction(cityId: number): void;
  onTurnUpdateOpenResearch(): void;
  onTurnUpdateOpenCivics(): void;
  onTurnUpdateOpenGold(): void;
  onTurnUpdateDismiss(): void;
}

export interface UI {
  render(view: UIView): void;
  banner(text: string): void;
  openResearch(): void;
  openCivics(): void;
  openReligion(): void;
  openTechTree(): void;
  openGodMode(): void;
  openTurnUpdates(): void;
  openProductionForCity(cityId: number): void;
  setMpSaves(saves: SaveRecord[]): void;
  /** Provide the (optional) ability-icon atlas for action buttons. */
  setAbilityAtlas(atlas: AbilityAtlas): void;
  /** Show the docked hover tooltip with limited tile info (null hides it). */
  setTileTip(tip: TileTip | null): void;
}

function div(id: string, cls: string): HTMLDivElement {
  const el = document.createElement("div");
  el.id = id;
  el.className = cls;
  document.body.appendChild(el);
  return el;
}

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function downloadJson(filename: string, json: string): void {
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function prodCost(item: ProductionItem): number {
  return item.kind === "unit" ? UNIT_DEFS[item.id].cost : BUILDING_DEFS[item.id].cost;
}

function prodName(item: ProductionItem): string {
  return item.kind === "unit" ? UNIT_DEFS[item.id].name : BUILDING_DEFS[item.id].name;
}

export function createUI(handlers: UIHandlers): UI {
  let abilityAtlas: AbilityAtlas | undefined;
  const topbar = div("topbar", "panel");
  const bottomBar = div("bottom-bar", "panel");
  const leaderAvatar = div("leader-avatar", "");
  const unitPanel = div("unit-panel", "panel hidden");
  const tilePanel = div("tile-panel", "panel hidden");
  const tileTip = div("tile-tip", "hidden");
  const cityPanel = div("city-panel", "panel hidden");
  const research = div("research", "panel hidden");
  const techtree = div("techtree", "panel hidden");
  const civics = div("civics", "panel hidden");
  const religionPanel = div("religion", "panel hidden");
  const production = div("production", "panel hidden");
  const log = div("log", "");
  const bannerEl = div("banner", "");
  const gameover = div("gameover", "hidden");
  const saveModal = div("save-modal", "panel hidden");
  const godPanel = div("god-panel", "panel hidden");
  godPanel.style.cssText =
    "position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);width:min(320px,calc(100vw - 32px));max-height:min(520px,80vh);overflow:auto;z-index:40"; 
  const wiki = createWiki();
  const villageOverlay = div("village-overlay", "");
  const villageDialog = div("village-dialog", "");
  villageDialog.innerHTML =
    `<img class="village-art" id="village-art" src="" alt="" />` +
    `<div class="village-title" id="village-title">Village Discovered</div>` +
    `<div class="village-msg" id="village-msg"></div>` +
    `<button class="btn primary" id="village-ok">OK</button>`;
  const villageArt = villageDialog.querySelector<HTMLImageElement>("#village-art")!;
  const villageTitle = villageDialog.querySelector<HTMLDivElement>("#village-title")!;
  const villageMsg = villageDialog.querySelector<HTMLDivElement>("#village-msg")!;
  const villageOk = villageDialog.querySelector<HTMLButtonElement>("#village-ok")!;

  const logOverlay = div("log-overlay", "");
  const logDialog = div("log-dialog", "");
  logDialog.innerHTML =
    `<div class="log-dialog-title">Game Log</div>` +
    `<div class="log-dialog-content" id="log-dialog-content"></div>` +
    `<button class="btn primary" id="log-close">Close</button>`;
  const logDialogContent = logDialog.querySelector<HTMLDivElement>("#log-dialog-content")!;
  const logClose = logDialog.querySelector<HTMLButtonElement>("#log-close")!;
  const hideLogDialog = (): void => {
    logOverlay.classList.remove("show");
    logDialog.classList.remove("show");
  };
  logClose.addEventListener("click", hideLogDialog);
  logOverlay.addEventListener("click", hideLogDialog);

  const goldOverlay = div("gold-overlay", "");
  const goldDialog = div("gold-dialog", "");
  goldDialog.innerHTML =
    `<div class="gold-dialog-title">Treasury</div>` +
    `<div id="gold-dialog-content"></div>` +
    `<button class="btn primary" id="gold-close">Close</button>`;
  const goldDialogContent = goldDialog.querySelector<HTMLDivElement>("#gold-dialog-content")!;
  const goldClose = goldDialog.querySelector<HTMLButtonElement>("#gold-close")!;
  let goldDialogOpen = false;
  const hideGoldDialog = (): void => {
    goldDialogOpen = false;
    goldOverlay.classList.remove("show");
    goldDialog.classList.remove("show");
  };
  goldClose.addEventListener("click", hideGoldDialog);
  goldOverlay.addEventListener("click", hideGoldDialog);

  const turnUpdateOverlay = div("turn-update-overlay", "");
  const turnUpdateDialog = div("turn-update-dialog", "");
  turnUpdateDialog.innerHTML =
    `<div class="turn-update-header">` +
    `<div class="turn-update-heading" id="turn-update-heading">Turn Updates</div>` +
    `<button class="btn tu-view-toggle" id="turn-update-view-toggle"></button>` +
    `</div>` +
    `<div class="turn-update-expanded" id="turn-update-expanded">` +
    `<img class="turn-update-art" id="turn-update-art" src="" alt="" />` +
    `<div class="turn-update-title" id="turn-update-title"></div>` +
    `<div class="turn-update-msg" id="turn-update-msg"></div>` +
    `<div class="turn-update-actions" id="turn-update-actions"></div>` +
    `<div class="turn-update-nav">` +
    `<button class="btn" id="turn-update-prev">◀ Previous</button>` +
    `<span id="turn-update-count"></span>` +
    `<button class="btn" id="turn-update-next">Next ▶</button>` +
    `</div>` +
    `</div>` +
    `<div class="turn-update-compact hidden" id="turn-update-compact"></div>` +
    `<button class="btn primary" id="turn-update-close">Close</button>`;
  const turnUpdateExpanded = turnUpdateDialog.querySelector<HTMLDivElement>("#turn-update-expanded")!;
  const turnUpdateCompact = turnUpdateDialog.querySelector<HTMLDivElement>("#turn-update-compact")!;
  const turnUpdateHeading = turnUpdateDialog.querySelector<HTMLDivElement>("#turn-update-heading")!;
  const turnUpdateViewToggle = turnUpdateDialog.querySelector<HTMLButtonElement>("#turn-update-view-toggle")!;
  const turnUpdateArt = turnUpdateDialog.querySelector<HTMLImageElement>("#turn-update-art")!;
  const turnUpdateTitle = turnUpdateDialog.querySelector<HTMLDivElement>("#turn-update-title")!;
  const turnUpdateMsg = turnUpdateDialog.querySelector<HTMLDivElement>("#turn-update-msg")!;
  const turnUpdateActions = turnUpdateDialog.querySelector<HTMLDivElement>("#turn-update-actions")!;
  const turnUpdateCount = turnUpdateDialog.querySelector<HTMLSpanElement>("#turn-update-count")!;
  const turnUpdatePrev = turnUpdateDialog.querySelector<HTMLButtonElement>("#turn-update-prev")!;
  const turnUpdateNext = turnUpdateDialog.querySelector<HTMLButtonElement>("#turn-update-next")!;
  const turnUpdateClose = turnUpdateDialog.querySelector<HTMLButtonElement>("#turn-update-close")!;

  const settingsOverlay = div("settings-overlay", "");
  const settingsDialog = div("settings-dialog", "");

  const endturn = document.createElement("button");
  endturn.id = "endturn";
  endturn.className = "action-btn action-next";
  endturn.title = "Next Move";
  document.body.appendChild(endturn);

  const endturn2 = document.createElement("button");
  endturn2.id = "endturn2";
  endturn2.className = "action-btn action-skip";
  endturn2.title = "Skip Move (End Turn)";
  endturn2.addEventListener("click", () => handlers.onEndTurn());
  document.body.appendChild(endturn2);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (villageDialog.classList.contains("show")) {
        closeVillageDialog();
        return;
      }
      if (logDialog.classList.contains("show")) {
        hideLogDialog();
        return;
      }
      if (goldDialog.classList.contains("show")) {
        hideGoldDialog();
        return;
      }
      if (settingsOpen) {
        closeSettings();
        return;
      }
      if (turnUpdateDialog.classList.contains("show")) {
        hideTurnUpdateDialog();
        return;
      }
      if (godModeOpen) {
        godModeOpen = false;
        if (lastView) renderGodMode(lastView);
        return;
      }
      if (lastState) closePickers(lastState);
      if (menuOpen) {
        menuOpen = false;
        if (lastState) renderMenu(lastState);
      }
      closeSideSheets();
    } else if (e.key === "Enter") {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }
      endturn.click();
    }
  });

  let researchOpen = false;
  let techtreeOpen = false;
  let civicsOpen = false;
  let religionOpen = false;
  let productionOpen = false;
  let tileExpanded = false;
  let prodCityId: number | null = null;
  let chosenBeliefs: string[] = [];
  let bannerTimer = 0;
  let lastState: GameState | null = null;
  let lastViewerId = -1;
  let lastLogLength = 0;
  let logInitialized = false;
  let villageQueue: LogEntry[] = [];
  let turnUpdateQueue: TurnUpdateEvent[] = [];
  let turnUpdateIndex = 0;
  let turnUpdateOpen = false;
  let turnUpdateHasNew = false;
  // The view the open dialog is currently showing; seeded from the saved
  // preference each time it opens, then toggled in-dialog without persisting
  // when the player drills into a single event from the compact list.
  let activeTurnUpdateView: TurnUpdateView = "expanded";
  // Identifies the (viewer, turn) batch we last surfaced, so a new batch is
  // shown exactly once even though render() runs many times per turn.
  let lastTurnUpdateKey = "";
  // Highest turn-update id each viewer has already been shown. Tracking by id
  // (rather than turn number) lets a turn-start batch include events emitted
  // during the enemy phase, which the sim tags with the previous turn number.
  const lastSeenTurnUpdateByViewer = new Map<number, number>();
  let menuOpen = false;
  let settingsOpen = false;
  let menuView: "menu" | "save" = "menu";
  let isSaving = false;
  let mpSaves: SaveRecord[] = [];
  let godModeEnabled = false;
  let godModeOpen = false;
  let lastView: UIView | null = null;

  const closePickers = (state: GameState): void => {
    researchOpen = false;
    civicsOpen = false;
    religionOpen = false;
    productionOpen = false;
    techtreeOpen = false;
    renderResearch(state);
    renderCivics(state);
    renderReligion(state);
    renderProduction(state);
    renderTechTree(state);
  };
  const closeSideSheets = (): void => {
    empire.close();
    diplomacy.close();
    wiki.close();
  };

  const rewardImagePath = (reward: FeatureRewardType): string => {
    if (reward === "camp_cleared") {
      return "barbarian-rewards/barb_camp_cleared.png";
    }
    return `village-rewards/village_reward_${reward}.png`;
  };

  const showVillageDialog = (msg: string, reward?: FeatureRewardType): void => {
    villageMsg.textContent = msg;
    if (reward) {
      villageArt.src = rewardImagePath(reward);
      villageArt.classList.remove("hidden");
      villageTitle.textContent = reward === "camp_cleared" ? "Camp Cleared" : "Village Discovered";
    } else {
      villageArt.classList.add("hidden");
      villageTitle.textContent = "Village Discovered";
    }
    villageOverlay.classList.add("show");
    villageDialog.classList.add("show");
  };

  const showBanner = (text: string): void => {
    bannerEl.textContent = text;
    bannerEl.classList.add("show");
    window.clearTimeout(bannerTimer);
    bannerTimer = window.setTimeout(() => bannerEl.classList.remove("show"), 1400);
  };

  const closeVillageDialog = (): void => {
    villageOverlay.classList.remove("show");
    villageDialog.classList.remove("show");
    villageQueue.shift();
    if (villageQueue.length > 0) {
      window.setTimeout(() => showVillageDialog(villageQueue[0]!.message, villageQueue[0]!.reward), 150);
    }
  };

  villageOk.addEventListener("click", closeVillageDialog);
  villageOverlay.addEventListener("click", closeVillageDialog);

  const turnUpdateImagePath = (ev: TurnUpdateEvent): string => {
    if (ev.type === "wonderComplete" && ev.payload?.wonderId) {
      return `turn-updates/wonder_${ev.payload.wonderId}.png`;
    }
    if (ev.type === "improvementComplete" && ev.payload?.kind) {
      return `turn-updates/improvement_${ev.payload.kind}.png`;
    }
    return `turn-updates/${ev.type}.png`;
  };

  const hideTurnUpdateDialog = (): void => {
    turnUpdateOpen = false;
    turnUpdateOverlay.classList.remove("show");
    turnUpdateDialog.classList.remove("show");
    handlers.onTurnUpdateDismiss();
  };

  const showTurnUpdateDialog = (): void => {
    if (turnUpdateQueue.length === 0) {
      hideTurnUpdateDialog();
      return;
    }
    turnUpdateOpen = true;
    // Open in the player's saved layout; in-dialog drill-down may switch it.
    activeTurnUpdateView = getSettings().turnUpdateView;
    turnUpdateIndex = Math.min(turnUpdateIndex, turnUpdateQueue.length - 1);
    turnUpdateOverlay.classList.add("show");
    turnUpdateDialog.classList.add("show");
    renderTurnUpdateDialog();
  };

  const updateTitleFor = (ev: TurnUpdateEvent): string => {
    switch (ev.type) {
      case "unitDied":
        return "Unit Lost";
      case "productionComplete":
        return "Production Complete";
      case "researchComplete":
        return "Research Complete";
      case "civicComplete":
        return "Civic Complete";
      case "improvementComplete": {
        const kind = ev.payload?.kind;
        if (kind === "road") return "Road Complete";
        if (kind === "wall") return "Wall Complete";
        if (kind === "tower") return "Tower Complete";
        return "Improvement Complete";
      }
      case "wonderComplete":
        return "Wonder Complete";
      case "tradeRouteEstablished":
        return "Trade Route Established";
      case "tradeRoutePillaged":
        return "Trade Route Pillaged";
      case "improvementPillaged":
        return "Improvement Pillaged";
      case "cityLost":
        return "City Lost";
      case "cityGrew":
        return "City Grew";
      case "treasuryExhausted":
        return "Treasury Exhausted";
      default:
        return "Update";
    }
  };

  const renderTurnUpdateCtas = (ev: TurnUpdateEvent): string => {
    const buttons: string[] = [];
    if (ev.tile) {
      buttons.push(`<button class="btn" data-tu-locate="${ev.tile.col},${ev.tile.row}">Locate</button>`);
    }
    if (ev.type === "productionComplete" && ev.cityId != null) {
      buttons.push(`<button class="btn primary" data-tu-prod="${ev.cityId}">Choose Production</button>`);
    }
    if (ev.type === "researchComplete") {
      buttons.push(`<button class="btn primary" data-tu-research>Choose Research</button>`);
    }
    if (ev.type === "civicComplete") {
      buttons.push(`<button class="btn primary" data-tu-civics>Choose Civic</button>`);
    }
    if (ev.type === "treasuryExhausted") {
      buttons.push(`<button class="btn primary" data-tu-gold>Open Treasury</button>`);
    }
    if (ev.type === "tradeRouteEstablished") {
      const destCol = ev.payload?.destCol;
      const destRow = ev.payload?.destRow;
      if (ev.tile) {
        buttons.push(`<button class="btn" data-tu-locate="${ev.tile.col},${ev.tile.row}">Locate Origin</button>`);
      }
      if (typeof destCol === "number" && typeof destRow === "number") {
        buttons.push(`<button class="btn" data-tu-locate="${destCol},${destRow}">Locate Destination</button>`);
      }
    }
    return buttons.join("");
  };

  const renderTurnUpdateExpanded = (): void => {
    const ev = turnUpdateQueue[turnUpdateIndex];
    if (!ev) {
      hideTurnUpdateDialog();
      return;
    }
    const genericPath = `turn-updates/${ev.type}.png`;
    const specificPath = turnUpdateImagePath(ev);
    turnUpdateArt.src = specificPath;
    turnUpdateArt.onerror = () => {
      // Fall back to the generic event image, then to a leader portrait placeholder.
      if (turnUpdateArt.src.endsWith(specificPath) && specificPath !== genericPath) {
        turnUpdateArt.src = genericPath;
      } else {
        turnUpdateArt.src = "leaders/rome.png";
        turnUpdateArt.onerror = null;
      }
    };
    turnUpdateTitle.textContent = updateTitleFor(ev);
    turnUpdateMsg.textContent = ev.message;
    turnUpdateActions.innerHTML = renderTurnUpdateCtas(ev);
    const hasMultiple = turnUpdateQueue.length > 1;
    turnUpdateCount.textContent = hasMultiple ? `${turnUpdateIndex + 1} / ${turnUpdateQueue.length}` : "";
    turnUpdatePrev.classList.toggle("hidden", !hasMultiple);
    turnUpdateNext.classList.toggle("hidden", !hasMultiple);
    turnUpdatePrev.disabled = turnUpdateIndex === 0;
    turnUpdateNext.disabled = turnUpdateIndex === turnUpdateQueue.length - 1;

    turnUpdateActions.querySelectorAll<HTMLButtonElement>("[data-tu-locate]").forEach((el) =>
      el.addEventListener("click", () => {
        const [col, row] = el.dataset.tuLocate!.split(",").map(Number) as [number, number];
        handlers.onTurnUpdateLocate({ col, row });
        hideTurnUpdateDialog();
      }),
    );
    turnUpdateActions.querySelectorAll<HTMLButtonElement>("[data-tu-prod]").forEach((el) =>
      el.addEventListener("click", () => {
        handlers.onTurnUpdateOpenProduction(Number(el.dataset.tuProd));
        hideTurnUpdateDialog();
      }),
    );
    turnUpdateActions.querySelectorAll<HTMLButtonElement>("[data-tu-research]").forEach((el) =>
      el.addEventListener("click", () => {
        handlers.onTurnUpdateOpenResearch();
        hideTurnUpdateDialog();
      }),
    );
    turnUpdateActions.querySelectorAll<HTMLButtonElement>("[data-tu-civics]").forEach((el) =>
      el.addEventListener("click", () => {
        handlers.onTurnUpdateOpenCivics();
        hideTurnUpdateDialog();
      }),
    );
    turnUpdateActions.querySelectorAll<HTMLButtonElement>("[data-tu-gold]").forEach((el) =>
      el.addEventListener("click", () => {
        handlers.onTurnUpdateOpenGold();
        hideTurnUpdateDialog();
      }),
    );
  };

  const renderTurnUpdateCompact = (): void => {
    if (turnUpdateQueue.length === 0) {
      hideTurnUpdateDialog();
      return;
    }
    turnUpdateCompact.innerHTML = turnUpdateQueue
      .map(
        (ev, i) =>
          `<button class="tu-row" data-tu-row="${i}">` +
          `<img class="tu-row-art" src="${turnUpdateImagePath(ev)}" alt="" ` +
          `onerror="this.onerror=null;this.src='turn-updates/${ev.type}.png'" />` +
          `<span class="tu-row-text"><b>${escapeHtml(updateTitleFor(ev))}</b>` +
          `<span>${escapeHtml(ev.message)}</span></span>` +
          `<span class="tu-row-chevron">›</span>` +
          `</button>`,
      )
      .join("");
    turnUpdateCompact.querySelectorAll<HTMLButtonElement>("[data-tu-row]").forEach((el) =>
      el.addEventListener("click", () => {
        // Drill into the chosen event without changing the saved preference.
        turnUpdateIndex = Number(el.dataset.tuRow);
        activeTurnUpdateView = "expanded";
        renderTurnUpdateDialog();
      }),
    );
  };

  const renderTurnUpdateDialog = (): void => {
    const compact = activeTurnUpdateView === "compact";
    turnUpdateHeading.textContent = compact ? `Turn Updates (${turnUpdateQueue.length})` : "Turn Updates";
    // The toggle shows the layout you'd switch TO.
    turnUpdateViewToggle.textContent = compact ? "Expanded ▦" : "Compact ☰";
    turnUpdateExpanded.classList.toggle("hidden", compact);
    turnUpdateCompact.classList.toggle("hidden", !compact);
    if (compact) {
      renderTurnUpdateCompact();
    } else {
      renderTurnUpdateExpanded();
    }
  };

  turnUpdateViewToggle.addEventListener("click", () => {
    const next: TurnUpdateView = activeTurnUpdateView === "compact" ? "expanded" : "compact";
    activeTurnUpdateView = next;
    // Persist the layout chosen via the toggle so it carries across games.
    updateSettings({ turnUpdateView: next });
    if (settingsOpen) renderSettings();
    renderTurnUpdateDialog();
  });

  turnUpdatePrev.addEventListener("click", () => {
    if (turnUpdateIndex > 0) {
      turnUpdateIndex--;
      renderTurnUpdateDialog();
    }
  });
  turnUpdateNext.addEventListener("click", () => {
    if (turnUpdateIndex < turnUpdateQueue.length - 1) {
      turnUpdateIndex++;
      renderTurnUpdateDialog();
    }
  });
  turnUpdateClose.addEventListener("click", hideTurnUpdateDialog);
  turnUpdateOverlay.addEventListener("click", hideTurnUpdateDialog);

  const closeSettings = (): void => {
    settingsOpen = false;
    renderSettings();
  };

  const renderSettings = (): void => {
    settingsOverlay.classList.toggle("show", settingsOpen);
    settingsDialog.classList.toggle("show", settingsOpen);
    if (!settingsOpen) return;
    const s = getSettings();
    const tuMode = !s.turnUpdatePopup ? "off" : s.turnUpdateView;
    settingsDialog.innerHTML =
      `<div class="settings-header"><b>⚙ Settings</b>` +
      `<button class="btn" id="settings-close">Close</button></div>` +
      `<div class="settings-section">` +
      `<div class="settings-title">Turn Updates</div>` +
      `<div class="settings-hint">What happens at the start of each of your turns.</div>` +
      `<div class="seg">` +
      `<button class="seg-btn ${tuMode === "expanded" ? "active" : ""}" data-tu-mode="expanded" title="Pop up one event at a time">Pop up</button>` +
      `<button class="seg-btn ${tuMode === "compact" ? "active" : ""}" data-tu-mode="compact" title="Pop up all events on one screen">Compact</button>` +
      `<button class="seg-btn ${tuMode === "off" ? "active" : ""}" data-tu-mode="off" title="Don't pop up; still available from the Updates button">Off</button>` +
      `</div></div>`;
    settingsDialog.querySelector<HTMLButtonElement>("#settings-close")!.addEventListener("click", closeSettings);
    settingsDialog.querySelectorAll<HTMLButtonElement>("[data-tu-mode]").forEach((el) =>
      el.addEventListener("click", () => {
        const mode = el.dataset.tuMode;
        if (mode === "off") {
          updateSettings({ turnUpdatePopup: false });
        } else {
          updateSettings({ turnUpdatePopup: true, turnUpdateView: mode as TurnUpdateView });
          if (turnUpdateOpen) {
            activeTurnUpdateView = mode as TurnUpdateView;
            renderTurnUpdateDialog();
          }
        }
        renderSettings();
      }),
    );
  };
  settingsOverlay.addEventListener("click", closeSettings);

  const renderAction = (view: UIView): void => {
    if (view.suggestion) {
      endturn.title = view.suggestion.label;
      endturn.onclick = () => handlers.onSuggestion();
      endturn2.classList.remove("hidden");
    } else {
      endturn.title = "End Turn";
      endturn.onclick = () => handlers.onEndTurn();
      endturn2.classList.add("hidden");
    }
  };

  const renderTopbar = (state: GameState): void => {
    const player = state.players[state.currentPlayerIndex]!;
    const viewerId = lastViewerId >= 0 ? lastViewerId : player.id;
    const sci = citiesOf(state, player.id).reduce(
      (n, c) => n + getCityYields(state, c).science,
      0,
    );
    const gld = citiesOf(state, player.id).reduce((n, c) => n + getCityYields(state, c).gold, 0);
    const upkeep = unitsOf(state, player.id).reduce((n, u) => n + unitUpkeep(state, u), 0);
    const netGold = gld - upkeep;
    const goldSign = netGold >= 0 ? "+" : "−";
    const goldClass = netGold >= 0 ? "color:#ffd700" : "color:#ff8a8a";
    const fth = citiesOf(state, player.id).reduce((n, c) => n + getCityYields(state, c).faith, 0);
    const researchingDef = player.researching ? TECH_DEFS[player.researching] : null;
    const researchPct = researchingDef
      ? Math.min(100, (player.scienceProgress / researchingDef.cost) * 100)
      : 0;
    const cul = citiesOf(state, player.id).reduce((n, c) => n + getCityYields(state, c).culture, 0);
    const civicDef = getCivic(player.researchingCivic ?? undefined);
    const civicPct = civicDef ? Math.min(100, (player.cultureProgress / civicDef.cost) * 100) : 0;
    const gov = getGovernment(player.government);
    const civ = getCiv(player.civId);
    const rName = researchingDef ? researchingDef.name : "Choose…";
    const cName = civicDef ? civicDef.name : "Choose…";
    const civTitle = civ ? `${civ.name} — ${civ.abilityName}: ${civ.abilityDesc}` : "";
    const showCivics = civicsUnlocked(player);
    const showReligion = religionUnlocked(state, player.id);

    const myCities = citiesOf(state, viewerId);
    const cityCount = myCities.length;
    const specCount = myCities.reduce((n, c) => n + c.specialists.length, 0);
    const unitCount = unitsOf(state, viewerId).length;

    topbar.innerHTML = `
      <div class="tb-grp">
        <span class="tb-turn">⏱ ${state.turn}</span>
        <span class="tb-civ" title="${civTitle}"><span class="dot" style="background:${player.color}"></span>${player.name}${civ ? ` · <b>${civ.name}</b>` : ""}</span>
      </div>
      <div class="tb-grp tb-res">
        <button class="tb-pill gold-chip" id="gold-btn" title="Gold"><span class="tb-pl">🪙</span><b>${Math.floor(player.gold)}</b><span class="tb-score" style="${goldClass}">${goldSign}${Math.abs(netGold)}</span></button>
        <button class="tb-pill" id="research-btn" title="Research" style="--p:${researchPct}%">
          <span class="tb-pl">🔬</span><b>${rName}</b><span class="tb-score">+${sci}</span></button>
        ${showCivics ? `<button class="tb-pill civic" id="civics-btn" title="${gov?.name ?? "Government"}" style="--p:${civicPct}%">` +
          `<span class="tb-pl">🏛️</span><b>${cName}</b><span class="tb-score">+${cul}</span></button>` : ""}
        ${showReligion ? `<button class="tb-pill" id="religion-btn" title="Religion">` +
          `<span class="tb-pl">☮️</span><b>${Math.floor(player.faith)}</b><span class="tb-score">+${fth}</span></button>` : ""}
      </div>
      <div class="tb-grp">
        <button class="tb-pill empire" id="cities-btn" title="Cities"><span class="tb-pl">🏙️</span><b>${cityCount}</b></button>
        <button class="tb-pill empire" id="units-btn" title="Units"><span class="tb-pl">⚔️</span><b>${unitCount}</b></button>
        <button class="tb-pill empire" id="specialists-btn" title="Specialists"><span class="tb-pl">👷</span><b>${specCount}</b></button>
        <button class="tb-pill" id="diplo-pill" title="Diplomacy">
          <span class="tb-pl">🕊️</span><b>${player.met.length}</b></button>
        <button class="tb-pill ${turnUpdateHasNew ? "has-badge" : ""}" id="turn-update-btn" title="Turn Updates">
          <span class="tb-pl">📜</span><b>Updates</b>${turnUpdateHasNew ? `<span class="tu-badge"></span>` : ""}</button>
        <button class="tb-pill" id="menu-btn" title="Menu">
          <span class="tb-pl">☰</span><b>Menu</b></button>
      </div>`;

    if (civ) {
      leaderAvatar.classList.remove("empty");
      leaderAvatar.innerHTML =
        `<img src="${import.meta.env.BASE_URL}leaders/${civ.id}.png" alt="${escapeHtml(civ.leader)}" title="${escapeHtml(civ.name)} — ${escapeHtml(civ.leader)}" onerror="this.style.visibility='hidden'">` +
        `<div class="leader-avatar-label"><b>${escapeHtml(civ.name)}</b><span>${escapeHtml(civ.leader)}</span></div>`;
    } else {
      leaderAvatar.classList.add("empty");
      leaderAvatar.innerHTML = "";
    }

    topbar.querySelector<HTMLButtonElement>("#research-btn")!.addEventListener("click", () => {
      const opening = !researchOpen;
      researchOpen = !researchOpen;
      civicsOpen = false;
      religionOpen = false;
      if (opening) {
        closeSideSheets();
        menuOpen = false;
        renderMenu(state);
      }
      renderResearch(state);
      renderCivics(state);
      renderReligion(state);
    });
    if (showCivics) {
      topbar.querySelector<HTMLButtonElement>("#civics-btn")!.addEventListener("click", () => {
        const opening = !civicsOpen;
        civicsOpen = !civicsOpen;
        researchOpen = false;
        religionOpen = false;
        if (opening) {
          closeSideSheets();
          menuOpen = false;
          renderMenu(state);
        }
        renderCivics(state);
        renderResearch(state);
        renderReligion(state);
      });
    }
    if (showReligion) {
      topbar.querySelector<HTMLButtonElement>("#religion-btn")!.addEventListener("click", () => {
        const opening = !religionOpen;
        religionOpen = !religionOpen;
        researchOpen = false;
        civicsOpen = false;
        if (opening) {
          closeSideSheets();
          menuOpen = false;
          renderMenu(state);
        }
        renderReligion(state);
        renderResearch(state);
        renderCivics(state);
      });
    }
    const openEmpire = (tab: EmpireTab) => {
      const opening = !empire.isOpen();
      if (opening) {
        closeSideSheets();
        closePickers(state);
        menuOpen = false;
        renderMenu(state);
      }
      empire.toggle(state, viewerId, tab);
    };
    topbar.querySelector<HTMLButtonElement>("#cities-btn")!.addEventListener("click", () => openEmpire("cities"));
    topbar.querySelector<HTMLButtonElement>("#units-btn")!.addEventListener("click", () => openEmpire("units"));
    topbar.querySelector<HTMLButtonElement>("#specialists-btn")!.addEventListener("click", () => openEmpire("specialists"));
    topbar.querySelector<HTMLButtonElement>("#diplo-pill")!.addEventListener("click", () => {
      const opening = !diplomacy.isOpen();
      if (opening) {
        closeSideSheets();
        closePickers(state);
        menuOpen = false;
        renderMenu(state);
      }
      diplomacy.toggleContacts(state, viewerId);
    });
    topbar.querySelector<HTMLButtonElement>("#menu-btn")!.addEventListener("click", () => {
      const opening = !menuOpen;
      if (opening) {
        closeSideSheets();
        closePickers(state);
      }
      menuOpen = !menuOpen;
      menuView = "menu";
      if (menuOpen) handlers.onMenuOpen();
      renderMenu(state);
    });
    topbar.querySelector<HTMLButtonElement>("#gold-btn")!.addEventListener("click", () => {
      goldDialogOpen = !goldDialogOpen;
      if (goldDialogOpen) {
        closeSideSheets();
        closePickers(state);
        menuOpen = false;
        renderMenu(state);
      }
      renderGoldDialog(state);
    });
    topbar.querySelector<HTMLButtonElement>("#turn-update-btn")!.addEventListener("click", () => {
      turnUpdateHasNew = false;
      showTurnUpdateDialog();
    });

    // Mobile bottom bar: mirrors the topbar actions as icon-only buttons.
    bottomBar.innerHTML =
      `<div class="bb-grp">` +
      `<button class="bb-chip gold-chip" data-bb="gold" title="Gold">🪙 ${Math.floor(player.gold)} <span style="${goldClass}">(${goldSign}${Math.abs(netGold)})</span></button>` +
      `<button class="bb-btn" data-bb="research" title="Research" style="--p:${researchPct}%"><span>🔬</span><i>+${sci}</i></button>` +
      (showCivics ? `<button class="bb-btn" data-bb="civics" title="${gov?.name ?? "Government"}" style="--p:${civicPct}%"><span>🏛️</span><i>+${cul}</i></button>` : "") +
      (showReligion ? `<button class="bb-btn" data-bb="religion" title="Religion"><span>☮️</span><i>${Math.floor(player.faith)} +${fth}</i></button>` : "") +
      `<button class="bb-btn" data-bb="empire" title="Empire"><span>🏙️</span><i>${cityCount}</i></button>` +
      `<button class="bb-btn ${turnUpdateHasNew ? "has-badge" : ""}" data-bb="turn-update" title="Turn Updates"><span>📜</span><i>Updates</i>${turnUpdateHasNew ? `<span class="tu-badge"></span>` : ""}</button>` +
      `<button class="bb-btn" data-bb="diplo" title="Diplomacy"><span>🕊️</span><i>${player.met.length}</i></button>` +
      `<button class="bb-btn" data-bb="menu" title="Menu"><span>☰</span></button>` +
      `</div>`;
    const bbMap: Record<string, string> = {
      research: "#research-btn",
      civics: "#civics-btn",
      religion: "#religion-btn",
      empire: "#cities-btn",
      diplo: "#diplo-pill",
      menu: "#menu-btn",
      gold: "#gold-btn",
      "turn-update": "#turn-update-btn",
    };
    bottomBar.querySelectorAll<HTMLButtonElement>("[data-bb]").forEach((el) => {
      el.addEventListener("click", () => {
        const target = bbMap[el.dataset.bb ?? ""];
        if (target) topbar.querySelector<HTMLButtonElement>(target)?.click();
      });
    });
  };

  const renderMenu = (state: GameState): void => {
    saveModal.classList.toggle("hidden", !menuOpen);
    if (!menuOpen) return;
    const player = state.players[state.currentPlayerIndex]!;
    const isHost = state.players[0]?.id === player.id;

    // If the save form is already open, don't rebuild it every frame: that would
    // reset the input value and steal focus, which makes typing impossible on
    // touch devices. Just sync the save button state.
    if (menuView === "save" && saveModal.querySelector<HTMLInputElement>("#save-name")) {
      const confirmBtn = saveModal.querySelector<HTMLButtonElement>("#save-confirm");
      if (confirmBtn) {
        confirmBtn.disabled = isSaving;
        confirmBtn.textContent = isSaving ? "Saving…" : "Save";
      }
      return;
    }

    if (menuView === "menu") {
      const godMenuBtn =
        !lastView?.cheatsEnabled
          ? ""
          : godModeEnabled
            ? `<button class="btn" id="menu-god">⚡ God Mode</button>`
            : `<button class="btn" id="menu-enable-god">Enable God Mode</button>`;
      let html =
        `<div class="row" style="justify-content:space-between"><b>Game Menu</b>` +
        `<button class="btn" id="save-close">Close</button></div>` +
        `<div style="margin:8px 0;color:#9fc0dc">Turn ${state.turn} · ${player.name}</div>` +
        `<div style="display:flex;flex-direction:column;gap:8px;margin-top:12px">` +
        `<button class="btn primary" id="menu-save">Save Game</button>` +
        `<button class="btn" id="menu-settings">⚙ Settings</button>` +
        `<button class="btn" id="menu-wiki">Open Wiki</button>` +
        `<button class="btn" id="menu-log">Game Log</button>` +
        godMenuBtn +
        `<button class="btn" id="menu-leave">Leave Game</button>` +
        `</div>`;

      if (isHost && mpSaves.length > 0) {
        html += `<div style="margin-top:16px;border-top:1px solid var(--edge);padding-top:12px"><b>Host MP Saves</b></div>`;
        html += mpSaves
          .map(
            (s) =>
              `<div class="gi" style="display:flex;justify-content:space-between;align-items:center;margin-top:6px;padding:6px;border:1px solid var(--edge);border-radius:8px">` +
              `<span>${escapeHtml(s.name)}<br/><span style="color:#9fc0dc;font-size:11px">Turn ${s.turn} · ${new Date(s.createdAt).toLocaleString()}</span></span>` +
              `<button class="btn" data-load-mp="${s.id}">Load</button>` +
              `</div>`,
          )
          .join("");
      }
      html += `<div id="save-error" style="color:#ff8a8a;margin-top:6px"></div>`;
      saveModal.innerHTML = html;
      saveModal.querySelector<HTMLButtonElement>("#save-close")!.addEventListener("click", () => {
        menuOpen = false;
        renderMenu(state);
      });
      saveModal.querySelector<HTMLButtonElement>("#menu-settings")!.addEventListener("click", () => {
        settingsOpen = true;
        renderSettings();
      });
      saveModal.querySelector<HTMLButtonElement>("#menu-save")!.addEventListener("click", () => {
        menuView = "save";
        renderMenu(state);
      });
      saveModal.querySelector<HTMLButtonElement>("#menu-wiki")!.addEventListener("click", () => {
        menuOpen = false;
        closeSideSheets();
        closePickers(state);
        renderMenu(state);
        wiki.open();
      });
      saveModal.querySelector<HTMLButtonElement>("#menu-log")!.addEventListener("click", () => {
        logDialogContent.innerHTML = visibleLog(state, lastViewerId >= 0 ? lastViewerId : (state.players[state.currentPlayerIndex]?.id ?? 0))
          .reverse()
          .map((entry) => `<div>${escapeHtml(entry.message)}</div>`)
          .join("");
        logOverlay.classList.add("show");
        logDialog.classList.add("show");
      });
      saveModal.querySelector<HTMLButtonElement>("#menu-enable-god")?.addEventListener("click", () => {
        godModeEnabled = true;
        godModeOpen = true;
        menuOpen = false;
        closeSideSheets();
        closePickers(state);
        renderMenu(state);
        if (lastView) {
          renderTilePanel(lastView.state, lastView.selectedTile ?? null, lastView.viewerId, lastView.cheatsEnabled ?? false);
          renderGodMode(lastView);
        }
      });
      saveModal.querySelector<HTMLButtonElement>("#menu-god")?.addEventListener("click", () => {
        menuOpen = false;
        closeSideSheets();
        closePickers(state);
        renderMenu(state);
        godModeOpen = true;
        if (lastView) renderGodMode(lastView);
      });
      saveModal.querySelector<HTMLButtonElement>("#menu-leave")!.addEventListener("click", () => {
        if (confirm("Leave this game and return to the main menu?")) location.reload();
      });
      saveModal.querySelectorAll<HTMLButtonElement>("[data-load-mp]").forEach((el) =>
        el.addEventListener("click", async () => {
          const id = el.dataset.loadMp;
          const record = mpSaves.find((s) => s.id === id);
          if (!record) return;
          isSaving = true;
          renderMenu(state);
          try {
            await handlers.onLoadMpSave(record.blob);
            menuOpen = false;
            renderMenu(state);
            showBanner("MP save loaded");
          } catch (err) {
            isSaving = false;
            renderMenu(state);
            saveModal.querySelector<HTMLDivElement>("#save-error")!.textContent = String(err);
          }
        }),
      );
      return;
    }

    // Save form view
    const civ = getCiv(player.civId);
    const defaultName = `${civ ? civ.name : player.name} - Turn ${state.turn}`;
    let html =
      `<div class="row" style="justify-content:space-between"><b>Save Game</b>` +
      `<button class="btn" id="save-close">Cancel</button></div>` +
      `<div style="margin:8px 0;color:#9fc0dc">Turn ${state.turn} · ${player.name}</div>` +
      `<input id="save-name" class="lobby-in" value="${escapeHtml(defaultName)}" placeholder="Save name…" style="width:100%;margin-bottom:8px" />` +
      `<button class="btn primary" id="save-confirm" style="width:100%" ${isSaving ? "disabled" : ""}>` +
      (isSaving ? "Saving…" : "Save") +
      `</button>` +
      `<button class="btn" id="save-export" style="width:100%;margin-top:8px">💾 Export Current Save</button>` +
      `<div id="save-error" style="color:#ff8a8a;margin-top:6px"></div>`;
    saveModal.innerHTML = html;
    const input = saveModal.querySelector<HTMLInputElement>("#save-name")!;
    input.focus();
    saveModal.querySelector<HTMLButtonElement>("#save-close")!.addEventListener("click", () => {
      menuView = "menu";
      renderMenu(state);
    });
    saveModal.querySelector<HTMLButtonElement>("#save-confirm")!.addEventListener("click", async () => {
      const name = input.value.trim();
      if (!name) {
        saveModal.querySelector<HTMLDivElement>("#save-error")!.textContent = "Enter a save name.";
        return;
      }
      isSaving = true;
      renderMenu(state);
      try {
        await handlers.onSave(name);
        isSaving = false;
        menuOpen = false;
        menuView = "menu";
        renderMenu(state);
        showBanner("Game saved");
      } catch (err) {
        isSaving = false;
        renderMenu(state);
        saveModal.querySelector<HTMLDivElement>("#save-error")!.textContent = String(err);
      }
    });
    saveModal.querySelector<HTMLButtonElement>("#save-export")!.addEventListener("click", async () => {
      const errorEl = saveModal.querySelector<HTMLDivElement>("#save-error")!;
      errorEl.textContent = "";
      try {
        const json = await handlers.onExportCurrentSave();
        const safeName = input.value.trim().replace(/[^a-zA-Z0-9\-_\s]/g, "").trim() || "save";
        downloadJson(`${safeName}.rocsave`, json);
      } catch (err) {
        errorEl.textContent = String(err);
      }
    });
  };

  const renderGoldDialog = (state: GameState): void => {
    goldOverlay.classList.toggle("show", goldDialogOpen);
    goldDialog.classList.toggle("show", goldDialogOpen);
    if (!goldDialogOpen) return;

    const player = state.players[state.currentPlayerIndex]!;
    const myCities = citiesOf(state, player.id);
    const myUnits = unitsOf(state, player.id);

    const cityRows = myCities
      .map((city) => {
        const y = getCityYields(state, city);
        return `<div class="gold-row"><span>${escapeHtml(city.name)}${city.isCapital ? " ★" : ""}</span><span class="gold-amount gold-positive">+${y.gold}</span></div>`;
      })
      .join("");
    const totalCityGold = myCities.reduce((n, c) => n + getCityYields(state, c).gold, 0);

    const unitRows = myUnits
      .map((unit) => {
        const cost = unitUpkeep(state, unit);
        if (cost <= 0) return "";
        const def = UNIT_DEFS[unit.type];
        return `<div class="gold-row"><span>${escapeHtml(def.name)}</span><span class="gold-amount gold-negative">−${cost}</span></div>`;
      })
      .filter(Boolean)
      .join("");
    const totalUpkeep = myUnits.reduce((n, u) => n + unitUpkeep(state, u), 0);

    const net = totalCityGold - totalUpkeep;
    const netClass = net >= 0 ? "gold-positive" : "gold-negative";
    const netSign = net >= 0 ? "+" : "";

    let html = `<div class="gold-header">`;
    html += `<span class="gold-treasury">🪙 ${Math.floor(player.gold)}</span>`;
    html += `<span class="gold-net ${netClass}">${netSign}${net}/turn</span>`;
    html += `</div>`;

    html += `<div class="gold-section"><div class="gold-section-title">Income</div>`;
    if (cityRows) {
      html += cityRows;
    } else {
      html += `<div class="gold-row"><span class="sub">No cities producing gold.</span><span class="gold-amount">0</span></div>`;
    }
    html += `<div class="gold-total"><span>Total income</span><span class="gold-amount gold-positive">+${totalCityGold}</span></div>`;
    html += `</div>`;

    html += `<div class="gold-section"><div class="gold-section-title">Expenses</div>`;
    if (unitRows) {
      html += unitRows;
    } else {
      html += `<div class="gold-row"><span class="sub">No unit upkeep.</span><span class="gold-amount">0</span></div>`;
    }
    html += `<div class="gold-total"><span>Total upkeep</span><span class="gold-amount gold-negative">−${totalUpkeep}</span></div>`;
    html += `</div>`;

    goldDialogContent.innerHTML = html;
  };

  const renderResearch = (state: GameState): void => {
    research.classList.toggle("hidden", !researchOpen);
    if (!researchOpen) return;
    const player = state.players[state.currentPlayerIndex]!;
    const techs = availableTechs(player);
    research.innerHTML =
      `<div class="row" style="justify-content:space-between"><b>Choose research</b>` +
      `<button class="btn" id="rclose">✕</button></div>` +
      `<button class="btn" id="open-techtree" style="width:100%;margin:6px 0">🌳 View Full Tech Tree</button>` +
      (techs.length === 0
        ? `<div style="margin-top:8px;color:#9fc0dc">All available techs researched.</div>`
        : techs
            .map((t) => {
              const u = techUnlocks(t);
              return (
                `<div class="tech" data-tech="${t}"><div style="flex:1">` +
                `<div><b>${TECH_DEFS[t].name}</b></div>` +
                (u.length ? `<div class="sub">Unlocks: ${u.join(", ")}</div>` : "") +
                `</div><span class="cost">${TECH_DEFS[t].cost}🔬</span></div>`
              );
            })
            .join(""));
    research.querySelector<HTMLButtonElement>("#rclose")!.addEventListener("click", () => {
      researchOpen = false;
      research.classList.add("hidden");
    });
    research.querySelector<HTMLButtonElement>("#open-techtree")!.addEventListener("click", () => {
      researchOpen = false;
      research.classList.add("hidden");
      closeSideSheets();
      menuOpen = false;
      renderMenu(state);
      techtreeOpen = true;
      renderTechTree(state);
    });
    research.querySelectorAll<HTMLDivElement>(".tech").forEach((el) => {
      el.addEventListener("click", () => {
        handlers.onSetResearch(el.dataset.tech as TechId);
        researchOpen = false;
        research.classList.add("hidden");
      });
    });
  };

  const renderTechTree = (state: GameState): void => {
    techtree.classList.toggle("hidden", !techtreeOpen);
    if (!techtreeOpen) return;
    const viewerId = state.players[state.currentPlayerIndex]!.id;
    const inner = document.createElement("div");
    renderTechTreeInto(
      inner,
      state,
      viewerId,
      (techId) => {
        handlers.onSetResearch(techId);
        techtreeOpen = false;
        techtree.classList.add("hidden");
      },
      (techId) => {
        handlers.onSetResearchTarget(techId);
        techtreeOpen = false;
        techtree.classList.add("hidden");
      },
    );
    techtree.innerHTML = `<div class="row" style="justify-content:space-between"><b>Technology Tree</b><button class="btn" id="ttclose">✕</button></div>`;
    techtree.appendChild(inner);
    techtree.querySelector<HTMLButtonElement>("#ttclose")!.addEventListener("click", () => {
      techtreeOpen = false;
      techtree.classList.add("hidden");
    });
  };

  const renderCivics = (state: GameState): void => {
    civics.classList.toggle("hidden", !civicsOpen);
    if (!civicsOpen) return;
    const player = state.players[state.currentPlayerIndex]!;
    const gov = getGovernment(player.government);
    const slots = gov?.slots ?? 0;
    const civicList = availableCivics(player);
    const govList = availableGovernments(player);
    const policyList = unlockedPolicies(player);

    let html =
      `<div class="row" style="justify-content:space-between"><b>Civics & Government</b><button class="btn" id="vclose">✕</button></div>`;

    if (!civicsUnlocked(player)) {
      html +=
        `<div class="locked-note">🔒 Civics unlock after researching <b>${TECH_DEFS[CIVICS_REQUIRED_TECH].name}</b>.</div>`;
      civics.innerHTML = html;
      civics.querySelector<HTMLButtonElement>("#vclose")!.addEventListener("click", () => {
        civicsOpen = false;
        civics.classList.add("hidden");
      });
      return;
    }

    html += `<div class="csub">Develop a civic</div>`;
    html += civicList.length
      ? civicList
          .map((id) => {
            const d = getCivic(id)!;
            const unlocks: string[] = [];
            if (d.unlocksGovernment) unlocks.push(`Gov: ${getGovernment(d.unlocksGovernment)?.name}`);
            if (d.unlocksPolicy) unlocks.push(`Policy: ${getPolicy(d.unlocksPolicy)?.name}`);
            return (
              `<div class="tech" data-civic="${id}"><div style="flex:1">` +
              `<div><b>${d.name}</b></div>` +
              (unlocks.length ? `<div class="sub">${unlocks.join(" · ")}</div>` : "") +
              `</div><span class="cost">${d.cost}🎭</span></div>`
            );
          })
          .join("")
      : `<div style="color:#9fc0dc;font-size:12px">No new civics available yet.</div>`;

    html += `<div class="csub">Government — <b style="color:#fff">${gov?.name ?? "—"}</b></div>`;
    html += `<div class="row" style="flex-wrap:wrap">${govList
      .map((id) => {
        const g = getGovernment(id)!;
        const active = id === player.government;
        return `<button class="btn ${active ? "primary" : ""}" data-gov="${id}" title="${g.desc}">${g.name}</button>`;
      })
      .join("")}</div>`;

    html += `<div class="csub">Policies <span style="color:#9fc0dc">(${player.policies.length}/${slots} slots)</span></div>`;
    html += policyList.length
      ? `<div class="row" style="flex-wrap:wrap">${policyList
          .map((id) => {
            const p = getPolicy(id)!;
            const active = player.policies.includes(id);
            return `<button class="btn ${active ? "primary" : ""}" data-policy="${id}" title="${p.desc}">${p.name}</button>`;
          })
          .join("")}</div>`
      : `<div style="color:#9fc0dc;font-size:12px">Unlock policies by developing civics.</div>`;

    civics.innerHTML = html;
    civics.querySelector<HTMLButtonElement>("#vclose")!.addEventListener("click", () => {
      civicsOpen = false;
      civics.classList.add("hidden");
    });
    civics.querySelectorAll<HTMLDivElement>("[data-civic]").forEach((el) =>
      el.addEventListener("click", () => {
        handlers.onSetCivic(el.dataset.civic!);
        civicsOpen = false;
        civics.classList.add("hidden");
      }),
    );
    civics.querySelectorAll<HTMLButtonElement>("[data-gov]").forEach((el) =>
      el.addEventListener("click", () => handlers.onSetGovernment(el.dataset.gov!)),
    );
    civics.querySelectorAll<HTMLButtonElement>("[data-policy]").forEach((el) =>
      el.addEventListener("click", () => handlers.onTogglePolicy(el.dataset.policy!)),
    );
  };

  const renderProduction = (state: GameState): void => {
    production.classList.toggle("hidden", !productionOpen);
    if (!productionOpen) return;
    const city = prodCityId != null ? state.cities.get(prodCityId) : null;
    if (!city) {
      productionOpen = false;
      production.classList.add("hidden");
      return;
    }
    const player = state.players.find((p) => p.id === city.ownerId)!;
    const options = availableProduction(state, player, city);
    const perTurn = Math.max(1, getCityYields(state, city).production);
    const turns = (cost: number) => Math.max(1, Math.ceil((cost - city.productionStored) / perTurn));

    let html = `<div class="production-header"><div class="row" style="justify-content:space-between"><b>${city.name} — Choose Production</b><button class="btn" id="pclose">✕</button></div></div>`;
    html += `<div class="production-list">`;
    html += options
      .map((o) => {
        let glyph: string;
        let desc: string;
        if (o.item.kind === "unit") {
          glyph = UNIT_DEFS[o.item.id].glyph;
          const i = unitInfo(o.item.id);
          desc = `${i.role} — ${i.stats}${i.note ? ` · ${i.note}` : ""}`;
        } else {
          glyph = "🏛";
          desc = buildingInfo(o.item.id);
        }
        return (
          `<div class="pcard" data-kind="${o.item.kind}" data-id="${o.item.id}">` +
          `<span class="pglyph">${glyph}</span>` +
          `<div style="flex:1"><div><b>${o.name}</b> <span class="sub">· ${turns(o.cost)} turns</span></div>` +
          `<div class="sub">${desc}</div></div>` +
          `<span class="cost">${o.cost}⚒️</span></div>`
        );
      })
      .join("");
    html += `</div>`;
    production.innerHTML = html;
    production.querySelector<HTMLButtonElement>("#pclose")!.addEventListener("click", () => {
      productionOpen = false;
      production.classList.add("hidden");
    });
    production.querySelectorAll<HTMLDivElement>(".pcard").forEach((el) =>
      el.addEventListener("click", () => {
        handlers.onSetProduction({ kind: el.dataset.kind, id: el.dataset.id } as ProductionItem);
        productionOpen = false;
        production.classList.add("hidden");
      }),
    );
  };

  const renderReligion = (state: GameState): void => {
    religionPanel.classList.toggle("hidden", !religionOpen);
    if (!religionOpen) return;
    const player = state.players[state.currentPlayerIndex]!;
    const totalCities = state.cities.size;
    let html = `<div class="row" style="justify-content:space-between"><b>Religion</b><button class="btn" id="relclose">✕</button></div>`;
    const myRel = religionById(state, player.foundedReligionId);

    if (!myRel && !religionUnlocked(state, player.id)) {
      html += `<div class="locked-note">🔒 Religion unlocks after researching <b>${TECH_DEFS[RELIGION_REQUIRED_TECH].name}</b>. Then build Shrines/Temples to earn faith.</div>`;
      if (state.religions.length) {
        html += `<div class="csub">World religions</div>` + state.religions.map((r) => `<div class="sub">${r.name} — ${cityFollowerCount(state, r.id)} cities</div>`).join("");
      }
      religionPanel.innerHTML = html;
      religionPanel.querySelector<HTMLButtonElement>("#relclose")!.addEventListener("click", () => {
        religionOpen = false;
        religionPanel.classList.add("hidden");
      });
      return;
    }

    if (myRel) {
      const holy = state.cities.get(myRel.holyCityId);
      html += `<div style="margin-top:4px"><b style="font-size:15px">☮️ ${myRel.name}</b></div>`;
      html += `<div class="sub">Holy city: ${holy?.name ?? "—"} · Following <b style="color:#fff">${cityFollowerCount(state, myRel.id)}/${totalCities}</b> cities</div>`;
      html += `<div class="csub">Beliefs</div>`;
      html += myRel.beliefs.length
        ? myRel.beliefs.map((b) => `<div class="sub">• <b style="color:#fff">${getBelief(b)?.name}</b> — ${getBelief(b)?.desc}</div>`).join("")
        : `<div class="sub">No beliefs chosen.</div>`;
    } else if (canFoundReligion(state, player.id)) {
      const holy = [...state.cities.values()].find((c) => c.ownerId === player.id);
      const names = availableReligionNames(state);
      html += `<div class="csub">Found a Religion</div>`;
      html += `<div class="sub">Holy city: <b style="color:#fff">${holy?.name}</b></div>`;
      html += `<div style="margin-top:6px">Name <select id="rel-name" class="lobby-in" style="width:100%">${names.map((n) => `<option>${n}</option>`).join("")}</select></div>`;
      html += `<div class="csub">Choose up to 2 beliefs (${chosenBeliefs.length}/2)</div>`;
      html += BELIEFS.map((b) => {
        const on = chosenBeliefs.includes(b.id);
        return `<div class="tech" data-belief="${b.id}" style="${on ? "border-color:#ffd967;background:#27331d" : ""}"><div style="flex:1"><b>${b.name}</b><div class="sub">${b.desc}</div></div>${on ? "✓" : ""}</div>`;
      }).join("");
      html += `<button class="btn primary" id="found-rel" style="width:100%;margin-top:8px">Found Religion ☮️</button>`;
    } else {
      const pct = Math.min(100, (player.faith / FAITH_TO_FOUND) * 100);
      const allFounded = state.religions.length >= state.players.filter((p) => !p.isBarbarian).length;
      html += `<div class="csub">Faith</div>`;
      html += `<div>${Math.floor(player.faith)}/${FAITH_TO_FOUND} to found a religion<div class="bar"><i style="width:${pct}%;background:#7ad0a0"></i></div></div>`;
      html += `<div class="sub" style="margin-top:6px">Build Shrines and Temples to generate faith.${allFounded ? " All religions have been founded." : ""}</div>`;
    }

    if (state.religions.length) {
      html += `<div class="csub">World religions</div>`;
      html += state.religions.map((r) => `<div class="sub">${r.name} — ${cityFollowerCount(state, r.id)} cities</div>`).join("");
    }

    religionPanel.innerHTML = html;
    religionPanel.querySelector<HTMLButtonElement>("#relclose")!.addEventListener("click", () => {
      religionOpen = false;
      religionPanel.classList.add("hidden");
    });
    religionPanel.querySelectorAll<HTMLDivElement>("[data-belief]").forEach((el) =>
      el.addEventListener("click", () => {
        const id = el.dataset.belief!;
        const i = chosenBeliefs.indexOf(id);
        if (i >= 0) chosenBeliefs.splice(i, 1);
        else if (chosenBeliefs.length < 2) chosenBeliefs.push(id);
        renderReligion(state);
      }),
    );
    religionPanel.querySelector<HTMLButtonElement>("#found-rel")?.addEventListener("click", () => {
      const holy = [...state.cities.values()].find((c) => c.ownerId === player.id);
      if (!holy) return;
      const name = religionPanel.querySelector<HTMLSelectElement>("#rel-name")?.value ?? "";
      handlers.onFoundReligion(holy.id, name, [...chosenBeliefs]);
      chosenBeliefs = [];
      religionOpen = false;
      religionPanel.classList.add("hidden");
    });
  };

  const renderUnitPanel = (state: GameState, unit: Unit | null, viewerId: number, odds?: CombatOdds | null): void => {
    if (!unit) {
      unitPanel.classList.add("hidden");
      return;
    }
    unitPanel.classList.remove("hidden");
    const def = UNIT_DEFS[unit.type];
    const combatant = def.strength > 0 || (def.rangedStrength ?? 0) > 0;
    const own = unit.ownerId === viewerId;
    const owner = state.players.find((p) => p.id === unit.ownerId);

    const info = unitInfo(unit.type);
    const stars = unit.level > 1 ? " ★".repeat(unit.level - 1) : "";
    let html =
      `<div class="row" style="justify-content:space-between"><b style="font-size:15px">${def.name}<span style="color:#ffd967">${stars}</span></b>` +
      `</div>` +
      (owner && !own
        ? `<div class="sub"><span class="dot" style="background:${owner.color};display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:4px"></span>${owner.name}</div>`
        : "") +
      `<div class="sub">${info.role}${info.note ? ` · ${info.note}` : ""}</div>` +
      `<div style="margin-top:2px">Moves <b>${unit.movementLeft}/${def.movement}</b>` +
      (combatant ? ` · HP <b>${unit.hp}/${unitMaxHp(unit)}</b>` : "") +
      `</div>`;
    if (combatant) {
      const levelMult = 1 + 0.05 * (unit.level - 1);
      html +=
        `<div style="color:#9fc0dc">⚔️ ${Math.floor(def.strength * levelMult)}` +
        ((def.rangedStrength ?? 0) > 0 ? ` · 🏹 ${Math.floor((def.rangedStrength ?? 0) * levelMult)} (rng ${def.range})` : "") +
        ` · XP ${unit.xp}</div>`;
    }
    if (unit.promotions.length) {
      html +=
        `<div style="margin-top:6px;color:#9fc0dc"><b>Promotions:</b> ` +
        `${unit.promotions.map((p) => `<span title="${PROMOTION_DEFS[p].desc}">${PROMOTION_DEFS[p].name}</span>`).join(", ")}` +
        `</div>`;
    }
    if (odds) {
      html +=
        `<div style="margin-top:6px;padding-top:6px;border-top:1px solid var(--edge)">` +
        `⚔️ vs <b>${odds.targetName}</b>: deal <b style="color:#5fcf61">${odds.toDefender}</b>` +
        (odds.toAttacker > 0 ? ` · take <b style="color:#e0533d">${odds.toAttacker}</b>` : ` (no retaliation)`) +
        `</div>`;
    }

    // Barbarian diplomacy: when an enemy barbarian stands next to one of your
    // units, you can bribe its war-band into a truce or recruit it outright.
    if (!own && owner?.isBarbarian) {
      const me = state.players.find((p) => p.id === viewerId);
      if (me?.researched.has(BARBARIAN_DIPLOMACY_TECH)) {
        const adjacent = canParleyWith(state, unit, viewerId);
        const pacified = isBarbarianPacified(state, unit, viewerId);
        const bribeCost = barbarianBribeCost(me);
        const recruitCost = barbarianRecruitCost(unit);
        html += `<div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--edge)">`;
        if (pacified) {
          html += `<div class="csub" style="color:#9fd9a0">🤝 Truce active — this war-band won't attack you.</div>`;
        }
        if (!adjacent) {
          html += `<div class="locked-note">🤝 Move one of your units beside them to parley.</div>`;
        } else {
          html += `<div style="display:flex;flex-direction:column;gap:6px">`;
          html +=
            `<button class="btn" data-bribe ${me.gold < bribeCost ? "disabled" : ""} ` +
            `title="Buy a ${BRIBE_TURNS}-turn truce with this war-band. Each bribe doubles the next one's price." ` +
            `style="text-align:left;display:flex;justify-content:space-between;gap:8px${me.gold < bribeCost ? ";opacity:.5" : ""}">` +
            `<span><b style="color:#fff">${pacified ? "Extend Truce" : "Bribe War-band"}</b> <span class="sub">(${BRIBE_TURNS} turns)</span></span>` +
            `<span class="sub">${bribeCost}🪙</span></button>`;
          html +=
            `<button class="btn" data-recruit ${me.gold < recruitCost ? "disabled" : ""} ` +
            `title="Take this unit into your own army." ` +
            `style="text-align:left;display:flex;justify-content:space-between;gap:8px${me.gold < recruitCost ? ";opacity:.5" : ""}">` +
            `<span><b style="color:#fff">Recruit ${def.name}</b></span>` +
            `<span class="sub">${recruitCost}🪙</span></button>`;
          html += `</div>`;
        }
        html += `</div>`;
      }
    }

    if (own) {
      const actions: string[] = [];
      if (unit.sleeping) {
        actions.push(`<button class="btn primary" id="wake">Wake</button>`);
      } else {
        actions.push(`<button class="btn" id="sleep">Sleep</button>`);
      }
      if (def.founder) actions.push(`<button class="btn primary" id="found">Found City</button>`);
      if (actions.length) html += `<div class="row" style="margin-top:8px">${actions.join("")}</div>`;

      // Active-ability buttons.
      const abilities = unitAbilities(unit);
      if (abilities.length) {
        if (unit.sleeping) {
          html += `<div class="csub" style="margin-top:8px">💤 Sleeping</div>`;
        } else if (unit.stance) {
          html += `<div class="csub" style="margin-top:8px">${ACTIVE_ABILITY_DEFS[unit.stance].glyph} In stance: <b>${ACTIVE_ABILITY_DEFS[unit.stance].name}</b></div>`;
        }
        html +=
          `<div style="display:flex;flex-direction:column;gap:6px;margin-top:6px">` +
          abilities
            .map((a) => {
              const ad = ACTIVE_ABILITY_DEFS[a];
              const usable = canUseAbility(state, unit, a).ok;
              return (
                `<button class="btn" data-ability="${a}" ${usable ? "" : "disabled"} ` +
                `title="${ad.desc}" style="text-align:left;display:flex;gap:8px;align-items:flex-start;padding:8px 10px${usable ? "" : ";opacity:.5"}">` +
                `${abilityIconHtml(abilityAtlas, a)}` +
                `<span style="display:flex;flex-direction:column;gap:2px">` +
                `<b style="color:#fff">${ad.name}</b>` +
                `<span style="font-size:12px;color:#9fc0dc;font-weight:400;line-height:1.4">${ad.desc}</span></span></button>`
              );
            })
            .join("") +
          `</div>`;
      }

      if (def.trader) {
        const origin = cityAt(state, unit.col, unit.row);
        const dests = tradeRouteDestinations(state, unit);
        if (origin && dests.length > 0) {
          html += `<div class="csub">🐪 Trade route from ${origin.name}</div>`;
          html +=
            `<div style="display:flex;flex-direction:column;gap:6px;margin-top:4px">` +
            dests
              .map((c) => {
                const y = tradeRouteYield(state, {
                  id: 0,
                  ownerId: unit.ownerId,
                  fromCityId: origin.id,
                  toCityId: c.id,
                  path: [],
                });
                const extra =
                  (y.food ? ` +${y.food}🍞` : "") +
                  (y.production ? ` +${y.production}⚒️` : "") +
                  (y.science ? ` +${y.science}🔬` : "");
                return (
                  `<button class="btn" data-trade-dest="${c.id}" style="text-align:left;display:flex;justify-content:space-between;gap:8px">` +
                  `<span><b style="color:#fff">${c.name}</b></span>` +
                  `<span class="sub">+${y.gold}🪙${extra}</span></button>`
                );
              })
              .join("") +
            `</div>`;
        } else {
          html += `<div class="locked-note">🐪 Move this Trader into one of your cities, then it can open a trade route to another city.</div>`;
        }
      }

      if (unit.unspentPromotions > 0) {
        const promoOptions = availablePromotions(unit);
        html +=
          `<div style="margin-top:8px;color:#ffd967">Promote (${unit.unspentPromotions}):</div>` +
          `<div style="display:flex;flex-direction:column;gap:6px;margin-top:4px">` +
          (promoOptions.length
            ? promoOptions
                .map((p) => {
                  const def = PROMOTION_DEFS[p];
                  const stars = "★".repeat(def.tier);
                  return (
                    `<button class="btn" data-promote="${p}" style="text-align:left;display:flex;flex-direction:column;gap:2px;padding:8px 10px">` +
                    `<span><b style="color:#fff">${def.name}</b> <span style="color:#ffd967;letter-spacing:1px">${stars}</span></span>` +
                    `<span style="font-size:12px;color:#9fc0dc;font-weight:400;line-height:1.4">${def.desc}</span>` +
                    `</button>`
                  );
                })
                .join("")
            : `<div class="sub">No promotions available at this level.</div>`) +
          `</div>`;
      }
    }

    unitPanel.innerHTML = html;
    unitPanel.querySelector<HTMLButtonElement>("#found")?.addEventListener("click", () => handlers.onFoundCity());
    unitPanel.querySelector<HTMLButtonElement>("#sleep")?.addEventListener("click", () => handlers.onSleep());
    unitPanel.querySelector<HTMLButtonElement>("#wake")?.addEventListener("click", () => handlers.onWake());
    unitPanel.querySelectorAll<HTMLButtonElement>("[data-promote]").forEach((el) =>
      el.addEventListener("click", () => handlers.onPromote(el.dataset.promote as PromotionId)),
    );
    unitPanel.querySelectorAll<HTMLButtonElement>("[data-ability]").forEach((el) =>
      el.addEventListener("click", () => handlers.onAbility(el.dataset.ability as ActiveAbilityId)),
    );
    unitPanel.querySelectorAll<HTMLButtonElement>("[data-trade-dest]").forEach((el) =>
      el.addEventListener("click", () => handlers.onEstablishTrade(Number(el.dataset.tradeDest))),
    );
    unitPanel.querySelector<HTMLButtonElement>("[data-bribe]")?.addEventListener("click", () => handlers.onBribeBarbarian(unit.id));
    unitPanel.querySelector<HTMLButtonElement>("[data-recruit]")?.addEventListener("click", () => handlers.onRecruitBarbarian(unit.id));
  };

  const WORK_KINDS = ["farm", "lumber_camp", "mine", "quarry", "road", "wall", "tower"];
  const CHEAT_WORK_KINDS = [
    "farm",
    "lumber_camp",
    "mine",
    "quarry",
    "pasture",
    "plantation",
    "camp",
    "fishing_boats",
    "wall",
    "tower",
  ];

  const renderTilePanel = (state: GameState, tile: Tile | null, viewerId = -1, cheatsEnabled = false): void => {
    if (!tile) {
      tilePanel.classList.add("hidden");
      return;
    }
    tilePanel.classList.remove("hidden");
    const r = tileReport(state, tile);
    const y = r.yields;
    const chip = (icon: string, n: number) =>
      `<span style="${n ? "" : "opacity:.35"}" title="${icon}">${icon} <b>${n}</b></span>`;

    let html =
      `<div class="row" style="justify-content:space-between">` +
      `<b style="font-size:15px">${r.name}</b>` +
      `<button class="btn" id="tile-close">✕</button></div>` +
      `<div class="sub" style="margin-top:2px">${r.subtitle}</div>` +
      `<div class="tinfo-yields">` +
      chip("🍞", y.food) +
      chip("⚒️", y.production) +
      chip("🪙", y.gold) +
      chip("🔬", y.science) +
      `</div>` +
      `<button class="btn tinfo-toggle" id="tile-toggle">${tileExpanded ? "Hide details ▴" : "Benefits & deficits ▾"}</button>`;

    if (tileExpanded) {
      html +=
        `<ul class="tinfo-list">` +
        r.lines
          .map((l) => {
            const mark = l.kind === "good" ? "▲" : l.kind === "bad" ? "▼" : "•";
            return `<li><span class="tinfo-${l.kind}">${mark}</span><span>${l.text}</span></li>`;
          })
          .join("") +
        `</ul>`;
    }

    // Develop (start a public work) — only for tiles in the viewer's territory.
    const ownsTile = tile.ownerCityId !== undefined && state.cities.get(tile.ownerCityId)?.ownerId === viewerId;
    const existing = state.works.find((w) => w.target && w.target.col === tile.col && w.target.row === tile.row);
    if (existing) {
      const req = Object.values(existing.requirement).reduce((a, b) => a + (b ?? 0), 0);
      const done = Object.values(existing.progress).reduce((a, b) => a + (b ?? 0), 0);
      const pct = req > 0 ? Math.floor((done / req) * 100) : 0;
      html +=
        `<div class="csub">🛠️ Under construction</div>` +
        `<div class="sub">${workName(existing.kind, existing.tier ?? 1)} — ${pct}%</div>` +
        `<div class="bar"><i style="width:${pct}%;background:#c9a24a"></i></div>` +
        `<button class="btn" id="work-cancel" data-work-id="${existing.id}" style="margin-top:6px">Cancel</button>`;
    } else if (ownsTile) {
      let needHint = "";
      const btns = WORK_KINDS.map((k) => {
        const tier = nextTierAt(tile, k);
        if (tier === null) return "";
        const verb = tier > 1 ? "Upgrade → " : "";
        const can = canStartWork(state, viewerId, k, tile.col, tile.row);
        if (can.ok) {
          return `<button class="btn" data-work="${k}">${verb}${workName(k, tier)}</button>`;
        }
        // A missing-craftsman block is shown as a locked button so the player
        // knows the option exists but needs the right specialist first.
        if (can.error && can.error.startsWith("No ")) {
          needHint = can.error;
          return `<button class="btn" disabled title="${can.error}" style="opacity:.5;cursor:not-allowed">${verb}${workName(k, tier)} 🔒</button>`;
        }
        return "";
      }).filter(Boolean);
      if (btns.length) {
        html += `<div class="csub">Develop</div><div class="row" style="flex-wrap:wrap;gap:6px">${btns.join("")}</div>`;
        if (needHint) html += `<div class="sub" style="margin-top:4px;color:#e0b07d">🔒 ${needHint}.</div>`;
      }
    }

    if (cheatsEnabled && godModeEnabled) {
      html += `<div class="csub">God Mode</div>`;
      html += `<div class="row" style="flex-wrap:wrap;gap:6px"><button class="btn" id="tile-god">⚡ Cheats…</button></div>`;
    }

    tilePanel.innerHTML = html;
    tilePanel
      .querySelector<HTMLButtonElement>("#tile-close")!
      .addEventListener("click", () => handlers.onCloseTile());
    tilePanel.querySelector<HTMLButtonElement>("#tile-toggle")!.addEventListener("click", () => {
      tileExpanded = !tileExpanded;
      renderTilePanel(state, tile, viewerId);
    });
    tilePanel.querySelectorAll<HTMLButtonElement>("[data-work]").forEach((el) =>
      el.addEventListener("click", () => handlers.onStartWork(el.dataset.work!, tile.col, tile.row)),
    );
    tilePanel.querySelector<HTMLButtonElement>("#work-cancel")?.addEventListener("click", () =>
      handlers.onCancelWork(Number(existing!.id)),
    );
    tilePanel.querySelector<HTMLButtonElement>("#tile-god")?.addEventListener("click", () => {
      godModeOpen = true;
      if (lastView) renderGodMode(lastView);
    });
  };

  function renderGodMode(view: UIView): void {
    godPanel.classList.toggle("hidden", !godModeOpen);
    if (!godModeOpen) return;
    const tile = view.selectedTile;
    const tileOk = !!tile && isPassableLand(tile.terrain);
    const unitOptions = Object.entries(UNIT_DEFS)
      .map(([id, d]) => `<option value="${id}">${escapeHtml(d.name)}</option>`)
      .join("");

    let html =
      `<div class="row" style="justify-content:space-between"><b>⚡ God Mode</b>` +
      `<button class="btn" id="god-close">✕</button></div>` +
      `<div style="display:flex;flex-direction:column;gap:8px;margin-top:10px">` +
      `<button class="btn" data-cheat="unlockTechs">🔓 Unlock All Techs</button>` +
      `<button class="btn" data-cheat="completeWorks">⏩ Complete All Works</button>` +
      `<button class="btn" data-cheat="healUnits">❤️ Heal All Units</button>` +
      `<button class="btn" data-cheat="revealMap">👁 Reveal Map</button>` +
      `<button class="btn" data-cheat="addGold" data-amount="100">🪙 +100 Gold</button>`;

    if (tileOk) {
      html +=
        `<div class="csub">Selected Tile (${escapeHtml(TERRAIN_NAMES[tile.terrain])})</div>` +
        `<button class="btn" data-cheat="buildRoad" data-level="1">🛤️ Build Dirt Road</button>` +
        `<button class="btn" data-cheat="buildRoad" data-level="2">🛤️ Build Paved Road</button>` +
        `<button class="btn" data-cheat="buildRoad" data-level="3">🛤️ Build Imperial Road</button>` +
        `<button class="btn" data-cheat="foundCity">🏙️ Found City</button>` +
        `<div style="display:flex;gap:6px;align-items:center;margin-top:4px">` +
        `<select id="cheat-unit" class="lobby-in" style="flex:1">${unitOptions}</select>` +
        `<button class="btn" data-cheat="spawnUnit">Spawn Unit</button>` +
        `</div>` +
        `<div class="csub">Construction Works</div>` +
        `<div class="row" style="flex-wrap:wrap;gap:6px">` +
        CHEAT_WORK_KINDS.map((k) => `<button class="btn" data-cheat="buildWork" data-kind="${k}">${workName(k, 3)}</button>`).join("") +
        `</div>`;
    } else {
      html +=
        `<div class="csub">Selected Tile</div>` +
        `<div class="sub">Select a passable land tile to use tile cheats.</div>`;
    }
    html += `</div>`;

    godPanel.innerHTML = html;
    godPanel.querySelector<HTMLButtonElement>("#god-close")!.addEventListener("click", () => {
      godModeOpen = false;
      renderGodMode(view);
    });
    godPanel.querySelectorAll<HTMLButtonElement>("[data-cheat]").forEach((el) => {
      el.addEventListener("click", () => {
        const type = el.dataset.cheat!;
        switch (type) {
          case "unlockTechs":
            handlers.onCheat({ type: "unlockTechs" });
            break;
          case "completeWorks":
            handlers.onCheat({ type: "completeWorks" });
            break;
          case "healUnits":
            handlers.onCheat({ type: "healUnits" });
            break;
          case "revealMap":
            handlers.onCheat({ type: "revealMap" });
            break;
          case "addGold":
            handlers.onCheat({ type: "addGold", amount: Number(el.dataset.amount) });
            break;
          case "buildRoad": {
            if (!tile) break;
            handlers.onCheat({
              type: "buildRoad",
              col: tile.col,
              row: tile.row,
              level: Number(el.dataset.level) as 1 | 2 | 3,
            });
            break;
          }
          case "foundCity": {
            if (!tile) break;
            handlers.onCheat({ type: "foundCity", col: tile.col, row: tile.row });
            break;
          }
          case "buildWork": {
            if (!tile) break;
            handlers.onCheat({
              type: "buildWork",
              kind: el.dataset.kind!,
              col: tile.col,
              row: tile.row,
            });
            break;
          }
          case "spawnUnit": {
            if (!tile) break;
            const sel = godPanel.querySelector<HTMLSelectElement>("#cheat-unit")!;
            handlers.onCheat({
              type: "spawnUnit",
              unitType: sel.value as UnitTypeId,
              col: tile.col,
              row: tile.row,
            });
            break;
          }
        }
      });
    });
  };

  const renderCityPanel = (state: GameState, city: City | null): void => {
    if (!city) {
      cityPanel.classList.add("hidden");
      return;
    }
    cityPanel.classList.remove("hidden");
    const player = state.players.find((p) => p.id === city.ownerId)!;
    const y = getCityYields(state, city);
    const need = foodToGrow(city.population);
    const options = availableProduction(state, player, city);
    const curName = city.production ? prodName(city.production) : "— nothing —";
    const curCost = city.production ? prodCost(city.production) : 0;
    const prodPct = curCost
      ? Math.min(100, (city.productionStored / curCost) * 100)
      : 0;
    const foodPct = Math.min(100, (city.foodStored / need) * 100);

    const surplus = y.food - city.population * 2;
    const surplusStr = surplus >= 0 ? `+${surplus}` : `${surplus}`;

    // Specialists: train/release craftsmen from this city's population.
    const free = workerSlots(city);
    const avail = availableSpecialists(player);
    const specHtml =
      `<div class="csub">🛠️ Specialists <span style="color:#9fc0dc">(${city.specialists.length} trained · ${free} free)</span></div>` +
      avail
        .map((id) => {
          const def = SPECIALIST_DEFS[id];
          const mine = city.specialists.filter((s) => s.type === id);
          return (
            `<div class="row" style="justify-content:space-between;gap:6px;margin-top:4px">` +
            `<span title="${def.latin} — ${def.desc}">${def.name} <b style="color:#fff">×${mine.length}</b></span>` +
            `<span style="display:flex;gap:4px">` +
            `<button class="btn" data-spec-minus="${id}"${mine.length ? "" : " disabled"}>−</button>` +
            `<button class="btn" data-spec-plus="${id}"${free > 0 ? "" : " disabled"}>＋</button>` +
            `</span></div>`
          );
        })
        .join("");
    const cityWorks = worksOfCity(state, city.id);
    const worksHtml = cityWorks.length
      ? `<div class="csub">Public works</div>` +
        cityWorks
          .map((w) => {
            const req = Object.values(w.requirement).reduce((a, b) => a + (b ?? 0), 0);
            const done = Object.values(w.progress).reduce((a, b) => a + (b ?? 0), 0);
            const pct = req > 0 ? Math.floor((done / req) * 100) : 0;
            const label = w.kind === "wonder" ? "Wonder" : workName(w.kind, w.tier ?? 1);
            return `<div class="sub" style="margin-top:3px">${label} — ${pct}%<div class="bar"><i style="width:${pct}%;background:#c9a24a"></i></div></div>`;
          })
          .join("")
      : "";

    cityPanel.innerHTML =
      `<div class="row" style="justify-content:space-between">` +
      `<b style="font-size:15px">${city.isCapital ? "★ " : ""}${city.name}</b>` +
      `<button class="btn" id="cclose">✕</button></div>` +
      `<div style="color:#9fc0dc;margin-top:2px">Pop <b style="color:#fff">${city.population}</b> · ` +
      `🛡️ ${cityDefenseStrength(state, city)} · ❤️ ${Math.max(0, Math.floor(city.hp))}/${cityMaxHp(city)} · ⬣ ${territorySize(state, city)}` +
      (city.religion ? ` · ☮️ ${religionById(state, city.religion)?.name ?? ""}` : "") +
      `</div>` +
      // yields grid
      `<div class="ygrid">` +
      `<span title="Food (growth)">🍞 <b>${y.food}</b> <span style="color:#9fc0dc">(${surplusStr})</span></span>` +
      `<span title="Production">⚒️ <b>${y.production}</b></span>` +
      `<span title="Gold">🪙 <b>${y.gold}</b></span>` +
      `<span title="Science">🔬 <b>${y.science}</b></span>` +
      `</div>` +
      // citizens
      `<div style="margin-top:6px">👥 Citizens <b>${Math.min(city.workedTiles.length, free)}/${free}</b> working tiles</div>` +
      specHtml +
      worksHtml +
      // growth
      `<div style="margin-top:6px">Growth ${Math.floor(city.foodStored)}/${need}<div class="bar"><i style="width:${foodPct}%"></i></div></div>` +
      // production
      `<div style="margin-top:6px">Building <b>${curName}</b> ${curCost ? `${Math.floor(city.productionStored)}/${curCost}` : ""}<div class="bar"><i style="width:${prodPct}%"></i></div></div>` +
      `<button class="btn primary" id="open-prod" style="width:100%;margin-top:6px">Choose Production ▸ <span style="color:#cfe3f7;font-weight:400">(${options.length})</span></button>` +
      (() => {
        const routes = tradeRoutesFrom(state, city.id);
        if (!routes.length) return "";
        const totalGold = routes.reduce((s, r) => s + tradeRouteYield(state, r).gold, 0);
        const names = routes.map((r) => state.cities.get(r.toCityId)?.name ?? "?").join(", ");
        return `<div style="margin-top:6px;color:#9fc0dc;font-size:12px">🐪 Trade routes (${routes.length}): ${names} — +${totalGold}🪙</div>`;
      })() +
      (city.buildings.length
        ? `<div style="margin-top:6px;color:#9fc0dc;font-size:12px">Built: ${city.buildings.map((b) => BUILDING_DEFS[b].name).join(", ")}</div>`
        : "");

    cityPanel
      .querySelector<HTMLButtonElement>("#cclose")!
      .addEventListener("click", () => handlers.onCloseCity());
    cityPanel.querySelectorAll<HTMLButtonElement>("[data-spec-plus]").forEach((el) =>
      el.addEventListener("click", () => handlers.onConvertCitizen(city.id, el.dataset.specPlus!, 1)),
    );
    cityPanel.querySelectorAll<HTMLButtonElement>("[data-spec-minus]").forEach((el) =>
      el.addEventListener("click", () => handlers.onConvertCitizen(city.id, el.dataset.specMinus!, -1)),
    );
    cityPanel.querySelector<HTMLButtonElement>("#open-prod")!.addEventListener("click", () => {
      prodCityId = city.id;
      productionOpen = true;
      closeSideSheets();
      menuOpen = false;
      renderMenu(state);
      renderProduction(state);
    });
  };

  // The viewer only sees their own moves, world news, events aimed at them, and
  // things on tiles they've explored — never other players' private actions.
  const visibleLog = (state: GameState, viewerId: number): LogEntry[] => {
    const known = state.players.find((p) => p.id === viewerId)?.explored ?? new Set<string>();
    return state.log.filter((l) => isLogEntryVisible(l, viewerId, known));
  };

  const renderLog = (state: GameState, viewerId: number): void => {
    log.innerHTML = visibleLog(state, viewerId)
      .slice(-4)
      .map((l) => `<div>${escapeHtml(l.message)}</div>`)
      .join("");
  };

  const renderGameOver = (state: GameState): void => {
    if (!state.gameOver) {
      gameover.classList.add("hidden");
      return;
    }
    const viewerId = state.players[state.currentPlayerIndex]?.id;
    const gameOver = state.gameOver;
    const winner = gameOver.winnerId !== undefined ? state.players.find((p) => p.id === gameOver.winnerId) : undefined;
    const won = winner?.id === viewerId;
    gameover.classList.remove("hidden");
    const title = gameOver.condition === "extinction" ? "Draw" : won ? "Victory!" : "Defeat";
    const sub =
      gameOver.condition === "extinction"
        ? `<div class="sub">Every civilization has fallen on turn ${state.turn}.</div>`
        : `<div class="sub"><b style="color:${winner?.color}">${winner?.name ?? "Someone"}</b> wins by ${gameOver.condition} on turn ${state.turn}.</div>`;
    gameover.innerHTML =
      `<div class="title" style="color:${won ? "#ffd967" : "#e0533d"}">${title}</div>` +
      sub +
      `<button class="btn primary" id="go-menu" style="font-size:15px;padding:10px 18px">Back to Menu</button>`;
    gameover.querySelector<HTMLButtonElement>("#go-menu")?.addEventListener("click", () => location.reload());
  };

  // Empire overview (Units / Cities / Specialists & Wonders) side panel.
  const empire = createEmpire({
    onSelectUnit: (id) => handlers.onSelectUnit(id),
    onSelectCity: (id) => handlers.onSelectCity(id),
    onConvertCitizen: (cityId, sid, delta) => handlers.onConvertCitizen(cityId, sid, delta),
    onStartWonder: (wid, host) => handlers.onStartWonder(wid, host),
    onCancelWork: (wid) => handlers.onCancelWork(wid),
  });

  // Diplomacy: first-contact dialog + Contacts/negotiation screen + toggle button.
  const diplomacy = createDiplomacy({
    onDeclareWar: (t) => handlers.onDeclareWar(t),
    onMakePeace: (t) => handlers.onMakePeace(t),
    onDenounce: (t) => handlers.onDenounce(t),
    onGift: (t, g) => handlers.onGift(t, g),
    onDemandTribute: (t, g) => handlers.onDemandTribute(t, g),
    onProposeDeal: (t, give, want) => handlers.onProposeDeal(t, give, want),
    onRespondProposal: (id, acc) => handlers.onRespondProposal(id, acc),
    onAcknowledgeContact: (o) => handlers.onAcknowledgeContact(o),
  });
  return {
    render(view) {
      lastState = view.state;
      lastViewerId = view.viewerId;
      lastView = view;
      empire.render(view.state, view.viewerId);
      diplomacy.render(view.state, view.viewerId);
      renderTopbar(view.state);
      renderResearch(view.state);
      renderTechTree(view.state);
      renderCivics(view.state);
      renderReligion(view.state);
      renderProduction(view.state);
      renderUnitPanel(view.state, view.selectedUnit, view.viewerId, view.odds);
      renderTilePanel(view.state, view.selectedTile ?? null, view.viewerId, view.cheatsEnabled ?? false);
      renderGodMode(view);
      renderCityPanel(view.state, view.selectedCity);
      renderLog(view.state, view.viewerId);
      renderGameOver(view.state);
      renderMenu(view.state);
      renderGoldDialog(view.state);
      renderAction(view);

      // Hide the docked city/unit/tile panels whenever a higher-layer sheet or modal
      // is open so they don't peek through or fight for pointer events.
      const overlayOpen =
        empire.isOpen() ||
        diplomacy.isOpen() ||
        wiki.isOpen() ||
        researchOpen ||
        civicsOpen ||
        religionOpen ||
        productionOpen ||
        techtreeOpen ||
        menuOpen ||
        godModeOpen ||
        goldDialogOpen ||
        turnUpdateOpen ||
        settingsOpen;
      if (overlayOpen) {
        cityPanel.classList.add("hidden");
        unitPanel.classList.add("hidden");
        tilePanel.classList.add("hidden");
        tileTip.classList.add("hidden");
      }

      // Show a modal dialog for newly discovered village rewards.
      if (!logInitialized) {
        lastLogLength = view.state.log.length;
        logInitialized = true;
      } else if (view.state.log.length > lastLogLength) {
        const newEntries = view.state.log.slice(lastLogLength);
        const villageEntries = newEntries.filter(
          (m) => /village|trap|ambushed|barbarian camp/i.test(m.message) && m.actorId === view.viewerId,
        );
        if (villageEntries.length > 0) {
          const wasEmpty = villageQueue.length === 0;
          villageQueue.push(...villageEntries);
          if (wasEmpty && !villageDialog.classList.contains("show")) {
            showVillageDialog(villageQueue[0]!.message, villageQueue[0]!.reward);
          }
        }
        lastLogLength = view.state.log.length;
      }

      // Turn-start updates. state.turnUpdates accumulates across the whole game.
      // We compute the unseen batch on every render and always advance the seen
      // high-water mark — so events emitted *during* the viewer's own turn (their
      // mid-turn actions) get marked seen here and are never surfaced. Only the
      // batch that first appears across a turn boundary (the enemy phase plus the
      // new turn's economy) is shown. Selecting by unseen id rather than turn
      // number matters because the sim tags enemy-phase events (e.g. a unit the
      // AI killed) with the previous turn number.
      const updateKey = `${view.viewerId}:${view.state.turn}`;
      const turnChanged = updateKey !== lastTurnUpdateKey;
      lastTurnUpdateKey = updateKey;
      const batch = selectTurnUpdates(
        view.state.turnUpdates ?? [],
        view.viewerId,
        lastSeenTurnUpdateByViewer.get(view.viewerId),
      );
      lastSeenTurnUpdateByViewer.set(view.viewerId, batch.lastSeen);
      if (turnChanged && batch.toShow.length > 0) {
        turnUpdateQueue = batch.toShow;
        turnUpdateIndex = 0;
        turnUpdateHasNew = true;
        const { turnUpdatePopup } = getSettings();
        if (turnUpdatePopup && !turnUpdateDialog.classList.contains("show")) {
          showTurnUpdateDialog();
        } else if (turnUpdateOpen) {
          // Dialog already open across the turn boundary: refresh it in place.
          renderTurnUpdateDialog();
        }
      }
    },
    openResearch() {
      if (!lastState) return;
      researchOpen = true;
      renderResearch(lastState);
    },
    openCivics() {
      if (!lastState) return;
      civicsOpen = true;
      renderCivics(lastState);
    },
    openReligion() {
      if (!lastState) return;
      religionOpen = true;
      renderReligion(lastState);
    },
    openTechTree() {
      if (!lastState) return;
      techtreeOpen = true;
      renderTechTree(lastState);
    },
    setMpSaves(saves) {
      mpSaves = saves;
      if (menuOpen && lastState) renderMenu(lastState);
    },
    openGodMode() {
      godModeOpen = true;
      if (lastView) renderGodMode(lastView);
    },
    openTurnUpdates() {
      turnUpdateHasNew = false;
      showTurnUpdateDialog();
    },
    openProductionForCity(cityId) {
      if (!lastState) return;
      prodCityId = cityId;
      productionOpen = true;
      closeSideSheets();
      menuOpen = false;
      renderMenu(lastState);
      renderProduction(lastState);
    },
    setAbilityAtlas(atlas) {
      abilityAtlas = atlas;
    },
    setTileTip(tip) {
      if (!tip) {
        tileTip.classList.add("hidden");
        return;
      }
      tileTip.classList.remove("hidden");
      const rough =
        tip.rough === null
          ? ""
          : tip.rough
            ? ` · <span class="tt-rough">Rough</span>`
            : ` · <span class="tt-open">Open</span>`;
      tileTip.innerHTML = `<b>${tip.name}</b>${rough}`;
    },
    banner(text) {
      showBanner(text);
    },
  };
}
