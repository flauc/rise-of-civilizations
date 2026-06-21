/// <reference types="vite/client" />
import { ASSET_BASE_URL } from "./asset-base";
import { hashSeed } from "@roc/shared";

/**
 * River overlay atlas (purchased "Hex Rivers Coasts Seas" art).
 *
 * Tiles are keyed by OUR runtime direction convention (see tools/sync-river-tiles.mjs):
 *   - `river_<mask>`       overland channel; bit d = river crosses edge toward dir d
 *   - `river_lake_<mask>`  spring/terminal pond at a river end (single-bit mask)
 *   - `river_mouth_<bit>`  river fanning into the sea across one edge (single bit)
 *
 * All are transparent 256x384 overlays drawn on top of the base terrain, so they
 * compose with the coast shoreline and join neighbours at shared edge midpoints.
 */
export interface RiverAtlas {
  /** key (e.g. "river_9", "river_lake_8", "river_mouth_1") -> loaded variants. */
  readonly images: Readonly<Record<string, HTMLImageElement[]>>;
  loaded: boolean;
}

const SINGLE_BITS = [1, 2, 4, 8, 16, 32] as const;
// Mountain river-source sprites exist only for the four lower edges the art draws
// a river spilling from: E (1), W (8), SW (16), SE (32).
const MOUNTAIN_BITS = [1, 8, 16, 32] as const;
const RIVER_VARIANTS = 3; // some channels ship up to 3 painted variations
const MOUTH_VARIANTS = 2;

function imageUrl(name: string): string {
  return `${ASSET_BASE_URL}hex-terrain/rivers/${name}.png`;
}

export function isImageReady(img: HTMLImageElement): boolean {
  return img.complete && img.naturalWidth > 0;
}

/** Starts loading every river overlay; `onLoad` fires as each finishes/errors. */
export function loadRiverAtlas(onLoad?: () => void): RiverAtlas {
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

  for (let mask = 0; mask < 64; mask++) want(`river_${mask}`, RIVER_VARIANTS);
  for (const bit of SINGLE_BITS) {
    want(`river_lake_${bit}`, 1);
    want(`river_mouth_${bit}`, MOUTH_VARIANTS);
  }
  for (const bit of MOUNTAIN_BITS) want(`river_mountain_${bit}`, 1);

  const atlas: RiverAtlas = { images, loaded: remaining === 0 };
  return atlas;
}

/** Deterministically pick a variant for a key so a tile is stable across redraws. */
function pick(atlas: RiverAtlas, key: string, salt: string): HTMLImageElement | undefined {
  const variants = atlas.images[key];
  if (!variants || variants.length === 0) return undefined;
  return variants[hashSeed(`${salt},${key}`) % variants.length];
}

/** Overland river channel for a connection mask (or the lake-end pond variant). */
export function riverChannelFrame(
  atlas: RiverAtlas | undefined,
  mask: number,
  lake: boolean,
  col: number,
  row: number,
): HTMLImageElement | undefined {
  if (!atlas) return undefined;
  if (lake) {
    return pick(atlas, `river_lake_${mask}`, `${col},${row}`) ?? pick(atlas, `river_${mask}`, `${col},${row}`);
  }
  if (mask === 0) return undefined;
  return pick(atlas, `river_${mask}`, `${col},${row}`);
}

/** River-mouth overlay for a single edge bit facing the sea. */
export function riverMouthFrame(
  atlas: RiverAtlas | undefined,
  bit: number,
  col: number,
  row: number,
): HTMLImageElement | undefined {
  if (!atlas) return undefined;
  return pick(atlas, `river_mouth_${bit}`, `${col},${row}`);
}

/** Combined mountain sprite with a river springing from a single edge bit (a
 *  mountain river source). Only the four lower edges (1, 8, 16, 32) have art. */
export function riverMountainFrame(
  atlas: RiverAtlas | undefined,
  bit: number,
  col: number,
  row: number,
): HTMLImageElement | undefined {
  if (!atlas) return undefined;
  return pick(atlas, `river_mountain_${bit}`, `${col},${row}`);
}
