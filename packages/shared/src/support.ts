import { validateEmail } from "./sql-safe";

/** Inquiry categories shown on the public support form. */
export const SUPPORT_INQUIRY_TYPES = [
  { id: "general", label: "General question" },
  { id: "account", label: "Account or login" },
  { id: "gameplay", label: "Gameplay help" },
  { id: "bug", label: "Bug or technical issue" },
  { id: "privacy", label: "Privacy or data request" },
  { id: "feedback", label: "Feedback or suggestion" },
  { id: "other", label: "Other" },
] as const;

export type SupportInquiryType = (typeof SUPPORT_INQUIRY_TYPES)[number]["id"];

const TYPE_IDS = new Set<string>(SUPPORT_INQUIRY_TYPES.map((t) => t.id));

export const SUPPORT_MESSAGE_MIN_LENGTH = 10;
export const SUPPORT_MESSAGE_MAX_LENGTH = 4000;

export interface SupportInquiryPayload {
  type: SupportInquiryType;
  email: string;
  message: string;
}

export interface SupportInquiryRecord extends SupportInquiryPayload {
  id: string;
  createdAt: number;
  /** Registered username, when the submitter was signed in. */
  handle?: string;
  userId?: string;
}

/** Validate a support form submission; returns an error message or null if ok. */
export function validateSupportInquiry(payload: {
  type: string;
  email: string;
  message: string;
}): string | null {
  if (!TYPE_IDS.has(payload.type)) return "invalid inquiry type";
  const emailErr = validateEmail(payload.email.trim());
  if (emailErr) return emailErr;
  const message = payload.message.trim();
  if (message.length < SUPPORT_MESSAGE_MIN_LENGTH) return "message too short";
  if (message.length > SUPPORT_MESSAGE_MAX_LENGTH) return "message too long";
  return null;
}
