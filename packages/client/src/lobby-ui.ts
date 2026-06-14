// Pre-game lobby: a single-player setup screen (map size / AI opponents /
// barbarians) and a multiplayer flow (connect → register/login → list/create/
// join/start) with the same game options on create.

import { LocalSession, OnlineSession, MAP_DIMENSIONS, type MapSize, type Session } from "./session";
import { CIVILIZATIONS, type GameSummary } from "@roc/sim";

const DEFAULT_WS = `ws://${location.hostname || "localhost"}:3001/ws`;

function mapSelect(id: string): string {
  return `<select id="${id}" class="lobby-in">
    <option value="small">Small</option>
    <option value="medium" selected>Medium</option>
    <option value="large">Large</option>
  </select>`;
}
function aiSelect(id: string, def = 1): string {
  return `<select id="${id}" class="lobby-in">${[0, 1, 2, 3, 4]
    .map((n) => `<option value="${n}"${n === def ? " selected" : ""}>${n}</option>`)
    .join("")}</select>`;
}
function barbarianSelect(id: string, def: string): string {
  const opts = [
    { value: "none", label: "None" },
    { value: "low", label: "Low" },
    { value: "normal", label: "Normal" },
    { value: "high", label: "High" },
  ];
  return `<select id="${id}" class="lobby-in">${opts
    .map((o) => `<option value="${o.value}"${o.value === def ? " selected" : ""}>${o.label}</option>`)
    .join("")}</select>`;
}

