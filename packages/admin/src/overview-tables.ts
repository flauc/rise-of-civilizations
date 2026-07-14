import type { AdminGameSession, BugReportSummary, LeaderboardEntry, PlayerSessionStats, VoteTotal } from "@roc/shared";
import type { AllData } from "./api";
import { bindGameDetailButtons } from "./game-detail";
import { mountClientTable, type ClientTableOptions } from "./client-table";
import { esc, playerCell, timeAgo, titleCase } from "./util";

function truncate(s: string, max = 72): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return t.slice(0, max - 1) + "…";
}

function bugReporter(r: BugReportSummary, handles?: Record<string, string>): string {
  return handles?.[r.clientId]?.trim() || "Guest";
}

function sessionWhen(g: AdminGameSession): number {
  return g.endedAt ?? g.startedAt ?? 0;
}

export function mountOverviewTables(root: ParentNode, data: AllData): void {
  const mount = <T>(id: string, options: ClientTableOptions<T>): void => {
    const host = root.querySelector(`#${id}`);
    if (host instanceof HTMLElement) mountClientTable(host, options);
  };

  const handles = data.playerHandles;

  mount("overview-recent-games", {
    id: "overview-recent-games",
    compact: true,
    emptyMessage: "No games played yet.",
    noMatchMessage: "No games match your search.",
    defaultSort: { id: "when", order: "desc" },
    pageSize: 10,
    clickableRow: (g) => g.sessionId,
    columns: [
      {
        id: "player",
        label: "Player",
        text: (g) => g.handle?.trim() || handles?.[g.clientId]?.trim() || "Guest",
        render: (g) => playerCell(g.handle ?? handles?.[g.clientId]),
      },
      {
        id: "civ",
        label: "Civ",
        text: (g) => (g.civId ? titleCase(g.civId) : "—"),
      },
      {
        id: "setup",
        label: "Setup",
        text: (g) => [g.mapType, g.mapSize, g.aiCount != null ? `${g.aiCount} AI` : ""].filter(Boolean).join(" · "),
        render: (g) => {
          const parts = [
            g.mapType ? titleCase(g.mapType) : "",
            g.mapSize ? titleCase(g.mapSize) : "",
            g.aiCount != null ? `${g.aiCount} AI` : "",
          ].filter(Boolean);
          return parts.length ? esc(parts.join(" · ")) : `<span class="muted">—</span>`;
        },
      },
      {
        id: "outcome",
        label: "Result",
        text: (g) => g.outcome ?? "in progress",
        render: (g) => {
          const o = g.outcome ?? "in progress";
          const pillClass = g.outcome ?? "in-progress";
          return `<span class="pill ${esc(pillClass)}">${esc(o)}</span>`;
        },
      },
      {
        id: "when",
        label: "When",
        sortValue: (g) => sessionWhen(g),
        text: (g) => timeAgo(sessionWhen(g)),
        render: (g) => `<span class="muted">${timeAgo(sessionWhen(g))}</span>`,
      },
    ],
    rows: data.recentGames as AdminGameSession[],
  });

  mount("overview-bug-reports", {
    id: "overview-bug-reports",
    compact: true,
    emptyMessage: "No bug reports yet.",
    noMatchMessage: "No reports match your search.",
    defaultSort: { id: "when", order: "desc" },
    pageSize: 8,
    columns: [
      {
        id: "reporter",
        label: "Reporter",
        text: (r) => bugReporter(r, handles),
        render: (r) => playerCell(handles?.[r.clientId]),
      },
      {
        id: "message",
        label: "Message",
        text: (r) => r.message,
        render: (r) => esc(truncate(r.message)),
      },
      {
        id: "when",
        label: "When",
        sortValue: (r) => r.ts,
        text: (r) => timeAgo(r.ts),
        render: (r) => `<span class="muted">${timeAgo(r.ts)}</span>`,
      },
    ],
    rows: data.bugReports.slice(0, 20) as BugReportSummary[],
  });

  mount("overview-leaderboard", {
    id: "overview-leaderboard",
    compact: true,
    emptyMessage: "No scored games yet.",
    noMatchMessage: "No scores match your search.",
    defaultSort: { id: "score", order: "desc" },
    pageSize: 8,
    columns: [
      {
        id: "player",
        label: "Player",
        text: (e) => e.handle?.trim() || "Guest",
        render: (e) =>
          `<button class="btn-link" data-game="${esc(e.sessionId)}" type="button" title="View game">${playerCell(e.handle)}</button>`,
      },
      {
        id: "civ",
        label: "Civ",
        text: (e) => (e.civId ? titleCase(e.civId) : "—"),
      },
      {
        id: "outcome",
        label: "Result",
        text: (e) => e.outcome,
        render: (e) => `<span class="pill ${esc(e.outcome)}">${esc(e.outcome)}</span>`,
      },
      { id: "score", label: "Score", align: "num", sortValue: (e) => e.score, text: (e) => String(e.score) },
      {
        id: "when",
        label: "When",
        text: (e) => timeAgo(e.ts),
        render: (e) => `<span class="muted">${timeAgo(e.ts)}</span>`,
      },
    ],
    rows: data.leaderboard.slice(0, 15) as LeaderboardEntry[],
  });

  bindGameDetailButtons(root);

  mount("overview-sessions", {
    id: "overview-sessions",
    compact: true,
    emptyMessage: "No sessions yet.",
    noMatchMessage: "No players match your search.",
    defaultSort: { id: "sessions", order: "desc" },
    pageSize: 8,
    columns: [
      {
        id: "player",
        label: "Player",
        text: (s) => s.handle?.trim() || "Guest",
        render: (s) => playerCell(s.handle),
      },
      { id: "sessions", label: "Sessions", align: "num", sortValue: (s) => s.sessions, text: (s) => String(s.sessions) },
      { id: "wins", label: "Wins", align: "num", sortValue: (s) => s.wins, text: (s) => String(s.wins) },
      { id: "losses", label: "Losses", align: "num", sortValue: (s) => s.losses, text: (s) => String(s.losses) },
      {
        id: "last",
        label: "Last played",
        sortValue: (s) => s.lastPlayed,
        text: (s) => timeAgo(s.lastPlayed),
        render: (s) => `<span class="muted">${timeAgo(s.lastPlayed)}</span>`,
      },
    ],
    rows: data.sessions.slice(0, 15) as PlayerSessionStats[],
  });

  mount("overview-votes", {
    id: "overview-votes",
    compact: true,
    emptyMessage: "No feature votes yet.",
    noMatchMessage: "No votes match your search.",
    defaultSort: { id: "votes", order: "desc" },
    pageSize: 8,
    columns: [
      { id: "feature", label: "Feature", text: (v) => v.featureId, render: (v) => esc(titleCase(v.featureId)) },
      { id: "votes", label: "Votes", align: "num", sortValue: (v) => v.votes, text: (v) => String(v.votes) },
    ],
    rows: data.votes.slice(0, 12) as VoteTotal[],
  });
}
