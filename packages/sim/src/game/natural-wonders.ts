// Natural wonders: awe-inspiring places stamped onto the map at world-gen (Mount
// Everest, the Grand Canyon, the Great Barrier Reef…). Most occupy ONE full tile
// whose art replaces the terrain; a few (the Amazon, the Grand Canyon) declare a
// multi-tile `footprint` and stamp the SAME wonder id onto every tile of it, so
// each of those tiles pays the same yields and sighting any one of them discovers
// the whole wonder. The FIRST civ to sight a wonder claims a one-time bonus; tiles
// inside a civ's borders passively inspire culture and tourism, and citizens working
// a tile also harvest its food/production/science/faith yields; the first civ to
// have sighted EVERY natural wonder earns a grand reward. All placement is
// deterministic (seeded).

import { axialAdd, axialDistance, axialNeighbor, axialToOffset, getTile, hashSeed, isMapTilePresent, isWater, offsetToAxial, type Axial, type GameMap, type Tile } from "@roc/shared";
import {
  ALL_NATURAL_WONDERS_BONUS,
  NATURAL_WONDER_DEFS,
  getNaturalWonder,
  naturalWonderFootprint,
  type NaturalWonderBonus,
  type NaturalWonderDef,
} from "@roc/data";
import { log, playerById, unitAt, citiesOf, type City, type GameState, type Player, type WonderDiscoveryInfo } from "./state";
import { TECH_DEFS, type TechId } from "./content";
import { mapGeoProfile, tileInWonderBox, wonderBoxOverlapsMap, assertNaturalWonderGeo, type RealWorldWonderBox } from "../map-geo";
import { isGeoMapType, isRegionalGeoMapType } from "../geo-maps";
import {
  anchorRegionalWonderTerrain,
  footprintFitsOnLand,
  isInlandNaturalWonder,
  regionalEligibleWonderCount,
  regionalInlandSeaOk,
  stampWonderFootprint,
  REGIONAL_WONDER_SPACING,
} from "../regional-wonder-terrain";
import { isPassableLand, ZERO_YIELDS, type Yields } from "./terrain";
import { cityTerritory } from "./territory";

// ---- footprints ----------------------------------------------------------

/** The offset tiles a wonder placed with its anchor at (col,row) would occupy. */
export function naturalWonderFootprintTiles(
  def: NaturalWonderDef | undefined,
  col: number,
  row: number,
): { col: number; row: number }[] {
  const anchor = offsetToAxial({ col, row });
  return naturalWonderFootprint(def).map((o) =>
    axialToOffset(axialAdd(anchor, o as Axial)),
  );
}

/**
 * True when (col,row) is the ANCHOR tile of its wonder, i.e. the tile the sprite
 * hangs from. A single-tile wonder is always its own anchor; a multi-tile wonder's
 * anchor is the one tile from which every footprint offset lands on a tile carrying
 * the same wonder id (only one tile of a placed footprint can satisfy that, and a
 * wonder is never placed twice in a world).
 */
export function isNaturalWonderAnchor(map: GameMap, col: number, row: number): boolean {
  const tile = getTile(map, col, row);
  const id = tile?.naturalWonder;
  if (!id) return false;
  const def = getNaturalWonder(id);
  if (!def?.footprint) return true;
  return naturalWonderFootprintTiles(def, col, row).every(
    (t) => getTile(map, t.col, t.row)?.naturalWonder === id,
  );
}

/**
 * The anchor tile of the wonder that (col,row) belongs to, i.e. the tile its sprite
 * hangs from. A single-tile wonder returns itself; any tile of a multi-tile
 * footprint returns the shared anchor. Undefined when the tile holds no wonder.
 */
export function naturalWonderAnchorFor(
  map: GameMap,
  col: number,
  row: number,
): { col: number; row: number } | undefined {
  const id = getTile(map, col, row)?.naturalWonder;
  if (!id) return undefined;
  const def = getNaturalWonder(id);
  if (!def?.footprint) return { col, row };
  const here = offsetToAxial({ col, row });
  for (const o of def.footprint) {
    const cand = axialToOffset({ q: here.q - o.q, r: here.r - o.r });
    if (isNaturalWonderAnchor(map, cand.col, cand.row)) return cand;
  }
  return undefined;
}

