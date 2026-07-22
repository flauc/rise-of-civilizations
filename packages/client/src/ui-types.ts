// Shared HUD types — kept separate so main.ts can import types without pulling ui.ts.

import type {
  ActiveAbilityId,
  City,
  CityAutoFocus,
  GameState,
  ProductionItem,
  PromotionId,
  RushCurrency,
  TechId,
  Unit,
  UnitTypeId,
} from "@roc/sim";
import type { Tile } from "@roc/shared";
import type { DealItem } from "@roc/sim";
import type { SaveRecord } from "./save-db";
import type { CheatAction } from "./god-mode";

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
  /** Path cost from the selected unit, when hovering a reachable tile. */
  moveCost?: number;
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
  /** Simultaneous multiplayer (online session). */
  isMultiplayer?: boolean;
  /** True while God Mode's "Lift Fog of War" reveal is active. */
  liftFog?: boolean;
  /** True when the player dismissed the summary to pan the revealed end-game map. */
  gameOverExploreMap?: boolean;
  /** Local play: AI/barbarian turns are running in a worker. */
  resolvingTurn?: boolean;
}

export interface UIHandlers {
  onEndTurn(): void;
  onFoundCity(): void;
  onPromote(promotion: PromotionId): void;
  onUpgradeUnit(): void;
  onAbility(ability: ActiveAbilityId): void;
  onSleep(): void;
  onWake(): void;
  onBoardShip(shipId: number): void;
  onDisembarkFromShip(passengerId: number): void;
  onConvertCitizen(cityId: number, specialistId: string, delta: number): void;
  onSetCityAutoMode(cityId: number, mode: CityAutoFocus | null): void;
  onPickExpandTile(cityId: number): void;
  onCityBombard(cityId: number): void;
  onStartWork(kind: string, col: number, row: number): void;
  onStartRoadRoute(col: number, row: number): void;
  onStartWonder(wonderId: string, col: number, row: number): void;
  onCancelWork(workId: number): void;
  onCancelTradeRoute(routeId: number): void;
  onAssignTradeEscort(unitId: number, routeId: number): void;
  onLeaveTradeEscort(routeId: number): void;
  onPlunderTradeRoute(unitId: number, routeId: number): void;
  onPillage(unitId: number): void;
  onRushProduction(cityId: number, currency: RushCurrency): void;
  onRushWork(workId: number, currency: RushCurrency): void;
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
  onUpgradeReligion(): void;
  onPickReligionPerk(perkId: string): void;
  onMoveHolyCity(cityId: number): void;
  onBuyReligiousUnit(cityId: number, unit: "missionary" | "apostle" | "inquisitor"): void;
  onEvangelize(unitId: number, cityId: number): void;
  onPurgeHeresy(unitId: number, cityId: number): void;
  onBoardTradeRoute(unitId: number, routeId: number): void;
  onActivateGreatPerson(greatPersonId: string): void;
  onRecruitLegend(legendId: string): void;
  onUseLeaderAbility(): void;
  onEstablishTrade(destCityId: number): void;
  onBribeBarbarian(unitId: number): void;
  onRecruitBarbarian(unitId: number): void;
  onCloseCity(): void;
  onCloseTile(): void;
  onSuggestion(): void;
  onSave(name: string): Promise<void>;
  onExportCurrentSave(): Promise<string>;
  canSave: boolean;
  promptSaveOnLeave: boolean;
  onLeaveGame(): void;
  onSurrender?(): void;
  onReportBug(message: string): Promise<boolean>;
  onMenuOpen(): void;
  onLoadMpSave(blob: string): Promise<void>;
  onCheat(action: CheatAction): void;
  onToggleLiftFog(enabled: boolean): void;
  onGameOverExploreMap(): void;
  onGameOverBackToSummary(): void;
  onGameOverQuit(): void;
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
  setAbilityAtlas(atlas: import("./ability-assets").AbilityAtlas): void;
  setTileTip(tip: TileTip | null): void;
}
