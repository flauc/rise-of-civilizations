import { describe, expect, it } from "vitest";
import {
  clampFilterText,
  isSafeLookupId,
  resolveSqlSortColumn,
  validateEmail,
  validateHandle,
} from "./sql-safe";

describe("clampFilterText", () => {
  it("trims and caps length", () => {
    expect(clampFilterText("  hello  ")).toBe("hello");
    expect(clampFilterText("x".repeat(300))?.length).toBe(200);
    expect(clampFilterText("")).toBeUndefined();
  });
});

describe("isSafeLookupId", () => {
  it("accepts normal ids and uuids", () => {
    expect(isSafeLookupId("r1")).toBe(true);
    expect(isSafeLookupId("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
    expect(isSafeLookupId("u_abc123")).toBe(true);
  });

  it("rejects sql injection attempts", () => {
    expect(isSafeLookupId("' OR 1=1 --")).toBe(false);
    expect(isSafeLookupId("id; DROP TABLE sessions")).toBe(false);
    expect(isSafeLookupId("")).toBe(false);
  });
});

describe("validateHandle", () => {
  it("enforces length bounds", () => {
    expect(validateHandle("a")).toBe("handle too short");
    expect(validateHandle("ab")).toBeNull();
    expect(validateHandle("x".repeat(33))).toBe("handle too long");
  });
});

describe("validateEmail", () => {
  it("rejects invalid and oversized emails", () => {
    expect(validateEmail("bad")).toBe("invalid email");
    expect(validateEmail("a@b.c")).toBeNull();
    expect(validateEmail("x".repeat(250) + "@y.com")).toBe("email too long");
  });
});

describe("resolveSqlSortColumn", () => {
  const cols = { startedAt: "started_at", mode: "mode" } as const;

  it("maps known keys and falls back safely", () => {
    expect(resolveSqlSortColumn("startedAt", cols, "started_at")).toBe("started_at");
    expect(resolveSqlSortColumn(undefined, cols, "started_at")).toBe("started_at");
    expect(resolveSqlSortColumn("mode", cols, "started_at")).toBe("mode");
    expect(resolveSqlSortColumn("mode; DROP TABLE" as "mode", cols, "started_at")).toBe("started_at");
    expect(resolveSqlSortColumn("evil" as "startedAt", cols, "started_at")).toBe("started_at");
  });
});
