import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { MemoryStorage, type User } from "./storage";

// users-postgres imports `bun`, which the vitest/node runner cannot resolve, so
// the real module must never load here.
const pg = vi.hoisted(() => ({ users: [] as User[], syncAllCalls: [] as User[][] }));

vi.mock("./users-postgres", () => ({
  PostgresUserStore: class {
    init(): Promise<void> {
      return Promise.resolve();
    }
    loadAll(): Promise<User[]> {
      return Promise.resolve(pg.users);
    }
    syncAll(users: User[]): Promise<void> {
      pg.syncAllCalls.push(users);
      return Promise.resolve();
    }
    delete(): Promise<void> {
      return Promise.resolve();
    }
  },
}));

const { initUserPersistence } = await import("./user-bootstrap");

const ALICE: User = { id: "u1", handle: "Alice", passwordHash: "hash-a", createdAt: 1 };

describe("user persistence bootstrap", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "roc-bootstrap-"));
    process.env.ROC_USERS_FILE = join(dir, "users.json");
    process.env.DATABASE_URL = "postgres://fake";
    pg.users = [{ ...ALICE }];
    pg.syncAllCalls = [];
  });

  afterEach(async () => {
    delete process.env.ROC_USERS_FILE;
    delete process.env.DATABASE_URL;
    await rm(dir, { recursive: true, force: true });
  });

  it("does not wipe Postgres when the registry is unexpectedly empty", async () => {
    const storage = new MemoryStorage();
    const persistence = await initUserPersistence(storage);
    expect(pg.syncAllCalls).toHaveLength(1);

    // Whatever emptied the registry, it was not an account deletion.
    storage.clearUsers();
    await persistence.save();

    expect(pg.syncAllCalls).toHaveLength(1);
    expect(pg.syncAllCalls.at(-1)).toHaveLength(1);
  });

  it("propagates a deliberate emptying to Postgres", async () => {
    const storage = new MemoryStorage();
    const persistence = await initUserPersistence(storage);

    storage.clearUsers();
    await persistence.save(true);

    expect(pg.syncAllCalls).toHaveLength(2);
    expect(pg.syncAllCalls.at(-1)).toEqual([]);
  });

  it("still mirrors ordinary saves to Postgres", async () => {
    const storage = new MemoryStorage();
    const persistence = await initUserPersistence(storage);

    await storage.createUser("Bob", "hash-b");
    await persistence.save();

    expect(pg.syncAllCalls).toHaveLength(2);
    expect(pg.syncAllCalls.at(-1)?.map((u) => u.handle).sort()).toEqual(["Alice", "Bob"]);
  });
});
