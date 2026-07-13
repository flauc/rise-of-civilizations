// Shared table header with popover column filters.

import { esc } from "./util";

export type SortOrder = "asc" | "desc";

export interface HeaderColumn {
  id: string;
  label: string;
  sort?: string;
  /** When set, shows a filter button beside the column title. */
  filterKey?: string;
  align?: "num";
}

export function renderTableHead(
  columns: HeaderColumn[],
  state: { sort: string; order: SortOrder },
  filters: Record<string, string>,
  openFilter: string | null,
): string {
  const headerRow = columns
    .map((col) => {
      const sortable = !!col.sort;
      const active = state.sort === col.sort;
      const arrow = active ? (state.order === "asc" ? " ▲" : " ▼") : "";
      const cls = [sortable ? "sortable" : "", active ? "sorted" : "", col.align === "num" ? "num" : ""]
        .filter(Boolean)
        .join(" ");

      const filterBtn = col.filterKey
        ? `<button type="button" class="col-filter-btn${filters[col.filterKey]?.trim() ? " active" : ""}" data-filter-toggle="${esc(col.filterKey)}" title="Filter ${esc(col.label)}" aria-label="Filter ${esc(col.label)}">⌕</button>`
        : "";

      const popover =
        col.filterKey && openFilter === col.filterKey
          ? `<div class="col-filter-pop open" data-filter-pop="${esc(col.filterKey)}">
              <input class="col-filter-in" data-filter="${esc(col.filterKey)}" type="search" placeholder="Filter…" value="${esc(filters[col.filterKey] ?? "")}" />
            </div>`
          : "";

      return `<th class="${cls}" data-sort="${col.sort ?? ""}">
        <div class="th-inner${col.align === "num" ? " num" : ""}">
          <span class="th-label">${esc(col.label)}${arrow}</span>
          ${filterBtn}
          ${popover}
        </div>
      </th>`;
    })
    .join("");

  return `<thead><tr>${headerRow}</tr></thead>`;
}

export function hasActiveFilters(filters: Record<string, string>): boolean {
  return Object.values(filters).some((v) => v.trim() !== "");
}

export interface TableHeaderBindings {
  filters: Record<string, string>;
  getOpenFilter: () => string | null;
  setOpenFilter: (key: string | null) => void;
  onSort: (field: string) => void;
  /** Called after filter text changes (debounced). Should refresh rows only — not the header. */
  onFilterApply: () => void;
  /** Re-render header (sort change, open popover, clear filters). */
  onHeadRefresh: () => void;
  debounceMs?: number;
}

type PopoverTable = {
  host: HTMLElement;
  getOpen: () => string | null;
  close: () => void;
};

const popoverTables: PopoverTable[] = [];
let docClickInstalled = false;

function registerPopoverTable(entry: PopoverTable): void {
  const i = popoverTables.findIndex((t) => t.host === entry.host);
  if (i >= 0) popoverTables[i] = entry;
  else popoverTables.push(entry);
}

function installDocClick(): void {
  if (docClickInstalled) return;
  docClickInstalled = true;
  document.addEventListener("click", (e) => {
    const t = e.target;
    for (const table of popoverTables) {
      if (!table.getOpen()) continue;
      if (t instanceof Element && table.host.contains(t) && t.closest(".col-filter-pop, .col-filter-btn")) continue;
      table.close();
    }
  });
}

export function bindTableHeader(host: HTMLElement, bindings: TableHeaderBindings): void {
  const debounceMs = bindings.debounceMs ?? 280;
  let timer: ReturnType<typeof setTimeout> | undefined;

  installDocClick();
  registerPopoverTable({
    host,
    getOpen: bindings.getOpenFilter,
    close: () => {
      if (!bindings.getOpenFilter()) return;
      bindings.setOpenFilter(null);
      bindings.onHeadRefresh();
    },
  });

  host.querySelectorAll<HTMLElement>("th.sortable[data-sort]").forEach((th) => {
    th.addEventListener("click", (e) => {
      if (e.target instanceof Element && e.target.closest(".col-filter-btn, .col-filter-pop")) return;
      const field = th.dataset.sort!;
      if (field) bindings.onSort(field);
    });
  });

  host.querySelectorAll<HTMLButtonElement>("[data-filter-toggle]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const key = btn.dataset.filterToggle!;
      const next = bindings.getOpenFilter() === key ? null : key;
      bindings.setOpenFilter(next);
      bindings.onHeadRefresh();
      if (next) {
        requestAnimationFrame(() => {
          const input = host.querySelector<HTMLInputElement>(`[data-filter-pop="${next}"] .col-filter-in`);
          input?.focus();
          input?.select();
        });
      }
    });
  });

  host.querySelectorAll<HTMLInputElement>("input.col-filter-in[data-filter]").forEach((input) => {
    input.addEventListener("input", () => {
      const key = input.dataset.filter!;
      const v = input.value;
      if (v.trim()) bindings.filters[key] = v;
      else delete bindings.filters[key];
      const btn = host.querySelector<HTMLButtonElement>(`[data-filter-toggle="${key}"]`);
      btn?.classList.toggle("active", !!v.trim());
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => bindings.onFilterApply(), debounceMs);
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        bindings.setOpenFilter(null);
        bindings.onHeadRefresh();
      }
    });
  });
}

export function syncFilterButtonStates(host: HTMLElement, filters: Record<string, string>): void {
  host.querySelectorAll<HTMLButtonElement>("[data-filter-toggle]").forEach((btn) => {
    const key = btn.dataset.filterToggle!;
    btn.classList.toggle("active", !!(filters[key]?.trim()));
  });
}
