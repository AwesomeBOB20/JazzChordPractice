import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Dimensions,
  Platform, Animated, TouchableWithoutFeedback, ScrollView
} from 'react-native';
import Svg, { Line, G, Text as SvgText, Polyline, Defs, ClipPath, Rect } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useSettingsStore } from '@features/settings/store/settingsStore';
import { THEMES } from '@shared/ui/themes';
import { familyForWeight } from '@shared/fonts/fonts';
import { useAudio } from '@shared/audio/AudioContext';
import { startListening, stopListening, addPitchListener } from '../../../../modules/native-tuner';
import { Audio } from 'expo-av';
import { LinearGradient } from 'expo-linear-gradient';
import { PopUpModal } from '@shared/ui/SharedModals';
import { AdBanner } from '@features/ads/AdBanner';
import { useInterstitial } from '@features/ads/useInterstitial';
import { INTERSTITIAL_TUNER_LISTEN_MS } from '@features/ads/adConfig';

const TUNINGS: Record<string, { label: string; strings: { name: string; midi: number; hz: number }[] }> = {
  standard: { label: 'Standard', strings: [ { name: 'E2', midi: 40, hz: 82.41 }, { name: 'A2', midi: 45, hz: 110.0 }, { name: 'D3', midi: 50, hz: 146.83 }, { name: 'G3', midi: 55, hz: 196.0 }, { name: 'B3', midi: 59, hz: 246.94 }, { name: 'E4', midi: 64, hz: 329.63 } ] },
  dropD: { label: 'Drop D', strings: [ { name: 'D2', midi: 38, hz: 73.42 }, { name: 'A2', midi: 45, hz: 110.0 }, { name: 'D3', midi: 50, hz: 146.83 }, { name: 'G3', midi: 55, hz: 196.0 }, { name: 'B3', midi: 59, hz: 246.94 }, { name: 'E4', midi: 64, hz: 329.63 } ] },
  halfStepDown: { label: '½ Step Down', strings: [ { name: 'Eb2', midi: 39, hz: 77.78 }, { name: 'Ab2', midi: 44, hz: 103.83 }, { name: 'Db3', midi: 49, hz: 138.59 }, { name: 'Gb3', midi: 54, hz: 185.0 }, { name: 'Bb3', midi: 58, hz: 233.08 }, { name: 'Eb4', midi: 63, hz: 311.13 } ] },
  openG: { label: 'Open G', strings: [ { name: 'D2', midi: 38, hz: 73.42 }, { name: 'G2', midi: 43, hz: 98.0 }, { name: 'D3', midi: 50, hz: 146.83 }, { name: 'G3', midi: 55, hz: 196.0 }, { name: 'B3', midi: 59, hz: 246.94 }, { name: 'D4', midi: 62, hz: 293.66 } ] },
  dadgad: { label: 'DADGAD', strings: [ { name: 'D2', midi: 38, hz: 73.42 }, { name: 'A2', midi: 45, hz: 110.0 }, { name: 'D3', midi: 50, hz: 146.83 }, { name: 'G3', midi: 55, hz: 196.0 }, { name: 'A3', midi: 57, hz: 220.0 }, { name: 'D4', midi: 62, hz: 293.66 } ] },
};

const TUNING_KEYS = Object.keys(TUNINGS);
const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// Time-based smoothing constants (frame-rate independent: k = 1 - exp(-dt / TAU))
const TAU_SMOOTH_MS = 70;   // pitch smoothing time-constant (~SMOOTHING_FACTOR 0.35 @ 10Hz)
const TAU_CENTER_MS = 150;  // chart center slide time-constant
const WINDOW_MS = 4000;     // visible history window for the polyline
const HISTORY_CAP = 240;    // max points kept in history ring

// Glitch rejection: a frame-to-frame jump larger than this (semitones) is treated
// as suspect (octave error / transient) and must be confirmed by the next sample
// before it's accepted. Continuous moves (slides, vibrato) pass straight through.
const JUMP_GATE_SEMITONES = 1.5;
// Polyline segment break: if two kept samples are farther apart in time than this,
// the detector dropped out — start a new line segment instead of connecting them.
const GAP_BREAK_MS = 220;

