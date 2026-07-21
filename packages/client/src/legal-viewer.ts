// In-app Terms of Service and Privacy Policy viewer.
//
// The game is a single-page app: production hosting serves index.html for every
// path, so standalone /privacy.html files never load. Legal copy is bundled from
// public/*.html at build time and shown in an overlay. Direct URLs like
// /privacy and /terms open the matching page on load.

import privacyRaw from "../public/privacy.html?raw";
import termsRaw from "../public/terms.html?raw";
import deleteAccountRaw from "../public/delete-account.html?raw";
import { clearOverlayPathIfNeeded, persistOverlayPath, setLobbyHidden } from "./app-routes";
import { bindDialogClose } from "./dialog-close";
import { openSupportPage } from "./support-page";

export type LegalPage = "terms" | "privacy" | "delete-account";

let pagesCache: Record<LegalPage, { title: string; html: string }> | null = null;

function legalPages(): Record<LegalPage, { title: string; html: string }> {
  if (!pagesCache) {
    pagesCache = {
      privacy: { title: "Privacy Policy", html: extractLegalBody(privacyRaw) },
      terms: { title: "Terms of Service", html: extractLegalBody(termsRaw) },
      "delete-account": { title: "Delete Account", html: extractLegalBody(deleteAccountRaw) },
    };
  }
  return pagesCache;
}

/** Public URL for store listings (Play Console privacy policy field). */
export const PRIVACY_POLICY_URL = "https://game.rise-of-civilizations.com/privacy";
export const TERMS_OF_SERVICE_URL = "https://game.rise-of-civilizations.com/terms";
/** Play Console: link for users to request account and data deletion. */
export const DELETE_ACCOUNT_URL = "https://game.rise-of-civilizations.com/delete-account";

function extractLegalBody(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const card = doc.querySelector(".card");
  if (card) return card.innerHTML;
  const wrap = doc.querySelector(".wrap");
  return wrap?.innerHTML ?? html;
}

/** Map a URL path or ?legal= query to a legal page id. */
export function legalPageFromLocation(loc: Pick<Location, "pathname" | "search">): LegalPage | null {
  const params = new URLSearchParams(loc.search);
  const q = params.get("legal");
  if (q === "privacy" || q === "terms" || q === "delete-account") return q;

  const path = loc.pathname.replace(/\/$/, "").toLowerCase();
  const leaf = path.split("/").pop() ?? "";
  if (leaf === "privacy" || leaf === "privacy.html") return "privacy";
  if (leaf === "terms" || leaf === "terms.html") return "terms";
  if (leaf === "delete-account" || leaf === "delete-account.html") return "delete-account";
  return null;
}

export function legalPath(page: LegalPage): string {
  return `/${page}`;
}

export function legalLinkHtml(page: LegalPage, label: string): string {
  return `<a href="${legalPath(page)}" class="legal-link" data-legal="${page}">${label}</a>`;
}

export function legalLinksHtml(separator = " · "): string {
  return (
    legalLinkHtml("terms", "Terms of Service") +
    separator +
    legalLinkHtml("privacy", "Privacy Policy") +
    separator +
    `<a href="/support" class="legal-link" data-support>Support</a>`
  );
}

export interface LegalViewer {
  open(page: LegalPage): void;
  close(): void;
  wireLinks(root?: ParentNode): void;
}

