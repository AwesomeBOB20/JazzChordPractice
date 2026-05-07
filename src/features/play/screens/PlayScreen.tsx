import React, { useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet,
  ScrollView, Animated, Platform
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useIsFocused } from '@react-navigation/native';
import { useSettingsStore } from '@features/settings/store/settingsStore';
import { useChordStore } from '@features/play/store/chordStore';
import { CH, NOTE_SHARP, NOTE_FLAT, getChordNotes, spellInterval } from '@shared/theory/musicTheory';
import { Theme, THEMES } from '@shared/ui/themes';
import { ChordCard, CommandSheet, PianoView, type PianoViewRef, FretboardView, type FretboardViewRef } from '@shared/ui';
import { buildTriadVoicings, buildShellVoicings, buildDropVoicings, buildScaleVoicings, buildArpVoicings, getArpSubsets, getIntervalSubsets, VoicingGroup, ScaleVoicing, buildOpenVoicings, buildBarreVoicings, buildHardcodedShapeVoicings, ShapeDisplayMode } from '@shared/guitar';
import { SCALES, CHORD_SCALE_MAP } from '@shared/theory/musicTheory';
import { buildPianoVoicings } from '@shared/piano';
import { useAudio } from '@shared/audio/AudioContext';
import { formatChordSymbol } from '@shared/theory/core/nomenclature';

const ARP_SLOTS = 8;
const ROOTS = [0,1,2,3,4,5,6,7,8,9,10,11];

const ROLE_WEIGHT: Record<string, number> = {
  'root': 1, 'R': 1, 'b2': 2, '2nd': 2, '2': 2, '#2': 2, 'b3': 3, '3rd': 3, '3': 3,
  '4th': 4, '4': 4, '#4': 4, 'b5': 5, '5th': 5, '5': 5, '#5': 5, 'b6': 6, '6th': 6, '6': 6,
  'bb7': 7, 'b7': 7, '7th': 7, '7': 7, 'b9': 9, '9th': 9, '9': 9, '#9': 9,
  '11th': 11, '11': 11, '#11': 11, 'b13': 13, '13th': 13, '13': 13, '#13': 13
};

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
            <TouchableOpacity key={tab.key} style={[styles.tabBtn, { paddingHorizontal: 16 }, isActive && { backgroundColor: t.accent }]} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setVoicingTab(tab.key); }} activeOpacity={0.7}>
              <Text style={[styles.modeBtnText, { color: isActive ? '#fff' : t.txt3 }]}>{tab.label}</Text>
              <View style={{ marginTop: 2, backgroundColor: isActive ? 'rgba(255,255,255,0.25)' : t.bg, borderRadius: 8, paddingHorizontal: 5, paddingVertical: 1, alignSelf: 'center' }}>
                <Text style={{ fontSize: 9, fontWeight: '700', color: isActive ? '#fff' : t.txt3 }}>{tabCounts[tab.key]}</Text>
              </View>
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
  const hideSort = voicingTab === 'scales' || voicingTab === 'arps' || voicingTab === 'intervals';
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
          <Ionicons name="layers" size={16} color={scaleOverlay ? '#fff' : t.txt2} />
          <Text style={[styles.enginePillTxt, { color: scaleOverlay ? '#fff' : t.txt2 }]}>
            {scaleOverlay && activeScaleName ? `Scale: ${activeScaleName}` : 'Scale'}
          </Text>
        </TouchableOpacity>
      )}
    </>
  );
}