// UI Constants
const SCREEN_WIDTH = Dimensions.get('window').width;
const SCREEN_HEIGHT = Dimensions.get('window').height;
const GRAPH_WIDTH = SCREEN_WIDTH;
const NOTE_SCALE_WIDTH = 44;
const GRAPH_AREA_WIDTH = GRAPH_WIDTH - NOTE_SCALE_WIDTH;
const GRAPH_CENTER_X = NOTE_SCALE_WIDTH + GRAPH_AREA_WIDTH / 2;
const VISIBLE_SEMITONE_RANGE = 10; // How many semitones to show vertically
const HEADROOM_SEMITONES = 0.9; // Bias the chart so the live pitch line never touches the top

// Selectable Play-mode reference tones (ids match TONE_PRESETS in audioEngine.ts).
// Sustained, mellow FM reference tones (ids match FM_PRESETS in audioEngine.ts). Each holds at a flat
// volume until tapped off.
const TUNER_TONES: { id: string; label: string }[] = [
  { id: 'sine', label: 'Sine' },
  { id: 'warm', label: 'Warm' },
  { id: 'hollow', label: 'Hollow' },
  { id: 'reed', label: 'Reed' },
  { id: 'velvet', label: 'Velvet' },
];
const DEFAULT_TONE = 'warm';

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
  const insets = useSafeAreaInsets();
  const { playTone, stopAudio, stopTone } = useAudio();
  const { theme, referenceFrequency, fontFamily, isPro, openPaywall, tunerTone, setTunerTone } = useSettingsStore();
  const svgFont = familyForWeight(fontFamily, '700');
  const t = THEMES[theme];
  // Clamp a legacy/unknown stored value onto a real tone so a chip is always active.
  const activeTone = TUNER_TONES.some(x => x.id === tunerTone) ? tunerTone : DEFAULT_TONE;
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null); // auto-stops a sound-preview audition

  // The mic-based pitch detector is implemented in the Android native module only;
  // the iOS native module is still a stub, so Listen mode would do nothing on iPhone.
  // Hide it there and default to Play mode until the iOS pitch detector is ported.
  const micAvailable = Platform.OS !== 'ios';
  const [mode, setMode] = useState<'listen' | 'play'>(micAvailable ? 'listen' : 'play');
  const [tuningKey, setTuningKey] = useState('standard');
  const [showTunings, setShowTunings] = useState(false);
  // Tuning-list scroll position → drives the top/bottom fade overlays (only shown where content overflows).
  const [tuningScroll, setTuningScroll] = useState({ y: 0, viewH: 0, contentH: 0 });
  const tuningAtTop = tuningScroll.y <= 4;
  const tuningCanScrollDown = tuningScroll.contentH - tuningScroll.viewH - tuningScroll.y > 4;
  const tuning = TUNINGS[tuningKey];

  const tuningStrings = tuning.strings.map(s => ({ ...s, hz: referenceFrequency * Math.pow(2, (s.midi - 69) / 12) }));

  const [isRecording, setIsRecording] = useState(false);

  // Time-based interstitial: while actively listening, fire one every few minutes (everyN:1
  // means each recordAction shows the loaded ad). The timer resets when listening stops/starts.
  const { recordAction: recordListenTime } = useInterstitial({ everyN: 1 });
  useEffect(() => {
    if (mode !== 'listen' || !isRecording) return;
    const id = setInterval(() => { recordListenTime(); }, INTERSTITIAL_TUNER_LISTEN_MS);
    return () => clearInterval(id);
  }, [mode, isRecording, recordListenTime]);
  const [playingStringIdx, setPlayingStringIdx] = useState<number | null>(null);
  const [flexHeight, setFlexHeight] = useState<number>(300);

  // Producer side (written from the native pitch listener; no setState here)
  const latestNoteFloatRef = useRef<number | null>(null); // raw most-recent sample
  const lastSampleAtRef = useRef<number>(0);
  const historyRef = useRef<{ t: number; noteFloat: number }[]>([]);

  // Glitch-gate state: last accepted sample + a held candidate awaiting confirmation.
  const lastAcceptedNoteFloatRef = useRef<number | null>(null);
  const pendingJumpRef = useRef<number | null>(null);

  // Consumer side (driven by the rAF loop)
  const smoothedNoteFloatRef = useRef<number | null>(null);
  const centerNoteFloatRef = useRef<number | null>(null);

  // Single render-tick state: bumped once per frame by the rAF loop.
  const [renderTick, setRenderTick] = useState(0);

  const hasLockedInRef = useRef(false);
  const lastHapticTimeRef = useRef(0);

  // --- Pitch event producer: write refs only, never setState. ---
  useEffect(() => {
    const subscription = addPitchListener((event) => {
      const now = Date.now();
      const pitchHz = event.frequency;

      if (pitchHz && pitchHz > 60 && pitchHz < 1500) {
        const noteFloat = 12 * Math.log2(pitchHz / referenceFrequency) + 69;

        // --- Glitch gate ---
        // Small, continuous moves pass straight through (responsive). A large
        // single-frame jump is held as a candidate and only accepted once the
        // NEXT sample confirms it lives in the same new region — so a lone
        // octave-error spike is dropped, but a real note leap registers after
        // one frame. Prevents the near-vertical streaks on the trace.
        const lastAccepted = lastAcceptedNoteFloatRef.current;
        if (lastAccepted !== null && Math.abs(noteFloat - lastAccepted) > JUMP_GATE_SEMITONES) {
          const pending = pendingJumpRef.current;
          if (pending === null || Math.abs(noteFloat - pending) > JUMP_GATE_SEMITONES) {
            // First suspect sample (or a candidate that didn't repeat): hold, don't plot.
            pendingJumpRef.current = noteFloat;
            return;
          }
          // Confirmed by a second nearby sample → genuine leap, let it through.
        }
        pendingJumpRef.current = null;
        lastAcceptedNoteFloatRef.current = noteFloat;

        latestNoteFloatRef.current = noteFloat;
        lastSampleAtRef.current = now;

        // Push raw sample into history ring; rAF loop is responsible for rendering.
        const hist = historyRef.current;
        hist.push({ t: now, noteFloat });
        if (hist.length > HISTORY_CAP) hist.splice(0, hist.length - HISTORY_CAP);

        // Haptics are event-driven (lock-in feel), not visual; keep here.
        // Use raw noteFloat cents for haptic decision.
        const noteIndex = Math.round(noteFloat);
        const cents = (noteFloat - noteIndex) * 100;
        if (Math.abs(cents) <= 2.5) {
          if (!hasLockedInRef.current && now - lastHapticTimeRef.current > 500) {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
            hasLockedInRef.current = true;
            lastHapticTimeRef.current = now;
          }
        } else if (Math.abs(cents) > 8) {
          hasLockedInRef.current = false;
        }
      }
    });

    return () => {
      subscription.remove();
      stopListening();
    };
  }, [referenceFrequency]);

  // --- 60fps render loop: lerps smoothing/center, drops stale history, bumps state once per frame. ---
  useEffect(() => {
    if (!isRecording) return;
    let raf = 0;
    let lastFrameAt = 0;

    const tick = (tsMs: number) => {
      const now = Date.now();
      const dt = lastFrameAt === 0 ? 16 : Math.min(64, tsMs - lastFrameAt);
      lastFrameAt = tsMs;

      const target = latestNoteFloatRef.current;
      if (target !== null) {
        // Smoothing (frame-rate independent)
        const kSmooth = 1 - Math.exp(-dt / TAU_SMOOTH_MS);
        if (
          smoothedNoteFloatRef.current === null ||
          Math.abs(target - smoothedNoteFloatRef.current) > 2
        ) {
          smoothedNoteFloatRef.current = target; // snap on big jumps / first sample
        } else {
          smoothedNoteFloatRef.current += (target - smoothedNoteFloatRef.current) * kSmooth;
        }

        // Center slide (frame-rate independent)
        const kCenter = 1 - Math.exp(-dt / TAU_CENTER_MS);
        const sm = smoothedNoteFloatRef.current as number;
        if (centerNoteFloatRef.current === null) {
          centerNoteFloatRef.current = sm;
        } else {
          centerNoteFloatRef.current += (sm - centerNoteFloatRef.current) * kCenter;
        }
      }

      // Drop history points older than the visible window (+ small margin).
      const hist = historyRef.current;
      const cutoff = now - WINDOW_MS - 200;
      let drop = 0;
      while (drop < hist.length && hist[drop].t < cutoff) drop++;
      if (drop > 0) hist.splice(0, drop);

      setRenderTick((n) => (n + 1) | 0);
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isRecording]);

  const toggleListening = useCallback(async () => {
    if (isRecording) {
      stopListening();
      setIsRecording(false);
      hasLockedInRef.current = false;
      smoothedNoteFloatRef.current = null;
      centerNoteFloatRef.current = null;
      latestNoteFloatRef.current = null;
      lastAcceptedNoteFloatRef.current = null;
      pendingJumpRef.current = null;
      historyRef.current = [];
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

  const toggleString = useCallback((stringIdx: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (previewTimerRef.current) { clearTimeout(previewTimerRef.current); previewTimerRef.current = null; }
    // Tap the sounding string again to stop it — gentle tone fade, never a STOP_ALL hard cut.
    if (playingStringIdx === stringIdx) { stopTone(); setPlayingStringIdx(null); return; }
    // Switch strings: play directly. PLAY_TONE crossfades the previous tone out over its own
    // 60ms window while the new one swells in — one clean handoff. The old stopAudio()+30ms
    // delay fired a STOP_ALL hard-cut then re-triggered, which is what popped on every tap.
    playTone(tuningStrings[stringIdx].midi, 100, activeTone);
    setPlayingStringIdx(stringIdx);
  }, [tuningStrings, playTone, stopTone, playingStringIdx, activeTone]);

  // Pick a timbre (from the tuning popup) and audition it: if a string is held, swap it to the new tone
  // (keeps holding); otherwise sound a short preview (on A) that auto-stops so it doesn't drone.
  const pickTone = useCallback((id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTunerTone(id);
    if (previewTimerRef.current) { clearTimeout(previewTimerRef.current); previewTimerRef.current = null; }
    if (playingStringIdx !== null) {
      playTone(tuningStrings[playingStringIdx].midi, 100, id);
    } else {
      playTone(57, 100, id); // A3 → engine sounds A4
      previewTimerRef.current = setTimeout(() => { stopAudio(); previewTimerRef.current = null; }, 850);
    }
  }, [setTunerTone, playingStringIdx, tuningStrings, playTone, stopAudio]);

  // Read live values out of refs (re-read every render-tick driven by the rAF loop).
  // `renderTick` is referenced so React doesn't bail on the dependency.
  void renderTick;
  const liveSmoothed = smoothedNoteFloatRef.current;
  const liveSmoothedHz = liveSmoothed !== null
    ? referenceFrequency * Math.pow(2, (liveSmoothed - 69) / 12)
    : null;
  const livePitchInfo = liveSmoothedHz !== null ? calculatePitch(liveSmoothedHz, referenceFrequency) : null;
  const cents = livePitchInfo?.cents ?? 0;
  const inTune = Math.abs(cents) <= 3;
  const tuneColor = inTune ? '#639922' : Math.abs(cents) <= 15 ? '#D4A853' : '#D4537E';

  // Y-axis grid generation. Use a continuous (lerped) center plus a downward
  // bias so the live pitch line never reaches the top of the chart.
  const liveCenter = centerNoteFloatRef.current;
  const displayCenter = (isRecording && liveCenter !== null ? liveCenter : 50) + HEADROOM_SEMITONES;
  const highlightMidi = livePitchInfo ? livePitchInfo.midi : Math.round(displayCenter - HEADROOM_SEMITONES);
  const gridLines = [];
  const halfRange = Math.ceil(VISIBLE_SEMITONE_RANGE / 2) + 1;
  const centerInt = Math.round(displayCenter);
  const effectiveHeight = flexHeight || 300;

  for (let i = centerInt - halfRange; i <= centerInt + halfRange; i++) {
    // Map MIDI note distance to Y coordinate (continuous center -> smooth slide)
    const yOffset = ((i - displayCenter) / VISIBLE_SEMITONE_RANGE) * effectiveHeight;
    const y = effectiveHeight / 2 - yOffset;

    const noteName = NOTES[((i % 12) + 12) % 12];
    const octave = Math.floor(i / 12) - 1;
    gridLines.push({ midi: i, y, label: `${noteName}${octave}` });
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      
      <PopUpModal visible={showTunings} onClose={() => setShowTunings(false)}>
        <View style={[styles.modalBox, { backgroundColor: t.bg2, borderColor: t.border }]}>
          {/* Sound — one-row horizontal scroller of timbres; tapping auditions it immediately. */}
          <Text style={[styles.modalTitle, { color: t.txt1 }]}>Sound</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.toneRow} contentContainerStyle={{ gap: 8, paddingRight: 4 }}>
            {TUNER_TONES.map(tone => {
              const active = activeTone === tone.id;
              return (
                <TouchableOpacity
                  key={tone.id}
                  activeOpacity={0.7}
                  onPress={() => pickTone(tone.id)}
                  style={[styles.toneChip, { borderColor: active ? t.accent : t.border, backgroundColor: active ? t.accent : t.bg2 }]}
                >
                  <Text style={{ fontSize: 13, fontWeight: '700', color: active ? '#fff' : t.txt2 }}>{tone.label}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          {/* Tuning — vertical scroller (capped) so a long list can't push Close off-screen. flexGrow:0
              so the ScrollView HUGS its content (RN ScrollViews default to flexGrow:1 and would otherwise
              stretch the whole popup to full height). */}
          <Text style={[styles.modalTitle, { color: t.txt1 }]}>Tuning</Text>
          {/* position:relative so the fade overlays sit over the scroll edges (same look as elsewhere). */}
          <View style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: t.border }}>
            <ScrollView
              style={{ maxHeight: SCREEN_HEIGHT * 0.3, flexGrow: 0, flexShrink: 1 }}
              showsVerticalScrollIndicator={true}
              scrollEventThrottle={16}
              onLayout={(e) => setTuningScroll(s => ({ ...s, viewH: e.nativeEvent.layout.height }))}
              onContentSizeChange={(_w, h) => setTuningScroll(s => ({ ...s, contentH: h }))}
              onScroll={(e) => setTuningScroll(s => ({ ...s, y: e.nativeEvent.contentOffset.y }))}
            >
              {TUNING_KEYS.map((key, index) => {
                const selected = tuningKey === key;
                const tu = TUNINGS[key];
                // Only Standard is free; every alternate tuning is Pro.
                const locked = key !== 'standard' && !isPro;
                return (
                  <TouchableOpacity key={key} style={[ styles.tuningOverlayItem, selected && { backgroundColor: t.accent + '18' }, index !== TUNING_KEYS.length - 1 && { borderBottomWidth: 1, borderBottomColor: t.border } ]}
                    onPress={() => { if (locked) { setShowTunings(false); openPaywall('tuner'); return; } setTuningKey(key); setShowTunings(false); setPlayingStringIdx(null); stopAudio(); }}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.tuningOverlayLabel, { color: selected ? t.accent : t.txt1 }]}>{tu.label}</Text>
                      <Text style={[styles.tuningOverlayNotes, { color: t.txt3 }]}>{tu.strings.map(s => s.name.replace(/[0-9]/g, '')).join(' · ')}</Text>
                    </View>
                    {locked ? <Ionicons name="lock-closed" size={16} color={t.txt3} /> : (selected && <Ionicons name="checkmark" size={20} color={t.accent} />)}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            {/* Fade the clipped items at the edges — top when scrolled down, bottom when more below. */}
            {!tuningAtTop && <LinearGradient colors={[t.bg2, 'transparent']} style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 22, zIndex: 10 }} pointerEvents="none" />}
            {tuningCanScrollDown && <LinearGradient colors={['transparent', t.bg2]} style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 32, zIndex: 10 }} pointerEvents="none" />}
          </View>
          <View style={styles.modalBtnRow}>
            <TouchableOpacity style={styles.modalBtn} onPress={() => setShowTunings(false)}><Text style={{ color: t.txt3, fontSize: 16, fontWeight: '600' }}>Close</Text></TouchableOpacity>
          </View>
        </View>
      </PopUpModal>

      <AdBanner />
      <ScrollView style={{ flex: 1 }} scrollEnabled={false} showsVerticalScrollIndicator={false} contentContainerStyle={{ flexGrow: 1 }}>
        <View style={styles.container}>
        {mode === 'listen' && (
          <View style={{ flex: 1 }}>
            {isRecording && livePitchInfo && liveSmoothedHz !== null && (
              <>
                <View style={{ alignItems: 'center', paddingTop: 12, paddingBottom: 8 }}>
                  <Text style={{ fontSize: 44, fontWeight: '700', color: t.txt1 }}>{livePitchInfo.fullName}</Text>
                  <Text style={{ fontSize: 16, fontWeight: '600', color: tuneColor }}>
                    {cents > 0 ? '+' : ''}{cents.toFixed(1)} cents
                  </Text>
                  <Text style={{ fontSize: 14, fontWeight: '500', color: t.txt3 }}>
                    {liveSmoothedHz.toFixed(1)} Hz
                  </Text>
                </View>

                {/* Horizontal divider between note display and pitch monitor */}
                <View style={{ width: '100%', height: 1, backgroundColor: t.border }} />
              </>
            )}

            <View
              style={[styles.listenLayout, { flex: 1 }]}
              onLayout={(e) => {
                const h = e.nativeEvent.layout.height;
                if (h && h > 0) {
                  setFlexHeight(h);
                }
              }}
            >
            <Svg width="100%" height="100%" viewBox={`0 0 ${GRAPH_WIDTH} ${flexHeight || 300}`} preserveAspectRatio="none">
              <Defs>
                <ClipPath id="chartClip">
                  <Rect x={NOTE_SCALE_WIDTH} y={0} width={GRAPH_AREA_WIDTH} height={flexHeight || 300} />
                </ClipPath>
              </Defs>

              {/* Draw Note Scale Grid */}
              {gridLines.map((line) => (
                <G key={line.midi}>
                  <Line
                    x1={NOTE_SCALE_WIDTH} y1={line.y}
                    x2={GRAPH_WIDTH} y2={line.y}
                    stroke={t.border}
                    strokeWidth={1.5}
                    strokeDasharray="6, 4"
                    opacity={0.5}
                  />
                  <SvgText
                    x={NOTE_SCALE_WIDTH / 2} y={line.y + 4}
                    fill={t.txt3}
                    fontSize={13}
                    fontWeight="700"
                    textAnchor="middle"
                    fontFamily={svgFont}
                  >
                    {line.label}
                  </SvgText>
                </G>
              ))}

              {/* Vertical divider between note-name gutter and chart area */}
              <Line
                x1={NOTE_SCALE_WIDTH} y1={0}
                x2={NOTE_SCALE_WIDTH} y2={flexHeight || 300}
                stroke={t.border}
                strokeWidth={1}
                opacity={0.6}
              />

              {/* Graph Polyline (clipped to chart area so it never crosses the gutter).
                  X is computed from elapsed time so the trace scrolls smoothly between
                  pitch samples at 60fps instead of stair-stepping per-event. */}
              {isRecording && historyRef.current.length > 1 && (() => {
                const nowMs = Date.now();
                const halfW = GRAPH_AREA_WIDTH / 2;
                const h = flexHeight || 300;
                const hist = historyRef.current;
                // Split into segments wherever the detector dropped out, so a
                // silence-then-resume isn't drawn as one connecting line.
                const segments: string[] = [];
                let pts = '';
                let prevT: number | null = null;
                for (let i = 0; i < hist.length; i++) {
                  const p = hist[i];
                  const age = nowMs - p.t;
                  if (age > WINDOW_MS) continue;
                  if (prevT !== null && p.t - prevT > GAP_BREAK_MS) {
                    if (pts) segments.push(pts);
                    pts = '';
                  }
                  const x = GRAPH_CENTER_X - (age / WINDOW_MS) * halfW;
                  const yOffset = ((p.noteFloat - displayCenter) / VISIBLE_SEMITONE_RANGE) * h;
                  const y = h / 2 - yOffset;
                  pts += (pts ? ' ' : '') + x + ',' + y;
                  prevT = p.t;
                }
                if (pts) segments.push(pts);
                if (!segments.length) return null;
                return segments.map((seg, idx) => (
                  <Polyline
                    key={idx}
                    clipPath="url(#chartClip)"
                    points={seg}
                    fill="none"
                    stroke={tuneColor}
                    strokeWidth={2.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ));
              })()}

              {/* Vertical Center Indicator line */}
              {isRecording && (
                 <Line
                    x1={GRAPH_CENTER_X} y1={0}
                    x2={GRAPH_CENTER_X} y2={flexHeight || 300}
                    stroke={tuneColor}
                    strokeWidth={1}
                    opacity={0.3}
                 />
              )}
            </Svg>
          </View>
          </View>
        )}

        {mode === 'play' && (
          <View style={styles.playWrap}>
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
          </View>
        )}
        </View>
      </ScrollView>

      <View style={[styles.dock, { backgroundColor: t.bg, borderTopColor: t.border }]}>
        <View style={styles.actionRow}>
          {micAvailable && (
            <TouchableOpacity style={[ styles.actionBtn, mode === 'listen' ? { backgroundColor: t.accent, borderColor: t.accent } : { backgroundColor: t.bg2, borderColor: t.border } ]} onPress={() => { setMode('listen'); setPlayingStringIdx(null); stopAudio(); }} activeOpacity={0.75}>
              <Ionicons name="mic" size={20} color={mode === 'listen' ? '#fff' : t.txt2} />
              <Text style={[styles.actionBtnTxt, { color: mode === 'listen' ? '#fff' : t.txt2 }]}>Listen</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={[ styles.actionBtn, mode === 'play' ? { backgroundColor: t.accent, borderColor: t.accent } : { backgroundColor: t.bg2, borderColor: t.border } ]} onPress={() => { setMode('play'); if (isRecording) { stopListening(); setIsRecording(false); } setPlayingStringIdx(null); stopAudio(); }} activeOpacity={0.75}>
            <Ionicons name="volume-high" size={20} color={mode === 'play' ? '#fff' : t.txt2} />
            <Text style={[styles.actionBtnTxt, { color: mode === 'play' ? '#fff' : t.txt2 }]}>Play</Text>
          </TouchableOpacity>
          {mode === 'listen' && micAvailable ? (
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                toggleListening();
              }}
              style={[styles.tunerActionBtn, { backgroundColor: isRecording ? '#D4537E' : '#639922' }]}
            >
              <Ionicons name={isRecording ? 'stop' : 'play'} size={26} color="#fff" />
            </TouchableOpacity>
          ) : mode === 'play' ? (
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setShowTunings(!showTunings);
              }}
              style={[styles.tunerActionBtn, { backgroundColor: '#639922' }]}
            >
              <Ionicons name="options" size={26} color="#fff" />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  dock: { borderTopWidth: 1, paddingVertical: 12, paddingBottom: Platform.OS === 'ios' ? 24 : 12 },
  actionRow: { flexDirection: 'row', gap: 12, marginHorizontal: 16 },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: 56, borderRadius: 20, borderWidth: 1, gap: 8 },
  actionBtnTxt: { fontWeight: '700', fontSize: 16 },
  tunerActionBtn: { width: 64, height: 56, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  
  modalBox: { width: '100%', padding: 16, borderRadius: 16, borderWidth: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 10 },
  modalTitle: { fontSize: 16, fontWeight: '700', letterSpacing: 0.5, marginBottom: 8 },
  modalBtnRow: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 8 },
  modalBtn: { paddingVertical: 10, paddingHorizontal: 20, borderRadius: 8 },
  tuningOverlayItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 16 },
  tuningOverlayLabel: { fontSize: 16, fontWeight: '700' },
  tuningOverlayNotes: { fontSize: 12, fontWeight: '500', marginTop: 2 },
  
  listenLayout: { width: '100%', overflow: 'hidden' },
  
  playWrap: { flex: 1, paddingHorizontal: 16, paddingTop: 24, justifyContent: 'center' },
  // Horizontal sound scroller: flexGrow:0 so it hugs the chip height instead of stretching vertically.
  toneRow: { flexGrow: 0, marginBottom: 14 },
  toneChip: { paddingHorizontal: 14, height: 34, borderRadius: 17, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
stringsColumn: { gap: 0 },
  stringRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 8 },
  stringNum: { fontSize: 14, fontWeight: '700', width: 20, textAlign: 'center' },
  stringLineWrap: { flex: 1, height: 20, justifyContent: 'center', marginHorizontal: 10, position: 'relative' },
  stringLine: { width: '100%', borderRadius: 4 },
  stringGlow: { position: 'absolute', width: '100%', height: 14, borderRadius: 7, top: 3 },
  stringNoteBubble: { width: 44, height: 44, borderRadius: 22, borderWidth: 1.5, justifyContent: 'center', alignItems: 'center', marginRight: 8 },
  stringNoteTxt: { fontSize: 16, fontWeight: '700' },
  stringHz: { fontSize: 14, fontWeight: '700', width: 58, textAlign: 'right' },
});