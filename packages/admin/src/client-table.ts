// Reusable client-side table with popover column filters, sort, and empty states.

import {
  bindTableHeader,
  hasActiveFilters,
  renderTableHead,
  type HeaderColumn,
  type SortOrder,
} from "./table-ui";
import { esc } from "./util";

export type { SortOrder };

export interface ClientColumn<T> {
  id: string;
  label: string;
  sortable?: boolean;
  filterable?: boolean;
  align?: "num";
  text: (row: T) => string;
  sortValue?: (row: T) => string | number;
  render?: (row: T) => string;
}

export interface ClientTableOptions<T> {
  id: string;
  columns: ClientColumn<T>[];
  rows: T[];
  defaultSort?: { id: string; order: SortOrder };
  emptyMessage?: string;
  noMatchMessage?: string;
  compact?: boolean;
  pageSize?: number;
}

interface TableState {
  sort: string;
  order: SortOrder;
  filters: Record<string, string>;
  page: number;
}

function toHeaderColumns<T>(columns: ClientColumn<T>[]): HeaderColumn[] {
  return columns.map((c) => ({
    id: c.id,
    label: c.label,
    sort: c.sortable === false ? undefined : c.id,
    filterKey: c.filterable === false ? undefined : c.id,
    align: c.align,
  }));
}

function compareRows<T>(a: T, b: T, col: ClientColumn<T>, order: SortOrder): number {
  const av = col.sortValue ? col.sortValue(a) : col.text(a);
  const bv = col.sortValue ? col.sortValue(b) : col.text(b);
  let cmp: number;
  if (typeof av === "number" && typeof bv === "number") cmp = av - bv;
  else cmp = String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: "base" });
  return order === "asc" ? cmp : -cmp;
}

function rowMatchesFilters<T>(row: T, filters: Record<string, string>, columns: ClientColumn<T>[]): boolean {
  for (const col of columns) {
    if (col.filterable === false) continue;
    const q = (filters[col.id] ?? "").trim().toLowerCase();
    if (!q) continue;
    if (!col.text(row).toLowerCase().includes(q)) return false;
  }
  return true;
}

export function mountClientTable<T>(host: HTMLElement, options: ClientTableOptions<T>): void {
  const defaultSort = options.defaultSort ?? { id: options.columns[0]?.id ?? "", order: "desc" as SortOrder };
  const pageSize = options.pageSize ?? 0;
  const emptyMessage = options.emptyMessage ?? "No rows yet.";
  const noMatchMessage = options.noMatchMessage ?? "No rows match these filters.";
  const tableCls = options.compact ? "data-table compact" : "data-table";
  const headerCols = toHeaderColumns(options.columns);

  const state: TableState = {
    sort: defaultSort.id,
    order: defaultSort.order,
    filters: {},
    page: 1,
  };

  let openFilter: string | null = null;

  const computePageRows = (): { total: number; pageRows: T[]; totalPages: number } => {
    const col = options.columns.find((c) => c.id === state.sort) ?? options.columns[0];
    let rows = options.rows.filter((row) => rowMatchesFilters(row, state.filters, options.columns));
    if (col) rows = [...rows].sort((a, b) => compareRows(a, b, col, state.order));
    const total = rows.length;
    const totalPages = pageSize > 0 ? Math.max(1, Math.ceil(total / pageSize)) : 1;
    if (state.page > totalPages) state.page = totalPages;
    const pageRows = pageSize > 0 ? rows.slice((state.page - 1) * pageSize, state.page * pageSize) : rows;
    return { total, pageRows, totalPages };
  };

  const bodyHtml = (pageRows: T[]): string => {
    if (options.rows.length === 0) {
      return `<tr><td colspan="${options.columns.length}" class="muted">${esc(emptyMessage)}</td></tr>`;
    }
    if (pageRows.length === 0) {
      return `<tr><td colspan="${options.columns.length}" class="muted">${esc(noMatchMessage)}</td></tr>`;
    }
    return pageRows
      .map((row) => {
        return `<tr>${options.columns
          .map((c) => {
            const html = c.render ? c.render(row) : esc(c.text(row));
            const cls = c.align === "num" ? ' class="num"' : "";
            return `<td${cls}>${html}</td>`;
          })
          .join("")}</tr>`;
      })
      .join("");
  };

  const metaHtml = (total: number): string => {
    if (options.rows.length === 0) return "";
    const filtered = hasActiveFilters(state.filters);
    return `${filtered ? `${total.toLocaleString()} match${total === 1 ? "" : "es"}` : `${total.toLocaleString()} row${total === 1 ? "" : "s"}`}${filtered ? ` · <button class="btn-link" id="${options.id}-clear" type="button">Clear filters</button>` : ""}`;
  };

  const pagerHtml = (total: number, totalPages: number): string => {
    if (pageSize <= 0 || total <= pageSize) return "";
    return `<div class="table-pager">
      <span class="grow"></span>
      <button class="btn" id="${options.id}-prev" type="button" ${state.page <= 1 ? "disabled" : ""}>← Prev</button>
      <span class="muted">${state.page} / ${totalPages}</span>
      <button class="btn" id="${options.id}-next" type="button" ${state.page >= totalPages ? "disabled" : ""}>Next →</button>
    </div>`;
  };

  const paintBody = (): void => {
    const { total, pageRows, totalPages } = computePageRows();
    const tbody = host.querySelector("tbody");
    if (tbody) tbody.innerHTML = bodyHtml(pageRows);
    const meta = host.querySelector(".table-meta");
    if (meta) meta.innerHTML = metaHtml(total);
    let pager = host.querySelector(".table-pager");
    const nextPager = pagerHtml(total, totalPages);
    if (nextPager) {
      if (pager) pager.outerHTML = nextPager;
      else host.insertAdjacentHTML("beforeend", nextPager);
    } else if (pager) {
      pager.remove();
    }
  };

  host.addEventListener("click", (e) => {
    const el = e.target;
    if (!(el instanceof HTMLElement)) return;
    if (el.id === `${options.id}-clear`) {
      state.filters = {};
      openFilter = null;
      state.page = 1;
      paintHead();
      paintBody();
      return;
    }
    if (el.id === `${options.id}-prev` && state.page > 1) {
      state.page--;
      paintBody();
      return;
    }
    if (el.id === `${options.id}-next`) {
      const { totalPages } = computePageRows();
      if (state.page < totalPages) {
        state.page++;
        paintBody();
      }
    }
  });

  const paintHead = (): void => {
    const thead = host.querySelector("thead");
    if (!thead) return;
    const fresh = renderTableHead(headerCols, state, state.filters, openFilter);
    thead.outerHTML = fresh;
    bindTableHeader(host, {
      filters: state.filters,
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
        paintBody();
      },
      onFilterApply: () => {
        state.page = 1;
        paintBody();
      },
      onHeadRefresh: paintHead,
    });
  };

  const { total, totalPages } = computePageRows();
  host.innerHTML = `
    <div class="table-meta muted">${metaHtml(total)}</div>
    <div class="table-scroll">
      <table class="${tableCls}">
        ${renderTableHead(headerCols, state, state.filters, openFilter)}
        <tbody>${bodyHtml(computePageRows().pageRows)}</tbody>
      </table>
    </div>
    ${pagerHtml(total, totalPages)}`;

  paintHead();
}
