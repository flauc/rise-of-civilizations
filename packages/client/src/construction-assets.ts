/// <reference types="vite/client" />

// Per-category "under construction" sprites drawn on tiles that have a Work in
// progress. Three build-site categories — economic, defensive, and wonder — keyed
// by category id. Mirrors improvement-assets.ts but with a tiny fixed key set.

import { ASSET_BASE_URL } from "./asset-base";
import { isImageReady } from "./improvement-assets";

export type ConstructionCategory = "econ" | "defense" | "wonder";

const CATEGORIES: ConstructionCategory[] = ["econ", "defense", "wonder"];

export interface ConstructionAtlas {
  /** Images keyed by construction category. */
  readonly images: Record<string, HTMLImageElement>;
  loaded: boolean;
}

/** Start loading the per-category construction-site sprites. */
export function loadConstructionAtlas(onLoad?: () => void): ConstructionAtlas {
  const images: Record<string, HTMLImageElement> = {};
  let remaining = 0;

  const tryFinish = (): void => {
    remaining--;
    if (remaining === 0) (atlas as { loaded: boolean }).loaded = true;
    onLoad?.();
  };

  for (const cat of CATEGORIES) {
    const img = new Image();
    remaining++;
    img.onload = tryFinish;
    img.onerror = tryFinish;
    img.src = `${ASSET_BASE_URL}construction/${cat}.png`;
    images[cat] = img;
  }

  const atlas: ConstructionAtlas = { images, loaded: remaining === 0 };
  return atlas;
}

/** The construction category for a work kind. */
export function constructionCategoryForKind(
  kind: string,
  isEconKind: (k: string) => boolean,
  isDefenseKind: (k: string) => boolean,
): ConstructionCategory {
  if (kind === "wonder") return "wonder";
  if (isDefenseKind(kind)) return "defense";
  // Roads, civ-unique improvements and everything else read as economic build sites.
  void isEconKind;
  return "econ";
}

/** A ready construction sprite for a category, or undefined if not loaded yet. */
export function constructionFrameFor(
  atlas: ConstructionAtlas | undefined,
  category: ConstructionCategory,
): HTMLImageElement | undefined {
  const img = atlas?.images[category];
  return img && isImageReady(img) ? img : undefined;
}
