import { axialDistance, getTile, offsetToAxial } from "@roc/shared";
import type { City, GameState, ProductionItem } from "./state";
import { cityAt, currentPlayer, log, playerById, unitsOf, citiesOf, unitAt, areEnemies } from "./state";
import { isPassableLand, isWaterTerrain } from "./terrain";
import { computeReachable, isCoastalLand, isCoastalWater, isNavalUnit, isWaterDomain } from "./movement";
import { updateExplored } from "./visibility";
import { processCity, availableProduction, autoAssignCitizens, toggleCitizen, applyUnitUpkeep } from "./economy";
import {
  cityMaxHp,
  healAndReset,
  resolveAttack,
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
  assignCityToWonder,
  cancelWork,
  startWonder,
  startWork,
} from "./works";
import { foundTerritory, expandTerritory } from "./territory";
import { onUnitEnter } from "./features";
import { foundReligion, spreadReligion } from "./religion";
import { establishTradeRoute, pruneTradeRoutes } from "./trade";
import { pillageTile, plunderTradeRoute, sackCityCommand } from "./raiding";
import { bribeBarbarian, recruitBarbarian, pruneBarbarianBribes } from "./bribery";
import { useLeaderAbility } from "./leader-abilities";
import { accrueGreatPeople, activateGreatPerson } from "./great-people";
import { recruitLegend, tickLegends } from "./legends";
import {
  declareWar,
  makePeace,
  denounce,
  gift,
  demandTribute,
  proposeDeal,
  respondProposal,
  finalizeDeal,
  diplomacyTick,
} from "./diplomacy";
import type { DealItem } from "./state";
import { gatherPlayerResources } from "./resources";
import {
  civEffectsOf,
  unitMovement,
  civicUnlocked,
  civicsUnlocked,
  availableGovernments,
  unlockedPolicies,
  getCivic,
  getGovernment,
  nextCityNameForCiv,
} from "./civs";
import { aiTakeTurn } from "./ai";
import { onUnitPromoted, decayGlobalMorale } from "./morale";
import { UNIT_DEFS, TECH_DEFS, techUnlocked, computeResearchPath, advanceResearchQueue, type ActiveAbilityId, type BuildingId, type PromotionId, type TechId } from "./content";

