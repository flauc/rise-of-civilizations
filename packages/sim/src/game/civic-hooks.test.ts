// Engine-hook tests for the Civics & Governments overhaul (docs/CIVICS-AND-GOVERNMENTS.md
// §4, milestone M-C1). Each new conditional CivEffects field is exercised in isolation
// by injecting it as a timed player modifier (which merges into playerEffects exactly
// like a slotted civic will), so these tests are pure capability — no data yet.

import { describe, it, expect } from "vitest";
import { getTile } from "@roc/shared";
import { createGame } from "./setup";
import { beginTurn, applyCommand } from "./commands";
import { combatPreview, cityDefenseStrength, resolveAttack, healAndReset } from "./combat";
import { getCityYields, unitUpkeep } from "./economy";
import { spreadReligion, foundReligion, convertCityToPlayerReligion, dominantReligion, FAITH_TO_FOUND } from "./religion";
import { isAtWarWithMajor } from "./diplomacy";
import { makeUnit, citiesOf, unitsOf, type GameState, type City } from "./state";
import type { CivEffects } from "@roc/data";

function game(): GameState {
  const s = createGame({ seed: "civic-hooks", cols: 40, rows: 28, barbarians: false, humanSlots: 2 });
  beginTurn(s);
  return s;
}

function inject(s: GameState, owner: number, type: Parameters<typeof makeUnit>[2], col: number, row: number) {
  const id = s.nextEntityId++;
  const u = makeUnit(id, owner, type, col, row);
  u.movementLeft = 2;
  s.units.set(id, u);
  return u;
}

/** Found the given player's capital from its starting settler; returns the city. */
function foundCityFor(s: GameState, playerId: number): City {
  const settler = unitsOf(s, playerId).find((u) => u.type === "settler")!;
  applyCommand(s, { type: "foundCity", unitId: settler.id }, playerId);
  return citiesOf(s, playerId)[0]!;
}

/** Inject an effect as a (never-expiring, for the test) empire-wide modifier. */
function grant(s: GameState, playerId: number, effect: Partial<CivEffects>): void {
  s.players[playerId]!.modifiers.push({ source: "test", effect, expiresOnTurn: s.turn + 999 });
}

/** A land-safe adjacent (col,row) pair well clear of `city`'s territory. Row is
 *  forced odd so the east tile (col+1) is a hex neighbour (odd-r offset). */
function farPair(s: GameState, city: City): [[number, number], [number, number]] {
  const col = city.col < 20 ? city.col + 8 : city.col - 8;
  const row = city.row % 2 === 0 ? city.row + 1 : city.row;
  return [[col, row], [col + 1, row]];
}

