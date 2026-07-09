import type {
  AdminOverview,
  AdminRegisteredUser,
  BugReportSummary,
  CivCount,
  ConfigBreakdown,
  LeaderboardEntry,
  OutcomeBreakdown,
  PlayerSessionStats,
  VictoryTypeCount,
  VoteTotal,
} from "@roc/shared";
import { API_BASE, getToken } from "./util";

export interface AllData {
  overview: AdminOverview;
  sessions: PlayerSessionStats[];
  civs: CivCount[];
  config: ConfigBreakdown;
  outcomes: OutcomeBreakdown;
  victories: VictoryTypeCount[];
  leaderboard: LeaderboardEntry[];
  votes: VoteTotal[];
  bugReports: BugReportSummary[];
  users: AdminRegisteredUser[];
  usersApiMissing?: boolean;
  /** clientId → username, for backfilling legacy admin rows. */
  playerHandles?: Record<string, string>;
}

const EMPTY: AllData = {
  overview: {
    totalSessions: 0,
    uniquePlayers: 0,
    completedSessions: 0,
    abandonedSessions: 0,
    avgTurns: 0,
    sessionsToday: 0,
  },
  sessions: [],
  civs: [],
  config: {
    mapTypes: [],
    mapSizes: [],
    startingGold: [],
    barbarians: [],
    aiCount: [],
    naturalWonders: { on: 0, off: 0 },
    legends: { on: 0, off: 0 },
    villages: { on: 0, off: 0 },
    enabledVictories: [],
  },
  outcomes: { win: 0, loss: 0, abandoned: 0 },
  victories: [],
  leaderboard: [],
  votes: [],
  bugReports: [],
  users: [],
};

type NamedRow = { handle?: string; clientId?: string };

function applyPlayerHandles<T extends NamedRow>(items: T[], playerHandles?: Record<string, string>): T[] {
  if (!playerHandles) return items;
  return items.map((item) => ({
    ...item,
    handle: item.handle ?? (item.clientId ? playerHandles[item.clientId] : undefined),
  }));
}

export async function fetchAll(token: string): Promise<AllData> {
  const headers = { "x-admin-token": token };
  const res = await fetch(`${API_BASE}/admin/api/all`, { headers });
  if (res.status === 401) throw new Error("unauthorized");
  if (!res.ok) throw new Error(`request failed (${res.status})`);
  const raw = (await res.json()) as Partial<AllData>;

  let users: AdminRegisteredUser[] = raw.users ?? [];
  let usersApiMissing = false;
  try {
    const usersRes = await fetch(`${API_BASE}/admin/api/users`, { headers });
    if (usersRes.ok) {
      users = (await usersRes.json()) as AdminRegisteredUser[];
    } else if (usersRes.status === 404) {
      usersApiMissing = true;
    }
  } catch {
    usersApiMissing = true;
  }

  return {
    overview: raw.overview ?? EMPTY.overview,
    sessions: applyPlayerHandles(raw.sessions ?? [], raw.playerHandles),
    civs: raw.civs ?? [],
    config: raw.config ?? EMPTY.config,
    outcomes: raw.outcomes ?? EMPTY.outcomes,
    victories: raw.victories ?? [],
    leaderboard: applyPlayerHandles(raw.leaderboard ?? [], raw.playerHandles),
    votes: raw.votes ?? [],
    bugReports: raw.bugReports ?? [],
    users,
    usersApiMissing,
    playerHandles: raw.playerHandles,
  };
}
