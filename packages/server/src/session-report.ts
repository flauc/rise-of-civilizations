// Aggregated session analytics for the admin Reporting screen.

import type {
  CivCount,
  GameSessionFilters,
  LabelCount,
  SessionReport,
  SessionReportFacets,
  SessionReportResponse,
  TutorialFunnel,
} from "@roc/shared";
import type { SessionRow } from "./analytics";
import { matchesGameSessionFilters } from "./game-sessions";

function uniqSorted<T extends string | number>(vals: (T | undefined | null)[]): T[] {
  return [...new Set(vals.filter((v): v is T => v != null && v !== ""))].sort((a, b) =>
    typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b)),
  );
}

function tally(rows: SessionRow[], pick: (r: SessionRow) => string | undefined): LabelCount[] {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const v = pick(r);
    if (!v) continue;
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
}

/** Distinct filter values present in the dataset (for dropdowns). */
export function collectReportFacets(rows: SessionRow[]): SessionReportFacets {
  return {
    mapTypes: uniqSorted(rows.map((r) => r.mapType)),
    mapSizes: uniqSorted(rows.map((r) => r.mapSize)),
    gameSpeeds: uniqSorted(rows.map((r) => r.gameSpeed)),
    startingGold: uniqSorted(rows.map((r) => r.startingGold)),
    barbarianLevels: uniqSorted(rows.map((r) => r.barbarianLevel)),
    aiCounts: uniqSorted(rows.map((r) => r.aiCount)),
    modes: uniqSorted(rows.map((r) => r.mode)),
    outcomes: uniqSorted(rows.map((r) => r.outcome)),
    turnLimits: uniqSorted(rows.map((r) => r.turnLimit)),
    civIds: uniqSorted(rows.map((r) => r.civId)),
    conditions: uniqSorted(rows.map((r) => r.condition)),
    victories: uniqSorted(rows.flatMap((r) => r.enabledVictories ?? [])),
    tutorialOutcomes: uniqSorted(rows.map((r) => r.tutorialOutcome)),
  };
}

/**
 * Tutorial funnel: plays, finishes of the coaching itself, and how many of those
 * players went on to finish the whole game.
 */
export function aggregateTutorialFunnel(rows: SessionRow[]): TutorialFunnel {
  const tutorials = rows.filter((r) => r.isTutorial === true);
  let completed = 0;
  let skipped = 0;
  let abandoned = 0;
  let inProgress = 0;
  let gamesFinished = 0;
  const dropOffCounts = new Map<string, number>();
  for (const r of tutorials) {
    if (r.tutorialOutcome === "completed") completed++;
    else if (r.tutorialOutcome === "skipped") skipped++;
    else if (r.tutorialOutcome === "abandoned") abandoned++;
    else inProgress++;
    if (r.outcome === "win" || r.outcome === "loss") gamesFinished++;
    if (r.tutorialOutcome && r.tutorialOutcome !== "completed") {
      const label = r.tutorialStep ?? "unknown";
      dropOffCounts.set(label, (dropOffCounts.get(label) ?? 0) + 1);
    }
  }
  const started = tutorials.length;
  const pct = (n: number): number => (started > 0 ? Math.round((n / started) * 1000) / 10 : 0);
  return {
    started,
    completed,
    skipped,
    abandoned,
    inProgress,
    completionRate: pct(completed),
    gamesFinished,
    gameCompletionRate: pct(gamesFinished),
    dropOff: [...dropOffCounts.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count),
  };
}

function playerKey(row: SessionRow): string {
  return row.userId ?? row.clientId;
}

/** Aggregate session metrics for rows matching optional filters. */
export function aggregateSessionReport(rows: SessionRow[], filters: GameSessionFilters = {}): SessionReport {
  const list =
    Object.keys(filters).length > 0 ? rows.filter((r) => matchesGameSessionFilters(r, filters)) : rows;

  let wins = 0;
  let losses = 0;
  let abandoned = 0;
  let inProgress = 0;
  let turnSum = 0;
  let turnCount = 0;
  let scoreSum = 0;
  let scoreCount = 0;
  const players = new Set<string>();
  const registered = new Set<string>();

  for (const r of list) {
    players.add(playerKey(r));
    if (r.userId) registered.add(r.userId);
    if (r.outcome === "win") wins++;
    else if (r.outcome === "loss") losses++;
    else if (r.outcome === "abandoned") abandoned++;
    else inProgress++;
    if (r.turns != null) {
      turnSum += r.turns;
      turnCount++;
    }
    if (r.score != null) {
      scoreSum += r.score;
      scoreCount++;
    }
  }

  const totalSessions = list.length;
  const completedSessions = wins + losses;
  const avgTurns = turnCount ? Math.round((turnSum / turnCount) * 10) / 10 : 0;
  const avgScore = scoreCount ? Math.round(scoreSum / scoreCount) : undefined;
  const completionRate =
    totalSessions > 0 ? Math.round((completedSessions / totalSessions) * 1000) / 10 : 0;
  const winRate = completedSessions > 0 ? Math.round((wins / completedSessions) * 1000) / 10 : 0;

  const civCounts = new Map<string, number>();
  for (const r of list) {
    if (!r.civId) continue;
    civCounts.set(r.civId, (civCounts.get(r.civId) ?? 0) + 1);
  }
  const topCivs: CivCount[] = [...civCounts.entries()]
    .map(([civId, count]) => ({ civId, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);

  return {
    totalSessions,
    uniquePlayers: players.size,
    uniqueRegisteredUsers: registered.size,
    wins,
    losses,
    abandoned,
    inProgress,
    completedSessions,
    avgTurns,
    avgScore,
    completionRate,
    winRate,
    byMode: tally(list, (r) => r.mode),
    byMapType: tally(list, (r) => r.mapType),
    byMapSize: tally(list, (r) => r.mapSize),
    byGameSpeed: tally(list, (r) => r.gameSpeed),
    byVictoryCondition: tally(list, (r) => (r.outcome === "win" || r.outcome === "loss" ? r.condition : undefined)),
    topCivs,
    tutorial: aggregateTutorialFunnel(list),
  };
}

export function buildSessionReportResponse(rows: SessionRow[], filters: GameSessionFilters = {}): SessionReportResponse {
  return {
    facets: collectReportFacets(rows),
    report: aggregateSessionReport(rows, filters),
    filters,
  };
}
