// Client-side account session: persisted token for registered players.
// Guests play without an account; their games are never saved locally.

import type { ClientMessage, ServerMessage } from "@roc/sim";

const ACCOUNT_KEY = "roc:account";

const DEFAULT_WS_SCHEME = location.protocol === "https:" ? "wss" : "ws";
export const DEFAULT_WS_URL =
  import.meta.env.VITE_WS_URL?.trim() || `${DEFAULT_WS_SCHEME}://${location.hostname || "localhost"}:3001/ws`;

export interface StoredAccount {
  token: string;
  userId: string;
  handle: string;
}

export function getAccount(): StoredAccount | null {
  try {
    const raw = localStorage.getItem(ACCOUNT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredAccount>;
    if (
      typeof parsed.token !== "string" ||
      typeof parsed.userId !== "string" ||
      typeof parsed.handle !== "string"
    ) {
      return null;
    }
    return { token: parsed.token, userId: parsed.userId, handle: parsed.handle };
  } catch {
    return null;
  }
}

export function setAccount(account: StoredAccount): void {
  localStorage.setItem(ACCOUNT_KEY, JSON.stringify(account));
}

export function clearAccount(): void {
  localStorage.removeItem(ACCOUNT_KEY);
}

export function isLoggedIn(): boolean {
  return getAccount() !== null;
}

export type AuthRequest =
  | { kind: "register"; handle: string; password: string; email?: string; newsletter?: boolean; wsUrl?: string }
  | { kind: "login"; handle: string; password: string; wsUrl?: string }
  | { kind: "resume"; token: string; wsUrl?: string };

/** Connect briefly to the server, authenticate, persist the session, and disconnect. */
export async function authenticate(req: AuthRequest): Promise<StoredAccount | { error: string }> {
  const wsUrl = req.wsUrl?.trim() || DEFAULT_WS_URL;
  return new Promise((resolve) => {
    const ws = new WebSocket(wsUrl);
    let settled = false;
    let opened = false;
    const finish = (result: StoredAccount | { error: string }): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      resolve(result);
    };
    const timer = setTimeout(
      () =>
        finish({
          error: `Could not reach ${wsUrl}. Start the server (bun run server) and, on the emulator, run: adb reverse tcp:3001 tcp:3001`,
        }),
      12_000,
    );

    const sendAuth = (): void => {
      let msg: ClientMessage;
      if (req.kind === "register") {
        msg = {
          t: "register",
          handle: req.handle,
          password: req.password,
          email: req.email,
          newsletter: req.newsletter,
        };
      } else if (req.kind === "login") {
        msg = { t: "login", handle: req.handle, password: req.password };
      } else {
        msg = { t: "resume", token: req.token };
      }
      ws.send(JSON.stringify(msg));
    };

    ws.onopen = () => {
      opened = true;
      sendAuth();
    };
    ws.onmessage = (e) => {
      const msg = JSON.parse(String(e.data)) as ServerMessage;
      if (msg.t === "authOk") {
        const account: StoredAccount = { token: msg.token, userId: msg.userId, handle: msg.handle };
        setAccount(account);
        finish(account);
      } else if (msg.t === "error") {
        finish({ error: msg.message });
      }
    };
    ws.onerror = () => finish({ error: `WebSocket error connecting to ${wsUrl}` });
    ws.onclose = () => {
      if (!settled && !opened) finish({ error: `Connection to ${wsUrl} closed before login.` });
    };
  });
}

/** Try to restore a saved session on startup; clears stale tokens. */
export async function tryResumeSession(wsUrl?: string): Promise<StoredAccount | null> {
  const existing = getAccount();
  if (!existing) return null;
  const res = await authenticate({ kind: "resume", token: existing.token, wsUrl });
  if ("error" in res) {
    clearAccount();
    return null;
  }
  return res;
}
