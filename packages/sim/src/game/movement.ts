import {
  axialNeighbor,
  axialNeighbors,
  axialToOffset,
  getTile,
  hexKey,
  offsetToAxial,
  type GameMap,
  type Offset,
} from "@roc/shared";
import { moveCost, isPassableLand, isNavalPassable, navalMoveCost, isWaterTerrain, isForestTerrain, isRough, type TerrainType } from "./terrain";
import type { GameState, Unit } from "./state";
import { cityAt, areEnemies, playerById } from "./state";
import { UNIT_DEFS, type UnitDef, type TechId } from "./content";
import { foreignTerritoryOwner } from "./diplomacy";
import { playerEffects } from "./civs";

/** Whether a unit's domain is water (native ship or embarked land unit). */
export function isWaterDomain(unit: Unit): boolean {
  const def = UNIT_DEFS[unit.type];
  return def.cls === "naval_melee" || def.cls === "naval_ranged" || !!unit.embarked;
}

/** Whether a unit is native naval (not embarked). */
export function isNavalUnit(unit: Unit): boolean {
  const def = UNIT_DEFS[unit.type];
  return def.cls === "naval_melee" || def.cls === "naval_ranged";
}

/** Whether a player has researched a given tech. */
function hasTech(state: GameState, playerId: number, techId: TechId): boolean {
  return state.players[playerId]?.researched.has(techId) ?? false;
}

/** True if a naval unit is allowed to enter ocean tiles. */
function canEnterOcean(state: GameState, unit: Unit, def: UnitDef): boolean {
  if (def.oceanGoing) return true;
  return hasTech(state, unit.ownerId, "astronomy");
}

/** True if the tile is a water tile adjacent to at least one land tile. */
export function isCoastalWater(state: GameState, col: number, row: number): boolean {
  const tile = getTile(state.map, col, row);
  if (!tile || !isWaterTerrain(tile.terrain)) return false;
  for (const n of offsetNeighbors(state.map, col, row)) {
    const nt = getTile(state.map, n.col, n.row);
    if (nt && isPassableLand(nt.terrain)) return true;
  }
  return false;
}

/** True if the land tile is adjacent to at least one water tile. */
export function isCoastalLand(state: GameState, col: number, row: number): boolean {
  const tile = getTile(state.map, col, row);
  if (!tile || isWaterTerrain(tile.terrain)) return false;
  for (const n of offsetNeighbors(state.map, col, row)) {
    const nt = getTile(state.map, n.col, n.row);
    if (nt && isWaterTerrain(nt.terrain)) return true;
  }
  return false;
}

/** True if the tile carries tree cover (forest/woods/jungle/taiga). */
export function isForestTile(state: GameState, col: number, row: number): boolean {
  const tile = getTile(state.map, col, row);
  return !!tile && isForestTerrain(tile.terrain);
}

/** True if a river runs along the edge between two adjacent tiles — crossing it
 *  costs extra movement (and blunts a melee assault). */
export function riverBetween(state: GameState, fromCol: number, fromRow: number, toCol: number, toRow: number): boolean {
  const from = getTile(state.map, fromCol, fromRow);
  const to = getTile(state.map, toCol, toRow);
  if (!from?.river && !to?.river) return false;
  const ax = offsetToAxial({ col: fromCol, row: fromRow });
  for (let d = 0; d < 6; d++) {
    const n = axialToOffset(axialNeighbor(ax, d));
    if (n.col === toCol && n.row === toRow) {
      const opp = (d + 3) % 6;
      return ((from?.river ?? 0) & (1 << d)) !== 0 || ((to?.river ?? 0) & (1 << opp)) !== 0;
    }
  }
  return false;
}

/** True if a road on this tile is carried over its river by a bridge: the tile
 *  has both a road and a river, and its territory owner has Bridge Building. */
export function tileHasBridge(state: GameState, col: number, row: number): boolean {
  const tile = getTile(state.map, col, row);
  if (!tile?.road || !tile.river) return false;
  const ownerId = tile.ownerCityId !== undefined ? state.cities.get(tile.ownerCityId)?.ownerId : undefined;
  return ownerId !== undefined && hasTech(state, ownerId, "bridge_building");
}

/** True if the river along the edge between two adjacent road connectors (a road
 *  tile or a city) is spanned by a bridge. Such a crossing neither costs the extra
 *  fording movement nor breaks a city-to-city road connection — but the assault
 *  penalty for it still applies. */