export type Command =
  | { type: "move"; unitId: number; col: number; row: number }
  | { type: "attack"; attackerId: number; col: number; row: number }
  | { type: "foundCity"; unitId: number }
  | { type: "promote"; unitId: number; promotion: PromotionId }
  | { type: "useAbility"; unitId: number; ability: ActiveAbilityId; col?: number; row?: number }
  | { type: "sleep"; unitId: number }
  | { type: "wake"; unitId: number }
  | { type: "convertCitizen"; cityId: number; specialistId: string; delta: number }
  | { type: "startWork"; kind: string; col: number; row: number }
  | { type: "startWonder"; wonderId: string; col: number; row: number }
  | { type: "assignCityToWonder"; workId: number; cityId: number; on: boolean }
  | { type: "cancelWork"; workId: number }
  | { type: "setProduction"; cityId: number; item: ProductionItem }
  | { type: "assignCitizen"; cityId: number; col: number; row: number }
  | { type: "setResearch"; techId: TechId }
  | { type: "setResearchTarget"; techId: TechId }
  | { type: "setCivic"; civicId: string }
  | { type: "setGovernment"; governmentId: string }
  | { type: "togglePolicy"; policyId: string }
  | { type: "foundReligion"; cityId: number; name: string; beliefs: string[] }
  | { type: "establishTradeRoute"; unitId: number; destCityId: number }
  | { type: "bribeBarbarian"; unitId: number }
  | { type: "recruitBarbarian"; unitId: number }
  | { type: "pillage"; unitId: number }
  | { type: "plunderTradeRoute"; unitId: number; routeId: number }
  | { type: "sackCity"; unitId: number }
  | { type: "embark"; unitId: number; col: number; row: number }
  | { type: "disembark"; unitId: number; col: number; row: number }
  | { type: "declareWar"; targetId: number }
  | { type: "makePeace"; targetId: number }
  | { type: "denounce"; targetId: number }
  | { type: "giftTo"; targetId: number; gold?: number; resource?: string }
  | { type: "demandTribute"; targetId: number; gold?: number; resource?: string }
  | { type: "proposeDeal"; targetId: number; give: DealItem[]; want: DealItem[] }
  | { type: "respondProposal"; proposalId: number; accept: boolean }
  | { type: "finalizeDeal"; proposalId: number; confirm: boolean }
  | { type: "acknowledgeContact"; otherId: number }
  | { type: "useLeaderAbility" }
  | { type: "activateGreatPerson"; greatPersonId: string }
  | { type: "recruitLegend"; legendId: string; cityId?: number }
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
  for (const u of unitsOf(state, player.id)) {
    if (u.sleeping) continue;
    u.movementLeft = unitMovement(state, u);
    // A concealed stealth-mover creeps at one third its normal pace.
    if (u.hidden && canStealthMove(state, u)) u.movementLeft = stealthMovement(u.movementLeft);
  }
  healAndReset(state, player);
  decayGlobalMorale(state, player); // global morale slips when wins dry up
  tickAbilities(state, player); // expire stances/pulses, enforce pins (after movement reset)
  tickLegends(state, player.id); // retire heroes whose lifespan has elapsed
  gatherPlayerResources(state, player.id);
  for (const c of citiesOf(state, player.id)) {
    c.rangedAttackUsed = false;
    processCity(state, c, player);
  }
  applyUnitUpkeep(state, player); // empire-wide unit maintenance after city income
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
    if (p.isBarbarian) barbarianTurn(state);
    else aiTakeTurn(state, p.id);
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
        log(state, `${player.name}'s ${UNIT_DEFS[unit.type].name} walked into an ambush!`, {
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
      if (unit.stance === "emplace") unit.stance = null; // moving packs up an emplaced engine
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
      const city: City = {
        id,
        ownerId: player.id,
        name,
        col: unit.col,
        row: unit.row,
        population: 1,
        foodStored: 0,
        productionStored: 0,
        production: { kind: "unit", id: "warrior" } as ProductionItem,
        buildings: [],
        specialists: [],
        wonders: [],
        workedTiles: [],
        isCapital,
        foundedAsCapital: isCapital,
        hp: 0,
        lastAttackedTurn: 0,
        rangedAttackUsed: false,
        modifiers: [],
      };
      state.cities.set(id, city);
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
      return ok;
    }

    case "convertCitizen": {
      const city = state.cities.get(cmd.cityId);
      if (!city) return fail("no such city");
      if (city.ownerId !== player.id) return fail("not your city");
      const res = convertCitizen(state, city, cmd.specialistId as SpecialistId, cmd.delta);
      if (res.ok) autoAssignCitizens(state, city); // re-staff tiles around the new specialist count
      return res;
    }

    case "startWork": {
      return startWork(state, player.id, cmd.kind, cmd.col, cmd.row);
    }

    case "startWonder": {
      return startWonder(state, player.id, cmd.wonderId, cmd.col, cmd.row);
    }

    case "assignCityToWonder": {
      return assignCityToWonder(state, cmd.workId, cmd.cityId, cmd.on, player.id);
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
      if (cmd.promotion === "engineer") unit.charges += 1;
      if (cmd.promotion === "colonist" || cmd.promotion === "survival_training") {
        // HP-boosting promotions also heal the unit by the same amount.
        unit.hp = Math.min(unitMaxHp(unit), unit.hp + 15);
      }
      if (cmd.promotion === "toughness") {
        unit.hp = Math.min(unitMaxHp(unit), unit.hp + 15);
      }
      onUnitPromoted(state, unit); // the unit and nearby allies are heartened
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
      const allowed = availableProduction(state, player, city).some(
        (o) => o.item.kind === cmd.item.kind && o.item.id === cmd.item.id,
      );
      if (!allowed) return fail("cannot build that");
      city.production = cmd.item;
      return ok;
    }

    case "assignCitizen": {
      const city = state.cities.get(cmd.cityId);
      if (!city) return fail("no such city");
      if (city.ownerId !== player.id) return fail("not your city");
      if (!toggleCitizen(state, city, cmd.col, cmd.row)) return fail("tile not workable");
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

    case "setCivic": {
      if (!civicsUnlocked(player)) return fail("civics not unlocked yet");
      if (player.civicsResearched.has(cmd.civicId)) return fail("already adopted");
      if (!civicUnlocked(player.civicsResearched, cmd.civicId)) return fail("prereqs not met");
      const def = getCivic(cmd.civicId);
      if (!def) return fail("no such civic");
      player.researchingCivic = cmd.civicId;
      log(state, `${player.name} is developing ${def.name}.`, { actorId: player.id, targetIds: [player.id] });
      return ok;
    }

    case "setGovernment": {
      const gov = getGovernment(cmd.governmentId);
      if (!gov) return fail("no such government");
      if (!availableGovernments(player).includes(cmd.governmentId)) return fail("government not unlocked");
      player.government = cmd.governmentId;
      if (player.policies.length > gov.slots) player.policies = player.policies.slice(0, gov.slots);
      log(state, `${player.name} adopted ${gov.name}.`, { actorId: player.id, targetIds: [player.id] });
      return ok;
    }

    case "togglePolicy": {
      const idx = player.policies.indexOf(cmd.policyId);
      if (idx >= 0) {
        player.policies.splice(idx, 1);
        return ok;
      }
      const slots = getGovernment(player.government)?.slots ?? 0;
      if (!unlockedPolicies(player).includes(cmd.policyId)) return fail("policy not unlocked");
      if (player.policies.length >= slots) return fail("no free policy slots");
      player.policies.push(cmd.policyId);
      return ok;
    }

    case "foundReligion": {
      return foundReligion(state, player.id, cmd.cityId, cmd.name, cmd.beliefs);
    }

    case "establishTradeRoute": {
      return establishTradeRoute(state, cmd.unitId, cmd.destCityId, player.id);
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
      const tile = getTile(state.map, unit.col, unit.row);
      if (!tile || isWaterTerrain(tile.terrain)) return fail("must be on land");
      if (!isCoastalLand(state, unit.col, unit.row)) return fail("not coastal");
      const target = getTile(state.map, cmd.col, cmd.row);
      if (!target || !isWaterTerrain(target.terrain)) return fail("target must be water");
      if (!isCoastalWater(state, cmd.col, cmd.row)) return fail("target must be coastal water");
      if (axialDistance(offsetToAxial({ col: unit.col, row: unit.row }), offsetToAxial({ col: cmd.col, row: cmd.row })) !== 1) {
        return fail("target not adjacent");
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
  }
}
