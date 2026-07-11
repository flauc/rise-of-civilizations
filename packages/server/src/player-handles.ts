// Resolve registered usernames for analytics rows that lost handle on ingest.

import type { LeaderboardEntry, PlayerSessionStats } from "@roc/shared";
import type { SessionRow } from "./analytics";

export function buildHandleByClientId(rows: SessionRow[]): Map<string, string> {
  const byClient = new Map<string, string>();
  for (const r of rows) {
    const h = r.handle?.trim();
    if (h) byClient.set(r.clientId, h);
  }
  return byClient;
}

export function resolvePlayerHandle(
  row: { handle?: string; userId?: string; clientId?: string },
  byClient: Map<string, string>,
  byUser: Map<string, string>,
): string | undefined {
  const direct = row.handle?.trim();
  if (direct) return direct;
  if (row.userId) {
    const fromUser = byUser.get(row.userId)?.trim();
    if (fromUser) return fromUser;
  }
  if (row.clientId) {
    const fromClient = byClient.get(row.clientId);
    if (fromClient) return fromClient;
  }
  return undefined;
}

export function enrichLeaderboard(
  entries: Array<LeaderboardEntry & { clientId?: string; userId?: string }>,
  rows: SessionRow[],
  byUser: Map<string, string>,
): LeaderboardEntry[] {
  const byClient = buildHandleByClientId(rows);
  return entries.map((e) => ({
    sessionId: e.sessionId,
    civId: e.civId,
    score: e.score,
    outcome: e.outcome,
    turns: e.turns,
    ts: e.ts,
    handle: resolvePlayerHandle(e, byClient, byUser),
  }));
}

export function enrichSessionsPerPlayer(
  entries: Array<PlayerSessionStats & { clientId?: string; userId?: string }>,
  rows: SessionRow[],
  byUser: Map<string, string>,
): PlayerSessionStats[] {
  const byClient = buildHandleByClientId(rows);
  return entries.map((e) => ({
    handle: resolvePlayerHandle(e, byClient, byUser),
    sessions: e.sessions,
    wins: e.wins,
    losses: e.losses,
    abandoned: e.abandoned,
    lastPlayed: e.lastPlayed,
  }));
}
