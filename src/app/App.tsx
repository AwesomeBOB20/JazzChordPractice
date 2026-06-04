import 'react-native-gesture-handler';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Audio } from 'expo-av';
import { NavigationContainer, useNavigationState, DefaultTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Platform, View, Text, TouchableOpacity, Animated } from 'react-native';
import * as Haptics from 'expo-haptics';
import PlayScreen from '@features/play/screens/PlayScreen';
import SettingsScreen from '@features/settings/screens/SettingsScreen';
import QuizScreen from '@features/quiz/screens/QuizScreen';
import ProgressionScreen from '@features/progression/screens/ProgressionScreen';
import TunerScreen from '@features/tuner/screens/TunerScreen';
import { useSettingsStore } from '@features/settings/store/settingsStore';
import { useQuizStore } from '@features/quiz/store/quizStore';
import { THEMES } from '@shared/ui/themes';
import { AudioProvider, useAudio } from '@shared/audio/AudioContext';
import * as SystemUI from 'expo-system-ui';
import * as NavigationBar from 'expo-navigation-bar';
import { ErrorBoundary } from '@shared/ui/ErrorBoundary';
import BpmModal from '@shared/ui/BpmModal';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();
const LIGHT_THEMES = new Set(['light', 'frost', 'sage', 'latte']);

// ─── THE NEW GLOBAL HUD ──────────────────────────────────────────────────────

function SlidingToggle({
  activeIndex, onPressLeft, onPressRight, iconLeft, iconRight, t, width
}: {
  activeIndex: number; onPressLeft: () => void; onPressRight: () => void;
  iconLeft: React.ReactNode; iconRight: React.ReactNode; t: any; width?: number;
}) {
  const anim = useRef(new Animated.Value(activeIndex)).current;

  useEffect(() => {
    Animated.spring(anim, {
      toValue: activeIndex,
      useNativeDriver: true,
      bounciness: 4,
      speed: 16
    }).start();
  }, [activeIndex]);

  const FIXED_BUTTON_WIDTH = 30;
  const PADDING = 4;
  // An explicit width (from the header's measured equal-column math) makes the toggle
  // exactly match the tempo pill; without one it falls back to its natural size.
  const stretch = width != null && width > 0;
  const buttonWidth = stretch
    ? Math.max(0, (width - PADDING * 2) / 2)
    : FIXED_BUTTON_WIDTH;
  const translateX = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, buttonWidth]
  });
  const cellStyle = stretch
    ? { flex: 1, alignItems: 'center' as const, justifyContent: 'center' as const, zIndex: 1 }
    : { width: FIXED_BUTTON_WIDTH, alignItems: 'center' as const, justifyContent: 'center' as const, zIndex: 1 };

  return (
    <View
      style={{ flexDirection: 'row', backgroundColor: t.bg2, borderRadius: 20, padding: PADDING, borderWidth: 1, borderColor: t.border, position: 'relative', height: 40, ...(stretch ? { width } : null) }}
    >
      <Animated.View style={{
        position: 'absolute', left: PADDING, top: PADDING, bottom: PADDING,
        width: buttonWidth, backgroundColor: t.accent, borderRadius: 16,
        transform: [{ translateX }]
      }} />
      <TouchableOpacity activeOpacity={0.7} onPress={onPressLeft} style={cellStyle}>
        {iconLeft}
      </TouchableOpacity>
      <TouchableOpacity activeOpacity={0.7} onPress={onPressRight} style={cellStyle}>
        {iconRight}
      </TouchableOpacity>
    </View>
  );
}

