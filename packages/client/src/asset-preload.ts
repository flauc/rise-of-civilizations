// Pull the game's assets down while the player is still in the lobby.
//
// Everything here is work startGame would do anyway. Doing it at boot buys the
// gap between "page opened" and "Start Game clicked", which is usually several
// seconds of an idle connection, so the sprite set and the coach lines are warm
// before the loading veil ever appears.
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
import { loadRoadAtlas } from "./road-assets";
import { loadUnitAtlas } from "./unit-assets";
import { loadCityAtlas } from "./city-assets";
import { loadImprovementAtlas } from "./improvement-assets";
import { loadConstructionAtlas } from "./construction-assets";
import { loadFeatureAtlas } from "./feature-assets";
import { loadNaturalWonderAtlas } from "./natural-wonder-assets";
import { loadWonderAtlas } from "./wonder-assets";
import { loadResourceAtlas } from "./resource-assets";
import { loadAbilityAtlas } from "./ability-assets";
import { loadReligionIconAtlas } from "./religion-assets";
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
 * Whether this connection should eat ~50 MB of sprites for a game that may never
 * be started.
 *
 * Only Chromium exposes this API. Safari and Firefox report nothing, and we
 * preload anyway rather than punish every iPhone and Mac user for the gap: the
 * download is the same one startGame would trigger minutes later, so the cost of
 * guessing wrong is early bytes, not wasted bytes.
 */
export function shouldPreloadAssets(): boolean {
  const info = networkInfo();
  if (!info) return true;
  if (info.saveData) return false;
  if (info.type === "cellular") return false;
  // Some browsers report only effectiveType. It is a round-trip estimate rather
  // than a link type, so a throttled wifi connection can read as 3g: treating
  // that as "too slow to prefetch" is the outcome we want either way.
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

let started = false;

/**
 * Warm the game's assets if the connection can spare it. Safe to call more than
 * once; the atlases are shared and the coach clips are cached, so a later
 * startGame reuses these exact loads instead of re-issuing them.
 */
export function preloadGameAssets(): void {
  if (started || !shouldPreloadAssets()) return;
  started = true;

  // No onLoad callbacks: nothing is drawing yet, so there is no redraw to ping.
  // startGame passes its own when it asks for these same atlases later.
  loadTerrainAtlas();
  loadCoastAtlas();
  loadRiverAtlas();
  loadRoadAtlas();
  loadUnitAtlas();
  loadCityAtlas();
  loadImprovementAtlas();
  loadConstructionAtlas();
  loadFeatureAtlas();
  loadNaturalWonderAtlas();
  loadWonderAtlas();
  loadResourceAtlas();
  loadAbilityAtlas();
  loadReligionIconAtlas();

  preloadRewardArt();
  preloadCoachVoice();
}
