/// <reference types="vite/client" />
import { hashSeed } from "@roc/shared";

/**
 * Road overlay atlas (purchased "Hex Medieval Fantasy Locations" art), re-keyed by
 * OUR runtime direction convention (see tools/sync-road-tiles.mjs):
 *   - `road_<mask>`         road segment; bit d = road reaches the edge toward dir d
 *   - `road_bridge_<mask>`  straight road carried over a river on a bridge
 *                           (only the 3 straight-through masks: 9, 18, 36)
 *
 * All are transparent 256x384 overlays drawn on top of the base terrain, the same
 * footprint as the river/coast art, so they join neighbours at shared edge
 * midpoints. The pack ships every non-zero connection mask, so no rotation is
 * needed at render time — a tile's mask maps straight to an image.
 */
export interface RoadAtlas {
  /** key (e.g. "road_9", "road_bridge_9") -> loaded painted variants. */
  readonly images: Readonly<Record<string, HTMLImageElement[]>>;
  /** True once every requested road segment has finished loading or errored. */
  loaded: boolean;
}

const ROAD_VARIANTS = 4; // some masks ship up to 4 painted variations
/** Straight-through masks (opposite edge pairs) that have bridge art. */
export const BRIDGE_MASKS = [9, 18, 36] as const;

function imageUrl(name: string): string {
  return `${import.meta.env.BASE_URL}roads/${name}.png`;
}

/** Returns true when an image has finished loading and has usable pixels. */
export function isImageReady(img: HTMLImageElement): boolean {
  return img.complete && img.naturalWidth > 0;
}

/**
 * Starts loading every road overlay; `onLoad` fires as each finishes/errors so the
 * render loop can redraw. Missing variants simply error out and are skipped.
 */
export function loadRoadAtlas(onLoad?: () => void): RoadAtlas {
  const images: Record<string, HTMLImageElement[]> = {};
  let remaining = 0;

  const want = (key: string, variants: number): void => {
    images[key] = [];
    for (let v = 0; v < variants; v++) {
      const img = new Image();
      img.src = imageUrl(`${key}_${v}`);
      remaining++;
      const done = (ok: boolean): void => {
        if (ok && isImageReady(img)) images[key]!.push(img);
        remaining--;
        if (remaining === 0) (atlas as { loaded: boolean }).loaded = true;
        onLoad?.();
      };
      img.onload = () => done(true);
      img.onerror = () => done(false);
    }
  };

  for (let mask = 1; mask < 64; mask++) want(`road_${mask}`, ROAD_VARIANTS);
  for (const mask of BRIDGE_MASKS) want(`road_bridge_${mask}`, 1);

  const atlas: RoadAtlas = { images, loaded: remaining === 0 };
  return atlas;
}

/** Deterministically pick a variant for a key so a tile is stable across redraws. */
function pick(atlas: RoadAtlas, key: string, salt: string): HTMLImageElement | undefined {
  const variants = atlas.images[key];
  if (!variants || variants.length === 0) return undefined;
  return variants[hashSeed(`${salt},${key}`) % variants.length]!;
}

/**
 * Returns the overlay image for a road tile's connection mask. When `bridge` is
 * set and the road runs straight through (one of {@link BRIDGE_MASKS}), the
 * bridge variant is used; otherwise the plain road segment.
 */
export function roadFrame(
  atlas: RoadAtlas | undefined,
  mask: number,
  bridge: boolean,
  col: number,
  row: number,
): HTMLImageElement | undefined {
  if (!atlas || mask === 0) return undefined;
  if (bridge && (BRIDGE_MASKS as readonly number[]).includes(mask)) {
    const img = pick(atlas, `road_bridge_${mask}`, `${col},${row}`);
    if (img) return img;
  }
  return pick(atlas, `road_${mask}`, `${col},${row}`);
}
