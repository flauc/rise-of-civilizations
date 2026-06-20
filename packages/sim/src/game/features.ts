// Map features: tribal Villages (random perk when a civ unit enters) and
// Barbarian Camps (periodically spawn raiders; reward for clearing them).
//
// All randomness is DETERMINISTIC — seeded from turn/unit/tile coordinates via
// the shared RNG — so the server and clients agree (no stored RNG state needed).

import { axialDistance, getTile, hashSeed, makeRng, offsetToAxial } from "@roc/shared";
import {
  citiesOf,
  log,
  makeUnit,
  playerById,
  unitAt,
  unitsOf,
  type BarbarianActivity,
  type GameState,
  type Player,
  type Unit,
} from "./state";
import { UNIT_DEFS, isMilitary, type UnitTypeId } from "./content";
import { unitMaxHp } from "./combat";
import { startingUnitMorale } from "./morale";
import { availableTechs } from "./economy";
import { expandTerritory } from "./territory";
import { offsetNeighbors } from "./movement";
import { isPassableLand } from "./terrain";

function barbarianUnitCap(state: GameState): number {
  switch (state.barbarianActivity) {
    case "minimal":
      return 3;
    case "low":
      return 5;
    case "high":
      return 20;
    case "normal":
    default:
      return 12;
  }
}

function barbarianCampCadence(state: GameState, tileCol: number, tileRow: number): number {
  const base = 4 + (hashSeed(`cadence:${tileCol},${tileRow}`) % 3); // 4–6
  switch (state.barbarianActivity) {
    case "minimal":
      return base + 4; // 8–10
    case "low":
      return base + 2; // 6–8
    case "high":
      return Math.max(1, base - 2); // 2–4
    case "normal":
    default:
      return base;
  }
}

function barbarianId(state: GameState): number | undefined {
  return state.players.find((p) => p.isBarbarian)?.id;
}

function spawnUnitNear(state: GameState, ownerId: number, type: UnitTypeId, col: number, row: number): Unit | null {
  const place = (c: number, r: number): Unit => {
    const id = state.nextEntityId++;
    const u = makeUnit(id, ownerId, type, c, r, 0, startingUnitMorale(state, ownerId));
    state.units.set(id, u);
    return u;
  };
  if (!unitAt(state, col, row)) return place(col, row);
  for (const n of offsetNeighbors(state.map, col, row)) {
    const tile = getTile(state.map, n.col, n.row);
    if (tile && isPassableLand(tile.terrain) && !unitAt(state, n.col, n.row)) return place(n.col, n.row);
  }
  return null;
}

