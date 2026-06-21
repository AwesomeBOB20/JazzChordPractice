import React, { useRef, useEffect, useLayoutEffect, useCallback, useMemo, forwardRef, useImperativeHandle } from 'react';
import { View, ScrollView, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Reanimated, { useSharedValue, useAnimatedStyle, useAnimatedScrollHandler, runOnJS, SharedValue } from 'react-native-reanimated';
import Svg, { Rect } from 'react-native-svg';
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
  // The ChordCard, rendered as the LEFT column of the top band; navigators become the right column.
  leftSlot?: React.ReactNode;
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
  showMiniMap?: boolean;
  // Lift hook (Chord screen): reports the whole-keyboard minimap as a ready-to-render node so it
  // can live in the sticky player's slide-up "Map" panel instead of inline. null on unmount.
  onMiniMap?: (node: React.ReactNode) => void;
}

const ALL_NOTE_NAMES_SHARP = ['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'];
const ALL_NOTE_NAMES_FLAT  = ['C','D♭','D','E♭','E','F','G♭','G','A♭','A','B♭','B'];
const WHITE_PCS = [0, 2, 4, 5, 7, 9, 11];
const BLACK_PCS = [1, 3, 6, 8, 10];
const BLACK_OFFSETS: Record<number, number> = { 1: 0.68, 3: 1.68, 6: 3.68, 8: 4.68, 10: 5.68 };
const WHITE_PER_OCT = WHITE_PCS.length; // 7
// Black-key geometry expressed as a PERCENT of the octave's width (octave width = 7 × keyWidth).
// Using % lets a single width on the octave wrapper drive the entire resize: white keys flex to
// fill it and black keys position proportionally, so zooming re-renders only the 7 octave wrappers
// instead of all ~84 key components. The px values are identical (e.g. 0.68/7 × 7×keyWidth = 0.68×keyWidth).
const BLACK_LEFT_PCT: Record<number, string> = Object.fromEntries(
  BLACK_PCS.map(pc => [pc, `${(BLACK_OFFSETS[pc] / WHITE_PER_OCT) * 100}%`])
) as Record<number, string>;
const BLACK_WIDTH_PCT = `${(0.59 / WHITE_PER_OCT) * 100}%`;
const WKH = 150;
const BKH = 94;
const MIN_WKW = 24;
const MAX_WKW = 72;
const DEFAULT_WKW = 24;
// Shared height for the two control rows that bookend the keyboard — the voicing-label nav
// (chevrons + label stack) and the zoom bar — so they stay the same height on every platform.
// Sized to the nav's natural height; its ~50px label stack centers comfortably within it.
const ROW_HEIGHT = 74;
// Rendered octaves by MIDI-octave number (oct N spans MIDI N*12 … N*12+11; e.g. oct 2 = C1–B1,
// oct 5 = C4–B4). Starts at 2 (C1): everything below C1 is inaudible (<33 Hz) and unreachable —
// the lowest piano octave setting is 2, and an octave-2 drop voicing bottoms out at exactly C1.
const OCTAVE_LIST = [2, 3, 4, 5, 6, 7, 8];

const DEGREE_NAMES = ['R','b2','2','b3','3','4','b5','5','b6','6','b7','7'];
function degreeForPc(pc: number, rootSemi: number): string { return DEGREE_NAMES[(pc - rootSemi + 12) % 12]; }

// ── Whole-piano minimap ──────────────────────────────────────────────────────
// The piano analog of FretboardMiniMap. It renders every octave the keyboard can
// scroll to (OCTAVE_LIST) in miniature on the same neutral bg3 field as the fretboard
// minimap, lights up the current chord's keys in their role colors, and draws an accent
// VIEWPORT box over the portion of the keyboard currently visible — so zooming and
// scrolling the big keyboard move/resize the box live (driven by scrollX without
// re-rendering the keys).
const MM_W = 320;
const MM_H = 44;
const MM_WHITE_PER_OCT = 7;

// hex (#rrggbb) → rgba string at the given alpha, for the translucent viewport fill.
const withAlpha = (hex: string, a: number): string => {
  const h = (hex || '').replace('#', '');
  if (h.length < 6) return hex;
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
};

