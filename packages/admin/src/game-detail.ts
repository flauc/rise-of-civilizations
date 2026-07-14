import type { AdminGameSessionDetail, SessionScoreboardEntry } from "@roc/shared";
import { gameSetupFields } from "./game-setup";
import { API_BASE, esc, fullDate, getToken, playerCell, shortId, titleCase } from "./util";

export async function fetchGameSession(id: string): Promise<AdminGameSessionDetail> {
  const res = await fetch(`${API_BASE}/admin/api/game/${encodeURIComponent(id)}`, {
    headers: { "x-admin-token": getToken() },
  });
  if (!res.ok) throw new Error(`request failed (${res.status})`);
  return (await res.json()) as AdminGameSessionDetail;
}

function gameModalEl(): HTMLDivElement {
  let el = document.getElementById("game-modal") as HTMLDivElement | null;
  if (!el) {
    el = document.createElement("div");
    el.id = "game-modal";
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

function setupTable(g: AdminGameSessionDetail): string {
  const rows = gameSetupFields(g)
    .map((f) => `<tr><td class="muted">${esc(f.label)}</td><td>${esc(f.value)}</td></tr>`)
    .join("");
  return `<table class="data-table compact" style="margin-bottom:14px"><tbody>${rows}</tbody></table>`;
}

function tagList(items: string[] | undefined, empty = "None"): string {
  if (!items?.length) return `<span class="muted">${esc(empty)}</span>`;
  return `<div class="tag-list">${items.map((item) => `<span class="tag">${esc(item)}</span>`).join("")}</div>`;
}

function statCell(label: string, value: string): string {
  return `<div class="player-stat"><span class="muted">${esc(label)}</span><b>${value}</b></div>`;
}

function hasRichSnapshot(p: SessionScoreboardEntry): boolean {
  return (
    p.cities != null ||
    (p.techs?.length ?? 0) > 0 ||
    (p.wonders?.length ?? 0) > 0 ||
    (p.naturalWonders?.length ?? 0) > 0 ||
    (p.legends?.length ?? 0) > 0 ||
    (p.greatPeopleRecruited?.length ?? 0) > 0 ||
    (p.cityNames?.length ?? 0) > 0
  );
}

function playerPanel(p: SessionScoreboardEntry, rank: number): string {
  const kind = p.isBarbarian ? "Barbarian" : p.isHuman ? "Human" : "AI";
  const civ = p.civId ? titleCase(p.civId) : "—";
  const score = p.score != null ? p.score.toLocaleString() : "—";
  const you = p.isViewer ? ' <span class="muted">(session owner)</span>' : "";
  const rich = hasRichSnapshot(p);

  const stats = rich
    ? `<div class="player-stats">
        ${statCell("Cities", p.cities != null ? String(p.cities) : "—")}
        ${statCell("Population", p.population != null ? String(p.population) : "—")}
        ${statCell("Gold", p.gold != null ? p.gold.toLocaleString() : "—")}
        ${statCell("Faith", p.faith != null ? p.faith.toLocaleString() : "—")}
        ${statCell("Units", p.units != null ? String(p.units) : "—")}
        ${statCell("Military", p.militaryUnits != null ? String(p.militaryUnits) : "—")}
        ${statCell("Battles won", p.battlesWon != null ? String(p.battlesWon) : "—")}
        ${statCell("Cities captured", p.citiesCaptured != null ? String(p.citiesCaptured) : "—")}
        ${statCell("Legends recruited", p.legendsRecruited != null ? String(p.legendsRecruited) : "—")}
      </div>
      <div class="player-detail-grid">
        <div><div class="detail-label muted">Cities</div>${tagList(p.cityNames)}</div>
        <div><div class="detail-label muted">Technologies (${p.techs?.length ?? 0})</div>${tagList(p.techs)}</div>
        <div><div class="detail-label muted">Government</div><div>${esc(p.government ?? "—")}${p.researching ? `<span class="muted"> · researching ${esc(p.researching)}</span>` : ""}</div></div>
        <div><div class="detail-label muted">Civics (${p.civics?.length ?? 0})</div>${tagList(p.civics)}</div>
        <div><div class="detail-label muted">World wonders</div>${tagList(p.wonders)}</div>
        <div><div class="detail-label muted">Natural wonders</div>${tagList(p.naturalWonders)}</div>
        <div><div class="detail-label muted">Legends on map</div>${tagList(p.legends)}</div>
        <div><div class="detail-label muted">Great People recruited</div>${tagList(p.greatPeopleRecruited?.length ? p.greatPeopleRecruited : p.greatPeople, "None")}</div>
        <div><div class="detail-label muted">Religion</div><div>${esc(p.religion ?? "—")}${p.eliminated ? ' <span class="pill loss">Eliminated</span>' : ""}</div></div>
      </div>`
    : `<div class="muted player-legacy">Detailed stats were not saved for this player (legacy session or left before snapshot).</div>`;

  return `<article class="player-panel">
    <header class="player-panel-head">
      <span class="num muted">#${rank}</span>
      <div class="grow">
        <b>${esc(p.name)}</b>${you}
        <div class="muted player-sub">${esc(civ)} · ${esc(kind)} · Score ${esc(score)}</div>
      </div>
    </header>
    ${stats}
  </article>`;
}

function scoreboardSection(g: AdminGameSessionDetail): string {
  if (!g.scoreboard.length) {
    return `<div class="muted" style="margin-bottom:14px">No player data recorded.</div>`;
  }
  const missingAiScores = g.scoreboard.some((p) => !p.isHuman && !p.isBarbarian && p.score == null);
  const missingRich = g.scoreboard.every((p) => !hasRichSnapshot(p));
  const notes: string[] = [];
  if (missingAiScores) {
    notes.push("AI scores were not saved for this session (played before score tracking, or left before a snapshot).");
  }
  if (missingRich) {
    notes.push("City, tech, and legend details appear for games finished after the latest client update.");
  }
  const note = notes.length
    ? `<div class="muted" style="margin:0 0 10px;font-size:13px">${notes.map((n) => esc(n)).join(" ")}</div>`
    : "";
  const panels = g.scoreboard.map((p, i) => playerPanel(p, i + 1)).join("");
  return `${note}<div class="player-panels">${panels}</div>`;
}

export async function openGameSession(id: string): Promise<void> {
  const modal = gameModalEl();
  modal.style.display = "flex";
  modal.innerHTML = `<section class="game-modal-panel"><div class="muted">Loading game…</div></section>`;
  let g: AdminGameSessionDetail;
  try {
    g = await fetchGameSession(id);
  } catch (err) {
    modal.innerHTML = `<section class="game-modal-panel"><div class="err">Could not load game (${esc(String(err))}).</div><div style="margin-top:12px"><button class="btn" id="game-close">Close</button></div></section>`;
    modal.querySelector<HTMLButtonElement>("#game-close")!.addEventListener("click", () => (modal.style.display = "none"));
    return;
  }

  const when = g.endedAt ?? g.startedAt;
  const outcome =
    g.outcome != null
      ? `<span class="pill ${esc(g.outcome)}">${esc(g.outcome)}</span>`
      : `<span class="muted">In progress / unknown</span>`;
  const condition = g.condition ? titleCase(g.condition) : "—";
  const turns = g.turns != null ? String(g.turns) : "—";
  const score = g.score != null ? g.score.toLocaleString() : "—";
  const rank = g.scoreRank != null ? `#${g.scoreRank}` : "—";

  modal.innerHTML = `
    <section class="game-modal-panel">
      <div class="topbar">
        <h2 style="margin:0">Game session</h2>
        <button class="btn" id="game-close">Close</button>
      </div>
      <div class="sub" style="margin:6px 0 14px">
        ${when ? esc(fullDate(when)) : "—"}
        · ${g.handle ? playerCell(g.handle) : `<span class="muted">Guest</span>`}
        · ${g.mode ? esc(g.mode.toUpperCase()) : "—"}
        · <span class="mono" title="${esc(g.sessionId)}">${esc(shortId(g.sessionId))}</span>
      </div>

      <div class="sub-h">Result</div>
      <table class="data-table compact" style="margin-bottom:14px">
        <tbody>
          <tr><td class="muted">Outcome</td><td>${outcome}</td></tr>
          <tr><td class="muted">Victory type</td><td>${esc(condition)}</td></tr>
          <tr><td class="muted">Turns</td><td>${esc(turns)}</td></tr>
          <tr><td class="muted">Your score</td><td>${esc(score)}</td></tr>
          <tr><td class="muted">Your rank</td><td>${esc(rank)}</td></tr>
        </tbody>
      </table>

      <div class="sub-h">Players</div>
      ${scoreboardSection(g)}

      <div class="sub-h">Game setup</div>
      ${setupTable(g)}
    </section>`;

  modal.querySelector<HTMLButtonElement>("#game-close")!.addEventListener("click", () => (modal.style.display = "none"));
}

const boundRoots = new WeakSet<ParentNode>();

export function bindGameDetailButtons(root: ParentNode): void {
  if (boundRoots.has(root)) return;
  boundRoots.add(root);
  root.addEventListener("click", (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-game]");
    if (!el?.dataset.game) return;
    e.preventDefault();
    void openGameSession(el.dataset.game);
  });
}
