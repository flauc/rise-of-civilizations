// Pre-game menu: a proper start screen with navigable sub-screens for
// single-player setup, multiplayer lobby, and loading saved games.

import { LocalSession, OnlineSession, MAP_DIMENSIONS, type MapSize, type Session } from "./session";
import { CIVILIZATIONS, type GameSummary, type SerializedState } from "@roc/sim";
import { deleteSave, listSaves, loadSave, type SaveRecord } from "./save-db";

const DEFAULT_WS = `ws://${location.hostname || "localhost"}:3001/ws`;

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

  const root = document.createElement("div");
  root.id = "lobby";
  root.innerHTML = `<div id="menu-card" class="menu-card"></div>`;

  const style = document.createElement("style");
  style.textContent = `
    #lobby{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:radial-gradient(circle at 50% 30%,#14283b 0%,#0b1622 70%);z-index:50}
    .menu-card{width:420px;max-width:92vw;max-height:92vh;overflow:auto;background:var(--panel);border:1px solid var(--edge);border-radius:16px;padding:28px;box-shadow:0 20px 60px rgba(0,0,0,.45);backdrop-filter:blur(3px)}
    .menu-title{font-size:28px;font-weight:800;text-align:center;color:#fff;letter-spacing:.5px;margin-bottom:4px}
    .menu-subtitle{text-align:center;color:#9fc0dc;font-size:14px;margin-bottom:24px}
    .menu-version{text-align:center;color:#6b8aa8;font-size:12px;margin-top:18px}
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
    .hidden{display:none !important}`;
  document.head.appendChild(style);
  document.body.appendChild(root);

  const card = root.querySelector<HTMLDivElement>("#menu-card")!;
  const $ = <T extends HTMLElement>(sel: string) => card.querySelector<T>(sel)!;
  const $input = (sel: string) => $<HTMLInputElement>(sel);
  const $select = (sel: string) => $<HTMLSelectElement>(sel);
  const $btn = (sel: string) => $<HTMLButtonElement>(sel);
  const close = () => {
    root.remove();
    style.remove();
  };

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
        renderLoadGame();
        break;
    }
  }

  function renderStartScreen(): void {
    card.innerHTML = `
      <div class="menu-title">Rise of Civilizations</div>
      <div class="menu-subtitle">Ancient Era → Age of Exploration</div>
      <div class="menu-actions">
        <button class="menu-btn primary" data-screen="sp"><span class="icon">🎮</span> Single Player</button>
        <button class="menu-btn" data-screen="mp"><span class="icon">🌐</span> Multiplayer</button>
        <button class="menu-btn" data-screen="load"><span class="icon">💾</span> Load Game</button>
      </div>
      <div class="menu-version">Turn-based 4X strategy</div>`;
    card.querySelectorAll<HTMLButtonElement>("[data-screen]").forEach((el) =>
      el.addEventListener("click", () => showScreen(el.dataset.screen as Screen)),
    );
  }

  function renderSinglePlayer(): void {
    const civ = CIVILIZATIONS.find((c) => c.id === state.sp.civId) ?? CIVILIZATIONS[0]!;
    card.innerHTML = `
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
    });
    $("#back").addEventListener("click", () => showScreen("start"));
    $("#back2").addEventListener("click", () => showScreen("start"));
    $("#sp-start").addEventListener("click", () => {
      close();
      onStart(
        new LocalSession({
          civId: state.sp.civId,
          mapSize: state.sp.mapSize,
          aiCount: state.sp.aiCount,
          barbarians: state.sp.barbarians,
          seed: "rise-" + Math.random().toString(36).slice(2, 8),
        }),
      );
    });
  }

  let mpSession: OnlineSession | null = null;
  let joinedGameId: string | null = null;

  function renderMultiplayer(): void {
    card.innerHTML = `
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
    card.innerHTML = `
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

  showScreen("start");
}
