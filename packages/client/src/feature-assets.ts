/// <reference types="vite/client" />

import { hashSeed } from "@roc/shared";

const VILLAGE_FRAMES = 5; // village.png, village_1.png .. village_4.png

export interface FeatureAtlas {
  readonly village: ReadonlyArray<HTMLImageElement | undefined>;
  loaded: boolean;
}

function villageUrl(frame: number): string {
  const suffix = frame === 0 ? "" : `_${frame}`;
  return `${import.meta.env.BASE_URL}buildings/village${suffix}.png`;
}

/** Returns true when an image has finished loading and has usable pixels. */
export function isImageReady(img: HTMLImageElement): boolean {
  return img.complete && img.naturalWidth > 0;
}

/** Starts loading village feature sprites. */
export function loadFeatureAtlas(onLoad?: () => void): FeatureAtlas {
  const village: (HTMLImageElement | undefined)[] = [];
  let remaining = VILLAGE_FRAMES;

  for (let frame = 0; frame < VILLAGE_FRAMES; frame++) {
    const img = new Image();
    img.src = villageUrl(frame);
    village.push(img);

    const onFinish = (): void => {
      if (isImageReady(img)) {
        village[frame] = img;
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

  const atlas: FeatureAtlas = { village, loaded: remaining === 0 };
  return atlas;
}

/** Pick a deterministic village frame for a given tile coordinate. */
export function villageFrameFor(
  atlas: FeatureAtlas | undefined,
  col: number,
  row: number,
): HTMLImageElement | undefined {
  const frames = atlas?.village ?? [];
  const ready = frames.filter((img): img is HTMLImageElement => img !== undefined && isImageReady(img));
  if (ready.length === 0) return undefined;
  return ready[hashSeed(`${col},${row},village`) % ready.length];
}
