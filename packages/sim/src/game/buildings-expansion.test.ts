import { describe, it, expect } from "vitest";
import { createGame } from "./setup";
import { beginTurn, applyCommand } from "./commands";
import { citiesOf, unitsOf, playerById, makeUnit, type City, type GameState, type Unit } from "./state";
import { BUILDING_DEFS, getBuildingDef, sumBuildingEffects, type BuildingId } from "./content";
import { startTraining, advanceTraining, trainingTimeInCity } from "./training";
import { processCity, autoAssignCitizens, cityFoodGrowth, foodToGrow } from "./economy";
import { infirmaryHeal, healAndReset } from "./combat";
import { onEnemyDeathNearArch, unitMorale } from "./morale";

const NEW_BUILDINGS: BuildingId[] = [
  "drill_yard", "armoury", "arsenal",
  "castle", "ballista_towers", "bombard_tower",
  "storehouse", "infirmary", "triumphal_arch", "beacon_tower",
];

/** A one-city game owned by player 0 (city grown/tech-forced by the caller). */
function foundedGame(seed: string): { s: GameState; city: City } {
  const s = createGame({ seed, cols: 40, rows: 28, barbarians: false, humanSlots: 1, playerCount: 1 });
  beginTurn(s);
  const settler = unitsOf(s, 0).find((u) => u.type === "settler")!;
  applyCommand(s, { type: "foundCity", unitId: settler.id });
  return { s, city: citiesOf(s, 0)[0]! };
}

function bareGame(seed: string): GameState {
  const s = createGame({ seed, cols: 30, rows: 20, barbarians: false });
  s.units.clear();
  for (const a of s.players) for (const b of s.players) {
    if (a.id !== b.id && !a.atWar.includes(b.id)) a.atWar.push(b.id);
  }
  return s;
}

let cityCounter = 5000;
function makeCity(s: GameState, ownerId: number, col: number, row: number, buildings: BuildingId[] = []): City {
  const id = cityCounter++;
  const city = {
    id, ownerId, name: "Test", col, row, population: 4,
    foodStored: 0, productionStored: 0, production: null, buildings: [...buildings],
    specialists: [], wonders: [], workedTiles: [], isCapital: true, foundedAsCapital: true,
    hp: 100, lastAttackedTurn: 0, rangedAttacksUsed: 0, training: {}, trainingQueue: [], modifiers: [],
  };
  s.cities.set(id, city as never);
  return s.cities.get(id)!;
}

function place(s: GameState, owner: number, type: Unit["type"], col: number, row: number): Unit {
  const id = s.nextEntityId++;
  const u = makeUnit(id, owner, type, col, row);
  s.units.set(id, u);
  return u;
}

describe("Buildings Expansion — content sanity", () => {
  it("every new building has a reqTech, positive cost, and structured effects", () => {
    for (const id of NEW_BUILDINGS) {
      const def = BUILDING_DEFS[id];
      expect(def, id).toBeDefined();
      expect(def.reqTech, id).toBeTruthy();
      expect(def.cost, id).toBeGreaterThan(0);
      expect(def.effects, id).toBeDefined();
    }
  });

  it("reqBuilding prerequisites reference existing buildings", () => {
    for (const id of NEW_BUILDINGS) {
      const req = BUILDING_DEFS[id].reqBuilding;
      if (req) expect(getBuildingDef(req), `${id} → ${req}`).toBeDefined();
    }
    expect(BUILDING_DEFS.castle.reqBuilding).toBe("walls");
    expect(BUILDING_DEFS.ballista_towers.reqBuilding).toBe("walls");
    expect(BUILDING_DEFS.bombard_tower.reqBuilding).toBe("castle");
  });
});

describe("Buildings Expansion — military production", () => {
  it("Drill Yard and Arsenal stack their training speed-ups", () => {
    expect(sumBuildingEffects(["drill_yard"]).trainTimePercent).toBe(-15);
    expect(sumBuildingEffects(["drill_yard", "arsenal"]).trainTimePercent).toBe(-30);
    const { s, city } = foundedGame("drill");
    city.population = 6;
    city.training.barracks = 1;
    const slow = trainingTimeInCity(s, city, "swordsman");
    city.buildings.push("drill_yard", "arsenal");
    const fast = trainingTimeInCity(s, city, "swordsman");
    expect(fast).toBeLessThanOrEqual(slow);
    expect(fast).toBeGreaterThanOrEqual(1); // never below one turn
  });

  it("an Armoury adds starting XP and an Arsenal adds starting morale to trained units", () => {
    const { s, city } = foundedGame("armoury");
    const player = playerById(s, 0)!;
    s.units.clear(); // free the tiles around the city so every recruit can be placed
    city.population = 8;
    city.training.barracks = 1; // tier 1 = 0 xp / 0 morale bonus on its own

    const trainOne = (): Unit => {
      const before = new Set(unitsOf(s, 0).map((u) => u.id));
      expect(startTraining(s, city, "warrior").ok).toBe(true);
      const order = city.trainingQueue[city.trainingQueue.length - 1]!;
      order.turnsLeft = 1;
      advanceTraining(s, city, player);
      const u = unitsOf(s, 0).find((x) => !before.has(x.id))!;
      s.units.delete(u.id); // clear the tile for the next recruit (keep the reference)
      return u;
    };

    const plain = trainOne();
    city.buildings.push("armoury");
    const armed = trainOne();
    expect(armed.xp).toBe(plain.xp + 10);

    city.buildings.push("arsenal");
    const proud = trainOne();
    expect(unitMorale(proud)).toBe(unitMorale(armed) + 10);
  });
});

