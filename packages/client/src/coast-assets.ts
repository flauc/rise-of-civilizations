/// <reference types="vite/client" />
import { ASSET_BASE_URL } from "./asset-base";
import { hashSeed } from "@roc/shared";

/**
 * Coast shoreline overlay atlas.
 *
 * Each entry is the painted shoreline for a given LAND-neighbour mask: bit `d`
 * set means the neighbour in hex direction `d` (per HEX_DIRECTIONS: 0=E, 1=NE,
 * 2=NW, 3=W, 4=SW, 5=SE) is land. The art is a transparent 256x384 overlay that
 * draws sand + foam along exactly those edges, so it layers on top of the base
 * water tile. Masks run 1..63 (mask 0 = open water has no shoreline). Files are
 * produced by tools/sync-coast-tiles.mjs as `coasts/coast_<mask>_<variant>.png`.
 */
export interface CoastAtlas {
  /** mask (1..63) -> loaded shoreline variants. */
  readonly images: Readonly<Record<number, HTMLImageElement[]>>;
  /** True once every requested overlay has finished loading or errored. */
  loaded: boolean;
}

// Two painted variations per mask (…-00 / …-01 in the source pack).
const VARIANTS = 2;

function imageUrl(name: string): string {
  return `${ASSET_BASE_URL}hex-terrain/coasts/${name}.png`;
}

/** Returns true when an image has finished loading and has usable pixels. */
export function isImageReady(img: HTMLImageElement): boolean {
  return img.complete && img.naturalWidth > 0;
}

/**
 * Starts loading the coast shoreline overlays.
 *
 * `onLoad` is invoked every time an individual overlay finishes loading or
 * errors so the render loop can redraw.
 */
export function loadCoastAtlas(onLoad?: () => void): CoastAtlas {
  const images: Record<number, HTMLImageElement[]> = {};
  let remaining = 0;

  for (let mask = 1; mask < 64; mask++) {
    images[mask] = [];
    for (let v = 0; v < VARIANTS; v++) {
      const img = new Image();
      img.src = imageUrl(`coast_${mask}_${v}`);
      remaining++;

      const onFinish = (ok: boolean): void => {
        if (ok && isImageReady(img)) images[mask]!.push(img);
        remaining--;
        if (remaining === 0) (atlas as { loaded: boolean }).loaded = true;
        onLoad?.();
      };
      img.onload = () => onFinish(true);
      img.onerror = () => onFinish(false);
    }
  }

  const atlas: CoastAtlas = { images, loaded: remaining === 0 };
  return atlas;
}

/**
 * Returns the shoreline overlay for a tile's land-neighbour `mask`, picking a
 * stable variant per tile so neighbouring coasts don't all look identical.
 * Returns undefined for open water (mask 0) or while the overlay is still loading.
 */
export function coastFrameFor(
  atlas: CoastAtlas | undefined,
  mask: number,
  col: number,
  row: number,
): HTMLImageElement | undefined {
  if (!atlas || mask <= 0) return undefined;
  const variants = atlas.images[mask];
  if (!variants || variants.length === 0) return undefined;
  return variants[hashSeed(`${col},${row},coast`) % variants.length];
}
