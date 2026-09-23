/// <reference types="vite/client" />
import { ASSET_BASE_URL } from "./asset-base";
import { shareAtlas } from "./atlas-cache";

/**
 * Wall artwork: one side piece per hex-edge axis plus a joint tower, for each
 * wall tier and each structure condition.
 *
 * A wall side is drawn between the two corners of its hex edge, and a tower
 * stands on every corner a wall run touches. The towers cover the joints, so the
 * side pieces never have to agree with each other pixel for pixel. Our
 * pointy-top hexes have three edge axes, and the art ships one render per axis:
 *
 *     side 0, 3  ->  "v"   vertical edge (E / W)
 *     side 1, 4  ->  "u"   up-to-the-right edge  "/"   (NE / SW)
 *     side 2, 5  ->  "d"   down-to-the-right edge "\\"  (SE / NW)
 *
 * Prepared by tools/fortification-art.py.
 */
export type WallOrient = "v" | "u" | "d";

/** The structure conditions the art is drawn in (see structureCondition). */
export type WallState = "intact" | "damaged" | "destroyed";

/** Orientation of each hex side, by side index (corners[sd]..corners[sd+1]). */
export const SIDE_ORIENT: readonly WallOrient[] = ["v", "u", "d", "v", "u", "d"];

/** Art folder of each wall tier, by tier - 1: Palisade, Stone Wall, Great Wall. */
const SET_DIRS = ["palisade", "stone", "great"] as const;

/**
 * A side piece, with the ground points of both of its ends (`a`, `b`) in its
 * own image's pixel space, so it can be fitted between two hex corners.
 */
export interface WallSide {
  img: HTMLImageElement;
  w: number;
  h: number;
  ax: number;
  ay: number;
  bx: number;
  by: number;
}

/** A joint tower; its anchor is the centre of its footprint. */
export interface WallTower {
  img: HTMLImageElement;
  w: number;
  h: number;
  ax: number;
  ay: number;
}

/** One tier's pieces, every one of them in all three conditions. */
export interface WallSet {
  /** Joint tower size relative to the side pieces' scale. */
  towerScale: number;
  sides: Record<WallOrient, Record<WallState, WallSide>>;
  tower: Record<WallState, WallTower>;
}

type Placed<T> = Omit<T, "img"> & { file: string };

interface WallManifest {
  towerScale: number;
  sides: Record<WallOrient, Record<WallState, Placed<WallSide>>>;
  tower: Record<WallState, Placed<WallTower>>;
}

export interface WallAtlas {
  /** Each tier's set, by tier - 1, once its manifest and every piece have loaded. */
  sets: (WallSet | undefined)[];
  /** True once every set has loaded or errored. */
  loaded: boolean;
}

const ORIENTS: readonly WallOrient[] = ["v", "u", "d"];
const STATES: readonly WallState[] = ["intact", "damaged", "destroyed"];

/** Returns true when an image has finished loading and has usable pixels. */
export function isImageReady(img: HTMLImageElement): boolean {
  return img.complete && img.naturalWidth > 0;
}

/** The painted set for a wall tier, or undefined while it has yet to stream in. */
export function wallSetForTier(atlas: WallAtlas | undefined, tier: number): WallSet | undefined {
  return atlas?.sets[Math.min(SET_DIRS.length, Math.max(1, tier)) - 1];
}

/** Fetches every tier's manifest and pieces; `onLoad` fires as each set settles. */
export const loadWallAtlas = shareAtlas(loadWallAtlasUncached);

function loadWallAtlasUncached(onLoad?: () => void): WallAtlas {
  const atlas: WallAtlas = { sets: [], loaded: false };
  Promise.all(
    SET_DIRS.map((dir, i) =>
      loadWallSet(`${ASSET_BASE_URL}walls/${dir}/`)
        .then((set) => {
          atlas.sets[i] = set ?? undefined;
        })
        .catch(() => undefined)
        .finally(() => onLoad?.()),
    ),
  ).finally(() => {
    atlas.loaded = true;
    onLoad?.();
  });
  return atlas;
}

async function loadWallSet(base: string): Promise<WallSet | null> {
  const r = await fetch(`${base}manifest.json`);
  if (!r.ok) return null;
  const m = (await r.json()) as WallManifest;
  if (!m?.sides || !m.tower) return null;

  // Several states share a render, so each file is requested once.
  const images = new Map<string, Promise<HTMLImageElement | null>>();
  const load = (file: string): Promise<HTMLImageElement | null> => {
    let p = images.get(file);
    if (!p) {
      p = new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(isImageReady(img) ? img : null);
        img.onerror = () => resolve(null);
        img.src = `${base}${file}.png`;
      });
      images.set(file, p);
    }
    return p;
  };
  const place = async <T extends { file: string }>(g: T) => {
    const { file, ...rest } = g;
    const img = await load(file);
    if (!img) throw new Error(`missing wall piece ${file}`);
    return { img, ...rest };
  };

  const sides = { v: {}, u: {}, d: {} } as WallSet["sides"];
  const tower = {} as WallSet["tower"];
  try {
    await Promise.all([
      ...ORIENTS.flatMap((o) =>
        STATES.map(async (s) => {
          sides[o][s] = await place(m.sides[o][s]);
        }),
      ),
      ...STATES.map(async (s) => {
        tower[s] = await place(m.tower[s]);
      }),
    ]);
  } catch {
    // A set is drawn whole or not at all: its tier keeps the vector rampart.
    return null;
  }
  return { towerScale: m.towerScale, sides, tower };
}