export function createLegalViewer(): LegalViewer {
  const root = document.createElement("div");
  root.id = "legal-viewer";
  root.className = "hidden";
  root.innerHTML = `
    <div class="legal-shell" role="dialog" aria-modal="true">
      <div class="legal-header">
        <div>
          <div class="legal-title" id="legal-title"></div>
          <div class="legal-subtitle">Rise of Civilizations</div>
        </div>
        <button class="legal-close" id="legal-close" type="button" aria-label="Close">✕</button>
      </div>
      <div class="legal-body" id="legal-body"></div>
    </div>`;

  const style = document.createElement("style");
  style.textContent = `
    #legal-viewer{position:fixed;inset:0;z-index:70;background:rgba(15,14,11,.94);backdrop-filter:blur(10px);display:flex;align-items:stretch;justify-content:center;overflow:auto}
    #legal-viewer.hidden{display:none !important}
    .legal-shell{display:flex;flex-direction:column;width:min(720px,100%);margin:auto;min-height:100%;padding:max(24px,env(safe-area-inset-top)) max(20px,env(safe-area-inset-right)) max(28px,env(safe-area-inset-bottom)) max(20px,env(safe-area-inset-left));box-sizing:border-box}
    .legal-header{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex:none;margin-bottom:16px}
    .legal-title{font-family:'Cinzel',Georgia,serif;font-size:clamp(1.5rem,4vw,2rem);font-weight:600;color:#e8dcc5}
    .legal-subtitle{color:#b8aa8d;font-size:13px;margin-top:4px}
    .legal-close{flex:0 0 auto;width:38px;height:38px;border-radius:10px;border:1px solid var(--edge);background:transparent;color:#e8dcc5;cursor:pointer;font-size:16px;line-height:1}
    .legal-close:hover{background:rgba(201,162,39,.14);border-color:#c9a227;color:#f0d878}
    .legal-body{flex:1;overflow:auto;padding:20px 22px 12px;background:#1f1c14;border:1px solid var(--edge);border-radius:12px;font-size:15px;line-height:1.65;color:#e8dcc5}
    .legal-body h2{font-family:'Cinzel',Georgia,serif;font-size:1.05rem;font-weight:600;margin:24px 0 10px;color:#f0d878}
    .legal-body h2:first-child{margin-top:0}
    .legal-body p{margin:0 0 14px}
    .legal-body ul{margin:0 0 14px;padding-left:1.25rem}
    .legal-body li{margin-bottom:6px}
    .legal-body strong{color:#f0d878}
    .legal-body a{color:#c9a227;text-decoration:underline;text-underline-offset:2px}
    .legal-body a:hover{color:#f0d878}
    .legal-body table{width:100%;border-collapse:collapse;font-size:14px;margin:0 0 14px}
    .legal-body th,.legal-body td{border:1px solid var(--edge);padding:8px 10px;text-align:left;vertical-align:top}
    .legal-body th{color:#f0d878}
    .legal-link{color:inherit}
  `;

  document.head.appendChild(style);
  document.body.appendChild(root);

  const titleEl = root.querySelector<HTMLElement>("#legal-title")!;
  const bodyEl = root.querySelector<HTMLElement>("#legal-body")!;
  let current: LegalPage | null = null;

  const render = (page: LegalPage): void => {
    current = page;
    const doc = legalPages()[page];
    titleEl.textContent = doc.title;
    bodyEl.innerHTML = doc.html;
    // Cross-links inside the legal text (e.g. privacy ↔ terms).
    bodyEl.querySelectorAll<HTMLAnchorElement>("a[href]").forEach((a) => {
      const href = a.getAttribute("href") ?? "";
      if (/\/privacy(\.html)?$/i.test(href)) {
        a.href = legalPath("privacy");
        a.dataset.legal = "privacy";
        a.removeAttribute("target");
      } else if (/\/terms(\.html)?$/i.test(href)) {
        a.href = legalPath("terms");
        a.dataset.legal = "terms";
        a.removeAttribute("target");
      } else if (/\/support(\.html)?$/i.test(href)) {
        a.addEventListener("click", (e) => {
          e.preventDefault();
          close();
          openSupportPage();
        });
      } else if (href === "/" || href === "./" || href === "./index.html") {
        a.addEventListener("click", (e) => {
          e.preventDefault();
          close();
        });
      }
    });
  };

  const open = (page: LegalPage): void => {
    render(page);
    root.classList.remove("hidden");
    setLobbyHidden(true);
    persistOverlayPath(legalPath(page));
  };

  const close = (): void => {
    root.classList.add("hidden");
    setLobbyHidden(false);
    if (legalPageFromLocation(location)) {
      clearOverlayPathIfNeeded();
    }
    current = null;
  };

  bindDialogClose(root.querySelector<HTMLButtonElement>("#legal-close")!, close);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !root.classList.contains("hidden")) close();
  });
  window.addEventListener("popstate", () => {
    const page = legalPageFromLocation(location);
    if (page) open(page);
    else if (!root.classList.contains("hidden")) root.classList.add("hidden");
  });

  const onLegalClick = (e: Event): void => {
    const el = (e.target as Element).closest<HTMLAnchorElement>("[data-legal]");
    if (!el) return;
    const page = el.dataset.legal as LegalPage | undefined;
    if (page !== "terms" && page !== "privacy" && page !== "delete-account") return;
    e.preventDefault();
    open(page);
  };

  return {
    open,
    close,
    wireLinks(scope: ParentNode = document) {
      scope.addEventListener("click", onLegalClick);
    },
  };
}
