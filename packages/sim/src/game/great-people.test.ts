import { describe, expect, it } from "vitest";
import { getGreatPerson } from "@roc/data";
import { createGame } from "./setup";
import { serializeState, deserializeState } from "./serialize";
import { playerById, unitsOf, type City } from "./state";
import {
  accrueGreatPeople,
  activateGreatPerson,
  cityGreatPersonPoints,
  greatPersonThreshold,
  nextAvailableFigure,
  playerGreatPersonPerTurn,
} from "./great-people";

const newGame = () =>
  createGame({ cols: 12, rows: 12, seed: "gp-test", playerCount: 1, humanSlots: 1, barbarians: false });

function addCity(state: ReturnType<typeof newGame>, ownerId: number, buildings: string[], isCapital: boolean): City {
  const id = state.nextEntityId++;
  const city: City = {
    id,
    ownerId,
    name: `City${id}`,
    col: 1,
    row: 1,
    population: 1,
    foodStored: 0,
    productionStored: 0,
    production: null,
    buildings: buildings as City["buildings"],
    specialists: [],
    wonders: [],
    workedTiles: [],
    isCapital,
    foundedAsCapital: isCapital,
    hp: 100,
    lastAttackedTurn: 0,
    rangedAttackUsed: false,
    modifiers: [],
  };
  state.cities.set(id, city);
  return city;
}

describe("great people: point sources", () => {
  it("buildings and the capital seat grant class points", () => {
    const city = addCity(newGame(), 0, ["library", "barracks"], true);
    const pts = cityGreatPersonPoints(city);
    expect(pts.scientist).toBe(2); // library
    expect(pts.general).toBe(2); // barracks
    expect(pts.statesman).toBe(2); // capital seat of government
  });

  it("sums per-turn points across all of a player's cities", () => {
    const state = newGame();
    playerById(state, 0)!.researched.add("writing"); // unlocks civics -> statesman counts
    addCity(state, 0, ["library"], true);
    addCity(state, 0, ["academy"], false);
    const perTurn = playerGreatPersonPerTurn(state, 0);
    expect(perTurn.scientist).toBe(5); // 2 + 3
    expect(perTurn.statesman).toBe(2); // only the capital
  });

  it("withholds capital statesman points until civics are unlocked", () => {
    const state = newGame();
    const player = playerById(state, 0)!;
    addCity(state, 0, ["library"], true);
    expect(player.researched.has("writing")).toBe(false);
    // Civics locked: the seat-of-government statesman points are withheld.
    expect(playerGreatPersonPerTurn(state, 0).statesman).toBeUndefined();
    // Researching writing unlocks civics and starts the statesman pool.
    player.researched.add("writing");
    expect(playerGreatPersonPerTurn(state, 0).statesman).toBe(2);
  });
});

describe("great people: thresholds", () => {
  it("rises with each figure already earned of that class", () => {
    expect(greatPersonThreshold(0)).toBe(60);
    expect(greatPersonThreshold(1)).toBe(110);
    expect(greatPersonThreshold(2)).toBe(160);
  });
});

describe("great people: recruitment", () => {
  it("recruits the earliest-era figure when a pool fills", () => {
    const state = newGame();
    const player = playerById(state, 0)!;
    player.greatPeoplePoints.scientist = 60;
    accrueGreatPeople(state, player);
    // Archimedes is the first scientist in the roster.
    expect(player.greatPeople).toContain("archimedes");
    expect(state.recruitedGreatPeople).toContain("archimedes");
    // Pool drained by the threshold; lifetime count incremented.
    expect(player.greatPeoplePoints.scientist).toBe(0);
    expect(player.greatPeopleEarned.scientist).toBe(1);
  });

  it("a figure is globally unique — once taken it is skipped", () => {
    const state = newGame();
    const player = playerById(state, 0)!;
    state.recruitedGreatPeople.push("archimedes");
    const next = nextAvailableFigure(state, "scientist");
    expect(next?.id).not.toBe("archimedes");
    expect(next?.cls).toBe("scientist");
  });

  it("does not recruit when no figures of a class remain", () => {
    const state = newGame();
    const player = playerById(state, 0)!;
    // Exhaust every scientist globally.
    for (const g of state.recruitedGreatPeople) void g;
    nextAvailableFigure(state, "scientist"); // sanity
    let guard = 0;
    while (nextAvailableFigure(state, "scientist") && guard++ < 99) {
      state.recruitedGreatPeople.push(nextAvailableFigure(state, "scientist")!.id);
    }
    player.greatPeoplePoints.scientist = 9999;
    accrueGreatPeople(state, player);
    expect(player.greatPeople).toHaveLength(0);
  });

  it("barbarians never earn Great People", () => {
    const state = createGame({ cols: 12, rows: 12, seed: "gp-barb", playerCount: 1, humanSlots: 1, barbarians: true });
    const barb = state.players.find((p) => p.isBarbarian)!;
    barb.greatPeoplePoints.general = 9999;
    accrueGreatPeople(state, barb);
    expect(barb.greatPeople).toHaveLength(0);
  });
});

describe("great people: activation", () => {
  it("a scientist eureka adds science and is consumed", () => {
    const state = newGame();
    const player = playerById(state, 0)!;
    player.greatPeople = ["archimedes"];
    const before = player.scienceProgress;
    const res = activateGreatPerson(state, player, "archimedes");
    expect(res.ok).toBe(true);
    expect(player.scienceProgress).toBeGreaterThan(before);
    expect(player.greatPeople).not.toContain("archimedes");
  });

  it("a merchant windfall adds gold", () => {
    const state = newGame();
    const player = playerById(state, 0)!;
    player.greatPeople = ["zhang_qian"];
    const before = player.gold;
    activateGreatPerson(state, player, "zhang_qian");
    expect(player.gold).toBeGreaterThan(before);
  });

  it("a general drills land military units with a free promotion", () => {
    const state = newGame();
    const player = playerById(state, 0)!;
    const land = unitsOf(state, 0).filter((u) => u.type === "warrior");
    expect(land.length).toBeGreaterThan(0);
    const before = land[0]!.unspentPromotions;
    player.greatPeople = ["sun_tzu"];
    activateGreatPerson(state, player, "sun_tzu");
    expect(land[0]!.unspentPromotions).toBe(before + 1);
  });

  it("rejects activating a figure the player does not hold", () => {
    const state = newGame();
    const player = playerById(state, 0)!;
    const res = activateGreatPerson(state, player, "archimedes");
    expect(res.ok).toBe(false);
  });
});

describe("great people: persistence", () => {
  it("survives a serialize round-trip", () => {
    const state = newGame();
    const player = playerById(state, 0)!;
    player.greatPeoplePoints.scientist = 60;
    accrueGreatPeople(state, player);
    player.greatPeoplePoints.merchant = 25;

    const round = deserializeState(serializeState(state));
    const rp = playerById(round, 0)!;
    expect(round.recruitedGreatPeople).toContain("archimedes");
    expect(rp.greatPeople).toContain("archimedes");
    expect(rp.greatPeoplePoints.merchant).toBe(25);
    expect(rp.greatPeopleEarned.scientist).toBe(1);
    expect(getGreatPerson(rp.greatPeople[0])?.cls).toBe("scientist");
  });
});
