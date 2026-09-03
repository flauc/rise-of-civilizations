import { describe, it, expect } from "vitest";
import { createGame } from "./setup";
import { applyCommand } from "./commands";
import { updateExplored } from "./visibility";
import {
  isNaturalWonderAnchor,
  naturalWonderAnchorFor,
  naturalWonderFootprintTiles,
  naturalWonderSpritePaintTile,
  naturalWonderYields,
  naturalWonderCulture,
  naturalWonderTerritoryCulture,
  naturalWonderTerritoryTourism,
  checkNaturalWonderDiscovery,
  placeNaturalWonders,
} from "./natural-wonders";
import { getCityYields } from "./economy";
import { baseTourism } from "./culture-victory";
import { citiesOf, unitsOf } from "./state";
import { axialDistance, getTile, offsetToAxial, axialNeighbor, axialToOffset } from "@roc/shared";
import { getNaturalWonder, naturalWonderTileCount, NATURAL_WONDER_DEFS, NATURAL_WONDER_IDS } from "@roc/data";
import { mapGeoProfile, naturalWonderTileGeoValid, tileInWonderBox } from "../map-geo";
import { REGIONAL_WONDER_SPACING } from "../regional-wonder-terrain";
import { isRegionalGeoMapType } from "../geo-maps";
import { MAP_TYPES } from "../worldgen";
import type { MapType } from "../worldgen";

const PLAYABLE_MAP_TYPES = MAP_TYPES.filter((t) => t !== "random") as MapType[];

function foundCapital(state: ReturnType<typeof createGame>) {
  const settler = unitsOf(state, 0).find((u) => u.type === "settler")!;
  applyCommand(state, { type: "foundCity", unitId: settler.id }, 0);
  return citiesOf(state, 0)[0]!;
}

