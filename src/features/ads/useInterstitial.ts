import { useEffect, useRef, useCallback } from 'react';
import { useSettingsStore } from '@features/settings/store/settingsStore';
import { AD_UNIT_IDS } from './adConfig';
import { Ads } from './adsModule';

// Hook that tracks a counter and fires an interstitial every `everyN` calls.
// No-ops anywhere the AdMob native module is absent (web, Expo Go, ads-less dev client) and for
// Pro users. Usage:
//   const { recordAction } = useInterstitial({ everyN: INTERSTITIAL_QUIZ_ROUNDS });
//   // call recordAction() each time the triggering event fires (quiz round, randomize, etc.)
export function useInterstitial({ everyN }: { everyN: number }) {
  const isPro = useSettingsStore(s => s.isPro);
  const counterRef = useRef(0);
  const adRef = useRef<any>(null);
  const loadedRef = useRef(false);

  const load = useCallback(() => {
    if (isPro || !Ads) return;
    const { InterstitialAd, AdEventType } = Ads;
    const ad = InterstitialAd.createForAdRequest(AD_UNIT_IDS.interstitial, {
      requestNonPersonalizedAdsOnly: false,
    });
    ad.addAdEventListener(AdEventType.LOADED, () => { loadedRef.current = true; });
    ad.addAdEventListener(AdEventType.CLOSED, () => {
      loadedRef.current = false;
      load(); // preload next one immediately after close
    });
    ad.load();
    adRef.current = ad;
  }, [isPro]);

  useEffect(() => {
    load();
    return () => { adRef.current = null; };
  }, [load]);

  const recordAction = useCallback(() => {
    if (isPro || !Ads) return;
    counterRef.current += 1;
    if (counterRef.current >= everyN) {
      counterRef.current = 0;
      if (loadedRef.current && adRef.current) {
        adRef.current.show();
      }
    }
  }, [isPro, everyN]);

  return { recordAction };
}
