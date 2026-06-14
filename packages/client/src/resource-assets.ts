/// <reference types="vite/client" />
import { RESOURCE_DEFS, RESOURCE_IDS, type ResourceId } from "@roc/sim";

/** Per-resource image atlas used by the renderer. */
export interface ResourceAtlas {
  readonly images: Readonly<Record<ResourceId, HTMLImageElement | undefined>>;
  /** True once every requested resource image has finished loading or errored. */
  loaded: boolean;
}

function imageUrl(name: string): string {
  return `${import.meta.env.BASE_URL}resources/${name}.png`;
}

/** Returns true when an image has finished loading and has usable pixels. */
export function isImageReady(img: HTMLImageElement): boolean {
  return img.complete && img.naturalWidth > 0;
}

/**
 * Starts loading resource token images.
 *
 * The returned atlas can be passed to the renderer immediately; resources fall
 * back to their text initials until each sprite loads. `onLoad` is invoked every
 * time an individual sprite loads or errors so the render loop can redraw.
 */
export function loadResourceAtlas(onLoad?: () => void): ResourceAtlas {
  const images: Record<ResourceId, HTMLImageElement | undefined> = {} as Record<
    ResourceId,
    HTMLImageElement | undefined
  >;

  let remaining = RESOURCE_IDS.length;

  for (const id of RESOURCE_IDS) {
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

  const atlas: ResourceAtlas = { images, loaded: remaining === 0 };
  return atlas;
}
