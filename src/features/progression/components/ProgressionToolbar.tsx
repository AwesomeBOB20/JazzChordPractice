import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, ScrollView } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSettingsStore } from '@features/settings/store/settingsStore';
import { useProgressionStore } from '@features/progression/store/progressionStore';
import { THEMES } from '@shared/ui/themes';
import { ToggleButton } from '@features/settings/components/SettingRow';

interface Props {
  selectedCell: number | null;
}

export default function ProgressionToolbar({ selectedCell }: Props) {
  const { 
    theme, instrument, 
    metronomeEnabled, setMetronomeEnabled, 
    bassEnabled, setBassEnabled, 
    voiceLeading, setVoiceLeading,
    fretCap, setFretCap, pianoZone, setPianoZone 
  } = useSettingsStore();
  
  const { 
    progression, transposeProgression, setChordBeats, 
    toggleRepeatStart, toggleRepeatEnd, removeProgressionChord,
    rhythm, setRhythm,
    guitarNeckZone, setGuitarNeckZone
  } = useProgressionStore();
  
  const t = THEMES[theme];

  let isLeft = false, isRight = false, pairLeftIdx = selectedCell, pairRightIdx = selectedCell;
  if (selectedCell !== null) {
    for (let i = 0; i < progression.length; i++) {
      if (progression[i]?.beats === 2 && i + 1 < progression.length && progression[i+1]?.beats === 2) {
        if (i === selectedCell) { isLeft = true; pairLeftIdx = i; pairRightIdx = i + 1; break; }
        else if (i + 1 === selectedCell) { isRight = true; pairLeftIdx = i; pairRightIdx = i + 1; break; }
        i++;
      } else if (i === selectedCell) { break; }
    }
  }

  const targetStartCell = isRight ? pairLeftIdx : selectedCell;
  const targetEndCell = isLeft ? pairRightIdx : selectedCell;
  const isRepeatStart = targetStartCell !== null && progression[targetStartCell]?.repeatStart;
  const isRepeatEnd = targetEndCell !== null && progression[targetEndCell]?.repeatEnd;

  return (
    <View style={{ backgroundColor: t.bg2, paddingVertical: 12, borderTopWidth: 1, borderTopColor: t.border }}>
      <View style={{ flexDirection: 'row', paddingHorizontal: 16, justifyContent: 'space-between', alignItems: 'center' }}>
        {/* Module 1: Time Signature */}
        <TouchableOpacity disabled={selectedCell === null} onPress={() => {
          if (selectedCell === null) return;
          const current = progression[selectedCell]?.beats || 4;
          const next = (current === 4 ? 2 : current + 1) as 2 | 3 | 4;
          setChordBeats(selectedCell, next);
        }} style={{ height: 36, minWidth: 44, borderRadius: 18, justifyContent: 'center', alignItems: 'center', backgroundColor: t.bg3, borderWidth: 1, borderColor: t.border }}>
          <View style={{ alignItems: 'center' }}>
            <Text style={{ fontFamily: Platform.OS === 'ios' ? 'Times New Roman' : 'serif', fontSize: 12, fontWeight: 'bold', color: t.txt1, lineHeight: 12 }}>{selectedCell !== null ? (progression[selectedCell]?.beats || 4) : 4}</Text>
            <Text style={{ fontFamily: Platform.OS === 'ios' ? 'Times New Roman' : 'serif', fontSize: 12, fontWeight: 'bold', color: t.txt1, lineHeight: 12 }}>4</Text>
          </View>
        </TouchableOpacity>

        {/* Module 2: Repeats */}
        <View style={{ flexDirection: 'row', backgroundColor: t.bg3, borderRadius: 18, borderWidth: 1, borderColor: t.border, overflow: 'hidden' }}>
          <TouchableOpacity disabled={targetStartCell === null} onPress={() => targetStartCell !== null && toggleRepeatStart(targetStartCell)} style={{ height: 36, width: 40, justifyContent: 'center', alignItems: 'center', borderRightWidth: 1, borderColor: t.border }}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: isRepeatStart ? t.accent : t.txt2, transform: [{ translateY: 1 }] }}>𝄆</Text>
          </TouchableOpacity>
          <TouchableOpacity disabled={targetEndCell === null} onPress={() => targetEndCell !== null && toggleRepeatEnd(targetEndCell)} style={{ height: 36, width: 40, justifyContent: 'center', alignItems: 'center' }}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: isRepeatEnd ? t.accent : t.txt2, transform: [{ translateY: 1 }] }}>𝄇</Text>
          </TouchableOpacity>
        </View>

        {/* Module 4: Transposition */}
        <View style={{ flexDirection: 'row', backgroundColor: t.bg3, borderRadius: 18, borderWidth: 1, borderColor: t.border, overflow: 'hidden' }}>
          <TouchableOpacity onPress={() => transposeProgression(-1)} style={{ height: 36, width: 40, justifyContent: 'center', alignItems: 'center', borderRightWidth: 1, borderColor: t.border }}>
            <Text style={{ fontSize: 20, fontWeight: '800', color: t.txt1, transform: [{ translateY: -2 }] }}>♭</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => transposeProgression(1)} style={{ height: 36, width: 40, justifyContent: 'center', alignItems: 'center' }}>
            <Text style={{ fontSize: 20, fontWeight: '800', color: t.txt1, transform: [{ translateY: -2 }] }}>♯</Text>
          </TouchableOpacity>
        </View>

        {/* Module 5: Delete Chord */}
        <TouchableOpacity disabled={selectedCell === null} onPress={() => selectedCell !== null && removeProgressionChord(selectedCell)}
          style={{ height: 36, width: 44, borderRadius: 18, justifyContent: 'center', alignItems: 'center', backgroundColor: t.bg3, borderWidth: 1, borderColor: t.border }}>
          <Ionicons name="trash-outline" size={16} color={t.accent} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 20, padding: 16, borderWidth: 1, gap: 8 },
  sectionLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 1.5, marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 2 },
  label: { fontSize: 14, fontWeight: '600' },
  divider: { height: 1, marginVertical: 4 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1, gap: 4 },
});