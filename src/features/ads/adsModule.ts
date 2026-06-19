import { Platform, TurboModuleRegistry, NativeModules } from 'react-native';

// react-native-google-mobile-ads is a CUSTOM native module. It is absent in Expo Go and in any
// dev/preview build that wasn't compiled with it. The library calls
// TurboModuleRegistry.getEnforcing('RNGoogleMobileAdsModule') at module top-level, so a plain
// `import ... from 'react-native-google-mobile-ads'` crashes on load in those environments.
//
// Probe with get() (returns null instead of throwing) and only require the library when the
// native module is actually present. Everywhere else (web, Expo Go, ads-less dev client) the app
// runs normally with ads simply disabled — letting `expo start` work for testing the rest of the app.
export const adsReady: boolean =
  Platform.OS !== 'web' &&
  (!!TurboModuleRegistry.get?.('RNGoogleMobileAdsModule') ||
    !!(NativeModules as any).RNGoogleMobileAdsModule);

let mod: any = null;
if (adsReady) {
  try {
    mod = require('react-native-google-mobile-ads');
  } catch {
    mod = null;
  }
}

// The loaded library namespace (BannerAd, BannerAdSize, InterstitialAd, AdEventType, …) or null.
export const Ads: any = mod;
