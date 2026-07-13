// Land units may board an adjacent friendly warship and ride hidden until they
// disembark on a coastal tile — capacity scales with the ship's experience level.

import { axialDistance, getTile, offsetToAxial } from "@roc/shared";
import type { GameState, Unit } from "./state";
import { log, playerById, unitAt } from "./state";
import { UNIT_DEFS, type UnitTypeId } from "./content";
import { isNavalUnit, isCoastalLand, offsetNeighbors } from "./movement";
import { isPassableLand, isWaterTerrain } from "./terrain";
import { unitDisplayName } from "./civs";
import type { CommandResult } from "./commands";

const ok: CommandResult = { ok: true };
const fail = (error: string): CommandResult => ({ ok: false, error });

/** Max land units a ship can carry — grows with the vessel's level (level 1 → 6). */
export function shipCargoCapacity(ship: Unit): number {
  return 4 + 2 * ship.level;
}

/** Units currently stored aboard a ship (hidden from the map). */
export function cargoOnShip(state: GameState, shipId: number): Unit[] {
  return [...state.units.values()].filter((u) => u.aboardShipId === shipId);
}

/** Land units that may board a warship (armies, scouts, settlers — not traders). */
export function canBeShipCargo(type: UnitTypeId): boolean {
  const cls = UNIT_DEFS[type].cls;
  return cls === "melee" || cls === "ranged" || cls === "cavalry" || cls === "siege" || cls === "recon" || cls === "settler";
}

function tilesAdjacent(a: Unit, b: Unit): boolean {
  return axialDistance(offsetToAxial({ col: a.col, row: a.row }), offsetToAxial({ col: b.col, row: b.row })) === 1;
}

/** Friendly warships beside `passenger` that still have cargo room. */
export function boardableShips(state: GameState, passenger: Unit): Unit[] {
  if (!canBeShipCargo(passenger.type)) return [];
  if (passenger.aboardShipId !== undefined) return [];
  const out: Unit[] = [];
  for (const ship of state.units.values()) {
    if (ship.ownerId !== passenger.ownerId) continue;
    if (!isNavalUnit(ship)) continue;
    if (!tilesAdjacent(passenger, ship)) continue;
    if (cargoOnShip(state, ship.id).length >= shipCargoCapacity(ship)) continue;
    out.push(ship);
  }
  return out;
}

/** Land tiles a passenger may wade ashore to from their current ship. */
export function disembarkTargets(state: GameState, passenger: Unit): { col: number; row: number }[] {
  const shipId = passenger.aboardShipId;
  if (shipId === undefined) return [];
  const ship = state.units.get(shipId);
  if (!ship) return [];
  const out: { col: number; row: number }[] = [];
  for (const n of offsetNeighbors(state.map, ship.col, ship.row)) {
    const tile = getTile(state.map, n.col, n.row);
    if (!tile || !isPassableLand(tile.terrain) || isWaterTerrain(tile.terrain)) continue;
    if (unitAt(state, n.col, n.row)) continue;
    out.push(n);
  }
  return out;
}

/** Pick one shore tile to disembark onto (closest to the ship, ties broken deterministically). */
export function bestDisembarkTile(state: GameState, passenger: Unit): { col: number; row: number } | undefined {
  const shipId = passenger.aboardShipId;
  const ship = shipId !== undefined ? state.units.get(shipId) : undefined;
  if (!ship) return undefined;
  const shipAx = offsetToAxial({ col: ship.col, row: ship.row });
  const targets = disembarkTargets(state, passenger);
  if (!targets.length) return undefined;
  targets.sort((a, b) => {
    const da = axialDistance(shipAx, offsetToAxial(a));
    const db = axialDistance(shipAx, offsetToAxial(b));
    if (da !== db) return da - db;
    if (a.col !== b.col) return a.col - b.col;
    return a.row - b.row;
  });
  return targets[0];
}

/** Keep boarded units co-located with their ship (fog, logs, death tile). */
export function syncShipCargo(state: GameState, ship: Unit): void {
  for (const p of cargoOnShip(state, ship.id)) {
    p.col = ship.col;
    p.row = ship.row;
  }
}