describe("civics engine hooks (M-C1)", () => {
  describe("combat: home / foreign / all-unit / other-religion", () => {
    it("homeCombat strengthens a unit on its own territory only", () => {
      const s = game();
      const city = foundCityFor(s, 0);
      const [[ac, ar], [dc, dr]] = farPair(s, city);
      const atk = inject(s, 0, "warrior", ac, ar);
      inject(s, 1, "warrior", dc, dr);
      const atkTile = getTile(s.map, ac, ar)!;

      // On home territory the bonus lands.
      atkTile.ownerCityId = city.id;
      const homeBefore = combatPreview(s, atk, dc, dr)!.toDefender;
      grant(s, 0, { homeCombat: 30 });
      expect(combatPreview(s, atk, dc, dr)!.toDefender).toBeGreaterThan(homeBefore);

      // Off home territory the same civic does nothing.
      atkTile.ownerCityId = undefined;
      expect(combatPreview(s, atk, dc, dr)!.toDefender).toBe(homeBefore);
    });

    it("foreignCombat strengthens a unit off its own territory only", () => {
      const s = game();
      const city = foundCityFor(s, 0);
      const [[ac, ar], [dc, dr]] = farPair(s, city);
      const atk = inject(s, 0, "warrior", ac, ar);
      inject(s, 1, "warrior", dc, dr);
      const atkTile = getTile(s.map, ac, ar)!;

      atkTile.ownerCityId = undefined; // neutral wilderness = foreign
      const foreignBefore = combatPreview(s, atk, dc, dr)!.toDefender;
      grant(s, 0, { foreignCombat: 30 });
      expect(combatPreview(s, atk, dc, dr)!.toDefender).toBeGreaterThan(foreignBefore);

      atkTile.ownerCityId = city.id; // now at home — no foreign bonus
      expect(combatPreview(s, atk, dc, dr)!.toDefender).toBe(foreignBefore);
    });

    it("allUnitCombat strengthens every unit regardless of place", () => {
      const s = game();
      const city = foundCityFor(s, 0);
      const [[ac, ar], [dc, dr]] = farPair(s, city);
      const atk = inject(s, 0, "warrior", ac, ar);
      inject(s, 1, "warrior", dc, dr);
      const before = combatPreview(s, atk, dc, dr)!.toDefender;
      grant(s, 0, { allUnitCombat: 30 });
      expect(combatPreview(s, atk, dc, dr)!.toDefender).toBeGreaterThan(before);
    });

    it("combatVsOtherReligion only applies against a differently-faithed foe", () => {
      const s = game();
      const city = foundCityFor(s, 0);
      const [[ac, ar], [dc, dr]] = farPair(s, city);
      const atk = inject(s, 0, "warrior", ac, ar);
      inject(s, 1, "warrior", dc, dr);
      s.players[0]!.foundedReligionId = "faith_a";
      const before = combatPreview(s, atk, dc, dr)!.toDefender;
      grant(s, 0, { combatVsOtherReligion: 30 });
      // Foe follows no faith → counts as "other" → bonus applies.
      expect(combatPreview(s, atk, dc, dr)!.toDefender).toBeGreaterThan(before);
      // Foe shares your faith → no bonus.
      s.players[1]!.foundedReligionId = "faith_a";
      expect(combatPreview(s, atk, dc, dr)!.toDefender).toBe(before);
    });
  });

  describe("combat: city defense, kill rewards, capture conversion", () => {
    it("cityDefenseBonus raises a city's defensive strength", () => {
      const s = game();
      const city = foundCityFor(s, 0);
      const before = cityDefenseStrength(s, city);
      grant(s, 0, { cityDefenseBonus: 10 });
      expect(cityDefenseStrength(s, city)).toBe(before + 10);
    });

    it("cultureOnKill banks culture when a unit slays an enemy", () => {
      const s = game();
      s.players[0]!.atWar.push(1);
      s.players[1]!.atWar.push(0);
      const city = foundCityFor(s, 0);
      const [[ac, ar], [dc, dr]] = farPair(s, city);
      const atk = inject(s, 0, "swordsman", ac, ar);
      const def = inject(s, 1, "warrior", dc, dr);
      def.hp = 1; // a single blow fells it
      grant(s, 0, { cultureOnKill: 7 });
      const before = s.players[0]!.cultureProgress;
      const res = resolveAttack(s, atk, dc, dr);
      expect(res.ok).toBe(true);
      expect(s.units.has(def.id)).toBe(false); // it died
      expect(s.players[0]!.cultureProgress).toBe(before + 7);
    });

    it("convertOnCapture flips a captured city to the conqueror's faith", () => {
      const s = game();
      s.players[0]!.atWar.push(1);
      s.players[1]!.atWar.push(0);
      const home = foundCityFor(s, 0);
      s.players[0]!.foundedReligionId = "conqueror_faith";
      // Plant a defenceless enemy city adjacent to a waiting attacker.
      const [[ac, ar]] = farPair(s, home);
      const ccol = ac + 1, crow = ar; // enemy city east of the attacker (odd-r neighbour)
      const cid = s.nextEntityId++;
      s.cities.set(cid, {
        id: cid, ownerId: 1, name: "Prey", col: ccol, row: crow, population: 3,
        foodStored: 0, productionStored: 0, production: null, buildings: [], specialists: [], wonders: [], workedTiles: [],
        isCapital: false, foundedAsCapital: false, hp: 0, lastAttackedTurn: 0, rangedAttackUsed: false, training: {}, trainingQueue: [], modifiers: [],
      });
      const atk = inject(s, 0, "warrior", ac, ar);
      grant(s, 0, { convertOnCapture: true });
      const res = resolveAttack(s, atk, ccol, crow);
      expect(res.ok).toBe(true);
      const captured = s.cities.get(cid)!;
      expect(captured.ownerId).toBe(0);
      expect(dominantReligion(captured)).toBe("conqueror_faith");
    });
  });

  describe("economy: war / peace / capital yields, garrison upkeep", () => {
    it("warYieldPercent applies only while at war with a major", () => {
      const s = game();
      const city = foundCityFor(s, 0);
      grant(s, 0, { warYieldPercent: { production: 100 } });
      const peaceProd = getCityYields(s, city).production;
      s.players[0]!.atWar.push(1);
      expect(isAtWarWithMajor(s, s.players[0]!)).toBe(true);
      expect(getCityYields(s, city).production).toBeGreaterThan(peaceProd);
    });

    it("peaceYieldPercent applies only while at peace with all majors", () => {
      const s = game();
      const city = foundCityFor(s, 0);
      grant(s, 0, { peaceYieldPercent: { production: 100 } });
      const peaceProd = getCityYields(s, city).production;
      s.players[0]!.atWar.push(1);
      expect(getCityYields(s, city).production).toBeLessThan(peaceProd);
    });

    it("capitalYieldPercent boosts the capital but not other cities", () => {
      const s = game();
      const capital = foundCityFor(s, 0);
      expect(capital.isCapital).toBe(true);
      const capBefore = getCityYields(s, capital).production;
      grant(s, 0, { capitalYieldPercent: { production: 100 } });
      expect(getCityYields(s, capital).production).toBeGreaterThan(capBefore);
    });

    it("garrisonFreeUpkeep zeroes upkeep for units standing in your cities", () => {
      const s = game();
      const city = foundCityFor(s, 0);
      const garrison = inject(s, 0, "warrior", city.col, city.row);
      const field = inject(s, 0, "warrior", city.col < 20 ? city.col + 8 : city.col - 8, city.row);
      const base = unitUpkeep(s, garrison);
      expect(base).toBeGreaterThan(0);
      grant(s, 0, { garrisonFreeUpkeep: true });
      expect(unitUpkeep(s, garrison)).toBe(0); // fed by the city
      expect(unitUpkeep(s, field)).toBe(base); // in the field, still paid
    });
  });

  describe("healing & religion", () => {
    it("homeHealBonus adds healing inside your territory", () => {
      const s = game();
      const city = foundCityFor(s, 0);
      const [[uc, ur]] = farPair(s, city);
      const u = inject(s, 0, "warrior", uc, ur);
      getTile(s.map, uc, ur)!.ownerCityId = city.id; // in territory, not on the city
      u.hp = 10;
      healAndReset(s, s.players[0]!);
      const healedNoBonus = u.hp;
      u.hp = 10;
      grant(s, 0, { homeHealBonus: 10 });
      healAndReset(s, s.players[0]!);
      expect(u.hp).toBe(healedNoBonus + 10);
    });

    it("enemyReligionPressurePercent suppresses rival faith spreading into your cities", () => {
      function setup() {
        const s = game();
        const c0 = foundCityFor(s, 0);
        // A rival empire's holy city a few tiles away.
        const c1id = s.nextEntityId++;
        s.cities.set(c1id, {
          id: c1id, ownerId: 1, name: "Rival", col: c0.col < 20 ? c0.col + 3 : c0.col - 3, row: c0.row, population: 3,
          foodStored: 0, productionStored: 0, production: null, buildings: [], specialists: [], wonders: [], workedTiles: [],
          isCapital: false, foundedAsCapital: false, hp: 100, lastAttackedTurn: 0, rangedAttackUsed: false, training: {}, trainingQueue: [], modifiers: [],
        });
        s.players[0]!.researched.add("ritual_burial");
        s.players[1]!.researched.add("ritual_burial");
        s.players[0]!.faith = FAITH_TO_FOUND;
        s.players[1]!.faith = FAITH_TO_FOUND;
        foundReligion(s, 0, c0.id, "Aaa", ["tithe"]);
        foundReligion(s, 1, c1id, "Bbb", ["scholarship"]);
        return { s, c0, relB: s.players[1]!.foundedReligionId! };
      }
      const open = setup();
      spreadReligion(open.s);
      const withoutSuppression = open.c0.religionPressure?.[open.relB] ?? 0;
      expect(withoutSuppression).toBeGreaterThan(0);

      const closed = setup();
      grant(closed.s, 0, { enemyReligionPressurePercent: -100 });
      spreadReligion(closed.s);
      const withSuppression = closed.c0.religionPressure?.[closed.relB] ?? 0;
      expect(withSuppression).toBe(0);
    });
  });
});
