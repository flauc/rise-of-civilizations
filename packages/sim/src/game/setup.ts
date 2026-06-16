import { axialDistance, getTile, hashSeed, makeRng, offsetToAxial } from "@roc/shared";
import { CIV_IDS } from "@roc/data";
import { generateMap } from "../worldgen";
import type { GameState, Player } from "./state";
import { makeUnit } from "./state";
import { isPassableLand, TERRAIN_YIELDS } from "./terrain";
import { offsetNeighbors } from "./movement";
import { updateExplored } from "./visibility";
import { STARTING_TECHS, type UnitTypeId } from "./content";
import { placeFeatures } from "./features";
import { placeResources } from "./resources";
import type { BarbarianActivity } from "./state";

export interface NewGameOptions {
  cols?: number;
  rows?: number;
  seed?: number | string;
  /** Display names per civ slot. Length (or playerCount) sets the civ count. */
  playerNames?: string[];
  /** Total civ players (humans + AI). Defaults to playerNames.length or 2. */
  playerCount?: number;
  /** How many of the slots are human (default = all). The rest are AI civs. */
  humanSlots?: number;
  /** Barbarian intensity. `false` = none, `true` = normal. */
  barbarians?: boolean | BarbarianActivity;
  /** Starting gold treasury preset for major civ players. */
  startingGold?: "tight" | "balanced" | "generous";
  turnLimit?: number;
  /** Civilization id per slot; unspecified slots get a random unique civ. */
  civIds?: (string | undefined)[];
  /** Player color per slot; unspecified slots get the next unused palette color. */
  colors?: (string | undefined | null)[];
}

function normalizeBarbarians(v: boolean | BarbarianActivity | undefined): BarbarianActivity {
  if (v === false) return "none";
  if (v === true) return "normal";
  return v ?? "normal";
}

function startingGoldAmount(preset: "tight" | "balanced" | "generous" | undefined): number {
  switch (preset) {
    case "tight":
      return 25;
    case "generous":
      return 150;
    case "balanced":
    default:
      return 75;
  }
}

/**
 * Distinct player colors. Large enough to give every slot a unique color in the
 * biggest supported game (12 humans + 12 AI = 24). Exported so the lobby UI can
 * offer the exact same palette in its per-player color pickers.
 */
export const PLAYER_COLORS = [
  "#e0533d", "#3d7fe0", "#49b85a", "#e0b53d", "#a05ad0", "#3dc8c8",
  "#d060aa", "#e08a3d", "#5ad07a", "#7a5ad0", "#d07a5a", "#5a9ad0",
  "#c83737", "#2f5fb0", "#2e8f46", "#b89020", "#7a3fb0", "#1f9a9a",
  "#b03f86", "#b86a1f", "#3fa05f", "#5a3fa0", "#a05a3f", "#3f6f9a",
];

function startScore(state: GameState, col: number, row: number): number {
  const tile = getTile(state.map, col, row);
  if (!tile || !isPassableLand(tile.terrain)) return -Infinity;
  let score = TERRAIN_YIELDS[tile.terrain].food * 2;
  for (const n of offsetNeighbors(state.map, col, row)) {
    const nt = getTile(state.map, n.col, n.row);
    if (!nt) continue;
    const y = TERRAIN_YIELDS[nt.terrain];
    score += y.food + y.production * 0.5 + y.gold * 0.3;
  }
  return score;
}

/** Pick `count` well-separated, high-scoring land starts via greedy spreading. */
function findStarts(state: GameState, count: number): { col: number; row: number }[] {
  const { map } = state;
  const candidates: { col: number; row: number; score: number }[] = [];
  for (let row = 0; row < map.rows; row++) {
    for (let col = 0; col < map.cols; col++) {
      const score = startScore(state, col, row);
      if (score > -Infinity) candidates.push({ col, row, score });
    }
  }
  candidates.sort((a, b) => b.score - a.score);

  // Try to keep starts at least `minDist` apart, relaxing if we can't fit them.
  for (let minDist = Math.floor(Math.min(map.cols, map.rows) / 2); minDist >= 2; minDist--) {
    const picks: { col: number; row: number }[] = [];
    for (const c of candidates) {
      if (picks.every((p) => axialDistance(offsetToAxial(p), offsetToAxial(c)) >= minDist)) {
        picks.push({ col: c.col, row: c.row });
        if (picks.length === count) return picks;
      }
    }
    if (picks.length === count) return picks;
  }
  return candidates.slice(0, count).map((c) => ({ col: c.col, row: c.row }));
}

function spawn(state: GameState, ownerId: number, type: UnitTypeId, col: number, row: number): void {
  const id = state.nextEntityId++;
  state.units.set(id, makeUnit(id, ownerId, type, col, row));
}

function openNeighbor(state: GameState, col: number, row: number): { col: number; row: number } | null {
  for (const n of offsetNeighbors(state.map, col, row)) {
    const tile = getTile(state.map, n.col, n.row);
    if (tile && isPassableLand(tile.terrain) && ![...state.units.values()].some((u) => u.col === n.col && u.row === n.row)) {
      return { col: n.col, row: n.row };
    }
  }
  return null;
}

