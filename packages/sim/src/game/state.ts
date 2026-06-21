import type { GameMap } from "@roc/shared";
import type { CivEffects, GreatPersonClass } from "@roc/data";
import { UNIT_DEFS, UNIT_MAX_HP, type ActiveAbilityId, type BuildingId, type PromotionId, type StanceId, type TechId, type UnitTypeId } from "./content";

export interface Unit {
  id: number;
  ownerId: number;
  type: UnitTypeId;
  col: number;
  row: number;
  movementLeft: number;
  hp: number;
  xp: number;
  level: number;
  unspentPromotions: number;
  promotions: PromotionId[];
  /** Set when the unit attacks; blocks healing next turn. */
  attackedThisTurn: boolean;
  attackedLastTurn: boolean;
  /** Builder charges remaining (workers only). */
  charges: number;
  /** Active stance (Set Spears / Shield Wall / Testudo / Emplace), if any. */
  stance?: StanceId | null;
  /** Per-ability "available again on turn N" gate (see abilities.ts). */
  abilityCooldowns?: Partial<Record<ActiveAbilityId, number>>;
  /** Defense reduced (Sunder) while state.turn <= this. */
  sunderedUntilTurn?: number;
  /** Pinned (Harry): forced to 0 movement at its turn start while state.turn <= this. */
  pinnedUntilTurn?: number;
  /** Reconnoiter vision pulse active until the unit's next turn (grants +2 sight). */
  scouting?: boolean;
  /** Hiding (Hide ability): concealed from enemies until it acts or is discovered. */
  hidden?: boolean;
  /** Ambush perk window: attacks made while state.turn <= this get the ambush bonus. */
  ambushReadyUntilTurn?: number;
  /** Ambush attack bonus (fraction, e.g. 0.2) granted when this unit broke cover. */
  ambushBonus?: number;
  /** Exposed (Furor): −4 defense while state.turn <= this. */
  exposedUntilTurn?: number;
  /** True when the unit is sleeping: skips moves and stays asleep across turns. */
  sleeping?: boolean;
  /** For barbarians: "col,row" of the camp this unit spawned from. Units sharing
   *  a campKey form one war-band — a bribe pacifies them together (see bribery.ts). */
  campKey?: string;
  /** True when a land unit has embarked onto a water tile. */
  embarked?: boolean;
  /** Unit morale (0–200; 100 is neutral). Buffs/debuffs combat and drives routing.
   *  Undefined on legacy saves — treated as neutral by the morale helpers. */
  morale?: number;
  /** When set, the unit has routed and forfeits all actions while
   *  state.turn <= this (enforced at its turn start, see tickAbilities). */
  routedUntilTurn?: number;
  /** Legend (hero) id this unit embodies, if it is a Legend (see legends.ts). */
  legendId?: string;
  /** Turn after which the legend retires ("passes into legend"). */
  legendExpiresOnTurn?: number;
}

export type ProductionItem =
  | { kind: "unit"; id: UnitTypeId }
  // id is a BuildingId or a civ-unique building id (see UNIQUE_INFRA in @roc/data).
  | { kind: "building"; id: string };

/** A craft a specialist practises; Works require labour of specific disciplines. */
export type Discipline = "carpentry" | "survey" | "masonry" | "architecture" | "engineering";

/** A citizen trained into a craft (lives on its City, never on the map). */
export interface Specialist {
  id: number;
  /** SpecialistId (see specialists.ts). */
  type: string;
  /** Personal name (historic, civ-flavored); optional for legacy saves. */
  name?: string;
  xp: number;
  level: number;
}

export interface City {
  id: number;
  ownerId: number;
  name: string;
  col: number;
  row: number;
  population: number;
  foodStored: number;
  productionStored: number;
  production: ProductionItem | null;
  /** Built building ids — BuildingId values plus any civ-unique building id. */
  buildings: string[];
  /** Craftsmen trained from this city's population. */
  specialists: Specialist[];
  /** Wonder ids completed and hosted in this city. */
  wonders: string[];
  /** Tile keys ("col,row") this city's citizens are assigned to work. Derived
   *  each turn by auto-assignment; locked tiles below are always kept. */
  workedTiles: string[];
  /** Tile keys the player explicitly assigned. These are held through
   *  auto-optimisation (manual picks are respected); only unlocked citizens are
   *  reshuffled onto more profitable tiles. */
  lockedTiles?: string[];
  /** Dominant religion id in this city (undefined = none). */
  religion?: string;
  isCapital: boolean;
  /** True if this city was founded as a capital (an "original capital" for the
   *  domination victory — stays true even after capture). */
  foundedAsCapital: boolean;
  hp: number;
  lastAttackedTurn: number;
  rangedAttackUsed: boolean;
  /** Active timed city-specific modifiers from leader abilities. */
  modifiers: CityModifier[];
}

