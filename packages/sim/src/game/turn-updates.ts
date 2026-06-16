import type { GameState, ProductionItem, TurnUpdateEvent, TurnUpdateType } from "./state";
import { log } from "./state";

/** Append a structured turn-start update event for a specific player.
 *  Also writes a matching log entry so the regular game log stays complete. */
export function emitTurnUpdate(
  state: GameState,
  event: Omit<TurnUpdateEvent, "id" | "turn">,
): TurnUpdateEvent {
  const id = state.nextTurnUpdateId++;
  const full: TurnUpdateEvent = { ...event, id, turn: state.turn };
  state.turnUpdates.push(full);
  log(state, event.message, {
    actorId: event.playerId,
    targetIds: [event.playerId],
    tile: event.tile,
  });
  return full;
}

/** Convenience builders for common update types. */
export function emitUnitDied(state: GameState, playerId: number, unitId: number, name: string, col: number, row: number): void {
  emitTurnUpdate(state, {
    type: "unitDied",
    playerId,
    message: `${name} was destroyed.`,
    unitId,
    tile: { col, row },
  });
}

export function emitProductionComplete(
  state: GameState,
  playerId: number,
  cityId: number,
  cityName: string,
  item: ProductionItem,
  itemName: string,
  col: number,
  row: number,
): void {
  emitTurnUpdate(state, {
    type: "productionComplete",
    playerId,
    message: `${cityName} completed ${itemName}.`,
    cityId,
    tile: { col, row },
    payload: { item },
  });
}

export function emitResearchComplete(state: GameState, playerId: number, techName: string): void {
  emitTurnUpdate(state, {
    type: "researchComplete",
    playerId,
    message: `${techName} discovered.`,
    payload: { techName },
  });
}

export function emitCivicComplete(state: GameState, playerId: number, civicName: string): void {
  emitTurnUpdate(state, {
    type: "civicComplete",
    playerId,
    message: `${civicName} adopted.`,
    payload: { civicName },
  });
}

export function emitImprovementComplete(
  state: GameState,
  playerId: number,
  workId: number,
  kind: string,
  name: string,
  col: number,
  row: number,
): void {
  emitTurnUpdate(state, {
    type: "improvementComplete",
    playerId,
    message: `${name} completed.`,
    workId,
    tile: { col, row },
    payload: { kind },
  });
}

export function emitWonderComplete(
  state: GameState,
  playerId: number,
  workId: number,
  wonderId: string,
  wonderName: string,
  col: number,
  row: number,
): void {
  emitTurnUpdate(state, {
    type: "wonderComplete",
    playerId,
    message: `${wonderName} completed!`,
    workId,
    tile: { col, row },
    payload: { wonderId, wonderName },
  });
}

export function emitTradeRoutePillaged(
  state: GameState,
  playerId: number,
  col: number,
  row: number,
): void {
  emitTurnUpdate(state, {
    type: "tradeRoutePillaged",
    playerId,
    message: "One of your trade routes was pillaged.",
    tile: { col, row },
  });
}

export function emitImprovementPillaged(
  state: GameState,
  playerId: number,
  col: number,
  row: number,
  pillaged: string[],
): void {
  const what = pillaged.join(" and ");
  emitTurnUpdate(state, {
    type: "improvementPillaged",
    playerId,
    message: `Your ${what} was pillaged by an enemy.`,
    tile: { col, row },
    payload: { pillaged },
  });
}

export function emitTradeRouteEstablished(
  state: GameState,
  playerId: number,
  routeId: number,
  originName: string,
  destName: string,
  originCol: number,
  originRow: number,
  destCol: number,
  destRow: number,
): void {
  emitTurnUpdate(state, {
    type: "tradeRouteEstablished",
    playerId,
    message: `A trade route now connects ${originName} and ${destName}.`,
    workId: routeId,
    tile: { col: originCol, row: originRow },
    payload: { originName, destName, destCol, destRow },
  });
}

export function emitCityLost(
  state: GameState,
  playerId: number,
  cityId: number,
  cityName: string,
  col: number,
  row: number,
): void {
  emitTurnUpdate(state, {
    type: "cityLost",
    playerId,
    message: `${cityName} was lost.`,
    cityId,
    tile: { col, row },
  });
}

export function emitCityGrew(
  state: GameState,
  playerId: number,
  cityId: number,
  cityName: string,
  population: number,
  col: number,
  row: number,
): void {
  emitTurnUpdate(state, {
    type: "cityGrew",
    playerId,
    message: `${cityName} grew to population ${population}.`,
    cityId,
    tile: { col, row },
    payload: { population },
  });
}

export function emitTreasuryExhausted(state: GameState, playerId: number): void {
  emitTurnUpdate(state, {
    type: "treasuryExhausted",
    playerId,
    message: "Your treasury is exhausted; a unit was disbanded.",
  });
}
