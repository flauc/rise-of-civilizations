// Swapping the art in a reused <img> without flashing the previous picture.
//
// The announcement dialogs keep one <img> and re-point it per event. Assigning
// .src does not blank the element: the browser keeps painting the old decoded
// frame until the new file arrives, so two announcements in a row (a village
// discovered, then a camp cleared) show the wrong art for a beat.

/** Hides the pixels but keeps the box, so the dialog cannot resize mid-swap. */
const PENDING_CLASS = "art-pending";
/** Removes the element from layout entirely (display:none). */
const HIDDEN_CLASS = "hidden";

/** Supersedes in-flight swaps per element, so only the newest one paints. */
const tokens = new WeakMap<HTMLImageElement, number>();

function claim(img: HTMLImageElement): number {
  const token = (tokens.get(img) ?? 0) + 1;
  tokens.set(img, token);
  return token;
}

/**
 * Point `img` at the first of `candidates` that decodes, showing nothing until
 * it does. Costs nothing on a warm cache and removes the stale-art flash on a
 * cold one. If no candidate decodes, the element is hidden outright.
 *
 * Later calls supersede earlier ones, so an announcement the player clicks past
 * mid-load never paints over the one they are now looking at.
 */
export function swapArt(img: HTMLImageElement, candidates: readonly string[]): void {
  const token = claim(img);
  img.classList.remove(HIDDEN_CLASS);
  img.classList.add(PENDING_CLASS);

  void (async () => {
    for (const src of candidates) {
      if (tokens.get(img) !== token) return;
      img.src = src;
      try {
        await img.decode();
      } catch {
        // Missing art, or a decode aborted by a newer src. Either way the next
        // candidate (or the token check above) is the right thing to do next.
        continue;
      }
      if (tokens.get(img) !== token) return;
      img.classList.remove(PENDING_CLASS);
      return;
    }
    if (tokens.get(img) !== token) return;
    img.classList.remove(PENDING_CLASS);
    img.classList.add(HIDDEN_CLASS);
  })();
}

/** Blank a reused <img> for an item that has no art, cancelling any swap in flight. */
export function clearArt(img: HTMLImageElement): void {
  claim(img);
  img.classList.remove(PENDING_CLASS);
  img.classList.add(HIDDEN_CLASS);
}
