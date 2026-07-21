import { getSettings, updateSettings, type ScreenRotation } from "./settings";
import { isPhoneShell } from "./viewport-shell";

/** Show orientation controls on phones, tablets, and the native app shell. */
export function shouldOfferScreenRotation(): boolean {
  return isPhoneShell();
}

/** Segmented Vertical / Horizontal control markup. */
export function screenRotationControlsHtml(options?: { showLabel?: boolean }): string {
  const rotation = getSettings().screenRotation;
  const label =
    options?.showLabel === false
      ? ""
      : `<div class="rotation-controls-label">Screen orientation</div>`;
  return (
    `<div class="rotation-controls">` +
    label +
    `<div class="rotation-seg">` +
    `<button type="button" class="rotation-seg-btn${rotation === "portrait" ? " active" : ""}" data-rotation="portrait">Vertical</button>` +
    `<button type="button" class="rotation-seg-btn${rotation === "landscape" ? " active" : ""}" data-rotation="landscape">Horizontal</button>` +
    `</div></div>`
  );
}

/** Wire rotation buttons inside `root`; optional callback after the choice is saved. */
export function bindScreenRotationControls(root: ParentNode, onChange?: () => void): void {
  root.querySelectorAll<HTMLButtonElement>("[data-rotation]").forEach((el) => {
    el.addEventListener("click", () => {
      const mode = el.dataset.rotation as ScreenRotation | undefined;
      if (mode !== "portrait" && mode !== "landscape") return;
      updateSettings({ screenRotation: mode });
      root.querySelectorAll<HTMLButtonElement>("[data-rotation]").forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.rotation === mode);
      });
      onChange?.();
    });
  });
}

/** Shared styles for lobby + in-game settings rotation controls. */
export const SCREEN_ROTATION_STYLES = `
.rotation-controls{margin-top:14px}
.rotation-controls-label{font-size:12px;color:#b8aa8d;margin-bottom:8px}
.rotation-seg{display:flex;border:1px solid var(--edge);border-radius:999px;overflow:hidden}
.rotation-seg-btn{flex:1;font:inherit;font-size:13px;font-weight:700;padding:9px 12px;border:none;background:transparent;color:#b8aa8d;cursor:pointer;transition:background .12s,color .12s}
.rotation-seg-btn+.rotation-seg-btn{border-left:1px solid var(--edge)}
.rotation-seg-btn.active{background:linear-gradient(135deg,#c9a227,#a6821f);color:#15120c}
`;
