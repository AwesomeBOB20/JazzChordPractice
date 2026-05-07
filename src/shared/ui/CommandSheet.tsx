import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, TouchableWithoutFeedback, StyleSheet, Dimensions, Platform, ScrollView, Animated, PanResponder, FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSettingsStore } from '@features/settings/store/settingsStore';
import { useChordStore } from '@features/play/store/chordStore';
import { THEMES } from '@shared/ui/themes';
import { CH, NOTE_FLAT, NOTE_SHARP, CHORD_CATEGORIES } from '@shared/theory/musicTheory';

const ROOTS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

interface CommandSheetProps {
  visible: boolean;
  onClose: () => void;
  onExecute: () => void;
  onLivePreview?: (root: number, type: string) => void;
  forceMode?: 'manual' | 'random';
  executeLabel?: string;
  executeIcon?: keyof typeof Ionicons.glyphMap;
}


export default function CommandSheet({ 
  visible, onClose, onExecute, onLivePreview, forceMode, 
  executeLabel = 'PLAY', executeIcon = 'play'
}: CommandSheetProps) {
  const { theme, octave, instrument } = useSettingsStore();
  const {
    inputMode, setInputMode, rootSemi, chordType, setChord, 
    activeTypes, toggleType, setActiveTypes, namingMode 
  } = useChordStore();
  
  const t = THEMES[theme];
  const insets = useSafeAreaInsets();

  const screenHeight = Dimensions.get('window').height;
  const tabBarHeight = 60 + insets.bottom + 4;
  const topInset = insets.top || (Platform.OS === 'android' ? 24 : 0);
  const sheetHeight = Math.round((screenHeight - tabBarHeight - topInset) * 0.6);

  const [rootScrolled, setRootScrolled] = useState(false);
  const [qualityScrolled, setQualityScrolled] = useState(false);
  const notes = namingMode === 'flat' ? NOTE_FLAT : NOTE_SHARP;
  
  const currentMode = forceMode ?? inputMode;
  const ALL_TYPES = CHORD_CATEGORIES.flatMap((c: { label: string, keys: string[] }) => c.keys);

  // Auto-Scrolling Layout Tracking
  const rootScrollRef = useRef<ScrollView>(null);
  const qualScrollRef = useRef<ScrollView>(null);
  const [rootScrollHeight, setRootScrollHeight] = useState(0);
  const [qualScrollHeight, setQualScrollHeight] = useState(0);
  
  const qualCatY = useRef<{[key: string]: number}>({});
  const qualRowY = useRef<{[key: string]: number}>({});
  const qualItemY = useRef<{[key: string]: number}>({});

  // Improved centering with timing buffer for animations
  useEffect(() => {
    if (!visible || rootScrollHeight === 0 || qualScrollHeight === 0) return;

    const performScroll = () => {
      // 1. Center Root (Left Column)
      if (rootScrollRef.current) {
        const index = ROOTS.indexOf(rootSemi);
        if (index !== -1) {
          const itemHeight = 44;
          const gap = 12;
          const itemY = index * (itemHeight + gap);
          // Math: Top of item - (Half of viewport) + (Half of item)
          const centerY = itemY - (rootScrollHeight / 2) + (itemHeight / 2);
          rootScrollRef.current.scrollTo({ y: Math.max(0, centerY), animated: true });
        }
      }

      // 2. Center Quality (Right Column)
      if (qualScrollRef.current) {
        const cat = CHORD_CATEGORIES.find((c: { label: string, keys: string[] }) => c.keys.includes(chordType));
        if (cat) {
          const cY = qualCatY.current[cat.label] || 0;
          const rY = qualRowY.current[cat.label] || 0;
          const iY = qualItemY.current[chordType] || 0;
          
          // Sum the nested offsets to find absolute position in the ScrollView
          const absoluteY = cY + rY + iY;
          const buttonHeight = 40; 
          const centerY = absoluteY - (qualScrollHeight / 2) + (buttonHeight / 2);
          
          qualScrollRef.current.scrollTo({ y: Math.max(0, centerY), animated: true });
        }
      }
    };

    // 250ms timeout ensures the spring bounce animation is fully finished for a buttery smooth glide
    const timer = setTimeout(performScroll, 250);
    return () => clearTimeout(timer);
  }, [visible, rootSemi, chordType, rootScrollHeight, qualScrollHeight]);

  // Animation values
  const slideAnim = useRef(new Animated.Value(sheetHeight)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;
  const [modalVisible, setModalVisible] = useState(false);

  const handleClose = () => {
    onExecute();
    onClose();
  };

  // The Physics Dragger
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => Math.abs(gestureState.dy) > 10,
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) { // Only allow dragging down
          slideAnim.setValue(gestureState.dy);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > sheetHeight * 0.25 || gestureState.vy > 0.5) {
          // Snap closed
          Animated.timing(slideAnim, { toValue: sheetHeight, duration: 200, useNativeDriver: true }).start(() => handleClose());
        } else {
          // Bounce back up
          Animated.spring(slideAnim, { toValue: 0, bounciness: 6, useNativeDriver: true }).start();
        }
      }
    })
  ).current;

  useEffect(() => {
    if (visible) {
      setModalVisible(true);
      slideAnim.setValue(sheetHeight);
      backdropAnim.setValue(0);
      Animated.parallel([
        Animated.spring(slideAnim, { toValue: 0, bounciness: 6, useNativeDriver: true }),
        Animated.timing(backdropAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, { toValue: sheetHeight, duration: 200, useNativeDriver: true }),
        Animated.timing(backdropAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start(() => setModalVisible(false));
    }
  }, [visible]);
  
  const handleToggleCategory = (keys: string[]) => {
    const allCatSelected = keys.every((k: string) => activeTypes.includes(k));
    if (allCatSelected) {
      const next = activeTypes.filter(k => !keys.includes(k));
      setActiveTypes(next.length === 0 ? [ALL_TYPES[0]] : next);
    } else {
      setActiveTypes(Array.from(new Set([...activeTypes, ...keys])));
    }
  };

  if (!modalVisible && !visible) return null;

  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 1000 }]}>
      <TouchableWithoutFeedback onPress={handleClose}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.5)', opacity: backdropAnim }]} />
      </TouchableWithoutFeedback>

      <Animated.View style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        height: sheetHeight, backgroundColor: t.bg,
        borderTopLeftRadius: 20, borderTopRightRadius: 20,
        transform: [{ translateY: slideAnim }],
        overflow: 'visible',
      }}>
        {/* Anti-gap extension */}
        <View style={{ position: 'absolute', top: '100%', left: 0, right: 0, height: 200, backgroundColor: t.bg }} />
        
        {/* NEW 3-COLUMN HEADER */}
        <View {...panResponder.panHandlers} style={{
          height: 64, borderBottomWidth: 1, borderColor: t.border, backgroundColor: t.bg,
          flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 12,
          borderTopLeftRadius: 20, borderTopRightRadius: 20
        }}>
          {/* Absolute Top Pill */}
          <View style={{ position: 'absolute', top: 8, left: 0, right: 0, alignItems: 'center' }}>
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: t.border }} />
          </View>

          {/* Left Column (Empty for now) */}
          <View style={{ flex: 1, alignItems: 'flex-start' }}></View>

          {/* Center Column */}
          <View style={{ flex: 2, alignItems: 'center' }}>
            {!forceMode && (
              <View style={{ flexDirection: 'row', backgroundColor: t.bg3, borderRadius: 20, padding: 4, borderWidth: 1, borderColor: t.border }}>
                <TouchableOpacity onPress={() => setTimeout(() => setInputMode('random'), 0)} style={{ paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16, backgroundColor: inputMode === 'random' ? t.accent : 'transparent' }}>
                  <Text style={{ fontSize: 12, fontWeight: '800', color: inputMode === 'random' ? '#fff' : t.txt2 }}>RANDOM</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setTimeout(() => setInputMode('manual'), 0)} style={{ paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16, backgroundColor: inputMode === 'manual' ? t.accent : 'transparent' }}>
                  <Text style={{ fontSize: 12, fontWeight: '800', color: inputMode === 'manual' ? '#fff' : t.txt2 }}>MANUAL</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Right Column */}
          <View style={{ flex: 1, alignItems: 'flex-end' }}>
            <TouchableOpacity onPress={handleClose} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: t.bg3, borderWidth: 1, borderColor: t.border, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="close" size={18} color={t.txt2} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Content */}
        <View style={{ flex: 1 }}>
          {currentMode === 'manual' ? (
            <View style={{ flexDirection: 'row', flex: 1 }}>
              
              {/* LEFT COLUMN: Sticky Roots */}
              <View style={{ width: 75, backgroundColor: t.bg3, borderRightWidth: 1, borderColor: t.border, paddingTop: 16 }}>
                <Text style={{ color: t.accent, fontSize: 10, fontWeight: '800', textAlign: 'center', marginBottom: 16, letterSpacing: 1 }}>ROOT</Text>
                <View style={{ flex: 1, position: 'relative' }}>
                  {rootScrolled && <LinearGradient colors={[t.bg3, 'transparent']} style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 16, zIndex: 10 }} pointerEvents="none" />}
                  <ScrollView
                    ref={rootScrollRef}
                    onLayout={(e) => setRootScrollHeight(e.nativeEvent.layout.height)}
                    showsVerticalScrollIndicator={false} 
                    contentContainerStyle={{ paddingBottom: 40, alignItems: 'center', gap: 12 }}
                    onScroll={(e: { nativeEvent: { contentOffset: { y: number } } }) => setRootScrolled(e.nativeEvent.contentOffset.y > 5)}
                    scrollEventThrottle={16}
                    nestedScrollEnabled
                    removeClippedSubviews={true}
                  >
                    {ROOTS.map(r => {
                      const isActive = rootSemi === r;
                      return (
                        <TouchableOpacity key={r} activeOpacity={0.7}
                        style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: isActive ? t.accent : 'transparent' }}
                        onPress={() => {
                          setTimeout(() => {
                            setChord(r, chordType);
                            onLivePreview?.(r, chordType);
                          }, 0);
                        }}>
                          <Text style={{ fontWeight: isActive ? '800' : '600', fontSize: 16, color: isActive ? '#fff' : t.txt2 }}>{notes[r]}</Text>
                        </TouchableOpacity>
                      )
                    })}
                  </ScrollView>
                  <LinearGradient colors={['transparent', t.bg3]} style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 40, zIndex: 10 }} pointerEvents="none" />
                </View>
              </View>

              {/* RIGHT COLUMN: Scrollable Qualities */}
              <View style={{ flex: 1, paddingTop: 16, paddingHorizontal: 16 }}>
                <Text style={{ color: t.accent, fontSize: 10, fontWeight: '800', marginBottom: 16, letterSpacing: 1 }}>QUALITY</Text>
                <View style={{ flex: 1, position: 'relative' }}>
                  {qualityScrolled && <LinearGradient colors={[t.bg, 'transparent']} style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 16, zIndex: 10 }} pointerEvents="none" />}
                  <ScrollView 
                    ref={qualScrollRef}
                    onLayout={(e) => setQualScrollHeight(e.nativeEvent.layout.height)}
                    showsVerticalScrollIndicator={false} 
                    contentContainerStyle={{ paddingBottom: 60 }}
                    onScroll={(e: { nativeEvent: { contentOffset: { y: number } } }) => setQualityScrolled(e.nativeEvent.contentOffset.y > 5)}
                    scrollEventThrottle={16}
                    nestedScrollEnabled
                    removeClippedSubviews={true}
                  >
                    {CHORD_CATEGORIES.map((cat: { label: string, keys: string[] }, catIdx: number) => (
                      <View key={cat.label} style={{ marginBottom: 20 }} onLayout={(e) => qualCatY.current[cat.label] = e.nativeEvent.layout.y}>
                        <Text style={{ fontSize: 14, fontWeight: '800', color: t.txt1, marginBottom: 12 }}>{cat.label}</Text>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }} onLayout={(e) => qualRowY.current[cat.label] = e.nativeEvent.layout.y}>
                          {cat.keys.map((key: string) => {
                            if (!CH[key]) return null;
                            const isActive = chordType === key;
                            return (
                              <TouchableOpacity key={key} activeOpacity={0.7}
                              onLayout={(e) => qualItemY.current[key] = e.nativeEvent.layout.y}
                              style={{ paddingHorizontal: 16, paddingVertical: 10, borderRadius: 24, backgroundColor: isActive ? t.accent : t.bg3 }}
                              onPress={() => {
                                setTimeout(() => {
                                  setChord(rootSemi, key);
                                  onLivePreview?.(rootSemi, key);
                                }, 0);
                              }}>
                                <Text style={{ fontWeight: '700', fontSize: 14, color: isActive ? '#fff' : t.txt2 }}>{String(CH[key]?.l ?? '')}</Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                        {catIdx < CHORD_CATEGORIES.length - 1 && (
                          <View style={{ height: 1, backgroundColor: t.border, marginTop: 24, marginBottom: -4 }} />
                        )}
                      </View>
                    ))}
                  </ScrollView>
                  <LinearGradient colors={['transparent', t.bg]} style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 40, zIndex: 10 }} pointerEvents="none" />
                </View>
              </View>

            </View>

          ) : (
            
            <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40, gap: 24 }} nestedScrollEnabled>
              <View style={{ gap: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <TouchableOpacity 
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
                    activeOpacity={0.6}
                    onPress={() => {
                      const isAllSelected = ALL_TYPES.every((k: string) => activeTypes.includes(k));
                      if (isAllSelected) {
                        setActiveTypes([ALL_TYPES[0]]); // Keep at least one to prevent crash
                      } else {
                        setActiveTypes(ALL_TYPES);
                      }
                    }}
                  >
                    <Ionicons name={ALL_TYPES.every((k: string) => activeTypes.includes(k)) ? "checkmark-circle" : "ellipse-outline"} size={18} color={t.accent} />
                    <Text style={{ fontSize: 14, fontWeight: '800', letterSpacing: 1, color: t.accent }}>ACTIVE CHORD POOL</Text>
                  </TouchableOpacity>
                  <Text style={{ fontSize: 12, fontWeight: '800', color: t.txt3 }}>{activeTypes.length} Selected</Text>
                </View>
                <View>
                  {CHORD_CATEGORIES.map((cat: { label: string, keys: string[] }, catIdx: number) => {
                    const allCatSelected = cat.keys.every((k: string) => activeTypes.includes(k));
                    return (
                      <View key={cat.label} style={{ marginBottom: 20 }}>
                        <TouchableOpacity 
                          style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 8 }}
                          onPress={() => handleToggleCategory(cat.keys)} activeOpacity={0.6}>
                          <Ionicons name={allCatSelected ? "checkmark-circle" : "ellipse-outline"} size={18} color={allCatSelected ? t.accent : t.txt3} />
                          <Text style={{ fontSize: 14, fontWeight: '800', color: allCatSelected ? t.accent : t.txt1 }}>{cat.label}</Text>
                        </TouchableOpacity>
                        
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                          {cat.keys.map((key: string) => {
                            const isActive = activeTypes.includes(key);
                            if (!CH[key]) return null;
                            return (
                              <TouchableOpacity key={key} activeOpacity={0.7}
                                style={{ paddingHorizontal: 16, paddingVertical: 10, borderRadius: 24, backgroundColor: isActive ? t.accent : t.bg3 }}
                                onPress={() => toggleType(key)}>
                                <Text style={{ fontWeight: '700', fontSize: 13, color: isActive ? '#fff' : t.txt2 }}>{String(CH[key]?.l ?? '')}</Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                        {catIdx < CHORD_CATEGORIES.length - 1 && (
                          <View style={{ height: 1, backgroundColor: t.border, marginTop: 24, marginBottom: -4 }} />
                        )}
                      </View>
                    );
                  })}
                </View>
              </View>
            </ScrollView>

          )}
        </View>
      </Animated.View>
    </View>
  );
}