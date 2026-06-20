/// <reference types="vite/client" />

import { WONDER_IDS } from "@roc/data";

export interface WonderAtlas {
  readonly images: Record<string, HTMLImageElement | undefined>;
  loaded: boolean;
}

function isReady(img: HTMLImageElement): boolean {
  return img.complete && img.naturalWidth > 0;
}

/** Starts loading every built-wonder decor sprite (public/wonders/<id>.png).
 *  Each is a 256×384 hex-tile-shaped PNG with a transparent background, drawn by
 *  the renderer as a decor overlay ON TOP of the tile's terrain. Missing art is
 *  fine — the tile then just shows its terrain (the wonder still exists in sim). */
export function loadWonderAtlas(onLoad?: () => void): WonderAtlas {
  const images: Record<string, HTMLImageElement | undefined> = {};
  let remaining = WONDER_IDS.length;
  const atlas: WonderAtlas = { images, loaded: remaining === 0 };
  for (const id of WONDER_IDS) {
    const img = new Image();
    img.src = `${import.meta.env.BASE_URL}wonders/${id}.png`;
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

/** The loaded decor sprite for a wonder id, or undefined if not ready. */
export function wonderTileImage(
  atlas: WonderAtlas | undefined,
  id: string,
): HTMLImageElement | undefined {
  const img = atlas?.images[id];
  return img && isReady(img) ? img : undefined;
}
