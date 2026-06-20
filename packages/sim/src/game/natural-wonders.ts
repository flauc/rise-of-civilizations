// Natural wonders: awe-inspiring features of the natural world placed on the map
// at world-gen (Mount Everest, the Grand Canyon, the Great Barrier Reef…). Each
// spans 1–4 contiguous tiles. The FIRST civ to sight a wonder claims a one-time
// bonus; worked by a citizen inside a civ's borders, each tile also yields bonus
// output; and the first civ to have sighted EVERY natural wonder earns a grand
// reward. All placement is deterministic (seeded) so the server and clients agree.

import { axialDistance, getTile, hashSeed, offsetToAxial, type Tile } from "@roc/shared";
import {
  ALL_NATURAL_WONDERS_BONUS,
  NATURAL_WONDER_DEFS,
  getNaturalWonder,
  type NaturalWonderBonus,
} from "@roc/data";
import { log, playerById, unitAt, type GameState, type Player } from "./state";
import { TECH_DEFS, type TechId } from "./content";
import { ZERO_YIELDS, type Yields } from "./terrain";
import { offsetNeighbors } from "./movement";

/** Bonus yields a citizen working a natural-wonder tile adds (excludes culture,
 *  which is summed separately in getCityYields — see naturalWonderCulture). */
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

/** Culture a worked natural-wonder tile adds to its city (culture is a city-level
 *  yield, not part of the per-tile Yields vector). */
export function naturalWonderCulture(tile: Tile): number {
  return getNaturalWonder(tile.naturalWonder)?.tileYields.culture ?? 0;
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
      const pick = techs[hashSeed(`nw-freetech:${player.id}:${state.turn}`) % techs.length]!;
      player.researched.add(pick);
      if (player.researching === pick) player.researching = null;
    }
  }
}

/** Human-readable summary of a reward, e.g. "+60 science, +30 faith". */
function bonusSummary(b: NaturalWonderBonus): string {
  const parts: string[] = [];
  if (b.science) parts.push(`+${b.science} science`);
  if (b.faith) parts.push(`+${b.faith} faith`);
  if (b.culture) parts.push(`+${b.culture} culture`);
  if (b.gold) parts.push(`+${b.gold} gold`);
  if (b.freeTech) parts.push("a free technology");
  return parts.join(", ");
}

/** Group every placed natural-wonder's tiles by wonder id (one map scan). */
function tilesByWonder(state: GameState): Map<string, { col: number; row: number }[]> {
  const byWonder = new Map<string, { col: number; row: number }[]>();
  for (const t of state.map.tiles) {
    if (!t.naturalWonder) continue;
    const arr = byWonder.get(t.naturalWonder);
    if (arr) arr.push({ col: t.col, row: t.row });
    else byWonder.set(t.naturalWonder, [{ col: t.col, row: t.row }]);
  }
  return byWonder;
}

/**
 * After a player's vision updates, award any newly-sighted natural wonders to
 * that player (first sight only) and, if they have now sighted them all, the
 * grand bonus. Announcements are world-wide so they appear in every player's
 * actions panel. Safe to call often — it no-ops once everything is claimed.
 */
export function checkNaturalWonderDiscovery(state: GameState, playerId: number): void {
  const player = playerById(state, playerId);
  if (!player || player.isBarbarian) return;
  if (!state.naturalWonderIds || state.naturalWonderIds.length === 0) return;
  state.discoveredWonders ??= {};

  const explored = player.explored;
  const sighted = (tiles: { col: number; row: number }[]): boolean =>
    tiles.some((t) => explored.has(`${t.col},${t.row}`));

  const byWonder = tilesByWonder(state);

  for (const [id, tiles] of byWonder) {
    if (state.discoveredWonders[id] !== undefined) continue;
    if (!sighted(tiles)) continue;
    const def = getNaturalWonder(id);
    if (!def) continue;
    state.discoveredWonders[id] = playerId;
    applyNaturalWonderBonus(state, player, def.discoveryBonus);
    const anchor = tiles[0]!;
    const summary = bonusSummary(def.discoveryBonus);
    log(
      state,
      summary
        ? `${player.name} discovered ${def.name} and claimed ${summary}.`
        : `${player.name} discovered ${def.name}.`,
      { world: true, actorId: playerId, tile: { col: anchor.col, row: anchor.row } },
    );
  }

  if (
    state.allNaturalWondersClaimedBy === undefined &&
    state.naturalWonderIds.every((id) => {
      const tiles = byWonder.get(id);
      return tiles ? sighted(tiles) : false;
    })
  ) {
    state.allNaturalWondersClaimedBy = playerId;
    applyNaturalWonderBonus(state, player, ALL_NATURAL_WONDERS_BONUS);
    log(
      state,
      `${player.name} has charted every natural wonder in the world and claimed ${bonusSummary(ALL_NATURAL_WONDERS_BONUS)}!`,
      { world: true, actorId: playerId },
    );
  }
}

