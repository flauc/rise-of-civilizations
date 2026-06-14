import { axialDistance, getTile, offsetToAxial } from "@roc/shared";
import type { City, GameState, ProductionItem } from "./state";
import { cityAt, currentPlayer, playerById, unitsOf, citiesOf } from "./state";
import { isPassableLand } from "./terrain";
import { computeReachable } from "./movement";
import { updateExplored } from "./visibility";
import { processCity, availableProduction, autoAssignCitizens, toggleCitizen } from "./economy";
import {
  cityMaxHp,
  healAndReset,
  resolveAttack,
  availablePromotions,
} from "./combat";
import { barbarianTurn } from "./barbarians";
import { buildImprovement, type ImprovementKind } from "./improvements";
import { applyVictoryCheck } from "./victory";
import { foundTerritory, expandTerritory } from "./territory";
import { onUnitEnter } from "./features";
import { foundReligion, spreadReligion } from "./religion";
import {
  civEffectsOf,
  unitMovement,
  civicUnlocked,
  availableGovernments,
  unlockedPolicies,
  getCivic,
  getGovernment,
  nextCityNameForCiv,
} from "./civs";
import { aiTakeTurn } from "./ai";
import { UNIT_DEFS, TECH_DEFS, techUnlocked, type BuildingId, type PromotionId, type TechId } from "./content";

export type Command =
  | { type: "move"; unitId: number; col: number; row: number }
  | { type: "attack"; attackerId: number; col: number; row: number }
  | { type: "foundCity"; unitId: number }
  | { type: "build"; unitId: number; improvement: ImprovementKind }
  | { type: "promote"; unitId: number; promotion: PromotionId }
  | { type: "setProduction"; cityId: number; item: ProductionItem }
  | { type: "assignCitizen"; cityId: number; col: number; row: number }
  | { type: "setResearch"; techId: TechId }
  | { type: "setCivic"; civicId: string }
  | { type: "setGovernment"; governmentId: string }
  | { type: "togglePolicy"; policyId: string }
  | { type: "foundReligion"; cityId: number; name: string; beliefs: string[] }
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
  for (const u of unitsOf(state, player.id)) {
    u.movementLeft = unitMovement(state, u);
  }
  healAndReset(state, player);
  for (const c of citiesOf(state, player.id)) {
    c.rangedAttackUsed = false;
    processCity(state, c, player);
  }
  // Religion spreads once per round (at the start of player 0's turn).
  if (state.currentPlayerIndex === 0) spreadReligion(state);
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
      unit.col = cmd.col;
      unit.row = cmd.row;
      unit.movementLeft = Math.max(0, unit.movementLeft - entry.cost);
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
        workedTiles: [],
        isCapital,
        foundedAsCapital: isCapital,
        hp: 0,
        lastAttackedTurn: 0,
        rangedAttackUsed: false,
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
      state.log.push(`${player.name} founded ${name}.`);
      updateExplored(state, player.id);
      return ok;
    }

    case "build": {
      const unit = state.units.get(cmd.unitId);
      if (!unit) return fail("no such unit");
      if (unit.ownerId !== player.id) return fail("not your unit");
      return buildImprovement(state, unit, cmd.improvement);
    }

    case "promote": {
      const unit = state.units.get(cmd.unitId);
      if (!unit) return fail("no such unit");
      if (unit.ownerId !== player.id) return fail("not your unit");
      if (unit.unspentPromotions <= 0) return fail("no promotion available");
      if (!availablePromotions(unit).includes(cmd.promotion)) return fail("invalid promotion");
      unit.promotions.push(cmd.promotion);
      unit.unspentPromotions -= 1;
      return ok;
    }

    case "setProduction": {
      const city = state.cities.get(cmd.cityId);
      if (!city) return fail("no such city");
      if (city.ownerId !== player.id) return fail("not your city");
      const allowed = availableProduction(player, city).some(
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
      state.log.push(`${player.name} is researching ${TECH_DEFS[cmd.techId].name}.`);
      return ok;
    }

    case "setCivic": {
      if (player.civicsResearched.has(cmd.civicId)) return fail("already adopted");
      if (!civicUnlocked(player.civicsResearched, cmd.civicId)) return fail("prereqs not met");
      const def = getCivic(cmd.civicId);
      if (!def) return fail("no such civic");
      player.researchingCivic = cmd.civicId;
      state.log.push(`${player.name} is developing ${def.name}.`);
      return ok;
    }

    case "setGovernment": {
      const gov = getGovernment(cmd.governmentId);
      if (!gov) return fail("no such government");
      if (!availableGovernments(player).includes(cmd.governmentId)) return fail("government not unlocked");
      player.government = cmd.governmentId;
      if (player.policies.length > gov.slots) player.policies = player.policies.slice(0, gov.slots);
      state.log.push(`${player.name} adopted ${gov.name}.`);
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
  }
}
