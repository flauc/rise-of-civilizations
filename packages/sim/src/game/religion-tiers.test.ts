import { describe, it, expect } from "vitest";
import { createGame } from "./setup";
import { beginTurn, applyCommand } from "./commands";
import {
  foundReligion, FAITH_TO_FOUND, availablePerks, pendingPerkPicks, takenPerkIds,
  canUpgradeReligion, upgradeReligion, pickReligionPerk, moveHolyCity,
  majorityFollowerCount, MOVE_HOLY_CITY_COST,
} from "./religion";
import { playerEffects, cityEffects } from "./civs";
import { availableTraining, canStartTraining, startTraining, advanceTraining } from "./training";
import { healAndReset, unitMaxHp } from "./combat";
import { RELIGION_UNIT_KITS, religionTierForUnit, cityFollowsUnitFaith } from "./religion-units";
import { RELIGIONS, RELIGION_KITS, getReligionKit } from "@roc/data";
import { citiesOf, makeUnit, playerById, unitsOf, type City, type GameState } from "./state";

function gameWithCity() {
  const s = createGame({ seed: "rel-tier", cols: 40, rows: 28, barbarians: false, humanSlots: 2 });
  beginTurn(s);
  const settler = unitsOf(s, 0).find((u) => u.type === "settler")!;
  applyCommand(s, { type: "foundCity", unitId: settler.id });
  s.players[0]!.researched.add("ritual_burial");
  return s;
}

function plantCity(s: GameState, ref: City, dCol: number, owner = 0): City {
  const id = s.nextEntityId++;
  const city: City = {
    id, ownerId: owner, name: `City${id}`, col: ref.col + dCol, row: ref.row, population: 3,
    foodStored: 0, productionStored: 0, production: null, buildings: [], specialists: [], wonders: [], workedTiles: [],
    isCapital: false, foundedAsCapital: false, hp: 100, lastAttackedTurn: 0, rangedAttackUsed: false, training: {}, trainingQueue: [], modifiers: [],
  };
  s.cities.set(id, city);
  return city;
}

/** Found the first religion (name pool starts with Christianity) with one perk. */
function founded(s: GameState, perk = "tithe") {
  const holy = citiesOf(s, 0)[0]!;
  s.players[0]!.faith = FAITH_TO_FOUND;
  const res = foundReligion(s, 0, holy.id, "Christianity", [perk]);
  expect(res.ok).toBe(true);
  return { holy, religion: s.religions[0]! };
}

describe("religion tiers & perks", () => {
  it("founds at tier 1 with ONE tier-1 perk and the preset benefit applied", () => {
    const s = gameWithCity();
    const { religion } = founded(s);
    expect(religion.tier).toBe(1);
    expect(religion.beliefs).toEqual(["tithe"]);
    // Christianity's preset (The Great Commission: +10% faith) reaches the founder.
    const eff = playerEffects(s, 0);
    expect(eff.yieldPercent?.faith ?? 0).toBeGreaterThanOrEqual(10);
    expect(eff.yieldPercent?.gold ?? 0).toBeGreaterThanOrEqual(15); // the tithe perk
  });

  it("rejects a founding perk another religion already claimed", () => {
    const s = gameWithCity();
    founded(s, "tithe");
    // Player 1 founds second religion trying to take the same perk.
    beginTurn(s); // not required, but keeps state coherent
    const settler = unitsOf(s, 1).find((u) => u.type === "settler")!;
    applyCommand(s, { type: "foundCity", unitId: settler.id }, 1);
    s.players[1]!.researched.add("ritual_burial");
    s.players[1]!.faith = FAITH_TO_FOUND;
    const city = citiesOf(s, 1)[0]!;
    expect(foundReligion(s, 1, city.id, "Islam", ["tithe"]).ok).toBe(true);
    expect(s.religions[1]!.beliefs).toEqual([]); // duplicate perk filtered out
    expect(takenPerkIds(s).has("tithe")).toBe(true);
  });

  it("gates tier upgrades on faith AND follower cities, then grants a perk pick", () => {
    const s = gameWithCity();
    const { holy, religion } = founded(s);
    s.players[0]!.faith = 10_000;
    // Only the holy city follows so far — tier 2 needs 3 follower cities.
    expect(majorityFollowerCount(s, religion.id)).toBe(1);
    expect(canUpgradeReligion(s, 0).ok).toBe(false);
    for (const d of [2, 4]) {
      const c = plantCity(s, holy, d);
      c.religionPressure = { [religion.id]: 100 };
    }
    expect(majorityFollowerCount(s, religion.id)).toBe(3);
    expect(canUpgradeReligion(s, 0).ok).toBe(true);
    expect(upgradeReligion(s, 0).ok).toBe(true);
    expect(religion.tier).toBe(2);
    expect(s.players[0]!.faith).toBe(10_000 - 250);
    expect(pendingPerkPicks(s, religion.id)).toBe(1);
    // The pick may come from tier 1 OR tier 2 — but not above.
    const ids = availablePerks(s, religion.id).map((b) => b.id);
    expect(ids).toContain("scholarship"); // tier 1 still allowed
    expect(ids).toContain("monastic_orders"); // tier 2 now allowed
    expect(ids).not.toContain("zealotry"); // tier 3 locked
    expect(pickReligionPerk(s, 0, "zealotry").ok).toBe(false);
    expect(pickReligionPerk(s, 0, "monastic_orders").ok).toBe(true);
    expect(pendingPerkPicks(s, religion.id)).toBe(0);
    expect(pickReligionPerk(s, 0, "scholarship").ok).toBe(false); // pick spent
  });

  it("moves the holy capital to a follower city for faith", () => {
    const s = gameWithCity();
    const { holy, religion } = founded(s);
    const other = plantCity(s, holy, 3);
    s.players[0]!.faith = MOVE_HOLY_CITY_COST;
    // Not yet a follower — refused.
    expect(moveHolyCity(s, 0, other.id).ok).toBe(false);
    other.religionPressure = { [religion.id]: 100 };
    expect(moveHolyCity(s, 0, other.id).ok).toBe(true);
    expect(religion.holyCityId).toBe(other.id);
    expect(s.players[0]!.faith).toBe(0);
  });

  it("applies the religion's capital bonus to the holy city only", () => {
    const s = gameWithCity();
    const { holy } = founded(s);
    // Christianity's capital bonus: Pilgrim Roads, +15% gold in the holy city.
    const eff = cityEffects(s, holy);
    expect(eff.yieldPercent?.gold ?? 0).toBeGreaterThanOrEqual(15);
    const other = plantCity(s, holy, 3);
    expect(cityEffects(s, other).yieldPercent?.gold ?? 0).toBe(0);
  });
});

