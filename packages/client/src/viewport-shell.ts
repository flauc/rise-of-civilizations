// Shared phone-class viewport detection — one shell for every handset (iOS, Android,
// mobile browser, installed PWA). Uses the device short edge, not a fixed width like
// 860px, so Pro Max landscape and small Android phones get the same layout rules.

import { Capacitor } from "@capacitor/core";

/** Max short-edge (px) for phone layout — covers SE through Pro Max / large Android. */
export const PHONE_SHORT_EDGE_PX = 540;

/** Max long-edge (px) when coarse pointer is unavailable (e.g. DevTools device mode). */
export const PHONE_LONG_EDGE_PX = 960;

function isStandaloneDisplayLocal(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function phoneViewportEdges(): { short: number; long: number } {
  const w = window.innerWidth;
  const h = window.innerHeight;
  return { short: Math.min(w, h), long: Math.max(w, h) };
}

/** Mirror of boot inline script in index.html — keep constants in sync. */
export function bootDetectPhoneShell(width: number, height: number, coarsePointer: boolean): boolean {
  const short = Math.min(width, height);
  const long = Math.max(width, height);
  if (short <= PHONE_SHORT_EDGE_PX && coarsePointer) return true;
  if (short <= PHONE_SHORT_EDGE_PX && long <= PHONE_LONG_EDGE_PX) return true;
  return false;
}

/** True for native app, home-screen PWA, and phone-class mobile browsers. */
export function isPhoneShell(): boolean {
  if (typeof window === "undefined") return false;
  if (Capacitor.isNativePlatform()) return true;
  if (isStandaloneDisplayLocal()) return true;
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const { short, long } = phoneViewportEdges();
  if (short <= PHONE_SHORT_EDGE_PX && coarse) return true;
  if (short <= PHONE_SHORT_EDGE_PX && long <= PHONE_LONG_EDGE_PX) return true;
  return false;
}

export function syncPhoneShellClass(): void {
  const on = isPhoneShell();
  document.documentElement.classList.toggle("roc-phone-shell", on);
  document.body.classList.toggle("roc-phone-shell", on);
}

/** Re-evaluate on resize / rotation so emulators and foldables stay consistent. */
export function initPhoneShellSync(): void {
  syncPhoneShellClass();
  const run = (): void => syncPhoneShellClass();
  window.addEventListener("resize", run);
  window.addEventListener("orientationchange", run);
  window.visualViewport?.addEventListener("resize", run);
}
