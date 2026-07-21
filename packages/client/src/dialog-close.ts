/** Reliable close on desktop and mobile WebKit (click alone can miss the ✕). */
export function bindDialogClose(btn: HTMLButtonElement, close: () => void): void {
  let lastCloseAt = 0;
  const run = (e: Event): void => {
    e.preventDefault();
    e.stopPropagation();
    const now = performance.now();
    if (now - lastCloseAt < 400) return;
    lastCloseAt = now;
    close();
  };
  btn.addEventListener("pointerdown", run, { capture: true });
  btn.addEventListener("click", run);
}
