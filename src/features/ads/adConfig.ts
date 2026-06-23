import { Platform } from 'react-native';

// Google's official TEST ad units. These MUST be used during development — serving real ads to your
// own device/test traffic violates AdMob policy and can get the account suspended. Safe to ship as a
// fallback too (they just earn nothing).
const TEST = {
  android: { banner: 'ca-app-pub-3940256099942544/6300978111', interstitial: 'ca-app-pub-3940256099942544/1033173712' },
  ios:     { banner: 'ca-app-pub-3940256099942544/2934735716', interstitial: 'ca-app-pub-3940256099942544/4411468910' },
};

// ⬇️  PASTE YOUR REAL AdMob ad-unit IDs HERE before a production release.
// Get them at admob.google.com → your app → Ad units. Format: 'ca-app-pub-XXXXXXXXXXXXXXXX/XXXXXXXXXX'.
// Leave any blank ('') to keep using Google's test ad for that slot (safe — just no revenue).
// NOTE: the app-level IDs (not these unit IDs) go in app.json under react-native-google-mobile-ads
// → androidAppId / iosAppId.
const REAL = {
  android: { banner: '', interstitial: '' },
  ios:     { banner: '', interstitial: '' },
};

const PLATFORM = Platform.OS === 'ios' ? 'ios' : 'android';
// Development → always test ads (policy). Production → your real ID, falling back to the test ad for any
// slot you haven't filled in yet, so a release can never crash or serve a broken/empty unit.
const adUnit = (kind: 'banner' | 'interstitial'): string =>
  __DEV__ ? TEST[PLATFORM][kind] : (REAL[PLATFORM][kind] || TEST[PLATFORM][kind]);

export const AD_UNIT_IDS = {
  banner: adUnit('banner'),
  interstitial: adUnit('interstitial'),
};

// Interstitial frequency caps — "Balanced" profile. Tune these freely; they're the
// single source of truth for how often a full-screen ad appears on each screen.
export const INTERSTITIAL_CHORD_CHANGES          = 12;     // Explore: every N chord changes (randomize or manual)
export const INTERSTITIAL_QUIZ_ROUNDS            = 8;      // Quiz: every N questions
export const INTERSTITIAL_PROGRESSION_PLAYTHROUGHS = 3;    // Song: every N completed play-throughs
export const INTERSTITIAL_TUNER_LISTEN_MS        = 180000; // Tuner: every 3 min of active listening
