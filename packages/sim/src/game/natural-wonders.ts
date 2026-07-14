// Natural wonders: awe-inspiring single tiles placed on the map at world-gen
// (Mount Everest, the Grand Canyon, the Great Barrier Reef…). Each occupies ONE
// full tile whose art replaces the terrain. The FIRST civ to sight a wonder
// claims a one-time bonus; tiles inside a civ's borders passively inspire culture
// and tourism, and citizens working the tile also harvest its food/production/
// science/faith yields; the first civ to have sighted EVERY natural wonder earns
// a grand reward. All placement is deterministic (seeded).

import { axialDistance, axialNeighbor, axialToOffset, getTile, hashSeed, isWater, offsetToAxial, type Tile } from "@roc/shared";
import {
  ALL_NATURAL_WONDERS_BONUS,
  NATURAL_WONDER_DEFS,
  getNaturalWonder,
  type NaturalWonderBonus,
} from "@roc/data";
import { log, playerById, unitAt, citiesOf, type City, type GameState, type Player, type WonderDiscoveryInfo } from "./state";
import { TECH_DEFS, type TechId } from "./content";
import { inRealWorldWonderBox, worldTileLatLon } from "../worldmask";
import { isPassableLand, ZERO_YIELDS, type Yields } from "./terrain";
import { cityTerritory } from "./territory";

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
  // wonder id -> its (single) tile, from one map scan.
  const tileOf = new Map<string, { col: number; row: number }>();
  for (const t of state.map.tiles) {
    if (t.naturalWonder && !tileOf.has(t.naturalWonder)) tileOf.set(t.naturalWonder, { col: t.col, row: t.row });
  }
  const allBonusText = naturalWonderBonusSummary(ALL_NATURAL_WONDERS_BONUS);

  for (const [id, tile] of tileOf) {
    if (state.discoveredWonders[id] !== undefined) continue;
    if (!explored.has(`${tile.col},${tile.row}`)) continue;
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
      const t = tileOf.get(id);
      return t ? explored.has(`${t.col},${t.row}`) : false;
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
 * Scatter single-tile natural wonders across the map (deterministic, away from
 * starts and spaced apart). Records the placed ids on state.naturalWonderIds.
 * Call before placeResources so resources never land on a wonder tile.
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
  const targetCount = Math.max(
    3,
    Math.min(10, Math.round((map.cols * map.rows) / WONDER_TILES_PER)),
  );

  // Deterministically shuffle the wonder defs so each game places a varied subset
  // rather than always the first N in declaration order.
  const order = NATURAL_WONDER_DEFS
    .map((def) => ({ def, key: hashSeed(`nw-order:${def.id}:${seed}`) }))
    .sort((a, b) => a.key - b.key)
    .map((o) => o.def);

  const occupied = (t: Tile): boolean =>
    !!t.naturalWonder || !!t.feature || !!t.resource || t.ownerCityId !== undefined;
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
  const farFromStarts = (col: number, row: number): boolean => {
    const minDist = realWorld ? 4 : 6;
    return starts.every((s) => !s || axialDistance(offsetToAxial(s), offsetToAxial({ col, row })) >= minDist);
  };
  // Hard spacing guarantee: two wonders never sit within 10 hexes of each other.
  const MIN_WONDER_SPACING = 10;
  const tooClose = (col: number, row: number): boolean =>
    placed.some((p) => axialDistance(offsetToAxial(p), offsetToAxial({ col, row })) < MIN_WONDER_SPACING);
  const realWorld = map.mapType === "realworld";
  type RealWorldBox = NonNullable<(typeof NATURAL_WONDER_DEFS)[number]["realWorldBox"]>;
  const REAL_WORLD_BOX_PAD = 2;
  const expandedBox = (box: RealWorldBox): RealWorldBox => ({
    latMin: box.latMin - REAL_WORLD_BOX_PAD,
    latMax: box.latMax + REAL_WORLD_BOX_PAD,
    lonMin: box.lonMin - REAL_WORLD_BOX_PAD,
    lonMax: box.lonMax + REAL_WORLD_BOX_PAD,
  });
  const inWonderRegion = (col: number, row: number, box: RealWorldBox): boolean => {
    const { lat, lon } = worldTileLatLon(col, row, map.cols, map.rows);
    return inRealWorldWonderBox(lat, lon, realWorld ? expandedBox(box) : box);
  };

  for (const def of order) {
    if (placedIds.length >= targetCount) break;
    const candidates: { col: number; row: number; key: number }[] = [];
    for (const t of map.tiles) {
      // Never place a wonder on a river tile or an occupied/invalid tile.
      if (occupied(t) || t.river || !def.validTerrain.includes(t.terrain)) continue;
      // Coastline wonders additionally require adjacent sea. Front-facing cliffs
      // need their two lower edges on the water; others just need any sea neighbour.
      if (def.openOcean && (t.terrain !== "ocean" || !ringedByOcean(t.col, t.row))) continue;
      if (def.coastalWater && (!isWater(t.terrain) || !bordersLand(t.col, t.row))) continue;
      if (def.adjacentToWater && !besideWater(t)) continue;
      if (def.coastalFront) {
        if (!frontFacesSea(t.col, t.row)) continue;
      } else if (def.coastal && !bordersSea(t.col, t.row)) continue;
      if (realWorld && def.realWorldBox && !inWonderRegion(t.col, t.row, def.realWorldBox)) continue;
      if (!farFromStarts(t.col, t.row)) continue;
      if (unitAt(state, t.col, t.row)) continue;
      candidates.push({ col: t.col, row: t.row, key: hashSeed(`nw:${def.id}:${t.col},${t.row}:${seed}`) });
    }
    if (candidates.length === 0) continue;
    candidates.sort((a, b) => a.key - b.key);
    // Spacing is a hard rule: if this wonder can't be placed far enough from the
    // others, skip it (another def with different terrain may still fit).
    const pick = candidates.find((c) => !tooClose(c.col, c.row));
    if (!pick) continue;
    const t = getTile(map, pick.col, pick.row);
    if (t) {
      t.naturalWonder = def.id;
      placed.push({ col: pick.col, row: pick.row });
      placedIds.push(def.id);
    }
  }

  state.naturalWonderIds = placedIds;
}
