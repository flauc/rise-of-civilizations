/// <reference types="vite/client" />
import { ASSET_BASE_URL } from "./asset-base";
import { CIVILIZATIONS } from "@roc/sim";

/** Per-civilization leader portrait atlas used by the Start Screen. */
export interface LeaderAtlas {
  readonly images: Readonly<Record<string, HTMLImageElement | undefined>>;
  /** True once every requested portrait has finished loading or errored. */
  loaded: boolean;
}

function imageUrl(civId: string): string {
  return `${ASSET_BASE_URL}leaders/${civId}.png`;
}

/** Returns true when an image has finished loading and has usable pixels. */
export function isImageReady(img: HTMLImageElement): boolean {
  return img.complete && img.naturalWidth > 0;
}

/**
 * Starts loading leader portrait images.
 *
 * The returned atlas can be used immediately; missing portraits are left as
 * `undefined` so the UI can fall back to a placeholder. `onLoad` is invoked
 * every time an individual portrait finishes loading or errors.
 */
export function loadLeaderAtlas(onLoad?: () => void): LeaderAtlas {
  const images: Record<string, HTMLImageElement | undefined> = {};
  let remaining = CIVILIZATIONS.length;

  for (const civ of CIVILIZATIONS) {
    const img = new Image();
    img.src = imageUrl(civ.id);

    const onFinish = (): void => {
      if (isImageReady(img)) {
        images[civ.id] = img;
      }
      remaining--;
      if (remaining === 0) {
        (atlas as { loaded: boolean }).loaded = true;
      }
      onLoad?.();
    };

    img.onload = onFinish;
    img.onerror = () => {
      remaining--;
      if (remaining === 0) {
        (atlas as { loaded: boolean }).loaded = true;
      }
      onLoad?.();
    };
  }

  const atlas: LeaderAtlas = { images, loaded: remaining === 0 };
  return atlas;
}