/** When a warship is destroyed, everyone aboard goes down with it. */
export function scuttleShipCargo(state: GameState, shipId: number, killUnitFn: (s: GameState, u: Unit) => void): void {
  for (const p of [...cargoOnShip(state, shipId)]) killUnitFn(state, p);
}

export function boardShip(state: GameState, passengerId: number, shipId: number, playerId: number): CommandResult {
  const passenger = state.units.get(passengerId);
  if (!passenger) return fail("no such unit");
  if (passenger.ownerId !== playerId) return fail("not your unit");
  if (!canBeShipCargo(passenger.type)) return fail("this unit cannot board a ship");
  if (passenger.aboardShipId !== undefined) return fail("already aboard a ship");
  if (passenger.embarked) return fail("already at sea");
  if (passenger.inTransit) return fail("unit is travelling");
  if (passenger.escortingRouteId !== undefined) return fail("unit is escorting a route");
  if (passenger.sleeping) return fail("unit is sleeping");
  if (passenger.movementLeft <= 0) return fail("no movement");

  const player = playerById(state, playerId);
  if (!player?.researched.has("sailing")) return fail("requires Sailing to board ships");

  const ship = state.units.get(shipId);
  if (!ship) return fail("no such ship");
  if (ship.ownerId !== playerId) return fail("not your ship");
  if (!isNavalUnit(ship)) return fail("not a warship");
  const shipTile = getTile(state.map, ship.col, ship.row);
  if (!shipTile || !isWaterTerrain(shipTile.terrain)) return fail("ship must be on water");
  if (!tilesAdjacent(passenger, ship)) return fail("must stand beside the ship");

  const passTile = getTile(state.map, passenger.col, passenger.row);
  if (!passTile || isWaterTerrain(passTile.terrain)) return fail("must be on land to board");
  if (!isCoastalLand(state, passenger.col, passenger.row)) return fail("must be on the coast");

  const aboard = cargoOnShip(state, ship.id);
  if (aboard.length >= shipCargoCapacity(ship)) return fail("ship is full");

  passenger.aboardShipId = ship.id;
  passenger.col = ship.col;
  passenger.row = ship.row;
  passenger.movementLeft = 0;
  passenger.stance = null;
  if (passenger.hidden) passenger.hidden = false;

  log(state, `${player.name}'s ${unitDisplayName(state, passenger)} boarded ${UNIT_DEFS[ship.type].name}.`, {
    actorId: playerId,
    targetIds: [playerId],
    tile: { col: ship.col, row: ship.row },
  });
  return ok;
}

export function disembarkFromShip(
  state: GameState,
  passengerId: number,
  playerId: number,
): CommandResult {
  const passenger = state.units.get(passengerId);
  if (!passenger) return fail("no such unit");
  if (passenger.ownerId !== playerId) return fail("not your unit");
  const shipId = passenger.aboardShipId;
  if (shipId === undefined) return fail("not aboard a ship");
  if (passenger.movementLeft <= 0) return fail("no movement");

  const ship = state.units.get(shipId);
  if (!ship) {
    passenger.aboardShipId = undefined;
    return fail("ship is gone");
  }

  const land = bestDisembarkTile(state, passenger);
  if (!land) return fail("no shore to disembark onto");

  passenger.aboardShipId = undefined;
  passenger.col = land.col;
  passenger.row = land.row;
  passenger.movementLeft = 0;

  const player = playerById(state, playerId);
  log(state, `${player?.name ?? "?"}'s ${unitDisplayName(state, passenger)} disembarked from ${UNIT_DEFS[ship.type].name}.`, {
    actorId: playerId,
    targetIds: [playerId],
    tile: { col: land.col, row: land.row },
  });
  return ok;
}

/** Human-readable cargo line for UI (e.g. "1 / 6"). */
export function shipCargoLabel(state: GameState, ship: Unit): string {
  const cap = shipCargoCapacity(ship);
  const n = cargoOnShip(state, ship.id).length;
  return `${n} / ${cap}`;
}

/** True when this unit is a visible-on-map land unit (not stowed below decks). */
export function isUnitOnMap(unit: Unit): boolean {
  return unit.aboardShipId === undefined && unit.escortingRouteId === undefined;
}
