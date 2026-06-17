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

// Interstitial frequency caps — "Balanced" profile. Tune these freely; they're the
// single source of truth for how often a full-screen ad appears on each screen.
export const INTERSTITIAL_CHORD_CHANGES          = 12;     // Explore: every N chord changes (randomize or manual)
export const INTERSTITIAL_QUIZ_ROUNDS            = 8;      // Quiz: every N questions
export const INTERSTITIAL_PROGRESSION_PLAYTHROUGHS = 3;    // Song: every N completed play-throughs
export const INTERSTITIAL_TUNER_LISTEN_MS        = 180000; // Tuner: every 3 min of active listening
