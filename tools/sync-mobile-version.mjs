#!/usr/bin/env node
/**
 * Sync app version from root package.json before a mobile or client build.
 *
 * Single source of truth: package.json "version"
 *
 * Targets:
 * - Android versionName / versionCode (mobile/android/app/build.gradle)
 * - iOS MARKETING_VERSION / CURRENT_PROJECT_VERSION (project.pbxproj)
 * - Lobby + changelog label (packages/client/src/version.ts)
 *
 * Build numbers: 1000 + run*10 + attempt in CI (GITHUB_RUN_* env), else current + 1.
 *
 * Usage:
 *   node tools/sync-mobile-version.mjs
 *   GITHUB_RUN_NUMBER=42 node tools/sync-mobile-version.mjs
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));
const versionName = String(pkg.version ?? "0.0.0").trim();

const gradlePath = join(repoRoot, "mobile/android/app/build.gradle");
const pbxPath = join(repoRoot, "mobile/ios/App/App.xcodeproj/project.pbxproj");
const versionTsPath = join(repoRoot, "packages/client/src/version.ts");

function readBuildNumber() {
  const gradle = readFileSync(gradlePath, "utf8");
  const m = gradle.match(/versionCode\s+(\d+)/);
  const current = m ? Number(m[1]) : 1;
  const fromWorkflow = process.env.MOBILE_BUILD_NUMBER
    ? Number(process.env.MOBILE_BUILD_NUMBER)
    : NaN;
  if (Number.isFinite(fromWorkflow) && fromWorkflow > 0) {
    return Math.max(current + 1, fromWorkflow);
  }
  const run = process.env.GITHUB_RUN_NUMBER ? Number(process.env.GITHUB_RUN_NUMBER) : NaN;
  const attempt = process.env.GITHUB_RUN_ATTEMPT ? Number(process.env.GITHUB_RUN_ATTEMPT) : NaN;
  if (Number.isFinite(run) && run > 0) {
    const ciBuild = 1000 + run * 10 + (Number.isFinite(attempt) && attempt > 0 ? attempt : 1);
    return Math.max(current + 1, ciBuild);
  }
  return current + 1;
}

const buildNumber = readBuildNumber();

let gradle = readFileSync(gradlePath, "utf8");
gradle = gradle.replace(/versionCode\s+\d+/, `versionCode ${buildNumber}`);
gradle = gradle.replace(/versionName\s+"[^"]*"/, `versionName "${versionName}"`);
writeFileSync(gradlePath, gradle);

let pbx = readFileSync(pbxPath, "utf8");
pbx = pbx.replace(/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${versionName};`);
pbx = pbx.replace(/CURRENT_PROJECT_VERSION = [^;]+;/g, `CURRENT_PROJECT_VERSION = ${buildNumber};`);
writeFileSync(pbxPath, pbx);

let versionTs = readFileSync(versionTsPath, "utf8");
versionTs = versionTs.replace(
  /export const CURRENT_VERSION = "[^"]*";/,
  `export const CURRENT_VERSION = "${versionName}";`,
);
writeFileSync(versionTsPath, versionTs);

console.log(`✓ app version ${versionName} (build ${buildNumber}) → Android, iOS, client`);
