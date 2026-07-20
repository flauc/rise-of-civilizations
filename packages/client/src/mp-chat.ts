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
    #game-chat{position:fixed;left:max(6px,env(safe-area-inset-left));top:calc(max(6px,env(safe-area-inset-top)) + var(--leader-stack-h, 120px) + 6px);z-index:56;pointer-events:none}
    #game-chat.open{inset:0;left:0;top:0;right:0;bottom:0;width:100%;height:100%;pointer-events:auto}
    #game-chat-toggle{pointer-events:auto;position:relative;width:44px;height:44px;border-radius:10px;border:1px solid var(--edge);background:rgba(21,18,12,.92);color:#e8dcc5;font-size:20px;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;touch-action:manipulation}
    #game-chat-toggle:hover{border-color:#c9a227;color:#f0d878}
    #game-chat-badge{position:absolute;top:0;right:0;min-width:18px;height:18px;padding:0 5px;border-radius:999px;background:#b83a3a;border:1px solid rgba(255,255,255,.25);color:#fff;font-size:11px;font-weight:700;line-height:18px;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,.45);pointer-events:none;transform:translate(25%,-25%)}
    #game-chat-badge.hidden{display:none}
    #game-chat-backdrop{display:none}
    #game-chat-panel{display:none}
    #game-chat.open #game-chat-panel{
      display:flex;
      flex-direction:column;
      position:fixed;
      inset:0;
      width:100%;
      height:100%;
      max-height:none;
      border:none;
      border-radius:0;
      background:linear-gradient(180deg,#1f1c14,#15120c);
      box-shadow:none;
      overflow:hidden;
      pointer-events:auto;
      z-index:1;
    }
    #game-chat.open #game-chat-toggle{display:none}
    #game-chat-head{flex:0 0 auto;position:relative;display:flex;align-items:center;justify-content:center;padding:14px 16px;padding-top:max(14px,env(safe-area-inset-top));padding-right:calc(var(--dialog-x-gutter, 52px) + 8px);border-bottom:1px solid var(--edge);min-height:var(--dialog-x-size, 44px)}
    #game-chat-head span{font-family:'Cinzel',Georgia,serif;font-size:var(--dialog-title-size, 16px);font-weight:700;color:#c9a227;letter-spacing:.04em}
    #game-chat-close{position:absolute;top:max(10px,env(safe-area-inset-top));right:max(10px,env(safe-area-inset-right));width:var(--dialog-x-size, 44px);height:var(--dialog-x-size, 44px);border-radius:50%;border:1px solid var(--edge);background:var(--bg-card,#1f1c14);color:#b8aa8d;font-size:16px;cursor:pointer;line-height:1;touch-action:manipulation;z-index:2}
    #game-chat-close:hover{color:#e8dcc5;border-color:#c9a227;background:rgba(201,162,39,.14)}
    #game-chat-log{flex:1 1 auto;min-height:0;overflow-y:auto;padding:12px 16px;font-size:14px;color:#e8dcc5;-webkit-overflow-scrolling:touch;overscroll-behavior:contain}
    .mp-chat-empty{color:#8a7f6a;font-size:14px;text-align:center;padding:32px 12px}
    .mp-chat-msg{margin-bottom:12px}
    .mp-chat-msg:last-child{margin-bottom:0}
    .mp-chat-meta{font-size:11px;color:#8a7f6a;line-height:1.3}
    .mp-chat-meta b{color:#e8dcc5;font-weight:700}
    .mp-chat-text{font-size:14px;color:#cdbfa6;margin-top:4px;line-height:1.5;word-break:break-word}
    #game-chat-form{flex:0 0 auto;display:flex;gap:10px;padding:12px 16px;padding-bottom:max(12px,env(safe-area-inset-bottom));border-top:1px solid var(--edge);background:rgba(0,0,0,.2);pointer-events:auto}
    #game-chat-form .menu-in{flex:1;min-width:0;font-size:16px;padding:10px 12px;pointer-events:auto}
    #game-chat-form .menu-btn{width:auto;padding:10px 16px;font-size:13px;flex:0 0 auto;touch-action:manipulation;pointer-events:auto}`;
  document.head.appendChild(style);

  const root = document.createElement("div");
  root.id = "game-chat";
  root.innerHTML =
    `<button type="button" id="game-chat-toggle" title="Open chat" aria-label="Open chat">` +
    `💬<span id="game-chat-badge" class="hidden" aria-hidden="true"></span></button>` +
    `<div id="game-chat-panel" role="dialog" aria-modal="true" aria-label="Game chat">` +
    `<div id="game-chat-head"><span>Game chat</span><button type="button" id="game-chat-close" class="dialog-x" title="Close chat" aria-label="Close chat">✕</button></div>` +
    `<div id="game-chat-log"></div>` +
    `<div id="game-chat-form">` +
    `<input id="game-chat-input" class="menu-in" type="text" maxlength="500" placeholder="Message…" autocomplete="off" enterkeyhint="send" />` +
    `<button type="button" class="menu-btn primary" id="game-chat-send">Send</button>` +
    `</div></div>`;
  gameHud().appendChild(root);

  const leader = document.getElementById("leader-avatar");
  const syncLeaderStack = (): void => {
    const h = leader && !leader.classList.contains("empty") ? leader.offsetHeight : 0;
    gameHud().style.setProperty("--leader-stack-h", `${h}px`);
  };
  let leaderRo: ResizeObserver | null = null;
  if (leader) {
    leaderRo = new ResizeObserver(syncLeaderStack);
    leaderRo.observe(leader);
    syncLeaderStack();
  }

  const log = root.querySelector<HTMLDivElement>("#game-chat-log")!;
  const input = root.querySelector<HTMLInputElement>("#game-chat-input")!;
  const toggle = root.querySelector<HTMLButtonElement>("#game-chat-toggle")!;
  const badge = root.querySelector<HTMLSpanElement>("#game-chat-badge")!;
  const closeBtn = root.querySelector<HTMLButtonElement>("#game-chat-close")!;
  const sendBtn = root.querySelector<HTMLButtonElement>("#game-chat-send")!;

  let chatOpen = false;
  let readOtherCount = 0;

  const countOtherMessages = (messages: readonly LobbyChatMessage[]): number =>
    visibleChatMessages(messages, viewerUserId).filter((m) => m.userId && m.userId !== viewerUserId).length;

  const updateUnreadBadge = (messages: readonly LobbyChatMessage[]): void => {
    const unread = chatOpen ? 0 : Math.max(0, countOtherMessages(messages) - readOtherCount);
    if (unread <= 0) {
      badge.classList.add("hidden");
      badge.setAttribute("aria-hidden", "true");
      badge.textContent = "";
      toggle.removeAttribute("aria-label");
      toggle.title = "Open chat";
      return;
    }
    const label = unread > 99 ? "99+" : String(unread);
    badge.textContent = label;
    badge.classList.remove("hidden");
    badge.setAttribute("aria-hidden", "false");
    const aria = `${unread} unread chat message${unread === 1 ? "" : "s"}`;
    toggle.setAttribute("aria-label", aria);
    toggle.title = aria;
  };

  const markChatRead = (messages: readonly LobbyChatMessage[]): void => {
    readOtherCount = countOtherMessages(messages);
    updateUnreadBadge(messages);
  };

  const renderOpts = (): ChatRenderOptions => ({
    viewerUserId,
    gameId: session.gameId,
    onChanged: () => render(session.displayChatMessages()),
  });

  const render = (messages: readonly LobbyChatMessage[]): void => {
    renderChatLogEl(log, messages, renderOpts());
    log.scrollTop = log.scrollHeight;
    updateUnreadBadge(messages);
  };

  const open = (): void => {
    if (chatOpen) return;
    chatOpen = true;
    root.classList.add("open");
    markChatRead(session.displayChatMessages());
    window.setTimeout(() => input.focus(), 0);
  };

  const close = (): void => {
    if (!chatOpen) return;
    chatOpen = false;
    root.classList.remove("open");
    markChatRead(session.displayChatMessages());
  };

  toggle.addEventListener("click", open);
  closeBtn.addEventListener("click", close);

  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === "Escape" && chatOpen) {
      e.preventDefault();
      close();
    }
  };
  window.addEventListener("keydown", onKeyDown);

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

  const unsubChat = session.onChat((messages) => {
    render(messages);
    if (chatOpen) markChatRead(messages);
  });
  const unsubMod = onChatModerationChange(() => {
    const messages = session.displayChatMessages();
    render(messages);
    if (chatOpen) markChatRead(messages);
  });

  markChatRead(session.displayChatMessages());

  return () => {
    window.removeEventListener("keydown", onKeyDown);
    unsubChat();
    unsubMod();
    leaderRo?.disconnect();
    root.remove();
    style.remove();
  };
}
