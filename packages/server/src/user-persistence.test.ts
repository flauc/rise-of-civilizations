import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { MemoryStorage } from "./storage";
import { loadPersistedUsers, persistUsers, persistedUserCount } from "./user-persistence";

describe("user persistence", () => {
  let dir: string;
  let path: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "roc-users-"));
    path = join(dir, "users.json");
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("round-trips users through JSON", async () => {
    const storage = new MemoryStorage();
    await storage.createUser("Alice", "hash-a", { email: "a@b.co", newsletterOptIn: true });
    await persistUsers(storage, path, { force: true });
    expect(persistedUserCount()).toBe(1);

    const reload = new MemoryStorage();
    const count = await loadPersistedUsers(reload, path);
    expect(count).toBe(1);
    const user = await reload.userByHandle("alice");
    expect(user?.handle).toBe("Alice");
    expect(user?.email).toBe("a@b.co");
  });

  it("refuses to wipe a non-empty registry with an empty save", async () => {
    const storage = new MemoryStorage();
    await storage.createUser("Bob", "hash-b");
    await persistUsers(storage, path, { force: true });

    const empty = new MemoryStorage();
    await loadPersistedUsers(empty, path);
    await persistUsers(empty, path);
    const text = await readFile(path, "utf8");
    expect(JSON.parse(text)).toHaveLength(1);
  });
});
