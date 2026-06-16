// Pre-game menu: a proper start screen with navigable sub-screens for
// single-player setup, multiplayer lobby, and loading saved games.

import { LocalSession, OnlineSession, MAP_DIMENSIONS, type MapSize, type Session } from "./session";
import { createWiki } from "./wiki";
import { CIVILIZATIONS, PLAYER_COLORS, type GameSummary, type SerializedState } from "@roc/sim";
import { deleteSave, listSaves, loadSave, type SaveRecord } from "./save-db";
import { loadLeaderAtlas, isImageReady } from "./leader-assets";

const DEFAULT_WS_SCHEME = location.protocol === "https:" ? "wss" : "ws";
const DEFAULT_WS =
  import.meta.env.VITE_WS_URL?.trim() || `${DEFAULT_WS_SCHEME}://${location.hostname || "localhost"}:3001/ws`;

type Screen = "start" | "sp" | "mp" | "load";

type BarbLevel = "none" | "minimal" | "low" | "normal" | "high";

/** "random" = let the sim assign a random unique civ when the game starts. */
const RANDOM_CIV = "random";

/** One AI opponent's configuration in the setup roster. */
interface AiConfig {
  civId: string | typeof RANDOM_CIV;
  color: string;
}

const MAX_AI = 12;

interface MenuState {
  screen: Screen;
  sp: {
    civId: string;
    color: string;
    mapSize: MapSize;
    ais: AiConfig[];
    barbarians: BarbLevel;
  };
  mp: {
    url: string;
    handle: string;
    password: string;
    capacity: number;
    /** Color per human slot (length tracks capacity). */
    humanColors: string[];
    ais: AiConfig[];
    userId: string;
  };
}

/** First palette color not already taken (falls back to gray if exhausted). */
function firstFreeColor(used: Set<string>): string {
  return PLAYER_COLORS.find((c) => !used.has(c)) ?? "#aaaaaa";
}

/**
 * Civ <option> list, optionally led by a "Random" entry for AI slots. Civs in
 * `taken` (chosen by another player) are disabled so no two players can share one;
 * the slot's own current selection is always selectable.
 */
function civOptions(selected: string, includeRandom: boolean, taken: Set<string>): string {
  const opts = includeRandom
    ? [`<option value="${RANDOM_CIV}"${selected === RANDOM_CIV ? " selected" : ""}>🎲 Random civilization</option>`]
    : [];
  for (const c of CIVILIZATIONS) {
    const isTaken = taken.has(c.id) && c.id !== selected;
    opts.push(
      `<option value="${c.id}"${c.id === selected ? " selected" : ""}${isTaken ? " disabled" : ""}>${escapeHtml(c.name)} — ${escapeHtml(c.leader)}${isTaken ? " (taken)" : ""}</option>`,
    );
  }
  return opts.join("");
}

/** A row of palette swatches; colors used by other players are disabled. */
function colorPicker(current: string, takenByOthers: Set<string>): string {
  return `<div class="cp">${PLAYER_COLORS.map((c) => {
    const taken = takenByOthers.has(c) && c !== current;
    return `<button type="button" class="cp-dot${c === current ? " sel" : ""}${taken ? " taken" : ""}" data-color="${c}"${taken ? " disabled" : ""} style="--c:${c}"${taken ? ' title="Taken by another player"' : ""}></button>`;
  }).join("")}</div>`;
}

function mapSelect(id: string, value: MapSize): string {
  const sizes: { value: MapSize; label: string }[] = [
    { value: "small", label: "Small" },
    { value: "medium", label: "Medium" },
    { value: "large", label: "Large" },
    { value: "huge", label: "Huge" },
    { value: "giant", label: "Giant" },
  ];
  return `<select id="${id}" class="menu-in">${sizes
    .map((s) => `<option value="${s.value}"${s.value === value ? " selected" : ""}>${s.label}</option>`)
    .join("")}</select>`;
}

function barbarianSelect(id: string, value: string): string {
  const opts = [
    { value: "none", label: "None" },
    { value: "minimal", label: "Minimal" },
    { value: "low", label: "Low" },
    { value: "normal", label: "Normal" },
    { value: "high", label: "High" },
  ];
  return `<select id="${id}" class="menu-in">${opts
    .map((o) => `<option value="${o.value}"${o.value === value ? " selected" : ""}>${o.label}</option>`)
    .join("")}</select>`;
}

function capacitySelect(id: string, value: number): string {
  return `<select id="${id}" class="menu-in">${Array.from({ length: 12 }, (_, n) => n + 1)
    .map((n) => `<option value="${n}"${n === value ? " selected" : ""}>${n}</option>`)
    .join("")}</select>`;
}

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

