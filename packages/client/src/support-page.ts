// Public /support page — inquiry form for questions and help requests.

import {
  SUPPORT_INQUIRY_TYPES,
  SUPPORT_MESSAGE_MAX_LENGTH,
  SUPPORT_MESSAGE_MIN_LENGTH,
  validateSupportInquiry,
} from "@roc/shared";

import { clearOverlayPathIfNeeded, persistOverlayPath, setLobbyHidden } from "./app-routes";
export const SUPPORT_URL = "https://game.rise-of-civilizations.com/support";

function resolveSupportEndpoint(): string {
  const explicit = import.meta.env.VITE_SUPPORT_URL?.trim();
  if (explicit) return explicit;
  if (import.meta.env.DEV) return "/support";
  const wsUrl = import.meta.env.VITE_WS_URL?.trim();
  if (wsUrl) {
    return wsUrl.replace(/^ws/, "http").replace(/\/ws\/?$/, "") + "/support";
  }
  const scheme = location.protocol === "https:" ? "https" : "http";
  return `${scheme}://${location.hostname || "localhost"}:3001/support`;
}

const ENDPOINT = resolveSupportEndpoint();

/** True when the current URL should open the support page. */
export function supportPageFromLocation(loc: Pick<Location, "pathname" | "search">): boolean {
  const params = new URLSearchParams(loc.search);
  if (params.get("page") === "support") return true;
  const path = loc.pathname.replace(/\/$/, "").toLowerCase();
  const leaf = path.split("/").pop() ?? "";
  return leaf === "support" || leaf === "support.html";
}

function escapeHtml(text: string): string {
  const el = document.createElement("div");
  el.textContent = text;
  return el.innerHTML;
}

function inquiryOptionsHtml(selected = "general"): string {
  return SUPPORT_INQUIRY_TYPES.map(
    (t) => `<option value="${t.id}"${t.id === selected ? " selected" : ""}>${escapeHtml(t.label)}</option>`,
  ).join("");
}

function formHtml(): string {
  return (
    `<p>Questions, account help, or feedback — we read every message.</p>` +
    `<form id="support-form" class="support-form" novalidate>` +
    `<label class="support-field">` +
    `<span class="support-label">Inquiry type</span>` +
    `<select id="support-type" class="menu-in support-input" required>` +
    inquiryOptionsHtml() +
    `</select></label>` +
    `<label class="support-field">` +
    `<span class="support-label">Your email</span>` +
    `<input id="support-email" class="menu-in support-input" type="email" inputmode="email" autocomplete="email" placeholder="you@example.com" required />` +
    `</label>` +
    `<label class="support-field">` +
    `<span class="support-label">Message</span>` +
    `<textarea id="support-message" class="menu-in support-input support-textarea" rows="6" maxlength="${SUPPORT_MESSAGE_MAX_LENGTH}" placeholder="How can we help?" required></textarea>` +
    `<span class="support-hint">At least ${SUPPORT_MESSAGE_MIN_LENGTH} characters.</span>` +
    `</label>` +
    `<div class="support-actions">` +
    `<button type="submit" class="menu-btn primary" id="support-submit">Send message</button>` +
    `</div>` +
    `<div class="support-error" id="support-error" role="alert"></div>` +
    `</form>`
  );
}

function successHtml(inquiryId: string): string {
  return (
    `<div class="support-success">` +
    `<h2>Message sent</h2>` +
    `<p>Thanks — we received your inquiry (<code>${escapeHtml(inquiryId)}</code>) and will reply to your email when we can.</p>` +
    `<p>For account deletion, see <a href="/delete-account" data-support-link="/delete-account">Delete account</a>. For legal requests, email <a href="mailto:legal@rise-of-civilizations.com">legal@rise-of-civilizations.com</a>.</p>` +
    `<button type="button" class="menu-btn secondary" id="support-another">Send another message</button>` +
    `</div>`
  );
}

function userFacingError(message: string): string {
  switch (message) {
    case "invalid email":
      return "Enter a valid email address.";
    case "email too long":
      return "Email address is too long.";
    case "message too short":
      return `Please write at least ${SUPPORT_MESSAGE_MIN_LENGTH} characters.`;
    case "message too long":
      return "Message is too long.";
    case "invalid inquiry type":
      return "Choose an inquiry type.";
    default:
      return message || "Could not send your message. Try again later.";
  }
}

export interface SupportPage {
  open(): void;
  close(): void;
  wireLinks(root?: ParentNode): void;
}