export default function PlayScreen() {
  const { playChord: onPlay, playSingleNote: onNotePress, stopAudio: onStop, playArpLoop: onArpLoop } = useAudio();
  const { bpm, arp, setArp, playMode, setPlayMode, octave, theme, labelMode, instrument, setInstrument, sortMode, scaleOverlay } = useSettingsStore();
  const { rootSemi, chordType, namingMode, shiftRoot, inputMode, selectedScaleId, setSelectedScaleId } = useChordStore();
  const t = THEMES[theme];
  const playAnim = useRef(new Animated.Value(1)).current;
  const seqFlashTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const lastRandomTimeRef = useRef(0);

  React.useEffect(() => { 
    stopSeqFlash(); 
    onStop?.(); 
    setPianoVoicingIdx(0);
    setArpSubsetIdx(0);
    setIntervalSubsetIdx(0);
  }, [instrument, octave]);
  
  const [sheetVisible, setSheetVisible] = React.useState(false);
  const [voicingTab, setVoicingTab] = React.useState<VoicingTabKey>('block');
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

  const stopSeqFlash = () => { isLoopingRef.current = false; seqFlashTimers.current.forEach(t => clearTimeout(t)); seqFlashTimers.current = []; setIsPlaying(false); };
  const handleStop = () => { stopSeqFlash(); onStop?.(); };

  const fireSeqFlash = (midiNotes: number[], loop = false) => {
    stopSeqFlash(); isLoopingRef.current = loop;
    const msPerStep = 60000 / bpm / 2;
    const AUDIO_LATENCY = 60; // Sync visual to audio bridge latency
    const SLOTS = loop ? ARP_SLOTS : midiNotes.length;
    const measureMs = msPerStep * SLOTS;
    const pattern: number[] = [];
    for (let i = 0; i < SLOTS; i++) pattern.push(midiNotes[i % midiNotes.length]);
    setIsPlaying(true);
    const fireMeasure = () => {
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
  playCurrentChordRef.current = () => {
    const isScaleOrArp = voicingTab === 'scales' || voicingTab === 'arps' || voicingTab === 'intervals' || voicingTab === 'shapes';
    if (instrument === 'guitar') {
      const notesToPlay = (isScaleOrArp && currentScaleMidi.current.length) ? currentScaleMidi.current : currentGuitarMidi.current;
      if (notesToPlay.length) {
        const currentArp = isScaleOrArp ? true : arp;
        const isHold = playMode === 'hold' && !currentArp;
        const isArpHold = playMode === 'hold' && currentArp;
        if (isArpHold) { onArpLoop?.(notesToPlay, true); fireSeqFlash(notesToPlay, true); setIsPlaying(true); } 
        else { onPlay(notesToPlay, { guitar: true, forceArp: currentArp, scale: voicingTab === 'scales', hold: isHold });
          if (currentArp) fireSeqFlash(notesToPlay); else { fretboardRef.current?.flashAll(notesToPlay); if (isHold) setIsPlaying(true); }
        }
      }
    } else {
      const pianoNotes = pianoVoicings[pianoVoicingIdx]?.notes || getChordNotes(rootSemi, chordType, octave);
      if (pianoNotes.length) {
        const currentArp = isScaleOrArp ? true : arp;
        const isHold = playMode === 'hold' && !currentArp;
        const isArpHold = playMode === 'hold' && currentArp;
        if (isArpHold) { onArpLoop?.(pianoNotes, false); fireSeqFlash(pianoNotes, true); setIsPlaying(true); } 
        else { onPlay(pianoNotes, { guitar: false, forceArp: currentArp, scale: voicingTab === 'scales', hold: isHold });
          if (currentArp) fireSeqFlash(pianoNotes); else { pianoRef.current?.flashAll(pianoNotes); if (isHold) setIsPlaying(true); }
        }
      }
    }
  };

  const isFocused = useIsFocused();
  React.useEffect(() => {
    if (!isFocused || !userInteractedRef.current) return;
    userInteractedRef.current = false;
    stopSeqFlash(); onStop?.(); setVariationLabel(undefined); setPianoVoicingIdx(0); setArpSubsetIdx(0); setIntervalSubsetIdx(0);
    if (instrument === 'piano') playCurrentChordRef.current(); else pendingPlayRef.current = true;
  }, [rootSemi, chordType]);

  React.useEffect(() => { 
    if (!isFocused) handleStop(); 
  }, [isFocused]);

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
        else { onPlay(notesToPlay, { guitar: true, forceArp: currentArp, scale: voicingTab === 'scales', hold: isHold });
          if (currentArp) fireSeqFlash(notesToPlay); else { fretboardRef.current?.flashAll(notesToPlay); if (isHold) setIsPlaying(true); }
        }
      }
    } else {
      const pianoNotes = pianoVoicings[pianoVoicingIdx]?.notes || getChordNotes(rootSemi, chordType, octave);
      if (pianoNotes.length) {
        const currentArp = isScaleOrArp ? true : arp;
        const isHold = playMode === 'hold' && !currentArp;
        const isArpHold = playMode === 'hold' && currentArp;
        if (isArpHold) { onArpLoop?.(pianoNotes, false); fireSeqFlash(pianoNotes, true); setIsPlaying(true); } 
        else { onPlay(pianoNotes, { guitar: false, forceArp: currentArp, scale: voicingTab === 'scales', hold: isHold });
          if (currentArp) fireSeqFlash(pianoNotes); else { pianoRef.current?.flashAll(pianoNotes); if (isHold) setIsPlaying(true); }
        }
      }
    }
  };

  const handleRandomNext = () => {
    const { activeTypes, setChord, randomChord } = useChordStore.getState();
    
    if (activeTypes.length === 0) { 
      userInteractedRef.current = true; 
      randomChord(); 
      return; 
    }

    // Instantly pick a random root and type instead of calculating all possibilities
    const r = Math.floor(Math.random() * 12);
    const ct = activeTypes[Math.floor(Math.random() * activeTypes.length)];

    userInteractedRef.current = true;
    setChord(r, ct);
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

  React.useEffect(() => { handleStop(); setPianoVoicingIdx(0); }, [voicingTab, sortMode]);

  const allGuitarGroups = React.useMemo(() => {
    if (instrument === 'piano' || !currentChordDef) return { open: [], barre: [], triads: [], shells: [], drop2: [], drop3: [], drop2and4: [], quartal: [] };
    const isTriad = currentChordDef.iv.length === 3;
    const allDrops = !isTriad ? buildDropVoicings(chordType, currentChordDef, rootSemi, rootNoteName, displayChordName, namingMode) : [];
    return {
      open: buildOpenVoicings(chordType, rootSemi, rootNoteName, displayChordName),
      barre: buildBarreVoicings(chordType, rootSemi, rootNoteName, displayChordName),
      triads: buildTriadVoicings(currentChordDef, rootSemi, rootNoteName, namingMode),
      shells: !isTriad ? buildShellVoicings(chordType, currentChordDef, rootSemi, rootNoteName, displayChordName, namingMode) : [],
      drop2: allDrops.filter(g => g.voicings[0]?.type === 'drop2'),
      drop3: allDrops.filter(g => g.voicings[0]?.type === 'drop3'),
      drop2and4: allDrops.filter(g => g.voicings[0]?.type === 'drop2and4'),
    };
  }, [rootSemi, chordType, instrument, currentChordDef, namingMode, rootNoteName, displayChordName, selectedScaleId]);

  const guitarGroups = React.useMemo(() => {
    if (voicingTab === 'scales' || voicingTab === 'arps' || voicingTab === 'intervals' || voicingTab === 'shapes') return [];
    let rawGroups = (allGuitarGroups[voicingTab as keyof typeof allGuitarGroups] as VoicingGroup[]) ?? [];
    rawGroups = [...rawGroups].sort((a, b) => {
      const bassA = a.voicings[0]?.frets.findIndex(f => f.fret !== null) ?? 99;
      const bassB = b.voicings[0]?.frets.findIndex(f => f.fret !== null) ?? 99;
      return bassA - bassB;
    });

    const ROLE_ORDER: Record<string, number> = { 'root': 0, 'R': 0, 'b2': 1, '2nd': 1, '2': 1, 'b3': 2, '3rd': 2, '3': 2, '4th': 3, '4': 3, '#4': 3, 'b5': 4, '5th': 4, '5': 4, '#5': 4, 'b6': 5, '6th': 5, '6': 5, 'bb7': 6, 'b7': 6, '7th': 6, '7': 6, 'b9': 7, '9th': 7, '9': 7, '#9': 7, '11th': 8, '11': 8, '#11': 8, 'b13': 9, '13th': 9, '13': 9, '#13': 9 };
    const noteNames = namingMode === 'flat' ? NOTE_FLAT : NOTE_SHARP;

    return rawGroups.map(group => {
      const rootChar = rootNoteName[0];
      const acc = rootNoteName.length > 1 ? (rootNoteName[1] === '♭' || rootNoteName[1] === 'b' ? '[b♭]' : '[#♯]') : '';
      const slashRegex = new RegExp(`\\s*\\/\\s*${rootChar}${acc}\\s*$`, 'i');
      const sortedVoicings = group.voicings.map(v => ({ ...v, chordLabel: v.chordLabel.replace(slashRegex, '').trim() }));

      if (sortMode === 'voicings') {
          sortedVoicings.sort((a: any, b: any) => {
            const fretsA = a.frets.filter((f: any) => f.fret !== null).map((f: any) => f.fret as number);
            const fretsB = b.frets.filter((f: any) => f.fret !== null).map((f: any) => f.fret as number);
            const avgA = fretsA.length ? fretsA.reduce((sum: number, f: number) => sum + f, 0) / fretsA.length : 0;
            const avgB = fretsB.length ? fretsB.reduce((sum: number, f: number) => sum + f, 0) / fretsB.length : 0;
            if (Math.abs(avgA - avgB) > 0.1) return avgA - avgB;
            return (fretsA.length ? Math.min(...fretsA) : 0) - (fretsB.length ? Math.min(...fretsB) : 0);
          });
      } else {
          sortedVoicings.sort((a: any, b: any) => {
            if (a.chordLabel !== b.chordLabel) {
              const compA = getComplexity(a.frets.map((f: any) => f.role as string));
              const compB = getComplexity(b.frets.map((f: any) => f.role as string));
              if (compA.size !== compB.size) return compA.size - compB.size;
              if (compA.maxExt !== compB.maxExt) return compA.maxExt - compB.maxExt;
              const matchA = a.chordLabel.match(/^([A-G][#♯b♭]?)/);
              const matchB = b.chordLabel.match(/^([A-G][#♯b♭]?)/);
              let rankA = 99, rankB = 99;
              if (matchA && currentChordDef) { const pcA = noteNames.indexOf(matchA[1]); if (pcA >= 0) { const roleIdx = currentChordDef.iv.findIndex(iv => iv % 12 === (pcA - rootSemi + 12) % 12); if (roleIdx >= 0) rankA = ROLE_ORDER[currentChordDef.r[roleIdx]] ?? 99; } }
              if (matchB && currentChordDef) { const pcB = noteNames.indexOf(matchB[1]); if (pcB >= 0) { const roleIdx = currentChordDef.iv.findIndex(iv => iv % 12 === (pcB - rootSemi + 12) % 12); if (roleIdx >= 0) rankB = ROLE_ORDER[currentChordDef.r[roleIdx]] ?? 99; } }
              if (rankA !== rankB) return rankA - rankB;
              return a.chordLabel.localeCompare(b.chordLabel);
            }
            const invA = ROLE_ORDER[a.bassNote] ?? 99;
            const invB = ROLE_ORDER[b.bassNote] ?? 99;
            if (invA !== invB) return invA - invB;
            const fretsA = a.frets.filter((f: any) => f.fret !== null).map((f: any) => f.fret as number);
            const fretsB = b.frets.filter((f: any) => f.fret !== null).map((f: any) => f.fret as number);
            const avgA = fretsA.length ? fretsA.reduce((sum: number, f: number) => sum + f, 0) / fretsA.length : 0;
            const avgB = fretsB.length ? fretsB.reduce((sum: number, f: number) => sum + f, 0) / fretsB.length : 0;
            if (Math.abs(avgA - avgB) > 0.1) return avgA - avgB;
            return (fretsA.length ? Math.min(...fretsA) : 0) - (fretsB.length ? Math.min(...fretsB) : 0);
          });
      }
      const seen = new Set<string>();
      const uniqueVoicings = sortedVoicings.filter((v: any) => { if (seen.has(v.fingerprint)) return false; seen.add(v.fingerprint); return true; });
      return { ...group, voicings: uniqueVoicings };
    });
  }, [allGuitarGroups, voicingTab, sortMode, currentChordDef, rootSemi, namingMode, rootNoteName]);

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

    const GS = [40, 45, 50, 55, 59, 64];
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
    const GS = [40, 45, 50, 55, 59, 64];

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
        // Shift startMidi
        const startMidi = (octave + 1) * 12 + rootSemi;
        const notes = subset.ivs.map((iv: number) => startMidi + iv);
        return [{ name: subset.label || '', chordLabel: displayChordName, notes, roles: subset.roles || [], formulas: subset.formulaLabels || subset.roles || [] }];
      }
      return [];
    }

    const pV = buildPianoVoicings(rootSemi, chordType, octave, selectedScaleId, namingMode);
    let selectedGroup: any[] = [];
    
    if (voicingTab === 'block') {
      const notes = getChordNotes(rootSemi, chordType, octave);
      const roles = notes.map(n => { const idx = currentChordDef.iv.findIndex(iv => (rootSemi + iv) % 12 === n % 12); return idx !== -1 ? currentChordDef.r[idx] : ''; });
      const formulas = notes.map(n => { const idx = currentChordDef.iv.findIndex(iv => (rootSemi + iv) % 12 === n % 12); return idx !== -1 ? currentChordDef.f[idx] : ''; });
      selectedGroup = [{ name: 'Root Position', chordLabel: formatChordSymbol(displayChordName), notes, roles, formulas }];
    }
    else if (voicingTab === 'triads') selectedGroup = pV.triads;
    else if (voicingTab === 'shells') selectedGroup = pV.shells;
    else if (voicingTab === 'drop2') selectedGroup = pV.drop2 || [];
    else if (voicingTab === 'drop3') selectedGroup = pV.drop3 || [];
    else if (voicingTab === 'drop2and4') selectedGroup = pV.drop2and4 || [];

    if (selectedGroup.length > 0) {
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
        const ROLE_ORDER: Record<string, number> = { 'root': 0, 'R': 0, 'b2': 1, '2nd': 1, '2': 1, 'b3': 2, '3rd': 2, '3': 2, '4th': 3, '4': 3, '#4': 3, 'b5': 4, '5th': 4, '5': 4, '#5': 4, 'b6': 5, '6th': 5, '6': 5, 'bb7': 6, 'b7': 6, '7th': 6, '7': 6, 'b9': 7, '9th': 7, '9': 7, '#9': 7, '11th': 8, '11': 8, '#11': 8, 'b13': 9, '13th': 9, '13': 9, '#13': 9 };
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
  }, [rootSemi, chordType, octave, currentChordDef, voicingTab, scaleVoicings, arpVoicings, intervalVoicings, sortMode, displayChordName, selectedScaleId, rootNoteName]);

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
    const isPiano = instrument === 'piano';
    const pV = buildPianoVoicings(rootSemi, chordType, octave, selectedScaleId, namingMode);
    return {
      block: isPiano ? 1 : 0, open: isPiano ? 0 : countGuitar(allGuitarGroups.open), barre: isPiano ? 0 : countGuitar(allGuitarGroups.barre),
      triads: isPiano ? pV.triads.length : countGuitar(allGuitarGroups.triads), shells: isPiano ? pV.shells.length : countGuitar(allGuitarGroups.shells),
      drop2:  isPiano && pV.drop2 ? pV.drop2.length : countGuitar(allGuitarGroups.drop2), drop3:  isPiano && pV.drop3 ? pV.drop3.length : countGuitar(allGuitarGroups.drop3),
      drop2and4: isPiano && pV.drop2and4 ? pV.drop2and4.length : countGuitar(allGuitarGroups.drop2and4),
      spread: 0, rootless: 0, // Hardcoded to 0 to permanently disable
      intervals: getIntervalSubsets(currentChordDef.iv, currentChordDef.r, currentChordDef.f || []).length, scales: (CHORD_SCALE_MAP[chordType] ?? []).length,
      arps: getArpSubsets(currentChordDef.iv, currentChordDef.r, currentChordDef.f || []).length,
      shapes: instrument === 'piano' ? new Set(buildHardcodedShapeVoicings(chordType, rootSemi, namingMode).map((v: ScaleVoicing) => v.scaleName.replace(/\s*\([A-G]\s*Pos\)/i, '').trim())).size : buildHardcodedShapeVoicings(chordType, rootSemi, namingMode).length,
    };
  }, [allGuitarGroups, chordType, instrument, currentChordDef, octave, rootSemi, namingMode, selectedScaleId]);

  const ALL_VOICING_TABS: { key: VoicingTabKey; label: string }[] = [ { key: 'block', label: 'Block' }, { key: 'open', label: 'Open' }, { key: 'barre', label: 'Barre' }, { key: 'triads', label: 'Triads' }, { key: 'shells', label: 'Shells' }, { key: 'drop2',  label: 'Drop 2' }, { key: 'drop3',  label: 'Drop 3' }, { key: 'drop2and4', label: 'Drop 2 & 4' }, { key: 'intervals', label: 'Intervals' }, { key: 'arps',   label: 'Arps' }, { key: 'shapes', label: 'Shapes' }, { key: 'scales', label: 'Scales' } ];
  const VOICING_TABS = ALL_VOICING_TABS.filter(tab => tabCounts[tab.key] > 0);

  React.useEffect(() => { if (tabCounts[voicingTab] === 0 && VOICING_TABS.length > 0) setVoicingTab(VOICING_TABS[0].key); }, [tabCounts]);

  React.useLayoutEffect(() => {
    if (instrument !== 'piano') return;
    const currentPv = pianoVoicings[pianoVoicingIdx];
    if (!currentPv) return;

    if (voicingTab === 'scales' || voicingTab === 'arps' || voicingTab === 'intervals' || voicingTab === 'shapes') {
      let label = currentPv.name;
      if (voicingTab === 'arps') label = `${rootNoteName} ${arpSubsets[safeArpSubsetIdx]?.label}`;
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
    const formattedVar = formatChordSymbol(variationLabel);
    const match = formattedVar.match(/^([A-G][#♯b♭]?)(?:\s+(.*)|(m|maj|min|dim|aug|sus|alt|add|\d|ø|°|Δ|\+|-.*|))$/i);
    if (match) {
      subRoot = match[1];
      subType = (match[2] || match[3] || '').trim();
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

  const combinedHeader = (
    <VoicingTabBar voicingTab={voicingTab} setVoicingTab={setVoicingTab} tabCounts={tabCounts} t={t} />
  );

  return (
    <View style={[styles.safe, { backgroundColor: t.bg }]}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} maintainVisibleContentPosition={{ minIndexForVisible: 0 }}>

        <ChordCard
          rootSemi={rootSemi} chordType={chordType} namingMode={namingMode} subLabelRoot={subRoot} subLabelType={subType} overrideType={formattedMainType}
          onPress={handlePlay}
          onSwipeLeft={() => { 
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); 
            if (instrument === 'piano' && pianoVoicings.length) { setPianoVoicingIdx((pianoVoicingIdx - 1 + pianoVoicings.length) % pianoVoicings.length); handleManualNavigate(); } 
            else if (instrument === 'guitar') fretboardRef.current?.prevVoicing(); 
            else { userInteractedRef.current = true; shiftRoot('down'); }
          }}
          onSwipeRight={() => { 
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); 
            if (instrument === 'piano' && pianoVoicings.length) { setPianoVoicingIdx((pianoVoicingIdx + 1) % pianoVoicings.length); handleManualNavigate(); } 
            else if (instrument === 'guitar') fretboardRef.current?.nextVoicing(); 
            else { userInteractedRef.current = true; shiftRoot('up'); }
          }}
          onLeftChevronPress={() => { 
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); 
            if (instrument === 'piano' && pianoVoicings.length) { setPianoVoicingIdx((pianoVoicingIdx - 1 + pianoVoicings.length) % pianoVoicings.length); handleManualNavigate(); } 
            else if (instrument === 'guitar') fretboardRef.current?.prevVoicing(); 
            else { userInteractedRef.current = true; shiftRoot('down'); }
          }}
          onRightChevronPress={() => { 
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); 
            if (instrument === 'piano' && pianoVoicings.length) { setPianoVoicingIdx((pianoVoicingIdx + 1) % pianoVoicings.length); handleManualNavigate(); } 
            else if (instrument === 'guitar') fretboardRef.current?.nextVoicing(); 
            else { userInteractedRef.current = true; shiftRoot('up'); }
          }}
          onNotePress={(midi) => onNotePress?.(midi, 80, instrument === 'guitar')}
          octave={octave} theme={t} activeIvs={displayIvs} activeRoles={displayRoles} activeFormula={displayFormula}
        />

        {instrument === 'piano' ? (
          <PianoView
            ref={pianoRef} showAllLabels={true} header={combinedHeader} midiNotes={pianoVoicings[pianoVoicingIdx]?.notes || []} showNavigation={true}
            groupLabel="CHORD" voicingLabel={voicingTab === 'arps' || voicingTab === 'intervals' ? 'SUBSET' : 'VOICING'}
            voicingName={(voicingTab === 'arps' ? arpSubsets[safeArpSubsetIdx]?.label : voicingTab === 'intervals' ? intervalSubsets[safeIntervalSubsetIdx]?.label : (pianoVoicings[pianoVoicingIdx]?.chordLabel || displayChordName)) + pianoSlashSuffix}
            voicingSubName={voicingTab === 'arps' ? arpSubsets[safeArpSubsetIdx]?.subLabel : voicingTab === 'intervals' ? intervalSubsets[safeIntervalSubsetIdx]?.subLabel : pianoVoicings[pianoVoicingIdx]?.name}
            voicingIdx={voicingTab === 'arps' ? safeArpSubsetIdx : voicingTab === 'intervals' ? safeIntervalSubsetIdx : pianoVoicingIdx}
            totalVoicings={voicingTab === 'arps' ? arpSubsets.length : voicingTab === 'intervals' ? intervalSubsets.length : pianoVoicings.length}
            onPrevVoicing={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); if (voicingTab === 'arps' && arpSubsets.length) setArpSubsetIdx((safeArpSubsetIdx - 1 + arpSubsets.length) % arpSubsets.length); else if (voicingTab === 'intervals' && intervalSubsets.length) setIntervalSubsetIdx((safeIntervalSubsetIdx - 1 + intervalSubsets.length) % intervalSubsets.length); else if (pianoVoicings.length) setPianoVoicingIdx((pianoVoicingIdx - 1 + pianoVoicings.length) % pianoVoicings.length); handleManualNavigate(); }}
            onNextVoicing={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); if (voicingTab === 'arps' && arpSubsets.length) setArpSubsetIdx((safeArpSubsetIdx + 1) % arpSubsets.length); else if (voicingTab === 'intervals' && intervalSubsets.length) setIntervalSubsetIdx((safeIntervalSubsetIdx + 1) % intervalSubsets.length); else if (pianoVoicings.length) setPianoVoicingIdx((pianoVoicingIdx + 1) % pianoVoicings.length); handleManualNavigate(); }}
            groups={pianoGroups}
            onGroupPrev={() => { if (pianoGroups.length === 0) return; const idx = pianoGroups.findIndex((g: { startIdx: number; count: number }) => pianoVoicingIdx >= g.startIdx && pianoVoicingIdx < g.startIdx + g.count); const safeIdx = idx === -1 ? 0 : idx; const prevIdx = (safeIdx - 1 + pianoGroups.length) % pianoGroups.length; setPianoVoicingIdx(pianoGroups[prevIdx].startIdx); handleManualNavigate(); }}
            onGroupNext={() => { if (pianoGroups.length === 0) return; const idx = pianoGroups.findIndex((g: { startIdx: number; count: number }) => pianoVoicingIdx >= g.startIdx && pianoVoicingIdx < g.startIdx + g.count); const safeIdx = idx === -1 ? 0 : idx; const nextIdx = (safeIdx + 1) % pianoGroups.length; setPianoVoicingIdx(pianoGroups[nextIdx].startIdx); handleManualNavigate(); }}
            theme={t}
            noteNames={(pianoVoicings[pianoVoicingIdx]?.roles || currentChordDef.r).map((role: string, i: number) => {
              const pv = pianoVoicings[pianoVoicingIdx];
              if (pv && pv.formulas && pv.formulas[i]) return spellInterval(rootSemi, pv.formulas[i], namingMode === 'flat');
              const pcIdx = currentChordDef.r.indexOf(role);
              const formula = pcIdx !== -1 && currentChordDef.f ? currentChordDef.f[pcIdx] : role;
              return spellInterval(rootSemi, formula, namingMode === 'flat');
            })}
            roles={pianoVoicings[pianoVoicingIdx]?.roles || currentChordDef.r} formulas={pianoVoicings[pianoVoicingIdx]?.formulas || currentChordDef.f} formulaByPC={formulaByPC}
            onNotePress={(midi: number) => onNotePress?.(midi, 80, false)}
            octave={octave} labelMode={labelMode} rootSemi={rootSemi} namingMode={namingMode} scaleOverlay={scaleOverlay && voicingTab !== 'scales'} overlayNotes={pianoOverlayMidiNotes.notes} overlayRoles={pianoOverlayMidiNotes.roles} overlayFormulas={pianoOverlayMidiNotes.formulas} parentScales={[]} activeParentScale={selectedScaleId} onParentScaleChange={setSelectedScaleId}
          />
        ) : (
          <FretboardView
            ref={fretboardRef} header={combinedHeader} groups={guitarGroups} theme={t} defaultGroupIdx={voicingTab === 'triads' ? Math.max(0, guitarGroups.length - 1) : 0}
            onNotePress={(midi) => onNotePress?.(midi, 80, true)} onNavigate={handleManualNavigate}
            onPlayVoicing={(midiNotes: number[], voicingName: string, activeRoles?: string[], activeIvs?: number[], spelledNames?: string[], activeFormula?: string[]) => {
              if (voicingTab === 'scales' || voicingTab === 'arps' || voicingTab === 'intervals' || voicingTab === 'shapes') {
                currentScaleMidi.current = midiNotes;
                let label = voicingName;
                if (voicingTab === 'arps') label = `${rootNoteName} ${arpSubsets[safeArpSubsetIdx]?.label}`;
                if (voicingTab === 'intervals') label = `${rootNoteName} ${intervalSubsets[safeIntervalSubsetIdx]?.label}`;
                setVariationLabel(label);
                if (activeRoles && activeIvs) { setActiveFretboardRoles(activeRoles); setActiveFretboardIvs(activeIvs); setActiveFretboardFormula(activeFormula); }
              } else {
                currentGuitarMidi.current = midiNotes;
                const isDifferentChord = voicingName !== displayChordName;
                setVariationLabel(isDifferentChord ? voicingName : undefined);
                if (activeRoles && activeIvs) { setActiveFretboardRoles(activeRoles); setActiveFretboardIvs(activeIvs); setActiveFretboardFormula(activeFormula); }
              }
              if (pendingPlayRef.current) { pendingPlayRef.current = false; setTimeout(() => { playCurrentChordRef.current(); }, 50); }
            }}
            rootSemi={rootSemi} chordName={displayChordName} chordType={chordType} labelMode={labelMode}
            scaleVoicings={scaleVoicings} scaleMode={voicingTab === 'scales'} arpMode={voicingTab === 'arps' || voicingTab === 'intervals'} arpVoicings={voicingTab === 'arps' ? arpVoicings : voicingTab === 'intervals' ? intervalVoicings : []} arpSubsets={voicingTab === 'intervals' ? intervalSubsets : arpSubsets} arpSubsetIdx={voicingTab === 'intervals' ? safeIntervalSubsetIdx : safeArpSubsetIdx}
            overlayNotes={guitarOverlayNotes} // Explicitly pass the full-neck array down
            onArpSubsetChange={(idx) => { if (voicingTab === 'intervals') setIntervalSubsetIdx(idx); else setArpSubsetIdx(idx); }}
            shapesMode={voicingTab === 'shapes'} shapeVoicings={shapeVoicings} formulaByPC={formulaByPC}
            namingMode={namingMode} scaleOverlay={scaleOverlay && voicingTab !== 'scales'} parentScales={[]} activeParentScale={selectedScaleId} onParentScaleChange={setSelectedScaleId}
            selectedScaleId={selectedScaleId} onScaleChange={setSelectedScaleId}
          />
        )}

        {/* SETTINGS MENU HAS BEEN OFFICIALLY OBLITERATED FROM HERE */}

      </ScrollView>

      {/* ── Sticky Player Dock ───────────────────────────────────────────── */}
      <View style={[styles.stickyPlayer, { backgroundColor: t.bg, borderTopColor: t.border }]}>
        
        {/* INLINE ENGINE CONTROLS */}
        <View style={{ marginBottom: 12 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
            
            <VisualDisplaySettings voicingTab={voicingTab} shapeDisplayMode={shapeDisplayMode} setShapeDisplayMode={setShapeDisplayMode} activeScaleName={SCALES[activeScaleIdForGuitar]?.name} t={t} />

            <TouchableOpacity activeOpacity={0.7} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setPlayMode(playMode === 'once' ? 'hold' : 'once'); }} style={[styles.enginePill, { backgroundColor: playMode === 'hold' ? t.accent : t.bg2, borderColor: playMode === 'hold' ? t.accent : t.border }]}>
              <Ionicons name="repeat" size={16} color={playMode === 'hold' ? '#fff' : t.txt2} />
              <Text style={[styles.enginePillTxt, { color: playMode === 'hold' ? '#fff' : t.txt2 }]}>Hold</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>

        <View style={styles.actionRow}>
          {inputMode === 'random' ? (
            <>
              <TouchableOpacity style={[styles.actionBtn, { backgroundColor: t.bg2, borderColor: t.border }]} onPress={() => setSheetVisible(true)}>
                <Ionicons name="library-outline" size={24} color={t.txt2} />
                <View style={[styles.badge, { backgroundColor: t.accent }]}><Text style={styles.badgeText}>{useChordStore.getState().activeTypes.length}</Text></View>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.wideLoopBtn, { backgroundColor: t.bg2, borderColor: t.border }]} onPressIn={() => { 
  const now = Date.now();
  if (now - lastRandomTimeRef.current < 150) return; // 150ms shield allows fast tapping but blocks ghost double-clicks
  lastRandomTimeRef.current = now;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); 
  stopSeqFlash(); 
  onStop?.(); 
  handleRandomNext(); // Executed synchronously, no more setTimeout delay
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
          )}
          <Animated.View style={[{ transform: [{ scale: playAnim }] }]}>
            <TouchableOpacity style={[styles.squarePlayBtn, { backgroundColor: isPlaying ? '#D4537E' : '#639922' }]} onPress={isPlaying ? handleStop : handlePlay} activeOpacity={0.85}>
              <Ionicons name={isPlaying ? "stop" : "play"} size={26} color="#fff" />
            </TouchableOpacity>
          </Animated.View>
        </View>
      </View>

      <CommandSheet visible={sheetVisible} onClose={() => setSheetVisible(false)} onLivePreview={(r, c) => { 
          // Give the state a tiny moment to update, then fire the main play function
          // so it respects the current voicing tab, shapes, inversions, and octave
          setTimeout(() => { playCurrentChordRef.current(); }, 50); 
        }} 
        onExecute={() => { if (inputMode === 'random') handleRandomNext(); }} />

    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { paddingVertical: 16, paddingBottom: 32, gap: 12 },
  modeToggleRow: { flexDirection: 'row', marginHorizontal: 16, borderRadius: 20, padding: 12, borderWidth: 1 },
  modeBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 46, borderRadius: 10 },
  modeBtnText: { fontWeight: '700', fontSize: 14 },
  
  tabBarOuter: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1 },
  tabBtn: { height: 46, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },

  visualSettingsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1 },
  miniPill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  miniPillTxt: { fontSize: 11, fontWeight: '800' },

  stickyPlayer: { paddingVertical: 12, borderTopWidth: 1, paddingBottom: Platform.OS === 'ios' ? 24 : 12 },
  enginePill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, height: 40, borderRadius: 20, borderWidth: 1 },
  enginePillTxt: { fontSize: 14, fontWeight: '700' },
  
  actionRow: { flexDirection: 'row', gap: 12, marginHorizontal: 16 },
  actionBtn: { width: 56, height: 56, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: -6, right: -6, minWidth: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, borderWidth: 2, borderColor: '#fff' },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: '900' },
  wideLoopBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 20, borderWidth: 1, height: 56 },
  wideLoopText: { fontWeight: '700', fontSize: 14 },
  squarePlayBtn: { width: 64, height: 56, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});