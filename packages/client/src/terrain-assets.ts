/// <reference types="vite/client" />
import { TERRAIN_TYPES, type TerrainType } from "@roc/shared";

/** Per-terrain image atlas used by the renderer. */
export interface TerrainAtlas {
  /** All loaded variants for each terrain (e.g. forest.png, forest_1.png …). */
  readonly images: Readonly<Record<TerrainType, HTMLImageElement[]>>;
  /** True once every requested variant image has finished loading or errored. */
  loaded: boolean;
}

const TERRAIN_IMAGE_NAMES: Record<TerrainType, string> = {
  ocean: "ocean",
  coast: "coast",
  lake: "lake",
  plains: "plains",
  grassland: "grassland",
  desert: "desert",
  tundra: "tundra",
  snow: "snow",
  forest: "forest",
  jungle: "jungle",
  hills: "hills",
  mountains: "mountains",
  mesa: "mesa",
  volcano: "volcano",
};

// The generator can output up to this many variants per tile:
//   forest.png, forest_1.png, forest_2.png, forest_3.png, forest_4.png
const MAX_VARIANTS = 5;

function imageUrl(name: string): string {
  // Vite replaces import.meta.env.BASE_URL with the configured base path.
  return `${import.meta.env.BASE_URL}hex-terrain/${name}.png`;
}

function variantUrls(name: string): string[] {
  const urls: string[] = [];
  for (let i = 0; i < MAX_VARIANTS; i++) {
    const suffix = i === 0 ? "" : `_${i}`;
    urls.push(imageUrl(`${name}${suffix}`));
  }
  return urls;
}

/** Returns true when an image has finished loading and has usable pixels. */
export function isImageReady(img: HTMLImageElement): boolean {
  return img.complete && img.naturalWidth > 0;
}

/**
 * Starts loading the hex terrain sprite atlas.
 *
 * The returned atlas can be passed to the renderer immediately; tiles fall back
 * to flat colors until each sprite loads. `onLoad` is invoked every time an
 * individual sprite loads or errors so the render loop can redraw.
 */
export function loadTerrainAtlas(onLoad?: () => void): TerrainAtlas {
  const images: Record<TerrainType, HTMLImageElement[]> = {
    ocean: [],
    coast: [],
    lake: [],
    plains: [],
    grassland: [],
    desert: [],
    tundra: [],
    snow: [],
    forest: [],
    jungle: [],
    hills: [],
    mountains: [],
    mesa: [],
    volcano: [],
  };

  let remaining = 0;

  for (const terrain of TERRAIN_TYPES) {
    for (const url of variantUrls(TERRAIN_IMAGE_NAMES[terrain])) {
      const img = new Image();
      img.src = url;
      remaining++;

      const onFinish = (): void => {
        // Only keep successfully loaded variants.
        if (isImageReady(img)) {
          images[terrain].push(img);
        }
        remaining--;
        if (remaining === 0) {
          (atlas as { loaded: boolean }).loaded = true;
        }
        onLoad?.();
      };

      img.onload = onFinish;
      img.onerror = () => {
        // Decrement so we do not block the atlas forever; the renderer will keep
        // using the fallback color for this terrain if no variants load.
        remaining--;
        if (remaining === 0) {
          (atlas as { loaded: boolean }).loaded = true;
        }
        onLoad?.();
      };
    }
  }

  const atlas: TerrainAtlas = { images, loaded: remaining === 0 };
  return atlas;
}
