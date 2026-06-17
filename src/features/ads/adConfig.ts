import { Platform } from 'react-native';

// Replace TEST_* with real AdMob IDs after registering the app at admob.google.com.
// Real IDs format: ca-app-pub-XXXXXXXXXXXXXXXX/XXXXXXXXXX
// Real app IDs go in app.json under react-native-google-mobile-ads.androidAppId / iosAppId.
const TEST_ANDROID_BANNER      = 'ca-app-pub-3940256099942544/6300978111';
const TEST_ANDROID_INTERSTITIAL = 'ca-app-pub-3940256099942544/1033173712';
const TEST_IOS_BANNER          = 'ca-app-pub-3940256099942544/2934735716';
const TEST_IOS_INTERSTITIAL    = 'ca-app-pub-3940256099942544/4411468910';

// TODO: replace with real ad unit IDs from AdMob dashboard after app registration.
export const AD_UNIT_IDS = {
  banner:       Platform.OS === 'ios' ? TEST_IOS_BANNER       : TEST_ANDROID_BANNER,
  interstitial: Platform.OS === 'ios' ? TEST_IOS_INTERSTITIAL : TEST_ANDROID_INTERSTITIAL,
};

// Interstitial frequency caps — how many user actions between each interstitial.
export const INTERSTITIAL_QUIZ_ROUNDS   = 5;  // show after every N completed quiz rounds
export const INTERSTITIAL_RANDOMIZES    = 10; // show after every N randomize presses in Explore
