// Headless AI-vs-AI seed-game harness.
//
// Plays deterministic all-AI games (one passive human observer + AI rivals) to
// completion or a turn cap, then reports aggregate metrics that expose AI health:
//   - peace/war dynamics: wars declared, peace treaties, civs eliminated
//   - wonder behaviour: wonders started / completed / ABANDONED per civ
//     (abandoned = broke ground then dropped it = "blindly committed" waste)
//   - outcomes: winner, victory condition, game length, final scores
//
// Run:  bun run tools/ai-sim/playout.ts
//       bun run tools/ai-sim/playout.ts --games 8 --turns 220 --civs 6
//       bun run tools/ai-sim/playout.ts --barbarians low --json out.json
//
// Deterministic per seed, so run it before and after an AI change and diff.

import {
  createGame,
  endTurn,
  beginTurn,
  worksOf,
  citiesOf,
  playerScore,
  type GameState,
} from "@roc/sim";

interface Args {
  games: number;
  turns: number;
  civs: number;
  barbarians: string | boolean;
  seedPrefix: string;
  cols: number;
  rows: number;
  turnLimit?: number;
  json?: string;
}

function parseArgs(argv: string[]): Args {
  const a: Args = { games: 8, turns: 220, civs: 6, barbarians: false, seedPrefix: "roc-ai", cols: 48, rows: 32 };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const v = argv[i + 1];
    if (k === "--games") { a.games = Number(v); i++; }
    else if (k === "--turns") { a.turns = Number(v); i++; }
    else if (k === "--civs") { a.civs = Number(v); i++; }
    else if (k === "--barbarians") { a.barbarians = v === "false" ? false : v!; i++; }
    else if (k === "--seed-prefix") { a.seedPrefix = v!; i++; }
    else if (k === "--cols") { a.cols = Number(v); i++; }
    else if (k === "--rows") { a.rows = Number(v); i++; }
    else if (k === "--turn-limit") { a.turnLimit = Number(v); i++; }
    else if (k === "--json") { a.json = v!; i++; }
  }
  return a;
}

interface CivResult {
  name: string;
  civId: string;
  score: number;
  cities: number;
  population: number;
  wondersCompleted: number;
  wondersStarted: number;
  wondersAbandoned: number;
  battlesWon: number;
  citiesCaptured: number;
  eliminated: boolean;
}

interface GameResult {
  seed: string;
  turns: number;
  finished: boolean;
  winnerName?: string;
  condition?: string;
  wars: number;
  peaces: number;
  eliminations: number;
  civs: CivResult[];
}

/** Count occurrences of a substring across the game log. */
function countLog(state: GameState, needle: string): number {
  let n = 0;
  for (const e of state.log) if (e.message.includes(needle)) n++;
  return n;
}

