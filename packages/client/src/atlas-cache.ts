// One shared atlas per loader, for the whole page lifetime.
//
// The atlases are warmed at boot (see asset-preload.ts) and then asked for again
// by startGame, and again by every game after the first. The loaders keep no
// cache of their own: each call allocates a fresh Image set and re-issues every
// request, so without this wrapper a warmed boot would fetch the whole ~50 MB
// sprite set twice and only the HTTP cache would hide it.

/** The shape every load*Atlas() return value shares. */
export interface AtlasLike {
  loaded: boolean;
}

/**
 * Wraps a `load*Atlas(onLoad?)` so every caller shares one atlas and one set of
 * requests. The first call starts the load; later callers get the same object
 * back and their `onLoad` joins the redraw pings still to come. A caller that
 * arrives after the atlas has fully streamed gets a single ping instead, so it
 * still redraws once against the warm sprites.
 */
export function shareAtlas<T extends AtlasLike>(
  load: (onLoad?: () => void) => T,
): (onLoad?: () => void) => T {
  let atlas: T | null = null;
  const listeners = new Set<() => void>();

  return (onLoad?: () => void): T => {
    if (!atlas) {
      atlas = load(() => {
        for (const listener of listeners) listener();
        // Pings stop once every sprite has settled, so drop the callbacks rather
        // than pin redraw closures from games that have already ended.
        if (atlas?.loaded) listeners.clear();
      });
    }
    if (onLoad) {
      if (atlas.loaded) onLoad();
      else listeners.add(onLoad);
    }
    return atlas;
  };
}