export function createLobby(onStart: (session: Session) => void): void {
  const state: MenuState = {
    screen: "start",
    sp: {
      civId: CIVILIZATIONS[0]!.id,
      color: PLAYER_COLORS[0]!,
      mapSize: "medium",
      ais: [{ civId: RANDOM_CIV, color: PLAYER_COLORS[1]! }],
      barbarians: "normal",
    },
    mp: {
      url: DEFAULT_WS,
      handle: "",
      password: "",
      capacity: 2,
      humanColors: [PLAYER_COLORS[0]!, PLAYER_COLORS[1]!],
      ais: [],
      userId: "",
    },
  };

  const leaderAtlas = loadLeaderAtlas();

  const wiki = createWiki();

  const root = document.createElement("div");
  root.id = "lobby";
  root.innerHTML = `
    <div class="lobby-layout">
      <div class="lobby-left" id="lobby-left"></div>
      <div class="lobby-right" id="lobby-right"></div>
    </div>`;

  const style = document.createElement("style");
  style.textContent = `
    #lobby{position:fixed;inset:0;z-index:50;background:#0f0e0b}
    .lobby-layout{display:flex;height:100%;width:100%}
    .lobby-left{width:380px;max-width:92vw;flex-shrink:0;display:flex;flex-direction:column;background:linear-gradient(180deg,#1f1c14 0%,#15120c 100%);border-right:1px solid var(--edge);padding:28px;overflow:auto;box-shadow:4px 0 24px rgba(0,0,0,.55)}
    .lobby-right{flex:1;position:relative;display:flex;flex-direction:column;justify-content:flex-end;padding:48px 56px;background:radial-gradient(circle at 70% 30%,rgba(201,162,39,0.14) 0%,#0f0e0b 60%);overflow:hidden}
    .lobby-right::before{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(15,14,11,0) 0%,rgba(15,14,11,.78) 100%);pointer-events:none}
    .lobby-title{font-family:'Cinzel',Georgia,serif;font-size:28px;font-weight:800;color:#e8dcc5;letter-spacing:.5px;margin-bottom:4px}
    .lobby-subtitle{color:#b8aa8d;font-size:13px;margin-bottom:24px}
    .lobby-version{margin-top:auto;color:#b8aa8d;font-size:12px;text-align:center;padding-top:18px}
    .menu-actions{display:flex;flex-direction:column;gap:10px;margin-top:8px}
    .menu-btn{width:100%;padding:12px 14px;font:inherit;font-size:15px;font-weight:700;color:#e8dcc5;background:rgba(201,162,39,0.08);border:1px solid var(--edge);border-radius:999px;cursor:pointer;text-align:left;display:flex;align-items:center;gap:10px;transition:background .12s,border-color .12s,color .12s,box-shadow .12s}
    .menu-btn:hover{background:rgba(201,162,39,0.18);border-color:#c9a227;color:#f0d878;box-shadow:0 0 16px rgba(201,162,39,.2)}
    .menu-btn.primary{background:linear-gradient(135deg,#c9a227,#a6821f);border-color:transparent;color:#15120c}
    .menu-btn.primary:hover{background:linear-gradient(135deg,#f0d878,#c9a227);color:#0f0e0b}
    .menu-btn.secondary{background:transparent;border-color:rgba(201,162,39,.35);color:#b8aa8d}
    .menu-btn.secondary:hover{background:rgba(201,162,39,.08);border-color:#c9a227;color:#f0d878}
    .menu-btn .icon{width:22px;text-align:center;opacity:.9}
    .menu-section{margin-top:18px}
    .menu-section-title{font-family:'Cinzel',Georgia,serif;font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#c9a227;margin-bottom:8px}
    .menu-row{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-top:8px}
    .menu-row>span{white-space:nowrap;color:#e8dcc5}
    .menu-row>.menu-in{flex:1;max-width:200px}
    .menu-in{font:inherit;font-size:13px;color:#e8dcc5;background:#1f1c14;border:1px solid var(--edge);border-radius:8px;padding:8px 10px;width:100%}
    .menu-in:focus{outline:none;border-color:#c9a227}
    .menu-hint{color:#b8aa8d;font-size:12px;margin-top:6px;line-height:1.4}
    .menu-status{color:#f0d878;margin-top:10px;min-height:20px;font-size:13px}
    .menu-back-row{display:flex;gap:10px;margin-top:18px}
    .menu-back-row .menu-btn{width:auto;flex:1}
    .roster-row{display:flex;flex-direction:column;gap:6px;padding:10px;border:1px solid var(--edge);border-radius:10px;background:#1f1c14;margin-top:8px}
    .roster-head{display:flex;align-items:center;gap:8px}
    .roster-head .roster-civ{flex:1;min-width:0}
    .roster-tag{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#b8aa8d;background:rgba(201,162,39,.08);border-radius:6px;padding:3px 7px;white-space:nowrap}
    .roster-tag.you{color:#15120c;background:linear-gradient(135deg,#c9a227,#a6821f)}
    .roster-note{font-size:12px;color:#b8aa8d;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .roster-remove{flex-shrink:0;width:28px;height:28px;border-radius:8px;border:1px solid var(--edge);background:transparent;color:#e0907d;cursor:pointer;font-size:13px;line-height:1}
    .roster-remove:hover{background:rgba(138,44,44,.18);border-color:rgba(138,44,44,.4);color:#e0a69a}
    .roster-add{margin-top:10px}
    .cp{display:flex;flex-wrap:wrap;gap:5px}
    .cp-dot{width:18px;height:18px;border-radius:50%;background:var(--c);border:2px solid transparent;cursor:pointer;padding:0;transition:transform .08s}
    .cp-dot.sel{border-color:#fff;box-shadow:0 0 0 2px rgba(255,255,255,.3)}
    .cp-dot.taken{opacity:.22;cursor:not-allowed}
    .cp-dot:hover:not(.taken):not(.sel){transform:scale(1.18)}
    .save-list{display:flex;flex-direction:column;gap:8px;margin-top:10px}
    .save-row{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:10px;border:1px solid var(--edge);border-radius:10px;background:#1f1c14}
    .save-row .info{min-width:0}
    .save-row .name{font-weight:600;color:#e8dcc5;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .save-row .meta{color:#b8aa8d;font-size:11.5px;margin-top:2px}
    .save-row .actions{display:flex;gap:6px;flex-shrink:0}
    .hidden{display:none !important}
    .showcase{position:relative;z-index:1;max-width:720px}
    .showcase-label{font-family:'Cinzel',Georgia,serif;font-size:12px;text-transform:uppercase;letter-spacing:2px;color:#c9a227;margin-bottom:10px;opacity:.85}
    .showcase-civ{font-family:'Cinzel',Georgia,serif;font-size:52px;font-weight:900;color:#e8dcc5;line-height:1.05;text-shadow:0 4px 24px rgba(0,0,0,.55)}
    .showcase-leader{font-family:'Cinzel',Georgia,serif;font-size:22px;color:#f0d878;margin-top:8px;font-weight:600}
    .showcase-quote{font-size:20px;color:#e8dcc5;line-height:1.5;margin-top:22px;font-style:italic;max-width:640px;text-shadow:0 2px 12px rgba(0,0,0,.5)}
    .showcase-quote::before{content:"“";margin-right:4px;opacity:.7}
    .showcase-quote::after{content:"”";margin-left:4px;opacity:.7}
    .showcase-ability{margin-top:26px;background:rgba(31,28,20,.78);border:1px solid rgba(201,162,39,.25);border-radius:12px;padding:16px 18px;backdrop-filter:blur(10px)}
    .showcase-ability-name{font-family:'Cinzel',Georgia,serif;font-size:15px;font-weight:700;color:#f0d878;margin-bottom:4px}
    .showcase-ability-desc{font-size:13px;color:#e8dcc5;line-height:1.4}
    .showcase-uniques{margin-top:10px;font-size:12px;color:#b8aa8d}
    .showcase-art-wrapper{position:absolute;top:48px;right:56px;width:260px;height:320px;border-radius:16px;overflow:hidden;z-index:1;box-shadow:0 8px 32px rgba(0,0,0,.55);border:1px solid rgba(201,162,39,.25)}
    .showcase-art{width:100%;height:100%;object-fit:cover;display:block;border-radius:16px}
    .showcase-art-placeholder{position:absolute;inset:0;border:2px dashed rgba(201,162,39,.2);border-radius:16px;display:flex;align-items:center;justify-content:center;color:#b8aa8d;font-size:13px;text-align:center;background:rgba(201,162,39,.05)}
    .showcase-reroll{position:absolute;top:48px;right:56px;z-index:2;margin-top:338px;width:260px}
    @media(max-width:860px){
      #lobby{overflow-y:auto}
      .lobby-layout{flex-direction:column;height:auto;min-height:100%}
      .lobby-left{width:100%;border-right:none;padding:max(20px, env(safe-area-inset-top)) max(20px, env(safe-area-inset-right)) max(20px, env(safe-area-inset-bottom)) max(20px, env(safe-area-inset-left));overflow:visible}
      .lobby-right{position:relative;flex:none;width:100%;padding:24px max(20px, env(safe-area-inset-right)) 24px max(20px, env(safe-area-inset-left));justify-content:flex-start;overflow:visible;order:-1;background:radial-gradient(circle at 50% 0%,rgba(201,162,39,0.12) 0%,#0f0e0b 70%)}
      .showcase{max-width:none}
      .showcase-art-wrapper{position:static;width:100%;max-width:260px;height:auto;margin:0 auto 16px;border-radius:14px}
      .showcase-art{height:auto;border-radius:14px}
      .showcase-civ{font-size:34px}
      .showcase-leader{font-size:20px}
      .showcase-quote{font-size:16px;margin-top:14px}
      .showcase-ability{margin-top:18px;padding:14px}
      .showcase-reroll{position:static;width:100%;max-width:260px;margin:16px auto 0;order:1}
      #sp-civ-desc{display:none}
      .menu-btn{padding:14px 16px}
      .menu-in{padding:10px 12px}
    }`;
  document.head.appendChild(style);
  document.body.appendChild(root);

  const left = root.querySelector<HTMLDivElement>("#lobby-left")!;
  const right = root.querySelector<HTMLDivElement>("#lobby-right")!;
  const $ = <T extends HTMLElement>(sel: string) => left.querySelector<T>(sel)!;
  const $input = (sel: string) => $<HTMLInputElement>(sel);
  const $select = (sel: string) => $<HTMLSelectElement>(sel);
  const $btn = (sel: string) => $<HTMLButtonElement>(sel);
  const close = () => {
    root.remove();
    style.remove();
  };

  function pickRandomCiv(): typeof CIVILIZATIONS[number] {
    return CIVILIZATIONS[Math.floor(Math.random() * CIVILIZATIONS.length)]!;
  }

  function renderShowcase(civId?: string, allowReroll = true): void {
    const civ = (civId ? CIVILIZATIONS.find((c) => c.id === civId) : undefined) ?? pickRandomCiv();
    const src = leaderAtlas.images[civ.id]?.src ?? `${import.meta.env.BASE_URL}leaders/${civ.id}.png`;
    const rerollBtn = allowReroll
      ? `<button class="menu-btn secondary showcase-reroll" id="showcase-reroll">Show another civilization</button>`
      : "";
    right.innerHTML = `
      <div class="showcase-art-wrapper">
        <img id="showcase-art" class="showcase-art hidden" src="${src}" alt="" />
        <div id="showcase-art-placeholder" class="showcase-art-placeholder">Leader art<br/>coming soon</div>
      </div>
      ${rerollBtn}
      <div class="showcase">
        <div class="showcase-label">Featured Civilization</div>
        <div class="showcase-civ">${escapeHtml(civ.name)}</div>
        <div class="showcase-leader">${escapeHtml(civ.leader)}</div>
        <div class="showcase-quote">${escapeHtml(civ.leaderQuote || "")}</div>
        <div class="showcase-ability">
          <div class="showcase-ability-name">${escapeHtml(civ.abilityName)}</div>
          <div class="showcase-ability-desc">${escapeHtml(civ.abilityDesc)}</div>
          <div class="showcase-uniques">Unique Unit: <b>${escapeHtml(civ.uniqueUnit)}</b> · Unique Infrastructure: <b>${escapeHtml(civ.uniqueInfra)}</b></div>
        </div>
      </div>`;
    const img = right.querySelector<HTMLImageElement>("#showcase-art");
    const placeholder = right.querySelector<HTMLDivElement>("#showcase-art-placeholder");
    if (img && placeholder) {
      const reveal = (): void => {
        if (isImageReady(img)) {
          img.classList.remove("hidden");
          placeholder.classList.add("hidden");
        }
      };
      img.onload = reveal;
      img.onerror = () => {
        // Keep the placeholder visible when the portrait is missing.
      };
      reveal();
    }
    right.querySelector<HTMLButtonElement>("#showcase-reroll")?.addEventListener("click", () => renderShowcase());
  }

  function showScreen(screen: Screen): void {
    state.screen = screen;
    switch (screen) {
      case "start":
        renderStartScreen();
        break;
      case "sp":
        renderSinglePlayer();
        break;
      case "mp":
        renderMultiplayer();
        break;
      case "load":
        void renderLoadGame();
        break;
    }
  }

  function renderStartScreen(): void {
    left.innerHTML = `
      <div class="lobby-title">Rise of Civilizations</div>
      <div class="lobby-subtitle">Ancient Era → Age of Exploration</div>
      <div class="menu-actions">
        <button class="menu-btn primary" data-screen="sp">Single Player</button>
        <button class="menu-btn" data-screen="mp">Multiplayer</button>
        <button class="menu-btn" data-screen="load">Load Game</button>
        <button class="menu-btn" id="lobby-wiki">Wiki</button>
      </div>`;
    left.querySelectorAll<HTMLButtonElement>("[data-screen]").forEach((el) =>
      el.addEventListener("click", () => showScreen(el.dataset.screen as Screen)),
    );
    left.querySelector<HTMLButtonElement>("#lobby-wiki")?.addEventListener("click", () => wiki.open());
  }

  function renderSinglePlayer(): void {
    left.innerHTML = `
      <button class="menu-btn secondary" id="back" style="width:auto;padding:8px 12px;font-size:13px"><span class="icon">←</span> Back</button>
      <div class="menu-section">
        <div class="menu-section-title">Players & Opponents</div>
        <div id="sp-roster"></div>
        <div id="sp-civ-desc" class="menu-hint"></div>
      </div>
      <div class="menu-section">
        <div class="menu-section-title">Game Options</div>
        <div class="menu-row"><span>Map size</span>${mapSelect("sp-map", state.sp.mapSize)}</div>
        <div class="menu-row"><span>Barbarians</span>${barbarianSelect("sp-barb", state.sp.barbarians)}</div>
      </div>
      <div class="menu-back-row">
        <button class="menu-btn secondary" id="back2">Back</button>
        <button class="menu-btn primary" id="sp-start">Start Game</button>
      </div>`;

    const updateCivDesc = () => {
      const c = CIVILIZATIONS.find((x) => x.id === state.sp.civId);
      $("#sp-civ-desc").innerHTML = c
        ? `<b>${c.abilityName}:</b> ${c.abilityDesc}<br/>UU: ${c.uniqueUnit} · ${c.uniqueInfra}`
        : "";
    };

    const renderRoster = (): void => {
      const used = new Set<string>([state.sp.color, ...state.sp.ais.map((a) => a.color)]);
      // Concretely-chosen civs (ignoring "random") — used to disable duplicates.
      const takenCivs = new Set<string>([
        state.sp.civId,
        ...state.sp.ais.map((a) => a.civId).filter((c) => c !== RANDOM_CIV),
      ]);
      const human = `
        <div class="roster-row" data-row="human">
          <div class="roster-head">
            <span class="roster-tag you">You</span>
            <select class="menu-in roster-civ" data-civ="human">${civOptions(state.sp.civId, false, takenCivs)}</select>
          </div>
          ${colorPicker(state.sp.color, used)}
        </div>`;
      const ais = state.sp.ais
        .map(
          (ai, i) => `
        <div class="roster-row" data-row="ai-${i}">
          <div class="roster-head">
            <span class="roster-tag">AI ${i + 1}</span>
            <select class="menu-in roster-civ" data-civ="ai-${i}">${civOptions(ai.civId, true, takenCivs)}</select>
            <button type="button" class="roster-remove" data-remove="${i}" title="Remove opponent">✕</button>
          </div>
          ${colorPicker(ai.color, used)}
        </div>`,
        )
        .join("");
      const add =
        state.sp.ais.length < MAX_AI
          ? `<button type="button" class="menu-btn roster-add" id="sp-add-ai">+ Add AI opponent</button>`
          : `<div class="menu-hint">Maximum of ${MAX_AI} AI opponents reached.</div>`;
      $("#sp-roster").innerHTML = human + ais + add;
      wireRoster();
    };

    const wireRoster = (): void => {
      const root = $("#sp-roster");
      root.querySelectorAll<HTMLSelectElement>(".roster-civ").forEach((sel) =>
        sel.addEventListener("change", () => {
          if (sel.dataset.civ === "human") {
            state.sp.civId = sel.value;
            updateCivDesc();
            renderShowcase(state.sp.civId);
          } else {
            state.sp.ais[Number(sel.dataset.civ!.slice(3))]!.civId = sel.value;
          }
          renderRoster(); // refresh "taken" civ states across all dropdowns
        }),
      );
      root.querySelectorAll<HTMLButtonElement>(".cp-dot").forEach((dot) =>
        dot.addEventListener("click", () => {
          const rowKey = (dot.closest("[data-row]") as HTMLElement).dataset.row!;
          if (rowKey === "human") state.sp.color = dot.dataset.color!;
          else state.sp.ais[Number(rowKey.slice(3))]!.color = dot.dataset.color!;
          renderRoster();
        }),
      );
      root.querySelectorAll<HTMLButtonElement>("[data-remove]").forEach((btn) =>
        btn.addEventListener("click", () => {
          state.sp.ais.splice(Number(btn.dataset.remove), 1);
          renderRoster();
        }),
      );
      root.querySelector<HTMLButtonElement>("#sp-add-ai")?.addEventListener("click", () => {
        const used = new Set<string>([state.sp.color, ...state.sp.ais.map((a) => a.color)]);
        state.sp.ais.push({ civId: RANDOM_CIV, color: firstFreeColor(used) });
        renderRoster();
      });
    };

    updateCivDesc();
    renderRoster();
    renderShowcase(state.sp.civId, false);
    $("#back").addEventListener("click", () => showScreen("start"));
    $("#back2").addEventListener("click", () => showScreen("start"));
    $("#sp-start").addEventListener("click", () => {
      close();
      onStart(
        new LocalSession({
          civId: state.sp.civId,
          mapSize: $select("#sp-map").value as MapSize,
          aiCivIds: state.sp.ais.map((a) => (a.civId === RANDOM_CIV ? null : a.civId)),
          colors: [state.sp.color, ...state.sp.ais.map((a) => a.color)],
          barbarians: $select("#sp-barb").value as BarbLevel,
          seed: "rise-" + Math.random().toString(36).slice(2, 8),
        }),
      );
    });
  }

  let mpSession: OnlineSession | null = null;
  let joinedGameId: string | null = null;

  function renderMultiplayer(): void {
    left.innerHTML = `
      <button class="menu-btn secondary" id="back" style="width:auto;padding:8px 12px;font-size:13px"><span class="icon">←</span> Back</button>
      <div class="menu-section">
        <div class="menu-section-title">Server</div>
        <input id="url" class="menu-in" value="${escapeHtml(state.mp.url)}" placeholder="ws://host:port/ws" />
      </div>
      <div class="menu-section">
        <div class="menu-section-title">Account</div>
        <div class="menu-row"><span>Handle</span><input id="handle" class="menu-in" value="${escapeHtml(state.mp.handle)}" placeholder="handle" style="max-width:200px" /></div>
        <div class="menu-row"><span>Password</span><input id="pw" class="menu-in" type="password" value="${escapeHtml(state.mp.password)}" placeholder="password" style="max-width:200px" /></div>
        <div class="menu-back-row" style="margin-top:12px">
          <button class="menu-btn" id="register">Register</button>
          <button class="menu-btn primary" id="login">Login</button>
        </div>
        <div id="status" class="menu-status"></div>
      </div>
      <div id="games" class="hidden menu-section">
        <div class="menu-section-title">Lobby</div>
        <div class="menu-row"><span>Map size</span>${mapSelect("mp-map", "medium")}</div>
        <div class="menu-row"><span>Human players</span>${capacitySelect("mp-capacity", state.mp.capacity)}</div>
        <div class="menu-row"><span>Barbarians</span>${barbarianSelect("mp-barb", "normal")}</div>
        <div class="menu-section-title" style="margin-top:14px">Players & Opponents</div>
        <div id="mp-roster"></div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px">
          <b>Games</b>
          <span style="display:flex;gap:6px">
            <button class="menu-btn" id="refresh" style="width:auto">Refresh</button>
            <button class="menu-btn primary" id="create" style="width:auto">Create</button>
          </span>
        </div>
        <div id="game-list" style="margin-top:8px"></div>
      </div>`;

    const status = (t: string) => ($("#status").textContent = t);
    const urlEl = $input("#url");
    const handleEl = $input("#handle");
    const pwEl = $input("#pw");

    urlEl.addEventListener("change", () => (state.mp.url = urlEl.value));
    handleEl.addEventListener("input", () => (state.mp.handle = handleEl.value));
    pwEl.addEventListener("input", () => (state.mp.password = pwEl.value));

    // Keep human-slot and AI colors unique, sizing the human list to capacity.
    const reconcileColors = (): void => {
      const used = new Set<string>();
      const humans: string[] = [];
      for (let i = 0; i < state.mp.capacity; i++) {
        let c = state.mp.humanColors[i];
        if (!c || used.has(c)) c = firstFreeColor(used);
        used.add(c);
        humans.push(c);
      }
      state.mp.humanColors = humans;
      for (const ai of state.mp.ais) {
        if (!ai.color || used.has(ai.color)) ai.color = firstFreeColor(used);
        used.add(ai.color);
      }
    };

    const renderRoster = (): void => {
      reconcileColors();
      const used = new Set<string>([...state.mp.humanColors, ...state.mp.ais.map((a) => a.color)]);
      const humans = state.mp.humanColors
        .map(
          (color, i) => `
        <div class="roster-row" data-row="human-${i}">
          <div class="roster-head">
            <span class="roster-tag you">Player ${i + 1}</span>
            <span class="roster-note">${i === 0 ? "Host" : "Open slot"} · random civ</span>
          </div>
          ${colorPicker(color, used)}
        </div>`,
        )
        .join("");
      const takenCivs = new Set<string>(
        state.mp.ais.map((a) => a.civId).filter((c) => c !== RANDOM_CIV),
      );
      const ais = state.mp.ais
        .map(
          (ai, i) => `
        <div class="roster-row" data-row="ai-${i}">
          <div class="roster-head">
            <span class="roster-tag">AI ${i + 1}</span>
            <select class="menu-in roster-civ" data-civ="${i}">${civOptions(ai.civId, true, takenCivs)}</select>
            <button type="button" class="roster-remove" data-remove="${i}" title="Remove opponent">✕</button>
          </div>
          ${colorPicker(ai.color, used)}
        </div>`,
        )
        .join("");
      const add =
        state.mp.ais.length < MAX_AI
          ? `<button type="button" class="menu-btn roster-add" id="mp-add-ai">+ Add AI opponent</button>`
          : `<div class="menu-hint">Maximum of ${MAX_AI} AI opponents reached.</div>`;
      const root = $("#mp-roster");
      root.innerHTML = humans + ais + add;

      root.querySelectorAll<HTMLSelectElement>(".roster-civ").forEach((sel) =>
        sel.addEventListener("change", () => {
          state.mp.ais[Number(sel.dataset.civ)]!.civId = sel.value;
          renderRoster(); // refresh "taken" civ states across all dropdowns
        }),
      );
      root.querySelectorAll<HTMLButtonElement>(".cp-dot").forEach((dot) =>
        dot.addEventListener("click", () => {
          const rowKey = (dot.closest("[data-row]") as HTMLElement).dataset.row!;
          if (rowKey.startsWith("human-")) state.mp.humanColors[Number(rowKey.slice(6))] = dot.dataset.color!;
          else state.mp.ais[Number(rowKey.slice(3))]!.color = dot.dataset.color!;
          renderRoster();
        }),
      );
      root.querySelectorAll<HTMLButtonElement>("[data-remove]").forEach((btn) =>
        btn.addEventListener("click", () => {
          state.mp.ais.splice(Number(btn.dataset.remove), 1);
          renderRoster();
        }),
      );
      root.querySelector<HTMLButtonElement>("#mp-add-ai")?.addEventListener("click", () => {
        const used2 = new Set<string>([...state.mp.humanColors, ...state.mp.ais.map((a) => a.color)]);
        state.mp.ais.push({ civId: RANDOM_CIV, color: firstFreeColor(used2) });
        renderRoster();
      });
    };

    $select("#mp-capacity").addEventListener("change", () => {
      state.mp.capacity = Math.max(1, Math.min(12, Number($select("#mp-capacity").value)));
      renderRoster();
    });
    renderRoster();

    const renderGames = (games: GameSummary[]) => {
      const list = $("#game-list");
      list.innerHTML =
        games.length === 0
          ? `<div class="menu-hint">No games yet — create one.</div>`
          : games
              .map(
                (g) => {
                  const isHost = g.hostUserId === state.mp.userId;
                  let buttons = joinedGameId === g.id
                    ? `<button class="menu-btn primary" data-start="${g.id}" style="width:auto">Start</button>`
                    : `<button class="menu-btn" data-join="${g.id}" style="width:auto">Join</button>`;
                  if (isHost) {
                    buttons += ` <button class="menu-btn" data-delete="${g.id}" style="width:auto">Delete</button>`;
                  }
                  return `<div class="save-row"><span class="info"><span class="name">${escapeHtml(g.name)}</span><span class="meta">${g.players}/${g.capacity} players · ${g.status}</span></span><span style="display:flex;gap:6px">${buttons}</span></div>`;
                },
              )
              .join("");
      list.querySelectorAll<HTMLButtonElement>("[data-join]").forEach((el) =>
        el.addEventListener("click", () => mpSession?.send({ t: "joinGame", gameId: el.dataset.join! })),
      );
      list.querySelectorAll<HTMLButtonElement>("[data-start]").forEach((el) =>
        el.addEventListener("click", () => mpSession?.send({ t: "startGame", gameId: el.dataset.start! })),
      );
      list.querySelectorAll<HTMLButtonElement>("[data-delete]").forEach((el) =>
        el.addEventListener("click", () => {
          if (confirm("Delete this game? This cannot be undone.")) {
            mpSession?.send({ t: "deleteGame", gameId: el.dataset.delete! });
          }
        }),
      );
    };

    const connectAndAuth = async (kind: "register" | "login") => {
      const url = urlEl.value.trim();
      const handle = handleEl.value.trim();
      const password = pwEl.value;
      if (!handle || !password) return status("Enter a handle and password.");
      if (!mpSession) {
        mpSession = new OnlineSession(url);
        mpSession.on((m) => {
          if (m.t === "error") status(m.message);
          else if (m.t === "authOk") {
            state.mp.userId = m.userId;
            status(`Signed in as ${m.handle}`);
            $("#games").classList.remove("hidden");
            mpSession!.send({ t: "listGames" });
          } else if (m.t === "games") renderGames(m.games);
          else if (m.t === "deleted") {
            if (joinedGameId === m.gameId) {
              joinedGameId = null;
              status("Game deleted by host.");
            }
            mpSession!.send({ t: "listGames" });
          }
          else if (m.t === "joined") {
            joinedGameId = m.gameId;
            status(`Joined game — you are player ${m.playerId + 1}`);
            mpSession!.send({ t: "listGames" });
          } else if (m.t === "started") {
            close();
            mpSession!.gameId = joinedGameId ?? undefined;
            onStart(mpSession!);
          }
        });
        try {
          await mpSession.connect();
        } catch {
          mpSession = null;
          return status("Could not connect to server.");
        }
      }
      mpSession.send({ t: kind, handle, password });
    };

    $("#back").addEventListener("click", () => showScreen("start"));
    $("#register").addEventListener("click", () => void connectAndAuth("register"));
    $("#login").addEventListener("click", () => void connectAndAuth("login"));
    $("#refresh").addEventListener("click", () => mpSession?.send({ t: "listGames" }));
    $("#create").addEventListener("click", () => {
      const dims = MAP_DIMENSIONS[($select("#mp-map").value as MapSize) ?? "medium"];
      reconcileColors();
      mpSession?.send({
        t: "createGame",
        name: `${handleEl.value || "Player"}'s game`,
        cols: dims.cols,
        rows: dims.rows,
        capacity: state.mp.capacity,
        aiCivIds: state.mp.ais.map((a) => (a.civId === RANDOM_CIV ? null : a.civId)),
        colors: [...state.mp.humanColors, ...state.mp.ais.map((a) => a.color)],
        barbarians: $select("#mp-barb").value as BarbLevel,
      });
    });
  }

  async function renderLoadGame(): Promise<void> {
    left.innerHTML = `
      <button class="menu-btn secondary" id="back" style="width:auto;padding:8px 12px;font-size:13px"><span class="icon">←</span> Back</button>
      <div class="menu-section">
        <div class="menu-section-title">Load Saved Game</div>
        <div id="load-error" class="menu-status"></div>
        <div id="load-empty" class="menu-hint">No saved games found.</div>
        <div id="load-list" class="save-list"></div>
      </div>`;

    $("#back").addEventListener("click", () => showScreen("start"));
    const errorEl = $("#load-error");
    const emptyEl = $("#load-empty");
    const listEl = $("#load-list");

    let saves: SaveRecord[] = [];
    try {
      saves = await listSaves();
    } catch {
      errorEl.textContent = "Could not open saved games.";
      emptyEl.classList.add("hidden");
      return;
    }

    if (saves.length === 0) {
      emptyEl.classList.remove("hidden");
      listEl.innerHTML = "";
      return;
    }
    emptyEl.classList.add("hidden");

    listEl.innerHTML = saves
      .map(
        (s) =>
          `<div class="save-row">` +
          `<span class="info">` +
          `<span class="name">${escapeHtml(s.name)}</span>` +
          `<span class="meta">${s.mode === "sp" ? "Single Player" : "Multiplayer"} · Turn ${s.turn} · ${new Date(s.createdAt).toLocaleString()}${s.gameId ? ` · ${s.gameId}` : ""}</span>` +
          `</span>` +
          `<span class="actions">` +
          `<button class="menu-btn primary" data-load="${s.id}" style="width:auto">Load</button>` +
          `<button class="menu-btn" data-delete="${s.id}" style="width:auto">🗑</button>` +
          `</span>` +
          `</div>`,
      )
      .join("");

    listEl.querySelectorAll<HTMLButtonElement>("[data-load]").forEach((el) =>
      el.addEventListener("click", async () => {
        const id = el.dataset.load!;
        const record = await loadSave(id);
        if (!record) return;
        if (record.mode === "mp") {
          errorEl.textContent = "MP saves can only be loaded by the host from the in-game menu.";
          return;
        }
        close();
        onStart(new LocalSession({ savedState: JSON.parse(record.blob) as SerializedState }));
      }),
    );
    listEl.querySelectorAll<HTMLButtonElement>("[data-delete]").forEach((el) =>
      el.addEventListener("click", async () => {
        await deleteSave(el.dataset.delete!);
        await renderLoadGame();
      }),
    );
  }

  renderShowcase();
  showScreen("start");
}
