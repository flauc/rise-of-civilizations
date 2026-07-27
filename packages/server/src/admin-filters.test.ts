import { describe, expect, it } from "vitest";
import { parseGameSessionQuery } from "./game-sessions";
import { parseBugReportQuery } from "./bug-reports";

describe("admin filter query parsing", () => {
  it("clamps filter text and ignores invalid sort fields", () => {
    const q = parseGameSessionQuery(
      new URLSearchParams({
        handle: "  alice  ",
        q: "' OR 1=1 --" + "x".repeat(300),
        sort: "startedAt; DROP TABLE sessions",
        order: "desc",
      }),
    );
    expect(q.filters?.handle).toBe("alice");
    expect(q.filters?.q?.length).toBe(200);
    expect(q.sort).toBeUndefined();
    expect(q.order).toBe("desc");
  });

  it("parses the tutorial scope and ending filters", () => {
    const only = parseGameSessionQuery(new URLSearchParams({ isTutorial: "true", tutorialOutcome: "skipped" }));
    expect(only.filters?.isTutorial).toBe(true);
    expect(only.filters?.tutorialOutcome).toBe("skipped");
    expect(parseGameSessionQuery(new URLSearchParams({ isTutorial: "false" })).filters?.isTutorial).toBe(false);
    expect(parseGameSessionQuery(new URLSearchParams()).filters?.isTutorial).toBeUndefined();
  });

  it("sanitizes bug report filters the same way", () => {
    const q = parseBugReportQuery(
      new URLSearchParams({
        message: "stack trace",
        reportId: "id'; DELETE FROM bug_reports; --",
        sort: "evil",
      }),
    );
    expect(q.filters?.message).toBe("stack trace");
    expect(q.filters?.reportId).toBe("id'; DELETE FROM bug_reports; --".slice(0, 200));
    expect(q.sort).toBeUndefined();
  });
});
