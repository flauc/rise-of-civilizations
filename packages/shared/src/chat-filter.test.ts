import { describe, expect, it } from "vitest";
import { filterChatText } from "./chat-filter";

describe("filterChatText", () => {
  it("leaves clean text unchanged", () => {
    expect(filterChatText("Hello Rome, good game!")).toBe("Hello Rome, good game!");
  });

  it("masks whole vulgar words", () => {
    expect(filterChatText("what the fuck")).toBe("what the ****");
    expect(filterChatText("SHIT happens")).toBe("**** happens");
  });

  it("does not mask substrings inside other words", () => {
    expect(filterChatText("classic scunthorpe")).toBe("classic scunthorpe");
  });

  it("masks multiple words", () => {
    expect(filterChatText("shit and fuck")).toBe("**** and ****");
  });
});
