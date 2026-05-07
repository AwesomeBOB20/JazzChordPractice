import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Dimensions,
  Platform, Animated, TouchableWithoutFeedback
} from 'react-native';
import Svg, { Path, Circle, Line, G, Text as SvgText } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSettingsStore } from '@features/settings/store/settingsStore';
import { THEMES } from '@shared/ui/themes';
import { useAudio } from '@shared/audio/AudioContext';

const PopUpModal = ({ visible, onClose, children }: { visible: boolean, onClose: () => void, children: React.ReactNode }) => {
  const [show, setShow] = useState(visible);
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setShow(true);
      Animated.spring(anim, { toValue: 1, useNativeDriver: true, bounciness: 8, speed: 16 }).start();
    } else {
      Animated.timing(anim, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => setShow(false));
    }
  }, [visible]);

  if (!show) return null;
  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 1000, elevation: 10 }]}>
      <TouchableWithoutFeedback onPress={onClose}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.6)', opacity: anim }]} />
      </TouchableWithoutFeedback>
      <Animated.View pointerEvents="box-none" style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, opacity: anim, transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) }] }}>
        {children}
      </Animated.View>
    </View>
  );
};

import { startListening, stopListening, addPitchListener } from '../../../../modules/native-tuner';
import { Audio } from 'expo-av';

const TUNINGS: Record<string, { label: string; strings: { name: string; midi: number; hz: number }[] }> = {
  standard: { label: 'Standard', strings: [ { name: 'E2', midi: 40, hz: 82.41 }, { name: 'A2', midi: 45, hz: 110.0 }, { name: 'D3', midi: 50, hz: 146.83 }, { name: 'G3', midi: 55, hz: 196.0 }, { name: 'B3', midi: 59, hz: 246.94 }, { name: 'E4', midi: 64, hz: 329.63 } ] },
  dropD: { label: 'Drop D', strings: [ { name: 'D2', midi: 38, hz: 73.42 }, { name: 'A2', midi: 45, hz: 110.0 }, { name: 'D3', midi: 50, hz: 146.83 }, { name: 'G3', midi: 55, hz: 196.0 }, { name: 'B3', midi: 59, hz: 246.94 }, { name: 'E4', midi: 64, hz: 329.63 } ] },
  halfStepDown: { label: '½ Step Down', strings: [ { name: 'Eb2', midi: 39, hz: 77.78 }, { name: 'Ab2', midi: 44, hz: 103.83 }, { name: 'Db3', midi: 49, hz: 138.59 }, { name: 'Gb3', midi: 54, hz: 185.0 }, { name: 'Bb3', midi: 58, hz: 233.08 }, { name: 'Eb4', midi: 63, hz: 311.13 } ] },
  openG: { label: 'Open G', strings: [ { name: 'D2', midi: 38, hz: 73.42 }, { name: 'G2', midi: 43, hz: 98.0 }, { name: 'D3', midi: 50, hz: 146.83 }, { name: 'G3', midi: 55, hz: 196.0 }, { name: 'B3', midi: 59, hz: 246.94 }, { name: 'D4', midi: 62, hz: 293.66 } ] },
  dadgad: { label: 'DADGAD', strings: [ { name: 'D2', midi: 38, hz: 73.42 }, { name: 'A2', midi: 45, hz: 110.0 }, { name: 'D3', midi: 50, hz: 146.83 }, { name: 'G3', midi: 55, hz: 196.0 }, { name: 'A3', midi: 57, hz: 220.0 }, { name: 'D4', midi: 62, hz: 293.66 } ] },
};

const TUNING_KEYS = Object.keys(TUNINGS);
const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// PRO UPGRADE 1: Buttery Smooth Analog Tracking (Lowered from 0.3)
const SMOOTHING_FACTOR = 0.35; 

