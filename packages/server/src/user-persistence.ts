// Dev-friendly JSON persistence for registered users when Postgres user storage
// is not wired yet. Survives server restarts during local development.

import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { MemoryStorage, User } from "./storage";

const DEFAULT_PATH = join(dirname(fileURLToPath(import.meta.url)), "../../../.roc-users.json");

function isUser(raw: unknown): raw is User {
  if (!raw || typeof raw !== "object") return false;
  const u = raw as Partial<User>;
  return (
    typeof u.id === "string" &&
    typeof u.handle === "string" &&
    typeof u.passwordHash === "string" &&
    typeof u.createdAt === "number"
  );
}

export async function loadPersistedUsers(
  storage: MemoryStorage,
  path = process.env.ROC_USERS_FILE ?? DEFAULT_PATH,
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
    console.warn(`user persistence: could not parse ${path}`);
    return 0;
  }
  if (!Array.isArray(parsed)) return 0;
  let count = 0;
  for (const raw of parsed) {
    if (!isUser(raw)) continue;
    storage.restoreUser(raw);
    count++;
  }
  if (count) console.log(`user persistence: loaded ${count} account(s) from ${path}`);
  return count;
}

export async function persistUsers(
  storage: MemoryStorage,
  path = process.env.ROC_USERS_FILE ?? DEFAULT_PATH,
): Promise<void> {
  const users = await storage.listUsers();
  await writeFile(path, JSON.stringify(users, null, 2), "utf8");
}
