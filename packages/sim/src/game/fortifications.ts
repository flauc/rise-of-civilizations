// Defensive-structure stats, shared by works.ts (build/repair), combat.ts (fight)
// and the client renderer (which art to draw). Dependency-free so they can all
// import it without a cycle.

export type DefenseKind = "wall" | "tower";

/**
 * The three conditions a defensive structure passes through as it is battered
 * down. Each has its own artwork, and each plays differently:
 *
 *  - `intact`    full strength, blocks enemy movement.
 *  - `damaged`   still standing and still blocking, but sheltering its defender
 *                less and less as the stonework comes down.
 *  - `destroyed` breached. The end posts still stand but the span between them is
 *                rubble: enemies walk straight through, and it shelters nobody.
 *                The rubble lingers on the tile so it can be patched back up.
 */
export type StructureCondition = "intact" | "damaged" | "destroyed";

/** Health fraction below which a structure reads (and renders) as damaged. */
export const DAMAGED_BELOW = 0.6;

/** How many turns a breached structure's rubble lingers before the tile clears. */
export const RUBBLE_LIFESPAN = 10;

/** Max HP by tier (1–3) for each defensive ladder. */
export const STRUCTURE_HP: Record<DefenseKind, [number, number, number]> = {
  wall: [40, 80, 140],
  tower: [60, 110, 170],
};

/** Combat-defense bonus a structure grants a friendly unit standing on it, by tier. */
export const STRUCTURE_DEFENSE: [number, number, number] = [3, 5, 7];

/** Tower bombard strength (free ranged attack) by tier. */
export const TOWER_BOMBARD: [number, number, number] = [8, 12, 16];

export const DEFENSE_NAMES: Record<DefenseKind, [string, string, string]> = {
  wall: ["Palisade", "Stone Wall", "Great Wall"],
  tower: ["Watchtower", "Fort", "Citadel"],
};

export function structureHp(kind: DefenseKind, tier: number): number {
  return STRUCTURE_HP[kind][Math.min(3, Math.max(1, tier)) - 1]!;
}

/** Which of the three conditions a structure at `hp`/`maxHp` is in. */
export function structureCondition(hp: number, maxHp: number): StructureCondition {
  if (hp <= 0) return "destroyed";
  return hp < maxHp * DAMAGED_BELOW ? "damaged" : "intact";
}

/** True while the structure still stands: it blocks enemy entry and shelters a
 *  defender. A breached (0-hp) structure is walkable rubble and does neither. */
export function structureStands(structure?: { hp: number }): boolean {
  return !!structure && structure.hp > 0;
}

/**
 * Combat-defense bonus the structure grants the friendly unit standing on it.
 * The shelter scales with how much of the wall is still up, so battering it down
 * progressively strips the defender's cover rather than doing nothing at all
 * until the final blow.
 */
export function structureDefense(tier: number, hp: number, maxHp: number): number {
  const full = STRUCTURE_DEFENSE[Math.min(3, Math.max(1, tier)) - 1]!;
  if (maxHp <= 0 || hp <= 0) return 0;
  return full * Math.min(1, hp / maxHp);
}

export function towerBombard(tier: number): number {
  return TOWER_BOMBARD[Math.min(3, Math.max(1, tier)) - 1]!;
}

/** Share of a from-scratch build that repairing a structure costs. Patching a
 *  breach is half the work of raising the wall in the first place, and is further
 *  prorated by how much of it is actually missing — see repairFraction. */
export const REPAIR_RATE = 0.5;
/** Floor on the repair share, so even a scratch still takes a craftsman a moment. */
const REPAIR_MIN = 0.1;

/**
 * Labour multiplier for patching a structure back to full at its current tier,
 * as a fraction of what building it fresh would cost. A wall at half health
 * costs a quarter of a rebuild; a flattened one still costs half.
 */
export function repairFraction(hp: number, maxHp: number): number {
  if (maxHp <= 0) return REPAIR_RATE;
  const missing = Math.min(1, Math.max(0, 1 - hp / maxHp));
  return Math.max(REPAIR_MIN, missing * REPAIR_RATE);
}

/**
 * Clear rubble whose lifespan has elapsed. A breached wall left unrepaired for
 * RUBBLE_LIFESPAN turns is finally hauled away and the tile goes back to bare
 * ground, so neglecting a broken frontier costs you the cheap repair and forces
 * a full rebuild. Called once per round from beginTurn.
 */
export function tickRubble(state: {
  turn: number;
  map: { tiles: { structure?: { hp: number; rubbleExpiresTurn?: number } }[] };
}): void {
  for (const tile of state.map.tiles) {
    const s = tile.structure;
    if (!s || s.hp > 0) continue;
    if (s.rubbleExpiresTurn !== undefined && state.turn >= s.rubbleExpiresTurn) {
      tile.structure = undefined;
    }
  }
}
