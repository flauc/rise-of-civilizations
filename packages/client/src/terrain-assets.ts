/// <reference types="vite/client" />
import { ASSET_BASE_URL } from "./asset-base";
import { shareAtlas } from "./atlas-cache";
import { TERRAIN_TYPES, type TerrainType } from "@roc/shared";

/** Per-terrain image atlas used by the renderer. */
export interface TerrainAtlas {
  /** All loaded variants for each terrain (e.g. forest.png, forest_1.png …). */
  readonly images: Readonly<Record<TerrainType, HTMLImageElement[]>>;
  /** Tree-cluster decor sprites drawn on wooded hills. */
  readonly hillTrees: HTMLImageElement[];
  /** Frozen-pond decor drawn on some snow tiles. */
  readonly frozenLakes: HTMLImageElement[];
  /** Crevasse decor drawn on some polar (ice-cap) tiles. */
  readonly iceCrevasses: HTMLImageElement[];
  /** Iceberg decor scattered in polar waters (not map-edge skirts). */
  readonly icebergs: HTMLImageElement[];
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
  taiga: "taiga",
  snow: "snow",
  forest: "forest",
  woods: "woods",
  jungle: "jungle",
  wetlands: "wetlands",
  bog: "bog",
  hills: "hills",
  mountains: "mountains",
  mesa: "mesa",
  volcano: "volcano",
};

// Up to this many painted variations per terrain:
//   forest.png, forest_1.png, … forest_7.png
const MAX_VARIANTS = 8;

function imageUrl(name: string): string {
  // Vite replaces import.meta.env.BASE_URL with the configured base path.
  return `${ASSET_BASE_URL}hex-terrain/${name}.png`;
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
export const loadTerrainAtlas = shareAtlas(loadTerrainAtlasUncached);

function loadTerrainAtlasUncached(onLoad?: () => void): TerrainAtlas {
  const images: Record<TerrainType, HTMLImageElement[]> = {
    ocean: [],
    coast: [],
    lake: [],
    plains: [],
    grassland: [],
    desert: [],
    tundra: [],
    taiga: [],
    snow: [],
    forest: [],
    woods: [],
    jungle: [],
    wetlands: [],
    bog: [],
    hills: [],
    mountains: [],
    mesa: [],
    volcano: [],
  };

  const hillTrees: HTMLImageElement[] = [];
  const frozenLakes: HTMLImageElement[] = [];
  const iceCrevasses: HTMLImageElement[] = [];
  const icebergs: HTMLImageElement[] = [];
  let remaining = 0;

  const load = (url: string, sink: HTMLImageElement[]): void => {
    const img = new Image();
    img.src = url;
    remaining++;

    const onFinish = (): void => {
      // Only keep successfully loaded variants.
      if (isImageReady(img)) {
        sink.push(img);
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
  };

  for (const terrain of TERRAIN_TYPES) {
    for (const url of variantUrls(TERRAIN_IMAGE_NAMES[terrain])) {
      load(url, images[terrain]);
    }
  }
  // Tree-cluster decor for wooded hills (exactly three variants shipped).
  for (const name of ["hill-trees", "hill-trees_1", "hill-trees_2"]) {
    load(imageUrl(name), hillTrees);
  }
  // Cold-lands decor: frozen ponds, ice-cap crevasses, and polar-sea icebergs.
  load(imageUrl("frozen-lake"), frozenLakes);
  for (const name of ["ice-crevasse", "ice-crevasse_1"]) load(imageUrl(name), iceCrevasses);
  for (const name of ["iceberg", "iceberg_1", "iceberg_2", "iceberg_3", "iceberg_4"]) {
    load(imageUrl(name), icebergs);
  }

  const atlas: TerrainAtlas = { images, hillTrees, frozenLakes, iceCrevasses, icebergs, loaded: remaining === 0 };
  return atlas;
}