function GlobalHeader({ onOpenBpmModal, currentRoute }: { onOpenBpmModal: () => void; currentRoute: string }) {
  const insets = useSafeAreaInsets();
  
  // 1. Target exact state pieces so the header ignores unrelated background updates
  const theme = useSettingsStore((s: any) => s.theme);
  const instrument = useSettingsStore((s: any) => s.instrument);
  const setInstrument = useSettingsStore((s: any) => s.setInstrument);
  const bpm = useSettingsStore((s: any) => s.bpm);
  const arp = useSettingsStore((s: any) => s.arp);
  const setArp = useSettingsStore((s: any) => s.setArp);
  const arpForced = useSettingsStore((s: any) => s.arpForced);
  const setIsSettingsOpen = useSettingsStore((s: any) => s.setIsSettingsOpen);

  const quizMode = useQuizStore((s: any) => s.quizMode);
  const setQuizMode = useQuizStore((s: any) => s.setQuizMode);
  
  const t = THEMES[theme];

  // Every control (instrument, arpeggiation, the Quiz-only visual/audio toggle, and
  // tempo) gets the same explicit pixel width (computed below) so they're always equal
  // width and fill the row. The Quiz screen just adds one more equal-width control.
  // The settings icon stays a fixed 40×40.
  const isQuiz = currentRoute === 'Quiz';

  // Flex-based equal columns proved unreliable (Yoga wouldn't shrink the tempo pill
  // below its text), so we size the columns explicitly. Measure the row's inner width
  // and divide the leftover (after the fixed settings icon + gaps) evenly among the
  // controls. Every control then gets the SAME pixel width.
  const H_PAD = 16;      // paddingHorizontal
  const GAP = 8;         // gap between items
  const SETTINGS_W = 40; // fixed settings icon
  const [rowWidth, setRowWidth] = useState(0);
  const numControls = isQuiz ? 4 : 3; // instrument, arp, (visual/audio), tempo
  // gaps = one between every adjacent element (controls + settings)
  const numGaps = numControls; // numControls + 1 elements → numControls gaps
  const cellWidth = rowWidth > 0
    ? Math.max(0, (rowWidth - H_PAD * 2 - SETTINGS_W - GAP * numGaps) / numControls)
    : 0;
  const cw = cellWidth > 0 ? cellWidth : undefined; // undefined → natural size for first frame

  return (
    <View
      onLayout={(e) => setRowWidth(e.nativeEvent.layout.width)}
      style={{
      paddingTop: Math.max(insets.top, 20) + 8,
      paddingBottom: 12,
      paddingHorizontal: H_PAD,
      backgroundColor: t.bg,
      flexDirection: 'row',
      alignItems: 'center',
      borderBottomWidth: 1,
      borderBottomColor: t.border,
      zIndex: 10,
      gap: GAP
    }}>
      <SlidingToggle
        width={cw}
        activeIndex={instrument === 'piano' ? 0 : 1}
        onPressLeft={() => setInstrument('piano')}
        onPressRight={() => setInstrument('guitar')}
        iconLeft={<MaterialCommunityIcons name="piano" size={16} color={instrument === 'piano' ? '#fff' : t.txt2} />}
        iconRight={<MaterialCommunityIcons name="guitar-acoustic" size={16} color={instrument === 'guitar' ? '#fff' : t.txt2} />}
        t={t}
      />

      {/* arpForced: intervals/arps/shapes/scales (or the matching quiz categories)
          can only arpeggiate, so the toggle shows — and locks to — arpeggio while
          forced. Taps are ignored so the user's real `arp` preference is preserved
          and restored when they leave the tab. */}
      <SlidingToggle
        width={cw}
        activeIndex={!(arp || arpForced) ? 0 : 1}
        onPressLeft={() => { if (arpForced) return; Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setArp(false); }}
        onPressRight={() => { if (arpForced) return; Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setArp(true); }}
        iconLeft={<MaterialCommunityIcons name="music-note-quarter" size={16} color={!(arp || arpForced) ? '#fff' : t.txt2} />}
        iconRight={<Ionicons name="musical-notes" size={16} color={(arp || arpForced) ? '#fff' : t.txt2} />}
        t={t}
      />

      {isQuiz && (
        <SlidingToggle
          width={cw}
          activeIndex={quizMode === 'visual' ? 0 : 1}
          onPressLeft={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setQuizMode('visual'); }}
          onPressRight={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setQuizMode('audio'); }}
          iconLeft={<Ionicons name="eye" size={16} color={quizMode === 'visual' ? '#fff' : t.txt2} />}
          iconRight={<Ionicons name="ear" size={16} color={quizMode === 'audio' ? '#fff' : t.txt2} />}
          t={t}
        />
      )}

      {/* The Master Clock — metronome icon + live BPM. Same explicit width as the toggles. */}
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={onOpenBpmModal}
        style={{ width: cw, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, height: 40, paddingHorizontal: 12, backgroundColor: t.bg2, borderRadius: 20, borderWidth: 1, borderColor: t.border }}
      >
        <MaterialCommunityIcons name="metronome" size={17} color={t.txt1} />
        <Text style={{ fontSize: 13, fontWeight: '800', color: t.txt1, letterSpacing: 0.5 }}>{bpm}</Text>
      </TouchableOpacity>

      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => setIsSettingsOpen(true)}
        style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center', backgroundColor: t.bg2, borderRadius: 20, borderWidth: 1, borderColor: t.border }}
      >
        <Ionicons name="settings-outline" size={20} color={t.txt2} />
      </TouchableOpacity>
    </View>
  );
}

