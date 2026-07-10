import { ASSET_BASE_URL, assetUrl } from "./asset-base";
import { renderTechTreeInto } from "./techtree";
import { createWiki } from "./wiki";
import { createEmpire, type Tab as EmpireTab } from "./empire";
import { createDiplomacy } from "./diplomacy";
import { gameHud, initGameHud } from "./hud-root";
import { setPreservedHtml, withPreservedScroll } from "./panel-scroll";
import type { DealItem } from "@roc/sim";
import type { SaveRecord } from "./save-db";
import type { CheatAction } from "./god-mode";
import { getSettings, updateSettings, type TurnUpdateView } from "./settings";
import {
  bindScreenRotationControls,
  screenRotationControlsHtml,
  shouldOfferScreenRotation,
} from "./screen-rotation-ui";
import { selectTurnUpdates } from "./turn-update-batch";
import {
  researchableGovernmentsFor,
  switchableGovernments,
  adoptableCivics,
  slottableCivics,
  civicSlotCapacity,
  availableProduction,
  availablePromotions,
  availableTechs,
  getCivic,
  scaledCivicCost,
  scaledGovernmentCost,
  scaledTechCost,
  getGovernment,
  governmentTier,
  BELIEFS,
  getBelief,
  religionById,
  cityFollowerCount,
  majorityFollowerCount,
  majorityReligion,
  takenPerkIds,
  availablePerks,
  pendingPerkPicks,
  canUpgradeReligion,
  nextTierRequirement,
  religionUnitKit,
  MAX_RELIGION_TIER,
  MOVE_HOLY_CITY_COST,
  religiousUnitCost,
  victoryProgress,
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
  tradeRoutesOf,
  tradeRoutesAtTile,
  areEnemies,
  playerById,
  isMilitary,
  plunderValue,
  SPECIALIST_DEFS,
  availableSpecialists,
  specialistLabour,
  workerSlots,
  nextTierAt,
  workName,
  isDefenseKind,
  improvementYields,
  roadMoveCost,
  workLabourPerTurn,
  workEtaTurns,
  wonderCraftFull,
  wonderCrewNeeded,
  wonderStartCost,
  assignedSpecialistIds,
  specialistNameForDiscipline,
  canStartWork,
  canStartWonder,
  rushCurrencies,
  cityRushCost,
  workRushCost,
  rushSurcharge,
  type RushCurrency,
  worksOfCity,
  citiesOf,
  unitsOf,
  cityDefenseStrength,
  cityBombardTargets,
  cityMaxHp,
  foodToGrow,
  cityFoodGrowth,
  cityGrowthMultiplier,
  cityAmenities,
  cityUnhappiness,
  unitMaxHp,
  unitUpkeep,
  militaryUpkeepTotal,
  scoutEscapeChance,
  unitXpForNextLevel,
  civCombatBonus,
  unitMovement,
  getCiv,
  getCityYields,
  cityDisplayYields,
  territorySize,
  BUILDING_DEFS,
  TRAINING_BUILDING_DEFS,
  trainingTier,
  trainingClassFor,
  availableTraining,
  canStartTraining,
  trainingTimeInCity,
  trainSlots,
  freeCitizens,
  trainingRushCost,
  getBuildingDef,
  getProjectDef,
  uniqueImprovementForCiv,
  IMPROVEMENT_DEFS,
  PROMOTION_DEFS,
  PROMOTION_POOL,
  TECH_DEFS,
  UNIT_DEFS,
  buildingInfo,
  techUnlocks,
  unitInfo,
  tileYieldReport,
  resourceActive,
  RESOURCE_DEFS,
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
  greatPersonThreshold,
  nextAvailableFigure,
  playerGreatPersonPerTurn,
  previewGreatPersonEffect,
  scoreBreakdown,
  availableLegends,
  availableLegendsForPlayer,
  canRecruitLegend,
  legendRecruitCostFor,
  legendRecruitThreshold,
  legendTrackEarnedOf,
  legendTrackFor,
  legendTrackPointsOf,
  LEGEND_TRACKS,
  LEGEND_TRACK_LABELS,
  legendBaseName,
  LEGEND_DEFAULT_LIFESPAN,
  legendLifeExtensions,
  eraGateLabel,
  eraUnlocked,
  playerGameEra,
  findSpecialist,
  UNIT_UPGRADES,
  unitUpgradeCost,
  tileOwnerId,
  unitActiveAbilityIds,
  boardableShips,
  cargoOnShip,
  shipCargoLabel,
  disembarkTargets,
  isNavalUnit,
  type City,
  type CityAutoFocus,
  type Discipline,
  type Work,
  type SpecialistId,
  type GameState,
  type ImprovementKind,
  type LogEntry,
  type ProductionItem,
  type FeatureRewardType,
  type ActiveAbilityId,
  uniqueUnitForCiv,
  getLeaderAbilityForCiv,
  leaderAbilityUnlocked,
  leaderAbilityCooldownRemaining,
  leaderAbilityUnlockLabel,
  type PromotionId,
  type TechId,
  type Unit,
  type UnitTypeId,
  type TrainingClass,
  type TurnUpdateEvent,
  mapTypeDisplay,
} from "@roc/sim";
import type { Tile } from "@roc/shared";
import {
  getNaturalWonder,
  WONDER_DEFS,
  getWonder,
  getGreatPerson,
  GREAT_PERSON_CLASSES,
  GREAT_PERSON_CLASS_INFO,
  getLegend,
  RELIGIONS,
  getReligionByName,
  getReligionKit,
  greatPeopleOfClass,
  type GreatPersonClass,
} from "@roc/data";
import { abilityIconHtml, type AbilityAtlas } from "./ability-assets";
import { abandonActiveSession } from "./analytics";

function stateMapLabel(state: GameState): string {
  if (!state.map.mapType) return "";
  return mapTypeDisplay(state.map.mapTypeRequested, state.map.mapType);
}

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
  yields: ReturnType<typeof tileYieldReport>["yields"];
  lines: TileLine[];
}

/** Format a trait's per-tile yield delta as "+1 🪙 −1 🍞", icons only for non-zero fields. */
function formatYieldDelta(d: { food: number; production: number; gold: number; science: number; faith: number }): string {
  const seg: string[] = [];
  const add = (icon: string, n: number) => { if (n) seg.push(`${n > 0 ? "+" : "−"}${Math.abs(n)} ${icon}`); };
  add("🍞", d.food); add("⚒️", d.production); add("🪙", d.gold); add("🔬", d.science); add("🙏", d.faith);
  return seg.join(" ");
}

/** Build the human-readable benefits/deficits breakdown for a tile. */
function tileReport(state: GameState, tile: Tile, viewerId = -1): TileReport {
  const t = tile.terrain;
  // Owner-aware worked yields plus a per-trait attribution: for a claimed tile the
  // headline is what a citizen actually reaps and the sources are the owner's traits;
  // for an unclaimed tile the headline is the perk-blind base and the sources preview
  // what the viewer's own traits would add once it's worked.
  const report = tileYieldReport(state, tile.col, tile.row, viewerId);
  const y = report.yields;
  const water = isWaterTerrain(t);
  const passable = isPassableLand(t);
  const rough = isRough(t);
  const def = terrainDefense(t);
  const wonder = getNaturalWonder(tile.naturalWonder);

  let name = TERRAIN_NAMES[t];
  if (wonder) name = `${wonder.name} ✦`;
  else if (tile.feature === "village") name = `${TERRAIN_NAMES[t]} · Village`;
  else if (tile.feature === "barb_camp") name = `${TERRAIN_NAMES[t]} · Barbarian Camp`;
  else if (tile.feature === "ruin") name = `${TERRAIN_NAMES[t]} · Ruins`;
  else if (tile.riverLake) name = `${TERRAIN_NAMES[t]} · River Lake`;
  else if (tile.river) name = `${TERRAIN_NAMES[t]} · River`;

  let subtitle: string;
  if (water) subtitle = "Water · naval units only";
  else if (!passable) subtitle = "Impassable to land units";
  else if (tile.road) subtitle = `${workName("road", tile.roadLevel ?? 1)} · ${roadMoveCost(tile.roadLevel ?? 1)} move to enter`;
  else if (rough) subtitle = `Rough · ${moveCost(t)} moves to enter`;
  else subtitle = "Open · 1 move to enter";

  const lines: TileLine[] = [];
  if (y.food) lines.push({ kind: "good", text: `+${y.food} food${y.food >= 2 ? " — quick city growth" : ""}` });
  if (y.production) lines.push({ kind: "good", text: `+${y.production} production` });
  if (y.gold) lines.push({ kind: "good", text: `+${y.gold} gold` });
  if (y.science) lines.push({ kind: "good", text: `+${y.science} science` });
  if (y.faith) lines.push({ kind: "good", text: `+${y.faith} faith` });
  if (y.culture) lines.push({ kind: "good", text: `+${y.culture} culture` });
  // Named trait attribution: which perk contributes what to this tile's yields.
  if (report.sources.length) {
    if (report.preview) lines.push({ kind: "neutral", text: "Once part of your empire, your traits add:" });
    for (const s of report.sources) {
      const net = s.delta.food + s.delta.production + s.delta.gold + s.delta.science + s.delta.faith;
      lines.push({ kind: net < 0 ? "bad" : "good", text: `${s.label}: ${formatYieldDelta(s.delta)}` });
    }
  }
  if (def > 0) lines.push({ kind: "good", text: `+${def} combat defense for units standing here` });
  if (tile.improvement) {
    const imp = IMPROVEMENT_DEFS[tile.improvement as ImprovementKind]?.name ?? tile.improvement;
    lines.push({ kind: "good", text: `${imp} improvement boosts its yields` });
  }
  if (tile.road) {
    const lvl = tile.roadLevel ?? 1;
    lines.push({
      kind: "good",
      text: `${workName("road", lvl)} — units spend only ${roadMoveCost(lvl)} of a move to cross (vs 1 on open ground)`,
    });
  }
  if (tile.river) {
    lines.push({ kind: "good", text: tile.riverLake ? "River lake — fresh water (+1 food, +1 science)" : "River — fresh water (+1 food)" });
    lines.push({ kind: "good", text: "Attackers assaulting across the river fight at -25%" });
    lines.push({ kind: "bad", text: "Crossing the river costs +1 movement" });
  }
  if (tile.resource) {
    const rdef = RESOURCE_DEFS[tile.resource as keyof typeof RESOURCE_DEFS];
    const rname = rdef?.name ?? tile.resource;
    lines.push({ kind: "good", text: `Resource: ${rname}` });
    if (!resourceActive(tile, state)) {
      const needed = rdef ? workName(rdef.improvement, 1) : "improvement";
      lines.push({ kind: "bad", text: `Needs a ${needed} to activate` });
    }
  }
  if (wonder) {
    const claimed = state.discoveredWonders?.[wonder.id];
    lines.push({ kind: "good", text: `Natural Wonder — ${wonder.desc}` });
    if (claimed === undefined) {
      lines.push({ kind: "good", text: "Undiscovered — first to sight it claims a one-time bonus" });
    } else {
      const owner = state.players.find((p) => p.id === claimed);
      lines.push({ kind: "neutral", text: `Discovered by ${owner?.name ?? "another civ"}` });
    }
    lines.push({ kind: "good", text: "Worked by a citizen, this tile yields bonus output" });
  }
  if (tile.feature === "village") lines.push({ kind: "good", text: "Village — a reward when one of your units enters" });
  if (tile.feature === "ruin") lines.push({ kind: "neutral", text: "Ruins of a fallen city — fades over time, or build a new city here" });

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
  /** True while God Mode's "Lift Fog of War" reveal is active. */
  liftFog?: boolean;
}

export interface UIHandlers {
  onEndTurn(): void;
  onFoundCity(): void;
  onPromote(promotion: PromotionId): void;
  /** Upgrade a unit to its next type (gold cost, loses turn, must be on own territory). */
  onUpgradeUnit(): void;
  /** Invoke an active ability. The controller decides whether it needs a target. */
  onAbility(ability: ActiveAbilityId): void;
  onSleep(): void;
  onWake(): void;
  /** Board an adjacent friendly warship (passenger must be selected). */
  onBoardShip(shipId: number): void;
  /** Leave a ship onto the nearest available shore tile. */
  onDisembarkFromShip(passengerId: number): void;
  onConvertCitizen(cityId: number, specialistId: string, delta: number): void;
  /** Toggle a city's governor mode (auto-manage toward a focus); null = manual. */
  onSetCityAutoMode(cityId: number, mode: CityAutoFocus | null): void;
  /** Enter the picker to choose which tile the city claims next as it grows. */
  onPickExpandTile(cityId: number): void;
  /** Enter the aimer to fire the city's once-a-turn bombardment at a nearby enemy. */
  onCityBombard(cityId: number): void;
  onStartWork(kind: string, col: number, row: number): void;
  /** Begin a multi-tile road route from this tile (player taps the destination next). */
  onStartRoadRoute(col: number, row: number): void;
  onStartWonder(wonderId: string, col: number, row: number): void;
  onCancelWork(workId: number): void;
  /** Close an existing trade route — the trader that opened it is lost. */
  onCancelTradeRoute(routeId: number): void;
  onAssignTradeEscort(unitId: number, routeId: number): void;
  onLeaveTradeEscort(routeId: number): void;
  onPlunderTradeRoute(unitId: number, routeId: number): void;
  /** Spend a stockpiled resource to instantly finish a city's production. */
  onRushProduction(cityId: number, currency: RushCurrency): void;
  /** Spend a stockpiled resource to instantly finish a tile/defensive work. */
  onRushWork(workId: number, currency: RushCurrency): void;
  /** Pin (on) or release (off) one of the player's specialists to/from a work. */
  onAssignSpecialist(workId: number, specialistId: number, on: boolean): void;
  onSelectUnit(unitId: number): void;
  onSelectCity(cityId: number): void;
  onDeclareWar(targetId: number): void;
  onMakePeace(targetId: number): void;
  onDenounce(targetId: number): void;
  onGift(targetId: number, gold: number): void;
  onDemandTribute(targetId: number, gold: number): void;
  onProposeDeal(targetId: number, give: DealItem[], want: DealItem[]): void;
  onCancelSharedVision(targetId: number): void;
  onRespondProposal(proposalId: number, accept: boolean): void;
  onFinalizeDeal(proposalId: number, confirm: boolean): void;
  onAcknowledgeContact(otherId: number): void;
  onSetProduction(item: ProductionItem): void;
  onStartTraining(cityId: number, unit: UnitTypeId): void;
  onCancelTraining(cityId: number, orderId: number): void;
  onRushTraining(cityId: number, orderId: number, currency: RushCurrency): void;
  onSetResearch(techId: TechId): void;
  onSetResearchTarget(techId: TechId): void;
  onResearchGovernment(governmentId: string): void;
  onSetGovernment(governmentId: string): void;
  onAdoptCivic(civicId: string): void;
  onSlotCivic(civicId: string): void;
  onUnslotCivic(civicId: string): void;
  onFoundReligion(cityId: number, name: string, beliefs: string[]): void;
  /** Raise the player's founded religion one tier (faith + follower-city gated). */
  onUpgradeReligion(): void;
  /** Spend an unspent perk pick on a belief from the shared pool. */
  onPickReligionPerk(perkId: string): void;
  /** Move the religion's holy capital to another follower city (costs faith). */
  onMoveHolyCity(cityId: number): void;
  onBuyReligiousUnit(cityId: number, unit: "missionary" | "apostle" | "inquisitor"): void;
  onEvangelize(unitId: number, cityId: number): void;
  onPurgeHeresy(unitId: number, cityId: number): void;
  onBoardTradeRoute(unitId: number, routeId: number): void;
  onActivateGreatPerson(greatPersonId: string): void;
  onRecruitLegend(legendId: string): void;
  /** Fire the civ's active leader ability (cooldown/unlock gated server-side). */
  onUseLeaderAbility(): void;
  onEstablishTrade(destCityId: number): void;
  onBribeBarbarian(unitId: number): void;
  onRecruitBarbarian(unitId: number): void;
  onCloseCity(): void;
  onCloseTile(): void;
  onSuggestion(): void;
  onSave(name: string): Promise<void>;
  onExportCurrentSave(): Promise<string>;
  /** Registered players can persist single-player saves; guests cannot. */
  canSave: boolean;
  /** Single-player registered users are prompted to save when leaving. */
  promptSaveOnLeave: boolean;
  /** Called after the player confirms leaving (optionally after saving). */
  onLeaveGame(): void;
  /**
   * Submit a bug report with the player's description. The handler captures the
   * game state/context. Resolves `true` if sent now, `false` if queued offline.
   */
  onReportBug(message: string): Promise<boolean>;
  onMenuOpen(): void;
  onLoadMpSave(blob: string): Promise<void>;
  onCheat(action: CheatAction): void;
  /** Toggle God Mode's render-only "Lift Fog of War" reveal. */
  onToggleLiftFog(enabled: boolean): void;
  /** Set the empire's military-pay level (percent of base upkeep, −100…+200). */
  onSetUpkeepModifier(pct: number): void;
  onTurnUpdateLocate(tile: { col: number; row: number }): void;
  onTurnUpdateOpenProduction(cityId: number): void;
  onTurnUpdateOpenResearch(): void;
  onTurnUpdateOpenCivics(): void;
  onTurnUpdateOpenGreatPeople(): void;
  onTurnUpdateOpenLegends(): void;
  onTurnUpdateOpenGold(): void;
  onTurnUpdateDismiss(): void;
}

export interface UI {
  render(view: UIView): void;
  banner(text: string): void;
  openResearch(): void;
  openCivics(): void;
  openReligion(): void;
  openGreatPeople(): void;
  openLegends(): void;
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
  gameHud().appendChild(el);
  return el;
}

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

/** Civilization name for a player id, falling back to the player's own name. */
function civNameForPlayer(state: GameState, playerId: number): string {
  const p = state.players.find((x) => x.id === playerId);
  return getCiv(p?.civId)?.name ?? p?.name ?? "Unknown";
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
  if (item.kind === "project") return 0; // projects never complete
  if (item.kind === "trainingBuilding") return trainingTier(item.family, item.tier).cost;
  return getBuildingDef(item.id)?.cost ?? 0;
}

function prodName(item: ProductionItem, _civId?: string): string {
  if (item.kind === "project") return getProjectDef(item.id)?.name ?? item.id;
  if (item.kind === "trainingBuilding") {
    const name = TRAINING_BUILDING_DEFS[item.family].name;
    return item.tier <= 1 ? name : `${name} (Tier ${item.tier})`;
  }
  return getBuildingDef(item.id)?.name ?? item.id;
}

/** Inline icon for a unit-training building family, falling back to its emoji glyph
 *  if the art is missing (onerror swaps the <img> for the glyph text). */
function trainingIconImg(family: TrainingClass, glyph: string, px = 28): string {
  return (
    `<img src="${ASSET_BASE_URL}buildings/${family}.png" alt="" ` +
    `style="width:${px}px;height:${px}px;object-fit:contain;vertical-align:middle" ` +
    `onerror="this.replaceWith(document.createTextNode('${glyph}'))" />`
  );
}

/** Trade-route destination buttons for a trader standing in a city. */
function tradeRouteChoicesHtml(state: GameState, trader: Unit, origin: City, dests: City[], onlyMineId?: string): string {
  const destBtn = (c: City): string => {
    const international = c.ownerId !== trader.ownerId;
    const y = tradeRouteYield(state, {
      id: 0,
      ownerId: trader.ownerId,
      fromCityId: origin.id,
      toCityId: c.id,
      toOwnerId: c.ownerId,
      international,
      path: [],
    });
    const extra =
      (y.food ? ` +${y.food}🍞` : "") +
      (y.production ? ` +${y.production}⚒️` : "") +
      (y.science ? ` +${y.science}🔬` : "") +
      (y.culture ? ` +${y.culture}🎭` : "");
    const civTag = international
      ? ` <span class="sub" style="color:#c9a24a">🤝 ${escapeHtml(civNameForPlayer(state, c.ownerId))}</span>`
      : "";
    return (
      `<button class="btn" data-trade-dest="${c.id}" style="text-align:left;display:flex;justify-content:space-between;gap:8px">` +
      `<span><b style="color:#fff">${escapeHtml(c.name)}</b>${civTag}</span>` +
      `<span class="sub">+${y.gold}🪙${extra}</span></button>`
    );
  };
  const own = dests.filter((c) => c.ownerId === trader.ownerId);
  const foreign = dests.filter((c) => c.ownerId !== trader.ownerId);
  let html = `<div class="csub">🐪 Trade route from ${escapeHtml(origin.name)}</div>`;
  if (foreign.length > 0) {
    html +=
      `<label style="display:flex;align-items:center;gap:6px;margin-top:4px;font-size:12px;color:#9fc3e0;cursor:pointer">` +
      `<input type="checkbox" id="${onlyMineId ?? "trade-only-mine"}"> Only my cities</label>`;
  }
  if (own.length > 0) {
    html += `<div class="sub" style="margin-top:6px;color:#8fce8f">🏠 Your cities</div>`;
    html += `<div style="display:flex;flex-direction:column;gap:6px;margin-top:4px">${own.map(destBtn).join("")}</div>`;
  }
  if (foreign.length > 0) {
    html += `<div class="sub" data-foreign-group style="margin-top:8px;color:#c9a24a">🤝 Allied cities</div>`;
    html += `<div data-foreign-group style="display:flex;flex-direction:column;gap:6px;margin-top:4px">${foreign.map(destBtn).join("")}</div>`;
  }
  return html;
}

/** Sticky title row shared by city sub-dialogs (construction, training, specialists). */
function dialogHeader(title: string, closeId: string, opts?: { subtitle?: string; extra?: string }): string {
  return (
    `<div class="panel-dialog-header">` +
    `<div class="row" style="justify-content:space-between;align-items:flex-start">` +
    `<b>${title}</b><button type="button" class="btn panel-close" id="${closeId}">✕</button></div>` +
    (opts?.subtitle ? `<div class="sub" style="margin-top:4px">${opts.subtitle}</div>` : "") +
    (opts?.extra ?? "") +
    `</div>`
  );
}

const RUSH_GLYPH: Record<RushCurrency, string> = { gold: "🪙", faith: "☮️", culture: "🎭" };

/** The viewer's stockpile for a rush currency. */
function rushPool(player: { gold: number; faith: number; cultureProgress: number }, c: RushCurrency): number {
  return c === "gold" ? player.gold : c === "faith" ? player.faith : player.cultureProgress;
}

/** Build the "Rush" button row for a city build or a work. `dataKey`/`id` identify
 *  the target; `costFor` returns the resource cost per currency (null = not rushable).
 *  Each currency the viewer can use shows a ⚡ button, disabled when the pool is short. */
function rushButtonsHtml(
  state: GameState,
  viewerId: number,
  dataKey: "rush-prod" | "rush-work",
  id: number,
  costFor: (currency: RushCurrency, surcharge: number) => number | null,
  compact = false,
): string {
  const player = state.players.find((p) => p.id === viewerId);
  if (!player) return "";
  const surcharge = rushSurcharge(player, state.turn);
  const btns = rushCurrencies(state, viewerId)
    .map((cur) => {
      const cost = costFor(cur, surcharge);
      if (cost === null) return "";
      const can = rushPool(player, cur) >= cost;
      const dis = can ? "" : ` disabled style="opacity:.5;cursor:not-allowed" title="Need ${cost} ${cur}"`;
      const cls = compact ? "btn rush-mini" : "btn";
      return `<button class="${cls}" data-${dataKey}="${id}" data-rush-cur="${cur}"${dis} title="Rush with ${cur}">⚡ ${RUSH_GLYPH[cur]} ${cost}</button>`;
    })
    .filter(Boolean);
  if (!btns.length) return "";
  // Compact form (used inline beside the build progress) drops the section header
  // and renders as a tight button cluster; the full form keeps its own "Rush" row.
  if (compact) return `<span class="rush-inline">${btns.join("")}</span>`;
  return `<div class="csub">Rush</div><div class="row" style="flex-wrap:wrap;gap:6px">${btns.join("")}</div>`;
}

/** Governor-mode options offered on the city panel (null = manual/off). */
const GOVERNOR_MODES: { mode: CityAutoFocus | null; icon: string; label: string; title: string }[] = [
  { mode: null, icon: "🖐️", label: "Manual", title: "Manage this city yourself" },
  { mode: "growth", icon: "🌾", label: "Growth", title: "Auto-manage toward population growth" },
  { mode: "military", icon: "⚔️", label: "Military", title: "Auto-manage toward training soldiers" },
  { mode: "science", icon: "🔬", label: "Science", title: "Auto-manage toward science output" },
  { mode: "money", icon: "🪙", label: "Money", title: "Auto-manage toward gold income" },
];

/** One-line summary of what a governed city is currently doing, per focus. */
const GOVERNOR_NOTE: Record<CityAutoFocus, string> = {
  growth: "Auto: favouring food tiles & growth buildings, plus works & specialists.",
  military: "Auto: training troops, war buildings & tiles, plus works & specialists.",
  science: "Auto: favouring science tiles & buildings, plus works & specialists.",
  money: "Auto: favouring gold tiles & buildings, plus works & specialists.",
};

