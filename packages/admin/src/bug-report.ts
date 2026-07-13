import type { BugReportDetail } from "@roc/shared";
import { API_BASE, esc, fullDate, getToken, shortId, titleCase } from "./util";

export async function fetchBugReport(id: string): Promise<BugReportDetail> {
  const res = await fetch(`${API_BASE}/admin/api/bug-report/${encodeURIComponent(id)}`, {
    headers: { "x-admin-token": getToken() },
  });
  if (!res.ok) throw new Error(`request failed (${res.status})`);
  return (await res.json()) as BugReportDetail;
}

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

export async function openBugReport(id: string): Promise<void> {
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
      <div class="sub" style="margin:6px 0 14px">${esc(fullDate(r.ts))} · ${r.handle ? `<b>${esc(r.handle)}</b> · ` : ""}${r.mode ? esc(r.mode.toUpperCase()) + " · " : ""}${r.turn != null ? "Turn " + r.turn + " · " : ""}${r.civId ? esc(titleCase(r.civId)) + " · " : ""}${r.mapType ? esc(titleCase(r.mapType)) + " · " : ""}${r.mapSize ? esc(titleCase(r.mapSize)) + " · " : ""}${r.sessionId ? `<span class="mono">${esc(shortId(r.sessionId))}</span>` : ""}</div>

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

export function bindBugReportButtons(root: ParentNode): void {
  root.querySelectorAll<HTMLButtonElement>("[data-bug]").forEach((el) =>
    el.addEventListener("click", () => void openBugReport(el.dataset.bug!)),
  );
}
