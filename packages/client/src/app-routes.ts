// Deep-link routes (/support, /privacy, …) for the single-page client.

import { Capacitor } from "@capacitor/core";
import type { LegalPage } from "./legal-viewer";
import { legalPageFromLocation } from "./legal-viewer";
import { supportPageFromLocation } from "./support-page";

export type AppOverlayRoute = LegalPage | "support";

declare global {
  interface Window {
    /** Set synchronously from index.html before the module bundle loads. */
    __ROC_BOOT_ROUTE__?: AppOverlayRoute | null;
  }
}

/** True in the Capacitor iOS/Android shell (not the browser). */
export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

/** Resolve which overlay to open on first load (direct URL or ?page=). */
export function initialOverlayRoute(loc: Pick<Location, "pathname" | "search"> = location): AppOverlayRoute | null {
  const boot = window.__ROC_BOOT_ROUTE__;
  if (boot === "support" || boot === "privacy" || boot === "terms" || boot === "delete-account") {
    return boot;
  }
  const legal = legalPageFromLocation(loc);
  if (legal) return legal;
  if (supportPageFromLocation(loc)) return "support";
  return null;
}

/** In the native app, overlay paths persist in the WebView and would reopen on every launch. */
export function consumeNativeBootRoute(route: AppOverlayRoute | null): AppOverlayRoute | null {
  if (!route || !isNativeApp()) return route;
  const path = locPath(location.pathname);
  if (path && path !== "index.html") {
    history.replaceState(null, "", "/");
  }
  return null;
}

/** Persist an overlay URL in the browser; keep the native shell on / so cold starts land on home. */
export function persistOverlayPath(path: string): void {
  if (isNativeApp()) return;
  if (location.pathname !== path) {
    history.replaceState(null, "", path);
  }
}

export function clearOverlayPathIfNeeded(): void {
  if (isNativeApp()) return;
  if (location.pathname !== "/") {
    history.replaceState(null, "", "/");
  }
}

function locPath(pathname: string): string {
  return pathname.replace(/\/$/, "").toLowerCase().split("/").pop() ?? "";
}

let lobbyHidden = false;

/** Hide the pre-game lobby while a full-screen overlay (support, legal, settings) is open. */
export function setLobbyHidden(hidden: boolean): void {
  lobbyHidden = hidden;
  document.getElementById("lobby")?.classList.toggle("hidden", hidden);
}

export function isLobbyHidden(): boolean {
  return lobbyHidden;
}
