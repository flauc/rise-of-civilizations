import { expect, test, vi, beforeEach, afterEach } from "vitest";
import { exportSave, importSave, type SaveRecord } from "./save-db";

function makeRecord(extra: Partial<SaveRecord> = {}): SaveRecord {
  return {
    id: "save_123",
    name: "Test Save",
    mode: "sp",
    createdAt: 1_700_000_000_000,
    turn: 7,
    playerNames: ["Alice"],
    blob: JSON.stringify({ turn: 7, players: [{ name: "Alice" }] }),
    ...extra,
  };
}

test("exportSave serializes a SaveRecord", () => {
  const record = makeRecord();
  const json = exportSave(record);
  const parsed = JSON.parse(json) as SaveRecord;
  expect(parsed.id).toBe(record.id);
  expect(parsed.name).toBe(record.name);
  expect(parsed.mode).toBe("sp");
  expect(parsed.turn).toBe(7);
  expect(parsed.blob).toBe(record.blob);
});

test("importSave rejects non-JSON input", async () => {
  await expect(importSave("not json")).rejects.toThrow("not valid JSON");
});

test("importSave rejects missing fields", async () => {
  await expect(importSave(JSON.stringify({ name: "x", mode: "sp" }))).rejects.toThrow("turn number");
  await expect(importSave(JSON.stringify({ turn: 1, mode: "sp", playerNames: [], blob: "{}" }))).rejects.toThrow("name");
  await expect(importSave(JSON.stringify({ name: "x", turn: 1, playerNames: [], blob: "{}" }))).rejects.toThrow("mode");
  await expect(importSave(JSON.stringify({ name: "x", turn: 1, mode: "sp" }))).rejects.toThrow("player names");
  await expect(importSave(JSON.stringify({ name: "x", turn: 1, mode: "sp", playerNames: [] }))).rejects.toThrow("state data");
});

test("importSave rejects invalid blob JSON", async () => {
  const json = JSON.stringify({ name: "x", mode: "sp", turn: 1, playerNames: [], blob: "not json" });
  await expect(importSave(json)).rejects.toThrow("state data is not valid JSON");
});

test("importSave rejects invalid mode", async () => {
  const bad = JSON.stringify({ name: "x", mode: "coop", turn: 1, playerNames: [], blob: "{}" });
  await expect(importSave(bad)).rejects.toThrow("invalid mode");
});

// Minimal in-memory IndexedDB mock so importSave can persist successfully.
let stored: SaveRecord[] = [];

function createMockIndexedDB(): IDBFactory {
  const store = {
    put: (value: SaveRecord) => {
      const req = {
        onsuccess: null as ((this: IDBRequest, ev: Event) => unknown) | null,
        onerror: null as ((this: IDBRequest, ev: Event) => unknown) | null,
      } as IDBRequest;
      stored.push(value);
      queueMicrotask(() => req.onsuccess?.call(req, new Event("success")));
      return req;
    },
  } as unknown as IDBObjectStore;

  const tx = {
    objectStore: () => store,
    oncomplete: null as ((this: IDBTransaction, ev: Event) => unknown) | null,
  } as unknown as IDBTransaction;

  const db = {
    objectStoreNames: {
      contains: () => true,
    },
    createObjectStore: () => store,
    transaction: () => tx,
    close: () => {},
  } as unknown as IDBDatabase;

  return {
    open: () => {
      const req = {
        onsuccess: null as ((this: IDBOpenDBRequest, ev: Event) => unknown) | null,
        onerror: null as ((this: IDBOpenDBRequest, ev: Event) => unknown) | null,
        onupgradeneeded: null as ((this: IDBOpenDBRequest, ev: IDBVersionChangeEvent) => unknown) | null,
        result: db,
      } as IDBOpenDBRequest;
      queueMicrotask(() => req.onsuccess?.call(req, new Event("success")));
      return req;
    },
  } as unknown as IDBFactory;
}

beforeEach(() => {
  stored = [];
  vi.stubGlobal("indexedDB", createMockIndexedDB());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("importSave persists a valid save with a new id", async () => {
  const record = makeRecord({ id: "old_id", name: "Imported Save" });
  const json = exportSave(record);
  const storedRecord = await importSave(json);
  expect(storedRecord.name).toBe("Imported Save");
  expect(storedRecord.mode).toBe("sp");
  expect(storedRecord.turn).toBe(7);
  expect(storedRecord.playerNames).toEqual(["Alice"]);
  expect(storedRecord.id).not.toBe("old_id");
  expect(storedRecord.id.startsWith("save_")).toBe(true);
  expect(stored).toHaveLength(1);
  expect(stored[0]!.id).toBe(storedRecord.id);
});
