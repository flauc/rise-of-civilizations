/** Scroll roots commonly used by in-game panels and dialogs. */
const SCROLL_SELECTORS = [
  ".panel-dialog-body",
  ".emp-body",
  ".dp-body",
  ".log-dialog-content",
  "#gold-dialog-content",
  "#morale-dialog-content",
  ".ip-detail",
  "#turn-update-compact",
  "#settings-dialog",
  "#game-chat-log",
  "#save-modal",
] as const;

/** Capture scroll offsets under `root` (and on `root` itself) before DOM rebuilds. */
export function captureScrollPositions(
  root: HTMLElement,
  selectors: readonly string[] = SCROLL_SELECTORS,
): Map<string, number> {
  const tops = new Map<string, number>();
  tops.set(":root", root.scrollTop);
  for (const sel of selectors) {
    root.querySelectorAll<HTMLElement>(sel).forEach((el, i) => {
      tops.set(`${sel}:${i}`, el.scrollTop);
    });
  }
  return tops;
}

export function restoreScrollPositions(
  root: HTMLElement,
  tops: Map<string, number>,
  selectors: readonly string[] = SCROLL_SELECTORS,
): void {
  const rootTop = tops.get(":root");
  if (rootTop !== undefined) root.scrollTop = rootTop;
  for (const sel of selectors) {
    root.querySelectorAll<HTMLElement>(sel).forEach((el, i) => {
      const top = tops.get(`${sel}:${i}`);
      if (top !== undefined) el.scrollTop = top;
    });
  }
}

/** Run a DOM rebuild (usually `innerHTML = …`) without jumping scroll back to the top. */
export function withPreservedScroll(
  root: HTMLElement,
  update: () => void,
  selectors: readonly string[] = SCROLL_SELECTORS,
): void {
  const tops = captureScrollPositions(root, selectors);
  update();
  restoreScrollPositions(root, tops, selectors);
}

export function setPreservedHtml(root: HTMLElement, html: string): void {
  withPreservedScroll(root, () => {
    root.innerHTML = html;
  });
}
