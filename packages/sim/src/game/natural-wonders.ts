// Natural wonders: awe-inspiring single tiles placed on the map at world-gen
// (Mount Everest, the Grand Canyon, the Great Barrier Reef…). Each occupies ONE
// full tile whose art replaces the terrain. The FIRST civ to sight a wonder
// claims a one-time bonus; worked by a citizen inside a civ's borders, the tile
// also yields strong bonus output; and the first civ to have sighted EVERY
// natural wonder earns a grand reward. All placement is deterministic (seeded).

import { axialDistance, getTile, hashSeed, offsetToAxial, type Tile } from "@roc/shared";
import {
  ALL_NATURAL_WONDERS_BONUS,
  NATURAL_WONDER_DEFS,
  getNaturalWonder,
  type NaturalWonderBonus,
} from "@roc/data";
import { log, playerById, unitAt, type GameState, type Player, type WonderDiscoveryInfo } from "./state";
import { TECH_DEFS, type TechId } from "./content";
import { ZERO_YIELDS, type Yields } from "./terrain";

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

  // Scale the number of wonders to the map size (the old generator placed one of
  // every wonder regardless of size). ~1 wonder per WONDER_TILES_PER tiles, floored
  // so small maps still get a few and capped at the unique wonders we have.
  // e.g. small≈4, medium≈7, large≈12, huge≈20, giant≈28.
  const WONDER_TILES_PER = 240;
  const targetCount = Math.max(
    3,
    Math.min(NATURAL_WONDER_DEFS.length, Math.round((map.cols * map.rows) / WONDER_TILES_PER)),
  );

  // Deterministically shuffle the wonder defs so each game places a varied subset
  // rather than always the first N in declaration order.
  const order = NATURAL_WONDER_DEFS
    .map((def) => ({ def, key: hashSeed(`nw-order:${def.id}:${seed}`) }))
    .sort((a, b) => a.key - b.key)
    .map((o) => o.def);

  const occupied = (t: Tile): boolean =>
    !!t.naturalWonder || !!t.feature || !!t.resource || t.ownerCityId !== undefined;
  const farFromStarts = (col: number, row: number): boolean =>
    starts.every((s) => !s || axialDistance(offsetToAxial(s), offsetToAxial({ col, row })) >= 6);
  const tooClose = (col: number, row: number): boolean =>
    placed.some((p) => axialDistance(offsetToAxial(p), offsetToAxial({ col, row })) < 4);

  for (const def of order) {
    if (placedIds.length >= targetCount) break;
    const candidates: { col: number; row: number; key: number }[] = [];
    for (const t of map.tiles) {
      // Never place a wonder on a river tile or an occupied/invalid tile.
      if (occupied(t) || t.river || !def.validTerrain.includes(t.terrain)) continue;
      if (!farFromStarts(t.col, t.row)) continue;
      if (unitAt(state, t.col, t.row)) continue;
      candidates.push({ col: t.col, row: t.row, key: hashSeed(`nw:${def.id}:${t.col},${t.row}:${seed}`) });
    }
    if (candidates.length === 0) continue;
    candidates.sort((a, b) => a.key - b.key);
    // Prefer a spot well-separated from other wonders; fall back to the best hash.
    const pick = candidates.find((c) => !tooClose(c.col, c.row)) ?? candidates[0]!;
    const t = getTile(map, pick.col, pick.row);
    if (t) {
      t.naturalWonder = def.id;
      placed.push({ col: pick.col, row: pick.row });
      placedIds.push(def.id);
    }
  }

  state.naturalWonderIds = placedIds;
}
