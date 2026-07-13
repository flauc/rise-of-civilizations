/// <reference types="vite/client" />
import { ASSET_BASE_URL } from "./asset-base";
import { hashSeed } from "@roc/shared";

/**
 * Road overlay atlas (purchased "Hex Medieval Fantasy Locations" art), re-keyed by
 * OUR runtime direction convention (see tools/sync-road-tiles.mjs) and by road tier
 * (the paved/imperial variants are recoloured from the dirt art by
 * tools/generate-road-tiers.mjs):
 *   - `road_<mask>`   / `road_bridge_<mask>`    tier 1, Dirt (warm earthen track)
 *   - `road2_<mask>`  / `road2_bridge_<mask>`   tier 2, Paved (packed stone)
 *   - `road3_<mask>`  / `road3_bridge_<mask>`   tier 3, Imperial (pale dressed stone)
 * `bit d = road reaches the edge toward dir d`; bridge art exists only for the three
 * straight-through masks (9, 18, 36).
 *
 * All are transparent 256x384 overlays drawn on top of the base terrain, the same
 * footprint as the river/coast art, so they join neighbours at shared edge
 * midpoints. The pack ships every non-zero connection mask, so no rotation is
 * needed at render time — a tile's mask maps straight to an image.
 */
export interface RoadAtlas {
  /** key (e.g. "road_9", "road2_bridge_9") -> loaded painted variants. */
  readonly images: Readonly<Record<string, HTMLImageElement[]>>;
  /** True once every requested road segment has finished loading or errored. */
  loaded: boolean;
}

const ROAD_VARIANTS = 4; // some masks ship up to 4 painted variations
/** Straight-through masks (opposite edge pairs) that have bridge art. */
export const BRIDGE_MASKS = [9, 18, 36] as const;
/** Key/filename prefix for a road tier: 1 = dirt, 2 = paved, 3 = imperial. */
const TIER_PREFIXES = ["road", "road2", "road3"] as const;
function tierPrefix(level: number): string {
  return level >= 3 ? "road3" : level === 2 ? "road2" : "road";
}

function imageUrl(name: string): string {
  return `${ASSET_BASE_URL}roads/${name}.png`;
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

  for (const p of TIER_PREFIXES) {
    for (let mask = 1; mask < 64; mask++) want(`${p}_${mask}`, ROAD_VARIANTS);
    for (const mask of BRIDGE_MASKS) want(`${p}_bridge_${mask}`, 1);
  }

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
 * Returns the overlay image for a road tile's connection mask at road tier `level`
 * (1 dirt, 2 paved, 3 imperial). When `bridge` is set and the road runs straight
 * through (one of {@link BRIDGE_MASKS}), the bridge variant is used; otherwise the
 * plain road segment. Falls back to the tier-1 art if a tiered variant is missing
 * (e.g. still loading), so a road always renders once any tier has loaded.
 */
export function roadFrame(
  atlas: RoadAtlas | undefined,
  mask: number,
  bridge: boolean,
  col: number,
  row: number,
  level = 1,
): HTMLImageElement | undefined {
  if (!atlas || mask === 0) return undefined;
  const p = tierPrefix(level);
  const salt = `${col},${row}`;
  if (bridge && (BRIDGE_MASKS as readonly number[]).includes(mask)) {
    const img = pick(atlas, `${p}_bridge_${mask}`, salt) ?? pick(atlas, `road_bridge_${mask}`, salt);
    if (img) return img;
  }
  return pick(atlas, `${p}_${mask}`, salt) ?? pick(atlas, `road_${mask}`, salt);
}

/**
 * Picks a real road segment for an isolated road tile (no road/city neighbours,
 * so no connection mask to key off), at road tier `level`. Any painted segment of
 * that tier is a valid standalone patch; the choice is deterministic per tile so it
 * stays stable across redraws. Returns undefined until at least one segment loads.
 */
export function isolatedRoadFrame(
  atlas: RoadAtlas | undefined,
  col: number,
  row: number,
  level = 1,
): HTMLImageElement | undefined {
  if (!atlas) return undefined;
  const p = tierPrefix(level);
  const keys = Object.keys(atlas.images).filter(
    (k) => k.startsWith(`${p}_`) && !k.startsWith(`${p}_bridge_`) && atlas.images[k]!.length > 0,
  );
  if (keys.length === 0) return undefined;
  const key = keys[hashSeed(`${col},${row},isolated`) % keys.length]!;
  return pick(atlas, key, `${col},${row}`);
}
