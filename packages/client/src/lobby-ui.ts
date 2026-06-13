// Pre-game lobby: choose single-player (LocalSession) or connect to the server
// (OnlineSession) to register/login, list/create/join, and start a match.

import { LocalSession, OnlineSession, type Session } from "./session";
import type { GameSummary } from "@roc/sim";

const DEFAULT_WS = `ws://${location.hostname || "localhost"}:3001/ws`;

export function createLobby(onStart: (session: Session) => void): void {
  const root = document.createElement("div");
  root.id = "lobby";
  root.innerHTML = `
    <div class="panel" id="lobby-card" style="position:static;width:340px;max-width:92vw">
      <div style="font-size:20px;font-weight:700;margin-bottom:4px">Rise of Civilizations</div>
      <div style="color:#9fc0dc;margin-bottom:12px">Ancient Era → Age of Exploration</div>
      <div class="row">
        <button class="btn primary" id="sp">Single Player</button>
        <button class="btn" id="mp">Multiplayer</button>
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
          <div class="row" style="justify-content:space-between">
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
    .lobby-in{font:inherit;font-size:13px;color:#eaf3fb;background:#14283b;border:1px solid var(--edge);border-radius:8px;padding:7px 10px;width:100%}
    #game-list .gi{display:flex;justify-content:space-between;align-items:center;padding:7px;border:1px solid var(--edge);border-radius:8px;margin-top:6px}`;
  document.head.appendChild(style);
  document.body.appendChild(root);

  const $ = <T extends HTMLElement>(id: string) => root.querySelector<T>(`#${id}`)!;
  const status = (t: string) => ($("status").textContent = t);
  const close = () => {
    root.remove();
    style.remove();
  };

  $("sp").addEventListener("click", () => {
    close();
    onStart(new LocalSession({ seed: "rise-m3b" }));
  });
  $("mp").addEventListener("click", () => $("mp-panel").classList.toggle("hidden"));

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
    const name = `${$<HTMLInputElement>("handle").value || "Player"}'s game`;
    session?.send({ t: "createGame", name });
  });
}