const PianoMiniMap = React.memo(function PianoMiniMap({
  midiNotes, theme, rootSemi, roles, formulas, colorMode, accentColor, selectiveRoles,
  contentWidth, viewW, scrollSV,
}: {
  midiNotes: number[]; theme: Theme; rootSemi: number; roles: string[]; formulas: string[];
  colorMode: 'theme' | 'roles' | 'selective'; accentColor?: string; selectiveRoles: any;
  contentWidth: number; viewW: number; scrollSV: SharedValue<number>;
}) {
  const boxAnimStyle = useAnimatedStyle(() => {
    const cw = contentWidth || 1;
    let w = (MM_W * viewW) / cw;
    w = Math.max(10, Math.min(MM_W, w));
    let left = (MM_W / cw) * scrollSV.value;
    left = Math.max(0, Math.min(MM_W - w, left));
    const R = 8;
    const lr = Math.max(0, Math.min(R, R - left));
    const rr = Math.max(0, Math.min(R, R - (MM_W - (left + w))));
    return {
      width: w,
      transform: [{ translateX: left }],
      borderTopLeftRadius: lr, borderBottomLeftRadius: lr,
      borderTopRightRadius: rr, borderBottomRightRadius: rr,
    };
  });

  if (!midiNotes.length) return null;

  const octs = OCTAVE_LIST;
  const totalWhite = octs.length * MM_WHITE_PER_OCT;
  const ww = MM_W / totalWhite;        // miniature white-key width
  const bw = Math.max(2, ww * 0.6);    // miniature black-key width
  const bh = MM_H * 0.6;               // miniature black-key height
  const activeSet = new Set(midiNotes);

  // Mirror the keyboard's per-note color resolution exactly so the minimap matches.
  const colorFor = (midi: number): string => {
    const pc = midi % 12;
    const idx = midiNotes.indexOf(midi);
    const role = roles[idx] ?? '';
    const activeFormula = formulas[idx] ?? '';
    const defaultDegree = degreeForPc(pc, rootSemi);
    if (colorMode === 'theme') return accentColor ?? theme.accent;
    if (colorMode === 'selective') return getNoteColor(activeFormula || role || defaultDegree, colorMode, theme, selectiveRoles);
    const roleColor = ROLE_COLORS_GLOBAL[activeFormula] ?? ROLE_COLORS_GLOBAL[role] ?? ROLE_COLORS_GLOBAL[defaultDegree];
    return roleColor ? (accentColor ?? roleColor) : theme.mutedNote;
  };

  // Compute the x of any key in minimap space (same geometry as the keyboard).
  const xForMidi = (midi: number): { x: number; w: number } => {
    const pc = midi % 12;
    const octIdx = Math.floor(midi / 12) - octs[0];
    if (BLACK_PCS.includes(pc)) return { x: octIdx * MM_WHITE_PER_OCT * ww + BLACK_OFFSETS[pc] * ww, w: bw };
    return { x: (octIdx * MM_WHITE_PER_OCT + WHITE_PCS.indexOf(pc)) * ww, w: ww };
  };

  // In dark themes the inactive keys default to bg3 (dark) and the strip reads as a grey
  // field. Make them the SAME white (#FFFFFF) as the guitar neck minimap's dots/frets so
  // the two minimaps match; a faint dark divider keeps individual keys distinguishable on
  // the now-white strip. Light themes keep the original neutral bg3 fill.
  const isDark = theme.bg2 !== '#FFFFFF';
  const inactiveWhite = isDark ? '#FFFFFF' : theme.bg3;
  const whiteDivider = isDark ? 'rgba(0,0,0,0.22)' : theme.border;

  return (
    <View style={{ alignSelf: 'center', width: MM_W, height: MM_H, backgroundColor: theme.bg3, borderRadius: 8, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.border, marginTop: 12, marginBottom: 12, overflow: 'hidden' }}>
      <Svg width={MM_W} height={MM_H}>
        {/* White keys — white in dark themes (matching the guitar neck minimap), neutral bg3
            in light themes; thin dividers keep adjacent keys readable. */}
        {octs.map(oct => WHITE_PCS.map(pc => {
          const midi = oct * 12 + pc;
          const { x } = xForMidi(midi);
          const active = activeSet.has(midi);
          return <Rect key={`w-${midi}`} x={x} y={0} width={ww} height={MM_H} fill={active ? colorFor(midi) : inactiveWhite} stroke={active ? theme.border : whiteDivider} strokeWidth={0.5} />;
        }))}
        {/* Black keys — inactive ones drawn solid black so the strip reads as a piano. */}
        {octs.map(oct => BLACK_PCS.map(pc => {
          const midi = oct * 12 + pc;
          const { x } = xForMidi(midi);
          const active = activeSet.has(midi);
          return <Rect key={`b-${midi}`} x={x} y={0} width={bw} height={bh} rx={1} fill={active ? colorFor(midi) : '#1c1c1e'} />;
        }))}
      </Svg>
      {/* Live viewport highlight — accent fill, slides/resizes with scroll & zoom on the UI thread. */}
      {contentWidth > viewW + 1 && (
        <Reanimated.View
          pointerEvents="none"
          style={[{
            position: 'absolute', top: 0, left: 0, height: MM_H,
            backgroundColor: withAlpha(theme.accent, 0.3),
          }, boxAnimStyle]}
        />
      )}
    </View>
  );
});

// Memoized keyboard keys. The parent computes each key's visual props every render (cheap
// arithmetic), but React.memo skips actually re-rendering any key whose props are unchanged
// — so on a chord change only the few keys that actually changed redraw, instead of all ~100.
// Correctness: the props below FULLY determine the key's appearance, and `anim` is a stable
// ref (see the reset above), so a skipped key is guaranteed identical to a re-rendered one.
const WhiteKey = React.memo(function WhiteKey({ keyColor, keyTextColor, label, isOverlay, overlayColor, anim, isActive, borderColor }: any) {
  // Stable interpolation so a width-only re-render (zoom) doesn't rebuild the animated node.
  const transY = useMemo(() => anim.interpolate({ inputRange: [0, 1], outputRange: [-WKH / 2, 0] }), [anim]);
  return (
    // flex:1 — the key's width comes from the octave wrapper (width = 7×keyWidth), NOT a per-key
    // prop, so zooming never changes this component's props and React.memo skips it entirely.
    <Animated.View style={[styles.whiteKey, { backgroundColor: keyColor, borderColor, borderWidth: 1, flex: 1, transform: [{ translateY: transY }, { scaleY: anim }], shadowColor: isActive ? keyColor : '#000', shadowOpacity: isActive ? 0.3 : 0.05 }]}>
      {isOverlay && <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 6, backgroundColor: overlayColor, borderBottomLeftRadius: 5, borderBottomRightRadius: 5 }} />}
      <View><Text style={[styles.keyName, { color: keyTextColor, zIndex: 1 }]}>{label}</Text></View>
    </Animated.View>
  );
});

