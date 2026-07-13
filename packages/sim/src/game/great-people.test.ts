import { describe, expect, it } from "vitest";
import { getGreatPerson, GREAT_PEOPLE, LEGENDS } from "@roc/data";
import { createGame } from "./setup";
import { serializeState, deserializeState } from "./serialize";
import { citiesOf, playerById, unitsOf, type City } from "./state";
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
    training: {},
    trainingQueue: [],
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
    const city = addCity(newGame(), 0, ["library"], true);
    city.training.barracks = 3; // a tier-3 Barracks earns Great General points
    const pts = cityGreatPersonPoints(city);
    expect(pts.scientist).toBe(2); // library
    expect(pts.general).toBe(2); // barracks tier 3 -> round(3/2) = 2
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
    player.greatPeoplePoints.engineer = 60;
    accrueGreatPeople(state, player);
    // Imhotep is the first engineer in the roster (Bronze era).
    expect(player.greatPeople).toContain("imhotep");
    expect(state.recruitedGreatPeople).toContain("imhotep");
    // Pool drained by the threshold; lifetime count incremented.
    expect(player.greatPeoplePoints.engineer).toBe(0);
    expect(player.greatPeopleEarned.engineer).toBe(1);
  });

  it("a figure is globally unique — once taken it is skipped", () => {
    const state = newGame();
    const player = playerById(state, 0)!;
    state.recruitedGreatPeople.push("imhotep");
    player.researched.add("bronze_alloying");
    const next = nextAvailableFigure(state, "engineer", player);
    expect(next?.id).not.toBe("imhotep");
    expect(next?.id).toBe("vitruvius");
    expect(next?.cls).toBe("engineer");
  });

  it("does not recruit when no figures of a class remain", () => {
    const state = newGame();
    const player = playerById(state, 0)!;
    // Exhaust every engineer globally.
    let guard = 0;
    while (nextAvailableFigure(state, "engineer", player) && guard++ < 99) {
      state.recruitedGreatPeople.push(nextAvailableFigure(state, "engineer", player)!.id);
    }
    player.greatPeoplePoints.engineer = 9999;
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
    const land = unitsOf(state, 0).filter((u) => u.type === "warrior" || u.type === "javelineer");
    expect(land.length).toBeGreaterThan(0);
    const before = land[0]!.unspentPromotions;
    player.greatPeople = ["epaminondas"];
    activateGreatPerson(state, player, "epaminondas");
    expect(land[0]!.unspentPromotions).toBe(before + 1);
  });

  it("rejects activating a figure the player does not hold", () => {
    const state = newGame();
    const player = playerById(state, 0)!;
    const res = activateGreatPerson(state, player, "archimedes");
    expect(res.ok).toBe(false);
  });
});

describe("great prophets: faith burst + secondary gift", () => {
  it("every prophet gives a smaller faith burst than of old, plus a unique gift", () => {
    for (const g of GREAT_PEOPLE.filter((p) => p.cls === "prophet")) {
      expect(g.effect).toBe("revelation");
      expect(g.prophetGift, `${g.name} should carry a secondary gift`).toBeTruthy();
    }
  });

  it("Zarathustra grants a timed faith-on-kill fervour on top of faith", () => {
    const state = newGame();
    const player = playerById(state, 0)!;
    addCity(state, 0, ["shrine"], true);
    player.greatPeople = ["zarathustra"];
    const faithBefore = player.faith;
    activateGreatPerson(state, player, "zarathustra");
    expect(player.faith).toBe(faithBefore + 110);
    const mod = player.modifiers.find((m) => m.effect.faithOnKill);
    expect(mod?.effect.faithOnKill).toBe(6);
    expect(mod?.expiresOnTurn).toBe(state.turn + 10);
  });

  it("Confucius raises a Temple in temple-less cities", () => {
    const state = newGame();
    const player = playerById(state, 0)!;
    const a = addCity(state, 0, [], true);
    a.population = 5;
    const b = addCity(state, 0, [], false);
    b.population = 3;
    const c = addCity(state, 0, ["temple"], false); // already has one — untouched
    player.greatPeople = ["confucius"];
    activateGreatPerson(state, player, "confucius");
    expect(a.buildings).toContain("temple");
    expect(b.buildings).toContain("temple");
    expect(c.buildings.filter((x) => x === "temple")).toHaveLength(1);
  });

  it("Siddhartha mends every wounded unit to full", () => {
    const state = newGame();
    const player = playerById(state, 0)!;
    addCity(state, 0, [], true);
    const wounded = unitsOf(state, 0)[0]!;
    wounded.hp = 30;
    player.greatPeople = ["siddhartha"];
    activateGreatPerson(state, player, "siddhartha");
    expect(wounded.hp).toBeGreaterThan(30);
  });

  it("Augustine ordains free Missionaries", () => {
    const state = newGame();
    const player = playerById(state, 0)!;
    addCity(state, 0, [], true);
    const before = unitsOf(state, 0).filter((u) => u.type === "missionary").length;
    player.greatPeople = ["augustine"];
    activateGreatPerson(state, player, "augustine");
    const after = unitsOf(state, 0).filter((u) => u.type === "missionary").length;
    expect(after).toBe(before + 2);
  });

  it("Aquinas grants faith AND a science burst", () => {
    const state = newGame();
    const player = playerById(state, 0)!;
    const faithBefore = player.faith;
    const sciBefore = player.scienceProgress;
    player.greatPeople = ["aquinas"];
    activateGreatPerson(state, player, "aquinas");
    expect(player.faith).toBe(faithBefore + 110);
    expect(player.scienceProgress).toBe(sciBefore + 150);
  });
});

