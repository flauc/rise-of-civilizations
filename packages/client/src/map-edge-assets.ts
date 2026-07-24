/// <reference types="vite/client" />
import { type MapEdgeSkirtKind } from "@roc/shared";
import { ASSET_BASE_URL } from "./asset-base";
import { shareAtlas } from "./atlas-cache";

/** Skirt sprites beneath tiles on the outer map border. */
export interface MapEdgeAtlas {
  void0: HTMLImageElement | null;
  void1: HTMLImageElement | null;
  void2: HTMLImageElement | null;
  void3: HTMLImageElement | null;
  ocean: HTMLImageElement | null;
  oceanShoreBoth: HTMLImageElement | null;
  oceanShoreEast: HTMLImageElement | null;
  oceanShoreWest: HTMLImageElement | null;
  dirt: HTMLImageElement | null;
  loaded: boolean;
}

function imageUrl(name: string): string {
  return `${ASSET_BASE_URL}hex-terrain/map-edge/${name}.png`;
}

function isImageReady(img: HTMLImageElement): boolean {
  return img.complete && img.naturalWidth > 0;
}

export const loadMapEdgeAtlas = shareAtlas(loadMapEdgeAtlasUncached);

const ASSET_DEFS: Array<{ key: keyof Omit<MapEdgeAtlas, "loaded">; file: string }> = [
  { key: "void0", file: "hexVoid00" },
  { key: "void1", file: "hexUnderVoid01" },
  { key: "void2", file: "hexUnderVoid02" },
  { key: "void3", file: "hexUnderVoid03" },
  { key: "ocean", file: "hexUnderOcean00" },
  { key: "oceanShoreBoth", file: "hexUnderOceanShoreBoth00" },
  { key: "oceanShoreEast", file: "hexUnderOceanShoreEast00" },
  { key: "oceanShoreWest", file: "hexUnderOceanShoreWest00" },
  { key: "dirt", file: "hexUnderDirt00" },
];

export function mapEdgeFrameFor(
  atlas: MapEdgeAtlas | undefined,
  kind: MapEdgeSkirtKind,
): HTMLImageElement | null | undefined {
  return atlas?.[kind];
}

function loadMapEdgeAtlasUncached(onLoad?: () => void): MapEdgeAtlas {
  const atlas: MapEdgeAtlas = {
    void0: null,
    void1: null,
    void2: null,
    void3: null,
    ocean: null,
    oceanShoreBoth: null,
    oceanShoreEast: null,
    oceanShoreWest: null,
    dirt: null,
    loaded: false,
  };

  let remaining = ASSET_DEFS.length;

  const finish = (): void => {
    remaining--;
    if (remaining <= 0) atlas.loaded = true;
    onLoad?.();
  };

  for (const { key, file } of ASSET_DEFS) {
    const img = new Image();
    img.src = imageUrl(file);
    img.onload = () => {
      if (isImageReady(img)) atlas[key] = img;
      finish();
    };
    img.onerror = () => finish();
  }

  return atlas;
}
