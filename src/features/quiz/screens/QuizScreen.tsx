import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, Animated, Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useIsFocused, useFocusEffect } from '@react-navigation/native';
import { useSettingsStore } from '@features/settings/store/settingsStore';
import { useChordStore } from '@features/play/store/chordStore';
import { useQuizStore } from '@features/quiz/store/quizStore';
import { THEMES } from '@shared/ui/themes';
import { CH, NOTE_SHARP, NOTE_FLAT, getChordNotes, spellInterval } from '@shared/theory/musicTheory';
import { PianoView, type PianoViewRef, FretboardView, type FretboardViewRef, CommandSheet } from '@shared/ui';
import { useAudio } from '@shared/audio/AudioContext';
import { DROP_VOICINGS } from '@shared/guitar/dropVoicings';
import { buildTriadVoicings, buildDropVoicings, buildShellVoicings, Voicing } from '@shared/guitar/voicings';

const ALL_CHORD_KEYS = Object.keys(CH);

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function buildOptions(
  correctRoot: number,
  correctType: string,
  pool: string[],
  quizMode: 'visual' | 'audio',
  namingMode: 'sharp' | 'flat'
): { root: number; type: string; label: string }[] {
  const opts: { root: number; type: string; label: string }[] = [];
  const seenTypes = new Set<string>();

  // Labels never include the root note to focus purely on testing chord quality
  const makeLabel = (type: string) => CH[type]?.l ?? type;

  seenTypes.add(correctType);
  opts.push({ root: correctRoot, type: correctType, label: makeLabel(correctType) });

  let attempts = 0;
  while (opts.length < 4 && attempts < 200) {
    attempts++;
    const randType = pickRandom(pool);
    
    // Uniqueness is strictly based on chord quality (type) now
    if (!seenTypes.has(randType) && CH[randType]) {
      seenTypes.add(randType);
      // Using correctRoot for all options means if the user clicks a wrong option 
      // after revealing, they can compare qualities on the exact same root note!
      opts.push({ root: correctRoot, type: randType, label: makeLabel(randType) });
    }
  }

  // Shuffle
  for (let i = opts.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [opts[i], opts[j]] = [opts[j], opts[i]];
  }
  return opts;
}

