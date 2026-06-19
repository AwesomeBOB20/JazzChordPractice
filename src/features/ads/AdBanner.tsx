import React from 'react';
import { View } from 'react-native';
import { useSettingsStore } from '@features/settings/store/settingsStore';
import { AD_UNIT_IDS } from './adConfig';
import { Ads } from './adsModule';

// Renders a full-width AdMob banner. Returns null for Pro users and anywhere the AdMob native
// module isn't present (web, Expo Go, ads-less dev client) so those environments never crash.
// Place at the top of free screens, just below the global header.
export function AdBanner() {
  const isPro = useSettingsStore(s => s.isPro);

  if (isPro || !Ads) return null;

  const { BannerAd, BannerAdSize } = Ads;
  return (
    <View style={{ alignItems: 'center', width: '100%' }}>
      <BannerAd
        unitId={AD_UNIT_IDS.banner}
        size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
        requestOptions={{ requestNonPersonalizedAdsOnly: false }}
      />
    </View>
  );
}
