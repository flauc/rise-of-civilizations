/// <reference types="vite/client" />
import { ACTIVE_ABILITY_DEFS, type ActiveAbilityId } from "@roc/sim";

/**
 * Optional ability icons (docs/UNIT-ABILITIES.md §10). Loaded with the same
 * graceful-fallback pattern as unit sprites: any missing or broken image is
 * simply left undefined and the UI falls back to the ability's emoji glyph, so
 * the feature works with zero art and lights up per-icon as files are added.
 */
export interface AbilityAtlas {
  readonly images: Readonly<Partial<Record<ActiveAbilityId, HTMLImageElement>>>;
  loaded: boolean;
}

function imageUrl(name: string): string {
  return `${import.meta.env.BASE_URL}abilities/${name}.png`;
}

function isReady(img: HTMLImageElement): boolean {
  return img.complete && img.naturalWidth > 0;
}

export function loadAbilityAtlas(onLoad?: () => void): AbilityAtlas {
  const images: Partial<Record<ActiveAbilityId, HTMLImageElement>> = {};
  const ids = Object.keys(ACTIVE_ABILITY_DEFS) as ActiveAbilityId[];
  let remaining = ids.length;

  for (const id of ids) {
    const img = new Image();
    img.src = imageUrl(id);
    const done = (keep: boolean): void => {
      if (keep && isReady(img)) images[id] = img;
      remaining--;
      if (remaining === 0) (atlas as { loaded: boolean }).loaded = true;
      onLoad?.();
    };
    img.onload = () => done(true);
    img.onerror = () => done(false); // missing icon is fine — glyph fallback
  }

  const atlas: AbilityAtlas = { images, loaded: remaining === 0 };
  return atlas;
}

/** Small inline HTML for an ability's icon: <img> if present, else the glyph. */
export function abilityIconHtml(atlas: AbilityAtlas | undefined, id: ActiveAbilityId): string {
  const img = atlas?.images[id];
  if (img) return `<img src="${img.src}" alt="" style="width:16px;height:16px;vertical-align:-3px" />`;
  return `<span style="font-size:15px">${ACTIVE_ABILITY_DEFS[id].glyph}</span>`;
}