export interface GameOver {
  /** Undefined when no civilization survived (draw / extinction). */
  winnerId?: number;
  condition: "domination" | "score" | "religious" | "extinction";
}

export interface Player {
  id: number;
  name: string;
  color: string;
  isHuman: boolean;
  isBarbarian: boolean;
  /** Civilization id (see @roc/data); undefined for barbarians. */
  civId?: string;
  gold: number;
  /** Empire-wide morale (0–200; base 50). Sets the floor for new units' morale
   *  and shifts with battlefield wins/losses. Undefined on legacy saves. */
  globalMorale: number;
  /** Turn this player last *earned* morale (kill/promotion/spirited war). Global
   *  morale only begins to decay a few turns after this (see morale.ts). */
  lastMoraleGainTurn?: number;
  /** Military-pay setting (−100…+200, default 0). Scales every unit's gold upkeep
   *  by this percent and, via morale.ts, slows/reverses global-morale decay the
   *  more the army is paid. Undefined on legacy saves (treated as 0). */
  upkeepModifierPct?: number;
  /** Recent global-morale changes (most recent last), for the morale dialog.
   *  Capped to the last MORALE_LOG_MAX entries; absent on legacy saves. */
  moraleLog?: MoraleEvent[];
  researched: Set<TechId>;
  researching: TechId | null;
  /** Techs waiting to be researched after the current one (target-path queue). */
  researchQueue: TechId[];
  scienceProgress: number;
  // Civics / government (culture tree)
  civicsResearched: Set<string>;
  researchingCivic: string | null;
  cultureProgress: number;
  government: string;
  /** Active policy-card ids (capped at the government's slot count). */
  policies: string[];
  // Religion
  faith: number;
  /** Religion id this player founded (if any). */
  foundedReligionId?: string;
  explored: Set<string>;
  /** Stockpiles of strategic resources (and counts of all owned resources). */
  resources: Record<string, number>;
  // Diplomacy
  /** Ids of major civs this player has met (enables diplomacy with them). */
  met: number[];
  /** Ids of civs this player is currently at war with (drives areEnemies). */
  atWar: number[];
  /** Luxury resource ids imported via active deals (grant amenities). */
  importedLuxuries: string[];
  /** How many barbarian war-bands this player has bribed (each bribe doubles the
   *  next bribe's price — see barbarianBribeCost in bribery.ts). */
  bribesPaid: number;
  /** Last turn this player's leader ability was used; -Infinity if never used. */
  leaderAbilityLastUsedTurn: number;
  /** Active timed empire-wide modifiers from leader abilities. */
  modifiers: PlayerModifier[];
  // Great People (see great-people.ts)
  /** Accumulated great-person points per class (filled by buildings each turn). */
  greatPeoplePoints: Partial<Record<GreatPersonClass, number>>;
  /** Lifetime count of figures earned per class (drives the rising threshold). */
  greatPeopleEarned: Partial<Record<GreatPersonClass, number>>;
  /** Recruited Great People not yet activated (figure ids, ready to use). */
  greatPeople: string[];
  /** Lifetime count of Legends this player has recruited (drives the rising cost). */
  legendsRecruited: number;
  /** Lifetime battles won (enemy units defeated in combat). Feeds the score;
   *  absent on legacy saves (treated as 0). */
  battlesWon?: number;
  /** Lifetime enemy cities captured by conquest. Feeds the score; absent on
   *  legacy saves (treated as 0). */
  citiesCaptured?: number;
}

export interface PlayerModifier {
  source: string;
  effect: Partial<CivEffects>;
  expiresOnTurn: number;
}

/** A single change to empire-wide morale, surfaced in the morale dialog. */
export interface MoraleEvent {
  /** Game turn the change happened on. */
  turn: number;
  /** Signed change to global morale (already rounded to whole points). */
  delta: number;
  /** Short human-readable cause, e.g. "Won a battle". */
  reason: string;
}

