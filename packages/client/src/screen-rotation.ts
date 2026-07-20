import { Capacitor } from "@capacitor/core";
import { ScreenOrientation } from "@capacitor/screen-orientation";
import { getSettings, onSettingsChange, type ScreenRotation } from "./settings";

type OrientLock = "portrait" | "landscape";

let pendingGesture = false;
let cssFallbackActive = false;

/** True when layout is rotated via CSS because the browser cannot lock orientation. */
export function usesCssOrientationFallback(): boolean {
  return cssFallbackActive;
}

/** Whether the chosen orientation differs from the current viewport aspect. */
export function layoutViewportMismatch(
  want: ScreenRotation,
  width: number,
  height: number,
): boolean {
  const portrait = height >= width;
  return (want === "landscape" && portrait) || (want === "portrait" && !portrait);
}

/** Swap raw viewport dimensions when CSS orientation fallback is active. */
export function effectiveViewportFromRaw(
  want: ScreenRotation,
  width: number,
  height: number,
  cssFallback: boolean,
): { width: number; height: number } {
  if (!cssFallback || !layoutViewportMismatch(want, width, height)) {
    return { width, height };
  }
  const narrow = Math.min(width, height);
  const wide = Math.max(width, height);
  return want === "landscape"
    ? { width: wide, height: narrow }
    : { width: narrow, height: wide };
}

/** Viewport size for canvas/layout after orientation lock or CSS fallback. */
export function getEffectiveViewportSize(): { width: number; height: number } {
  const vv = window.visualViewport;
  const width = vv?.width ?? window.innerWidth;
  const height = vv?.height ?? window.innerHeight;
  return effectiveViewportFromRaw(getSettings().screenRotation, width, height, cssFallbackActive);
}

/** Canvas sizing with a stale visualViewport guard after device rotation. */
export function getCanvasViewportSize(): { width: number; height: number } {
  const vv = window.visualViewport;
  let rawW = vv?.width ?? window.innerWidth;
  let rawH = vv?.height ?? window.innerHeight;
  let size = effectiveViewportFromRaw(getSettings().screenRotation, rawW, rawH, cssFallbackActive);
  const portrait = window.matchMedia("(orientation: portrait)").matches;
  const landscape = window.matchMedia("(orientation: landscape)").matches;
  if ((portrait && size.width > size.height) || (landscape && size.height > size.width)) {
    rawW = window.innerWidth;
    rawH = window.innerHeight;
    size = effectiveViewportFromRaw(getSettings().screenRotation, rawW, rawH, cssFallbackActive);
  }
  return size;
}

function clearCssOrientationFallback(): void {
  cssFallbackActive = false;
  document.documentElement.classList.remove("roc-want-portrait", "roc-want-landscape");
}

function applyCssOrientationFallback(target: ScreenRotation): void {
  cssFallbackActive = true;
  const root = document.documentElement;
  root.classList.remove("roc-want-portrait", "roc-want-landscape");
  root.classList.add(target === "portrait" ? "roc-want-portrait" : "roc-want-landscape");
}

function notifyOrientationApplied(): void {
  window.dispatchEvent(new Event("roc-orientation-locked"));
  window.dispatchEvent(new Event("resize"));
}

/** Lock the screen to the player's chosen orientation. */
export function applyScreenRotation(mode?: ScreenRotation): void {
  void applyScreenRotationAsync(mode);
}

async function applyScreenRotationAsync(mode?: ScreenRotation): Promise<void> {
  const target: OrientLock = mode ?? getSettings().screenRotation;

  if (Capacitor.isNativePlatform()) {
    try {
      await ScreenOrientation.lock({ orientation: target });
      clearCssOrientationFallback();
      notifyOrientationApplied();
      return;
    } catch {
      // Fall back to the web Screen Orientation API / CSS below.
    }
  }

  const orientation = screen.orientation as ScreenOrientation & {
    lock?: (o: OrientLock) => Promise<void>;
  };
  if (orientation?.lock) {
    try {
      await orientation.lock(target);
      clearCssOrientationFallback();
      notifyOrientationApplied();
      return;
    } catch {
      if (!pendingGesture) {
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
  }

  // iOS Safari and most in-browser mobile shells cannot lock orientation — rotate
  // the page with CSS instead so Horizontal / Vertical settings still work.
  applyCssOrientationFallback(target);
  notifyOrientationApplied();
}

/** Apply the saved rotation preference and re-apply when settings change. */
export function initScreenRotation(): void {
  applyScreenRotation();
  onSettingsChange(() => applyScreenRotation());

  const relayout = (): void => {
    if (!cssFallbackActive) return;
    notifyOrientationApplied();
  };
  window.addEventListener("orientationchange", relayout);
  window.visualViewport?.addEventListener("resize", relayout);

  if (!Capacitor.isNativePlatform()) return;

  // iOS often ignores the first lock before the WebView is ready.
  window.setTimeout(() => applyScreenRotation(), 250);
  window.setTimeout(() => applyScreenRotation(), 1000);

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") applyScreenRotation();
  });
}
