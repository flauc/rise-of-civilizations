import { describe, it, expect } from "vitest";
import { createGame } from "./setup";
import { beginTurn, applyCommand } from "./commands";
import {
  canFoundReligion, foundReligion, spreadReligion, FAITH_TO_FOUND,
  buyReligiousUnit, evangelize, purgeHeresy, boardTradeRoute, processTransit,
  dominantReligion, transitTurns,
} from "./religion";
import { playerEffects } from "./civs";
import { citiesOf, unitsOf, type GameState, type City } from "./state";

function gameWithCity() {
  const s = createGame({ seed: "rel-test", cols: 40, rows: 28, barbarians: false, humanSlots: 2 });
  beginTurn(s);
  const settler = unitsOf(s, 0).find((u) => u.type === "settler")!;
  applyCommand(s, { type: "foundCity", unitId: settler.id });
  s.players[0]!.researched.add("ritual_burial"); // religion is gated behind Ritual & Burial
  return s;
}

/** Plant a neutral city at an offset from a reference city, returning its id. */
function plantCity(s: GameState, ref: City, dCol: number, owner = 0): number {
  const id = s.nextEntityId++;
  s.cities.set(id, {
    id, ownerId: owner, name: "Far", col: ref.col + dCol, row: ref.row, population: 1,
    foodStored: 0, productionStored: 0, production: null, buildings: [], specialists: [], wonders: [], workedTiles: [],
    isCapital: false, foundedAsCapital: false, hp: 100, lastAttackedTurn: 0, rangedAttackUsed: false, training: {}, trainingQueue: [], modifiers: [],
  });
  return id;
}

describe("religion", () => {
  it("founds a religion once enough faith is stored; beliefs apply to the founder", () => {
    const s = gameWithCity();
    expect(canFoundReligion(s, 0)).toBe(false); // no faith yet
    s.players[0]!.faith = FAITH_TO_FOUND;
    const city = citiesOf(s, 0)[0]!;
    expect(canFoundReligion(s, 0)).toBe(true);
    const res = foundReligion(s, 0, city.id, "Sun Cult", ["scholarship", "tithe"]);
    expect(res.ok).toBe(true);
    expect(s.religions).toHaveLength(1);
    expect(city.religion).toBe(s.religions[0]!.id);
    expect(s.players[0]!.foundedReligionId).toBe(s.religions[0]!.id);
    // scholarship (+15% science) belief is now in the founder's effects
    expect(playerEffects(s, 0).yieldPercent?.science ?? 0).toBeGreaterThanOrEqual(15);
  });

  it("spreads from a holy city to a nearby city", () => {
    const s = gameWithCity();
    const holy = citiesOf(s, 0)[0]!;
    s.players[0]!.faith = FAITH_TO_FOUND;
    foundReligion(s, 0, holy.id, "Sun Cult", []);
    // Plant a neutral city two tiles away.
    const nid = s.nextEntityId++;
    s.cities.set(nid, {
      id: nid, ownerId: 0, name: "Nearby", col: holy.col + 2, row: holy.row, population: 1,
      foodStored: 0, productionStored: 0, production: null, buildings: [], specialists: [], wonders: [], workedTiles: [],
      isCapital: false, foundedAsCapital: false, hp: 100, lastAttackedTurn: 0, rangedAttackUsed: false, training: {}, trainingQueue: [], modifiers: [],
    });
    expect(s.cities.get(nid)!.religion).toBeUndefined();
    spreadReligion(s);
    expect(s.cities.get(nid)!.religion).toBe(s.religions[0]!.id);
  });
});

describe("religion — missionaries, inquisitors, trade & fast-travel", () => {
  function founded() {
    const s = gameWithCity();
    const holy = citiesOf(s, 0)[0]!;
    s.players[0]!.faith = FAITH_TO_FOUND;
    foundReligion(s, 0, holy.id, "Sun Cult", []);
    return { s, holy, relId: s.religions[0]!.id };
  }

  it("buys a missionary with faith and evangelizes a distant city", () => {
    const { s, holy, relId } = founded();
    const far = s.cities.get(plantCity(s, holy, 12))!; // far beyond proximity range
    s.players[0]!.faith = 200;
    expect(applyCommand(s, { type: "buyReligiousUnit", cityId: holy.id, unit: "missionary" }, 0).ok).toBe(true);
    const miss = unitsOf(s, 0).find((u) => u.type === "missionary")!;
    expect(miss.religiousCharges).toBe(3);
    miss.col = far.col;
    miss.row = far.row; // walk it onto the target (test shortcut)
    expect(applyCommand(s, { type: "evangelize", unitId: miss.id, cityId: far.id }, 0).ok).toBe(true);
    expect(far.religion).toBe(relId);
    expect(s.units.get(miss.id)!.religiousCharges).toBe(2);
  });

  it("an inquisitor purges a rival faith from your own city", () => {
    const { s, holy } = founded();
    const city = citiesOf(s, 0)[0]!;
    city.religionPressure = { rel_other: 50, [s.religions[0]!.id]: 10 };
    city.religion = "rel_other";
    s.players[0]!.faith = 200;
    applyCommand(s, { type: "buyReligiousUnit", cityId: holy.id, unit: "inquisitor" }, 0);
    const inq = unitsOf(s, 0).find((u) => u.type === "inquisitor")!;
    inq.col = city.col;
    inq.row = city.row;
    expect(applyCommand(s, { type: "purgeHeresy", unitId: inq.id, cityId: city.id }, 0).ok).toBe(true);
    expect(city.religionPressure!["rel_other"]).toBeUndefined();
    expect(dominantReligion(city)).toBe(s.religions[0]!.id);
  });

  it("trade routes carry faith beyond proximity range, both ways", () => {
    const { s, holy, relId } = founded();
    const far = s.cities.get(plantCity(s, holy, 14))!;
    s.tradeRoutes.push({ id: s.nextEntityId++, ownerId: 0, fromCityId: holy.id, toCityId: far.id, path: [`${holy.col},${holy.row}`, `${far.col},${far.row}`] });
    expect(far.religionPressure?.[relId] ?? 0).toBe(0);
    spreadReligion(s);
    expect((far.religionPressure?.[relId] ?? 0)).toBeGreaterThan(0);
    expect(far.religion).toBe(relId);
  });

  it("a religious unit fast-travels along a trade route", () => {
    const { s, holy } = founded();
    const far = s.cities.get(plantCity(s, holy, 14))!;
    const route = { id: s.nextEntityId++, ownerId: 0, fromCityId: holy.id, toCityId: far.id, path: ["a", "b", "c", "d", "e", "f"] };
    s.tradeRoutes.push(route);
    s.players[0]!.faith = 200;
    applyCommand(s, { type: "buyReligiousUnit", cityId: holy.id, unit: "missionary" }, 0);
    const miss = unitsOf(s, 0).find((u) => u.type === "missionary")!;
    expect(applyCommand(s, { type: "boardTradeRoute", unitId: miss.id, routeId: route.id }, 0).ok).toBe(true);
    expect(s.units.get(miss.id)!.inTransit?.exitCityId).toBe(far.id);
    s.turn += transitTurns(s, route) + 1;
    processTransit(s, 0);
    const arrived = s.units.get(miss.id)!;
    expect(arrived.inTransit).toBeUndefined();
    expect(arrived.col).toBe(far.col);
    expect(arrived.row).toBe(far.row);
  });
});
