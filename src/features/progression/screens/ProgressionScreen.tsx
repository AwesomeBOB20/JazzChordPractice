import React, { useRef, useState, useEffect } from 'react';
import { Alert, View, Text, TouchableOpacity, StyleSheet, SafeAreaView, ScrollView, Platform, StatusBar as RNStatusBar, TextInput, UIManager, Dimensions, Animated, TouchableWithoutFeedback, PanResponder, BackHandler } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useIsFocused, useFocusEffect } from '@react-navigation/native';

import { useSettingsStore } from '@features/settings/store/settingsStore';
import { useChordStore } from '@features/play/store/chordStore';
import { useProgressionStore } from '@features/progression/store/progressionStore';
import { THEMES } from '@shared/ui/themes';
import { NOTE_SHARP, NOTE_FLAT, CH, getChordNotes, getChordIntervals, CHORD_CATEGORIES, CHORD_SCALE_MAP, SCALES, GUITAR_TUNING, detectKey } from '@shared/theory/musicTheory';
import { useAudio } from '@shared/audio/AudioContext';
import { useProgressionPlayer } from '@shared/hooks/useProgressionPlayer';
import { calculateOptimalVoiceLeading, STRING_SETS_BY_TYPE, buildScaleVoicings, buildArpVoicings } from '@shared/guitar';

// NOTICE: ProgressionSettings has been completely removed from this import list!
import { ProgressionPlayerDock, PopUpModal, SlideUpModal, MiniChordDiagram, MiniPianoDiagram, BpmModal } from '@shared/ui';
import { familyForWeight } from '@shared/fonts/fonts';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const ROOTS = [0,1,2,3,4,5,6,7,8,9,10,11];

// Hybrid voicing for extension chords: root + guide tones (3rd/7th) + extensions, drop the
// perfect 5th. Built from the ascending getChordNotes stack so upper extensions sit an octave+
// above their clash partner (the "octave apart" avoid-note rule, satisfied by construction).
// Returns null for non-extension chords so callers keep their existing behavior unchanged.
function getExtensionVoicingNotes(chord: any, octave: number): number[] | null {
  const ch = CH[chord.chordType];
  if (!ch || ch.iv.length <= 4) return null;
  const stack = getChordNotes(chord.rootSemi, chord.chordType, octave); // parallel to ch.iv / ch.r
  const isThird = (r: string) => r === '3rd' || r === 'b3rd' || r === '4th' || r === '2nd';
  const isSeventh = (r: string) => r === '7th' || r === 'b7th' || r === '6th';

  // keep root + guide tones + extensions; drop only the PERFECT 5th (#5/b5 are colors, kept)
  let notes = stack.filter((_n: number, i: number) => ch.r[i] !== '5th');

  // legibility cap at 5: keep root + guide tones + the highest (defining) extensions
  if (notes.length > 5) {
    const guide = stack.filter((_n: number, i: number) => ch.r[i] === 'root' || isThird(ch.r[i]) || isSeventh(ch.r[i]));
    const ext = notes.filter((n: number) => !guide.includes(n)).sort((a: number, b: number) => b - a).slice(0, 5 - guide.length);
    notes = [...guide, ...ext];
  }
  notes.sort((a: number, b: number) => a - b);

  // declash safety net: lift any tight m2 up an octave (turns it into a soft m9); if it still
  // can't separate after a few passes, drop the higher (color) note — revert to the substitute.
  for (let pass = 0; pass < 6; pass++) {
    const i = notes.findIndex((n: number, k: number) => k < notes.length - 1 && notes[k + 1] - n === 1);
    if (i === -1) break;
    notes[i + 1] += 12;
    notes.sort((a: number, b: number) => a - b);
    if (pass === 5) notes.splice(notes.indexOf(Math.max(...notes)), 1);
  }
  return notes;
}

const ProgressionCell = React.memo(function ProgressionCell({ 
  group, gIdx, viewMode, arpView, instrument, octave,
  selectedCell, playingIdx,
  handleCellPress, handleCellLongPress,
  t, diagramVoicings, pianoVoicings, diagramArps, pianoArps,
  groupedCells, NOTE_FLAT, NOTE_SHARP
}: any) {
  const getCellProps = (idx: number) => {
    const isSelected = selectedCell === idx;
    const isPlaying = playingIdx === idx;
    let bgColor = t.bg3;
    let borderColor = t.border;
    if (isSelected) { borderColor = t.accent; bgColor = t.bg2; }
    if (isPlaying) { bgColor = t.bg2; borderColor = t.accent; }
    return { isSelected, isPlaying, bgColor, borderColor };
  };

  const currentEffectiveBeats = group.type === 'split' ? 4 : (group.chord?.beats || 4);
  const prevEffectiveBeats = gIdx > 0 ? (groupedCells[gIdx - 1].type === 'split' ? 4 : (groupedCells[gIdx - 1].chord?.beats || 4)) : null;
  const showTimeSig = gIdx === 0 || currentEffectiveBeats !== prevEffectiveBeats;

  const renderContent = (chord: any, idx: number, isPlaying: boolean, isRightHalf: boolean = false, isSplit: boolean = false) => {
      const txtColor1 = isPlaying ? t.accent : t.txt1;
      const txtColor2 = isPlaying ? t.accent : t.txt2;
      const rootText = chord ? (chord.namingMode === 'flat' ? NOTE_FLAT : NOTE_SHARP)[chord.rootSemi % 12] : '-';
      const typeText = chord ? CH[chord.chordType]?.s : '';

      const topNum = isSplit ? '4' : chord?.beats === 3 ? '3' : chord?.beats === 2 ? '2' : '4';
      
      return (
        <View style={{ flex: 1, width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          
          {/* Absolute Measure Number */}
          {!isRightHalf && (
            <Text style={{ position: 'absolute', top: 4, right: 6, fontSize: 9, fontWeight: '700', color: isPlaying ? t.accent : t.txt3, opacity: 0.6, zIndex: 10 }}>{gIdx + 1}</Text>
          )}
          
          {/* Left Zone: Time Sig, Start Repeat */}
          <View style={viewMode === 'diagram' ? { position: 'absolute', left: 4, bottom: 4, zIndex: 2 } : { alignItems: 'flex-start', justifyContent: 'flex-end', paddingBottom: 4, paddingLeft: 4, height: '100%', zIndex: 2 }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
              {!isRightHalf && showTimeSig && (
                <View style={{ alignItems: 'center', marginRight: 4, marginBottom: 4 }}>
                  <Text style={{ fontFamily: Platform.OS === 'ios' ? 'Times New Roman' : 'serif', fontSize: 16, fontWeight: 'bold', color: t.accent, lineHeight: 14 }}>{topNum}</Text>
                  <Text style={{ fontFamily: Platform.OS === 'ios' ? 'Times New Roman' : 'serif', fontSize: 16, fontWeight: 'bold', color: t.accent, lineHeight: 14 }}>4</Text>
                </View>
              )}
              {!!chord?.repeatStart && ( <Text style={{ fontSize: 22, color: t.accent, fontWeight: '800', marginBottom: 1 }}>𝄆</Text> )}
            </View>
          </View>

          {/* Center Zone: The Chord Component */}
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            {viewMode === 'text' ? (
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center' }}>
                <Text style={[styles.cellRoot, { color: txtColor1, fontSize: 20 }]}>{rootText}</Text>
                <Text style={[styles.cellType, { color: txtColor2, fontSize: 10, marginTop: 1 }]} numberOfLines={1}>{typeText}</Text>
              </View>
            ) : (
              <View style={{ alignItems: 'center' }}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginTop: 0 }}>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: txtColor1 }}>{rootText}</Text>
                  <Text style={{ fontSize: 10, fontWeight: '700', color: txtColor2, marginTop: 1 }}>{typeText}</Text>
                </View>
                {chord && (
                  <View style={{ marginTop: 10 }}>
                    {instrument === 'piano' ? (
                      <MiniPianoDiagram chord={chord} notes={arpView ? pianoArps[idx]?.notes : pianoVoicings[idx]?.notes} theme={t} octave={octave} />
                    ) : (
                      <MiniChordDiagram voicing={diagramVoicings[idx]} arpShape={arpView ? diagramArps[idx] : undefined} theme={t} />
                    )}
                  </View>
                )}
              </View>
            )}
          </View>

          {/* Right Zone: End Repeat */}
          <View style={viewMode === 'diagram' ? { position: 'absolute', right: 4, bottom: 4, zIndex: 2 } : { alignItems: 'flex-end', justifyContent: 'flex-end', paddingBottom: 4, paddingRight: 4, height: '100%', zIndex: 2 }}>
            {!!chord?.repeatEnd && ( <Text style={{ fontSize: 22, color: t.accent, fontWeight: '800', marginBottom: 1 }}>𝄇</Text> )}
          </View>

        </View>
      );
  };

  const cellHeight = viewMode === 'diagram' ? 130 : 60;

  if (group.type === 'single') {
    const { idx, chord } = group;
    const { isSelected, isPlaying, bgColor, borderColor } = getCellProps(idx);
    return (
      <TouchableOpacity activeOpacity={0.7}
        style={[styles.cell, { backgroundColor: bgColor, borderColor: borderColor, zIndex: isPlaying ? 10 : isSelected ? 10 : 1, height: cellHeight }, (isSelected || isPlaying) && { borderWidth: 2 }]}
        onPress={() => handleCellPress(idx, chord)} onLongPress={() => handleCellLongPress(idx, chord)} delayLongPress={300}>
        {renderContent(chord, idx, isPlaying, false, false)}
      </TouchableOpacity>
    );
  } else {
    const { left, right, leftIdx, rightIdx } = group;
    const pLeft = getCellProps(leftIdx);
    const pRight = getCellProps(rightIdx);
    const isPlaying = pLeft.isPlaying || pRight.isPlaying;
    const isSelected = pLeft.isSelected || pRight.isSelected;
    let bgColor = t.bg3;
    let borderColor = t.border;
    if (isSelected) { borderColor = t.accent; bgColor = t.bg2; }
    if (isPlaying) { bgColor = t.bg2; borderColor = t.accent; }

    const renderSplitText = (chord: any, isPlayingChord: boolean) => {
        const rootText = chord ? (chord.namingMode === 'flat' ? NOTE_FLAT : NOTE_SHARP)[chord.rootSemi % 12] : '-';
        const typeText = chord ? CH[chord.chordType]?.s : '';
        const txtColor1 = isPlaying ? (isPlayingChord ? t.accent : t.txt3) : t.txt1;
        const txtColor2 = isPlaying ? (isPlayingChord ? t.accent : t.txt3) : t.txt2;

        if (viewMode === 'text') {
          return (
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center' }}>
              <Text style={[styles.cellRoot, { color: txtColor1, fontSize: 15 }]}>{rootText}</Text>
              <Text style={[styles.cellType, { color: txtColor2, fontSize: 9, marginTop: 1 }]} numberOfLines={1}>{typeText}</Text>
            </View>
          );
        } else {
          return (
            <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
              <Text style={{ fontSize: 11, fontWeight: '800', color: txtColor1 }}>{rootText}</Text>
              <Text style={{ fontSize: 9, fontWeight: '700', color: txtColor2, marginTop: 1 }}>{typeText}</Text>
            </View>
          );
        }
    };

    return (
      <View style={[styles.cell, { backgroundColor: bgColor, borderColor: borderColor, zIndex: isPlaying ? 10 : isSelected ? 10 : 1, height: cellHeight, padding: 0, flexDirection: 'row' }, (isSelected || isPlaying) && { borderWidth: 2 }]}>
          
          {/* Absolute Measure Number */}
          <Text style={{ position: 'absolute', top: 4, right: 6, fontSize: 9, fontWeight: '700', color: isPlaying ? t.accent : t.txt3, opacity: 0.6, zIndex: 10 }}>{gIdx + 1}</Text>

          {/* Left Zone */}
          <View style={viewMode === 'diagram' ? { position: 'absolute', left: 4, bottom: 4, zIndex: 2 } : { alignItems: 'flex-start', justifyContent: 'flex-end', paddingBottom: 4, paddingLeft: 4, height: '100%', zIndex: 2 }} pointerEvents="none">
            <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
              {showTimeSig && (
                <View style={{ alignItems: 'center', marginRight: 4, marginBottom: 4 }}>
                  <Text style={{ fontFamily: Platform.OS === 'ios' ? 'Times New Roman' : 'serif', fontSize: 12, fontWeight: 'bold', color: t.accent, lineHeight: 10 }}>4</Text>
                  <Text style={{ fontFamily: Platform.OS === 'ios' ? 'Times New Roman' : 'serif', fontSize: 12, fontWeight: 'bold', color: t.accent, lineHeight: 10 }}>4</Text>
                </View>
              )}
              {!!left?.repeatStart && ( <Text style={{ fontSize: 22, color: t.accent, fontWeight: '800', marginBottom: 1 }}>𝄆</Text> )}
            </View>
          </View>

          {/* Center Zone */}
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'space-evenly', paddingVertical: 0 }} pointerEvents="none">
            {viewMode === 'text' ? (
                <View style={{ flexDirection: 'row', width: '100%', justifyContent: 'center', gap: 8 }}>
                  {renderSplitText(left, pLeft.isPlaying)}
                  {renderSplitText(right, pRight.isPlaying)}
                </View>
            ) : (
                <>
                  <View style={{ alignItems: 'center', justifyContent: 'center' }}>
                      {renderSplitText(left, pLeft.isPlaying)}
                      <View style={{ transform: [{ scale: instrument === 'piano' ? 0.75 : 0.75 }], marginTop: 0, marginBottom: -6 }}>
                        {instrument === 'piano' ? (
                          <MiniPianoDiagram chord={left} notes={arpView ? pianoArps[leftIdx]?.notes : pianoVoicings[leftIdx]?.notes} theme={t} octave={octave} />
                        ) : (
                          <MiniChordDiagram voicing={diagramVoicings[leftIdx]} arpShape={arpView ? diagramArps[leftIdx] : undefined} theme={t} />
                        )}
                      </View>
                  </View>
                  <View style={{ alignItems: 'center', justifyContent: 'center' }}>
                      {renderSplitText(right, pRight.isPlaying)}
                      <View style={{ transform: [{ scale: instrument === 'piano' ? 0.75 : 0.75 }], marginTop: 0, marginBottom: -6 }}>
                        {instrument === 'piano' ? (
                          <MiniPianoDiagram chord={right} notes={arpView ? pianoArps[rightIdx]?.notes : pianoVoicings[rightIdx]?.notes} theme={t} octave={octave} />
                        ) : (
                          <MiniChordDiagram voicing={diagramVoicings[rightIdx]} arpShape={arpView ? diagramArps[rightIdx] : undefined} theme={t} />
                        )}
                      </View>
                  </View>
                </>
            )}
          </View>

          {/* Right Zone */}
          <View style={viewMode === 'diagram' ? { position: 'absolute', right: 4, bottom: 4, zIndex: 2 } : { alignItems: 'flex-end', justifyContent: 'flex-end', paddingBottom: 4, paddingRight: 4, height: '100%', zIndex: 2 }} pointerEvents="none">
            {!!right?.repeatEnd && ( <Text style={{ fontSize: 22, color: t.accent, fontWeight: '800', marginBottom: 1 }}>𝄇</Text> )}
          </View>

          {/* NOTE: Tappable layer is now a COLUMN. Top half selects Chord 1, Bottom half selects Chord 2 */}
          <View style={[StyleSheet.absoluteFill, { flexDirection: 'column', zIndex: 5 }]}>
            <TouchableOpacity style={{ flex: 1 }} onPress={() => handleCellPress(leftIdx, left)} onLongPress={() => handleCellLongPress(leftIdx, left)} delayLongPress={300} />
            <TouchableOpacity style={{ flex: 1 }} onPress={() => handleCellPress(rightIdx, right)} onLongPress={() => handleCellLongPress(rightIdx, right)} delayLongPress={300} />
          </View>
      </View>
    );
  }
});

