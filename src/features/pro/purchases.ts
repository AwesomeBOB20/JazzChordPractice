// ─── Pro purchase layer ──────────────────────────────────────────────────────
// The single seam between the app and RevenueCat. initPurchases() configures the
// SDK once at startup; getProPrice / purchasePro / restorePro drive the paywall;
// devSetPro is a __DEV__ override. The shapes here match what the UI consumes, so
// the call sites (App.tsx, PaywallModal, Settings) never change.
//
// CONFIG: set the API keys + ENTITLEMENT_ID below. Today they hold the RevenueCat
// "Test Store" key (test_…), which SIMULATES purchases so the whole flow works
// before Google Play / App Store are connected. For production, swap in the real
// per-store public keys (Android 'goog_…', iOS 'appl_…') from the RevenueCat
// dashboard → API keys. The native module has no web support, so every function
// here no-ops on web (the package is also metro-stubbed for web).

import { Platform } from 'react-native';
import Purchases, { LOG_LEVEL, PurchasesPackage } from 'react-native-purchases';
import { useSettingsStore } from '@features/settings/store/settingsStore';

export interface PurchaseResult {
  success: boolean;
  // True when the user already owned Pro (restore, or re-purchase). UI can soften copy.
  alreadyOwned?: boolean;
  // Set when success === false and it wasn't a user cancel — surface to the user.
  error?: string;
  // True when the user simply dismissed the native purchase sheet. Not an error.
  cancelled?: boolean;
}

// RevenueCat PUBLIC SDK keys. ⚠️ Currently the Test Store key (simulated purchases). Before release,
// replace with the real keys: Android 'goog_…', iOS 'appl_…'. (Verify this string matches the dashboard.)
const RC_API_KEY_ANDROID = 'test_nevEonFwFRLHyEVHkznIhyLRykW';
const RC_API_KEY_IOS     = 'test_nevEonFwFRLHyEVHkznIhyLRykW';
// Must match the entitlement IDENTIFIER configured in RevenueCat (the unlock the products grant).
const ENTITLEMENT_ID = 'pro';

const IS_WEB = Platform.OS === 'web';
let ready = false; // true once the SDK is configured (native + a key present)

/** Configure RevenueCat once at app start. No-ops on web or if no key is set (app stays locked, never crashes). */
export async function initPurchases(): Promise<void> {
  if (ready || IS_WEB) return;
  const apiKey = Platform.OS === 'ios' ? RC_API_KEY_IOS : RC_API_KEY_ANDROID;
  if (!apiKey) return;
  try {
    if (__DEV__) Purchases.setLogLevel(LOG_LEVEL.DEBUG);
    Purchases.configure({ apiKey });
    // Keep isPro in sync with the entitlement (restore on another device, refund, expiry…).
    Purchases.addCustomerInfoUpdateListener(info =>
      useSettingsStore.getState().setIsPro(!!info.entitlements.active[ENTITLEMENT_ID]));
    ready = true;
  } catch {
    // Leave ready=false → the calls below degrade gracefully instead of crashing.
  }
}

let cachedPkg: PurchasesPackage | null = null;
async function currentPackage(): Promise<PurchasesPackage | null> {
  if (cachedPkg) return cachedPkg;
  const offerings = await Purchases.getOfferings();
  cachedPkg = offerings.current?.availablePackages[0] ?? null; // the one-time "Lifetime" unlock
  return cachedPkg;
}

/** Localized one-time price string for the unlock, or null if unavailable. */
export async function getProPrice(): Promise<string | null> {
  if (!ready) return null;
  try { return (await currentPackage())?.product.priceString ?? null; } catch { return null; }
}

/** Run the purchase flow; flips isPro when the `pro` entitlement becomes active. */
export async function purchasePro(): Promise<PurchaseResult> {
  if (!ready) return { success: false, error: 'Purchases aren\'t available right now.' };
  try {
    const pkg = await currentPackage();
    if (!pkg) return { success: false, error: 'Store product unavailable. Try again later.' };
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    const isPro = !!customerInfo.entitlements.active[ENTITLEMENT_ID];
    useSettingsStore.getState().setIsPro(isPro);
    return { success: isPro };
  } catch (e: any) {
    if (e?.userCancelled) return { success: false, cancelled: true };
    return { success: false, error: e?.message ?? 'Purchase failed.' };
  }
}

/** Restore a previous purchase across devices on the same store account. */
export async function restorePro(): Promise<PurchaseResult> {
  if (!ready) return { success: false, error: 'No previous purchase found on this account.' };
  try {
    const info = await Purchases.restorePurchases();
    const isPro = !!info.entitlements.active[ENTITLEMENT_ID];
    useSettingsStore.getState().setIsPro(isPro);
    return isPro
      ? { success: true, alreadyOwned: true }
      : { success: false, error: 'No previous purchase found on this account.' };
  } catch (e: any) {
    return { success: false, error: e?.message ?? 'Restore failed.' };
  }
}

/**
 * DEV-ONLY: flip Pro on/off without a store, wired to a __DEV__ toggle in Settings so the paywall +
 * gating can be exercised. Hidden in production builds.
 */
export function devSetPro(on: boolean): void {
  useSettingsStore.getState().setIsPro(on);
}
