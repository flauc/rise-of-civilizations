// Multiplayer chat UI helpers — shared by the lobby room and the in-game panel.

import { Capacitor } from "@capacitor/core";
import type { LobbyChatMessage } from "@roc/sim";
import {
  blockUser,
  muteUser,
  onChatModerationChange,
  reportChatMessage,
  visibleChatMessages,
} from "./chat-moderation";
import { gameHud } from "./hud-root";
import type { OnlineSession } from "./session";

/** Phone / tablet / native shell — used for mobile-only lobby chat UX. */
export function isMobileMpUi(): boolean {
  if (Capacitor.isNativePlatform()) return true;
  return window.matchMedia("(max-width:900px), (pointer: coarse)").matches;
}

export function formatChatTime(at: number): string {
  return new Date(at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

export interface ChatRenderOptions {
  viewerUserId?: string;
  gameId?: string;
  /** Re-render after mute/block/report. */
  onChanged?: () => void;
}

export const CHAT_MODERATION_CSS = `
  .mp-chat-msg-top{display:flex;align-items:flex-start;justify-content:space-between;gap:8px}
  .mp-chat-menu-wrap{position:relative;flex:0 0 auto}
  .mp-chat-menu-btn{width:26px;height:26px;border-radius:6px;border:1px solid transparent;background:transparent;color:#8a7f6a;font-size:16px;line-height:1;cursor:pointer;padding:0}
  .mp-chat-menu-btn:hover{border-color:var(--edge);color:#e8dcc5;background:rgba(201,162,39,.08)}
  .mp-chat-menu{position:absolute;right:0;top:calc(100% + 4px);z-index:5;min-width:120px;padding:4px;border:1px solid var(--edge);border-radius:8px;background:#1f1c14;box-shadow:0 8px 20px rgba(0,0,0,.45)}
  .mp-chat-menu.hidden{display:none}
  .mp-chat-menu button{display:block;width:100%;text-align:left;font:inherit;font-size:12px;color:#e8dcc5;background:transparent;border:none;border-radius:6px;padding:8px 10px;cursor:pointer}
  .mp-chat-menu button:hover{background:rgba(201,162,39,.12);color:#f0d878}
  .mp-chat-menu button.danger{color:#e8a0a0}
  .mp-chat-menu button.danger:hover{color:#ffb4b4}
`;

let moderationCssReady = false;
function ensureModerationCss(): void {
  if (moderationCssReady) return;
  moderationCssReady = true;
  const style = document.createElement("style");
  style.id = "chat-moderation-style";
  style.textContent = CHAT_MODERATION_CSS;
  document.head.appendChild(style);
}

let openMenu: HTMLElement | null = null;

function closeOpenMenu(): void {
  openMenu?.classList.add("hidden");
  openMenu = null;
}

document.addEventListener("click", (e) => {
  if (!(e.target as Element).closest(".mp-chat-menu-wrap")) closeOpenMenu();
});

function wireMessageMenu(
  wrap: HTMLElement,
  message: LobbyChatMessage,
  opts: ChatRenderOptions,
): void {
  const btn = wrap.querySelector<HTMLButtonElement>(".mp-chat-menu-btn");
  const menu = wrap.querySelector<HTMLDivElement>(".mp-chat-menu");
  if (!btn || !menu) return;

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (openMenu && openMenu !== menu) openMenu.classList.add("hidden");
    const show = menu.classList.toggle("hidden");
    openMenu = show ? null : menu;
  });

  menu.querySelector<HTMLButtonElement>('[data-mp-chat-act="mute"]')?.addEventListener("click", () => {
    muteUser(message.userId);
    closeOpenMenu();
    opts.onChanged?.();
  });
  menu.querySelector<HTMLButtonElement>('[data-mp-chat-act="block"]')?.addEventListener("click", () => {
    blockUser(message.userId);
    closeOpenMenu();
    opts.onChanged?.();
  });
  menu.querySelector<HTMLButtonElement>('[data-mp-chat-act="report"]')?.addEventListener("click", () => {
    closeOpenMenu();
    const ok = confirm(`Report ${message.handle} for this message?\n\n"${message.text}"`);
    if (!ok) return;
    void reportChatMessage({
      reportedUserId: message.userId,
      reportedHandle: message.handle,
      messageText: message.text,
      gameId: opts.gameId,
    }).then((sent) => {
      if (sent) alert("Report sent. Thank you.");
      else alert("Report queued — it will be sent when you're back online.");
      opts.onChanged?.();
    });
  });
}

