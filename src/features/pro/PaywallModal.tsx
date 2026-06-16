import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, Alert, StyleSheet } from 'react-native';
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { useSettingsStore } from '@features/settings/store/settingsStore';
import { THEMES } from '@shared/ui/themes';
import { PopUpModal } from '@shared/ui/SharedModals';
import { PRO_BENEFITS, PRO_FEATURE_LABELS } from './proConstants';
import { getProPrice, purchasePro, restorePro } from './purchases';

/**
 * Global paywall overlay. Mounted once in App (like SettingsScreen) and driven by
 * settingsStore.paywallFeature — openPaywall(feature) shows it; closePaywall() / a
 * successful purchase dismisses it. No props.
 */
export default function PaywallModal() {
  const theme = useSettingsStore((s) => s.theme);
  const feature = useSettingsStore((s) => s.paywallFeature);
  const closePaywall = useSettingsStore((s) => s.closePaywall);
  const t = THEMES[theme];

  const visible = feature !== null;
  const [price, setPrice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Load the (localized) price the first time the paywall is opened.
  useEffect(() => {
    if (visible && price === null) {
      getProPrice().then(setPrice).catch(() => setPrice(null));
    }
  }, [visible, price]);

  const onUnlock = async () => {
    if (busy) return;
    setBusy(true);
    const res = await purchasePro();
    setBusy(false);
    if (res.success) {
      closePaywall();
    } else if (!res.cancelled) {
      Alert.alert('Purchase failed', res.error ?? 'Something went wrong. Please try again.');
    }
  };

  const onRestore = async () => {
    if (busy) return;
    setBusy(true);
    const res = await restorePro();
    setBusy(false);
    if (res.success) {
      closePaywall();
      Alert.alert('Restored', 'Your Kordal Pro unlock has been restored.');
    } else {
      Alert.alert('Nothing to restore', res.error ?? 'No previous purchase was found.');
    }
  };

  // Headline reflects the feature the user just bumped into ("Unlock <label>"),
  // falling back to the generic Pro pitch when opened from Settings.
  const label = feature ? PRO_FEATURE_LABELS[feature] : PRO_FEATURE_LABELS.generic;
  const headline = feature && feature !== 'generic' ? `Unlock ${label}` : 'Kordal Pro';

  return (
    <PopUpModal visible={visible} onClose={closePaywall}>
      <View style={[styles.box, { backgroundColor: t.bg2, borderColor: t.border }]}>
        <TouchableOpacity style={styles.closeBtn} onPress={closePaywall} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Ionicons name="close" size={22} color={t.txt3} />
        </TouchableOpacity>

        <View style={styles.header}>
          <View style={[styles.crown, { backgroundColor: t.accent }]}>
            <MaterialCommunityIcons name="crown" size={22} color="#fff" />
          </View>
          <Text style={[styles.title, { color: t.txt1 }]}>{headline}</Text>
          <Text style={[styles.subtitle, { color: t.txt2 }]}>One unlock. Yours forever. No subscription.</Text>
        </View>

        <ScrollView style={{ maxHeight: 300 }} showsVerticalScrollIndicator={false}>
          {PRO_BENEFITS.map((b) => (
            <View key={b.title} style={styles.benefitRow}>
              {b.iconLib === 'ion'
                ? <Ionicons name={b.icon as any} size={20} color={t.accent} style={{ marginTop: 1 }} />
                : <MaterialCommunityIcons name={b.icon as any} size={20} color={t.accent} style={{ marginTop: 1 }} />}
              <View style={{ flex: 1 }}>
                <Text style={[styles.benefitTitle, { color: t.txt1 }]}>{b.title}</Text>
                <Text style={[styles.benefitDetail, { color: t.txt3 }]}>{b.detail}</Text>
              </View>
            </View>
          ))}
        </ScrollView>

        <TouchableOpacity
          activeOpacity={0.8}
          style={[styles.unlockBtn, { backgroundColor: t.accent, opacity: busy ? 0.7 : 1 }]}
          onPress={onUnlock}
          disabled={busy}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.unlockText}>
              {price ? `Unlock Pro — ${price}` : 'Unlock Pro'}
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.restoreBtn} onPress={onRestore} disabled={busy}>
          <Text style={[styles.restoreText, { color: t.txt2 }]}>Restore purchase</Text>
        </TouchableOpacity>
      </View>
    </PopUpModal>
  );
}

const styles = StyleSheet.create({
  box: { width: '100%', padding: 24, borderRadius: 24, borderWidth: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 10 },
  closeBtn: { position: 'absolute', top: 14, right: 14, zIndex: 2, width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  header: { alignItems: 'center', marginBottom: 20 },
  crown: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  title: { fontSize: 22, fontWeight: '800', letterSpacing: 0.3, textAlign: 'center' },
  subtitle: { fontSize: 13, fontWeight: '600', marginTop: 6, textAlign: 'center' },
  benefitRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 16 },
  benefitTitle: { fontSize: 15, fontWeight: '700' },
  benefitDetail: { fontSize: 12, fontWeight: '500', marginTop: 2, lineHeight: 16 },
  unlockBtn: { marginTop: 20, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  unlockText: { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: 0.5 },
  restoreBtn: { marginTop: 14, alignItems: 'center', paddingVertical: 4 },
  restoreText: { fontSize: 13, fontWeight: '600' },
});
