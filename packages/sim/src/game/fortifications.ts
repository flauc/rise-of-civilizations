// Defensive-structure stats, shared by works.ts (build) and combat.ts (fight).
// Dependency-free so both can import it without a cycle.

export type DefenseKind = "wall" | "tower";

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
export function structureDefense(tier: number): number {
  return STRUCTURE_DEFENSE[Math.min(3, Math.max(1, tier)) - 1]!;
}
export function towerBombard(tier: number): number {
  return TOWER_BOMBARD[Math.min(3, Math.max(1, tier)) - 1]!;
}
