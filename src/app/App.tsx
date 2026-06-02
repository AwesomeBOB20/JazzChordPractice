import 'react-native-gesture-handler';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Audio } from 'expo-av';
import { NavigationContainer, useNavigation, useNavigationState, DefaultTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Platform, View, Text, TouchableOpacity, Animated, ScrollView } from 'react-native';
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
import { LinearGradient } from 'expo-linear-gradient';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();
const LIGHT_THEMES = new Set(['light', 'frost', 'sage', 'latte']);

// ─── THE NEW GLOBAL HUD ──────────────────────────────────────────────────────

function SlidingToggle({
  activeIndex, onPressLeft, onPressRight, iconLeft, iconRight, t
}: {
  activeIndex: number; onPressLeft: () => void; onPressRight: () => void;
  iconLeft: React.ReactNode; iconRight: React.ReactNode; t: any;
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

  const BUTTON_WIDTH = 40;
  const PADDING = 4;
  const translateX = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, BUTTON_WIDTH]
  });

  return (
    <View style={{ flexDirection: 'row', backgroundColor: t.bg2, borderRadius: 20, padding: PADDING, borderWidth: 1, borderColor: t.border, position: 'relative', height: 40 }}>
      <Animated.View style={{
        position: 'absolute', left: PADDING, top: PADDING, bottom: PADDING,
        width: BUTTON_WIDTH, backgroundColor: t.accent, borderRadius: 16,
        transform: [{ translateX }]
      }} />
      <TouchableOpacity activeOpacity={0.7} onPress={onPressLeft} style={{ width: BUTTON_WIDTH, alignItems: 'center', justifyContent: 'center', zIndex: 1 }}>
        {iconLeft}
      </TouchableOpacity>
      <TouchableOpacity activeOpacity={0.7} onPress={onPressRight} style={{ width: BUTTON_WIDTH, alignItems: 'center', justifyContent: 'center', zIndex: 1 }}>
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
  const setIsSettingsOpen = useSettingsStore((s: any) => s.setIsSettingsOpen);

  const quizMode = useQuizStore((s: any) => s.quizMode);
  const setQuizMode = useQuizStore((s: any) => s.setQuizMode);
  
  const t = THEMES[theme];
  const navigation = useNavigation<any>();

  // Tracks when to show the left/right fades
  const [showRightFade, setShowRightFade] = useState(false);
  const [showLeftFade, setShowLeftFade] = useState(false);
  const [isScrollable, setIsScrollable] = useState(false);
  const scrollX = useRef(0);
  const layoutW = useRef(0);
  const contentW = useRef(0);

  const checkFade = () => {
    // Phase 2 Fix: Add a 2-pixel buffer to ignore fractional rounding and ghosting
    // Subtract 24 to account for the ScrollView's paddingRight
    const isOverflowing = Math.round(contentW.current - 24) > Math.round(layoutW.current) + 2;
    
    if (isScrollable !== isOverflowing) {
      setIsScrollable(isOverflowing);
    }

    if (isOverflowing) {
      const maxScroll = contentW.current - layoutW.current;
      setShowRightFade(scrollX.current < maxScroll - 5);
      setShowLeftFade(scrollX.current > 5);
    } else {
      // Lock fades off completely if all buttons fit on the screen
      setShowRightFade(false);
      setShowLeftFade(false);
    }
  };

  return (
    <View style={{
      paddingTop: Math.max(insets.top, 20) + 8,
      paddingBottom: 12,
      paddingHorizontal: 16,
      backgroundColor: t.bg,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderBottomWidth: 1,
      borderBottomColor: t.border,
      zIndex: 10,
      gap: 12
    }}>
      {/* Left: Scrollable Toggles & Clock */}
      <View style={{ flex: 1, position: 'relative', flexDirection: 'row' }}>
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          scrollEnabled={isScrollable}
          onLayout={(e) => { layoutW.current = e.nativeEvent.layout.width; checkFade(); }}
          onContentSizeChange={(w) => { contentW.current = w; checkFade(); }}
          onScroll={(e) => { scrollX.current = e.nativeEvent.contentOffset.x; checkFade(); }}
          scrollEventThrottle={16}
          contentContainerStyle={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingRight: 24 }}
          style={{ flex: 1 }}
        >
          <SlidingToggle
            activeIndex={instrument === 'piano' ? 0 : 1}
            onPressLeft={() => setInstrument('piano')}
            onPressRight={() => setInstrument('guitar')}
            iconLeft={<MaterialCommunityIcons name="piano" size={16} color={instrument === 'piano' ? '#fff' : t.txt2} />}
            iconRight={<MaterialCommunityIcons name="guitar-acoustic" size={16} color={instrument === 'guitar' ? '#fff' : t.txt2} />}
            t={t}
          />

          <SlidingToggle
            activeIndex={!arp ? 0 : 1}
            onPressLeft={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setArp(false); }}
            onPressRight={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setArp(true); }}
            iconLeft={<MaterialCommunityIcons name="music-note-quarter" size={16} color={!arp ? '#fff' : t.txt2} />}
            iconRight={<Ionicons name="musical-notes" size={16} color={arp ? '#fff' : t.txt2} />}
            t={t}
          />

          {currentRoute === 'Quiz' && (
            <SlidingToggle
              activeIndex={quizMode === 'visual' ? 0 : 1}
              onPressLeft={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setQuizMode('visual'); }}
              onPressRight={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setQuizMode('audio'); }}
              iconLeft={<Ionicons name="eye" size={16} color={quizMode === 'visual' ? '#fff' : t.txt2} />}
              iconRight={<Ionicons name="ear" size={16} color={quizMode === 'audio' ? '#fff' : t.txt2} />}
              t={t}
            />
          )}

          {/* The Master Clock */}
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={onOpenBpmModal}
            style={{ paddingHorizontal: 16, height: 40, justifyContent: 'center', backgroundColor: t.bg2, borderRadius: 20, borderWidth: 1, borderColor: t.border }}
          >
            <Text style={{ fontSize: 14, fontWeight: '800', color: t.txt1, letterSpacing: 1 }}>{bpm} BPM</Text>
          </TouchableOpacity>
        </ScrollView>

        {/* Dynamic Linear Gradient Fades */}
        {showLeftFade && (
          <LinearGradient
            colors={[t.bg, 'transparent']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 24 }}
            pointerEvents="none"
          />
        )}
        {showRightFade && (
          <LinearGradient
            colors={['transparent', t.bg]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 24 }}
            pointerEvents="none"
          />
        )}
      </View>

      {/* Right: Settings / Dashboard (Sticky) */}
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => setIsSettingsOpen(true)}
        style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center', backgroundColor: t.bg2, borderRadius: 20, borderWidth: 1, borderColor: t.border, flexShrink: 0 }}
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
    blur: () => { stopAudio(); },
  }), [setIsSettingsOpen, stopAudio]);

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
      screenOptions={({ route }) => ({
        header: () => <GlobalHeader onOpenBpmModal={onOpenBpmModal} currentRoute={route.name} />,
        headerShown: true,
        freezeOnBlur: true, // PERFORMANCE: Freezes inactive tabs to save memory/CPU
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