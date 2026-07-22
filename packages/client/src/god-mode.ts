// Single-player "God Mode" cheat helpers. These bypass the normal command
// validation and mutate local state directly, so they are only exposed through
// LocalSession and never sent to the multiplayer server.

import { getTile } from "@roc/shared";
import { getWonder } from "@roc/data";
import {
  advanceWorks,
  applyCommand,
  cityAt,
  isWonderBuildableTile,
  log,
  nearestOwningCity,
  ECON_TERRAIN,
  isDefenseKind,
  isEconKind,
  isPassableLand,
  isNavalPassable,
  isNaval,
  UNIT_DEFS,
  makeUnit,
  STRUCTURE_HP,
  TECH_DEFS,
  expandTerritory,
  expansionScorer,
  citiesOf,
  unitAt,
  unitMaxHp,
  unitMovement,
  workName,
  type Discipline,
  type GameState,
  type TechId,
  type UnitTypeId,
} from "@roc/sim";

/** Tile works surfaced in the God Mode cheat panel. */
export const CHEAT_WORK_KINDS = [
  "farm",
  "lumber_camp",
  "mine",
  "quarry",
  "fishery",
  "saltern",
  "pasture",
  "plantation",
  "camp",
  "fishing_boats",
  "wall",
  "tower",
] as const;

export type CheatAction =
  | { type: "unlockTechs" }
  | { type: "completeWorks" }
  | { type: "healUnits" }
  | { type: "addGold"; amount: number }
  | { type: "addPopulation" }
  | { type: "addResource"; resource: string; amount: number }
  | { type: "revealMap" }
  | { type: "spawnUnit"; unitType: UnitTypeId; col: number; row: number }
  | { type: "teleportUnit"; unitId: number; col: number; row: number }
  | { type: "foundCity"; col: number; row: number }
  | { type: "buildRoad"; col: number; row: number; level: 1 | 2 | 3 }
  | { type: "buildWork"; kind: string; col: number; row: number }
  | { type: "buildWonder"; wonderId: string; col: number; row: number };

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