export function createSupportPage(): SupportPage {
  const root = document.createElement("div");
  root.id = "support-page";
  root.className = "hidden";
  root.innerHTML = `
    <div class="support-shell" role="dialog" aria-modal="true" aria-labelledby="support-title">
      <div class="support-header">
        <div>
          <div class="support-title" id="support-title">Support</div>
          <div class="support-subtitle">Rise of Civilizations</div>
        </div>
        <button class="support-close" id="support-close" type="button" aria-label="Close">✕</button>
      </div>
      <div class="support-body" id="support-body"></div>
    </div>`;

  const style = document.createElement("style");
  style.textContent = `
    #support-page{position:fixed;inset:0;z-index:70;background:rgba(15,14,11,.94);backdrop-filter:blur(10px);display:flex;align-items:stretch;justify-content:center;overflow:auto}
    #support-page.hidden{display:none !important}
    .support-shell{display:flex;flex-direction:column;width:min(720px,100%);margin:auto;min-height:100%;padding:max(24px,env(safe-area-inset-top)) max(20px,env(safe-area-inset-right)) max(28px,env(safe-area-inset-bottom)) max(20px,env(safe-area-inset-left));box-sizing:border-box}
    .support-header{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex:none;margin-bottom:16px}
    .support-title{font-family:'Cinzel',Georgia,serif;font-size:clamp(1.5rem,4vw,2rem);font-weight:600;color:#e8dcc5}
    .support-subtitle{color:#b8aa8d;font-size:13px;margin-top:4px}
    .support-close{flex:0 0 auto;width:38px;height:38px;border-radius:10px;border:1px solid var(--edge);background:transparent;color:#e8dcc5;cursor:pointer;font-size:16px;line-height:1}
    .support-close:hover{background:rgba(201,162,39,.14);border-color:#c9a227;color:#f0d878}
    .support-body{flex:1;overflow:auto;padding:20px 22px 16px;background:#1f1c14;border:1px solid var(--edge);border-radius:12px;font-size:15px;line-height:1.65;color:#e8dcc5}
    .support-form{display:flex;flex-direction:column;gap:14px;margin-top:8px}
    .support-field{display:flex;flex-direction:column;gap:6px}
    .support-label{font-size:13px;font-weight:700;color:#f0d878}
    .support-input{width:100%;box-sizing:border-box}
    .support-textarea{min-height:140px;resize:vertical;font:inherit}
    .support-hint{font-size:12px;color:#8a7f6a}
    .support-actions{display:flex;gap:10px;margin-top:4px}
    .support-actions .menu-btn{width:auto;min-width:140px}
    .support-error{min-height:1.2em;font-size:13px;color:#ff8a8a}
    .support-success h2{font-family:'Cinzel',Georgia,serif;font-size:1.1rem;color:#f0d878;margin:0 0 10px}
    .support-success p{margin:0 0 12px}
    .support-success code{font-size:12px;color:#b8aa8d}
    .support-success a{color:#c9a227}
    .support-link{color:inherit}
  `;

  document.head.appendChild(style);
  document.body.appendChild(root);

  const bodyEl = root.querySelector<HTMLElement>("#support-body")!;
  let submitting = false;

  const renderForm = (): void => {
    bodyEl.innerHTML = formHtml();
    bindForm();
  };

  const bindForm = (): void => {
    const form = bodyEl.querySelector<HTMLFormElement>("#support-form");
    if (!form) return;
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      void submitForm();
    });
  };

  const submitForm = async (): Promise<void> => {
    if (submitting) return;
    const type = bodyEl.querySelector<HTMLSelectElement>("#support-type")?.value ?? "";
    const email = bodyEl.querySelector<HTMLInputElement>("#support-email")?.value ?? "";
    const message = bodyEl.querySelector<HTMLTextAreaElement>("#support-message")?.value ?? "";
    const errEl = bodyEl.querySelector<HTMLDivElement>("#support-error");
    const submitBtn = bodyEl.querySelector<HTMLButtonElement>("#support-submit");

    const localErr = validateSupportInquiry({ type, email, message });
    if (localErr) {
      if (errEl) errEl.textContent = userFacingError(localErr);
      return;
    }

    submitting = true;
    if (errEl) errEl.textContent = "Sending…";
    if (submitBtn) submitBtn.disabled = true;

    const payload = {
      type,
      email: email.trim(),
      message: message.trim(),
    };

    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as { ok?: true; inquiryId?: string; error?: string };
      if (!res.ok || !data.ok || !data.inquiryId) {
        if (errEl) errEl.textContent = userFacingError(data.error ?? "Could not send your message.");
        return;
      }
      bodyEl.innerHTML = successHtml(data.inquiryId);
      bodyEl.querySelector<HTMLButtonElement>("#support-another")?.addEventListener("click", renderForm);
      wireInternalLinks(bodyEl);
    } catch {
      if (errEl) errEl.textContent = "Could not reach the server. Check your connection and try again.";
    } finally {
      submitting = false;
      if (submitBtn) submitBtn.disabled = false;
    }
  };

  const wireInternalLinks = (scope: ParentNode): void => {
    scope.querySelectorAll<HTMLAnchorElement>("[data-support-link]").forEach((a) => {
      a.addEventListener("click", (e) => {
        e.preventDefault();
        close();
        const href = a.dataset.supportLink;
        if (href) history.pushState(null, "", href);
      });
    });
  };

  const open = (): void => {
    renderForm();
    root.classList.remove("hidden");
    setLobbyHidden(true);
    persistOverlayPath("/support");
    bodyEl.querySelector<HTMLInputElement>("#support-email")?.focus();
  };

  const close = (): void => {
    root.classList.add("hidden");
    setLobbyHidden(false);
    if (supportPageFromLocation(location)) {
      clearOverlayPathIfNeeded();
    }
  };

  root.querySelector<HTMLButtonElement>("#support-close")!.addEventListener("click", close);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !root.classList.contains("hidden")) close();
  });
  window.addEventListener("popstate", () => {
    if (supportPageFromLocation(location)) open();
    else if (!root.classList.contains("hidden")) root.classList.add("hidden");
  });

  const onSupportClick = (e: Event): void => {
    const el = (e.target as Element).closest<HTMLAnchorElement>("[data-support]");
    if (!el) return;
    e.preventDefault();
    open();
  };

  return {
    open,
    close,
    wireLinks(scope: ParentNode = document) {
      scope.addEventListener("click", onSupportClick);
    },
  };
}

/** Open the support page (e.g. from the home screen menu). */
let supportPageRef: SupportPage | null = null;

export function registerSupportPage(page: SupportPage): void {
  supportPageRef = page;
}

export function openSupportPage(): void {
  supportPageRef?.open();
}
