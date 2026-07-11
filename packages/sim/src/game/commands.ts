import { axialDistance, getTile, offsetToAxial } from "@roc/shared";
import type { City, GameState, Player, ProductionItem } from "./state";
import { cityAt, currentPlayer, log, playerById, unitsOf, citiesOf, unitAt, areEnemies } from "./state";
import { isPassableLand, isWaterTerrain } from "./terrain";
import { computeReachable, isCoastalLand, isCoastalWater, isNavalUnit, isWaterDomain, ejectTrespassers } from "./movement";
import { boardShip, disembarkFromShip, syncShipCargo } from "./naval-cargo";
import { updateExplored } from "./visibility";
import { processCity, advanceResearch, advanceGovernment, availableProduction, autoAssignCitizens, toggleCitizen, applyUnitUpkeep } from "./economy";
import {
  cityMaxHp,
  healAndReset,
  resolveAttack,
  cityBombard,
  resolveAmbush,
  availablePromotions,
  towerBombardment,
  unitMaxHp,
} from "./combat";
import { barbarianTurn } from "./barbarians";
import { useAbility, tickAbilities } from "./abilities";
import { breakCover, canStealthMove, stealthMovement } from "./stealth";
import { applyVictoryCheck } from "./victory";
import { convertCitizen, type SpecialistId } from "./specialists";
import {
  advanceWorks,
  tickWonders,
  assignSpecialist,
  cancelWork,
  startWonder,
  startWork,
  unassignSpecialistEverywhere,
} from "./works";
import { cancelRoadRoute, startRoadRoute } from "./road-routes";
import { rushCity, rushWork, rushTraining, type RushCurrency } from "./rush";
import { capitalPopulationBonusFor, BASE_CITY_POPULATION } from "@roc/data";
import { foundTerritory, expandTerritory, canExpandTo, tileOwnerId } from "./territory";
import { onUnitEnter, tickRuins, clearRuin } from "./features";
import { foundReligion, spreadReligion, buyReligiousUnit, evangelize, purgeHeresy, boardTradeRoute, processTransit, upgradeReligion, pickReligionPerk, moveHolyCity } from "./religion";
import { trackCircumnavigation } from "./science-victory";
import { accrueInfluence } from "./culture-victory";
import { establishTradeRoute, cancelTradeRoute, assignTradeEscort, leaveTradeEscort, pruneTradeRoutes } from "./trade";
import { pillageTile, plunderTradeRoute, sackCityCommand } from "./raiding";
import { bribeBarbarian, recruitBarbarian, pruneBarbarianBribes } from "./bribery";
import { useLeaderAbility } from "./leader-abilities";
import { accrueGreatPeople, activateGreatPerson } from "./great-people";
import { recruitLegend, tickLegends } from "./legends";
import { extendLegendsOnTrigger } from "./legend-lifespan";
import { tickLegendPassives } from "./legend-passives";
// import { checkEurekas } from "./eurekas"; // DISABLED for now — see beginTurn
import {
  declareWar,
  makePeace,
  denounce,
  gift,
  demandTribute,
  proposeDeal,
  respondProposal,
  finalizeDeal,
  cancelSharedVision,
  diplomacyTick,
  foreignTerritoryOwner,
  onCityFoundedNearRivals,
} from "./diplomacy";
import type { CityAutoFocus, DealItem } from "./state";
import { gatherPlayerResources } from "./resources";
import {
  civEffectsOf,
  unitMovement,
  civicsUnlocked,
  researchableGovernmentsFor,
  switchableGovernments,
  civicSlotCapacity,
  getCivic,
  getGovernment,
  civicLegal,
  nextCityNameForCiv,
  unitDisplayName,
} from "./civs";
import { aiTakeTurn, autoManageCities, governorPickProduction } from "./ai";
import { onUnitPromoted, decayGlobalMorale, UPKEEP_MODIFIER_MIN, UPKEEP_MODIFIER_MAX } from "./morale";
import {
  UNIT_DEFS,
  TECH_DEFS,
  techUnlocked,
  computeResearchPath,
  advanceResearchQueue,
  UNIT_UPGRADES,
  unitUpgradeCost,
  type ActiveAbilityId,
  type BuildingId,
  type PromotionId,
  type TechId,
  type UnitTypeId,
} from "./content";
import {
  scaledCivicCost,
  scaledCivicSwapFee,
} from "./game-speed";
import { startTraining, cancelTraining } from "./training";

/** Turns before a player may switch government again (docs/CIVICS §2.4). */
const GOVERNMENT_SWITCH_COOLDOWN = 10;

/** A window in which civic swaps are free: the turn a civic was adopted, or the
 *  player's first turn after post-revolution unrest ends (docs/CIVICS §3.2). */
function inFreeReslotWindow(state: GameState, player: Player): boolean {
  return (player.lastCivicAdoptedTurn ?? -Infinity) === state.turn
    || (player.unrestEndedTurn ?? -Infinity) === state.turn;
}

/** Switch to an already-researched government, paying its unrest cost and
 *  re-validating slotted civics (docs/CIVICS §2.4). First adoption from Chiefdom
 *  is free; a same-lineage step costs 1 turn of unrest; an off-lineage revolution
 *  costs 3. Civics no longer legal auto-unslot; the rest are trimmed to the new
 *  slot count (they stay adopted, and lie dormant until unrest ends). */
