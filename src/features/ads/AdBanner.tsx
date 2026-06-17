import React from 'react';
import { Platform, View } from 'react-native';
import { BannerAd, BannerAdSize } from 'react-native-google-mobile-ads';
import { useSettingsStore } from '@features/settings/store/settingsStore';
import { AD_UNIT_IDS } from './adConfig';

// Renders a full-width AdMob banner. Invisible for Pro users and on web.
// Place at the bottom of free screens, above the safe-area inset.
export function AdBanner() {
  const isPro = useSettingsStore(s => s.isPro);

  if (isPro || Platform.OS === 'web') return null;

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
