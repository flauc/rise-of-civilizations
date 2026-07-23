/** Universal ✕ markup — glyph comes from `.dialog-x::after` in index.html. */
export function dialogCloseButton(id: string): string {
  return `<button type="button" class="dialog-x" id="${id}" title="Close" aria-label="Close"></button>`;
}

/** Title row + in-flow ✕ (Treasury, Game Menu, God Mode, Choose Research, …). */
export function dialogHeader(
  title: string,
  closeId: string,
  opts?: {
    subtitle?: string;
    titleId?: string;
    headBtn?: string;
    extra?: string;
  },
): string {
  const titleAttr = opts?.titleId ? ` id="${opts.titleId}"` : "";
  const headerClass = opts?.headBtn
    ? "roc-dialog-head panel-dialog-header roc-dialog-head--toolbar"
    : "roc-dialog-head panel-dialog-header";
  return (
    `<div class="${headerClass}">` +
    `<div class="roc-dialog-head-title">` +
    `<b${titleAttr}>${title}</b>` +
    (opts?.subtitle ? `<div class="sub" style="margin-top:4px">${opts.subtitle}</div>` : "") +
    `</div>` +
    `<div class="roc-dialog-head-actions">` +
    (opts?.headBtn ?? "") +
    dialogCloseButton(closeId) +
    `</div>` +
    `</div>` +
    (opts?.extra ?? "")
  );
}

/** Same close wiring as Empire Morale (#morale-close): direct click on the ✕ button. */
export function bindDialogClose(btn: HTMLButtonElement, close: () => void): void {
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    close();
  });
}

/** Stable panels wired once at init (Empire Morale, game menu, research, …). */
export function wirePanelClose(btn: HTMLButtonElement, close: () => void): void {
  bindDialogClose(btn, close);
}
