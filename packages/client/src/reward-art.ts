// Announcement art for tribal village and barbarian camp rewards.
//
// These sit outside the sprite atlases: the popup points a plain <img> at one on
// demand. Two callers need the same URL scheme, the dialog that shows a reward
// and the boot preloader that warms them all, so it lives here rather than in
// either of them.

import { assetUrl } from "./asset-base";
import { FEATURE_REWARD_TYPES, type FeatureRewardType } from "@roc/sim";

/** The picture shown when `reward` is announced. */
export function rewardArtUrl(reward: FeatureRewardType): string {
  if (reward === "camp_cleared") {
    return assetUrl("barbarian-rewards/barb_camp_cleared.png");
  }
  return assetUrl(`village-rewards/village_reward_${reward}.png`);
}

/** Every reward picture (13 files, ~0.5 MB), for warming at boot. */
export function allRewardArtUrls(): string[] {
  return FEATURE_REWARD_TYPES.map(rewardArtUrl);
}
