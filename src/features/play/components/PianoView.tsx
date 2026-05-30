import React, { useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import { View, ScrollView, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { Theme } from '@shared/ui/themes';
import { useSettingsStore } from '@features/settings/store/settingsStore';
import { formatDegree, SCALES, getGlobalLabel } from '@shared/theory/musicTheory';
import { formatChordSymbol } from '@shared/theory/core/nomenclature';
import { ROLE_COLORS_GLOBAL, getNoteColor } from '@shared/ui/themes';

export interface PianoViewRef {
  flashMidi: (midi: number) => void;
  flashAll: (midiNotes: number[]) => void;
  recenter: () => void;
}

interface Props {
  midiNotes: number[];
  theme: Theme;
  noteNames?: string[];
  roles?: string[];
  formulas?: string[];
  formulaByPC?: Record<number, string>;
  onNotePress?: (midi: number) => void;
  octave?: number;
  labelMode?: 'degrees' | 'notes' | 'none';
  accentColor?: string;
  rootSemi?: number;
  namingMode?: 'sharp' | 'flat';
  header?: React.ReactNode;
  showAllLabels?: boolean;
  scaleOverlay?: boolean;
  overlayNotes?: number[];
  overlayRoles?: string[];
  overlayFormulas?: string[];
  
  // Navigation Props
  showNavigation?: boolean;
  groupLabel?: string;
  voicingLabel?: string;
  voicingName?: string;
  voicingSubName?: string;
  voicingIdx?: number;
  totalVoicings?: number;
  onPrevVoicing?: () => void;
  onNextVoicing?: () => void;
  groups?: { label: string; startIdx: number; count: number }[];
  onGroupPrev?: () => void;
  onGroupNext?: () => void;
  parentScales?: string[];
  activeParentScale?: string | null;
  onParentScaleChange?: (scaleId: string) => void;
  colorModeOverride?: 'theme' | 'roles' | 'selective';
}

const ALL_NOTE_NAMES_SHARP = ['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'];
const ALL_NOTE_NAMES_FLAT  = ['C','D♭','D','E♭','E','F','G♭','G','A♭','A','B♭','B'];
const WHITE_PCS = [0, 2, 4, 5, 7, 9, 11];
const BLACK_PCS = [1, 3, 6, 8, 10];
const BLACK_OFFSETS: Record<number, number> = { 1: 0.68, 3: 1.68, 6: 3.68, 8: 4.68, 10: 5.68 };
const WKH = 150;
const BKH = 94;
const MIN_WKW = 24;
const MAX_WKW = 72;
const DEFAULT_WKW = 24;
// Expand the rendered area to cover the absolute full spectrum
const OCTAVE_LIST = [0, 1, 2, 3, 4, 5, 6, 7, 8];

const DEGREE_NAMES = ['R','b2','2','b3','3','4','b5','5','b6','6','b7','7'];
function degreeForPc(pc: number, rootSemi: number): string { return DEGREE_NAMES[(pc - rootSemi + 12) % 12]; }

const PianoView = React.memo(forwardRef<PianoViewRef, Props>(function PianoView({
  midiNotes, theme, noteNames = [], roles = [], formulas = [], formulaByPC = {}, onNotePress,
  octave = 4, labelMode = 'degrees', accentColor, rootSemi = 0, namingMode, header,
  showAllLabels = false, scaleOverlay = false, overlayNotes = [], overlayRoles = [], overlayFormulas = [], showNavigation = false, groupLabel, voicingLabel, voicingName, voicingSubName, voicingIdx = 0, totalVoicings = 0, onPrevVoicing, onNextVoicing, groups = [], onGroupPrev, onGroupNext,
  parentScales = [], activeParentScale, onParentScaleChange, colorModeOverride,
}, ref) {
  const scrollRef = useRef<ScrollView>(null);
  const flashAnims = useRef<Record<number, Animated.Value>>({});
  const isReady = useRef(false);
  const viewWidth = useRef(300);
  const keyWidth = useSettingsStore((s: any) => s.pianoKeyWidth);
  const setKeyWidth = useSettingsStore((s: any) => s.setPianoKeyWidth);
  const activeSet = new Set(midiNotes);
  const octaveNumbering = useSettingsStore((s: any) => s.octaveNumbering);

  const computeScrollX = useCallback((kw?: number) => {
    if (!midiNotes.length) return 0;
    const w = kw ?? keyWidth;
    let minX = Infinity; let maxX = -Infinity;
    midiNotes.forEach(midi => {
      const pc = midi % 12;
      // Dynamically subtract the first rendered octave instead of a hardcoded "2"
      const octaveIdx = Math.floor(midi / 12) - OCTAVE_LIST[0];
      const x = BLACK_PCS.includes(pc) 
        ? octaveIdx * 7 * w + BLACK_OFFSETS[pc] * w 
        : octaveIdx * 7 * w + WHITE_PCS.indexOf(pc) * w;
      minX = Math.min(minX, x); maxX = Math.max(maxX, x + w);
    });
    return Math.max(0, (minX + maxX) / 2 - viewWidth.current / 2);
  }, [midiNotes.join(','), keyWidth]);

  const getFlashAnim = (midi: number) => { if (!flashAnims.current[midi]) { flashAnims.current[midi] = new Animated.Value(1); } return flashAnims.current[midi]; };
  const doFlashMidi = (midi: number) => { const anim = getFlashAnim(midi); Animated.sequence([ Animated.timing(anim, { toValue: 0.95, duration: 60, useNativeDriver: true }), Animated.timing(anim, { toValue: 1, duration: 150, useNativeDriver: true }), ]).start(); };
  
  useImperativeHandle(ref, () => ({ 
    flashMidi: (midi: number) => doFlashMidi(midi), 
    flashAll: (midiNotes: number[]) => midiNotes.forEach(m => doFlashMidi(m)),
    recenter: () => scrollRef.current?.scrollTo({ x: computeScrollX(), animated: true }),
  }));

  useEffect(() => { if (!isReady.current) return; scrollRef.current?.scrollTo({ x: computeScrollX(), animated: true }); }, [midiNotes.join(','), octave]);

  useEffect(() => { if (!isReady.current) return; scrollRef.current?.scrollTo({ x: computeScrollX(), animated: false }); }, [keyWidth]);

  const storeColorMode = useSettingsStore((s: any) => s.colorMode);
  const colorMode = colorModeOverride || storeColorMode;
  const selectiveRoles = useSettingsStore((s: any) => s.selectiveRoles);

  

  const getLabelStr = (midi: number, pc: number, role: string, activeFormula: string, isActive: boolean, noteNamesArr: string[], isOverlay: boolean = false, overlayFormula: string = '') => {
    // If role is hidden ('unknown'), never show any label regardless of settings
    if (role === 'unknown') return '';

    let standardLabel = '';

    // 1. Calculate whatever the label *should* be based on user settings
    if (labelMode !== 'none' && (isActive || isOverlay || showAllLabels)) {
      const passedRole = isActive ? role : '';
      const passedNoteName = isActive ? (noteNames[midiNotes.indexOf(midi)] || noteNamesArr[pc]) : noteNamesArr[pc];
      
      let formulaToUse = activeFormula || passedRole;
      if (!isActive) formulaToUse = isOverlay ? overlayFormula : (formulaByPC[pc] || degreeForPc(pc, rootSemi));

      standardLabel = getGlobalLabel(labelMode, namingMode || 'sharp', rootSemi, formulaToUse, passedRole, midi, passedNoteName);
    }

    // 2. UX Standard: Anchor the keyboard by showing the octave number on 'C' keys (if enabled)
    // Only apply to active or overlay keys — inactive C keys should stay blank.
    // Skip entirely if labelMode is 'none' (user wants no labels at all)
    if (pc === 0 && (isActive || isOverlay) && labelMode !== 'none') {
      if (octaveNumbering) {
        const octaveNum = Math.floor(midi / 12) - 1; // e.g. MIDI 60 becomes C4
        // If the label is completely empty, or if the global setting just spit out a plain "C", force the octave number!
        if (!standardLabel || standardLabel === 'C') {
          return `C${octaveNum}`;
        }
      } else {
        // If octaveNumbering is disabled, return 'C' if label is empty, otherwise keep standard label
        if (!standardLabel) {
          return 'C';
        }
      }
    }

    return standardLabel;
  };

  // Find exactly the root-to-root span of the current chord
  const minMidi = midiNotes.length > 0 ? Math.min(...midiNotes) : 0;
  const maxMidi = midiNotes.length > 0 ? Math.max(...midiNotes) : 127;
  const lowestRoot = minMidi - ((minMidi - rootSemi + 12) % 12);
  const highestRoot = maxMidi + ((rootSemi - maxMidi % 12 + 12) % 12);

  const renderOctave = (oct: number) => {
    const base = oct * 12; const noteNamesArr = namingMode === 'flat' ? ALL_NOTE_NAMES_FLAT : ALL_NOTE_NAMES_SHARP;

    return (
      <View key={oct} style={styles.octave}>
        {WHITE_PCS.map((pc) => {
          const midi = base + pc; const isActive = activeSet.has(midi); const role = roles[midiNotes.indexOf(midi)] ?? '';
          const activeFormula = formulas[midiNotes.indexOf(midi)] ?? '';
          const isRoot = role === 'root' || role === 'R' || formulaByPC[pc] === 'R' || formulaByPC[pc] === '1';
          const anim = getFlashAnim(midi); const whiteTransY = anim.interpolate({ inputRange: [0, 1], outputRange: [-WKH / 2, 0] });
          
          let keyColor = '#ffffff'; let keyTextColor = theme.txt3;
          if (isActive) {
             // Ensure every active note gets a color - use degree relative to root as fallback
             const defaultDegree = degreeForPc(pc, rootSemi);
             const resolvedColor = getNoteColor(activeFormula || role || defaultDegree, colorMode, theme, selectiveRoles);
             if (colorMode === 'theme') {
                keyColor = accentColor ?? theme.accent;
                keyTextColor = '#fff';
             } else if (colorMode === 'selective') {
                keyColor = resolvedColor;
                keyTextColor = resolvedColor === theme.mutedNote ? theme.txt1 : '#fff';
             } else {
                const roleColor = ROLE_COLORS_GLOBAL[activeFormula] ?? ROLE_COLORS_GLOBAL[role] ?? ROLE_COLORS_GLOBAL[defaultDegree];
                if (roleColor) {
                   keyColor = accentColor ?? roleColor; keyTextColor = '#fff';
                } else {
                   keyColor = theme.mutedNote; keyTextColor = theme.txt1;
                }
             }
          }
          // Show overlay ONLY within the root-to-root octaves the current voicing spans!
          const isOverlay = scaleOverlay && !isActive && overlayNotes.includes(midi) && midi >= lowestRoot && midi < highestRoot;
          let overlayColor = 'transparent';
          let overlayF = '';
          
          if (isOverlay) {
            const overlayIdx = overlayNotes.indexOf(midi);
            overlayF = overlayFormulas[overlayIdx] || overlayRoles[overlayIdx] || formulaByPC[pc] || degreeForPc(pc, rootSemi);
            
            // Use the established helper to respect the Note Color setting (Roles, Theme, or Selective)
            overlayColor = getNoteColor(overlayF, colorMode, theme, selectiveRoles);
            
            // If the color comes back as the "muted" color, fallback to accent so it's still visible
            if (overlayColor === theme.mutedNote) overlayColor = theme.accent;
          }

          return (
            <Animated.View key={pc} onStartShouldSetResponder={() => true} onResponderRelease={() => { doFlashMidi(midi); onNotePress?.(midi); }} style={[styles.whiteKey, { backgroundColor: keyColor, borderColor: theme.border, borderWidth: 1, width: keyWidth, transform: [{ translateY: whiteTransY }, { scaleY: anim }], shadowColor: isActive ? keyColor : '#000', shadowOpacity: isActive ? 0.3 : 0.05 }]}>
              {/* Bulletproof absolutely positioned tab for the scale overlay color */}
              {isOverlay && <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 6, backgroundColor: overlayColor, borderBottomLeftRadius: 5, borderBottomRightRadius: 5 }} />}
              <Text style={[styles.keyName, { color: keyTextColor, zIndex: 1 }]}>{getLabelStr(midi, pc, role, activeFormula, isActive, noteNamesArr, isOverlay, overlayF)}</Text>
            </Animated.View>
          );
        })}
        {BLACK_PCS.map(pc => {
          const midi = base + pc; const isActive = activeSet.has(midi); const role = roles[midiNotes.indexOf(midi)] ?? '';
          const activeFormula = formulas[midiNotes.indexOf(midi)] ?? '';
          const isRoot = role === 'root' || role === 'R' || formulaByPC[pc] === 'R' || formulaByPC[pc] === '1';
          const anim = getFlashAnim(midi); const blackTransY = anim.interpolate({ inputRange: [0, 1], outputRange: [-BKH / 2, 0] });
          
          let keyColor = '#1c1c1e'; let keyTextColor = '#888'; let keyBorder = 0;
          if (isActive) {
             // Ensure every active note gets a color - use degree relative to root as fallback
             const defaultDegree = degreeForPc(pc, rootSemi);
             const resolvedColor = getNoteColor(activeFormula || role || defaultDegree, colorMode, theme, selectiveRoles);
             if (colorMode === 'theme') {
                keyColor = accentColor ?? theme.accent;
                keyTextColor = '#fff';
                keyBorder = 0;
             } else if (colorMode === 'selective') {
                keyColor = resolvedColor;
                keyTextColor = resolvedColor === theme.mutedNote ? theme.txt1 : '#fff';
                keyBorder = resolvedColor === theme.mutedNote ? 1 : 0;
             } else {
                const roleColor = ROLE_COLORS_GLOBAL[activeFormula] ?? ROLE_COLORS_GLOBAL[role] ?? ROLE_COLORS_GLOBAL[defaultDegree];
                if (roleColor) {
                   keyColor = accentColor ?? roleColor; keyTextColor = '#fff'; keyBorder = 0;
                } else {
                   keyColor = theme.mutedNote; keyTextColor = theme.txt1; keyBorder = 1;
                }
             }
          }

          // Show overlay ONLY within the root-to-root octaves the current voicing spans!
          const isOverlay = scaleOverlay && !isActive && overlayNotes.includes(midi) && midi >= lowestRoot && midi < highestRoot;
          let overlayColor = 'transparent';
          let overlayF = '';
          
          if (isOverlay) {
            const overlayIdx = overlayNotes.indexOf(midi);
            overlayF = overlayFormulas[overlayIdx] || overlayRoles[overlayIdx] || formulaByPC[pc] || degreeForPc(pc, rootSemi);
            
            // Use the same helper here to ensure consistency across the keyboard
            overlayColor = getNoteColor(overlayF, colorMode, theme, selectiveRoles);
            
            if (overlayColor === theme.mutedNote) overlayColor = theme.accent;
          }

          return (
            <Animated.View key={pc} onStartShouldSetResponder={() => true} onResponderRelease={() => { doFlashMidi(midi); onNotePress?.(midi); }} style={[styles.blackKeyTouch, styles.blackKey, { left: BLACK_OFFSETS[pc] * keyWidth, width: Math.round(keyWidth * 0.59), backgroundColor: keyColor, borderColor: theme.border, borderWidth: keyBorder, transform: [{ translateY: blackTransY }, { scaleY: anim }] }]}>
              {/* Bulletproof absolutely positioned tab for the scale overlay color */}
              {isOverlay && <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 4, backgroundColor: overlayColor, borderBottomLeftRadius: 3, borderBottomRightRadius: 3 }} />}
              <Text style={[styles.blackKeyName, { color: keyTextColor, zIndex: 1 }]}>{getLabelStr(midi, pc, role, activeFormula, isActive, noteNamesArr, isOverlay, overlayF)}</Text>
            </Animated.View>
          );
        })}
      </View>
    );
  };

  const specificPianoName = voicingSubName || '';
  const basePianoName = voicingName || 'Piano Voicing';
  const isPianoChordLike = /(?:^|\s)[A-G][b♭#♯]?(?:\s|$|m|M|maj|min|dim|aug|sus|alt|\d)/.test(specificPianoName);
  
  const topPianoLabel = isPianoChordLike ? specificPianoName : basePianoName;
  const botPianoLabelPrefix = isPianoChordLike && specificPianoName !== basePianoName 
    ? `${formatChordSymbol(basePianoName)} • ` 
    : (!isPianoChordLike && specificPianoName && specificPianoName !== basePianoName ? `${specificPianoName} • ` : '');

  return (
    <View style={[styles.container, { backgroundColor: theme.bg2, borderColor: theme.border }]}>
      {header}
      {showNavigation && groups && groups.length > 1 && (() => {
        const idx = Math.max(0, groups.findIndex(g => voicingIdx >= g.startIdx && voicingIdx < g.startIdx + g.count));
        return (
          <View style={[styles.navContainer, { borderBottomColor: theme.border }]}>
            <TouchableOpacity style={[styles.navBtn, { borderColor: theme.border, backgroundColor: theme.bg }]} onPress={onGroupPrev}><Text style={[styles.navArrow, { color: theme.txt1 }]}>‹</Text></TouchableOpacity>
            <View style={styles.navLabelWrap}>
              {groupLabel && <Text style={[styles.navLabelTag, { color: theme.txt3 }]}>{groupLabel}</Text>}
              <Text 
                style={[styles.navLabelTop, { color: theme.txt1 }]} 
                numberOfLines={1} 
                adjustsFontSizeToFit
              >
                {formatChordSymbol(groups[idx]?.label ?? '').replace(/\s*\/\s*(?=[A-G])/gi, ' / ')}
              </Text>
              <Text style={[styles.navLabelBot, { color: theme.txt3 }]}>{`${groups[idx]?.count ?? 0} voicings · ${idx + 1}/${groups.length}`}</Text>
            </View>
            <TouchableOpacity style={[styles.navBtn, { borderColor: theme.border, backgroundColor: theme.bg }]} onPress={onGroupNext}><Text style={[styles.navArrow, { color: theme.txt1 }]}>›</Text></TouchableOpacity>
          </View>
        );
      })()}
      {parentScales.length > 0 && (
        <View style={[styles.navContainer, { borderBottomColor: theme.border }]}>
          <TouchableOpacity style={[styles.navBtn, { borderColor: theme.border, backgroundColor: theme.bg }]} onPress={() => { 
            import('expo-haptics').then(Haptics => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)); 
            const idx = parentScales.indexOf(activeParentScale || parentScales[0]);
            onParentScaleChange?.(parentScales[(idx - 1 + parentScales.length) % parentScales.length]);
          }}>
            <Text style={[styles.navArrow, { color: theme.txt1 }]}>‹</Text>
          </TouchableOpacity>
          <View style={styles.navLabelWrap}>
            <Text style={[styles.navLabelTag, { color: theme.txt3 }]}>PARENT MODE</Text>
            <Text style={[styles.navLabelTop, { color: theme.txt1 }]} numberOfLines={1}>{formatChordSymbol(SCALES[activeParentScale || parentScales[0]]?.name || activeParentScale || parentScales[0])}</Text>
            <Text style={[styles.navLabelBot, { color: theme.txt3 }]}>{`${Math.max(0, parentScales.indexOf(activeParentScale || parentScales[0])) + 1}/${parentScales.length}`}</Text>
          </View>
          <TouchableOpacity style={[styles.navBtn, { borderColor: theme.border, backgroundColor: theme.bg }]} onPress={() => { 
            import('expo-haptics').then(Haptics => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)); 
            const idx = parentScales.indexOf(activeParentScale || parentScales[0]);
            onParentScaleChange?.(parentScales[(idx + 1) % parentScales.length]);
          }}>
            <Text style={[styles.navArrow, { color: theme.txt1 }]}>›</Text>
          </TouchableOpacity>
        </View>
      )}
      {showNavigation && totalVoicings > 0 && (
        <View style={[styles.navContainer, { borderBottomColor: theme.border }]}>
          <TouchableOpacity style={[styles.navBtn, { borderColor: theme.border, backgroundColor: theme.bg }]} onPress={onPrevVoicing}><Text style={[styles.navArrow, { color: theme.txt1 }]}>‹</Text></TouchableOpacity>
          <View style={styles.navLabelWrap}>
            {voicingLabel && <Text style={[styles.navLabelTag, { color: theme.txt3 }]}>{voicingLabel}</Text>}
            <Text 
              style={[styles.navLabelTop, { color: theme.txt1 }]} 
              numberOfLines={1} 
              adjustsFontSizeToFit
            >
              {formatChordSymbol(topPianoLabel).replace(/\s*\/\s*(?=[A-G])/gi, ' / ')}
            </Text>
            <Text style={[styles.navLabelBot, { color: theme.txt3 }]}>
              {`${botPianoLabelPrefix}${voicingIdx + 1}/${totalVoicings}`}
            </Text>
          </View>
          <TouchableOpacity style={[styles.navBtn, { borderColor: theme.border, backgroundColor: theme.bg }]} onPress={onNextVoicing}><Text style={[styles.navArrow, { color: theme.txt1 }]}>›</Text></TouchableOpacity>
        </View>
      )}
      <ScrollView ref={scrollRef} horizontal showsHorizontalScrollIndicator={false} style={{ borderTopWidth: 0, backgroundColor: theme.bg2 }} contentContainerStyle={[styles.content, { height: WKH }]} onLayout={(e) => { viewWidth.current = e.nativeEvent.layout.width; }} onContentSizeChange={() => { if (!isReady.current) { isReady.current = true; scrollRef.current?.scrollTo({ x: computeScrollX(), animated: false }); } }}>
        {OCTAVE_LIST.map(oct => renderOctave(oct))}
      </ScrollView>
      <View style={[styles.zoomBar, { backgroundColor: theme.bg2, borderTopColor: theme.border }]}>
        <TouchableOpacity style={[styles.zoomBtn, { backgroundColor: theme.bg, borderWidth: 1, borderColor: theme.border }]} onPress={() => setKeyWidth(Math.max(MIN_WKW, keyWidth - 6))}><Text style={[styles.zoomBtnText, { color: theme.accent }]}>−</Text></TouchableOpacity>
        <TouchableOpacity style={[styles.zoomBtn, { backgroundColor: theme.bg, borderWidth: 1, borderColor: theme.border }]} onPress={() => setKeyWidth(Math.min(MAX_WKW, keyWidth + 6))}><Text style={[styles.zoomBtnText, { color: theme.accent }]}>+</Text></TouchableOpacity>
      </View>
    </View>
  );
}));

