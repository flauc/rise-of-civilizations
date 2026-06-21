/// <reference types="vite/client" />
// Public roadmap: a community-voted list of planned features. Players upvote the
// milestones they want most; the list re-sorts by vote count so the most-wanted
// work floats to the top. Votes (the seeded community tally plus the player's own
// picks) persist in localStorage so the board feels alive across sessions.

interface Milestone {
  id: string;
  title: string;
  desc: string;
  /** Short category badge, e.g. "Victory", "Maps". */
  tag: string;
  /** Optional planned-phase label for the headline victory milestones. */
  phase?: string;
}

/**
 * The milestone catalogue. The three victory types lead the planned roadmap
 * (Phase 1–3), but every entry — including the geographic maps — is votable, and
 * the board is sorted by votes rather than this order.
 */
const MILESTONES: Milestone[] = [
  {
    id: "victory-science",
    title: "Scientific Victory",
    desc: "Race up the tech tree and win through discovery — culminate your research in a project no rival can match.",
    tag: "Victory",
    phase: "Phase 1",
  },
  {
    id: "victory-religion",
    title: "Religious Victory",
    desc: "Spread your faith across the world. Convert the majority of cities to win a religious history victory.",
    tag: "Victory",
    phase: "Phase 2",
  },
  {
    id: "victory-economic",
    title: "Economic Victory",
    desc: "Dominate trade and the treasury. Build an economic empire that outproduces and outspends every rival.",
    tag: "Victory",
    phase: "Phase 3",
  },
  {
    id: "combat-system",
    title: "Improved Combat System",
    desc: "Deeper tactical combat: flanking, terrain bonuses, formations and clearer odds previews.",
    tag: "Systems",
  },
  {
    id: "ai-difficulty",
    title: "AI Difficulty Levels",
    desc: "Choose your challenge — Easy, Medium, Hard and beyond — with smarter, more aggressive opponents at the top.",
    tag: "Systems",
  },
  {
    id: "leaderboards",
    title: "Online Leaderboards",
    desc: "Compete globally. Track wins, scores and fastest victories on persistent online leaderboards.",
    tag: "Online",
  },
  {
    id: "map-historical-starts",
    title: "Historical Starting Positions",
    desc: "Begin where history did — civilizations placed on their real-world homelands across the accurate maps.",
    tag: "Maps",
  },
  {
    id: "map-europe",
    title: "Map: Europe",
    desc: "A geographically accurate map of Europe, from the Atlantic coast to the Urals.",
    tag: "Maps",
  },
  {
    id: "map-mediterranean",
    title: "Map: Mediterranean",
    desc: "The cradle of classical civilization — an accurate Mediterranean basin map.",
    tag: "Maps",
  },
  {
    id: "map-indus-valley",
    title: "Map: Indus Valley",
    desc: "The river valleys of the Indus and beyond, rendered from real-world geography.",
    tag: "Maps",
  },
  {
    id: "map-africa",
    title: "Map: Africa",
    desc: "The whole African continent as an accurate, playable map.",
    tag: "Maps",
  },
  {
    id: "map-asia",
    title: "Map: Asia",
    desc: "From the steppes to the far east — a geographically accurate map of Asia.",
    tag: "Maps",
  },
  {
    id: "map-north-america",
    title: "Map: North America",
    desc: "An accurate map of the North American continent.",
    tag: "Maps",
  },
  {
    id: "map-south-america",
    title: "Map: South America",
    desc: "The Andes, the Amazon and the southern cone — an accurate South America map.",
    tag: "Maps",
  },
];

const STORAGE_KEY = "roc-roadmap-v1";

interface RoadmapStore {
  /** milestoneId -> community vote tally (seeded once, then accumulates). */
  votes: Record<string, number>;
  /** Milestones this player has upvoted (so votes can be toggled off). */
  mine: string[];
}

/** Seed a few hundred random community votes spread across every milestone. */
function seedVotes(): Record<string, number> {
  const votes: Record<string, number> = {};
  for (const m of MILESTONES) {
    // 18–96 votes each → a few hundred in total across the board.
    votes[m.id] = 18 + Math.floor(Math.random() * 79);
  }
  return votes;
}

