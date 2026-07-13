// Persistence behind an interface (PLAN.md §4.6). The default is in-memory (pure,
// testable). A Postgres adapter (storage-postgres.ts, using Bun.sql) is used when
// DATABASE_URL is set. The live game runs from memory; storage holds users,
// sessions, and (Postgres path) authoritative snapshots for restart/async play.

export interface User {
  id: string;
  handle: string;
  passwordHash: string;
  createdAt: number;
  /** Provided when the user opts into newsletter/notifications at signup. */
  email?: string;
  newsletterOptIn?: boolean;
}

export interface CreateUserOptions {
  email?: string;
  newsletterOptIn?: boolean;
}

export interface Storage {
  createUser(handle: string, passwordHash: string, opts?: CreateUserOptions): Promise<User>;
  userByHandle(handle: string): Promise<User | undefined>;
  userById(id: string): Promise<User | undefined>;
  createSession(userId: string): Promise<string>; // returns token
  userIdForToken(token: string): Promise<string | undefined>;
  deleteUser(userId: string): Promise<void>;
  saveSnapshot(gameId: string, turn: number, blob: string): Promise<void>;
  loadSnapshot(gameId: string): Promise<{ turn: number; blob: string } | undefined>;
  /** All registered accounts, newest first (for admin). */
  listUsers(): Promise<User[]>;
}

function rid(prefix: string): string {
  return prefix + "_" + Math.random().toString(36).slice(2, 12);
}

export class MemoryStorage implements Storage {
  private readonly users = new Map<string, User>();
  private readonly byHandle = new Map<string, string>();
  private readonly sessions = new Map<string, string>(); // token -> userId
  private readonly snapshots = new Map<string, { turn: number; blob: string }>();

  async createUser(handle: string, passwordHash: string, opts?: CreateUserOptions): Promise<User> {
    if (this.byHandle.has(handle.toLowerCase())) throw new Error("handle taken");
    const user: User = {
      id: rid("u"),
      handle,
      passwordHash,
      createdAt: Date.now(),
      email: opts?.email,
      newsletterOptIn: opts?.newsletterOptIn,
    };
    this.users.set(user.id, user);
    this.byHandle.set(handle.toLowerCase(), user.id);
    return user;
  }
  async userByHandle(handle: string): Promise<User | undefined> {
    const id = this.byHandle.get(handle.toLowerCase());
    return id ? this.users.get(id) : undefined;
  }
  async userById(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }
  async createSession(userId: string): Promise<string> {
    const token = rid("t") + rid("");
    this.sessions.set(token, userId);
    return token;
  }
  async userIdForToken(token: string): Promise<string | undefined> {
    return this.sessions.get(token);
  }
  async deleteUser(userId: string): Promise<void> {
    const user = this.users.get(userId);
    if (!user) return;
    this.users.delete(userId);
    this.byHandle.delete(user.handle.toLowerCase());
    for (const [token, uid] of this.sessions) {
      if (uid === userId) this.sessions.delete(token);
    }
  }
  async saveSnapshot(gameId: string, turn: number, blob: string): Promise<void> {
    this.snapshots.set(gameId, { turn, blob });
  }
  async loadSnapshot(gameId: string): Promise<{ turn: number; blob: string } | undefined> {
    return this.snapshots.get(gameId);
  }
  async listUsers(): Promise<User[]> {
    return [...this.users.values()].sort((a, b) => b.createdAt - a.createdAt);
  }

  /** Restore a user loaded from disk (skips duplicate-handle checks). */
  restoreUser(user: User): void {
    if (this.byHandle.has(user.handle.toLowerCase())) return;
    this.users.set(user.id, user);
    this.byHandle.set(user.handle.toLowerCase(), user.id);
  }
}
