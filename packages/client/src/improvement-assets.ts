/// <reference types="vite/client" />

import { hashSeed } from "@roc/shared";

const VARIANTS = 5; // base + _1 .. _4
const TIERS = 3;

const IMPROVEMENT_KINDS = [
  "farm",
  "lumber_camp",
  "mine",
  "quarry",
  "pasture",
  "plantation",
  "camp",
  "fishing_boats",
  "tower",
] as const;

export interface ImprovementAtlas {
  /** Images keyed by `${kind}_t${tier}`. */
  readonly images: Record<string, HTMLImageElement[]>;
  loaded: boolean;
}

/** Returns true when an image has finished loading and has usable pixels. */
export function isImageReady(img: HTMLImageElement): boolean {
  return img.complete && img.naturalWidth > 0;
}

function improvementUrl(kind: string, tier: number, variant: number): string {
  const suffix = variant === 0 ? "" : `_${variant}`;
  return `${import.meta.env.BASE_URL}improvements/${kind}_t${tier}${suffix}.png`;
}

function legacyFarmUrl(variant: number): string {
  const suffix = variant === 0 ? "" : `_${variant}`;
  return `${import.meta.env.BASE_URL}buildings/farm${suffix}.png`;
}

/** Start loading tiered improvement sprites. */
export function loadImprovementAtlas(onLoad?: () => void): ImprovementAtlas {
  const images: Record<string, HTMLImageElement[]> = {};
  let remaining = 0;

  const tryFinish = (): void => {
    remaining--;
    if (remaining === 0) {
      (atlas as { loaded: boolean }).loaded = true;
    }
    onLoad?.();
  };

  const trackImage = (img: HTMLImageElement, key: string): void => {
    remaining++;
    let list = images[key];
    if (!list) {
      list = [];
      images[key] = list;
    }
    list.push(img);
    img.onload = () => {
      if (isImageReady(img)) {
        // keep the slot populated
      }
      tryFinish();
    };
    img.onerror = tryFinish;
  };

  for (const kind of IMPROVEMENT_KINDS) {
    for (let tier = 1; tier <= TIERS; tier++) {
      const key = `${kind}_t${tier}`;
      for (let v = 0; v < VARIANTS; v++) {
        const img = new Image();
        img.src = improvementUrl(kind, tier, v);
        trackImage(img, key);
      }
    }
  }

  // Keep legacy farm variants available as tier-1 farm art until new tiered
  // sprites are generated.
  for (let v = 0; v < VARIANTS; v++) {
    const img = new Image();
    img.src = legacyFarmUrl(v);
    trackImage(img, "farm_t1");
  }

  const atlas: ImprovementAtlas = { images, loaded: remaining === 0 };
  return atlas;
}

/** Pick a deterministic improvement frame for a tile. */
export function improvementFrameFor(
  atlas: ImprovementAtlas | undefined,
  kind: string,
  tier: number,
  col: number,
  row: number,
): HTMLImageElement | undefined {
  const key = `${kind}_t${Math.max(1, Math.min(TIERS, tier))}`;
  const frames = atlas?.images[key] ?? [];
  const ready = frames.filter((img): img is HTMLImageElement => img !== undefined && isImageReady(img));
  if (ready.length === 0) return undefined;
  return ready[hashSeed(`${col},${row},${key}`) % ready.length];
}