export default function ProgressionScreen() {
  const { playChord: onPlay, stopAudio: onStop } = useAudio();
  const { theme, instrument, bpm, setBpm, voiceLeading, voiceLeadDir, fretCap, pianoZone, setPianoZone, octave, fontFamily, setArpForced, isPro } = useSettingsStore();
  const { rootSemi, chordType, namingMode, resetPulse } = useChordStore();
  const { progression, setProgressionChord, clearProgression, addMeasure, removeMeasure, insertBlanks, saveSong, savedSongs, loadSong, deleteSong, guitarNeckZone, setGuitarNeckZone, songVoicingType, setSongVoicingType, songStringSet, setSongStringSet, transposeProgression, setChordBeats, toggleRepeatStart, toggleRepeatEnd, removeProgressionChord, setVolta, toggleSection, categories, addCategory, setSongCategory, activeSongId } = useProgressionStore();
  
  const t = THEMES[theme];
  const insets = useSafeAreaInsets();

  const screenHeight = Dimensions.get('window').height;
  const tabBarHeight = 60 + insets.bottom + 4;
  const topInset = insets.top || (Platform.OS === 'android' ? 24 : 0);
  const usableHeight = screenHeight - tabBarHeight - topInset;
  const sheetPixelHeight = Math.round(usableHeight * 0.6);
  
  const [selectedCell, setSelectedCell] = useState<number | null>(0);
  const [viewMode, setViewMode] = useState<'text' | 'diagram'>('text');
  const [arpView, setArpView] = useState(false);
  const lastTap = useRef<{ idx: number, time: number }>({ idx: -1, time: 0 });

  // View cycles: NAME (text) → CHORDS (block voicing diagrams) → ARPS (same voicing,
  // numbered + played note-by-note) → NAME.
  const cycleViewMode = () => {
    if (viewMode === 'text') {
      setViewMode('diagram');
      setArpView(false);
    } else if (!arpView) {
      setArpView(true);
    } else {
      setViewMode('text');
      setArpView(false);
    }
  };

  const diagramVoicings = React.useMemo(() => calculateOptimalVoiceLeading(progression, voiceLeading, fretCap, guitarNeckZone, songVoicingType, songStringSet, voiceLeadDir), [progression, voiceLeading, fretCap, guitarNeckZone, songVoicingType, songStringSet, voiceLeadDir]);

  const pianoVoicings = React.useMemo(() => {
    const result: any[] = [];
    let lastVoicing: number[] | null = null;
    const baseMidi = 60;
    // ZONE is a single note that cycles WITHIN the octave set in Settings (octave 4 →
    // C4…B4); `pianoZone` is the pitch class. Voice leading keeps every chord centred on
    // that note (and pulls it back if it drifts out). With voice leading OFF the zone is
    // ignored — each chord is plain root position at the settings octave.
    const ZONE_PC = (((pianoZone % 12) + 12) % 12);
    const ZONE_TARGET = ((octave + 1) * 12) + ZONE_PC;

    // Directional walk state (mirrors the guitar engine). `home` is the register the voicing
    // is pulled toward each chord: Zone keeps it on ZONE_TARGET; Up/Down walk it and wrap by an
    // octave at the band edges (staircase); Bounce ping-pongs it. PIANO_SPAN ≈ the half-band it
    // travels (kept under an octave so notes stay in the octave-search range).
    const PIANO_STEP = 4, PIANO_SPAN = 10;
    let home = ZONE_TARGET;
    let pBounceDir: 'up' | 'down' = 'up';

    for (let i = 0; i < progression.length; i++) {
      const chord = progression[i];
      if (!chord || chord.spacer) { result.push(null); continue; }

      let rawNotes = getExtensionVoicingNotes(chord, octave);
      if (!rawNotes) {
        const intervals = getChordIntervals(chord.chordType).slice(0, 4);
        rawNotes = intervals.map((iv: number) => {
          const pc = (chord.rootSemi + iv) % 12;
          let midi = ((octave + 1) * 12) + pc;
          if (midi < ((octave + 1) * 12) + chord.rootSemi) midi += 12;
          return midi;
        });
      }

      if (!voiceLeading) {
        // No voice leading → plain root position at the settings octave (root in the bass).
        // getExtensionVoicingNotes / the fallback already build root-position note sets.
        lastVoicing = rawNotes;
        result.push({ notes: rawNotes });
        continue;
      }

      {
        // Advance the directional `home` for this chord (after the first real chord, which sets
        // the opening register). Up/Down walk the register and wrap an octave at the band edge;
        // Bounce ping-pongs; Zone leaves home on ZONE_TARGET (identical to the old behaviour).
        if (lastVoicing) {
          if (voiceLeadDir === 'up')   { home += PIANO_STEP; if (home > ZONE_TARGET + PIANO_SPAN) home -= 12; }
          else if (voiceLeadDir === 'down') { home -= PIANO_STEP; if (home < ZONE_TARGET - PIANO_SPAN) home += 12; }
          else if (voiceLeadDir === 'bounce') {
            home += (pBounceDir === 'up' ? PIANO_STEP : -PIANO_STEP);
            if (home >= ZONE_TARGET + PIANO_SPAN) { home = ZONE_TARGET + PIANO_SPAN; pBounceDir = 'down'; }
            else if (home <= ZONE_TARGET - PIANO_SPAN) { home = ZONE_TARGET - PIANO_SPAN; pBounceDir = 'up'; }
          }
        }

        // Voice-lead each pitch class to the octave nearest the previous voicing — or, for the
        // FIRST chord (no previous), nearest `home`. Using home as the first chord's reference
        // means it actually re-voices (inverts) when the zone changes, instead of being frozen
        // in root position the way a whole-voicing octave shift left it.
        const directional = voiceLeadDir === 'up' || voiceLeadDir === 'down' || voiceLeadDir === 'bounce';
        const prevCenter = lastVoicing
          ? lastVoicing.reduce((a, b) => a + b, 0) / lastVoicing.length
          : home;
        let next = rawNotes.map(note => {
          const pc = note % 12;
          let closest = pc + baseMidi;
          let minScore = Infinity;
          for (let oct = octave - 2; oct <= octave + 2; oct++) {
            const test = pc + oct * 12;
            // Directional modes track the walking `home` register directly so the voicing
            // actually moves with it; Zone keeps the original smoothness+zone blend.
            const score = directional
              ? Math.abs(test - home)
              : Math.abs(test - prevCenter) + 0.6 * Math.abs(test - home);
            if (score < minScore) { minScore = score; closest = test; }
          }
          return closest;
        });
        next.sort((a: number, b: number) => a - b);
        // Hard register clamp: if the whole voicing has drifted more than a few semitones off
        // `home`, octave-shift it back. This is what carries the voicing along as home walks.
        let center = next.reduce((a, b) => a + b, 0) / next.length;
        while (center - home > 7) { next = next.map(n => n - 12); center -= 12; }
        while (home - center > 7) { next = next.map(n => n + 12); center += 12; }
        next.sort((a: number, b: number) => a - b);
        rawNotes = next;
      }

      lastVoicing = rawNotes;
      result.push({ notes: rawNotes });
    }
    return result;
  }, [progression, voiceLeading, octave, pianoZone, voiceLeadDir]);

  // ── ARPS view: CAGED arpeggio shapes (same as the Play / Quiz screens) ──────────
  // Guitar: build the chord's full arpeggio across the 5 CAGED boxes, then keep the ONE
  // box whose fret region best fits the area we're working in — the neck zone when set,
  // otherwise the position of the (zone-anchored) voice-led voicing. Same idea as the old
  // shapes picker, but with real CAGED arpeggio data instead of hardcoded chord shapes.
  const diagramArps = React.useMemo(() => {
    return progression.map((chord, idx) => {
      if (!chord || chord.spacer) return null;
      const def = CH[chord.chordType];
      if (!def) return null;
      const scaleIds = CHORD_SCALE_MAP[chord.chordType] ?? [];
      if (!scaleIds.length) return null;
      const scaleId = scaleIds[0];
      const boxes = buildScaleVoicings([scaleId], SCALES, chord.rootSemi, def.iv, namingMode)
        .filter((sv: any) => sv.scaleId === scaleId);
      if (!boxes.length) return null;
      const arps = buildArpVoicings(boxes, chord.rootSemi, def.iv, def.r, def.f || [], chord.chordType);
      if (!arps.length) return null;

      const isRoot = (role: string) => role === 'root' || role === '1' || role === 'R';

      if (!voiceLeading) {
        // No voice leading → root position: take the box with the root on the low E string at
        // the lowest fret, then DROP any notes below that root so the arpeggio's first (lowest)
        // note is always the root itself — even when the shape has open strings beneath it.
        const withRoot = arps
          .map((a: any) => ({ a, root: a.notes?.find((n: any) => n.stringIdx === 0 && isRoot(n.role)) }))
          .filter((x: any) => x.root)
          .sort((x: any, y: any) => x.root.fret - y.root.fret);
        if (withRoot.length) {
          const { a, root } = withRoot[0];
          const rootPitch = GUITAR_TUNING[0] + root.fret;
          // New object + filtered array — never mutate the cached arp voicing.
          const notes = a.notes.filter((n: any) => (GUITAR_TUNING[n.stringIdx] + n.fret) >= rootPitch);
          return { ...a, notes };
        }
      }

      // Voice leading → the box whose region fits the area we're in, centred on the neck
      // zone when set, else the position of the (zone-anchored) voice-led voicing.
      const vFrets = diagramVoicings[idx]?.frets
        ? diagramVoicings[idx].frets.map((f: any) => f?.fret).filter((f: any) => f !== null && f > 0)
        : [];
      const target = guitarNeckZone !== null ? guitarNeckZone : (vFrets.length ? Math.min(...vFrets) : 3);

      let best = arps[0];
      let bestDiff = Infinity;
      for (const a of arps) {
        const diff = Math.abs((a.minFret ?? 0) - target);
        if (diff < bestDiff) { bestDiff = diff; best = a; }
      }
      return best;
    });
  }, [progression, namingMode, guitarNeckZone, voiceLeading, diagramVoicings]);

  // Piano arpeggio: every chord tone exactly ONCE, ascending within a SINGLE octave (compact,
  // no repeated notes). The arp's BASS (lowest, first note) is the bass of the matching block
  // voicing — which is already voice-led and zone-centred — so the arps INVERT and move with
  // the voice leading instead of every one being root-position (which made them jump around).
  // Voice-leading-off voicings are root position, so the arp is too.
  const pianoArps = React.useMemo(() => {
    const ZONE_PC = (((pianoZone % 12) + 12) % 12);
    const ZONE_TARGET = ((octave + 1) * 12) + ZONE_PC;
    return progression.map((chord, idx) => {
      if (!chord || chord.spacer) return null;
      const def = CH[chord.chordType];
      if (!def) return null;
      // All distinct chord-tone pitch classes (the "fullest" arpeggio, each tone once).
      const pcs = Array.from(new Set(def.iv.map((iv: number) => (((chord.rootSemi + iv) % 12) + 12) % 12)));
      // Bass = the voice-led block voicing's lowest note (its inversion). Fall back to the
      // root near the zone when there's no voicing for this chord.
      const vNotes = pianoVoicings[idx]?.notes;
      let bassMidi: number;
      if (vNotes && vNotes.length) {
        bassMidi = Math.min(...vNotes);
      } else {
        const rootPc = (((chord.rootSemi % 12) + 12) % 12);
        bassMidi = rootPc + 12 * Math.round((ZONE_TARGET - rootPc) / 12);
      }
      const bassPc = ((bassMidi % 12) + 12) % 12;
      // Stack every chord tone ascending from that bass, each folded into the one octave above.
      const notes = pcs.map(pc => bassMidi + ((((pc - bassPc) % 12) + 12) % 12)).sort((a, b) => a - b);
      return { notes };
    });
  }, [progression, octave, pianoZone, pianoVoicings]);

  // In ARPS view the audio/diagram come from the arpeggio shapes (arpeggiated playback);
  // otherwise the block chord voicings. Guitar arps fall back to the chord voicing for any
  // chord with no parent scale.
  const audioVoicings = React.useMemo(() => {
    if (!arpView) return instrument === 'piano' ? pianoVoicings : diagramVoicings;
    return instrument === 'piano'
      ? pianoArps.map((a, i) => a ?? pianoVoicings[i])
      : diagramArps.map((a, i) => a ?? diagramVoicings[i]);
  }, [arpView, instrument, pianoVoicings, diagramVoicings, pianoArps, diagramArps]);
  const { playingIdx, isPlayingSystem, isLooping, queuedIdx, queueMeasure, toggleLooping, handlePlayProgression, stopPlayback } = useProgressionPlayer(selectedCell, audioVoicings, arpView);

  const isFocused = useIsFocused();
  useEffect(() => {
    if (isFocused) return;
    // Stop playback when the screen genuinely leaves — but NOT on a transient unfocus. On Android
    // cold start the navigator briefly flips focus while settling, which tore down a just-started
    // progression (highlight froze, audio cut — "stops on the 5th bar, first song after a reload").
    // Wait a beat: a real leave stays unfocused and still stops; a settle-flip re-focuses, the
    // cleanup cancels this, and playback continues.
    const id = setTimeout(() => { stopPlayback(); }, 400);
    return () => clearTimeout(id);
  }, [isFocused]);

  // Drive the universal header arp toggle: ARPS view forces the header to show (and lock to)
  // arpeggio while the user's real `arp` preference is preserved underneath. Leaving ARPS view
  // reverts the header to that preference; the App.tsx 'blur' listener clears it off-screen.
  // useFocusEffect (not isFocused) so it re-asserts on focus despite freezeOnBlur.
  useFocusEffect(
    React.useCallback(() => { setArpForced(arpView); }, [arpView, setArpForced])
  );

  const [isSaveModalVisible, setIsSaveModalVisible] = useState(false);
  const [isLibModalVisible, setIsLibModalVisible] = useState(false);
  const [isKeyModalVisible, setIsKeyModalVisible] = useState(false);
  const [keyModalQuality, setKeyModalQuality] = useState<'major' | 'minor'>('major');
  const [songName, setSongName] = useState('');
  const [isBpmModalVisible, setIsBpmModalVisible] = useState(false);
  // Library categories
  const [selectedLibCategory, setSelectedLibCategory] = useState('Standards');
  const [isCatModalVisible, setIsCatModalVisible] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [moveSongId, setMoveSongId] = useState<string | null>(null);

  // Cells per row in the chart grid (styles.cell is 25% wide).
  const COLS = 4;

  const groupedCells = React.useMemo(() => {
    const groups: any[] = [];
    for (let i = 0; i < progression.length; i++) {
      if (progression[i]?.beats === 2 && i + 1 < progression.length && progression[i+1]?.beats === 2) {
        groups.push({ type: 'split', left: progression[i], right: progression[i+1], leftIdx: i, rightIdx: i+1 });
        i++;
      } else {
        groups.push({ type: 'single', chord: progression[i], idx: i });
      }
    }
    return groups;
  }, [progression]);

  // The visual grid is COLS-wide. Section (rehearsal) letters should always begin a row, so before
  // any section measure that isn't already in the first column we pad the rest of the current row
  // with inert "auto" spacer cells. These are display-only — no real progression index, not
  // selectable, skipped by playback/editing — they just push the letterbox to the next row's
  // column 1. A section already at column 0 (e.g. one a preset hand-indented with real spacers)
  // gets no padding, so this never double-indents.
  const displayCells = React.useMemo(() => {
    const out: any[] = [];
    let col = 0;
    let autoKey = 0;
    for (const g of groupedCells) {
      const chord = g.type === 'split' ? (g.left ?? g.right) : g.chord;
      const isSectionStart = !!chord?.section && !chord?.spacer;
      if (isSectionStart && col !== 0) {
        for (let k = col; k < COLS; k++) out.push({ type: 'single', auto: true, idx: -1 - (autoKey++) });
        col = 0;
      }
      out.push(g);
      col = (col + 1) % COLS;
    }
    return out;
  }, [groupedCells]);

  // Measure numbers count only cells that contain a chord. Blank (null) cells —
  // e.g. the padding indent inserts to push content to the next row — are empty
  // spaces, not measures, so a chord keeps its number after indenting.
  const measureNumbers = React.useMemo(() => {
    let count = 0;
    return displayCells.map((g: any) => {
      // Spacers (indent padding) aren't measures, so they don't take a number. A `null`
      // cell IS an empty measure and stays numbered (with its dash), as it was before.
      const isSpacerCell = g.auto || (g.type === 'single' && !!g.chord?.spacer);
      if (isSpacerCell) return null;
      count += 1;
      return count;
    });
  }, [displayCells]);

  // Diagram cells grow taller to fit the tallest diagram on screen, so a wide CAGED arp box
  // — or two of them stacked in a split measure — never spills past the cell borders.
  const diagramCellHeight = React.useMemo(() => {
    if (viewMode !== 'diagram') return 66;
    // Pixel height one MiniChordDiagram needs, mirroring its own fret-window sizing.
    const guitarDiagHeight = (d: any): number => {
      if (!d) return 62;
      const frets: number[] = (d.notes
        ? d.notes.map((n: any) => n.fret)
        : (d.frets || []).map((f: any) => f?.fret)
      ).filter((f: any) => f != null && f > 0);
      if (!frets.length) return 62;
      const minF = Math.min(...frets), maxF = Math.max(...frets);
      let startF = minF <= 1 ? 0 : minF - 1;
      if (maxF <= 4) startF = 0;
      const numFrets = Math.max(4, maxF - startF);
      return 46 + (numFrets > 4 ? (numFrets - 4) * 10 : 0) + 16; // + topY + dot radii
    };
    const maxDiag = instrument === 'piano'
      ? 56 // MiniPianoDiagram is ~constant height
      : Math.max(62, ...(arpView ? diagramArps : diagramVoicings).map(guitarDiagHeight));
    const hasSplit = groupedCells.some((g: any) => g.type === 'split');
    // Single cell: one full-size diagram + label. Split cell: two 0.75-scaled diagrams stacked.
    const singleNeed = maxDiag + 56;
    const splitNeed = hasSplit ? 2 * (16 + maxDiag * 0.75) + 28 : 0;
    return Math.max(148, Math.ceil(singleNeed), Math.ceil(splitNeed));
  }, [viewMode, instrument, arpView, diagramArps, diagramVoicings, groupedCells]);

  // Section (rehearsal) letters: each measure flagged with `section` gets the next
  // letter A, B, C… in playback order, so they relabel automatically as you add/remove.
  const sectionLetters = React.useMemo(() => {
    let count = 0;
    return displayCells.map((g: any) => {
      const chord = g.type === 'split' ? (g.left ?? g.right) : g.chord;
      if (chord?.section) {
        const letter = String.fromCharCode(65 + (count % 26));
        count += 1;
        return letter;
      }
      return null;
    });
  }, [displayCells]);

  const detectedKey = React.useMemo(() => {
    // Only analyse the first section so multi-key exercises (ii-V-I circle, etc.)
    // display and transpose from their opening key rather than a blended average.
    let sectionsSeen = 0;
    const firstSection: typeof progression = [];
    for (const cell of progression) {
      if (cell && !cell.spacer && cell.section) {
        sectionsSeen++;
        if (sectionsSeen === 2) break;
      }
      firstSection.push(cell);
    }
    if (sectionsSeen < 2) {
      // No second section marker — cap at 4 real chords (one ii-V-I cycle).
      const capped: typeof progression = [];
      let real = 0;
      for (const c of firstSection) {
        capped.push(c);
        if (c && !c.spacer) { real++; if (real >= 4) break; }
      }
      return detectKey(capped);
    }
    return detectKey(firstSection);
  }, [progression]);

  const [isDrawerVisible, setIsDrawerVisible] = useState(false);
  const drawerSlideAnim = useRef(new Animated.Value(sheetPixelHeight)).current;
  const drawerBackdropAnim = useRef(new Animated.Value(0)).current;
  const [drawerModalVisible, setDrawerModalVisible] = useState(false);

  const [brushRoot, setBrushRoot] = useState<number>(rootSemi);
  const [brushType, setBrushType] = useState<string>(chordType);
  const [rootScrolled, setRootScrolled] = useState(false);
  const [qualityScrolled, setQualityScrolled] = useState(false);

  const notes = namingMode === 'flat' ? NOTE_FLAT : NOTE_SHARP;
  const scrollRef = useRef<ScrollView>(null);

  const drawerRootScrollRef = useRef<ScrollView>(null);
  const drawerQualScrollRef = useRef<ScrollView>(null);
  const [drawerRootHeight, setDrawerRootHeight] = useState(0);
  const [drawerQualHeight, setDrawerQualHeight] = useState(0);
  const drawerQualCatY = useRef<{[key: string]: number}>({});
  const drawerQualRowY = useRef<{[key: string]: number}>({});
  const drawerQualItemY = useRef<{[key: string]: number}>({});

  useEffect(() => {
    if (!isDrawerVisible || drawerRootHeight === 0 || drawerQualHeight === 0) return;
    const performScroll = () => {
      if (drawerRootScrollRef.current) {
        const index = ROOTS.indexOf(brushRoot);
        if (index !== -1) {
          const itemHeight = 44;
          const gap = 12;
          const itemY = index * (itemHeight + gap);
          const centerY = itemY - (drawerRootHeight / 2) + (itemHeight / 2);
          drawerRootScrollRef.current.scrollTo({ y: Math.max(0, centerY), animated: true });
        }
      }
      if (drawerQualScrollRef.current) {
        const cat = CHORD_CATEGORIES.find(c => c.keys.includes(brushType));
        if (cat) {
          const cY = drawerQualCatY.current[cat.label] || 0;
          const rY = drawerQualRowY.current[cat.label] || 0;
          const iY = drawerQualItemY.current[brushType] || 0;
          const absoluteY = cY + rY + iY;
          const buttonHeight = 40; 
          const centerY = absoluteY - (drawerQualHeight / 2) + (buttonHeight / 2);
          drawerQualScrollRef.current.scrollTo({ y: Math.max(0, centerY), animated: true });
        }
      }
    };
    const timer = setTimeout(performScroll, 250);
    return () => clearTimeout(timer);
  }, [isDrawerVisible, brushRoot, brushType, drawerRootHeight, drawerQualHeight]);

  const showProAlert = () => Alert.alert('Pro Feature', 'Upgrade to Pro to unlock key changes and zone control.', [{ text: 'OK' }]);

  const openDrawer = () => setIsDrawerVisible(true);
  const closeDrawer = () => {
    setIsDrawerVisible(false);
    // During playback the editing toolbar is hidden, so a lingering "selected" cell highlight
    // serves no purpose and competes with the playing/queued borders — clear it on close.
    // When stopped, selection persists as usual (the toolbar acts on it).
    if (isPlayingSystem) setSelectedCell(null);
  };
  const sheetPixelHeightRef = useRef(sheetPixelHeight);
  sheetPixelHeightRef.current = sheetPixelHeight;
  const closeDrawerRef = useRef(closeDrawer);
  closeDrawerRef.current = closeDrawer;

  const drawerPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => Math.abs(gestureState.dy) > 10,
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) drawerSlideAnim.setValue(gestureState.dy);
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > sheetPixelHeightRef.current * 0.25 || gestureState.vy > 0.5) closeDrawerRef.current();
        else Animated.spring(drawerSlideAnim, { toValue: 0, bounciness: 6, useNativeDriver: true }).start();
      }
    })
  ).current;

  useEffect(() => {
    if (isDrawerVisible) {
      setDrawerModalVisible(true);
      drawerSlideAnim.setValue(sheetPixelHeight);
      drawerBackdropAnim.setValue(0);
      Animated.parallel([
        Animated.spring(drawerSlideAnim, { toValue: 0, bounciness: 6, useNativeDriver: true }),
        Animated.timing(drawerBackdropAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();
    } else if (drawerModalVisible) {
      Animated.parallel([
        Animated.timing(drawerSlideAnim, { toValue: sheetPixelHeight, duration: 200, useNativeDriver: true }),
        Animated.timing(drawerBackdropAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start(() => setDrawerModalVisible(false));
    }
  }, [isDrawerVisible]);

  useEffect(() => {
    if (resetPulse > 0) {
      setBrushRoot(0); setBrushType('maj'); setSelectedCell(0); closeDrawer();
    }
  }, [resetPulse]);

  useEffect(() => {
    const backAction = () => {
      if (moveSongId !== null) { setMoveSongId(null); return true; }
      if (isCatModalVisible) { setIsCatModalVisible(false); return true; }
      if (isSaveModalVisible) { setIsSaveModalVisible(false); return true; }
      if (isBpmModalVisible) { setIsBpmModalVisible(false); return true; }
      if (isKeyModalVisible) { setIsKeyModalVisible(false); return true; }
      if (isLibModalVisible) { setIsLibModalVisible(false); return true; }
      if (isDrawerVisible || drawerModalVisible) { closeDrawer(); return true; }
      return false;
    };
    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => backHandler.remove();
  }, [moveSongId, isCatModalVisible, isSaveModalVisible, isBpmModalVisible, isLibModalVisible, isKeyModalVisible, isDrawerVisible, drawerModalVisible]);

  const playSelectedCellAudio = (idx: number, chord: any) => {
    if (!chord || chord.spacer) return;
    let notesToPlay = getChordNotes(chord.rootSemi, chord.chordType, octave);
    if (instrument === 'guitar') {
      const GS = GUITAR_TUNING;
      const audioDiagram = (arpView ? (diagramArps[idx] ?? diagramVoicings[idx]) : diagramVoicings[idx]) as any;
      if (audioDiagram) {
        let extractedMidi: number[] = [];
        if (audioDiagram.frets && Array.isArray(audioDiagram.frets)) {
            extractedMidi = audioDiagram.frets.map((f: any, i: number) => {
                if (i >= 6) return null; 
                if (f === null || f === undefined) return null;
                let fretVal = typeof f === 'object' ? f.fret : f;
                if (fretVal === null || fretVal === undefined) return null;
                if (typeof fretVal === 'string' && fretVal.toLowerCase() === 'x') return null;
                const parsed = parseInt(fretVal, 10);
                if (isNaN(parsed) || parsed < 0) return null;
                return GS[i] + parsed;
            });
        } else if (audioDiagram.notes && Array.isArray(audioDiagram.notes)) {
            extractedMidi = audioDiagram.notes.map((n: any) => {
                if (n === null || n === undefined) return null;
                if (n.midi) return parseInt(n.midi, 10);
                let fretVal = typeof n === 'object' ? n.fret : n;
                if (fretVal === null || fretVal === undefined) return null;
                if (typeof fretVal === 'string' && fretVal.toLowerCase() === 'x') return null;
                const parsed = parseInt(fretVal, 10);
                if (isNaN(parsed) || parsed < 0) return null;
                let strIdx = typeof n === 'object' && n.stringIdx !== undefined ? n.stringIdx : undefined;
                if (strIdx === undefined || strIdx < 0 || strIdx > 5) return null;
                return GS[strIdx] + parsed;
            });
        }
        const cleanMidi = extractedMidi.filter((n: any) => n !== null && !isNaN(n)) as number[];
        if (cleanMidi.length > 0) notesToPlay = cleanMidi;
      }
    } else if (instrument === 'piano') {
      const activePianoVoicing = arpView ? (pianoArps[idx] ?? pianoVoicings[idx]) : pianoVoicings[idx];
      if (activePianoVoicing && activePianoVoicing.notes) {
        notesToPlay = activePianoVoicing.notes;
      } else {
        const ext = getExtensionVoicingNotes(chord, octave);
        if (ext) {
          notesToPlay = ext;
        } else {
          const intervals = getChordIntervals(chord.chordType).slice(0, 4);
          notesToPlay = intervals.map((iv: number) => {
            const pc = (chord.rootSemi + iv) % 12;
            let midi = ((octave + 1) * 12) + pc;
            if (midi < ((octave + 1) * 12) + chord.rootSemi) midi += 12;
            return midi;
          });
        }
      }
    }
    // In ARPS view the preview arpeggiates the shape's notes low→high, deduped (no unison
    // doublings) so the run is smooth and even.
    if (arpView) notesToPlay = Array.from(new Set(notesToPlay)).sort((a, b) => a - b);
    onPlay(notesToPlay, { guitar: instrument === 'guitar', forceArp: arpView });
  };

  // A preview chord (onPlay with no durationMs) resets the engine's nextMeasureTime to 0, which
  // derails the running progression clock — so skip the preview while playback is active. The
  // edit itself still lands on the cell (takes effect on the next play/loop).
  const handleRootPick = (r: number) => {
    setBrushRoot(r);
    if (selectedCell !== null) setProgressionChord(selectedCell, r, brushType);
    if (!isPlayingSystem) onPlay(getChordNotes(r, brushType, 4), { guitar: instrument === 'guitar' });
  };

  const handleTypePick = (type: string) => {
    setBrushType(type);
    if (selectedCell !== null) setProgressionChord(selectedCell, brushRoot, type);
    if (!isPlayingSystem) onPlay(getChordNotes(brushRoot, type, 4), { guitar: instrument === 'guitar' });
  };

  const handlePrevCell = () => {
    if (selectedCell === null) return;
    const prevIdx = selectedCell === 0 ? progression.length - 1 : selectedCell - 1; 
    setSelectedCell(prevIdx);
    const chord = progression[prevIdx];
    if (chord && !chord.spacer) {
      setBrushRoot(chord.rootSemi); setBrushType(chord.chordType);
      useChordStore.setState({ rootSemi: chord.rootSemi, chordType: chord.chordType });
      if (!isPlayingSystem) playSelectedCellAudio(prevIdx, chord);
    }
  };

  const handleNextCell = () => {
    if (selectedCell === null) return;
    const nextIdx = selectedCell === progression.length - 1 ? 0 : selectedCell + 1; 
    setSelectedCell(nextIdx);
    const chord = progression[nextIdx];
    if (chord && !chord.spacer) {
      setBrushRoot(chord.rootSemi); setBrushType(chord.chordType);
      useChordStore.setState({ rootSemi: chord.rootSemi, chordType: chord.chordType });
      if (!isPlayingSystem) playSelectedCellAudio(nextIdx, chord);
    }
  };

  // Compute repeat targets for selected cell (handles split measures)
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

  // Volta belongs to the whole measure: when the right half of a split is selected,
  // redirect reads and writes to the left chord (the canonical owner of the measure).
  const voltaTargetCell = isRight ? pairLeftIdx : selectedCell;
  const selectedVolta = voltaTargetCell !== null ? progression[voltaTargetCell]?.volta : undefined;
  // Section marker belongs to the whole measure too (left chord of a split pair).
  const selectedSection = voltaTargetCell !== null ? !!progression[voltaTargetCell]?.section : false;
  // Volta/section apply only to a real measure — not an empty cell or an indent spacer.
  const targetIsRealChord = voltaTargetCell !== null && !!progression[voltaTargetCell] && !progression[voltaTargetCell]!.spacer;

  // Indent: find which visual column the selected cell occupies and compute how many
  // blank cells to insert before it to push it to the start of the next row.
  const selectedGIdx = selectedCell !== null ? displayCells.findIndex(g =>
    g.type === 'split' ? (g.leftIdx === selectedCell || g.rightIdx === selectedCell) : g.idx === selectedCell
  ) : -1;
  const indentSpaces = selectedGIdx >= 0 ? (COLS - selectedGIdx % COLS) % COLS : 0;

  const handleIndent = () => {
    if (selectedCell === null || indentSpaces === 0) return;
    const insertBefore = isRight ? (pairLeftIdx ?? selectedCell) : selectedCell;
    insertBlanks(insertBefore, indentSpaces);
    setSelectedCell(selectedCell + indentSpaces);
  };

  return (
    <View style={[styles.safe, { backgroundColor: t.bg }]}>
      {!isPlayingSystem && <View style={[styles.card, {
        backgroundColor: t.bg2,
        justifyContent: 'center',
        zIndex: 30,
        paddingTop: 10,
        paddingBottom: 10,
        borderBottomWidth: 1,
        borderBottomColor: t.border
      }]}>
        {(
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, minHeight: 44 }} style={{ height: 44 }}>
            <TouchableOpacity style={[styles.measureBtn, { borderColor: t.border, backgroundColor: t.bg2, width: 'auto', paddingHorizontal: 10, flexDirection: 'row', gap: 4 }]} onPress={cycleViewMode}>
              {viewMode === 'text'
                ? <MaterialCommunityIcons name="lead-pencil" size={18} color={t.txt2} />
                : <Ionicons name={arpView ? 'musical-notes' : 'grid-outline'} size={18} color={t.accent} />}
              <Text style={{ fontSize: 10, fontWeight: '800', color: viewMode === 'text' ? t.txt2 : t.accent }}>{viewMode === 'text' ? 'NAME' : arpView ? 'ARPS' : 'CHORDS'}</Text>
            </TouchableOpacity>
            
            {/* Neck zone is hidden for Up/Down, which deliberately walk the whole neck and
                ignore the zone; Zone and Bounce both still use it (Bounce swings within it). */}
            {instrument === 'guitar' && !(voiceLeading && (voiceLeadDir === 'up' || voiceLeadDir === 'down')) && (
              <View style={{ flexDirection: 'row', alignItems: 'center', height: 40, backgroundColor: t.bg2, borderRadius: 20, borderWidth: 1, borderColor: isPro ? t.border : t.border, overflow: 'hidden', opacity: isPro ? 1 : 0.5 }}>
                <TouchableOpacity onPress={() => isPro ? setGuitarNeckZone(guitarNeckZone === null ? 12 : (guitarNeckZone <= 1 ? null : guitarNeckZone - 1)) : showProAlert()} style={{ height: 40, width: 30, justifyContent: 'center', alignItems: 'center', borderRightWidth: 1, borderColor: t.border }}>
                  <Text style={{ fontSize: 16, fontWeight: '800', color: t.txt2 }}>-</Text>
                </TouchableOpacity>
                <View style={{ alignItems: 'center', minWidth: 36 }}>
                  <Text style={{ fontSize: 8, fontWeight: '800', color: t.txt3 }}>ZONE</Text>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: t.txt1 }}>{guitarNeckZone === null ? 'AUTO' : guitarNeckZone}</Text>
                </View>
                <TouchableOpacity onPress={() => isPro ? setGuitarNeckZone(guitarNeckZone === null ? 1 : (guitarNeckZone >= 12 ? null : guitarNeckZone + 1)) : showProAlert()} style={{ height: 40, width: 30, justifyContent: 'center', alignItems: 'center', borderLeftWidth: 1, borderColor: t.border }}>
                  <Text style={{ fontSize: 16, fontWeight: '800', color: t.txt2 }}>+</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Piano zone — the note within the Settings octave the chords/arps centre on.
                Cycles C…B inside that one octave (octave 4 → C4…B4) and wraps. */}
            {instrument === 'piano' && (() => {
              const zonePc = (((pianoZone % 12) + 12) % 12);
              const noteName = (namingMode === 'flat' ? NOTE_FLAT : NOTE_SHARP)[zonePc];
              const label = `${noteName}${octave}`;
              return (
                <View style={{ flexDirection: 'row', alignItems: 'center', height: 40, backgroundColor: t.bg2, borderRadius: 20, borderWidth: 1, borderColor: t.border, overflow: 'hidden', opacity: isPro ? 1 : 0.5 }}>
                  <TouchableOpacity onPress={() => isPro ? setPianoZone((zonePc + 11) % 12) : showProAlert()} style={{ height: 40, width: 30, justifyContent: 'center', alignItems: 'center', borderRightWidth: 1, borderColor: t.border }}>
                    <Text style={{ fontSize: 16, fontWeight: '800', color: t.txt2 }}>-</Text>
                  </TouchableOpacity>
                  <View style={{ alignItems: 'center', minWidth: 40 }}>
                    <Text style={{ fontSize: 8, fontWeight: '800', color: t.txt3 }}>ZONE</Text>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: t.txt1 }}>{label}</Text>
                  </View>
                  <TouchableOpacity onPress={() => isPro ? setPianoZone((zonePc + 1) % 12) : showProAlert()} style={{ height: 40, width: 30, justifyContent: 'center', alignItems: 'center', borderLeftWidth: 1, borderColor: t.border }}>
                    <Text style={{ fontSize: 16, fontWeight: '800', color: t.txt2 }}>+</Text>
                  </TouchableOpacity>
                </View>
              );
            })()}

            {/* Global guitar voicing-type override — cycles every chord diagram through one
                family (or AUTO = voice-leading auto-pick). Highlighted when not on AUTO. */}
            {instrument === 'guitar' && (
              <TouchableOpacity
                onPress={() => {
                  const order = ['auto', 'triads', 'drop2', 'drop3', 'shells'] as const;
                  setSongVoicingType(order[(order.indexOf(songVoicingType) + 1) % order.length]);
                }}
                style={{ height: 40, minWidth: 56, paddingHorizontal: 12, borderRadius: 20, justifyContent: 'center', alignItems: 'center', backgroundColor: t.bg2, borderWidth: 1, borderColor: t.border }}
              >
                <Text style={{ fontSize: 8, fontWeight: '800', color: songVoicingType === 'auto' ? t.txt3 : t.accent }}>VOICING</Text>
                <Text style={{ fontSize: 11, fontWeight: '700', color: songVoicingType === 'auto' ? t.txt1 : t.accent }}>
                  {({ auto: 'AUTO', triads: 'TRIADS', drop2: 'DROP 2', drop3: 'DROP 3', shells: 'SHELLS' } as Record<string, string>)[songVoicingType]}
                </Text>
              </TouchableOpacity>
            )}

            {/* Strict string-set lock — only for types with a fixed set of string sets
                (Triads / Drop 2 / Drop 3). Cycles Any → each set, locking the whole song. */}
            {instrument === 'guitar' && STRING_SETS_BY_TYPE[songVoicingType] && (() => {
              const sets = STRING_SETS_BY_TYPE[songVoicingType];
              const active = songStringSet !== null;
              const curLabel = active ? (sets.find(s => s.key === songStringSet)?.label ?? 'ANY') : 'ANY';
              return (
                <TouchableOpacity
                  onPress={() => {
                    const keys: (string | null)[] = [null, ...sets.map(s => s.key)];
                    setSongStringSet(keys[(keys.indexOf(songStringSet) + 1) % keys.length]);
                  }}
                  style={{ height: 40, minWidth: 56, paddingHorizontal: 12, borderRadius: 20, justifyContent: 'center', alignItems: 'center', backgroundColor: t.bg2, borderWidth: 1, borderColor: t.border }}
                >
                  <Text style={{ fontSize: 8, fontWeight: '800', color: active ? t.accent : t.txt3 }}>STRINGS</Text>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: active ? t.accent : t.txt1 }}>{curLabel}</Text>
                </TouchableOpacity>
              );
            })()}

            {/* Time Signature */}
            <TouchableOpacity disabled={selectedCell === null} onPress={() => {
              if (selectedCell === null) return;
              const current = progression[selectedCell]?.beats || 4;
              const next = (current === 4 ? 2 : current + 1) as 2 | 3 | 4;
              setChordBeats(selectedCell, next);
            }} style={{ height: 40, minWidth: 44, borderRadius: 20, justifyContent: 'center', alignItems: 'center', backgroundColor: t.bg2, borderWidth: 1, borderColor: t.border }}>
              <View style={{ alignItems: 'center' }}>
                <Text style={{ fontFamily: Platform.OS === 'ios' ? 'Times New Roman' : 'serif', fontSize: 12, fontWeight: 'bold', color: t.txt1, lineHeight: 12 }}>{selectedCell !== null ? (progression[selectedCell]?.beats || 4) : 4}</Text>
                <Text style={{ fontFamily: Platform.OS === 'ios' ? 'Times New Roman' : 'serif', fontSize: 12, fontWeight: 'bold', color: t.txt1, lineHeight: 12 }}>4</Text>
              </View>
            </TouchableOpacity>

            {/* Repeats */}
            <View style={{ flexDirection: 'row', alignItems: 'center', height: 40, backgroundColor: t.bg2, borderRadius: 20, borderWidth: 1, borderColor: t.border, overflow: 'hidden' }}>
              <TouchableOpacity disabled={targetStartCell === null} onPress={() => targetStartCell !== null && toggleRepeatStart(targetStartCell)} style={{ height: 40, width: 40, justifyContent: 'center', alignItems: 'center', borderRightWidth: 1, borderColor: t.border }}>
                <Text style={{ fontSize: 18, fontWeight: '800', color: isRepeatStart ? t.accent : t.txt2, transform: [{ translateY: 1 }] }}>𝄆</Text>
              </TouchableOpacity>
              <TouchableOpacity disabled={targetEndCell === null} onPress={() => targetEndCell !== null && toggleRepeatEnd(targetEndCell)} style={{ height: 40, width: 40, justifyContent: 'center', alignItems: 'center' }}>
                <Text style={{ fontSize: 18, fontWeight: '800', color: isRepeatEnd ? t.accent : t.txt2, transform: [{ translateY: 1 }] }}>𝄇</Text>
              </TouchableOpacity>
            </View>

            {/* Section (rehearsal) marker — boxed Times New Roman letter on the measure */}
            <TouchableOpacity
              disabled={!targetIsRealChord}
              onPress={() => {
                if (!targetIsRealChord) return;
                toggleSection(voltaTargetCell);
              }}
              style={[styles.measureBtn, { borderColor: t.border, backgroundColor: t.bg2 }]}
            >
              <View style={{ width: 18, height: 18, borderWidth: 1.5, borderColor: selectedSection ? t.accent : t.txt2, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontFamily: Platform.OS === 'ios' ? 'Times New Roman' : 'serif', fontSize: 11, fontWeight: 'bold', color: selectedSection ? t.accent : t.txt2, lineHeight: 13 }}>A</Text>
              </View>
            </TouchableOpacity>

            {/* Volta Endings — always targets the full measure (left chord of a split pair) */}
            <View style={{ flexDirection: 'row', alignItems: 'center', height: 40, backgroundColor: t.bg2, borderRadius: 20, borderWidth: 1, borderColor: t.border, overflow: 'hidden' }}>
              <TouchableOpacity
                disabled={!targetIsRealChord}
                onPress={() => {
                  if (!targetIsRealChord) return;
                  setVolta(voltaTargetCell, selectedVolta === 1 ? undefined : 1);
                }}
                style={{ height: 40, width: 40, justifyContent: 'center', alignItems: 'center', borderRightWidth: 1, borderColor: t.border }}
              >
                <View style={{ width: 22, height: 16, justifyContent: 'flex-start', alignItems: 'flex-start' }}>
                  <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, backgroundColor: selectedVolta === 1 ? t.accent : t.txt2 }} />
                  <View style={{ position: 'absolute', top: 0, left: 0, width: 2, height: 12, backgroundColor: selectedVolta === 1 ? t.accent : t.txt2 }} />
                  <Text style={{ position: 'absolute', top: 3, left: 5, fontSize: 9, fontWeight: '800', color: selectedVolta === 1 ? t.accent : t.txt2, lineHeight: 10 }}>1.</Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                disabled={!targetIsRealChord}
                onPress={() => {
                  if (!targetIsRealChord) return;
                  setVolta(voltaTargetCell, selectedVolta === 2 ? undefined : 2);
                }}
                style={{ height: 40, width: 40, justifyContent: 'center', alignItems: 'center' }}
              >
                <View style={{ width: 22, height: 16, justifyContent: 'flex-start', alignItems: 'flex-start' }}>
                  <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, backgroundColor: selectedVolta === 2 ? t.accent : t.txt2 }} />
                  <View style={{ position: 'absolute', top: 0, left: 0, width: 2, height: 12, backgroundColor: selectedVolta === 2 ? t.accent : t.txt2 }} />
                  <Text style={{ position: 'absolute', top: 3, left: 5, fontSize: 9, fontWeight: '800', color: selectedVolta === 2 ? t.accent : t.txt2, lineHeight: 10 }}>2.</Text>
                </View>
              </TouchableOpacity>
            </View>

            {/* Transposition */}
            <View style={{ flexDirection: 'row', alignItems: 'center', height: 40, backgroundColor: t.bg2, borderRadius: 20, borderWidth: 1, borderColor: t.border, overflow: 'hidden', opacity: isPro ? 1 : 0.5 }}>
              <TouchableOpacity onPress={() => isPro ? transposeProgression(-1) : showProAlert()} style={{ height: 40, width: 40, justifyContent: 'center', alignItems: 'center', borderRightWidth: 1, borderColor: t.border }}>
                <Text style={{ fontSize: 20, fontWeight: '800', color: t.txt2, transform: [{ translateY: -2 }] }}>♭</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => isPro ? transposeProgression(1) : showProAlert()} style={{ height: 40, width: 40, justifyContent: 'center', alignItems: 'center' }}>
                <Text style={{ fontSize: 20, fontWeight: '800', color: t.txt2, transform: [{ translateY: -2 }] }}>♯</Text>
              </TouchableOpacity>
            </View>

            {/* Change Key */}
            <TouchableOpacity
              onPress={() => isPro ? (setKeyModalQuality(detectedKey.quality), setIsKeyModalVisible(true)) : showProAlert()}
              style={{ height: 40, minWidth: 60, paddingHorizontal: 10, borderRadius: 20, justifyContent: 'center', alignItems: 'center', backgroundColor: t.bg2, borderWidth: 1, borderColor: t.border, opacity: isPro ? 1 : 0.5 }}
            >
              <Text style={{ fontSize: 8, fontWeight: '800', color: t.txt3 }}>KEY</Text>
              <Text style={{ fontSize: 11, fontWeight: '700', color: t.txt1 }}>
                {NOTE_FLAT[detectedKey.root]}{detectedKey.quality === 'minor' ? 'm' : ''}
              </Text>
            </TouchableOpacity>

            {/* Measure Management */}
            <View style={{ flexDirection: 'row', alignItems: 'center', height: 40, gap: 8 }}>
              <TouchableOpacity style={[styles.measureBtn, { borderColor: t.border, backgroundColor: t.bg2 }]} onPress={() => {
                removeMeasure(selectedCell);
                if (selectedCell !== null && selectedCell >= progression.length - 1) setSelectedCell(Math.max(0, progression.length - 2));
              }}>
                <Ionicons name="remove" size={18} color={t.accent} />
              </TouchableOpacity>
              <TouchableOpacity style={[styles.measureBtn, { borderColor: t.border, backgroundColor: t.bg2 }]} onPress={() => {
                addMeasure(selectedCell);
                if (selectedCell !== null) {
                  setSelectedCell(selectedCell + 1);
                }
              }}>
                <Ionicons name="add" size={18} color={t.accent} />
              </TouchableOpacity>
              <TouchableOpacity
                disabled={selectedCell === null || indentSpaces === 0}
                style={[styles.measureBtn, { borderColor: t.border, backgroundColor: t.bg2 }]}
                onPress={handleIndent}
              >
                <Ionicons name="return-down-forward-outline" size={18} color={t.accent} />
              </TouchableOpacity>
            </View>

            {/* Delete Chord */}
            <TouchableOpacity disabled={selectedCell === null} onPress={() => selectedCell !== null && removeProgressionChord(selectedCell)}
              style={{ height: 40, width: 44, borderRadius: 20, justifyContent: 'center', alignItems: 'center', backgroundColor: t.bg2, borderWidth: 1, borderColor: t.border }}>
              <MaterialCommunityIcons name="eraser" size={18} color={t.accent} />
            </TouchableOpacity>
          </ScrollView>
        )}
      </View>}
      <ScrollView ref={scrollRef} style={{ zIndex: 20, flex: 1, backgroundColor: t.bg2 }} contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} removeClippedSubviews={true} bounces={false} overScrollMode="never">
        <View style={[styles.card, { backgroundColor: t.bg2, paddingTop: 0 }]}>
          
          <View style={[styles.grid, { borderLeftWidth: 1, borderLeftColor: t.border }]}>
            {displayCells.map((group, gIdx) => {
              // Auto-indent padding: an inert, non-interactive blank that pushes the next section
              // letter to column 1. No chord, no touch handlers — it can never be selected/played.
              if (group.auto) {
                return <View key={`auto-${gIdx}`} style={[styles.cell, { backgroundColor: t.bg2, borderColor: t.border, borderRightWidth: 0, borderBottomWidth: 0, height: diagramCellHeight }]} />;
              }
              const getCellProps = (idx: number) => {
                const isSelected = selectedCell === idx;
                const isPlaying = playingIdx === idx;
                // Queued (tap-ahead) cell: dashed accent border, distinct from the solid
                // now-playing border. Suppressed once it becomes the playing cell.
                const isQueued = queuedIdx === idx && !isPlaying;
                let bgColor = t.bg3;
                let borderColor = t.border;
                if (isSelected) { borderColor = t.accent; bgColor = t.bg2; }
                if (isQueued) { borderColor = t.accent; }
                if (isPlaying) { bgColor = t.bg2; borderColor = t.accent; }
                return { isSelected, isPlaying, isQueued, bgColor, borderColor };
              };

              const handleCellPress = (idx: number, chord: any) => {
                // During playback a tap queues a skip-to-measure instead of previewing the chord.
                // Re-tapping the queued cell clears it (handled in queueMeasure). Spacers/empties
                // aren't valid jump targets. Long-press still opens the editor (handleCellLongPress).
                if (isPlayingSystem) {
                  if (chord && !chord.spacer) { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); queueMeasure(idx); }
                  return;
                }
                const now = Date.now();
                const isDoubleTap = lastTap.current.idx === idx && (now - lastTap.current.time < 300);
                if (isDoubleTap) {
                  lastTap.current = { idx: -1, time: 0 };
                  setSelectedCell(idx);
                  if (!isDrawerVisible) openDrawer();
                } else {
                  lastTap.current = { idx, time: now };
                  setSelectedCell(selectedCell === idx ? null : idx);
                  if (chord && !chord.spacer) {
                    setBrushRoot(chord.rootSemi); setBrushType(chord.chordType);
                    useChordStore.setState({ rootSemi: chord.rootSemi, chordType: chord.chordType });
                    playSelectedCellAudio(idx, chord);
                  }
                }
              };

              const handleCellLongPress = (idx: number, chord: any) => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                lastTap.current = { idx: -1, time: 0 };
                setSelectedCell(idx);
                if (chord && !chord.spacer) {
                  setBrushRoot(chord.rootSemi); setBrushType(chord.chordType);
                  useChordStore.setState({ rootSemi: chord.rootSemi, chordType: chord.chordType });
                  // Don't fire a preview chord while the progression is playing — it injects a
                  // competing schedule into the shared audio engine, which cuts out / glitches
                  // the running playback. Opening the editor mid-playback is still allowed.
                  if (!isPlayingSystem) playSelectedCellAudio(idx, chord);
                }
                if (!isDrawerVisible) openDrawer();
              };

              const currentEffectiveBeats = group.type === 'split' ? 4 : (group.chord?.beats || 4);
              const prevEffectiveBeats = gIdx > 0 ? (displayCells[gIdx - 1].type === 'split' ? 4 : (displayCells[gIdx - 1].chord?.beats || 4)) : null;
              const showTimeSig = gIdx === 0 || currentEffectiveBeats !== prevEffectiveBeats;

              const renderContent = (chord: any, idx: number, isPlaying: boolean, isRightHalf: boolean = false, isSplit: boolean = false) => {
                  const isSelected = selectedCell === idx;
                  const txtColor1 = (isPlaying || isSelected) ? t.accent : t.txt1;
                  const txtColor2 = (isPlaying || isSelected) ? t.accent : t.txt2;
                  const rootText = chord ? (chord.namingMode === 'flat' ? NOTE_FLAT : NOTE_SHARP)[chord.rootSemi % 12] : '-';
                  const typeText = chord ? CH[chord.chordType]?.s : '';

                  const topNum = isSplit ? '4' : chord?.beats === 3 ? '3' : chord?.beats === 2 ? '2' : '4';
                  
                  return (
                    <View style={{ flex: 1, width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>

                      {/* Section (rehearsal) letterbox — top-left corner, aligned with volta bracket */}
                      {!isRightHalf && !!sectionLetters[gIdx] && (
                        <View style={{ position: 'absolute', top: 4, left: 4, width: 14, height: 14, borderWidth: 1.5, borderColor: t.accent, alignItems: 'center', justifyContent: 'center', zIndex: 12 }} pointerEvents="none">
                          <Text style={{ fontFamily: Platform.OS === 'ios' ? 'Times New Roman' : 'serif', fontSize: 9, fontWeight: 'bold', color: t.accent, lineHeight: 11 }}>{sectionLetters[gIdx]}</Text>
                        </View>
                      )}

                      {/* Volta Bracket — shifts right of the section box when one is present */}
                      {!!chord?.volta && (
                        <View style={{ position: 'absolute', top: 4, left: (!isRightHalf && sectionLetters[gIdx]) ? 22 : 4, right: 4, height: 14, zIndex: 11 }} pointerEvents="none">
                          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, backgroundColor: t.accent }} />
                          <View style={{ position: 'absolute', top: 0, left: 0, width: 2, height: 14, backgroundColor: t.accent }} />
                          <Text style={{ position: 'absolute', top: 3, left: 5, fontSize: 8, fontWeight: '800', color: t.accent, lineHeight: 10 }}>{chord.volta}.</Text>
                        </View>
                      )}

                      {/* Absolute Measure Number — blank cells are empty spaces, not numbered measures */}
                      {!isRightHalf && measureNumbers[gIdx] != null && (
                        <Text style={{ position: 'absolute', top: 4, right: 6, fontSize: 9, fontWeight: '700', color: isPlaying ? t.accent : t.txt3, opacity: 0.6, zIndex: 10 }}>{measureNumbers[gIdx]}</Text>
                      )}
                      
                      {/* Left Zone: Time Sig, Start Repeat */}
                      <View style={viewMode === 'diagram' ? { position: 'absolute', left: 4, bottom: 4, zIndex: 2 } : { alignItems: 'flex-start', justifyContent: 'flex-end', paddingBottom: 2, paddingLeft: 4, height: '100%', zIndex: 2 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          {!isRightHalf && showTimeSig && (
                            <View style={{ alignItems: 'center', marginRight: 4 }}>
                              <Text style={{ fontFamily: Platform.OS === 'ios' ? 'Times New Roman' : 'serif', fontSize: 10, fontWeight: 'bold', color: t.accent, lineHeight: 11 }}>{topNum}</Text>
                              <Text style={{ fontFamily: Platform.OS === 'ios' ? 'Times New Roman' : 'serif', fontSize: 10, fontWeight: 'bold', color: t.accent, lineHeight: 11 }}>4</Text>
                            </View>
                          )}
                          {!!chord?.repeatStart && ( <Text style={{ fontSize: 20, color: t.accent, fontWeight: '800', includeFontPadding: false, transform: [{ translateY: 2 }] }}>𝄆</Text> )}
                        </View>
                      </View>

                      {/* Center Zone: The Chord Component */}
                      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                        {viewMode === 'text' ? (
                          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center' }}>
                            <Text style={[styles.cellRoot, { color: txtColor1, fontSize: 20 }]}>{rootText}</Text>
                            <Text style={[styles.cellType, { color: txtColor2, fontSize: 10, marginTop: 1 }]} numberOfLines={1}>{typeText}</Text>
                          </View>
                        ) : (
                          <View style={{ alignItems: 'center' }}>
                            <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginTop: 0 }}>
                              <Text style={{ fontSize: 13, fontWeight: '800', color: txtColor1 }}>{rootText}</Text>
                              <Text style={{ fontSize: 10, fontWeight: '700', color: txtColor2, marginTop: 1 }}>{typeText}</Text>
                            </View>
                            {chord && (
                              <View style={{ marginTop: 10 }}>
                                {instrument === 'piano' ? (
                                  <MiniPianoDiagram chord={chord} notes={arpView ? pianoArps[idx]?.notes : pianoVoicings[idx]?.notes} theme={t} octave={octave} />
                                ) : (
                                  <MiniChordDiagram voicing={diagramVoicings[idx]} arpShape={arpView ? diagramArps[idx] : undefined} theme={t} />
                                )}
                              </View>
                            )}
                          </View>
                        )}
                      </View>

                      {/* Right Zone: End Repeat */}
                      <View style={viewMode === 'diagram' ? { position: 'absolute', right: 4, bottom: 4, zIndex: 2 } : { alignItems: 'flex-end', justifyContent: 'flex-end', paddingBottom: 2, paddingRight: 4, height: '100%', zIndex: 2 }}>
                        {!!chord?.repeatEnd && ( <Text style={{ fontSize: 20, color: t.accent, fontWeight: '800', includeFontPadding: false, transform: [{ translateY: 2 }] }}>𝄇</Text> )}
                      </View>

                    </View>
                  );
              };

              const cellHeight = diagramCellHeight;

              if (group.type === 'single') {
                const { idx, chord } = group;
                const { isSelected, isPlaying, isQueued, bgColor, borderColor } = getCellProps(idx);
                // A spacer (indent padding) reads as open background — no divider lines,
                // no content — so it looks like nothing is there. A `null` cell is still a
                // real, empty measure: it renders normally (dash + number), as before.
                const isSpacerCell = !!chord?.spacer;
                const showEmpty = isSpacerCell && !isSelected && !isPlaying;
                return (
                  <TouchableOpacity key={`cell-${idx}`} activeOpacity={1}
                    style={[
                      styles.cell,
                      { backgroundColor: showEmpty ? t.bg2 : bgColor, borderColor: borderColor, zIndex: isPlaying ? 10 : isSelected ? 10 : 1, height: cellHeight },
                      showEmpty && { borderRightWidth: 0, borderBottomWidth: 0 },
                      (isSelected || isPlaying) && { borderWidth: 2, borderRightWidth: 2, borderBottomWidth: 2 },
                      isQueued && { borderWidth: 2, borderRightWidth: 2, borderBottomWidth: 2, borderStyle: 'dashed' }
                    ]}
                    onPress={() => handleCellPress(idx, chord)} onLongPress={() => handleCellLongPress(idx, chord)} delayLongPress={300}>
                    {!isSpacerCell && renderContent(chord, idx, isPlaying, false, false)}
                  </TouchableOpacity>
                );
              } else {
                const { left, right, leftIdx, rightIdx } = group;
                const pLeft = getCellProps(leftIdx);
                const pRight = getCellProps(rightIdx);
                const isPlaying = pLeft.isPlaying || pRight.isPlaying;
                const isSelected = pLeft.isSelected || pRight.isSelected;
                const isQueued = (pLeft.isQueued || pRight.isQueued) && !isPlaying;
                let bgColor = t.bg3;
                let borderColor = t.border;
                if (isSelected) { borderColor = t.accent; bgColor = t.bg2; }
                if (isQueued) { borderColor = t.accent; }
                if (isPlaying) { bgColor = t.bg2; borderColor = t.accent; }

                const renderSplitText = (chord: any, isPlayingChord: boolean, isSelectedChord: boolean) => {
                   const rootText = chord ? (chord.namingMode === 'flat' ? NOTE_FLAT : NOTE_SHARP)[chord.rootSemi % 12] : '-';
                   const typeText = chord ? CH[chord.chordType]?.s : '';
                   const isActiveMeasure = isPlaying || isSelected;
                   const isActiveChord = isPlayingChord || isSelectedChord;
                   
                   const txtColor1 = isActiveMeasure ? (isActiveChord ? t.accent : t.txt1) : t.txt1;
                   const txtColor2 = isActiveMeasure ? (isActiveChord ? t.accent : t.txt2) : t.txt2;

                   if (viewMode === 'text') {
                     return (
                        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center' }}>
                          <Text style={[styles.cellRoot, { color: txtColor1, fontSize: 15 }]}>{rootText}</Text>
                          <Text style={[styles.cellType, { color: txtColor2, fontSize: 9, marginTop: 1 }]} numberOfLines={1}>{typeText}</Text>
                        </View>
                     );
                   } else {
                     return (
                        <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                          <Text style={{ fontSize: 11, fontWeight: '800', color: txtColor1 }}>{rootText}</Text>
                          <Text style={{ fontSize: 9, fontWeight: '700', color: txtColor2, marginTop: 1 }}>{typeText}</Text>
                        </View>
                     );
                   }
                };

                return (
                  <View key={`split-${leftIdx}`} style={[
                    styles.cell, 
                    { backgroundColor: bgColor, borderColor: borderColor, zIndex: isPlaying ? 10 : isSelected ? 10 : 1, height: cellHeight, padding: 2, flexDirection: 'row' },
                    (isSelected || isPlaying) && { borderWidth: 2, borderRightWidth: 2, borderBottomWidth: 2 },
                    isQueued && { borderWidth: 2, borderRightWidth: 2, borderBottomWidth: 2, borderStyle: 'dashed' }
                  ]}>
                     
                     {/* Absolute Measure Number */}
                     <Text style={{ position: 'absolute', top: 4, right: 6, fontSize: 9, fontWeight: '700', color: isPlaying ? t.accent : t.txt3, opacity: 0.6, zIndex: 10 }}>{measureNumbers[gIdx]}</Text>

                     {/* Left Zone */}
                     <View style={viewMode === 'diagram' ? { position: 'absolute', left: 4, bottom: 4, zIndex: 2 } : { alignItems: 'flex-start', justifyContent: 'flex-end', paddingBottom: 4, paddingLeft: 4, height: '100%', zIndex: 2 }} pointerEvents="none">
                       <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                         {showTimeSig && (
                           <View style={{ alignItems: 'center', marginRight: 4 }}>
                             <Text style={{ fontFamily: Platform.OS === 'ios' ? 'Times New Roman' : 'serif', fontSize: 10, fontWeight: 'bold', color: t.accent, lineHeight: 11 }}>4</Text>
                             <Text style={{ fontFamily: Platform.OS === 'ios' ? 'Times New Roman' : 'serif', fontSize: 10, fontWeight: 'bold', color: t.accent, lineHeight: 11 }}>4</Text>
                           </View>
                         )}
                         {!!left?.repeatStart && ( <Text style={{ fontSize: 20, color: t.accent, fontWeight: '800', includeFontPadding: false, transform: [{ translateY: 2 }] }}>𝄆</Text> )}
                       </View>
                     </View>

                     {/* Center Zone */}
                     <View style={{ flex: 1, alignItems: 'center', justifyContent: 'space-evenly', paddingVertical: 0 }} pointerEvents="none">
                        {viewMode === 'text' ? (
                           <View style={{ flexDirection: 'row', width: '100%', justifyContent: 'center', gap: 8 }}>
                              {renderSplitText(left, pLeft.isPlaying, pLeft.isSelected)}
                              {renderSplitText(right, pRight.isPlaying, pRight.isSelected)}
                           </View>
                        ) : (
                           <>
                              <View style={{ alignItems: 'center', justifyContent: 'center' }}>
                                 {renderSplitText(left, pLeft.isPlaying, pLeft.isSelected)}
                                 <View style={{ transform: [{ scale: instrument === 'piano' ? 0.75 : 0.75 }], marginTop: 0, marginBottom: -6 }}>
                                   {instrument === 'piano' ? (
                                     <MiniPianoDiagram chord={left} notes={arpView ? pianoArps[leftIdx]?.notes : pianoVoicings[leftIdx]?.notes} theme={t} octave={octave} />
                                   ) : (
                                     <MiniChordDiagram voicing={diagramVoicings[leftIdx]} arpShape={arpView ? diagramArps[leftIdx] : undefined} theme={t} />
                                   )}
                                 </View>
                              </View>
                              <View style={{ alignItems: 'center', justifyContent: 'center' }}>
                                 {renderSplitText(right, pRight.isPlaying, pRight.isSelected)}
                                 <View style={{ transform: [{ scale: instrument === 'piano' ? 0.75 : 0.75 }], marginTop: 0, marginBottom: -6 }}>
                                   {instrument === 'piano' ? (
                                     <MiniPianoDiagram chord={right} notes={arpView ? pianoArps[rightIdx]?.notes : pianoVoicings[rightIdx]?.notes} theme={t} octave={octave} />
                                   ) : (
                                     <MiniChordDiagram voicing={diagramVoicings[rightIdx]} arpShape={arpView ? diagramArps[rightIdx] : undefined} theme={t} />
                                   )}
                                 </View>
                              </View>
                           </>
                        )}
                     </View>

                     {/* Right Zone */}
                     <View style={viewMode === 'diagram' ? { position: 'absolute', right: 4, bottom: 4, zIndex: 2 } : { alignItems: 'flex-end', justifyContent: 'flex-end', paddingBottom: 4, paddingRight: 4, height: '100%', zIndex: 2 }} pointerEvents="none">
                        {!!right?.repeatEnd && ( <Text style={{ fontSize: 20, color: t.accent, fontWeight: '800', includeFontPadding: false, transform: [{ translateY: 2 }] }}>𝄇</Text> )}
                     </View>

                     {/* Section (rehearsal) letterbox — top-left corner, aligned with volta bracket */}
                     {!!sectionLetters[gIdx] && (
                       <View style={{ position: 'absolute', top: 4, left: 4, width: 14, height: 14, borderWidth: 1.5, borderColor: t.accent, alignItems: 'center', justifyContent: 'center', zIndex: 12 }} pointerEvents="none">
                         <Text style={{ fontFamily: Platform.OS === 'ios' ? 'Times New Roman' : 'serif', fontSize: 9, fontWeight: 'bold', color: t.accent, lineHeight: 11 }}>{sectionLetters[gIdx]}</Text>
                       </View>
                     )}

                     {/* Volta bracket spans the full cell — volta marks the whole measure.
                         Read from the left chord only; right.volta is a legacy fallback.
                         Shifts right of the section box when one is present. */}
                     {!!(left?.volta ?? right?.volta) && (
                       <View style={{ position: 'absolute', top: 4, left: sectionLetters[gIdx] ? 22 : 4, right: 4, height: 14, zIndex: 11 }} pointerEvents="none">
                         <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, backgroundColor: t.accent }} />
                         <View style={{ position: 'absolute', top: 0, left: 0, width: 2, height: 14, backgroundColor: t.accent }} />
                         <Text style={{ position: 'absolute', top: 3, left: 5, fontSize: 8, fontWeight: '800', color: t.accent, lineHeight: 10 }}>{(left?.volta ?? right?.volta)}.</Text>
                       </View>
                     )}

                     {/* NOTE: Tappable layer adapts to view mode. Column for diagrams, Row for text. */}
                     <View style={[StyleSheet.absoluteFill, { flexDirection: viewMode === 'text' ? 'row' : 'column', zIndex: 5 }]}>
                       <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => handleCellPress(leftIdx, left)} onLongPress={() => handleCellLongPress(leftIdx, left)} delayLongPress={300} />
                       <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => handleCellPress(rightIdx, right)} onLongPress={() => handleCellLongPress(rightIdx, right)} delayLongPress={300} />
                     </View>
                  </View>
                );
              }
            })}
          </View>
          
        </View>

      </ScrollView>

      <ProgressionPlayerDock
        playingIdx={playingIdx} isPlayingSystem={isPlayingSystem} isLooping={isLooping} toggleLooping={toggleLooping}
        handlePlayProgression={() => { setSelectedCell(null); handlePlayProgression(); }} stopPlayback={() => stopPlayback()}
        onOpenSave={() => setIsSaveModalVisible(true)} onOpenLib={() => setIsLibModalVisible(true)}
        onClear={() => { stopPlayback(); clearProgression(); setSelectedCell(0); }}
      />

      {(drawerModalVisible || isDrawerVisible) && (
        <View style={[StyleSheet.absoluteFill, { zIndex: 1000 }]}>
          <TouchableWithoutFeedback onPress={closeDrawer}>
            <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.5)', opacity: drawerBackdropAnim }]} />
          </TouchableWithoutFeedback>

          <Animated.View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: sheetPixelHeight, backgroundColor: t.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20, transform: [{ translateY: drawerSlideAnim }], overflow: 'visible' }}>
            <View style={{ position: 'absolute', top: '100%', left: 0, right: 0, height: 200, backgroundColor: t.bg }} />

            <View {...drawerPanResponder.panHandlers} style={{ height: 64, borderBottomWidth: 1, borderColor: t.border, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 12, backgroundColor: t.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20 }}>
              <View style={{ position: 'absolute', top: 8, left: 0, right: 0, alignItems: 'center' }}>
                <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: t.border }} />
              </View>

              <View style={{ flex: 1, alignItems: 'flex-start' }}>
                <TouchableOpacity onPress={() => {
                  if (selectedCell === null || !progression[selectedCell]) return;
                  const chord = progression[selectedCell];
                  if (chord?.beats === 2) {
                     useProgressionStore.setState((s: any) => {
                        const newProg = [...s.progression];
                        newProg[selectedCell] = { ...chord, beats: 4 };
                        if (selectedCell + 1 < newProg.length && newProg[selectedCell + 1]?.beats === 2) newProg.splice(selectedCell + 1, 1);
                        return { progression: newProg };
                     });
                  } else {
                     useProgressionStore.setState((s: any) => {
                        const newProg = [...s.progression];
                        newProg[selectedCell] = { ...chord, beats: 2 };
                        newProg.splice(selectedCell + 1, 0, { ...chord, beats: 2 });
                        return { progression: newProg };
                     });
                  }
                }}
                  style={{ height: 36, paddingHorizontal: 12, borderRadius: 18, backgroundColor: t.bg3, borderWidth: 1, borderColor: t.border, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 10, fontWeight: '800', color: t.txt2 }}>{selectedCell !== null && progression[selectedCell]?.beats === 2 ? 'MERGE' : 'SPLIT'}</Text>
                </TouchableOpacity>
              </View>

              <View style={{ flex: 3, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
                <TouchableOpacity onPress={handlePrevCell} disabled={selectedCell === null} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: t.bg3, opacity: selectedCell === null ? 0.3 : 1, borderWidth: 1, borderColor: t.border, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="chevron-back" size={18} color={t.txt2} />
                </TouchableOpacity>
                <Text style={{ color: t.accent, fontSize: 14, fontWeight: '800', letterSpacing: 1, textAlign: 'center', minWidth: 100 }}>
                  CHORD {(selectedCell !== null ? selectedCell : 0) + 1} / {progression.length}
                </Text>
                <TouchableOpacity onPress={handleNextCell} disabled={selectedCell === null} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: t.bg3, opacity: selectedCell === null ? 0.3 : 1, borderWidth: 1, borderColor: t.border, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="chevron-forward" size={18} color={t.txt2} />
                </TouchableOpacity>
              </View>

              <View style={{ flex: 1, alignItems: 'flex-end' }}>
                <TouchableOpacity onPress={closeDrawer} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: t.bg3, borderWidth: 1, borderColor: t.border, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="close" size={18} color={t.txt2} />
                </TouchableOpacity>
              </View>
            </View>
              
            <View style={{ flexDirection: 'row', flex: 1 }}>
              <View style={{ width: 75, backgroundColor: t.bg3, borderRightWidth: 1, borderColor: t.border, paddingTop: 16 }}>
                <Text style={{ color: t.accent, fontSize: 10, fontWeight: '800', textAlign: 'center', marginBottom: 16, letterSpacing: 1 }}>ROOT</Text>
                <View style={{ flex: 1, position: 'relative' }}>
                  {rootScrolled && <LinearGradient colors={[t.bg3, 'transparent']} style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 16, zIndex: 10 }} pointerEvents="none" />}
                  <ScrollView ref={drawerRootScrollRef} onLayout={(e) => setDrawerRootHeight(e.nativeEvent.layout.height)} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40, alignItems: 'center', gap: 12 }} onScroll={(e: any) => setRootScrolled(e.nativeEvent.contentOffset.y > 5)} scrollEventThrottle={16} nestedScrollEnabled>
                    {ROOTS.map(r => {
                      const isActive = brushRoot === r;
                      return (
                        <TouchableOpacity key={r} activeOpacity={0.7} style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: isActive ? t.accent : 'transparent' }} onPress={() => handleRootPick(r)}>
                          <Text style={{ fontWeight: isActive ? '800' : '600', fontSize: 16, color: isActive ? '#fff' : t.txt2 }}>{notes[r]}</Text>
                        </TouchableOpacity>
                      )
                    })}
                  </ScrollView>
                  <LinearGradient colors={['transparent', t.bg3]} style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 40, zIndex: 10 }} pointerEvents="none" />
                </View>
              </View>

              <View style={{ flex: 1, paddingTop: 16, paddingHorizontal: 16 }}>
                <Text style={{ color: t.accent, fontSize: 10, fontWeight: '800', marginBottom: 16, letterSpacing: 1 }}>QUALITY</Text>
                <View style={{ flex: 1, position: 'relative' }}>
                  {qualityScrolled && <LinearGradient colors={[t.bg, 'transparent']} style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 16, zIndex: 10 }} pointerEvents="none" />}
                  <ScrollView ref={drawerQualScrollRef} onLayout={(e) => setDrawerQualHeight(e.nativeEvent.layout.height)} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 60 }} onScroll={(e: any) => setQualityScrolled(e.nativeEvent.contentOffset.y > 5)} scrollEventThrottle={16} nestedScrollEnabled>
                    {CHORD_CATEGORIES.map((cat, catIdx) => (
                      <View key={cat.label} style={{ marginBottom: 20 }} onLayout={(e) => drawerQualCatY.current[cat.label] = e.nativeEvent.layout.y}>
                        <Text style={{ fontSize: 14, fontWeight: '800', color: t.txt1, marginBottom: 12 }}>{cat.label}</Text>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }} onLayout={(e) => drawerQualRowY.current[cat.label] = e.nativeEvent.layout.y}>
                          {cat.keys.map(key => {
                            if (!CH[key]) return null;
                            const isActive = brushType === key;
                            return (
                              <TouchableOpacity key={key} activeOpacity={0.7} onLayout={(e) => drawerQualItemY.current[key] = e.nativeEvent.layout.y} style={{ paddingHorizontal: 16, paddingVertical: 10, borderRadius: 24, backgroundColor: isActive ? t.accent : t.bg3 }} onPress={() => handleTypePick(key)}>
                                <Text style={{ fontWeight: '700', fontSize: 14, color: isActive ? '#fff' : t.txt2 }}>{CH[key].l.toLowerCase() === CH[key].s.toLowerCase() ? CH[key].l : `${CH[key].l} (${CH[key].s})`}</Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                        {catIdx < CHORD_CATEGORIES.length - 1 && <View style={{ height: 1, backgroundColor: t.border, marginTop: 24, marginBottom: -4 }} />}
                      </View>
                    ))}
                  </ScrollView>
                  <LinearGradient colors={['transparent', t.bg]} style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 40, zIndex: 10 }} pointerEvents="none" />
                </View>
              </View>
            </View>
          </Animated.View>
        </View>
      )}

      <PopUpModal visible={isSaveModalVisible} onClose={() => setIsSaveModalVisible(false)}>
        <View style={[styles.modalBox, { backgroundColor: t.bg2, borderColor: t.border }]}>
          <Text style={[styles.modalTitle, { color: t.txt1 }]}>Save Progression</Text>
          <TextInput style={[styles.textInput, { backgroundColor: t.bg, color: t.txt1, borderColor: t.border, fontFamily: familyForWeight(fontFamily, 400) }]} placeholder="e.g. Autumn Leaves" placeholderTextColor={t.txt3} value={songName} onChangeText={setSongName} autoFocus />
          <View style={styles.modalBtnRow}>
            <TouchableOpacity style={styles.modalBtn} onPress={() => setIsSaveModalVisible(false)}><Text style={{ color: t.txt3, fontSize: 16, fontWeight: '600' }}>Cancel</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.modalBtn, { backgroundColor: t.accent }]} onPress={() => { if (songName.trim()) { saveSong(songName.trim(), bpm); setSongName(''); setIsSaveModalVisible(false); } }}><Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>Save</Text></TouchableOpacity>
          </View>
        </View>
      </PopUpModal>

      <SlideUpModal visible={isLibModalVisible} onClose={() => setIsLibModalVisible(false)}>
        <View style={[{ flex: 1, backgroundColor: t.bg }]}>
          <View style={[styles.modalHeader, { paddingTop: 10, paddingBottom: 0 }]}>
            <Text style={[styles.modalTitle, { color: t.txt1 }]}>Library</Text>
            <TouchableOpacity onPress={() => setIsLibModalVisible(false)} style={{ padding: 4 }}><Ionicons name="close" size={28} color={t.txt1} /></TouchableOpacity>
          </View>
          {/* Category selector: Exercises / Standards / custom… + add a category */}
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4, gap: 8 }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={{ gap: 8, alignItems: 'center', paddingRight: 8 }}>
              {categories.map((cat: string) => {
                const active = selectedLibCategory === cat;
                return (
                  <TouchableOpacity key={cat} onPress={() => setSelectedLibCategory(cat)} activeOpacity={0.7}
                    style={{ paddingHorizontal: 16, height: 36, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: active ? t.accent : t.bg2, borderColor: active ? t.accent : t.border }}>
                    <Text style={{ color: active ? '#fff' : t.txt2, fontWeight: '700', fontSize: 13 }}>{cat}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <TouchableOpacity onPress={() => { setNewCatName(''); setIsCatModalVisible(true); }} activeOpacity={0.7}
              style={{ width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: t.bg2, borderColor: t.border }}>
              <Ionicons name="add" size={20} color={t.accent} />
            </TouchableOpacity>
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
            {(() => {
              // Filter to the selected category, then auto-arrange alphabetically by name
              // (case-insensitive). .filter() returns a fresh array, so the sort doesn't mutate
              // the store's saved order.
              const visibleSongs = savedSongs
                .filter((s: any) => (s.category || 'Standards') === selectedLibCategory)
                .sort((a: any, b: any) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }));
              if (visibleSongs.length === 0) {
                return (
                  <View style={styles.emptyState}>
                    <View style={{ marginBottom: 12, opacity: 0.5 }}><Ionicons name="musical-notes-outline" size={48} color={t.txt3} /></View>
                    <Text style={[styles.emptyStateTitle, { color: t.txt1 }]}>Nothing in {selectedLibCategory}</Text>
                    <Text style={[styles.emptyStateSub, { color: t.txt3 }]}>Long-press a song (or tap its folder icon) to move it here.</Text>
                  </View>
                );
              }
              return visibleSongs.map((song: any) => {
                const isActive = song.id === activeSongId;
                return (
                <TouchableOpacity key={song.id} style={[styles.songCard, { backgroundColor: isActive ? t.bg3 : t.bg2, borderColor: isActive ? t.accent : t.border, borderWidth: isActive ? 2 : 1 }]} onPress={() => { stopPlayback(); loadSong(song.id); setIsLibModalVisible(false); setSelectedCell(0); }} onLongPress={() => setMoveSongId(song.id)} delayLongPress={300} activeOpacity={0.7}>
                  <View style={[styles.songCardIcon, { backgroundColor: isActive ? t.accent : t.bg3, borderColor: t.border }]}><Ionicons name="play" size={20} color={isActive ? '#fff' : t.accent} /></View>
                  <View style={{ flex: 1, paddingHorizontal: 12 }}>
                    <Text style={{ color: t.txt1, fontSize: 16, fontWeight: '700', marginBottom: 4 }}>{song.name}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><Ionicons name="timer-outline" size={12} color={t.txt3} /><Text style={{ color: t.txt3, fontSize: 12, fontWeight: '600' }}>{song.bpm} BPM</Text></View>
                  </View>
                  <TouchableOpacity onPress={() => setMoveSongId(song.id)} style={styles.deleteBtn}><Ionicons name="folder-outline" size={18} color={t.txt3} /></TouchableOpacity>
                  <TouchableOpacity onPress={() => deleteSong(song.id)} style={styles.deleteBtn}><Ionicons name="trash-outline" size={20} color={t.accent} /></TouchableOpacity>
                </TouchableOpacity>
                );
              });
            })()}
          </ScrollView>
        </View>
      </SlideUpModal>

      {/* New category */}
      <PopUpModal visible={isCatModalVisible} onClose={() => setIsCatModalVisible(false)}>
        <View style={[styles.modalBox, { backgroundColor: t.bg2, borderColor: t.border }]}>
          <Text style={[styles.modalTitle, { color: t.txt1 }]}>New Category</Text>
          <TextInput style={[styles.textInput, { backgroundColor: t.bg, color: t.txt1, borderColor: t.border, fontFamily: familyForWeight(fontFamily, 400) }]} placeholder="e.g. Ballads" placeholderTextColor={t.txt3} value={newCatName} onChangeText={setNewCatName} autoFocus />
          <View style={styles.modalBtnRow}>
            <TouchableOpacity style={styles.modalBtn} onPress={() => setIsCatModalVisible(false)}><Text style={{ color: t.txt3, fontSize: 16, fontWeight: '600' }}>Cancel</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.modalBtn, { backgroundColor: t.accent }]} onPress={() => { const n = newCatName.trim(); if (n) { addCategory(n); setSelectedLibCategory(n); setNewCatName(''); setIsCatModalVisible(false); } }}><Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>Add</Text></TouchableOpacity>
          </View>
        </View>
      </PopUpModal>

      {/* Move song to a category */}
      <PopUpModal visible={moveSongId !== null} onClose={() => setMoveSongId(null)}>
        <View style={[styles.modalBox, { backgroundColor: t.bg2, borderColor: t.border }]}>
          <Text style={[styles.modalTitle, { color: t.txt1 }]}>Move to…</Text>
          <View style={{ gap: 8, marginTop: 16 }}>
            {categories.map((cat: string) => (
              <TouchableOpacity key={cat} activeOpacity={0.7} onPress={() => { if (moveSongId) setSongCategory(moveSongId, cat); setMoveSongId(null); }}
                style={{ paddingVertical: 14, paddingHorizontal: 16, borderRadius: 10, borderWidth: 1, borderColor: t.border, backgroundColor: t.bg }}>
                <Text style={{ color: t.txt1, fontSize: 15, fontWeight: '700' }}>{cat}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.modalBtnRow}>
            <TouchableOpacity style={styles.modalBtn} onPress={() => setMoveSongId(null)}><Text style={{ color: t.txt3, fontSize: 16, fontWeight: '600' }}>Cancel</Text></TouchableOpacity>
          </View>
        </View>
      </PopUpModal>

      <BpmModal visible={isBpmModalVisible} onClose={() => setIsBpmModalVisible(false)} />

      {/* Key Selection Modal */}
      <SlideUpModal visible={isKeyModalVisible} onClose={() => setIsKeyModalVisible(false)}>
        <View style={[{ flex: 1, backgroundColor: t.bg }]}>
          <View style={[styles.modalHeader, { paddingTop: 10, paddingBottom: 8 }]}>
            <Text style={[styles.modalTitle, { color: t.txt1 }]}>Change Key</Text>
            <TouchableOpacity onPress={() => setIsKeyModalVisible(false)} style={{ padding: 4 }}><Ionicons name="close" size={28} color={t.txt1} /></TouchableOpacity>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 20, paddingBottom: 12 }}>
            {(['major', 'minor'] as const).map(q => (
              <TouchableOpacity key={q} onPress={() => setKeyModalQuality(q)}
                style={{ flex: 1, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: keyModalQuality === q ? t.accent : t.bg2, borderWidth: 1, borderColor: keyModalQuality === q ? t.accent : t.border }}>
                <Text style={{ fontWeight: '700', fontSize: 14, color: keyModalQuality === q ? '#fff' : t.txt2 }}>{q.charAt(0).toUpperCase() + q.slice(1)}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 8 }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              {[0,1,2,3,4,5,6,7,8,9,10,11].map(root => {
                const label = NOTE_FLAT[root] + (keyModalQuality === 'minor' ? 'm' : '');
                // When the quality toggle differs from the detected quality, treat the
                // relative key as "current" so Em ↔ G major costs zero semitones.
                const effectiveRoot = keyModalQuality === detectedKey.quality
                  ? detectedKey.root
                  : keyModalQuality === 'major'
                    ? (detectedKey.root + 3) % 12   // relative major of detected minor
                    : (detectedKey.root + 9) % 12;  // relative minor of detected major
                const isCurrent = effectiveRoot === root;
                return (
                  <TouchableOpacity key={root}
                    onPress={() => {
                      const semitones = ((root - effectiveRoot) + 12) % 12;
                      const shift = semitones > 6 ? semitones - 12 : semitones;
                      if (shift !== 0) transposeProgression(shift);
                      setIsKeyModalVisible(false);
                    }}
                    style={{ width: '30%', height: 52, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: isCurrent ? t.accent : t.bg2, borderWidth: 1, borderColor: isCurrent ? t.accent : t.border }}>
                    <Text style={{ fontSize: 18, fontWeight: '800', color: isCurrent ? '#fff' : t.txt1 }}>{label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>
        </View>
      </SlideUpModal>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { paddingBottom: 0 },
  card: { paddingTop: 16, paddingBottom: 0 },
  sectionLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 1.5, marginBottom: 14, paddingHorizontal: 16 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 0 },
  cell: { width: '25%', height: 60, borderRightWidth: 1, borderBottomWidth: 1, alignItems: 'center', justifyContent: 'center', padding: 4, position: 'relative', overflow: 'hidden' },
  measureNum: { position: 'absolute', top: 4, left: 6, fontSize: 9, fontWeight: '700' },
  repeatSign: { position: 'absolute', bottom: 2, fontSize: 18, fontWeight: '900', lineHeight: 20 },
  cellRoot: { fontSize: 22, fontWeight: '800', lineHeight: 26 },
  cellType: { fontSize: 11, fontWeight: '700' },
  beatsBadge: { position: 'absolute', top: 2, right: 3, borderRadius: 6, paddingHorizontal: 3, height: 12, alignItems: 'center', justifyContent: 'center' },
  measureHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, marginBottom: 14 },
  measureBtn: { height: 40, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center', minWidth: 40 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalBox: { width: '100%', padding: 20, borderRadius: 16, borderWidth: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 10 },
  fullModal: { flex: 1, paddingTop: Platform.OS === 'ios' ? 40 : 0 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 16, paddingTop: 16 },
  modalTitle: { fontSize: 24, fontWeight: '800', letterSpacing: 0.5 },
  textInput: { height: 50, borderRadius: 8, borderWidth: 1, paddingHorizontal: 16, fontSize: 16, marginTop: 16, marginBottom: 24 },
  modalBtnRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12 },
  modalBtn: { paddingVertical: 12, paddingHorizontal: 20, borderRadius: 8 },
  emptyState: { alignItems: 'center', justifyContent: 'center', marginTop: 80 },
  emptyStateTitle: { fontSize: 18, fontWeight: '700', marginBottom: 4 },
  emptyStateSub: { fontSize: 14 },
  songCard: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 16, borderWidth: 1, marginBottom: 12 },
  songCardIcon: { width: 48, height: 48, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  deleteBtn: { padding: 12 },
});