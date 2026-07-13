/// <reference types="vite/client" />
// Paginated games table for the admin dashboard.

import type { AdminGameSession, GameSessionListResponse } from "@roc/shared";
import {
  bindTableHeader,
  hasActiveFilters,
  renderTableHead,
  type HeaderColumn,
} from "./table-ui";
import { esc, playerCell, timeAgo, titleCase } from "./util";

const API_BASE = (
  import.meta.env.VITE_API_URL?.trim() ||
  (import.meta.env.DEV ? "" : "http://localhost:3001")
).replace(/\/$/, "");

type FilterKey =
  | "startedAt"
  | "handle"
  | "mode"
  | "civId"
  | "outcome"
  | "turns"
  | "score";

const COLUMNS: HeaderColumn[] = [
  { id: "startedAt", label: "When", sort: "startedAt", filterKey: "startedAt" },
  { id: "handle", label: "Player", sort: "handle", filterKey: "handle" },
  { id: "mode", label: "Mode", sort: "mode", filterKey: "mode" },
  { id: "civId", label: "Civ", sort: "civId", filterKey: "civId" },
  { id: "outcome", label: "Result", sort: "outcome", filterKey: "outcome" },
  { id: "turns", label: "Turns", sort: "turns", filterKey: "turns", align: "num" },
  { id: "score", label: "Score", sort: "score", filterKey: "score", align: "num" },
];

function cellValue(g: AdminGameSession, key: FilterKey): string {
  switch (key) {
    case "startedAt":
      return g.startedAt ? timeAgo(g.startedAt) : "—";
    case "handle":
      return g.handle ?? "Guest";
    case "mode":
      return g.mode ? g.mode.toUpperCase() : "—";
    case "civId":
      return g.civId ? titleCase(g.civId) : "—";
    case "outcome":
      return g.outcome ?? "—";
    case "turns":
      return g.turns != null ? String(g.turns) : "—";
    case "score":
      return g.score != null ? g.score.toLocaleString() : "—";
  }
}

function buildQueryParams(state: TableState): URLSearchParams {
  const p = new URLSearchParams();
  p.set("page", String(state.page));
  p.set("pageSize", String(state.pageSize));
  if (state.sort) p.set("sort", state.sort);
  if (state.order) p.set("order", state.order);
  for (const [k, v] of Object.entries(state.filters)) {
    if (v !== undefined && v !== "") p.set(k, v);
  }
  return p;
}

interface TableState {
  page: number;
  pageSize: number;
  sort: string;
  order: "asc" | "desc";
  filters: Partial<Record<FilterKey, string>>;
}

async function fetchGames(token: string, state: TableState): Promise<GameSessionListResponse> {
  const qs = buildQueryParams(state);
  const res = await fetch(`${API_BASE}/admin/api/games?${qs}`, {
    headers: { "x-admin-token": token },
  });
  if (res.status === 401) throw new Error("unauthorized");
  if (res.status === 404) throw new Error("games_api_missing");
  if (!res.ok) throw new Error(`request failed (${res.status})`);
  return (await res.json()) as GameSessionListResponse;
}

function bodyHtml(data: GameSessionListResponse | undefined, err: string | undefined, loading: boolean): string {
  if (err != null) {
    return `<tr><td colspan="${COLUMNS.length}" class="muted">${esc(err)}</td></tr>`;
  }
  if (loading) {
    return `<tr><td colspan="${COLUMNS.length}" class="muted">Loading…</td></tr>`;
  }
  if (!data || data.items.length === 0) {
    return `<tr><td colspan="${COLUMNS.length}" class="muted">No games match these filters.</td></tr>`;
  }
  return data.items
    .map((g) => {
      const startedTitle = g.startedAt ? new Date(g.startedAt).toLocaleString() : "";
      return `<tr>${COLUMNS.map((col) => {
        const key = col.filterKey as FilterKey;
        const v = cellValue(g, key);
        if (col.id === "outcome" && g.outcome) {
          return `<td><span class="pill ${g.outcome}">${esc(v)}</span></td>`;
        }
        if (col.id === "handle") {
          return `<td>${playerCell(g.handle)}</td>`;
        }
        if (col.id === "startedAt") {
          return `<td class="muted" title="${esc(startedTitle)}">${esc(v)}</td>`;
        }
        if (col.align === "num") {
          return `<td class="num">${esc(v)}</td>`;
        }
        return `<td>${esc(v)}</td>`;
      }).join("")}</tr>`;
    })
    .join("");
}

