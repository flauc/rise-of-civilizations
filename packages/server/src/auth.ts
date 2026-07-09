// Authentication: password hashing via Bun.password, sessions via storage.
// (Uses Bun, so it's only imported by index.ts — not by the vitest core tests.)

import type { Storage } from "./storage";

export interface AuthOk {
  token: string;
  userId: string;
  handle: string;
}
export type AuthResult = AuthOk | { error: string };

export interface RegisterOptions {
  email?: string;
  newsletter?: boolean;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function register(
  storage: Storage,
  handle: string,
  password: string,
  opts: RegisterOptions = {},
): Promise<AuthResult> {
  if (handle.length < 2) return { error: "handle too short" };
  if (password.length < 4) return { error: "password too short" };
  if (await storage.userByHandle(handle)) return { error: "handle taken" };
  const newsletter = !!opts.newsletter;
  const email = opts.email?.trim();
  if (newsletter) {
    if (!email) return { error: "email required for newsletter" };
    if (!isValidEmail(email)) return { error: "invalid email" };
  }
  const hash = await Bun.password.hash(password);
  const user = await storage.createUser(handle, hash, {
    email: newsletter ? email : undefined,
    newsletterOptIn: newsletter,
  });
  const token = await storage.createSession(user.id);
  return { token, userId: user.id, handle: user.handle };
}

export async function login(storage: Storage, handle: string, password: string): Promise<AuthResult> {
  const user = await storage.userByHandle(handle);
  if (!user) return { error: "invalid credentials" };
  if (!(await Bun.password.verify(password, user.passwordHash))) return { error: "invalid credentials" };
  const token = await storage.createSession(user.id);
  return { token, userId: user.id, handle: user.handle };
}

export async function resume(storage: Storage, token: string): Promise<AuthResult> {
  const userId = await storage.userIdForToken(token);
  if (!userId) return { error: "invalid token" };
  const user = await storage.userById(userId);
  if (!user) return { error: "invalid token" };
  return { token, userId: user.id, handle: user.handle };
}