function switchGovernment(state: GameState, player: Player, targetId: string): void {
  const from = getGovernment(player.government);
  const to = getGovernment(targetId)!;
  let unrest: number;
  if (player.government === "chiefdom") unrest = 0;
  else if (from && from.branch.some((b) => to.branch.includes(b))) unrest = 1;
  else unrest = 3;
  player.government = targetId;
  player.governmentChangedTurn = state.turn;
  player.unrestTurns = unrest;
  player.slottedCivics = player.slottedCivics.filter((id) => civicLegal(targetId, id));
  const cap = civicSlotCapacity(player);
  if (player.slottedCivics.length > cap) player.slottedCivics = player.slottedCivics.slice(0, cap);
  if (unrest > 0) {
    log(state, `${player.name} embraced ${to.name} — ${unrest} turn${unrest > 1 ? "s" : ""} of unrest grip the realm.`, { actorId: player.id, targetIds: [player.id] });
    if (unrest >= 3) extendLegendsOnTrigger(state, player.id, "revolution");
  } else {
    log(state, `${player.name} established its first government: ${to.name}.`, { actorId: player.id, targetIds: [player.id] });
  }
}

/** Wind down unrest by one turn; the turn it hits zero opens a free re-slot
 *  window on the player's next turn (docs/CIVICS §2.4). */
function tickUnrest(state: GameState, player: Player): void {
  if (player.unrestTurns > 0) {
    player.unrestTurns -= 1;
    if (player.unrestTurns === 0) player.unrestEndedTurn = state.turn + 1;
  }
}

export type Command =
  | { type: "move"; unitId: number; col: number; row: number }
  | { type: "attack"; attackerId: number; col: number; row: number }
  | { type: "cityBombard"; cityId: number; col: number; row: number }
  | { type: "foundCity"; unitId: number }
  | { type: "promote"; unitId: number; promotion: PromotionId }
  | { type: "useAbility"; unitId: number; ability: ActiveAbilityId; col?: number; row?: number }
  | { type: "sleep"; unitId: number }
  | { type: "wake"; unitId: number }
  | { type: "convertCitizen"; cityId: number; specialistId: string; delta: number }
  | { type: "startWork"; kind: string; col: number; row: number }
  | {
      type: "startRoadRoute";
      fromCol: number;
      fromRow: number;
      toCol: number;
      toRow: number;
      specialistIds?: number[];
    }
  | { type: "cancelRoadRoute"; routeId: number }
  | { type: "startWonder"; wonderId: string; col: number; row: number }
  | { type: "assignSpecialist"; workId: number; specialistId: number; on: boolean }
  | { type: "cancelWork"; workId: number }
  | { type: "setProduction"; cityId: number; item: ProductionItem }
  | { type: "startTraining"; cityId: number; unit: UnitTypeId }
  | { type: "cancelTraining"; cityId: number; orderId: number }
  | { type: "rushTraining"; cityId: number; orderId: number; currency: RushCurrency }
  | { type: "rushProduction"; cityId: number; currency: RushCurrency }
  | { type: "rushWork"; workId: number; currency: RushCurrency }
  | { type: "assignCitizen"; cityId: number; col: number; row: number }
  | { type: "setCityAutoMode"; cityId: number; mode: CityAutoFocus | null }
  | { type: "setExpandTarget"; cityId: number; target: { col: number; row: number } | null }
  | { type: "setResearch"; techId: TechId }
  | { type: "setResearchTarget"; techId: TechId }
  | { type: "setResearchGovernment"; governmentId: string }
  | { type: "setGovernment"; governmentId: string }
  | { type: "adoptCivic"; civicId: string }
  | { type: "slotCivic"; civicId: string }
  | { type: "unslotCivic"; civicId: string }
  | { type: "foundReligion"; cityId: number; name: string; beliefs: string[] }
  | { type: "buyReligiousUnit"; cityId: number; unit: UnitTypeId }
  | { type: "evangelize"; unitId: number; cityId: number }
  | { type: "purgeHeresy"; unitId: number; cityId: number }
  | { type: "boardTradeRoute"; unitId: number; routeId: number }
  | { type: "upgradeReligion" }
  | { type: "pickReligionPerk"; perkId: string }
  | { type: "moveHolyCity"; cityId: number }
  | { type: "establishTradeRoute"; unitId: number; destCityId: number }
  | { type: "cancelTradeRoute"; routeId: number }
  | { type: "assignTradeEscort"; unitId: number; routeId: number }
  | { type: "leaveTradeEscort"; routeId: number }
  | { type: "bribeBarbarian"; unitId: number }
  | { type: "recruitBarbarian"; unitId: number }
  | { type: "pillage"; unitId: number }
  | { type: "plunderTradeRoute"; unitId: number; routeId: number }
  | { type: "sackCity"; unitId: number }
  | { type: "embark"; unitId: number; col: number; row: number }
  | { type: "disembark"; unitId: number; col: number; row: number }
  | { type: "boardShip"; unitId: number; shipId: number }
  | { type: "disembarkFromShip"; unitId: number }
  | { type: "declareWar"; targetId: number }
  | { type: "makePeace"; targetId: number }
  | { type: "denounce"; targetId: number }
  | { type: "giftTo"; targetId: number; gold?: number; resource?: string }
  | { type: "demandTribute"; targetId: number; gold?: number; resource?: string }
  | { type: "proposeDeal"; targetId: number; give: DealItem[]; want: DealItem[] }
  | { type: "cancelSharedVision"; targetId: number }
  | { type: "respondProposal"; proposalId: number; accept: boolean }
  | { type: "finalizeDeal"; proposalId: number; confirm: boolean }
  | { type: "acknowledgeContact"; otherId: number }
  | { type: "useLeaderAbility" }
  | { type: "activateGreatPerson"; greatPersonId: string }
  | { type: "recruitLegend"; legendId: string; cityId?: number }
  | { type: "upgradeUnit"; unitId: number }
  | { type: "setUpkeepModifier"; pct: number }
  | { type: "endTurn" };

