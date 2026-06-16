import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, Animated
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useIsFocused, useFocusEffect } from '@react-navigation/native';
import { useSettingsStore } from '@features/settings/store/settingsStore';
import { useChordStore } from '@features/play/store/chordStore';
import { useQuizStore } from '@features/quiz/store/quizStore';
import ListeningVisual from '@features/quiz/components/ListeningVisual';
import { THEMES } from '@shared/ui/themes';
import { TYPE, FONT_WEIGHT } from '@shared/ui/typography';
import { CH, NOTE_SHARP, NOTE_FLAT, getChordNotes, spellInterval, preferredAccidentalForRoot, SCALES, CHORD_SCALE_MAP } from '@shared/theory/musicTheory';
import { PianoView, type PianoViewRef, FretboardView, type FretboardViewRef, CommandSheet } from '@shared/ui';
import { isChordTypeFree, FREE_VOICING_TABS } from '@features/pro/proConstants';
import { useAudio } from '@shared/audio/AudioContext';
import { 
  buildTriadVoicings, 
  buildDropVoicings, 
  buildShellVoicings, 
  buildOpenVoicings, 
  buildBarreVoicings, 
  buildScaleVoicings,
  buildArpVoicings,
  buildHardcodedShapeVoicings,
  getArpSubsets,
  getIntervalSubsets,
  identifyCompleteChord,
  Voicing,
  VoicingGroup,
  filterVoicingsByInversion,
  anyTypeSupportsVoicingTab,
} from '@shared/guitar';
import { buildPianoVoicings, applyInversion } from '@shared/piano/pianoVoicings';
import { UnifiedVoicing } from '@shared/types/models';

const ALL_CHORD_KEYS = Object.keys(CH);

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// The actual inversion of a voicing, from its lowest sounding note's position in the chord's
// interval stack. Index-based so it's correct for ALL chords — e.g. a sus2's 2nd (iv index 1)
// reads as 1st inversion, which role-name mapping misses. '1st' always corresponds to the
// functional 3rd (or sus tone for sus chords, or 2nd/4th as applicable). '3rd' requires the
// 4th chord tone to be a true 7th/6th (iv[3] < 12) — for chords like add9 where the 4th tone
// is the 9th (iv[3]=14), that note in the bass is 'other', not a named inversion.
// 'other' = bass is an extension (9th, 11th, etc.) with no standard inversion name.
function inversionOfBass(midis: number[], root: number, chordType: string): 'root' | '1st' | '2nd' | '3rd' | 'other' {
  if (!midis.length) return 'root';
  const ch = CH[chordType];
  const bassPc = ((Math.min(...midis) % 12) + 12) % 12;
  const rootPc = ((root % 12) + 12) % 12;
  if (bassPc === rootPc) return 'root';
  const idx = ch ? ch.iv.findIndex(iv => (root + iv) % 12 === bassPc) : -1;
  if (idx === 1) return '1st';
  if (idx === 2) return '2nd';
  // 3rd inversion only when the 4th chord tone is a 7th/6th (iv < 12), not an extension
  // like a 9th. add9/minAdd9 have iv[3]=14 (M9) — 9th in bass is 'other', not '3rd'.
  if (idx === 3 && ch && ch.iv[3] < 12) return '3rd';
  return 'other';
}

// A guitar voicing's inversion from its actual lowest fretted note (index-based, so it's
// correct for sus / non-tertian chords too). Replaces the old role-based bassRoleToInversion,
// which assumed 3rd→1st / 5th→2nd / 7th→3rd and mislabeled sus chords.
const GS_MIDI_STANDARD = [40, 45, 50, 55, 59, 64]; // standard guitar tuning (low E … high E)
function guitarVoicingInversion(frets: any[], root: number, chordType: string): 'root' | '1st' | '2nd' | '3rd' {
  const midis = (frets || [])
    .map((fr: any, str: number) => fr && fr.fret !== null && fr.fret !== undefined ? GS_MIDI_STANDARD[str] + (fr.fret as number) : null)
    .filter((m: any): m is number => m !== null);
  const inv = inversionOfBass(midis, root, chordType);
  return inv === 'other' ? '3rd' : inv;
}

function findAudibleChordType(
  root: number,
  playedNotes: number[],
  pool: string[]
): string | null {
  const playedPCs = new Set(playedNotes.map(n => n % 12));
  for (const type of pool) {
    const ch = CH[type];
    if (!ch) continue;
    const chordPCs = new Set(ch.iv.map(iv => (root + iv) % 12));
    if (chordPCs.size < playedPCs.size) continue;
    if (ch.iv.every(iv => playedPCs.has((root + iv) % 12))) return type;
  }
  return null;
}

function findSimplestContainedChordType(
  root: number,
  playedNotes: number[],
  pool: string[]
): string | null {
  const playedPCs = new Set(playedNotes.map(n => n % 12));
  let best: string | null = null;
  let bestSize = Infinity;
  for (const type of pool) {
    const ch = CH[type];
    if (!ch) continue;
    if (ch.iv.every(iv => playedPCs.has((root + iv) % 12))) {
      if (ch.iv.length < bestSize) {
        bestSize = ch.iv.length;
        best = type;
      }
    }
  }
  return best;
}

// preferredAccidentalForRoot (spelling by the root's circle-of-fifths key, so A♭ minor reads
// A♭ C♭ E♭ D♭ not G♯ B D♯ C♯) lives in musicTheory so the shape builder shares the exact rule.

function buildOptions(
  correctRoot: number,
  correctType: string,
  pool: string[],
  quizMode: 'visual' | 'audio',
  namingMode: 'sharp' | 'flat',
  playedNotes?: number[],
  inversion: 'root' | '1st' | '2nd' | '3rd' = 'root',
  // Pre-spelled bass note for the slash, derived from the ACTUAL displayed voicing's lowest
  // note. Takes precedence over `inversion` because drop2 (and any 5+ note chord like 7#5#9)
  // can put a non-root tone — even an extension like the #9 — in the bass, which the
  // root/1st/2nd/3rd enum can't express. `undefined` = not provided (use legacy inversion
  // path); `null` = provided, root in bass (no slash); string = that bass note.
  displayedBass?: string | null
): { root: number; type: string; label: string }[] {
  const opts: { root: number; type: string; label: string }[] = [];
  const seenTypes = new Set<string>();

  const makeLabel = (type: string, isInverted: boolean = false) => {
    const ch = CH[type];
    if (!ch) return type;

    const rootName = (namingMode === 'flat' ? NOTE_FLAT : NOTE_SHARP)[correctRoot];
    const chordSymbol = ch.s;
    const base = `${rootName} ${chordSymbol}`;

    // Preferred path: use the real displayed/played bass note (same string on every option
    // so the slash isn't a giveaway). Applies in BOTH visual and audio modes — a non-root
    // bass is audible in audio mode too, so the answer should still show the slash.
    if (displayedBass !== undefined) {
      return displayedBass ? `${base} / ${displayedBass}` : base;
    }

    if (quizMode === 'audio') {
      return base;
    }

    // Legacy fallback: derive the bass from the inversion enum (tertian chords only).
    if (!isInverted || inversion === 'root') {
      return base;
    }
    const shiftIndex = inversion === '1st' ? 1 : inversion === '2nd' ? 2 : 3;
    const safeIdx = Math.min(shiftIndex, ch.iv.length - 1);
    const bassFormula = ch.f?.[safeIdx];
    const bassNote = bassFormula
      ? spellInterval(correctRoot, bassFormula, namingMode === 'flat')
      : (namingMode === 'flat' ? NOTE_FLAT[(correctRoot + ch.iv[safeIdx]) % 12] : NOTE_SHARP[(correctRoot + ch.iv[safeIdx]) % 12]);

    return `${base} / ${bassNote}`;
  };

  // In audio mode, filter pool to only include chord types that match the played notes
  let filteredPool = pool;
  if (quizMode === 'audio' && playedNotes && playedNotes.length > 0) {
    const playedPCs = new Set(playedNotes.map(n => n % 12));

    filteredPool = pool.filter(type => {
      const ch = CH[type];
      if (!ch) return false;

      // Calculate the pitch classes this chord type would produce
      const chordPCs = new Set(ch.iv.map(iv => (correctRoot + iv) % 12));

      // Allow subset matches for shell voicings (e.g., R-3-7 played for R-3-5-7 chord)
      // but still require that all played notes are valid chord tones
      if (!ch.iv.every(iv => playedPCs.has((correctRoot + iv) % 12))) return false;

      // Check that all played notes are contained within the chord's pitch classes
      // This allows shell voicings to match their full chord counterparts
      return playedPCs.size <= chordPCs.size && [...playedPCs].every((pc: number) => chordPCs.has(pc));
    });

    // NOTE: The blind fallback (if filteredPool.length < 4) has been completely removed
    // to prevent superset chords from being forced back into the multiple choice array.
  }

  seenTypes.add(correctType);
  opts.push({ root: correctRoot, type: correctType, label: makeLabel(correctType, true) });

  // Pass 1: Try to fill from the strictly filtered pool
  let attempts = 0;
  while (opts.length < 4 && attempts < 200) {
    attempts++;
    if (filteredPool.length === 0) break;

    const randType = pickRandom(filteredPool);
    
    if (!seenTypes.has(randType) && CH[randType]) {
      seenTypes.add(randType);
      opts.push({ root: correctRoot, type: randType, label: makeLabel(randType, true) });
    }
  }

  // Pass 2 (Safe Distractor Generator): pad with distinct core qualities from the user's pool.
  const SAFE_DISTRACTORS = ['maj7', 'min7', 'dom7', 'hdim7', 'fdim7', 'sus4', 'sus2', 'minMaj7', 'aug', 'dim', 'maj_b5'];
  const filteredSafeDistractors = SAFE_DISTRACTORS.filter(t => pool.includes(t));
  if (filteredSafeDistractors.length > 0) {
    attempts = 0;
    while (opts.length < 4 && attempts < 100) {
      attempts++;
      const safeType = pickRandom(filteredSafeDistractors);
      if (!seenTypes.has(safeType) && CH[safeType]) {
        seenTypes.add(safeType);
        opts.push({ root: correctRoot, type: safeType, label: makeLabel(safeType, true) });
      }
    }
  }

  // Pass 3: Draw from the full unfiltered pool — audio filter may have restricted too much.
  attempts = 0;
  while (opts.length < 4 && attempts < 400) {
    attempts++;
    if (pool.length === 0) break;
    const randType = pickRandom(pool);
    if (!seenTypes.has(randType) && CH[randType]) {
      seenTypes.add(randType);
      opts.push({ root: correctRoot, type: randType, label: makeLabel(randType, true) });
    }
  }

  // Pass 4: Nuclear backstop — any known chord type, guarantees exactly 4 options.
  attempts = 0;
  while (opts.length < 4 && attempts < 1000) {
    attempts++;
    const randType = pickRandom(ALL_CHORD_KEYS);
    if (!seenTypes.has(randType) && CH[randType]) {
      seenTypes.add(randType);
      opts.push({ root: correctRoot, type: randType, label: makeLabel(randType, true) });
    }
  }

  for (let i = opts.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [opts[i], opts[j]] = [opts[j], opts[i]];
  }
  return opts;
}

function buildCategoryOptions(
  correctKey: string,
  correctLabel: string,
  pool: { key: string; label: string }[]
): { root: number; type: string; label: string }[] {
  const opts: { root: number; type: string; label: string }[] = [];
  const seen = new Set<string>();
  seen.add(correctKey);
  opts.push({ root: 0, type: correctKey, label: correctLabel });
  let attempts = 0;
  while (opts.length < 4 && attempts < 300) {
    attempts++;
    if (!pool.length) break;
    const item = pool[Math.floor(Math.random() * pool.length)];
    if (item && !seen.has(item.key)) {
      seen.add(item.key);
      opts.push({ root: 0, type: item.key, label: item.label });
    }
  }
  for (let i = opts.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [opts[i], opts[j]] = [opts[j], opts[i]];
  }
  return opts;
}