const SCREEN_WIDTH = Dimensions.get('window').width;
const GAUGE_RADIUS = SCREEN_WIDTH * 0.38; // Slightly larger for pro feel
const GAUGE_STROKE = 14;
const GAUGE_SVG_W = SCREEN_WIDTH - 32;
const GAUGE_CENTER_X = GAUGE_SVG_W / 2;
const GAUGE_CENTER_Y = GAUGE_RADIUS + 30;
const ARC_START_ANGLE = -130;
const ARC_END_ANGLE = 130;
const ARC_RANGE = ARC_END_ANGLE - ARC_START_ANGLE;

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArc = endAngle - startAngle <= 180 ? '0' : '1';
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y}`;
}

function calculatePitch(frequency: number, refFreq: number) {
  const A4_INDEX = 69;
  const noteFloat = 12 * Math.log2(frequency / refFreq) + A4_INDEX;
  const noteIndex = Math.round(noteFloat);
  const cents = (noteFloat - noteIndex) * 100;
  const noteName = NOTES[((noteIndex % 12) + 12) % 12];
  const octave = Math.floor(noteIndex / 12) - 1;
  return { name: noteName, octave, fullName: `${noteName}${octave}`, cents, midi: noteIndex };
}

function findClosestString(midi: number, cents: number, strings: { name: string; midi: number; hz: number }[]) {
  let best = 0; let bestDist = Infinity;
  strings.forEach((s, i) => { const dist = Math.abs((midi + cents / 100) - s.midi); if (dist < bestDist) { bestDist = dist; best = i; } });
  return best;
}

export default function TunerScreen() {
  const { playTone: onPlayTone, stopTone: onStopTone } = useAudio();
  const { theme, referenceFrequency } = useSettingsStore();
  const t = THEMES[theme];

  const [mode, setMode] = useState<'listen' | 'play'>('listen');
  const [tuningKey, setTuningKey] = useState('standard');
  const [showTunings, setShowTunings] = useState(false);
  const tuning = TUNINGS[tuningKey];

  const tuningStrings = tuning.strings.map(s => ({ ...s, hz: referenceFrequency * Math.pow(2, (s.midi - 69) / 12) }));

  const [isRecording, setIsRecording] = useState(false);
  const [playingStringIdx, setPlayingStringIdx] = useState<number | null>(null);
  const [pitchInfo, setPitchInfo] = useState<{ name: string; octave: number; fullName: string; cents: number; midi: number; } | null>(null);
  const [activeStringIdx, setActiveStringIdx] = useState<number | null>(null);

  const smoothedNoteFloatRef = useRef<number | null>(null);
  
  // PRO UPGRADE 2: The Lock-In Gate
  const hasLockedInRef = useRef(false);
  const lastHapticTimeRef = useRef(0);

  const micAvailable = true;

  useEffect(() => {
    const subscription = addPitchListener((event) => {
      const now = Date.now();
      const pitchHz = event.frequency;
      
      if (pitchHz && pitchHz > 60 && pitchHz < 1500) {
        const noteFloat = 12 * Math.log2(pitchHz / referenceFrequency) + 69;

        if (smoothedNoteFloatRef.current === null || Math.abs(noteFloat - smoothedNoteFloatRef.current) > 2) {
          smoothedNoteFloatRef.current = noteFloat;
        } else {
          smoothedNoteFloatRef.current = SMOOTHING_FACTOR * noteFloat + (1 - SMOOTHING_FACTOR) * smoothedNoteFloatRef.current;
        }

        const smoothedHz = referenceFrequency * Math.pow(2, (smoothedNoteFloatRef.current - 69) / 12);
        const smoothedInfo = calculatePitch(smoothedHz, referenceFrequency);

        requestAnimationFrame(() => {
          setPitchInfo(smoothedInfo);
          setActiveStringIdx(findClosestString(smoothedInfo.midi, smoothedInfo.cents, tuningStrings));
        });

        // Hardware Pedal Haptics: Fire heavy impact when dead center!
        if (Math.abs(smoothedInfo.cents) <= 2.5) {
          if (!hasLockedInRef.current && now - lastHapticTimeRef.current > 500) {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
            hasLockedInRef.current = true;
            lastHapticTimeRef.current = now;
          }
        } else if (Math.abs(smoothedInfo.cents) > 8) {
          hasLockedInRef.current = false;
        }
      }
    });

    return () => {
      subscription.remove();
      stopListening();
    };
  }, [tuningKey, referenceFrequency]);

  const toggleListening = useCallback(async () => {
    if (isRecording) {
      stopListening();
      setIsRecording(false);
      setPitchInfo(null);
      setActiveStringIdx(null);
      hasLockedInRef.current = false;
      smoothedNoteFloatRef.current = null;
    } else {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        alert('Microphone permission denied.');
        return;
      }
      startListening();
      setIsRecording(true);
    }
  }, [isRecording]);

  const STRING_VOLUME_BOOST = [3.0, 2.4, 1.8, 1.4, 1.1, 1.0];

  const toggleString = useCallback((stringIdx: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (playingStringIdx === stringIdx) {
      onStopTone(); setPlayingStringIdx(null); setActiveStringIdx(null);
    } else {
      onStopTone();
      const s = tuningStrings[stringIdx];
      const boostedVol = Math.min(100, 80 * STRING_VOLUME_BOOST[stringIdx]);
      setTimeout(() => { onPlayTone(s.midi, boostedVol); }, 30);
      setPlayingStringIdx(stringIdx); setActiveStringIdx(stringIdx);
    }
  }, [tuningStrings, onPlayTone, onStopTone, playingStringIdx]);

  const cents = pitchInfo?.cents ?? 0;
  const clampedCents = Math.max(-50, Math.min(50, cents));
  const needleAngle = ARC_START_ANGLE + ((clampedCents + 50) / 100) * ARC_RANGE;
  const inTune = Math.abs(cents) <= 3;
  const tuneColor = inTune ? '#639922' : Math.abs(cents) <= 15 ? '#D4A853' : '#D4537E';

  const tickAngles = [-50, -40, -30, -20, -10, 0, 10, 20, 30, 40, 50].map(
    (c) => ({ cents: c, angle: ARC_START_ANGLE + ((c + 50) / 100) * ARC_RANGE })
  );

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      
      <PopUpModal visible={showTunings} onClose={() => setShowTunings(false)}>
        <View style={[styles.modalBox, { backgroundColor: t.bg2, borderColor: t.border }]}>
          <Text style={[styles.modalTitle, { color: t.txt1 }]}>Select Tuning</Text>
          <View style={{ borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: t.border }}>
            {TUNING_KEYS.map((key, index) => {
              const selected = tuningKey === key;
              const tu = TUNINGS[key];
              return (
                <TouchableOpacity key={key} style={[ styles.tuningOverlayItem, selected && { backgroundColor: t.accent + '18' }, index !== TUNING_KEYS.length - 1 && { borderBottomWidth: 1, borderBottomColor: t.border } ]}
                  onPress={() => { setTuningKey(key); setShowTunings(false); setPlayingStringIdx(null); onStopTone(); }}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.tuningOverlayLabel, { color: selected ? t.accent : t.txt1 }]}>{tu.label}</Text>
                    <Text style={[styles.tuningOverlayNotes, { color: t.txt3 }]}>{tu.strings.map(s => s.name.replace(/[0-9]/g, '')).join(' · ')}</Text>
                  </View>
                  {selected && <Ionicons name="checkmark" size={20} color={t.accent} />}
                </TouchableOpacity>
              );
            })}
          </View>
          <View style={styles.modalBtnRow}>
            <TouchableOpacity style={styles.modalBtn} onPress={() => setShowTunings(false)}><Text style={{ color: t.txt3, fontSize: 16, fontWeight: '600' }}>Close</Text></TouchableOpacity>
          </View>
        </View>
      </PopUpModal>

      <View style={styles.container}>
        {mode === 'listen' && (
          <View style={styles.gaugeWrap}>
            
            {/* NEW LAYOUT: Note and Cents moved UP HERE, above the meter! */}
            <View style={{ alignItems: 'center', marginBottom: 20 }}>
               <Text style={[styles.noteText, { color: isRecording && pitchInfo ? tuneColor : t.txt3, textShadowColor: isRecording && inTune ? '#63992240' : 'transparent', textShadowRadius: 10 }]}>
                {isRecording && pitchInfo ? pitchInfo.fullName : '--'}
               </Text>
               <Text style={[styles.centsText, { color: isRecording && pitchInfo ? tuneColor : t.txt3, marginTop: 4 }]}>
                {isRecording && pitchInfo ? `${cents > 0 ? '+' : ''}${Math.round(cents)} ¢` : micAvailable ? 'Tap to start' : 'Requires dev build'}
               </Text>
            </View>

            {/* PRO UPGRADE 3: The Integrated Snark Layout */}
            <View style={styles.svgContainer}>
              <Svg width={GAUGE_SVG_W} height={GAUGE_CENTER_Y + 10} viewBox={`0 0 ${GAUGE_SVG_W} ${GAUGE_CENTER_Y + 10}`}>
                <Path d={describeArc(GAUGE_CENTER_X, GAUGE_CENTER_Y, GAUGE_RADIUS, ARC_START_ANGLE, ARC_END_ANGLE)} fill="none" stroke={t.bg3} strokeWidth={GAUGE_STROKE} strokeLinecap="round" />
                <Path d={describeArc(GAUGE_CENTER_X, GAUGE_CENTER_Y, GAUGE_RADIUS, ARC_START_ANGLE + (45 / 100) * ARC_RANGE, ARC_START_ANGLE + (55 / 100) * ARC_RANGE)} fill="none" stroke="#63992220" strokeWidth={GAUGE_STROKE + 6} strokeLinecap="round" />

                {tickAngles.map(({ cents: c, angle }) => {
                  const isMajor = c === 0 || Math.abs(c) === 50;
                  const inner = polarToCartesian(GAUGE_CENTER_X, GAUGE_CENTER_Y, GAUGE_RADIUS - (isMajor ? 18 : 12), angle);
                  const outer = polarToCartesian(GAUGE_CENTER_X, GAUGE_CENTER_Y, GAUGE_RADIUS + (isMajor ? 6 : 4), angle);
                  return <Line key={c} x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y} stroke={c === 0 ? '#639922' : t.border} strokeWidth={isMajor ? 3 : 1.5} strokeLinecap="round" />;
                })}

                <SvgText x={40} y={GAUGE_CENTER_Y - 10} fill={t.txt3} fontSize={18} fontWeight="800" textAnchor="middle">♭</SvgText>
                <SvgText x={GAUGE_SVG_W - 40} y={GAUGE_CENTER_Y - 10} fill={t.txt3} fontSize={18} fontWeight="800" textAnchor="middle">♯</SvgText>

                {pitchInfo && isRecording && (
                  <G>
                    {/* Glowing shadow needle for pro feel */}
                    <Line x1={GAUGE_CENTER_X} y1={GAUGE_CENTER_Y} x2={polarToCartesian(GAUGE_CENTER_X, GAUGE_CENTER_Y, GAUGE_RADIUS - 16, needleAngle).x} y2={polarToCartesian(GAUGE_CENTER_X, GAUGE_CENTER_Y, GAUGE_RADIUS - 16, needleAngle).y} stroke={tuneColor} strokeWidth={10} strokeLinecap="round" opacity={0.2} />
                    <Line x1={GAUGE_CENTER_X} y1={GAUGE_CENTER_Y} x2={polarToCartesian(GAUGE_CENTER_X, GAUGE_CENTER_Y, GAUGE_RADIUS - 16, needleAngle).x} y2={polarToCartesian(GAUGE_CENTER_X, GAUGE_CENTER_Y, GAUGE_RADIUS - 16, needleAngle).y} stroke={tuneColor} strokeWidth={3} strokeLinecap="round" />
                    <Circle cx={GAUGE_CENTER_X} cy={GAUGE_CENTER_Y} r={8} fill={t.bg} stroke={tuneColor} strokeWidth={4} />
                  </G>
                )}
              </Svg>
            </View>

            {micAvailable && (
              <TouchableOpacity style={[styles.listenBtn, { backgroundColor: isRecording ? t.bg2 : t.accent, borderColor: isRecording ? tuneColor : t.accent }]} onPress={toggleListening}>
                <Ionicons name={isRecording ? 'stop' : 'mic'} size={20} color={isRecording ? tuneColor : '#fff'} />
                <Text style={[styles.listenBtnTxt, { color: isRecording ? tuneColor : '#fff' }]}>{isRecording ? 'Stop Listening' : 'Start Listening'}</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity style={[styles.tuningInlineBtn, { backgroundColor: t.bg2, borderColor: t.border }]} onPress={() => setShowTunings(!showTunings)} activeOpacity={0.7}>
              <Ionicons name="musical-note" size={16} color={t.accent} />
              <Text style={[styles.tuningInlineLabel, { color: t.txt1 }]}>{tuning.label}</Text>
              <Ionicons name={showTunings ? 'chevron-up' : 'chevron-down'} size={16} color={t.txt3} />
            </TouchableOpacity>
          </View>
        )}

        {mode === 'play' && (
          <View style={styles.playWrap}>
            <TouchableOpacity style={[styles.tuningInlineBtn, { backgroundColor: t.bg2, borderColor: t.border, alignSelf: 'center', marginBottom: 16 }]} onPress={() => setShowTunings(!showTunings)} activeOpacity={0.7}>
              <Ionicons name="musical-note" size={16} color={t.accent} />
              <Text style={[styles.tuningInlineLabel, { color: t.txt1 }]}>{tuning.label}</Text>
              <Ionicons name={showTunings ? 'chevron-up' : 'chevron-down'} size={16} color={t.txt3} />
            </TouchableOpacity>

            <View style={styles.stringsColumn}>
              {tuningStrings.map((s, i) => {
                const isPlaying = playingStringIdx === i;
                const stringThickness = [3.5, 3, 2.5, 2, 1.5, 1][i]; 
                return (
                  <TouchableOpacity key={i} style={[styles.stringRow]} onPress={() => toggleString(i)} activeOpacity={0.6}>
                    <Text style={[styles.stringNum, { color: isPlaying ? t.accent : t.txt3 }]}>{6 - i}</Text>
                    <View style={styles.stringLineWrap}>
                      <View style={[ styles.stringLine, { height: stringThickness, backgroundColor: isPlaying ? t.accent : t.border } ]} />
                      {isPlaying && <View style={[styles.stringGlow, { backgroundColor: t.accent + '20' }]} />}
                    </View>
                    <View style={[ styles.stringNoteBubble, { backgroundColor: isPlaying ? t.accent : t.bg2, borderColor: isPlaying ? t.accent : t.border } ]}>
                      <Text style={[styles.stringNoteTxt, { color: isPlaying ? '#fff' : t.txt1 }]}>{s.name.replace(/[0-9]/g, '')}</Text>
                    </View>
                    <Text style={[styles.stringHz, { color: isPlaying ? t.accent : t.txt3 }]}>{s.hz.toFixed(1)} Hz</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={[styles.playHint, { color: t.txt3 }]}>tap to play · tap again to stop</Text>
          </View>
        )}

        {/* ❌ The stupid ass string bar has been completely deleted from here! */}

      </View>

      <View style={[styles.bottomBar, { backgroundColor: t.bg, borderTopColor: t.border }]}>
        <TouchableOpacity style={[ styles.bottomBtn, mode === 'listen' ? { backgroundColor: t.accent, borderColor: t.accent } : { backgroundColor: t.bg2, borderColor: t.border } ]} onPress={() => { setMode('listen'); setActiveStringIdx(null); setPlayingStringIdx(null); onStopTone(); }} activeOpacity={0.75}>
          <Ionicons name="mic" size={20} color={mode === 'listen' ? '#fff' : t.txt2} />
          <Text style={[styles.bottomBtnTxt, { color: mode === 'listen' ? '#fff' : t.txt2 }]}>Listen</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[ styles.bottomBtn, mode === 'play' ? { backgroundColor: t.accent, borderColor: t.accent } : { backgroundColor: t.bg2, borderColor: t.border } ]} onPress={() => { setMode('play'); if (isRecording) { stopListening(); setIsRecording(false); } setPitchInfo(null); setActiveStringIdx(null); setPlayingStringIdx(null); onStopTone(); }} activeOpacity={0.75}>
          <Ionicons name="volume-high" size={20} color={mode === 'play' ? '#fff' : t.txt2} />
          <Text style={[styles.bottomBtnTxt, { color: mode === 'play' ? '#fff' : t.txt2 }]}>Play</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  bottomBar: { flexDirection: 'row', borderTopWidth: 1, paddingVertical: 12, paddingHorizontal: 16, gap: 12, paddingBottom: Platform.OS === 'ios' ? 24 : 12 },
  bottomBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: 56, borderRadius: 20, borderWidth: 1, gap: 8 },
  bottomBtnTxt: { fontWeight: '700', fontSize: 15 },
  tuningInlineBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 16, borderRadius: 20, borderWidth: 1, marginTop: 16 },
  tuningInlineLabel: { fontSize: 14, fontWeight: '700' },
  modalBox: { width: '100%', padding: 20, borderRadius: 16, borderWidth: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 10 },
  modalTitle: { fontSize: 24, fontWeight: '800', letterSpacing: 0.5, marginBottom: 16 },
  modalBtnRow: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 16 },
  modalBtn: { paddingVertical: 12, paddingHorizontal: 20, borderRadius: 8 },
  tuningOverlayItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16 },
  tuningOverlayLabel: { fontSize: 15, fontWeight: '700' },
  tuningOverlayNotes: { fontSize: 12, fontWeight: '500', marginTop: 2 },
  
  gaugeWrap: { alignItems: 'center', marginTop: 32, flex: 1, justifyContent: 'center' },
  svgContainer: { position: 'relative', width: GAUGE_SVG_W, height: GAUGE_CENTER_Y + 10 },
  centerNoteDisplay: { position: 'absolute', width: '100%', alignItems: 'center', justifyContent: 'center' },
  noteText: { fontSize: 72, fontWeight: '900', letterSpacing: -2, lineHeight: 80 },
  centsText: { fontSize: 14, fontWeight: '700', letterSpacing: 1 },
  
  listenBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 28, paddingVertical: 16, borderRadius: 30, marginTop: 40, borderWidth: 2 },
  listenBtnTxt: { fontWeight: '800', fontSize: 16 },
  playWrap: { flex: 1, paddingHorizontal: 16, paddingTop: 32, justifyContent: 'center' },
  playHint: { textAlign: 'center', fontSize: 12, fontWeight: '600', marginTop: 20, opacity: 0.4 },
  stringsColumn: { gap: 0 },
  stringRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 8 },
  stringNum: { fontSize: 13, fontWeight: '800', width: 20, textAlign: 'center' },
  stringLineWrap: { flex: 1, height: 20, justifyContent: 'center', marginHorizontal: 10, position: 'relative' },
  stringLine: { width: '100%', borderRadius: 4 },
  stringGlow: { position: 'absolute', width: '100%', height: 14, borderRadius: 7, top: 3 },
  stringNoteBubble: { width: 44, height: 44, borderRadius: 22, borderWidth: 1.5, justifyContent: 'center', alignItems: 'center', marginRight: 8 },
  stringNoteTxt: { fontSize: 16, fontWeight: '800' },
  stringHz: { fontSize: 13, fontWeight: '700', width: 58, textAlign: 'right' },
  stringBar: { flexDirection: 'row', justifyContent: 'space-around', marginHorizontal: 20, marginBottom: 24, paddingVertical: 12, borderRadius: 16, borderWidth: 1 },
  stringIndicator: { width: 48, height: 48, borderRadius: 24, borderWidth: 1.5, justifyContent: 'center', alignItems: 'center' },
  stringIndicatorTxt: { fontSize: 14, fontWeight: '800' },
});