import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSettingsStore } from '@features/settings/store/settingsStore';
import { familyForWeight } from '@shared/fonts/fonts';
import { THEMES } from '@shared/ui/themes';
import { PopUpModal } from '@shared/ui/SharedModals';
import { useTapTempo } from '@shared/hooks/useTapTempo';

interface BpmModalProps {
  visible: boolean;
  onClose: () => void;
}

export default function BpmModal({ visible, onClose }: BpmModalProps) {
  const { theme, bpm, setBpm, fontFamily } = useSettingsStore();
  const t = THEMES[theme];
  
  // Local state for the manual typing input
  const [bpmInputValue, setBpmInputValue] = useState(bpm.toString());
  
  // Bring in the Tap Tempo logic
  const handleTapTempo = useTapTempo();

  // If the global BPM changes (like when you tap the tempo button), 
  // immediately sync the text input to show the live calculation!
  useEffect(() => {
    if (visible) setBpmInputValue(bpm.toString());
  }, [visible, bpm]);

  const handleBpmSave = () => {
    const val = parseInt(bpmInputValue, 10);
    if (!isNaN(val)) setBpm(Math.max(40, Math.min(240, val)));
    onClose();
  };

  const handleAdjust = (amount: number) => {
    const current = parseInt(bpmInputValue, 10);
    const validCurrent = isNaN(current) ? bpm : current;
    const next = Math.max(40, Math.min(240, validCurrent + amount));
    setBpmInputValue(next.toString());
  };

  return (
    <PopUpModal visible={visible} onClose={onClose}>
      <View style={[styles.modalBox, { backgroundColor: t.bg2, borderColor: t.border }]}>
        <Text style={[styles.modalTitle, { color: t.txt1 }]}>Set Tempo</Text>
        
        {/* Adjuster Row */}
        <View style={styles.adjusterRow}>
          <TouchableOpacity activeOpacity={0.7} style={[styles.adjBtn, { backgroundColor: t.bg3, borderColor: t.border }]} onPress={() => handleAdjust(-5)}>
            <Text style={[styles.adjText, { color: t.txt2 }]}>-5</Text>
          </TouchableOpacity>

          <TouchableOpacity activeOpacity={0.7} style={[styles.adjBtn, { backgroundColor: t.bg3, borderColor: t.border }]} onPress={() => handleAdjust(-1)}>
            <Ionicons name="remove" size={20} color={t.txt1} />
          </TouchableOpacity>

          <TextInput
            style={[styles.textInput, { backgroundColor: t.bg, color: t.txt1, borderColor: t.border, fontFamily: familyForWeight(fontFamily, '700') }]}
            placeholder="120" 
            placeholderTextColor={t.txt3} 
            value={bpmInputValue} 
            onChangeText={setBpmInputValue} 
            keyboardType="number-pad" 
            maxLength={3} 
            textAlign="center"
          />

          <TouchableOpacity activeOpacity={0.7} style={[styles.adjBtn, { backgroundColor: t.bg3, borderColor: t.border }]} onPress={() => handleAdjust(1)}>
            <Ionicons name="add" size={20} color={t.txt1} />
          </TouchableOpacity>

          <TouchableOpacity activeOpacity={0.7} style={[styles.adjBtn, { backgroundColor: t.bg3, borderColor: t.border }]} onPress={() => handleAdjust(5)}>
            <Text style={[styles.adjText, { color: t.txt2 }]}>+5</Text>
          </TouchableOpacity>
        </View>

        {/* The Massive Tap Tempo Hitbox */}
        <TouchableOpacity 
          activeOpacity={0.6} 
          onPress={handleTapTempo}
          style={[styles.tapBtn, { backgroundColor: t.bg3, borderColor: t.border }]}
        >
          <Ionicons name="hand-right-outline" size={24} color={t.accent} style={{ marginBottom: 6 }} />
          <Text style={{ color: t.accent, fontSize: 16, fontWeight: '700', letterSpacing: 2 }}>TAP TEMPO</Text>
        </TouchableOpacity>

        <View style={styles.modalBtnRow}>
          <TouchableOpacity style={[styles.modalBtn, { backgroundColor: t.bg3, borderWidth: 1, borderColor: t.border }]} onPress={onClose}>
            <Text style={{ color: t.txt2, fontSize: 16, fontWeight: '700' }}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.modalBtn, { backgroundColor: t.accent }]} onPress={handleBpmSave}>
            <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>Save</Text>
          </TouchableOpacity>
        </View>
      </View>
    </PopUpModal>
  );
}

const styles = StyleSheet.create({
  modalBox: { 
    width: '100%', 
    padding: 24, 
    borderRadius: 24, 
    borderWidth: 1, 
    shadowColor: '#000', 
    shadowOffset: { width: 0, height: 4 }, 
    shadowOpacity: 0.15, 
    shadowRadius: 12, 
    elevation: 10 
  },
  modalTitle: { 
    fontSize: 20, 
    fontWeight: '700', 
    letterSpacing: 0.5, 
    marginBottom: 24, 
    textAlign: 'center' 
  },
  adjusterRow: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between', 
    gap: 8, 
    marginBottom: 20 
  },
  adjBtn: { 
    width: 44, 
    height: 44, 
    borderRadius: 22, 
    borderWidth: 1, 
    alignItems: 'center', 
    justifyContent: 'center' 
  },
  adjText: { 
    fontSize: 14,
    fontWeight: '700'
  },
  textInput: {
    height: 52,
    flex: 1,
    minWidth: 60,
    borderRadius: 16,
    borderWidth: 1,
    fontSize: 24,
    fontWeight: '700',
    paddingHorizontal: 8,
    textAlign: 'center',
  },
  tapBtn: { 
    paddingVertical: 20, 
    alignItems: 'center', 
    justifyContent: 'center', 
    borderRadius: 16, 
    borderWidth: 1, 
    borderStyle: 'dashed', 
    marginBottom: 24 
  },
  modalBtnRow: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    gap: 12 
  },
  modalBtn: { 
    flex: 1, 
    paddingVertical: 14, 
    alignItems: 'center', 
    borderRadius: 16 
  },
});