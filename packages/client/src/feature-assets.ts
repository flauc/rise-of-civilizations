/// <reference types="vite/client" />

import { ASSET_BASE_URL } from "./asset-base";
import { hashSeed } from "@roc/shared";

const VILLAGE_FRAMES = 5; // village.png, village_1.png .. village_4.png
const BARB_CAMP_FRAMES = 5; // barb_camp.png, barb_camp_1.png .. barb_camp_4.png

export interface FeatureAtlas {
  readonly village: ReadonlyArray<HTMLImageElement | undefined>;
  readonly barbCamp: ReadonlyArray<HTMLImageElement | undefined>;
  loaded: boolean;
}

function frameUrl(base: string, frame: number): string {
  const suffix = frame === 0 ? "" : `_${frame}`;
  return `${ASSET_BASE_URL}buildings/${base}${suffix}.png`;
}

/** Returns true when an image has finished loading and has usable pixels. */
export function isImageReady(img: HTMLImageElement): boolean {
  return img.complete && img.naturalWidth > 0;
}

/** Starts loading village and barbarian-camp feature sprites. */
export function loadFeatureAtlas(onLoad?: () => void): FeatureAtlas {
  const village: (HTMLImageElement | undefined)[] = [];
  const barbCamp: (HTMLImageElement | undefined)[] = [];
  let remaining = VILLAGE_FRAMES + BARB_CAMP_FRAMES;

  function finishSlot(
    array: (HTMLImageElement | undefined)[],
    frame: number,
    img: HTMLImageElement,
  ): void {
    if (isImageReady(img)) {
      array[frame] = img;
    }
    remaining--;
    if (remaining === 0) {
      (atlas as { loaded: boolean }).loaded = true;
    }
    onLoad?.();
  }

  for (let frame = 0; frame < VILLAGE_FRAMES; frame++) {
    const img = new Image();
    img.src = frameUrl("village", frame);
    village.push(img);
    img.onload = () => finishSlot(village, frame, img);
    img.onerror = () => finishSlot(village, frame, img);
  }

  for (let frame = 0; frame < BARB_CAMP_FRAMES; frame++) {
    const img = new Image();
    img.src = frameUrl("barb_camp", frame);
    barbCamp.push(img);
    img.onload = () => finishSlot(barbCamp, frame, img);
    img.onerror = () => finishSlot(barbCamp, frame, img);
  }

  const atlas: FeatureAtlas = { village, barbCamp, loaded: remaining === 0 };
  return atlas;
}

function pickFrame(
  frames: ReadonlyArray<HTMLImageElement | undefined>,
  seed: string,
): HTMLImageElement | undefined {
  const ready = frames.filter((img): img is HTMLImageElement => img !== undefined && isImageReady(img));
  if (ready.length === 0) return undefined;
  return ready[hashSeed(seed) % ready.length];
}

/** Pick a deterministic village frame for a given tile coordinate. */
export function villageFrameFor(
  atlas: FeatureAtlas | undefined,
  col: number,
  row: number,
): HTMLImageElement | undefined {
  return pickFrame(atlas?.village ?? [], `${col},${row},village`);
}

/** Pick a deterministic barbarian-camp frame for a given tile coordinate. */
export function barbCampFrameFor(
  atlas: FeatureAtlas | undefined,
  col: number,
  row: number,
): HTMLImageElement | undefined {
  return pickFrame(atlas?.barbCamp ?? [], `${col},${row},barb_camp`);
}
