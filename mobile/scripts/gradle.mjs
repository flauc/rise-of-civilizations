import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const androidDir = join(fileURLToPath(new URL("..", import.meta.url)), "android");
const localProperties = join(androidDir, "local.properties");
const isWin = process.platform === "win32";
const gradle = isWin ? "gradlew.bat" : "./gradlew";

function resolveJavaHome() {
  if (process.env.JAVA_HOME) return process.env.JAVA_HOME;

  const candidates =
    process.platform === "darwin"
      ? [
          "/Applications/Android Studio.app/Contents/jbr/Contents/Home",
          "/Applications/Android Studio.app/Contents/jbr",
        ]
      : process.platform === "win32"
        ? [
            `${process.env.LOCALAPPDATA ?? ""}/Programs/Android/Android Studio/jbr`,
            `${process.env.ProgramFiles ?? ""}/Android/Android Studio/jbr`,
          ]
        : [
            `${process.env.HOME ?? ""}/android-studio/jbr`,
            "/opt/android-studio/jbr",
          ];

  return candidates.find((dir) => existsSync(join(dir, "bin", isWin ? "java.exe" : "java")));
}

function resolveAndroidSdk() {
  const fromEnv = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT;
  if (fromEnv && existsSync(fromEnv)) return fromEnv;

  const candidates =
    process.platform === "win32"
      ? [
          `${process.env.LOCALAPPDATA ?? ""}/Android/Sdk`,
          `${process.env.USERPROFILE ?? ""}/AppData/Local/Android/Sdk`,
        ]
      : [join(homedir(), "Library/Android/sdk"), join(homedir(), "Android/Sdk")];

  return candidates.find((dir) => existsSync(dir));
}

function ensureLocalProperties() {
  if (existsSync(localProperties)) {
    const text = readFileSync(localProperties, "utf8");
    if (/^\s*sdk\.dir\s*=/m.test(text)) return;
  }

  const sdkDir = resolveAndroidSdk();
  if (!sdkDir) {
    console.error(
      "Android SDK not found. Set ANDROID_HOME or open the project once in Android Studio.",
    );
    process.exit(1);
  }

  const escaped = isWin ? sdkDir.replace(/\\/g, "\\\\") : sdkDir;
  writeFileSync(localProperties, `sdk.dir=${escaped}\n`, "utf8");
}

if (!isWin && existsSync(join(androidDir, "gradlew"))) {
  try {
    chmodSync(join(androidDir, "gradlew"), 0o755);
  } catch {
    // ignore — may already be executable
  }
}

ensureLocalProperties();

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("usage: node scripts/gradle.mjs <gradle-task> [...]");
  process.exit(1);
}

const javaHome = resolveJavaHome();
const env = javaHome ? { ...process.env, JAVA_HOME: javaHome } : process.env;

const result = spawnSync(gradle, args, {
  cwd: androidDir,
  stdio: "inherit",
  shell: isWin,
  env,
});

process.exit(result.status ?? 1);
