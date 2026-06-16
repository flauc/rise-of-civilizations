// Browser-only IndexedDB persistence for save games.
// Single-player saves store the full local GameState. Multiplayer saves store
// the full authoritative state exported by the server host.

import type { SerializedState } from "@roc/sim";

export type SaveMode = "sp" | "mp";

export interface SaveRecord {
  id: string;
  name: string;
  mode: SaveMode;
  createdAt: number;
  turn: number;
  playerNames: string[];
  /** Multiplayer server game id, when this is an mp save. */
  gameId?: string;
  /** JSON string of a SerializedState. */
  blob: string;
}

const DB_NAME = "roc-saves";
const DB_VERSION = 1;
const STORE = "saves";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error ?? new Error("indexedDB open failed"));
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
  });
}

export async function listSaves(): Promise<SaveRecord[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const store = tx.objectStore(STORE);
    const req = store.getAll();
    req.onsuccess = () => {
      const records = (req.result as SaveRecord[]).sort((a, b) => b.createdAt - a.createdAt);
      resolve(records);
    };
    req.onerror = () => reject(req.error ?? new Error("listSaves failed"));
    tx.oncomplete = () => db.close();
  });
}

export async function saveGame(record: SaveRecord): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const req = store.put(record);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error ?? new Error("saveGame failed"));
    tx.oncomplete = () => db.close();
  });
}

export async function loadSave(id: string): Promise<SaveRecord | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const store = tx.objectStore(STORE);
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result as SaveRecord | undefined);
    req.onerror = () => reject(req.error ?? new Error("loadSave failed"));
    tx.oncomplete = () => db.close();
  });
}

export async function deleteSave(id: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error ?? new Error("deleteSave failed"));
    tx.oncomplete = () => db.close();
  });
}

export async function renameSave(id: string, name: string): Promise<void> {
  const record = await loadSave(id);
  if (!record) throw new Error("save not found");
  record.name = name;
  await saveGame(record);
}

/** Serialize a save record to a portable JSON string. */
export function exportSave(record: SaveRecord): string {
  return JSON.stringify(record);
}

/** Validate an imported JSON string and persist it as a new local save. */
export async function importSave(json: string): Promise<SaveRecord> {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new Error("Save file is not valid JSON.");
  }
  if (!raw || typeof raw !== "object") throw new Error("Save file is not a valid object.");
  const rec = raw as Partial<SaveRecord>;
  if (typeof rec.name !== "string" || !rec.name.trim()) throw new Error("Save file is missing a name.");
  if (rec.mode !== "sp" && rec.mode !== "mp") throw new Error("Save file has an invalid mode.");
  if (typeof rec.turn !== "number") throw new Error("Save file is missing turn number.");
  if (!Array.isArray(rec.playerNames)) throw new Error("Save file is missing player names.");
  if (typeof rec.blob !== "string") throw new Error("Save file is missing state data.");
  try {
    JSON.parse(rec.blob);
  } catch {
    throw new Error("Save file state data is not valid JSON.");
  }

  const stored: SaveRecord = {
    id: `save_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name: rec.name.trim(),
    mode: rec.mode,
    createdAt: typeof rec.createdAt === "number" ? rec.createdAt : Date.now(),
    turn: rec.turn,
    playerNames: rec.playerNames,
    gameId: typeof rec.gameId === "string" ? rec.gameId : undefined,
    blob: rec.blob,
  };
  await saveGame(stored);
  return stored;
}

/** Build a short default name from the current game metadata. */
export function defaultSaveName(mode: SaveMode, turn: number, playerNames: string[]): string {
  const date = new Date().toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const prefix = mode === "sp" ? "SP" : "MP";
  return `${prefix} Turn ${turn} — ${playerNames.join(", ")} (${date})`;
}

/** Serialize a full state and wrap it as a SaveRecord. */
export function makeSaveRecord(
  mode: SaveMode,
  state: SerializedState,
  opts: { name?: string; gameId?: string } = {},
): SaveRecord {
  const id = `save_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const playerNames = state.players.map((p) => p.name);
  return {
    id,
    name: opts.name ?? defaultSaveName(mode, state.turn, playerNames),
    mode,
    createdAt: Date.now(),
    turn: state.turn,
    playerNames,
    gameId: opts.gameId,
    blob: JSON.stringify(state),
  };
}