function playGame(args: Args, seed: string): GameResult {
  const state = createGame({
    seed,
    cols: args.cols,
    rows: args.rows,
    barbarians: args.barbarians,
    humanSlots: 1, // player 0 is a passive observer; players 1..n-1 are AI
    playerCount: args.civs,
    ...(args.turnLimit !== undefined ? { turnLimit: args.turnLimit } : {}),
  });
  beginTurn(state);

  const aiIds = state.players.filter((p) => !p.isHuman && !p.isBarbarian).map((p) => p.id);

  // Track wonder works ever seen under construction, per (civ, wonderId).
  const startedWonders = new Set<string>();

  let turn = 0;
  for (; turn < args.turns && !state.gameOver; turn++) {
    endTurn(state); // passive human passes; all AI + barbarians auto-play
    for (const pid of aiIds) {
      for (const w of worksOf(state, pid)) {
        if (w.kind === "wonder" && w.wonderId) startedWonders.add(`${pid}:${w.wonderId}`);
      }
    }
  }

  const civs: CivResult[] = aiIds.map((pid) => {
    const p = state.players.find((x) => x.id === pid)!;
    const completedIds = new Set(citiesOf(state, pid).flatMap((c) => c.wonders));
    const inProgressIds = new Set(
      worksOf(state, pid).filter((w) => w.kind === "wonder" && w.wonderId).map((w) => w.wonderId as string),
    );
    let started = 0;
    let abandoned = 0;
    for (const key of startedWonders) {
      if (!key.startsWith(`${pid}:`)) continue;
      const wid = key.slice(String(pid).length + 1);
      started++;
      if (!completedIds.has(wid) && !inProgressIds.has(wid)) abandoned++;
    }
    return {
      name: p.name,
      civId: p.civId,
      score: playerScore(state, pid),
      cities: citiesOf(state, pid).length,
      population: citiesOf(state, pid).reduce((s, c) => s + c.population, 0),
      wondersCompleted: completedIds.size,
      wondersStarted: started,
      wondersAbandoned: abandoned,
      battlesWon: p.battlesWon ?? 0,
      citiesCaptured: p.citiesCaptured ?? 0,
      eliminated: !!p.eliminated,
    };
  });

  const winner = state.gameOver?.winnerId !== undefined
    ? state.players.find((p) => p.id === state.gameOver!.winnerId)
    : undefined;

  return {
    seed,
    turns: turn,
    finished: !!state.gameOver,
    winnerName: winner?.name,
    condition: state.gameOver?.condition,
    wars: countLog(state, "declared war on"),
    peaces: countLog(state, "made peace"),
    eliminations: state.players.filter((p) => !p.isBarbarian && !p.isHuman && p.eliminated).length,
    civs,
  };
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

function fmt(n: number, d = 1): string {
  return n.toFixed(d);
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const results: GameResult[] = [];

  for (let i = 0; i < args.games; i++) {
    const seed = `${args.seedPrefix}-${i}`;
    const r = playGame(args, seed);
    results.push(r);
    const top = [...r.civs].sort((a, b) => b.score - a.score)[0];
    console.log(
      `seed ${seed.padEnd(12)} | ${String(r.turns).padStart(3)}t ` +
      `${r.finished ? (r.condition ?? "end").padEnd(10) : "cap".padEnd(10)} ` +
      `| wars ${String(r.wars).padStart(2)} peace ${String(r.peaces).padStart(2)} elim ${r.eliminations} ` +
      `| wonders C/S/A ${r.civs.reduce((s, c) => s + c.wondersCompleted, 0)}/` +
      `${r.civs.reduce((s, c) => s + c.wondersStarted, 0)}/` +
      `${r.civs.reduce((s, c) => s + c.wondersAbandoned, 0)} ` +
      `| top ${top?.civId ?? "-"} (${top?.score ?? 0})`,
    );
  }

  const allCivs = results.flatMap((r) => r.civs);
  const totalStarted = allCivs.reduce((s, c) => s + c.wondersStarted, 0);
  const totalCompleted = allCivs.reduce((s, c) => s + c.wondersCompleted, 0);
  const totalAbandoned = allCivs.reduce((s, c) => s + c.wondersAbandoned, 0);

  // Did wonder-building help? Compare avg score of civs that finished >=1 wonder
  // against those that finished none.
  const builders = allCivs.filter((c) => c.wondersCompleted > 0);
  const nonBuilders = allCivs.filter((c) => c.wondersCompleted === 0);

  console.log("\n=== AGGREGATE (" + results.length + " games, " + args.civs + " civs each) ===");
  console.log(`finished within cap : ${results.filter((r) => r.finished).length}/${results.length}`);
  console.log(`avg game length     : ${fmt(mean(results.map((r) => r.turns)))} turns`);
  console.log(`avg wars / game     : ${fmt(mean(results.map((r) => r.wars)))}`);
  console.log(`avg peace / game    : ${fmt(mean(results.map((r) => r.peaces)))}`);
  console.log(`peace : war ratio   : ${fmt(mean(results.map((r) => r.wars ? r.peaces / r.wars : 0)), 2)}`);
  console.log(`avg eliminations    : ${fmt(mean(results.map((r) => r.eliminations)), 2)} / game`);
  console.log(`games w/ total war  : ${results.filter((r) => r.peaces === 0 && r.wars > 0).length} (wars but never peace)`);
  console.log(`wonders C/S/A       : ${totalCompleted}/${totalStarted}/${totalAbandoned} (completed/started/abandoned)`);
  console.log(`wonder finish rate  : ${totalStarted ? fmt((totalCompleted / totalStarted) * 100) : "0"}% of started`);
  console.log(`wonder abandon rate : ${totalStarted ? fmt((totalAbandoned / totalStarted) * 100) : "0"}% of started`);
  console.log(`avg score builder   : ${fmt(mean(builders.map((c) => c.score)))} (n=${builders.length})`);
  console.log(`avg score non-build : ${fmt(mean(nonBuilders.map((c) => c.score)))} (n=${nonBuilders.length})`);
  console.log(`condition breakdown : ${countConditions(results)}`);

  if (args.json) {
    Bun.write(args.json, JSON.stringify(results, null, 2));
    console.log(`\nwrote ${args.json}`);
  }
}

function countConditions(results: GameResult[]): string {
  const m = new Map<string, number>();
  for (const r of results) {
    const k = r.finished ? (r.condition ?? "?") : "cap";
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()].map(([k, v]) => `${k}:${v}`).join(" ");
}

main();
