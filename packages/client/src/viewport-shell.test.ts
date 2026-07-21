import { describe, expect, it } from "vitest";
import { bootDetectPhoneShell, PHONE_LONG_EDGE_PX, PHONE_SHORT_EDGE_PX } from "./viewport-shell";

describe("bootDetectPhoneShell", () => {
  it("accepts common portrait phones with coarse pointer", () => {
    expect(bootDetectPhoneShell(393, 852, true)).toBe(true);
    expect(bootDetectPhoneShell(430, 932, true)).toBe(true);
    expect(bootDetectPhoneShell(360, 780, true)).toBe(true);
  });

  it("accepts landscape phones (short edge is height)", () => {
    expect(bootDetectPhoneShell(932, 430, true)).toBe(true);
    expect(bootDetectPhoneShell(844, 390, true)).toBe(true);
  });

  it("rejects tablets and touch laptops by short edge", () => {
    expect(bootDetectPhoneShell(768, 1024, true)).toBe(false);
    expect(bootDetectPhoneShell(1920, 1080, true)).toBe(false);
  });

  it("allows DevTools emulation without coarse pointer when long edge is phone-sized", () => {
    expect(bootDetectPhoneShell(393, 852, false)).toBe(true);
    expect(bootDetectPhoneShell(1280, 800, false)).toBe(false);
  });

  it("documents the short/long edge ceilings", () => {
    expect(PHONE_SHORT_EDGE_PX).toBeGreaterThanOrEqual(430);
    expect(PHONE_LONG_EDGE_PX).toBeGreaterThan(852);
  });
});
