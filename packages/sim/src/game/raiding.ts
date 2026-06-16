// Raiding mechanics: pillaging improvements/roads, plundering trade routes,
// and sacking cities. These are the simulation primitives behind the Norse,
// Xiongnu, and Timurids raiding/plunder civ bonuses.

import { getTile, isWater, type Tile } from "@roc/shared";
import type { City, GameState, Player, TradeRoute, Unit } from "./state";
import { cityAt, log, playerById, areEnemies } from "./state";
import { isMilitary } from "./content";
import { ECON_BASE, type EconKind } from "./works";
import { tradeRouteYield } from "./trade";
import { playerEffects } from "./civs";
import { cityHasWalls } from "./combat";
import { applyVictoryCheck } from "./victory";
import { offsetNeighbors } from "./movement";
import { emitTradeRoutePillaged, emitImprovementPillaged } from "./turn-updates";

export interface RaidResult {
  ok: boolean;
  error?: string;
  gold?: number;
  science?: number;
}

/** Multiplier and science conversion for raiding income. */
function raidModifiers(state: GameState, playerId: number, tile?: Tile): { goldMult: number; sciencePercent: number } {
  const effects = playerEffects(state, playerId);
  let goldMult = 1;
  if (effects.raidGoldPercent) goldMult += effects.raidGoldPercent / 100;
  if (effects.coastalRaidGoldPercent && tile && isCoastalRaid(state, tile.col, tile.row)) {
    goldMult += effects.coastalRaidGoldPercent / 100;
  }
  return { goldMult, sciencePercent: effects.raidSciencePercent ?? 0 };
}

/** True if the tile is passable land and adjacent to a water tile. */
function isCoastalRaid(state: GameState, col: number, row: number): boolean {
  const tile = getTile(state.map, col, row);
  if (!tile || isWater(tile.terrain)) return false;
  for (const n of offsetNeighbors(state.map, col, row)) {
    const nt = getTile(state.map, n.col, n.row);
    if (nt && isWater(nt.terrain)) return true;
  }
  return false;
}

function enemyOwnsTile(state: GameState, tile: Tile, player: Player): boolean {
  if (tile.ownerCityId === undefined) return false;
  const ownerCity = state.cities.get(tile.ownerCityId);
  if (!ownerCity) return false;
  const owner = playerById(state, ownerCity.ownerId);
  return !!owner && areEnemies(player, owner);
}

/** Gold from pillaging an improvement and/or road on a tile. */
export function pillageValue(state: GameState, tile: Tile): number {
  let value = 0;
  if (tile.improvement && tile.improvement in ECON_BASE) {
    const tier = tile.improvementLevel ?? 1;
    value += 10 * ECON_BASE[tile.improvement as EconKind] * tier;
  }
  if (tile.road) {
    const tier = tile.roadLevel ?? 1;
    value += 10 * ECON_BASE.road * tier;
  }
  return value;
}

/** A military unit destroys an improvement/road on its tile and loots it. */
export function pillageTile(state: GameState, unitId: number, actingPlayerId: number): RaidResult {
  const unit = state.units.get(unitId);
  if (!unit) return { ok: false, error: "no such unit" };
  if (unit.ownerId !== actingPlayerId) return { ok: false, error: "not your unit" };
  if (!isMilitary(unit.type)) return { ok: false, error: "only military units can pillage" };
  if (unit.movementLeft <= 0) return { ok: false, error: "unit has no movement" };

  const tile = getTile(state.map, unit.col, unit.row);
  if (!tile) return { ok: false, error: "invalid tile" };
  if (!tile.improvement && !tile.road) return { ok: false, error: "nothing to pillage" };

  const player = playerById(state, actingPlayerId);
  if (!player) return { ok: false, error: "no such player" };
  if (!enemyOwnsTile(state, tile, player)) return { ok: false, error: "can only pillage enemy territory" };

  let value = pillageValue(state, tile);
  if (unit.promotions.includes("raider")) value += 10;

  const { goldMult, sciencePercent } = raidModifiers(state, actingPlayerId, tile);
  const gold = Math.floor(value * goldMult);
  const science = Math.floor(gold * (sciencePercent / 100));

  const pillaged: string[] = [];
  if (tile.improvement) {
    pillaged.push(tile.improvement);
    tile.improvement = undefined;
    tile.improvementLevel = undefined;
  }
  if (tile.road) {
    pillaged.push("road");
    tile.road = undefined;
    tile.roadLevel = undefined;
  }

  player.gold += gold;
  player.scienceProgress += science;
  unit.movementLeft = 0;
  unit.attackedThisTurn = true;

  log(state, `${player.name} pillaged ${pillaged.join(" and ")} for ${gold} gold${science ? ` and ${science} science` : ""}.`, {
    actorId: actingPlayerId,
    targetIds: [actingPlayerId],
    tile: { col: unit.col, row: unit.row },
  });

  if (tile.ownerCityId !== undefined) {
    const victimCity = state.cities.get(tile.ownerCityId);
    const victim = victimCity ? playerById(state, victimCity.ownerId) : undefined;
    if (victim && !victim.isBarbarian) {
      emitImprovementPillaged(state, victim.id, tile.col, tile.row, pillaged);
    }
  }

  return { ok: true, gold, science };
}

