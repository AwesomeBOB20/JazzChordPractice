import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert, Animated, Dimensions, Share, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSettingsStore } from '@features/settings/store/settingsStore';
import { useProgressionStore, DEFAULT_SONGS } from '@features/progression/store/progressionStore';
import { useQuizStore } from '@features/quiz/store/quizStore';
import { THEMES } from '@shared/ui/themes';
import { SharedSettingsPanel } from '@shared/ui';
import { PopUpModal } from '@shared/ui/SharedModals';

const SCREEN_WIDTH = Dimensions.get('window').width;

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { theme, setTheme, factoryReset, isSettingsOpen, setIsSettingsOpen } = useSettingsStore();
  const { clearProgression } = useProgressionStore();
  const { resetQuiz } = useQuizStore();

  const t = THEMES[theme];
  const slideAnim = useRef(new Animated.Value(SCREEN_WIDTH)).current;

  // Calculate the exact height of your TabNavigator tab bar
  const TAB_BAR_HEIGHT = 60 + insets.bottom;

  const [isImportModalVisible, setIsImportModalVisible] = useState(false);
  const [importText, setImportText] = useState('');

  const handleExport = async () => {
    try {
      const songs = useProgressionStore.getState().savedSongs;
      const json = JSON.stringify(songs);
      await Share.share({ message: json, title: 'Jazz Progression Backup' });
    } catch (error) {
      Alert.alert("Export Failed", "Could not export songs.");
    }
  };

  const handleImport = () => {
    try {
      if (!importText.trim()) return;
      const parsed = JSON.parse(importText);
      if (Array.isArray(parsed)) {
        useProgressionStore.getState().importSongs(parsed);
        setIsImportModalVisible(false);
        setImportText('');
        Alert.alert("Success", `Imported ${parsed.length} songs successfully!`);
      } else {
        Alert.alert("Invalid Data", "The pasted text is not a valid backup.");
      }
    } catch (error) {
      Alert.alert("Error", "Could not parse the pasted text.");
    }
  };

  useEffect(() => {
    if (isSettingsOpen) {
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        damping: 25,
        stiffness: 250,
        mass: 0.8
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: SCREEN_WIDTH,
        duration: 250,
        useNativeDriver: true,
      }).start();
    }
  }, [isSettingsOpen]);

  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 100, elevation: 10 }} pointerEvents="box-none">
      <Animated.View style={[
        styles.container, 
        { 
          backgroundColor: t.bg,
          transform: [{ translateX: slideAnim }],
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: TAB_BAR_HEIGHT, // Docks perfectly above the tab bar
        }
      ]}>
      
      {/* Local Header for Navigation - Pushed down by safe area insets */}
      <View style={[styles.headerRow, { paddingTop: Math.max(insets.top, 20) + 16 }]}>
        <TouchableOpacity onPress={() => setIsSettingsOpen(false)} style={styles.backBtn} hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}>
          <Ionicons name="chevron-back" size={28} color={t.txt1} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: t.txt1 }]}>Settings</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        
        {/* App Theme Picker */}
        <View style={[styles.card, { backgroundColor: t.bg2, borderColor: t.border }]}>
          <Text style={[styles.sectionLabel, { color: t.accent }]}>APP THEME</Text>
          <View style={styles.themeRow}>
            {Object.entries(THEMES).map(([key, th]) => (
              <TouchableOpacity
                key={key}
                activeOpacity={0.7}
                style={[
                  styles.themeCircle,
                  { borderColor: theme === key ? t.txt1 : 'transparent' }
                ]}
                onPress={() => setTheme(key)}>
                <View style={[styles.themeCircleInner, { backgroundColor: th.bg }]}>
                  <View style={[styles.themeCircleHalf, { backgroundColor: th.accent }]} />
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* The Tabbed Preferences Panel */}
        <View style={[styles.card, { backgroundColor: t.bg2, borderColor: t.border }]}>
          <Text style={[styles.sectionLabel, { color: t.accent }]}>GLOBAL PREFERENCES</Text>
          <SharedSettingsPanel />
        </View>

        {/* Data Management */}
        <View style={[styles.card, { backgroundColor: t.bg2, borderColor: '#63992240' }]}>
          <Text style={[styles.sectionLabel, { color: '#639922' }]}>DATA MANAGEMENT</Text>
          
          <TouchableOpacity style={styles.dangerRow} activeOpacity={0.7} onPress={handleExport}>
            <View style={styles.settingLeft}>
              <Ionicons name="share-outline" size={18} color="#639922" />
              <Text style={[styles.label, { color: '#639922' }]}>Export Progressions Backup</Text>
            </View>
          </TouchableOpacity>

          <View style={[styles.divider, { backgroundColor: t.border }]} />

          <TouchableOpacity style={styles.dangerRow} activeOpacity={0.7} onPress={() => setIsImportModalVisible(true)}>
            <View style={styles.settingLeft}>
              <Ionicons name="download-outline" size={18} color="#639922" />
              <Text style={[styles.label, { color: '#639922' }]}>Import Progressions Backup</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Danger Zone */}
        <View style={[styles.card, { backgroundColor: t.bg2, borderColor: '#D4537E40' }]}>
          <Text style={[styles.sectionLabel, { color: '#D4537E' }]}>DANGER ZONE</Text>
          
          <TouchableOpacity
            style={styles.dangerRow}
            activeOpacity={0.7}
            onPress={() => {
              Alert.alert(
                "Reset App Data",
                "Are you sure you want to clear your quiz scores and chord progressions? This cannot be undone.",
                [
                  { text: "Cancel", style: "cancel" },
                  { text: "Reset", style: "destructive", onPress: () => {
                    resetQuiz();
                    clearProgression();
                    useProgressionStore.setState({ savedSongs: DEFAULT_SONGS });
                  }}
                ]
              );
            }}>
            <View style={styles.settingLeft}>
              <Ionicons name="trash-outline" size={18} color="#D4537E" />
              <Text style={[styles.label, { color: '#D4537E' }]}>Clear Stored Progress</Text>
            </View>
          </TouchableOpacity>

          <View style={[styles.divider, { backgroundColor: t.border }]} />

          <TouchableOpacity
            style={styles.dangerRow}
            activeOpacity={0.7}
            onPress={() => {
              Alert.alert(
                "Factory Reset",
                "Are you sure you want to restore all settings to default? This will wipe your progress, preferences, and custom chord pools.",
                [
                  { text: "Cancel", style: "cancel" },
                  { text: "Restore Defaults", style: "destructive", onPress: () => {
                    factoryReset();
                  }}
                ]
              );
            }}>
            <View style={styles.settingLeft}>
              <Ionicons name="warning-outline" size={18} color="#D4537E" />
              <Text style={[styles.label, { color: '#D4537E' }]}>Restore Default Settings</Text>
            </View>
          </TouchableOpacity>
        </View>

      </ScrollView>

      {/* Import Modal */}
      <PopUpModal visible={isImportModalVisible} onClose={() => setIsImportModalVisible(false)}>
        <View style={{ width: '100%', padding: 20, borderRadius: 16, backgroundColor: t.bg, borderWidth: 1, borderColor: t.border }}>
          <Text style={{ fontSize: 20, fontWeight: '800', color: t.txt1, marginBottom: 12 }}>Import Backup</Text>
          <Text style={{ fontSize: 14, color: t.txt2, marginBottom: 16 }}>Paste your exported backup code below to merge it with your current library.</Text>
          <TextInput
            style={{ height: 120, borderRadius: 8, borderWidth: 1, borderColor: t.border, backgroundColor: t.bg2, color: t.txt1, padding: 12, textAlignVertical: 'top' }}
            multiline
            placeholder="Paste backup JSON here..."
            placeholderTextColor={t.txt3}
            value={importText}
            onChangeText={setImportText}
          />
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 20 }}>
            <TouchableOpacity style={{ paddingVertical: 10, paddingHorizontal: 16 }} onPress={() => { setIsImportModalVisible(false); setImportText(''); }}>
              <Text style={{ color: t.txt3, fontSize: 16, fontWeight: '600' }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={{ paddingVertical: 10, paddingHorizontal: 16, backgroundColor: '#639922', borderRadius: 8 }} onPress={handleImport}>
              <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>Import</Text>
            </TouchableOpacity>
          </View>
        </View>
      </PopUpModal>

      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: 16, paddingBottom: 32 },
  card: {
    borderRadius: 20, padding: 16,
    marginBottom: 16, borderWidth: 1,
  },
  sectionLabel: {
    fontSize: 11, fontWeight: '800',
    letterSpacing: 1.5, marginBottom: 14,
  },
  themeRow: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    gap: 8,
    justifyContent: 'center',
  },
  themeCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2.5,
    padding: 2,
  },
  themeCircleInner: {
    width: '100%',
    height: '100%',
    borderRadius: 12,
    overflow: 'hidden',
  },
  themeCircleHalf: {
    position: 'absolute',
    right: 0,
    top: 0,
    width: '50%',
    height: '100%',
  },
  dangerRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 8,
  },
  settingLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { fontSize: 14, fontWeight: '600' },
  divider: { height: 1, marginVertical: 4 },
  
  /* Removed paddingTop: 16 from here since it's applied inline with safe area */
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 4 },
  backBtn: { padding: 4, marginLeft: -4 },
  headerTitle: { fontSize: 20, fontWeight: '800' },
});