// Authentication: password hashing via Bun.password, sessions via storage.
// (Uses Bun, so it's only imported by index.ts — not by the vitest core tests.)

import type { Storage } from "./storage";

export interface AuthOk {
  token: string;
  userId: string;
  handle: string;
}
export type AuthResult = AuthOk | { error: string };

export async function register(storage: Storage, handle: string, password: string): Promise<AuthResult> {
  if (handle.length < 2) return { error: "handle too short" };
  if (password.length < 4) return { error: "password too short" };
  if (await storage.userByHandle(handle)) return { error: "handle taken" };
  const hash = await Bun.password.hash(password);
  const user = await storage.createUser(handle, hash);
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