export function bridgedRiverCrossing(state: GameState, fromCol: number, fromRow: number, toCol: number, toRow: number): boolean {
  if (!riverBetween(state, fromCol, fromRow, toCol, toRow)) return false;
  const fromConn = !!getTile(state.map, fromCol, fromRow)?.road || !!cityAt(state, fromCol, fromRow);
  const toConn = !!getTile(state.map, toCol, toRow)?.road || !!cityAt(state, toCol, toRow);
  if (!fromConn || !toConn) return false;
  return tileHasBridge(state, fromCol, fromRow) || tileHasBridge(state, toCol, toRow);
}

/** Effective movement cost to enter a tile for a specific unit. */
export function unitMoveCost(state: GameState, unit: Unit, terrain: TerrainType, road: boolean): number {
  const def = UNIT_DEFS[unit.type];
  if (isWaterDomain(unit)) {
    if (isNavalUnit(unit)) {
      const oceanUnlocked = canEnterOcean(state, unit, def);
      return navalMoveCost(terrain, oceanUnlocked);
    }
    // Embarked land unit.
    if (isWaterTerrain(terrain)) return 2;
    return moveCost(terrain);
  }
  const eff = playerEffects(state, unit.ownerId);
  if (road && (unit.promotions.includes("pathfinder") || unit.promotions.includes("commando"))) return 0;
  if (terrain === "hills" && unit.promotions.includes("pathfinder")) return 1;
  if (isForestTerrain(terrain) &&
    (unit.promotions.includes("woodland_warrior") || unit.promotions.includes("trailblazer") || unit.promotions.includes("guerrilla"))) {
    return 1;
  }
  if (road) return 1;
  // Leader-ability movement overrides.
  if (eff.ignoreRoughTerrain && isRough(terrain)) return 1;
  if (eff.ignoreMountainMovement && terrain === "mountains") return 1;
  return moveCost(terrain);
}

/** In-bounds offset neighbors of a tile (odd-r), routed through shared axial math. */
export function offsetNeighbors(map: GameMap, col: number, row: number): Offset[] {
  const out: Offset[] = [];
  for (const a of axialNeighbors(offsetToAxial({ col, row }))) {
    const o = axialToOffset(a);
    if (o.col >= 0 && o.row >= 0 && o.col < map.cols && o.row < map.rows) {
      out.push(o);
    }
  }
  return out;
}

export interface ReachableEntry {
  cost: number;
}

/** Set of tile keys occupied by units other than `exclude`. */
function occupancy(state: GameState, exclude: Unit): Set<string> {
  const occ = new Set<string>();
  const moverOwner = playerById(state, exclude.ownerId);
  for (const u of state.units.values()) {
    if (u.id === exclude.id) continue;
    // A concealed enemy unit does NOT block movement — stepping onto it springs
    // an ambush (handled in the move command); the mover can't see it anyway.
    if (u.hidden && u.ownerId !== exclude.ownerId) {
      const o = playerById(state, u.ownerId);
      if (moverOwner && o && areEnemies(moverOwner, o)) continue;
    }
    occ.add(hexKey({ q: u.col, r: u.row }));
  }
  return occ;
}

/** A standing enemy defensive structure blocks entry until it is destroyed. */
export function enemyStructureBlocks(state: GameState, col: number, row: number, playerId: number): boolean {
  const tile = getTile(state.map, col, row);
  if (!tile?.structure || tile.structure.hp <= 0 || tile.ownerCityId === undefined) return false;
  const owner = state.cities.get(tile.ownerCityId);
  return !!owner && owner.ownerId !== playerId;
}

/** Domain-aware passability check. */
function isTilePassableForUnit(state: GameState, unit: Unit, tile: { terrain: TerrainType }): boolean {
  if (isWaterDomain(unit)) {
    const def = UNIT_DEFS[unit.type];
    const oceanUnlocked = isNavalUnit(unit) ? canEnterOcean(state, unit, def) : hasTech(state, unit.ownerId, "astronomy");
    return isNavalPassable(tile.terrain, oceanUnlocked);
  }
  const eff = playerEffects(state, unit.ownerId);
  if (tile.terrain === "mountains" && eff.ignoreMountainMovement) return true;
  return isPassableLand(tile.terrain);
}

/**
 * Tiles a unit can reach this turn, keyed by "col,row".
 * Honors the "always allowed at least one step" rule into an adjacent passable
 * tile even when its cost exceeds the remaining movement.
 */
