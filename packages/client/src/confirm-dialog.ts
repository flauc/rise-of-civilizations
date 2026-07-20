// In-app confirm / notice dialogs.
//
// Native window.confirm / window.alert are DISABLED in sandboxed iframes (this is
// exactly how the game is embedded on itch.io) and are unreliable inside some
// mobile WebViews — there they silently return false / no-op, so a click that
// gated an action behind confirm() appears to "do nothing". Every in-game
// confirmation therefore routes through these self-contained modal dialogs, which
// inject their own styles and work in every embedding.

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

let stylesInjected = false;
function ensureStyles(): void {
  if (stylesInjected) return;
  stylesInjected = true;
  const style = document.createElement("style");
  style.textContent = `
    .app-dialog-overlay{position:fixed;inset:0;z-index:2147483000;background:rgba(8,7,5,.8);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:24px}
    .app-dialog{max-width:420px;width:100%;background:linear-gradient(180deg,#221e16,#17130d);border:1px solid rgba(201,162,39,.35);border-radius:14px;padding:22px 22px 18px;box-shadow:0 18px 50px rgba(0,0,0,.6);color:#e8dcc5}
    .app-dialog-title{font-family:'Cinzel',Georgia,serif;font-size:18px;font-weight:700;color:#f0d878;margin-bottom:8px}
    .app-dialog-body{font-size:14px;line-height:1.5;color:#e8dcc5;white-space:pre-line}
    .app-dialog-actions{display:flex;gap:10px;justify-content:flex-end;margin-top:20px}
    .app-dialog-btn{font-family:inherit;font-size:14px;font-weight:700;padding:9px 16px;border-radius:9px;cursor:pointer;border:1px solid rgba(201,162,39,.4);background:transparent;color:#e8dcc5;transition:background .12s,border-color .12s}
    .app-dialog-btn:hover{background:rgba(201,162,39,.12)}
    .app-dialog-btn:focus-visible{outline:2px solid #c9a227;outline-offset:2px}
    .app-dialog-btn.primary{background:linear-gradient(135deg,#c9a227,#a6821f);border-color:#c9a227;color:#15120c}
    .app-dialog-btn.primary:hover{filter:brightness(1.06)}
    .app-dialog-btn.danger{border-color:rgba(200,80,64,.6);color:#e79a8c}
    .app-dialog-btn.danger:hover{background:rgba(160,50,40,.22)}
  `;
  document.head.appendChild(style);
}

export interface ConfirmOptions {
  title?: string;
  body: string;
  confirmText?: string;
  cancelText?: string;
  /** Style the confirm button as a destructive action. */
  danger?: boolean;
}

/** Drop-in async replacement for window.confirm. Resolves true on confirm,
 *  false on cancel / Escape / backdrop click. Pass a string for a plain prompt. */
export function confirmDialog(opts: ConfirmOptions | string): Promise<boolean> {
  const o: ConfirmOptions = typeof opts === "string" ? { body: opts } : opts;
  ensureStyles();
  return new Promise<boolean>((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "app-dialog-overlay";
    overlay.innerHTML = `
      <div class="app-dialog" role="dialog" aria-modal="true"${o.title ? ' aria-label="' + escapeHtml(o.title) + '"' : ""}>
        ${o.title ? `<div class="app-dialog-title">${escapeHtml(o.title)}</div>` : ""}
        <div class="app-dialog-body">${escapeHtml(o.body)}</div>
        <div class="app-dialog-actions">
          <button type="button" class="app-dialog-btn" data-act="cancel">${escapeHtml(o.cancelText ?? "Cancel")}</button>
          <button type="button" class="app-dialog-btn ${o.danger ? "danger" : "primary"}" data-act="ok">${escapeHtml(o.confirmText ?? "Confirm")}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    let settled = false;
    const finish = (val: boolean): void => {
      if (settled) return;
      settled = true;
      overlay.remove();
      document.removeEventListener("keydown", onKey, true);
      resolve(val);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        e.stopPropagation();
        finish(false);
      } else if (e.key === "Enter") {
        e.stopPropagation();
        finish(true);
      }
    };
    document.addEventListener("keydown", onKey, true);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) finish(false);
    });
    overlay.querySelector<HTMLButtonElement>('[data-act="cancel"]')!.addEventListener("click", () => finish(false));
    overlay.querySelector<HTMLButtonElement>('[data-act="ok"]')!.addEventListener("click", () => finish(true));
    overlay.querySelector<HTMLButtonElement>('[data-act="ok"]')!.focus();
  });
}

/** Drop-in async replacement for window.alert: a single-button notice. */
export function notifyDialog(body: string, title?: string): Promise<void> {
  ensureStyles();
  return new Promise<void>((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "app-dialog-overlay";
    overlay.innerHTML = `
      <div class="app-dialog" role="dialog" aria-modal="true"${title ? ' aria-label="' + escapeHtml(title) + '"' : ""}>
        ${title ? `<div class="app-dialog-title">${escapeHtml(title)}</div>` : ""}
        <div class="app-dialog-body">${escapeHtml(body)}</div>
        <div class="app-dialog-actions">
          <button type="button" class="app-dialog-btn primary" data-act="ok">OK</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    let settled = false;
    const finish = (): void => {
      if (settled) return;
      settled = true;
      overlay.remove();
      document.removeEventListener("keydown", onKey, true);
      resolve();
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape" || e.key === "Enter") {
        e.stopPropagation();
        finish();
      }
    };
    document.addEventListener("keydown", onKey, true);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) finish();
    });
    overlay.querySelector<HTMLButtonElement>('[data-act="ok"]')!.addEventListener("click", finish);
    overlay.querySelector<HTMLButtonElement>('[data-act="ok"]')!.focus();
  });
}
