/** Max length for admin table filter/search text (values are always parameterized). */
export const FILTER_TEXT_MAX_LENGTH = 200;

export const HANDLE_MIN_LENGTH = 2;
export const HANDLE_MAX_LENGTH = 32;
export const EMAIL_MAX_LENGTH = 254;

/** IDs in URL paths or SQL equality lookups (uuid, server-generated ids). */
export const LOOKUP_ID_MAX_LENGTH = 128;

const LOOKUP_ID_PATTERN = /^[a-zA-Z0-9._-]+$/;

/** Trim and cap filter text before it is compared in memory or bound as a SQL value. */
export function clampFilterText(value: string | undefined, maxLen = FILTER_TEXT_MAX_LENGTH): string | undefined {
  if (value == null) return undefined;
  const t = value.trim();
  if (!t) return undefined;
  return t.length > maxLen ? t.slice(0, maxLen) : t;
}

/** Reject ids with characters that must never appear in SQL fragments. */
export function isSafeLookupId(id: string, maxLen = LOOKUP_ID_MAX_LENGTH): boolean {
  if (id.length === 0 || id.length > maxLen) return false;
  return LOOKUP_ID_PATTERN.test(id);
}

export type HandleValidationError = "handle too short" | "handle too long";

export function validateHandle(handle: string): HandleValidationError | null {
  if (handle.length < HANDLE_MIN_LENGTH) return "handle too short";
  if (handle.length > HANDLE_MAX_LENGTH) return "handle too long";
  return null;
}

export type EmailValidationError = "invalid email" | "email too long";

export function validateEmail(email: string): EmailValidationError | null {
  if (email.length > EMAIL_MAX_LENGTH) return "email too long";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "invalid email";
  return null;
}

/**
 * Map a whitelisted sort key to a SQL column/identifier. Never pass user input
 * through as a column name — only keys present in `columns` are allowed.
 */
export function resolveSqlSortColumn<T extends string>(
  sort: T | undefined,
  columns: Readonly<Record<T, string>>,
  defaultColumn: string,
): string {
  if (sort == null) return defaultColumn;
  return columns[sort] ?? defaultColumn;
}
