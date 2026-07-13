/** Minimum length for new account passwords (registration only). */
export const PASSWORD_MIN_LENGTH = 8;

/** Upper bound to limit bcrypt work and oversized payloads. */
export const PASSWORD_MAX_LENGTH = 128;

export type PasswordValidationError =
  | "password too short"
  | "password too long"
  | "password needs letter"
  | "password needs digit";

/** Human-readable requirements shown on the register form. */
export const PASSWORD_REQUIREMENTS_HINT =
  "At least 8 characters, including one letter and one number.";

/**
 * Validates a password for new registration. Existing accounts are not
 * re-checked on login.
 */
export function validateRegistrationPassword(password: string): PasswordValidationError | null {
  if (password.length < PASSWORD_MIN_LENGTH) return "password too short";
  if (password.length > PASSWORD_MAX_LENGTH) return "password too long";
  if (!/[a-zA-Z]/.test(password)) return "password needs letter";
  if (!/\d/.test(password)) return "password needs digit";
  return null;
}