export function mountGamesTable(host: HTMLElement, token: string): void {
  const state: TableState = {
    page: 1,
    pageSize: 25,
    sort: "startedAt",
    order: "desc",
    filters: {},
  };

  let openFilter: string | null = null;
  let loading = false;
  let latestData: GameSessionListResponse | undefined;
  let latestErr: string | undefined;

  const metaHtml = (): string => {
    const total = latestData?.total ?? 0;
    const filtered = hasActiveFilters(state.filters as Record<string, string>);
    const count = loading ? "Loading…" : `${total.toLocaleString()} game${total === 1 ? "" : "s"}`;
    return `${count}${filtered && !loading ? ` · <button class="btn-link" id="games-clear" type="button">Clear filters</button>` : ""}`;
  };

  const pagerHtml = (): string => {
    const page = latestData?.page ?? state.page;
    const totalPages = latestData?.totalPages ?? 1;
    return `<div class="table-pager">
      <label class="muted">Rows
        <select id="games-page-size">
          ${[10, 25, 50, 100].map((n) => `<option value="${n}"${n === state.pageSize ? " selected" : ""}>${n}</option>`).join("")}
        </select>
      </label>
      <span class="grow"></span>
      <button class="btn" id="games-prev" type="button" ${page <= 1 ? "disabled" : ""}>← Prev</button>
      <span class="muted">${page} / ${totalPages}</span>
      <button class="btn" id="games-next" type="button" ${page >= totalPages ? "disabled" : ""}>Next →</button>
    </div>`;
  };

  const paintHead = (): void => {
    const thead = host.querySelector("thead");
    if (!thead) return;
    thead.outerHTML = renderTableHead(COLUMNS, state, state.filters as Record<string, string>, openFilter);
    bindTableHeader(host, {
      filters: state.filters as Record<string, string>,
      getOpenFilter: () => openFilter,
      setOpenFilter: (k) => {
        openFilter = k;
      },
      onSort: (field) => {
        if (state.sort === field) state.order = state.order === "asc" ? "desc" : "asc";
        else {
          state.sort = field;
          state.order = "desc";
        }
        state.page = 1;
        paintHead();
        void load();
      },
      onFilterApply: () => {
        state.page = 1;
        void load();
      },
      onHeadRefresh: paintHead,
      debounceMs: 280,
    });
  };

  const paintBody = (): void => {
    const tbody = host.querySelector("tbody");
    if (tbody) tbody.innerHTML = bodyHtml(latestData, latestErr, loading);
    const meta = host.querySelector(".table-meta");
    if (meta) meta.innerHTML = metaHtml();
    const pager = host.querySelector(".table-pager");
    if (pager) pager.outerHTML = pagerHtml();
  };

  host.addEventListener("click", (e) => {
    const el = e.target;
    if (!(el instanceof HTMLElement)) return;
    if (el.id === "games-clear") {
      state.filters = {};
      openFilter = null;
      state.page = 1;
      paintHead();
      void load();
      return;
    }
    if (el.id === "games-prev" && state.page > 1) {
      state.page--;
      void load();
      return;
    }
    if (el.id === "games-next") {
      state.page++;
      void load();
    }
  });

  host.addEventListener("change", (e) => {
    const el = e.target;
    if (el instanceof HTMLSelectElement && el.id === "games-page-size") {
      state.pageSize = Number(el.value);
      state.page = 1;
      void load();
    }
  });

  host.innerHTML = `
    <div class="table-meta muted">${metaHtml()}</div>
    <div class="table-scroll">
      <table class="data-table">
        ${renderTableHead(COLUMNS, state, state.filters as Record<string, string>, openFilter)}
        <tbody>${bodyHtml(undefined, undefined, true)}</tbody>
      </table>
    </div>
    ${pagerHtml()}`;

  paintHead();

  const load = async (): Promise<void> => {
    loading = true;
    paintBody();
    try {
      latestData = await fetchGames(token, state);
      latestErr = undefined;
      loading = false;
      paintBody();
    } catch (e) {
      loading = false;
      const msg = e instanceof Error ? e.message : String(e);
      latestErr =
        msg === "unauthorized"
          ? "Invalid admin token."
          : msg === "games_api_missing"
            ? "Games API not found — restart the game server."
            : `Could not load games (${msg}).`;
      paintBody();
    }
  };

  void load();
}