/**
 * The tile of a wonder's footprint that its sprite should be PAINTED from: the last
 * one the renderer reaches in row-major (top row first, then left to right) draw
 * order. Painting there means every tile of the wonder has already laid down its own
 * terrain, so the sprite never leaves a hole where its art falls a pixel short of a
 * hex edge. Single-tile wonders paint from themselves.
 */
export function naturalWonderSpritePaintTile(
  map: GameMap,
  col: number,
  row: number,
): { col: number; row: number } | undefined {
  const id = getTile(map, col, row)?.naturalWonder;
  if (!id) return undefined;
  const def = getNaturalWonder(id);
  if (!def?.footprint) return { col, row };
  const anchor = naturalWonderAnchorFor(map, col, row);
  if (!anchor) return undefined;
  let last: { col: number; row: number } | undefined;
  for (const t of naturalWonderFootprintTiles(def, anchor.col, anchor.row)) {
    if (!last || t.row > last.row || (t.row === last.row && t.col > last.col)) last = t;
  }
  return last;
}

/** Every tile of every placed wonder, keyed by wonder id (one map scan). */
export function naturalWonderTilesOnMap(
  map: GameMap,
): Map<string, { col: number; row: number }[]> {
  const out = new Map<string, { col: number; row: number }[]>();
  for (const t of map.tiles) {
    if (!t.naturalWonder) continue;
    const list = out.get(t.naturalWonder);
    if (list) list.push({ col: t.col, row: t.row });
    else out.set(t.naturalWonder, [{ col: t.col, row: t.row }]);
  }
  return out;
}

/** The anchor tile of a placed wonder id, or undefined when it is not on the map. */
export function naturalWonderAnchorTile(
  map: GameMap,
  id: string,
): { col: number; row: number } | undefined {
  const tiles = naturalWonderTilesOnMap(map).get(id);
  return tiles?.find((t) => isNaturalWonderAnchor(map, t.col, t.row)) ?? tiles?.[0];
}

/** Bonus yields a citizen working a natural-wonder tile adds (culture is territorial,
 *  not from working — see naturalWonderTerritoryCulture). */
export function naturalWonderYields(tile: Tile): Yields {
  const def = getNaturalWonder(tile.naturalWonder);
  if (!def) return ZERO_YIELDS;
  const y = def.tileYields;
  return {
    food: y.food ?? 0,
    production: y.production ?? 0,
    gold: y.gold ?? 0,
    science: y.science ?? 0,
    faith: y.faith ?? 0,
  };
}

/** Culture listed on the wonder definition (may be 0). */
export function naturalWonderCultureYield(tile: Tile): number {
  return getNaturalWonder(tile.naturalWonder)?.tileYields.culture ?? 0;
}

/** Culture a worked natural-wonder tile adds (alias of the def yield). */
export function naturalWonderCulture(tile: Tile): number {
  return naturalWonderCultureYield(tile);
}

/** Passive culture each turn while the wonder tile sits inside a city's borders. */
export function naturalWonderTerritoryCulture(tile: Tile): number {
  if (!tile.naturalWonder) return 0;
  const c = naturalWonderCultureYield(tile);
  return c > 0 ? c : 1;
}

/** Tourism (renown) projected while the wonder is held in your territory. */
export function naturalWonderTerritoryTourism(tile: Tile): number {
  if (!tile.naturalWonder) return 0;
  return Math.max(2, naturalWonderTerritoryCulture(tile));
}

/** Sum passive culture from every natural-wonder tile in a city's territory. */
export function naturalWonderTerritoryCultureForCity(state: GameState, city: City): number {
  let total = 0;
  for (const { col, row } of cityTerritory(state, city)) {
    const tile = getTile(state.map, col, row);
    if (tile) total += naturalWonderTerritoryCulture(tile);
  }
  return total;
}

