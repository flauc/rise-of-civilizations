import { describe, it, expect, beforeAll } from "vitest";
import { MemoryStorage } from "./storage";
import { createAccount, register } from "./auth";

// auth.ts hashes via Bun.password, which the vitest/node runner does not provide.
beforeAll(() => {
  (globalThis as unknown as { Bun?: unknown }).Bun ??= {
    password: { hash: (pw: string) => Promise.resolve(`hashed:${pw}`) },
  };
});

const PASSWORD = "correct horse battery 9";

describe("register", () => {
  it("opens a session and stores an opted-in email", async () => {
    const storage = new MemoryStorage();
    const res = await register(storage, "Alice", PASSWORD, { newsletter: true, email: "a@b.co" });
    expect("error" in res).toBe(false);
    if ("error" in res) return;
    expect(res.handle).toBe("Alice");
    expect(res.token).toBeTruthy();
    const user = await storage.userByHandle("alice");
    expect(user?.email).toBe("a@b.co");
    expect(user?.newsletterOptIn).toBe(true);
  });

  it("drops an email supplied without a newsletter opt-in", async () => {
    const storage = new MemoryStorage();
    await register(storage, "Alice", PASSWORD, { newsletter: false, email: "not-validated" });
    const user = await storage.userByHandle("alice");
    expect(user?.email).toBeUndefined();
  });

  it("rejects a newsletter opt-in with no email", async () => {
    const storage = new MemoryStorage();
    expect(await register(storage, "Alice", PASSWORD, { newsletter: true })).toEqual({
      error: "email required for newsletter",
    });
  });

  it("rejects a taken handle regardless of case", async () => {
    const storage = new MemoryStorage();
    await register(storage, "Alice", PASSWORD);
    expect(await register(storage, "alice", PASSWORD)).toEqual({ error: "handle taken" });
  });
});

describe("createAccount", () => {
  it("creates a user without opening a session", async () => {
    const storage = new MemoryStorage();
    const res = await createAccount(storage, "Alice", PASSWORD);
    expect("error" in res).toBe(false);
    if ("error" in res) return;
    expect(res.user.handle).toBe("Alice");
    expect(res).not.toHaveProperty("token");
  });

  it("stores an email the admin supplied without a newsletter opt-in", async () => {
    const storage = new MemoryStorage();
    const res = await createAccount(storage, "Alice", PASSWORD, { email: "a@b.co", newsletter: false });
    expect("error" in res).toBe(false);
    const user = await storage.userByHandle("alice");
    expect(user?.email).toBe("a@b.co");
    expect(user?.newsletterOptIn).toBeFalsy();
  });

  it("validates an email even when the newsletter is not opted in", async () => {
    const storage = new MemoryStorage();
    const res = await createAccount(storage, "Alice", PASSWORD, { email: "nonsense", newsletter: false });
    expect("error" in res).toBe(true);
    expect(await storage.userByHandle("alice")).toBeUndefined();
  });
});