// Pitch-class-set signature for a chord type at a given root (octave-independent).
function chordPcSig(type: string, root: number): string | null {
  const ch = CH[type];
  if (!ch) return null;
  return [...new Set(ch.iv.map(iv => (((root + iv) % 12) + 12) % 12))]
    .sort((a, b) => a - b)
    .join(',');
}

// Given the built options and the primary correct index, return EVERY index that
// is genuinely a correct answer.
//
// For chords (the "any containing chord" rule): an option is correct when its
// chord tones contain every pitch class actually displayed. So a shown D m7
// (D F A C) also accepts m9 / m11 / m13, etc. — any chord those notes fit into.
// (Falls back to exact pitch-class-set equivalence if the displayed notes are
// unavailable.)
//
// For the category modes (scale/arp/interval/shape) two options are equivalent
// when they share an identical key or label.
function expandCorrectIdxs(
  opts: { root: number; type: string; label: string }[],
  baseIdxs: number[],
  category: 'chord' | 'scale' | 'arp' | 'interval' | 'shape',
  shownPcs?: number[]
): number[] {
  const result = new Set(baseIdxs.filter(i => i >= 0 && i < opts.length));
  if (result.size === 0) return baseIdxs;

  if (category === 'chord') {
    const shown = (shownPcs && shownPcs.length)
      ? [...new Set(shownPcs.map(pc => (((pc % 12) + 12) % 12)))]
      : null;
    if (shown) {
      opts.forEach((o, i) => {
        const ch = CH[o.type];
        if (!ch) return;
        const optPcs = new Set(ch.iv.map(iv => (((o.root + iv) % 12) + 12) % 12));
        if (shown.every(pc => optPcs.has(pc))) result.add(i);
      });
    } else {
      for (const ci of [...result]) {
        const target = opts[ci] && chordPcSig(opts[ci].type, opts[ci].root);
        if (!target) continue;
        opts.forEach((o, i) => {
          if (chordPcSig(o.type, o.root) === target) result.add(i);
        });
      }
    }
  } else {
    for (const ci of [...result]) {
      const correct = opts[ci];
      if (!correct) continue;
      opts.forEach((o, i) => {
        if (i !== ci && (o.type === correct.type || o.label === correct.label)) result.add(i);
      });
    }
  }
  return [...result].sort((a, b) => a - b);
}