/** Total tourism from natural wonders held across a player's empire. */
export function naturalWonderTerritoryTourismForPlayer(state: GameState, playerId: number): number {
  let total = 0;
  for (const city of citiesOf(state, playerId)) {
    for (const { col, row } of cityTerritory(state, city)) {
      const tile = getTile(state.map, col, row);
      if (tile) total += naturalWonderTerritoryTourism(tile);
    }
  }
  return total;
}

// ---- discovery -----------------------------------------------------------

function availableTechsFor(player: Player): TechId[] {
  return (Object.keys(TECH_DEFS) as TechId[]).filter(
    (t) => !player.researched.has(t) && TECH_DEFS[t].prereqs.every((p) => player.researched.has(p)),
  );
}

/** Apply a one-time natural-wonder reward to a civilization's empire pools. */
export function applyNaturalWonderBonus(state: GameState, player: Player, bonus: NaturalWonderBonus): void {
  if (bonus.science) player.scienceProgress += bonus.science;
  if (bonus.culture) player.cultureProgress += bonus.culture;
  if (bonus.faith) player.faith += bonus.faith;
  if (bonus.gold) player.gold += bonus.gold;
  if (bonus.freeTech) {
    const techs = availableTechsFor(player);
    if (techs.length > 0) {
      const pick = techs[hashSeed(`nw-freetech:${player.id}:${state.turn}:${player.researched.size}`) % techs.length]!;
      player.researched.add(pick);
      if (player.researching === pick) player.researching = null;
    }
  }
}

/** Human-readable summary of a reward, e.g. "+90 science, +40 faith". */
export function naturalWonderBonusSummary(b: NaturalWonderBonus): string {
  const parts: string[] = [];
  if (b.science) parts.push(`+${b.science} science`);
  if (b.faith) parts.push(`+${b.faith} faith`);
  if (b.culture) parts.push(`+${b.culture} culture`);
  if (b.gold) parts.push(`+${b.gold} gold`);
  if (b.freeTech) parts.push("a free technology");
  return parts.join(", ");
}

/**
 * After a player's vision updates, award any newly-sighted natural wonders to
 * that player (first sight only) and, if they have now sighted them all, the
 * grand bonus. Each discovery is announced world-wide (so it appears in every
 * player's actions panel) and carries rich data so the discovering civ gets a
 * dialog. Safe to call often — it no-ops once everything is claimed.
 */
export function checkNaturalWonderDiscovery(state: GameState, playerId: number): void {
  const player = playerById(state, playerId);
  if (!player || player.isBarbarian) return;
  if (!state.naturalWonderIds || state.naturalWonderIds.length === 0) return;
  state.discoveredWonders ??= {};

  const explored = player.explored;
  // wonder id -> every tile of its footprint, from one map scan.
  const tilesOf = naturalWonderTilesOnMap(state.map);
  const sighted = (tiles: readonly { col: number; row: number }[]): boolean =>
    tiles.some((t) => explored.has(`${t.col},${t.row}`));
  const allBonusText = naturalWonderBonusSummary(ALL_NATURAL_WONDERS_BONUS);

  for (const [id, tiles] of tilesOf) {
    if (state.discoveredWonders[id] !== undefined) continue;
    if (!sighted(tiles)) continue;
    // Announce (and centre the camera) on the anchor tile the sprite hangs from.
    const tile = tiles.find((t) => isNaturalWonderAnchor(state.map, t.col, t.row)) ?? tiles[0]!;
    const def = getNaturalWonder(id);
    if (!def) continue;
    const firstForPlayer = !Object.values(state.discoveredWonders).includes(playerId);
    state.discoveredWonders[id] = playerId;
    applyNaturalWonderBonus(state, player, def.discoveryBonus);
    const bonusText = naturalWonderBonusSummary(def.discoveryBonus);
    const info: WonderDiscoveryInfo = {
      wonderId: id,
      wonderName: def.name,
      bonusText,
      firstDiscovery: firstForPlayer,
      allBonusText: firstForPlayer ? allBonusText : undefined,
    };
    log(
      state,
      bonusText
        ? `${player.name} discovered ${def.name} and claimed ${bonusText}.`
        : `${player.name} discovered ${def.name}.`,
      { world: true, actorId: playerId, tile, wonder: info },
    );
  }

  if (
    state.allNaturalWondersClaimedBy === undefined &&
    state.naturalWonderIds.every((id) => {
      const tiles = tilesOf.get(id);
      return tiles ? sighted(tiles) : false;
    })
  ) {
    state.allNaturalWondersClaimedBy = playerId;
    applyNaturalWonderBonus(state, player, ALL_NATURAL_WONDERS_BONUS);
    log(
      state,
      `${player.name} has charted every natural wonder in the world and claimed ${allBonusText}!`,
      {
        world: true,
        actorId: playerId,
        wonder: { wonderName: "every natural wonder", bonusText: allBonusText, allComplete: true },
      },
    );
  }
}