export function chatLogHtml(messages: readonly LobbyChatMessage[], opts: ChatRenderOptions = {}): string {
  const visible = visibleChatMessages(messages, opts.viewerUserId);
  if (!visible.length) {
    return `<div class="mp-chat-empty">Say hello…</div>`;
  }
  return visible
    .map((m) => {
      const canModerate = !!m.userId && m.userId !== opts.viewerUserId;
      const menu = canModerate
        ? `<div class="mp-chat-menu-wrap">
             <button type="button" class="mp-chat-menu-btn" aria-label="Message options">⋮</button>
             <div class="mp-chat-menu hidden">
               <button type="button" data-mp-chat-act="mute">Mute player</button>
               <button type="button" data-mp-chat-act="block">Block player</button>
               <button type="button" class="danger" data-mp-chat-act="report">Report</button>
             </div>
           </div>`
        : "";
      return (
        `<div class="mp-chat-msg" data-chat-user="${escapeHtml(m.userId)}">` +
        `<div class="mp-chat-msg-top">` +
        `<div class="mp-chat-meta"><b>${escapeHtml(m.handle)}</b> · ${formatChatTime(m.at)}</div>` +
        menu +
        `</div>` +
        `<div class="mp-chat-text">${escapeHtml(m.text)}</div>` +
        `</div>`
      );
    })
    .join("");
}

/** Paint chat into a log element without innerHTML (reliable on Android WebView). */
export function renderChatLogEl(
  log: HTMLElement,
  messages: readonly LobbyChatMessage[],
  opts: ChatRenderOptions = {},
): void {
  ensureModerationCss();
  closeOpenMenu();
  log.replaceChildren();
  const visible = visibleChatMessages(messages, opts.viewerUserId);
  if (!visible.length) {
    const empty = document.createElement("div");
    empty.className = "mp-chat-empty";
    empty.textContent = "Say hello…";
    log.appendChild(empty);
    return;
  }
  for (const m of visible) {
    const row = document.createElement("div");
    row.className = "mp-chat-msg";
    if (m.userId) row.dataset.chatUser = m.userId;

    const top = document.createElement("div");
    top.className = "mp-chat-msg-top";

    const meta = document.createElement("div");
    meta.className = "mp-chat-meta";
    const who = document.createElement("b");
    who.textContent = m.handle;
    meta.appendChild(who);
    meta.appendChild(document.createTextNode(` · ${formatChatTime(m.at)}`));
    top.appendChild(meta);

    const canModerate = !!m.userId && m.userId !== opts.viewerUserId;
    if (canModerate) {
      const menuWrap = document.createElement("div");
      menuWrap.className = "mp-chat-menu-wrap";
      menuWrap.innerHTML =
        `<button type="button" class="mp-chat-menu-btn" aria-label="Message options">⋮</button>` +
        `<div class="mp-chat-menu hidden">` +
        `<button type="button" data-mp-chat-act="mute">Mute player</button>` +
        `<button type="button" data-mp-chat-act="block">Block player</button>` +
        `<button type="button" class="danger" data-mp-chat-act="report">Report</button>` +
        `</div>`;
      top.appendChild(menuWrap);
      wireMessageMenu(menuWrap, m, opts);
    }

    const text = document.createElement("div");
    text.className = "mp-chat-text";
    text.textContent = m.text;

    row.append(top, text);
    log.appendChild(row);
  }
}

