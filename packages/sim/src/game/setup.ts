import { axialDistance, getTile, offsetToAxial } from "@roc/shared";
import { generateMap } from "../worldgen";
import type { GameState, Player } from "./state";
import { makeUnit } from "./state";
import { isPassableLand, TERRAIN_YIELDS } from "./terrain";
import { offsetNeighbors } from "./movement";
import { updateExplored } from "./visibility";
import type { UnitTypeId } from "./content";

export interface NewGameOptions {
  cols?: number;
  rows?: number;
  seed?: number | string;
  playerNames?: [string, string];
  barbarians?: boolean;
}

const PLAYER_COLORS = ["#e0533d", "#3d7fe0"];
const BARBARIAN_ID = 2;

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

function findStart(state: GameState, minCol: number, maxCol: number): { col: number; row: number } | null {
  const { map } = state;
  let best: { col: number; row: number; score: number } | null = null;
  const rowLo = Math.floor(map.rows * 0.3);
  const rowHi = Math.ceil(map.rows * 0.7);
  for (let row = rowLo; row <= rowHi; row++) {
    for (let col = minCol; col <= maxCol; col++) {
      const score = startScore(state, col, row);
      if (best === null || score > best.score) best = { col, row, score };
    }
  }
  return best && best.score > -Infinity ? { col: best.col, row: best.row } : null;
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

function spawnBarbarians(state: GameState, starts: ({ col: number; row: number } | null)[]): void {
  const { map } = state;
  const placed: { col: number; row: number }[] = [];
  const types: UnitTypeId[] = ["warrior", "slinger", "warrior", "spearman"];
  let ti = 0;
  const farFromStarts = (col: number, row: number) =>
    starts.every(
      (s) => !s || axialDistance(offsetToAxial(s), offsetToAxial({ col, row })) > 5,
    );
  for (let row = 2; row < map.rows - 2 && placed.length < types.length; row += 3) {
    for (let col = 2; col < map.cols - 2 && placed.length < types.length; col += 5) {
      const tile = getTile(map, col, row);
      if (!tile || !isPassableLand(tile.terrain)) continue;
      if (!farFromStarts(col, row)) continue;
      if (placed.some((p) => axialDistance(offsetToAxial(p), offsetToAxial({ col, row })) < 6)) continue;
      spawn(state, BARBARIAN_ID, types[ti++ % types.length]!, col, row);
      placed.push({ col, row });
    }
  }
}

export function createGame(opts: NewGameOptions = {}): GameState {
  const cols = opts.cols ?? 48;
  const rows = opts.rows ?? 32;
  const seed = opts.seed ?? "rise-m2";
  const names = opts.playerNames ?? ["Player 1", "Player 2"];
  const withBarbarians = opts.barbarians ?? true;

  const map = generateMap({ cols, rows, seed });
  const players: Player[] = names.map((name, i) => ({
    id: i,
    name,
    color: PLAYER_COLORS[i] ?? "#aaaaaa",
    isHuman: true,
    isBarbarian: false,
    gold: 0,
    researched: new Set(["agriculture"]),
    researching: null,
    scienceProgress: 0,
    explored: new Set<string>(),
  }));
  if (withBarbarians) {
    players.push({
      id: BARBARIAN_ID,
      name: "Barbarians",
      color: "#9aa0a6",
      isHuman: false,
      isBarbarian: true,
      gold: 0,
      researched: new Set(["agriculture"]),
      researching: null,
      scienceProgress: 0,
      explored: new Set<string>(),
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
  };

  const starts = [
    findStart(state, Math.floor(cols * 0.1), Math.floor(cols * 0.35)),
    findStart(state, Math.floor(cols * 0.65), Math.floor(cols * 0.9)),
  ];

  starts.forEach((start, i) => {
    if (!start) return;
    spawn(state, i, "settler", start.col, start.row);
    const adj = openNeighbor(state, start.col, start.row);
    if (adj) spawn(state, i, "warrior", adj.col, adj.row);
  });

  if (withBarbarians) spawnBarbarians(state, starts);

  for (const p of players) updateExplored(state, p.id);
  return state;
}