function loadStore(): RoadmapStore {
  let store: RoadmapStore | null = null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) store = JSON.parse(raw) as RoadmapStore;
  } catch {
    store = null;
  }
  if (!store || typeof store.votes !== "object") {
    store = { votes: seedVotes(), mine: [] };
  }
  // Backfill any milestones added after the seed was first generated.
  for (const m of MILESTONES) {
    if (typeof store.votes[m.id] !== "number") {
      store.votes[m.id] = 18 + Math.floor(Math.random() * 79);
    }
  }
  if (!Array.isArray(store.mine)) store.mine = [];
  return store;
}

function saveStore(store: RoadmapStore): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Ignore quota / private-mode failures — voting just won't persist.
  }
}

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

export function createRoadmap(): { open(): void; close(): void } {
  const store = loadStore();
  saveStore(store); // persist the freshly seeded tally on first run

  const root = document.createElement("div");
  root.id = "roadmap";
  root.className = "hidden";
  root.innerHTML = `
    <div class="roadmap-shell">
      <div class="roadmap-header">
        <div class="roadmap-heading">
          <div class="roadmap-title">Roadmap</div>
          <div class="roadmap-subtitle">Vote for what we build next — the most-wanted milestones rise to the top.</div>
        </div>
        <button class="roadmap-close" id="roadmap-close" aria-label="Close">✕</button>
      </div>
      <div class="roadmap-totals" id="roadmap-totals"></div>
      <div class="roadmap-list" id="roadmap-list"></div>
    </div>`;

  const style = document.createElement("style");
  style.textContent = `
    #roadmap{position:fixed;inset:0;z-index:60;background:rgba(15,14,11,.94);backdrop-filter:blur(10px);display:flex;align-items:stretch;justify-content:center;overflow:auto}
    #roadmap.hidden{display:none !important}
    .roadmap-shell{display:flex;flex-direction:column;width:min(820px,100%);margin:auto;min-height:100%;padding:max(28px,env(safe-area-inset-top)) max(24px,env(safe-area-inset-right)) max(28px,env(safe-area-inset-bottom)) max(24px,env(safe-area-inset-left))}
    .roadmap-header{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex:none}
    .roadmap-title{font-family:'Cinzel',Georgia,serif;font-size:30px;font-weight:800;color:#e8dcc5;letter-spacing:.5px}
    .roadmap-subtitle{color:#b8aa8d;font-size:14px;margin-top:6px;max-width:560px;line-height:1.5}
    .roadmap-close{flex:0 0 auto;width:38px;height:38px;border-radius:10px;border:1px solid var(--edge);background:transparent;color:#e8dcc5;cursor:pointer;font-size:16px;line-height:1;transition:background .12s,border-color .12s,color .12s}
    .roadmap-close:hover{background:rgba(201,162,39,.14);border-color:#c9a227;color:#f0d878}
    .roadmap-totals{flex:none;color:#b8aa8d;font-size:12.5px;margin:18px 0 4px;text-transform:uppercase;letter-spacing:.06em}
    .roadmap-totals b{color:#f0d878}
    .roadmap-list{flex:1;display:flex;flex-direction:column;gap:10px;margin-top:10px}
    .roadmap-item{display:flex;align-items:center;gap:14px;padding:14px 16px;background:#1f1c14;border:1px solid var(--edge);border-radius:14px;transition:border-color .12s,background .12s}
    .roadmap-item:hover{border-color:rgba(201,162,39,.5)}
    .roadmap-item.voted{border-color:#c9a227;background:rgba(201,162,39,.07)}
    .roadmap-rank{flex:0 0 auto;width:30px;text-align:center;font-family:'Cinzel',Georgia,serif;font-weight:800;font-size:20px;color:#7c7560}
    .roadmap-item:nth-child(-n+3) .roadmap-rank{color:#f0d878}
    .roadmap-body{flex:1;min-width:0}
    .roadmap-item-top{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
    .roadmap-item-title{font-family:'Cinzel',Georgia,serif;font-size:16px;font-weight:700;color:#e8dcc5}
    .roadmap-badge{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#b8aa8d;background:rgba(201,162,39,.1);border:1px solid var(--edge);border-radius:999px;padding:2px 8px}
    .roadmap-badge.phase{color:#15120c;background:linear-gradient(135deg,#c9a227,#a6821f);border-color:transparent}
    .roadmap-item-desc{color:#b8aa8d;font-size:13px;line-height:1.45;margin-top:5px}
    .roadmap-vote{flex:0 0 auto;display:flex;flex-direction:column;align-items:center;gap:6px;min-width:74px}
    .roadmap-vote-btn{display:flex;flex-direction:column;align-items:center;gap:2px;width:64px;padding:8px 0;font:inherit;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:#e8dcc5;background:rgba(201,162,39,.08);border:1px solid var(--edge);border-radius:12px;cursor:pointer;transition:background .12s,border-color .12s,color .12s}
    .roadmap-vote-btn:hover{background:rgba(201,162,39,.2);border-color:#c9a227;color:#f0d878}
    .roadmap-vote-btn .arrow{font-size:16px;line-height:1}
    .roadmap-vote-btn .count{font-family:'Cinzel',Georgia,serif;font-size:18px;font-weight:800;color:#e8dcc5}
    .roadmap-item.voted .roadmap-vote-btn{background:linear-gradient(135deg,#c9a227,#a6821f);border-color:transparent;color:#15120c}
    .roadmap-item.voted .roadmap-vote-btn .count{color:#15120c}
    @media(max-width:640px){
      .roadmap-title{font-size:24px}
      .roadmap-item{padding:12px;gap:10px}
      .roadmap-rank{width:20px;font-size:16px}
      .roadmap-item-desc{display:none}
      .roadmap-vote{min-width:60px}
      .roadmap-vote-btn{width:54px}
    }`;

  document.head.appendChild(style);
  document.body.appendChild(root);

  const listEl = root.querySelector<HTMLDivElement>("#roadmap-list")!;
  const totalsEl = root.querySelector<HTMLDivElement>("#roadmap-totals")!;

  function votesFor(id: string): number {
    return store.votes[id] ?? 0;
  }

  function toggleVote(id: string): void {
    const i = store.mine.indexOf(id);
    if (i >= 0) {
      store.mine.splice(i, 1);
      store.votes[id] = Math.max(0, votesFor(id) - 1);
    } else {
      store.mine.push(id);
      store.votes[id] = votesFor(id) + 1;
    }
    saveStore(store);
    render();
  }

  function render(): void {
    const sorted = [...MILESTONES].sort((a, b) => votesFor(b.id) - votesFor(a.id));
    const total = MILESTONES.reduce((sum, m) => sum + votesFor(m.id), 0);
    totalsEl.innerHTML = `<b>${total.toLocaleString()}</b> votes cast across <b>${MILESTONES.length}</b> milestones`;

    listEl.innerHTML = sorted
      .map((m, i) => {
        const voted = store.mine.includes(m.id);
        const phase = m.phase ? `<span class="roadmap-badge phase">${escapeHtml(m.phase)}</span>` : "";
        return `
          <div class="roadmap-item${voted ? " voted" : ""}" data-id="${m.id}">
            <div class="roadmap-rank">${i + 1}</div>
            <div class="roadmap-body">
              <div class="roadmap-item-top">
                <span class="roadmap-item-title">${escapeHtml(m.title)}</span>
                <span class="roadmap-badge">${escapeHtml(m.tag)}</span>
                ${phase}
              </div>
              <div class="roadmap-item-desc">${escapeHtml(m.desc)}</div>
            </div>
            <div class="roadmap-vote">
              <button type="button" class="roadmap-vote-btn" data-vote="${m.id}" title="${voted ? "Remove your vote" : "Vote for this milestone"}">
                <span class="arrow">${voted ? "✓" : "▲"}</span>
                <span class="count">${votesFor(m.id).toLocaleString()}</span>
              </button>
            </div>
          </div>`;
      })
      .join("");

    listEl.querySelectorAll<HTMLButtonElement>("[data-vote]").forEach((btn) =>
      btn.addEventListener("click", () => toggleVote(btn.dataset.vote!)),
    );
  }

  const doClose = (): void => {
    root.classList.add("hidden");
  };
  root.querySelector<HTMLButtonElement>("#roadmap-close")!.addEventListener("click", doClose);
  root.addEventListener("click", (e) => {
    if (e.target === root) doClose();
  });

  return {
    open() {
      render();
      root.classList.remove("hidden");
    },
    close: doClose,
  };
}
