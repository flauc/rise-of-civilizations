/// <reference types="vite/client" />
// Filterable session analytics for the admin Reporting screen.

import type { AdminGameSession, LabelCount, SessionReportResponse } from "@roc/shared";
import { bindGameDetailButtons } from "./game-detail";
import { card, countTable, esc, playerCell, timeAgo, titleCase } from "./util";

const API = (
  import.meta.env.VITE_API_URL?.trim() ||
  (import.meta.env.DEV ? "" : "http://localhost:3001")
).replace(/\/$/, "");

interface FilterState {
  mapType: string;
  mapSize: string;
  gameSpeed: string;
  startingGold: string;
  barbarianLevel: string;
  aiCount: string;
  mode: string;
  outcome: string;
  civId: string;
  turnLimit: string;
  naturalWonders: string;
  villages: string;
  legends: string;
  victory: string;
}

const EMPTY_FILTERS: FilterState = {
  mapType: "",
  mapSize: "",
  gameSpeed: "",
  startingGold: "",
  barbarianLevel: "",
  aiCount: "",
  mode: "",
  outcome: "",
  civId: "",
  turnLimit: "",
  naturalWonders: "",
  villages: "",
  legends: "",
  victory: "",
};

function filtersToQuery(f: FilterState): URLSearchParams {
  const p = new URLSearchParams();
  if (f.mapType) p.set("mapType", f.mapType);
  if (f.mapSize) p.set("mapSize", f.mapSize);
  if (f.gameSpeed) p.set("gameSpeed", f.gameSpeed);
  if (f.startingGold) p.set("startingGold", f.startingGold);
  if (f.barbarianLevel) p.set("barbarianLevel", f.barbarianLevel);
  if (f.aiCount) p.set("aiCount", f.aiCount);
  if (f.mode) p.set("mode", f.mode);
  if (f.outcome) p.set("outcome", f.outcome);
  if (f.civId) p.set("civId", f.civId);
  if (f.turnLimit) p.set("turnLimit", f.turnLimit);
  if (f.naturalWonders === "on" || f.naturalWonders === "off") p.set("naturalWonders", f.naturalWonders);
  if (f.villages === "on" || f.villages === "off") p.set("villages", f.villages);
  if (f.legends === "on" || f.legends === "off") p.set("legends", f.legends);
  if (f.victory) p.set("victory", f.victory);
  return p;
}

function hasActiveFilters(f: FilterState): boolean {
  return Object.values(f).some((v) => v !== "");
}

async function fetchReport(token: string, filters: FilterState): Promise<SessionReportResponse> {
  const qs = filtersToQuery(filters);
  const url = `${API}/admin/api/reporting${qs.size ? `?${qs}` : ""}`;
  const res = await fetch(url, { headers: { "x-admin-token": token } });
  if (res.status === 401) throw new Error("unauthorized");
  if (res.status === 404) throw new Error("reporting_api_missing");
  if (!res.ok) throw new Error(`request failed (${res.status})`);
  return (await res.json()) as SessionReportResponse;
}

function selectField(id: string, label: string, value: string, options: { value: string; label: string }[]): string {
  return `<label class="report-field"><span class="report-label">${esc(label)}</span>
    <select class="tb-sel report-sel" id="${esc(id)}">
      <option value="">Any</option>
      ${options.map((o) => `<option value="${esc(o.value)}"${o.value === value ? " selected" : ""}>${esc(o.label)}</option>`).join("")}
    </select></label>`;
}

function onOffOptions(): { value: string; label: string }[] {
  return [
    { value: "on", label: "On" },
    { value: "off", label: "Off" },
  ];
}

function facetOptions(values: string[]): { value: string; label: string }[] {
  return values.map((v) => ({ value: v, label: titleCase(v) }));
}

function numOptions(values: number[], fmt: (n: number) => string = String): { value: string; label: string }[] {
  return values.map((n) => ({ value: String(n), label: fmt(n) }));
}

function breakdownSection(title: string, rows: LabelCount[]): string {
  if (!rows.length) return "";
  return `<section class="report-breakdown"><h3>${esc(title)}</h3>${countTable(rows.map((r) => ({ label: titleCase(r.label), count: r.count })), 8)}</section>`;
}

function reportFiltersToGameParams(f: FilterState): URLSearchParams {
  const p = new URLSearchParams();
  p.set("page", "1");
  p.set("pageSize", "25");
  p.set("sort", "startedAt");
  p.set("order", "desc");
  if (f.mapType) p.set("mapType", f.mapType);
  if (f.mapSize) p.set("mapSize", f.mapSize);
  if (f.gameSpeed) p.set("gameSpeed", f.gameSpeed);
  if (f.startingGold) p.set("startingGold", f.startingGold);
  if (f.barbarianLevel) p.set("barbarianLevel", f.barbarianLevel);
  if (f.aiCount) p.set("aiCount", f.aiCount);
  if (f.mode) p.set("mode", f.mode);
  if (f.outcome) p.set("outcome", f.outcome);
  if (f.civId) p.set("civId", f.civId);
  if (f.turnLimit) p.set("turnLimit", f.turnLimit);
  if (f.victory) p.set("victory", f.victory);
  if (f.naturalWonders === "on") p.set("naturalWonders", "true");
  if (f.naturalWonders === "off") p.set("naturalWonders", "false");
  if (f.villages === "on") p.set("villages", "true");
  if (f.villages === "off") p.set("villages", "false");
  if (f.legends === "on") p.set("legends", "true");
  if (f.legends === "off") p.set("legends", "false");
  return p;
}

