// Coach portrait preload — kept separate so main.ts can gate the tutorial veil
// without pulling in the full tutorial-coach module.

import { assetUrl } from "./asset-base";
import { cutLegendPortraitBackground } from "./coach-portrait";

/** Portrait for the tutorial advisor — file: `public/legends/<id>.png`. */
export const TUTORIAL_COACH_LEGEND_ID = "herodotus";

export function tutorialCoachPortraitUrl(): string {
  return assetUrl(`legends/${TUTORIAL_COACH_LEGEND_ID}.png`);
}

/** Pre-cut coach portrait (transparent PNG). Used when present — no runtime matting. */
export function tutorialCoachCutoutUrl(): string {
  return assetUrl(`coach/legends/${TUTORIAL_COACH_LEGEND_ID}.png`);
}

let portraitPreload: Promise<string | null> | null = null;
let portraitLoadDone = false;
let resolvedPortraitUrl: string | null = null;

/** Start fetching the coach portrait during the tutorial loading veil. */
export function beginTutorialCoachPortraitPreload(): void {
  if (portraitPreload) return;
  portraitPreload = resolveCoachPortraitUrl().then((url) => {
    resolvedPortraitUrl = url;
    portraitLoadDone = true;
    return url;
  });
}

/** Resolves when the coach portrait has loaded (or failed). Safe to call repeatedly. */
export function tutorialCoachPortraitReady(): Promise<void> {
  beginTutorialCoachPortraitPreload();
  return portraitPreload!.then(() => {});
}

export function isTutorialCoachPortraitReady(): boolean {
  return portraitLoadDone;
}

export function resolvedTutorialCoachPortraitUrl(): string | null {
  return resolvedPortraitUrl;
}

function resolveCoachPortraitUrl(): Promise<string | null> {
  return new Promise((resolve) => {
    const sourceUrl = tutorialCoachPortraitUrl();
    const cutoutUrl = tutorialCoachCutoutUrl();
    const finish = (url: string | null): void => resolve(url);

    const preCut = new Image();
    preCut.onload = () => finish(cutoutUrl);
    preCut.onerror = () => {
      const img = new Image();
      img.onload = () => finish(cutLegendPortraitBackground(img) ?? sourceUrl);
      img.onerror = () => finish(null);
      img.src = sourceUrl;
    };
    preCut.src = cutoutUrl;
  });
}
