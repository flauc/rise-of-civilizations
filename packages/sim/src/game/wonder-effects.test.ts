import { describe, it, expect } from "vitest";
import { getTile } from "@roc/shared";
import { createGame } from "./setup";
import { beginTurn, applyCommand } from "./commands";
import { canStartWonder, startWonder, tickWonders } from "./works";
import { playerEffects } from "./civs";
import { unitSight, offsetNeighbors } from "./movement";
import { unitUpkeep, getCityYields } from "./economy";
import { tickLegends } from "./legends";
import { citiesOf, unitsOf, makeUnit, type City, type GameState } from "./state";

type Game = ReturnType<typeof createGame>;

function gameWithCity(): { s: Game; city: City } {
  const s = createGame({ seed: "wonder-fx", cols: 40, rows: 28, barbarians: false, humanSlots: 1, playerCount: 1 });
  beginTurn(s);
  const settler = unitsOf(s, 0).find((u) => u.type === "settler")!;
  applyCommand(s, { type: "foundCity", unitId: settler.id });
  const city = citiesOf(s, 0)[0]!;
  city.population = 40; // room for a full wonder crew
  return { s, city };
}

/** Push `n` fresh craftsmen of `type` onto a city. */
function crew(city: City, type: string, n: number, startId: number): void {
  for (let i = 0; i < n; i++) city.specialists.push({ id: startId + i, type: type as never, xp: 0, level: 1 });
}

/** A clear grassland tile owned by the city — a legal wonder site. */
function siteTile(s: Game, city: City) {
  const t = getTile(s.map, city.col + 1, city.row)!;
  t.terrain = "grassland";
  t.improvement = undefined;
  t.structure = undefined;
  t.feature = undefined;
  t.naturalWonder = undefined;
  t.wonder = undefined;
  t.river = undefined;
  t.ownerCityId = city.id;
  return t;
}

/** Mark a wonder as already built in this city (skips the long construction). */
function buildWonder(s: GameState, city: City, wonderId: string): void {
  if (!city.wonders.includes(wonderId)) city.wonders.push(wonderId);
  if (!s.completedWonders.includes(wonderId)) s.completedWonders.push(wonderId);
}

