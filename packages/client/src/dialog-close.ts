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
