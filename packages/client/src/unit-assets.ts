/// <reference types="vite/client" />
import { UNIT_DEFS, type UnitTypeId } from "@roc/sim";

/** Per-unit image atlas used by the overlay renderer. */
export interface UnitAtlas {
  readonly images: Readonly<Record<UnitTypeId, HTMLImageElement | undefined>>;
  /** True once every requested unit image has finished loading or errored. */
  loaded: boolean;
}

function imageUrl(name: string): string {
  return `${import.meta.env.BASE_URL}units/${name}.png`;
}

/** Returns true when an image has finished loading and has usable pixels. */
export function isImageReady(img: HTMLImageElement): boolean {
  return img.complete && img.naturalWidth > 0;
}

/**
 * Starts loading unit token images.
 *
 * The returned atlas can be passed to the overlay immediately; units fall back
 * to their glyph until each sprite loads. `onLoad` is invoked every time an
 * individual sprite loads or errors so the render loop can redraw.
 */
export function loadUnitAtlas(onLoad?: () => void): UnitAtlas {
  const images: Record<UnitTypeId, HTMLImageElement | undefined> = {} as Record<
    UnitTypeId,
    HTMLImageElement | undefined
  >;

  const unitIds = Object.keys(UNIT_DEFS) as UnitTypeId[];
  let remaining = unitIds.length;

  for (const type of unitIds) {
    const img = new Image();
    img.src = imageUrl(type);

    const onFinish = (): void => {
      if (isImageReady(img)) {
        images[type] = img;
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

  const atlas: UnitAtlas = { images, loaded: remaining === 0 };
  return atlas;
}
