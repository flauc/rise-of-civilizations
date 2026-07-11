// Legend (hero) per-turn PASSIVE ticks — the powers a hero exerts simply by
// being alive, run at the start of the owner's turn (beginTurn, commands.ts;
// startSimultaneousTurn, simturn.ts). The always-on presence effects consulted
// mid-combat/economy live in legend-effects.ts. See docs/UNIT-ABILITIES.md §9
// and docs/GREAT-PEOPLE.md §2; the wiki's Legends pages carry the historical
// context for each power.

import { axialDistance, offsetToAxial, type Axial } from "@roc/shared";
import type { GameState, Player, Unit } from "./state";
import { areEnemies, playerById } from "./state";
import { isMilitary, UNIT_DEFS } from "./content";
import { awardUnitXp, unitMaxHp } from "./combat";
import { adjustGlobalMorale, changeUnitMorale, globalMoraleOf, recordMoraleEvent } from "./morale";
import { revealHiddenInSight } from "./stealth";
import { unitSight } from "./movement";
import { legendUnitsOf } from "./legend-effects";

function ax(u: { col: number; row: number }): Axial {
  return offsetToAxial(u);
}

function adjacentUnits(state: GameState, unit: Unit): Unit[] {
  const out: Unit[] = [];
  for (const u of state.units.values()) {
    if (u.id !== unit.id && axialDistance(ax(unit), ax(u)) === 1) out.push(u);
  }
  return out;
}

/**
 * Run every living legend's per-turn passive for `player`. Called after
 * tickLegends (so a hero retiring this turn no longer acts) and after movement
 * has been refreshed (so movement grants land on the new turn's pool).
 */
export function tickLegendPassives(state: GameState, player: Player): void {
  for (const hero of legendUnitsOf(state, player.id)) {
    switch (hero.legendId) {
      // Hammurabi — Code of Laws: the law steadies the realm (+2 global morale/turn).
      case "hammurabi": {
        const before = globalMoraleOf(player);
        adjustGlobalMorale(player, 2);
        recordMoraleEvent(state, player.id, before, "The Code of Laws steadies the realm");
        break;
      }

      // Ashoka — Dhamma: +4 faith, and the emperor's healers tend adjacent allies.
      case "ashoka": {
        player.faith += 4;
        for (const u of adjacentUnits(state, hero)) {
          if (u.ownerId === player.id) u.hp = Math.min(unitMaxHp(u), u.hp + 15);
        }
        break;
      }

      // Charlemagne — Crown of the West: the holy emperor's church yields +3 faith.
      case "charlemagne":
        player.faith += 3;
        break;

      // Cleopatra — the wealth of Egypt: +6 gold (her Allure is in legend-effects.ts).
      case "cleopatra":
        player.gold += 6;
        break;

      // Mansa Musa — Golden Flood: +14 gold and +2 faith.
      case "mansa_musa":
        player.gold += 14;
        player.faith += 2;
        break;

      // Zheng He — Treasure Fleet tribute: +10 gold (+1 ship movement is in legend-effects.ts).
      case "zheng_he_legend":
        player.gold += 10;
        break;

      // Zhuge Liang — the Sleeping Dragon: +2 science, and adjacent ranged/siege units drill.
      case "zhuge_liang": {
        player.scienceProgress += 2;
        for (const u of adjacentUnits(state, hero)) {
          if (u.ownerId !== player.id || u.legendId) continue;
          const cls = UNIT_DEFS[u.type].cls;
          if (cls === "ranged" || cls === "siege") awardUnitXp(u, 3);
        }
        break;
      }

      // Cyrus — The King's March: he and every friendly unit beside him gain +1 movement.
      case "cyrus": {
        hero.movementLeft += 1;
        for (const u of adjacentUnits(state, hero)) {
          if (u.ownerId === player.id && !u.sleeping) u.movementLeft += 1;
        }
        break;
      }

      // Sun Tzu — The Art of War: adjacent allies drill (+3 XP), hidden enemies in
      // his sight are revealed ("know the enemy and know yourself").
      case "sun_tzu_legend": {
        for (const u of adjacentUnits(state, hero)) {
          if (u.ownerId === player.id && isMilitary(u.type) && !u.legendId) awardUnitXp(u, 3);
        }
        revealHiddenInSight(state, hero, unitSight(state, hero));
        break;
      }

      // Genghis Khan — Terror of the Steppe: his name alone unmakes armies; enemy
      // units beside the Khan lose 3 morale each turn.
      case "genghis_khan": {
        for (const u of adjacentUnits(state, hero)) {
          const o = playerById(state, u.ownerId);
          if (o && areEnemies(player, o)) changeUnitMorale(u, -3);
        }
        break;
      }
    }
  }
}
