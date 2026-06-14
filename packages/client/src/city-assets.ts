/// <reference types="vite/client" />

const CITY_COUNT = 10;
const FRAMES_PER_TIER = 5; // base + _1 .. _4

export interface CityAtlas {
  /** images[tierIndex][frameIndex] — tierIndex 0 = population 1 */
  readonly images: ReadonlyArray<ReadonlyArray<HTMLImageElement | undefined>>;
  loaded: boolean;
}

function imageUrl(tier: number, frame: number): string {
  const suffix = frame === 0 ? "" : `_${frame}`;
  return `${import.meta.env.BASE_URL}buildings/city_${tier}${suffix}.png`;
}

/** Returns true when an image has finished loading and has usable pixels. */
export function isImageReady(img: HTMLImageElement): boolean {
  return img.complete && img.naturalWidth > 0;
}

/**
 * Starts loading all city token images, including animation frames.
 *
 * Each population tier has FRAMES_PER_TIER very similar images. The renderer
 * picks a random ready frame each draw to create a subtle animated effect.
 */
export function loadCityAtlas(onLoad?: () => void): CityAtlas {
  const images: (HTMLImageElement | undefined)[][] = [];
  let remaining = CITY_COUNT * FRAMES_PER_TIER;

  for (let tier = 1; tier <= CITY_COUNT; tier++) {
    const tierImages: (HTMLImageElement | undefined)[] = [];
    for (let frame = 0; frame < FRAMES_PER_TIER; frame++) {
      const img = new Image();
      img.src = imageUrl(tier, frame);
      tierImages.push(img);

      const onFinish = (): void => {
        if (isImageReady(img)) {
          tierImages[frame] = img;
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
    images.push(tierImages);
  }

  const atlas: CityAtlas = { images, loaded: remaining === 0 };
  return atlas;
}

/** Pick the city sprite tier index for a given population. */
export function cityImageIndex(population: number): number {
  return Math.max(0, Math.min(CITY_COUNT, population) - 1);
}

