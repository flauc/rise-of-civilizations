/// <reference types="vite/client" />
// Analytics admin dashboard — hash-routed multi-page app.

import { fetchAll, type AllData } from "./api";
import { mountBugReportsTable } from "./bug-reports-table";
import { mountGamesTable } from "./games-table";
import { mountOverviewTables } from "./overview-tables";
import { mountReportingPage } from "./reporting";
import { type AdminPage, parsePage } from "./router";
import { renderShell } from "./shell";
import { mountUsersTable } from "./users-table";
import { mountVotesTable } from "./votes-table";
import { gamesContent } from "./views/games";
import { overviewContent } from "./views/overview";
import { reportingContent } from "./views/reporting";
import { reportsContent } from "./views/reports";
import { usersContent } from "./views/users";
import { votesContent } from "./views/votes";
import { API_BASE, esc, getToken, setToken } from "./util";

const app = document.getElementById("app")!;

let cachedData: AllData | null = null;
let currentPage: AdminPage = parsePage(location.hash);

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
    void load(parsePage(location.hash));
  };
  app.querySelector<HTMLButtonElement>("#enter")!.addEventListener("click", submit);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submit();
  });
}

function loadingView(page: AdminPage): void {
  app.innerHTML = renderShell(page, `<div class="gate" style="margin:40px auto"><div class="sub">Loading…</div></div>`);
}

function bindShellActions(onRefresh: () => void): void {
  app.querySelector<HTMLButtonElement>("#refresh")?.addEventListener("click", onRefresh);
  app.querySelector<HTMLButtonElement>("#logout")?.addEventListener("click", () => {
    setToken("");
    cachedData = null;
    gateView();
  });
}

async function ensureData(token: string, force = false): Promise<AllData> {
  if (!force && cachedData) return cachedData;
  cachedData = await fetchAll(token);
  return cachedData;
}

function pageContent(page: AdminPage, data: AllData | null): string {
  switch (page) {
    case "games":
      return gamesContent();
    case "reporting":
      return reportingContent();
    case "users":
      return data ? usersContent(data) : `<div class="muted">Loading…</div>`;
    case "reports":
      return reportsContent();
    case "votes":
      return data ? votesContent(data) : `<div class="muted">Loading…</div>`;
    default:
      return data ? overviewContent(data) : `<div class="muted">Loading…</div>`;
  }
}

async function renderPage(page: AdminPage, forceRefresh = false): Promise<void> {
  const token = getToken();
  if (!token) {
    gateView();
    return;
  }

  currentPage = page;
  loadingView(page);

  try {
    const needsData = page !== "games" && page !== "reports" && page !== "reporting";
    const data = needsData ? await ensureData(token, forceRefresh) : cachedData;
    const banner =
      page === "users" && data?.usersApiMissing
        ? `<div class="warn-banner">Registered users are unavailable — restart the game server: <code>bun run server</code>.</div>`
        : "";
    app.innerHTML = renderShell(page, pageContent(page, data), banner);
    bindShellActions(() => {
      cachedData = null;
      void renderPage(currentPage, true);
    });

    if (page === "games") {
      const host = app.querySelector("#games-table-host");
      if (host instanceof HTMLElement) void mountGamesTable(host, getToken());
    } else if (page === "reporting") {
      const host = app.querySelector("#reporting-host");
      if (host instanceof HTMLElement) void mountReportingPage(host, getToken());
    } else if (page === "reports") {
      const host = app.querySelector("#bug-reports-table-host");
      if (host instanceof HTMLElement) void mountBugReportsTable(host, getToken());
    } else if (page === "users" && data) {
      const host = app.querySelector("#users-table-host");
      if (host instanceof HTMLElement) mountUsersTable(host, data.users);
    } else if (page === "votes" && data) {
      const host = app.querySelector("#votes-table-host");
      if (host instanceof HTMLElement) mountVotesTable(host, data.votes);
    } else if (page === "overview" && data) {
      mountOverviewTables(app, data);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "unauthorized") {
      gateView("Invalid token. Restart the server with ADMIN_TOKEN=dev (or your chosen token), then try again.");
    } else {
      gateView(`Could not reach the analytics API at ${API_BASE} (${msg}).`);
    }
  }
}

async function load(page = parsePage(location.hash)): Promise<void> {
  if (!getToken()) {
    gateView();
    return;
  }
  await renderPage(page);
}

window.addEventListener("hashchange", () => {
  const page = parsePage(location.hash);
  if (page !== currentPage) void renderPage(page);
});

if (!location.hash) location.hash = "#/";

void load(currentPage);
