// Dev-friendly JSON persistence for bug reports when Postgres is not wired yet.

import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { BugReportRow, MemoryAnalyticsStore } from "./analytics";

const DEFAULT_PATH = join(dirname(fileURLToPath(import.meta.url)), "../../../.roc-bug-reports.json");

function isBugReportRow(raw: unknown): raw is BugReportRow {
  if (!raw || typeof raw !== "object") return false;
  const r = raw as Partial<BugReportRow>;
  return typeof r.reportId === "string" && typeof r.clientId === "string" && typeof r.message === "string";
}

export async function loadPersistedBugReports(
  store: MemoryAnalyticsStore,
  path = process.env.ROC_BUG_REPORTS_FILE ?? DEFAULT_PATH,
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
    console.warn(`bug report persistence: could not parse ${path}`);
    return 0;
  }
  if (!Array.isArray(parsed)) return 0;
  const rows: BugReportRow[] = [];
  for (const raw of parsed) {
    if (isBugReportRow(raw)) rows.push(raw);
  }
  const count = store.restoreBugReports(rows);
  if (count) console.log(`bug report persistence: loaded ${count} report(s) from ${path}`);
  return count;
}

export async function persistBugReports(
  store: MemoryAnalyticsStore,
  path = process.env.ROC_BUG_REPORTS_FILE ?? DEFAULT_PATH,
): Promise<void> {
  const reports = store.exportBugReports();
  await writeFile(path, JSON.stringify(reports, null, 2), "utf8");
}
