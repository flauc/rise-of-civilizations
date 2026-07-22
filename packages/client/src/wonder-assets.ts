/// <reference types="vite/client" />

import type { GameState } from "@roc/sim";
import { ASSET_BASE_URL } from "./asset-base";

export interface WonderAtlas {
  readonly images: Record<string, HTMLImageElement | undefined>;
  /** True once every requested id has settled (loaded or missing). */
  loaded: boolean;
}

function isReady(img: HTMLImageElement): boolean {
  return img.complete && img.naturalWidth > 0;
}

let shared: WonderAtlas | null = null;

/** Shared on-demand atlas; starts empty (already "loaded"). */
export function getWonderAtlas(): WonderAtlas {
  if (!shared) shared = { images: {}, loaded: true };
  return shared;
}

/** Player-built wonder ids on the map (usually 0 at game start). */
export function wonderIdsOnMap(state: GameState): string[] {
  const ids = new Set<string>();
  for (const t of state.map.tiles) {
    if (t.wonder) ids.add(t.wonder);
  }
  return [...ids];
}

/** Load decor sprites for the given ids; skips ids already requested. */
export function ensureWonderTiles(
  atlas: WonderAtlas,
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
    img.src = `${ASSET_BASE_URL}wonders/${id}.png`;
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

/** The loaded decor sprite for a wonder id, or undefined if not ready. */
export function wonderTileImage(
  atlas: WonderAtlas | undefined,
  id: string,
): HTMLImageElement | undefined {
  const img = atlas?.images[id];
  return img && isReady(img) ? img : undefined;
}
