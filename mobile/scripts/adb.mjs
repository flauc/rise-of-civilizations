// Run adb with SDK path resolution (platform-tools is often not on PATH).
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const isWin = process.platform === "win32";
const androidDir = join(fileURLToPath(new URL("..", import.meta.url)), "android");
const localProperties = join(androidDir, "local.properties");

function sdkFromLocalProperties() {
  if (!existsSync(localProperties)) return undefined;
  const m = readFileSync(localProperties, "utf8").match(/^\s*sdk\.dir\s*=\s*(.+)\s*$/m);
  if (!m?.[1]) return undefined;
  return m[1].trim().replace(/\\\\/g, "\\");
}

function resolveAndroidSdk() {
  const fromEnv = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT;
  if (fromEnv && existsSync(fromEnv)) return fromEnv;
  const fromLocal = sdkFromLocalProperties();
  if (fromLocal && existsSync(fromLocal)) return fromLocal;
  const candidates =
    process.platform === "win32"
      ? [
          `${process.env.LOCALAPPDATA ?? ""}/Android/Sdk`,
          `${process.env.USERPROFILE ?? ""}/AppData/Local/Android/Sdk`,
        ]
      : [join(homedir(), "Library/Android/sdk"), join(homedir(), "Android/Sdk")];
  return candidates.find((dir) => existsSync(dir));
}

function resolveAdb() {
  const fromPath = spawnSync(isWin ? "where" : "which", ["adb"], { encoding: "utf8" });
  if (fromPath.status === 0) {
    const line = fromPath.stdout.trim().split(/\r?\n/)[0]?.trim();
    if (line) return line;
  }
  const sdk = resolveAndroidSdk();
  if (!sdk) return null;
  const adb = join(sdk, "platform-tools", isWin ? "adb.exe" : "adb");
  return existsSync(adb) ? adb : null;
}

const adb = resolveAdb();
if (!adb) {
  console.error(
    "adb not found. Install Android SDK Platform-Tools in Android Studio, or add platform-tools to PATH:",
  );
  console.error("  export PATH=\"$HOME/Library/Android/sdk/platform-tools:$PATH\"");
  process.exit(1);
}

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("Usage: node scripts/adb.mjs <adb-args…>");
  process.exit(1);
}

const result = spawnSync(adb, args, { stdio: "inherit" });
process.exit(result.status ?? 1);
