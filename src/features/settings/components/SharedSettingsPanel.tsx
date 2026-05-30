import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSettingsStore } from '@features/settings/store/settingsStore';
import { useChordStore } from '@features/play/store/chordStore';
import { THEMES, ROLE_COLORS_GLOBAL } from '@shared/ui/themes';
import SettingRow, { ToggleButton } from '@features/settings/components/SettingRow';

export default function SharedSettingsPanel() {
  const {
    theme, labelMode, setLabelMode, colorMode, setColorMode, 
    selectiveRoles, toggleSelectiveRole,
    instrument, setInstrument, arp, setArp, referenceFrequency, setReferenceFrequency,
    octave, setOctave, octaveNumbering, setOctaveNumbering
  } = useSettingsStore();
  const { namingMode, setNamingMode } = useChordStore();
  const t = THEMES[theme];

  const [activeTab, setActiveTab] = useState<'display' | 'audio'>('display');

  const renderDivider = () => <View style={[styles.divider, { backgroundColor: t.border }]} />;

  const Tab = ({ id, label, icon }: { id: any, label: string, icon: keyof typeof Ionicons.glyphMap }) => {
    const isActive = activeTab === id;
    return (
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => setActiveTab(id)}
        style={{
          flex: 1, paddingVertical: 12, alignItems: 'center', gap: 6,
          borderBottomWidth: 2, borderBottomColor: isActive ? t.accent : 'transparent'
        }}>
        <Ionicons name={icon} size={20} color={isActive ? t.accent : t.txt3} />
        <Text style={{ fontSize: 12, fontWeight: '700', color: isActive ? t.accent : t.txt3 }}>{label}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={{ gap: 0 }}>
      {/* Tabs Header */}
      <View style={{ flexDirection: 'row', marginBottom: 16, borderBottomWidth: 1, borderBottomColor: t.border }}>
        <Tab id="display" label="Display" icon="color-palette-outline" />
        <Tab id="audio" label="Audio" icon="musical-notes-outline" />
      </View>

      {/* Display Tab */}
      {activeTab === 'display' && (
        <View style={{ gap: 0 }}>
          <SettingRow icon="language-outline" label="Naming" theme={t}>
            <ToggleButton isActive={namingMode === 'flat'} theme={t} onPress={() => setNamingMode('flat')}>♭</ToggleButton>
            <ToggleButton isActive={namingMode === 'sharp'} theme={t} onPress={() => setNamingMode('sharp')}>♯</ToggleButton>
          </SettingRow>
          {renderDivider()}
          <SettingRow icon="text-outline" label="Labels" theme={t}>
            {(['none', 'degrees', 'notes'] as const).map(m => (
              <ToggleButton key={m} isActive={labelMode === m} theme={t} onPress={() => setLabelMode(m)} style={{ paddingHorizontal: 10 }} textStyle={{ textTransform: 'capitalize' }}>
                {m}
              </ToggleButton>
            ))}
          </SettingRow>
          {renderDivider()}
          <SettingRow icon="musical-note-outline" label="Octave Numbering" theme={t}>
            <ToggleButton isActive={octaveNumbering} theme={t} onPress={() => setOctaveNumbering(true)}>On</ToggleButton>
            <ToggleButton isActive={!octaveNumbering} theme={t} onPress={() => setOctaveNumbering(false)}>Off</ToggleButton>
          </SettingRow>
          {renderDivider()}
          <SettingRow icon="color-palette-outline" label="Note Color" theme={t}>
            <ToggleButton isActive={colorMode === 'roles'} theme={t} onPress={() => setColorMode('roles')}>Roles</ToggleButton>
            <ToggleButton isActive={colorMode === 'theme'} theme={t} onPress={() => setColorMode('theme')}>Theme</ToggleButton>
            <ToggleButton isActive={colorMode === 'selective'} theme={t} onPress={() => setColorMode('selective')}>Selective</ToggleButton>
          </SettingRow>

          {colorMode === 'selective' && (
            <>
              {renderDivider()}
                <SettingRow icon="color-filter-outline" label="Highlight" theme={t}>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <View style={{ flexDirection: 'row', gap: 4 }}>
                    {['root', '2', '3', '4'].map(role => {
                      const isActive = selectiveRoles.includes(role);
                      const roleColor = ROLE_COLORS_GLOBAL[role] || t.accent;
                      const label = role === 'root' ? 'R' : role === '2' ? '2/9' : role === '4' ? '4/11' : role === '6' ? '6/13' : role;
                      return (
                        <TouchableOpacity
                          key={role}
                          onPress={() => toggleSelectiveRole(role)}
                          style={{
                            width: 30, height: 30, borderRadius: 15,
                            backgroundColor: isActive ? roleColor : t.bg3,
                            borderWidth: 1, borderColor: isActive ? roleColor : t.border,
                            justifyContent: 'center', alignItems: 'center'
                          }}
                        >
                          <Text style={{ fontSize: 11, fontWeight: '700', color: isActive ? '#FFF' : t.txt3 }} numberOfLines={1}>
                            {label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  <View style={{ flexDirection: 'row', gap: 4, paddingRight: 17 }}>
                    {['5', '6', '7'].map(role => {
                      const isActive = selectiveRoles.includes(role);
                      const roleColor = ROLE_COLORS_GLOBAL[role] || t.accent;
                      const label = role === 'root' ? 'R' : role === '2' ? '2/9' : role === '4' ? '4/11' : role === '6' ? '6/13' : role;
                      return (
                        <TouchableOpacity
                          key={role}
                          onPress={() => toggleSelectiveRole(role)}
                          style={{
                            width: 30, height: 30, borderRadius: 15,
                            backgroundColor: isActive ? roleColor : t.bg3,
                            borderWidth: 1, borderColor: isActive ? roleColor : t.border,
                            justifyContent: 'center', alignItems: 'center'
                          }}
                        >
                          <Text style={{ fontSize: 11, fontWeight: '700', color: isActive ? '#FFF' : t.txt3 }} numberOfLines={1}>
                            {label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              </SettingRow>
            </>
          )}
        </View>
      )}

      {/* Audio Tab */}
      {activeTab === 'audio' && (
        <View style={{ gap: 0 }}>
          <SettingRow icon="musical-notes-outline" label="Instrument" theme={t}>
            <ToggleButton isActive={instrument === 'piano'} theme={t} onPress={() => setInstrument('piano')}>Piano</ToggleButton>
            <ToggleButton isActive={instrument === 'guitar'} theme={t} onPress={() => setInstrument('guitar')}>Guitar</ToggleButton>
          </SettingRow>
          {renderDivider()}
          <SettingRow icon="swap-vertical-outline" label={`${instrument === 'piano' ? 'Piano' : 'Guitar'} Octave`} theme={t}>
            <ToggleButton theme={t} onPress={() => setOctave(octave - 1)}>
              <Ionicons name="remove" size={16} color={t.txt2} />
            </ToggleButton>
            <Text style={{ fontWeight: '700', fontSize: 13, color: t.txt1, minWidth: 20, textAlign: 'center' }}>
              {octave}
            </Text>
            <ToggleButton theme={t} onPress={() => setOctave(octave + 1)}>
              <Ionicons name="add" size={16} color={t.txt2} />
            </ToggleButton>
          </SettingRow>
          {renderDivider()}
          <SettingRow icon="options-outline" label="Tuning (A=)" theme={t}>
            {[432, 440, 512].map(f => (
              <ToggleButton key={f} isActive={referenceFrequency === f} theme={t} onPress={() => setReferenceFrequency(f)}>
                {f}
              </ToggleButton>
            ))}
          </SettingRow>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  divider: { height: 1, marginVertical: 4 },
});