describe("Buildings Expansion — Storehouse", () => {
  it("carries 30% of the next citizen forward on growth (above natural overflow)", () => {
    for (const withStore of [false, true]) {
      const { s, city } = foundedGame("storehouse");
      if (withStore) city.buildings.push("storehouse");
      const player = playerById(s, 0)!;
      autoAssignCitizens(s, city, city.autoMode);
      const delta = cityFoodGrowth(s, city);
      expect(delta).toBeGreaterThan(0); // a healthy, growing city
      // Cross the growth threshold with exactly zero natural overflow.
      city.foodStored = foodToGrow(city.population) - delta;
      const popBefore = city.population;
      const newNeed = foodToGrow(popBefore + 1);
      processCity(s, city, player);
      expect(city.population).toBe(popBefore + 1);
      if (withStore) {
        expect(city.foodStored).toBeCloseTo(0.3 * newNeed, 5);
      } else {
        expect(city.foodStored).toBe(0); // no reserve: growth restarts from empty
      }
    }
  });
});

describe("Buildings Expansion — Infirmary aura", () => {
  it("heals friendly units within radius 2, and does not stack across infirmaries", () => {
    const s = bareGame("infirmary");
    makeCity(s, 0, 10, 10, ["infirmary"]);
    const near = place(s, 0, "warrior", 12, 10); // distance 2 — in range
    const far = place(s, 0, "warrior", 14, 10); // distance 4 — out of range
    expect(infirmaryHeal(s, 0, near)).toBe(5);
    expect(infirmaryHeal(s, 0, far)).toBe(0);

    // A second nearby infirmary does not double the aura.
    makeCity(s, 0, 10, 12, ["infirmary"]);
    const between = place(s, 0, "warrior", 10, 11); // within radius of both
    expect(infirmaryHeal(s, 0, between)).toBe(5);

    // Integration: the near unit heals 5 more than the far one over a turn.
    near.hp = 50; far.hp = 50;
    healAndReset(s, playerById(s, 0)!);
    expect(near.hp - far.hp).toBe(5);
  });

  it("only heals the owner's units", () => {
    const s = bareGame("infirmary2");
    makeCity(s, 0, 10, 10, ["infirmary"]);
    const enemy = place(s, 1, "warrior", 11, 10); // enemy unit next to my infirmary
    expect(infirmaryHeal(s, 1, enemy)).toBe(0);
    expect(infirmaryHeal(s, 0, enemy)).toBe(5); // (owner-0 aura would reach the tile)
  });
});

describe("Buildings Expansion — Triumphal Arch", () => {
  it("rallies the owner's nearby units when an enemy dies within radius 3", () => {
    const s = bareGame("arch");
    makeCity(s, 0, 10, 10, ["triumphal_arch"]);
    const friend = place(s, 0, "warrior", 12, 10); // dist 2 from the arch
    const farFriend = place(s, 0, "warrior", 15, 10); // dist 5 — out of range
    const enemy = place(s, 1, "warrior", 11, 10); // dist 1 from the arch
    const m0 = unitMorale(friend);
    const mFar = unitMorale(farFriend);
    onEnemyDeathNearArch(s, enemy);
    expect(unitMorale(friend)).toBe(m0 + 5);
    expect(unitMorale(farFriend)).toBe(mFar); // beyond radius 3
  });

  it("does not fire on a friendly death, nor for a non-owner", () => {
    const s = bareGame("arch2");
    makeCity(s, 0, 10, 10, ["triumphal_arch"]);
    const mine = place(s, 0, "warrior", 11, 10);
    const third = place(s, 2, "warrior", 12, 10); // another civ near my arch
    const m0 = unitMorale(mine);
    const t0 = unitMorale(third);
    // A friendly unit dying near my own arch grants nothing (not an enemy death).
    const ownDead = place(s, 0, "warrior", 10, 11);
    onEnemyDeathNearArch(s, ownDead);
    expect(unitMorale(mine)).toBe(m0);
    // An enemy death near my arch rallies MY units but not the third party's.
    const enemy = place(s, 1, "warrior", 11, 11);
    onEnemyDeathNearArch(s, enemy);
    expect(unitMorale(mine)).toBe(m0 + 5);
    expect(unitMorale(third)).toBe(t0);
  });
});