export function createLobby(onStart: (session: Session) => void): void {
  const root = document.createElement("div");
  root.id = "lobby";
  root.innerHTML = `
    <div class="panel" style="position:static;width:360px;max-width:92vw">
      <div style="font-size:20px;font-weight:700;margin-bottom:4px">Rise of Civilizations</div>
      <div style="color:#9fc0dc;margin-bottom:12px">Ancient Era → Age of Exploration</div>
      <div class="row">
        <button class="btn primary" id="sp">Single Player</button>
        <button class="btn" id="mp">Multiplayer</button>
      </div>

      <div id="sp-panel" class="hidden" style="margin-top:12px">
        <div class="frow"><span>Civilization</span><select id="sp-civ" class="lobby-in">${CIVILIZATIONS.map(
          (c) => `<option value="${c.id}">${c.name} — ${c.leader}</option>`,
        ).join("")}</select></div>
        <div id="sp-civ-desc" style="color:#9fc0dc;font-size:12px;margin-top:4px"></div>
        <div class="frow"><span>Map size</span>${mapSelect("sp-map")}</div>
        <div class="frow"><span>AI opponents</span>${aiSelect("sp-ai", 1)}</div>
        <div class="frow"><span>Barbarians</span>${barbarianSelect("sp-barb", "normal")}</div>
        <button class="btn primary" id="sp-start" style="width:100%;margin-top:8px">Start Game</button>
      </div>

      <div id="mp-panel" class="hidden" style="margin-top:12px">
        <input id="url" class="lobby-in" value="${DEFAULT_WS}" />
        <div class="row" style="margin-top:6px">
          <input id="handle" class="lobby-in" style="flex:1" placeholder="handle" />
          <input id="pw" class="lobby-in" style="flex:1" type="password" placeholder="password" />
        </div>
        <div class="row" style="margin-top:6px">
          <button class="btn" id="register">Register</button>
          <button class="btn primary" id="login">Login</button>
        </div>
        <div id="status" style="color:#ffb38a;margin-top:8px;min-height:18px"></div>
        <div id="games" class="hidden" style="margin-top:8px">
          <div class="frow"><span>Map size</span>${mapSelect("mp-map")}</div>
          <div class="frow"><span>AI opponents</span>${aiSelect("mp-ai", 0)}</div>
          <div class="frow"><span>Barbarians</span>${barbarianSelect("mp-barb", "normal")}</div>
          <div class="row" style="justify-content:space-between;margin-top:6px">
            <b>Games</b>
            <span><button class="btn" id="refresh">Refresh</button>
            <button class="btn primary" id="create">Create</button></span>
          </div>
          <div id="game-list" style="margin-top:6px"></div>
        </div>
      </div>
    </div>`;
  const style = document.createElement("style");
  style.textContent = `
    #lobby{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(5,12,20,.7);z-index:50}
    .lobby-in{font:inherit;font-size:13px;color:#eaf3fb;background:#14283b;border:1px solid var(--edge);border-radius:8px;padding:7px 10px}
    #lobby input.lobby-in{width:100%}
    .frow{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:6px}
    #game-list .gi{display:flex;justify-content:space-between;align-items:center;padding:7px;border:1px solid var(--edge);border-radius:8px;margin-top:6px}`;
  document.head.appendChild(style);
  document.body.appendChild(root);

  const $ = <T extends HTMLElement>(id: string) => root.querySelector<T>(`#${id}`)!;
  const status = (t: string) => ($("status").textContent = t);
  const close = () => {
    root.remove();
    style.remove();
  };
  const val = (id: string) => $<HTMLSelectElement>(id).value;

  // ---- single player ----
  const showCivDesc = () => {
    const civ = CIVILIZATIONS.find((c) => c.id === val("sp-civ"));
    $("sp-civ-desc").innerHTML = civ
      ? `<b>${civ.abilityName}:</b> ${civ.abilityDesc}<br/>UU: ${civ.uniqueUnit} · ${civ.uniqueInfra}`
      : "";
  };
  $("sp").addEventListener("click", () => {
    $("sp-panel").classList.remove("hidden");
    $("mp-panel").classList.add("hidden");
    showCivDesc();
  });
  $("sp-civ").addEventListener("change", showCivDesc);
  $("sp-start").addEventListener("click", () => {
    close();
    onStart(
      new LocalSession({
        civId: val("sp-civ"),
        mapSize: val("sp-map") as MapSize,
        aiCount: Number(val("sp-ai")),
        barbarians: val("sp-barb") as "none" | "low" | "normal" | "high",
        seed: "rise-" + Math.random().toString(36).slice(2, 8),
      }),
    );
  });

  // ---- multiplayer ----
  $("mp").addEventListener("click", () => {
    $("mp-panel").classList.remove("hidden");
    $("sp-panel").classList.add("hidden");
  });

  let session: OnlineSession | null = null;
  let joinedGameId: string | null = null;

  const renderGames = (games: GameSummary[]) => {
    const list = $("game-list");
    list.innerHTML =
      games.length === 0
        ? `<div style="color:#9fc0dc">No games yet — create one.</div>`
        : games
            .map(
              (g) =>
                `<div class="gi"><span>${g.name} <span style="color:#9fc0dc">(${g.players}/${g.capacity}, ${g.status})</span></span>` +
                (joinedGameId === g.id
                  ? `<button class="btn primary" data-start="${g.id}">Start</button>`
                  : `<button class="btn" data-join="${g.id}">Join</button>`) +
                `</div>`,
            )
            .join("");
    list.querySelectorAll<HTMLButtonElement>("[data-join]").forEach((el) =>
      el.addEventListener("click", () => session?.send({ t: "joinGame", gameId: el.dataset.join! })),
    );
    list.querySelectorAll<HTMLButtonElement>("[data-start]").forEach((el) =>
      el.addEventListener("click", () => session?.send({ t: "startGame", gameId: el.dataset.start! })),
    );
  };

  const connectAndAuth = async (kind: "register" | "login") => {
    const url = $<HTMLInputElement>("url").value.trim();
    const handle = $<HTMLInputElement>("handle").value.trim();
    const password = $<HTMLInputElement>("pw").value;
    if (!handle || !password) return status("enter a handle and password");
    if (!session) {
      session = new OnlineSession(url);
      session.on((m) => {
        if (m.t === "error") status(m.message);
        else if (m.t === "authOk") {
          status(`signed in as ${m.handle}`);
          $("games").classList.remove("hidden");
          session!.send({ t: "listGames" });
        } else if (m.t === "games") renderGames(m.games);
        else if (m.t === "joined") {
          joinedGameId = m.gameId;
          status(`joined game (you are player ${m.playerId + 1})`);
          session!.send({ t: "listGames" });
        } else if (m.t === "started") {
          close();
          onStart(session!);
        }
      });
      try {
        await session.connect();
      } catch {
        session = null;
        return status("could not connect to server");
      }
    }
    session.send({ t: kind, handle, password });
  };

  $("register").addEventListener("click", () => void connectAndAuth("register"));
  $("login").addEventListener("click", () => void connectAndAuth("login"));
  $("refresh").addEventListener("click", () => session?.send({ t: "listGames" }));
  $("create").addEventListener("click", () => {
    const dims = MAP_DIMENSIONS[val("mp-map") as MapSize];
    session?.send({
      t: "createGame",
      name: `${$<HTMLInputElement>("handle").value || "Player"}'s game`,
      cols: dims.cols,
      rows: dims.rows,
      aiCount: Number(val("mp-ai")),
      barbarians: val("mp-barb") as "none" | "low" | "normal" | "high",
    });
  });
}
