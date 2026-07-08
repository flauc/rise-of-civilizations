// Game-era gates for Great People and Legends — figures from a later age stay
// off the table until the player researches that era's milestone tech.

import type { GreatPersonEra } from "@roc/data";
import type { Player } from "./state";
import type { TechId } from "./content";

export const ERA_ORDER: readonly GreatPersonEra[] = ["Bronze", "Classical", "Medieval", "Exploration"];

/** Milestone tech that unlocks each era (Bronze is always open). */
const ERA_GATE: Record<Exclude<GreatPersonEra, "Bronze">, TechId> = {
  Classical: "bronze_alloying",
  Medieval: "carburizing",
  Exploration: "gunpowder",
};

export function eraIndex(era: GreatPersonEra): number {
  return ERA_ORDER.indexOf(era);
}

/** The highest game era the player has reached via research. */
export function playerGameEra(player: Player): GreatPersonEra {
  if (player.researched.has(ERA_GATE.Exploration)) return "Exploration";
  if (player.researched.has(ERA_GATE.Medieval)) return "Medieval";
  if (player.researched.has(ERA_GATE.Classical)) return "Classical";
  return "Bronze";
}

/** True when `era` figures may be recruited or appear as the next Great Person. */
export function eraUnlocked(player: Player, era: GreatPersonEra): boolean {
  return eraIndex(era) <= eraIndex(playerGameEra(player));
}

/** Human-readable gate for UI when an era is still locked. */
export function eraGateLabel(era: GreatPersonEra): string {
  if (era === "Bronze") return "Available from the start";
  const tech = ERA_GATE[era];
  return `Requires ${tech.replace(/_/g, " ")} (${era} era)`;
}