/** Full promotion catalog + earned perks for the unit promotion info dialog. */
function unitPromotionDialogHtml(unit: Unit, displayName: string): string {
  const pool = PROMOTION_POOL[UNIT_DEFS[unit.type].cls];
  const maxTier = Math.max(1, unit.level - 1);
  const levelStars = unit.level > 1 ? ` <span style="color:#ffd967">${"★".repeat(unit.level - 1)}</span>` : "";
  let html =
    `<div class="unit-perk-summary">` +
    `<div><b>${escapeHtml(displayName)}</b>${levelStars}</div>` +
    `<div class="sub">Level <b>${unit.level}</b> · XP <b>${unit.xp}/${unitXpForNextLevel(unit.level)}</b>`;
  if (unit.unspentPromotions > 0) {
    html +=
      ` · <b style="color:#ffd967">${unit.unspentPromotions} promotion pick${unit.unspentPromotions === 1 ? "" : "s"} waiting</b>`;
  }
  html += `</div></div>`;

  if (unit.promotions.length) {
    html += `<div class="unit-perk-section"><div class="unit-perk-section-title">Earned</div>`;
    for (const p of unit.promotions) {
      const def = PROMOTION_DEFS[p];
      html +=
        `<div class="unit-perk-row taken">` +
        `<div class="unit-perk-row-head"><b>${escapeHtml(def.name)}</b> <span class="unit-perk-tier">${"★".repeat(def.tier)}</span></div>` +
        `<div class="unit-perk-desc">${escapeHtml(def.desc)}</div></div>`;
    }
    html += `</div>`;
  }

  html +=
    `<div class="unit-perk-section"><div class="unit-perk-section-title">Perk catalog</div>` +
    `<p class="sub" style="margin:0 0 10px">Each level-up grants one pick from unlocked tiers (★ at level 2, ★★ at 3, ★★★ at 4+).</p>`;

  for (const tier of [1, 2, 3] as const) {
    const tierPromos = pool.filter((p) => PROMOTION_DEFS[p].tier === tier);
    if (!tierPromos.length) continue;
    const levelReq = tier + 1;
    html +=
      `<div class="unit-perk-tier-block">` +
      `<div class="unit-perk-tier-head">Level ${levelReq}+ · <span class="unit-perk-tier">${"★".repeat(tier)}</span></div>`;
    for (const p of tierPromos) {
      const def = PROMOTION_DEFS[p];
      const taken = unit.promotions.includes(p);
      const tierLocked = def.tier > maxTier;
      const prereqLocked = def.prereq !== undefined && !unit.promotions.includes(def.prereq);
      let status = "";
      let rowClass = "unit-perk-row";
      if (taken) {
        status = `<span class="unit-perk-status earned">Earned</span>`;
        rowClass += " taken";
      } else if (tierLocked) {
        status = `<span class="unit-perk-status locked">Needs level ${levelReq}</span>`;
        rowClass += " locked";
      } else if (prereqLocked) {
        status = `<span class="unit-perk-status locked">Needs ${escapeHtml(PROMOTION_DEFS[def.prereq!].name)}</span>`;
        rowClass += " locked";
      } else if (unit.unspentPromotions > 0 && availablePromotions(unit).includes(p)) {
        status = `<span class="unit-perk-status available">Available now</span>`;
        rowClass += " available";
      }
      html +=
        `<div class="${rowClass}">` +
        `<div class="unit-perk-row-head"><b>${escapeHtml(def.name)}</b> <span class="unit-perk-tier">${"★".repeat(def.tier)}</span>${status}</div>` +
        `<div class="unit-perk-desc">${escapeHtml(def.desc)}</div></div>`;
    }
    html += `</div>`;
  }
  html += `</div>`;
  return html;
}

