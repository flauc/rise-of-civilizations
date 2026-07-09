// Dev-friendly JSON persistence for game sessions when Postgres analytics storage
// is not wired yet. Survives server restarts during local development.

import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { MemoryAnalyticsStore, SessionRow } from "./analytics";

const DEFAULT_PATH = join(dirname(fileURLToPath(import.meta.url)), "../../../.roc-games.json");

function isSessionRow(raw: unknown): raw is SessionRow {
  if (!raw || typeof raw !== "object") return false;
  const r = raw as Partial<SessionRow>;
  return typeof r.sessionId === "string" && typeof r.clientId === "string";
}

export async function loadPersistedSessions(
  store: MemoryAnalyticsStore,
  path = process.env.ROC_GAMES_FILE ?? DEFAULT_PATH,
): Promise<number> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch {
    return 0;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    console.warn(`game persistence: could not parse ${path}`);
    return 0;
  }
  if (!Array.isArray(parsed)) return 0;
  const rows: SessionRow[] = [];
  for (const raw of parsed) {
    if (isSessionRow(raw)) rows.push(raw);
  }
  const count = store.restoreSessions(rows);
  if (count) console.log(`game persistence: loaded ${count} session(s) from ${path}`);
  return count;
}

export async function persistSessions(
  store: MemoryAnalyticsStore,
  path = process.env.ROC_GAMES_FILE ?? DEFAULT_PATH,
): Promise<void> {
  const sessions = store.exportSessions();
  await writeFile(path, JSON.stringify(sessions, null, 2), "utf8");
}