// ---- placement at map generation -----------------------------------------

/**
 * Scatter natural wonders across the map (deterministic, away from starts and
 * spaced apart). A wonder with a multi-tile `footprint` is only placed where its
 * WHOLE footprint fits, and every tile of it is stamped with the wonder id.
 * Records the placed ids on state.naturalWonderIds. Call before placeResources so
 * resources never land on a wonder tile.
 */
export function placeNaturalWonders(
  state: GameState,
  starts: ({ col: number; row: number } | null)[],
  seed: number | string,
): void {
  const { map } = state;
  const placedIds: string[] = [];
  const placed: { col: number; row: number }[] = [];

  // Scale wonder count to map size: ~8–10 on giant maps, fewer on small ones.
  // Cap at 10 so the world never feels overcrowded with wonders.
  const WONDER_TILES_PER = 750;
  const geo = mapGeoProfile(map.mapType);

  // Regional maps: stamp authentic terrain at each wonder's lat/lon anchor first.
  const regionalAnchors = anchorRegionalWonderTerrain(map);

  const areaTarget = Math.max(
    3,
    Math.min(10, Math.round((map.cols * map.rows) / WONDER_TILES_PER)),
  );
  const eligibleRegional = regionalEligibleWonderCount(map);
  const targetCount =
    eligibleRegional > 0 ? Math.min(areaTarget, eligibleRegional) : areaTarget;

  const MIN_WONDER_SPACING = eligibleRegional > 0 ? REGIONAL_WONDER_SPACING : 10;

  const occupied = (t: Tile): boolean =>
    !!t.naturalWonder || !!t.feature || !!t.resource || t.ownerCityId !== undefined;

  /** Fast pre-check: terrain + geo box (ignores coastal rules). Used to sort placement order. */
  const roughGeoTerrainMatches = (def: (typeof NATURAL_WONDER_DEFS)[number]): number => {
    if (!wonderBoxOverlapsMap(geo, map.cols, map.rows, def.realWorldBox)) return 0;
    let n = 0;
    for (const t of map.tiles) {
      if (occupied(t) || t.river || !def.validTerrain.includes(t.terrain)) continue;
      if (!tileInWonderBox(geo, t.col, t.row, map.cols, map.rows, def.realWorldBox)) continue;
      n++;
      if (n >= 3) break;
    }
    return n;
  };

  // Multi-tile wonders go FIRST: they are the showpieces, they need several free
  // tiles in a row, and their lat/lon boxes are the tightest, so if they do not get
  // first pick they are crowded out of every slot. After them, prefer wonders that
  // can actually fit this map's geography, then shuffle within tiers.
  const order = NATURAL_WONDER_DEFS
    .map((def) => ({
      def,
      multi: def.footprint ? 1 : 0,
      rough: roughGeoTerrainMatches(def),
      key: hashSeed(`nw-order:${def.id}:${seed}`),
    }))
    .sort((a, b) => b.multi - a.multi || b.rough - a.rough || a.key - b.key)
    .map((o) => o.def);

  // Coastline wonders (sea cliffs) must sit on a LAND tile that borders open water,
  // so the neighbouring sea paints the shoreline against the cliff.
  const isSea = (col: number, row: number): boolean => {
    const n = getTile(map, col, row);
    return !!n && (n.terrain === "ocean" || n.terrain === "coast");
  };
  const bordersSea = (col: number, row: number): boolean => {
    const here = offsetToAxial({ col, row });
    for (let d = 0; d < 6; d++) {
      const nb = axialToOffset(axialNeighbor(here, d));
      if (isSea(nb.col, nb.row)) return true;
    }
    return false;
  };
  // Front-facing cliff (Dover): both LOWER hex edges — SW (dir 4) and SE (dir 5),
  // the two edges meeting at the bottom vertex — must be open sea, so the fixed
  // "cliff on the front edges" art already points at the water.
  const frontFacesSea = (col: number, row: number): boolean => {
    const here = offsetToAxial({ col, row });
    return [4, 5].every((d) => {
      const nb = axialToOffset(axialNeighbor(here, d));
      return isSea(nb.col, nb.row);
    });
  };
  const neighborTilesAt = (col: number, row: number): Tile[] => {
    const here = offsetToAxial({ col, row });
    const out: Tile[] = [];
    for (let d = 0; d < 6; d++) {
      const nb = axialToOffset(axialNeighbor(here, d));
      const t = getTile(map, nb.col, nb.row);
      if (t) out.push(t);
    }
    return out;
  };
  const bordersLand = (col: number, row: number): boolean =>
    neighborTilesAt(col, row).some((n) => isPassableLand(n.terrain));
  /** Every neighbour is open ocean (not coast beside land). */
  const ringedByOcean = (col: number, row: number): boolean =>
    neighborTilesAt(col, row).every((n) => n.terrain === "ocean");
  const besideWater = (t: Tile): boolean => {
    if (isWater(t.terrain) || t.river || t.riverLake) return true;
    return neighborTilesAt(t.col, t.row).some(
      (n) => isWater(n.terrain) || n.river || n.riverLake,
    );
  };
  type RealWorldBox = RealWorldWonderBox;
  const farFromStarts = (col: number, row: number): boolean => {
    const minDist = isGeoMapType(map.mapType) ? 4 : 6;
    return starts.every((s) => !s || axialDistance(offsetToAxial(s), offsetToAxial({ col, row })) >= minDist);
  };
  // Hard spacing guarantee: two wonders never sit too close on the same map. For a
  // multi-tile wonder every tile of the footprint has to clear the spacing.
  const tooClose = (col: number, row: number, def?: (typeof NATURAL_WONDER_DEFS)[number]): boolean => {
    const own = def ? naturalWonderFootprintTiles(def, col, row) : [{ col, row }];
    return own.some((o) =>
      placed.some((p) => axialDistance(offsetToAxial(p), offsetToAxial(o)) < MIN_WONDER_SPACING),
    );
  };
  const inWonderRegion = (col: number, row: number, box: RealWorldBox): boolean =>
    tileInWonderBox(geo, col, row, map.cols, map.rows, box);

  // A single tile's own suitability: terrain, emptiness, distance from starts.
  // Every tile of a multi-tile footprint must pass this.
  const tileIsFreeFor = (def: (typeof NATURAL_WONDER_DEFS)[number], col: number, row: number): boolean => {
    const t = getTile(map, col, row);
    if (!t || !isMapTilePresent(map, col, row)) return false;
    if (occupied(t) || t.river || !def.validTerrain.includes(t.terrain)) return false;
    if (!farFromStarts(col, row)) return false;
    if (unitAt(state, col, row)) return false;
    return true;
  };

  // The ANCHOR tile carries the geo box and the shoreline/ocean placement rules
  // (only single-tile wonders use those flags today), and anchors the sprite.
  const tileAcceptsWonder = (def: (typeof NATURAL_WONDER_DEFS)[number], col: number, row: number): boolean => {
    const t = getTile(map, col, row);
    if (!t || !tileIsFreeFor(def, col, row)) return false;
    if (def.openOcean && (t.terrain !== "ocean" || !ringedByOcean(col, row))) return false;
    if (def.coastalWater && (!isWater(t.terrain) || !bordersLand(col, row))) return false;
    if (def.adjacentToWater && !besideWater(t)) return false;
    if (def.coastalFront) {
      if (!frontFacesSea(col, row)) return false;
    } else if (def.coastal && !bordersSea(col, row)) return false;
    if (isRegionalGeoMapType(map.mapType) && isInlandNaturalWonder(def) && !regionalInlandSeaOk(map, col, row)) return false;
    if (!inWonderRegion(col, row, def.realWorldBox)) return false;
    // Multi-tile wonders only fit where every tile of the footprint is free too.
    return naturalWonderFootprintTiles(def, col, row).every((f) => tileIsFreeFor(def, f.col, f.row));
  };

  const placeWonderAt = (def: (typeof NATURAL_WONDER_DEFS)[number], col: number, row: number): boolean => {
    if (!tileAcceptsWonder(def, col, row) || tooClose(col, row, def)) return false;
    const tiles = naturalWonderFootprintTiles(def, col, row);
    for (const f of tiles) {
      const t = getTile(map, f.col, f.row);
      if (!t) return false; // checked above; belt and braces before mutating
    }
    for (const f of tiles) {
      getTile(map, f.col, f.row)!.naturalWonder = def.id;
      placed.push(f);
    }
    placedIds.push(def.id);
    return true;
  };

  for (const def of order) {
    if (placedIds.length >= targetCount) break;
    const anchor = regionalAnchors.get(def.id);
    if (anchor && placeWonderAt(def, anchor.col, anchor.row)) continue;

    const candidates: { col: number; row: number; key: number }[] = [];
    for (const t of map.tiles) {
      if (!tileAcceptsWonder(def, t.col, t.row)) continue;
      candidates.push({ col: t.col, row: t.row, key: hashSeed(`nw:${def.id}:${t.col},${t.row}:${seed}`) });
    }
    if (candidates.length === 0) {
      if (placeShowpieceOnStampedTerrain(def)) continue;
      continue;
    }
    candidates.sort((a, b) => a.key - b.key);
    const pick = candidates.find((c) => !tooClose(c.col, c.row, def));
    if (!pick) {
      placeShowpieceOnStampedTerrain(def);
      continue;
    }
    placeWonderAt(def, pick.col, pick.row);
  }

  assertNaturalWonderGeo(map);
  state.naturalWonderIds = placedIds;

  /**
   * Last resort for a MULTI-TILE showpiece (the Amazon, the Grand Canyon): its
   * lat/lon box is the tightest on the list and world-gen does not always grow the
   * right ground there — the Colorado Plateau, for instance, usually comes out as
   * plains, so a canyon that insists on mesa/desert would simply never appear. When
   * a showpiece finds no home, stamp its own characteristic terrain across a
   * footprint-sized patch of empty land inside its box (the same trick regional maps
   * already use to make the Matterhorn mountainous) and settle it there. Ordinary
   * one-tile wonders are left to the normal pass: there are thirty of them and the
   * world does not miss the few that do not fit.
   */
  function placeShowpieceOnStampedTerrain(def: (typeof NATURAL_WONDER_DEFS)[number]): boolean {
    if (!def.footprint) return false;
    if (!wonderBoxOverlapsMap(geo, map.cols, map.rows, def.realWorldBox)) return false;
    // Same rules as a normal anchor, but judged on the land itself rather than on
    // the terrain type we are about to replace.
    const usable = (col: number, row: number): boolean => {
      const t = getTile(map, col, row);
      if (!t || !isMapTilePresent(map, col, row)) return false;
      if (occupied(t) || isWater(t.terrain)) return false;
      if (!farFromStarts(col, row)) return false;
      return !unitAt(state, col, row);
    };
    const spots: { col: number; row: number; key: number }[] = [];
    for (const t of map.tiles) {
      if (!inWonderRegion(t.col, t.row, def.realWorldBox)) continue;
      if (!footprintFitsOnLand(map, def, t.col, t.row)) continue;
      if (!naturalWonderFootprintTiles(def, t.col, t.row).every((f) => usable(f.col, f.row))) continue;
      if (tooClose(t.col, t.row, def)) continue;
      spots.push({ col: t.col, row: t.row, key: hashSeed(`nw-stamp:${def.id}:${t.col},${t.row}:${seed}`) });
    }
    if (spots.length === 0) return false;
    spots.sort((a, b) => a.key - b.key);
    const spot = spots[0]!;
    stampWonderFootprint(map, def, spot);
    return placeWonderAt(def, spot.col, spot.row);
  }
}
