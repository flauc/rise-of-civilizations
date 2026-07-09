/// <reference types="vite/client" />
// Paginated bug reports table for the admin dashboard.

import type { AdminBugReport, BugReportListResponse } from "@roc/shared";
import { openBugReport } from "./bug-report";
import {
  bindTableHeader,
  hasActiveFilters,
  renderTableHead,
  type HeaderColumn,
} from "./table-ui";
import { esc, playerCell, timeAgo } from "./util";

const API_BASE = (
  import.meta.env.VITE_API_URL?.trim() ||
  (import.meta.env.DEV ? "" : "http://localhost:3001")
).replace(/\/$/, "");

type FilterKey = "ts" | "handle" | "message" | "mode" | "turn";

const COLUMNS: HeaderColumn[] = [
  { id: "ts", label: "When", sort: "ts", filterKey: "ts" },
  { id: "handle", label: "Reporter", sort: "handle", filterKey: "handle" },
  { id: "message", label: "Report", sort: "message", filterKey: "message" },
  { id: "mode", label: "Mode", sort: "mode", filterKey: "mode" },
  { id: "turn", label: "Turn", sort: "turn", filterKey: "turn", align: "num" },
  { id: "actions", label: "" },
];

function cellValue(r: AdminBugReport, key: FilterKey): string {
  switch (key) {
    case "ts":
      return timeAgo(r.ts);
    case "handle":
      return r.handle ?? "Guest";
    case "message":
      return r.message.length > 72 ? r.message.slice(0, 70) + "…" : r.message;
    case "mode":
      return r.mode ? r.mode.toUpperCase() : "—";
    case "turn":
      return r.turn != null ? String(r.turn) : "—";
  }
}

interface TableState {
  page: number;
  pageSize: number;
  sort: string;
  order: "asc" | "desc";
  filters: Partial<Record<FilterKey, string>>;
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

async function fetchBugReports(token: string, state: TableState): Promise<BugReportListResponse> {
  const qs = buildQueryParams(state);
  const res = await fetch(`${API_BASE}/admin/api/bug-reports?${qs}`, {
    headers: { "x-admin-token": token },
  });
  if (res.status === 401) throw new Error("unauthorized");
  if (res.status === 404) throw new Error("bug_reports_api_missing");
  if (!res.ok) throw new Error(`request failed (${res.status})`);
  return (await res.json()) as BugReportListResponse;
}

function bodyHtml(data: BugReportListResponse | undefined, err: string | undefined, loading: boolean): string {
  if (err != null) {
    return `<tr><td colspan="${COLUMNS.length}" class="muted">${esc(err)}</td></tr>`;
  }
  if (loading) {
    return `<tr><td colspan="${COLUMNS.length}" class="muted">Loading…</td></tr>`;
  }
  if (!data || data.items.length === 0) {
    return `<tr><td colspan="${COLUMNS.length}" class="muted">No bug reports match these filters.</td></tr>`;
  }
  return data.items
    .map((r) => {
      const tsTitle = r.ts ? new Date(r.ts).toLocaleString() : "";
      return `<tr>${COLUMNS.map((col) => {
        if (col.id === "actions") {
          return `<td><button class="btn btn-sm" data-bug="${esc(r.reportId)}" type="button">View</button></td>`;
        }
        const key = col.filterKey as FilterKey;
        const v = cellValue(r, key);
        if (col.id === "handle") {
          return `<td>${playerCell(r.handle)}</td>`;
        }
        if (col.id === "message") {
          return `<td title="${esc(r.message)}">${esc(v)}</td>`;
        }
        if (col.id === "ts") {
          return `<td class="muted" title="${esc(tsTitle)}">${esc(v)}</td>`;
        }
        if (col.align === "num") {
          return `<td class="num">${esc(v)}</td>`;
        }
        return `<td>${esc(v)}</td>`;
      }).join("")}</tr>`;
    })
    .join("");
}

export function mountBugReportsTable(host: HTMLElement, token: string): void {
  const state: TableState = {
    page: 1,
    pageSize: 25,
    sort: "ts",
    order: "desc",
    filters: {},
  };

  let openFilter: string | null = null;
  let loading = false;
  let latestData: BugReportListResponse | undefined;
  let latestErr: string | undefined;

  const metaHtml = (): string => {
    const total = latestData?.total ?? 0;
    const filtered = hasActiveFilters(state.filters as Record<string, string>);
    const count = loading ? "Loading…" : `${total.toLocaleString()} report${total === 1 ? "" : "s"}`;
    return `${count}${filtered && !loading ? ` · <button class="btn-link" id="reports-clear" type="button">Clear filters</button>` : ""}`;
  };

  const pagerHtml = (): string => {
    const page = latestData?.page ?? state.page;
    const totalPages = latestData?.totalPages ?? 1;
    return `<div class="table-pager">
      <label class="muted">Rows
        <select id="reports-page-size">
          ${[10, 25, 50, 100].map((n) => `<option value="${n}"${n === state.pageSize ? " selected" : ""}>${n}</option>`).join("")}
        </select>
      </label>
      <span class="grow"></span>
      <button class="btn" id="reports-prev" type="button" ${page <= 1 ? "disabled" : ""}>← Prev</button>
      <span class="muted">${page} / ${totalPages}</span>
      <button class="btn" id="reports-next" type="button" ${page >= totalPages ? "disabled" : ""}>Next →</button>
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
    if (el.id === "reports-clear") {
      state.filters = {};
      openFilter = null;
      state.page = 1;
      paintHead();
      void load();
      return;
    }
    if (el.id === "reports-prev" && state.page > 1) {
      state.page--;
      void load();
      return;
    }
    if (el.id === "reports-next") {
      state.page++;
      void load();
      return;
    }
    if (el instanceof HTMLButtonElement && el.dataset.bug) {
      void openBugReport(el.dataset.bug);
    }
  });

  host.addEventListener("change", (e) => {
    const el = e.target;
    if (el instanceof HTMLSelectElement && el.id === "reports-page-size") {
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
      latestData = await fetchBugReports(token, state);
      latestErr = undefined;
      loading = false;
      paintBody();
    } catch (e) {
      loading = false;
      const msg = e instanceof Error ? e.message : String(e);
      latestErr =
        msg === "unauthorized"
          ? "Invalid admin token."
          : msg === "bug_reports_api_missing"
            ? "Bug reports API not found — restart the game server."
            : `Could not load bug reports (${msg}).`;
      paintBody();
    }
  };

  void load();
}
