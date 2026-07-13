import { describe, it, expect } from "vitest";
import { validateSupportInquiry } from "./support";

describe("validateSupportInquiry", () => {
  it("accepts valid payloads and rejects bad input", () => {
    expect(validateSupportInquiry({ type: "feedback", email: "x@y.z", message: "Great game!" })).toBeNull();
    expect(validateSupportInquiry({ type: "other", email: "x@y.z", message: "" })).toBe("message too short");
  });
});