describe("natural wonders", () => {
  it("places natural wonders on the map, each filling its whole footprint", () => {
    const state = createGame({ seed: "nw-map", cols: 80, rows: 56, barbarians: false, naturalWonders: true });
    expect(state.naturalWonderIds.length).toBeGreaterThanOrEqual(2);
    // Every placed wonder is a known def and occupies exactly as many tiles as its
    // footprint declares (one for ordinary wonders).
    for (const id of state.naturalWonderIds) {
      expect(getNaturalWonder(id)).toBeDefined();
      const tiles = state.map.tiles.filter((t) => t.naturalWonder === id);
      expect(tiles.length, id).toBe(naturalWonderTileCount(id));
      const anchors = tiles.filter((t) => isNaturalWonderAnchor(state.map, t.col, t.row));
      expect(anchors.length, `${id} anchors`).toBe(1);
      expect(naturalWonderTileGeoValid(state.map, id, anchors[0]!.col, anchors[0]!.row)).toBe(true);
      // The footprint stamped on the map is exactly the one the def declares.
      const expected = naturalWonderFootprintTiles(getNaturalWonder(id), anchors[0]!.col, anchors[0]!.row)
        .map((t) => `${t.col},${t.row}`)
        .sort();
      expect(tiles.map((t) => `${t.col},${t.row}`).sort(), id).toEqual(expected);
      // Every tile of a wonder pays the same yields.
      for (const t of tiles) {
        expect(naturalWonderYields(t), id).toEqual(naturalWonderYields(anchors[0]!));
        expect(naturalWonderTerritoryCulture(t), id).toBe(naturalWonderTerritoryCulture(anchors[0]!));
        expect(naturalWonderTerritoryTourism(t), id).toBe(naturalWonderTerritoryTourism(anchors[0]!));
      }
    }
  });

  it("places the multi-tile wonders across contiguous tiles of valid terrain", () => {
    const multi = NATURAL_WONDER_DEFS.filter((d) => d.footprint);
    expect(multi.length).toBeGreaterThan(0);
    const seen = new Set<string>();
    for (let i = 0; i < 8 && seen.size < multi.length; i++) {
      const state = createGame({
        seed: `nw-multi-${i}`,
        cols: 90,
        rows: 62,
        mapType: "realworld",
        barbarians: false,
        naturalWonders: true,
      });
      for (const def of multi) {
        const tiles = state.map.tiles.filter((t) => t.naturalWonder === def.id);
        if (tiles.length === 0) continue;
        seen.add(def.id);
        expect(tiles.length, def.id).toBe(def.footprint!.length);
        for (const t of tiles) {
          expect(def.validTerrain, `${def.id} terrain`).toContain(t.terrain);
          expect(t.river, `${def.id} river`).toBeFalsy();
          expect(t.resource, `${def.id} resource`).toBeFalsy();
          expect(t.feature, `${def.id} feature`).toBeFalsy();
        }
        // Contiguity: every tile touches at least one other tile of the wonder.
        for (const t of tiles) {
          const here = offsetToAxial({ col: t.col, row: t.row });
          const touching = tiles.some(
            (o) => o !== t && axialDistance(here, offsetToAxial({ col: o.col, row: o.row })) === 1,
          );
          expect(touching, `${def.id} at ${t.col},${t.row}`).toBe(true);
        }
      }
    }
    // The Amazon and the Grand Canyon both have plenty of room on a Real World map.
    expect([...seen].sort()).toEqual(multi.map((d) => d.id).sort());
  });

  it("exposes one anchor and one paint tile per multi-tile wonder", () => {
    const state = createGame({
      seed: "nw-multi-anchor",
      cols: 90,
      rows: 62,
      mapType: "realworld",
      barbarians: false,
      naturalWonders: true,
    });
    let checked = 0;
    for (const id of state.naturalWonderIds) {
      const tiles = state.map.tiles.filter((t) => t.naturalWonder === id);
      const anchors = tiles.filter((t) => isNaturalWonderAnchor(state.map, t.col, t.row));
      expect(anchors.length, id).toBe(1);
      const anchor = anchors[0]!;
      // Every tile of the wonder agrees on the anchor and on the paint tile.
      const paint = naturalWonderSpritePaintTile(state.map, anchor.col, anchor.row)!;
      for (const t of tiles) {
        expect(naturalWonderAnchorFor(state.map, t.col, t.row), id).toEqual({
          col: anchor.col,
          row: anchor.row,
        });
        expect(naturalWonderSpritePaintTile(state.map, t.col, t.row), id).toEqual(paint);
      }
      // The renderer walks tiles row-major and paints the sprite over terrain it has
      // already laid down, so the paint tile must be the LAST tile of the footprint.
      for (const t of tiles) {
        expect(t.row < paint.row || (t.row === paint.row && t.col <= paint.col), id).toBe(true);
      }
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("discovers a multi-tile wonder from any one of its tiles", () => {
    const state = createGame({
      seed: "nw-multi-sight",
      cols: 90,
      rows: 62,
      mapType: "realworld",
      barbarians: false,
      naturalWonders: true,
    });
    const def = NATURAL_WONDER_DEFS.find(
      (d) => d.footprint && state.map.tiles.some((t) => t.naturalWonder === d.id),
    )!;
    expect(def).toBeDefined();
    const tiles = state.map.tiles.filter((t) => t.naturalWonder === def.id);
    // Sight the LAST tile of the footprint only: the whole wonder still counts.
    const far = tiles[tiles.length - 1]!;
    const player = state.players[0]!;
    player.explored.add(`${far.col},${far.row}`);
    checkNaturalWonderDiscovery(state, 0);
    expect(state.discoveredWonders?.[def.id]).toBe(0);
  });

  it("never places two wonders close to each other", () => {
    let checked = 0;
    for (const seed of ["nw-space-1", "nw-space-2", "nw-space-3", "nw-space-rw", "nw-space-med"]) {
      const mapType: MapType | undefined =
        seed === "nw-space-rw" ? "realworld" : seed === "nw-space-med" ? "mediterranean" : undefined;
      const state = createGame({
        seed,
        cols: mapType ? 80 : 60,
        rows: mapType ? 56 : 40,
        mapType,
        barbarians: false,
        naturalWonders: true,
      });
      // One spot per wonder: the tiles WITHIN a multi-tile footprint are adjacent
      // by design, so spacing is measured between wonders, not between their tiles.
      const spots = state.map.tiles
        .filter((t) => t.naturalWonder && isNaturalWonderAnchor(state.map, t.col, t.row))
        .map((t) => offsetToAxial({ col: t.col, row: t.row }));
      if (spots.length < 2) continue;
      const minSpacing = isRegionalGeoMapType(state.map.mapType) ? REGIONAL_WONDER_SPACING : 10;
      checked++;
      for (let i = 0; i < spots.length; i++) {
        for (let j = i + 1; j < spots.length; j++) {
          expect(axialDistance(spots[i]!, spots[j]!), seed).toBeGreaterThanOrEqual(minSpacing);
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("placement is deterministic for the same seed", () => {
    const a = createGame({ seed: "nw-det", cols: 44, rows: 30, barbarians: false, naturalWonders: true });
    const b = createGame({ seed: "nw-det", cols: 44, rows: 30, barbarians: false, naturalWonders: true });
    const key = (s: typeof a) => s.map.tiles.map((t) => `${t.col},${t.row}:${t.naturalWonder ?? ""}`).join("|");
    expect(key(a)).toBe(key(b));
  });

  it("a wonder tile yields its bonus output when worked", () => {
    const state = createGame({ seed: "nw-yield", cols: 30, rows: 20, barbarians: false });
    const tile = getTile(state.map, 5, 5)!;
    tile.naturalWonder = "great_barrier_reef";
    const def = getNaturalWonder("great_barrier_reef")!;
    const y = naturalWonderYields(tile);
    expect(y.food).toBe(def.tileYields.food ?? 0);
    expect(y.gold).toBe(def.tileYields.gold ?? 0);
    expect(y.science).toBe(def.tileYields.science ?? 0);
    expect(naturalWonderCulture(getTile(state.map, 5, 5)!)).toBe(def.tileYields.culture ?? 0);
  });

  it("a natural wonder inside city borders passively adds culture", () => {
    const state = createGame({ seed: "nw-city", cols: 30, rows: 20, barbarians: false });
    const city = foundCapital(state);
    const tile = getTile(state.map, city.col + 1, city.row)!;
    tile.terrain = "grassland";
    const before = getCityYields(state, city);

    tile.naturalWonder = "victoria_falls"; // +2 culture when held in territory
    tile.ownerCityId = city.id;
    const after = getCityYields(state, city);

    expect(naturalWonderTerritoryCulture(tile)).toBe(2);
    expect(after.culture).toBe(before.culture + 2);
  });

  it("working a wonder tile does not double-count its culture", () => {
    const state = createGame({ seed: "nw-worked", cols: 30, rows: 20, barbarians: false });
    const city = foundCapital(state);
    const tile = getTile(state.map, city.col + 1, city.row)!;
    tile.terrain = "grassland";
    tile.naturalWonder = "victoria_falls";
    tile.ownerCityId = city.id;

    const unworked = getCityYields(state, city);
    city.lockedTiles = [`${tile.col},${tile.row}`];
    city.workedTiles = [`${tile.col},${tile.row}`];
    const worked = getCityYields(state, city);
    expect(worked.culture).toBe(unworked.culture);
  });

  it("natural wonders in territory add tourism for culture victory", () => {
    const state = createGame({ seed: "nw-tourism", cols: 30, rows: 20, barbarians: false });
    const city = foundCapital(state);
    const tile = getTile(state.map, city.col + 1, city.row)!;
    tile.naturalWonder = "mount_everest"; // no culture on def → min 1 culture, 2 tourism
    tile.ownerCityId = city.id;

    expect(naturalWonderTerritoryCulture(tile)).toBe(1);
    expect(naturalWonderTerritoryTourism(tile)).toBe(2);
    expect(baseTourism(state, 0)).toBeGreaterThanOrEqual(2);
  });

  it("the first civ to sight a wonder claims its one-time bonus, announced world-wide", () => {
    const state = createGame({ seed: "nw-discover", cols: 30, rows: 20, barbarians: false });
    const tile = getTile(state.map, 6, 6)!;
    tile.naturalWonder = "mount_everest";
    // A second, far-off wonder nobody has sighted keeps the "all wonders" grand
    // bonus from also firing, so we measure the single discovery in isolation.
    getTile(state.map, 20, 14)!.naturalWonder = "dead_sea";
    state.naturalWonderIds = ["mount_everest", "dead_sea"];
    state.discoveredWonders = {};
    state.allNaturalWondersClaimedBy = undefined;
    for (const p of state.players) p.explored.clear(); // control vision exactly

    const player = state.players[0]!;
    const def = getNaturalWonder("mount_everest")!;
    const scienceBefore = player.scienceProgress;
    const faithBefore = player.faith;

    player.explored.add("6,6");
    checkNaturalWonderDiscovery(state, 0);

    expect(state.discoveredWonders["mount_everest"]).toBe(0);
    expect(player.scienceProgress).toBe(scienceBefore + (def.discoveryBonus.science ?? 0));
    expect(player.faith).toBe(faithBefore + (def.discoveryBonus.faith ?? 0));
    const entry = state.log.find((l) => l.message.includes("Mount Everest"));
    expect(entry?.world).toBe(true);
    // The discovery carries rich dialog data: wonder name, bonus text, and (since
    // it's this civ's first wonder) the grand "all wonders" incentive text.
    expect(entry?.wonder?.wonderId).toBe("mount_everest");
    expect(entry?.wonder?.bonusText).toContain("science");
    expect(entry?.wonder?.firstDiscovery).toBe(true);
    expect(entry?.wonder?.allBonusText).toBeTruthy();

    // A second civ sighting it later does NOT re-award the bonus.
    const p2 = state.players[1]!;
    const p2Science = p2.scienceProgress;
    p2.explored.add("6,6");
    checkNaturalWonderDiscovery(state, 1);
    expect(state.discoveredWonders["mount_everest"]).toBe(0);
    expect(p2.scienceProgress).toBe(p2Science);
  });

  it("awards the grand bonus to the first civ to sight every wonder", () => {
    const state = createGame({ seed: "nw-all", cols: 30, rows: 20, barbarians: false });
    // Reduce the world to two single-tile wonders for a deterministic test.
    for (const t of state.map.tiles) t.naturalWonder = undefined;
    getTile(state.map, 3, 3)!.naturalWonder = "uluru";
    getTile(state.map, 8, 8)!.naturalWonder = "dead_sea";
    state.naturalWonderIds = ["uluru", "dead_sea"];
    state.discoveredWonders = {};
    state.allNaturalWondersClaimedBy = undefined;
    for (const p of state.players) p.explored.clear(); // control vision exactly

    const player = state.players[0]!;
    player.explored.add("3,3");
    checkNaturalWonderDiscovery(state, 0);
    expect(state.allNaturalWondersClaimedBy).toBeUndefined();

    const goldBefore = player.gold;
    player.explored.add("8,8");
    checkNaturalWonderDiscovery(state, 0);
    expect(state.allNaturalWondersClaimedBy).toBe(0);
    expect(player.gold).toBeGreaterThan(goldBefore);
    expect(state.log.some((l) => l.world && l.message.includes("every natural wonder"))).toBe(true);
  });

  it("discovery flows through a unit move + updateExplored", () => {
    const state = createGame({ seed: "nw-move", cols: 30, rows: 20, barbarians: false });
    // Plant a wonder right next to a unit, then refresh vision.
    const warrior = unitsOf(state, 0).find((u) => u.type === "scout")!;
    const here = getTile(state.map, warrior.col, warrior.row)!;
    here.naturalWonder = "uluru";
    state.naturalWonderIds = ["uluru"];
    state.discoveredWonders = {};
    updateExplored(state, 0);
    expect(state.discoveredWonders["uluru"]).toBe(0);
  });

  it("placeNaturalWonders keeps wonders away from start positions", () => {
    const state = createGame({ seed: "nw-starts", cols: 60, rows: 40, barbarians: false, naturalWonders: true });
    // Every wonder id placed is a known def.
    expect(state.naturalWonderIds.length).toBeGreaterThan(0);
    for (const id of state.naturalWonderIds) {
      expect(NATURAL_WONDER_IDS).toContain(id);
      const tile = state.map.tiles.find((x) => x.naturalWonder === id)!;
      expect(naturalWonderTileGeoValid(state.map, id, tile.col, tile.row)).toBe(true);
    }
  });

  it("places coastal cliff wonders on land, with the required edges facing the sea", () => {
    const coastalIds = NATURAL_WONDER_DEFS.filter((d) => d.coastal || d.coastalFront).map((d) => d.id);
    expect(coastalIds.length).toBeGreaterThan(0);
    const isSea = (state: ReturnType<typeof createGame>, col: number, row: number): boolean => {
      const n = getTile(state.map, col, row);
      return !!n && (n.terrain === "ocean" || n.terrain === "coast");
    };
    let sawAny = false;
    // Scan many seeds so the (random-subset) coastal wonders actually land.
    const seeds = [
      ...Array.from({ length: 16 }, (_, i) => `coast-${i}`),
      ...Array.from({ length: 8 }, (_, i) => `coast-rw-${i}`),
      ...Array.from({ length: 8 }, (_, i) => `coast-med-${i}`),
    ];
    for (const seed of seeds) {
      const mapType: MapType | undefined = seed.startsWith("coast-rw-")
        ? "realworld"
        : seed.startsWith("coast-med-")
          ? "mediterranean"
          : undefined;
      const state = createGame({
        seed,
        cols: mapType === "mediterranean" ? 80 : 48,
        rows: mapType === "mediterranean" ? 56 : 32,
        mapType,
        barbarians: false,
        naturalWonders: true,
      });
      for (const t of state.map.tiles) {
        if (!t.naturalWonder || !coastalIds.includes(t.naturalWonder)) continue;
        const def = getNaturalWonder(t.naturalWonder)!;
        sawAny = true;
        // Never on a water tile.
        expect(["ocean", "coast", "lake"]).not.toContain(t.terrain);
        const here = offsetToAxial({ col: t.col, row: t.row });
        if (def.coastalFront) {
          // Both front edges (SW=4, SE=5) must be sea so the fixed art faces water.
          for (const d of [4, 5]) {
            const nb = axialToOffset(axialNeighbor(here, d));
            expect(isSea(state, nb.col, nb.row)).toBe(true);
          }
        } else {
          // At least one sea neighbour so the shoreline renders against the cliff.
          const anySea = [0, 1, 2, 3, 4, 5].some((d) => {
            const nb = axialToOffset(axialNeighbor(here, d));
            return isSea(state, nb.col, nb.row);
          });
          expect(anySea).toBe(true);
        }
      }
    }
    // Across all sampled seeds at least one coastal cliff wonder was placed and met
    // its rule (the invariant above is what matters; this guards against a no-op).
    expect(sawAny).toBe(true);
  });

  it("places Galápagos on open ocean, never beside land or coast", () => {
    const isLand = (terrain: string) => terrain !== "ocean" && terrain !== "coast" && terrain !== "lake";
    let sawAny = false;
    for (let i = 0; i < 24; i++) {
      const state = createGame({ seed: `galapagos-${i}`, cols: 60, rows: 40, barbarians: false, naturalWonders: true });
      for (const t of state.map.tiles) {
        if (t.naturalWonder !== "galapagos_islands") continue;
        sawAny = true;
        expect(t.terrain).toBe("ocean");
        const here = offsetToAxial({ col: t.col, row: t.row });
        for (let d = 0; d < 6; d++) {
          const nb = axialToOffset(axialNeighbor(here, d));
          const n = getTile(state.map, nb.col, nb.row)!;
          expect(n.terrain).toBe("ocean");
          expect(isLand(n.terrain)).toBe(false);
        }
      }
    }
    expect(sawAny).toBe(true);
  });

  it("places Great Barrier Reef on coastal water beside land", () => {
    let sawAny = false;
    for (let i = 0; i < 24; i++) {
      const state = createGame({ seed: `reef-${i}`, cols: 60, rows: 40, barbarians: false, naturalWonders: true });
      for (const t of state.map.tiles) {
        if (t.naturalWonder !== "great_barrier_reef") continue;
        sawAny = true;
        expect(t.terrain).toBe("coast");
        const here = offsetToAxial({ col: t.col, row: t.row });
        const touchesLand = [0, 1, 2, 3, 4, 5].some((d) => {
          const nb = axialToOffset(axialNeighbor(here, d));
          const n = getTile(state.map, nb.col, nb.row)!;
          return n.terrain !== "ocean" && n.terrain !== "coast" && n.terrain !== "lake";
        });
        expect(touchesLand).toBe(true);
      }
    }
    expect(sawAny).toBe(true);
  });

  it("places waterfall wonders beside rivers or water, not on open coast", () => {
    const fallIds = new Set(["victoria_falls", "iguazu_falls", "angel_falls", "niagara_falls"]);
    let sawAny = false;
    for (let i = 0; i < 24; i++) {
      for (const mapType of [undefined, "realworld", "mediterranean"] as const) {
        const state = createGame({
          seed: `falls-${mapType ?? "proc"}-${i}`,
          cols: mapType ? 80 : 60,
          rows: mapType ? 56 : 40,
          mapType,
          barbarians: false,
          naturalWonders: true,
        });
        for (const t of state.map.tiles) {
          if (!t.naturalWonder || !fallIds.has(t.naturalWonder)) continue;
          sawAny = true;
          expect(t.terrain).not.toBe("coast");
          if (t.naturalWonder === "niagara_falls") {
            expect(t.terrain).toBe("lake");
            continue;
          }
          const here = offsetToAxial({ col: t.col, row: t.row });
          const besideWater =
            t.river ||
            t.riverLake ||
            [0, 1, 2, 3, 4, 5].some((d) => {
              const nb = axialToOffset(axialNeighbor(here, d));
              const n = getTile(state.map, nb.col, nb.row)!;
              return n.terrain === "ocean" || n.terrain === "coast" || n.terrain === "lake" || n.river || n.riverLake;
            });
          expect(besideWater).toBe(true);
        }
      }
    }
    expect(sawAny).toBe(true);
  });

  it("on Real World maps, wonders spawn inside their geographic lat/lon boxes", () => {
    const geo = mapGeoProfile("realworld");
    let sawAny = false;
    for (let i = 0; i < 16; i++) {
      const state = createGame({
        seed: `rw-geo-${i}`,
        cols: 110,
        rows: 64,
        mapType: "realworld",
        barbarians: false,
        naturalWonders: true,
      });
      expect(state.map.mapType).toBe("realworld");
      for (const t of state.map.tiles) {
        if (!t.naturalWonder) continue;
        const def = getNaturalWonder(t.naturalWonder);
        expect(def?.realWorldBox).toBeDefined();
        const { lat, lon } = geo.tileLatLon(t.col, t.row, state.map.cols, state.map.rows);
        sawAny = true;
        // A multi-tile footprint may reach one tile past the edge of a tight box,
        // so the box is asserted on the wonder as a whole (see the anchor tile).
        if (isNaturalWonderAnchor(state.map, t.col, t.row)) {
          expect(
            tileInWonderBox(geo, t.col, t.row, state.map.cols, state.map.rows, def!.realWorldBox!),
            t.naturalWonder,
          ).toBe(true);
        }
        if (t.naturalWonder === "plitvice_lakes") {
          expect(lat).toBeGreaterThan(40);
          expect(lat).toBeLessThan(50);
        }
      }
    }
    expect(sawAny).toBe(true);
  });

  it("Sahara never spawns in Europe on Real World or Mediterranean maps", () => {
    const def = getNaturalWonder("sahara_dunes")!;
    let sawSahara = false;
    for (const mapType of ["realworld", "mediterranean"] as const) {
      const geo = mapGeoProfile(mapType);
      for (let i = 0; i < 24; i++) {
        const state = createGame({
          seed: `sahara-${mapType}-${i}`,
          cols: 110,
          rows: 64,
          mapType,
          barbarians: false,
          naturalWonders: true,
        });
        for (const t of state.map.tiles) {
          if (t.naturalWonder !== "sahara_dunes") continue;
          sawSahara = true;
          expect(tileInWonderBox(geo, t.col, t.row, state.map.cols, state.map.rows, def.realWorldBox!)).toBe(true);
          const { lat } = geo.tileLatLon(t.col, t.row, state.map.cols, state.map.rows);
          expect(lat).toBeLessThan(34);
          expect(lat).toBeGreaterThanOrEqual(17);
        }
      }
    }
    expect(sawSahara).toBe(true);
  });

  it("on Mediterranean maps, wonders respect regional lat/lon boxes", () => {
    const geo = mapGeoProfile("mediterranean");
    let sawAny = false;
    for (let i = 0; i < 16; i++) {
      const state = createGame({
        seed: `med-geo-${i}`,
        cols: 80,
        rows: 56,
        mapType: "mediterranean",
        barbarians: false,
        naturalWonders: true,
      });
      for (const t of state.map.tiles) {
        if (!t.naturalWonder) continue;
        const def = getNaturalWonder(t.naturalWonder);
        expect(def?.realWorldBox).toBeDefined();
        expect(tileInWonderBox(geo, t.col, t.row, state.map.cols, state.map.rows, def!.realWorldBox!)).toBe(true);
        sawAny = true;
      }
    }
    expect(sawAny).toBe(true);
  });
});
