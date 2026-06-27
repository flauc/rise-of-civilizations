import { axialDistance, getTile, offsetToAxial, type Tile } from "@roc/shared";
import type { GameState, Unit } from "./state";
import { currentPlayer, playerById, unitsOf, unitAt, cityAt, areEnemies } from "./state";
import { computeReachable } from "./movement";
import { computeAttackTargets, resolveAttack } from "./combat";
import { spawnFromCamps, maybeSpawnCamps } from "./features";
import { pillageTile, plunderTradeRoute } from "./raiding";
import { isBarbarianPacified } from "./bribery";

/** How many extra tiles a barbarian will detour to wreck an enemy improvement or
 *  trade route instead of chasing the nearest military target. Higher = more
 *  prone to burning the economy rather than hunting units/cities. */
const RAID_BIAS = 4;

interface Target {
  col: number;
  row: number;
}

function nearestEnemy(state: GameState, unit: Unit): Target | null {
  const owner = playerById(state, unit.ownerId);
  if (!owner) return null;
  let best: Target | null = null;
  let bestD = Infinity;
  const from = offsetToAxial({ col: unit.col, row: unit.row });
  const consider = (col: number, row: number, ownerId: number) => {
    const o = playerById(state, ownerId);
    if (!o || !areEnemies(owner, o)) return;
    if (isBarbarianPacified(state, unit, ownerId)) return; // bribed: leave them be
    const d = axialDistance(from, offsetToAxial({ col, row }));
    if (d < bestD) {
      bestD = d;
      best = { col, row };
    }
  };
  for (const u of state.units.values()) consider(u.col, u.row, u.ownerId);
  for (const c of state.cities.values()) consider(c.col, c.row, c.ownerId);
  return best;
}

/** The civ that owns a tile via its city claim, or null if unclaimed. */
function tileOwnerId(state: GameState, tile: Tile): number | null {
  if (tile.ownerCityId === undefined) return null;
  const city = state.cities.get(tile.ownerCityId);
  return city ? city.ownerId : null;
}

/** True if `unit` (a barbarian) may raid something owned by `ownerId` right now. */
function canRaid(state: GameState, unit: Unit, owner: ReturnType<typeof playerById>, ownerId: number): boolean {
  const o = playerById(state, ownerId);
  return !!o && !!owner && areEnemies(owner, o) && !isBarbarianPacified(state, unit, ownerId);
}

/** Nearest enemy improvement/road or trade-route tile the barbarian can wreck. */
function nearestRaidTarget(state: GameState, unit: Unit): Target | null {
  const owner = playerById(state, unit.ownerId);
  if (!owner) return null;
  const from = offsetToAxial({ col: unit.col, row: unit.row });
  let best: Target | null = null;
  let bestD = Infinity;
  const consider = (col: number, row: number, ownerId: number) => {
    if (!canRaid(state, unit, owner, ownerId)) return;
    const d = axialDistance(from, offsetToAxial({ col, row }));
    if (d < bestD) {
      bestD = d;
      best = { col, row };
    }
  };
  for (const tile of state.map.tiles) {
    if (!tile.improvement && !tile.road) continue;
    const ownerId = tileOwnerId(state, tile);
    if (ownerId !== null) consider(tile.col, tile.row, ownerId);
  }
  for (const route of state.tradeRoutes) {
    for (const key of route.path) {
      const [c, r] = key.split(",").map(Number) as [number, number];
      consider(c, r, route.ownerId);
    }
  }
  return best;
}

/** If the barbarian is standing on something it can wreck, plunder/pillage it.
 *  Returns true if it acted (which ends the unit's turn). */
function raidUnderfoot(state: GameState, unit: Unit, ownerId: number): boolean {
  const owner = playerById(state, unit.ownerId);
  const here = `${unit.col},${unit.row}`;
  // A trade route running under us is the juiciest target — loot and sever it.
  const route = state.tradeRoutes.find(
    (r) => canRaid(state, unit, owner, r.ownerId) && r.path.includes(here),
  );
  if (route) {
    plunderTradeRoute(state, unit.id, route.id, ownerId);
    return true;
  }
  // Otherwise burn any enemy improvement or road on the tile.
  const tile = getTile(state.map, unit.col, unit.row);
  if (tile && (tile.improvement || tile.road)) {
    const tileOwner = tileOwnerId(state, tile);
    if (tileOwner !== null && canRaid(state, unit, owner, tileOwner)) {
      pillageTile(state, unit.id, ownerId);
      return true;
    }
  }
  return false;
}

/** Simple aggressive AI: each barbarian attacks if it can, else advances toward
 *  the nearest enemy. `playerId` defaults to the current player (hotseat); the
 *  simultaneous resolver passes the barbarian id explicitly. */
export function barbarianTurn(state: GameState, playerId?: number): void {
  const player = playerId !== undefined ? playerById(state, playerId) : currentPlayer(state);
  if (!player) return;
  maybeSpawnCamps(state, player.id); // new camps emerge from the fog over time
  spawnFromCamps(state, player.id); // camps reinforce the horde
  for (const unit of unitsOf(state, player.id)) {
    let safety = 0;
    while (state.units.has(unit.id) && unit.movementLeft > 0 && safety++ < 12) {
      const targets = computeAttackTargets(state, unit);
      if (targets.size > 0) {
        let chosen: [number, number] | null = null;
        for (const key of targets) {
          const [col, row] = key.split(",").map(Number) as [number, number];
          const occ = unitAt(state, col, row) ?? cityAt(state, col, row);
          if (occ && isBarbarianPacified(state, unit, occ.ownerId)) continue; // truce: skip
          chosen = [col, row];
          break;
        }
        if (chosen) {
          resolveAttack(state, unit, chosen[0], chosen[1]);
          break; // attacking ends the unit's turn
        }
        // every adjacent target is bribed — fall through to advance toward others
      }
      if (raidUnderfoot(state, unit, player.id)) break; // wreck what we're standing on
      // Pick where to head: barbarians favour enemy economy over distant armies.
      const enemy = nearestEnemy(state, unit);
      const raid = nearestRaidTarget(state, unit);
      let target = enemy;
      if (raid) {
        const from = offsetToAxial({ col: unit.col, row: unit.row });
        const raidD = axialDistance(from, offsetToAxial(raid));
        const enemyD = enemy ? axialDistance(from, offsetToAxial(enemy)) : Infinity;
        if (raidD <= enemyD + RAID_BIAS) target = raid;
      }
      if (!target) break;
      const targetAxial = offsetToAxial(target);
      const curD = axialDistance(offsetToAxial({ col: unit.col, row: unit.row }), targetAxial);
      const reach = computeReachable(state, unit);
      let bestKey: string | null = null;
      let bestCost = 0;
      let bestD = curD;
      for (const [key, entry] of reach) {
        const [c, r] = key.split(",").map(Number) as [number, number];
        const d = axialDistance(offsetToAxial({ col: c, row: r }), targetAxial);
        if (d < bestD) {
          bestD = d;
          bestKey = key;
          bestCost = entry.cost;
        }
      }
      if (!bestKey) break; // no move improves distance
      const [c, r] = bestKey.split(",").map(Number) as [number, number];
      unit.col = c;
      unit.row = r;
      unit.movementLeft = Math.max(0, unit.movementLeft - bestCost);
    }
  }
}