describe("wonder gating, costs & dynamic effects", () => {
  it("gates a wonder behind its required technology", () => {
    const { s, city } = gameWithCity();
    const p = s.players[0]!;
    p.researched.add("masonry"); // lets Architects/Engineers be fielded
    p.cultureProgress = 1000; // Great Library's culture cost
    crew(city, "architect", 7, 100);
    crew(city, "engineer", 5, 300);
    const tile = siteTile(s, city);
    // Great Library requires Writing — not yet researched.
    expect(canStartWonder(s, 0, "great_library", tile.col, tile.row).error).toMatch(/requires/i);
    p.researched.add("writing");
    expect(canStartWonder(s, 0, "great_library", tile.col, tile.row).ok).toBe(true);
  });

  it("charges a one-time gold cost to start a wonder and refuses when short", () => {
    const { s, city } = gameWithCity();
    const p = s.players[0]!;
    p.researched.add("masonry");
    crew(city, "mason", 11, 100);
    crew(city, "architect", 6, 300);
    const tile = siteTile(s, city);
    tile.terrain = "desert"; // Great Pyramid must sit on desert
    p.gold = 100; // Great Pyramid costs 150
    expect(canStartWonder(s, 0, "great_pyramid", tile.col, tile.row).error).toMatch(/costs 150 gold/);
    p.gold = 200;
    const res = startWonder(s, 0, "great_pyramid", tile.col, tile.row);
    expect(res.ok, res.error).toBe(true);
    expect(p.gold).toBe(50); // 200 − 150 spent at ground-breaking
  });

  it("the Great Lighthouse grants +2 sight to the owner's ships (not land units)", () => {
    const { s, city } = gameWithCity();
    const galley = makeUnit(s.nextEntityId++, 0, "galley", city.col, city.row, 0, 100);
    const warrior = makeUnit(s.nextEntityId++, 0, "warrior", city.col, city.row, 0, 100);
    s.units.set(galley.id, galley);
    s.units.set(warrior.id, warrior);
    const shipBefore = unitSight(s, galley);
    const landBefore = unitSight(s, warrior);
    buildWonder(s, city, "great_lighthouse");
    expect(unitSight(s, galley)).toBe(shipBefore + 2); // ships see farther
    expect(unitSight(s, warrior)).toBe(landBefore); // land units unchanged
  });

  it("the Colossus launches a free-upkeep warship on its schedule", () => {
    const { s, city } = gameWithCity();
    // Make a neighbouring tile open water so a ship can be launched.
    const nb = offsetNeighbors(s.map, city.col, city.row)[0]!;
    const water = getTile(s.map, nb.col, nb.row)!;
    water.terrain = "ocean";
    for (const u of [...unitsOf(s, 0)]) if (u.col === nb.col && u.row === nb.row) s.units.delete(u.id);
    buildWonder(s, city, "colossus");
    const before = unitsOf(s, 0).filter((u) => u.type === "galley").length;

    s.turn = 5; // not a multiple of 6 → no launch
    tickWonders(s, 0);
    expect(unitsOf(s, 0).filter((u) => u.type === "galley").length).toBe(before);

    s.turn = 6; // multiple of 6 → launch
    tickWonders(s, 0);
    const galleys = unitsOf(s, 0).filter((u) => u.type === "galley");
    expect(galleys.length).toBe(before + 1);
    const ship = galleys[galleys.length - 1]!;
    expect(ship.freeUpkeep).toBe(true);
    expect(unitUpkeep(s, ship)).toBe(0); // gifted ship costs nothing to maintain
  });

  it("the Great Pyramid grants faith when a legend passes into legend", () => {
    const { s, city } = gameWithCity();
    const p = s.players[0]!;
    buildWonder(s, city, "great_pyramid");
    p.faith = 0;
    const hero = makeUnit(s.nextEntityId++, 0, "swordsman", city.col, city.row, 0, 100);
    hero.legendId = "gilgamesh";
    hero.legendExpiresOnTurn = 4;
    s.units.set(hero.id, hero);
    s.turn = 5; // past its expiry
    tickLegends(s, 0);
    expect(s.units.has(hero.id)).toBe(false);
    expect(p.faith).toBe(60);
  });

  it("wonders grant their passive CivEffects to the owner (Oracle, Tenochtitlán)", () => {
    const { s, city } = gameWithCity();
    expect(playerEffects(s, 0).rushWithFaith ?? false).toBe(false);
    buildWonder(s, city, "oracle");
    expect(playerEffects(s, 0).rushWithFaith).toBe(true);
    buildWonder(s, city, "tenochtitlan");
    expect(playerEffects(s, 0).landMovementBonus).toBe(1);
  });

  it("gates a wonder's placement by terrain (Great Pyramid needs desert)", () => {
    const { s, city } = gameWithCity();
    const p = s.players[0]!;
    p.researched.add("masonry");
    p.gold = 1000;
    crew(city, "mason", 11, 100);
    crew(city, "architect", 6, 300);
    const tile = siteTile(s, city); // grassland
    expect(canStartWonder(s, 0, "great_pyramid", tile.col, tile.row).error).toMatch(/requires a desert tile/);
    tile.terrain = "desert";
    expect(canStartWonder(s, 0, "great_pyramid", tile.col, tile.row).ok).toBe(true);
  });

  it("gates the Great Lighthouse to a coastal water tile", () => {
    const { s, city } = gameWithCity();
    const p = s.players[0]!;
    p.researched.add("sailing");
    p.researched.add("masonry");
    p.gold = 1000;
    crew(city, "mason", 5, 100);
    crew(city, "architect", 5, 200);
    crew(city, "engineer", 5, 300);
    const tile = siteTile(s, city); // land — not a water site at all
    expect(canStartWonder(s, 0, "great_lighthouse", tile.col, tile.row).ok).toBe(false);
    // A coastal water tile (borders the city's land) is a legal site.
    tile.terrain = "coast";
    expect(canStartWonder(s, 0, "great_lighthouse", tile.col, tile.row).ok).toBe(true);
  });

  it("gates Stonehenge to within 5 tiles of a mountain", () => {
    const { s, city } = gameWithCity();
    const p = s.players[0]!;
    p.researched.add("ritual_burial");
    p.researched.add("masonry");
    p.researched.add("the_wheel");
    p.faith = 200;
    crew(city, "mason", 9, 100);
    crew(city, "agrimensor", 4, 300); // the survey craft
    // Clear any mountains the map happened to generate, so the gate is deterministic.
    for (const t of s.map.tiles) if (t.terrain === "mountains") t.terrain = "grassland";
    const tile = siteTile(s, city);
    expect(canStartWonder(s, 0, "stonehenge", tile.col, tile.row).error).toMatch(/within 5 tiles of a mountain/);
    getTile(s.map, city.col + 3, city.row)!.terrain = "mountains";
    expect(canStartWonder(s, 0, "stonehenge", tile.col, tile.row).ok).toBe(true);
  });

  it("buffed wonder yields flow into the host city's output", () => {
    const { s, city } = gameWithCity();
    const before = getCityYields(s, city);
    buildWonder(s, city, "great_pyramid"); // +2 production/city, +2 culture host
    const after = getCityYields(s, city);
    expect(after.production).toBe(before.production + 2); // per-city component
    expect(after.culture).toBe(before.culture + 2); // host-city component
  });
});
