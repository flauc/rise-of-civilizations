/** Same close wiring as Train Units (#trclose): direct click on the ✕ button. */
export function bindDialogClose(btn: HTMLButtonElement, close: () => void): void {
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    close();
  });
}

/** Re-bind after innerHTML rebuild (city sub-dialogs re-render each open). */
export function wirePanelClose(btn: HTMLButtonElement, close: () => void): void {
  btn.onclick = (e) => {
    e.stopPropagation();
    close();
  };
}
