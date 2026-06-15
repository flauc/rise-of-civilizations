import { axialDistance, offsetToAxial } from "@roc/shared";
import type { GameState, Unit } from "./state";
import { currentPlayer, playerById, unitsOf, unitAt, cityAt, areEnemies } from "./state";
import { computeReachable } from "./movement";
import { computeAttackTargets, resolveAttack } from "./combat";
import { spawnFromCamps } from "./features";
import { isBarbarianPacified } from "./bribery";

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

/** Simple aggressive AI: each barbarian attacks if it can, else advances toward
 *  the nearest enemy. `playerId` defaults to the current player (hotseat); the
 *  simultaneous resolver passes the barbarian id explicitly. */
export function barbarianTurn(state: GameState, playerId?: number): void {
  const player = playerId !== undefined ? playerById(state, playerId) : currentPlayer(state);
  if (!player) return;
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
      const target = nearestEnemy(state, unit);
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
