import { Capacitor } from "@capacitor/core";
import { ScreenOrientation } from "@capacitor/screen-orientation";
import { getSettings, onSettingsChange, type ScreenRotation } from "./settings";

type OrientLock = "portrait" | "landscape";

let pendingGesture = false;

/** Lock the screen to the player's chosen orientation. */
export function applyScreenRotation(mode?: ScreenRotation): void {
  void applyScreenRotationAsync(mode);
}

async function applyScreenRotationAsync(mode?: ScreenRotation): Promise<void> {
  const target: OrientLock = mode ?? getSettings().screenRotation;

  if (Capacitor.isNativePlatform()) {
    try {
      await ScreenOrientation.lock({ orientation: target });
      window.dispatchEvent(new Event("roc-orientation-locked"));
      return;
    } catch {
      // Fall back to the web Screen Orientation API below.
    }
  }

  const orientation = screen.orientation as ScreenOrientation & {
    lock?: (o: OrientLock) => Promise<void>;
  };
  if (!orientation?.lock) return;

  try {
    await orientation.lock(target);
  } catch {
    if (pendingGesture) return;
    pendingGesture = true;
    window.addEventListener(
      "pointerdown",
      () => {
        pendingGesture = false;
        void applyScreenRotationAsync(mode);
      },
      { once: true },
    );
  } finally {
    window.dispatchEvent(new Event("roc-orientation-locked"));
  }
}

/** Apply the saved rotation preference and re-apply when settings change. */
export function initScreenRotation(): void {
  applyScreenRotation();
  onSettingsChange(() => applyScreenRotation());

  if (!Capacitor.isNativePlatform()) return;

  // iOS often ignores the first lock before the WebView is ready.
  window.setTimeout(() => applyScreenRotation(), 250);
  window.setTimeout(() => applyScreenRotation(), 1000);

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") applyScreenRotation();
  });
}
