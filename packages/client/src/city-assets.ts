/// <reference types="vite/client" />

const CITY_COUNT = 10;

export interface CityAtlas {
  readonly images: ReadonlyArray<HTMLImageElement | undefined>;
  loaded: boolean;
}

function imageUrl(index: number): string {
  return `${import.meta.env.BASE_URL}buildings/city_${index}.png`;
}

/** Returns true when an image has finished loading and has usable pixels. */
export function isImageReady(img: HTMLImageElement): boolean {
  return img.complete && img.naturalWidth > 0;
}

/**
 * Starts loading the city token images.
 *
 * index 0 = population 1, index 9 = population 10+. Cities fall back to the
 * colored square until the appropriate sprite loads.
 */
export function loadCityAtlas(onLoad?: () => void): CityAtlas {
  const images: (HTMLImageElement | undefined)[] = [];
  let remaining = CITY_COUNT;

  for (let i = 1; i <= CITY_COUNT; i++) {
    const img = new Image();
    img.src = imageUrl(i);

    const onFinish = (): void => {
      if (isImageReady(img)) {
        images[i - 1] = img;
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

  const atlas: CityAtlas = { images, loaded: remaining === 0 };
  return atlas;
}

/** Pick the city sprite index for a given population. */
export function cityImageIndex(population: number): number {
  return Math.max(0, Math.min(CITY_COUNT, population) - 1);
}
