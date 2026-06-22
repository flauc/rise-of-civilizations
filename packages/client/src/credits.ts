/// <reference types="vite/client" />
// Credits: a simple overlay acknowledging the people and tools behind the game.

interface CreditEntry {
  /** Role / contribution line. */
  role: string;
  /** Name of the person or tool. */
  name: string;
  /** Optional link, shown as a clickable URL under the name. */
  url?: string;
}

const CREDITS: CreditEntry[] = [
  {
    role: "Created by",
    name: "Filip Lauc",
    url: "https://github.com/flauc",
  },
  {
    role: "Assisted by",
    name: "Claude Code",
    url: "https://claude.com/product/claude-code",
  },
  {
    role: "Assets",
    name: "David Baumgart",
    url: "https://dgbaumgart.itch.io/",
  },
  {
    role: "Hero art & artwork",
    name: "Nano Banana 2",
    url: "https://gemini.google/overview/image-generation/",
  },
];

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

/** Show only the host, e.g. "claude.com", as the visible link label. */
function hostLabel(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function createCredits(): { open(): void; close(): void } {
  const root = document.createElement("div");
  root.id = "credits";
  root.className = "hidden";
  root.innerHTML = `
    <div class="credits-shell">
      <div class="credits-header">
        <div class="credits-heading">
          <div class="credits-title">Credits</div>
          <div class="credits-subtitle">The people and tools behind Rise of Civilizations.</div>
        </div>
        <button class="credits-close" id="credits-close" aria-label="Close">✕</button>
      </div>
      <div class="credits-list">
        ${CREDITS.map(
          (c) => `
          <div class="credits-item">
            <div class="credits-role">${escapeHtml(c.role)}</div>
            <div class="credits-name">${escapeHtml(c.name)}</div>
            ${
              c.url
                ? `<a class="credits-link" href="${escapeHtml(c.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(hostLabel(c.url))}</a>`
                : ""
            }
          </div>`,
        ).join("")}
      </div>
    </div>`;

  const style = document.createElement("style");
  style.textContent = `
    #credits{position:fixed;inset:0;z-index:60;background:rgba(15,14,11,.94);backdrop-filter:blur(10px);display:flex;align-items:stretch;justify-content:center;overflow:auto}
    #credits.hidden{display:none !important}
    .credits-shell{display:flex;flex-direction:column;width:min(560px,100%);margin:auto;min-height:100%;padding:max(28px,env(safe-area-inset-top)) max(24px,env(safe-area-inset-right)) max(28px,env(safe-area-inset-bottom)) max(24px,env(safe-area-inset-left))}
    .credits-header{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex:none}
    .credits-title{font-family:'Cinzel',Georgia,serif;font-size:30px;font-weight:800;color:#e8dcc5;letter-spacing:.5px}
    .credits-subtitle{color:#b8aa8d;font-size:14px;margin-top:6px;max-width:460px;line-height:1.5}
    .credits-close{flex:0 0 auto;width:38px;height:38px;border-radius:10px;border:1px solid var(--edge);background:transparent;color:#e8dcc5;cursor:pointer;font-size:16px;line-height:1;transition:background .12s,border-color .12s,color .12s}
    .credits-close:hover{background:rgba(201,162,39,.14);border-color:#c9a227;color:#f0d878}
    .credits-list{flex:1;display:flex;flex-direction:column;gap:12px;margin-top:26px}
    .credits-item{display:flex;flex-direction:column;gap:3px;padding:16px 18px;background:#1f1c14;border:1px solid var(--edge);border-radius:14px}
    .credits-role{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#b8aa8d}
    .credits-name{font-family:'Cinzel',Georgia,serif;font-size:19px;font-weight:700;color:#e8dcc5;margin-top:2px}
    .credits-link{color:#c9a227;font-size:13px;text-decoration:none;margin-top:2px;width:fit-content;border-bottom:1px solid transparent;transition:color .12s,border-color .12s}
    .credits-link:hover{color:#f0d878;border-color:#f0d878}
    @media(max-width:640px){
      .credits-title{font-size:24px}
      .credits-item{padding:14px}
    }`;

  document.head.appendChild(style);
  document.body.appendChild(root);

  const doClose = (): void => {
    root.classList.add("hidden");
  };
  root.querySelector<HTMLButtonElement>("#credits-close")!.addEventListener("click", doClose);
  root.addEventListener("click", (e) => {
    if (e.target === root) doClose();
  });

  return {
    open() {
      root.classList.remove("hidden");
    },
    close: doClose,
  };
}