export interface CityModifier {
  source: string;
  effect: Partial<CivEffects>;
  expiresOnTurn: number;
}

/** A truce a player bought with a barbarian war-band (see bribery.ts). */
export interface BarbarianBribe {
  /** Identifies the war-band: a camp's "col,row" key, or "unit:<id>" for a loner. */
  campKey: string;
  /** The player the war-band has agreed not to attack. */
  playerId: number;
  /** Last turn (inclusive) the truce holds. */
  untilTurn: number;
}

export interface Religion {
  id: string;
  name: string;
  founderId: number;
  holyCityId: number;
  beliefs: string[];
}

/** A public-works project: develop/upgrade a tile, or raise a wonder. */
export interface Work {
  id: number;
  ownerId: number;
  /** "farm"|"mine"|"quarry"|"lumber_camp"|"road"|"wall"|"tower"|"wonder" (see works.ts). */
  kind: string;
  /** Target tier (1–3) for tile/defensive works. */
  tier?: number;
  /** Target tile for tile/defensive works. */
  target?: { col: number; row: number };
  /** Wonder id (for wonder works). */
  wonderId?: string;
  /** City whose population/queue owns this work. */
  hostCityId: number;
  /** Cities contributing specialist labour (>=1). */
  cityIds: number[];
  /** Labour required, by discipline. */
  requirement: Partial<Record<Discipline, number>>;
  /** Labour accumulated so far, by discipline. */
  progress: Partial<Record<Discipline, number>>;
}

// ---- diplomacy -----------------------------------------------------------

export type DiploStatus = "peace" | "war";
export type PactTier = "none" | "non_aggression" | "defensive" | "alliance";

/** One side of a proposed/active exchange. */
export type DealItem =
  | { kind: "gold"; amount: number }
  | { kind: "goldPerTurn"; amount: number; turns: number }
  | { kind: "resource"; id: string; turns: number }
  | { kind: "specialist"; specialistType: string; turns: number }
  | { kind: "peace" }
  | { kind: "openBorders" }
  | { kind: "pact"; tier: Exclude<PactTier, "none">; turns: number }
  | { kind: "declareWarOn"; civId: number };

/** A timed obligation created by an accepted deal (e.g. gold/turn for N turns). */
export interface DealObligation {
  fromId: number;
  item: DealItem;
  untilTurn: number;
  /** For a lent specialist: the id of the moved craftsman, so it can be returned. */
  specialistId?: number;
}

/** Shared relationship record for a met pair of major civs (a < b). */
export interface Relation {
  a: number;
  b: number;
  status: DiploStatus;
  metTurn: number;
  lastStatusChangeTurn: number;
  /** Earliest turn war may be re-declared after a peace (cooldown); undefined = now. */
  warAllowedTurn?: number;
  openBorders: boolean;
  pact: PactTier;
  pactUntilTurn?: number;
  deals: DealObligation[];
}

export interface AttitudeModifier {
  reason: string;
  value: number;
  expiresTurn?: number;
}

/** A civ's directional opinion of another (AI-held; 'from' is usually an AI). */
export interface Attitude {
  from: number;
  to: number;
  modifiers: AttitudeModifier[];
}

/** A newly-met civ awaiting the viewer's acknowledgement (drives the dialog). */
export interface ContactEvent {
  youId: number;
  otherId: number;
  isPlayerCiv: boolean;
}

/** Lifecycle of a proposal: pending a response, then accepted or declined. */
export type ProposalStatus = "pending" | "accepted" | "declined";

/**
 * A consensual offer. The recipient (`toId`) accepts or declines; for a
 * human-initiated deal the proposer (`fromId`) then finalizes an accepted offer.
 */
export interface Proposal {
  id: number;
  fromId: number;
  toId: number;
  /** What `fromId` offers to give. */
  give: DealItem[];
  /** What `fromId` asks to receive. */
  want: DealItem[];
  /** Turn the proposal was created (used for expiry). */
  createdTurn: number;
  /** Lifecycle: pending until the recipient responds. */
  status: ProposalStatus;
  /** Coercive demand (tribute) — judged by fear, not value; no finalize step. */
  coercive?: boolean;
  /** The recipient's one-line reason for their response (especially the AI's). */
  reason?: string;
}

