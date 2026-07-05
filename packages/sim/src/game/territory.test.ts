import { describe, it, expect } from "vitest";
import { createGame } from "./setup";
import { beginTurn, applyCommand } from "./commands";
import { territorySize, expandTerritory, expansionCandidates, canExpandTo, cityTerritory } from "./territory";
import { ejectTrespassers, offsetNeighbors } from "./movement";
import { isPassableLand, isWaterTerrain } from "./terrain";
import { citiesOf, makeUnit, unitsOf } from "./state";
import { getTile } from "@roc/shared";

const cityOwnerAt = (state: ReturnType<typeof createGame>, col: number, row: number): number | undefined => {
  const t = getTile(state.map, col, row);
  return t?.ownerCityId !== undefined ? state.cities.get(t.ownerCityId)?.ownerId : undefined;
};

describe("territory", () => {
  it("a new city claims its center plus a ring, and tiles are owned", () => {
    const state = createGame({ seed: "terr", cols: 40, rows: 28, barbarians: false });
    beginTurn(state);
    const settler = unitsOf(state, 0).find((u) => u.type === "settler")!;
    applyCommand(state, { type: "foundCity", unitId: settler.id });
    const city = citiesOf(state, 0)[0]!;
    // center + 6 neighbors (minus any out-of-bounds/water already-claimed) -> ~7
    expect(territorySize(state, city)).toBeGreaterThanOrEqual(4);
    expect(getTile(state.map, city.col, city.row)!.ownerCityId).toBe(city.id);
  });

  it("expands borders when the city grows", () => {
    const state = createGame({ seed: "terr2", cols: 40, rows: 28, barbarians: false });
    beginTurn(state);
    const settler = unitsOf(state, 0).find((u) => u.type === "settler")!;
    applyCommand(state, { type: "foundCity", unitId: settler.id });
    const city = citiesOf(state, 0)[0]!;
    const before = territorySize(state, city);
    expandTerritory(state, city, 3);
    expect(territorySize(state, city)).toBeGreaterThan(before);
  });

  it("claims the player's chosen tile first when growing, then reverts to auto", () => {
    const state = createGame({ seed: "terr-pick", cols: 40, rows: 28, barbarians: false });
    beginTurn(state);
    const settler = unitsOf(state, 0).find((u) => u.type === "settler")!;
    applyCommand(state, { type: "foundCity", unitId: settler.id });
    const city = citiesOf(state, 0)[0]!;
    // Pick a claimable tile that is NOT the nearest (so the override is observable).
    const cands = expansionCandidates(state, city);
    expect(cands.length).toBeGreaterThan(0);
    const target = cands[cands.length - 1]!;
    expect(canExpandTo(state, city, target.col, target.row)).toBe(true);
    applyCommand(state, { type: "setExpandTarget", cityId: city.id, target });
    expect(city.expandTarget).toEqual(target);

    expandTerritory(state, city, 1);
    // The chosen tile is now owned, and the target is consumed (back to auto).
    expect(getTile(state.map, target.col, target.row)!.ownerCityId).toBe(city.id);
    expect(city.expandTarget).toBeUndefined();
  });

  it("rejects an unclaimable expand target and clears one via setExpandTarget", () => {
    const state = createGame({ seed: "terr-pick2", cols: 40, rows: 28, barbarians: false });
    beginTurn(state);
    const settler = unitsOf(state, 0).find((u) => u.type === "settler")!;
    applyCommand(state, { type: "foundCity", unitId: settler.id });
    const city = citiesOf(state, 0)[0]!;
    // The city centre is already owned, so it can never be an expand target.
    const bad = applyCommand(state, { type: "setExpandTarget", cityId: city.id, target: { col: city.col, row: city.row } });
    expect(bad.ok).toBe(false);
    // Setting then clearing leaves no target.
    const target = expansionCandidates(state, city)[0]!;
    applyCommand(state, { type: "setExpandTarget", cityId: city.id, target });
    expect(city.expandTarget).toEqual(target);
    applyCommand(state, { type: "setExpandTarget", cityId: city.id, target: null });
    expect(city.expandTarget).toBeUndefined();
  });

  it("only offers expansion tiles adjacent to a tile the city already owns", () => {
    const state = createGame({ seed: "terr-adj", cols: 40, rows: 28, barbarians: false });
    beginTurn(state);
    const settler = unitsOf(state, 0).find((u) => u.type === "settler")!;
    applyCommand(state, { type: "foundCity", unitId: settler.id });
    const city = citiesOf(state, 0)[0]!;
    const owned = new Set(cityTerritory(state, city).map((t) => `${t.col},${t.row}`));
    const cands = expansionCandidates(state, city);
    expect(cands.length).toBeGreaterThan(0);
    for (const c of cands) {
      const touchesOwned = offsetNeighbors(state.map, c.col, c.row).some((n) => owned.has(`${n.col},${n.row}`));
      expect(touchesOwned).toBe(true);
    }
    // A far, unowned tile that touches nothing this city owns is never claimable.
    expect(canExpandTo(state, city, city.col + 6, city.row)).toBe(false);
  });

  it("escorts a foreign unit off land a border expanded around it (no open borders)", () => {
    const s = createGame({ seed: "eject", cols: 30, rows: 20, barbarians: false, humanSlots: 0, playerCount: 2 });
    beginTurn(s);
    for (const pid of [0, 1]) {
      const settler = unitsOf(s, pid).find((u) => u.type === "settler");
      if (settler) applyCommand(s, { type: "foundCity", unitId: settler.id }, pid);
    }
    const theirCity = citiesOf(s, 1)[0]!;
    // A passable tile that player 1's culture owns (not the city centre).
    const tile = s.map.tiles.find(
      (t) => t.ownerCityId === theirCity.id && isPassableLand(t.terrain) &&
        !(t.col === theirCity.col && t.row === theirCity.row),
    )!;
    expect(tile).toBeTruthy();
    for (const u of [...s.units.values()]) if (u.col === tile.col && u.row === tile.row) s.units.delete(u.id);
    // Drop a player-0 unit onto player 1's soil (as if a border just grew around it).
    const id = s.nextEntityId++;
    s.units.set(id, makeUnit(id, 0, "warrior", tile.col, tile.row));
    expect(cityOwnerAt(s, tile.col, tile.row)).toBe(1); // it's on player 1's land
    ejectTrespassers(s);
    const u = s.units.get(id)!;
    expect(u.col === tile.col && u.row === tile.row).toBe(false); // it was moved
    expect(cityOwnerAt(s, u.col, u.row)).not.toBe(1); // and is no longer on player 1's land
  });

  it("never bumps a land unit onto water, even when the sea is the closest escape", () => {
    const s = createGame({ seed: "eject-water", cols: 30, rows: 20, barbarians: false, humanSlots: 0, playerCount: 2 });
    beginTurn(s);
    for (const pid of [0, 1]) {
      const settler = unitsOf(s, pid).find((u) => u.type === "settler");
      if (settler) applyCommand(s, { type: "foundCity", unitId: settler.id }, pid);
    }
    const theirCity = citiesOf(s, 1)[0]!;
    const tile = s.map.tiles.find(
      (t) => t.ownerCityId === theirCity.id && isPassableLand(t.terrain) &&
        !(t.col === theirCity.col && t.row === theirCity.row),
    )!;
    for (const u of [...s.units.values()]) if (u.col === tile.col && u.row === tile.row) s.units.delete(u.id);
    // Tempt the eject toward the sea: make every neighbour that ISN'T player 1's land water.
    for (const n of offsetNeighbors(s.map, tile.col, tile.row)) {
      const nt = getTile(s.map, n.col, n.row);
      const owner = nt?.ownerCityId !== undefined ? s.cities.get(nt.ownerCityId)?.ownerId : undefined;
      if (nt && owner !== 1) nt.terrain = "coast";
    }
    const id = s.nextEntityId++;
    s.units.set(id, makeUnit(id, 0, "warrior", tile.col, tile.row));
    ejectTrespassers(s);
    const u = s.units.get(id)!;
    const dest = getTile(s.map, u.col, u.row)!;
    expect(isWaterTerrain(dest.terrain)).toBe(false); // a land unit is never left at sea
    expect(cityOwnerAt(s, u.col, u.row)).not.toBe(1); // it still got off player 1's land (skipped the water, found land beyond)
  });

  it("leaves a unit in place when it has open borders with the territory's owner", () => {
    const s = createGame({ seed: "eject-ob", cols: 30, rows: 20, barbarians: false, humanSlots: 0, playerCount: 2 });
    beginTurn(s);
    for (const pid of [0, 1]) {
      const settler = unitsOf(s, pid).find((u) => u.type === "settler");
      if (settler) applyCommand(s, { type: "foundCity", unitId: settler.id }, pid);
    }
    const theirCity = citiesOf(s, 1)[0]!;
    const tile = s.map.tiles.find(
      (t) => t.ownerCityId === theirCity.id && isPassableLand(t.terrain) &&
        !(t.col === theirCity.col && t.row === theirCity.row),
    )!;
    for (const u of [...s.units.values()]) if (u.col === tile.col && u.row === tile.row) s.units.delete(u.id);
    // Grant open borders, then place player 0's unit on player 1's land.
    s.relations.push({ a: 0, b: 1, status: "peace", openBorders: true, metTurn: 1, lastStatusChangeTurn: 1, pact: "none", deals: [] } as never);
    const id = s.nextEntityId++;
    s.units.set(id, makeUnit(id, 0, "warrior", tile.col, tile.row));
    ejectTrespassers(s);
    const u = s.units.get(id)!;
    expect(u.col === tile.col && u.row === tile.row).toBe(true); // welcomed — stays put
  });
});

// getTile is re-exported from @roc/sim via state? It's from @roc/shared; import path note:
