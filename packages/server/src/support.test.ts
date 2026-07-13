import { describe, it, expect } from "vitest";
import { validateSupportInquiry } from "@roc/shared";
import { SupportStore, parseSupportInquiryBody } from "./support";

describe("support inquiries", () => {
  it("validates inquiry payloads", () => {
    expect(validateSupportInquiry({ type: "general", email: "a@b.co", message: "Hello there" })).toBeNull();
    expect(validateSupportInquiry({ type: "nope", email: "a@b.co", message: "Hello there" })).toBe(
      "invalid inquiry type",
    );
    expect(validateSupportInquiry({ type: "general", email: "bad", message: "Hello there" })).toBe("invalid email");
    expect(validateSupportInquiry({ type: "general", email: "a@b.co", message: "short" })).toBe("message too short");
  });

  it("stores parsed inquiries", () => {
    const store = new SupportStore();
    const parsed = parseSupportInquiryBody({
      type: "account",
      email: "player@example.com",
      message: "I cannot log in to my account.",
    });
    expect("error" in parsed).toBe(false);
    if ("error" in parsed) return;
    const row = store.add(parsed);
    expect(row.id.startsWith("sup_")).toBe(true);
    expect(store.list()).toHaveLength(1);
    expect(store.list()[0]!.email).toBe("player@example.com");
  });
});
