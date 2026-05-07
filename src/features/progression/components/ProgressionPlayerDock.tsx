import React, { useState, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, ScrollView } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSettingsStore } from '@features/settings/store/settingsStore';
import { useProgressionStore } from '@features/progression/store/progressionStore';
import { THEMES } from '@shared/ui/themes';
import * as Haptics from 'expo-haptics';

// ── Touch-draggable slider ──────────────────────────────────────────────────
// Renders a labelled horizontal slider with no external dependencies.
// Touching / dragging anywhere on the track sets the value proportionally.
interface MixSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  accent: string;
  border: string;
  bg: string;
  txt3: string;
  onSet: (v: number) => void;
}

function MixSlider({ label, value, min, max, step, unit = '', accent, border, bg, txt3, onSet }: MixSliderProps) {
  const [trackWidth, setTrackWidth] = useState(200);
  const pct = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const fillPx = pct * trackWidth;
  const thumbLeft = Math.max(0, Math.min(trackWidth - 14, fillPx - 7));

  const clamp = (v: number) => {
    const stepped = Math.round(v / step) * step;
    return Math.max(min, Math.min(max, parseFloat(stepped.toFixed(2))));
  };

  const handleTouch = (e: any) => {
    const x = Math.max(0, Math.min(trackWidth, e.nativeEvent.locationX));
    onSet(clamp(min + (x / trackWidth) * (max - min)));
  };

  return (
    <View style={{ marginBottom: 10 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
        <Text style={{ fontSize: 10, fontWeight: '800', letterSpacing: 1, color: txt3 }}>{label}</Text>
        <Text style={{ fontSize: 11, fontWeight: '700', color: accent }}>{value}{unit}</Text>
      </View>
      <View
        onLayout={e => setTrackWidth(e.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => true}
        onResponderGrant={handleTouch}
        onResponderMove={handleTouch}
        style={{ height: 26, justifyContent: 'center' }}
      >
        {/* track background */}
        <View style={{ height: 3, backgroundColor: border, borderRadius: 2 }} />
        {/* filled portion */}
        <View style={{ position: 'absolute', left: 0, top: 11.5, height: 3, width: fillPx, backgroundColor: accent, borderRadius: 2 }} />
        {/* thumb */}
        <View style={{ position: 'absolute', top: 6, left: thumbLeft, width: 14, height: 14, borderRadius: 7, backgroundColor: accent, borderWidth: 2, borderColor: bg }} />
      </View>
    </View>
  );
}

// ── Props ────────────────────────────────────────────────────────────────────
interface Props {
  playingIdx: number | null;
  isPlayingSystem: boolean;
  isLooping: boolean;
  toggleLooping: () => void;
  handlePlayProgression: () => void;
  stopPlayback: () => void;
  onOpenSave: () => void;
  onOpenLib: () => void;
  onClear: () => void;
}

export default function ProgressionPlayerDock({
  playingIdx, isPlayingSystem, isLooping, toggleLooping, handlePlayProgression,
  stopPlayback, onOpenSave, onOpenLib, onClear
}: Props) {
  const {
    theme, metronomeEnabled, setMetronomeEnabled, bassEnabled, setBassEnabled,
    voiceLeading, setVoiceLeading,
    mixChordVol, setMixChordVol,
    mixBassVol,  setMixBassVol,
    mixClickVol, setMixClickVol,
    mixHiCutFreq, setMixHiCutFreq,
    mixHiCutGain, setMixHiCutGain,
  } = useSettingsStore();
  const { rhythm, setRhythm } = useProgressionStore();
  const t = THEMES[theme];

  const [showMixer, setShowMixer] = useState(false);

  const RHYTHMS = [
    { key: 'straight', label: 'Straight' }, { key: 'swing', label: 'Swing' },
    { key: 'bossanova', label: 'Bossa' }, { key: 'waltz', label: 'Waltz' },
    { key: 'twostep', label: 'Two-Step' }, { key: 'reggae', label: 'Reggae' }
  ];

  return (
    <View style={[styles.stickyPlayer, { backgroundColor: t.bg, borderTopColor: t.border, borderTopWidth: 1 }]}>

      {/* INLINE ENGINE CONTROLS */}
      {!isPlayingSystem && (
        <View style={{ marginBottom: 12 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
            <TouchableOpacity activeOpacity={0.7} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setMetronomeEnabled(!metronomeEnabled); }} style={[styles.enginePill, { backgroundColor: metronomeEnabled ? t.accent : t.bg2, borderColor: metronomeEnabled ? t.accent : t.border }]}>
              <MaterialCommunityIcons name="metronome" size={16} color={metronomeEnabled ? '#fff' : t.txt2} />
              <Text style={[styles.enginePillTxt, { color: metronomeEnabled ? '#fff' : t.txt2 }]}>Click</Text>
            </TouchableOpacity>

            <TouchableOpacity activeOpacity={0.7} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setBassEnabled(!bassEnabled); }} style={[styles.enginePill, { backgroundColor: bassEnabled ? t.accent : t.bg2, borderColor: bassEnabled ? t.accent : t.border }]}>
              <Ionicons name="musical-notes" size={16} color={bassEnabled ? '#fff' : t.txt2} />
              <Text style={[styles.enginePillTxt, { color: bassEnabled ? '#fff' : t.txt2 }]}>Bass</Text>
            </TouchableOpacity>

            <TouchableOpacity activeOpacity={0.7} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setVoiceLeading(!voiceLeading); }} style={[styles.enginePill, { backgroundColor: voiceLeading ? t.accent : t.bg2, borderColor: voiceLeading ? t.accent : t.border }]}>
              <MaterialCommunityIcons name="transit-connection-variant" size={16} color={voiceLeading ? '#fff' : t.txt2} />
              <Text style={[styles.enginePillTxt, { color: voiceLeading ? '#fff' : t.txt2 }]}>Voice Lead</Text>
            </TouchableOpacity>

            <TouchableOpacity activeOpacity={0.7} onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              const curIdx = RHYTHMS.findIndex(r => r.key === rhythm);
              setRhythm(RHYTHMS[(curIdx + 1) % RHYTHMS.length].key as any);
            }} style={[styles.enginePill, { backgroundColor: rhythm !== 'straight' ? t.accent : t.bg2, borderColor: rhythm !== 'straight' ? t.accent : t.border }]}>
              {/* Swapped to MaterialCommunityIcons 'drum' */}
              <MaterialCommunityIcons name="pulse" size={16} color={rhythm !== 'straight' ? '#fff' : t.txt2} />
              <Text style={[styles.enginePillTxt, { color: rhythm !== 'straight' ? '#fff' : t.txt2 }]}>
                {RHYTHMS.find(r => r.key === rhythm)?.label || 'Straight'}
              </Text>
            </TouchableOpacity>

            {/* MIX toggle pill */}
            <TouchableOpacity activeOpacity={0.7} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowMixer(s => !s); }} style={[styles.enginePill, { backgroundColor: showMixer ? t.accent : t.bg2, borderColor: showMixer ? t.accent : t.border }]}>
              <Ionicons name="options-outline" size={16} color={showMixer ? '#fff' : t.txt2} />
              <Text style={[styles.enginePillTxt, { color: showMixer ? '#fff' : t.txt2 }]}>Mix</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      )}

      {/* MIXER PANEL — shown when Mix pill is toggled and not playing */}
      {!isPlayingSystem && showMixer && (
        <View style={{ paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: t.border, marginBottom: 12 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <Text style={{ fontSize: 9, fontWeight: '800', letterSpacing: 2, color: t.txt3 }}>MIXER</Text>
            <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setMixChordVol(80);
              setMixBassVol(70);
              setMixClickVol(80);
              setMixHiCutFreq(3500);
              setMixHiCutGain(-8);
            }}>
              <Text style={{ fontSize: 10, fontWeight: '800', color: t.accent }}>RESET</Text>
            </TouchableOpacity>
          </View>

          {/* CHORD — master chord instrument level */}
          <MixSlider
            label="CHORD"
            value={mixChordVol} min={0} max={100} step={1} unit="%"
            accent={t.accent} border={t.border} bg={t.bg} txt3={t.txt3}
            onSet={setMixChordVol}
          />

          {/* BASS — bass instrument level */}
          <MixSlider
            label="BASS"
            value={mixBassVol} min={0} max={100} step={1} unit="%"
            accent={t.accent} border={t.border} bg={t.bg} txt3={t.txt3}
            onSet={setMixBassVol}
          />

          {/* CLICK — metronome click level */}
          <MixSlider
            label="CLICK"
            value={mixClickVol} min={0} max={100} step={1} unit="%"
            accent={t.accent} border={t.border} bg={t.bg} txt3={t.txt3}
            onSet={setMixClickVol}
          />

          {/* HI-CUT FREQ — where the chord high-shelf EQ starts */}
          <MixSlider
            label="HI-CUT FREQ"
            value={mixHiCutFreq} min={500} max={8000} step={100} unit=" Hz"
            accent={t.accent} border={t.border} bg={t.bg} txt3={t.txt3}
            onSet={setMixHiCutFreq}
          />

          {/* HI-CUT GAIN — how many dB to cut above that frequency */}
          <MixSlider
            label="HI-CUT GAIN"
            value={mixHiCutGain} min={-20} max={0} step={1} unit=" dB"
            accent={t.accent} border={t.border} bg={t.bg} txt3={t.txt3}
            onSet={setMixHiCutGain}
          />
        </View>
      )}

      {/* ACTION ROW */}
      <View style={styles.actionRow}>
        {!isPlayingSystem ? (
          <>
            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: t.bg2, borderColor: t.border }]} onPress={onOpenLib}>
              <Ionicons name="library-outline" size={24} color={t.txt2} />
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: t.bg2, borderColor: t.border }]} onPress={onOpenSave}>
              <Ionicons name="save-outline" size={24} color={t.txt2} />
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: t.bg2, borderColor: t.border }]} onPress={onClear}>
              <Ionicons name="refresh-outline" size={24} color={t.txt2} />
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: isLooping ? t.accent : t.bg2, borderColor: isLooping ? t.accent : t.border }]} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); toggleLooping(); }}>
              <Ionicons name="repeat" size={24} color={isLooping ? '#fff' : t.txt2} />
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity style={[styles.actionBtn, { maxWidth: 64, backgroundColor: isLooping ? t.accent : t.bg2, borderColor: isLooping ? t.accent : t.border }]} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); toggleLooping(); }}>
            <Ionicons name="repeat" size={24} color={isLooping ? '#fff' : t.txt2} />
          </TouchableOpacity>
        )}

        <TouchableOpacity style={[styles.squarePlayBtn, { backgroundColor: isPlayingSystem ? '#D4537E' : '#639922' }, isPlayingSystem && { flex: 1, flexDirection: 'row' }]} onPress={isPlayingSystem ? stopPlayback : handlePlayProgression}>
          <Ionicons name={isPlayingSystem ? 'stop' : 'play'} size={26} color="#fff" />
          {isPlayingSystem && <Text style={{ color: '#fff', fontWeight: '800', marginLeft: 8, fontSize: 16 }}>STOP</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stickyPlayer: { paddingVertical: 12, paddingBottom: Platform.OS === 'ios' ? 24 : 12 },
  enginePill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, height: 40, borderRadius: 20, borderWidth: 1 },
  enginePillTxt: { fontSize: 14, fontWeight: '700' },
  actionRow: { flexDirection: 'row', gap: 12, marginHorizontal: 16 },
  actionBtn: { flex: 1, height: 56, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  wideLoopBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 20, borderWidth: 1, height: 56 },
  wideLoopText: { fontWeight: '700', fontSize: 14 },
  squarePlayBtn: { width: 64, height: 56, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
