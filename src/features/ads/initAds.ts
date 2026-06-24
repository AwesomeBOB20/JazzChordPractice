import { adsReady, Ads } from './adsModule';

// ─── AdMob bootstrap: EU consent (Google UMP) → then initialize the SDK ───────────────────────────
// Google REQUIRES that consent is gathered BEFORE the Mobile Ads SDK is initialized for users in the
// EU/EEA/UK (GDPR). This runs that flow once at startup:
//   1. requestInfoUpdate()                 — refresh the device's consent status for its region
//   2. loadAndShowConsentFormIfRequired()  — show the consent form ONLY where required (no-op elsewhere,
//                                            and shown at most once — the UMP SDK remembers the choice)
//   3. mobileAds().initialize()            — start the SDK, only after consent is settled
//
// No-ops on web / Expo Go / any build compiled without the native module (adsReady=false), so those
// environments run normally with ads disabled. Failures are swallowed — a consent/init hiccup must
// never crash the app; at worst, ads just don't show. Pro users still see no ads (the banner +
// interstitial components gate on isPro), so this bootstrap is harmless for them.
let started = false;

export async function initAds(): Promise<void> {
  if (started || !adsReady || !Ads) return;
  started = true;
  try {
    const { AdsConsent } = Ads;
    const mobileAds = Ads.default; // the library's default export is the mobileAds() accessor

    if (AdsConsent) {
      // To TEST the EU form from a non-EU device, pass options here, e.g.:
      //   await AdsConsent.requestInfoUpdate({ debugGeography: AdsConsent.DebugGeography.EEA,
      //                                        testDeviceIdentifiers: ['YOUR_DEVICE_ID'] });
      await AdsConsent.requestInfoUpdate();
      await AdsConsent.loadAndShowConsentFormIfRequired();
    }

    if (typeof mobileAds === 'function') {
      await mobileAds().initialize();
    }
  } catch {
    // Consent/init failure must never crash the app — ads simply won't show.
  }
}
