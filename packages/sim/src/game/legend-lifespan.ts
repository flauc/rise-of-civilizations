// Legend lifespan extensions — heroes start with a short tenure but can earn
// extra turns through deeds that match their legend.

import { getLegend } from "@roc/data";
import type { GameState } from "./state";
import { log, playerById, unitsOf } from "./state";

export type LegendLifeTrigger =
  | "kill"
  | "city_capture"
  | "pillage"
  | "tech_complete"
  | "civic_adopted"
  | "revolution"
  | "religion_tier"
  | "city_converted";

export interface LegendLifeExtension {
  trigger: LegendLifeTrigger;
  turns: number;
}

/** Per-hero rules for earning extra turns while alive. */
export const LEGEND_LIFE_EXTENSIONS: Partial<Record<string, LegendLifeExtension[]>> = {
  gilgamesh: [{ trigger: "kill", turns: 1 }],
  hammurabi: [{ trigger: "civic_adopted", turns: 2 }],
  ramesses_ii: [{ trigger: "civic_adopted", turns: 2 }],
  cleopatra: [{ trigger: "city_converted", turns: 2 }],
  mansa_musa: [{ trigger: "tech_complete", turns: 2 }],
  cyrus: [{ trigger: "city_capture", turns: 2 }],
  leonidas: [{ trigger: "kill", turns: 1 }],
  alexander: [{ trigger: "kill", turns: 1 }, { trigger: "city_capture", turns: 2 }],
  hannibal: [{ trigger: "kill", turns: 1 }],
  sun_tzu_legend: [{ trigger: "tech_complete", turns: 2 }, { trigger: "civic_adopted", turns: 2 }],
  qin_shi_huang: [{ trigger: "civic_adopted", turns: 2 }],
  ashoka: [{ trigger: "city_converted", turns: 2 }],
  boudica: [{ trigger: "kill", turns: 1 }, { trigger: "pillage", turns: 1 }],
  julius_caesar_legend: [{ trigger: "city_capture", turns: 2 }, { trigger: "kill", turns: 1 }],
  attila: [{ trigger: "kill", turns: 1 }, { trigger: "pillage", turns: 1 }],
  belisarius: [{ trigger: "city_capture", turns: 2 }],
  charlemagne: [{ trigger: "civic_adopted", turns: 2 }, { trigger: "revolution", turns: 2 }],
  harald_hardrada: [{ trigger: "pillage", turns: 1 }, { trigger: "kill", turns: 1 }],
  el_cid: [{ trigger: "kill", turns: 1 }],
  saladin: [{ trigger: "city_converted", turns: 1 }, { trigger: "kill", turns: 1 }],
  genghis_khan: [{ trigger: "kill", turns: 1 }],
  subutai: [{ trigger: "kill", turns: 1 }, { trigger: "city_capture", turns: 2 }],
  joan_of_arc_legend: [{ trigger: "city_converted", turns: 2 }],
  tomoe_gozen: [{ trigger: "kill", turns: 1 }],
  tamerlane: [{ trigger: "kill", turns: 1 }, { trigger: "city_capture", turns: 2 }],
  mehmed_ii: [{ trigger: "city_capture", turns: 2 }],
  pachacuti: [{ trigger: "civic_adopted", turns: 2 }],
  zheng_he_legend: [{ trigger: "tech_complete", turns: 2 }],
  yi_sun_sin_legend: [{ trigger: "kill", turns: 1 }],
};

export const LEGEND_DEFAULT_LIFESPAN = 15;

export function legendLifeExtensions(legendId: string): LegendLifeExtension[] {
  return LEGEND_LIFE_EXTENSIONS[legendId] ?? [];
}

/** Add turns to a living legend's expiry. */
export function extendLegendLife(unit: { legendId?: string; legendExpiresOnTurn?: number }, turns: number): void {
  if (!unit.legendId || unit.legendExpiresOnTurn === undefined || turns <= 0) return;
  unit.legendExpiresOnTurn += turns;
}

/** Extend every living legend of `playerId` that listens for `trigger`. */
export function extendLegendsOnTrigger(state: GameState, playerId: number, trigger: LegendLifeTrigger): void {
  const player = playerById(state, playerId);
  if (!player || player.isBarbarian) return;
  for (const unit of unitsOf(state, playerId)) {
    if (!unit.legendId || unit.legendExpiresOnTurn === undefined) continue;
    const rules = legendLifeExtensions(unit.legendId);
    const gain = rules.filter((r) => r.trigger === trigger).reduce((n, r) => n + r.turns, 0);
    if (gain <= 0) continue;
    extendLegendLife(unit, gain);
    const def = getLegend(unit.legendId);
    log(state, `${def?.name ?? "A hero"}'s legend grows — +${gain} turn${gain > 1 ? "s" : ""} (${trigger.replace(/_/g, " ")}).`, {
      actorId: playerId,
      targetIds: [playerId],
      tile: { col: unit.col, row: unit.row },
    });
  }
}

/** Turns remaining before a legend retires (minimum 0). */
export function legendTurnsLeft(state: GameState, unit: { legendExpiresOnTurn?: number }): number {
  if (unit.legendExpiresOnTurn === undefined) return 0;
  return Math.max(0, unit.legendExpiresOnTurn - state.turn);
}
