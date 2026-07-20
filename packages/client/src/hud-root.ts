/** Root container for in-game DOM overlays (panels, modals, buttons). Canvas stays outside. */
let root: HTMLDivElement | null = null;

/** Full-screen HUD sheets that must sit above the map and top bar on native WebKit. */
let hudOverlayDepth = 0;

export function initGameHud(): HTMLDivElement {
  if (root) return root;
  root = document.createElement("div");
  root.id = "game-hud";
  document.body.appendChild(root);
  return root;
}

export function gameHud(): HTMLElement {
  return root ?? document.body;
}

function syncHudOverlayClass(): void {
  document.body.classList.toggle("roc-hud-sheet-open", hudOverlayDepth > 0);
}

/** Clear stacked overlay depth (e.g. after a sheet failed to close cleanly). */
export function resetHudOverlays(): void {
  hudOverlayDepth = 0;
  syncHudOverlayClass();
}

/** Mark a full-screen in-game overlay as open (diplomacy, empire, game menu, …). */
export function pushHudOverlay(): void {
  hudOverlayDepth += 1;
  syncHudOverlayClass();
}

/** Mark a full-screen in-game overlay as closed. */
export function popHudOverlay(): void {
  hudOverlayDepth = Math.max(0, hudOverlayDepth - 1);
  syncHudOverlayClass();
}