export function computeReachable(
  state: GameState,
  unit: Unit,
  opts?: { ignoreBorders?: boolean },
): Map<string, ReachableEntry> {
  const { map } = state;
  const budget = unit.movementLeft;
  const result = new Map<string, ReachableEntry>();
  if (budget <= 0) return result;
  const borderBlocked = (col: number, row: number): boolean =>
    !opts?.ignoreBorders && foreignTerritoryOwner(state, unit.ownerId, col, row) !== null;

  const occ = occupancy(state, unit);
  const key = (o: Offset) => `${o.col},${o.row}`;
  const best = new Map<string, number>();
  best.set(key({ col: unit.col, row: unit.row }), 0);

  // Simple Dijkstra; reachable sets are tiny (movement <= 5).
  const frontier: Offset[] = [{ col: unit.col, row: unit.row }];
  while (frontier.length > 0) {
    // pop the lowest-cost node
    let bi = 0;
    for (let i = 1; i < frontier.length; i++) {
      if (best.get(key(frontier[i]!))! < best.get(key(frontier[bi]!))!) bi = i;
    }
    const cur = frontier.splice(bi, 1)[0]!;
    const curCost = best.get(key(cur))!;

    for (const n of offsetNeighbors(map, cur.col, cur.row)) {
      const tile = getTile(map, n.col, n.row);
      if (!tile || !isTilePassableForUnit(state, unit, tile)) continue;
      const nk = key(n);
      if (occ.has(`${n.col},${n.row}`)) continue;
      const city = cityAt(state, n.col, n.row);
      // Native ships may not enter enemy cities from the sea; land units cannot enter foreign cities.
      if (city && city.ownerId !== unit.ownerId) continue;
      if (!isWaterDomain(unit) && enemyStructureBlocks(state, n.col, n.row, unit.ownerId)) continue;
      if (borderBlocked(n.col, n.row)) continue; // foreign territory needs war / open borders
      let enterCost = unitMoveCost(state, unit, tile.terrain, tile.road ?? false);
      // Fording a river costs an extra movement point (like entering rough terrain),
      // unless a bridge carries the road across it.
      if (!isWaterDomain(unit) && riverBetween(state, cur.col, cur.row, n.col, n.row) &&
        !bridgedRiverCrossing(state, cur.col, cur.row, n.col, n.row)) enterCost += 1;
      const step = curCost + enterCost;
      if (step <= budget && step < (best.get(nk) ?? Infinity)) {
        best.set(nk, step);
        result.set(nk, { cost: step });
        frontier.push(n);
      }
    }
  }

  // "At least one step": any adjacent passable, unoccupied tile is reachable.
  for (const n of offsetNeighbors(map, unit.col, unit.row)) {
    const tile = getTile(map, n.col, n.row);
    if (!tile || !isTilePassableForUnit(state, unit, tile)) continue;
    const nk = `${n.col},${n.row}`;
    if (occ.has(nk)) continue;
    const city = cityAt(state, n.col, n.row);
    if (city && city.ownerId !== unit.ownerId) continue;
    if (!isWaterDomain(unit) && enemyStructureBlocks(state, n.col, n.row, unit.ownerId)) continue;
    if (borderBlocked(n.col, n.row)) continue;
    if (!result.has(nk)) result.set(nk, { cost: budget });
  }

  return result;
}

/** Foreign at-peace tiles a unit could step into if it declared war, mapped to
 *  the territory owner — drives the "entering this starts a war" warning. */
export function incursionTargets(state: GameState, unit: Unit): Map<string, number> {
  const out = new Map<string, number>();
  if (unit.movementLeft <= 0) return out;
  const open = computeReachable(state, unit, { ignoreBorders: true });
  const closed = computeReachable(state, unit);
  for (const k of open.keys()) {
    if (closed.has(k)) continue;
    const [c, r] = k.split(",").map(Number) as [number, number];
    const owner = foreignTerritoryOwner(state, unit.ownerId, c, r);
    if (owner !== null) out.set(k, owner);
  }
  return out;
}

export function unitSight(unit: Unit): number {
  let sight = UNIT_DEFS[unit.type].sight;
  if (unit.promotions.includes("eagle_eye")) sight += 1;
  if (unit.promotions.includes("outrider")) sight += 1;
  if (unit.promotions.includes("scouting")) sight += 1;
  if (unit.promotions.includes("night_owl")) sight += 1;
  if (unit.promotions.includes("survey")) sight += 1;
  if (unit.promotions.includes("spy")) sight += 1;
  if (unit.promotions.includes("nomad")) sight += 1;
  if (unit.promotions.includes("ranger")) sight += 1;
  if (unit.promotions.includes("eagle_eye_recon")) sight += 2;
  if (unit.promotions.includes("explorer")) sight += 2;
  if (unit.promotions.includes("pioneer")) sight += 1;
  if (unit.promotions.includes("survival_training")) sight += 1;
  if (unit.scouting) sight += 2; // Reconnoiter vision pulse
  return sight;
}
