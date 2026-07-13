import { describe, expect, it } from "vitest";
import { validateRegistrationPassword } from "./password";

describe("validateRegistrationPassword", () => {
  it("accepts passwords that meet basic rules", () => {
    expect(validateRegistrationPassword("secret12")).toBeNull();
    expect(validateRegistrationPassword("MyPass99")).toBeNull();
  });

  it("rejects passwords that are too short", () => {
    expect(validateRegistrationPassword("abc1")).toBe("password too short");
  });

  it("rejects passwords that are too long", () => {
    expect(validateRegistrationPassword("a1" + "x".repeat(127))).toBe("password too long");
  });

  it("requires at least one letter", () => {
    expect(validateRegistrationPassword("12345678")).toBe("password needs letter");
  });

  it("requires at least one digit", () => {
    expect(validateRegistrationPassword("abcdefgh")).toBe("password needs digit");
  });
});