export default function QuizScreen() {
  const insets = useSafeAreaInsets();
  const { playChord: onPlay, stopAudio: onStop, playSingleNote: onNotePress } = useAudio();
  const { octave, labelMode, theme, arp, instrument, isSettingsOpen, bpm, isPro } = useSettingsStore();
  const setArpForced = useSettingsStore(s => s.setArpForced);
  const { activeTypes, namingMode } = useChordStore();
  const { quizMode, quizScore, quizTotal, quizStreak, resetQuiz, incrementQuiz, activeVoicingTypes, activeInversions: rawInversions } = useQuizStore();
  // Free users are quizzed on root position only; 1st/2nd/3rd inversions are Pro. Clamp here
  // (memoized for stable identity) so every generation site below uses the gated list.
  const activeInversions = useMemo(() => (isPro ? rawInversions : ['root']), [isPro, rawInversions]);

  const t = THEMES[theme];
  const isFocused = useIsFocused();

  const quizLabelMode = labelMode;

  // Stop the quiz's own audio when it LOSES focus — but never on the initial unfocused mount. The
  // audio engine is global, and on Android cold start this (background) tab mounts a few seconds
  // late; an unconditional onStop() there killed a progression already playing on the Song tab.
  // Only stop on a real focused→unfocused transition (wasFocusedRef), so a backgrounded Quiz can't
  // touch another screen's audio.
  const quizWasFocusedRef = useRef(false);
  useEffect(() => {
    if (isFocused) { quizWasFocusedRef.current = true; return; }
    if (!quizWasFocusedRef.current) return; // never been focused → don't stop global audio
    stopSeqFlash();
    onStop();
  }, [isFocused]);

  // ── Quiz state ──────────────────────────────────────────────
  const [questionRoot, setQuestionRoot] = useState(0);
  const [questionType, setQuestionType] = useState('maj7');
  const [questionInversion, setQuestionInversion] = useState<'root' | '1st' | '2nd' | '3rd'>('root');
  // Per-question enharmonic spelling, chosen from the root's key (see
  // preferredAccidentalForRoot) so a flat-key chord/shape/scale reads with flats. Drives the
  // diagram labels, the answer choices and the revealed name so they all read identically.
  // Arps/intervals re-root themselves and keep the user's namingMode. Init from namingMode.
  const [questionNaming, setQuestionNaming] = useState<'sharp' | 'flat'>('sharp');
  // Arp reveal label: the chord name plus a slash bass when the lowest displayed note
  // isn't the root (e.g. "B sus4 / E"). Shown only on reveal so it never gives the answer away.
  const [arpRevealLabel, setArpRevealLabel] = useState<string>('');
  const [options, setOptions] = useState<{ root: number; type: string; label: string }[]>([]);
  const [answered, setAnswered] = useState<null | 'correct' | 'wrong'>(null);
  const [chosenIdx, setChosenIdx] = useState<number | null>(null);
  const [correctIdxs, setCorrectIdxs] = useState<number[]>([0]);
  const [revealed, setRevealed] = useState(false);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [guitarVoicing, setGuitarVoicing] = useState<Voicing | null>(null);
  const [pianoVoicing, setPianoVoicing] = useState<UnifiedVoicing | null>(null);
  const [activeQuizInstrument, setActiveQuizInstrument] = useState<'piano' | 'guitar'>(instrument);

  const [questionVoicingTab, setQuestionVoicingTab] = useState<string>('block');
  const [scaleVoicings, setScaleVoicings] = useState<any[]>([]);
  const [arpVoicings, setArpVoicings] = useState<any[]>([]);
  const [shapeVoicings, setShapeVoicings] = useState<any[]>([]);
  const [arpSubsets, setArpSubsets] = useState<any[]>([]);
  const [intervalSubsets, setIntervalSubsets] = useState<any[]>([]);
  const [safeArpSubsetIdx, setSafeArpSubsetIdx] = useState<number>(0);
  const [safeIntervalSubsetIdx, setSafeIntervalSubsetIdx] = useState<number>(0);
  const [quizCategory, setQuizCategory] = useState<'chord' | 'scale' | 'arp' | 'interval' | 'shape'>('chord');

  const tapAnim = useRef(new Animated.Value(1)).current;
  const bgOpacityAnim = useRef(new Animated.Value(0)).current;
  const borderColorAnim = useRef(new Animated.Value(0)).current;
  const pianoRef = useRef<PianoViewRef>(null);
  const fretboardRef = useRef<FretboardViewRef>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [playPulse, setPlayPulse] = useState(0); // bumped on each strike so the listening bars react to block chords
  const seqFlashTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const stopSeqFlash = () => {
    seqFlashTimers.current.forEach(time => clearTimeout(time));
    seqFlashTimers.current = [];
    setIsPlaying(false);
  };

  // Sequential (arpeggiated) flash — used for scales/arps/intervals/shapes, which
  // always arpeggiate. Marks isPlaying so the sticky-player button becomes a Stop.
  const fireSeqFlash = (midiNotes: number[]) => {
    stopSeqFlash();
    setIsPlaying(true);
    const msPerStep = 60000 / bpm / 2;
    const AUDIO_LATENCY = 60;
    midiNotes.forEach((midi, i) => {
      const fire = () => { pianoRef.current?.flashMidi(midi); fretboardRef.current?.flashMidi(midi); };
      seqFlashTimers.current.push(setTimeout(fire, Math.round(msPerStep * i) + AUDIO_LATENCY));
    });
    // Auto-revert to Play once the arpeggio has finished sounding.
    seqFlashTimers.current.push(setTimeout(() => setIsPlaying(false), Math.round(msPerStep * midiNotes.length) + AUDIO_LATENCY + 150));
  };

  const handleStopPlayback = () => { stopSeqFlash(); onStop(); };

  const animateTap = () => {
    Animated.sequence([
      Animated.timing(tapAnim, { toValue: 0.93, duration: 80, useNativeDriver: true }),
      Animated.timing(tapAnim, { toValue: 1, duration: 120, useNativeDriver: true }),
    ]).start();
  };

  useEffect(() => {
    if (answered) {
      bgOpacityAnim.setValue(0.5);
      borderColorAnim.setValue(1);
      Animated.timing(bgOpacityAnim, { toValue: 0, duration: 1000, useNativeDriver: true }).start();
      Animated.timing(borderColorAnim, { toValue: 0, duration: 1000, useNativeDriver: true }).start();
    }
  }, [answered]);

  const GS_MIDI = [40, 45, 50, 55, 59, 64];

  const { activeMidiNotes, activeRoles, activeFormulas, formulaByPC, noteNames } = React.useMemo(() => {
    let notes: number[] = [];
    let r: string[] = [];
    let f: string[] = [];
    let names: string[] = [];
    const fbpc: Record<number, string> = {};

    if (activeQuizInstrument === 'piano' && pianoVoicing) {
      notes = pianoVoicing.notes || [];
      r = pianoVoicing.roles || [];
      f = pianoVoicing.formulas || pianoVoicing.roles || [];
    } else if (activeQuizInstrument === 'guitar') {
      if ((questionVoicingTab === 'arps' || questionVoicingTab === 'intervals') && arpVoicings.length > 0) {
        // FretboardView always displays arpVoicings[0] (finds by boxName, defaults to first).
        // Use the same box for audio so the note count exactly matches the diagram.
        const curArpV = arpVoicings[0];
        if (curArpV?.notes?.length) {
          // Dedup by exact MIDI (not pitch class) so every diagram position plays,
          // including multiple octaves of the same note class across the neck box.
          const midiMap = new Map<number, { role: string; formula: string }>();
          curArpV.notes.forEach((n: any) => {
            const midi = GS_MIDI[n.stringIdx] + n.fret;
            if (!midiMap.has(midi)) midiMap.set(midi, { role: n.role || '', formula: n.formula || '' });
          });
          const sorted = [...midiMap.entries()].sort((a, b) => a[0] - b[0]);
          notes = sorted.map(([midi]) => midi);
          r = sorted.map(([, v]) => v.role);
          f = sorted.map(([, v]) => v.formula);
        } else if (pianoVoicing) {
          notes = pianoVoicing.notes || [];
          r = pianoVoicing.roles || [];
          f = pianoVoicing.formulas || pianoVoicing.roles || [];
        }
      } else if (['scales', 'shapes'].includes(questionVoicingTab) && pianoVoicing) {
        notes = pianoVoicing.notes || [];
        r = pianoVoicing.roles || [];
        f = pianoVoicing.formulas || pianoVoicing.roles || [];
      } else if (guitarVoicing && guitarVoicing.frets) {
        guitarVoicing.frets.forEach((fret, str) => {
          if (fret.fret !== null) {
            notes.push(GS_MIDI[str] + fret.fret);
            r.push(fret.role || '');
          }
        });
        const combined = notes.map((n, i) => ({ n, ro: r[i] })).sort((a,b) => a.n - b.n);
        notes = combined.map(x => x.n);
        r = combined.map(x => x.ro);
        f = [...r];
      }
    }

    if (notes.length === 0) {
      notes = getChordNotes(questionRoot, questionType, octave);
      const chDef = CH[questionType];
      if (chDef) {
        r = notes.map(n => {
          const idx = chDef.iv.findIndex(iv => (questionRoot + iv) % 12 === n % 12);
          return idx !== -1 ? chDef.r[idx] : '';
        });
        f = notes.map(n => {
          const idx = chDef.iv.findIndex(iv => (questionRoot + iv) % 12 === n % 12);
          return idx !== -1 ? (chDef.f?.[idx] || chDef.r[idx]) : '';
        });
      }
    }

    notes.forEach((midi, idx) => {
      const pc = midi % 12;
      fbpc[pc] = f[idx] || '';
      names.push(spellInterval(questionRoot, f[idx] || '', questionNaming === 'flat'));
    });

    return { activeMidiNotes: notes, activeRoles: r, activeFormulas: f, formulaByPC: fbpc, noteNames: names };
  }, [activeQuizInstrument, pianoVoicing, guitarVoicing, questionVoicingTab, questionRoot, questionType, octave, questionNaming, arpVoicings, safeArpSubsetIdx, safeIntervalSubsetIdx]);


  const getGuitarVoicingsForTab = (
    tab: string,
    chordType: string,
    rootSemi: number,
    nMode: 'sharp' | 'flat'
  ): Voicing[] => {
    const rootNoteName = (nMode === 'flat' ? NOTE_FLAT : NOTE_SHARP)[rootSemi];
    const ch = CH[chordType];
    if (!ch) return [];

    if (['scales', 'shapes', 'arps', 'intervals'].includes(tab)) {
      const uVoicings = getPianoVoicingsForTab(tab, chordType, rootSemi, nMode);
      return uVoicings.map(uv => ({
        name: uv.name,
        chordLabel: uv.chordLabel,
        frets: [],
        notes: uv.notes,
        fingerprint: uv.fingerprint
      })) as any[];
    }

    let groups: VoicingGroup[] = [];
    if (tab === 'open') {
      groups = buildOpenVoicings(chordType, rootSemi, rootNoteName, '');
    } else if (tab === 'barre') {
      groups = buildBarreVoicings(chordType, rootSemi, rootNoteName, '');
    } else if (tab === 'triads') {
      groups = buildTriadVoicings(ch, rootSemi, rootNoteName, nMode);
    } else if (tab === 'shells') {
      // Triads get dedicated skip-string shell grips (buildShellVoicings dispatches to
      // buildTriadShellVoicings for 3-note chords), so don't gate on iv.length.
      groups = buildShellVoicings(chordType, ch, rootSemi, rootNoteName, '', nMode);
    } else if (tab === 'drop2' || tab === 'drop3' || tab === 'drop2and4') {
      // Likewise triads have generated drop3 / drop2&4 grips (drop2 doesn't apply to a
      // triad, so that filter simply yields nothing — handled by the caller).
      const allDrops = buildDropVoicings(chordType, ch, rootSemi, rootNoteName, '', nMode);
      groups = allDrops.filter(g => g.voicings[0]?.type === tab);
    }

    return groups.flatMap(g => g.voicings);
  };

  const getPianoVoicingsForTab = (
    tab: string,
    chordType: string,
    rootSemi: number,
    nMode: 'sharp' | 'flat'
  ): UnifiedVoicing[] => {
    const ch = CH[chordType];
    if (!ch) return [];

    const rootNoteName = (nMode === 'flat' ? NOTE_FLAT : NOTE_SHARP)[rootSemi];
    const displayChordName = `${rootNoteName} ${ch.s}`;

    if (tab === 'scales' || tab === 'shapes') {
      const scaleIds = CHORD_SCALE_MAP[chordType] ?? [];
      const sVoicings = buildScaleVoicings(scaleIds, SCALES, rootSemi, ch.iv, nMode);
      // Quiz shapes are self-rooted: an "E Min Shape" upper structure of a G chord is labelled
      // AND coloured from its own root (E=R, G=♭3, …), not the parent — so the diagram matches
      // the answer name. (Play screen keeps the default parent-relative superimposition.)
      // Pass the GLOBAL namingMode (not nMode/qNaming) as the fallback: the shape's own root
      // drives its spelling, and for the only roots without a key convention (C, F♯/G♭) the
      // fallback must match the diagram (which also uses the global setting) — otherwise a
      // flat-side parent could label an F♯/G♭ shape "G♭" while the diagram shows F♯.
      const shapeSvs = buildHardcodedShapeVoicings(chordType, rootSemi, namingMode, false, true);
      const activeSvs = tab === 'scales' ? sVoicings : shapeSvs;

      const uniqueScales: UnifiedVoicing[] = [];
      const seen = new Set<string>();

      activeSvs.forEach(sv => {
        // Keep the full "Root Quality Shape" name for shapes (e.g. "F# Min Shape").
        // Previously the root was stripped here, so a PIANO shapes quiz showed the
        // correct answer rootless ("Min Shape") while every distractor — built from
        // buildHardcodedShapeVoicings — kept its root ("F# Dim 4 Shape"). Keeping the
        // root makes the correct answer match the distractor format and the guitar path.
        const nameToUse = sv.scaleName;
        if (!seen.has(nameToUse)) {
          seen.add(nameToUse);
          const pcMap = new Map<number, { role: string, formula: string }>();
          if (tab === 'shapes' && sv.degreeTokens && sv.degreeTokens.length && sv.rootPc != null) {
            // Build straight from the shape's INTENDED degree TOKENS (the canonical ≤4-note
            // set), not the hand-authored neck frets — so altered-dominant shapes show exactly
            // their intended tones even where the source fret data is imperfect, AND each note
            // keeps its declared degree spelling/colour (♯9 → '#2' → F𝄪/purple, not ♭3/G/blue).
            const TOK_IV: Record<string, number> = { 'R':0,'1':0,'b2':1,'2':2,'#2':3,'b3':3,'3':4,'b4':4,'4':5,'#4':6,'b5':6,'5':7,'#5':8,'b6':8,'6':9,'bb7':9,'b7':10,'7':11 };
            sv.degreeTokens.forEach(tok => {
              const iv = TOK_IV[tok];
              if (iv === undefined) return;
              const pc = (((sv.rootPc! + iv) % 12) + 12) % 12;
              pcMap.set(pc, { role: tok, formula: tok });
            });
          } else {
            sv.notes.forEach(n => {
              const midi = GS_MIDI[n.stringIdx] + n.fret;
              pcMap.set(midi % 12, { role: n.role, formula: n.formula });
            });
          }
          // Shapes lay out from the shape's OWN root so the root sits lowest and the diagram
          // reads root-up; scales stay rooted on the chord root.
          const baseRoot = (tab === 'shapes' && sv.rootPc != null) ? sv.rootPc : rootSemi;
          const startMidi = (octave + 1) * 12 + baseRoot;
          const pianoNotes: { note: number, role: string, formula: string }[] = [];
          for (const [pc, data] of pcMap) {
            let midi = Math.floor(startMidi / 12) * 12 + pc;
            if (midi < startMidi) midi += 12;
            if (midi >= 0 && midi <= 127) {
              pianoNotes.push({ note: midi, role: data.role, formula: data.formula });
            }
          }
          pianoNotes.sort((a, b) => a.note - b.note);
          if (pianoNotes.length > 0) {
            uniqueScales.push({
              name: nameToUse,
              chordLabel: displayChordName,
              notes: pianoNotes.map((s: any) => s.note),
              roles: pianoNotes.map((s: any) => s.role),
              formulas: pianoNotes.map((s: any) => s.formula),
              fingerprint: JSON.stringify(sv),
              categoryId: tab === 'scales' ? sv.scaleId : sv.scaleName,
              rootPc: tab === 'shapes' ? sv.rootPc : undefined,
            });
          }
        }
      });
      return uniqueScales;
    }

    if (tab === 'arps' || tab === 'intervals') {
      const subsets = tab === 'arps'
        ? getArpSubsets(ch.iv, ch.r, ch.f || [], rootSemi, nMode)
        : getIntervalSubsets(ch.iv, ch.r, ch.f || []);

      if (subsets.length > 0) {
        const startMidi = (octave + 1) * 12 + rootSemi;
        return subsets.map((subset, subsetIdx) => {
          const notes = (subset.ivs || []).map((iv: number) => startMidi + iv);
          return {
            name: subset.label || '',
            chordLabel: displayChordName,
            notes,
            roles: subset.roles || [],
            formulas: subset.formulaLabels || subset.roles || [],
            fingerprint: JSON.stringify({ subsetIdx, subset }),
            categoryId: subset.label || (tab === 'arps' ? 'Arpeggio' : 'Interval'),
          };
        });
      }
      return [];
    }

    const pV = buildPianoVoicings(rootSemi, chordType, octave, null, nMode);
    
    if (tab === 'block') {
      const notes = getChordNotes(rootSemi, chordType, octave);
      const rolesArr = notes.map(n => { const idx = ch.iv.findIndex(iv => (rootSemi + iv) % 12 === n % 12); return idx !== -1 ? ch.r[idx] : ''; });
      const formulasArr = notes.map(n => { const idx = ch.iv.findIndex(iv => (rootSemi + iv) % 12 === n % 12); return idx !== -1 ? ch.f[idx] : ''; });
      return [{ name: 'Root Position', chordLabel: ch.l, notes, roles: rolesArr, formulas: formulasArr }];
    }

    if (tab === 'triads') return pV.triads || [];
    if (tab === 'shells') return pV.shells || [];
    if (tab === 'drop2') return pV.drop2 || [];
    if (tab === 'drop3') return pV.drop3 || [];
    if (tab === 'drop2and4') return pV.drop2and4 || [];

    return [];
  };

  // ── Generate a new question ─────────────────────────────────
  const nextQuestion = useCallback(() => {
    try {
      stopSeqFlash();
      onStop();
      
      let finalRoot = 0;
      let finalType = 'maj7';
      let finalGuitarVoicing: Voicing | null = null;
      let finalPianoVoicing: UnifiedVoicing | null = null;
      let finalPool: string[] = [];
      let finalVoicingTab = 'block';
      // Tracks whether the guitar diagram will actually render something. Piano never
      // shows "No Voicings Found" (only the fretboard does), so it starts satisfied.
      let renderableGuitar = instrument !== 'guitar';

      // For shape questions: the display root is the SHAPE's own root (e.g. an "E Min Shape"
      // upper structure of G6 displays/colors from E), not the parent chord root — so the
      // diagram matches the answer name. Mirrors arpDisplayRoot below.
      let shapeDisplayRoot: number | null = null;
      // For arpeggio questions: the display root is the arpeggio's OWN identified chord
      // root (so its notes/colors/name are self-consistent), NOT the parent chord root.
      let arpDisplayRoot: number | null = null;
      let arpDisplayType: string | null = null; // arp's OWN identified chord type (re-rooted)
      let arpReveal = ''; // arp answer shown on reveal, incl. slash bass when inverted
      // Slash-bass info for the ANSWER CHOICES: when the displayed arp is inverted (lowest
      // shown note ≠ root) every option carries the same "/ bass" so it's quizzed on what's
      // seen and the slash isn't a giveaway. Empty/false when the arp is in root position.
      let arpBassName = '';
      let arpIsInverted = false;
      // Identify an arpeggio fragment as a COMPLETE chord and re-root its degrees to that
      // chord's own root, so e.g. A-C#-Eb reads as "A (♭5)" (A = root, C# = 3rd, Eb = ♭5)
      // instead of an enharmonic, ♭3-less "Eb ø7" spelled from the parent. Returns null for
      // fragments that don't form a complete chord (those are skipped entirely).
      const arpChordFor = (subsetIvs: number[], parentRoot: number) => {
        const pcs = subsetIvs.map(iv => (((parentRoot + iv) % 12) + 12) % 12);
        // Prefer naming from the parent's root so the full parent arpeggio keeps its name
        // (e.g. "B sus4", not the enharmonic "E sus2").
        const id = identifyCompleteChord(pcs, namingMode, undefined, parentRoot);
        if (!id) return null;
        const ch = CH[id.type];
        if (!ch) return null;
        const idxFor = (iv: number) => {
          const interval = (((((parentRoot + iv) % 12) - id.rootPc) % 12) + 12) % 12;
          return ch.iv.findIndex(c => (c % 12) === interval);
        };
        const roles = subsetIvs.map(iv => { const i = idxFor(iv); return i !== -1 ? ch.r[i] : ''; });
        const formulas = subsetIvs.map(iv => { const i = idxFor(iv); return i !== -1 ? (ch.f?.[i] || ch.r[i]) : ''; });
        return { rootPc: id.rootPc, type: id.type, name: id.name, roles, formulas };
      };

      setScaleVoicings([]);
      setArpVoicings([]);
      setShapeVoicings([]);
      setArpSubsets([]);
      setIntervalSubsets([]);
      setSafeArpSubsetIdx(0);
      setSafeIntervalSubsetIdx(0);

      // Free users are only quizzed on the free essentials, even if locked types linger in
      // the saved pool (the chip picker blocks adding them, but a pre-Pro pool may persist).
      const rawPool = activeTypes.length > 0 ? activeTypes : ALL_CHORD_KEYS;
      const freePool = rawPool.filter(isChordTypeFree);
      const basePool = isPro
        ? rawPool
        : (freePool.length > 0 ? freePool : ALL_CHORD_KEYS.filter(isChordTypeFree));
      const allowedVoicings = (instrument === 'piano'
        ? ['block', 'triads', 'shells', 'drop2', 'drop3', 'drop2and4', 'intervals', 'arps', 'shapes', 'scales']
        : ['open', 'barre', 'triads', 'shells', 'drop2', 'drop3', 'drop2and4', 'intervals', 'arps', 'shapes', 'scales'])
        // Free users are only quizzed on the freemium voicing families (block/open/barre/triads/
        // scales) — never the Pro shells/drops/arps/intervals/shapes, even if a pre-Pro pool persists.
        .filter(v => isPro || FREE_VOICING_TABS.has(v));
      
      const currentVoicingPool = activeVoicingTypes.filter(v => allowedVoicings.includes(v));
      // Honor "what works with what": only draw from voicing categories that at least
      // one of the active chord types actually supports (matches the hidden chips in
      // the quiz settings), so the quiz never burns retries on — or falls back away
      // from — an impossible chord+category combo. Triads always qualifies, so this is
      // never empty.
      const supportedVoicings = allowedVoicings.filter(v => anyTypeSupportsVoicingTab(v, instrument, basePool));
      const poolBase = currentVoicingPool.length > 0 ? currentVoicingPool : allowedVoicings;
      const supportedSelected = poolBase.filter(v => supportedVoicings.includes(v));
      const finalVoicingPool = supportedSelected.length > 0 ? supportedSelected : (supportedVoicings.length > 0 ? supportedVoicings : allowedVoicings);

      // Filter inversions based on chord type (triads don't support 3rd inversion)
      const isTriadType = (type: string) => {
        const ch = CH[type];
        return ch && ch.iv.length === 3;
      };

      // Tabs whose voicings have no inversion-named entries (barre, open, shells, drops,
      // scales, arps, intervals, shapes). For these, always use root position.
      const NO_INV_TABS = ['open','barre','shells','drop2','drop3','drop2and4','scales','arps','intervals','shapes'];

      // Determine valid inversions for the current chord type + voicing tab
      const getValidInversions = (chordType: string, tab: string) => {
        if (NO_INV_TABS.includes(tab)) return ['root'];
        // Exclude '3rd' for triads (no 4th tone) and for chords whose 4th tone is an
        // extension (add9/minAdd9 have iv[3]=14, the 9th) — same rule as inversionOfBass.
        const chDef = CH[chordType];
        const no3rd = isTriadType(chordType) || (chDef && chDef.iv.length >= 4 && chDef.iv[3] >= 12);
        if (no3rd) return activeInversions.filter(inv => inv !== '3rd');
        return activeInversions;
      };

      // Select random inversion from active pool (will be filtered after chord type is selected)
      let finalInversion = activeInversions.length > 0
        ? (pickRandom(activeInversions) as 'root' | '1st' | '2nd' | '3rd')
        : 'root';

      // Only enforce the inversion filter on voicing picks when the user has actually
      // RESTRICTED inversions. With all four enabled (the default) we leave voicing selection
      // exactly as before, so this change is a no-op for users who never touched the setting.
      const allInversionsEnabled = ['root', '1st', '2nd', '3rd'].every(i => activeInversions.includes(i));

      let found = false;
      for (let attempt = 0; attempt < 24; attempt++) {
        const root = Math.floor(Math.random() * 12);
        const chosenVoicingTab = pickRandom(finalVoicingPool);
        
        let tempPool = [...basePool];
        if (instrument === 'guitar') {
          tempPool = tempPool.filter(t => getGuitarVoicingsForTab(chosenVoicingTab, t, root, namingMode).length > 0);
        } else {
          tempPool = tempPool.filter(t => getPianoVoicingsForTab(chosenVoicingTab, t, root, namingMode).length > 0);
        }

        if (chosenVoicingTab === 'triads') {
          const TRIAD_KEYS = ['maj', 'min', 'aug', 'dim', 'sus4', 'sus2', 'maj_b5'];
          tempPool = tempPool.filter(t => TRIAD_KEYS.includes(t));

          // Verify that triad voicings actually exist for each chord type
          tempPool = tempPool.filter(t => {
            if (instrument === 'guitar') {
              const vcs = getGuitarVoicingsForTab('triads', t, root, namingMode);
              return vcs.length > 0;
            } else {
              const vcs = getPianoVoicingsForTab('triads', t, root, namingMode);
              return vcs.length > 0;
            }
          });
        }

        // When inversions are restricted, only accept chord types that can actually be SHOWN
        // in an allowed inversion for this tab — otherwise we'd later fall back to a wrong
        // inversion (e.g. "1st only" surfacing a 2nd-inversion sus4). Non-chord tabs
        // (scales/arps/intervals/shapes) have no inversion concept, so they're left alone.
        if (!allInversionsEnabled && !['scales', 'arps', 'intervals', 'shapes'].includes(chosenVoicingTab)) {
          if (chosenVoicingTab === 'block') {
            // block builds the inversion via applyInversion, but only up to (noteCount-1) — a
            // triad has no 3rd inversion. getValidInversions encodes that, so require it to
            // leave at least one allowed inversion for the type.
            tempPool = tempPool.filter(t => getValidInversions(t, 'block').length > 0);
          } else {
            // triads/shells/drops/open/barre ship pre-inverted voicings: keep types that have
            // one whose ACTUAL bass is an allowed inversion.
            tempPool = tempPool.filter(t => {
              const vcs = instrument === 'guitar'
                ? getGuitarVoicingsForTab(chosenVoicingTab, t, root, namingMode)
                : getPianoVoicingsForTab(chosenVoicingTab, t, root, namingMode);
              return vcs.some((v: any) => {
                const midis = instrument === 'guitar'
                  ? (v.frets || []).map((fr: any, str: number) => fr.fret !== null ? GS_MIDI[str] + (fr.fret as number) : null).filter((m: any): m is number => m !== null)
                  : (v.notes || []);
                return activeInversions.includes(inversionOfBass(midis, root, t));
              });
            });
          }
        }

        if (tempPool.length > 0) {
          finalRoot = root;
          finalType = pickRandom(tempPool);
          finalPool = tempPool;
          finalVoicingTab = chosenVoicingTab;

          // Spell this question by the ROOT's key (flats for A♭/E♭/… , sharps for E/A/…),
          // not the raw global toggle, so the diagram notes AND the answer label agree and a
          // flat-key chord/shape never shows enharmonic sharps. Used for every final build
          // below; the diagram re-derives names from questionNaming (set to the same value).
          const qNaming = preferredAccidentalForRoot(finalRoot, namingMode);

          // Filter inversion to be valid for the selected chord type + voicing tab
          const validInversions = getValidInversions(finalType, finalVoicingTab);
          finalInversion = validInversions.length > 0
            ? (pickRandom(validInversions) as 'root' | '1st' | '2nd' | '3rd')
            : 'root';

          found = true;
          
          if (instrument === 'guitar') {
            const vcs = getGuitarVoicingsForTab(finalVoicingTab, finalType, finalRoot, qNaming);
            if (['scales', 'shapes', 'arps', 'intervals'].includes(finalVoicingTab)) {
              finalGuitarVoicing = null;

              const rootNoteName = (qNaming === 'flat' ? NOTE_FLAT : NOTE_SHARP)[finalRoot];
              const displayChordName = `${rootNoteName} ${CH[finalType]?.s || ''}`;

              if (finalVoicingTab === 'scales') {
                const scaleIds = CHORD_SCALE_MAP[finalType] || [];
                const sVoicings = buildScaleVoicings(scaleIds, SCALES, finalRoot, CH[finalType].iv, qNaming);
                if (sVoicings.length > 0) {
                  const randBox = pickRandom(sVoicings);
                  setScaleVoicings([randBox]);
                  const uniqueMidis = Array.from(new Set(randBox.notes.map(n => GS_MIDI[n.stringIdx] + n.fret))).sort((a,b)=>a-b);
                  finalPianoVoicing = {
                    name: randBox.scaleName,
                    chordLabel: displayChordName,
                    notes: uniqueMidis,
                    roles: uniqueMidis.map(midi => { const match = randBox.notes.find(n => GS_MIDI[n.stringIdx] + n.fret === midi); return match ? match.role : ''; }),
                    formulas: uniqueMidis.map(midi => { const match = randBox.notes.find(n => GS_MIDI[n.stringIdx] + n.fret === midi); return match ? match.formula : ''; }),
                    categoryId: randBox.scaleId,
                  };
                  renderableGuitar = true;
                }
              } else if (finalVoicingTab === 'shapes') {
                // selfRooted: color/spell each shape from its own root (see getPianoVoicingsForTab).
                // Global namingMode as fallback so F♯/G♭ + C shapes match the diagram's spelling.
                const shapeSvs = buildHardcodedShapeVoicings(finalType, finalRoot, namingMode, false, true);
                if (shapeSvs.length > 0) {
                  const randBox = pickRandom(shapeSvs);
                  setShapeVoicings([randBox]);
                  shapeDisplayRoot = randBox.rootPc ?? null;
                  // Order the shape's notes low→high by pitch so the arpeggiated flash/audio
                  // climbs linearly up the diagram (lowest note to highest), matching scales,
                  // arps and intervals. (An earlier by-scale-degree sort made the sequence
                  // jump around the neck.)
                  const uniqueMidis = Array.from(new Set(randBox.notes.map(n => GS_MIDI[n.stringIdx] + n.fret))).sort((a, b) => a - b);
                  finalPianoVoicing = {
                    name: randBox.boxName,
                    chordLabel: displayChordName,
                    notes: uniqueMidis,
                    roles: uniqueMidis.map(midi => { const match = randBox.notes.find(n => GS_MIDI[n.stringIdx] + n.fret === midi); return match ? match.role : ''; }),
                    formulas: uniqueMidis.map(midi => { const match = randBox.notes.find(n => GS_MIDI[n.stringIdx] + n.fret === midi); return match ? match.formula : ''; }),
                    categoryId: randBox.scaleName,
                    rootPc: randBox.rootPc,
                  };
                  renderableGuitar = true;
                }
              } else if (finalVoicingTab === 'arps' || finalVoicingTab === 'intervals') {
                const isArp = finalVoicingTab === 'arps';
                let subsets = isArp
                  ? getArpSubsets(CH[finalType].iv, CH[finalType].r, CH[finalType].f || [], finalRoot, namingMode)
                  : getIntervalSubsets(CH[finalType].iv, CH[finalType].r, CH[finalType].f || []);
                // Arps: only ask about fragments that form a COMPLETE chord, named + colored +
                // spelled from their OWN root (self-consistent). Fragments that don't form a
                // real chord are skipped — they produce ambiguous, mislabeled questions.
                if (isArp) {
                  subsets = subsets.filter(s => arpChordFor(s.ivs, finalRoot) !== null);
                }

                if (subsets.length > 0) {
                  const subsetIdx = Math.floor(Math.random() * subsets.length);
                  const subset = subsets[subsetIdx];
                  const arp = isArp ? arpChordFor(subset.ivs, finalRoot) : null;
                  // Re-root the fragment to its own chord so the diagram colors/spelling match
                  // the answer name. arpDisplayRoot drives the diagram's root (set below).
                  const subRoles = arp ? arp.roles : subset.roles;
                  const subFormulas = arp ? arp.formulas : subset.formulaLabels;
                  if (arp) {
                    arpDisplayRoot = arp.rootPc;
                    arpDisplayType = arp.type;
                    subset.chordName = arp.name; subset.label = arp.name;
                    subset.roles = arp.roles; subset.formulaLabels = arp.formulas;
                  }
                  if (isArp) {
                    setArpSubsets(subsets);
                    setSafeArpSubsetIdx(subsetIdx);
                  } else {
                    setIntervalSubsets(subsets);
                    setSafeIntervalSubsetIdx(subsetIdx);
                  }

                  // Build the arpeggio/interval ON THE GUITAR NECK from the chord's parent
                  // scale boxes (mirrors PlayScreen) so the fretboard diagram renders.
                  const scaleIds = CHORD_SCALE_MAP[finalType] || [];
                  const parentBoxes = buildScaleVoicings(scaleIds, SCALES, finalRoot, CH[finalType].iv, namingMode);
                  const diagramName = isArp ? (arp?.name || displayChordName) : `${subset.label} Interval`;
                  const builtArps = buildArpVoicings(parentBoxes, finalRoot, subset.ivs, subRoles, subFormulas, diagramName);
                  setArpVoicings(builtArps);
                  setScaleVoicings(parentBoxes);
                  // The fretboard arp/interval diagram renders from builtArps — if it
                  // came back empty (no parent scale boxes), this is not renderable.
                  renderableGuitar = builtArps.length > 0;

                  // Answer = the COMPLETE chord the arp fragment spells, named from its own
                  // root. Intervals keep their interval-name label.
                  const answerName = isArp ? (arp?.name || displayChordName) : (subset.label || '');
                  const startMidi = (octave + 1) * 12 + finalRoot;
                  const notes = (subset.ivs || []).map((iv: number) => startMidi + iv);
                  finalPianoVoicing = {
                    name: answerName,
                    chordLabel: displayChordName,
                    notes,
                    roles: subRoles || [],
                    formulas: subFormulas || subRoles || [],
                    categoryId: answerName || (isArp ? 'Arpeggio' : 'Interval'),
                  };
                  // Reveal label: chord name + slash bass when the lowest displayed note isn't
                  // the root (guitar uses the shown box's lowest note; piano the arp's lowest
                  // pitch). Inversion info only — never put in the answer choices.
                  if (isArp && arp) {
                    const arpMidis = instrument === 'guitar'
                      ? (builtArps[0]?.notes || []).map((n: any) => GS_MIDI[n.stringIdx] + n.fret)
                      : notes;
                    const rootPc = (((arp.rootPc % 12) + 12) % 12);
                    const bassPc = arpMidis.length ? (Math.min(...arpMidis) % 12) : rootPc;
                    arpIsInverted = bassPc !== rootPc;
                    arpBassName = (namingMode === 'flat' ? NOTE_FLAT : NOTE_SHARP)[bassPc];
                    arpReveal = arpIsInverted ? `${arp.name} / ${arpBassName}` : arp.name;
                  }
                }
              }
            } else {
              let guitarVcs = vcs.length > 0 ? vcs : [];
              // Keep only voicings whose ACTUAL bass matches an allowed inversion (root/1st/
              // 2nd/3rd per the user's setting). This is what makes "root position only"
              // actually exclude inverted grips — the old code only filtered when the picked
              // inversion was non-root, so root-only let any inversion through. Fall back to
              // the full set if nothing matches (e.g. drop voicings, which are never root).
              if (guitarVcs.length > 0 && !allInversionsEnabled) {
                const allowed = guitarVcs.filter(v => {
                  const midis = (v.frets || []).map((fr: any, str: number) => fr.fret !== null ? GS_MIDI[str] + (fr.fret as number) : null).filter((m: any): m is number => m !== null);
                  return activeInversions.includes(inversionOfBass(midis, finalRoot, finalType));
                });
                if (allowed.length > 0) guitarVcs = allowed;
              }
              finalGuitarVoicing = guitarVcs.length > 0 ? pickRandom(guitarVcs) : (vcs.length > 0 ? pickRandom(vcs) : null);
              // Sync inversion to the actual voicing so the label matches the displayed bass note
              if (finalGuitarVoicing) {
                finalInversion = guitarVoicingInversion(finalGuitarVoicing.frets, finalRoot, finalType);
              }
              renderableGuitar = !!finalGuitarVoicing;
            }
          } else {
            let vcs = getPianoVoicingsForTab(finalVoicingTab, finalType, finalRoot, qNaming);
            // Tabs like triads/shells/drops ship voicings that are already inverted (the bass
            // is baked in), so honor the user's inversion setting by keeping only voicings
            // whose ACTUAL bass matches an allowed inversion. (block builds inversions via
            // applyInversion below, so it's left alone.) Fall back to the full set if nothing
            // matches. This is what makes "root position only" actually exclude inverted grips.
            if (finalVoicingTab !== 'block' && !['scales', 'arps', 'intervals', 'shapes'].includes(finalVoicingTab) && vcs.length > 0 && !allInversionsEnabled) {
              const allowed = vcs.filter(v => activeInversions.includes(inversionOfBass(v.notes || [], finalRoot, finalType)));
              if (allowed.length > 0) vcs = allowed;
            }
            let pianoVc = vcs.length > 0 ? pickRandom(vcs) : null;
            // Apply inversion ONLY for 'block', which ships a single root-position voicing that
            // we invert here. triads/shells/drops already SHIP inverted voicings (and the filter
            // above already selected one matching the user's inversion) — inverting those again
            // would double-invert (e.g. a 1st-inversion triad → 2nd inversion), which is the bug
            // that surfaced the b5 in the bass under "1st only".
            if (pianoVc && pianoVc.notes && finalInversion !== 'root' && finalVoicingTab === 'block') {
              const invertedNotes = applyInversion(pianoVc.notes, finalInversion);
              // CRITICAL: applyInversion REORDERS notes (moves the bass up an octave and
              // re-sorts), so the original roles/formulas arrays — which are positional —
              // no longer line up with notes[i]. The diagram derives each key's name from
              // formulas[i] (spellInterval), so a stale order mislabels every key
              // ("A" shows as "F"). Rebuild roles/formulas from each inverted note's pitch
              // class so notes[i] ↔ roles[i] ↔ formulas[i] stay aligned.
              const invCh = CH[finalType];
              const invRoles = invertedNotes.map(n => {
                const i = invCh ? invCh.iv.findIndex((iv: number) => (finalRoot + iv) % 12 === n % 12) : -1;
                return i !== -1 ? invCh.r[i] : '';
              });
              const invFormulas = invertedNotes.map(n => {
                const i = invCh ? invCh.iv.findIndex((iv: number) => (finalRoot + iv) % 12 === n % 12) : -1;
                return i !== -1 ? (invCh.f?.[i] || invCh.r[i]) : '';
              });
              finalPianoVoicing = {
                ...pianoVc,
                notes: invertedNotes,
                roles: invRoles,
                formulas: invFormulas,
              };
              // Sync finalInversion to the actual bass — applyInversion may silently
              // fall back to root position when shifts >= notes.length (e.g. 3rd inv
              // on a 3-note voicing).
              const sortedInv = [...invertedNotes].sort((a, b) => a - b);
              const bassPC = ((sortedInv[0] % 12) - finalRoot + 12) % 12;
              const bassIdx = CH[finalType]?.iv.findIndex((iv: number) => iv % 12 === bassPC) ?? -1;
              if (bassIdx <= 0) finalInversion = 'root';
              else if (bassIdx === 1) finalInversion = '1st';
              else if (bassIdx === 2) finalInversion = '2nd';
              else finalInversion = '3rd';
            } else {
              finalPianoVoicing = pianoVc;
            }
          }
          break;
        }
      }

      if (!found) {
        finalRoot = Math.floor(Math.random() * 12);
        finalType = basePool.includes('maj7') ? 'maj7' : basePool[0] || 'maj';
        finalVoicingTab = instrument === 'piano' ? 'block' : 'open';
        
        if (instrument === 'guitar') {
          const vcs = getGuitarVoicingsForTab('open', finalType, finalRoot, namingMode);
          finalGuitarVoicing = vcs.length > 0 ? pickRandom(vcs) : null;
          if (finalGuitarVoicing) {
            finalInversion = guitarVoicingInversion(finalGuitarVoicing.frets, finalRoot, finalType);
          }
          renderableGuitar = !!finalGuitarVoicing;
        } else {
          const vcs = getPianoVoicingsForTab('block', finalType, finalRoot, namingMode);
          finalPianoVoicing = vcs.length > 0 ? pickRandom(vcs) : null;
        }
      }

      // ── Guarantee a renderable guitar diagram ───────────────────────────────
      // No combination of root / type / voicing tab may leave the fretboard empty
      // ("No Voicings Found"). If the chosen question produced nothing displayable
      // (e.g. an arp subset that spells no nameable chord, a tab with no parent
      // scale boxes, or a chord type lacking the chosen voicing), fall back to a
      // concrete chord voicing — barre/open maj7 exists for every root, so this
      // always resolves.
      if (instrument === 'guitar' && !renderableGuitar) {
        setScaleVoicings([]); setArpVoicings([]); setShapeVoicings([]);
        setArpSubsets([]); setIntervalSubsets([]);
        setSafeArpSubsetIdx(0); setSafeIntervalSubsetIdx(0);
        finalPianoVoicing = null;

        const CONCRETE_TABS = ['barre', 'open', 'triads', 'shells', 'drop2', 'drop3', 'drop2and4'];
        const SAFE_TYPES = [finalType, 'maj7', 'min7', 'dom7', 'maj', 'min'];
        let picked: Voicing | null = null;
        let pickedTab = 'barre';
        let pickedRoot = finalRoot;
        let pickedType = finalType;
        outer:
        for (const ty of SAFE_TYPES) {
          if (!CH[ty]) continue;
          for (const tb of CONCRETE_TABS) {
            for (let r = 0; r < 12; r++) {
              const root = (finalRoot + r) % 12;
              const vcs = getGuitarVoicingsForTab(tb, ty, root, namingMode);
              if (vcs.length > 0) {
                picked = pickRandom(vcs); pickedTab = tb; pickedRoot = root; pickedType = ty;
                break outer;
              }
            }
          }
        }
        if (picked) {
          finalGuitarVoicing = picked;
          finalRoot = pickedRoot;
          finalType = pickedType;
          finalVoicingTab = pickedTab;
          finalInversion = guitarVoicingInversion(picked.frets, finalRoot, finalType);
          finalPool = [finalType];
          renderableGuitar = true;
        }
      }

      let category: 'chord' | 'scale' | 'arp' | 'interval' | 'shape' = 'chord';
      if (finalVoicingTab === 'scales') category = 'scale';
      else if (finalVoicingTab === 'arps') category = 'arp';
      else if (finalVoicingTab === 'intervals') category = 'interval';
      else if (finalVoicingTab === 'shapes') category = 'shape';

      // Shapes display/color from their OWN root (piano path carries it on the voicing; the
      // guitar branch set it above). Falls back to finalRoot for base shapes / older paths.
      if (category === 'shape' && finalPianoVoicing?.rootPc != null) {
        shapeDisplayRoot = finalPianoVoicing.rootPc;
      }

      const catId = finalPianoVoicing?.categoryId ?? '';

      // Extract actual MIDI notes from the voicing for audio mode filtering
      let playedNotes: number[] = [];
      if (quizMode === 'audio') {
        if (activeQuizInstrument === 'piano' && finalPianoVoicing) {
          playedNotes = finalPianoVoicing.notes || [];
        } else if (activeQuizInstrument === 'guitar' && finalGuitarVoicing && finalGuitarVoicing.frets) {
          finalGuitarVoicing.frets.forEach((fret, str) => {
            if (fret.fret !== null) {
              playedNotes.push(GS_MIDI[str] + fret.fret);
            }
          });
        }
        if (playedNotes.length === 0) {
          playedNotes = getChordNotes(finalRoot, finalType, octave);
        }

        // In audio chord mode, ensure the correct answer matches what was actually heard
        if (category === 'chord') {
          let audibleType = findAudibleChordType(finalRoot, playedNotes, basePool);
          if (!audibleType) {
            audibleType = findSimplestContainedChordType(finalRoot, playedNotes, basePool);
          }
          if (audibleType && audibleType !== finalType) {
            finalType = audibleType;
            const rootNoteName = (preferredAccidentalForRoot(finalRoot, namingMode) === 'flat' ? NOTE_FLAT : NOTE_SHARP)[finalRoot];
            const newLabel = `${rootNoteName} ${CH[finalType]?.s || ''}`;
            if (finalPianoVoicing) {
              finalPianoVoicing = {
                ...finalPianoVoicing,
                name: CH[finalType]?.s || finalType,
                chordLabel: newLabel,
              };
            }
            if (finalGuitarVoicing) {
              finalGuitarVoicing = {
                ...finalGuitarVoicing,
                chordLabel: newLabel,
              };
            }
          }
        }
      }

      // Per-question spelling, driven by the root's key (see preferredAccidentalForRoot) so a
      // flat-key chord/shape/scale reads with flats (A♭ C♭ E♭) instead of enharmonic sharps,
      // and the diagram matches the answer label (both built with this same value above via
      // qNaming). Arps/intervals re-root to their OWN chord and spell themselves, so they keep
      // the user's namingMode to stay consistent with their separately-built labels.
      const questionNaming: 'sharp' | 'flat' = (category === 'arp' || category === 'interval')
        ? namingMode
        : preferredAccidentalForRoot(shapeDisplayRoot ?? finalRoot, namingMode);

      // Slash bass for the answer + all options, derived from the ACTUAL displayed voicing's
      // lowest note (not the inversion enum). A drop2 voicing — or any 5+ note chord like
      // 7#5#9 — can sit on a non-root tone, including an extension the root/1st/2nd/3rd enum
      // can't represent; reading the real bass keeps the slash correct. null = root in bass.
      let finalBassNote: string | null = null;
      if (category === 'chord') {
        let displayedMidis: number[] = [];
        if (finalPianoVoicing?.notes?.length) {
          displayedMidis = finalPianoVoicing.notes;
        } else if (finalGuitarVoicing?.frets) {
          finalGuitarVoicing.frets.forEach((fr, str) => { if (fr.fret !== null) displayedMidis.push(GS_MIDI[str] + (fr.fret as number)); });
        }
        if (displayedMidis.length) {
          const bassPc = ((Math.min(...displayedMidis) % 12) + 12) % 12;
          const rootPc = ((finalRoot % 12) + 12) % 12;
          if (bassPc !== rootPc) {
            const ch = CH[finalType];
            const ivMatch = ch ? ch.iv.findIndex((iv: number) => (finalRoot + iv) % 12 === bassPc) : -1;
            const bf = ivMatch !== -1 ? ch?.f?.[ivMatch] : undefined;
            finalBassNote = bf
              ? spellInterval(finalRoot, bf, questionNaming === 'flat')
              : (questionNaming === 'flat' ? NOTE_FLAT : NOTE_SHARP)[bassPc];
          }
        }
      }

      let opts: { root: number; type: string; label: string }[] = [];
      let cIdxs: number[] = [];

      // FIX 1: Generate dynamic, accurate pools based on actual shapes/arps available, ensuring cIdx is never -1
      if (category === 'chord') {
        let optsPool = finalPool.length >= 4 ? finalPool : basePool;
        if (finalVoicingTab === 'triads') {
          const TRIAD_KEYS = ['maj', 'min', 'aug', 'dim', 'sus4', 'sus2', 'maj_b5'];
          optsPool = optsPool.filter(t => TRIAD_KEYS.includes(t));
          if (optsPool.length < 4) optsPool = TRIAD_KEYS;
        }
        if (optsPool.length < 4) optsPool = ALL_CHORD_KEYS;
        opts = buildOptions(finalRoot, finalType, optsPool, quizMode, questionNaming, playedNotes, finalInversion, finalBassNote);
        cIdxs = [opts.findIndex(o => o.root === finalRoot && o.type === finalType)];

        // Fallback: if correct answer not found, force it to be the first option
        if (cIdxs[0] === -1) {
          opts[0] = { root: finalRoot, type: finalType, label: CH[finalType]?.s || finalType };
          cIdxs = [0];
        }
      } else if (category === 'scale') {
        // Prefix every scale label with its starting (root) note, e.g. "C Whole Tone",
        // so students see the scale's root, not just its quality. Matching still keys off
        // the scaleId (the option's `type`), so the prefix is display-only.
        const scaleRootName = (questionNaming === 'flat' ? NOTE_FLAT : NOTE_SHARP)[finalRoot];
        const scaleLabel = (id: string) => `${scaleRootName} ${SCALES[id]?.name || id}`;
        const scaleIds = CHORD_SCALE_MAP[finalType] || [];
        let scalePool = scaleIds.map(id => ({ key: id, label: scaleLabel(id) }));
        // Ensure at least 4 options by adding other scales from the full SCALES object
        if (scalePool.length < 4) {
          const allScaleIds = Object.keys(SCALES);
          const additionalScales = allScaleIds
            .filter(id => !scalePool.some(sp => sp.key === id))
            .map(id => ({ key: id, label: scaleLabel(id) }));
          scalePool = [...scalePool, ...additionalScales];
        }
        const correctScaleLabel = `${scaleRootName} ${finalPianoVoicing?.name ?? (SCALES[catId]?.name || catId)}`;
        opts = buildCategoryOptions(catId, correctScaleLabel, scalePool);
        cIdxs = [opts.findIndex(o => o.type === catId)];

        // Fallback: if correct answer not found, force it to be the first option
        if (cIdxs[0] === -1) {
          opts[0] = { root: 0, type: catId, label: correctScaleLabel };
          cIdxs = [0];
        }
      } else if (category === 'arp') {
        // Answer + distractors are the CHORD NAMES the arpeggio subsets spell
        // (root + quality), never formula numbers like "3-5-7".
        const arpPool: { key: string; label: string }[] = [];
        const arpSeen = new Set<string>([catId]);
        // When the displayed arp is inverted, every choice carries the same slash bass so
        // the question is graded on what's shown and the slash can't give the answer away.
        const arpSlash = arpIsInverted ? ` / ${arpBassName}` : '';
        const addName = (nm: string | null | undefined) => {
          if (nm && !arpSeen.has(nm)) { arpSeen.add(nm); arpPool.push({ key: nm, label: `${nm}${arpSlash}` }); }
        };
        getArpSubsets(CH[finalType].iv, CH[finalType].r, CH[finalType].f || [], finalRoot, namingMode)
          .forEach(s => addName(arpChordFor(s.ivs, finalRoot)?.name));
        for (const ct of basePool) {
          if (arpPool.length >= 15) break;
          getArpSubsets(CH[ct].iv, CH[ct].r, CH[ct].f || [], finalRoot, namingMode).forEach(s => addName(arpChordFor(s.ivs, finalRoot)?.name));
        }
        // Pad to >=4 with plain chord-quality names at the question root (still chord names, never formulas).
        if (arpPool.length < 4) {
          const rootName = (namingMode === 'flat' ? NOTE_FLAT : NOTE_SHARP)[finalRoot];
          for (const ct of (basePool.length >= 4 ? basePool : ALL_CHORD_KEYS)) {
            addName(CH[ct] ? `${rootName} ${CH[ct].s}` : null);
            if (arpPool.length >= 4) break;
          }
        }
        opts = buildCategoryOptions(catId, `${catId}${arpSlash}`, arpPool);
        cIdxs = [opts.findIndex(o => o.type === catId)];

        // Fallback: if correct answer not found, force it to be the first option
        if (cIdxs[0] === -1) {
          opts[0] = { root: 0, type: catId, label: `${catId}${arpSlash}` };
          cIdxs = [0];
        }
      } else if (category === 'interval') {
        const ch = CH[finalType];
        const intervalPool: {key: string, label: string}[] = [];
        const seenIntervals = new Set<string>();
        for (let i = 0; i < ch.iv.length - 1; i++) {
          for (let j = i + 1; j < ch.iv.length; j++) {
            const st = Math.abs(ch.iv[j] - ch.iv[i]);
            const intNames = ['P1','m2','M2','m3','M3','P4','TT','P5','m6','M6','m7','M7','P8','m9','M9','m10','M10','P11','aug11','P12','m13','M13'];
            const intLabel = intNames[st] || `${st}st`;
            if (!seenIntervals.has(intLabel)) {
              seenIntervals.add(intLabel);
              intervalPool.push({ key: intLabel, label: intLabel });
            }
          }
        }
        // Ensure at least 4 options by adding common intervals if needed
        if (intervalPool.length < 4) {
          const commonIntervals = ['P5', 'M3', 'm3', 'P4', 'M6', 'm6', 'M7', 'm7', 'TT', 'M2', 'm2'];
          for (const ci of commonIntervals) {
            if (!seenIntervals.has(ci)) {
              seenIntervals.add(ci);
              intervalPool.push({ key: ci, label: ci });
            }
            if (intervalPool.length >= 4) break;
          }
        }
        opts = buildCategoryOptions(catId, catId, intervalPool);
        cIdxs = [opts.findIndex(o => o.type === catId)];

        // Fallback: if correct answer not found, force it to be the first option
        if (cIdxs[0] === -1) {
          opts[0] = { root: 0, type: catId, label: catId };
          cIdxs = [0];
        }
      } else if (category === 'shape') {
        const allShapeSvs = buildHardcodedShapeVoicings(finalType, finalRoot, questionNaming);
        const isGuitarShapes = instrument === 'guitar';
        const rawShapeNames = Array.from(new Set(allShapeSvs.map(s => s.scaleName)));

        // Fallback: if no shapes exist, switch to chord category
        if (rawShapeNames.length === 0) {
          category = 'chord';
          finalVoicingTab = 'block';
          let optsPool = finalPool.length >= 4 ? finalPool : basePool;
          if (finalVoicingTab === 'triads') {
            const TRIAD_KEYS = ['maj', 'min', 'aug', 'dim', 'sus4', 'sus2', 'maj_b5'];
            optsPool = optsPool.filter(t => TRIAD_KEYS.includes(t));
            if (optsPool.length < 4) optsPool = TRIAD_KEYS;
          }
          if (optsPool.length < 4) optsPool = ALL_CHORD_KEYS;
          opts = buildOptions(finalRoot, finalType, optsPool, quizMode, questionNaming, playedNotes, finalInversion, finalBassNote);
          cIdxs = [opts.findIndex(o => o.root === finalRoot && o.type === finalType)];
          if (cIdxs[0] === -1) {
            opts[0] = { root: finalRoot, type: finalType, label: CH[finalType]?.s || finalType };
            cIdxs = [0];
          }
        } else {
          // Visual mode keeps the root ("E Min Shape"); audio mode drops it ("Min Shape").
          const shapeLabelFor = (nm: string) => quizMode === 'visual' ? nm : nm.replace(/^[A-G][#♯b♭]?\s+/, '');
          const correctLabel = shapeLabelFor(catId);
          const seenKeys = new Set<string>([catId]);
          // Dedupe by DISPLAYED label too, so audio mode never shows two identical choices.
          const seenLabels = new Set<string>([correctLabel]);
          const shapePool: { key: string; label: string }[] = [];
          const addShape = (nm: string) => {
            if (!nm || seenKeys.has(nm)) return;
            const lbl = shapeLabelFor(nm);
            if (seenLabels.has(lbl)) return;
            seenKeys.add(nm); seenLabels.add(lbl);
            shapePool.push({ key: nm, label: lbl });
          };
          rawShapeNames.forEach(addShape);
          // Pad distractors with shape names from other chord types at the same root:
          // first from the active pool (most relevant), then from ALL chord types so
          // there are always ≥4 choices even when only one chord type is enabled.
          for (const ct of basePool) {
            if (shapePool.length >= 12) break;
            buildHardcodedShapeVoicings(ct, finalRoot, questionNaming).forEach(s => addShape(s.scaleName));
          }
          if (shapePool.length < 3) {
            for (const ct of ALL_CHORD_KEYS) {
              if (shapePool.length >= 12) break;
              buildHardcodedShapeVoicings(ct, finalRoot, questionNaming).forEach(s => addShape(s.scaleName));
            }
          }
          opts = buildCategoryOptions(catId, correctLabel, shapePool);
          cIdxs = [opts.findIndex(o => o.type === catId)];

          // Fallback: if correct answer not found, force it to be the first option
          if (cIdxs[0] === -1) {
            opts[0] = { root: 0, type: catId, label: correctLabel };
            cIdxs = [0];
          }
        }
      }

      // Pitch classes actually shown for this question — used to mark every
      // option whose chord contains all of them as a valid answer.
      let shownPcs: number[] = [];
      if (category === 'chord') {
        if (instrument === 'guitar' && finalGuitarVoicing?.frets) {
          finalGuitarVoicing.frets.forEach((fr, str) => {
            if (fr.fret !== null) shownPcs.push((GS_MIDI[str] + fr.fret) % 12);
          });
        } else if (finalPianoVoicing?.notes) {
          shownPcs = finalPianoVoicing.notes.map(n => n % 12);
        }
        if (shownPcs.length === 0) {
          shownPcs = getChordNotes(finalRoot, finalType, octave).map(n => n % 12);
        }
      }

      // Mark every option that is genuinely correct (handles cases where two
      // choices name the same chord / scale / arp / interval / shape).
      cIdxs = expandCorrectIdxs(opts, cIdxs, category, shownPcs);

      setQuestionVoicingTab(finalVoicingTab);
      setGuitarVoicing(finalGuitarVoicing);
      setPianoVoicing(finalPianoVoicing);
      setQuizCategory(category);

      // Arps display from the arpeggio's own chord root, and shapes from the shape's own root,
      // so colors/spelling are self-consistent with the answer; else the actual question root.
      setQuestionRoot(arpDisplayRoot ?? shapeDisplayRoot ?? finalRoot);
      // Keep type paired with the displayed root: arps spell/color from their OWN identified
      // chord (root + type), never the parent — so any root+type fallback stays self-consistent.
      setQuestionType(arpDisplayType ?? finalType);
      setQuestionInversion(finalInversion);
      setQuestionNaming(questionNaming);
      setArpRevealLabel(arpReveal);
      setOptions(opts);
      setCorrectIdxs(cIdxs);
      setAnswered(null);
      setChosenIdx(null);
      setRevealed(false);
      setActiveQuizInstrument(instrument);
    } catch (e) {
      // Silently handle errors to prevent quiz crashes
    }
  }, [activeTypes, quizMode, namingMode, onStop, instrument, activeVoicingTypes, activeInversions]);

  useEffect(() => {
    nextQuestion();
  }, [quizMode, instrument, namingMode, activeVoicingTypes, activeInversions, nextQuestion]);

  const autoPlayNext = useRef(false);

  // Guards Reveal / Next against spam-tapping. While a transition is in flight (the heavy
  // nextQuestion() retry loop, or the reveal's score+replay) further taps are dropped, so a burst
  // can't queue extra runs that keep firing after the finger lifts — and Reveal can't double-count
  // the score or double-trigger playback. The lock is held a short time PAST the work (trailing
  // timeout) to swallow the touch events that buffered while the JS thread was busy.
  const advancingRef = useRef(false);
  const advanceReleaseRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const perfNextRef = useRef(0);
  // [PERF] true press -> next-question-painted latency on-device. TEMP instrumentation.
  useEffect(() => {
    const p = perfNextRef.current; if (!p) return; perfNextRef.current = 0;
    requestAnimationFrame(() => console.log('[PERF] quiz next', Math.round(performance.now() - p) + 'ms to paint'));
  }, [options]);

  // Scale/Arp/Interval/Shape questions can only arpeggiate (never block), so force
  // arp playback for them regardless of the user's `arp` setting.
  const forceArpThisQ = arp || quizCategory !== 'chord';

  // Force the header arp toggle to show/lock arpeggio during those questions,
  // reverting on chord questions. useFocusEffect (not a plain isFocused effect) so
  // it re-asserts on every (re)focus despite freezeOnBlur; App.tsx's 'blur' listener
  // clears it when leaving the screen.
  useFocusEffect(
    useCallback(() => { setArpForced(quizCategory !== 'chord'); }, [quizCategory, setArpForced])
  );

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    if (autoPlayNext.current && questionType && CH[questionType] && !isSettingsOpen) {
      timer = setTimeout(() => {
        const notesToPlay = (quizCategory === 'arp' || quizCategory === 'interval')
          ? [...activeMidiNotes].sort((a, b) => a - b)
          : activeMidiNotes;
        onPlay(notesToPlay, { guitar: activeQuizInstrument === 'guitar', forceArp: forceArpThisQ });
        setPlayPulse((p) => p + 1);
        if (forceArpThisQ) {
          fireSeqFlash(notesToPlay);
        } else {
          pianoRef.current?.flashAll(notesToPlay);
          fretboardRef.current?.flashAll(notesToPlay);
        }
      }, 200);
      autoPlayNext.current = false;
    }
    return () => { if (timer) clearTimeout(timer); };
  }, [options]);

  const replay = () => {
    stopSeqFlash();
    if (activeQuizInstrument === 'piano') pianoRef.current?.recenter();
    // Arps and intervals always play low→high so the sequence is pedagogically clear.
    const notesToPlay = (quizCategory === 'arp' || quizCategory === 'interval')
      ? [...activeMidiNotes].sort((a, b) => a - b)
      : activeMidiNotes;
    onPlay(notesToPlay, { guitar: activeQuizInstrument === 'guitar', forceArp: forceArpThisQ });
    setPlayPulse((p) => p + 1);
    if (forceArpThisQ) {
      fireSeqFlash(notesToPlay);
    } else {
      pianoRef.current?.flashAll(notesToPlay);
      fretboardRef.current?.flashAll(notesToPlay);
    }
  };

  // ── Answer handler ──────────────────────────────────────────
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const correctScaleAnim = useRef(new Animated.Value(1)).current;

  const handleAnswer = (idx: number) => {
    if (answered) return;
    const correct = correctIdxs.includes(idx);
    
    setAnswered(correct ? 'correct' : 'wrong');
    setChosenIdx(idx);
    setRevealed(true);

    if (correct) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Animated.sequence([
        Animated.timing(correctScaleAnim, { toValue: 1.08, duration: 120, useNativeDriver: true }),
        Animated.timing(correctScaleAnim, { toValue: 1, duration: 150, useNativeDriver: true }),
      ]).start();
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Animated.sequence([
        Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: 6, duration: 50, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: -6, duration: 50, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
      ]).start();
    }
    
    requestAnimationFrame(() => {
      incrementQuiz(correct);
      const notesToPlay = (quizCategory === 'arp' || quizCategory === 'interval')
        ? [...activeMidiNotes].sort((a, b) => a - b)
        : activeMidiNotes;
      onPlay(notesToPlay, { guitar: activeQuizInstrument === 'guitar', forceArp: forceArpThisQ });
      if (forceArpThisQ) {
        fireSeqFlash(notesToPlay);
      } else {
        pianoRef.current?.flashAll(notesToPlay);
        fretboardRef.current?.flashAll(notesToPlay);
      }
    });
  };

  const rootName = questionNaming === 'flat' ? NOTE_FLAT[questionRoot] : NOTE_SHARP[questionRoot];
  const accuracy = quizTotal > 0 ? Math.round((quizScore / quizTotal) * 100) : null;

  const fretboardGroup: any = useMemo(() => guitarVoicing ? [{
    label: 'Quiz',
    stringNums: '012345',
    voicings: [{
      name: 'Quiz',
      frets: guitarVoicing.frets.map(f => ({ ...f, role: f.role || '' })),
      type: guitarVoicing.type,
      capo: guitarVoicing.capo,
    }]
  }] : [], [guitarVoicing]);

  const isFretboardSpecialMode = ['scales', 'shapes', 'arps', 'intervals'].includes(questionVoicingTab);

  return (
    <View style={[styles.safe, { backgroundColor: t.bg2 }]}>
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 0, flexGrow: quizMode === 'audio' ? 1 : undefined }}>

        {/* Compact Score Panel */}
        <View style={[styles.compactScore, { backgroundColor: t.bg2, borderColor: t.border }]}>
          <View style={styles.scoreItem}>
            <Text style={[styles.scoreVal, { color: t.txt1 }]}>{quizScore}/{quizTotal}</Text>
            <Text style={[styles.scoreLbl, { color: t.txt3 }]}>SCORE</Text>
          </View>
          <View style={[styles.scoreDivider, { backgroundColor: t.border }]} />
          <View style={styles.scoreItem}>
            <Text style={[styles.scoreVal, { color: t.txt1 }]}>{quizStreak} 🔥</Text>
            <Text style={[styles.scoreLbl, { color: t.txt3 }]}>STREAK</Text>
          </View>
          <View style={[styles.scoreDivider, { backgroundColor: t.border }]} />
          <View style={styles.scoreItem}>
            <Text style={[styles.scoreVal, { color: t.txt1 }]}>{accuracy !== null ? `${accuracy}%` : '—'}</Text>
            <Text style={[styles.scoreLbl, { color: t.txt3 }]}>ACCURACY</Text>
          </View>
          <View style={[styles.scoreDivider, { backgroundColor: t.border }]} />
          <TouchableOpacity
            style={styles.scoreResetBtn}
            onPress={() => { resetQuiz(); autoPlayNext.current = true; nextQuestion(); }}>
            <Ionicons name="refresh" size={18} color={t.txt2} />
          </TouchableOpacity>
        </View>

        <Animated.View style={[
          styles.card,
          { 
            backgroundColor: t.bg2,
            borderColor: borderColorAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [t.border, answered === 'wrong' ? WRONG_COLOR : CORRECT_COLOR]
            })
          },
          { transform: [{ translateX: shakeAnim }] },
        ]}>
          <Animated.View style={[
            StyleSheet.absoluteFill, 
            { backgroundColor: answered === 'wrong' ? WRONG_COLOR : CORRECT_COLOR, opacity: bgOpacityAnim }
          ]} pointerEvents="none" />

          <View style={styles.cardInner}>
            <View style={[styles.cardLeft, { borderRightColor: t.border }]}>
              <Text style={[styles.questionLabel, { color: t.accent }]}>
                {quizCategory === 'scale' ? 'IDENTIFY SCALE' :
                 quizCategory === 'arp' ? 'IDENTIFY ARPEGGIO' :
                 quizCategory === 'interval' ? 'IDENTIFY INTERVAL' :
                 quizCategory === 'shape' ? 'IDENTIFY SHAPE' : 'IDENTIFY'}
              </Text>

              <TouchableOpacity onPress={() => { animateTap(); replay(); }} activeOpacity={1}>
                <Animated.View style={[styles.chordDisplay, { transform: [{ scale: tapAnim }] }]}>
                  {!revealed ? (
                    // One consistent unanswered state for every category and mode: a
                    // single big "?". The answer fills in here once an option is chosen.
                    <Text style={[styles.audioQuestion, { color: t.txt3 }]}>?</Text>
                  ) : quizCategory === 'chord' ? (
                    <View style={styles.chordNameRow}>
                      <Text style={[styles.questionRoot, { color: t.txt1 }]}>{rootName}</Text>
                      <Text style={[styles.questionType, { color: t.accent }]}>
                        {CH[questionType] ? CH[questionType].s : ''}
                      </Text>
                    </View>
                  ) : (
                    <Text style={[styles.revealAnswer, { color: t.accent }]} numberOfLines={2}>
                      {(quizCategory === 'arp' && arpRevealLabel) ? arpRevealLabel : (options[correctIdxs[0]]?.label ?? '')}
                    </Text>
                  )}
                </Animated.View>
              </TouchableOpacity>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: t.accent + '40', backgroundColor: t.accent + '15', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 2 }}>
                  <Ionicons name="musical-notes-outline" size={12} color={t.accent} />
                  <Text style={{ ...TYPE.caption, color: t.accent }}>
                    {questionVoicingTab === 'block' ? 'Block' :
                     questionVoicingTab === 'open' ? 'Open' :
                     questionVoicingTab === 'barre' ? 'Barre' :
                     questionVoicingTab === 'triads' ? 'Triads' :
                     questionVoicingTab === 'shells' ? 'Shells' :
                     questionVoicingTab === 'drop2' ? 'Drop 2' :
                     questionVoicingTab === 'drop3' ? 'Drop 3' :
                     questionVoicingTab === 'drop2and4' ? 'Drop 2 & 4' : 
                     questionVoicingTab === 'intervals' ? 'Intervals' :
                     questionVoicingTab === 'arps' ? 'Arps' :
                     questionVoicingTab === 'shapes' ? 'Shapes' :
                     questionVoicingTab === 'scales' ? 'Scales' : questionVoicingTab}
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.cardRight}>
              <View style={styles.optionsGrid}>
                {options.map((opt, idx) => {
                  const isCorrectOpt = correctIdxs.includes(idx);
                  let bg = t.bg3;
                  let border = t.border;
                  let textColor = t.txt1;
                  if (revealed) {
                    // Once revealed, every option is colored: green if it's a
                    // correct answer, red otherwise (chosen or not).
                    if (isCorrectOpt) { bg = CORRECT_COLOR; border = CORRECT_COLOR; textColor = '#fff'; }
                    else { bg = WRONG_COLOR; border = WRONG_COLOR; textColor = '#fff'; }
                  }
                  return (
                    <Animated.View key={idx} style={revealed && isCorrectOpt ? { transform: [{ scale: correctScaleAnim }] } : undefined}>
                    <TouchableOpacity
                      style={[styles.optBtn, { backgroundColor: bg, borderColor: border }]}
                      onPressIn={() => {
                        if (!revealed) {
                          handleAnswer(idx);
                        } else if (quizCategory === 'chord') {
                          stopSeqFlash();
                          let optionNotes: number[] = [];
                          if (opt.type === questionType && opt.root === questionRoot) {
                            // Tapping the question's own chord: replay exactly what's shown.
                            optionNotes = activeMidiNotes;
                          } else if (activeQuizInstrument === 'guitar') {
                            // Build in the real guitar register (frets -> MIDI), matching how
                            // the question is voiced — not the piano builder seeded with the
                            // low guitar-octave setting, which sounded an octave too low.
                            const gv = getGuitarVoicingsForTab(questionVoicingTab, opt.type, questionRoot, namingMode);
                            const fretted = gv.find(v => v.frets && v.frets.length > 0);
                            if (fretted) {
                              fretted.frets.forEach((fr, str) => { if (fr.fret !== null) optionNotes.push(GS_MIDI[str] + fr.fret); });
                              optionNotes.sort((a, b) => a - b);
                            }
                            if (optionNotes.length === 0) optionNotes = getChordNotes(questionRoot, opt.type, 3, 'guitar');
                          } else {
                            const vcs = getPianoVoicingsForTab(questionVoicingTab, opt.type, questionRoot, namingMode);
                            optionNotes = vcs.length > 0 ? vcs[0].notes : getChordNotes(questionRoot, opt.type, octave);
                          }
                          onPlay(optionNotes, { guitar: activeQuizInstrument === 'guitar', forceArp: forceArpThisQ });
                          if (forceArpThisQ) fireSeqFlash(optionNotes);
                          else { pianoRef.current?.flashAll(optionNotes); fretboardRef.current?.flashAll(optionNotes); }
                        }
                      }}
                      activeOpacity={0.75}>
                      <Text style={[styles.optText, { color: textColor }]} numberOfLines={1}>{opt.label}</Text>
                    </TouchableOpacity>
                    </Animated.View>
                  );
                })}
              </View>
            </View>
          </View>
        </Animated.View>

        {quizMode === 'audio' && (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 16 }}>
            <ListeningVisual
              revealed={revealed}
              isPlaying={isPlaying}
              pulse={playPulse}
              notes={activeMidiNotes}
              roles={activeRoles}
              formulas={activeFormulas}
              namingMode={questionNaming}
              theme={t}
              onNotePress={(midi) => onNotePress?.(midi, 80, activeQuizInstrument === 'guitar')}
            />
          </View>
        )}

        {quizMode === 'visual' && (
          <View style={styles.pianoWrap}>
            {activeQuizInstrument === 'guitar' ? (
              <FretboardView
                ref={fretboardRef}
                groups={isFretboardSpecialMode ? [] : fretboardGroup}
                theme={t}
                rootSemi={questionRoot}
                labelMode={quizLabelMode}
                namingMode={questionNaming}
                onNotePress={(midi: number) => onNotePress?.(midi, 80, true)}
                hideNavigators={true}
                colorModeOverride={!revealed ? 'theme' : undefined}
                scaleVoicings={scaleVoicings}
                scaleMode={questionVoicingTab === 'scales'}
                arpMode={questionVoicingTab === 'arps' || questionVoicingTab === 'intervals'}
                arpVoicings={arpVoicings}
                arpSubsets={questionVoicingTab === 'intervals' ? intervalSubsets : arpSubsets}
                arpSubsetIdx={questionVoicingTab === 'intervals' ? safeIntervalSubsetIdx : safeArpSubsetIdx}
                shapesMode={questionVoicingTab === 'shapes'}
                shapeVoicings={shapeVoicings}
                selectedScaleId={pianoVoicing?.categoryId || null}
                selectedBoxName={pianoVoicing?.name || null}
              />
            ) : (
              <PianoView
                ref={pianoRef}
                midiNotes={activeMidiNotes}
                theme={t}
                showAllLabels={true}
                noteNames={noteNames}
                roles={activeRoles}
                formulas={activeFormulas}
                formulaByPC={formulaByPC}
                octave={octave}
                labelMode={quizLabelMode}
                accentColor={revealed ? undefined : t.accent}
                rootSemi={questionRoot}
                namingMode={questionNaming}
                onNotePress={(midi: number) => onNotePress?.(midi, 80, false)}
                colorModeOverride={!revealed ? 'theme' : undefined}
              />
            )}
          </View>
        )}
      </ScrollView>

      <View style={[styles.stickyPlayer, { backgroundColor: t.bg, borderTopColor: t.border }]}>
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.poolBtn, { backgroundColor: t.bg2, borderColor: t.border }]}
            onPress={() => setSheetVisible(true)}>
            <Ionicons name="layers" size={24} color={t.txt2} />
            <View style={[styles.badge, { backgroundColor: t.accent }]}>
              <Text style={styles.badgeText}>{activeTypes.length}</Text>
            </View>
          </TouchableOpacity>

          {!answered ? (
            <TouchableOpacity
              style={[styles.revealBtn, { backgroundColor: t.bg2, borderColor: t.border }]}
              onPress={() => {
                if (advancingRef.current) return;
                advancingRef.current = true;
                setRevealed(true); setAnswered('wrong'); incrementQuiz(false); replay();
                if (advanceReleaseRef.current) clearTimeout(advanceReleaseRef.current);
                advanceReleaseRef.current = setTimeout(() => { advancingRef.current = false; }, 160);
              }}>
              <Text style={[styles.revealText, { color: t.txt2 }]}>Reveal</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.nextBtn, { backgroundColor: t.accent }]}
              onPress={() => {
                if (advancingRef.current) return;
                advancingRef.current = true;
                perfNextRef.current = performance.now(); autoPlayNext.current = true; nextQuestion();
                if (advanceReleaseRef.current) clearTimeout(advanceReleaseRef.current);
                advanceReleaseRef.current = setTimeout(() => { advancingRef.current = false; }, 160);
              }}>
              <Text style={styles.nextText}>Next</Text>
              <Ionicons name="arrow-forward" size={24} color="#fff" />
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[styles.playQuizBtn, { backgroundColor: isPlaying ? WRONG_COLOR : '#639922' }]}
            onPress={isPlaying ? handleStopPlayback : replay}>
            <Ionicons name={isPlaying ? 'stop' : 'play'} size={26} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      <CommandSheet
        visible={sheetVisible}
        onClose={() => setSheetVisible(false)}
        forceMode="random"
        isQuiz={true}
      />
    </View>
  );
}

