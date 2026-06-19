import type { TurnUpdateEvent } from "@roc/sim";

export interface TurnUpdateBatch {
  /** Events to surface to the viewer now (empty on a viewer's first render). */
  toShow: TurnUpdateEvent[];
  /** New high-water mark of seen ids to remember for this viewer. */
  lastSeen: number;
}

/**
 * Decide which of a viewer's turn-update events to surface at the start of a turn.
 *
 * Selection is by *unseen id*, not by turn number: events that happen during the
 * enemy phase (e.g. one of your units killed by the AI) are tagged by the sim with
 * the previous turn number, so a turn-equality filter would silently drop them.
 * Tracking the highest id already shown captures everything that happened since the
 * viewer last looked, regardless of which turn the sim stamped on it.
 *
 * `lastSeen` is `undefined` on the first render for a viewer (new game or load): in
 * that case nothing is shown and the existing history is marked as already seen so
 * we never dump the whole backlog.
 */
export function selectTurnUpdates(
  events: TurnUpdateEvent[],
  viewerId: number,
  lastSeen: number | undefined,
): TurnUpdateBatch {
  const mine = events.filter((e) => e.playerId === viewerId);
  const maxId = mine.length > 0 ? Math.max(...mine.map((e) => e.id)) : 0;
  if (lastSeen === undefined) {
    return { toShow: [], lastSeen: maxId };
  }
  return {
    toShow: mine.filter((e) => e.id > lastSeen),
    lastSeen: Math.max(lastSeen, maxId),
  };
}