/** Gold from plundering a trade route. */
export function plunderValue(state: GameState, route: TradeRoute): number {
  const y = tradeRouteYield(state, route);
  return 20 + 10 * y.gold;
}

/** A military unit on a trade-route path loots and destroys the route. */
export function plunderTradeRoute(
  state: GameState,
  unitId: number,
  routeId: number,
  actingPlayerId: number,
): RaidResult {
  const unit = state.units.get(unitId);
  if (!unit) return { ok: false, error: "no such unit" };
  if (unit.ownerId !== actingPlayerId) return { ok: false, error: "not your unit" };
  if (!isMilitary(unit.type)) return { ok: false, error: "only military units can plunder routes" };
  if (unit.movementLeft <= 0) return { ok: false, error: "unit has no movement" };

  const idx = state.tradeRoutes.findIndex((r) => r.id === routeId);
  if (idx < 0) return { ok: false, error: "no such trade route" };
  const route = state.tradeRoutes[idx]!;

  const routeOwner = playerById(state, route.ownerId);
  const player = playerById(state, actingPlayerId);
  if (!player) return { ok: false, error: "no such player" };
  if (!routeOwner || !areEnemies(player, routeOwner)) return { ok: false, error: "can only plunder enemy routes" };

  const unitKey = `${unit.col},${unit.row}`;
  if (!route.path.includes(unitKey)) return { ok: false, error: "unit is not on the trade route" };

  const tile = getTile(state.map, unit.col, unit.row);
  let value = plunderValue(state, route);
  const { goldMult, sciencePercent } = raidModifiers(state, actingPlayerId, tile ?? undefined);
  const gold = Math.floor(value * goldMult);
  const science = Math.floor(gold * (sciencePercent / 100));

  state.tradeRoutes.splice(idx, 1);
  player.gold += gold;
  player.scienceProgress += science;
  unit.movementLeft = 0;
  unit.attackedThisTurn = true;

  if (routeOwner && !routeOwner.isBarbarian) {
    emitTradeRoutePillaged(state, routeOwner.id, unit.col, unit.row);
  }

  log(state, `${player.name} plundered a trade route for ${gold} gold${science ? ` and ${science} science` : ""}.`, {
    actorId: actingPlayerId,
    targetIds: [route.ownerId],
    tile: { col: unit.col, row: unit.row },
  });
  return { ok: true, gold, science };
}

/** Base gold from sacking a city (before raid modifiers). */
export function sackValue(city: City): number {
  return 200 + 50 * city.population + (cityHasWalls(city) ? 50 : 0);
}

/** Destroy a city and loot it. Called by the sackCity command after validation. */
export function sackCity(state: GameState, city: City, attacker: Unit): RaidResult {
  const player = playerById(state, attacker.ownerId);
  const oldOwner = playerById(state, city.ownerId);
  if (!player) return { ok: false, error: "no such player" };

  const tile = getTile(state.map, city.col, city.row);
  let value = sackValue(city);
  const { goldMult, sciencePercent } = raidModifiers(state, player.id, tile ?? undefined);
  const gold = Math.floor(value * goldMult);
  const science = Math.floor(gold * (sciencePercent / 100));

  // Clear territory ownership.
  for (const t of state.map.tiles) {
    if (t.ownerCityId === city.id) t.ownerCityId = undefined;
  }
  state.cities.delete(city.id);

  player.gold += gold;
  player.scienceProgress += science;
  attacker.movementLeft = 0;
  attacker.attackedThisTurn = true;

  // Drop routes that ran through the destroyed city.
  for (let i = state.tradeRoutes.length - 1; i >= 0; i--) {
    const r = state.tradeRoutes[i]!;
    if (r.fromCityId === city.id || r.toCityId === city.id) {
      state.tradeRoutes.splice(i, 1);
    }
  }

  log(state, `${player.name} sacked ${city.name} for ${gold} gold${science ? ` and ${science} science` : ""}!`, {
    actorId: player.id,
    targetIds: oldOwner ? [oldOwner.id] : undefined,
    tile: { col: city.col, row: city.row },
  });

  applyVictoryCheck(state);
  return { ok: true, gold, science };
}

/** Validate and execute a player command to sack a city. */
export function sackCityCommand(state: GameState, unitId: number, actingPlayerId: number): RaidResult {
  const unit = state.units.get(unitId);
  if (!unit) return { ok: false, error: "no such unit" };
  if (unit.ownerId !== actingPlayerId) return { ok: false, error: "not your unit" };
  if (!isMilitary(unit.type)) return { ok: false, error: "only military units can sack cities" };
  if (unit.movementLeft <= 0) return { ok: false, error: "unit has no movement" };

  const city = cityAt(state, unit.col, unit.row);
  if (!city) return { ok: false, error: "unit is not on a city" };
  if (city.ownerId === actingPlayerId) return { ok: false, error: "cannot sack your own city" };

  const player = playerById(state, actingPlayerId);
  const cityOwner = playerById(state, city.ownerId);
  if (!player || !cityOwner || !areEnemies(player, cityOwner)) {
    return { ok: false, error: "can only sack enemy cities" };
  }
  if (city.hp > 0) return { ok: false, error: "city must be reduced to 0 HP before sacking" };

  return sackCity(state, city, unit);
}
