/// <reference types="vite/client" />

import { hashSeed } from "@roc/shared";

const FARM_FRAMES = 5; // farm.png, farm_1.png .. farm_4.png

export interface ImprovementAtlas {
  readonly farm: ReadonlyArray<HTMLImageElement | undefined>;
  loaded: boolean;
}

function farmUrl(frame: number): string {
  const suffix = frame === 0 ? "" : `_${frame}`;
  return `${import.meta.env.BASE_URL}buildings/farm${suffix}.png`;
}

/** Returns true when an image has finished loading and has usable pixels. */
export function isImageReady(img: HTMLImageElement): boolean {
  return img.complete && img.naturalWidth > 0;
}

/** Starts loading farm improvement sprites. */
export function loadImprovementAtlas(onLoad?: () => void): ImprovementAtlas {
  const farm: (HTMLImageElement | undefined)[] = [];
  let remaining = FARM_FRAMES;

  for (let frame = 0; frame < FARM_FRAMES; frame++) {
    const img = new Image();
    img.src = farmUrl(frame);
    farm.push(img);

    const onFinish = (): void => {
      if (isImageReady(img)) {
        farm[frame] = img;
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

  const atlas: ImprovementAtlas = { farm, loaded: remaining === 0 };
  return atlas;
}

/** Pick a deterministic farm frame for a given tile coordinate. */
export function farmFrameFor(
  atlas: ImprovementAtlas | undefined,
  col: number,
  row: number,
): HTMLImageElement | undefined {
  const frames = atlas?.farm ?? [];
  const ready = frames.filter((img): img is HTMLImageElement => img !== undefined && isImageReady(img));
  if (ready.length === 0) return undefined;
  return ready[hashSeed(`${col},${row},farm`) % ready.length];
}