describe("great people: per-figure gifts", () => {
  it("every non-prophet figure carries a distinct gift", () => {
    for (const g of GREAT_PEOPLE) {
      if (g.cls === "prophet") {
        expect(g.prophetGift, g.name).toBeTruthy();
      } else {
        expect(g.gift, g.name).toBeTruthy();
      }
    }
  });

  it("Gaius Marius grants two promotions per land soldier", () => {
    const state = newGame();
    const player = playerById(state, 0)!;
    const land = unitsOf(state, 0).filter((u) => u.type === "warrior" || u.type === "javelineer");
    const before = land[0]!.unspentPromotions;
    player.greatPeople = ["gaius_marius"];
    activateGreatPerson(state, player, "gaius_marius");
    expect(land[0]!.unspentPromotions).toBe(before + 2);
  });

  it("Scipio Africanus adds a timed bonus vs unique units", () => {
    const state = newGame();
    const player = playerById(state, 0)!;
    player.greatPeople = ["scipio_africanus"];
    activateGreatPerson(state, player, "scipio_africanus");
    const mod = player.modifiers.find((m) => m.effect.combatVsUniqueUnit);
    expect(mod?.effect.combatVsUniqueUnit).toBe(4);
    expect(mod?.expiresOnTurn).toBe(state.turn + 15);
  });

  it("Homer leaves a named Great Work", () => {
    const state = newGame();
    const player = playerById(state, 0)!;
    addCity(state, 0, [], true);
    player.greatPeople = ["homer"];
    activateGreatPerson(state, player, "homer");
    const city = citiesOf(state, 0)[0]!;
    expect(city.greatWorks?.some((w) => w.title === "The Iliad")).toBe(true);
  });

  it("Marco Polo reveals distant tiles", () => {
    const state = newGame();
    const player = playerById(state, 0)!;
    addCity(state, 0, [], true);
    player.explored.clear();
    player.greatPeople = ["marco_polo"];
    activateGreatPerson(state, player, "marco_polo");
    expect(player.explored.size).toBeGreaterThan(0);
  });
});

describe("great people vs legends: no double-dipping", () => {
  it("no historical person appears in both rosters", () => {
    // A person lives in ONE system: either a Great Person or a Legend, never
    // both (e.g. Hannibal the Legend rules out "Hannibal Barca" the general).
    for (const g of GREAT_PEOPLE) {
      for (const l of LEGENDS) {
        const a = g.name.toLowerCase();
        const b = l.name.toLowerCase();
        expect(a.includes(b) || b.includes(a), `"${g.name}" (great person) duplicates the legend "${l.name}"`).toBe(false);
      }
    }
  });
});

describe("great people: persistence", () => {
  it("survives a serialize round-trip", () => {
    const state = newGame();
    const player = playerById(state, 0)!;
    player.greatPeoplePoints.engineer = 60;
    accrueGreatPeople(state, player);
    player.greatPeoplePoints.merchant = 25;

    const round = deserializeState(serializeState(state));
    const rp = playerById(round, 0)!;
    expect(round.recruitedGreatPeople).toContain("imhotep");
    expect(rp.greatPeople).toContain("imhotep");
    expect(rp.greatPeoplePoints.merchant).toBe(25);
    expect(rp.greatPeopleEarned.engineer).toBe(1);
    expect(getGreatPerson(rp.greatPeople[0])?.cls).toBe("engineer");
  });
});