const CORRECT_COLOR = '#639922';
const WRONG_COLOR = '#D4537E';

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { paddingVertical: 16, paddingBottom: 32, gap: 12 },
  compactScore: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, paddingHorizontal: 16 },
  scoreItem: { alignItems: 'center', gap: 2, flex: 1 },
  scoreVal: { ...TYPE.heading },
  scoreLbl: { ...TYPE.caption, letterSpacing: 1 },
  scoreDivider: { width: 1, height: 24 },
  scoreResetBtn: { paddingHorizontal: 8, paddingVertical: 8 },
  card: { borderTopWidth: 1, borderBottomWidth: 1, padding: 16 },
  cardInner: { flexDirection: 'row', alignItems: 'stretch' },
  cardLeft: { flex: 1, paddingRight: 12, alignItems: 'center', justifyContent: 'center' },
  cardRight: { flex: 1.1, paddingLeft: 12, justifyContent: 'center' },
  questionLabel: { ...TYPE.label, fontWeight: FONT_WEIGHT.bold, letterSpacing: 2, textAlign: 'center', marginBottom: 8 },
  chordDisplay: { alignItems: 'center', justifyContent: 'center', gap: 2 },
  chordNameRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 4 },
  questionRoot: { ...TYPE.display, lineHeight: 48 },
  questionType: { ...TYPE.subtitle, fontWeight: FONT_WEIGHT.semibold, marginBottom: 6 },
  audioQuestion: { ...TYPE.display, lineHeight: 48 },
  // Revealed answer for the category modes (scale/arp/interval/shape) — sized to
  // sit between the big root and the small type so every category reads alike.
  revealAnswer: { ...TYPE.title, textAlign: 'center', lineHeight: 30 },
  optionsGrid: { flexDirection: 'column', gap: 8, width: '100%' },
  optBtn: { width: '100%', paddingVertical: 10, paddingHorizontal: 8, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center', minHeight: 44 },
  optText: { ...TYPE.body, fontWeight: FONT_WEIGHT.semibold, textAlign: 'center' },
  stickyPlayer: { paddingVertical: 12, borderTopWidth: 1, paddingBottom: 12 },
  actionRow: { flexDirection: 'row', gap: 12, marginHorizontal: 16 },
  poolBtn: { width: 56, height: 56, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  badge: { position: 'absolute', top: -6, right: -6, minWidth: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, borderWidth: 2, borderColor: '#fff' },
  badgeText: { color: '#fff', ...TYPE.caption },
  revealBtn: { flex: 1, height: 56, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  revealText: { ...TYPE.body, fontWeight: FONT_WEIGHT.bold },
  playQuizBtn: { width: 64, height: 56, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  nextBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 56, borderRadius: 20 },
  nextText: { color: '#fff', ...TYPE.body, fontWeight: FONT_WEIGHT.bold },
  pianoWrap: { justifyContent: 'center', marginHorizontal: 0 },
});