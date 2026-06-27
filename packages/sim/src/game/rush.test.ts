import { describe, it, expect } from "vitest";
import { getTile } from "@roc/shared";
import { createGame } from "./setup";
import { beginTurn, applyCommand } from "./commands";
import { advanceWorks, startWork } from "./works";
import { processCity } from "./economy";
import { UNIT_DEFS } from "./content";
import {
  rushCurrencies,
  cityRushCost,
  workRushCost,
  canRushCity,
  rushCity,
} from "./rush";
import { citiesOf, unitsOf, playerById, type City } from "./state";

function gameWithCity(): { s: ReturnType<typeof createGame>; city: City } {
  const s = createGame({ seed: "rush-test", cols: 40, rows: 28, barbarians: false, humanSlots: 1, playerCount: 1 });
  beginTurn(s);
  const settler = unitsOf(s, 0).find((u) => u.type === "settler")!;
  applyCommand(s, { type: "foundCity", unitId: settler.id });
  const city = citiesOf(s, 0)[0]!;
  city.population = 5;
  return { s, city };
}

function grasslandTile(s: ReturnType<typeof createGame>, city: City, col: number, row: number) {
  const t = getTile(s.map, col, row)!;
  t.terrain = "grassland";
  t.improvement = undefined;
  t.improvementLevel = undefined;
  t.ownerCityId = city.id;
  return t;
}

describe("rush production", () => {
  it("gold is always a rush currency; faith/culture need a perk", () => {
    const { s } = gameWithCity();
    expect(rushCurrencies(s, 0)).toEqual(["gold"]);

    // A civics policy unlocks culture rushing.
    playerById(s, 0)!.policies.push("corvee");
    expect(rushCurrencies(s, 0)).toContain("culture");

    // A founded religion with the belief unlocks faith rushing.
    const p = playerById(s, 0)!;
    p.foundedReligionId = "test_faith";
    s.religions.push({ id: "test_faith", name: "Test", founderId: 0, holyCityId: 0, beliefs: ["labor_of_devotion"] });
    expect(rushCurrencies(s, 0)).toContain("faith");
  });

  it("prices a city item by remaining hammers and completes it on processing", () => {
    const { s, city } = gameWithCity();
    const p = playerById(s, 0)!;
    p.gold = 10000;
    city.production = { kind: "unit", id: "warrior" };
    city.productionStored = 0;

    const cost = UNIT_DEFS["warrior"].cost;
    expect(cityRushCost(city, "gold")).toBe(Math.ceil(cost * 4));

    const before = unitsOf(s, 0).length;
    const goldBefore = p.gold;
    const res = rushCity(s, 0, city.id, "gold");
    expect(res.ok).toBe(true);
    expect(p.gold).toBe(goldBefore - res.cost!);
    expect(city.productionStored).toBeGreaterThanOrEqual(cost);

    processCity(s, city, p);
    expect(unitsOf(s, 0).length).toBe(before + 1);
    expect(city.production).toBeNull();
  });

  it("rejects rushing a project, an empty queue, or with too little gold", () => {
    const { s, city } = gameWithCity();
    const p = playerById(s, 0)!;

    city.production = null;
    expect(cityRushCost(city, "gold")).toBeNull();
    expect(canRushCity(s, 0, city.id, "gold").ok).toBe(false);

    city.production = { kind: "project", id: "coinage" };
    expect(cityRushCost(city, "gold")).toBeNull();

    city.production = { kind: "unit", id: "warrior" };
    city.productionStored = 0;
    p.gold = 1;
    expect(canRushCity(s, 0, city.id, "gold").ok).toBe(false);
  });

  it("blocks faith/culture rushing without the perk", () => {
    const { s, city } = gameWithCity();
    playerById(s, 0)!.faith = 10000;
    city.production = { kind: "unit", id: "warrior" };
    city.productionStored = 0;
    expect(canRushCity(s, 0, city.id, "faith").ok).toBe(false);
    expect(rushCity(s, 0, city.id, "faith").ok).toBe(false);
  });

  it("rushes a tile work to completion", () => {
    const { s, city } = gameWithCity();
    const p = playerById(s, 0)!;
    p.gold = 10000;
    const tile = grasslandTile(s, city, city.col + 1, city.row);
    const work = startWork(s, 0, "farm", tile.col, tile.row);
    expect(work.ok).toBe(true);

    const cost = workRushCost(s.works.find((w) => w.id === work.workId)!, "gold");
    expect(cost).not.toBeNull();
    const goldBefore = p.gold;
    expect(applyCommand(s, { type: "rushWork", workId: work.workId!, currency: "gold" }).ok).toBe(true);
    expect(p.gold).toBe(goldBefore - cost!);

    advanceWorks(s, 0);
    expect(tile.improvement).toBe("farm");
    expect(s.works.length).toBe(0);
  });
});