function TabNavigator({ onOpenBpmModal }: { onOpenBpmModal: () => void }) {
  const insets = useSafeAreaInsets();
  
  // 2. Prevent the Navigator from re-rendering every time a setting changes
  const theme = useSettingsStore((s: any) => s.theme);
  const setIsSettingsOpen = useSettingsStore((s: any) => s.setIsSettingsOpen);
  const setArpForced = useSettingsStore((s: any) => s.setArpForced);

  const t = THEMES[theme];
  const isLight = LIGHT_THEMES.has(theme);

  const { stopAudio } = useAudio();

  // 1. Memoize the listener object so it doesn't destroy navigation performance
  const tabListeners = React.useMemo(() => ({
    tabPress: () => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setIsSettingsOpen(false);
    },
    // Cut off any sounding audio (incl. the sustained Hold tone) when leaving a tab.
    // We hook the navigation 'blur' EVENT rather than an in-screen effect because
    // freezeOnBlur (below) suspends the departing screen's React effects, so its own
    // isFocused-based stop never commits — the tone would keep ringing.
    // Same reason we reset the forced-arp header lock here: the focused screen
    // re-asserts it via useFocusEffect, so any leftover lock from another tab clears.
    blur: () => { stopAudio(); setArpForced(false); },
  }), [setIsSettingsOpen, stopAudio, setArpForced]);

  React.useEffect(() => {
    if (Platform.OS === 'android') {
      SystemUI.setBackgroundColorAsync(t.bg2);
      
      // Force Android Edge-to-Edge UI
      NavigationBar.setPositionAsync('absolute');
      NavigationBar.setBackgroundColorAsync(t.tabBar);
      NavigationBar.setButtonStyleAsync(isLight ? 'dark' : 'light');
    }
  }, [theme, isLight, t.bg2, t.tabBar]);

  return (
    <Tab.Navigator
      initialRouteName="Play"
      // PERFORMANCE: keep every tab's native views attached at all times (default on
      // Android is to DETACH inactive screens, so each switch pays to re-attach the
      // destination's views). With lazy:false + freeze, this makes a tab switch just a
      // visibility toggle of already-resident, already-frozen views — the fastest path.
      // Trade-off: higher memory (all screens resident), acceptable for ~5 screens.
      detachInactiveScreens={false}
      screenOptions={({ route }) => ({
        header: () => <GlobalHeader onOpenBpmModal={onOpenBpmModal} currentRoute={route.name} />,
        headerShown: true,
        // PERFORMANCE: pre-load every tab at startup (lazy:false) so switching is
        // instant — no first-visit mount delay. Pairs with freezeOnBlur + the
        // enableFreeze() in index.ts: once mounted, inactive tabs are frozen so they
        // don't keep re-rendering in the background. (Trade-off: slightly more work at
        // launch, in exchange for zero-delay tab switches afterward.)
        lazy: false,
        freezeOnBlur: true, // freeze inactive tabs after mount to save CPU
        tabBarPressColor: 'transparent', // UI POLISH: Kills the native Android gray ripple
        tabBarStyle: {
          backgroundColor: t.tabBar,
          borderTopColor: t.border,
          borderTopWidth: 1,
          elevation: 0,
          shadowOpacity: 0,
          shadowColor: 'transparent',
          paddingTop: 4,
          height: 60 + insets.bottom,
          paddingBottom: insets.bottom,
        },
        tabBarActiveTintColor: t.accent,
        tabBarInactiveTintColor: t.txt3,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
        tabBarButton: (props: any) => <TouchableOpacity {...props} activeOpacity={1} />,
        tabBarIcon: ({ focused, color }) => {
          const s = 24;
          if (route.name === 'Play') return <MaterialCommunityIcons name={focused ? 'play-circle' : 'play-circle-outline'} size={s} color={color} />;
          if (route.name === 'Song') return <Ionicons name={focused ? 'musical-notes' : 'musical-notes-outline'} size={s} color={color} />;
          if (route.name === 'Quiz') return <MaterialCommunityIcons name={focused ? 'puzzle' : 'puzzle-outline'} size={s} color={color} />;
          if (route.name === 'Tuner') return <MaterialCommunityIcons name={focused ? 'guitar-pick' : 'guitar-pick-outline'} size={s} color={color} />;
          if (route.name === 'Settings') return <MaterialCommunityIcons name={focused ? 'cog' : 'cog-outline'} size={s} color={color} />;
        },
      })}>
      <Tab.Screen name="Play" component={PlayScreen} options={{ tabBarLabel: 'Play' }} listeners={tabListeners} />
      <Tab.Screen name="Song" component={ProgressionScreen} options={{ tabBarLabel: 'Song' }} listeners={tabListeners} />
      <Tab.Screen name="Quiz" component={QuizScreen} options={{ tabBarLabel: 'Quiz' }} listeners={tabListeners} />
      <Tab.Screen name="Tuner" component={TunerScreen} options={{ tabBarLabel: 'Tuner' }} listeners={tabListeners} />
    </Tab.Navigator>
  );
}

