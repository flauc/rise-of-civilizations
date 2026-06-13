/// <reference types="vite/client" />
import type { TerrainType } from "@roc/shared";

/** Per-terrain image atlas used by the renderer. */
export interface TerrainAtlas {
  readonly images: Readonly<Record<TerrainType, HTMLImageElement>>;
  /** True once every terrain image has loaded successfully. */
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
};

function imageUrl(name: string): string {
  // Vite replaces import.meta.env.BASE_URL with the configured base path.
  return `${import.meta.env.BASE_URL}hex-terrain/${name}.png`;
}

/** Returns true when an image has finished loading and has usable pixels. */
export function isImageReady(img: HTMLImageElement): boolean {
  return img.complete && img.naturalWidth > 0;
}

/**
 * Starts loading the hex terrain sprite atlas.
 *
 * The returned atlas can be passed to the renderer immediately; tiles fall back
 * to flat colors until each image finishes loading. `onLoad` is invoked every
 * time an individual sprite loads so the render loop can redraw.
 */
export function loadTerrainAtlas(onLoad?: () => void): TerrainAtlas {
  const images: Record<TerrainType, HTMLImageElement> = {
    ocean: new Image(),
    coast: new Image(),
    lake: new Image(),
    plains: new Image(),
    grassland: new Image(),
    desert: new Image(),
    tundra: new Image(),
    snow: new Image(),
    forest: new Image(),
    jungle: new Image(),
    hills: new Image(),
    mountains: new Image(),
  };

  let remaining = Object.keys(images).length;

  for (const terrain of Object.keys(images) as TerrainType[]) {
    const img = images[terrain]!;
    img.src = imageUrl(TERRAIN_IMAGE_NAMES[terrain]);
    img.onload = () => {
      remaining--;
      if (remaining === 0) {
        (atlas as { loaded: boolean }).loaded = true;
      }
      onLoad?.();
    };
    img.onerror = () => {
      // Decrement so we do not block the atlas forever; the renderer will keep
      // using the fallback color for this terrain.
      remaining--;
      if (remaining === 0) {
        (atlas as { loaded: boolean }).loaded = true;
      }
      onLoad?.();
    };
  }

  const atlas: TerrainAtlas = { images, loaded: remaining === 0 };
  return atlas;
}
