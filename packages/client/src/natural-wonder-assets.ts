/// <reference types="vite/client" />

import { ASSET_BASE_URL } from "./asset-base";
import { NATURAL_WONDER_IDS } from "@roc/data";

export interface NaturalWonderAtlas {
  readonly images: Record<string, HTMLImageElement | undefined>;
  loaded: boolean;
}

function isReady(img: HTMLImageElement): boolean {
  return img.complete && img.naturalWidth > 0;
}

/** Starts loading every natural-wonder full-tile sprite
 *  (public/natural-wonders/<id>.png). Each is a 256×384 hex tile, like terrain,
 *  drawn by the renderer in place of the underlying terrain. Missing art is fine
 *  — the tile then falls back to its terrain and a name label. */
export function loadNaturalWonderAtlas(onLoad?: () => void): NaturalWonderAtlas {
  const images: Record<string, HTMLImageElement | undefined> = {};
  let remaining = NATURAL_WONDER_IDS.length;
  const atlas: NaturalWonderAtlas = { images, loaded: remaining === 0 };
  for (const id of NATURAL_WONDER_IDS) {
    const img = new Image();
    img.src = `${ASSET_BASE_URL}natural-wonders/${id}.png`;
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

/** The loaded full-tile sprite for a wonder id, or undefined if not ready. */
export function naturalWonderTileImage(
  atlas: NaturalWonderAtlas | undefined,
  id: string,
): HTMLImageElement | undefined {
  const img = atlas?.images[id];
  return img && isReady(img) ? img : undefined;
}