async function fetchMatchingGames(token: string, filters: FilterState): Promise<AdminGameSession[]> {
  const qs = reportFiltersToGameParams(filters);
  const res = await fetch(`${API}/admin/api/games?${qs}`, { headers: { "x-admin-token": token } });
  if (!res.ok) return [];
  const data = (await res.json()) as { items?: AdminGameSession[] };
  return data.items ?? [];
}

function matchingSessionsHtml(games: AdminGameSession[] | undefined, loading: boolean): string {
  if (loading) {
    return `<section class="report-sessions"><h3>Matching sessions</h3><div class="muted">Loading sessions…</div></section>`;
  }
  if (!games?.length) {
    return `<section class="report-sessions"><h3>Matching sessions</h3><div class="muted">No sessions match these filters.</div></section>`;
  }
  const rows = games
    .map((g) => {
      const when = g.startedAt ? timeAgo(g.startedAt) : "—";
      const outcome = g.outcome ? `<span class="pill ${esc(g.outcome)}">${esc(g.outcome)}</span>` : `<span class="muted">—</span>`;
      const setup = [g.mapType ? titleCase(g.mapType) : "", g.mapSize ? titleCase(g.mapSize) : "", g.aiCount != null ? `${g.aiCount} AI` : ""]
        .filter(Boolean)
        .join(" · ");
      return `<tr class="clickable-row" data-game="${esc(g.sessionId)}" title="View game details">
        <td>${playerCell(g.handle)}</td>
        <td>${g.civId ? esc(titleCase(g.civId)) : `<span class="muted">—</span>`}</td>
        <td>${setup ? esc(setup) : `<span class="muted">—</span>`}</td>
        <td>${outcome}</td>
        <td class="num">${g.turns != null ? esc(String(g.turns)) : `<span class="muted">—</span>`}</td>
        <td class="num">${g.score != null ? esc(g.score.toLocaleString()) : `<span class="muted">—</span>`}</td>
        <td class="muted">${esc(when)}</td>
      </tr>`;
    })
    .join("");
  return `<section class="report-sessions">
    <h3>Matching sessions</h3>
    <p class="muted report-sessions-lead">Click any row for full game details: cities, technologies, legends, and more.</p>
    <div class="table-scroll">
      <table class="data-table compact">
        <thead><tr>
          <th>Player</th><th>Civ</th><th>Setup</th><th>Result</th><th class="num">Turns</th><th class="num">Score</th><th>When</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  </section>`;
}

function resultsHtml(data: SessionReportResponse): string {
  const r = data.report;
  const avgScore = r.avgScore != null ? r.avgScore.toLocaleString() : "—";

  return `
    <div class="cards report-cards">
      ${card(r.totalSessions.toLocaleString(), "Sessions")}
      ${card(r.uniquePlayers.toLocaleString(), "Unique players")}
      ${card(r.uniqueRegisteredUsers.toLocaleString(), "Registered users")}
      ${card(r.wins.toLocaleString(), "Wins")}
      ${card(r.losses.toLocaleString(), "Losses")}
      ${card(r.abandoned.toLocaleString(), "Abandoned")}
      ${card(r.inProgress.toLocaleString(), "In progress")}
      ${card(String(r.avgTurns), "Avg turns")}
    </div>

    <div class="stat-line muted">
      Completion rate: <b>${r.completionRate}%</b>
      <span class="stat-sep">·</span>
      Win rate (of completed): <b>${r.winRate}%</b>
      <span class="stat-sep">·</span>
      Avg score: <b>${avgScore}</b>
    </div>

    <div class="grid2 report-grid">
      ${breakdownSection("By map type", r.byMapType)}
      ${breakdownSection("By map size", r.byMapSize)}
      ${breakdownSection("By game speed", r.byGameSpeed)}
      ${breakdownSection("By mode", r.byMode)}
      ${breakdownSection("Victory conditions (decided games)", r.byVictoryCondition)}
      ${breakdownSection("Top civilizations", r.topCivs.map((c) => ({ label: c.civId, count: c.count })))}
    </div>`;
}

function filtersToolbarHtml(f: FilterState, open: boolean): string {
  const active = hasActiveFilters(f) ? ` <span class="muted">· filtered</span>` : "";
  return `<div class="report-filter-bar">
    <button class="btn" type="button" id="report-filters-toggle">Filters ${open ? "▲" : "▼"}${active}</button>
  </div>`;
}

