// Deep-link routes (/support, /privacy, …) for the single-page client.

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

let lobbyHidden = false;

/** Hide the pre-game lobby while a full-screen overlay (support, legal, settings) is open. */
export function setLobbyHidden(hidden: boolean): void {
  lobbyHidden = hidden;
  document.getElementById("lobby")?.classList.toggle("hidden", hidden);
}

export function isLobbyHidden(): boolean {
  return lobbyHidden;
}