describe("religion unique units", () => {
  it("defines a kit and artwork identity for every religion", () => {
    expect(RELIGION_KITS).toHaveLength(RELIGIONS.length);
    const kitReligions = new Set(Object.values(RELIGION_UNIT_KITS).map((k) => k.religionId));
    for (const r of RELIGIONS) {
      expect(getReligionKit(r.id), `kit for ${r.id}`).toBeTruthy();
      expect(kitReligions.has(r.id), `unit kit for ${r.id}`).toBe(true);
    }
  });

  it("trains the faith's unit only in a follower city with a Temple", () => {
    const s = gameWithCity();
    const { holy } = founded(s); // Christianity → the Evangelist
    s.players[0]!.researched.add("writing");
    holy.population = 3;
    expect(cityFollowsUnitFaith(s, holy, "evangelist")).toBe(true);
    // No temple yet.
    expect(availableTraining(s, s.players[0]!, holy)).not.toContain("evangelist");
    expect(canStartTraining(s, holy, "evangelist").ok).toBe(false);
    holy.buildings.push("temple");
    expect(availableTraining(s, s.players[0]!, holy)).toContain("evangelist");
    // Another faith's unit stays untrainable here.
    expect(availableTraining(s, s.players[0]!, holy)).not.toContain("ghazi_warrior");
    expect(startTraining(s, holy, "evangelist").ok).toBe(true);
    // One holy unit at a time.
    expect(canStartTraining(s, holy, "evangelist").error).toMatch(/already training/);
    // Let it finish training and muster.
    for (let i = 0; i < 30 && !unitsOf(s, 0).some((u) => u.type === "evangelist"); i++) {
      advanceTraining(s, holy, s.players[0]!);
    }
    expect(unitsOf(s, 0).some((u) => u.type === "evangelist")).toBe(true);
  });

  it("scales aura magnitudes and strength with the religion's tier", () => {
    const s = gameWithCity();
    const { religion } = founded(s);
    const uid = s.nextEntityId++;
    s.units.set(uid, makeUnit(uid, 0, "evangelist", 5, 5));
    const evangelist = s.units.get(uid)!;
    expect(religionTierForUnit(s, evangelist)).toBe(1);
    religion.tier = 5;
    expect(religionTierForUnit(s, evangelist)).toBe(5);
  });

  it("heals adjacent allies via the Evangelist's aura at turn start", () => {
    const s = gameWithCity();
    founded(s);
    const uid = s.nextEntityId++;
    s.units.set(uid, makeUnit(uid, 0, "evangelist", 20, 10));
    const wid = s.nextEntityId++;
    s.units.set(wid, makeUnit(wid, 0, "warrior", 21, 10));
    const warrior = s.units.get(wid)!;
    warrior.hp = 50;
    const far = s.nextEntityId++;
    s.units.set(far, makeUnit(far, 0, "warrior", 30, 20));
    const farWarrior = s.units.get(far)!;
    farWarrior.hp = 50;
    healAndReset(s, playerById(s, 0)!);
    const base = farWarrior.hp - 50; // ordinary field healing
    expect(warrior.hp - 50).toBe(base + 5); // +5 from the aura at tier 1
    expect(warrior.hp).toBeLessThanOrEqual(unitMaxHp(warrior));
  });

  it("forbids the Ahimsa Ascetic from attacking", () => {
    const s = gameWithCity();
    const uid = s.nextEntityId++;
    s.units.set(uid, makeUnit(uid, 0, "ahimsa_ascetic", 20, 10));
    const enemyId = s.nextEntityId++;
    s.units.set(enemyId, makeUnit(enemyId, 1, "warrior", 21, 10));
    s.players[0]!.atWar.push(1);
    s.players[1]!.atWar.push(0);
    const res = applyCommand(s, { type: "attack", attackerId: uid, col: 21, row: 10 }, 0);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/refuses violence/);
  });
});
