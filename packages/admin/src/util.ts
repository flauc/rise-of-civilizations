/// <reference types="vite/client" />

export const API_BASE = (
  import.meta.env.VITE_API_URL?.trim() ||
  (import.meta.env.DEV ? "" : "http://localhost:3001")
).replace(/\/$/, "");

export const TOKEN_KEY = "roc-admin-token";

export function getToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? "";
  } catch {
    return "";
  }
}

export function setToken(token: string): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

export function esc(s: string): string {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

export function titleCase(id: string): string {
  return id
    .split(/[_-]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function shortId(id: string): string {
  return id.length > 12 ? id.slice(0, 10) + "…" : id;
}

export function timeAgo(ts: number): string {
  if (!ts) return "—";
  const s = Math.max(0, (Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function fullDate(ts: number): string {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return String(ts);
  }
}

export function playerName(handle?: string): string {
  return handle?.trim() ? handle.trim() : "Guest";
}

export function playerCell(handle?: string): string {
  const name = playerName(handle);
  if (name === "Guest") return `<span class="muted">Guest</span>`;
  return `<b>${esc(name)}</b>`;
}

export function countTable(items: { label: string; count: number }[], limit = 10): string {
  if (!items.length) return `<div class="muted">No data yet.</div>`;
  return `<table class="data-table compact"><tbody>${items
    .slice(0, limit)
    .map((i) => `<tr><td>${esc(i.label)}</td><td class="num">${i.count.toLocaleString()}</td></tr>`)
    .join("")}</tbody></table>`;
}

export function card(n: string | number, label: string): string {
  return `<div class="card"><div class="n">${esc(String(n))}</div><div class="l">${esc(label)}</div></div>`;
}

export function barList(items: { label: string; value: number }[]): string {
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

export function cfgBars(items: { label: string; count: number }[]): string {
  if (!items.length) return `<div class="muted" style="margin:4px 0 12px">—</div>`;
  return barList(items.map((i) => ({ label: titleCase(i.label), value: i.count })));
}
