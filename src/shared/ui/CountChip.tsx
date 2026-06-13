import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Theme } from './themes';

// One count chip used by EVERY count badge (Play-screen voicing tabs, Dictionary category +
// family tabs, and the chord-item section headers) so they're the exact same size + shape
// instead of several different badge designs. Geometry + number style are fixed here; only
// the fill adapts to context:
//   • onAccent (chip sits on an active accent-filled pill) → translucent-white fill, white number
//   • solid (standalone badge on a neutral row, e.g. a section header) → accent fill, white number
//   • plain (resting pills + the lighter family tabs) → outlined chip, muted number — the border
//     makes it visible on any background, so the resting state looks identical everywhere.
// The number uses includeFontPadding:false so it sits exactly in line with the label beside it.
export function CountChip({ count, t, onAccent, solid }: { count: number | string; t: Theme; onAccent?: boolean; solid?: boolean }) {
  const fill = solid
    ? { backgroundColor: t.accent }
    : onAccent
      ? { backgroundColor: 'rgba(255,255,255,0.22)' }
      : { borderWidth: StyleSheet.hairlineWidth, borderColor: t.border };
  return (
    <View style={[styles.chip, fill]}>
      <Text style={[styles.text, { color: (solid || onAccent) ? '#fff' : t.txt3 }]}>{count}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { minWidth: 18, paddingHorizontal: 5, paddingVertical: 1, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  text: { fontSize: 10, fontWeight: '700', lineHeight: 13, includeFontPadding: false, textAlign: 'center' },
});
