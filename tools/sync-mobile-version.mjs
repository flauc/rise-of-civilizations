#!/usr/bin/env node
/**
 * Sync native app versions before a store build.
 *
 * - versionName / MARKETING_VERSION ← root package.json "version"
 * - versionCode / CURRENT_PROJECT_VERSION ← 1000 + GITHUB_RUN_NUMBER + (attempt - 1) in CI
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

function readBuildNumber() {
  const gradle = readFileSync(gradlePath, "utf8");
  const m = gradle.match(/versionCode\s+(\d+)/);
  const current = m ? Number(m[1]) : 1;
  const fromCi = process.env.GITHUB_RUN_NUMBER
    ? Number(process.env.GITHUB_RUN_NUMBER)
    : NaN;
  const attempt = process.env.GITHUB_RUN_ATTEMPT
    ? Number(process.env.GITHUB_RUN_ATTEMPT)
    : 1;
  if (Number.isFinite(fromCi) && fromCi > 0) {
    // 1000+run_number keeps CI builds above local uploads; +attempt on re-runs avoids duplicate CFBundleVersion.
    const ciBuild = 1000 + fromCi + Math.max(0, (Number.isFinite(attempt) ? attempt : 1) - 1);
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

console.log(`✓ mobile versions → ${versionName} (${buildNumber})`);