// ---- placement at map generation -----------------------------------------

type Coord = { col: number; row: number };

/** Grow a contiguous cluster of `size` like-terrain, unoccupied tiles from an
 *  anchor, expanding to the lowest-hash eligible neighbour each step. */
function growCluster(
  state: GameState,
  validTerrain: string[],
  size: number,
  anchor: Coord,
  occupied: (t: Tile) => boolean,
  seed: number | string,
  wonderId: string,
): Coord[] {
  const { map } = state;
  const chosen: Coord[] = [anchor];
  const inCluster = new Set<string>([`${anchor.col},${anchor.row}`]);
  while (chosen.length < size) {
    const frontier: { col: number; row: number; key: number }[] = [];
    const seen = new Set<string>();
    for (const c of chosen) {
      for (const n of offsetNeighbors(map, c.col, c.row)) {
        const key = `${n.col},${n.row}`;
        if (inCluster.has(key) || seen.has(key)) continue;
        const t = getTile(map, n.col, n.row);
        if (!t || occupied(t) || !validTerrain.includes(t.terrain)) continue;
        if (unitAt(state, n.col, n.row)) continue;
        seen.add(key);
        frontier.push({ col: n.col, row: n.row, key: hashSeed(`nw-grow:${wonderId}:${n.col},${n.row}:${seed}`) });
      }
    }
    if (frontier.length === 0) break;
    frontier.sort((a, b) => a.key - b.key);
    const pick = frontier[0]!;
    chosen.push({ col: pick.col, row: pick.row });
    inCluster.add(`${pick.col},${pick.row}`);
  }
  return chosen;
}

/** Scatter natural wonders across the map (deterministic, away from starts).
 *  Records the placed ids on state.naturalWonderIds. Call before placeResources
 *  so resources never land on a wonder tile. */
export function placeNaturalWonders(
  state: GameState,
  starts: ({ col: number; row: number } | null)[],
  seed: number | string,
): void {
  const { map } = state;
  const placedIds: string[] = [];

  const occupied = (t: Tile): boolean =>
    !!t.naturalWonder || !!t.feature || !!t.resource || t.ownerCityId !== undefined;
  const farFromStarts = (col: number, row: number): boolean =>
    starts.every((s) => !s || axialDistance(offsetToAxial(s), offsetToAxial({ col, row })) >= 6);

  for (const def of NATURAL_WONDER_DEFS) {
    const anchors: { col: number; row: number; key: number }[] = [];
    for (const t of map.tiles) {
      if (occupied(t) || !def.validTerrain.includes(t.terrain)) continue;
      if (!farFromStarts(t.col, t.row)) continue;
      if (unitAt(state, t.col, t.row)) continue;
      anchors.push({ col: t.col, row: t.row, key: hashSeed(`nw:${def.id}:${t.col},${t.row}:${seed}`) });
    }
    anchors.sort((a, b) => a.key - b.key);

    for (const a of anchors) {
      const cluster = growCluster(state, def.validTerrain, def.size, a, occupied, seed, def.id);
      if (cluster.length === def.size) {
        for (const c of cluster) {
          const t = getTile(map, c.col, c.row);
          if (t) t.naturalWonder = def.id;
        }
        placedIds.push(def.id);
        break;
      }
    }
  }

  state.naturalWonderIds = placedIds;
}
