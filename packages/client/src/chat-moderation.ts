// Client-side chat moderation: mute, block, and report players (persisted locally).

import type { LobbyChatMessage } from "@roc/sim";
import { trackBugReport } from "./analytics";

const MUTED_KEY = "roc-chat-muted";
const BLOCKED_KEY = "roc-chat-blocked";

type Listener = () => void;
const listeners = new Set<Listener>();

function readIds(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is string => typeof id === "string" && id.length > 0));
  } catch {
    return new Set();
  }
}

function writeIds(key: string, ids: Set<string>): void {
  try {
    localStorage.setItem(key, JSON.stringify([...ids]));
  } catch {
    /* ignore quota / private mode */
  }
}

function notify(): void {
  for (const fn of listeners) fn();
}

export function onChatModerationChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function isMuted(userId: string): boolean {
  return userId ? readIds(MUTED_KEY).has(userId) : false;
}

export function isBlocked(userId: string): boolean {
  return userId ? readIds(BLOCKED_KEY).has(userId) : false;
}

export function muteUser(userId: string): void {
  if (!userId) return;
  const ids = readIds(MUTED_KEY);
  ids.add(userId);
  writeIds(MUTED_KEY, ids);
  notify();
}

export function unmuteUser(userId: string): void {
  if (!userId) return;
  const ids = readIds(MUTED_KEY);
  ids.delete(userId);
  writeIds(MUTED_KEY, ids);
  notify();
}

export function blockUser(userId: string): void {
  if (!userId) return;
  const ids = readIds(BLOCKED_KEY);
  ids.add(userId);
  writeIds(BLOCKED_KEY, ids);
  // Block implies mute for chat.
  muteUser(userId);
}

export function unblockUser(userId: string): void {
  if (!userId) return;
  const ids = readIds(BLOCKED_KEY);
  ids.delete(userId);
  writeIds(BLOCKED_KEY, ids);
  notify();
}

/** Hide messages from muted or blocked players (always show your own). */
export function visibleChatMessages(
  messages: readonly LobbyChatMessage[],
  viewerUserId?: string,
): LobbyChatMessage[] {
  return messages.filter((m) => {
    if (!m.userId) return true;
    if (viewerUserId && m.userId === viewerUserId) return true;
    return !isMuted(m.userId) && !isBlocked(m.userId);
  });
}

export async function reportChatMessage(opts: {
  reportedUserId: string;
  reportedHandle: string;
  messageText: string;
  gameId?: string;
}): Promise<boolean> {
  const parts = [
    "[Chat report]",
    `Reported player: ${opts.reportedHandle} (${opts.reportedUserId})`,
    `Message: ${opts.messageText}`,
  ];
  if (opts.gameId) parts.push(`Game: ${opts.gameId}`);
  return trackBugReport({
    message: parts.join("\n"),
    mode: "mp",
  });
}
