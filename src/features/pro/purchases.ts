// ─── Pro purchase layer ──────────────────────────────────────────────────────
// This is the single seam between the app and the store/IAP provider. It is
// STUBBED today: there is no RevenueCat SDK wired yet (no account/keys — Track A).
// Everything here resolves locally and flips the persisted `isPro` flag so the
// full paywall + gating can be built and tested now.
//
// TO GO LIVE (Track A done): install `react-native-purchases`, configure it in
// initPurchases() with the platform API key, and replace the stub bodies of
// getProPrice / purchasePro / restorePro with Purchases.getOfferings(),
// Purchases.purchasePackage(...) and Purchases.restorePurchases(). The shapes
// returned here already match what the UI consumes, so the call sites won't change.

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

// Display price for the one-time unlock. Real impl reads the localized store price.
const STUB_PRICE = '$9.99';

let initialized = false;

/** Call once at app start. No-op for the stub; real impl configures the SDK. */
export async function initPurchases(): Promise<void> {
  if (initialized) return;
  initialized = true;
  // TODO(revenuecat): Purchases.configure({ apiKey });
}

/** Localized one-time price string for the unlock, or null if unavailable. */
export async function getProPrice(): Promise<string | null> {
  // TODO(revenuecat): read from Purchases.getOfferings().current.availablePackages[0].product.priceString
  return STUB_PRICE;
}

/** Run the purchase flow. Stub grants Pro immediately. */
export async function purchasePro(): Promise<PurchaseResult> {
  // TODO(revenuecat): const { customerInfo } = await Purchases.purchasePackage(pkg);
  //                   const isPro = !!customerInfo.entitlements.active['pro'];
  try {
    useSettingsStore.getState().setIsPro(true);
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message ?? 'Purchase failed.' };
  }
}

/** Restore a previous purchase. Stub reports nothing to restore unless already Pro. */
export async function restorePro(): Promise<PurchaseResult> {
  // TODO(revenuecat): const info = await Purchases.restorePurchases();
  //                   const isPro = !!info.entitlements.active['pro'];
  const already = useSettingsStore.getState().isPro;
  if (already) return { success: true, alreadyOwned: true };
  return { success: false, error: 'No previous purchase found on this account.' };
}

/**
 * DEV-ONLY: flip Pro on/off without going through a store. Wired to a toggle in
 * Settings so the paywall + gating can be exercised before RevenueCat is live.
 * Remove (or hide behind __DEV__) when the real purchase flow ships.
 */
export function devSetPro(on: boolean): void {
  useSettingsStore.getState().setIsPro(on);
}