/** Kinds of recorded diplomatic events, for the per-civ trade history. */
export type TradeRecordKind =
  | "deal"
  | "gift"
  | "tribute"
  | "peace"
  | "war"
  | "denounce";

/** An historical record of a concluded diplomatic exchange or event. */
export interface TradeRecord {
  id: number;
  turn: number;
  /** The civ that initiated the action. */
  fromId: number;
  /** The other civ involved. */
  toId: number;
  kind: TradeRecordKind;
  /** What `fromId` gave (from their perspective). */
  give: DealItem[];
  /** What `fromId` received in return. */
  want: DealItem[];
  /** Short human-readable summary line. */
  note: string;
}

/** A trade route carrying goods from one of a player's cities to another. */
export interface TradeRoute {
  id: number;
  ownerId: number;
  /** Origin city — receives the bulk of the route's yields. */
  fromCityId: number;
  /** Destination city — receives a smaller share. */
  toCityId: number;
  /** Tile keys "col,row" the caravan travels through; used for plundering. */
  path: string[];
}

export type BarbarianActivity = "none" | "minimal" | "low" | "normal" | "high";

/** Possible outcomes when a tribal village or barbarian camp feature is resolved. */
export type FeatureRewardType =
  | "tech"
  | "gold"
  | "production"
  | "population"
  | "unit"
  | "promotion"
  | "ambush"
  | "cache"
  | "camp_cleared";

/** Kinds of player-facing updates reported at the start of a turn. */
export type TurnUpdateType =
  | "unitDied"
  | "productionComplete"
  | "researchComplete"
  | "civicComplete"
  | "improvementComplete"
  | "wonderComplete"
  | "tradeRouteEstablished"
  | "tradeRoutePillaged"
  | "improvementPillaged"
  | "cityLost"
  | "cityGrew"
  | "greatPersonRecruited"
  | "legendRecruited"
  | "treasuryExhausted";

/** A structured event shown to a specific player in the turn-start update dialog. */
export interface TurnUpdateEvent {
  id: number;
  type: TurnUpdateType;
  /** Player to whom this event is shown. */
  playerId: number;
  /** Turn on which the event happened. */
  turn: number;
  /** Human-readable description. */
  message: string;
  cityId?: number;
  unitId?: number;
  workId?: number;
  tile?: { col: number; row: number };
  /** Extra type-specific data (e.g. completed production item). */
  payload?: Record<string, unknown>;
}

/** Rich data attached to a natural-wonder discovery log entry, driving the
 *  immediate discovery dialog shown to the civ that found it. */
export interface WonderDiscoveryInfo {
  /** Discovered wonder id (omitted for the "all wonders" completion event). */
  wonderId?: string;
  wonderName: string;
  /** Human-readable reward text, e.g. "+90 science, +40 faith". */
  bonusText: string;
  /** True if this is the discovering civ's first natural wonder. */
  firstDiscovery?: boolean;
  /** Grand reward text shown to first-time discoverers as an incentive. */
  allBonusText?: string;
  /** True when this event marks the discoverer completing EVERY wonder. */
  allComplete?: boolean;
}

/** One line in the shared turn log, with metadata for per-player filtering. */
export interface LogEntry {
  message: string;
  /** Player whose action caused the entry (if any). */
  actorId?: number;
  /** Players directly affected by the entry (e.g. defender, old city owner). */
  targetIds?: number[];
  /** Tile where the event happened (for visibility-based filtering). */
  tile?: { col: number; row: number };
  /** Turn the entry was recorded on. */
  turn?: number;
  /** World-wide announcement visible to everyone (victory, extinction). */
  world?: boolean;
  /** Feature reward category, used by the client to show matching artwork. */
  reward?: FeatureRewardType;
  /** Natural-wonder discovery payload (drives the discovery dialog). */
  wonder?: WonderDiscoveryInfo;
}