export interface CommandResult {
  ok: boolean;
  error?: string;
}

const ok: CommandResult = { ok: true };
const fail = (error: string): CommandResult => ({ ok: false, error });

const MIN_CITY_DISTANCE = 3;

/** Begin the current player's turn: refresh movement, heal, run economy, reveal. */
export function beginTurn(state: GameState): void {
  const player = currentPlayer(state);
  pruneTradeRoutes(state); // drop routes whose cities were lost/captured
  if (state.currentPlayerIndex === 0) tickRuins(state); // ruins fade once per round
  for (const u of unitsOf(state, player.id)) {
    if (u.sleeping) continue;
    if (u.aboardShipId !== undefined) {
      u.movementLeft = unitMovement(state, u); // may jump ashore this turn
      continue;
    }
    u.movementLeft = unitMovement(state, u);
    // A concealed stealth-mover creeps at one third its normal pace.
    if (u.hidden && canStealthMove(state, u)) u.movementLeft = stealthMovement(u.movementLeft);
  }
  healAndReset(state, player);
  decayGlobalMorale(state, player); // global morale slips when wins dry up
  tickAbilities(state, player); // expire stances/pulses, enforce pins (after movement reset)
  tickLegends(state, player.id); // retire heroes whose lifespan has elapsed
  tickLegendPassives(state, player); // living heroes' per-turn powers (income, drilling, dread)
  gatherPlayerResources(state, player.id);
  tickWonders(state, player.id); // active wonder effects (e.g. the Colossus's free warships)
  for (const c of citiesOf(state, player.id)) {
    c.rangedAttacksUsed = 0;
    c.rangedAttackUsed = false; // legacy flag: pre-0.6.0 saves carry it stuck true
    processCity(state, c, player);
  }
  autoManageCities(state, player); // governor mode: opted-in cities manage themselves
  // checkEurekas(state, player);   // DISABLED for now — eurekas kept in eurekas.ts but not fired
  advanceResearch(state, player);   // complete at most one tech from the pooled science
  advanceGovernment(state, player); // and at most one government node from the pooled culture
  tickUnrest(state, player); // wind down post-revolution unrest (opens a free re-slot window)
  ejectTrespassers(state); // bump any unit a freshly-expanded border just enclosed off foreign soil
  applyUnitUpkeep(state, player); // empire-wide unit maintenance after city income
  processTransit(state, player.id); // deliver religious units riding trade routes
  for (const u of unitsOf(state, player.id)) if (u.inTransit) u.movementLeft = 0; // still travelling
  if (state.enabledVictories?.has("science")) trackCircumnavigation(state, player.id);
  if (state.enabledVictories?.has("culture")) accrueInfluence(state, player.id);
  accrueGreatPeople(state, player); // class points -> recruit Great People
  advanceWorks(state, player.id); // specialists labour on public works
  towerBombardment(state, player.id); // towers fire on adjacent enemies
  // Religion spreads + diplomacy ticks once per round (at the start of player 0's turn).
  if (state.currentPlayerIndex === 0) {
    spreadReligion(state);
    diplomacyTick(state);
    pruneBarbarianBribes(state); // expire truces whose 10 turns have elapsed
  }
  updateExplored(state, player.id);
}

/** Advance to the next player and auto-run non-human (barbarian) turns. */
export function endTurn(state: GameState): void {
  if (state.gameOver) return;
  const advance = (): void => {
    state.currentPlayerIndex = (state.currentPlayerIndex + 1) % state.players.length;
    if (state.currentPlayerIndex === 0) state.turn += 1;
    beginTurn(state);
  };
  advance();
  let guard = 0;
  while (!currentPlayer(state).isHuman && guard++ < state.players.length + 1) {
    const p = currentPlayer(state);
    // A crash in one AI/barbarian turn must never strand the loop: if the body
    // throws we log it and still advance, so control always returns to the human
    // rather than leaving the (client-derived) viewer stuck on an opponent.
    try {
      if (p.isBarbarian) barbarianTurn(state);
      else aiTakeTurn(state, p.id);
    } catch (err) {
      console.error(`AI turn failed for ${p.name} (id ${p.id}):`, err);
    }
    advance();
  }
  applyVictoryCheck(state);
}

