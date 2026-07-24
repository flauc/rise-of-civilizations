// Public online score leaderboard — completed MP/SP games ranked by final score.

import type { LeaderboardEntry } from "@roc/shared";
import { getCiv } from "@roc/data";

export type { PublicLeaderboardEntry } from "@roc/sim";
export type OnlineLeaderboardEntry = LeaderboardEntry;

export function leaderboardApiUrl(wsUrl?: string): string {
  if (import.meta.env.DEV) return "/api/leaderboard";
  const raw = wsUrl?.trim() || import.meta.env.VITE_WS_URL?.trim();
  if (raw) return raw.replace(/^ws/, "http").replace(/\/ws\/?$/, "") + "/api/leaderboard";
  const scheme = location.protocol === "https:" ? "https" : "http";
  return `${scheme}://${location.hostname || "localhost"}:3001/api/leaderboard`;
}

export async function fetchOnlineLeaderboard(limit = 25, wsUrl?: string): Promise<LeaderboardEntry[]> {
  const base = leaderboardApiUrl(wsUrl);
  const url = `${base}?limit=${encodeURIComponent(String(limit))}`;
  // Time the request out so a hung backend (accepts the connection but never
  // responds) rejects instead of leaving the panel stuck on "Loading scores…".
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  let res: Response;
  try {
    res = await fetch(url, { signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new Error("leaderboard unavailable");
  const ct = res.headers.get("content-type") ?? "";
  if (!ct.includes("application/json")) throw new Error("leaderboard unavailable");
  const data = (await res.json()) as { entries?: LeaderboardEntry[] };
  if (!Array.isArray(data.entries)) throw new Error("leaderboard unavailable");
  return data.entries;
}

/** Prefer the live WebSocket (MP lobby); fall back to HTTP GET. */
export async function loadOnlineLeaderboard(
  limit = 25,
  opts: { wsUrl?: string; requestViaWs?: () => Promise<LeaderboardEntry[]> } = {},
): Promise<LeaderboardEntry[]> {
  if (opts.requestViaWs) {
    try {
      return await opts.requestViaWs();
    } catch {
      // Old servers may not handle getLeaderboard yet — try HTTP.
    }
  }
  return fetchOnlineLeaderboard(limit, opts.wsUrl);
}

function timeAgo(ts: number): string {
  if (!ts) return "";
  const sec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 48) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 14) return `${day}d ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function civLabel(civId: string | undefined): string {
  if (!civId) return "Unknown";
  return getCiv(civId)?.name ?? civId.replace(/_/g, " ");
}

/** Render ranked rows into a container (shows loading / empty / error states). */
export function renderOnlineLeaderboard(
  el: HTMLElement,
  entries: LeaderboardEntry[] | null,
  error?: string,
): void {
  if (error) {
    el.innerHTML = `<div class="mp-lb-empty">${escapeHtml(error)}</div>`;
    return;
  }
  if (!entries) {
    el.innerHTML = `<div class="mp-lb-empty">Loading scores…</div>`;
    return;
  }
  if (!entries.length) {
    el.innerHTML = `<div class="mp-lb-empty">No scores yet. Finish a match to appear here.</div>`;
    return;
  }
  el.innerHTML =
    `<table class="mp-lb-table" aria-label="Online score leaderboard">` +
    `<thead><tr>` +
    `<th>#</th><th>Player</th><th>Best score</th><th>Civ</th><th>When</th>` +
    `</tr></thead><tbody>` +
    entries
      .map((e, i) => {
        const player = e.handle?.trim() || "Guest";
        const top = i < 3 ? ` class="mp-lb-top"` : "";
        return (
          `<tr${top}>` +
          `<td class="mp-lb-rank">${i + 1}</td>` +
          `<td class="mp-lb-player">${escapeHtml(player)}</td>` +
          `<td class="mp-lb-score">${e.score.toLocaleString()}</td>` +
          `<td class="mp-lb-civ">${escapeHtml(civLabel(e.civId))}</td>` +
          `<td class="mp-lb-when">${escapeHtml(timeAgo(e.ts))}</td>` +
          `</tr>`
        );
      })
      .join("") +
    `</tbody></table>`;
}
