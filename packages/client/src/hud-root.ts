/** Root container for in-game DOM overlays (panels, modals, buttons). Canvas stays outside. */
let root: HTMLDivElement | null = null;

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