export function createUI(handlers: UIHandlers): UI {
  initGameHud();
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
  const greatPeoplePanel = div("great-people", "panel hidden");
  const legendsPanel = div("legends", "panel hidden");
  const production = div("production", "panel hidden");
  const specialists = div("specialists", "panel hidden");
  const training = div("training", "panel hidden");
  const log = div("log", "");
  const bannerEl = div("banner", "");
  const gameover = div("gameover", "hidden");
  const saveModal = div("save-modal", "panel hidden");
  const godPanel = div("god-panel", "panel hidden");
  const wiki = createWiki();
  /** Markup for a compact "view in Encyclopedia" button, encoding its target. */
  const wikiBtn = (nav: string, label = "📖"): string =>
    `<button class="btn wiki-jump" data-wiki-open="${nav}" title="View in Encyclopedia" ` +
    `style="padding:3px 7px;font-size:12px;flex:0 0 auto;line-height:1.2">${label}</button>`;
  /** Wire every [data-wiki-open] button inside `root` to deep-link into the wiki. */
  const wireWikiButtons = (root: HTMLElement): void => {
    root.querySelectorAll<HTMLButtonElement>("[data-wiki-open]").forEach((el) =>
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const raw = el.dataset.wikiOpen!;
        const i = raw.indexOf(":");
        wiki.openDetail(raw.slice(0, i) as Parameters<typeof wiki.openDetail>[0], raw.slice(i + 1));
      }),
    );
  };
  const villageOverlay = div("village-overlay", "");
  const villageDialog = div("village-dialog", "");
  villageDialog.innerHTML =
    `<button type="button" class="dialog-x" id="village-close" title="Close" aria-label="Close">✕</button>` +
    `<img class="village-art" id="village-art" src="" alt="" />` +
    `<div class="village-title" id="village-title">Village Discovered</div>` +
    `<div class="village-msg" id="village-msg"></div>` +
    `<button class="btn primary" id="village-ok">OK</button>`;
  const villageArt = villageDialog.querySelector<HTMLImageElement>("#village-art")!;
  const villageTitle = villageDialog.querySelector<HTMLDivElement>("#village-title")!;
  const villageMsg = villageDialog.querySelector<HTMLDivElement>("#village-msg")!;
  const villageOk = villageDialog.querySelector<HTMLButtonElement>("#village-ok")!;

  // Great-person activation confirmation: explains exactly what activating a
  // recruited figure will do before the (one-shot, irreversible) commitment.
  const gpActivateOverlay = div("gp-activate-overlay", "");
  const gpActivateDialog = div("gp-activate-dialog", "");
  gpActivateDialog.innerHTML =
    `<button type="button" class="dialog-x" id="gp-activate-x" title="Close" aria-label="Close">✕</button>` +
    `<img class="gp-activate-art" id="gp-activate-art" src="" alt="" />` +
    `<div class="gp-activate-title" id="gp-activate-title"></div>` +
    `<div class="gp-activate-sub" id="gp-activate-sub"></div>` +
    `<div class="gp-activate-msg" id="gp-activate-msg"></div>` +
    `<div class="gp-activate-actions">` +
    `<button class="btn" id="gp-activate-cancel">Cancel</button>` +
    `<button class="btn primary" id="gp-activate-confirm">Activate</button></div>`;
  const gpActivateArt = gpActivateDialog.querySelector<HTMLImageElement>("#gp-activate-art")!;
  const gpActivateTitle = gpActivateDialog.querySelector<HTMLDivElement>("#gp-activate-title")!;
  const gpActivateSub = gpActivateDialog.querySelector<HTMLDivElement>("#gp-activate-sub")!;
  const gpActivateMsg = gpActivateDialog.querySelector<HTMLDivElement>("#gp-activate-msg")!;
  const gpActivateCancel = gpActivateDialog.querySelector<HTMLButtonElement>("#gp-activate-cancel")!;
  const gpActivateConfirm = gpActivateDialog.querySelector<HTMLButtonElement>("#gp-activate-confirm")!;
  gpActivateArt.onerror = () => {
    gpActivateArt.style.display = "none";
  };
  let pendingGreatPersonId: string | null = null;
  const hideGreatPersonActivate = (): void => {
    pendingGreatPersonId = null;
    gpActivateOverlay.classList.remove("show");
    gpActivateDialog.classList.remove("show");
  };
  const showGreatPersonActivate = (state: GameState, id: string): void => {
    const def = getGreatPerson(id);
    if (!def) return;
    const player = state.players[state.currentPlayerIndex]!;
    const preview = previewGreatPersonEffect(state, player, def);
    const info = GREAT_PERSON_CLASS_INFO[def.cls];
    pendingGreatPersonId = id;
    gpActivateArt.style.display = "";
    gpActivateArt.src = `${ASSET_BASE_URL}great-people/${def.id}.png`;
    gpActivateTitle.textContent = `${info.glyph} ${def.name}`;
    gpActivateSub.textContent = `${info.name} · ${def.era} era`;
    gpActivateMsg.innerHTML =
      `<div class="gp-activate-effect">${escapeHtml(preview.detail)}</div>` +
      `<div class="gp-activate-note">${escapeHtml(def.desc)}</div>` +
      `<div class="gp-activate-warn">⚠️ A Great Person can be activated only once — they are spent for good.</div>`;
    gpActivateOverlay.classList.add("show");
    gpActivateDialog.classList.add("show");
  };
  gpActivateDialog.querySelector<HTMLButtonElement>("#gp-activate-x")!.addEventListener("click", hideGreatPersonActivate);
  gpActivateCancel.addEventListener("click", hideGreatPersonActivate);
  gpActivateConfirm.addEventListener("click", () => {
    const id = pendingGreatPersonId;
    hideGreatPersonActivate();
    if (id) handlers.onActivateGreatPerson(id);
  });

  // Leader-ability info/confirm dialog: opened from the badge on the leader
  // portrait. Always explains the ability; the Use button is enabled only when
  // the ability is unlocked and off cooldown.
  const leaderAbilityOverlay = div("leader-ability-overlay", "");
  const leaderAbilityDialog = div("leader-ability-dialog", "");
  leaderAbilityDialog.innerHTML =
    `<button type="button" class="dialog-x" id="la-dialog-x" title="Close" aria-label="Close">✕</button>` +
    `<img class="la-dialog-art" id="la-dialog-art" src="" alt="" />` +
    `<div class="la-dialog-title" id="la-dialog-title"></div>` +
    `<div class="la-dialog-sub" id="la-dialog-sub"></div>` +
    `<div class="la-dialog-msg" id="la-dialog-msg"></div>` +
    `<div class="la-dialog-actions">` +
    `<button class="btn" id="la-dialog-cancel">Cancel</button>` +
    `<button class="btn primary" id="la-dialog-confirm">Use ability</button></div>`;
  const laDialogArt = leaderAbilityDialog.querySelector<HTMLImageElement>("#la-dialog-art")!;
  const laDialogTitle = leaderAbilityDialog.querySelector<HTMLDivElement>("#la-dialog-title")!;
  const laDialogSub = leaderAbilityDialog.querySelector<HTMLDivElement>("#la-dialog-sub")!;
  const laDialogMsg = leaderAbilityDialog.querySelector<HTMLDivElement>("#la-dialog-msg")!;
  const laDialogCancel = leaderAbilityDialog.querySelector<HTMLButtonElement>("#la-dialog-cancel")!;
  const laDialogConfirm = leaderAbilityDialog.querySelector<HTMLButtonElement>("#la-dialog-confirm")!;
  laDialogArt.onerror = () => {
    laDialogArt.style.display = "none";
  };
  const hideLeaderAbility = (): void => {
    leaderAbilityOverlay.classList.remove("show");
    leaderAbilityDialog.classList.remove("show");
  };
  const showLeaderAbility = (state: GameState): void => {
    const player = state.players[state.currentPlayerIndex]!;
    const def = getLeaderAbilityForCiv(player.civId ?? "");
    if (!def) return;
    const civ = getCiv(player.civId);
    const unlocked = leaderAbilityUnlocked(state, player, def);
    const cooldown = leaderAbilityCooldownRemaining(state, player, def);
    const ready = unlocked && cooldown === 0;
    laDialogArt.style.display = "";
    laDialogArt.src = civ ? `${ASSET_BASE_URL}leaders/${civ.id}.png` : "";
    laDialogTitle.textContent = `✦ ${def.name}`;
    laDialogSub.textContent = civ ? `${civ.name} · Leader Ability` : "Leader Ability";
    const status = ready
      ? `<div class="la-dialog-ready">✓ Ready to use.</div>`
      : !unlocked
        ? `<div class="la-dialog-lock">🔒 Unlocks with ${escapeHtml(leaderAbilityUnlockLabel(def))}.</div>`
        : `<div class="la-dialog-lock">⏳ On cooldown — ${cooldown} turn${cooldown > 1 ? "s" : ""} remaining.</div>`;
    laDialogMsg.innerHTML =
      `<div class="la-dialog-effect">${escapeHtml(def.desc)}</div>` +
      `<div class="la-dialog-foot">${def.cooldown}-turn cooldown</div>` +
      status;
    laDialogConfirm.disabled = !ready;
    laDialogConfirm.textContent = ready ? "Use ability" : !unlocked ? "Locked" : "On cooldown";
    leaderAbilityOverlay.classList.add("show");
    leaderAbilityDialog.classList.add("show");
  };
  leaderAbilityDialog.querySelector<HTMLButtonElement>("#la-dialog-x")!.addEventListener("click", hideLeaderAbility);
  laDialogCancel.addEventListener("click", hideLeaderAbility);
  laDialogConfirm.addEventListener("click", () => {
    if (laDialogConfirm.disabled) return;
    hideLeaderAbility();
    handlers.onUseLeaderAbility();
  });

  const logOverlay = div("log-overlay", "");
  const logDialog = div("log-dialog", "");
  logDialog.innerHTML =
    `<button type="button" class="dialog-x" id="log-close" title="Close" aria-label="Close">✕</button>` +
    `<div class="log-dialog-title">Game Log</div>` +
    `<div class="log-dialog-content" id="log-dialog-content"></div>`;
  const logDialogContent = logDialog.querySelector<HTMLDivElement>("#log-dialog-content")!;
  const logClose = logDialog.querySelector<HTMLButtonElement>("#log-close")!;
  const hideLogDialog = (): void => {
    logOverlay.classList.remove("show");
    logDialog.classList.remove("show");
  };
  logClose.addEventListener("click", hideLogDialog);

  const leaderboardOverlay = div("leaderboard-overlay", "");
  const leaderboardDialog = div("leaderboard-dialog", "");
  leaderboardDialog.innerHTML =
    `<button type="button" class="dialog-x" id="leaderboard-close" title="Close" aria-label="Close">✕</button>` +
    `<div class="log-dialog-title">Civilization Standings</div>` +
    `<div id="leaderboard-content"></div>`;
  const leaderboardContent = leaderboardDialog.querySelector<HTMLDivElement>("#leaderboard-content")!;
  const leaderboardClose = leaderboardDialog.querySelector<HTMLButtonElement>("#leaderboard-close")!;
  const hideLeaderboard = (): void => {
    leaderboardOverlay.classList.remove("show");
    leaderboardDialog.classList.remove("show");
  };
  const showLeaderboard = (state: GameState): void => {
    const viewerId = lastViewerId >= 0 ? lastViewerId : (state.players[state.currentPlayerIndex]?.id ?? -1);
    const rows = state.players
      .filter((p) => !p.isBarbarian)
      .map((p) => {
        const breakdown = scoreBreakdown(state, p.id);
        const cities = citiesOf(state, p.id).length;
        const units = unitsOf(state, p.id).length;
        const alive = cities > 0 || units > 0;
        return { player: p, breakdown, alive };
      })
      .sort((a, b) => b.breakdown.total - a.breakdown.total);

    const body = rows
      .map((r, i) => {
        const civ = getCiv(r.player.civId);
        const label = civ ? `${escapeHtml(civ.name)}` : escapeHtml(r.player.name);
        const sub = civ ? escapeHtml(r.player.name) : r.player.isHuman ? "Human" : "AI";
        const you = r.player.id === viewerId ? ` <span class="lb-you">You</span>` : "";
        const fallen = r.alive ? "" : ` <span class="lb-fallen">Fallen</span>`;
        const b = r.breakdown;
        const detail =
          `<span title="Cities">🏛️ ${b.cities}</span>` +
          `<span title="Population">👥 ${b.population}</span>` +
          `<span title="Technology">🔬 ${b.techs}</span>` +
          `<span title="Civics">📜 ${b.civics}</span>` +
          `<span title="Units">🛡️ ${b.units}</span>` +
          `<span title="Gold">🪙 ${b.gold}</span>` +
          `<span title="Battles won">⚔️ ${b.battles}</span>` +
          `<span title="Cities conquered">🔥 ${b.conquests}</span>`;
        return (
          `<div class="lb-row${r.player.id === viewerId ? " lb-self" : ""}${r.alive ? "" : " lb-dead"}">` +
          `<div class="lb-rank">${i + 1}</div>` +
          `<div class="lb-swatch" style="background:${r.player.color}"></div>` +
          `<div class="lb-name"><b>${label}${you}${fallen}</b>${civ ? " " + wikiBtn(`civ:${r.player.civId}`) : ""}<span class="lb-sub">${sub}</span></div>` +
          `<div class="lb-detail">${detail}</div>` +
          `<div class="lb-total">${b.total}</div>` +
          `</div>`
        );
      })
      .join("");

    const turnCaption =
      state.turnLimit > 0
        ? `Turn ${state.turn} of ${state.turnLimit} · highest score wins if the turn limit is reached`
        : `Turn ${state.turn} · no turn limit — play until a decisive victory`;

    // Your standing on each enabled win condition, folded into the leaderboard so
    // players see standings and victory progress side by side in one place.
    const vic = viewerId >= 0 ? victoryProgress(state, viewerId) : [];
    const vicBody = vic
      .map((e) => {
        const m = VICTORY_META[e.kind] ?? { icon: "•", name: e.kind, color: "#cdbf9f" };
        const pct = Math.round(Math.min(1, Math.max(0, e.progress)) * 100);
        const dim = e.enabled ? "" : "opacity:0.45";
        const off = e.enabled ? ` <span class="lb-sub">(disabled)</span>` : "";
        return (
          `<div class="lb-vic-row" style="${dim}">` +
          `<div class="lb-vic-head"><b>${m.icon} ${m.name}${off}</b><span class="lb-sub">${pct}%</span></div>` +
          `<div class="bar"><i style="width:${pct}%;background:${m.color}"></i></div>` +
          `<div class="lb-sub">${escapeHtml(e.detail)}</div>` +
          `</div>`
        );
      })
      .join("");
    const vicSection = vicBody
      ? `<div class="lb-vic-title">🏆 Your Victory Progress</div><div class="lb-vic">${vicBody}</div>`
      : "";

    withPreservedScroll(leaderboardContent, () => {
      leaderboardContent.innerHTML =
        `<div class="lb-caption">${turnCaption}</div>` +
        `<div class="lb-list">${body}</div>` +
        vicSection +
        `<div class="lb-legend">🏛️ Cities · 👥 Population · 🔬 Technology · 📜 Civics · 🛡️ Units · 🪙 Gold · ⚔️ Battles won · 🔥 Cities conquered</div>`;
    });
    // The civ Encyclopedia buttons close the leaderboard so the wiki opens cleanly on top.
    leaderboardContent.querySelectorAll<HTMLButtonElement>("[data-wiki-open]").forEach((el) =>
      el.addEventListener("click", hideLeaderboard),
    );
    wireWikiButtons(leaderboardContent);
    leaderboardOverlay.classList.add("show");
    leaderboardDialog.classList.add("show");
  };
  leaderboardClose.addEventListener("click", hideLeaderboard);

  const goldOverlay = div("gold-overlay", "");
  const goldDialog = div("gold-dialog", "");
  goldDialog.innerHTML =
    `<button type="button" class="dialog-x" id="gold-close" title="Close" aria-label="Close">✕</button>` +
    `<div class="gold-dialog-title">Treasury</div>` +
    `<div id="gold-dialog-content"></div>`;
  const goldDialogContent = goldDialog.querySelector<HTMLDivElement>("#gold-dialog-content")!;
  const goldClose = goldDialog.querySelector<HTMLButtonElement>("#gold-close")!;
  let goldDialogOpen = false;
  const hideGoldDialog = (): void => {
    goldDialogOpen = false;
    goldOverlay.classList.remove("show");
    goldDialog.classList.remove("show");
  };
  goldClose.addEventListener("click", hideGoldDialog);

  const moraleOverlay = div("morale-overlay", "");
  const moraleDialog = div("morale-dialog", "");
  moraleDialog.innerHTML =
    `<button type="button" class="dialog-x" id="morale-close" title="Close" aria-label="Close">✕</button>` +
    `<div class="morale-dialog-title">Empire Morale</div>` +
    `<div id="morale-dialog-content"></div>` +
    `<button class="btn morale-explain-toggle" id="morale-explain-toggle"></button>` +
    `<div id="morale-explain" class="morale-explain hidden">` +
    `<p>Empire morale runs from <b>0 to 200</b> and starts at <b>50</b>. It sets the floor for the morale of newly trained units (a fresh unit starts near <b>50 + half</b> your empire morale) and shifts with your fortunes on the battlefield.</p>` +
    `<p><b>What raises it:</b> winning battles, promoting units, recruiting a Great Person, and declaring war while already confident.</p>` +
    `<p><b>What lowers it:</b> losing units in battle, and declaring war when your army is already shaky.</p>` +
    `<p><b>Drift:</b> a few quiet turns after your last morale gain, morale slowly fades back toward the base of 50 — it never decays below 50, only lost battles can push it lower.</p>` +
    `<p><b>Military pay:</b> set how much you pay your army (−100% to +200% of normal upkeep). Paying more costs gold but slows the drift; at +100% decay stops entirely, and beyond that a lavishly funded army's morale actually climbs each turn. Paying less saves gold but makes morale fade faster.</p>` +
    `<p><b>Why it matters:</b> high morale makes units hit harder and hold ground, and keeps them from breaking and routing under fire; low morale does the opposite.</p>` +
    `</div>`;
  const moraleDialogContent = moraleDialog.querySelector<HTMLDivElement>("#morale-dialog-content")!;
  const moraleExplain = moraleDialog.querySelector<HTMLDivElement>("#morale-explain")!;
  const moraleExplainToggle = moraleDialog.querySelector<HTMLButtonElement>("#morale-explain-toggle")!;
  const moraleClose = moraleDialog.querySelector<HTMLButtonElement>("#morale-close")!;
  let moraleDialogOpen = false;
  let moraleExplainOpen = false;
  const syncMoraleExplain = (): void => {
    moraleExplain.classList.toggle("hidden", !moraleExplainOpen);
    moraleExplainToggle.textContent = moraleExplainOpen ? "How morale works ▴" : "How morale works ▾";
  };
  syncMoraleExplain();
  const hideMoraleDialog = (): void => {
    moraleDialogOpen = false;
    moraleOverlay.classList.remove("show");
    moraleDialog.classList.remove("show");
  };
  moraleExplainToggle.addEventListener("click", () => {
    moraleExplainOpen = !moraleExplainOpen;
    syncMoraleExplain();
  });
  moraleClose.addEventListener("click", hideMoraleDialog);

  const unitPromoOverlay = div("unit-promo-overlay", "");
  const unitPromoDialog = div("unit-promo-dialog", "");
  unitPromoDialog.innerHTML =
    `<button type="button" class="dialog-x" id="unit-promo-close" title="Close" aria-label="Close">✕</button>` +
    `<div class="unit-promo-dialog-title">Unit Promotions</div>` +
    `<div id="unit-promo-dialog-content"></div>`;
  const unitPromoDialogContent = unitPromoDialog.querySelector<HTMLDivElement>("#unit-promo-dialog-content")!;
  const unitPromoClose = unitPromoDialog.querySelector<HTMLButtonElement>("#unit-promo-close")!;
  let unitPromoDialogOpen = false;
  const hideUnitPromoDialog = (): void => {
    unitPromoDialogOpen = false;
    unitPromoOverlay.classList.remove("show");
    unitPromoDialog.classList.remove("show");
  };
  const showUnitPromoDialog = (unit: Unit, displayName: string): void => {
    unitPromoDialogContent.innerHTML = unitPromotionDialogHtml(unit, displayName);
    unitPromoDialogOpen = true;
    unitPromoOverlay.classList.add("show");
    unitPromoDialog.classList.add("show");
  };
  unitPromoClose.addEventListener("click", hideUnitPromoDialog);

  const turnUpdateOverlay = div("turn-update-overlay", "");
  const turnUpdateDialog = div("turn-update-dialog", "");
  turnUpdateDialog.innerHTML =
    `<button type="button" class="dialog-x" id="turn-update-close" title="Close" aria-label="Close">✕</button>` +
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
    `<div class="turn-update-compact hidden" id="turn-update-compact"></div>`;
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
  gameHud().appendChild(endturn);

  const endturn2 = document.createElement("button");
  endturn2.id = "endturn2";
  endturn2.className = "action-btn action-skip";
  endturn2.title = "Skip Move (End Turn)";
  gameHud().appendChild(endturn2);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (gpActivateDialog.classList.contains("show")) {
        hideGreatPersonActivate();
        return;
      }
      if (leaderAbilityDialog.classList.contains("show")) {
        hideLeaderAbility();
        return;
      }
      if (villageDialog.classList.contains("show")) {
        closeVillageDialog();
        return;
      }
      if (logDialog.classList.contains("show")) {
        hideLogDialog();
        return;
      }
      if (leaderboardDialog.classList.contains("show")) {
        hideLeaderboard();
        return;
      }
      if (goldDialog.classList.contains("show")) {
        hideGoldDialog();
        return;
      }
      if (moraleDialog.classList.contains("show")) {
        hideMoraleDialog();
        return;
      }
      if (unitPromoDialog.classList.contains("show")) {
        hideUnitPromoDialog();
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
      // When a dialog is open, Enter confirms its positive action instead of
      // ending the turn. The action-confirmation modal (built in main.ts) sits
      // above everything, so it wins; then the in-game popups in stacking order.
      const confirmModal = document.getElementById("confirm-modal");
      if (confirmModal && confirmModal.style.display !== "none") {
        confirmModal.querySelector<HTMLButtonElement>("#cf-yes")?.click();
        return;
      }
      if (gpActivateDialog.classList.contains("show")) { gpActivateConfirm.click(); return; }
      if (leaderAbilityDialog.classList.contains("show")) { laDialogConfirm.click(); return; }
      if (villageDialog.classList.contains("show")) { villageOk.click(); return; }
      if (turnUpdateDialog.classList.contains("show")) { turnUpdateClose.click(); return; }
      if (goldDialog.classList.contains("show")) { goldClose.click(); return; }
      if (unitPromoDialog.classList.contains("show")) { unitPromoClose.click(); return; }
      if (logDialog.classList.contains("show")) { logClose.click(); return; }
      if (leaderboardDialog.classList.contains("show")) { leaderboardClose.click(); return; }
      // Blocking overlays with no single positive action: swallow Enter rather
      // than ending the turn behind them.
      if (settingsOpen || menuOpen || godModeOpen) return;
      endturn.click();
    }
  });

  let researchOpen = false;
  let techtreeOpen = false;
  let civicsOpen = false;
  let religionOpen = false;
  let greatPeopleOpen = false;
  let legendsOpen = false;
  let productionOpen = false;
  let tileExpanded = false;
  let prodCityId: number | null = null;
  // Construction dialog tab and the specialists sub-dialog (mirrors production).
  // Units are no longer built here — they are trained (see the Training dialog).
  let prodTab: "building" | "trainingBuilding" | "project" = "building";
  let specialistsOpen = false;
  let specCityId: number | null = null;
  let trainingOpen = false;
  let trainCityId: number | null = null;
  /** Which train-units accordion sections are expanded (family id, "city", or "temple"). */
  let trainExpandedSections = new Set<string>();
  let trainExpandedForCityId: number | null = null;
  /** The ONE founding belief picked in the founding flow (0 or 1 entries). */
  let chosenBeliefs: string[] = [];
  /** Religion the player has picked in the (step 1) founding grid, before beliefs. */
  let chosenReligionName: string | null = null;
  let bannerTimer = 0;
  let lastState: GameState | null = null;
  let lastViewerId = -1;
  let lastLogLength = 0;
  let logInitialized = false;
  /** A queued immediate popup (village reward or natural-wonder discovery). */
  type PopupItem = { title: string; html: string; art?: string };
  let villageQueue: PopupItem[] = [];
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
  let menuView: "menu" | "save" | "leave" | "bug" = "menu";
  let isSaving = false;
  let isReporting = false;
  let mpSaves: SaveRecord[] = [];
  let godModeEnabled = false;
  let godModeOpen = false;
  /** Skip god-panel DOM rebuilds when cheat UI content is unchanged (preserves scroll). */
  let godModeRenderSig = "";
  let lastView: UIView | null = null;
  // Docked info-panel collapse state. Each panel starts minimized on mobile and
  // expanded on desktop, and resets whenever the selection changes so each new
  // selection opens at its default size.
  let unitPanelExpanded = false;
  let unitPanelUnitId: number | null = null;
  let cityPanelExpanded = false;
  let cityPanelCityId: number | null = null;
  // The governor picker collapses to a single chip on the stat line; this tracks
  // whether the full mode picker is expanded below it. Reset when the city changes.
  let governorPickerOpen = false;
  let tilePanelExpanded = false;
  let tilePanelKey: string | null = null;
  const isMobile = (): boolean =>
    window.matchMedia("(max-width: 860px), (pointer: coarse)").matches;

  // Shared summary bar for the collapsible docked panels (unit / tile / city).
  // The whole bar toggles the panel's `.collapsed` class; an optional ✕ closes it.
  const summaryBar = (opts: {
    icon: string;
    isImg?: boolean;
    name: string;
    stats?: string;
    extra?: string;
    closeId?: string;
  }): string =>
    `<div class="ip-summary">` +
    (opts.isImg
      ? `<img class="ip-icon" src="${opts.icon}" alt="" onerror="this.style.display='none'">`
      : `<span class="ip-icon">${opts.icon}</span>`) +
    `<span class="ip-name">${opts.name}</span>` +
    (opts.stats ? `<span class="ip-stats">${opts.stats}</span>` : "") +
    (opts.extra ?? "") +
    (opts.closeId ? `<button class="btn ip-close" id="${opts.closeId}">✕</button>` : "") +
    `<span class="ip-chevron">▾</span>` +
    `</div>`;

  // Wire the summary bar so tapping it (but not the ✕) toggles the panel.
  const wireCollapse = (panel: HTMLElement, onToggle: () => void): void => {
    panel.querySelector<HTMLElement>(".ip-summary")?.addEventListener("click", (e) => {
      // The ✕ and any inline quick-action buttons (e.g. quick-cast abilities) live
      // inside the bar but must act on their own, not collapse the panel.
      if ((e.target as HTMLElement).closest(".ip-close, [data-ability], [data-found]")) return;
      onToggle();
    });
  };

  const closePickers = (state: GameState): void => {
    researchOpen = false;
    civicsOpen = false;
    religionOpen = false;
    greatPeopleOpen = false;
    legendsOpen = false;
    productionOpen = false;
    specialistsOpen = false;
    trainingOpen = false;
    techtreeOpen = false;
    renderResearch(state);
    renderCivics(state);
    renderReligion(state);
    renderGreatPeople(state);
    renderLegends(state);
    renderProduction(state);
    renderSpecialists(state);
    renderTraining(state);
    renderTechTree(state);
  };
  const closeSideSheets = (): void => {
    empire.close();
    diplomacy.close();
    wiki.close();
  };

  const rewardImagePath = (reward: FeatureRewardType): string => {
    if (reward === "camp_cleared") {
      return assetUrl("barbarian-rewards/barb_camp_cleared.png");
    }
    return assetUrl(`village-rewards/village_reward_${reward}.png`);
  };

  const showVillageDialog = (item: PopupItem): void => {
    villageMsg.innerHTML = item.html;
    villageTitle.textContent = item.title;
    if (item.art) {
      villageArt.onerror = () => villageArt.classList.add("hidden");
      villageArt.src = item.art;
      villageArt.classList.remove("hidden");
    } else {
      villageArt.classList.add("hidden");
    }
    villageOverlay.classList.add("show");
    villageDialog.classList.add("show");
  };

  // Build a popup item from a village/camp reward log entry.
  const villagePopupItem = (e: LogEntry): PopupItem => ({
    title: e.reward === "camp_cleared" ? "Camp Cleared" : "Village Discovered",
    html: escapeHtml(e.message),
    art: e.reward ? rewardImagePath(e.reward) : undefined,
  });

  // Build a popup item from a natural-wonder discovery log entry.
  const wonderPopupItem = (e: LogEntry): PopupItem => {
    const w = e.wonder!;
    if (w.allComplete) {
      return {
        title: "All Natural Wonders Discovered!",
        html: escapeHtml(`You have discovered every natural wonder in the world and earned ${w.bonusText}!`),
        art: "pillars/pillar_explore.png",
      };
    }
    const lines = [escapeHtml(`You discovered ${w.wonderName} and claimed ${w.bonusText}.`)];
    if (w.firstDiscovery && w.allBonusText) {
      lines.push(escapeHtml(`Be the first civilization to discover every natural wonder to earn ${w.allBonusText}.`));
    }
    return {
      title: "Natural Wonder Discovered",
      html: lines.join("<br><br>"),
      art: w.wonderId ? assetUrl(`natural-wonders/${w.wonderId}.png`) : undefined,
    };
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
      window.setTimeout(() => showVillageDialog(villageQueue[0]!), 150);
    }
  };

  villageOk.addEventListener("click", closeVillageDialog);
  villageDialog.querySelector<HTMLButtonElement>("#village-close")!.addEventListener("click", closeVillageDialog);

  const turnUpdateImagePath = (ev: TurnUpdateEvent): string => {
    if (ev.type === "wonderComplete" && ev.payload?.wonderId) {
      return assetUrl(`turn-updates/wonder_${ev.payload.wonderId}.png`);
    }
    if (ev.type === "improvementComplete" && ev.payload?.kind) {
      return assetUrl(`turn-updates/improvement_${ev.payload.kind}.png`);
    }
    if (ev.type === "greatPersonRecruited" && ev.payload?.greatPersonId) {
      return assetUrl(`great-people/${ev.payload.greatPersonId}.png`);
    }
    if (ev.type === "legendRecruited" && ev.payload?.legendId) {
      return assetUrl(`legends/${ev.payload.legendId}.png`);
    }
    if (ev.type === "religionFounded" && ev.payload?.religionId) {
      return assetUrl(`religions/${ev.payload.religionId}.png`);
    }
    if (ev.type === "eureka") {
      return assetUrl("turn-updates/eureka.png");
    }
    return assetUrl(`turn-updates/${ev.type}.png`);
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
        return "Construction Complete";
      case "unitTrained":
        return "Unit Trained";
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
      case "greatPersonRecruited":
        return "Great Person Recruited";
      case "legendRecruited":
        return "A Legend Rises";
      case "religionFounded":
        return "Religion Founded";
      case "civDefeated":
        return "Civilization Defeated";
      case "treasuryExhausted":
        return "Treasury Exhausted";
      case "eureka":
        return "Eureka!";
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
      // Only prompt once the queue has run dry. While a research target is still
      // queued the game auto-advances to the next tech, so don't nag on every
      // intermediate discovery along the way.
      const me = lastView?.state.players.find((p) => p.id === lastView?.viewerId);
      if (!me || me.researching == null) {
        buttons.push(`<button class="btn primary" data-tu-research>Choose Research</button>`);
      }
    }
    if (ev.type === "civicComplete") {
      buttons.push(`<button class="btn primary" data-tu-civics>Choose Civic</button>`);
    }
    if (ev.type === "treasuryExhausted") {
      buttons.push(`<button class="btn primary" data-tu-gold>Open Treasury</button>`);
    }
    if (ev.type === "greatPersonRecruited") {
      buttons.push(`<button class="btn primary" data-tu-greatpeople>Put to Work</button>`);
    }
    if (ev.type === "legendRecruited") {
      buttons.push(`<button class="btn primary" data-tu-legends>View Legends</button>`);
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
    const genericPath = assetUrl(`turn-updates/${ev.type}.png`);
    const specificPath = turnUpdateImagePath(ev);
    turnUpdateArt.src = specificPath;
    turnUpdateArt.onerror = () => {
      // Fall back to the generic event image, then to a leader portrait placeholder.
      if (turnUpdateArt.src.endsWith(specificPath) && specificPath !== genericPath) {
        turnUpdateArt.src = genericPath;
      } else {
        turnUpdateArt.src = assetUrl("leaders/rome.png");
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
    turnUpdateActions.querySelectorAll<HTMLButtonElement>("[data-tu-greatpeople]").forEach((el) =>
      el.addEventListener("click", () => {
        handlers.onTurnUpdateOpenGreatPeople();
        hideTurnUpdateDialog();
      }),
    );
    turnUpdateActions.querySelectorAll<HTMLButtonElement>("[data-tu-legends]").forEach((el) =>
      el.addEventListener("click", () => {
        handlers.onTurnUpdateOpenLegends();
        hideTurnUpdateDialog();
      }),
    );
  };

  const renderTurnUpdateCompact = (): void => {
    if (turnUpdateQueue.length === 0) {
      hideTurnUpdateDialog();
      return;
    }
    withPreservedScroll(turnUpdateDialog, () => {
      turnUpdateCompact.innerHTML = turnUpdateQueue
        .map(
          (ev, i) =>
            `<button class="tu-row" data-tu-row="${i}">` +
            `<img class="tu-row-art" src="${turnUpdateImagePath(ev)}" alt="" ` +
            `onerror="this.onerror=null;this.src='${assetUrl(`turn-updates/${ev.type}.png`)}'" />` +
            `<span class="tu-row-text"><b>${escapeHtml(updateTitleFor(ev))}</b>` +
            `<span>${escapeHtml(ev.message)}</span></span>` +
            `<span class="tu-row-chevron">›</span>` +
            `</button>`,
        )
        .join("");
    });
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
    withPreservedScroll(settingsDialog, () => {
      settingsDialog.innerHTML =
        `<button type="button" class="dialog-x" id="settings-close" title="Close" aria-label="Close">✕</button>` +
        `<div class="settings-header"><b>⚙ Settings</b></div>` +
        `<div class="settings-section">` +
        `<div class="settings-title">Turn Updates</div>` +
        `<div class="settings-hint">What happens at the start of each of your turns.</div>` +
        `<div class="seg">` +
        `<button class="seg-btn ${tuMode === "expanded" ? "active" : ""}" data-tu-mode="expanded" title="Pop up one event at a time">Pop up</button>` +
        `<button class="seg-btn ${tuMode === "compact" ? "active" : ""}" data-tu-mode="compact" title="Pop up all events on one screen">Compact</button>` +
        `<button class="seg-btn ${tuMode === "off" ? "active" : ""}" data-tu-mode="off" title="Don't pop up; still available from the Updates button">Off</button>` +
        `</div></div>` +
        (shouldOfferScreenRotation()
          ? `<div class="settings-section">` +
            `<div class="settings-title">Screen Rotation</div>` +
            `<div class="settings-hint">Pick one orientation. The game stays fixed and does not rotate with your device.</div>` +
            screenRotationControlsHtml({ showLabel: false }) +
            `</div>`
          : "");
    });
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
    if (shouldOfferScreenRotation()) bindScreenRotationControls(settingsDialog);
  };

  const renderAction = (view: UIView): void => {
    if (view.suggestion) {
      endturn.title = view.suggestion.label;
      endturn.onclick = () => handlers.onSuggestion();
      endturn2.onclick = () => handlers.onEndTurn();
      endturn2.classList.remove("hidden");
    } else {
      endturn.title = "End Turn";
      endturn.onclick = () => handlers.onEndTurn();
      endturn2.onclick = null;
      endturn2.classList.add("hidden");
    }
  };

  const renderTopbar = (state: GameState): void => {
    const player = state.players[state.currentPlayerIndex]!;
    const viewerId = lastViewerId >= 0 ? lastViewerId : player.id;
    // Display yields fold in standing-project conversion (Coinage → gold, etc.), so
    // the per-turn numbers on the top bar match what actually hits each pool.
    const sci = citiesOf(state, player.id).reduce(
      (n, c) => n + cityDisplayYields(state, c).science,
      0,
    );
    const gld = citiesOf(state, player.id).reduce((n, c) => n + cityDisplayYields(state, c).gold, 0);
    const upkeep = militaryUpkeepTotal(state, player); // includes the military-pay minimum
    const netGold = gld - upkeep;
    const goldSign = netGold >= 0 ? "+" : "−";
    const goldClass = netGold >= 0 ? "color:#ffd700" : "color:#ff8a8a";
    const fth = citiesOf(state, player.id).reduce((n, c) => n + cityDisplayYields(state, c).faith, 0);
    const researchingDef = player.researching ? TECH_DEFS[player.researching] : null;
    const researchCost = player.researching ? scaledTechCost(state, player.researching) : 0;
    const researchPct = researchingDef
      ? Math.min(100, (player.scienceProgress / researchCost) * 100)
      : 0;
    const cul = citiesOf(state, player.id).reduce((n, c) => n + cityDisplayYields(state, c).culture, 0);
    const govResDef = getGovernment(player.researchingGovernment ?? undefined);
    const govResCost = player.researchingGovernment ? scaledGovernmentCost(state, player.researchingGovernment) : 0;
    const civicPct = govResCost ? Math.min(100, (player.cultureProgress / govResCost) * 100) : 0;
    const gov = getGovernment(player.government);
    const civ = getCiv(player.civId);
    const rName = researchingDef ? researchingDef.name : "Choose…";
    const cName = govResDef ? govResDef.name : (gov?.name ?? "Choose…");
    const civTitle = civ ? `${civ.name} — ${civ.abilityName}: ${civ.abilityDesc}` : "";
    const showCivics = civicsUnlocked(player);
    const showReligion = religionUnlocked(state, player.id);

    const morale = Math.round(player.globalMorale ?? 50);
    const moraleColor = morale >= 100 ? "#7ee787" : morale >= 50 ? "#ffd700" : "#ff8a8a";

    const myCities = citiesOf(state, viewerId);
    const cityCount = myCities.length;
    const specCount = myCities.reduce((n, c) => n + c.specialists.length, 0);
    const routeCount = tradeRoutesOf(state, viewerId).length;
    const unitCount = unitsOf(state, viewerId).length;
    const gpReady = (player.greatPeople ?? []).length;
    const legendsOn = state.legendsEnabled !== false;
    const myLegends = unitsOf(state, viewerId).filter((u) => u.legendId).length;
    const canRecruitLegendNow =
      legendsOn &&
      citiesOf(state, viewerId).length > 0 &&
      availableLegendsForPlayer(state, viewerId).some((l) => canRecruitLegend(state, viewerId, l.id).ok);
    // Proposals needing the viewer's attention: incoming offers awaiting a
    // response, plus our own offers the other side accepted and we must finalize.
    const diploActionable = state.diploProposals.filter(
      (p) =>
        (p.toId === viewerId && p.status === "pending") ||
        (p.fromId === viewerId && p.status === "accepted"),
    ).length;

    // Leader ability: the civ's active, cooldown-gated signature action. Surfaced
    // as a badge pinned to the leader portrait (see the leaderAvatar block below) —
    // bright when ready to use, dim while locked or on cooldown. Clicking it opens
    // an info/confirm dialog. Shown only when the civ actually has one.
    const laDef = getLeaderAbilityForCiv(player.civId ?? "");
    let leaderAbilityBadgeHtml = "";
    if (laDef) {
      const laUnlocked = leaderAbilityUnlocked(state, player, laDef);
      const laCooldown = leaderAbilityCooldownRemaining(state, player, laDef);
      const laReady = laUnlocked && laCooldown === 0;
      const laInner = laReady ? "✦" : !laUnlocked ? `<span class="la-lock">🔒</span>` : `<span class="la-cd">${laCooldown}</span>`;
      const laStatus = laReady
        ? "Ready — click to use"
        : !laUnlocked
          ? `Locked — unlocks with ${leaderAbilityUnlockLabel(laDef)}`
          : `On cooldown — ${laCooldown} turn${laCooldown > 1 ? "s" : ""} left`;
      leaderAbilityBadgeHtml =
        `<button class="la-badge ${laReady ? "ready" : "inactive"}" id="leader-ability-badge" title="${escapeHtml(`${laDef.name} — ${laStatus}`)}">${laInner}</button>`;
    }

    const mapLabel = stateMapLabel(state);
    const turnTitle = mapLabel ? `Turn ${state.turn} · Map: ${mapLabel}` : `Turn ${state.turn}`;

    topbar.innerHTML = `
      <div class="tb-grp">
        <span class="tb-turn" title="${escapeHtml(turnTitle)}">⏱ ${state.turn}${mapLabel ? `<span class="tb-map">${escapeHtml(mapLabel)}</span>` : ""}</span>
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
        <button class="tb-pill" id="morale-pill" title="Empire morale (0–200). Tap for recent events and how morale works.">
          <span class="tb-pl">🎌</span><b style="color:${moraleColor}">${morale}</b></button>
      </div>
      <div class="tb-grp">
        <button class="tb-pill empire" id="cities-btn" title="Cities"><span class="tb-pl">🏙️</span><b>${cityCount}</b></button>
        <button class="tb-pill empire" id="units-btn" title="Units"><span class="tb-pl">⚔️</span><b>${unitCount}</b></button>
        <button class="tb-pill empire" id="specialists-btn" title="Specialists"><span class="tb-pl">👷</span><b>${specCount}</b></button>
        <button class="tb-pill empire" id="trade-btn" title="Trade Routes"><span class="tb-pl">🐫</span><b>${routeCount}</b></button>
        <button class="tb-pill empire ${gpReady ? "has-badge" : ""}" id="great-people-btn" title="Great People"><span class="tb-pl">🎖️</span><b>${gpReady}</b>${gpReady ? `<span class="tu-badge"></span>` : ""}</button>
        ${legendsOn ? `<button class="tb-pill empire ${canRecruitLegendNow ? "has-badge" : ""}" id="legends-btn" title="Legends"><span class="tb-pl">⭐</span><b>${myLegends}</b>${canRecruitLegendNow ? `<span class="tu-badge"></span>` : ""}</button>` : ""}
        <button class="tb-pill ${diploActionable ? "has-badge" : ""}" id="diplo-pill" title="${diploActionable ? `Diplomacy — ${diploActionable} proposal${diploActionable > 1 ? "s" : ""} need your attention` : "Diplomacy"}">
          <span class="tb-pl">🕊️</span><b>${player.met.length}</b>${diploActionable ? `<span class="tu-badge"></span>` : ""}</button>
        <button class="tb-pill ${turnUpdateHasNew ? "has-badge" : ""}" id="turn-update-btn" title="Turn Updates">
          <span class="tb-pl">📜</span><b>Updates</b>${turnUpdateHasNew ? `<span class="tu-badge"></span>` : ""}</button>
        <button class="tb-pill" id="menu-btn" title="Menu">
          <span class="tb-pl">☰</span><b>Menu</b></button>
      </div>`;

    if (civ) {
      leaderAvatar.classList.remove("empty");
      leaderAvatar.innerHTML =
        `<img src="${ASSET_BASE_URL}leaders/${civ.id}.png" alt="${escapeHtml(civ.leader)}" title="${escapeHtml(civ.name)} — ${escapeHtml(civ.leader)}" onerror="this.style.visibility='hidden'">` +
        `<div class="leader-avatar-label"><b>${escapeHtml(civ.name)}</b><span>${escapeHtml(civ.leader)}</span></div>` +
        leaderAbilityBadgeHtml;
      leaderAvatar
        .querySelector<HTMLButtonElement>("#leader-ability-badge")
        ?.addEventListener("click", () => showLeaderAbility(state));
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
    topbar.querySelector<HTMLButtonElement>("#great-people-btn")!.addEventListener("click", () => {
      const opening = !greatPeopleOpen;
      greatPeopleOpen = !greatPeopleOpen;
      researchOpen = false;
      civicsOpen = false;
      religionOpen = false;
      if (opening) {
        closeSideSheets();
        menuOpen = false;
        renderMenu(state);
      }
      renderGreatPeople(state);
      renderResearch(state);
      renderCivics(state);
      renderReligion(state);
    });
    topbar.querySelector<HTMLButtonElement>("#legends-btn")?.addEventListener("click", () => {
      const opening = !legendsOpen;
      legendsOpen = !legendsOpen;
      researchOpen = false;
      civicsOpen = false;
      religionOpen = false;
      greatPeopleOpen = false;
      if (opening) {
        closeSideSheets();
        menuOpen = false;
        renderMenu(state);
      }
      renderLegends(state);
      renderGreatPeople(state);
      renderResearch(state);
      renderCivics(state);
      renderReligion(state);
    });
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
    topbar.querySelector<HTMLButtonElement>("#trade-btn")!.addEventListener("click", () => openEmpire("trade"));
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
        hideMoraleDialog();
        closeSideSheets();
        closePickers(state);
        menuOpen = false;
        renderMenu(state);
      }
      renderGoldDialog(state);
    });
    topbar.querySelector<HTMLButtonElement>("#morale-pill")!.addEventListener("click", () => {
      moraleDialogOpen = !moraleDialogOpen;
      if (moraleDialogOpen) {
        hideGoldDialog();
        closeSideSheets();
        closePickers(state);
        menuOpen = false;
        renderMenu(state);
      }
      renderMoraleDialog(state);
    });
    topbar.querySelector<HTMLButtonElement>("#turn-update-btn")!.addEventListener("click", () => {
      turnUpdateHasNew = false;
      showTurnUpdateDialog();
    });

    // Mobile bottom bar: action icons. Gold, research, civics, religion and
    // morale live in the top bar's resource group on mobile, so they are not
    // repeated here.
    bottomBar.innerHTML =
      `<div class="bb-grp">` +
      `<button class="bb-btn" data-bb="empire" title="Cities"><span>🏙️</span><i>${cityCount}</i></button>` +
      `<button class="bb-btn" data-bb="units" title="Units"><span>⚔️</span><i>${unitCount}</i></button>` +
      `<button class="bb-btn" data-bb="specialists" title="Specialists"><span>👷</span><i>${specCount}</i></button>` +
      `<button class="bb-btn" data-bb="trade" title="Trade Routes"><span>🐫</span><i>${routeCount}</i></button>` +
      `<button class="bb-btn ${gpReady ? "has-badge" : ""}" data-bb="great-people" title="Great People"><span>🎖️</span><i>${gpReady}</i>${gpReady ? `<span class="tu-badge"></span>` : ""}</button>` +
      (legendsOn ? `<button class="bb-btn ${canRecruitLegendNow ? "has-badge" : ""}" data-bb="legends" title="Legends"><span>⭐</span><i>${myLegends}</i>${canRecruitLegendNow ? `<span class="tu-badge"></span>` : ""}</button>` : "") +
      `<button class="bb-btn ${turnUpdateHasNew ? "has-badge" : ""}" data-bb="turn-update" title="Turn Updates"><span>📜</span>${turnUpdateHasNew ? `<span class="tu-badge"></span>` : ""}</button>` +
      `<button class="bb-btn ${diploActionable ? "has-badge" : ""}" data-bb="diplo" title="Diplomacy"><span>🕊️</span><i>${player.met.length}</i>${diploActionable ? `<span class="tu-badge"></span>` : ""}</button>` +
      `<button class="bb-btn" data-bb="menu" title="Menu"><span>☰</span></button>` +
      `</div>`;
    const bbMap: Record<string, string> = {
      empire: "#cities-btn",
      units: "#units-btn",
      specialists: "#specialists-btn",
      trade: "#trade-btn",
      "great-people": "#great-people-btn",
      legends: "#legends-btn",
      diplo: "#diplo-pill",
      menu: "#menu-btn",
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

    // Same anti-flicker guard for the bug-report form: don't rebuild it (and clear
    // the textarea / steal focus) on every frame while the player is typing.
    if (menuView === "bug" && saveModal.querySelector<HTMLTextAreaElement>("#bug-text")) {
      const confirmBtn = saveModal.querySelector<HTMLButtonElement>("#bug-confirm");
      if (confirmBtn) {
        confirmBtn.disabled = isReporting;
        confirmBtn.textContent = isReporting ? "Sending…" : "Submit report";
      }
      return;
    }

    if (menuView === "leave" && saveModal.querySelector<HTMLInputElement>("#leave-save-name")) {
      const confirmBtn = saveModal.querySelector<HTMLButtonElement>("#leave-save");
      if (confirmBtn) {
        confirmBtn.disabled = isSaving;
        confirmBtn.textContent = isSaving ? "Saving…" : "Save & Leave";
      }
      return;
    }

    if (menuView === "menu") {
      const mapLabel = stateMapLabel(state);
      const godMenuBtn =
        !lastView?.cheatsEnabled
          ? ""
          : godModeEnabled
            ? `<button class="btn" id="menu-god">God Mode</button>`
            : `<button class="btn" id="menu-enable-god">Enable God Mode</button>`;
      const saveBtn = handlers.canSave
        ? `<button class="btn primary" id="menu-save">Save Game</button>`
        : "";
      let html =
        `<div class="row" style="justify-content:space-between"><b>Game Menu</b>` +
        `<button type="button" class="btn panel-close" id="save-close">✕</button></div>` +
        `<div style="margin:8px 0;color:#9fc0dc">Turn ${state.turn} · ${player.name}` +
        (mapLabel ? `<br/><span style="font-size:11px">Map: ${escapeHtml(mapLabel)}</span>` : "") +
        `</div>` +
        `<div style="display:flex;flex-direction:column;gap:8px;margin-top:12px">` +
        saveBtn +
        `<button class="btn" id="menu-settings">Settings</button>` +
        `<button class="btn" id="menu-wiki">Open Wiki</button>` +
        `<button class="btn" id="menu-leaderboard">Leaderboard</button>` +
        `<button class="btn" id="menu-log">Game Log</button>` +
        `<button class="btn" id="menu-bug">🐞 Report a Bug</button>` +
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
      withPreservedScroll(saveModal, () => {
        saveModal.innerHTML = html;
      });
      saveModal.querySelector<HTMLButtonElement>("#save-close")!.addEventListener("click", () => {
        menuOpen = false;
        renderMenu(state);
      });
      saveModal.querySelector<HTMLButtonElement>("#menu-settings")!.addEventListener("click", () => {
        settingsOpen = true;
        renderSettings();
      });
      saveModal.querySelector<HTMLButtonElement>("#menu-save")?.addEventListener("click", () => {
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
      saveModal.querySelector<HTMLButtonElement>("#menu-leaderboard")!.addEventListener("click", () => {
        menuOpen = false;
        renderMenu(state);
        showLeaderboard(state);
      });
      saveModal.querySelector<HTMLButtonElement>("#menu-log")!.addEventListener("click", () => {
        setPreservedHtml(
          logDialogContent,
          visibleLog(state, lastViewerId >= 0 ? lastViewerId : (state.players[state.currentPlayerIndex]?.id ?? 0))
            .reverse()
            .map((entry) => `<div>${escapeHtml(entry.message)}</div>`)
            .join(""),
        );
        logOverlay.classList.add("show");
        logDialog.classList.add("show");
      });
      saveModal.querySelector<HTMLButtonElement>("#menu-bug")!.addEventListener("click", () => {
        menuView = "bug";
        renderMenu(state);
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
        if (handlers.promptSaveOnLeave && handlers.canSave) {
          menuView = "leave";
          renderMenu(state);
          return;
        }
        if (confirm("Leave this game and return to the main menu?")) {
          handlers.onLeaveGame();
        }
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

    if (menuView === "leave") {
      const civ = getCiv(player.civId);
      const defaultName = `${civ ? civ.name : player.name} - Turn ${state.turn}`;
      withPreservedScroll(saveModal, () => {
        saveModal.innerHTML =
          `<div class="row" style="justify-content:space-between"><b>Leave Game</b>` +
          `<button type="button" class="btn panel-close" id="save-close">✕</button></div>` +
          `<div style="margin:8px 0;color:#9fc0dc">Save your progress before returning to the main menu?</div>` +
          `<input id="leave-save-name" class="lobby-in" value="${escapeHtml(defaultName)}" placeholder="Save name…" style="width:100%;margin-bottom:8px" />` +
          `<button class="btn primary" id="leave-save" style="width:100%" ${isSaving ? "disabled" : ""}>` +
          (isSaving ? "Saving…" : "Save & Leave") +
          `</button>` +
          `<button class="btn" id="leave-discard" style="width:100%;margin-top:8px">Leave without saving</button>` +
          `<div id="save-error" style="color:#ff8a8a;margin-top:6px"></div>`;
      });
      const input = saveModal.querySelector<HTMLInputElement>("#leave-save-name")!;
      input.focus();
      saveModal.querySelector<HTMLButtonElement>("#save-close")!.addEventListener("click", () => {
        menuView = "menu";
        renderMenu(state);
      });
      saveModal.querySelector<HTMLButtonElement>("#leave-discard")!.addEventListener("click", () => {
        handlers.onLeaveGame();
      });
      saveModal.querySelector<HTMLButtonElement>("#leave-save")!.addEventListener("click", async () => {
        const name = input.value.trim();
        if (!name) {
          saveModal.querySelector<HTMLDivElement>("#save-error")!.textContent = "Enter a save name.";
          return;
        }
        isSaving = true;
        renderMenu(state);
        try {
          await handlers.onSave(name);
          handlers.onLeaveGame();
        } catch (err) {
          isSaving = false;
          renderMenu(state);
          saveModal.querySelector<HTMLDivElement>("#save-error")!.textContent = String(err);
        }
      });
      return;
    }

    // Bug-report form view
    if (menuView === "bug") {
      withPreservedScroll(saveModal, () => {
        saveModal.innerHTML =
          `<div class="row" style="justify-content:space-between"><b>🐞 Report a Bug</b>` +
          `<button type="button" class="btn panel-close" id="bug-close">✕</button></div>` +
          `<div style="margin:8px 0;color:#9fc0dc">Describe what went wrong. A snapshot of this game ` +
          `(turn ${state.turn}, full state & recent errors) is attached automatically to help us reproduce it.</div>` +
          `<textarea id="bug-text" class="lobby-in" placeholder="What happened? What did you expect?" ` +
          `style="width:100%;min-height:120px;resize:vertical;margin-bottom:8px"></textarea>` +
          `<button class="btn primary" id="bug-confirm" style="width:100%" ${isReporting ? "disabled" : ""}>` +
          (isReporting ? "Sending…" : "Submit report") +
          `</button>` +
          `<div id="bug-status" style="margin-top:8px"></div>`;
      });
      const ta = saveModal.querySelector<HTMLTextAreaElement>("#bug-text")!;
      ta.focus();
      const statusEl = saveModal.querySelector<HTMLDivElement>("#bug-status")!;
      saveModal.querySelector<HTMLButtonElement>("#bug-close")!.addEventListener("click", () => {
        menuView = "menu";
        renderMenu(state);
      });
      saveModal.querySelector<HTMLButtonElement>("#bug-confirm")!.addEventListener("click", async () => {
        const message = ta.value.trim();
        if (!message) {
          statusEl.innerHTML = `<span style="color:#ff8a8a">Please describe the problem first.</span>`;
          return;
        }
        isReporting = true;
        renderMenu(state);
        try {
          const sentNow = await handlers.onReportBug(message);
          isReporting = false;
          menuOpen = false;
          menuView = "menu";
          renderMenu(state);
          showBanner(sentNow ? "Bug report sent — thank you!" : "Report saved — it'll send when you're back online.");
        } catch (err) {
          isReporting = false;
          renderMenu(state);
          const el = saveModal.querySelector<HTMLDivElement>("#bug-status");
          if (el) el.innerHTML = `<span style="color:#ff8a8a">${escapeHtml(String(err))}</span>`;
        }
      });
      return;
    }

    // Save form view
    const civ = getCiv(player.civId);
    const defaultName = `${civ ? civ.name : player.name} - Turn ${state.turn}`;
    let html =
      `<div class="row" style="justify-content:space-between"><b>Save Game</b>` +
      `<button type="button" class="btn panel-close" id="save-close">✕</button></div>` +
      `<div style="margin:8px 0;color:#9fc0dc">Turn ${state.turn} · ${player.name}</div>` +
      `<input id="save-name" class="lobby-in" value="${escapeHtml(defaultName)}" placeholder="Save name…" style="width:100%;margin-bottom:8px" />` +
      `<button class="btn primary" id="save-confirm" style="width:100%" ${isSaving ? "disabled" : ""}>` +
      (isSaving ? "Saving…" : "Save") +
      `</button>` +
      `<button class="btn" id="save-export" style="width:100%;margin-top:8px">💾 Export Current Save</button>` +
      `<div id="save-error" style="color:#ff8a8a;margin-top:6px"></div>`;
    withPreservedScroll(saveModal, () => {
      saveModal.innerHTML = html;
    });
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
        const y = cityDisplayYields(state, city);
        return `<div class="gold-row"><span>${escapeHtml(city.name)}${city.isCapital ? " ★" : ""}</span><span class="gold-amount gold-positive">+${y.gold}</span></div>`;
      })
      .join("");
    const totalCityGold = myCities.reduce((n, c) => n + cityDisplayYields(state, c).gold, 0);

    const unitRows = myUnits
      .map((unit) => {
        const cost = unitUpkeep(state, unit);
        if (cost <= 0) return "";
        const def = UNIT_DEFS[unit.type];
        return `<div class="gold-row"><span>${escapeHtml(def.name)}</span><span class="gold-amount gold-negative">−${cost}</span></div>`;
      })
      .filter(Boolean)
      .join("");
    const rawUpkeep = myUnits.reduce((n, u) => n + unitUpkeep(state, u), 0);
    const totalUpkeep = militaryUpkeepTotal(state, player); // floored by the military-pay minimum
    const payFloorExtra = totalUpkeep - rawUpkeep; // surcharge to meet the pay floor (0 if upkeep already covers it)
    const pay = Math.round(player.upkeepModifierPct ?? 0);

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
    if (unitRows) html += unitRows;
    // The military-pay setting carries a minimum cost (10/20/30/40 at +50/100/150/200%)
    // even when unit upkeep is below it — so a morale boost is never free.
    if (payFloorExtra > 0) {
      html += `<div class="gold-row"><span>Military pay <span class="sub">minimum at +${pay}%</span></span><span class="gold-amount gold-negative">−${payFloorExtra}</span></div>`;
    } else if (!unitRows) {
      html += `<div class="gold-row"><span class="sub">No unit upkeep.</span><span class="gold-amount">0</span></div>`;
    }
    html += `<div class="gold-total"><span>Total upkeep</span><span class="gold-amount gold-negative">−${totalUpkeep}</span></div>`;
    html += `</div>`;

    setPreservedHtml(goldDialogContent, html);
  };

  const renderMoraleDialog = (state: GameState): void => {
    moraleOverlay.classList.toggle("show", moraleDialogOpen);
    moraleDialog.classList.toggle("show", moraleDialogOpen);
    if (!moraleDialogOpen) return;

    const player = state.players[state.currentPlayerIndex]!;
    const morale = Math.round(player.globalMorale ?? 50);
    const color = morale >= 100 ? "#7ee787" : morale >= 50 ? "#ffd700" : "#ff8a8a";
    const label = morale >= 150 ? "Triumphant" : morale >= 100 ? "Confident" : morale >= 50 ? "Steady" : "Wavering";
    const events = [...(player.moraleLog ?? [])].reverse(); // most recent first

    let html = `<div class="morale-header">`;
    html += `<span class="morale-value" style="color:${color}">🎌 ${morale}</span>`;
    html += `<span class="morale-state">${label} <span class="sub">/ 200</span></span>`;
    html += `</div>`;
    html += `<div class="morale-bar"><div class="morale-bar-fill" style="width:${(morale / 200) * 100}%;background:${color}"></div></div>`;

    // ---- Military pay (upkeep modifier) ----
    const pay = Math.round(player.upkeepModifierPct ?? 0);
    const payMult = 1 + pay / 100;
    const payEffect =
      pay > 100
        ? `<span class="gold-positive">raises morale each turn</span>`
        : pay === 100
          ? `<span class="gold-positive">halts morale decay</span>`
          : pay > 0
            ? `slows morale decay`
            : pay === 0
              ? `normal morale decay`
              : `<span class="gold-negative">speeds morale decay</span>`;
    const presets = [-100, -50, 0, 50, 100, 150, 200];
    html += `<div class="gold-section"><div class="gold-section-title">Military pay</div>`;
    html += `<div class="gold-row"><span>Upkeep <span class="sub">×${payMult.toFixed(2)} gold</span></span>` +
      `<span class="gold-amount">${pay > 0 ? "+" : ""}${pay}%</span></div>`;
    html += `<div class="gold-row"><span class="sub">Effect: ${payEffect}</span></div>`;
    // Actual gold/turn — reflects the pay floor (min 10/20/30/40 at +50/100/150/200%)
    // so a boost shows a real cost even with no units.
    const payCost = militaryUpkeepTotal(state, player);
    html += `<div class="gold-row"><span class="sub">Cost</span><span class="gold-amount ${payCost > 0 ? "gold-negative" : ""}">${payCost > 0 ? `−${payCost}` : "0"}/turn</span></div>`;
    html += `<div class="morale-pay-row">` +
      presets
        .map(
          (v) =>
            `<button class="btn morale-pay-btn ${v === pay ? "active" : ""}" data-pay="${v}">${v > 0 ? "+" : ""}${v}%</button>`,
        )
        .join("") +
      `</div>`;
    html += `</div>`;

    html += `<div class="gold-section"><div class="gold-section-title">Recent events</div>`;
    if (events.length === 0) {
      html += `<div class="gold-row"><span class="sub">No morale changes yet. Win battles, promote units, or recruit a Great Person to lift it.</span></div>`;
    } else {
      for (const e of events) {
        const cls = e.delta >= 0 ? "gold-positive" : "gold-negative";
        const sign = e.delta > 0 ? "+" : "";
        html += `<div class="gold-row"><span>${escapeHtml(e.reason)} <span class="sub">· turn ${e.turn}</span></span>` +
          `<span class="gold-amount ${cls}">${sign}${e.delta}</span></div>`;
      }
    }
    html += `</div>`;

    setPreservedHtml(moraleDialogContent, html);
    moraleDialogContent.querySelectorAll<HTMLButtonElement>("[data-pay]").forEach((el) =>
      el.addEventListener("click", () => handlers.onSetUpkeepModifier(Number(el.dataset.pay))),
    );
  };

  const renderResearch = (state: GameState): void => {
    research.classList.toggle("hidden", !researchOpen);
    if (!researchOpen) return;
    const player = state.players[state.currentPlayerIndex]!;
    const techs = availableTechs(player);
    withPreservedScroll(research, () => {
      research.innerHTML =
        dialogHeader("Choose research", "rclose") +
        `<div class="panel-dialog-body">` +
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
                  `</div><span class="cost">${scaledTechCost(state, t)}🔬</span></div>`
                );
              })
              .join("")) +
        `</div>`;
    });
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
    withPreservedScroll(techtree, () => {
      techtree.innerHTML = dialogHeader("Technology Tree", "ttclose") + `<div class="panel-dialog-body"></div>`;
      techtree.querySelector<HTMLDivElement>(".panel-dialog-body")!.appendChild(inner);
    });
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
    const capacity = civicSlotCapacity(player);

    let html = dialogHeader("Governments & Civics", "vclose") + `<div class="panel-dialog-body">`;

    if (!civicsUnlocked(player)) {
      html +=
        `<div class="locked-note">🔒 The government tree unlocks after researching <b>${TECH_DEFS[CIVICS_REQUIRED_TECH].name}</b>.</div>`;
      html += `</div>`;
      withPreservedScroll(civics, () => {
        civics.innerHTML = html;
      });
      civics.querySelector<HTMLButtonElement>("#vclose")!.addEventListener("click", () => {
        civicsOpen = false;
        civics.classList.add("hidden");
      });
      return;
    }

    // Split a civic's effects into pro (green) and con (red) blurbs by sign.
    const effectBadges = (id: string): string => {
      const d = getCivic(id);
      return d ? `<div class="sub">${d.desc}</div>` : "";
    };

    // ---- current government + unrest -------------------------------------
    html += `<div class="csub">Government — <b style="color:#fff">${gov?.name ?? "—"}</b> <span style="color:#9fc0dc">(Tier ${governmentTier(player.government)})</span></div>`;
    if (player.unrestTurns > 0) {
      html += `<div class="locked-note">⚠ Unrest: ${player.unrestTurns} turn${player.unrestTurns > 1 ? "s" : ""} — all yields −25% and civics are dormant.</div>`;
    }

    // ---- research the next government node --------------------------------
    const researchable = researchableGovernmentsFor(player);
    html += `<div class="csub">Research a government</div>`;
    if (player.researchingGovernment) {
      const rg = getGovernment(player.researchingGovernment)!;
      const rgCost = scaledGovernmentCost(state, player.researchingGovernment);
      const pct = Math.min(100, Math.round((player.cultureProgress / Math.max(1, rgCost)) * 100));
      html += `<div class="tech" style="border-color:#ffd967"><div style="flex:1"><b>Researching ${rg.name}</b><div class="sub">${player.cultureProgress}/${rgCost}🎭 (${pct}%)</div></div></div>`;
    }
    html += researchable.length
      ? researchable
          .map((id) => {
            const g = getGovernment(id)!;
            return (
              `<div class="tech" data-research-gov="${id}"><div style="flex:1">` +
              `<div><b>${g.name}</b> <span class="sub">T${g.tier} · ${g.branch.join("/") || "—"}</span></div>` +
              `<div class="sub">${g.desc}</div></div><span class="cost">${scaledGovernmentCost(state, id)}🎭</span></div>`
            );
          })
          .join("")
      : `<div style="color:#9fc0dc;font-size:12px">No new governments to research.</div>`;

    // ---- switch to a researched government --------------------------------
    const switchable = switchableGovernments(player).filter((id) => id !== player.government);
    if (switchable.length) {
      html += `<div class="csub">Switch government <span style="color:#9fc0dc">(costs unrest)</span></div>`;
      html += switchable
        .map((id) => {
          const g = getGovernment(id)!;
          const shares = gov ? gov.branch.some((b) => g.branch.includes(b)) : false;
          const cost = player.government === "chiefdom" ? "free" : shares ? "1 turn unrest" : "revolution: 3 turns";
          return (
            `<div class="tech" data-switch-gov="${id}"><div style="flex:1"><b>${g.name}</b>` +
            `<div class="sub">${g.desc}</div></div><span class="cost">${cost}</span></div>`
          );
        })
        .join("");
    }

    // ---- slotted civics ---------------------------------------------------
    html += `<div class="csub">Civics <span style="color:#9fc0dc">(${player.slottedCivics.length}/${capacity} slots)</span></div>`;
    html += player.slottedCivics.length
      ? player.slottedCivics
          .map((id) => {
            const d = getCivic(id);
            return (
              `<div class="tech" style="border-color:#ffd967;background:#27331d"><div style="flex:1">` +
              `<b>${d?.name ?? id}</b>${effectBadges(id)}</div>` +
              `<button class="btn" data-unslot="${id}">Unslot</button></div>`
            );
          })
          .join("")
      : `<div style="color:#9fc0dc;font-size:12px">No civics slotted.</div>`;

    // ---- adopt a new civic ------------------------------------------------
    const adoptable = adoptableCivics(player);
    html += `<div class="csub">Adopt a civic <span style="color:#9fc0dc">(one per turn)</span></div>`;
    html += adoptable.length
      ? adoptable
          .map((id) => {
            const d = getCivic(id)!;
            const cost = scaledCivicCost(state, d, player.civicsAdopted.size);
            return (
              `<div class="tech" data-adopt="${id}"><div style="flex:1">` +
              `<div><b>${d.name}</b> <span class="sub">T${d.tier} · ${d.branch}</span></div>${effectBadges(id)}` +
              `</div><span class="cost">${cost}🎭</span></div>`
            );
          })
          .join("")
      : `<div style="color:#9fc0dc;font-size:12px">No new civics available under this government.</div>`;

    // ---- re-slot an already-adopted civic --------------------------------
    const slottable = slottableCivics(player);
    if (slottable.length) {
      html += `<div class="csub">Slot an adopted civic</div>`;
      html += slottable
        .map((id) => {
          const d = getCivic(id)!;
          const full = player.slottedCivics.length >= capacity;
          return (
            `<div class="tech" ${full ? "" : `data-slot="${id}"`} style="${full ? "opacity:0.5" : ""}">` +
            `<div style="flex:1"><b>${d.name}</b>${effectBadges(id)}</div>` +
            `<span class="cost">${full ? "slots full" : "slot"}</span></div>`
          );
        })
        .join("");
    }

    html += `</div>`;
    withPreservedScroll(civics, () => {
      civics.innerHTML = html;
    });
    civics.querySelector<HTMLButtonElement>("#vclose")!.addEventListener("click", () => {
      civicsOpen = false;
      civics.classList.add("hidden");
    });
    civics.querySelectorAll<HTMLDivElement>("[data-research-gov]").forEach((el) =>
      el.addEventListener("click", () => {
        handlers.onResearchGovernment(el.dataset.researchGov!);
        civicsOpen = false;
        civics.classList.add("hidden");
      }),
    );
    civics.querySelectorAll<HTMLDivElement>("[data-switch-gov]").forEach((el) =>
      el.addEventListener("click", () => handlers.onSetGovernment(el.dataset.switchGov!)),
    );
    civics.querySelectorAll<HTMLDivElement>("[data-adopt]").forEach((el) =>
      el.addEventListener("click", () => handlers.onAdoptCivic(el.dataset.adopt!)),
    );
    civics.querySelectorAll<HTMLDivElement>("[data-slot]").forEach((el) =>
      el.addEventListener("click", () => handlers.onSlotCivic(el.dataset.slot!)),
    );
    civics.querySelectorAll<HTMLButtonElement>("[data-unslot]").forEach((el) =>
      el.addEventListener("click", () => handlers.onUnslotCivic(el.dataset.unslot!)),
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

    // Construction is split into three tabs by what is being built: trainable
    // units, city buildings, and standing conversion works (gold /
    // science / culture / faith). Keep the active tab on a kind with options.
    const tabs: { id: typeof prodTab; label: string }[] = [
      { id: "building", label: "Buildings" },
      { id: "trainingBuilding", label: "Military" },
      { id: "project", label: "Works" },
    ];
    const countFor = (kind: typeof prodTab) => options.filter((o) => o.item.kind === kind).length;
    if (countFor(prodTab) === 0) {
      prodTab = tabs.find((t) => countFor(t.id) > 0)?.id ?? prodTab;
    }
    const shown = options.filter((o) => o.item.kind === prodTab);

    let html = dialogHeader(`${escapeHtml(city.name)} — Construction`, "pclose", {
      extra:
        `<div class="ptabs">` +
        tabs
          .map(
            (t) =>
              `<button type="button" class="ptab${t.id === prodTab ? " active" : ""}" data-ptab="${t.id}">${t.label} <span style="opacity:.7">${countFor(t.id)}</span></button>`,
          )
          .join("") +
        `</div>`,
    });
    html += `<div class="panel-dialog-body">`;
    html += shown
      .map((o) => {
        let desc: string;
        let meta: string;
        let cost: string;
        let dataAttrs: string;
        if (o.item.kind === "project") {
          const def = getProjectDef(o.item.id);
          desc = def?.desc ?? "";
          meta = "· ongoing";
          cost = "∞";
          dataAttrs = `data-kind="project" data-id="${o.item.id}"`;
        } else if (o.item.kind === "trainingBuilding") {
          const fam = TRAINING_BUILDING_DEFS[o.item.family];
          const t = trainingTier(o.item.family, o.item.tier);
          desc = `Trains ${fam.classes.join("/")} units · ${t.slots} slot${t.slots === 1 ? "" : "s"} · +${t.moraleBonus} morale · +${t.xp} XP`;
          meta = `· ${turns(o.cost)} turns`;
          cost = `${o.cost}⚒️`;
          dataAttrs = `data-kind="trainingBuilding" data-family="${o.item.family}" data-tier="${o.item.tier}"`;
        } else {
          desc = buildingInfo(o.item.id);
          meta = `· ${turns(o.cost)} turns`;
          cost = `${o.cost}⚒️`;
          dataAttrs = `data-kind="building" data-id="${o.item.id}"`;
        }
        // No leading icon — the names read as a clean left-aligned column.
        return (
          `<div class="pcard" ${dataAttrs}>` +
          `<div style="flex:1"><div><b>${o.name}</b> <span class="sub">${meta}</span></div>` +
          `<div class="sub">${desc}</div></div>` +
          `<span class="cost">${cost}</span></div>`
        );
      })
      .join("");
    if (!shown.length) html += `<div class="sub" style="margin-top:10px">Nothing available here yet.</div>`;
    html += `</div>`;
    withPreservedScroll(production, () => {
      production.innerHTML = html;
    });
    production.querySelector<HTMLButtonElement>("#pclose")!.addEventListener("click", (e) => {
      e.stopPropagation();
      productionOpen = false;
      production.classList.add("hidden");
    });
    production.querySelectorAll<HTMLButtonElement>("[data-ptab]").forEach((el) =>
      el.addEventListener("click", () => {
        prodTab = el.dataset.ptab as typeof prodTab;
        renderProduction(state);
      }),
    );
    production.querySelectorAll<HTMLDivElement>(".pcard").forEach((el) =>
      el.addEventListener("click", () => {
        const kind = el.dataset.kind;
        const item: ProductionItem =
          kind === "trainingBuilding"
            ? { kind: "trainingBuilding", family: el.dataset.family as TrainingClass, tier: Number(el.dataset.tier) }
            : ({ kind, id: el.dataset.id } as ProductionItem);
        handlers.onSetProduction(item);
        productionOpen = false;
        production.classList.add("hidden");
      }),
    );
  };

  // Specialists sub-dialog (opened from the city panel, mirrors the construction
  // dialog). Train/release craftsmen and watch the public works they labour on.
  const renderSpecialists = (state: GameState): void => {
    specialists.classList.toggle("hidden", !specialistsOpen);
    if (!specialistsOpen) return;
    const city = specCityId != null ? state.cities.get(specCityId) : null;
    if (!city) {
      specialistsOpen = false;
      specialists.classList.add("hidden");
      return;
    }
    const player = state.players.find((p) => p.id === city.ownerId)!;
    const free = workerSlots(city);
    const avail = availableSpecialists(player);

    const specRows = avail
      .map((id) => {
        const def = SPECIALIST_DEFS[id];
        const mine = city.specialists.filter((s) => s.type === id);
        return (
          `<div class="row" style="justify-content:space-between;gap:6px;margin-top:6px">` +
          `<span title="${def.latin} — ${def.desc}">${def.name} <b style="color:#fff">×${mine.length}</b></span>` +
          `<span style="display:flex;gap:4px">` +
          `<button class="btn" data-spec-minus="${id}"${mine.length ? "" : " disabled"}>−</button>` +
          `<button class="btn" data-spec-plus="${id}"${free > 0 ? "" : " disabled"}>＋</button>` +
          `</span></div>`
        );
      })
      .join("");

    // Works this city hosts or contributes craftsmen to. With manual assignment a
    // work only progresses while staffed, so surface the crew size, labour/turn and
    // ETA here (read-only — staffing is done from the tile's panel).
    const cityWorks = state.works.filter(
      (w) => w.ownerId === player.id && (w.hostCityId === city.id || w.cityIds.includes(city.id)),
    );
    const worksHtml = cityWorks.length
      ? `<div class="csub" style="margin-top:12px">Public works</div>` +
        cityWorks
          .map((w) => {
            const req = Object.values(w.requirement).reduce((a, b) => a + (b ?? 0), 0);
            const done = Object.values(w.progress).reduce((a: number, b) => a + Math.min(req, b ?? 0), 0);
            const pct = req > 0 ? Math.floor((done / req) * 100) : 0;
            const label = w.kind === "wonder" ? getWonder(w.wonderId ?? "")?.name ?? "Wonder" : workName(w.kind, w.tier ?? 1);
            const rate = Object.values(workLabourPerTurn(state, w)).reduce((a, b) => a + (b ?? 0), 0);
            const eta = workEtaTurns(state, w);
            const status = rate <= 0 ? "⏸ idle" : eta === Infinity ? "⏸ understaffed" : `+${rate.toFixed(1)}/t · ~${eta}t`;
            return `<div class="sub" style="margin-top:4px">${escapeHtml(label)} — ${pct}% · 👷${w.assignedSpecialistIds.length} · ${status}<div class="bar"><i style="width:${pct}%;background:#c9a24a"></i></div></div>`;
          })
          .join("")
      : `<div class="sub" style="margin-top:12px">No public works under way. Train craftsmen, then develop a tile from its panel.</div>`;

    withPreservedScroll(specialists, () => {
      specialists.innerHTML =
        dialogHeader(`${escapeHtml(city.name)} — Specialists`, "spclose", {
          subtitle: `${city.specialists.length} trained · ${free} free slots`,
        }) +
        `<div class="panel-dialog-body">` +
        specRows +
        worksHtml +
        `</div>`;
    });

    specialists.querySelector<HTMLButtonElement>("#spclose")!.addEventListener("click", (e) => {
      e.stopPropagation();
      specialistsOpen = false;
      specialists.classList.add("hidden");
    });
    specialists.querySelectorAll<HTMLButtonElement>("[data-spec-plus]").forEach((el) =>
      el.addEventListener("click", () => handlers.onConvertCitizen(city.id, el.dataset.specPlus!, 1)),
    );
    specialists.querySelectorAll<HTMLButtonElement>("[data-spec-minus]").forEach((el) =>
      el.addEventListener("click", () => handlers.onConvertCitizen(city.id, el.dataset.specMinus!, -1)),
    );
  };

  // Training sub-dialog (opened from the city panel, mirrors the construction dialog).
  // Each unit trained costs a citizen; the building family's tier sets speed/morale/XP
  // and how many can train at once.
  const renderTraining = (state: GameState): void => {
    training.classList.toggle("hidden", !trainingOpen);
    if (!trainingOpen) return;
    const city = trainCityId != null ? state.cities.get(trainCityId) : null;
    if (!city) {
      trainingOpen = false;
      training.classList.add("hidden");
      return;
    }
    const player = state.players.find((p) => p.id === city.ownerId)!;
    const trainable = availableTraining(state, player, city);
    const free = freeCitizens(city);

    if (trainCityId !== trainExpandedForCityId) {
      trainExpandedForCityId = trainCityId;
      // Open the city-center fold by default so scouts/settlers are visible immediately.
      trainExpandedSections = new Set(["city"]);
    }

    const foldSection = (key: string, labelHtml: string, bodyHtml: string): string => {
      const open = trainExpandedSections.has(key);
      return (
        `<button type="button" class="train-fold${open ? " open" : ""}" data-train-fold="${key}">` +
        `<span class="train-fold-label">${labelHtml}</span>` +
        `<span class="train-chevron">▸</span>` +
        `</button>` +
        `<div class="train-fold-body">${bodyHtml}</div>`
      );
    };

    const unitButton = (type: UnitTypeId): string => {
      const can = canStartTraining(state, city, type);
      const t = trainingTimeInCity(state, city, type);
      const uu = uniqueUnitForCiv(player.civId, type);
      const name = uu?.name ?? UNIT_DEFS[type].name;
      // Religion unique units carry a signature kit — surface it in the tooltip.
      const kit = religionUnitKit(type);
      // UU: list ability names and combat bonus in the tooltip.
      const uuAbilityNames = uu
        ? unitActiveAbilityIds(type, uu.id)
            .map((a) => ACTIVE_ABILITY_DEFS[a]?.name ?? a)
            .join(", ")
        : "";
      const uuDesc = uu
        ? `\n★ Unique Unit — +${uu.bonus} combat${uuAbilityNames ? ` · ${uuAbilityNames}` : ""}`
        : "";
      const title =
        (can.ok ? `Train ${name} — ${t} turns, costs 1 citizen` : can.error ?? "") +
        uuDesc +
        (kit ? `\n${kit.abilityName}: ${kit.desc}` : "");
      return (
        `<button class="btn${uu ? " primary" : ""}" data-train="${type}" title="${escapeHtml(title)}"${can.ok ? "" : " disabled"}>` +
        `${uu ? `<span style="color:#ffd967;margin-right:3px">★</span>` : ""}${escapeHtml(name)} <span class="sub">${t}t${uu ? ` ·+${uu.bonus}⚔️` : ""}</span></button>`
      );
    };

    const families: TrainingClass[] = ["barracks", "archery_range", "stable", "siege_workshop", "shipyard"];
    const sections: string[] = [];
    for (const fam of families) {
      const tier = city.training[fam] ?? 0;
      // Skip families the city hasn't built yet — they belong in Construction, and
      // listing them here only clutters the pick-a-unit view.
      if (tier <= 0) continue;
      const def = TRAINING_BUILDING_DEFS[fam];
      const slots = trainSlots(state, city, fam);
      const inUse = city.trainingQueue.filter((o) => trainingClassFor(o.unit) === fam && !UNIT_DEFS[o.unit].religionUnit).length;
      // Religion units train from the Temple (own section below), never the family.
      const units = trainable.filter((u) => trainingClassFor(u) === fam && !UNIT_DEFS[u].religionUnit);
      sections.push(
        foldSection(
          fam,
          `${trainingIconImg(fam, def.glyph, 20)} <b>${def.name}</b> <span class="sub">Tier ${tier} · ${inUse}/${slots} slots</span>`,
          `<div class="row" style="flex-wrap:wrap;gap:4px">${units.map(unitButton).join("") || `<span class="sub">No units available yet.</span>`}</div>`,
        ),
      );
    }

    const civ = trainable.filter((u) => trainingClassFor(u) === null && !UNIT_DEFS[u].religionUnit);
    if (civ.length) {
      sections.push(
        foldSection(
          "city",
          `🏙️ <b>City Center</b> <span class="sub">civilians & scouts</span>`,
          `<div class="row" style="flex-wrap:wrap;gap:4px">${civ.map(unitButton).join("")}</div>`,
        ),
      );
    }

    // A faith's unique unit musters from the Temple of any follower city (one at a time).
    const holyUnits = trainable.filter((u) => UNIT_DEFS[u].religionUnit);
    if (holyUnits.length) {
      sections.push(
        foldSection(
          "temple",
          `⛪ <b>Temple</b> <span class="sub">holy orders · one at a time</span>`,
          `<div class="row" style="flex-wrap:wrap;gap:4px">${holyUnits.map(unitButton).join("")}</div>`,
        ),
      );
    }

    const orders = city.trainingQueue.length
      ? `<div class="csub" style="margin-top:4px">Training now</div>` +
        city.trainingQueue
          .map((o) => {
            const name = uniqueUnitForCiv(player.civId, o.unit)?.name ?? UNIT_DEFS[o.unit].name;
            const rushCost = trainingRushCost(o, "gold", rushSurcharge(player, state.turn));
            const canRush = rushCost != null && player.gold >= rushCost;
            const rushBtn =
              rushCost != null
                ? `<button type="button" class="btn" data-rush-train="${o.id}" title="Rush with gold"${canRush ? "" : " disabled"}>⚡${rushCost}🪙</button>`
                : "";
            return (
              `<div class="row" style="justify-content:space-between;gap:6px;margin-top:4px">` +
              `<span>${UNIT_DEFS[o.unit].glyph} ${escapeHtml(name)} <span class="sub">${o.turnsLeft}t left</span></span>` +
              `<span style="display:flex;gap:4px">${rushBtn}<button type="button" class="btn" data-cancel-train="${o.id}" title="Cancel — returns the citizen">✕</button></span></div>`
            );
          })
          .join("")
      : "";

    withPreservedScroll(training, () => {
      training.innerHTML =
        dialogHeader(`${escapeHtml(city.name)} — Train Units`, "trclose", {
          subtitle: `👥 ${city.population} pop · ${free} free citizen${free === 1 ? "" : "s"} · each unit costs 1 citizen`,
        }) +
        `<div class="panel-dialog-body">` +
        orders +
        sections.join("") +
        (sections.length === 0 && !orders ? `<div class="sub" style="margin-top:8px">Build military buildings in Construction to train units here.</div>` : "") +
        `</div>`;
    });

    training.querySelector<HTMLButtonElement>("#trclose")!.addEventListener("click", (e) => {
      e.stopPropagation();
      trainingOpen = false;
      training.classList.add("hidden");
    });
    training.querySelectorAll<HTMLButtonElement>("[data-train-fold]").forEach((el) =>
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const key = el.dataset.trainFold!;
        if (trainExpandedSections.has(key)) trainExpandedSections.delete(key);
        else trainExpandedSections.add(key);
        renderTraining(state);
      }),
    );
    training.querySelectorAll<HTMLButtonElement>("[data-train]").forEach((el) =>
      el.addEventListener("click", () => handlers.onStartTraining(city.id, el.dataset.train as UnitTypeId)),
    );
    training.querySelectorAll<HTMLButtonElement>("[data-cancel-train]").forEach((el) =>
      el.addEventListener("click", () => handlers.onCancelTraining(city.id, Number(el.dataset.cancelTrain))),
    );
    training.querySelectorAll<HTMLButtonElement>("[data-rush-train]").forEach((el) =>
      el.addEventListener("click", () => handlers.onRushTraining(city.id, Number(el.dataset.rushTrain), "gold")),
    );
  };

  const REL_STYLE = `<style>
    #religion .rel-emblem{vertical-align:middle;margin-right:6px;object-fit:contain}
    #religion .rel-row{display:flex;align-items:center;gap:2px}
    #religion .rel-pick-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(128px,1fr));gap:10px;margin-top:6px}
    #religion .rel-pick-card{border:1px solid var(--edge,#3a352a);border-radius:10px;overflow:hidden;cursor:pointer;background:rgba(255,255,255,.03);transition:border-color .12s,transform .06s}
    #religion .rel-pick-card:hover{border-color:#ffd967}
    #religion .rel-pick-card:active{transform:translateY(1px)}
    #religion .rel-pick-art{width:100%;height:96px;background:#15120c;overflow:hidden}
    #religion .rel-pick-art img{width:100%;height:100%;object-fit:cover;object-position:50% 28%;display:block}
    #religion .rel-pick-body{padding:8px 9px}
    #religion .rel-pick-name{display:flex;align-items:center;gap:6px;color:#e8dcc5}
    #religion .rel-pick-emblem{width:18px;height:18px;object-fit:contain}
    #religion .rel-pick-actions{margin-top:6px}
    #religion .rel-chosen{display:flex;align-items:center;gap:10px;margin-top:8px;padding:8px 10px;border:1px solid #ffd967;border-radius:10px;background:#27331d}
    #religion .rel-chosen-emblem{width:40px;height:40px;object-fit:contain;flex:0 0 auto}
    #religion .rel-chosen .rel-change{margin-left:auto;flex:0 0 auto}
    #religion .rel-mine-art{width:100%;aspect-ratio:4/3;border-radius:10px;overflow:hidden;margin:6px 0;border:1px solid var(--edge,#3a352a);background:#15120c}
    #religion .rel-mine-art img{width:100%;height:100%;object-fit:cover;object-position:50% 25%;display:block}
    #religion .rel-mine-head{display:flex;align-items:center;gap:8px;margin-top:4px}
    #religion .rel-tier-badge{flex:0 0 auto;padding:1px 6px;border:1px solid #c9a24a;border-radius:8px;background:rgba(201,162,74,.15);color:#ffd967;font-size:11px;line-height:1.4;white-space:nowrap}
    #religion .rel-kit-line{margin-top:3px}
  </style>`;

  const renderReligion = (state: GameState): void => {
    religionPanel.classList.toggle("hidden", !religionOpen);
    if (!religionOpen) return;
    const player = state.players[state.currentPlayerIndex]!;
    const totalCities = state.cities.size;
    let html = REL_STYLE + dialogHeader("Religion", "relclose") + `<div class="panel-dialog-body">`;
    const myRel = religionById(state, player.foundedReligionId);
    /** Small emblem <img> for a founded religion (matched by name), or "" if none. */
    const relEmblem = (name: string, size = 18): string => {
      const def = getReligionByName(name);
      return def ? `<img class="rel-emblem" style="width:${size}px;height:${size}px" src="${assetUrl(`religion-icons/${def.id}.png`)}" alt="" onerror="this.style.display='none'">` : "";
    };
    /** The "World religions" follower tally, shared by every branch below. */
    const worldReligionsHtml = (): string =>
      !state.religions.length
        ? ""
        : `<div class="csub">World religions</div>` +
          state.religions
            .map((r) => `<div class="sub rel-row">${relEmblem(r.name)}<span>${r.name} — Tier ${r.tier} · ${cityFollowerCount(state, r.id)} cities</span></div>`)
            .join("");

    if (!myRel && !religionUnlocked(state, player.id)) {
      html += `<div class="locked-note">🔒 Religion unlocks after researching <b>${TECH_DEFS[RELIGION_REQUIRED_TECH].name}</b>. Then build Shrines/Temples to earn faith.</div>`;
      html += worldReligionsHtml();
      html += `</div>`;
      withPreservedScroll(religionPanel, () => {
        religionPanel.innerHTML = html;
      });
      religionPanel.querySelector<HTMLButtonElement>("#relclose")!.addEventListener("click", () => {
        religionOpen = false;
        religionPanel.classList.add("hidden");
      });
      return;
    }

    // Faith income breakdown — the same per-city rundown the treasury (gold) dialog
    // gives, so it's clear where each turn's faith actually comes from.
    const faithCities = citiesOf(state, player.id);
    const faithRows = faithCities
      .map((c) => {
        const f = cityDisplayYields(state, c).faith;
        return `<div class="gold-row"><span>${escapeHtml(c.name)}${c.isCapital ? " ★" : ""}</span><span class="gold-amount gold-positive">+${f}</span></div>`;
      })
      .join("");
    const totalFaith = faithCities.reduce((n, c) => n + cityDisplayYields(state, c).faith, 0);
    html += `<div class="gold-section"><div class="gold-section-title">Faith / turn</div>`;
    html += faithRows || `<div class="gold-row"><span class="sub">No cities producing faith yet — build Shrines and Temples.</span><span class="gold-amount">0</span></div>`;
    html += `<div class="gold-total"><span>Total faith</span><span class="gold-amount gold-positive">+${totalFaith}</span></div></div>`;

    if (myRel) {
      const holy = state.cities.get(myRel.holyCityId);
      const def = getReligionByName(myRel.name);
      const kit = getReligionKit(def?.id);
      const followers = majorityFollowerCount(state, myRel.id);
      if (def) html += `<div class="rel-mine-art"><img src="${assetUrl(`religions/${def.id}.png`)}" alt="${myRel.name}" onerror="this.style.display='none'"></div>`;
      html += `<div class="rel-mine-head">${relEmblem(myRel.name, 24)}<b style="font-size:15px">${myRel.name}</b><span class="rel-tier-badge">Tier ${myRel.tier}/${MAX_RELIGION_TIER}</span>${def ? wikiBtn(`religion:${def.id}`, "📖") : ""}</div>`;
      html += `<div class="sub">Holy city: <b style="color:#fff">${escapeHtml(holy?.name ?? "—")}</b> · Following <b style="color:#fff">${cityFollowerCount(state, myRel.id)}/${totalCities}</b> cities · <b style="color:#fff">${followers}</b> majority</div>`;

      if (kit) {
        html += `<div class="csub">Empire benefit</div>`;
        html += `<div class="sub">✨ <b style="color:#fff">${kit.preset.name}</b> — ${kit.preset.desc}</div>`;
        html += `<div class="csub">Holy capital${holy ? ` — ${escapeHtml(holy.name)}` : ""}</div>`;
        html += `<div class="sub">👑 <b style="color:#fff">${kit.capital.name}</b> — ${kit.capital.desc}</div>`;
      }
      // Move the holy capital to another majority-follower city the player owns.
      const moveTargets = [...state.cities.values()].filter(
        (c) => c.ownerId === player.id && c.id !== myRel.holyCityId && majorityReligion(c) === myRel.id,
      );
      if (moveTargets.length) {
        const canMove = player.faith >= MOVE_HOLY_CITY_COST;
        html += `<div class="sub" style="margin-top:4px">Move the holy capital — ${MOVE_HOLY_CITY_COST}☮️:</div>`;
        html += `<div class="row" style="flex-wrap:wrap;gap:4px;margin-top:2px">${moveTargets
          .map((c) => {
            const title = canMove ? `Move the holy capital to ${c.name} for ${MOVE_HOLY_CITY_COST} faith` : `needs ${MOVE_HOLY_CITY_COST} faith`;
            return `<button class="btn" data-move-holy="${c.id}" title="${escapeHtml(title)}"${canMove ? "" : " disabled"}>⛪ ${escapeHtml(c.name)}</button>`;
          })
          .join("")}</div>`;
      }

      // Tier upgrade — flat faith cost + a minimum of majority-follower cities.
      const req = nextTierRequirement(state, myRel.id);
      if (req) {
        const can = canUpgradeReligion(state, player.id);
        html += `<div class="csub">Next tier</div>`;
        html += `<div class="sub">Tier ${req.tier}: ${req.faithCost}☮️ · ${req.minFollowerCities} follower cities (have ${followers}). Each tier grants one belief pick.</div>`;
        html += `<button class="btn${can.ok ? " primary" : ""}" id="rel-upgrade"${can.ok ? "" : " disabled"} title="${escapeHtml(can.ok ? `Upgrade ${myRel.name} to tier ${req.tier}` : can.error ?? "")}" style="width:100%;margin-top:4px">` +
          `⬆ Upgrade to Tier ${req.tier} — ${req.faithCost}☮️${can.ok ? "" : ` <span class="sub">(${escapeHtml(can.error ?? "")})</span>`}</button>`;
      } else {
        html += `<div class="csub">Next tier</div><div class="sub">🏆 ${myRel.name} has reached the highest tier.</div>`;
      }

      html += `<div class="csub">Beliefs</div>`;
      html += myRel.beliefs.length
        ? myRel.beliefs.map((b) => {
            const bd = getBelief(b);
            return `<div class="sub">• <b style="color:#fff">${bd?.name}</b>${bd ? ` <span class="rel-tier-badge">T${bd.tier}</span>` : ""} — ${bd?.desc}</div>`;
          }).join("")
        : `<div class="sub">No beliefs chosen.</div>`;

      // Unspent perk picks — one is earned at founding and one per tier gained.
      // The pool is shared and exclusive: a belief claimed by ANY faith is gone.
      const pending = pendingPerkPicks(state, myRel.id);
      if (pending > 0) {
        const perks = [...availablePerks(state, myRel.id)].sort((a, b) => a.tier - b.tier || a.name.localeCompare(b.name));
        html += `<div class="csub">Choose a belief — ${pending} pick${pending === 1 ? "" : "s"} left</div>`;
        html += `<div class="sub" style="margin-bottom:4px">Beliefs are exclusive across all religions; you may pick any tier up to ${myRel.tier}.</div>`;
        html += perks.length
          ? perks.map((b) => `<div class="tech" data-perk="${b.id}"><div style="flex:1"><b>${b.name}</b> <span class="rel-tier-badge">T${b.tier}</span><div class="sub">${b.desc}</div></div></div>`).join("")
          : `<div class="sub">Every remaining belief has been claimed by a rival faith.</div>`;
      }

      // The faith's unique unit — trained from Temples in follower cities.
      const ukit = kit ? religionUnitKit(kit.unit.id as UnitTypeId) : undefined;
      if (kit && ukit) {
        const udef = UNIT_DEFS[kit.unit.id as UnitTypeId];
        html += `<div class="csub">Unique unit</div>`;
        html += `<div class="sub">${udef?.glyph ?? "⚔"} <b style="color:#fff">${kit.unit.name}</b> — ${kit.unit.blurb}</div>`;
        html += `<div class="sub">📜 <b style="color:#fff">${ukit.abilityName}</b> — ${ukit.desc}</div>`;
        if (ukit.tier4Active) {
          const a4 = ACTIVE_ABILITY_DEFS[ukit.tier4Active];
          html += `<div class="sub">🔓 <b style="color:#fff">${a4.name}</b> ${myRel.tier >= 4 ? "— unlocked" : "— unlocks at tier 4"}</div>`;
        }
        const tierNote = myRel.tier > 1
          ? `Tier ${myRel.tier}: +${2 * (myRel.tier - 1)} strength, aura magnitudes +${25 * (myRel.tier - 1)}%.`
          : `Gains +2 strength and +25% aura magnitudes per tier above 1.`;
        html += `<div class="sub">Trained in any follower city with a Temple. ${tierNote}</div>`;
      }
    } else if (canFoundReligion(state, player.id)) {
      const holy = [...state.cities.values()].find((c) => c.ownerId === player.id);
      const names = availableReligionNames(state);
      // Keep the picked religion valid (a rival may have founded it since last render).
      if (chosenReligionName && !names.includes(chosenReligionName)) chosenReligionName = null;
      html += `<div class="csub">Found a Religion</div>`;
      html += `<div class="sub">Holy city: <b style="color:#fff">${holy?.name}</b></div>`;

      if (!chosenReligionName) {
        // Step 1 — pick the faith from an artwork grid (each card links to the wiki).
        html += `<div class="csub">Choose your faith</div>`;
        html += `<div class="rel-pick-grid">`;
        html += names
          .map((n) => {
            const def = getReligionByName(n);
            if (!def) return "";
            const art = assetUrl(`religions/${def.id}.png`);
            const icon = assetUrl(`religion-icons/${def.id}.png`);
            const kit = getReligionKit(def.id);
            const kitLine = kit
              ? `<div class="sub rel-kit-line">✨ ${kit.preset.name} · ${UNIT_DEFS[kit.unit.id as UnitTypeId]?.glyph ?? "⚔"} ${kit.unit.name}</div>`
              : "";
            return (
              `<div class="rel-pick-card" data-relpick="${n}">` +
              `<div class="rel-pick-art"><img src="${art}" loading="lazy" alt="${def.name}" onerror="this.style.display='none'"></div>` +
              `<div class="rel-pick-body">` +
              `<div class="rel-pick-name"><img class="rel-pick-emblem" src="${icon}" alt="" onerror="this.style.display='none'"><b>${def.name}</b></div>` +
              `<div class="sub">${def.blurb}</div>` +
              kitLine +
              `<div class="rel-pick-actions">${wikiBtn(`religion:${def.id}`, "📖 Wiki")}</div>` +
              `</div></div>`
            );
          })
          .join("");
        html += `</div>`;
      } else {
        // Step 2 — the chosen faith (with its preset kit preview), then ONE
        // founding belief from the shared tier-1 pool (exclusive across faiths).
        const def = getReligionByName(chosenReligionName)!;
        const icon = assetUrl(`religion-icons/${def.id}.png`);
        const kit = getReligionKit(def.id);
        html += `<div class="rel-chosen"><img class="rel-chosen-emblem" src="${icon}" alt="" onerror="this.style.display='none'"><div><b style="color:#fff">${def.name}</b><div class="sub">${def.blurb}</div></div>` +
          `<button class="btn rel-change" id="rel-change" title="Pick a different faith">Change</button></div>`;
        if (kit) {
          html += `<div class="csub">What ${def.name} grants</div>`;
          html += `<div class="sub rel-kit-line">✨ <b style="color:#fff">${kit.preset.name}</b> (empire benefit) — ${kit.preset.desc}</div>`;
          html += `<div class="sub rel-kit-line">👑 <b style="color:#fff">${kit.capital.name}</b> (holy capital) — ${kit.capital.desc}</div>`;
          html += `<div class="sub rel-kit-line">${UNIT_DEFS[kit.unit.id as UnitTypeId]?.glyph ?? "⚔"} <b style="color:#fff">${kit.unit.name}</b> (unique unit) — ${kit.unit.blurb}</div>`;
        }
        const taken = takenPerkIds(state);
        // A rival may have claimed the picked belief since last render.
        chosenBeliefs = chosenBeliefs.filter((b) => !taken.has(b));
        const founding = BELIEFS.filter((b) => b.tier === 1 && !taken.has(b.id));
        html += `<div class="csub">Choose 1 founding belief (${chosenBeliefs.length}/1)</div>`;
        html += `<div class="sub" style="margin-bottom:4px">Beliefs are exclusive across religions. More picks unlock as your faith gains tiers.</div>`;
        html += founding.map((b) => {
          const on = chosenBeliefs.includes(b.id);
          return `<div class="tech" data-belief="${b.id}" style="${on ? "border-color:#ffd967;background:#27331d" : ""}"><div style="flex:1"><b>${b.name}</b><div class="sub">${b.desc}</div></div>${on ? "✓" : ""}</div>`;
        }).join("");
        const ready = chosenBeliefs.length === 1;
        html += `<button class="btn primary" id="found-rel"${ready ? "" : " disabled"} title="${ready ? `Found ${def.name}` : "Pick a founding belief first"}" style="width:100%;margin-top:8px">Found ${def.name} ☮️</button>`;
      }
    } else {
      const pct = Math.min(100, (player.faith / FAITH_TO_FOUND) * 100);
      const allFounded = state.religions.length >= state.players.filter((p) => !p.isBarbarian).length;
      html += `<div class="csub">Faith</div>`;
      html += `<div>${Math.floor(player.faith)}/${FAITH_TO_FOUND} to found a religion<div class="bar"><i style="width:${pct}%;background:#7ad0a0"></i></div></div>`;
      html += `<div class="sub" style="margin-top:6px">Build Shrines and Temples to generate faith.${allFounded ? " All religions have been founded." : ""}</div>`;
    }

    html += worldReligionsHtml();

    // Holy Orders — buy missionaries/inquisitors with faith (once you follow a faith).
    const myCity = [...state.cities.values()].find((c) => c.ownerId === player.id);
    const followsFaith = [...state.cities.values()].some((c) => c.ownerId === player.id && c.religion);
    if (myCity && religionUnlocked(state, player.id) && (player.foundedReligionId || followsFaith)) {
      const orders: ("missionary" | "apostle" | "inquisitor")[] = ["missionary", "apostle", "inquisitor"];
      html += `<div class="csub">Holy Orders</div>`;
      html += `<div class="sub" style="margin-bottom:4px">Spend faith to ordain religious units in your nearest city.</div>`;
      html += orders
        .map((t) => {
          const cost = religiousUnitCost(t);
          const can = player.faith >= cost;
          return `<button class="btn${can ? " primary" : ""}" data-buyrel="${t}" ${can ? "" : "disabled"} style="width:100%;margin-top:4px">${UNIT_DEFS[t].glyph} ${UNIT_DEFS[t].name} — ${cost}☮️</button>`;
        })
        .join("");
    }

    html += `</div>`;
    withPreservedScroll(religionPanel, () => {
      religionPanel.innerHTML = html;
    });
    religionPanel.querySelectorAll<HTMLButtonElement>("[data-buyrel]").forEach((el) =>
      el.addEventListener("click", () => {
        if (myCity) handlers.onBuyReligiousUnit(myCity.id, el.dataset.buyrel as "missionary" | "apostle" | "inquisitor");
      }),
    );
    religionPanel.querySelector<HTMLButtonElement>("#relclose")!.addEventListener("click", () => {
      religionOpen = false;
      religionPanel.classList.add("hidden");
    });
    religionPanel.querySelectorAll<HTMLDivElement>("[data-belief]").forEach((el) =>
      el.addEventListener("click", () => {
        const id = el.dataset.belief!;
        // One founding belief: clicking selects it, clicking again deselects.
        chosenBeliefs = chosenBeliefs[0] === id ? [] : [id];
        renderReligion(state);
      }),
    );
    religionPanel.querySelector<HTMLButtonElement>("#rel-upgrade")?.addEventListener("click", () => handlers.onUpgradeReligion());
    religionPanel.querySelectorAll<HTMLDivElement>("[data-perk]").forEach((el) =>
      el.addEventListener("click", () => handlers.onPickReligionPerk(el.dataset.perk!)),
    );
    religionPanel.querySelectorAll<HTMLButtonElement>("[data-move-holy]").forEach((el) =>
      el.addEventListener("click", () => handlers.onMoveHolyCity(Number(el.dataset.moveHoly))),
    );
    // Step 1: pick a faith card (ignore clicks that landed on the card's Wiki button).
    religionPanel.querySelectorAll<HTMLDivElement>("[data-relpick]").forEach((el) =>
      el.addEventListener("click", (e) => {
        if ((e.target as HTMLElement).closest("[data-wiki-open]")) return;
        chosenReligionName = el.dataset.relpick!;
        renderReligion(state);
      }),
    );
    religionPanel.querySelector<HTMLButtonElement>("#rel-change")?.addEventListener("click", () => {
      chosenReligionName = null;
      renderReligion(state);
    });
    wireWikiButtons(religionPanel); // 📖 buttons on the faith cards deep-link into the wiki
    religionPanel.querySelector<HTMLButtonElement>("#found-rel")?.addEventListener("click", () => {
      const holy = [...state.cities.values()].find((c) => c.ownerId === player.id);
      if (!holy || !chosenReligionName) return;
      handlers.onFoundReligion(holy.id, chosenReligionName, [...chosenBeliefs]);
      chosenBeliefs = [];
      chosenReligionName = null;
      religionOpen = false;
      religionPanel.classList.add("hidden");
    });
  };

  const VICTORY_META: Record<string, { icon: string; name: string; color: string }> = {
    domination: { icon: "⚔️", name: "Domination", color: "#e0533d" },
    science: { icon: "🔬", name: "Science", color: "#5ac8e0" },
    culture: { icon: "🎭", name: "Culture", color: "#c060d0" },
    religious: { icon: "☮️", name: "Religious", color: "#7ad0a0" },
    economic: { icon: "🪙", name: "Economic", color: "#e0b53d" },
    score: { icon: "🏆", name: "Score", color: "#cdbf9f" },
    extinction: { icon: "☠️", name: "Extinction", color: "#9aa0a6" },
  };

  const renderGreatPeople = (state: GameState): void => {
    greatPeoplePanel.classList.toggle("hidden", !greatPeopleOpen);
    if (!greatPeopleOpen) return;
    const player = state.players[state.currentPlayerIndex]!;
    const perTurn = playerGreatPersonPerTurn(state, player.id);
    const ready = (player.greatPeople ?? []).map((id) => getGreatPerson(id)).filter(Boolean);

    let html = dialogHeader("🎖️ Great People", "gpclose");
    html += `<div class="panel-dialog-body">`;
    html += `<div class="sub">Build the right buildings to earn class points. When a pool fills you recruit the next great figure, there are only so many to go round.</div>`;

    // Recruited figures awaiting activation.
    html += `<div class="csub">Recruited (${ready.length})</div>`;
    if (ready.length === 0) {
      html += `<div class="sub">No Great People are waiting. Keep earning points below.</div>`;
    } else {
      html += ready
        .map((g) => {
          const info = GREAT_PERSON_CLASS_INFO[g!.cls];
          return (
            `<div class="tech gp-card" data-gp="${g!.id}">` +
            `<img class="gp-portrait" src="${ASSET_BASE_URL}great-people/${g!.id}.png" alt="" onerror="this.style.display='none'">` +
            `<div style="flex:1;min-width:0">` +
            `<b>${info.glyph} ${g!.name}</b> <span class="sub">· ${info.name} · ${g!.era}</span>` +
            `<div class="sub">${g!.desc}</div></div>` +
            `<div class="gp-actions">` +
            `<button class="btn primary" data-gp-use="${g!.id}">Activate</button>` +
            wikiBtn(`greatPerson:${g!.id}`) +
            `</div></div>`
          );
        })
        .join("");
    }

    // Per-class progress toward the next figure.
    html += `<div class="csub">Progress</div>`;
    html += GREAT_PERSON_CLASSES.map((cls) => {
      const info = GREAT_PERSON_CLASS_INFO[cls];
      const pts = Math.floor(player.greatPeoplePoints?.[cls] ?? 0);
      const earned = player.greatPeopleEarned?.[cls] ?? 0;
      const next = nextAvailableFigure(state, cls as GreatPersonClass, player);
      const per = perTurn[cls] ?? 0;
      if (!next) {
        const poolLeft = greatPeopleOfClass(cls as GreatPersonClass).some(
          (g) => !(state.recruitedGreatPeople ?? []).includes(g.id) && eraUnlocked(player, g.era),
        );
        if (!poolLeft) {
          return `<div class="sub">${info.glyph} <b>${info.name}</b> — all figures recruited</div>`;
        }
        return `<div class="sub">${info.glyph} <b>${info.name}</b> — advance to a later era to unlock the next figure</div>`;
      }
      const cost = greatPersonThreshold(earned);
      const pct = Math.min(100, (pts / cost) * 100);
      return (
        `<div class="gp-progress">` +
        `<img class="gp-portrait gp-portrait-sm" src="${ASSET_BASE_URL}great-people/${next.id}.png" alt="" onerror="this.style.display='none'">` +
        `<div class="gp-progress-body">` +
        `<div>${info.glyph} <b>${next.name}</b> ` +
        `<span class="sub">· ${info.name}${per ? ` · +${per}/turn` : ""}</span> ` +
        wikiBtn(`greatPerson:${next.id}`) +
        `</div>` +
        `<div class="bar"><i style="width:${pct}%;background:#d9b44a"></i></div>` +
        `<span class="sub">${pts}/${cost}</span></div></div>`
      );
    }).join("");

    html += `</div>`;
    withPreservedScroll(greatPeoplePanel, () => {
      greatPeoplePanel.innerHTML = html;
    });
    greatPeoplePanel.querySelector<HTMLButtonElement>("#gpclose")!.addEventListener("click", () => {
      greatPeopleOpen = false;
      greatPeoplePanel.classList.add("hidden");
    });
    greatPeoplePanel.querySelectorAll<HTMLButtonElement>("[data-gp-use]").forEach((el) =>
      el.addEventListener("click", () => {
        showGreatPersonActivate(state, el.dataset.gpUse!);
      }),
    );
    wireWikiButtons(greatPeoplePanel);
  };

  const renderLegends = (state: GameState): void => {
    legendsPanel.classList.toggle("hidden", !legendsOpen);
    if (!legendsOpen) return;
    const player = state.players[state.currentPlayerIndex]!;
    const viewerId = lastViewerId >= 0 ? lastViewerId : player.id;
    const viewer = playerById(state, viewerId) ?? player;
    const hasCity = citiesOf(state, viewerId).length > 0;
    const typeGlyph: Record<string, string> = { land: "⚔️", naval: "⚓", support: "✨" };

    let html = dialogHeader("⭐ Legends", "lgclose");
    html += `<div class="panel-dialog-body">`;
    if (!state.legendsEnabled) {
      html += `<div class="locked-note">🔒 Legends are disabled for this game.</div>`;
      html += `</div>`;
      withPreservedScroll(legendsPanel, () => {
        legendsPanel.innerHTML = html;
      });
      legendsPanel.querySelector<HTMLButtonElement>("#lgclose")!.addEventListener("click", () => {
        legendsOpen = false;
        legendsPanel.classList.add("hidden");
      });
      return;
    }
    html += `<div class="sub">Earn heroes by training military units and winning battles. Each legend belongs to a combat track — train matching units and fight to bank glory, then recruit from the panel.</div>`;
    html += `<div class="csub" style="margin-top:10px">Track glory</div>`;
    html += `<div style="display:flex;flex-direction:column;gap:5px;margin-top:4px;margin-bottom:10px">`;
    for (const track of LEGEND_TRACKS) {
      const have = legendTrackPointsOf(viewer, track);
      const need = legendRecruitThreshold(legendTrackEarnedOf(viewer, track));
      const pct = need > 0 ? Math.min(100, Math.round((have / need) * 100)) : 0;
      html +=
        `<div class="sub">${LEGEND_TRACK_LABELS[track]}: <b style="color:#fff">${have}</b> / ${need}` +
        `<div style="height:5px;border-radius:999px;background:rgba(255,255,255,.08);margin-top:3px;overflow:hidden">` +
        `<div style="height:100%;width:${pct}%;background:#c9a227;border-radius:999px"></div></div></div>`;
    }
    html += `</div>`;

    // Active legends (the viewer's hero units, with turns remaining).
    const active = unitsOf(state, viewerId).filter((u) => u.legendId);
    if (active.length > 0) {
      html += `<div class="csub">Your Legends (${active.length})</div>`;
      html += active
        .map((u) => {
          const def = getLegend(u.legendId);
          const left = (u.legendExpiresOnTurn ?? state.turn) - state.turn;
          const ext = def ? legendLifeExtensions(def.id) : [];
          const extHint = ext.length
            ? ` · earns +turns from ${ext.map((e) => e.trigger.replace(/_/g, " ")).join(", ")}`
            : "";
          const art =
            u.legendId
              ? `<img class="portrait-thumb legend-portrait legend-portrait-sm" src="${ASSET_BASE_URL}legends/${u.legendId}.png" alt="" onerror="this.style.display='none'">`
              : "";
          return (
            `<div class="legend-active sub">` +
            art +
            `<div>${typeGlyph[def?.type ?? "land"]} <b style="color:#fff">${def?.name ?? "Hero"}</b> — ${left} turn${left === 1 ? "" : "s"} remain${extHint}${u.legendId ? " " + wikiBtn(`legend:${u.legendId}`) : ""}</div>` +
            `</div>`
          );
        })
        .join("");
    }

    // Available legends to recruit.
    html += `<div class="csub">Available Heroes</div>`;
    const avail = availableLegendsForPlayer(state, viewerId);
    if (avail.length === 0) {
      const locked = availableLegends(state).filter((l) => !eraUnlocked(viewer, l.era));
      if (locked.length > 0) {
        html += `<div class="sub">Heroes of later eras await — reach ${playerGameEra(viewer) === "Bronze" ? "the Classical era (bronze alloying)" : "a later era"} to recruit them.</div>`;
      } else {
        html += `<div class="sub">Every Legend has been recruited.</div>`;
      }
    } else {
      html += avail
        .map((l) => {
          const ext = legendLifeExtensions(l.id);
          const extLine = ext.length
            ? ` · may earn turns: ${ext.map((e) => `+${e.turns}/${e.trigger.replace(/_/g, " ")}`).join(", ")}`
            : "";
          const track = legendTrackFor(l);
          const need = legendRecruitCostFor(l, viewer);
          const have = legendTrackPointsOf(viewer, track);
          const canRecruit = canRecruitLegend(state, viewerId, l.id).ok;
          const dis = !canRecruit || !hasCity;
          return (
            `<div class="tech legend-card" data-legend="${l.id}">` +
            `<img class="portrait-thumb legend-portrait" src="${ASSET_BASE_URL}legends/${l.id}.png" alt="" onerror="this.style.display='none'">` +
            `<div style="flex:1;min-width:0">` +
            `<b>${typeGlyph[l.type]} ${l.name}</b> <span class="sub">· ${l.era} · ${legendBaseName(l)} · ${LEGEND_TRACK_LABELS[track]}</span>` +
            `<div class="sub">${l.abilityDesc}</div>` +
            `<div class="sub">Glory: <b style="color:${have >= need ? "#7ee787" : "#ffd967"}">${have}/${need}</b> ${LEGEND_TRACK_LABELS[track]} · Aura: ${l.auraDesc} (+${l.auraBonus} adjacent) · ${LEGEND_DEFAULT_LIFESPAN} turns base${extLine}${l.rechargeable ? " · recharges" : ""}</div></div>` +
            `<div class="legend-actions">` +
            `<button class="btn primary" data-legend-recruit="${l.id}"${dis ? " disabled" : ""}>Recruit</button>` +
            wikiBtn(`legend:${l.id}`) +
            `</div></div>`
          );
        })
        .join("");
    }

    html += `</div>`;
    withPreservedScroll(legendsPanel, () => {
      legendsPanel.innerHTML = html;
    });
    legendsPanel.querySelector<HTMLButtonElement>("#lgclose")!.addEventListener("click", () => {
      legendsOpen = false;
      legendsPanel.classList.add("hidden");
    });
    legendsPanel.querySelectorAll<HTMLButtonElement>("[data-legend-recruit]").forEach((el) =>
      el.addEventListener("click", () => {
        if (el.disabled) return;
        handlers.onRecruitLegend(el.dataset.legendRecruit!);
      }),
    );
    wireWikiButtons(legendsPanel);
  };

  const renderUnitPanel = (state: GameState, unit: Unit | null, viewerId: number, odds?: CombatOdds | null): void => {
    if (!unit) {
      unitPanel.classList.add("hidden");
      return;
    }
    unitPanel.classList.remove("hidden");
    // Open at the default size for the viewport each time a different unit is
    // selected (collapsed on mobile, full on desktop).
    if (unit.id !== unitPanelUnitId) {
      unitPanelUnitId = unit.id;
      unitPanelExpanded = !isMobile();
    }
    const def = UNIT_DEFS[unit.type];
    const combatant = def.strength > 0 || (def.rangedStrength ?? 0) > 0;
    const own = unit.ownerId === viewerId;
    const owner = state.players.find((p) => p.id === unit.ownerId);

    const info = unitInfo(unit.type);
    const stars = unit.level > 1 ? " ★".repeat(unit.level - 1) : "";
    const uu = uniqueUnitForCiv(owner?.civId, unit.type);
    const legendDef = unit.legendId ? getLegend(unit.legendId) : undefined;
    const displayName = legendDef?.name ?? uu?.name ?? def.name;
    // Big portrait art (units-big), keyed by the legend id for heroes, then the
    // unique-unit id, else the base unit type — matching the map overlay's sprite.
    const imgId = unit.legendId ?? uu?.id ?? unit.type;
    const bigSrc = `${ASSET_BASE_URL}units-big/${imgId}.png`;
    const tokenSrc = `${ASSET_BASE_URL}units/${imgId}.png`;
    // Encyclopedia target: the hero legend, else the civ's unique unit, else the base unit.
    const unitWikiNav = unit.legendId ? `legend:${unit.legendId}` : uu ? `uniqueUnit:${uu.id}` : `unit:${unit.type}`;
    const hasPromoPool = PROMOTION_POOL[def.cls].length > 0;
    const promoInfoBtn = hasPromoPool
      ? `<button type="button" class="btn unit-perk-info" data-unit-promo-info title="View promotion perks" ` +
        `style="padding:3px 7px;font-size:12px;flex:0 0 auto;line-height:1.2">ℹ️</button>`
      : "";
    let headInfo =
      `<div class="row" style="justify-content:space-between;align-items:flex-start"><b style="font-size:15px">${displayName}<span style="color:#ffd967">${stars}</span></b>` +
      `<span class="row" style="gap:4px;flex:0 0 auto">${promoInfoBtn}${wikiBtn(unitWikiNav)}</span>` +
      `</div>` +
      (owner && !own
        ? `<div class="sub"><span class="dot" style="background:${owner.color};display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:4px"></span>${owner.name}</div>`
        : "") +
      `<div class="sub">${info.role}${info.note ? ` · ${info.note}` : ""}</div>` +
      `<div style="margin-top:2px">Moves <b>${unit.movementLeft}/${unitMovement(state, unit)}</b>` +
      (combatant ? ` · HP <b>${unit.hp}/${unitMaxHp(unit)}</b>` : "") +
      `</div>`;
    if (combatant) {
      const levelMult = 1 + 0.05 * (unit.level - 1);
      // Civ/unique-unit flat combat bonus is added on top of the level-scaled base
      // in combat (see civCombatBonus), so include it here or the panel under-reports.
      const civStr = civCombatBonus(state, unit);
      headInfo +=
        `<div style="color:#9fc0dc">⚔️ ${Math.floor(def.strength * levelMult) + civStr}` +
        ((def.rangedStrength ?? 0) > 0 ? ` · 🏹 ${Math.floor((def.rangedStrength ?? 0) * levelMult) + civStr} (rng ${def.range})` : "") +
        ` · XP ${unit.xp}/${unitXpForNextLevel(unit.level)}</div>`;
      // Scouts (recon) sit outside the morale system — show their Escape chance
      // instead, when they have one.
      if (def.cls === "recon") {
        const esc = scoutEscapeChance(unit);
        if (esc > 0) {
          headInfo += `<div style="margin-top:2px;color:#9fc0dc">🏃 Evade <b style="color:#7ee787">${Math.round(esc * 100)}%</b> <span class="sub">(dodge once/turn)</span></div>`;
        }
      } else {
        const m = Math.round(unit.morale ?? 100);
        const mColor = m >= 100 ? "#7ee787" : m >= 50 ? "#ffd700" : "#ff8a8a";
        const mEffect = m === 100 ? "" : ` (${m > 100 ? "+" : ""}${Math.round((m - 100) * 0.2)}% atk)`;
        const routed =
          unit.routedUntilTurn !== undefined && state.turn <= unit.routedUntilTurn
            ? ` · <span style="color:#ff8a8a">⚑ Routed</span>`
            : "";
        headInfo += `<div style="margin-top:2px">🎌 Morale <b style="color:${mColor}">${m}</b><span style="color:#9fc0dc">${mEffect}</span>${routed}</div>`;
      }
      if (def.gunpowder) {
        const loaded = unit.loaded && !unit.reloading;
        headInfo += loaded
          ? `<div style="margin-top:2px;color:#7ee787">🔫 Loaded — ready to fire</div>`
          : `<div style="margin-top:2px;color:#ffb86b">🔄 Reloading — fires next turn</div>`;
      }
    }
    // Header: big unit art on the left, name/stats on the right. Falls back to the
    // small map token, then hides if no art exists at all.
    let html =
      `<div class="row" style="gap:10px;align-items:flex-start">` +
      `<img src="${bigSrc}" alt="${escapeHtml(displayName)}" ` +
      `onerror="if(this.dataset.fb){this.style.visibility='hidden'}else{this.dataset.fb='1';this.src='${tokenSrc}'}" ` +
      `style="width:76px;height:76px;flex:0 0 76px;object-fit:contain;filter:drop-shadow(0 3px 6px rgba(0,0,0,.5))">` +
      `<div style="flex:1;min-width:0">${headInfo}</div>` +
      `</div>`;
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
      // Unique unit callout — show abilities + bonus when the player is looking at their UU.
      if (uu) {
        const uuAbilityNames = unitActiveAbilityIds(unit.type, uu.id)
          .map((a) => ACTIVE_ABILITY_DEFS[a]?.name ?? a)
          .join(", ");
        html +=
          `<div style="margin-top:6px;padding:6px 8px;border-radius:4px;background:rgba(201,162,39,.12);border:1px solid rgba(201,162,39,.3)">` +
          `<span style="color:#ffd967;font-weight:700">★ ${escapeHtml(uu.name)}</span>` +
          ` <span class="sub">— Unique Unit (+${uu.bonus} combat)</span>` +
          (uuAbilityNames ? `<div class="sub" style="margin-top:2px">Abilities: ${escapeHtml(uuAbilityNames)}</div>` : "") +
          `</div>`;
      }
      const abilities = unitAbilities(state, unit);
      if (abilities.length) {
        if (unit.sleeping) {
          html += `<div class="csub" style="margin-top:8px">💤 Sleeping</div>`;
        } else if (unit.hidden) {
          html += `<div class="csub" style="margin-top:8px">🌲 Hidden — concealed from enemies</div>`;
        } else if (unit.stance) {
          html += `<div class="csub" style="margin-top:8px">${ACTIVE_ABILITY_DEFS[unit.stance].glyph} In stance: <b>${ACTIVE_ABILITY_DEFS[unit.stance].name}</b></div>`;
        }
      }

      // Action and active-ability buttons share one wrapping row, so they sit
      // side by side and only spill onto a new line when there isn't room.
      const actions: string[] = [];
      if (unit.sleeping) {
        actions.push(`<button class="btn primary" id="wake">Wake</button>`);
      } else {
        actions.push(`<button class="btn" id="sleep">Sleep</button>`);
      }
      const ships = boardableShips(state, unit);
      if (ships.length && unit.movementLeft > 0) {
        for (const ship of ships) {
          const shipName = UNIT_DEFS[ship.type].name;
          actions.push(
            `<button class="btn primary" data-board-ship="${ship.id}" ` +
              `title="Board ${shipName} (${shipCargoLabel(state, ship)} full)">Jump In · ${escapeHtml(shipName)}</button>`,
          );
        }
      }
      if (def.founder) actions.push(`<button class="btn primary" id="found">Found City</button>`);
      for (const a of abilities) {
        const ad = ACTIVE_ABILITY_DEFS[a];
        const usable = canUseAbility(state, unit, a).ok;
        actions.push(
          `<button class="btn" data-ability="${a}" ${usable ? "" : "disabled"} ` +
            `title="${ad.desc}" style="display:inline-flex;gap:8px;align-items:center;padding:8px 10px${usable ? "" : ";opacity:.5"}">` +
            `${abilityIconHtml(abilityAtlas, a)}` +
            `<b style="color:#fff">${ad.name}</b></button>`,
        );
      }
      if (actions.length) html += `<div class="row" style="margin-top:8px">${actions.join("")}</div>`;

      if (isNavalUnit(unit)) {
        const cargo = cargoOnShip(state, unit.id);
        html +=
          `<div style="margin-top:10px;padding-top:8px;border-top:1px solid var(--edge)">` +
          `<div class="csub">Cargo: <b>${shipCargoLabel(state, unit)}</b></div>`;
        if (cargo.length === 0) {
          html += `<div class="sub" style="margin-top:4px">Empty — move beside coastal troops and use <b>Jump In</b>.</div>`;
        } else {
          html += `<div style="display:flex;flex-direction:column;gap:6px;margin-top:6px">`;
          for (const p of cargo) {
            const pName = uniqueUnitForCiv(owner?.civId, p.type)?.name ?? UNIT_DEFS[p.type].name;
            const canLeave = p.movementLeft > 0 && disembarkTargets(state, p).length > 0;
            html += `<div class="row" style="flex-wrap:wrap;gap:4px;align-items:center">` +
              `<span>${UNIT_DEFS[p.type].glyph} ${escapeHtml(pName)}</span>`;
            if (canLeave) {
              html +=
                `<button class="btn" data-disembark="${p.id}" title="Disembark onto the nearest shore">Jump Out</button>`;
            } else if (p.movementLeft <= 0) {
              html += `<span class="sub">— waits for next turn</span>`;
            } else {
              html += `<span class="sub">— no shore nearby</span>`;
            }
            html += `</div>`;
          }
          html += `</div>`;
        }
        html += `</div>`;
      }

      if (def.trader) {
        const origin = cityAt(state, unit.col, unit.row);
        const dests = tradeRouteDestinations(state, unit);
        if (origin && origin.ownerId === unit.ownerId && dests.length > 0) {
          html += tradeRouteChoicesHtml(state, unit, origin, dests);
        } else if (!origin || origin.ownerId !== unit.ownerId) {
          html += `<div class="locked-note">🐪 Move this Trader into one of your cities, then it can open a trade route to another city.</div>`;
        } else {
          html +=
            `<div class="locked-note">🐪 No reachable partner from ${escapeHtml(origin.name)}. ` +
            `Inland cities trade overland; sea lanes need a <b>port city</b> at each end — link far inland partners through a hub port on the same continent.</div>`;
        }
      }

      if (own && isMilitary(unit.type) && !unit.escortingRouteId && unit.movementLeft > 0) {
        const viewer = playerById(state, viewerId);
        const escortRoutes = tradeRoutesAtTile(state, unit.col, unit.row, viewerId).filter((r) => !r.escortUnitId);
        if (escortRoutes.length > 0) {
          html += `<div class="csub">🛡 Escort a trade route</div>`;
          html += `<div style="display:flex;flex-direction:column;gap:6px;margin-top:4px">`;
          for (const r of escortRoutes) {
            const from = state.cities.get(r.fromCityId);
            const to = state.cities.get(r.toCityId);
            html +=
              `<button class="btn" data-escort-route="${r.id}" style="text-align:left">` +
              `Guard ${escapeHtml(from?.name ?? "?")} → ${escapeHtml(to?.name ?? "?")}` +
              ` <span class="sub">(unit leaves the map)</span></button>`;
          }
          html += `</div>`;
        }
        if (viewer) {
          const lootRoutes = tradeRoutesAtTile(state, unit.col, unit.row).filter((r) => {
            if (r.ownerId === viewerId) return false;
            const owner = playerById(state, r.ownerId);
            return !!owner && areEnemies(viewer, owner);
          });
          if (lootRoutes.length > 0) {
            html += `<div class="csub">🏴‍☠️ Plunder trade route</div>`;
            html += `<div style="display:flex;flex-direction:column;gap:6px;margin-top:4px">`;
            for (const r of lootRoutes) {
              const from = state.cities.get(r.fromCityId);
              const to = state.cities.get(r.toCityId);
              const loot = plunderValue(state, r);
              const guarded = r.escortUnitId !== undefined ? " · 🛡 guarded" : "";
              html +=
                `<button class="btn" data-plunder-route="${r.id}" style="text-align:left;display:flex;justify-content:space-between;gap:8px">` +
                `<span>${escapeHtml(from?.name ?? "?")} → ${escapeHtml(to?.name ?? "?")}${guarded}</span>` +
                `<span class="sub">+${loot}🪙</span></button>`;
            }
            html += `</div>`;
          }
        }
      }

      if (def.religious) {
        const here = cityAt(state, unit.col, unit.row);
        const charges = unit.religiousCharges ?? 0;
        html += `<div class="csub">✝ Holy mission — ${charges} charge${charges === 1 ? "" : "s"} left</div>`;
        if (unit.inTransit) {
          html += `<div class="sub">🐪 Travelling a trade route — arrives turn ${unit.inTransit.arrivesOnTurn}.</div>`;
        } else if (here) {
          if (unit.type === "inquisitor" && here.ownerId === unit.ownerId) {
            html += `<button class="btn primary" data-purge="${here.id}" style="width:100%;margin-top:4px">☩ Purge heresy in ${escapeHtml(here.name)}</button>`;
          }
          if (unit.type !== "inquisitor") {
            html += `<button class="btn primary" data-evangelize="${here.id}" style="width:100%;margin-top:4px">✝ Spread faith in ${escapeHtml(here.name)}</button>`;
          }
          const routes = state.tradeRoutes.filter((r) => r.fromCityId === here.id || r.toCityId === here.id);
          routes.forEach((r) => {
            const otherId = r.fromCityId === here.id ? r.toCityId : r.fromCityId;
            const other = state.cities.get(otherId);
            if (other) html += `<button class="btn" data-board="${r.id}" style="width:100%;margin-top:4px">🐪 Ride trade route to ${escapeHtml(other.name)}</button>`;
          });
        } else {
          html += `<div class="locked-note">Move into (or beside) a city to spread your faith, or into a city on a trade route to ride it.</div>`;
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
                    `<button class="btn" data-promote="${p}" title="${escapeHtml(def.desc)}" ` +
                    `style="text-align:left;display:flex;justify-content:space-between;gap:8px;padding:8px 10px">` +
                    `<b style="color:#fff">${def.name}</b>` +
                    `<span style="color:#ffd967;letter-spacing:1px;flex:0 0 auto">${stars}</span>` +
                    `</button>`
                  );
                })
                .join("")
            : `<div class="sub">No promotions available at this level.</div>`) +
          `</div>`;
      }

      // Upgrade button — shown only after the target unit's tech is researched.
      const upgradeToType = UNIT_UPGRADES[unit.type];
      if (upgradeToType) {
        const upgToDef = UNIT_DEFS[upgradeToType];
        const techOk = !upgToDef.reqTech || (owner?.researched.has(upgToDef.reqTech) ?? false);
        if (techOk) {
          const upgCost = unitUpgradeCost(unit.type, upgradeToType);
          const onOwnTerritory = tileOwnerId(state, unit.col, unit.row) === viewerId;
          const resOk = !upgToDef.reqResource
            || (owner ? (owner.resources[upgToDef.reqResource.resource] ?? 0) >= upgToDef.reqResource.count : false);
          const goldOk = (owner?.gold ?? 0) >= upgCost;
          const canUpgrade = onOwnTerritory && resOk && goldOk;

          let upgradeNote = "";
          if (!onOwnTerritory) upgradeNote = "Must be on your own territory";
          else if (!resOk) upgradeNote = `Requires ${upgToDef.reqResource?.resource ?? "resource"}`;
          else if (!goldOk) upgradeNote = `Not enough gold (need ${upgCost}🪙)`;

          html +=
            `<div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--edge)">` +
            `<button class="btn${canUpgrade ? " primary" : ""}" data-upgrade ` +
            `${canUpgrade ? "" : "disabled"} ` +
            `title="${canUpgrade ? `Upgrade to ${upgToDef.name} — loses its turn` : upgradeNote}" ` +
            `style="width:100%;text-align:left;display:flex;justify-content:space-between;gap:8px${canUpgrade ? "" : ";opacity:.5"}">` +
            `<span>⬆️ Upgrade to <b style="color:#fff">${upgToDef.name}</b>${upgradeNote ? ` <span class="sub">(${upgradeNote})</span>` : ""}</span>` +
            `<span class="sub">${upgCost}🪙</span>` +
            `</button>` +
            `</div>`;
        }
      }
    } // end if (own)

    // Compact summary bar — name + key stats — doubles as the expand/collapse
    // tap target (see summaryBar / the shared .ip-* panel styling).
    const levelMult = 1 + 0.05 * (unit.level - 1);
    const summaryStats = combatant
      ? `<span>⚔️ ${Math.floor(def.strength * levelMult) + civCombatBonus(state, unit)}</span>` +
        `<span>❤️ ${unit.hp}/${unitMaxHp(unit)}</span>` +
        (isNavalUnit(unit) ? `<span>Cargo ${shipCargoLabel(state, unit)}</span>` : "")
      : `<span class="sub">${info.role}</span>`;

    // Quick-cast bar: icon-only ability buttons surfaced on the collapsed panel
    // (CSS hides it when expanded, where the full labelled buttons live) so the
    // player can fire an ability without first opening the panel.
    let quickBar = "";
    if (own && !unit.sleeping) {
      const quickBtns: string[] = [];
      // Found City is a dedicated action (not an active ability), but settlers
      // deserve the same one-tap access from the collapsed bar.
      if (def.founder) {
        quickBtns.push(
          `<button class="btn ip-quick-btn" data-found title="Found City">🏛️</button>`,
        );
      }
      for (const a of unitAbilities(state, unit)) {
        const ad = ACTIVE_ABILITY_DEFS[a];
        const usable = canUseAbility(state, unit, a).ok;
        quickBtns.push(
          `<button class="btn ip-quick-btn" data-ability="${a}" ${usable ? "" : "disabled"} ` +
            `title="${ad.name} — ${ad.desc}"${usable ? "" : ' style="opacity:.5"'}>` +
            `${abilityIconHtml(abilityAtlas, a)}</button>`,
        );
      }
      if (quickBtns.length) quickBar = `<div class="ip-quick">${quickBtns.join("")}</div>`;
    }

    unitPanel.classList.toggle("collapsed", !unitPanelExpanded);
    withPreservedScroll(unitPanel, () => {
      unitPanel.innerHTML =
        summaryBar({
          icon: tokenSrc,
          isImg: true,
          name: `<b>${escapeHtml(displayName)}</b><span style="color:#ffd967">${stars}</span>`,
          stats: summaryStats,
          extra: quickBar,
        }) +
        `<div class="ip-detail">${html}</div>`;
    });
    wireCollapse(unitPanel, () => {
      unitPanelExpanded = !unitPanelExpanded;
      renderUnitPanel(state, unit, viewerId, odds);
    });
    wireWikiButtons(unitPanel);
    unitPanel.querySelector<HTMLButtonElement>("[data-unit-promo-info]")?.addEventListener("click", (e) => {
      e.stopPropagation();
      showUnitPromoDialog(unit, displayName);
    });
    unitPanel.querySelector<HTMLButtonElement>("#found")?.addEventListener("click", () => handlers.onFoundCity());
    unitPanel.querySelector<HTMLButtonElement>("[data-found]")?.addEventListener("click", () => handlers.onFoundCity());
    unitPanel.querySelector<HTMLButtonElement>("#sleep")?.addEventListener("click", () => handlers.onSleep());
    unitPanel.querySelector<HTMLButtonElement>("#wake")?.addEventListener("click", () => handlers.onWake());
    unitPanel.querySelectorAll<HTMLButtonElement>("[data-board-ship]").forEach((btn) => {
      btn.addEventListener("click", () => handlers.onBoardShip(Number(btn.dataset.boardShip)));
    });
    unitPanel.querySelectorAll<HTMLButtonElement>("[data-disembark]").forEach((btn) => {
      btn.addEventListener("click", () => handlers.onDisembarkFromShip(Number(btn.dataset.disembark)));
    });
    unitPanel.querySelectorAll<HTMLButtonElement>("[data-promote]").forEach((el) =>
      el.addEventListener("click", () => handlers.onPromote(el.dataset.promote as PromotionId)),
    );
    unitPanel.querySelector<HTMLButtonElement>("[data-upgrade]")?.addEventListener("click", () => handlers.onUpgradeUnit());
    unitPanel.querySelectorAll<HTMLButtonElement>("[data-ability]").forEach((el) =>
      el.addEventListener("click", () => handlers.onAbility(el.dataset.ability as ActiveAbilityId)),
    );
    unitPanel.querySelectorAll<HTMLButtonElement>("[data-trade-dest]").forEach((el) =>
      el.addEventListener("click", () => handlers.onEstablishTrade(Number(el.dataset.tradeDest))),
    );
    unitPanel.querySelectorAll<HTMLInputElement>("[id^='trade-only-mine']").forEach((onlyMine) =>
      onlyMine.addEventListener("change", () => {
        const root = onlyMine.closest(".ip-detail") ?? unitPanel;
        root
          .querySelectorAll<HTMLElement>("[data-foreign-group]")
          .forEach((el) => (el.style.display = onlyMine.checked ? "none" : ""));
      }),
    );
    unitPanel.querySelector<HTMLButtonElement>("[data-evangelize]")?.addEventListener("click", (e) =>
      handlers.onEvangelize(unit.id, Number((e.currentTarget as HTMLElement).dataset.evangelize)));
    unitPanel.querySelector<HTMLButtonElement>("[data-purge]")?.addEventListener("click", (e) =>
      handlers.onPurgeHeresy(unit.id, Number((e.currentTarget as HTMLElement).dataset.purge)));
    unitPanel.querySelectorAll<HTMLButtonElement>("[data-board]").forEach((el) =>
      el.addEventListener("click", () => handlers.onBoardTradeRoute(unit.id, Number(el.dataset.board))));
    unitPanel.querySelectorAll<HTMLButtonElement>("[data-escort-route]").forEach((el) =>
      el.addEventListener("click", () => handlers.onAssignTradeEscort(unit.id, Number(el.dataset.escortRoute))),
    );
    unitPanel.querySelectorAll<HTMLButtonElement>("[data-plunder-route]").forEach((el) =>
      el.addEventListener("click", () => handlers.onPlunderTradeRoute(unit.id, Number(el.dataset.plunderRoute))),
    );
    unitPanel.querySelector<HTMLButtonElement>("[data-bribe]")?.addEventListener("click", () => handlers.onBribeBarbarian(unit.id));
    unitPanel.querySelector<HTMLButtonElement>("[data-recruit]")?.addEventListener("click", () => handlers.onRecruitBarbarian(unit.id));
  };

  // Every player-buildable work. Pasture/Plantation/Camp/Fishing Boats activate the
  // resources that need them (cattle, wine, deer, fish, …); omitting them left those
  // resources unimprovable even though the tile panel asks for them.
  const WORK_KINDS = [
    "farm", "lumber_camp", "mine", "quarry",
    "pasture", "plantation", "camp",
    "fishing_boats", "fishery", "saltern",
    "road", "wall", "tower",
  ];
  const CHEAT_WORK_KINDS = [
    "farm",
    "lumber_camp",
    "mine",
    "quarry",
    "fishery",
    "saltern",
    "pasture",
    "plantation",
    "camp",
    "fishing_boats",
    "wall",
    "tower",
  ];

  /** Rich construction detail for an in-progress Work on the selected tile: per-craft
   *  progress, the crew's labour/turn + ETA, the assigned specialists (with Remove),
   *  and a picker to add free specialists from any of the player's cities — so the
   *  speed impact of who you choose is visible. */
  const constructionSection = (state: GameState, work: Work, viewerId: number): string => {
    const buildLabel =
      work.kind === "wonder" ? getWonder(work.wonderId ?? "")?.name ?? "Wonder" : workName(work.kind, work.tier ?? 1);
    const reqDisc = Object.keys(work.requirement) as Discipline[];
    const rate = workLabourPerTurn(state, work);
    const totalReq = reqDisc.reduce((a, d) => a + (work.requirement[d] ?? 0), 0);
    const totalDone = reqDisc.reduce((a, d) => a + Math.min(work.requirement[d] ?? 0, work.progress[d] ?? 0), 0);
    const overall = totalReq > 0 ? Math.floor((totalDone / totalReq) * 100) : 0;
    const eta = workEtaTurns(state, work);
    const etaText =
      eta === 0 ? "Ready" : eta === Infinity ? "Idle — assign a specialist to begin" : `~${eta} turn${eta === 1 ? "" : "s"} left`;

    const isWonder = work.kind === "wonder";
    // For a wonder the per-craft bar tracks CREW (how many of the needed craftsmen
    // are committed); build progress is the overall % + ETA above. For a tile work it
    // tracks labour done toward the requirement.
    const assignedByDisc = new Map<Discipline, number>();
    if (isWonder) {
      for (const id of work.assignedSpecialistIds) {
        const f = findSpecialist(state, viewerId, id);
        const d = f && SPECIALIST_DEFS[f.specialist.type as SpecialistId]?.discipline;
        if (d) assignedByDisc.set(d, (assignedByDisc.get(d) ?? 0) + 1);
      }
    }
    const bars = reqDisc
      .map((d) => {
        if (isWonder) {
          const need = wonderCrewNeeded(work, d);
          const have = assignedByDisc.get(d) ?? 0;
          const pct = need > 0 ? Math.floor((Math.min(have, need) / need) * 100) : 0;
          const full = have >= need;
          return (
            `<div class="sub" style="margin-top:6px">${escapeHtml(specialistNameForDiscipline(d))} — ${have}/${need} committed${full ? " ✓" : ""}</div>` +
            `<div class="bar"><i style="width:${pct}%;background:${full ? "#7ad08a" : "#c9a24a"}"></i></div>`
          );
        }
        const req = work.requirement[d] ?? 0;
        const done = Math.min(req, work.progress[d] ?? 0);
        const pct = req > 0 ? Math.floor((done / req) * 100) : 0;
        const r = rate[d] ?? 0;
        return (
          `<div class="sub" style="margin-top:6px">${escapeHtml(specialistNameForDiscipline(d))} — ${Math.floor(done)}/${req} ${
            r > 0 ? `(+${r.toFixed(1)}/turn)` : "(no one assigned)"
          }</div>` + `<div class="bar"><i style="width:${pct}%;background:#c9a24a"></i></div>`
        );
      })
      .join("");

    const crewRows = work.assignedSpecialistIds
      .map((id) => {
        const found = findSpecialist(state, viewerId, id);
        if (!found) return "";
        const spec = found.specialist;
        const def = SPECIALIST_DEFS[spec.type as SpecialistId];
        return (
          `<div class="row" style="justify-content:space-between;gap:6px;margin-top:4px">` +
          `<span class="sub">👷 ${escapeHtml(spec.name ?? def?.name ?? spec.type)} · ${escapeHtml(def?.name ?? "")} Lv${spec.level} (+${specialistLabour(spec).toFixed(1)}/t) · ${escapeHtml(found.city.name)}</span>` +
          `<button class="btn" data-assign-off="${id}">Remove</button></div>`
        );
      })
      .join("");

    const committed = assignedSpecialistIds(state, viewerId);
    const avail: string[] = [];
    for (const c of citiesOf(state, viewerId)) {
      for (const spec of c.specialists) {
        if (committed.has(spec.id)) continue;
        const disc = SPECIALIST_DEFS[spec.type as SpecialistId]?.discipline;
        if (!disc || !reqDisc.includes(disc)) continue;
        // A wonder's crew is capped per craft — don't offer more once it's full.
        if (wonderCraftFull(state, work, disc)) continue;
        const def = SPECIALIST_DEFS[spec.type as SpecialistId];
        avail.push(
          `<button class="btn" data-assign-on="${spec.id}">+ ${escapeHtml(spec.name ?? def?.name ?? spec.type)} · ${escapeHtml(def?.name ?? "")} Lv${spec.level} (+${specialistLabour(spec).toFixed(1)}/t) · ${escapeHtml(c.name)}</button>`,
        );
      }
    }
    const crafts = reqDisc.map(specialistNameForDiscipline).join(" / ");
    const picker = avail.length
      ? `<div class="csub">Assign a specialist</div><div class="row" style="flex-wrap:wrap;gap:6px">${avail.join("")}</div>`
      : `<div class="sub" style="margin-top:6px;color:#e0b07d">No free ${escapeHtml(crafts)} available — train one in a city to staff this.</div>`;

    return (
      `<div class="csub">🛠️ ${escapeHtml(buildLabel)} — ${overall}%</div>` +
      `<div class="sub">⏱️ ${etaText}</div>` +
      bars +
      (isWonder
        ? `<div class="sub" style="margin-top:6px;color:#9fc3e0">Commit the full crew shown above to raise this wonder. It's a long build even fully crewed — but veteran craftsmen finish it faster.</div>`
        : "") +
      (crewRows
        ? `<div class="csub">Crew (${work.assignedSpecialistIds.length})</div>${crewRows}`
        : `<div class="sub" style="margin-top:6px">No crew assigned yet — pick specialists below.</div>`) +
      picker +
      (work.ownerId === viewerId
        ? rushButtonsHtml(state, viewerId, "rush-work", work.id, (cur, sur) => workRushCost(work, cur, sur))
        : "") +
      `<button class="btn" id="work-cancel" data-work-id="${work.id}" style="margin-top:8px">Cancel work</button>`
    );
  };

  const renderTilePanel = (state: GameState, tile: Tile | null, viewerId = -1, cheatsEnabled = false): void => {
    if (!tile) {
      tilePanel.classList.add("hidden");
      return;
    }
    tilePanel.classList.remove("hidden");
    const tileKey = `${tile.col},${tile.row}`;
    if (tileKey !== tilePanelKey) {
      tilePanelKey = tileKey;
      tilePanelExpanded = !isMobile();
    }
    const r = tileReport(state, tile, viewerId);
    const y = r.yields;
    const chip = (icon: string, n: number) =>
      `<span style="${n ? "" : "opacity:.35"}" title="${icon}">${icon} <b>${n}</b></span>`;

    let html =
      `<div class="sub">${r.subtitle}</div>` +
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

    // Develop (start a public work). Owned tiles get everything; neutral (unclaimed)
    // land is open to roads and tile improvements only, so infrastructure can be laid
    // ahead of a settler — the per-kind canStartWork gate below hides the rest.
    const ownsTile = tile.ownerCityId !== undefined && state.cities.get(tile.ownerCityId)?.ownerId === viewerId;
    const neutralTile = tile.ownerCityId === undefined;
    const canDevelop = ownsTile || neutralTile;
    const existing = state.works.find(
      (w) => w.ownerId === viewerId && w.target && w.target.col === tile.col && w.target.row === tile.row,
    );
    if (existing) {
      html += constructionSection(state, existing, viewerId);
    } else if (canDevelop) {
      // Offer the viewer civ's unique tile improvement alongside the base works.
      const vplayer = state.players.find((p) => p.id === viewerId);
      const uimp = uniqueImprovementForCiv(vplayer?.civId);
      const kinds = uimp ? [...WORK_KINDS, uimp.id] : WORK_KINDS;
      // Compact preview of what an improvement would give at the target tier, so the
      // player can compare options (e.g. a Fishery's food/production vs Salt Pans'
      // gold) before committing. Folds in the resource it would activate, if any.
      const workPreview = (k: string, t: number): string => {
        if (k === "road") return `<span class="imp-prev">${roadMoveCost(t)} move per tile (faster travel)</span>`;
        if (isDefenseKind(k)) return `<span class="imp-prev">🛡️ defensive structure</span>`;
        const yld = { ...improvementYields(k, t) };
        const rdef = tile.resource ? RESOURCE_DEFS[tile.resource as keyof typeof RESOURCE_DEFS] : undefined;
        const activates = !!rdef && rdef.improvement === k;
        if (rdef && activates) {
          yld.food += rdef.yields.food ?? 0;
          yld.production += rdef.yields.production ?? 0;
          yld.gold += rdef.yields.gold ?? 0;
          yld.science += rdef.yields.science ?? 0;
          yld.faith += rdef.yields.faith ?? 0;
        }
        const seg: string[] = [];
        const add = (icon: string, n: number) => { if (n) seg.push(`${icon}${n}`); };
        add("🍞", yld.food); add("⚒️", yld.production); add("🪙", yld.gold); add("🔬", yld.science); add("🙏", yld.faith);
        if (activates && rdef!.amenity) seg.push(`😊${rdef!.amenity}`);
        let txt = seg.join(" ") || "—";
        // Only flag a *new* activation (an upgrade leaves the resource already active).
        if (activates && !resourceActive(tile, state)) txt += ` · activates ${rdef!.name}`;
        return `<span class="imp-prev">${txt}</span>`;
      };
      const workBtn = (k: string, tier: number, verb: string, locked?: string): string => {
        // A locked option shows exactly what's missing in place of its yield preview,
        // so the player knows the improvement exists and how to unlock it.
        const detail = locked ? `<span class="imp-prev">${escapeHtml(locked)}</span>` : workPreview(k, tier);
        const label = `<span class="imp-name">${verb}${workName(k, tier)}${locked ? " 🔒" : ""}</span>${detail}`;
        if (locked) {
          return `<button class="btn imp-btn" disabled title="${escapeHtml(locked)}" style="opacity:.5;cursor:not-allowed">${label}</button>`;
        }
        return `<button class="btn imp-btn" data-work="${k}">${label}</button>`;
      };
      // Gating blockers (missing tech, research, or an available specialist) are things
      // the player can work towards, so surface them as locked buttons with the reason.
      // Pure tile-site problems (wrong territory, already worked, wrong terrain) stay
      // hidden — they'd only add noise the player can't act on for this tile.
      const isImpGateReason = (err: string | undefined): boolean => !!err && /^(requires |Research |No )/.test(err);
      const btns = kinds.map((k) => {
        const tier = nextTierAt(tile, k);
        if (tier === null) return "";
        const verb = tier > 1 ? "Upgrade → " : "";
        const can = canStartWork(state, viewerId, k, tile.col, tile.row);
        if (can.ok) return workBtn(k, tier, verb);
        if (isImpGateReason(can.error)) return workBtn(k, tier, verb, can.error);
        return "";
      }).filter(Boolean);
      if (btns.length) {
        html += `<div class="csub">Develop</div><div class="row" style="flex-wrap:wrap;gap:6px">${btns.join("")}</div>`;
        const roadCan = canStartWork(state, viewerId, "road", tile.col, tile.row);
        if (roadCan.ok) {
          html +=
            `<div class="row" style="flex-wrap:wrap;gap:6px;margin-top:6px">` +
            `<button class="btn imp-btn" id="road-route-btn">🛤️ Route from here…</button>` +
            `<span class="sub">Surveyors pave every tile along the path automatically.</span></div>`;
        }
      }
      // World wonders are tile-targeted too: offer any that can be raised on this
      // clear, owned tile. Only wonders whose tech is already researched appear here
      // (the research tree shows which tech unlocks each wonder); buildable ones are
      // active buttons (with their one-time cost), while those still gated by crew or
      // resources show as locked with the reason. Wonders stay territory-locked, so
      // they never appear on neutral land.
      const researched = vplayer?.researched;
      const costText = (w: (typeof WONDER_DEFS)[number]): string => {
        const c = wonderStartCost(w);
        const bits = [c.gold ? `${c.gold}🪙` : "", c.faith ? `${c.faith}☮️` : "", c.culture ? `${c.culture}🎭` : ""].filter(Boolean);
        return bits.join(" ");
      };
      // Only surface a locked entry for a *gating* reason (tech/crew/resource), not a
      // tile-site problem (which would spam every wonder with the same message).
      const isGateReason = (err: string | undefined): boolean =>
        !!err && /^(requires|costs|Need |No )/.test(err);
      // Wonders share the tile-improvement button style: name on top, a detail line
      // (one-time cost when buildable, or the missing requirement when locked) beneath.
      const wonderBtn = (w: (typeof WONDER_DEFS)[number], locked?: string): string => {
        const detail = locked ? escapeHtml(locked) : costText(w) || "🏛️ world wonder";
        const label = `<span class="imp-name">🏛️ ${escapeHtml(w.name)}${locked ? " 🔒" : ""}</span><span class="imp-prev">${detail}</span>`;
        if (locked) {
          return `<button class="btn imp-btn" disabled title="${escapeHtml(w.desc)}\n\n${escapeHtml(locked)}" style="opacity:.5;cursor:not-allowed">${label}</button>`;
        }
        return `<button class="btn imp-btn" data-wonder="${w.id}" title="${escapeHtml(w.desc)}">${label}</button>`;
      };
      const wonderBtns = (ownsTile ? WONDER_DEFS : [])
        .filter((w) => !state.completedWonders.includes(w.id))
        .filter((w) => !w.reqTech || (researched?.has(w.reqTech as TechId) ?? false))
        .map((w) => {
          const can = canStartWonder(state, viewerId, w.id, tile.col, tile.row);
          if (can.ok) return wonderBtn(w);
          if (isGateReason(can.error)) return wonderBtn(w, can.error);
          return "";
        })
        .filter(Boolean);
      if (wonderBtns.length) {
        html += `<div class="csub">Wonders</div><div class="row" style="flex-wrap:wrap;gap:6px">${wonderBtns.join("")}</div>`;
      }
    }

    if (cheatsEnabled && godModeEnabled) {
      html += `<div class="csub">God Mode</div>`;
      html += `<div class="row" style="flex-wrap:wrap;gap:6px"><button class="btn" id="tile-god">⚡ Cheats…</button></div>`;
    }

    tilePanel.classList.toggle("collapsed", !tilePanelExpanded);
    withPreservedScroll(tilePanel, () => {
      tilePanel.innerHTML =
        summaryBar({
          icon: "⬡",
          name: `<b>${r.name}</b>`,
          stats: `${chip("🍞", y.food)}${chip("⚒️", y.production)}`,
          closeId: "tile-close",
        }) +
        `<div class="ip-detail">${html}</div>`;
    });
    wireCollapse(tilePanel, () => {
      tilePanelExpanded = !tilePanelExpanded;
      renderTilePanel(state, tile, viewerId, cheatsEnabled);
    });
    tilePanel
      .querySelector<HTMLButtonElement>("#tile-close")!
      .addEventListener("click", () => handlers.onCloseTile());
    tilePanel.querySelector<HTMLButtonElement>("#tile-toggle")!.addEventListener("click", () => {
      tileExpanded = !tileExpanded;
      renderTilePanel(state, tile, viewerId, cheatsEnabled);
    });
    tilePanel.querySelectorAll<HTMLButtonElement>("[data-work]").forEach((el) =>
      el.addEventListener("click", () => handlers.onStartWork(el.dataset.work!, tile.col, tile.row)),
    );
    tilePanel.querySelector<HTMLButtonElement>("#road-route-btn")?.addEventListener("click", () =>
      handlers.onStartRoadRoute(tile.col, tile.row),
    );
    tilePanel.querySelectorAll<HTMLButtonElement>("[data-wonder]").forEach((el) =>
      el.addEventListener("click", () => handlers.onStartWonder(el.dataset.wonder!, tile.col, tile.row)),
    );
    tilePanel.querySelector<HTMLButtonElement>("#work-cancel")?.addEventListener("click", () =>
      handlers.onCancelWork(Number(existing!.id)),
    );
    tilePanel.querySelectorAll<HTMLButtonElement>("[data-rush-work]").forEach((el) =>
      el.addEventListener("click", () =>
        handlers.onRushWork(Number(el.dataset.rushWork), el.dataset.rushCur as RushCurrency),
      ),
    );
    tilePanel.querySelectorAll<HTMLButtonElement>("[data-assign-on]").forEach((el) =>
      el.addEventListener("click", () => handlers.onAssignSpecialist(existing!.id, Number(el.dataset.assignOn), true)),
    );
    tilePanel.querySelectorAll<HTMLButtonElement>("[data-assign-off]").forEach((el) =>
      el.addEventListener("click", () => handlers.onAssignSpecialist(existing!.id, Number(el.dataset.assignOff), false)),
    );
    tilePanel.querySelector<HTMLButtonElement>("#tile-god")?.addEventListener("click", () => {
      godModeOpen = true;
      if (lastView) renderGodMode(lastView);
    });
  };

  function godModeSignature(view: UIView): string {
    const tile = view.selectedTile;
    const tileKey =
      tile && isPassableLand(tile.terrain) ? `${tile.col},${tile.row},${tile.terrain}` : "none";
    const wonders = [...view.state.completedWonders].sort().join(",");
    return `${view.liftFog ? 1 : 0}|${tileKey}|${wonders}`;
  }

  function renderGodMode(view: UIView): void {
    godPanel.classList.toggle("hidden", !godModeOpen);
    if (!godModeOpen) {
      godModeRenderSig = "";
      return;
    }
    const sig = godModeSignature(view);
    if (sig === godModeRenderSig) return;

    const tile = view.selectedTile;
    const tileOk = !!tile && isPassableLand(tile.terrain);
    const unitOptions = Object.entries(UNIT_DEFS)
      .map(([id, d]) => `<option value="${id}">${escapeHtml(d.name)}</option>`)
      .join("");
    const builtWonders = new Set(view.state.completedWonders);
    const wonderOptions = WONDER_DEFS.filter((w) => !builtWonders.has(w.id))
      .map((w) => `<option value="${w.id}">${escapeHtml(w.name)}</option>`)
      .join("");

    let html = dialogHeader("God Mode", "god-close");
    html += `<div class="panel-dialog-body"><div style="display:flex;flex-direction:column;gap:8px">` +
      `<button class="btn" data-cheat="unlockTechs">Unlock All Techs</button>` +
      `<button class="btn" data-cheat="completeWorks">Complete All Works</button>` +
      `<button class="btn" data-cheat="healUnits">Heal All Units</button>` +
      `<button class="btn" data-cheat="revealMap">Reveal Map</button>` +
      `<button class="btn" id="god-liftfog"${view.liftFog ? ` style="background:#2f5a2f;border-color:#4a8a4a"` : ""}>` +
      `Lift Fog of War: ${view.liftFog ? "On" : "Off"}</button>` +
      `<button class="btn" data-cheat="addGold" data-amount="100">+100 Gold</button>` +
      `<button class="btn" data-cheat="addPopulation">Add Population</button>` +
      `<button class="btn" data-cheat="addResource" data-resource="copper" data-amount="5">+5 Copper</button>` +
      `<button class="btn" data-cheat="addResource" data-resource="iron" data-amount="5">+5 Iron</button>` +
      `<button class="btn" data-cheat="addResource" data-resource="horses" data-amount="5">+5 Horses</button>`;

    if (tileOk) {
      html +=
        `<div class="csub">Selected Tile (${escapeHtml(TERRAIN_NAMES[tile.terrain])})</div>` +
        `<button class="btn" data-cheat="buildRoad" data-level="1">Build Dirt Road</button>` +
        `<button class="btn" data-cheat="buildRoad" data-level="2">Build Paved Road</button>` +
        `<button class="btn" data-cheat="buildRoad" data-level="3">Build Imperial Road</button>` +
        `<button class="btn" data-cheat="foundCity">Found City</button>` +
        `<div style="display:flex;gap:6px;align-items:center;margin-top:4px">` +
        `<select id="cheat-unit" class="lobby-in" style="flex:1">${unitOptions}</select>` +
        `<button class="btn" data-cheat="spawnUnit">Spawn Unit</button>` +
        `</div>` +
        `<div class="csub">Construction Works</div>` +
        `<div class="row" style="flex-wrap:wrap;gap:6px">` +
        CHEAT_WORK_KINDS.map((k) => `<button class="btn" data-cheat="buildWork" data-kind="${k}">${workName(k, 3)}</button>`).join("") +
        `</div>` +
        (wonderOptions
          ? `<div class="csub">Wonders</div>` +
            `<div style="display:flex;gap:6px;align-items:center;margin-top:4px">` +
            `<select id="cheat-wonder" class="lobby-in" style="flex:1">${wonderOptions}</select>` +
            `<button class="btn" data-cheat="buildWonder">Build Wonder</button>` +
            `</div>`
          : `<div class="csub">Wonders</div><div class="sub">All wonders built.</div>`);
    } else {
      html +=
        `<div class="csub">Selected Tile</div>` +
        `<div class="sub">Select a passable land tile to use tile cheats.</div>`;
    }
    html += `</div></div>`;

    withPreservedScroll(godPanel, () => {
      godPanel.innerHTML = html;
    });
    godModeRenderSig = sig;
    godPanel.querySelector<HTMLButtonElement>("#god-close")!.addEventListener("click", (e) => {
      e.stopPropagation();
      godModeOpen = false;
      renderGodMode(view);
    });
    godPanel.querySelector<HTMLButtonElement>("#god-liftfog")?.addEventListener("click", () => {
      handlers.onToggleLiftFog(!view.liftFog);
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
          case "addPopulation":
            handlers.onCheat({ type: "addPopulation" });
            break;
          case "addResource":
            handlers.onCheat({ type: "addResource", resource: el.dataset.resource!, amount: Number(el.dataset.amount) });
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
          case "buildWonder": {
            if (!tile) break;
            const sel = godPanel.querySelector<HTMLSelectElement>("#cheat-wonder");
            if (!sel || !sel.value) break;
            handlers.onCheat({
              type: "buildWonder",
              wonderId: sel.value,
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
    // Open at the default size for the viewport whenever a different city is picked.
    if (city.id !== cityPanelCityId) {
      cityPanelCityId = city.id;
      cityPanelExpanded = !isMobile();
      governorPickerOpen = false;
    }
    const player = state.players.find((p) => p.id === city.ownerId)!;
    const cityViewer = lastViewerId >= 0 ? lastViewerId : city.ownerId;
    const y = getCityYields(state, city);
    // For the summary bar: fold in standing-project conversion so gold/science/etc.
    // reflect what the city actually banks (a Coinage city shows its gold, not raw ⚒️).
    const yd = cityDisplayYields(state, city);
    const need = foodToGrow(city.population);
    const options = availableProduction(state, player, city);
    const curName = city.production ? prodName(city.production, player.civId) : "— nothing —";
    const curCost = city.production ? prodCost(city.production) : 0;
    const prodPct = curCost
      ? Math.min(100, (city.productionStored / curCost) * 100)
      : 0;
    const foodPct = Math.min(100, (city.foodStored / need) * 100);

    // Each citizen eats 1 food. The food actually banked per turn (perTurn) can
    // differ from the raw surplus once the amenity growth multiplier applies, so
    // we read both from the sim's shared helpers to stay in lock-step with it.
    const surplus = y.food - city.population;
    const perTurn = cityFoodGrowth(state, city, surplus);
    const growthMult = cityGrowthMultiplier(state, city);
    // Training a settler pauses growth — mirror the sim's processCity rule.
    const buildingSettler = city.trainingQueue.some((o) => UNIT_DEFS[o.unit].founder === true);
    const turnsToGrow = perTurn > 0 ? Math.ceil((need - city.foodStored) / perTurn) : Infinity;
    // Amenity standing: surplus luxuries speed growth, a shortfall slows it.
    const amenities = cityAmenities(state, city);
    const unhappiness = cityUnhappiness(city);
    const luxuryBadge =
      growthMult > 1
        ? ` <span title="Surplus luxuries (${amenities} amenities vs ${unhappiness} unhappiness) speed growth" style="color:#7fd17f">🍷 +${Math.round((growthMult - 1) * 100)}%</span>`
        : growthMult < 1
          ? ` <span title="Too few amenities (${amenities} vs ${unhappiness} unhappiness) — ${unhappiness - amenities} more would reach full speed" style="color:#d9a86a">😟 −${Math.round((1 - growthMult) * 100)}%</span>`
          : "";

    const free = workerSlots(city);
    const specCount = city.specialists.length;
    const worksCount = worksOfCity(state, city.id).length;

    // Governor collapses to a compact chip tucked at the right of the stat line; it
    // shows the active mode and, when tapped, expands the full mode picker below.
    const isOwner = city.ownerId === cityViewer;
    const govMode = GOVERNOR_MODES.find((g) => (g.mode ?? null) === (city.autoMode ?? null)) ?? GOVERNOR_MODES[0]!;
    const govChip = isOwner
      ? `<button class="gov-chip${city.autoMode ? " active" : ""}" id="gov-chip" aria-expanded="${governorPickerOpen}" title="Governor — ${escapeHtml(govMode.title)}"><span class="gi">${govMode.icon}</span>${govMode.label}<span class="gov-caret">${governorPickerOpen ? "▴" : "▾"}</span></button>`
      : "";
    // Flag button: pick which tile the city claims next as it grows (default = nearest).
    const expandBtn = isOwner
      ? `<button class="mini-btn${city.expandTarget ? " active" : ""}" id="pick-expand" title="Choose which tile this city expands to next">🚩</button>`
      : "";
    // Bombard button: only shown when an enemy is actually in range, greyed once the
    // city has fired this turn (one shot per turn). Manual — never auto-fires.
    const canBombardNow = isOwner && cityBombardTargets(state, city).length > 0;
    const bombardBtn = canBombardNow
      ? `<button class="mini-btn${city.rangedAttackUsed ? "" : " bombard-ready"}" id="city-bombard"${city.rangedAttackUsed ? " disabled" : ""} title="${city.rangedAttackUsed ? "Already bombarded this turn" : "Bombard a nearby enemy (once per turn)"}">💥</button>`
      : "";
    const governorPicker =
      isOwner && governorPickerOpen
        ? `<div class="gov-row">` +
          GOVERNOR_MODES.map(
            (g) =>
              `<button class="gov-btn${(city.autoMode ?? null) === g.mode ? " active" : ""}" data-gov-mode="${g.mode ?? ""}" title="${g.title}" aria-pressed="${(city.autoMode ?? null) === g.mode}"><span class="gi">${g.icon}</span>${g.label}</button>`,
          ).join("") +
          `</div>` +
          (city.autoMode ? `<div class="gov-note">⚙️ ${GOVERNOR_NOTE[city.autoMode]}</div>` : "")
        : "";

    const detail =
      `<div class="cline cline-hdr">` +
      `<span>🛡️ ${cityDefenseStrength(state, city)} · ❤️ ${Math.max(0, Math.floor(city.hp))}/${cityMaxHp(city)} · ⬣ ${territorySize(state, city)}` +
      (city.religion ? ` · ☮️ ${religionById(state, city.religion)?.name ?? ""}` : "") +
      `</span>` +
      `<span class="cline-actions">${bombardBtn}${expandBtn}${govChip}</span>` +
      `</div>` +
      governorPicker +
      // growth
      `<div class="cline" style="color:var(--parchment)">Growth ${Math.floor(city.foodStored)}/${need} ` +
      (buildingSettler
        ? `<span title="A city pauses growth while it readies a settler" style="color:#d9a86a">(paused — settler)</span>`
        : perTurn > 0
          ? `<span style="color:#9fc0dc">(+${perTurn}/turn · ${turnsToGrow}t)</span>`
          : `<span style="color:#d98a8a">(stalled)</span>`) +
      (buildingSettler ? "" : luxuryBadge) +
      `<div class="bar"><i style="width:${foodPct}%"></i></div></div>` +
      // production — the rush buttons sit on the same row as the build progress
      (city.production?.kind === "project"
        ? (() => {
            const def = getProjectDef(city.production.id);
            const perTurnOut = Math.floor(y.production * (def?.ratio ?? 1));
            return `<div class="cline" style="color:var(--parchment)">Project: <b>${curName}</b> <span style="color:#9fc0dc">(+${perTurnOut}${def?.glyph ?? ""}/turn)</span></div>`;
          })()
        : (() => {
            const rush = isOwner
              ? rushButtonsHtml(state, cityViewer, "rush-prod", city.id, (cur, sur) => cityRushCost(city, cur, sur), true)
              : "";
            return (
              `<div class="cline" style="color:var(--parchment)">` +
              `<div class="build-row"><span>Building <b>${curName}</b> ${curCost ? `${Math.floor(city.productionStored)}/${curCost}` : ""}</span>${rush}</div>` +
              `<div class="bar"><i style="width:${prodPct}%"></i></div></div>`
            );
          })()) +
      `<button class="btn csheet-btn" id="open-prod"><span class="cs-l"><span class="ci">🔨</span>Construction</span><span class="sub">${options.length} ▸</span></button>` +
      `<button class="btn csheet-btn" id="open-train"><span class="cs-l"><span class="ci">⚔️</span>Train Units</span><span class="sub">${freeCitizens(city)} free${city.trainingQueue.length ? ` · ${city.trainingQueue.length} training` : ""} ▸</span></button>` +
      `<button class="btn csheet-btn" id="open-spec"><span class="cs-l"><span class="ci">🛠️</span>Specialists</span><span class="sub">${specCount} trained · ${free} free${worksCount ? ` · ${worksCount} works` : ""} ▸</span></button>` +
      (() => {
        const routes = tradeRoutesFrom(state, city.id);
        if (!routes.length) return "";
        const totalGold = routes.reduce((s, r) => s + tradeRouteYield(state, r).gold, 0);
        const names = routes.map((r) => state.cities.get(r.toCityId)?.name ?? "?").join(", ");
        return `<div class="cline" style="font-size:11px">🐪 Trade (${routes.length}): ${names} — +${totalGold}🪙</div>`;
      })() +
      (city.buildings.length
        ? `<div class="cline" style="font-size:11px">Built: ${city.buildings.map((b) => getBuildingDef(b)?.name ?? b).join(", ")}</div>`
        : "");

    cityPanel.classList.toggle("collapsed", !cityPanelExpanded);
    withPreservedScroll(cityPanel, () => {
      cityPanel.innerHTML =
        summaryBar({
          icon: city.isCapital ? "★" : "🏙️",
          name: "",
          stats: `👥 ${city.population} · 🍞 ${yd.food} · ⚒️ ${yd.production} · 🪙 ${yd.gold} · 🔬 ${yd.science}`,
          closeId: "cclose",
        }) +
        `<div class="ip-detail">${detail}</div>`;
    });

    wireCollapse(cityPanel, () => {
      cityPanelExpanded = !cityPanelExpanded;
      renderCityPanel(state, city);
    });
    cityPanel
      .querySelector<HTMLButtonElement>("#cclose")!
      .addEventListener("click", () => handlers.onCloseCity());
    cityPanel.querySelector<HTMLButtonElement>("#open-prod")!.addEventListener("click", () => {
      prodCityId = city.id;
      productionOpen = true;
      specialistsOpen = false;
      trainingOpen = false;
      closeSideSheets();
      menuOpen = false;
      renderMenu(state);
      renderSpecialists(state);
      renderTraining(state);
      renderProduction(state);
    });
    cityPanel.querySelectorAll<HTMLButtonElement>("[data-rush-prod]").forEach((el) =>
      el.addEventListener("click", () =>
        handlers.onRushProduction(Number(el.dataset.rushProd), el.dataset.rushCur as RushCurrency),
      ),
    );
    cityPanel.querySelector<HTMLButtonElement>("#gov-chip")?.addEventListener("click", () => {
      governorPickerOpen = !governorPickerOpen;
      renderCityPanel(state, city);
    });
    cityPanel.querySelector<HTMLButtonElement>("#pick-expand")?.addEventListener("click", () => {
      handlers.onPickExpandTile(city.id);
    });
    cityPanel.querySelector<HTMLButtonElement>("#city-bombard")?.addEventListener("click", () => {
      handlers.onCityBombard(city.id);
    });
    cityPanel.querySelectorAll<HTMLButtonElement>("[data-gov-mode]").forEach((el) =>
      el.addEventListener("click", () => {
        governorPickerOpen = false;
        handlers.onSetCityAutoMode(city.id, (el.dataset.govMode || null) as CityAutoFocus | null);
      }),
    );
    cityPanel.querySelector<HTMLButtonElement>("#open-train")!.addEventListener("click", () => {
      trainCityId = city.id;
      trainingOpen = true;
      productionOpen = false;
      specialistsOpen = false;
      closeSideSheets();
      menuOpen = false;
      renderMenu(state);
      renderProduction(state);
      renderSpecialists(state);
      renderTraining(state);
    });
    cityPanel.querySelector<HTMLButtonElement>("#open-spec")!.addEventListener("click", () => {
      specCityId = city.id;
      specialistsOpen = true;
      productionOpen = false;
      trainingOpen = false;
      closeSideSheets();
      menuOpen = false;
      renderMenu(state);
      renderProduction(state);
      renderTraining(state);
      renderSpecialists(state);
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
    onCancelWork: (wid) => handlers.onCancelWork(wid),
    onCancelTradeRoute: (rid) => handlers.onCancelTradeRoute(rid),
    onLeaveTradeEscort: (rid) => handlers.onLeaveTradeEscort(rid),
  });

  // Diplomacy: first-contact dialog + Contacts/negotiation screen + toggle button.
  const diplomacy = createDiplomacy({
    onDeclareWar: (t) => handlers.onDeclareWar(t),
    onMakePeace: (t) => handlers.onMakePeace(t),
    onDenounce: (t) => handlers.onDenounce(t),
    onGift: (t, g) => handlers.onGift(t, g),
    onDemandTribute: (t, g) => handlers.onDemandTribute(t, g),
    onProposeDeal: (t, give, want) => handlers.onProposeDeal(t, give, want),
    onCancelSharedVision: (t) => handlers.onCancelSharedVision(t),
    onRespondProposal: (id, acc) => handlers.onRespondProposal(id, acc),
    onFinalizeDeal: (id, confirm) => handlers.onFinalizeDeal(id, confirm),
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
      renderGreatPeople(view.state);
      renderLegends(view.state);
      renderProduction(view.state);
      renderSpecialists(view.state);
      renderTraining(view.state);
      renderUnitPanel(view.state, view.selectedUnit, view.viewerId, view.odds);
      renderTilePanel(view.state, view.selectedTile ?? null, view.viewerId, view.cheatsEnabled ?? false);
      renderGodMode(view);
      renderCityPanel(view.state, view.selectedCity);
      renderLog(view.state, view.viewerId);
      renderGameOver(view.state);
      renderMenu(view.state);
      renderGoldDialog(view.state);
      renderMoraleDialog(view.state);
      renderAction(view);

      // Hide the docked city/unit/tile panels whenever a full-screen sheet or modal
      // is open so they don't peek through or fight for pointer events. Top-bar
      // pickers (research, civics, …) stay non-blocking — they dismiss on outside click.
      const overlayOpen =
        empire.isOpen() ||
        diplomacy.isOpen() ||
        wiki.isOpen() ||
        techtreeOpen ||
        menuOpen ||
        godModeOpen ||
        goldDialogOpen ||
        moraleDialogOpen ||
        unitPromoDialogOpen ||
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
        const items: PopupItem[] = [];
        for (const m of newEntries) {
          if (m.actorId !== view.viewerId) continue;
          if (m.wonder) items.push(wonderPopupItem(m));
          else if (/village|trap|ambushed|barbarian camp/i.test(m.message)) items.push(villagePopupItem(m));
        }
        if (items.length > 0) {
          const wasEmpty = villageQueue.length === 0;
          villageQueue.push(...items);
          if (wasEmpty && !villageDialog.classList.contains("show")) {
            showVillageDialog(villageQueue[0]!);
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
      const hasImmediateUpdate = batch.toShow.some((e) => e.type === "civDefeated");
      if ((turnChanged || hasImmediateUpdate) && batch.toShow.length > 0) {
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
    openGreatPeople() {
      if (!lastState) return;
      greatPeopleOpen = true;
      renderGreatPeople(lastState);
    },
    openLegends() {
      if (!lastState) return;
      legendsOpen = true;
      renderLegends(lastState);
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
      specialistsOpen = false;
      trainingOpen = false;
      closeSideSheets();
      menuOpen = false;
      renderMenu(lastState);
      renderSpecialists(lastState);
      renderTraining(lastState);
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
