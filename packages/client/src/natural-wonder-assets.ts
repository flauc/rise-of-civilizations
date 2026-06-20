/// <reference types="vite/client" />

import { NATURAL_WONDER_IDS } from "@roc/data";

export interface NaturalWonderAtlas {
  readonly images: Record<string, HTMLImageElement | undefined>;
  loaded: boolean;
}

function isReady(img: HTMLImageElement): boolean {
  return img.complete && img.naturalWidth > 0;
}

/** Starts loading every natural-wonder sprite (public/natural-wonders/<id>.png).
 *  Missing art is fine — the overlay falls back to a drawn marker. */
export function loadNaturalWonderAtlas(onLoad?: () => void): NaturalWonderAtlas {
  const images: Record<string, HTMLImageElement | undefined> = {};
  let remaining = NATURAL_WONDER_IDS.length;
  const atlas: NaturalWonderAtlas = { images, loaded: remaining === 0 };
  for (const id of NATURAL_WONDER_IDS) {
    const img = new Image();
    img.src = `${import.meta.env.BASE_URL}natural-wonders/${id}.png`;
    const done = (): void => {
      if (isReady(img)) images[id] = img;
      remaining--;
      if (remaining === 0) atlas.loaded = true;
      onLoad?.();
    };
    img.onload = done;
    img.onerror = done;
  }
  return atlas;
}

/** The loaded sprite for a wonder id, or undefined if it isn't ready. */
export function naturalWonderImage(
  atlas: NaturalWonderAtlas | undefined,
  id: string,
): HTMLImageElement | undefined {
  const img = atlas?.images[id];
  return img && isReady(img) ? img : undefined;
}
