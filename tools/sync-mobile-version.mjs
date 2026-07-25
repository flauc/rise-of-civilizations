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
 * Build numbers: each platform floors on ITS OWN committed number (Android
 * versionCode, iOS CURRENT_PROJECT_VERSION) plus one, then rises to the CI number
 * 1000 + run×10 + attempt. iOS additionally rises to GITHUB_RUN_ID, which survives
 * workflow renames (GITHUB_RUN_NUMBER restarts at 1) but overflows Android's int32
 * versionCode, so the two platforms deliberately diverge.
 *
 * CAVEAT: CI does not commit the bumped numbers back, so after an iOS CI upload the
 * committed CURRENT_PROJECT_VERSION still lags the uploaded CFBundleVersion. Commit
 * the pbxproj that CI produced (or bump it by hand) before running a local sync, or
 * App Store Connect will reject the local build as a duplicate.
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

/** Positive integer from an env var, or 0 when unset/unusable. */
function envNumber(name) {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Committed build number a file currently records, or 0 when it has none. */
function committedBuildNumber(src, pattern) {
  const m = src.match(pattern);
  return m ? Number(m[1]) : 0;
}

function nextBuildNumbers(currentAndroid, currentIos) {
  // Each platform only ever moves forward from the number it last committed.
  const androidFloor = currentAndroid + 1;
  const iosFloor = currentIos + 1;

  const fromWorkflow = envNumber("MOBILE_BUILD_NUMBER");
  if (fromWorkflow > 0) {
    return {
      android: Math.max(androidFloor, fromWorkflow),
      ios: Math.max(iosFloor, fromWorkflow),
    };
  }

  const run = envNumber("GITHUB_RUN_NUMBER");
  if (run > 0) {
    const attempt = envNumber("GITHUB_RUN_ATTEMPT") || 1;
    const ciBuild = 1000 + run * 10 + attempt;
    return {
      android: Math.max(androidFloor, ciBuild),
      // Run id is globally monotonic (a workflow rename restarts run number but not
      // run id) and fits CFBundleVersion, but would overflow int32 versionCode.
      ios: Math.max(iosFloor, ciBuild, envNumber("GITHUB_RUN_ID")),
    };
  }

  return { android: androidFloor, ios: iosFloor };
}

let gradle = readFileSync(gradlePath, "utf8");
let pbx = readFileSync(pbxPath, "utf8");

const { android: androidBuildNumber, ios: iosBuildNumber } = nextBuildNumbers(
  committedBuildNumber(gradle, /versionCode\s+(\d+)/),
  committedBuildNumber(pbx, /CURRENT_PROJECT_VERSION = (\d+);/),
);

if (androidBuildNumber > ANDROID_MAX_VERSION_CODE) {
  throw new Error(
    `Android versionCode ${androidBuildNumber} exceeds the int32 limit ${ANDROID_MAX_VERSION_CODE}. ` +
      "Play will reject the upload; the build-number scheme in this script needs reworking.",
  );
}

gradle = gradle.replace(/versionCode\s+\d+/, `versionCode ${androidBuildNumber}`);
gradle = gradle.replace(/versionName\s+"[^"]*"/, `versionName "${versionName}"`);
writeFileSync(gradlePath, gradle);

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
