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
  }
}

/** Apply the saved rotation preference and re-apply when settings change. */
export function initScreenRotation(): void {
  applyScreenRotation();
  onSettingsChange(() => applyScreenRotation());
}
