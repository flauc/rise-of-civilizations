/// <reference types="vite/client" />

/** Road overlay atlas keyed by `<level>_<canonicalMask>`. */
export interface RoadAtlas {
  readonly images: Readonly<Record<string, HTMLImageElement | undefined>>;
  /** True once every requested road segment has finished loading or errored. */
  loaded: boolean;
}

const ROAD_TYPES = ["dirt_road", "stone_road", "advanced_stone_road"] as const;

/** Distinct connection patterns up to hex rotation (0-side omitted). */
const CONNECTION_MASKS = [1, 3, 5, 7, 9, 11, 13, 15, 21, 23, 27, 31, 63] as const;

function imageUrl(id: string): string {
  return `${import.meta.env.BASE_URL}roads/${id}.png`;
}

/** Returns true when an image has finished loading and has usable pixels. */
export function isImageReady(img: HTMLImageElement): boolean {
  return img.complete && img.naturalWidth > 0;
}

function rotateMask(mask: number, steps: number): number {
  const s = ((steps % 6) + 6) % 6;
  return ((mask << s) | (mask >> (6 - s))) & 0b111111;
}

function canonicalInfo(mask: number): { readonly canonical: number; readonly rotation: number } {
  let best = mask;
  let rotation = 0;
  for (let r = 1; r < 6; r++) {
    const rotated = rotateMask(mask, r);
    if (rotated < best) {
      best = rotated;
      rotation = r;
    }
  }
  return { canonical: best, rotation };
}

/**
 * Starts loading road overlay images.
 *
 * `onLoad` is invoked every time an individual segment finishes loading or
 * errors so the render loop can redraw.
 */
export function loadRoadAtlas(onLoad?: () => void): RoadAtlas {
  const images: Record<string, HTMLImageElement | undefined> = {};
  let remaining: number = ROAD_TYPES.length * CONNECTION_MASKS.length;

  for (const type of ROAD_TYPES) {
    for (const mask of CONNECTION_MASKS) {
      const id = `${type}_${mask}`;
      const img = new Image();
      img.src = imageUrl(id);

      const onFinish = (): void => {
        if (isImageReady(img)) {
          images[id] = img;
        }
        remaining--;
        if (remaining === 0) {
          (atlas as { loaded: boolean }).loaded = true;
        }
        onLoad?.();
      };

      img.onload = onFinish;
      img.onerror = () => {
        remaining--;
        if (remaining === 0) {
          (atlas as { loaded: boolean }).loaded = true;
        }
        onLoad?.();
      };
    }
  }

  const atlas: RoadAtlas = { images, loaded: remaining === 0 };
  return atlas;
}

/** Returns the overlay image for a road level and neighbor-edge mask. */
export function roadFrameFor(atlas: RoadAtlas | undefined, level: number | undefined, mask: number): HTMLImageElement | undefined {
  if (!atlas) return undefined;
  const type = ROAD_TYPES[(level ?? 1) - 1];
  if (!type) return undefined;
  const { canonical } = canonicalInfo(mask);
  return atlas.images[`${type}_${canonical}`];
}

/** Returns how many 60-degree steps the canonical image must be rotated. */
export function roadRotationFor(mask: number): number {
  return canonicalInfo(mask).rotation;
}