export interface GameState {
  map: GameMap;
  players: Player[];
  units: Map<number, Unit>;
  cities: Map<number, City>;
  turn: number;
  currentPlayerIndex: number;
  nextEntityId: number;
  log: LogEntry[];
  gameOver: GameOver | null;
  turnLimit: number;
  religions: Religion[];
  /** Active trade routes between cities (all players). */
  tradeRoutes: TradeRoute[];
  /** In-progress public-works projects (all players). */
  works: Work[];
  /** Wonder ids already completed somewhere in the world (each is world-unique). */
  completedWonders: string[];
  /** Great-person ids already recruited by anyone (each figure is world-unique). */
  recruitedGreatPeople: string[];
  /** Whether the Legends (heroes) feature is on for this game. */
  legendsEnabled: boolean;
  /** Legend ids currently recruited somewhere in the world (each is world-unique
   *  while alive; a rechargeable legend returns to the pool when it retires). */
  recruitedLegends: string[];
  /** Natural-wonder ids placed on this map (the full set a civ must sight to
   *  claim the "discover them all" bonus). */
  naturalWonderIds: string[];
  /** First civ to sight each natural wonder (wonderId -> player id). Set once;
   *  that civ receives the wonder's one-time discovery bonus. */
  discoveredWonders: Record<string, number>;
  /** First civ to have sighted EVERY natural wonder (undefined until claimed). */
  allNaturalWondersClaimedBy?: number;
  // Diplomacy
  /** Relationship records for met pairs of major civs. */
  relations: Relation[];
  /** Directional attitudes (AI-held opinions). */
  attitudes: Attitude[];
  /** Warmonger reputation per player (raised by aggression, decays over time). */
  reputation: Record<number, number>;
  /** First-contact events awaiting the human's acknowledgement. */
  contactQueue: ContactEvent[];
  /** Consensual offers awaiting a response. */
  diploProposals: Proposal[];
  /** Chronological record of concluded diplomatic exchanges (deals, gifts, wars…). */
  tradeHistory: TradeRecord[];
  /** Barbarian intensity setting for this game. */
  barbarianActivity: BarbarianActivity;
  /** Active barbarian truces bought via bribery (see bribery.ts). */
  barbarianBribes: BarbarianBribe[];
  /** Player-scoped events reported at the start of the next turn. */
  turnUpdates: TurnUpdateEvent[];
  /** Monotonically increasing id for turn update events. */
  nextTurnUpdateId: number;
}

/** Construct a unit with all combat fields defaulted. movementLeft starts 0
 *  (set by beginTurn). XP bonus (e.g. from Barracks) can be passed in. */
export function makeUnit(
  id: number,
  ownerId: number,
  type: UnitTypeId,
  col: number,
  row: number,
  xp = 0,
  morale = 100,
): Unit {
  return {
    id,
    ownerId,
    type,
    col,
    row,
    movementLeft: 0,
    hp: UNIT_MAX_HP,
    xp,
    level: 1,
    unspentPromotions: 0,
    promotions: [],
    attackedThisTurn: false,
    attackedLastTurn: false,
    charges: UNIT_DEFS[type].builder ? 3 : 0,
    stance: null,
    abilityCooldowns: {},
    sleeping: false,
    morale,
  };
}

export function currentPlayer(state: GameState): Player {
  return state.players[state.currentPlayerIndex]!;
}

export function playerById(state: GameState, id: number): Player | undefined {
  return state.players.find((p) => p.id === id);
}

export function unitsOf(state: GameState, playerId: number): Unit[] {
  return [...state.units.values()].filter((u) => u.ownerId === playerId);
}

export function citiesOf(state: GameState, playerId: number): City[] {
  return [...state.cities.values()].filter((c) => c.ownerId === playerId);
}

export function unitAt(state: GameState, col: number, row: number): Unit | undefined {
  for (const u of state.units.values()) {
    if (u.col === col && u.row === row) return u;
  }
  return undefined;
}

export function cityAt(state: GameState, col: number, row: number): City | undefined {
  for (const c of state.cities.values()) {
    if (c.col === col && c.row === row) return c;
  }
  return undefined;
}

/** Append a structured entry to the game log. */
export function log(
  state: GameState,
  message: string,
  opts: {
    actorId?: number;
    targetIds?: number[];
    tile?: { col: number; row: number };
    world?: boolean;
    reward?: FeatureRewardType;
    wonder?: WonderDiscoveryInfo;
  } = {},
): void {
  state.log.push({ message, turn: state.turn, ...opts });
}

export function areEnemies(a: Player, b: Player): boolean {
  if (a.id === b.id) return false;
  // Barbarians are hostile to everyone; otherwise hostility requires a declared war.
  if (a.isBarbarian || b.isBarbarian) return true;
  return a.atWar.includes(b.id);
}