function filtersHtml(f: FilterState, facets: SessionReportResponse["facets"], open: boolean): string {
  const turnLimitLabel = (n: number) => (n === 0 ? "Unlimited" : `Turn ${n}`);
  return `${filtersToolbarHtml(f, open)}
    <div id="report-filters-panel" class="report-filters-panel${open ? " open" : ""}">
    <form id="report-filters" class="report-filters">
      ${selectField("rf-mapType", "Map type", f.mapType, facetOptions(facets.mapTypes))}
      ${selectField("rf-mapSize", "Map size", f.mapSize, facetOptions(facets.mapSizes))}
      ${selectField("rf-gameSpeed", "Game speed", f.gameSpeed, facetOptions(facets.gameSpeeds))}
      ${selectField("rf-startingGold", "Starting gold", f.startingGold, facetOptions(facets.startingGold))}
      ${selectField("rf-barbarianLevel", "Barbarians", f.barbarianLevel, facetOptions(facets.barbarianLevels))}
      ${selectField("rf-aiCount", "AI opponents", f.aiCount, numOptions(facets.aiCounts))}
      ${selectField("rf-mode", "Mode", f.mode, facetOptions(facets.modes))}
      ${selectField("rf-outcome", "Outcome", f.outcome, facetOptions(facets.outcomes))}
      ${selectField("rf-civId", "Your civilization", f.civId, facetOptions(facets.civIds))}
      ${selectField("rf-turnLimit", "Turn limit", f.turnLimit, numOptions(facets.turnLimits, turnLimitLabel))}
      ${selectField("rf-naturalWonders", "Natural wonders", f.naturalWonders, onOffOptions())}
      ${selectField("rf-villages", "Villages", f.villages, onOffOptions())}
      ${selectField("rf-legends", "Legends", f.legends, onOffOptions())}
      ${selectField("rf-victory", "Victory enabled", f.victory, facetOptions(facets.victories))}
      <div class="report-actions">
        <button class="btn" type="submit">Apply filters</button>
        ${hasActiveFilters(f) ? `<button class="btn" type="button" id="report-clear">Clear</button>` : ""}
      </div>
    </form>
    </div>`;
}

function readFilters(host: HTMLElement): FilterState {
  const val = (id: string) => host.querySelector<HTMLSelectElement>(`#${id}`)?.value ?? "";
  return {
    mapType: val("rf-mapType"),
    mapSize: val("rf-mapSize"),
    gameSpeed: val("rf-gameSpeed"),
    startingGold: val("rf-startingGold"),
    barbarianLevel: val("rf-barbarianLevel"),
    aiCount: val("rf-aiCount"),
    mode: val("rf-mode"),
    outcome: val("rf-outcome"),
    civId: val("rf-civId"),
    turnLimit: val("rf-turnLimit"),
    naturalWonders: val("rf-naturalWonders"),
    villages: val("rf-villages"),
    legends: val("rf-legends"),
    victory: val("rf-victory"),
  };
}

export function mountReportingPage(host: HTMLElement, token: string): void {
  let filters: FilterState = { ...EMPTY_FILTERS };
  let latest: SessionReportResponse | undefined;
  let matchingGames: AdminGameSession[] | undefined;
  let loading = false;
  let loadingGames = false;
  let error: string | undefined;
  let filtersOpen = false;

  const paint = (): void => {
    if (loading && !latest) {
      host.innerHTML = `<div class="muted">Loading report…</div>`;
      return;
    }
    if (error && !latest) {
      host.innerHTML = `<div class="err">${esc(error)}</div>`;
      return;
    }
    if (!latest) {
      host.innerHTML = `<div class="muted">No data.</div>`;
      return;
    }
    host.innerHTML =
      filtersHtml(filters, latest.facets, filtersOpen) +
      (loading ? `<div class="muted" style="margin:12px 0">Updating…</div>` : "") +
      (error ? `<div class="err" style="margin:12px 0">${esc(error)}</div>` : "") +
      resultsHtml(latest) +
      matchingSessionsHtml(matchingGames, loadingGames);

    bindGameDetailButtons(host);

    host.querySelector<HTMLButtonElement>("#report-filters-toggle")?.addEventListener("click", () => {
      filtersOpen = !filtersOpen;
      paint();
    });
    host.querySelector<HTMLFormElement>("#report-filters")?.addEventListener("submit", (e) => {
      e.preventDefault();
      filters = readFilters(host);
      void load();
    });
    host.querySelector<HTMLButtonElement>("#report-clear")?.addEventListener("click", () => {
      filters = { ...EMPTY_FILTERS };
      void load();
    });
  };

  const loadGames = async (): Promise<void> => {
    loadingGames = true;
    paint();
    try {
      matchingGames = await fetchMatchingGames(token, filters);
    } catch {
      matchingGames = [];
    } finally {
      loadingGames = false;
      paint();
    }
  };

  const load = async (): Promise<void> => {
    loading = true;
    error = undefined;
    paint();
    try {
      latest = await fetchReport(token, filters);
      error = undefined;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      error =
        msg === "unauthorized"
          ? "Invalid admin token."
          : msg === "reporting_api_missing"
            ? "Reporting API not found — restart the game server."
            : `Could not load report (${msg}).`;
    } finally {
      loading = false;
      paint();
      void loadGames();
    }
  };

  void load();
}