export default function QuizScreen() {
  const { playChord: onPlay, stopAudio: onStop, playSingleNote: onNotePress } = useAudio();
  const { octave, labelMode, setLabelMode, theme, arp, instrument, isSettingsOpen, bpm } = useSettingsStore();
  const { activeTypes, namingMode } = useChordStore();
  const { quizMode, setQuizMode, quizScore, quizTotal, quizStreak, resetQuiz, incrementQuiz } = useQuizStore();

  const t = THEMES[theme];

  const isFocused = useIsFocused();
  const originalLabelMode = useRef(labelMode);

  useFocusEffect(
    useCallback(() => {
      // 1. Save whatever label mode they had BEFORE entering the quiz
      originalLabelMode.current = useSettingsStore.getState().labelMode;
      // 2. Force it to 'none' for the quiz
      setLabelMode('none');

      return () => {
        // 3. When they leave the quiz screen, put it back to what it was
        setLabelMode(originalLabelMode.current);
      };
    }, [setLabelMode])
  );

  useEffect(() => {
    if (!isFocused) {
      stopSeqFlash();
      onStop();
    }
  }, [isFocused]);

  // ── Quiz state ──────────────────────────────────────────────
  const [questionRoot, setQuestionRoot] = useState(0);
  const [questionType, setQuestionType] = useState('maj7');
  const [options, setOptions] = useState<{ root: number; type: string; label: string }[]>([]);
  const [answered, setAnswered] = useState<null | 'correct' | 'wrong'>(null);
  const [chosenIdx, setChosenIdx] = useState<number | null>(null);
  const [correctIdx, setCorrectIdx] = useState<number>(0);
  const [revealed, setRevealed] = useState(false);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [guitarVoicing, setGuitarVoicing] = useState<Voicing | null>(null);
  const [activeQuizInstrument, setActiveQuizInstrument] = useState<'piano' | 'guitar'>(instrument);

  const tapAnim = useRef(new Animated.Value(1)).current;
  const bgOpacityAnim = useRef(new Animated.Value(0)).current;
  const pianoRef = useRef<PianoViewRef>(null);
  const fretboardRef = useRef<FretboardViewRef>(null);

  const seqFlashTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const stopSeqFlash = () => {
    seqFlashTimers.current.forEach(t => clearTimeout(t));
    seqFlashTimers.current = [];
  };

  const fireSeqFlash = (midiNotes: number[]) => {
    stopSeqFlash();
    const msPerStep = 60000 / bpm / 2;
    const AUDIO_LATENCY = 60; // Offset to perfectly sync visual with audio bridge
    midiNotes.forEach((midi, i) => {
      const fire = () => { pianoRef.current?.flashMidi(midi); fretboardRef.current?.flashMidi(midi); };
      seqFlashTimers.current.push(setTimeout(fire, Math.round(msPerStep * i) + AUDIO_LATENCY));
    });
  };

  const animateTap = () => {
    Animated.sequence([
      Animated.timing(tapAnim, { toValue: 0.93, duration: 80, useNativeDriver: true }),
      Animated.timing(tapAnim, { toValue: 1, duration: 120, useNativeDriver: true }),
    ]).start();
  };

  useEffect(() => {
    if (answered) {
      bgOpacityAnim.setValue(0.5);
      Animated.timing(bgOpacityAnim, { toValue: 0, duration: 1000, useNativeDriver: true }).start();
    }
  }, [answered]);

  const rawMidiNotes = getChordNotes(questionRoot, questionType, octave);
  const noteNames = CH[questionType]?.f.map((formula: string) =>
    spellInterval(questionRoot, formula, namingMode === 'flat')
  ) ?? [];

  const roles = CH[questionType]?.r ?? [];
  const formulaByPC: Record<number, string> = {};
  CH[questionType]?.iv.forEach((iv: number, i: number) => {
    const pc = (questionRoot + iv) % 12;
    formulaByPC[pc] = CH[questionType]?.f?.[i] ?? '';
  });

  const GS_MIDI = [40, 45, 50, 55, 59, 64];

  const guitarData = React.useMemo(() => {
    if (activeQuizInstrument !== 'guitar' || !guitarVoicing) return null;

    const specificMidi: number[] = [];
    const frets = Array(6).fill(null).map(() => ({ fret: null, role: '' }));

    guitarVoicing.frets.forEach((f: any, str: number) => {
      if (f.fret !== null) {
        const midi = GS_MIDI[str] + f.fret;
        specificMidi.push(midi);
        frets[str] = { fret: f.fret, role: f.role || '' };
      }
    });

    specificMidi.sort((a, b) => a - b);
    return { specificMidi, frets };
  }, [activeQuizInstrument, guitarVoicing]);

  const activeMidiNotes = guitarData ? guitarData.specificMidi : rawMidiNotes;

  // ── Generate a new question ─────────────────────────────────
  const nextQuestion = useCallback(() => {
    stopSeqFlash();
    onStop();
    
    let pool: string[] = activeTypes.length > 0 ? activeTypes : ALL_CHORD_KEYS;
    if (instrument === 'guitar') {
      const validGuitarTypes = new Set([
        ...Object.keys(DROP_VOICINGS.drop2 || {}), 
        ...Object.keys(DROP_VOICINGS.drop3 || {}),
        ...Object.keys(DROP_VOICINGS.shells || {}),
        ...Object.keys(CH).filter(k => CH[k].iv.length === 3)
      ]);
      pool = pool.filter((t: string) => validGuitarTypes.has(t));
      if (pool.length < 4) pool = ['maj', 'min', 'maj7', 'min7']; 
    } else if (pool.length < 4) {
      pool = ALL_CHORD_KEYS;
    }

    const root = Math.floor(Math.random() * 12);
    const type = pickRandom(pool);
    
    const opts = buildOptions(root, type, pool, quizMode, namingMode);
    const cIdx = opts.findIndex(o => o.root === root && o.type === type);

    let randomVoicing: Voicing | null = null;
    if (instrument === 'guitar' && CH[type]) {
      let availableVoicings: Voicing[] = [];
      const def = CH[type];
      if (def.iv.length === 3) {
        availableVoicings = buildTriadVoicings(def, root, '', namingMode).flatMap((g: any) => g.voicings);
      } else {
        availableVoicings = [
          ...buildDropVoicings(type, def, root, '', '', namingMode).flatMap((g: any) => g.voicings),
          ...buildShellVoicings(type, def, root, '', '', namingMode).flatMap((g: any) => g.voicings)
        ];
      }
      if (availableVoicings.length > 0) {
        randomVoicing = pickRandom(availableVoicings);
      }
    }
    setGuitarVoicing(randomVoicing);

    setQuestionRoot(root);
    setQuestionType(type);
    setOptions(opts);
    setCorrectIdx(cIdx);
    setAnswered(null);
    setChosenIdx(null);
    setRevealed(false);
    setActiveQuizInstrument(instrument);
  }, [activeTypes, quizMode, namingMode, onStop, instrument]);

  useEffect(() => {
    nextQuestion();
  }, [quizMode, instrument, namingMode]); // Retrigger if namingMode changes globally

  // The Explicit Intent Lock: Only true when the user physically presses a button
  const autoPlayNext = useRef(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    // Only play if the lock was explicitly opened by a button press
    if (autoPlayNext.current && questionType && CH[questionType] && !isSettingsOpen) {
      timer = setTimeout(() => {
        onPlay(activeMidiNotes, { guitar: activeQuizInstrument === 'guitar', forceArp: arp });
        if (arp) {
          fireSeqFlash(activeMidiNotes);
        } else {
          pianoRef.current?.flashAll(activeMidiNotes);
          fretboardRef.current?.flashAll(activeMidiNotes);
        }
      }, 200);
      autoPlayNext.current = false; // Instantly lock it back down
    }
    return () => { if (timer) clearTimeout(timer); };
  }, [options]); // Fires when the new question finishes loading

  const replay = () => {
    stopSeqFlash();
    onPlay(activeMidiNotes, { guitar: activeQuizInstrument === 'guitar', forceArp: arp });
    if (arp) {
      fireSeqFlash(activeMidiNotes);
    } else {
      pianoRef.current?.flashAll(activeMidiNotes);
      fretboardRef.current?.flashAll(activeMidiNotes);
    }
  };

  // ── Answer handler ──────────────────────────────────────────
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const correctScaleAnim = useRef(new Animated.Value(1)).current;

  const handleAnswer = (idx: number) => {
    if (answered) return;
    const correct = idx === correctIdx;
    
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
      onPlay(activeMidiNotes, { guitar: activeQuizInstrument === 'guitar', forceArp: arp });
      if (arp) {
        fireSeqFlash(activeMidiNotes);
      } else {
        pianoRef.current?.flashAll(activeMidiNotes);
        fretboardRef.current?.flashAll(activeMidiNotes);
      }
    });
  };

  const rootName = namingMode === 'flat' ? NOTE_FLAT[questionRoot] : NOTE_SHARP[questionRoot];
  const accuracy = quizTotal > 0 ? Math.round((quizScore / quizTotal) * 100) : null;

  const fretboardGroup: any = guitarData ? [{
    label: 'Quiz',
    stringNums: '012345',
    voicings: [{ 
      name: 'Quiz', 
      frets: guitarData.frets.map(f => ({ ...f, role: revealed ? f.role : 'unknown' })) 
    }]
  }] : [{ 
    label: 'Quiz', 
    stringNums: '012345',
    voicings: [{ name: 'Quiz', frets: Array(6).fill({ fret: null }) }] 
  }];

  const fretboardOverlay = React.useMemo(() => {
    if (guitarData) return []; 
    const notes: any[] = [];
    activeMidiNotes.forEach((midi: number, idx: number) => {
      const r = revealed ? (roles[idx] || '') : 'unknown';
      const nName = noteNames[idx] || '';
      const pc = midi % 12;
      const form = formulaByPC[pc] || '';
      for (let s = 0; s < 6; s++) {
        const fret = midi - GS_MIDI[s];
        if (fret >= 0 && fret <= 15) {
          notes.push({ stringIdx: s, fret, role: r, formula: form, noteName: nName, isGhost: false });
        }
      }
    });
    return notes;
  }, [activeMidiNotes, roles, noteNames, formulaByPC, guitarData, revealed]);

  return (
    <View style={[styles.safe, { backgroundColor: t.bg }]}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} removeClippedSubviews={true}>

        {/* Compact Score Panel — Top */}
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

        {/* Combined mode + question card */}
        <Animated.View style={[
          styles.card,
          { backgroundColor: t.bg2, borderColor: t.border },
          answered === 'correct' && { borderColor: CORRECT_COLOR },
          answered === 'wrong' && { borderColor: WRONG_COLOR },
          { transform: [{ translateX: shakeAnim }] },
        ]}>
          
          <Animated.View style={[
            StyleSheet.absoluteFill, 
            { backgroundColor: answered === 'wrong' ? WRONG_COLOR : CORRECT_COLOR, opacity: bgOpacityAnim, borderRadius: 20 }
          ]} pointerEvents="none" />

          <View style={styles.cardInner}>
            <View style={[styles.cardLeft, { borderRightColor: t.border }]}>
              <Text style={[styles.questionLabel, { color: t.accent }]}>IDENTIFY</Text>

              <TouchableOpacity onPress={() => { animateTap(); replay(); }} activeOpacity={1}>
                <Animated.View style={[styles.chordDisplay, { transform: [{ scale: tapAnim }] }]}>
                  {quizMode === 'visual' ? (
                    <View style={styles.chordNameRow}>
                      <Text style={[styles.questionRoot, { color: t.txt1 }]}>{rootName}</Text>
                      <Text style={[styles.questionType, { color: revealed ? t.accent : t.txt3 }]}>
                        {revealed ? CH[questionType]?.l : '???'}
                      </Text>
                    </View>
                  ) : (
                    revealed ? (
                      <View style={styles.chordNameRow}>
                        <Text style={[styles.questionRoot, { color: t.txt1 }]}>{rootName}</Text>
                        <Text style={[styles.questionType, { color: t.accent }]}>{CH[questionType]?.l}</Text>
                      </View>
                    ) : (
                      <Text style={[styles.audioQuestion, { color: t.txt3 }]}>?</Text>
                    )
                  )}
                </Animated.View>
              </TouchableOpacity>

              <View style={styles.typesTooltip}>
                <Ionicons name="layers-outline" size={14} color={t.txt3} />
                <Text style={{ fontSize: 10, fontWeight: '700', color: t.txt3 }}>
                  {activeTypes.length} Types
                </Text>
              </View>
            </View>

            <View style={styles.cardRight}>
              <View style={styles.optionsGrid}>
                {options.map((opt, idx) => {
                  const isChosen = chosenIdx === idx;
                  const isCorrectOpt = idx === correctIdx;
                  let bg = t.bg3;
                  let border = t.border;
                  let textColor = t.txt1;
                  if (revealed) {
                    if (isCorrectOpt) { bg = CORRECT_COLOR; border = CORRECT_COLOR; textColor = '#fff'; }
                    else if (isChosen) { bg = WRONG_COLOR; border = WRONG_COLOR; textColor = '#fff'; }
                  }
                  const isCorrectRevealed = revealed && isCorrectOpt;
                    return (
                    <Animated.View key={idx} style={isCorrectRevealed ? { transform: [{ scale: correctScaleAnim }] } : undefined}>
                    <TouchableOpacity
                      style={[styles.optBtn, { backgroundColor: bg, borderColor: border }]}
                      onPressIn={() => {
                        if (!revealed) {
                          handleAnswer(idx);
                        } else {
                          stopSeqFlash();
                          const optionNotes = getChordNotes(opt.root, opt.type, octave);
                          onPlay(optionNotes, { guitar: activeQuizInstrument === 'guitar', forceArp: arp });
                          if (arp) {
                            fireSeqFlash(optionNotes);
                          } else {
                            pianoRef.current?.flashAll(optionNotes);
                            fretboardRef.current?.flashAll(optionNotes);
                          }
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

        {/* Instrument View */}
        {quizMode === 'visual' && (
          <View style={styles.pianoWrap}>
            {activeQuizInstrument === 'guitar' ? (
              <View style={{ marginTop: 10, marginBottom: 10 }}>
                <FretboardView
                  ref={fretboardRef}
                  groups={fretboardGroup}
                  theme={t}
                  rootSemi={questionRoot}
                  labelMode={labelMode}
                  namingMode={namingMode}
                  onNotePress={(midi: number) => onNotePress?.(midi, 80, true)}
                  overlayNotes={fretboardOverlay}
                  hideNavigators={true}
                  colorModeOverride={!revealed ? 'theme' : undefined}
                />
              </View>
            ) : (
              <PianoView
                ref={pianoRef}
                midiNotes={activeMidiNotes}
                theme={t}
                showAllLabels={true}
                noteNames={noteNames}
                roles={revealed ? roles : Array(activeMidiNotes.length).fill('unknown')}
                formulaByPC={formulaByPC}
                octave={octave}
                labelMode={labelMode}
                accentColor={revealed ? undefined : t.accent}
                rootSemi={questionRoot}
                namingMode={namingMode}
                onNotePress={(midi: number) => onNotePress?.(midi, 80, false)}
                colorModeOverride={!revealed ? 'theme' : undefined}
              />
            )}
          </View>
        )}

        </ScrollView>

      {/* Global Sticky Player Dock */}
      <View style={[styles.stickyPlayer, { backgroundColor: t.bg, borderTopColor: t.border }]}>
        
        {/* STANDARDIZED ACTION ROW */}
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.poolBtn, { backgroundColor: t.bg2, borderColor: t.border }]}
            onPress={() => setSheetVisible(true)}>
            <Ionicons name="library-outline" size={24} color={t.txt2} />
            <View style={[styles.badge, { backgroundColor: t.accent }]}>
              <Text style={styles.badgeText}>{activeTypes.length}</Text>
            </View>
          </TouchableOpacity>

          {!answered ? (
            <TouchableOpacity
              style={[styles.revealBtn, { backgroundColor: t.bg2, borderColor: t.border }]}
              onPress={() => { setRevealed(true); setAnswered('wrong'); incrementQuiz(false); replay(); }}>
              <Text style={[styles.revealText, { color: t.txt2 }]}>Reveal</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.nextBtn, { backgroundColor: t.accent }]}
              onPress={() => { autoPlayNext.current = true; nextQuestion(); }}>
              <Text style={styles.nextText}>Next</Text>
              <Ionicons name="arrow-forward" size={24} color="#fff" />
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[styles.playQuizBtn, { backgroundColor: '#639922' }]}
            onPress={replay}>
            <Ionicons name="play" size={26} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      <CommandSheet 
        visible={sheetVisible} 
        onClose={() => setSheetVisible(false)} 
        forceMode="random"
        executeLabel="SAVE QUIZ POOL"
        executeIcon="checkmark"
        onExecute={() => {
          resetQuiz();
          autoPlayNext.current = true;
          nextQuestion();
        }}
      />

    </View>
  );
}

const CORRECT_COLOR = '#639922';
const WRONG_COLOR = '#D4537E';

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { paddingVertical: 16, paddingBottom: 32, gap: 12 },

  compactScore: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 10, paddingHorizontal: 16, marginHorizontal: 16,
    borderRadius: 16, borderWidth: 1
  },
  scoreItem: { alignItems: 'center', gap: 2, flex: 1 },
  scoreVal: { fontSize: 16, fontWeight: '700' },
  scoreLbl: { fontSize: 9, fontWeight: '700', letterSpacing: 1 },
  scoreDivider: { width: 1, height: 24 },
  scoreResetBtn: { paddingHorizontal: 8, paddingVertical: 8 },

  settingsCard: {
    borderRadius: 20, marginHorizontal: 16, padding: 16, borderWidth: 1,
  },
  settingsTitle: {
    fontSize: 11, fontWeight: '800', letterSpacing: 1.5, marginBottom: 12,
  },
  settingRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', paddingVertical: 6,
  },
  settingLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  settingLabel: { fontSize: 14, fontWeight: '600' },
  toggleRow: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  toggleBtn: {
    borderRadius: 12, paddingHorizontal: 14,
    paddingVertical: 8, borderWidth: 1,
  },
  toggleText: { fontWeight: '700', fontSize: 13 },

  card: { borderRadius: 20, borderWidth: 1, padding: 16, marginHorizontal: 16 },
  cardInner: { flexDirection: 'row', alignItems: 'stretch' },
  cardLeft: { flex: 1, borderRightWidth: 1, paddingRight: 12, alignItems: 'center', justifyContent: 'center' },
  cardRight: { flex: 1.1, paddingLeft: 12, justifyContent: 'center' },
  typesTooltip: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 12 },

  questionLabel: { fontSize: 12, fontWeight: '800', letterSpacing: 2, textAlign: 'center', marginBottom: 8 },
  chordDisplay: { alignItems: 'center', justifyContent: 'center', gap: 2 },
  chordNameRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 4 },
  questionRoot: { fontSize: 44, fontWeight: '700', lineHeight: 48 },
  questionType: { fontSize: 20, fontWeight: '600', marginBottom: 6 },
  audioQuestion: { fontSize: 60, fontWeight: '700', lineHeight: 66 },
  
  optionsGrid: { flexDirection: 'column', gap: 8, width: '100%' },
  optBtn: { width: '100%', paddingVertical: 12, paddingHorizontal: 8, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center', minHeight: 44 },
  optText: { fontSize: 14, fontWeight: '600', textAlign: 'center' },

  stickyPlayer: {
    paddingVertical: 12,
    borderTopWidth: 1,
    paddingBottom: Platform.OS === 'ios' ? 24 : 12,
  },
  actionRow: { flexDirection: 'row', gap: 12, marginHorizontal: 16 },
  
  poolBtn: { width: 56, height: 56, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  badge: { position: 'absolute', top: -4, right: -4, minWidth: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, borderWidth: 2, borderColor: '#fff' },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: '900' },

  revealBtn: { flex: 1, height: 56, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  revealText: { fontSize: 14, fontWeight: '700' },
  playQuizBtn: { width: 64, height: 56, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  nextBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 56, borderRadius: 20 },
  nextText: { color: '#fff', fontSize: 15, fontWeight: '800' },

  pianoWrap: { marginHorizontal: 0 },
});