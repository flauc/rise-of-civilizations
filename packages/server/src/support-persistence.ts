import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { SupportInquiryRecord } from "@roc/shared";
import type { SupportStore } from "./support";

const DEFAULT_PATH = join(dirname(fileURLToPath(import.meta.url)), "../../../.roc-support-inquiries.json");

function isRecord(raw: unknown): raw is SupportInquiryRecord {
  if (!raw || typeof raw !== "object") return false;
  const r = raw as Partial<SupportInquiryRecord>;
  return (
    typeof r.id === "string" &&
    typeof r.type === "string" &&
    typeof r.email === "string" &&
    typeof r.message === "string" &&
    typeof r.createdAt === "number"
  );
}

export async function loadPersistedSupportInquiries(
  store: SupportStore,
  path = process.env.ROC_SUPPORT_FILE ?? DEFAULT_PATH,
): Promise<number> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch {
    return 0;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    console.warn(`support persistence: could not parse ${path}`);
    return 0;
  }
  if (!Array.isArray(parsed)) return 0;
  const rows: SupportInquiryRecord[] = [];
  for (const raw of parsed) {
    if (isRecord(raw)) rows.push(raw);
  }
  const count = store.restore(rows);
  if (count) console.log(`support persistence: loaded ${count} inquiry(ies) from ${path}`);
  return count;
}

export async function persistSupportInquiries(
  store: SupportStore,
  path = process.env.ROC_SUPPORT_FILE ?? DEFAULT_PATH,
): Promise<void> {
  const rows = store.exportAll();
  await writeFile(path, JSON.stringify(rows, null, 2), "utf8");
}
