// Single-player "God Mode" cheat helpers. These bypass the normal command
// validation and mutate local state directly, so they are only exposed through
// LocalSession and never sent to the multiplayer server.

import { getTile } from "@roc/shared";
import {
  advanceWorks,
  applyCommand,
  log,
  ECON_TERRAIN,
  isDefenseKind,
  isEconKind,
  isPassableLand,
  makeUnit,
  STRUCTURE_HP,
  TECH_DEFS,
  unitAt,
  unitMaxHp,
  workName,
  type Discipline,
  type GameState,
  type TechId,
  type UnitTypeId,
} from "@roc/sim";

export type CheatAction =
  | { type: "unlockTechs" }
  | { type: "completeWorks" }
  | { type: "healUnits" }
  | { type: "addGold"; amount: number }
  | { type: "revealMap" }
  | { type: "spawnUnit"; unitType: UnitTypeId; col: number; row: number }
  | { type: "foundCity"; col: number; row: number }
  | { type: "buildRoad"; col: number; row: number; level: 1 | 2 | 3 }
  | { type: "buildWork"; kind: string; col: number; row: number };

export interface CheatResult {
  ok: boolean;
  error?: string;
}

function playerOrFail(state: GameState, playerId: number) {
  return state.players.find((p) => p.id === playerId);
}

function findOpenLandTile(
  state: GameState,
  col: number,
  row: number,
): { col: number; row: number } | null {
  for (let r = 0; r <= 3; r++) {
    for (let dr = -r; dr <= r; dr++) {
      for (let dc = -r; dc <= r; dc++) {
        const tc = col + dc;
        const tr = row + dr;
        const tile = getTile(state.map, tc, tr);
        if (!tile || !isPassableLand(tile.terrain)) continue;
        if (unitAt(state, tc, tr)) continue;
        return { col: tc, row: tr };
      }
    }
  }
  return null;
}

export function applyCheat(
  state: GameState,
  playerId: number,
  action: CheatAction,
): CheatResult {
  const player = playerOrFail(state, playerId);
  if (!player) return { ok: false, error: "no such player" };

  switch (action.type) {
    case "unlockTechs": {
      for (const id of Object.keys(TECH_DEFS)) {
        player.researched.add(id as TechId);
      }
      player.researching = null;
      player.scienceProgress = 0;
      log(state, `${player.name} unlocked every technology (cheat).`, { actorId: playerId, targetIds: [playerId] });
      return { ok: true };
    }

    case "completeWorks": {
      for (const w of state.works) {
        if (w.ownerId !== playerId) continue;
        for (const d of Object.keys(w.requirement) as Discipline[]) {
          w.progress[d] = w.requirement[d] ?? 0;
        }
      }
      advanceWorks(state, playerId);
      log(state, `${player.name} completed all public works (cheat).`, { actorId: playerId, targetIds: [playerId] });
      return { ok: true };
    }

    case "healUnits": {
      let healed = 0;
      for (const u of state.units.values()) {
        if (u.ownerId !== playerId) continue;
        u.hp = unitMaxHp(u);
        healed++;
      }
      log(state, `${player.name} healed ${healed} units (cheat).`, { actorId: playerId, targetIds: [playerId] });
      return { ok: true };
    }

    case "addGold": {
      player.gold += action.amount;
      log(state, `${player.name} gained ${action.amount} gold (cheat).`, { actorId: playerId, targetIds: [playerId] });
      return { ok: true };
    }

    case "revealMap": {
      const all = new Set<string>();
      for (const t of state.map.tiles) {
        all.add(`${t.col},${t.row}`);
      }
      player.explored = all;
      log(state, `${player.name} revealed the entire map (cheat).`, { actorId: playerId, targetIds: [playerId] });
      return { ok: true };
    }

    case "buildRoad": {
      const tile = getTile(state.map, action.col, action.row);
      if (!tile) return { ok: false, error: "no such tile" };
      if (!isPassableLand(tile.terrain)) return { ok: false, error: "not passable land" };
      const level = Math.min(3, Math.max(1, action.level));
      tile.road = true;
      tile.roadLevel = level;
      log(state, `${player.name} built a tier ${level} road (cheat).`, { actorId: playerId, targetIds: [playerId] });
      return { ok: true };
    }

    case "buildWork": {
      const tile = getTile(state.map, action.col, action.row);
      if (!tile) return { ok: false, error: "no such tile" };
      const { kind } = action;
      if (kind === "road") {
        if (!isPassableLand(tile.terrain)) return { ok: false, error: "not passable land" };
        tile.road = true;
        tile.roadLevel = 3;
        log(state, `${player.name} built an Imperial Road (cheat).`, { actorId: playerId, targetIds: [playerId] });
        return { ok: true };
      }
      if (isEconKind(kind)) {
        const terrains = ECON_TERRAIN[kind];
        if (terrains && !terrains.has(tile.terrain)) {
          return { ok: false, error: "wrong terrain for this work" };
        }
        if (tile.structure) return { ok: false, error: "tile occupied by a defensive structure" };
        tile.improvement = kind;
        tile.improvementLevel = 3;
        log(state, `${player.name} built a ${workName(kind, 3)} (cheat).`, { actorId: playerId, targetIds: [playerId] });
        return { ok: true };
      }
      if (isDefenseKind(kind)) {
        if (!isPassableLand(tile.terrain)) return { ok: false, error: "not passable land" };
        if (tile.improvement) return { ok: false, error: "tile occupied by an improvement" };
        const hp = STRUCTURE_HP[kind][2]!;
        tile.structure = { kind, tier: 3, hp, maxHp: hp };
        log(state, `${player.name} built a ${workName(kind, 3)} (cheat).`, { actorId: playerId, targetIds: [playerId] });
        return { ok: true };
      }
      return { ok: false, error: "unknown work kind" };
    }

    case "spawnUnit": {
      const tile = getTile(state.map, action.col, action.row);
      if (!tile) return { ok: false, error: "no such tile" };
      let target = { col: action.col, row: action.row };
      if (unitAt(state, target.col, target.row)) {
        const open = findOpenLandTile(state, action.col, action.row);
        if (!open) return { ok: false, error: "no empty tile nearby" };
        target = open;
      }
      const id = state.nextEntityId++;
      state.units.set(id, makeUnit(id, playerId, action.unitType, target.col, target.row));
      log(state, `${player.name} spawned a ${action.unitType} (cheat).`, { actorId: playerId, targetIds: [playerId] });
      return { ok: true };
    }

    case "foundCity": {
      const tile = getTile(state.map, action.col, action.row);
      if (!tile) return { ok: false, error: "no such tile" };
      if (!isPassableLand(tile.terrain)) return { ok: false, error: "not passable land" };
      if (unitAt(state, action.col, action.row)) {
        return { ok: false, error: "tile is occupied" };
      }
      const id = state.nextEntityId++;
      state.units.set(id, makeUnit(id, playerId, "settler", action.col, action.row));
      const res = applyCommand(state, { type: "foundCity", unitId: id }, playerId);
      if (!res.ok) {
        // Remove the spawned settler if founding failed (e.g. too close to a city).
        state.units.delete(id);
        return { ok: false, error: res.error ?? "cannot found city here" };
      }
      return { ok: true };
    }

    default:
      return { ok: false, error: "unknown cheat" };
  }
}

