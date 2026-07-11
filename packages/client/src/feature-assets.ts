/// <reference types="vite/client" />

import { ASSET_BASE_URL } from "./asset-base";
import { hashSeed } from "@roc/shared";

const VILLAGE_FRAMES = 4; // village_thatched.png / village_wood.png (+ _1.._3)
const BARB_CAMP_FRAMES = 3; // barb_camp.png (bandit camp), _1 (stakes), _2 (thatched)
const RUIN_FRAMES = 4; // ruin.png, ruin_1.png .. ruin_3.png

/** Turn on/after which a thatched village has grown into a timber-framed one. */
export const VILLAGE_UPGRADE_TURN = 25;

export interface FeatureAtlas {
  /** Early-game thatched hamlets. */
  readonly villageThatched: ReadonlyArray<HTMLImageElement | undefined>;
  /** The timber-framed villages thatched hamlets become after VILLAGE_UPGRADE_TURN. */
  readonly villageWood: ReadonlyArray<HTMLImageElement | undefined>;
  readonly barbCamp: ReadonlyArray<HTMLImageElement | undefined>;
  readonly ruin: ReadonlyArray<HTMLImageElement | undefined>;
  loaded: boolean;
}

function frameUrl(base: string, frame: number): string {
  const suffix = frame === 0 ? "" : `_${frame}`;
  return `${ASSET_BASE_URL}buildings/${base}${suffix}.png`;
}

/** Returns true when an image has finished loading and has usable pixels. */
export function isImageReady(img: HTMLImageElement): boolean {
  return img.complete && img.naturalWidth > 0;
}

/** Starts loading village and barbarian-camp feature sprites. */
export function loadFeatureAtlas(onLoad?: () => void): FeatureAtlas {
  const villageThatched: (HTMLImageElement | undefined)[] = [];
  const villageWood: (HTMLImageElement | undefined)[] = [];
  const barbCamp: (HTMLImageElement | undefined)[] = [];
  const ruin: (HTMLImageElement | undefined)[] = [];
  let remaining = VILLAGE_FRAMES * 2 + BARB_CAMP_FRAMES + RUIN_FRAMES;

  function finishSlot(
    array: (HTMLImageElement | undefined)[],
    frame: number,
    img: HTMLImageElement,
  ): void {
    if (isImageReady(img)) {
      array[frame] = img;
    }
    remaining--;
    if (remaining === 0) {
      (atlas as { loaded: boolean }).loaded = true;
    }
    onLoad?.();
  }

  const loadSet = (base: string, frames: number, into: (HTMLImageElement | undefined)[]): void => {
    for (let frame = 0; frame < frames; frame++) {
      const img = new Image();
      img.src = frameUrl(base, frame);
      into.push(img);
      img.onload = () => finishSlot(into, frame, img);
      img.onerror = () => finishSlot(into, frame, img);
    }
  };

  loadSet("village_thatched", VILLAGE_FRAMES, villageThatched);
  loadSet("village_wood", VILLAGE_FRAMES, villageWood);
  loadSet("barb_camp", BARB_CAMP_FRAMES, barbCamp);
  loadSet("ruin", RUIN_FRAMES, ruin);

  const atlas: FeatureAtlas = { villageThatched, villageWood, barbCamp, ruin, loaded: remaining === 0 };
  return atlas;
}

function pickFrame(
  frames: ReadonlyArray<HTMLImageElement | undefined>,
  seed: string,
): HTMLImageElement | undefined {
  const ready = frames.filter((img): img is HTMLImageElement => img !== undefined && isImageReady(img));
  if (ready.length === 0) return undefined;
  return ready[hashSeed(seed) % ready.length];
}

/**
 * Pick a deterministic village frame for a tile. Villages start as thatched
 * hamlets and become timber-framed on/after VILLAGE_UPGRADE_TURN. Both sets share
 * the same pick seed, so a given village keeps its identity (frame N thatched →
 * frame N wood) when it upgrades.
 */
export function villageFrameFor(
  atlas: FeatureAtlas | undefined,
  col: number,
  row: number,
  turn: number,
): HTMLImageElement | undefined {
  const frames = turn >= VILLAGE_UPGRADE_TURN ? atlas?.villageWood : atlas?.villageThatched;
  return pickFrame(frames ?? [], `${col},${row},village`);
}

/** Pick a deterministic barbarian-camp frame for a given tile coordinate. */
export function barbCampFrameFor(
  atlas: FeatureAtlas | undefined,
  col: number,
  row: number,
): HTMLImageElement | undefined {
  return pickFrame(atlas?.barbCamp ?? [], `${col},${row},barb_camp`);
}

/** Pick a deterministic ruin frame for a given tile coordinate. */
export function ruinFrameFor(
  atlas: FeatureAtlas | undefined,
  col: number,
  row: number,
): HTMLImageElement | undefined {
  return pickFrame(atlas?.ruin ?? [], `${col},${row},ruin`);
}