function spawnBarbarians(
  state: GameState,
  barbId: number,
  starts: { col: number; row: number }[],
  activity: BarbarianActivity,
): void {
  const { map } = state;
  const placed: { col: number; row: number }[] = [];
  const types: UnitTypeId[] =
    activity === "low"
      ? ["warrior", "slinger"]
      : activity === "high"
        ? ["warrior", "slinger", "warrior", "spearman", "warrior", "archer"]
        : ["warrior", "slinger", "warrior", "spearman"];
  let ti = 0;
  const farFromStarts = (col: number, row: number) =>
    starts.every((s) => axialDistance(offsetToAxial(s), offsetToAxial({ col, row })) > 5);
  for (let row = 2; row < map.rows - 2 && placed.length < types.length; row += 3) {
    for (let col = 2; col < map.cols - 2 && placed.length < types.length; col += 5) {
      const tile = getTile(map, col, row);
      if (!tile || !isPassableLand(tile.terrain)) continue;
      if (!farFromStarts(col, row)) continue;
      if (placed.some((p) => axialDistance(offsetToAxial(p), offsetToAxial({ col, row })) < 6)) continue;
      spawn(state, barbId, types[ti++ % types.length]!, col, row);
      placed.push({ col, row });
    }
  }
}

export function createGame(opts: NewGameOptions = {}): GameState {
  const cols = opts.cols ?? 48;
  const rows = opts.rows ?? 32;
  const seed = opts.seed ?? "rise";
  const count = Math.max(1, opts.playerCount ?? opts.playerNames?.length ?? 2);
  const humanSlots = opts.humanSlots ?? count;
  const activity = normalizeBarbarians(opts.barbarians);
  const startGold = startingGoldAmount(opts.startingGold);

  const map = generateMap({ cols, rows, seed });

  // Assign civs: honour requested ids, fill the rest with random unique civs.
  // Uniqueness is enforced here so two players can never share a civilization even
  // if a caller passes a duplicate — a requested civ already in use falls through
  // to the next random unused civ from the pool.
  const requested = opts.civIds ?? [];
  const rng = makeRng(hashSeed(`${seed}:civs`));
  const pool = CIV_IDS.filter((id) => !requested.includes(id));
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    const tmp = pool[i]!;
    pool[i] = pool[j]!;
    pool[j] = tmp;
  }
  let poolIdx = 0;
  const usedCivs = new Set<string>();
  const civForSlot = (i: number): string | undefined => {
    const req = requested[i];
    const civ = req && !usedCivs.has(req) ? req : pool[poolIdx++];
    if (civ) usedCivs.add(civ);
    return civ;
  };

  // Colors: honour requested colors, fill the rest with unused palette colors.
  // Uniqueness is enforced here so two players can never share a color even if a
  // caller passes a duplicate — a requested color already in use falls through to
  // the next free palette color.
  const requestedColors = opts.colors ?? [];
  const usedColors = new Set<string>();
  let colorIdx = 0;
  const nextFreeColor = (): string => {
    while (colorIdx < PLAYER_COLORS.length && usedColors.has(PLAYER_COLORS[colorIdx]!)) colorIdx++;
    return PLAYER_COLORS[colorIdx++] ?? "#aaaaaa";
  };
  const colorForSlot = (i: number): string => {
    const requestedColor = requestedColors[i];
    const color = requestedColor && !usedColors.has(requestedColor) ? requestedColor : nextFreeColor();
    usedColors.add(color);
    return color;
  };

  const players: Player[] = [];
  for (let i = 0; i < count; i++) {
    const baseName = opts.playerNames?.[i] ?? `Player ${i + 1}`;
    players.push({
      id: i,
      name: i < humanSlots ? baseName : `${baseName} (AI)`,
      color: colorForSlot(i),
      isHuman: i < humanSlots,
      isBarbarian: false,
      civId: civForSlot(i),
      gold: startGold,
      researched: new Set(STARTING_TECHS),
      researching: null,
      scienceProgress: 0,
      civicsResearched: new Set<string>(),
      researchingCivic: null,
      cultureProgress: 0,
      government: "chiefdom",
      policies: [],
      faith: 0,
      explored: new Set<string>(),
      resources: {},
      met: [],
      atWar: [],
      importedLuxuries: [],
      bribesPaid: 0,
      leaderAbilityLastUsedTurn: -Infinity,
      modifiers: [],
    });
  }
  const barbId = count;
  if (activity !== "none") {
    players.push({
      id: barbId,
      name: "Barbarians",
      color: "#9aa0a6",
      isHuman: false,
      isBarbarian: true,
      gold: 0,
      researched: new Set(STARTING_TECHS),
      researching: null,
      scienceProgress: 0,
      civicsResearched: new Set<string>(),
      researchingCivic: null,
      cultureProgress: 0,
      government: "chiefdom",
      policies: [],
      faith: 0,
      explored: new Set<string>(),
      resources: {},
      met: [],
      atWar: [],
      importedLuxuries: [],
      bribesPaid: 0,
      leaderAbilityLastUsedTurn: -Infinity,
      modifiers: [],
    });
  }

  const state: GameState = {
    map,
    players,
    units: new Map(),
    cities: new Map(),
    turn: 1,
    currentPlayerIndex: 0,
    nextEntityId: 1,
    log: [],
    gameOver: null,
    turnLimit: opts.turnLimit ?? 120,
    religions: [],
    tradeRoutes: [],
    works: [],
    completedWonders: [],
    relations: [],
    attitudes: [],
    reputation: {},
    contactQueue: [],
    diploProposals: [],
    barbarianActivity: activity,
    barbarianBribes: [],
    turnUpdates: [],
    nextTurnUpdateId: 1,
  };

  const starts = findStarts(state, count);
  starts.forEach((start, i) => {
    spawn(state, i, "settler", start.col, start.row);
    const adj = openNeighbor(state, start.col, start.row);
    if (adj) spawn(state, i, "warrior", adj.col, adj.row);
  });

  if (activity !== "none") spawnBarbarians(state, barbId, starts, activity);
  placeFeatures(state, starts, activity);
  placeResources(state, starts, seed);

  for (const p of players) updateExplored(state, p.id);
  return state;
}