const BlackKey = React.memo(function BlackKey({ keyColor, keyTextColor, keyBorder, label, isOverlay, overlayColor, left, width, anim, borderColor }: any) {
  // Stable interpolation so a width-only re-render (zoom) doesn't rebuild the animated node.
  const transY = useMemo(() => anim.interpolate({ inputRange: [0, 1], outputRange: [-BKH / 2, 0] }), [anim]);
  return (
    <Animated.View style={[styles.blackKeyTouch, styles.blackKey, { left, width, backgroundColor: keyColor, borderColor, borderWidth: keyBorder, transform: [{ translateY: transY }, { scaleY: anim }] }]}>
      {isOverlay && <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 4, backgroundColor: overlayColor, borderBottomLeftRadius: 3, borderBottomRightRadius: 3 }} />}
      <View><Text style={[styles.blackKeyName, { color: keyTextColor, zIndex: 1 }]}>{label}</Text></View>
    </Animated.View>
  );
});

const PianoView = React.memo(forwardRef<PianoViewRef, Props>(function PianoView({
  midiNotes, theme, noteNames = [], roles = [], formulas = [], formulaByPC = {}, onNotePress,
  octave = 4, labelMode = 'degrees', accentColor, rootSemi = 0, namingMode, header, leftSlot,
  showAllLabels = false, scaleOverlay = false, overlayNotes = [], overlayRoles = [], overlayFormulas = [], showNavigation = false, groupLabel, voicingLabel, voicingName, voicingSubName, voicingIdx = 0, totalVoicings = 0, onPrevVoicing, onNextVoicing, groups = [], onGroupPrev, onGroupNext,
  parentScales = [], activeParentScale, onParentScaleChange, colorModeOverride, showMiniMap = true, onMiniMap,
}, ref) {
  const scrollRef = useRef<ScrollView>(null);
  const flashAnims = useRef<Record<number, Animated.Value>>({});
  const isReady = useRef(false);
  const viewWidth = useRef(300);
  const keyWidth = useSettingsStore((s: any) => s.pianoKeyWidth);
  const setKeyWidth = useSettingsStore((s: any) => s.setPianoKeyWidth);

  // Single throttled + deduped commit path for BOTH the +/- buttons and the slider. Every keyWidth
  // change now only resizes the 7 octave wrappers (the keys flex/% within them — see WhiteKey /
  // BLACK_*_PCT), so it's cheap enough to run near frame rate. Three gates keep it smooth:
  //   • round to whole px so sub-pixel slider ticks become no-ops (dedup),
  //   • a ~1-frame throttle caps to ~60fps so we never queue more than one resize per frame,
  //   • callers pass force=true for the FINAL value (button tap / slider release) so it always lands.
  const lastCommitAtRef = useRef(0);
  const lastWidthRef = useRef(keyWidth); // initialized to actual keyWidth so dedup never mismatches on first press
  const commitKeyWidth = useCallback((target: number, force = false): boolean => {
    const w = Math.max(MIN_WKW, Math.min(MAX_WKW, Math.round(target)));
    if (w === lastWidthRef.current) return false;                       // dedup: same width, skip
    const now = performance.now();
    if (!force && now - lastCommitAtRef.current < 16) return false;     // throttle: at most one resize/frame
    lastCommitAtRef.current = now;
    lastWidthRef.current = w;
    setKeyWidth(w);
    return true;
  }, [setKeyWidth]);
  const zoomBy = useCallback((delta: number) => {
    const oldKW = useSettingsStore.getState().pianoKeyWidth;
    // Use the predicted scroll if a previous zoom hasn't fully landed yet (old arch: native
    // layout lags behind JS commits, so scrollOffsetRef is stale during rapid presses).
    // Chaining off the prediction keeps successive rapid taps centered on the same spot.
    const baseScrollX = pendingScrollXRef.current ?? scrollOffsetRef.current;
    const focalFrac = Math.max(0, Math.min(1,
      (baseScrollX + viewWidth.current / 2) / (OCTAVE_LIST.length * WHITE_PER_OCT * oldKW)
    ));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (commitKeyWidth(oldKW + delta)) {
      pendingFocalFracRef.current = focalFrac;
      // Predict where the scroll will land so the next rapid press has a correct base.
      const newTotalW = OCTAVE_LIST.length * WHITE_PER_OCT * lastWidthRef.current;
      const maxX = Math.max(0, newTotalW - viewWidth.current);
      pendingScrollXRef.current = Math.max(0, Math.min(maxX, focalFrac * newTotalW - viewWidth.current / 2));
      // Lock out native scroll writes for the duration of the zoom (each rapid press re-arms the
      // timer, so it stays locked through a spam/hold and releases ~160ms after the last press,
      // by which time onContentSizeChange has landed the final position).
      scrollLockSV.value = 1;
      if (zoomSettleRef.current) clearTimeout(zoomSettleRef.current);
      zoomSettleRef.current = setTimeout(() => { scrollLockSV.value = 0; }, 160);
    }
  }, [commitKeyWidth]);

  const zoomSettleRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const zoomIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopContinuousZoom = useCallback(() => {
    if (zoomIntervalRef.current !== null) {
      clearInterval(zoomIntervalRef.current);
      zoomIntervalRef.current = null;
    }
  }, []);
  const startContinuousZoom = useCallback((delta: number) => {
    stopContinuousZoom();
    zoomIntervalRef.current = setInterval(() => zoomBy(delta), 80);
  }, [zoomBy, stopContinuousZoom]);
  useEffect(() => () => { stopContinuousZoom(); if (zoomSettleRef.current) clearTimeout(zoomSettleRef.current); }, []);
  const octaveNumbering = useSettingsStore((s: any) => s.octaveNumbering);

  const [viewW, setViewW] = React.useState(300);

  // Live scroll position, driving the minimap viewport box. The Reanimated scroll handler
  // writes scrollSV on the UI THREAD every frame, so the box tracks the keyboard with zero
  // JS-thread lag (the old Animated.event + addListener path lagged/jittered on Android).
  const scrollSV = useSharedValue(0);   // minimap: live scroll offset, UI thread
  const scrollOffsetRef = useRef(0);    // same value mirrored to JS for zoomBy's focal math
  // While a zoom is in flight this is 1, and the native scroll handler stops writing scrollSV.
  // During zoom the box is driven solely by syncScroll's predicted (focal-centered) positions,
  // which stay consistent with contentWidth; the native onScroll events fire clamped/stale
  // offsets on old-arch Android, which is exactly what made the highlight flicker when spammed.
  const scrollLockSV = useSharedValue(0);
  const setScrollOffset = useCallback((x: number) => { scrollOffsetRef.current = x; }, []);
  const onKbScroll = useAnimatedScrollHandler({
    onScroll: (e) => {
      if (scrollLockSV.value === 1) return;   // zoom in flight — ignore noisy native scroll
      scrollSV.value = e.contentOffset.x;
      runOnJS(setScrollOffset)(e.contentOffset.x);
    },
  });
  // Viewport-center as a fraction (0..1) of the full keyboard width, captured before any zoom commit.
  // Cleared by onContentSizeChange once the scroll has landed (safety net for old arch).
  const pendingFocalFracRef = useRef<number | null>(null);
  // Predicted scroll-X after the in-flight zoom lands. Rapid button presses read this instead
  // of scrollOffsetRef (which is stale until the native layout completes), so each successive
  // zoom chains off the correct virtual position rather than the same stale offset.
  const pendingScrollXRef = useRef<number | null>(null);
  // Keep both the UI-thread (scrollSV) and JS-thread (scrollOffsetRef) mirrors in sync after a
  // programmatic scrollTo, since onScroll may not fire for animated:false jumps on old arch.
  const syncScroll = useCallback((x: number) => { scrollSV.value = x; scrollOffsetRef.current = x; }, [scrollSV]);

  const miniContentWidth = OCTAVE_LIST.length * MM_WHITE_PER_OCT * keyWidth;

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
  // Per-key tap gestures are built ONCE into a stable map below (keyTaps), keyed by MIDI.
  // They previously were recreated inline every render (makeKeyTap(midi)), which handed
  // every key's GestureDetector a brand-new gesture object on each chord change — that
  // re-registered ~90 native gesture handlers and defeated the WhiteKey/BlackKey
  // React.memo, so the whole keyboard re-rendered on every chord. Stable gestures let the
  // memoized keys actually skip re-render. Several keys still fire independently (multitouch
  // double-stops) — onStart fires per key — and onNotePressRef keeps the latest callback.
  // Reset any in-flight flash to rest when the displayed notes change, so a key whose
  // press-pulse was cut off mid-flight (left at 0.95) isn't reused stuck-pressed on the
  // next chord. We reset the VALUES in place rather than recreating the objects, so each
  // key's `anim` reference stays stable — that's what lets the memoized keys skip
  // re-rendering on a chord change (only the keys whose props actually changed re-render).
  const midiKey = midiNotes.join(',');
  const prevMidiKeyRef = useRef(midiKey);
  if (prevMidiKeyRef.current !== midiKey) {
    prevMidiKeyRef.current = midiKey;
    Object.values(flashAnims.current).forEach((v: any) => v.setValue(1));
  }
  
  useImperativeHandle(ref, () => ({ 
    flashMidi: (midi: number) => doFlashMidi(midi), 
    flashAll: (midiNotes: number[]) => midiNotes.forEach(m => doFlashMidi(m)),
    recenter: () => scrollRef.current?.scrollTo({ x: computeScrollX(), animated: true }),
  }));

  // Animate the horizontal scroll on chord/octave change so the keyboard glides to the new
  // chord. We DON'T sync scrollSV here — the onScroll events fired during the animated slide
  // drive scrollSV progressively on the UI thread, so the minimap viewport box slides in lock-step.
  useEffect(() => { if (!isReady.current) return; scrollRef.current?.scrollTo({ x: computeScrollX(), animated: true }); }, [midiNotes.join(','), octave]);

  // keyWidth changed — apply zoom correction.
  // On Fabric, native layout is computed synchronously before this effect fires, so scrollTo
  // lands at the exact target with no clamping. onContentSizeChange re-applies as a safety net
  // (no-op on Fabric, corrects old-arch where the first scrollTo may be clamped).
  useLayoutEffect(() => {
    if (!isReady.current) return;
    const frac = pendingFocalFracRef.current;
    if (frac !== null) {
      const totalW = OCTAVE_LIST.length * WHITE_PER_OCT * keyWidth;
      const maxX = Math.max(0, totalW - viewWidth.current);
      const x = Math.max(0, Math.min(maxX, frac * totalW - viewWidth.current / 2));
      scrollRef.current?.scrollTo({ x, animated: false });
      syncScroll(x);
      pendingScrollXRef.current = x; // sync prediction with post-layout value
      // Don't clear pendingFocalFracRef — onContentSizeChange will clear and re-apply (old-arch safety net).
    } else {
      const x = computeScrollX();
      scrollRef.current?.scrollTo({ x, animated: false });
      syncScroll(x);
      pendingScrollXRef.current = null;
    }
  }, [keyWidth]);

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

  // (root-to-root span for the scale-overlay window is now computed inside the keyVisuals memo)

  // ── True multitouch input ──────────────────────────────────────────────────
  // The keys themselves are purely visual (no touch handlers). Per-key handlers —
  // whether TouchableOpacity, the JS responder system, or onTouchEnd — all funnel
  // through React Native's single-pointer model inside a ScrollView, so only ONE note
  // could ever sound at a time. Instead, ONE gesture surface covers the whole keyboard,
  // reads every active finger (changedTouches), and hit-tests each finger's (x,y) to a
  // key, firing on finger-DOWN. Pressing C and G together => both play at once.
  //
  // hitTestMidi maps a point in keyboard-content space to a MIDI note using the exact
  // same geometry the keys are drawn with (keyWidth, BLACK_OFFSETS, BKH). Black keys sit
  // on top and win wherever the touch falls inside their narrower/shorter footprint.
  const hitTestMidi = useCallback((x: number, y: number): number | null => {
    const kw = keyWidth;
    const octaveWidth = 7 * kw;
    if (x < 0 || y < 0) return null;
    const octaveIndex = Math.floor(x / octaveWidth);
    if (octaveIndex < 0 || octaveIndex >= OCTAVE_LIST.length) return null;
    const base = OCTAVE_LIST[octaveIndex] * 12;
    const xInOct = x - octaveIndex * octaveWidth;
    // Black keys occupy the top BKH px; check them first since they render above whites.
    if (y <= BKH) {
      const bw = Math.round(kw * 0.59);
      for (const pc of BLACK_PCS) {
        const left = BLACK_OFFSETS[pc] * kw;
        if (xInOct >= left && xInOct <= left + bw) return base + pc;
      }
    }
    // Otherwise the white key under x.
    let wi = Math.floor(xInOct / kw);
    if (wi < 0) wi = 0; else if (wi > 6) wi = 6;
    return base + WHITE_PCS[wi];
  }, [keyWidth]);

  // Refs keep the gesture instance stable across renders while always calling the latest
  // handlers/geometry (onNotePress is recreated by the parent on every render).
  const hitTestRef = useRef(hitTestMidi); hitTestRef.current = hitTestMidi;
  const onNotePressRef = useRef(onNotePress); onNotePressRef.current = onNotePress;

  // Stable per-key tap gestures, built once. See the doFlashMidi note above: a fresh
  // gesture per render was the hidden cost that re-rendered the whole keyboard on every
  // chord. doFlashMidi reads the live flashAnims ref, and onNotePressRef holds the latest
  // callback, so these one-time closures stay correct without being rebuilt.
  const keyTaps = useMemo(() => {
    const m = new Map<number, any>();
    for (const oct of OCTAVE_LIST) {
      const base = oct * 12;
      for (const pc of [...WHITE_PCS, ...BLACK_PCS]) {
        const midi = base + pc;
        m.set(midi, Gesture.Tap()
          .runOnJS(true)
          .maxDuration(600000)
          .maxDistance(16)
          .onStart(() => { doFlashMidi(midi); onNotePressRef.current?.(midi); }));
      }
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Per-touch start positions, so we can tell a TAP (play the key) from a DRAG (scroll the
  // keyboard, play nothing). Keyed by touch id for true multitouch.
  const touchStartsRef = useRef<Map<number, { x: number; y: number; moved: boolean }>>(new Map());
  const SCROLL_THRESH_SQ = 12 * 12; // px² a finger may wander and still count as a tap

  // Gesture.Manual never activates on its own, so it does NOT steal the gesture from the
  // surrounding ScrollView — drag-to-scroll, auto-centering and zoom all keep working.
  // We watch the raw touch stream and play a key on finger-UP only if that finger didn't
  // move (a tap). A finger that moves past the threshold (or the ScrollView claims it for a
  // scroll → onTouchesCancelled) plays nothing, so you can press-and-drag to scroll silently.
  // runOnJS(true) lets the callback call onNotePress (a JS bridge call) directly.
  const keyGesture = useMemo(() =>
    Gesture.Manual()
      .runOnJS(true)
      .onTouchesDown((e) => {
        for (const t of e.changedTouches) {
          touchStartsRef.current.set(t.id, { x: t.x, y: t.y, moved: false });
        }
      })
      .onTouchesMove((e) => {
        for (const t of e.changedTouches) {
          const s = touchStartsRef.current.get(t.id);
          if (s && !s.moved) {
            const dx = t.x - s.x, dy = t.y - s.y;
            if (dx * dx + dy * dy > SCROLL_THRESH_SQ) s.moved = true;
          }
        }
      })
      .onTouchesUp((e) => {
        for (const t of e.changedTouches) {
          const s = touchStartsRef.current.get(t.id);
          touchStartsRef.current.delete(t.id);
          if (!s || s.moved) continue;
          const midi = hitTestRef.current(s.x, s.y);
          if (midi == null) continue;
          doFlashMidi(midi);
          onNotePressRef.current?.(midi);
        }
      })
      .onTouchesCancelled((e) => {
        for (const t of e.changedTouches) touchStartsRef.current.delete(t.id);
      }),
  []);

  // Per-key appearance (colors, text color, label, overlay) precomputed once and keyed on the
  // chord/theme/settings — but NOT on keyWidth. Zooming changes only width, so renderOctave reuses
  // this cached map instead of re-running getNoteColor/getLabelStr for all ~84 keys every step
  // (that recompute was the bulk of the on-device zoom cost). renderOctave then only applies the
  // width-dependent layout per key.
  const keyVisuals = React.useMemo(() => {
    const noteNamesArr = namingMode === 'flat' ? ALL_NOTE_NAMES_FLAT : ALL_NOTE_NAMES_SHARP;
    const aSet = new Set(midiNotes);
    const minM = midiNotes.length > 0 ? Math.min(...midiNotes) : 0;
    const maxM = midiNotes.length > 0 ? Math.max(...midiNotes) : 127;
    const loRoot = minM - ((minM - rootSemi + 12) % 12);
    const hiRoot = maxM + ((rootSemi - maxM % 12 + 12) % 12);
    const map = new Map<number, any>();
    const compute = (pc: number, midi: number, isWhite: boolean) => {
      const isActive = aSet.has(midi);
      const role = roles[midiNotes.indexOf(midi)] ?? '';
      const activeFormula = formulas[midiNotes.indexOf(midi)] ?? '';
      let keyColor = isWhite ? '#ffffff' : '#1c1c1e';
      let keyTextColor = isWhite ? theme.txt3 : '#888';
      let keyBorder = 0;
      if (isActive) {
        // Ensure every active note gets a color - use degree relative to root as fallback
        const defaultDegree = degreeForPc(pc, rootSemi);
        const resolvedColor = getNoteColor(activeFormula || role || defaultDegree, colorMode, theme, selectiveRoles);
        if (colorMode === 'theme') {
          keyColor = accentColor ?? theme.accent; keyTextColor = '#fff'; keyBorder = 0;
        } else if (colorMode === 'selective') {
          keyColor = resolvedColor; keyTextColor = resolvedColor === theme.mutedNote ? theme.txt1 : '#fff'; keyBorder = resolvedColor === theme.mutedNote ? 1 : 0;
        } else {
          const roleColor = ROLE_COLORS_GLOBAL[activeFormula] ?? ROLE_COLORS_GLOBAL[role] ?? ROLE_COLORS_GLOBAL[defaultDegree];
          if (roleColor) { keyColor = accentColor ?? roleColor; keyTextColor = '#fff'; keyBorder = 0; }
          else { keyColor = theme.mutedNote; keyTextColor = theme.txt1; keyBorder = 1; }
        }
      }
      // Show overlay ONLY within the root-to-root octaves the current voicing spans!
      const isOverlay = scaleOverlay && !isActive && overlayNotes.includes(midi) && midi >= loRoot && midi < hiRoot;
      let overlayColor = 'transparent';
      let overlayF = '';
      if (isOverlay) {
        const overlayIdx = overlayNotes.indexOf(midi);
        overlayF = overlayFormulas[overlayIdx] || overlayRoles[overlayIdx] || formulaByPC[pc] || degreeForPc(pc, rootSemi);
        overlayColor = getNoteColor(overlayF, colorMode, theme, selectiveRoles);
        if (overlayColor === theme.mutedNote) overlayColor = theme.accent;
      }
      const label = getLabelStr(midi, pc, role, activeFormula, isActive, noteNamesArr, isOverlay, overlayF);
      map.set(midi, { isActive, keyColor, keyTextColor, keyBorder, label, isOverlay, overlayColor });
    };
    for (const oct of OCTAVE_LIST) {
      const base = oct * 12;
      for (const pc of WHITE_PCS) compute(pc, base + pc, true);
      for (const pc of BLACK_PCS) compute(pc, base + pc, false);
    }
    return map;
  }, [midiKey, roles, formulas, noteNames, colorMode, selectiveRoles, theme, accentColor, rootSemi, namingMode, labelMode, showAllLabels, octaveNumbering, scaleOverlay, overlayNotes, overlayRoles, overlayFormulas, formulaByPC]);

  const renderOctave = (oct: number) => {
    const base = oct * 12;
    return (
      <View key={oct} style={[styles.octave, { width: keyWidth * WHITE_PER_OCT }]}>
        {WHITE_PCS.map((pc) => {
          const midi = base + pc;
          const v = keyVisuals.get(midi) || {};
          return (
            <GestureDetector key={pc} gesture={keyTaps.get(midi)}>
              <WhiteKey keyColor={v.keyColor} keyTextColor={v.keyTextColor} label={v.label} isOverlay={v.isOverlay} overlayColor={v.overlayColor} anim={getFlashAnim(midi)} isActive={v.isActive} borderColor={theme.border} />
            </GestureDetector>
          );
        })}
        {BLACK_PCS.map(pc => {
          const midi = base + pc;
          const v = keyVisuals.get(midi) || {};
          return (
            <GestureDetector key={pc} gesture={keyTaps.get(midi)}>
              <BlackKey keyColor={v.keyColor} keyTextColor={v.keyTextColor} keyBorder={v.keyBorder} label={v.label} isOverlay={v.isOverlay} overlayColor={v.overlayColor} left={BLACK_LEFT_PCT[pc]} width={BLACK_WIDTH_PCT} anim={getFlashAnim(midi)} borderColor={theme.border} />
            </GestureDetector>
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

  // Lift the whole-keyboard minimap up to the Chord screen's slide-up when asked (else it renders
  // inline below — see showMiniMap). scrollSV/contentWidth/viewW are passed through so the viewport
  // box still tracks the live keyboard scroll even while shown in the slide-up. null clears it.
  React.useEffect(() => {
    if (!onMiniMap) return;
    onMiniMap(
      <PianoMiniMap
        midiNotes={midiNotes}
        theme={theme}
        rootSemi={rootSemi}
        roles={roles}
        formulas={formulas}
        colorMode={colorMode}
        accentColor={accentColor}
        selectiveRoles={selectiveRoles}
        contentWidth={miniContentWidth}
        viewW={viewW}
        scrollSV={scrollSV}
      />
    );
    return () => onMiniMap(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onMiniMap, midiKey, colorMode, theme, accentColor, rootSemi, miniContentWidth, viewW]);

  return (
    <View style={[styles.container, { backgroundColor: theme.bg2, borderColor: theme.border }]}>
      {/* Top band: ChordCard (left column) + stacked navigators (right column). Skipped entirely when
          empty (Quiz: no card + no navigation) so there's no fixed-height gap above the keyboard. */}
      {(leftSlot || showNavigation || parentScales.length > 0) && (
      <View style={[styles.band, leftSlot ? { height: 210 } : null, { borderBottomColor: theme.border }]}>
        {leftSlot ? <View style={styles.bandLeft}>{leftSlot}</View> : null}
        {leftSlot ? <View style={[styles.bandDivider, { backgroundColor: theme.border }]} /> : null}
        <View style={styles.bandNav}>
      {showNavigation && groups && groups.length > 1 && (() => {
        const idx = Math.max(0, groups.findIndex(g => voicingIdx >= g.startIdx && voicingIdx < g.startIdx + g.count));
        return (
          <View style={[styles.navRow, { borderBottomColor: theme.border }]}>
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
        <View style={[styles.navRow, { borderBottomColor: theme.border }]}>
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
        <View style={[styles.navRow, { borderBottomColor: theme.border }]}>
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
        </View>
      </View>
      )}
      {/* Voicing-tab selector — now BELOW the card + navigator band (previously the view header). */}
      {header}
      {showMiniMap && (
        <PianoMiniMap
          midiNotes={midiNotes}
          theme={theme}
          rootSemi={rootSemi}
          roles={roles}
          formulas={formulas}
          colorMode={colorMode}
          accentColor={accentColor}
          selectiveRoles={selectiveRoles}
          contentWidth={miniContentWidth}
          viewW={viewW}
          scrollSV={scrollSV}
        />
      )}
      <View style={{ paddingTop: 0, paddingBottom: 0, backgroundColor: theme.bg2, position: 'relative' }}>
      <Reanimated.ScrollView ref={scrollRef as any} horizontal showsHorizontalScrollIndicator={false} scrollEventThrottle={16} onScroll={onKbScroll} style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border, backgroundColor: theme.bg2 }} contentContainerStyle={[styles.content, { height: WKH }]} onLayout={(e) => { viewWidth.current = e.nativeEvent.layout.width; setViewW(e.nativeEvent.layout.width); }} onContentSizeChange={(w) => {
        if (!isReady.current) { isReady.current = true; const x = computeScrollX(); scrollRef.current?.scrollTo({ x, animated: false }); syncScroll(x); return; }
        // Only apply the focal-point correction when `w` matches the CURRENTLY committed key
        // width. During rapid button presses, an intermediate onContentSizeChange (for an
        // earlier layout) fires while pendingFocalFracRef already holds the NEXT press's frac.
        // If we applied+cleared here, the final layout's callback would find null and skip,
        // leaving the scroll permanently wrong. Skipping intermediate layouts is safe: the
        // final onContentSizeChange always fires and lands at the correct position.
        const frac = pendingFocalFracRef.current;
        const expectedW = OCTAVE_LIST.length * WHITE_PER_OCT * lastWidthRef.current;
        if (frac !== null && Math.abs(w - expectedW) < 2) {
          pendingFocalFracRef.current = null;
          const maxX = Math.max(0, w - viewWidth.current);
          const x = Math.max(0, Math.min(maxX, frac * w - viewWidth.current / 2));
          scrollRef.current?.scrollTo({ x, animated: false });
          syncScroll(x);
          pendingScrollXRef.current = null;
        }
      }}>
        <GestureDetector gesture={keyGesture}>
          <View style={{ flexDirection: 'row', height: WKH }}>
            {OCTAVE_LIST.map(oct => renderOctave(oct))}
          </View>
        </GestureDetector>
      </Reanimated.ScrollView>
      {/* Floating zoom controls — overlaid on the top-right of the keyboard so they don't
          consume a dedicated row. Tap = one step; hold = continuous zoom (auto-repeat). */}
      <View style={styles.zoomFloat} pointerEvents="box-none">
        <TouchableOpacity
          style={[styles.zoomFloatBtn, { backgroundColor: withAlpha(theme.bg, 0.92), borderColor: theme.border }]}
          onPress={() => zoomBy(-6)}
          onLongPress={() => startContinuousZoom(-6)}
          onPressOut={stopContinuousZoom}
          delayPressIn={0}
          delayLongPress={400}
          activeOpacity={0.7}
        >
          <Ionicons name="remove" size={20} color={theme.accent} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.zoomFloatBtn, { backgroundColor: withAlpha(theme.bg, 0.92), borderColor: theme.border }]}
          onPress={() => zoomBy(6)}
          onLongPress={() => startContinuousZoom(6)}
          onPressOut={stopContinuousZoom}
          delayPressIn={0}
          delayLongPress={400}
          activeOpacity={0.7}
        >
          <Ionicons name="add" size={20} color={theme.accent} />
        </TouchableOpacity>
      </View>
      </View>
    </View>
  );
}));

export default PianoView;

const styles = StyleSheet.create({
  container: { overflow: 'hidden', position: 'relative', paddingTop: 0 },
  // Fixed height (applied INLINE only when leftSlot is present — the Chord screen) so the band never
  // resizes as content changes (1 vs 2 nav rows, 1 vs 2 pill rows, sub-label present/absent). Sized to
  // the tallest case (scales: sub-label + 2 pill rows ≈ 208); shorter content centers within it. The
  // Quiz (no leftSlot, no navigation) skips the band entirely — no fixed height, no empty gap.
  band: { flexDirection: 'row', alignItems: 'stretch', borderBottomWidth: 1 },
  bandLeft: { flex: 1, justifyContent: 'center' },
  bandDivider: { width: 1, alignSelf: 'stretch' },
  bandNav: { flex: 1, justifyContent: 'center', paddingVertical: 6, gap: 8 },
  // paddingHorizontal 8 matches the LEFT column's chevron inset (ChordCard paddingHorizontal 8) so the
  // navigator chevrons hug the borders the same way — leaving the center label its full width.
  navRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8 },
  navContainer: {
  flexDirection: 'row', 
  alignItems: 'center', 
  justifyContent: 'space-between',
  paddingHorizontal: 12,
  height: ROW_HEIGHT,
  borderBottomWidth: 1, // Added line
},
  navBtn: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  navArrow: { fontSize: 24, fontWeight: '700', lineHeight: 28, marginTop: -2 },
  navLabelWrap: { flex: 1, alignItems: 'center' },
  navLabelTag: { fontSize: 10, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 2 },
  navLabelTop: { fontSize: 14, fontWeight: '700' },
  navLabelBot: { fontSize: 10, fontWeight: '600', marginTop: 2 },
  zoomFloat: { position: 'absolute', top: 8, right: 8, flexDirection: 'row', gap: 6, zIndex: 20, elevation: 8 },
  zoomFloatBtn: { width: 38, height: 38, borderRadius: 19, borderWidth: 1, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 8 },
  content: { flexDirection: 'row', paddingHorizontal: 0, paddingTop: 0, paddingBottom: 0 },
  octave: { flexDirection: 'row', position: 'relative', height: WKH },
  whiteKey: { height: WKH, borderBottomLeftRadius: 6, borderBottomRightRadius: 6, borderWidth: 1, borderTopWidth: 0, justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 10, shadowOffset: { width: 0, height: 2 }, shadowRadius: 3, elevation: 2 },
  blackKeyTouch: { position: 'absolute', top: 0, height: BKH, zIndex: 2 },
  blackKey: { height: BKH, borderBottomLeftRadius: 4, borderBottomRightRadius: 4, justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 4 },
  keyName: { fontSize: 12, fontWeight: '700', height: 16, lineHeight: 16, textAlign: 'center' },
  blackKeyName: { fontSize: 10, fontWeight: '700', height: 14, lineHeight: 14, textAlign: 'center' },
});