/// <reference types="vite/client" />
// Changelog: a simple overlay listing what changed in each release. Surfaced
// from the start screen via the version label so players can see what's new.

/** The current game version — shown on the start screen and atop the changelog. */
export const CURRENT_VERSION = "0.01";

interface ChangeEntry {
  /** Short category badge, e.g. "New", "Gameplay", "Fix". */
  tag: string;
  title: string;
  desc: string;
}

interface Release {
  version: string;
  /** Optional release date label, e.g. "June 2026". */
  date?: string;
  changes: ChangeEntry[];
}

/** Newest release first. */
const CHANGELOG: Release[] = [
  {
    version: "0.01",
    date: "June 2026",
    changes: [
      {
        tag: "Gameplay",
        title: "Reworked barbarians",
        desc:
          "Barbarian strength now scales with map size — no more near-empty giant maps. Camps keep raising war-bands with no global cap, and fresh camps emerge over time out in the fog of war, so clearing one eventually invites another to rise elsewhere.",
      },
      {
        tag: "New",
        title: "Bug reporting",
        desc:
          "You can now report a bug from inside the game. Your report carries a snapshot of the current game, so problems can be reproduced and fixed far faster.",
      },
    ],
  },
];

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

export function createChangelog(): { open(): void; close(): void } {
  const root = document.createElement("div");
  root.id = "changelog";
  root.className = "hidden";
  root.innerHTML = `
    <div class="changelog-shell">
      <div class="changelog-header">
        <div class="changelog-heading">
          <div class="changelog-title">What's New</div>
          <div class="changelog-subtitle">Recent changes to Rise of Civilizations.</div>
        </div>
        <button class="changelog-close" id="changelog-close" aria-label="Close">✕</button>
      </div>
      <div class="changelog-list">
        ${CHANGELOG.map(
          (r) => `
          <div class="changelog-release">
            <div class="changelog-release-head">
              <span class="changelog-version">v${escapeHtml(r.version)}</span>
              ${r.date ? `<span class="changelog-date">${escapeHtml(r.date)}</span>` : ""}
            </div>
            <div class="changelog-changes">
              ${r.changes
                .map(
                  (c) => `
                <div class="changelog-item">
                  <div class="changelog-item-top">
                    <span class="changelog-badge">${escapeHtml(c.tag)}</span>
                    <span class="changelog-item-title">${escapeHtml(c.title)}</span>
                  </div>
                  <div class="changelog-item-desc">${escapeHtml(c.desc)}</div>
                </div>`,
                )
                .join("")}
            </div>
          </div>`,
        ).join("")}
      </div>
    </div>`;

  const style = document.createElement("style");
  style.textContent = `
    #changelog{position:fixed;inset:0;z-index:60;background:rgba(15,14,11,.94);backdrop-filter:blur(10px);display:flex;align-items:stretch;justify-content:center;overflow:auto}
    #changelog.hidden{display:none !important}
    .changelog-shell{display:flex;flex-direction:column;width:min(640px,100%);margin:auto;min-height:100%;padding:max(28px,env(safe-area-inset-top)) max(24px,env(safe-area-inset-right)) max(28px,env(safe-area-inset-bottom)) max(24px,env(safe-area-inset-left))}
    .changelog-header{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex:none}
    .changelog-title{font-family:'Cinzel',Georgia,serif;font-size:30px;font-weight:800;color:#e8dcc5;letter-spacing:.5px}
    .changelog-subtitle{color:#b8aa8d;font-size:14px;margin-top:6px;max-width:460px;line-height:1.5}
    .changelog-close{flex:0 0 auto;width:38px;height:38px;border-radius:10px;border:1px solid var(--edge);background:transparent;color:#e8dcc5;cursor:pointer;font-size:16px;line-height:1;transition:background .12s,border-color .12s,color .12s}
    .changelog-close:hover{background:rgba(201,162,39,.14);border-color:#c9a227;color:#f0d878}
    .changelog-list{flex:1;display:flex;flex-direction:column;gap:26px;margin-top:26px}
    .changelog-release-head{display:flex;align-items:baseline;gap:12px;padding-bottom:10px;border-bottom:1px solid var(--edge)}
    .changelog-version{font-family:'Cinzel',Georgia,serif;font-size:20px;font-weight:800;color:#f0d878}
    .changelog-date{color:#b8aa8d;font-size:12.5px;text-transform:uppercase;letter-spacing:.06em}
    .changelog-changes{display:flex;flex-direction:column;gap:12px;margin-top:14px}
    .changelog-item{padding:16px 18px;background:#1f1c14;border:1px solid var(--edge);border-radius:14px}
    .changelog-item-top{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
    .changelog-badge{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#15120c;background:linear-gradient(135deg,#c9a227,#a6821f);border-radius:999px;padding:3px 9px}
    .changelog-item-title{font-family:'Cinzel',Georgia,serif;font-size:17px;font-weight:700;color:#e8dcc5}
    .changelog-item-desc{color:#b8aa8d;font-size:13.5px;line-height:1.5;margin-top:7px}
    @media(max-width:640px){
      .changelog-title{font-size:24px}
      .changelog-item{padding:14px}
    }`;

  document.head.appendChild(style);
  document.body.appendChild(root);

  const doClose = (): void => {
    root.classList.add("hidden");
  };
  root.querySelector<HTMLButtonElement>("#changelog-close")!.addEventListener("click", doClose);
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