function nearestCity(state: GameState, playerId: number, col: number, row: number) {
  const here = offsetToAxial({ col, row });
  let best = null as ReturnType<typeof citiesOf>[number] | null;
  let bestD = Infinity;
  for (const c of citiesOf(state, playerId)) {
    const d = axialDistance(here, offsetToAxial({ col: c.col, row: c.row }));
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

// ---- village rewards -----------------------------------------------------

/** Resolve a tribal village's random perk for the unit's owner. */
export function triggerVillage(state: GameState, unit: Unit, player: Player): void {
  const rng = makeRng(hashSeed(`village:${state.turn}:${unit.id}:${unit.col},${unit.row}`));
  const city = nearestCity(state, player.id, unit.col, unit.row);
  const techs = availableTechs(player);
  const barbId = barbarianId(state);

  // Weighted reward table (negative outcome is rare).
  const roll = rng.next();
  if (roll < 0.22 && techs.length > 0) {
    const tech = techs[Math.floor(rng.next() * techs.length)]!;
    player.researched.add(tech);
    if (player.researching === tech) player.researching = null;
    log(state, `${player.name} learned ${tech.replace(/_/g, " ")} from a village!`, {
      actorId: player.id,
      targetIds: [player.id],
      tile: { col: unit.col, row: unit.row },
      reward: "tech",
    });
  } else if (roll < 0.4) {
    const gold = 30 + Math.floor(rng.next() * 40);
    player.gold += gold;
    log(state, `${player.name} found ${gold} gold in a village.`, {
      actorId: player.id,
      targetIds: [player.id],
      tile: { col: unit.col, row: unit.row },
      reward: "gold",
    });
  } else if (roll < 0.55 && city) {
    const prod = 20 + Math.floor(rng.next() * 25);
    city.productionStored += prod;
    log(state, `A village sped up production in ${city.name}.`, {
      actorId: player.id,
      targetIds: [player.id],
      tile: { col: unit.col, row: unit.row },
      reward: "production",
    });
  } else if (roll < 0.68 && city) {
    city.population += 1;
    expandTerritory(state, city);
    log(state, `A village added a citizen to ${city.name}.`, {
      actorId: player.id,
      targetIds: [player.id],
      tile: { col: unit.col, row: unit.row },
      reward: "population",
    });
  } else if (roll < 0.8) {
    const type: UnitTypeId = rng.next() < 0.5 ? "scout" : "warrior";
    if (spawnUnitNear(state, player.id, type, unit.col, unit.row)) {
      log(state, `A village provided a free ${UNIT_DEFS[type].name}.`, {
        actorId: player.id,
        targetIds: [player.id],
        tile: { col: unit.col, row: unit.row },
        reward: "unit",
      });
    }
  } else if (roll < 0.92 && isMilitary(unit.type)) {
    unit.unspentPromotions += 1;
    log(state, `${UNIT_DEFS[unit.type].name} gained battle wisdom (free promotion) at a village.`, {
      actorId: player.id,
      targetIds: [player.id],
      tile: { col: unit.col, row: unit.row },
      reward: "promotion",
    });
  } else if (barbId !== undefined) {
    // Negative: an ambush — barbarians appear nearby.
    let spawned = 0;
    for (const n of offsetNeighbors(state.map, unit.col, unit.row)) {
      if (spawned >= 2) break;
      const tile = getTile(state.map, n.col, n.row);
      if (tile && isPassableLand(tile.terrain) && !unitAt(state, n.col, n.row)) {
        spawnUnitNear(state, barbId, rng.next() < 0.5 ? "warrior" : "slinger", n.col, n.row);
        spawned++;
      }
    }
    log(state, `It was a trap! Barbarians ambushed ${player.name}.`, {
      actorId: player.id,
      targetIds: [player.id],
      tile: { col: unit.col, row: unit.row },
      reward: "ambush",
    });
  } else {
    player.gold += 25;
    log(state, `${player.name} found a small cache in a village.`, {
      actorId: player.id,
      targetIds: [player.id],
      tile: { col: unit.col, row: unit.row },
      reward: "cache",
    });
  }
}

/** Reward for clearing a barbarian camp with a military unit. */
export function clearBarbCamp(state: GameState, unit: Unit, player: Player): void {
  const base = 40 + Math.floor(makeRng(hashSeed(`camp:${unit.col},${unit.row}:${state.turn}`)).next() * 30);
  const gold = base + (unit.promotions.includes("raider") ? 25 : 0);
  player.gold += gold;
  if (unit.promotions.includes("forager")) {
    unit.hp = Math.min(unitMaxHp(unit), unit.hp + 8);
  }
  log(state, `${player.name} cleared a barbarian camp (+${gold} gold).`, {
    actorId: player.id,
    targetIds: [player.id],
    tile: { col: unit.col, row: unit.row },
    reward: "camp_cleared",
  });
}

/** Called when a unit finishes a move — resolves any feature on its tile. */
export function onUnitEnter(state: GameState, unit: Unit): void {
  const tile = getTile(state.map, unit.col, unit.row);
  if (!tile || !tile.feature) return;
  const player = playerById(state, unit.ownerId);
  if (!player || player.isBarbarian) return;
  if (tile.feature === "village") {
    tile.feature = undefined;
    triggerVillage(state, unit, player);
  } else if (tile.feature === "barb_camp" && isMilitary(unit.type)) {
    tile.feature = undefined;
    clearBarbCamp(state, unit, player);
  }
}

// ---- barbarian camps spawning --------------------------------------------

/** Camps periodically spawn raiders (called during the barbarians' turn). */
export function spawnFromCamps(state: GameState, barbId: number): void {
  const cap = barbarianUnitCap(state);
  if (unitsOf(state, barbId).length >= cap) return;
  for (const tile of state.map.tiles) {
    if (tile.feature !== "barb_camp") continue;
    const cadence = barbarianCampCadence(state, tile.col, tile.row);
    if (state.turn % cadence !== 0) continue;
    if (unitsOf(state, barbId).length >= cap) return;
    const type: UnitTypeId = makeRng(hashSeed(`camp:${tile.col},${tile.row}:${state.turn}`)).next() < 0.5 ? "warrior" : "slinger";
    const spawned = spawnUnitNear(state, barbId, type, tile.col, tile.row);
    if (spawned) spawned.campKey = `${tile.col},${tile.row}`; // tag the war-band for bribery
  }
}

// ---- placement at map generation -----------------------------------------

export function placeFeatures(
  state: GameState,
  starts: ({ col: number; row: number } | null)[],
  activity: BarbarianActivity,
): void {
  const { map } = state;
  const area = map.cols * map.rows;
  const villageCount = Math.max(2, Math.floor(area / 70));
  const campCount =
    activity === "none"
      ? 0
      : activity === "minimal"
        ? Math.max(1, Math.floor(area / 800))
        : activity === "low"
          ? Math.max(1, Math.floor(area / 450))
          : activity === "high"
            ? Math.max(1, Math.floor(area / 140))
            : Math.max(1, Math.floor(area / 220));

  // Eligible land tiles, away from starts and not already featured/occupied.
  const eligible: { col: number; row: number; key: number }[] = [];
  for (const tile of map.tiles) {
    if (!isPassableLand(tile.terrain) || tile.feature) continue;
    const here = offsetToAxial({ col: tile.col, row: tile.row });
    if (starts.some((s) => s && axialDistance(here, offsetToAxial(s)) < 5)) continue;
    if (unitAt(state, tile.col, tile.row)) continue;
    eligible.push({ col: tile.col, row: tile.row, key: hashSeed(`feat:${tile.col},${tile.row}`) });
  }
  eligible.sort((a, b) => a.key - b.key); // deterministic pseudo-shuffle

  const placed: { col: number; row: number }[] = [];
  const tooClose = (c: number, r: number) =>
    placed.some((p) => axialDistance(offsetToAxial(p), offsetToAxial({ col: c, row: r })) < 3);

  const claim = (feature: string, count: number) => {
    let n = 0;
    for (const e of eligible) {
      if (n >= count) break;
      if (tooClose(e.col, e.row)) continue;
      const t = getTile(map, e.col, e.row);
      if (!t || t.feature) continue;
      t.feature = feature;
      placed.push({ col: e.col, row: e.row });
      n++;
    }
  };
  claim("village", villageCount);
  claim("barb_camp", campCount);
}
