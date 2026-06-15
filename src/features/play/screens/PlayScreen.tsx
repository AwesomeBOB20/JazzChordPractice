import React, { useRef, useState, useLayoutEffect, startTransition } from 'react';
import { View, Text, TouchableOpacity, StyleSheet,
  ScrollView, Animated, Platform
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useIsFocused, useFocusEffect } from '@react-navigation/native';
import { useSettingsStore } from '@features/settings/store/settingsStore';
import { useShallow } from 'zustand/react/shallow';
import { useChordStore, PendingVoicing } from '@features/play/store/chordStore';
import { useDictionaryStore } from '@features/play/store/dictionaryStore';
import ChordDictionary from '@features/play/components/ChordDictionary';
import { CH, NOTE_SHARP, NOTE_FLAT, getChordNotes, spellInterval, GUITAR_TUNING } from '@shared/theory/musicTheory';
import { Theme, THEMES } from '@shared/ui/themes';
import { TYPE, FONT_WEIGHT } from '@shared/ui/typography';
import { ChordCard, CommandSheet, PianoView, type PianoViewRef, FretboardView, type FretboardViewRef, CountChip } from '@shared/ui';
import { buildTriadVoicings, buildShellVoicings, buildDropVoicings, buildScaleVoicings, buildArpVoicings, getArpSubsets, getIntervalSubsets, VoicingGroup, ScaleVoicing, buildOpenVoicings, buildBarreVoicings, buildHardcodedShapeVoicings, ShapeDisplayMode, OPEN_SHAPES, BARRE_SHAPES, findTriads, DROP_VOICINGS, voicingTabSupportsType } from '@shared/guitar';
import { SCALES, CHORD_SCALE_MAP } from '@shared/theory/musicTheory';
import { buildPianoVoicings } from '@shared/piano';
import { useAudio } from '@shared/audio/AudioContext';
import { ARP_SLOTS, buildArpPattern } from '@shared/audio/arpPattern';
import { formatChordSymbol } from '@shared/theory/core/nomenclature';

// Shared empty array so memoized children don't see a new [] reference each render.
const EMPTY_ARR: any[] = [];

const ROOTS = [0,1,2,3,4,5,6,7,8,9,10,11];

const ROLE_WEIGHT: Record<string, number> = {
  'root': 1, 'R': 1, '1': 1, 'b2': 2, '2nd': 2, '2': 2, '#2': 2, 'b3': 3, '3rd': 3, '3': 3,
  '4th': 4, '4': 4, '#4': 4, 'b5': 5, '5th': 5, '5': 5, '#5': 5, 'b6': 6, '6th': 6, '6': 6,
  'bb7': 7, 'b7': 7, '7th': 7, '7': 7, 'b9': 9, '9th': 9, '9': 9, '#9': 9,
  '11th': 11, '11': 11, '#11': 11, 'b13': 13, '13th': 13, '13': 13, '#13': 13
};

// Returns a callback whose identity is STABLE for the component's lifetime but always invokes the
// latest closure — so passing it to a React.memo child never breaks the memo, yet the handler still
// sees current props/state (no stale closures). This is the standard "useEvent" pattern; we use it to
// keep the expensive memoized FretboardView/PianoView/ChordCard from re-rendering on every parent
// render just because their handler props were re-created.
function useStableCallback<T extends (...args: any[]) => any>(fn: T): T {
  const ref = useRef(fn);
  useLayoutEffect(() => { ref.current = fn; });
  return useRef(((...args: any[]) => ref.current(...args)) as T).current;
}

function getComplexity(roles: string[]) {
  const valid = roles.filter(Boolean);
  const size = valid.length;
  const maxExt = valid.length ? Math.max(...valid.map(r => ROLE_WEIGHT[r] || 0)) : 0;
  return { size, maxExt };
}

type VoicingTabKey = 'block' | 'open' | 'barre' | 'triads' | 'shells' | 'drop2' | 'drop3' | 'drop2and4' | 'spread' | 'rootless' | 'scales' | 'arps' | 'intervals' | 'shapes';



function VoicingTabBar({ voicingTab, setVoicingTab, tabCounts, t }: { voicingTab: VoicingTabKey; setVoicingTab: (key: VoicingTabKey) => void; tabCounts: Record<VoicingTabKey, number>; t: Theme; }) {
  const scrollRef = useRef<ScrollView>(null);
  React.useEffect(() => { scrollRef.current?.scrollTo({ x: 0, animated: true }); }, [tabCounts]);

  const ALL_TABS: { key: VoicingTabKey; label: string }[] = [
    { key: 'block', label: 'Block' }, { key: 'open', label: 'Open' }, { key: 'barre', label: 'Barre' },
    { key: 'triads', label: 'Triads' }, { key: 'shells', label: 'Shells' }, { key: 'drop2',  label: 'Drop 2' },
    { key: 'drop3',  label: 'Drop 3' }, { key: 'drop2and4', label: 'Drop 2 & 4' },
    { key: 'intervals', label: 'Intervals' }, { key: 'arps', label: 'Arps' }, { key: 'shapes', label: 'Shapes' },
    { key: 'scales', label: 'Scales' },
  ];
  const TABS = ALL_TABS.filter(tab => tabCounts[tab.key] > 0);

  return (
    <View style={[styles.tabBarOuter, { backgroundColor: t.bg2, borderBottomColor: t.border, paddingHorizontal: 0 }]}>
      <ScrollView ref={scrollRef} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, gap: 12 }}>
        {TABS.map(tab => {
          const isActive = voicingTab === tab.key;
          return (
            <TouchableOpacity key={tab.key} style={[styles.tabBtn, { flexDirection: 'row', gap: 6, paddingHorizontal: 16 }, isActive && { backgroundColor: t.accent }]} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); startTransition(() => setVoicingTab(tab.key)); }} activeOpacity={0.7}>
              <Text style={[styles.modeBtnText, { color: isActive ? '#fff' : t.txt3, includeFontPadding: false }]}>{tab.label}</Text>
              <CountChip count={tabCounts[tab.key]} t={t} onAccent={isActive} />
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

// ─── INLINE VISUAL SETTINGS ─────────────
function VisualDisplaySettings({ voicingTab, shapeDisplayMode, setShapeDisplayMode, activeScaleName, t }: any) {
  const { sortMode, setSortMode, scaleOverlay, setScaleOverlay } = useSettingsStore();
  // Block hides the sort toggle: every block entry is an inversion of the SAME chord (one
  // chord label, bottom note lifted an octave each step), so List Order (by bass scale-degree)
  // and Voicing Order (by lowest pitch) climb in lockstep and yield the identical ascending
  // sequence. The toggle is inert there — sortMode never changes block's output — so we hide it.
  const hideSort = voicingTab === 'scales' || voicingTab === 'arps' || voicingTab === 'intervals' || voicingTab === 'block';
  // Only hide overlay on scales tab since overlaying a scale onto itself is redundant
  const hideOverlay = voicingTab === 'scales'; 

  if (hideSort && hideOverlay) return null;

  return (
    <>
      {!hideSort && (
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            if (voicingTab === 'shapes') {
              setShapeDisplayMode(shapeDisplayMode === 'list' ? 'voicing' : 'list');
            } else {
              setSortMode(sortMode === 'list' ? 'voicings' : 'list');
            }
          }}
          style={[styles.enginePill, { backgroundColor: t.bg2, borderColor: t.border }]}
        >
          <Ionicons name="filter" size={16} color={t.txt2} />
          <Text style={[styles.enginePillTxt, { color: t.txt2 }]}>
            {voicingTab === 'shapes' ? (shapeDisplayMode === 'list' ? 'List Order' : 'Voicing Order') : (sortMode === 'list' ? 'List Order' : 'Voicing Order')}
          </Text>
        </TouchableOpacity>
      )}

      {!hideOverlay && (
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setScaleOverlay(!scaleOverlay);
          }}
          style={[styles.enginePill, { backgroundColor: scaleOverlay ? t.accent : t.bg2, borderColor: scaleOverlay ? t.accent : t.border }]}
        >
          <Ionicons name={scaleOverlay ? 'eye' : 'eye-outline'} size={16} color={scaleOverlay ? '#fff' : t.txt2} />
          <Text style={[styles.enginePillTxt, { color: scaleOverlay ? '#fff' : t.txt2 }]}>
            {scaleOverlay && activeScaleName ? `Scale: ${activeScaleName}` : 'Scale'}
          </Text>
        </TouchableOpacity>
      )}
    </>
  );
}


