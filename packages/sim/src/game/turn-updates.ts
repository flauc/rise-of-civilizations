import { getCiv } from "@roc/data";
import type { GreatPersonDef, LegendDef } from "@roc/data";
import type { GameState, Player, ProductionItem, TurnUpdateEvent, TurnUpdateType } from "./state";
import { log, playerById, citiesOf } from "./state";

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

export function emitUnitTrained(
  state: GameState,
  playerId: number,
  cityId: number,
  cityName: string,
  unitType: string,
  unitName: string,
  col: number,
  row: number,
): void {
  emitTurnUpdate(state, {
    type: "unitTrained",
    playerId,
    message: `${cityName} trained a ${unitName}.`,
    cityId,
    tile: { col, row },
    payload: { unitType, unitName },
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

export function emitGovernmentComplete(state: GameState, playerId: number, governmentName: string): void {
  emitTurnUpdate(state, {
    type: "governmentComplete",
    playerId,
    message: `${governmentName} researched.`,
    payload: { governmentName },
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

/** NOTE: currently unused — the self-alert for recruiting your own Great Person is
 *  suppressed (see great-people.ts). Kept so the pop-up can be re-enabled by
 *  restoring the call site. */
export function emitGreatPersonRecruited(
  state: GameState,
  playerId: number,
  figure: GreatPersonDef,
): void {
  emitTurnUpdate(state, {
    type: "greatPersonRecruited",
    playerId,
    message: `${figure.name} has joined your civilization — a ${figure.cls} of the ${figure.era} era.`,
    payload: { greatPersonId: figure.id, name: figure.name, cls: figure.cls },
  });
}

/** NOTE: currently unused — the self-alert for recruiting your own Legend is
 *  suppressed (see legends.ts). Kept so the pop-up can be re-enabled by restoring
 *  the call site. */
export function emitLegendRecruited(
  state: GameState,
  playerId: number,
  legend: LegendDef,
): void {
  emitTurnUpdate(state, {
    type: "legendRecruited",
    playerId,
    message: `The Legend ${legend.name} has joined your cause — ${legend.abilityDesc}`,
    payload: { legendId: legend.id, name: legend.name, type: legend.type },
  });
}

/** Broadcast a religion's founding to every OTHER major civ: each rival gets a
 *  turn-start update naming the founder and the faith. The founder gets no
 *  self-alert (they just did it) — only the single world-visible log entry, which
 *  also keeps the log from being spammed with a copy per civ. */
export function emitReligionFounded(
  state: GameState,
  founderId: number,
  founderName: string,
  religionName: string,
  religionId: string,
  cityName: string,
  col: number,
  row: number,
): void {
  for (const p of state.players) {
    if (p.isBarbarian || p.id === founderId) continue; // no self-alert for the founder
    const id = state.nextTurnUpdateId++;
    state.turnUpdates.push({
      id,
      turn: state.turn,
      type: "religionFounded",
      playerId: p.id,
      message: `${founderName} founded ${religionName}.`,
      tile: { col, row },
      payload: { founderId, founderName, religionName, religionId },
    });
  }
  log(state, `${founderName} founded ${religionName} in ${cityName}!`, {
    actorId: founderId,
    world: true,
    tile: { col, row },
  });
}

export function emitTreasuryExhausted(state: GameState, playerId: number): void {
  emitTurnUpdate(state, {
    type: "treasuryExhausted",
    playerId,
    message: "Your treasury is exhausted; a unit was disbanded and your army's morale has collapsed.",
  });
}

export function emitEureka(state: GameState, playerId: number, techName: string, desc: string, boost: number): void {
  emitTurnUpdate(state, {
    type: "eureka",
    playerId,
    message: `Eureka! ${techName} — ${desc} (+${boost} science)`,
    payload: { techName, boost },
  });
}

/** Label for civ-defeat announcements: leader names in single-player, usernames in MP. */
function civDefeatDisplayName(state: GameState, player: Player): string {
  if (player.isBarbarian) return "Barbarians";
  const mpHumans = state.players.filter((p) => !p.isBarbarian && p.isHuman).length > 1;
  if (mpHumans && player.isHuman) return player.name;
  return getCiv(player.civId)?.leader ?? player.name.replace(/ \(AI\)$/, "");
}

/** When a major civ is wiped out, alert every other player at turn start. */
export function emitCivDefeated(
  state: GameState,
  victorId: number,
  defeatedId: number,
  tile?: { col: number; row: number },
): void {
  const victor = playerById(state, victorId);
  const defeated = playerById(state, defeatedId);
  if (!victor || !defeated || defeated.isBarbarian) return;
  const victorLabel = civDefeatDisplayName(state, victor);
  const defeatedLabel = civDefeatDisplayName(state, defeated);
  const message = `${victorLabel} defeated ${defeatedLabel}.`;

  for (const p of state.players) {
    if (p.isBarbarian || p.id === defeatedId) continue;
    const id = state.nextTurnUpdateId++;
    state.turnUpdates.push({
      id,
      turn: state.turn,
      type: "civDefeated",
      playerId: p.id,
      message,
      tile,
      payload: { victorId, defeatedId, victorLabel, defeatedLabel },
    });
  }
  log(state, message, {
    actorId: victorId,
    targetIds: [defeatedId],
    world: true,
    tile,
  });
}

/** Fire a civ-defeat announcement once when a major civ loses its last city. */
export function maybeCheckCivElimination(
  state: GameState,
  playerId: number,
  victorId: number,
  tile?: { col: number; row: number },
): void {
  const p = playerById(state, playerId);
  if (!p || p.isBarbarian || p.eliminated) return;
  if (citiesOf(state, playerId).length > 0) return;
  p.eliminated = true;
  emitCivDefeated(state, victorId, playerId, tile);
}
