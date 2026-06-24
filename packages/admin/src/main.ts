/// <reference types="vite/client" />
// Analytics admin dashboard. Vanilla TS + fetch (no framework), matching the
// game client's style. Reads the server's token-gated /admin API and renders the
// six tracked metrics: sessions per player, turns, civ picks, outcomes,
// leaderboard, and feature votes.

import type {
  AdminOverview,
  BugReportDetail,
  BugReportSummary,
  CivCount,
  ConfigBreakdown,
  LeaderboardEntry,
  OutcomeBreakdown,
  PlayerSessionStats,
  VoteTotal,
} from "@roc/shared";

const API_BASE = (import.meta.env.VITE_API_URL?.trim() || "http://localhost:3001").replace(/\/$/, "");
const TOKEN_KEY = "roc-admin-token";

interface AllData {
  overview: AdminOverview;
  sessions: PlayerSessionStats[];
  civs: CivCount[];
  config: ConfigBreakdown;
  outcomes: OutcomeBreakdown;
  leaderboard: LeaderboardEntry[];
  votes: VoteTotal[];
  bugReports: BugReportSummary[];
}

const app = document.getElementById("app")!;

function getToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? "";
  } catch {
    return "";
  }
}
function setToken(token: string): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

function esc(s: string): string {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

function titleCase(id: string): string {
  return id
    .split(/[_-]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function shortId(id: string): string {
  return id.length > 12 ? id.slice(0, 10) + "…" : id;
}

function timeAgo(ts: number): string {
  if (!ts) return "—";
  const s = Math.max(0, (Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

async function fetchAll(token: string): Promise<AllData> {
  const res = await fetch(`${API_BASE}/admin/api/all`, {
    headers: { "x-admin-token": token },
  });
  if (res.status === 401) throw new Error("unauthorized");
  if (!res.ok) throw new Error(`request failed (${res.status})`);
  return (await res.json()) as AllData;
}

async function fetchBugReport(id: string): Promise<BugReportDetail> {
  const res = await fetch(`${API_BASE}/admin/api/bug-report/${encodeURIComponent(id)}`, {
    headers: { "x-admin-token": getToken() },
  });
  if (!res.ok) throw new Error(`request failed (${res.status})`);
  return (await res.json()) as BugReportDetail;
}

function fullDate(ts: number): string {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return String(ts);
  }
}

// ---- views ---------------------------------------------------------------

function gateView(error?: string): void {
  app.innerHTML = `
    <div class="gate">
      <h1>Analytics</h1>
      <div class="sub">Enter the admin token to view the dashboard.</div>
      <input id="token" class="in" type="password" placeholder="Admin token" autocomplete="off" />
      <div><button id="enter" class="btn">View dashboard</button></div>
      ${error ? `<div class="err">${esc(error)}</div>` : ""}
    </div>`;
  const input = app.querySelector<HTMLInputElement>("#token")!;
  input.value = getToken();
  input.focus();
  const submit = (): void => {
    setToken(input.value.trim());
    void load();
  };
  app.querySelector<HTMLButtonElement>("#enter")!.addEventListener("click", submit);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submit();
  });
}

function card(n: string | number, label: string): string {
  return `<div class="card"><div class="n">${esc(String(n))}</div><div class="l">${esc(label)}</div></div>`;
}

function barList(items: { label: string; value: number }[]): string {
  const max = Math.max(1, ...items.map((i) => i.value));
  return items
    .map(
      (i) => `
      <div class="bar-row">
        <div>${esc(i.label)}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${(i.value / max) * 100}%"></div></div>
        <div class="v">${i.value.toLocaleString()}</div>
      </div>`,
    )
    .join("");
}

/** Bar list for a config distribution (title-cases the labels). */
function cfgBars(items: { label: string; count: number }[]): string {
  if (!items.length) return `<div class="muted" style="margin:4px 0 12px">—</div>`;
  return barList(items.map((i) => ({ label: titleCase(i.label), value: i.count })));
}

function dashboardView(d: AllData): void {
  const o = d.overview;
  const outcomesTotal = d.outcomes.win + d.outcomes.loss + d.outcomes.abandoned;

  app.innerHTML = `
    <div class="topbar">
      <div>
        <h1>Rise of Civilizations — Analytics</h1>
        <div class="sub">Anonymous, offline-first gameplay metrics. <span class="mono">${esc(API_BASE)}</span></div>
      </div>
      <div>
        <button id="refresh" class="btn">↻ Refresh</button>
        <button id="logout" class="btn">Sign out</button>
      </div>
    </div>

    <div class="cards">
      ${card(o.totalSessions.toLocaleString(), "Sessions")}
      ${card(o.uniquePlayers.toLocaleString(), "Unique players")}
      ${card(o.completedSessions.toLocaleString(), "Completed")}
      ${card(o.abandonedSessions.toLocaleString(), "Abandoned")}
      ${card(o.avgTurns.toLocaleString(), "Avg turns")}
      ${card(o.sessionsToday.toLocaleString(), "Today")}
    </div>

    <div class="grid2">
      <section>
        <h2>Outcomes</h2>
        ${
          outcomesTotal === 0
            ? `<div class="muted">No completed sessions yet.</div>`
            : barList([
                { label: "Wins", value: d.outcomes.win },
                { label: "Losses", value: d.outcomes.loss },
                { label: "Abandoned", value: d.outcomes.abandoned },
              ])
        }
      </section>
      <section>
        <h2>Civilizations picked</h2>
        ${
          d.civs.length === 0
            ? `<div class="muted">No data yet.</div>`
            : barList(d.civs.slice(0, 12).map((c) => ({ label: titleCase(c.civId), value: c.count })))
        }
      </section>
    </div>

    <section>
      <h2>Game setup</h2>
      ${
        d.overview.totalSessions === 0
          ? `<div class="muted">No sessions yet.</div>`
          : `<div class="grid2">
              <div>
                <div class="sub-h">Map type</div>
                ${cfgBars(d.config.mapTypes)}
                <div class="sub-h">Map size</div>
                ${cfgBars(d.config.mapSizes)}
                <div class="sub-h">AI opponents</div>
                ${cfgBars(d.config.aiCount)}
              </div>
              <div>
                <div class="sub-h">Starting gold</div>
                ${cfgBars(d.config.startingGold)}
                <div class="sub-h">Barbarians</div>
                ${cfgBars(d.config.barbarians)}
                <div class="sub-h">Toggles</div>
                ${cfgBars([
                  { label: "Natural wonders", value: d.config.naturalWonders.on },
                  { label: "Legends (heroes)", value: d.config.legends.on },
                ].map((t) => ({ label: t.label, count: t.value })))}
              </div>
            </div>`
      }
    </section>

    <section>
      <h2>Feature votes</h2>
      ${
        d.votes.length === 0
          ? `<div class="muted">No votes yet.</div>`
          : barList(d.votes.map((v) => ({ label: titleCase(v.featureId), value: v.votes })))
      }
    </section>

    <section>
      <h2>Bug reports ${d.bugReports.length ? `<span class="muted" style="font-weight:400">(${d.bugReports.length})</span>` : ""}</h2>
      ${
        d.bugReports.length === 0
          ? `<div class="muted">No bug reports yet.</div>`
          : `<table>
              <thead><tr><th>When</th><th>Report</th><th>Mode</th><th class="num">Turn</th><th>Civ</th><th>Player</th><th>State</th><th></th></tr></thead>
              <tbody>${d.bugReports
                .map(
                  (b) => `<tr>
                    <td class="muted">${esc(timeAgo(b.ts))}</td>
                    <td>${esc(b.message.length > 80 ? b.message.slice(0, 78) + "…" : b.message)}</td>
                    <td>${b.mode ? esc(b.mode.toUpperCase()) : "—"}</td>
                    <td class="num">${b.turn ?? "—"}</td>
                    <td>${b.civId ? esc(titleCase(b.civId)) : "—"}</td>
                    <td class="mono">${esc(shortId(b.clientId))}</td>
                    <td>${b.hasState ? "✓" : "—"}</td>
                    <td><button class="btn" data-bug="${esc(b.reportId)}">View</button></td>
                  </tr>`,
                )
                .join("")}</tbody>
            </table>`
      }
    </section>

    <section>
      <h2>Leaderboard</h2>
      ${
        d.leaderboard.length === 0
          ? `<div class="muted">No scored games yet.</div>`
          : `<table>
              <thead><tr><th>#</th><th>Player</th><th>Civ</th><th>Outcome</th><th class="num">Turns</th><th class="num">Score</th><th>When</th></tr></thead>
              <tbody>${d.leaderboard
                .map(
                  (e, i) => `<tr>
                    <td>${i + 1}</td>
                    <td class="mono">${esc(shortId(e.clientId))}</td>
                    <td>${e.civId ? esc(titleCase(e.civId)) : "—"}</td>
                    <td><span class="pill ${e.outcome}">${esc(e.outcome)}</span></td>
                    <td class="num">${e.turns}</td>
                    <td class="num">${e.score.toLocaleString()}</td>
                    <td class="muted">${esc(timeAgo(e.ts))}</td>
                  </tr>`,
                )
                .join("")}</tbody>
            </table>`
      }
    </section>

    <section>
      <h2>Sessions per player</h2>
      ${
        d.sessions.length === 0
          ? `<div class="muted">No sessions yet.</div>`
          : `<table>
              <thead><tr><th>Player</th><th class="num">Sessions</th><th class="num">Wins</th><th class="num">Losses</th><th class="num">Abandoned</th><th>Last played</th></tr></thead>
              <tbody>${d.sessions
                .map(
                  (s) => `<tr>
                    <td class="mono">${esc(shortId(s.clientId))}</td>
                    <td class="num">${s.sessions}</td>
                    <td class="num">${s.wins}</td>
                    <td class="num">${s.losses}</td>
                    <td class="num">${s.abandoned}</td>
                    <td class="muted">${esc(timeAgo(s.lastPlayed))}</td>
                  </tr>`,
                )
                .join("")}</tbody>
            </table>`
      }
    </section>`;

  app.querySelector<HTMLButtonElement>("#refresh")!.addEventListener("click", () => void load());
  app.querySelector<HTMLButtonElement>("#logout")!.addEventListener("click", () => {
    setToken("");
    gateView();
  });
  app.querySelectorAll<HTMLButtonElement>("[data-bug]").forEach((el) =>
    el.addEventListener("click", () => void openBugReport(el.dataset.bug!)),
  );
}

// ---- bug report detail modal --------------------------------------------

function bugModalEl(): HTMLDivElement {
  let el = document.getElementById("bug-modal") as HTMLDivElement | null;
  if (!el) {
    el = document.createElement("div");
    el.id = "bug-modal";
    el.style.cssText =
      "position:fixed;inset:0;z-index:50;display:none;align-items:flex-start;justify-content:center;" +
      "background:rgba(0,0,0,.65);overflow:auto;padding:40px 16px";
    document.body.appendChild(el);
    el.addEventListener("click", (e) => {
      if (e.target === el) el!.style.display = "none";
    });
  }
  return el;
}

function downloadText(filename: string, text: string): void {
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function openBugReport(id: string): Promise<void> {
  const modal = bugModalEl();
  modal.style.display = "flex";
  modal.innerHTML = `<section style="max-width:760px;width:100%;margin:0"><div class="muted">Loading report…</div></section>`;
  let r: BugReportDetail;
  try {
    r = await fetchBugReport(id);
  } catch (err) {
    modal.innerHTML = `<section style="max-width:760px;width:100%;margin:0"><div class="err">Could not load report (${esc(String(err))}).</div><div style="margin-top:12px"><button class="btn" id="bug-close">Close</button></div></section>`;
    modal.querySelector<HTMLButtonElement>("#bug-close")!.addEventListener("click", () => (modal.style.display = "none"));
    return;
  }

  const ctxRows = r.context
    ? Object.entries(r.context)
        .filter(([, v]) => v !== undefined && v !== null && v !== "")
        .map(([k, v]) => `<tr><td class="muted">${esc(titleCase(k))}</td><td class="mono">${esc(String(v))}</td></tr>`)
        .join("")
    : "";

  modal.innerHTML = `
    <section style="max-width:760px;width:100%;margin:0">
      <div class="topbar"><h2 style="margin:0">🐞 Bug report</h2><button class="btn" id="bug-close">Close</button></div>
      <div class="sub" style="margin:6px 0 14px">${esc(fullDate(r.ts))} · ${r.mode ? esc(r.mode.toUpperCase()) + " · " : ""}${r.turn != null ? "Turn " + r.turn + " · " : ""}${r.civId ? esc(titleCase(r.civId)) + " · " : ""}<span class="mono">${esc(shortId(r.clientId))}</span></div>

      <div class="sub-h">Description</div>
      <div style="white-space:pre-wrap;background:#15130d;border:1px solid var(--edge);border-radius:10px;padding:12px;margin-bottom:14px">${esc(r.message)}</div>

      ${ctxRows ? `<div class="sub-h">Environment</div><table style="margin-bottom:14px"><tbody>${ctxRows}</tbody></table>` : ""}

      ${
        r.errors && r.errors.length
          ? `<div class="sub-h">Recent errors (${r.errors.length})</div>
             <pre style="white-space:pre-wrap;word-break:break-word;max-height:200px;overflow:auto;background:#15130d;border:1px solid var(--edge);border-radius:10px;padding:12px;margin:0 0 14px;font-size:12px">${esc(r.errors.join("\n"))}</pre>`
          : `<div class="sub-h">Recent errors</div><div class="muted" style="margin-bottom:14px">None captured.</div>`
      }

      <div class="sub-h">Game state snapshot</div>
      ${
        r.state
          ? `<div style="margin-bottom:8px"><button class="btn" id="bug-dl">⬇ Download state (.rocsave)</button> <span class="muted">${(r.state.length / 1024).toFixed(0)} KB</span></div>
             <pre style="white-space:pre-wrap;word-break:break-word;max-height:240px;overflow:auto;background:#15130d;border:1px solid var(--edge);border-radius:10px;padding:12px;margin:0;font-size:11px">${esc(r.state.length > 4000 ? r.state.slice(0, 4000) + "\n… (truncated — download for full)" : r.state)}</pre>`
          : `<div class="muted">No state snapshot was captured.</div>`
      }
    </section>`;

  modal.querySelector<HTMLButtonElement>("#bug-close")!.addEventListener("click", () => (modal.style.display = "none"));
  if (r.state) {
    modal.querySelector<HTMLButtonElement>("#bug-dl")!.addEventListener("click", () =>
      downloadText(`bug-${r.reportId.slice(0, 8)}.rocsave`, r.state!),
    );
  }
}

async function load(): Promise<void> {
  const token = getToken();
  if (!token) {
    gateView();
    return;
  }
  app.innerHTML = `<div class="gate"><h1>Analytics</h1><div class="sub">Loading…</div></div>`;
  try {
    const data = await fetchAll(token);
    dashboardView(data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "unauthorized") {
      gateView("Invalid token. Please try again.");
    } else {
      gateView(`Could not reach the analytics API at ${API_BASE} (${msg}).`);
    }
  }
}

void load();