/**
 * Apply a validated command. `actingPlayerId` is whose order this is — defaults
 * to the current player (hotseat/sequential), but the multiplayer server passes
 * the submitting player's id so simultaneous orders are validated per-owner.
 */
export function applyCommand(
  state: GameState,
  cmd: Command,
  actingPlayerId?: number,
): CommandResult {
  const player =
    (actingPlayerId !== undefined ? playerById(state, actingPlayerId) : undefined) ??
    currentPlayer(state);

  switch (cmd.type) {
    case "useLeaderAbility": {
      const result = useLeaderAbility(state, player);
      return result.ok ? ok : fail(result.error ?? "leader ability failed");
    }

    case "activateGreatPerson": {
      const result = activateGreatPerson(state, player, cmd.greatPersonId);
      return result.ok ? ok : fail(result.error ?? "could not activate Great Person");
    }

    case "recruitLegend": {
      const result = recruitLegend(state, player.id, cmd.legendId, cmd.cityId);
      if (result.ok) updateExplored(state, player.id);
      return result.ok ? ok : fail(result.error ?? "could not recruit Legend");
    }

    case "endTurn": {
      endTurn(state);
      return ok;
    }

    case "move": {
      const unit = state.units.get(cmd.unitId);
      if (!unit) return fail("no such unit");
      if (unit.ownerId !== player.id) return fail("not your unit");
      if (unit.aboardShipId !== undefined) return fail("aboard a ship — disembark first");
      const entry = computeReachable(state, unit).get(`${cmd.col},${cmd.row}`);
      if (!entry) return fail("tile not reachable");
      // Stepping onto a concealed enemy springs their ambush: the intruder is
      // halted and struck (−20%), and the hidden unit is revealed. (computeReachable
      // only routes here because occupancy lets a mover step onto a hidden enemy.)
      const occupant = unitAt(state, cmd.col, cmd.row);
      if (occupant && occupant.ownerId !== unit.ownerId && occupant.hidden) {
        breakCover(state, occupant); // reveal + arm the ambush bonus
        unit.movementLeft = 0;
        unit.attackedThisTurn = true;
        resolveAmbush(state, occupant, unit);
        log(state, `${player.name}'s ${unitDisplayName(state, unit)} walked into an ambush!`, {
          actorId: occupant.ownerId,
          targetIds: [player.id, occupant.ownerId],
          tile: { col: cmd.col, row: cmd.row },
        });
        updateExplored(state, player.id);
        return ok;
      }
      unit.col = cmd.col;
      unit.row = cmd.row;
      unit.movementLeft = Math.max(0, unit.movementLeft - entry.cost);
      if (isNavalUnit(unit)) syncShipCargo(state, unit);
      if (unit.stance === "emplace" || unit.stance === "wagenburg") unit.stance = null; // moving packs up an engine / unchains the wagons
      // Moving breaks concealment — unless this unit can creep while hidden.
      if (unit.hidden && !canStealthMove(state, unit)) breakCover(state, unit);
      onUnitEnter(state, unit); // resolve villages / barbarian camps
      updateExplored(state, player.id);
      return ok;
    }

    case "attack": {
      const unit = state.units.get(cmd.attackerId);
      if (!unit) return fail("no such unit");
      if (unit.ownerId !== player.id) return fail("not your unit");
      const res = resolveAttack(state, unit, cmd.col, cmd.row);
      if (res.ok) updateExplored(state, player.id);
      return res;
    }

    case "cityBombard": {
      const res = cityBombard(state, player.id, cmd.cityId, cmd.col, cmd.row);
      if (res.ok) updateExplored(state, player.id);
      return res;
    }

    case "foundCity": {
      const unit = state.units.get(cmd.unitId);
      if (!unit) return fail("no such unit");
      if (unit.ownerId !== player.id) return fail("not your unit");
      if (!UNIT_DEFS[unit.type].founder) return fail("unit cannot found cities");
      const tile = getTile(state.map, unit.col, unit.row);
      if (!tile || !isPassableLand(tile.terrain)) return fail("invalid terrain");
      if (cityAt(state, unit.col, unit.row)) return fail("already a city here");
      const here = offsetToAxial({ col: unit.col, row: unit.row });
      for (const c of state.cities.values()) {
        if (axialDistance(here, offsetToAxial({ col: c.col, row: c.row })) < MIN_CITY_DISTANCE) {
          return fail("too close to another city");
        }
      }
      const isCapital = citiesOf(state, player.id).length === 0;
      const foundedCount = citiesOf(state, player.id).length;
      const name = nextCityNameForCiv(player.civId, foundedCount);
      const id = state.nextEntityId++;
      // The capital (a civ's first city) is founded larger so it can grow and train
      // straight away — at BASE_CITY_POPULATION, plus its capitalPopulationBonus. Later
      // cities are founded small (pop 1) and must grow into their potential.
      const startPop = isCapital ? BASE_CITY_POPULATION + capitalPopulationBonusFor(player.civId) : 1;
      const city: City = {
        id,
        ownerId: player.id,
        name,
        col: unit.col,
        row: unit.row,
        population: startPop,
        foodStored: 0,
        productionStored: 0,
        production: null,
        buildings: [],
        training: {},
        trainingQueue: [],
        specialists: [],
        wonders: [],
        workedTiles: [],
        isCapital,
        foundedAsCapital: isCapital,
        hp: 0,
        lastAttackedTurn: 0,
        rangedAttacksUsed: 0,
        modifiers: [],
      };
      state.cities.set(id, city);
      clearRuin(tile); // a new city rises over any ruin on the spot
      foundTerritory(state, city);
      // Civ founding bonuses (e.g. Rome's free Monument).
      const eff = civEffectsOf(state, player.id);
      if (eff.newCityFreeBuilding && !city.buildings.includes(eff.newCityFreeBuilding as BuildingId)) {
        city.buildings.push(eff.newCityFreeBuilding as BuildingId);
      }
      if (eff.newCityExtraPopulation) {
        city.population += eff.newCityExtraPopulation;
        expandTerritory(state, city, eff.newCityExtraPopulation);
      }
      autoAssignCitizens(state, city); // assign the founding citizens to tiles
      city.hp = cityMaxHp(city);
      state.units.delete(unit.id);
      log(state, `${player.name} founded ${name}.`, { actorId: player.id, targetIds: [player.id], tile: { col: city.col, row: city.row } });
      updateExplored(state, player.id);
      onCityFoundedNearRivals(state, city); // met neighbours resent a city on their doorstep
      return ok;
    }

    case "convertCitizen": {
      const city = state.cities.get(cmd.cityId);
      if (!city) return fail("no such city");
      if (city.ownerId !== player.id) return fail("not your city");
      const res = convertCitizen(state, city, cmd.specialistId as SpecialistId, cmd.delta);
      if (res.ok) {
        // A released craftsman must drop off any Work it was labouring on.
        if (res.releasedId !== undefined) unassignSpecialistEverywhere(state, player.id, res.releasedId);
        autoAssignCitizens(state, city, city.autoMode); // re-staff tiles around the new specialist count
      }
      return res;
    }

    case "startWork": {
      return startWork(state, player.id, cmd.kind, cmd.col, cmd.row);
    }

    case "startRoadRoute": {
      return startRoadRoute(
        state,
        player.id,
        cmd.fromCol,
        cmd.fromRow,
        cmd.toCol,
        cmd.toRow,
        cmd.specialistIds,
      );
    }

    case "cancelRoadRoute": {
      return cancelRoadRoute(state, cmd.routeId, player.id);
    }

    case "startWonder": {
      return startWonder(state, player.id, cmd.wonderId, cmd.col, cmd.row);
    }

    case "assignSpecialist": {
      return assignSpecialist(state, player.id, cmd.workId, cmd.specialistId, cmd.on);
    }

    case "cancelWork": {
      return cancelWork(state, cmd.workId, player.id);
    }

    case "promote": {
      const unit = state.units.get(cmd.unitId);
      if (!unit) return fail("no such unit");
      if (unit.ownerId !== player.id) return fail("not your unit");
      if (unit.unspentPromotions <= 0) return fail("no promotion available");
      if (!availablePromotions(unit).includes(cmd.promotion)) return fail("invalid promotion");
      unit.promotions.push(cmd.promotion);
      unit.unspentPromotions -= 1;
      if (cmd.promotion === "colonist") {
        // HP-boosting promotions also heal the unit by the same amount.
        unit.hp = Math.min(unitMaxHp(unit), unit.hp + 15);
      }
      if (cmd.promotion === "toughness") {
        unit.hp = Math.min(unitMaxHp(unit), unit.hp + 15);
      }
      onUnitPromoted(state, unit); // the unit and nearby allies are heartened
      return ok;
    }

    case "upgradeUnit": {
      const unit = state.units.get(cmd.unitId);
      if (!unit) return fail("no such unit");
      if (unit.ownerId !== player.id) return fail("not your unit");
      const toType = UNIT_UPGRADES[unit.type];
      if (!toType) return fail("this unit has no upgrade");
      const toDef = UNIT_DEFS[toType];
      if (toDef.reqTech && !player.researched.has(toDef.reqTech)) return fail("required tech not researched");
      if (toDef.reqResource && (player.resources[toDef.reqResource.resource] ?? 0) < toDef.reqResource.count)
        return fail("required resource not available");
      if (tileOwnerId(state, unit.col, unit.row) !== player.id) return fail("must be on your own territory");
      const cost = unitUpgradeCost(unit.type, toType);
      if (player.gold < cost) return fail("not enough gold");
      player.gold -= cost;
      unit.type = toType;
      unit.hp = unitMaxHp(unit); // upgrade restores to full tier HP
      unit.movementLeft = 0; // unit loses its turn
      unit.stance = null;     // clear any stance (new unit type may not support it)
      if (toDef.gunpowder) { unit.loaded = true; unit.reloading = false; }
      log(state, `${player.name} upgraded a unit to ${toDef.name} (cost ${cost}🪙).`, {
        actorId: player.id,
        targetIds: [player.id],
        tile: { col: unit.col, row: unit.row },
      });
      return ok;
    }

    case "useAbility": {
      const unit = state.units.get(cmd.unitId);
      if (!unit) return fail("no such unit");
      if (unit.ownerId !== player.id) return fail("not your unit");
      const res = useAbility(state, unit, cmd.ability, cmd.col, cmd.row);
      if (res.ok) updateExplored(state, player.id);
      return res;
    }

    case "sleep": {
      const unit = state.units.get(cmd.unitId);
      if (!unit) return fail("no such unit");
      if (unit.ownerId !== player.id) return fail("not your unit");
      unit.sleeping = true;
      unit.movementLeft = 0;
      return ok;
    }

    case "wake": {
      const unit = state.units.get(cmd.unitId);
      if (!unit) return fail("no such unit");
      if (unit.ownerId !== player.id) return fail("not your unit");
      if (unit.hidden) {
        breakCover(state, unit); // come out of hiding (arms an ambush if foes are near)
        return ok;
      }
      if (!unit.sleeping) return fail("unit is not sleeping");
      unit.sleeping = false;
      unit.movementLeft = unitMovement(state, unit);
      return ok;
    }

    case "setProduction": {
      const city = state.cities.get(cmd.cityId);
      if (!city) return fail("no such city");
      if (city.ownerId !== player.id) return fail("not your city");
      const want = cmd.item;
      const allowed = availableProduction(state, player, city).some((o) => {
        if (o.item.kind !== want.kind) return false;
        if (o.item.kind === "trainingBuilding" && want.kind === "trainingBuilding") {
          return o.item.family === want.family && o.item.tier === want.tier;
        }
        if (o.item.kind === "building" && want.kind === "building") return o.item.id === want.id;
        if (o.item.kind === "project" && want.kind === "project") return o.item.id === want.id;
        return false;
      });
      if (!allowed) return fail("cannot build that");
      city.production = cmd.item;
      return ok;
    }

    case "startTraining": {
      const city = state.cities.get(cmd.cityId);
      if (!city) return fail("no such city");
      if (city.ownerId !== player.id) return fail("not your city");
      return startTraining(state, city, cmd.unit);
    }

    case "cancelTraining": {
      const city = state.cities.get(cmd.cityId);
      if (!city) return fail("no such city");
      if (city.ownerId !== player.id) return fail("not your city");
      return cancelTraining(state, city, cmd.orderId);
    }

    case "rushTraining": {
      return rushTraining(state, player.id, cmd.cityId, cmd.orderId, cmd.currency);
    }

    case "rushProduction": {
      return rushCity(state, player.id, cmd.cityId, cmd.currency);
    }

    case "rushWork": {
      return rushWork(state, player.id, cmd.workId, cmd.currency);
    }

    case "assignCitizen": {
      const city = state.cities.get(cmd.cityId);
      if (!city) return fail("no such city");
      if (city.ownerId !== player.id) return fail("not your city");
      if (!toggleCitizen(state, city, cmd.col, cmd.row)) return fail("tile not workable");
      return ok;
    }

    case "setCityAutoMode": {
      const city = state.cities.get(cmd.cityId);
      if (!city) return fail("no such city");
      if (city.ownerId !== player.id) return fail("not your city");
      city.autoMode = cmd.mode ?? undefined;
      autoAssignCitizens(state, city, city.autoMode); // re-skew worked tiles toward the new focus immediately
      // Pick production this same turn (if the city isn't already building something).
      // Other governor actions (works, training) still wait for the normal turn tick.
      if (city.autoMode) governorPickProduction(state, city, player);
      return ok;
    }

    case "setExpandTarget": {
      const city = state.cities.get(cmd.cityId);
      if (!city) return fail("no such city");
      if (city.ownerId !== player.id) return fail("not your city");
      if (cmd.target === null) {
        city.expandTarget = undefined;
        return ok;
      }
      if (!canExpandTo(state, city, cmd.target.col, cmd.target.row)) return fail("tile not claimable");
      city.expandTarget = { col: cmd.target.col, row: cmd.target.row };
      return ok;
    }

    case "setResearch": {
      if (player.researched.has(cmd.techId)) return fail("already researched");
      if (!techUnlocked(player.researched, cmd.techId)) return fail("prereqs not met");
      player.researching = cmd.techId;
      player.researchQueue = [];
      log(state, `${player.name} is researching ${TECH_DEFS[cmd.techId].name}.`, { actorId: player.id, targetIds: [player.id] });
      return ok;
    }

    case "setResearchTarget": {
      if (player.researched.has(cmd.techId)) return fail("already researched");
      const path = computeResearchPath(player.researched, cmd.techId);
      if (path.length === 0) return fail("already researched");
      player.researching = path[0]!;
      player.researchQueue = path.slice(1);
      log(state, `${player.name} is researching ${TECH_DEFS[path[0]!].name} (target: ${TECH_DEFS[cmd.techId].name}).`, { actorId: player.id, targetIds: [player.id] });
      return ok;
    }

    case "setResearchGovernment": {
      if (!civicsUnlocked(player)) return fail("government tree not unlocked yet");
      const def = getGovernment(cmd.governmentId);
      if (!def) return fail("no such government");
      if (player.governmentsResearched.has(cmd.governmentId)) return fail("already researched");
      if (!researchableGovernmentsFor(player).includes(cmd.governmentId)) return fail("prereqs not met");
      player.researchingGovernment = cmd.governmentId;
      log(state, `${player.name} is developing ${def.name}.`, { actorId: player.id, targetIds: [player.id] });
      return ok;
    }

    case "setGovernment": {
      const gov = getGovernment(cmd.governmentId);
      if (!gov) return fail("no such government");
      if (cmd.governmentId === player.government) return fail("already governing this way");
      if (!switchableGovernments(player).includes(cmd.governmentId)) return fail("government not researched");
      if (state.turn - player.governmentChangedTurn < GOVERNMENT_SWITCH_COOLDOWN) return fail("too soon since the last change");
      switchGovernment(state, player, cmd.governmentId);
      return ok;
    }

    case "adoptCivic": {
      if (!civicsUnlocked(player)) return fail("civics not unlocked yet");
      const def = getCivic(cmd.civicId);
      if (!def) return fail("no such civic");
      if (player.civicsAdopted.has(cmd.civicId)) return fail("already adopted");
      if (!civicLegal(player.government, cmd.civicId)) return fail("not legal under your government");
      if ((player.lastCivicAdoptedTurn ?? -Infinity) === state.turn) return fail("only one civic may be adopted per turn");
      const cost = scaledCivicCost(state, def, player.civicsAdopted.size);
      if (player.cultureProgress < cost) return fail("not enough culture");
      player.cultureProgress -= cost;
      player.civicsAdopted.add(cmd.civicId);
      player.lastCivicAdoptedTurn = state.turn;
      extendLegendsOnTrigger(state, player.id, "civic_adopted");
      // A newly adopted civic slots for free if there is room.
      if (player.slottedCivics.length < civicSlotCapacity(player)) player.slottedCivics.push(cmd.civicId);
      log(state, `${player.name} adopted the ${def.name} civic.`, { actorId: player.id, targetIds: [player.id] });
      return ok;
    }

    case "slotCivic": {
      if (!player.civicsAdopted.has(cmd.civicId)) return fail("civic not adopted");
      if (player.slottedCivics.includes(cmd.civicId)) return fail("already slotted");
      if (!civicLegal(player.government, cmd.civicId)) return fail("not legal under your government");
      if (player.slottedCivics.length >= civicSlotCapacity(player)) return fail("no free civic slots");
      player.slottedCivics.push(cmd.civicId);
      return ok;
    }

    case "unslotCivic": {
      const idx = player.slottedCivics.indexOf(cmd.civicId);
      if (idx < 0) return fail("civic not slotted");
      // Swapping a civic out costs 10% of its base tier cost — unless this is a
      // free re-slot window (the turn you adopt, or the turn unrest ends).
      if (!inFreeReslotWindow(state, player)) {
        const fee = scaledCivicSwapFee(state, getCivic(cmd.civicId)?.cost ?? 0);
        if (player.cultureProgress < fee) return fail("not enough culture for the swap fee");
        player.cultureProgress -= fee;
      }
      player.slottedCivics.splice(idx, 1);
      return ok;
    }

    case "foundReligion": {
      return foundReligion(state, player.id, cmd.cityId, cmd.name, cmd.beliefs);
    }

    case "upgradeReligion":
      return upgradeReligion(state, player.id);

    case "pickReligionPerk":
      return pickReligionPerk(state, player.id, cmd.perkId);

    case "moveHolyCity":
      return moveHolyCity(state, player.id, cmd.cityId);

    case "buyReligiousUnit":
      return buyReligiousUnit(state, player.id, cmd.cityId, cmd.unit);

    case "evangelize": {
      const u = state.units.get(cmd.unitId);
      if (!u || u.ownerId !== player.id) return fail("not your unit");
      return evangelize(state, cmd.unitId, cmd.cityId);
    }

    case "purgeHeresy": {
      const u = state.units.get(cmd.unitId);
      if (!u || u.ownerId !== player.id) return fail("not your unit");
      return purgeHeresy(state, cmd.unitId, cmd.cityId);
    }

    case "boardTradeRoute": {
      const u = state.units.get(cmd.unitId);
      if (!u || u.ownerId !== player.id) return fail("not your unit");
      return boardTradeRoute(state, cmd.unitId, cmd.routeId);
    }

    case "establishTradeRoute": {
      return establishTradeRoute(state, cmd.unitId, cmd.destCityId, player.id);
    }

    case "cancelTradeRoute": {
      return cancelTradeRoute(state, cmd.routeId, player.id);
    }

    case "assignTradeEscort": {
      const r = assignTradeEscort(state, cmd.unitId, cmd.routeId, player.id);
      return r.ok ? ok : fail(r.error ?? "cannot assign escort");
    }

    case "leaveTradeEscort": {
      const r = leaveTradeEscort(state, cmd.routeId, player.id);
      return r.ok ? ok : fail(r.error ?? "cannot leave escort");
    }

    case "bribeBarbarian":
      return bribeBarbarian(state, player.id, cmd.unitId);

    case "recruitBarbarian": {
      const res = recruitBarbarian(state, player.id, cmd.unitId);
      if (res.ok) updateExplored(state, player.id);
      return res;
    }

    case "pillage":
      return pillageTile(state, cmd.unitId, player.id);

    case "plunderTradeRoute":
      return plunderTradeRoute(state, cmd.unitId, cmd.routeId, player.id);

    case "sackCity":
      return sackCityCommand(state, cmd.unitId, player.id);

    case "embark": {
      const unit = state.units.get(cmd.unitId);
      if (!unit) return fail("no such unit");
      if (unit.ownerId !== player.id) return fail("not your unit");
      if (isNavalUnit(unit)) return fail("already naval");
      if (isWaterDomain(unit)) return fail("already embarked");
      if (unit.movementLeft <= 0) return fail("no movement");
      // Putting a land unit to sea is unlocked by Sailing (see docs/TECHNOLOGIES.md).
      // (Innate-embark civ traits — Polynesia/Norse — are flavour not yet implemented.)
      if (!player.researched.has("sailing")) return fail("requires Sailing to embark");
      const tile = getTile(state.map, unit.col, unit.row);
      if (!tile || isWaterTerrain(tile.terrain)) return fail("must be on land");
      if (!isCoastalLand(state, unit.col, unit.row)) return fail("not coastal");
      const target = getTile(state.map, cmd.col, cmd.row);
      if (!target || !isWaterTerrain(target.terrain)) return fail("target must be water");
      if (!isCoastalWater(state, cmd.col, cmd.row)) return fail("target must be coastal water");
      if (axialDistance(offsetToAxial({ col: unit.col, row: unit.row }), offsetToAxial({ col: cmd.col, row: cmd.row })) !== 1) {
        return fail("target not adjacent");
      }
      // Foreign waters are off-limits without war or open borders — same rule the land
      // `move` path enforces via computeReachable; embarking must not be a loophole.
      if (foreignTerritoryOwner(state, player.id, cmd.col, cmd.row) !== null) {
        return fail("foreign territory — make war or secure open borders first");
      }
      // Cannot embark into an occupied tile.
      for (const u of state.units.values()) {
        if (u.id !== unit.id && u.col === cmd.col && u.row === cmd.row) return fail("tile occupied");
      }
      unit.col = cmd.col;
      unit.row = cmd.row;
      unit.embarked = true;
      unit.movementLeft = 0; // embarking consumes the turn's movement
      updateExplored(state, player.id);
      return ok;
    }

    case "disembark": {
      const unit = state.units.get(cmd.unitId);
      if (!unit) return fail("no such unit");
      if (unit.ownerId !== player.id) return fail("not your unit");
      if (!unit.embarked) return fail("not embarked");
      if (unit.movementLeft <= 0) return fail("no movement");
      const tile = getTile(state.map, unit.col, unit.row);
      if (!tile || !isWaterTerrain(tile.terrain)) return fail("must be on water");
      const target = getTile(state.map, cmd.col, cmd.row);
      if (!target || isWaterTerrain(target.terrain)) return fail("target must be land");
      if (!isPassableLand(target.terrain)) return fail("impassable terrain");
      if (axialDistance(offsetToAxial({ col: unit.col, row: unit.row }), offsetToAxial({ col: cmd.col, row: cmd.row })) !== 1) {
        return fail("target not adjacent");
      }
      // Can't wade ashore into a civ's land without war or open borders (mirrors `move`).
      if (foreignTerritoryOwner(state, player.id, cmd.col, cmd.row) !== null) {
        return fail("foreign territory — make war or secure open borders first");
      }
      for (const u of state.units.values()) {
        if (u.id !== unit.id && u.col === cmd.col && u.row === cmd.row) return fail("tile occupied");
      }
      unit.col = cmd.col;
      unit.row = cmd.row;
      unit.embarked = false;
      unit.movementLeft = 0; // disembarking consumes the turn's movement
      updateExplored(state, player.id);
      return ok;
    }

    case "boardShip": {
      const res = boardShip(state, cmd.unitId, cmd.shipId, player.id);
      if (res.ok) updateExplored(state, player.id);
      return res;
    }

    case "disembarkFromShip": {
      const res = disembarkFromShip(state, cmd.unitId, player.id);
      if (res.ok) updateExplored(state, player.id);
      return res;
    }

    case "declareWar":
      return declareWar(state, player.id, cmd.targetId);
    case "makePeace":
      return makePeace(state, player.id, cmd.targetId);
    case "denounce":
      return denounce(state, player.id, cmd.targetId);
    case "giftTo":
      return gift(state, player.id, cmd.targetId, cmd.gold ?? 0, cmd.resource);
    case "demandTribute":
      return demandTribute(state, player.id, cmd.targetId, cmd.gold ?? 0, cmd.resource);
    case "proposeDeal":
      return proposeDeal(state, player.id, cmd.targetId, cmd.give, cmd.want);
    case "cancelSharedVision":
      return cancelSharedVision(state, player.id, cmd.targetId);
    case "respondProposal":
      return respondProposal(state, player.id, cmd.proposalId, cmd.accept);
    case "finalizeDeal":
      return finalizeDeal(state, player.id, cmd.proposalId, cmd.confirm);
    case "acknowledgeContact": {
      state.contactQueue = state.contactQueue.filter(
        (e) => !(e.youId === player.id && e.otherId === cmd.otherId),
      );
      return ok;
    }

    case "setUpkeepModifier": {
      if (!Number.isFinite(cmd.pct)) return fail("invalid pay setting");
      player.upkeepModifierPct = Math.max(
        UPKEEP_MODIFIER_MIN,
        Math.min(UPKEEP_MODIFIER_MAX, Math.round(cmd.pct)),
      );
      return ok;
    }
  }
}
