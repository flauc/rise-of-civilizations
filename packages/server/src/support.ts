// Public support inquiries — stored server-side for follow-up.

import {
  type SupportInquiryPayload,
  type SupportInquiryRecord,
  type SupportInquiryType,
  validateSupportInquiry,
} from "@roc/shared";

function rid(): string {
  return "sup_" + Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
}

export class SupportStore {
  private readonly inquiries: SupportInquiryRecord[] = [];

  add(
    payload: SupportInquiryPayload,
    meta: { handle?: string; userId?: string } = {},
  ): SupportInquiryRecord {
    const record: SupportInquiryRecord = {
      id: rid(),
      type: payload.type,
      email: payload.email.trim(),
      message: payload.message.trim(),
      createdAt: Date.now(),
      handle: meta.handle,
      userId: meta.userId,
    };
    this.inquiries.push(record);
    return record;
  }

  list(): SupportInquiryRecord[] {
    return [...this.inquiries].sort((a, b) => b.createdAt - a.createdAt);
  }

  restore(rows: SupportInquiryRecord[]): number {
    let count = 0;
    for (const row of rows) {
      if (this.inquiries.some((r) => r.id === row.id)) continue;
      this.inquiries.push(row);
      count++;
    }
    return count;
  }

  exportAll(): SupportInquiryRecord[] {
    return this.list();
  }
}

export function parseSupportInquiryBody(raw: unknown): SupportInquiryPayload | { error: string } {
  if (!raw || typeof raw !== "object") return { error: "invalid body" };
  const body = raw as Partial<SupportInquiryPayload>;
  if (typeof body.type !== "string" || typeof body.email !== "string" || typeof body.message !== "string") {
    return { error: "invalid body" };
  }
  const err = validateSupportInquiry({
    type: body.type,
    email: body.email,
    message: body.message,
  });
  if (err) return { error: err };
  return {
    type: body.type as SupportInquiryType,
    email: body.email.trim(),
    message: body.message.trim(),
  };
}
