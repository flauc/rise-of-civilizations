// Pull the game's assets down while the player is still in the lobby.
//
// Tier 1 (boot): map essentials the loading veil needs — terrain, units, cities,
// improvements, coast/rivers, resources, features.
//
// Tier 2 (startGame): roads, abilities, construction, religion — loaded in the
// background; the renderer falls back until they arrive.
//
// Wonders load on demand for ids actually on the map (see natural-wonder-assets).
//
// What is deliberately NOT preloaded: the per-civ loading narration. There are
// 137 of those clips totalling ~117 MB and a game plays exactly one, which is
// only knowable once the player picks a civ. The lobby already warms the right
// one on select (see preloadLoadingVoice), long before Start Game.
//
// Nothing here is load-bearing: every atlas already renders against glyph and
// flat-color fallbacks, and every voice line already falls back to browser TTS.
// If the gate says no, or a fetch fails, the game behaves exactly as it did
// before, just with the download happening later.

import { loadTerrainAtlas } from "./terrain-assets";
import { loadCoastAtlas } from "./coast-assets";
import { loadRiverAtlas } from "./river-assets";
import { loadUnitAtlas } from "./unit-assets";
import { loadCityAtlas } from "./city-assets";
import { loadImprovementAtlas } from "./improvement-assets";
import { loadFeatureAtlas } from "./feature-assets";
import { loadResourceAtlas } from "./resource-assets";
import { preloadCoachVoice } from "./coach-voice";
import { allRewardArtUrls } from "./reward-art";

/** The slice of the Network Information API we care about. Not in lib.dom. */
interface NetworkInformation {
  readonly saveData?: boolean;
  readonly type?: string;
  readonly effectiveType?: string;
}

function networkInfo(): NetworkInformation | undefined {
  const nav = navigator as Navigator & {
    connection?: NetworkInformation;
    mozConnection?: NetworkInformation;
    webkitConnection?: NetworkInformation;
  };
  return nav.connection ?? nav.mozConnection ?? nav.webkitConnection;
}

/**
 * Whether this connection should eat sprites for a game that may never
 * be started.
 */
export function shouldPreloadAssets(): boolean {
  const info = networkInfo();
  if (!info) return true;
  if (info.saveData) return false;
  if (info.type === "cellular") return false;
  if (info.effectiveType === "slow-2g" || info.effectiveType === "2g" || info.effectiveType === "3g") {
    return false;
  }
  return true;
}

/**
 * Warm the village/camp announcement art. The dialog fetches one of these at the
 * exact moment the player is waiting to look at it, so warming them means the
 * decode is instant rather than merely correct (see swapArt).
 */
function preloadRewardArt(): void {
  for (const url of allRewardArtUrls()) {
    const img = new Image();
    img.src = url;
  }
}

let tier1Started = false;
let tier2Started = false;

/**
 * Tier 1: warm map essentials during the lobby (shared via atlas-cache when
 * startGame asks for the same atlases).
 */
export function preloadGameAssets(): void {
  if (tier1Started || !shouldPreloadAssets()) return;
  tier1Started = true;

  loadTerrainAtlas();
  loadCoastAtlas();
  loadRiverAtlas();
  loadUnitAtlas();
  loadCityAtlas();
  loadImprovementAtlas();
  loadFeatureAtlas();
  loadResourceAtlas();

  preloadRewardArt();
  preloadCoachVoice();
}

/**
 * Tier 2: non-blocking atlases for startGame (roads, UI panels). Safe to call
 * multiple times.
 */
export function preloadDeferredGameAssets(): void {
  if (tier2Started || !shouldPreloadAssets()) return;
  tier2Started = true;

  preload(() => import("./road-assets").then(({ loadRoadAtlas }) => loadRoadAtlas()));
  preload(() => import("./ability-assets").then(({ loadAbilityAtlas }) => loadAbilityAtlas()));
  preload(() => import("./construction-assets").then(({ loadConstructionAtlas }) => loadConstructionAtlas()));
  preload(() => import("./empire-lazy").then(({ preloadEmpireModule }) => preloadEmpireModule()));
  preload(() => import("./diplomacy-lazy").then(({ preloadDiplomacyModule }) => preloadDiplomacyModule()));
  preload(() => import("./techtree-lazy").then(({ preloadTechTreeModule }) => preloadTechTreeModule()));
  preload(() => import("./ui-god-mode").then(({ preloadGodModePanelModule }) => preloadGodModePanelModule()));
}

/**
 * Best-effort lazy preload. A failed chunk fetch (e.g. a stale PWA client
 * requesting a chunk hash that no longer exists after a redeploy) is swallowed:
 * these atlases/modules all have runtime fallbacks, so a preload miss must never
 * surface as an unhandledrejection.
 */
function preload(load: () => Promise<unknown>): void {
  void load().catch(() => {});
}