export default PianoView;

const styles = StyleSheet.create({
  container: { overflow: 'hidden', position: 'relative', paddingTop: 0 },
  navContainer: { 
  flexDirection: 'row', 
  alignItems: 'center', 
  justifyContent: 'space-between', 
  padding: 12,
  borderBottomWidth: 1, // Added line
},
  navBtn: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  navArrow: { fontSize: 24, fontWeight: '700', lineHeight: 28, marginTop: -2 },
  navLabelWrap: { flex: 1, alignItems: 'center' },
  navLabelTag: { fontSize: 10, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 2 },
  navLabelTop: { fontSize: 13, fontWeight: '700' },
  navLabelBot: { fontSize: 10, fontWeight: '600', marginTop: 2 },
  zoomBar: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 12, borderTopWidth: 1 },
  zoomBtn: { flex: 1, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  zoomBtnText: { fontSize: 24, fontWeight: '600', lineHeight: 42 },
  content: { flexDirection: 'row', paddingHorizontal: 0, paddingTop: 0, paddingBottom: 0 },
  octave: { flexDirection: 'row', position: 'relative', height: WKH },
  whiteKey: { height: WKH, borderBottomLeftRadius: 6, borderBottomRightRadius: 6, borderWidth: 1, borderTopWidth: 0, justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 10, shadowOffset: { width: 0, height: 2 }, shadowRadius: 3, elevation: 2 },
  blackKeyTouch: { position: 'absolute', top: 0, height: BKH, zIndex: 2 },
  blackKey: { height: BKH, borderBottomLeftRadius: 4, borderBottomRightRadius: 4, justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 4 },
  keyName: { fontSize: 11, fontWeight: '800', height: 16, lineHeight: 16, textAlign: 'center' },
  blackKeyName: { fontSize: 10, fontWeight: '800', height: 14, lineHeight: 14, textAlign: 'center' },
});