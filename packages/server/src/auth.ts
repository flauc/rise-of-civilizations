// Authentication: password hashing via Bun.password, sessions via storage.
// (Uses Bun, so it's only imported by index.ts — not by the vitest core tests.)

import {
  PASSWORD_MAX_LENGTH,
  validateEmail,
  validateHandle,
  validateRegistrationPassword,
} from "@roc/shared";

import type { Storage, User } from "./storage";

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

const MAX_SESSION_TOKEN_LENGTH = 128;

export async function register(
  storage: Storage,
  handle: string,
  password: string,
  opts: RegisterOptions = {},
): Promise<AuthResult> {
  // Self-registration only ever stores an address alongside a newsletter opt-in.
  const created = await createAccount(storage, handle, password, {
    newsletter: opts.newsletter,
    email: opts.newsletter ? opts.email : undefined,
  });
  if ("error" in created) return { error: created.error };
  const token = await storage.createSession(created.user.id);
  return { token, userId: created.user.id, handle: created.user.handle };
}

/** Create an account without opening a session (admin tooling). */
export async function createAccount(
  storage: Storage,
  handle: string,
  password: string,
  opts: RegisterOptions = {},
): Promise<{ user: User } | { error: string }> {
  const handleError = validateHandle(handle);
  if (handleError) return { error: handleError };
  const passwordError = validateRegistrationPassword(password);
  if (passwordError) return { error: passwordError };
  if (await storage.userByHandle(handle)) return { error: "handle taken" };
  const newsletter = !!opts.newsletter;
  const email = opts.email?.trim();
  if (newsletter && !email) return { error: "email required for newsletter" };
  // Any address we are going to store gets validated, opt-in or not.
  if (email) {
    const emailError = validateEmail(email);
    if (emailError) return { error: emailError };
  }
  const hash = await Bun.password.hash(password);
  const user = await storage.createUser(handle, hash, {
    email: email || undefined,
    newsletterOptIn: newsletter,
  });
  return { user };
}

export async function login(storage: Storage, handle: string, password: string): Promise<AuthResult> {
  const handleError = validateHandle(handle);
  if (handleError) return { error: "invalid credentials" };
  if (password.length > PASSWORD_MAX_LENGTH) return { error: "invalid credentials" };
  const user = await storage.userByHandle(handle);
  if (!user) return { error: "invalid credentials" };
  if (!(await Bun.password.verify(password, user.passwordHash))) return { error: "invalid credentials" };
  const token = await storage.createSession(user.id);
  return { token, userId: user.id, handle: user.handle };
}

export async function resume(storage: Storage, token: string): Promise<AuthResult> {
  if (token.length === 0 || token.length > MAX_SESSION_TOKEN_LENGTH) return { error: "invalid token" };
  const userId = await storage.userIdForToken(token);
  if (!userId) return { error: "invalid token" };
  const user = await storage.userById(userId);
  if (!user) return { error: "invalid token" };
  return { token, userId: user.id, handle: user.handle };
}

export type DeleteAccountResult = { ok: true } | { error: string };

/** Verify password and permanently remove the account and all its sessions. */
export async function deleteAccount(
  storage: Storage,
  token: string,
  password: string,
): Promise<DeleteAccountResult> {
  if (token.length === 0 || token.length > MAX_SESSION_TOKEN_LENGTH) return { error: "invalid token" };
  const userId = await storage.userIdForToken(token);
  if (!userId) return { error: "invalid token" };
  const user = await storage.userById(userId);
  if (!user) return { error: "invalid token" };
  if (password.length > PASSWORD_MAX_LENGTH) return { error: "invalid credentials" };
  if (!(await Bun.password.verify(password, user.passwordHash))) return { error: "invalid credentials" };
  await storage.deleteUser(userId);
  return { ok: true };
}
