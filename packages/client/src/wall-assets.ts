/// <reference types="vite/client" />
import { ASSET_BASE_URL } from "./asset-base";
import { shareAtlas } from "./atlas-cache";

/**
 * Palisade wall artwork: one side piece per hex-edge axis plus a joint tower.
 *
 * A wall side is drawn between the two corners of its hex edge, and a tower
 * stands on every corner a wall run touches. The towers cover the joints, so the
 * side pieces never have to agree with each other pixel for pixel. Our
 * pointy-top hexes have three edge axes, and the art ships one render per axis:
 *
 *     side 0, 3  ->  "v"   vertical edge (E / W)
 *     side 1, 4  ->  "u"   up-to-the-right edge  "/"   (NE / SW)
 *     side 2, 5  ->  "d"   down-to-the-right edge "\\"  (SE / NW)
 *
 * Prepared by tools/palisade-art.py.
 */
export type WallOrient = "v" | "u" | "d";

/** Orientation of each hex side, by side index (corners[sd]..corners[sd+1]). */
export const SIDE_ORIENT: readonly WallOrient[] = ["v", "u", "d", "v", "u", "d"];

/**
 * A side piece, with the ground points of both of its end posts (`a`, `b`) in
 * its own image's pixel space, so it can be fitted between two hex corners.
 */
export interface PalisadeSide {
  img: HTMLImageElement;
  w: number;
  h: number;
  ax: number;
  ay: number;
  bx: number;
  by: number;
}

export interface Palisade {
  sides: Record<WallOrient, PalisadeSide>;
  /** The joint tower; its anchor is the centre of its footprint. */
  tower: { img: HTMLImageElement; w: number; h: number; ax: number; ay: number };
}

interface PalisadeManifest {
  sides: Record<WallOrient, Omit<PalisadeSide, "img">>;
  tower: { w: number; h: number; ax: number; ay: number };
}

export interface WallAtlas {
  /** Side + joint-tower set, once the manifest and all four images have loaded. */
  palisade?: Palisade;
  /** True once the manifest and every piece it lists has loaded or errored. */
  loaded: boolean;
}

/** Returns true when an image has finished loading and has usable pixels. */
export function isImageReady(img: HTMLImageElement): boolean {
  return img.complete && img.naturalWidth > 0;
}

/** Fetches the palisade manifest and its pieces; `onLoad` fires once they settle. */
export const loadWallAtlas = shareAtlas(loadWallAtlasUncached);

function loadWallAtlasUncached(onLoad?: () => void): WallAtlas {
  const atlas: WallAtlas = { loaded: false };
  const base = `${ASSET_BASE_URL}walls/palisade/`;
  const load = (name: string): Promise<HTMLImageElement | null> =>
    new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(isImageReady(img) ? img : null);
      img.onerror = () => resolve(null);
      img.src = `${base}${name}.png`;
    });

  fetch(`${base}manifest.json`)
    .then((r) => (r.ok ? r.json() : null))
    .then(async (m: PalisadeManifest | null) => {
      if (!m?.sides || !m.tower) return;
      const [v, u, d, tower] = await Promise.all([
        load("side_v"),
        load("side_u"),
        load("side_d"),
        load("tower"),
      ]);
      if (!v || !u || !d || !tower) return;
      atlas.palisade = {
        sides: {
          v: { img: v, ...m.sides.v },
          u: { img: u, ...m.sides.u },
          d: { img: d, ...m.sides.d },
        },
        tower: { img: tower, ...m.tower },
      };
    })
    .catch(() => undefined)
    .finally(() => {
      atlas.loaded = true;
      onLoad?.();
    });

  return atlas;
}
