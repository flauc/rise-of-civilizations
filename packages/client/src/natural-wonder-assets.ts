/// <reference types="vite/client" />

import type { GameState } from "@roc/sim";
import { ASSET_BASE_URL } from "./asset-base";

export interface NaturalWonderAtlas {
  readonly images: Record<string, HTMLImageElement | undefined>;
  /** True once every requested id has settled (loaded or missing). */
  loaded: boolean;
}

function isReady(img: HTMLImageElement): boolean {
  return img.complete && img.naturalWidth > 0;
}

let shared: NaturalWonderAtlas | null = null;

/** Shared on-demand atlas; starts empty (already "loaded"). */
export function getNaturalWonderAtlas(): NaturalWonderAtlas {
  if (!shared) shared = { images: {}, loaded: true };
  return shared;
}

/** Natural wonder ids placed on the map (typically 6–10 on a large world). */
export function naturalWonderIdsOnMap(state: GameState): string[] {
  const ids = new Set<string>();
  for (const t of state.map.tiles) {
    if (t.naturalWonder) ids.add(t.naturalWonder);
  }
  return [...ids];
}

/** Load full-tile sprites for the given ids; skips ids already requested. */
export function ensureNaturalWonderTiles(
  atlas: NaturalWonderAtlas,
  ids: readonly string[],
  onLoad?: () => void,
): void {
  const pending = ids.filter((id) => !(id in atlas.images));
  if (pending.length === 0) {
    onLoad?.();
    return;
  }
  atlas.loaded = false;
  let remaining = pending.length;
  for (const id of pending) {
    atlas.images[id] = undefined;
    const img = new Image();
    img.src = `${ASSET_BASE_URL}natural-wonders/${id}.png`;
    const done = (): void => {
      if (isReady(img)) atlas.images[id] = img;
      remaining--;
      if (remaining === 0) atlas.loaded = true;
      onLoad?.();
    };
    img.onload = done;
    img.onerror = done;
  }
}

/** The loaded full-tile sprite for a wonder id, or undefined if not ready. */
export function naturalWonderTileImage(
  atlas: NaturalWonderAtlas | undefined,
  id: string,
): HTMLImageElement | undefined {
  const img = atlas?.images[id];
  return img && isReady(img) ? img : undefined;
}
