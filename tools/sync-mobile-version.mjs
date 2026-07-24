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
 * Build numbers: in CI, Android uses max(repo + 1, 1000 + run×10 + attempt) capped at
 * 2_147_483_647. iOS also considers GITHUB_RUN_ID so App Store Connect never sees a
 * duplicate CFBundleVersion when repo-stored numbers lag.
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

const ANDROID_MAX_VERSION_CODE = 2_147_483_647;

function readBuildNumbers(current) {
  const fromWorkflow = process.env.MOBILE_BUILD_NUMBER
    ? Number(process.env.MOBILE_BUILD_NUMBER)
    : NaN;
  if (Number.isFinite(fromWorkflow) && fromWorkflow > 0) {
    const next = Math.max(current + 1, fromWorkflow);
    return {
      android: Math.min(next, ANDROID_MAX_VERSION_CODE),
      ios: next,
    };
  }
  const run = process.env.GITHUB_RUN_NUMBER ? Number(process.env.GITHUB_RUN_NUMBER) : NaN;
  const attempt = process.env.GITHUB_RUN_ATTEMPT ? Number(process.env.GITHUB_RUN_ATTEMPT) : NaN;
  const runId = process.env.GITHUB_RUN_ID ? Number(process.env.GITHUB_RUN_ID) : NaN;
  if (Number.isFinite(run) && run > 0) {
    const attemptN = Number.isFinite(attempt) && attempt > 0 ? attempt : 1;
    const ciBuild = 1000 + run * 10 + attemptN;
    let android = Math.max(current + 1, ciBuild);
    let ios = android;
    // Run id fits iOS CFBundleVersion but overflows Android versionCode (int32 max).
    if (Number.isFinite(runId) && runId > 0) {
      ios = Math.max(ios, runId);
    }
    android = Math.min(android, ANDROID_MAX_VERSION_CODE);
    return { android, ios };
  }
  const next = current + 1;
  return { android: Math.min(next, ANDROID_MAX_VERSION_CODE), ios: next };
}

const { android: androidBuildNumber, ios: iosBuildNumber } = readBuildNumbers(
  (() => {
    const gradle = readFileSync(gradlePath, "utf8");
    const m = gradle.match(/versionCode\s+(\d+)/);
    return m ? Number(m[1]) : 1;
  })(),
);

let gradle = readFileSync(gradlePath, "utf8");
gradle = gradle.replace(/versionCode\s+\d+/, `versionCode ${androidBuildNumber}`);
gradle = gradle.replace(/versionName\s+"[^"]*"/, `versionName "${versionName}"`);
writeFileSync(gradlePath, gradle);

let pbx = readFileSync(pbxPath, "utf8");
pbx = pbx.replace(/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${versionName};`);
pbx = pbx.replace(/CURRENT_PROJECT_VERSION = [^;]+;/g, `CURRENT_PROJECT_VERSION = ${iosBuildNumber};`);
writeFileSync(pbxPath, pbx);

let versionTs = readFileSync(versionTsPath, "utf8");
versionTs = versionTs.replace(
  /export const CURRENT_VERSION = "[^"]*";/,
  `export const CURRENT_VERSION = "${versionName}";`,
);
writeFileSync(versionTsPath, versionTs);

console.log(
  `✓ app version ${versionName} (Android build ${androidBuildNumber}, iOS build ${iosBuildNumber}) → Android, iOS, client`,
);