// ─── ROOT LAYOUT ──────────────────────────────────────────────────────────────
function RootLayout() {
  const [showBpm, setShowBpm] = useState(false);
  const { theme } = useSettingsStore();
  const t = THEMES[theme];

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="MainTabs">
          {(props) => <TabNavigator {...props} onOpenBpmModal={() => setShowBpm(true)} />}
        </Stack.Screen>
      </Stack.Navigator>
      
      {/* Floating Global Overlays */}
      <SettingsScreen />
      <BpmModal visible={showBpm} onClose={() => setShowBpm(false)} />
    </View>
  );
}

export default function App() {
  const theme = useSettingsStore(s => s.theme);
  const statusBarStyle = LIGHT_THEMES.has(theme) ? 'dark' : 'light';

  useEffect(() => {
    Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      allowsRecordingIOS: false,
      staysActiveInBackground: false,
    });
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ErrorBoundary>
        <SafeAreaProvider>
          <AudioProvider>
            <NavigationContainer theme={{
              ...DefaultTheme,
              colors: {
                ...DefaultTheme.colors,
                background: THEMES[theme].bg,
                border: THEMES[theme].border,
              }
            }}>
              <StatusBar style={statusBarStyle} />
              <RootLayout />
            </NavigationContainer>
          </AudioProvider>
        </SafeAreaProvider>
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}