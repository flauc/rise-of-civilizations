// Unit training. A city musters units of a given class only if it owns the matching
// training building (see content.ts TRAINING_BUILDING_DEFS), and each unit costs a
// citizen — population is debited when the order starts (the recruit marches off). The
// building's tier improves training speed, the unit's starting morale/XP, and how many
// units can be trained at once. Civilians (settler/trader) and recon (scout) train from
// the city center with no building. Construction (city.production) now only raises
// buildings/wonders/projects; training is this separate, slot-based system.

import type { City, GameState, Player, TrainingOrder } from "./state";
import { playerById } from "./state";
import {
  TRAINING_BUILDING_DEFS, UNIT_DEFS, trainingClassFor, trainingTier, trainTimeFor,
  type TrainingClass, type UnitTypeId,
} from "./content";
import { resourceStock } from "./resources";
import { playerEffects } from "./civs";
import { isCoastalLand } from "./movement";
import { autoAssignCitizens, placeUnit } from "./economy";
import { emitUnitTrained } from "./turn-updates";

/** Civilian/recon units trainable from the city center (no training building). */
export const CITY_CENTER_UNITS: UnitTypeId[] = ["settler", "trader", "scout"];
/** Concurrent civilian/recon training slots (independent of building families). */
const CIVILIAN_SLOTS = 1;

/** Current tier (0 = not built) of a training family in a city. */
export function familyTier(city: City, family: TrainingClass): number {
  return city.training[family] ?? 0;
}

/** Non-specialist citizens available to be pulled into training. */
export function freeCitizens(city: City): number {
  return Math.max(0, city.population - city.specialists.length);
}

/** Concurrent training slots for a family in a city (0 if not built). */
export function trainSlots(state: GameState, city: City, family: TrainingClass): number {
  const tier = familyTier(city, family);
  if (tier <= 0) return 0;
  const bonus = playerEffects(state, city.ownerId).trainingSlotsBonus ?? 0;
  return trainingTier(family, tier).slots + Math.max(0, bonus);
}

/** Orders in progress that belong to a given family (civilians when family = null). */
function ordersForFamily(city: City, family: TrainingClass | null): number {
  return city.trainingQueue.filter((o) => trainingClassFor(o.unit) === family).length;
}

/** Every unit type the city can currently train (tech + building + coast gated). */
export function availableTraining(state: GameState, player: Player, city: City): UnitTypeId[] {
  const out: UnitTypeId[] = [];
  const coastal = isCoastalLand(state, city.col, city.row);
  for (const type of Object.keys(UNIT_DEFS) as UnitTypeId[]) {
    const def = UNIT_DEFS[type];
    if (def.reqTech && !player.researched.has(def.reqTech)) continue;
    if (def.reqResource && resourceStock(player, def.reqResource.resource) < def.reqResource.count) continue;
    const family = trainingClassFor(type);
    if (family) {
      if (familyTier(city, family) <= 0) continue;
      if ((def.cls === "naval_melee" || def.cls === "naval_ranged") && !coastal) continue;
    } else if (!CITY_CENTER_UNITS.includes(type)) {
      continue;
    }
    out.push(type);
  }
  return out;
}

export interface TrainResult {
  ok: boolean;
  error?: string;
}

/** Validate that the city can begin training `type` right now (no mutation). */
export function canStartTraining(state: GameState, city: City, type: UnitTypeId): TrainResult {
  const player = playerById(state, city.ownerId);
  if (!player) return { ok: false, error: "no such player" };
  const def = UNIT_DEFS[type];
  if (def.reqTech && !player.researched.has(def.reqTech)) return { ok: false, error: "tech not researched" };
  if (def.reqResource && resourceStock(player, def.reqResource.resource) < def.reqResource.count) {
    return { ok: false, error: `requires ${def.reqResource.count} ${def.reqResource.resource}` };
  }
  // Never train your last citizen, and a non-specialist must be free to go.
  if (city.population < 2) return { ok: false, error: "city too small (needs pop ≥ 2)" };
  if (freeCitizens(city) < 1) return { ok: false, error: "no free citizen to train" };
  const family = trainingClassFor(type);
  if (family) {
    if (familyTier(city, family) <= 0) return { ok: false, error: `no ${TRAINING_BUILDING_DEFS[family].name}` };
    if ((def.cls === "naval_melee" || def.cls === "naval_ranged") && !isCoastalLand(state, city.col, city.row)) {
      return { ok: false, error: "naval units need a coastal city" };
    }
    if (ordersForFamily(city, family) >= trainSlots(state, city, family)) {
      return { ok: false, error: "all training slots in use" };
    }
  } else {
    if (!CITY_CENTER_UNITS.includes(type)) return { ok: false, error: "cannot train that here" };
    if (ordersForFamily(city, null) >= CIVILIAN_SLOTS) return { ok: false, error: "already training a civilian" };
  }
  return { ok: true };
}

/** Train time (turns) for a unit in this city: building-tier speed × civ trainTimePercent. */
export function trainingTimeInCity(state: GameState, city: City, type: UnitTypeId): number {
  const family = trainingClassFor(type);
  const speedPct = family ? trainingTier(family, familyTier(city, family)).speedPct : 1;
  const civPct = playerEffects(state, city.ownerId).trainTimePercent ?? 0;
  return trainTimeFor(type, speedPct * (1 + civPct / 100));
}

/** Begin training a unit: debits a citizen (pop −1) and queues the order. */
export function startTraining(state: GameState, city: City, type: UnitTypeId): TrainResult {
  const can = canStartTraining(state, city, type);
  if (!can.ok) return can;
  city.population -= 1;
  city.trainingQueue.push({
    id: state.nextEntityId++,
    unit: type,
    turnsLeft: trainingTimeInCity(state, city, type),
    startTurn: state.turn,
  });
  autoAssignCitizens(state, city); // the departing citizen frees a worked tile
  return { ok: true };
}

/** Cancel an in-progress order, returning the citizen to the city. */
export function cancelTraining(state: GameState, city: City, orderId: number): TrainResult {
  const idx = city.trainingQueue.findIndex((o) => o.id === orderId);
  if (idx < 0) return { ok: false, error: "no such training order" };
  city.trainingQueue.splice(idx, 1);
  city.population += 1;
  autoAssignCitizens(state, city);
  return { ok: true };
}

/** Advance every training order one turn and muster finished units. Called from
 *  processCity each turn (population was already spent when the order started). */
export function advanceTraining(state: GameState, city: City, owner: Player): void {
  if (city.trainingQueue.length === 0) return;
  const remaining: TrainingOrder[] = [];
  for (const order of city.trainingQueue) {
    order.turnsLeft -= 1;
    if (order.turnsLeft > 0) {
      remaining.push(order);
      continue;
    }
    const family = trainingClassFor(order.unit);
    const tierDef = family ? trainingTier(family, familyTier(city, family)) : null;
    const eff = playerEffects(state, owner.id);
    const xp = (tierDef?.xp ?? 0) + (eff.startXpBonus ?? 0);
    const moraleBonus = (tierDef?.moraleBonus ?? 0) + (eff.startMoraleBonus ?? 0);
    placeUnit(state, city, order.unit, xp, moraleBonus);
    const def = UNIT_DEFS[order.unit];
    if (def.reqResource) {
      owner.resources[def.reqResource.resource] = Math.max(
        0,
        (owner.resources[def.reqResource.resource] ?? 0) - def.reqResource.count,
      );
    }
    emitUnitTrained(state, owner.id, city.id, city.name, order.unit, def.name, city.col, city.row);
  }
  city.trainingQueue = remaining;
}
