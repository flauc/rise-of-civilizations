// Bootstraps registered users from Postgres (production) and JSON (dev backup).

import type { MemoryStorage } from "./storage";
import { loadPersistedUsers, persistUsers, persistedUserCount, usersFilePath } from "./user-persistence";
import { PostgresUserStore } from "./users-postgres";

const USER_SAVE_INTERVAL_MS = 5 * 60 * 1000;

export interface UserPersistence {
  save(force?: boolean): Promise<void>;
  postgres: PostgresUserStore | null;
}

export async function initUserPersistence(storage: MemoryStorage): Promise<UserPersistence> {
  const postgres = process.env.DATABASE_URL ? new PostgresUserStore() : null;
  const jsonPath = usersFilePath();
  let loaded = 0;

  if (postgres) {
    await postgres.init();
    const pgUsers = await postgres.loadAll();
    if (pgUsers.length > 0) {
      storage.clearUsers();
      for (const user of pgUsers) storage.restoreUser(user);
      loaded = pgUsers.length;
      console.log(`user persistence: loaded ${loaded} account(s) from Postgres`);
    }
  }

  if (loaded === 0) {
    loaded = await loadPersistedUsers(storage, jsonPath);
  }

  if (loaded === 0) {
    console.log(`user persistence: no accounts on file (${jsonPath})`);
  } else if (postgres) {
    await postgres.syncAll(await storage.listUsers());
    await persistUsers(storage, jsonPath, { force: true });
  }

  // `force` authorizes writing an empty registry, which only an account deletion
  // should ever do. Without it an empty in-memory registry means something went
  // wrong upstream, and must not be allowed to reach either store.
  const save = async (force = false): Promise<void> => {
    const written = await persistUsers(storage, jsonPath, force ? { force: true } : undefined);
    if (!written) return;
    if (postgres) await postgres.syncAll(await storage.listUsers());
  };

  const onShutdown = (): void => {
    void save().finally(() => process.exit(0));
  };
  process.on("SIGTERM", onShutdown);
  process.on("SIGINT", onShutdown);

  setInterval(() => {
    void save().catch((err) => console.error("user persistence periodic save failed:", err));
  }, USER_SAVE_INTERVAL_MS).unref();

  return { save, postgres };
}

export { persistedUserCount, usersFilePath };
