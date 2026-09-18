// src/lib/ad-helpers.ts
// Helper utilities for managing advertising presentation based on Ad-Free entitlement.

/**
 * Determines whether banner advertisements should be rendered.
 * Banners are intrusive automatic ads, so they are suppressed for ad-free subscribers.
 */
export function shouldShowBannerAd(isAdFree: boolean): boolean {
  return !isAdFree;
}

/**
 * Determines whether interstitial (screen-interrupting) ads should be presented.
 * Interstitials are suppressed for ad-free subscribers.
 */
export function shouldShowInterstitialAd(isAdFree: boolean): boolean {
  return !isAdFree;
}

/**
 * Determines whether automatic app open or transition ads should appear.
 * Suppressed for ad-free subscribers.
 */
export function shouldShowAutomaticAd(isAdFree: boolean): boolean {
  return !isAdFree;
}

/**
 * Determines whether a rewarded ad is permitted.
 *
 * ARCHITECTURAL DECISION ON REWARDED ADS:
 * An Ad-Free subscription eliminates intrusive, non-consensual advertisements (banners, interstitials).
 * However, voluntary Rewarded Ads (where a user explicitly taps "Watch an ad for an extra attempt / bonus")
 * remain accessible to everyone, including subscribers, should the user willingly choose to watch one.
 * If userRequested is true, the user is taking a deliberate action to claim a game reward.
 */
export function isRewardedAdAllowed(isAdFree: boolean, userRequested = true): boolean {
  if (userRequested) {
    return true;
  }
  return !isAdFree;
}