/** Collapsible in-game chat for online multiplayer. */
export function mountGameChat(session: OnlineSession, viewerUserId?: string): () => void {
  const style = document.createElement("style");
  style.id = "game-chat-style";
  style.textContent =
    CHAT_MODERATION_CSS +
    `
    #game-chat{position:fixed;left:max(12px,env(safe-area-inset-left));bottom:max(88px,env(safe-area-inset-bottom));z-index:28;display:flex;flex-direction:column;align-items:flex-start;gap:8px;pointer-events:none}
    #game-chat.open{pointer-events:auto}
    #game-chat-toggle{pointer-events:auto;width:44px;height:44px;border-radius:50%;border:1px solid var(--edge);background:rgba(21,18,12,.92);color:#e8dcc5;font-size:20px;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center}
    #game-chat-toggle:hover{border-color:#c9a227;color:#f0d878}
    #game-chat-panel{display:none;width:min(320px,calc(100vw - 24px));max-height:min(360px,42vh);flex-direction:column;border:1px solid var(--edge);border-radius:12px;background:rgba(21,18,12,.94);box-shadow:0 8px 28px rgba(0,0,0,.5);overflow:hidden;pointer-events:auto}
    #game-chat.open #game-chat-panel{display:flex}
    #game-chat.open #game-chat-toggle{display:none}
    #game-chat-head{display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-bottom:1px solid var(--edge)}
    #game-chat-head span{font-family:'Cinzel',Georgia,serif;font-size:12px;font-weight:700;color:#c9a227;text-transform:uppercase;letter-spacing:.08em}
    #game-chat-close{width:28px;height:28px;border-radius:50%;border:1px solid var(--edge);background:transparent;color:#b8aa8d;font-size:14px;cursor:pointer;line-height:1}
    #game-chat-close:hover{color:#e8dcc5;border-color:#c9a227}
    #game-chat-log{flex:1;overflow-y:auto;padding:10px 12px;min-height:140px;max-height:240px;font-size:13px;color:#e8dcc5}
    .mp-chat-empty{color:#8a7f6a;font-size:13px;text-align:center;padding:24px 8px}
    .mp-chat-msg{margin-bottom:10px}
    .mp-chat-msg:last-child{margin-bottom:0}
    .mp-chat-meta{font-size:11px;color:#8a7f6a;line-height:1.3}
    .mp-chat-meta b{color:#e8dcc5;font-weight:700}
    .mp-chat-text{font-size:13px;color:#b8aa8d;margin-top:3px;line-height:1.45;word-break:break-word}
    #game-chat-form{display:flex;gap:8px;padding:10px 12px;border-top:1px solid var(--edge)}
    #game-chat-form .menu-in{flex:1;min-width:0;font-size:13px;padding:8px 10px}
    #game-chat-form .menu-btn{width:auto;padding:8px 12px;font-size:12px;flex:0 0 auto}
    @media(max-width:640px){
      #game-chat{bottom:max(72px,env(safe-area-inset-bottom))}
      #game-chat-panel{width:min(300px,calc(100vw - 20px))}
    }`;
  document.head.appendChild(style);

  const root = document.createElement("div");
  root.id = "game-chat";
  root.innerHTML =
    `<button type="button" id="game-chat-toggle" title="Open chat" aria-label="Open chat">💬</button>` +
    `<div id="game-chat-panel">` +
    `<div id="game-chat-head"><span>Game chat</span><button type="button" id="game-chat-close" title="Close chat" aria-label="Close chat">✕</button></div>` +
    `<div id="game-chat-log"></div>` +
    `<div id="game-chat-form">` +
    `<input id="game-chat-input" class="menu-in" type="text" maxlength="500" placeholder="Message…" autocomplete="off" />` +
    `<button type="button" class="menu-btn primary" id="game-chat-send">Send</button>` +
    `</div></div>`;
  gameHud().appendChild(root);

  const log = root.querySelector<HTMLDivElement>("#game-chat-log")!;
  const input = root.querySelector<HTMLInputElement>("#game-chat-input")!;
  const toggle = root.querySelector<HTMLButtonElement>("#game-chat-toggle")!;
  const closeBtn = root.querySelector<HTMLButtonElement>("#game-chat-close")!;
  const sendBtn = root.querySelector<HTMLButtonElement>("#game-chat-send")!;

  const renderOpts = (): ChatRenderOptions => ({
    viewerUserId,
    gameId: session.gameId,
    onChanged: () => render(session.displayChatMessages()),
  });

  const render = (messages: readonly LobbyChatMessage[]): void => {
    renderChatLogEl(log, messages, renderOpts());
    log.scrollTop = log.scrollHeight;
  };

  const open = (): void => {
    root.classList.add("open");
    window.setTimeout(() => input.focus(), 0);
  };
  const close = (): void => root.classList.remove("open");

  toggle.addEventListener("click", open);
  closeBtn.addEventListener("click", close);

  const submit = (): void => {
    const text = input.value.trim();
    if (!text) return;
    session.sendChat(text);
    input.value = "";
  };
  sendBtn.addEventListener("click", submit);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      submit();
    }
  });

  const unsubChat = session.onChat(render);
  const unsubMod = onChatModerationChange(() => render(session.displayChatMessages()));

  return () => {
    unsubChat();
    unsubMod();
    root.remove();
    style.remove();
  };
}
