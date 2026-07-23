/// <reference types="vite/client" />
import { ASSET_BASE_URL } from "./asset-base";
import { shareAtlas } from "./atlas-cache";

/** Skirt sprites that show void beneath tiles on the outer map border. */
export interface MapEdgeAtlas {
  /** Every map-border tile and off-map band (`hexUnderVoid*`). */
  voidTile: HTMLImageElement | null;
  loaded: boolean;
}

function imageUrl(name: string): string {
  return `${ASSET_BASE_URL}hex-terrain/map-edge/${name}.png`;
}

function isImageReady(img: HTMLImageElement): boolean {
  return img.complete && img.naturalWidth > 0;
}

export const loadMapEdgeAtlas = shareAtlas(loadMapEdgeAtlasUncached);

function loadMapEdgeAtlasUncached(onLoad?: () => void): MapEdgeAtlas {
  const atlas: MapEdgeAtlas = {
    voidTile: null,
    loaded: false,
  };

  const names: Array<{ key: keyof Omit<MapEdgeAtlas, "loaded">; candidates: string[] }> = [
    { key: "voidTile", candidates: ["hexUnderVoid02"] },
  ];

  let remaining = names.length;

  const finish = (): void => {
    remaining--;
    if (remaining <= 0) atlas.loaded = true;
    onLoad?.();
  };

  for (const { key, candidates } of names) {
    let i = 0;
    const tryNext = (): void => {
      const name = candidates[i];
      if (!name) {
        finish();
        return;
      }
      const img = new Image();
      img.src = imageUrl(name);
      img.onload = () => {
        if (isImageReady(img)) atlas[key] = img;
        finish();
      };
      img.onerror = () => {
        i++;
        tryNext();
      };
    };
    tryNext();
  }

  return atlas;
}
