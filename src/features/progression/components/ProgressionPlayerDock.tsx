import React, { useState, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, ScrollView } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSettingsStore } from '@features/settings/store/settingsStore';
import { useShallow } from 'zustand/react/shallow';
import { useProgressionStore } from '@features/progression/store/progressionStore';
import { THEMES, ROLE_COLORS_GLOBAL } from '@shared/ui/themes';
import * as Haptics from 'expo-haptics';

// ── Block row mixer control ────────────────────────────────────────────────
// Shows 10 labelled blocks (1-10). Tapping a block sets the level directly.
interface MixBlocksProps {
  label: string;
  value: number; // 1-10
  accent: string;
  border: string;
  bg: string;
  txt3: string;
  onSet: (v: number) => void;
}

function MixBlocks({ label, value, accent, border, bg, txt3, onSet }: MixBlocksProps) {
  return (
    <View style={{ marginBottom: 12 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
        <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 1, color: txt3 }}>{label}</Text>
        <Text style={{ fontSize: 12, fontWeight: '700', color: accent }}>{value}</Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 4 }}>
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
          <TouchableOpacity
            key={n}
            activeOpacity={0.7}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onSet(n); }}
            style={{
              flex: 1,
              height: 32,
              borderRadius: 6,
              backgroundColor: n <= value ? accent : border,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ fontSize: 10, fontWeight: '700', color: n <= value ? '#fff' : txt3 }}>{n}</Text>
          </TouchableOpacity>
        ))}
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
  // Narrow selector so the dock (which runs mixer logic on render) only re-renders for its own
  // fields, not every global settings change.
  const {
    theme, metronomeEnabled, setMetronomeEnabled, bassEnabled, setBassEnabled,
    voiceLeading, setVoiceLeading, voiceLeadDir, setVoiceLeadDir,
    mixChordVol, setMixChordVol,
    mixBassVol,  setMixBassVol,
    mixClickVol, setMixClickVol,
    isPro,
  } = useSettingsStore(
    useShallow((s) => ({
      theme: s.theme, metronomeEnabled: s.metronomeEnabled, setMetronomeEnabled: s.setMetronomeEnabled,
      bassEnabled: s.bassEnabled, setBassEnabled: s.setBassEnabled,
      voiceLeading: s.voiceLeading, setVoiceLeading: s.setVoiceLeading,
      voiceLeadDir: s.voiceLeadDir, setVoiceLeadDir: s.setVoiceLeadDir,
      mixChordVol: s.mixChordVol, setMixChordVol: s.setMixChordVol,
      mixBassVol: s.mixBassVol, setMixBassVol: s.setMixBassVol,
      mixClickVol: s.mixClickVol, setMixClickVol: s.setMixClickVol,
      isPro: s.isPro,
    }))
  );

  // Tap cycles: OFF → Zone → Bounce → Down → Up → OFF
  const VL_CYCLE: Array<{ dir: 'zone' | 'up' | 'down' | 'bounce' | null; label: string; icon: string }> = [
    { dir: null,     label: 'Voice Lead', icon: 'transit-connection-variant' },
    { dir: 'zone',   label: 'Zone',       icon: 'map-marker-radius-outline'  },
    { dir: 'bounce', label: 'Bounce',     icon: 'swap-vertical-bold'         },
    { dir: 'down',   label: 'Down',       icon: 'arrow-down-bold-outline'    },
    { dir: 'up',     label: 'Up',         icon: 'arrow-up-bold-outline'      },
  ];
  const vlIdx = !voiceLeading ? 0 : Math.max(1, VL_CYCLE.findIndex(x => x.dir === voiceLeadDir));
  const vlItem = VL_CYCLE[vlIdx];
  const handleVLPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const next = VL_CYCLE[(vlIdx + 1) % VL_CYCLE.length];
    if (!next.dir) { setVoiceLeading(false); }
    else { setVoiceLeading(true); setVoiceLeadDir(next.dir); }
  };
  const { rhythm, setRhythm } = useProgressionStore();
  const t = THEMES[theme];

  const [showMixer, setShowMixer] = useState(false);

  // Each rhythm gets one of the app's scale-degree interval colors, so cycling the
  // pill walks through root → 2nd → 3rd → 4th → 5th of the note-role palette.
  const RHYTHMS = [
    // Each of the 7 rhythms gets one of the app's 7 distinct scale-degree colours.
    { key: 'straight',   label: 'Straight',   color: ROLE_COLORS_GLOBAL['root'] }, // orange-red
    { key: 'swing',      label: 'Swing',      color: ROLE_COLORS_GLOBAL['7'] },    // orange-brown
    { key: 'charleston', label: 'Charleston', color: ROLE_COLORS_GLOBAL['9'] },    // violet
    { key: 'swingsparse',label: 'Sparse',     color: ROLE_COLORS_GLOBAL['6'] },    // pink
    { key: 'bossanova',  label: 'Bossa',      color: ROLE_COLORS_GLOBAL['3'] },    // blue
    { key: 'twostep',    label: 'Two-Step',   color: ROLE_COLORS_GLOBAL['4'] },    // teal
    { key: 'reggae',     label: 'Reggae',     color: ROLE_COLORS_GLOBAL['5'] },    // green
  ];
  const activeRhythm = RHYTHMS.find(r => r.key === rhythm) || RHYTHMS[0];
  const rhythmColor = activeRhythm.color;

  return (
    <View style={[styles.stickyPlayer, { backgroundColor: t.bg, borderTopColor: t.border, borderTopWidth: 1 }]}>

      {/* INLINE ENGINE CONTROLS */}
      {!isPlayingSystem && (
        <View style={{ marginBottom: 12 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
            <TouchableOpacity activeOpacity={0.7} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setMetronomeEnabled(!metronomeEnabled); }} style={[styles.enginePill, { backgroundColor: metronomeEnabled ? t.accent : t.bg2, borderColor: metronomeEnabled ? t.accent : t.border }]}>
              {/* metronome is a FILLED glyph → reads heavier than the outline icons beside it; use the
                  lighter txt3 when resting so its visual weight matches them (text stays txt2). */}
              <MaterialCommunityIcons name="metronome" size={16} color={metronomeEnabled ? '#fff' : t.txt3} />
              <Text style={[styles.enginePillTxt, { color: metronomeEnabled ? '#fff' : t.txt2 }]}>Click</Text>
            </TouchableOpacity>

            <TouchableOpacity activeOpacity={0.7} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setBassEnabled(!bassEnabled); }} style={[styles.enginePill, { backgroundColor: bassEnabled ? t.accent : t.bg2, borderColor: bassEnabled ? t.accent : t.border }]}>
              <Ionicons name="musical-notes" size={16} color={bassEnabled ? '#fff' : t.txt2} />
              <Text style={[styles.enginePillTxt, { color: bassEnabled ? '#fff' : t.txt2 }]}>Bass</Text>
            </TouchableOpacity>

            <TouchableOpacity activeOpacity={0.7} onPress={handleVLPress} style={[styles.enginePill, { backgroundColor: voiceLeading ? t.accent : t.bg2, borderColor: voiceLeading ? t.accent : t.border }]}>
              <MaterialCommunityIcons name={vlItem.icon as any} size={16} color={voiceLeading ? '#fff' : t.txt2} />
              <Text style={[styles.enginePillTxt, { color: voiceLeading ? '#fff' : t.txt2 }]}>{vlItem.label}</Text>
            </TouchableOpacity>

            <TouchableOpacity activeOpacity={0.7} onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              const curIdx = RHYTHMS.findIndex(r => r.key === rhythm);
              setRhythm(RHYTHMS[(curIdx + 1) % RHYTHMS.length].key as any);
            }} style={[styles.enginePill, { backgroundColor: rhythmColor, borderColor: rhythmColor }]}>
              {/* Each rhythm shows its own scale-degree interval color */}
              <MaterialCommunityIcons name="pulse" size={16} color={'#fff'} />
              <Text style={[styles.enginePillTxt, { color: '#fff' }]}>
                {activeRhythm.label}
              </Text>
            </TouchableOpacity>

            {/* MIX toggle pill */}
            <TouchableOpacity activeOpacity={0.7} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowMixer(s => !s); }} style={[styles.enginePill, { backgroundColor: showMixer ? t.accent : t.bg2, borderColor: showMixer ? t.accent : t.border }]}>
              <Ionicons name="options-outline" size={16} color={showMixer ? '#fff' : t.txt2} />
              <Text style={[styles.enginePillTxt, { color: showMixer ? '#fff' : t.txt2 }]}>Mix</Text>
              <Ionicons name={showMixer ? 'chevron-up' : 'chevron-down'} size={14} color={showMixer ? '#fff' : t.txt2} />
            </TouchableOpacity>
          </ScrollView>
        </View>
      )}

      {/* MIXER PANEL — shown when Mix pill is toggled and not playing */}
      {!isPlayingSystem && showMixer && (
        <View style={{ paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: t.border, marginBottom: 12 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <Text style={{ fontSize: 14, fontWeight: '700', letterSpacing: 2, color: t.txt3 }}>MIXER</Text>
            <TouchableOpacity hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }} onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setMixChordVol(70);
              setMixBassVol(100);
              setMixClickVol(30);
            }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: t.accent }}>RESET</Text>
            </TouchableOpacity>
          </View>

          {/* CHORD — master chord instrument level */}
          <MixBlocks
            label="CHORD"
            value={Math.min(10, Math.round(mixChordVol / 10))}
            accent={t.accent} border={t.border} bg={t.bg} txt3={t.txt3}
            onSet={(v) => setMixChordVol(Math.min(100, v * 10))}
          />

          {/* BASS — bass instrument level */}
          <MixBlocks
            label="BASS"
            value={Math.min(10, Math.round(mixBassVol / 10))}
            accent={t.accent} border={t.border} bg={t.bg} txt3={t.txt3}
            onSet={(v) => setMixBassVol(Math.min(100, v * 10))}
          />

          {/* CLICK — metronome click level */}
          <MixBlocks
            label="CLICK"
            value={Math.min(10, Math.round(mixClickVol / 10))}
            accent={t.accent} border={t.border} bg={t.bg} txt3={t.txt3}
            onSet={(v) => setMixClickVol(Math.min(100, v * 10))}
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
            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: t.bg2, borderColor: t.border, opacity: isPro ? 1 : 0.6 }]} onPress={onOpenSave}>
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
          {isPlayingSystem && <Text style={{ color: '#fff', fontWeight: '700', marginLeft: 8, fontSize: 16 }}>STOP</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stickyPlayer: { paddingVertical: 12, paddingBottom: 12 },
  enginePill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, height: 40, borderRadius: 20, borderWidth: 1 },
  enginePillTxt: { fontSize: 14, fontWeight: '700' },
  actionRow: { flexDirection: 'row', gap: 12, marginHorizontal: 16 },
  actionBtn: { flex: 1, height: 56, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  wideLoopBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 20, borderWidth: 1, height: 56 },
  wideLoopText: { fontWeight: '700', fontSize: 14 },
  squarePlayBtn: { width: 64, height: 56, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
