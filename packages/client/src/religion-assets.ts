/// <reference types="vite/client" />
import { ASSET_BASE_URL } from "./asset-base";
import { RELIGIONS } from "@roc/data";

/** Per-religion emblem atlas, keyed by religion def id (e.g. "christianity"). */
export interface ReligionIconAtlas {
  readonly images: Readonly<Record<string, HTMLImageElement | undefined>>;
  /** True once every religion emblem has finished loading or errored. */
  loaded: boolean;
}

function imageUrl(id: string): string {
  return `${ASSET_BASE_URL}religion-icons/${id}.png`;
}

/** Returns true when an image has finished loading and has usable pixels. */
export function isImageReady(img: HTMLImageElement): boolean {
  return img.complete && img.naturalWidth > 0;
}

/**
 * Starts loading religion emblem icons. The returned atlas can be passed to the
 * overlay immediately; a city's religion badge simply falls back to no icon until
 * its emblem loads. `onLoad` fires each time a sprite loads or errors.
 */
export function loadReligionIconAtlas(onLoad?: () => void): ReligionIconAtlas {
  const images: Record<string, HTMLImageElement | undefined> = {};
  let remaining = RELIGIONS.length;

  const done = (): void => {
    remaining--;
    if (remaining === 0) (atlas as { loaded: boolean }).loaded = true;
    onLoad?.();
  };

  for (const r of RELIGIONS) {
    const img = new Image();
    img.src = imageUrl(r.id);
    img.onload = (): void => {
      if (isImageReady(img)) images[r.id] = img;
      done();
    };
    img.onerror = done;
  }

  const atlas: ReligionIconAtlas = { images, loaded: remaining === 0 };
  return atlas;
}