// ─── EXPLORE MODE TOGGLE (Chord | Dictionary) ───────────────────────────────
// The single entry point to version 2. Version 1 ("Chord") is always the default.
function ExploreModeToggle({ mode, setMode, t }: { mode: 'chord' | 'dictionary'; setMode: (m: 'chord' | 'dictionary') => void; t: Theme; }) {
  const SEGMENTS: { key: 'chord' | 'dictionary'; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { key: 'chord', label: 'Chord', icon: 'albums-outline' },
    { key: 'dictionary', label: 'Dictionary', icon: 'book-outline' },
  ];
  return (
    <View style={{ paddingTop: 8, paddingHorizontal: 12, paddingBottom: 8, backgroundColor: t.bg2, borderBottomWidth: 1, borderBottomColor: t.border, flexDirection: 'row', gap: 8 }}>
      {SEGMENTS.map(seg => {
        const isActive = mode === seg.key;
        return (
          <TouchableOpacity
            key={seg.key}
            activeOpacity={0.7}
            onPress={() => { if (mode !== seg.key) { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setMode(seg.key); } }}
            style={[styles.modeTab, isActive && { backgroundColor: t.accent }]}
          >
            <Ionicons name={seg.icon} size={16} color={isActive ? '#fff' : t.txt3} />
            <Text style={{ fontSize: 14, fontWeight: '700', color: isActive ? '#fff' : t.txt3 }}>{seg.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ─── VOICING EXPLORER ───────────────────────────────────────────────────────
// The shared viewer (ChordCard + fretboard/piano + engine controls + playback)
// used by BOTH chord mode (v1, driven by chordStore) and the dictionary's own
// independent viewer (driven by dictionaryStore). Per-mode inputs come in as
// props; global display prefs (octave, sort, overlay, scale, audio) stay read
// from the shared stores so both modes honour the same preferences.
interface VoicingExplorerProps {
  rootSemi: number;
  chordType: string;
  namingMode: 'sharp' | 'flat';
  instrument: 'piano' | 'guitar';
  setInstrument: (i: 'piano' | 'guitar') => void;
  voicingTab: VoicingTabKey;
  setVoicingTab: (k: VoicingTabKey) => void;
  shiftRoot: (direction: 'up' | 'down') => void;
  cycleType: (direction: 'next' | 'prev') => void;
  // chord mode shows randomize/edit + the chord library sheet; the dictionary
  // viewer hides them (you got here by browsing) and shows an instrument toggle.
  showChordChrome: boolean;
  showInstrumentToggle: boolean;
  sheetVisible: boolean;
  setSheetVisible: (v: boolean) => void;
  playRef?: React.MutableRefObject<() => void>;
  // A Dictionary diagram navigated here and wants us to land on this exact grip/box; we select it
  // once (piano here, guitar inside FretboardView) then call onTargetVoicingApplied to clear it.
  targetVoicing?: PendingVoicing | null;
  onTargetVoicingApplied?: () => void;
}

function VoicingExplorer({
  rootSemi, chordType, namingMode, instrument, setInstrument,
  voicingTab, setVoicingTab, shiftRoot, cycleType,
  showChordChrome, showInstrumentToggle,
  sheetVisible, setSheetVisible, playRef,
  targetVoicing, onTargetVoicingApplied,
}: VoicingExplorerProps) {
  const insets = useSafeAreaInsets();
  const { playChord: onPlay, playSingleNote: onNotePress, stopAudio: onStop, playArpLoop: onArpLoop, playHoldChord: onHoldChord } = useAudio();
  // Narrow selector (not a whole-store subscription): this heavy screen re-renders only when one
  // of THESE fields changes, so unrelated settings (volumes, colorMode, dictionary prefs, …) no
  // longer trigger a full Explore re-render + diagram cascade.
  const { bpm, arp, setArp, setArpForced, playMode, setPlayMode, octave, theme, labelMode, sortMode, scaleOverlay } = useSettingsStore(
    useShallow((s) => ({ bpm: s.bpm, arp: s.arp, setArp: s.setArp, setArpForced: s.setArpForced, playMode: s.playMode, setPlayMode: s.setPlayMode, octave: s.octave, theme: s.theme, labelMode: s.labelMode, sortMode: s.sortMode, scaleOverlay: s.scaleOverlay }))
  );
  const { inputMode, selectedScaleId, setSelectedScaleId, activeTypes } = useChordStore();
  const t = THEMES[theme];
  const playAnim = useRef(new Animated.Value(1)).current;
  const seqFlashTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const lastRandomTimeRef = useRef(0);
  // Whether THIS (Explore/chord) screen is the focused tab, kept in a ref so lifecycle effects can
  // read the current value at the moment they run. The audio engine is GLOBAL: this screen's
  // "stop my preview" effects (instrument/octave/tab/sort changes, mount, unmount) call the shared
  // stopAudio — which, when this screen is in the BACKGROUND, would kill a progression playing on the
  // Song tab. On Android cold start this screen's subtree mounts a few seconds late (while a Song
  // progression is already running), and that mount-time stop froze the progression at a "random"
  // bar. Gating every incidental stop on focus makes a backgrounded Explore screen never touch
  // another screen's audio. (User-driven stops here always happen while focused, so they're unaffected.)
  const veFocused = useIsFocused();
  const veFocusedRef = useRef(veFocused);
  veFocusedRef.current = veFocused;

  React.useEffect(() => {
    stopSeqFlash();
    if (veFocusedRef.current) onStop?.(); // don't stop the Song tab's progression from the background
    setPianoVoicingIdx(0);
    setArpSubsetIdx(0);
    setIntervalSubsetIdx(0);
  }, [instrument, octave]);
  
  const [arpSubsetIdx, setArpSubsetIdx] = React.useState(0);
  const [intervalSubsetIdx, setIntervalSubsetIdx] = React.useState(0);
  const [variationLabel, setVariationLabel] = React.useState<string | undefined>();
  const [activeFretboardRoles, setActiveFretboardRoles] = React.useState<string[] | undefined>();
  const [activeFretboardIvs, setActiveFretboardIvs] = React.useState<number[] | undefined>();
  const [activeFretboardFormula, setActiveFretboardFormula] = React.useState<string[] | undefined>();
  const [pianoVoicingIdx, setPianoVoicingIdx] = React.useState(0);
  const [shapeDisplayMode, setShapeDisplayMode] = React.useState<ShapeDisplayMode>('list');

  const currentGuitarMidi = useRef<number[]>([]);
  const pianoRef = useRef<PianoViewRef>(null);
  const fretboardRef = useRef<FretboardViewRef>(null);
  const currentScaleMidi = useRef<number[]>([]);
  const [isPlaying, setIsPlaying] = React.useState(false);
  const isLoopingRef = useRef(false);
  const pendingPlayRef = useRef(false);
  const userInteractedRef = useRef(false);
  // Debounce auto-play after a chord change so spamming randomize doesn't blip every
  // intermediate chord — only the final chord (once taps stop for PLAY_DEBOUNCE_MS) sounds.
  const playDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const PLAY_DEBOUNCE_MS = 200;

  const stopSeqFlash = () => { isLoopingRef.current = false; seqFlashTimers.current.forEach(t => clearTimeout(t)); seqFlashTimers.current = []; setIsPlaying(false); };
  const handleStop = () => { stopSeqFlash(); onStop?.(); };

  // Toggling Explore mode or leaving the dictionary viewer swaps this component
  // out without a navigation blur, so stop any sound on unmount explicitly — but ONLY if this
  // screen is focused (a background unmount must not kill another tab's audio).
  React.useEffect(() => () => { isLoopingRef.current = false; seqFlashTimers.current.forEach(clearTimeout); seqFlashTimers.current = []; if (veFocusedRef.current) onStop?.(); }, []);

  const fireSeqFlash = (midiNotes: number[], loop = false) => {
    stopSeqFlash(); isLoopingRef.current = loop;
    const AUDIO_LATENCY = 60; // Sync visual to audio bridge latency
    const SLOTS = loop ? ARP_SLOTS : midiNotes.length;
    const pattern: number[] = loop ? buildArpPattern(midiNotes) : midiNotes.slice(0, SLOTS);
    setIsPlaying(true);
    const fireMeasure = () => {
      // Re-read BPM each measure so animation stays locked to the audio engine when tempo changes.
      const msPerStep = 60000 / useSettingsStore.getState().bpm / 2;
      const measureMs = msPerStep * SLOTS;
      pattern.forEach((midi, i) => {
        const fire = () => { pianoRef.current?.flashMidi(midi); fretboardRef.current?.flashMidi(midi); };
        seqFlashTimers.current.push(setTimeout(fire, Math.round(msPerStep * i) + AUDIO_LATENCY));
      });
      if (loop) seqFlashTimers.current.push(setTimeout(() => { if (isLoopingRef.current) fireMeasure(); }, measureMs));
      else seqFlashTimers.current.push(setTimeout(() => setIsPlaying(false), measureMs));
    };
    fireMeasure();
  };

  const playCurrentChordRef = useRef<() => void>(() => {});
  if (playRef) playRef.current = () => playCurrentChordRef.current();
  playCurrentChordRef.current = () => {
    const isScaleOrArp = voicingTab === 'scales' || voicingTab === 'arps' || voicingTab === 'intervals' || voicingTab === 'shapes';
    if (instrument === 'guitar') {
      const notesToPlay = (isScaleOrArp && currentScaleMidi.current.length) ? currentScaleMidi.current : currentGuitarMidi.current;
      if (notesToPlay.length) {
        const currentArp = isScaleOrArp ? true : arp;
        const isHold = playMode === 'hold' && !currentArp;
        const isArpHold = playMode === 'hold' && currentArp;
        if (isArpHold) { onArpLoop?.(notesToPlay, true); fireSeqFlash(notesToPlay, true); setIsPlaying(true); }
        else if (isHold) { onHoldChord(notesToPlay, 80); fretboardRef.current?.flashAll(notesToPlay); setIsPlaying(true); }
        else { onPlay(notesToPlay, { guitar: true, forceArp: currentArp, scale: voicingTab === 'scales' });
          if (currentArp) fireSeqFlash(notesToPlay); else fretboardRef.current?.flashAll(notesToPlay);
        }
      }
    } else {
      const pianoNotes = pianoVoicings[pianoVoicingIdx]?.notes || getChordNotes(rootSemi, chordType, octave);
      if (pianoNotes.length) {
        const currentArp = isScaleOrArp ? true : arp;
        const isHold = playMode === 'hold' && !currentArp;
        const isArpHold = playMode === 'hold' && currentArp;
        if (isArpHold) { onArpLoop?.(pianoNotes, false); fireSeqFlash(pianoNotes, true); setIsPlaying(true); }
        else if (isHold) { onHoldChord(pianoNotes, 80); pianoRef.current?.flashAll(pianoNotes); setIsPlaying(true); }
        else { onPlay(pianoNotes, { guitar: false, forceArp: currentArp, scale: voicingTab === 'scales' });
          if (currentArp) fireSeqFlash(pianoNotes); else pianoRef.current?.flashAll(pianoNotes);
        }
      }
    }
  };

  // Cancel any queued auto-play and schedule a fresh one. Rapid chord changes keep
  // resetting the timer, so only the chord that's still showing when taps stop will play.
  const schedulePlay = () => {
    if (playDebounceRef.current) clearTimeout(playDebounceRef.current);
    playDebounceRef.current = setTimeout(() => { playDebounceRef.current = null; playCurrentChordRef.current(); }, PLAY_DEBOUNCE_MS);
  };

  const isFocused = useIsFocused();
  React.useEffect(() => {
    if (!isFocused || !userInteractedRef.current) return;
    userInteractedRef.current = false;
    // Stop the previous sound immediately (so spamming is silent), but DEBOUNCE the new
    // chord's playback. Guitar still waits for its voicing to build (pendingPlayRef →
    // the fretboard callback calls schedulePlay); piano schedules directly here.
    stopSeqFlash(); onStop?.(); setVariationLabel(undefined); setPianoVoicingIdx(0); setArpSubsetIdx(0); setIntervalSubsetIdx(0);
    if (instrument === 'piano') schedulePlay(); else pendingPlayRef.current = true;
  }, [rootSemi, chordType]);

  React.useEffect(() => {
    if (!isFocused) { if (playDebounceRef.current) { clearTimeout(playDebounceRef.current); playDebounceRef.current = null; } handleStop(); }
  }, [isFocused]);

  // Intervals/Arps/Shapes/Scales can only arpeggiate (playback already forces it),
  // so force the header arp toggle to show/lock arpeggio while one of those tabs is
  // active, reverting to the user's real `arp` setting otherwise. useFocusEffect
  // (not a plain isFocused effect) because freezeOnBlur suspends in-screen effects
  // on blur — focus events still fire, so this re-asserts on every (re)focus and
  // when the tab changes while focused. The 'blur' listener in App.tsx clears it.
  const arpForcingTab = voicingTab === 'scales' || voicingTab === 'arps' || voicingTab === 'intervals' || voicingTab === 'shapes';
  useFocusEffect(
    React.useCallback(() => { setArpForced(arpForcingTab); }, [arpForcingTab, setArpForced])
  );

  const isFirstSettingsRender = useRef(true);
  React.useEffect(() => { 
    if (isFirstSettingsRender.current) {
      isFirstSettingsRender.current = false;
      return;
    }
    if (isFocused) {
      handleStop();
      // Automatically replay the chord to demonstrate the new setting
      const timer = setTimeout(() => {
        playCurrentChordRef.current();
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [arp, playMode, instrument, octave]);

  const handlePlay = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Animated.sequence([ Animated.timing(playAnim, { toValue: 0.92, duration: 80, useNativeDriver: true }), Animated.timing(playAnim, { toValue: 1, duration: 120, useNativeDriver: true }) ]).start();
    onStop?.();
    if (instrument === 'piano') pianoRef.current?.recenter();
    const isScaleOrArp = voicingTab === 'scales' || voicingTab === 'arps' || voicingTab === 'intervals' || voicingTab === 'shapes';
    if (instrument === 'guitar') {
      const notesToPlay = (isScaleOrArp && currentScaleMidi.current.length) ? currentScaleMidi.current : currentGuitarMidi.current;
      if (notesToPlay.length) {
        const currentArp = isScaleOrArp ? true : arp;
        const isHold = playMode === 'hold' && !currentArp;
        const isArpHold = playMode === 'hold' && currentArp;
        if (isArpHold) { onArpLoop?.(notesToPlay, true); fireSeqFlash(notesToPlay, true); setIsPlaying(true); }
        else if (isHold) { onHoldChord(notesToPlay, 80); fretboardRef.current?.flashAll(notesToPlay); setIsPlaying(true); }
        else { onPlay(notesToPlay, { guitar: true, forceArp: currentArp, scale: voicingTab === 'scales' });
          if (currentArp) fireSeqFlash(notesToPlay); else fretboardRef.current?.flashAll(notesToPlay);
        }
      }
    } else {
      const pianoNotes = pianoVoicings[pianoVoicingIdx]?.notes || getChordNotes(rootSemi, chordType, octave);
      if (pianoNotes.length) {
        const currentArp = isScaleOrArp ? true : arp;
        const isHold = playMode === 'hold' && !currentArp;
        const isArpHold = playMode === 'hold' && currentArp;
        if (isArpHold) { onArpLoop?.(pianoNotes, false); fireSeqFlash(pianoNotes, true); setIsPlaying(true); }
        else if (isHold) { onHoldChord(pianoNotes, 80); pianoRef.current?.flashAll(pianoNotes); setIsPlaying(true); }
        else { onPlay(pianoNotes, { guitar: false, forceArp: currentArp, scale: voicingTab === 'scales' });
          if (currentArp) fireSeqFlash(pianoNotes); else pianoRef.current?.flashAll(pianoNotes);
        }
      }
    }
  };

  const hasVoicingsForTabAndChord = (tab: VoicingTabKey, instr: string, r: number, ct: string): boolean => {
    const ch = CH[ct];
    if (!ch) return false;
    const isPiano = instr === 'piano';

    const countGuitar = (groups: VoicingGroup[]) => {
      if (!groups) return 0;
      let count = 0; const seen = new Set<string>();
      groups.forEach(g => { g.voicings.forEach(v => { if (!seen.has(v.fingerprint)) { seen.add(v.fingerprint); count++; } }); });
      return count;
    };

    if (isPiano) {
      const pV = buildPianoVoicings(r, ct, octave, selectedScaleId, namingMode);
      switch (tab) {
        case 'block': return true;
        case 'triads': return pV.triads.length > 0;
        case 'shells': return pV.shells.length > 0;
        case 'drop2': return !!(pV.drop2 && pV.drop2.length > 0);
        case 'drop3': return !!(pV.drop3 && pV.drop3.length > 0);
        case 'drop2and4': return !!(pV.drop2and4 && pV.drop2and4.length > 0);
        case 'scales': return (CHORD_SCALE_MAP[ct] ?? []).length > 0;
        case 'arps': return getArpSubsets(ch.iv, ch.r, ch.f || []).length > 0;
        case 'intervals': return getIntervalSubsets(ch.iv, ch.r, ch.f || []).length > 0;
        case 'shapes': return buildHardcodedShapeVoicings(ct, r, namingMode).length > 0;
        default: return false;
      }
    } else {
      const rootName = (namingMode === 'flat' ? NOTE_FLAT : NOTE_SHARP)[r];
      const chordName = `${rootName} ${ch.l}`;
      switch (tab) {
        case 'open': return countGuitar(buildOpenVoicings(ct, r, rootName, chordName)) > 0;
        case 'barre': return countGuitar(buildBarreVoicings(ct, r, rootName, chordName)) > 0;
        case 'triads': return countGuitar(buildTriadVoicings(ch, r, rootName, namingMode)) > 0;
        case 'shells': return countGuitar(buildShellVoicings(ct, ch, r, rootName, chordName, namingMode)) > 0;
        case 'drop2':
        case 'drop3':
        case 'drop2and4': {
          const allDrops = buildDropVoicings(ct, ch, r, rootName, chordName, namingMode);
          const dropGroups = allDrops.filter(g => g.voicings[0]?.type === tab);
          return countGuitar(dropGroups) > 0;
        }
        case 'scales': return (CHORD_SCALE_MAP[ct] ?? []).length > 0;
        case 'arps': return getArpSubsets(ch.iv, ch.r, ch.f || []).length > 0;
        case 'intervals': return getIntervalSubsets(ch.iv, ch.r, ch.f || []).length > 0;
        case 'shapes': return buildHardcodedShapeVoicings(ct, r, namingMode).length > 0;
        default: return false;
      }
    }
  };

  // Only the shuffle button (handleRandomNext) needs the eligible-pair list.
  // Computing it as a useMemo forced a 12×N voicing sweep on EVERY tab switch —
  // that was the cold first-visit lag, doing display-irrelevant work on the hot
  // path. Now it's computed lazily on first shuffle and cached per
  // (tab, instrument, types, octave, scale), so switching tabs never triggers it.
  // namingMode intentionally excluded from the key: voicing *existence* is
  // naming-independent (fingerprint/formula keyed), so flat/sharp flips reuse it.
  const eligiblePairsCache = useRef(new Map<string, { r: number; ct: string }[]>());
  const getEligiblePairs = (): { r: number; ct: string }[] => {
    const cacheKey = `${voicingTab}|${instrument}|${activeTypes.join(',')}|${octave}|${selectedScaleId ?? ''}`;
    const cache = eligiblePairsCache.current;
    const cached = cache.get(cacheKey);
    if (cached) return cached;
    const pairs: { r: number; ct: string }[] = [];
    for (let r = 0; r < 12; r++) {
      for (const ct of activeTypes) {
        if (hasVoicingsForTabAndChord(voicingTab, instrument, r, ct)) {
          pairs.push({ r, ct });
        }
      }
    }
    cache.set(cacheKey, pairs);
    return pairs;
  };

  const getEligibleTypesForTab = (tab: VoicingTabKey, instr: string, types: string[]): string[] => {
    // Uses the shared voicingTabSupportsType predicate (single source of truth shared
    // with the quiz settings + quiz generation) so eligibility never drifts.
    const filtered = types.filter(t => voicingTabSupportsType(tab, instr, t));
    return filtered.length > 0 ? filtered : types;
  };

  const perfPressRef = React.useRef(0);
  // Guards against spam-tapping the randomize button. While a chord change is in flight further
  // taps are dropped, so a burst can't queue a backlog of heavy recomputes that keeps "draining"
  // after the finger lifts. The lock is held a short time PAST the work (see the trailing timeout
  // below) to swallow the touch events that buffered while the JS thread was busy.
  const randomizingRef = React.useRef(false);
  const randomReleaseRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  // [PERF] Measure true press -> committed-and-painted latency on-device. The effect below
  // fires after React commits the new chord; the rAF inside waits for paint. TEMP instrumentation.
  React.useEffect(() => {
    const p = perfPressRef.current; if (!p) return; perfPressRef.current = 0;
    requestAnimationFrame(() => console.log('[PERF] randomize', Math.round(performance.now() - p) + 'ms to paint'));
  }, [rootSemi, chordType]);

  const handleRandomNext = () => {
    perfPressRef.current = performance.now();
    const { setChord, randomChord } = useChordStore.getState();

    if (activeTypes.length === 0) {
      userInteractedRef.current = true;
      randomChord();
      return;
    }

    const eligiblePairs = getEligiblePairs();
    const filteredPairs = eligiblePairs.filter(pair => !(pair.r === rootSemi && pair.ct === chordType));
    const finalPairs = filteredPairs.length > 0 ? filteredPairs : eligiblePairs;

    if (finalPairs.length > 0) {
      const selected = finalPairs[Math.floor(Math.random() * finalPairs.length)];
      userInteractedRef.current = true;
      setChord(selected.r, selected.ct);
    } else {
      const eligibleTypes = getEligibleTypesForTab(voicingTab, instrument, activeTypes);
      const r = Math.floor(Math.random() * 12);
      const ct = eligibleTypes[Math.floor(Math.random() * eligibleTypes.length)];
      userInteractedRef.current = true;
      setChord(r, ct);
    }
  };

  const currentChordDef = CH[chordType];
  const rootNoteName = (namingMode === 'flat' ? NOTE_FLAT : NOTE_SHARP)[rootSemi];
  const formattedMainType = React.useMemo(() => { return currentChordDef ? formatChordSymbol(currentChordDef.s || currentChordDef.l || chordType) : ''; }, [currentChordDef, chordType]);
  const displayChordName = currentChordDef ? `${rootNoteName} ${currentChordDef.l}` : '';

  const formulaByPC = React.useMemo(() => {
    if (!currentChordDef) return {};
    const map: Record<number, string> = {};
    currentChordDef.iv.forEach((iv, i) => { map[(rootSemi + iv) % 12] = currentChordDef.f[i] ?? ''; });
    return map;
  }, [rootSemi, chordType]);

  React.useEffect(() => { if (veFocusedRef.current) handleStop(); setPianoVoicingIdx(0); }, [voicingTab, sortMode]);

  // The grid only ever shows ONE tab, so build only that family per press
  // instead of all six. Drops still come from a single buildDropVoicings call
  // filtered by type, exactly as before. Cuts the display path from 6 builds → 1.
  const displayGuitarGroups = React.useMemo<VoicingGroup[]>(() => {
    if (instrument === 'piano' || !currentChordDef) return [];
    switch (voicingTab) {
      case 'open': return buildOpenVoicings(chordType, rootSemi, rootNoteName, displayChordName);
      case 'barre': return buildBarreVoicings(chordType, rootSemi, rootNoteName, displayChordName);
      case 'triads': return buildTriadVoicings(currentChordDef, rootSemi, rootNoteName, namingMode);
      case 'shells': return buildShellVoicings(chordType, currentChordDef, rootSemi, rootNoteName, displayChordName, namingMode);
      case 'drop2':
      case 'drop3':
      case 'drop2and4': {
        const allDrops = buildDropVoicings(chordType, currentChordDef, rootSemi, rootNoteName, displayChordName, namingMode);
        return allDrops.filter(g => g.voicings[0]?.type === voicingTab);
      }
      default: return [];
    }
  }, [voicingTab, rootSemi, chordType, instrument, currentChordDef, namingMode, rootNoteName, displayChordName]);

  // Defer the tab-badge builders off the critical path of a chord change. The active tab's
  // diagram (guitarGroups, ONE family) renders at high priority using the live rootSemi/chordType;
  // these extra families exist only to feed the tab counts, so we key them on DEFERRED values —
  // React paints the new fretboard first, then runs this rebuild in a follow-up low-priority
  // render. The counts/badges update one frame later, which is imperceptible.
  const dRootSemi = React.useDeferredValue(rootSemi);
  const dChordType = React.useDeferredValue(chordType);
  const dChordDef = CH[dChordType];

  // All six families, built ONLY to feed the tab badge counts. Counts key on
  // fingerprint / formula bracket (never on note-name spelling), so we pass fixed
  // sharp labels and exclude naming-derived deps — flat/sharp flips no longer
  // trigger a full rebuild of these six builders.
  const countGuitarGroups = React.useMemo(() => {
    if (instrument === 'piano' || !dChordDef) return { open: [], barre: [], triads: [], shells: [], drop2: [], drop3: [], drop2and4: [] } as Record<string, VoicingGroup[]>;
    const sharpRoot = NOTE_SHARP[dRootSemi];
    const sharpChordName = `${sharpRoot} ${dChordDef.l}`;
    const allDrops = buildDropVoicings(dChordType, dChordDef, dRootSemi, sharpRoot, sharpChordName, 'sharp'); // triads now have drop voicings too
    return {
      open: buildOpenVoicings(dChordType, dRootSemi, sharpRoot, sharpChordName),
      barre: buildBarreVoicings(dChordType, dRootSemi, sharpRoot, sharpChordName),
      shells: buildShellVoicings(dChordType, dChordDef, dRootSemi, sharpRoot, sharpChordName, 'sharp'),
      drop2: allDrops.filter(g => g.voicings[0]?.type === 'drop2'),
      drop3: allDrops.filter(g => g.voicings[0]?.type === 'drop3'),
      drop2and4: allDrops.filter(g => g.voicings[0]?.type === 'drop2and4'),
    } as Record<string, VoicingGroup[]>;
  }, [dRootSemi, dChordType, instrument, dChordDef]);

  const guitarGroups = React.useMemo(() => {
    if (voicingTab === 'scales' || voicingTab === 'arps' || voicingTab === 'intervals' || voicingTab === 'shapes') return [];
    let rawGroups = displayGuitarGroups;
    // Order groups by bass string. Most families read thickest-first: 6th (E) → 5th (A) → 4th (D),
    // so the navigator shows 1/3 = E Bass, 2/3 = A Bass, 3/3 = D Bass (e.g. shells).
    // DROP voicings invert it to thin→thick so 1/3 = 4-3-2-1 (D bass) → 5-4-3-2 → 6-5-4-3 (E bass) —
    // i.e. the HIGHEST bass-string index (4321) comes first.
    rawGroups = [...rawGroups].sort((a, b) => {
      const bassA = a.voicings[0]?.frets.findIndex(f => f.fret !== null) ?? 99;
      const bassB = b.voicings[0]?.frets.findIndex(f => f.fret !== null) ?? 99;
      const ty = a.voicings[0]?.type;
      const isDrop = ty === 'drop2' || ty === 'drop3' || ty === 'drop2and4';
      return isDrop ? bassB - bassA : bassA - bassB;
    });

    const ROLE_ORDER: Record<string, number> = { 'root': 0, 'R': 0, '1': 0, 'b2': 1, '2nd': 1, '2': 1, 'b3': 2, '3rd': 2, '3': 2, '4th': 3, '4': 3, '#4': 3, 'b5': 4, '5th': 4, '5': 4, '#5': 4, 'b6': 5, '6th': 5, '6': 5, 'bb7': 6, 'b7': 6, '7th': 6, '7': 6, 'b9': 7, '9th': 7, '9': 7, '#9': 7, '11th': 8, '11': 8, '#11': 8, 'b13': 9, '13th': 9, '13': 9, '#13': 9 };
    const noteNames = namingMode === 'flat' ? NOTE_FLAT : NOTE_SHARP;

    return rawGroups.map(group => {
      const rootChar = rootNoteName[0];
      const acc = rootNoteName.length > 1 ? (rootNoteName[1] === '♭' || rootNoteName[1] === 'b' ? '[b♭]' : '[#♯]') : '';
      const slashRegex = new RegExp(`\\s*\\/\\s*${rootChar}${acc}\\s*$`, 'i');
      const sortedVoicings = group.voicings.map(v => ({ ...v, chordLabel: v.chordLabel.replace(slashRegex, '').trim() }));

      // Decorate-sort-undecorate: compute each voicing's complexity, fret stats,
      // and label rank ONCE here instead of re-deriving them inside every O(N log N)
      // comparator call (which previously allocated arrays per comparison).
      const decorated = sortedVoicings.map((v: any) => {
        const fretNums = v.frets.filter((f: any) => f.fret !== null).map((f: any) => f.fret as number);
        const avg = fretNums.length ? fretNums.reduce((sum: number, f: number) => sum + f, 0) / fretNums.length : 0;
        const min = fretNums.length ? Math.min(...fretNums) : 0;
        const complexity = getComplexity(v.frets.map((f: any) => f.role as string));
        let labelRank = 99;
        const match = v.chordLabel.match(/^([A-G][#♯b♭]?)/);
        if (match && currentChordDef) { const pc = noteNames.indexOf(match[1]); if (pc >= 0) { const roleIdx = currentChordDef.iv.findIndex(iv => iv % 12 === (pc - rootSemi + 12) % 12); if (roleIdx >= 0) labelRank = ROLE_ORDER[currentChordDef.r[roleIdx]] ?? 99; } }
        const bassRank = ROLE_ORDER[v.bassNote] ?? 99;
        return { v, avg, min, complexity, labelRank, bassRank, chordLabel: v.chordLabel };
      });

      if (sortMode === 'voicings') {
          decorated.sort((a, b) => {
            if (Math.abs(a.avg - b.avg) > 0.1) return a.avg - b.avg;
            return a.min - b.min;
          });
      } else {
          decorated.sort((a, b) => {
            if (a.chordLabel !== b.chordLabel) {
              if (a.complexity.size !== b.complexity.size) return a.complexity.size - b.complexity.size;
              if (a.complexity.maxExt !== b.complexity.maxExt) return a.complexity.maxExt - b.complexity.maxExt;
              if (a.labelRank !== b.labelRank) return a.labelRank - b.labelRank;
              return a.chordLabel.localeCompare(b.chordLabel);
            }
            if (a.bassRank !== b.bassRank) return a.bassRank - b.bassRank;
            if (Math.abs(a.avg - b.avg) > 0.1) return a.avg - b.avg;
            return a.min - b.min;
          });
      }
      const seen = new Set<string>();
      const uniqueVoicings = decorated.map(d => d.v).filter((v: any) => { if (seen.has(v.fingerprint)) return false; seen.add(v.fingerprint); return true; });
      return { ...group, voicings: uniqueVoicings };
    });
  }, [displayGuitarGroups, voicingTab, sortMode, currentChordDef, rootSemi, namingMode, rootNoteName]);

  const scaleVoicings = React.useMemo(() => {
    if (!currentChordDef) return [];
    // Ensure parent scales are generated if we are on Arps or Intervals
    const isNeeded = voicingTab === 'scales' || voicingTab === 'arps' || voicingTab === 'intervals' || scaleOverlay;
    if (!isNeeded) return [];
    const scaleIds = CHORD_SCALE_MAP[chordType] ?? [];
    return buildScaleVoicings(scaleIds, SCALES, rootSemi, currentChordDef.iv, namingMode);
  }, [rootSemi, chordType, voicingTab, namingMode, scaleOverlay]);

  // NEW: Identify exactly which scale the user currently has selected globally
  const activeScaleIdForGuitar = React.useMemo(() => {
    const allowedScales = CHORD_SCALE_MAP[chordType] || [];
    return (selectedScaleId && allowedScales.includes(selectedScaleId)) ? selectedScaleId : allowedScales[0];
  }, [chordType, selectedScaleId]);

  // NEW: Filter the massive scale box list down to JUST the 5 boxes of the selected scale
  const activeScaleVoicings = React.useMemo(() => {
    return scaleVoicings.filter(sv => sv.scaleId === activeScaleIdForGuitar);
  }, [scaleVoicings, activeScaleIdForGuitar]);

  // NEW: Mathematically compute the entire fretboard to ensure 100% overlay coverage (no gaps in open positions!)
  const guitarOverlayNotes = React.useMemo(() => {
    if (!scaleOverlay || voicingTab === 'scales' || instrument === 'piano' || !currentChordDef) return [];
    const allowedScales = CHORD_SCALE_MAP[chordType] || [];
    const activeScaleId = (selectedScaleId && allowedScales.includes(selectedScaleId)) ? selectedScaleId : allowedScales[0];
    const scale = activeScaleId ? SCALES[activeScaleId] : null;
    if (!scale) return [];

    const GS = GUITAR_TUNING;
    const overlay: any[] = [];
    const scalePCs = new Set(scale.iv.map((iv: number) => (rootSemi + iv) % 12));

    for (let strIdx = 0; strIdx < 6; strIdx++) {
      for (let fret = 0; fret <= 22; fret++) {
        const pc = (GS[strIdx] + fret) % 12;
        if (scalePCs.has(pc)) {
          let iv = (pc - rootSemi) % 12;
          if (iv < 0) iv += 12;
          const idx = scale.iv.findIndex((scaleIv: number) => (scaleIv % 12) === iv);
          const role = idx !== -1 ? scale.r[idx] : '';
          const formula = idx !== -1 ? scale.f[idx] : '';
          const noteName = spellInterval(rootSemi, formula, namingMode === 'flat');

          overlay.push({
            stringIdx: strIdx,
            fret,
            role,
            formula,
            noteName,
            isGhost: true
          });
        }
      }
    }
    return overlay;
  }, [scaleOverlay, voicingTab, instrument, chordType, rootSemi, selectedScaleId, namingMode]);

  // NEW: Keep Piano perfectly synced with the global scale selector
  React.useEffect(() => {
    if (instrument === 'piano' && voicingTab === 'scales') {
      const allowedScales = CHORD_SCALE_MAP[chordType] || [];
      const activeId = allowedScales[pianoVoicingIdx];
      if (activeId && activeId !== selectedScaleId) {
        setSelectedScaleId(activeId);
      }
    }
  }, [pianoVoicingIdx, voicingTab, instrument, chordType, selectedScaleId]);

  const arpSubsets = React.useMemo(() => {
    if (!currentChordDef) return [];
    return getArpSubsets(currentChordDef.iv, currentChordDef.r, currentChordDef.f || [], rootSemi, namingMode);
  }, [chordType, rootSemi, namingMode]);

  const safeArpSubsetIdx = Math.min(arpSubsetIdx, Math.max(0, arpSubsets.length - 1));

  const arpVoicings = React.useMemo(() => {
    if (!currentChordDef || voicingTab !== 'arps') return [];
    const subset = arpSubsets[safeArpSubsetIdx];
    if (!subset) return [];
    return buildArpVoicings(activeScaleVoicings, rootSemi, subset.ivs, subset.roles, subset.formulaLabels, displayChordName);
  }, [activeScaleVoicings, rootSemi, chordType, voicingTab, safeArpSubsetIdx, displayChordName]);

  const intervalSubsets = React.useMemo(() => {
    if (!currentChordDef) return [];
    return getIntervalSubsets(currentChordDef.iv, currentChordDef.r, currentChordDef.f || []);
  }, [chordType]);

  const safeIntervalSubsetIdx = Math.min(intervalSubsetIdx, Math.max(0, intervalSubsets.length - 1));

  const intervalVoicings = React.useMemo(() => {
    if (!currentChordDef || voicingTab !== 'intervals') return [];
    const subset = intervalSubsets[safeIntervalSubsetIdx];
    if (!subset) return [];
    return buildArpVoicings(activeScaleVoicings, rootSemi, subset.ivs, subset.roles, subset.formulaLabels, `${subset.label} Interval`);
  }, [activeScaleVoicings, rootSemi, chordType, voicingTab, safeIntervalSubsetIdx]);

  const shapeVoicings = React.useMemo(() => {
    if (!currentChordDef || voicingTab !== 'shapes') return [];
    let voicings = buildHardcodedShapeVoicings(chordType, rootSemi, namingMode);
    if (instrument === 'piano') {
      const uniqueShapes: any[] = [];
      const seen = new Set<string>();
      for (const v of voicings) {
        const cleanedName = v.scaleName.replace(/\s*\([A-G]\s*Pos\)/i, '').trim();
        if (!seen.has(cleanedName)) {
          seen.add(cleanedName);
          uniqueShapes.push({ ...v, scaleName: cleanedName });
        }
      }
      voicings = uniqueShapes;
    }
    return voicings;
  }, [rootSemi, chordType, voicingTab, namingMode, shapeDisplayMode, selectedScaleId, instrument]);

  const pianoOverlayMidiNotes = React.useMemo(() => {
    // Disable overlay if the user is literally on the scales tab
    if (!scaleOverlay || voicingTab === 'scales' || instrument !== 'piano' || !currentChordDef) return { notes: [], roles: [], formulas: [] };
    const allowedScales = CHORD_SCALE_MAP[chordType] || [];
    const activeScaleId = (selectedScaleId && allowedScales.includes(selectedScaleId)) ? selectedScaleId : allowedScales[0];
    const scale = activeScaleId ? SCALES[activeScaleId] : null;
    if (!scale) return { notes: [], roles: [], formulas: [] };
    const notes: number[] = []; const roles: string[] = []; const formulas: string[] = [];
    
    // We bind the overlay purely around the user's selected octave
    const baseOctaveShift = octave + 1; 
    
    // Show one octave below, the current octave, and one octave above for full context
    for (let oct = Math.max(1, baseOctaveShift - 1); oct <= Math.min(7, baseOctaveShift + 1); oct++) {
      scale.iv.forEach((iv: number, i: number) => {
        const pc = (rootSemi + iv) % 12;
        notes.push(oct * 12 + pc);
        roles.push(scale.r[i]);
        formulas.push(scale.f[i]);
      });
    }
    return { notes, roles, formulas };
  }, [scaleOverlay, voicingTab, instrument, chordType, rootSemi, currentChordDef, selectedScaleId, octave]);

  const pianoVoicings = React.useMemo(() => {
    if (!currentChordDef) return [];
    const GS = GUITAR_TUNING;

    const formatScaleVoicings = (svs: ScaleVoicing[]) => {
      const uniqueScales: { name: string, chordLabel: string, notes: number[], roles: string[], formulas: string[] }[] = [];
      const seen = new Set<string>();
      svs.forEach(sv => {
        if (!seen.has(sv.scaleName)) {
          seen.add(sv.scaleName);
          const pcMap = new Map<number, { role: string, formula: string }>();
          sv.notes.forEach(n => {
            const midi = GS[n.stringIdx] + n.fret;
            pcMap.set(midi % 12, { role: n.role, formula: n.formula });
          });
          // Shift startMidi to align with standard MIDI mappings (+1)
          const startMidi = (octave + 1) * 12 + rootSemi;
          const pianoNotes: { note: number, role: string, formula: string }[] = [];
          for (const [pc, data] of pcMap) {
            let midi = Math.floor(startMidi / 12) * 12 + pc;
            if (midi < startMidi) midi += 12;
            // Uncap bounds to support the absolute full MIDI spectrum (0-127)
            if (midi >= 0 && midi <= 127) pianoNotes.push({ note: midi, role: data.role, formula: data.formula });
          }
          pianoNotes.sort((a, b) => a.note - b.note);
          uniqueScales.push({ name: sv.scaleName, chordLabel: displayChordName, notes: pianoNotes.map((s: any) => s.note), roles: pianoNotes.map((s: any) => s.role), formulas: pianoNotes.map((s: any) => s.formula) });
        }
      });
      return uniqueScales;
    };

    if (voicingTab === 'scales') return formatScaleVoicings(scaleVoicings);
    if (voicingTab === 'shapes') return formatScaleVoicings(shapeVoicings);

    if (voicingTab === 'arps' || voicingTab === 'intervals') {
      const subset = voicingTab === 'arps' ? arpSubsets[safeArpSubsetIdx] : intervalSubsets[safeIntervalSubsetIdx];
      if (subset && subset.ivs) {
        const startMidi = (octave + 1) * 12 + rootSemi;
        // Place each interval ONCE, ascending from the root — a single-octave display
        // rather than repeating the pitch classes across the whole keyboard. This also
        // keeps notes aligned index-for-index with the subset's roles/formulas.
        const notes = subset.ivs.map((iv: number) => startMidi + iv);
        return [{ name: subset.label || '', chordLabel: displayChordName, notes, roles: subset.roles || [], formulas: subset.formulaLabels || subset.roles || [] }];
      }
      return [];
    }

    const pV = buildPianoVoicings(rootSemi, chordType, octave, selectedScaleId, namingMode);
    let selectedGroup: any[] = [];

    if (voicingTab === 'block') {
      // Block now offers every inversion (root + one per chord tone), navigable like the
      // other piano tabs. getChordNotes returns the chord in close root position (ascending);
      // each inversion lifts the lowest `inv` notes up an octave. roles/formulas are recomputed
      // per pitch class so they stay aligned to the rotated notes. The slash bass (e.g.
      // "Cmaj7 / E") + sublabel are appended automatically by getPianoSlash from each bass.
      const rootNotes = getChordNotes(rootSemi, chordType, octave);
      const INV_NAMES = ['Root Position', '1st Inversion', '2nd Inversion', '3rd Inversion', '4th Inversion', '5th Inversion', '6th Inversion'];
      const rolesFor = (ns: number[]) => ns.map(n => { const idx = currentChordDef.iv.findIndex(iv => (rootSemi + iv) % 12 === n % 12); return idx !== -1 ? currentChordDef.r[idx] : ''; });
      const formulasFor = (ns: number[]) => ns.map(n => { const idx = currentChordDef.iv.findIndex(iv => (rootSemi + iv) % 12 === n % 12); return idx !== -1 ? currentChordDef.f[idx] : ''; });
      const label = formatChordSymbol(displayChordName);
      selectedGroup = [];
      for (let inv = 0; inv < rootNotes.length; inv++) {
        // Start from close root position (sorted). For each inversion, take the current
        // lowest note and raise it by octaves until it sits ABOVE the current highest note,
        // so the NEXT chord tone becomes the bass. Raising by just +1 octave is NOT enough
        // for chords that span more than an octave (e.g. a ♭9): the moved note can land back
        // below the top, leaving the wrong tone — even the root — in the bass.
        const notes = [...rootNotes].sort((a, b) => a - b);
        for (let i = 0; i < inv; i++) {
          const lowest = notes.shift();
          if (lowest === undefined) break;
          const highest = notes.length ? notes[notes.length - 1] : lowest;
          let raised = lowest;
          while (raised <= highest) raised += 12;
          notes.push(raised); // removed the min and appended a new max → array stays sorted
        }
        selectedGroup.push({ name: INV_NAMES[inv] || `${inv}th Inversion`, chordLabel: label, notes, roles: rolesFor(notes), formulas: formulasFor(notes) });
      }
    }
    // NOTE: copy the cached arrays before sorting below — pV.* are shared cache
    // references and must not be mutated in place.
    else if (voicingTab === 'triads') selectedGroup = [...pV.triads];
    else if (voicingTab === 'shells') selectedGroup = [...pV.shells];
    else if (voicingTab === 'drop2') selectedGroup = [...(pV.drop2 || [])];
    else if (voicingTab === 'drop3') selectedGroup = [...(pV.drop3 || [])];
    else if (voicingTab === 'drop2and4') selectedGroup = [...(pV.drop2and4 || [])];

    if (selectedGroup.length > 0) {
      // Block inversions are generated in strict numerical order (Root → 1st → 2nd → …) — they're
      // inversions of ONE chord, so the role/pitch sorts below don't apply. Return them as-built so
      // the sequence is ALWAYS Root → 1st → 2nd → … regardless of sortMode (and robust to odd chord
      // tones or unmapped roles that could otherwise reorder them). The sort toggle is hidden here anyway.
      if (voicingTab === 'block') return selectedGroup;
      if (sortMode === 'voicings') {
        selectedGroup.sort((a: any, b: any) => {
          const minA = Math.min(...a.notes);
          const minB = Math.min(...b.notes);
          if (minA !== minB) return minA - minB;
          const avgA = a.notes.reduce((sum: number, n: number) => sum + n, 0) / a.notes.length;
          const avgB = b.notes.reduce((sum: number, n: number) => sum + n, 0) / b.notes.length;
          return avgA - avgB;
        });
      } else {
        const ROLE_ORDER: Record<string, number> = { 'root': 0, 'R': 0, '1': 0, 'b2': 1, '2nd': 1, '2': 1, 'b3': 2, '3rd': 2, '3': 2, '4th': 3, '4': 3, '#4': 3, 'b5': 4, '5th': 4, '5': 4, '#5': 4, 'b6': 5, '6th': 5, '6': 5, 'bb7': 6, 'b7': 6, '7th': 6, '7': 6, 'b9': 7, '9th': 7, '9': 7, '#9': 7, '11th': 8, '11': 8, '#11': 8, 'b13': 9, '13th': 9, '13': 9, '#13': 9 };
        selectedGroup.sort((a: any, b: any) => {
          if (a.chordLabel !== b.chordLabel) return (a.chordLabel || '').localeCompare(b.chordLabel || '');
          const minMidiA = Math.min(...a.notes); const minMidiB = Math.min(...b.notes);
          const bassRoleA = a.roles[a.notes.indexOf(minMidiA)] || ''; const bassRoleB = b.roles[b.notes.indexOf(minMidiB)] || '';
          const invA = ROLE_ORDER[bassRoleA] ?? 99; const invB = ROLE_ORDER[bassRoleB] ?? 99;
          if (invA !== invB) return invA - invB;
          return minMidiA - minMidiB;
        });
      }
      return selectedGroup;
    }
    return [];
  }, [rootSemi, chordType, octave, currentChordDef, voicingTab, scaleVoicings, arpVoicings, intervalVoicings, sortMode, displayChordName, selectedScaleId, rootNoteName, arpSubsets, intervalSubsets, safeArpSubsetIdx, safeIntervalSubsetIdx]);

  // PIANO: a Dictionary chip asked us to land on a specific voicing → select the piano voicing whose
  // root-relative pitch-class set matches the combo key the chip carried, then tell the parent to
  // clear it (one-shot). Only matches once THIS tab's voicings have rebuilt, so the combo key can't
  // falsely match the previous tab's list. (Guitar is handled inside FretboardView.)
  React.useEffect(() => {
    if (!targetVoicing || instrument !== 'piano') return;
    // Arps/intervals select by subset only (a subset is one piano voicing) — applied just below; wait
    // on the voicing list only when we have an explicit voicing to find (notes for block, pcKey).
    if (targetVoicing.notes || targetVoicing.pcKey) {
      if (!pianoVoicings.length) return; // wait for this tab's voicings to rebuild before matching
      let idx = -1;
      if (targetVoicing.notes) {
        const want = [...targetVoicing.notes].sort((a, b) => a - b).join(',');
        idx = pianoVoicings.findIndex((pv: any) => [...(pv.notes || [])].sort((a: number, b: number) => a - b).join(',') === want);
      }
      if (idx < 0 && targetVoicing.pcKey) {
        const keyOf = (notes: number[]) => Array.from(new Set(notes.map((m: number) => ((((m % 12) - rootSemi) % 12) + 12) % 12))).sort((a, b) => a - b).join(',');
        idx = pianoVoicings.findIndex((pv: any) => keyOf(pv.notes) === targetVoicing.pcKey);
      }
      if (idx >= 0) setPianoVoicingIdx(idx);
    }
    // Scales (selectedScaleId) are already applied by the shell; nothing more to do on piano. Clear
    // the one-shot so it can't re-fire on a later voicing rebuild.
    onTargetVoicingApplied?.();
  }, [targetVoicing, instrument, pianoVoicings, rootSemi, onTargetVoicingApplied]);

  // Piano arps/intervals: pick the arp subset (arps) or the interval subset that spans the held
  // semitone (intervals). Runs alongside the matcher above (both fire with this render's targetVoicing,
  // so the matcher clearing it doesn't cancel this). Guitar handles its own subset in FretboardView.
  React.useEffect(() => {
    if (!targetVoicing || instrument !== 'piano') return;
    if (targetVoicing.arpSubsetIdx != null) setArpSubsetIdx(targetVoicing.arpSubsetIdx);
    if (targetVoicing.intervalSemitone != null) {
      const n = targetVoicing.intervalSemitone;
      let idx = intervalSubsets.findIndex((s: any) => s.ivs && s.ivs[0] === 0 && Math.abs(s.ivs[1] - s.ivs[0]) === n);
      if (idx < 0) idx = intervalSubsets.findIndex((s: any) => s.ivs && Math.abs(s.ivs[1] - s.ivs[0]) === n);
      if (idx >= 0) setIntervalSubsetIdx(idx);
    }
  }, [targetVoicing, instrument, intervalSubsets]);

  // Spelled note names for the piano keys. Memoized so it stays a STABLE array reference
  // across renders that don't change the chord/voicing — otherwise this inline .map() made
  // a fresh array every render and defeated PianoView's React.memo.
  const pianoNoteNames = React.useMemo(() => {
    const pv = pianoVoicings[pianoVoicingIdx];
    const base = pv?.roles || currentChordDef?.r || [];
    return base.map((role: string, i: number) => {
      if (pv && pv.formulas && pv.formulas[i]) return spellInterval(rootSemi, pv.formulas[i], namingMode === 'flat');
      const pcIdx = currentChordDef?.r.indexOf(role) ?? -1;
      const formula = pcIdx !== -1 && currentChordDef?.f ? currentChordDef.f[pcIdx] : role;
      return spellInterval(rootSemi, formula, namingMode === 'flat');
    });
  }, [pianoVoicings, pianoVoicingIdx, currentChordDef, rootSemi, namingMode]);

  const pianoGroups: { label: string; startIdx: number; count: number }[] = React.useMemo(() => {
    if (!pianoVoicings.length) return [];
    if (sortMode === 'voicings') return [{ label: 'All Voicings', startIdx: 0, count: pianoVoicings.length }];
    const groups: { label: string; startIdx: number; count: number }[] = [];
    let currentLabel = '';
    pianoVoicings.forEach((v, i) => {
      if (v.chordLabel !== currentLabel) {
        currentLabel = v.chordLabel;
        groups.push({ label: v.chordLabel, startIdx: i, count: 0 });
      }
      groups[groups.length - 1].count++;
    });
    return groups;
  }, [pianoVoicings, sortMode, voicingTab]);

  const tabCounts = React.useMemo(() => {
    if (!currentChordDef) return { block: 0, open: 0, barre: 0, triads: 0, shells: 0, drop2: 0, drop3: 0, drop2and4: 0, quartal: 0, spread: 0, rootless: 0, scales: 0, arps: 0, intervals: 0, shapes: 0 };
    const countGuitar = (groups: VoicingGroup[]) => {
      if (!groups) return 0;
      let count = 0; const seen = new Set<string>();
      groups.forEach(g => { g.voicings.forEach(v => { if (!seen.has(v.fingerprint)) { seen.add(v.fingerprint); count++; } }); });
      return count;
    };
    const countByFormulaSet = (groups: VoicingGroup[]) => {
      if (!groups) return 0;
      const seen = new Set<string>();
      groups.forEach(g => g.voicings.forEach(v => {
        const bracketMatch = v.name?.match(/\[([^\]]+)\]$/);
        const raw = bracketMatch ? bracketMatch[1] : (v.name || '');
        const key = raw.split('-').sort().join('-');
        if (key) seen.add(key);
      }));
      return seen.size;
    };
    const countPianoByFormulaSet = (arr: any[]) => {
      if (!arr) return 0;
      const seen = new Set<string>();
      arr.forEach((v: any) => {
        const key = (v.name || '').split('-').sort().join('-');
        if (key) seen.add(key);
      });
      return seen.size || arr.length;
    };
    const isPiano = instrument === 'piano';
    const pV = buildPianoVoicings(rootSemi, chordType, octave, selectedScaleId, namingMode);
    return {
      block: isPiano ? currentChordDef.iv.length : 0, open: isPiano ? 0 : countGuitar(countGuitarGroups.open), barre: isPiano ? 0 : countGuitar(countGuitarGroups.barre),
      triads: isPiano ? pV.triads.length : findTriads(currentChordDef).length, shells: isPiano ? countPianoByFormulaSet(pV.shells) : countByFormulaSet(countGuitarGroups.shells),
      drop2:  isPiano && pV.drop2 ? countPianoByFormulaSet(pV.drop2) : countByFormulaSet(countGuitarGroups.drop2),
      drop3:  isPiano && pV.drop3 ? countPianoByFormulaSet(pV.drop3) : countByFormulaSet(countGuitarGroups.drop3),
      drop2and4: isPiano && pV.drop2and4 ? countPianoByFormulaSet(pV.drop2and4) : countByFormulaSet(countGuitarGroups.drop2and4),
      spread: 0, rootless: 0, // Hardcoded to 0 to permanently disable
      intervals: getIntervalSubsets(currentChordDef.iv, currentChordDef.r, currentChordDef.f || []).length, scales: (CHORD_SCALE_MAP[chordType] ?? []).length,
      arps: getArpSubsets(currentChordDef.iv, currentChordDef.r, currentChordDef.f || []).length,
      shapes: instrument === 'piano' ? new Set(buildHardcodedShapeVoicings(chordType, rootSemi, namingMode).map((v: ScaleVoicing) => v.scaleName.replace(/\s*\([A-G]\s*Pos\)/i, '').trim())).size : (() => {
        const CHORD_STACKS: Record<string, { shapeKey: string, offset: number }[]> = {
          'maj': [{ shapeKey: 'maj_shape', offset: 0 }],
          'min': [{ shapeKey: 'min_shape', offset: 0 }],
          'aug': [{ shapeKey: 'aug_shape', offset: 0 }],
          'dim': [{ shapeKey: 'dim_4_shape', offset: 0 }],
          'sus4': [{ shapeKey: 'sus4_shape', offset: 0 }],
          'sus2': [{ shapeKey: 'sus2_shape', offset: 0 }],
          'maj_b5': [{ shapeKey: 'maj_b5_shape', offset: 0 }],
          'maj7': [{ shapeKey: 'maj_shape', offset: 0 }, { shapeKey: 'min_shape', offset: 4 }],
          'maj9': [{ shapeKey: 'maj_shape', offset: 0 }, { shapeKey: 'min_shape', offset: 4 }],
          'maj11': [{ shapeKey: 'maj_shape', offset: 0 }, { shapeKey: 'min_shape', offset: 11 }],
          'maj13': [{ shapeKey: 'maj_shape', offset: 0 }, { shapeKey: 'min_shape', offset: 4 }, { shapeKey: 'sus2_shape', offset: 7 }],
          'add9': [{ shapeKey: 'maj_shape', offset: 0 }, { shapeKey: 'sus2_shape', offset: 0 }],
          'maj6': [{ shapeKey: 'maj_shape', offset: 0 }, { shapeKey: 'min_shape', offset: 9 }],
          'maj69': [{ shapeKey: 'maj_shape', offset: 0 }, { shapeKey: 'min_shape', offset: 9 }],
          'maj7s5': [{ shapeKey: 'aug_shape', offset: 0 }, { shapeKey: 'maj_shape', offset: 4 }],
          'maj7s11': [{ shapeKey: 'maj_shape', offset: 0 }, { shapeKey: 'maj_shape', offset: 2 }],
          'minAdd9': [{ shapeKey: 'min_shape', offset: 0 }, { shapeKey: 'sus2_shape', offset: 0 }],
          'min7': [{ shapeKey: 'min_shape', offset: 0 }, { shapeKey: 'maj_shape', offset: 3 }],
          'min9': [{ shapeKey: 'min_shape', offset: 0 }, { shapeKey: 'maj_shape', offset: 3 }],
          'min11': [{ shapeKey: 'min_shape', offset: 0 }, { shapeKey: 'maj_shape', offset: 10 }],
          'min13': [{ shapeKey: 'min_shape', offset: 0 }, { shapeKey: 'maj_shape', offset: 10 }, { shapeKey: 'min_shape', offset: 2 }],
          'min6': [{ shapeKey: 'min_shape', offset: 0 }, { shapeKey: 'min_b5_shape', offset: 9 }],
          'min69': [{ shapeKey: 'min_shape', offset: 0 }, { shapeKey: 'min_b5_shape', offset: 9 }],
          'minMaj7': [{ shapeKey: 'min_shape', offset: 0 }, { shapeKey: 'aug_shape', offset: 3 }],
          'minMaj9': [{ shapeKey: 'min_shape', offset: 0 }, { shapeKey: 'aug_shape', offset: 3 }],
          'dom7': [{ shapeKey: 'maj_shape', offset: 0 }, { shapeKey: 'min_b5_shape', offset: 4 }],
          'dom9': [{ shapeKey: 'maj_shape', offset: 0 }, { shapeKey: 'min_b5_shape', offset: 4 }],
          'dom11': [{ shapeKey: 'sus4_shape', offset: 0 }, { shapeKey: 'maj_shape', offset: 10 }],
          'dom13': [{ shapeKey: 'maj_shape', offset: 0 }, { shapeKey: 'min_shape', offset: 7 }, { shapeKey: 'sus2_shape', offset: 2 }],
          'dom7sus4': [{ shapeKey: 'sus4_shape', offset: 0 }, { shapeKey: 'min_shape', offset: 7 }],
          'dom9sus4': [{ shapeKey: 'sus4_shape', offset: 0 }, { shapeKey: 'min_shape', offset: 7 }],
          'dom13sus4': [{ shapeKey: 'sus4_shape', offset: 0 }, { shapeKey: 'min_shape', offset: 7 }],
          'dom7b9': [{ shapeKey: 'maj_shape', offset: 0 }, { shapeKey: 'dim_4_shape', offset: 4 }],
          'dom7s9': [{ shapeKey: 'maj_shape', offset: 0 }, { shapeKey: 'maj_shape', offset: 3 }],
          'dom7alt': [{ shapeKey: 'aug_shape', offset: 0 }, { shapeKey: 'min_shape', offset: 3 }],
          'dom7b13': [{ shapeKey: 'aug_shape', offset: 0 }, { shapeKey: 'maj_shape', offset: 10 }],
          'dom13b9': [{ shapeKey: 'maj_shape', offset: 0 }, { shapeKey: 'dim_4_shape', offset: 4 }],
          'dom13s9': [{ shapeKey: 'maj_shape', offset: 0 }, { shapeKey: 'maj_shape', offset: 3 }],
          'dom7b5': [{ shapeKey: 'b5_shape', offset: 0 }],
          'dom7s5': [{ shapeKey: 'aug_shape', offset: 0 }, { shapeKey: 'maj_shape', offset: 10 }],
          'dom7s11': [{ shapeKey: 'maj_shape', offset: 0 }, { shapeKey: 'maj_shape', offset: 2 }],
          'dom7b5b9': [{ shapeKey: 'b5_b9_shape', offset: 0 }],
          'dom7b5s9': [{ shapeKey: 'b5_s9_shape', offset: 0 }],
          'dom7s5b9': [{ shapeKey: 's5_b9_shape', offset: 0 }],
          'dom7s5s9': [{ shapeKey: 's5_s9_shape', offset: 0 }],
          'dimMaj7': [{ shapeKey: 'dim_4_shape', offset: 0 }],
          'hdim7': [{ shapeKey: 'min_b5_shape', offset: 0 }, { shapeKey: 'min_shape', offset: 3 }],
          'fdim7': [{ shapeKey: 'dim_4_shape', offset: 0 }, { shapeKey: 'dim_4_shape', offset: 3 }]
        };
        return (CHORD_STACKS[chordType] || [{ shapeKey: 'maj_shape', offset: 0 }]).length;
      })(),
    };
  }, [countGuitarGroups, chordType, instrument, currentChordDef, octave, rootSemi, namingMode, selectedScaleId]);

  const ALL_VOICING_TABS: { key: VoicingTabKey; label: string }[] = [ { key: 'block', label: 'Block' }, { key: 'open', label: 'Open' }, { key: 'barre', label: 'Barre' }, { key: 'triads', label: 'Triads' }, { key: 'shells', label: 'Shells' }, { key: 'drop2',  label: 'Drop 2' }, { key: 'drop3',  label: 'Drop 3' }, { key: 'drop2and4', label: 'Drop 2 & 4' }, { key: 'intervals', label: 'Intervals' }, { key: 'arps',   label: 'Arps' }, { key: 'shapes', label: 'Shapes' }, { key: 'scales', label: 'Scales' } ];
  const VOICING_TABS = ALL_VOICING_TABS.filter(tab => tabCounts[tab.key] > 0);

  // If the current voicing tab has no voicings for the current chord/instrument, snap
  // to the first valid tab. useLayoutEffect runs synchronously before paint (same as the
  // old render-phase setState) so the "No Voicings Found" frame never shows, but it
  // doesn't trigger the "Cannot update a component while rendering" warning.
  React.useLayoutEffect(() => {
    if (tabCounts[voicingTab] === 0 && VOICING_TABS.length > 0 && voicingTab !== VOICING_TABS[0].key) {
      setVoicingTab(VOICING_TABS[0].key);
    }
  });

  React.useLayoutEffect(() => {
    if (instrument !== 'piano') return;
    const currentPv = pianoVoicings[pianoVoicingIdx];
    if (!currentPv) return;

    if (voicingTab === 'scales' || voicingTab === 'arps' || voicingTab === 'intervals' || voicingTab === 'shapes') {
      let label = currentPv.name;
      if (voicingTab === 'arps') { const raw = arpSubsets[safeArpSubsetIdx]?.label ?? ''; label = /^[A-G][#♯b♭]?\s/.test(raw) ? raw : `${rootNoteName} ${raw}`; }
      if (voicingTab === 'intervals') label = `${rootNoteName} ${intervalSubsets[safeIntervalSubsetIdx]?.label}`;
      setVariationLabel(label);

      if (voicingTab === 'arps' || voicingTab === 'intervals' || voicingTab === 'shapes') {
        if (voicingTab === 'shapes') { setActiveFretboardRoles(currentPv.roles || []); setActiveFretboardIvs(currentPv.notes.map((n: number) => (n - rootSemi + 120) % 12)); setActiveFretboardFormula(currentPv.formulas || []); } 
        else { const subset = voicingTab === 'arps' ? arpSubsets[safeArpSubsetIdx] : intervalSubsets[safeIntervalSubsetIdx]; if (subset) { setActiveFretboardRoles(subset.roles || []); setActiveFretboardIvs(subset.ivs || []); setActiveFretboardFormula(subset.formulaLabels || subset.roles || []); } }
      } else {
        const pcs = new Set<number>(); const items: { iv: number, role: string, formula: string }[] = [];
        currentPv.notes.forEach((midi: number, i: number) => {
          const pc = midi % 12;
          if (!pcs.has(pc)) { pcs.add(pc); let iv = (pc - rootSemi) % 12; if (iv < 0) iv += 12; const r = currentPv.roles[i] || ''; const f = currentPv.formulas?.[i] || r; items.push({ iv, role: r, formula: f }); }
        });
        setActiveFretboardRoles(items.map(i => i.role)); setActiveFretboardIvs(items.map(i => i.iv)); setActiveFretboardFormula(items.map(i => i.formula));
      }
    } else {
      const isDifferentChord = currentPv.chordLabel !== displayChordName;
      setVariationLabel(isDifferentChord ? currentPv.chordLabel : undefined);
      if (currentChordDef) {
         const pcs = new Set<number>(); const items: { iv: number, role: string, formula: string }[] = [];
         currentPv.notes.forEach((midi: number, i: number) => {
           const pc = midi % 12;
           if (!pcs.has(pc)) { pcs.add(pc); let iv = (pc - rootSemi) % 12; if (iv < 0) iv += 12; const r = currentPv.roles[i] || ''; const f = currentPv.formulas?.[i] || r; items.push({ iv, role: r, formula: f }); }
         });
         setActiveFretboardRoles(items.map(i => i.role)); setActiveFretboardIvs(items.map(i => i.iv)); setActiveFretboardFormula(items.map(i => i.formula));
      }
    }
  }, [instrument, pianoVoicings, pianoVoicingIdx, voicingTab, safeArpSubsetIdx, safeIntervalSubsetIdx, displayChordName, rootSemi, currentChordDef, arpSubsets, intervalSubsets]);

  let displayIvs = currentChordDef?.iv;
  let displayRoles = currentChordDef?.r;
  let displayFormula = currentChordDef?.f;

  if (currentChordDef && activeFretboardRoles && activeFretboardIvs) {
    displayRoles = activeFretboardRoles; displayIvs = activeFretboardIvs; if (activeFretboardFormula) displayFormula = activeFretboardFormula;
  }

  // BULLETPROOF: Do not allow empty strings to leak into React Native <Text> nodes!
  let subRoot: string | undefined = undefined;
  let subType: string | undefined = undefined;

  if (variationLabel) {
    // Voicing labels are always "Root<space>symbol" (e.g. "D♭ 7", "E ø7"), so a
    // deterministic split on the first space is robust — no fragile alternation.
    const formattedVar = formatChordSymbol(variationLabel);
    const match = formattedVar.match(/^([A-G][#♯b♭]?)\s+(.*)$/);
    if (match) {
      subRoot = match[1];
      subType = match[2].trim();
    } else if (/^[A-G][#♯b♭]?$/.test(formattedVar)) {
      subRoot = formattedVar;
      subType = '';
    } else {
      subType = formattedVar;
    }
  }

  if ((subRoot === rootNoteName || !subRoot) && subType === formattedMainType) {
    subRoot = undefined;
    subType = undefined;
  }

  if (subRoot && subRoot.trim() === '') subRoot = undefined;
  if (subType && subType.trim() === '') subType = undefined;

  const handleManualNavigate = () => {
    stopSeqFlash(); onStop?.();
    if (instrument === 'piano') setTimeout(() => playCurrentChordRef.current(), 0); else pendingPlayRef.current = true;
  };

  const hasMultipleVoicings = React.useMemo(() => {
    if (instrument === 'piano') {
      const total = voicingTab === 'arps' ? arpSubsets.length : voicingTab === 'intervals' ? intervalSubsets.length : pianoVoicings.length;
      return total > 1;
    } else {
      if (voicingTab === 'scales') {
        const allowedScales = CHORD_SCALE_MAP[chordType] || [];
        const activeScaleId = (selectedScaleId && allowedScales.includes(selectedScaleId)) ? selectedScaleId : allowedScales[0];
        const scalesForCurrentId = scaleVoicings.filter(sv => sv.scaleId === activeScaleId);
        return scalesForCurrentId.length > 1;
      }
      if (voicingTab === 'shapes') {
        const allowedScales = CHORD_SCALE_MAP[chordType] || [];
        const activeScaleId = (selectedScaleId && allowedScales.includes(selectedScaleId)) ? selectedScaleId : allowedScales[0];
        const shapesForCurrentScale = shapeVoicings.filter(sv => sv.scaleId === activeScaleId);
        return shapesForCurrentScale.length > 1;
      }
      if (voicingTab === 'arps') {
        return arpVoicings.length > 1;
      }
      if (voicingTab === 'intervals') {
        return intervalVoicings.length > 1;
      }
      const currentGroup = guitarGroups[0];
      return (currentGroup?.voicings?.length ?? 0) > 1;
    }
  }, [instrument, voicingTab, arpSubsets.length, intervalSubsets.length, pianoVoicings.length, scaleVoicings, shapeVoicings, arpVoicings, intervalVoicings, guitarGroups, selectedScaleId, chordType]);

  const cycleVoicing = (direction: 'prev' | 'next') => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (instrument === 'piano') {
      if (voicingTab === 'arps' && arpSubsets.length) {
        const nextIdx = direction === 'next' ? (safeArpSubsetIdx + 1) % arpSubsets.length : (safeArpSubsetIdx - 1 + arpSubsets.length) % arpSubsets.length;
        setArpSubsetIdx(nextIdx);
      } else if (voicingTab === 'intervals' && intervalSubsets.length) {
        const nextIdx = direction === 'next' ? (safeIntervalSubsetIdx + 1) % intervalSubsets.length : (safeIntervalSubsetIdx - 1 + intervalSubsets.length) % intervalSubsets.length;
        setIntervalSubsetIdx(nextIdx);
      } else if (pianoVoicings.length) {
        const nextIdx = direction === 'next' ? (pianoVoicingIdx + 1) % pianoVoicings.length : (pianoVoicingIdx - 1 + pianoVoicings.length) % pianoVoicings.length;
        setPianoVoicingIdx(nextIdx);
      }
      handleManualNavigate();
    } else {
      if (direction === 'next') {
        fretboardRef.current?.nextVoicing();
      } else {
        fretboardRef.current?.prevVoicing();
      }
    }
  };

  if (!currentChordDef) {
    return ( <View style={[styles.safe, { backgroundColor: t.bg, justifyContent: 'center', alignItems: 'center' }]}> <Text style={{ color: t.txt1 }}>Loading Chord Data...</Text> </View> );
  }

  const getPianoSlash = () => {
    if (instrument !== 'piano' || voicingTab === 'arps' || voicingTab === 'intervals' || voicingTab === 'scales' || voicingTab === 'shapes') return '';
    const pv = pianoVoicings[pianoVoicingIdx];
    if (!pv || !pv.notes || pv.notes.length === 0) return '';
    const bassMidi = Math.min(...pv.notes);
    const label = pv.chordLabel || displayChordName;
    const match = label.match(/^([A-G][#♯b♭]?)/);
    let voicingRootSemi = rootSemi;
    if (match) {
      const parsedNote = match[1].replace('b', '♭').replace('#', '♯');
      const flatIdx = NOTE_FLAT.indexOf(parsedNote);
      const sharpIdx = NOTE_SHARP.indexOf(parsedNote);
      if (flatIdx !== -1) voicingRootSemi = flatIdx; else if (sharpIdx !== -1) voicingRootSemi = sharpIdx;
    }
    if (bassMidi % 12 !== voicingRootSemi % 12) return ` / ${(namingMode === 'flat' ? NOTE_FLAT : NOTE_SHARP)[bassMidi % 12]}`;
    return '';
  };
  const pianoSlashSuffix = getPianoSlash();

  // Note/navigation handlers passed down to the memoized FretboardView/PianoView.
  const handleGuitarNotePress = (midi: number) => {
    if (playMode === 'hold' && !arp) {
      // Block-hold mode: stop any running chord/animation and sustain just this note.
      stopSeqFlash();
      onHoldChord([midi], 80);
      setIsPlaying(true);
    } else {
      onNotePress?.(midi, 80, true);
    }
  };
  const handlePianoNotePress = (midi: number) => {
    if (playMode === 'hold' && !arp) {
      stopSeqFlash();
      onHoldChord([midi], 80);
      setIsPlaying(true);
    } else {
      onNotePress?.(midi, 80, false);
    }
  };
  const handleCardNotePress = (midi: number) => onNotePress?.(midi, 80, instrument === 'guitar');
  const handleFretboardNavigate = () => handleManualNavigate();
  const handleArpSubsetChange = (idx: number) => { if (voicingTab === 'intervals') setIntervalSubsetIdx(idx); else setArpSubsetIdx(idx); };
  const handleFretboardPlayVoicing = (midiNotes: number[], voicingName: string, activeRoles?: string[], activeIvs?: number[], spelledNames?: string[], activeFormula?: string[]) => {
    if (voicingTab === 'scales' || voicingTab === 'arps' || voicingTab === 'intervals' || voicingTab === 'shapes') {
      currentScaleMidi.current = midiNotes;
      let label = voicingName;
      if (voicingTab === 'arps') { const raw = arpSubsets[safeArpSubsetIdx]?.label ?? ''; label = /^[A-G][#♯b♭]?\s/.test(raw) ? raw : `${rootNoteName} ${raw}`; }
      if (voicingTab === 'intervals') label = `${rootNoteName} ${intervalSubsets[safeIntervalSubsetIdx]?.label}`;
      setVariationLabel(label);
      if (activeRoles && activeIvs) { setActiveFretboardRoles(activeRoles); setActiveFretboardIvs(activeIvs); setActiveFretboardFormula(activeFormula); }
    } else {
      currentGuitarMidi.current = midiNotes;
      const isDifferentChord = voicingName !== displayChordName;
      setVariationLabel(isDifferentChord ? voicingName : undefined);
      if (activeRoles && activeIvs) { setActiveFretboardRoles(activeRoles); setActiveFretboardIvs(activeIvs); setActiveFretboardFormula(activeFormula); }
    }
    if (pendingPlayRef.current) { pendingPlayRef.current = false; schedulePlay(); }
  };

  const combinedHeader = React.useMemo(() => (
    <VoicingTabBar voicingTab={voicingTab} setVoicingTab={setVoicingTab} tabCounts={tabCounts} t={t} />
  ), [voicingTab, tabCounts, t]);

  // Stable handler identities (see useStableCallback) so the memoized ChordCard / PianoView /
  // FretboardView keep their memo on every parent render — their data props are already memoized,
  // so once the handlers stop changing identity, an unrelated re-render no longer touches the diagrams.
  const sCardPress       = useStableCallback(handlePlay);
  const sSwipeDown       = useStableCallback(() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); userInteractedRef.current = true; shiftRoot('down'); });
  const sSwipeUp         = useStableCallback(() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); userInteractedRef.current = true; shiftRoot('up'); });
  const sTypeNext        = useStableCallback(() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); userInteractedRef.current = true; cycleType('next'); });
  const sTypePrev        = useStableCallback(() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); userInteractedRef.current = true; cycleType('prev'); });
  const sCardNotePress   = useStableCallback(handleCardNotePress);
  const sGuitarNotePress = useStableCallback(handleGuitarNotePress);
  const sPianoNotePress  = useStableCallback(handlePianoNotePress);
  const sFretNavigate    = useStableCallback(handleFretboardNavigate);
  const sFretPlayVoicing = useStableCallback(handleFretboardPlayVoicing);
  const sArpSubsetChange = useStableCallback(handleArpSubsetChange);
  const sPrevVoicing     = useStableCallback(() => cycleVoicing('prev'));
  const sNextVoicing     = useStableCallback(() => cycleVoicing('next'));
  const sGroupPrev       = useStableCallback(() => { if (pianoGroups.length === 0) return; const idx = pianoGroups.findIndex((g: { startIdx: number; count: number }) => pianoVoicingIdx >= g.startIdx && pianoVoicingIdx < g.startIdx + g.count); const safeIdx = idx === -1 ? 0 : idx; const prevIdx = (safeIdx - 1 + pianoGroups.length) % pianoGroups.length; setPianoVoicingIdx(pianoGroups[prevIdx].startIdx); handleManualNavigate(); });
  const sGroupNext       = useStableCallback(() => { if (pianoGroups.length === 0) return; const idx = pianoGroups.findIndex((g: { startIdx: number; count: number }) => pianoVoicingIdx >= g.startIdx && pianoVoicingIdx < g.startIdx + g.count); const safeIdx = idx === -1 ? 0 : idx; const nextIdx = (safeIdx + 1) % pianoGroups.length; setPianoVoicingIdx(pianoGroups[nextIdx].startIdx); handleManualNavigate(); });
  const sTargetApplied   = useStableCallback((...args: any[]) => (onTargetVoicingApplied as any)?.(...args));

  return (
    <View style={[styles.safe, { backgroundColor: t.bg2 }]}>
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 0 }}>

        <ChordCard
          rootSemi={rootSemi} chordType={chordType} namingMode={namingMode} subLabelRoot={subRoot} subLabelType={subType} overrideType={formattedMainType}
          onPress={sCardPress}
          onSwipeLeft={sSwipeDown}
          onSwipeRight={sSwipeUp}
          onLeftChevronPress={sSwipeDown}
          onRightChevronPress={sSwipeUp}
          onTopChevronPress={sTypeNext}
          onBottomChevronPress={sTypePrev}
          onNotePress={sCardNotePress}
          octave={octave} theme={t} activeIvs={displayIvs} activeRoles={displayRoles} activeFormula={displayFormula}
        />

        <View style={{ justifyContent: 'center' }}>
          {instrument === 'piano' ? (
            <PianoView
              ref={pianoRef} showAllLabels={true} header={combinedHeader} midiNotes={pianoVoicings[pianoVoicingIdx]?.notes || []} showNavigation={true}
              groupLabel="CHORD" voicingLabel={voicingTab === 'arps' || voicingTab === 'intervals' ? 'SUBSET' : 'VOICING'}
              voicingName={(voicingTab === 'arps' ? arpSubsets[safeArpSubsetIdx]?.label : voicingTab === 'intervals' ? intervalSubsets[safeIntervalSubsetIdx]?.label : (pianoVoicings[pianoVoicingIdx]?.chordLabel || displayChordName)) + pianoSlashSuffix}
              voicingSubName={voicingTab === 'arps' ? arpSubsets[safeArpSubsetIdx]?.subLabel : voicingTab === 'intervals' ? intervalSubsets[safeIntervalSubsetIdx]?.subLabel : pianoVoicings[pianoVoicingIdx]?.name}
              voicingIdx={voicingTab === 'arps' ? safeArpSubsetIdx : voicingTab === 'intervals' ? safeIntervalSubsetIdx : pianoVoicingIdx}
              totalVoicings={voicingTab === 'arps' ? arpSubsets.length : voicingTab === 'intervals' ? intervalSubsets.length : pianoVoicings.length}
              onPrevVoicing={sPrevVoicing}
              onNextVoicing={sNextVoicing}
              groups={pianoGroups}
              onGroupPrev={sGroupPrev}
              onGroupNext={sGroupNext}
              theme={t}
              noteNames={pianoNoteNames}
              roles={pianoVoicings[pianoVoicingIdx]?.roles || currentChordDef.r} formulas={pianoVoicings[pianoVoicingIdx]?.formulas || currentChordDef.f} formulaByPC={formulaByPC}
              onNotePress={sPianoNotePress}
              octave={octave} labelMode={labelMode} rootSemi={rootSemi} namingMode={namingMode} scaleOverlay={scaleOverlay && voicingTab !== 'scales'} overlayNotes={pianoOverlayMidiNotes.notes} overlayRoles={pianoOverlayMidiNotes.roles} overlayFormulas={pianoOverlayMidiNotes.formulas} parentScales={EMPTY_ARR} activeParentScale={selectedScaleId} onParentScaleChange={setSelectedScaleId}
            />
          ) : (
            <FretboardView
              ref={fretboardRef} header={combinedHeader} groups={guitarGroups} theme={t} defaultGroupIdx={0}
              onNotePress={sGuitarNotePress} onNavigate={sFretNavigate}
              onPlayVoicing={sFretPlayVoicing}
              rootSemi={rootSemi} chordName={displayChordName} chordType={chordType} labelMode={labelMode}
              scaleVoicings={scaleVoicings} scaleMode={voicingTab === 'scales'} arpMode={voicingTab === 'arps' || voicingTab === 'intervals'} arpVoicings={voicingTab === 'arps' ? arpVoicings : voicingTab === 'intervals' ? intervalVoicings : EMPTY_ARR} arpSubsets={voicingTab === 'intervals' ? intervalSubsets : arpSubsets} arpSubsetIdx={voicingTab === 'intervals' ? safeIntervalSubsetIdx : safeArpSubsetIdx}
              overlayNotes={guitarOverlayNotes} // Explicitly pass the full-neck array down
              onArpSubsetChange={sArpSubsetChange}
              shapesMode={voicingTab === 'shapes'} shapeVoicings={shapeVoicings} formulaByPC={formulaByPC}
              chordAxisEnabled={voicingTab === 'triads' || voicingTab === 'shells' || voicingTab === 'drop2' || voicingTab === 'drop3' || voicingTab === 'drop2and4'}
              namingMode={namingMode} scaleOverlay={scaleOverlay && voicingTab !== 'scales'} parentScales={EMPTY_ARR} activeParentScale={selectedScaleId} onParentScaleChange={setSelectedScaleId}
              selectedScaleId={selectedScaleId} onScaleChange={setSelectedScaleId}
              targetVoicing={targetVoicing} onTargetVoicingApplied={sTargetApplied}
            />
          )}
        </View>

      </ScrollView>

      {/* ── Sticky Player Dock ───────────────────────────────────────────── */}
      <View style={[styles.stickyPlayer, { backgroundColor: t.bg, borderTopColor: t.border }]}>
        
        {/* INLINE ENGINE CONTROLS */}
        <View style={{ marginBottom: 12 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
            
            {showInstrumentToggle && (
              <TouchableOpacity activeOpacity={0.7} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setInstrument(instrument === 'piano' ? 'guitar' : 'piano'); }} style={[styles.enginePill, { backgroundColor: t.bg2, borderColor: t.border }]}>
                <Ionicons name={instrument === 'piano' ? 'musical-notes' : 'musical-note'} size={16} color={t.txt2} />
                <Text style={[styles.enginePillTxt, { color: t.txt2 }]}>{instrument === 'piano' ? 'Piano' : 'Guitar'}</Text>
              </TouchableOpacity>
            )}

            <VisualDisplaySettings voicingTab={voicingTab} shapeDisplayMode={shapeDisplayMode} setShapeDisplayMode={setShapeDisplayMode} activeScaleName={SCALES[activeScaleIdForGuitar]?.name} t={t} />

            <TouchableOpacity activeOpacity={0.7} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setPlayMode(playMode === 'once' ? 'hold' : 'once'); }} style={[styles.enginePill, { backgroundColor: playMode === 'hold' ? t.accent : t.bg2, borderColor: playMode === 'hold' ? t.accent : t.border }]}>
              <Ionicons name="repeat" size={16} color={playMode === 'hold' ? '#fff' : t.txt2} />
              <Text style={[styles.enginePillTxt, { color: playMode === 'hold' ? '#fff' : t.txt2 }]}>Hold</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>

        <View style={styles.actionRow}>
          {!showChordChrome && <View style={{ flex: 1 }} />}
          {showChordChrome && (inputMode === 'random' ? (
            <>
              <TouchableOpacity style={[styles.actionBtn, { backgroundColor: t.bg2, borderColor: t.border }]} onPress={() => setSheetVisible(true)}>
                <Ionicons name="layers" size={24} color={t.txt2} />
                <View style={[styles.badge, { backgroundColor: t.accent }]}><Text style={styles.badgeText}>{useChordStore.getState().activeTypes.length}</Text></View>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.wideLoopBtn, { backgroundColor: t.bg2, borderColor: t.border }]} onPress={() => {
  // onPress (fires on release, no auto-repeat) instead of onPressIn: a held / spam press can no
  // longer enqueue a backlog of touch-downs that keeps firing after the finger lifts. The guard
  // collapses a fast burst to one change per frame; the rAF still lets the haptic flush to native
  // before the heavy chord render (on a slow phone a synchronous handler would delay the buzz).
  if (randomizingRef.current) return;
  randomizingRef.current = true;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  stopSeqFlash();
  if (playDebounceRef.current) { clearTimeout(playDebounceRef.current); playDebounceRef.current = null; }
  onStop?.();
  requestAnimationFrame(() => {
    handleRandomNext();
    // Trailing release: hold the lock ~140ms PAST the work so the burst of touch events that
    // buffered while the JS thread was busy lands on a still-locked guard and is dropped, instead
    // of draining into extra chord changes after the finger lifts. (A bare rAF released too early.)
    if (randomReleaseRef.current) clearTimeout(randomReleaseRef.current);
    randomReleaseRef.current = setTimeout(() => { randomizingRef.current = false; }, 140);
  });
}} delayPressIn={0} activeOpacity={0.75}>
                <Ionicons name="dice" size={20} color={t.txt2} />
                <Text style={[styles.wideLoopText, { color: t.txt2 }]}>Next Random</Text>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity style={[styles.wideLoopBtn, { backgroundColor: t.bg2, borderColor: t.border }]} onPress={() => { stopSeqFlash(); onStop?.(); setSheetVisible(true); }} activeOpacity={0.75}>
              <Ionicons name="create" size={20} color={t.txt2} />
              <Text style={[styles.wideLoopText, { color: t.txt2 }]}>Edit Chord</Text>
            </TouchableOpacity>
          ))}
          <Animated.View style={[{ transform: [{ scale: playAnim }] }]}>
            <TouchableOpacity style={[styles.squarePlayBtn, { backgroundColor: isPlaying ? '#D4537E' : '#639922' }]} onPress={isPlaying ? handleStop : handlePlay} activeOpacity={0.85}>
              <Ionicons name={isPlaying ? "stop" : "play"} size={26} color="#fff" />
            </TouchableOpacity>
          </Animated.View>
        </View>
      </View>

    </View>
  );
}

// ─── PLAY SCREEN SHELL ──────────────────────────────────────────────────────
// The Explore screen container. Renders the Chord/Dictionary toggle and routes
// to either chord mode (v1 — VoicingExplorer driven by chordStore) or the
// dictionary (the self-contained mini-diagram grid).
export default function PlayScreen() {
  const { theme, instrument, setInstrument } = useSettingsStore();
  const { rootSemi, chordType, namingMode, shiftRoot, cycleType, pendingVoicingTab, setPendingVoicingTab, pendingVoicing, setPendingVoicing, setSelectedScaleId } = useChordStore();
  const dict = useDictionaryStore();
  const t = THEMES[theme];

  // Chord mode's voicing tab lives here (not in chordStore) so it survives
  // Chord⇄Dictionary toggles.
  const [chordVoicingTab, setChordVoicingTab] = React.useState<VoicingTabKey>('block');
  const [targetVoicing, setTargetVoicing] = React.useState<PendingVoicing | null>(null);
  const [sheetVisible, setSheetVisible] = React.useState(false);
  const livePlayRef = React.useRef<() => void>(() => {});

  // Consume the one-shot tab+voicing a Dictionary "Comp/Solo with" chip left for us, so tapping a chip
  // lands on the same tab AND the same voicing it was browsing. We stash the voicing key into local
  // state here (the moment we apply the tab) so it survives until VoicingExplorer rebuilds the new
  // tab's voicings — avoiding a race where it's read against the OLD tab. The VoicingTabBar's own
  // guard snaps to a valid tab if this chord doesn't support it.
  React.useEffect(() => {
    if (pendingVoicingTab) {
      setChordVoicingTab(pendingVoicingTab as VoicingTabKey);
      // Scales carry a real scale id — select it now (covers piano + guitar) so it's in place before
      // the viewer rebuilds. The grip/box itself is applied by the viewer via targetVoicing.
      if (pendingVoicing?.scaleId) setSelectedScaleId(pendingVoicing.scaleId);
      setTargetVoicing(pendingVoicing ?? null);
      setPendingVoicingTab(null);
      setPendingVoicing(null);
    }
  }, [pendingVoicingTab, pendingVoicing, setPendingVoicingTab, setPendingVoicing, setSelectedScaleId]);

  if (dict.mode === 'dictionary') {
    return (
      <View style={[styles.safe, { backgroundColor: t.bg2 }]}>
        <ExploreModeToggle mode={dict.mode} setMode={dict.setMode} t={t} />
        <ChordDictionary t={t} />
      </View>
    );
  }

  return (
    <View style={[styles.safe, { backgroundColor: t.bg2 }]}>
      <ExploreModeToggle mode={dict.mode} setMode={dict.setMode} t={t} />
      <VoicingExplorer
        rootSemi={rootSemi} chordType={chordType} namingMode={namingMode}
        instrument={instrument} setInstrument={setInstrument}
        voicingTab={chordVoicingTab} setVoicingTab={setChordVoicingTab}
        shiftRoot={shiftRoot} cycleType={cycleType}
        showChordChrome={true} showInstrumentToggle={false}
        sheetVisible={sheetVisible} setSheetVisible={setSheetVisible}
        playRef={livePlayRef}
        targetVoicing={targetVoicing} onTargetVoicingApplied={() => setTargetVoicing(null)}
      />
      <CommandSheet visible={sheetVisible} onClose={() => setSheetVisible(false)} onLivePreview={(r, c) => { setTimeout(() => livePlayRef.current(), 50); }} onExecute={() => {}} />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  modeTab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 44, borderRadius: 10 },
  scroll: { paddingVertical: 16, paddingBottom: 32, gap: 12 },
  modeToggleRow: { flexDirection: 'row', marginHorizontal: 16, borderRadius: 20, padding: 12, borderWidth: 1 },
  modeBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 46, borderRadius: 10 },
  modeBtnText: { ...TYPE.body, fontWeight: FONT_WEIGHT.bold },
  
  tabBarOuter: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1 },
  tabBtn: { height: 46, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },

  visualSettingsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1 },
  miniPill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  miniPillTxt: { ...TYPE.label, fontWeight: FONT_WEIGHT.bold },

  stickyPlayer: { paddingVertical: 12, borderTopWidth: 1, paddingBottom: 12 },
  enginePill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, height: 40, borderRadius: 20, borderWidth: 1 },
  enginePillTxt: { ...TYPE.body, fontWeight: FONT_WEIGHT.bold },
  
  actionRow: { flexDirection: 'row', gap: 12, marginHorizontal: 16 },
  actionBtn: { width: 56, height: 56, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: -6, right: -6, minWidth: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, borderWidth: 2, borderColor: '#fff' },
  badgeText: { color: '#fff', ...TYPE.caption },
  wideLoopBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 20, borderWidth: 1, height: 56 },
  wideLoopText: { ...TYPE.body, fontWeight: FONT_WEIGHT.bold },
  squarePlayBtn: { width: 64, height: 56, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});