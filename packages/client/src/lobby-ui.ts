// Pre-game menu: a proper start screen with navigable sub-screens for
// single-player setup, multiplayer lobby, and loading saved games.

import { LocalSession, OnlineSession, MAP_DIMENSIONS, type MapSize, type Session } from "./session";
import { createWiki } from "./wiki";
import { CIVILIZATIONS, type GameSummary, type SerializedState } from "@roc/sim";
import { deleteSave, listSaves, loadSave, type SaveRecord } from "./save-db";
import { loadLeaderAtlas, isImageReady } from "./leader-assets";

const DEFAULT_WS_SCHEME = location.protocol === "https:" ? "wss" : "ws";
const DEFAULT_WS =
  import.meta.env.VITE_WS_URL?.trim() || `${DEFAULT_WS_SCHEME}://${location.hostname || "localhost"}:3001/ws`;

type Screen = "start" | "sp" | "mp" | "load";

interface MenuState {
  screen: Screen;
  sp: {
    civId: string;
    mapSize: MapSize;
    aiCount: number;
    barbarians: "none" | "low" | "normal" | "high";
  };
  mp: {
    url: string;
    handle: string;
    password: string;
  };
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

function aiSelect(id: string, value: number): string {
  return `<select id="${id}" class="menu-in">${[0, 1, 2, 3, 4]
    .map((n) => `<option value="${n}"${n === value ? " selected" : ""}>${n}</option>`)
    .join("")}</select>`;
}

function barbarianSelect(id: string, value: string): string {
  const opts = [
    { value: "none", label: "None" },
    { value: "low", label: "Low" },
    { value: "normal", label: "Normal" },
    { value: "high", label: "High" },
  ];
  return `<select id="${id}" class="menu-in">${opts
    .map((o) => `<option value="${o.value}"${o.value === value ? " selected" : ""}>${o.label}</option>`)
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
      mapSize: "medium",
      aiCount: 1,
      barbarians: "normal",
    },
    mp: {
      url: DEFAULT_WS,
      handle: "",
      password: "",
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
    #lobby{position:fixed;inset:0;z-index:50;background:#0b1622}
    .lobby-layout{display:flex;height:100%;width:100%}
    .lobby-left{width:380px;max-width:92vw;flex-shrink:0;display:flex;flex-direction:column;background:linear-gradient(180deg,#132536 0%,#0d1b27 100%);border-right:1px solid var(--edge);padding:28px;overflow:auto;box-shadow:4px 0 24px rgba(0,0,0,.35)}
    .lobby-right{flex:1;position:relative;display:flex;flex-direction:column;justify-content:flex-end;padding:48px 56px;background:radial-gradient(circle at 70% 30%,#1a3a52 0%,#0b1622 60%);overflow:hidden}
    .lobby-right::before{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(11,22,34,0) 0%,rgba(11,22,34,.75) 100%);pointer-events:none}
    .lobby-title{font-size:26px;font-weight:800;color:#fff;letter-spacing:.5px;margin-bottom:4px}
    .lobby-subtitle{color:#9fc0dc;font-size:13px;margin-bottom:24px}
    .lobby-version{margin-top:auto;color:#6b8aa8;font-size:12px;text-align:center;padding-top:18px}
    .menu-actions{display:flex;flex-direction:column;gap:10px;margin-top:8px}
    .menu-btn{width:100%;padding:12px 14px;font:inherit;font-size:15px;color:#eaf3fb;background:#213a52;border:1px solid var(--edge);border-radius:10px;cursor:pointer;text-align:left;display:flex;align-items:center;gap:10px;transition:background .12s,border-color .12s}
    .menu-btn:hover{background:#2b4d6c;border-color:rgba(255,255,255,.22)}
    .menu-btn.primary{background:#2f6f3f;border-color:#3a8a4e}
    .menu-btn.primary:hover{background:#3a8a4e}
    .menu-btn.secondary{background:transparent;border-color:rgba(255,255,255,.12);color:#9fc0dc}
    .menu-btn.secondary:hover{background:rgba(255,255,255,.06);color:#eaf3fb}
    .menu-btn .icon{width:22px;text-align:center;opacity:.9}
    .menu-section{margin-top:18px}
    .menu-section-title{font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#6b8aa8;margin-bottom:8px}
    .menu-row{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-top:8px}
    .menu-row>span{white-space:nowrap;color:#cfe3f7}
    .menu-row>.menu-in{flex:1;max-width:200px}
    .menu-in{font:inherit;font-size:13px;color:#eaf3fb;background:#14283b;border:1px solid var(--edge);border-radius:8px;padding:8px 10px;width:100%}
    .menu-in:focus{outline:none;border-color:#5a8ab8}
    .menu-hint{color:#9fc0dc;font-size:12px;margin-top:6px;line-height:1.4}
    .menu-status{color:#ffb38a;margin-top:10px;min-height:20px;font-size:13px}
    .menu-back-row{display:flex;gap:10px;margin-top:18px}
    .menu-back-row .menu-btn{width:auto;flex:1}
    .save-list{display:flex;flex-direction:column;gap:8px;margin-top:10px}
    .save-row{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:10px;border:1px solid var(--edge);border-radius:10px;background:#14283b}
    .save-row .info{min-width:0}
    .save-row .name{font-weight:600;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .save-row .meta{color:#9fc0dc;font-size:11.5px;margin-top:2px}
    .save-row .actions{display:flex;gap:6px;flex-shrink:0}
    .hidden{display:none !important}
    .showcase{position:relative;z-index:1;max-width:720px}
    .showcase-label{font-size:12px;text-transform:uppercase;letter-spacing:2px;color:#9fc0dc;margin-bottom:10px;opacity:.85}
    .showcase-civ{font-size:52px;font-weight:900;color:#fff;line-height:1.05;text-shadow:0 4px 24px rgba(0,0,0,.45)}
    .showcase-leader{font-size:22px;color:#ffd967;margin-top:8px;font-weight:600}
    .showcase-quote{font-size:20px;color:#e8f4ff;line-height:1.5;margin-top:22px;font-style:italic;max-width:640px;text-shadow:0 2px 12px rgba(0,0,0,.4)}
    .showcase-quote::before{content:"“";margin-right:4px;opacity:.7}
    .showcase-quote::after{content:"”";margin-left:4px;opacity:.7}
    .showcase-ability{margin-top:26px;background:rgba(11,22,34,.55);border:1px solid rgba(255,255,255,.1);border-radius:12px;padding:16px 18px;backdrop-filter:blur(4px)}
    .showcase-ability-name{font-size:15px;font-weight:700;color:#fff;margin-bottom:4px}
    .showcase-ability-desc{font-size:13px;color:#b8d4ec;line-height:1.4}
    .showcase-uniques{margin-top:10px;font-size:12px;color:#9fc0dc}
    .showcase-art-wrapper{position:absolute;top:48px;right:56px;width:260px;height:320px;border-radius:16px;overflow:hidden;z-index:1;box-shadow:0 8px 32px rgba(0,0,0,.35)}
    .showcase-art{width:100%;height:100%;object-fit:cover;display:block;border-radius:16px}
    .showcase-art-placeholder{position:absolute;inset:0;border:2px dashed rgba(255,255,255,.15);border-radius:16px;display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,.45);font-size:13px;text-align:center;background:rgba(255,255,255,.03)}
    .showcase-reroll{position:absolute;top:48px;right:56px;z-index:2;margin-top:338px;width:260px}
    @media(max-width:860px){
      #lobby{overflow-y:auto}
      .lobby-layout{flex-direction:column;height:auto;min-height:100%}
      .lobby-left{width:100%;border-right:none;padding:max(20px, env(safe-area-inset-top)) max(20px, env(safe-area-inset-right)) max(20px, env(safe-area-inset-bottom)) max(20px, env(safe-area-inset-left));overflow:visible}
      .lobby-right{position:relative;flex:none;width:100%;padding:24px max(20px, env(safe-area-inset-right)) 24px max(20px, env(safe-area-inset-left));justify-content:flex-start;overflow:visible;order:-1;background:radial-gradient(circle at 50% 0%,#1a3a52 0%,#0b1622 70%)}
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

  function renderShowcase(civId?: string): void {
    const civ = (civId ? CIVILIZATIONS.find((c) => c.id === civId) : undefined) ?? pickRandomCiv();
    const src = leaderAtlas.images[civ.id]?.src ?? `${import.meta.env.BASE_URL}leaders/${civ.id}.png`;
    right.innerHTML = `
      <div class="showcase-art-wrapper">
        <img id="showcase-art" class="showcase-art hidden" src="${src}" alt="" />
        <div id="showcase-art-placeholder" class="showcase-art-placeholder">Leader art<br/>coming soon</div>
      </div>
      <button class="menu-btn secondary showcase-reroll" id="showcase-reroll">Show another civilization</button>
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
    const civ = CIVILIZATIONS.find((c) => c.id === state.sp.civId) ?? CIVILIZATIONS[0]!;
    left.innerHTML = `
      <button class="menu-btn secondary" id="back" style="width:auto;padding:8px 12px;font-size:13px"><span class="icon">←</span> Back</button>
      <div class="menu-section">
        <div class="menu-section-title">Choose Your Civilization</div>
        <select id="sp-civ" class="menu-in">${CIVILIZATIONS.map(
          (c) => `<option value="${c.id}"${c.id === state.sp.civId ? " selected" : ""}>${c.name} — ${c.leader}</option>`,
        ).join("")}</select>
        <div id="sp-civ-desc" class="menu-hint"><b>${civ.abilityName}:</b> ${civ.abilityDesc}<br/>UU: ${civ.uniqueUnit} · ${civ.uniqueInfra}</div>
      </div>
      <div class="menu-section">
        <div class="menu-section-title">Game Options</div>
        <div class="menu-row"><span>Map size</span>${mapSelect("sp-map", state.sp.mapSize)}</div>
        <div class="menu-row"><span>AI opponents</span>${aiSelect("sp-ai", state.sp.aiCount)}</div>
        <div class="menu-row"><span>Barbarians</span>${barbarianSelect("sp-barb", state.sp.barbarians)}</div>
      </div>
      <div class="menu-back-row">
        <button class="menu-btn secondary" id="back2">Back</button>
        <button class="menu-btn primary" id="sp-start">Start Game</button>
      </div>`;

    const updateCivDesc = () => {
      const c = CIVILIZATIONS.find((x) => x.id === $select("#sp-civ").value);
      $("#sp-civ-desc").innerHTML = c
        ? `<b>${c.abilityName}:</b> ${c.abilityDesc}<br/>UU: ${c.uniqueUnit} · ${c.uniqueInfra}`
        : "";
    };
    $("#sp-civ").addEventListener("change", () => {
      state.sp.civId = $select("#sp-civ").value;
      updateCivDesc();
      renderShowcase(state.sp.civId);
    });

    renderShowcase(state.sp.civId);
    $("#back").addEventListener("click", () => showScreen("start"));
    $("#back2").addEventListener("click", () => showScreen("start"));
    $("#sp-start").addEventListener("click", () => {
      close();
      onStart(
        new LocalSession({
          civId: state.sp.civId,
          mapSize: $select("#sp-map").value as MapSize,
          aiCount: Number($select("#sp-ai").value),
          barbarians: $select("#sp-barb").value as "none" | "low" | "normal" | "high",
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
        <div class="menu-row"><span>AI opponents</span>${aiSelect("mp-ai", 0)}</div>
        <div class="menu-row"><span>Barbarians</span>${barbarianSelect("mp-barb", "normal")}</div>
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

    const renderGames = (games: GameSummary[]) => {
      const list = $("#game-list");
      list.innerHTML =
        games.length === 0
          ? `<div class="menu-hint">No games yet — create one.</div>`
          : games
              .map(
                (g) =>
                  `<div class="save-row"><span class="info"><span class="name">${escapeHtml(g.name)}</span><span class="meta">${g.players}/${g.capacity} players · ${g.status}</span></span>` +
                  (joinedGameId === g.id
                    ? `<button class="menu-btn primary" data-start="${g.id}" style="width:auto">Start</button>`
                    : `<button class="menu-btn" data-join="${g.id}" style="width:auto">Join</button>`) +
                  `</div>`,
              )
              .join("");
      list.querySelectorAll<HTMLButtonElement>("[data-join]").forEach((el) =>
        el.addEventListener("click", () => mpSession?.send({ t: "joinGame", gameId: el.dataset.join! })),
      );
      list.querySelectorAll<HTMLButtonElement>("[data-start]").forEach((el) =>
        el.addEventListener("click", () => mpSession?.send({ t: "startGame", gameId: el.dataset.start! })),
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
            status(`Signed in as ${m.handle}`);
            $("#games").classList.remove("hidden");
            mpSession!.send({ t: "listGames" });
          } else if (m.t === "games") renderGames(m.games);
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
      mpSession?.send({
        t: "createGame",
        name: `${handleEl.value || "Player"}'s game`,
        cols: dims.cols,
        rows: dims.rows,
        aiCount: Number($select("#mp-ai").value),
        barbarians: $select("#mp-barb").value as "none" | "low" | "normal" | "high",
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