function findOpenNavalTile(
  state: GameState,
  col: number,
  row: number,
  oceanUnlocked: boolean,
): { col: number; row: number } | null {
  for (let r = 0; r <= 3; r++) {
    for (let dr = -r; dr <= r; dr++) {
      for (let dc = -r; dc <= r; dc++) {
        const tc = col + dc;
        const tr = row + dr;
        const tile = getTile(state.map, tc, tr);
        if (!tile || !isNavalPassable(tile.terrain, oceanUnlocked)) continue;
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

    case "addPopulation": {
      const cities = citiesOf(state, playerId);
      if (cities.length === 0) return { ok: false, error: "you have no cities" };
      for (const city of cities) {
        city.population += 1;
        expandTerritory(state, city, 1, expansionScorer(state, city)); // same one-tile grow as natural city growth
      }
      log(state, `${player.name} added population to every city (cheat).`, {
        actorId: playerId,
        targetIds: [playerId],
      });
      return { ok: true };
    }

    case "addResource": {
      player.resources[action.resource] = (player.resources[action.resource] ?? 0) + action.amount;
      log(state, `${player.name} gained ${action.amount} ${action.resource} (cheat).`, { actorId: playerId, targetIds: [playerId] });
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

    case "buildWonder": {
      const def = getWonder(action.wonderId);
      if (!def) return { ok: false, error: "no such wonder" };
      if (state.completedWonders.includes(action.wonderId)) {
        return { ok: false, error: "wonder already built" };
      }
      const tile = getTile(state.map, action.col, action.row);
      if (!tile) return { ok: false, error: "no such tile" };
      if (cityAt(state, action.col, action.row)) return { ok: false, error: "cannot build a wonder on a city" };
      if (!isWonderBuildableTile(tile)) return { ok: false, error: "cannot build a wonder here" };
      // Drop any in-progress work for this wonder, then place it instantly.
      state.works = state.works.filter((w) => w.wonderId !== action.wonderId);
      tile.wonder = action.wonderId;
      state.completedWonders.push(action.wonderId);
      const host = nearestOwningCity(state, playerId, action.col, action.row);
      if (host && !host.wonders.includes(action.wonderId)) host.wonders.push(action.wonderId);
      log(state, `${player.name} raised the ${def.name} (cheat).`, {
        actorId: playerId,
        targetIds: [playerId],
        tile: { col: action.col, row: action.row },
      });
      return { ok: true };
    }

    case "spawnUnit": {
      const tile = getTile(state.map, action.col, action.row);
      if (!tile) return { ok: false, error: "no such tile" };
      const def = UNIT_DEFS[action.unitType];
      const naval = isNaval(def);
      const oceanUnlocked = naval && (def.oceanGoing ?? true);
      let target = { col: action.col, row: action.row };
      if (naval) {
        if (!isNavalPassable(tile.terrain, oceanUnlocked)) {
          const open = findOpenNavalTile(state, action.col, action.row, oceanUnlocked);
          if (!open) return { ok: false, error: "not navigable water" };
          target = open;
        } else if (unitAt(state, target.col, target.row)) {
          const open = findOpenNavalTile(state, action.col, action.row, oceanUnlocked);
          if (!open) return { ok: false, error: "no empty water tile nearby" };
          target = open;
        }
      } else {
        if (!isPassableLand(tile.terrain)) {
          const open = findOpenLandTile(state, action.col, action.row);
          if (!open) return { ok: false, error: "not passable land" };
          target = open;
        } else if (unitAt(state, target.col, target.row)) {
          const open = findOpenLandTile(state, action.col, action.row);
          if (!open) return { ok: false, error: "no empty tile nearby" };
          target = open;
        }
      }
      const id = state.nextEntityId++;
      state.units.set(id, makeUnit(id, playerId, action.unitType, target.col, target.row));
      log(state, `${player.name} spawned a ${action.unitType} (cheat).`, { actorId: playerId, targetIds: [playerId] });
      return { ok: true };
    }

    case "teleportUnit": {
      const unit = state.units.get(action.unitId);
      if (!unit) return { ok: false, error: "no such unit" };
      if (unit.ownerId !== playerId) return { ok: false, error: "not your unit" };
      if (unit.inTransit) return { ok: false, error: "unit in transit" };
      if (unit.aboardShipId !== undefined) return { ok: false, error: "aboard a ship" };
      const tile = getTile(state.map, action.col, action.row);
      if (!tile) return { ok: false, error: "no such tile" };
      const def = UNIT_DEFS[unit.type];
      const naval = isNaval(def);
      const oceanUnlocked = naval && (def.oceanGoing ?? true);
      let target = { col: action.col, row: action.row };
      if (naval) {
        if (!isNavalPassable(tile.terrain, oceanUnlocked)) {
          const open = findOpenNavalTile(state, action.col, action.row, oceanUnlocked);
          if (!open) return { ok: false, error: "not navigable water" };
          target = open;
        } else {
          const occupant = unitAt(state, target.col, target.row);
          if (occupant && occupant.id !== unit.id) {
            const open = findOpenNavalTile(state, action.col, action.row, oceanUnlocked);
            if (!open) return { ok: false, error: "no empty water tile nearby" };
            target = open;
          }
        }
      } else {
        if (!isPassableLand(tile.terrain)) {
          const open = findOpenLandTile(state, action.col, action.row);
          if (!open) return { ok: false, error: "not passable land" };
          target = open;
        } else {
          const occupant = unitAt(state, target.col, target.row);
          if (occupant && occupant.id !== unit.id) {
            const open = findOpenLandTile(state, action.col, action.row);
            if (!open) return { ok: false, error: "no empty tile nearby" };
            target = open;
          }
        }
        unit.embarked = false;
      }
      unit.col = target.col;
      unit.row = target.row;
      unit.movementLeft = unitMovement(state, unit);
      log(state, `${player.name} teleported a ${def.name} (cheat).`, {
        actorId: playerId,
        targetIds: [playerId],
        tile: target,
      });
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

