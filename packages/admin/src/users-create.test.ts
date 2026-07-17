import { describe, it, expect, afterEach, vi } from "vitest";
import { createUser } from "./users-create";

const realFetch = globalThis.fetch;

function stubFetch(res: Partial<Response> | Error): void {
  globalThis.fetch = vi.fn(() =>
    res instanceof Error ? Promise.reject(res) : Promise.resolve(res as Response),
  ) as unknown as typeof fetch;
}

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("createUser", () => {
  it("returns the created handle on success", async () => {
    stubFetch({ ok: true, status: 201, json: () => Promise.resolve({ handle: "Alice" }) });
    expect(await createUser({ handle: "Alice", password: "pw", newsletter: false }, "tok")).toEqual({
      handle: "Alice",
    });
  });

  it("surfaces the server's error message on a rejected request", async () => {
    stubFetch({ ok: false, status: 400, json: () => Promise.resolve({ error: "handle taken" }) });
    expect(await createUser({ handle: "Alice", password: "pw", newsletter: false }, "tok")).toEqual({
      error: "handle taken",
    });
  });

  it("falls back to the status code when the body is not JSON", async () => {
    stubFetch({ ok: false, status: 502, json: () => Promise.reject(new Error("Unexpected token <")) });
    expect(await createUser({ handle: "Alice", password: "pw", newsletter: false }, "tok")).toEqual({
      error: "Request failed (502)",
    });
  });

  it("propagates a dead connection so the caller can report it", async () => {
    stubFetch(new TypeError("Failed to fetch"));
    await expect(createUser({ handle: "Alice", password: "pw", newsletter: false }, "tok")).rejects.toThrow(
      "Failed to fetch",
    );
  });
});
