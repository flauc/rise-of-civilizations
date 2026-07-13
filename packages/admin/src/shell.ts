import { type AdminPage, PAGES, pageHref, pageTitle } from "./router";
import { API_BASE, esc } from "./util";

export function renderShell(active: AdminPage, contentHtml: string, extraBanner = ""): string {
  const apiHint = API_BASE || "(via Vite proxy → Bun server on :3001)";
  const nav = PAGES.map(
    (p) =>
      `<a class="nav-tab${p.id === active ? " active" : ""}" href="${pageHref(p.id)}">${esc(p.label)}</a>`,
  ).join("");

  return `
    <div class="topbar">
      <div>
        <h1>Rise of Civilizations — ${esc(pageTitle(active))}</h1>
        <div class="sub">API: <span class="mono">${esc(apiHint)}</span></div>
      </div>
      <div class="topbar-actions">
        <button id="refresh" class="btn">↻ Refresh</button>
        <button id="logout" class="btn">Sign out</button>
      </div>
    </div>

    <nav class="nav-tabs" aria-label="Admin sections">${nav}</nav>

    ${extraBanner}

    <div id="page-content">${contentHtml}</div>`;
}
