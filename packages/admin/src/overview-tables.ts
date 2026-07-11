import type { LeaderboardEntry, PlayerSessionStats } from "@roc/shared";
import type { AllData } from "./api";
import { mountClientTable, type ClientTableOptions } from "./client-table";
import { esc, playerCell, timeAgo, titleCase } from "./util";

export function mountOverviewTables(root: ParentNode, data: AllData): void {
  const mount = <T>(id: string, options: ClientTableOptions<T>): void => {
    const host = root.querySelector(`#${id}`);
    if (host instanceof HTMLElement) mountClientTable(host, options);
  };

  mount("overview-outcomes", {
    id: "overview-outcomes",
    compact: true,
    emptyMessage: "No outcome data yet.",
    noMatchMessage: "No outcomes match your search.",
    defaultSort: { id: "count", order: "desc" },
    columns: [
      { id: "label", label: "Outcome", text: (r) => r.label },
      { id: "count", label: "Count", align: "num", sortValue: (r) => r.count, text: (r) => String(r.count) },
    ],
    rows: [
      { label: "Wins", count: data.outcomes.win },
      { label: "Losses", count: data.outcomes.loss },
      { label: "Abandoned", count: data.outcomes.abandoned },
    ],
  });

  mount("overview-victories", {
    id: "overview-victories",
    compact: true,
    emptyMessage: "No decided games yet.",
    noMatchMessage: "No victory types match your search.",
    defaultSort: { id: "count", order: "desc" },
    columns: [
      { id: "label", label: "Victory type", text: (r) => r.label },
      { id: "count", label: "Count", align: "num", sortValue: (r) => r.count, text: (r) => String(r.count) },
    ],
    rows: data.victories.map((v) => ({
      label: titleCase(v.condition),
      count: v.wins + v.losses,
    })),
  });

  mount("overview-civs", {
    id: "overview-civs",
    compact: true,
    emptyMessage: "No civilization picks yet.",
    noMatchMessage: "No civilizations match your search.",
    defaultSort: { id: "count", order: "desc" },
    columns: [
      { id: "label", label: "Civilization", text: (r) => r.label },
      { id: "count", label: "Count", align: "num", sortValue: (r) => r.count, text: (r) => String(r.count) },
    ],
    rows: data.civs.map((c) => ({ label: titleCase(c.civId), count: c.count })),
  });

  const setupRows = [
    ...data.config.mapTypes.map((x) => ({ label: `Map: ${titleCase(x.label)}`, count: x.count })),
    ...data.config.mapSizes.map((x) => ({ label: `Size: ${titleCase(x.label)}`, count: x.count })),
    ...data.config.aiCount.map((x) => ({ label: `${x.label} AI`, count: x.count })),
  ];
  mount("overview-setup", {
    id: "overview-setup",
    compact: true,
    emptyMessage: "No sessions yet.",
    noMatchMessage: "No setup options match your search.",
    defaultSort: { id: "count", order: "desc" },
    columns: [
      { id: "label", label: "Option", text: (r) => r.label },
      { id: "count", label: "Count", align: "num", sortValue: (r) => r.count, text: (r) => String(r.count) },
    ],
    rows: setupRows,
  });

  mount("overview-leaderboard", {
    id: "overview-leaderboard",
    emptyMessage: "No scored games yet.",
    noMatchMessage: "No scores match your search.",
    defaultSort: { id: "score", order: "desc" },
    pageSize: 15,
    columns: [
      {
        id: "player",
        label: "Player",
        text: (e) => e.handle?.trim() || "Guest",
        render: (e) => playerCell(e.handle),
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
      { id: "turns", label: "Turns", align: "num", sortValue: (e) => e.turns, text: (e) => String(e.turns) },
      { id: "score", label: "Score", align: "num", sortValue: (e) => e.score, text: (e) => String(e.score) },
      {
        id: "when",
        label: "When",
        text: (e) => timeAgo(e.ts),
        render: (e) => `<span class="muted">${timeAgo(e.ts)}</span>`,
      },
    ],
    rows: data.leaderboard as LeaderboardEntry[],
  });

  mount("overview-sessions", {
    id: "overview-sessions",
    emptyMessage: "No sessions yet.",
    noMatchMessage: "No players match your search.",
    defaultSort: { id: "sessions", order: "desc" },
    pageSize: 20,
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
      { id: "abandoned", label: "Abandoned", align: "num", sortValue: (s) => s.abandoned, text: (s) => String(s.abandoned) },
      {
        id: "last",
        label: "Last played",
        sortValue: (s) => s.lastPlayed,
        text: (s) => timeAgo(s.lastPlayed),
        render: (s) => `<span class="muted">${timeAgo(s.lastPlayed)}</span>`,
      },
    ],
    rows: data.sessions as PlayerSessionStats[],
  });
}
