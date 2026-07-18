// Durable registered-user storage on Postgres when DATABASE_URL is set.
// Sessions stay in memory; accounts survive deploys and restarts.

import { SQL } from "bun";
import type { User } from "./storage";

function makeSql(connectionString: string) {
  return new SQL(connectionString);
}

function rowToUser(row: Record<string, unknown>): User | null {
  const id = row.id;
  const handle = row.handle;
  const passwordHash = row.password_hash;
  const createdAt = row.created_at;
  if (typeof id !== "string" || typeof handle !== "string" || typeof passwordHash !== "string") {
    return null;
  }
  const created =
    typeof createdAt === "number"
      ? createdAt
      : typeof createdAt === "string"
        ? Number(createdAt)
        : NaN;
  if (!Number.isFinite(created)) return null;
  const email = typeof row.email === "string" ? row.email : undefined;
  const newsletterOptIn = row.newsletter_opt_in === true;
  return {
    id,
    handle,
    passwordHash,
    createdAt: created,
    email,
    newsletterOptIn: newsletterOptIn || undefined,
  };
}

export class PostgresUserStore {
  private readonly sql: ReturnType<typeof makeSql>;

  constructor(connectionString = process.env.DATABASE_URL ?? "") {
    this.sql = makeSql(connectionString);
  }

  async init(): Promise<void> {
    await this.sql`
      CREATE TABLE IF NOT EXISTS roc_users (
        id                TEXT PRIMARY KEY,
        handle            TEXT NOT NULL,
        handle_lower      TEXT NOT NULL UNIQUE,
        password_hash     TEXT NOT NULL,
        created_at        BIGINT NOT NULL,
        email             TEXT,
        newsletter_opt_in BOOLEAN
      )`;
  }

  async loadAll(): Promise<User[]> {
    const rows = await this.sql`SELECT * FROM roc_users ORDER BY created_at DESC`;
    const out: User[] = [];
    for (const row of rows as Record<string, unknown>[]) {
      const user = rowToUser(row);
      if (user) out.push(user);
    }
    return out;
  }

  async upsert(user: User): Promise<void> {
    await this.sql`
      INSERT INTO roc_users (id, handle, handle_lower, password_hash, created_at, email, newsletter_opt_in)
      VALUES (
        ${user.id},
        ${user.handle},
        ${user.handle.toLowerCase()},
        ${user.passwordHash},
        ${user.createdAt},
        ${user.email ?? null},
        ${user.newsletterOptIn ?? false}
      )
      ON CONFLICT (id) DO UPDATE SET
        handle = EXCLUDED.handle,
        handle_lower = EXCLUDED.handle_lower,
        password_hash = EXCLUDED.password_hash,
        created_at = EXCLUDED.created_at,
        email = EXCLUDED.email,
        newsletter_opt_in = EXCLUDED.newsletter_opt_in`;
  }

  async syncAll(users: User[]): Promise<void> {
    for (const user of users) await this.upsert(user);
    const ids = users.map((u) => u.id);
    if (ids.length === 0) {
      await this.sql`DELETE FROM roc_users`;
      return;
    }
    // Pass the id set as an explicit Postgres text-array literal (`{"a","b"}`)
    // and cast it, rather than binding a JS array as a bare parameter: Bun's SQL
    // encodes a `string[]` param as a comma-joined string, which Postgres then
    // rejects as a malformed array literal ("must start with {").
    const idArrayLiteral = `{${ids.map((id) => `"${id.replace(/([\\"])/g, "\\$1")}"`).join(",")}}`;
    await this.sql`DELETE FROM roc_users WHERE id <> ALL(${idArrayLiteral}::text[])`;
  }

  async delete(userId: string): Promise<void> {
    await this.sql`DELETE FROM roc_users WHERE id = ${userId}`;
  }
}
