import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSettingsStore } from '@features/settings/store/settingsStore';
import { useChordStore } from '@features/play/store/chordStore';
import { THEMES, ROLE_COLORS_GLOBAL } from '@shared/ui/themes';
import SlidingToggle from '@shared/ui/SlidingToggle';
import { FONT_OPTIONS, familyForWeight, FontKey } from '@shared/fonts/fonts';

// Selective-highlight degrees, ROOT FIRST. `key` matches selectiveRoles / ROLE_COLORS_GLOBAL;
// the label is the friendly degree (2→9, 4→11, 6→13).
const HL_ROLES = [
  { key: 'root', label: 'R' }, { key: '3', label: '3' }, { key: '5', label: '5' }, { key: '7', label: '7' },
  { key: '2', label: '9' }, { key: '4', label: '11' }, { key: '6', label: '13' },
];
const LABEL_OPTS = [{ value: 'none', label: 'None' }, { value: 'degrees', label: 'Degrees' }, { value: 'notes', label: 'Notes' }];
const COLOR_OPTS = [{ value: 'roles', label: 'Roles' }, { value: 'theme', label: 'Theme' }, { value: 'selective', label: 'Selective' }];
const TUNING_OPTS = [432, 440, 512];

export default function SharedSettingsPanel() {
  const {
    theme, labelMode, setLabelMode, colorMode, setColorMode, selectiveRoles, toggleSelectiveRole,
    instrument, setInstrument, referenceFrequency, setReferenceFrequency,
    octave, setOctave, octaveNumbering, setOctaveNumbering, fontFamily, setFontFamily,
  } = useSettingsStore();
  const { namingMode, setNamingMode } = useChordStore();
  const t = THEMES[theme];

  const [activeTab, setActiveTab] = useState<'display' | 'audio'>('display');
  const [openPicker, setOpenPicker] = useState<string | null>(null);

  const Tab = ({ id, label, icon }: { id: 'display' | 'audio'; label: string; icon: keyof typeof Ionicons.glyphMap }) => {
    const a = activeTab === id;
    return (
      <TouchableOpacity activeOpacity={0.7} onPress={() => { setActiveTab(id); setOpenPicker(null); }} style={[styles.tab, { borderBottomColor: a ? t.accent : 'transparent' }]}>
        <Ionicons name={icon} size={20} color={a ? t.accent : t.txt3} />
        <Text style={{ fontSize: 14, fontWeight: '700', color: a ? t.accent : t.txt3 }}>{label}</Text>
      </TouchableOpacity>
    );
  };
  const Hair = () => <View style={[styles.hair, { backgroundColor: t.border }]} />;
  const Left = ({ icon, label, mci }: { icon: string; label: string; mci?: boolean }) => (
    <View style={styles.rowLeft}>
      {mci ? <MaterialCommunityIcons name={icon as any} size={18} color={t.accent} /> : <Ionicons name={icon as any} size={18} color={t.accent} />}
      <Text style={[styles.rowLabel, { color: t.txt1 }]}>{label}</Text>
    </View>
  );

  // A row showing the current value; tapping expands an inline picker below it.
  const ValueRow = ({ icon, label, valueLabel, valueFont, pickerKey, options, selected, onSelect, mci }: {
    icon: string; label: string; valueLabel: string; valueFont?: string; pickerKey: string; mci?: boolean;
    options: { value: any; label: string; font?: string }[]; selected: any; onSelect: (v: any) => void;
  }) => {
    const open = openPicker === pickerKey;
    return (
      <View>
        <TouchableOpacity activeOpacity={0.6} onPress={() => setOpenPicker(open ? null : pickerKey)} style={styles.row}>
          <Left icon={icon} label={label} mci={mci} />
          <View style={styles.valueRight}>
            <Text style={[styles.valueText, { color: t.txt2 }, valueFont ? { fontFamily: valueFont } : null]}>{valueLabel}</Text>
            <Ionicons name={open ? 'chevron-up' : 'chevron-forward'} size={16} color={t.txt3} />
          </View>
        </TouchableOpacity>
        {open && (
          <View style={[styles.pickerWell, { backgroundColor: t.bg3 }]}>
            {options.map((o, i) => {
              const sel = selected === o.value;
              return (
                <TouchableOpacity key={String(o.value)} activeOpacity={0.6} onPress={() => { onSelect(o.value); setOpenPicker(null); }} style={[styles.pickerOpt, i > 0 ? { borderTopWidth: 1, borderTopColor: t.border } : null]}>
                  <Text style={[styles.pickerOptText, { color: sel ? t.accent : t.txt1 }, o.font ? { fontFamily: o.font } : null]}>{o.label}</Text>
                  {sel && <Ionicons name="checkmark" size={16} color={t.accent} />}
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </View>
    );
  };

  const fontLabel = FONT_OPTIONS.find(o => o.key === fontFamily)?.label ?? 'Inter';

  return (
    <View>
      <View style={[styles.tabs, { borderBottomColor: t.border }]}>
        <Tab id="display" label="Display" icon="color-palette-outline" />
        <Tab id="audio" label="Audio" icon="musical-notes-outline" />
      </View>

      {activeTab === 'display' && (
        <View>
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 0 }}>
                <Text style={{ fontSize: 20, fontWeight: '700', color: t.accent, includeFontPadding: false, lineHeight: 20 }}>♭</Text>
                <Text style={{ fontSize: 14, color: t.accent, marginHorizontal: 1 }}>/</Text>
                <Text style={{ fontSize: 20, fontWeight: '700', color: t.accent, includeFontPadding: false, lineHeight: 20 }}>♯</Text>
              </View>
              <Text style={[styles.rowLabel, { color: t.txt1 }]}>Accidentals</Text>
            </View>
            <SlidingToggle
              activeIndex={namingMode === 'flat' ? 0 : 1}
              onPressSegment={(i) => setNamingMode(i === 0 ? 'flat' : 'sharp')}
              cellWidth={40}
              segments={[
                <Text style={[styles.accidentalTxt, styles.flatNudge, { color: namingMode === 'flat' ? '#fff' : t.txt2 }]}>♭</Text>,
                <Text style={[styles.accidentalTxt, { color: namingMode === 'sharp' ? '#fff' : t.txt2 }]}>♯</Text>,
              ]}
              t={t}
            />
          </View>
          <Hair />
          <ValueRow icon="format-font" mci label="Font" valueLabel={fontLabel} valueFont={familyForWeight(fontFamily, 500)} pickerKey="font"
            options={FONT_OPTIONS.map(o => ({ value: o.key, label: o.label, font: familyForWeight(o.key, 500) }))} selected={fontFamily} onSelect={(v) => setFontFamily(v as FontKey)} />
          <Hair />
          <ValueRow icon="pricetag-outline" label="Labels" valueLabel={LABEL_OPTS.find(o => o.value === labelMode)?.label ?? 'Notes'} pickerKey="labels"
            options={LABEL_OPTS} selected={labelMode} onSelect={(v) => setLabelMode(v)} />
          <Hair />
          <View style={styles.row}>
            <Left icon="musical-note-outline" label="Octave Numbering" />
            <SlidingToggle
              activeIndex={octaveNumbering ? 1 : 0}
              onPressSegment={(i) => setOctaveNumbering(i === 1)}
              cellWidth={40}
              segments={[
                <Text style={[styles.toggleTxt, { color: !octaveNumbering ? '#fff' : t.txt2 }]}>Off</Text>,
                <Text style={[styles.toggleTxt, { color: octaveNumbering ? '#fff' : t.txt2 }]}>On</Text>,
              ]}
              t={t}
            />
          </View>
          <Hair />
          <ValueRow icon="brush-outline" label="Note Color" valueLabel={COLOR_OPTS.find(o => o.value === colorMode)?.label ?? 'Roles'} pickerKey="noteColor"
            options={COLOR_OPTS} selected={colorMode} onSelect={(v) => setColorMode(v)} />

          {colorMode === 'selective' && (
            <>
              <Hair />
              <View style={styles.hlRow}>
                <Left icon="color-filter-outline" label="Highlight" />
                <View style={styles.hlCircles}>
                  {HL_ROLES.map(r => {
                    const a = selectiveRoles.includes(r.key);
                    const color = ROLE_COLORS_GLOBAL[r.key] || t.accent;
                    return (
                      <TouchableOpacity key={r.key} activeOpacity={0.7} onPress={() => toggleSelectiveRole(r.key)} style={[styles.hlCircle, { backgroundColor: a ? color : t.bg2, borderColor: color }]}>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: a ? '#fff' : color }}>{r.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            </>
          )}
        </View>
      )}

      {activeTab === 'audio' && (
        <View>
          <View style={styles.row}>
            <Left icon="musical-notes-outline" label="Instrument" />
            <SlidingToggle
              activeIndex={instrument === 'piano' ? 0 : 1}
              onPressSegment={(i) => setInstrument(i === 0 ? 'piano' : 'guitar')}
              cellWidth={40}
              segments={[
                <MaterialCommunityIcons name="piano" size={16} color={instrument === 'piano' ? '#fff' : t.txt2} />,
                <MaterialCommunityIcons name="guitar-acoustic" size={16} color={instrument === 'guitar' ? '#fff' : t.txt2} />,
              ]}
              t={t}
            />
          </View>
          <Hair />
          <View style={styles.row}>
            <Left icon="swap-vertical-outline" label={`${instrument === 'piano' ? 'Piano' : 'Guitar'} Octave`} />
            <View style={[styles.stepper, { backgroundColor: t.bg2, borderColor: t.border }]}>
              <TouchableOpacity onPress={() => setOctave(octave - 1)} style={styles.stepBtn}><Ionicons name="remove" size={16} color={t.txt2} /></TouchableOpacity>
              <Text style={[styles.stepVal, { color: t.txt1 }]}>{octave}</Text>
              <TouchableOpacity onPress={() => setOctave(octave + 1)} style={styles.stepBtn}><Ionicons name="add" size={16} color={t.txt2} /></TouchableOpacity>
            </View>
          </View>
          <Hair />
          <ValueRow icon="pitchfork" mci label="Tuning (A=)" valueLabel={`${referenceFrequency} Hz`} pickerKey="tuning"
            options={TUNING_OPTS.map(f => ({ value: f, label: `${f} Hz` }))} selected={referenceFrequency} onSelect={(v) => setReferenceFrequency(v)} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', marginBottom: 8, borderBottomWidth: 1 },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center', gap: 6, borderBottomWidth: 2 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingVertical: 12, minHeight: 46 },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 11, flexShrink: 1 },
  // Primary row label — 15/600, matching SettingsScreen's `label` so Global Preferences
  // rows read at the same weight as every other section (they were a thin 400 before).
  rowLabel: { fontSize: 15, fontWeight: '600' },
  valueRight: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  // Secondary value text — medium weight + a muted color (applied at the call site) so it
  // reads clearly secondary without the flimsiness of regular 400.
  valueText: { fontSize: 14, fontWeight: '500' },
  toggleTxt: { fontSize: 14, fontWeight: '700' },
  // Music accidental glyphs (♭ ♯) read small at body size, so bump them up. Their ink
  // sits entirely ABOVE the baseline (measured: ~7px above for ♭), so a tight lineHeight
  // equal to the font size plus dropping Android's extra font padding and centering the
  // text vertically lands both glyphs within ~0.5px of the pill's center — no nudge needed.
  accidentalTxt: { fontSize: 20, fontWeight: '700', lineHeight: 20, includeFontPadding: false, textAlignVertical: 'center' },
  // The flat's ink stops at the baseline (no descent) while the sharp tails ~2px below,
  // so at the same vertical alignment the flat reads a touch high. A 1px drop aligns its
  // optical center with the sharp's. Flat-only — the sharp is already centered.
  flatNudge: { transform: [{ translateY: 1 }] },
  stepper: { flexDirection: 'row', alignItems: 'center', borderRadius: 20, borderWidth: 1, height: 40 },
  stepBtn: { paddingHorizontal: 12, height: '100%', justifyContent: 'center' },
  stepVal: { fontSize: 14, fontWeight: '700', minWidth: 18, textAlign: 'center' },
  pickerWell: { borderRadius: 10, marginLeft: 29, marginBottom: 6, marginTop: 2, paddingHorizontal: 12 },
  pickerOpt: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 11 },
  pickerOptText: { fontSize: 15, fontWeight: '500' },
  hlRow: { paddingVertical: 12 },
  hlCircles: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 7, marginTop: 11 },
  hlCircle: { width: 32, height: 32, borderRadius: 16, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  hair: { height: StyleSheet.hairlineWidth, marginLeft: 29, opacity: 0.7 },
});
