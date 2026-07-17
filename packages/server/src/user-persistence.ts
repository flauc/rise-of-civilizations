// Dev-friendly JSON persistence for registered users when Postgres user storage
// is not wired yet. Survives server restarts during local development.

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { MemoryStorage, User } from "./storage";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..");

/** Resolved on-disk path for the user registry (logged at startup). */
export function usersFilePath(): string {
  if (process.env.ROC_USERS_FILE) return process.env.ROC_USERS_FILE;
  const dataDir = process.env.ROC_DATA_DIR ?? REPO_ROOT;
  return join(dataDir, ".roc-users.json");
}

let loadedUserCount = 0;

export function persistedUserCount(): number {
  return loadedUserCount;
}

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
  path = usersFilePath(),
): Promise<number> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch {
    loadedUserCount = 0;
    return 0;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    console.warn(`user persistence: could not parse ${path}`);
    loadedUserCount = 0;
    return 0;
  }
  if (!Array.isArray(parsed)) {
    loadedUserCount = 0;
    return 0;
  }
  let count = 0;
  for (const raw of parsed) {
    if (!isUser(raw)) continue;
    storage.restoreUser(raw);
    count++;
  }
  loadedUserCount = count;
  if (count) console.log(`user persistence: loaded ${count} account(s) from ${path}`);
  return count;
}

export async function persistUsers(
  storage: MemoryStorage,
  path = usersFilePath(),
  opts?: { force?: boolean },
): Promise<void> {
  const users = await storage.listUsers();
  if (!opts?.force && users.length === 0 && loadedUserCount > 0) {
    console.error(
      `user persistence: refusing to overwrite ${path} with an empty user list (had ${loadedUserCount} on load)`,
    );
    return;
  }
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  await writeFile(tmp, JSON.stringify(users, null, 2), "utf8");
  await rename(tmp, path);
  loadedUserCount = users.length;
}
